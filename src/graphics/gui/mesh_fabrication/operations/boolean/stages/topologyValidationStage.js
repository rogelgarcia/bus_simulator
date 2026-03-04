// src/graphics/gui/mesh_fabrication/operations/boolean/stages/topologyValidationStage.js

export function runBooleanTopologyValidationStage({
    remappedResult,
    validate
}) {
    if (typeof validate !== 'function') {
        throw new Error('[BooleanTopologyValidationStage] validate callback is required.');
    }
    validate(remappedResult);
    return remappedResult;
}
