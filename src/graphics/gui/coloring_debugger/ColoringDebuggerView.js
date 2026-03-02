// src/graphics/gui/coloring_debugger/ColoringDebuggerView.js
// Standalone scene to validate BF2/decorator wall coloring widgets.

import * as THREE from 'three';
import { createGradientSkyDome } from '../../assets3d/generators/SkyGenerator.js';
import { createToolCameraController } from '../../engine3d/camera/ToolCameraPrefab.js';
import { getOrCreateGpuFrameTimer } from '../../engine3d/perf/GpuFrameTimer.js';
import { getPbrMaterialClassSections, getPbrMaterialOptions } from '../../content3d/catalogs/PbrMaterialCatalog.js';
import { PbrTextureLoaderService, applyResolvedPbrToStandardMaterial } from '../../content3d/materials/PbrTexturePipeline.js';
import {
    applyWallBaseTintStateToWallBase,
    resolveWallBaseTintHexFromWallBase,
    resolveWallBaseTintStateFromWallBase,
    WALL_BASE_TINT_STATE_DEFAULT
} from '../../../app/buildings/WallBaseTintModel.js';
import { ColoringDebuggerUI } from './ColoringDebuggerUI.js';

const LAND_GRID_COUNT = 3;
const LAND_TILE_SIZE_METERS = 8.0;
const LAND_TILE_HEIGHT_METERS = 0.20;
const WALL_WIDTH_METERS = 12.0;
const WALL_DEPTH_METERS = 6.0;
const WALL_HEIGHT_METERS = 6.0;
const DEFAULT_WALL_MATERIAL_ID = 'pbr.plastered_wall_02';

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function uniqueTextures(textures) {
    const out = [];
    for (const tex of Object.values(textures ?? {})) {
        if (!tex?.isTexture) continue;
        if (out.includes(tex)) continue;
        out.push(tex);
    }
    return out;
}

export class ColoringDebuggerView {
    constructor({ canvas } = {}) {
        this.canvas = canvas;
        this.onFrame = null;

        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this._gpuFrameTimer = null;

        this._root = null;
        this._ui = null;
        this._pbrLoader = null;

        this._wallMesh = null;
        this._wallMaterial = null;
        this._wallTextureClones = [];

        this._materialOptions = [];
        this._materialSections = [];
        this._materialById = new Map();
        this._wallMaterialId = '';
        this._wallBase = {};

        this._raf = 0;
        this._lastTickMs = 0;
        this._onResize = () => this._resize();
    }

    async start() {
        if (!this.canvas) throw new Error('[ColoringDebugger] Missing canvas#game-canvas');
        if (this.renderer) return;

        if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;

        const renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
        else renderer.outputEncoding = THREE.sRGBEncoding;
        if ('useLegacyLights' in renderer) renderer.useLegacyLights = true;

        this.renderer = renderer;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x8faac8);
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
        this._gpuFrameTimer = getOrCreateGpuFrameTimer(renderer);
        this._pbrLoader = new PbrTextureLoaderService({ renderer });

        this._materialOptions = getPbrMaterialOptions();
        this._materialSections = getPbrMaterialClassSections();
        this._materialById = new Map(this._materialOptions.map((entry) => [String(entry?.id ?? ''), entry]));
        if (!this._materialOptions.length) throw new Error('[ColoringDebugger] No PBR materials available for picker.');
        this._wallMaterialId = this._materialById.has(DEFAULT_WALL_MATERIAL_ID)
            ? DEFAULT_WALL_MATERIAL_ID
            : String(this._materialOptions[0]?.id ?? '');

        this._wallBase = applyWallBaseTintStateToWallBase({
            roughness: 0.85,
            normalStrength: 0.9
        }, WALL_BASE_TINT_STATE_DEFAULT);

        this._buildScene();

        this._ui = new ColoringDebuggerUI({
            materialOptions: this._materialOptions,
            materialSections: this._materialSections,
            initialState: {
                materialId: this._wallMaterialId,
                wallBase: this._wallBase
            },
            onMaterialChange: (materialId) => this._setWallMaterialId(materialId),
            onTintChange: (tintState) => this._setWallTintState(tintState),
            onRoughnessChange: (roughness) => this._setWallBaseScalar('roughness', roughness),
            onNormalStrengthChange: (normalStrength) => this._setWallBaseScalar('normalStrength', normalStrength)
        });
        this._ui.mount(document.body);

