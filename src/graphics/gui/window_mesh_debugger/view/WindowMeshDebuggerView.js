// src/graphics/gui/window_mesh_debugger/view/WindowMeshDebuggerView.js
// Orchestrates UI, input, and rendering for the Window Mesh Debugger tool.
// @ts-check

import * as THREE from 'three';
import { createToolCameraController } from '../../../engine3d/camera/ToolCameraPrefab.js';
import { getOrCreateGpuFrameTimer } from '../../../engine3d/perf/GpuFrameTimer.js';
import { applyIBLIntensity, applyIBLToScene, loadIBLTexture } from '../../../lighting/IBL.js';
import { DEFAULT_IBL_ID, getIblEntryById } from '../../../content3d/catalogs/IBLCatalog.js';
import { PbrTextureLoaderService } from '../../../content3d/materials/PbrTexturePipeline.js';
import { primePbrAssetsAvailability } from '../../../content3d/materials/PbrAssetsRuntime.js';
import { WindowMeshGenerator } from '../../../assets3d/generators/buildings/WindowMeshGenerator.js';
import {
    getDefaultWindowMeshSettings,
    sanitizeWindowMeshSettings,
    WINDOW_FABRICATION_ASSET_TYPE
} from '../../../../app/buildings/window_mesh/index.js';
import { WindowMeshDebuggerUI } from './WindowMeshDebuggerUI.js';
import { WindowMeshDecorationsRig } from './WindowMeshDecorationsRig.js';

const UP = new THREE.Vector3(0, 1, 0);
const WALL_SPEC = Object.freeze({
    width: 12,
    height: 9,
    depth: 1.6,
    frontZ: 5.0
});
const GROUND_MATERIAL_ID = 'pbr.grass_004';
const GARAGE_INTERIOR_MATERIAL_ID = 'pbr.concrete_layers_02';
const GARAGE_FACADE_STATE = Object.freeze({
    OPEN: 'open',
    CLOSED: 'closed'
});
const GARAGE_FACADE_ROTATION_DEGREES = Object.freeze({
    DEG_0: 0,
    DEG_90: 90
});
const EPS = 1e-6;

function clamp(value, min, max, fallback) {
    const num = Number(value);
    const fb = fallback === undefined ? min : fallback;
    if (!Number.isFinite(num)) return fb;
    return Math.max(min, Math.min(max, num));
}

function normalizeWallSpec(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return { ...WALL_SPEC };
    const width = clamp(src.width, 0.5, 64.0, WALL_SPEC.width);
    const height = clamp(src.height, 0.5, 64.0, WALL_SPEC.height);
    const depth = clamp(src.depth, 0.05, 16.0, WALL_SPEC.depth);
    const frontZ = clamp(src.frontZ, -64.0, 64.0, WALL_SPEC.frontZ);
    return { width, height, depth, frontZ };
}

function normalizePreviewGrid(value) {
    const src = value && typeof value === 'object' ? value : null;
    const rows = clamp(src?.rows, 1, 8, 3) | 0;
    const cols = clamp(src?.cols, 1, 8, 3) | 0;
    return { rows, cols };
}

function normalizeDebuggerAssetType(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WINDOW_FABRICATION_ASSET_TYPE.DOOR) return WINDOW_FABRICATION_ASSET_TYPE.DOOR;
    if (raw === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) return WINDOW_FABRICATION_ASSET_TYPE.GARAGE;
    return WINDOW_FABRICATION_ASSET_TYPE.WINDOW;
}

function normalizeGarageFacadeState(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === GARAGE_FACADE_STATE.OPEN) return GARAGE_FACADE_STATE.OPEN;
    return GARAGE_FACADE_STATE.CLOSED;
}

function normalizeGarageFacadeRotationDegrees(value) {
    const num = Number(value);
    if (Number.isFinite(num) && Math.abs(num - GARAGE_FACADE_ROTATION_DEGREES.DEG_90) < 0.5) {
        return GARAGE_FACADE_ROTATION_DEGREES.DEG_90;
    }
    return GARAGE_FACADE_ROTATION_DEGREES.DEG_0;
}

function resolveOpeningCutMetrics(settings, wallCut) {
    const s = settings ?? null;
    const cutSrc = wallCut && typeof wallCut === 'object' ? wallCut : {};
    const fw = Number(s?.frame?.width) || 0;
    const frameOpenBottom = !!s?.frame?.openBottom;
    const cutX = clamp(cutSrc.x, -1.0, 1.0, 0.0);
    const cutY = clamp(cutSrc.y, -1.0, 1.0, 0.0);
    const baseWidth = Number(s?.width) || 0;
    const baseHeight = Number(s?.height) || 0;
    const xMargin = fw * cutX;
    const topMargin = fw * cutY;
    const bottomMargin = frameOpenBottom ? 0 : topMargin;
    const cutCenterYOffset = (bottomMargin - topMargin) * 0.5;
    const cutWidth = Math.max(EPS, baseWidth - xMargin * 2);
    const cutHeight = Math.max(EPS, baseHeight - topMargin - bottomMargin);
    return {
        frameWidth: fw,
        frameOpenBottom,
        baseWidth,
        baseHeight,
        xMargin,
        topMargin,
        bottomMargin,
        cutCenterYOffset,
        cutWidth,
        cutHeight,
        cutX,
        cutY
    };
}

function deepClone(obj) {
    return obj && typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : obj;
}

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
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
    if (Object.prototype.hasOwnProperty.call(repeat ?? {}, 'rotationDegrees')) {
        const deg = normalizeGarageFacadeRotationDegrees(repeat?.rotationDegrees);
        tex.center.set(0.5, 0.5);
        tex.rotation = deg === GARAGE_FACADE_ROTATION_DEGREES.DEG_90 ? (Math.PI * 0.5) : 0;
    }
}

