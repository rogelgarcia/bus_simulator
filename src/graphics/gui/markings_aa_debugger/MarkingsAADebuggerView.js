// src/graphics/gui/markings_aa_debugger/MarkingsAADebuggerView.js
// Dedicated scene for evaluating road markings AA + occlusion behavior.
// @ts-check

import * as THREE from 'three';
import { createToolCameraController } from '../../engine3d/camera/ToolCameraPrefab.js';
import { City } from '../../visuals/city/City.js';
import { createCityConfig } from '../../../app/city/CityConfig.js';
import { CityRNG } from '../../../app/city/CityRNG.js';
import { PostProcessingPipeline } from '../../visuals/postprocessing/PostProcessingPipeline.js';
import { ANTIALIASING_DEFAULTS, getResolvedAntiAliasingSettings, sanitizeAntiAliasingSettings } from '../../visuals/postprocessing/AntiAliasingSettings.js';
import { getResolvedLightingSettings } from '../../lighting/LightingSettings.js';
import { getResolvedAtmosphereSettings } from '../../visuals/atmosphere/AtmosphereSettings.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { createMarkingsAAblitShaderPayload, createMarkingsAAMarkingsShaderPayload, createMarkingsAACompositeShaderPayload, createMarkingsAADepthShaderPayload, createMarkingsAAOccluderShaderPayload } from '../../shaders/diagnostics/MarkingsAADebuggerShader.js';
import { getOrCreateGpuFrameTimer } from '../../engine3d/perf/GpuFrameTimer.js';
import { MarkingsAADebuggerUI } from './MarkingsAADebuggerUI.js';
import { MARKINGS_AA_DEBUGGER_DEFAULTS, sanitizeMarkingsAADebuggerSettings } from './MarkingsAADebuggerSettings.js';

const EPS = 1e-6;
const UP = new THREE.Vector3(0, 1, 0);
const LINEAR_COLORSPACE = THREE.LinearSRGBColorSpace ?? THREE.NoColorSpace;

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function getCanvasSizePx(canvas, pixelRatio) {
    const rect = canvas?.getBoundingClientRect?.() ?? null;
    const wCss = Math.max(1, Math.floor(Number(rect?.width) || 1));
    const hCss = Math.max(1, Math.floor(Number(rect?.height) || 1));
    const pr = Math.max(0.1, Number(pixelRatio) || 1);
    return {
        cssW: wCss,
        cssH: hCss,
        pr,
        pxW: Math.max(1, Math.floor(wCss * pr)),
        pxH: Math.max(1, Math.floor(hCss * pr))
    };
}

function makeCrossingRoadSpec({ config, seed }) {
    const tileSize = config.map.tileSize;
    const origin = config.map.origin;
    const toWorld = ([x, y]) => ({ x: origin.x + (x | 0) * tileSize, z: origin.z + (y | 0) * tileSize });

    return {
        version: 1,
        seed,
        width: config.map.width,
        height: config.map.height,
        tileSize,
        origin,
        roads: [
            {
                points: [toWorld([1, 4]), toWorld([7, 4])],
                lanesF: 2,
                lanesB: 2,
                tag: 'x_2p2'
            },
            {
                points: [toWorld([4, 1]), toWorld([4, 7])],
                lanesF: 3,
                lanesB: 3,
                tag: 'y_3p3'
            }
        ],
        buildings: []
    };
}

function createCheckerTexture({
    size = 32,
    cells = 8,
    colorA = [235, 246, 255],
    colorB = [24, 28, 34]
} = {}) {
    const n = Math.max(2, Math.floor(Number(size) || 32));
    const c = Math.max(2, Math.floor(Number(cells) || 8));
    const data = new Uint8Array(n * n * 4);

    const a = Array.isArray(colorA) ? colorA : [255, 255, 255];
    const b = Array.isArray(colorB) ? colorB : [0, 0, 0];

    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const cx = Math.floor((x / n) * c);
            const cy = Math.floor((y / n) * c);
            const isA = ((cx + cy) % 2) === 0;
            const base = (y * n + x) * 4;
            data[base] = isA ? a[0] : b[0];
            data[base + 1] = isA ? a[1] : b[1];
            data[base + 2] = isA ? a[2] : b[2];
            data[base + 3] = 255;
        }
    }

    const tex = new THREE.DataTexture(data, n, n);
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    applyTextureColorSpace(tex, { srgb: true });
    return tex;
}

