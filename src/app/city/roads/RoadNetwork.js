// src/app/city/roads/RoadNetwork.js
// Defines the road topology graph (nodes + centerline edges) built from city specs.
// Design: edges represent physical road segments with `lanesF`/`lanesB` metadata so geometry and intersections operate on a single centerline; directed travel graphs can be derived when needed.

const EPS = 1e-9;
const WORLD_NODE_QUANT = 1000;
const NODE_SNAP_EPS = 1e-4;
const SEGMENT_INTERSECT_EPS = 1e-9;

function isFiniteNumber(v) {
    return Number.isFinite(v);
}

function clampInt(v, lo, hi) {
    return Math.max(lo, Math.min(hi, Number(v) | 0));
}

function safeString(v, fallback) {
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? s : fallback;
}

function tileId(x, y) {
    return `t:${x | 0},${y | 0}`;
}

function tileToWorldXZ(x, y, origin, tileSize) {
    return {
        x: origin.x + (x | 0) * tileSize,
        z: origin.z + (y | 0) * tileSize
    };
}

function quantize(value) {
    return Math.round(value * WORLD_NODE_QUANT);
}

function unquantize(value) {
    return value / WORLD_NODE_QUANT;
}

function worldId(x, z) {
    return `w:${quantize(x)},${quantize(z)}`;
}

function worldToTile(x, z, origin, tileSize) {
    const tx = (x - origin.x) / tileSize;
    const ty = (z - origin.z) / tileSize;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    const ix = Math.round(tx);
    const iy = Math.round(ty);
    const sx = origin.x + ix * tileSize;
    const sz = origin.z + iy * tileSize;
    const dx = x - sx;
    const dz = z - sz;
    if (Math.hypot(dx, dz) > NODE_SNAP_EPS) return null;
    return { x: ix, y: iy, world: { x: sx, z: sz } };
}

function normalizeDirXZ(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: dx * inv, z: dz * inv, length: len };
}

function cross2(a, b) {
    return a.x * b.z - a.z * b.x;
}

function segmentIntersection(a0, a1, b0, b1) {
    if (!a0 || !a1 || !b0 || !b1) return null;
    const r = { x: a1.x - a0.x, z: a1.z - a0.z };
    const s = { x: b1.x - b0.x, z: b1.z - b0.z };
    const denom = cross2(r, s);
    if (Math.abs(denom) <= SEGMENT_INTERSECT_EPS) return null;
    const qp = { x: b0.x - a0.x, z: b0.z - a0.z };
    const t = cross2(qp, s) / denom;
    const u = cross2(qp, r) / denom;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    const tt = Math.max(0, Math.min(1, t));
    const uu = Math.max(0, Math.min(1, u));
    return {
        x: a0.x + r.x * tt,
        z: a0.z + r.z * tt,
        t: tt,
        u: uu
    };
}

function dedupeSortedPoints(points, { tEps = 1e-8, distEps = 1e-6 } = {}) {
    const out = [];
    for (const p of points) {
        const last = out[out.length - 1] ?? null;
        if (!last) {
            out.push(p);
            continue;
        }
        if (Math.abs((p.t ?? 0) - (last.t ?? 0)) <= tEps) continue;
        const dx = p.x - last.x;
        const dz = p.z - last.z;
        if (Math.hypot(dx, dz) <= distEps) continue;
        out.push(p);
    }
    return out;
}

export class RoadNetwork {
    constructor({ origin, tileSize, seed = null } = {}) {
        this.origin = origin && isFiniteNumber(origin.x) && isFiniteNumber(origin.z) ? { x: origin.x, z: origin.z } : { x: 0, z: 0 };
        this.tileSize = isFiniteNumber(tileSize) ? tileSize : 1;
        this.seed = seed === null || seed === undefined ? null : String(seed);

        this.nodes = new Map();
        this.edges = new Map();
        this.nodeIds = [];
        this.edgeIds = [];
    }

    getNode(id) {
        return this.nodes.get(id) ?? null;
    }

    getEdge(id) {
        return this.edges.get(id) ?? null;
    }

    getEdges() {
        return this.edgeIds.map((id) => this.edges.get(id)).filter(Boolean);
    }

    getNodes() {
        return this.nodeIds.map((id) => this.nodes.get(id)).filter(Boolean);
    }
}

function asWorldPoint(p) {
    if (!p) return null;
    if (Array.isArray(p) && p.length >= 2) {
        const x = p[0];
        const z = p[1];
        if (!isFiniteNumber(x) || !isFiniteNumber(z)) return null;
        return { x, z };
    }
    const x = p.x;
    const z = isFiniteNumber(p.z) ? p.z : p.y;
    if (!isFiniteNumber(x) || !isFiniteNumber(z)) return null;
    return { x, z };
}

