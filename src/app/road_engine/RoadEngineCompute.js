// src/app/road_engine/RoadEngineCompute.js
// Pure rebuild pipeline for road-edge computation and derived debug primitives.
// Design: Returns plain serializable data so results are deterministic and renderer-agnostic.

import { normalizeRoadTileOffsetBoundary } from './RoadEngineTileOffset.js';
import { computeEdgeFilletArcXZ, sampleArcXZ } from '../geometry/RoadEdgeFillet.js';

const EPS = 1e-9;

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
    const mergedConnectorIds = Array.isArray(j.mergedConnectorIds) ? j.mergedConnectorIds.filter((v) => typeof v === 'string' && v.trim()) : [];
    const manualJunctions = Array.isArray(j.manualJunctions) ? j.manualJunctions.filter((v) => v && typeof v === 'object') : [];
    const hiddenJunctionIds = Array.isArray(j.hiddenJunctionIds) ? j.hiddenJunctionIds.filter((v) => typeof v === 'string' && v.trim()) : [];
    const suppressedAutoJunctionIds = Array.isArray(j.suppressedAutoJunctionIds) ? j.suppressedAutoJunctionIds.filter((v) => typeof v === 'string' && v.trim()) : [];
    return {
        enabled: j.enabled !== false,
        thresholdFactor,
        minThreshold,
        maxThreshold,
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

function buildDegree2JunctionSurfaceXZ({ junctionId, endpoints, laneWidth }) {
    const eps = Array.isArray(endpoints) ? endpoints.filter(Boolean) : [];
    if (eps.length !== 2) return null;
    const e0 = eps[0];
    const e1 = eps[1];
    if (!e0?.leftEdge || !e0?.rightEdge || !e1?.leftEdge || !e1?.rightEdge) return null;

    const d0In = normalizeVecXZ({ x: -(Number(e0?.dirOut?.x) || 0), z: -(Number(e0?.dirOut?.z) || 0) });
    const d1In = normalizeVecXZ({ x: -(Number(e1?.dirOut?.x) || 0), z: -(Number(e1?.dirOut?.z) || 0) });
    if (!d0In || !d1In) return null;

    const r0 = normalizeVecXZ(e0?.rightOut);
    const r1 = normalizeVecXZ(e1?.rightOut);
    if (!r0 || !r1) return null;

    const getEdgePoint = (endpoint, side) => (side === 'left' ? endpoint.leftEdge : endpoint.rightEdge);
    const getOutsideNormal = (right, side) => (side === 'right' ? { x: right.x, z: right.z } : { x: -right.x, z: -right.z });

    const scorePairing = (a0, a1, b0, b1) => (
        distXZ(getEdgePoint(e0, a0), getEdgePoint(e1, a1))
        + distXZ(getEdgePoint(e0, b0), getEdgePoint(e1, b1))
    );

    const directScore = scorePairing('left', 'left', 'right', 'right');
    const swappedScore = scorePairing('left', 'right', 'right', 'left');
    const pairing = swappedScore < directScore - 1e-9
        ? { a0: 'left', a1: 'right', b0: 'right', b1: 'left' }
        : { a0: 'left', a1: 'left', b0: 'right', b1: 'right' };

    const maxRadius = Math.max(0, Math.min(Number(e0?.connectRadius) || 0, Number(e1?.connectRadius) || 0));
    const chord = Math.max(0.35, (Number(laneWidth) || 4.8) * 0.18);

    const fitFillet = ({ p0, dir0, out0, p1, dir1, out1, radiusMax }) => {
        const max = Number(radiusMax) || 0;
        if (!(max > 1e-6)) return null;
        let lo = 0;
        let hi = max;
        let best = null;
        for (let iter = 0; iter < 22; iter++) {
            const r = (lo + hi) * 0.5;
            if (!(r > 1e-6)) break;
            const arc = computeEdgeFilletArcXZ({ p0, dir0, out0, p1, dir1, out1, radius: r });
            if (arc) {
                const t0 = arc.tangent0 ?? null;
                const t1 = arc.tangent1 ?? null;
                const s0 = t0 ? dot2({ x: (t0.x ?? 0) - (p0.x ?? 0), z: (t0.z ?? 0) - (p0.z ?? 0) }, dir0) : -1;
                const s1 = t1 ? dot2({ x: (t1.x ?? 0) - (p1.x ?? 0), z: (t1.z ?? 0) - (p1.z ?? 0) }, dir1) : -1;
                if (s0 >= -1e-4 && s1 >= -1e-4) {
                    best = arc;
                    lo = r;
                    continue;
                }
            }
            hi = r;
        }
        return best;
    };

    const buildTat = ({ aSide, bSide }) => {
        const p0 = getEdgePoint(e0, aSide);
        const p1 = getEdgePoint(e1, bSide);
        const out0 = getOutsideNormal(r0, aSide);
        const out1 = getOutsideNormal(r1, bSide);

        const arc = fitFillet({
            p0,
            dir0: d0In,
            out0,
            p1,
            dir1: d1In,
            out1,
            radiusMax: maxRadius
        });

        const points = [];
        appendUniquePoint(points, p0);

        const tangents = [];
        let arcRec = null;

        if (arc) {
            const t0 = arc.tangent0 ?? null;
            const t1 = arc.tangent1 ?? null;
            if (t0) {
                appendUniquePoint(points, t0);
                tangents.push({
                    a: { x: Number(p0.x) || 0, z: Number(p0.z) || 0 },
                    b: { x: Number(t0.x) || 0, z: Number(t0.z) || 0 },
                    length: distXZ(p0, t0)
                });
            }

            const arcLen = Math.abs(Number(arc.spanAng) || 0) * (Number(arc.radius) || 0);
            const segments = Math.max(6, Math.min(96, Math.ceil(arcLen / chord)));
            const arcPts = sampleArcXZ({ ...arc, segments });
            for (let i = 1; i < arcPts.length; i++) appendUniquePoint(points, arcPts[i]);

            if (t1) {
                tangents.push({
                    a: { x: Number(t1.x) || 0, z: Number(t1.z) || 0 },
                    b: { x: Number(p1.x) || 0, z: Number(p1.z) || 0 },
                    length: distXZ(t1, p1)
                });
            }

            arcRec = {
                center: { x: Number(arc.center?.x) || 0, z: Number(arc.center?.z) || 0 },
                radius: Number(arc.radius) || 0,
                startAng: Number(arc.startAng) || 0,
                spanAng: Number(arc.spanAng) || 0,
                ccw: arc.ccw !== false,
                tangent0: t0 ? { x: Number(t0.x) || 0, z: Number(t0.z) || 0 } : null,
                tangent1: t1 ? { x: Number(t1.x) || 0, z: Number(t1.z) || 0 } : null,
                length: arcLen
            };
        } else {
            appendUniquePoint(points, p1);
            tangents.push({
                a: { x: Number(p0.x) || 0, z: Number(p0.z) || 0 },
                b: { x: Number(p1.x) || 0, z: Number(p1.z) || 0 },
                length: distXZ(p0, p1)
            });
        }

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
    for (const p of outer.points ?? []) appendUniquePoint(poly, p);
    appendUniquePoint(poly, inner.b);
    const innerRev = (inner.points ?? []).slice().reverse();
    for (const p of innerRev) appendUniquePoint(poly, p);
    appendUniquePoint(poly, outer.a);

    const cleaned = [];
    for (const p of poly) appendUniquePoint(cleaned, p);
    if (cleaned.length >= 3 && distXZ(cleaned[0], cleaned[cleaned.length - 1]) <= 1e-6) cleaned.pop();

    let surface = ensureCcw(cleaned);
    const area = Math.abs(polygonArea(surface));
    if (polygonSelfIntersectsXZ(surface) || !(area > 1e-6)) {
        const quad = [outer.a, outer.b, inner.b, inner.a];
        surface = ensureCcw(quad);
        const fallbackArea = Math.abs(polygonArea(surface));
        if (polygonSelfIntersectsXZ(surface) || !(fallbackArea > 1e-6)) surface = convexHullXZ([outer.a, outer.b, inner.a, inner.b]);
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
            arc: t.arc
        }))
    };
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
                if (aSeg.aPointId === bSeg.aPointId || aSeg.aPointId === bSeg.bPointId || aSeg.bPointId === bSeg.aPointId || aSeg.bPointId === bSeg.bPointId) continue;

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
            const local = Math.max(junctionMinThreshold, radius * junctionThresholdFactor);
            const cutDistance = Math.min(junctionMaxThreshold, local);
            corner.cutDistance = cutDistance;

            const pushCut = (seg, mode) => {
                if (!seg) return;
                const len = Number(seg.length) || 0;
                if (!(len > 1e-6)) return;
                const dist = Math.max(0, Math.min(cutDistance, len * 0.45));
                if (!(dist > 1e-6)) return;
                const t = clamp01(dist / len);
                const interval = mode === 'start'
                    ? { t0: 0, t1: t }
                    : { t0: clamp01(1 - t), t1: 1 };
                if (!(interval.t1 > interval.t0 + 1e-9)) return;
                if (!intervalsBySeg.has(seg.id)) intervalsBySeg.set(seg.id, []);
                intervalsBySeg.get(seg.id).push({ ...interval, sourceIds: [cornerId] });
            };

            pushCut(inSeg, 'end');
            pushCut(outSeg, 'start');
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
            const aAng = Math.atan2(Number(a?.dirOut?.z) || 0, Number(a?.dirOut?.x) || 0);
            const bAng = Math.atan2(Number(b?.dirOut?.z) || 0, Number(b?.dirOut?.x) || 0);
            if (aAng < bAng - 1e-12) return -1;
            if (aAng > bAng + 1e-12) return 1;
            return compareString(a?.id, b?.id);
        });

        let tat = [];
        let surface = null;
        if (ordered.length === 2) {
            const deg2 = buildDegree2JunctionSurfaceXZ({ junctionId: id, endpoints: ordered, laneWidth: resolvedSettings.laneWidth });
            if (deg2?.points?.length >= 3) {
                surface = deg2.points;
                tat = Array.isArray(deg2.tat) ? deg2.tat : [];
            }
        }

        if (!surface) {
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
                const chord = Math.max(0.35, (Number(resolvedSettings.laneWidth) || 4.8) * 0.18);
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
