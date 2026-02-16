// src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js
// Generates building fabrication meshes from layer definitions.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { ROOF_COLOR, resolveRoofColorHex } from '../../../../app/buildings/RoofColor.js';
import { resolveBeltCourseColorHex } from '../../../../app/buildings/BeltCourseColor.js';
import { BUILDING_STYLE } from '../../../../app/buildings/BuildingStyle.js';
import { sanitizeWindowMeshSettings } from '../../../../app/buildings/window_mesh/index.js';
import {
    WINDOW_TYPE,
    getDefaultWindowParams,
    getWindowGlassMaskTexture,
    getWindowNormalMapTexture,
    getWindowRoughnessMapTexture,
    getWindowTexture,
    isWindowTypeId
} from '../buildings/WindowTextureGenerator.js';
import { WindowMeshGenerator } from '../buildings/WindowMeshGenerator.js';
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

function deepClone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
    return out;
}

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

function rightNormal2(v) {
    return { x: v.z, z: -v.x };
}

function leftNormal2(v) {
    return { x: -v.z, z: v.x };
}

function intersectLines2(p, r, q, s) {
    const denom = cross2(r, s);
    if (Math.abs(denom) < 1e-9) return null;
    const qp = { x: q.x - p.x, z: q.z - p.z };
    const t = cross2(qp, s) / denom;
    const x = p.x + r.x * t;
    const z = p.z + r.z * t;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return { x, z };
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

function computeQuadFacadeFramesFromLoop(loop, { warnings = null, tol = 1e-4 } = {}) {
    const w = Array.isArray(warnings) ? warnings : null;
    const runs = buildExteriorRunsFromLoop(loop);
    if (runs.length !== 4) {
        if (w) w.push('Facade silhouette: footprint is not a simple 4-face loop (A–D).');
        return null;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of loop) {
        if (!p) continue;
        const x = Number(p.x);
        const z = Number(p.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
    }

    const hasBounds = Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ);
    if (hasBounds) {
        const classifyRun = (run) => {
            const a = run?.a ?? null;
            const b = run?.b ?? null;
            if (!a || !b) return null;
            const ax = Number(a.x);
            const az = Number(a.z);
            const bx = Number(b.x);
            const bz = Number(b.z);
            if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) return null;

            const isH = Math.abs(az - bz) <= tol && Math.abs(ax - bx) > tol;
            const isV = Math.abs(ax - bx) <= tol && Math.abs(az - bz) > tol;
            if (isH) {
                if (Math.abs(az - maxZ) <= tol && Math.abs(bz - maxZ) <= tol) return 'A';
                if (Math.abs(az - minZ) <= tol && Math.abs(bz - minZ) <= tol) return 'C';
            }
            if (isV) {
                if (Math.abs(ax - maxX) <= tol && Math.abs(bx - maxX) <= tol) return 'B';
                if (Math.abs(ax - minX) <= tol && Math.abs(bx - minX) <= tol) return 'D';
            }
            return null;
        };

        const runByFaceId = {};
        let mappingOk = true;
        for (const run of runs) {
            const faceId = classifyRun(run);
            if (!faceId || runByFaceId[faceId]) {
                mappingOk = false;
                break;
            }
            runByFaceId[faceId] = run;
        }

        if (mappingOk && runByFaceId.A && runByFaceId.B && runByFaceId.C && runByFaceId.D) {
            const faceIds = ['A', 'B', 'C', 'D'];
            const normals = Object.freeze({
                A: { x: 0, z: 1 },
                B: { x: 1, z: 0 },
                C: { x: 0, z: -1 },
                D: { x: -1, z: 0 }
            });

            const orientRun = (run, faceId) => {
                const a = run?.a ?? null;
                const b = run?.b ?? null;
                if (!a || !b) return null;
                switch (faceId) {
                    case 'A': return (a.x <= b.x) ? { a, b } : { a: b, b: a };
                    case 'B': return (a.z >= b.z) ? { a, b } : { a: b, b: a };
                    case 'C': return (a.x >= b.x) ? { a, b } : { a: b, b: a };
                    case 'D': return (a.z <= b.z) ? { a, b } : { a: b, b: a };
                    default: return null;
                }
            };

            const frames = {};
            for (let i = 0; i < 4; i++) {
                const faceId = faceIds[i];
                const run = runByFaceId[faceId];
                const L = Number(run?.length) || 0;
                if (!(L > EPS)) {
                    if (w) w.push(`Facade silhouette: face ${faceId} has invalid length.`);
                    return null;
                }

                const oriented = orientRun(run, faceId);
                if (!oriented) return null;
                const t = normalize2({ x: oriented.b.x - oriented.a.x, z: oriented.b.z - oriented.a.z });
                if (!(t.len > EPS)) {
                    if (w) w.push(`Facade silhouette: face ${faceId} has invalid tangent.`);
                    return null;
                }

                const n = normals[faceId];
                if (!n) return null;
                frames[faceId] = {
                    faceId,
                    start: { x: qf(oriented.a.x), z: qf(oriented.a.z) },
                    end: { x: qf(oriented.b.x), z: qf(oriented.b.z) },
                    t: { x: t.x, z: t.z },
                    n: { x: n.x, z: n.z },
                    length: L
                };
            }

            for (let i = 0; i < 4; i++) {
                const a = frames[faceIds[i]];
                const b = frames[faceIds[(i + 1) % 4]];
                if (!a || !b) return null;
                if (!pointsEqualXZ(a.end, b.start, tol) && w) w.push(`Facade silhouette: corner mismatch at ${faceIds[i]}→${faceIds[(i + 1) % 4]}.`);
            }

            return frames;
        }
    }

    const area = signedArea(loop);
    const isCcw = area >= 0;
    const frames = {};
    const faceIds = ['A', 'B', 'C', 'D'];

    for (let i = 0; i < 4; i++) {
        const run = runs[i];
        const faceId = faceIds[i];
        const L = Number(run?.length) || 0;
        if (!(L > EPS)) {
            if (w) w.push(`Facade silhouette: face ${faceId} has invalid length.`);
            return null;
        }

        const t = normalize2({ x: run.b.x - run.a.x, z: run.b.z - run.a.z });
        if (!(t.len > EPS)) {
            if (w) w.push(`Facade silhouette: face ${faceId} has invalid tangent.`);
            return null;
        }

        const n = isCcw ? rightNormal2(t) : leftNormal2(t);
        if (!(Math.abs(n.x) + Math.abs(n.z) > EPS)) {
            if (w) w.push(`Facade silhouette: face ${faceId} has invalid normal.`);
            return null;
        }

        frames[faceId] = {
            faceId,
            start: { x: qf(run.a.x), z: qf(run.a.z) },
            end: { x: qf(run.b.x), z: qf(run.b.z) },
            t: { x: t.x, z: t.z },
            n: { x: n.x, z: n.z },
            length: L
        };
    }

    for (let i = 0; i < 4; i++) {
        const a = frames[faceIds[i]];
        const b = frames[faceIds[(i + 1) % 4]];
        if (!a || !b) return null;
        if (!pointsEqualXZ(a.end, b.start, tol) && w) w.push(`Facade silhouette: corner mismatch at ${faceIds[i]}→${faceIds[(i + 1) % 4]}.`);
    }

    return frames;
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

function facadeStripSegmentKey(faceId, u0, depth0, u1, depth1) {
    const f = (n) => qf(Number(n) || 0);
    const aU = f(u0);
    const aD = f(depth0);
    const bU = f(u1);
    const bD = f(depth1);

    const ordered = (aU < bU) || (aU === bU && aD <= bD);
    const p0 = ordered ? { u: aU, d: aD } : { u: bU, d: bD };
    const p1 = ordered ? { u: bU, d: bD } : { u: aU, d: aD };
    return `${faceId}|${p0.u}|${p0.d}|${p1.u}|${p1.d}`;
}

function sortUniqueNumbers(values, { tol = 1e-5 } = {}) {
    const list = [];
    for (const v of values) {
        const num = Number(v);
        if (!Number.isFinite(num)) continue;
        list.push(num);
    }
    list.sort((a, b) => a - b);
    const out = [];
    for (const v of list) {
        if (!out.length || Math.abs(v - out[out.length - 1]) > tol) out.push(v);
    }
    return out;
}

function buildWallSidesGeometryFromLoopDetailXZ(loop, {
    height,
    uvBaseV = 0.0,
    minEdge = 1e-5,
    segmentOverrides = null,
    cutouts = null,
    ySlices = null,
    cutoutTol = 0.02,
    cutoutCurveSegments = 18
} = {}) {
    const pts = Array.isArray(loop) ? loop : [];
    const n = pts.length;
    const h = Number(height) || 0;
    if (n < 3 || !(h > EPS)) return null;

    const overrides = segmentOverrides instanceof Map ? segmentOverrides : null;
    const cutList = Array.isArray(cutouts) ? cutouts.filter((entry) => entry && typeof entry === 'object') : null;
    const cutTol = clamp(cutoutTol, 1e-4, 0.5);
    const curveSegments = clampInt(cutoutCurveSegments, 6, 64);
    const rawYSlices = Array.isArray(ySlices) ? ySlices : null;
    const cutoutsByFaceId = (() => {
        if (!cutList?.length) return null;
        const map = new Map();
        for (const entry of cutList) {
            const faceId = typeof entry?.faceId === 'string' ? entry.faceId : '';
            if (faceId !== 'A' && faceId !== 'B' && faceId !== 'C' && faceId !== 'D') continue;
            const x = Number(entry?.x);
            const y = Number(entry?.y);
            const z = Number(entry?.z);
            const width = Number(entry?.width);
            const height = Number(entry?.height);
            const wantsArch = !!entry?.wantsArch;
            const archRise = Number(entry?.archRise) || 0;
            const revealDepth = Math.max(0, Number(entry?.revealDepth) || 0);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
            if (!Number.isFinite(width) || !Number.isFinite(height) || !(width > EPS) || !(height > EPS)) continue;
            const list = map.get(faceId);
            const item = { faceId, x, y, z, width, height, wantsArch, archRise: wantsArch ? archRise : 0.0, revealDepth };
            if (list) list.push(item);
            else map.set(faceId, [item]);
        }
        return map.size ? map : null;
    })();

    const normalizedYSlices = (() => {
        if (!rawYSlices?.length) return null;
        const tmp = [];
        for (const entry of rawYSlices) {
            const y0 = Number(entry?.y0);
            const y1 = Number(entry?.y1);
            if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
            const a = clamp(Math.min(y0, y1), 0.0, h);
            const b = clamp(Math.max(y0, y1), 0.0, h);
            if (!(b - a > EPS)) continue;
            tmp.push({ y0: a, y1: b });
        }
        if (!tmp.length) return null;
        tmp.sort((a, b) => a.y0 - b.y0);

        const out = [];
        let cursor = 0.0;
        for (const slice of tmp) {
            if (slice.y1 <= cursor + EPS) continue;
            if (slice.y0 > cursor + EPS) out.push({ y0: cursor, y1: slice.y0 });
            out.push({ y0: Math.max(cursor, slice.y0), y1: slice.y1 });
            cursor = slice.y1;
            if (cursor >= h - EPS) break;
        }
        if (cursor < h - EPS) out.push({ y0: cursor, y1: h });
        return out.length ? out : null;
    })();

    const v0 = Number(uvBaseV) || 0;
    const v1 = v0 + h;
    const positions = [];
    const uvs = [];
    const groups = [];
    let uCursor = 0.0;

    let curGroupMatIndex = null;
    let curGroupStart = 0;
    let curGroupCount = 0;

    const flushGroup = () => {
        if (curGroupMatIndex === null) return;
        if (curGroupCount <= 0) return;
        groups.push({ start: curGroupStart, count: curGroupCount, materialIndex: curGroupMatIndex });
    };

    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (!a || !b) continue;

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const segLen = Math.hypot(dx, dz);
        if (!(segLen > minEdge)) continue;

        const baseU0 = uCursor;
        const baseU1 = uCursor + segLen;
        uCursor = baseU1;

        let matIndex = 0;
        let uAtA = baseU0;
        let uAtB = baseU1;

        const faceId = a.faceId;
        if (overrides && a.kind === 'profile' && b.kind === 'profile' && faceId && faceId === b.faceId) {
            const segKey = facadeStripSegmentKey(faceId, a.u, a.depth, b.u, b.depth);
            let ovr = overrides.get(segKey) ?? null;

            if (!ovr) {
                const ranges = overrides.get(`__ranges__:${faceId}`) ?? null;
                if (Array.isArray(ranges)) {
                    const uA = Number(a.u) || 0;
                    const uB = Number(b.u) || 0;
                    const uMin = Math.min(uA, uB);
                    const uMax = Math.max(uA, uB);
                    const tol = 1e-4;
                    if (Math.abs(uB - uA) > tol) {
                        for (const r of ranges) {
                            if (!r || typeof r !== 'object') continue;
                            const ru0 = Number(r.u0) || 0;
                            const ru1 = Number(r.u1) || 0;
                            const rMin = Math.min(ru0, ru1);
                            const rMax = Math.max(ru0, ru1);
                            if (uMin + tol < rMin) continue;
                            if (uMax - tol > rMax) continue;
                            ovr = r;
                            break;
                        }
                    }
                }
            }

            if (ovr) {
                matIndex = clampInt(ovr.materialIndex, 0, 9999);
                const u0 = Number(ovr.u0) || 0;
                const u1 = Number(ovr.u1) || 0;
                const uvStart = Number(ovr.uvStart) || 0;
                const uA = Number(a.u) || 0;
                const uB = Number(b.u) || 0;
                if (faceId === 'B' || faceId === 'D') {
                    uAtA = uvStart + (u1 - uA);
                    uAtB = uvStart + (u1 - uB);
                } else {
                    uAtA = uvStart + (uA - u0);
                    uAtB = uvStart + (uB - u0);
                }
            }
        }

        if (curGroupMatIndex === null) {
            curGroupMatIndex = matIndex;
            curGroupStart = Math.floor(positions.length / 3);
            curGroupCount = 0;
        } else if (matIndex !== curGroupMatIndex) {
            flushGroup();
            curGroupMatIndex = matIndex;
            curGroupStart = Math.floor(positions.length / 3);
            curGroupCount = 0;
        }

        const slices = normalizedYSlices ?? null;
        const wantsYCutlines = !!slices;

        const segCuts = [];
        const wantsSegmentCutouts = !!cutoutsByFaceId && a.kind === 'profile' && b.kind === 'profile' && faceId && faceId === b.faceId;
        if (wantsSegmentCutouts) {
            const cuts = cutoutsByFaceId.get(faceId) ?? null;
            if (cuts?.length) {
                const tx = dx / segLen;
                const tz = dz / segLen;
                for (const cut of cuts) {
                    const localX = (cut.x - a.x) * tx + (cut.z - a.z) * tz;
                    if (localX < -cutTol || localX > segLen + cutTol) continue;
                    const perp = Math.abs((cut.x - a.x) * tz - (cut.z - a.z) * tx);
                    if (perp > cutTol) continue;
                    segCuts.push({ ...cut, localX });
                }
            }
        }

        if (wantsYCutlines || segCuts.length) {
            const tx = dx / segLen;
            const tz = dz / segLen;
            const sliceList = slices ?? [{ y0: 0.0, y1: h }];

            for (const slice of sliceList) {
                const sliceY0 = Number(slice?.y0) || 0;
                const sliceY1 = Number(slice?.y1) || 0;
                if (!(sliceY1 - sliceY0 > EPS)) continue;

                const xCuts = [0.0, segLen];
                const yCuts = [sliceY0, sliceY1];
                const sliceCuts = [];

                for (const cut of segCuts) {
                    const cx = Number(cut.localX) || 0;
                    const cy = Number(cut.y) || 0;
                    const wCut = Math.max(EPS, Number(cut.width) || 0);
                    const hCut = Math.max(EPS, Number(cut.height) || 0);
                    const halfW = wCut * 0.5;
                    const halfH = hCut * 0.5;
                    const x0 = cx - halfW;
                    const x1 = cx + halfW;
                    const y0 = cy - halfH;
                    const y1 = cy + halfH;

                    if (x0 <= EPS || x1 >= segLen - EPS) continue;
                    if (y1 <= sliceY0 + EPS || y0 >= sliceY1 - EPS) continue;

                    const sx0 = clamp(x0, 0.0, segLen);
                    const sx1 = clamp(x1, 0.0, segLen);
                    const sy0 = clamp(y0, sliceY0, sliceY1);
                    const sy1 = clamp(y1, sliceY0, sliceY1);
                    if (!(sx1 - sx0 > EPS) || !(sy1 - sy0 > EPS)) continue;

                    xCuts.push(sx0, sx1);
                    yCuts.push(sy0, sy1);
                    sliceCuts.push({
                        x0: sx0,
                        x1: sx1,
                        y0: sy0,
                        y1: sy1,
                        wantsArch: !!cut.wantsArch,
                        archRise: Math.max(0, Number(cut.archRise) || 0),
                        revealDepth: Math.max(0, Number(cut.revealDepth) || 0)
                    });
                }

                const xs = sortUniqueNumbers(xCuts);
                const ys = sortUniqueNumbers(yCuts);

                for (let xi = 0; xi + 1 < xs.length; xi++) {
                    const x0 = xs[xi];
                    const x1 = xs[xi + 1];
                    if (!(x1 - x0 > minEdge)) continue;

                    for (let yi = 0; yi + 1 < ys.length; yi++) {
                        const y0 = ys[yi];
                        const y1 = ys[yi + 1];
                        if (!(y1 - y0 > minEdge)) continue;

                        let isHole = false;
                        for (const cut of sliceCuts) {
                            if (
                                x0 >= cut.x0 - EPS
                                && x1 <= cut.x1 + EPS
                                && y0 >= cut.y0 - EPS
                                && y1 <= cut.y1 + EPS
                            ) {
                                isHole = true;
                                break;
                            }
                        }
                        if (isHole) continue;

                        const pushVertex = (lx, ly) => {
                            const tU = segLen > EPS ? clamp(lx / segLen, 0, 1) : 0;
                            positions.push(
                                a.x + tx * lx,
                                ly,
                                a.z + tz * lx
                            );
                            uvs.push(
                                uAtA + (uAtB - uAtA) * tU,
                                v0 + ly
                            );
                        };

                        pushVertex(x0, y0);
                        pushVertex(x1, y1);
                        pushVertex(x1, y0);

                        pushVertex(x0, y0);
                        pushVertex(x0, y1);
                        pushVertex(x1, y1);

                        curGroupCount += 6;
                    }
                }

                for (const cut of sliceCuts) {
                    if (!cut.wantsArch || !(cut.archRise > EPS)) continue;

                    const x0 = cut.x0;
                    const x1 = cut.x1;
                    const yTop = cut.y1;
                    const yChord = yTop - cut.archRise;

                    if (yChord <= cut.y0 + EPS) continue;
                    if (sliceY0 > yChord + 1e-4 || sliceY1 < yTop - 1e-4) continue;

                    const w = Math.abs(x1 - x0);
                    const R = (w * w) / (8 * cut.archRise) + cut.archRise / 2;
                    const cx = (x0 + x1) * 0.5;
                    const circleY = yChord + cut.archRise - R;
                    const arcYAt = (xp) => {
                        const dxp = xp - cx;
                        const inner = R * R - dxp * dxp;
                        if (!(inner > 0)) return yChord;
                        return circleY + Math.sqrt(inner);
                    };

                    const arcSegments = clampInt(curveSegments, 6, 64);
                    const addSpandrel = (side) => {
                        const shape = new THREE.Shape();
                        if (side === 'left') {
                            shape.moveTo(x0, yTop);
                            shape.lineTo(x0, yChord);
                            for (let s = 1; s <= arcSegments; s++) {
                                const t = s / arcSegments;
                                const x = x0 + (cx - x0) * t;
                                shape.lineTo(x, arcYAt(x));
                            }
                            shape.lineTo(x0, yTop);
                        } else {
                            shape.moveTo(x1, yTop);
                            shape.lineTo(x1, yChord);
                            for (let s = 1; s <= arcSegments; s++) {
                                const t = s / arcSegments;
                                const x = x1 + (cx - x1) * t;
                                shape.lineTo(x, arcYAt(x));
                            }
                            shape.lineTo(x1, yTop);
                        }

                        const indexed = new THREE.ShapeGeometry(shape, arcSegments);
                        const geo = indexed.index ? indexed.toNonIndexed() : indexed;
                        if (geo !== indexed) indexed.dispose();
                        const pos = geo.getAttribute('position');
                        const count = pos?.count ?? 0;
                        let wantsWindingFlip = false;
                        for (let k = 0; k + 2 < count; k += 3) {
                            const x0 = pos.getX(k);
                            const y0 = pos.getY(k);
                            const x1 = pos.getX(k + 1);
                            const y1 = pos.getY(k + 1);
                            const x2 = pos.getX(k + 2);
                            const y2 = pos.getY(k + 2);
                            const triZ = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
                            if (!(Math.abs(triZ) > 1e-8)) continue;
                            wantsWindingFlip = triZ > 0;
                            break;
                        }
                        for (let k = 0; k + 2 < count; k += 3) {
                            const a0 = k;
                            const a1 = wantsWindingFlip ? (k + 2) : (k + 1);
                            const a2 = wantsWindingFlip ? (k + 1) : (k + 2);
                            for (const idx of [a0, a1, a2]) {
                                const lx = pos.getX(idx);
                                const ly = pos.getY(idx);
                                const tU = segLen > EPS ? clamp(lx / segLen, 0, 1) : 0;
                                positions.push(
                                    a.x + tx * lx,
                                    ly,
                                    a.z + tz * lx
                                );
                                uvs.push(
                                    uAtA + (uAtB - uAtA) * tU,
                                    v0 + ly
                                );
                            }
                        }
                        curGroupCount += count;
                        geo.dispose();
                    };

                    addSpandrel('left');
                    addSpandrel('right');
                }

                const inwardX = -tz;
                const inwardZ = tx;
                const du = uAtB - uAtA;
                const invSegLen = segLen > EPS ? (1 / segLen) : 0;

                const pushRevealVertex = (lx, ly, depth, addDepthToV) => {
                    const tU = invSegLen ? clamp(lx * invSegLen, 0, 1) : 0;
                    const baseU = uAtA + du * tU;
                    const baseV = v0 + ly;
                    const u = addDepthToV ? baseU : (baseU + depth);
                    const v = addDepthToV ? (baseV + depth) : baseV;
                    positions.push(
                        a.x + tx * lx + inwardX * depth,
                        ly,
                        a.z + tz * lx + inwardZ * depth
                    );
                    uvs.push(u, v);
                };

                const pushRevealQuad = (x0, y0, x1, y1, depth) => {
                    if (!(depth > EPS)) return;
                    if (!(Math.hypot(x1 - x0, y1 - y0) > minEdge)) return;
                    const addDepthToV = Math.abs(y1 - y0) <= 1e-6;

                    pushRevealVertex(x0, y0, 0.0, addDepthToV);
                    pushRevealVertex(x0, y0, depth, addDepthToV);
                    pushRevealVertex(x1, y1, depth, addDepthToV);

                    pushRevealVertex(x0, y0, 0.0, addDepthToV);
                    pushRevealVertex(x1, y1, depth, addDepthToV);
                    pushRevealVertex(x1, y1, 0.0, addDepthToV);

                    curGroupCount += 6;
                };

                for (const cut of sliceCuts) {
                    const depth = Number(cut.revealDepth) || 0;
                    if (!(depth > EPS)) continue;

                    const x0 = cut.x0;
                    const x1 = cut.x1;
                    const y0 = cut.y0;
                    const y1 = cut.y1;
                    if (!(x1 - x0 > minEdge) || !(y1 - y0 > minEdge)) continue;

                    if (!cut.wantsArch || !(cut.archRise > EPS)) {
                        pushRevealQuad(x0, y0, x1, y0, depth);
                        pushRevealQuad(x1, y0, x1, y1, depth);
                        pushRevealQuad(x1, y1, x0, y1, depth);
                        pushRevealQuad(x0, y1, x0, y0, depth);
                        continue;
                    }

                    const yTop = y1;
                    const yChord = yTop - cut.archRise;
                    if (yChord <= y0 + EPS) {
                        pushRevealQuad(x0, y0, x1, y0, depth);
                        pushRevealQuad(x1, y0, x1, y1, depth);
                        pushRevealQuad(x1, y1, x0, y1, depth);
                        pushRevealQuad(x0, y1, x0, y0, depth);
                        continue;
                    }

                    const w = Math.abs(x1 - x0);
                    if (!(w > EPS)) continue;
                    const R = (w * w) / (8 * cut.archRise) + cut.archRise / 2;
                    const cx = (x0 + x1) * 0.5;
                    const circleY = yChord + cut.archRise - R;
                    const arcYAt = (xp) => {
                        const dxp = xp - cx;
                        const inner = R * R - dxp * dxp;
                        if (!(inner > 0)) return yChord;
                        return circleY + Math.sqrt(inner);
                    };

                    const arcSegments = clampInt(curveSegments, 6, 64);
                    pushRevealQuad(x0, y0, x1, y0, depth);
                    pushRevealQuad(x1, y0, x1, yChord, depth);
                    let prevX = x1;
                    let prevY = yChord;
                    for (let s = 1; s < arcSegments; s++) {
                        const t = s / arcSegments;
                        const x = x1 + (x0 - x1) * t;
                        const y = arcYAt(x);
                        pushRevealQuad(prevX, prevY, x, y, depth);
                        prevX = x;
                        prevY = y;
                    }
                    pushRevealQuad(prevX, prevY, x0, yChord, depth);
                    pushRevealQuad(x0, yChord, x0, y0, depth);
                }
            }

            continue;
        }

        // Tri 1: bottomA, topB, bottomB (CCW for CCW loops → outward normals).
        positions.push(
            a.x, 0, a.z,
            b.x, h, b.z,
            b.x, 0, b.z
        );
        uvs.push(
            uAtA, v0,
            uAtB, v1,
            uAtB, v0
        );

        // Tri 2: bottomA, topA, topB
        positions.push(
            a.x, 0, a.z,
            a.x, h, a.z,
            b.x, h, b.z
        );
        uvs.push(
            uAtA, v0,
            uAtA, v1,
            uAtB, v1
        );

        curGroupCount += 6;
    }

    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.clearGroups();
    flushGroup();
    for (const group of groups) geo.addGroup(group.start, group.count, group.materialIndex);
    geo.computeVertexNormals();
    return geo;
}

