// src/graphics/gui/mesh_fabrication/liveMeshHandoff.js
// Live mesh handoff format contract + parser + canonical topology triangulation + Three.js builder.
import * as THREE from 'three';
import { runMeshCommandPipeline } from './meshCommandPipeline.js';
import {
    DISPLAY_SMOOTHING_MODE,
    DISPLAY_WIRE_SOURCE,
    deriveDisplayTriangulation,
    getRenderTriangleRecords,
    normalizeDisplayMeshBuildConfig
} from './displayMeshDerivation.js';
import {
    AMBIGUOUS_LOOP_ID_FALLBACK,
    compileSemanticAuthoringDocument,
    EXTRUSION_CAP_ID_POLICY,
    MESH_COMPILED_TOPOLOGY_VERSION,
    TOPOLOGY_CHANGE_POLICY
} from './semanticMeshCompiler.js';

export const LIVE_MESH_HANDOFF_FORMAT_V2 = 'mesh-fabrication-handoff.v2';
export const LIVE_MESH_HANDOFF_FORMAT = LIVE_MESH_HANDOFF_FORMAT_V2;
export const LIVE_MESH_DEFAULT_API_PATH = '/api/mesh/current';
export const LIVE_MESH_DEFAULT_FILE_PATH = '/assets/public/mesh_fabrication/handoff/mesh.live.v1.json';
export const LIVE_MESH_DEFAULT_FILE_RELATIVE_PATH = '../assets/public/mesh_fabrication/handoff/mesh.live.v1.json';
export const LIVE_MESH_POLL_INTERVAL_MS = 1000;
export { DISPLAY_LOD_POLICY, DISPLAY_LOD_TRIANGLE_BUDGETS, DISPLAY_SMOOTHING_MODE, DISPLAY_WIRE_SOURCE, normalizeDisplayMeshBuildConfig } from './displayMeshDerivation.js';

function createFaceCenterDiscTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    const r = Math.min(canvas.width, canvas.height) * 0.4;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

const FACE_CENTER_DISC_TEXTURE = createFaceCenterDiscTexture();

function assertObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`[LiveMeshHandoff] ${label} must be an object.`);
    }
    return value;
}

function assertString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`[LiveMeshHandoff] ${label} must be a non-empty string.`);
    }
    return value.trim();
}

function assertFiniteNumber(value, label) {
    const num = Number(value);
    if (!Number.isFinite(num)) throw new Error(`[LiveMeshHandoff] ${label} must be a finite number.`);
    return num;
}

function assertNonNegativeInteger(value, label) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 0) {
        throw new Error(`[LiveMeshHandoff] ${label} must be a non-negative integer.`);
    }
    return num;
}

function assertBoolean(value, label) {
    if (typeof value !== 'boolean') {
        throw new Error(`[LiveMeshHandoff] ${label} must be boolean.`);
    }
    return value;
}

function splitHierarchyPath(id) {
    return String(id ?? '').split(/[./:]/).map((segment) => segment.trim()).filter(Boolean);
}

function assertHierarchicalId(value, label, minSegments = 3) {
    const id = assertString(value, label);
    const segments = splitHierarchyPath(id);
    if (segments.length < minSegments) {
        throw new Error(`[LiveMeshHandoff] ${label} must be hierarchical with >= ${minSegments} path segments.`);
    }
    return id;
}

function sanitizeVec3(value, label, fallback = [0, 0, 0]) {
    if (value === undefined || value === null) return [...fallback];
    if (!Array.isArray(value) || value.length !== 3) {
        throw new Error(`[LiveMeshHandoff] ${label} must be a [x,y,z] array.`);
    }
    return [
        assertFiniteNumber(value[0], `${label}[0]`),
        assertFiniteNumber(value[1], `${label}[1]`),
        assertFiniteNumber(value[2], `${label}[2]`)
    ];
}

function sanitizeMaterialTable(value) {
    const table = assertObject(value, 'materials');
    const out = new Map();
    for (const [rawId, rawMat] of Object.entries(table)) {
        const id = assertString(rawId, 'materials key');
        const mat = assertObject(rawMat, `materials.${id}`);
        const color = typeof mat.color === 'string' || typeof mat.color === 'number'
            ? mat.color
            : '#98a6ba';
        const roughness = mat.roughness === undefined ? 0.56 : assertFiniteNumber(mat.roughness, `materials.${id}.roughness`);
        const metalness = mat.metalness === undefined ? 0.08 : assertFiniteNumber(mat.metalness, `materials.${id}.metalness`);
        out.set(id, Object.freeze({ id, color, roughness, metalness }));
    }
    if (!out.size) throw new Error('[LiveMeshHandoff] materials must define at least one material.');
    return out;
}

