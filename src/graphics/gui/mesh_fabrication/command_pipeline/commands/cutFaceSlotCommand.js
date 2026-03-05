// Cut-face-slot command module.

import { executeBooleanOperation } from '../../meshBooleanEngine.js';
import { COMMAND_TYPE } from './commandTypes.js';
import {
    assertFiniteNumber,
    assertPositiveNumber,
    assertString,
    freezeCommand,
    normalizeVec2,
    pad3,
    sanitizeToken
} from './shared/commandCommon.js';
import { applyOverrideToObject } from './shared/runtimeObjectState.js';

const CUT_FACE_SLOT_MODE = Object.freeze({
    THROUGH: 'through',
    CLAMPED: 'clamped'
});

const CUT_FACE_SLOT_ORIENTATION = Object.freeze({
    AUTO: 'auto',
    U: 'u',
    V: 'v',
    AXIAL: 'axial',
    RADIAL: 'radial',
    CIRCUMFERENTIAL: 'circumferential'
});

const CUT_FACE_SLOT_OPPOSITE_FACE_MODE = Object.freeze({
    NONE: 'none',
    PAIRED_SAME_INDEX: 'paired_same_index',
    PAIRED_MIRRORED_INDEX: 'paired_mirrored_index'
});

const CUT_FACE_SLOT_GEO_EPSILON = 1e-6;

function normalizeCutFaceSlotMode(value, label) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return CUT_FACE_SLOT_MODE.THROUGH;
    }
    const raw = assertString(value, label).toLowerCase();
    if (raw === CUT_FACE_SLOT_MODE.THROUGH || raw === 'subtract_through') {
        return CUT_FACE_SLOT_MODE.THROUGH;
    }
    if (raw === CUT_FACE_SLOT_MODE.CLAMPED || raw === 'subtract_clamped') {
        return CUT_FACE_SLOT_MODE.CLAMPED;
    }
    throw new Error(
        `[MeshCommandPipeline] ${label} must be "${CUT_FACE_SLOT_MODE.THROUGH}" or "${CUT_FACE_SLOT_MODE.CLAMPED}".`
    );
}

function normalizeCutFaceSlotOrientation(value, label) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return CUT_FACE_SLOT_ORIENTATION.AUTO;
    }
    const raw = assertString(value, label).toLowerCase();
    if (raw === CUT_FACE_SLOT_ORIENTATION.AUTO) return CUT_FACE_SLOT_ORIENTATION.AUTO;
    if (raw === CUT_FACE_SLOT_ORIENTATION.U) return CUT_FACE_SLOT_ORIENTATION.U;
    if (raw === CUT_FACE_SLOT_ORIENTATION.V) return CUT_FACE_SLOT_ORIENTATION.V;
    if (raw === CUT_FACE_SLOT_ORIENTATION.AXIAL) return CUT_FACE_SLOT_ORIENTATION.AXIAL;
    if (raw === CUT_FACE_SLOT_ORIENTATION.RADIAL) return CUT_FACE_SLOT_ORIENTATION.RADIAL;
    if (raw === CUT_FACE_SLOT_ORIENTATION.CIRCUMFERENTIAL) return CUT_FACE_SLOT_ORIENTATION.CIRCUMFERENTIAL;
    if (raw === 'tangent' || raw === 'tangential') return CUT_FACE_SLOT_ORIENTATION.CIRCUMFERENTIAL;
    throw new Error(
        `[MeshCommandPipeline] ${label} must be one of "auto", "u", "v", "axial", "radial", "circumferential".`
    );
}

function normalizeCutFaceSlotOppositeFaceMode(value, label) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return CUT_FACE_SLOT_OPPOSITE_FACE_MODE.NONE;
    }
    const raw = assertString(value, label).toLowerCase();
    if (raw === CUT_FACE_SLOT_OPPOSITE_FACE_MODE.NONE) return CUT_FACE_SLOT_OPPOSITE_FACE_MODE.NONE;
    if (raw === CUT_FACE_SLOT_OPPOSITE_FACE_MODE.PAIRED_SAME_INDEX) {
        return CUT_FACE_SLOT_OPPOSITE_FACE_MODE.PAIRED_SAME_INDEX;
    }
    if (raw === CUT_FACE_SLOT_OPPOSITE_FACE_MODE.PAIRED_MIRRORED_INDEX) {
        return CUT_FACE_SLOT_OPPOSITE_FACE_MODE.PAIRED_MIRRORED_INDEX;
    }
    throw new Error(
        `[MeshCommandPipeline] ${label} must be "none", "paired_same_index", or "paired_mirrored_index".`
    );
}

function normalizeCutFaceSlotCenter(args, label) {
    if (args.center === undefined || args.center === null) {
        return [0, 0];
    }
    if (Array.isArray(args.center)) {
        return normalizeVec2(args.center, `${label}.center`);
    }
    if (args.center && typeof args.center === 'object') {
        const u = assertFiniteNumber(args.center.u ?? args.center.x ?? 0, `${label}.center.u`);
        const v = assertFiniteNumber(args.center.v ?? args.center.y ?? 0, `${label}.center.v`);
        return [u, v];
    }
    throw new Error(`[MeshCommandPipeline] ${label}.center must be [u,v] or {u,v}.`);
}

