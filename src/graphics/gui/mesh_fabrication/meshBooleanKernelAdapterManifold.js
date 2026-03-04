// src/graphics/gui/mesh_fabrication/meshBooleanKernelAdapterManifold.js
// Adapter layer: canonical topology <-> manifold-3d boolean kernel.
import { ensureManifoldBooleanKernelReady } from './meshBooleanKernelManifold.js';
import {
    buildDeterministicSharedEdgeConvexQuadLoop,
    stableEdgeKey
} from './meshBooleanDeterministicQuadMerge.js';

const ADAPTER_VERSION = 'mesh-boolean-manifold-adapter.v1';
const EPSILON = 1e-7;
const KEY_DECIMALS = 6;
const UNKNOWN_FACE_INDEX = 0xffffffff;
const REGROUPING_STAGE_STAGE1_ADAPTER = 'stage1_adapter_regrouping';

function assertObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`[MeshBooleanKernelAdapterManifold] ${label} must be an object.`);
    }
    return value;
}

function assertBooleanType(value) {
    const raw = String(value ?? '').trim();
    if (raw === 'boolean_union' || raw === 'boolean_subtract' || raw === 'boolean_intersect') return raw;
    throw new Error(`[MeshBooleanKernelAdapterManifold] Unsupported boolean type "${raw}".`);
}

function isFiniteVec3(value) {
    return Array.isArray(value)
        && value.length === 3
        && Number.isFinite(Number(value[0]))
        && Number.isFinite(Number(value[1]))
        && Number.isFinite(Number(value[2]));
}

function formatNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    const rounded = Math.round(num * (10 ** KEY_DECIMALS)) / (10 ** KEY_DECIMALS);
    return rounded.toFixed(KEY_DECIMALS);
}

function vectorKey(v) {
    return `${formatNumber(v[0])}|${formatNumber(v[1])}|${formatNumber(v[2])}`;
}

function subVec(a, b) {
    return [
        a[0] - b[0],
        a[1] - b[1],
        a[2] - b[2]
    ];
}

function crossVec(a, b) {
    return [
        (a[1] * b[2]) - (a[2] * b[1]),
        (a[2] * b[0]) - (a[0] * b[2]),
        (a[0] * b[1]) - (a[1] * b[0])
    ];
}

function dotVec(a, b) {
    return (a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2]);
}

function lengthVec(v) {
    return Math.hypot(v[0], v[1], v[2]);
}

function normalizeVec(v) {
    const len = lengthVec(v);
    if (len <= EPSILON) return [0, 0, 0];
    return [v[0] / len, v[1] / len, v[2] / len];
}

function centroidFromPoints(points) {
    const center = [0, 0, 0];
    if (!Array.isArray(points) || points.length < 1) return center;
    for (const point of points) {
        center[0] += point[0];
        center[1] += point[1];
        center[2] += point[2];
    }
    center[0] /= points.length;
    center[1] /= points.length;
    center[2] /= points.length;
    return center;
}

function triangleArea(points) {
    if (!Array.isArray(points) || points.length !== 3) return 0;
    const ab = subVec(points[1], points[0]);
    const ac = subVec(points[2], points[0]);
    return lengthVec(crossVec(ab, ac)) * 0.5;
}

function planeKeyFromPoints(points) {
    const ab = subVec(points[1], points[0]);
    const ac = subVec(points[2], points[0]);
    const normal = normalizeVec(crossVec(ab, ac));
    const distance = dotVec(normal, points[0]);
    return {
        normal,
        distance,
        key: `${vectorKey(normal)}|${formatNumber(distance)}`
    };
}

function freezeVec3(point) {
    return Object.freeze([Number(point[0]), Number(point[1]), Number(point[2])]);
}

