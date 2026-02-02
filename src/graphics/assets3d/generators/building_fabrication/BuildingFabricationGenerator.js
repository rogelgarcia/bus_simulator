// src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js
// Generates building fabrication meshes from layer definitions.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { ROOF_COLOR, resolveRoofColorHex } from '../../../../app/buildings/RoofColor.js';
import { resolveBeltCourseColorHex } from '../../../../app/buildings/BeltCourseColor.js';
import { BUILDING_STYLE } from '../../../../app/buildings/BuildingStyle.js';
import {
    WINDOW_TYPE,
    getDefaultWindowParams,
    getWindowGlassMaskTexture,
    getWindowNormalMapTexture,
    getWindowRoughnessMapTexture,
    getWindowTexture,
    isWindowTypeId
} from '../buildings/WindowTextureGenerator.js';
import { computeBuildingLoopsFromTiles, offsetOrthogonalLoopXZ, resolveBuildingStyleWallMaterialUrls } from '../buildings/BuildingGenerator.js';
import { LAYER_TYPE, normalizeBuildingLayers } from './BuildingFabricationTypes.js';
import { applyMaterialVariationToMeshStandardMaterial, computeMaterialVariationSeedFromTiles, MATERIAL_VARIATION_ROOT } from '../../materials/MaterialVariationSystem.js';
import { applyUvTilingToMeshStandardMaterial } from '../../materials/MaterialUvTilingSystem.js';
import { getPbrMaterialTileMeters, isPbrMaterialId, tryGetPbrMaterialIdFromUrl } from '../../materials/PbrMaterialCatalog.js';
import { solveFacadeLayoutFillPattern } from './FacadeLayoutFillSolver.js';
import { solveFacadeBaysLayout } from './FacadeBaysSolver.js';
import { resolveRectFacadeCornerStrategy } from './FacadeCornerResolutionStrategies.js';

const EPS = 1e-6;
const QUANT = 1000;
const WEDGE_ANGLE_STEP_DEG = 15;
const WEDGE_ANGLE_MAX_DEG = 75;
const FACADE_DEPTH_MIN_M = -2.0;
const FACADE_DEPTH_MAX_M = 2.0;

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

function clampFacadeDepthMeters(value) {
    return clamp(value, FACADE_DEPTH_MIN_M, FACADE_DEPTH_MAX_M);
}

function normalizeWedgeAngleDeg(value) {
    const raw = Number(value) || 0;
    if (!(raw > 0)) return 0;
    const clamped = clamp(raw, 0, WEDGE_ANGLE_MAX_DEG);
    return clampInt(clamped / WEDGE_ANGLE_STEP_DEG, 0, Math.round(WEDGE_ANGLE_MAX_DEG / WEDGE_ANGLE_STEP_DEG)) * WEDGE_ANGLE_STEP_DEG;
}

function q(value) {
    return Math.round(Number(value) * QUANT);
}

function qf(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * QUANT) / QUANT;
}

