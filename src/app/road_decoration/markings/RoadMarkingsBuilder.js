// src/app/road_decoration/markings/RoadMarkingsBuilder.js
// Builds lane markings (center lines, lane dividers, edge/border lines, arrows, crosswalks) from RoadEngine derived data.

import { computeEdgeFilletArcXZ, lineIntersectionXZ, sampleArcXZ } from '../../geometry/RoadEdgeFillet.js';

const EPS = 1e-9;
const LANE_WIDTH_BASE = 4.8;
const MARKING_EDGE_INSET_BASE = 0.33;

function clampNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, lo, hi) {
    const n = Math.trunc(Number(value) || 0);
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
}

function distXZ(a, b) {
    const dx = (Number(a?.x) || 0) - (Number(b?.x) || 0);
    const dz = (Number(a?.z) || 0) - (Number(b?.z) || 0);
    return Math.hypot(dx, dz);
}

function normalizeDirXZ(a, b) {
    const dx = (Number(b?.x) || 0) - (Number(a?.x) || 0);
    const dz = (Number(b?.z) || 0) - (Number(a?.z) || 0);
    const len = Math.hypot(dx, dz);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: dx * inv, z: dz * inv, length: len };
}

function addScaledXZ(p, dir, scale) {
    return {
        x: (Number(p?.x) || 0) + (Number(dir?.x) || 0) * scale,
        z: (Number(p?.z) || 0) + (Number(dir?.z) || 0) * scale
    };
}

function quantizeKey({ x, z }, eps) {
    const e = Math.max(EPS, clampNumber(eps, 1e-4));
    const qx = Math.round((Number(x) || 0) / e);
    const qz = Math.round((Number(z) || 0) / e);
    return `${qx},${qz}`;
}

function distSq(a, b) {
    const dx = (Number(a?.x) || 0) - (Number(b?.x) || 0);
    const dz = (Number(a?.z) || 0) - (Number(b?.z) || 0);
    return dx * dx + dz * dz;
}

function cross2(a, b, c) {
    const abx = (Number(b?.x) || 0) - (Number(a?.x) || 0);
    const abz = (Number(b?.z) || 0) - (Number(a?.z) || 0);
    const acx = (Number(c?.x) || 0) - (Number(a?.x) || 0);
    const acz = (Number(c?.z) || 0) - (Number(a?.z) || 0);
    return abx * acz - abz * acx;
}