function getRenderTriangles(objectDef) {
    if (Array.isArray(objectDef.renderTriangles) && objectDef.renderTriangles.length > 0) {
        return objectDef.renderTriangles
            .map((tri) => {
                const indices = Array.isArray(tri?.indices) ? tri.indices : [];
                if (indices.length !== 3) return null;
                const a = Number(indices[0]);
                const b = Number(indices[1]);
                const c = Number(indices[2]);
                if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c)) return null;
                return Object.freeze({
                    indices: Object.freeze([a, b, c]),
                    faceId: String(tri?.faceId ?? '').trim()
                });
            })
            .filter(Boolean);
    }
    if (Array.isArray(objectDef.triangles) && objectDef.triangles.length > 0) {
        return objectDef.triangles
            .map((tri) => {
                if (!Array.isArray(tri) || tri.length !== 3) return null;
                const a = Number(tri[0]);
                const b = Number(tri[1]);
                const c = Number(tri[2]);
                if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c)) return null;
                return Object.freeze({
                    indices: Object.freeze([a, b, c]),
                    faceId: ''
                });
            })
            .filter(Boolean);
    }
    return [];
}

function buildManifoldInputFromCanonicalObject(objectDef, sourceRole, runOriginalId) {
    const object = assertObject(objectDef, 'objectDef');
    const vertices = Array.isArray(object.vertices) ? object.vertices : [];
    const faces = Array.isArray(object.faces) ? object.faces : [];
    const triangles = getRenderTriangles(object);

    if (vertices.length < 3) {
        throw new Error(`[MeshBooleanKernelAdapterManifold] ${sourceRole} object has insufficient vertices.`);
    }
    if (triangles.length < 1) {
        throw new Error(`[MeshBooleanKernelAdapterManifold] ${sourceRole} object has no render triangles.`);
    }

    const vertProperties = new Float32Array(vertices.length * 3);
    for (let i = 0; i < vertices.length; i++) {
        const point = vertices[i];
        if (!isFiniteVec3(point)) {
            throw new Error(`[MeshBooleanKernelAdapterManifold] ${sourceRole} object has non-finite vertex at index ${i}.`);
        }
        const base = i * 3;
        vertProperties[base] = Number(point[0]);
        vertProperties[base + 1] = Number(point[1]);
        vertProperties[base + 2] = Number(point[2]);
    }

    const faceIndexById = new Map();
    const faceByNumericId = new Map();
    for (let i = 0; i < faces.length; i++) {
        const face = faces[i] ?? {};
        const faceId = String(face.id ?? '').trim();
        if (!faceId) continue;
        faceIndexById.set(faceId, i);
        faceByNumericId.set(i, Object.freeze({
            faceId,
            sourceFaceTag: faceId,
            label: String(face.label ?? '').trim(),
            canonicalLabel: String(face.canonicalLabel ?? '').trim(),
            ambiguous: false
        }));
    }
    faceByNumericId.set(UNKNOWN_FACE_INDEX, Object.freeze({
        faceId: '',
        sourceFaceTag: `${sourceRole}.unknown`,
        label: '',
        canonicalLabel: '',
        ambiguous: true
    }));

    const triVerts = new Uint32Array(triangles.length * 3);
    const faceID = new Uint32Array(triangles.length);
    const maxVertexIndex = vertices.length - 1;
    for (let i = 0; i < triangles.length; i++) {
        const tri = triangles[i];
        const a = tri.indices[0];
        const b = tri.indices[1];
        const c = tri.indices[2];
        if (a < 0 || b < 0 || c < 0 || a > maxVertexIndex || b > maxVertexIndex || c > maxVertexIndex) {
            throw new Error(`[MeshBooleanKernelAdapterManifold] ${sourceRole} triangle ${i} references out-of-range vertex.`);
        }
        const base = i * 3;
        triVerts[base] = a;
        triVerts[base + 1] = b;
        triVerts[base + 2] = c;

        const faceIndex = faceIndexById.has(tri.faceId)
            ? faceIndexById.get(tri.faceId)
            : UNKNOWN_FACE_INDEX;
        faceID[i] = Number.isInteger(faceIndex) ? faceIndex : UNKNOWN_FACE_INDEX;
    }

    return Object.freeze({
        sourceRole,
        objectId: String(object.id ?? '').trim(),
        faceByNumericId,
        meshOptions: Object.freeze({
            numProp: 3,
            vertProperties,
            triVerts,
            faceID,
            runIndex: new Uint32Array([0, triVerts.length]),
            runOriginalID: new Uint32Array([runOriginalId])
        })
    });
}

