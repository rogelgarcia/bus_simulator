// src/graphics/gui/window_mesh_debugger/view/WindowMeshDebuggerView.js
// Orchestrates UI, input, and rendering for the Window Mesh Debugger tool.
// @ts-check

import * as THREE from 'three';
import { createToolCameraController } from '../../../engine3d/camera/ToolCameraPrefab.js';
import { getOrCreateGpuFrameTimer } from '../../../engine3d/perf/GpuFrameTimer.js';
import { applyIBLIntensity, applyIBLToScene, loadIBLTexture } from '../../../lighting/IBL.js';
import { DEFAULT_IBL_ID, getIblEntryById } from '../../../content3d/catalogs/IBLCatalog.js';
import { resolvePbrMaterialUrls } from '../../../content3d/catalogs/PbrMaterialCatalog.js';
import { WindowMeshGenerator } from '../../../assets3d/generators/buildings/WindowMeshGenerator.js';
import { getDefaultWindowMeshSettings } from '../../../../app/buildings/window_mesh/index.js';
import { WindowMeshDebuggerUI } from './WindowMeshDebuggerUI.js';

const UP = new THREE.Vector3(0, 1, 0);
const WALL_SPEC = Object.freeze({
    width: 12,
    height: 9,
    depth: 1.6,
    frontZ: 5.0
});
const GRASS_URLS = (() => {
    const base = new URL('../../../../../assets/public/pbr/grass_004/', import.meta.url);
    return Object.freeze({
        baseColorUrl: new URL('basecolor.png', base).toString(),
        normalUrl: new URL('normal_gl.png', base).toString(),
        aoUrl: new URL('ao.png', base).toString(),
        roughnessUrl: new URL('roughness.png', base).toString()
    });
})();
const EPS = 1e-6;

function clamp(value, min, max, fallback) {
    const num = Number(value);
    const fb = fallback === undefined ? min : fallback;
    if (!Number.isFinite(num)) return fb;
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

function setupRepeat(tex, repeat) {
    if (!tex) return;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    const rx = Number(repeat?.x) || 1;
    const ry = Number(repeat?.y) || 1;
    tex.repeat.set(rx, ry);
    const ox = Number(repeat?.offsetX);
    const oy = Number(repeat?.offsetY);
    tex.offset.set(Number.isFinite(ox) ? ox : 0, Number.isFinite(oy) ? oy : 0);
}

function applyWallPlanarUvs(geo, { width, height }) {
    const g = geo?.isBufferGeometry ? geo : null;
    const pos = g?.attributes?.position;
    if (!pos?.isBufferAttribute) return;

    const w = Math.max(1e-6, Number(width) || 1);
    const h = Math.max(1e-6, Number(height) || 1);
    const arr = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        arr[i * 2] = x / w + 0.5;
        arr[i * 2 + 1] = y / h + 0.5;
    }

    const uvAttr = new THREE.BufferAttribute(arr, 2);
    g.setAttribute('uv', uvAttr);
    g.setAttribute('uv2', new THREE.BufferAttribute(arr.slice(0), 2));
}

function buildWallMaterialGeometry({ width, height, depth }) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    applyWallPlanarUvs(geo, { width, height });
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    return geo;
}

function getUvBounds(attr) {
    const a = attr?.isBufferAttribute ? attr : null;
    const arr = a?.array;
    if (!arr || !Number.isFinite(arr.length) || arr.length < 2) return null;

    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;

    for (let i = 0; i < arr.length; i += 2) {
        const u = Number(arr[i]);
        const v = Number(arr[i + 1]);
        if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
    }

    if (!Number.isFinite(minU) || !Number.isFinite(maxU) || !Number.isFinite(minV) || !Number.isFinite(maxV)) return null;
    if (Math.abs(maxU - minU) < EPS || Math.abs(maxV - minV) < EPS) return null;
    return { minU, maxU, minV, maxV };
}

