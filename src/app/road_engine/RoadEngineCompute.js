// src/app/road_engine/RoadEngineCompute.js
// Pure rebuild pipeline for road-edge computation and derived debug primitives.
// Design: Returns plain serializable data so results are deterministic and renderer-agnostic.

import { normalizeRoadTileOffsetBoundary } from './RoadEngineTileOffset.js';
import { computeEdgeFilletArcXZ, lineIntersectionXZ, sampleArcXZ } from '../geometry/RoadEdgeFillet.js';

const EPS = 1e-9;
const TAU = Math.PI * 2;

function clampInt(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n | 0));
}

function safeId(value, fallback) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback;
}

function compareString(a, b) {
    const aa = String(a ?? '');
    const bb = String(b ?? '');
    if (aa < bb) return -1;
    if (aa > bb) return 1;
    return 0;
}

function normalizeDirXZ(a, b) {
    const dx = (b?.x ?? 0) - (a?.x ?? 0);
    const dz = (b?.z ?? 0) - (a?.z ?? 0);
    const len = Math.hypot(dx, dz);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: dx * inv, z: dz * inv, length: len };
}

function rightNormalXZ(dir) {
    return { x: -dir.z, z: dir.x };
}

function resolveOrigin(origin) {
    const ox = Number(origin?.x) || 0;
    const oz = Number(origin?.z) || 0;
    return { x: ox, z: oz };
}

function resolveFlags(flags) {
    const f = flags && typeof flags === 'object' ? flags : {};
    return {
        centerline: f.centerline !== false,
        directionCenterlines: f.directionCenterlines !== false,
        laneEdges: f.laneEdges !== false,
        asphaltEdges: f.asphaltEdges !== false,
        markers: f.markers !== false,
        asphaltObb: f.asphaltObb !== false
    };
}

function resolveTrim(trim, laneWidth) {
    const t = trim && typeof trim === 'object' ? trim : {};
    const debug = t.debug && typeof t.debug === 'object' ? t.debug : {};
    const threshold = Number.isFinite(t.threshold) ? Number(t.threshold) : (Number(laneWidth) || 4.8) * 0.1;
    return {
        enabled: t.enabled !== false,
        threshold,
        debug: {
            rawSegments: !!debug.rawSegments,
            strips: !!debug.strips,
            overlaps: !!debug.overlaps,
            intervals: !!debug.intervals,
            removedPieces: !!debug.removedPieces,
            keptPieces: !!debug.keptPieces,
            droppedPieces: !!debug.droppedPieces
        }
    };
}

function resolveJunctions(junctions, laneWidth) {
    const j = junctions && typeof junctions === 'object' ? junctions : {};
    const debug = j.debug && typeof j.debug === 'object' ? j.debug : {};
    const thresholdFactor = Number.isFinite(j.thresholdFactor) ? Number(j.thresholdFactor) : 1.5;
    const minThreshold = Number.isFinite(j.minThreshold) ? Number(j.minThreshold) : (Number(laneWidth) || 4.8) * 1.5;
    const maxThreshold = Number.isFinite(j.maxThreshold) ? Number(j.maxThreshold) : Infinity;
    const autoCreate = j.autoCreate === true;
    const filletRadiusFactorRaw = Number(j.filletRadiusFactor);
    const filletRadiusFactor = Number.isFinite(filletRadiusFactorRaw) ? Math.max(0, Math.min(1, filletRadiusFactorRaw)) : 1;
    const mergedConnectorIds = Array.isArray(j.mergedConnectorIds) ? j.mergedConnectorIds.filter((v) => typeof v === 'string' && v.trim()) : [];
    const manualJunctions = Array.isArray(j.manualJunctions) ? j.manualJunctions.filter((v) => v && typeof v === 'object') : [];
    const hiddenJunctionIds = Array.isArray(j.hiddenJunctionIds) ? j.hiddenJunctionIds.filter((v) => typeof v === 'string' && v.trim()) : [];
    const suppressedAutoJunctionIds = Array.isArray(j.suppressedAutoJunctionIds) ? j.suppressedAutoJunctionIds.filter((v) => typeof v === 'string' && v.trim()) : [];
    return {
        enabled: j.enabled !== false,
        thresholdFactor,
        minThreshold,
        maxThreshold,
        autoCreate,
        filletRadiusFactor,
        mergedConnectorIds,
        manualJunctions,
        hiddenJunctionIds,
        suppressedAutoJunctionIds,
        debug: {
            endpoints: !!debug.endpoints,
            boundary: !!debug.boundary,
            connectors: !!debug.connectors,
            tat: !!debug.tat,
            rejected: !!debug.rejected,
            edgeOrder: !!debug.edgeOrder
        }
    };
}

export function resolveRoadEngineSettings(settings = {}) {
    const tileSize = Number(settings.tileSize) || 24;
    const laneWidth = Number(settings.laneWidth) || 4.8;
    const marginFactor = Number.isFinite(settings.marginFactor) ? Number(settings.marginFactor) : 0.1;
    const origin = resolveOrigin(settings.origin);
    const flags = resolveFlags(settings.flags);
    const trim = resolveTrim(settings.trim, laneWidth);
    const junctions = resolveJunctions(settings.junctions, laneWidth);
    return {
        tileSize,
        laneWidth,
        marginFactor,
        origin,
        flags,
        trim,
        junctions
    };
}

function pointWorldPosition(point, settings) {
    const tileX = Number(point?.tileX) || 0;
    const tileY = Number(point?.tileY) || 0;
    const offsetU = Number(point?.offsetU) || 0;
    const offsetV = Number(point?.offsetV) || 0;
    const tileSize = Number(settings?.tileSize) || 24;
    const origin = settings?.origin ?? { x: 0, z: 0 };
    return {
        x: origin.x + (tileX + offsetU) * tileSize,
        z: origin.z + (tileY + offsetV) * tileSize
    };
}

function normalizePoint(raw, { roadId, index, settings }) {
    const id = safeId(raw?.id, `pt_${roadId}_${index}`);
    const tileSize = Number(settings?.tileSize) || 24;
    const rawU = Number(raw?.offsetU);
    const rawV = Number(raw?.offsetV);
    const offsetU = Number.isFinite(rawU) ? rawU : (Number(raw?.offsetX) || 0) / tileSize;
    const offsetV = Number.isFinite(rawV) ? rawV : (Number(raw?.offsetY) || 0) / tileSize;
    const norm = normalizeRoadTileOffsetBoundary(
        {
            tileX: Number(raw?.tileX) || 0,
            tileY: Number(raw?.tileY) || 0,
            offsetU,
            offsetV
        },
        { tileSize }
    );
    const tangentFactor = Number.isFinite(raw?.tangentFactor) ? Number(raw.tangentFactor) : 1;
    const world = pointWorldPosition(norm, settings);
    return {
        id,
        tileX: norm.tileX,
        tileY: norm.tileY,
        offsetU: norm.offsetU,
        offsetV: norm.offsetV,
        tangentFactor,
        world
    };
}

function offsetPointXZ(p, right, offset) {
    return {
        x: (p?.x ?? 0) + right.x * offset,
        z: (p?.z ?? 0) + right.z * offset
    };
}

function makePolyline({ segmentId, roadId, kind, offset, right, aPoint, bPoint }) {
    const id = `${segmentId}__${kind}`;
    const a = offsetPointXZ(aPoint.world, right, offset);
    const b = offsetPointXZ(bPoint.world, right, offset);
    return {
        id,
        kind,
        roadId,
        segmentId,
        offset,
        points: [
            {
                id: `${id}__${aPoint.id}`,
                x: a.x,
                z: a.z,
                tangentFactor: aPoint.tangentFactor,
                roadPointId: aPoint.id
            },
            {
                id: `${id}__${bPoint.id}`,
                x: b.x,
                z: b.z,
                tangentFactor: bPoint.tangentFactor,
                roadPointId: bPoint.id
            }
        ]
    };
}

function segmentCorners(aWorld, bWorld, right, leftWidth, rightWidth) {
    const aL = offsetPointXZ(aWorld, right, -leftWidth);
    const aR = offsetPointXZ(aWorld, right, rightWidth);
    const bR = offsetPointXZ(bWorld, right, rightWidth);
    const bL = offsetPointXZ(bWorld, right, -leftWidth);
    return [aL, aR, bR, bL];
}

function computeAabb(points) {
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const p of points) {
        const x = p?.x ?? 0;
        const z = p?.z ?? 0;
        if (x < minX) minX = x;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (z > maxZ) maxZ = z;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minZ) || !Number.isFinite(maxX) || !Number.isFinite(maxZ)) {
        return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
    }
    return { minX, minZ, maxX, maxZ };
}

function cross2(a, b) {
    return (a?.x ?? 0) * (b?.z ?? 0) - (a?.z ?? 0) * (b?.x ?? 0);
}

function dot2(a, b) {
    return (a?.x ?? 0) * (b?.x ?? 0) + (a?.z ?? 0) * (b?.z ?? 0);
}

function polygonArea(points) {
    const pts = Array.isArray(points) ? points : [];
    const n = pts.length;
    if (n < 3) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        sum += (a?.x ?? 0) * (b?.z ?? 0) - (b?.x ?? 0) * (a?.z ?? 0);
    }
    return sum * 0.5;
}

function ensureCcw(points) {
    const pts = Array.isArray(points) ? points : [];
    if (pts.length < 3) return pts;
    if (polygonArea(pts) >= 0) return pts;
    return pts.slice().reverse();
}

function fnv1a32(str) {
    const s = String(str ?? '');
    let hash = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        hash ^= s.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

function stableHashId(prefix, key) {
    const hex = fnv1a32(key).toString(16).padStart(8, '0');
    return `${prefix}${hex}`;
}

function lineIntersectionParam(p, q, a, b) {
    const r = { x: (q?.x ?? 0) - (p?.x ?? 0), z: (q?.z ?? 0) - (p?.z ?? 0) };
    const s = { x: (b?.x ?? 0) - (a?.x ?? 0), z: (b?.z ?? 0) - (a?.z ?? 0) };
    const denom = cross2(r, s);
    if (Math.abs(denom) <= EPS) return null;
    const ap = { x: (a?.x ?? 0) - (p?.x ?? 0), z: (a?.z ?? 0) - (p?.z ?? 0) };
    return cross2(ap, s) / denom;
}

function clipPolygon(subject, clip) {
    let output = ensureCcw(subject);
    const clipPts = ensureCcw(clip);
    if (output.length < 3 || clipPts.length < 3) return [];

    for (let i = 0; i < clipPts.length; i++) {
        const a = clipPts[i];
        const b = clipPts[(i + 1) % clipPts.length];
        const input = output;
        output = [];
        if (input.length < 3) break;

        const edge = { x: (b?.x ?? 0) - (a?.x ?? 0), z: (b?.z ?? 0) - (a?.z ?? 0) };
        const inside = (p) => cross2(edge, { x: (p?.x ?? 0) - (a?.x ?? 0), z: (p?.z ?? 0) - (a?.z ?? 0) }) >= -EPS;

        for (let j = 0; j < input.length; j++) {
            const p = input[j];
            const q = input[(j + 1) % input.length];
            const pIn = inside(p);
            const qIn = inside(q);

            if (pIn && qIn) {
                output.push({ x: q.x, z: q.z });
                continue;
            }
            if (pIn && !qIn) {
                const t = lineIntersectionParam(p, q, a, b);
                if (t !== null) {
                    const tt = Math.max(0, Math.min(1, t));
                    output.push({ x: (p.x ?? 0) + ((q.x ?? 0) - (p.x ?? 0)) * tt, z: (p.z ?? 0) + ((q.z ?? 0) - (p.z ?? 0)) * tt });
                }
                continue;
            }
            if (!pIn && qIn) {
                const t = lineIntersectionParam(p, q, a, b);
                if (t !== null) {
                    const tt = Math.max(0, Math.min(1, t));
                    output.push({ x: (p.x ?? 0) + ((q.x ?? 0) - (p.x ?? 0)) * tt, z: (p.z ?? 0) + ((q.z ?? 0) - (p.z ?? 0)) * tt });
                }
                output.push({ x: q.x, z: q.z });
            }
        }
    }

    if (output.length < 3) return [];
    const cleaned = [];
    for (const p of output) {
        const last = cleaned[cleaned.length - 1] ?? null;
        if (last && Math.hypot((p.x ?? 0) - (last.x ?? 0), (p.z ?? 0) - (last.z ?? 0)) <= 1e-6) continue;
        cleaned.push(p);
    }
    if (cleaned.length >= 3) {
        const first = cleaned[0];
        const last = cleaned[cleaned.length - 1];
        if (first && last && Math.hypot((first.x ?? 0) - (last.x ?? 0), (first.z ?? 0) - (last.z ?? 0)) <= 1e-6) cleaned.pop();
    }
    return cleaned.length >= 3 ? cleaned : [];
}

function projectionsOverlapOnAxis(pointsA, pointsB, axis) {
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (const p of pointsA) {
        const v = dot2(p, axis);
        if (v < minA) minA = v;
        if (v > maxA) maxA = v;
    }
    for (const p of pointsB) {
        const v = dot2(p, axis);
        if (v < minB) minB = v;
        if (v > maxB) maxB = v;
    }
    if (!Number.isFinite(minA) || !Number.isFinite(maxA) || !Number.isFinite(minB) || !Number.isFinite(maxB)) return false;
    return !(maxA < minB - EPS || maxB < minA - EPS);
}

function satOverlapConvex(pointsA, pointsB, axes) {
    for (const axis of axes) {
        if (!projectionsOverlapOnAxis(pointsA, pointsB, axis)) return false;
    }
    return true;
}

function aabbOverlaps(a, b) {
    if (!a || !b) return false;
    return !(
        (a.maxX ?? 0) < (b.minX ?? 0) - EPS ||
        (b.maxX ?? 0) < (a.minX ?? 0) - EPS ||
        (a.maxZ ?? 0) < (b.minZ ?? 0) - EPS ||
        (b.maxZ ?? 0) < (a.minZ ?? 0) - EPS
    );
}

function projectPolygonToSegmentT(points, segStart, axis, length) {
    if (!Array.isArray(points) || points.length < 3) return null;
    if (!(length > EPS)) return null;
    let minT = Infinity;
    let maxT = -Infinity;
    for (const p of points) {
        const rel = { x: (p?.x ?? 0) - (segStart?.x ?? 0), z: (p?.z ?? 0) - (segStart?.z ?? 0) };
        const t = dot2(rel, axis) / length;
        if (t < minT) minT = t;
        if (t > maxT) maxT = t;
    }
    if (!Number.isFinite(minT) || !Number.isFinite(maxT)) return null;
    return { t0: minT, t1: maxT };
}

function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function segmentIntersectionXZ(a0, a1, b0, b1) {
    const p = { x: a0?.x ?? 0, z: a0?.z ?? 0 };
    const r = { x: (a1?.x ?? 0) - (a0?.x ?? 0), z: (a1?.z ?? 0) - (a0?.z ?? 0) };
    const q = { x: b0?.x ?? 0, z: b0?.z ?? 0 };
    const s = { x: (b1?.x ?? 0) - (b0?.x ?? 0), z: (b1?.z ?? 0) - (b0?.z ?? 0) };
    const denom = cross2(r, s);
    if (Math.abs(denom) <= EPS) return null;
    const qp = { x: q.x - p.x, z: q.z - p.z };
    const t = cross2(qp, s) / denom;
    const u = cross2(qp, r) / denom;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return { x: p.x + r.x * t, z: p.z + r.z * t };
}

function polygonSelfIntersectsXZ(points) {
    const pts = Array.isArray(points) ? points : [];
    const n = pts.length;
    if (n < 4) return false;
    const near = (a, b) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.z ?? 0) - (b?.z ?? 0)) <= 1e-6;
    for (let i = 0; i < n; i++) {
        const a0 = pts[i];
        const a1 = pts[(i + 1) % n];
        for (let j = i + 1; j < n; j++) {
            if (j === i) continue;
            if (j === (i + 1) % n) continue;
            if ((j + 1) % n === i) continue;
            const b0 = pts[j];
            const b1 = pts[(j + 1) % n];
            const hit = segmentIntersectionXZ(a0, a1, b0, b1);
            if (!hit) continue;
            if (near(hit, a0) || near(hit, a1) || near(hit, b0) || near(hit, b1)) continue;
            return true;
        }
    }
    return false;
}