function buildRunRanges(runIndexArray, runOriginalIdArray, triVertsLength) {
    const runOriginalIds = Array.isArray(runOriginalIdArray)
        ? runOriginalIdArray
        : Array.from(runOriginalIdArray ?? []);
    if (runOriginalIds.length < 1) {
        return [Object.freeze({ startTri: 0, endTri: triVertsLength / 3, runOriginalId: -1 })];
    }

    let runIndex = Array.isArray(runIndexArray)
        ? runIndexArray
        : Array.from(runIndexArray ?? []);
    runIndex = runIndex.map((value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 0;
        return Math.max(0, Math.floor(numeric));
    });
    if (runIndex.length < 1 || runIndex[0] !== 0) {
        runIndex = [0, ...runIndex];
    }
    if (runIndex.length === runOriginalIds.length) {
        runIndex.push(triVertsLength);
    }
    while (runIndex.length < runOriginalIds.length + 1) {
        runIndex.push(triVertsLength);
    }
    if (runIndex.length > runOriginalIds.length + 1) {
        runIndex = runIndex.slice(0, runOriginalIds.length + 1);
    }

    runIndex[0] = 0;
    for (let i = 1; i < runIndex.length; i++) {
        let clamped = Math.min(triVertsLength, Math.max(runIndex[i - 1], runIndex[i]));
        clamped -= (clamped % 3);
        if (clamped < runIndex[i - 1]) clamped = runIndex[i - 1];
        runIndex[i] = clamped;
    }
    runIndex[runIndex.length - 1] = triVertsLength;

    const ranges = [];
    for (let i = 0; i < runOriginalIds.length; i++) {
        const startTri = Math.floor(runIndex[i] / 3);
        const endTri = Math.floor(runIndex[i + 1] / 3);
        ranges.push(Object.freeze({
            startTri,
            endTri,
            runOriginalId: Number(runOriginalIds[i])
        }));
    }
    return ranges;
}

function splitGroupByConnectivity(groupTriangles) {
    if (!Array.isArray(groupTriangles) || groupTriangles.length < 2) {
        return [groupTriangles.slice()];
    }

    const byTriIndex = new Map(groupTriangles.map((tri) => [tri.triangleIndex, tri]));
    const adjacency = new Map();
    for (const tri of groupTriangles) {
        adjacency.set(tri.triangleIndex, new Set());
    }

    const edgeToTriangles = new Map();
    for (const tri of groupTriangles) {
        const ids = tri.indices;
        const edges = [
            stableEdgeKey(ids[0], ids[1]),
            stableEdgeKey(ids[1], ids[2]),
            stableEdgeKey(ids[2], ids[0])
        ];
        for (const edgeKey of edges) {
            const list = edgeToTriangles.get(edgeKey) ?? [];
            list.push(tri.triangleIndex);
            edgeToTriangles.set(edgeKey, list);
        }
    }

    for (const triList of edgeToTriangles.values()) {
        if (triList.length < 2) continue;
        for (let i = 0; i < triList.length; i++) {
            for (let j = i + 1; j < triList.length; j++) {
                adjacency.get(triList[i]).add(triList[j]);
                adjacency.get(triList[j]).add(triList[i]);
            }
        }
    }

    const components = [];
    const visited = new Set();
    const sortedTriIds = [...byTriIndex.keys()].sort((a, b) => a - b);
    for (const start of sortedTriIds) {
        if (visited.has(start)) continue;
        const queue = [start];
        visited.add(start);
        const ids = [];
        while (queue.length) {
            const triId = queue.shift();
            ids.push(triId);
            const neighbors = [...(adjacency.get(triId) ?? [])].sort((a, b) => a - b);
            for (const next of neighbors) {
                if (visited.has(next)) continue;
                visited.add(next);
                queue.push(next);
            }
        }
        ids.sort((a, b) => a - b);
        components.push(ids.map((id) => byTriIndex.get(id)));
    }

    return components;
}

