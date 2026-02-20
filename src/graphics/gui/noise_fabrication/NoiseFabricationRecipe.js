// src/graphics/gui/noise_fabrication/NoiseFabricationRecipe.js
// JSON recipe export/import helpers for layered Noise fabrication stacks.
// @ts-check

import {
    NOISE_FABRICATION_STATE_VERSION,
    NOISE_FABRICATION_TOOL_ID,
    buildNoiseFabricationExportScope,
    sanitizeNoiseFabricationState,
    validateNoiseFabricationExportScope
} from './NoiseTextureGeneratorRegistry.js';

function serializeStateForRecipe(state) {
    return {
        version: state.version,
        tool: state.tool,
        previewMode: state.previewMode,
        baseColor: state.baseColor,
        textureSize: state.textureSize,
        activeLayerId: state.activeLayerId,
        nextLayerId: state.nextLayerId,
        exportTargets: state.exportTargets,
        executionAssistantQuestions: state.executionAssistantQuestions,
        layers: state.layers.map((layer) => ({
            id: layer.id,
            noiseId: layer.noiseId,
            generatorId: layer.generatorId,
            name: layer.name,
            description: layer.description,
            presetId: layer.presetId,
            blendMode: layer.blendMode,
            strength: layer.strength,
            lock: layer.lock,
            solo: layer.solo,
            mapTarget: layer.mapTarget,
            transform: {
                space: layer.transform.space,
                scale: layer.transform.scale,
                rotationDeg: layer.transform.rotationDeg,
                offsetU: layer.transform.offsetU,
                offsetV: layer.transform.offsetV
            },
            params: layer.params,
            execution: layer.execution
        }))
    };
}

export function buildNoiseFabricationRecipe(state, { executionDecisionAssistant = null } = {}) {
    const sanitized = sanitizeNoiseFabricationState(state);
    const validation = validateNoiseFabricationExportScope(sanitized);
    if (!validation.valid) {
        throw new Error(validation.errors.join(' | '));
    }

    return {
        tool: NOISE_FABRICATION_TOOL_ID,
        version: NOISE_FABRICATION_STATE_VERSION,
        exportMode: 'stack_recipe_json',
        bakedMaps: {
            available: false,
            reason: 'Baked map export is unavailable in this AI scope; stack recipe JSON export only.'
        },
        ormPacking: {
            R: 'AO',
            G: 'Roughness',
            B: 'Metalness'
        },
        exportScope: buildNoiseFabricationExportScope(sanitized),
        executionDecisionAssistant: executionDecisionAssistant && typeof executionDecisionAssistant === 'object'
            ? executionDecisionAssistant
            : null,
        state: serializeStateForRecipe(sanitized)
    };
}

export function stringifyNoiseFabricationRecipe(state, { space = 2, executionDecisionAssistant = null } = {}) {
    const recipe = buildNoiseFabricationRecipe(state, { executionDecisionAssistant });
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
