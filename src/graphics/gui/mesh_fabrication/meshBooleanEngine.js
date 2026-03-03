// src/graphics/gui/mesh_fabrication/meshBooleanEngine.js
// Deterministic mesh boolean engine for mesh-fabrication canonical runtime objects.

const EPSILON = 1e-5;
const KEY_DECIMALS = 6;

const BOOLEAN_TYPE = Object.freeze({
    UNION: 'boolean_union',
    SUBTRACT: 'boolean_subtract',
    INTERSECT: 'boolean_intersect'
});

const OUTPUT_POLICY = Object.freeze({
    REPLACE_TARGET: 'replace_target',
    NEW_OBJECT: 'new_object'
});

function assertString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`[MeshBooleanEngine] ${label} must be a non-empty string.`);
    }
    return value.trim();
}

function assertObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`[MeshBooleanEngine] ${label} must be an object.`);
    }
    return value;
}

function assertBooleanType(value) {
    const type = assertString(value, 'boolean type');
    if (type !== BOOLEAN_TYPE.UNION && type !== BOOLEAN_TYPE.SUBTRACT && type !== BOOLEAN_TYPE.INTERSECT) {
        throw new Error(`[MeshBooleanEngine] Unsupported boolean type "${type}".`);
    }
    return type;
}

function assertOutputPolicy(value) {
    const policy = value === undefined || value === null
        ? OUTPUT_POLICY.REPLACE_TARGET
        : assertString(value, 'outputPolicy');
    if (policy !== OUTPUT_POLICY.REPLACE_TARGET && policy !== OUTPUT_POLICY.NEW_OBJECT) {
        throw new Error(`[MeshBooleanEngine] Unsupported output policy "${policy}".`);
    }
    return policy;
}

function assertSubtractMode(value) {
    const mode = value === undefined || value === null
        ? 'subtract_through'
        : assertString(value, 'subtractMode');
    if (mode !== 'subtract_through' && mode !== 'subtract_clamped') {
        throw new Error(`[MeshBooleanEngine] Unsupported subtract mode "${mode}".`);
    }
    return mode;
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

function pad3(value) {
    return String(value).padStart(3, '0');
}

function sanitizeToken(value, fallback = 'x') {
    const raw = String(value ?? '').trim();
    const token = raw.replace(/[^a-zA-Z0-9._-]+/g, '_');
    return token || fallback;
}

function subVec(a, b) {
    return [
        a[0] - b[0],
        a[1] - b[1],
        a[2] - b[2]
    ];
}

function addVec(a, b) {
    return [
        a[0] + b[0],
        a[1] + b[1],
        a[2] + b[2]
    ];
}

function scaleVec(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
}

function dotVec(a, b) {
    return (a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2]);
}

function crossVec(a, b) {
    return [
        (a[1] * b[2]) - (a[2] * b[1]),
        (a[2] * b[0]) - (a[0] * b[2]),
        (a[0] * b[1]) - (a[1] * b[0])
    ];
}

function lengthVec(v) {
    return Math.hypot(v[0], v[1], v[2]);
}

function normalizeVec(v) {
    const len = lengthVec(v);
    if (len <= EPSILON) return [0, 0, 0];
    return [v[0] / len, v[1] / len, v[2] / len];
}

function polygonAreaEstimate(points) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    const origin = points[0];
    let area = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const a = subVec(points[i], origin);
        const b = subVec(points[i + 1], origin);
        area += lengthVec(crossVec(a, b)) * 0.5;
    }
    return area;
}

function buildBounds(vertices) {
    const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const v of vertices) {
        min[0] = Math.min(min[0], v[0]);
        min[1] = Math.min(min[1], v[1]);
        min[2] = Math.min(min[2], v[2]);
        max[0] = Math.max(max[0], v[0]);
        max[1] = Math.max(max[1], v[1]);
        max[2] = Math.max(max[2], v[2]);
    }
    return { min, max };
}

function boundsContained(inner, outer, epsilon = 1e-4) {
    return inner.min[0] >= (outer.min[0] + epsilon)
        && inner.min[1] >= (outer.min[1] + epsilon)
        && inner.min[2] >= (outer.min[2] + epsilon)
        && inner.max[0] <= (outer.max[0] - epsilon)
        && inner.max[1] <= (outer.max[1] - epsilon)
        && inner.max[2] <= (outer.max[2] - epsilon);
}

function arrayAlmostEqual(a, b, epsilon = 1e-6) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (Math.abs(Number(a[i]) - Number(b[i])) > epsilon) return false;
    }
    return true;
}

