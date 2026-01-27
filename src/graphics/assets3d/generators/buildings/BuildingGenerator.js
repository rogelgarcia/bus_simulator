// src/graphics/assets3d/generators/buildings/BuildingGenerator.js
// Generates building meshes from city building footprints
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { BUILDING_STYLE, isBuildingStyle } from '../../../../app/buildings/BuildingStyle.js';
import { WINDOW_STYLE, isWindowStyle } from '../../../../app/buildings/WindowStyle.js';
import { resolveBeltCourseColorHex } from '../../../../app/buildings/BeltCourseColor.js';
import { resolveRoofColorHex } from '../../../../app/buildings/RoofColor.js';
import { WINDOW_TYPE, getWindowGlassMaskTexture, getWindowTexture, getWindowTypeOptions } from './WindowTextureGenerator.js';
import { getLegacyWindowStyleTexture, windowTypeIdFromLegacyWindowStyle } from './WindowTypeCompatibility.js';
import {
    getBuildingStyleOptions as getBuildingStyleOptionsFromCatalog,
    resolveBuildingStyleLabel as resolveBuildingStyleLabelFromCatalog,
    resolveBuildingStyleWallMaterialUrls as resolveBuildingStyleWallMaterialUrlsFromCatalog,
    resolveBuildingStyleWallTextureUrl as resolveBuildingStyleWallTextureUrlFromCatalog
} from '../../../content3d/catalogs/BuildingStyleCatalog.js';
import { computePbrMaterialTextureRepeat, tryGetPbrMaterialIdFromUrl } from '../../../content3d/catalogs/PbrMaterialCatalog.js';
import { applyMaterialVariationToMeshStandardMaterial, computeMaterialVariationSeedFromTiles, MATERIAL_VARIATION_ROOT } from '../../materials/MaterialVariationSystem.js';

const EPS = 1e-6;
const QUANT = 1000;

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function disableIblOnMaterial(mat) {
    if (!mat || !('envMapIntensity' in mat)) return;
    mat.userData = mat.userData ?? {};
    mat.userData.iblNoAutoEnvMapIntensity = true;
    mat.envMapIntensity = 0;
    mat.needsUpdate = true;
}

function q(value) {
    return Math.round(value * QUANT);
}

function uq(value) {
    return value / QUANT;
}

function hashUint32(x) {
    let v = (Number.isFinite(x) ? x : 0) >>> 0;
    v ^= v >>> 16;
    v = Math.imul(v, 0x7feb352d);
    v ^= v >>> 15;
    v = Math.imul(v, 0x846ca68b);
    v ^= v >>> 16;
    return v >>> 0;
}

function signedArea(points) {
    let sum = 0;
    const n = points.length;
    if (n < 3) return 0;
    for (let i = 0; i < n; i++) {
        const a = points[i];
        const b = points[(i + 1) % n];
        sum += a.x * b.z - b.x * a.z;
    }
    return sum * 0.5;
}

function simplifyLoopXZ(loop) {
    const points = Array.isArray(loop) ? loop : [];
    if (points.length < 4) return points;

    const same = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;

    let cleaned = [];
    for (const p of points) {
        if (!p) continue;
        const last = cleaned[cleaned.length - 1] ?? null;
        if (last && same(last, p)) continue;
        cleaned.push(p);
    }

    if (cleaned.length > 1 && same(cleaned[0], cleaned[cleaned.length - 1])) cleaned = cleaned.slice(0, -1);

    let out = cleaned;
    for (let pass = 0; pass < 8; pass++) {
        if (out.length < 4) break;
        let changed = false;
        const next = [];
        const n = out.length;

        for (let i = 0; i < n; i++) {
            const prev = out[(i - 1 + n) % n];
            const cur = out[i];
            const nextPt = out[(i + 1) % n];
            if (!prev || !cur || !nextPt) continue;

            if (same(prev, cur) || same(cur, nextPt)) {
                changed = true;
                continue;
            }

            const collinearX = Math.abs(prev.x - cur.x) < 1e-6 && Math.abs(cur.x - nextPt.x) < 1e-6;
            const collinearZ = Math.abs(prev.z - cur.z) < 1e-6 && Math.abs(cur.z - nextPt.z) < 1e-6;
            if (collinearX || collinearZ) {
                changed = true;
                continue;
            }

            next.push(cur);
        }

        out = next;
        if (!changed) break;
    }

    return out.length >= 3 ? out : cleaned;
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function makeDeterministicColor(seed) {
    const s = Math.sin(seed * 999.123) * 43758.5453;
    const r = s - Math.floor(s);
    const color = new THREE.Color();
    color.setHSL(r, 0.55, 0.58);
    return color;
}

function tileKey(x, y) {
    return `${x},${y}`;
}

function makeCanvas(size) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    return { c, ctx };
}

function canvasToTexture(canvas, { srgb = true } = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    applyTextureColorSpace(tex, { srgb });
    tex.needsUpdate = true;
    return tex;
}

export function getBuildingWindowTexture() {
    return getBuildingWindowTextureForStyle(WINDOW_STYLE.DEFAULT);
}

function resolveWindowStyleLabel(styleId) {
    const id = isWindowStyle(styleId) ? styleId : WINDOW_STYLE.DEFAULT;
    if (id === WINDOW_STYLE.DEFAULT) return 'Default';
    if (id === WINDOW_STYLE.DARK) return 'Dark';
    if (id === WINDOW_STYLE.BLUE) return 'Blue';
    if (id === WINDOW_STYLE.LIGHT_BLUE) return 'Light Blue';
    if (id === WINDOW_STYLE.GREEN) return 'Green';
    if (id === WINDOW_STYLE.WARM) return 'Warm';
    if (id === WINDOW_STYLE.GRID) return 'Grid';
    return 'Default';
}

function buildWindowStyleCanvas(styleId, { size = 256 } = {}) {
    const id = isWindowStyle(styleId) ? styleId : WINDOW_STYLE.DEFAULT;
    const { c, ctx } = makeCanvas(size);
    const w = size;
    const h = size;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (id === WINDOW_STYLE.WARM) {
        grad.addColorStop(0, '#4a3a2f');
        grad.addColorStop(0.5, '#16283a');
        grad.addColorStop(1, '#061a2c');
    } else if (id === WINDOW_STYLE.LIGHT_BLUE) {
        grad.addColorStop(0, '#56c2ff');
        grad.addColorStop(1, '#0b2e52');
    } else if (id === WINDOW_STYLE.GREEN) {
        grad.addColorStop(0, '#2fa88a');
        grad.addColorStop(1, '#06261f');
    } else if (id === WINDOW_STYLE.BLUE) {
        grad.addColorStop(0, '#1d5c8d');
        grad.addColorStop(1, '#051526');
    } else if (id === WINDOW_STYLE.DARK) {
        grad.addColorStop(0, '#0a101a');
        grad.addColorStop(1, '#04070c');
    } else {
        grad.addColorStop(0, '#10395a');
        grad.addColorStop(1, '#061a2c');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const frame = Math.max(10, Math.round(size * 0.06));
    ctx.strokeStyle = 'rgba(210, 230, 255, 0.75)';
    ctx.lineWidth = frame;
    ctx.strokeRect(frame * 0.5, frame * 0.5, w - frame, h - frame);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(frame + 6, frame + 6, w - (frame + 6) * 2, h - (frame + 6) * 2);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, frame + 8);
    ctx.lineTo(w * 0.5, h - frame - 8);
    ctx.moveTo(frame + 8, h * 0.5);
    ctx.lineTo(w - frame - 8, h * 0.5);
    ctx.stroke();

    if (id === WINDOW_STYLE.WARM) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = 'rgba(255, 204, 120, 0.35)';
        ctx.fillRect(frame + 10, frame + 10, w - (frame + 10) * 2, h - (frame + 10) * 2);
        ctx.globalAlpha = 1.0;
    }

    if (id === WINDOW_STYLE.GRID) {
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = 'rgba(240, 245, 255, 0.7)';
        ctx.lineWidth = 1;
        const step = Math.max(12, Math.round(size / 12));
        for (let i = step; i < size; i += step) {
            ctx.beginPath();
            ctx.moveTo(i + 0.5, 0);
            ctx.lineTo(i + 0.5, size);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i + 0.5);
            ctx.lineTo(size, i + 0.5);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    }

    return c;
}

export function getBuildingWindowTextureForStyle(styleId) {
    return getLegacyWindowStyleTexture(styleId);
}