        this.controls = createToolCameraController(this.camera, this.canvas, {
            uiRoot: this._ui.root,
            enabled: true,
            enableDamping: true,
            dampingFactor: 0.08,
            rotateSpeed: 0.92,
            panSpeed: 0.9,
            zoomSpeed: 1.0,
            minDistance: 1.2,
            maxDistance: 220.0,
            minPolarAngle: 0.001,
            maxPolarAngle: Math.PI - 0.001,
            getFocusTarget: () => ({
                center: new THREE.Vector3(0, WALL_HEIGHT_METERS * 0.5, 0),
                radius: 15.0
            }),
            initialPose: {
                position: new THREE.Vector3(16, 10, 18),
                target: new THREE.Vector3(0, WALL_HEIGHT_METERS * 0.5, 0)
            }
        });

        this._applyWallMaterial();

        window.addEventListener('resize', this._onResize, { passive: true });
        this._resize();
        this._raf = requestAnimationFrame((t) => this._tick(t));
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;
        this._lastTickMs = 0;

        window.removeEventListener('resize', this._onResize);

        this.controls?.dispose?.();
        this.controls = null;

        this._ui?.destroy?.();
        this._ui = null;

        this._disposeWallTextures();
        this._pbrLoader?.dispose?.();
        this._pbrLoader = null;

        if (this._root) {
            this._root.traverse((obj) => {
                if (!obj?.isMesh) return;
                obj.geometry?.dispose?.();
                if (Array.isArray(obj.material)) {
                    for (const mat of obj.material) mat?.dispose?.();
                } else {
                    obj.material?.dispose?.();
                }
            });
            this.scene?.remove?.(this._root);
        }

        this._root = null;
        this._wallMesh = null;
        this._wallMaterial = null;
        this._materialOptions = [];
        this._materialSections = [];
        this._materialById.clear();
        this._wallMaterialId = '';
        this._wallBase = {};

