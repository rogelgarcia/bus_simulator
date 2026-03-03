// src/graphics/gui/mesh_fabrication/semanticMeshCompiler.js
// Deterministic semantic-authoring compiler for compact compiled topology payloads.

export const MESH_SEMANTIC_AUTHORING_VERSION = 'mesh-semantic-authoring.v1';
export const MESH_COMPILED_TOPOLOGY_VERSION = 'mesh-fabrication-compiled.v1';
export const TOPOLOGY_CHANGE_POLICY = 'preserve_unaffected_create_new_never_recycle';
export const EXTRUSION_CAP_ID_POLICY = 'always_new_derived_cap_id';
export const AMBIGUOUS_LOOP_ID_FALLBACK = 'ring_ordinal';

const DEFAULT_CENTER = Object.freeze([0, 0, 0]);
const DEFAULT_SIZE = Object.freeze([2, 1, 2]);
const DEFAULT_POSITION = Object.freeze([0, 0, 0]);
const DEFAULT_ROTATION = Object.freeze([0, 0, 0]);
const DEFAULT_SCALE = Object.freeze([1, 1, 1]);
const DEFAULT_CYLINDER_RADIUS = 1;
const DEFAULT_CYLINDER_HEIGHT = 2;
const DEFAULT_CYLINDER_SEGMENTS = 24;

const BOX_VERTEX_LAYOUT = Object.freeze([
    Object.freeze({ key: 'lbb', sign: Object.freeze([-1, -1, -1]) }),
    Object.freeze({ key: 'rbb', sign: Object.freeze([1, -1, -1]) }),
    Object.freeze({ key: 'rtb', sign: Object.freeze([1, 1, -1]) }),
    Object.freeze({ key: 'ltb', sign: Object.freeze([-1, 1, -1]) }),
    Object.freeze({ key: 'lbf', sign: Object.freeze([-1, -1, 1]) }),
    Object.freeze({ key: 'rbf', sign: Object.freeze([1, -1, 1]) }),
    Object.freeze({ key: 'rtf', sign: Object.freeze([1, 1, 1]) }),
    Object.freeze({ key: 'ltf', sign: Object.freeze([-1, 1, 1]) })
]);

const BOX_FACES = Object.freeze([
    Object.freeze({ name: 'front', vertices: Object.freeze(['lbf', 'rbf', 'rtf', 'ltf']) }),
    Object.freeze({ name: 'back', vertices: Object.freeze(['rbb', 'lbb', 'ltb', 'rtb']) }),
    Object.freeze({ name: 'left', vertices: Object.freeze(['lbb', 'lbf', 'ltf', 'ltb']) }),
    Object.freeze({ name: 'right', vertices: Object.freeze(['rbb', 'rtb', 'rtf', 'rbf']) }),
    Object.freeze({ name: 'top', vertices: Object.freeze(['ltb', 'ltf', 'rtf', 'rtb']) }),
    Object.freeze({ name: 'bottom', vertices: Object.freeze(['lbb', 'rbb', 'rbf', 'lbf']) })
]);

const OPERATION_TYPE = Object.freeze({
    EXTRUDE_FACE: 'extrude_face'
});

function assertObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`[SemanticMeshCompiler] ${label} must be an object.`);
    }
    return value;
}

function assertString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`[SemanticMeshCompiler] ${label} must be a non-empty string.`);
    }
    return value.trim();
}

function assertFiniteNumber(value, label) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        throw new Error(`[SemanticMeshCompiler] ${label} must be a finite number.`);
    }
    return num;
}

function assertPositiveNumber(value, label) {
    const num = assertFiniteNumber(value, label);
    if (num <= 0) {
        throw new Error(`[SemanticMeshCompiler] ${label} must be > 0.`);
    }
    return num;
}

function assertIntegerInRange(value, label, min, max) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) {
        throw new Error(`[SemanticMeshCompiler] ${label} must be an integer in [${min}, ${max}].`);
    }
    return num;
}

function splitHierarchyPath(id) {
    return String(id ?? '').split(/[./:]/).map((segment) => segment.trim()).filter(Boolean);
}