function centroid(points) {
    const pts = Array.isArray(points) ? points : [];
    if (!pts.length) return { x: 0, z: 0 };
    let x = 0;
    let z = 0;
    for (const p of pts) {
        x += p?.x ?? 0;
        z += p?.z ?? 0;
    }
    const inv = 1 / pts.length;
    return { x: x * inv, z: z * inv };
}

function makeRectCorners(start, end, right, leftWidth, rightWidth) {
    return segmentCorners(start, end, right, leftWidth, rightWidth);
}

function comparePointsLex(a, b) {
    const ax = Number(a?.x) || 0;
    const az = Number(a?.z) || 0;
    const bx = Number(b?.x) || 0;
    const bz = Number(b?.z) || 0;
    if (ax < bx - 1e-9) return -1;
    if (ax > bx + 1e-9) return 1;
    if (az < bz - 1e-9) return -1;
    if (az > bz + 1e-9) return 1;
    return 0;
}

function convexHullXZ(points) {
    const pts = Array.isArray(points) ? points.slice() : [];
    pts.sort(comparePointsLex);
    const unique = [];
    for (const p of pts) {
        const last = unique[unique.length - 1] ?? null;
        if (last && Math.hypot((p?.x ?? 0) - (last.x ?? 0), (p?.z ?? 0) - (last.z ?? 0)) <= 1e-6) continue;
        unique.push({ x: Number(p?.x) || 0, z: Number(p?.z) || 0 });
    }
    if (unique.length < 3) return unique;

    const cross = (o, a, b) => ((a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x));

    const lower = [];
    for (const p of unique) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12) lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = unique.length - 1; i >= 0; i--) {
        const p = unique[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12) upper.pop();
        upper.push(p);
    }
    upper.pop();
    lower.pop();
    const hull = lower.concat(upper);
    return hull.length >= 3 ? ensureCcw(hull) : hull;
}

function normalizeVecXZ(dir) {
    if (!dir) return null;
    const x = Number(dir?.x) || 0;
    const z = Number(dir?.z) || 0;
    const len = Math.hypot(x, z);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: x * inv, z: z * inv, length: len };
}

function distXZ(a, b) {
    const dx = (Number(a?.x) || 0) - (Number(b?.x) || 0);
    const dz = (Number(a?.z) || 0) - (Number(b?.z) || 0);
    return Math.hypot(dx, dz);
}

function appendUniquePoint(out, p, eps = 1e-6) {
    if (!p) return;
    const last = out[out.length - 1] ?? null;
    if (last && distXZ(last, p) <= eps) return;
    out.push({ x: Number(p?.x) || 0, z: Number(p?.z) || 0 });
}

function wrapAngle(angle) {
    let a = angle % TAU;
    if (a < 0) a += TAU;
    return a;
}

function angleDeltaCCW(from, to) {
    return wrapAngle(to - from);
}

function circleCentersForChordXZ(a, b, radius) {
    const ax = Number(a?.x) || 0;
    const az = Number(a?.z) || 0;
    const bx = Number(b?.x) || 0;
    const bz = Number(b?.z) || 0;
    const dx = bx - ax;
    const dz = bz - az;
    const d = Math.hypot(dx, dz);
    if (!(d > 1e-6)) return null;
    const r = Number(radius) || 0;
    const minR = d * 0.5;
    if (!(r >= minR - 1e-9)) return null;
    const mx = (ax + bx) * 0.5;
    const mz = (az + bz) * 0.5;
    const h2 = r * r - minR * minR;
    if (!(h2 >= -1e-9)) return null;
    const h = Math.sqrt(Math.max(0, h2));
    const inv = 1 / d;
    const ux = dx * inv;
    const uz = dz * inv;
    const px = -uz;
    const pz = ux;
    const c1 = { x: mx + px * h, z: mz + pz * h };
    const c2 = { x: mx - px * h, z: mz - pz * h };
    return [c1, c2];
}

function chooseClosestPointXZ(candidates, hint) {
    const pts = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    if (!pts.length) return null;
    const h = hint && Number.isFinite(hint.x) && Number.isFinite(hint.z) ? hint : null;
    if (!h) return pts[0];
    let best = pts[0];
    let bestDist = distXZ(best, h);
    for (let i = 1; i < pts.length; i++) {
        const d = distXZ(pts[i], h);
        if (d < bestDist - 1e-9) {
            best = pts[i];
            bestDist = d;
        }
    }
    return best;
}

function chooseFarthestPointXZ(candidates, hint) {
    const pts = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    if (!pts.length) return null;
    const h = hint && Number.isFinite(hint.x) && Number.isFinite(hint.z) ? hint : null;
    if (!h) return pts[0];
    let best = pts[0];
    let bestDist = distXZ(best, h);
    for (let i = 1; i < pts.length; i++) {
        const d = distXZ(pts[i], h);
        if (d > bestDist + 1e-9) {
            best = pts[i];
            bestDist = d;
        }
    }
    return best;
}

function chooseArcCenterByHintXZ({ centers, a, b, radius, hint, prefer }) {
    const pts = Array.isArray(centers) ? centers.filter(Boolean) : [];
    if (!pts.length) return null;
    const h = hint && Number.isFinite(hint.x) && Number.isFinite(hint.z) ? hint : null;
    if (!h || pts.length === 1) return pts[0];

    const p0 = a ?? null;
    const p1 = b ?? null;
    if (!p0 || !p1) return pts[0];
    const r = Number(radius) || 0;
    if (!(r > 1e-6)) return pts[0];

    let best = pts[0];
    let bestDist = prefer === 'farthest' ? -Infinity : Infinity;

    const scorePoint = (center) => {
        const a0 = Math.atan2((Number(p0?.z) || 0) - center.z, (Number(p0?.x) || 0) - center.x);
        const a1 = Math.atan2((Number(p1?.z) || 0) - center.z, (Number(p1?.x) || 0) - center.x);
        const spanCCW = angleDeltaCCW(a0, a1);
        const spanCW = angleDeltaCCW(a1, a0);
        if (!(spanCCW > 1e-6) || !(spanCW > 1e-6)) return null;
        const ccw = spanCCW <= spanCW;
        const span = ccw ? spanCCW : spanCW;
        if (!(span > 1e-6) || span > Math.PI + 1e-6) return null;
        const midAng = ccw ? a0 + span * 0.5 : a0 - span * 0.5;
        const mid = { x: center.x + Math.cos(midAng) * r, z: center.z + Math.sin(midAng) * r };
        return distXZ(mid, h);
    };

    for (const c of pts) {
        const d = scorePoint(c);
        if (!Number.isFinite(d)) continue;
        if (prefer === 'farthest') {
            if (d > bestDist + 1e-9) {
                best = c;
                bestDist = d;
            }
            continue;
        }
        if (d < bestDist - 1e-9) {
            best = c;
            bestDist = d;
        }
    }

    return best;
}

function buildArcBetweenPointsXZ({ a, b, radius, centerHint = null, prefer = 'closest', chord = 0.5, maxSpan = Math.PI }) {
    const p0 = a ?? null;
    const p1 = b ?? null;
    if (!p0 || !p1) return null;
    const d = distXZ(p0, p1);
    if (!(d > 1e-6)) return null;

    const rMin = d * 0.5 + 1e-6;
    const rIn = Number(radius) || 0;
    let r = Math.max(rMin, rIn);
    const maxSpanClamped = Math.max(0.35, Math.min(Math.PI, Number(maxSpan) || Math.PI));
    if (maxSpanClamped < Math.PI - 1e-6) {
        const desired = d / (2 * Math.sin(maxSpanClamped * 0.5));
        if (Number.isFinite(desired) && desired > r + 1e-6) r = desired;
    }
    const centers = circleCentersForChordXZ(p0, p1, r);
    if (!centers) return null;
    const center = chooseArcCenterByHintXZ({ centers, a: p0, b: p1, radius: r, hint: centerHint, prefer }) ?? centers[0];
    if (!center) return null;

    const a0 = Math.atan2((Number(p0?.z) || 0) - center.z, (Number(p0?.x) || 0) - center.x);
    const a1 = Math.atan2((Number(p1?.z) || 0) - center.z, (Number(p1?.x) || 0) - center.x);
    const spanCCW = angleDeltaCCW(a0, a1);
    const spanCW = angleDeltaCCW(a1, a0);
    if (!(spanCCW > 1e-6) || !(spanCW > 1e-6)) return null;
    const ccw = spanCCW <= spanCW;
    const span = ccw ? spanCCW : spanCW;
    if (!(span > 1e-6) || span > Math.PI + 1e-6) return null;

    const arcLen = span * r;
    const segments = Math.max(6, Math.min(96, Math.ceil(arcLen / Math.max(0.2, Number(chord) || 0.5))));
    const points = sampleArcXZ({
        center,
        radius: r,
        startAng: a0,
        spanAng: span,
        ccw,
        segments
    });
    if (points.length < 2) return null;

    return {
        center,
        radius: r,
        startAng: a0,
        spanAng: span,
        ccw,
        length: arcLen,
        points
    };
}