function isSameTransform(targetObject, toolObject) {
    return arrayAlmostEqual(targetObject.position, toolObject.position)
        && arrayAlmostEqual(targetObject.rotation, toolObject.rotation)
        && arrayAlmostEqual(targetObject.scale, toolObject.scale);
}

class BspVertex {
    constructor(pos) {
        this.pos = [Number(pos[0]), Number(pos[1]), Number(pos[2])];
    }

    clone() {
        return new BspVertex(this.pos);
    }

    interpolate(other, t) {
        return new BspVertex([
            this.pos[0] + ((other.pos[0] - this.pos[0]) * t),
            this.pos[1] + ((other.pos[1] - this.pos[1]) * t),
            this.pos[2] + ((other.pos[2] - this.pos[2]) * t)
        ]);
    }
}

class BspPlane {
    constructor(normal, w) {
        this.normal = [normal[0], normal[1], normal[2]];
        this.w = Number(w);
    }

    clone() {
        return new BspPlane(this.normal, this.w);
    }

    flip() {
        this.normal[0] = -this.normal[0];
        this.normal[1] = -this.normal[1];
        this.normal[2] = -this.normal[2];
        this.w = -this.w;
    }

    static fromPoints(a, b, c) {
        const normal = normalizeVec(crossVec(subVec(b, a), subVec(c, a)));
        return new BspPlane(normal, dotVec(normal, a));
    }

    splitPolygon(polygon, coplanarFront, coplanarBack, front, back) {
        const COPLANAR = 0;
        const FRONT = 1;
        const BACK = 2;
        const SPANNING = 3;

        let polygonType = 0;
        const types = [];

        for (let i = 0; i < polygon.vertices.length; i++) {
            const t = dotVec(this.normal, polygon.vertices[i].pos) - this.w;
            const type = t < -EPSILON ? BACK : (t > EPSILON ? FRONT : COPLANAR);
            polygonType |= type;
            types.push(type);
        }

        switch (polygonType) {
            case COPLANAR:
                if (dotVec(this.normal, polygon.plane.normal) > 0) coplanarFront.push(polygon);
                else coplanarBack.push(polygon);
                break;
            case FRONT:
                front.push(polygon);
                break;
            case BACK:
                back.push(polygon);
                break;
            case SPANNING: {
                const f = [];
                const b = [];
                for (let i = 0; i < polygon.vertices.length; i++) {
                    const j = (i + 1) % polygon.vertices.length;
                    const ti = types[i];
                    const tj = types[j];
                    const vi = polygon.vertices[i];
                    const vj = polygon.vertices[j];
                    if (ti !== BACK) f.push(vi);
                    if (ti !== FRONT) b.push(ti !== BACK ? vi.clone() : vi);
                    if ((ti | tj) === SPANNING) {
                        const direction = subVec(vj.pos, vi.pos);
                        const denom = dotVec(this.normal, direction);
                        if (Math.abs(denom) <= EPSILON) continue;
                        const t = (this.w - dotVec(this.normal, vi.pos)) / denom;
                        const v = vi.interpolate(vj, t);
                        f.push(v);
                        b.push(v.clone());
                    }
                }
                if (f.length >= 3) front.push(new BspPolygon(f, polygon.shared));
                if (b.length >= 3) back.push(new BspPolygon(b, polygon.shared));
                break;
            }
            default:
                break;
        }
    }
}

class BspPolygon {
    constructor(vertices, shared) {
        this.vertices = vertices;
        this.shared = shared && typeof shared === 'object'
            ? Object.freeze({ ...shared })
            : Object.freeze({});
        const a = vertices[0]?.pos;
        const b = vertices[1]?.pos;
        const c = vertices[2]?.pos;
        this.plane = (a && b && c)
            ? BspPlane.fromPoints(a, b, c)
            : new BspPlane([0, 1, 0], 0);
    }

    clone() {
        return new BspPolygon(this.vertices.map((v) => v.clone()), this.shared);
    }

    flip() {
        this.vertices.reverse().forEach((v) => void v);
        this.plane.flip();
    }
}

class BspNode {
    constructor(polygons = []) {
        this.plane = null;
        this.front = null;
        this.back = null;
        this.polygons = [];
        if (Array.isArray(polygons) && polygons.length > 0) {
            this.build(polygons);
        }
    }

    clone() {
        const node = new BspNode();
        node.plane = this.plane && this.plane.clone();
        node.front = this.front && this.front.clone();
        node.back = this.back && this.back.clone();
        node.polygons = this.polygons.map((p) => p.clone());
        return node;
    }

    invert() {
        for (const polygon of this.polygons) polygon.flip();
        if (this.plane) this.plane.flip();
        if (this.front) this.front.invert();
        if (this.back) this.back.invert();
        const temp = this.front;
        this.front = this.back;
        this.back = temp;
    }

