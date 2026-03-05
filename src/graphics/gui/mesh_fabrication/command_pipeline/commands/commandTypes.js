// Mesh fabrication command identifiers and runtime kernel ids.

export const COMMAND_TYPE = Object.freeze({
    TRANSLATE_OBJECT: 'translate_object',
    SET_OBJECT_TRANSFORM: 'set_object_transform',
    SET_OBJECT_MATERIAL: 'set_object_material',
    CUT_FACE_SLOT: 'cut_face_slot',
    BOOLEAN_UNION: 'boolean_union',
    BOOLEAN_SUBTRACT: 'boolean_subtract',
    BOOLEAN_INTERSECT: 'boolean_intersect',
    TOPOLOGY_IMPRINT: 'imprint_topology',
    TOPOLOGY_SLICE: 'slice_topology',
    NEEDS_CLARIFICATION: 'needs_clarification'
});

export const BOOLEAN_COMMAND_TYPES = new Set([
    COMMAND_TYPE.BOOLEAN_UNION,
    COMMAND_TYPE.BOOLEAN_SUBTRACT,
    COMMAND_TYPE.BOOLEAN_INTERSECT
]);

export const BOOLEAN_KERNEL = Object.freeze({
    MANIFOLD: 'manifold-3d'
});