function buildDegree2JunctionSurfaceXZ({ junctionId, endpoints, laneWidth, filletRadiusFactor }) {
    const eps = Array.isArray(endpoints) ? endpoints.filter(Boolean) : [];
    if (eps.length !== 2) return null;
    const e0 = eps[0];
    const e1 = eps[1];
    if (!e0?.leftEdge || !e0?.rightEdge || !e1?.leftEdge || !e1?.rightEdge) return null;

    const factor = Number.isFinite(filletRadiusFactor) ? Math.max(0, Math.min(1, Number(filletRadiusFactor))) : 1;

    const d0In = normalizeVecXZ({ x: -(Number(e0?.dirOut?.x) || 0), z: -(Number(e0?.dirOut?.z) || 0) });
    const d1In = normalizeVecXZ({ x: -(Number(e1?.dirOut?.x) || 0), z: -(Number(e1?.dirOut?.z) || 0) });
    if (!d0In || !d1In) return null;

    const getEdgePoint = (endpoint, side) => (side === 'left' ? endpoint.leftEdge : endpoint.rightEdge);

    const scorePairing = (a0, a1, b0, b1) => (
        distXZ(getEdgePoint(e0, a0), getEdgePoint(e1, a1))
        + distXZ(getEdgePoint(e0, b0), getEdgePoint(e1, b1))
    );

    const directScore = scorePairing('left', 'left', 'right', 'right');
    const swappedScore = scorePairing('left', 'right', 'right', 'left');
    const pairing = swappedScore < directScore - 1e-9
        ? { a0: 'left', a1: 'right', b0: 'right', b1: 'left' }
        : { a0: 'left', a1: 'left', b0: 'right', b1: 'right' };

    const chord = Math.max(0.12, (Number(laneWidth) || 4.8) * 0.03);
    const junctionCenter = centroid([e0?.world, e1?.world].filter(Boolean));
    const centerHint = (() => {
        const p0 = e0?.world ?? null;
        const p1 = e1?.world ?? null;
        if (!p0 || !p1) return null;
        const hit = lineIntersectionXZ(p0, d0In, p1, d1In);
        if (!hit) return null;
        const turnCos = Math.max(-1, Math.min(1, dot2(d0In, d1In)));
        const turnAngle = Math.acos(turnCos);
        const t0 = Number(hit?.t) || 0;
        const t1 = Number(hit?.u) || 0;
        if (!(t0 > 1e-6 && t1 > 1e-6)) return null;
        const distToMiter = Math.abs(t0 - t1) <= 1e-4 ? (t0 + t1) * 0.5 : Math.min(t0, t1);
        const radius = (turnAngle > 1e-6 && turnAngle < Math.PI - 1e-6) ? distToMiter * Math.tan(turnAngle * 0.5) * factor : 0;
        if (!(radius > 1e-6)) return null;

        const n0 = rightNormalXZ(d0In);
        const n1 = rightNormalXZ(d1In);
        const options0 = [n0, { x: -n0.x, z: -n0.z }];
        const options1 = [n1, { x: -n1.x, z: -n1.z }];

        let best = null;
        let bestErr = Infinity;
        let bestCenterDist = Infinity;
        for (const out0 of options0) {
            for (const out1 of options1) {
                const candidate = computeEdgeFilletArcXZ({ p0, dir0: d0In, out0, p1, dir1: d1In, out1, radius });
                if (!candidate?.center || !candidate?.tangent0 || !candidate?.tangent1) continue;
                const err = distXZ(candidate.tangent0, p0) + distXZ(candidate.tangent1, p1);
                const centerDist = junctionCenter ? distXZ(candidate.center, junctionCenter) : 0;
                if (err < bestErr - 1e-6) {
                    best = candidate;
                    bestErr = err;
                    bestCenterDist = centerDist;
                    continue;
                }
                if (Math.abs(err - bestErr) <= 1e-6 && centerDist < bestCenterDist - 1e-6) {
                    best = candidate;
                    bestCenterDist = centerDist;
                }
            }
        }

        return best?.center ?? null;
    })();

    const buildTat = ({ aSide, bSide }) => {
        const p0 = getEdgePoint(e0, aSide);
        const p1 = getEdgePoint(e1, bSide);
        const hit = lineIntersectionXZ(p0, d0In, p1, d1In);
        const turnCos = Math.max(-1, Math.min(1, dot2(d0In, d1In)));
        const turnAngle = Math.acos(turnCos);
        const d0 = Number(hit?.t) || 0;
        const d1 = Number(hit?.u) || 0;
        const buildTangents = hit
            ? [
                {
                    origin: { x: Number(p0.x) || 0, z: Number(p0.z) || 0 },
                    dir: { x: Number(d0In.x) || 0, z: Number(d0In.z) || 0 },
                    miter: { x: Number(hit.x) || 0, z: Number(hit.z) || 0 },
                    length: Math.abs(Number(hit.t) || 0)
                },
                {
                    origin: { x: Number(p1.x) || 0, z: Number(p1.z) || 0 },
                    dir: { x: Number(d1In.x) || 0, z: Number(d1In.z) || 0 },
                    miter: { x: Number(hit.x) || 0, z: Number(hit.z) || 0 },
                    length: Math.abs(Number(hit.u) || 0)
                }
            ]
            : null;
        const d = (d0 > 1e-6 && d1 > 1e-6)
            ? (Math.abs(d0 - d1) <= 1e-4 ? (d0 + d1) * 0.5 : Math.min(d0, d1))
            : 0;
        const radius = (d > 1e-6 && turnAngle > 1e-6 && turnAngle < Math.PI - 1e-6)
            ? d * Math.tan(turnAngle * 0.5) * factor
            : 0;
        let arc = null;
        if (radius > 1e-6) {
            const n0 = rightNormalXZ(d0In);
            const n1 = rightNormalXZ(d1In);
            const options0 = [n0, { x: -n0.x, z: -n0.z }];
            const options1 = [n1, { x: -n1.x, z: -n1.z }];

            let best = null;
            let bestErr = Infinity;
            let bestCenterScore = Infinity;
            for (const out0 of options0) {
                for (const out1 of options1) {
                    const candidate = computeEdgeFilletArcXZ({ p0, dir0: d0In, out0, p1, dir1: d1In, out1, radius });
                    if (!candidate?.center || !candidate?.tangent0 || !candidate?.tangent1) continue;
                    const err = distXZ(candidate.tangent0, p0) + distXZ(candidate.tangent1, p1);
                    const hint = centerHint ?? junctionCenter ?? null;
                    const centerScore = hint ? distXZ(candidate.center, hint) : 0;
                    if (err < bestErr - 1e-6) {
                        best = candidate;
                        bestErr = err;
                        bestCenterScore = centerScore;
                        continue;
                    }
                    if (Math.abs(err - bestErr) <= 1e-6 && centerScore < bestCenterScore - 1e-6) {
                        best = candidate;
                        bestCenterScore = centerScore;
                    }
                }
            }
            arc = best;
        }

        const tangents = [];
        const tangent0 = arc?.tangent0 ?? null;
        const tangent1 = arc?.tangent1 ?? null;
        if (tangent0) {
            tangents.push({
                a: { x: Number(p0.x) || 0, z: Number(p0.z) || 0 },
                b: { x: Number(tangent0.x) || 0, z: Number(tangent0.z) || 0 },
                length: distXZ(p0, tangent0)
            });
        }
        if (tangent1) {
            tangents.push({
                a: { x: Number(tangent1.x) || 0, z: Number(tangent1.z) || 0 },
                b: { x: Number(p1.x) || 0, z: Number(p1.z) || 0 },
                length: distXZ(tangent1, p1)
            });
        }
        if (!arc) {
            tangents.push({
                a: { x: Number(p0.x) || 0, z: Number(p0.z) || 0 },
                b: { x: Number(p1.x) || 0, z: Number(p1.z) || 0 },
                length: distXZ(p0, p1)
            });
        }

        const points = [];
        if (arc?.center && Number.isFinite(arc.radius) && arc.radius > 1e-6 && Number.isFinite(arc.startAng) && Number.isFinite(arc.spanAng) && arc.spanAng > 1e-6) {
            const arcLen = Math.abs(Number(arc.spanAng) || 0) * (Number(arc.radius) || 0);
            const segments = Math.max(6, Math.min(96, Math.ceil(arcLen / chord)));
            const arcPoints = sampleArcXZ({
                center: arc.center,
                radius: arc.radius,
                startAng: arc.startAng,
                spanAng: arc.spanAng,
                ccw: arc.ccw !== false,
                segments
            });
            for (const p of arcPoints) appendUniquePoint(points, p);
        } else {
            appendUniquePoint(points, p0);
            appendUniquePoint(points, p1);
        }

        const arcRec = arc?.center
            ? {
                center: { x: Number(arc.center?.x) || 0, z: Number(arc.center?.z) || 0 },
                radius: Number(arc.radius) || 0,
                startAng: Number(arc.startAng) || 0,
                spanAng: Number(arc.spanAng) || 0,
                ccw: arc.ccw !== false,
                length: Math.abs(Number(arc.spanAng) || 0) * (Number(arc.radius) || 0)
            }
            : null;

        const tatId = stableHashId('tat_', `${junctionId}|${e0?.id ?? ''}|${aSide}|${e1?.id ?? ''}|${bSide}`);
        return {
            id: tatId,
            type: 'pair',
            aEndpointId: e0?.id ?? null,
            aSide,
            bEndpointId: e1?.id ?? null,
            bSide,
            tangents,
            arc: arcRec,
            buildTangents,
            points,
            a: { x: Number(p0?.x) || 0, z: Number(p0?.z) || 0 },
            b: { x: Number(p1?.x) || 0, z: Number(p1?.z) || 0 }
        };
    };

    const tatA = buildTat({ aSide: pairing.a0, bSide: pairing.a1 });
    const tatB = buildTat({ aSide: pairing.b0, bSide: pairing.b1 });
    if (!tatA?.points?.length || !tatB?.points?.length) return null;

    const distA = distXZ(tatA.a, tatA.b);
    const distB = distXZ(tatB.a, tatB.b);
    const outer = distA >= distB ? tatA : tatB;
    const inner = distA >= distB ? tatB : tatA;
    outer.type = 'outer';
    inner.type = 'inner';

    const poly = [];
    const appendTatForward = (out, tat) => {
        appendUniquePoint(out, tat.a);
        for (const p of tat.points ?? []) appendUniquePoint(out, p);
        appendUniquePoint(out, tat.b);
    };
    const appendTatReverse = (out, tat) => {
        appendUniquePoint(out, tat.b);
        const rev = (tat.points ?? []).slice().reverse();
        for (const p of rev) appendUniquePoint(out, p);
        appendUniquePoint(out, tat.a);
    };

    appendTatForward(poly, outer);
    appendUniquePoint(poly, inner.b);
    appendTatReverse(poly, inner);
    appendUniquePoint(poly, outer.a);

    const cleaned = [];
    for (const p of poly) appendUniquePoint(cleaned, p);
    if (cleaned.length >= 3 && distXZ(cleaned[0], cleaned[cleaned.length - 1]) <= 1e-6) cleaned.pop();
    if (cleaned.length < 3) return null;

    let surface = ensureCcw(cleaned);
    if (polygonSelfIntersectsXZ(surface) || !(Math.abs(polygonArea(surface)) > 1e-6)) {
        surface = convexHullXZ(cleaned);
    }

    return {
        points: surface.map((p) => ({ x: Number(p?.x) || 0, z: Number(p?.z) || 0 })),
        tat: [outer, inner].map((t) => ({
            id: t.id,
            type: t.type,
            aEndpointId: t.aEndpointId,
            aSide: t.aSide,
            bEndpointId: t.bEndpointId,
            bSide: t.bSide,
            tangents: t.tangents,
            arc: t.arc,
            buildTangents: t.buildTangents ?? null
        }))
    };
}

function chooseFilletNormalTowardCenter(dir, point, center) {
    const d = normalizeVecXZ(dir);
    if (!d) return { x: 0, z: 0 };
    const left = rightNormalXZ(d);
    const toCenter = normalizeVecXZ({ x: (Number(center?.x) || 0) - (Number(point?.x) || 0), z: (Number(center?.z) || 0) - (Number(point?.z) || 0) });
    if (!toCenter) return left;
    return dot2(left, toCenter) >= 0 ? left : { x: -left.x, z: -left.z };
}