    clipPolygons(polygons) {
        if (!this.plane) return polygons.slice();
        let front = [];
        let back = [];
        for (const polygon of polygons) {
            this.plane.splitPolygon(polygon, front, back, front, back);
        }
        if (this.front) front = this.front.clipPolygons(front);
        if (this.back) back = this.back.clipPolygons(back);
        else back = [];
        return front.concat(back);
    }

    clipTo(node) {
        this.polygons = node.clipPolygons(this.polygons);
        if (this.front) this.front.clipTo(node);
        if (this.back) this.back.clipTo(node);
    }

    allPolygons() {
        let polygons = this.polygons.slice();
        if (this.front) polygons = polygons.concat(this.front.allPolygons());
        if (this.back) polygons = polygons.concat(this.back.allPolygons());
        return polygons;
    }

    build(polygons) {
        if (!Array.isArray(polygons) || polygons.length < 1) return;
        if (!this.plane) this.plane = polygons[0].plane.clone();
        const front = [];
        const back = [];
        for (const polygon of polygons) {
            this.plane.splitPolygon(polygon, this.polygons, this.polygons, front, back);
        }
        if (front.length > 0) {
            if (!this.front) this.front = new BspNode();
            this.front.build(front);
        }
        if (back.length > 0) {
            if (!this.back) this.back = new BspNode();
            this.back.build(back);
        }
    }
}

function csgUnion(polygonsA, polygonsB) {
    const a = new BspNode(polygonsA.map((p) => p.clone()));
    const b = new BspNode(polygonsB.map((p) => p.clone()));
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    return a.allPolygons();
}

function csgSubtract(polygonsA, polygonsB) {
    const a = new BspNode(polygonsA.map((p) => p.clone()));
    const b = new BspNode(polygonsB.map((p) => p.clone()));
    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    a.invert();
    return a.allPolygons();
}

function csgIntersect(polygonsA, polygonsB) {
    const a = new BspNode(polygonsA.map((p) => p.clone()));
    const b = new BspNode(polygonsB.map((p) => p.clone()));
    a.invert();
    b.clipTo(a);
    b.invert();
    a.clipTo(b);
    b.clipTo(a);
    a.build(b.allPolygons());
    a.invert();
    return a.allPolygons();
}

function extractFaceSuffix(faceId) {
    const id = String(faceId ?? '').trim();
    if (!id) return 'face';
    const seedToken = '.face.seed.';
    const faceToken = '.face.';
    if (id.includes(seedToken)) return id.split(seedToken)[1];
    if (id.includes(faceToken)) return id.split(faceToken)[1];
    const parts = id.split('.');
    return parts[parts.length - 1] || 'face';
}

function deriveToolFaceTag(toolObjectId, sourceFaceId) {
    const toolName = sanitizeToken(String(toolObjectId ?? '').split('.').filter(Boolean).at(-1) || 'tool', 'tool');
    const suffix = extractFaceSuffix(sourceFaceId);
    if (suffix.startsWith('side.')) {
        const bits = suffix.split('.');
        const sideToken = sanitizeToken(bits[1] ?? bits[0] ?? 's000', 's000');
        return `${toolName}.${sideToken}`;
    }
    return `${toolName}.${sanitizeToken(suffix.replace(/\./g, '_'), 'face')}`;
}

function makeCanonicalRingTokenKey(tokens) {
    const ring = Array.isArray(tokens) ? tokens.map((token) => String(token ?? '').trim()).filter(Boolean) : [];
    if (ring.length < 3) return '';
    const forward = [];
    const backward = [];
    for (let offset = 0; offset < ring.length; offset++) {
        const f = [];
        const b = [];
        for (let i = 0; i < ring.length; i++) {
            f.push(ring[(offset + i) % ring.length]);
            const revIdx = (offset - i + ring.length) % ring.length;
            b.push(ring[revIdx]);
        }
        forward.push(f.join('|'));
        backward.push(b.join('|'));
    }
    forward.sort();
    backward.sort();
    return forward[0] < backward[0] ? forward[0] : backward[0];
}

function makeRingSignature(vertexIds) {
    return makeCanonicalRingTokenKey(vertexIds);
}

function makePointRingSignature(points) {
    if (!Array.isArray(points) || points.length < 3) return '';
    return makeCanonicalRingTokenKey(points.map((point) => vectorKey(point)));
}