function polygonArea(points) {
    const pts = Array.isArray(points) ? points : [];
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

function ensureCcw(points) {
    const pts = Array.isArray(points) ? points : [];
    if (pts.length < 3) return [];
    if (polygonArea(pts) >= 0) return pts.slice();
    return pts.slice().reverse();
}

function normalizePointList(points, { epsilon = 1e-4, forceCcw = true } = {}) {
    const eps = Math.max(EPS, clampNumber(epsilon, 1e-4));
    const tolSq = eps * eps;
    const list = Array.isArray(points) ? points : [];
    if (!list.length) return [];

    const cleaned = [];
    for (const p of list) {
        const next = { x: clampNumber(p?.x, 0), z: clampNumber(p?.z, 0) };
        const last = cleaned[cleaned.length - 1] ?? null;
        if (last && distSq(last, next) <= tolSq) continue;
        cleaned.push(next);
    }

    if (cleaned.length >= 2 && distSq(cleaned[0], cleaned[cleaned.length - 1]) <= tolSq) cleaned.pop();
    if (cleaned.length < 3) return [];

    let loop = forceCcw === false ? cleaned.slice() : ensureCcw(cleaned);
    let changed = true;
    while (changed && loop.length >= 3) {
        changed = false;
        const out = [];
        for (let i = 0; i < loop.length; i++) {
            const prev = loop[(i - 1 + loop.length) % loop.length];
            const curr = loop[i];
            const next = loop[(i + 1) % loop.length];
            if (Math.abs(cross2(prev, curr, next)) <= eps) {
                changed = true;
                continue;
            }
            out.push(curr);
        }
        loop = out;
        if (loop.length >= 2 && distSq(loop[0], loop[loop.length - 1]) <= tolSq) {
            loop.pop();
            changed = true;
        }
    }

    return loop.length >= 3 ? loop : [];
}

function buildBoundaryLoops(polygons, { epsilon = 1e-4 } = {}) {
    const eps = Math.max(EPS, clampNumber(epsilon, 1e-4));
    const edgeCounts = new Map();
    const edges = [];
    const vertexAcc = new Map();

    const addVertex = (key, p) => {
        const prev = vertexAcc.get(key);
        if (prev) {
            prev.x += Number(p?.x) || 0;
            prev.z += Number(p?.z) || 0;
            prev.n += 1;
            return;
        }
        vertexAcc.set(key, { x: Number(p?.x) || 0, z: Number(p?.z) || 0, n: 1 });
    };

    const polys = Array.isArray(polygons) ? polygons : [];
    for (const polyRaw of polys) {
        const poly = normalizePointList(polyRaw, { epsilon: eps });
        if (poly.length < 3) continue;
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            const aKey = quantizeKey(a, eps);
            const bKey = quantizeKey(b, eps);
            if (aKey === bKey) continue;
            addVertex(aKey, a);
            addVertex(bKey, b);
            const undirected = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
            edgeCounts.set(undirected, (edgeCounts.get(undirected) || 0) + 1);
            edges.push({ fromKey: aKey, toKey: bKey, undirected });
        }
    }

    const vertexPosByKey = new Map();
    for (const [key, acc] of vertexAcc.entries()) {
        const inv = acc.n > 0 ? 1 / acc.n : 0;
        vertexPosByKey.set(key, { x: acc.x * inv, z: acc.z * inv });
    }

    const boundaryEdges = [];
    for (const edge of edges) {
        if ((edgeCounts.get(edge.undirected) || 0) !== 1) continue;
        boundaryEdges.push(edge);
    }

    const edgesByFrom = new Map();
    for (let i = 0; i < boundaryEdges.length; i++) {
        const edge = boundaryEdges[i];
        if (!edgesByFrom.has(edge.fromKey)) edgesByFrom.set(edge.fromKey, []);
        edgesByFrom.get(edge.fromKey).push(i);
    }

    for (const list of edgesByFrom.values()) {
        list.sort((ia, ib) => {
            const a = boundaryEdges[ia];
            const b = boundaryEdges[ib];
            const ak = `${a.fromKey}|${a.toKey}`;
            const bk = `${b.fromKey}|${b.toKey}`;
            if (ak < bk) return -1;
            if (ak > bk) return 1;
            return 0;
        });
    }

    const ordered = boundaryEdges
        .map((edge, index) => ({ edge, index, key: `${edge.fromKey}|${edge.toKey}` }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    const used = new Set();
    const loops = [];
    const maxGuard = Math.max(4, boundaryEdges.length + 5);

    for (const entry of ordered) {
        const startIndex = entry.index;
        if (used.has(startIndex)) continue;
        const start = boundaryEdges[startIndex];
        const startKey = start.fromKey;
        const keys = [startKey];
        used.add(startIndex);

        let currentKey = start.toKey;
        let guard = 0;
        while (guard++ < maxGuard) {
            if (currentKey === startKey) break;
            keys.push(currentKey);
            const candidates = edgesByFrom.get(currentKey) ?? [];
            let nextIndex = null;
            for (const idx of candidates) {
                if (!used.has(idx)) {
                    nextIndex = idx;
                    break;
                }
            }
            if (nextIndex === null) break;
            used.add(nextIndex);
            currentKey = boundaryEdges[nextIndex].toKey;
        }

        if (currentKey !== startKey || keys.length < 3) continue;

        const points = [];
        for (const key of keys) {
            const p = vertexPosByKey.get(key);
            if (!p) continue;
            points.push({ x: Number(p.x) || 0, z: Number(p.z) || 0 });
        }
        const normalized = normalizePointList(points, { epsilon: eps, forceCcw: false });
        if (normalized.length >= 3) loops.push(normalized);
    }

    return loops;
}

function rightNormalXZ(dir) {
    return { x: Number(dir?.z) || 0, z: -(Number(dir?.x) || 0) };
}

function offsetLoop(points, offset, { miterLimit = 4, epsilon = 1e-6 } = {}) {
    const pts = Array.isArray(points) ? points : [];
    const n = pts.length;
    if (n < 3) return [];
    const dist = clampNumber(offset, 0);
    if (!(Math.abs(dist) > EPS)) return pts.map((p) => ({ x: Number(p?.x) || 0, z: Number(p?.z) || 0 }));
    const eps = Math.max(EPS, clampNumber(epsilon, 1e-6));
    const limit = Math.max(1, clampNumber(miterLimit, 4));
    const maxLen = Math.abs(dist) * limit;
    const out = [];

    for (let i = 0; i < n; i++) {
        const prev = pts[(i - 1 + n) % n];
        const curr = pts[i];
        const next = pts[(i + 1) % n];
        const d0 = normalizeDirXZ(prev, curr);
        const d1 = normalizeDirXZ(curr, next);
        if (!d0 || !d1) {
            out.push({ x: Number(curr?.x) || 0, z: Number(curr?.z) || 0 });
            continue;
        }
        const n0 = rightNormalXZ(d0);
        const n1 = rightNormalXZ(d1);
        const mx = n0.x + n1.x;
        const mz = n0.z + n1.z;
        const mLen = Math.hypot(mx, mz);
        if (!(mLen > eps)) {
            out.push({ x: (Number(curr?.x) || 0) + n0.x * dist, z: (Number(curr?.z) || 0) + n0.z * dist });
            continue;
        }
        const inv = 1 / mLen;
        const m = { x: mx * inv, z: mz * inv };
        const denom = m.x * n0.x + m.z * n0.z;
        if (!(Math.abs(denom) > eps)) {
            out.push({ x: (Number(curr?.x) || 0) + n0.x * dist, z: (Number(curr?.z) || 0) + n0.z * dist });
            continue;
        }
        let len = dist / denom;
        if (Math.abs(len) > maxLen) len = maxLen * Math.sign(len);
        out.push({ x: (Number(curr?.x) || 0) + m.x * len, z: (Number(curr?.z) || 0) + m.z * len });
    }

    return normalizePointList(out, { epsilon: eps, forceCcw: false });
}

function appendLineSegment(out, a, b, y) {
    out.push(
        Number(a?.x) || 0, y, Number(a?.z) || 0,
        Number(b?.x) || 0, y, Number(b?.z) || 0
    );
}

function appendTriangle(out, a, b, c, y) {
    out.push(
        Number(a?.x) || 0, y, Number(a?.z) || 0,
        Number(b?.x) || 0, y, Number(b?.z) || 0,
        Number(c?.x) || 0, y, Number(c?.z) || 0
    );
}

function makePolylineSampler(points) {
    const pts = Array.isArray(points) ? points : [];
    const segments = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const len = distXZ(a, b);
        if (!(len > EPS)) continue;
        segments.push({ i, len, totalStart: total });
        total += len;
    }

    let segIndex = 0;
    return {
        length: total,
        segments,
        sample(distance) {
            const d = clampNumber(distance, 0);
            if (!(d > 0)) {
                const p = pts[0] ?? { x: 0, z: 0 };
                return { x: Number(p.x) || 0, z: Number(p.z) || 0 };
            }
            if (!(d < total - EPS)) {
                const p = pts[pts.length - 1] ?? { x: 0, z: 0 };
                return { x: Number(p.x) || 0, z: Number(p.z) || 0 };
            }

            while (segIndex < segments.length - 1 && d > segments[segIndex].totalStart + segments[segIndex].len - 1e-9) segIndex++;
            const seg = segments[segIndex] ?? null;
            if (!seg) {
                const p = pts[pts.length - 1] ?? { x: 0, z: 0 };
                return { x: Number(p.x) || 0, z: Number(p.z) || 0 };
            }

            const a = pts[seg.i];
            const b = pts[seg.i + 1];
            const t = seg.len > EPS ? (d - seg.totalStart) / seg.len : 0;
            const ax = Number(a?.x) || 0;
            const az = Number(a?.z) || 0;
            const bx = Number(b?.x) || 0;
            const bz = Number(b?.z) || 0;
            return { x: ax + (bx - ax) * t, z: az + (bz - az) * t };
        }
    };
}

function appendPolylineDistanceRangeSegments(out, sampler, startDistance, endDistance, y) {
    const total = Number(sampler?.length) || 0;
    if (!(total > EPS)) return;
    const start = Math.max(0, clampNumber(startDistance, 0));
    const end = Math.min(total, Math.max(0, clampNumber(endDistance, 0)));
    if (!(end > start + EPS)) return;

    const segments = Array.isArray(sampler?.segments) ? sampler.segments : [];
    for (const seg of segments) {
        const segStart = Number(seg?.totalStart) || 0;
        const segLen = Number(seg?.len) || 0;
        const segEnd = segStart + segLen;
        if (!(segLen > EPS)) continue;
        if (segEnd <= start + EPS) continue;
        if (segStart >= end - EPS) break;
        const aDist = Math.max(start, segStart);
        const bDist = Math.min(end, segEnd);
        if (!(bDist > aDist + EPS)) continue;
        const a = sampler.sample(aDist);
        const b = sampler.sample(bDist);
        appendLineSegment(out, a, b, y);
    }
}

function appendDashedPolylineSegments(out, points, { startTrim = 0, endTrim = 0, dash = 1, gap = 0.5, y = 0 } = {}) {
    const sampler = makePolylineSampler(points);
    const total = sampler.length;
    if (!(total > EPS)) return;

    const usableStart = Math.max(0, clampNumber(startTrim, 0));
    const usableEnd = Math.min(total, total - Math.max(0, clampNumber(endTrim, 0)));
    if (!(usableEnd > usableStart + EPS)) return;

    const dLen = Math.max(EPS, clampNumber(dash, 1));
    const gLen = Math.max(0, clampNumber(gap, 0));
    const step = dLen + gLen;
    if (!(step > EPS)) return;

    for (let t = usableStart; t < usableEnd - EPS; t += step) {
        const t0 = t;
        const t1 = Math.min(t + dLen, usableEnd);
        if (!(t1 > t0 + EPS)) continue;
        appendPolylineDistanceRangeSegments(out, sampler, t0, t1, y);
    }
}

function appendSolidPolylineSegments(out, points, { startTrim = 0, endTrim = 0, y = 0, includeSegment = null } = {}) {
    const sampler = makePolylineSampler(points);
    const total = sampler.length;
    if (!(total > EPS)) return;

    const usableStart = Math.max(0, clampNumber(startTrim, 0));
    const usableEnd = Math.min(total, total - Math.max(0, clampNumber(endTrim, 0)));
    if (!(usableEnd > usableStart + EPS)) return;

    const segments = Array.isArray(sampler?.segments) ? sampler.segments : [];
    for (const seg of segments) {
        const segStart = Number(seg?.totalStart) || 0;
        const segLen = Number(seg?.len) || 0;
        const segEnd = segStart + segLen;
        if (!(segLen > EPS)) continue;
        if (segEnd <= usableStart + EPS) continue;
        if (segStart >= usableEnd - EPS) break;

        if (typeof includeSegment === 'function' && !includeSegment(seg?.i ?? 0)) continue;

        const aDist = Math.max(usableStart, segStart);
        const bDist = Math.min(usableEnd, segEnd);
        if (!(bDist > aDist + EPS)) continue;
        const a = sampler.sample(aDist);
        const b = sampler.sample(bDist);
        appendLineSegment(out, a, b, y);
    }
}

function buildEdgeLineSegmentsFromPrimitives(primitives, { laneWidth, markingY, boundaryEpsilon } = {}) {
    const polys = [];
    const list = Array.isArray(primitives) ? primitives : [];
    for (const prim of list) {
        if (!prim || prim.type !== 'polygon') continue;
        const kind = prim.kind ?? null;
        if (kind !== 'asphalt_piece' && kind !== 'junction_surface') continue;
        polys.push(Array.isArray(prim.points) ? prim.points : []);
    }

    if (!polys.length) return [];

    const eps = Math.max(EPS, clampNumber(boundaryEpsilon, 1e-4));
    const loops = buildBoundaryLoops(polys, { epsilon: eps });
    if (!loops.length) return [];

    const lw = Math.max(EPS, clampNumber(laneWidth, LANE_WIDTH_BASE));
    const edgeInset = lw * (MARKING_EDGE_INSET_BASE / LANE_WIDTH_BASE);
    const y = clampNumber(markingY, 0);

    const out = [];
    for (const loop of loops) {
        const inset = offsetLoop(loop, -edgeInset, { epsilon: eps, miterLimit: 4 });
        const pts = inset.length >= 3 ? inset : loop;
        if (pts.length < 3) continue;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            appendLineSegment(out, a, b, y);
        }
    }
    return out;
}