function buildRectOutline(out, { x0, x1, y0, y1, reverse }) {
    if (!reverse) {
        out.moveTo(x0, y0);
        out.lineTo(x1, y0);
        out.lineTo(x1, y1);
        out.lineTo(x0, y1);
        out.lineTo(x0, y0);
        return;
    }
    out.moveTo(x0, y0);
    out.lineTo(x0, y1);
    out.lineTo(x1, y1);
    out.lineTo(x1, y0);
    out.lineTo(x0, y0);
}

function buildArchedOutline(out, { x0, x1, y0, yTop, yChord, archRise, curveSegments, reverse }) {
    if (!(archRise > EPS) || !(Math.abs(x1 - x0) > EPS)) {
        buildRectOutline(out, { x0, x1, y0, y1: yTop, reverse });
        return;
    }

    const w = Math.abs(x1 - x0);
    const hRise = archRise;
    const R = (w * w) / (8 * hRise) + hRise / 2;
    const cx = (x0 + x1) * 0.5;
    const cy = yChord + hRise - R;

    const rightAngle = Math.atan2(yChord - cy, x1 - cx);
    const leftAngle = Math.atan2(yChord - cy, x0 - cx);

    if (!reverse) {
        out.moveTo(x0, y0);
        out.lineTo(x1, y0);
        out.lineTo(x1, yChord);
        out.absarc(cx, cy, R, rightAngle, leftAngle, false);
        out.lineTo(x0, y0);
        return;
    }

    out.moveTo(x0, y0);
    out.lineTo(x0, yChord);
    out.absarc(cx, cy, R, leftAngle, rightAngle, true);
    out.lineTo(x1, y0);
    out.lineTo(x0, y0);
    if (Number.isFinite(curveSegments) && out.curves) {
        for (const c of out.curves) {
            if (c?.isEllipseCurve) c.aClockwise = reverse;
        }
    }
}

function buildWindowOutline(out, { centerX = 0, centerY = 0, width, height, wantsArch, archRise, curveSegments, reverse }) {
    const w = Math.max(0.01, Number(width) || 1);
    const h = Math.max(0.01, Number(height) || 1);

    const x0 = centerX - w * 0.5;
    const x1 = centerX + w * 0.5;
    const y0 = centerY - h * 0.5;
    const yTop = centerY + h * 0.5;

    if (!wantsArch) {
        buildRectOutline(out, { x0, x1, y0, y1: yTop, reverse });
        return;
    }

    const yChord = yTop - archRise;
    buildArchedOutline(out, { x0, x1, y0, yTop, yChord, archRise, curveSegments, reverse });
}

function buildWallMaterialGeometryWithHoles({ width, height, depth, settings, instances, wallCut, curveSegments = 24 } = {}) {
    const w = Math.max(0.01, Number(width) || 1);
    const h = Math.max(0.01, Number(height) || 1);
    const d = Math.max(0.01, Number(depth) || 0.5);

    const outer = new THREE.Shape();
    buildRectOutline(outer, { x0: -w * 0.5, x1: w * 0.5, y0: -h * 0.5, y1: h * 0.5, reverse: false });

    const s = settings ?? null;
    const list = Array.isArray(instances) ? instances : [];
    if (s && list.length) {
        const fw = Number(s?.frame?.width) || 0;
        const cutSrc = wallCut && typeof wallCut === 'object' ? wallCut : {};
        const cutX = clamp(cutSrc.x, 0.0, 1.0, 1.0);
        const cutY = clamp(cutSrc.y, 0.0, 1.0, 1.0);

        const baseWidth = Number(s?.width) || 0;
        const baseHeight = Number(s?.height) || 0;
        const cutWidth = Math.max(EPS, baseWidth - fw * 2 * cutX);
        const cutHeight = Math.max(EPS, baseHeight - fw * 2 * cutY);

        const wantsArch = !!s?.arch?.enabled;
        const archRatio = Number(s?.arch?.heightRatio) || 0;
        const outerArchRise = wantsArch ? (archRatio * baseWidth) : 0;
        const innerWantsArch = wantsArch && outerArchRise > EPS;
        const archRiseCandidate = innerWantsArch ? (archRatio * cutWidth) : 0;
        const archRise = Math.min(archRiseCandidate, Math.max(0, cutHeight - fw * cutY));
        const cutWantsArch = innerWantsArch && archRise > EPS;

        const halfW = cutWidth * 0.5;
        const halfH = cutHeight * 0.5;
        for (const entry of list) {
            const p = entry?.position && typeof entry.position === 'object' ? entry.position : entry;
            const cx = Number(p?.x) || 0;
            const cy = (Number(p?.y) || 0) - h * 0.5;
            if (cx - halfW < -w * 0.5 + EPS) continue;
            if (cx + halfW > w * 0.5 - EPS) continue;
            if (cy - halfH < -h * 0.5 + EPS) continue;
            if (cy + halfH > h * 0.5 - EPS) continue;

            const hole = new THREE.Path();
            buildWindowOutline(hole, {
                centerX: cx,
                centerY: cy,
                width: cutWidth,
                height: cutHeight,
                wantsArch: cutWantsArch,
                archRise,
                curveSegments,
                reverse: true
            });
            outer.holes.push(hole);
        }
    }

    const geo = new THREE.ExtrudeGeometry(outer, {
        depth: d,
        steps: 1,
        bevelEnabled: false,
        curveSegments: Math.max(6, curveSegments | 0)
    });
    geo.translate(0, 0, -d * 0.5);
    applyWallPlanarUvs(geo, { width: w, height: h });
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    return geo;
}