function buildTargetReuseLookup(targetObject) {
    const targetVertexIdByKey = new Map();
    const targetEdgeIdByPair = new Map();
    const targetFaceSignatureById = new Map();

    for (let i = 0; i < targetObject.vertexIds.length; i++) {
        targetVertexIdByKey.set(vectorKey(targetObject.vertices[i]), targetObject.vertexIds[i]);
    }
    for (const edge of targetObject.edges) {
        const a = String(edge?.vertexIds?.[0] ?? '').trim();
        const b = String(edge?.vertexIds?.[1] ?? '').trim();
        if (!a || !b) continue;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        targetEdgeIdByPair.set(key, edge.id);
    }
    for (const face of targetObject.faces) {
        targetFaceSignatureById.set(face.id, makeRingSignature(face.vertexIds));
    }
    return {
        targetVertexIdByKey,
        targetEdgeIdByPair,
        targetFaceSignatureById
    };
}

function objectToPolygons(objectDef, sourceRole) {
    const out = [];
    const role = sourceRole === 'tool' ? 'tool' : 'target';
    for (const face of objectDef.faces) {
        const ring = Array.isArray(face?.vertexIndices) ? face.vertexIndices : [];
        if (ring.length < 3) continue;
        const vertices = ring.map((vertexIndex) => {
            const point = objectDef.vertices[vertexIndex];
            return new BspVertex(point);
        });
        if (polygonAreaEstimate(vertices.map((v) => v.pos)) <= EPSILON) continue;
        out.push(new BspPolygon(vertices, {
            sourceRole: role,
            sourceFaceId: String(face.id ?? '').trim()
        }));
    }
    return out;
}

function sortPolygonsDeterministically(polygons) {
    const roleRank = (role) => (role === 'tool' ? 1 : 0);
    const summarize = (polygon) => {
        const points = polygon.vertices.map((v) => v.pos);
        const ringSignature = makePointRingSignature(points);
        const area = polygonAreaEstimate(points);
        const centroid = [0, 0, 0];
        for (const p of points) {
            centroid[0] += p[0];
            centroid[1] += p[1];
            centroid[2] += p[2];
        }
        centroid[0] /= points.length;
        centroid[1] /= points.length;
        centroid[2] /= points.length;
        const normal = polygon.plane.normal;
        return {
            key: [
                roleRank(String(polygon.shared?.sourceRole ?? 'target')),
                String(polygon.shared?.sourceFaceId ?? ''),
                vectorKey(normal),
                formatNumber(area),
                ringSignature,
                vectorKey(centroid),
                String(points.length)
            ].join('|')
        };
    };
    return polygons
        .map((polygon) => ({ polygon, sort: summarize(polygon).key }))
        .sort((a, b) => a.sort.localeCompare(b.sort))
        .map((entry) => entry.polygon);
}