function buildCrosswalkTrianglesFromJunctions(junctions, { laneWidth, crosswalkY } = {}) {
    const lw = Math.max(EPS, clampNumber(laneWidth, LANE_WIDTH_BASE));
    const y = clampNumber(crosswalkY, 0);
    const edgeInset = lw * (MARKING_EDGE_INSET_BASE / LANE_WIDTH_BASE);

    const crosswalkCenterDist = lw * 0.55;
    const crosswalkDepth = lw * 0.5;
    const stripeDepth = lw * 0.1;
    const stripeGap = lw * 0.06;
    const stripeStep = stripeDepth + stripeGap;

    const out = [];
    const list = Array.isArray(junctions) ? junctions : [];
    for (const junction of list) {
        const endpoints = Array.isArray(junction?.endpoints) ? junction.endpoints : [];
        if (endpoints.length < 3) continue;
        for (const ep of endpoints) {
            const world = ep?.world ?? null;
            const dirOut = ep?.dirOut ?? null;
            const rightOut = ep?.rightOut ?? null;
            if (!world || !dirOut || !rightOut) continue;

            const widthLeft = Math.max(0, Number(ep?.widthLeft) || 0);
            const widthRight = Math.max(0, Number(ep?.widthRight) || 0);
            const leftSpan = Math.max(0, widthLeft - edgeInset);
            const rightSpan = Math.max(0, widthRight - edgeInset);
            const span = leftSpan + rightSpan;
            if (!(span > EPS)) continue;

            const stripeCount = Math.max(1, Math.floor((span + stripeGap) / stripeStep));
            const used = stripeCount * stripeDepth + Math.max(0, stripeCount - 1) * stripeGap;
            const leftover = Math.max(0, span - used);
            const firstStripeCenterAcross = -span * 0.5 + leftover * 0.5 + stripeDepth * 0.5;

            const baseCenter = addScaledXZ(world, dirOut, crosswalkCenterDist);
            const crossCenter = (rightSpan - leftSpan) * 0.5;
            const halfAcross = stripeDepth * 0.5;
            const halfAlong = crosswalkDepth * 0.5;

            for (let i = 0; i < stripeCount; i++) {
                const across = firstStripeCenterAcross + stripeStep * i;
                const center = addScaledXZ(baseCenter, rightOut, crossCenter + across);

                const leftBack = addScaledXZ(addScaledXZ(center, rightOut, -halfAcross), dirOut, -halfAlong);
                const rightBack = addScaledXZ(addScaledXZ(center, rightOut, halfAcross), dirOut, -halfAlong);
                const rightFront = addScaledXZ(addScaledXZ(center, rightOut, halfAcross), dirOut, halfAlong);
                const leftFront = addScaledXZ(addScaledXZ(center, rightOut, -halfAcross), dirOut, halfAlong);

                appendTriangle(out, leftBack, rightBack, rightFront, y);
                appendTriangle(out, leftBack, rightFront, leftFront, y);
            }
        }
    }

    return out;
}