function normalizeCutFaceSlotArgs(args, label, commandId) {
    const targetObjectId = assertString(
        args.targetObjectId ?? args.targetId ?? args.objectId,
        `${label}.targetObjectId`
    );
    const targetFace = assertString(
        args.targetFace ?? args.faceId ?? args.face ?? args.target,
        `${label}.targetFace`
    );

    const spanRaw = args.span ?? args.extent ?? args.length;
    const out = {
        targetObjectId,
        targetFace,
        center: Object.freeze(normalizeCutFaceSlotCenter(args, label)),
        width: assertPositiveNumber(args.width, `${label}.width`),
        depth: assertPositiveNumber(args.depth, `${label}.depth`),
        orientation: normalizeCutFaceSlotOrientation(args.orientation, `${label}.orientation`),
        cutMode: normalizeCutFaceSlotMode(args.cutMode ?? args.mode, `${label}.cutMode`),
        oppositeFaceMode: normalizeCutFaceSlotOppositeFaceMode(
            args.oppositeFaceMode,
            `${label}.oppositeFaceMode`
        )
    };
    if (spanRaw !== undefined && spanRaw !== null) {
        out.span = assertPositiveNumber(spanRaw, `${label}.span`);
    }
    if (args.opId !== undefined) {
        out.opId = sanitizeToken(assertString(args.opId, `${label}.opId`), commandId);
    }
    return out;
}

function add3(a, b) {
    return [
        Number(a[0]) + Number(b[0]),
        Number(a[1]) + Number(b[1]),
        Number(a[2]) + Number(b[2])
    ];
}

function sub3(a, b) {
    return [
        Number(a[0]) - Number(b[0]),
        Number(a[1]) - Number(b[1]),
        Number(a[2]) - Number(b[2])
    ];
}

function scale3(v, scalar) {
    const s = Number(scalar);
    return [
        Number(v[0]) * s,
        Number(v[1]) * s,
        Number(v[2]) * s
    ];
}

function dot3(a, b) {
    return (Number(a[0]) * Number(b[0]))
        + (Number(a[1]) * Number(b[1]))
        + (Number(a[2]) * Number(b[2]));
}

function cross3(a, b) {
    return [
        (Number(a[1]) * Number(b[2])) - (Number(a[2]) * Number(b[1])),
        (Number(a[2]) * Number(b[0])) - (Number(a[0]) * Number(b[2])),
        (Number(a[0]) * Number(b[1])) - (Number(a[1]) * Number(b[0]))
    ];
}

function length3(v) {
    return Math.hypot(Number(v[0]), Number(v[1]), Number(v[2]));
}

function normalize3(v, epsilon = CUT_FACE_SLOT_GEO_EPSILON) {
    const len = length3(v);
    if (!Number.isFinite(len) || len <= epsilon) return [0, 0, 0];
    return [
        Number(v[0]) / len,
        Number(v[1]) / len,
        Number(v[2]) / len
    ];
}

function projectVectorToPlane(vector, normal) {
    const n = normalize3(normal);
    const v = sub3(vector, scale3(n, dot3(vector, n)));
    return normalize3(v);
}

function makeFallbackOrthogonalAxis(normal) {
    const n = normalize3(normal);
    const seed = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    return normalize3(cross3(seed, n));
}

function clamp(value, minValue, maxValue) {
    return Math.min(maxValue, Math.max(minValue, value));
}

function listFaceCandidates(objectDef, predicate) {
    const out = [];
    const faces = Array.isArray(objectDef?.faces) ? objectDef.faces : [];
    for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        if (!face || typeof face !== 'object') continue;
        if (!predicate(face)) continue;
        out.push({ face, index: i });
    }
    out.sort((a, b) => {
        const indexDelta = (a.index | 0) - (b.index | 0);
        if (indexDelta !== 0) return indexDelta;
        return String(a.face.id ?? '').localeCompare(String(b.face.id ?? ''));
    });
    return out;
}

function resolveCutFaceTarget(objectDef, rawTargetFace, labelPrefix) {
    const target = assertString(rawTargetFace, `${labelPrefix}.targetFace`);
    const objectId = assertString(objectDef?.id, `${labelPrefix}.targetObjectId`);

    let matches = listFaceCandidates(objectDef, (face) => String(face.id ?? '') === target);
    if (matches.length > 0) {
        const winner = matches[0];
        return Object.freeze({
            face: winner.face,
            faceIndex: winner.index,
            resolution: 'stable_face_id',
            query: target,
            candidateCount: matches.length
        });
    }

    matches = listFaceCandidates(objectDef, (face) => String(face.canonicalLabel ?? '') === target);
    if (matches.length > 0) {
        const winner = matches[0];
        return Object.freeze({
            face: winner.face,
            faceIndex: winner.index,
            resolution: 'canonical_label',
            query: target,
            candidateCount: matches.length
        });
    }

    matches = listFaceCandidates(objectDef, (face) => String(face.label ?? '') === target);
    if (matches.length > 0) {
        const winner = matches[0];
        return Object.freeze({
            face: winner.face,
            faceIndex: winner.index,
            resolution: 'authored_alias',
            query: target,
            candidateCount: matches.length
        });
    }

    matches = listFaceCandidates(objectDef, (face) => String(face.id ?? '').endsWith(`.${target}`));
    if (matches.length > 0) {
        const winner = matches[0];
        return Object.freeze({
            face: winner.face,
            faceIndex: winner.index,
            resolution: 'id_suffix',
            query: target,
            candidateCount: matches.length
        });
    }

    throw new Error(
        `[MeshCommandPipeline] ${labelPrefix}.targetFace "${target}" could not be resolved on object "${objectId}".`
    );
}