function buildFacesFromPolygons({
    polygons,
    targetId,
    toolObjectId,
    opId,
    targetObject,
    targetMaterialId
}) {
    const {
        targetVertexIdByKey,
        targetEdgeIdByPair,
        targetFaceSignatureById
    } = buildTargetReuseLookup(targetObject);
    const targetFaceById = new Map(targetObject.faces.map((face) => [face.id, face]));
    const faceLabelById = new Map(targetObject.faces.map((face) => [face.id, String(face.label ?? '').trim()]));
    const faceCanonicalLabelById = new Map(targetObject.faces.map((face) => [face.id, String(face.canonicalLabel ?? '').trim()]));

    const vertexIds = [];
    const vertices = [];
    const vertexIdByCoordKey = new Map();
    let newVertexSerial = 0;

    const getVertexInfo = (point) => {
        const key = vectorKey(point);
        const existing = vertexIdByCoordKey.get(key);
        if (existing) return existing;

        const reusedVertexId = targetVertexIdByKey.get(key) ?? null;
        const vertexId = reusedVertexId || `${targetId}.vertex.bool.${opId}.v${pad3(newVertexSerial++)}`;
        const index = vertices.length;
        vertices.push([Number(point[0]), Number(point[1]), Number(point[2])]);
        vertexIds.push(vertexId);
        const info = Object.freeze({
            key,
            vertexId,
            index,
            reused: !!reusedVertexId
        });
        vertexIdByCoordKey.set(key, info);
        return info;
    };

    const facePlans = [];
    for (const polygon of polygons) {
        const points = polygon.vertices.map((v) => v.pos);
        if (points.length < 3) continue;
        if (polygonAreaEstimate(points) <= EPSILON) continue;
        const ringInfo = points.map((point) => getVertexInfo(point));
        if (ringInfo.length < 3) continue;

        const sourceRole = String(polygon.shared?.sourceRole ?? 'target');
        const sourceFaceId = String(polygon.shared?.sourceFaceId ?? '').trim();
        const vertexIdRing = ringInfo.map((entry) => entry.vertexId);
        const signature = makeRingSignature(vertexIdRing);
        const sourceTag = extractFaceSuffix(sourceFaceId);
        const targetTag = sanitizeToken(sourceTag.replace(/\./g, '_'), 'face');
        const toolTag = deriveToolFaceTag(toolObjectId, sourceFaceId);

        facePlans.push({
            sourceRole,
            sourceFaceId,
            sourceTag,
            targetTag,
            toolTag,
            ringInfo,
            vertexIdRing,
            signature
        });
    }

    const toolCounts = new Map();
    const targetCounts = new Map();
    for (const plan of facePlans) {
        if (plan.sourceRole === 'tool') {
            toolCounts.set(plan.toolTag, (toolCounts.get(plan.toolTag) ?? 0) + 1);
        } else {
            targetCounts.set(plan.targetTag, (targetCounts.get(plan.targetTag) ?? 0) + 1);
        }
    }
    const toolSerial = new Map();
    const targetSerial = new Map();
    const usedFaceIds = new Set();

    const edgeRecords = [];
    const edgeIdByPair = new Map();
    let newEdgeSerial = 0;

    const getEdge = (aInfo, bInfo) => {
        const aId = aInfo.vertexId;
        const bId = bInfo.vertexId;
        const pairKey = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
        const existing = edgeIdByPair.get(pairKey);
        if (existing) return existing;

        const reused = targetEdgeIdByPair.get(pairKey) ?? null;
        const edgeId = reused || `${targetId}.edge.bool.${opId}.e${pad3(newEdgeSerial++)}`;
        const record = Object.freeze({
            id: edgeId,
            vertexIds: Object.freeze([aId, bId]),
            vertexIndices: Object.freeze([aInfo.index, bInfo.index])
        });
        edgeRecords.push(record);
        edgeIdByPair.set(pairKey, record);
        return record;
    };

    const faces = [];
    for (const plan of facePlans) {
        const edgeIds = [];
        const vertexIndices = plan.ringInfo.map((entry) => entry.index);
        for (let i = 0; i < plan.ringInfo.length; i++) {
            const a = plan.ringInfo[i];
            const b = plan.ringInfo[(i + 1) % plan.ringInfo.length];
            const edge = getEdge(a, b);
            edgeIds.push(edge.id);
        }

        let faceId = '';
        let label = '';
        let canonicalLabel = '';

        const canPreserveTargetFace = plan.sourceRole === 'target'
            && !!plan.sourceFaceId
            && targetFaceSignatureById.get(plan.sourceFaceId) === plan.signature
            && !usedFaceIds.has(plan.sourceFaceId);

        if (canPreserveTargetFace) {
            faceId = plan.sourceFaceId;
            label = faceLabelById.get(faceId) || '';
            canonicalLabel = faceCanonicalLabelById.get(faceId) || '';
        } else if (plan.sourceRole === 'tool') {
            const count = toolCounts.get(plan.toolTag) ?? 0;
            const serial = toolSerial.get(plan.toolTag) ?? 0;
            toolSerial.set(plan.toolTag, serial + 1);
            const suffix = count > 1 ? `.f${pad3(serial)}` : '';
            faceId = `${targetId}.face.bool.${opId}.${plan.toolTag}${suffix}`;
            label = `${plan.toolTag}${suffix}`;
            canonicalLabel = `${plan.toolTag}${suffix}`;
        } else {
            const count = targetCounts.get(plan.targetTag) ?? 0;
            const serial = targetSerial.get(plan.targetTag) ?? 0;
            targetSerial.set(plan.targetTag, serial + 1);
            const suffix = count > 1 ? `.f${pad3(serial)}` : '';
            faceId = `${targetId}.face.bool.${opId}.target.${plan.targetTag}${suffix}`;
            const sourceFace = targetFaceById.get(plan.sourceFaceId);
            label = String(sourceFace?.label ?? `target.${plan.targetTag}${suffix}`).trim();
            canonicalLabel = String(sourceFace?.canonicalLabel ?? `target.${plan.targetTag}${suffix}`).trim();
        }

        if (!faceId || usedFaceIds.has(faceId)) {
            let serial = faces.length;
            let candidate = `${targetId}.face.bool.${opId}.f${pad3(serial)}`;
            while (usedFaceIds.has(candidate)) {
                serial += 1;
                candidate = `${targetId}.face.bool.${opId}.f${pad3(serial)}`;
            }
            faceId = candidate;
            label = label || `bool_${opId}_f${pad3(serial)}`;
            canonicalLabel = canonicalLabel || `bool_${opId}_f${pad3(serial)}`;
        }
        usedFaceIds.add(faceId);

        faces.push(Object.freeze({
            id: faceId,
            vertexIds: Object.freeze(plan.vertexIdRing),
            vertexIndices: Object.freeze(vertexIndices),
            edgeIds: Object.freeze(edgeIds),
            label: label || undefined,
            canonicalLabel: canonicalLabel || undefined
        }));
    }

    const renderTriangles = [];
    for (const face of faces) {
        const ring = face.vertexIndices;
        for (let i = 1; i < ring.length - 1; i++) {
            renderTriangles.push(Object.freeze({
                id: `${face.id}.triangle.t${pad3(i - 1)}`,
                faceId: face.id,
                localIndex: i - 1,
                indices: Object.freeze([ring[0], ring[i], ring[i + 1]])
            }));
        }
    }

    return Object.freeze({
        id: targetId,
        materialId: targetMaterialId,
        vertices: Object.freeze(vertices.map((v) => Object.freeze(v))),
        vertexIds: Object.freeze(vertexIds),
        edges: Object.freeze(edgeRecords),
        faces: Object.freeze(faces),
        renderTriangles: Object.freeze(renderTriangles),
        triangles: Object.freeze(renderTriangles.map((tri) => tri.indices)),
        topologySource: 'ai-boolean'
    });
}

