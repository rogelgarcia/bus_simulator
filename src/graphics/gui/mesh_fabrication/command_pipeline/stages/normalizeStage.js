// src/graphics/gui/mesh_fabrication/command_pipeline/stages/normalizeStage.js

export function runCommandNormalizeStage({ parsedPlan, normalize }) {
    if (typeof normalize !== 'function') {
        throw new Error('[CommandNormalizeStage] normalize callback is required.');
    }
    return normalize(parsedPlan);
}