function getFaceVertices(objectDef, face) {
    const vertices = Array.isArray(objectDef?.vertices) ? objectDef.vertices : [];
    const indices = Array.isArray(face?.vertexIndices) ? face.vertexIndices : [];
    const out = [];
    for (let i = 0; i < indices.length; i++) {
        const index = Number(indices[i]);
        const vertex = vertices[index];
        if (!Array.isArray(vertex) || vertex.length !== 3) continue;
        out.push([Number(vertex[0]), Number(vertex[1]), Number(vertex[2])]);
    }
    return out;
}

function averageVec3(points) {
    if (!Array.isArray(points) || points.length < 1) return [0, 0, 0];
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        sx += Number(p?.[0]) || 0;
        sy += Number(p?.[1]) || 0;
        sz += Number(p?.[2]) || 0;
    }
    const inv = 1 / points.length;
    return [sx * inv, sy * inv, sz * inv];
}

function computeFaceNormal(vertices) {
    if (!Array.isArray(vertices) || vertices.length < 3) return [0, 1, 0];
    const origin = vertices[0];
    let acc = [0, 0, 0];
    for (let i = 1; i < vertices.length - 1; i++) {
        const a = sub3(vertices[i], origin);
        const b = sub3(vertices[i + 1], origin);
        acc = add3(acc, cross3(a, b));
    }
    const normal = normalize3(acc);
    if (length3(normal) <= CUT_FACE_SLOT_GEO_EPSILON) return [0, 1, 0];
    return normal;
}

function computeLongestFaceEdgeDirection(vertices, fallbackNormal) {
    if (!Array.isArray(vertices) || vertices.length < 2) {
        return makeFallbackOrthogonalAxis(fallbackNormal);
    }
    let best = null;
    let bestLen = -1;
    for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        const edge = sub3(b, a);
        const projected = projectVectorToPlane(edge, fallbackNormal);
        const len = length3(projected);
        if (len > bestLen + CUT_FACE_SLOT_GEO_EPSILON) {
            best = projected;
            bestLen = len;
        }
    }
    if (!best || bestLen <= CUT_FACE_SLOT_GEO_EPSILON) {
        return makeFallbackOrthogonalAxis(fallbackNormal);
    }
    return normalize3(best);
}

function projectPointToAxis(point, axisOrigin, axisDirection) {
    const axis = normalize3(axisDirection);
    const rel = sub3(point, axisOrigin);
    const t = dot3(rel, axis);
    return Object.freeze({
        point: add3(axisOrigin, scale3(axis, t)),
        t
    });
}

function projectRadialFromAxis(point, axisOrigin, axisDirection, fallbackVector, planeNormal) {
    const projected = projectPointToAxis(point, axisOrigin, axisDirection);
    const rel = sub3(point, projected.point);
    const planar = projectVectorToPlane(rel, planeNormal);
    if (length3(planar) > CUT_FACE_SLOT_GEO_EPSILON) return planar;
    const fallbackPlanar = projectVectorToPlane(fallbackVector, planeNormal);
    if (length3(fallbackPlanar) > CUT_FACE_SLOT_GEO_EPSILON) return fallbackPlanar;
    return makeFallbackOrthogonalAxis(planeNormal);
}

function parseTubeFaceCanonicalLabel(label) {
    const text = String(label ?? '').trim();
    let match = text.match(/^(top_ring|bottom_ring)\.s(\d{3})$/);
    if (match) {
        return Object.freeze({
            family: 'ring',
            side: match[1],
            sIndex: Number(match[2]),
            vIndex: null
        });
    }
    match = text.match(/^(outer|inner)\.v(\d{3})\.s(\d{3})$/);
    if (match) {
        return Object.freeze({
            family: 'side',
            side: match[1],
            sIndex: Number(match[3]),
            vIndex: Number(match[2])
        });
    }
    match = text.match(/^(outer|inner)\.s(\d{3})$/);
    if (match) {
        return Object.freeze({
            family: 'side',
            side: match[1],
            sIndex: Number(match[2]),
            vIndex: null
        });
    }
    return null;
}