function disableIblOnMaterial(mat) {
    if (!mat || !('envMapIntensity' in mat)) return;
    mat.userData = mat.userData ?? {};
    mat.userData.iblNoAutoEnvMapIntensity = true;
    mat.envMapIntensity = 0;
    mat.needsUpdate = true;
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

function resolvePbrTileMetersFromUrls(urls, styleId) {
    const direct = typeof styleId === 'string' ? styleId : '';
    const pbrId = isPbrMaterialId(direct) ? direct : tryGetPbrMaterialIdFromUrl(urls?.baseColorUrl ?? null);
    if (!pbrId) return 1.0;
    const tileMeters = getPbrMaterialTileMeters(pbrId);
    const t = Number(tileMeters);
    return (Number.isFinite(t) && t > EPS) ? t : 1.0;
}

function computeUvTilingParams({ tiling, urls, styleId } = {}) {
    const cfg = tiling && typeof tiling === 'object' ? tiling : null;
    const uvEnabled = !!cfg?.uvEnabled;
    const offsetU = uvEnabled ? clamp(cfg?.offsetU, -10.0, 10.0) : 0.0;
    const offsetV = uvEnabled ? clamp(cfg?.offsetV, -10.0, 10.0) : 0.0;
    const rotationDegrees = uvEnabled ? clamp(cfg?.rotationDegrees, -180.0, 180.0) : 0.0;

    let scaleU = 1.0;
    let scaleV = 1.0;
    if (cfg?.enabled) {
        const baseTileMeters = resolvePbrTileMetersFromUrls(urls, styleId);
        const desiredTileMetersU = clamp(cfg?.tileMetersU ?? cfg?.tileMeters, 0.1, 100.0);
        const desiredTileMetersV = clamp(cfg?.tileMetersV ?? cfg?.tileMeters, 0.01, 100.0);
        scaleU = baseTileMeters / desiredTileMetersU;
        scaleV = baseTileMeters / desiredTileMetersV;
    }

    const apply = uvEnabled
        || Math.abs(scaleU - 1.0) > 1e-6
        || Math.abs(scaleV - 1.0) > 1e-6;

    return { apply, scaleU, scaleV, offsetU, offsetV, rotationDegrees };
}

function resolveBuildingWindowReflectiveConfig(windowVisuals) {
    const windowVisualsObj = windowVisuals && typeof windowVisuals === 'object' ? windowVisuals : null;
    const reflectiveObj = windowVisualsObj?.reflective && typeof windowVisualsObj.reflective === 'object'
        ? windowVisualsObj.reflective
        : {};
    const enabled = reflectiveObj.enabled !== undefined ? !!reflectiveObj.enabled : false;
    const glassObj = reflectiveObj.glass && typeof reflectiveObj.glass === 'object' ? reflectiveObj.glass : {};

    const colorHex = Number.isFinite(glassObj.colorHex) ? ((Number(glassObj.colorHex) >>> 0) & 0xffffff) : 0xffffff;
    const metalness = Number.isFinite(glassObj.metalness) ? clamp(glassObj.metalness, 0.0, 1.0) : 0.0;
    const roughness = Number.isFinite(glassObj.roughness) ? clamp(glassObj.roughness, 0.0, 1.0) : 0.02;
    const transmission = Number.isFinite(glassObj.transmission) ? clamp(glassObj.transmission, 0.0, 1.0) : 0.0;
    const ior = Number.isFinite(glassObj.ior) ? clamp(glassObj.ior, 1.0, 2.5) : 2.2;
    const envMapIntensity = Number.isFinite(glassObj.envMapIntensity) ? clamp(glassObj.envMapIntensity, 0.0, 5.0) : 4.0;

    const wantsTransmission = transmission > 0.01;
    const opacityDefault = wantsTransmission ? 1.0 : 0.85;
    const opacity = Number.isFinite(reflectiveObj.opacity)
        ? clamp(reflectiveObj.opacity, 0.0, 1.0)
        : opacityDefault;
    const offsetRaw = reflectiveObj.layerOffset ?? reflectiveObj.offset;
    const layerOffset = Number.isFinite(offsetRaw)
        ? clamp(offsetRaw, -0.1, 0.1)
        : 0.02;

    return {
        enabled,
        opacity,
        layerOffset,
        glass: {
            colorHex,
            metalness,
            roughness,
            transmission,
            ior,
            envMapIntensity
        }
    };
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

function splitLoops(loops) {
    const list = Array.isArray(loops) ? loops : [];
    const outer = [];
    const holes = [];
    for (const loop of list) {
        if (!loop || loop.length < 3) continue;
        if (signedArea(loop) >= 0) outer.push(loop);
        else holes.push(loop);
    }
    return { outer, holes };
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

    const planBase = (hasSidewalk && Number.isFinite(sidewalkSurfaceY))
        ? sidewalkSurfaceY
        : (Number.isFinite(baseRoadY) ? baseRoadY : (Number.isFinite(groundY) ? groundY : 0));
    const planY = planBase + 0.07;

    return { baseY, extraFirstFloor: extra, planY };
}

function normalize2(v) {
    const len = Math.hypot(v.x, v.z);
    if (!(len > EPS)) return { x: 0, z: 0, len: 0 };
    return { x: v.x / len, z: v.z / len, len };
}

function cross2(a, b) {
    return a.x * b.z - a.z * b.x;
}

function dot2(a, b) {
    return a.x * b.x + a.z * b.z;
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

function computeEvenWindowLayoutMinGap({
    length,
    windowWidth,
    minGap
} = {}) {
    const L = Number(length);
    const w = clamp(windowWidth, 0.2, 50);
    const g = clamp(minGap, 0, 50);
    if (!Number.isFinite(L) || !(L > 0) || !(w > 0)) return { count: 0, gap: 0, starts: [] };

    let count = Math.floor((L - g) / (w + g));
    if (!Number.isFinite(count) || count < 0) count = 0;
    if (count === 0) return { count: 0, gap: 0, starts: [] };

    const gap = (L - count * w) / (count + 1);
    if (!(gap >= g - 1e-6)) return { count: 0, gap: 0, starts: [] };

    const starts = [];
    for (let i = 0; i < count; i++) starts.push(gap + i * (w + gap));
    return { count, gap, starts };
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
    const desired = clamp(desiredGap, 0, 50);
    const eps = clamp(cornerEps, 0.001, 2.0);
    const minGap = Math.max(desired, eps);
    const enabled = !!spacerEnabled && clampInt(spacerEvery, 0, 9999) > 0 && (Number(spacerWidth) || 0) > EPS;
    const band = enabled ? clamp(spacerWidth, 0.01, 10.0) : 0;
    const N = enabled ? clampInt(spacerEvery, 1, 9999) : 0;

    if (!enabled) {
        return {
            segments: [{
                offset: 0,
                layout: computeEvenWindowLayoutMinGap({ length: L, windowWidth: w, minGap })
            }],
            spacerCenters: []
        };
    }

    let layout = computeEvenWindowLayoutMinGap({ length: L, windowWidth: w, minGap });
    let count = clampInt(layout.count, 0, 9999);
    if (count === 0) return { segments: [{ offset: 0, layout }], spacerCenters: [] };

    let spacerCount = 0;
    let effectiveLength = L;

    for (let i = 0; i < 16; i++) {
        spacerCount = Math.floor(Math.max(0, count - 1) / N);
        effectiveLength = L - spacerCount * band;
        if (!(effectiveLength > w + minGap * 2)) {
            count = 0;
            layout = { count: 0, gap: 0, starts: [] };
            break;
        }

        const nextLayout = computeEvenWindowLayoutMinGap({ length: effectiveLength, windowWidth: w, minGap });
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

function makeDeterministicColor(seed) {
    const s = Math.sin(seed * 999.123) * 43758.5453;
    const r = s - Math.floor(s);
    const color = new THREE.Color();
    color.setHSL(r, 0.55, 0.58);
    return color;
}

function collectGeometryVertexIndicesForMaterialIndex(geometry, materialIndex) {
    const geo = geometry ?? null;
    const groups = Array.isArray(geo?.groups) ? geo.groups : [];
    if (!groups.length) return null;

    const target = Number.isFinite(materialIndex) ? Number(materialIndex) : 0;
    const out = new Set();
    const index = geo.index ?? null;

    for (const group of groups) {
        if (!group) continue;
        const idx = Number(group.materialIndex) || 0;
        if (idx !== target) continue;
        const start = Math.max(0, Number(group.start) || 0);
        const count = Math.max(0, Number(group.count) || 0);
        if (!count) continue;

        if (index?.getX) {
            for (let i = start; i < start + count; i++) out.add(index.getX(i));
            continue;
        }

        for (let i = start; i < start + count; i++) out.add(i);
    }

    return out.size ? Array.from(out) : null;
}

function applyUvYContinuityOffsetToGeometry(geometry, { yOffset = 0.0, materialIndex = 1 } = {}) {
    const geo = geometry ?? null;
    const uv = geo?.getAttribute?.('uv') ?? null;
    const pos = geo?.getAttribute?.('position') ?? null;
    if (!uv?.getY || !uv?.setY || !pos?.getY) return;

    const dy = Number(yOffset) || 0.0;
    if (Math.abs(dy) < 1e-9) return;

    const vertexIndices = collectGeometryVertexIndicesForMaterialIndex(geo, materialIndex);
    if (!vertexIndices?.length) return;

    let n = 0;
    let sumY = 0;
    let sumV = 0;
    let sumYV = 0;
    const step = Math.max(1, Math.floor(vertexIndices.length / 128));
    for (let i = 0; i < vertexIndices.length; i += step) {
        const vi = vertexIndices[i];
        const y = pos.getY(vi);
        const v = uv.getY(vi);
        if (!Number.isFinite(y) || !Number.isFinite(v)) continue;
        n += 1;
        sumY += y;
        sumV += v;
        sumYV += y * v;
    }
    if (!n) return;

    const meanY = sumY / n;
    const meanV = sumV / n;
    const cov = sumYV / n - meanY * meanV;
    const dir = cov >= 0 ? 1 : -1;
    const delta = dir * dy;

    for (const vi of vertexIndices) {
        const v = uv.getY(vi);
        if (!Number.isFinite(v)) continue;
        uv.setY(vi, v + delta);
    }
    uv.needsUpdate = true;
}

function collectLoopCornerPointsXZ(loop) {
    const pts = Array.isArray(loop) ? loop : [];
    const n = pts.length;
    if (n < 3) return [];

    const corners = [];
    for (let i = 0; i < n; i++) {
        const prev = pts[(i + n - 1) % n];
        const curr = pts[i];
        const next = pts[(i + 1) % n];
        if (!prev || !curr || !next) continue;

        const a = normalize2({ x: curr.x - prev.x, z: curr.z - prev.z });
        const b = normalize2({ x: next.x - curr.x, z: next.z - curr.z });
        if (!(a.len > EPS) || !(b.len > EPS)) continue;

        const dot = Math.abs(a.x * b.x + a.z * b.z);
        if (dot > 0.999) continue;
        corners.push({ x: curr.x, z: curr.z });
    }

    return corners;
}

function applyMatVarCornerDistanceToGeometry(geometry, { loops } = {}) {
    const geo = geometry ?? null;
    const pos = geo?.getAttribute?.('position') ?? null;
    if (!pos?.count || !pos.getX || !pos.getZ) return;

    const srcLoops = Array.isArray(loops) ? loops : [];
    const corners = [];
    for (const loop of srcLoops) corners.push(...collectLoopCornerPointsXZ(loop));
    if (!corners.length) return;

    const data = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        let best = Infinity;
        for (const c of corners) {
            const d = Math.hypot(x - c.x, z - c.z);
            if (d < best) best = d;
        }
        data[i] = Number.isFinite(best) ? best : 0.0;
    }
    geo.setAttribute('matVarCornerDist', new THREE.Float32BufferAttribute(data, 1));
}

function estimateFabricationHeightMax({ baseY, extraFirstFloor, layers } = {}) {
    const safeLayers = Array.isArray(layers) ? layers : [];
    let yCursor = Number.isFinite(baseY) ? Number(baseY) : 0;
    let firstExtra = Number.isFinite(extraFirstFloor) ? Math.max(0, Number(extraFirstFloor)) : 0;

    for (let layerIndex = 0; layerIndex < safeLayers.length; layerIndex++) {
        const layer = safeLayers[layerIndex];
        const type = layer?.type;

        if (type === LAYER_TYPE.FLOOR) {
            const floors = clampInt(layer?.floors, 0, 99);
            const floorHeight = clamp(layer?.floorHeight, 1.0, 12.0);

            const beltCfg = layer?.belt ?? {};
            const beltEnabled = !!beltCfg.enabled;
            const beltHeight = beltEnabled ? clamp(beltCfg.height, 0.02, 1.2) : 0.0;

            for (let floor = 0; floor < floors; floor++) {
                const segHeight = floorHeight + (floor === 0 ? firstExtra : 0);
                if (floor === 0) firstExtra = 0;
                yCursor += segHeight;
                if (beltEnabled && beltHeight > EPS) yCursor += beltHeight;
            }
            continue;
        }

        if (type === LAYER_TYPE.ROOF) {
            const ring = layer?.ring ?? {};
            const ringEnabled = !!ring.enabled;
            const ringHeight = ringEnabled ? clamp(ring.height, 0.02, 2.0) : 0.0;

            const nextLayer = safeLayers[layerIndex + 1] ?? null;
            const hasFloorsAboveRoof = nextLayer?.type === LAYER_TYPE.FLOOR;
            if (!hasFloorsAboveRoof) yCursor += ringHeight;
        }
    }

    return yCursor;
}

function makeWallMaterial({ style, baseColorHex, textureCache }) {
    const styleId = typeof style === 'string' && style ? style : BUILDING_STYLE.DEFAULT;
    const urls = resolveBuildingStyleWallMaterialUrls(styleId);
    const url = urls?.baseColorUrl ?? null;
    const normalUrl = urls?.normalUrl ?? null;
    const ormUrl = urls?.ormUrl ?? null;
    const mat = new THREE.MeshStandardMaterial({
        color: baseColorHex,
        roughness: 0.85,
        metalness: 0.05
    });

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

    disableIblOnMaterial(mat);
    return mat;
}

function makeTextureMaterialFromBuildingStyle({
    style,
    baseColorHex,
    textureCache,
    roughness = 0.9,
    metalness = 0.0,
    polygonOffset = false,
    polygonOffsetFactor = 0,
    polygonOffsetUnits = 0
} = {}) {
    const styleId = typeof style === 'string' && style ? style : BUILDING_STYLE.DEFAULT;
    const urls = resolveBuildingStyleWallMaterialUrls(styleId);
    const url = urls?.baseColorUrl ?? null;
    const normalUrl = urls?.normalUrl ?? null;
    const ormUrl = urls?.ormUrl ?? null;
    const mat = new THREE.MeshStandardMaterial({
        color: baseColorHex,
        roughness,
        metalness,
        polygonOffset: !!polygonOffset,
        polygonOffsetFactor,
        polygonOffsetUnits
    });

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
        const tex = textureCache.trackMaterial(ormUrl, mat, { slot: 'roughnessMap', srgb: false });
        if (tex) mat.roughnessMap = tex;
    }

    disableIblOnMaterial(mat);
    return mat;
}

function makeWallMaterialFromSpec({ material, baseColorHex, textureCache, wallBase }) {
    const base = wallBase && typeof wallBase === 'object' ? wallBase : null;
    const roughness = Number.isFinite(base?.roughness) ? base.roughness : 0.85;
    const normalStrength = Number.isFinite(base?.normalStrength) ? base.normalStrength : 0.9;
    const tintHex = Number.isFinite(base?.tintHex) ? ((Number(base.tintHex) >>> 0) & 0xffffff) : 0xffffff;

    if (material?.kind === 'color') {
        const mat = new THREE.MeshStandardMaterial({
            color: resolveBeltCourseColorHex(material.id),
            roughness,
            metalness: 0.05
        });
        disableIblOnMaterial(mat);
        return mat;
    }

    const style = material?.kind === 'texture' ? material.id : BUILDING_STYLE.DEFAULT;
    const mat = makeWallMaterial({ style, baseColorHex, textureCache, roughness, metalness: 0.05 });
    if (mat?.map) mat.color.setHex(tintHex);
    if (mat?.normalScale) mat.normalScale.set(normalStrength, normalStrength);
    mat.roughness = roughness;
    return mat;
}

function makeBeltLikeMaterialFromSpec({ material, baseColorHex, textureCache }) {
    if (material?.kind === 'texture') {
        return makeTextureMaterialFromBuildingStyle({
            style: material.id,
            baseColorHex,
            textureCache,
            roughness: 0.9,
            metalness: 0.0
        });
    }

    const mat = new THREE.MeshStandardMaterial({
        color: resolveBeltCourseColorHex(material?.id),
        roughness: 0.9,
        metalness: 0.0
    });
    disableIblOnMaterial(mat);
    return mat;
}

function makeRoofSurfaceMaterialFromSpec({ material, baseColorHex, textureCache }) {
    if (material?.kind === 'texture') {
        return makeTextureMaterialFromBuildingStyle({
            style: material.id,
            baseColorHex,
            textureCache,
            roughness: 0.85,
            metalness: 0.05,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });
    }

    const mat = new THREE.MeshStandardMaterial({
        color: resolveRoofColorHex(material?.id, baseColorHex),
        roughness: 0.85,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
    });
    disableIblOnMaterial(mat);
    return mat;
}

function makeWindowMaterial({ typeId, params, windowWidth, windowHeight, fakeDepth, pbr } = {}) {
    const safeTypeId = isWindowTypeId(typeId) ? typeId : WINDOW_TYPE.STYLE_DEFAULT;
    const safeParams = { ...getDefaultWindowParams(safeTypeId), ...(params ?? {}) };
    const wantsAlpha = safeTypeId === WINDOW_TYPE.ARCH_V1;
    const pbrCfg = pbr && typeof pbr === 'object' ? pbr : {};
    const normalCfg = pbrCfg?.normal && typeof pbrCfg.normal === 'object' ? pbrCfg.normal : {};
    const roughCfg = pbrCfg?.roughness && typeof pbrCfg.roughness === 'object' ? pbrCfg.roughness : {};
    const borderCfg = pbrCfg?.border && typeof pbrCfg.border === 'object' ? pbrCfg.border : {};
    const normalEnabled = normalCfg.enabled === undefined ? true : !!normalCfg.enabled;
    const normalStrength = clamp(normalCfg.strength ?? 0.85, 0.0, 2.0);
    const roughEnabled = roughCfg.enabled === undefined ? true : !!roughCfg.enabled;
    const roughnessContrast = clamp(roughCfg.contrast ?? 1.0, 0.0, 4.0);

    const normalMap = normalEnabled ? getWindowNormalMapTexture({
        typeId: safeTypeId,
        params: safeParams,
        windowWidth,
        windowHeight,
        border: borderCfg
    }) : null;

    const roughnessMap = roughEnabled ? getWindowRoughnessMapTexture({
        typeId: safeTypeId,
        params: safeParams,
        windowWidth,
        windowHeight,
        roughness: { contrast: roughnessContrast }
    }) : null;

    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: getWindowTexture({ typeId: safeTypeId, params: safeParams, windowWidth, windowHeight }),
        normalMap,
        roughnessMap,
        roughness: roughnessMap ? 1.0 : 0.4,
        metalness: 0.0,
        emissive: new THREE.Color(0x0b1f34),
        emissiveIntensity: 0.35,
        transparent: wantsAlpha,
        alphaTest: wantsAlpha ? 0.01 : 0.0
    });
    disableIblOnMaterial(mat);
    if (normalMap && mat.normalScale) mat.normalScale.set(normalStrength, normalStrength);
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;

    const fd = fakeDepth && typeof fakeDepth === 'object' ? fakeDepth : null;
    const enabled = !!fd?.enabled;
    if (enabled) {
        const strength = clamp(fd?.strength ?? 0.06, 0.0, 0.25);
        const insetStrength = clamp(fd?.insetStrength ?? 0.25, 0.0, 1.0);
        const frameWidth = clamp(safeParams?.frameWidth ?? 0.06, 0.0, 0.25);
        const aspect = clamp((Number(windowHeight) || 1) / Math.max(0.01, Number(windowWidth) || 1), 0.1, 10.0);

        mat.userData = mat.userData ?? {};
        mat.userData.windowFakeDepth = { strength, insetStrength, frameWidth, aspect };
        mat.customProgramCacheKey = () => 'window_fake_depth_v1';
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uWinFakeDepth = { value: new THREE.Vector4(strength, insetStrength, frameWidth, aspect) };

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
uniform vec4 uWinFakeDepth;
#ifdef USE_NORMALMAP
vec3 mvWinPerturbNormal2Arb(vec3 eye_pos, vec3 surf_norm, vec3 mapN, float faceDirection, vec2 uv){
    vec3 q0 = dFdx( eye_pos.xyz );
    vec3 q1 = dFdy( eye_pos.xyz );
    vec2 st0 = dFdx( uv.st );
    vec2 st1 = dFdy( uv.st );
    vec3 N = normalize( surf_norm );
    vec3 q0perp = cross( N, q0 );
    vec3 q1perp = cross( q1, N );
    vec3 T = q1perp * st0.x + q0perp * st1.x;
    vec3 B = q1perp * st0.y + q0perp * st1.y;
    float det = max( dot( T, T ), dot( B, B ) );
    float scale = (det == 0.0) ? 0.0 : faceDirection * inversesqrt( det );
    return normalize( T * ( mapN.x * scale ) + B * ( mapN.y * scale ) + N * mapN.z );
}
#endif
`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                `vec4 diffuseColor = vec4( diffuse, opacity );
vec2 mvWinUv = vec2(0.0);
float mvWinOcclusion = 0.0;`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `#ifdef USE_MAP
{
vec2 mvUvBase = vMapUv;
mvWinUv = mvUvBase;
vec3 mvNormal = normalize(vNormal);
vec3 mvViewDir = normalize(vViewPosition);
vec3 mvUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
vec3 mvTanU = cross(mvUp, mvNormal);
mvTanU /= max(1e-5, length(mvTanU));
vec3 mvTanV = normalize(cross(mvNormal, mvTanU));
vec3 mvViewTS = vec3(dot(mvViewDir, mvTanU), dot(mvViewDir, mvTanV), dot(mvViewDir, mvNormal));

float mvFrame = clamp(uWinFakeDepth.z, 0.0, 0.45);
float mvAspect = max(0.1, uWinFakeDepth.w);
float mvFrameU = mvFrame * min(1.0, mvAspect);
float mvFrameV = mvFrame * min(1.0, 1.0 / mvAspect);
float mvBlur = 0.02;
float mvInX = smoothstep(mvFrameU, mvFrameU + mvBlur, mvUvBase.x) * (1.0 - smoothstep(1.0 - mvFrameU - mvBlur, 1.0 - mvFrameU, mvUvBase.x));
float mvInY = smoothstep(mvFrameV, mvFrameV + mvBlur, mvUvBase.y) * (1.0 - smoothstep(1.0 - mvFrameV - mvBlur, 1.0 - mvFrameV, mvUvBase.y));
float mvInterior = mvInX * mvInY;

vec2 mvParDir = mvViewTS.xy / max(0.35, mvViewTS.z);
float mvDepth = clamp(uWinFakeDepth.x, 0.0, 0.25);
mvWinUv = mix(mvWinUv, mvUvBase - mvParDir * mvDepth, mvInterior);
mvWinUv = clamp(mvWinUv, vec2(0.0), vec2(1.0));

float mvInset = clamp(uWinFakeDepth.y, 0.0, 1.0);
float mvEdgeDist = min(min(mvUvBase.x, 1.0 - mvUvBase.x), min(mvUvBase.y, 1.0 - mvUvBase.y));
float mvOuterOcc = (1.0 - smoothstep(0.0, 0.08, mvEdgeDist)) * 0.55;
float mvDx = min(mvUvBase.x - mvFrameU, (1.0 - mvFrameU) - mvUvBase.x);
float mvDy = min(mvUvBase.y - mvFrameV, (1.0 - mvFrameV) - mvUvBase.y);
float mvInnerDist = max(0.0, min(mvDx, mvDy));
float mvInnerOcc = (1.0 - smoothstep(0.0, 0.12, mvInnerDist)) * mvInterior;
mvWinOcclusion = clamp(mvInset * (mvInnerOcc * 0.65 + mvOuterOcc * 0.35), 0.0, 1.0);

vec4 texelColor = texture2D(map, mvWinUv);
diffuseColor *= texelColor;
diffuseColor.rgb *= (1.0 - mvWinOcclusion * 0.35);
}
#endif`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_maps>',
                `#ifdef USE_NORMALMAP
vec3 mvNormalTex = texture2D( normalMap, mvWinUv ).xyz * 2.0 - 1.0;
mvNormalTex.xy *= normalScale;
#ifdef USE_TANGENT
normal = normalize( vTBN * mvNormalTex );
#else
normal = mvWinPerturbNormal2Arb( -vViewPosition, normal, mvNormalTex, faceDirection, mvWinUv );
#endif
#endif
`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <roughnessmap_fragment>',
                `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
vec4 mvRoughnessTexel = texture2D( roughnessMap, mvWinUv );
roughnessFactor *= mvRoughnessTexel.g;
#endif`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <emissivemap_fragment>',
                `#include <emissivemap_fragment>
totalEmissiveRadiance *= (1.0 - mvWinOcclusion * 0.55);`
            );
        };
    }

    mat.needsUpdate = true;
    return mat;
}

