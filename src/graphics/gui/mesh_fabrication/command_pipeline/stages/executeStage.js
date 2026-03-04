// src/graphics/gui/mesh_fabrication/command_pipeline/stages/executeStage.js

export function runCommandExecuteStage({ normalizedPlan, execute }) {
    if (typeof execute !== 'function') {
        throw new Error('[CommandExecuteStage] execute callback is required.');
    }
    return execute(normalizedPlan);
}