function deriveTubeAxisContext(objectDef) {
    const faces = Array.isArray(objectDef?.faces) ? objectDef.faces : [];
    const topCenters = [];
    const bottomCenters = [];
    for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        const parsed = parseTubeFaceCanonicalLabel(face?.canonicalLabel ?? face?.label ?? '');
        if (!parsed || parsed.family !== 'ring') continue;
        const vertices = getFaceVertices(objectDef, face);
        if (vertices.length < 3) continue;
        const center = averageVec3(vertices);
        if (parsed.side === 'top_ring') topCenters.push(center);
        if (parsed.side === 'bottom_ring') bottomCenters.push(center);
    }

    const objectCenter = averageVec3(Array.isArray(objectDef?.vertices) ? objectDef.vertices : []);
    if (topCenters.length > 0 && bottomCenters.length > 0) {
        const topCenter = averageVec3(topCenters);
        const bottomCenter = averageVec3(bottomCenters);
        const axis = normalize3(sub3(bottomCenter, topCenter));
        if (length3(axis) > CUT_FACE_SLOT_GEO_EPSILON) {
            return Object.freeze({
                axisOrigin: scale3(add3(topCenter, bottomCenter), 0.5),
                axisDirection: axis,
                objectCenter
            });
        }
    }

    return Object.freeze({
        axisOrigin: objectCenter,
        axisDirection: [0, 1, 0],
        objectCenter
    });
}

function computeFaceFrame(objectDef, face) {
    const vertices = getFaceVertices(objectDef, face);
    if (vertices.length < 3) {
        throw new Error('[MeshCommandPipeline] Face slot cut requires a target face with >= 3 vertices.');
    }
    const faceCenter = averageVec3(vertices);
    const normal = computeFaceNormal(vertices);
    const tubeDescriptor = parseTubeFaceCanonicalLabel(face?.canonicalLabel ?? face?.label ?? '');
    const tubeContext = tubeDescriptor ? deriveTubeAxisContext(objectDef) : null;
    const objectCenter = tubeContext?.objectCenter ?? averageVec3(Array.isArray(objectDef?.vertices) ? objectDef.vertices : []);
    const inwardNormal = dot3(normal, sub3(objectCenter, faceCenter)) >= 0
        ? [...normal]
        : scale3(normal, -1);

    let uAxis = null;
    let vAxis = null;
    let frameKind = 'generic';

    if (tubeDescriptor && tubeContext) {
        const axisDirection = tubeContext.axisDirection;
        if (tubeDescriptor.family === 'ring') {
            const radial = projectRadialFromAxis(
                faceCenter,
                tubeContext.axisOrigin,
                axisDirection,
                inwardNormal,
                normal
            );
            const circumferential = normalize3(cross3(normal, radial));
            uAxis = length3(circumferential) > CUT_FACE_SLOT_GEO_EPSILON
                ? circumferential
                : computeLongestFaceEdgeDirection(vertices, normal);
            vAxis = length3(radial) > CUT_FACE_SLOT_GEO_EPSILON
                ? normalize3(radial)
                : normalize3(cross3(normal, uAxis));
            frameKind = 'tube_ring';
        } else if (tubeDescriptor.family === 'side') {
            const axial = projectVectorToPlane(axisDirection, normal);
            const safeAxial = length3(axial) > CUT_FACE_SLOT_GEO_EPSILON
                ? axial
                : computeLongestFaceEdgeDirection(vertices, normal);
            const circumferential = normalize3(cross3(safeAxial, normal));
            uAxis = length3(circumferential) > CUT_FACE_SLOT_GEO_EPSILON
                ? circumferential
                : computeLongestFaceEdgeDirection(vertices, normal);
            vAxis = normalize3(cross3(normal, uAxis));
            if (length3(vAxis) <= CUT_FACE_SLOT_GEO_EPSILON) {
                vAxis = safeAxial;
            }
            frameKind = 'tube_side';
        }
    }

    if (!uAxis || length3(uAxis) <= CUT_FACE_SLOT_GEO_EPSILON) {
        uAxis = computeLongestFaceEdgeDirection(vertices, normal);
    }
    if (!vAxis || length3(vAxis) <= CUT_FACE_SLOT_GEO_EPSILON) {
        vAxis = normalize3(cross3(normal, uAxis));
    }
    if (length3(vAxis) <= CUT_FACE_SLOT_GEO_EPSILON) {
        vAxis = makeFallbackOrthogonalAxis(normal);
    }
    uAxis = normalize3(cross3(vAxis, normal));
    if (length3(uAxis) <= CUT_FACE_SLOT_GEO_EPSILON) {
        uAxis = computeLongestFaceEdgeDirection(vertices, normal);
    }
    vAxis = normalize3(cross3(normal, uAxis));

    let minU = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < vertices.length; i++) {
        const rel = sub3(vertices[i], faceCenter);
        const u = dot3(rel, uAxis);
        const v = dot3(rel, vAxis);
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
    }

    return Object.freeze({
        kind: frameKind,
        tubeDescriptor,
        center: faceCenter,
        normal,
        inwardNormal: normalize3(inwardNormal),
        uAxis,
        vAxis,
        extentU: Math.max(0, maxU - minU),
        extentV: Math.max(0, maxV - minV)
    });
}

