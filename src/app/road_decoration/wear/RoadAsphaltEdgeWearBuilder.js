// src/app/road_decoration/wear/RoadAsphaltEdgeWearBuilder.js
// Builds an inward strip mesh along the asphalt boundary for curb-adjacent grime/wear overlays.

const EPS = 1e-9;

function clampNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
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

function dist(a, b) {
    return Math.sqrt(distSq(a, b));
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

function normalizeDirXZ(a, b) {
    const dx = (Number(b?.x) || 0) - (Number(a?.x) || 0);
    const dz = (Number(b?.z) || 0) - (Number(a?.z) || 0);
    const len = Math.hypot(dx, dz);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: dx * inv, z: dz * inv, length: len };
}

function rightNormalXZ(dir) {
    return { x: Number(dir?.z) || 0, z: -(Number(dir?.x) || 0) };
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

    return out;
}

function pushTri(positions, a, b, c) {
    positions.push(
        Number(a?.x) || 0, Number(a?.y) || 0, Number(a?.z) || 0,
        Number(b?.x) || 0, Number(b?.y) || 0, Number(b?.z) || 0,
        Number(c?.x) || 0, Number(c?.y) || 0, Number(c?.z) || 0
    );
}

function pushUv(uvs, u, v) {
    uvs.push(Number(u) || 0, Number(v) || 0);
}

function pushTriWithUvs(positions, uvs, a, b, c, ua, ub, uc) {
    pushTri(positions, a, b, c);
    pushUv(uvs, ua.x, ua.y);
    pushUv(uvs, ub.x, ub.y);
    pushUv(uvs, uc.x, uc.y);
}

function pushQuadWithUvs(positions, uvs, a, b, c, d, uva, uvb, uvc, uvd) {
    pushTriWithUvs(positions, uvs, a, b, c, uva, uvb, uvc);
    pushTriWithUvs(positions, uvs, a, c, d, uva, uvc, uvd);
}

export function buildRoadAsphaltEdgeWearMeshDataFromRoadEnginePrimitives(primitives, {
    surfaceY = 0,
    lift = 0.0008,
    maxWidth = 1.25,
    boundaryEpsilon = 1e-4,
    miterLimit = 4
} = {}) {
    const prims = Array.isArray(primitives) ? primitives : [];
    const polygons = [];
    for (const prim of prims) {
        if (!prim || prim.type !== 'polygon') continue;
        const kind = prim.kind ?? null;
        if (kind !== 'asphalt_piece' && kind !== 'junction_surface') continue;
        const pts = Array.isArray(prim.points) ? prim.points : [];
        if (pts.length < 3) continue;
        polygons.push(pts);
    }

    const loops = buildBoundaryLoops(polygons, { epsilon: boundaryEpsilon });
    const y = clampNumber(surfaceY, 0) + Math.max(0, clampNumber(lift, 0));
    const width = Math.max(0, clampNumber(maxWidth, 1.25));
    if (!(width > EPS)) return { positions: new Float32Array(0), uvs: new Float32Array(0) };

    const positions = [];
    const uvs = [];

    for (const loop of loops) {
        const outer = normalizePointList(loop, { epsilon: boundaryEpsilon, forceCcw: true });
        if (outer.length < 3) continue;
        const inner = offsetLoop(outer, -width, { miterLimit, epsilon: boundaryEpsilon });
        if (inner.length !== outer.length) continue;

        const uByIndex = new Array(outer.length).fill(0);
        let acc = 0;
        for (let i = 1; i < outer.length; i++) {
            acc += dist(outer[i - 1], outer[i]);
            uByIndex[i] = acc;
        }
        const perimeter = acc + dist(outer[outer.length - 1], outer[0]);

        for (let i = 0; i < outer.length; i++) {
            const j = (i + 1) % outer.length;
            const oa = outer[i];
            const ob = outer[j];
            const ia = inner[i];
            const ib = inner[j];
            if (distSq(oa, ob) <= EPS) continue;

            const a = { x: oa.x, y, z: oa.z };
            const b = { x: ob.x, y, z: ob.z };
            const c = { x: ib.x, y, z: ib.z };
            const d = { x: ia.x, y, z: ia.z };

            const u0 = uByIndex[i];
            const u1 = j === 0 ? perimeter : uByIndex[j];

            pushQuadWithUvs(
                positions,
                uvs,
                a,
                b,
                c,
                d,
                { x: u0, y: 0 },
                { x: u1, y: 0 },
                { x: u1, y: 1 },
                { x: u0, y: 1 }
            );
        }
    }

    return {
        positions: new Float32Array(positions),
        uvs: new Float32Array(uvs)
    };
}