function edgePairKey(a, b) {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function createTopologyAddress(objectId, element, index, extras = null) {
    const hierarchy = splitHierarchyPath(objectId);
    const part = hierarchy[0] ?? 'mesh';
    const subpart = hierarchy.length > 1 ? hierarchy.slice(1).join('.') : 'root';
    const objectPath = hierarchy.length > 0 ? hierarchy.join('.') : objectId;
    const base = {
        path: `${objectPath}.${element}.${index}`,
        part,
        subpart,
        objectId,
        element,
        index
    };
    return Object.freeze(extras ? { ...base, ...extras } : base);
}

function createTopologyIndex() {
    return {
        vertices: new Map(),
        edges: new Map(),
        faces: new Map(),
        triangles: new Map()
    };
}

function finalizeTopologyIndex(topologyIndex) {
    return Object.freeze({
        vertices: topologyIndex.vertices,
        edges: topologyIndex.edges,
        faces: topologyIndex.faces,
        triangles: topologyIndex.triangles
    });
}

function createFaceTriangleMap() {
    return new Map();
}

function registerFaceTriangle(faceTriangleMap, faceId, triangleId) {
    const list = faceTriangleMap.get(faceId);
    if (list) {
        list.push(triangleId);
        return;
    }
    faceTriangleMap.set(faceId, [triangleId]);
}

function freezeFaceTriangleMap(faceTriangleMap) {
    const frozen = new Map();
    for (const [faceId, triangleIds] of faceTriangleMap.entries()) {
        frozen.set(faceId, Object.freeze([...triangleIds]));
    }
    return frozen;
}

function registerTopologyElement(map, id, payload, label) {
    if (map.has(id)) {
        throw new Error(`[LiveMeshHandoff] Duplicate ${label} topology id "${id}".`);
    }
    map.set(id, Object.freeze(payload));
}

function normalizeTopologyMetadata(rawTopology) {
    const topology = assertObject(rawTopology, 'topology');
    const version = assertString(topology.version, 'topology.version');
    const lifecycle = assertObject(topology.idLifecycle, 'topology.idLifecycle');
    const nonTopologyChangePreserveIds = assertBoolean(
        lifecycle.nonTopologyChangePreserveIds,
        'topology.idLifecycle.nonTopologyChangePreserveIds'
    );
    const topologyChangePolicy = assertString(
        lifecycle.topologyChangePolicy,
        'topology.idLifecycle.topologyChangePolicy'
    );

    if (!nonTopologyChangePreserveIds) {
        throw new Error('[LiveMeshHandoff] topology.idLifecycle.nonTopologyChangePreserveIds must be true.');
    }
    if (topologyChangePolicy !== TOPOLOGY_CHANGE_POLICY) {
        throw new Error(
            `[LiveMeshHandoff] topology.idLifecycle.topologyChangePolicy must be "${TOPOLOGY_CHANGE_POLICY}".`
        );
    }

    return Object.freeze({
        version,
        idLifecycle: Object.freeze({
            nonTopologyChangePreserveIds,
            topologyChangePolicy
        })
    });
}

function sanitizeCanonicalVertices(value, label) {
    if (!Array.isArray(value) || value.length < 3) {
        throw new Error(`[LiveMeshHandoff] ${label} must contain at least 3 vertices.`);
    }

    const vertices = new Array(value.length);
    const vertexIds = new Array(value.length);
    const vertexIndexById = new Map();

    for (let i = 0; i < value.length; i++) {
        const vertex = assertObject(value[i], `${label}[${i}]`);
        const id = assertHierarchicalId(vertex.id, `${label}[${i}].id`, 3);
        if (vertexIndexById.has(id)) {
            throw new Error(`[LiveMeshHandoff] ${label} duplicate vertex id "${id}".`);
        }
        const position = sanitizeVec3(vertex.position, `${label}[${i}].position`);
        vertexIndexById.set(id, i);
        vertexIds[i] = id;
        vertices[i] = position;
    }

    return {
        vertices: Object.freeze(vertices),
        vertexIds: Object.freeze(vertexIds),
        vertexIndexById
    };
}

function sanitizeCanonicalEdges(value, vertexIndexById, label) {
    if (!Array.isArray(value) || value.length < 1) {
        throw new Error(`[LiveMeshHandoff] ${label} must contain at least 1 edge.`);
    }

    const edges = [];
    const edgeById = new Map();
    const edgeIdByPair = new Map();

    for (let i = 0; i < value.length; i++) {
        const edge = assertObject(value[i], `${label}[${i}]`);
        const id = assertHierarchicalId(edge.id, `${label}[${i}].id`, 3);
        if (edgeById.has(id)) {
            throw new Error(`[LiveMeshHandoff] ${label} duplicate edge id "${id}".`);
        }

        if (!Array.isArray(edge.vertexIds) || edge.vertexIds.length !== 2) {
            throw new Error(`[LiveMeshHandoff] ${label}[${i}].vertexIds must contain exactly 2 vertex ids.`);
        }

        const aId = assertString(edge.vertexIds[0], `${label}[${i}].vertexIds[0]`);
        const bId = assertString(edge.vertexIds[1], `${label}[${i}].vertexIds[1]`);
        const a = vertexIndexById.get(aId);
        const b = vertexIndexById.get(bId);

        if (a === undefined || b === undefined) {
            throw new Error(`[LiveMeshHandoff] ${label}[${i}] references unknown vertex id.`);
        }

        const edgeRecord = Object.freeze({
            id,
            vertexIds: Object.freeze([aId, bId]),
            vertexIndices: Object.freeze([a, b])
        });
        edges.push(edgeRecord);
        edgeById.set(id, edgeRecord);
        edgeIdByPair.set(edgePairKey(a, b), id);
    }

    return {
        edges: Object.freeze(edges),
        edgeById,
        edgeIdByPair
    };
}

function sanitizeCanonicalFaces(value, {
    label,
    vertexIndexById,
    edgeById,
    edgeIdByPair
}) {
    if (!Array.isArray(value) || value.length < 1) {
        throw new Error(`[LiveMeshHandoff] ${label} must contain at least 1 face.`);
    }

    const faces = [];
    const faceById = new Map();

    for (let i = 0; i < value.length; i++) {
        const face = assertObject(value[i], `${label}[${i}]`);
        const id = assertHierarchicalId(face.id, `${label}[${i}].id`, 3);
        if (faceById.has(id)) {
            throw new Error(`[LiveMeshHandoff] ${label} duplicate face id "${id}".`);
        }

        if (!Array.isArray(face.vertexIds) || face.vertexIds.length < 3) {
            throw new Error(`[LiveMeshHandoff] ${label}[${i}].vertexIds must contain at least 3 vertex ids.`);
        }

        const vertexIds = face.vertexIds.map((rawId, idIndex) => assertString(rawId, `${label}[${i}].vertexIds[${idIndex}]`));
        const vertexIndices = vertexIds.map((vertexId) => {
            const vertexIndex = vertexIndexById.get(vertexId);
            if (vertexIndex === undefined) {
                throw new Error(`[LiveMeshHandoff] ${label}[${i}] references unknown vertex id "${vertexId}".`);
            }
            return vertexIndex;
        });

        let edgeIds = null;
        if (Array.isArray(face.edgeIds) && face.edgeIds.length) {
            if (face.edgeIds.length !== vertexIds.length) {
                throw new Error(`[LiveMeshHandoff] ${label}[${i}].edgeIds must match vertex ring length.`);
            }
            edgeIds = face.edgeIds.map((rawId, edgeIndex) => {
                const edgeId = assertString(rawId, `${label}[${i}].edgeIds[${edgeIndex}]`);
                if (!edgeById.has(edgeId)) {
                    throw new Error(`[LiveMeshHandoff] ${label}[${i}] references unknown edge id "${edgeId}".`);
                }
                return edgeId;
            });
        } else {
            edgeIds = new Array(vertexIndices.length);
            for (let e = 0; e < vertexIndices.length; e++) {
                const next = (e + 1) % vertexIndices.length;
                const key = edgePairKey(vertexIndices[e], vertexIndices[next]);
                const edgeId = edgeIdByPair.get(key);
                if (!edgeId) {
                    throw new Error(`[LiveMeshHandoff] ${label}[${i}] missing edge for vertex pair ${vertexIds[e]} -> ${vertexIds[next]}.`);
                }
                edgeIds[e] = edgeId;
            }
        }

        const faceRecord = Object.freeze({
            id,
            vertexIds: Object.freeze(vertexIds),
            vertexIndices: Object.freeze(vertexIndices),
            edgeIds: Object.freeze(edgeIds),
            label: typeof face.label === 'string' && face.label.trim()
                ? face.label.trim()
                : undefined,
            canonicalLabel: typeof face.canonicalLabel === 'string' && face.canonicalLabel.trim()
                ? face.canonicalLabel.trim()
                : undefined
        });
        faces.push(faceRecord);
        faceById.set(id, faceRecord);
    }

    return {
        faces: Object.freeze(faces),
        faceById
    };
}

function sanitizeTransform(value, label) {
    const transform = assertObject(value ?? {}, label);
    return Object.freeze({
        position: sanitizeVec3(transform.position, `${label}.position`, [0, 0, 0]),
        rotation: sanitizeVec3(transform.rotation, `${label}.rotation`, [0, 0, 0]),
        scale: sanitizeVec3(transform.scale, `${label}.scale`, [1, 1, 1])
    });
}

function normalizeCompiledPayload(rawValue) {
    const compiled = assertObject(rawValue, 'compiled');
    const version = assertString(compiled.version, 'compiled.version');
    if (version !== MESH_COMPILED_TOPOLOGY_VERSION) {
        throw new Error(
            `[LiveMeshHandoff] compiled.version must be "${MESH_COMPILED_TOPOLOGY_VERSION}".`
        );
    }

    const idPolicy = assertObject(compiled.idPolicy, 'compiled.idPolicy');
    const topologyChangePolicy = assertString(
        idPolicy.topologyChangePolicy,
        'compiled.idPolicy.topologyChangePolicy'
    );
    const extrusionCapIdentity = assertString(
        idPolicy.extrusionCapIdentity,
        'compiled.idPolicy.extrusionCapIdentity'
    );
    const ambiguousLoopFallback = assertString(
        idPolicy.ambiguousLoopFallback,
        'compiled.idPolicy.ambiguousLoopFallback'
    );
    if (topologyChangePolicy !== TOPOLOGY_CHANGE_POLICY) {
        throw new Error(
            `[LiveMeshHandoff] compiled.idPolicy.topologyChangePolicy must be "${TOPOLOGY_CHANGE_POLICY}".`
        );
    }
    if (extrusionCapIdentity !== EXTRUSION_CAP_ID_POLICY) {
        throw new Error(
            `[LiveMeshHandoff] compiled.idPolicy.extrusionCapIdentity must be "${EXTRUSION_CAP_ID_POLICY}".`
        );
    }
    if (ambiguousLoopFallback !== AMBIGUOUS_LOOP_ID_FALLBACK) {
        throw new Error(
            `[LiveMeshHandoff] compiled.idPolicy.ambiguousLoopFallback must be "${AMBIGUOUS_LOOP_ID_FALLBACK}".`
        );
    }
    const parametricGridContract = typeof idPolicy.parametricGridContract === 'string' && idPolicy.parametricGridContract.trim()
        ? idPolicy.parametricGridContract.trim()
        : null;
    const parametricCanonicalDerivation = typeof idPolicy.parametricCanonicalDerivation === 'string' && idPolicy.parametricCanonicalDerivation.trim()
        ? idPolicy.parametricCanonicalDerivation.trim()
        : null;
    const parametricIndexSpace = typeof idPolicy.parametricIndexSpace === 'string' && idPolicy.parametricIndexSpace.trim()
        ? idPolicy.parametricIndexSpace.trim()
        : null;
    const retessellationPolicy = typeof idPolicy.retessellationPolicy === 'string' && idPolicy.retessellationPolicy.trim()
        ? idPolicy.retessellationPolicy.trim()
        : null;
    if (!Array.isArray(compiled.objects)) {
        throw new Error('[LiveMeshHandoff] compiled.objects must be an array.');
    }

    const normalizedIdPolicy = {
        topologyChangePolicy,
        extrusionCapIdentity,
        ambiguousLoopFallback
    };
    if (parametricGridContract) normalizedIdPolicy.parametricGridContract = parametricGridContract;
    if (parametricCanonicalDerivation) normalizedIdPolicy.parametricCanonicalDerivation = parametricCanonicalDerivation;
    if (parametricIndexSpace) normalizedIdPolicy.parametricIndexSpace = parametricIndexSpace;
    if (retessellationPolicy) normalizedIdPolicy.retessellationPolicy = retessellationPolicy;

    return Object.freeze({
        version,
        idPolicy: Object.freeze(normalizedIdPolicy),
        objects: Object.freeze([...compiled.objects]),
        source: compiled.source && typeof compiled.source === 'object'
            ? Object.freeze({ ...compiled.source })
            : null
    });
}

function expandCompiledObjectToCanonical(rawObject, objectIndex) {
    const obj = assertObject(rawObject, `compiled.objects[${objectIndex}]`);
    const id = assertHierarchicalId(obj.objectId ?? obj.id, `compiled.objects[${objectIndex}].objectId`, 2);
    const material = assertString(obj.material, `compiled.objects[${objectIndex}].material`);
    const transform = sanitizeTransform(obj.transform, `compiled.objects[${objectIndex}].transform`);

    if (!Array.isArray(obj.vertexIds) || !Array.isArray(obj.vertices)) {
        throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}] requires vertexIds and vertices arrays.`);
    }
    if (obj.vertexIds.length !== obj.vertices.length || obj.vertexIds.length < 3) {
        throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}] vertexIds/vertices length mismatch or too small.`);
    }

    const vertexIds = obj.vertexIds.map((rawId, i) => assertHierarchicalId(rawId, `compiled.objects[${objectIndex}].vertexIds[${i}]`, 3));
    const vertices = obj.vertices.map((row, i) => {
        const position = sanitizeVec3(row, `compiled.objects[${objectIndex}].vertices[${i}]`);
        return Object.freeze({ id: vertexIds[i], position });
    });

    if (!Array.isArray(obj.edgeIds) || !Array.isArray(obj.edges)) {
        throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}] requires edgeIds and edges arrays.`);
    }
    if (obj.edgeIds.length !== obj.edges.length || obj.edgeIds.length < 1) {
        throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}] edgeIds/edges length mismatch or too small.`);
    }

    const edgeIds = obj.edgeIds.map((rawId, i) => assertHierarchicalId(rawId, `compiled.objects[${objectIndex}].edgeIds[${i}]`, 3));
    const edges = obj.edges.map((row, i) => {
        if (!Array.isArray(row) || row.length !== 2) {
            throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}].edges[${i}] must be [a,b].`);
        }
        const ai = assertNonNegativeInteger(row[0], `compiled.objects[${objectIndex}].edges[${i}][0]`);
        const bi = assertNonNegativeInteger(row[1], `compiled.objects[${objectIndex}].edges[${i}][1]`);
        if (ai >= vertexIds.length || bi >= vertexIds.length) {
            throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}].edges[${i}] references out-of-range vertex index.`);
        }
        return Object.freeze({
            id: edgeIds[i],
            vertexIds: Object.freeze([vertexIds[ai], vertexIds[bi]])
        });
    });

    if (!Array.isArray(obj.faceIds) || !Array.isArray(obj.faces)) {
        throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}] requires faceIds and faces arrays.`);
    }
    if (obj.faceIds.length !== obj.faces.length || obj.faceIds.length < 1) {
        throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}] faceIds/faces length mismatch or too small.`);
    }

    const faceIds = obj.faceIds.map((rawId, i) => assertHierarchicalId(rawId, `compiled.objects[${objectIndex}].faceIds[${i}]`, 3));
    const faceLabels = Array.isArray(obj.faceLabels) ? obj.faceLabels : null;
    const faceCanonicalLabels = Array.isArray(obj.faceCanonicalLabels) ? obj.faceCanonicalLabels : null;
    if (faceLabels && faceLabels.length !== faceIds.length) {
        throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}].faceLabels must match faceIds length.`);
    }
    if (faceCanonicalLabels && faceCanonicalLabels.length !== faceIds.length) {
        throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}].faceCanonicalLabels must match faceIds length.`);
    }
    const faceEdgeIndices = Array.isArray(obj.faceEdgeIndices) ? obj.faceEdgeIndices : null;
    const faces = obj.faces.map((row, i) => {
        if (!Array.isArray(row) || row.length < 3) {
            throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}].faces[${i}] must have at least 3 vertex indices.`);
        }
        const vertexRing = row.map((value, j) => {
            const vi = assertNonNegativeInteger(value, `compiled.objects[${objectIndex}].faces[${i}][${j}]`);
            if (vi >= vertexIds.length) {
                throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}].faces[${i}] references out-of-range vertex index.`);
            }
            return vertexIds[vi];
        });

        let edgeRing = null;
        if (faceEdgeIndices) {
            if (!Array.isArray(faceEdgeIndices[i]) || faceEdgeIndices[i].length !== vertexRing.length) {
                throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}].faceEdgeIndices[${i}] must match face ring length.`);
            }
            edgeRing = faceEdgeIndices[i].map((value, j) => {
                const ei = assertNonNegativeInteger(value, `compiled.objects[${objectIndex}].faceEdgeIndices[${i}][${j}]`);
                if (ei >= edgeIds.length) {
                    throw new Error(`[LiveMeshHandoff] compiled.objects[${objectIndex}].faceEdgeIndices[${i}] references out-of-range edge index.`);
                }
                return edgeIds[ei];
            });
        }

        const faceLabel = faceLabels
            ? assertString(faceLabels[i], `compiled.objects[${objectIndex}].faceLabels[${i}]`)
            : '';
        const faceCanonicalLabel = faceCanonicalLabels
            ? assertString(faceCanonicalLabels[i], `compiled.objects[${objectIndex}].faceCanonicalLabels[${i}]`)
            : '';

        return Object.freeze({
            id: faceIds[i],
            vertexIds: Object.freeze(vertexRing),
            edgeIds: edgeRing ? Object.freeze(edgeRing) : undefined,
            label: faceLabel || undefined,
            canonicalLabel: faceCanonicalLabel || undefined
        });
    });

    return Object.freeze({
        id,
        material,
        vertices: Object.freeze(vertices),
        edges: Object.freeze(edges),
        faces: Object.freeze(faces),
        transform
    });
}

function triangulateFaces(faces) {
    const renderTriangles = [];

    for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
        const face = faces[faceIndex];
        for (let local = 1; local < face.vertexIndices.length - 1; local++) {
            const triId = `${face.id}.triangle.t${String(local - 1).padStart(3, '0')}`;
            renderTriangles.push(Object.freeze({
                id: triId,
                faceId: face.id,
                faceIndex,
                localIndex: local - 1,
                indices: Object.freeze([
                    face.vertexIndices[0],
                    face.vertexIndices[local],
                    face.vertexIndices[local + 1]
                ])
            }));
        }
    }

    return Object.freeze(renderTriangles);
}

function parseCanonicalObject(obj, objectIndex, materials, {
    objectLabel = 'objects',
    topologySource = 'canonical-v2'
} = {}) {
    const id = assertHierarchicalId(obj.id, `${objectLabel}[${objectIndex}].id`, 2);
    const materialId = assertString(obj.material, `${objectLabel}[${objectIndex}].material`);
    if (!materials.has(materialId)) {
        throw new Error(`[LiveMeshHandoff] ${objectLabel}[${objectIndex}] references missing material "${materialId}".`);
    }

    const {
        vertices,
        vertexIds,
        vertexIndexById
    } = sanitizeCanonicalVertices(obj.vertices, `${objectLabel}[${objectIndex}].vertices`);

    const {
        edges,
        edgeById,
        edgeIdByPair
    } = sanitizeCanonicalEdges(obj.edges, vertexIndexById, `${objectLabel}[${objectIndex}].edges`);

    const {
        faces
    } = sanitizeCanonicalFaces(obj.faces, {
        label: `${objectLabel}[${objectIndex}].faces`,
        vertexIndexById,
        edgeById,
        edgeIdByPair
    });

    const renderTriangles = triangulateFaces(faces);
    const transform = sanitizeTransform(obj.transform, `${objectLabel}[${objectIndex}].transform`);
    const position = transform.position;
    const rotation = transform.rotation;
    const scale = transform.scale;

    return Object.freeze({
        id,
        materialId,
        vertices,
        vertexIds,
        edges,
        faces,
        renderTriangles,
        triangles: Object.freeze(renderTriangles.map((tri) => tri.indices)),
        position,
        rotation,
        scale,
        topologySource
    });
}

function registerObjectTopology(objectDef, objectIndex, topologyIndex, faceTriangleMap) {
    for (let i = 0; i < objectDef.vertexIds.length; i++) {
        const id = objectDef.vertexIds[i];
        registerTopologyElement(topologyIndex.vertices, id, {
            id,
            objectId: objectDef.id,
            objectIndex,
            index: i,
            address: createTopologyAddress(objectDef.id, 'vertex', i)
        }, 'vertex');
    }

    for (let i = 0; i < objectDef.edges.length; i++) {
        const edge = objectDef.edges[i];
        registerTopologyElement(topologyIndex.edges, edge.id, {
            id: edge.id,
            objectId: objectDef.id,
            objectIndex,
            index: i,
            vertexIds: edge.vertexIds,
            address: createTopologyAddress(objectDef.id, 'edge', i)
        }, 'edge');
    }

    for (let i = 0; i < objectDef.faces.length; i++) {
        const face = objectDef.faces[i];
        registerTopologyElement(topologyIndex.faces, face.id, {
            id: face.id,
            objectId: objectDef.id,
            objectIndex,
            index: i,
            vertexIds: face.vertexIds,
            edgeIds: face.edgeIds,
            label: face.label,
            canonicalLabel: face.canonicalLabel,
            address: createTopologyAddress(objectDef.id, 'face', i)
        }, 'face');
    }

    for (let i = 0; i < objectDef.renderTriangles.length; i++) {
        const triangle = objectDef.renderTriangles[i];
        registerFaceTriangle(faceTriangleMap, triangle.faceId, triangle.id);
        registerTopologyElement(topologyIndex.triangles, triangle.id, {
            id: triangle.id,
            objectId: objectDef.id,
            objectIndex,
            index: i,
            localIndex: triangle.localIndex,
            faceId: triangle.faceId,
            vertexIndices: triangle.indices,
            address: createTopologyAddress(objectDef.id, 'triangle', i, {
                faceId: triangle.faceId,
                triangleLocalIndex: triangle.localIndex
            })
        }, 'triangle');
    }
}

function getRenderTriangleIndices(objectDef) {
    if (Array.isArray(objectDef.renderTriangles) && objectDef.renderTriangles.length) {
        return objectDef.renderTriangles.map((tri) => tri.indices);
    }
    if (Array.isArray(objectDef.triangles) && objectDef.triangles.length) {
        return objectDef.triangles;
    }
    return [];
}

function buildGeometryFromDisplayTriangulation(triangulation) {
    const vertices = Array.isArray(triangulation?.vertices) ? triangulation.vertices : [];
    const triangles = Array.isArray(triangulation?.triangles) ? triangulation.triangles : [];
    const maxIndex = vertices.length - 1;
    const IndexArray = maxIndex > 65535 ? Uint32Array : Uint16Array;
    const positionArray = new Float32Array(vertices.length * 3);
    const indexArray = new IndexArray(triangles.length * 3);
    const triangleFaceIds = new Array(triangles.length);

    for (let i = 0; i < vertices.length; i++) {
        const base = i * 3;
        const vertex = vertices[i] ?? [0, 0, 0];
        positionArray[base] = Number(vertex[0]) || 0;
        positionArray[base + 1] = Number(vertex[1]) || 0;
        positionArray[base + 2] = Number(vertex[2]) || 0;
    }
    for (let i = 0; i < triangles.length; i++) {
        const base = i * 3;
        const tri = triangles[i];
        indexArray[base] = tri.a;
        indexArray[base + 1] = tri.b;
        indexArray[base + 2] = tri.c;
        triangleFaceIds[i] = String(tri.faceId ?? '');
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
    geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return Object.freeze({
        geometry,
        triangleFaceIds: Object.freeze(triangleFaceIds),
        triangles,
        vertices
    });
}

function appendDisplayWireSegments({
    displayVertices,
    displayTriangles,
    matrix,
    targetPositionArray,
    targetFaceIdArray,
    edgeA,
    edgeB
}) {
    const edgeMap = new Map();
    const addEdge = (ai, bi, faceId) => {
        const a = Math.min(ai, bi);
        const b = Math.max(ai, bi);
        const key = `${a}|${b}|${faceId}`;
        if (edgeMap.has(key)) return;
        edgeMap.set(key, Object.freeze({
            a,
            b,
            faceId
        }));
    };

    for (const tri of displayTriangles) {
        const faceId = String(tri.faceId ?? '');
        addEdge(tri.a, tri.b, faceId);
        addEdge(tri.b, tri.c, faceId);
        addEdge(tri.c, tri.a, faceId);
    }

    for (const edge of edgeMap.values()) {
        const av = displayVertices[edge.a] ?? [0, 0, 0];
        const bv = displayVertices[edge.b] ?? [0, 0, 0];
        edgeA.set(Number(av[0]) || 0, Number(av[1]) || 0, Number(av[2]) || 0).applyMatrix4(matrix);
        edgeB.set(Number(bv[0]) || 0, Number(bv[1]) || 0, Number(bv[2]) || 0).applyMatrix4(matrix);
        targetPositionArray.push(edgeA.x, edgeA.y, edgeA.z, edgeB.x, edgeB.y, edgeB.z);
        targetFaceIdArray.push(edge.faceId);
    }
}

function normalizeAuthoringOperationPath(value, label) {
    return assertHierarchicalId(
        value,
        label,
        2
    );
}

function convertAuthoringBooleanOperationsToAiCommands(authoring) {
    if (!authoring || typeof authoring !== 'object') return [];
    if (!Array.isArray(authoring.operations) || authoring.operations.length < 1) return [];
    const commands = [];
    for (let i = 0; i < authoring.operations.length; i++) {
        const op = assertObject(authoring.operations[i], `authoring.operations[${i}]`);
        const type = assertString(op.type, `authoring.operations[${i}].type`);
        if (type !== 'boolean_subtract' && type !== 'boolean_union' && type !== 'boolean_intersect') {
            throw new Error(
                `[LiveMeshHandoff] Unsupported authoring.operations[${i}].type "${type}".`
            );
        }
        const targetObjectId = normalizeAuthoringOperationPath(
            op.targetObjectId ?? op.targetPath ?? op.targetComponent ?? op.target,
            `authoring.operations[${i}].targetObjectId`
        );
        const toolObjectId = normalizeAuthoringOperationPath(
            op.toolObjectId ?? op.toolPath ?? op.toolComponent ?? op.tool,
            `authoring.operations[${i}].toolObjectId`
        );
        const args = {
            targetObjectId,
            toolObjectId
        };
        if (op.subtractMode !== undefined || op.mode !== undefined) {
            args.subtractMode = assertString(op.subtractMode ?? op.mode, `authoring.operations[${i}].subtractMode`);
        }
        if (op.outputPolicy !== undefined) {
            args.outputPolicy = assertString(op.outputPolicy, `authoring.operations[${i}].outputPolicy`);
        }
        if (op.keepTool !== undefined) {
            args.keepTool = assertBoolean(op.keepTool, `authoring.operations[${i}].keepTool`);
        }
        if (op.resultObjectId !== undefined) {
            args.resultObjectId = normalizeAuthoringOperationPath(op.resultObjectId, `authoring.operations[${i}].resultObjectId`);
        }
        if (op.opId !== undefined) {
            args.opId = assertString(op.opId, `authoring.operations[${i}].opId`);
        }
        commands.push(Object.freeze({
            type,
            args: Object.freeze(args)
        }));
    }
    return Object.freeze(commands);
}

export function parseLiveMeshDocument(rawValue) {
    const root = assertObject(rawValue, 'mesh handoff root');
    const format = assertString(root.format, 'format');
    if (format !== LIVE_MESH_HANDOFF_FORMAT_V2) {
        throw new Error(
            `[LiveMeshHandoff] Unsupported format "${format}". Expected "${LIVE_MESH_HANDOFF_FORMAT_V2}".`
        );
    }

    const meshId = assertString(root.meshId, 'meshId');
    const revisionRaw = root.revision ?? '0';
    const revision = String(revisionRaw);
    const topology = normalizeTopologyMetadata(root.topology);

    const materials = sanitizeMaterialTable(root.materials);
    let authoredCompiled = null;
    if (root.authoring !== undefined) {
        authoredCompiled = normalizeCompiledPayload(compileSemanticAuthoringDocument(root.authoring, {
            materialsById: materials
        }));
    }
    const explicitCompiled = root.compiled !== undefined
        ? normalizeCompiledPayload(root.compiled)
        : null;
    const runtimeCompiled = explicitCompiled ?? authoredCompiled;

    let objects = null;
    let runtimeTopologySource = 'canonical-v2';
    if (runtimeCompiled) {
        objects = runtimeCompiled.objects.map((rawObject, index) => {
            const canonical = expandCompiledObjectToCanonical(rawObject, index);
            return parseCanonicalObject(canonical, index, materials, {
                objectLabel: 'compiled.objects',
                topologySource: 'compiled-v1'
            });
        });
        runtimeTopologySource = 'compiled-v1';
    } else {
        if (!Array.isArray(root.objects)) {
            throw new Error('[LiveMeshHandoff] Expected either compiled.objects or legacy objects array.');
        }
        objects = root.objects.map((rawObject, index) => {
            const obj = assertObject(rawObject, `objects[${index}]`);
            return parseCanonicalObject(obj, index, materials);
        });
    }

    const authoringCommands = convertAuthoringBooleanOperationsToAiCommands(root.authoring);
    const aiRoot = root.ai && typeof root.ai === 'object' ? root.ai : {};
    const runtimeAiPayload = Object.freeze({
        ...aiRoot,
        instructions: Array.isArray(aiRoot.instructions) ? aiRoot.instructions : [],
        commands: Object.freeze([
            ...authoringCommands,
            ...(Array.isArray(aiRoot.commands) ? aiRoot.commands : [])
        ])
    });

    const commandRuntime = runMeshCommandPipeline(runtimeAiPayload, { objects, materials });
    const runtimeObjects = Array.isArray(commandRuntime.objects) && commandRuntime.objects.length >= 0
        ? commandRuntime.objects
        : objects;

    const topologyIndex = createTopologyIndex();
    const faceTriangleMap = createFaceTriangleMap();
    runtimeObjects.forEach((parsed, index) => {
        registerObjectTopology(parsed, index, topologyIndex, faceTriangleMap);
    });

    return Object.freeze({
        format,
        meshId,
        revision,
        topology,
        materials,
        objects: Object.freeze(runtimeObjects),
        meshLayers: Object.freeze({
            runtimeTopologySource,
            hasAuthoringLayer: root.authoring !== undefined,
            hasCompiledLayer: !!runtimeCompiled,
            compiledSource: explicitCompiled
                ? 'payload.compiled'
                : authoredCompiled
                    ? 'derived.from_authoring'
                    : 'none'
        }),
        compiled: runtimeCompiled
            ? Object.freeze({
                version: runtimeCompiled.version,
                idPolicy: runtimeCompiled.idPolicy,
                source: runtimeCompiled.source ?? null
            })
            : null,
        topologyIndex: finalizeTopologyIndex(topologyIndex),
        faceToTriangleIds: freezeFaceTriangleMap(faceTriangleMap),
        aiCommandPlan: commandRuntime.commandPlan,
        booleanKernel: commandRuntime.commandPlan?.booleanKernel ?? 'manifold-3d',
        aiOperationLog: commandRuntime.operationLog,
        aiObjectOverrides: commandRuntime.objectOverrides
    });
}

export function buildThreeGroupFromLiveMesh(parsedDocument, options = null) {
    const displayConfig = normalizeDisplayMeshBuildConfig(options?.displayMesh ?? options);
    const group = new THREE.Group();
    group.name = `live-mesh:${parsedDocument.meshId}`;

    const materialById = new Map();
    const usedMaterials = [];
    const usedGeometries = [];
    const canonicalSurfaceMeshes = [];
    const surfaceMeshes = [];
    const canonicalEdgePosition = [];
    const canonicalEdgeTopologyIds = [];
    const displayEdgePosition = [];
    const displayEdgeFaceIds = [];
    const vertexPosition = [];
    const vertexTopologyIds = [];
    const faceCenterPosition = [];
    const faceCenterTopologyIds = [];
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();
    const point = new THREE.Vector3();
    const faceCenter = new THREE.Vector3();
    const euler = new THREE.Euler();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const matrix = new THREE.Matrix4();

    const surfaceMaterialCache = new Map();
    const resolveSurfaceMaterial = (materialId) => {
        const flatShading = displayConfig.smoothingMode === DISPLAY_SMOOTHING_MODE.FLAT;
        const cacheKey = `${materialId}|${flatShading ? 'flat' : 'smooth'}`;
        const cached = surfaceMaterialCache.get(cacheKey);
        if (cached) return cached;
        const materialDef = parsedDocument.materials.get(materialId) ?? parsedDocument.materials.values().next().value;
        const mat = new THREE.MeshLambertMaterial({
            color: materialDef?.color ?? '#98a6ba',
            flatShading
        });
        surfaceMaterialCache.set(cacheKey, mat);
        usedMaterials.push(mat);
        return mat;
    };

    let totalCanonicalTriangleCount = 0;
    let totalDisplayTriangleCount = 0;
    let maxAppliedSubdivisionLevel = 0;

    for (const materialDef of parsedDocument.materials.values()) {
        materialById.set(materialDef.id, materialDef);
    }

    for (const objectDef of parsedDocument.objects) {
        const objectOverride = parsedDocument.aiObjectOverrides?.get(objectDef.id) ?? null;
        const objectMaterialId = objectOverride?.materialId ?? objectDef.materialId;
        const objectPosition = objectOverride?.position ?? objectDef.position;
        const objectRotation = objectOverride?.rotation ?? objectDef.rotation;
        const objectScale = objectOverride?.scale ?? objectDef.scale;

        const canonicalTriangleRecords = getRenderTriangleRecords(objectDef);
        totalCanonicalTriangleCount += canonicalTriangleRecords.length;

        const canonicalPositionArray = new Float32Array(objectDef.vertices.length * 3);
        for (let i = 0; i < objectDef.vertices.length; i++) {
            const base = i * 3;
            const v = objectDef.vertices[i] ?? [0, 0, 0];
            canonicalPositionArray[base] = Number(v[0]) || 0;
            canonicalPositionArray[base + 1] = Number(v[1]) || 0;
            canonicalPositionArray[base + 2] = Number(v[2]) || 0;
        }
        const canonicalMaxIndex = objectDef.vertices.length - 1;
        const CanonicalIndexArray = canonicalMaxIndex > 65535 ? Uint32Array : Uint16Array;
        const canonicalIndexArray = new CanonicalIndexArray(canonicalTriangleRecords.length * 3);
        const canonicalTriangleFaceIds = new Array(canonicalTriangleRecords.length);
        for (let i = 0; i < canonicalTriangleRecords.length; i++) {
            const base = i * 3;
            const tri = canonicalTriangleRecords[i];
            canonicalIndexArray[base] = tri.indices[0];
            canonicalIndexArray[base + 1] = tri.indices[1];
            canonicalIndexArray[base + 2] = tri.indices[2];
            canonicalTriangleFaceIds[i] = tri.faceId;
        }
        const canonicalGeometry = new THREE.BufferGeometry();
        canonicalGeometry.setAttribute('position', new THREE.BufferAttribute(canonicalPositionArray, 3));
        canonicalGeometry.setIndex(new THREE.BufferAttribute(canonicalIndexArray, 1));
        canonicalGeometry.computeVertexNormals();
        canonicalGeometry.computeBoundingSphere();
        usedGeometries.push(canonicalGeometry);

        const triangulation = deriveDisplayTriangulation(
            objectDef,
            displayConfig.resolvedSubdivisionLevel,
            displayConfig.triangleBudget
        );
        maxAppliedSubdivisionLevel = Math.max(maxAppliedSubdivisionLevel, triangulation.appliedSubdivisionLevel);
        const displayGeometryData = buildGeometryFromDisplayTriangulation(triangulation);
        totalDisplayTriangleCount += displayGeometryData.triangleFaceIds.length;

        const geometry = displayGeometryData.geometry;
        usedGeometries.push(geometry);

        const resolvedMaterial = materialById.has(objectMaterialId) ? objectMaterialId : objectDef.materialId;
        const material = resolveSurfaceMaterial(resolvedMaterial);
        const canonicalMesh = new THREE.Mesh(canonicalGeometry, material);
        canonicalMesh.name = `${objectDef.id}:canonical`;
        canonicalMesh.position.set(objectPosition[0], objectPosition[1], objectPosition[2]);
        canonicalMesh.rotation.set(objectRotation[0], objectRotation[1], objectRotation[2]);
        canonicalMesh.scale.set(objectScale[0], objectScale[1], objectScale[2]);
        canonicalMesh.visible = false;
        canonicalMesh.userData.meshFabCanonicalControlCage = true;
        canonicalMesh.userData.topology = {
            source: 'canonical-control-cage',
            vertexIds: objectDef.vertexIds,
            edgeIds: objectDef.edges.map((edge) => edge.id),
            faceIds: objectDef.faces.map((face) => face.id),
            triangleIds: canonicalTriangleRecords.map((tri) => tri.id),
            triangleFaceIds: Object.freeze([...canonicalTriangleFaceIds]),
            faceToTriangleIds: parsedDocument.faceToTriangleIds
        };
        group.add(canonicalMesh);
        canonicalSurfaceMeshes.push(canonicalMesh);

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = objectDef.id;
        mesh.position.set(objectPosition[0], objectPosition[1], objectPosition[2]);
        mesh.rotation.set(objectRotation[0], objectRotation[1], objectRotation[2]);
        mesh.scale.set(objectScale[0], objectScale[1], objectScale[2]);
        mesh.userData.topology = {
            source: 'display-derived',
            vertexIds: objectDef.vertexIds,
            edgeIds: objectDef.edges.map((edge) => edge.id),
            faceIds: objectDef.faces.map((face) => face.id),
            triangleIds: displayGeometryData.triangleFaceIds.map(
                (faceId, triIndex) => `${faceId}.display.t${String(triIndex).padStart(3, '0')}`
            ),
            triangleFaceIds: displayGeometryData.triangleFaceIds,
            faceToTriangleIds: parsedDocument.faceToTriangleIds
        };
        mesh.userData.meshFabDisplay = Object.freeze({
            smoothingMode: displayConfig.smoothingMode,
            subdivisionLevel: triangulation.appliedSubdivisionLevel,
            lodPolicy: displayConfig.lodPolicy
        });
        mesh.userData.booleanKernel = parsedDocument.booleanKernel ?? 'manifold-3d';
        mesh.userData.aiCommandPlan = parsedDocument.aiCommandPlan;
        mesh.userData.aiOperationLog = parsedDocument.aiOperationLog;
        group.add(mesh);
        surfaceMeshes.push(mesh);

        euler.set(objectRotation[0], objectRotation[1], objectRotation[2], 'XYZ');
        quat.setFromEuler(euler);
        scale.set(objectScale[0], objectScale[1], objectScale[2]);
        position.set(objectPosition[0], objectPosition[1], objectPosition[2]);
        matrix.compose(position, quat, scale);

        for (const edge of objectDef.edges) {
            const ai = edge.vertexIndices[0];
            const bi = edge.vertexIndices[1];
            edgeA.fromArray(objectDef.vertices[ai]).applyMatrix4(matrix);
            edgeB.fromArray(objectDef.vertices[bi]).applyMatrix4(matrix);
            canonicalEdgePosition.push(edgeA.x, edgeA.y, edgeA.z, edgeB.x, edgeB.y, edgeB.z);
            canonicalEdgeTopologyIds.push(edge.id);
        }
        for (let i = 0; i < objectDef.vertices.length; i++) {
            point.fromArray(objectDef.vertices[i]).applyMatrix4(matrix);
            vertexPosition.push(point.x, point.y, point.z);
            vertexTopologyIds.push(objectDef.vertexIds[i]);
        }
        for (const face of objectDef.faces) {
            faceCenter.set(0, 0, 0);
            const ring = face.vertexIndices;
            for (let i = 0; i < ring.length; i++) {
                point.fromArray(objectDef.vertices[ring[i]]);
                faceCenter.add(point);
            }
            faceCenter.multiplyScalar(1 / ring.length).applyMatrix4(matrix);
            faceCenterPosition.push(faceCenter.x, faceCenter.y, faceCenter.z);
            faceCenterTopologyIds.push(face.id);
        }

        appendDisplayWireSegments({
            displayVertices: triangulation.vertices,
            displayTriangles: triangulation.triangles,
            matrix,
            targetPositionArray: displayEdgePosition,
            targetFaceIdArray: displayEdgeFaceIds,
            edgeA,
            edgeB
        });
    }

    let polygonWireCanonical = null;
    if (canonicalEdgePosition.length >= 6) {
        const edgeGeometry = new THREE.BufferGeometry();
        edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(canonicalEdgePosition, 3));
        edgeGeometry.computeBoundingSphere();
        const edgeMaterial = new THREE.LineBasicMaterial({
            color: 0xd7ecff,
            transparent: true,
            opacity: 0.95,
            depthTest: true,
            depthWrite: false
        });
        polygonWireCanonical = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        polygonWireCanonical.name = 'mesh-fab-polygon-wire-canonical';
        polygonWireCanonical.renderOrder = 4;
        polygonWireCanonical.userData.topology = Object.freeze({
            source: DISPLAY_WIRE_SOURCE.CANONICAL,
            edgeIds: Object.freeze([...canonicalEdgeTopologyIds])
        });
        group.add(polygonWireCanonical);
        usedGeometries.push(edgeGeometry);
        usedMaterials.push(edgeMaterial);
    }

    let polygonWireDisplay = null;
    if (displayEdgePosition.length >= 6) {
        const edgeGeometry = new THREE.BufferGeometry();
        edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(displayEdgePosition, 3));
        edgeGeometry.computeBoundingSphere();
        const edgeMaterial = new THREE.LineBasicMaterial({
            color: 0xc8e5ff,
            transparent: true,
            opacity: 0.82,
            depthTest: true,
            depthWrite: false
        });
        polygonWireDisplay = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        polygonWireDisplay.name = 'mesh-fab-polygon-wire-display';
        polygonWireDisplay.renderOrder = 4;
        polygonWireDisplay.userData.topology = Object.freeze({
            source: DISPLAY_WIRE_SOURCE.DISPLAY,
            faceIds: Object.freeze([...displayEdgeFaceIds])
        });
        group.add(polygonWireDisplay);
        usedGeometries.push(edgeGeometry);
        usedMaterials.push(edgeMaterial);
    }

    let vertexOverlay = null;
    if (vertexPosition.length >= 3) {
        const vertexGeometry = new THREE.BufferGeometry();
        vertexGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertexPosition, 3));
        vertexGeometry.computeBoundingSphere();
        const vertexMaterial = new THREE.PointsMaterial({
            color: 0x9fe0ff,
            size: 6,
            sizeAttenuation: false,
            transparent: true,
            opacity: 0.96,
            depthTest: true,
            depthWrite: false
        });
        vertexOverlay = new THREE.Points(vertexGeometry, vertexMaterial);
        vertexOverlay.name = 'mesh-fab-vertex-overlay';
        vertexOverlay.renderOrder = 5;
        vertexOverlay.userData.topology = Object.freeze({
            vertexIds: Object.freeze([...vertexTopologyIds])
        });
        group.add(vertexOverlay);
        usedGeometries.push(vertexGeometry);
        usedMaterials.push(vertexMaterial);
    }

    let faceCenterOverlay = null;
    if (faceCenterPosition.length >= 3) {
        const faceCenterGeometry = new THREE.BufferGeometry();
        faceCenterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(faceCenterPosition, 3));
        faceCenterGeometry.computeBoundingSphere();
        const faceCenterMaterial = new THREE.PointsMaterial({
            color: 0xfff2ad,
            size: 7,
            sizeAttenuation: false,
            transparent: true,
            opacity: 0.97,
            depthTest: false,
            depthWrite: false,
            map: FACE_CENTER_DISC_TEXTURE,
            alphaTest: FACE_CENTER_DISC_TEXTURE ? 0.45 : 0
        });
        faceCenterOverlay = new THREE.Points(faceCenterGeometry, faceCenterMaterial);
        faceCenterOverlay.name = 'mesh-fab-face-center-overlay';
        faceCenterOverlay.renderOrder = 6;
        faceCenterOverlay.userData.topology = Object.freeze({
            faceIds: Object.freeze([...faceCenterTopologyIds])
        });
        group.add(faceCenterOverlay);
        usedGeometries.push(faceCenterGeometry);
        usedMaterials.push(faceCenterMaterial);
    }

    const bounds = new THREE.Box3().setFromObject(group);
    const polygonWire = displayConfig.wireSource === DISPLAY_WIRE_SOURCE.DISPLAY
        ? (polygonWireDisplay ?? polygonWireCanonical)
        : (polygonWireCanonical ?? polygonWireDisplay);
    return {
        group,
        canonicalSurfaceMeshes: Object.freeze(canonicalSurfaceMeshes),
        surfaceMeshes: Object.freeze(surfaceMeshes),
        polygonWireCanonical,
        polygonWireDisplay,
        polygonWire,
        vertexOverlay,
        faceCenterOverlay,
        displayContract: Object.freeze({
            dualMesh: true,
            canonicalTopologyAuthoritative: true,
            smoothingMode: displayConfig.smoothingMode,
            requestedSubdivisionLevel: displayConfig.subdivisionLevel,
            appliedSubdivisionLevel: maxAppliedSubdivisionLevel,
            wireSource: displayConfig.wireSource,
            lodPolicy: displayConfig.lodPolicy,
            triangleBudget: displayConfig.triangleBudget,
            canonicalTriangleCount: totalCanonicalTriangleCount,
            displayTriangleCount: totalDisplayTriangleCount
        }),
        materials: usedMaterials,
        geometries: usedGeometries,
        bounds
    };
}

function formatObjNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    const rounded = Math.round(num * 1e6) / 1e6;
    return String(rounded);
}

export function buildObjTextFromLiveMesh(parsedDocument, options = null) {
    const meshKind = String(options?.meshKind ?? 'canonical').trim().toLowerCase() === 'display'
        ? 'display'
        : 'canonical';
    const displayConfig = meshKind === 'display'
        ? normalizeDisplayMeshBuildConfig(options?.displayMesh ?? options)
        : null;
    const lines = [];
    lines.push(`# mesh-handoff ${parsedDocument.format}`);
    lines.push(`# meshId ${parsedDocument.meshId}`);
    lines.push(`# revision ${parsedDocument.revision}`);
    lines.push(`# meshKind ${meshKind}`);
    lines.push(`# topology.version ${parsedDocument.topology?.version ?? '-'}`);
    lines.push(`o ${parsedDocument.meshId}`);

    let vertexOffset = 0;
    const euler = new THREE.Euler();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const vertex = new THREE.Vector3();

    for (const objectDef of parsedDocument.objects) {
        lines.push(`g ${objectDef.id}`);
        euler.set(objectDef.rotation[0], objectDef.rotation[1], objectDef.rotation[2], 'XYZ');
        quat.setFromEuler(euler);
        scale.set(objectDef.scale[0], objectDef.scale[1], objectDef.scale[2]);
        position.set(objectDef.position[0], objectDef.position[1], objectDef.position[2]);
        matrix.compose(position, quat, scale);

        let sourceVertices = objectDef.vertices;
        let sourceTriangles = getRenderTriangleIndices(objectDef);
        if (meshKind === 'display' && displayConfig) {
            const triangulation = deriveDisplayTriangulation(
                objectDef,
                displayConfig.resolvedSubdivisionLevel,
                displayConfig.triangleBudget
            );
            sourceVertices = triangulation.vertices;
            sourceTriangles = triangulation.triangles.map((tri) => [tri.a, tri.b, tri.c]);
        }

        for (const src of sourceVertices) {
            vertex.set(src[0], src[1], src[2]).applyMatrix4(matrix);
            lines.push(`v ${formatObjNumber(vertex.x)} ${formatObjNumber(vertex.y)} ${formatObjNumber(vertex.z)}`);
        }

        for (const tri of sourceTriangles) {
            const a = tri[0] + 1 + vertexOffset;
            const b = tri[1] + 1 + vertexOffset;
            const c = tri[2] + 1 + vertexOffset;
            lines.push(`f ${a} ${b} ${c}`);
        }

        vertexOffset += sourceVertices.length;
    }

    lines.push('');
    return lines.join('\n');
}