function applyPlanOffset({ loops, offset }) {
    const { outer, holes } = splitLoops(loops);
    const d = clamp(offset, -8.0, 8.0);
    if (!(Math.abs(d) > EPS)) return { outer, holes, all: [...outer, ...holes] };

    const nextOuter = outer.map((loop) => offsetOrthogonalLoopXZ(loop, d));
    const nextHoles = holes.map((loop) => offsetOrthogonalLoopXZ(loop, -d));
    return { outer: nextOuter, holes: nextHoles, all: [...nextOuter, ...nextHoles] };
}

function applyWallInset({ loops, inset }) {
    const { outer, holes } = splitLoops(loops);
    const d = clamp(inset, 0.0, 4.0);
    if (!(d > EPS)) return { outer, holes, all: [...outer, ...holes] };

    const nextOuter = outer.map((loop) => offsetOrthogonalLoopXZ(loop, d));
    const nextHoles = holes.map((loop) => offsetOrthogonalLoopXZ(loop, -d));
    return { outer: nextOuter, holes: nextHoles, all: [...nextOuter, ...nextHoles] };
}

function buildShapeFromLoops({ outerLoop, holeLoops }) {
    const shapePts = (outerLoop ?? []).map((p) => new THREE.Vector2(p.x, -p.z));
    shapePts.reverse();
    const shape = new THREE.Shape(shapePts);

    for (const hole of holeLoops ?? []) {
        const holePts = (hole ?? []).map((p) => new THREE.Vector2(p.x, -p.z));
        holePts.reverse();
        shape.holes.push(new THREE.Path(holePts));
    }

    return shape;
}

function appendLoopLinePositions(dst, loops, y) {
    for (const loop of loops ?? []) {
        if (!loop || loop.length < 2) continue;
        for (let i = 0; i < loop.length; i++) {
            const a = loop[i];
            const b = loop[(i + 1) % loop.length];
            dst.push(a.x, y, a.z, b.x, y, b.z);
        }
    }
}

function appendWirePositions(dst, geometry, yShift) {
    if (!geometry) return;
    const arr = geometry.attributes?.position?.array;
    if (!arr) return;
    const shift = Number(yShift) || 0;
    for (let i = 0; i < arr.length; i += 3) {
        dst.push(arr[i], arr[i + 1] + shift, arr[i + 2]);
    }
}

function appendWirePositionsTransformed(dst, geometry, matrix) {
    if (!geometry || !matrix) return;
    const arr = geometry.attributes?.position?.array;
    if (!arr) return;
    const v = new THREE.Vector3();
    for (let i = 0; i < arr.length; i += 3) {
        v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(matrix);
        dst.push(v.x, v.y, v.z);
    }
}

function pointsEqualXZ(a, b, tol = 1e-6) {
    if (!a || !b) return false;
    return Math.abs(a.x - b.x) <= tol && Math.abs(a.z - b.z) <= tol;
}

function appendPointIfChanged(points, p, tol = 1e-6) {
    const list = Array.isArray(points) ? points : null;
    if (!list || !p) return;
    const last = list[list.length - 1] ?? null;
    if (last && pointsEqualXZ(last, p, tol)) return;
    list.push(p);
}

function computeLoopBoundsXZ(loop) {
    const pts = Array.isArray(loop) ? loop : [];
    if (!pts.length) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
        if (!p) continue;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return null;
    return { minX, maxX, minZ, maxZ };
}

function isRectLikeLoopXZ(loop, { minX, maxX, minZ, maxZ }, { tol = 1e-4 } = {}) {
    const pts = Array.isArray(loop) ? loop : [];
    if (pts.length < 4) return false;
    if (!(maxX - minX > EPS) || !(maxZ - minZ > EPS)) return false;

    let hasMinX = false;
    let hasMaxX = false;
    let hasMinZ = false;
    let hasMaxZ = false;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (!a || !b) continue;
        const dx = Math.abs(a.x - b.x);
        const dz = Math.abs(a.z - b.z);
        if (!(dx <= tol || dz <= tol)) return false;

        if (Math.abs(a.x - minX) <= tol && Math.abs(b.x - minX) <= tol) hasMinX = true;
        if (Math.abs(a.x - maxX) <= tol && Math.abs(b.x - maxX) <= tol) hasMaxX = true;
        if (Math.abs(a.z - minZ) <= tol && Math.abs(b.z - minZ) <= tol) hasMinZ = true;
        if (Math.abs(a.z - maxZ) <= tol && Math.abs(b.z - maxZ) <= tol) hasMaxZ = true;
    }

    return hasMinX && hasMaxX && hasMinZ && hasMaxZ;
}

function simplifyLoopConsecutiveCollinearXZ(loop, {
    tol = 1e-4,
    minEdge = 1e-3,
    maxPasses = 6
} = {}) {
    const pts = Array.isArray(loop) ? loop : [];
    if (pts.length < 4) return loop;

    const base = [];
    for (const p of pts) appendPointIfChanged(base, p, tol);
    if (base.length < 4) return loop;

    if (pointsEqualXZ(base[0], base[base.length - 1], tol)) base.pop();

    let cur = base;
    for (let pass = 0; pass < maxPasses; pass++) {
        const n = cur.length;
        if (n < 4) break;

        const next = [];
        let changed = false;

        for (let i = 0; i < n; i++) {
            const prev = cur[(i - 1 + n) % n];
            const curr = cur[i];
            const after = cur[(i + 1) % n];
            if (!prev || !curr || !after) continue;

            const dx0 = curr.x - prev.x;
            const dz0 = curr.z - prev.z;
            const dx1 = after.x - curr.x;
            const dz1 = after.z - curr.z;
            const len0 = Math.hypot(dx0, dz0);
            const len1 = Math.hypot(dx1, dz1);

            if (!(len0 > minEdge) || !(len1 > minEdge)) {
                changed = true;
                continue;
            }

            const vx = after.x - prev.x;
            const vz = after.z - prev.z;
            const vLen = Math.hypot(vx, vz);
            if (vLen > minEdge) {
                const wx = curr.x - prev.x;
                const wz = curr.z - prev.z;
                const dist = Math.abs(vx * wz - vz * wx) / vLen;
                const dot = (dx0 * dx1 + dz0 * dz1) / (len0 * len1);
                if (dist <= tol && dot > 0) {
                    changed = true;
                    continue;
                }
            }

            appendPointIfChanged(next, curr, tol);
        }

        if (next.length >= 2 && pointsEqualXZ(next[0], next[next.length - 1], tol)) {
            next.pop();
            changed = true;
        }

        if (!changed) return next.length >= 4 ? next : cur;
        if (next.length < 4) break;
        cur = next;
    }

    return cur.length >= 4 ? cur : base;
}

function resolveFacadeLayoutItems(facade) {
    const list = Array.isArray(facade?.layout?.items) ? facade.layout.items : [];
    return list.filter((it) => it && typeof it === 'object');
}

function normalizeLayoutWidthFracs(items, { warnings = null, faceId = '' } = {}) {
    const list = Array.isArray(items) ? items : [];
    let sum = 0;
    const fracs = list.map((it) => {
        const next = clamp(it?.widthFrac, 0, 1);
        sum += next;
        return next;
    });

    if (!(sum > EPS)) {
        if (warnings) warnings.push(`${faceId || 'Facade'}: layout has no width (sum=0).`);
        return list.map((_it, idx) => ({ ...list[idx], widthFrac: 1 / Math.max(1, list.length) }));
    }

    if (Math.abs(sum - 1.0) > 1e-3 && warnings) warnings.push(`${faceId || 'Facade'}: layout widths sum to ${sum.toFixed(4)} (expected 1.0).`);
    return list.map((it, idx) => ({ ...it, widthFrac: fracs[idx] / sum }));
}

function resolveFacadeWallMaterialSpec({ layerMaterial, facadeMaterial, bayMaterialOverride }) {
    const bay = bayMaterialOverride && typeof bayMaterialOverride === 'object' ? bayMaterialOverride : null;
    if (bay && (bay.kind === 'texture' || bay.kind === 'color') && typeof bay.id === 'string' && bay.id) return bay;
    const facade = facadeMaterial && typeof facadeMaterial === 'object' ? facadeMaterial : null;
    if (facade && (facade.kind === 'texture' || facade.kind === 'color') && typeof facade.id === 'string' && facade.id) return facade;
    const layer = layerMaterial && typeof layerMaterial === 'object' ? layerMaterial : null;
    if (layer && (layer.kind === 'texture' || layer.kind === 'color') && typeof layer.id === 'string' && layer.id) return layer;
    return null;
}

function pointOnRectFacade({ faceId, minX, maxX, minZ, maxZ, u, depth }) {
    const d = Number(depth) || 0;
    const t = Number(u) || 0;
    let x = minX + t;
    let z = maxZ + d;
    switch (faceId) {
        case 'A':
            x = minX + t;
            z = maxZ + d;
            break;
        case 'B':
            x = maxX + d;
            z = maxZ - t;
            break;
        case 'C':
            x = maxX - t;
            z = minZ - d;
            break;
        case 'D':
            x = minX - d;
            z = minZ + t;
            break;
        default:
            x = minX + t;
            z = maxZ + d;
            break;
    }
    return { x: qf(x), y: 0, z: qf(z) };
}

