// Shared mutable/immutable runtime object state helpers for command execution.

export function freezeParsedObject(objectDef) {
    return Object.freeze({
        ...objectDef,
        vertices: Object.freeze((objectDef.vertices ?? []).map((v) => Object.freeze([v[0], v[1], v[2]]))),
        vertexIds: Object.freeze([...(objectDef.vertexIds ?? [])]),
        edges: Object.freeze((objectDef.edges ?? []).map((edge) => Object.freeze({
            ...edge,
            vertexIds: Object.freeze([...(edge.vertexIds ?? [])]),
            vertexIndices: Object.freeze([...(edge.vertexIndices ?? [])])
        }))),
        faces: Object.freeze((objectDef.faces ?? []).map((face) => Object.freeze({
            ...face,
            vertexIds: Object.freeze([...(face.vertexIds ?? [])]),
            vertexIndices: Object.freeze([...(face.vertexIndices ?? [])]),
            edgeIds: Object.freeze([...(face.edgeIds ?? [])])
        }))),
        renderTriangles: Object.freeze((objectDef.renderTriangles ?? []).map((tri) => Object.freeze({
            ...tri,
            indices: Object.freeze([...(tri.indices ?? [])])
        }))),
        triangles: Object.freeze((objectDef.triangles ?? []).map((tri) => Object.freeze([...(tri ?? [])]))),
        position: Object.freeze([...(objectDef.position ?? [0, 0, 0])]),
        rotation: Object.freeze([...(objectDef.rotation ?? [0, 0, 0])]),
        scale: Object.freeze([...(objectDef.scale ?? [1, 1, 1])])
    });
}

export function freezeObjectList(objectsMutable) {
    return Object.freeze(objectsMutable.map((obj) => freezeParsedObject(obj)));
}

export function freezeObjectOverrides(overridesMutable) {
    const out = new Map();
    for (const [objectId, override] of overridesMutable.entries()) {
        const normalized = {
            objectId
        };
        if (override.materialId) normalized.materialId = override.materialId;
        if (override.position) normalized.position = Object.freeze([...override.position]);
        if (override.rotation) normalized.rotation = Object.freeze([...override.rotation]);
        if (override.scale) normalized.scale = Object.freeze([...override.scale]);
        out.set(objectId, Object.freeze(normalized));
    }
    return out;
}

export function ensureOverride(overrides, objectId) {
    const existing = overrides.get(objectId);
    if (existing) return existing;
    const created = { objectId };
    overrides.set(objectId, created);
    return created;
}

export function applyOverrideToObject(baseObject, override) {
    if (!baseObject) return null;
    if (!override) return baseObject;
    return Object.freeze({
        ...baseObject,
        materialId: override.materialId ?? baseObject.materialId,
        position: Object.freeze([...(override.position ?? baseObject.position)]),
        rotation: Object.freeze([...(override.rotation ?? baseObject.rotation)]),
        scale: Object.freeze([...(override.scale ?? baseObject.scale)])
    });
}
