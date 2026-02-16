// src/graphics/gui/ao_foliage_debugger/view/AOFoliageDebuggerView.js
// Minimal scene for validating AO alpha foliage handling.
// @ts-check

import * as THREE from 'three';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { createToolCameraController } from '../../../engine3d/camera/ToolCameraPrefab.js';
import { getResolvedAmbientOcclusionSettings } from '../../../visuals/postprocessing/AmbientOcclusionSettings.js';
import { getResolvedAntiAliasingSettings, sanitizeAntiAliasingSettings } from '../../../visuals/postprocessing/AntiAliasingSettings.js';
import { PostProcessingPipeline } from '../../../visuals/postprocessing/PostProcessingPipeline.js';
import { OptionsUI } from '../../options/OptionsUI.js';

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
    return { wCss, hCss, pr };
}

function createDeterministicCutoutMap() {
    const w = 8;
    const h = 8;
    const data = new Uint8Array(w * h * 4);

    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            const i = (y * w + x) * 4;
            data[i + 0] = 110;
            data[i + 1] = 190;
            data[i + 2] = 120;
            if (x < 2) data[i + 3] = 255;
            else if (x < 4) data[i + 3] = 182;
            else if (x < 6) data[i + 3] = 82;
            else data[i + 3] = 0;
        }
    }

    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    applyTextureColorSpace(tex, { srgb: true });
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
}