function applyWallPlanarUvs(geo, { width, height }) {
    const g = geo?.isBufferGeometry ? geo : null;
    const pos = g?.attributes?.position;
    if (!pos?.isBufferAttribute) return;

    let normals = g?.attributes?.normal;
    if (!normals?.isBufferAttribute || normals.count !== pos.count) {
        g.computeVertexNormals();
        normals = g?.attributes?.normal;
    }

    const arr = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);

        const nx = Number(normals?.getX(i)) || 0;
        const ny = Number(normals?.getY(i)) || 0;
        const nz = Number(normals?.getZ(i)) || 0;
        const ay = Math.abs(ny);
        const az = Math.abs(nz);

        // Use face-relative projection so inset/reveal side walls align to their own plane.
        let u = x;
        let v = y;
        if (az >= 0.75) {
            u = x;
            v = y;
        } else if (ay >= 0.9) {
            u = x;
            v = z;
        } else {
            u = z;
            v = y;
        }

        arr[i * 2] = u;
        arr[i * 2 + 1] = v;
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
        const frameOpenBottom = !!s?.frame?.openBottom;
        const cutSrc = wallCut && typeof wallCut === 'object' ? wallCut : {};
        const cutX = clamp(cutSrc.x, -1.0, 1.0, 0.0);
        const cutY = clamp(cutSrc.y, -1.0, 1.0, 0.0);

        const baseWidth = Number(s?.width) || 0;
        const baseHeight = Number(s?.height) || 0;
        const xMargin = fw * cutX;
        const topMargin = fw * cutY;
        const bottomMargin = frameOpenBottom ? 0 : topMargin;
        const cutCenterYOffset = (bottomMargin - topMargin) * 0.5;
        const cutWidth = Math.max(EPS, baseWidth - xMargin * 2);
        const cutHeight = Math.max(EPS, baseHeight - topMargin - bottomMargin);

        const wantsArch = !!s?.arch?.enabled;
        const archRatio = Number(s?.arch?.heightRatio) || 0;
        const outerArchRise = wantsArch ? (archRatio * baseWidth) : 0;
        const innerWantsArch = wantsArch && outerArchRise > EPS;
        const archRiseCandidate = innerWantsArch ? (archRatio * cutWidth) : 0;
        const archRise = Math.min(archRiseCandidate, Math.max(0, cutHeight - topMargin));
        const cutWantsArch = innerWantsArch && archRise > EPS;

        const halfW = cutWidth * 0.5;
        const halfH = cutHeight * 0.5;
        for (const entry of list) {
            const p = entry?.position && typeof entry.position === 'object' ? entry.position : entry;
            const cx = Number(p?.x) || 0;
            const cy = (Number(p?.y) || 0) - h * 0.5 + cutCenterYOffset;
            if (cx - halfW < -w * 0.5 - EPS) continue;
            if (cx + halfW > w * 0.5 + EPS) continue;
            if (cy - halfH < -h * 0.5 - EPS) continue;
            if (cy + halfH > h * 0.5 + EPS) continue;

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

function buildWallCutFillGeometries({ width, height, depth, settings, instances, wallCut, curveSegments = 24 } = {}) {
    const w = Math.max(0.01, Number(width) || 1);
    const h = Math.max(0.01, Number(height) || 1);
    const d = Math.max(0.01, Number(depth) || 0.5);
    const s = settings ?? null;
    const list = Array.isArray(instances) ? instances : [];
    if (!s || !list.length) return [];

    const fw = Number(s?.frame?.width) || 0;
    const frameInset = Math.max(0, Number(s?.frame?.inset) || 0);
    const frameOpenBottom = !!s?.frame?.openBottom;
    const cutSrc = wallCut && typeof wallCut === 'object' ? wallCut : {};
    const cutX = clamp(cutSrc.x, -1.0, 1.0, 0.0);
    const cutY = clamp(cutSrc.y, -1.0, 1.0, 0.0);

    const baseWidth = Number(s?.width) || 0;
    const baseHeight = Number(s?.height) || 0;
    if (!(baseWidth > EPS) || !(baseHeight > EPS)) return [];

    const xMargin = fw * cutX;
    const topMargin = fw * cutY;
    const bottomMargin = frameOpenBottom ? 0 : topMargin;
    const cutCenterYOffset = (bottomMargin - topMargin) * 0.5;
    const cutWidth = Math.max(EPS, baseWidth - xMargin * 2);
    const cutHeight = Math.max(EPS, baseHeight - topMargin - bottomMargin);

    const wantsArch = !!s?.arch?.enabled;
    const archRatio = Number(s?.arch?.heightRatio) || 0;
    const outerArchRise = wantsArch ? (archRatio * baseWidth) : 0;
    const outerWantsArch = wantsArch && outerArchRise > EPS;
    const cutArchRiseCandidate = outerWantsArch ? (archRatio * cutWidth) : 0;
    const cutArchRise = Math.min(cutArchRiseCandidate, Math.max(0, cutHeight - topMargin));
    const cutWantsArch = outerWantsArch && cutArchRise > EPS;

    const cutHalfW = cutWidth * 0.5;
    const cutHalfH = cutHeight * 0.5;
    const winHalfW = baseWidth * 0.5;
    const winHalfH = baseHeight * 0.5;
    const geos = [];

    for (const entry of list) {
        const p = entry?.position && typeof entry.position === 'object' ? entry.position : entry;
        const cx = Number(p?.x) || 0;
        const windowCy = (Number(p?.y) || 0) - h * 0.5;
        const cutCy = windowCy + cutCenterYOffset;

        if (cx - cutHalfW < -w * 0.5 - EPS) continue;
        if (cx + cutHalfW > w * 0.5 + EPS) continue;
        if (cutCy - cutHalfH < -h * 0.5 - EPS) continue;
        if (cutCy + cutHalfH > h * 0.5 + EPS) continue;

        const cutLeft = cx - cutHalfW;
        const cutRight = cx + cutHalfW;
        const cutBottom = cutCy - cutHalfH;
        const cutTop = cutCy + cutHalfH;
        const winLeft = cx - winHalfW;
        const winRight = cx + winHalfW;
        const winBottom = windowCy - winHalfH;
        const winTop = windowCy + winHalfH;
        const cutExpandsBeyondWindow = cutLeft < winLeft - EPS
            || cutRight > winRight + EPS
            || cutBottom < winBottom - EPS
            || cutTop > winTop + EPS;
        if (!cutExpandsBeyondWindow) continue;

        const shape = new THREE.Shape();
        buildWindowOutline(shape, {
            centerX: cx,
            centerY: cutCy,
            width: cutWidth,
            height: cutHeight,
            wantsArch: cutWantsArch,
            archRise: cutArchRise,
            curveSegments,
            reverse: false
        });

        const hole = new THREE.Path();
        buildWindowOutline(hole, {
            centerX: cx,
            centerY: windowCy,
            width: baseWidth,
            height: baseHeight,
            wantsArch: outerWantsArch,
            archRise: outerArchRise,
            curveSegments,
            reverse: true
        });
        shape.holes.push(hole);

        const geo = new THREE.ShapeGeometry(shape, Math.max(6, curveSegments | 0));
        // Place fill at the same local Z plane as the inset window front.
        const windowPlaneZ = d * 0.5 - frameInset;
        geo.translate(0, 0, windowPlaneZ - 1e-4);
        applyWallPlanarUvs(geo, { width: w, height: h });
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        geos.push(geo);
    }

    return geos;
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

function disposeGeneratedWindowGroup(group) {
    const g = group && group.isObject3D ? group : null;
    if (!g) return;

    const ownedGeos = g.userData?.ownedGeometries ?? [];
    for (const geo of Array.isArray(ownedGeos) ? ownedGeos : []) geo?.dispose?.();

    const mats = g.userData?.materials ?? null;
    if (mats && typeof mats === 'object') {
        const uniq = new Set(Object.values(mats));
        for (const mat of uniq) mat?.dispose?.();
    }
}

function makeDataUrlFromRgbaPixels({ pixels, width, height, outputWidth = null, outputHeight = null } = {}) {
    const src = pixels instanceof Uint8Array ? pixels : null;
    const w = Math.max(1, Math.floor(Number(width) || 0));
    const h = Math.max(1, Math.floor(Number(height) || 0));
    if (!src || src.length < w * h * 4) return null;
    const outW = Math.max(1, Math.floor(Number(outputWidth) || w));
    const outH = Math.max(1, Math.floor(Number(outputHeight) || h));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
        const srcY = h - 1 - y;
        const srcRow = srcY * w * 4;
        const dstRow = y * w * 4;
        imageData.data.set(src.subarray(srcRow, srcRow + w * 4), dstRow);
    }
    ctx.putImageData(imageData, 0, 0);

    if (outW === w && outH === h) return canvas.toDataURL('image/png');

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return canvas.toDataURL('image/png');
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(canvas, 0, 0, outW, outH);
    return outCanvas.toDataURL('image/png');
}

export class WindowMeshDebuggerView {
    constructor({
        canvas,
        uiParent = null,
        uiEmbedded = false,
        uiTitle = null,
        uiSubtitle = null,
        initialSettings = null,
        onSettingsChange = null,
        onClose = null,
        wallSpec = null,
        previewGrid = null
    } = {}) {
        this.canvas = canvas;
        this.onFrame = null;
        this._uiParent = uiParent ?? null;
        this._uiEmbedded = !!uiEmbedded;
        this._uiTitle = typeof uiTitle === 'string' ? uiTitle : null;
        this._uiSubtitle = typeof uiSubtitle === 'string' ? uiSubtitle : null;
        this._initialSettings = initialSettings && typeof initialSettings === 'object' ? sanitizeWindowMeshSettings(initialSettings) : null;
        this._onSettingsChange = typeof onSettingsChange === 'function' ? onSettingsChange : null;
        this._onClose = typeof onClose === 'function' ? onClose : null;

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
        this._decorations = null;
        this._normalMat = null;

        this._ground = null;
        this._groundMat = null;
        this._groundTexCache = new Map();
        this._pbrTextureService = null;

        this._wall = null;
        this._wallMat = null;
        this._wallCutFillGroup = null;
        this._garageFacadeGroup = null;
        this._wallTexCache = new Map();
        this._wallSpec = normalizeWallSpec(wallSpec);
        this._previewGrid = normalizePreviewGrid(previewGrid);
        this._wallHoleKey = '';
        this._wallCutFillKey = '';
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

        const pbrAssetsReadyPromise = primePbrAssetsAvailability().catch(() => false);

        if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;

        const renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            premultipliedAlpha: false
        });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

        if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
        else renderer.outputEncoding = THREE.sRGBEncoding;

        if ('useLegacyLights' in renderer) renderer.useLegacyLights = true;

        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;

        this.renderer = renderer;
        this._pbrTextureService = new PbrTextureLoaderService({
            renderer: this.renderer
        });
        this._gpuFrameTimer = getOrCreateGpuFrameTimer(renderer);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);

        const initialSettings = this._initialSettings ? sanitizeWindowMeshSettings(this._initialSettings) : getDefaultWindowMeshSettings();

        const ui = new WindowMeshDebuggerUI({
            title: this._uiTitle ?? undefined,
            subtitle: this._uiSubtitle ?? undefined,
            embedded: this._uiEmbedded,
            initialSettings,
            captureThumbnail: (request) => this._captureThumbnailDataUrl(request),
            onChange: (state) => {
                this._applyUiState(state);
                this._onSettingsChange?.(deepClone(state?.settings));
            },
            onClose: this._onClose
        });
        this._ui = ui;
        ui.mount({ parent: this._uiParent });

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

        this._decorations = new WindowMeshDecorationsRig({ renderer });
        this.scene.add(this._decorations.group);

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

        void pbrAssetsReadyPromise.then((available) => {
            if (!available) return;
            this._applyGrassGroundMaterial();
            const state = this._ui?.getState?.();
            if (state) this._applyUiState(state);
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

        if (this._decorations) {
            this.scene?.remove?.(this._decorations.group);
            this._decorations.dispose();
            this._decorations = null;
        }

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

        this._disposeWallCutFillGeometry();
        this._wallCutFillGroup = null;
        this._disposeGarageFacadeGeometry();
        this._garageFacadeGroup = null;

        this._wallMat?.dispose?.();
        this._wallMat = null;
        this._wall?.geometry?.dispose?.();
        this._wall = null;

        this._normalMat?.dispose?.();
        this._normalMat = null;

        this._ui?.unmount?.();
        this._ui = null;

        this._pbrTextureService?.dispose?.();
        this._pbrTextureService = null;

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

        const cutFillGroup = new THREE.Group();
        cutFillGroup.name = 'wall_cut_fill';
        wall.add(cutFillGroup);

        const garageFacadeGroup = new THREE.Group();
        garageFacadeGroup.name = 'garage_facade';
        wall.add(garageFacadeGroup);

        scene.add(wall);

        this._wall = wall;
        this._wallMat = wallMat;
        this._wallCutFillGroup = cutFillGroup;
        this._garageFacadeGroup = garageFacadeGroup;
    }

    _resolvePbrMaterialPayload(materialId, {
        calibrationOverrides = undefined,
        localOverrides = null,
        cloneTextures = false,
        repeat = null,
        uvSpace = 'meters',
        surfaceSizeMeters = null,
        repeatScale = 1.0,
        diagnosticsTag = 'WindowMeshDebuggerView'
    } = {}) {
        const id = typeof materialId === 'string' ? materialId.trim() : '';
        if (!id || !this._pbrTextureService) return null;
        return this._pbrTextureService.resolveMaterial(id, {
            calibrationOverrides,
            localOverrides,
            cloneTextures,
            repeat,
            uvSpace,
            surfaceSizeMeters,
            repeatScale,
            diagnosticsTag
        });
    }

    _applyGrassGroundMaterial() {
        const groundMat = this._groundMat;
        if (!groundMat) return;

        const rep = 120 / 2.0;
        const resolved = this._resolvePbrMaterialPayload(GROUND_MATERIAL_ID, {
            cloneTextures: false,
            repeat: { x: rep, y: rep },
            diagnosticsTag: 'WindowMeshDebuggerView.ground'
        });
        const tex = resolved?.textures ?? {};

        groundMat.map = tex.baseColor ?? null;
        groundMat.normalMap = tex.normal ?? null;
        if (tex.orm) {
            groundMat.aoMap = tex.orm;
            groundMat.roughnessMap = tex.orm;
            groundMat.metalnessMap = tex.orm;
            groundMat.metalness = 1.0;
        } else {
            groundMat.aoMap = tex.ao ?? null;
            groundMat.roughnessMap = tex.roughness ?? null;
            groundMat.metalnessMap = tex.metalness ?? null;
            groundMat.metalness = 0.0;
        }
        groundMat.roughness = 1.0;

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
        const baseSettings = state?.settings && typeof state.settings === 'object'
            ? state.settings
            : getDefaultWindowMeshSettings();
        const seed = String(state?.seed ?? 'window');
        const assetType = normalizeDebuggerAssetType(state?.assetType);
        const renderMode = String(state?.renderMode ?? 'solid');
        const wallCut = { x: state?.wallCutWidthLerp, y: state?.wallCutHeightLerp };

        let s = sanitizeWindowMeshSettings(baseSettings);
        let layers = state?.layers && typeof state.layers === 'object' ? { ...state.layers } : {};
        if (assetType === WINDOW_FABRICATION_ASSET_TYPE.DOOR) {
            s = sanitizeWindowMeshSettings({
                ...s,
                arch: { ...s.arch, enabled: false },
                frame: { ...s.frame, openBottom: true },
                interior: {
                    ...s.interior,
                    enabled: false,
                    parallaxInteriorPresetId: null,
                    parallaxDepthMeters: 0.0,
                    parallaxScale: { x: 0.0, y: 0.0 }
                }
            });
            layers = { ...layers, interior: false };
        } else if (assetType === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) {
            s = sanitizeWindowMeshSettings({
                ...s,
                arch: { ...s.arch, enabled: false },
                frame: { ...s.frame, openBottom: true, addHandles: false },
                muntins: { ...s.muntins, enabled: false, columns: 1, rows: 1 },
                shade: { ...s.shade, enabled: false },
                interior: {
                    ...s.interior,
                    enabled: false,
                    parallaxInteriorPresetId: null,
                    parallaxDepthMeters: 0.0,
                    parallaxScale: { x: 0.0, y: 0.0 }
                }
            });
            layers = {
                ...layers,
                muntins: false,
                glass: false,
                shade: false,
                interior: false
            };
        } else {
            s = sanitizeWindowMeshSettings({
                ...s,
                frame: { ...s.frame, openBottom: false }
            });
        }

        const garageFacade = state?.garageFacade && typeof state.garageFacade === 'object'
            ? state.garageFacade
            : {};
        const resolvedGarageFacade = {
            state: normalizeGarageFacadeState(garageFacade.state),
            closedMaterialId: String(garageFacade.closedMaterialId ?? ''),
            rotationDegrees: normalizeGarageFacadeRotationDegrees(garageFacade.rotationDegrees)
        };

        this._disposeWindowGroup();
        const instances = this._makeDemoInstances(s, { assetType });
        this._rebuildWallGeometry({
            settings: s,
            instances,
            wallCut,
            layoutMode: assetType
        });
        this._applyWallMaterial(String(state?.wallMaterialId ?? ''), {
            roughness: state?.wallRoughness,
            normalIntensity: state?.wallNormalIntensity
        });
        this._rebuildGarageFacadeGeometry({
            assetType,
            settings: s,
            instances,
            wallCut,
            garageFacade: resolvedGarageFacade,
            renderMode
        });
        const group = this._windowGenerator.createWindowGroup({ settings: s, seed, instances });
        this._windowGroup = group;
        this.scene.add(group);

        this._decorations?.update({
            wallFrontZ: this._wallSpec.frontZ,
            windowSettings: s,
            instances,
            wallMaterial: {
                materialId: String(state?.wallMaterialId ?? ''),
                roughness: Number(state?.wallRoughness),
                normalIntensity: Number(state?.wallNormalIntensity)
            }
        }, assetType === WINDOW_FABRICATION_ASSET_TYPE.GARAGE ? null : state?.decoration);

        const iblEnabled = state?.ibl?.enabled !== undefined ? !!state.ibl.enabled : true;
        const iblIntensity = clamp(state?.ibl?.envMapIntensity, 0.0, 5.0, 0.25);
        applyIBLIntensity(this.scene, { enabled: iblEnabled, envMapIntensity: iblIntensity }, { force: true });

        if (state?.debug?.bevelExaggerate) {
            const mats = group.userData?.materials ?? null;
            const factor = 2.5;
            if (mats && typeof mats === 'object') {
                const uniq = new Set([mats.frameMat, mats.muntinMat]);
                for (const mat of uniq) {
                    if (mat?.normalScale?.multiplyScalar) mat.normalScale.multiplyScalar(factor);
                }
            }
        }

        const layerRefs = group.userData?.layers ?? null;
        if (layerRefs) {
            if (layerRefs.frame) layerRefs.frame.visible = layers.frame !== false;
            if (layerRefs.muntins) layerRefs.muntins.visible = layers.muntins !== false;
            if (layerRefs.glass) layerRefs.glass.visible = layers.glass !== false;
            if (layerRefs.shade) layerRefs.shade.visible = layers.shade !== false;
            if (layerRefs.interior) layerRefs.interior.visible = layers.interior !== false;
        }

        this._applyRenderMode(renderMode);
        this._decorations?.setRenderMode(renderMode, this._normalMat);
        this._ui?.setInteriorOverlayData?.({
            seed,
            atlasId: s?.interior?.atlasId ?? '',
            cols: s?.interior?.atlas?.cols ?? 0,
            rows: s?.interior?.atlas?.rows ?? 0,
            items: group.userData?.instanceVariations ?? []
        });
        void this._applyIblState(state?.ibl);
    }

    _rebuildWallGeometry({ settings, instances, wallCut, layoutMode = 'window' }) {
        const wall = this._wall;
        if (!wall) return;

        const { width, height, depth } = this._wallSpec;
        const fw = Number(settings?.frame?.width) || 0;
        const w = Number(settings?.width) || 0;
        const h = Number(settings?.height) || 0;
        const archEnabled = !!settings?.arch?.enabled;
        const archRatio = Number(settings?.arch?.heightRatio) || 0;
        const cutSrc = wallCut && typeof wallCut === 'object' ? wallCut : {};
        const cutX = clamp(cutSrc.x, -1.0, 1.0, 0.0);
        const cutY = clamp(cutSrc.y, -1.0, 1.0, 0.0);
        const mode = normalizeDebuggerAssetType(layoutMode);
        const key = [
            `ww:${Math.round(w * 1000)}`,
            `wh:${Math.round(h * 1000)}`,
            `fw:${Math.round(fw * 1000)}`,
            `arch:${archEnabled ? 1 : 0}`,
            `ar:${Math.round(archRatio * 1000)}`,
            `cx:${Math.round(cutX * 1000)}`,
            `cy:${Math.round(cutY * 1000)}`,
            `lm:${mode === WINDOW_FABRICATION_ASSET_TYPE.DOOR ? 'd' : (mode === WINDOW_FABRICATION_ASSET_TYPE.GARAGE ? 'g' : 'w')}`,
            `n:${Array.isArray(instances) ? instances.length : 0}`
        ].join('|');
        if (key !== this._wallHoleKey) {
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

        const fillInset = Math.max(0, Number(settings?.frame?.inset) || 0);
        const fillKey = `${key}|fi:${Math.round(fillInset * 1000)}`;
        if (fillKey !== this._wallCutFillKey) {
            this._wallCutFillKey = fillKey;
            this._rebuildWallCutFillGeometry({
                settings,
                instances,
                wallCut: { x: cutX, y: cutY }
            });
        }
    }

    _disposeWallCutFillGeometry() {
        const host = this._wallCutFillGroup;
        if (!host) return;
        const children = Array.from(host.children);
        for (const child of children) {
            host.remove(child);
            child?.geometry?.dispose?.();
        }
    }

    _rebuildWallCutFillGeometry({ settings, instances, wallCut } = {}) {
        const host = this._wallCutFillGroup;
        const wallMat = this._wallMat;
        if (!host || !wallMat) return;

        this._disposeWallCutFillGeometry();

        const { width, height, depth } = this._wallSpec;
        const geos = buildWallCutFillGeometries({
            width,
            height,
            depth,
            settings,
            instances,
            wallCut,
            curveSegments: 28
        });
        if (!geos.length) return;

        for (const geo of geos) {
            const mesh = new THREE.Mesh(geo, wallMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            host.add(mesh);
        }
    }

    _disposeGarageFacadeGeometry() {
        const host = this._garageFacadeGroup;
        if (!host) return;
        const children = Array.from(host.children);
        const ownedMaterials = new Set();
        const ownedTextures = new Set();
        for (const child of children) {
            host.remove(child);
            child?.traverse?.((obj) => {
                if (!obj?.isMesh) return;
                obj.geometry?.dispose?.();
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                for (const mat of mats) {
                    if (!mat || mat === this._normalMat) continue;
                    ownedMaterials.add(mat);
                    for (const tex of [mat.map, mat.normalMap, mat.aoMap, mat.roughnessMap, mat.metalnessMap]) {
                        if (tex?.isTexture) ownedTextures.add(tex);
                    }
                }
            });
        }
        for (const mat of ownedMaterials) mat?.dispose?.();
        for (const tex of ownedTextures) tex?.dispose?.();
    }

    _createPbrStandardMaterial(materialId, {
        repeat = null,
        cloneTextures = false,
        localOverrides = null,
        defaultRoughness = 0.8,
        defaultMetalness = 0.0,
        normalStrength = 1.0,
        side = THREE.FrontSide,
        wireframe = false,
        diagnosticsTag = 'WindowMeshDebuggerView.pbr'
    } = {}) {
        const mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: defaultRoughness,
            metalness: defaultMetalness,
            side
        });

        const id = typeof materialId === 'string' ? materialId.trim() : '';
        const resolved = this._resolvePbrMaterialPayload(id, {
            cloneTextures: !!cloneTextures,
            repeat,
            localOverrides,
            diagnosticsTag
        });
        const tex = resolved?.textures ?? {};

        mat.map = tex.baseColor ?? null;
        mat.normalMap = tex.normal ?? null;
        setupRepeat(mat.map, repeat);
        setupRepeat(mat.normalMap, repeat);

        if (tex.orm) {
            mat.aoMap = tex.orm;
            mat.roughnessMap = tex.orm;
            mat.metalnessMap = tex.orm;
            setupRepeat(tex.orm, repeat);
            mat.metalness = 1.0;
        } else {
            mat.aoMap = tex.ao ?? null;
            mat.roughnessMap = tex.roughness ?? null;
            mat.metalnessMap = tex.metalness ?? null;
            setupRepeat(mat.aoMap, repeat);
            setupRepeat(mat.roughnessMap, repeat);
            setupRepeat(mat.metalnessMap, repeat);
            mat.metalness = tex.metalness ? 1.0 : defaultMetalness;
        }

        if (mat.normalScale) mat.normalScale.set(normalStrength, normalStrength);
        mat.roughness = defaultRoughness;
        mat.wireframe = !!wireframe;
        mat.needsUpdate = true;
        return mat;
    }

    _rebuildGarageFacadeGeometry({
        assetType,
        settings,
        instances,
        wallCut,
        garageFacade,
        renderMode
    } = {}) {
        this._disposeGarageFacadeGeometry();
        if (assetType !== WINDOW_FABRICATION_ASSET_TYPE.GARAGE) return;

        const host = this._garageFacadeGroup;
        if (!host) return;

        const list = Array.isArray(instances) ? instances : [];
        const first = list[0] ?? null;
        const p = first?.position && typeof first.position === 'object' ? first.position : first;
        if (!p) return;

        const metrics = resolveOpeningCutMetrics(settings, wallCut);
        const openingWidth = Number(metrics.cutWidth) || 0;
        const openingHeight = Number(metrics.cutHeight) || 0;
        if (!(openingWidth > EPS) || !(openingHeight > EPS)) return;

        const wallHeight = Math.max(EPS, Number(this._wallSpec?.height) || WALL_SPEC.height);
        const wallDepth = Math.max(EPS, Number(this._wallSpec?.depth) || WALL_SPEC.depth);
        const frameInset = Math.max(0.0, Number(settings?.frame?.inset) || 0.0);
        const centerX = Number(p?.x) || 0;
        const centerY = (Number(p?.y) || 0) + metrics.cutCenterYOffset - wallHeight * 0.5;
        const wallFrontLocalZ = wallDepth * 0.5;
        const wireframe = renderMode === 'wireframe';
        const normals = renderMode === 'normals';
        const facade = garageFacade && typeof garageFacade === 'object' ? garageFacade : {};
        const facadeState = normalizeGarageFacadeState(facade.state);
        const facadeRotationDegrees = normalizeGarageFacadeRotationDegrees(facade.rotationDegrees);

        if (facadeState === GARAGE_FACADE_STATE.CLOSED) {
            const panelGeo = new THREE.PlaneGeometry(openingWidth, openingHeight);
            const panelMaterial = normals
                ? this._normalMat
                : this._createPbrStandardMaterial(String(facade.closedMaterialId ?? ''), {
                    cloneTextures: true,
                    repeat: {
                        x: Math.max(1.0, openingWidth / 0.75),
                        y: Math.max(1.0, openingHeight / 0.75),
                        rotationDegrees: facadeRotationDegrees
                    },
                    localOverrides: {
                        roughness: 0.48,
                        metalness: 0.92,
                        normalStrength: 1.0
                    },
                    defaultRoughness: 0.48,
                    defaultMetalness: 0.92,
                    normalStrength: 1.0,
                    wireframe,
                    diagnosticsTag: 'WindowMeshDebuggerView.garage.closed_panel'
                });
            const panelMesh = new THREE.Mesh(panelGeo, panelMaterial);
            panelMesh.position.set(centerX, centerY, wallFrontLocalZ - Math.max(0.01, frameInset + 0.01));
            panelMesh.castShadow = true;
            panelMesh.receiveShadow = true;
            host.add(panelMesh);
            return;
        }

        const roomDepth = Math.max(0.1, wallDepth * 0.5);
        const roomWidth = Math.max(openingWidth + 0.8, openingWidth * 1.28);
        const roomHeight = Math.max(openingHeight + 0.7, openingHeight * 1.22);
        const roomGeo = new THREE.BoxGeometry(roomWidth, roomHeight, roomDepth);
        const roomMaterial = normals
            ? this._normalMat
            : this._createPbrStandardMaterial(GARAGE_INTERIOR_MATERIAL_ID, {
                cloneTextures: true,
                repeat: {
                    x: Math.max(1.0, roomWidth / 1.6),
                    y: Math.max(1.0, roomHeight / 1.6)
                },
                localOverrides: {
                    roughness: 0.92,
                    metalness: 0.0,
                    normalStrength: 1.0
                },
                defaultRoughness: 0.92,
                defaultMetalness: 0.0,
                normalStrength: 1.0,
                side: THREE.BackSide,
                wireframe,
                diagnosticsTag: 'WindowMeshDebuggerView.garage.interior_room'
            });
        const roomFrontLocalZ = wallFrontLocalZ - Math.max(0.02, frameInset + 0.02);
        const roomCenterZ = roomFrontLocalZ - roomDepth * 0.5;
        const roomMesh = new THREE.Mesh(roomGeo, roomMaterial);
        roomMesh.position.set(centerX, centerY, roomCenterZ);
        roomMesh.castShadow = true;
        roomMesh.receiveShadow = true;
        host.add(roomMesh);
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

    _makeDemoInstances(settings, { assetType = 'window' } = {}) {
        const kind = normalizeDebuggerAssetType(assetType);
        const { frontZ: wallFrontZ } = this._wallSpec;
        const frameDepth = Number(settings?.frame?.depth) || 0;
        const zFace = wallFrontZ - frameDepth + 0.001;

        if (kind === WINDOW_FABRICATION_ASSET_TYPE.DOOR || kind === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) {
            const openingHeight = Math.max(0.4, Number(settings?.height) || 2.2);
            const idPrefix = kind === WINDOW_FABRICATION_ASSET_TYPE.GARAGE ? 'garage' : 'door';
            return [{
                id: `${idPrefix}_0`,
                position: { x: 0, y: openingHeight * 0.5, z: zFace + 0.001 },
                yaw: 0
            }];
        }

        const floorCount = Math.max(1, this._previewGrid?.rows | 0);
        const windowsPerFloor = Math.max(1, this._previewGrid?.cols | 0);
        const wallWidth = Math.max(0.5, Number(this._wallSpec?.width) || WALL_SPEC.width);
        const wallHeight = Math.max(0.5, Number(this._wallSpec?.height) || WALL_SPEC.height);
        const floorHeight = windowsPerFloor > 1 ? Math.max(0.8, wallHeight / Math.max(2, floorCount + 1)) : Math.max(0.8, wallHeight * 0.33);
        const spanX = Math.max(0.5, wallWidth * 0.66);
        const baseY = Math.max(0.35, wallHeight * 0.12);

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

    _captureThumbnailDataUrl(request = {}) {
        const renderer = this.renderer;
        const generator = this._windowGenerator;
        if (!renderer || !generator) return null;

        const req = request && typeof request === 'object' ? request : {};
        const assetType = normalizeDebuggerAssetType(req.assetType);
        const baseSettings = req.settings && typeof req.settings === 'object'
            ? req.settings
            : (this._ui?.getState?.()?.settings ?? getDefaultWindowMeshSettings());
        let settings = sanitizeWindowMeshSettings(baseSettings);
        if (assetType === WINDOW_FABRICATION_ASSET_TYPE.DOOR) {
            settings = sanitizeWindowMeshSettings({
                ...settings,
                arch: { ...settings.arch, enabled: false },
                frame: { ...settings.frame, openBottom: true },
                interior: {
                    ...settings.interior,
                    enabled: false,
                    parallaxInteriorPresetId: null,
                    parallaxDepthMeters: 0.0,
                    parallaxScale: { x: 0.0, y: 0.0 }
                }
            });
        } else if (assetType === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) {
            settings = sanitizeWindowMeshSettings({
                ...settings,
                arch: { ...settings.arch, enabled: false },
                frame: { ...settings.frame, openBottom: true, addHandles: false },
                muntins: { ...settings.muntins, enabled: false, columns: 1, rows: 1 },
                shade: { ...settings.shade, enabled: false },
                interior: {
                    ...settings.interior,
                    enabled: false,
                    parallaxInteriorPresetId: null,
                    parallaxDepthMeters: 0.0,
                    parallaxScale: { x: 0.0, y: 0.0 }
                }
            });
        } else {
            settings = sanitizeWindowMeshSettings({
                ...settings,
                frame: { ...settings.frame, openBottom: false }
            });
        }

        const uiState = this._ui?.getState?.() ?? null;
        const uiGarageFacade = uiState?.garageFacade && typeof uiState.garageFacade === 'object' ? uiState.garageFacade : {};
        const reqGarageFacade = req.garageFacade && typeof req.garageFacade === 'object' ? req.garageFacade : {};
        const garageFacadeState = normalizeGarageFacadeState(reqGarageFacade.state ?? uiGarageFacade.state);
        const garageClosedMaterialId = String(reqGarageFacade.closedMaterialId ?? uiGarageFacade.closedMaterialId ?? '');
        const garageFacadeRotationDegrees = normalizeGarageFacadeRotationDegrees(
            reqGarageFacade.rotationDegrees ?? uiGarageFacade.rotationDegrees
        );
        const wallReq = req.wall && typeof req.wall === 'object' ? req.wall : {};
        const wallMaterialId = typeof wallReq.materialId === 'string'
            ? wallReq.materialId
            : String(uiState?.wallMaterialId ?? '');
        const wallRoughness = clamp(wallReq.roughness, 0.0, 1.0, Number(uiState?.wallRoughness) || 0.85);
        const wallNormalIntensity = clamp(wallReq.normalIntensity, 0.0, 5.0, Number(uiState?.wallNormalIntensity) || 1.0);
        const wallCutX = clamp(wallReq.cutWidthLerp, -1.0, 1.0, 0.0);
        const wallCutY = clamp(wallReq.cutHeightLerp, -1.0, 1.0, 0.0);
        const seed = typeof req.seed === 'string' ? req.seed : String(uiState?.seed ?? 'window-thumb');
        const reason = String(req.reason ?? '');
        const isCatalogPickerThumb = reason === 'catalog_picker_entry_thumbnail';
        const baseThumbSize = Math.max(128, Math.min(1024, Math.round(Number(req.maxSize) || 384)));
        const thumbHeight = isCatalogPickerThumb ? Math.max(128, Math.min(2048, baseThumbSize * 2)) : baseThumbSize;
        const thumbWidth = isCatalogPickerThumb ? thumbHeight : baseThumbSize;
        const sampleScale = isCatalogPickerThumb ? 2 : 1;
        const rtWidth = Math.max(1, Math.round(thumbWidth * sampleScale));
        const rtHeight = Math.max(1, Math.round(thumbHeight * sampleScale));
        const skyBgColor = 0xb8ddff;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(skyBgColor);

        const hemi = new THREE.HemisphereLight(0xd9e8ff, 0x1b1b1e, 0.92);
        hemi.position.set(0, 1, 0);
        scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 1.15);
        sun.position.set(2.5, 4.0, 3.2);
        scene.add(sun);

        const winW = Math.max(0.25, Number(settings?.width) || 1.0);
        const winH = Math.max(0.25, Number(settings?.height) || 1.0);
        const wallScale = 1.2;
        const wallW = winW * wallScale;
        const wallH = winH * wallScale;
        const wallDepth = Math.max(0.1, Math.min(0.7, Math.max(wallW, wallH) * 0.12));
        const wallFrontZ = 0.0;
        const windowCenterY = wallH * 0.5;
        const doorCenterY = winH * 0.5;
        const openingCenterY = assetType === WINDOW_FABRICATION_ASSET_TYPE.WINDOW ? windowCenterY : doorCenterY;
        const holeInstances = [{
            id: 'thumb_hole_0',
            position: { x: 0, y: openingCenterY, z: 0 },
            yaw: 0
        }];

        const wallGeo = buildWallMaterialGeometryWithHoles({
            width: wallW,
            height: wallH,
            depth: wallDepth,
            settings,
            instances: holeInstances,
            wallCut: { x: wallCutX, y: wallCutY },
            curveSegments: 28
        });
        const wallMat = makeWallMaterial();
        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.position.set(0, wallH * 0.5, wallFrontZ - wallDepth * 0.5);
        scene.add(wallMesh);

        const frameDepth = Number(settings?.frame?.depth) || 0;
        const zFace = wallFrontZ - frameDepth + 0.001;
        const instances = [{
            id: 'thumb_0',
            position: { x: 0, y: openingCenterY, z: zFace + 0.001 },
            yaw: 0
        }];
        const windowGroup = generator.createWindowGroup({ settings, seed, instances });
        scene.add(windowGroup);
        const layerRefs = windowGroup.userData?.layers ?? null;
        if (layerRefs) {
            if (assetType === WINDOW_FABRICATION_ASSET_TYPE.DOOR) {
                if (layerRefs.interior) layerRefs.interior.visible = false;
            } else if (assetType === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) {
                if (layerRefs.muntins) layerRefs.muntins.visible = false;
                if (layerRefs.glass) layerRefs.glass.visible = false;
                if (layerRefs.shade) layerRefs.shade.visible = false;
                if (layerRefs.interior) layerRefs.interior.visible = false;
            }
        }
        const thumbExtraMeshes = [];
        const thumbOwnedMaterials = new Set();

        const wallRepeat = { x: 3, y: 3, offsetX: 0, offsetY: 0 };
        const thumbOwnedTextures = new Set();
        const trackThumbTexture = (texObj) => {
            if (texObj?.isTexture) thumbOwnedTextures.add(texObj);
        };
        const trackMaterialTextures = (mat) => {
            if (!mat || typeof mat !== 'object') return;
            trackThumbTexture(mat.map);
            trackThumbTexture(mat.normalMap);
            trackThumbTexture(mat.aoMap);
            trackThumbTexture(mat.roughnessMap);
            trackThumbTexture(mat.metalnessMap);
        };
        const resolved = this._resolvePbrMaterialPayload(wallMaterialId, {
            cloneTextures: true,
            repeat: { x: wallRepeat.x, y: wallRepeat.y },
            localOverrides: {
                roughness: wallRoughness,
                normalStrength: wallNormalIntensity
            },
            diagnosticsTag: 'WindowMeshDebuggerView.thumbnail.wall'
        });
        const tex = resolved?.textures ?? {};
        wallMat.map = tex.baseColor ?? null;
        wallMat.normalMap = tex.normal ?? null;
        trackThumbTexture(wallMat.map);
        trackThumbTexture(wallMat.normalMap);
        setupRepeat(wallMat.map, wallRepeat);
        setupRepeat(wallMat.normalMap, wallRepeat);

        if (tex.orm) {
            wallMat.roughnessMap = tex.orm;
            wallMat.metalnessMap = tex.orm;
            wallMat.aoMap = tex.orm;
            trackThumbTexture(wallMat.roughnessMap);
            trackThumbTexture(wallMat.metalnessMap);
            trackThumbTexture(wallMat.aoMap);
            setupRepeat(tex.orm, wallRepeat);
        } else {
            wallMat.aoMap = tex.ao ?? null;
            wallMat.roughnessMap = tex.roughness ?? null;
            wallMat.metalnessMap = tex.metalness ?? null;
            trackThumbTexture(wallMat.aoMap);
            trackThumbTexture(wallMat.roughnessMap);
            trackThumbTexture(wallMat.metalnessMap);
            setupRepeat(wallMat.aoMap, wallRepeat);
            setupRepeat(wallMat.roughnessMap, wallRepeat);
            setupRepeat(wallMat.metalnessMap, wallRepeat);
        }
        if (wallMat.normalScale) wallMat.normalScale.set(wallNormalIntensity, wallNormalIntensity);
        wallMat.roughness = wallRoughness;
        wallMat.metalness = 0.0;
        wallMat.needsUpdate = true;

        if (assetType === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) {
            const metrics = resolveOpeningCutMetrics(settings, { x: wallCutX, y: wallCutY });
            const openW = Math.max(EPS, Number(metrics.cutWidth) || winW);
            const openH = Math.max(EPS, Number(metrics.cutHeight) || winH);
            const openCenterY = openingCenterY + metrics.cutCenterYOffset;
            const wallFrontLocalZ = wallDepth * 0.5;
            const frameInset = Math.max(0.0, Number(settings?.frame?.inset) || 0.0);
            const wallLocalCenterY = openCenterY - wallH * 0.5;

            if (garageFacadeState === GARAGE_FACADE_STATE.CLOSED) {
                const panelGeo = new THREE.PlaneGeometry(openW, openH);
                const panelMat = this._createPbrStandardMaterial(garageClosedMaterialId, {
                    cloneTextures: true,
                    repeat: {
                        x: Math.max(1.0, openW / 0.75),
                        y: Math.max(1.0, openH / 0.75),
                        rotationDegrees: garageFacadeRotationDegrees
                    },
                    localOverrides: {
                        roughness: 0.48,
                        metalness: 0.92,
                        normalStrength: 1.0
                    },
                    defaultRoughness: 0.48,
                    defaultMetalness: 0.92,
                    normalStrength: 1.0,
                    diagnosticsTag: 'WindowMeshDebuggerView.thumbnail.garage.closed_panel'
                });
                const panelMesh = new THREE.Mesh(panelGeo, panelMat);
                panelMesh.position.set(0, wallLocalCenterY, wallFrontLocalZ - Math.max(0.01, frameInset + 0.01));
                scene.add(panelMesh);
                thumbExtraMeshes.push(panelMesh);
                thumbOwnedMaterials.add(panelMat);
                trackMaterialTextures(panelMat);
            } else {
                const roomDepth = Math.max(0.1, wallDepth * 0.5);
                const roomWidth = Math.max(openW + 0.8, openW * 1.28);
                const roomHeight = Math.max(openH + 0.7, openH * 1.22);
                const roomGeo = new THREE.BoxGeometry(roomWidth, roomHeight, roomDepth);
                const roomMat = this._createPbrStandardMaterial(GARAGE_INTERIOR_MATERIAL_ID, {
                    cloneTextures: true,
                    repeat: {
                        x: Math.max(1.0, roomWidth / 1.6),
                        y: Math.max(1.0, roomHeight / 1.6)
                    },
                    localOverrides: {
                        roughness: 0.92,
                        metalness: 0.0,
                        normalStrength: 1.0
                    },
                    defaultRoughness: 0.92,
                    defaultMetalness: 0.0,
                    normalStrength: 1.0,
                    side: THREE.BackSide,
                    diagnosticsTag: 'WindowMeshDebuggerView.thumbnail.garage.interior_room'
                });
                const roomFrontLocalZ = wallFrontLocalZ - Math.max(0.02, frameInset + 0.02);
                const roomCenterZ = roomFrontLocalZ - roomDepth * 0.5;
                const roomMesh = new THREE.Mesh(roomGeo, roomMat);
                roomMesh.position.set(0, wallLocalCenterY, roomCenterZ);
                scene.add(roomMesh);
                thumbExtraMeshes.push(roomMesh);
                thumbOwnedMaterials.add(roomMat);
                trackMaterialTextures(roomMat);
            }
        }

        const target = new THREE.Vector3(0, wallH * 0.5, wallFrontZ - wallDepth * 0.5);
        const aspect = thumbWidth / Math.max(1, thumbHeight);
        const camera = new THREE.PerspectiveCamera(38, aspect, 0.05, 100);
        const vFovRad = THREE.MathUtils.degToRad(camera.fov);
        const hFovRad = 2 * Math.atan(Math.tan(vFovRad * 0.5) * camera.aspect);
        const distV = (wallH * 0.5) / Math.max(EPS, Math.tan(vFovRad * 0.5));
        const distH = (wallW * 0.5) / Math.max(EPS, Math.tan(hFovRad * 0.5));
        const dist = Math.max(distV, distH) * 1.08;
        const dir = new THREE.Vector3(0.24, -0.16, 1.0).normalize();
        camera.position.copy(target).addScaledVector(dir, dist);
        camera.near = Math.max(0.01, dist - Math.max(wallW, wallH) * 6.0);
        camera.far = dist + Math.max(wallW, wallH) * 8.0;
        camera.lookAt(target);
        camera.updateProjectionMatrix();

        const rt = new THREE.WebGLRenderTarget(rtWidth, rtHeight, {
            depthBuffer: true,
            stencilBuffer: false
        });

        const prevTarget = renderer.getRenderTarget?.() ?? null;
        const prevClearColor = new THREE.Color();
        renderer.getClearColor(prevClearColor);
        const prevClearAlpha = renderer.getClearAlpha();
        const prevAutoClear = renderer.autoClear;
        const prevXrEnabled = renderer.xr?.enabled;

        let dataUrl = null;
        try {
            if (renderer.xr) renderer.xr.enabled = false;
            renderer.autoClear = true;
            renderer.setClearColor(skyBgColor, 1.0);
            renderer.setRenderTarget(rt);
            renderer.clear(true, true, true);
            renderer.render(scene, camera);

            const pixels = new Uint8Array(rtWidth * rtHeight * 4);
            renderer.readRenderTargetPixels(rt, 0, 0, rtWidth, rtHeight, pixels);
            dataUrl = makeDataUrlFromRgbaPixels({
                pixels,
                width: rtWidth,
                height: rtHeight,
                outputWidth: thumbWidth,
                outputHeight: thumbHeight
            });
        } catch (err) {
            console.warn('[WindowMeshDebuggerView] Thumbnail capture failed.', err);
            dataUrl = null;
        } finally {
            renderer.setRenderTarget(prevTarget ?? null);
            renderer.setClearColor(prevClearColor, prevClearAlpha);
            renderer.autoClear = prevAutoClear;
            if (renderer.xr && typeof prevXrEnabled === 'boolean') renderer.xr.enabled = prevXrEnabled;

            for (const mesh of thumbExtraMeshes) {
                scene.remove(mesh);
                mesh?.geometry?.dispose?.();
            }
            scene.remove(windowGroup);
            scene.remove(wallMesh);
            disposeGeneratedWindowGroup(windowGroup);
            for (const mat of thumbOwnedMaterials) mat?.dispose?.();
            for (const texObj of thumbOwnedTextures) texObj?.dispose?.();
            wallGeo.dispose();
            wallMat.dispose();
            rt.dispose();
        }

        return dataUrl;
    }

    _applyWallMaterial(materialId, { roughness, normalIntensity } = {}) {
        const wallMat = this._wallMat;
        const wall = this._wall;
        if (!wallMat) return;

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
        const resolved = this._resolvePbrMaterialPayload(id, {
            cloneTextures: false,
            repeat: { x: wallRepeat.x, y: wallRepeat.y },
            localOverrides: {
                roughness: wallRoughness,
                normalStrength: wallNormalIntensity
            },
            diagnosticsTag: 'WindowMeshDebuggerView.wall'
        });
        const tex = resolved?.textures ?? {};

        wallMat.map = tex.baseColor ?? null;
        wallMat.normalMap = tex.normal ?? null;
        setupRepeat(wallMat.map, wallRepeat);
        setupRepeat(wallMat.normalMap, wallRepeat);

        if (tex.orm) {
            wallMat.roughnessMap = tex.orm;
            wallMat.metalnessMap = tex.orm;
            wallMat.aoMap = tex.orm;
            setupRepeat(tex.orm, wallRepeat);
        } else {
            wallMat.aoMap = tex.ao ?? null;
            wallMat.roughnessMap = tex.roughness ?? null;
            wallMat.metalnessMap = tex.metalness ?? null;
            setupRepeat(wallMat.aoMap, wallRepeat);
            setupRepeat(wallMat.roughnessMap, wallRepeat);
            setupRepeat(wallMat.metalnessMap, wallRepeat);
        }

        if (wallMat.normalScale) wallMat.normalScale.set(wallNormalIntensity, wallNormalIntensity);
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