function normalizeHexColor(value, fallback) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return fallback;
    const v = raw.startsWith('#') ? raw.slice(1) : (raw.toLowerCase().startsWith('0x') ? raw.slice(2) : raw);
    if (v.length === 3 && /^[0-9a-fA-F]{3}$/.test(v)) {
        const r = v[0];
        const g = v[1];
        const b = v[2];
        return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    if (v.length === 6 && /^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`.toUpperCase();
    return fallback;
}

function buildAaModeOptions() {
    const modes = ['off'];
    for (const key of Object.keys(ANTIALIASING_DEFAULTS ?? {})) {
        if (key === 'mode') continue;
        const value = ANTIALIASING_DEFAULTS[key];
        if (!value || typeof value !== 'object') continue;
        modes.push(key);
    }

    const labelFor = (id) => {
        if (id === 'off') return 'Off';
        return String(id).toUpperCase();
    };

    return modes.map((id) => ({ id, label: labelFor(id) }));
}

function makeFullscreenQuad() {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { scene, camera, mesh, geo };
}

function createMarkingsOcclusionMaterial({ colorHex = 0xffffff } = {}) {
    const payload = createMarkingsAAOccluderShaderPayload({
        uniforms: {
            uColor: new THREE.Color(colorHex),
            uDepthTex: null,
            uInvSize: [1, 1],
            cameraNear: 0.1,
            cameraFar: 500.0,
            uBiasMeters: 0.02
        }
    });

    const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(payload.uniforms),
        vertexShader: payload.vertexSource,
        fragmentShader: payload.fragmentSource,
        depthWrite: false,
        depthTest: false,
        transparent: true,
        toneMapped: false
    });
    attachShaderMetadata(mat, payload, 'markings-aa-occluder');
    return mat;
}

export class MarkingsAADebuggerView {
    constructor({ canvas } = {}) {
        this.canvas = canvas;

        this.onFrame = null;

        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this._gpuFrameTimer = null;

        this._engine = null;
        this._pipeline = null;

        this._city = null;
        this._sourceMarkings = [];
        this._occluders = null;
        this._checkerTex = null;
        this._occluderMaterials = [];
        this._unitBoxGeo = null;
        this._unitCylGeo = null;

        this._ui = null;
        this._settings = null;
        this._antiAliasing = null;

        this._sceneTarget = null;
        this._depthTarget = null;
        this._markingsTarget = null;
        this._depthOverrideMaterial = null;

        this._markingsScene = null;
        this._markingsMeshes = [];
        this._markingsWhiteMat = null;
        this._markingsYellowMat = null;
        this._tmpInvSize = new THREE.Vector2(1, 1);

        this._screen = null;
        this._screenMaterials = {};

        this._raf = 0;
        this._lastT = 0;

        this._keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            ShiftLeft: false,
            ShiftRight: false
        };

        this._onResize = () => this._resize();
        this._onKeyDown = (e) => this._handleKey(e, true);
        this._onKeyUp = (e) => this._handleKey(e, false);
    }

    async start() {
        if (!this.canvas) throw new Error('[MarkingsAADebugger] Missing canvas');
        if (this.renderer) return;

        if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;

        const renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });

        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
        else renderer.outputEncoding = THREE.sRGBEncoding;
        if ('useLegacyLights' in renderer) renderer.useLegacyLights = true;

        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;

        this.renderer = renderer;
        this._gpuFrameTimer = getOrCreateGpuFrameTimer(renderer);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);

        const lighting = getResolvedLightingSettings({ includeUrlOverrides: true });
        renderer.toneMappingExposure = lighting?.exposure ?? 1.6;

        const atmosphere = getResolvedAtmosphereSettings({ includeUrlOverrides: true });
        this._engine = {
            scene: this.scene,
            camera: this.camera,
            lightingSettings: lighting,
            atmosphereSettings: atmosphere,
            context: {}
        };

        const citySeed = 'markings-aa-map';
        const cfg = createCityConfig({ size: 220, tileMeters: 2, mapTileSize: 24, seed: citySeed });
        const mapSpec = makeCrossingRoadSpec({ config: cfg, seed: citySeed });
        const city = new City({
            size: 220,
            tileMeters: 2,
            mapTileSize: 24,
            seed: citySeed,
            mapSpec,
            generatorConfig: { render: { treesEnabled: false } }
        });
        this._city = city;
        city.attach(this._engine);
        this._engine.context.city = city;

        this._occluders = new THREE.Group();
        this._occluders.name = 'MarkingsAADebuggerOccluders';
        this.scene.add(this._occluders);

        this._checkerTex = createCheckerTexture();
        this._occluderMaterials = [
            new THREE.MeshStandardMaterial({ map: this._checkerTex, roughness: 0.6, metalness: 0.0, color: 0xffffff }),
            new THREE.MeshStandardMaterial({ map: this._checkerTex, roughness: 0.25, metalness: 0.0, color: 0x6ed6ff }),
            new THREE.MeshStandardMaterial({ map: this._checkerTex, roughness: 0.35, metalness: 0.0, color: 0xffd36e })
        ];
        for (const mat of this._occluderMaterials) {
            if (mat.map) mat.map.repeat.set(2, 2);
        }

        this._unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
        this._unitCylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1);

        this._depthOverrideMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.BasicDepthPacking,
            side: THREE.DoubleSide
        });
        this._depthOverrideMaterial.blending = THREE.NoBlending;
        this._depthOverrideMaterial.toneMapped = false;

        const initialSettings = sanitizeMarkingsAADebuggerSettings(MARKINGS_AA_DEBUGGER_DEFAULTS);
        const initialAa = sanitizeAntiAliasingSettings(getResolvedAntiAliasingSettings({ includeUrlOverrides: true }));
        this._settings = initialSettings;
        this._antiAliasing = initialAa;

        this._ui = new MarkingsAADebuggerUI({
            initialSettings,
            initialAntiAliasing: initialAa,
            aaModeOptions: buildAaModeOptions(),
            onChange: (payload) => this._applyUiPayload(payload),
            onReroll: () => this._rerollSeed()
        });
        this._ui.mount();

        this.controls = createToolCameraController(this.camera, this.canvas, {
            uiRoot: this._ui.root,
            enabled: true,
            enableDamping: true,
            dampingFactor: 0.08,
            rotateSpeed: 0.9,
            panSpeed: 0.85,
            zoomSpeed: 1.0,
            minDistance: 0.25,
            maxDistance: 900,
            minPolarAngle: 0.001,
            maxPolarAngle: Math.PI - 0.001,
            getFocusTarget: () => ({ center: new THREE.Vector3(0, 0, 0), radius: 90 }),
            initialPose: {
                position: new THREE.Vector3(0, 4, 135),
                target: new THREE.Vector3(0, 0.5, 0)
            }
        });

        this._pipeline = new PostProcessingPipeline({
            renderer,
            scene: this.scene,
            camera: this.camera,
            bloom: { enabled: false },
            sunBloom: { enabled: false },
            colorGrading: null,
            antiAliasing: initialAa
        });
        if (this._pipeline?.composer) this._pipeline.composer.renderToScreen = false;

        this._initMarkingsScene();
        this._initScreenQuad();
        this._rebuildOccluders();

        window.addEventListener('resize', this._onResize, { passive: true });
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: false });

        this._resize();
        this._lastT = performance.now();
        this._raf = requestAnimationFrame((t) => this._tick(t));
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;

        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);

        this.controls?.dispose?.();
        this.controls = null;

        this._ui?.destroy?.();
        this._ui = null;

        this._markingsMeshes.length = 0;
        this._markingsScene = null;
        this._markingsWhiteMat?.dispose?.();
        this._markingsYellowMat?.dispose?.();
        this._markingsWhiteMat = null;
        this._markingsYellowMat = null;

        if (this._screen) {
            this._screen.geo?.dispose?.();
        }
        for (const mat of Object.values(this._screenMaterials)) mat?.dispose?.();
        this._screenMaterials = {};
        this._screen = null;

        this._sceneTarget?.dispose?.();
        this._sceneTarget = null;
        this._depthTarget?.dispose?.();
        this._depthTarget = null;
        this._markingsTarget?.dispose?.();
        this._markingsTarget = null;

        this._pipeline?.dispose?.();
        this._pipeline = null;

        if (this._occluders) {
            this.scene?.remove?.(this._occluders);
            this._occluders = null;
        }
        for (const mat of this._occluderMaterials) mat?.dispose?.();
        this._occluderMaterials.length = 0;
        this._unitBoxGeo?.dispose?.();
        this._unitBoxGeo = null;
        this._unitCylGeo?.dispose?.();
        this._unitCylGeo = null;
        this._depthOverrideMaterial?.dispose?.();
        this._depthOverrideMaterial = null;
        this._checkerTex?.dispose?.();
        this._checkerTex = null;

        if (this._city && this._engine) this._city.detach(this._engine);
        this._city = null;
        this._engine = null;

        this.scene = null;
        this.camera = null;

        this.renderer?.dispose?.();
        this.renderer = null;
        this._gpuFrameTimer = null;
    }

    _handleKey(e, down) {
        if (!e) return;
        const code = e.code;
        if (!code || !(code in this._keys)) return;
        const isEditable = isInteractiveElement(e.target) || isInteractiveElement(document.activeElement);
        if (isEditable) return;
        e.preventDefault();
        this._keys[code] = !!down;
    }

    _applyUiPayload(payload) {
        const nextSettings = sanitizeMarkingsAADebuggerSettings(payload?.settings ?? null);
        const nextAa = sanitizeAntiAliasingSettings(payload?.antiAliasing ?? null);

        const prevSeed = this._settings?.seed ?? '';
        const seedChanged = nextSettings.seed !== prevSeed;
        const rawSeed = typeof payload?.settings?.seed === 'string' ? payload.settings.seed.trim() : '';
        if (rawSeed !== nextSettings.seed) this._ui?.setDraft?.({ settings: { seed: nextSettings.seed } });

        const prevScale = this._settings?.markingsBufferScale ?? 1;
        const prevSamples = this._settings?.markingsBufferSamples ?? 0;
        const targetChanged = Math.abs(prevScale - nextSettings.markingsBufferScale) > EPS || prevSamples !== nextSettings.markingsBufferSamples;

        this._settings = nextSettings;
        this._antiAliasing = nextAa;
        this._pipeline?.setAntiAliasing?.(nextAa);

        if (seedChanged) this._rebuildOccluders();
        if (targetChanged) this._ensureTargets();
    }

    _rerollSeed() {
        const next = `seed-${Math.random().toString(16).slice(2, 8)}-${Date.now().toString(16).slice(-4)}`;
        this._settings = sanitizeMarkingsAADebuggerSettings({ ...(this._settings ?? {}), seed: next });
        this._ui?.setDraft?.({ settings: { seed: next } });
        this._rebuildOccluders();
    }

    _resize() {
        if (!this.renderer || !this.camera || !this.canvas) return;
        const { cssW, cssH } = getCanvasSizePx(this.canvas, this.renderer.getPixelRatio?.() ?? 1);
        this.renderer.setSize(cssW, cssH, false);
        this.camera.aspect = cssW / Math.max(1, cssH);
        this.camera.updateProjectionMatrix();

        const pr = this.renderer.getPixelRatio?.() ?? 1;
        this._pipeline?.setPixelRatio?.(pr);
        this._pipeline?.setSize?.(cssW, cssH);

        this._ensureTargets();
    }

    _ensureTargets() {
        if (!this.renderer || !this.canvas) return;

        const size = getCanvasSizePx(this.canvas, this.renderer.getPixelRatio?.() ?? 1);
        const pxW = size.pxW;
        const pxH = size.pxH;

        if (!this._sceneTarget) {
            this._sceneTarget = new THREE.WebGLRenderTarget(pxW, pxH, {
                depthBuffer: true,
                stencilBuffer: false
            });
            if (this._sceneTarget?.texture && 'colorSpace' in this._sceneTarget.texture) this._sceneTarget.texture.colorSpace = LINEAR_COLORSPACE;
        } else {
            this._sceneTarget.setSize(pxW, pxH);
        }

        const scale = clamp(this._settings?.markingsBufferScale, 1, 4, 2);
        const maxDim = 8192;
        const markW = Math.max(1, Math.min(maxDim, Math.floor(pxW * scale)));
        const markH = Math.max(1, Math.min(maxDim, Math.floor(pxH * scale)));

        if (!this._depthTarget) {
            const depthTexture = new THREE.DepthTexture(markW, markH);
            this._depthTarget = new THREE.WebGLRenderTarget(markW, markH, {
                depthTexture,
                depthBuffer: true,
                stencilBuffer: false
            });
        } else {
            this._depthTarget.setSize(markW, markH);
        }

        if (!this._markingsTarget) {
            this._markingsTarget = new THREE.WebGLRenderTarget(markW, markH, {
                depthBuffer: true,
                stencilBuffer: false
            });
            if (this._markingsTarget?.texture && 'colorSpace' in this._markingsTarget.texture) this._markingsTarget.texture.colorSpace = LINEAR_COLORSPACE;
        } else {
            this._markingsTarget.setSize(markW, markH);
        }

        const requestedSamples = Math.max(0, Math.floor(Number(this._settings?.markingsBufferSamples) || 0));
        const maxSamples = Number.isFinite(this.renderer?.capabilities?.maxSamples) ? Number(this.renderer.capabilities.maxSamples) : 0;
        const supported = !!this.renderer?.capabilities?.isWebGL2 && maxSamples > 0;
        const effectiveSamples = supported ? Math.min(requestedSamples, maxSamples) : 0;
        const prevSamples = Math.max(0, Math.floor(Number(this._markingsTarget.samples) || 0));
        if (prevSamples !== effectiveSamples) {
            this._markingsTarget.samples = effectiveSamples;
            this._markingsTarget.dispose?.();
        }

        const inv = this._markingsWhiteMat?.uniforms?.uInvSize?.value ?? null;
        if (inv?.set) inv.set(1 / markW, 1 / markH);
        const inv2 = this._markingsYellowMat?.uniforms?.uInvSize?.value ?? null;
        if (inv2?.set) inv2.set(1 / markW, 1 / markH);

        const resolutionText = `${size.cssW}×${size.cssH} (${pxW}×${pxH})`;
        const pixelRatioText = `${size.pr.toFixed(2)}`;
        const markingsText = `${markW}×${markH} · scale ${scale.toFixed(2)} · MSAA ${effectiveSamples || 0}×`;
        this._ui?.setInfo?.({ resolutionText, pixelRatioText, markingsText });
    }

    _tick(t) {
        if (!this.renderer || !this.scene || !this.camera) return;

        const dt = Math.min((t - this._lastT) / 1000, 0.05);
        this._lastT = t;

        this._applyArrowKeyPan(dt);
        this.controls?.update?.(dt);
        this._city?.update?.(this._engine);

        const gpuTimer = this._gpuFrameTimer;
        gpuTimer?.beginFrame?.();
        try {
            this._render(dt);
        } finally {
            gpuTimer?.endFrame?.();
            gpuTimer?.poll?.();
        }
        this.onFrame?.({ dt, nowMs: t, renderer: this.renderer });

        this._raf = requestAnimationFrame((tt) => this._tick(tt));
    }

    _applyArrowKeyPan(dt) {
        const controls = this.controls;
        if (!controls?.panWorld) return;

        const speed = (this._keys.ShiftLeft || this._keys.ShiftRight) ? 32 : 14;
        const dx = (this._keys.ArrowRight ? 1 : 0) - (this._keys.ArrowLeft ? 1 : 0);
        const dz = (this._keys.ArrowDown ? 1 : 0) - (this._keys.ArrowUp ? 1 : 0);
        if (!dx && !dz) return;
        const len = Math.hypot(dx, dz);
        if (!(len > EPS)) return;
        const inv = 1 / len;
        controls.panWorld(dx * inv * speed * dt, 0, dz * inv * speed * dt);
    }

    _initScreenQuad() {
        const screen = makeFullscreenQuad();
        this._screen = screen;

        const mkMat = (payload, label) => {
            const mat = new THREE.ShaderMaterial({
                uniforms: THREE.UniformsUtils.clone(payload.uniforms),
                vertexShader: payload.vertexSource,
                fragmentShader: payload.fragmentSource,
                depthTest: false,
                depthWrite: false,
                toneMapped: false,
                transparent: false
            });
            attachShaderMetadata(mat, payload, label);
            return mat;
        };

        this._screenMaterials.blit = mkMat(createMarkingsAAblitShaderPayload(), 'markings-aa-blit');
        this._screenMaterials.depth = mkMat(createMarkingsAADepthShaderPayload(), 'markings-aa-depth');
        this._screenMaterials.markings = mkMat(createMarkingsAAMarkingsShaderPayload({ uBgColor: [0.165, 0.184, 0.211 ] }), 'markings-aa-markings');
        this._screenMaterials.composite = mkMat(createMarkingsAACompositeShaderPayload(), 'markings-aa-composite');
    }

    _initMarkingsScene() {
        const city = this._city ?? null;
        const roads = city?.roads ?? null;
        if (!roads?.group) return;
        roads.group.updateMatrixWorld?.(true);

        const names = ['MarkingsWhite', 'MarkingsYellow', 'Crosswalks', 'LaneArrows'];
        const sources = [];
        for (const name of names) {
            const obj = roads.group.getObjectByName(name) ?? null;
            if (obj && obj.isMesh && obj.geometry) sources.push(obj);
        }

        this._sourceMarkings = sources;

        const markingsScene = new THREE.Scene();
        this._markingsScene = markingsScene;

        this._markingsWhiteMat = createMarkingsOcclusionMaterial({ colorHex: 0xffffff });
        this._markingsYellowMat = createMarkingsOcclusionMaterial({ colorHex: 0xffd200 });

        const pickMaterial = (name) => {
            if (name === 'MarkingsYellow') return this._markingsYellowMat;
            return this._markingsWhiteMat;
        };

        for (const src of sources) {
            const mat = pickMaterial(src.name);
            const mesh = new THREE.Mesh(src.geometry, mat);
            mesh.name = `${src.name}_Buffer`;
            mesh.matrixAutoUpdate = false;
            mesh.matrix.copy(src.matrixWorld);
            markingsScene.add(mesh);
            this._markingsMeshes.push(mesh);
        }
    }

    _setSourceMarkingsVisible(visible) {
        const v = !!visible;
        for (const mesh of this._sourceMarkings) {
            if (mesh) mesh.visible = v;
        }
    }

    _rebuildOccluders() {
        if (!this._occluders) return;
        while (this._occluders.children.length) this._occluders.remove(this._occluders.children[0]);

        const seed = String(this._settings?.seed ?? 'seed');
        const rng = new CityRNG(seed);

        const tileSize = this._city?.map?.tileSize ?? 24;
        const baseY = (this._city?.roads?.debug?.groundY ?? this._city?.roads?.debug?.asphaltY ?? 0.02);
        const bounds = {
            min: -(tileSize * 4.5),
            max: tileSize * 4.5
        };

        const laneWidth = 4.8;
        const hHalfW = (laneWidth * 4) * 0.55;
        const vHalfW = (laneWidth * 6) * 0.55;

        const count = Math.max(0, Math.trunc(this._settings?.occluderCount ?? 22));
        const unitBox = this._unitBoxGeo ?? new THREE.BoxGeometry(1, 1, 1);
        const unitCyl = this._unitCylGeo ?? new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1);

        for (let i = 0; i < count; i++) {
            const isOnHorizontal = rng.chance(0.55);
            const isCylinder = rng.chance(0.35);

            const along = rng.range(bounds.min * 0.9, bounds.max * 0.9);
            const lateral = isOnHorizontal
                ? rng.range(-hHalfW, hHalfW)
                : rng.range(-vHalfW, vHalfW);

            const x = isOnHorizontal ? along : lateral;
            const z = isOnHorizontal ? lateral : along;

            const w = rng.range(1.0, 4.0);
            const d = rng.range(1.0, 4.0);
            const h = rng.range(1.5, 10.0);

            const geo = isCylinder ? unitCyl : unitBox;
            const mat = this._occluderMaterials[rng.int(this._occluderMaterials.length)] ?? this._occluderMaterials[0];
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, baseY + h * 0.5, z);
            mesh.rotation.y = rng.range(0, Math.PI * 2);
            mesh.scale.set(w, h, d);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this._occluders.add(mesh);
        }
    }

    _render(dt) {
        const viewMode = String(this._settings?.viewMode ?? 'normal');
        const aaMode = String(this._antiAliasing?.mode ?? 'off');
        const activeAaMode = this._pipeline?.getDebugInfo?.()?.antiAliasing?.mode ?? 'off';

        if (!this.renderer || !this.camera || !this.scene || !this._screen) return;
        if (!this._depthTarget || !this._markingsTarget) this._ensureTargets();

        const screen = this._screen;
        const renderer = this.renderer;

        const renderSceneToTexture = ({ includeMarkings }) => {
            this._setSourceMarkingsVisible(!!includeMarkings);

            if (aaMode === 'off' || activeAaMode === 'off') {
                renderer.setRenderTarget(this._sceneTarget);
                renderer.setClearColor(0x0b0f14, 1);
                renderer.clear(true, true, true);
                renderer.render(this.scene, this.camera);
                renderer.setRenderTarget(null);
                return this._sceneTarget?.texture ?? null;
            }

            this._pipeline?.render?.(dt);
            return this._pipeline?.composer?.readBuffer?.texture ?? null;
        };

        const renderDepth = () => {
            const depthTarget = this._depthTarget ?? null;
            if (!depthTarget?.depthTexture) return null;
            const depthMat = this._depthOverrideMaterial ?? null;
            if (!depthMat) return null;

            const prevOverride = this.scene.overrideMaterial ?? null;
            this._setSourceMarkingsVisible(false);

            this.scene.overrideMaterial = depthMat;
            renderer.setRenderTarget(depthTarget);
            renderer.setClearColor(0xffffff, 1);
            renderer.clear(true, true, true);
            renderer.render(this.scene, this.camera);
            renderer.setRenderTarget(null);
            this.scene.overrideMaterial = prevOverride;
            return depthTarget.depthTexture;
        };

        const renderMarkingsBuffer = () => {
            const depthTex = this._depthTarget?.depthTexture ?? null;
            if (!depthTex || !this._markingsScene) return null;

            const markTarget = this._markingsTarget ?? null;
            if (!markTarget) return null;

            const w = markTarget.width || 1;
            const h = markTarget.height || 1;
            const inv = this._tmpInvSize;
            inv.set(1 / w, 1 / h);
            const near = this.camera.near;
            const far = this.camera.far;
            const biasMeters = Number(this._settings?.markingsOcclusionBiasMeters ?? 0.02);
            if (this._markingsWhiteMat?.uniforms?.uDepthTex) this._markingsWhiteMat.uniforms.uDepthTex.value = depthTex;
            if (this._markingsYellowMat?.uniforms?.uDepthTex) this._markingsYellowMat.uniforms.uDepthTex.value = depthTex;
            if (this._markingsWhiteMat?.uniforms?.uInvSize) this._markingsWhiteMat.uniforms.uInvSize.value.copy(inv);
            if (this._markingsYellowMat?.uniforms?.uInvSize) this._markingsYellowMat.uniforms.uInvSize.value.copy(inv);
            if (this._markingsWhiteMat?.uniforms?.cameraNear) this._markingsWhiteMat.uniforms.cameraNear.value = near;
            if (this._markingsYellowMat?.uniforms?.cameraNear) this._markingsYellowMat.uniforms.cameraNear.value = near;
            if (this._markingsWhiteMat?.uniforms?.cameraFar) this._markingsWhiteMat.uniforms.cameraFar.value = far;
            if (this._markingsYellowMat?.uniforms?.cameraFar) this._markingsYellowMat.uniforms.cameraFar.value = far;
            if (this._markingsWhiteMat?.uniforms?.uBiasMeters) this._markingsWhiteMat.uniforms.uBiasMeters.value = biasMeters;
            if (this._markingsYellowMat?.uniforms?.uBiasMeters) this._markingsYellowMat.uniforms.uBiasMeters.value = biasMeters;

            renderer.setRenderTarget(markTarget);
            renderer.setClearColor(0x000000, 0);
            renderer.clear(true, true, true);
            renderer.render(this._markingsScene, this.camera);
            renderer.setRenderTarget(null);
            return markTarget.texture ?? null;
        };

        const blitToScreen = (mat, { tDiffuse = null } = {}) => {
            screen.mesh.material = mat;
            if (mat?.uniforms?.tDiffuse) mat.uniforms.tDiffuse.value = tDiffuse ?? null;
            renderer.setRenderTarget(null);
            renderer.clear(true, true, true);
            renderer.render(screen.scene, screen.camera);
        };

        if (viewMode === 'depth') {
            const depthTex = renderDepth();
            const mat = this._screenMaterials.depth;
            if (mat?.uniforms?.tDepth) mat.uniforms.tDepth.value = depthTex;
            if (mat?.uniforms?.cameraNear) mat.uniforms.cameraNear.value = this.camera.near;
            if (mat?.uniforms?.cameraFar) mat.uniforms.cameraFar.value = this.camera.far;
            if (mat?.uniforms?.uRangeMeters) mat.uniforms.uRangeMeters.value = Number(this._settings?.depthVizRangeMeters ?? 200);
            if (mat?.uniforms?.uPower) mat.uniforms.uPower.value = Number(this._settings?.depthVizPower ?? 1.6);
            blitToScreen(mat);
            return;
        }

        if (viewMode === 'markings') {
            renderDepth();
            const markingsTex = renderMarkingsBuffer();
            const mat = this._screenMaterials.markings;
            if (mat?.uniforms?.tMarkings) mat.uniforms.tMarkings.value = markingsTex;
            if (mat?.uniforms?.uBgColor?.value?.set) {
                const hex = normalizeHexColor(this._settings?.markingsVizBackgroundColor, '#2A2F36');
                mat.uniforms.uBgColor.value.set(hex);
            }
            blitToScreen(mat);
            return;
        }

        if (viewMode === 'composite') {
            const baseTex = renderSceneToTexture({ includeMarkings: false });
            this._setSourceMarkingsVisible(true);
            renderDepth();
            const markingsTex = renderMarkingsBuffer();
            const mat = this._screenMaterials.composite;
            if (mat?.uniforms?.tScene) mat.uniforms.tScene.value = baseTex;
            if (mat?.uniforms?.tMarkings) mat.uniforms.tMarkings.value = markingsTex;
            blitToScreen(mat);
            return;
        }

        const tex = renderSceneToTexture({ includeMarkings: true });
        blitToScreen(this._screenMaterials.blit, { tDiffuse: tex });
    }
}
