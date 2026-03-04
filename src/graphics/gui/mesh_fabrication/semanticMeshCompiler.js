// src/graphics/gui/mesh_fabrication/semanticMeshCompiler.js
// Deterministic semantic-authoring compiler for compact compiled topology payloads.
import {
    compileBoxPrimitiveSeedState,
    compileCylinderPrimitiveSeedState,
    compileTubePrimitiveSeedState,
    createPrimitiveCompilerRegistry
} from './primitives/index.js';

export const MESH_SEMANTIC_AUTHORING_VERSION = 'mesh-semantic-authoring.v1';
export const MESH_COMPILED_TOPOLOGY_VERSION = 'mesh-fabrication-compiled.v1';
export const TOPOLOGY_CHANGE_POLICY = 'preserve_unaffected_create_new_never_recycle';
export const EXTRUSION_CAP_ID_POLICY = 'always_new_derived_cap_id';
export const AMBIGUOUS_LOOP_ID_FALLBACK = 'ring_ordinal';
export const MESH_PARAMETRIC_GRID_CONTRACT_VERSION = 'mesh-parametric-grid.v1';
export const PARAMETRIC_CANONICAL_ID_DERIVATION = 'uv_index_path';
export const PARAMETRIC_INDEX_SPACE = 'u_ccw_from_seam__v_top_to_bottom';
export const PARAMETRIC_RETESSELLATION_POLICY = TOPOLOGY_CHANGE_POLICY;
export const PARAMETRIC_FAMILY_ADAPTERS = Object.freeze({
    cylinder: Object.freeze({
        family: 'cylinder',
        executable: true,
        uSegmentsAlias: Object.freeze(['uSegments', 'radialSegments', 'segments']),
        vSegmentsAlias: Object.freeze(['vSegments', 'axialSegments']),
        uSeamAlias: Object.freeze(['uSeam', 'seamAngle']),
        defaults: Object.freeze({
            uClosed: true,
            vClosed: false
        }),
        extensions: Object.freeze([
            'capRings',
            'syncOppositeCap',
            'topCapRings',
            'bottomCapRings',
            'capCenterFill',
            'topCapCenterFill',
            'bottomCapCenterFill'
        ])
    }),
    tube: Object.freeze({
        family: 'tube',
        executable: true,
        uSegmentsAlias: Object.freeze(['uSegments', 'radialSegments', 'segments']),
        vSegmentsAlias: Object.freeze(['vSegments', 'axialSegments']),
        uSeamAlias: Object.freeze(['uSeam', 'seamAngle']),
        defaults: Object.freeze({
            uClosed: true,
            vClosed: false
        }),
        extensions: Object.freeze([])
    }),
    revolve: Object.freeze({
        family: 'revolve',
        executable: false,
        uSegmentsAlias: Object.freeze(['uSegments', 'radialSegments']),
        vSegmentsAlias: Object.freeze(['vSegments', 'profileSegments']),
        uSeamAlias: Object.freeze(['uSeam', 'seamAngle'])
    }),
    sweep: Object.freeze({
        family: 'sweep',
        executable: false,
        uSegmentsAlias: Object.freeze(['uSegments', 'pathSegments']),
        vSegmentsAlias: Object.freeze(['vSegments', 'profileSegments']),
        uSeamAlias: Object.freeze(['uSeam'])
    })
});

const DEFAULT_CENTER = Object.freeze([0, 0, 0]);
const DEFAULT_SIZE = Object.freeze([2, 1, 2]);
const DEFAULT_POSITION = Object.freeze([0, 0, 0]);
const DEFAULT_ROTATION = Object.freeze([0, 0, 0]);
const DEFAULT_SCALE = Object.freeze([1, 1, 1]);
const DEFAULT_CYLINDER_RADIUS = 1;
const DEFAULT_CYLINDER_HEIGHT = 2;
const DEFAULT_CYLINDER_U_SEGMENTS = 24;
const DEFAULT_CYLINDER_V_SEGMENTS = 1;
const DEFAULT_TUBE_INNER_RADIUS_RATIO = 0.5;
const DEFAULT_GRID_U_SEAM = 0;
const DEFAULT_CAP_RINGS = 0;
const CYLINDER_CAP_CENTER_FILL = Object.freeze({
    NGON: 'ngon',
    TRI_FAN: 'tri_fan'
});
const DEFAULT_CAP_CENTER_FILL = CYLINDER_CAP_CENTER_FILL.NGON;

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

