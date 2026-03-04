// src/graphics/gui/mesh_fabrication/meshBooleanDeterministicQuadMerge.js
// Shared deterministic triangle-pair -> convex-quad helpers used by boolean regrouping stages.
import {
    crossVec3,
    dotVec3,
    isFiniteVec3,
    lengthVec3,
    normalizeVec3,
    subVec3
} from './math/vector3.js';
import { stableEdgeKey as stableEdgeKeyFromMath } from './math/quantization.js';

const EPSILON = 1e-7;

function lexCompareNumberArray(a, b) {
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i++) {
        if (a[i] === b[i]) continue;
        return a[i] - b[i];
    }
    return a.length - b.length;
}

function rotateCycleDeterministic(indices) {
    const ring = Array.isArray(indices) ? indices.map((value) => Number(value)) : [];
    if (ring.length < 3) return [];
    const candidates = [];
    for (let offset = 0; offset < ring.length; offset++) {
        const candidate = new Array(ring.length);
        for (let i = 0; i < ring.length; i++) {
            candidate[i] = ring[(offset + i) % ring.length];
        }
        candidates.push(candidate);
    }
    candidates.sort(lexCompareNumberArray);
    return candidates[0];
}

export function stableEdgeKey(a, b) {
    return stableEdgeKeyFromMath(a, b);
}

export function buildBoundaryLoopFromTriangleIndices(aTri, bTri) {
    if (!Array.isArray(aTri) || !Array.isArray(bTri) || aTri.length !== 3 || bTri.length !== 3) {
        return null;
    }

    const edgeUsage = new Map();
    const addEdge = (from, to) => {
        if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return;
        const key = stableEdgeKey(from, to);
        const usage = edgeUsage.get(key);
        if (usage) {
            usage.count += 1;
            return;
        }
        edgeUsage.set(key, { count: 1, a: from, b: to });
    };

    addEdge(aTri[0], aTri[1]);
    addEdge(aTri[1], aTri[2]);
    addEdge(aTri[2], aTri[0]);
    addEdge(bTri[0], bTri[1]);
    addEdge(bTri[1], bTri[2]);
    addEdge(bTri[2], bTri[0]);

    const boundaryEdges = [...edgeUsage.values()].filter((edge) => edge.count === 1);
    if (boundaryEdges.length !== 4) return null;

    const adjacency = new Map();
    for (const edge of boundaryEdges) {
        if (!adjacency.has(edge.a)) adjacency.set(edge.a, new Set());
        if (!adjacency.has(edge.b)) adjacency.set(edge.b, new Set());
        adjacency.get(edge.a).add(edge.b);
        adjacency.get(edge.b).add(edge.a);
    }
    if (adjacency.size !== 4) return null;
    for (const neighbors of adjacency.values()) {
        if (neighbors.size !== 2) return null;
    }

    const sortedVertices = [...adjacency.keys()].sort((a, b) => a - b);
    const start = sortedVertices[0];
    const startNeighbors = [...adjacency.get(start)].sort((a, b) => a - b);
    let prev = start;
    let current = startNeighbors[0];
    const loop = [start];
    let guard = 0;
    while (guard < 8) {
        guard += 1;
        loop.push(current);
        if (current === start) break;
        const neighbors = [...adjacency.get(current)].sort((a, b) => a - b);
        const next = neighbors.find((value) => value !== prev);
        if (!Number.isInteger(next)) return null;
        prev = current;
        current = next;
    }
    if (loop[loop.length - 1] !== start) return null;
    loop.pop();
    if (loop.length !== 4) return null;
    return loop;
}

export function orientLoopToReference(loopIndices, vertices, referenceNormal) {
    const loop = Array.isArray(loopIndices) ? [...loopIndices] : [];
    if (loop.length < 3) return [];
    const points = loop.map((index) => vertices[index]).filter((point) => isFiniteVec3(point));
    if (points.length !== loop.length) return [];
    const planeNormal = normalizeVec3(crossVec3(subVec3(points[1], points[0]), subVec3(points[2], points[0])));
    if (lengthVec3(planeNormal) <= EPSILON) return [];
    const refNormal = Array.isArray(referenceNormal) ? normalizeVec3(referenceNormal) : [0, 0, 0];
    if (dotVec3(planeNormal, refNormal) < 0) loop.reverse();
    return rotateCycleDeterministic(loop);
}

export function isConvexLoop(loopIndices, vertices) {
    if (!Array.isArray(loopIndices) || loopIndices.length < 4) return false;
    const points = loopIndices.map((index) => vertices[index]).filter((point) => isFiniteVec3(point));
    if (points.length !== loopIndices.length) return false;
    const normal = normalizeVec3(crossVec3(subVec3(points[1], points[0]), subVec3(points[2], points[0])));
    if (lengthVec3(normal) <= EPSILON) return false;
    let sign = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const c = points[(i + 2) % points.length];
        const turn = dotVec3(crossVec3(subVec3(b, a), subVec3(c, b)), normal);
        if (Math.abs(turn) <= EPSILON) return false;
        const currentSign = Math.sign(turn);
        if (sign === 0) sign = currentSign;
        else if (currentSign !== sign) return false;
    }
    return true;
}

export function buildDeterministicSharedEdgeConvexQuadLoop({
    triangleA,
    triangleB,
    vertices,
    referenceNormal
}) {
    if (!Array.isArray(triangleA) || !Array.isArray(triangleB) || triangleA.length !== 3 || triangleB.length !== 3) {
        return null;
    }
    const setA = new Set(triangleA);
    let shared = 0;
    for (const idx of triangleB) {
        if (setA.has(idx)) shared += 1;
    }
    if (shared !== 2) return null;

    const boundaryLoop = buildBoundaryLoopFromTriangleIndices(triangleA, triangleB);
    if (!boundaryLoop) return null;
    const orientedLoop = orientLoopToReference(boundaryLoop, vertices, referenceNormal);
    if (orientedLoop.length !== 4) return null;
    if (!isConvexLoop(orientedLoop, vertices)) return null;
    return orientedLoop;
}
