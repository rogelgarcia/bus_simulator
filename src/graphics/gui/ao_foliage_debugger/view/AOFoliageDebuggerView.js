// src/graphics/gui/ao_foliage_debugger/view/AOFoliageDebuggerView.js
// Standalone AO debug scene (independent from gameplay post-processing pipeline).
// @ts-check

import * as THREE from 'three';
import { createToolCameraController } from '../../../engine3d/camera/ToolCameraPrefab.js';
import { loadTreeTemplates } from '../../../assets3d/generators/TreeGenerator.js';
import { applyAtmosphereToSkyDome, createGradientSkyDome, shouldShowSkyDome } from '../../../assets3d/generators/SkyGenerator.js';
import { getResolvedAtmosphereSettings, sanitizeAtmosphereSettings } from '../../../visuals/atmosphere/AtmosphereSettings.js';
import { azimuthElevationDegToDir } from '../../../visuals/atmosphere/SunDirection.js';
import { getResolvedLightingSettings, sanitizeLightingSettings, sanitizeToneMappingMode } from '../../../lighting/LightingSettings.js';
import { applyIBLIntensity, applyIBLToScene, loadIBLTexture } from '../../../lighting/IBL.js';
import { getResolvedAmbientOcclusionSettings } from '../../../visuals/postprocessing/AmbientOcclusionSettings.js';
import { makeChoiceRow, makeNumberSliderRow, makeToggleRow } from '../../options/OptionsUiControls.js';
import { AODebugPipeline } from './AODebugPipeline.js';

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function deepClone(value) {
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function getCanvasSizePx(canvas, pixelRatio) {
    const rect = canvas?.getBoundingClientRect?.() ?? null;
    const wCss = Math.max(1, Math.floor(Number(rect?.width) || 1));
    const hCss = Math.max(1, Math.floor(Number(rect?.height) || 1));
    const pr = Math.max(0.1, Number(pixelRatio) || 1);
    return { wCss, hCss, pr };
}

function sanitizeToneMappingChoice(value) {
    const mode = sanitizeToneMappingMode(value, 'aces');
    if (mode === 'neutral' || mode === 'agx' || mode === 'aces') return mode;
    return 'aces';
}

function resolveThreeToneMapping(mode) {
    const key = sanitizeToneMappingChoice(mode);
    if (key === 'agx') return THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping;
    if (key === 'neutral') return THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
    return THREE.ACESFilmicToneMapping;
}

function sanitizeAoMode(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'ssao') return 'ssao';
    if (raw === 'gtao') return 'gtao';
    return 'off';
}

function sanitizeAoQuality(value, fallback = 'medium') {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
    return fallback;
}

function isLikelyFoliageName(name) {
    const s = String(name ?? '').trim().toLowerCase();
    if (!s) return false;
    return s.includes('leaf') || s.includes('foliage') || s.includes('bush') || s.includes('grass') || s.includes('hedge');
}

function createAoAlphaMapFromTextureAlpha(sourceTexture) {
    const src = sourceTexture?.image?.data ?? null;
    const w = Number(sourceTexture?.image?.width) || 0;
    const h = Number(sourceTexture?.image?.height) || 0;
    if (!(src instanceof Uint8Array) || w <= 0 || h <= 0 || src.length < w * h * 4) return null;

    const out = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
        const alpha = src[(i * 4) + 3];
        const j = i * 4;
        out[j] = alpha;
        out[j + 1] = alpha;
        out[j + 2] = alpha;
        out[j + 3] = 255;
    }

    const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
    if ('colorSpace' in tex) tex.colorSpace = THREE.NoColorSpace;
    else if ('encoding' in tex) tex.encoding = THREE.LinearEncoding;
    tex.magFilter = sourceTexture.magFilter;
    tex.minFilter = sourceTexture.minFilter;
    tex.wrapS = sourceTexture.wrapS;
    tex.wrapT = sourceTexture.wrapT;
    tex.generateMipmaps = sourceTexture.generateMipmaps !== false;
    tex.anisotropy = sourceTexture.anisotropy;
    tex.flipY = sourceTexture.flipY === true;
    tex.offset.copy(sourceTexture.offset);
    tex.repeat.copy(sourceTexture.repeat);
    tex.center.copy(sourceTexture.center);
    tex.rotation = Number.isFinite(sourceTexture.rotation) ? sourceTexture.rotation : 0;
    tex.matrixAutoUpdate = sourceTexture.matrixAutoUpdate !== false;
    if (!tex.matrixAutoUpdate) tex.matrix.copy(sourceTexture.matrix);
    tex.needsUpdate = true;
    return tex;
}