function assertHierarchicalId(value, label, minSegments = 2) {
    const id = assertString(value, label);
    if (splitHierarchyPath(id).length < minSegments) {
        throw new Error(`[SemanticMeshCompiler] ${label} must be hierarchical with >= ${minSegments} segments.`);
    }
    return id;
}

function sanitizeVec3(value, label, fallback = DEFAULT_CENTER, { strictlyPositive = false } = {}) {
    if (value === undefined || value === null) return [...fallback];
    if (!Array.isArray(value) || value.length !== 3) {
        throw new Error(`[SemanticMeshCompiler] ${label} must be [x,y,z].`);
    }
    const out = [
        assertFiniteNumber(value[0], `${label}[0]`),
        assertFiniteNumber(value[1], `${label}[1]`),
        assertFiniteNumber(value[2], `${label}[2]`)
    ];
    if (strictlyPositive && out.some((v) => v <= 0)) {
        throw new Error(`[SemanticMeshCompiler] ${label} values must be > 0.`);
    }
    return out;
}

function freezeVec3(value) {
    return Object.freeze([value[0], value[1], value[2]]);
}

function freezeTableRows(rows) {
    return Object.freeze(rows.map((row) => Object.freeze([...row])));
}

function pad3(value) {
    return String(Math.max(0, value | 0)).padStart(3, '0');
}

function pairKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function resolveBoxPrimitiveCenter(primitive, size) {
    if (primitive?.center === undefined || primitive?.center === null) {
        return [0, size[1] * 0.5, 0];
    }
    return sanitizeVec3(primitive.center, 'component.primitive.center', DEFAULT_CENTER);
}

function resolveCylinderPrimitiveCenter(primitive, height) {
    if (primitive?.center === undefined || primitive?.center === null) {
        return [0, height * 0.5, 0];
    }
    return sanitizeVec3(primitive.center, 'component.primitive.center', DEFAULT_CENTER);
}

function composeFaceId(componentPath, faceName) {
    return `${componentPath}.face.seed.${faceName}`;
}

function composeVertexId(componentPath, vertexName) {
    return `${componentPath}.vertex.seed.${vertexName}`;
}

function composeSeedEdgeId(componentPath, aName, bName) {
    const a = String(aName);
    const b = String(bName);
    return a < b
        ? `${componentPath}.edge.seed.${a}_${b}`
        : `${componentPath}.edge.seed.${b}_${a}`;
}

function sanitizeFaceAliases(value, label) {
    if (value === undefined || value === null) return new Map();
    const table = assertObject(value, label);
    const out = new Map();
    const aliasToCanonical = new Map();
    for (const [rawCanonical, rawAlias] of Object.entries(table)) {
        const canonical = assertString(rawCanonical, `${label} key`);
        const alias = assertString(rawAlias, `${label}.${canonical}`);
        if (out.has(canonical)) {
            throw new Error(`[SemanticMeshCompiler] Duplicate face alias key "${canonical}" in ${label}.`);
        }
        const existingCanonical = aliasToCanonical.get(alias);
        if (existingCanonical) {
            throw new Error(
                `[SemanticMeshCompiler] Face alias "${alias}" in ${label} collides between "${existingCanonical}" and "${canonical}".`
            );
        }
        out.set(canonical, alias);
        aliasToCanonical.set(alias, canonical);
    }
    return out;
}

function resolveFaceLabel(faceAliasesByCanonical, canonicalLabel) {
    const canonical = assertString(canonicalLabel, 'face.canonicalLabel');
    if (faceAliasesByCanonical?.has(canonical)) {
        return faceAliasesByCanonical.get(canonical);
    }
    return canonical;
}

function ensureUniqueId(state, id, label) {
    if (state.usedIds.has(id)) {
        throw new Error(`[SemanticMeshCompiler] Duplicate ${label} id "${id}".`);
    }
    state.usedIds.add(id);
}

function getVertexRecord(state, vertexId, label) {
    const vertex = state.vertexById.get(vertexId);
    if (!vertex) throw new Error(`[SemanticMeshCompiler] Missing vertex "${vertexId}" in ${label}.`);
    return vertex;
}

