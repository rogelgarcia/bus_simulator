// src/graphics/gui/building_fabrication2/BuildingFabrication2View.js
// Orchestrates UI and 3D rendering for Building Fabrication 2.
import * as THREE from 'three';

import { getBuildingConfigById, getBuildingConfigs } from '../../content3d/catalogs/BuildingConfigCatalog.js';
import { createLayerId } from '../../assets3d/generators/building_fabrication/BuildingFabricationTypes.js';
import {
    buildingConfigIdToFileBaseName,
    createCityBuildingConfigFromFabrication,
    sanitizeBuildingConfigId,
    sanitizeBuildingConfigName,
    serializeCityBuildingConfigToEsModule
} from '../../../app/city/buildings/BuildingConfigExport.js';
import { getDefaultWindowMeshSettings, sanitizeWindowMeshSettings } from '../../../app/buildings/window_mesh/index.js';

import { BuildingFabrication2Scene } from './BuildingFabrication2Scene.js';
import { BuildingFabrication2ThumbnailRenderer } from './BuildingFabrication2ThumbnailRenderer.js';
import { BuildingFabrication2UI } from './BuildingFabrication2UI.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';
import { WindowFabricationPopup } from '../building_fabrication/WindowFabricationPopup.js';
import { MaterialPickerPopupController } from '../shared/material_picker/MaterialPickerPopupController.js';

const UP = new THREE.Vector3(0, 1, 0);

function deepClone(value) {
    if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
        return out;
    }
    return value;
}

function isTextEditingElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    if (target?.isContentEditable) return true;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

const FACE_IDS = Object.freeze(['A', 'B', 'C', 'D']);
const DEFAULT_FACE_LINKS = Object.freeze({ C: 'A', D: 'B' });
const ADJACENT_FACE_IDS_BY_FACE_ID = Object.freeze({
    A: Object.freeze(['B', 'D']),
    B: Object.freeze(['A', 'C']),
    C: Object.freeze(['B', 'D']),
    D: Object.freeze(['A', 'C'])
});
const ADJACENT_FACE_IDS_BY_VERTEX_INDEX = Object.freeze({
    0: Object.freeze(['D', 'A']),
    1: Object.freeze(['A', 'B']),
    2: Object.freeze(['B', 'C']),
    3: Object.freeze(['C', 'D'])
});
const FLOOR_COUNT_MIN = 1;
const FLOOR_COUNT_MAX = 30;
const FLOOR_HEIGHT_MIN = 1.0;
const FLOOR_HEIGHT_MAX = 12.0;
const BAY_MIN_WIDTH_M = 0.1;
const BAY_DEFAULT_WIDTH_M = 1.0;
const BAY_DEPTH_MIN_M = -2.0;
const BAY_DEPTH_MAX_M = 2.0;
const BAY_GROUP_MIN_SIZE = 2;
const LAYOUT_ABSOLUTE_MIN_FACE_WIDTH_M = 1.0;
const LAYOUT_DRAG_REBUILD_HZ = 4;
const LAYOUT_HOVER_VERTEX_PX = 16;
const LAYOUT_HOVER_EDGE_PX = 12;
const LAYOUT_VERTEX_RIGHT_ANGLE_SNAP_RATIO = 0.16;
const LAYOUT_VERTEX_RIGHT_ANGLE_SNAP_MIN_DIST_M = 0.2;
const LAYOUT_VERTEX_RIGHT_ANGLE_SNAP_MAX_DIST_M = 2.0;
const DEFAULT_FOOTPRINT_WIDTH_M = 48.0;
const DEFAULT_FOOTPRINT_DEPTH_M = 24.0;
const WINDOW_MIN_WIDTH_M = 0.1;
const WINDOW_MAX_WIDTH_M = 9999;
const WINDOW_PADDING_MIN_M = 0.0;
const WINDOW_PADDING_MAX_M = 9999;
const WINDOW_DEF_WIDTH_FALLBACK_M = 1.2;
const WINDOW_DEF_HEIGHT_FALLBACK_M = 1.6;

function normalizeMaterialSpec(value) {
    const kind = value?.kind;
    const id = typeof value?.id === 'string' ? value.id : '';
    if ((kind === 'texture' || kind === 'color') && id) return { kind, id };
    return null;
}

function normalizeBayTextureFlow(value) {
    const typed = typeof value === 'string' ? value : '';
    if (typed === 'restart' || typed === 'repeats' || typed === 'overflow_left' || typed === 'overflow_right') return typed;
    return 'restart';
}

function normalizeBayExpandPreference(value) {
    const typed = typeof value === 'string' ? value : '';
    if (typed === 'no_repeat' || typed === 'prefer_repeat' || typed === 'prefer_expand') return typed;
    return 'prefer_expand';
}

function resolveBayLinkFromSpec(bay) {
    const spec = bay && typeof bay === 'object' ? bay : null;
    const link = typeof spec?.linkFromBayId === 'string' ? spec.linkFromBayId : '';
    if (link) return link;
    const legacy = typeof spec?.materialLinkFromBayId === 'string' ? spec.materialLinkFromBayId : '';
    return legacy || null;
}

function normalizeFacadeBayGroupRepeat(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return { minRepeats: 1, maxRepeats: 'auto' };
    const minRepeats = clampInt(src.minRepeats ?? 1, 1, 9999);
    const maxRaw = src.maxRepeats;
    if (maxRaw === 'auto') return { minRepeats, maxRepeats: 'auto' };
    if (maxRaw === null || maxRaw === undefined) return { minRepeats, maxRepeats: 'auto' };
    const maxRepeats = clampInt(maxRaw, minRepeats, 9999);
    return { minRepeats, maxRepeats };
}

function applyBaseWallMaterialFallbackToFloorLayers(config) {
    const cfg = config && typeof config === 'object' ? config : null;
    if (!cfg) return;

    const base = normalizeMaterialSpec(cfg?.baseWallMaterial ?? null);
    if (!base) return;

    const layers = Array.isArray(cfg.layers) ? cfg.layers : [];
    for (const layer of layers) {
        if (layer?.type !== 'floor') continue;
        const hasMaterial = !!normalizeMaterialSpec(layer?.material ?? null);
        if (!hasMaterial) layer.material = base;
    }

    delete cfg.baseWallMaterial;
}

function isFaceId(faceId) {
    return faceId === 'A' || faceId === 'B' || faceId === 'C' || faceId === 'D';
}

function normalizeFaceLinking(value) {
    const src = value && typeof value === 'object' ? value : null;
    const links = src?.links && typeof src.links === 'object' ? src.links : null;
    if (!links) return null;

    const out = {};
    for (const [slave, master] of Object.entries(links)) {
        if (!isFaceId(slave) || !isFaceId(master) || slave === master) continue;
        out[slave] = master;
    }

    return Object.keys(out).length ? { links: out } : null;
}

function createEmptyFaceLockMap() {
    const out = new Map();
    for (const faceId of FACE_IDS) out.set(faceId, null);
    return out;
}

function createFaceLockMapFromConfigLayer(layer) {
    const out = createEmptyFaceLockMap();
    const linking = normalizeFaceLinking(layer?.faceLinking ?? null);
    const links = linking?.links ?? null;
    if (!links) return out;
    for (const [slave, master] of Object.entries(links)) {
        if (!isFaceId(slave) || !isFaceId(master)) continue;
        out.set(slave, master);
    }
    return out;
}

function resolveDefaultLayerWallMaterial(layer) {
    const raw = layer?.material && typeof layer.material === 'object' ? layer.material : null;
    const kind = raw?.kind;
    const id = typeof raw?.id === 'string' ? raw.id : '';
    if ((kind === 'texture' || kind === 'color') && id) return { kind, id };
    const styleId = typeof layer?.style === 'string' && layer.style ? layer.style : 'default';
    return { kind: 'texture', id: styleId };
}

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function signedAreaXZ(loop) {
    const pts = Array.isArray(loop) ? loop : [];
    const n = pts.length;
    if (n < 3) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        sum += (Number(a?.x) || 0) * (Number(b?.z) || 0) - (Number(b?.x) || 0) * (Number(a?.z) || 0);
    }
    return sum * 0.5;
}

function cloneLoop(loop) {
    const src = Array.isArray(loop) ? loop : [];
    return src.map((p) => ({ x: Number(p?.x) || 0, z: Number(p?.z) || 0 }));
}

function createDefaultFootprintLoop({ widthMeters = DEFAULT_FOOTPRINT_WIDTH_M, depthMeters = DEFAULT_FOOTPRINT_DEPTH_M } = {}) {
    const halfW = Math.max(0.5, Number(widthMeters) || DEFAULT_FOOTPRINT_WIDTH_M) * 0.5;
    const halfD = Math.max(0.5, Number(depthMeters) || DEFAULT_FOOTPRINT_DEPTH_M) * 0.5;
    return [
        { x: -halfW, z: halfD },
        { x: halfW, z: halfD },
        { x: halfW, z: -halfD },
        { x: -halfW, z: -halfD }
    ];
}