function buildWallSidesGeometryFromLoopXZ(loop, { height, uvBaseV = 0.0, minEdge = 1e-5 } = {}) {
    const pts = Array.isArray(loop) ? loop : [];
    const n = pts.length;
    const h = Number(height) || 0;
    if (n < 3 || !(h > EPS)) return null;

    const v0 = Number(uvBaseV) || 0;
    const v1 = v0 + h;
    const positions = [];
    const uvs = [];
    let uCursor = 0.0;

    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const segLen = Math.hypot(dx, dz);
        if (!(segLen > minEdge)) continue;

        const u0 = uCursor;
        const u1 = uCursor + segLen;
        uCursor = u1;

        // Tri 1: bottomA, topB, bottomB (CCW for CCW loops → outward normals).
        positions.push(
            a.x, 0, a.z,
            b.x, h, b.z,
            b.x, 0, b.z
        );
        uvs.push(
            u0, v0,
            u1, v1,
            u1, v0
        );

        // Tri 2: bottomA, topA, topB
        positions.push(
            a.x, 0, a.z,
            a.x, h, a.z,
            b.x, h, b.z
        );
        uvs.push(
            u0, v0,
            u0, v1,
            u1, v1
        );
    }

    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.computeVertexNormals();
    geo.clearGroups();
    geo.addGroup(0, geo.getAttribute('position').count, 1);
    return geo;
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