function addVertex(state, { id, position, name }) {
    const vertexId = assertHierarchicalId(id, 'vertex.id', 3);
    ensureUniqueId(state, vertexId, 'vertex');
    const record = Object.freeze({
        id: vertexId,
        name: assertString(name, 'vertex.name'),
        position: freezeVec3(position)
    });
    state.vertices.push(record);
    state.vertexById.set(record.id, record);
    state.vertexNameById.set(record.id, record.name);
    return record;
}

function addFace(state, { id, vertexIds, label, canonicalLabel = null }) {
    const faceId = assertHierarchicalId(id, 'face.id', 3);
    ensureUniqueId(state, faceId, 'face');
    if (!Array.isArray(vertexIds) || vertexIds.length < 3) {
        throw new Error('[SemanticMeshCompiler] face.vertexIds must contain at least 3 entries.');
    }
    const ring = vertexIds.map((vertexId, i) => {
        const idValue = assertString(vertexId, `face.vertexIds[${i}]`);
        getVertexRecord(state, idValue, `face "${faceId}"`);
        return idValue;
    });
    const canonicalLabelSafe = assertString(
        canonicalLabel ?? label,
        'face.canonicalLabel'
    );
    const authoredLabel = assertString(label, 'face.label');
    const existingFaceForLabel = state.faceByLabel.get(authoredLabel);
    if (existingFaceForLabel) {
        throw new Error(
            `[SemanticMeshCompiler] Duplicate face label "${authoredLabel}" between "${existingFaceForLabel.id}" and "${faceId}".`
        );
    }
    const face = Object.freeze({
        id: faceId,
        label: authoredLabel,
        canonicalLabel: canonicalLabelSafe,
        vertexIds: Object.freeze(ring)
    });
    state.faces.push(face);
    state.faceById.set(face.id, face);
    state.faceLabelById.set(face.id, face.label);
    state.faceByLabel.set(face.label, face);
    return face;
}

function ensureEdge(state, aId, bId, preferredId = null) {
    const key = pairKey(aId, bId);
    const existing = state.edgeByPair.get(key);
    if (existing) return existing;

    const edgeId = preferredId
        ? assertHierarchicalId(preferredId, 'edge.id', 3)
        : `${state.componentPath}.edge.derived.r0.e${pad3(state.fallbackEdgeSerial++)}`;
    ensureUniqueId(state, edgeId, 'edge');
    const edge = Object.freeze({
        id: edgeId,
        vertexIds: Object.freeze([aId, bId])
    });
    state.edges.push(edge);
    state.edgeByPair.set(key, edge);
    return edge;
}

function computeFaceNormal(state, face) {
    if (!face || !Array.isArray(face.vertexIds) || face.vertexIds.length < 3) {
        throw new Error('[SemanticMeshCompiler] Face normal requires at least 3 vertices.');
    }
    const a = getVertexRecord(state, face.vertexIds[0], `face "${face.id}"`).position;
    const b = getVertexRecord(state, face.vertexIds[1], `face "${face.id}"`).position;
    const c = getVertexRecord(state, face.vertexIds[2], `face "${face.id}"`).position;

    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [
        (ab[1] * ac[2]) - (ab[2] * ac[1]),
        (ab[2] * ac[0]) - (ab[0] * ac[2]),
        (ab[0] * ac[1]) - (ab[1] * ac[0])
    ];
    const len = Math.hypot(normal[0], normal[1], normal[2]);
    if (!Number.isFinite(len) || len <= 1e-8) {
        throw new Error(`[SemanticMeshCompiler] Face "${face.id}" has degenerate normal.`);
    }
    return [normal[0] / len, normal[1] / len, normal[2] / len];
}