export function createRoadNetworkFromWorldSegments(segments, { origin, tileSize, seed = null } = {}) {
    const network = new RoadNetwork({ origin, tileSize, seed });
    const tilesize = network.tileSize;
    const org = network.origin;

    const list = Array.isArray(segments) ? segments : [];

    const baseSegments = [];
    for (let i = 0; i < list.length; i++) {
        const seg = list[i];
        const a = asWorldPoint(seg?.a ?? null);
        const b = asWorldPoint(seg?.b ?? null);
        if (!a || !b) continue;
        if (!normalizeDirXZ(a, b)) continue;

        const lanesF = clampInt(seg?.lanesF ?? seg?.lanesForward, 0, 99);
        const lanesB = clampInt(seg?.lanesB ?? seg?.lanesBackward, 0, 99);
        const tag = safeString(seg?.tag, 'road');
        const rendered = seg?.rendered !== false;
        const sourceId = (seg?.sourceId !== null && seg?.sourceId !== undefined)
            ? seg.sourceId
            : ((seg?.id !== null && seg?.id !== undefined) ? seg.id : i);

        baseSegments.push({
            sourceId,
            tag,
            rendered,
            lanesF,
            lanesB,
            aWorld: a,
            bWorld: b
        });
    }

    const splitPointsBySeg = new Map();
    for (const seg of baseSegments) {
        splitPointsBySeg.set(seg.sourceId, [
            { t: 0, x: seg.aWorld.x, z: seg.aWorld.z },
            { t: 1, x: seg.bWorld.x, z: seg.bWorld.z }
        ]);
    }

    for (let i = 0; i < baseSegments.length; i++) {
        const a = baseSegments[i];
        for (let j = i + 1; j < baseSegments.length; j++) {
            const b = baseSegments[j];
            const hit = segmentIntersection(a.aWorld, a.bWorld, b.aWorld, b.bWorld);
            if (!hit) continue;
            splitPointsBySeg.get(a.sourceId)?.push({ t: hit.t, x: hit.x, z: hit.z });
            splitPointsBySeg.get(b.sourceId)?.push({ t: hit.u, x: hit.x, z: hit.z });
        }
    }

    const ensureNode = (p) => {
        const snapped = worldToTile(p.x, p.z, org, tilesize);
        const id = snapped ? tileId(snapped.x, snapped.y) : worldId(p.x, p.z);
        let node = network.nodes.get(id);
        if (node) return node;
        const position = snapped ? snapped.world : { x: unquantize(quantize(p.x)), z: unquantize(quantize(p.z)) };
        node = {
            id,
            tile: snapped ? { x: snapped.x, y: snapped.y } : null,
            position,
            edgeIds: []
        };
        network.nodes.set(id, node);
        network.nodeIds.push(id);
        return node;
    };

    for (const seg of baseSegments) {
        const pointsRaw = splitPointsBySeg.get(seg.sourceId) ?? [];
        const pointsSorted = pointsRaw.slice().sort((p, q) => (p.t ?? 0) - (q.t ?? 0));
        const points = dedupeSortedPoints(pointsSorted);

        let piece = 0;
        for (let k = 0; k + 1 < points.length; k++) {
            const p0 = points[k];
            const p1 = points[k + 1];
            const dx = p1.x - p0.x;
            const dz = p1.z - p0.z;
            const len = Math.hypot(dx, dz);
            if (!(len > EPS)) continue;

            const nodeA = ensureNode(p0);
            const nodeB = ensureNode(p1);
            if (nodeA.id === nodeB.id) continue;

            const edgeId = `e:${seg.sourceId}:${piece}`;
            piece += 1;

            const dir = normalizeDirXZ(nodeA.position, nodeB.position);
            if (!dir) continue;

            const edge = {
                id: edgeId,
                sourceId: seg.sourceId,
                a: nodeA.id,
                b: nodeB.id,
                tag: seg.tag,
                rendered: seg.rendered,
                lanesF: seg.lanesF,
                lanesB: seg.lanesB,
                centerline: {
                    a: { x: nodeA.position.x, z: nodeA.position.z },
                    b: { x: nodeB.position.x, z: nodeB.position.z }
                },
                dir: { x: dir.x, z: dir.z },
                length: dir.length
            };

            network.edges.set(edgeId, edge);
            network.edgeIds.push(edgeId);
            nodeA.edgeIds.push(edgeId);
            nodeB.edgeIds.push(edgeId);
        }
    }

    return network;
}

export function createRoadNetworkFromSegments(segments, { origin, tileSize, seed = null } = {}) {
    const list = Array.isArray(segments) ? segments : [];
    const org = origin && isFiniteNumber(origin.x) && isFiniteNumber(origin.z) ? origin : { x: 0, z: 0 };
    const ts = isFiniteNumber(tileSize) ? tileSize : 1;

    const worldSegments = [];
    for (let i = 0; i < list.length; i++) {
        const seg = list[i];
        const a = seg?.a ?? null;
        const b = seg?.b ?? null;
        const ax = a?.x;
        const ay = a?.y;
        const bx = b?.x;
        const by = b?.y;
        if (!isFiniteNumber(ax) || !isFiniteNumber(ay) || !isFiniteNumber(bx) || !isFiniteNumber(by)) continue;
        const sourceId = (seg?.id !== null && seg?.id !== undefined) ? seg.id : i;
        worldSegments.push({
            sourceId,
            tag: seg?.tag,
            rendered: seg?.rendered,
            lanesF: seg?.lanesF ?? seg?.lanesForward,
            lanesB: seg?.lanesB ?? seg?.lanesBackward,
            a: tileToWorldXZ(ax, ay, org, ts),
            b: tileToWorldXZ(bx, by, org, ts)
        });
    }

    return createRoadNetworkFromWorldSegments(worldSegments, { origin, tileSize, seed });
}