function resolveSlotAxes(frame, orientation) {
    const safeOrientation = String(orientation ?? CUT_FACE_SLOT_ORIENTATION.AUTO);
    let longAxisId = 'u';
    if (frame.kind === 'tube_ring') {
        if (
            safeOrientation === CUT_FACE_SLOT_ORIENTATION.CIRCUMFERENTIAL
            || safeOrientation === CUT_FACE_SLOT_ORIENTATION.U
        ) {
            longAxisId = 'u';
        } else {
            longAxisId = 'v';
        }
    } else if (frame.kind === 'tube_side') {
        if (
            safeOrientation === CUT_FACE_SLOT_ORIENTATION.AXIAL
            || safeOrientation === CUT_FACE_SLOT_ORIENTATION.V
        ) {
            longAxisId = 'v';
        } else {
            longAxisId = 'u';
        }
    } else if (safeOrientation === CUT_FACE_SLOT_ORIENTATION.U) {
        longAxisId = 'u';
    } else if (safeOrientation === CUT_FACE_SLOT_ORIENTATION.V) {
        longAxisId = 'v';
    } else if (frame.extentV > frame.extentU) {
        longAxisId = 'v';
    }

    const wideAxisId = longAxisId === 'u' ? 'v' : 'u';
    const longAxis = longAxisId === 'u' ? frame.uAxis : frame.vAxis;
    const wideAxis = wideAxisId === 'u' ? frame.uAxis : frame.vAxis;
    return Object.freeze({
        longAxisId,
        wideAxisId,
        longAxis,
        wideAxis
    });
}

function projectObjectRangeOnAxis(objectDef, axis) {
    const vertices = Array.isArray(objectDef?.vertices) ? objectDef.vertices : [];
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < vertices.length; i++) {
        const point = vertices[i];
        const d = dot3(point, axis);
        min = Math.min(min, d);
        max = Math.max(max, d);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return Object.freeze({ min: 0, max: 0 });
    }
    return Object.freeze({ min, max });
}

function computeFaceLineage(beforeObject, afterObject) {
    const before = new Set((beforeObject?.faces ?? []).map((face) => String(face?.id ?? '')));
    const after = new Set((afterObject?.faces ?? []).map((face) => String(face?.id ?? '')));
    const created = [];
    const removed = [];
    for (const id of after) {
        if (!before.has(id)) created.push(id);
    }
    for (const id of before) {
        if (!after.has(id)) removed.push(id);
    }
    created.sort();
    removed.sort();
    return Object.freeze({
        createdFaceIds: Object.freeze(created),
        removedFaceIds: Object.freeze(removed),
        preservedFaceCount: Math.max(0, after.size - created.length)
    });
}

function createIndexedFaceObject({
    objectId,
    materialId,
    vertices,
    faces,
    position,
    rotation,
    scale
}) {
    const vertexIds = vertices.map((_, i) => `${objectId}.vertex.slot.v${pad3(i)}`);
    const edges = [];
    const edgeByPair = new Map();

    const ensureEdge = (aIndex, bIndex) => {
        const key = aIndex < bIndex ? `${aIndex}|${bIndex}` : `${bIndex}|${aIndex}`;
        const existing = edgeByPair.get(key);
        if (existing) return existing;
        const id = `${objectId}.edge.slot.e${pad3(edges.length)}`;
        edges.push(Object.freeze({
            id,
            vertexIds: Object.freeze([vertexIds[aIndex], vertexIds[bIndex]]),
            vertexIndices: Object.freeze([aIndex, bIndex])
        }));
        edgeByPair.set(key, id);
        return id;
    };

    const parsedFaces = faces.map((faceDef, faceIndex) => {
        const ring = Array.isArray(faceDef.vertexIndices) ? faceDef.vertexIndices : [];
        const edgeIds = [];
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i];
            const b = ring[(i + 1) % ring.length];
            edgeIds.push(ensureEdge(a, b));
        }
        return Object.freeze({
            id: faceDef.id ?? `${objectId}.face.slot.f${pad3(faceIndex)}`,
            vertexIds: Object.freeze(ring.map((index) => vertexIds[index])),
            vertexIndices: Object.freeze([...ring]),
            edgeIds: Object.freeze(edgeIds),
            label: faceDef.label ?? undefined,
            canonicalLabel: faceDef.canonicalLabel ?? undefined
        });
    });

    const renderTriangles = [];
    for (const face of parsedFaces) {
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
        id: objectId,
        materialId,
        vertices: Object.freeze(vertices.map((vertex) => Object.freeze([
            Number(vertex[0]) || 0,
            Number(vertex[1]) || 0,
            Number(vertex[2]) || 0
        ]))),
        vertexIds: Object.freeze(vertexIds),
        edges: Object.freeze(edges),
        faces: Object.freeze(parsedFaces),
        renderTriangles: Object.freeze(renderTriangles),
        triangles: Object.freeze(renderTriangles.map((tri) => tri.indices)),
        position: Object.freeze([...(position ?? [0, 0, 0])]),
        rotation: Object.freeze([...(rotation ?? [0, 0, 0])]),
        scale: Object.freeze([...(scale ?? [1, 1, 1])])
    });
}

