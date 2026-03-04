// src/graphics/gui/mesh_fabrication/operations/boolean/stages/regroupingStage.js

export function runBooleanRegroupingStage({
    kernelResult,
    regroup
}) {
    if (typeof regroup !== 'function') {
        throw new Error('[BooleanRegroupingStage] regroup callback is required.');
    }
    return regroup(kernelResult);
}
