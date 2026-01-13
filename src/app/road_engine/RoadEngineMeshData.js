// src/app/road_engine/RoadEngineMeshData.js
// Triangulation helpers that turn computed road polygons into renderer-agnostic mesh data.
// Design: Ear-clipping triangulation keeps results deterministic without Three.js dependencies.

const EPS = 1e-9;

function cross2(a, b, c) {
    const abx = (b?.x ?? 0) - (a?.x ?? 0);
    const abz = (b?.z ?? 0) - (a?.z ?? 0);
    const acx = (c?.x ?? 0) - (a?.x ?? 0);
    const acz = (c?.z ?? 0) - (a?.z ?? 0);
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
        sum += (a?.x ?? 0) * (b?.z ?? 0) - (b?.x ?? 0) * (a?.z ?? 0);
    }
    return sum * 0.5;
}

function ensureCcw(points) {
    const pts = Array.isArray(points) ? points : [];
    if (pts.length < 3) return pts.slice();
    if (polygonArea(pts) >= 0) return pts.slice();
    return pts.slice().reverse();
}

function isNear(a, b, eps) {
    return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.z ?? 0) - (b?.z ?? 0)) <= eps;
}

function cleanPolygon(points, eps) {
    const pts = Array.isArray(points) ? points : [];
    if (!pts.length) return [];

    const cleaned = [];
    for (const p of pts) {
        const next = { x: Number(p?.x) || 0, z: Number(p?.z) || 0 };
        const last = cleaned[cleaned.length - 1] ?? null;
        if (last && isNear(last, next, eps)) continue;
        cleaned.push(next);
    }

    if (cleaned.length >= 2 && isNear(cleaned[0], cleaned[cleaned.length - 1], eps)) cleaned.pop();

    let loop = ensureCcw(cleaned);
    let changed = true;
    while (changed && loop.length >= 3) {
        changed = false;
        const out = [];
        for (let i = 0; i < loop.length; i++) {
            const prev = loop[(i - 1 + loop.length) % loop.length];
            const curr = loop[i];
            const next = loop[(i + 1) % loop.length];
            const area2 = cross2(prev, curr, next);
            if (Math.abs(area2) <= eps) {
                changed = true;
                continue;
            }
            out.push(curr);
        }
        loop = out;
        if (loop.length >= 2 && isNear(loop[0], loop[loop.length - 1], eps)) {
            loop.pop();
            changed = true;
        }
        if (loop.length < 3) break;
    }

    return loop.length >= 3 ? loop : [];
}

function pointInTriangle(p, a, b, c, eps) {
    const pab = cross2(a, b, p);
    const pbc = cross2(b, c, p);
    const pca = cross2(c, a, p);
    const hasNeg = (pab < -eps) || (pbc < -eps) || (pca < -eps);
    const hasPos = (pab > eps) || (pbc > eps) || (pca > eps);
    return !(hasNeg && hasPos);
}

function triangulateEarClip(vertices, eps) {
    const n = vertices.length;
    if (n < 3) return [];
    if (n === 3) return [0, 1, 2];

    const v = [];
    for (let i = 0; i < n; i++) v.push(i);
    const indices = [];

    const isConvex = (ia, ib, ic) => cross2(vertices[ia], vertices[ib], vertices[ic]) > eps;

    let guard = 0;
    while (v.length > 3 && guard++ < n * n) {
        let clipped = false;
        for (let i = 0; i < v.length; i++) {
            const i0 = v[(i - 1 + v.length) % v.length];
            const i1 = v[i];
            const i2 = v[(i + 1) % v.length];
            if (!isConvex(i0, i1, i2)) continue;

            const a = vertices[i0];
            const b = vertices[i1];
            const c = vertices[i2];

            let contains = false;
            for (let j = 0; j < v.length; j++) {
                const idx = v[j];
                if (idx === i0 || idx === i1 || idx === i2) continue;
                if (pointInTriangle(vertices[idx], a, b, c, eps)) {
                    contains = true;
                    break;
                }
            }
            if (contains) continue;

            indices.push(i0, i1, i2);
            v.splice(i, 1);
            clipped = true;
            break;
        }
        if (!clipped) break;
    }

    if (v.length === 3) {
        indices.push(v[0], v[1], v[2]);
        return indices;
    }

    const fallback = [];
    for (let i = 1; i + 1 < n; i++) fallback.push(0, i, i + 1);
    return fallback;
}

export function triangulateSimplePolygonXZ(points, { epsilon = 1e-6 } = {}) {
    const eps = Number.isFinite(Number(epsilon)) ? Number(epsilon) : 1e-6;
    const vertices = cleanPolygon(points, Math.max(EPS, eps));
    if (vertices.length < 3) return { vertices, indices: [] };
    return { vertices, indices: triangulateEarClip(vertices, Math.max(EPS, eps)) };
}

export function buildRoadEnginePolygonMeshData(primitives, { epsilon = 1e-6 } = {}) {
    const prims = Array.isArray(primitives) ? primitives : [];
    const out = [];
    for (const prim of prims) {
        if (!prim || prim.type !== 'polygon') continue;
        const points = Array.isArray(prim.points) ? prim.points : [];
        const { vertices, indices } = triangulateSimplePolygonXZ(points, { epsilon });
        out.push({
            id: prim.id ?? null,
            kind: prim.kind ?? 'polygon',
            roadId: prim.roadId ?? null,
            segmentId: prim.segmentId ?? null,
            junctionId: prim.junctionId ?? null,
            connectorId: prim.connectorId ?? null,
            vertices,
            indices
        });
    }
    return out;
}

