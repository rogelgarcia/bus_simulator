// src/app/core/GameEngine.js
import * as THREE from 'three';
import { SimulationContext } from './SimulationContext.js';
import { applyIBLIntensity, applyIBLToScene, getIBLBackgroundTexture, loadIBLBackgroundTexture, loadIBLTexture } from '../../graphics/lighting/IBL.js';
import { getResolvedLightingSettings, sanitizeToneMappingMode } from '../../graphics/lighting/LightingSettings.js';
import { getResolvedShadowSettings, getShadowQualityPreset, sanitizeShadowSettings } from '../../graphics/lighting/ShadowSettings.js';
import { getResolvedAtmosphereSettings, sanitizeAtmosphereSettings } from '../../graphics/visuals/atmosphere/AtmosphereSettings.js';
import { getResolvedAntiAliasingSettings, sanitizeAntiAliasingSettings } from '../../graphics/visuals/postprocessing/AntiAliasingSettings.js';
import { getResolvedAmbientOcclusionSettings, sanitizeAmbientOcclusionSettings } from '../../graphics/visuals/postprocessing/AmbientOcclusionSettings.js';
import { getResolvedBloomSettings, sanitizeBloomSettings } from '../../graphics/visuals/postprocessing/BloomSettings.js';
import { PostProcessingPipeline } from '../../graphics/visuals/postprocessing/PostProcessingPipeline.js';
import { getResolvedColorGradingSettings, sanitizeColorGradingSettings } from '../../graphics/visuals/postprocessing/ColorGradingSettings.js';
import { getColorGradingPresetById } from '../../graphics/visuals/postprocessing/ColorGradingPresets.js';
import { is3dLutSupported, loadCubeLut3DTexture } from '../../graphics/visuals/postprocessing/ColorGradingCubeLutLoader.js';
import { getResolvedSunBloomSettings, sanitizeSunBloomSettings } from '../../graphics/visuals/postprocessing/SunBloomSettings.js';
import { getOrCreateGpuFrameTimer } from '../../graphics/engine3d/perf/GpuFrameTimer.js';
import { getResolvedVehicleMotionDebugSettings, sanitizeVehicleMotionDebugSettings } from '../vehicle/VehicleMotionDebugSettings.js';
import { BusContactShadowRig } from '../../graphics/visuals/vehicles/BusContactShadowRig.js';
import { StaticAoRuntime } from '../../graphics/visuals/static_ao/StaticAoRuntime.js';