function buildSlotCutterObject({
    command,
    targetObject,
    targetFace,
    resolvedFace,
    cutSerial,
    operationToken
}) {
    const frame = computeFaceFrame(targetObject, targetFace);
    const axes = resolveSlotAxes(frame, command.orientation);

    const spanDefault = Math.max(
        CUT_FACE_SLOT_GEO_EPSILON,
        (axes.longAxisId === 'u' ? frame.extentU : frame.extentV)
    );
    const widthDefault = Math.max(
        CUT_FACE_SLOT_GEO_EPSILON,
        (axes.wideAxisId === 'u' ? frame.extentU : frame.extentV)
    );
    let span = Number(command.span ?? spanDefault);
    let width = Number(command.width ?? widthDefault);
    let depth = Number(command.depth ?? CUT_FACE_SLOT_GEO_EPSILON);
    if (!Number.isFinite(span) || span <= CUT_FACE_SLOT_GEO_EPSILON) span = spanDefault;
    if (!Number.isFinite(width) || width <= CUT_FACE_SLOT_GEO_EPSILON) width = widthDefault;
    if (!Number.isFinite(depth) || depth <= CUT_FACE_SLOT_GEO_EPSILON) depth = CUT_FACE_SLOT_GEO_EPSILON;

    const centerUv = Array.isArray(command.center) ? command.center : [0, 0];
    let centerU = Number(centerUv[0]) || 0;
    let centerV = Number(centerUv[1]) || 0;

    const inward = normalize3(frame.inwardNormal);
    const projectionRange = projectObjectRangeOnAxis(targetObject, inward);
    const faceProjection = dot3(frame.center, inward);
    const depthLimit = Math.max(
        CUT_FACE_SLOT_GEO_EPSILON,
        projectionRange.max - faceProjection
    );

    const longHalfDefault = span * 0.5;
    const wideHalfDefault = width * 0.5;
    let longHalf = longHalfDefault;
    let wideHalf = wideHalfDefault;
    let depthHalf = depth * 0.5;

    if (command.cutMode === CUT_FACE_SLOT_MODE.CLAMPED) {
        const longExtent = Math.max(CUT_FACE_SLOT_GEO_EPSILON, (axes.longAxisId === 'u' ? frame.extentU : frame.extentV) * 0.5);
        const wideExtent = Math.max(CUT_FACE_SLOT_GEO_EPSILON, (axes.wideAxisId === 'u' ? frame.extentU : frame.extentV) * 0.5);
        longHalf = Math.min(longHalf, Math.max(CUT_FACE_SLOT_GEO_EPSILON, longExtent - 1e-3));
        wideHalf = Math.min(wideHalf, Math.max(CUT_FACE_SLOT_GEO_EPSILON, wideExtent - 1e-3));
        const maxLongOffset = Math.max(0, longExtent - longHalf - 1e-3);
        const maxWideOffset = Math.max(0, wideExtent - wideHalf - 1e-3);
        if (axes.longAxisId === 'u') {
            centerU = clamp(centerU, -maxLongOffset, maxLongOffset);
            centerV = clamp(centerV, -maxWideOffset, maxWideOffset);
        } else {
            centerV = clamp(centerV, -maxLongOffset, maxLongOffset);
            centerU = clamp(centerU, -maxWideOffset, maxWideOffset);
        }
        const clampedDepth = Math.min(depth, Math.max(CUT_FACE_SLOT_GEO_EPSILON, depthLimit - 2e-3));
        depthHalf = Math.max(CUT_FACE_SLOT_GEO_EPSILON * 0.5, clampedDepth * 0.5);
    } else {
        const throughDepth = Math.max(depth, depthLimit + 2e-2);
        depthHalf = Math.max(CUT_FACE_SLOT_GEO_EPSILON * 0.5, throughDepth * 0.5);
    }

    const center = add3(
        add3(
            frame.center,
            add3(
                scale3(frame.uAxis, centerU),
                scale3(frame.vAxis, centerV)
            )
        ),
        scale3(
            inward,
            command.cutMode === CUT_FACE_SLOT_MODE.CLAMPED
                ? depthHalf + 1e-3
                : depthHalf - 1e-3
        )
    );

    const depthAxis = normalize3(inward);
    let longAxis = projectVectorToPlane(axes.longAxis, depthAxis);
    if (length3(longAxis) <= CUT_FACE_SLOT_GEO_EPSILON) {
        longAxis = projectVectorToPlane(axes.wideAxis, depthAxis);
    }
    if (length3(longAxis) <= CUT_FACE_SLOT_GEO_EPSILON) {
        longAxis = makeFallbackOrthogonalAxis(depthAxis);
    }
    let wideAxis = normalize3(cross3(depthAxis, longAxis));
    if (length3(wideAxis) <= CUT_FACE_SLOT_GEO_EPSILON) {
        wideAxis = makeFallbackOrthogonalAxis(depthAxis);
    }
    longAxis = normalize3(cross3(wideAxis, depthAxis));

    const makePoint = (longSign, wideSign, depthSign) => add3(
        center,
        add3(
            scale3(longAxis, longSign * longHalf),
            add3(
                scale3(wideAxis, wideSign * wideHalf),
                scale3(depthAxis, depthSign * depthHalf)
            )
        )
    );

    const vertices = [
        makePoint(-1, -1, -1),
        makePoint(1, -1, -1),
        makePoint(1, 1, -1),
        makePoint(-1, 1, -1),
        makePoint(-1, -1, 1),
        makePoint(1, -1, 1),
        makePoint(1, 1, 1),
        makePoint(-1, 1, 1)
    ];

    const slotId = `${targetObject.id}.tool.slot.${operationToken}.c${pad3(cutSerial)}`;
    const faces = [
        { id: `${slotId}.face.front`, canonicalLabel: 'slot.front', vertexIndices: [4, 5, 6, 7] },
        { id: `${slotId}.face.back`, canonicalLabel: 'slot.back', vertexIndices: [0, 3, 2, 1] },
        { id: `${slotId}.face.left`, canonicalLabel: 'slot.left', vertexIndices: [0, 4, 7, 3] },
        { id: `${slotId}.face.right`, canonicalLabel: 'slot.right', vertexIndices: [1, 2, 6, 5] },
        { id: `${slotId}.face.top`, canonicalLabel: 'slot.top', vertexIndices: [3, 7, 6, 2] },
        { id: `${slotId}.face.bottom`, canonicalLabel: 'slot.bottom', vertexIndices: [0, 1, 5, 4] }
    ];

    return Object.freeze({
        toolObject: createIndexedFaceObject({
            objectId: slotId,
            materialId: targetObject.materialId,
            vertices,
            faces,
            position: targetObject.position,
            rotation: targetObject.rotation,
            scale: targetObject.scale
        }),
        frame,
        centerUv: Object.freeze([centerU, centerV]),
        span: longHalf * 2,
        width: wideHalf * 2,
        depth: depthHalf * 2,
        targetFaceId: String(resolvedFace.face.id ?? ''),
        targetFaceCanonicalLabel: String(
            resolvedFace.face.canonicalLabel
            ?? resolvedFace.face.label
            ?? ''
        )
    });
}