function buildCenterlinePolylinesFromDerived(segments, junctions, { laneWidth } = {}) {
    const nodePosByKey = new Map();
    const twoWayByKey = new Map();
    const adjacency = new Map();
    const junctionCurveByEdge = new Map();

    const lw = Math.max(EPS, clampNumber(laneWidth, LANE_WIDTH_BASE));
    const chord = Math.max(0.08, lw * 0.02);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const dotXZ = (a, b) => (Number(a?.x) || 0) * (Number(b?.x) || 0) + (Number(a?.z) || 0) * (Number(b?.z) || 0);
    const normalizeVecXZ = (v) => {
        const x = Number(v?.x) || 0;
        const z = Number(v?.z) || 0;
        const len = Math.hypot(x, z);
        if (!(len > EPS)) return null;
        const inv = 1 / len;
        return { x: x * inv, z: z * inv };
    };
    const appendUnique = (list, p, tol = 1e-6) => {
        const x = Number(p?.x) || 0;
        const z = Number(p?.z) || 0;
        const last = list[list.length - 1] ?? null;
        if (last && distSq(last, { x, z }) <= tol * tol) return;
        list.push({ x, z });
    };
    const buildDegree2Curve = (aEndpoint, bEndpoint, aKey, bKey, centerHint) => {
        const aPos = nodePosByKey.get(aKey) ?? null;
        const bPos = nodePosByKey.get(bKey) ?? null;
        if (!aPos || !bPos) return null;

        const dist = distXZ(aPos, bPos);
        if (!(dist > 1e-6)) return null;

        const p0 = { x: Number(aPos.x) || 0, z: Number(aPos.z) || 0 };
        const p1 = { x: Number(bPos.x) || 0, z: Number(bPos.z) || 0 };

        const aIn = normalizeVecXZ({ x: -(Number(aEndpoint?.dirOut?.x) || 0), z: -(Number(aEndpoint?.dirOut?.z) || 0) });
        const bIn = normalizeVecXZ({ x: -(Number(bEndpoint?.dirOut?.x) || 0), z: -(Number(bEndpoint?.dirOut?.z) || 0) });
        const fallback0 = normalizeVecXZ({ x: p1.x - p0.x, z: p1.z - p0.z });
        const fallback1 = normalizeVecXZ({ x: p0.x - p1.x, z: p0.z - p1.z });
        const dir0 = aIn ?? fallback0;
        const dir1 = bIn ?? fallback1;
        if (!dir0 || !dir1) return [p0, p1];

        const alignment = clamp(dotXZ(dir0, dir1), -1, 1);
        const angle = Math.acos(alignment);
        if (!(angle > 0.12)) return [p0, p1];

        const hit = lineIntersectionXZ(p0, dir0, p1, dir1);
        const t0 = Number(hit?.t) || 0;
        const t1 = Number(hit?.u) || 0;
        const d = (t0 > 1e-6 && t1 > 1e-6)
            ? (Math.abs(t0 - t1) <= 1e-4 ? (t0 + t1) * 0.5 : Math.min(t0, t1))
            : 0;
        const radius = (d > 1e-6 && angle > 1e-6 && angle < Math.PI - 1e-6)
            ? d * Math.tan(angle * 0.5)
            : 0;
        if (!(radius > 1e-6)) return [p0, p1];

        const n0 = rightNormalXZ(dir0);
        const n1 = rightNormalXZ(dir1);
        const options0 = [n0, { x: -n0.x, z: -n0.z }];
        const options1 = [n1, { x: -n1.x, z: -n1.z }];

        let best = null;
        let bestErr = Infinity;
        let bestCenterScore = Infinity;
        for (const out0 of options0) {
            for (const out1 of options1) {
                const candidate = computeEdgeFilletArcXZ({ p0, dir0, out0, p1, dir1, out1, radius });
                if (!candidate?.center || !candidate?.tangent0 || !candidate?.tangent1) continue;
                const err = distXZ(candidate.tangent0, p0) + distXZ(candidate.tangent1, p1);
                const hint = centerHint ?? null;
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

        if (!best?.center) return [p0, p1];

        const span = Number(best.spanAng) || 0;
        const arcRadius = Number(best.radius) || 0;
        if (!(span > 1e-6) || !(arcRadius > 1e-6)) return [p0, p1];

        const arcLen = Math.abs(span) * arcRadius;
        const segments = clampInt(Math.ceil(arcLen / chord), 6, 96);
        const arcPoints = sampleArcXZ({
            center: best.center,
            radius: arcRadius,
            startAng: Number(best.startAng) || 0,
            spanAng: span,
            ccw: best.ccw !== false,
            segments
        });

        const points = [];
        appendUnique(points, p0);
        if (best.tangent0) appendUnique(points, best.tangent0);
        for (const p of arcPoints) appendUnique(points, p);
        if (best.tangent1) appendUnique(points, best.tangent1);
        appendUnique(points, p1);
        return points.length >= 2 ? points : [p0, p1];
    };

    const addNeighbor = (a, b) => {
        if (!adjacency.has(a)) adjacency.set(a, []);
        const list = adjacency.get(a);
        if (!list.includes(b)) list.push(b);
    };

    const segs = Array.isArray(segments) ? segments : [];
    for (const seg of segs) {
        const lanesF = clampInt(seg?.lanesF ?? 0, 0, 99);
        const lanesB = clampInt(seg?.lanesB ?? 0, 0, 99);
        const isTwoWay = lanesF > 0 && lanesB > 0;
        const pieces = Array.isArray(seg?.keptPieces) ? seg.keptPieces : [];
        for (const piece of pieces) {
            const pid = piece?.id ?? null;
            if (!pid) continue;
            const aKey = `${pid}|a`;
            const bKey = `${pid}|b`;
            const aWorld = piece?.aWorld ?? null;
            const bWorld = piece?.bWorld ?? null;
            if (aWorld) {
                nodePosByKey.set(aKey, { x: Number(aWorld.x) || 0, z: Number(aWorld.z) || 0 });
                twoWayByKey.set(aKey, isTwoWay);
            }
            if (bWorld) {
                nodePosByKey.set(bKey, { x: Number(bWorld.x) || 0, z: Number(bWorld.z) || 0 });
                twoWayByKey.set(bKey, isTwoWay);
            }
            addNeighbor(aKey, bKey);
            addNeighbor(bKey, aKey);
        }
    }

    const juncs = Array.isArray(junctions) ? junctions : [];
    for (const junction of juncs) {
        const endpoints = Array.isArray(junction?.endpoints) ? junction.endpoints : [];
        if (endpoints.length !== 2) continue;
        const a = endpoints[0] ?? null;
        const b = endpoints[1] ?? null;
        const aKey = a?.pieceId ? `${a.pieceId}|${a.end}` : null;
        const bKey = b?.pieceId ? `${b.pieceId}|${b.end}` : null;
        if (!aKey || !bKey) continue;
        if (!nodePosByKey.has(aKey) || !nodePosByKey.has(bKey)) continue;
        const curve = buildDegree2Curve(a, b, aKey, bKey, junction?.center ?? null);
        if (Array.isArray(curve) && curve.length >= 2) {
            junctionCurveByEdge.set(`${aKey}|${bKey}`, curve.map((p) => ({ x: Number(p?.x) || 0, z: Number(p?.z) || 0 })));
            junctionCurveByEdge.set(`${bKey}|${aKey}`, curve.slice().reverse().map((p) => ({ x: Number(p?.x) || 0, z: Number(p?.z) || 0 })));
        }
        addNeighbor(aKey, bKey);
        addNeighbor(bKey, aKey);
    }

    const keys = Array.from(nodePosByKey.keys()).sort();
    const visited = new Set();
    const polylines = [];

    for (const startKey of keys) {
        if (visited.has(startKey)) continue;

        const stack = [startKey];
        const component = new Set();
        while (stack.length) {
            const k = stack.pop();
            if (component.has(k)) continue;
            component.add(k);
            const neighbors = adjacency.get(k) ?? [];
            for (const n of neighbors) {
                if (component.has(n)) continue;
                stack.push(n);
            }
        }

        const componentKeys = Array.from(component).sort();
        for (const k of componentKeys) visited.add(k);

        const deg1 = componentKeys.filter((k) => (adjacency.get(k) ?? []).length === 1).sort();
        const chosenStart = deg1[0] ?? componentKeys[0];
        if (!chosenStart) continue;

        const orderedKeys = [];
        let prev = null;
        let curr = chosenStart;
        const guardMax = Math.max(8, componentKeys.length + 4);
        let guard = 0;
        while (curr && guard++ < guardMax) {
            orderedKeys.push(curr);
            const neighbors = adjacency.get(curr) ?? [];
            let next = null;
            for (const n of neighbors) {
                if (n !== prev) {
                    next = n;
                    break;
                }
            }
            if (!next || next === chosenStart) {
                if (next === chosenStart) orderedKeys.push(chosenStart);
                break;
            }
            prev = curr;
            curr = next;
        }

        const points = [];
        let prevKey = null;
        for (const k of orderedKeys) {
            const p = nodePosByKey.get(k);
            if (!p) continue;
            if (prevKey && points.length) {
                const curve = junctionCurveByEdge.get(`${prevKey}|${k}`) ?? null;
                const edgeTwoWay = twoWayByKey.get(prevKey) === true && twoWayByKey.get(k) === true;
                if (Array.isArray(curve) && curve.length >= 3) {
                    for (let i = 1; i < curve.length - 1; i++) {
                        const cp = curve[i];
                        points.push({ x: Number(cp?.x) || 0, z: Number(cp?.z) || 0, key: null, twoWay: edgeTwoWay });
                    }
                }
            }
            points.push({ x: Number(p.x) || 0, z: Number(p.z) || 0, key: k, twoWay: twoWayByKey.get(k) === true });
            prevKey = k;
        }
        if (points.length >= 2) polylines.push(points);
    }

    return polylines;
}

function computeCenterlineTrimForPolyline(polyline, { laneWidth, crosswalkEndKeys = new Set() } = {}) {
    const lw = Math.max(EPS, clampNumber(laneWidth, LANE_WIDTH_BASE));
    const points = Array.isArray(polyline) ? polyline : [];
    if (points.length < 2) return { startTrim: 0, endTrim: 0 };

    const firstLen = distXZ(points[0], points[1]);
    const lastLen = distXZ(points[points.length - 2], points[points.length - 1]);
    const baseStart = Math.min(lw * 0.3, firstLen * 0.18);
    const baseEnd = Math.min(lw * 0.3, lastLen * 0.18);
    const crosswalkTrim = lw * 0.88;

    const startKey = points[0]?.key ?? null;
    const endKey = points[points.length - 1]?.key ?? null;
    const startTrim = crosswalkEndKeys.has(startKey) ? Math.max(baseStart, crosswalkTrim) : baseStart;
    const endTrim = crosswalkEndKeys.has(endKey) ? Math.max(baseEnd, crosswalkTrim) : baseEnd;
    return { startTrim, endTrim };
}

function buildLaneDividerLineSegmentsFromSegments(segments, junctions, { laneWidth, markingY, crosswalkEndKeys = new Set() } = {}) {
    const segs = Array.isArray(segments) ? segments : [];
    const juncs = Array.isArray(junctions) ? junctions : [];
    const out = [];

    const baseLaneWidth = Math.max(EPS, clampNumber(laneWidth, LANE_WIDTH_BASE));
    const chord = Math.max(0.08, baseLaneWidth * 0.02);
    const dash = baseLaneWidth * 0.7;
    const gap = baseLaneWidth * 0.35;
    const y = clampNumber(markingY, 0);

    const nodePosByKey = new Map();
    const pieceInfoById = new Map();
    const adjacency = new Map();
    const junctionCurveByEdge = new Map();

    const addNeighbor = (a, b) => {
        if (!adjacency.has(a)) adjacency.set(a, []);
        const list = adjacency.get(a);
        if (!list.includes(b)) list.push(b);
    };

    const offsetPoint = (world, right, offset) => ({
        x: (Number(world?.x) || 0) + (Number(right?.x) || 0) * offset,
        z: (Number(world?.z) || 0) + (Number(right?.z) || 0) * offset
    });

    const appendUnique = (list, p, tol = 1e-6) => {
        const x = Number(p?.x) || 0;
        const z = Number(p?.z) || 0;
        const last = list[list.length - 1] ?? null;
        if (last && distSq(last, { x, z }) <= tol * tol) return;
        list.push({ x, z });
    };

    const dotXZ = (a, b) => (Number(a?.x) || 0) * (Number(b?.x) || 0) + (Number(a?.z) || 0) * (Number(b?.z) || 0);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const normalizeVecXZ = (v) => {
        const x = Number(v?.x) || 0;
        const z = Number(v?.z) || 0;
        const len = Math.hypot(x, z);
        if (!(len > EPS)) return null;
        const inv = 1 / len;
        return { x: x * inv, z: z * inv };
    };

    const buildDegree2Curve = (aEndpoint, bEndpoint, aKey, bKey, centerHint) => {
        const aPos = nodePosByKey.get(aKey) ?? null;
        const bPos = nodePosByKey.get(bKey) ?? null;
        if (!aPos || !bPos) return null;

        const dist = distXZ(aPos, bPos);
        if (!(dist > 1e-6)) return null;

        const p0 = { x: Number(aPos.x) || 0, z: Number(aPos.z) || 0 };
        const p1 = { x: Number(bPos.x) || 0, z: Number(bPos.z) || 0 };

        const aIn = normalizeVecXZ({ x: -(Number(aEndpoint?.dirOut?.x) || 0), z: -(Number(aEndpoint?.dirOut?.z) || 0) });
        const bIn = normalizeVecXZ({ x: -(Number(bEndpoint?.dirOut?.x) || 0), z: -(Number(bEndpoint?.dirOut?.z) || 0) });
        const fallback0 = normalizeVecXZ({ x: p1.x - p0.x, z: p1.z - p0.z });
        const fallback1 = normalizeVecXZ({ x: p0.x - p1.x, z: p0.z - p1.z });
        const dir0 = aIn ?? fallback0;
        const dir1 = bIn ?? fallback1;
        if (!dir0 || !dir1) return [p0, p1];

        const alignment = clamp(dotXZ(dir0, dir1), -1, 1);
        const angle = Math.acos(alignment);
        if (!(angle > 0.12)) return [p0, p1];

        const hit = lineIntersectionXZ(p0, dir0, p1, dir1);
        const t0 = Number(hit?.t) || 0;
        const t1 = Number(hit?.u) || 0;
        const d = (t0 > 1e-6 && t1 > 1e-6)
            ? (Math.abs(t0 - t1) <= 1e-4 ? (t0 + t1) * 0.5 : Math.min(t0, t1))
            : 0;
        const radius = (d > 1e-6 && angle > 1e-6 && angle < Math.PI - 1e-6)
            ? d * Math.tan(angle * 0.5)
            : 0;
        if (!(radius > 1e-6)) return [p0, p1];

        const n0 = rightNormalXZ(dir0);
        const n1 = rightNormalXZ(dir1);
        const options0 = [n0, { x: -n0.x, z: -n0.z }];
        const options1 = [n1, { x: -n1.x, z: -n1.z }];

        let best = null;
        let bestErr = Infinity;
        let bestCenterScore = Infinity;
        for (const out0 of options0) {
            for (const out1 of options1) {
                const candidate = computeEdgeFilletArcXZ({ p0, dir0, out0, p1, dir1, out1, radius });
                if (!candidate?.center || !candidate?.tangent0 || !candidate?.tangent1) continue;
                const err = distXZ(candidate.tangent0, p0) + distXZ(candidate.tangent1, p1);
                const hint = centerHint ?? null;
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

        if (!best?.center) return [p0, p1];

        const span = Number(best.spanAng) || 0;
        const arcRadius = Number(best.radius) || 0;
        if (!(span > 1e-6) || !(arcRadius > 1e-6)) return [p0, p1];

        const arcLen = Math.abs(span) * arcRadius;
        const segments = clampInt(Math.ceil(arcLen / chord), 6, 96);
        const arcPoints = sampleArcXZ({
            center: best.center,
            radius: arcRadius,
            startAng: Number(best.startAng) || 0,
            spanAng: span,
            ccw: best.ccw !== false,
            segments
        });

        const points = [];
        appendUnique(points, p0);
        if (best.tangent0) appendUnique(points, best.tangent0);
        for (const p of arcPoints) appendUnique(points, p);
        if (best.tangent1) appendUnique(points, best.tangent1);
        appendUnique(points, p1);
        return points.length >= 2 ? points : [p0, p1];
    };

    const nodeKey = (pieceId, end, dividerId) => `${pieceId}|${end}|${dividerId}`;
    const baseKeyFromNodeKey = (key) => {
        const parts = String(key ?? '').split('|');
        if (parts.length < 3) return null;
        return `${parts[0]}|${parts[1]}`;
    };

    for (const seg of segs) {
        const right = seg?.right ?? null;
        const lanesF = clampInt(seg?.lanesF ?? 0, 0, 99);
        const lanesB = clampInt(seg?.lanesB ?? 0, 0, 99);
        const pieces = Array.isArray(seg?.keptPieces) ? seg.keptPieces : [];
        if (!right || !pieces.length) continue;

        for (const piece of pieces) {
            const pid = piece?.id ?? null;
            const aWorld = piece?.aWorld ?? null;
            const bWorld = piece?.bWorld ?? null;
            if (!pid || !aWorld || !bWorld) continue;
            pieceInfoById.set(pid, { seg });

            for (let i = 1; i < lanesF; i++) {
                const dividerId = `F${i}`;
                const offset = i * baseLaneWidth;
                const a = nodeKey(pid, 'a', dividerId);
                const b = nodeKey(pid, 'b', dividerId);
                nodePosByKey.set(a, offsetPoint(aWorld, right, offset));
                nodePosByKey.set(b, offsetPoint(bWorld, right, offset));
                addNeighbor(a, b);
                addNeighbor(b, a);
            }

            for (let i = 1; i < lanesB; i++) {
                const dividerId = `B${i}`;
                const offset = -i * baseLaneWidth;
                const a = nodeKey(pid, 'a', dividerId);
                const b = nodeKey(pid, 'b', dividerId);
                nodePosByKey.set(a, offsetPoint(aWorld, right, offset));
                nodePosByKey.set(b, offsetPoint(bWorld, right, offset));
                addNeighbor(a, b);
                addNeighbor(b, a);
            }
        }
    }

    for (const junction of juncs) {
        const endpoints = Array.isArray(junction?.endpoints) ? junction.endpoints : [];
        if (endpoints.length !== 2) continue;
        const aEndpoint = endpoints[0] ?? null;
        const bEndpoint = endpoints[1] ?? null;
        const aPid = aEndpoint?.pieceId ?? null;
        const bPid = bEndpoint?.pieceId ?? null;
        const aEnd = aEndpoint?.end ?? null;
        const bEnd = bEndpoint?.end ?? null;
        if (!aPid || !bPid || (aEnd !== 'a' && aEnd !== 'b') || (bEnd !== 'a' && bEnd !== 'b')) continue;

        const segA = pieceInfoById.get(aPid)?.seg ?? null;
        const segB = pieceInfoById.get(bPid)?.seg ?? null;
        if (!segA || !segB) continue;

        const lanesFA = clampInt(segA?.lanesF ?? 0, 0, 99);
        const lanesBA = clampInt(segA?.lanesB ?? 0, 0, 99);
        const lanesFB = clampInt(segB?.lanesF ?? 0, 0, 99);
        const lanesBB = clampInt(segB?.lanesB ?? 0, 0, 99);

        const swapped = aEnd === bEnd;

        const addJunctionEdge = (aDivider, bDivider, count) => {
            for (let i = 1; i < count; i++) {
                const aKey = nodeKey(aPid, aEnd, `${aDivider}${i}`);
                const bKey = nodeKey(bPid, bEnd, `${bDivider}${i}`);
                if (!nodePosByKey.has(aKey) || !nodePosByKey.has(bKey)) continue;
                const curve = buildDegree2Curve(aEndpoint, bEndpoint, aKey, bKey, junction?.center ?? null);
                if (Array.isArray(curve) && curve.length >= 2) {
                    const normalized = curve.map((p) => ({ x: Number(p?.x) || 0, z: Number(p?.z) || 0 }));
                    junctionCurveByEdge.set(`${aKey}|${bKey}`, normalized);
                    junctionCurveByEdge.set(`${bKey}|${aKey}`, normalized.slice().reverse());
                }
                addNeighbor(aKey, bKey);
                addNeighbor(bKey, aKey);
            }
        };

        if (!swapped) {
            addJunctionEdge('F', 'F', Math.min(lanesFA, lanesFB));
            addJunctionEdge('B', 'B', Math.min(lanesBA, lanesBB));
        } else {
            addJunctionEdge('F', 'B', Math.min(lanesFA, lanesBB));
            addJunctionEdge('B', 'F', Math.min(lanesBA, lanesFB));
        }
    }

    const keys = Array.from(nodePosByKey.keys()).sort();
    const visited = new Set();

    for (const startKey of keys) {
        if (visited.has(startKey)) continue;

        const stack = [startKey];
        const component = new Set();
        while (stack.length) {
            const k = stack.pop();
            if (component.has(k)) continue;
            component.add(k);
            const neighbors = adjacency.get(k) ?? [];
            for (const n of neighbors) {
                if (component.has(n)) continue;
                stack.push(n);
            }
        }

        const componentKeys = Array.from(component).sort();
        for (const k of componentKeys) visited.add(k);

        const deg1 = componentKeys.filter((k) => (adjacency.get(k) ?? []).length === 1).sort();
        const chosenStart = deg1[0] ?? componentKeys[0];
        if (!chosenStart) continue;

        const orderedKeys = [];
        let prev = null;
        let curr = chosenStart;
        const guardMax = Math.max(8, componentKeys.length + 4);
        let guard = 0;
        while (curr && guard++ < guardMax) {
            orderedKeys.push(curr);
            const neighbors = adjacency.get(curr) ?? [];
            let next = null;
            for (const n of neighbors) {
                if (n !== prev) {
                    next = n;
                    break;
                }
            }
            if (!next || next === chosenStart) {
                if (next === chosenStart) orderedKeys.push(chosenStart);
                break;
            }
            prev = curr;
            curr = next;
        }

        const points = [];
        let prevKey = null;
        for (const k of orderedKeys) {
            const p = nodePosByKey.get(k) ?? null;
            if (!p) continue;
            if (prevKey && points.length) {
                const curve = junctionCurveByEdge.get(`${prevKey}|${k}`) ?? null;
                if (Array.isArray(curve) && curve.length >= 3) {
                    for (let i = 1; i < curve.length - 1; i++) {
                        const cp = curve[i];
                        points.push({ x: Number(cp?.x) || 0, z: Number(cp?.z) || 0, key: null });
                    }
                }
            }
            points.push({ x: Number(p.x) || 0, z: Number(p.z) || 0, key: baseKeyFromNodeKey(k) });
            prevKey = k;
        }

        if (points.length < 2) continue;
        const trim = computeCenterlineTrimForPolyline(points, { laneWidth: baseLaneWidth, crosswalkEndKeys });
        appendDashedPolylineSegments(out, points, { startTrim: trim.startTrim, endTrim: trim.endTrim, dash, gap, y });
    }

    return out;
}

function buildArrowMeshesFromSegments(segments, { laneWidth, arrowY, arrowTangentY, includeArrowTangents = false } = {}) {
    const arrowPositions = [];
    const tangentSegments = [];
    const segs = Array.isArray(segments) ? segments : [];

    const y = clampNumber(arrowY, 0);
    const tangentY = clampNumber(arrowTangentY, y);

    for (const seg of segs) {
        const dir = seg?.dir ?? null;
        const right = seg?.right ?? null;
        const lw = Math.max(EPS, clampNumber(seg?.laneWidth, clampNumber(laneWidth, LANE_WIDTH_BASE)));
        const lanesF = clampInt(seg?.lanesF ?? 0, 0, 99);
        const lanesB = clampInt(seg?.lanesB ?? 0, 0, 99);
        const pieces = Array.isArray(seg?.keptPieces) ? seg.keptPieces : [];
        if (!dir || !right || !pieces.length) continue;

        for (const piece of pieces) {
            const a = piece?.aWorld ?? null;
            const len = Number(piece?.length) || 0;
            if (!a || !(len > EPS)) continue;

            const baseArrowLen = lw * 0.85;
            const maxArrowLen = len * 0.65;
            const arrowLen = Math.min(baseArrowLen, maxArrowLen);
            if (!(arrowLen > lw * 0.25)) continue;

            const scale = arrowLen / baseArrowLen;
            const headLen = arrowLen * 0.35;
            const bodyHalf = lw * 0.10 * scale;
            const headHalf = lw * 0.22 * scale;
            const tailX = -arrowLen * 0.5;
            const bodyX = arrowLen * 0.5 - headLen;
            const tipX = arrowLen * 0.5;

            const midX = (Number(a.x) || 0) + (Number(dir.x) || 0) * (len * 0.5);
            const midZ = (Number(a.z) || 0) + (Number(dir.z) || 0) * (len * 0.5);

            const laneOffsets = [];
            for (let i = 0; i < lanesF; i++) laneOffsets.push({ offset: (i + 0.5) * lw, dirX: dir.x, dirZ: dir.z });
            for (let i = 0; i < lanesB; i++) laneOffsets.push({ offset: -(i + 0.5) * lw, dirX: -dir.x, dirZ: -dir.z });

            for (const lane of laneOffsets) {
                const cx = midX + (Number(right.x) || 0) * lane.offset;
                const cz = midZ + (Number(right.z) || 0) * lane.offset;
                const fx = Number(lane.dirX) || 0;
                const fz = Number(lane.dirZ) || 0;
                const rx = fz;
                const rz = -fx;

                if (includeArrowTangents) {
                    const tangentLen = arrowLen * 0.75;
                    tangentSegments.push(
                        cx, tangentY, cz,
                        cx + fx * tangentLen, tangentY, cz + fz * tangentLen
                    );
                }

	                const local = [
	                    [tailX, bodyHalf], [bodyX, -bodyHalf], [bodyX, bodyHalf],
	                    [tailX, bodyHalf], [tailX, -bodyHalf], [bodyX, -bodyHalf],
	                    [tipX, 0], [bodyX, headHalf], [bodyX, -headHalf]
	                ];

                for (const v of local) {
                    const lx = v[0];
                    const lz = v[1];
                    const wx = cx + fx * lx + rx * lz;
                    const wz = cz + fz * lx + rz * lz;
                    arrowPositions.push(wx, y, wz);
                }
            }
        }
    }

    return { arrowPositions, arrowTangentSegments: tangentSegments };
}

export function buildRoadMarkingsMeshDataFromRoadEngineDerived(derived, options = {}) {
    const laneWidth = clampNumber(options?.laneWidth, LANE_WIDTH_BASE);
    const markingY = clampNumber(options?.markingY, 0);
    const arrowY = clampNumber(options?.arrowY, markingY);
    const arrowTangentY = clampNumber(options?.arrowTangentY, arrowY);
    const crosswalkY = clampNumber(options?.crosswalkY, markingY);
    const boundaryEpsilon = clampNumber(options?.boundaryEpsilon, 1e-4);
    const includeArrowTangents = options?.includeArrowTangents === true;

    const segments = Array.isArray(derived?.segments) ? derived.segments : [];
    const junctions = Array.isArray(derived?.junctions) ? derived.junctions : [];
    const primitives = Array.isArray(derived?.primitives) ? derived.primitives : [];

    const crosswalkEndKeys = new Set();
    for (const junction of junctions) {
        const endpoints = Array.isArray(junction?.endpoints) ? junction.endpoints : [];
        if (endpoints.length < 3) continue;
        for (const ep of endpoints) {
            if (!ep?.pieceId || !ep?.end) continue;
            crosswalkEndKeys.add(`${ep.pieceId}|${ep.end}`);
        }
    }

    const whiteLineSegments = [];
    const yellowLineSegments = [];

    const edgeSegments = buildEdgeLineSegmentsFromPrimitives(primitives, { laneWidth, markingY, boundaryEpsilon });
    whiteLineSegments.push(...edgeSegments);

    const centerlinePolylines = buildCenterlinePolylinesFromDerived(segments, junctions, { laneWidth });
    for (const poly of centerlinePolylines) {
        const points = poly.map((p) => ({ x: p.x, z: p.z }));
        const trim = computeCenterlineTrimForPolyline(poly, { laneWidth, crosswalkEndKeys });
        appendSolidPolylineSegments(yellowLineSegments, points, {
            startTrim: trim.startTrim,
            endTrim: trim.endTrim,
            y: markingY,
            includeSegment: (index) => poly[index]?.twoWay === true && poly[index + 1]?.twoWay === true
        });
    }

    const dividerSegments = buildLaneDividerLineSegmentsFromSegments(segments, junctions, { laneWidth, markingY, crosswalkEndKeys });
    whiteLineSegments.push(...dividerSegments);

    const crosswalkPositions = buildCrosswalkTrianglesFromJunctions(junctions, { laneWidth, crosswalkY });

    const arrows = buildArrowMeshesFromSegments(segments, {
        laneWidth,
        arrowY,
        arrowTangentY,
        includeArrowTangents
    });

    return {
        whiteLineSegments: new Float32Array(whiteLineSegments),
        yellowLineSegments: new Float32Array(yellowLineSegments),
        arrowPositions: new Float32Array(arrows.arrowPositions),
        arrowTangentSegments: new Float32Array(arrows.arrowTangentSegments),
        crosswalkPositions: new Float32Array(crosswalkPositions)
    };
}
