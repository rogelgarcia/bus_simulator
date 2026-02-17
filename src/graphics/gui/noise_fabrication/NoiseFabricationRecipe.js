// src/graphics/gui/noise_fabrication/NoiseFabricationRecipe.js
// JSON recipe export/import helpers for Noise fabrication parameter presets.
// @ts-check

import { NOISE_FABRICATION_STATE_VERSION, NOISE_FABRICATION_TOOL_ID, sanitizeNoiseFabricationState } from './NoiseTextureGeneratorRegistry.js';

export function buildNoiseFabricationRecipe(state) {
    const sanitized = sanitizeNoiseFabricationState(state);
    return {
        tool: NOISE_FABRICATION_TOOL_ID,
        version: NOISE_FABRICATION_STATE_VERSION,
        exportedAt: new Date().toISOString(),
        state: {
            generatorId: sanitized.generatorId,
            activePresetId: sanitized.activePresetId,
            previewMode: sanitized.previewMode,
            baseColor: sanitized.baseColor,
            textureSize: sanitized.textureSize,
            generatorParamsById: sanitized.generatorParamsById
        }
    };
}

export function stringifyNoiseFabricationRecipe(state, { space = 2 } = {}) {
    const recipe = buildNoiseFabricationRecipe(state);
    return `${JSON.stringify(recipe, null, Math.max(0, Math.min(8, Number(space) || 0)))}\n`;
}

export function parseNoiseFabricationRecipeObject(input) {
    const src = input && typeof input === 'object' ? input : null;
    if (!src) throw new Error('[NoiseFabricationRecipe] Expected recipe object.');

    const tool = typeof src.tool === 'string' ? src.tool.trim().toLowerCase() : '';
    if (tool && tool !== NOISE_FABRICATION_TOOL_ID) {
        throw new Error(`[NoiseFabricationRecipe] Unsupported tool "${src.tool}".`);
    }

    const state = src.state && typeof src.state === 'object' ? src.state : src;
    return sanitizeNoiseFabricationState(state);
}

export function parseNoiseFabricationRecipeText(text) {
    const raw = typeof text === 'string' ? text : '';
    if (!raw.trim()) throw new Error('[NoiseFabricationRecipe] Empty recipe text.');

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('[NoiseFabricationRecipe] Invalid JSON.');
    }

    return parseNoiseFabricationRecipeObject(parsed);
}