function collectTubeSegmentCount(objectDef, descriptor) {
    const faces = Array.isArray(objectDef?.faces) ? objectDef.faces : [];
    let maxS = -1;
    for (let i = 0; i < faces.length; i++) {
        const parsed = parseTubeFaceCanonicalLabel(faces[i]?.canonicalLabel ?? faces[i]?.label ?? '');
        if (!parsed) continue;
        if (descriptor.family === 'ring') {
            if (parsed.family !== 'ring') continue;
            maxS = Math.max(maxS, parsed.sIndex);
            continue;
        }
        if (parsed.family !== 'side') continue;
        if (descriptor.vIndex !== null) {
            if (parsed.vIndex !== descriptor.vIndex) continue;
        } else if (parsed.vIndex !== null) {
            continue;
        }
        maxS = Math.max(maxS, parsed.sIndex);
    }
    if (maxS < 0) return null;
    return maxS + 1;
}

function resolveOppositeTubeFaceTarget(objectDef, resolvedFace, oppositeFaceMode) {
    if (oppositeFaceMode === CUT_FACE_SLOT_OPPOSITE_FACE_MODE.NONE) return null;
    const canonical = String(
        resolvedFace?.face?.canonicalLabel
        ?? resolvedFace?.face?.label
        ?? ''
    ).trim();
    const descriptor = parseTubeFaceCanonicalLabel(canonical);
    if (!descriptor) return null;

    const segmentCount = collectTubeSegmentCount(objectDef, descriptor);
    if (!segmentCount || segmentCount < 1) return null;
    const mappedIndex = oppositeFaceMode === CUT_FACE_SLOT_OPPOSITE_FACE_MODE.PAIRED_MIRRORED_INDEX
        ? ((segmentCount - 1) - descriptor.sIndex + segmentCount) % segmentCount
        : descriptor.sIndex % segmentCount;

    let oppositeCanonical = '';
    if (descriptor.family === 'ring') {
        const oppositeSide = descriptor.side === 'top_ring' ? 'bottom_ring' : 'top_ring';
        oppositeCanonical = `${oppositeSide}.s${pad3(mappedIndex)}`;
    } else {
        const oppositeSide = descriptor.side === 'outer' ? 'inner' : 'outer';
        if (descriptor.vIndex === null) {
            oppositeCanonical = `${oppositeSide}.s${pad3(mappedIndex)}`;
        } else {
            oppositeCanonical = `${oppositeSide}.v${pad3(descriptor.vIndex)}.s${pad3(mappedIndex)}`;
        }
    }
    return Object.freeze({
        targetFace: oppositeCanonical,
        mapping: oppositeFaceMode
    });
}

