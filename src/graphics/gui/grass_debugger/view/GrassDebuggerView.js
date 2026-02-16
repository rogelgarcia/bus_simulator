// src/graphics/gui/grass_debugger/view/GrassDebuggerView.js
// Orchestrates UI, input, and rendering for the Grass Debugger tool.
// @ts-check

import * as THREE from 'three';
import { FirstPersonCameraController } from '../../../engine3d/camera/FirstPersonCameraController.js';
import { getOrCreateGpuFrameTimer } from '../../../engine3d/perf/GpuFrameTimer.js';
import { applyIBLIntensity, applyIBLToScene, loadIBLTexture } from '../../../lighting/IBL.js';
import { DEFAULT_IBL_ID, getIblEntryById } from '../../../content3d/catalogs/IBLCatalog.js';
import { createProceduralMeshAsset } from '../../../assets3d/procedural_meshes/ProceduralMeshCatalog.js';
import { getPbrMaterialMeta, resolvePbrMaterialUrls } from '../../../content3d/catalogs/PbrMaterialCatalog.js';
import { createGeneratorConfig, ROAD_DEFAULTS } from '../../../assets3d/generators/GeneratorParams.js';
import { getCityMaterials } from '../../../assets3d/textures/CityMaterials.js';
import { createRoadEngineRoads } from '../../../visuals/city/RoadEngineRoads.js';
import { computeUvScaleForGroundSize, updateGroundSubstrateBlendOnMeshStandardMaterial } from '../../../assets3d/materials/GroundSubstrateBlendSystem.js';
import { GrassDebuggerUI } from './GrassDebuggerUI.js';
import { GrassLod1InspectorPopup } from './GrassLod1InspectorPopup.js';

const EPS = 1e-6;
const TILE_SIZE_METERS = 24;
const TILE_COUNT = 15;
const TILE_MIN = -7;
const LOD1_COLOR = 0x2bd6ff;
const MAX_INSTANCES_PER_FIELD = 2000000;
const LOD1_VARIANTS = 8;
const LOD2_COLOR = 0x9cff2b;
const LOD2_VARIANTS = 4;
const CAMERA_PRESET_BEHIND_GAMEPLAY_DISTANCE = 13.5;

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function isTextEditingElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    if (target?.isContentEditable) return true;
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;

    const type = String(target.type ?? '').toLowerCase();
    if (!type) return true;
    return (
        type === 'text'
        || type === 'search'
        || type === 'email'
        || type === 'password'
        || type === 'url'
        || type === 'tel'
    );
}

function getMapBounds({ tileSize, width, height, origin }) {
    const ts = Math.max(EPS, Number(tileSize) || TILE_SIZE_METERS);
    const w = Math.max(1, Math.round(Number(width) || TILE_COUNT));
    const h = Math.max(1, Math.round(Number(height) || TILE_COUNT));
    const half = ts * 0.5;
    const ox = Number(origin?.x) || 0;
    const oz = Number(origin?.z) || 0;
    const minX = ox - half;
    const minZ = oz - half;
    const maxX = minX + w * ts;
    const maxZ = minZ + h * ts;
    return { minX, minZ, maxX, maxZ, sizeX: w * ts, sizeZ: h * ts };
}

function getTileIndexRangeForRadius(map, { centerX, centerZ, outerMeters }) {
    const m = map && typeof map === 'object' ? map : null;
    if (!m) return { tx0: 0, tx1: -1, tz0: 0, tz1: -1, tilesTotal: 0 };

    const ts = Math.max(EPS, Number(m.tileSize) || TILE_SIZE_METERS);
    const half = ts * 0.5;
    const outer = Math.max(0, Number(outerMeters) || 0);
    const minX = Number(centerX) - outer - half;
    const maxX = Number(centerX) + outer + half;
    const minZ = Number(centerZ) - outer - half;
    const maxZ = Number(centerZ) + outer + half;

    let tx0 = Math.ceil((minX - m.origin.x) / ts);
    let tx1 = Math.floor((maxX - m.origin.x) / ts);
    let tz0 = Math.ceil((minZ - m.origin.z) / ts);
    let tz1 = Math.floor((maxZ - m.origin.z) / ts);

    tx0 = Math.max(0, Math.min(m.width - 1, tx0));
    tx1 = Math.max(0, Math.min(m.width - 1, tx1));
    tz0 = Math.max(0, Math.min(m.height - 1, tz0));
    tz1 = Math.max(0, Math.min(m.height - 1, tz1));

    if (tx1 < tx0 || tz1 < tz0) return { tx0: 0, tx1: -1, tz0: 0, tz1: -1, tilesTotal: 0 };

    const tilesTotal = (tx1 - tx0 + 1) * (tz1 - tz0 + 1);
    return { tx0, tx1, tz0, tz1, tilesTotal };
}