function validateBooleanResultTopology(resultObject) {
    const label = 'boolean result';
    if (!resultObject || typeof resultObject !== 'object') {
        throw new Error('[MeshBooleanEngine] Invalid boolean result object.');
    }

    const vertexIds = Array.isArray(resultObject.vertexIds) ? resultObject.vertexIds : [];
    const vertices = Array.isArray(resultObject.vertices) ? resultObject.vertices : [];
    const edges = Array.isArray(resultObject.edges) ? resultObject.edges : [];
    const faces = Array.isArray(resultObject.faces) ? resultObject.faces : [];
    const triangles = Array.isArray(resultObject.renderTriangles) ? resultObject.renderTriangles : [];

    if (vertexIds.length !== vertices.length) {
        throw new Error('[MeshBooleanEngine] Invalid boolean result: vertices/vertexIds length mismatch.');
    }
    if (vertexIds.length < 3 || faces.length < 1 || edges.length < 3 || triangles.length < 1) {
        throw new Error('[MeshBooleanEngine] Invalid boolean result: no closed volume produced.');
    }

    const vertexIdSet = new Set();
    const faceIdSet = new Set();
    const edgeIdSet = new Set();
    const vertexIndexById = new Map();

    for (let i = 0; i < vertexIds.length; i++) {
        const id = String(vertexIds[i] ?? '').trim();
        if (!id) throw new Error('[MeshBooleanEngine] Invalid boolean result: empty vertex id.');
        if (vertexIdSet.has(id)) throw new Error(`[MeshBooleanEngine] Invalid boolean result: duplicate vertex id "${id}".`);
        if (!isFiniteVec3(vertices[i])) throw new Error(`[MeshBooleanEngine] Invalid boolean result: non-finite vertex position for "${id}".`);
        vertexIdSet.add(id);
        vertexIndexById.set(id, i);
    }

    const edgePairToId = new Map();
    for (const edge of edges) {
        const edgeId = String(edge?.id ?? '').trim();
        if (!edgeId) throw new Error('[MeshBooleanEngine] Invalid boolean result: empty edge id.');
        if (edgeIdSet.has(edgeId)) throw new Error(`[MeshBooleanEngine] Invalid boolean result: duplicate edge id "${edgeId}".`);
        const aId = String(edge?.vertexIds?.[0] ?? '').trim();
        const bId = String(edge?.vertexIds?.[1] ?? '').trim();
        if (!vertexIndexById.has(aId) || !vertexIndexById.has(bId)) {
            throw new Error(`[MeshBooleanEngine] Invalid boolean result: edge "${edgeId}" references unknown vertex.`);
        }
        if (aId === bId) {
            throw new Error(`[MeshBooleanEngine] Invalid boolean result: edge "${edgeId}" is degenerate.`);
        }
        const pair = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
        if (edgePairToId.has(pair)) {
            throw new Error(`[MeshBooleanEngine] Invalid boolean result: duplicate edge pair for "${pair}".`);
        }
        edgePairToId.set(pair, edgeId);
        edgeIdSet.add(edgeId);
    }

    const edgeUsageByPair = new Map();
    for (const face of faces) {
        const faceId = String(face?.id ?? '').trim();
        if (!faceId) throw new Error('[MeshBooleanEngine] Invalid boolean result: empty face id.');
        if (faceIdSet.has(faceId)) throw new Error(`[MeshBooleanEngine] Invalid boolean result: duplicate face id "${faceId}".`);
        faceIdSet.add(faceId);

        const ring = Array.isArray(face?.vertexIds) ? face.vertexIds : [];
        if (ring.length < 3) {
            throw new Error(`[MeshBooleanEngine] Invalid boolean result: face "${faceId}" has < 3 vertices.`);
        }
        const ringSet = new Set();
        const facePoints = [];
        for (let i = 0; i < ring.length; i++) {
            const vertexId = String(ring[i] ?? '').trim();
            if (!vertexIndexById.has(vertexId)) {
                throw new Error(`[MeshBooleanEngine] Invalid boolean result: face "${faceId}" references unknown vertex "${vertexId}".`);
            }
            if (ringSet.has(vertexId)) {
                throw new Error(`[MeshBooleanEngine] Invalid boolean result: face "${faceId}" repeats vertex "${vertexId}".`);
            }
            ringSet.add(vertexId);
            const vi = vertexIndexById.get(vertexId);
            facePoints.push(vertices[vi]);
        }
        if (polygonAreaEstimate(facePoints) <= EPSILON) {
            throw new Error(`[MeshBooleanEngine] Invalid boolean result: face "${faceId}" is degenerate.`);
        }

        for (let i = 0; i < ring.length; i++) {
            const aId = String(ring[i] ?? '').trim();
            const bId = String(ring[(i + 1) % ring.length] ?? '').trim();
            if (!aId || !bId || aId === bId) {
                throw new Error(`[MeshBooleanEngine] Invalid boolean result: face "${faceId}" contains degenerate edge.`);
            }
            const pair = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
            const directed = `${aId}|${bId}`;
            const usage = edgeUsageByPair.get(pair) ?? { count: 0, directed: new Map() };
            usage.count += 1;
            usage.directed.set(directed, (usage.directed.get(directed) ?? 0) + 1);
            edgeUsageByPair.set(pair, usage);
        }
    }

    for (const [pair, usage] of edgeUsageByPair.entries()) {
        if (!edgePairToId.has(pair)) {
            throw new Error(`[MeshBooleanEngine] Invalid boolean result: missing edge record for "${pair}".`);
        }
        if (usage.count > 2) {
            throw new Error(
                `[MeshBooleanEngine] Invalid boolean result: non-manifold edge "${pair}" (${usage.count} face uses).`
            );
        }
        if (usage.count === 2 && usage.directed.size !== 2) {
            throw new Error(`[MeshBooleanEngine] Invalid boolean result: inconsistent winding around edge "${pair}".`);
        }
    }
    for (const pair of edgePairToId.keys()) {
        if (!edgeUsageByPair.has(pair)) {
            throw new Error(`[MeshBooleanEngine] Invalid boolean result: unreferenced edge "${pair}".`);
        }
    }

    for (const tri of triangles) {
        const idx = Array.isArray(tri?.indices) ? tri.indices : [];
        if (idx.length !== 3) {
            throw new Error(`[MeshBooleanEngine] Invalid ${label}: triangle index payload must have 3 entries.`);
        }
        const ai = Number(idx[0]);
        const bi = Number(idx[1]);
        const ci = Number(idx[2]);
        if (!Number.isInteger(ai) || !Number.isInteger(bi) || !Number.isInteger(ci)) {
            throw new Error(`[MeshBooleanEngine] Invalid ${label}: triangle indices must be integers.`);
        }
        const a = vertices[ai];
        const b = vertices[bi];
        const c = vertices[ci];
        if (!a || !b || !c) {
            throw new Error('[MeshBooleanEngine] Invalid boolean result: triangle references out-of-range vertex index.');
        }
        const ab = subVec(b, a);
        const ac = subVec(c, a);
        if (lengthVec(crossVec(ab, ac)) <= EPSILON) {
            throw new Error('[MeshBooleanEngine] Invalid boolean result: triangle is degenerate.');
        }
    }
}