export function getWindowStyleOptions() {
    const typeOptions = getWindowTypeOptions();
    const previewByTypeId = new Map(typeOptions.map((opt) => [opt.id, opt.previewUrl]));

    const ids = [
        WINDOW_STYLE.DEFAULT,
        WINDOW_STYLE.DARK,
        WINDOW_STYLE.BLUE,
        WINDOW_STYLE.LIGHT_BLUE,
        WINDOW_STYLE.GREEN,
        WINDOW_STYLE.WARM,
        WINDOW_STYLE.GRID
    ];
    return ids.map((id) => ({
        id,
        label: resolveWindowStyleLabel(id),
        previewUrl: previewByTypeId.get(windowTypeIdFromLegacyWindowStyle(id)) ?? null
    }));
}

export function computeEvenWindowLayout({
    length,
    windowWidth,
    desiredGap,
    cornerEps = 0.05
} = {}) {
    const L = Number(length);
    const w = clamp(windowWidth, 0.2, 50);
    const g = clamp(desiredGap, 0, 50);
    if (!Number.isFinite(L) || !(L > 0) || !(w > 0)) return { count: 0, gap: 0, starts: [] };

    let count = Math.floor((L + g) / (w + g));
    if (!Number.isFinite(count) || count < 0) count = 0;
    if (count === 0) return { count: 0, gap: 0, starts: [] };

    const eps = Math.max(0.001, Number(cornerEps) || 0);

    let gap = 0;
    while (count > 0) {
        gap = (L - count * w) / (count + 1);
        if (gap > eps) break;
        count -= 1;
    }

    if (count <= 0) return { count: 0, gap: 0, starts: [] };
    gap = (L - count * w) / (count + 1);

    const starts = [];
    for (let i = 0; i < count; i++) starts.push(gap + i * (w + gap));
    return { count, gap, starts };
}

function cross2(a, b) {
    return a.x * b.z - a.z * b.x;
}

function dot2(a, b) {
    return a.x * b.x + a.z * b.z;
}

function normalize2(v) {
    const len = Math.hypot(v.x, v.z);
    if (!(len > EPS)) return { x: 0, z: 0, len: 0 };
    return { x: v.x / len, z: v.z / len, len };
}

function linesIntersection2(a, r, b, s) {
    const rxs = cross2(r, s);
    if (Math.abs(rxs) < 1e-9) return null;
    const qp = { x: b.x - a.x, z: b.z - a.z };
    const t = cross2(qp, s) / rxs;
    return { x: a.x + t * r.x, z: a.z + t * r.z };
}

export function offsetOrthogonalLoopXZ(loop, offset) {
    const points = Array.isArray(loop) ? loop : [];
    const n = points.length;
    const signed = Number(offset) || 0;
    const d = clamp(Math.abs(signed), 0, 50);
    if (!(d > EPS) || n < 3) return loop;

    const winding = signedArea(points);
    const isCcw = winding >= 0;
    const outward = signed < 0;
    const mult = outward ? -1 : 1;
    const insetPoints = new Array(n);

    for (let i = 0; i < n; i++) {
        const prev = points[(i - 1 + n) % n];
        const cur = points[i];
        const next = points[(i + 1) % n];
        if (!prev || !cur || !next) {
            insetPoints[i] = cur;
            continue;
        }

        const e0 = normalize2({ x: cur.x - prev.x, z: cur.z - prev.z });
        const e1 = normalize2({ x: next.x - cur.x, z: next.z - cur.z });
        if (!(e0.len > EPS) || !(e1.len > EPS)) {
            insetPoints[i] = cur;
            continue;
        }

        const left0 = { x: -e0.z, z: e0.x };
        const left1 = { x: -e1.z, z: e1.x };
        const n0 = isCcw ? left0 : { x: -left0.x, z: -left0.z };
        const n1 = isCcw ? left1 : { x: -left1.x, z: -left1.z };

        const nn0 = mult === 1 ? n0 : { x: -n0.x, z: -n0.z };
        const nn1 = mult === 1 ? n1 : { x: -n1.x, z: -n1.z };

        const p0 = { x: cur.x + nn0.x * d, z: cur.z + nn0.z * d };
        const p1 = { x: cur.x + nn1.x * d, z: cur.z + nn1.z * d };
        const hit = linesIntersection2(p0, e0, p1, e1);
        if (hit) {
            insetPoints[i] = { x: hit.x, y: cur.y, z: hit.z };
            continue;
        }

        const collinear = Math.abs(cross2(e0, e1)) < 1e-6 && dot2(e0, e1) > 0.999;
        insetPoints[i] = collinear ? { x: p0.x, y: cur.y, z: p0.z } : cur;
    }

    return insetPoints;
}

function buildExteriorRunsFromLoop(loop) {
    const pts = Array.isArray(loop) ? loop : [];
    const n = pts.length;
    if (n < 2) return [];

    const runs = [];
    const collinear = (a, b) => Math.abs(cross2(a, b)) < 1e-6 && dot2(a, b) > 0.999;

    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (!a || !b) continue;
        const v = normalize2({ x: b.x - a.x, z: b.z - a.z });
        const L = v.len;
        if (!(L > EPS)) continue;

        const last = runs[runs.length - 1] ?? null;
        if (last && collinear(last.dir, v)) {
            last.b = b;
            last.length += L;
            continue;
        }

        runs.push({
            a,
            b,
            dir: { x: v.x, z: v.z },
            length: L
        });
    }

    if (runs.length > 1) {
        const first = runs[0];
        const last = runs[runs.length - 1];
        if (first && last && collinear(first.dir, last.dir)) {
            first.a = last.a;
            first.length += last.length;
            runs.pop();
        }
    }

    return runs;
}

function computeWindowSegmentsWithSpacers({
    length,
    windowWidth,
    desiredGap,
    cornerEps,
    spacerEnabled,
    spacerEvery,
    spacerWidth
} = {}) {
    const L = Number(length);
    const w = clamp(windowWidth, 0.2, 50);
    const g = clamp(desiredGap, 0, 50);
    const eps = clamp(cornerEps, 0.001, 2.0);
    const enabled = !!spacerEnabled && clampInt(spacerEvery, 0, 9999) > 0 && (Number(spacerWidth) || 0) > EPS;
    const band = enabled ? clamp(spacerWidth, 0.01, 10.0) : 0;
    const N = enabled ? clampInt(spacerEvery, 1, 9999) : 0;

    if (!enabled) {
        return {
            segments: [{
                offset: 0,
                layout: computeEvenWindowLayout({ length: L, windowWidth: w, desiredGap: g, cornerEps: eps })
            }],
            spacerCenters: []
        };
    }

    let layout = computeEvenWindowLayout({ length: L, windowWidth: w, desiredGap: g, cornerEps: eps });
    let count = clampInt(layout.count, 0, 9999);
    if (count <= N) {
        return { segments: [{ offset: 0, layout }], spacerCenters: [] };
    }

    let spacerCount = 0;
    let effectiveLength = L;

    for (let i = 0; i < 16; i++) {
        spacerCount = Math.floor(Math.max(0, count - 1) / N);
        effectiveLength = L - spacerCount * band;
        if (!(effectiveLength > w + eps * 2)) {
            count = 0;
            layout = { count: 0, gap: 0, starts: [] };
            break;
        }

        const nextLayout = computeEvenWindowLayout({ length: effectiveLength, windowWidth: w, desiredGap: g, cornerEps: eps });
        const nextCount = clampInt(nextLayout.count, 0, 9999);
        layout = nextLayout;
        if (nextCount === count) break;
        count = nextCount;
    }

    spacerCount = count > N ? Math.floor(Math.max(0, count - 1) / N) : 0;

    const segments = [];
    for (let group = 0; group * N < count; group++) {
        const startIndex = group * N;
        const endIndex = Math.min(count, (group + 1) * N);
        segments.push({
            offset: group * band,
            layout: { starts: layout.starts.slice(startIndex, endIndex) }
        });
    }

    const spacerCenters = [];
    for (let k = 1; k <= spacerCount; k++) {
        const leftIndex = k * N - 1;
        const rightIndex = k * N;
        if (leftIndex < 0 || rightIndex >= count) break;
        const leftEndEff = layout.starts[leftIndex] + w;
        const rightStartEff = layout.starts[rightIndex];
        const leftEnd = leftEndEff + (k - 1) * band;
        const rightStart = rightStartEff + k * band;
        spacerCenters.push((leftEnd + rightStart) * 0.5);
    }

    return { segments, spacerCenters };
}

function getRendererResolution(renderer, out = new THREE.Vector2()) {
    if (!renderer?.getSize) return null;
    renderer.getSize(out);
    return out;
}