function createBoxSeedState(componentPath, primitive, {
    faceAliasesByCanonical = new Map()
} = {}) {
    const size = sanitizeVec3(primitive.size ?? primitive.dimensions, 'component.primitive.size', DEFAULT_SIZE, { strictlyPositive: true });
    const center = resolveBoxPrimitiveCenter(primitive, size);
    const half = [size[0] * 0.5, size[1] * 0.5, size[2] * 0.5];

    const state = {
        componentPath,
        vertices: [],
        edges: [],
        faces: [],
        vertexById: new Map(),
        vertexNameById: new Map(),
        edgeByPair: new Map(),
        faceById: new Map(),
        faceLabelById: new Map(),
        faceByLabel: new Map(),
        usedIds: new Set(),
        fallbackEdgeSerial: 0,
        opLog: []
    };

    const vertexIdByName = new Map();
    for (const layout of BOX_VERTEX_LAYOUT) {
        const id = composeVertexId(componentPath, layout.key);
        const position = [
            center[0] + (layout.sign[0] * half[0]),
            center[1] + (layout.sign[1] * half[1]),
            center[2] + (layout.sign[2] * half[2])
        ];
        addVertex(state, {
            id,
            position,
            name: layout.key
        });
        vertexIdByName.set(layout.key, id);
    }

    const seedFaceIds = {};
    for (const faceDef of BOX_FACES) {
        const faceId = composeFaceId(componentPath, faceDef.name);
        const ring = faceDef.vertices.map((name) => {
            const id = vertexIdByName.get(name);
            if (!id) throw new Error(`[SemanticMeshCompiler] Missing seed vertex "${name}".`);
            return id;
        });
        addFace(state, {
            id: faceId,
            label: resolveFaceLabel(faceAliasesByCanonical, faceDef.name),
            canonicalLabel: faceDef.name,
            vertexIds: ring
        });
        seedFaceIds[faceDef.name] = faceId;
    }

    for (const face of state.faces) {
        const ring = face.vertexIds;
        for (let i = 0; i < ring.length; i++) {
            const aId = ring[i];
            const bId = ring[(i + 1) % ring.length];
            const aName = state.vertexNameById.get(aId) ?? `v${pad3(i)}`;
            const bName = state.vertexNameById.get(bId) ?? `v${pad3(i + 1)}`;
            ensureEdge(state, aId, bId, composeSeedEdgeId(componentPath, aName, bName));
        }
    }

    state.seedFaceIds = Object.freeze({ ...seedFaceIds });
    return state;
}

function createCylinderSeedState(componentPath, primitive, {
    faceAliasesByCanonical = new Map()
} = {}) {
    const radiusUniform = primitive.radius;
    const radiusTopRaw = primitive.radiusTop ?? primitive.topRadius ?? radiusUniform ?? DEFAULT_CYLINDER_RADIUS;
    const radiusBottomRaw = primitive.radiusBottom ?? primitive.bottomRadius ?? radiusUniform ?? DEFAULT_CYLINDER_RADIUS;
    const radiusTop = assertPositiveNumber(radiusTopRaw, 'component.primitive.radiusTop');
    const radiusBottom = assertPositiveNumber(radiusBottomRaw, 'component.primitive.radiusBottom');
    const height = assertPositiveNumber(
        primitive.height ?? primitive.size?.[1] ?? DEFAULT_CYLINDER_HEIGHT,
        'component.primitive.height'
    );
    const radialSegments = assertIntegerInRange(
        primitive.radialSegments ?? primitive.segments ?? DEFAULT_CYLINDER_SEGMENTS,
        'component.primitive.radialSegments',
        3,
        256
    );
    const center = resolveCylinderPrimitiveCenter(primitive, height);
    const halfY = height * 0.5;
    const tau = Math.PI * 2;

    const state = {
        componentPath,
        vertices: [],
        edges: [],
        faces: [],
        vertexById: new Map(),
        vertexNameById: new Map(),
        edgeByPair: new Map(),
        faceById: new Map(),
        faceLabelById: new Map(),
        faceByLabel: new Map(),
        usedIds: new Set(),
        fallbackEdgeSerial: 0,
        opLog: []
    };

    const topIds = new Array(radialSegments);
    const bottomIds = new Array(radialSegments);
    for (let i = 0; i < radialSegments; i++) {
        const t = (i / radialSegments) * tau;
        const c = Math.cos(t);
        const s = Math.sin(t);

        const topName = `top.s${pad3(i)}`;
        const bottomName = `bottom.s${pad3(i)}`;
        const topId = composeVertexId(componentPath, topName);
        const bottomId = composeVertexId(componentPath, bottomName);

        addVertex(state, {
            id: topId,
            position: [
                center[0] + (c * radiusTop),
                center[1] + halfY,
                center[2] + (s * radiusTop)
            ],
            name: topName
        });
        addVertex(state, {
            id: bottomId,
            position: [
                center[0] + (c * radiusBottom),
                center[1] - halfY,
                center[2] + (s * radiusBottom)
            ],
            name: bottomName
        });

        topIds[i] = topId;
        bottomIds[i] = bottomId;
    }

    for (let i = 0; i < radialSegments; i++) {
        const next = (i + 1) % radialSegments;
        ensureEdge(
            state,
            topIds[i],
            topIds[next],
            `${componentPath}.edge.seed.ring_top.s${pad3(i)}`
        );
        ensureEdge(
            state,
            bottomIds[i],
            bottomIds[next],
            `${componentPath}.edge.seed.ring_bottom.s${pad3(i)}`
        );
        ensureEdge(
            state,
            topIds[i],
            bottomIds[i],
            `${componentPath}.edge.seed.column.s${pad3(i)}`
        );

        const sideCanonical = `side.s${pad3(i)}`;
        addFace(state, {
            id: composeFaceId(componentPath, sideCanonical),
            label: resolveFaceLabel(faceAliasesByCanonical, sideCanonical),
            canonicalLabel: sideCanonical,
            vertexIds: [bottomIds[i], topIds[i], topIds[next], bottomIds[next]]
        });
    }

    addFace(state, {
        id: composeFaceId(componentPath, 'top'),
        label: resolveFaceLabel(faceAliasesByCanonical, 'top'),
        canonicalLabel: 'top',
        vertexIds: [...topIds].reverse()
    });
    addFace(state, {
        id: composeFaceId(componentPath, 'bottom'),
        label: resolveFaceLabel(faceAliasesByCanonical, 'bottom'),
        canonicalLabel: 'bottom',
        vertexIds: bottomIds
    });

    state.seedFaceIds = Object.freeze({
        sideStart: composeFaceId(componentPath, 'side.s000'),
        top: composeFaceId(componentPath, 'top'),
        bottom: composeFaceId(componentPath, 'bottom')
    });
    return state;
}

