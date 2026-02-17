// Node unit tests: Noise fabrication recipe export/import roundtrip.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyGeneratorPresetToParams,
    generateNoiseFieldFromState,
    getNoiseFabricationDefaultState,
    sanitizeNoiseFabricationState
} from '../../../src/graphics/gui/noise_fabrication/NoiseTextureGeneratorRegistry.js';
import { parseNoiseFabricationRecipeText, stringifyNoiseFabricationRecipe } from '../../../src/graphics/gui/noise_fabrication/NoiseFabricationRecipe.js';

test('NoiseFabricationRecipe: export/import preserves deterministic generation', () => {
    const defaults = getNoiseFabricationDefaultState();
    const ridgedPreset = applyGeneratorPresetToParams('ridged_fbm', 'veins', defaults.generatorParamsById.ridged_fbm);

    const state = sanitizeNoiseFabricationState({
        ...defaults,
        generatorId: 'ridged_fbm',
        activePresetId: 'veins',
        previewMode: 'normal',
        baseColor: '#7A8B9C',
        textureSize: 256,
        generatorParamsById: {
            ...defaults.generatorParamsById,
            ridged_fbm: ridgedPreset
        }
    });

    const before = generateNoiseFieldFromState(state);
    const json = stringifyNoiseFabricationRecipe(state);
    const parsed = parseNoiseFabricationRecipeText(json);
    const after = generateNoiseFieldFromState(parsed);

    assert.equal(after.width, before.width);
    assert.equal(after.height, before.height);
    assert.equal(after.generatorId, before.generatorId);
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