const PRIMITIVE_COMPILER_REGISTRY = createPrimitiveCompilerRegistry({
    box: ({ componentPath, primitive, faceAliasesByCanonical }) => compileBoxPrimitiveSeedState({
        componentPath,
        primitive,
        faceAliasesByCanonical,
        compileSeedState: createBoxSeedState
    }),
    cylinder: ({ componentPath, primitive, faceAliasesByCanonical }) => compileCylinderPrimitiveSeedState({
        componentPath,
        primitive,
        faceAliasesByCanonical,
        compileSeedState: createCylinderSeedState
    }),
    tube: ({ componentPath, primitive, faceAliasesByCanonical }) => compileTubePrimitiveSeedState({
        componentPath,
        primitive,
        faceAliasesByCanonical,
        compileSeedState: createTubeSeedState
    })
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

function assertBoolean(value, label) {
    if (typeof value !== 'boolean') {
        throw new Error(`[SemanticMeshCompiler] ${label} must be boolean.`);
    }
    return value;
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

function normalizeSeamAngle(value, label) {
    const angle = assertFiniteNumber(value, label);
    const tau = Math.PI * 2;
    if (!Number.isFinite(angle)) return 0;
    let normalized = angle % tau;
    if (normalized < 0) normalized += tau;
    return normalized;
}

function normalizeCylinderCapCenterFill(value, label) {
    const normalized = assertString(value, label).toLowerCase();
    if (normalized === CYLINDER_CAP_CENTER_FILL.NGON || normalized === CYLINDER_CAP_CENTER_FILL.TRI_FAN) {
        return normalized;
    }
    throw new Error(
        `[SemanticMeshCompiler] ${label} must be "${CYLINDER_CAP_CENTER_FILL.NGON}" or "${CYLINDER_CAP_CENTER_FILL.TRI_FAN}".`
    );
}

function createSeedState(componentPath) {
    return {
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
        opLog: [],
        parametric: null
    };
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

function resolveTubePrimitiveCenter(primitive, height) {
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

    const state = createSeedState(componentPath);

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

function getFirstDefined(source, keys) {
    if (!source || typeof source !== 'object') return undefined;
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined && source[key] !== null) {
            return source[key];
        }
    }
    return undefined;
}

function resolveCylinderParametricSpec(primitive) {
    const adapter = PARAMETRIC_FAMILY_ADAPTERS.cylinder;
    const uSegments = assertIntegerInRange(
        getFirstDefined(primitive, adapter.uSegmentsAlias) ?? DEFAULT_CYLINDER_U_SEGMENTS,
        'component.primitive.uSegments',
        3,
        256
    );
    const vSegments = assertIntegerInRange(
        getFirstDefined(primitive, adapter.vSegmentsAlias) ?? DEFAULT_CYLINDER_V_SEGMENTS,
        'component.primitive.vSegments',
        1,
        128
    );

    const uClosed = primitive.uClosed === undefined
        ? adapter.defaults.uClosed
        : assertBoolean(primitive.uClosed, 'component.primitive.uClosed');
    const vClosed = primitive.vClosed === undefined
        ? adapter.defaults.vClosed
        : assertBoolean(primitive.vClosed, 'component.primitive.vClosed');
    if (!uClosed) {
        throw new Error('[SemanticMeshCompiler] component.primitive.uClosed=false is not supported for cylinder in v1.');
    }
    if (vClosed) {
        throw new Error('[SemanticMeshCompiler] component.primitive.vClosed=true is not supported for cylinder in v1.');
    }

    const uSeam = normalizeSeamAngle(
        getFirstDefined(primitive, adapter.uSeamAlias) ?? DEFAULT_GRID_U_SEAM,
        'component.primitive.uSeam'
    );

    const capRings = assertIntegerInRange(
        primitive.capRings ?? DEFAULT_CAP_RINGS,
        'component.primitive.capRings',
        0,
        64
    );
    const syncOppositeCap = primitive.syncOppositeCap === undefined
        ? true
        : assertBoolean(primitive.syncOppositeCap, 'component.primitive.syncOppositeCap');
    let topCapRings = assertIntegerInRange(
        primitive.topCapRings ?? capRings,
        'component.primitive.topCapRings',
        0,
        64
    );
    let bottomCapRings = assertIntegerInRange(
        primitive.bottomCapRings ?? (syncOppositeCap ? topCapRings : capRings),
        'component.primitive.bottomCapRings',
        0,
        64
    );
    if (syncOppositeCap) {
        if (bottomCapRings !== topCapRings) {
            throw new Error('[SemanticMeshCompiler] syncOppositeCap=true requires topCapRings and bottomCapRings to match.');
        }
        bottomCapRings = topCapRings;
    }
    const capCenterFill = normalizeCylinderCapCenterFill(
        primitive.capCenterFill ?? DEFAULT_CAP_CENTER_FILL,
        'component.primitive.capCenterFill'
    );
    const topCapCenterFill = normalizeCylinderCapCenterFill(
        primitive.topCapCenterFill ?? capCenterFill,
        'component.primitive.topCapCenterFill'
    );
    let bottomCapCenterFill = normalizeCylinderCapCenterFill(
        primitive.bottomCapCenterFill ?? (syncOppositeCap ? topCapCenterFill : capCenterFill),
        'component.primitive.bottomCapCenterFill'
    );
    if (syncOppositeCap) {
        if (bottomCapCenterFill !== topCapCenterFill) {
            throw new Error(
                '[SemanticMeshCompiler] syncOppositeCap=true requires topCapCenterFill and bottomCapCenterFill to match.'
            );
        }
        bottomCapCenterFill = topCapCenterFill;
    }

    return Object.freeze({
        uSegments,
        vSegments,
        uClosed,
        vClosed,
        uSeam,
        capRings,
        syncOppositeCap,
        topCapRings,
        bottomCapRings,
        capCenterFill,
        topCapCenterFill,
        bottomCapCenterFill,
        indexing: Object.freeze({
            uOrder: 'ascending',
            vOrder: 'top_to_bottom',
            seamOrdering: 'u0_at_uSeam'
        })
    });
}

function resolveTubeParametricSpec(primitive) {
    const adapter = PARAMETRIC_FAMILY_ADAPTERS.tube;
    const uSegments = assertIntegerInRange(
        getFirstDefined(primitive, adapter.uSegmentsAlias) ?? DEFAULT_CYLINDER_U_SEGMENTS,
        'component.primitive.uSegments',
        3,
        256
    );
    const vSegments = assertIntegerInRange(
        getFirstDefined(primitive, adapter.vSegmentsAlias) ?? DEFAULT_CYLINDER_V_SEGMENTS,
        'component.primitive.vSegments',
        1,
        128
    );

    const uClosed = primitive.uClosed === undefined
        ? adapter.defaults.uClosed
        : assertBoolean(primitive.uClosed, 'component.primitive.uClosed');
    const vClosed = primitive.vClosed === undefined
        ? adapter.defaults.vClosed
        : assertBoolean(primitive.vClosed, 'component.primitive.vClosed');
    if (!uClosed) {
        throw new Error('[SemanticMeshCompiler] component.primitive.uClosed=false is not supported for tube in v1.');
    }
    if (vClosed) {
        throw new Error('[SemanticMeshCompiler] component.primitive.vClosed=true is not supported for tube in v1.');
    }

    const uSeam = normalizeSeamAngle(
        getFirstDefined(primitive, adapter.uSeamAlias) ?? DEFAULT_GRID_U_SEAM,
        'component.primitive.uSeam'
    );

    return Object.freeze({
        uSegments,
        vSegments,
        uClosed,
        vClosed,
        uSeam,
        indexing: Object.freeze({
            uOrder: 'ascending',
            vOrder: 'top_to_bottom',
            seamOrdering: 'u0_at_uSeam'
        })
    });
}

function resolveTubePrimitiveRadii(primitive) {
    const outerRadiusUniform = assertPositiveNumber(
        primitive.outerRadius ?? DEFAULT_CYLINDER_RADIUS,
        'component.primitive.outerRadius'
    );
    const outerRadiusTop = assertPositiveNumber(
        primitive.outerRadiusTop ?? outerRadiusUniform,
        'component.primitive.outerRadiusTop'
    );
    const outerRadiusBottom = assertPositiveNumber(
        primitive.outerRadiusBottom ?? outerRadiusUniform,
        'component.primitive.outerRadiusBottom'
    );
    const innerRadiusUniformRaw = primitive.innerRadius;
    const innerRadiusTop = assertPositiveNumber(
        primitive.innerRadiusTop ?? innerRadiusUniformRaw ?? (outerRadiusTop * DEFAULT_TUBE_INNER_RADIUS_RATIO),
        'component.primitive.innerRadiusTop'
    );
    const innerRadiusBottom = assertPositiveNumber(
        primitive.innerRadiusBottom ?? innerRadiusUniformRaw ?? (outerRadiusBottom * DEFAULT_TUBE_INNER_RADIUS_RATIO),
        'component.primitive.innerRadiusBottom'
    );
    if (innerRadiusTop >= outerRadiusTop) {
        throw new Error('[SemanticMeshCompiler] component.primitive.innerRadiusTop must be < component.primitive.outerRadiusTop.');
    }
    if (innerRadiusBottom >= outerRadiusBottom) {
        throw new Error('[SemanticMeshCompiler] component.primitive.innerRadiusBottom must be < component.primitive.outerRadiusBottom.');
    }
    return Object.freeze({
        outerRadiusTop,
        outerRadiusBottom,
        innerRadiusTop,
        innerRadiusBottom
    });
}

function composeUvVertexId(componentPath, u, v) {
    return `${componentPath}.vertex.u${pad3(u)}.v${pad3(v)}`;
}

function composeUvEdgeId(componentPath, ua, va, ub, vb) {
    return `${componentPath}.edge.u${pad3(ua)}.v${pad3(va)}.to.u${pad3(ub)}.v${pad3(vb)}`;
}

function composeUvFaceId(componentPath, u, v) {
    return `${componentPath}.face.u${pad3(u)}.v${pad3(v)}`;
}

function composeCapVertexId(componentPath, side, ring, u) {
    return `${componentPath}.vertex.cap.${side}.r${pad3(ring)}.u${pad3(u)}`;
}

function composeCapRingEdgeId(componentPath, side, ring, u, nextU) {
    return `${componentPath}.edge.cap.${side}.r${pad3(ring)}.u${pad3(u)}.to.u${pad3(nextU)}`;
}

function composeCapRadialEdgeId(componentPath, side, outerRing, innerRing, u) {
    return `${componentPath}.edge.cap.${side}.r${pad3(outerRing)}.u${pad3(u)}.to.r${pad3(innerRing)}.u${pad3(u)}`;
}

function composeCapFaceId(componentPath, side, ring, u) {
    return `${componentPath}.face.cap.${side}.r${pad3(ring)}.u${pad3(u)}`;
}

function composeCapCenterVertexId(componentPath, side) {
    return `${componentPath}.vertex.cap.${side}.center`;
}

function composeCapCenterEdgeId(componentPath, side, u) {
    return `${componentPath}.edge.cap.${side}.center.u${pad3(u)}`;
}

function composeCapCenterFaceId(componentPath, side, u) {
    return `${componentPath}.face.cap.${side}.center.u${pad3(u)}`;
}

function composeTubeVertexId(componentPath, surface, u, v) {
    return `${componentPath}.vertex.${surface}.u${pad3(u)}.v${pad3(v)}`;
}

function composeTubeEdgeId(componentPath, surface, ua, va, ub, vb) {
    return `${componentPath}.edge.${surface}.u${pad3(ua)}.v${pad3(va)}.to.u${pad3(ub)}.v${pad3(vb)}`;
}

function composeTubeFaceId(componentPath, surface, u, v) {
    return `${componentPath}.face.${surface}.u${pad3(u)}.v${pad3(v)}`;
}

function composeTubeBridgeEdgeId(componentPath, ring, u) {
    return `${componentPath}.edge.${ring}.u${pad3(u)}.bridge`;
}

function composeTubeRingFaceId(componentPath, ring, u) {
    return `${componentPath}.face.${ring}.u${pad3(u)}`;
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
    const grid = resolveCylinderParametricSpec(primitive);
    const uSegments = grid.uSegments;
    const vSegments = grid.vSegments;
    const center = resolveCylinderPrimitiveCenter(primitive, height);
    const halfY = height * 0.5;
    const tau = Math.PI * 2;

    const state = createSeedState(componentPath);

    // Core parametric contract: u wraps around circumference; v goes from top (0) to bottom (vSegments).
    const sideGrid = new Array(vSegments + 1);
    for (let v = 0; v <= vSegments; v++) {
        const vT = vSegments <= 0 ? 0 : (v / vSegments);
        const y = center[1] + halfY - (vT * height);
        const radius = radiusTop + ((radiusBottom - radiusTop) * vT);
        const ring = new Array(uSegments);
        for (let u = 0; u < uSegments; u++) {
            const t = grid.uSeam + ((u / uSegments) * tau);
            const c = Math.cos(t);
            const s = Math.sin(t);
            ring[u] = addVertex(state, {
                id: composeUvVertexId(componentPath, u, v),
                position: [
                    center[0] + (c * radius),
                    y,
                    center[2] + (s * radius)
                ],
                name: `u${pad3(u)}.v${pad3(v)}`
            }).id;
        }
        sideGrid[v] = ring;
    }

    for (let v = 0; v <= vSegments; v++) {
        const ring = sideGrid[v];
        for (let u = 0; u < uSegments; u++) {
            const nextU = (u + 1) % uSegments;
            ensureEdge(
                state,
                ring[u],
                ring[nextU],
                composeUvEdgeId(componentPath, u, v, nextU, v)
            );
            if (v < vSegments) {
                ensureEdge(
                    state,
                    sideGrid[v][u],
                    sideGrid[v + 1][u],
                    composeUvEdgeId(componentPath, u, v, u, v + 1)
                );
            }
        }
    }

    const firstSideFaceId = vSegments > 0 ? composeUvFaceId(componentPath, 0, 0) : '';
    for (let v = 0; v < vSegments; v++) {
        for (let u = 0; u < uSegments; u++) {
            const nextU = (u + 1) % uSegments;
            const canonical = vSegments === 1
                ? `side.s${pad3(u)}`
                : `side.v${pad3(v)}.s${pad3(u)}`;
            addFace(state, {
                id: composeUvFaceId(componentPath, u, v),
                label: resolveFaceLabel(faceAliasesByCanonical, canonical),
                canonicalLabel: canonical,
                vertexIds: [
                    sideGrid[v + 1][u],
                    sideGrid[v][u],
                    sideGrid[v][nextU],
                    sideGrid[v + 1][nextU]
                ]
            });
        }
    }

    const createCapInnerRings = (side, ringCount, y, radiusOuter) => {
        const out = [];
        for (let ring = 1; ring <= ringCount; ring++) {
            const scale = (ringCount + 1 - ring) / (ringCount + 1);
            const radius = radiusOuter * scale;
            const ids = new Array(uSegments);
            for (let u = 0; u < uSegments; u++) {
                const t = grid.uSeam + ((u / uSegments) * tau);
                const c = Math.cos(t);
                const s = Math.sin(t);
                ids[u] = addVertex(state, {
                    id: composeCapVertexId(componentPath, side, ring, u),
                    position: [
                        center[0] + (c * radius),
                        y,
                        center[2] + (s * radius)
                    ],
                    name: `cap.${side}.r${pad3(ring)}.u${pad3(u)}`
                }).id;
            }
            out.push(ids);
        }
        return out;
    };

    const topRings = [sideGrid[0], ...createCapInnerRings('top', grid.topCapRings, center[1] + halfY, radiusTop)];
    const bottomRings = [sideGrid[vSegments], ...createCapInnerRings('bottom', grid.bottomCapRings, center[1] - halfY, radiusBottom)];

    const ensureCapEdges = (side, rings) => {
        for (let ring = 0; ring < rings.length; ring++) {
            const ringIds = rings[ring];
            for (let u = 0; u < uSegments; u++) {
                const nextU = (u + 1) % uSegments;
                ensureEdge(
                    state,
                    ringIds[u],
                    ringIds[nextU],
                    composeCapRingEdgeId(componentPath, side, ring, u, nextU)
                );
                if (ring < rings.length - 1) {
                    ensureEdge(
                        state,
                        rings[ring][u],
                        rings[ring + 1][u],
                        composeCapRadialEdgeId(componentPath, side, ring, ring + 1, u)
                    );
                }
            }
        }
    };

    ensureCapEdges('top', topRings);
    ensureCapEdges('bottom', bottomRings);

    for (let ring = 0; ring < topRings.length - 1; ring++) {
        const outer = topRings[ring];
        const inner = topRings[ring + 1];
        for (let u = 0; u < uSegments; u++) {
            const nextU = (u + 1) % uSegments;
            const canonical = `top.r${pad3(ring)}.s${pad3(u)}`;
            addFace(state, {
                id: composeCapFaceId(componentPath, 'top', ring, u),
                label: resolveFaceLabel(faceAliasesByCanonical, canonical),
                canonicalLabel: canonical,
                vertexIds: [outer[nextU], outer[u], inner[u], inner[nextU]]
            });
        }
    }

    for (let ring = 0; ring < bottomRings.length - 1; ring++) {
        const outer = bottomRings[ring];
        const inner = bottomRings[ring + 1];
        for (let u = 0; u < uSegments; u++) {
            const nextU = (u + 1) % uSegments;
            const canonical = `bottom.r${pad3(ring)}.s${pad3(u)}`;
            addFace(state, {
                id: composeCapFaceId(componentPath, 'bottom', ring, u),
                label: resolveFaceLabel(faceAliasesByCanonical, canonical),
                canonicalLabel: canonical,
                vertexIds: [outer[u], outer[nextU], inner[nextU], inner[u]]
            });
        }
    }

    const closeCapCenter = (side, rings, fillMode, y) => {
        const innerRing = rings[rings.length - 1];
        if (fillMode === CYLINDER_CAP_CENTER_FILL.NGON) {
            const faceId = composeFaceId(componentPath, side);
            addFace(state, {
                id: faceId,
                label: resolveFaceLabel(faceAliasesByCanonical, side),
                canonicalLabel: side,
                vertexIds: side === 'top' ? [...innerRing].reverse() : [...innerRing]
            });
            return faceId;
        }

        const centerVertexId = addVertex(state, {
            id: composeCapCenterVertexId(componentPath, side),
            position: [center[0], y, center[2]],
            name: `cap.${side}.center`
        }).id;
        const triIds = [];
        for (let u = 0; u < uSegments; u++) {
            const nextU = (u + 1) % uSegments;
            const canonical = `${side}.center.s${pad3(u)}`;
            const currentVertexId = innerRing[u];
            ensureEdge(
                state,
                centerVertexId,
                currentVertexId,
                composeCapCenterEdgeId(componentPath, side, u)
            );
            triIds.push(addFace(state, {
                id: composeCapCenterFaceId(componentPath, side, u),
                label: resolveFaceLabel(faceAliasesByCanonical, canonical),
                canonicalLabel: canonical,
                vertexIds: side === 'top'
                    ? [innerRing[nextU], innerRing[u], centerVertexId]
                    : [innerRing[u], innerRing[nextU], centerVertexId]
            }).id);
        }
        return triIds[0] ?? '';
    };

    const topFaceId = closeCapCenter(
        'top',
        topRings,
        grid.topCapCenterFill,
        center[1] + halfY
    );
    const bottomFaceId = closeCapCenter(
        'bottom',
        bottomRings,
        grid.bottomCapCenterFill,
        center[1] - halfY
    );

    state.parametric = Object.freeze({
        contractVersion: MESH_PARAMETRIC_GRID_CONTRACT_VERSION,
        family: 'cylinder',
        adapter: Object.freeze({
            name: 'cylinder',
            aliases: Object.freeze({
                radialSegments: 'uSegments',
                axialSegments: 'vSegments',
                seamAngle: 'uSeam'
            })
        }),
        grid: Object.freeze({
            uSegments: grid.uSegments,
            vSegments: grid.vSegments,
            uClosed: grid.uClosed,
            vClosed: grid.vClosed,
            uSeam: grid.uSeam,
            indexSpace: PARAMETRIC_INDEX_SPACE
        }),
        extensions: Object.freeze({
            capRings: grid.capRings,
            syncOppositeCap: grid.syncOppositeCap,
            topCapRings: grid.topCapRings,
            bottomCapRings: grid.bottomCapRings,
            capCenterFill: grid.capCenterFill,
            topCapCenterFill: grid.topCapCenterFill,
            bottomCapCenterFill: grid.bottomCapCenterFill
        }),
        idRules: Object.freeze({
            canonicalDerivation: PARAMETRIC_CANONICAL_ID_DERIVATION,
            retessellationPolicy: PARAMETRIC_RETESSELLATION_POLICY
        })
    });

    state.seedFaceIds = Object.freeze({
        sideStart: firstSideFaceId,
        top: topFaceId,
        bottom: bottomFaceId
    });
    return state;
}

function createTubeSeedState(componentPath, primitive, {
    faceAliasesByCanonical = new Map()
} = {}) {
    const radii = resolveTubePrimitiveRadii(primitive);
    const height = assertPositiveNumber(
        primitive.height ?? primitive.size?.[1] ?? DEFAULT_CYLINDER_HEIGHT,
        'component.primitive.height'
    );
    const grid = resolveTubeParametricSpec(primitive);
    const uSegments = grid.uSegments;
    const vSegments = grid.vSegments;
    const center = resolveTubePrimitiveCenter(primitive, height);
    const halfY = height * 0.5;
    const tau = Math.PI * 2;

    const state = createSeedState(componentPath);
    const outerGrid = new Array(vSegments + 1);
    const innerGrid = new Array(vSegments + 1);
    for (let v = 0; v <= vSegments; v++) {
        const vT = vSegments <= 0 ? 0 : (v / vSegments);
        const y = center[1] + halfY - (vT * height);
        const outerRadius = radii.outerRadiusTop + ((radii.outerRadiusBottom - radii.outerRadiusTop) * vT);
        const innerRadius = radii.innerRadiusTop + ((radii.innerRadiusBottom - radii.innerRadiusTop) * vT);
        const outerRing = new Array(uSegments);
        const innerRing = new Array(uSegments);
        for (let u = 0; u < uSegments; u++) {
            const t = grid.uSeam + ((u / uSegments) * tau);
            const c = Math.cos(t);
            const s = Math.sin(t);
            outerRing[u] = addVertex(state, {
                id: composeTubeVertexId(componentPath, 'outer', u, v),
                position: [
                    center[0] + (c * outerRadius),
                    y,
                    center[2] + (s * outerRadius)
                ],
                name: `outer.u${pad3(u)}.v${pad3(v)}`
            }).id;
            innerRing[u] = addVertex(state, {
                id: composeTubeVertexId(componentPath, 'inner', u, v),
                position: [
                    center[0] + (c * innerRadius),
                    y,
                    center[2] + (s * innerRadius)
                ],
                name: `inner.u${pad3(u)}.v${pad3(v)}`
            }).id;
        }
        outerGrid[v] = outerRing;
        innerGrid[v] = innerRing;
    }

    const ensureSurfaceEdges = (surface, surfaceGrid) => {
        for (let v = 0; v <= vSegments; v++) {
            for (let u = 0; u < uSegments; u++) {
                const nextU = (u + 1) % uSegments;
                ensureEdge(
                    state,
                    surfaceGrid[v][u],
                    surfaceGrid[v][nextU],
                    composeTubeEdgeId(componentPath, surface, u, v, nextU, v)
                );
                if (v < vSegments) {
                    ensureEdge(
                        state,
                        surfaceGrid[v][u],
                        surfaceGrid[v + 1][u],
                        composeTubeEdgeId(componentPath, surface, u, v, u, v + 1)
                    );
                }
            }
        }
    };

    ensureSurfaceEdges('outer', outerGrid);
    ensureSurfaceEdges('inner', innerGrid);

    for (let v = 0; v < vSegments; v++) {
        for (let u = 0; u < uSegments; u++) {
            const nextU = (u + 1) % uSegments;
            const outerCanonical = vSegments === 1
                ? `outer.s${pad3(u)}`
                : `outer.v${pad3(v)}.s${pad3(u)}`;
            addFace(state, {
                id: composeTubeFaceId(componentPath, 'outer', u, v),
                label: resolveFaceLabel(faceAliasesByCanonical, outerCanonical),
                canonicalLabel: outerCanonical,
                vertexIds: [
                    outerGrid[v + 1][u],
                    outerGrid[v][u],
                    outerGrid[v][nextU],
                    outerGrid[v + 1][nextU]
                ]
            });

            const innerCanonical = vSegments === 1
                ? `inner.s${pad3(u)}`
                : `inner.v${pad3(v)}.s${pad3(u)}`;
            addFace(state, {
                id: composeTubeFaceId(componentPath, 'inner', u, v),
                label: resolveFaceLabel(faceAliasesByCanonical, innerCanonical),
                canonicalLabel: innerCanonical,
                vertexIds: [
                    innerGrid[v + 1][nextU],
                    innerGrid[v][nextU],
                    innerGrid[v][u],
                    innerGrid[v + 1][u]
                ]
            });
        }
    }

    for (let u = 0; u < uSegments; u++) {
        const nextU = (u + 1) % uSegments;
        ensureEdge(
            state,
            outerGrid[0][u],
            innerGrid[0][u],
            composeTubeBridgeEdgeId(componentPath, 'top_ring', u)
        );
        ensureEdge(
            state,
            outerGrid[vSegments][u],
            innerGrid[vSegments][u],
            composeTubeBridgeEdgeId(componentPath, 'bottom_ring', u)
        );

        const topCanonical = `top_ring.s${pad3(u)}`;
        addFace(state, {
            id: composeTubeRingFaceId(componentPath, 'top_ring', u),
            label: resolveFaceLabel(faceAliasesByCanonical, topCanonical),
            canonicalLabel: topCanonical,
            vertexIds: [
                outerGrid[0][nextU],
                outerGrid[0][u],
                innerGrid[0][u],
                innerGrid[0][nextU]
            ]
        });

        const bottomCanonical = `bottom_ring.s${pad3(u)}`;
        addFace(state, {
            id: composeTubeRingFaceId(componentPath, 'bottom_ring', u),
            label: resolveFaceLabel(faceAliasesByCanonical, bottomCanonical),
            canonicalLabel: bottomCanonical,
            vertexIds: [
                outerGrid[vSegments][u],
                outerGrid[vSegments][nextU],
                innerGrid[vSegments][nextU],
                innerGrid[vSegments][u]
            ]
        });
    }

    state.parametric = Object.freeze({
        contractVersion: MESH_PARAMETRIC_GRID_CONTRACT_VERSION,
        family: 'tube',
        adapter: Object.freeze({
            name: 'tube',
            aliases: Object.freeze({
                radialSegments: 'uSegments',
                axialSegments: 'vSegments',
                seamAngle: 'uSeam'
            })
        }),
        grid: Object.freeze({
            uSegments: grid.uSegments,
            vSegments: grid.vSegments,
            uClosed: grid.uClosed,
            vClosed: grid.vClosed,
            uSeam: grid.uSeam,
            indexSpace: PARAMETRIC_INDEX_SPACE
        }),
        dimensions: Object.freeze({
            outerRadiusTop: radii.outerRadiusTop,
            outerRadiusBottom: radii.outerRadiusBottom,
            innerRadiusTop: radii.innerRadiusTop,
            innerRadiusBottom: radii.innerRadiusBottom,
            height
        }),
        idRules: Object.freeze({
            canonicalDerivation: PARAMETRIC_CANONICAL_ID_DERIVATION,
            retessellationPolicy: PARAMETRIC_RETESSELLATION_POLICY
        })
    });

    state.seedFaceIds = Object.freeze({
        outerStart: composeTubeFaceId(componentPath, 'outer', 0, 0),
        innerStart: composeTubeFaceId(componentPath, 'inner', 0, 0),
        topRingStart: composeTubeRingFaceId(componentPath, 'top_ring', 0),
        bottomRingStart: composeTubeRingFaceId(componentPath, 'bottom_ring', 0)
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
        ...(state.parametric ? { parametric: state.parametric } : {}),
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
    const familyAdapter = PARAMETRIC_FAMILY_ADAPTERS[primitiveType] ?? null;
    if (familyAdapter && !familyAdapter.executable) {
        throw new Error(
            `[SemanticMeshCompiler] Primitive type "${primitiveType}" has a declared parametric adapter but is not executable in this pass.`
        );
    }
    if (!PRIMITIVE_COMPILER_REGISTRY.has(primitiveType)) {
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

    const compilePrimitive = PRIMITIVE_COMPILER_REGISTRY.get(primitiveType);
    if (typeof compilePrimitive !== 'function') {
        throw new Error(`[SemanticMeshCompiler] Missing primitive compiler for "${primitiveType}".`);
    }
    const state = compilePrimitive({
        componentPath,
        primitive,
        faceAliasesByCanonical
    });
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
            ambiguousLoopFallback: AMBIGUOUS_LOOP_ID_FALLBACK,
            parametricGridContract: MESH_PARAMETRIC_GRID_CONTRACT_VERSION,
            parametricCanonicalDerivation: PARAMETRIC_CANONICAL_ID_DERIVATION,
            parametricIndexSpace: PARAMETRIC_INDEX_SPACE,
            retessellationPolicy: PARAMETRIC_RETESSELLATION_POLICY
        }),
        objects: Object.freeze(objects)
    });
}
