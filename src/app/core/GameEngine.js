// src/app/core/GameEngine.js
import * as THREE from 'three';
import { SimulationContext } from './SimulationContext.js';
import { applyIBLIntensity, applyIBLToScene, loadIBLTexture } from '../../graphics/lighting/IBL.js';
import { getResolvedLightingSettings } from '../../graphics/lighting/LightingSettings.js';

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

        const resolvedPixelRatio = Number.isFinite(pixelRatio) ? Math.max(0.1, pixelRatio) : Math.min(devicePixelRatio, 2);
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

    restart({ startState = 'welcome' } = {}) {
        const sm = this._stateMachine ?? null;
        if (sm) sm.go(startState);
        if (this._contextProxy && 'city' in this._contextProxy) this._contextProxy.city = null;
        this.clearScene();
        this.reloadLightingSettings();
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
        this.setViewportSize(window.innerWidth, window.innerHeight);
    }

    setViewportSize(width, height) {
        const wNum = Number(width);
        const hNum = Number(height);
        const w = Math.max(1, Math.floor(Number.isFinite(wNum) ? wNum : 1));
        const h = Math.max(1, Math.floor(Number.isFinite(hNum) ? hNum : 1));
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
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

        if (render) this.renderer.render(this.scene, this.camera);
    }

    renderFrame() {
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        this.stop();
        if (this._autoResize) window.removeEventListener('resize', this._onResize);
        this.simulation?.dispose?.();
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
