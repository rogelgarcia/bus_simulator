// Node unit tests: Noise fabrication layered recipe export/import roundtrip.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addNoiseLayerFromCatalog,
    generateNoiseFieldFromState,
    getNoiseFabricationDefaultState,
    setNoiseFabricationExecutionAssistantQuestions,
    sanitizeNoiseFabricationState,
    setNoiseFabricationExportTargets,
    setNoiseFabricationPreviewMode,
    setNoiseFabricationTextureSize,
    setNoiseLayerBlendMode,
    setNoiseLayerExecutionManualPath,
    setNoiseLayerMapTarget,
    setNoiseLayerPreset,
    setNoiseLayerStrength
} from '../../../src/graphics/gui/noise_fabrication/NoiseTextureGeneratorRegistry.js';
import { parseNoiseFabricationRecipeText, stringifyNoiseFabricationRecipe } from '../../../src/graphics/gui/noise_fabrication/NoiseFabricationRecipe.js';

test('NoiseFabricationRecipe: export/import preserves layered deterministic generation', () => {
    let state = getNoiseFabricationDefaultState();

    state = addNoiseLayerFromCatalog(state, 'directional_fbm');
    const directionalId = state.activeLayerId;
    state = setNoiseLayerPreset(state, directionalId, 'sidewalk_streaks');
    state = setNoiseLayerStrength(state, directionalId, 0.72);
    state = setNoiseLayerBlendMode(state, directionalId, 'multiply');
    state = setNoiseLayerMapTarget(state, directionalId, 'normal');

    state = addNoiseLayerFromCatalog(state, 'micro_grain');
    const microId = state.activeLayerId;
    state = setNoiseLayerMapTarget(state, microId, 'albedo');

    state = setNoiseFabricationPreviewMode(state, 'normal');
    state = setNoiseFabricationTextureSize(state, 256);
    state = setNoiseFabricationExportTargets(state, { normal: true, albedo: true, orm: false });

    state = sanitizeNoiseFabricationState(state);

    const before = generateNoiseFieldFromState(state);
    const jsonA = stringifyNoiseFabricationRecipe(state);
    const jsonB = stringifyNoiseFabricationRecipe(state);
    assert.equal(jsonA, jsonB, 'Recipe JSON should be deterministic for identical state');

    const parsed = parseNoiseFabricationRecipeText(jsonA);
    const after = generateNoiseFieldFromState(parsed);

    assert.equal(after.width, before.width);
    assert.equal(after.height, before.height);
    assert.equal(after.field.length, before.field.length);

    for (let i = 0; i < before.field.length; i++) {
        assert.equal(after.field[i], before.field[i]);
    }
});

test('NoiseFabricationRecipe: parser rejects recipes for other tools', () => {
    assert.throws(
        () => parseNoiseFabricationRecipeText(JSON.stringify({ tool: 'other_tool', version: 1, state: {} })),
        /Unsupported tool/
    );
});

test('NoiseFabricationRecipe: export validates ORM channel sources', () => {
    let state = getNoiseFabricationDefaultState();
    state = setNoiseFabricationExportTargets(state, { normal: false, albedo: false, orm: true });

    assert.throws(
        () => stringifyNoiseFabricationRecipe(state),
        /ORM export requires/
    );
});

test('NoiseFabricationRecipe: execution assistant and per-layer execution settings are exported', () => {
    let state = getNoiseFabricationDefaultState();
    const layerId = state.layers[0].id;
    state = setNoiseLayerExecutionManualPath(state, layerId, 'texture_baked');
    state = setNoiseFabricationExecutionAssistantQuestions(state, {
        dynamicSceneContext: true,
        largeWorldContext: true,
        preferBakedPerformance: false
    });

    const executionDecisionAssistant = {
        questions: {
            dynamicSceneContext: true,
            largeWorldContext: true,
            preferBakedPerformance: false
        },
        summary: { shader: 0, textureBaked: 1, hybrid: 0 },
        layers: [{
            layerId,
            layerName: state.layers[0].name,
            recommendedPath: 'shader',
            finalPath: 'texture_baked'
        }],
        confirmedAt: '2026-02-20T00:00:00.000Z'
    };
    const recipe = JSON.parse(stringifyNoiseFabricationRecipe(state, { executionDecisionAssistant }));

    assert.equal(recipe.executionDecisionAssistant.confirmedAt, '2026-02-20T00:00:00.000Z');
    assert.equal(recipe.state.executionAssistantQuestions.dynamicSceneContext, true);
    assert.equal(recipe.state.executionAssistantQuestions.largeWorldContext, true);
    assert.equal(recipe.state.layers[0].execution.mode, 'manual');
    assert.equal(recipe.state.layers[0].execution.manualPath, 'texture_baked');
});
