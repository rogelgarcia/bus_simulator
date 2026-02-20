// Node unit tests: Noise fabrication layered stack behavior and determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addNoiseLayerFromCatalog,
    describeNoiseLayer,
    duplicateNoiseLayer,
    generateNoiseFieldFromState,
    getNoiseFabricationDefaultState,
    renameNoiseLayer,
    reorderNoiseLayers,
    replaceNoiseLayerFromCatalog,
    sanitizeNoiseFabricationState,
    setNoiseFabricationPreviewMode,
    setNoiseFabricationTextureSize,
    setNoiseLayerBlendMode,
    setNoiseLayerLock,
    setNoiseLayerMapTarget,
    setNoiseLayerPreset,
    setNoiseLayerSolo,
    setNoiseLayerStrength,
    NOISE_FABRICATION_MAX_LAYERS
} from '../../../src/graphics/gui/noise_fabrication/NoiseTextureGeneratorRegistry.js';

test('Noise stack actions: add/replace/duplicate/rename/lock/solo/reorder', () => {
    let state = getNoiseFabricationDefaultState();

    state = addNoiseLayerFromCatalog(state, 'line_bands');
    const lineLayerId = state.activeLayerId;
    assert.equal(state.layers.length, 2);
    assert.equal(state.layers[1].noiseId, 'line_bands');

    state = replaceNoiseLayerFromCatalog(state, lineLayerId, 'tile_grid_subdivision');
    const replacedLayer = state.layers.find((layer) => layer.id === lineLayerId);
    assert.equal(replacedLayer?.generatorId, 'tile_grid_subdivision');

    state = renameNoiseLayer(state, lineLayerId, 'Main Seams');
    state = describeNoiseLayer(state, lineLayerId, 'Primary seam grooves for stone plates');
    const renamed = state.layers.find((layer) => layer.id === lineLayerId);
    assert.equal(renamed?.name, 'Main Seams');
    assert.equal(renamed?.description, 'Primary seam grooves for stone plates');

    state = setNoiseLayerLock(state, lineLayerId, true);
    state = replaceNoiseLayerFromCatalog(state, lineLayerId, 'directional_fbm');
    const stillLockedType = state.layers.find((layer) => layer.id === lineLayerId);
    assert.equal(stillLockedType?.generatorId, 'tile_grid_subdivision');
    assert.equal(stillLockedType?.lock, true);
    assert.ok(state.statusWarnings.some((warning) => warning.includes('locked')));

    state = setNoiseLayerSolo(state, lineLayerId, true);
    const soloLayer = state.layers.find((layer) => layer.id === lineLayerId);
    assert.equal(soloLayer?.solo, true);

    state = duplicateNoiseLayer(state, lineLayerId);
    assert.equal(state.layers.length, 3);
    const duplicateId = state.activeLayerId;
    assert.notEqual(duplicateId, lineLayerId);

    const reversedOrder = state.layers.map((layer) => layer.id).reverse();
    state = reorderNoiseLayers(state, reversedOrder);
    assert.deepEqual(state.layers.map((layer) => layer.id), reversedOrder);
});

test('Noise stack generation: layered mix is deterministic and order-sensitive', () => {
    let state = getNoiseFabricationDefaultState();

    state = addNoiseLayerFromCatalog(state, 'directional_fbm');
    const directionalId = state.activeLayerId;
    state = setNoiseLayerPreset(state, directionalId, 'sidewalk_streaks');
    state = setNoiseLayerBlendMode(state, directionalId, 'normal');
    state = setNoiseLayerStrength(state, directionalId, 0.35);
    state = setNoiseLayerMapTarget(state, directionalId, 'normal');

    state = addNoiseLayerFromCatalog(state, 'line_bands');
    const seamsId = state.activeLayerId;
    state = setNoiseLayerPreset(state, seamsId, 'vertical_seam_single');
    state = setNoiseLayerBlendMode(state, seamsId, 'normal');
    state = setNoiseLayerStrength(state, seamsId, 0.82);
    state = setNoiseLayerMapTarget(state, seamsId, 'normal');

    state = setNoiseFabricationPreviewMode(state, 'normal');
    state = setNoiseFabricationTextureSize(state, 128);
    state = sanitizeNoiseFabricationState(state);

    const first = generateNoiseFieldFromState(state).field;
    const second = generateNoiseFieldFromState(state).field;

    assert.equal(first.length, second.length);
    for (let i = 0; i < first.length; i++) {
        assert.equal(first[i], second[i]);
    }

    const swapped = reorderNoiseLayers(state, [
        seamsId,
        state.layers[0].id,
        directionalId
    ]);

    const swappedField = generateNoiseFieldFromState(swapped).field;
    let differenceFound = false;
    for (let i = 0; i < first.length; i++) {
        if (first[i] !== swappedField[i]) {
            differenceFound = true;
            break;
        }
    }
    assert.equal(differenceFound, true, 'Changing deterministic layer order should affect composited output.');
});

test('Noise stack sanitization: clamps max layers and max resolution', () => {
    const defaults = getNoiseFabricationDefaultState();
    const manyLayers = [];
    for (let i = 0; i < NOISE_FABRICATION_MAX_LAYERS + 4; i++) {
        manyLayers.push({
            ...defaults.layers[0],
            id: `layer_${i + 1}`,
            name: `Layer ${i + 1}`
        });
    }

    const sanitized = sanitizeNoiseFabricationState({
        ...defaults,
        textureSize: 4096,
        layers: manyLayers
    });

    assert.equal(sanitized.textureSize, 1024);
    assert.equal(sanitized.layers.length, NOISE_FABRICATION_MAX_LAYERS);
    assert.ok(sanitized.statusWarnings.some((warning) => warning.includes('Resolution clamped')));
    assert.ok(sanitized.statusWarnings.some((warning) => warning.includes('Layer count clamped')));
});

test('Noise stack migration: legacy single-generator state is migrated to v2 layered model', () => {
    const migrated = sanitizeNoiseFabricationState({
        tool: 'noise_fabrication',
        version: 1,
        generatorId: 'ridged_fbm',
        activePresetId: 'veins',
        textureSize: 512,
        generatorParamsById: {
            ridged_fbm: {
                seed: 'legacy-seed',
                scale: 22.0,
                octaves: 5,
                gain: 0.6,
                lacunarity: 2.2,
                bias: -0.1,
                contrast: 1.5,
                rotationDeg: 0,
                invert: false
            }
        }
    });

    assert.equal(migrated.version, 2);
    assert.equal(migrated.layers.length, 1);
    assert.equal(migrated.layers[0].generatorId, 'ridged_fbm');
    assert.ok(migrated.statusWarnings.some((warning) => warning.includes('Migrated legacy single-generator recipe')));
});
