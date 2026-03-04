// src/graphics/gui/mesh_fabrication/operations/boolean/stages/deterministicRemapStage.js

export function runBooleanDeterministicRemapStage({
    regroupedResult,
    remap
}) {
    if (typeof remap !== 'function') {
        throw new Error('[BooleanDeterministicRemapStage] remap callback is required.');
    }
    return remap(regroupedResult);
}