export const cutFaceSlotCommandModule = Object.freeze({
    type: COMMAND_TYPE.CUT_FACE_SLOT,
    mode: 'active',
    normalizeRaw({ commandId, rawIndex, args }) {
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.CUT_FACE_SLOT,
            args: normalizeCutFaceSlotArgs(args, `commands[${rawIndex}].args`, commandId),
            source: {
                kind: 'command',
                index: rawIndex
            }
        });
    },
    execute({ command, operationId, runtime }) {
        const args = command.args ?? {};
        const targetObjectId = assertString(args.targetObjectId, `${command.commandId}.args.targetObjectId`);
        const targetIds = Object.freeze([targetObjectId]);

        const targetObjectBase = runtime.mutableObjects.get(targetObjectId);
        if (!targetObjectBase) {
            return Object.freeze({
                status: 'rejected',
                message: `Unknown target object "${targetObjectId}".`,
                targetIds,
                outputIds: Object.freeze([]),
                markers: Object.freeze([])
            });
        }

        const effectiveTarget = applyOverrideToObject(
            targetObjectBase,
            runtime.overridesMutable.get(targetObjectId)
        );
        const operationToken = sanitizeToken(args.opId ?? command.commandId, operationId);
        const cutRequests = [];

        let primaryResolution = null;
        try {
            primaryResolution = resolveCutFaceTarget(
                effectiveTarget,
                args.targetFace,
                `${command.commandId}.args`
            );
        } catch (error) {
            return Object.freeze({
                status: 'rejected',
                message: error?.message ?? String(error),
                targetIds,
                outputIds: Object.freeze([]),
                markers: Object.freeze([])
            });
        }

        cutRequests.push(Object.freeze({
            role: 'primary',
            faceTarget: primaryResolution.query,
            pairingMode: CUT_FACE_SLOT_OPPOSITE_FACE_MODE.NONE
        }));

        const oppositeTarget = resolveOppositeTubeFaceTarget(
            effectiveTarget,
            primaryResolution,
            args.oppositeFaceMode
        );
        if (oppositeTarget) {
            cutRequests.push(Object.freeze({
                role: 'opposite',
                faceTarget: oppositeTarget.targetFace,
                pairingMode: oppositeTarget.mapping
            }));
        }

        const appliedCuts = [];
        const skippedCuts = [];
        let workingObject = effectiveTarget;

        for (let cutIndex = 0; cutIndex < cutRequests.length; cutIndex++) {
            const request = cutRequests[cutIndex];
            let resolvedFace = null;
            try {
                resolvedFace = resolveCutFaceTarget(
                    workingObject,
                    request.faceTarget,
                    `${command.commandId}.args`
                );
            } catch (error) {
                if (request.role === 'primary') {
                    return Object.freeze({
                        status: 'rejected',
                        message: error?.message ?? String(error),
                        targetIds,
                        outputIds: Object.freeze([]),
                        markers: Object.freeze([])
                    });
                }
                skippedCuts.push(Object.freeze({
                    role: request.role,
                    faceTarget: request.faceTarget,
                    reason: 'paired_target_not_found'
                }));
                continue;
            }

            const cutBuild = buildSlotCutterObject({
                command: args,
                targetObject: workingObject,
                targetFace: resolvedFace.face,
                resolvedFace,
                cutSerial: cutIndex,
                operationToken
            });
            const cutOperationToken = sanitizeToken(
                `${operationToken}.slot${pad3(cutIndex)}`,
                `${operationToken}.slot${pad3(cutIndex)}`
            );
            const beforeObject = workingObject;
            const boolResult = executeBooleanOperation({
                type: COMMAND_TYPE.BOOLEAN_SUBTRACT,
                opId: cutOperationToken,
                targetObject: workingObject,
                toolObject: cutBuild.toolObject,
                outputPolicy: 'replace_target',
                subtractMode: args.cutMode === CUT_FACE_SLOT_MODE.CLAMPED
                    ? 'subtract_clamped'
                    : 'subtract_through',
                keepTool: false
            });
            workingObject = boolResult.resultObject;
            const lineage = computeFaceLineage(beforeObject, workingObject);
            appliedCuts.push(Object.freeze({
                role: request.role,
                pairingMode: request.pairingMode,
                targetFaceId: cutBuild.targetFaceId,
                targetFaceCanonicalLabel: cutBuild.targetFaceCanonicalLabel,
                targetFaceResolution: resolvedFace.resolution,
                toolObjectId: cutBuild.toolObject.id,
                booleanOpId: cutOperationToken,
                center: cutBuild.centerUv,
                span: cutBuild.span,
                width: cutBuild.width,
                depth: cutBuild.depth,
                lineage,
                booleanStats: boolResult.stats
            }));
        }

        if (appliedCuts.length < 1) {
            return Object.freeze({
                status: 'rejected',
                message: 'No slot cuts were applied.',
                targetIds,
                outputIds: Object.freeze([]),
                markers: Object.freeze([])
            });
        }

        runtime.mutableObjects.set(workingObject.id, workingObject);
        runtime.overridesMutable.delete(targetObjectId);

        return Object.freeze({
            status: 'applied',
            message: `Face slot cut applied (${appliedCuts.length} cut${appliedCuts.length === 1 ? '' : 's'}).`,
            targetIds,
            outputIds: Object.freeze([workingObject.id]),
            markers: appliedCuts.some((entry) => entry.role === 'opposite')
                ? Object.freeze(['topology_cut_applied', 'opposite_face_propagated'])
                : Object.freeze(['topology_cut_applied']),
            metadata: Object.freeze({
                operationGroupId: `slot.${operationToken}`,
                cutMode: args.cutMode,
                orientation: args.orientation,
                oppositeFaceMode: args.oppositeFaceMode,
                cuts: Object.freeze(appliedCuts),
                skippedCuts: Object.freeze(skippedCuts)
            })
        });
    }
});