function resolveTargetFace(state, rawTargetFace) {
    const target = assertString(rawTargetFace, 'operation.targetFace');
    if (state.faceById.has(target)) return state.faceById.get(target);
    const byAuthoredLabel = state.faceByLabel.get(target);
    if (byAuthoredLabel) return byAuthoredLabel;
    for (const face of state.faces) {
        if (face.canonicalLabel === target) return face;
        if (face.label === target) return face;
        if (face.id.endsWith(`.${target}`)) return face;
    }
    throw new Error(`[SemanticMeshCompiler] Unable to resolve target face "${target}".`);
}

function applyExtrudeFace(state, operation, opIndex) {
    const opId = assertString(operation.opId ?? operation.id, `operations[${opIndex}].opId`);
    const targetFace = resolveTargetFace(state, operation.targetFace ?? operation.target ?? operation.face ?? '');
    const distance = assertFiniteNumber(operation.distance, `operations[${opIndex}].distance`);
    if (distance <= 0) {
        throw new Error(`[SemanticMeshCompiler] operations[${opIndex}].distance must be > 0.`);
    }

    const loopOrdinal = 0;
    const ringTag = `r${loopOrdinal}`;
    const normal = computeFaceNormal(state, targetFace);
    const ring = targetFace.vertexIds;

    const capVertexIds = new Array(ring.length);
    for (let i = 0; i < ring.length; i++) {
        const base = getVertexRecord(state, ring[i], `extrude ${opId}`).position;
        const id = `${state.componentPath}.vertex.op.${opId}.cap.${ringTag}.v${pad3(i)}`;
        const name = `op_${opId}_cap_${ringTag}_v${pad3(i)}`;
        capVertexIds[i] = addVertex(state, {
            id,
            name,
            position: [
                base[0] + (normal[0] * distance),
                base[1] + (normal[1] * distance),
                base[2] + (normal[2] * distance)
            ]
        }).id;
    }

    for (let i = 0; i < ring.length; i++) {
        const next = (i + 1) % ring.length;
        const baseA = ring[i];
        const baseB = ring[next];
        const capA = capVertexIds[i];
        const capB = capVertexIds[next];
        ensureEdge(state, capA, capB, `${state.componentPath}.edge.op.${opId}.cap.${ringTag}.e${pad3(i)}`);
        ensureEdge(state, baseA, capA, `${state.componentPath}.edge.op.${opId}.bridge.${ringTag}.e${pad3(i)}`);
        ensureEdge(state, baseA, baseB, null);
        const sideId = `${state.componentPath}.face.op.${opId}.side.${ringTag}.f${pad3(i)}`;
        addFace(state, {
            id: sideId,
            label: `op_${opId}_side_${ringTag}_${pad3(i)}`,
            vertexIds: [baseA, baseB, capB, capA]
        });
    }

    addFace(state, {
        id: `${state.componentPath}.face.op.${opId}.cap.${ringTag}`,
        label: `op_${opId}_cap_${ringTag}`,
        vertexIds: capVertexIds
    });

    state.opLog.push(Object.freeze({
        opId,
        type: OPERATION_TYPE.EXTRUDE_FACE,
        targetFaceId: targetFace.id,
        loopOrdinal,
        distance
    }));
}

