// src/graphics/gui/mesh_fabrication/operations/boolean/stages/inputConversionStage.js

export function runBooleanInputConversionStage({
    type,
    opId,
    outputPolicy,
    resultObjectId,
    subtractMode,
    keepTool,
    targetObject,
    toolObject,
    convert
}) {
    if (typeof convert !== 'function') {
        throw new Error('[BooleanInputConversionStage] convert callback is required.');
    }
    return convert({
        type,
        opId,
        outputPolicy,
        resultObjectId,
        subtractMode,
        keepTool,
        targetObject,
        toolObject
    });
}
