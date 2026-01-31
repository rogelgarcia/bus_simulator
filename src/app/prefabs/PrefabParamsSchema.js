// src/app/prefabs/PrefabParamsSchema.js
// Defines a declarative schema format for prefab construction parameters.
export {
    RIG_PROPERTY_TYPE as PREFAB_PARAM_TYPE,
    createColorProperty,
    createEnumProperty,
    createNumberProperty,
    createBooleanProperty,
    normalizeEnumValue,
    normalizeBooleanValue,
    normalizeColorHex,
    clampNumber
} from '../rigs/RigSchema.js';

export function isPrefabParamsApi(api) {
    return !!api
        && typeof api === 'object'
        && !!api.schema
        && typeof api.getParam === 'function'
        && typeof api.setParam === 'function';
}