function createLineMaterial({ renderer, color, linewidth, opacity, renderOrder }) {
    const mat = new LineMaterial({
        color,
        linewidth,
        worldUnits: false,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false
    });

    const res = getRendererResolution(renderer);
    if (res) mat.resolution.set(res.x, res.y);

    mat.userData = mat.userData ?? {};
    if (Number.isFinite(renderOrder)) mat.userData.renderOrder = renderOrder;
    return mat;
}

function buildingFootprintMargins({ tileSize, occupyRatio, generatorConfig }) {
    const baseMargin = tileSize * (1 - occupyRatio) * 0.5;

    const roadCfg = generatorConfig?.road ?? {};
    const sidewalkWidth = Number.isFinite(roadCfg?.sidewalk?.extraWidth) ? roadCfg.sidewalk.extraWidth : 0;
    const curbT = Number.isFinite(roadCfg?.curb?.thickness) ? roadCfg.curb.thickness : 0;
    const roadMargin = baseMargin + Math.max(0, sidewalkWidth + curbT * 0.5);

    return { baseMargin, roadMargin };
}

function computeBuildingBaseAndSidewalk({ generatorConfig, floorHeight }) {
    const roadCfg = generatorConfig?.road ?? {};
    const baseRoadY = Number.isFinite(roadCfg.surfaceY) ? roadCfg.surfaceY : 0;
    const curbHeight = Number.isFinite(roadCfg?.curb?.height) ? roadCfg.curb.height : 0;
    const curbExtra = Number.isFinite(roadCfg?.curb?.extraHeight) ? roadCfg.curb.extraHeight : 0;
    const sidewalkLift = Number.isFinite(roadCfg?.sidewalk?.lift) ? roadCfg.sidewalk.lift : 0;
    const sidewalkWidth = Number.isFinite(roadCfg?.sidewalk?.extraWidth) ? roadCfg.sidewalk.extraWidth : 0;
    const hasSidewalk = sidewalkWidth > EPS;

    const groundY = generatorConfig?.ground?.surfaceY ?? baseRoadY;
    const sidewalkSurfaceY = hasSidewalk ? (baseRoadY + curbHeight + curbExtra + sidewalkLift) : null;
    const baseSurfaceY = (hasSidewalk && Number.isFinite(sidewalkSurfaceY)) ? sidewalkSurfaceY : groundY;
    const baseY = (Number(baseSurfaceY) || 0) + 0.01;

    const extraFirstFloor = (hasSidewalk && Number.isFinite(sidewalkSurfaceY) && Number.isFinite(groundY))
        ? Math.max(0, sidewalkSurfaceY - groundY)
        : 0;

    const fh = clamp(floorHeight, 1.0, 12.0);
    const extra = clamp(extraFirstFloor, 0, Math.max(0, fh * 2));

    const planBase = (hasSidewalk && Number.isFinite(sidewalkSurfaceY)) ? sidewalkSurfaceY : (Number.isFinite(baseRoadY) ? baseRoadY : (Number.isFinite(groundY) ? groundY : 0));
    const planY = planBase + 0.07;

    return { baseY, extraFirstFloor: extra, planY };
}

function normalizeTileList(tiles) {
    const out = [];
    if (!Array.isArray(tiles)) return out;
    for (const tile of tiles) {
        if (Array.isArray(tile) && tile.length >= 2) {
            out.push({ x: tile[0] | 0, y: tile[1] | 0 });
            continue;
        }
        if (tile && Number.isFinite(tile.x) && Number.isFinite(tile.y)) {
            out.push({ x: tile.x | 0, y: tile.y | 0 });
        }
    }
    return out;
}

export class BuildingWallTextureCache {
    constructor({ renderer = null, textureLoader = null } = {}) {
        this._renderer = renderer ?? null;
        this._loader = textureLoader ?? new THREE.TextureLoader();
        this._cache = new Map();
        this._warned = new Set();
    }

    dispose() {
        for (const entry of this._cache.values()) {
            entry?.texture?.dispose?.();
        }
        this._cache.clear();
        this._warned.clear();
    }

    _warnOnce(url, err) {
        const safeUrl = typeof url === 'string' && url ? url : null;
        if (!safeUrl) return;
        if (this._warned.has(safeUrl)) return;
        this._warned.add(safeUrl);
        const detail = err?.message ?? (typeof err === 'string' ? err : '');
        const suffix = ' (Fix: ensure asset exists; if using Git LFS run git lfs pull.)';
        const msg = detail
            ? `[BuildingWallTextureCache] Failed to load texture: ${safeUrl}. ${detail}${suffix}`
            : `[BuildingWallTextureCache] Failed to load texture: ${safeUrl}.${suffix}`;
        console.warn(msg);
    }

    _configureTexture(tex, { srgb = true, url = null } = {}) {
        if (!tex) return;
        tex.userData = tex.userData ?? {};
        tex.userData.buildingShared = true;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;

        const materialId = tryGetPbrMaterialIdFromUrl(url);
        if (materialId) {
            const rep = computePbrMaterialTextureRepeat(materialId, { uvSpace: 'meters' });
            const rx = Number(rep?.x);
            const ry = Number(rep?.y);
            if (Number.isFinite(rx) && Number.isFinite(ry)) {
                tex.repeat.set(rx, ry);
                tex.userData.pbrMaterialId = materialId;
                tex.userData.pbrRepeat = { x: rx, y: ry };
            }
        }

        const renderer = this._renderer;
        if (renderer?.capabilities?.getMaxAnisotropy) {
            tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
        } else {
            tex.anisotropy = 16;
        }

        applyTextureColorSpace(tex, { srgb });
        tex.needsUpdate = true;
    }

    _makeKey(url, { srgb = true } = {}) {
        return `${url}|cs:${srgb ? 'srgb' : 'data'}`;
    }

    trackMaterial(url, material, { slot = 'map', srgb = true } = {}) {
        const safeUrl = typeof url === 'string' && url ? url : null;
        const safeSlot = typeof slot === 'string' && slot ? slot : 'map';
        if (!safeUrl || !material) return null;
        const key = this._makeKey(safeUrl, { srgb: !!srgb });

        let entry = this._cache.get(key);
        if (!entry) {
            entry = { url: safeUrl, srgb: !!srgb, texture: null, promise: null, materials: new Map() };
            this._cache.set(key, entry);
        }

        const slots = entry.materials.get(material) ?? new Set();
        slots.add(safeSlot);
        entry.materials.set(material, slots);

        if (entry.texture) {
            material[safeSlot] = entry.texture;
            material.needsUpdate = true;
            return entry.texture;
        }

        if (!entry.promise) {
            const promise = new Promise((resolve, reject) => {
                this._loader.load(
                    entry.url,
                    (tex) => resolve(tex),
                    undefined,
                    (err) => reject(err)
                );
            });
            entry.promise = promise;

            promise.then((tex) => {
                const next = this._cache.get(key);
                if (!next || next.promise !== promise) {
                    tex.dispose?.();
                    return;
                }

                this._configureTexture(tex, { srgb: next.srgb, url: next.url });
                next.texture = tex;
                next.promise = null;

                for (const [mat, slotSet] of next.materials) {
                    if (!mat) continue;
                    for (const slot of slotSet) {
                        mat[slot] = tex;
                    }
                    mat.needsUpdate = true;
                }
            }).catch((err) => {
                this._warnOnce(entry.url, err);
                const next = this._cache.get(key);
                if (next?.promise === promise) {
                    next.promise = null;
                    next.materials.clear();
                    this._cache.delete(key);
                }
            });
        }

        return null;
    }
}

export function resolveBuildingStyleWallTextureUrl(styleId) {
    return resolveBuildingStyleWallTextureUrlFromCatalog(styleId);
}

export function resolveBuildingStyleWallMaterialUrls(styleId) {
    return resolveBuildingStyleWallMaterialUrlsFromCatalog(styleId);
}

export function resolveBuildingStyleLabel(styleId) {
    return resolveBuildingStyleLabelFromCatalog(styleId);
}

export function getBuildingStyleOptions() {
    return getBuildingStyleOptionsFromCatalog();
}