function resolveThreeToneMapping(mode) {
    const key = sanitizeToneMappingMode(mode, 'aces');
    if (key === 'agx') return THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping;
    if (key === 'neutral') return THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
    return THREE.ACESFilmicToneMapping;
}

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

        this._shadows = {
            settings: getResolvedShadowSettings()
        };
        this._applyShadowSettings(this._shadows.settings);

        // ✅ Tone mapping
        this._lighting = getResolvedLightingSettings();
        this.renderer.toneMapping = resolveThreeToneMapping(this._lighting.toneMapping);
        this.renderer.toneMappingExposure = this._lighting.exposure;
        this._atmosphere = getResolvedAtmosphereSettings();

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
        this.camera.position.set(0, 4, 14);

        this._post = {
            pipeline: null,
            debugOptions: {
                outputToneMappingEnabled: true,
                outputColorSpaceEnabled: true
            }
        };

        this._bloom = {
            settings: getResolvedBloomSettings()
        };

        this._ambientOcclusion = {
            settings: getResolvedAmbientOcclusionSettings()
        };

        this._busContactShadow = {
            rig: null,
            target: null,
            raycastRoot: null
        };

        this._staticAo = {
            runtime: null,
            lastCity: null
        };

        this._sunBloom = {
            settings: getResolvedSunBloomSettings()
        };

        this._antiAliasing = {
            settings: getResolvedAntiAliasingSettings()
        };

        this._colorGrading = {
            settings: getResolvedColorGradingSettings(),
            lut: null,
            lutPresetId: null,
            lutPromise: null,
            status: 'off',
            lastError: null
        };

        this._applyAntiAliasingSettings(this._antiAliasing.settings);
        this._applyAmbientOcclusionSettings(this._ambientOcclusion.settings);
        this._applyBloomSettings(this._bloom.settings);
        this._applySunBloomSettings(this._sunBloom.settings);
        this._applyColorGradingSettings(this._colorGrading.settings);

        this._ibl = null;
        this._iblPromise = null;
        this._iblBackground = { url: null, promise: null };
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
        this._frameListeners = new Set();

        this._frameTiming = {
            nowMs: 0,
            rawDt: Number.NaN,
            clampedDt: Number.NaN,
            dt: 0,
            fps: 0,
            synthetic: null
        };

        this._vehicleMotionDebug = {
            settings: getResolvedVehicleMotionDebugSettings(),
            frameIndex: 0
        };

        this._onResize = () => this.resize();
        if (this._autoResize) window.addEventListener('resize', this._onResize, { passive: true });
        if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
            this.setViewportSize(size.width, size.height);
        } else {
            this.resize();
        }

        this._gpuFrameTimer = getOrCreateGpuFrameTimer(this.renderer);
    }

    get shadowSettings() {
        return this._shadows?.settings ?? null;
    }

    get lightingSettings() {
        return this._lighting;
    }

    get atmosphereSettings() {
        return this._atmosphere;
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
            toneMapping: sanitizeToneMappingMode(src?.toneMapping ?? prev.toneMapping, prev.toneMapping ?? 'aces'),
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
        this.renderer.toneMapping = resolveThreeToneMapping(next.toneMapping);
        this.renderer.toneMappingExposure = next.exposure;
        this._post?.pipeline?.setToneMapping?.({
            toneMapping: this.renderer.toneMapping,
            exposure: this.renderer.toneMappingExposure
        });

        if (!this._ibl) {
            this._initIBL();
            return;
        }

        const ibl = next.ibl ?? null;
        this._ibl.config = { ...(this._ibl.config ?? {}), ...(ibl ?? {}) };

        if (!ibl?.enabled) {
            applyIBLToScene(this.scene, null, { enabled: false, setBackground: false });
            this._ensureIblBackground();
            return;
        }

        if (this._ibl.envMap) {
            applyIBLToScene(this.scene, this._ibl.envMap, this._ibl.config);
            applyIBLIntensity(this.scene, this._ibl.config, { force: true });
            this._ensureIblBackground();
            return;
        }

        this._ensureIblBackground();
        const requestedUrl = typeof this._ibl.config?.hdrUrl === 'string' ? this._ibl.config.hdrUrl : null;
        this._iblPromise = loadIBLTexture(this.renderer, this._ibl.config).then((envMap) => {
            const currentUrl = typeof this._ibl?.config?.hdrUrl === 'string' ? this._ibl.config.hdrUrl : null;
            const stillWants = !!this._ibl?.config?.enabled && (!requestedUrl || requestedUrl === currentUrl);
            if (!stillWants) return null;
            this._ibl.envMap = envMap;
            if (envMap) {
                applyIBLToScene(this.scene, envMap, this._ibl.config);
                applyIBLIntensity(this.scene, this._ibl.config, { force: true });
                this._ensureIblBackground();
            }
            return envMap;
        }).catch((err) => {
            console.warn('[IBL] Failed to load HDR environment map:', err);
            return null;
        });
    }

    setAtmosphereSettings(settings) {
        const src = settings && typeof settings === 'object' ? settings : null;
        const prev = this._atmosphere ?? getResolvedAtmosphereSettings({ includeUrlOverrides: false });

        const merged = {
            sun: { ...(prev.sun ?? {}), ...(src?.sun ?? {}) },
            sky: { ...(prev.sky ?? {}), ...(src?.sky ?? {}) },
            haze: { ...(prev.haze ?? {}), ...(src?.haze ?? {}) },
            glare: { ...(prev.glare ?? {}), ...(src?.glare ?? {}) },
            disc: { ...(prev.disc ?? {}), ...(src?.disc ?? {}) },
            debug: { ...(prev.debug ?? {}), ...(src?.debug ?? {}) }
        };

        this._atmosphere = sanitizeAtmosphereSettings(merged);
    }

    get bloomSettings() {
        return this._bloom?.settings ?? null;
    }

    get antiAliasingSettings() {
        return this._antiAliasing?.settings ?? null;
    }

    get ambientOcclusionSettings() {
        return this._ambientOcclusion?.settings ?? null;
    }

    get sunBloomSettings() {
        return this._sunBloom?.settings ?? null;
    }

    get isBloomEnabled() {
        return !!this._bloom?.settings?.enabled;
    }

    get isSunBloomEnabled() {
        return !!this._sunBloom?.settings?.enabled;
    }

    get isPostProcessingActive() {
        return !!this._post?.pipeline;
    }

    getBloomDebugInfo() {
        const s = this._bloom?.settings ?? null;
        if (!this._post?.pipeline) return { enabled: !!s?.enabled, ...(s ?? {}) };

        const info = this._post.pipeline.getDebugInfo?.() ?? null;
        const p = info?.globalBloom ?? null;
        return {
            enabled: !!p?.enabled,
            strength: p?.strength ?? (s?.strength ?? 0),
            radius: p?.radius ?? (s?.radius ?? 0),
            threshold: p?.threshold ?? (s?.threshold ?? 0)
        };
    }

    getSunBloomDebugInfo() {
        const s = this._sunBloom?.settings ?? null;
        if (!this._post?.pipeline) return { enabled: !!s?.enabled, ...(s ?? {}) };

        const info = this._post.pipeline.getDebugInfo?.() ?? null;
        const p = info?.sunBloom ?? null;
        return {
            enabled: !!p?.enabled,
            mode: p?.mode ?? (s?.mode ?? 'occlusion'),
            strength: p?.strength ?? (s?.strength ?? 0),
            radius: p?.radius ?? (s?.radius ?? 0),
            threshold: p?.threshold ?? (s?.threshold ?? 0),
            brightnessOnly: p?.brightnessOnly ?? (s?.brightnessOnly ?? true)
        };
    }

    getAmbientOcclusionDebugInfo() {
        const s = this._ambientOcclusion?.settings ?? null;
        const mode = s?.mode ?? 'off';
        if (!this._post?.pipeline) {
            const gtao = s?.gtao ?? null;
            return {
                mode,
                gtao: mode === 'gtao'
                    ? {
                        updateMode: gtao?.updateMode ?? 'every_frame',
                        updatedThisFrame: null,
                        updateReason: null,
                        cacheSupported: null,
                        ageFrames: null,
                        denoiseRequested: gtao?.denoise !== false,
                        denoiseActive: gtao?.denoise !== false,
                        debugViewRequested: gtao?.debugView === true,
                        debugViewActive: false,
                        fallbackReason: null
                    }
                    : null
            };
        }

        const info = this._post.pipeline.getDebugInfo?.() ?? null;
        const ao = info?.ambientOcclusion ?? null;
        const activeMode = ao?.mode ?? mode;
        const gtao = ao?.gtao ?? null;
        return {
            mode: activeMode,
            gtao: activeMode === 'gtao'
                ? {
                    updateMode: gtao?.updateMode ?? (s?.gtao?.updateMode ?? 'every_frame'),
                    updatedThisFrame: gtao?.updatedThisFrame ?? null,
                    updateReason: gtao?.updateReason ?? null,
                    cacheSupported: gtao?.cacheSupported ?? null,
                    ageFrames: gtao?.ageFrames ?? null,
                    denoiseRequested: gtao?.denoiseRequested ?? (s?.gtao?.denoise !== false),
                    denoiseActive: gtao?.denoiseActive ?? null,
                    debugViewRequested: gtao?.debugViewRequested ?? (s?.gtao?.debugView === true),
                    debugViewActive: gtao?.debugViewActive ?? null,
                    fallbackReason: gtao?.fallbackReason ?? null
                }
                : null
        };
    }

    getAntiAliasingDebugInfo() {
        const requested = this._antiAliasing?.settings ?? null;
        const requestedMode = typeof requested?.mode === 'string' ? requested.mode : 'off';
        const requestedSamples = Number.isFinite(requested?.msaa?.samples) ? Number(requested.msaa.samples) : 0;

        const caps = this.renderer?.capabilities ?? null;
        const maxSamples = Number.isFinite(caps?.maxSamples) ? Number(caps.maxSamples) : 0;
        const msaaSupported = !!caps?.isWebGL2 && maxSamples > 0;

        const gl = this.renderer?.getContext?.() ?? null;
        const nativeAntialias = !!gl?.getContextAttributes?.()?.antialias;

        if (!this._post?.pipeline) {
            return {
                pipelineActive: false,
                requestedMode,
                activeMode: nativeAntialias ? 'native_msaa' : 'off',
                nativeAntialias,
                msaaSupported,
                msaaMaxSamples: Math.max(0, Math.floor(maxSamples)),
                msaaRequestedSamples: requestedSamples,
                msaaActiveSamples: 0
            };
        }

        const info = this._post.pipeline.getDebugInfo?.() ?? null;
        const aa = info?.antiAliasing ?? null;
        const activeMode = typeof aa?.mode === 'string' ? aa.mode : 'off';
        return {
            pipelineActive: true,
            requestedMode: typeof aa?.requestedMode === 'string' ? aa.requestedMode : requestedMode,
            activeMode,
            nativeAntialias,
            msaaSupported: aa?.msaaSupported !== undefined ? !!aa.msaaSupported : msaaSupported,
            msaaMaxSamples: Number.isFinite(aa?.msaaMaxSamples) ? Number(aa.msaaMaxSamples) : Math.max(0, Math.floor(maxSamples)),
            msaaRequestedSamples: requestedSamples,
            msaaActiveSamples: Number.isFinite(aa?.msaaSamples) ? Number(aa.msaaSamples) : 0
        };
    }

    getIBLDebugInfo() {
        const config = this._ibl?.config ?? this._lighting?.ibl ?? null;
        const envMap = this._ibl?.envMap ?? null;
        const sceneEnv = this.scene?.environment ?? null;
        const sceneBg = this.scene?.background ?? null;
        const bgIsTexture = !!sceneBg && !!sceneBg.isTexture;
        const expectedBg = getIBLBackgroundTexture(envMap, config);
        const hasExpectedBg = !!expectedBg && !!expectedBg.isTexture;
        const bgMatchesHdr = !!expectedBg && sceneBg === expectedBg;

        const probe = this.scene?.getObjectByName?.('ibl_probe_sphere') ?? null;
        const probeMaterial = probe?.material ?? null;
        const probeMat = Array.isArray(probeMaterial) ? probeMaterial[0] : probeMaterial;
        const probeEnvMap = probeMat?.envMap ?? null;
        const probeHasEnvMap = !!probeEnvMap;
        const probeEnvMapIntensity = Number.isFinite(probeMat?.envMapIntensity) ? probeMat.envMapIntensity : null;
        const probeEnvMatchesScene = !!probeEnvMap && probeEnvMap === sceneEnv;
        const probeMaterialType = typeof probeMat?.type === 'string' ? probeMat.type : null;
        const probeMetalness = Number.isFinite(probeMat?.metalness) ? probeMat.metalness : null;
        const probeRoughness = Number.isFinite(probeMat?.roughness) ? probeMat.roughness : null;
        const envMapIsTexture = !!envMap?.isTexture;
        const envMapType = envMap ? (envMap.constructor?.name ?? null) : null;
        const probeEnvMapIsTexture = !!probeEnvMap?.isTexture;
        const probeEnvMapType = probeEnvMap ? (probeEnvMap.constructor?.name ?? null) : null;

        const mappingLabel = (mapping) => {
            const m = mapping ?? null;
            if (m === null || m === undefined) return null;
            if (THREE.CubeUVReflectionMapping !== undefined && m === THREE.CubeUVReflectionMapping) return 'CubeUV';
            if (THREE.CubeReflectionMapping !== undefined && m === THREE.CubeReflectionMapping) return 'Cube';
            if (THREE.EquirectangularReflectionMapping !== undefined && m === THREE.EquirectangularReflectionMapping) return 'Equirectangular';
            if (THREE.EquirectangularRefractionMapping !== undefined && m === THREE.EquirectangularRefractionMapping) return 'Equirectangular (refract)';
            return String(m);
        };

        const envMapMapping = mappingLabel(envMap?.mapping);
        const probeEnvMapMapping = mappingLabel(probeEnvMap?.mapping);

        let probeScreenUv = null;
        let probeVisible = null;
        let probeScreenRadius = null;
        if (probe && this.camera) {
            const worldPos = new THREE.Vector3();
            probe.getWorldPosition(worldPos);
            const ndcPos = worldPos.clone().project(this.camera);
            const u = (ndcPos.x + 1) / 2;
            const v = (1 - ndcPos.y) / 2;
            const ndcZ = ndcPos.z;
            const inView = ndcZ >= -1 && ndcZ <= 1 && u >= 0 && u <= 1 && v >= 0 && v <= 1;
            probeScreenUv = { u, v, ndcZ, inView };

            const sphere = probe.geometry?.boundingSphere ?? null;
            const radiusWorld = sphere?.radius && Number.isFinite(sphere.radius) ? sphere.radius : 1;
            const scale = probe.scale?.x && Number.isFinite(probe.scale.x) ? probe.scale.x : 1;
            const r = radiusWorld * scale;
            if (r > 0) {
                const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
                const edgeNdc = worldPos.clone().addScaledVector(right, r).project(this.camera);
                const u2 = (edgeNdc.x + 1) / 2;
                const v2 = (1 - edgeNdc.y) / 2;
                probeScreenRadius = Number.isFinite(u2) && Number.isFinite(v2) ? Math.hypot(u2 - u, v2 - v) : null;
            }

            if (inView) {
                const ndc = new THREE.Vector2((u * 2) - 1, 1 - (v * 2));
                const ray = new THREE.Raycaster();
                ray.setFromCamera(ndc, this.camera);
                const camPos = this.camera.getWorldPosition(new THREE.Vector3());
                const dist = camPos.distanceTo(worldPos);
                ray.far = dist + r * 1.05;
                const hits = ray.intersectObjects(this.scene?.children ?? [], true);
                const firstVisible = Array.isArray(hits)
                    ? hits.find((h) => {
                        const obj = h?.object ?? null;
                        if (!obj) return false;
                        let cur = obj;
                        while (cur) {
                            if (cur.visible === false) return false;
                            cur = cur.parent ?? null;
                        }
                        return true;
                    })?.object
                    : null;
                probeVisible = !!firstVisible && firstVisible === probe;
            }
        }

        const userData = envMap?.userData ?? null;
        const userDataKeys = userData && typeof userData === 'object' ? Object.keys(userData) : null;
        const envMapHdrUrl = typeof userData?.iblHdrUrl === 'string'
            ? userData.iblHdrUrl
            : (typeof envMap?.__iblHdrUrl === 'string' ? envMap.__iblHdrUrl : null);
        const fallbackFlag = !!userData?.iblFallback || !!envMap?.__iblFallback;
        return {
            enabled: !!config?.enabled,
            envMapIntensity: Number.isFinite(config?.envMapIntensity) ? config.envMapIntensity : null,
            setBackground: !!config?.setBackground,
            hdrUrl: typeof config?.hdrUrl === 'string' ? config.hdrUrl : null,
            iblId: typeof config?.iblId === 'string' ? config.iblId : null,
            envMapLoaded: !!envMap,
            usingFallbackEnvMap: fallbackFlag,
            envMapIsTexture,
            envMapType,
            envMapMapping,
            hasBackgroundTexture: hasExpectedBg,
            envMapHdrUrl,
            envMapUserDataKeys: userDataKeys,
            sceneHasEnvironment: !!sceneEnv,
            sceneEnvironmentMatches: !!envMap && sceneEnv === envMap,
            sceneHasBackground: !!sceneBg,
            sceneBackgroundMode: !sceneBg ? 'none' : (bgMatchesHdr ? 'hdr' : (bgIsTexture ? 'other' : 'non-texture')),
            probeFound: !!probe,
            probeHasEnvMap,
            probeEnvMapIsTexture,
            probeEnvMapType,
            probeEnvMapMapping,
            probeEnvMapMatchesScene: probeEnvMatchesScene,
            probeEnvMapIntensity,
            probeMaterialType,
            probeMetalness,
            probeRoughness,
            probeScreenUv,
            probeScreenRadius,
            probeVisible
        };
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

    _syncPixelRatio(width = null, height = null) {
        if (!this.renderer) return;
        const w = Number(width);
        const h = Number(height);

        const requested = this._pixelRatioOverride !== null
            ? this._pixelRatioOverride
            : Math.min(devicePixelRatio, 2);

        let next = requested;
        const gl = this.renderer.getContext?.() ?? null;
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && gl?.getParameter) {
            const maxRenderbufferSize = Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
            const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
            const maxViewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
            const maxViewportWidth = Number(maxViewportDims?.[0]);
            const maxViewportHeight = Number(maxViewportDims?.[1]);

            const candidates = [
                maxRenderbufferSize,
                maxTextureSize,
                maxViewportWidth,
                maxViewportHeight
            ].filter((value) => Number.isFinite(value) && value > 0);

            const maxDim = candidates.length ? Math.min(...candidates) : null;
            if (Number.isFinite(maxDim) && maxDim > 0) {
                const maxPixelRatio = Math.min(maxDim / w, maxDim / h);
                next = Math.min(requested, maxPixelRatio);
            }
        }

        next = Math.max(0.1, next);
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

    _applyShadowSettings(settings) {
        if (!this._shadows) return;
        const next = sanitizeShadowSettings(settings);
        this._shadows.settings = next;

        const preset = getShadowQualityPreset(next.quality);
        const enabled = !!preset.enabled;
        const type = preset.shadowMapType === 'pcf' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

        if (this.renderer.shadowMap.enabled !== enabled) {
            this.renderer.shadowMap.enabled = enabled;
            if ('needsUpdate' in this.renderer.shadowMap) this.renderer.shadowMap.needsUpdate = true;
        }
        if (enabled && this.renderer.shadowMap.type !== type) {
            this.renderer.shadowMap.type = type;
            if ('needsUpdate' in this.renderer.shadowMap) this.renderer.shadowMap.needsUpdate = true;
        }
    }

    _applyAntiAliasingSettings(settings) {
        if (!this._antiAliasing) return;
        const next = sanitizeAntiAliasingSettings(settings);
        this._antiAliasing.settings = next;
        this._syncPostProcessingPipeline();
    }

    _applyAmbientOcclusionSettings(settings) {
        if (!this._ambientOcclusion) return;
        const next = sanitizeAmbientOcclusionSettings(settings);
        this._ambientOcclusion.settings = next;
        this._syncPostProcessingPipeline();
        this._syncBusContactShadowSettings(next?.busContactShadow ?? null);
        this._syncStaticAoSettings(next);
    }

    _syncStaticAoSettings(ambientOcclusionSettings) {
        const ao = ambientOcclusionSettings && typeof ambientOcclusionSettings === 'object' ? ambientOcclusionSettings : null;
        const enabled = ao?.staticAo?.mode && ao.staticAo.mode !== 'off';
        const state = this._staticAo ?? null;
        if (!state || typeof state !== 'object') return;

        if (!enabled) {
            state.lastCity = null;
            state.runtime?.syncCity?.(null, ao);
            return;
        }

        if (!state.runtime) state.runtime = new StaticAoRuntime();
        const city = this._contextProxy?.city ?? null;
        state.lastCity = city;
        state.runtime.syncCity(city, ao);
    }

    _syncBusContactShadowSettings(settings) {
        const s = settings && typeof settings === 'object' ? settings : null;
        const enabled = s?.enabled === true;

        const state = this._busContactShadow ?? null;
        if (!state || typeof state !== 'object') return;

        if (!enabled) {
            state.rig?.setEnabled?.(false);
            return;
        }

        if (!state.rig) {
            state.rig = new BusContactShadowRig({ enabled: true, settings: s });
            this.scene?.add?.(state.rig.group);
        }

        state.rig.setEnabled(true);
        state.rig.setSettings(s);
    }

    _applyBloomSettings(settings) {
        if (!this._bloom) return;
        const next = sanitizeBloomSettings(settings);
        this._bloom.settings = next;
        this._syncPostProcessingPipeline();
    }

    _applySunBloomSettings(settings) {
        if (!this._sunBloom) return;
        const next = sanitizeSunBloomSettings(settings);
        this._sunBloom.settings = next;
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
        const sunBloomEnabled = !!this._sunBloom?.settings?.enabled;
        const preset = getColorGradingPresetById(this._colorGrading?.settings?.preset);
        const gradingRequested = preset?.id && preset.id !== 'off' && (this._colorGrading?.settings?.intensity > 0);
        const aa = this._antiAliasing?.settings ?? null;
        const aaMode = typeof aa?.mode === 'string' ? aa.mode : 'off';
        const aaWantsPipeline = aaMode === 'fxaa' || aaMode === 'smaa' || aaMode === 'taa';

        const ao = this._ambientOcclusion?.settings ?? null;
        const aoMode = typeof ao?.mode === 'string' ? ao.mode : 'off';
        const aoWantsPipeline = aoMode === 'ssao' || aoMode === 'gtao';

        const wantsPipeline = bloomEnabled || sunBloomEnabled || gradingRequested || aaWantsPipeline || aoWantsPipeline;

        if (!wantsPipeline) {
            if (this._post.pipeline) {
                this._post.pipeline.dispose();
                this._post.pipeline = null;
            }
            return;
        }

        if (!this._post.pipeline) {
            this._post.pipeline = new PostProcessingPipeline({
                renderer: this.renderer,
                scene: this.scene,
                camera: this.camera,
                bloom: this._bloom?.settings ?? null,
                ambientOcclusion: this._ambientOcclusion?.settings ?? null,
                sunBloom: this._sunBloom?.settings ?? null,
                antiAliasing: this._antiAliasing?.settings ?? null
            });
            this._post.pipeline.setPixelRatio(this.renderer.getPixelRatio?.() ?? 1);
            this._syncPostProcessingSize();
        }

        this._post.pipeline.setSettings({
            bloom: this._bloom?.settings ?? null,
            sunBloom: this._sunBloom?.settings ?? null
        });
        this._post.pipeline.setAmbientOcclusion(this._ambientOcclusion?.settings ?? null);
        this._post.pipeline.setAntiAliasing(this._antiAliasing?.settings ?? null);
        this._post.pipeline.setColorGrading({
            lutTexture: this._colorGrading?.lut ?? null,
            intensity: this._colorGrading?.settings?.intensity ?? 0
        });
        this._post.pipeline.setToneMapping({
            toneMapping: this.renderer.toneMapping,
            exposure: this.renderer.toneMappingExposure
        });
        this._post.pipeline.setDebugOptions(this._post?.debugOptions ?? null);
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
	                this._ensureIblBackground();
	            }
	            return envMap;
	        }).catch((err) => {
            console.warn('[IBL] Failed to load HDR environment map:', err);
            this._ibl.envMap = null;
            return null;
        });
    }

    _ensureIblBackground() {
        const config = this._ibl?.config ?? null;
        const city = this._contextProxy?.city ?? null;
        const cityAttached = !!city?.group && city.group.parent === this.scene;
        if (!config?.setBackground) {
            if (cityAttached) {
                const bg = this.scene?.background ?? null;
                if (bg && bg.isTexture) this.scene.background = null;
            }
            return;
        }
        if (!cityAttached) return;
        const hdrUrl = typeof config?.hdrUrl === 'string' ? config.hdrUrl : '';
        if (!hdrUrl) return;

        const envMap = this._ibl?.envMap ?? null;
        const existing = getIBLBackgroundTexture(envMap, config);
        if (existing && existing.isTexture) {
            if (this.scene?.background !== existing) this.scene.background = existing;
            return;
        }

        const inflight = this._iblBackground?.promise ?? null;
        if (inflight && this._iblBackground?.url === hdrUrl) return;

        const requestedUrl = hdrUrl;
        const promise = loadIBLBackgroundTexture(requestedUrl);
        this._iblBackground = { url: requestedUrl, promise };
        promise.then((hdrTex) => {
            if (this._iblBackground?.url === requestedUrl) {
                this._iblBackground.promise = null;
            }
            const stillWants = !!this._ibl?.config?.setBackground && this._ibl?.config?.hdrUrl === requestedUrl;
            const stillAttached = this._contextProxy?.city?.group?.parent === this.scene;
            if (!stillWants || !stillAttached || !hdrTex) return;

            const envNow = this._ibl?.envMap ?? null;
            if (envNow) {
                envNow.userData = envNow.userData ?? {};
                envNow.userData.iblBackgroundTexture = hdrTex;
                envNow.__iblBackgroundTexture = hdrTex;
            }

            if (this._ibl?.config?.enabled && envNow) {
                applyIBLToScene(this.scene, envNow, this._ibl.config);
                return;
            }
            this.scene.background = hdrTex;
        }).catch((err) => {
            if (this._iblBackground?.url === requestedUrl) {
                this._iblBackground.promise = null;
            }
            console.warn('[IBL] Failed to load HDR background texture:', err);
        });
    }

    reloadLightingSettings() {
        this._lighting = getResolvedLightingSettings();
        this.renderer.toneMapping = resolveThreeToneMapping(this._lighting.toneMapping);
        this.renderer.toneMappingExposure = this._lighting.exposure;
        this._post?.pipeline?.setToneMapping?.({
            toneMapping: this.renderer.toneMapping,
            exposure: this.renderer.toneMappingExposure
        });
        this.scene.environment = null;
        this.scene.background = null;
        this._ibl = null;
        this._iblPromise = null;
        this._initIBL();
    }

    reloadShadowSettings() {
        this._applyShadowSettings(getResolvedShadowSettings());
    }

    reloadBloomSettings() {
        this._applyBloomSettings(getResolvedBloomSettings());
    }

    reloadAntiAliasingSettings() {
        this._applyAntiAliasingSettings(getResolvedAntiAliasingSettings());
    }

    reloadAmbientOcclusionSettings() {
        this._applyAmbientOcclusionSettings(getResolvedAmbientOcclusionSettings());
    }

    reloadSunBloomSettings() {
        this._applySunBloomSettings(getResolvedSunBloomSettings());
    }

    reloadColorGradingSettings() {
        this._applyColorGradingSettings(getResolvedColorGradingSettings());
    }

    setShadowSettings(settings) {
        this._applyShadowSettings(settings);
    }

    setBloomSettings(settings) {
        this._applyBloomSettings(settings);
    }

    setAntiAliasingSettings(settings) {
        this._applyAntiAliasingSettings(settings);
    }

    setAmbientOcclusionSettings(settings) {
        this._applyAmbientOcclusionSettings(settings);
    }

    setSunBloomSettings(settings) {
        this._applySunBloomSettings(settings);
    }

    setColorGradingSettings(settings) {
        this._applyColorGradingSettings(settings);
    }

    setPostProcessingDebugOptions(options) {
        const src = options && typeof options === 'object' ? options : {};
        const prev = this._post?.debugOptions ?? {};
        const next = {
            outputToneMappingEnabled: src.outputToneMappingEnabled !== undefined
                ? !!src.outputToneMappingEnabled
                : (prev.outputToneMappingEnabled !== undefined ? !!prev.outputToneMappingEnabled : true),
            outputColorSpaceEnabled: src.outputColorSpaceEnabled !== undefined
                ? !!src.outputColorSpaceEnabled
                : (prev.outputColorSpaceEnabled !== undefined ? !!prev.outputColorSpaceEnabled : true)
        };
        this._post.debugOptions = next;
        this._post?.pipeline?.setDebugOptions?.(next);
    }

    restart({ startState = 'welcome' } = {}) {
        const sm = this._stateMachine ?? null;
        if (sm) sm.go(startState);
        if (this._contextProxy && 'city' in this._contextProxy) this._contextProxy.city = null;
        this.clearScene();
        this.reloadShadowSettings();
        this.reloadLightingSettings();
        this.reloadAntiAliasingSettings();
        this.reloadAmbientOcclusionSettings();
        this.reloadBloomSettings();
        this.reloadSunBloomSettings();
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

    addFrameListener(fn) {
        if (typeof fn !== 'function') throw new Error('[GameEngine] addFrameListener expects a function');
        this._frameListeners.add(fn);
        return () => this._frameListeners.delete(fn);
    }

    removeFrameListener(fn) {
        this._frameListeners.delete(fn);
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
        this._syncPixelRatio(w, h);
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

        const timing = this._frameTiming;
        if (timing) {
            timing.nowMs = now;
            timing.dt = stepDt;
            timing.fps = stepDt > 1e-9 ? 1 / stepDt : 0;
            if (!Number.isFinite(timing.rawDt)) timing.rawDt = stepDt;
            if (!Number.isFinite(timing.clampedDt)) timing.clampedDt = stepDt;
        }

        this._stateMachine?.update(stepDt);
        this._ensureIblBackground();

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

        if (!render) return;

        this._updateStaticAo();
        this._updateBusContactShadow(stepDt);

        const gpuTimer = this._gpuFrameTimer;
        gpuTimer?.beginFrame?.();
        try {
            if (this._post?.pipeline) this._post.pipeline.render(stepDt);
            else this.renderer.render(this.scene, this.camera);
        } finally {
            gpuTimer?.endFrame?.();
            gpuTimer?.poll?.();
        }

        if (!this._frameListeners.size) return;
        for (const fn of this._frameListeners) {
            try {
                fn({ dt: stepDt, nowMs: now, renderer: this.renderer, engine: this });
            } catch (err) {
                console.warn('[GameEngine] Frame listener error:', err);
                this._frameListeners.delete(fn);
            }
        }
    }

    _updateBusContactShadow(dt) {
        const state = this._busContactShadow ?? null;
        const rig = state?.rig ?? null;
        if (!rig) return;

        if (rig.group?.parent !== this.scene && this.scene?.add) {
            this.scene.add(rig.group);
        }

        const selected = this._contextProxy?.selectedBus ?? null;
        const model = selected?.userData?.model?.isObject3D
            ? selected.userData.model
            : (selected?.isObject3D ? selected : null);

        if (model !== state.target) {
            state.target = model;
            rig.setTarget(model);
        }

        const city = this._contextProxy?.city ?? null;
        const raycastRoot = city?.group?.isObject3D ? city.group : this.scene;
        if (raycastRoot !== state.raycastRoot) {
            state.raycastRoot = raycastRoot;
            rig.setRaycastRoot(raycastRoot);
        }

        rig.update(dt);
    }

    _updateStaticAo() {
        const state = this._staticAo ?? null;
        if (!state || typeof state !== 'object') return;
        const runtime = state.runtime ?? null;
        if (!runtime) return;

        const ao = this._ambientOcclusion?.settings ?? null;
        const enabled = ao?.staticAo?.mode && ao.staticAo.mode !== 'off';
        if (!enabled) {
            if (state.lastCity !== null) state.lastCity = null;
            runtime.syncCity(null, ao);
            return;
        }

        const city = this._contextProxy?.city ?? null;
        if (city === state.lastCity) return;
        state.lastCity = city;
        runtime.syncCity(city, ao);
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
        this._staticAo?.runtime?.dispose?.();
        if (this._staticAo) this._staticAo.runtime = null;
        this._busContactShadow?.rig?.dispose?.();
        this.renderer?.dispose?.();
    }

    _tick(t) {
        if (!this._running) return;

        const rawDt = (t - this._lastT) / 1000;
        const clampedDt = Math.min(rawDt, 0.05);
        let dt = clampedDt;

        const debug = this._vehicleMotionDebug?.settings ?? null;
        const synthetic = debug?.syntheticDt ?? null;
        let syntheticInfo = null;

        this._lastT = t;
        if (synthetic?.enabled === true && typeof synthetic.pattern === 'string' && synthetic.pattern !== 'off') {
            const idx = this._vehicleMotionDebug.frameIndex = (this._vehicleMotionDebug.frameIndex + 1) >>> 0;
            const pattern = synthetic.pattern;
            const mode = typeof synthetic.mode === 'string' ? synthetic.mode : 'dt';
            const stallMs = Number.isFinite(synthetic.stallMs) ? Math.max(0, Math.min(200, Math.round(synthetic.stallMs))) : 34;

            if (mode === 'dt') {
                // Note: this *changes simulation time* (can speed up/slow down). It's useful for surfacing timing bugs.
                if (pattern === 'steady20') {
                    dt = 0.05;
                } else if (pattern === 'steady30') {
                    dt = 1 / 30;
                } else if (pattern === 'alt60_20') {
                    dt = (idx % 2 === 0) ? (1 / 60) : 0.05;
                } else if (pattern === 'alt60_30') {
                    dt = (idx % 2 === 0) ? (1 / 60) : (1 / 30);
                } else if (pattern === 'alt60_40') {
                    dt = (idx % 2 === 0) ? (1 / 60) : (1 / 40);
                } else if (pattern === 'spike20') {
                    dt = (idx % 10 === 0) ? 0.05 : (1 / 60);
                }
                dt = Math.min(dt, 0.05);
                syntheticInfo = { kind: 'dtPattern', pattern, mode };
            } else if (mode === 'stall') {
                // Busy-wait to create real frame-time spikes without changing dt directly.
                const wantsStall = (() => {
                    if (pattern === 'steady20') return true;
                    if (pattern === 'steady30') return true;
                    if (pattern === 'alt60_20') return (idx % 2 === 1);
                    if (pattern === 'alt60_30') return (idx % 2 === 1);
                    if (pattern === 'alt60_40') return (idx % 2 === 1);
                    if (pattern === 'spike20') return (idx % 10 === 0);
                    return false;
                })();

                if (wantsStall && stallMs > 0) {
                    const start = performance.now();
                    while (performance.now() - start < stallMs) {}
                }

                syntheticInfo = { kind: 'stall', pattern, mode, stallMs };
            }
        }

        if (this._frameTiming) {
            this._frameTiming.nowMs = t;
            this._frameTiming.rawDt = rawDt;
            this._frameTiming.clampedDt = clampedDt;
            this._frameTiming.dt = dt;
            this._frameTiming.fps = dt > 1e-9 ? 1 / dt : 0;
            this._frameTiming.synthetic = syntheticInfo;
        }
        this.updateFrame(dt, { render: true, nowMs: t });

        requestAnimationFrame((tt) => this._tick(tt));
    }

    get frameTimingDebugInfo() {
        return this._frameTiming ?? null;
    }

    get vehicleMotionDebugSettings() {
        return this._vehicleMotionDebug?.settings ?? null;
    }

    setVehicleMotionDebugSettings(settings) {
        if (!this._vehicleMotionDebug) return;
        this._vehicleMotionDebug.settings = sanitizeVehicleMotionDebugSettings(settings);
    }

    reloadVehicleMotionDebugSettings() {
        this.setVehicleMotionDebugSettings(getResolvedVehicleMotionDebugSettings());
    }

    getPhysicsLoopDebugInfo() {
        const loop = this.simulation?.physics?.loop ?? null;
        if (!loop) return null;
        const fixedDt = Number.isFinite(loop.fixedDt) ? loop.fixedDt : null;
        const accum = Number.isFinite(loop.accum) ? loop.accum : null;
        const alpha = fixedDt && accum !== null ? Math.max(0, Math.min(1, accum / fixedDt)) : null;
        return {
            fixedDt,
            maxSubSteps: Number.isFinite(loop.maxSubSteps) ? loop.maxSubSteps : null,
            accum,
            alpha,
            subStepsLastFrame: Number.isFinite(loop.lastSubSteps) ? loop.lastSubSteps : null
        };
    }
}