function buildJunctionBoundaryFilletsXZ({ junctionId, orderedEndpoints, center, laneWidth, filletRadiusFactor }) {
    const ordered = Array.isArray(orderedEndpoints) ? orderedEndpoints.filter(Boolean) : [];
    if (ordered.length < 2) return null;
    const baseFactor = Number.isFinite(filletRadiusFactor) ? Math.max(0, Math.min(1, Number(filletRadiusFactor))) : 1;
    const chord = Math.max(0.12, (Number(laneWidth) || 4.8) * 0.03);
    const junctionCenter = { x: Number(center?.x) || 0, z: Number(center?.z) || 0 };

    const buildAttempt = (factor) => {
        const seamDirMemo = new Map();
        const seamDir = (endpoint) => {
            const id = endpoint?.id ?? null;
            if (id && seamDirMemo.has(id)) return seamDirMemo.get(id);
            const dirOut = endpoint?.dirOut ?? null;
            const dir = dirOut ? normalizeVecXZ({ x: Number(dirOut.x) || 0, z: Number(dirOut.z) || 0 }) : null;
            const out = dir ? { x: dir.x, z: dir.z } : null;
            if (id) seamDirMemo.set(id, out);
            return out;
        };

        const buildJoin = ({ aEndpoint, aSide, aPoint, aTangentDir, bEndpoint, bSide, bPoint, bTangentDir }) => {
            const dirLine0 = normalizeVecXZ(aTangentDir);
            const dirLine1 = normalizeVecXZ(bTangentDir);
            let arc = null;
            let buildTangents = null;
            if (dirLine0 && dirLine1 && factor > 1e-6) {
                const hit = lineIntersectionXZ(aPoint, dirLine0, bPoint, dirLine1);
                const dir0 = hit ? normalizeVecXZ({ x: (Number(hit.x) || 0) - (Number(aPoint?.x) || 0), z: (Number(hit.z) || 0) - (Number(aPoint?.z) || 0) }) : null;
                const dir1 = hit ? normalizeVecXZ({ x: (Number(hit.x) || 0) - (Number(bPoint?.x) || 0), z: (Number(hit.z) || 0) - (Number(bPoint?.z) || 0) }) : null;
                if (hit && dir0 && dir1) {
                    const t0 = Math.hypot((Number(hit.x) || 0) - (Number(aPoint?.x) || 0), (Number(hit.z) || 0) - (Number(aPoint?.z) || 0));
                    const t1 = Math.hypot((Number(hit.x) || 0) - (Number(bPoint?.x) || 0), (Number(hit.z) || 0) - (Number(bPoint?.z) || 0));
                    buildTangents = [
                        {
                            origin: { x: Number(aPoint.x) || 0, z: Number(aPoint.z) || 0 },
                            dir: { x: Number(dir0.x) || 0, z: Number(dir0.z) || 0 },
                            miter: { x: Number(hit.x) || 0, z: Number(hit.z) || 0 },
                            length: Number.isFinite(t0) ? t0 : 0
                        },
                        {
                            origin: { x: Number(bPoint.x) || 0, z: Number(bPoint.z) || 0 },
                            dir: { x: Number(dir1.x) || 0, z: Number(dir1.z) || 0 },
                            miter: { x: Number(hit.x) || 0, z: Number(hit.z) || 0 },
                            length: Number.isFinite(t1) ? t1 : 0
                        }
                    ];
                    const turnCos = Math.max(-1, Math.min(1, dot2(dir0, dir1)));
                    const turnAngle = Math.acos(turnCos);
                    const distToMiter = (t0 > 1e-6 && t1 > 1e-6)
                        ? (Math.abs(t0 - t1) <= 1e-4 ? (t0 + t1) * 0.5 : Math.min(t0, t1))
                        : 0;
                    const radiusGeom = (distToMiter > 1e-6 && turnAngle > 1e-6 && turnAngle < Math.PI - 1e-6)
                        ? distToMiter * Math.tan(turnAngle * 0.5)
                        : 0;
                    const radius = radiusGeom * Math.max(0, Math.min(1, Number(factor) || 0));
                    if (radius > 1e-6) {
                        const baseOut0 = chooseFilletNormalTowardCenter(dir0, aPoint, junctionCenter);
                        const baseOut1 = chooseFilletNormalTowardCenter(dir1, bPoint, junctionCenter);
                        const outOptions0 = [baseOut0, { x: -baseOut0.x, z: -baseOut0.z }];
                        const outOptions1 = [baseOut1, { x: -baseOut1.x, z: -baseOut1.z }];
                        let best = null;
                        let bestSide = -1;
                        let bestErr = Infinity;
                        let bestMid = Infinity;
                        for (const out0 of outOptions0) {
                            for (const out1 of outOptions1) {
                                const candidate = computeEdgeFilletArcXZ({ p0: aPoint, dir0, out0, p1: bPoint, dir1, out1, radius });
                                if (!candidate?.center || !candidate?.tangent0 || !candidate?.tangent1) continue;
                                const s0 = dot2({ x: (Number(candidate.tangent0.x) || 0) - (Number(aPoint?.x) || 0), z: (Number(candidate.tangent0.z) || 0) - (Number(aPoint?.z) || 0) }, dir0);
                                const s1 = dot2({ x: (Number(candidate.tangent1.x) || 0) - (Number(bPoint?.x) || 0), z: (Number(candidate.tangent1.z) || 0) - (Number(bPoint?.z) || 0) }, dir1);
                                if (s0 < -1e-4 || s1 < -1e-4) continue;
                                if (s0 > t0 + 1e-4 || s1 > t1 + 1e-4) continue;
                                const err = distXZ(candidate.tangent0, aPoint) + distXZ(candidate.tangent1, bPoint);
                                const span = Number(candidate.spanAng) || 0;
                                const arcRadius = Number(candidate.radius) || radius;
                                const midDir = candidate.ccw !== false ? 1 : -1;
                                const midAng = Number(candidate.startAng) + midDir * span * 0.5;
                                const midPoint = { x: Number(candidate.center.x) + Math.cos(midAng) * arcRadius, z: Number(candidate.center.z) + Math.sin(midAng) * arcRadius };
                                const midDist = distXZ(midPoint, junctionCenter);

                                const side0 = cross2(dir0, { x: (Number(junctionCenter.x) || 0) - (Number(aPoint?.x) || 0), z: (Number(junctionCenter.z) || 0) - (Number(aPoint?.z) || 0) });
                                const side1 = cross2(dir1, { x: (Number(junctionCenter.x) || 0) - (Number(bPoint?.x) || 0), z: (Number(junctionCenter.z) || 0) - (Number(bPoint?.z) || 0) });
                                const cSide0 = cross2(dir0, { x: (Number(candidate.center.x) || 0) - (Number(aPoint?.x) || 0), z: (Number(candidate.center.z) || 0) - (Number(aPoint?.z) || 0) });
                                const cSide1 = cross2(dir1, { x: (Number(candidate.center.x) || 0) - (Number(bPoint?.x) || 0), z: (Number(candidate.center.z) || 0) - (Number(bPoint?.z) || 0) });
                                const sideOk0 = Math.abs(side0) <= 1e-8 || Math.abs(cSide0) <= 1e-8 || side0 * cSide0 >= 0;
                                const sideOk1 = Math.abs(side1) <= 1e-8 || Math.abs(cSide1) <= 1e-8 || side1 * cSide1 >= 0;
                                const sideScore = (sideOk0 ? 1 : 0) + (sideOk1 ? 1 : 0);

                                if (sideScore > bestSide) {
                                    best = candidate;
                                    bestSide = sideScore;
                                    bestErr = err;
                                    bestMid = midDist;
                                    continue;
                                }
                                if (sideScore < bestSide) continue;
                                if (err < bestErr - 1e-6) {
                                    best = candidate;
                                    bestErr = err;
                                    bestMid = midDist;
                                    continue;
                                }
                                if (Math.abs(err - bestErr) <= 1e-6 && midDist < bestMid - 1e-6) {
                                    best = candidate;
                                    bestMid = midDist;
                                }
                            }
                        }
                        arc = best;
                    }
                }
            }

            const tangents = [];
            const tangent0 = arc?.tangent0 ?? null;
            const tangent1 = arc?.tangent1 ?? null;
            if (tangent0) {
                tangents.push({
                    a: { x: Number(aPoint.x) || 0, z: Number(aPoint.z) || 0 },
                    b: { x: Number(tangent0.x) || 0, z: Number(tangent0.z) || 0 },
                    length: distXZ(aPoint, tangent0)
                });
            }
            if (tangent1) {
                tangents.push({
                    a: { x: Number(tangent1.x) || 0, z: Number(tangent1.z) || 0 },
                    b: { x: Number(bPoint.x) || 0, z: Number(bPoint.z) || 0 },
                    length: distXZ(tangent1, bPoint)
                });
            }
            if (!arc) {
                tangents.push({
                    a: { x: Number(aPoint.x) || 0, z: Number(aPoint.z) || 0 },
                    b: { x: Number(bPoint.x) || 0, z: Number(bPoint.z) || 0 },
                    length: distXZ(aPoint, bPoint)
                });
            }

            const points = [];
            appendUniquePoint(points, aPoint);
            if (arc?.center && Number.isFinite(arc.radius) && arc.radius > 1e-6 && Number.isFinite(arc.startAng) && Number.isFinite(arc.spanAng) && arc.spanAng > 1e-6) {
                const arcLen = Math.abs(Number(arc.spanAng) || 0) * (Number(arc.radius) || 0);
                const segments = Math.max(6, Math.min(96, Math.ceil(arcLen / chord)));
                const arcPoints = sampleArcXZ({
                    center: arc.center,
                    radius: arc.radius,
                    startAng: arc.startAng,
                    spanAng: arc.spanAng,
                    ccw: arc.ccw !== false,
                    segments
                });
                for (const p of arcPoints) appendUniquePoint(points, p);
            }
            appendUniquePoint(points, bPoint);

            const arcRec = arc?.center
                ? {
                    center: { x: Number(arc.center?.x) || 0, z: Number(arc.center?.z) || 0 },
                    radius: Number(arc.radius) || 0,
                    startAng: Number(arc.startAng) || 0,
                    spanAng: Number(arc.spanAng) || 0,
                    ccw: arc.ccw !== false,
                    length: Math.abs(Number(arc.spanAng) || 0) * (Number(arc.radius) || 0)
                }
                : null;

            const tatId = stableHashId('tat_', `${junctionId}|${aEndpoint?.id ?? ''}|${aSide}|${bEndpoint?.id ?? ''}|${bSide}`);
            return {
                points,
                tat: {
                    id: tatId,
                    type: 'corner',
                    aEndpointId: aEndpoint?.id ?? null,
                    aSide,
                    bEndpointId: bEndpoint?.id ?? null,
                    bSide,
                    tangents,
                    arc: arcRec,
                    buildTangents
                }
            };
        };

        const buildVariant = ({ startA, startB, joinFrom, joinTo, insertEdge, dirSign }) => {
            const boundary = [];
            const tat = [];

            const first = ordered[0];
            appendUniquePoint(boundary, first?.[startA] ?? null);
            appendUniquePoint(boundary, first?.[startB] ?? null);

            for (let i = 0; i < ordered.length; i++) {
                const a = ordered[i];
                const b = ordered[(i + 1) % ordered.length];
                const aPoint = a?.[joinFrom] ?? null;
                const bPoint = b?.[joinTo] ?? null;
                const aDir = seamDir(a);
                const bDir = seamDir(b);
                if (!aPoint || !bPoint || !aDir || !bDir) continue;

                const join = buildJoin({
                    aEndpoint: a,
                    aSide: joinFrom === 'rightEdge' ? 'right' : 'left',
                    aPoint,
                    aTangentDir: { x: aDir.x * dirSign, z: aDir.z * dirSign },
                    bEndpoint: b,
                    bSide: joinTo === 'leftEdge' ? 'left' : 'right',
                    bPoint,
                    bTangentDir: { x: bDir.x * dirSign, z: bDir.z * dirSign }
                });
                if (!join) continue;

                const joinPoints = join?.points ?? [];
                for (let k = 1; k < joinPoints.length; k++) appendUniquePoint(boundary, joinPoints[k]);
                if (join?.tat) tat.push(join.tat);

                if (i < ordered.length - 1) appendUniquePoint(boundary, b?.[insertEdge] ?? null);
            }

            const cleaned = [];
            for (const p of boundary) appendUniquePoint(cleaned, p);
            if (cleaned.length >= 3 && distXZ(cleaned[0], cleaned[cleaned.length - 1]) <= 1e-6) cleaned.pop();
            if (cleaned.length < 3) return null;

            const surface = ensureCcw(cleaned);
            const area = Math.abs(polygonArea(surface));
            if (polygonSelfIntersectsXZ(surface) || !(area > 1e-6)) return null;
            return { points: surface, tat };
        };

        const forward = buildVariant({
            startA: 'leftEdge',
            startB: 'rightEdge',
            joinFrom: 'rightEdge',
            joinTo: 'leftEdge',
            insertEdge: 'rightEdge',
            dirSign: 1
        });
        if (forward) return forward;
        const reverse = buildVariant({
            startA: 'rightEdge',
            startB: 'leftEdge',
            joinFrom: 'leftEdge',
            joinTo: 'rightEdge',
            insertEdge: 'leftEdge',
            dirSign: -1
        });
        if (reverse) return reverse;
        return null;
    };

    const attemptScales = [1, 0.75, 0.55, 0.4, 0.28, 0.18, 0];
    for (const scale of attemptScales) {
        const result = buildAttempt(baseFactor * scale);
        if (result?.points?.length >= 3) return result;
    }

    return null;
}

function mergeIntervals(intervals) {
    const list = Array.isArray(intervals) ? intervals.slice() : [];
    list.sort((a, b) => (a.t0 ?? 0) - (b.t0 ?? 0));
    const out = [];
    for (const it of list) {
        const t0 = clamp01(it?.t0 ?? 0);
        const t1 = clamp01(it?.t1 ?? 0);
        if (!(t1 > t0 + EPS)) continue;
        const last = out[out.length - 1] ?? null;
        if (!last || t0 > last.t1 + 1e-6) {
            out.push({ t0, t1 });
        } else {
            last.t1 = Math.max(last.t1, t1);
        }
    }
    return out;
}