function buildRectFacadeFaceProfile({
    faceId,
    minX,
    maxX,
    minZ,
    maxZ,
    facade,
    layerMaterial,
    faceLengthMeters,
    warnings
}) {
    const faceLength = Number(faceLengthMeters) || 0;
    if (!(faceLength > EPS)) {
        if (warnings) warnings.push(`${faceId}: face length is invalid.`);
        return { points: [], startDepth: 0.0, endDepth: 0.0, strips: [] };
    }

    const baseDepth = clampFacadeDepthMeters(facade?.depthOffset ?? 0.0);
    const rawItems = resolveFacadeLayoutItems(facade);
    const items = normalizeLayoutWidthFracs(rawItems.length ? rawItems : [{ type: 'padding', id: `${faceId}_pad`, widthFrac: 1.0 }], { warnings, faceId });

    const strips = [];
    const points = [];
    let uCursor = 0.0;
    let currentDepth = null;
    const depthEps = 1e-4;
    const pointTol = 1e-4;
    const minEdge = 1e-3;

    for (let i = 0; i < items.length; i++) {
        const it = items[i] ?? {};
        const type = it?.type === 'padding' ? 'padding' : 'bay';
        const id = typeof it?.id === 'string' && it.id ? it.id : `${faceId}_${type}_${i + 1}`;

        const frac = clamp(it?.widthFrac, 0, 1);
        const w = (i === items.length - 1) ? (faceLength - uCursor) : (frac * faceLength);
        const widthMeters = Math.max(0, w);
        const u0 = uCursor;
        const u1 = uCursor + widthMeters;
        uCursor = u1;

        const isBay = type === 'bay';
        const depthSpec = isBay && it?.depth && typeof it.depth === 'object' ? it.depth : null;
        const depthLinked = (depthSpec?.linked ?? true) !== false;
        const depthLeftRaw = Number(depthSpec?.left);
        const deltaDepthLeft = depthSpec
            ? (Number.isFinite(depthLeftRaw) ? clampFacadeDepthMeters(depthLeftRaw) : 0.0)
            : (isBay ? clampFacadeDepthMeters(it?.depthOffset ?? 0.0) : 0.0);
        const depthRightRaw = Number(depthSpec?.right);
        const deltaDepthRight = depthSpec
            ? (Number.isFinite(depthRightRaw) ? clampFacadeDepthMeters(depthRightRaw) : (depthLinked ? deltaDepthLeft : 0.0))
            : deltaDepthLeft;

        const wedgeAngleDeg = isBay && !depthSpec ? normalizeWedgeAngleDeg(it?.wedgeAngleDeg) : 0;
        const wantsWedge = isBay && !depthSpec && wedgeAngleDeg > 0 && Math.abs(deltaDepthLeft) > depthEps;

        if (isBay && !depthSpec && wedgeAngleDeg > 0 && !(Math.abs(deltaDepthLeft) > depthEps) && warnings) {
            warnings.push(`${faceId}:${id}: wedge angle set but depth is 0.`);
        }

        const boundaryDepth0 = baseDepth + (isBay && !wantsWedge ? deltaDepthLeft : 0.0);
        const boundaryDepth1 = baseDepth + (isBay && !wantsWedge ? deltaDepthRight : 0.0);
        if (!points.length) {
            appendPointIfChanged(points, pointOnRectFacade({ faceId, minX, maxX, minZ, maxZ, u: u0, depth: boundaryDepth0 }), pointTol);
            currentDepth = boundaryDepth0;
        } else if (currentDepth !== null && Math.abs(currentDepth - boundaryDepth0) > depthEps) {
            appendPointIfChanged(points, pointOnRectFacade({ faceId, minX, maxX, minZ, maxZ, u: u0, depth: boundaryDepth0 }), pointTol);
            currentDepth = boundaryDepth0;
        }

        let frontU0 = u0;
        let frontU1 = u1;
        if (wantsWedge) {
            const absDepth = Math.abs(deltaDepthLeft);
            const rad = wedgeAngleDeg * (Math.PI / 180);
            const tan = Math.tan(rad);
            const dx = tan > EPS ? (absDepth / tan) : (widthMeters * 0.5);
            const f0 = u0 + dx;
            const f1 = u1 - dx;
            if (f1 <= f0 + minEdge) {
                if (warnings) warnings.push(`${faceId}:${id}: wedge too narrow for depth (${widthMeters.toFixed(2)}m @ ${wedgeAngleDeg}°).`);
            } else {
                frontU0 = f0;
                frontU1 = f1;
            }
        }

        const resolvedMaterial = resolveFacadeWallMaterialSpec({
            layerMaterial,
            facadeMaterial: facade?.wallMaterial ?? null,
            bayMaterialOverride: isBay ? (it?.wallMaterialOverride ?? null) : null
        });

        const frontDepth0 = baseDepth + (isBay ? deltaDepthLeft : 0.0);
        const frontDepth1 = baseDepth + (isBay ? deltaDepthRight : 0.0);
        const stripDepth0 = frontDepth0;
        const stripDepth1 = wantsWedge ? frontDepth0 : frontDepth1;
        const frontDepth = (stripDepth0 + stripDepth1) * 0.5;
        const sourceBayId = isBay && typeof it?.sourceBayId === 'string' ? it.sourceBayId : null;
        const textureFlow = isBay && typeof it?.textureFlow === 'string' ? it.textureFlow : null;
        const wallBase = isBay && it?.wallBase && typeof it.wallBase === 'object' ? it.wallBase : null;
        const tiling = isBay && it?.tiling && typeof it.tiling === 'object' ? it.tiling : null;
        const materialVariation = isBay && it?.materialVariation && typeof it.materialVariation === 'object' ? it.materialVariation : null;
        strips.push({
            faceId,
            id,
            type,
            ...(sourceBayId ? { sourceBayId } : {}),
            ...(textureFlow ? { textureFlow } : {}),
            ...(wallBase ? { wallBase } : {}),
            ...(tiling ? { tiling } : {}),
            ...(materialVariation ? { materialVariation } : {}),
            u0,
            u1,
            frontU0,
            frontU1,
            depth0: stripDepth0,
            depth1: stripDepth1,
            depth: frontDepth,
            material: resolvedMaterial
        });

        if (wantsWedge && frontU1 > frontU0 + minEdge) {
            const dFront = baseDepth + deltaDepthLeft;
            appendPointIfChanged(points, pointOnRectFacade({ faceId, minX, maxX, minZ, maxZ, u: frontU0, depth: dFront }), pointTol);
            appendPointIfChanged(points, pointOnRectFacade({ faceId, minX, maxX, minZ, maxZ, u: frontU1, depth: dFront }), pointTol);
            appendPointIfChanged(points, pointOnRectFacade({ faceId, minX, maxX, minZ, maxZ, u: u1, depth: baseDepth }), pointTol);
            currentDepth = baseDepth;
            continue;
        }

        const nextIt = items[i + 1] ?? null;
        let nextBoundaryDepth0 = null;
        if (nextIt) {
            const nextType = nextIt?.type === 'padding' ? 'padding' : 'bay';
            const nextIsBay = nextType === 'bay';
            const nextDepthSpec = nextIsBay && nextIt?.depth && typeof nextIt.depth === 'object' ? nextIt.depth : null;
            const nextDepthLeftRaw = Number(nextDepthSpec?.left);
            const nextDeltaDepthLeft = nextDepthSpec
                ? (Number.isFinite(nextDepthLeftRaw) ? clampFacadeDepthMeters(nextDepthLeftRaw) : 0.0)
                : (nextIsBay ? clampFacadeDepthMeters(nextIt?.depthOffset ?? 0.0) : 0.0);
            const nextWedgeAngleDeg = nextIsBay && !nextDepthSpec ? normalizeWedgeAngleDeg(nextIt?.wedgeAngleDeg) : 0;
            const nextWantsWedge = nextIsBay && !nextDepthSpec && nextWedgeAngleDeg > 0 && Math.abs(nextDeltaDepthLeft) > depthEps;
            nextBoundaryDepth0 = baseDepth + (nextIsBay && !nextWantsWedge ? nextDeltaDepthLeft : 0.0);
        }

        const isLast = i === items.length - 1;
        const depthChangeWithin = Math.abs(boundaryDepth1 - boundaryDepth0) > depthEps;
        const depthChangeNext = nextBoundaryDepth0 !== null && Math.abs(boundaryDepth1 - nextBoundaryDepth0) > depthEps;
        const shouldAppendEndPoint = isLast || depthChangeWithin || depthChangeNext;
        if (shouldAppendEndPoint) {
            appendPointIfChanged(points, pointOnRectFacade({ faceId, minX, maxX, minZ, maxZ, u: u1, depth: boundaryDepth1 }), pointTol);
        }
        currentDepth = boundaryDepth1;
    }

    const startDepth = points.length ? (
        faceId === 'A' || faceId === 'C'
            ? (faceId === 'A' ? (points[0].z - maxZ) : (minZ - points[0].z))
            : (faceId === 'B' ? (points[0].x - maxX) : (minX - points[0].x))
    ) : 0.0;

    const last = points[points.length - 1] ?? null;
    const endDepth = last ? (
        faceId === 'A' || faceId === 'C'
            ? (faceId === 'A' ? (last.z - maxZ) : (minZ - last.z))
            : (faceId === 'B' ? (last.x - maxX) : (minX - last.x))
    ) : startDepth;

    return { points, startDepth, endDepth, strips };
}

function computeRectFacadeSilhouette({
    wallOuter,
    facades,
    layerMaterial,
    warnings,
    cornerStrategy = null,
    cornerDebug = null
} = {}) {
    const outerList = Array.isArray(wallOuter) ? wallOuter : [];
    const main = outerList[0] ?? null;
    if (!main || main.length < 3) return null;

    const bounds = computeLoopBoundsXZ(main);
    if (!bounds) return null;

    if (!isRectLikeLoopXZ(main, bounds)) {
        if (warnings) warnings.push('Facade silhouette: building footprint is not a simple axis-aligned rectangle (A–D).');
        return null;
    }

    const { minX, maxX, minZ, maxZ } = bounds;
    const faceLengthX = maxX - minX;
    const faceLengthZ = maxZ - minZ;
    const pointTol = 1e-4;
    const minEdge = 1e-3;
    const resolvedCornerStrategy = cornerStrategy && typeof cornerStrategy === 'object' && typeof cornerStrategy.resolve === 'function'
        ? cornerStrategy
        : resolveRectFacadeCornerStrategy(null);
    const cornerDebugList = Array.isArray(cornerDebug) ? cornerDebug : null;

    const fac = facades && typeof facades === 'object' ? facades : null;
    const getFacade = (id) => (fac?.[id] && typeof fac[id] === 'object') ? fac[id] : null;

    const A = buildRectFacadeFaceProfile({
        faceId: 'A',
        minX,
        maxX,
        minZ,
        maxZ,
        facade: getFacade('A'),
        layerMaterial,
        faceLengthMeters: faceLengthX,
        warnings
    });
    const B = buildRectFacadeFaceProfile({
        faceId: 'B',
        minX,
        maxX,
        minZ,
        maxZ,
        facade: getFacade('B'),
        layerMaterial,
        faceLengthMeters: faceLengthZ,
        warnings
    });
    const C = buildRectFacadeFaceProfile({
        faceId: 'C',
        minX,
        maxX,
        minZ,
        maxZ,
        facade: getFacade('C'),
        layerMaterial,
        faceLengthMeters: faceLengthX,
        warnings
    });
    const D = buildRectFacadeFaceProfile({
        faceId: 'D',
        minX,
        maxX,
        minZ,
        maxZ,
        facade: getFacade('D'),
        layerMaterial,
        faceLengthMeters: faceLengthZ,
        warnings
    });

    if (!A.points.length || !B.points.length || !C.points.length || !D.points.length) {
        if (warnings) warnings.push('Facade silhouette: missing face profiles.');
        return null;
    }

    const patchFaceCorner = (profile, faceId, end, depth) => {
        if (!profile || !Array.isArray(profile.points) || !profile.points.length) return;

        const d = Number.isFinite(depth) ? depth : 0;
        const u = end === 'start'
            ? 0
            : ((faceId === 'A' || faceId === 'C') ? faceLengthX : faceLengthZ);
        const p = pointOnRectFacade({ faceId, minX, maxX, minZ, maxZ, u, depth: d });
        if (!p) return;

        if (end === 'start') {
            profile.points[0] = p;
            profile.startDepth = d;
        } else {
            profile.points[profile.points.length - 1] = p;
            profile.endDepth = d;
        }

        if (Array.isArray(profile.strips) && profile.strips.length) {
            const list = profile.strips;
            if (end === 'start') {
                const strip = list.find((s) => Math.abs((Number(s?.frontU0) || 0) - 0) <= pointTol) ?? null;
                if (strip) {
                    strip.depth0 = d;
                    const other = Number(strip.depth1);
                    strip.depth = (d + (Number.isFinite(other) ? other : d)) * 0.5;
                }
            } else {
                const expectedU = (faceId === 'A' || faceId === 'C') ? faceLengthX : faceLengthZ;
                const strip = [...list].reverse().find((s) => Math.abs((Number(s?.frontU1) || 0) - expectedU) <= pointTol) ?? null;
                if (strip) {
                    strip.depth1 = d;
                    const other = Number(strip.depth0);
                    strip.depth = ((Number.isFinite(other) ? other : d) + d) * 0.5;
                }
            }
        }
    };

    const resolveCorner = (cornerId, aFaceId, aEnd, aProfile, bFaceId, bEnd, bProfile) => {
        const aDepth = Number(aProfile?.[aEnd === 'start' ? 'startDepth' : 'endDepth']) || 0;
        const bDepth = Number(bProfile?.[bEnd === 'start' ? 'startDepth' : 'endDepth']) || 0;
        const res = resolvedCornerStrategy.resolve(
            { faceId: aFaceId, end: aEnd, depth: aDepth },
            { faceId: bFaceId, end: bEnd, depth: bDepth },
            { cornerId }
        );
        const depth = Number.isFinite(res?.depth) ? res.depth : (Number.isFinite(aDepth) ? aDepth : 0);
        const winnerFaceId = res?.winnerFaceId === aFaceId || res?.winnerFaceId === bFaceId ? res.winnerFaceId : aFaceId;

        patchFaceCorner(aProfile, aFaceId, aEnd, depth);
        patchFaceCorner(bProfile, bFaceId, bEnd, depth);

        if (cornerDebugList) {
            cornerDebugList.push({
                cornerId,
                strategyId: typeof resolvedCornerStrategy.id === 'string' ? resolvedCornerStrategy.id : null,
                winnerFaceId,
                depth,
                a: { faceId: aFaceId, end: aEnd, depth: aDepth },
                b: { faceId: bFaceId, end: bEnd, depth: bDepth }
            });
        }
    };

    resolveCorner('AB', 'A', 'end', A, 'B', 'start', B);
    resolveCorner('BC', 'B', 'end', B, 'C', 'start', C);
    resolveCorner('CD', 'C', 'end', C, 'D', 'start', D);
    resolveCorner('DA', 'D', 'end', D, 'A', 'start', A);

    const loop = [];
    for (const p of A.points) appendPointIfChanged(loop, p, pointTol);

    appendPointIfChanged(loop, { x: qf(maxX + B.startDepth), y: 0, z: qf(maxZ + A.endDepth) }, pointTol);
    appendPointIfChanged(loop, { x: qf(maxX + B.startDepth), y: 0, z: qf(maxZ) }, pointTol);
    for (let i = 1; i < B.points.length; i++) appendPointIfChanged(loop, B.points[i], pointTol);

    appendPointIfChanged(loop, { x: qf(maxX + B.endDepth), y: 0, z: qf(minZ - C.startDepth) }, pointTol);
    appendPointIfChanged(loop, { x: qf(maxX), y: 0, z: qf(minZ - C.startDepth) }, pointTol);
    for (let i = 1; i < C.points.length; i++) appendPointIfChanged(loop, C.points[i], pointTol);

    appendPointIfChanged(loop, { x: qf(minX - D.startDepth), y: 0, z: qf(minZ - C.endDepth) }, pointTol);
    appendPointIfChanged(loop, { x: qf(minX - D.startDepth), y: 0, z: qf(minZ) }, pointTol);
    for (let i = 1; i < D.points.length; i++) appendPointIfChanged(loop, D.points[i], pointTol);

    appendPointIfChanged(loop, { x: qf(minX - D.endDepth), y: 0, z: qf(maxZ + A.startDepth) }, pointTol);

    const simplified = simplifyLoopConsecutiveCollinearXZ(loop, { tol: pointTol, minEdge });
    if (!simplified || simplified.length < 4) {
        if (warnings) warnings.push('Facade silhouette: produced invalid loop.');
        return null;
    }

    const area = signedArea(simplified);
    const finalLoop = area < 0 ? simplified.slice().reverse() : simplified;
    return {
        bounds,
        loop: finalLoop,
        strips: [...A.strips, ...B.strips, ...C.strips, ...D.strips]
    };
}