function extractSingleBoundaryLoops(componentTriangles) {
    const boundaryEdgeUsage = new Map();
    for (const tri of componentTriangles) {
        const ids = tri.indices;
        const directed = [
            [ids[0], ids[1]],
            [ids[1], ids[2]],
            [ids[2], ids[0]]
        ];
        for (const edge of directed) {
            const key = stableEdgeKey(edge[0], edge[1]);
            const usage = boundaryEdgeUsage.get(key) ?? { count: 0, directed: [] };
            usage.count += 1;
            usage.directed.push(Object.freeze({ from: edge[0], to: edge[1] }));
            boundaryEdgeUsage.set(key, usage);
        }
    }

    const directedBoundary = [];
    for (const usage of boundaryEdgeUsage.values()) {
        if (usage.count === 1) directedBoundary.push(usage.directed[0]);
    }
    if (directedBoundary.length < 3) return Object.freeze([]);

    const outByFrom = new Map();
    const inCount = new Map();
    const edgeTokenSet = new Set();
    for (const edge of directedBoundary) {
        const token = `${edge.from}|${edge.to}`;
        if (edgeTokenSet.has(token)) {
            return Object.freeze([]);
        }
        edgeTokenSet.add(token);
        const outEdges = outByFrom.get(edge.from) ?? [];
        outEdges.push(edge);
        outByFrom.set(edge.from, outEdges);
        inCount.set(edge.to, (inCount.get(edge.to) ?? 0) + 1);
    }

    for (const [from, outEdges] of outByFrom.entries()) {
        if (outEdges.length !== 1) return Object.freeze([]);
        if ((inCount.get(from) ?? 0) !== 1) return Object.freeze([]);
    }

    const visited = new Set();
    const loops = [];
    const sortedStarts = [...outByFrom.keys()].sort((a, b) => a - b);
    for (const start of sortedStarts) {
        const edge = outByFrom.get(start)?.[0];
        if (!edge) continue;
        const startToken = `${edge.from}|${edge.to}`;
        if (visited.has(startToken)) continue;

        const loop = [];
        let current = start;
        let guard = 0;
        while (guard < directedBoundary.length + 2) {
            guard += 1;
            loop.push(current);
            const currentEdge = outByFrom.get(current)?.[0];
            if (!currentEdge) {
                loop.length = 0;
                break;
            }
            const token = `${currentEdge.from}|${currentEdge.to}`;
            if (visited.has(token)) {
                loop.length = 0;
                break;
            }
            visited.add(token);
            current = currentEdge.to;
            if (current === start) break;
        }

        if (loop.length >= 3 && current === start) {
            loops.push(Object.freeze(loop));
        }
    }

    return Object.freeze(loops);
}

function makePointRingSignature(points) {
    if (!Array.isArray(points) || points.length < 3) return '';
    return points.map((point) => vectorKey(point)).join('|');
}

function buildTrianglePairMergeCandidates(componentTriangles, vertices) {
    const candidates = [];
    const byTriIndex = new Map(componentTriangles.map((tri) => [tri.triangleIndex, tri]));

    for (let i = 0; i < componentTriangles.length; i++) {
        const triA = componentTriangles[i];
        for (let j = i + 1; j < componentTriangles.length; j++) {
            const triB = componentTriangles[j];
            const refNormal = crossVec(subVec(triA.points[1], triA.points[0]), subVec(triA.points[2], triA.points[0]));
            const orientedLoop = buildDeterministicSharedEdgeConvexQuadLoop({
                triangleA: triA.indices,
                triangleB: triB.indices,
                vertices,
                referenceNormal: refNormal
            });
            if (!orientedLoop) continue;

            const loopPoints = orientedLoop.map((index) => vertices[index]).filter((point) => isFiniteVec3(point));
            if (loopPoints.length !== 4) continue;
            const signature = makePointRingSignature(loopPoints);
            const minTri = Math.min(triA.triangleIndex, triB.triangleIndex);
            const maxTri = Math.max(triA.triangleIndex, triB.triangleIndex);
            const triFirst = byTriIndex.get(minTri);
            const triSecond = byTriIndex.get(maxTri);
            if (!triFirst || !triSecond) continue;

            candidates.push(Object.freeze({
                minTri,
                maxTri,
                boundaryLoop: orientedLoop,
                signature,
                triangles: Object.freeze([triFirst, triSecond]),
                sortKey: `${signature}|${String(minTri).padStart(8, '0')}|${String(maxTri).padStart(8, '0')}`
            }));
        }
    }

    candidates.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return Object.freeze(candidates);
}

