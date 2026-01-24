// src/app/core/GameEngine.js
import * as THREE from 'three';
import { SimulationContext } from './SimulationContext.js';
import { applyIBLIntensity, applyIBLToScene, loadIBLTexture } from '../../graphics/lighting/IBL.js';
import { getResolvedLightingSettings } from '../../graphics/lighting/LightingSettings.js';
import { getResolvedBloomSettings, sanitizeBloomSettings } from '../../graphics/visuals/postprocessing/BloomSettings.js';
import { BloomPipeline } from '../../graphics/visuals/postprocessing/BloomPipeline.js';
import { getResolvedColorGradingSettings, sanitizeColorGradingSettings } from '../../graphics/visuals/postprocessing/ColorGradingSettings.js';
import { getColorGradingPresetById } from '../../graphics/visuals/postprocessing/ColorGradingPresets.js';
import { is3dLutSupported, loadCubeLut3DTexture } from '../../graphics/visuals/postprocessing/ColorGradingCubeLutLoader.js';

export class GameEngine {
    constructor({
        canvas,
        autoResize = true,
        deterministic = false,
        pixelRatio = null,
        size = null,
        rendererOptions = null
    }) {
        this.canvas = canvas;
        this._autoResize = !!autoResize;
        this._deterministic = !!deterministic;

        // Helps in modern Three versions
        if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            ...(rendererOptions ?? {})
        });

        this._pixelRatioOverride = Number.isFinite(pixelRatio) ? Math.max(0.1, pixelRatio) : null;
        const resolvedPixelRatio = this._pixelRatioOverride ?? Math.min(devicePixelRatio, 2);
        this.renderer.setPixelRatio(resolvedPixelRatio);

        // ✅ CRITICAL: correct output color space (otherwise things look dark/flat)
        if ('outputColorSpace' in this.renderer) {
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        } else {
            // older three.js fallback
            this.renderer.outputEncoding = THREE.sRGBEncoding;
        }

        // ✅ CRITICAL (newer three): keep old light intensity behavior
        // If this is false, your intensity values need to be ~10x-100x higher.
        if ('useLegacyLights' in this.renderer) {
            this.renderer.useLegacyLights = true;
        }

        // ✅ Shadows
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // ✅ Tone mapping
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this._lighting = getResolvedLightingSettings();
        this.renderer.toneMappingExposure = this._lighting.exposure;

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
        this.camera.position.set(0, 4, 14);

        this._post = {
            pipeline: null
        };

        this._bloom = {
            settings: getResolvedBloomSettings()
        };

        this._colorGrading = {
            settings: getResolvedColorGradingSettings(),
            lut: null,
            lutPresetId: null,
            lutPromise: null,
            status: 'off',
            lastError: null
        };

        this._applyBloomSettings(this._bloom.settings);
        this._applyColorGradingSettings(this._colorGrading.settings);

        this._ibl = null;
        this._iblPromise = null;
        this._iblAutoScanEnabled = !this._deterministic;
        this._initIBL();

        // ✅ SimulationContext owns EventBus, VehicleManager, PhysicsController
        this.simulation = new SimulationContext();

        // ✅ Backward-compatible context proxy
        // Existing code using engine.context.selectedBus will still work
        this._contextProxy = {
            get selectedBusId() { return this._sim.selectedBusId; },
            set selectedBusId(v) { this._sim.selectedBusId = v; },
            get selectedBus() { return this._sim.selectedBus; },
            set selectedBus(v) { this._sim.selectedBus = v; },
            _sim: this.simulation
        };

        this._stateMachine = null;
        this._running = false;
        this._lastT = 0;

        this._onResize = () => this.resize();
        if (this._autoResize) window.addEventListener('resize', this._onResize, { passive: true });
        if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
            this.setViewportSize(size.width, size.height);
        } else {
            this.resize();
        }
    }

    get lightingSettings() {
        return this._lighting;
    }

    setLightingSettings(settings) {
        const src = settings && typeof settings === 'object' ? settings : null;
        const prev = this._lighting ?? getResolvedLightingSettings({ includeUrlOverrides: false });

        const clamp = (value, min, max, fallback) => {
            const num = Number(value);
            if (!Number.isFinite(num)) return fallback;
            return Math.max(min, Math.min(max, num));
        };

        const next = {
            exposure: clamp(src?.exposure ?? prev.exposure, 0.1, 5, prev.exposure),
            hemiIntensity: clamp(src?.hemiIntensity ?? prev.hemiIntensity, 0, 5, prev.hemiIntensity),
            sunIntensity: clamp(src?.sunIntensity ?? prev.sunIntensity, 0, 10, prev.sunIntensity),
            ibl: {
                ...(prev.ibl ?? {}),
                enabled: src?.ibl?.enabled !== undefined ? !!src.ibl.enabled : !!prev.ibl?.enabled,
                envMapIntensity: clamp(src?.ibl?.envMapIntensity ?? prev.ibl?.envMapIntensity, 0, 5, prev.ibl?.envMapIntensity ?? 0.25),
                setBackground: src?.ibl?.setBackground !== undefined ? !!src.ibl.setBackground : !!prev.ibl?.setBackground
            }
        };

        this._lighting = next;
        this.renderer.toneMappingExposure = next.exposure;

        if (!this._ibl) {
            this._initIBL();
            return;
        }

        const ibl = next.ibl ?? null;
        this._ibl.config = { ...(this._ibl.config ?? {}), ...(ibl ?? {}) };

        if (!ibl?.enabled) {
            applyIBLToScene(this.scene, null, { enabled: false, setBackground: false });
            return;
        }

        if (this._ibl.envMap) {
            applyIBLToScene(this.scene, this._ibl.envMap, this._ibl.config);
            applyIBLIntensity(this.scene, this._ibl.config, { force: true });
            return;
        }

        const requestedUrl = typeof this._ibl.config?.hdrUrl === 'string' ? this._ibl.config.hdrUrl : null;
        this._iblPromise = loadIBLTexture(this.renderer, this._ibl.config).then((envMap) => {
            const currentUrl = typeof this._ibl?.config?.hdrUrl === 'string' ? this._ibl.config.hdrUrl : null;
            const stillWants = !!this._ibl?.config?.enabled && (!requestedUrl || requestedUrl === currentUrl);
            if (!stillWants) return null;
            this._ibl.envMap = envMap;
            if (envMap) {
                applyIBLToScene(this.scene, envMap, this._ibl.config);
                applyIBLIntensity(this.scene, this._ibl.config, { force: true });
            }
            return envMap;
        }).catch((err) => {
            console.warn('[IBL] Failed to load HDR environment map:', err);
            return null;
        });
    }

    get bloomSettings() {
        return this._bloom?.settings ?? null;
    }

    get isBloomEnabled() {
        return !!this._bloom?.settings?.enabled;
    }

    get isPostProcessingActive() {
        return !!this._post?.pipeline;
    }

    getBloomDebugInfo() {
        if (!this._post?.pipeline) {
            return { enabled: !!this._bloom?.settings?.enabled, ...(this._bloom?.settings ?? {}) };
        }
        return this._post.pipeline.getDebugInfo();
    }

    get colorGradingSettings() {
        return this._colorGrading?.settings ?? null;
    }

    getColorGradingDebugInfo() {
        const s = this._colorGrading?.settings ?? null;
        const status = this._colorGrading?.status ?? 'off';
        const supported = is3dLutSupported(this.renderer);
        const requestedPreset = typeof s?.preset === 'string' ? s.preset : 'off';
        const intensity = Number.isFinite(s?.intensity) ? s.intensity : 0;
        const hasLut = !!this._colorGrading?.lut;
        const active = requestedPreset !== 'off' && intensity > 0 && hasLut;
        const lastError = typeof this._colorGrading?.lastError === 'string' ? this._colorGrading.lastError : null;
        return {
            enabled: active,
            requestedPreset,
            intensity,
            supported,
            hasLut,
            status,
            lastError
        };
    }

    _syncPixelRatio() {
        if (!this.renderer) return;
        if (this._pixelRatioOverride !== null) {
            this._post?.pipeline?.setPixelRatio?.(this._pixelRatioOverride);
            return;
        }

        const next = Math.min(devicePixelRatio, 2);
        const current = this.renderer.getPixelRatio?.() ?? next;
        if (Math.abs(current - next) <= 1e-6) return;

        this.renderer.setPixelRatio(next);
        this._post?.pipeline?.setPixelRatio?.(next);
    }

    _syncPostProcessingSize() {
        if (!this._post?.pipeline || !this.renderer) return;
        const size = new THREE.Vector2();
        this.renderer.getSize(size);
        this._post.pipeline.setSize(size.x, size.y);
    }

    _applyBloomSettings(settings) {
        if (!this._bloom) return;
        const next = sanitizeBloomSettings(settings);
        this._bloom.settings = next;
        this._syncPostProcessingPipeline();
    }

    _applyColorGradingSettings(settings) {
        if (!this._colorGrading) return;
        const next = sanitizeColorGradingSettings(settings);
        this._colorGrading.settings = next;

        const preset = getColorGradingPresetById(next.preset);
        const wants = preset?.id && preset.id !== 'off' && next.intensity > 0;
        if (!wants) {
            this._colorGrading.status = 'off';
            this._colorGrading.lastError = null;
            this._colorGrading.lut = null;
            this._colorGrading.lutPresetId = null;
            this._colorGrading.lutPromise = null;
            this._syncPostProcessingPipeline();
            return;
        }

        if (!is3dLutSupported(this.renderer)) {
            this._colorGrading.status = 'unsupported';
            this._colorGrading.lastError = 'WebGL2 is required for 3D LUT color grading';
            this._colorGrading.lut = null;
            this._colorGrading.lutPresetId = null;
            this._colorGrading.lutPromise = null;
            console.warn('[ColorGrading] WebGL2 is required for LUT color grading; falling back to Off.');
            this._syncPostProcessingPipeline();
            return;
        }

        if (!preset?.cubeUrl) {
            this._colorGrading.status = 'missing_preset';
            this._colorGrading.lastError = `Missing LUT url for preset "${preset?.id ?? next.preset}"`;
            this._colorGrading.lut = null;
            this._colorGrading.lutPresetId = null;
            this._colorGrading.lutPromise = null;
            console.warn('[ColorGrading] Missing LUT url for preset:', preset?.id ?? next.preset);
            this._syncPostProcessingPipeline();
            return;
        }

        if (this._colorGrading.lut && this._colorGrading.lutPresetId === preset.id) {
            this._colorGrading.status = 'ready';
            this._colorGrading.lastError = null;
            this._syncPostProcessingPipeline();
            return;
        }

        this._colorGrading.status = 'loading';
        this._colorGrading.lastError = null;
        this._colorGrading.lut = null;
        this._colorGrading.lutPresetId = preset.id;

        const promise = loadCubeLut3DTexture(preset.cubeUrl).then((tex) => {
            const current = getColorGradingPresetById(this._colorGrading?.settings?.preset);
            const stillWants = current?.id === preset.id && this._colorGrading?.settings?.intensity > 0;
            if (!stillWants) return null;
            this._colorGrading.status = 'ready';
            this._colorGrading.lut = tex;
            this._syncPostProcessingPipeline();
            return tex;
        }).catch((err) => {
            const current = getColorGradingPresetById(this._colorGrading?.settings?.preset);
            const stillWants = current?.id === preset.id && this._colorGrading?.settings?.intensity > 0;
            if (!stillWants) return null;
            const message = err?.message ?? String(err ?? 'Failed to load LUT');
            this._colorGrading.status = 'error';
            this._colorGrading.lastError = message;
            this._colorGrading.lut = null;
            this._colorGrading.lutPresetId = preset.id;
            console.warn('[ColorGrading] Failed to load LUT:', message);
            this._syncPostProcessingPipeline();
            return null;
        });

        this._colorGrading.lutPromise = promise;
        this._syncPostProcessingPipeline();
    }

    _syncPostProcessingPipeline() {
        const bloomEnabled = !!this._bloom?.settings?.enabled;
        const preset = getColorGradingPresetById(this._colorGrading?.settings?.preset);
        const gradingRequested = preset?.id && preset.id !== 'off' && (this._colorGrading?.settings?.intensity > 0);
        const wantsPipeline = bloomEnabled || gradingRequested;

        if (!wantsPipeline) {
            if (this._post.pipeline) {
                this._post.pipeline.dispose();
                this._post.pipeline = null;
            }
            return;
        }

        if (!this._post.pipeline) {
            this._post.pipeline = new BloomPipeline({
                renderer: this.renderer,
                scene: this.scene,
                camera: this.camera,
                settings: this._bloom?.settings ?? null
            });
            this._post.pipeline.setPixelRatio(this.renderer.getPixelRatio?.() ?? 1);
            this._syncPostProcessingSize();
        }

        this._post.pipeline.setSettings(this._bloom?.settings ?? null);
        this._post.pipeline.setColorGrading({
            lutTexture: this._colorGrading?.lut ?? null,
            intensity: this._colorGrading?.settings?.intensity ?? 0
        });
    }

    _initIBL() {
        const config = this._lighting?.ibl ?? getResolvedLightingSettings().ibl;
        this._ibl = {
            config,
            envMap: null,
            lastState: null,
            scanUntilMs: 0,
            nextScanMs: 0,
            scanIntervalMs: 500,
            scanDurationMs: 2000
        };

        this._iblPromise = loadIBLTexture(this.renderer, config).then((envMap) => {
            this._ibl.envMap = envMap;
            if (envMap) {
                applyIBLToScene(this.scene, envMap, config);
                const now = performance.now();
                this._ibl.scanUntilMs = now + this._ibl.scanDurationMs;
                this._ibl.nextScanMs = 0;
                applyIBLIntensity(this.scene, config, { force: true });
            }
            return envMap;
        }).catch((err) => {
            console.warn('[IBL] Failed to load HDR environment map:', err);
            this._ibl.envMap = null;
            return null;
        });
    }

    reloadLightingSettings() {
        this._lighting = getResolvedLightingSettings();
        this.renderer.toneMappingExposure = this._lighting.exposure;
        this.scene.environment = null;
        this.scene.background = null;
        this._ibl = null;
        this._iblPromise = null;
        this._initIBL();
    }

    reloadBloomSettings() {
        this._applyBloomSettings(getResolvedBloomSettings());
    }

    reloadColorGradingSettings() {
        this._applyColorGradingSettings(getResolvedColorGradingSettings());
    }

    setBloomSettings(settings) {
        this._applyBloomSettings(settings);
    }

    setColorGradingSettings(settings) {
        this._applyColorGradingSettings(settings);
    }

    restart({ startState = 'welcome' } = {}) {
        const sm = this._stateMachine ?? null;
        if (sm) sm.go(startState);
        if (this._contextProxy && 'city' in this._contextProxy) this._contextProxy.city = null;
        this.clearScene();
        this.reloadLightingSettings();
        this.reloadBloomSettings();
        this.reloadColorGradingSettings();
    }

    /**
     * Backward-compatible context getter.
     * States can use engine.context.selectedBus as before.
     * @returns {object}
     */
    get context() {
        return this._contextProxy;
    }

    setStateMachine(sm) {
        this._stateMachine = sm;
    }

    resize() {
        const rect = this.canvas?.getBoundingClientRect?.() ?? null;
        const width = Number.isFinite(rect?.width) ? rect.width : null;
        const height = Number.isFinite(rect?.height) ? rect.height : null;
        if (width && height) {
            this.setViewportSize(width, height);
            return;
        }
        this.setViewportSize(window.innerWidth, window.innerHeight);
    }

    setViewportSize(width, height) {
        const wNum = Number(width);
        const hNum = Number(height);
        const w = Math.max(1, Math.floor(Number.isFinite(wNum) ? wNum : 1));
        const h = Math.max(1, Math.floor(Number.isFinite(hNum) ? hNum : 1));
        this._syncPixelRatio();
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this._post?.pipeline?.setSize?.(w, h);
    }

    clearScene() {
        while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._lastT = performance.now();
        requestAnimationFrame((t) => this._tick(t));
    }

    stop() {
        this._running = false;
    }

    setIBLAutoScanEnabled(enabled) {
        this._iblAutoScanEnabled = !!enabled;
        if (!this._iblAutoScanEnabled && this._ibl) this._ibl.scanUntilMs = 0;
    }

    applyCurrentIBLIntensity({ force = true } = {}) {
        if (!this._ibl?.envMap) return;
        applyIBLIntensity(this.scene, this._ibl.config, { force: !!force });
    }

    updateFrame(dt, { render = true, nowMs = null } = {}) {
        const stepDt = Number.isFinite(dt) ? dt : 0;
        const now = Number.isFinite(nowMs) ? nowMs : performance.now();

        this._stateMachine?.update(stepDt);

        if (this._ibl?.envMap) {
            const state = this._stateMachine?.current ?? null;
            if (state !== this._ibl.lastState) {
                this._ibl.lastState = state;
                applyIBLToScene(this.scene, this._ibl.envMap, this._ibl.config);
                if (this._iblAutoScanEnabled) {
                    this._ibl.scanUntilMs = now + this._ibl.scanDurationMs;
                    this._ibl.nextScanMs = 0;
                }
            }

            if (this._iblAutoScanEnabled && now < this._ibl.scanUntilMs && now >= this._ibl.nextScanMs) {
                applyIBLIntensity(this.scene, this._ibl.config, { force: false });
                this._ibl.nextScanMs = now + this._ibl.scanIntervalMs;
            }
        }

        if (render) {
            if (this._post?.pipeline) this._post.pipeline.render(stepDt);
            else this.renderer.render(this.scene, this.camera);
        }
    }

    renderFrame() {
        if (this._post?.pipeline) this._post.pipeline.render();
        else this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        this.stop();
        if (this._autoResize) window.removeEventListener('resize', this._onResize);
        this.simulation?.dispose?.();
        this._post?.pipeline?.dispose?.();
        if (this._post) this._post.pipeline = null;
        this.renderer?.dispose?.();
    }

    _tick(t) {
        if (!this._running) return;

        const dt = Math.min((t - this._lastT) / 1000, 0.05);
        this._lastT = t;
        this.updateFrame(dt, { render: true, nowMs: t });

        requestAnimationFrame((tt) => this._tick(tt));
    }
}