export function buildBuildingFabricationVisualParts({
    map,
    tiles,
    generatorConfig = null,
    tileSize = null,
    occupyRatio = 1.0,
    layers = null,
    materialVariationSeed = null,
    textureCache = null,
    renderer = null,
    windowVisuals = null,
    windowVisualsIsOverride = false,
    facades = null,
    facadeCornerStrategy = null,
    facadeCornerStrategyId = null,
    facadeCornerDebug = false,
    windowDefinitions = null,
    colors = null,
    overlays = null,
    walls = null
} = {}) {
    const footprintLoops = computeBuildingLoopsFromTiles({ map, tiles, generatorConfig, tileSize, occupyRatio });
    if (!footprintLoops.length) return null;

    const safeLayers = normalizeBuildingLayers(layers);
    const tileCount = Array.isArray(tiles) ? tiles.length : 0;
    const baseColorHex = makeDeterministicColor(tileCount * 97 + safeLayers.length * 31).getHex();
    const matVarSeed = Number.isFinite(materialVariationSeed)
        ? (Number(materialVariationSeed) >>> 0)
        : computeMaterialVariationSeedFromTiles(tiles, { salt: 'building' });

    const firstFloorLayer = safeLayers.find((layer) => layer?.type === LAYER_TYPE.FLOOR) ?? null;
    const firstFloorHeight = clamp(firstFloorLayer?.floorHeight ?? 3.2, 1.0, 12.0);
    const { baseY, extraFirstFloor, planY } = computeBuildingBaseAndSidewalk({ generatorConfig, floorHeight: firstFloorHeight });
    const matVarHeightMax = estimateFabricationHeightMax({ baseY, extraFirstFloor, layers: safeLayers });
    const overlayLoops = applyPlanOffset({ loops: footprintLoops, offset: firstFloorLayer?.planOffset ?? 0.0 }).all;

    const wallInset = clamp(walls?.inset, 0.0, 4.0);
    const lineColor = colors?.line ?? 0xff3b30;
    const borderColor = colors?.border ?? 0x64d2ff;

    const enabled = overlays ?? {};
    const showWire = enabled.wire ?? true;
    const showPlan = enabled.floorplan ?? true;
    const showBorder = enabled.border ?? true;
    const showFloors = enabled.floorDivisions ?? true;

    const solidMeshes = [];
    const wirePositions = [];
    const floorPositions = [];
    const warnings = [];
    const facadeSolverDebug = {};
    const facadeCornerDebugByLayerId = facadeCornerDebug ? {} : null;

    const windowsGroup = new THREE.Group();
    windowsGroup.name = 'windows';
    windowsGroup.userData = windowsGroup.userData ?? {};
    const baseReflectiveCfg = resolveBuildingWindowReflectiveConfig(windowVisuals);
    const baseVisualsOverride = !!windowVisualsIsOverride;

    windowsGroup.userData.buildingWindowVisuals = Object.freeze({
        reflective: Object.freeze({
            enabled: baseReflectiveCfg.enabled,
            opacity: baseReflectiveCfg.opacity,
            layerOffset: baseReflectiveCfg.layerOffset,
            glass: Object.freeze({
                colorHex: baseReflectiveCfg.glass.colorHex,
                metalness: baseReflectiveCfg.glass.metalness,
                roughness: baseReflectiveCfg.glass.roughness,
                transmission: baseReflectiveCfg.glass.transmission,
                ior: baseReflectiveCfg.glass.ior,
                envMapIntensity: baseReflectiveCfg.glass.envMapIntensity
            })
        })
    });

    const makeGlassMaterial = (alphaMap, reflectiveCfg = null, { isOverride = false } = {}) => {
        const cfg = reflectiveCfg && typeof reflectiveCfg === 'object' ? reflectiveCfg : baseReflectiveCfg;
        const wantsTransmission = cfg.glass.transmission > 0.01;
        const mat = new THREE.MeshPhysicalMaterial({
            color: cfg.glass.colorHex,
            metalness: cfg.glass.metalness,
            roughness: cfg.glass.roughness,
            transmission: wantsTransmission ? cfg.glass.transmission : 0.0,
            ior: cfg.glass.ior,
            envMapIntensity: cfg.glass.envMapIntensity,
            opacity: cfg.opacity
        });
        mat.transparent = true;
        mat.alphaMap = alphaMap ?? null;
        mat.alphaTest = 0.5;
        mat.depthWrite = false;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -1;
        mat.polygonOffsetUnits = -1;
        mat.userData = mat.userData ?? {};
        mat.userData.iblEnvMapIntensityScale = cfg.glass.envMapIntensity;
        mat.userData.buildingWindowGlass = true;
        mat.userData.buildingWindowGlassOverride = !!isOverride;
        mat.userData.buildingWindowGlassEnabled = !!cfg.enabled;
        return mat;
    };

    const resolvedCornerStrategy = facadeCornerStrategy && typeof facadeCornerStrategy === 'object' && typeof facadeCornerStrategy.resolve === 'function'
        ? facadeCornerStrategy
        : resolveRectFacadeCornerStrategy(facadeCornerStrategyId);

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

    const beltsGroup = new THREE.Group();
    beltsGroup.name = 'belts';

    const roofRingGroup = new THREE.Group();
    roofRingGroup.name = 'roof_rings';

    const roofMatTemplate = new THREE.MeshStandardMaterial({
        color: resolveRoofColorHex(ROOF_COLOR.DEFAULT, baseColorHex),
        roughness: 0.85,
        metalness: 0.05
    });
    disableIblOnMaterial(roofMatTemplate);

    let currentLoops = footprintLoops;
    let yCursor = baseY;
    let firstFloorPendingExtra = extraFirstFloor;

    const facadesRaw = facades && typeof facades === 'object' ? facades : null;
    const facadesAreGlobal = !!facadesRaw && ['A', 'B', 'C', 'D'].some((id) => !!facadesRaw?.[id]);
    const globalFacadeSpec = facadesAreGlobal ? facadesRaw : null;
    const facadesByLayerId = facadesAreGlobal ? null : facadesRaw;
    const wantsFacadePatterns = !!globalFacadeSpec && ['A', 'B', 'C', 'D'].some((id) => !!globalFacadeSpec?.[id]?.layout?.pattern);

    const facadePatternTopologyByFaceId = new Map();
    if (wantsFacadePatterns) {
        let minFaceLengthX = Infinity;
        let minFaceLengthZ = Infinity;
        let probeLoops = footprintLoops;

        for (const layer of safeLayers) {
            if (layer?.type !== LAYER_TYPE.FLOOR) continue;
            const planOffset = clamp(layer?.planOffset ?? 0.0, -8.0, 8.0);
            const { all: planLoops } = applyPlanOffset({ loops: probeLoops, offset: planOffset });
            const { outer: wallOuter } = applyWallInset({ loops: planLoops, inset: wallInset });
            const main = Array.isArray(wallOuter) ? wallOuter[0] : null;
            const bounds = main ? computeLoopBoundsXZ(main) : null;
            if (bounds && isRectLikeLoopXZ(main, bounds)) {
                minFaceLengthX = Math.min(minFaceLengthX, bounds.maxX - bounds.minX);
                minFaceLengthZ = Math.min(minFaceLengthZ, bounds.maxZ - bounds.minZ);
            }
            probeLoops = planLoops.length ? planLoops : probeLoops;
        }

        for (const faceId of ['A', 'B', 'C', 'D']) {
            const facade = globalFacadeSpec?.[faceId] ?? null;
            const pattern = facade?.layout?.pattern ?? null;
            if (!pattern || typeof pattern !== 'object') continue;
            const refLen = (faceId === 'A' || faceId === 'C') ? minFaceLengthX : minFaceLengthZ;
            if (!Number.isFinite(refLen) || !(refLen > EPS)) continue;
            const res = solveFacadeLayoutFillPattern({
                pattern,
                faceLengthMeters: refLen,
                topology: null,
                warnings
            });
            if (res?.topology) facadePatternTopologyByFaceId.set(faceId, res.topology);
            facadeSolverDebug[faceId] = {
                referenceFaceLengthMeters: refLen,
                debug: res?.debug ?? null,
                topology: res?.topology ?? null
            };
        }
    }

    let lastFloorLayer = null;
    for (let layerIndex = 0; layerIndex < safeLayers.length; layerIndex++) {
        const layer = safeLayers[layerIndex];
        const type = layer?.type;
        if (type === LAYER_TYPE.FLOOR) {
            lastFloorLayer = layer;
            const planOffset = clamp(layer.planOffset, -8.0, 8.0);
            const { outer: planOuter, holes: planHoles, all: planLoops } = applyPlanOffset({ loops: currentLoops, offset: planOffset });

            const { outer: wallOuter, holes: wallHoles } = applyWallInset({ loops: planLoops, inset: wallInset });
            let wallOuterFacade = wallOuter;
            let facadeBounds = null;
            let facadeStrips = null;

            const floors = clampInt(layer.floors, 0, 99);
            const floorHeight = clamp(layer.floorHeight, 1.0, 12.0);
            const wallMat = makeWallMaterialFromSpec({
                material: layer.material,
                baseColorHex,
                textureCache,
                wallBase: layer?.wallBase ?? null
            });
            const wallStyleId = layer.material?.kind === 'texture' ? layer.material.id : null;
            const wallUrls = wallStyleId ? resolveBuildingStyleWallMaterialUrls(wallStyleId) : null;
            const wallTiling = layer?.tiling ?? null;
            const wallUvCfg = computeUvTilingParams({ tiling: wallTiling, urls: wallUrls, styleId: wallStyleId });
            if (wallUvCfg.apply) {
                applyUvTilingToMeshStandardMaterial(wallMat, {
                    scaleU: wallUvCfg.scaleU,
                    scaleV: wallUvCfg.scaleV,
                    offsetU: wallUvCfg.offsetU,
                    offsetV: wallUvCfg.offsetV,
                    rotationDegrees: wallUvCfg.rotationDegrees
                });
            }

            const wallMatVar = layer?.materialVariation ?? null;
            if (wallMatVar?.enabled) {
                applyMaterialVariationToMeshStandardMaterial(wallMat, {
                    seed: matVarSeed,
                    seedOffset: clampInt(wallMatVar?.seedOffset ?? 0, -9999, 9999),
                    heightMin: baseY,
                    heightMax: matVarHeightMax,
                    config: wallMatVar,
                    root: MATERIAL_VARIATION_ROOT.WALL,
                    cornerDist: true
                });
            }

            const layerId = typeof layer?.id === 'string' ? layer.id : '';
            const layerFacadeSpec = globalFacadeSpec
                ? globalFacadeSpec
                : ((layerId && facadesByLayerId?.[layerId] && typeof facadesByLayerId[layerId] === 'object') ? facadesByLayerId[layerId] : null);
            const wantsFacadeSilhouette = !!layerFacadeSpec && ['A', 'B', 'C', 'D'].some((id) => !!layerFacadeSpec?.[id]);

            if (wantsFacadeSilhouette && wallOuter.length) {
                const main = wallOuter[0] ?? null;
                const bounds = main ? computeLoopBoundsXZ(main) : null;
                if (bounds && isRectLikeLoopXZ(main, bounds)) {
                    const faceLengthX = bounds.maxX - bounds.minX;
                    const faceLengthZ = bounds.maxZ - bounds.minZ;

                    const faceMaterials = layer?.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
                    const links = layer?.faceLinking?.links && typeof layer.faceLinking.links === 'object' ? layer.faceLinking.links : null;
                    const resolveMasterFaceId = (faceId) => {
                        const seen = new Set();
                        let cur = faceId;
                        for (let i = 0; i < 8; i++) {
                            if (seen.has(cur)) break;
                            seen.add(cur);
                            const next = links?.[cur] ?? null;
                            if (next === null || next === undefined) return cur;
                            if (next === cur) return cur;
                            cur = next;
                        }
                        return faceId;
                    };

                    const next = {};
                    for (const faceId of ['A', 'B', 'C', 'D']) {
                        const masterFaceId = resolveMasterFaceId(faceId);
                        const srcFacade = (layerFacadeSpec?.[masterFaceId] && typeof layerFacadeSpec[masterFaceId] === 'object')
                            ? layerFacadeSpec[masterFaceId]
                            : null;

                        const srcLayout = srcFacade?.layout && typeof srcFacade.layout === 'object' ? srcFacade.layout : null;
                        const len = (faceId === 'A' || faceId === 'C') ? faceLengthX : faceLengthZ;

                        const bays = Array.isArray(srcLayout?.bays?.items) ? srcLayout.bays.items : null;
                        const groups = Array.isArray(srcLayout?.groups?.items) ? srcLayout.groups.items : null;
                        const hasBays = !!bays && bays.length > 0;
                        const bayItems = hasBays ? solveFacadeBaysLayout({ bays, groups, faceLengthMeters: len, warnings }) : null;

                        let solvedPatternItems = null;
                        if (!hasBays) {
                            const pattern = srcLayout?.pattern ?? null;
                            if (pattern && typeof pattern === 'object') {
                                const topology = facadePatternTopologyByFaceId.get(masterFaceId) ?? null;
                                const solved = solveFacadeLayoutFillPattern({
                                    pattern,
                                    faceLengthMeters: len,
                                    topology: globalFacadeSpec ? topology : null,
                                    warnings
                                });
                                solvedPatternItems = Array.isArray(solved?.items) ? solved.items : null;
                            }
                        }

                        const faceCfg = masterFaceId && faceMaterials?.[masterFaceId] && typeof faceMaterials[masterFaceId] === 'object'
                            ? faceMaterials[masterFaceId]
                            : null;
                        const faceMaterialSpec = faceCfg?.material && typeof faceCfg.material === 'object' ? faceCfg.material : null;
                        const hasFaceMaterialSpec = !!faceMaterialSpec
                            && (faceMaterialSpec.kind === 'texture' || faceMaterialSpec.kind === 'color')
                            && typeof faceMaterialSpec.id === 'string'
                            && !!faceMaterialSpec.id;

                        if (!srcFacade && !hasFaceMaterialSpec && !hasBays && !solvedPatternItems) continue;

                        const base = srcFacade ? { ...srcFacade } : {};
                        const layout = (base.layout && typeof base.layout === 'object') ? { ...base.layout } : {};
                        if (Array.isArray(bayItems)) layout.items = bayItems;
                        else if (Array.isArray(solvedPatternItems)) layout.items = solvedPatternItems;
                        base.layout = layout;

                        if (hasFaceMaterialSpec) {
                            base.wallMaterial = { kind: faceMaterialSpec.kind, id: faceMaterialSpec.id };
                        }
                        next[faceId] = base;
                    }

                    const cornerDebugList = facadeCornerDebugByLayerId ? [] : null;
                    const res = computeRectFacadeSilhouette({
                        wallOuter,
                        facades: next,
                        layerMaterial: layer.material,
                        warnings,
                        cornerStrategy: resolvedCornerStrategy,
                        cornerDebug: cornerDebugList
                    });
                    if (res?.loop?.length) {
                        wallOuterFacade = [res.loop];
                        facadeBounds = res.bounds ?? null;
                        facadeStrips = Array.isArray(res.strips) ? res.strips : null;
                        if (facadeCornerDebugByLayerId && layerId && cornerDebugList && cornerDebugList.length) facadeCornerDebugByLayerId[layerId] = cornerDebugList;
                    } else {
                        warnings.push('Facade silhouette: falling back to inset wall loop.');
                    }
                }
            }

            const beltCfg = layer.belt ?? {};
            const beltEnabled = !!beltCfg.enabled;
            const beltHeight = beltEnabled ? clamp(beltCfg.height, 0.02, 1.2) : 0.0;
            const beltExtrusion = beltEnabled ? clamp(beltCfg.extrusion, 0.0, 4.0) : 0.0;
            const beltOuter = wallOuterFacade.map((loop) => (beltExtrusion > EPS ? offsetOrthogonalLoopXZ(loop, -beltExtrusion) : loop));
            const beltHoles = wallHoles;
            const beltMat = makeBeltLikeMaterialFromSpec({
                material: beltCfg.material,
                baseColorHex,
                textureCache
            });
            const beltStyleId = beltCfg.material?.kind === 'texture' ? beltCfg.material.id : null;
            const beltUrls = beltStyleId ? resolveBuildingStyleWallMaterialUrls(beltStyleId) : null;
            const beltTiling = beltCfg?.tiling ?? null;
            if (beltStyleId) {
                const beltUvCfg = computeUvTilingParams({ tiling: beltTiling, urls: beltUrls, styleId: beltStyleId });
                if (beltUvCfg.apply) {
                    applyUvTilingToMeshStandardMaterial(beltMat, {
                        scaleU: beltUvCfg.scaleU,
                        scaleV: beltUvCfg.scaleV,
                        offsetU: beltUvCfg.offsetU,
                        offsetV: beltUvCfg.offsetV,
                        rotationDegrees: beltUvCfg.rotationDegrees
                    });
                }
            }

            const winCfg = layer.windows ?? null;
            const winEnabled = !!winCfg?.enabled;
            const winWidth = clamp(winCfg?.width, 0.3, 12.0);
            const winSpacing = clamp(winCfg?.spacing, 0.0, 24.0);
            const winDesiredHeight = clamp(winCfg?.height, 0.3, 10.0);
            const winSill = clamp(winCfg?.sillHeight, 0.0, 12.0);
            const winTypeId = typeof winCfg?.typeId === 'string' ? winCfg.typeId : WINDOW_TYPE.STYLE_DEFAULT;
            const winParams = winCfg?.params ?? null;
            const winFakeDepth = winCfg?.fakeDepth ?? null;
            const winPbr = winCfg?.pbr ?? null;
            const winVisualsOverride = winCfg?.windowVisuals ?? null;

            const columns = winCfg?.spaceColumns ?? null;
            const colsEnabled = !!columns?.enabled;
            const colsEvery = clampInt(columns?.every, 1, 99);
            const colsWidth = clamp(columns?.width, 0.1, 10.0);
            const colsExtrude = !!columns?.extrude;
            const colsExtrudeDistance = clamp(columns?.extrudeDistance, 0.0, 1.0);
            const colsMat = makeBeltLikeMaterialFromSpec({
                material: columns?.material,
                baseColorHex,
                textureCache
            });
            const colsStyleId = columns?.material?.kind === 'texture' ? columns.material.id : null;
            const colsUrls = colsStyleId ? resolveBuildingStyleWallMaterialUrls(colsStyleId) : null;
            const colsTiling = columns?.tiling ?? null;
            if (colsStyleId) {
                const colsUvCfg = computeUvTilingParams({ tiling: colsTiling, urls: colsUrls, styleId: colsStyleId });
                if (colsUvCfg.apply) {
                    applyUvTilingToMeshStandardMaterial(colsMat, {
                        scaleU: colsUvCfg.scaleU,
                        scaleV: colsUvCfg.scaleV,
                        offsetU: colsUvCfg.offsetU,
                        offsetV: colsUvCfg.offsetV,
                        rotationDegrees: colsUvCfg.rotationDegrees
                    });
                }
            }

            const windowOffset = clamp(winCfg?.offset, 0.0, 0.2);
            const cornerEps = clamp(winCfg?.cornerEps, 0.01, 2.0);

            const windowMat = winEnabled ? makeWindowMaterial({
                typeId: winTypeId,
                params: winParams,
                windowWidth: winWidth,
                windowHeight: winDesiredHeight,
                fakeDepth: winFakeDepth,
                pbr: winPbr
            }) : null;

            const reflectiveCfg = winVisualsOverride ? resolveBuildingWindowReflectiveConfig(winVisualsOverride) : baseReflectiveCfg;
            const glassLift = reflectiveCfg.layerOffset;
            const glassIsOverride = baseVisualsOverride || !!winVisualsOverride;
            const windowGlassMat = (winEnabled && windowMat) ? makeGlassMaterial(getWindowGlassMaskTexture({
                typeId: winTypeId,
                params: winParams,
                windowWidth: winWidth,
                windowHeight: winDesiredHeight
            }), reflectiveCfg, { isOverride: glassIsOverride }) : null;

            const windowRuns = [];
            if (winEnabled && windowMat && wallOuterFacade.length) {
                for (const loop of wallOuterFacade) {
                    if (!loop || loop.length < 2) continue;
                    const runs = buildExteriorRunsFromLoop(loop);
                    for (const run of runs) {
                        const a = run?.a ?? null;
                        const dir = run?.dir ?? null;
                        const L = Number(run?.length) || 0;
                        if (!a || !dir || !(L > EPS)) continue;
                        if (!(L > winWidth + cornerEps * 2)) continue;

                        const tx = dir.x;
                        const tz = dir.z;
                        const nx = tz;
                        const nz = -tx;
                        const yaw = Math.atan2(nx, nz);

                        const placement = computeWindowSegmentsWithSpacers({
                            length: L,
                            windowWidth: winWidth,
                            desiredGap: winSpacing,
                            cornerEps,
                            spacerEnabled: colsEnabled,
                            spacerEvery: colsEvery,
                            spacerWidth: colsWidth
                        });

                        windowRuns.push({
                            a,
                            tx,
                            tz,
                            nx,
                            nz,
                            yaw,
                            length: L,
                            segments: placement?.segments ?? [],
                            spacerCenters: placement?.spacerCenters ?? []
                        });
                    }
                }
            }

            const hadSolidMeshesBeforeLayer = solidMeshes.length;
            const layerStartY = yCursor;
            const continuousWalls = true;

            if (continuousWalls) {
                let totalWallHeight = 0.0;
                let pendingExtra = firstFloorPendingExtra;
                for (let floor = 0; floor < floors; floor++) {
                    const segHeight = floorHeight + (floor === 0 ? pendingExtra : 0);
                    if (floor === 0) pendingExtra = 0;
                    totalWallHeight += segHeight;
                    if (beltEnabled && beltHeight > EPS) totalWallHeight += beltHeight;
                }

                if (totalWallHeight > EPS) {
                    for (const outerLoop of wallOuterFacade) {
                        if (!outerLoop || outerLoop.length < 3) continue;
                        const shape = buildShapeFromLoops({ outerLoop, holeLoops: wallHoles });
                        let geo = new THREE.ExtrudeGeometry(shape, {
                            depth: totalWallHeight,
                            bevelEnabled: false,
                            steps: 1
                        });
                        geo.rotateX(-Math.PI / 2);
                        applyUvYContinuityOffsetToGeometry(geo, { yOffset: layerStartY - baseY, materialIndex: 1 });
                        applyMatVarCornerDistanceToGeometry(geo, { loops: [outerLoop, ...wallHoles] });
                        if (geo.index) geo = geo.toNonIndexed();
                        geo.computeVertexNormals();

                        const roofMat = roofMatTemplate.clone();
                        const mesh = new THREE.Mesh(geo, [roofMat, wallMat]);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.position.y = layerStartY;
                        solidMeshes.push(mesh);

                        if (showWire) {
                            const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                            appendWirePositions(wirePositions, edgeGeo, layerStartY);
                            edgeGeo.dispose();
                        }
                    }

                    if (wantsFacadeSilhouette && facadeBounds && Array.isArray(facadeStrips) && facadeStrips.length) {
                        const materialKey = (spec) => {
                            const m = spec && typeof spec === 'object' ? spec : null;
                            const kind = m?.kind;
                            const id = typeof m?.id === 'string' ? m.id : '';
                            return (kind === 'texture' || kind === 'color') && id ? `${kind}:${id}` : '';
                        };
                        const configKey = ({ materialSpec = null, wallBase = null, tiling = null, materialVariation = null } = {}) => JSON.stringify({
                            material: materialSpec && typeof materialSpec === 'object' ? { kind: materialSpec.kind, id: materialSpec.id } : null,
                            wallBase: wallBase && typeof wallBase === 'object' ? wallBase : null,
                            tiling: tiling && typeof tiling === 'object' ? tiling : null,
                            materialVariation: materialVariation && typeof materialVariation === 'object' ? materialVariation : null
                        });

                        const baseKey = configKey({
                            materialSpec: layer.material,
                            wallBase: layer?.wallBase ?? null,
                            tiling: wallTiling ?? null,
                            materialVariation: wallMatVar ?? null
                        });

                        const faceMaterials = layer?.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
                        const links = layer?.faceLinking?.links && typeof layer.faceLinking.links === 'object' ? layer.faceLinking.links : null;
                        const resolveMasterFaceId = (faceId) => {
                            const seen = new Set();
                            let cur = faceId;
                            for (let i = 0; i < 8; i++) {
                                if (seen.has(cur)) break;
                                seen.add(cur);
                                const next = links?.[cur] ?? null;
                                if (next === null || next === undefined) return cur;
                                if (next === cur) return cur;
                                cur = next;
                            }
                            return faceId;
                        };

                        const cache = new Map();
                        const getFacadeMaterial = ({ materialSpec = null, wallBase = null, tiling = null, materialVariation = null } = {}) => {
                            const specKey = materialKey(materialSpec);
                            if (!specKey) return null;
                            const key = configKey({ materialSpec, wallBase, tiling, materialVariation });
                            const existing = cache.get(key) ?? null;
                            if (existing) return existing;

                            const mat = makeWallMaterialFromSpec({
                                material: materialSpec,
                                baseColorHex,
                                textureCache,
                                wallBase
                            });

                            const styleId = materialSpec?.kind === 'texture' ? materialSpec.id : null;
                            if (styleId) {
                                const urls = resolveBuildingStyleWallMaterialUrls(styleId);
                                const uvCfg = computeUvTilingParams({ tiling, urls, styleId });
                                if (uvCfg.apply) {
                                    applyUvTilingToMeshStandardMaterial(mat, {
                                        scaleU: uvCfg.scaleU,
                                        scaleV: uvCfg.scaleV,
                                        offsetU: uvCfg.offsetU,
                                        offsetV: uvCfg.offsetV,
                                        rotationDegrees: uvCfg.rotationDegrees
                                    });
                                }
                            }

                            if (materialVariation?.enabled) {
                                applyMaterialVariationToMeshStandardMaterial(mat, {
                                    seed: matVarSeed,
                                    seedOffset: clampInt(materialVariation?.seedOffset ?? 0, -9999, 9999),
                                    heightMin: baseY,
                                    heightMax: matVarHeightMax,
                                    config: materialVariation,
                                    root: MATERIAL_VARIATION_ROOT.WALL,
                                    cornerDist: true
                                });
                            }

                            cache.set(key, mat);
                            return mat;
                        };

                        const { minX, maxX, minZ, maxZ } = facadeBounds;
                        const yOffset = layerStartY - baseY;
                        const lift = 0.0;
                        let didOffsetWallMatForFacadeStrips = false;

                        const normalizeTextureFlow = (value) => {
                            const typed = typeof value === 'string' ? value : '';
                            if (typed === 'repeats' || typed === 'overflow_left' || typed === 'overflow_right') return typed;
                            return 'restart';
                        };

                        let prevFaceIdForUv = null;
                        let prevIsBayForUv = false;
                        let prevMaterialKeyForUv = '';
                        let prevTextureFlowForUv = 'restart';
                        let prevSourceBayIdForUv = '';
                        let prevUvStartForUv = 0;
                        let prevWidthForUv = 0;

                        for (const strip of facadeStrips) {
                            const faceId = strip?.faceId;
                            if (faceId !== 'A' && faceId !== 'B' && faceId !== 'C' && faceId !== 'D') continue;
                            const masterFaceId = faceId ? resolveMasterFaceId(faceId) : null;
                            const faceCfg = masterFaceId && faceMaterials?.[masterFaceId] && typeof faceMaterials[masterFaceId] === 'object'
                                ? faceMaterials[masterFaceId]
                                : null;

                            const faceWallBase = faceCfg?.wallBase && typeof faceCfg.wallBase === 'object' ? faceCfg.wallBase : (layer?.wallBase ?? null);
                            const faceTiling = faceCfg?.tiling && typeof faceCfg.tiling === 'object' ? faceCfg.tiling : wallTiling;
                            const faceMaterialVariation = faceCfg?.materialVariation && typeof faceCfg.materialVariation === 'object'
                                ? faceCfg.materialVariation
                                : wallMatVar;

                            const resolvedSpec = strip?.material ?? null;
                            const stripType = typeof strip?.type === 'string' ? strip.type : '';
                            const isBayStrip = stripType === 'bay';
                            const bayWallBase = isBayStrip && strip?.wallBase && typeof strip.wallBase === 'object' ? strip.wallBase : null;
                            const bayTiling = isBayStrip && strip?.tiling && typeof strip.tiling === 'object' ? strip.tiling : null;
                            const bayMaterialVariation = isBayStrip && strip?.materialVariation && typeof strip.materialVariation === 'object' ? strip.materialVariation : null;
                            const wallBase = bayWallBase ?? faceWallBase;
                            const tiling = bayTiling ?? faceTiling;
                            const materialVariation = bayMaterialVariation ?? faceMaterialVariation;
                            const key = configKey({ materialSpec: resolvedSpec, wallBase, tiling, materialVariation });
                            const u0 = Number(strip?.frontU0) || 0;
                            const u1 = Number(strip?.frontU1) || 0;
                            const w = Math.max(0, u1 - u0);
                            const depthFallback = Number(strip?.depth) || 0;
                            const depth0Raw = Number(strip?.depth0);
                            const depth1Raw = Number(strip?.depth1);
                            const depth0 = Number.isFinite(depth0Raw) ? depth0Raw : depthFallback;
                            const depth1 = Number.isFinite(depth1Raw) ? depth1Raw : depthFallback;

                            if (faceId !== prevFaceIdForUv) {
                                prevFaceIdForUv = faceId ?? null;
                                prevIsBayForUv = false;
                                prevMaterialKeyForUv = '';
                                prevTextureFlowForUv = 'restart';
                                prevSourceBayIdForUv = '';
                                prevUvStartForUv = 0;
                                prevWidthForUv = 0;
                            }

                            const textureFlow = isBayStrip ? normalizeTextureFlow(strip?.textureFlow ?? null) : 'restart';
                            const sourceBayId = isBayStrip && typeof strip?.sourceBayId === 'string' ? strip.sourceBayId : '';
                            const matKey = materialKey(resolvedSpec);

                            const sameMaterial = !!matKey && prevMaterialKeyForUv === matKey;
                            const repeats = sameMaterial
                                && prevIsBayForUv
                                && isBayStrip
                                && prevTextureFlowForUv === 'repeats'
                                && !!prevSourceBayIdForUv
                                && prevSourceBayIdForUv === sourceBayId;
                            const overflow = sameMaterial
                                && prevIsBayForUv
                                && isBayStrip
                                && (prevTextureFlowForUv === 'overflow_right' || textureFlow === 'overflow_left');

                            const continueOffset = (faceId === 'B' || faceId === 'D') ? -w : prevWidthForUv;
                            const uvStart = (repeats || overflow) ? (prevUvStartForUv + continueOffset) : 0;

                            const shouldRender = !!matKey && key !== baseKey && w > 1e-5;

                            if (shouldRender) {
                                const mat = getFacadeMaterial({ materialSpec: resolvedSpec, wallBase, tiling, materialVariation });
                                if (mat) {
                                    if (!didOffsetWallMatForFacadeStrips && wallMat) {
                                        didOffsetWallMatForFacadeStrips = true;
                                        wallMat.polygonOffset = true;
                                        wallMat.polygonOffsetFactor = 1;
                                        wallMat.polygonOffsetUnits = 1;
                                        wallMat.needsUpdate = true;
                                    }

                                    const base0 = pointOnRectFacade({ faceId, minX, maxX, minZ, maxZ, u: u0, depth: depth0 + lift });
                                    const base1 = pointOnRectFacade({ faceId, minX, maxX, minZ, maxZ, u: u1, depth: depth1 + lift });

                                    const geo = new THREE.BufferGeometry();
                                    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
                                        base0.x, layerStartY, base0.z,
                                        base1.x, layerStartY, base1.z,
                                        base1.x, layerStartY + totalWallHeight, base1.z,
                                        base0.x, layerStartY + totalWallHeight, base0.z
                                    ]), 3));

                                    const uvAtU0 = (faceId === 'B' || faceId === 'D') ? (uvStart + w) : uvStart;
                                    const uvAtU1 = (faceId === 'B' || faceId === 'D') ? uvStart : (uvStart + w);
                                    const v0 = yOffset;
                                    const v1 = yOffset + totalWallHeight;
                                    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
                                        uvAtU0, v0,
                                        uvAtU1, v0,
                                        uvAtU1, v1,
                                        uvAtU0, v1
                                    ]), 2));
                                    geo.setIndex([0, 1, 2, 0, 2, 3]);
                                    geo.computeVertexNormals();

                                    const mesh = new THREE.Mesh(geo, mat);
                                    mesh.castShadow = true;
                                    mesh.receiveShadow = true;
                                    mesh.userData = mesh.userData ?? {};
                                    mesh.userData.buildingFacadeFaceId = faceId;
                                    mesh.userData.buildingFacadeItemId = strip?.id ?? null;
                                    solidMeshes.push(mesh);

                                    if (showWire) {
                                        mesh.updateMatrix();
                                        const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                                        appendWirePositionsTransformed(wirePositions, edgeGeo, mesh.matrix);
                                        edgeGeo.dispose();
                                    }
                                }
                            }

                            prevIsBayForUv = isBayStrip;
                            prevMaterialKeyForUv = matKey;
                            prevTextureFlowForUv = textureFlow;
                            prevSourceBayIdForUv = sourceBayId;
                            prevUvStartForUv = uvStart;
                            prevWidthForUv = w;
                        }
                    }

                    const usingFacadeStrips = wantsFacadeSilhouette && facadeBounds && Array.isArray(facadeStrips) && facadeStrips.length;
                    const faceMaterials = layer?.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
                    if (faceMaterials && !usingFacadeStrips) {
                        const mainLoop = wallOuterFacade[0] ?? null;
                        const bounds = mainLoop ? computeLoopBoundsXZ(mainLoop) : null;
                        if (bounds && isRectLikeLoopXZ(mainLoop, bounds)) {
                            const { minX, maxX, minZ, maxZ } = bounds;
                            const faceLengthX = maxX - minX;
                            const faceLengthZ = maxZ - minZ;

                            const baseKey = JSON.stringify({
                                material: layer?.material ?? null,
                                wallBase: layer?.wallBase ?? null,
                                tiling: wallTiling ?? null,
                                materialVariation: wallMatVar ?? null
                            });

                            const links = layer?.faceLinking?.links && typeof layer.faceLinking.links === 'object' ? layer.faceLinking.links : null;
                            const resolveMasterFaceId = (faceId) => {
                                const seen = new Set();
                                let cur = faceId;
                                for (let i = 0; i < 8; i++) {
                                    if (seen.has(cur)) break;
                                    seen.add(cur);
                                    const next = links?.[cur] ?? null;
                                    if (next === null || next === undefined) return cur;
                                    if (next === cur) return cur;
                                    cur = next;
                                }
                                return faceId;
                            };

                            const cache = new Map();
                            const getFaceMaterial = (cfgKey, faceCfg) => {
                                const existing = cache.get(cfgKey) ?? null;
                                if (existing) return existing;

                                const mat = makeWallMaterialFromSpec({
                                    material: faceCfg?.material ?? null,
                                    baseColorHex,
                                    textureCache,
                                    wallBase: faceCfg?.wallBase ?? null
                                });

                                const styleId = faceCfg?.material?.kind === 'texture' ? faceCfg.material.id : null;
                                if (styleId) {
                                    const urls = resolveBuildingStyleWallMaterialUrls(styleId);
                                    const uvCfg = computeUvTilingParams({ tiling: faceCfg?.tiling ?? null, urls, styleId });
                                    if (uvCfg.apply) {
                                        applyUvTilingToMeshStandardMaterial(mat, {
                                            scaleU: uvCfg.scaleU,
                                            scaleV: uvCfg.scaleV,
                                            offsetU: uvCfg.offsetU,
                                            offsetV: uvCfg.offsetV,
                                            rotationDegrees: uvCfg.rotationDegrees
                                        });
                                    }
                                }

                                const faceMatVar = faceCfg?.materialVariation ?? null;
                                if (faceMatVar?.enabled) {
                                    applyMaterialVariationToMeshStandardMaterial(mat, {
                                        seed: matVarSeed,
                                        seedOffset: clampInt(faceMatVar?.seedOffset ?? 0, -9999, 9999),
                                        heightMin: baseY,
                                        heightMax: matVarHeightMax,
                                        config: faceMatVar,
                                        root: MATERIAL_VARIATION_ROOT.WALL,
                                        cornerDist: true
                                    });
                                }

                                cache.set(cfgKey, mat);
                                return mat;
                            };

                            const yCenter = layerStartY + totalWallHeight * 0.5;
                            const yOffset = layerStartY - baseY;
                            const lift = 0.0;
                            let didOffsetWallMatForFacePlanes = false;
                            const faceIds = ['A', 'B', 'C', 'D'];

                            for (const faceId of faceIds) {
                                const masterFaceId = resolveMasterFaceId(faceId);
                                const faceCfg = faceMaterials?.[masterFaceId] ?? null;
                                if (!faceCfg || typeof faceCfg !== 'object') continue;

                                const cfgKey = JSON.stringify({
                                    material: faceCfg?.material ?? null,
                                    wallBase: faceCfg?.wallBase ?? null,
                                    tiling: faceCfg?.tiling ?? null,
                                    materialVariation: faceCfg?.materialVariation ?? null
                                });
                                if (cfgKey === baseKey) continue;

                                const w = (faceId === 'A' || faceId === 'C') ? faceLengthX : faceLengthZ;
                                if (!(w > EPS)) continue;

                                let cx = 0;
                                let cz = 0;
                                let yaw = 0;
                                if (faceId === 'A') {
                                    cx = minX + w * 0.5;
                                    cz = maxZ + lift;
                                    yaw = 0;
                                } else if (faceId === 'B') {
                                    cx = maxX + lift;
                                    cz = maxZ - w * 0.5;
                                    yaw = -Math.PI / 2;
                                } else if (faceId === 'C') {
                                    cx = maxX - w * 0.5;
                                    cz = minZ - lift;
                                    yaw = Math.PI;
                                } else if (faceId === 'D') {
                                    cx = minX - lift;
                                    cz = minZ + w * 0.5;
                                    yaw = Math.PI / 2;
                                } else continue;

                                const mat = getFaceMaterial(cfgKey, faceCfg);
                                if (!mat) continue;
                                if (!didOffsetWallMatForFacePlanes && wallMat) {
                                    didOffsetWallMatForFacePlanes = true;
                                    wallMat.polygonOffset = true;
                                    wallMat.polygonOffsetFactor = 1;
                                    wallMat.polygonOffsetUnits = 1;
                                    wallMat.needsUpdate = true;
                                }

                                const geo = new THREE.PlaneGeometry(w, totalWallHeight);
                                const uv = geo.getAttribute('uv');
                                if (uv?.getX && uv?.getY && uv?.setX && uv?.setY) {
                                    for (let i = 0; i < uv.count; i++) {
                                        uv.setX(i, uv.getX(i) * w);
                                        uv.setY(i, uv.getY(i) * totalWallHeight + yOffset);
                                    }
                                    uv.needsUpdate = true;
                                }
                                geo.computeVertexNormals();

                                const mesh = new THREE.Mesh(geo, mat);
                                mesh.position.set(cx, yCenter, cz);
                                mesh.rotation.set(0, yaw, 0);
                                mesh.castShadow = true;
                                mesh.receiveShadow = true;
                                mesh.userData = mesh.userData ?? {};
                                mesh.userData.buildingFaceId = faceId;
                                solidMeshes.push(mesh);

                                if (showWire) {
                                    mesh.updateMatrix();
                                    const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                                    appendWirePositionsTransformed(wirePositions, edgeGeo, mesh.matrix);
                                    edgeGeo.dispose();
                                }
                            }
                        }
                    }
                }
            }

            for (let floor = 0; floor < floors; floor++) {
                if (showFloors && (hadSolidMeshesBeforeLayer || floor > 0 || Math.abs(yCursor - baseY) > EPS)) {
                    appendLoopLinePositions(floorPositions, planLoops, yCursor);
                }

                const floorExtra = firstFloorPendingExtra;
                const segHeight = floorHeight + (floor === 0 ? floorExtra : 0);
                if (floor === 0) firstFloorPendingExtra = 0;

                if (!continuousWalls) {
                    for (const outerLoop of wallOuter) {
                        if (!outerLoop || outerLoop.length < 3) continue;
                        const shape = buildShapeFromLoops({ outerLoop, holeLoops: wallHoles });
                        let geo = new THREE.ExtrudeGeometry(shape, {
                            depth: segHeight,
                            bevelEnabled: false,
                            steps: 1
                        });
                        geo.rotateX(-Math.PI / 2);
                        applyUvYContinuityOffsetToGeometry(geo, { yOffset: yCursor - baseY, materialIndex: 1 });
                        applyMatVarCornerDistanceToGeometry(geo, { loops: [outerLoop, ...wallHoles] });
                        if (geo.index) geo = geo.toNonIndexed();
                        geo.computeVertexNormals();

                        const roofMat = roofMatTemplate.clone();
                        const mesh = new THREE.Mesh(geo, [roofMat, wallMat]);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.position.y = yCursor;
                        solidMeshes.push(mesh);

                        if (showWire) {
                            const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                            appendWirePositions(wirePositions, edgeGeo, yCursor);
                            edgeGeo.dispose();
                        }
                    }
                }

                if (winEnabled && windowMat && windowRuns.length) {
                    const windowHeight = Math.min(winDesiredHeight, Math.max(0.3, segHeight * 0.95));
                    const windowYOffset = Math.min(winSill, Math.max(0, segHeight - windowHeight));
                    const y = yCursor + windowYOffset + windowHeight * 0.5;

                    for (const run of windowRuns) {
                        const runLength = Number(run?.length) || 0;
                        if (!(runLength > EPS)) continue;
                        const a = run.a;
                        const tx = run.tx;
                        const tz = run.tz;
                        const nx = run.nx;
                        const nz = run.nz;
                        const yaw = run.yaw;

                        for (const seg of run.segments ?? []) {
                            const segOffset = Number(seg?.offset) || 0;
                            const starts = seg?.layout?.starts ?? [];
                            for (const start of starts) {
                                const leftDist = segOffset + start;
                                const rightDist = leftDist + winWidth;
                                if (leftDist < cornerEps - 1e-6 || rightDist > runLength - cornerEps + 1e-6) continue;
                                const centerDist = segOffset + start + winWidth * 0.5;
                                const cx = a.x + tx * centerDist + nx * windowOffset;
                                const cz = a.z + tz * centerDist + nz * windowOffset;

                                const geo = getPlaneGeometry(winWidth, windowHeight);
                                addWindowInstance({ geometry: geo, material: windowMat, x: cx, y, z: cz, yaw, renderOrder: 0 });

                                if (windowGlassMat) {
                                    addWindowInstance({
                                        geometry: geo,
                                        material: windowGlassMat,
                                        x: cx + nx * glassLift,
                                        y,
                                        z: cz + nz * glassLift,
                                        yaw,
                                        renderOrder: 1
                                    });
                                }
                            }
                        }
                    }
                }

                yCursor += segHeight;

                if (beltEnabled && beltHeight > EPS) {
                    for (const outerLoop of beltOuter) {
                        if (!outerLoop || outerLoop.length < 3) continue;
                        const shape = buildShapeFromLoops({ outerLoop, holeLoops: beltHoles });
                        const geo = new THREE.ExtrudeGeometry(shape, {
                            depth: beltHeight,
                            bevelEnabled: false,
                            steps: 1
                        });
                        geo.rotateX(-Math.PI / 2);
                        geo.computeVertexNormals();

                        const mesh = new THREE.Mesh(geo, beltMat);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.position.y = yCursor;
                        beltsGroup.add(mesh);

                        if (showWire) {
                            const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                            appendWirePositions(wirePositions, edgeGeo, yCursor);
                            edgeGeo.dispose();
                        }
                    }

                    yCursor += beltHeight;
                }
            }

            const layerEndY = yCursor;
            if (colsExtrude && colsExtrudeDistance > EPS && colsWidth > EPS && windowRuns.length && layerEndY - layerStartY > EPS) {
                const bandY = (layerStartY + layerEndY) * 0.5;
                const bandHeight = Math.max(0.1, layerEndY - layerStartY);
                const bandOffset = windowOffset + colsExtrudeDistance * 0.5;
                const bandHalfWidth = colsWidth * 0.5;

                for (const run of windowRuns) {
                    if (!Array.isArray(run.spacerCenters) || !run.spacerCenters.length) continue;
                    const runLength = Number(run?.length) || 0;
                    if (!(runLength > EPS)) continue;
                    const a = run.a;
                    const tx = run.tx;
                    const tz = run.tz;
                    const nx = run.nx;
                    const nz = run.nz;
                    const yaw = run.yaw;

                    for (const centerDist of run.spacerCenters) {
                        if (centerDist - bandHalfWidth < cornerEps - 1e-6 || centerDist + bandHalfWidth > runLength - cornerEps + 1e-6) continue;
                        const cx = a.x + tx * centerDist + nx * bandOffset;
                        const cz = a.z + tz * centerDist + nz * bandOffset;
                        const geo = new THREE.BoxGeometry(colsWidth, bandHeight, colsExtrudeDistance);
                        const mesh = new THREE.Mesh(geo, colsMat);
                        mesh.position.set(cx, bandY, cz);
                        mesh.rotation.set(0, yaw, 0);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        windowsGroup.add(mesh);
                    }
                }
            }

            currentLoops = planLoops.length ? planLoops : currentLoops;
            continue;
        }

        if (type === LAYER_TYPE.ROOF) {
            const roofCfg = layer.roof ?? {};
            const roofMat = makeRoofSurfaceMaterialFromSpec({
                material: roofCfg.material,
                baseColorHex,
                textureCache
            });
            const roofStyleId = roofCfg.material?.kind === 'texture' ? roofCfg.material.id : null;
            const roofUrls = roofStyleId ? resolveBuildingStyleWallMaterialUrls(roofStyleId) : null;
            const roofTiling = roofCfg?.tiling ?? null;
            const roofUvCfg = computeUvTilingParams({ tiling: roofTiling, urls: roofUrls, styleId: roofStyleId });
            if (roofUvCfg.apply) {
                applyUvTilingToMeshStandardMaterial(roofMat, {
                    scaleU: roofUvCfg.scaleU,
                    scaleV: roofUvCfg.scaleV,
                    offsetU: roofUvCfg.offsetU,
                    offsetV: roofUvCfg.offsetV,
                    rotationDegrees: roofUvCfg.rotationDegrees
                });
            }

            const roofMatVar = roofCfg?.materialVariation ?? null;
            if (roofMatVar?.enabled) {
                applyMaterialVariationToMeshStandardMaterial(roofMat, {
                    seed: matVarSeed,
                    seedOffset: clampInt(roofMatVar?.seedOffset ?? 0, -9999, 9999),
                    heightMin: baseY,
                    heightMax: matVarHeightMax,
                    config: roofMatVar,
                    root: MATERIAL_VARIATION_ROOT.SURFACE
                });
            }

            const { outer: roofWallOuter, holes: roofWallHoles } = applyWallInset({ loops: currentLoops, inset: wallInset });

            let roofOuter = roofWallOuter;
            let roofHoles = roofWallHoles;
            const roofSourceLayerId = typeof lastFloorLayer?.id === 'string' ? lastFloorLayer.id : '';
            const roofFacadeSpec = globalFacadeSpec
                ? globalFacadeSpec
                : ((roofSourceLayerId && facadesByLayerId?.[roofSourceLayerId] && typeof facadesByLayerId[roofSourceLayerId] === 'object')
                    ? facadesByLayerId[roofSourceLayerId]
                    : null);
            const wantsRoofFacadeSilhouette = !!roofFacadeSpec && ['A', 'B', 'C', 'D'].some((id) => !!roofFacadeSpec?.[id]);

            if (wantsRoofFacadeSilhouette && roofWallOuter.length) {
                const main = roofWallOuter[0] ?? null;
                const bounds = main ? computeLoopBoundsXZ(main) : null;
                if (bounds && isRectLikeLoopXZ(main, bounds)) {
                    const faceLengthX = bounds.maxX - bounds.minX;
                    const faceLengthZ = bounds.maxZ - bounds.minZ;

                    const links = lastFloorLayer?.faceLinking?.links && typeof lastFloorLayer.faceLinking.links === 'object'
                        ? lastFloorLayer.faceLinking.links
                        : null;
                    const resolveMasterFaceId = (faceId) => {
                        const seen = new Set();
                        let cur = faceId;
                        for (let i = 0; i < 8; i++) {
                            if (seen.has(cur)) break;
                            seen.add(cur);
                            const next = links?.[cur] ?? null;
                            if (next === null || next === undefined) return cur;
                            if (next === cur) return cur;
                            cur = next;
                        }
                        return faceId;
                    };

                    const next = {};
                    for (const faceId of ['A', 'B', 'C', 'D']) {
                        const masterFaceId = resolveMasterFaceId(faceId);
                        const srcFacade = (roofFacadeSpec?.[masterFaceId] && typeof roofFacadeSpec[masterFaceId] === 'object')
                            ? roofFacadeSpec[masterFaceId]
                            : null;
                        if (!srcFacade) continue;

                        const srcLayout = srcFacade?.layout && typeof srcFacade.layout === 'object' ? srcFacade.layout : null;
                        const len = (faceId === 'A' || faceId === 'C') ? faceLengthX : faceLengthZ;

                        const bays = Array.isArray(srcLayout?.bays?.items) ? srcLayout.bays.items : null;
                        const groups = Array.isArray(srcLayout?.groups?.items) ? srcLayout.groups.items : null;
                        const hasBays = !!bays && bays.length > 0;
                        const bayItems = hasBays ? solveFacadeBaysLayout({ bays, groups, faceLengthMeters: len, warnings }) : null;

                        let solvedPatternItems = null;
                        if (!hasBays) {
                            const pattern = srcLayout?.pattern ?? null;
                            if (pattern && typeof pattern === 'object') {
                                const topology = facadePatternTopologyByFaceId.get(masterFaceId) ?? null;
                                const solved = solveFacadeLayoutFillPattern({
                                    pattern,
                                    faceLengthMeters: len,
                                    topology: globalFacadeSpec ? topology : null,
                                    warnings
                                });
                                solvedPatternItems = Array.isArray(solved?.items) ? solved.items : null;
                            }
                        }

                        const base = { ...srcFacade };
                        const layout = (base.layout && typeof base.layout === 'object') ? { ...base.layout } : {};
                        if (Array.isArray(bayItems)) layout.items = bayItems;
                        else if (Array.isArray(solvedPatternItems)) layout.items = solvedPatternItems;
                        base.layout = layout;

                        next[faceId] = base;
                    }

                    const res = computeRectFacadeSilhouette({
                        wallOuter: roofWallOuter,
                        facades: next,
                        layerMaterial: null,
                        warnings,
                        cornerStrategy: resolvedCornerStrategy
                    });
                    if (res?.loop?.length) {
                        roofOuter = [res.loop];
                    } else {
                        warnings.push('Roof silhouette: falling back to inset wall loop.');
                    }
                }
            }

            for (const outerLoop of roofOuter) {
                if (!outerLoop || outerLoop.length < 3) continue;
                const shape = buildShapeFromLoops({ outerLoop, holeLoops: roofHoles });
                const geo = new THREE.ShapeGeometry(shape);
                geo.rotateX(-Math.PI / 2);
                geo.computeVertexNormals();

                const mesh = new THREE.Mesh(geo, roofMat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.position.y = yCursor + 0.002;
                solidMeshes.push(mesh);

                if (showWire) {
                    const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                    appendWirePositions(wirePositions, edgeGeo, mesh.position.y);
                    edgeGeo.dispose();
                }
            }

            const ring = layer.ring ?? {};
            const ringEnabled = !!ring.enabled;
            const outerRadius = clamp(ring.outerRadius, 0.0, 8.0);
            const innerRadius = clamp(ring.innerRadius, 0.0, 8.0);
            const ringHeight = ringEnabled ? clamp(ring.height, 0.02, 2.0) : 0.0;

            if (ringEnabled && ringHeight > EPS && (outerRadius > EPS || innerRadius > EPS)) {
                const ringMat = makeBeltLikeMaterialFromSpec({
                    material: ring?.material,
                    baseColorHex,
                    textureCache
                });
                const ringStyleId = ring?.material?.kind === 'texture' ? ring.material.id : null;
                const ringUrls = ringStyleId ? resolveBuildingStyleWallMaterialUrls(ringStyleId) : null;
                const ringTiling = ring?.tiling ?? null;
                if (ringStyleId) {
                    const ringUvCfg = computeUvTilingParams({ tiling: ringTiling, urls: ringUrls, styleId: ringStyleId });
                    if (ringUvCfg.apply) {
                        applyUvTilingToMeshStandardMaterial(ringMat, {
                            scaleU: ringUvCfg.scaleU,
                            scaleV: ringUvCfg.scaleV,
                            offsetU: ringUvCfg.offsetU,
                            offsetV: ringUvCfg.offsetV,
                            rotationDegrees: ringUvCfg.rotationDegrees
                        });
                    }
                }

                for (const outerLoop of roofOuter) {
                    if (!outerLoop || outerLoop.length < 3) continue;
                    const outerLoopExpanded = outerRadius > EPS ? offsetOrthogonalLoopXZ(outerLoop, -outerRadius) : outerLoop;
                    const innerLoopInset = innerRadius > EPS ? offsetOrthogonalLoopXZ(outerLoop, innerRadius) : outerLoop;

                    if (!outerLoopExpanded || !innerLoopInset || outerLoopExpanded.length < 3 || innerLoopInset.length < 3) continue;

                    const shape = buildShapeFromLoops({ outerLoop: outerLoopExpanded, holeLoops: [innerLoopInset] });
                    const geo = new THREE.ExtrudeGeometry(shape, {
                        depth: ringHeight,
                        bevelEnabled: false,
                        steps: 1
                    });
                    geo.rotateX(-Math.PI / 2);
                    geo.computeVertexNormals();

                    const mesh = new THREE.Mesh(geo, ringMat);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.position.y = yCursor;
                    roofRingGroup.add(mesh);

                    if (showWire) {
                        const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                        appendWirePositions(wirePositions, edgeGeo, yCursor);
                        edgeGeo.dispose();
                    }
                }
            }

            const nextLayer = safeLayers[layerIndex + 1] ?? null;
            const hasFloorsAboveRoof = nextLayer?.type === LAYER_TYPE.FLOOR;
            if (!hasFloorsAboveRoof) yCursor += ringHeight;
        }
    }

    const lastLayer = safeLayers[safeLayers.length - 1] ?? null;
    if (lastLayer?.type !== LAYER_TYPE.ROOF) {
        const topFloorLayer = [...safeLayers].reverse().find((layer) => layer?.type === LAYER_TYPE.FLOOR) ?? null;
        const roofMaterial = topFloorLayer?.material ?? null;
        const roofMat = makeRoofSurfaceMaterialFromSpec({
            material: roofMaterial,
            baseColorHex,
            textureCache
        });

        const { outer: roofOuter, holes: roofHoles } = applyWallInset({ loops: currentLoops, inset: wallInset });
        for (const outerLoop of roofOuter) {
            if (!outerLoop || outerLoop.length < 3) continue;
            const shape = buildShapeFromLoops({ outerLoop, holeLoops: roofHoles });
            const geo = new THREE.ShapeGeometry(shape);
            geo.rotateX(-Math.PI / 2);
            geo.computeVertexNormals();

            const mesh = new THREE.Mesh(geo, roofMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.position.y = yCursor + 0.002;
            solidMeshes.push(mesh);

            if (showWire) {
                const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                appendWirePositions(wirePositions, edgeGeo, mesh.position.y);
                edgeGeo.dispose();
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
                mesh.visible = bucket.material.userData.buildingWindowGlassEnabled !== false;
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
        wire.renderOrder = 120;
        wire.frustumCulled = false;
    }

    let plan = null;
    if (showPlan) {
        const planPositions = [];
        appendLoopLinePositions(planPositions, overlayLoops, planY);
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
        const borderPositions = [];
        appendLoopLinePositions(borderPositions, overlayLoops, planY + 0.02);
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
    if (showFloors && floorPositions.length) {
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

    return {
        baseColorHex,
        solidMeshes,
        warnings: warnings.length ? warnings.slice() : null,
        facadeSolverDebug: Object.keys(facadeSolverDebug).length ? facadeSolverDebug : null,
        facadeCornerDebug: facadeCornerDebugByLayerId && Object.keys(facadeCornerDebugByLayerId).length ? facadeCornerDebugByLayerId : null,
        wire,
        plan,
        border,
        floorDivisions,
        windows: windowsGroup.children.length ? windowsGroup : null,
        beltCourse: beltsGroup.children.length ? beltsGroup : null,
        topBelt: roofRingGroup.children.length ? roofRingGroup : null
    };
}