export function computeBuildingLoopsFromTiles({
    map,
    tiles,
    generatorConfig = null,
    tileSize = null,
    occupyRatio = 1.0
} = {}) {
    if (!map) return [];
    const size = Number.isFinite(tileSize) ? tileSize : map.tileSize;
    if (!(size > EPS)) return [];

    const tileList = normalizeTileList(tiles);
    if (!tileList.length) return [];

    const tileSet = new Set();
    for (const t of tileList) tileSet.add(tileKey(t.x, t.y));

    const { baseMargin, roadMargin } = buildingFootprintMargins({
        tileSize: size,
        occupyRatio: clamp(occupyRatio, 0.5, 1.0),
        generatorConfig
    });

    const halfTile = size * 0.5;
    const maxMargin = halfTile * 0.85;

    const rects = [];
    const isRoad = (x, y) => {
        if (!map?.inBounds?.(x, y)) return false;
        const idx = map.index(x, y);
        return map.kind?.[idx] === 1;
    };

    const getMargin = (internal, neighborRoad) => {
        if (internal) return 0;
        if (neighborRoad) return roadMargin;
        return baseMargin;
    };

    for (const { x, y } of tileList) {
        if (!map.inBounds(x, y)) continue;
        const idx = map.index(x, y);
        if (map.kind?.[idx] === 1) continue;

        const westKey = tileKey(x - 1, y);
        const eastKey = tileKey(x + 1, y);
        const southKey = tileKey(x, y - 1);
        const northKey = tileKey(x, y + 1);

        const wMargin = clamp(getMargin(tileSet.has(westKey), isRoad(x - 1, y)), 0, maxMargin);
        const eMargin = clamp(getMargin(tileSet.has(eastKey), isRoad(x + 1, y)), 0, maxMargin);
        const sMargin = clamp(getMargin(tileSet.has(southKey), isRoad(x, y - 1)), 0, maxMargin);
        const nMargin = clamp(getMargin(tileSet.has(northKey), isRoad(x, y + 1)), 0, maxMargin);

        const center = map.tileToWorldCenter(x, y);
        if (!center) continue;

        const x0 = center.x - halfTile + wMargin;
        const x1 = center.x + halfTile - eMargin;
        const z0 = center.z - halfTile + sMargin;
        const z1 = center.z + halfTile - nMargin;

        if (x1 - x0 <= 0.01 || z1 - z0 <= 0.01) continue;

        rects.push({ x0: q(x0), x1: q(x1), z0: q(z0), z1: q(z1) });
    }

    if (!rects.length) return [];

    const xs = [];
    const zs = [];
    for (const r of rects) {
        xs.push(r.x0, r.x1);
        zs.push(r.z0, r.z1);
    }

    xs.sort((a, b) => a - b);
    zs.sort((a, b) => a - b);

    const uniq = (arr) => {
        const out = [];
        let last = null;
        for (const v of arr) {
            if (last === null || v !== last) out.push(v);
            last = v;
        }
        return out;
    };

    const ux = uniq(xs);
    const uz = uniq(zs);
    if (ux.length < 2 || uz.length < 2) return [];

    const nx = ux.length - 1;
    const nz = uz.length - 1;
    const filled = new Uint8Array(nx * nz);

    const cellIndex = (ix, iz) => ix + iz * nx;

    for (let iz = 0; iz < nz; iz++) {
        const zc = (uz[iz] + uz[iz + 1]) * 0.5;
        for (let ix = 0; ix < nx; ix++) {
            const xc = (ux[ix] + ux[ix + 1]) * 0.5;
            let inside = false;
            for (const r of rects) {
                if (xc > r.x0 && xc < r.x1 && zc > r.z0 && zc < r.z1) {
                    inside = true;
                    break;
                }
            }
            if (inside) filled[cellIndex(ix, iz)] = 1;
        }
    }

    const segments = [];
    const addSegment = (ax, az, bx, bz) => {
        segments.push({ ax, az, bx, bz });
    };

    for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
            if (!filled[cellIndex(ix, iz)]) continue;

            const x0 = ux[ix];
            const x1 = ux[ix + 1];
            const z0 = uz[iz];
            const z1 = uz[iz + 1];

            const westEmpty = ix === 0 || !filled[cellIndex(ix - 1, iz)];
            const eastEmpty = ix === nx - 1 || !filled[cellIndex(ix + 1, iz)];
            const southEmpty = iz === 0 || !filled[cellIndex(ix, iz - 1)];
            const northEmpty = iz === nz - 1 || !filled[cellIndex(ix, iz + 1)];

            if (westEmpty) addSegment(x0, z1, x0, z0);
            if (eastEmpty) addSegment(x1, z0, x1, z1);
            if (southEmpty) addSegment(x0, z0, x1, z0);
            if (northEmpty) addSegment(x1, z1, x0, z1);
        }
    }

    const nextByKey = new Map();
    const pointByKey = new Map();
    const keyFor = (x, z) => `${x},${z}`;

    for (const s of segments) {
        const aKey = keyFor(s.ax, s.az);
        const bKey = keyFor(s.bx, s.bz);
        nextByKey.set(aKey, bKey);
        pointByKey.set(aKey, { x: uq(s.ax), z: uq(s.az) });
        pointByKey.set(bKey, { x: uq(s.bx), z: uq(s.bz) });
    }

    const visited = new Set();
    const loops = [];

    for (const [startKey] of nextByKey) {
        if (visited.has(startKey)) continue;
        const loop = [];
        let cur = startKey;
        let guard = 0;
        while (cur && !visited.has(cur) && guard++ < 100000) {
            visited.add(cur);
            const p = pointByKey.get(cur);
            if (p) loop.push(p);
            const next = nextByKey.get(cur);
            if (!next) break;
            cur = next;
            if (cur === startKey) break;
        }
        if (loop.length >= 3) loops.push(loop);
    }

    const simplified = loops
        .map((loop) => simplifyLoopXZ(loop))
        .filter((loop) => Array.isArray(loop) && loop.length >= 3);

    return simplified;
}

export function applyWallTextureToGroup({
    solidGroup,
    wallTextureUrl = null,
    wallNormalUrl = null,
    wallOrmUrl = null,
    baseColorHex = 0xffffff,
    textureCache = null
} = {}) {
    if (!solidGroup) return;

    const safeUrl = typeof wallTextureUrl === 'string' && wallTextureUrl ? wallTextureUrl : null;
    const useTexture = !!safeUrl && !!textureCache;
    const safeNormalUrl = typeof wallNormalUrl === 'string' && wallNormalUrl ? wallNormalUrl : null;
    const safeOrmUrl = typeof wallOrmUrl === 'string' && wallOrmUrl ? wallOrmUrl : null;
    const usePbr = !!useTexture && (!!safeNormalUrl || !!safeOrmUrl);
    const color = Number.isFinite(baseColorHex) ? baseColorHex : 0xffffff;

    solidGroup.traverse((obj) => {
        if (!obj?.isMesh) return;
        const mats = obj.material;
        if (!Array.isArray(mats) || mats.length < 2) return;
        const wallMat = mats[1];
        if (!wallMat) return;

        if (!useTexture) {
            wallMat.map = null;
            wallMat.normalMap = null;
            wallMat.roughnessMap = null;
            wallMat.metalnessMap = null;
            wallMat.aoMap = null;
            wallMat.color.setHex(color);
            wallMat.needsUpdate = true;
            return;
        }

        wallMat.color.setHex(0xffffff);
        const tex = textureCache.trackMaterial(safeUrl, wallMat, { slot: 'map', srgb: true });
        if (tex) wallMat.map = tex;

        if (safeNormalUrl) {
            const n = textureCache.trackMaterial(safeNormalUrl, wallMat, { slot: 'normalMap', srgb: false });
            if (n) wallMat.normalMap = n;
        } else if (wallMat.normalMap) {
            wallMat.normalMap = null;
        }

        if (safeOrmUrl) {
            const rough = textureCache.trackMaterial(safeOrmUrl, wallMat, { slot: 'roughnessMap', srgb: false });
            if (rough) wallMat.roughnessMap = rough;
            wallMat.roughness = 1.0;
            wallMat.metalness = 0.0;
        } else {
            wallMat.roughnessMap = null;
            wallMat.metalnessMap = null;
            wallMat.aoMap = null;
        }

        if (usePbr) wallMat.normalScale?.set?.(0.9, 0.9);
        wallMat.needsUpdate = true;
    });
}

export function applyBuildingStyleToGroup({
    solidGroup,
    style = BUILDING_STYLE.DEFAULT,
    baseColorHex = 0xffffff,
    textureCache = null
} = {}) {
    const urls = resolveBuildingStyleWallMaterialUrls(style);
    applyWallTextureToGroup({
        solidGroup,
        wallTextureUrl: urls.baseColorUrl,
        wallNormalUrl: urls.normalUrl,
        wallOrmUrl: urls.ormUrl,
        baseColorHex,
        textureCache
    });
}