function hashStringToUint32(value) {
    const str = typeof value === 'string' ? value : String(value ?? '');
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function hashCombine(a, b) {
    const x = (a >>> 0) || 0;
    const y = (b >>> 0) || 0;
    let h = x ^ (y + 0x9e3779b9 + (x << 6) + (x >>> 2));
    h = Math.imul(h >>> 0, 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function radToDeg(rad) {
    const r = Number(rad);
    if (!Number.isFinite(r)) return 0;
    return r * (180 / Math.PI);
}

function degToRad(deg) {
    const d = Number(deg);
    if (!Number.isFinite(d)) return 0;
    return d * (Math.PI / 180);
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function ensureUv2(geo) {
    const g = geo?.isBufferGeometry ? geo : null;
    const uv = g?.attributes?.uv ?? null;
    if (!uv || !uv.isBufferAttribute) return;
    if (g.attributes.uv2) return;
    g.setAttribute('uv2', new THREE.BufferAttribute(uv.array.slice(0), 2));
}

export class GrassDebuggerView {
    constructor({ canvas } = {}) {
        this.canvas = canvas;
        this.onFrame = null;

        this.renderer = null;
        this._gpuFrameTimer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this._ui = null;

        this._texLoader = new THREE.TextureLoader();
        this._texCache = new Map();
        this._groundMat = null;
        this._groundSize = { x: 1, z: 1 };
        this._groundMaterialKey = '';
        this._grid = null;

        this._ground = null;
        this._roads = null;
        this._sun = null;
        this._map = null;
        this._roadBounds = { halfWidth: 0, z0: 0, z1: 0 };

        this._iblKey = '';
        this._iblRequestId = 0;
        this._iblPromise = null;

        this._raf = 0;
        this._lastT = 0;
        this._state = null;
        this._keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            KeyW: false,
            KeyA: false,
            KeyS: false,
            KeyD: false,
            ShiftLeft: false,
            ShiftRight: false
        };
        this._cameraMoveEuler = new THREE.Euler(0, 0, 0, 'YXZ');

        this._lod1 = {
            bladeMeshId: null,
            controlAsset: null,
            distributionKey: '',
            variantKey: '',
            debugKey: '',
            variants: [],
            variantGeometries: [],
            instanceData: null,
            meshes: [],
            debug: {
                fill: null,
                inner: null,
                outer: null
            }
        };

        this._lod2 = {
            bladeMeshId: null,
            controlAsset: null,
            distributionKey: '',
            variantKey: '',
            debugKey: '',
            variants: [],
            variantGeometries: [],
            instanceData: null,
            meshes: [],
            debug: {
                fill: null,
                inner: null,
                outer: null
            }
        };

        this._tmp = {
            forward: new THREE.Vector3(),
            mat4: new THREE.Matrix4(),
            quat: new THREE.Quaternion(),
            pos: new THREE.Vector3(),
            scale: new THREE.Vector3(1, 1, 1)
        };

        this._lod1Inspector = null;

        this._centerRaycaster = new THREE.Raycaster();
        this._centerPointer = new THREE.Vector2(0, 0);
        this._centerDistancePanel = null;
        this._centerDistanceValueEl = null;
        this._cameraHeightValueEl = null;
        this._centerDistanceLastUpdateMs = 0;

        this._onResize = () => this._resize();
        this._onKeyDown = (e) => this._handleKey(e, true);
        this._onKeyUp = (e) => this._handleKey(e, false);
        this._onContextMenu = (e) => {
            if (!e) return;
            if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
            e.preventDefault();
        };
    }

    async start() {
        if (!this.canvas) throw new Error('[GrassDebuggerView] Missing canvas');

        const renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
        else renderer.outputEncoding = THREE.sRGBEncoding;

        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b0f16);

        const camera = new THREE.PerspectiveCamera(50, 1, 0.02, 5000);
        camera.position.set(14, 9, 18);
        camera.lookAt(0, 0, 0);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x182016, 0.45);
        hemi.position.set(0, 1, 0);
        scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 1.05);
        sun.position.set(110, 160, 90);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 5;
        sun.shadow.camera.far = 600;
        sun.shadow.camera.left = -250;
        sun.shadow.camera.right = 250;
        sun.shadow.camera.top = 250;
        sun.shadow.camera.bottom = -250;
        scene.add(sun);
        this._sun = sun;

        this.renderer = renderer;
        this._gpuFrameTimer = getOrCreateGpuFrameTimer(renderer);
        this.scene = scene;
        this.camera = camera;

        this._buildSceneContent();

        this._mountCenterDistancePanel();

        const ui = new GrassDebuggerUI({
            onChange: (next) => this._applyUiState(next),
            onInspectLod1: () => this._openLod1Inspector(),
            onCameraBehindBus: () => this._applyBehindBusCameraPreset()
        });
        ui.mount();
        this._ui = ui;

        const controls = new FirstPersonCameraController(camera, this.canvas, {
            uiRoot: ui.root,
            enabled: true,
            lookSpeed: 1.0,
            panSpeed: 1.0,
            zoomSpeed: 1.0,
            minPitchDeg: -89,
            maxPitchDeg: 89,
            getFocusTarget: () => ({ center: new THREE.Vector3(0, 0.8, 0), radius: 10 })
        });
        this.controls = controls;

        window.addEventListener('resize', this._onResize, { passive: true });
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: true });
        window.addEventListener('contextmenu', this._onContextMenu, { passive: false });

        this._resize();
        this._applyUiState(ui.getState(), { force: true });
        this._startLoop();
    }

    destroy() {
        this._stopLoop();

        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('contextmenu', this._onContextMenu);

        this._ui?.unmount?.();
        this._ui = null;

        this._lod1Inspector?.dispose?.();
        this._lod1Inspector = null;

        this.controls?.dispose?.();
        this.controls = null;

        this._disposeLod1();
        this._disposeLod2();
        this._disposeRoads();
        this._disposeGround();

        if (this.scene) {
            this.scene.clear();
            this.scene = null;
        }

        this.renderer?.dispose?.();
        this.renderer = null;
        this._gpuFrameTimer = null;
        this.camera = null;

        for (const tex of this._texCache.values()) tex?.dispose?.();
        this._texCache.clear();

        this._unmountCenterDistancePanel();
    }

    _mountCenterDistancePanel() {
        if (this._centerDistancePanel) return;

        const panel = document.createElement('div');
        panel.className = 'ui-panel ui-grass-debugger-distance-panel';

        const row = document.createElement('div');
        row.className = 'ui-grass-debugger-distance-row';

        const label = document.createElement('div');
        label.className = 'ui-grass-debugger-distance-label';
        label.textContent = 'Center hit';

        const value = document.createElement('div');
        value.className = 'ui-grass-debugger-distance-value';
        value.textContent = '—';

        row.appendChild(label);
        row.appendChild(value);
        panel.appendChild(row);

        const heightRow = document.createElement('div');
        heightRow.className = 'ui-grass-debugger-distance-row';

        const heightLabel = document.createElement('div');
        heightLabel.className = 'ui-grass-debugger-distance-label';
        heightLabel.textContent = 'Camera height';

        const heightValue = document.createElement('div');
        heightValue.className = 'ui-grass-debugger-distance-value';
        heightValue.textContent = '—';

        heightRow.appendChild(heightLabel);
        heightRow.appendChild(heightValue);
        panel.appendChild(heightRow);
        document.body.appendChild(panel);

        this._centerDistancePanel = panel;
        this._centerDistanceValueEl = value;
        this._cameraHeightValueEl = heightValue;
    }

    _unmountCenterDistancePanel() {
        this._centerDistancePanel?.remove?.();
        this._centerDistancePanel = null;
        this._centerDistanceValueEl = null;
        this._cameraHeightValueEl = null;
        this._centerDistanceLastUpdateMs = 0;
    }

    _updateCenterDistanceOverlay({ nowMs } = {}) {
        const valueEl = this._centerDistanceValueEl;
        const heightEl = this._cameraHeightValueEl;
        if (!valueEl || !heightEl) return;

        const now = Number.isFinite(nowMs) ? nowMs : performance.now();
        if (now - this._centerDistanceLastUpdateMs < 110) return;
        this._centerDistanceLastUpdateMs = now;

        const camera = this.camera;
        if (!camera) return;

        const ground = this._ground;
        const roadsGroup = this._roads?.group ?? null;
        const targets = [];
        if (roadsGroup) targets.push(roadsGroup);
        if (ground) targets.push(ground);
        if (!targets.length) return;

        this._centerRaycaster.setFromCamera(this._centerPointer, camera);
        const hits = this._centerRaycaster.intersectObjects(targets, true);
        const dist = Number.isFinite(hits?.[0]?.distance) ? hits[0].distance : null;

        valueEl.textContent = Number.isFinite(dist) ? `${dist.toFixed(2)} m` : '—';

        let height = null;
        if (ground) {
            ground.updateMatrixWorld?.(true);
            const rc = this._centerRaycaster;
            rc.ray.origin.copy(camera.position);
            rc.ray.direction.set(0, -1, 0);
            const down = rc.intersectObject(ground, false)[0] ?? null;
            if (down?.point) height = camera.position.y - down.point.y;
            else {
                rc.ray.direction.set(0, 1, 0);
                const up = rc.intersectObject(ground, false)[0] ?? null;
                if (up?.point) height = camera.position.y - up.point.y;
            }
        }

        heightEl.textContent = Number.isFinite(height) ? `${height.toFixed(2)} m` : '—';
    }

    _buildSceneContent() {
        const scene = this.scene;
        if (!scene) return;

        const tileSize = TILE_SIZE_METERS;
        const width = TILE_COUNT;
        const height = TILE_COUNT;
        const origin = { x: TILE_MIN * tileSize, z: TILE_MIN * tileSize };
        const bounds = getMapBounds({ tileSize, width, height, origin });
        this._map = { tileSize, width, height, origin, bounds };

        const groundGeo = new THREE.PlaneGeometry(bounds.sizeX, bounds.sizeZ, width * 2, height * 2);
        groundGeo.rotateX(-Math.PI * 0.5);
        ensureUv2(groundGeo);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x234425, roughness: 1.0, metalness: 0.0 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.name = 'Ground';
        ground.position.set((bounds.minX + bounds.maxX) * 0.5, 0, (bounds.minZ + bounds.maxZ) * 0.5);
        ground.receiveShadow = true;
        scene.add(ground);
        this._ground = ground;
        this._groundMat = groundMat;
        this._groundSize = { x: bounds.sizeX, z: bounds.sizeZ };

        const grid = new THREE.GridHelper(Math.max(bounds.sizeX, bounds.sizeZ), width, 0x2f2f2f, 0x2f2f2f);
        grid.position.y = 0.02;
        grid.visible = false;
        scene.add(grid);
        this._grid = grid;

        const lanesEach = 1;
        const laneWidth = ROAD_DEFAULTS.laneWidth;
        const shoulder = ROAD_DEFAULTS.shoulder;
        const curbThickness = ROAD_DEFAULTS.curb.thickness;
        const sidewalkWidth = ROAD_DEFAULTS.sidewalk.extraWidth;
        const roadHalfWidth = (lanesEach * laneWidth * 2 + shoulder * 2 + curbThickness * 2 + sidewalkWidth * 2) * 0.5;

        const roadZ0 = bounds.minZ + tileSize;
        const roadZ1 = bounds.maxZ - tileSize;

        const map = {
            tileSize,
            width,
            height,
            origin,
            roadNetwork: { seed: 'grass-debugger' },
            roadSegments: [
                {
                    kind: 'polyline',
                    tag: 'straight',
                    rendered: true,
                    lanesF: lanesEach,
                    lanesB: lanesEach,
                    points: [
                        { x: 0, z: roadZ0 },
                        { x: 0, z: roadZ1 }
                    ]
                }
            ]
        };

        const generatorConfig = createGeneratorConfig({
            road: {
                laneWidth,
                shoulder,
                surfaceY: 0,
                curb: { ...ROAD_DEFAULTS.curb },
                sidewalk: { ...ROAD_DEFAULTS.sidewalk }
            },
            ground: { surfaceY: 0 }
        });

        const cityMats = getCityMaterials();
        const roads = createRoadEngineRoads({
            map,
            config: generatorConfig,
            materials: cityMats,
            options: {
                includeCurbs: true,
                includeSidewalks: true,
                includeMarkings: true,
                includeDebug: false
            }
        });
        if (roads?.group) {
            roads.group.name = 'RoadEngineRoads';
            roads.group.position.y = 0.001;
            scene.add(roads.group);
        }
        this._roads = roads;

        const cam = this.camera;
        if (cam) cam.position.set(0, 8.5, roadZ0 + 18);

        this._roadBounds = { halfWidth: roadHalfWidth, z0: roadZ0, z1: roadZ1 };
    }

    _disposeGround() {
        const grid = this._grid;
        if (grid) {
            this.scene?.remove?.(grid);
            grid.geometry?.dispose?.();
            const gridMat = grid.material;
            if (Array.isArray(gridMat)) for (const m of gridMat) m?.dispose?.();
            else gridMat?.dispose?.();
            this._grid = null;
        }

        const g = this._ground;
        if (!g) return;
        this.scene?.remove?.(g);
        g.geometry?.dispose?.();
        const mat = g.material;
        if (Array.isArray(mat)) for (const m of mat) m?.dispose?.();
        else mat?.dispose?.();
        this._ground = null;
        this._groundMat = null;
        this._groundMaterialKey = '';
    }

    _disposeRoads() {
        const roads = this._roads;
        if (!roads) return;
        const group = roads?.group ?? null;
        if (group) {
            this.scene?.remove?.(group);
            group.traverse?.((obj) => {
                if (!obj?.isMesh) return;
                obj.geometry?.dispose?.();
                const mat = obj.material;
                if (Array.isArray(mat)) for (const m of mat) m?.dispose?.();
                else mat?.dispose?.();
            });
        }
        roads?.dispose?.();
        this._roads = null;
    }

    _disposeLod1() {
        const scene = this.scene;
        const lod1 = this._lod1;
        this._lod1Inspector?.close?.();
        if (scene) {
            for (const mesh of lod1.meshes) scene.remove(mesh);
            if (lod1.debug.fill) scene.remove(lod1.debug.fill);
            if (lod1.debug.inner) scene.remove(lod1.debug.inner);
            if (lod1.debug.outer) scene.remove(lod1.debug.outer);
        }

        lod1.meshes = [];
        lod1.instanceData = null;
        for (const geo of lod1.variantGeometries) geo?.dispose?.();
        lod1.variantGeometries = [];

        const fill = lod1.debug.fill;
        if (fill) {
            fill.geometry?.dispose?.();
            fill.material?.dispose?.();
        }
        const inner = lod1.debug.inner;
        if (inner) {
            inner.geometry?.dispose?.();
            inner.material?.dispose?.();
        }
        const outer = lod1.debug.outer;
        if (outer) {
            outer.geometry?.dispose?.();
            outer.material?.dispose?.();
        }
        lod1.debug.fill = null;
        lod1.debug.inner = null;
        lod1.debug.outer = null;

        const asset = lod1.controlAsset;
        if (asset?.mesh) {
            asset.mesh.geometry?.dispose?.();
            const mat = asset.mesh.material;
            if (Array.isArray(mat)) for (const m of mat) m?.dispose?.();
            else mat?.dispose?.();
        }
        const solids = asset?.materials?.solid ?? null;
        if (Array.isArray(solids)) for (const m of solids) m?.dispose?.();
        lod1.controlAsset = null;
        lod1.bladeMeshId = null;
        lod1.distributionKey = '';
        lod1.variantKey = '';
        lod1.debugKey = '';
    }

    _disposeLod2() {
        const scene = this.scene;
        const lod2 = this._lod2;
        if (scene) {
            for (const mesh of lod2.meshes) scene.remove(mesh);
            if (lod2.debug.fill) scene.remove(lod2.debug.fill);
            if (lod2.debug.inner) scene.remove(lod2.debug.inner);
            if (lod2.debug.outer) scene.remove(lod2.debug.outer);
        }

        lod2.meshes = [];
        lod2.instanceData = null;
        for (const geo of lod2.variantGeometries) geo?.dispose?.();
        lod2.variantGeometries = [];

        const fill = lod2.debug.fill;
        if (fill) {
            fill.geometry?.dispose?.();
            fill.material?.dispose?.();
        }
        const inner = lod2.debug.inner;
        if (inner) {
            inner.geometry?.dispose?.();
            inner.material?.dispose?.();
        }
        const outer = lod2.debug.outer;
        if (outer) {
            outer.geometry?.dispose?.();
            outer.material?.dispose?.();
        }
        lod2.debug.fill = null;
        lod2.debug.inner = null;
        lod2.debug.outer = null;

        const asset = lod2.controlAsset;
        if (asset?.mesh) {
            asset.mesh.geometry?.dispose?.();
            const mat = asset.mesh.material;
            if (Array.isArray(mat)) for (const m of mat) m?.dispose?.();
            else mat?.dispose?.();
        }
        const solids = asset?.materials?.solid ?? null;
        if (Array.isArray(solids)) for (const m of solids) m?.dispose?.();
        lod2.controlAsset = null;
        lod2.bladeMeshId = null;
        lod2.distributionKey = '';
        lod2.variantKey = '';
        lod2.debugKey = '';
    }

    _resize() {
        const renderer = this.renderer;
        const camera = this.camera;
        const canvas = this.canvas;
        if (!renderer || !camera || !canvas) return;
        const w = Math.max(1, canvas.clientWidth || 1);
        const h = Math.max(1, canvas.clientHeight || 1);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    _handleKey(e, isDown) {
        if (!e) return;
        const code = e.code;
        if (!(code in this._keys)) return;
        if (isDown && (isTextEditingElement(e.target) || isTextEditingElement(document.activeElement))) return;
        if (isDown) e.preventDefault();
        this._keys[code] = !!isDown;
    }

    _updateCameraFromKeys(dt) {
        const controls = this.controls;
        const camera = this.camera;
        if (!controls?.panWorld || !camera || !controls.enabled) return;

        const rightInput = (this._keys.ArrowRight || this._keys.KeyD ? 1 : 0) - (this._keys.ArrowLeft || this._keys.KeyA ? 1 : 0);
        const forwardInput = (this._keys.ArrowUp || this._keys.KeyW ? 1 : 0) - (this._keys.ArrowDown || this._keys.KeyS ? 1 : 0);
        if (!rightInput && !forwardInput) return;

        const isFast = this._keys.ShiftLeft || this._keys.ShiftRight;
        const speed = (isFast ? 84 : 36);
        const len = Math.hypot(rightInput, forwardInput);
        if (!(len > EPS)) return;
        const inv = 1 / len;
        const scale = speed * Math.max(0.001, dt);

        const moveRight = rightInput * inv * scale;
        const moveForward = forwardInput * inv * scale;

        const euler = this._cameraMoveEuler;
        euler.setFromQuaternion(camera.quaternion, 'YXZ');
        const yaw = Number(euler.y) || 0;
        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);

        controls.panWorld(
            cos * moveRight - sin * moveForward,
            0,
            -sin * moveRight - cos * moveForward
        );
    }

    _getBusAnchor() {
        const map = this._map;
        if (!map) {
            return {
                position: new THREE.Vector3(0, 0, 0),
                forward: new THREE.Vector3(0, 0, 1)
            };
        }

        const tileSize = Number(map.tileSize) || TILE_SIZE_METERS;
        const roadZ0 = Number(this._roadBounds?.z0) || 0;
        const roadZ1 = Number(this._roadBounds?.z1) || 0;
        const forwardZ = roadZ1 >= roadZ0 ? 1 : -1;
        const roadBeginZ = forwardZ > 0 ? Math.min(roadZ0, roadZ1) : Math.max(roadZ0, roadZ1);
        const insetMeters = Math.max(0, tileSize) * 0.25;

        let busZ = roadBeginZ + forwardZ * insetMeters;
        busZ = clamp(busZ, Math.min(roadZ0, roadZ1), Math.max(roadZ0, roadZ1), busZ);

        return {
            position: new THREE.Vector3(0, 0, busZ),
            forward: new THREE.Vector3(0, 0, forwardZ)
        };
    }

    _applyBehindBusCameraPreset() {
        const controls = this.controls;
        if (!controls?.setLookAt) return;

        const { position: busPos, forward } = this._getBusAnchor();
        const distance = CAMERA_PRESET_BEHIND_GAMEPLAY_DISTANCE;
        const height = 4.5;
        const lookY = 1.6;

        const position = busPos.clone().addScaledVector(forward, -distance);
        position.y += height;
        const target = busPos.clone();
        target.y += lookY;

        controls.setLookAt({ position, target });
    }

    _applyUiState(next, { force = false } = {}) {
        const scene = this.scene;
        const renderer = this.renderer;
        if (!scene || !renderer) return;

        const ibl = next?.environment?.ibl ?? {};
        const enabled = ibl.enabled !== false;
        const iblId = typeof ibl.iblId === 'string' ? ibl.iblId : DEFAULT_IBL_ID;
        const intensity = clamp(ibl.envMapIntensity, 0, 3, 0.25);
        const setBackground = ibl.setBackground !== false;

        const entry = getIblEntryById(iblId);
        const hdrUrl = entry?.hdrUrl ?? null;

        const key = `${enabled ? 1 : 0}|${hdrUrl ?? ''}|${setBackground ? 1 : 0}`;
        if (force || key !== this._iblKey) {
            this._iblKey = key;
            const requestId = ++this._iblRequestId;
            if (enabled && hdrUrl) {
                this._iblPromise = loadIBLTexture(renderer, { enabled: true, hdrUrl }).then((envMap) => {
                    if (requestId !== this._iblRequestId) return;
                    applyIBLToScene(scene, envMap, { enabled: true, hdrUrl, setBackground });
                    applyIBLIntensity(scene, { enabled: true, envMapIntensity: intensity }, { force: true });
                }).catch((err) => console.error('[GrassDebugger] IBL load failed', err));
            } else {
                applyIBLToScene(scene, null, { enabled: false });
            }
        }

        applyIBLIntensity(scene, { enabled, envMapIntensity: intensity });

        if (this._sun) this._sun.intensity = clamp(next?.environment?.sunIntensity, 0, 6, 1.05);

        this._state = next;
        this._syncTerrainFromState(next, { force });
        this._syncLod1FromState(next, { force });
        this._syncLod2FromState(next, { force });
    }

    _loadTexture(url, { srgb } = {}) {
        const renderer = this.renderer;
        const safeUrl = typeof url === 'string' && url ? url : null;
        if (!safeUrl || !renderer) return null;

        const cached = this._texCache.get(safeUrl) ?? null;
        if (cached?.isTexture) return cached;

        const tex = this._texLoader.load(safeUrl);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy?.() ?? 16);
        applyTextureColorSpace(tex, { srgb: !!srgb });
        this._texCache.set(safeUrl, tex);
        return tex;
    }

    _applyGroundPbrMaterial(materialId) {
        const mat = this._groundMat;
        if (!mat) return;

        const id = typeof materialId === 'string' ? materialId : '';
        const urls = resolvePbrMaterialUrls(id);
        const baseUrl = urls?.baseColorUrl ?? null;
        const normalUrl = urls?.normalUrl ?? null;
        const ormUrl = urls?.ormUrl ?? null;
        const aoUrl = urls?.aoUrl ?? null;
        const roughUrl = urls?.roughnessUrl ?? null;
        const metalUrl = urls?.metalnessUrl ?? null;

        mat.color?.setHex?.(0xffffff);
        mat.map = this._loadTexture(baseUrl, { srgb: true });
        mat.normalMap = this._loadTexture(normalUrl, { srgb: false });

        if (ormUrl) {
            const orm = this._loadTexture(ormUrl, { srgb: false });
            mat.roughnessMap = orm;
            mat.metalnessMap = orm;
            mat.aoMap = orm;
            mat.metalness = 1.0;
        } else {
            mat.aoMap = this._loadTexture(aoUrl, { srgb: false });
            mat.roughnessMap = this._loadTexture(roughUrl, { srgb: false });
            mat.metalnessMap = this._loadTexture(metalUrl, { srgb: false });
            mat.metalness = 0.0;
        }

        mat.roughness = 1.0;

        const meta = getPbrMaterialMeta(id);
        const tileMeters = Number(meta?.tileMeters) || 4.0;
        const repX = this._groundSize.x / Math.max(EPS, tileMeters);
        const repY = this._groundSize.z / Math.max(EPS, tileMeters);

        const applyRepeat = (tex) => {
            if (!tex?.isTexture) return;
            tex.repeat?.set?.(repX, repY);
            tex.needsUpdate = true;
        };

        applyRepeat(mat.map);
        applyRepeat(mat.normalMap);
        applyRepeat(mat.aoMap);
        applyRepeat(mat.roughnessMap);
        applyRepeat(mat.metalnessMap);

        mat.needsUpdate = true;
    }

    _getSubstrateLayerTextures(materialId) {
        const id = typeof materialId === 'string' ? materialId : '';
        if (!id) return { map: null, normalMap: null, roughnessMap: null, tileMeters: 4.0 };

        const urls = resolvePbrMaterialUrls(id);
        const baseUrl = urls?.baseColorUrl ?? null;
        const normalUrl = urls?.normalUrl ?? null;
        const ormUrl = urls?.ormUrl ?? null;
        const roughUrl = urls?.roughnessUrl ?? null;
        const roughSrcUrl = ormUrl || roughUrl || null;

        const map = this._loadTexture(baseUrl, { srgb: true });
        const normalMap = this._loadTexture(normalUrl, { srgb: false });
        const roughnessMap = this._loadTexture(roughSrcUrl, { srgb: false });

        const meta = getPbrMaterialMeta(id);
        const tileMeters = Number(meta?.tileMeters) || 4.0;

        return { map, normalMap, roughnessMap, tileMeters };
    }

    _syncGroundSubstrateBlendFromState(state) {
        const mat = this._groundMat;
        if (!mat) return;

        const substrate = state?.terrain?.substrate && typeof state.terrain.substrate === 'object' ? state.terrain.substrate : null;
        const enabled = substrate?.enabled !== false;
        const seed = Number(substrate?.seed) || 0;

        const layer1State = substrate?.layer1 && typeof substrate.layer1 === 'object' ? substrate.layer1 : {};
        const layer2State = substrate?.layer2 && typeof substrate.layer2 === 'object' ? substrate.layer2 : {};

        const layer1Id = typeof layer1State.materialId === 'string' ? layer1State.materialId : '';
        const layer2Id = typeof layer2State.materialId === 'string' ? layer2State.materialId : '';

        const layer1 = this._getSubstrateLayerTextures(layer1Id);
        const layer2 = this._getSubstrateLayerTextures(layer2Id);

        const layer1Uv = computeUvScaleForGroundSize({
            groundSizeX: this._groundSize.x,
            groundSizeZ: this._groundSize.z,
            tileMeters: layer1.tileMeters
        });
        const layer2Uv = computeUvScaleForGroundSize({
            groundSizeX: this._groundSize.x,
            groundSizeZ: this._groundSize.z,
            tileMeters: layer2.tileMeters
        });

        const patchSize1 = Math.max(EPS, Number(layer1State.patchSizeMeters) || 55);
        const edgeSize1 = Math.max(EPS, Number(layer1State.edgeSizeMeters) || 11);
        const patchSize2 = Math.max(EPS, Number(layer2State.patchSizeMeters) || 85);
        const edgeSize2 = Math.max(EPS, Number(layer2State.edgeSizeMeters) || 14);

        updateGroundSubstrateBlendOnMeshStandardMaterial(mat, {
            enabled,
            seed,
            layer1: {
                enabled: layer1State.enabled !== false,
                materialId: layer1Id,
                coverage: clamp(layer1State.coverage, 0.0, 1.0, 0.55),
                blendWidth: clamp(layer1State.blendWidth, 0.0, 0.49, 0.16),
                noiseScale: 1.0 / patchSize1,
                detailScale: 1.0 / edgeSize1,
                detailStrength: clamp(layer1State.edgeStrength, 0.0, 1.0, 0.25),
                uvScale: layer1Uv,
                map: layer1.map,
                normalMap: layer1.normalMap,
                roughnessMap: layer1.roughnessMap
            },
            layer2: {
                enabled: layer2State.enabled !== false,
                materialId: layer2Id,
                coverage: clamp(layer2State.coverage, 0.0, 1.0, 0.35),
                blendWidth: clamp(layer2State.blendWidth, 0.0, 0.49, 0.16),
                noiseScale: 1.0 / patchSize2,
                detailScale: 1.0 / edgeSize2,
                detailStrength: clamp(layer2State.edgeStrength, 0.0, 1.0, 0.22),
                uvScale: layer2Uv,
                map: layer2.map,
                normalMap: layer2.normalMap,
                roughnessMap: layer2.roughnessMap
            }
        });
    }

    _setGroundSolidFallback() {
        const mat = this._groundMat;
        if (!mat) return;
        mat.map = null;
        mat.normalMap = null;
        mat.aoMap = null;
        mat.roughnessMap = null;
        mat.metalnessMap = null;
        mat.color?.setHex?.(0x234425);
        mat.roughness = 1.0;
        mat.metalness = 0.0;
        mat.needsUpdate = true;
    }

    _syncTerrainFromState(state, { force = false } = {}) {
        const showGrid = !!state?.terrain?.showGrid;
        if (this._grid) this._grid.visible = showGrid;

        const materialId = typeof state?.terrain?.groundMaterialId === 'string' ? state.terrain.groundMaterialId : '';
        const key = materialId || '__solid__';
        if (force || key !== this._groundMaterialKey) {
            this._groundMaterialKey = key;
            if (!materialId) this._setGroundSolidFallback();
            else this._applyGroundPbrMaterial(materialId);
        }

        this._syncGroundSubstrateBlendFromState(state);
    }

    _syncLod1FromState(state, { force = false } = {}) {
        const scene = this.scene;
        const map = this._map;
        if (!scene || !map) return;

        const lod = state?.lod1 ?? null;
        if (!lod || lod.enabled === false) {
            for (const mesh of this._lod1.meshes) mesh.count = 0;
            this._syncLod1DebugMeshes({ enabled: false, lod: null });
            return;
        }

        const requestedMeshId = typeof lod?.bladeMeshId === 'string' ? lod.bladeMeshId : '';
        const prevMeshId = typeof this._lod1.bladeMeshId === 'string' ? this._lod1.bladeMeshId : '';
        const meshChanged = !!requestedMeshId && !!prevMeshId && requestedMeshId !== prevMeshId;
        if (meshChanged) this._disposeLod1();

        const variantKey = [
            lod.bladeMeshId ?? '',
            lod.bladeBend?.min ?? 0,
            lod.bladeBend?.max ?? 0,
            lod.tipBend?.min ?? 0,
            lod.tipBend?.max ?? 0,
            lod.curvature?.min ?? 0,
            lod.curvature?.max ?? 0,
            lod.seed ?? ''
        ].join('|');

        const debugKey = [
            lod.debug?.printRegion ? 1 : 0,
            lod.debug?.drawBounds ? 1 : 0,
            lod.region?.innerMeters ?? 0,
            lod.region?.outerMeters ?? 0
        ].join('|');

        const needsForce = force || meshChanged;

        if (needsForce || variantKey !== this._lod1.variantKey) {
            this._lod1.variantKey = variantKey;
            this._rebuildLod1Variants(lod);
            this._refreshLod1MeshesGeometry();
        }

        if (this.camera) {
            const inner = Math.max(0, Number(lod?.region?.innerMeters) || 0);
            const outer = Math.max(inner, Number(lod?.region?.outerMeters) || inner);
            this._ensureLod1Distribution(lod, {
                centerX: this.camera.position.x,
                centerZ: this.camera.position.z,
                outerMeters: outer,
                force: needsForce
            });
        }

        if (needsForce || debugKey !== this._lod1.debugKey) {
            this._lod1.debugKey = debugKey;
            this._syncLod1DebugMeshes({ enabled: true, lod });
        }
    }

    _rebuildLod1Variants(lod) {
        const meshId = typeof lod?.bladeMeshId === 'string' ? lod.bladeMeshId : null;
        if (!meshId) return;

        if (!this._lod1.meshes.length) {
            for (const geo of this._lod1.variantGeometries ?? []) geo?.dispose?.();
        }

        if (this._lod1.bladeMeshId !== meshId || !this._lod1.controlAsset) {
            this._lod1.controlAsset = createProceduralMeshAsset(meshId);
            this._lod1.bladeMeshId = meshId;
        }

        const seed = hashStringToUint32(lod?.seed ?? 'lod1');
        const variants = [];

        const bendMin = clamp(lod?.bladeBend?.min, -180, 180, 0);
        const bendMax = clamp(lod?.bladeBend?.max, -180, 180, 0);
        const tipMin = clamp(lod?.tipBend?.min, -180, 180, 0);
        const tipMax = clamp(lod?.tipBend?.max, -180, 180, 0);
        const curvMin = clamp(lod?.curvature?.min, 0, 3, 0.65);
        const curvMax = clamp(lod?.curvature?.max, 0, 3, 0.65);

        const base = hashCombine(seed, hashStringToUint32(meshId));
        for (let i = 0; i < LOD1_VARIANTS; i++) {
            const rng = mulberry32(hashCombine(base, i + 1));
            const bend = bendMin + (bendMax - bendMin) * rng();
            const tip = tipMin + (tipMax - tipMin) * rng();
            const curvature = curvMin + (curvMax - curvMin) * rng();
            variants.push({ bladeBendDegrees: bend, tipBendDegrees: tip, curvature });
        }

        const controlPrefab = this._lod1.controlAsset?.mesh?.userData?.prefab ?? null;
        const baseColorHex = controlPrefab?.getParam?.('baseColorHex') ?? null;
        const tipColorHex = controlPrefab?.getParam?.('tipColorHex') ?? null;

        const variantGeometries = [];
        const isHiRes = meshId.includes('hires');

        for (let i = 0; i < variants.length; i++) {
            const entry = variants[i];
            const scratch = createProceduralMeshAsset(meshId);
            const prefab = scratch?.mesh?.userData?.prefab ?? null;

            if (prefab?.setParam) {
                if (isHiRes) {
                    if (baseColorHex != null) prefab.setParam('baseColorHex', baseColorHex);
                    if (tipColorHex != null) prefab.setParam('tipColorHex', tipColorHex);
                    prefab.setParam('curvature', entry.curvature);
                    prefab.setParam('bladeBendDegrees', entry.bladeBendDegrees);
                } else {
                    prefab.setParam('bladeBendDegrees', entry.bladeBendDegrees);
                    prefab.setParam('bendDegrees', entry.tipBendDegrees);
                }
            }

            const geo = scratch?.mesh?.geometry?.clone?.() ?? null;
            if (geo) variantGeometries.push(geo);

            scratch?.mesh?.geometry?.dispose?.();
            const mat = scratch?.mesh?.material ?? null;
            if (Array.isArray(mat)) for (const m of mat) m?.dispose?.();
            else mat?.dispose?.();
            const solidMats = scratch?.materials?.solid ?? null;
            if (Array.isArray(solidMats)) for (const m of solidMats) m?.dispose?.();
        }

        this._lod1.variants = variants;
        this._lod1.variantGeometries = variantGeometries;
    }

    _refreshLod1MeshesGeometry() {
        const geos = this._lod1.variantGeometries ?? [];
        const meshes = this._lod1.meshes ?? [];
        if (!geos.length || !meshes.length) return;

        for (let i = 0; i < meshes.length; i++) {
            const mesh = meshes[i];
            const geo = geos[i] ?? geos[0] ?? null;
            if (!mesh || !geo) continue;
            if (mesh.geometry === geo) continue;
            const prev = mesh.geometry;
            mesh.geometry = geo;
            prev?.dispose?.();
        }
    }

    _ensureLod1Distribution(lod, { centerX, centerZ, outerMeters, force = false } = {}) {
        const map = this._map;
        const asset = this._lod1.controlAsset;
        const geos = this._lod1.variantGeometries ?? [];
        if (!map || !asset?.mesh || !geos.length) return;

        const window = getTileIndexRangeForRadius(map, { centerX, centerZ, outerMeters });

        const key = [
            lod?.seed ?? '',
            lod?.densityPerTile ?? 0,
            lod?.bladeMeshId ?? '',
            LOD1_VARIANTS,
            window.tx0,
            window.tx1,
            window.tz0,
            window.tz1
        ].join('|');

        if (!force && key === this._lod1.distributionKey) return;
        this._lod1.distributionKey = key;

        this._rebuildLod1Distribution(lod, window);
        this._recreateLod1Meshes();
    }

    _rebuildLod1Distribution(lod, window) {
        const map = this._map;
        if (!map) return;

        const tx0 = Math.max(0, Number(window?.tx0) || 0);
        const tx1 = Math.min(map.width - 1, Number.isFinite(Number(window?.tx1)) ? Number(window.tx1) : map.width - 1);
        const tz0 = Math.max(0, Number(window?.tz0) || 0);
        const tz1 = Math.min(map.height - 1, Number.isFinite(Number(window?.tz1)) ? Number(window.tz1) : map.height - 1);

        const tilesTotal = tx1 >= tx0 && tz1 >= tz0 ? ((tx1 - tx0 + 1) * (tz1 - tz0 + 1)) : 0;
        const desiredPerTile = Math.max(0, Math.round(Number(lod?.densityPerTile) || 0));
        const maxPerTile = Math.max(0, Math.floor(MAX_INSTANCES_PER_FIELD / Math.max(1, tilesTotal)));
        const perTile = Math.min(desiredPerTile, maxPerTile);

        const variantCount = LOD1_VARIANTS;
        const buckets = Array.from({ length: variantCount }, () => []);

        const baseSeed = hashStringToUint32(lod?.seed ?? 'lod1');
        const roadHalfWidth = Math.max(0, Number(this._roadBounds?.halfWidth) || 0);
        const roadZ0 = Number(this._roadBounds?.z0) || 0;
        const roadZ1 = Number(this._roadBounds?.z1) || 0;
        const roadMargin = 0.35;

        if (tilesTotal > 0 && perTile > 0) {
            for (let tz = tz0; tz <= tz1; tz++) {
                for (let tx = tx0; tx <= tx1; tx++) {
                    const tileSeed = hashCombine(hashCombine(baseSeed, tx + 1), tz + 1);
                    const rng = mulberry32(tileSeed);

                    const cx = map.origin.x + tx * map.tileSize;
                    const cz = map.origin.z + tz * map.tileSize;

                    for (let i = 0; i < perTile; i++) {
                        const x = cx + (rng() - 0.5) * map.tileSize;
                        const z = cz + (rng() - 0.5) * map.tileSize;

                        if (roadHalfWidth > EPS) {
                            if (Math.abs(x) <= roadHalfWidth + roadMargin && z >= Math.min(roadZ0, roadZ1) && z <= Math.max(roadZ0, roadZ1)) {
                                continue;
                            }
                        }

                        const variantIndex = Math.min(variantCount - 1, Math.floor(rng() * variantCount));
                        const yaw01 = rng();
                        buckets[variantIndex].push(x, z, yaw01);
                    }
                }
            }
        }

        this._lod1.instanceData = buckets.map((arr) => new Float32Array(arr));
    }

    _recreateLod1Meshes() {
        const scene = this.scene;
        const asset = this._lod1.controlAsset;
        const geos = this._lod1.variantGeometries ?? [];
        const data = this._lod1.instanceData ?? null;
        if (!scene || !asset?.mesh || !data || !geos.length) return;

        const sharedMaterial = asset.mesh.material;
        const meshes = Array.isArray(this._lod1.meshes) ? this._lod1.meshes : [];

        for (let i = 0; i < data.length; i++) {
            const geo = geos[i] ?? geos[0] ?? null;
            if (!geo) continue;
            const count = Math.max(1, Math.floor((data[i]?.length ?? 0) / 3));

            const prev = meshes[i] ?? null;
            const prevCapacity = prev?.instanceMatrix?.array ? Math.floor(prev.instanceMatrix.array.length / 16) : 0;

            if (prev?.isInstancedMesh && prev.material === sharedMaterial && prevCapacity >= count) {
                if (prev.geometry !== geo) prev.geometry = geo;
                prev.count = 0;
                continue;
            }

            if (prev) scene.remove(prev);

            const mesh = new THREE.InstancedMesh(geo, sharedMaterial, count);
            mesh.name = `LOD1Grass_${i}`;
            mesh.count = 0;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.frustumCulled = false;
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            scene.add(mesh);
            meshes[i] = mesh;
        }

        for (let i = data.length; i < meshes.length; i++) {
            const mesh = meshes[i];
            if (mesh) scene.remove(mesh);
        }
        meshes.length = data.length;
        this._lod1.meshes = meshes;
    }

    _syncLod1DebugMeshes({ enabled, lod }) {
        const scene = this.scene;
        if (!scene) return;

        const wantsFill = enabled && !!lod?.debug?.printRegion;
        const wantsBounds = enabled && !!lod?.debug?.drawBounds;

        const inner = Math.max(0, Number(lod?.region?.innerMeters) || 0);
        const outer = Math.max(inner, Number(lod?.region?.outerMeters) || inner);

        const ensureFill = () => {
            if (!wantsFill) {
                if (this._lod1.debug.fill) {
                    const prev = this._lod1.debug.fill;
                    scene.remove(prev);
                    prev.geometry?.dispose?.();
                    prev.material?.dispose?.();
                    this._lod1.debug.fill = null;
                }
                return;
            }

            const fill = this._lod1.debug.fill;
            if (fill) {
                const nextGeo = inner > EPS ? new THREE.RingGeometry(inner, outer, 72) : new THREE.CircleGeometry(outer, 72);
                nextGeo.rotateX(-Math.PI * 0.5);
                fill.geometry?.dispose?.();
                fill.geometry = nextGeo;
                return;
            }

            const geo = inner > EPS ? new THREE.RingGeometry(inner, outer, 72) : new THREE.CircleGeometry(outer, 72);
            geo.rotateX(-Math.PI * 0.5);
            const mat = new THREE.MeshBasicMaterial({
                color: LOD1_COLOR,
                transparent: true,
                opacity: 0.18,
                depthWrite: false
            });
            mat.toneMapped = false;
            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = 'LOD1RegionFill';
            mesh.renderOrder = 5;
            scene.add(mesh);
            this._lod1.debug.fill = mesh;
        };

        const makeCircleLineGeometry = (radius) => {
            const points = [];
            const seg = 96;
            for (let i = 0; i <= seg; i++) {
                const t = (i / seg) * Math.PI * 2;
                points.push(new THREE.Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
            }
            return new THREE.BufferGeometry().setFromPoints(points);
        };

        const ensureBounds = () => {
            if (!wantsBounds) {
                for (const key of ['inner', 'outer']) {
                    const line = this._lod1.debug[key];
                    if (!line) continue;
                    scene.remove(line);
                    line.geometry?.dispose?.();
                    line.material?.dispose?.();
                    this._lod1.debug[key] = null;
                }
                return;
            }

            if (inner > EPS) {
                const prevInner = this._lod1.debug.inner;
                if (prevInner) {
                    const nextGeo = makeCircleLineGeometry(inner);
                    prevInner.geometry?.dispose?.();
                    prevInner.geometry = nextGeo;
                } else {
                    const geo = makeCircleLineGeometry(inner);
                    const mat = new THREE.LineBasicMaterial({ color: LOD1_COLOR, transparent: true, opacity: 0.65 });
                    mat.toneMapped = false;
                    const line = new THREE.Line(geo, mat);
                    line.name = 'LOD1InnerBound';
                    line.frustumCulled = false;
                    line.renderOrder = 6;
                    scene.add(line);
                    this._lod1.debug.inner = line;
                }
            } else if (this._lod1.debug.inner) {
                const line = this._lod1.debug.inner;
                scene.remove(line);
                line.geometry?.dispose?.();
                line.material?.dispose?.();
                this._lod1.debug.inner = null;
            }

            const prevOuter = this._lod1.debug.outer;
            if (prevOuter) {
                const nextGeo = makeCircleLineGeometry(Math.max(EPS, outer));
                prevOuter.geometry?.dispose?.();
                prevOuter.geometry = nextGeo;
            } else {
                const geo = makeCircleLineGeometry(Math.max(EPS, outer));
                const mat = new THREE.LineBasicMaterial({ color: LOD1_COLOR, transparent: true, opacity: 0.65 });
                mat.toneMapped = false;
                const line = new THREE.Line(geo, mat);
                line.name = 'LOD1OuterBound';
                line.frustumCulled = false;
                line.renderOrder = 6;
                scene.add(line);
                this._lod1.debug.outer = line;
            }
        };

        ensureFill();
        ensureBounds();
    }

    _updateLod1() {
        const scene = this.scene;
        const camera = this.camera;
        const state = this._state;
        if (!scene || !camera || !state?.lod1?.enabled) return;
        const lod = state.lod1;

        const centerX = camera.position.x;
        const centerZ = camera.position.z;

        const yOffset = 0.04;
        if (this._lod1.debug.fill) this._lod1.debug.fill.position.set(centerX, yOffset, centerZ);
        if (this._lod1.debug.inner) this._lod1.debug.inner.position.set(centerX, yOffset, centerZ);
        if (this._lod1.debug.outer) this._lod1.debug.outer.position.set(centerX, yOffset, centerZ);

        const inner = Math.max(0, Number(lod?.region?.innerMeters) || 0);
        const outer = Math.max(inner, Number(lod?.region?.outerMeters) || inner);
        const innerSq = inner * inner;
        const outerSq = outer * outer;

        this._ensureLod1Distribution(lod, { centerX, centerZ, outerMeters: outer });

        const minGrazing = clamp(lod?.angle?.minGrazingDeg, 0, 90, 0);
        const maxGrazing = clamp(lod?.angle?.maxGrazingDeg, 0, 90, 90);

        this._tmp.forward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        const horizLen = Math.hypot(this._tmp.forward.x, this._tmp.forward.z);
        const grazingDeg = radToDeg(Math.atan2(Math.abs(this._tmp.forward.y), Math.max(EPS, horizLen)));
        const angleOk = grazingDeg >= minGrazing - 1e-6 && grazingDeg <= maxGrazing + 1e-6;

        const data = this._lod1.instanceData ?? null;
        const meshes = this._lod1.meshes ?? [];
        if (!data || !meshes.length) return;

        const randomYawDeg = clamp(lod?.randomYawDeg, 0, 360, 360);

        const mat4 = this._tmp.mat4;
        const quat = this._tmp.quat;
        const pos = this._tmp.pos;
        const scale = this._tmp.scale;

        for (let v = 0; v < meshes.length; v++) {
            const mesh = meshes[v];
            const arr = data[v] ?? null;
            if (!mesh || !arr) continue;

            if (!angleOk) {
                mesh.count = 0;
                continue;
            }

            const out = mesh.instanceMatrix.array;
            let write = 0;

            for (let i = 0; i + 2 < arr.length; i += 3) {
                const x = arr[i];
                const z = arr[i + 1];
                const dx = x - centerX;
                const dz = z - centerZ;
                const d2 = dx * dx + dz * dz;
                if (d2 < innerSq || d2 > outerSq) continue;

                const yaw = degToRad(arr[i + 2] * randomYawDeg);
                quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
                pos.set(x, 0, z);
                mat4.compose(pos, quat, scale);
                mat4.toArray(out, write * 16);
                write++;
            }

            mesh.count = write;
            mesh.instanceMatrix.needsUpdate = true;
        }
    }

    _openLod1Inspector() {
        const asset = this._lod1.controlAsset ?? null;
        if (!asset?.mesh) {
            console.warn('[GrassDebugger] Missing LOD1 blade asset.');
            return;
        }

        if (!this._lod1Inspector) {
            this._lod1Inspector = new GrassLod1InspectorPopup({
                onParamChange: (change) => this._onLod1InspectorParamChange(change)
            });
        }

        this._lod1Inspector.open({
            asset,
            title: 'LOD 1 Grass Inspector'
        });
    }

    _onLod1InspectorParamChange({ propId, value } = {}) {
        const id = typeof propId === 'string' ? propId : '';
        if (!id) return;

        const meshId = this._lod1.bladeMeshId ?? '';
        const isHiRes = typeof meshId === 'string' && meshId.includes('hires');

        if (!this._state?.lod1 || !this._ui?.setLod1) return;

        if (id === 'bladeBendDegrees') {
            const v = Number(value);
            if (!Number.isFinite(v)) return;
            const next = this._ui.getState();
            next.lod1.bladeBend.min = v;
            next.lod1.bladeBend.max = v;
            this._ui.setLod1(next.lod1);
            return;
        }

        if (!isHiRes && id === 'bendDegrees') {
            const v = Number(value);
            if (!Number.isFinite(v)) return;
            const next = this._ui.getState();
            next.lod1.tipBend.min = v;
            next.lod1.tipBend.max = v;
            this._ui.setLod1(next.lod1);
            return;
        }

        if (isHiRes && id === 'curvature') {
            const v = Number(value);
            if (!Number.isFinite(v)) return;
            const next = this._ui.getState();
            next.lod1.curvature.min = v;
            next.lod1.curvature.max = v;
            this._ui.setLod1(next.lod1);
            return;
        }

        if (isHiRes && (id === 'baseColorHex' || id === 'tipColorHex')) {
            this._rebuildLod1Variants(this._state.lod1);
            this._refreshLod1MeshesGeometry();
        }
    }

    _syncLod2FromState(state, { force = false } = {}) {
        const scene = this.scene;
        const map = this._map;
        if (!scene || !map) return;

        const lod = state?.lod2 ?? null;
        if (!lod || lod.enabled === false) {
            for (const mesh of this._lod2.meshes) mesh.count = 0;
            this._syncLod2DebugMeshes({ enabled: false, lod: null });
            return;
        }

        const requestedMeshId = typeof lod?.bladeMeshId === 'string' ? lod.bladeMeshId : '';
        const prevMeshId = typeof this._lod2.bladeMeshId === 'string' ? this._lod2.bladeMeshId : '';
        const meshChanged = !!requestedMeshId && !!prevMeshId && requestedMeshId !== prevMeshId;
        if (meshChanged) this._disposeLod2();

        const variantKey = [
            lod.bladeMeshId ?? '',
            lod.bladeBend?.min ?? 0,
            lod.bladeBend?.max ?? 0,
            lod.tipBend?.min ?? 0,
            lod.tipBend?.max ?? 0,
            lod.curvature?.min ?? 0,
            lod.curvature?.max ?? 0,
            lod.seed ?? ''
        ].join('|');

        const debugKey = [
            lod.debug?.printRegion ? 1 : 0,
            lod.debug?.drawBounds ? 1 : 0,
            lod.region?.innerMeters ?? 0,
            lod.region?.outerMeters ?? 0
        ].join('|');

        const needsForce = force || meshChanged;

        if (needsForce || variantKey !== this._lod2.variantKey) {
            this._lod2.variantKey = variantKey;
            this._rebuildLod2Variants(lod);
            this._refreshLod2MeshesGeometry();
        }

        if (this.camera) {
            const inner = Math.max(0, Number(lod?.region?.innerMeters) || 0);
            const outer = Math.max(inner, Number(lod?.region?.outerMeters) || inner);
            this._ensureLod2Distribution(lod, {
                centerX: this.camera.position.x,
                centerZ: this.camera.position.z,
                outerMeters: outer,
                force: needsForce
            });
        }

        if (needsForce || debugKey !== this._lod2.debugKey) {
            this._lod2.debugKey = debugKey;
            this._syncLod2DebugMeshes({ enabled: true, lod });
        }
    }

    _rebuildLod2Variants(lod) {
        const meshId = typeof lod?.bladeMeshId === 'string' ? lod.bladeMeshId : null;
        if (!meshId) return;

        if (!this._lod2.meshes.length) {
            for (const geo of this._lod2.variantGeometries ?? []) geo?.dispose?.();
        }

        if (this._lod2.bladeMeshId !== meshId || !this._lod2.controlAsset) {
            this._lod2.controlAsset = createProceduralMeshAsset(meshId);
            this._lod2.bladeMeshId = meshId;
        }

        const seed = hashStringToUint32(lod?.seed ?? 'lod2');
        const variants = [];

        const bendMin = clamp(lod?.bladeBend?.min, -180, 180, 0);
        const bendMax = clamp(lod?.bladeBend?.max, -180, 180, 0);
        const tipMin = clamp(lod?.tipBend?.min, -180, 180, 0);
        const tipMax = clamp(lod?.tipBend?.max, -180, 180, 0);
        const curvMin = clamp(lod?.curvature?.min, 0, 3, 0.65);
        const curvMax = clamp(lod?.curvature?.max, 0, 3, 0.65);

        const base = hashCombine(seed, hashStringToUint32(meshId));
        for (let i = 0; i < LOD2_VARIANTS; i++) {
            const rng = mulberry32(hashCombine(base, i + 1));
            const bend = bendMin + (bendMax - bendMin) * rng();
            const tip = tipMin + (tipMax - tipMin) * rng();
            const curvature = curvMin + (curvMax - curvMin) * rng();
            variants.push({ bladeBendDegrees: bend, tipBendDegrees: tip, curvature });
        }

        const controlPrefab = this._lod2.controlAsset?.mesh?.userData?.prefab ?? null;
        const baseColorHex = controlPrefab?.getParam?.('baseColorHex') ?? null;
        const tipColorHex = controlPrefab?.getParam?.('tipColorHex') ?? null;

        const variantGeometries = [];
        const isHiRes = meshId.includes('hires');

        for (let i = 0; i < variants.length; i++) {
            const entry = variants[i];
            const scratch = createProceduralMeshAsset(meshId);
            const prefab = scratch?.mesh?.userData?.prefab ?? null;

            if (prefab?.setParam) {
                if (baseColorHex != null) prefab.setParam('baseColorHex', baseColorHex);
                if (tipColorHex != null) prefab.setParam('tipColorHex', tipColorHex);
                if (isHiRes) {
                    prefab.setParam('curvature', entry.curvature);
                    prefab.setParam('bladeBendDegrees', entry.bladeBendDegrees);
                } else {
                    prefab.setParam('bladeBendDegrees', entry.bladeBendDegrees);
                    prefab.setParam('bendDegrees', entry.tipBendDegrees);
                }
            }

            const geo = scratch?.mesh?.geometry?.clone?.() ?? null;
            if (geo) variantGeometries.push(geo);

            scratch?.mesh?.geometry?.dispose?.();
            const mat = scratch?.mesh?.material ?? null;
            if (Array.isArray(mat)) for (const m of mat) m?.dispose?.();
            else mat?.dispose?.();
            const solidMats = scratch?.materials?.solid ?? null;
            if (Array.isArray(solidMats)) for (const m of solidMats) m?.dispose?.();
        }

        this._lod2.variants = variants;
        this._lod2.variantGeometries = variantGeometries;
    }

    _refreshLod2MeshesGeometry() {
        const geos = this._lod2.variantGeometries ?? [];
        const meshes = this._lod2.meshes ?? [];
        if (!geos.length || !meshes.length) return;

        for (let i = 0; i < meshes.length; i++) {
            const mesh = meshes[i];
            const geo = geos[i] ?? geos[0] ?? null;
            if (!mesh || !geo) continue;
            if (mesh.geometry === geo) continue;
            const prev = mesh.geometry;
            mesh.geometry = geo;
            prev?.dispose?.();
        }
    }

    _ensureLod2Distribution(lod, { centerX, centerZ, outerMeters, force = false } = {}) {
        const map = this._map;
        const asset = this._lod2.controlAsset;
        const geos = this._lod2.variantGeometries ?? [];
        if (!map || !asset?.mesh || !geos.length) return;

        const window = getTileIndexRangeForRadius(map, { centerX, centerZ, outerMeters });

        const key = [
            lod?.seed ?? '',
            lod?.densityPerTile ?? 0,
            lod?.bladeMeshId ?? '',
            LOD2_VARIANTS,
            window.tx0,
            window.tx1,
            window.tz0,
            window.tz1
        ].join('|');

        if (!force && key === this._lod2.distributionKey) return;
        this._lod2.distributionKey = key;

        this._rebuildLod2Distribution(lod, window);
        this._recreateLod2Meshes();
    }

    _rebuildLod2Distribution(lod, window) {
        const map = this._map;
        if (!map) return;

        const tx0 = Math.max(0, Number(window?.tx0) || 0);
        const tx1 = Math.min(map.width - 1, Number.isFinite(Number(window?.tx1)) ? Number(window.tx1) : map.width - 1);
        const tz0 = Math.max(0, Number(window?.tz0) || 0);
        const tz1 = Math.min(map.height - 1, Number.isFinite(Number(window?.tz1)) ? Number(window.tz1) : map.height - 1);

        const tilesTotal = tx1 >= tx0 && tz1 >= tz0 ? ((tx1 - tx0 + 1) * (tz1 - tz0 + 1)) : 0;
        const desiredPerTile = Math.max(0, Math.round(Number(lod?.densityPerTile) || 0));
        const maxPerTile = Math.max(0, Math.floor(MAX_INSTANCES_PER_FIELD / Math.max(1, tilesTotal)));
        const perTile = Math.min(desiredPerTile, maxPerTile);

        const variantCount = LOD2_VARIANTS;
        const buckets = Array.from({ length: variantCount }, () => []);

        const baseSeed = hashStringToUint32(lod?.seed ?? 'lod2');
        const roadHalfWidth = Math.max(0, Number(this._roadBounds?.halfWidth) || 0);
        const roadZ0 = Number(this._roadBounds?.z0) || 0;
        const roadZ1 = Number(this._roadBounds?.z1) || 0;
        const roadMargin = 0.35;

        if (tilesTotal > 0 && perTile > 0) {
            for (let tz = tz0; tz <= tz1; tz++) {
                for (let tx = tx0; tx <= tx1; tx++) {
                    const tileSeed = hashCombine(hashCombine(baseSeed, tx + 1), tz + 1);
                    const rng = mulberry32(tileSeed);

                    const cx = map.origin.x + tx * map.tileSize;
                    const cz = map.origin.z + tz * map.tileSize;

                    for (let i = 0; i < perTile; i++) {
                        const x = cx + (rng() - 0.5) * map.tileSize;
                        const z = cz + (rng() - 0.5) * map.tileSize;

                        if (roadHalfWidth > EPS) {
                            if (Math.abs(x) <= roadHalfWidth + roadMargin && z >= Math.min(roadZ0, roadZ1) && z <= Math.max(roadZ0, roadZ1)) {
                                continue;
                            }
                        }

                        const variantIndex = Math.min(variantCount - 1, Math.floor(rng() * variantCount));
                        const yaw01 = rng();
                        buckets[variantIndex].push(x, z, yaw01);
                    }
                }
            }
        }

        this._lod2.instanceData = buckets.map((arr) => new Float32Array(arr));
    }

    _recreateLod2Meshes() {
        const scene = this.scene;
        const asset = this._lod2.controlAsset;
        const geos = this._lod2.variantGeometries ?? [];
        const data = this._lod2.instanceData ?? null;
        if (!scene || !asset?.mesh || !data || !geos.length) return;

        const sharedMaterial = asset.mesh.material;
        const meshes = Array.isArray(this._lod2.meshes) ? this._lod2.meshes : [];

        for (let i = 0; i < data.length; i++) {
            const geo = geos[i] ?? geos[0] ?? null;
            if (!geo) continue;
            const count = Math.max(1, Math.floor((data[i]?.length ?? 0) / 3));

            const prev = meshes[i] ?? null;
            const prevCapacity = prev?.instanceMatrix?.array ? Math.floor(prev.instanceMatrix.array.length / 16) : 0;

            if (prev?.isInstancedMesh && prev.material === sharedMaterial && prevCapacity >= count) {
                if (prev.geometry !== geo) prev.geometry = geo;
                prev.count = 0;
                continue;
            }

            if (prev) scene.remove(prev);

            const mesh = new THREE.InstancedMesh(geo, sharedMaterial, count);
            mesh.name = `LOD2Grass_${i}`;
            mesh.count = 0;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.frustumCulled = false;
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            scene.add(mesh);
            meshes[i] = mesh;
        }

        for (let i = data.length; i < meshes.length; i++) {
            const mesh = meshes[i];
            if (mesh) scene.remove(mesh);
        }
        meshes.length = data.length;
        this._lod2.meshes = meshes;
    }

    _syncLod2DebugMeshes({ enabled, lod }) {
        const scene = this.scene;
        if (!scene) return;

        const wantsFill = enabled && !!lod?.debug?.printRegion;
        const wantsBounds = enabled && !!lod?.debug?.drawBounds;

        const inner = Math.max(0, Number(lod?.region?.innerMeters) || 0);
        const outer = Math.max(inner, Number(lod?.region?.outerMeters) || inner);

        const ensureFill = () => {
            if (!wantsFill) {
                if (this._lod2.debug.fill) {
                    const prev = this._lod2.debug.fill;
                    scene.remove(prev);
                    prev.geometry?.dispose?.();
                    prev.material?.dispose?.();
                    this._lod2.debug.fill = null;
                }
                return;
            }

            const fill = this._lod2.debug.fill;
            if (fill) {
                const nextGeo = inner > EPS ? new THREE.RingGeometry(inner, outer, 72) : new THREE.CircleGeometry(outer, 72);
                nextGeo.rotateX(-Math.PI * 0.5);
                fill.geometry?.dispose?.();
                fill.geometry = nextGeo;
                return;
            }

            const geo = inner > EPS ? new THREE.RingGeometry(inner, outer, 72) : new THREE.CircleGeometry(outer, 72);
            geo.rotateX(-Math.PI * 0.5);
            const mat = new THREE.MeshBasicMaterial({
                color: LOD2_COLOR,
                transparent: true,
                opacity: 0.12,
                depthWrite: false
            });
            mat.toneMapped = false;
            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = 'LOD2RegionFill';
            mesh.renderOrder = 4;
            scene.add(mesh);
            this._lod2.debug.fill = mesh;
        };

        const makeCircleLineGeometry = (radius) => {
            const points = [];
            const seg = 96;
            for (let i = 0; i <= seg; i++) {
                const t = (i / seg) * Math.PI * 2;
                points.push(new THREE.Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
            }
            return new THREE.BufferGeometry().setFromPoints(points);
        };

        const ensureBounds = () => {
            if (!wantsBounds) {
                for (const key of ['inner', 'outer']) {
                    const line = this._lod2.debug[key];
                    if (!line) continue;
                    scene.remove(line);
                    line.geometry?.dispose?.();
                    line.material?.dispose?.();
                    this._lod2.debug[key] = null;
                }
                return;
            }

            if (inner > EPS) {
                const prevInner = this._lod2.debug.inner;
                if (prevInner) {
                    const nextGeo = makeCircleLineGeometry(inner);
                    prevInner.geometry?.dispose?.();
                    prevInner.geometry = nextGeo;
                } else {
                    const geo = makeCircleLineGeometry(inner);
                    const mat = new THREE.LineBasicMaterial({ color: LOD2_COLOR, transparent: true, opacity: 0.6 });
                    mat.toneMapped = false;
                    const line = new THREE.Line(geo, mat);
                    line.name = 'LOD2InnerBound';
                    line.frustumCulled = false;
                    line.renderOrder = 5;
                    scene.add(line);
                    this._lod2.debug.inner = line;
                }
            } else if (this._lod2.debug.inner) {
                const line = this._lod2.debug.inner;
                scene.remove(line);
                line.geometry?.dispose?.();
                line.material?.dispose?.();
                this._lod2.debug.inner = null;
            }

            const prevOuter = this._lod2.debug.outer;
            if (prevOuter) {
                const nextGeo = makeCircleLineGeometry(Math.max(EPS, outer));
                prevOuter.geometry?.dispose?.();
                prevOuter.geometry = nextGeo;
            } else {
                const geo = makeCircleLineGeometry(Math.max(EPS, outer));
                const mat = new THREE.LineBasicMaterial({ color: LOD2_COLOR, transparent: true, opacity: 0.6 });
                mat.toneMapped = false;
                const line = new THREE.Line(geo, mat);
                line.name = 'LOD2OuterBound';
                line.frustumCulled = false;
                line.renderOrder = 5;
                scene.add(line);
                this._lod2.debug.outer = line;
            }
        };

        ensureFill();
        ensureBounds();
    }

    _updateLod2() {
        const scene = this.scene;
        const camera = this.camera;
        const state = this._state;
        if (!scene || !camera || !state?.lod2?.enabled) return;
        const lod = state.lod2;

        const centerX = camera.position.x;
        const centerZ = camera.position.z;

        const yOffset = 0.042;
        if (this._lod2.debug.fill) this._lod2.debug.fill.position.set(centerX, yOffset, centerZ);
        if (this._lod2.debug.inner) this._lod2.debug.inner.position.set(centerX, yOffset, centerZ);
        if (this._lod2.debug.outer) this._lod2.debug.outer.position.set(centerX, yOffset, centerZ);

        const inner = Math.max(0, Number(lod?.region?.innerMeters) || 0);
        const outer = Math.max(inner, Number(lod?.region?.outerMeters) || inner);
        const innerSq = inner * inner;
        const outerSq = outer * outer;

        this._ensureLod2Distribution(lod, { centerX, centerZ, outerMeters: outer });

        const minGrazing = clamp(lod?.angle?.minGrazingDeg, 0, 90, 0);
        const maxGrazing = clamp(lod?.angle?.maxGrazingDeg, 0, 90, 90);

        this._tmp.forward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        const horizLen = Math.hypot(this._tmp.forward.x, this._tmp.forward.z);
        const grazingDeg = radToDeg(Math.atan2(Math.abs(this._tmp.forward.y), Math.max(EPS, horizLen)));
        const angleOk = grazingDeg >= minGrazing - 1e-6 && grazingDeg <= maxGrazing + 1e-6;

        const data = this._lod2.instanceData ?? null;
        const meshes = this._lod2.meshes ?? [];
        if (!data || !meshes.length) return;

        const randomYawDeg = clamp(lod?.randomYawDeg, 0, 360, 360);

        const mat4 = this._tmp.mat4;
        const quat = this._tmp.quat;
        const pos = this._tmp.pos;
        const scale = this._tmp.scale;

        for (let v = 0; v < meshes.length; v++) {
            const mesh = meshes[v];
            const arr = data[v] ?? null;
            if (!mesh || !arr) continue;

            if (!angleOk) {
                mesh.count = 0;
                continue;
            }

            const out = mesh.instanceMatrix.array;
            let write = 0;

            for (let i = 0; i + 2 < arr.length; i += 3) {
                const x = arr[i];
                const z = arr[i + 1];
                const dx = x - centerX;
                const dz = z - centerZ;
                const d2 = dx * dx + dz * dz;
                if (d2 < innerSq || d2 > outerSq) continue;

                const yaw = degToRad(arr[i + 2] * randomYawDeg);
                quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
                pos.set(x, 0, z);
                mat4.compose(pos, quat, scale);
                mat4.toArray(out, write * 16);
                write++;
            }

            mesh.count = write;
            mesh.instanceMatrix.needsUpdate = true;
        }
    }

    _startLoop() {
        if (this._raf) return;
        this._lastT = performance.now();
        const loop = () => {
            this._raf = requestAnimationFrame(loop);
            const now = performance.now();
            const dt = Math.min(0.05, Math.max(0, (now - this._lastT) / 1000));
            this._lastT = now;

            this._updateCameraFromKeys(dt);

            this.controls?.update?.();
            this._updateLod1();
            this._updateLod2();
            this._updateCenterDistanceOverlay({ nowMs: now });
            this._gpuFrameTimer?.beginFrame?.();
            try {
                this.renderer?.render?.(this.scene, this.camera);
            } finally {
                this._gpuFrameTimer?.endFrame?.();
                this._gpuFrameTimer?.poll?.();
            }
            this.onFrame?.({ dt, nowMs: now });
        };
        this._raf = requestAnimationFrame(loop);
    }

    _stopLoop() {
        if (!this._raf) return;
        cancelAnimationFrame(this._raf);
        this._raf = 0;
    }
}