function makeWallMaterial() {
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        metalness: 0.0
    });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 2;
    mat.polygonOffsetUnits = 2;
    return mat;
}

export class WindowMeshDebuggerView {
    constructor({ canvas } = {}) {
        this.canvas = canvas;
        this.onFrame = null;

        this.renderer = null;
        this._gpuFrameTimer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this._ui = null;

        this._raf = 0;
        this._lastT = 0;

        this._windowGenerator = null;
        this._windowGroup = null;
        this._normalMat = null;

        this._ground = null;
        this._groundMat = null;
        this._groundTexCache = new Map();

        this._wall = null;
        this._wallMat = null;
        this._wallTexCache = new Map();
        this._texLoader = new THREE.TextureLoader();
        this._wallSpec = { ...WALL_SPEC };
        this._wallHoleKey = '';
        this._iblKey = '';
        this._iblRequestId = 0;
        this._iblPromise = null;

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
        if (!this.canvas) throw new Error('[WindowMeshDebugger] Missing canvas');
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
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);

        const initialSettings = getDefaultWindowMeshSettings();

        const ui = new WindowMeshDebuggerUI({
            initialSettings,
            onChange: (state) => this._applyUiState(state)
        });
        this._ui = ui;
        ui.mount();

        this.canvas.addEventListener('contextmenu', this._onContextMenu, { passive: false, capture: true });

        this.controls = createToolCameraController(this.camera, this.canvas, {
            uiRoot: ui.root,
            enabled: true,
            enableDamping: true,
            dampingFactor: 0.08,
            rotateSpeed: 0.95,
            panSpeed: 0.9,
            zoomSpeed: 1.0,
            minDistance: 0.25,
            maxDistance: 250,
            minPolarAngle: 0.001,
            maxPolarAngle: Math.PI - 0.001,
            getFocusTarget: () => ({ center: new THREE.Vector3(0, 4.5, 0), radius: 18 }),
            initialPose: {
                position: new THREE.Vector3(12, 9, 18),
                target: new THREE.Vector3(0, 4.5, 0)
            }
        });

        this._windowGenerator = new WindowMeshGenerator({ renderer, curveSegments: 28 });

        this._normalMat = new THREE.MeshNormalMaterial({ wireframe: false });

        this._buildScene();
        const initialState = ui.getState();
        this._applyUiState(initialState);
        void this._applyIblState(initialState?.ibl, { force: true });

