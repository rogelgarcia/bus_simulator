// src/graphics/gui/mesh_fabrication/operations/extrude/extrudeStage.js

export function runExtrudeOperationStage({
    command,
    execute
}) {
    if (typeof execute !== 'function') {
        throw new Error('[ExtrudeOperationStage] execute callback is required.');
    }
    return execute(command);
}