function mergeIntervalsWithSources(intervals) {
    const list = Array.isArray(intervals) ? intervals.slice() : [];
    list.sort((a, b) => {
        const dt = (a?.t0 ?? 0) - (b?.t0 ?? 0);
        if (Math.abs(dt) > 1e-12) return dt;
        return (a?.t1 ?? 0) - (b?.t1 ?? 0);
    });

    const out = [];
    for (const it of list) {
        const t0 = clamp01(it?.t0 ?? 0);
        const t1 = clamp01(it?.t1 ?? 0);
        if (!(t1 > t0 + EPS)) continue;
        const sourcesIn = Array.isArray(it?.sourceIds)
            ? it.sourceIds.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())
            : [];

        const last = out[out.length - 1] ?? null;
        if (!last || t0 > (last.t1 ?? 0) + 1e-6) {
            out.push({ t0, t1, sourceIds: Array.from(new Set(sourcesIn)).sort() });
            continue;
        }

        last.t1 = Math.max(last.t1 ?? 0, t1);
        const merged = new Set([...(last.sourceIds ?? []), ...sourcesIn]);
        last.sourceIds = Array.from(merged).sort();
    }
    return out;
}

function complementIntervals(removed) {
    const out = [];
    let t = 0;
    for (const it of removed) {
        if ((it.t0 ?? 0) > t + 1e-9) out.push({ t0: t, t1: it.t0 });
        t = Math.max(t, it.t1 ?? t);
        if (t >= 1 - 1e-9) {
            t = 1;
            break;
        }
    }
    if (t < 1 - 1e-9) out.push({ t0: t, t1: 1 });
    return out.filter((it) => (it.t1 ?? 0) > (it.t0 ?? 0) + EPS);
}

function buildSegment({ road, roadIndex, segmentIndex, aPoint, bPoint, settings }) {
    const segmentId = `seg_${road.id}_${aPoint.id}_${bPoint.id}`;
    const dir = normalizeDirXZ(aPoint.world, bPoint.world);
    if (!dir) return null;
    const right = rightNormalXZ(dir);

    const laneWidth = settings.laneWidth;
    const margin = laneWidth * settings.marginFactor;
    const lanesF = clampInt(road.lanesF, 0, 99);
    const lanesB = clampInt(road.lanesB, 0, 99);
    const rightLaneEdge = lanesF * laneWidth;
    const leftLaneEdge = lanesB * laneWidth;
    const rightAsphaltEdge = rightLaneEdge + margin;
    const leftAsphaltEdge = leftLaneEdge + margin;

    const polylines = [];
    polylines.push(makePolyline({
        segmentId,
        roadId: road.id,
        kind: 'centerline',
        offset: 0,
        right,
        aPoint,
        bPoint
    }));

    if (lanesF > 0) {
        polylines.push(makePolyline({
            segmentId,
            roadId: road.id,
            kind: 'forward_centerline',
            offset: rightLaneEdge * 0.5,
            right,
            aPoint,
            bPoint
        }));
    }

    if (lanesB > 0) {
        polylines.push(makePolyline({
            segmentId,
            roadId: road.id,
            kind: 'backward_centerline',
            offset: -leftLaneEdge * 0.5,
            right,
            aPoint,
            bPoint
        }));
    }

    if (lanesF > 0) {
        polylines.push(makePolyline({
            segmentId,
            roadId: road.id,
            kind: 'lane_edge_right',
            offset: rightLaneEdge,
            right,
            aPoint,
            bPoint
        }));
    }

    if (lanesB > 0) {
        polylines.push(makePolyline({
            segmentId,
            roadId: road.id,
            kind: 'lane_edge_left',
            offset: -leftLaneEdge,
            right,
            aPoint,
            bPoint
        }));
    }

    polylines.push(makePolyline({
        segmentId,
        roadId: road.id,
        kind: 'asphalt_edge_right',
        offset: rightAsphaltEdge,
        right,
        aPoint,
        bPoint
    }));

    polylines.push(makePolyline({
        segmentId,
        roadId: road.id,
        kind: 'asphalt_edge_left',
        offset: -leftAsphaltEdge,
        right,
        aPoint,
        bPoint
    }));

    const corners = segmentCorners(aPoint.world, bPoint.world, right, leftAsphaltEdge, rightAsphaltEdge);
    const obb = {
        id: `${segmentId}__asphalt_obb`,
        roadId: road.id,
        segmentId,
        center: {
            x: (aPoint.world.x + bPoint.world.x) * 0.5,
            z: (aPoint.world.z + bPoint.world.z) * 0.5
        },
        axis: { x: dir.x, z: dir.z },
        halfLength: dir.length * 0.5,
        halfWidthLeft: leftAsphaltEdge,
        halfWidthRight: rightAsphaltEdge,
        corners,
        aabb: computeAabb(corners)
    };

    return {
        id: segmentId,
        roadId: road.id,
        roadIndex,
        index: segmentIndex,
        aPointId: aPoint.id,
        bPointId: bPoint.id,
        aWorld: { x: aPoint.world.x, z: aPoint.world.z },
        bWorld: { x: bPoint.world.x, z: bPoint.world.z },
        lanesF,
        lanesB,
        length: dir.length,
        dir: { x: dir.x, z: dir.z },
        right,
        laneWidth,
        margin,
        polylines,
        asphaltObb: obb
    };
}

function includePolyline(kind, flags) {
    if (kind === 'centerline') return flags.centerline;
    if (kind === 'forward_centerline' || kind === 'backward_centerline') return flags.directionCenterlines;
    if (kind === 'lane_edge_left' || kind === 'lane_edge_right') return flags.laneEdges;
    if (kind === 'asphalt_edge_left' || kind === 'asphalt_edge_right') return flags.asphaltEdges;
    return true;
}

function pushPolylinePrimitive(primitives, poly) {
    primitives.push({
        type: 'polyline',
        id: poly.id,
        kind: poly.kind,
        roadId: poly.roadId,
        segmentId: poly.segmentId,
        points: poly.points.map((p) => ({ x: p.x, z: p.z }))
    });
}

function pushMarkerPrimitive(primitives, poly) {
    primitives.push({
        type: 'points',
        id: `${poly.id}__markers`,
        kind: `${poly.kind}_markers`,
        roadId: poly.roadId,
        segmentId: poly.segmentId,
        points: poly.points.map((p) => ({ x: p.x, z: p.z }))
    });
}

function pushObbPrimitive(primitives, obb) {
    primitives.push({
        type: 'polygon',
        id: obb.id,
        kind: 'asphalt_obb',
        roadId: obb.roadId,
        segmentId: obb.segmentId,
        points: obb.corners.map((p) => ({ x: p.x, z: p.z }))
    });
}