function assertParsedObjectShape(objectDef, label) {
    const obj = assertObject(objectDef, label);
    assertString(obj.id, `${label}.id`);
    assertString(obj.materialId, `${label}.materialId`);
    if (!Array.isArray(obj.vertices) || !Array.isArray(obj.vertexIds) || obj.vertices.length !== obj.vertexIds.length) {
        throw new Error(`[MeshBooleanEngine] ${label} vertices/vertexIds must be parallel arrays.`);
    }
    if (!Array.isArray(obj.edges) || !Array.isArray(obj.faces)) {
        throw new Error(`[MeshBooleanEngine] ${label} edges/faces must be arrays.`);
    }
    if (!isFiniteVec3(obj.position) || !isFiniteVec3(obj.rotation) || !isFiniteVec3(obj.scale)) {
        throw new Error(`[MeshBooleanEngine] ${label} transform fields must be finite vec3 arrays.`);
    }
    return obj;
}

function collectAllObjectVertices(objectDef) {
    const out = [];
    for (const vertex of objectDef.vertices) {
        if (isFiniteVec3(vertex)) out.push([Number(vertex[0]), Number(vertex[1]), Number(vertex[2])]);
    }
    return out;
}

export function executeBooleanOperation({
    type,
    opId,
    targetObject,
    toolObject,
    outputPolicy = OUTPUT_POLICY.REPLACE_TARGET,
    resultObjectId = '',
    subtractMode = 'subtract_through',
    keepTool = false
}) {
    const booleanType = assertBooleanType(type);
    const policy = assertOutputPolicy(outputPolicy);
    const mode = assertSubtractMode(subtractMode);
    const target = assertParsedObjectShape(targetObject, 'targetObject');
    const tool = assertParsedObjectShape(toolObject, 'toolObject');
    const opToken = sanitizeToken(opId, 'bool001');

    if (target.id === tool.id) {
        throw new Error('[MeshBooleanEngine] targetObject and toolObject must be different objects.');
    }
    if (!isSameTransform(target, tool)) {
        throw new Error('[MeshBooleanEngine] Boolean requires matching target/tool transforms in this pass.');
    }

    if (booleanType === BOOLEAN_TYPE.SUBTRACT && mode === 'subtract_clamped') {
        const targetBounds = buildBounds(collectAllObjectVertices(target));
        const toolBounds = buildBounds(collectAllObjectVertices(tool));
        if (!boundsContained(toolBounds, targetBounds, 1e-4)) {
            throw new Error('[MeshBooleanEngine] subtract_clamped requires tool bounds to be fully contained inside target bounds.');
        }
    }

    const targetPolygons = objectToPolygons(target, 'target');
    const toolPolygons = objectToPolygons(tool, 'tool');
    if (targetPolygons.length < 1 || toolPolygons.length < 1) {
        throw new Error('[MeshBooleanEngine] Boolean operands must contain polygon faces.');
    }

    let resultPolygons = [];
    if (booleanType === BOOLEAN_TYPE.UNION) {
        resultPolygons = csgUnion(targetPolygons, toolPolygons);
    } else if (booleanType === BOOLEAN_TYPE.SUBTRACT) {
        resultPolygons = csgSubtract(targetPolygons, toolPolygons);
    } else {
        resultPolygons = csgIntersect(targetPolygons, toolPolygons);
    }

    const sorted = sortPolygonsDeterministically(resultPolygons);
    const outputId = policy === OUTPUT_POLICY.NEW_OBJECT
        ? assertString(resultObjectId || `${target.id}.bool.${opToken}`, 'resultObjectId')
        : target.id;
    const built = buildFacesFromPolygons({
        polygons: sorted,
        targetId: outputId,
        toolObjectId: tool.id,
        opId: opToken,
        targetObject: target,
        targetMaterialId: target.materialId
    });
    validateBooleanResultTopology(built);

    const result = Object.freeze({
        ...built,
        position: Object.freeze([...target.position]),
        rotation: Object.freeze([...target.rotation]),
        scale: Object.freeze([...target.scale])
    });

    const removedObjectIds = [];
    if (policy === OUTPUT_POLICY.REPLACE_TARGET) removedObjectIds.push(target.id);
    if (!keepTool && booleanType !== BOOLEAN_TYPE.INTERSECT) {
        removedObjectIds.push(tool.id);
    }

    return Object.freeze({
        resultObject: result,
        outputPolicy: policy,
        removedObjectIds: Object.freeze([...new Set(removedObjectIds)]),
        stats: Object.freeze({
            polygonCount: sorted.length,
            vertexCount: result.vertexIds.length,
            edgeCount: result.edges.length,
            faceCount: result.faces.length
        })
    });
}

export const BOOLEAN_ENGINE_CONTRACT = Object.freeze({
    version: 'mesh-boolean-engine.v1',
    supportedTypes: Object.freeze([BOOLEAN_TYPE.UNION, BOOLEAN_TYPE.SUBTRACT, BOOLEAN_TYPE.INTERSECT]),
    supportedSubtractModes: Object.freeze(['subtract_through', 'subtract_clamped']),
    outputPolicies: Object.freeze([OUTPUT_POLICY.REPLACE_TARGET, OUTPUT_POLICY.NEW_OBJECT]),
    transformConstraint: 'target_and_tool_transforms_must_match'
});