        window.addEventListener('resize', this._onResize, { passive: true });
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: false });

        this._resize();
        this._lastT = performance.now();
        this._raf = requestAnimationFrame((t) => this._tick(t));

        requestAnimationFrame(() => {
            const state = this._ui?.getState?.();
            if (state) this._applyUiState(state);
            this._resize();
        });
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;

        this.canvas?.removeEventListener?.('contextmenu', this._onContextMenu, { capture: true });

        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);

        this.controls?.dispose?.();
        this.controls = null;

        this._disposeWindowGroup();
        this._windowGenerator?.dispose?.();
        this._windowGenerator = null;

        for (const tex of this._groundTexCache.values()) tex?.dispose?.();
        this._groundTexCache.clear();
        this._groundMat?.dispose?.();
        this._groundMat = null;
        this._ground?.geometry?.dispose?.();
        this._ground = null;

        for (const tex of this._wallTexCache.values()) tex?.dispose?.();
        this._wallTexCache.clear();

        this._wallMat?.dispose?.();
        this._wallMat = null;
        this._wall?.geometry?.dispose?.();
        this._wall = null;

        this._normalMat?.dispose?.();
        this._normalMat = null;

        this._ui?.unmount?.();
        this._ui = null;

        this.renderer?.dispose?.();
        this.renderer = null;
        this._gpuFrameTimer = null;
        this.scene = null;
        this.camera = null;
    }

    _buildScene() {
        const scene = this.scene;
        if (!scene) return;

        const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x14121a, 0.85);
        scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.position.set(10, 18, 10);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 80;
        sun.shadow.camera.left = -30;
        sun.shadow.camera.right = 30;
        sun.shadow.camera.top = 30;
        sun.shadow.camera.bottom = -30;
        scene.add(sun);

        const groundGeo = new THREE.PlaneGeometry(120, 120);
        const groundUv = groundGeo.attributes.uv;
        if (groundUv?.isBufferAttribute) groundGeo.setAttribute('uv2', new THREE.BufferAttribute(groundUv.array, 2));

        const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);
        this._ground = ground;
        this._groundMat = groundMat;
        this._applyGrassGroundMaterial();

        const { width: wallW, height: wallH, depth: wallD, frontZ: wallFrontZ } = this._wallSpec;
        const wallGeo = buildWallMaterialGeometry({ width: wallW, height: wallH, depth: wallD });
        const wallMat = makeWallMaterial();
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(0, wallH * 0.5, wallFrontZ - wallD * 0.5);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);

        this._wall = wall;
        this._wallMat = wallMat;
    }

    _applyGrassGroundMaterial() {
        const groundMat = this._groundMat;
        const renderer = this.renderer;
        if (!groundMat || !renderer) return;

        const rep = 120 / 2.0;
        const repeat = { x: rep, y: rep };

        const applyTexture = (url, { srgb }) => {
            const safeUrl = typeof url === 'string' && url ? url : null;
            if (!safeUrl) return null;
            const cached = this._groundTexCache.get(safeUrl);
            if (cached) return cached;

            const tex = this._texLoader.load(safeUrl);
            tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy?.() ?? 16);
            applyTextureColorSpace(tex, { srgb: !!srgb });
            setupRepeat(tex, repeat);
            tex.needsUpdate = true;
            this._groundTexCache.set(safeUrl, tex);
            return tex;
        };

        groundMat.map = applyTexture(GRASS_URLS.baseColorUrl, { srgb: true });
        groundMat.normalMap = applyTexture(GRASS_URLS.normalUrl, { srgb: false });
        groundMat.aoMap = applyTexture(GRASS_URLS.aoUrl, { srgb: false });
        groundMat.roughnessMap = applyTexture(GRASS_URLS.roughnessUrl, { srgb: false });
        groundMat.roughness = 1.0;
        groundMat.metalness = 0.0;

        groundMat.needsUpdate = true;
    }

    async _applyIblState(iblState, { force = false } = {}) {
        const scene = this.scene;
        const renderer = this.renderer;
        if (!scene || !renderer) return;

        const src = iblState && typeof iblState === 'object' ? iblState : {};
        const enabled = src.enabled !== undefined ? !!src.enabled : true;
        const setBackground = src.setBackground !== undefined ? !!src.setBackground : true;
        const envMapIntensity = clamp(src.envMapIntensity, 0.0, 5.0, 0.25);
        const desiredId = typeof src.iblId === 'string' ? src.iblId : DEFAULT_IBL_ID;
        const entry = getIblEntryById(desiredId) ?? getIblEntryById(DEFAULT_IBL_ID);
        const hdrUrl = entry?.hdrUrl ?? '';

        const key = [
            enabled ? 1 : 0,
            setBackground ? 1 : 0,
            Math.round(envMapIntensity * 1000),
            entry?.id ?? ''
        ].join('|');

        if (!force && key === this._iblKey) return this._iblPromise;
        this._iblKey = key;
        const requestId = ++this._iblRequestId;

        if (!enabled || !hdrUrl) {
            applyIBLToScene(scene, null, { enabled: false, setBackground: false, hdrUrl });
            this._iblPromise = null;
            return null;
        }

        const promise = (async () => {
            const env = await loadIBLTexture(renderer, { hdrUrl, enabled: true });
            if (requestId !== this._iblRequestId) return;
            if (!env) return;
            applyIBLToScene(scene, env, { enabled: true, setBackground, hdrUrl });
            applyIBLIntensity(scene, { enabled: true, envMapIntensity }, { force: true });
        })();

        this._iblPromise = promise;
        return promise;
    }

    _disposeWindowGroup() {
        if (!this._windowGroup) return;
        const group = this._windowGroup;
        this._windowGroup = null;
        this.scene?.remove?.(group);

        const ownedGeos = group?.userData?.ownedGeometries ?? [];
        for (const geo of Array.isArray(ownedGeos) ? ownedGeos : []) geo?.dispose?.();

        const mats = group?.userData?.materials ?? null;
        if (mats && typeof mats === 'object') {
            const uniq = new Set(Object.values(mats));
            for (const mat of uniq) mat?.dispose?.();
        }
    }

    _applyUiState(state) {
        if (!this._windowGenerator || !this.scene) return;
        const s = state?.settings ?? null;
        const seed = String(state?.seed ?? 'window');
        const renderMode = String(state?.renderMode ?? 'solid');
        const layers = state?.layers ?? {};

        this._disposeWindowGroup();
        const instances = this._makeDemoInstances(s);
        this._rebuildWallGeometry({
            settings: s,
            instances,
            wallCut: { x: state?.wallCutWidthLerp, y: state?.wallCutHeightLerp }
        });
        this._applyWallMaterial(String(state?.wallMaterialId ?? ''), {
            roughness: state?.wallRoughness,
            normalIntensity: state?.wallNormalIntensity
        });
        const group = this._windowGenerator.createWindowGroup({ settings: s, seed, instances });
        this._windowGroup = group;
        this.scene.add(group);

        const layerRefs = group.userData?.layers ?? null;
        if (layerRefs) {
            if (layerRefs.frame) layerRefs.frame.visible = layers.frame !== false;
            if (layerRefs.muntins) layerRefs.muntins.visible = layers.muntins !== false;
            if (layerRefs.glass) layerRefs.glass.visible = layers.glass !== false;
            if (layerRefs.shade) layerRefs.shade.visible = layers.shade !== false;
            if (layerRefs.interior) layerRefs.interior.visible = layers.interior !== false;
        }

        this._applyRenderMode(renderMode);
        this._ui?.setInteriorOverlayData?.({
            seed,
            atlasId: s?.interior?.atlasId ?? '',
            cols: s?.interior?.atlas?.cols ?? 0,
            rows: s?.interior?.atlas?.rows ?? 0,
            items: group.userData?.instanceVariations ?? []
        });
        void this._applyIblState(state?.ibl);
    }

    _rebuildWallGeometry({ settings, instances, wallCut }) {
        const wall = this._wall;
        if (!wall) return;

        const { width, height, depth } = this._wallSpec;
        const fw = Number(settings?.frame?.width) || 0;
        const w = Number(settings?.width) || 0;
        const h = Number(settings?.height) || 0;
        const archEnabled = !!settings?.arch?.enabled;
        const archRatio = Number(settings?.arch?.heightRatio) || 0;
        const cutSrc = wallCut && typeof wallCut === 'object' ? wallCut : {};
        const cutX = clamp(cutSrc.x, 0.0, 1.0, 1.0);
        const cutY = clamp(cutSrc.y, 0.0, 1.0, 1.0);
        const key = [
            `ww:${Math.round(w * 1000)}`,
            `wh:${Math.round(h * 1000)}`,
            `fw:${Math.round(fw * 1000)}`,
            `arch:${archEnabled ? 1 : 0}`,
            `ar:${Math.round(archRatio * 1000)}`,
            `cx:${Math.round(cutX * 1000)}`,
            `cy:${Math.round(cutY * 1000)}`,
            `n:${Array.isArray(instances) ? instances.length : 0}`
        ].join('|');
        if (key === this._wallHoleKey) return;
        this._wallHoleKey = key;

        const nextGeo = buildWallMaterialGeometryWithHoles({
            width,
            height,
            depth,
            settings,
            instances,
            wallCut: { x: cutX, y: cutY },
            curveSegments: 28
        });
        wall.geometry?.dispose?.();
        wall.geometry = nextGeo;
    }

    _applyRenderMode(mode) {
        const group = this._windowGroup;
        if (!group) return;

        const meshList = [];
        group.traverse((obj) => { if (obj?.isMesh) meshList.push(obj); });

        const mats = group.userData?.materials ?? null;
        if (mode === 'normals') {
            for (const m of meshList) m.material = this._normalMat;
            return;
        }

        for (const m of meshList) {
            const name = String(m?.parent?.name ?? '');
            if (!mats) continue;
            if (name === 'frame') m.material = mats.frameMat;
            else if (name === 'muntins') m.material = mats.muntinMat;
            else if (name === 'glass') m.material = mats.glassMat;
            else if (name === 'shade') m.material = mats.shadeMat;
            else if (name === 'interior') m.material = mats.interiorMat;
        }

        const wireframe = mode === 'wireframe';
        if (mats && typeof mats === 'object') {
            const uniq = new Set(Object.values(mats));
            for (const mat of uniq) {
                if (mat && 'wireframe' in mat) mat.wireframe = wireframe;
                mat?.needsUpdate && (mat.needsUpdate = true);
            }
        }
    }

    _makeDemoInstances(settings) {
        const floorCount = 3;
        const windowsPerFloor = 3;
        const floorHeight = 3.0;
        const spanX = 8.0;
        const baseY = 0.85;
        const { frontZ: wallFrontZ } = this._wallSpec;
        const frameDepth = Number(settings?.frame?.depth) || 0;
        const zFace = wallFrontZ - frameDepth + 0.001;

        const out = [];
        for (let floor = 0; floor < floorCount; floor++) {
            for (let col = 0; col < windowsPerFloor; col++) {
                const x = (col - (windowsPerFloor - 1) * 0.5) * (spanX / (windowsPerFloor - 1));
                const y = floor * floorHeight + baseY + floorHeight * 0.35;
                out.push({
                    id: `f${floor}_c${col}`,
                    position: { x, y, z: zFace + 0.001 },
                    yaw: 0
                });
            }
        }
        return out;
    }

    _applyWallMaterial(materialId, { roughness, normalIntensity } = {}) {
        const wallMat = this._wallMat;
        const wall = this._wall;
        const renderer = this.renderer;
        if (!wallMat || !renderer) return;

        const wallRoughness = clamp(roughness, 0.0, 1.0, 0.85);
        const wallNormalIntensity = clamp(normalIntensity, 0.0, 5.0, 1.0);

        const wallRepeat = (() => {
            const tilesX = 3;
            const tilesY = 3;

            const bounds = getUvBounds(wall?.geometry?.attributes?.uv);
            if (bounds) {
                const uRange = Math.max(EPS, bounds.maxU - bounds.minU);
                const vRange = Math.max(EPS, bounds.maxV - bounds.minV);
                const rx = tilesX / uRange;
                const ry = tilesY / vRange;
                return { x: rx, y: ry, offsetX: -bounds.minU * rx, offsetY: -bounds.minV * ry };
            }

            const w = Math.max(0.01, Number(this._wallSpec?.width) || 1);
            const h = Math.max(0.01, Number(this._wallSpec?.height) || 1);
            const rx = tilesX / w;
            const ry = tilesY / h;
            return { x: rx, y: ry, offsetX: tilesX * 0.5, offsetY: tilesY * 0.5 };
        })();

        const id = typeof materialId === 'string' ? materialId : '';
        const urls = resolvePbrMaterialUrls(id);
        const baseUrl = urls?.baseColorUrl ?? null;
        const normalUrl = urls?.normalUrl ?? null;
        const ormUrl = urls?.ormUrl ?? null;

        const applyTexture = (url, { srgb }) => {
            const safeUrl = typeof url === 'string' && url ? url : null;
            if (!safeUrl) return null;
            const cached = this._wallTexCache.get(safeUrl);
            if (cached) {
                setupRepeat(cached, wallRepeat);
                return cached;
            }

            const tex = this._texLoader.load(safeUrl);
            tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy?.() ?? 16);
            applyTextureColorSpace(tex, { srgb: !!srgb });
            setupRepeat(tex, wallRepeat);
            tex.needsUpdate = true;
            this._wallTexCache.set(safeUrl, tex);
            return tex;
        };

        wallMat.map = applyTexture(baseUrl, { srgb: true });
        wallMat.normalMap = applyTexture(normalUrl, { srgb: false });
        if (wallMat.normalScale) wallMat.normalScale.set(wallNormalIntensity, wallNormalIntensity);

        const orm = applyTexture(ormUrl, { srgb: false });
        wallMat.roughnessMap = orm;
        wallMat.metalnessMap = orm;
        wallMat.aoMap = orm;
        wallMat.roughness = wallRoughness;
        wallMat.metalness = 0.0;

        wallMat.needsUpdate = true;
    }

    _handleKey(e, isDown) {
        if (!e) return;
        if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
        const code = e.code;
        if (!(code in this._keys)) return;
        e.preventDefault();
        this._keys[code] = !!isDown;
    }

    _updateCameraFromKeys(dt) {
        const controls = this.controls;
        const camera = this.camera;
        if (!controls || !camera) return;

        const moveX = (this._keys.ArrowRight || this._keys.KeyD ? 1 : 0) - (this._keys.ArrowLeft || this._keys.KeyA ? 1 : 0);
        const moveZ = (this._keys.ArrowDown || this._keys.KeyS ? 1 : 0) - (this._keys.ArrowUp || this._keys.KeyW ? 1 : 0);
        if (!moveX && !moveZ) return;

        const isFast = this._keys.ShiftLeft || this._keys.ShiftRight;
        const speed = (isFast ? 18 : 8) * Math.max(0.001, dt);

        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() < 1e-8) return;
        forward.normalize();

        const right = forward.clone().cross(UP).normalize();
        const move = new THREE.Vector3();
        move.addScaledVector(right, moveX);
        move.addScaledVector(forward, moveZ);
        if (move.lengthSq() < 1e-8) return;
        move.normalize().multiplyScalar(speed);
        controls.panWorld?.(move.x, move.y, move.z);
    }

    _resize() {
        const renderer = this.renderer;
        const camera = this.camera;
        const canvas = this.canvas;
        if (!renderer || !camera || !canvas) return;

        const rect = canvas.getBoundingClientRect?.() ?? null;
        const w = Math.max(1, Math.floor(rect?.width ?? canvas.clientWidth ?? 1));
        const h = Math.max(1, Math.floor(rect?.height ?? canvas.clientHeight ?? 1));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix?.();
    }

    _tick(t) {
        const renderer = this.renderer;
        const scene = this.scene;
        const camera = this.camera;
        if (!renderer || !scene || !camera) return;

        const now = Number(t) || 0;
        const dt = this._lastT ? Math.min(0.05, Math.max(0, (now - this._lastT) / 1000)) : 0;
        this._lastT = now;

        this._updateCameraFromKeys(dt);
        this.controls?.update?.(dt);

        this._gpuFrameTimer?.beginFrame?.();
        renderer.render(scene, camera);
        this._gpuFrameTimer?.endFrame?.();
        this._gpuFrameTimer?.poll?.();
        const onFrame = this.onFrame;
        if (typeof onFrame === 'function') onFrame({ dt, nowMs: now, renderer });
        this._raf = requestAnimationFrame((ts) => this._tick(ts));
    }
}