function normalizePrimaryFootprintLoop(footprintLoops) {
    const srcLoops = Array.isArray(footprintLoops) ? footprintLoops : [];
    const srcLoop = Array.isArray(srcLoops[0]) ? srcLoops[0] : [];

    const samePoint = (a, b) => (
        !!a && !!b
        && Math.abs((Number(a.x) || 0) - (Number(b.x) || 0)) <= 1e-6
        && Math.abs((Number(a.z) || 0) - (Number(b.z) || 0)) <= 1e-6
    );

    const cleaned = [];
    for (const entry of srcLoop) {
        const x = Number(entry?.x ?? entry?.[0]);
        const z = Number(entry?.z ?? entry?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
        const p = { x, z };
        if (!cleaned.length || !samePoint(cleaned[cleaned.length - 1], p)) cleaned.push(p);
    }
    if (cleaned.length > 2 && samePoint(cleaned[0], cleaned[cleaned.length - 1])) cleaned.pop();
    if (cleaned.length === 4) return cleaned;
    return createDefaultFootprintLoop();
}

function edgeIndicesFromFaceId(faceId) {
    switch (faceId) {
        case 'A': return [0, 1];
        case 'B': return [1, 2];
        case 'C': return [2, 3];
        case 'D': return [3, 0];
        default: return null;
    }
}

function faceIdFromEdgeIndex(edgeIndex) {
    switch (edgeIndex | 0) {
        case 0: return 'A';
        case 1: return 'B';
        case 2: return 'C';
        case 3: return 'D';
        default: return null;
    }
}

function normalize2(v) {
    const x = Number(v?.x) || 0;
    const z = Number(v?.z) || 0;
    const len = Math.hypot(x, z);
    if (!(len > 1e-6)) return { x: 0, z: 0, len: 0 };
    return { x: x / len, z: z / len, len };
}

function rightNormal2(v) {
    return { x: v.z, z: -v.x };
}

function dot2(a, b) {
    return (Number(a?.x) || 0) * (Number(b?.x) || 0) + (Number(a?.z) || 0) * (Number(b?.z) || 0);
}

function cross2(a, b) {
    return (Number(a?.x) || 0) * (Number(b?.z) || 0) - (Number(a?.z) || 0) * (Number(b?.x) || 0);
}

function distanceSqPointToLine2(point, a, b) {
    const px = Number(point?.x) || 0;
    const pz = Number(point?.z) || 0;
    const ax = Number(a?.x) || 0;
    const az = Number(a?.z) || 0;
    const bx = Number(b?.x) || 0;
    const bz = Number(b?.z) || 0;
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (!(lenSq > 1e-12)) {
        const ex = px - ax;
        const ez = pz - az;
        return ex * ex + ez * ez;
    }
    const t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
    const cx = ax + dx * t;
    const cz = az + dz * t;
    const ex = px - cx;
    const ez = pz - cz;
    return ex * ex + ez * ez;
}

function distance2(a, b) {
    const dx = (Number(a?.x) || 0) - (Number(b?.x) || 0);
    const dz = (Number(a?.z) || 0) - (Number(b?.z) || 0);
    return Math.hypot(dx, dz);
}

// Snap a dragged corner to the nearest 90° locus (Thales circle) when close enough.
function snapVertexToRightAngleIfClose({ candidate, prev, next, reference = null } = {}) {
    const cand = candidate && typeof candidate === 'object' ? candidate : null;
    const a = prev && typeof prev === 'object' ? prev : null;
    const b = next && typeof next === 'object' ? next : null;
    if (!cand || !a || !b) return null;

    const ax = Number(a.x) || 0;
    const az = Number(a.z) || 0;
    const bx = Number(b.x) || 0;
    const bz = Number(b.z) || 0;
    const chordDx = bx - ax;
    const chordDz = bz - az;
    const chordLen = Math.hypot(chordDx, chordDz);
    if (!(chordLen > 1e-6)) return null;

    const cx = (ax + bx) * 0.5;
    const cz = (az + bz) * 0.5;
    const radius = chordLen * 0.5;

    let dirX = (Number(cand.x) || 0) - cx;
    let dirZ = (Number(cand.z) || 0) - cz;
    let dirLen = Math.hypot(dirX, dirZ);

    if (!(dirLen > 1e-6)) {
        const ref = reference && typeof reference === 'object' ? reference : null;
        if (ref) {
            dirX = (Number(ref.x) || 0) - cx;
            dirZ = (Number(ref.z) || 0) - cz;
            dirLen = Math.hypot(dirX, dirZ);
        }
    }

    if (!(dirLen > 1e-6)) {
        dirX = -chordDz;
        dirZ = chordDx;
        dirLen = Math.hypot(dirX, dirZ);
    }
    if (!(dirLen > 1e-6)) return null;

    const scale = radius / dirLen;
    const snapped = {
        x: cx + dirX * scale,
        z: cz + dirZ * scale
    };

    const refPoint = reference && typeof reference === 'object' ? reference : cand;
    const baseLen = Math.min(
        distance2(refPoint, a),
        distance2(refPoint, b),
        chordLen
    );
    const snapThreshold = clamp(
        baseLen * LAYOUT_VERTEX_RIGHT_ANGLE_SNAP_RATIO,
        LAYOUT_VERTEX_RIGHT_ANGLE_SNAP_MIN_DIST_M,
        LAYOUT_VERTEX_RIGHT_ANGLE_SNAP_MAX_DIST_M
    );
    const snapDelta = distance2(snapped, cand);
    if (snapDelta > snapThreshold) return null;
    return snapped;
}

function segmentsIntersect2(a1, a2, b1, b2) {
    const da = { x: (Number(a2?.x) || 0) - (Number(a1?.x) || 0), z: (Number(a2?.z) || 0) - (Number(a1?.z) || 0) };
    const db = { x: (Number(b2?.x) || 0) - (Number(b1?.x) || 0), z: (Number(b2?.z) || 0) - (Number(b1?.z) || 0) };
    const diff = { x: (Number(b1?.x) || 0) - (Number(a1?.x) || 0), z: (Number(b1?.z) || 0) - (Number(a1?.z) || 0) };
    const det = cross2(da, db);
    if (Math.abs(det) < 1e-9) return false;
    const t = cross2(diff, db) / det;
    const u = cross2(diff, da) / det;
    return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

function computeFaceFrameFromLoop(loop, faceId) {
    const edge = edgeIndicesFromFaceId(faceId);
    if (!edge) return null;
    const a = loop?.[edge[0]] ?? null;
    const b = loop?.[edge[1]] ?? null;
    if (!a || !b) return null;
    const t = normalize2({ x: b.x - a.x, z: b.z - a.z });
    if (!(t.len > 1e-6)) return null;
    const center = {
        x: (loop[0].x + loop[1].x + loop[2].x + loop[3].x) * 0.25,
        z: (loop[0].z + loop[1].z + loop[2].z + loop[3].z) * 0.25
    };
    const mid = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
    const right = rightNormal2(t);
    const toMid = { x: mid.x - center.x, z: mid.z - center.z };
    const n = dot2(right, toMid) >= 0 ? right : { x: -right.x, z: -right.z };
    const nNorm = normalize2(n);
    if (!(nNorm.len > 1e-6)) return null;
    return {
        faceId,
        startIndex: edge[0],
        endIndex: edge[1],
        start: { x: a.x, z: a.z },
        end: { x: b.x, z: b.z },
        tangent: { x: t.x, z: t.z },
        normal: { x: nNorm.x, z: nNorm.z },
        length: t.len
    };
}

function getFloorLayers(layers) {
    if (!Array.isArray(layers)) return [];
    return layers.filter((layer) => layer?.type === 'floor');
}

function resolveLayerFaceFacades(config, layerId) {
    const cfg = config && typeof config === 'object' ? config : null;
    if (!cfg) return null;
    const facadesByLayerId = cfg.facades && typeof cfg.facades === 'object' ? cfg.facades : null;
    if (!facadesByLayerId) return null;
    const layerFacades = facadesByLayerId[layerId];
    return layerFacades && typeof layerFacades === 'object' ? layerFacades : null;
}

function ensureLayerFaceFacades(config, layerId) {
    const cfg = config && typeof config === 'object' ? config : null;
    if (!cfg) return null;
    cfg.facades ??= {};
    if (!cfg.facades || typeof cfg.facades !== 'object') return null;
    cfg.facades[layerId] ??= {};
    const layerFacades = cfg.facades[layerId];
    return layerFacades && typeof layerFacades === 'object' ? layerFacades : null;
}

function cleanupEmptyLayerFacades(config, layerId) {
    const cfg = config && typeof config === 'object' ? config : null;
    if (!cfg) return;
    const facadesByLayerId = cfg.facades && typeof cfg.facades === 'object' ? cfg.facades : null;
    if (!facadesByLayerId) return;
    const layerFacades = facadesByLayerId[layerId];
    if (!layerFacades || typeof layerFacades !== 'object') return;
    if (Object.keys(layerFacades).length) return;
    delete facadesByLayerId[layerId];
    if (!Object.keys(facadesByLayerId).length) delete cfg.facades;
}

function resolveBayWindowFromSpec(bay) {
    const spec = bay && typeof bay === 'object' ? bay : null;
    if (!spec) return null;
    if (spec.window && typeof spec.window === 'object') return spec.window;
    const legacyFeatures = spec.features && typeof spec.features === 'object' ? spec.features : null;
    if (legacyFeatures?.window && typeof legacyFeatures.window === 'object') return legacyFeatures.window;
    return null;
}

function colorHexToCss(value, fallback = 0xffffff) {
    const hex = Number.isFinite(value) ? (Number(value) >>> 0) & 0xffffff : fallback;
    return `#${hex.toString(16).padStart(6, '0')}`;
}

function drawWindowDefinitionPreview(settings) {
    if (typeof document === 'undefined') return '';
    const s = sanitizeWindowMeshSettings(settings ?? null);
    const canvas = document.createElement('canvas');
    canvas.width = 144;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, '#dce6f2');
    bg.addColorStop(1, '#bac9da');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const widthMeters = Math.max(0.1, Number(s.width) || WINDOW_DEF_WIDTH_FALLBACK_M);
    const heightMeters = Math.max(0.1, Number(s.height) || WINDOW_DEF_HEIGHT_FALLBACK_M);
    const aspect = Math.max(0.35, Math.min(2.5, widthMeters / heightMeters));

    let w = canvas.width * 0.62;
    let h = w / aspect;
    const maxH = canvas.height * 0.72;
    if (h > maxH) {
        h = maxH;
        w = h * aspect;
    }

    const x = (canvas.width - w) * 0.5;
    const y = (canvas.height - h) * 0.5;
    const frameRatio = Math.max(0.02, Math.min(0.3, (Number(s?.frame?.width) || 0.08) / widthMeters));
    const framePx = Math.max(3, Math.min(16, Math.round(w * frameRatio)));

    ctx.fillStyle = colorHexToCss(s?.frame?.colorHex, 0xe7edf8);
    ctx.fillRect(x, y, w, h);

    const innerX = x + framePx;
    const innerY = y + framePx;
    const innerW = Math.max(4, w - framePx * 2);
    const innerH = Math.max(4, h - framePx * 2);

    const glass = ctx.createLinearGradient(0, innerY, 0, innerY + innerH);
    glass.addColorStop(0, 'rgba(170, 214, 255, 0.95)');
    glass.addColorStop(1, 'rgba(126, 168, 214, 0.95)');
    ctx.fillStyle = glass;
    ctx.fillRect(innerX, innerY, innerW, innerH);

    if (s?.arch?.enabled) {
        const rise = Math.max(2, Math.min(innerH * 0.45, innerW * (Number(s?.arch?.heightRatio) || 0.25)));
        ctx.beginPath();
        ctx.moveTo(innerX, innerY + rise);
        ctx.quadraticCurveTo(innerX + innerW * 0.5, innerY - rise * 0.9, innerX + innerW, innerY + rise);
        ctx.lineTo(innerX + innerW, innerY + innerH);
        ctx.lineTo(innerX, innerY + innerH);
        ctx.closePath();
        ctx.fillStyle = 'rgba(170, 214, 255, 0.95)';
        ctx.fill();
    }

    if (s?.muntins?.enabled) {
        const colCount = Math.max(0, (Number(s?.muntins?.columns) || 1) - 1);
        const rowCount = Math.max(0, (Number(s?.muntins?.rows) || 1) - 1);
        const muntinColor = colorHexToCss(s?.muntins?.colorHex ?? s?.frame?.colorHex, 0xf1f5fb);
        const muntinW = Math.max(1, Math.round(Math.min(innerW, innerH) * 0.04));
        ctx.fillStyle = muntinColor;

        for (let i = 1; i <= colCount; i++) {
            const px = innerX + (innerW * i) / (colCount + 1) - muntinW * 0.5;
            ctx.fillRect(px, innerY, muntinW, innerH);
        }
        for (let i = 1; i <= rowCount; i++) {
            const py = innerY + (innerH * i) / (rowCount + 1) - muntinW * 0.5;
            ctx.fillRect(innerX, py, innerW, muntinW);
        }
    }

    return canvas.toDataURL('image/png');
}

export class BuildingFabrication2View {
    constructor(engine) {
        this.engine = engine;
        this.scene = new BuildingFabrication2Scene(engine);
        this.ui = new BuildingFabrication2UI();
        this._thumbRenderer = new BuildingFabrication2ThumbnailRenderer(engine, { size: 512 });
        this._perfBar = ensureGlobalPerfBar();
        this._windowFabricationPopup = new WindowFabricationPopup();
        this._windowPickerPopup = new MaterialPickerPopupController();

        this._catalogEntries = [];
        this._thumbCache = new Map();
        this._windowDefPreviewByKey = new Map();
        this._thumbJobId = 0;
        this._currentConfig = null;
        this._floorLayerFaceStateById = new Map();
        this._activeFloorLayerId = null;
        this._materialConfigLayerId = null;
        this._materialConfigFaceId = null;
        this._materialConfigBayId = null;
        this._pendingRebuild = false;
        this._pendingRebuildPreserveCamera = true;
        this._pendingRebuildEarliestAtMs = 0;
        this._lastRebuildAtMs = 0;

        this._hideFaceMarkEnabled = false;
        this._showDummyEnabled = false;
        this._rulerEnabled = false;
        this._layoutAdjustEnabled = false;
        this._rulerPointA = null;
        this._rulerPointB = null;
        this._rulerFixed = false;
        this._rulerPointer = new THREE.Vector2();
        this._rulerMidpoint = new THREE.Vector3();
        this._rulerProject = new THREE.Vector3();
        this._rulerPointerDown = null;
        this._rulerPointerMoved = false;
        this._layoutPointer = new THREE.Vector2();
        this._layoutHover = null;
        this._layoutDrag = null;
        this._layoutMinWidthByFaceId = null;
        this._layoutProjected = new THREE.Vector3();
        this._layoutProjectedA = new THREE.Vector3();
        this._layoutProjectedB = new THREE.Vector3();

        this._pointerInViewport = false;
        this._onCanvasPointerEnter = () => {
            this._pointerInViewport = true;
            this._syncFaceHighlightSuppression();
        };
        this._onCanvasPointerLeave = () => {
            this._pointerInViewport = false;
            this._syncFaceHighlightSuppression();
            this._handleLayoutPointerLeave();
            this._handleRulerPointerLeave();
        };
        this._onCanvasPointerMove = (e) => this._handleCanvasPointerMove(e);
        this._onCanvasPointerDown = (e) => this._handleCanvasPointerDown(e);
        this._onCanvasPointerUp = (e) => this._handleCanvasPointerUp(e);
        this._onCanvasPointerCancel = (e) => this._handleCanvasPointerCancel(e);

        this._keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            ShiftLeft: false,
            ShiftRight: false
        };
        this._moveForward = new THREE.Vector3();
        this._moveRight = new THREE.Vector3();
        this._moveDir = new THREE.Vector3();

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onKeyUp = (e) => this._handleKeyUp(e);
    }

    enter() {
        this.scene.enter();

        // View toggles are non-persistent; reset to defaults whenever BF2 is entered.
        this._pointerInViewport = false;
        this._setHideFaceMarkEnabled(false);
        this._setShowDummyEnabled(false);
        this._setRulerEnabled(false);
        this._setLayoutAdjustEnabled(false);
        this.ui.setViewToggles({ hideFaceMarkEnabled: false, showDummyEnabled: false });
        this.ui.setRulerEnabled(false);
        this.ui.setLayoutAdjustEnabled(false);
        this.ui.setRulerLabel({ visible: false });

        this.ui.mount();
        this.scene.setUiRoot(this.ui.root);

        this._catalogEntries = this._buildCatalogEntries();
        this.ui.setCatalogEntries(this._catalogEntries);

        this._syncUiState();

        this.ui.onCreateBuilding = () => this._createBuilding();
        this.ui.onRequestLoad = () => this._openLoadBrowser();
        this.ui.onRequestExport = () => this._exportCurrentConfig();
        this.ui.onReset = () => this._reset();
        this.ui.onSetFloorLayerFloors = (layerId, floors) => this._setFloorLayerFloors(layerId, floors);
        this.ui.onSetFloorLayerFloorHeight = (layerId, height) => this._setFloorLayerFloorHeight(layerId, height);
        this.ui.onSetFloorLayerMaterial = (layerId, faceId, material) => this._setFloorLayerMaterial(layerId, faceId, material);
        this.ui.onRequestMaterialConfig = (layerId, faceId) => this._openMaterialConfigForLayer(layerId, faceId);
        this.ui.onViewModeChange = (mode) => this._applyViewMode(mode);
        this.ui.onHideFaceMarkChange = (enabled) => this._setHideFaceMarkEnabled(enabled);
        this.ui.onShowDummyChange = (enabled) => this._setShowDummyEnabled(enabled);
        this.ui.onRulerToggle = (enabled) => this._setRulerEnabled(enabled);
        this.ui.onAdjustLayoutToggle = (enabled) => this._setLayoutAdjustEnabled(enabled);
        this.ui.onSelectCatalogEntry = (configId) => this._loadConfigFromCatalog(configId);

        this.ui.onAddFloorLayer = () => this._addFloorLayer();
        this.ui.onAddRoofLayer = () => this._addRoofLayer();
        this.ui.onMoveLayer = (layerId, dir) => this._moveLayer(layerId, dir);
        this.ui.onDeleteLayer = (layerId) => this._deleteLayer(layerId);
        this.ui.onSelectFace = (layerId, faceId) => this._setSelectedFace(layerId, faceId);
        this.ui.onToggleFaceLock = (layerId, masterFaceId, targetFaceId) => this._toggleFaceLock(layerId, masterFaceId, targetFaceId);
        this.ui.onHoverLayer = (layerId) => this._setHoveredLayer(layerId);
        this.ui.onHoverLayerTitle = (layerId) => this._setHoveredLayerHighlight(layerId);
        this.ui.onAddBay = (layerId, faceId) => this._addBay(layerId, faceId);
        this.ui.onMoveBay = (layerId, faceId, bayId, dir) => this._moveBay(layerId, faceId, bayId, dir);
        this.ui.onDeleteBay = (layerId, faceId, bayId) => this._deleteBay(layerId, faceId, bayId);
        this.ui.onSetBaySizeMode = (layerId, faceId, bayId, mode) => this._setBaySizeMode(layerId, faceId, bayId, mode);
        this.ui.onSetBayFixedWidth = (layerId, faceId, bayId, width) => this._setBayFixedWidth(layerId, faceId, bayId, width);
        this.ui.onSetBayMinWidth = (layerId, faceId, bayId, min) => this._setBayMinWidth(layerId, faceId, bayId, min);
        this.ui.onSetBayMaxWidth = (layerId, faceId, bayId, max) => this._setBayMaxWidth(layerId, faceId, bayId, max);
        this.ui.onSetBayExpandPreference = (layerId, faceId, bayId, pref) => this._setBayExpandPreference(layerId, faceId, bayId, pref);
        this.ui.onSetBayWallMaterialOverride = (layerId, faceId, bayId, material) => this._setBayWallMaterialOverride(layerId, faceId, bayId, material);
        this.ui.onSetBayTextureFlow = (layerId, faceId, bayId, mode) => this._setBayTextureFlow(layerId, faceId, bayId, mode);
        this.ui.onSetBayDepthEdge = (layerId, faceId, bayId, edge, depth) => this._setBayDepthEdge(layerId, faceId, bayId, edge, depth);
        this.ui.onToggleBayDepthLink = (layerId, faceId, bayId) => this._toggleBayDepthLink(layerId, faceId, bayId);
        this.ui.onSetBayLink = (layerId, faceId, bayId, masterBayId) => this._setBayLink(layerId, faceId, bayId, masterBayId);
        this.ui.onCreateBayGroup = (layerId, faceId, bayIds) => this._createBayGroup(layerId, faceId, bayIds);
        this.ui.onRemoveBayGroup = (layerId, faceId, groupId) => this._removeBayGroup(layerId, faceId, groupId);
        this.ui.onDuplicateBay = (layerId, faceId, bayId) => this._duplicateBay(layerId, faceId, bayId);
        this.ui.onRequestBayMaterialConfig = (layerId, faceId, bayId) => this._openMaterialConfigForBay(layerId, faceId, bayId);
        this.ui.onSetBayWindowEnabled = (layerId, faceId, bayId, enabled) => this._setBayWindowEnabled(layerId, faceId, bayId, enabled);
        this.ui.onRequestBayWindowPicker = (layerId, faceId, bayId) => this._openBayWindowPicker(layerId, faceId, bayId);
        this.ui.onSetBayWindowMinWidth = (layerId, faceId, bayId, min) => this._setBayWindowMinWidth(layerId, faceId, bayId, min);
        this.ui.onSetBayWindowMaxWidth = (layerId, faceId, bayId, max) => this._setBayWindowMaxWidth(layerId, faceId, bayId, max);
        this.ui.onSetBayWindowPadding = (layerId, faceId, bayId, edge, value) => this._setBayWindowPadding(layerId, faceId, bayId, edge, value);
        this.ui.onToggleBayWindowPaddingLink = (layerId, faceId, bayId) => this._toggleBayWindowPaddingLink(layerId, faceId, bayId);
        this.ui.onSidePanelChange = () => this._syncUiState();
        this.ui.onMaterialConfigChange = () => this._requestRebuild({ preserveCamera: true });
        this.ui.onMaterialConfigRequestUiSync = () => this._syncUiState();

        const canvas = this.engine?.canvas ?? null;
        canvas?.addEventListener?.('pointerenter', this._onCanvasPointerEnter, { passive: true });
        canvas?.addEventListener?.('pointerleave', this._onCanvasPointerLeave, { passive: true });
        canvas?.addEventListener?.('pointermove', this._onCanvasPointerMove, { passive: true });
        canvas?.addEventListener?.('pointerdown', this._onCanvasPointerDown, { passive: true });
        canvas?.addEventListener?.('pointerup', this._onCanvasPointerUp, { passive: true });
        canvas?.addEventListener?.('pointercancel', this._onCanvasPointerCancel, { passive: true });

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: false });
    }

    exit() {
        const canvas = this.engine?.canvas ?? null;
        canvas?.removeEventListener?.('pointerenter', this._onCanvasPointerEnter);
        canvas?.removeEventListener?.('pointerleave', this._onCanvasPointerLeave);
        canvas?.removeEventListener?.('pointermove', this._onCanvasPointerMove);
        canvas?.removeEventListener?.('pointerdown', this._onCanvasPointerDown);
        canvas?.removeEventListener?.('pointerup', this._onCanvasPointerUp);
        canvas?.removeEventListener?.('pointercancel', this._onCanvasPointerCancel);

        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        this._clearKeys();
        this._pointerInViewport = false;
        this._hideFaceMarkEnabled = false;
        this._showDummyEnabled = false;
        this._rulerEnabled = false;
        this._layoutAdjustEnabled = false;
        this._rulerPointA = null;
        this._rulerPointB = null;
        this._rulerFixed = false;
        this._rulerPointerDown = null;
        this._rulerPointerMoved = false;
        this._layoutHover = null;
        this._layoutDrag = null;
        this._layoutMinWidthByFaceId = null;
        if (canvas) canvas.style.cursor = '';
        this.scene?.setFaceHighlightSuppressed?.(false);
        this.scene?.setShowDummy?.(false);
        this.scene?.setRulerSegment?.(null, null);
        this.scene?.setLayoutEditState?.({ enabled: false, loop: null, hoverFaceId: null, hoverVertexIndex: null });
        this.ui?.setRulerLabel?.({ visible: false });
        this.ui?.setLayoutAdjustEnabled?.(false);

        this._thumbJobId += 1;
        this.ui.onCreateBuilding = null;
        this.ui.onRequestLoad = null;
        this.ui.onRequestExport = null;
        this.ui.onReset = null;
        this.ui.onSetFloorLayerFloors = null;
        this.ui.onSetFloorLayerFloorHeight = null;
        this.ui.onSetFloorLayerMaterial = null;
        this.ui.onRequestMaterialConfig = null;
        this.ui.onViewModeChange = null;
        this.ui.onHideFaceMarkChange = null;
        this.ui.onShowDummyChange = null;
        this.ui.onRulerToggle = null;
        this.ui.onAdjustLayoutToggle = null;
        this.ui.onSelectCatalogEntry = null;
        this.ui.onAddFloorLayer = null;
        this.ui.onAddRoofLayer = null;
        this.ui.onMoveLayer = null;
        this.ui.onDeleteLayer = null;
        this.ui.onSelectFace = null;
        this.ui.onToggleFaceLock = null;
        this.ui.onHoverLayer = null;
        this.ui.onHoverLayerTitle = null;
        this.ui.onAddBay = null;
        this.ui.onMoveBay = null;
        this.ui.onDeleteBay = null;
        this.ui.onSetBaySizeMode = null;
        this.ui.onSetBayFixedWidth = null;
        this.ui.onSetBayMinWidth = null;
        this.ui.onSetBayMaxWidth = null;
        this.ui.onSetBayExpandPreference = null;
        this.ui.onSetBayWallMaterialOverride = null;
        this.ui.onSetBayTextureFlow = null;
        this.ui.onSetBayDepthEdge = null;
        this.ui.onToggleBayDepthLink = null;
        this.ui.onSetBayLink = null;
        this.ui.onCreateBayGroup = null;
        this.ui.onRemoveBayGroup = null;
        this.ui.onDuplicateBay = null;
        this.ui.onRequestBayMaterialConfig = null;
        this.ui.onSetBayWindowEnabled = null;
        this.ui.onRequestBayWindowPicker = null;
        this.ui.onSetBayWindowMinWidth = null;
        this.ui.onSetBayWindowMaxWidth = null;
        this.ui.onSetBayWindowPadding = null;
        this.ui.onToggleBayWindowPaddingLink = null;
        this.ui.onSidePanelChange = null;
        this.ui.onMaterialConfigChange = null;
        this.ui.onMaterialConfigRequestUiSync = null;

        this._windowPickerPopup?.close?.();
        this._windowFabricationPopup?.close?.();
        this.ui.unmount();
        this.scene.exit();
        this._thumbRenderer.dispose();
    }

    update(dt) {
        if (this._pendingRebuild) {
            const now = (typeof performance !== 'undefined' && Number.isFinite(performance.now()))
                ? performance.now()
                : Date.now();
            if (now >= this._pendingRebuildEarliestAtMs) {
                const preserveCamera = this._pendingRebuildPreserveCamera;
                this._pendingRebuild = false;
                this._pendingRebuildPreserveCamera = true;
                this._pendingRebuildEarliestAtMs = 0;
                if (this._currentConfig) {
                    const loaded = this.scene.loadBuildingConfig(this._currentConfig, { preserveCamera });
                    if (loaded) this._perfBar?.requestUpdate?.();
                }
                this._lastRebuildAtMs = now;
            }
        }

        this.scene.update(dt);
        this._updateCameraFromKeys(dt);
        this._syncRulerOverlay();
    }

    handleEscape() {
        if (this._layoutAdjustEnabled) {
            this._setLayoutAdjustEnabled(false);
            return true;
        }
        if (this._windowFabricationPopup?.isOpen?.()) {
            this._windowFabricationPopup.close();
            return true;
        }
        if (this._windowPickerPopup?.isOpen?.()) {
            this._windowPickerPopup.close();
            return true;
        }
        if (this.ui?.isLoadBrowserOpen?.()) {
            this.ui.closeLoadBrowser();
            return true;
        }
        if (this.ui?.isLinkPopupOpen?.()) {
            this.ui.closeLinkPopup();
            return true;
        }
        if (this.ui?.isGroupingPanelOpen?.()) {
            this.ui.closeGroupingPanel();
            return true;
        }
        if (this.ui?.isSidePanelOpen?.()) {
            this.ui.closeSidePanel();
            return true;
        }
        return false;
    }

    _buildCatalogEntries() {
        const items = getBuildingConfigs();
        items.sort((a, b) => {
            const al = String(a?.name ?? a?.id ?? '').toLowerCase();
            const bl = String(b?.name ?? b?.id ?? '').toLowerCase();
            return al.localeCompare(bl);
        });
        return items
            .map((cfg) => ({
                id: typeof cfg?.id === 'string' ? cfg.id : '',
                name: typeof cfg?.name === 'string' ? cfg.name : ''
            }))
            .filter((e) => !!e.id);
    }

    _syncUiState() {
        const has = this.scene.getHasBuilding();
        const name = has ? (this._currentConfig?.name ?? '') : '';
        const layers = has ? (this._currentConfig?.layers ?? null) : null;
        const layerList = Array.isArray(layers) ? layers : [];

        this.ui.setBuildingState({
            hasBuilding: has,
            buildingName: typeof name === 'string' ? name : '',
            buildingType: 'business'
        });

        this.ui.setLayers(layerList);
        if (!(this.ui?.isSidePanelOpen?.() ?? false)) {
            this._materialConfigLayerId = null;
            this._materialConfigFaceId = null;
            this._materialConfigBayId = null;
        }

        const floorLayers = getFloorLayers(layerList);
        const floorLayerIds = new Set(floorLayers.map((l) => l.id));

        for (const layer of floorLayers) {
            const layerId = layer.id;
            if (this._floorLayerFaceStateById.has(layerId)) continue;
            this._floorLayerFaceStateById.set(layerId, {
                selectedFaceId: null,
                lockedToByFace: createFaceLockMapFromConfigLayer(layer)
            });
        }

        for (const layerId of Array.from(this._floorLayerFaceStateById.keys())) {
            if (!floorLayerIds.has(layerId)) this._floorLayerFaceStateById.delete(layerId);
        }

        if (this._activeFloorLayerId && !floorLayerIds.has(this._activeFloorLayerId)) {
            this._activeFloorLayerId = null;
            this.scene.setSelectedFaceId(null);
        }

        this.ui.setFloorLayerFaceStates(this._floorLayerFaceStateById);
        this.ui.setMaterialConfigContext(this._buildMaterialConfigContext());
        this.ui.setWindowDefinitions(this._buildWindowDefinitionsUiModel());
        this.ui.setFacadesByLayerId(this._currentConfig?.facades ?? null);
        this._syncLayoutSceneState();
    }

    _buildMaterialConfigContext() {
        const cfg = this._currentConfig;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];

        const requestedId = typeof this._materialConfigLayerId === 'string' ? this._materialConfigLayerId : '';
        const fallbackId = typeof this._activeFloorLayerId === 'string' ? this._activeFloorLayerId : '';

        const selected = layers.find((l) => l?.type === 'floor' && l?.id === requestedId)
            ?? layers.find((l) => l?.type === 'floor' && l?.id === fallbackId)
            ?? layers.find((l) => l?.type === 'floor')
            ?? null;

        const selectedLayerId = typeof selected?.id === 'string' ? selected.id : null;
        const state = selectedLayerId ? (this._floorLayerFaceStateById.get(selectedLayerId) ?? null) : null;
        const selectedFaceId = isFaceId(state?.selectedFaceId) ? state.selectedFaceId : null;
        const lockedToFaceId = selectedFaceId ? (state?.lockedToByFace?.get?.(selectedFaceId) ?? null) : null;
        const fallbackMasterFaceId = lockedToFaceId ?? selectedFaceId;
        const pinnedMasterFaceId = isFaceId(this._materialConfigFaceId) ? this._materialConfigFaceId : null;
        const masterFaceId = pinnedMasterFaceId ?? fallbackMasterFaceId;

        const faceMaterials = selected?.faceMaterials && typeof selected.faceMaterials === 'object' ? selected.faceMaterials : null;
        const faceConfig = masterFaceId && faceMaterials?.[masterFaceId] && typeof faceMaterials[masterFaceId] === 'object'
            ? faceMaterials[masterFaceId]
            : null;

        const bayId = typeof this._materialConfigBayId === 'string' ? this._materialConfigBayId : null;
        if (bayId && selectedLayerId && masterFaceId) {
            const { bay, index } = this._resolveBaySpec({ layerId: selectedLayerId, faceId: masterFaceId, bayId });
            if (bay) {
                return {
                    target: 'bay',
                    bayId,
                    bayIndex: index,
                    layerId: selectedLayerId,
                    faceId: selectedFaceId,
                    lockedToFaceId,
                    masterFaceId,
                    layer: selected && typeof selected === 'object' ? selected : null,
                    faceConfig,
                    config: bay
                };
            }
        }

        return {
            target: 'face',
            layerId: selectedLayerId,
            faceId: selectedFaceId,
            lockedToFaceId,
            masterFaceId,
            layer: selected && typeof selected === 'object' ? selected : null,
            config: faceConfig
        };
    }

    _buildWindowDefinitionsUiModel() {
        const lib = this._currentConfig?.windowDefinitions;
        if (!lib || typeof lib !== 'object') return null;
        const srcItems = Array.isArray(lib.items) ? lib.items : [];
        const items = [];
        for (const entry of srcItems) {
            const id = typeof entry?.id === 'string' ? entry.id : '';
            if (!id) continue;
            const label = typeof entry?.label === 'string' && entry.label.trim() ? entry.label.trim() : id;
            const settings = sanitizeWindowMeshSettings(entry?.settings ?? null);
            const previewUrl = this._getWindowDefinitionPreviewUrl(id, settings);
            items.push({ id, label, settings, previewUrl });
        }
        return {
            nextWindowIndex: clampInt(lib.nextWindowIndex ?? 1, 1, 9999),
            items
        };
    }

    _ensureWindowDefinitionsLibrary() {
        const cfg = this._currentConfig;
        if (!cfg || typeof cfg !== 'object') return null;

        cfg.windowDefinitions ??= {};
        const lib = cfg.windowDefinitions;

        const srcItems = Array.isArray(lib.items) ? lib.items : [];
        const seen = new Set();
        const items = [];
        for (const entry of srcItems) {
            const id = typeof entry?.id === 'string' ? entry.id : '';
            if (!id || seen.has(id)) continue;
            seen.add(id);
            const label = typeof entry?.label === 'string' && entry.label.trim() ? entry.label.trim() : id;
            const settings = sanitizeWindowMeshSettings(entry?.settings ?? null);
            items.push({ id, label, settings });
        }

        lib.items = items;
        lib.nextWindowIndex = clampInt(lib.nextWindowIndex ?? 1, 1, 9999);
        return lib;
    }

    _findWindowDefinitionEntry(windowDefId) {
        const id = typeof windowDefId === 'string' ? windowDefId : '';
        if (!id) return null;
        const lib = this._ensureWindowDefinitionsLibrary();
        if (!lib) return null;
        return lib.items.find((entry) => entry?.id === id) ?? null;
    }

    _resolveWindowDefinitionWidthMeters(windowDefId) {
        const entry = this._findWindowDefinitionEntry(windowDefId);
        const raw = Number(entry?.settings?.width);
        if (Number.isFinite(raw)) return clamp(raw, WINDOW_MIN_WIDTH_M, WINDOW_MAX_WIDTH_M);
        return WINDOW_DEF_WIDTH_FALLBACK_M;
    }

    _resolveWindowDefinitionHeightMeters(windowDefId) {
        const entry = this._findWindowDefinitionEntry(windowDefId);
        const raw = Number(entry?.settings?.height);
        if (Number.isFinite(raw)) return clamp(raw, WINDOW_MIN_WIDTH_M, WINDOW_MAX_WIDTH_M);
        return WINDOW_DEF_HEIGHT_FALLBACK_M;
    }

    _getWindowDefinitionPreviewUrl(windowDefId, settings) {
        const id = typeof windowDefId === 'string' ? windowDefId : '';
        if (!id) return '';
        const safeSettings = sanitizeWindowMeshSettings(settings ?? null);
        const key = `${id}:${JSON.stringify(safeSettings)}`;
        const cached = this._windowDefPreviewByKey.get(key);
        if (typeof cached === 'string' && cached) return cached;
        const url = drawWindowDefinitionPreview(safeSettings);
        if (url) {
            this._windowDefPreviewByKey.set(key, url);
            if (this._windowDefPreviewByKey.size > 256) {
                const firstKey = this._windowDefPreviewByKey.keys().next().value;
                this._windowDefPreviewByKey.delete(firstKey);
            }
        }
        return url;
    }

    _ensureBayWindowConfig(bay, { create = false } = {}) {
        const bayObj = bay && typeof bay === 'object' ? bay : null;
        if (!bayObj) return null;

        const existing = resolveBayWindowFromSpec(bayObj);
        if (!existing) {
            if (!create) return null;
            bayObj.window = {
                enabled: true,
                defId: '',
                width: { minMeters: WINDOW_DEF_WIDTH_FALLBACK_M, maxMeters: null },
                padding: { leftMeters: 0, rightMeters: 0 }
            };
        } else if (bayObj.window !== existing) {
            bayObj.window = deepClone(existing);
        }

        if (bayObj.features && typeof bayObj.features === 'object' && bayObj.features.window !== undefined) {
            delete bayObj.features.window;
            if (!Object.keys(bayObj.features).length) delete bayObj.features;
        }

        const windowCfg = bayObj.window && typeof bayObj.window === 'object' ? bayObj.window : null;
        if (!windowCfg) return null;
        windowCfg.enabled = windowCfg.enabled !== false;
        windowCfg.defId = typeof windowCfg.defId === 'string' ? windowCfg.defId : '';

        const widthSrc = windowCfg.width && typeof windowCfg.width === 'object' ? windowCfg.width : {};
        const minRaw = Number(widthSrc.minMeters ?? windowCfg.minWidthMeters);
        const minMeters = Number.isFinite(minRaw) ? clamp(minRaw, WINDOW_MIN_WIDTH_M, WINDOW_MAX_WIDTH_M) : WINDOW_DEF_WIDTH_FALLBACK_M;
        const maxRaw = widthSrc.maxMeters ?? windowCfg.maxWidthMeters;
        const maxMeters = (maxRaw === null || maxRaw === undefined) ? null : clamp(maxRaw, minMeters, WINDOW_MAX_WIDTH_M);
        windowCfg.width = { minMeters, maxMeters };

        const paddingSrc = windowCfg.padding && typeof windowCfg.padding === 'object' ? windowCfg.padding : {};
        const linked = (paddingSrc.linked ?? true) !== false;
        const leftMeters = clamp(paddingSrc.leftMeters ?? windowCfg.paddingLeftMeters ?? 0, WINDOW_PADDING_MIN_M, WINDOW_PADDING_MAX_M);
        const rightRaw = Number(paddingSrc.rightMeters ?? windowCfg.paddingRightMeters);
        const rightMeters = clamp(Number.isFinite(rightRaw) ? rightRaw : (linked ? leftMeters : 0), WINDOW_PADDING_MIN_M, WINDOW_PADDING_MAX_M);
        windowCfg.padding = linked
            ? { leftMeters, rightMeters }
            : { leftMeters, rightMeters, linked: false };

        return windowCfg;
    }

    _resolveBayWindowMinRequirementMeters(bay) {
        const windowCfg = this._ensureBayWindowConfig(bay, { create: false });
        if (!windowCfg || windowCfg.enabled === false) return null;
        const defWidth = this._resolveWindowDefinitionWidthMeters(windowCfg.defId);
        const userMin = clamp(windowCfg?.width?.minMeters ?? defWidth, WINDOW_MIN_WIDTH_M, WINDOW_MAX_WIDTH_M);
        const minWindowWidth = Math.max(defWidth, userMin);
        const leftPad = clamp(windowCfg?.padding?.leftMeters ?? 0, WINDOW_PADDING_MIN_M, WINDOW_PADDING_MAX_M);
        const rightPad = clamp(windowCfg?.padding?.rightMeters ?? 0, WINDOW_PADDING_MIN_M, WINDOW_PADDING_MAX_M);
        return clamp(minWindowWidth + leftPad + rightPad, WINDOW_MIN_WIDTH_M, WINDOW_MAX_WIDTH_M);
    }

    _enforceBaySizeAgainstWindow(bay) {
        const bayObj = bay && typeof bay === 'object' ? bay : null;
        if (!bayObj) return false;
        const required = this._resolveBayWindowMinRequirementMeters(bayObj);
        if (!Number.isFinite(required)) return false;

        bayObj.size ??= { mode: 'range', minMeters: BAY_DEFAULT_WIDTH_M, maxMeters: null };
        const size = bayObj.size;
        const mode = size?.mode === 'fixed' ? 'fixed' : 'range';
        let changed = false;

        if (mode === 'fixed') {
            const nextWidth = clamp(size.widthMeters ?? BAY_DEFAULT_WIDTH_M, required, 9999);
            if (Math.abs(nextWidth - (Number(size.widthMeters) || 0)) > 1e-6) {
                size.widthMeters = nextWidth;
                changed = true;
            }
            return changed;
        }

        const nextMin = clamp(size.minMeters ?? BAY_MIN_WIDTH_M, required, 9999);
        if (Math.abs(nextMin - (Number(size.minMeters) || 0)) > 1e-6) {
            size.minMeters = nextMin;
            changed = true;
        }

        const maxRaw = size.maxMeters;
        if (maxRaw !== null && maxRaw !== undefined) {
            const nextMax = clamp(maxRaw, nextMin, 9999);
            if (Math.abs(nextMax - (Number(size.maxMeters) || 0)) > 1e-6) {
                size.maxMeters = nextMax;
                changed = true;
            }
        }

        return changed;
    }

    _enforceWindowDefinitionAcrossBays(windowDefId) {
        const id = typeof windowDefId === 'string' ? windowDefId : '';
        if (!id) return false;
        const defWidth = this._resolveWindowDefinitionWidthMeters(id);
        let changed = false;

        const facadesByLayerId = this._currentConfig?.facades && typeof this._currentConfig.facades === 'object'
            ? this._currentConfig.facades
            : null;
        if (!facadesByLayerId) return false;

        for (const layerFacades of Object.values(facadesByLayerId)) {
            if (!layerFacades || typeof layerFacades !== 'object') continue;
            for (const facade of Object.values(layerFacades)) {
                const bays = Array.isArray(facade?.layout?.bays?.items) ? facade.layout.bays.items : null;
                if (!bays) continue;
                for (const bay of bays) {
                    const windowCfg = this._ensureBayWindowConfig(bay, { create: false });
                    if (!windowCfg || windowCfg.defId !== id || windowCfg.enabled === false) continue;
                    const prev = clamp(windowCfg?.width?.minMeters ?? defWidth, WINDOW_MIN_WIDTH_M, WINDOW_MAX_WIDTH_M);
                    const next = Math.max(prev, defWidth);
                    if (Math.abs(next - prev) > 1e-6) {
                        windowCfg.width.minMeters = next;
                        changed = true;
                    }
                    if (this._enforceBaySizeAgainstWindow(bay)) changed = true;
                }
            }
        }

        return changed;
    }

    _setWindowDefinitionSettings(windowDefId, settings) {
        const entry = this._findWindowDefinitionEntry(windowDefId);
        if (!entry) return false;
        entry.settings = sanitizeWindowMeshSettings(settings);
        this._enforceWindowDefinitionAcrossBays(windowDefId);
        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
        return true;
    }

    _createWindowDefinition({ cloneFromId = null } = {}) {
        const lib = this._ensureWindowDefinitionsLibrary();
        if (!lib) return null;

        const used = new Set(lib.items.map((entry) => (typeof entry?.id === 'string' ? entry.id : '')).filter(Boolean));
        let index = clampInt(lib.nextWindowIndex ?? 1, 1, 9999);
        let id = `win_${index}`;
        for (let guard = 0; guard < 9999 && used.has(id); guard++) {
            index += 1;
            id = `win_${index}`;
        }

        const cloneId = typeof cloneFromId === 'string' ? cloneFromId : '';
        const cloneSource = cloneId ? (lib.items.find((entry) => entry?.id === cloneId) ?? null) : null;
        const settings = sanitizeWindowMeshSettings(cloneSource?.settings ?? getDefaultWindowMeshSettings());

        lib.nextWindowIndex = index + 1;
        lib.items.push({
            id,
            label: `Window ${index}`,
            settings
        });
        return id;
    }

    _setBayWindowEnabled(layerId, faceId, bayId, enabled) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const wantsEnabled = !!enabled;
        if (!wantsEnabled) {
            const hadWindow = !!resolveBayWindowFromSpec(bay);
            if (!hadWindow) return;
            delete bay.window;
            if (bay.features && typeof bay.features === 'object' && bay.features.window !== undefined) {
                delete bay.features.window;
                if (!Object.keys(bay.features).length) delete bay.features;
            }
            this._syncUiState();
            this._requestRebuild({ preserveCamera: true });
            return;
        }

        const lib = this._ensureWindowDefinitionsLibrary();
        if (!lib) return;
        if (!lib.items.length) {
            const createdId = this._createWindowDefinition();
            if (!createdId) return;
        }

        const windowCfg = this._ensureBayWindowConfig(bay, { create: true });
        if (!windowCfg) return;
        windowCfg.enabled = true;

        const firstDefId = typeof lib.items[0]?.id === 'string' ? lib.items[0].id : '';
        const currentDefId = typeof windowCfg.defId === 'string' ? windowCfg.defId : '';
        const resolvedDefId = lib.items.some((entry) => entry?.id === currentDefId) ? currentDefId : firstDefId;
        if (!resolvedDefId) return;
        windowCfg.defId = resolvedDefId;

        const defWidth = this._resolveWindowDefinitionWidthMeters(resolvedDefId);
        const currentMin = clamp(windowCfg?.width?.minMeters ?? defWidth, WINDOW_MIN_WIDTH_M, WINDOW_MAX_WIDTH_M);
        windowCfg.width.minMeters = Math.max(defWidth, currentMin);
        if (windowCfg.width.maxMeters !== null && windowCfg.width.maxMeters !== undefined) {
            windowCfg.width.maxMeters = clamp(windowCfg.width.maxMeters, windowCfg.width.minMeters, WINDOW_MAX_WIDTH_M);
        }

        this._enforceBaySizeAgainstWindow(bay);
        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayWindowDefinition(layerId, faceId, bayId, windowDefId) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const nextDefId = typeof windowDefId === 'string' ? windowDefId : '';
        if (!nextDefId) return;
        const entry = this._findWindowDefinitionEntry(nextDefId);
        if (!entry) return;

        const windowCfg = this._ensureBayWindowConfig(bay, { create: true });
        if (!windowCfg) return;
        windowCfg.enabled = true;
        if (windowCfg.defId === nextDefId) return;
        windowCfg.defId = nextDefId;

        const defWidth = this._resolveWindowDefinitionWidthMeters(nextDefId);
        const nextMin = Math.max(defWidth, clamp(windowCfg?.width?.minMeters ?? defWidth, WINDOW_MIN_WIDTH_M, WINDOW_MAX_WIDTH_M));
        windowCfg.width.minMeters = nextMin;
        if (windowCfg.width.maxMeters !== null && windowCfg.width.maxMeters !== undefined) {
            windowCfg.width.maxMeters = clamp(windowCfg.width.maxMeters, nextMin, WINDOW_MAX_WIDTH_M);
        }
        this._enforceBaySizeAgainstWindow(bay);

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayWindowMinWidth(layerId, faceId, bayId, min) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;
        const windowCfg = this._ensureBayWindowConfig(bay, { create: false });
        if (!windowCfg || windowCfg.enabled === false) return;

        const defWidth = this._resolveWindowDefinitionWidthMeters(windowCfg.defId);
        const nextMin = Math.max(defWidth, clamp(min, WINDOW_MIN_WIDTH_M, WINDOW_MAX_WIDTH_M));
        if (Math.abs(nextMin - (Number(windowCfg?.width?.minMeters) || 0)) < 1e-6) return;
        windowCfg.width.minMeters = nextMin;
        if (windowCfg.width.maxMeters !== null && windowCfg.width.maxMeters !== undefined) {
            windowCfg.width.maxMeters = clamp(windowCfg.width.maxMeters, nextMin, WINDOW_MAX_WIDTH_M);
        }
        this._enforceBaySizeAgainstWindow(bay);
        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayWindowMaxWidth(layerId, faceId, bayId, max) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;
        const windowCfg = this._ensureBayWindowConfig(bay, { create: false });
        if (!windowCfg || windowCfg.enabled === false) return;

        const minWidth = clamp(windowCfg?.width?.minMeters ?? WINDOW_MIN_WIDTH_M, WINDOW_MIN_WIDTH_M, WINDOW_MAX_WIDTH_M);
        if (max === null) {
            if (windowCfg.width.maxMeters === null || windowCfg.width.maxMeters === undefined) return;
            windowCfg.width.maxMeters = null;
        } else {
            const nextMax = clamp(max, minWidth, WINDOW_MAX_WIDTH_M);
            if (Math.abs(nextMax - (Number(windowCfg.width.maxMeters) || 0)) < 1e-6) return;
            windowCfg.width.maxMeters = nextMax;
        }
        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayWindowPadding(layerId, faceId, bayId, edge, value) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;
        const windowCfg = this._ensureBayWindowConfig(bay, { create: false });
        if (!windowCfg || windowCfg.enabled === false) return;

        const side = edge === 'right' ? 'right' : 'left';
        const next = clamp(value, WINDOW_PADDING_MIN_M, WINDOW_PADDING_MAX_M);

        const padding = windowCfg.padding && typeof windowCfg.padding === 'object' ? windowCfg.padding : { leftMeters: 0, rightMeters: 0 };
        const linked = (padding.linked ?? true) !== false;
        const prevLeft = clamp(padding.leftMeters ?? 0, WINDOW_PADDING_MIN_M, WINDOW_PADDING_MAX_M);
        const prevRight = clamp(padding.rightMeters ?? (linked ? prevLeft : 0), WINDOW_PADDING_MIN_M, WINDOW_PADDING_MAX_M);
        const left = linked ? next : (side === 'left' ? next : prevLeft);
        const right = linked ? next : (side === 'right' ? next : prevRight);

        windowCfg.padding = linked
            ? { leftMeters: left, rightMeters: right }
            : { leftMeters: left, rightMeters: right, linked: false };

        this._enforceBaySizeAgainstWindow(bay);
        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _toggleBayWindowPaddingLink(layerId, faceId, bayId) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;
        const windowCfg = this._ensureBayWindowConfig(bay, { create: false });
        if (!windowCfg || windowCfg.enabled === false) return;

        const padding = windowCfg.padding && typeof windowCfg.padding === 'object' ? windowCfg.padding : { leftMeters: 0, rightMeters: 0 };
        const linked = (padding.linked ?? true) !== false;
        const left = clamp(padding.leftMeters ?? 0, WINDOW_PADDING_MIN_M, WINDOW_PADDING_MAX_M);
        const right = clamp(padding.rightMeters ?? left, WINDOW_PADDING_MIN_M, WINDOW_PADDING_MAX_M);

        if (linked) {
            windowCfg.padding = { leftMeters: left, rightMeters: right, linked: false };
        } else {
            const next = Math.max(left, right);
            windowCfg.padding = { leftMeters: next, rightMeters: next };
        }

        this._enforceBaySizeAgainstWindow(bay);
        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _openBayWindowPicker(layerId, faceId, bayId) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const windowCfg = this._ensureBayWindowConfig(bay, { create: false });
        if (!windowCfg || windowCfg.enabled === false) return;

        const lib = this._ensureWindowDefinitionsLibrary();
        if (!lib) return;
        if (!lib.items.length) {
            const createdId = this._createWindowDefinition();
            if (!createdId) return;
            windowCfg.defId = createdId;
            this._enforceBaySizeAgainstWindow(bay);
            this._syncUiState();
        }

        const defs = lib.items;
        const selectedDefId = typeof windowCfg.defId === 'string' ? windowCfg.defId : '';
        const selectedDef = defs.find((entry) => entry?.id === selectedDefId) ?? null;

        const definitionOptions = defs.map((entry) => ({
            id: `window:def:${entry.id}`,
            label: entry.label || entry.id,
            kind: 'texture',
            previewUrl: this._getWindowDefinitionPreviewUrl(entry.id, entry.settings)
        }));
        const actionOptions = [
            { id: 'window:create', label: 'Create New', kind: 'texture', previewUrl: null }
        ];
        if (selectedDef) {
            actionOptions.push({
                id: `window:edit:${selectedDef.id}`,
                label: 'Edit',
                kind: 'texture',
                previewUrl: this._getWindowDefinitionPreviewUrl(selectedDef.id, selectedDef.settings)
            });
        }

        this._windowPickerPopup.open({
            title: 'Select Window',
            sections: [
                { label: 'Window Definitions', options: definitionOptions },
                { label: 'Actions', options: actionOptions }
            ],
            selectedId: selectedDef ? `window:def:${selectedDef.id}` : null,
            onSelect: (opt) => {
                const id = typeof opt?.id === 'string' ? opt.id : '';
                if (!id) return;
                if (id === 'window:create') {
                    const createdId = this._createWindowDefinition({ cloneFromId: selectedDef?.id ?? null });
                    if (!createdId) return;
                    this._setBayWindowDefinition(layerId, faceId, bayId, createdId);
                    this._openBayWindowFabrication(layerId, faceId, bayId, createdId);
                    return;
                }
                if (id.startsWith('window:edit:')) {
                    const defId = id.slice('window:edit:'.length);
                    if (!defId) return;
                    this._openBayWindowFabrication(layerId, faceId, bayId, defId);
                    return;
                }
                if (id.startsWith('window:def:')) {
                    const defId = id.slice('window:def:'.length);
                    if (!defId) return;
                    this._setBayWindowDefinition(layerId, faceId, bayId, defId);
                }
            }
        });
    }

    _openBayWindowFabrication(layerId, faceId, bayId, windowDefId) {
        const defId = typeof windowDefId === 'string' ? windowDefId : '';
        if (!defId) return;
        const entry = this._findWindowDefinitionEntry(defId);
        if (!entry) return;
        this._windowPickerPopup.close();
        this._windowFabricationPopup.open({
            title: entry.label || defId,
            subtitle: 'Building window definition',
            initialSettings: entry.settings,
            popupClassName: 'building-fab2-window-fab-popup',
            wallSpec: { width: 8, height: 6, depth: 1.2, frontZ: 4.0 },
            previewGrid: { rows: 2, cols: 2 },
            onSettingsChange: (nextSettings) => {
                this._setWindowDefinitionSettings(defId, nextSettings);
                this._setBayWindowDefinition(layerId, faceId, bayId, defId);
            }
        });
    }

    _applyViewMode(mode) {
        const next = (mode === 'wireframe' || mode === 'floors' || mode === 'floorplan' || mode === 'mesh')
            ? mode
            : 'mesh';

        this.scene.setShowWireframe(next === 'wireframe');
        this.scene.setShowFloorDivisions(next === 'floors');
        this.scene.setShowFloorplan(next === 'floorplan');
        this._perfBar?.requestUpdate?.();
    }

    _openLoadBrowser() {
        this.ui.openLoadBrowser();
        this._renderAllThumbnails();
    }

    async _renderAllThumbnails() {
        const jobId = (this._thumbJobId += 1);
        const entries = this._catalogEntries.slice();
        for (const entry of entries) {
            if (!entry?.id) continue;
            if (this._thumbCache.has(entry.id)) continue;
            if (jobId !== this._thumbJobId) return;

            const cfg = getBuildingConfigById(entry.id);
            if (!cfg) continue;

            const url = await this._thumbRenderer.renderConfigToDataUrl(cfg);
            if (jobId !== this._thumbJobId) return;
            if (typeof url === 'string' && url) {
                this._thumbCache.set(entry.id, url);
                this.ui.setCatalogThumbnail(entry.id, url);
            }

            await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        }
    }

    _loadConfigFromCatalog(configId) {
        const id = typeof configId === 'string' ? configId : '';
        if (!id) return;

        const cfg = getBuildingConfigById(id);
        if (!cfg) return;

        this._currentConfig = deepClone(cfg);
        applyBaseWallMaterialFallbackToFloorLayers(this._currentConfig);
        this._ensureCurrentFootprintLoop();
        this._floorLayerFaceStateById = new Map();
        this._activeFloorLayerId = null;
        this._materialConfigLayerId = null;
        this._materialConfigFaceId = null;
        this._materialConfigBayId = null;
        this._layoutHover = null;
        this._layoutDrag = null;
        this._layoutMinWidthByFaceId = null;
        this.scene.setSelectedFaceId(null);

        const loaded = this.scene.loadBuildingConfig(this._currentConfig, { preserveCamera: true });
        if (!loaded) return;
        this._perfBar?.requestUpdate?.();

        this.ui.closeLoadBrowser();
        this.ui.closeLinkPopup();
        this._windowPickerPopup.close();
        this._windowFabricationPopup.close();
        this._syncUiState();
    }

    _createBuilding() {
        const faceLinking = { links: { ...DEFAULT_FACE_LINKS } };
        const floor = {
            id: createLayerId('floor'),
            type: 'floor',
            floors: 4,
            floorHeight: 4.2,
            faceLinking
        };
        const cfg = {
            id: 'bf2_building',
            name: 'Building',
            layers: [floor],
            footprintLoops: [createDefaultFootprintLoop()]
        };

        this._currentConfig = cfg;
        this._materialConfigLayerId = null;
        this._materialConfigFaceId = null;
        this._materialConfigBayId = null;
        this._layoutHover = null;
        this._layoutDrag = null;
        this._layoutMinWidthByFaceId = null;
        const lockedToByFace = createEmptyFaceLockMap();
        for (const [slave, master] of Object.entries(faceLinking.links)) lockedToByFace.set(slave, master);
        this._floorLayerFaceStateById = new Map();
        this._floorLayerFaceStateById.set(floor.id, {
            selectedFaceId: null,
            lockedToByFace
        });
        this._activeFloorLayerId = floor.id;
        this.scene.setSelectedFaceId(null);

        const loaded = this.scene.loadBuildingConfig(this._currentConfig, { preserveCamera: true });
        if (!loaded) return;
        this._perfBar?.requestUpdate?.();

        this.ui.closeLoadBrowser();
        this.ui.closeLinkPopup();
        this._windowPickerPopup.close();
        this._windowFabricationPopup.close();
        this._syncUiState();
    }

    _reset() {
        if (!this.scene.getHasBuilding()) return;
        this.scene.clearBuilding();
        this._currentConfig = null;
        this._floorLayerFaceStateById = new Map();
        this._activeFloorLayerId = null;
        this._materialConfigLayerId = null;
        this._materialConfigFaceId = null;
        this._materialConfigBayId = null;
        this._layoutHover = null;
        this._layoutDrag = null;
        this._layoutMinWidthByFaceId = null;
        this._setLayoutAdjustEnabled(false);
        this.scene.setSelectedFaceId(null);
        this.ui.closeLoadBrowser();
        this.ui.closeLinkPopup();
        this._windowPickerPopup.close();
        this._windowFabricationPopup.close();
        this._perfBar?.requestUpdate?.();
        this._syncUiState();
    }

    _requestRebuild({ preserveCamera = true, maxRateHz = null } = {}) {
        const keepCamera = !!preserveCamera;
        const hz = Number(maxRateHz);
        const minIntervalMs = Number.isFinite(hz) && hz > 0 ? (1000 / hz) : 0;
        const now = (typeof performance !== 'undefined' && Number.isFinite(performance.now()))
            ? performance.now()
            : Date.now();
        const earliestAt = minIntervalMs > 0
            ? Math.max(this._lastRebuildAtMs + minIntervalMs, now)
            : now;
        if (this._pendingRebuild) {
            this._pendingRebuildPreserveCamera &&= keepCamera;
            this._pendingRebuildEarliestAtMs = Math.min(this._pendingRebuildEarliestAtMs, earliestAt);
            return;
        }
        this._pendingRebuild = true;
        this._pendingRebuildPreserveCamera = keepCamera;
        this._pendingRebuildEarliestAtMs = earliestAt;
    }

    _addFloorLayer() {
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;

        const layers = cfg.layers;
        const lastFloor = [...layers].reverse().find((layer) => layer?.type === 'floor') ?? null;
        const height = Number.isFinite(lastFloor?.floorHeight) ? lastFloor.floorHeight : 4.2;
        const faceLinking = { links: { ...DEFAULT_FACE_LINKS } };
        const layer = {
            id: createLayerId('floor'),
            type: 'floor',
            floors: 1,
            floorHeight: height,
            faceLinking
        };

        const insertAt = layers.findIndex((l) => l?.type === 'roof');
        if (insertAt >= 0) layers.splice(insertAt, 0, layer);
        else layers.push(layer);

        this._floorLayerFaceStateById.set(layer.id, { selectedFaceId: null, lockedToByFace: createFaceLockMapFromConfigLayer(layer) });

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _addRoofLayer() {
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;

        cfg.layers.push({
            id: createLayerId('roof'),
            type: 'roof'
        });
        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _moveLayer(layerId, dir) {
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;
        const id = typeof layerId === 'string' ? layerId : '';
        const d = Math.sign(Number(dir));
        if (!id || (d !== -1 && d !== 1)) return;

        const layers = cfg.layers;
        const idx = layers.findIndex((l) => l?.id === id);
        if (idx < 0) return;
        const nextIdx = idx + d;
        if (nextIdx < 0 || nextIdx >= layers.length) return;

        const tmp = layers[idx];
        layers[idx] = layers[nextIdx];
        layers[nextIdx] = tmp;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _deleteLayer(layerId) {
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id) return;

        const layers = cfg.layers;
        const idx = layers.findIndex((l) => l?.id === id);
        if (idx < 0) return;

        const layer = layers[idx];
        const type = layer?.type;
        if (type !== 'floor' && type !== 'roof') return;

        const floorCount = layers.filter((l) => l?.type === 'floor').length;
        if (type === 'floor' && floorCount <= 1) return;

        layers.splice(idx, 1);
        if (type === 'floor') {
            this._floorLayerFaceStateById.delete(id);
            if (this._activeFloorLayerId === id) {
                this._activeFloorLayerId = null;
                this.scene.setSelectedFaceId(null);
                this.ui.closeLinkPopup();
            }
            if (this._materialConfigLayerId === id) {
                this._materialConfigLayerId = null;
                this._materialConfigFaceId = null;
                this._materialConfigBayId = null;
                this.ui.closeSidePanel();
            }

            const facadesByLayerId = cfg.facades && typeof cfg.facades === 'object' ? cfg.facades : null;
            if (facadesByLayerId && facadesByLayerId[id]) {
                delete facadesByLayerId[id];
                if (!Object.keys(facadesByLayerId).length) delete cfg.facades;
            }
        }
        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setFloorLayerFloors(layerId, floors) {
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id || !Number.isFinite(floors)) return;
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;

        const layer = cfg.layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return;

        const next = clampInt(floors, FLOOR_COUNT_MIN, FLOOR_COUNT_MAX);
        if (Number(layer.floors) === next) return;

        layer.floors = next;
        this._requestRebuild({ preserveCamera: true });
    }

    _setFloorLayerFloorHeight(layerId, height) {
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id || !Number.isFinite(height)) return;
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;

        const next = clamp(height, FLOOR_HEIGHT_MIN, FLOOR_HEIGHT_MAX);
        const layer = cfg.layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return;

        if (Math.abs(next - (Number(layer?.floorHeight) || 0)) < 1e-6) return;
        layer.floorHeight = next;
        this._requestRebuild({ preserveCamera: true });
    }

    _ensureFaceMaterialConfigForMaster(layer, faceId) {
        const master = isFaceId(faceId) ? faceId : null;
        if (!master || !layer || typeof layer !== 'object') return null;

        layer.faceMaterials ??= {};
        const faceMaterials = layer.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
        if (!faceMaterials) return null;

        let cfg = faceMaterials[master] ?? null;
        if (!cfg || typeof cfg !== 'object') {
            cfg = {
                material: resolveDefaultLayerWallMaterial(layer),
                wallBase: layer.wallBase ? deepClone(layer.wallBase) : null,
                tiling: layer.tiling ? deepClone(layer.tiling) : null,
                materialVariation: layer.materialVariation ? deepClone(layer.materialVariation) : null
            };
            faceMaterials[master] = cfg;
        }
        return cfg;
    }

    _setFloorLayerMaterial(layerId, faceId, material) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        if (!id || !face) return;
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;

        const layer = cfg.layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return;

        const state = this._floorLayerFaceStateById.get(id) ?? null;
        const lockedToByFace = state?.lockedToByFace ?? null;
        if (lockedToByFace instanceof Map) {
            const lockedTo = lockedToByFace.get(face) ?? null;
            if (lockedTo) return;
        }

        const next = normalizeMaterialSpec(material);
        if (!next) return;

        const faceCfg = this._ensureFaceMaterialConfigForMaster(layer, face);
        if (!faceCfg) return;

        const prev = normalizeMaterialSpec(faceCfg?.material ?? null);
        if ((prev?.kind ?? null) === next.kind && (prev?.id ?? null) === next.id) return;
        faceCfg.material = next;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _ensureFacadeBaysForMaster(layerId, faceId) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        if (!id || !face) return null;
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return null;

        const layer = cfg.layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return null;

        const state = this._floorLayerFaceStateById.get(id) ?? null;
        const lockedToByFace = state?.lockedToByFace ?? null;
        if (lockedToByFace instanceof Map) {
            const lockedTo = lockedToByFace.get(face) ?? null;
            if (lockedTo) return null;
        }

        const layerFacades = ensureLayerFaceFacades(cfg, id);
        if (!layerFacades) return null;
        layerFacades[face] ??= {};
        const facade = layerFacades[face];
        if (!facade || typeof facade !== 'object') return null;

        facade.layout ??= {};
        if (!facade.layout || typeof facade.layout !== 'object') facade.layout = {};
        facade.layout.bays ??= {};
        if (!facade.layout.bays || typeof facade.layout.bays !== 'object') facade.layout.bays = {};
        facade.layout.bays.items ??= [];
        if (!Array.isArray(facade.layout.bays.items)) facade.layout.bays.items = [];
        facade.layout.bays.nextBayIndex = clampInt(facade.layout.bays.nextBayIndex ?? 1, 1, 9999);
        return { cfg, layer, layerFacades, facade, bays: facade.layout.bays };
    }

    _ensureFacadeBayGroupsForMaster(layerId, faceId) {
        const ctx = this._ensureFacadeBaysForMaster(layerId, faceId);
        if (!ctx) return null;

        const facade = ctx.facade;
        facade.layout.groups ??= {};
        if (!facade.layout.groups || typeof facade.layout.groups !== 'object') facade.layout.groups = {};
        facade.layout.groups.items ??= [];
        if (!Array.isArray(facade.layout.groups.items)) facade.layout.groups.items = [];
        facade.layout.groups.nextGroupIndex = clampInt(facade.layout.groups.nextGroupIndex ?? 1, 1, 9999);
        return { ...ctx, groups: facade.layout.groups };
    }

    _findBaySpec({ layerId, faceId, bayId }) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        const bid = typeof bayId === 'string' ? bayId : '';
        if (!id || !face || !bid) return null;
        const cfg = this._currentConfig;
        if (!cfg) return null;

        const layerFacades = resolveLayerFaceFacades(cfg, id);
        if (!layerFacades) return null;
        const facade = layerFacades[face];
        if (!facade || typeof facade !== 'object') return null;
        const items = Array.isArray(facade?.layout?.bays?.items) ? facade.layout.bays.items : null;
        if (!items) return null;
        const idx = items.findIndex((b) => b && typeof b === 'object' && b.id === bid);
        if (idx < 0) return null;
        return { cfg, layerFacades, facade, items, idx, bay: items[idx] };
    }

    _createBayGroup(layerId, faceId, bayIds) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        if (!id || !face) return null;

        const srcBayIds = Array.isArray(bayIds) ? bayIds : [];
        const raw = srcBayIds.map((bid) => (typeof bid === 'string' ? bid : '')).filter(Boolean);
        if (raw.length < BAY_GROUP_MIN_SIZE) return null;

        const ctx = this._ensureFacadeBayGroupsForMaster(id, face);
        if (!ctx) return null;

        const bays = Array.isArray(ctx.bays?.items) ? ctx.bays.items : [];
        if (bays.length < BAY_GROUP_MIN_SIZE) return null;

        const indexById = new Map();
        for (let i = 0; i < bays.length; i++) {
            const bay = bays[i] && typeof bays[i] === 'object' ? bays[i] : null;
            const bid = typeof bay?.id === 'string' ? bay.id : '';
            if (bid) indexById.set(bid, i);
        }

        const uniq = new Set();
        const indices = [];
        for (const bid of raw) {
            if (uniq.has(bid)) continue;
            uniq.add(bid);
            const idx = indexById.get(bid);
            if (!Number.isInteger(idx)) {
                console.warn(`[BuildingFabrication2View] Cannot create bay group: bay "${bid}" not found.`);
                return null;
            }
            indices.push(idx);
        }

        if (indices.length < BAY_GROUP_MIN_SIZE) return null;
        indices.sort((a, b) => a - b);
        for (let i = 1; i < indices.length; i++) {
            if (indices[i] !== indices[i - 1] + 1) {
                console.warn('[BuildingFabrication2View] Cannot create bay group: selection must be contiguous.');
                return null;
            }
        }

        const selectionIdSet = new Set(indices.map((idx) => {
            const bay = bays[idx] && typeof bays[idx] === 'object' ? bays[idx] : null;
            return typeof bay?.id === 'string' ? bay.id : '';
        }).filter(Boolean));

        const groups = Array.isArray(ctx.groups?.items) ? ctx.groups.items : [];
        for (const group of groups) {
            const memberIds = Array.isArray(group?.bayIds) ? group.bayIds : [];
            if (memberIds.some((bid) => selectionIdSet.has(bid))) {
                const gid = typeof group?.id === 'string' ? group.id : '(unknown)';
                console.warn(`[BuildingFabrication2View] Cannot create bay group: selection overlaps existing group "${gid}".`);
                return null;
            }
        }

        const used = new Set(groups.map((g) => (g && typeof g === 'object' ? g.id : '')).filter(Boolean));
        let nextIndex = clampInt(ctx.groups.nextGroupIndex ?? 1, 1, 9999);
        let groupId = `group_${nextIndex}`;
        for (let guard = 0; guard < 9999 && used.has(groupId); guard++) {
            nextIndex += 1;
            groupId = `group_${nextIndex}`;
        }
        ctx.groups.nextGroupIndex = nextIndex + 1;

        const orderedBayIds = indices.map((idx) => {
            const bay = bays[idx] && typeof bays[idx] === 'object' ? bays[idx] : null;
            return typeof bay?.id === 'string' ? bay.id : '';
        }).filter(Boolean);

        groups.push({
            id: groupId,
            bayIds: orderedBayIds,
            repeat: normalizeFacadeBayGroupRepeat({ minRepeats: 1, maxRepeats: 'auto' })
        });
        ctx.groups.items = groups;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
        return groupId;
    }

    _removeBayGroup(layerId, faceId, groupId) {
        const ctx = this._ensureFacadeBayGroupsForMaster(layerId, faceId);
        if (!ctx) return;

        const gid = typeof groupId === 'string' ? groupId : '';
        if (!gid) return;

        const groups = Array.isArray(ctx.groups?.items) ? ctx.groups.items : [];
        const idx = groups.findIndex((g) => (g && typeof g === 'object' ? g.id : '') === gid);
        if (idx < 0) return;
        groups.splice(idx, 1);
        ctx.groups.items = groups;

        if (!groups.length) delete ctx.facade.layout.groups;

        const hasAnyLayout = ctx.facade.layout && typeof ctx.facade.layout === 'object' && Object.keys(ctx.facade.layout).length > 0;
        if (!hasAnyLayout) delete ctx.facade.layout;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _addBay(layerId, faceId) {
        const ctx = this._ensureFacadeBaysForMaster(layerId, faceId);
        if (!ctx) return null;

        const bays = ctx.bays;
        const items = Array.isArray(bays.items) ? bays.items : [];

        const used = new Set(items.map((b) => (b && typeof b === 'object' ? b.id : '')).filter(Boolean));
        let nextIndex = clampInt(bays.nextBayIndex ?? 1, 1, 9999);
        let id = `bay_${nextIndex}`;
        for (let guard = 0; guard < 9999 && used.has(id); guard++) {
            nextIndex += 1;
            id = `bay_${nextIndex}`;
        }
        bays.nextBayIndex = nextIndex + 1;

        items.push({
            id,
            size: { mode: 'range', minMeters: BAY_DEFAULT_WIDTH_M, maxMeters: null },
            expandPreference: 'prefer_expand',
            wallMaterialOverride: null
        });
        bays.items = items;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
        return id;
    }

    _moveBay(layerId, faceId, bayId, dir) {
        const delta = Math.sign(Number(dir));
        if (delta !== -1 && delta !== 1) return;

        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;

        const items = ctx.items;
        const from = ctx.idx;
        const to = from + delta;
        if (to < 0 || to >= items.length) return;

        const tmp = items[from];
        items[from] = items[to];
        items[to] = tmp;

        const groups = Array.isArray(ctx.facade?.layout?.groups?.items) ? ctx.facade.layout.groups.items : null;
        if (groups && groups.length) {
            const indexById = new Map();
            for (let i = 0; i < items.length; i++) {
                const bay = items[i] && typeof items[i] === 'object' ? items[i] : null;
                const bid = typeof bay?.id === 'string' ? bay.id : '';
                if (bid) indexById.set(bid, i);
            }

            for (let gi = groups.length - 1; gi >= 0; gi--) {
                const group = groups[gi] && typeof groups[gi] === 'object' ? groups[gi] : null;
                const ids = Array.isArray(group?.bayIds) ? group.bayIds : [];
                if (ids.length < BAY_GROUP_MIN_SIZE) {
                    groups.splice(gi, 1);
                    continue;
                }

                const indices = [];
                let invalid = false;
                for (const bid of ids) {
                    const idx = indexById.get(bid);
                    if (!Number.isInteger(idx)) {
                        invalid = true;
                        break;
                    }
                    indices.push(idx);
                }
                if (invalid) {
                    const gid = typeof group?.id === 'string' ? group.id : '(unknown)';
                    console.warn(`[BuildingFabrication2View] Dropping bay group "${gid}" after move because a member bay is missing.`);
                    groups.splice(gi, 1);
                    continue;
                }

                indices.sort((a, b) => a - b);
                let contiguous = true;
                for (let i = 1; i < indices.length; i++) {
                    if (indices[i] !== indices[i - 1] + 1) {
                        contiguous = false;
                        break;
                    }
                }

                if (!contiguous) {
                    const gid = typeof group?.id === 'string' ? group.id : '(unknown)';
                    console.warn(`[BuildingFabrication2View] Dropping bay group "${gid}" after move because it is no longer contiguous.`);
                    groups.splice(gi, 1);
                    continue;
                }

                group.bayIds = indices.map((idx) => {
                    const bay = items[idx] && typeof items[idx] === 'object' ? items[idx] : null;
                    return typeof bay?.id === 'string' ? bay.id : '';
                }).filter(Boolean);
            }

            if (!groups.length) delete ctx.facade.layout.groups;
        }

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _deleteBay(layerId, faceId, bayId) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;

        ctx.items.splice(ctx.idx, 1);
        for (const bay of ctx.items) {
            if (!bay || typeof bay !== 'object') continue;
            if ((bay.linkFromBayId ?? null) === bayId) bay.linkFromBayId = null;
            if ((bay.materialLinkFromBayId ?? null) === bayId) bay.materialLinkFromBayId = null;
        }

        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        if (!id || !face) return;

        const groups = Array.isArray(ctx.facade?.layout?.groups?.items) ? ctx.facade.layout.groups.items : null;
        if (groups && groups.length) {
            for (let gi = groups.length - 1; gi >= 0; gi--) {
                const group = groups[gi] && typeof groups[gi] === 'object' ? groups[gi] : null;
                const bayIds = Array.isArray(group?.bayIds) ? group.bayIds : [];
                const nextIds = bayIds.filter((bid) => bid !== bayId);
                if (nextIds.length < BAY_GROUP_MIN_SIZE) {
                    groups.splice(gi, 1);
                    continue;
                }
                group.bayIds = nextIds;
            }
            if (!groups.length) delete ctx.facade.layout.groups;
        }

        const items = Array.isArray(ctx.facade?.layout?.bays?.items) ? ctx.facade.layout.bays.items : null;
        if (items && !items.length) {
            delete ctx.facade.layout.bays;
        }
        const hasOtherLayout = ctx.facade.layout && typeof ctx.facade.layout === 'object' && Object.keys(ctx.facade.layout).length > 0;
        if (!hasOtherLayout) delete ctx.facade.layout;
        if (!Object.keys(ctx.facade).length) delete ctx.layerFacades[face];
        cleanupEmptyLayerFacades(ctx.cfg, id);

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBaySizeMode(layerId, faceId, bayId, mode) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;

        const nextMode = mode === 'fixed' ? 'fixed' : 'range';
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const curMode = bay?.size?.mode === 'fixed' ? 'fixed' : 'range';
        if (curMode === nextMode) return;

        if (nextMode === 'fixed') {
            const min = clamp(bay?.size?.minMeters ?? BAY_MIN_WIDTH_M, BAY_MIN_WIDTH_M, 9999);
            const maxRaw = bay?.size?.maxMeters;
            const max = Number.isFinite(maxRaw) ? clamp(maxRaw, min, 9999) : null;
            const width = Number.isFinite(max) ? ((min + max) * 0.5) : min;
            bay.size = { mode: 'fixed', widthMeters: width };
        } else {
            const width = clamp(bay?.size?.widthMeters ?? 1.0, BAY_MIN_WIDTH_M, 9999);
            bay.size = { mode: 'range', minMeters: width, maxMeters: null };
        }
        this._enforceBaySizeAgainstWindow(bay);

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayFixedWidth(layerId, faceId, bayId, width) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;
        if (bay?.size?.mode !== 'fixed') return;

        const requiredWindowMin = this._resolveBayWindowMinRequirementMeters(bay);
        const nextMin = Number.isFinite(requiredWindowMin) ? requiredWindowMin : BAY_MIN_WIDTH_M;
        const next = clamp(width, nextMin, 9999);
        if (Math.abs(next - (Number(bay.size?.widthMeters) || 0)) < 1e-6) return;
        bay.size.widthMeters = next;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayMinWidth(layerId, faceId, bayId, min) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;
        if (bay?.size?.mode !== 'range') return;

        const requiredWindowMin = this._resolveBayWindowMinRequirementMeters(bay);
        const nextMin = Number.isFinite(requiredWindowMin) ? Math.max(BAY_MIN_WIDTH_M, requiredWindowMin) : BAY_MIN_WIDTH_M;
        const next = clamp(min, nextMin, 9999);
        bay.size.minMeters = next;

        const maxRaw = bay.size.maxMeters;
        if (Number.isFinite(maxRaw) && maxRaw < next) bay.size.maxMeters = next;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayMaxWidth(layerId, faceId, bayId, max) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;
        if (bay?.size?.mode !== 'range') return;

        if (max === null) {
            bay.size.maxMeters = null;
        } else {
            const min = clamp(bay.size.minMeters ?? BAY_MIN_WIDTH_M, BAY_MIN_WIDTH_M, 9999);
            bay.size.maxMeters = clamp(max, min, 9999);
        }

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayExpandPreference(layerId, faceId, bayId, pref) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const next = normalizeBayExpandPreference(pref);
        const prev = normalizeBayExpandPreference(bay.expandPreference ?? null);
        if (prev === next) return;

        bay.expandPreference = next;
        if (bay.repeatable !== undefined) delete bay.repeatable;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayTextureFlow(layerId, faceId, bayId, mode) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const next = normalizeBayTextureFlow(mode);
        const prev = normalizeBayTextureFlow(bay?.textureFlow ?? null);
        if (prev === next) return;

        if (next === 'restart') delete bay.textureFlow;
        else bay.textureFlow = next;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayDepthEdge(layerId, faceId, bayId, edge, depthMeters) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const side = edge === 'right' ? 'right' : 'left';
        const nextValue = clamp(depthMeters, BAY_DEPTH_MIN_M, BAY_DEPTH_MAX_M);

        const depth = bay.depth && typeof bay.depth === 'object' ? bay.depth : null;
        const linked = (depth?.linked ?? true) !== false;
        const prevLeft = clamp(Number(depth?.left) || 0, BAY_DEPTH_MIN_M, BAY_DEPTH_MAX_M);
        const prevRightRaw = Number(depth?.right);
        const prevRight = clamp(Number.isFinite(prevRightRaw) ? prevRightRaw : (linked ? prevLeft : 0), BAY_DEPTH_MIN_M, BAY_DEPTH_MAX_M);

        const left = linked ? nextValue : (side === 'left' ? nextValue : prevLeft);
        const right = linked ? nextValue : (side === 'right' ? nextValue : prevRight);

        if (linked) {
            if (Math.abs(left) < 1e-6 && Math.abs(right) < 1e-6) delete bay.depth;
            else bay.depth = { left, right };
        } else {
            bay.depth = { left, right, linked: false };
        }

        this._requestRebuild({ preserveCamera: true });
    }

    _toggleBayDepthLink(layerId, faceId, bayId) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const depth = bay.depth && typeof bay.depth === 'object' ? bay.depth : null;
        const linked = (depth?.linked ?? true) !== false;

        const prevLeft = clamp(Number(depth?.left) || 0, BAY_DEPTH_MIN_M, BAY_DEPTH_MAX_M);
        const prevRightRaw = Number(depth?.right);
        const prevRight = clamp(Number.isFinite(prevRightRaw) ? prevRightRaw : prevLeft, BAY_DEPTH_MIN_M, BAY_DEPTH_MAX_M);

        if (linked) {
            bay.depth = { left: prevLeft, right: prevRight, linked: false };
        } else {
            const next = Math.abs(prevRight) > Math.abs(prevLeft) ? prevRight : prevLeft;
            if (Math.abs(next) < 1e-6) delete bay.depth;
            else bay.depth = { left: next, right: next };
        }

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayWallMaterialOverride(layerId, faceId, bayId, material) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const next = normalizeMaterialSpec(material);
        if (material === null) {
            if (bay.wallMaterialOverride === null || bay.wallMaterialOverride === undefined) return;
            bay.wallMaterialOverride = null;
        } else {
            if (!next) return;
            const prev = normalizeMaterialSpec(bay.wallMaterialOverride ?? null);
            if ((prev?.kind ?? null) === next.kind && (prev?.id ?? null) === next.id) return;
            bay.wallMaterialOverride = next;
        }

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayLink(layerId, faceId, bayId, masterBayId) {
        const ctx = this._ensureFacadeBaysForMaster(layerId, faceId);
        if (!ctx) return;
        const bid = typeof bayId === 'string' ? bayId : '';
        if (!bid) return;

        const items = Array.isArray(ctx.bays?.items) ? ctx.bays.items : [];
        const bay = items.find((b) => (b && typeof b === 'object' ? b.id : '') === bid) ?? null;
        if (!bay || typeof bay !== 'object') return;

        const nextMaster = typeof masterBayId === 'string' && masterBayId ? masterBayId : null;
        if (!nextMaster) {
            if (!resolveBayLinkFromSpec(bay)) return;
            bay.linkFromBayId = null;
            bay.materialLinkFromBayId = null;
            this._syncUiState();
            this._requestRebuild({ preserveCamera: true });
            return;
        }

        if (nextMaster === bid) {
            console.warn(`[BuildingFabrication2View] Ignoring linkFromBayId cycle: bay "${bid}" cannot link to itself.`);
            return;
        }
        const masterExists = items.some((b) => (b && typeof b === 'object' ? b.id : '') === nextMaster);
        if (!masterExists) {
            console.warn(`[BuildingFabrication2View] Cannot link bay "${bid}" to missing bay "${nextMaster}".`);
            return;
        }

        const byId = new Map(items.map((b) => [b && typeof b === 'object' ? b.id : '', b]).filter((it) => typeof it[0] === 'string' && it[0]));
        let rootMaster = nextMaster;
        let curId = nextMaster;
        const visited = new Set([bid]);
        for (let i = 0; i < 32; i++) {
            if (visited.has(curId)) {
                console.warn(`[BuildingFabrication2View] Cannot link bay "${bid}" to "${nextMaster}" because it would create a cycle.`);
                return;
            }
            visited.add(curId);

            const cur = byId.get(curId) ?? null;
            if (!cur || typeof cur !== 'object') break;
            rootMaster = curId;

            const link = resolveBayLinkFromSpec(cur);
            if (!link || link === curId) break;

            const next = byId.get(link) ?? null;
            if (!next || typeof next !== 'object') break;

            curId = link;
        }

        if (rootMaster === bid) {
            console.warn(`[BuildingFabrication2View] Ignoring linkFromBayId cycle: bay "${bid}" cannot link to itself.`);
            return;
        }

        const slaves = items.filter((b) => {
            if (!b || typeof b !== 'object') return false;
            const id = typeof b.id === 'string' ? b.id : '';
            if (!id || id === bid) return false;
            return resolveBayLinkFromSpec(b) === bid;
        });
        const hasSlavesToRedirect = slaves.length > 0;

        if ((bay.linkFromBayId ?? null) === rootMaster && (bay.materialLinkFromBayId ?? null) === null && !hasSlavesToRedirect) return;

        bay.linkFromBayId = rootMaster;
        bay.materialLinkFromBayId = null;
        for (const slave of slaves) {
            slave.linkFromBayId = rootMaster;
            slave.materialLinkFromBayId = null;
        }

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _duplicateBay(layerId, faceId, bayId) {
        const ctx = this._ensureFacadeBaysForMaster(layerId, faceId);
        if (!ctx) return null;
        const bid = typeof bayId === 'string' ? bayId : '';
        if (!bid) return null;

        const items = Array.isArray(ctx.bays?.items) ? ctx.bays.items : [];
        const master = items.find((b) => (b && typeof b === 'object' ? b.id : '') === bid) ?? null;
        if (!master || typeof master !== 'object') return null;
        if (resolveBayLinkFromSpec(master)) {
            console.warn(`[BuildingFabrication2View] Cannot duplicate bay "${bid}" because it is linked (slave).`);
            return null;
        }

        const used = new Set(items.map((b) => (b && typeof b === 'object' ? b.id : '')).filter(Boolean));
        let nextIndex = clampInt(ctx.bays.nextBayIndex ?? 1, 1, 9999);
        let id = `bay_${nextIndex}`;
        for (let guard = 0; guard < 9999 && used.has(id); guard++) {
            nextIndex += 1;
            id = `bay_${nextIndex}`;
        }
        ctx.bays.nextBayIndex = nextIndex + 1;

        items.push({
            id,
            linkFromBayId: bid,
            size: { mode: 'range', minMeters: BAY_DEFAULT_WIDTH_M, maxMeters: null },
            expandPreference: 'prefer_expand',
            wallMaterialOverride: null
        });
        ctx.bays.items = items;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
        return id;
    }

    _setSelectedFace(layerId, faceId) {
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id) return;

        const state = this._floorLayerFaceStateById.get(id) ?? null;
        if (!state) return;

        let clearedOtherSelection = false;
        for (const [otherId, other] of this._floorLayerFaceStateById.entries()) {
            if (otherId === id) continue;
            if (!other || other.selectedFaceId === null) continue;
            other.selectedFaceId = null;
            clearedOtherSelection = true;
        }

        const next = isFaceId(faceId) ? faceId : null;
        if (!clearedOtherSelection && next === state.selectedFaceId && this._activeFloorLayerId === id) return;

        state.selectedFaceId = next;
        this._activeFloorLayerId = id;
        this.scene.setSelectedFaceId(next);
        this.scene.setActiveFaceLayerId?.(id);
        this.ui.setFloorLayerFaceStates(this._floorLayerFaceStateById);
        this.ui.setMaterialConfigContext(this._buildMaterialConfigContext());
    }

    _getSelectedFaceId() {
        for (const state of this._floorLayerFaceStateById.values()) {
            const faceId = isFaceId(state?.selectedFaceId) ? state.selectedFaceId : null;
            if (faceId) return faceId;
        }
        return null;
    }

    _openMaterialConfigForLayer(layerId, faceId) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        if (!id || !face) return;
        const cfg = this._currentConfig;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];
        const layer = layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return;

        const state = this._floorLayerFaceStateById.get(id) ?? null;
        const lockedToByFace = state?.lockedToByFace ?? null;
        if (lockedToByFace instanceof Map) {
            const lockedTo = lockedToByFace.get(face) ?? null;
            if (lockedTo) return;
        }

        this._ensureFaceMaterialConfigForMaster(layer, face);

        this._materialConfigLayerId = id;
        this._materialConfigFaceId = face;
        this._materialConfigBayId = null;
        this.ui.setMaterialConfigContext(this._buildMaterialConfigContext());
        this.ui.openMaterialConfigPanel();
    }

    _openMaterialConfigForBay(layerId, faceId, bayId) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        const bay = typeof bayId === 'string' ? bayId : '';
        if (!id || !face || !bay) return;

        const cfg = this._currentConfig;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];
        const layer = layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return;

        const state = this._floorLayerFaceStateById.get(id) ?? null;
        const lockedToByFace = state?.lockedToByFace ?? null;
        if (lockedToByFace instanceof Map) {
            const lockedTo = lockedToByFace.get(face) ?? null;
            if (lockedTo) return;
        }

        const spec = this._resolveBaySpec({ layerId: id, faceId: face, bayId: bay });
        if (!spec.bay) return;

        this._materialConfigLayerId = id;
        this._materialConfigFaceId = face;
        this._materialConfigBayId = bay;
        this.ui.setMaterialConfigContext(this._buildMaterialConfigContext());
        this.ui.openMaterialConfigPanel();
    }

    _resolveBaySpec({ layerId, faceId, bayId } = {}) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        const bay = typeof bayId === 'string' ? bayId : '';
        if (!id || !face || !bay) return { bay: null, index: -1 };

        const cfg = this._currentConfig;
        const facades = cfg?.facades && typeof cfg.facades === 'object' ? cfg.facades : null;
        const layerFacades = facades?.[id] && typeof facades[id] === 'object' ? facades[id] : null;
        const facade = layerFacades?.[face] && typeof layerFacades[face] === 'object' ? layerFacades[face] : null;
        const bays = facade?.layout?.bays?.items;
        if (!Array.isArray(bays)) return { bay: null, index: -1 };

        const idx = bays.findIndex((it) => (it && typeof it === 'object' && typeof it.id === 'string' ? it.id : '') === bay);
        if (idx < 0) return { bay: null, index: -1 };
        const spec = bays[idx];
        return { bay: spec && typeof spec === 'object' ? spec : null, index: idx };
    }

    _toggleFaceLock(layerId, masterFaceId, targetFaceId) {
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id) return;
        const master = isFaceId(masterFaceId) ? masterFaceId : null;
        const target = isFaceId(targetFaceId) ? targetFaceId : null;
        if (!master || !target || master === target) return;

        const state = this._floorLayerFaceStateById.get(id) ?? null;
        if (!state) return;

        const lockedToByFace = state.lockedToByFace;
        if (!(lockedToByFace instanceof Map)) return;

        const cfg = this._currentConfig;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];
        const layer = layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return;

        // The master cannot be a slave.
        if (lockedToByFace.get(master) ?? null) return;

        const lockedToMaster = (lockedToByFace.get(target) ?? null) === master;
        if (lockedToMaster) {
            const masterCfg = this._ensureFaceMaterialConfigForMaster(layer, master);
            if (masterCfg) {
                layer.faceMaterials ??= {};
                const faceMaterials = layer.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
                if (faceMaterials) faceMaterials[target] = deepClone(masterCfg);
            }

            const srcLayerFacades = resolveLayerFaceFacades(cfg, id);
            const srcFacade = (srcLayerFacades?.[master] && typeof srcLayerFacades[master] === 'object') ? srcLayerFacades[master] : null;
            if (srcFacade) {
                const dstLayerFacades = ensureLayerFaceFacades(cfg, id);
                if (dstLayerFacades) dstLayerFacades[target] = deepClone(srcFacade);
            }
            lockedToByFace.set(target, null);
        } else {
            const targetParent = lockedToByFace.get(target) ?? target;
            const targetCfg = this._ensureFaceMaterialConfigForMaster(layer, targetParent);
            const targetLayerFacades = resolveLayerFaceFacades(cfg, id);
            const targetFacade = (targetLayerFacades?.[targetParent] && typeof targetLayerFacades[targetParent] === 'object')
                ? targetLayerFacades[targetParent]
                : null;

            // If the target is becoming a slave, it cannot have slaves.
            for (const faceId of FACE_IDS) {
                if ((lockedToByFace.get(faceId) ?? null) !== target) continue;
                lockedToByFace.set(faceId, null);
                if (targetCfg) {
                    layer.faceMaterials ??= {};
                    const faceMaterials = layer.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
                    if (faceMaterials) faceMaterials[faceId] = deepClone(targetCfg);
                }
                if (targetFacade) {
                    const dstLayerFacades = ensureLayerFaceFacades(cfg, id);
                    if (dstLayerFacades) dstLayerFacades[faceId] = deepClone(targetFacade);
                }
            }
            lockedToByFace.set(target, master);

            const faceMaterials = layer.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
            if (faceMaterials) {
                delete faceMaterials[target];
                if (!Object.keys(faceMaterials).length) delete layer.faceMaterials;
            }

            const layerFacades = resolveLayerFaceFacades(cfg, id);
            if (layerFacades) {
                delete layerFacades[target];
                cleanupEmptyLayerFacades(cfg, id);
            }
        }

        const links = {};
        for (const faceId of FACE_IDS) {
            const to = lockedToByFace.get(faceId) ?? null;
            if (to) links[faceId] = to;
        }
        const linking = Object.keys(links).length ? { links } : null;
        if (linking) layer.faceLinking = linking;
        else delete layer.faceLinking;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setHoveredLayer(layerId) {
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id) return;

        const cfg = this._currentConfig;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];
        const isFloor = layers.some((layer) => layer?.type === 'floor' && layer?.id === id);
        if (!isFloor) return;

        this.scene.setActiveFaceLayerId?.(id);

        const selectedFaceId = this._getSelectedFaceId();
        if (selectedFaceId) {
            this._setSelectedFace(id, selectedFaceId);
        }
    }

    _setHoveredLayerHighlight(layerId) {
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id) {
            this.scene.setHoveredFloorLayerId?.(null);
            return;
        }

        const cfg = this._currentConfig;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];
        const isFloor = layers.some((layer) => layer?.type === 'floor' && layer?.id === id);
        this.scene.setHoveredFloorLayerId?.(isFloor ? id : null);
    }

    _setHideFaceMarkEnabled(enabled) {
        this._hideFaceMarkEnabled = !!enabled;
        this._syncFaceHighlightSuppression();
    }

    _setShowDummyEnabled(enabled) {
        this._showDummyEnabled = !!enabled;
        this.scene?.setShowDummy?.(this._showDummyEnabled);
    }

    _setLayoutAdjustEnabled(enabled) {
        const next = !!enabled;
        if (next === this._layoutAdjustEnabled) {
            this.ui?.setLayoutAdjustEnabled?.(next);
            this._syncLayoutSceneState();
            this._syncCameraControlEnabled();
            this._setCanvasCursor();
            return;
        }

        if (next && this._rulerEnabled) this._setRulerEnabled(false);
        this._layoutAdjustEnabled = next;
        this.ui?.setLayoutAdjustEnabled?.(next);

        if (!next) {
            if (this._layoutDrag) this._finishLayoutDrag(null);
            this._layoutHover = null;
            this._layoutDrag = null;
            this._layoutMinWidthByFaceId = null;
        }

        this._syncLayoutSceneState();
        this._syncCameraControlEnabled();
        this._setCanvasCursor();
    }

    _setRulerEnabled(enabled) {
        const next = !!enabled;
        if (next === this._rulerEnabled) return;
        if (next && this._layoutAdjustEnabled) this._setLayoutAdjustEnabled(false);
        this._rulerEnabled = next;
        this._syncCameraControlEnabled();
        this._setCanvasCursor();

        this.ui.setRulerEnabled(next);

        this._rulerPointerDown = null;
        this._rulerPointerMoved = false;

        if (!next) {
            this._clearRulerMeasurement();
            return;
        }

        this._clearRulerMeasurement();
    }

    _setCanvasCursor() {
        const canvas = this.engine?.canvas ?? null;
        if (!canvas) return;
        if (this._layoutAdjustEnabled) {
            canvas.style.cursor = this._layoutDrag ? 'grabbing' : 'grab';
            return;
        }
        if (this._rulerEnabled) {
            canvas.style.cursor = 'crosshair';
            return;
        }
        canvas.style.cursor = '';
    }

    _syncCameraControlEnabled() {
        const controls = this.scene?.controls ?? null;
        if (!controls || typeof controls !== 'object') return;
        controls.enabled = !this._layoutAdjustEnabled && !this._rulerEnabled && !this._layoutDrag;
    }

    _clearRulerMeasurement() {
        this._rulerPointA = null;
        this._rulerPointB = null;
        this._rulerFixed = false;
        this.scene?.setRulerSegment?.(null, null);
        this.ui.setRulerLabel({ visible: false });
    }

    _setRulerPointerFromEvent(event) {
        return this._setPointerFromEvent(event, this._rulerPointer);
    }

    _setLayoutPointerFromEvent(event) {
        return this._setPointerFromEvent(event, this._layoutPointer);
    }

    _setPointerFromEvent(event, target) {
        const out = target && typeof target.set === 'function' ? target : null;
        if (!out) return false;
        const canvas = this.engine?.canvas ?? null;
        if (!canvas || !event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;

        const rect = canvas.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return false;
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        out.set(x * 2 - 1, -(y * 2 - 1));
        return true;
    }

    _handleCanvasPointerDown(event) {
        if (this._layoutAdjustEnabled) {
            this._handleLayoutPointerDown(event);
            return;
        }
        this._handleRulerPointerDown(event);
    }

    _handleCanvasPointerMove(event) {
        if (this._layoutAdjustEnabled) {
            this._handleLayoutPointerMove(event);
            return;
        }
        this._handleRulerPointerMove(event);
    }

    _handleCanvasPointerUp(event) {
        if (this._layoutAdjustEnabled) {
            this._handleLayoutPointerUp(event);
            return;
        }
        this._handleRulerPointerUp(event);
    }

    _handleCanvasPointerCancel(event) {
        if (this._layoutAdjustEnabled) {
            this._handleLayoutPointerCancel(event);
            return;
        }
        this._rulerPointerDown = null;
        this._rulerPointerMoved = false;
    }

    _handleRulerPointerDown(event) {
        if (!this._rulerEnabled) return;
        if (!event || event.button !== 0) return;
        this._rulerPointerDown = { x: event.clientX, y: event.clientY };
        this._rulerPointerMoved = false;
    }

    _handleRulerPointerMove(event) {
        if (!this._rulerEnabled) return;
        if (!event) return;

        if (this._rulerPointerDown) {
            const dx = event.clientX - this._rulerPointerDown.x;
            const dy = event.clientY - this._rulerPointerDown.y;
            if (dx * dx + dy * dy > 25) this._rulerPointerMoved = true;
        }

        if (!this._rulerPointA || this._rulerFixed) return;
        if (!this._setRulerPointerFromEvent(event)) return;

        const hit = this.scene?.raycastSurface?.(this._rulerPointer) ?? null;
        if (!hit) {
            if (this._rulerPointB) {
                this._rulerPointB = null;
                this.scene?.setRulerSegment?.(null, null);
                this.ui.setRulerLabel({ visible: false });
            }
            return;
        }

        this._rulerPointB = hit;
        this.scene?.setRulerSegment?.(this._rulerPointA, this._rulerPointB);
        this._syncRulerOverlay();
    }

    _handleRulerPointerUp(event) {
        if (!this._rulerEnabled) return;
        if (!event || event.button !== 0) return;

        const moved = this._rulerPointerMoved;
        this._rulerPointerDown = null;
        this._rulerPointerMoved = false;
        if (moved) return;

        if (this._rulerFixed) return;
        if (!this._setRulerPointerFromEvent(event)) return;

        const hit = this.scene?.raycastSurface?.(this._rulerPointer) ?? null;
        if (!hit) return;

        if (!this._rulerPointA) {
            this._rulerPointA = hit;
            this._rulerPointB = null;
            this.scene?.setRulerSegment?.(null, null);
            this.ui.setRulerLabel({ visible: false });
            return;
        }

        this._rulerPointB = hit;
        this._rulerFixed = true;
        this.scene?.setRulerSegment?.(this._rulerPointA, this._rulerPointB);
        this._syncRulerOverlay();
    }

    _handleRulerPointerLeave() {
        this._rulerPointerDown = null;
        this._rulerPointerMoved = false;

        if (!this._rulerEnabled) return;
        if (!this._rulerPointA || this._rulerFixed) return;
        if (!this._rulerPointB) return;

        this._rulerPointB = null;
        this.scene?.setRulerSegment?.(null, null);
        this.ui.setRulerLabel({ visible: false });
    }

    _syncRulerOverlay() {
        const a = this._rulerPointA;
        const b = this._rulerPointB;
        if (!this._rulerEnabled || !a || !b) return;

        const canvas = this.engine?.canvas ?? null;
        const camera = this.engine?.camera ?? null;
        if (!canvas || !camera) return;

        const rect = canvas.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return;

        this._rulerMidpoint.copy(a).add(b).multiplyScalar(0.5);
        this._rulerProject.copy(this._rulerMidpoint).project(camera);

        const x = rect.left + (this._rulerProject.x * 0.5 + 0.5) * rect.width;
        const y = rect.top + (-this._rulerProject.y * 0.5 + 0.5) * rect.height;
        const visible = this._rulerProject.z >= -1 && this._rulerProject.z <= 1;
        const dist = a.distanceTo(b);
        this.ui.setRulerLabel({ visible, x, y, text: `${dist.toFixed(2)}m` });
    }

    _ensureCurrentFootprintLoop() {
        const cfg = this._currentConfig;
        if (!cfg || typeof cfg !== 'object') return null;
        const loop = normalizePrimaryFootprintLoop(cfg.footprintLoops);
        cfg.footprintLoops = [cloneLoop(loop)];
        return cfg.footprintLoops[0];
    }

    _getCurrentFootprintLoop() {
        const loop = this._ensureCurrentFootprintLoop();
        return Array.isArray(loop) ? cloneLoop(loop) : null;
    }

    _setCurrentFootprintLoop(loop, { rateLimited = false } = {}) {
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(loop) || loop.length !== 4) return false;
        const next = cloneLoop(loop);
        const prev = this._ensureCurrentFootprintLoop();
        if (!Array.isArray(prev) || prev.length !== 4) return false;

        let changed = false;
        for (let i = 0; i < 4; i++) {
            const dx = Math.abs((Number(prev[i]?.x) || 0) - (Number(next[i]?.x) || 0));
            const dz = Math.abs((Number(prev[i]?.z) || 0) - (Number(next[i]?.z) || 0));
            if (dx > 1e-6 || dz > 1e-6) {
                changed = true;
                break;
            }
        }
        if (!changed) return false;

        cfg.footprintLoops = [next];
        this._syncLayoutSceneState();
        this._requestRebuild({
            preserveCamera: true,
            maxRateHz: rateLimited ? LAYOUT_DRAG_REBUILD_HZ : null
        });
        return true;
    }

    _syncLayoutSceneState() {
        const hasBuilding = !!this.scene?.getHasBuilding?.();
        const enabled = !!this._layoutAdjustEnabled && hasBuilding && !!this._currentConfig;
        const loop = enabled ? this._getCurrentFootprintLoop() : null;
        const drag = this._layoutDrag;
        const hover = this._layoutHover;
        const widthGuideFaceIds = enabled && drag ? this._resolveLayoutWidthGuideFaceIds(drag) : null;
        const hoverFaceId = enabled
            ? (drag?.kind === 'face' ? drag.faceId : (hover?.kind === 'face' ? hover.faceId : null))
            : null;
        const hoverVertexIndex = enabled
            ? (drag?.kind === 'vertex' ? drag.vertexIndex : (hover?.kind === 'vertex' ? hover.vertexIndex : null))
            : null;
        this.scene?.setLayoutEditState?.({
            enabled,
            loop,
            hoverFaceId,
            hoverVertexIndex,
            widthGuideFaceIds
        });
        this._syncLayoutWidthLabels({ enabled, loop, widthGuideFaceIds });
    }

    _resolveLayoutWidthGuideFaceIds(drag) {
        const d = drag && typeof drag === 'object' ? drag : null;
        if (!d) return [];
        if (d.kind === 'face') {
            const faceId = isFaceId(d.faceId) ? d.faceId : null;
            return faceId ? [...(ADJACENT_FACE_IDS_BY_FACE_ID[faceId] ?? [])] : [];
        }
        if (d.kind === 'vertex') {
            const idx = Number(d.vertexIndex);
            if (!Number.isInteger(idx)) return [];
            return [...(ADJACENT_FACE_IDS_BY_VERTEX_INDEX[idx] ?? [])];
        }
        return [];
    }

    _syncLayoutWidthLabels({ enabled = false, loop = null, widthGuideFaceIds = null } = {}) {
        const ui = this.ui ?? null;
        if (!ui || typeof ui.setLayoutWidthLabels !== 'function') return;
        const active = !!enabled && Array.isArray(loop) && loop.length === 4 && Array.isArray(widthGuideFaceIds) && widthGuideFaceIds.length > 0;
        if (!active) {
            ui.setLayoutWidthLabels([]);
            return;
        }

        const planeY = this.scene?.getLayoutEditPlaneY?.() ?? 0.02;
        const entries = [];
        for (const faceId of widthGuideFaceIds) {
            if (!isFaceId(faceId)) continue;
            const frame = computeFaceFrameFromLoop(loop, faceId);
            if (!frame) continue;
            const mid = {
                x: (frame.start.x + frame.end.x) * 0.5,
                z: (frame.start.z + frame.end.z) * 0.5
            };
            const projected = this._projectLoopPointToScreen(mid, planeY);
            const visible = !!projected && projected.zNdc >= -1 && projected.zNdc <= 1;
            entries.push({
                visible,
                x: projected?.x ?? 0,
                y: projected?.y ?? 0,
                text: `${frame.length.toFixed(2)}m`
            });
            if (entries.length >= 2) break;
        }
        ui.setLayoutWidthLabels(entries);
    }

    _resolveFacadeMinimumWidthMeters(facade) {
        const facadeObj = facade && typeof facade === 'object' ? facade : null;
        const bays = Array.isArray(facadeObj?.layout?.bays?.items) ? facadeObj.layout.bays.items : [];
        if (!bays.length) return LAYOUT_ABSOLUTE_MIN_FACE_WIDTH_M;

        const byId = new Map();
        for (const bay of bays) {
            const id = typeof bay?.id === 'string' ? bay.id : '';
            if (id) byId.set(id, bay);
        }

        const memo = new Map();
        const resolveBayMin = (bay, stack = null) => {
            const bayObj = bay && typeof bay === 'object' ? bay : null;
            if (!bayObj) return LAYOUT_ABSOLUTE_MIN_FACE_WIDTH_M;
            const id = typeof bayObj.id === 'string' ? bayObj.id : '';
            if (id && memo.has(id)) return memo.get(id);

            const visited = stack instanceof Set ? stack : new Set();
            if (id) {
                if (visited.has(id)) return LAYOUT_ABSOLUTE_MIN_FACE_WIDTH_M;
                visited.add(id);
            }

            let minMeters = LAYOUT_ABSOLUTE_MIN_FACE_WIDTH_M;
            const link = resolveBayLinkFromSpec(bayObj);
            if (link && byId.has(link)) {
                minMeters = resolveBayMin(byId.get(link), visited);
            } else {
                const mode = bayObj?.size?.mode === 'fixed' ? 'fixed' : 'range';
                if (mode === 'fixed') minMeters = clamp(bayObj?.size?.widthMeters ?? BAY_DEFAULT_WIDTH_M, BAY_MIN_WIDTH_M, 9999);
                else minMeters = clamp(bayObj?.size?.minMeters ?? BAY_DEFAULT_WIDTH_M, BAY_MIN_WIDTH_M, 9999);
            }

            const windowMin = this._resolveBayWindowMinRequirementMeters(bayObj);
            if (Number.isFinite(windowMin)) minMeters = Math.max(minMeters, windowMin);
            minMeters = Math.max(LAYOUT_ABSOLUTE_MIN_FACE_WIDTH_M, minMeters);
            if (id) memo.set(id, minMeters);
            return minMeters;
        };

        let totalMin = 0;
        for (const bay of bays) totalMin += resolveBayMin(bay);

        const groups = Array.isArray(facadeObj?.layout?.groups?.items) ? facadeObj.layout.groups.items : [];
        for (const group of groups) {
            const ids = Array.isArray(group?.bayIds) ? group.bayIds : [];
            if (!ids.length) continue;
            let groupMin = 0;
            for (const id of ids) {
                const bay = byId.get(id);
                if (!bay) continue;
                groupMin += resolveBayMin(bay);
            }
            if (!(groupMin > 0)) continue;
            const minRepeats = clampInt(group?.repeat?.minRepeats ?? 1, 1, 9999);
            totalMin += groupMin * Math.max(0, minRepeats - 1);
        }

        return Math.max(LAYOUT_ABSOLUTE_MIN_FACE_WIDTH_M, totalMin);
    }

    _resolveFaceMinWidthByFaceId() {
        const out = { A: LAYOUT_ABSOLUTE_MIN_FACE_WIDTH_M, B: LAYOUT_ABSOLUTE_MIN_FACE_WIDTH_M, C: LAYOUT_ABSOLUTE_MIN_FACE_WIDTH_M, D: LAYOUT_ABSOLUTE_MIN_FACE_WIDTH_M };
        const cfg = this._currentConfig;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];
        const facadesByLayerId = cfg?.facades && typeof cfg.facades === 'object' ? cfg.facades : null;

        for (const layer of layers) {
            if (layer?.type !== 'floor') continue;
            const layerId = typeof layer?.id === 'string' ? layer.id : '';
            if (!layerId) continue;
            const layerFacades = facadesByLayerId?.[layerId] && typeof facadesByLayerId[layerId] === 'object'
                ? facadesByLayerId[layerId]
                : null;
            const links = layer?.faceLinking?.links && typeof layer.faceLinking.links === 'object'
                ? layer.faceLinking.links
                : null;

            const resolveMasterFaceId = (faceId) => {
                if (!isFaceId(faceId)) return null;
                const visited = new Set();
                let cur = faceId;
                for (let i = 0; i < 8; i++) {
                    if (visited.has(cur)) break;
                    visited.add(cur);
                    const next = links?.[cur];
                    if (!isFaceId(next) || next === cur) break;
                    cur = next;
                }
                return cur;
            };

            for (const faceId of FACE_IDS) {
                const masterFaceId = resolveMasterFaceId(faceId) ?? faceId;
                const facade = layerFacades?.[masterFaceId] && typeof layerFacades[masterFaceId] === 'object'
                    ? layerFacades[masterFaceId]
                    : null;
                const minWidth = this._resolveFacadeMinimumWidthMeters(facade);
                out[faceId] = Math.max(out[faceId], minWidth);
            }
        }
        return out;
    }

    _isFootprintLoopValidForLayout(loop, minWidthByFaceId) {
        const pts = Array.isArray(loop) ? loop : [];
        if (pts.length !== 4) return false;
        for (const p of pts) {
            if (!Number.isFinite(p?.x) || !Number.isFinite(p?.z)) return false;
        }

        const area = signedAreaXZ(pts);
        if (!(Math.abs(area) > 1e-4)) return false;
        if (segmentsIntersect2(pts[0], pts[1], pts[2], pts[3])) return false;
        if (segmentsIntersect2(pts[1], pts[2], pts[3], pts[0])) return false;

        for (const faceId of FACE_IDS) {
            const frame = computeFaceFrameFromLoop(pts, faceId);
            if (!frame) return false;
            const minWidth = Number(minWidthByFaceId?.[faceId]) || LAYOUT_ABSOLUTE_MIN_FACE_WIDTH_M;
            if (!(frame.length + 1e-6 >= minWidth)) return false;
        }
        return true;
    }

    _clampLoopCandidate(startLoop, targetLoop, minWidthByFaceId) {
        const start = cloneLoop(startLoop);
        const target = cloneLoop(targetLoop);
        if (this._isFootprintLoopValidForLayout(target, minWidthByFaceId)) return target;
        if (!this._isFootprintLoopValidForLayout(start, minWidthByFaceId)) return start;

        let lo = 0;
        let hi = 1;
        let best = start;
        for (let i = 0; i < 22; i++) {
            const t = (lo + hi) * 0.5;
            const cand = [];
            for (let j = 0; j < 4; j++) {
                const sx = Number(start[j]?.x) || 0;
                const sz = Number(start[j]?.z) || 0;
                const tx = Number(target[j]?.x) || 0;
                const tz = Number(target[j]?.z) || 0;
                cand.push({
                    x: sx + (tx - sx) * t,
                    z: sz + (tz - sz) * t
                });
            }
            if (this._isFootprintLoopValidForLayout(cand, minWidthByFaceId)) {
                lo = t;
                best = cand;
            } else {
                hi = t;
            }
        }
        return best;
    }

    _projectLoopPointToScreen(point, y) {
        const camera = this.engine?.camera ?? null;
        const canvas = this.engine?.canvas ?? null;
        if (!camera || !canvas) return null;
        const rect = canvas.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return null;

        this._layoutProjected.set(Number(point?.x) || 0, Number(y) || 0, Number(point?.z) || 0).project(camera);
        return {
            x: rect.left + (this._layoutProjected.x * 0.5 + 0.5) * rect.width,
            y: rect.top + (-this._layoutProjected.y * 0.5 + 0.5) * rect.height,
            zNdc: this._layoutProjected.z
        };
    }

    _distanceSqPointToScreenSegment(point, a, b) {
        const px = Number(point?.x) || 0;
        const py = Number(point?.y) || 0;
        const ax = Number(a?.x) || 0;
        const ay = Number(a?.y) || 0;
        const bx = Number(b?.x) || 0;
        const by = Number(b?.y) || 0;
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (!(lenSq > 1e-12)) {
            const ex = px - ax;
            const ey = py - ay;
            return ex * ex + ey * ey;
        }
        const tRaw = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        const t = Math.max(0, Math.min(1, tRaw));
        const cx = ax + dx * t;
        const cy = ay + dy * t;
        const ex = px - cx;
        const ey = py - cy;
        return ex * ex + ey * ey;
    }

    _computeLayoutHoverFromEvent(event) {
        if (!this._layoutAdjustEnabled || !this._currentConfig) return null;
        if (!this._setLayoutPointerFromEvent(event)) return null;

        const loop = this._getCurrentFootprintLoop();
        if (!loop || loop.length !== 4) return null;

        const planeY = this.scene?.getLayoutEditPlaneY?.() ?? 0.02;
        const hit3 = this.scene?.raycastHorizontalPlane?.(this._layoutPointer, { y: planeY }) ?? null;
        if (!hit3) return null;

        const pointerPx = { x: Number(event?.clientX) || 0, y: Number(event?.clientY) || 0 };
        const vertexThreshSq = LAYOUT_HOVER_VERTEX_PX * LAYOUT_HOVER_VERTEX_PX;
        const edgeThreshSq = LAYOUT_HOVER_EDGE_PX * LAYOUT_HOVER_EDGE_PX;

        let bestVertexIndex = -1;
        let bestVertexDistSq = Infinity;
        const projectedVertices = [];
        for (let i = 0; i < 4; i++) {
            const screen = this._projectLoopPointToScreen(loop[i], planeY);
            projectedVertices.push(screen);
            if (!screen) continue;
            const dx = screen.x - pointerPx.x;
            const dy = screen.y - pointerPx.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestVertexDistSq) {
                bestVertexDistSq = d2;
                bestVertexIndex = i;
            }
        }

        if (bestVertexIndex >= 0 && bestVertexDistSq <= vertexThreshSq) {
            return {
                kind: 'vertex',
                vertexIndex: bestVertexIndex,
                loop,
                planeY,
                hit: { x: hit3.x, z: hit3.z }
            };
        }

        let bestEdgeIndex = -1;
        let bestEdgeDistSq = Infinity;
        for (let i = 0; i < 4; i++) {
            const a = projectedVertices[i];
            const b = projectedVertices[(i + 1) % 4];
            if (!a || !b) continue;
            const d2 = this._distanceSqPointToScreenSegment(pointerPx, a, b);
            if (d2 < bestEdgeDistSq) {
                bestEdgeDistSq = d2;
                bestEdgeIndex = i;
            }
        }

        if (bestEdgeIndex >= 0 && bestEdgeDistSq <= edgeThreshSq) {
            const faceId = faceIdFromEdgeIndex(bestEdgeIndex);
            if (faceId) {
                return {
                    kind: 'face',
                    faceId,
                    edgeIndex: bestEdgeIndex,
                    loop,
                    planeY,
                    hit: { x: hit3.x, z: hit3.z }
                };
            }
        }

        return {
            kind: null,
            loop,
            planeY,
            hit: { x: hit3.x, z: hit3.z }
        };
    }

    _handleLayoutPointerDown(event) {
        if (!this._layoutAdjustEnabled) return;
        if (!event || event.button !== 0) return;

        const hover = this._computeLayoutHoverFromEvent(event);
        if (!hover || (hover.kind !== 'face' && hover.kind !== 'vertex')) {
            this._layoutHover = null;
            this._syncLayoutSceneState();
            return;
        }

        const startLoop = hover.loop;
        const minWidthByFaceId = this._resolveFaceMinWidthByFaceId();
        if (!this._isFootprintLoopValidForLayout(startLoop, minWidthByFaceId)) return;

        this._layoutHover = hover;
        if (hover.kind === 'face') {
            const frame = computeFaceFrameFromLoop(startLoop, hover.faceId);
            if (!frame) return;
            this._layoutDrag = {
                kind: 'face',
                faceId: hover.faceId,
                frame,
                planeY: hover.planeY,
                startHit: { x: hover.hit.x, z: hover.hit.z },
                pointerId: Number.isFinite(event?.pointerId) ? event.pointerId : null,
                startLoop
            };
        } else {
            const idx = hover.vertexIndex | 0;
            const p = startLoop[idx];
            const prev = startLoop[(idx + 3) % 4];
            const next = startLoop[(idx + 1) % 4];
            this._layoutDrag = {
                kind: 'vertex',
                vertexIndex: idx,
                planeY: hover.planeY,
                startHit: { x: hover.hit.x, z: hover.hit.z },
                pointerId: Number.isFinite(event?.pointerId) ? event.pointerId : null,
                vertexStart: { x: p.x, z: p.z },
                prevVertex: { x: prev.x, z: prev.z },
                nextVertex: { x: next.x, z: next.z },
                tangentPrev: normalize2({ x: p.x - prev.x, z: p.z - prev.z }),
                tangentNext: normalize2({ x: next.x - p.x, z: next.z - p.z }),
                startLoop
            };
        }

        this._layoutMinWidthByFaceId = minWidthByFaceId;
        const canvas = this.engine?.canvas ?? null;
        const pointerId = this._layoutDrag?.pointerId;
        if (canvas && Number.isFinite(pointerId) && canvas.setPointerCapture) {
            try { canvas.setPointerCapture(pointerId); } catch {}
        }
        this._syncCameraControlEnabled();
        this._setCanvasCursor();
        this._syncLayoutSceneState();
    }

    _handleLayoutPointerMove(event) {
        if (!this._layoutAdjustEnabled || !event) return;

        const drag = this._layoutDrag;
        if (!drag) {
            const hover = this._computeLayoutHoverFromEvent(event);
            this._layoutHover = hover && hover.kind ? hover : null;
            this._syncLayoutSceneState();
            return;
        }

        if (!this._setLayoutPointerFromEvent(event)) return;
        const hit3 = this.scene?.raycastHorizontalPlane?.(this._layoutPointer, { y: drag.planeY }) ?? null;
        if (!hit3) return;
        const hit = { x: hit3.x, z: hit3.z };

        let targetLoop = null;
        if (drag.kind === 'face') {
            const delta = {
                x: hit.x - drag.startHit.x,
                z: hit.z - drag.startHit.z
            };
            const move = dot2(delta, drag.frame.normal);
            targetLoop = cloneLoop(drag.startLoop);
            const i0 = drag.frame.startIndex | 0;
            const i1 = drag.frame.endIndex | 0;
            targetLoop[i0].x += drag.frame.normal.x * move;
            targetLoop[i0].z += drag.frame.normal.z * move;
            targetLoop[i1].x += drag.frame.normal.x * move;
            targetLoop[i1].z += drag.frame.normal.z * move;
        } else if (drag.kind === 'vertex') {
            const deltaHit = { x: hit.x - drag.startHit.x, z: hit.z - drag.startHit.z };
            let delta = deltaHit;
            if (event.shiftKey) {
                const vStart = drag.vertexStart;
                const prevLineEnd = { x: vStart.x + drag.tangentPrev.x, z: vStart.z + drag.tangentPrev.z };
                const nextLineEnd = { x: vStart.x + drag.tangentNext.x, z: vStart.z + drag.tangentNext.z };
                const dPrev = distanceSqPointToLine2(hit, vStart, prevLineEnd);
                const dNext = distanceSqPointToLine2(hit, vStart, nextLineEnd);
                const tangent = dPrev <= dNext ? drag.tangentPrev : drag.tangentNext;
                const amount = dot2(deltaHit, tangent);
                delta = { x: tangent.x * amount, z: tangent.z * amount };
            }
            let vertexTarget = {
                x: drag.vertexStart.x + delta.x,
                z: drag.vertexStart.z + delta.z
            };
            if (event.ctrlKey) {
                const snapped = snapVertexToRightAngleIfClose({
                    candidate: vertexTarget,
                    prev: drag.prevVertex,
                    next: drag.nextVertex,
                    reference: drag.vertexStart
                });
                if (snapped) vertexTarget = snapped;
            }
            targetLoop = cloneLoop(drag.startLoop);
            const idx = drag.vertexIndex | 0;
            targetLoop[idx].x = vertexTarget.x;
            targetLoop[idx].z = vertexTarget.z;
        }

        if (!targetLoop) return;
        const clamped = this._clampLoopCandidate(drag.startLoop, targetLoop, this._layoutMinWidthByFaceId);
        this._setCurrentFootprintLoop(clamped, { rateLimited: true });
        this._layoutHover = drag.kind === 'face'
            ? { kind: 'face', faceId: drag.faceId, loop: clamped }
            : { kind: 'vertex', vertexIndex: drag.vertexIndex, loop: clamped };
        this._syncLayoutSceneState();
    }

    _finishLayoutDrag(event = null) {
        const drag = this._layoutDrag;
        if (!drag) return;
        const canvas = this.engine?.canvas ?? null;
        const pointerId = drag.pointerId;
        if (canvas && Number.isFinite(pointerId) && canvas.releasePointerCapture) {
            try { canvas.releasePointerCapture(pointerId); } catch {}
        }
        this._layoutDrag = null;
        this._layoutMinWidthByFaceId = null;
        this._syncCameraControlEnabled();

        if (event) {
            const hover = this._computeLayoutHoverFromEvent(event);
            this._layoutHover = hover && hover.kind ? hover : null;
        } else {
            this._layoutHover = null;
        }
        this._setCanvasCursor();
        this._syncLayoutSceneState();
        this._requestRebuild({ preserveCamera: true });
    }

    _handleLayoutPointerUp(event) {
        if (!this._layoutAdjustEnabled || !event || event.button !== 0) return;
        this._finishLayoutDrag(event);
    }

    _handleLayoutPointerCancel() {
        if (!this._layoutAdjustEnabled) return;
        this._finishLayoutDrag(null);
    }

    _handleLayoutPointerLeave() {
        if (!this._layoutAdjustEnabled) return;
        if (!this._layoutDrag) {
            this._layoutHover = null;
            this._syncLayoutSceneState();
        }
    }

    _syncFaceHighlightSuppression() {
        const suppressed = this._hideFaceMarkEnabled && this._pointerInViewport;
        this.scene.setFaceHighlightSuppressed?.(suppressed);
    }

    _exportCurrentConfig() {
        if (!this.scene.getHasBuilding()) return;
        const cfg = this._currentConfig;
        if (!cfg) return;

        const rawLayers = Array.isArray(cfg.layers) ? cfg.layers : null;
        if (!Array.isArray(rawLayers) || !rawLayers.length) return;
        const baseWallMaterial = normalizeMaterialSpec(cfg?.baseWallMaterial ?? null);
        const layers = baseWallMaterial
            ? rawLayers.map((layer) => {
                if (layer?.type !== 'floor') return layer;
                const has = !!normalizeMaterialSpec(layer?.material ?? null);
                return has ? layer : { ...layer, material: baseWallMaterial };
            })
            : rawLayers;

        const defaultName = this.ui.getBuildingName() || cfg.name || cfg.id || 'Building config';
        const name = sanitizeBuildingConfigName(defaultName, { fallback: cfg.name || cfg.id || 'Building config' });

        const suggestedId = sanitizeBuildingConfigId(cfg.id || name);
        const idRaw = window.prompt('Export building config id (used as configId):', suggestedId);
        if (idRaw === null) return;
        const exportId = sanitizeBuildingConfigId(idRaw, { fallback: suggestedId });

        const wallInset = Number.isFinite(cfg.wallInset) ? cfg.wallInset : 0.0;
        const materialVariationSeed = Number.isFinite(cfg.materialVariationSeed) ? cfg.materialVariationSeed : null;
        const footprintLoops = cfg?.footprintLoops ?? null;
        const windowVisuals = cfg?.windowVisuals ?? null;
        const exported = createCityBuildingConfigFromFabrication({
            id: exportId,
            name,
            layers,
            footprintLoops,
            wallInset,
            materialVariationSeed,
            windowVisuals,
            facades: cfg?.facades ?? null,
            windowDefinitions: cfg?.windowDefinitions ?? null
        });

        const fileBaseName = buildingConfigIdToFileBaseName(exported.id);
        const source = serializeCityBuildingConfigToEsModule(exported, { fileBaseName });

        const blob = new Blob([source], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileBaseName}.js`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 250);
    }

    _handleKeyDown(e) {
        if (!e) return;

        if (!isTextEditingElement(e.target) && !isTextEditingElement(document.activeElement)) {
            if (e.key === 'l' || e.key === 'L') {
                e.preventDefault();
                this._openLoadBrowser();
                return;
            }
        }

        this._handleCameraKey(e, true);
    }

    _handleKeyUp(e) {
        this._handleCameraKey(e, false);
    }

    _handleCameraKey(e, isDown) {
        const code = e?.code;
        if (!code || !(code in this._keys)) return;
        if (isDown) {
            if (isTextEditingElement(e.target) || isTextEditingElement(document.activeElement)) return;
            e.preventDefault();
            this._keys[code] = true;
            return;
        }

        this._keys[code] = false;
    }

    _updateCameraFromKeys(dt) {
        const camera = this.scene?.camera;
        const controls = this.scene?.controls;
        if (!controls?.panWorld || !camera || !controls.enabled) return;
        if (isTextEditingElement(document.activeElement)) return;

        const up = this._keys.ArrowUp ? 1 : 0;
        const down = this._keys.ArrowDown ? 1 : 0;
        const left = this._keys.ArrowLeft ? 1 : 0;
        const right = this._keys.ArrowRight ? 1 : 0;

        const forwardSign = up - down;
        const rightSign = right - left;
        if (!forwardSign && !rightSign) return;

        camera.getWorldDirection(this._moveForward);
        this._moveForward.y = 0;
        const len = this._moveForward.length();
        if (len < 1e-6) return;
        this._moveForward.multiplyScalar(1 / len);

        this._moveRight.crossVectors(this._moveForward, UP);
        const rLen = this._moveRight.length();
        if (rLen < 1e-6) return;
        this._moveRight.multiplyScalar(1 / rLen);

        this._moveDir.set(0, 0, 0);
        this._moveDir.addScaledVector(this._moveForward, forwardSign);
        this._moveDir.addScaledVector(this._moveRight, rightSign);
        const dLen = this._moveDir.length();
        if (dLen < 1e-6) return;
        this._moveDir.multiplyScalar(1 / dLen);

        const dist = camera.position.distanceTo(controls.target);
        const baseSpeed = Math.max(10, dist * 0.6);
        const isFast = this._keys.ShiftLeft || this._keys.ShiftRight;
        const speed = baseSpeed * (isFast ? 2.5 : 1.0);
        const delta = speed * Math.max(0.001, Number(dt) || 0);

        controls.panWorld(this._moveDir.x * delta, 0, this._moveDir.z * delta);
    }

    _clearKeys() {
        for (const k of Object.keys(this._keys)) this._keys[k] = false;
    }
}

export const __testOnly = Object.freeze({
    snapVertexToRightAngleIfClose
});