export function computeRoadEngineEdges({ roads = [], settings = {} } = {}) {
    const resolvedSettings = resolveRoadEngineSettings(settings);
    const derivedRoads = [];
    const segments = [];
    const primitives = [];
    const flags = resolvedSettings.flags;
    const trim = resolvedSettings.trim ?? { enabled: false, threshold: 0 };
    const junctionsSettings = resolvedSettings.junctions ?? { enabled: false, thresholdFactor: 1.5 };
    const normalizeManualJunctions = (raw) => {
        const list = Array.isArray(raw) ? raw : [];
        const out = [];
        const seen = new Set();
        for (const entry of list) {
            const candidateIds = Array.isArray(entry?.candidateIds)
                ? entry.candidateIds
                    .filter((v) => typeof v === 'string' && v.trim())
                    .map((v) => v.trim())
                : [];
            const uniq = Array.from(new Set(candidateIds)).sort(compareString);
            if (!uniq.length) continue;
            const id = stableHashId('junc_', uniq.join('|'));
            if (seen.has(id)) continue;
            seen.add(id);
            out.push({
                id,
                candidateIds: uniq,
                asphaltVisible: entry?.asphaltVisible !== false
            });
        }
        out.sort((a, b) => compareString(a?.id, b?.id));
        return out;
    };
    const manualJunctions = normalizeManualJunctions(junctionsSettings.manualJunctions);
    const hiddenJunctionIds = new Set(junctionsSettings.hiddenJunctionIds ?? []);
    const suppressedAutoJunctionIds = new Set(junctionsSettings.suppressedAutoJunctionIds ?? []);
    const junctionThresholdFactor = Number(junctionsSettings.thresholdFactor) || 1.5;
    const junctionFilletRadiusFactor = Number.isFinite(junctionsSettings.filletRadiusFactor) ? junctionsSettings.filletRadiusFactor : 1;
    const junctionMinThreshold = Math.max(0, Number(junctionsSettings.minThreshold) || 0);
    const junctionMaxThreshold = Number.isFinite(junctionsSettings.maxThreshold) ? Number(junctionsSettings.maxThreshold) : Infinity;

    const list = Array.isArray(roads) ? roads : [];
    for (let roadIndex = 0; roadIndex < list.length; roadIndex++) {
        const rawRoad = list[roadIndex] ?? {};
        const roadId = safeId(rawRoad?.id, `road_${roadIndex}`);
        const name = typeof rawRoad?.name === 'string' && rawRoad.name.trim() ? rawRoad.name.trim() : roadId;
        const lanesF = clampInt(rawRoad?.lanesF ?? 1, 0, 99);
        const lanesB = clampInt(rawRoad?.lanesB ?? 1, 0, 99);
        const rawPoints = Array.isArray(rawRoad?.points) ? rawRoad.points : [];
        const points = rawPoints.map((pt, index) => normalizePoint(pt, { roadId, index, settings: resolvedSettings }));

        const roadOut = {
            id: roadId,
            name,
            lanesF,
            lanesB,
            points,
            segmentIds: []
        };

        for (let i = 0; i < points.length - 1; i++) {
            const seg = buildSegment({
                road: roadOut,
                roadIndex,
                segmentIndex: i,
                aPoint: points[i],
                bPoint: points[i + 1],
                settings: resolvedSettings
            });
            if (!seg) continue;
            roadOut.segmentIds.push(seg.id);
            segments.push(seg);

            for (const poly of seg.polylines) {
                if (!includePolyline(poly.kind, flags)) continue;
                pushPolylinePrimitive(primitives, poly);
                if (flags.markers) pushMarkerPrimitive(primitives, poly);
            }

            if (flags.asphaltObb) pushObbPrimitive(primitives, seg.asphaltObb);
        }

        derivedRoads.push(roadOut);
    }

    const segmentById = new Map(segments.map((seg) => [seg.id, seg]));
    const cornerCandidates = [];
    const cornerById = new Map();
    const cornerMinAngleRad = 0.12;
    for (const road of derivedRoads) {
        const pts = Array.isArray(road?.points) ? road.points : [];
        for (let i = 1; i < pts.length - 1; i++) {
            const prev = pts[i - 1];
            const cur = pts[i];
            const next = pts[i + 1];
            if (!prev?.world || !cur?.world || !next?.world) continue;
            const dirIn = normalizeDirXZ(prev.world, cur.world);
            const dirOut = normalizeDirXZ(cur.world, next.world);
            if (!dirIn || !dirOut) continue;
            const dot = Math.max(-1, Math.min(1, dirIn.x * dirOut.x + dirIn.z * dirOut.z));
            const angle = Math.acos(dot);
            if (!(angle >= cornerMinAngleRad)) continue;
            const id = `corner_${road.id}_${cur.id}`;
            const inSegmentId = `seg_${road.id}_${prev.id}_${cur.id}`;
            const outSegmentId = `seg_${road.id}_${cur.id}_${next.id}`;
            if (!segmentById.has(inSegmentId) || !segmentById.has(outSegmentId)) continue;
            const corner = {
                id,
                roadId: road.id,
                pointId: cur.id,
                inSegmentId,
                outSegmentId,
                angleRad: angle,
                world: { x: Number(cur.world.x) || 0, z: Number(cur.world.z) || 0 }
            };
            cornerCandidates.push(corner);
            cornerById.set(id, corner);
        }
    }

    const cornerIdsWithCuts = new Set();
    for (const junction of manualJunctions) {
        for (const id of junction?.candidateIds ?? []) {
            if (cornerById.has(id)) cornerIdsWithCuts.add(id);
        }
    }
    if (junctionsSettings.autoCreate === true) {
        for (const corner of cornerCandidates) {
            const cornerId = corner?.id ?? null;
            if (!cornerId) continue;
            if (cornerIdsWithCuts.has(cornerId)) continue;
            const autoId = stableHashId('junc_', cornerId);
            if (suppressedAutoJunctionIds.has(autoId)) continue;
            cornerIdsWithCuts.add(cornerId);
        }
    }

    const trimOut = {
        enabled: trim.enabled,
        threshold: trim.threshold,
        overlaps: []
    };

    if (trim.enabled) {
        const threshold = Math.max(0, Number(trim.threshold) || 0);
        const pad = threshold * 0.5;
        const snapStep = resolvedSettings.tileSize / 10;

        const expanded = segments.map((seg) => {
            const left = (seg?.asphaltObb?.halfWidthLeft ?? 0) + pad;
            const rightW = (seg?.asphaltObb?.halfWidthRight ?? 0) + pad;
            const axis = seg?.dir ?? { x: 1, z: 0 };
            const right = seg?.right ?? { x: 0, z: -1 };
            const a = seg?.aWorld ?? { x: 0, z: 0 };
            const b = seg?.bWorld ?? { x: 0, z: 0 };
            const start = { x: (a.x ?? 0) - (axis.x ?? 0) * pad, z: (a.z ?? 0) - (axis.z ?? 0) * pad };
            const end = { x: (b.x ?? 0) + (axis.x ?? 0) * pad, z: (b.z ?? 0) + (axis.z ?? 0) * pad };
            const corners = makeRectCorners(start, end, right, left, rightW);
            return {
                segmentId: seg.id,
                roadId: seg.roadId,
                axis,
                right,
                start,
                end,
                leftWidth: left,
                rightWidth: rightW,
                corners: ensureCcw(corners),
                aabb: computeAabb(corners)
            };
        });

        const expandedById = new Map(expanded.map((s) => [s.segmentId, s]));
        const intervalsBySeg = new Map();

        const sortedSegs = segments.slice().sort((a, b) => {
            const aId = String(a?.id ?? '');
            const bId = String(b?.id ?? '');
            if (aId < bId) return -1;
            if (aId > bId) return 1;
            return 0;
        });
        for (let i = 0; i < sortedSegs.length; i++) {
            const aSeg = sortedSegs[i];
            const aStrip = expandedById.get(aSeg.id);
            if (!aStrip) continue;
            for (let j = i + 1; j < sortedSegs.length; j++) {
                const bSeg = sortedSegs[j];
                const sharesEndpoint = aSeg.aPointId === bSeg.aPointId
                    || aSeg.aPointId === bSeg.bPointId
                    || aSeg.bPointId === bSeg.aPointId
                    || aSeg.bPointId === bSeg.bPointId;
                if (sharesEndpoint) {
                    if (aSeg.roadId === bSeg.roadId) continue;
                    const aDir = aSeg?.dir ?? null;
                    const bDir = bSeg?.dir ?? null;
                    if (aDir && bDir) {
                        const cos = Math.abs(dot2(aDir, bDir));
                        if (cos >= 0.999) continue;
                    }
                }

                const bStrip = expandedById.get(bSeg.id);
                if (!bStrip) continue;
                if (!aabbOverlaps(aStrip.aabb, bStrip.aabb)) continue;

                const axes = [
                    aStrip.axis, aStrip.right,
                    bStrip.axis, bStrip.right
                ];
                if (!satOverlapConvex(aStrip.corners, bStrip.corners, axes)) continue;

                const overlapPoly = clipPolygon(aStrip.corners, bStrip.corners);
                if (overlapPoly.length < 3) continue;
                const area = Math.abs(polygonArea(overlapPoly));
                if (!(area > 1e-6)) continue;

                const anchor = segmentIntersectionXZ(aSeg.aWorld, aSeg.bWorld, bSeg.aWorld, bSeg.bWorld) ?? centroid(overlapPoly);

                const aProj = projectPolygonToSegmentT(overlapPoly, aSeg.aWorld, aSeg.dir, aSeg.length);
                const bProj = projectPolygonToSegmentT(overlapPoly, bSeg.aWorld, bSeg.dir, bSeg.length);
                if (!aProj || !bProj) continue;

                const aT0 = clamp01(aProj.t0);
                const aT1 = clamp01(aProj.t1);
                const bT0 = clamp01(bProj.t0);
                const bT1 = clamp01(bProj.t1);
                if (!(aT1 > aT0 + 1e-9) || !(bT1 > bT0 + 1e-9)) continue;

                const aCrossRaw = clamp01(dot2({ x: (anchor.x ?? 0) - (aSeg.aWorld.x ?? 0), z: (anchor.z ?? 0) - (aSeg.aWorld.z ?? 0) }, aSeg.dir) / aSeg.length);
                const bCrossRaw = clamp01(dot2({ x: (anchor.x ?? 0) - (bSeg.aWorld.x ?? 0), z: (anchor.z ?? 0) - (bSeg.aWorld.z ?? 0) }, bSeg.dir) / bSeg.length);

                const aCross = (aT0 + aT1) * 0.5;
                const bCross = (bT0 + bT1) * 0.5;

                const aRemove = { t0: aT0, t1: aT1 };
                const bRemove = { t0: bT0, t1: bT1 };
                const overlapId = `ov_${aSeg.id}__${bSeg.id}`;

                if (!intervalsBySeg.has(aSeg.id)) intervalsBySeg.set(aSeg.id, []);
                if (!intervalsBySeg.has(bSeg.id)) intervalsBySeg.set(bSeg.id, []);
                intervalsBySeg.get(aSeg.id).push({ ...aRemove, otherSegmentId: bSeg.id, sourceIds: [overlapId] });
                intervalsBySeg.get(bSeg.id).push({ ...bRemove, otherSegmentId: aSeg.id, sourceIds: [overlapId] });

                trimOut.overlaps.push({
                    id: overlapId,
                    aSegmentId: aSeg.id,
                    bSegmentId: bSeg.id,
                    polygon: overlapPoly,
                    aInterval: aRemove,
                    bInterval: bRemove,
                    aCross,
                    bCross,
                    aCrossRaw,
                    bCrossRaw
                });

                if (trim.debug?.overlaps) {
                    primitives.push({
                        type: 'polygon',
                        id: `${overlapId}__poly`,
                        kind: 'trim_overlap',
                        roadId: null,
                        segmentId: overlapId,
                        points: overlapPoly.map((p) => ({ x: p.x, z: p.z }))
                    });
                }
            }
        }

        for (const cornerId of cornerIdsWithCuts) {
            const corner = cornerById.get(cornerId) ?? null;
            if (!corner) continue;
            const inSeg = segmentById.get(corner.inSegmentId) ?? null;
            const outSeg = segmentById.get(corner.outSegmentId) ?? null;
            const radius = Math.max(
                Number(inSeg?.asphaltObb?.halfWidthLeft) || 0,
                Number(inSeg?.asphaltObb?.halfWidthRight) || 0,
                Number(outSeg?.asphaltObb?.halfWidthLeft) || 0,
                Number(outSeg?.asphaltObb?.halfWidthRight) || 0
            );
            const cornerAngle = Math.max(0, Math.min(Math.PI - 1e-6, Number(corner?.angleRad) || 0));
            const maxFilletRadius = Math.max(0, radius * Math.max(0, Math.min(1, Number(junctionFilletRadiusFactor) || 0)));
            const local = maxFilletRadius * Math.tan(cornerAngle * 0.5) * Math.max(0, Number(junctionThresholdFactor) || 0);
            const cutDistance = Math.min(junctionMaxThreshold, Math.max(0, local));
            const minKeep = Math.max(0, snapStep);
            const inLen = Number(inSeg?.length) || 0;
            const outLen = Number(outSeg?.length) || 0;
            const inMax = inLen > 1e-6 ? Math.max(0, inLen - minKeep) : 0;
            const outMax = outLen > 1e-6 ? Math.max(0, outLen - minKeep) : 0;
            const dist = (inSeg && outSeg)
                ? Math.max(0, Math.min(cutDistance, inMax, outMax))
                : Math.max(0, cutDistance);
            corner.cutDistance = dist;

            const pushCut = (seg, mode, appliedDistance) => {
                if (!seg) return;
                const len = Number(seg.length) || 0;
                if (!(len > 1e-6)) return;
                const keep = Math.max(0, snapStep);
                const max = Math.max(0, len - keep);
                const distFinal = Math.max(0, Math.min(Number(appliedDistance) || 0, max));
                if (!(distFinal > 1e-6)) return;
                const t = clamp01(distFinal / len);
                const interval = mode === 'start'
                    ? { t0: 0, t1: t }
                    : { t0: clamp01(1 - t), t1: 1 };
                if (!(interval.t1 > interval.t0 + 1e-9)) return;
                if (!intervalsBySeg.has(seg.id)) intervalsBySeg.set(seg.id, []);
                intervalsBySeg.get(seg.id).push({ ...interval, sourceIds: [cornerId] });
            };

            if (inSeg && outSeg) {
                pushCut(inSeg, 'end', dist);
                pushCut(outSeg, 'start', dist);
            } else {
                pushCut(inSeg, 'end', cutDistance);
                pushCut(outSeg, 'start', cutDistance);
            }
        }

        for (const seg of segments) {
            const rawIntervals = intervalsBySeg.get(seg.id) ?? [];
            const removed = mergeIntervalsWithSources(rawIntervals);
            const hadTrim = removed.length > 0;
            const kept = hadTrim ? complementIntervals(removed) : [{ t0: 0, t1: 1 }];

            seg.trimRemoved = removed;
            seg.keptPieces = [];
            seg.droppedPieces = [];

            const makePiece = ({ t0, t1, index, dropped }) => {
                const length = seg.length * (t1 - t0);
                const start = { x: seg.aWorld.x + seg.dir.x * (seg.length * t0), z: seg.aWorld.z + seg.dir.z * (seg.length * t0) };
                const end = { x: seg.aWorld.x + seg.dir.x * (seg.length * t1), z: seg.aWorld.z + seg.dir.z * (seg.length * t1) };
                const corners = makeRectCorners(start, end, seg.right, seg.asphaltObb.halfWidthLeft, seg.asphaltObb.halfWidthRight);
                return {
                    id: `${seg.id}__${dropped ? 'drop' : 'keep'}_${index}`,
                    roadId: seg.roadId,
                    segmentId: seg.id,
                    index,
                    t0,
                    t1,
                    length,
                    aWorld: start,
                    bWorld: end,
                    corners,
                    aabb: computeAabb(corners)
                };
            };

            if (trim.debug?.removedPieces && removed.length) {
                for (let k = 0; k < removed.length; k++) {
                    const it = removed[k];
                    const t0 = clamp01(it.t0);
                    const t1 = clamp01(it.t1);
                    if (!(t1 > t0 + 1e-9)) continue;
                    const start = { x: seg.aWorld.x + seg.dir.x * (seg.length * t0), z: seg.aWorld.z + seg.dir.z * (seg.length * t0) };
                    const end = { x: seg.aWorld.x + seg.dir.x * (seg.length * t1), z: seg.aWorld.z + seg.dir.z * (seg.length * t1) };
                    const corners = makeRectCorners(start, end, seg.right, seg.asphaltObb.halfWidthLeft, seg.asphaltObb.halfWidthRight);
                    primitives.push({
                        type: 'polygon',
                        id: `${seg.id}__removed_piece_${k}`,
                        kind: 'trim_removed_piece',
                        roadId: seg.roadId,
                        segmentId: seg.id,
                        points: corners.map((p) => ({ x: p.x, z: p.z }))
                    });
                }
            }

            let keepIndex = 0;
            let dropIndex = 0;
            for (const it of kept) {
                const t0 = clamp01(it.t0);
                const t1 = clamp01(it.t1);
                if (!(t1 > t0 + 1e-9)) continue;
                const pieceLen = seg.length * (t1 - t0);
                if (hadTrim && pieceLen < snapStep - 1e-6) {
                    const piece = makePiece({ t0, t1, index: dropIndex++, dropped: true });
                    seg.droppedPieces.push(piece);
                    if (trim.debug?.droppedPieces) {
                        primitives.push({
                            type: 'polygon',
                            id: piece.id,
                            kind: 'trim_dropped_piece',
                            roadId: piece.roadId,
                            segmentId: piece.segmentId,
                            points: piece.corners.map((p) => ({ x: p.x, z: p.z }))
                        });
                    }
                    continue;
                }

                const piece = makePiece({ t0, t1, index: keepIndex++, dropped: false });
                seg.keptPieces.push(piece);
                primitives.push({
                    type: 'polygon',
                    id: piece.id,
                    kind: 'asphalt_piece',
                    roadId: piece.roadId,
                    segmentId: piece.segmentId,
                    points: piece.corners.map((p) => ({ x: p.x, z: p.z }))
                });

                if (trim.debug?.keptPieces) {
                    primitives.push({
                        type: 'polygon',
                        id: `${piece.id}__dbg`,
                        kind: 'trim_kept_piece',
                        roadId: piece.roadId,
                        segmentId: piece.segmentId,
                        points: piece.corners.map((p) => ({ x: p.x, z: p.z }))
                    });
                }
            }

            if (trim.debug?.rawSegments) {
                const corners = seg.asphaltObb?.corners ?? null;
                if (Array.isArray(corners) && corners.length === 4) {
                    primitives.push({
                        type: 'polygon',
                        id: `${seg.id}__raw_asphalt`,
                        kind: 'trim_raw_asphalt',
                        roadId: seg.roadId,
                        segmentId: seg.id,
                        points: corners.map((p) => ({ x: p.x, z: p.z }))
                    });
                }
            }

            if (trim.debug?.strips) {
                const strip = expandedById.get(seg.id);
                const pts = strip?.corners ?? null;
                if (Array.isArray(pts) && pts.length >= 3) {
                    primitives.push({
                        type: 'polygon',
                        id: `${seg.id}__strip`,
                        kind: 'trim_strip',
                        roadId: seg.roadId,
                        segmentId: seg.id,
                        points: pts.map((p) => ({ x: p.x, z: p.z }))
                    });
                }
            }

            if (trim.debug?.intervals) {
                for (let k = 0; k < removed.length; k++) {
                    const it = removed[k];
                    const start = { x: seg.aWorld.x + seg.dir.x * (seg.length * it.t0), z: seg.aWorld.z + seg.dir.z * (seg.length * it.t0) };
                    const end = { x: seg.aWorld.x + seg.dir.x * (seg.length * it.t1), z: seg.aWorld.z + seg.dir.z * (seg.length * it.t1) };
                    primitives.push({
                        type: 'polyline',
                        id: `${seg.id}__removed_${k}`,
                        kind: 'trim_removed_interval',
                        roadId: seg.roadId,
                        segmentId: seg.id,
                        points: [{ x: start.x, z: start.z }, { x: end.x, z: end.z }]
                    });
                }
            }
        }
    } else {
        for (const seg of segments) {
            seg.trimRemoved = [];
            seg.keptPieces = [];
            seg.droppedPieces = [];
            const corners = seg.asphaltObb?.corners ?? null;
            if (Array.isArray(corners) && corners.length === 4) {
                const piece = {
                    id: `${seg.id}__keep_0`,
                    roadId: seg.roadId,
                    segmentId: seg.id,
                    index: 0,
                    t0: 0,
                    t1: 1,
                    length: Number(seg.length) || 0,
                    aWorld: { x: Number(seg.aWorld?.x) || 0, z: Number(seg.aWorld?.z) || 0 },
                    bWorld: { x: Number(seg.bWorld?.x) || 0, z: Number(seg.bWorld?.z) || 0 },
                    corners,
                    aabb: computeAabb(corners)
                };
                seg.keptPieces.push(piece);
                primitives.push({
                    type: 'polygon',
                    id: piece.id,
                    kind: 'asphalt_piece',
                    roadId: seg.roadId,
                    segmentId: seg.id,
                    points: corners.map((p) => ({ x: p.x, z: p.z }))
                });
            }
        }
    }

    const internalPointIdsByRoadId = new Map();
    for (const road of derivedRoads) {
        const pts = Array.isArray(road?.points) ? road.points : [];
        const internal = new Set();
        for (let i = 1; i < pts.length - 1; i++) {
            const id = pts[i]?.id ?? null;
            if (id) internal.add(id);
        }
        internalPointIdsByRoadId.set(road.id, internal);
    }

    const endpointCandidates = [];
    const endpointById = new Map();
    const endpointsBySegmentId = new Map();

    const rememberEndpoint = (endpoint) => {
        if (!endpoint?.id) return;
        if (endpointById.has(endpoint.id)) return;
        endpointById.set(endpoint.id, endpoint);
        endpointCandidates.push(endpoint);
        if (!endpointsBySegmentId.has(endpoint.segmentId)) endpointsBySegmentId.set(endpoint.segmentId, []);
        endpointsBySegmentId.get(endpoint.segmentId).push(endpoint);
    };

    for (const seg of segments) {
        const pieces = Array.isArray(seg?.keptPieces) ? seg.keptPieces : [];
        if (!pieces.length) continue;
        const baseDir = seg?.dir ?? null;
        const baseRight = seg?.right ?? null;
        if (!baseDir || !baseRight) continue;
        const halfLeft = Number(seg?.asphaltObb?.halfWidthLeft) || 0;
        const halfRight = Number(seg?.asphaltObb?.halfWidthRight) || 0;
        const roadInternal = internalPointIdsByRoadId.get(seg.roadId) ?? null;

        const removed = Array.isArray(seg?.trimRemoved) ? seg.trimRemoved : [];
        const cutBoundaries = removed.map((it) => {
            const sources = Array.isArray(it?.sourceIds) ? it.sourceIds.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()) : [];
            const key = stableHashId('cut_', sources.slice().sort(compareString).join('|'));
            return {
                t0: clamp01(it?.t0 ?? 0),
                t1: clamp01(it?.t1 ?? 0),
                sourceIds: sources.slice().sort(compareString),
                key,
                idT0: `ep_${seg.id}__cut_${key}__t0`,
                idT1: `ep_${seg.id}__cut_${key}__t1`
            };
        });

        const matchBoundary = (target, field) => {
            let best = null;
            let bestDiff = Infinity;
            for (const b of cutBoundaries) {
                const value = Number(b?.[field]) || 0;
                const diff = Math.abs(value - target);
                if (diff < bestDiff - 1e-9) {
                    best = b;
                    bestDiff = diff;
                    continue;
                }
                if (Math.abs(diff - bestDiff) <= 1e-9) {
                    const aKey = (best?.sourceIds ?? []).join('|');
                    const bKey = (b?.sourceIds ?? []).join('|');
                    if (bKey < aKey) best = b;
                }
            }
            return best && bestDiff <= 1e-5 ? best : null;
        };

        const makeEndpoint = (piece, end) => {
            const isA = end === 'a';
            const t0 = clamp01(piece?.t0 ?? 0);
            const t1 = clamp01(piece?.t1 ?? 0);
            if (isA && t0 <= 1e-9 && roadInternal?.has?.(seg.aPointId)) return null;
            if (!isA && t1 >= 1 - 1e-9 && roadInternal?.has?.(seg.bPointId)) return null;

            const world = isA ? (piece?.aWorld ?? null) : (piece?.bWorld ?? null);
            if (!world) return null;
            const dirOut = isA ? { x: Number(baseDir.x) || 0, z: Number(baseDir.z) || 0 } : { x: -(Number(baseDir.x) || 0), z: -(Number(baseDir.z) || 0) };
            const rightOut = isA ? { x: Number(baseRight.x) || 0, z: Number(baseRight.z) || 0 } : { x: -(Number(baseRight.x) || 0), z: -(Number(baseRight.z) || 0) };
            const widthRight = isA ? halfRight : halfLeft;
            const widthLeft = isA ? halfLeft : halfRight;
            const rightEdge = offsetPointXZ(world, rightOut, widthRight);
            const leftEdge = offsetPointXZ(world, rightOut, -widthLeft);

            let id = null;
            let sourceIds = [];
            if (isA && t0 <= 1e-9) {
                id = `ep_${seg.id}__a`;
            } else if (!isA && t1 >= 1 - 1e-9) {
                id = `ep_${seg.id}__b`;
            } else if (isA) {
                const boundary = matchBoundary(t0, 't1');
                id = boundary?.idT1 ?? `ep_${piece?.id ?? seg.id}__a`;
                sourceIds = boundary?.sourceIds ?? [];
            } else {
                const boundary = matchBoundary(t1, 't0');
                id = boundary?.idT0 ?? `ep_${piece?.id ?? seg.id}__b`;
                sourceIds = boundary?.sourceIds ?? [];
            }

            const legacyId = `${piece.id}__${end}`;
            return {
                id,
                legacyId,
                roadId: piece.roadId,
                segmentId: piece.segmentId,
                pieceId: piece.id,
                end,
                world: { x: Number(world.x) || 0, z: Number(world.z) || 0 },
                dirOut,
                rightOut,
                widthLeft,
                widthRight,
                connectRadius: Math.max(0, widthLeft, widthRight),
                leftEdge: { x: Number(leftEdge.x) || 0, z: Number(leftEdge.z) || 0 },
                rightEdge: { x: Number(rightEdge.x) || 0, z: Number(rightEdge.z) || 0 },
                sourceIds
            };
        };

        for (const piece of pieces) {
            const aEp = makeEndpoint(piece, 'a');
            const bEp = makeEndpoint(piece, 'b');
            if (aEp) rememberEndpoint(aEp);
            if (bEp) rememberEndpoint(bEp);
        }
    }

    endpointCandidates.sort((a, b) => compareString(a?.id, b?.id));
    for (const list of endpointsBySegmentId.values()) list.sort((a, b) => compareString(a?.id, b?.id));

    const mergedSet = new Set(Array.isArray(junctionsSettings.mergedConnectorIds) ? junctionsSettings.mergedConnectorIds.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()) : []);

    const junctions = [];
    const usedEndpointIds = new Set();

    const buildJunctionRecord = ({ id, legacyId, source, candidateIds, endpoints, asphaltVisible, missingCandidateIds = [] }) => {
        const eps = Array.isArray(endpoints) ? endpoints.filter(Boolean) : [];
        const endpointByIdLocal = new Map(eps.map((e) => [e.id, e]));
        const centerPoints = [];
        for (const e of eps) {
            if (e?.world) centerPoints.push(e.world);
        }
        for (const cid of candidateIds ?? []) {
            const corner = cornerById.get(cid) ?? null;
            if (corner?.world) centerPoints.push(corner.world);
        }
        const center = centroid(centerPoints);

        const roadsSet = new Set(eps.map((e) => e?.roadId).filter(Boolean));
        const segmentsSet = new Set(eps.map((e) => e?.segmentId).filter(Boolean));

        const ordered = eps.slice().sort((a, b) => {
            const ax = (Number(a?.world?.x) || 0) - (Number(center?.x) || 0);
            const az = (Number(a?.world?.z) || 0) - (Number(center?.z) || 0);
            const bx = (Number(b?.world?.x) || 0) - (Number(center?.x) || 0);
            const bz = (Number(b?.world?.z) || 0) - (Number(center?.z) || 0);
            const aAng = Math.atan2(az, ax);
            const bAng = Math.atan2(bz, bx);
            if (aAng < bAng - 1e-12) return -1;
            if (aAng > bAng + 1e-12) return 1;
            return compareString(a?.id, b?.id);
        });

        let tat = [];
        let surface = null;
        if (ordered.length === 2) {
            const deg2 = buildDegree2JunctionSurfaceXZ({
                junctionId: id,
                endpoints: ordered,
                laneWidth: resolvedSettings.laneWidth,
                filletRadiusFactor: junctionsSettings.filletRadiusFactor
            });
            if (deg2?.points?.length >= 3) {
                surface = deg2.points;
                tat = Array.isArray(deg2.tat) ? deg2.tat : [];
            }
        }

        if (!surface) {
            const filleted = buildJunctionBoundaryFilletsXZ({
                junctionId: id,
                orderedEndpoints: ordered,
                center,
                laneWidth: resolvedSettings.laneWidth,
                filletRadiusFactor: junctionsSettings.filletRadiusFactor
            });
            if (filleted?.points?.length >= 3) {
                surface = filleted.points;
                tat = filleted.tat ?? [];
            } else {
                const boundaryPts = [];
                for (const ep of ordered) {
                    boundaryPts.push({ x: ep.rightEdge.x, z: ep.rightEdge.z });
                    boundaryPts.push({ x: ep.leftEdge.x, z: ep.leftEdge.z });
                }

                const cleanedBoundary = [];
                for (const p of boundaryPts) {
                    const last = cleanedBoundary[cleanedBoundary.length - 1] ?? null;
                    if (last && Math.hypot((p?.x ?? 0) - (last.x ?? 0), (p?.z ?? 0) - (last.z ?? 0)) <= 1e-6) continue;
                    cleanedBoundary.push({ x: Number(p?.x) || 0, z: Number(p?.z) || 0 });
                }
                if (cleanedBoundary.length >= 3) {
                    const first = cleanedBoundary[0];
                    const last = cleanedBoundary[cleanedBoundary.length - 1];
                    if (first && last && Math.hypot((first.x ?? 0) - (last.x ?? 0), (first.z ?? 0) - (last.z ?? 0)) <= 1e-6) cleanedBoundary.pop();
                }

                surface = ensureCcw(cleanedBoundary);
                const area = Math.abs(polygonArea(surface));
                if (polygonSelfIntersectsXZ(surface) || !(area > 1e-6)) surface = convexHullXZ(cleanedBoundary);
            }
        }

        const connectors = [];
        const endpointsSorted = eps.slice().sort((a, b) => compareString(a?.id, b?.id));
        for (let i = 0; i < endpointsSorted.length; i++) {
            const a = endpointsSorted[i];
            for (let j = i + 1; j < endpointsSorted.length; j++) {
                const b = endpointsSorted[j];
                const aId = a.id;
                const bId = b.id;
                const connId = stableHashId('con_', `${id}|${aId}|${bId}`);
                const legacyConnId = stableHashId('con_', `${legacyId}|${a.legacyId}|${b.legacyId}`);
                const sameRoad = (a.roadId ?? null) && a.roadId === b.roadId;
                const mergedIntoRoad = sameRoad && (mergedSet.has(connId) || mergedSet.has(legacyConnId));
                const dx = (a.world.x ?? 0) - (b.world.x ?? 0);
                const dz = (a.world.z ?? 0) - (b.world.z ?? 0);
                connectors.push({
                    id: connId,
                    legacyId: legacyConnId,
                    junctionId: id,
                    aEndpointId: aId,
                    bEndpointId: bId,
                    aRoadId: a.roadId,
                    bRoadId: b.roadId,
                    aSegmentId: a.segmentId,
                    bSegmentId: b.segmentId,
                    aPieceId: a.pieceId,
                    bPieceId: b.pieceId,
                    distance: Math.hypot(dx, dz),
                    sameRoad,
                    mergedIntoRoad,
                    allowAToB: true,
                    allowBToA: true
                });
            }
        }
        connectors.sort((a, b) => compareString(a?.id, b?.id));

        const junction = {
            id,
            legacyId,
            source,
            candidateIds: Array.isArray(candidateIds) ? candidateIds.slice() : [],
            asphaltVisible: asphaltVisible !== false,
            missingCandidateIds: Array.isArray(missingCandidateIds) ? missingCandidateIds.slice() : [],
            center: { x: Number(center.x) || 0, z: Number(center.z) || 0 },
            roadIds: Array.from(roadsSet).sort(),
            segmentIds: Array.from(segmentsSet).sort(),
            endpoints: eps.map((e) => ({ ...e, junctionId: id })).sort((a, b) => compareString(a?.id, b?.id)),
            connectors,
            tat,
            surface: {
                points: surface.map((p) => ({ x: Number(p?.x) || 0, z: Number(p?.z) || 0 })),
                area: Math.abs(polygonArea(surface))
            }
        };

        if (junctionsSettings.enabled) {
            if (junction.surface.points.length >= 3) {
                primitives.push({
                    type: 'polygon',
                    id: `${id}__surface`,
                    kind: 'junction_surface',
                    roadId: null,
                    segmentId: id,
                    junctionId: id,
                    points: junction.surface.points.map((p) => ({ x: p.x, z: p.z }))
                });
            }

            if (junctionsSettings.debug?.boundary && junction.surface.points.length >= 2) {
                primitives.push({
                    type: 'polyline',
                    id: `${id}__boundary`,
                    kind: 'junction_boundary',
                    roadId: null,
                    segmentId: id,
                    junctionId: id,
                    points: [...junction.surface.points, junction.surface.points[0]].map((p) => ({ x: p.x, z: p.z }))
                });
            }

            if (junctionsSettings.debug?.endpoints && eps.length) {
                primitives.push({
                    type: 'points',
                    id: `${id}__endpoints`,
                    kind: 'junction_endpoints',
                    roadId: null,
                    segmentId: id,
                    junctionId: id,
                    points: eps.map((e) => ({ x: e.world.x, z: e.world.z }))
                });
            }

            if (junctionsSettings.debug?.edgeOrder && ordered.length >= 2) {
                primitives.push({
                    type: 'polyline',
                    id: `${id}__edge_order`,
                    kind: 'junction_edge_order',
                    roadId: null,
                    segmentId: id,
                    junctionId: id,
                    points: [...ordered, ordered[0]].map((e) => ({ x: e.world.x, z: e.world.z }))
                });
            }

            if (junctionsSettings.debug?.connectors && connectors.length) {
                for (const conn of connectors) {
                    if (conn.mergedIntoRoad) continue;
                    const a = endpointByIdLocal.get(conn.aEndpointId) ?? null;
                    const b = endpointByIdLocal.get(conn.bEndpointId) ?? null;
                    if (!a || !b) continue;
                    primitives.push({
                        type: 'polyline',
                        id: `${conn.id}__line`,
                        kind: 'junction_connector',
                        roadId: null,
                        segmentId: id,
                        junctionId: id,
                        connectorId: conn.id,
                        points: [{ x: a.world.x, z: a.world.z }, { x: b.world.x, z: b.world.z }]
                    });
                }
            }

            if (junctionsSettings.debug?.tat && tat.length) {
                const chord = Math.max(0.12, (Number(resolvedSettings.laneWidth) || 4.8) * 0.03);
                for (const item of tat) {
                    const tatId = item?.id ?? null;
                    if (!tatId) continue;
                    const tatType = item?.type ?? null;

                    const tangents = Array.isArray(item?.tangents) ? item.tangents : [];
                    for (let i = 0; i < tangents.length; i++) {
                        const seg = tangents[i] ?? null;
                        const a = seg?.a ?? null;
                        const b = seg?.b ?? null;
                        if (!a || !b) continue;
                        primitives.push({
                            type: 'polyline',
                            id: `${id}__tat_${tatId}__tangent_${i}`,
                            kind: 'junction_tat_tangent',
                            roadId: null,
                            segmentId: id,
                            junctionId: id,
                            tatId,
                            tatType,
                            points: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }]
                        });
                    }

                    const arc = item?.arc ?? null;
                    if (arc?.center && Number.isFinite(arc.radius) && arc.radius > 1e-6 && Number.isFinite(arc.startAng) && Number.isFinite(arc.spanAng) && arc.spanAng > 1e-6) {
                        const arcLen = Math.abs(Number(arc.spanAng) || 0) * (Number(arc.radius) || 0);
                        const segments = Math.max(6, Math.min(96, Math.ceil(arcLen / chord)));
                        const pts = sampleArcXZ({
                            center: arc.center,
                            radius: arc.radius,
                            startAng: arc.startAng,
                            spanAng: arc.spanAng,
                            ccw: arc.ccw !== false,
                            segments
                        });
                        if (pts.length >= 2) {
                            primitives.push({
                                type: 'polyline',
                                id: `${id}__tat_${tatId}__arc`,
                                kind: 'junction_tat_arc',
                                roadId: null,
                                segmentId: id,
                                junctionId: id,
                                tatId,
                                tatType,
                                points: pts.map((p) => ({ x: p.x, z: p.z }))
                            });
                        }
                    }
                }
            }
        }

        return junction;
    };

    for (const def of manualJunctions) {
        const candidateIds = Array.isArray(def?.candidateIds) ? def.candidateIds.slice() : [];
        const endpoints = [];
        const missing = [];

        for (const cid of candidateIds) {
            const endpoint = endpointById.get(cid) ?? null;
            if (endpoint) {
                endpoints.push(endpoint);
                continue;
            }

            const corner = cornerById.get(cid) ?? null;
            if (!corner) {
                missing.push(cid);
                continue;
            }

            const inList = endpointsBySegmentId.get(corner.inSegmentId) ?? [];
            const outList = endpointsBySegmentId.get(corner.outSegmentId) ?? [];
            const inEp = inList.find((e) => (e?.sourceIds ?? []).includes(corner.id)) ?? null;
            const outEp = outList.find((e) => (e?.sourceIds ?? []).includes(corner.id)) ?? null;
            if (inEp) endpoints.push(inEp);
            else missing.push(`${cid}::in`);
            if (outEp) endpoints.push(outEp);
            else missing.push(`${cid}::out`);
        }

        const unique = new Map();
        for (const ep of endpoints) {
            if (!ep?.id) continue;
            if (unique.has(ep.id)) continue;
            unique.set(ep.id, ep);
        }
        const eps = Array.from(unique.values()).sort((a, b) => compareString(a?.id, b?.id));
        const legacyEndpointIds = eps.map((e) => e.legacyId).sort(compareString);
        const legacyId = stableHashId('junc_', legacyEndpointIds.join('|'));
        const asphaltVisible = def.asphaltVisible !== false && !hiddenJunctionIds.has(def.id);
        const junction = buildJunctionRecord({
            id: def.id,
            legacyId,
            source: 'manual',
            candidateIds,
            endpoints: eps,
            asphaltVisible,
            missingCandidateIds: missing
        });
        junctions.push(junction);
        for (const ep of eps) usedEndpointIds.add(ep.id);
    }

    if (junctionsSettings.autoCreate === true) {
        const junctionIdSet = new Set(junctions.map((j) => j?.id).filter((v) => typeof v === 'string' && v.trim()));
        const manualCornerIds = new Set();
        for (const def of manualJunctions) {
            for (const cid of def?.candidateIds ?? []) {
                if (cornerById.has(cid)) manualCornerIds.add(cid);
            }
        }

        for (const corner of cornerCandidates) {
            const cornerId = corner?.id ?? null;
            if (!cornerId) continue;
            if (manualCornerIds.has(cornerId)) continue;
            const id = stableHashId('junc_', cornerId);
            if (junctionIdSet.has(id)) continue;
            if (suppressedAutoJunctionIds.has(id)) continue;

            const inList = endpointsBySegmentId.get(corner.inSegmentId) ?? [];
            const outList = endpointsBySegmentId.get(corner.outSegmentId) ?? [];
            const inEp = inList.find((e) => (e?.sourceIds ?? []).includes(cornerId)) ?? null;
            const outEp = outList.find((e) => (e?.sourceIds ?? []).includes(cornerId)) ?? null;
            if (!inEp || !outEp) continue;

            const endpoints = [inEp, outEp].sort((a, b) => compareString(a?.id, b?.id));
            if (usedEndpointIds.has(inEp.id) || usedEndpointIds.has(outEp.id)) continue;

            const legacyEndpointIds = endpoints.map((e) => e.legacyId).sort(compareString);
            const legacyId = stableHashId('junc_', legacyEndpointIds.join('|'));
            const asphaltVisible = !hiddenJunctionIds.has(id);

            const junction = buildJunctionRecord({
                id,
                legacyId,
                source: 'auto',
                candidateIds: [cornerId],
                endpoints,
                asphaltVisible
            });
            junctions.push(junction);
            junctionIdSet.add(id);
            usedEndpointIds.add(inEp.id);
            usedEndpointIds.add(outEp.id);
        }

        const eligibleForAuto = endpointCandidates
            .filter((ep) => ep?.id && ep?.world && !usedEndpointIds.has(ep.id))
            .slice()
            .sort((a, b) => compareString(a?.id, b?.id));

        const overlapGroups = new Map();
        for (const ep of eligibleForAuto) {
            const sources = Array.isArray(ep?.sourceIds) ? ep.sourceIds.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()) : [];
            const overlapIds = sources.filter((v) => v.startsWith('ov_')).sort(compareString);
            if (!overlapIds.length) continue;
            const key = overlapIds.join('|');
            if (!overlapGroups.has(key)) overlapGroups.set(key, new Set());
            overlapGroups.get(key).add(ep.id);
        }

        const overlapKeys = Array.from(overlapGroups.keys()).sort(compareString);
        for (const key of overlapKeys) {
            const endpointIds = Array.from(overlapGroups.get(key) ?? []).filter((id) => !usedEndpointIds.has(id)).sort(compareString);
            if (endpointIds.length < 2) continue;

            const id = stableHashId('junc_', `ovset:${key}`);
            if (junctionIdSet.has(id)) continue;
            if (suppressedAutoJunctionIds.has(id)) continue;

            const endpoints = endpointIds.map((cid) => endpointById.get(cid)).filter(Boolean);
            if (endpoints.length < 2) continue;

            const legacyEndpointIds = endpoints.map((e) => e.legacyId).sort(compareString);
            const legacyId = stableHashId('junc_', legacyEndpointIds.join('|'));
            const asphaltVisible = !hiddenJunctionIds.has(id);

            const junction = buildJunctionRecord({
                id,
                legacyId,
                source: 'auto',
                candidateIds: endpointIds,
                endpoints,
                asphaltVisible
            });
            junctions.push(junction);
            junctionIdSet.add(id);
            for (const ep of endpoints) usedEndpointIds.add(ep.id);
        }

        const baseThreshold = Math.max(0, junctionMinThreshold);
        const maxThreshold = Number.isFinite(junctionMaxThreshold) ? junctionMaxThreshold : Infinity;
        const clampThreshold = (value) => Math.min(maxThreshold, Math.max(baseThreshold, value));
        const pairThreshold = (a, b) => clampThreshold(((Number(a?.connectRadius) || 0) + (Number(b?.connectRadius) || 0)) * 0.75);

        const eligible = endpointCandidates
            .filter((ep) => ep?.id && ep?.world && !usedEndpointIds.has(ep.id))
            .slice()
            .sort((a, b) => compareString(a?.id, b?.id));

        const byId = new Map(eligible.map((ep) => [ep.id, ep]));
        const visited = new Set();
        for (const seed of eligible) {
            const seedId = seed?.id ?? null;
            if (!seedId || visited.has(seedId)) continue;

            const clusterIds = [];
            const queue = [seedId];
            visited.add(seedId);

            while (queue.length) {
                const currentId = queue.pop();
                const current = byId.get(currentId) ?? null;
                if (!current?.id || !current?.world) continue;
                clusterIds.push(currentId);

                for (const other of eligible) {
                    const otherId = other?.id ?? null;
                    if (!otherId || visited.has(otherId)) continue;
                    const threshold = pairThreshold(current, other);
                    if (distXZ(current.world, other.world) <= threshold + EPS) {
                        visited.add(otherId);
                        queue.push(otherId);
                    }
                }
            }

            if (clusterIds.length < 2) continue;
            clusterIds.sort(compareString);
            const id = stableHashId('junc_', clusterIds.join('|'));
            if (junctionIdSet.has(id)) continue;
            if (suppressedAutoJunctionIds.has(id)) continue;

            const endpoints = clusterIds.map((cid) => byId.get(cid)).filter(Boolean);
            if (endpoints.length < 2) continue;
            const legacyEndpointIds = endpoints.map((e) => e.legacyId).sort(compareString);
            const legacyId = stableHashId('junc_', legacyEndpointIds.join('|'));
            const asphaltVisible = !hiddenJunctionIds.has(id);

            const junction = buildJunctionRecord({
                id,
                legacyId,
                source: 'auto',
                candidateIds: clusterIds,
                endpoints,
                asphaltVisible
            });
            junctions.push(junction);
            junctionIdSet.add(id);
            for (const ep of endpoints) usedEndpointIds.add(ep.id);
        }
    }

    junctions.sort((a, b) => compareString(a?.id, b?.id));

    return {
        settings: resolvedSettings,
        roads: derivedRoads,
        segments,
        primitives,
        trim: trimOut,
        junctions,
        junctionCandidates: { endpoints: endpointCandidates, corners: cornerCandidates }
    };
}