export function resolveLiveMeshEndpoint(locationLike = null) {
    const fallbackHref = (typeof window !== 'undefined' && window.location?.href)
        ? String(window.location.href)
        : 'http://127.0.0.1:8765/screens/mesh_fabrication.html';
    const locationRef = locationLike ?? (typeof window !== 'undefined' ? window.location : null);
    const href = typeof locationRef?.href === 'string' ? locationRef.href : fallbackHref;
    const pageUrl = new URL(href);
    const endpointOverride = pageUrl.searchParams.get('meshEndpoint');
    if (endpointOverride) return endpointOverride;

    if (pageUrl.protocol === 'http:' || pageUrl.protocol === 'https:') {
        return new URL(LIVE_MESH_DEFAULT_API_PATH, pageUrl.origin).toString();
    }
    return new URL(LIVE_MESH_DEFAULT_API_PATH, pageUrl).toString();
}

export function resolveLiveMeshStaticFileUrl(locationLike = null) {
    const fallbackHref = (typeof window !== 'undefined' && window.location?.href)
        ? String(window.location.href)
        : 'http://127.0.0.1:8765/screens/mesh_fabrication.html';
    const locationRef = locationLike ?? (typeof window !== 'undefined' ? window.location : null);
    const href = typeof locationRef?.href === 'string' ? locationRef.href : fallbackHref;
    const pageUrl = new URL(href);

    if (pageUrl.protocol === 'http:' || pageUrl.protocol === 'https:') {
        return new URL(LIVE_MESH_DEFAULT_FILE_PATH, pageUrl.origin).toString();
    }

    return new URL(LIVE_MESH_DEFAULT_FILE_RELATIVE_PATH, pageUrl).toString();
}