export function buildBuildingVisualParts({
    map,
    tiles,
    generatorConfig = null,
    tileSize = null,
    occupyRatio = 1.0,
    floors = 1,
    floorHeight = 3,
    style = BUILDING_STYLE.DEFAULT,
    legacyWallTextureUrl = null,
    textureCache = null,
    renderer = null,
    colors = null,
    overlays = null,
    roof = null,
    walls = null,
    windows = null,
    windowVisuals = null,
    street = null,
    beltCourse = null,
    topBelt = null
} = {}) {
    const footprintLoops = computeBuildingLoopsFromTiles({ map, tiles, generatorConfig, tileSize, occupyRatio });
    if (!footprintLoops.length) return null;

    const tileCount = normalizeTileList(tiles).length;
    const matVarSeed = computeMaterialVariationSeedFromTiles(tiles, { salt: 'building' });
    const floorCount = clampInt(floors, 0, 30);
    const upperFloorHeight = clamp(floorHeight, 1.0, 12.0);
    const { baseY, extraFirstFloor, planY } = computeBuildingBaseAndSidewalk({
        generatorConfig,
        floorHeight: upperFloorHeight
    });

    const beltCfg = beltCourse ?? {};

    const streetCfg = street ?? {};
    const streetEnabled = !!streetCfg.enabled;
    const streetFloors = clampInt(streetCfg.floors ?? streetCfg.count ?? 0, 0, floorCount);
    const streetFloorHeight = streetEnabled
        ? clamp(streetCfg.floorHeight ?? upperFloorHeight, 1.0, 12.0)
        : upperFloorHeight;
    const streetStyle = streetEnabled
        ? (isBuildingStyle(streetCfg.style) ? streetCfg.style : style)
        : style;

    const beltHeight = Number.isFinite(beltCfg.height) ? clamp(beltCfg.height, 0.02, 1.2) : 0.18;
    const beltEnabled = !!beltCfg.enabled && floorCount > 0 && streetFloors < floorCount;
    const beltSpacerHeight = beltEnabled ? beltHeight : 0;

    const floorBases = new Array(floorCount);
    const floorHeights = new Array(floorCount);
    let yCursor = baseY + (beltEnabled && streetFloors === 0 ? beltSpacerHeight : 0);
    for (let i = 0; i < floorCount; i++) {
        floorBases[i] = yCursor;
        const baseH = (streetEnabled && i < streetFloors) ? streetFloorHeight : upperFloorHeight;
        const h = (i === 0) ? (baseH + extraFirstFloor) : baseH;
        floorHeights[i] = h;
        yCursor += h;
        if (beltEnabled && streetFloors > 0 && i === streetFloors - 1) yCursor += beltSpacerHeight;
    }
    const totalHeight = yCursor - baseY;

    let streetHeight = 0;
    if (streetFloors > 0) {
        for (let i = 0; i < streetFloors; i++) streetHeight += floorHeights[i];
    }
    const upperHeight = Math.max(0, totalHeight - streetHeight - beltSpacerHeight);

    const footprintOuterLoops = [];
    const footprintHoleLoops = [];
    for (const loop of footprintLoops) {
        if (signedArea(loop) >= 0) footprintOuterLoops.push(loop);
        else footprintHoleLoops.push(loop);
    }

    const wallCfg = walls ?? {};
    const wallInset = clamp(wallCfg.inset, 0, 4.0);
    const roofOuterLoops = footprintOuterLoops;
    const roofHoleLoops = footprintHoleLoops;
    const wallOuterLoops = wallInset > EPS
        ? footprintOuterLoops.map((loop) => offsetOrthogonalLoopXZ(loop, wallInset))
        : footprintOuterLoops;
    const wallHoleLoops = wallInset > EPS
        ? footprintHoleLoops.map((loop) => offsetOrthogonalLoopXZ(loop, wallInset))
        : footprintHoleLoops;

    const baseColorHex = makeDeterministicColor(tileCount * 97 + floorCount * 31).getHex();
    const roofCfg = roof ?? {};
    const roofColorHex = resolveRoofColorHex(roofCfg.color, baseColorHex);

    const solidMeshes = [];
    const wirePositions = [];

    const appendPositions = (dst, src, { yShift = 0 } = {}) => {
        const shift = Number(yShift) || 0;
        for (let i = 0; i < src.length; i += 3) {
            dst.push(src[i], src[i + 1] + shift, src[i + 2]);
        }
    };

    const roofMatTemplate = new THREE.MeshStandardMaterial({
        color: roofColorHex,
        roughness: 0.85,
        metalness: 0.05
    });
    disableIblOnMaterial(roofMatTemplate);

    const wallMatTemplate = new THREE.MeshStandardMaterial({
        color: baseColorHex,
        roughness: 0.85,
        metalness: 0.05
    });
    disableIblOnMaterial(wallMatTemplate);

    const legacyUrl = (typeof legacyWallTextureUrl === 'string' && legacyWallTextureUrl) ? legacyWallTextureUrl : null;
    const wallUrls = resolveBuildingStyleWallMaterialUrls(style);
    const wallSpec = wallUrls.baseColorUrl
        ? wallUrls
        : { baseColorUrl: legacyUrl, normalUrl: null, ormUrl: null };

    const streetUrls = streetEnabled ? resolveBuildingStyleWallMaterialUrls(streetStyle) : null;
    const streetSpec = (streetEnabled && streetUrls?.baseColorUrl) ? streetUrls : wallSpec;

    const makeWallMaterial = (spec, { seedOffset = 0 } = {}) => {
        const mat = wallMatTemplate.clone();
        const url = spec?.baseColorUrl ?? null;
        const normalUrl = spec?.normalUrl ?? null;
        const ormUrl = spec?.ormUrl ?? null;

        if (url && textureCache) {
            mat.color.setHex(0xffffff);
            const tex = textureCache.trackMaterial(url, mat, { slot: 'map', srgb: true });
            if (tex) mat.map = tex;
        }

        if (normalUrl && textureCache) {
            const tex = textureCache.trackMaterial(normalUrl, mat, { slot: 'normalMap', srgb: false });
            if (tex) mat.normalMap = tex;
            mat.normalScale.set(0.9, 0.9);
        }

        if (ormUrl && textureCache) {
            const rough = textureCache.trackMaterial(ormUrl, mat, { slot: 'roughnessMap', srgb: false });
            if (rough) mat.roughnessMap = rough;
            mat.roughness = 1.0;
            mat.metalness = 0.0;
        }

        if (ormUrl) {
            applyMaterialVariationToMeshStandardMaterial(mat, {
                seed: matVarSeed,
                seedOffset,
                heightMin: baseY,
                heightMax: baseY + totalHeight,
                root: MATERIAL_VARIATION_ROOT.WALL
            });
        }
        disableIblOnMaterial(mat);
        return mat;
    };

    const upperWallMat = makeWallMaterial(wallSpec, { seedOffset: 0 });
    const streetWallMat = streetEnabled ? makeWallMaterial(streetSpec, { seedOffset: 1 }) : null;

    for (const outer of wallOuterLoops) {
        const shapePts = outer.map((p) => new THREE.Vector2(p.x, -p.z));
        shapePts.reverse();
        const shape = new THREE.Shape(shapePts);

        for (const hole of wallHoleLoops) {
            const holePts = hole.map((p) => new THREE.Vector2(p.x, -p.z));
            holePts.reverse();
            shape.holes.push(new THREE.Path(holePts));
        }

        const hasLower = (streetHeight > EPS) && (streetEnabled || beltEnabled);
        if (hasLower) {
            const lowerGeo = new THREE.ExtrudeGeometry(shape, {
                depth: streetHeight,
                bevelEnabled: false,
                steps: 1
            });
            lowerGeo.rotateX(-Math.PI / 2);
            lowerGeo.computeVertexNormals();

            const roofMat = roofMatTemplate.clone();
            const wallMat = streetEnabled ? (streetWallMat ?? upperWallMat) : upperWallMat;
            const mesh = new THREE.Mesh(lowerGeo, [roofMat, wallMat]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.position.y = baseY;
            solidMeshes.push(mesh);

            const edgeGeo = new THREE.EdgesGeometry(lowerGeo, 1);
            appendPositions(wirePositions, edgeGeo.attributes.position.array);
            edgeGeo.dispose();
        }

        const buildUpper = (!hasLower && totalHeight > EPS) || (upperHeight > EPS);
        if (buildUpper) {
            const soloBeltOffset = (!hasLower && beltEnabled && streetFloors === 0) ? beltSpacerHeight : 0;
            const depth = hasLower ? upperHeight : Math.max(0, totalHeight - soloBeltOffset);
            const upperGeo = new THREE.ExtrudeGeometry(shape, {
                depth,
                bevelEnabled: false,
                steps: 1
            });
            upperGeo.rotateX(-Math.PI / 2);
            upperGeo.computeVertexNormals();

            const roofMat = roofMatTemplate.clone();
            const wallMat = streetEnabled && streetFloors >= floorCount ? (streetWallMat ?? upperWallMat) : upperWallMat;
            const mesh = new THREE.Mesh(upperGeo, [roofMat, wallMat]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const upperOffsetY = (streetFloors < floorCount) ? (streetHeight + beltSpacerHeight) : 0;
            mesh.position.y = baseY + (hasLower ? upperOffsetY : soloBeltOffset);
            solidMeshes.push(mesh);

            const edgeGeo = new THREE.EdgesGeometry(upperGeo, 1);
            const wireOffsetY = hasLower ? upperOffsetY : soloBeltOffset;
            appendPositions(wirePositions, edgeGeo.attributes.position.array, { yShift: wireOffsetY });
            edgeGeo.dispose();
        }
    }

    if (wallInset > EPS && roofOuterLoops.length) {
        for (const outer of roofOuterLoops) {
            const shapePts = outer.map((p) => new THREE.Vector2(p.x, -p.z));
            shapePts.reverse();
            const shape = new THREE.Shape(shapePts);

            for (const hole of roofHoleLoops) {
                const holePts = hole.map((p) => new THREE.Vector2(p.x, -p.z));
                holePts.reverse();
                shape.holes.push(new THREE.Path(holePts));
            }

            const roofGeo = new THREE.ShapeGeometry(shape);
            roofGeo.rotateX(-Math.PI / 2);
            roofGeo.computeVertexNormals();

            const mat = roofMatTemplate.clone();
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = -2;
            mat.polygonOffsetUnits = -2;

            const mesh = new THREE.Mesh(roofGeo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.position.y = baseY + totalHeight + 0.002;
            solidMeshes.push(mesh);
        }
    }

    const lineColor = colors?.line ?? 0xff3b30;
    const borderColor = colors?.border ?? 0x64d2ff;

    const enabled = overlays ?? {};
    const showWire = enabled.wire ?? true;
    const showPlan = enabled.floorplan ?? true;
    const showBorder = enabled.border ?? true;
    const showFloors = enabled.floorDivisions ?? true;

    let wire = null;
    if (showWire && wirePositions.length) {
        const wireGeo = new LineSegmentsGeometry();
        wireGeo.setPositions(wirePositions);
        const wireMat = createLineMaterial({
            renderer,
            color: lineColor,
            linewidth: 4,
            opacity: 0.98,
            renderOrder: 120
        });

        wire = new LineSegments2(wireGeo, wireMat);
        wire.position.y = baseY;
        wire.renderOrder = 120;
        wire.frustumCulled = false;
    }

    let plan = null;
    if (showPlan) {
        const planPositions = [];
        for (const loop of footprintLoops) {
            if (!loop || loop.length < 2) continue;
            for (let i = 0; i < loop.length; i++) {
                const a = loop[i];
                const b = loop[(i + 1) % loop.length];
                planPositions.push(a.x, planY, a.z, b.x, planY, b.z);
            }
        }

        if (planPositions.length) {
            const planGeo = new LineSegmentsGeometry();
            planGeo.setPositions(planPositions);
            const planMat = createLineMaterial({
                renderer,
                color: lineColor,
                linewidth: 4,
                opacity: 1.0,
                renderOrder: 140
            });

            plan = new LineSegments2(planGeo, planMat);
            plan.renderOrder = 140;
            plan.frustumCulled = false;
        }
    }

    let border = null;
    if (showBorder) {
        const borderY = planY + 0.02;
        const borderPositions = [];
        for (const loop of footprintLoops) {
            if (!loop || loop.length < 2) continue;
            for (let i = 0; i < loop.length; i++) {
                const a = loop[i];
                const b = loop[(i + 1) % loop.length];
                borderPositions.push(a.x, borderY, a.z, b.x, borderY, b.z);
            }
        }

        if (borderPositions.length) {
            const borderGeo = new LineSegmentsGeometry();
            borderGeo.setPositions(borderPositions);
            const borderMat = createLineMaterial({
                renderer,
                color: borderColor,
                linewidth: 6,
                opacity: 0.98,
                renderOrder: 160
            });

            border = new LineSegments2(borderGeo, borderMat);
            border.renderOrder = 160;
            border.frustumCulled = false;
        }
    }

    let floorDivisions = null;
    if (showFloors) {
        const divisions = Math.max(0, floorCount - 1);
        if (divisions) {
            const floorPositions = [];
            for (let i = 1; i < floorCount; i++) {
                const y = floorBases[i];
                for (const loop of footprintLoops) {
                    if (!loop || loop.length < 2) continue;
                    for (let k = 0; k < loop.length; k++) {
                        const a = loop[k];
                        const b = loop[(k + 1) % loop.length];
                        floorPositions.push(a.x, y, a.z, b.x, y, b.z);
                    }
                }
            }

            if (floorPositions.length) {
                const floorsGeo = new LineSegmentsGeometry();
                floorsGeo.setPositions(floorPositions);
                const floorsMat = createLineMaterial({
                    renderer,
                    color: lineColor,
                    linewidth: 3,
                    opacity: 0.72,
                    renderOrder: 130
                });

                floorDivisions = new LineSegments2(floorsGeo, floorsMat);
                floorDivisions.renderOrder = 130;
                floorDivisions.frustumCulled = false;
            }
        }
    }

    let windowsGroup = null;
    const win = windows ?? {};
    const winEnabled = win.enabled ?? false;
    if (winEnabled && floorCount > 0 && wallOuterLoops.length) {
        const upperWindowWidth = clamp(win.width, 0.3, 12);
        const upperWindowGap = clamp(win.gap, 0, 24);
        const upperWindowTypeId = typeof win.typeId === 'string'
            ? win.typeId
            : (typeof win.type === 'string' ? win.type : null);
        const upperWindowParams = win.params ?? win.parameters ?? null;
        const upperWindowStyle = isWindowStyle(win.style) ? win.style : WINDOW_STYLE.DEFAULT;
        const upperDesiredWindowHeight = clamp(win.height, 0.3, Math.max(0.31, Math.max(streetFloorHeight, upperFloorHeight) * 0.95));
        const upperDesiredWindowY = clamp(win.y, 0, 12);

        const cornerEps = clamp(win.cornerEps, 0.01, 2.0);
        const offset = clamp(win.offset, 0.0, 0.2);

        const streetWin = streetCfg?.windows ?? null;
        const streetWindowWidth = Number.isFinite(streetWin?.width) ? clamp(streetWin.width, 0.3, 12) : upperWindowWidth;
        const streetWindowGap = Number.isFinite(streetWin?.gap) ? clamp(streetWin.gap, 0, 24) : upperWindowGap;
        const streetWindowTypeId = typeof streetWin?.typeId === 'string'
            ? streetWin.typeId
            : (typeof streetWin?.type === 'string' ? streetWin.type : upperWindowTypeId);
        const streetWindowParams = streetWin?.params ?? streetWin?.parameters ?? upperWindowParams;
        const streetWindowStyle = isWindowStyle(streetWin?.style) ? streetWin.style : upperWindowStyle;
        const streetDesiredWindowHeight = Number.isFinite(streetWin?.height)
            ? clamp(streetWin.height, 0.3, Math.max(0.31, Math.max(streetFloorHeight, upperFloorHeight) * 0.95))
            : upperDesiredWindowHeight;
        const streetDesiredWindowY = Number.isFinite(streetWin?.y) ? clamp(streetWin.y, 0, 12) : upperDesiredWindowY;

        const upperSpacer = win.spacer ?? null;
        const upperSpacerEnabled = !!upperSpacer?.enabled;
        const upperSpacerEvery = clampInt(upperSpacer?.every ?? upperSpacer?.everyN ?? upperSpacer?.after ?? 0, 0, 9999);
        const upperSpacerWidth = Number.isFinite(upperSpacer?.width) ? clamp(upperSpacer.width, 0.01, 10.0) : 0.0;
        const upperSpacerExtrude = !!upperSpacer?.extrude;
        const upperSpacerExtrudeDistance = clamp(upperSpacer?.extrudeDistance ?? upperSpacer?.extrudeDepth ?? 0.0, 0.0, 1.0);

        const streetSpacer = streetWin?.spacer ?? null;
        const streetSpacerEnabled = !!streetSpacer?.enabled;
        const streetSpacerEvery = clampInt(streetSpacer?.every ?? streetSpacer?.everyN ?? streetSpacer?.after ?? 0, 0, 9999);
        const streetSpacerWidth = Number.isFinite(streetSpacer?.width) ? clamp(streetSpacer.width, 0.01, 10.0) : 0.0;
        const streetSpacerExtrude = !!streetSpacer?.extrude;
        const streetSpacerExtrudeDistance = clamp(streetSpacer?.extrudeDistance ?? streetSpacer?.extrudeDepth ?? 0.0, 0.0, 1.0);

        const makeWindowMaterial = ({ typeId, params, styleId, windowWidth, windowHeight } = {}) => {
            const wantsAlpha = typeId === WINDOW_TYPE.ARCH_V1;
            const mat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: typeId ? getWindowTexture({ typeId, params, windowWidth, windowHeight }) : getBuildingWindowTextureForStyle(styleId),
                roughness: 0.4,
                metalness: 0.0,
                emissive: new THREE.Color(0x0b1f34),
                emissiveIntensity: 0.35,
                transparent: wantsAlpha,
                alphaTest: wantsAlpha ? 0.01 : 0.0
            });
            disableIblOnMaterial(mat);
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = -1;
            mat.polygonOffsetUnits = -1;
            return mat;
        };
        const upperWindowMat = makeWindowMaterial({
            typeId: upperWindowTypeId,
            params: upperWindowParams,
            styleId: upperWindowStyle,
            windowWidth: upperWindowWidth,
            windowHeight: upperDesiredWindowHeight
        });
        const streetUsesUpperMat = streetWindowTypeId === upperWindowTypeId
            && streetWindowStyle === upperWindowStyle
            && streetWindowParams === upperWindowParams
            && streetWindowWidth === upperWindowWidth
            && streetDesiredWindowHeight === upperDesiredWindowHeight;
        const streetWindowMat = streetUsesUpperMat
            ? upperWindowMat
            : makeWindowMaterial({
                typeId: streetWindowTypeId,
                params: streetWindowParams,
                styleId: streetWindowStyle,
                windowWidth: streetWindowWidth,
                windowHeight: streetDesiredWindowHeight
            });

        windowsGroup = new THREE.Group();
        windowsGroup.name = 'windows';
        windowsGroup.userData = windowsGroup.userData ?? {};
        const windowVisualsObj = windowVisuals && typeof windowVisuals === 'object' ? windowVisuals : null;
        const reflectiveObj = windowVisualsObj?.reflective && typeof windowVisualsObj.reflective === 'object' ? windowVisualsObj.reflective : {};
        const reflectiveEnabled = reflectiveObj.enabled !== undefined ? !!reflectiveObj.enabled : false;
        const glassObj = reflectiveObj.glass && typeof reflectiveObj.glass === 'object' ? reflectiveObj.glass : {};
        const glassColorHex = Number.isFinite(glassObj.colorHex) ? ((Number(glassObj.colorHex) >>> 0) & 0xffffff) : 0xffffff;
        const glassMetalness = Number.isFinite(glassObj.metalness) ? glassObj.metalness : 0.0;
        const glassRoughness = Number.isFinite(glassObj.roughness) ? glassObj.roughness : 0.02;
        const glassTransmission = Number.isFinite(glassObj.transmission) ? glassObj.transmission : 0.0;
        const glassIor = Number.isFinite(glassObj.ior) ? glassObj.ior : 2.2;
        const glassEnvMapIntensity = Number.isFinite(glassObj.envMapIntensity) ? glassObj.envMapIntensity : 4.0;

        windowsGroup.userData.buildingWindowVisuals = Object.freeze({
            reflective: Object.freeze({
                enabled: reflectiveEnabled,
                glass: Object.freeze({
                    colorHex: glassColorHex,
                    metalness: glassMetalness,
                    roughness: glassRoughness,
                    transmission: glassTransmission,
                    ior: glassIor,
                    envMapIntensity: glassEnvMapIntensity
                })
            })
        });

        const glassLift = 0.02;
        const makeGlassMaterial = (alphaMap) => {
            const wantsTransmission = glassTransmission > 0.01;
            const mat = new THREE.MeshPhysicalMaterial({
                color: glassColorHex,
                metalness: glassMetalness,
                roughness: glassRoughness,
                transmission: wantsTransmission ? glassTransmission : 0.0,
                ior: glassIor,
                envMapIntensity: glassEnvMapIntensity,
                opacity: wantsTransmission ? 1.0 : 0.85
            });
            mat.transparent = true;
            mat.alphaMap = alphaMap ?? null;
            mat.alphaTest = 0.5;
            mat.depthWrite = false;
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = -1;
            mat.polygonOffsetUnits = -1;
            mat.userData = mat.userData ?? {};
            mat.userData.iblEnvMapIntensityScale = glassEnvMapIntensity;
            mat.userData.buildingWindowGlass = true;
            return mat;
        };

        const upperMaskTypeId = upperWindowTypeId ? upperWindowTypeId : windowTypeIdFromLegacyWindowStyle(upperWindowStyle);
        const upperGlassMat = makeGlassMaterial(getWindowGlassMaskTexture({
            typeId: upperMaskTypeId,
            params: upperWindowParams,
            windowWidth: upperWindowWidth,
            windowHeight: upperDesiredWindowHeight
        }));

        const streetGlassMat = streetUsesUpperMat
            ? upperGlassMat
            : makeGlassMaterial(getWindowGlassMaskTexture({
                typeId: streetWindowTypeId ? streetWindowTypeId : windowTypeIdFromLegacyWindowStyle(streetWindowStyle),
                params: streetWindowParams,
                windowWidth: streetWindowWidth,
                windowHeight: streetDesiredWindowHeight
            }));

        const planeGeoCache = new Map();
        const getPlaneGeometry = (width, height) => {
            const w = Number(width) || 1;
            const h = Number(height) || 1;
            const key = `${q(w)}|${q(h)}`;
            let geo = planeGeoCache.get(key);
            if (!geo) {
                geo = new THREE.PlaneGeometry(w, h);
                planeGeoCache.set(key, geo);
            }
            return geo;
        };

        const instancedBuckets = new Map();
        const addWindowInstance = ({ geometry, material, x, y, z, yaw, renderOrder }) => {
            if (!geometry || !material) return;
            const ro = Number.isFinite(renderOrder) ? renderOrder : 0;
            const key = `${geometry.uuid}|${material.uuid}|ro:${ro}`;
            let bucket = instancedBuckets.get(key);
            if (!bucket) {
                bucket = {
                    geometry,
                    material,
                    renderOrder: ro,
                    transforms: []
                };
                instancedBuckets.set(key, bucket);
            }
            bucket.transforms.push(Number(x) || 0, Number(y) || 0, Number(z) || 0, Number(yaw) || 0);
        };

        for (const loop of wallOuterLoops) {
            if (!loop || loop.length < 2) continue;
            const runs = buildExteriorRunsFromLoop(loop);
            for (const run of runs) {
                const a = run?.a ?? null;
                const dir = run?.dir ?? null;
                const L = Number(run?.length) || 0;
                if (!a || !dir || !(L > EPS)) continue;

                const tx = dir.x;
                const tz = dir.z;
                const nx = tz;
                const nz = -tx;
                const yaw = Math.atan2(nx, nz);

                for (let floor = 0; floor < floorCount; floor++) {
                    const isStreetFloor = floor < streetFloors;
                    const windowWidth = isStreetFloor ? streetWindowWidth : upperWindowWidth;
                    const windowGap = isStreetFloor ? streetWindowGap : upperWindowGap;
                    const desiredWindowHeight = isStreetFloor ? streetDesiredWindowHeight : upperDesiredWindowHeight;
                    const desiredWindowY = isStreetFloor ? streetDesiredWindowY : upperDesiredWindowY;
                    const windowMat = isStreetFloor ? streetWindowMat : upperWindowMat;
                    const wallMat = (streetEnabled && isStreetFloor) ? (streetWallMat ?? upperWallMat) : upperWallMat;

                    const spacerEnabled = isStreetFloor ? streetSpacerEnabled : upperSpacerEnabled;
                    const spacerEvery = isStreetFloor ? streetSpacerEvery : upperSpacerEvery;
                    const spacerWidth = isStreetFloor ? streetSpacerWidth : upperSpacerWidth;
                    const spacerExtrude = isStreetFloor ? streetSpacerExtrude : upperSpacerExtrude;
                    const spacerExtrudeDistance = isStreetFloor ? streetSpacerExtrudeDistance : upperSpacerExtrudeDistance;

                    if (!(L > windowWidth + cornerEps * 2)) continue;

                    const { segments, spacerCenters } = computeWindowSegmentsWithSpacers({
                        length: L,
                        windowWidth,
                        desiredGap: windowGap,
                        cornerEps,
                        spacerEnabled,
                        spacerEvery,
                        spacerWidth
                    });

                    const floorBase = floorBases[floor] ?? baseY;
                    const floorH = floorHeights[floor] ?? upperFloorHeight;
                    const windowHeight = Math.min(desiredWindowHeight, Math.max(0.3, floorH * 0.95));
                    const windowYOffset = Math.min(desiredWindowY, Math.max(0, floorH - windowHeight));
                    const y = floorBase + windowYOffset + windowHeight * 0.5;

                    for (const seg of segments) {
                        const segOffset = Number(seg?.offset) || 0;
                        const starts = seg?.layout?.starts ?? [];
                        for (const start of starts) {
                            const leftDist = segOffset + start;
                            const rightDist = leftDist + windowWidth;
                            if (leftDist < cornerEps - 1e-6 || rightDist > L - cornerEps + 1e-6) continue;
                            const centerDist = segOffset + start + windowWidth * 0.5;
                            const cx = a.x + tx * centerDist + nx * offset;
                            const cz = a.z + tz * centerDist + nz * offset;

                            const geo = getPlaneGeometry(windowWidth, windowHeight);
                            addWindowInstance({ geometry: geo, material: windowMat, x: cx, y, z: cz, yaw, renderOrder: 0 });

                            const glassMat = isStreetFloor ? streetGlassMat : upperGlassMat;
                            addWindowInstance({
                                geometry: geo,
                                material: glassMat,
                                x: cx + nx * glassLift,
                                y,
                                z: cz + nz * glassLift,
                                yaw,
                                renderOrder: 1
                            });
                        }
                    }

                    if (spacerExtrude && spacerExtrudeDistance > EPS && spacerCenters.length && spacerWidth > EPS) {
                        const bandY = floorBase + floorH * 0.5;
                        const bandOffset = offset + spacerExtrudeDistance * 0.5;
                        const bandHalfWidth = spacerWidth * 0.5;
                        for (const centerDist of spacerCenters) {
                            if (centerDist - bandHalfWidth < cornerEps - 1e-6 || centerDist + bandHalfWidth > L - cornerEps + 1e-6) continue;
                            const cx = a.x + tx * centerDist + nx * bandOffset;
                            const cz = a.z + tz * centerDist + nz * bandOffset;
                            const geo = new THREE.BoxGeometry(spacerWidth, Math.max(0.1, floorH), spacerExtrudeDistance);
                            const mesh = new THREE.Mesh(geo, wallMat);
                            mesh.position.set(cx, bandY, cz);
                            mesh.rotation.set(0, yaw, 0);
                            mesh.castShadow = true;
                            mesh.receiveShadow = true;
                            windowsGroup.add(mesh);
                        }
                    }
                }
            }
        }

        if (instancedBuckets.size) {
            const dummy = new THREE.Object3D();
            const orderedBuckets = Array.from(instancedBuckets.values()).sort((a, b) => {
                const ro = a.renderOrder - b.renderOrder;
                if (ro) return ro;
                const ma = a.material?.uuid ?? '';
                const mb = b.material?.uuid ?? '';
                if (ma < mb) return -1;
                if (ma > mb) return 1;
                const ga = a.geometry?.uuid ?? '';
                const gb = b.geometry?.uuid ?? '';
                if (ga < gb) return -1;
                if (ga > gb) return 1;
                return 0;
            });
            for (const bucket of orderedBuckets) {
                const transforms = bucket.transforms;
                const count = Math.floor(transforms.length / 4);
                if (!count) continue;

                const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, count);
                mesh.castShadow = false;
                mesh.receiveShadow = false;
                mesh.renderOrder = bucket.renderOrder;
                if (bucket.material?.userData?.buildingWindowGlass === true) {
                    mesh.visible = reflectiveEnabled;
                }
                mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

                for (let i = 0; i < count; i++) {
                    const idx = i * 4;
                    dummy.position.set(transforms[idx], transforms[idx + 1], transforms[idx + 2]);
                    dummy.rotation.set(0, transforms[idx + 3], 0);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                }
                mesh.instanceMatrix.needsUpdate = true;
                mesh.computeBoundingBox();
                mesh.computeBoundingSphere();
                windowsGroup.add(mesh);
            }
        }
    }

    const computeBoundsFromLoops = (loops) => {
        const list = Array.isArray(loops) ? loops : [];
        if (!list.length) return null;

        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const loop of list) {
            for (const p of loop ?? []) {
                if (!p) continue;
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.z < minZ) minZ = p.z;
                if (p.z > maxZ) maxZ = p.z;
            }
        }
        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return null;
        return { minX, maxX, minZ, maxZ };
    };

    let wallBounds = null;
    const ensureWallBounds = () => {
        wallBounds ??= computeBoundsFromLoops(wallOuterLoops);
        return wallBounds;
    };

    let roofBounds = null;
    const ensureRoofBounds = () => {
        roofBounds ??= computeBoundsFromLoops(roofOuterLoops);
        return roofBounds;
    };

    let beltCourseMesh = null;
    if (beltEnabled) {
        const b = ensureWallBounds();
        if (b) {
            const margin = clamp(beltCfg.margin, 0, 4.0);
            const w = Math.max(EPS, b.maxX - b.minX) + margin * 2;
            const d = Math.max(EPS, b.maxZ - b.minZ) + margin * 2;
            const h = beltHeight;
            const cx = (b.minX + b.maxX) * 0.5;
            const cz = (b.minZ + b.maxZ) * 0.5;
            const y = baseY + streetHeight + h * 0.5;

            const colorHex = resolveBeltCourseColorHex(beltCfg.color);
            const mat = new THREE.MeshStandardMaterial({
                color: colorHex,
                roughness: 0.9,
                metalness: 0.0
            });
            disableIblOnMaterial(mat);
            const geo = new THREE.BoxGeometry(w, h, d);
            beltCourseMesh = new THREE.Mesh(geo, mat);
            beltCourseMesh.position.set(cx, y, cz);
            beltCourseMesh.castShadow = true;
            beltCourseMesh.receiveShadow = true;
        }
    }

    let topBeltMesh = null;
    const topCfg = topBelt ?? {};
    const topEnabled = !!topCfg.enabled && floorCount > 0;
    if (topEnabled) {
        const b = ensureRoofBounds();
        if (b) {
            const width = clamp(topCfg.width, 0, 4.0);
            const innerWidth = Number.isFinite(topCfg.innerWidth) ? clamp(topCfg.innerWidth, 0, 4.0) : 0;
            const h = Number.isFinite(topCfg.height) ? clamp(topCfg.height, 0.02, 1.2) : 0.18;

            const cx = (b.minX + b.maxX) * 0.5;
            const cz = (b.minZ + b.maxZ) * 0.5;

            const halfX = Math.max(EPS, (b.maxX - b.minX) * 0.5);
            const halfZ = Math.max(EPS, (b.maxZ - b.minZ) * 0.5);

            const outerHalfX = halfX + width;
            const outerHalfZ = halfZ + width;

            const maxInnerWidth = Math.max(0, Math.min(halfX, halfZ) - EPS);
            const safeInnerWidth = clamp(innerWidth, 0, maxInnerWidth);
            const innerHalfX = Math.max(EPS, halfX - safeInnerWidth);
            const innerHalfZ = Math.max(EPS, halfZ - safeInnerWidth);

            const outerPts = [
                new THREE.Vector2(-outerHalfX, outerHalfZ),
                new THREE.Vector2(outerHalfX, outerHalfZ),
                new THREE.Vector2(outerHalfX, -outerHalfZ),
                new THREE.Vector2(-outerHalfX, -outerHalfZ)
            ];
            outerPts.reverse();
            const shape = new THREE.Shape(outerPts);

            const holePts = [
                new THREE.Vector2(-innerHalfX, innerHalfZ),
                new THREE.Vector2(innerHalfX, innerHalfZ),
                new THREE.Vector2(innerHalfX, -innerHalfZ),
                new THREE.Vector2(-innerHalfX, -innerHalfZ)
            ];
            holePts.reverse();
            shape.holes.push(new THREE.Path(holePts));

            const colorHex = resolveBeltCourseColorHex(topCfg.color);
            const mat = new THREE.MeshStandardMaterial({
                color: colorHex,
                roughness: 0.9,
                metalness: 0.0
            });
            disableIblOnMaterial(mat);

            const geo = new THREE.ExtrudeGeometry(shape, {
                depth: h,
                bevelEnabled: false,
                steps: 1
            });
            geo.rotateX(-Math.PI / 2);
            geo.computeVertexNormals();

            topBeltMesh = new THREE.Mesh(geo, mat);
            topBeltMesh.position.set(cx, baseY + totalHeight, cz);
            topBeltMesh.castShadow = true;
            topBeltMesh.receiveShadow = true;
        }
    }

    return {
        baseColorHex,
        solidMeshes,
        wire,
        plan,
        border,
        floorDivisions,
        windows: windowsGroup,
        beltCourse: beltCourseMesh,
        topBelt: topBeltMesh
    };
}