        this.renderer?.dispose?.();
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this._gpuFrameTimer = null;
    }

    _buildScene() {
        if (!this.scene) return;
        const root = new THREE.Group();
        root.name = 'ColoringDebuggerRoot';
        this.scene.add(root);
        this._root = root;

        const sky = createGradientSkyDome({
            radius: 320,
            sunIntensity: 0.35
        });
        root.add(sky);

        const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x1f1a17, 0.82);
        hemi.position.set(0, 32, 0);
        root.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 1.15);
        sun.position.set(18, 24, 14);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 120;
        sun.shadow.camera.left = -28;
        sun.shadow.camera.right = 28;
        sun.shadow.camera.top = 28;
        sun.shadow.camera.bottom = -28;
        sun.target.position.set(0, 1.5, 0);
        root.add(sun.target);
        root.add(sun);

        const tileGeo = new THREE.BoxGeometry(LAND_TILE_SIZE_METERS, LAND_TILE_HEIGHT_METERS, LAND_TILE_SIZE_METERS);
        const tileMatA = new THREE.MeshStandardMaterial({ color: 0x68747d, roughness: 0.96, metalness: 0.03 });
        const tileMatB = new THREE.MeshStandardMaterial({ color: 0x6f7f8a, roughness: 0.95, metalness: 0.02 });
        const half = (LAND_GRID_COUNT - 1) * 0.5;
        const y = -LAND_TILE_HEIGHT_METERS * 0.5;
        for (let iz = 0; iz < LAND_GRID_COUNT; iz += 1) {
            for (let ix = 0; ix < LAND_GRID_COUNT; ix += 1) {
                const alt = ((ix + iz) % 2) === 1;
                const tile = new THREE.Mesh(tileGeo.clone(), alt ? tileMatB.clone() : tileMatA.clone());
                tile.position.set(
                    (ix - half) * LAND_TILE_SIZE_METERS,
                    y,
                    (iz - half) * LAND_TILE_SIZE_METERS
                );
                tile.receiveShadow = true;
                root.add(tile);
            }
        }

        const wallGeo = new THREE.BoxGeometry(WALL_WIDTH_METERS, WALL_HEIGHT_METERS, WALL_DEPTH_METERS);
        const uv = wallGeo.getAttribute('uv');
        if (uv?.array) wallGeo.setAttribute('uv2', new THREE.BufferAttribute(uv.array, 2));

        const wallMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0
        });
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(0, WALL_HEIGHT_METERS * 0.5, 0);
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.name = 'ColoringDebuggerWall';
        root.add(wall);

        this._wallMesh = wall;
        this._wallMaterial = wallMat;
    }

    _setWallMaterialId(materialId) {
        const id = typeof materialId === 'string' ? materialId.trim() : '';
        if (!id || !this._materialById.has(id)) return;
        if (id === this._wallMaterialId) return;
        this._wallMaterialId = id;
        this._applyWallMaterial();
        this._ui?.setState({ materialId: this._wallMaterialId });
    }

    _setWallTintState(tintState) {
        const nextState = resolveWallBaseTintStateFromWallBase(tintState, WALL_BASE_TINT_STATE_DEFAULT);
        applyWallBaseTintStateToWallBase(this._wallBase, nextState);
        this._applyWallBaseParameters();
        this._ui?.setState({ wallBase: this._wallBase });
    }

    _setWallBaseScalar(key, rawValue) {
        if (key === 'roughness') {
            this._wallBase.roughness = clamp(rawValue, 0.0, 1.0, 0.85);
        } else if (key === 'normalStrength') {
            this._wallBase.normalStrength = clamp(rawValue, 0.0, 2.0, 0.9);
        } else return;
        this._applyWallBaseParameters();
        this._ui?.setState({ wallBase: this._wallBase });
    }

    _applyWallMaterial() {
        const mat = this._wallMaterial;
        const loader = this._pbrLoader;
        if (!mat || !loader) return;

        this._disposeWallTextures();
        const payload = loader.resolveMaterial(this._wallMaterialId, {
            cloneTextures: true,
            uvSpace: 'unit',
            surfaceSizeMeters: {
                x: WALL_WIDTH_METERS,
                y: WALL_HEIGHT_METERS
            },
            diagnosticsTag: 'ColoringDebugger.wall'
        });
        if (payload) {
            applyResolvedPbrToStandardMaterial(mat, payload, { clearOnMissing: true });
            this._wallTextureClones = uniqueTextures(payload.textures);
        }
        this._applyWallBaseParameters();
    }

    _applyWallBaseParameters() {
        const mat = this._wallMaterial;
        if (!mat) return;
        mat.color.setHex(resolveWallBaseTintHexFromWallBase(this._wallBase));
        mat.roughness = clamp(this._wallBase.roughness, 0.0, 1.0, 0.85);
        const normalStrength = clamp(this._wallBase.normalStrength, 0.0, 2.0, 0.9);
        if (mat.normalScale?.set) mat.normalScale.set(normalStrength, normalStrength);
        mat.needsUpdate = true;
    }

    _disposeWallTextures() {
        const mat = this._wallMaterial;
        const slots = ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap', 'displacementMap'];
        if (mat) {
            for (const key of slots) {
                const tex = mat[key];
                if (tex?.isTexture) tex.dispose?.();
                mat[key] = null;
            }
        }
        for (const tex of this._wallTextureClones) tex?.dispose?.();
        this._wallTextureClones = [];
    }

    _resize() {
        if (!this.renderer || !this.camera || !this.canvas) return;
        const width = Math.max(1, this.canvas.clientWidth || window.innerWidth || 1);
        const height = Math.max(1, this.canvas.clientHeight || window.innerHeight || 1);
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    _tick(nowMs) {
        if (!this.renderer || !this.scene || !this.camera) return;
        const now = Number.isFinite(nowMs) ? nowMs : performance.now();
        const dt = this._lastTickMs > 0 ? Math.min(0.05, Math.max(0, (now - this._lastTickMs) / 1000)) : (1 / 60);
        this._lastTickMs = now;

        this.controls?.update?.(dt);
        this._gpuFrameTimer?.beginFrame?.();
        this.renderer.render(this.scene, this.camera);
        this._gpuFrameTimer?.endFrame?.();
        this.onFrame?.({ dt, nowMs: now, renderer: this.renderer });
        this._raf = requestAnimationFrame((t) => this._tick(t));
    }
}