function applyOperations(state, operationsRaw) {
    if (!Array.isArray(operationsRaw)) return;
    for (let i = 0; i < operationsRaw.length; i++) {
        const operation = assertObject(operationsRaw[i], `component.operations[${i}]`);
        const type = assertString(operation.type, `component.operations[${i}].type`);
        if (type === OPERATION_TYPE.EXTRUDE_FACE) {
            applyExtrudeFace(state, operation, i);
            continue;
        }
        throw new Error(`[SemanticMeshCompiler] Unsupported operation "${type}".`);
    }
}

function ensureFaceEdges(state) {
    for (const face of state.faces) {
        const ring = face.vertexIds;
        for (let i = 0; i < ring.length; i++) {
            const aId = ring[i];
            const bId = ring[(i + 1) % ring.length];
            ensureEdge(state, aId, bId, null);
        }
    }
}

function buildCompiledObject(state, {
    materialId,
    transform,
    primitiveType
}) {
    ensureFaceEdges(state);

    const vertexIds = state.vertices.map((vertex) => vertex.id);
    const vertices = state.vertices.map((vertex) => vertex.position);
    const vertexIndexById = new Map(vertexIds.map((id, index) => [id, index]));

    const edgeIds = state.edges.map((edge) => edge.id);
    const edges = state.edges.map((edge, index) => {
        const a = vertexIndexById.get(edge.vertexIds[0]);
        const b = vertexIndexById.get(edge.vertexIds[1]);
        if (a === undefined || b === undefined) {
            throw new Error(`[SemanticMeshCompiler] Edge "${edge.id}" references unknown vertex.`);
        }
        return Object.freeze([a, b]);
    });
    const edgeIndexById = new Map(edgeIds.map((id, index) => [id, index]));

    const faceIds = state.faces.map((face) => face.id);
    const faceLabels = state.faces.map((face) => face.label);
    const faceCanonicalLabels = state.faces.map((face) => face.canonicalLabel);
    const faces = state.faces.map((face) => Object.freeze(face.vertexIds.map((vertexId) => {
        const index = vertexIndexById.get(vertexId);
        if (index === undefined) {
            throw new Error(`[SemanticMeshCompiler] Face "${face.id}" references unknown vertex "${vertexId}".`);
        }
        return index;
    })));

    const faceEdgeIndices = state.faces.map((face) => {
        const ring = face.vertexIds;
        const out = [];
        for (let i = 0; i < ring.length; i++) {
            const aId = ring[i];
            const bId = ring[(i + 1) % ring.length];
            const edge = state.edgeByPair.get(pairKey(aId, bId));
            if (!edge) {
                throw new Error(`[SemanticMeshCompiler] Face "${face.id}" missing edge for ${aId} -> ${bId}.`);
            }
            const edgeIndex = edgeIndexById.get(edge.id);
            if (edgeIndex === undefined) {
                throw new Error(`[SemanticMeshCompiler] Edge index missing for "${edge.id}".`);
            }
            out.push(edgeIndex);
        }
        return Object.freeze(out);
    });

    return Object.freeze({
        objectId: state.componentPath,
        material: materialId,
        primitiveType,
        vertexIds: Object.freeze([...vertexIds]),
        vertices: freezeTableRows(vertices),
        edgeIds: Object.freeze([...edgeIds]),
        edges: freezeTableRows(edges),
        faceIds: Object.freeze([...faceIds]),
        faceLabels: Object.freeze([...faceLabels]),
        faceCanonicalLabels: Object.freeze([...faceCanonicalLabels]),
        faces: freezeTableRows(faces),
        faceEdgeIndices: freezeTableRows(faceEdgeIndices),
        transform: Object.freeze({
            position: freezeVec3(transform.position),
            rotation: freezeVec3(transform.rotation),
            scale: freezeVec3(transform.scale)
        }),
        seedFaceIds: state.seedFaceIds ?? Object.freeze({}),
        operationLineage: Object.freeze([...state.opLog])
    });
}