function createAoAlphaMapFromRgbaTexture(sourceTexture) {
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
    applyTextureColorSpace(tex, { srgb: false });
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
        this._reproState = {
            leafTexture: null,
            samplePointsWorld: null
        };
    }

    async start() {
        const canvas = this.canvas;

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: false,
            alpha: false,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setClearColor(0x0b0f14, 1);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b0f14);

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);

        const hemi = new THREE.HemisphereLight(0xd7f1ff, 0x2c2b33, 0.75);
        hemi.position.set(0, 1, 0);
        this.scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(10, 14, 8);
        this.scene.add(sun);

        await this._initReproScene();

        const initialAa = sanitizeAntiAliasingSettings(getResolvedAntiAliasingSettings({ includeUrlOverrides: true }));
        const initialAo = getResolvedAmbientOcclusionSettings({ includeUrlOverrides: true });
        if (initialAo.mode === 'off') initialAo.mode = 'ssao';

        this._pipeline = new PostProcessingPipeline({
            renderer: this.renderer,
            scene: this.scene,
            camera: this.camera,
            bloom: { enabled: false },
            sunBloom: { enabled: false },
            colorGrading: null,
            antiAliasing: initialAa,
            ambientOcclusion: initialAo
        });

        this._ui = new OptionsUI({
            visibleTabs: ['graphics'],
            initialTab: 'graphics',
            titleText: 'AO Foliage Debugger',
            subtitleText: 'Esc returns to the Welcome screen',
            initialAntiAliasing: initialAa,
            initialAmbientOcclusion: initialAo,
            onLiveChange: (draft) => {
                this._pipeline?.setAntiAliasing?.(draft?.antiAliasing ?? null);
                this._pipeline?.setAmbientOcclusion?.(draft?.ambientOcclusion ?? null);
            }
        });
        this._ui.mount();

        this.controls = createToolCameraController(this.camera, canvas, {
            uiRoot: this._ui.root,
            enabled: true,
            enableDamping: true,
            dampingFactor: 0.08,
            rotateSpeed: 0.9,
            panSpeed: 0.85,
            zoomSpeed: 1.0,
            minDistance: 0.35,
            maxDistance: 160,
            minPolarAngle: 0.001,
            maxPolarAngle: Math.PI - 0.001,
            getFocusTarget: () => ({ center: new THREE.Vector3(0, 1.2, 0), radius: 6 }),
            initialPose: {
                position: new THREE.Vector3(0, 1.4, 4.4),
                target: new THREE.Vector3(0, 1.2, -0.6)
            }
        });

        window.addEventListener('resize', this._onResize, { passive: true });
        this._resize();
        this._lastT = performance.now();
        this._raf = requestAnimationFrame((t) => this._tick(t));
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;
        window.removeEventListener('resize', this._onResize);
        this.controls?.dispose?.();
        this.controls = null;
        this._ui?.unmount?.();
        this._ui = null;
        this._pipeline?.dispose?.();
        this._pipeline = null;
        this.renderer?.dispose?.();
        this.renderer = null;
        this.scene = null;
        this.camera = null;
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

    setAmbientOcclusionForTest(ambientOcclusion) {
        this._pipeline?.setAmbientOcclusion?.(ambientOcclusion ?? null);
    }

    getAmbientOcclusionForTest() {
        const ao = this._pipeline?._ambientOcclusion ?? null;
        if (!ao) return null;
        return JSON.parse(JSON.stringify(ao));
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
        const pipeline = this._pipeline ?? null;
        const mats = pipeline?._aoAlpha?.overrideMaterials ?? null;
        const list = [];
        if (mats instanceof Set) {
            for (const mat of mats) {
                list.push({
                    type: mat?.type ?? null,
                    alphaTest: Number(mat?.alphaTest) || 0,
                    hasMap: !!mat?.map,
                    hasAlphaMap: !!mat?.alphaMap
                });
            }
        }
        return {
            count: list.length,
            materials: list
        };
    }

    async _initReproScene() {
        if (!this.scene) return;

        const loader = new TGALoader();
        const leafMap = await loader.loadAsync(new URL('../../../../../assets/trees/Textures/T_Leaf_Realistic9.TGA', import.meta.url).toString());
        applyTextureColorSpace(leafMap, { srgb: true });
        leafMap.anisotropy = 8;
        leafMap.needsUpdate = true;
        const leafAoAlphaMap = createAoAlphaMapFromRgbaTexture(leafMap);
        this._reproState.leafTexture = {
            width: Number(leafMap?.image?.width) || 0,
            height: Number(leafMap?.image?.height) || 0
        };

        const groundMat = new THREE.MeshStandardMaterial({ color: 0x1d232b, roughness: 1.0, metalness: 0.0 });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, 0, 0);
        ground.receiveShadow = true;
        this.scene.add(ground);

        const wallMat = new THREE.MeshStandardMaterial({ color: 0xd7dde7, roughness: 0.9, metalness: 0.0 });
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), wallMat);
        wall.position.set(0, 1.5, -2.0);
        wall.receiveShadow = true;
        this.scene.add(wall);

        const leafCutout = new THREE.MeshStandardMaterial({
            map: leafMap,
            roughness: 0.95,
            metalness: 0.0,
            alphaTest: 0.5,
            side: THREE.DoubleSide
        });
        leafCutout.userData.isFoliage = true;
        if (leafAoAlphaMap) leafCutout.userData.aoAlphaMap = leafAoAlphaMap;

        const leafTransparent = new THREE.MeshStandardMaterial({
            map: leafMap,
            roughness: 0.95,
            metalness: 0.0,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        leafTransparent.userData.isFoliage = true;
        if (leafAoAlphaMap) leafTransparent.userData.aoAlphaMap = leafAoAlphaMap;

        const leafGeo = new THREE.PlaneGeometry(2.2, 2.2);
        const leafA = new THREE.Mesh(leafGeo, leafCutout);
        leafA.position.set(-1.4, 1.2, -1.6);
        leafA.rotation.y = Math.PI * 0.12;
        this.scene.add(leafA);

        const leafB = new THREE.Mesh(leafGeo, leafTransparent);
        leafB.position.set(1.4, 1.2, -1.6);
        leafB.rotation.y = -Math.PI * 0.12;
        this.scene.add(leafB);

        const deterministicMap = createDeterministicCutoutMap();
        deterministicMap.anisotropy = 8;
        const deterministicAoAlphaMap = createAoAlphaMapFromRgbaTexture(deterministicMap);

        const deterministicCardMaterial = new THREE.MeshStandardMaterial({
            map: deterministicMap,
            roughness: 0.9,
            metalness: 0.0,
            alphaTest: 0.5,
            side: THREE.DoubleSide
        });
        deterministicCardMaterial.userData.isFoliage = true;
        if (deterministicAoAlphaMap) deterministicCardMaterial.userData.aoAlphaMap = deterministicAoAlphaMap;

        const deterministicCard = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), deterministicCardMaterial);
        deterministicCard.position.set(0, 1.2, -1.58);
        this.scene.add(deterministicCard);

        const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.6), new THREE.MeshStandardMaterial({ color: 0x4a515e, roughness: 1.0, metalness: 0.0 }));
        base.position.set(0, 0.175, -0.4);
        base.castShadow = true;
        base.receiveShadow = true;
        this.scene.add(base);

        this._reproState.samplePointsWorld = {
            wallOpaque: new THREE.Vector3(-0.45, 1.2, -2.0),
            wallEdge: new THREE.Vector3(-0.2, 1.2, -2.0),
            wallTransparent: new THREE.Vector3(0.45, 1.2, -2.0),
            wallReference: new THREE.Vector3(2.0, 1.2, -2.0)
        };
    }
}