function mergeFallbackTrianglesToPlansStage1({
    componentTriangles,
    vertices,
    provenanceKey,
    planeKey,
    sourceRole,
    sourceFaceId,
    sourceObjectId,
    provenanceAmbiguous
}) {
    const candidates = buildTrianglePairMergeCandidates(componentTriangles, vertices);
    const consumedTriIds = new Set();
    const mergedPlans = [];
    let mergedPairCount = 0;

    for (const candidate of candidates) {
        if (consumedTriIds.has(candidate.minTri) || consumedTriIds.has(candidate.maxTri)) continue;
        consumedTriIds.add(candidate.minTri);
        consumedTriIds.add(candidate.maxTri);
        mergedPairCount += 1;

        const loopPoints = candidate.boundaryLoop.map((index) => vertices[index]);
        const triangles = candidate.triangles
            .slice()
            .sort((a, b) => a.triangleIndex - b.triangleIndex)
            .map((tri) => Object.freeze([
                freezeVec3(tri.points[0]),
                freezeVec3(tri.points[1]),
                freezeVec3(tri.points[2])
            ]));

        mergedPlans.push(Object.freeze({
            points: Object.freeze(loopPoints.map((point) => freezeVec3(point))),
            triangles: Object.freeze(triangles),
            shared: Object.freeze({
                sourceRole,
                sourceFaceId,
                sourceObjectId,
                provenanceKey,
                provenanceAmbiguous,
                regroupingStage: REGROUPING_STAGE_STAGE1_ADAPTER,
                regroupingFallback: 'merged_triangle_pair_convex_quad'
            }),
            sortKey: `${provenanceKey}|${planeKey}|quad_merge|${candidate.signature}|${String(candidate.minTri).padStart(8, '0')}`
        }));
    }

    const residualTriangles = componentTriangles
        .filter((tri) => !consumedTriIds.has(tri.triangleIndex))
        .sort((a, b) => a.triangleIndex - b.triangleIndex);

    const residualPlans = residualTriangles.map((tri) => Object.freeze({
        points: Object.freeze([
            freezeVec3(tri.points[0]),
            freezeVec3(tri.points[1]),
            freezeVec3(tri.points[2])
        ]),
        triangles: Object.freeze([Object.freeze([
            freezeVec3(tri.points[0]),
            freezeVec3(tri.points[1]),
            freezeVec3(tri.points[2])
        ])]),
        shared: Object.freeze({
            sourceRole: tri.sourceRole,
            sourceFaceId: tri.sourceFaceId,
            sourceObjectId: tri.sourceObjectId,
            provenanceKey: tri.provenanceKey,
            provenanceAmbiguous: tri.ambiguous,
            regroupingStage: REGROUPING_STAGE_STAGE1_ADAPTER,
            regroupingFallback: 'boundary_loop_unresolved'
        }),
        sortKey: `${tri.provenanceKey}|${tri.planeKey}|triangle|${String(tri.triangleIndex).padStart(8, '0')}`
    }));

    return Object.freeze({
        plans: Object.freeze([...mergedPlans, ...residualPlans]),
        mergedPairCount,
        residualTriangleCount: residualTriangles.length,
        candidatePairCount: candidates.length
    });
}