function pointsEqualUD(a, b, tol = 1e-6) {
    if (!a || !b) return false;
    return Math.abs(a.u - b.u) <= tol && Math.abs(a.depth - b.depth) <= tol;
}

function appendPointIfChangedUD(points, p, tol = 1e-6) {
    const list = Array.isArray(points) ? points : null;
    if (!list || !p) return;
    const last = list[list.length - 1] ?? null;
    if (last && pointsEqualUD(last, p, tol)) return;
    list.push(p);
}

function pointOnFacadeFrame({ frame, u, depth }) {
    const f = frame && typeof frame === 'object' ? frame : null;
    if (!f) return { x: 0, y: 0, z: 0 };
    const t = Number(u) || 0;
    const d = Number(depth) || 0;
    const x = (Number(f.start?.x) || 0) + (Number(f.t?.x) || 0) * t + (Number(f.n?.x) || 0) * d;
    const z = (Number(f.start?.z) || 0) + (Number(f.t?.z) || 0) * t + (Number(f.n?.z) || 0) * d;
    return { x: qf(x), y: 0, z: qf(z) };
}

function cornerJoinPointWithDepths(aFrame, aDepth, bFrame, bDepth, corner) {
    const da = Number(aDepth) || 0;
    const db = Number(bDepth) || 0;
    const c = corner && typeof corner === 'object' ? corner : { x: 0, z: 0 };

    const pa = { x: c.x + (Number(aFrame?.n?.x) || 0) * da, z: c.z + (Number(aFrame?.n?.z) || 0) * da };
    const pb = { x: c.x + (Number(bFrame?.n?.x) || 0) * db, z: c.z + (Number(bFrame?.n?.z) || 0) * db };
    const ia = intersectLines2(pa, aFrame.t, pb, bFrame.t);
    const out = ia ?? pa;
    return { x: qf(out.x), y: 0, z: qf(out.z) };
}