export class AOFoliageDebuggerView {
    constructor({ canvas }) {
        this.canvas = canvas;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this._pipeline = null;
        this._ui = null;

        this._raf = 0;
        this._lastT = 0;
        this._onResize = () => this._resize();
        this.onFrame = null;

        this._lighting = null;
        this._atmosphere = null;
        this._ambientOcclusionTemplate = null;
        this._toneMappingMode = 'aces';

        this._hemi = null;
        this._sun = null;
        this._sky = null;

        this._iblLoadSeq = 0;
        this._disposed = false;

        this._reproState = {
            leafTexture: null,
            samplePointsWorld: null
        };

        this._ownedTextures = new Set();
    }

    async start() {
        const canvas = this.canvas;

        if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: false,
            alpha: false,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        });

        if ('outputColorSpace' in this.renderer) {
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        } else if ('outputEncoding' in this.renderer) {
            this.renderer.outputEncoding = THREE.sRGBEncoding;
        }
        if ('useLegacyLights' in this.renderer) this.renderer.useLegacyLights = true;

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0x0b0f14, 1);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b0f14);

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);

        this._lighting = sanitizeLightingSettings(getResolvedLightingSettings({ includeUrlOverrides: true }));
        this._atmosphere = sanitizeAtmosphereSettings(getResolvedAtmosphereSettings({ includeUrlOverrides: true }));

        const resolvedAo = getResolvedAmbientOcclusionSettings({ includeUrlOverrides: true });
        this._ambientOcclusionTemplate = resolvedAo && typeof resolvedAo === 'object' ? deepClone(resolvedAo) : {};
        const initialAoMode = sanitizeAoMode(this._ambientOcclusionTemplate?.mode);

        this._toneMappingMode = sanitizeToneMappingChoice(this._lighting?.toneMapping ?? 'aces');
        this._applyToneMappingMode(this._toneMappingMode, { syncPipeline: false });

        await this._initReproScene();
        await this._loadEnvironmentFromSettings();

        const initialAo = this._buildAmbientOcclusionForMode(initialAoMode);
        this._pipeline = new AODebugPipeline({
            renderer: this.renderer,
            scene: this.scene,
            camera: this.camera,
            ambientOcclusion: initialAo,
            msaaSamples: 8
        });
        this._pipeline.setToneMapping({
            toneMapping: this.renderer.toneMapping,
            exposure: this.renderer.toneMappingExposure
        });

        this._mountOptionsPanel({
            toneMapping: this._toneMappingMode,
            ambientOcclusion: initialAo
        });

        this.controls = createToolCameraController(this.camera, canvas, {
            uiRoot: this._ui?.layer ?? null,
            enabled: true,
            enableDamping: true,
            dampingFactor: 0.08,
            rotateSpeed: 0.9,
            panSpeed: 0.85,
            zoomSpeed: 1.0,
            minDistance: 0.35,
            maxDistance: 180,
            minPolarAngle: 0.001,
            maxPolarAngle: Math.PI - 0.001,
            getFocusTarget: () => ({ center: new THREE.Vector3(0, 1.8, -3.2), radius: 8 }),
            initialPose: {
                position: new THREE.Vector3(0.2, 2.2, 5.8),
                target: new THREE.Vector3(0, 1.9, -3.8)
            }
        });

        window.addEventListener('resize', this._onResize, { passive: true });
        this._resize();
        this._lastT = performance.now();
        this._raf = requestAnimationFrame((t) => this._tick(t));
    }

    destroy() {
        this._disposed = true;
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;
        window.removeEventListener('resize', this._onResize);

        this.controls?.dispose?.();
        this.controls = null;

        this._unmountOptionsPanel();

        this._pipeline?.dispose?.();
        this._pipeline = null;

        if (this.scene) {
            applyIBLToScene(this.scene, null, { enabled: false, setBackground: false });
            const disposedMaterials = new Set();
            const disposedGeometries = new Set();
            this.scene.traverse((obj) => {
                if (!obj?.isMesh) return;
                const geom = obj.geometry ?? null;
                if (geom && !disposedGeometries.has(geom)) {
                    disposedGeometries.add(geom);
                    geom.dispose?.();
                }
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                for (const mat of mats) {
                    if (!mat || disposedMaterials.has(mat)) continue;
                    disposedMaterials.add(mat);
                    mat.dispose?.();
                }
            });
        }

        for (const tex of this._ownedTextures) tex?.dispose?.();
        this._ownedTextures.clear();

        this.renderer?.dispose?.();
        this.renderer = null;
        this.scene = null;
        this.camera = null;

        document.body.classList.remove('options-dock-open');
    }

    _resize() {
        if (!this.renderer || !this.camera || !this.canvas) return;
        const pr = this.renderer.getPixelRatio?.() ?? (window.devicePixelRatio || 1);
        const size = getCanvasSizePx(this.canvas, pr);
        this.renderer.setSize(size.wCss, size.hCss, false);
        this.camera.aspect = size.wCss / Math.max(1, size.hCss);
        this.camera.updateProjectionMatrix();
        this._pipeline?.setPixelRatio?.(pr);
        this._pipeline?.setSize?.(size.wCss, size.hCss);
    }

    _tick(t) {
        const renderer = this.renderer;
        const pipeline = this._pipeline;
        if (!renderer || !pipeline) return;

        const now = Number(t) || 0;
        const dt = this._lastT ? Math.min(0.05, Math.max(0, (now - this._lastT) / 1000)) : 0;
        this._lastT = now;

        this.controls?.update?.(dt);
        pipeline.render(dt);

        const onFrame = this.onFrame;
        if (typeof onFrame === 'function') onFrame({ dt, nowMs: now, renderer });
        this._raf = requestAnimationFrame((ts) => this._tick(ts));
    }

    _applyToneMappingMode(mode, { syncPipeline = true } = {}) {
        const renderer = this.renderer;
        if (!renderer) return;

        const nextMode = sanitizeToneMappingChoice(mode);
        this._toneMappingMode = nextMode;

        renderer.toneMapping = resolveThreeToneMapping(nextMode);
        renderer.toneMappingExposure = clamp(this._lighting?.exposure, 0.1, 5, 1.14);

        if (syncPipeline) {
            this._pipeline?.setToneMapping?.({
                toneMapping: renderer.toneMapping,
                exposure: renderer.toneMappingExposure
            });
        }
    }

    _sanitizeAmbientOcclusionSettings(input) {
        const draft = deepClone(input) ?? {};
        draft.mode = sanitizeAoMode(draft.mode);
        if (!draft.alpha || typeof draft.alpha !== 'object') draft.alpha = {};
        draft.alpha.handling = draft.alpha.handling === 'exclude' ? 'exclude' : 'alpha_test';
        draft.alpha.threshold = clamp(draft.alpha.threshold, 0.01, 0.99, 0.5);

        if (!draft.ssao || typeof draft.ssao !== 'object') draft.ssao = {};
        draft.ssao.intensity = clamp(draft.ssao.intensity, 0, 2, 0.35);
        draft.ssao.radius = clamp(draft.ssao.radius, 0.1, 64, 8);
        draft.ssao.quality = sanitizeAoQuality(draft.ssao.quality, 'medium');

        if (!draft.gtao || typeof draft.gtao !== 'object') draft.gtao = {};
        draft.gtao.intensity = clamp(draft.gtao.intensity, 0, 2, 0.35);
        draft.gtao.radius = clamp(draft.gtao.radius, 0.05, 8, 0.25);
        draft.gtao.quality = sanitizeAoQuality(draft.gtao.quality, 'medium');
        draft.gtao.denoise = draft.gtao.denoise !== false;
        draft.gtao.debugView = draft.gtao.debugView === true;

        return draft;
    }

    _buildAmbientOcclusionForMode(mode) {
        const nextMode = sanitizeAoMode(mode);
        const draft = this._sanitizeAmbientOcclusionSettings(this._ambientOcclusionTemplate);
        draft.mode = nextMode;
        return draft;
    }

    _mountOptionsPanel({ toneMapping, ambientOcclusion = null }) {
        this._unmountOptionsPanel();
        const initialAo = this._sanitizeAmbientOcclusionSettings(ambientOcclusion ?? this._buildAmbientOcclusionForMode('off'));

        const layer = document.createElement('div');
        layer.className = 'ui-layer options-layer';

        const panel = document.createElement('div');
        panel.className = 'ui-panel is-interactive options-panel';

        const header = document.createElement('div');
        header.className = 'options-header';

        const title = document.createElement('div');
        title.className = 'options-title';
        title.textContent = 'AO';

        const subtitle = document.createElement('div');
        subtitle.className = 'options-subtitle';
        subtitle.textContent = 'Esc returns to the Welcome screen';

        header.appendChild(title);
        header.appendChild(subtitle);
        panel.appendChild(header);

        const tabs = document.createElement('div');
        tabs.className = 'options-tabs';
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'options-tab is-active';
        tab.textContent = 'Options';
        tabs.appendChild(tab);
        panel.appendChild(tabs);

        const body = document.createElement('div');
        body.className = 'options-body';

        const section = document.createElement('div');
        section.className = 'options-section';

        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'options-section-title';
        sectionTitle.textContent = 'Graphics';
        section.appendChild(sectionTitle);

        const info = document.createElement('div');
        info.className = 'options-subtitle';
        info.textContent = 'Defaults: Ultra shadows, MSAA 8x';
        section.appendChild(info);

        const toneControl = makeChoiceRow({
            label: 'Tone Mapping',
            value: sanitizeToneMappingChoice(toneMapping),
            options: [
                { id: 'neutral', label: 'Neutral' },
                { id: 'agx', label: 'AgX' },
                { id: 'aces', label: 'ACES' }
            ],
            onChange: (value) => {
                this._applyToneMappingMode(value, { syncPipeline: true });
                this._ui?.toneControl?.setValue?.(this._toneMappingMode);
            }
        });
        section.appendChild(toneControl.row);

        const aoControl = makeChoiceRow({
            label: 'AO Mode',
            value: sanitizeAoMode(initialAo?.mode),
            options: [
                { id: 'off', label: 'Off' },
                { id: 'ssao', label: 'SSAO' },
                { id: 'gtao', label: 'GTAO' }
            ],
            onChange: () => applyAoFromUi()
        });
        section.appendChild(aoControl.row);

        const aoAlphaHandling = makeChoiceRow({
            label: 'AO Alpha',
            value: initialAo?.alpha?.handling === 'exclude' ? 'exclude' : 'alpha_test',
            options: [
                { id: 'alpha_test', label: 'Alpha Test' },
                { id: 'exclude', label: 'Exclude' }
            ],
            onChange: () => applyAoFromUi()
        });
        section.appendChild(aoAlphaHandling.row);

        const aoAlphaThreshold = makeNumberSliderRow({
            label: 'Alpha Threshold',
            value: clamp(initialAo?.alpha?.threshold, 0.01, 0.99, 0.5),
            min: 0.01,
            max: 0.99,
            step: 0.01,
            digits: 2,
            onChange: () => applyAoFromUi()
        });
        section.appendChild(aoAlphaThreshold.row);

        const ssaoQuality = makeChoiceRow({
            label: 'SSAO Quality',
            value: sanitizeAoQuality(initialAo?.ssao?.quality, 'medium'),
            options: [
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' }
            ],
            onChange: () => applyAoFromUi()
        });
        section.appendChild(ssaoQuality.row);

        const ssaoIntensity = makeNumberSliderRow({
            label: 'SSAO Intensity',
            value: clamp(initialAo?.ssao?.intensity, 0, 2, 0.35),
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: () => applyAoFromUi()
        });
        section.appendChild(ssaoIntensity.row);

        const ssaoRadius = makeNumberSliderRow({
            label: 'SSAO Radius',
            value: clamp(initialAo?.ssao?.radius, 0.1, 64, 8),
            min: 0.1,
            max: 64,
            step: 0.1,
            digits: 1,
            onChange: () => applyAoFromUi()
        });
        section.appendChild(ssaoRadius.row);

        const gtaoQuality = makeChoiceRow({
            label: 'GTAO Quality',
            value: sanitizeAoQuality(initialAo?.gtao?.quality, 'medium'),
            options: [
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' }
            ],
            onChange: () => applyAoFromUi()
        });
        section.appendChild(gtaoQuality.row);

        const gtaoIntensity = makeNumberSliderRow({
            label: 'GTAO Intensity',
            value: clamp(initialAo?.gtao?.intensity, 0, 2, 0.35),
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: () => applyAoFromUi()
        });
        section.appendChild(gtaoIntensity.row);

        const gtaoRadius = makeNumberSliderRow({
            label: 'GTAO Radius',
            value: clamp(initialAo?.gtao?.radius, 0.05, 8, 0.25),
            min: 0.05,
            max: 8,
            step: 0.01,
            digits: 2,
            onChange: () => applyAoFromUi()
        });
        section.appendChild(gtaoRadius.row);

        const gtaoDenoise = makeToggleRow({
            label: 'GTAO Denoise',
            value: initialAo?.gtao?.denoise !== false,
            onChange: () => applyAoFromUi()
        });
        section.appendChild(gtaoDenoise.row);

        const gtaoDebugView = makeToggleRow({
            label: 'GTAO Debug View',
            value: initialAo?.gtao?.debugView === true,
            onChange: () => applyAoFromUi()
        });
        section.appendChild(gtaoDebugView.row);

        body.appendChild(section);
        panel.appendChild(body);

        layer.appendChild(panel);
        document.body.appendChild(layer);

        const controls = {
            aoControl,
            aoAlphaHandling,
            aoAlphaThreshold,
            ssaoQuality,
            ssaoIntensity,
            ssaoRadius,
            gtaoQuality,
            gtaoIntensity,
            gtaoRadius,
            gtaoDenoise,
            gtaoDebugView
        };

        const setSliderValue = (control, value, digits = 2) => {
            if (!control?.range || !control?.number) return;
            const v = Number(value);
            if (!Number.isFinite(v)) return;
            control.range.value = String(v);
            control.number.value = String(v.toFixed(digits));
        };

        const syncAoControlValues = (settings) => {
            const s = this._sanitizeAmbientOcclusionSettings(settings);
            controls.aoControl?.setValue?.(sanitizeAoMode(s?.mode));
            controls.aoAlphaHandling?.setValue?.(s?.alpha?.handling === 'exclude' ? 'exclude' : 'alpha_test');
            setSliderValue(controls.aoAlphaThreshold, clamp(s?.alpha?.threshold, 0.01, 0.99, 0.5), 2);

            controls.ssaoQuality?.setValue?.(sanitizeAoQuality(s?.ssao?.quality, 'medium'));
            setSliderValue(controls.ssaoIntensity, clamp(s?.ssao?.intensity, 0, 2, 0.35), 2);
            setSliderValue(controls.ssaoRadius, clamp(s?.ssao?.radius, 0.1, 64, 8), 1);

            controls.gtaoQuality?.setValue?.(sanitizeAoQuality(s?.gtao?.quality, 'medium'));
            setSliderValue(controls.gtaoIntensity, clamp(s?.gtao?.intensity, 0, 2, 0.35), 2);
            setSliderValue(controls.gtaoRadius, clamp(s?.gtao?.radius, 0.05, 8, 0.25), 2);
            if (controls.gtaoDenoise?.toggle) controls.gtaoDenoise.toggle.checked = s?.gtao?.denoise !== false;
            if (controls.gtaoDebugView?.toggle) controls.gtaoDebugView.toggle.checked = s?.gtao?.debugView === true;
        };

        const syncAoControlVisibility = (settings) => {
            const s = this._sanitizeAmbientOcclusionSettings(settings);
            const mode = sanitizeAoMode(s?.mode);
            const aoOn = mode !== 'off';
            const alphaTestOn = s?.alpha?.handling !== 'exclude';

            const show = (row, visible) => row?.classList?.toggle('hidden', !visible);
            const setSliderDisabled = (control, disabled) => {
                if (!control) return;
                control.range.disabled = !!disabled;
                control.number.disabled = !!disabled;
            };

            show(controls.aoAlphaHandling?.row, aoOn);
            controls.aoAlphaHandling?.setDisabled?.(!aoOn);
            show(controls.aoAlphaThreshold?.row, aoOn && alphaTestOn);
            setSliderDisabled(controls.aoAlphaThreshold, !aoOn || !alphaTestOn);

            const showSsao = mode === 'ssao';
            show(controls.ssaoQuality?.row, showSsao);
            show(controls.ssaoIntensity?.row, showSsao);
            show(controls.ssaoRadius?.row, showSsao);
            controls.ssaoQuality?.setDisabled?.(!showSsao);
            setSliderDisabled(controls.ssaoIntensity, !showSsao);
            setSliderDisabled(controls.ssaoRadius, !showSsao);

            const showGtao = mode === 'gtao';
            show(controls.gtaoQuality?.row, showGtao);
            show(controls.gtaoIntensity?.row, showGtao);
            show(controls.gtaoRadius?.row, showGtao);
            show(controls.gtaoDenoise?.row, showGtao);
            show(controls.gtaoDebugView?.row, showGtao);
            controls.gtaoQuality?.setDisabled?.(!showGtao);
            setSliderDisabled(controls.gtaoIntensity, !showGtao);
            setSliderDisabled(controls.gtaoRadius, !showGtao);
            if (controls.gtaoDenoise?.toggle) controls.gtaoDenoise.toggle.disabled = !showGtao;
            if (controls.gtaoDebugView?.toggle) controls.gtaoDebugView.toggle.disabled = !showGtao;
        };

        const readAoFromControls = () => {
            const draft = this._buildAmbientOcclusionForMode(controls.aoControl?.getValue?.());
            draft.alpha.handling = controls.aoAlphaHandling?.getValue?.() === 'exclude' ? 'exclude' : 'alpha_test';
            draft.alpha.threshold = clamp(Number(controls.aoAlphaThreshold?.range?.value), 0.01, 0.99, draft.alpha.threshold);

            draft.ssao.quality = sanitizeAoQuality(controls.ssaoQuality?.getValue?.(), draft.ssao.quality);
            draft.ssao.intensity = clamp(Number(controls.ssaoIntensity?.range?.value), 0, 2, draft.ssao.intensity);
            draft.ssao.radius = clamp(Number(controls.ssaoRadius?.range?.value), 0.1, 64, draft.ssao.radius);

            draft.gtao.quality = sanitizeAoQuality(controls.gtaoQuality?.getValue?.(), draft.gtao.quality);
            draft.gtao.intensity = clamp(Number(controls.gtaoIntensity?.range?.value), 0, 2, draft.gtao.intensity);
            draft.gtao.radius = clamp(Number(controls.gtaoRadius?.range?.value), 0.05, 8, draft.gtao.radius);
            draft.gtao.denoise = !!controls.gtaoDenoise?.toggle?.checked;
            draft.gtao.debugView = !!controls.gtaoDebugView?.toggle?.checked;
            return this._sanitizeAmbientOcclusionSettings(draft);
        };

        const applyAoFromUi = () => {
            const draft = readAoFromControls();
            this._ambientOcclusionTemplate = deepClone(draft);
            this._pipeline?.setAmbientOcclusion?.(draft);
            syncAoControlVisibility(draft);
        };

        this._ambientOcclusionTemplate = deepClone(initialAo);
        syncAoControlValues(initialAo);
        syncAoControlVisibility(initialAo);

        this._ui = {
            layer,
            toneControl,
            aoControl,
            syncAoControls: (settings) => {
                const s = this._sanitizeAmbientOcclusionSettings(settings);
                this._ambientOcclusionTemplate = deepClone(s);
                syncAoControlValues(s);
                syncAoControlVisibility(s);
            }
        };
    }

    _unmountOptionsPanel() {
        this._ui?.layer?.remove?.();
        this._ui = null;
    }

    _syncSkyAndSun() {
        const sky = this._sky;
        const sun = this._sun;
        const hemi = this._hemi;
        const scene = this.scene;
        const atmo = this._atmosphere;
        const lighting = this._lighting;
        if (!sky || !sun || !hemi || !scene || !atmo || !lighting) return;

        hemi.intensity = clamp(lighting.hemiIntensity, 0, 5, 0.92);
        sun.intensity = clamp(lighting.sunIntensity, 0, 10, 1.64);

        const sunDir = azimuthElevationDegToDir(atmo?.sun?.azimuthDeg ?? 45, atmo?.sun?.elevationDeg ?? 35);
        sun.position.copy(sunDir).multiplyScalar(120);
        sun.target.position.set(0, 0, 0);
        sun.target.updateMatrixWorld?.();

        applyAtmosphereToSkyDome(sky, atmo, { sunDir: sun.position });

        sky.visible = shouldShowSkyDome({
            skyIblBackgroundMode: atmo?.sky?.iblBackgroundMode ?? 'ibl',
            lightingIblSetBackground: !!lighting?.ibl?.setBackground,
            sceneBackground: scene.background ?? null
        });
    }

    async _loadEnvironmentFromSettings() {
        if (!this.renderer || !this.scene) return;

        const seq = ++this._iblLoadSeq;
        const cfg = this._lighting?.ibl ?? null;
        const enabled = !!cfg?.enabled;
        const hdrUrl = typeof cfg?.hdrUrl === 'string' ? cfg.hdrUrl : '';

        if (!enabled || !hdrUrl) {
            applyIBLToScene(this.scene, null, { enabled: false, setBackground: false });
            this._syncSkyAndSun();
            return;
        }

        try {
            const envMap = await loadIBLTexture(this.renderer, {
                enabled: true,
                hdrUrl
            });
            if (seq !== this._iblLoadSeq || this._disposed || !this.scene) return;

            applyIBLToScene(this.scene, envMap, {
                enabled: true,
                setBackground: !!cfg?.setBackground,
                hdrUrl
            });
            applyIBLIntensity(this.scene, {
                enabled: true,
                envMapIntensity: clamp(cfg?.envMapIntensity, 0, 5, 0.3)
            }, { force: true });
        } catch (err) {
            if (seq !== this._iblLoadSeq || this._disposed || !this.scene) return;
            console.warn('[AO] Failed to load IBL environment map', err);
            applyIBLToScene(this.scene, null, { enabled: false, setBackground: false });
        }

        this._syncSkyAndSun();
    }

    async _initReproScene() {
        const scene = this.scene;
        if (!scene) return;

        const atmo = this._atmosphere;
        const sunDir = azimuthElevationDegToDir(atmo?.sun?.azimuthDeg ?? 45, atmo?.sun?.elevationDeg ?? 35);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x0b0f14, clamp(this._lighting?.hemiIntensity, 0, 5, 0.92));
        hemi.position.set(0, 1, 0);
        scene.add(hemi);
        this._hemi = hemi;

        const sun = new THREE.DirectionalLight(0xffffff, clamp(this._lighting?.sunIntensity, 0, 10, 1.64));
        sun.position.copy(sunDir).multiplyScalar(120);
        sun.castShadow = true;
        sun.shadow.mapSize.set(4096, 4096);
        sun.shadow.radius = 1;
        sun.shadow.bias = -0.0002;
        sun.shadow.normalBias = 0.035;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 320;
        sun.shadow.camera.left = -30;
        sun.shadow.camera.right = 30;
        sun.shadow.camera.top = 30;
        sun.shadow.camera.bottom = -30;
        scene.add(sun.target);
        scene.add(sun);
        this._sun = sun;

        const sky = createGradientSkyDome({
            radius: 420,
            atmosphere: atmo,
            sunDir,
            sunIntensity: 0.28
        });
        scene.add(sky);
        this._sky = sky;

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(28, 28),
            new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 1.0, metalness: 0.0 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, 0, 0);
        ground.receiveShadow = true;
        scene.add(ground);

        const backBox = new THREE.Mesh(
            new THREE.BoxGeometry(9.5, 5.5, 0.22),
            new THREE.MeshStandardMaterial({ color: 0xd7e0eb, roughness: 0.85, metalness: 0.0 })
        );
        backBox.position.set(0, 2.2, -4.5);
        backBox.castShadow = true;
        backBox.receiveShadow = true;
        scene.add(backBox);

        const square = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 1.4, 0.14),
            new THREE.MeshStandardMaterial({ color: 0x8ea2b7, roughness: 0.58, metalness: 0.05 })
        );
        square.position.set(-2.2, 1.1, -2.4);
        square.rotation.y = Math.PI * 0.15;
        square.castShadow = true;
        square.receiveShadow = true;
        scene.add(square);

        const ball = new THREE.Mesh(
            new THREE.SphereGeometry(0.62, 40, 24),
            new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.42, metalness: 0.08 })
        );
        ball.position.set(2.1, 0.63, -2.0);
        ball.castShadow = true;
        ball.receiveShadow = true;
        scene.add(ball);

        await this._addGameplayTreeFoliage();

        this._reproState.samplePointsWorld = {
            wallOpaque: new THREE.Vector3(-0.55, 2.0, -4.5),
            wallEdge: new THREE.Vector3(-0.18, 2.0, -4.5),
            wallTransparent: new THREE.Vector3(0.55, 2.0, -4.5),
            wallReference: new THREE.Vector3(2.25, 2.0, -4.5)
        };

        this._syncSkyAndSun();
    }

    async _addGameplayTreeFoliage() {
        if (!this.scene) return;

        let leafWidth = 0;
        let leafHeight = 0;

        try {
            const assets = await loadTreeTemplates('desktop');
            const templates = Array.isArray(assets?.templates) ? assets.templates : [];
            const leafMaterial = assets?.materials?.leaf ?? null;
            leafWidth = Number(leafMaterial?.map?.image?.width) || 0;
            leafHeight = Number(leafMaterial?.map?.image?.height) || 0;

            if (!templates.length) {
                this._reproState.leafTexture = { width: leafWidth, height: leafHeight };
                return;
            }

            const group = new THREE.Group();
            group.name = 'AoGameplayTrees';

            const placements = [
                { x: -0.4, z: -3.8, yaw: Math.PI * 0.06, scaleVar: 0.98, variant: 0 },
                { x: 1.6, z: -3.95, yaw: -Math.PI * 0.14, scaleVar: 0.9, variant: 1 }
            ];
            const targetHeight = 5.8;

            for (const placement of placements) {
                const template = templates[((placement.variant % templates.length) + templates.length) % templates.length];
                if (!template) continue;

                const tree = template.clone(true);
                this._applyGameplayFoliageMaterialRules(tree);
                const baseY = Number.isFinite(template?.userData?.treeBaseY) ? template.userData.treeBaseY : 0;
                const baseHeight = Number.isFinite(template?.userData?.treeHeight) ? template.userData.treeHeight : 1;
                const baseScale = targetHeight / Math.max(0.001, baseHeight);
                const scale = baseScale * placement.scaleVar;

                tree.scale.setScalar(scale);
                tree.position.set(0, -baseY * scale, 0);

                const wrapper = new THREE.Group();
                wrapper.position.set(placement.x, 0, placement.z);
                wrapper.rotation.y = placement.yaw;
                wrapper.add(tree);
                group.add(wrapper);
            }

            this.scene.add(group);
        } catch (err) {
            console.warn('[AO] Failed to load gameplay tree templates for AO scene.', err);
        }

        this._reproState.leafTexture = {
            width: leafWidth,
            height: leafHeight
        };
    }

    _applyGameplayFoliageMaterialRules(root) {
        const group = root ?? null;
        if (!group?.traverse) return;

        group.traverse((obj) => {
            if (!obj?.isMesh) return;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            if (!mats.length) return;
            let anyFoliage = false;

            const next = mats.map((material) => {
                if (!material?.isMaterial) return material;
                const mat = material.clone?.() ?? material;
                const alphaSignals = (Number(mat.alphaTest) || 0) > 1e-6
                    || mat.transparent === true
                    || !!mat.alphaMap
                    || (Number.isFinite(mat.opacity) && Number(mat.opacity) < 0.999);
                const flagged = mat.userData?.isFoliage === true;
                const likely = flagged || alphaSignals || isLikelyFoliageName(mat.name) || isLikelyFoliageName(obj.name);
                if (!likely) return mat;
                anyFoliage = true;

                const userData = mat.userData && typeof mat.userData === 'object' ? { ...mat.userData } : {};
                userData.isFoliage = true;
                userData.preserveShadowSide = true;

                const existingAoAlpha = userData.aoAlphaMap?.isTexture ? userData.aoAlphaMap : null;
                if (!existingAoAlpha) {
                    const createdAoAlpha = createAoAlphaMapFromTextureAlpha(mat.map);
                    if (createdAoAlpha) {
                        userData.aoAlphaMap = createdAoAlpha;
                        this._ownedTextures.add(createdAoAlpha);
                    }
                }

                mat.userData = userData;
                mat.transparent = false;
                mat.depthWrite = true;
                mat.alphaTest = Math.max(0.5, Number(mat.alphaTest) || 0);
                mat.side = THREE.DoubleSide;
                mat.shadowSide = THREE.DoubleSide;
                if ('alphaToCoverage' in mat) mat.alphaToCoverage = true;
                return mat;
            });

            obj.material = Array.isArray(obj.material) ? next : next[0];
            obj.userData.isFoliage = anyFoliage;
            obj.castShadow = true;
            obj.receiveShadow = true;
        });
    }

    setAmbientOcclusionForTest(ambientOcclusion) {
        const next = this._sanitizeAmbientOcclusionSettings(
            ambientOcclusion ?? this._pipeline?.getAmbientOcclusion?.() ?? this._buildAmbientOcclusionForMode('off')
        );
        this._ambientOcclusionTemplate = deepClone(next);
        this._pipeline?.setAmbientOcclusion?.(next);
        this._ui?.syncAoControls?.(next);
    }

    getAmbientOcclusionForTest() {
        return this._pipeline?.getAmbientOcclusion?.() ?? null;
    }

    getReproInfoForTest() {
        const points = this._reproState?.samplePointsWorld ?? null;
        const projected = {};
        if (points && this.camera) {
            for (const [id, p] of Object.entries(points)) {
                const v = p.clone().project(this.camera);
                const onScreen = v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1 && v.z >= -1 && v.z <= 1;
                projected[id] = {
                    u: (v.x + 1) * 0.5,
                    v: (1 - v.y) * 0.5,
                    zNdc: v.z,
                    onScreen
                };
            }
        }
        return {
            leafTexture: this._reproState?.leafTexture ?? null,
            samplePoints: projected
        };
    }

    getAoOverrideDebugInfoForTest() {
        return this._pipeline?.getAoOverrideDebugInfo?.() ?? { count: 0, materials: [] };
    }
}