function parseComponent(rawComponent, componentIndex, materialsById) {
    const component = assertObject(rawComponent, `authoring.components[${componentIndex}]`);
    const componentPath = assertHierarchicalId(
        component.path ?? component.id,
        `authoring.components[${componentIndex}].path`,
        2
    );
    const materialId = assertString(
        component.material,
        `authoring.components[${componentIndex}].material`
    );
    if (materialsById && !materialsById.has(materialId)) {
        throw new Error(`[SemanticMeshCompiler] component "${componentPath}" references unknown material "${materialId}".`);
    }
    const primitive = assertObject(
        component.primitive,
        `authoring.components[${componentIndex}].primitive`
    );
    const faceAliasesByCanonical = new Map([
        ...sanitizeFaceAliases(component.faceAliases, `authoring.components[${componentIndex}].faceAliases`).entries(),
        ...sanitizeFaceAliases(primitive.faceAliases, `authoring.components[${componentIndex}].primitive.faceAliases`).entries()
    ]);
    const primitiveType = assertString(
        primitive.type,
        `authoring.components[${componentIndex}].primitive.type`
    );
    if (primitiveType !== 'box' && primitiveType !== 'cylinder') {
        throw new Error(`[SemanticMeshCompiler] Unsupported primitive type "${primitiveType}".`);
    }
    const transformRaw = assertObject(
        component.transform ?? {},
        `authoring.components[${componentIndex}].transform`
    );
    const transform = Object.freeze({
        position: sanitizeVec3(transformRaw.position, `authoring.components[${componentIndex}].transform.position`, DEFAULT_POSITION),
        rotation: sanitizeVec3(transformRaw.rotation, `authoring.components[${componentIndex}].transform.rotation`, DEFAULT_ROTATION),
        scale: sanitizeVec3(transformRaw.scale, `authoring.components[${componentIndex}].transform.scale`, DEFAULT_SCALE, { strictlyPositive: true })
    });

    const state = primitiveType === 'box'
        ? createBoxSeedState(componentPath, primitive, { faceAliasesByCanonical })
        : createCylinderSeedState(componentPath, primitive, { faceAliasesByCanonical });
    applyOperations(state, component.operations ?? []);

    return buildCompiledObject(state, {
        materialId,
        transform,
        primitiveType
    });
}

export function compileSemanticAuthoringDocument(rawAuthoring, {
    materialsById = null
} = {}) {
    const authoring = assertObject(rawAuthoring, 'authoring');
    const version = assertString(authoring.version, 'authoring.version');
    if (version !== MESH_SEMANTIC_AUTHORING_VERSION) {
        throw new Error(
            `[SemanticMeshCompiler] Unsupported authoring.version "${version}". Expected "${MESH_SEMANTIC_AUTHORING_VERSION}".`
        );
    }
    if (!Array.isArray(authoring.components) || authoring.components.length < 1) {
        throw new Error('[SemanticMeshCompiler] authoring.components must contain at least one component.');
    }

    const objects = authoring.components.map((component, index) => parseComponent(component, index, materialsById));

    return Object.freeze({
        version: MESH_COMPILED_TOPOLOGY_VERSION,
        source: Object.freeze({
            layer: 'semantic-authoring',
            version: MESH_SEMANTIC_AUTHORING_VERSION
        }),
        idPolicy: Object.freeze({
            topologyChangePolicy: TOPOLOGY_CHANGE_POLICY,
            extrusionCapIdentity: EXTRUSION_CAP_ID_POLICY,
            ambiguousLoopFallback: AMBIGUOUS_LOOP_ID_FALLBACK
        }),
        objects: Object.freeze(objects)
    });
}