function buildFacadeFaceProfile({
    faceId,
    frame,
    facade,
    layerMaterial,
    warnings
}) {
    const faceLength = Number(frame?.length) || 0;
    if (!(faceLength > EPS)) {
        if (warnings) warnings.push(`${faceId}: face length is invalid.`);
        return { profile: [], startDepth: 0.0, endDepth: 0.0, strips: [], faceLength };
    }

    const baseDepth = qf(clampFacadeDepthMeters(facade?.depthOffset ?? 0.0));
    const rawItems = resolveFacadeLayoutItems(facade);
    const items = normalizeLayoutWidthFracs(rawItems.length ? rawItems : [{ type: 'padding', id: `${faceId}_pad`, widthFrac: 1.0 }], { warnings, faceId });

    const strips = [];
    const profile = [];
    let uCursor = 0.0;
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
        const u0 = qf(uCursor);
        const u1 = (i === items.length - 1) ? qf(faceLength) : qf(uCursor + widthMeters);
        uCursor = u1;

        const isBay = type === 'bay';
        const depthSpec = isBay && it?.depth && typeof it.depth === 'object' ? it.depth : null;
        const depthLinked = (depthSpec?.linked ?? true) !== false;
        const depthLeftRaw = Number(depthSpec?.left);
        const deltaDepthLeft = qf(depthSpec
            ? (Number.isFinite(depthLeftRaw) ? clampFacadeDepthMeters(depthLeftRaw) : 0.0)
            : (isBay ? clampFacadeDepthMeters(it?.depthOffset ?? 0.0) : 0.0));
        const depthRightRaw = Number(depthSpec?.right);
        const deltaDepthRight = qf(depthSpec
            ? (Number.isFinite(depthRightRaw) ? clampFacadeDepthMeters(depthRightRaw) : (depthLinked ? deltaDepthLeft : 0.0))
            : deltaDepthLeft);

        const wedgeAngleDeg = isBay && !depthSpec ? normalizeWedgeAngleDeg(it?.wedgeAngleDeg) : 0;
        const wantsWedge = isBay && !depthSpec && wedgeAngleDeg > 0 && Math.abs(deltaDepthLeft) > depthEps;

        if (isBay && !depthSpec && wedgeAngleDeg > 0 && !(Math.abs(deltaDepthLeft) > depthEps) && warnings) {
            warnings.push(`${faceId}:${id}: wedge angle set but depth is 0.`);
        }

        const boundaryDepth0 = qf(baseDepth + (isBay && !wantsWedge ? deltaDepthLeft : 0.0));
        const boundaryDepth1 = qf(baseDepth + (isBay && !wantsWedge ? deltaDepthRight : 0.0));

        appendPointIfChangedUD(profile, { u: u0, depth: boundaryDepth0 }, pointTol);

        let frontU0 = u0;
        let frontU1 = u1;
        if (wantsWedge) {
            const absDepth = Math.abs(deltaDepthLeft);
            const rad = wedgeAngleDeg * (Math.PI / 180);
            const tan = Math.tan(rad);
            const dx = tan > EPS ? (absDepth / tan) : (widthMeters * 0.5);
            const f0 = qf(u0 + dx);
            const f1 = qf(u1 - dx);
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

        const frontDepth0 = qf(baseDepth + (isBay ? deltaDepthLeft : 0.0));
        const frontDepth1 = qf(baseDepth + (isBay ? deltaDepthRight : 0.0));
        const stripDepth0 = frontDepth0;
        const stripDepth1 = wantsWedge ? frontDepth0 : frontDepth1;
        const frontDepth = (stripDepth0 + stripDepth1) * 0.5;
        const sourceBayId = isBay && typeof it?.sourceBayId === 'string' ? it.sourceBayId : null;
        const textureFlow = isBay && typeof it?.textureFlow === 'string' ? it.textureFlow : null;
        const wallBase = isBay && it?.wallBase && typeof it.wallBase === 'object' ? it.wallBase : null;
        const tiling = isBay && it?.tiling && typeof it.tiling === 'object' ? it.tiling : null;
        const materialVariation = isBay && it?.materialVariation && typeof it.materialVariation === 'object' ? it.materialVariation : null;
        const window = isBay && it?.window && typeof it.window === 'object' ? deepClone(it.window) : null;
        strips.push({
            faceId,
            id,
            type,
            ...(sourceBayId ? { sourceBayId } : {}),
            ...(textureFlow ? { textureFlow } : {}),
            ...(wallBase ? { wallBase } : {}),
            ...(tiling ? { tiling } : {}),
            ...(materialVariation ? { materialVariation } : {}),
            ...(window ? { window } : {}),
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
            const dFront = qf(baseDepth + deltaDepthLeft);
            appendPointIfChangedUD(profile, { u: frontU0, depth: dFront }, pointTol);
            appendPointIfChangedUD(profile, { u: frontU1, depth: dFront }, pointTol);
            appendPointIfChangedUD(profile, { u: u1, depth: baseDepth }, pointTol);
            continue;
        }

        appendPointIfChangedUD(profile, { u: u1, depth: boundaryDepth1 }, pointTol);
    }

    const startDepth = profile.length ? (Number(profile[0].depth) || 0) : 0.0;
    const last = profile[profile.length - 1] ?? null;
    const endDepth = last ? (Number(last.depth) || 0) : startDepth;

    return { profile, startDepth, endDepth, strips, faceLength };
}

function computeQuadFacadeSilhouette({
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

    const frames = computeQuadFacadeFramesFromLoop(main, { warnings });
    if (!frames) return null;

    const pointTol = 1e-4;
    const minEdge = 1e-3;
    const resolvedCornerStrategy = cornerStrategy && typeof cornerStrategy === 'object' && typeof cornerStrategy.resolve === 'function'
        ? cornerStrategy
        : resolveRectFacadeCornerStrategy(null);
    const cornerDebugList = Array.isArray(cornerDebug) ? cornerDebug : null;

    const fac = facades && typeof facades === 'object' ? facades : null;
    const getFacade = (id) => (fac?.[id] && typeof fac[id] === 'object') ? fac[id] : null;

    const A = buildFacadeFaceProfile({
        faceId: 'A',
        frame: frames.A,
        facade: getFacade('A'),
        layerMaterial,
        warnings
    });
    const B = buildFacadeFaceProfile({
        faceId: 'B',
        frame: frames.B,
        facade: getFacade('B'),
        layerMaterial,
        warnings
    });
    const C = buildFacadeFaceProfile({
        faceId: 'C',
        frame: frames.C,
        facade: getFacade('C'),
        layerMaterial,
        warnings
    });
    const D = buildFacadeFaceProfile({
        faceId: 'D',
        frame: frames.D,
        facade: getFacade('D'),
        layerMaterial,
        warnings
    });

    if (!A.profile.length || !B.profile.length || !C.profile.length || !D.profile.length) {
        if (warnings) warnings.push('Facade silhouette: missing face profiles.');
        return null;
    }

    const joinAB = cornerJoinPointWithDepths(frames.A, A.endDepth, frames.B, B.startDepth, frames.A.end);
    const joinBC = cornerJoinPointWithDepths(frames.B, B.endDepth, frames.C, C.startDepth, frames.B.end);
    const joinCD = cornerJoinPointWithDepths(frames.C, C.endDepth, frames.D, D.startDepth, frames.C.end);
    const joinDA = cornerJoinPointWithDepths(frames.D, D.endDepth, frames.A, A.startDepth, frames.D.end);

    const getUAtJoin = (frame, depth, p) => {
        const f = frame && typeof frame === 'object' ? frame : null;
        if (!f || !p) return 0;
        const sx = Number(f.start?.x) || 0;
        const sz = Number(f.start?.z) || 0;
        const tx = Number(f.t?.x) || 0;
        const tz = Number(f.t?.z) || 0;
        const nx = Number(f.n?.x) || 0;
        const nz = Number(f.n?.z) || 0;
        const d = Number(depth) || 0;
        const vx = (Number(p.x) || 0) - sx - nx * d;
        const vz = (Number(p.z) || 0) - sz - nz * d;
        return qf(vx * tx + vz * tz);
    };

    const resolveCornerCutWants = (facade) => {
        const src = facade && typeof facade === 'object' ? facade : null;
        const cfg = (src?.cornerCutouts && typeof src.cornerCutouts === 'object')
            ? src.cornerCutouts
            : ((src?.cornerCut && typeof src.cornerCut === 'object') ? src.cornerCut : null);

        const startRaw = cfg?.startMeters ?? cfg?.start ?? null;
        const endRaw = cfg?.endMeters ?? cfg?.end ?? null;
        const start = clamp(Number(startRaw) || 0, 0, 9999);
        const end = clamp(Number(endRaw) || 0, 0, 9999);
        return { start, end };
    };

    const sampleProfileDepthAtU = (list, u) => {
        const pts = Array.isArray(list) ? list : [];
        const uu = Number(u) || 0;
        if (!pts.length) return 0;

        const u0 = Number(pts[0]?.u) || 0;
        const d0 = Number(pts[0]?.depth) || 0;
        if (uu <= u0) return qf(d0);

        for (let i = 1; i < pts.length; i++) {
            const p = pts[i];
            if (!p || typeof p !== 'object') continue;
            const u1 = Number(p.u) || 0;
            const d1 = Number(p.depth) || 0;
            if (uu <= u1 + EPS) {
                const prev = pts[i - 1];
                const ua = Number(prev?.u) || 0;
                const da = Number(prev?.depth) || 0;
                const ub = u1;
                const db = d1;
                const t = (ub - ua) > EPS ? clamp((uu - ua) / (ub - ua), 0, 1) : 0;
                return qf(da + (db - da) * t);
            }
        }

        const last = pts[pts.length - 1];
        return qf(Number(last?.depth) || 0);
    };

    const isOddWinnerFaceId = (faceId) => {
        const id = typeof faceId === 'string' ? faceId : '';
        const code = id ? (id.charCodeAt(0) - 65) : 0;
        return (code % 2) === 0;
    };

    const minCornerCutBayWidth = 0.1;
    const cornerCutEps = 1e-4;

    const computeMaxCutStart = ({ prof, uStartJoin, uEndJoin }) => {
        const list = Array.isArray(prof?.profile) ? prof.profile : [];
        let nextU = uEndJoin;
        for (const p of list) {
            if (!p || typeof p !== 'object') continue;
            const u = Number(p.u) || 0;
            if (u > uStartJoin + pointTol) {
                nextU = Math.min(nextU, u);
                break;
            }
        }
        const segW = Math.max(0, nextU - uStartJoin);
        return Math.max(0, segW - minCornerCutBayWidth);
    };

    const computeMaxCutEnd = ({ prof, uStartJoin, uEndJoin }) => {
        const list = Array.isArray(prof?.profile) ? prof.profile : [];
        let prevU = uStartJoin;
        for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            if (!p || typeof p !== 'object') continue;
            const u = Number(p.u) || 0;
            if (u < uEndJoin - pointTol) {
                prevU = Math.max(prevU, u);
                break;
            }
        }
        const segW = Math.max(0, uEndJoin - prevU);
        return Math.max(0, segW - minCornerCutBayWidth);
    };

    const facadeA = getFacade('A');
    const facadeB = getFacade('B');
    const facadeC = getFacade('C');
    const facadeD = getFacade('D');
    const cutWantsByFaceId = {
        A: resolveCornerCutWants(facadeA),
        B: resolveCornerCutWants(facadeB),
        C: resolveCornerCutWants(facadeC),
        D: resolveCornerCutWants(facadeD)
    };

    const faceInfoByFaceId = {
        A: { faceId: 'A', frame: frames.A, prof: A, startJoin: joinDA, endJoin: joinAB, startCornerId: 'DA', endCornerId: 'AB' },
        B: { faceId: 'B', frame: frames.B, prof: B, startJoin: joinAB, endJoin: joinBC, startCornerId: 'AB', endCornerId: 'BC' },
        C: { faceId: 'C', frame: frames.C, prof: C, startJoin: joinBC, endJoin: joinCD, startCornerId: 'BC', endCornerId: 'CD' },
        D: { faceId: 'D', frame: frames.D, prof: D, startJoin: joinCD, endJoin: joinDA, startCornerId: 'CD', endCornerId: 'DA' }
    };

    for (const faceId of ['A', 'B', 'C', 'D']) {
        const info = faceInfoByFaceId[faceId];
        const f = info?.frame ?? null;
        const prof = info?.prof ?? null;
        const startDepth = qf(Number(prof?.startDepth) || 0);
        const endDepth = qf(Number(prof?.endDepth) || startDepth);
        info.uStartJoin = getUAtJoin(f, startDepth, info.startJoin);
        info.uEndJoin = getUAtJoin(f, endDepth, info.endJoin);
        info.maxCutStart = computeMaxCutStart(info);
        info.maxCutEnd = computeMaxCutEnd(info);
    }

    const resolveCornerCut = (cornerId, prevFaceId, nextFaceId) => {
        const prev = faceInfoByFaceId[prevFaceId];
        const next = faceInfoByFaceId[nextFaceId];
        if (!prev || !next) return { cutPrev: 0, cutNext: 0, q: null };

        const wantPrev = Number(cutWantsByFaceId?.[prevFaceId]?.end) || 0;
        const wantNext = Number(cutWantsByFaceId?.[nextFaceId]?.start) || 0;
        const maxPrev = Number(prev.maxCutEnd) || 0;
        const maxNext = Number(next.maxCutStart) || 0;

        let cutPrev = qf(clamp(wantPrev, 0, maxPrev));
        let cutNext = qf(clamp(wantNext, 0, maxNext));
        if (!(cutPrev > cornerCutEps) && !(cutNext > cornerCutEps)) return { cutPrev: 0, cutNext: 0, q: null };

        const computeQ = (cp, cn) => {
            const uPrev = qf((Number(prev.uEndJoin) || 0) - (Number(cp) || 0));
            const uNext = qf((Number(next.uStartJoin) || 0) + (Number(cn) || 0));
            if (!(uPrev > (Number(prev.uStartJoin) || 0) + minEdge)) return null;
            if (!(uNext < (Number(next.uEndJoin) || 0) - minEdge)) return null;

            const usePrevJoin = (Number(cp) || 0) <= cornerCutEps;
            const useNextJoin = (Number(cn) || 0) <= cornerCutEps;

            const dPrev = usePrevJoin ? qf(Number(prev.prof.endDepth) || 0) : sampleProfileDepthAtU(prev.prof.profile, uPrev);
            const dNext = useNextJoin ? qf(Number(next.prof.startDepth) || 0) : sampleProfileDepthAtU(next.prof.profile, uNext);
            const pPrev = usePrevJoin ? { x: qf(prev.endJoin.x), y: 0, z: qf(prev.endJoin.z) } : pointOnFacadeFrame({ frame: prev.frame, u: uPrev, depth: dPrev });
            const pNext = useNextJoin ? { x: qf(next.startJoin.x), y: 0, z: qf(next.startJoin.z) } : pointOnFacadeFrame({ frame: next.frame, u: uNext, depth: dNext });

            const r = next.frame?.t ?? null;
            const s = prev.frame?.t ?? null;
            if (!r || !s) return null;

            const q = intersectLines2(pPrev, r, pNext, { x: -Number(s.x) || 0, z: -Number(s.z) || 0 });
            if (!q) return null;

            const qx = qf(q.x);
            const qz = qf(q.z);
            const d0 = Math.hypot(qx - pPrev.x, qz - pPrev.z);
            const d1 = Math.hypot(qx - pNext.x, qz - pNext.z);
            if (!(d0 > minEdge) || !(d1 > minEdge)) return null;
            return { x: qx, y: 0, z: qz, cornerId };
        };

        let q = computeQ(cutPrev, cutNext);
        if (!q && cutPrev > cornerCutEps && cutNext > cornerCutEps) {
            const winner = isOddWinnerFaceId(prevFaceId) ? prevFaceId : nextFaceId;
            if (winner === prevFaceId) cutNext = 0;
            else cutPrev = 0;
            q = computeQ(cutPrev, cutNext);
        }

        if (!q) {
            if (warnings) warnings.push(`Facade silhouette: corner cutout "${cornerId}" could not be resolved.`);
            return { cutPrev: 0, cutNext: 0, q: null };
        }

        return { cutPrev, cutNext, q };
    };

    const cornerCuts = {
        AB: resolveCornerCut('AB', 'A', 'B'),
        BC: resolveCornerCut('BC', 'B', 'C'),
        CD: resolveCornerCut('CD', 'C', 'D'),
        DA: resolveCornerCut('DA', 'D', 'A')
    };

    const cutStartByFaceId = {
        A: qf(Number(cornerCuts.DA.cutNext) || 0),
        B: qf(Number(cornerCuts.AB.cutNext) || 0),
        C: qf(Number(cornerCuts.BC.cutNext) || 0),
        D: qf(Number(cornerCuts.CD.cutNext) || 0)
    };
    const cutEndByFaceId = {
        A: qf(Number(cornerCuts.AB.cutPrev) || 0),
        B: qf(Number(cornerCuts.BC.cutPrev) || 0),
        C: qf(Number(cornerCuts.CD.cutPrev) || 0),
        D: qf(Number(cornerCuts.DA.cutPrev) || 0)
    };

    const buildTrimmedFaceWorldPoints = ({
        faceId,
        profile,
        frame,
        startCornerId,
        endCornerId,
        startJoin,
        endJoin,
        uStartJoin,
        uEndJoin,
        cutStartMeters,
        cutEndMeters
    }) => {
        const f = frame && typeof frame === 'object' ? frame : null;
        const prof = profile && typeof profile === 'object' ? profile : null;
        if (!f || !prof) return null;
        const list = Array.isArray(prof.profile) ? prof.profile : [];
        if (!list.length) return null;

        const faceLength = Number(prof.faceLength) || 0;
        if (!(faceLength > minEdge)) return null;

        const wantsStartJoin = (Number(cutStartMeters) || 0) <= cornerCutEps;
        const wantsEndJoin = (Number(cutEndMeters) || 0) <= cornerCutEps;
        const uStart = qf((Number(uStartJoin) || 0) + (wantsStartJoin ? 0 : (Number(cutStartMeters) || 0)));
        const uEnd = qf((Number(uEndJoin) || 0) - (wantsEndJoin ? 0 : (Number(cutEndMeters) || 0)));
        if (!(uEnd > uStart + minEdge)) {
            if (warnings) warnings.push(`Facade silhouette: face ${faceId} collapsed after corner trims (uStart=${uStart.toFixed(3)}, uEnd=${uEnd.toFixed(3)}).`);
            return null;
        }

        const joinStartDepth = qf(Number(prof.startDepth) || 0);
        const joinEndDepth = qf(Number(prof.endDepth) || joinStartDepth);
        const startDepth = wantsStartJoin ? joinStartDepth : sampleProfileDepthAtU(list, uStart);
        const endDepth = wantsEndJoin ? joinEndDepth : sampleProfileDepthAtU(list, uEnd);

        const pts = [];
        const startWorld = wantsStartJoin
            ? { x: qf(startJoin.x), y: 0, z: qf(startJoin.z) }
            : pointOnFacadeFrame({ frame: f, u: uStart, depth: startDepth });
        const endWorld = wantsEndJoin
            ? { x: qf(endJoin.x), y: 0, z: qf(endJoin.z) }
            : pointOnFacadeFrame({ frame: f, u: uEnd, depth: endDepth });

        pts.push({
            ...startWorld,
            kind: 'profile',
            faceId,
            u: uStart,
            depth: startDepth,
            ...(wantsStartJoin ? { cornerId: startCornerId } : {})
        });

        for (const p of list) {
            if (!p || typeof p !== 'object') continue;
            const u = Number(p.u) || 0;
            if (!(u > pointTol && u < faceLength - pointTol)) continue;
            if (!(u > uStart + pointTol && u < uEnd - pointTol)) continue;
            const d = qf(Number(p.depth) || 0);
            const world = pointOnFacadeFrame({ frame: f, u, depth: d });
            appendPointIfChanged(pts, { ...world, kind: 'profile', faceId, u: qf(u), depth: d }, pointTol);
        }

        appendPointIfChanged(pts, {
            ...endWorld,
            kind: 'profile',
            faceId,
            u: uEnd,
            depth: endDepth,
            ...(wantsEndJoin ? { cornerId: endCornerId } : {})
        }, pointTol);
        return pts;
    };

    const Apts = buildTrimmedFaceWorldPoints({
        faceId: 'A',
        profile: A,
        frame: frames.A,
        startCornerId: 'DA',
        endCornerId: 'AB',
        startJoin: joinDA,
        endJoin: joinAB,
        uStartJoin: faceInfoByFaceId.A.uStartJoin,
        uEndJoin: faceInfoByFaceId.A.uEndJoin,
        cutStartMeters: cutStartByFaceId.A,
        cutEndMeters: cutEndByFaceId.A
    });
    const Bpts = buildTrimmedFaceWorldPoints({
        faceId: 'B',
        profile: B,
        frame: frames.B,
        startCornerId: 'AB',
        endCornerId: 'BC',
        startJoin: joinAB,
        endJoin: joinBC,
        uStartJoin: faceInfoByFaceId.B.uStartJoin,
        uEndJoin: faceInfoByFaceId.B.uEndJoin,
        cutStartMeters: cutStartByFaceId.B,
        cutEndMeters: cutEndByFaceId.B
    });
    const Cpts = buildTrimmedFaceWorldPoints({
        faceId: 'C',
        profile: C,
        frame: frames.C,
        startCornerId: 'BC',
        endCornerId: 'CD',
        startJoin: joinBC,
        endJoin: joinCD,
        uStartJoin: faceInfoByFaceId.C.uStartJoin,
        uEndJoin: faceInfoByFaceId.C.uEndJoin,
        cutStartMeters: cutStartByFaceId.C,
        cutEndMeters: cutEndByFaceId.C
    });
    const Dpts = buildTrimmedFaceWorldPoints({
        faceId: 'D',
        profile: D,
        frame: frames.D,
        startCornerId: 'CD',
        endCornerId: 'DA',
        startJoin: joinCD,
        endJoin: joinDA,
        uStartJoin: faceInfoByFaceId.D.uStartJoin,
        uEndJoin: faceInfoByFaceId.D.uEndJoin,
        cutStartMeters: cutStartByFaceId.D,
        cutEndMeters: cutEndByFaceId.D
    });

    if (!Apts || !Bpts || !Cpts || !Dpts) return null;

    if (cornerDebugList) {
        const corners = [
            { cornerId: 'AB', a: { faceId: 'A', end: 'end', depth: Number(A.endDepth) || 0 }, b: { faceId: 'B', end: 'start', depth: Number(B.startDepth) || 0 }, join: joinAB, frameCorner: frames.A.end },
            { cornerId: 'BC', a: { faceId: 'B', end: 'end', depth: Number(B.endDepth) || 0 }, b: { faceId: 'C', end: 'start', depth: Number(C.startDepth) || 0 }, join: joinBC, frameCorner: frames.B.end },
            { cornerId: 'CD', a: { faceId: 'C', end: 'end', depth: Number(C.endDepth) || 0 }, b: { faceId: 'D', end: 'start', depth: Number(D.startDepth) || 0 }, join: joinCD, frameCorner: frames.C.end },
            { cornerId: 'DA', a: { faceId: 'D', end: 'end', depth: Number(D.endDepth) || 0 }, b: { faceId: 'A', end: 'start', depth: Number(A.startDepth) || 0 }, join: joinDA, frameCorner: frames.D.end }
        ];
        for (const c of corners) {
            const res = resolvedCornerStrategy.resolve(c.a, c.b, { cornerId: c.cornerId });
            const winnerFaceId = res?.winnerFaceId === c.a.faceId || res?.winnerFaceId === c.b.faceId ? res.winnerFaceId : c.a.faceId;
            cornerDebugList.push({
                cornerId: c.cornerId,
                strategyId: typeof resolvedCornerStrategy.id === 'string' ? resolvedCornerStrategy.id : null,
                winnerFaceId,
                a: c.a,
                b: c.b,
                join: c.join ? { x: c.join.x, z: c.join.z } : null,
                footprint: c.frameCorner ? { x: Number(c.frameCorner.x) || 0, z: Number(c.frameCorner.z) || 0 } : null
            });
        }
    }

    const cutPoint = (cornerId) => {
        const p = cornerCuts?.[cornerId]?.q ?? null;
        if (!p || typeof p !== 'object') return null;
        return { x: qf(p.x), y: 0, z: qf(p.z), kind: 'corner_cut' };
    };

    const cutAB = cutPoint('AB');
    const cutBC = cutPoint('BC');
    const cutCD = cutPoint('CD');
    const cutDA = cutPoint('DA');

    const loopDetail = [
        ...Apts,
        ...(cutAB ? [cutAB] : []),
        ...Bpts,
        ...(cutBC ? [cutBC] : []),
        ...Cpts,
        ...(cutCD ? [cutCD] : []),
        ...Dpts,
        ...(cutDA ? [cutDA] : [])
    ];

    const simplified = simplifyLoopConsecutiveCollinearXZ(loopDetail, { tol: pointTol, minEdge });
    if (!simplified || simplified.length < 4) {
        if (warnings) warnings.push('Facade silhouette: produced invalid loop.');
        return null;
    }

    const area = signedArea(simplified);
    const finalLoop = area < 0 ? simplified.slice().reverse() : simplified;
    const finalDetail = area < 0 ? loopDetail.slice().reverse() : loopDetail;

    const depthMinsByFaceId = {
        A: qf(Math.min(...A.profile.map((p) => Number(p?.depth) || 0))),
        B: qf(Math.min(...B.profile.map((p) => Number(p?.depth) || 0))),
        C: qf(Math.min(...C.profile.map((p) => Number(p?.depth) || 0))),
        D: qf(Math.min(...D.profile.map((p) => Number(p?.depth) || 0)))
    };
    return {
        frames,
        loop: finalLoop,
        loopDetail: finalDetail,
        strips: [...A.strips, ...B.strips, ...C.strips, ...D.strips],
        depthMinsByFaceId
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
    const windowDefinitionItems = Array.isArray(windowDefinitions?.items) ? windowDefinitions.items : [];
    const windowDefinitionById = new Map();
    for (const entry of windowDefinitionItems) {
        const id = typeof entry?.id === 'string' ? entry.id : '';
        if (!id) continue;
        const settings = sanitizeWindowMeshSettings(entry?.settings ?? null);
        const widthMetersRaw = Number(settings?.width);
        const heightMetersRaw = Number(settings?.height);
        const widthMeters = Number.isFinite(widthMetersRaw) ? clamp(widthMetersRaw, 0.1, 20.0) : null;
        const heightMeters = Number.isFinite(heightMetersRaw) ? clamp(heightMetersRaw, 0.1, 20.0) : null;
        windowDefinitionById.set(id, {
            id,
            settings,
            widthMeters,
            heightMeters
        });
    }
    const windowMeshGenerator = new WindowMeshGenerator({ renderer, curveSegments: 28 });

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
        const minFaceLengthByFaceId = { A: Infinity, B: Infinity, C: Infinity, D: Infinity };
        let probeLoops = footprintLoops;

        for (const layer of safeLayers) {
            if (layer?.type !== LAYER_TYPE.FLOOR) continue;
            const planOffset = clamp(layer?.planOffset ?? 0.0, -8.0, 8.0);
            const { all: planLoops } = applyPlanOffset({ loops: probeLoops, offset: planOffset });
            const { outer: wallOuter } = applyWallInset({ loops: planLoops, inset: wallInset });
            const main = Array.isArray(wallOuter) ? wallOuter[0] : null;
            const frames = main ? computeQuadFacadeFramesFromLoop(main, { warnings: null }) : null;
            if (frames) {
                for (const faceId of ['A', 'B', 'C', 'D']) {
                    const L = Number(frames?.[faceId]?.length) || 0;
                    if (!(L > EPS)) continue;
                    minFaceLengthByFaceId[faceId] = Math.min(minFaceLengthByFaceId[faceId], L);
                }
            }
            probeLoops = planLoops.length ? planLoops : probeLoops;
        }

        for (const faceId of ['A', 'B', 'C', 'D']) {
            const facade = globalFacadeSpec?.[faceId] ?? null;
            const pattern = facade?.layout?.pattern ?? null;
            if (!pattern || typeof pattern !== 'object') continue;
            const refLen = minFaceLengthByFaceId[faceId];
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
            let facadeFrames = null;
            let facadeLoopDetail = null;
            let facadeStrips = null;
            let facadeDepthMinsByFaceId = null;

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
                const frames = main ? computeQuadFacadeFramesFromLoop(main, { warnings }) : null;
                if (frames) {
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
                        const len = Number(frames?.[faceId]?.length) || 0;

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
                    const res = computeQuadFacadeSilhouette({
                        wallOuter,
                        facades: next,
                        layerMaterial: layer.material,
                        warnings,
                        cornerStrategy: resolvedCornerStrategy,
                        cornerDebug: cornerDebugList
                    });
                    if (res?.loop?.length) {
                        wallOuterFacade = [res.loop];
                        facadeFrames = res.frames ?? null;
                        facadeLoopDetail = res.loopDetail ?? null;
                        facadeStrips = Array.isArray(res.strips) ? res.strips : null;
                        facadeDepthMinsByFaceId = res.depthMinsByFaceId ?? null;
                        if (facadeCornerDebugByLayerId && layerId && cornerDebugList && cornerDebugList.length) {
                            facadeCornerDebugByLayerId[layerId] = {
                                frames: res.frames ?? null,
                                corners: cornerDebugList
                            };
                        }
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
            const hasBayWindowFeatures = Array.isArray(facadeStrips) && facadeStrips.some((strip) => {
                const window = strip?.window && typeof strip.window === 'object' ? strip.window : null;
                return !!window && window.enabled !== false;
            });
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
            const wantsAnyWindowPlacement = winEnabled || hasBayWindowFeatures;
            const materialWindowWidth = winEnabled ? winWidth : 1.2;
            const materialWindowHeight = winEnabled ? winDesiredHeight : 1.6;

            const windowMat = wantsAnyWindowPlacement ? makeWindowMaterial({
                typeId: winTypeId,
                params: winParams,
                windowWidth: materialWindowWidth,
                windowHeight: materialWindowHeight,
                fakeDepth: winFakeDepth,
                pbr: winPbr
            }) : null;

            const reflectiveCfg = winVisualsOverride ? resolveBuildingWindowReflectiveConfig(winVisualsOverride) : baseReflectiveCfg;
            const glassLift = reflectiveCfg.layerOffset;
            const glassIsOverride = baseVisualsOverride || !!winVisualsOverride;
            const windowGlassMat = (wantsAnyWindowPlacement && windowMat) ? makeGlassMaterial(getWindowGlassMaskTexture({
                typeId: winTypeId,
                params: winParams,
                windowWidth: materialWindowWidth,
                windowHeight: materialWindowHeight
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

            const bayWindowPlacements = [];
            if (hasBayWindowFeatures && windowMat && facadeFrames && Array.isArray(facadeStrips)) {
                for (const strip of facadeStrips) {
                    const type = typeof strip?.type === 'string' ? strip.type : '';
                    if (type !== 'bay') continue;

                    const windowCfg = strip?.window && typeof strip.window === 'object' ? strip.window : null;
                    if (!windowCfg || windowCfg.enabled === false) continue;

                    const faceId = strip?.faceId;
                    if (faceId !== 'A' && faceId !== 'B' && faceId !== 'C' && faceId !== 'D') continue;
                    const frame = facadeFrames?.[faceId] ?? null;
                    if (!frame) continue;

                    const rawU0 = Number(strip?.frontU0);
                    const rawU1 = Number(strip?.frontU1);
                    const u0 = Number.isFinite(rawU0) ? rawU0 : (Number(strip?.u0) || 0);
                    const u1 = Number.isFinite(rawU1) ? rawU1 : (Number(strip?.u1) || 0);
                    const span = Math.max(0, u1 - u0);
                    if (!(span > EPS)) continue;

                    const padding = windowCfg?.padding && typeof windowCfg.padding === 'object' ? windowCfg.padding : null;
                    const leftPad = clamp(padding?.leftMeters ?? 0, 0, 9999);
                    const rightPad = clamp(padding?.rightMeters ?? 0, 0, 9999);
                    const usable = span - leftPad - rightPad;
                    if (!(usable > EPS)) {
                        warnings.push(`${faceId}:${strip?.id || 'bay'}: window padding leaves no usable bay width.`);
                        continue;
                    }

                    const defId = typeof windowCfg?.defId === 'string' ? windowCfg.defId : '';
                    const def = defId ? (windowDefinitionById.get(defId) ?? null) : null;
                    if (!def) {
                        warnings.push(`${faceId}:${strip?.id || 'bay'}: window definition "${defId || '(missing)'}" not found.`);
                        continue;
                    }

                    const widthSpec = windowCfg?.width && typeof windowCfg.width === 'object' ? windowCfg.width : null;
                    const minWidthRaw = Number(widthSpec?.minMeters);
                    const minWidth = Number.isFinite(minWidthRaw)
                        ? clamp(minWidthRaw, 0.1, 9999)
                        : (Number.isFinite(def.widthMeters) ? def.widthMeters : 0.1);
                    const maxRaw = widthSpec?.maxMeters;
                    const maxWidth = (maxRaw === null || maxRaw === undefined) ? Infinity : clamp(maxRaw, minWidth, 9999);
                    if (usable + 1e-6 < minWidth) {
                        warnings.push(`${faceId}:${strip?.id || 'bay'}: usable width ${usable.toFixed(2)}m is below window min ${minWidth.toFixed(2)}m.`);
                        continue;
                    }

                    let width = Number.isFinite(def.widthMeters) ? def.widthMeters : minWidth;
                    width = clamp(width, minWidth, Number.isFinite(maxWidth) ? maxWidth : 9999);
                    width = Math.min(width, usable);
                    if (!(width > EPS)) continue;

                    const centerU = u0 + leftPad + usable * 0.5;
                    const depth0Raw = Number(strip?.depth0);
                    const depth1Raw = Number(strip?.depth1);
                    const depthRaw = Number(strip?.depth);
                    const depth = Number.isFinite(depth0Raw) && Number.isFinite(depth1Raw)
                        ? ((depth0Raw + depth1Raw) * 0.5)
                        : (Number.isFinite(depthRaw) ? depthRaw : 0);

                    const center = pointOnFacadeFrame({ frame, u: centerU, depth });
                    const nx = Number(frame?.n?.x) || 0;
                    const nz = Number(frame?.n?.z) || 0;
                    const yaw = Math.atan2(nx, nz);
                    const height = Number.isFinite(def.heightMeters) ? def.heightMeters : winDesiredHeight;

                    bayWindowPlacements.push({
                        faceId,
                        defId,
                        settings: def.settings,
                        x: center.x,
                        z: center.z,
                        yaw,
                        nx,
                        nz,
                        width,
                        height
                    });
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
                    const wantsFacadeWall = wantsFacadeSilhouette
                        && facadeLoopDetail
                        && wallOuterFacade.length === 1
                        && !wallHoles.length;

                    const outerLoop = wallOuterFacade[0] ?? null;
                    const yOffset = layerStartY - baseY;
                    const facadeWallMaterials = [wallMat];
                    const facadeWallSegmentOverrides = new Map();

                    if (wantsFacadeWall && facadeFrames && Array.isArray(facadeStrips) && facadeStrips.length) {
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
                        const getFacadeMaterialIndex = ({ materialSpec = null, wallBase = null, tiling = null, materialVariation = null } = {}) => {
                            const specKey = materialKey(materialSpec);
                            if (!specKey) return 0;
                            const key = configKey({ materialSpec, wallBase, tiling, materialVariation });
                            if (key === baseKey) return 0;
                            const existing = cache.get(key);
                            if (Number.isInteger(existing)) return existing;

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

                            facadeWallMaterials.push(mat);
                            const idx = facadeWallMaterials.length - 1;
                            cache.set(key, idx);
                            return idx;
                        };

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

                            const shouldApply = !!matKey && key !== baseKey && w > 1e-5;
                            if (shouldApply) {
                                const materialIndex = getFacadeMaterialIndex({ materialSpec: resolvedSpec, wallBase, tiling, materialVariation });
                                const segKey = facadeStripSegmentKey(faceId, u0, depth0, u1, depth1);
                                facadeWallSegmentOverrides.set(segKey, { materialIndex, faceId, u0, u1, uvStart });

                                const rangeKey = `__ranges__:${faceId}`;
                                const ranges = facadeWallSegmentOverrides.get(rangeKey);
                                if (Array.isArray(ranges)) {
                                    ranges.push({ materialIndex, faceId, u0, u1, uvStart });
                                } else if (ranges === undefined) {
                                    facadeWallSegmentOverrides.set(rangeKey, [{ materialIndex, faceId, u0, u1, uvStart }]);
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

                    let facadeWallCutouts = null;
                    let facadeWallYSlices = null;
                    if (wantsFacadeWall && bayWindowPlacements.length) {
                        facadeWallCutouts = [];
                        facadeWallYSlices = [];
                        let yCursorLocal = 0.0;
                        let pendingExtra = firstFloorPendingExtra;
                        for (let floor = 0; floor < floors; floor++) {
                            const segHeight = floorHeight + (floor === 0 ? pendingExtra : 0);
                            if (floor === 0) pendingExtra = 0;
                            facadeWallYSlices.push({ y0: yCursorLocal, y1: yCursorLocal + segHeight });

                            for (let i = 0; i < bayWindowPlacements.length; i++) {
                                const placement = bayWindowPlacements[i];
                                const faceId = placement?.faceId;
                                if (faceId !== 'A' && faceId !== 'B' && faceId !== 'C' && faceId !== 'D') continue;

                                const width = Math.max(0.1, Number(placement?.width) || 0.1);
                                const desiredHeight = Math.max(0.1, Number(placement?.height) || 0.1);
                                const windowHeight = Math.min(desiredHeight, Math.max(0.3, segHeight * 0.95));
                                const y = yCursorLocal + (segHeight - windowHeight) * 0.5 + windowHeight * 0.5;

                                const defSettings = placement?.settings && typeof placement.settings === 'object' ? placement.settings : null;
                                if (!defSettings) continue;

                                const mergedSettings = sanitizeWindowMeshSettings({
                                    ...defSettings,
                                    width,
                                    height: windowHeight
                                });
                                const frameWidth = Math.max(0, Number(mergedSettings?.frame?.width) || 0);
                                const cutWidth = width - frameWidth * 2;
                                const cutHeight = windowHeight - frameWidth * 2;
                                if (!(cutWidth > 0.02) || !(cutHeight > 0.02)) continue;

                                const wantsArch = !!mergedSettings?.arch?.enabled;
                                const archRatio = Number(mergedSettings?.arch?.heightRatio) || 0;
                                const outerArchRise = wantsArch ? (archRatio * width) : 0;
                                const innerWantsArch = wantsArch && outerArchRise > EPS;
                                const archRiseCandidate = innerWantsArch ? (archRatio * cutWidth) : 0;
                                const archRise = Math.min(archRiseCandidate, Math.max(0, cutHeight - frameWidth));
                                const cutWantsArch = innerWantsArch && archRise > EPS;
                                const revealDepth = Math.max(0, Number(mergedSettings?.frame?.inset) || 0);

                                facadeWallCutouts.push({
                                    faceId,
                                    x: Number(placement?.x) || 0,
                                    y,
                                    z: Number(placement?.z) || 0,
                                    width: cutWidth,
                                    height: cutHeight,
                                    wantsArch: cutWantsArch,
                                    archRise,
                                    revealDepth
                                });
                            }

                            yCursorLocal += segHeight;
                            if (beltEnabled && beltHeight > EPS) {
                                facadeWallYSlices.push({ y0: yCursorLocal, y1: yCursorLocal + beltHeight });
                                yCursorLocal += beltHeight;
                            }
                        }
                        if (!facadeWallCutouts.length) {
                            facadeWallCutouts = null;
                            facadeWallYSlices = null;
                        }
                    }

                    const facadeGeo = wantsFacadeWall
                        ? buildWallSidesGeometryFromLoopDetailXZ(facadeLoopDetail, {
                            height: totalWallHeight,
                            uvBaseV: yOffset,
                            segmentOverrides: facadeWallSegmentOverrides,
                            cutouts: facadeWallCutouts,
                            ySlices: facadeWallYSlices
                        })
                        : null;

                    if (wantsFacadeWall && outerLoop && facadeGeo) {
                        applyMatVarCornerDistanceToGeometry(facadeGeo, { loops: [outerLoop] });

                        const mesh = new THREE.Mesh(facadeGeo, facadeWallMaterials);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.position.y = layerStartY;
                        mesh.userData = mesh.userData ?? {};
                        mesh.userData.buildingFab2Role = 'wall';
                        mesh.userData.buildingFab2WallKind = 'facade';
                        mesh.userData.buildingFab2WallBaseMaterialIndex = 0;
                        solidMeshes.push(mesh);

                        if (showWire) {
                            const edgeGeo = new THREE.EdgesGeometry(facadeGeo, 1);
                            appendWirePositions(wirePositions, edgeGeo, layerStartY);
                            edgeGeo.dispose();
                        }

                        const frames = facadeFrames && typeof facadeFrames === 'object' ? facadeFrames : null;
                        const depthMins = facadeDepthMinsByFaceId && typeof facadeDepthMinsByFaceId === 'object'
                            ? facadeDepthMinsByFaceId
                            : null;

                        const baseJoinByCornerId = (frames && depthMins) ? {
                            AB: cornerJoinPointWithDepths(frames.A, depthMins.A ?? 0, frames.B, depthMins.B ?? 0, frames.A.end),
                            BC: cornerJoinPointWithDepths(frames.B, depthMins.B ?? 0, frames.C, depthMins.C ?? 0, frames.B.end),
                            CD: cornerJoinPointWithDepths(frames.C, depthMins.C ?? 0, frames.D, depthMins.D ?? 0, frames.C.end),
                            DA: cornerJoinPointWithDepths(frames.D, depthMins.D ?? 0, frames.A, depthMins.A ?? 0, frames.D.end)
                        } : null;

                        const basePointForFacade = (p) => {
                            if (!p || typeof p !== 'object') return { x: 0, y: 0, z: 0 };
                            const cornerId = typeof p.cornerId === 'string' ? p.cornerId : '';
                            if (cornerId) {
                                const join = baseJoinByCornerId?.[cornerId] ?? null;
                                if (join) return join;
                            }
                            const faceId = p.faceId;
                            if ((faceId === 'A' || faceId === 'B' || faceId === 'C' || faceId === 'D') && frames && depthMins) {
                                const frame = frames[faceId] ?? null;
                                const u = Number(p.u) || 0;
                                const d = Number(depthMins[faceId]) || 0;
                                return pointOnFacadeFrame({ frame, u, depth: d });
                            }
                            return { x: Number(p.x) || 0, y: 0, z: Number(p.z) || 0 };
                        };

                        const capY = layerStartY + totalWallHeight;
                        const outerDetail = Array.isArray(facadeLoopDetail) ? facadeLoopDetail : null;
                        const baseLoopCore = baseJoinByCornerId ? [
                            baseJoinByCornerId.AB,
                            baseJoinByCornerId.BC,
                            baseJoinByCornerId.CD,
                            baseJoinByCornerId.DA
                        ] : null;
                        const baseDetail = outerDetail ? outerDetail.map(basePointForFacade) : null;
                        const baseLoop = baseLoopCore
                            ? baseLoopCore
                            : (baseDetail ? simplifyLoopConsecutiveCollinearXZ(baseDetail, { tol: 1e-4, minEdge: 1e-3 }) : null);

                        if (baseLoop && baseLoop.length >= 3) {
                            const baseArea = signedArea(baseLoop);
                            const baseLoopCcw = baseArea < 0 ? baseLoop.slice().reverse() : baseLoop;
                            const baseShape = buildShapeFromLoops({ outerLoop: baseLoopCcw, holeLoops: [] });
                            const baseGeo = new THREE.ShapeGeometry(baseShape);
                            baseGeo.rotateX(-Math.PI / 2);
                            baseGeo.computeVertexNormals();

                            const baseMat = roofMatTemplate.clone();
                            const baseMesh = new THREE.Mesh(baseGeo, baseMat);
                            baseMesh.castShadow = true;
                            baseMesh.receiveShadow = true;
                            baseMesh.position.y = capY;
                            baseMesh.userData = baseMesh.userData ?? {};
                            baseMesh.userData.buildingFab2Role = 'roof';
                            baseMesh.userData.buildingFab2RoofKind = 'core';
                            solidMeshes.push(baseMesh);

                            if (showWire) {
                                const edgeGeo = new THREE.EdgesGeometry(baseGeo, 1);
                                appendWirePositions(wirePositions, edgeGeo, baseMesh.position.y);
                                edgeGeo.dispose();
                            }
                        }

                        if (outerDetail && outerDetail.length >= 3) {
                            const ringPositions = [];
                            const ringUvs = [];
                            const ringIndices = [];
                            let vCursor = 0;
                            const ringMinEdge = 1e-5;
                            const ringEps = 1e-5;

                            for (let i = 0; i < outerDetail.length; i++) {
                                const oa = outerDetail[i];
                                const ob = outerDetail[(i + 1) % outerDetail.length];
                                if (!oa || !ob) continue;
                                const ax = Number(oa.x) || 0;
                                const az = Number(oa.z) || 0;
                                const bx = Number(ob.x) || 0;
                                const bz = Number(ob.z) || 0;
                                const segLen = Math.hypot(bx - ax, bz - az);
                                if (!(segLen > ringMinEdge)) continue;

                                const ba = basePointForFacade(oa);
                                const bb = basePointForFacade(ob);
                                const da = Math.hypot(ax - ba.x, az - ba.z);
                                const db = Math.hypot(bx - bb.x, bz - bb.z);
                                if (!(da > ringEps) && !(db > ringEps)) continue;

                                const addUv = (p) => {
                                    ringUvs.push(Number(p.x) || 0, Number(p.z) || 0);
                                };

                                if (!(da > ringEps)) {
                                    ringPositions.push(
                                        ba.x, 0, ba.z,
                                        bb.x, 0, bb.z,
                                        bx, 0, bz
                                    );
                                    addUv(ba);
                                    addUv(bb);
                                    addUv(ob);
                                    ringIndices.push(vCursor, vCursor + 1, vCursor + 2);
                                    vCursor += 3;
                                    continue;
                                }

                                if (!(db > ringEps)) {
                                    ringPositions.push(
                                        ba.x, 0, ba.z,
                                        bb.x, 0, bb.z,
                                        ax, 0, az
                                    );
                                    addUv(ba);
                                    addUv(bb);
                                    addUv(oa);
                                    ringIndices.push(vCursor, vCursor + 1, vCursor + 2);
                                    vCursor += 3;
                                    continue;
                                }

                                ringPositions.push(
                                    ba.x, 0, ba.z,
                                    bb.x, 0, bb.z,
                                    bx, 0, bz,
                                    ax, 0, az
                                );
                                addUv(ba);
                                addUv(bb);
                                addUv(ob);
                                addUv(oa);
                                ringIndices.push(
                                    vCursor, vCursor + 1, vCursor + 2,
                                    vCursor, vCursor + 2, vCursor + 3
                                );
                                vCursor += 4;
                            }

                            if (ringPositions.length && ringIndices.length) {
                                const ringGeo = new THREE.BufferGeometry();
                                ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ringPositions), 3));
                                ringGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ringUvs), 2));
                                ringGeo.setIndex(ringIndices);
                                ringGeo.computeVertexNormals();

                                const ringMat = roofMatTemplate.clone();
                                const ringMesh = new THREE.Mesh(ringGeo, ringMat);
                                ringMesh.castShadow = true;
                                ringMesh.receiveShadow = true;
                                ringMesh.position.y = capY;
                                ringMesh.userData = ringMesh.userData ?? {};
                                ringMesh.userData.buildingFab2Role = 'roof';
                                ringMesh.userData.buildingFab2RoofKind = 'cap_band';
                                solidMeshes.push(ringMesh);

                                if (showWire) {
                                    const edgeGeo = new THREE.EdgesGeometry(ringGeo, 1);
                                    appendWirePositions(wirePositions, edgeGeo, ringMesh.position.y);
                                    edgeGeo.dispose();
                                }
                            }
                        }
                    } else {
                        for (const loop of wallOuterFacade) {
                            if (!loop || loop.length < 3) continue;
                            const shape = buildShapeFromLoops({ outerLoop: loop, holeLoops: wallHoles });
                            let geo = new THREE.ExtrudeGeometry(shape, {
                                depth: totalWallHeight,
                                bevelEnabled: false,
                                steps: 1
                            });
                            geo.rotateX(-Math.PI / 2);
                            applyUvYContinuityOffsetToGeometry(geo, { yOffset: yOffset, materialIndex: 1 });
                            applyMatVarCornerDistanceToGeometry(geo, { loops: [loop, ...wallHoles] });
                            if (geo.index) geo = geo.toNonIndexed();
                            geo.computeVertexNormals();

                            const roofMat = roofMatTemplate.clone();
                            const mesh = new THREE.Mesh(geo, [roofMat, wallMat]);
                            mesh.castShadow = true;
                            mesh.receiveShadow = true;
                            mesh.position.y = layerStartY;
                            mesh.userData = mesh.userData ?? {};
                            mesh.userData.buildingFab2Role = 'wall';
                            mesh.userData.buildingFab2WallKind = 'extrude';
                            mesh.userData.buildingFab2WallBaseMaterialIndex = 1;
                            solidMeshes.push(mesh);

                            if (showWire) {
                                const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                                appendWirePositions(wirePositions, edgeGeo, layerStartY);
                                edgeGeo.dispose();
                            }
                        }
                    }

                    const usingFacadeStrips = wantsFacadeSilhouette && facadeFrames && Array.isArray(facadeStrips) && facadeStrips.length;
                    const faceMaterials = layer?.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
                    if (faceMaterials && !usingFacadeStrips) {
                        const mainLoop = wallOuterFacade[0] ?? null;
                        const frames = mainLoop ? computeQuadFacadeFramesFromLoop(mainLoop, { warnings }) : null;
                        if (frames) {

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

                                const frame = frames?.[faceId] ?? null;
                                const w = Number(frame?.length) || 0;
                                if (!(w > EPS)) continue;

                                const cx = ((Number(frame?.start?.x) || 0) + (Number(frame?.end?.x) || 0)) * 0.5 + (Number(frame?.n?.x) || 0) * lift;
                                const cz = ((Number(frame?.start?.z) || 0) + (Number(frame?.end?.z) || 0)) * 0.5 + (Number(frame?.n?.z) || 0) * lift;
                                const yaw = Math.atan2(Number(frame?.n?.x) || 0, Number(frame?.n?.z) || 0);

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

                if (bayWindowPlacements.length) {
                    const customBuckets = new Map();
                    const addCustomInstance = ({ defId, settings, x, y, z, yaw, instanceId }) => {
                        const safeSettings = sanitizeWindowMeshSettings(settings ?? null);
                        const key = JSON.stringify(safeSettings);
                        let bucket = customBuckets.get(key);
                        if (!bucket) {
                            bucket = {
                                defId: typeof defId === 'string' ? defId : '',
                                settings: safeSettings,
                                instances: []
                            };
                            customBuckets.set(key, bucket);
                        }
                        bucket.instances.push({
                            id: instanceId,
                            position: { x, y, z },
                            yaw
                        });
                    };

                    for (let i = 0; i < bayWindowPlacements.length; i++) {
                        const placement = bayWindowPlacements[i];
                        const width = Math.max(0.1, Number(placement?.width) || 0.1);
                        const desiredHeight = Math.max(0.1, Number(placement?.height) || 0.1);
                        const windowHeight = Math.min(desiredHeight, Math.max(0.3, segHeight * 0.95));
                        const y = yCursor + (segHeight - windowHeight) * 0.5 + windowHeight * 0.5;
                        const x = Number(placement?.x) || 0;
                        const z = Number(placement?.z) || 0;
                        const yaw = Number(placement?.yaw) || 0;
                        const nx = Number(placement?.nx) || 0;
                        const nz = Number(placement?.nz) || 0;
                        const defId = typeof placement?.defId === 'string' ? placement.defId : '';
                        const defSettings = placement?.settings && typeof placement.settings === 'object' ? placement.settings : null;

                        if (defSettings) {
                            const mergedSettings = sanitizeWindowMeshSettings({
                                ...defSettings,
                                width,
                                height: windowHeight
                            });
                            const frameDepth = Math.max(0, Number(mergedSettings?.frame?.depth) || 0);
                            const frameInset = Math.max(0, frameDepth - 0.001);
                            addCustomInstance({
                                defId,
                                settings: mergedSettings,
                                x: x + nx * (windowOffset - frameInset),
                                y,
                                z: z + nz * (windowOffset - frameInset),
                                yaw,
                                instanceId: `${layerId || 'layer'}:${floor}:${i}:${defId || 'window'}`
                            });
                            continue;
                        }

                        if (!windowMat) continue;
                        const geo = getPlaneGeometry(width, windowHeight);
                        const px = x + nx * windowOffset;
                        const pz = z + nz * windowOffset;
                        addWindowInstance({ geometry: geo, material: windowMat, x: px, y, z: pz, yaw, renderOrder: 0 });

                        if (windowGlassMat) {
                            addWindowInstance({
                                geometry: geo,
                                material: windowGlassMat,
                                x: px + nx * glassLift,
                                y,
                                z: pz + nz * glassLift,
                                yaw,
                                renderOrder: 1
                            });
                        }
                    }

                    for (const bucket of customBuckets.values()) {
                        if (!bucket?.instances?.length) continue;
                        const group = windowMeshGenerator.createWindowGroup({
                            settings: bucket.settings,
                            seed: bucket.defId || 'bf2_window',
                            instances: bucket.instances
                        });
                        group.name = `bf2_window_${bucket.defId || 'custom'}`;
                        group.userData = group.userData ?? {};
                        group.userData.buildingWindowSource = 'bf2_window_definition';
                        group.userData.windowDefinitionId = bucket.defId || null;
                        windowsGroup.add(group);
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
            let roofSurfaceOuter = roofOuter;
            const roofSourceLayerId = typeof lastFloorLayer?.id === 'string' ? lastFloorLayer.id : '';
            const roofFacadeSpec = globalFacadeSpec
                ? globalFacadeSpec
                : ((roofSourceLayerId && facadesByLayerId?.[roofSourceLayerId] && typeof facadesByLayerId[roofSourceLayerId] === 'object')
                    ? facadesByLayerId[roofSourceLayerId]
                    : null);
            const wantsRoofFacadeSilhouette = !!roofFacadeSpec && ['A', 'B', 'C', 'D'].some((id) => !!roofFacadeSpec?.[id]);

            if (wantsRoofFacadeSilhouette && roofWallOuter.length) {
                const main = roofWallOuter[0] ?? null;
                const frames = main ? computeQuadFacadeFramesFromLoop(main, { warnings }) : null;
                if (frames) {
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
                        const len = Number(frames?.[faceId]?.length) || 0;

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

                    const res = computeQuadFacadeSilhouette({
                        wallOuter: roofWallOuter,
                        facades: next,
                        layerMaterial: null,
                        warnings,
                        cornerStrategy: resolvedCornerStrategy
                    });
                    if (res?.loop?.length) {
                        roofOuter = [res.loop];
                        const depthMins = res?.depthMinsByFaceId ?? null;
                        if (depthMins) {
                            const joinAB = cornerJoinPointWithDepths(frames.A, depthMins.A ?? 0, frames.B, depthMins.B ?? 0, frames.A.end);
                            const joinBC = cornerJoinPointWithDepths(frames.B, depthMins.B ?? 0, frames.C, depthMins.C ?? 0, frames.B.end);
                            const joinCD = cornerJoinPointWithDepths(frames.C, depthMins.C ?? 0, frames.D, depthMins.D ?? 0, frames.C.end);
                            const joinDA = cornerJoinPointWithDepths(frames.D, depthMins.D ?? 0, frames.A, depthMins.A ?? 0, frames.D.end);
                            const coreLoop = [joinAB, joinBC, joinCD, joinDA];
                            const area = signedArea(coreLoop);
                            roofSurfaceOuter = [area < 0 ? coreLoop.slice().reverse() : coreLoop];
                        }
                    } else {
                        warnings.push('Roof silhouette: falling back to inset wall loop.');
                    }
                }
            }

            for (const outerLoop of roofSurfaceOuter) {
                if (!outerLoop || outerLoop.length < 3) continue;
                const shape = buildShapeFromLoops({ outerLoop, holeLoops: roofHoles });
                const geo = new THREE.ShapeGeometry(shape);
                geo.rotateX(-Math.PI / 2);
                geo.computeVertexNormals();

                const mesh = new THREE.Mesh(geo, roofMat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.position.y = yCursor + 0.002;
                mesh.userData = mesh.userData ?? {};
                mesh.userData.buildingFab2Role = 'roof';
                mesh.userData.buildingFab2RoofKind = 'surface';
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

        const { outer: roofWallOuter, holes: roofWallHoles } = applyWallInset({ loops: currentLoops, inset: wallInset });

        let roofOuter = roofWallOuter;
        let roofHoles = roofWallHoles;
        let roofSurfaceOuter = roofOuter;
        const roofSourceLayerId = typeof topFloorLayer?.id === 'string' ? topFloorLayer.id : '';
        const roofFacadeSpec = globalFacadeSpec
            ? globalFacadeSpec
            : ((roofSourceLayerId && facadesByLayerId?.[roofSourceLayerId] && typeof facadesByLayerId[roofSourceLayerId] === 'object')
                ? facadesByLayerId[roofSourceLayerId]
                : null);
        const wantsRoofFacadeSilhouette = !!roofFacadeSpec && ['A', 'B', 'C', 'D'].some((id) => !!roofFacadeSpec?.[id]);

        if (wantsRoofFacadeSilhouette && roofWallOuter.length) {
            const main = roofWallOuter[0] ?? null;
            const frames = main ? computeQuadFacadeFramesFromLoop(main, { warnings }) : null;
            if (frames) {
                const links = topFloorLayer?.faceLinking?.links && typeof topFloorLayer.faceLinking.links === 'object'
                    ? topFloorLayer.faceLinking.links
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
                    const len = Number(frames?.[faceId]?.length) || 0;

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

                const res = computeQuadFacadeSilhouette({
                    wallOuter: roofWallOuter,
                    facades: next,
                    layerMaterial: null,
                    warnings,
                    cornerStrategy: resolvedCornerStrategy
                });
                if (res?.loop?.length) {
                    roofOuter = [res.loop];
                    const depthMins = res?.depthMinsByFaceId ?? null;
                    if (depthMins) {
                        const joinAB = cornerJoinPointWithDepths(frames.A, depthMins.A ?? 0, frames.B, depthMins.B ?? 0, frames.A.end);
                        const joinBC = cornerJoinPointWithDepths(frames.B, depthMins.B ?? 0, frames.C, depthMins.C ?? 0, frames.B.end);
                        const joinCD = cornerJoinPointWithDepths(frames.C, depthMins.C ?? 0, frames.D, depthMins.D ?? 0, frames.C.end);
                        const joinDA = cornerJoinPointWithDepths(frames.D, depthMins.D ?? 0, frames.A, depthMins.A ?? 0, frames.D.end);
                        const coreLoop = [joinAB, joinBC, joinCD, joinDA];
                        const area = signedArea(coreLoop);
                        roofSurfaceOuter = [area < 0 ? coreLoop.slice().reverse() : coreLoop];
                    }
                } else {
                    warnings.push('Roof silhouette: falling back to inset wall loop.');
                }
            }
        }

        for (const outerLoop of roofSurfaceOuter) {
            if (!outerLoop || outerLoop.length < 3) continue;
            const shape = buildShapeFromLoops({ outerLoop, holeLoops: roofHoles });
            const geo = new THREE.ShapeGeometry(shape);
            geo.rotateX(-Math.PI / 2);
            geo.computeVertexNormals();

            const mesh = new THREE.Mesh(geo, roofMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.position.y = yCursor + 0.002;
            mesh.userData = mesh.userData ?? {};
            mesh.userData.buildingFab2Role = 'roof';
            mesh.userData.buildingFab2RoofKind = 'surface';
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

export const __testOnly = Object.freeze({
    computeQuadFacadeFramesFromLoop,
    computeQuadFacadeSilhouette,
    buildWallSidesGeometryFromLoopDetailXZ
});