function executeBooleanKernel(type, targetManifold, toolManifold) {
    if (type === 'boolean_union') return targetManifold.add(toolManifold);
    if (type === 'boolean_subtract') return targetManifold.subtract(toolManifold);
    if (type === 'boolean_intersect') return targetManifold.intersect(toolManifold);
    throw new Error(`[MeshBooleanKernelAdapterManifold] Unsupported boolean type "${String(type)}".`);
}

export function executeManifoldBooleanAdapter({ type, targetObject, toolObject }) {
    const booleanType = assertBooleanType(type);
    const target = assertObject(targetObject, 'targetObject');
    const tool = assertObject(toolObject, 'toolObject');

    const module = ensureManifoldBooleanKernelReady();
    if (!module || typeof module !== 'object' || typeof module.Mesh !== 'function' || typeof module.Manifold !== 'function') {
        throw new Error('[MeshBooleanKernelAdapterManifold] Manifold kernel is not available.');
    }

    const baseOriginalId = Number(module.Manifold.reserveIDs(2));
    if (!Number.isFinite(baseOriginalId)) {
        throw new Error('[MeshBooleanKernelAdapterManifold] Failed to reserve manifold original IDs.');
    }

    const targetRunOriginalId = Math.floor(baseOriginalId);
    const toolRunOriginalId = targetRunOriginalId + 1;
    const targetInput = buildManifoldInputFromCanonicalObject(target, 'target', targetRunOriginalId);
    const toolInput = buildManifoldInputFromCanonicalObject(tool, 'tool', toolRunOriginalId);

    let targetMesh = null;
    let toolMesh = null;
    let targetManifold = null;
    let toolManifold = null;
    let outputManifold = null;
    let outputMesh = null;

    try {
        targetMesh = new module.Mesh(targetInput.meshOptions);
        toolMesh = new module.Mesh(toolInput.meshOptions);
        targetManifold = new module.Manifold(targetMesh);
        toolManifold = new module.Manifold(toolMesh);
        outputManifold = executeBooleanKernel(booleanType, targetManifold, toolManifold);
        outputMesh = outputManifold.getMesh();

        const triVerts = new Uint32Array(outputMesh.triVerts ?? []);
        const vertProperties = new Float32Array(outputMesh.vertProperties ?? []);
        const faceID = new Uint32Array(outputMesh.faceID ?? []);
        const runIndex = new Uint32Array(outputMesh.runIndex ?? []);
        const runOriginalID = new Uint32Array(outputMesh.runOriginalID ?? []);
        const numProp = Number(outputMesh.numProp) || 3;

        const vertexCount = Math.floor(vertProperties.length / numProp);
        const vertices = new Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
            const base = i * numProp;
            vertices[i] = Object.freeze([
                Number(vertProperties[base] ?? 0),
                Number(vertProperties[base + 1] ?? 0),
                Number(vertProperties[base + 2] ?? 0)
            ]);
        }

        const triangleCount = Math.floor(triVerts.length / 3);
        const runRanges = buildRunRanges(runIndex, runOriginalID, triVerts.length);
        const sourceByRunOriginalId = new Map([
            [targetRunOriginalId, targetInput],
            [toolRunOriginalId, toolInput]
        ]);

        const runIdByTriangle = new Int32Array(triangleCount);
        runIdByTriangle.fill(-1);
        for (const range of runRanges) {
            const start = Math.max(0, Math.min(triangleCount, range.startTri));
            const end = Math.max(start, Math.min(triangleCount, range.endTri));
            for (let triIndex = start; triIndex < end; triIndex++) {
                runIdByTriangle[triIndex] = range.runOriginalId;
            }
        }

        const triangleRecords = [];
        const provenanceFaceHistogram = new Map();
        let ambiguousProvenanceTriangleCount = 0;

        for (let triIndex = 0; triIndex < triangleCount; triIndex++) {
            const base = triIndex * 3;
            const ai = Number(triVerts[base]);
            const bi = Number(triVerts[base + 1]);
            const ci = Number(triVerts[base + 2]);
            if (!Number.isInteger(ai) || !Number.isInteger(bi) || !Number.isInteger(ci)) continue;
            const a = vertices[ai];
            const b = vertices[bi];
            const c = vertices[ci];
            if (!a || !b || !c) continue;

            const points = [a, b, c];
            if (triangleArea(points) <= EPSILON) continue;
            const plane = planeKeyFromPoints(points);
            const centroid = centroidFromPoints(points);

            const runOriginalId = runIdByTriangle[triIndex];
            const source = sourceByRunOriginalId.get(runOriginalId) ?? null;
            const sourceRole = String(source?.sourceRole ?? 'unknown');
            const sourceObjectId = String(source?.objectId ?? '').trim();
            const sourceFaceIndex = faceID.length > triIndex ? Number(faceID[triIndex]) : UNKNOWN_FACE_INDEX;
            const sourceFaceMeta = source?.faceByNumericId.get(sourceFaceIndex)
                ?? source?.faceByNumericId.get(UNKNOWN_FACE_INDEX)
                ?? { faceId: '', sourceFaceTag: `${sourceRole}.unknown`, ambiguous: true };
            const sourceFaceId = String(sourceFaceMeta?.faceId ?? '').trim();
            const ambiguous = !source || !sourceFaceId || !!sourceFaceMeta?.ambiguous;
            if (ambiguous) ambiguousProvenanceTriangleCount += 1;

            const provenanceKey = sourceFaceId
                ? `${sourceRole}|${sourceObjectId}|${sourceFaceId}`
                : `${sourceRole}|${sourceObjectId}|face.${sourceFaceIndex}`;
            provenanceFaceHistogram.set(provenanceKey, (provenanceFaceHistogram.get(provenanceKey) ?? 0) + 1);

            triangleRecords.push(Object.freeze({
                triangleIndex: triIndex,
                indices: Object.freeze([ai, bi, ci]),
                points: Object.freeze(points.map((point) => freezeVec3(point))),
                planeKey: plane.key,
                centroidKey: vectorKey(centroid),
                sourceRole,
                sourceObjectId,
                sourceFaceId,
                provenanceKey,
                ambiguous
            }));
        }

        triangleRecords.sort((a, b) => {
            const keyA = `${a.provenanceKey}|${a.planeKey}|${a.centroidKey}|${a.triangleIndex}`;
            const keyB = `${b.provenanceKey}|${b.planeKey}|${b.centroidKey}|${b.triangleIndex}`;
            return keyA.localeCompare(keyB);
        });

        const groupedTriangles = new Map();
        for (const tri of triangleRecords) {
            const groupKey = `${tri.provenanceKey}|plane:${tri.planeKey}`;
            const list = groupedTriangles.get(groupKey) ?? [];
            list.push(tri);
            groupedTriangles.set(groupKey, list);
        }

        const polygonPlans = [];
        let connectivityComponentCount = 0;
        let multiLoopComponentCount = 0;
        let fallbackComponentCount = 0;
        let fallbackTriangleFaceCount = 0;
        let fallbackQuadMergePairCount = 0;
        let fallbackQuadMergeCandidateCount = 0;

        const sortedGroupEntries = [...groupedTriangles.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        for (const [, groupTris] of sortedGroupEntries) {
            const components = splitGroupByConnectivity(groupTris);
            connectivityComponentCount += components.length;

            for (const component of components) {
                const componentSorted = [...component].sort((a, b) => a.triangleIndex - b.triangleIndex);
                const first = componentSorted[0];
                if (!first) continue;

                const loops = extractSingleBoundaryLoops(componentSorted);
                if (loops.length === 1) {
                    const ringVertexIndices = loops[0];
                    const ringPoints = ringVertexIndices.map((index) => vertices[index]).filter((point) => isFiniteVec3(point));
                    if (ringPoints.length >= 3) {
                        polygonPlans.push(Object.freeze({
                            points: Object.freeze(ringPoints.map((point) => freezeVec3(point))),
                            triangles: Object.freeze(componentSorted.map((tri) => Object.freeze([
                                freezeVec3(tri.points[0]),
                                freezeVec3(tri.points[1]),
                                freezeVec3(tri.points[2])
                            ]))),
                            shared: Object.freeze({
                                sourceRole: first.sourceRole,
                                sourceFaceId: first.sourceFaceId,
                                sourceObjectId: first.sourceObjectId,
                                provenanceKey: first.provenanceKey,
                                provenanceAmbiguous: componentSorted.some((tri) => tri.ambiguous)
                            }),
                            sortKey: `${first.provenanceKey}|${first.planeKey}|loop|${makePointRingSignature(ringPoints)}|${first.centroidKey}`
                        }));
                        continue;
                    }
                }

                if (loops.length > 1) {
                    multiLoopComponentCount += 1;
                }
                fallbackComponentCount += 1;
                // Stage 1: adapter-space regrouping by provenance/coplanarity/connectivity.
                const fallbackMerge = mergeFallbackTrianglesToPlansStage1({
                    componentTriangles: componentSorted,
                    vertices,
                    provenanceKey: first.provenanceKey,
                    planeKey: first.planeKey,
                    sourceRole: first.sourceRole,
                    sourceFaceId: first.sourceFaceId,
                    sourceObjectId: first.sourceObjectId,
                    provenanceAmbiguous: componentSorted.some((tri) => tri.ambiguous)
                });
                fallbackQuadMergePairCount += fallbackMerge.mergedPairCount;
                fallbackQuadMergeCandidateCount += fallbackMerge.candidatePairCount;
                fallbackTriangleFaceCount += fallbackMerge.residualTriangleCount;

                for (const plan of fallbackMerge.plans) {
                    if (loops.length > 1 && plan.shared?.regroupingFallback === 'boundary_loop_unresolved') {
                        const updatedShared = Object.freeze({
                            ...plan.shared,
                            regroupingFallback: 'split_opening_to_single_ring_faces'
                        });
                        polygonPlans.push(Object.freeze({
                            ...plan,
                            shared: updatedShared
                        }));
                        continue;
                    }
                    polygonPlans.push(plan);
                }
            }
        }

        polygonPlans.sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));

        const polygons = Object.freeze(polygonPlans.map((plan) => Object.freeze({
            points: plan.points,
            triangles: plan.triangles,
            shared: plan.shared
        })));

        return Object.freeze({
            adapterVersion: ADAPTER_VERSION,
            singleRingFacePolicy: 'split_openings_into_single_ring_faces',
            polygons,
            provenance: Object.freeze({
                triangleCount: triangleRecords.length,
                ambiguousProvenanceTriangleCount,
                sourceFaceTriangleHistogram: Object.freeze(Object.fromEntries(
                    [...provenanceFaceHistogram.entries()].sort((a, b) => a[0].localeCompare(b[0]))
                ))
            }),
            regrouping: Object.freeze({
                groupedTriangleBuckets: groupedTriangles.size,
                connectivityComponentCount,
                outputFaceCount: polygons.length,
                fallbackComponentCount,
                fallbackTriangleFaceCount,
                fallbackQuadMergePairCount,
                fallbackQuadMergeCandidateCount,
                multiLoopComponentCount,
                compiledV1SingleRingPolicy: 'split_openings_into_single_ring_faces'
            })
        });
    } finally {
        if (outputMesh && typeof outputMesh.delete === 'function') outputMesh.delete();
        if (outputManifold && typeof outputManifold.delete === 'function') outputManifold.delete();
        if (toolManifold && typeof toolManifold.delete === 'function') toolManifold.delete();
        if (targetManifold && typeof targetManifold.delete === 'function') targetManifold.delete();
        if (toolMesh && typeof toolMesh.delete === 'function') toolMesh.delete();
        if (targetMesh && typeof targetMesh.delete === 'function') targetMesh.delete();
    }
}
