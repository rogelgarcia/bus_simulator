// Node unit tests: Noise fabrication execution path checker behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    analyzeNoiseLayerExecution,
    buildNoiseExecutionPlan
} from '../../../src/graphics/gui/noise_fabrication/NoiseExecutionPathChecker.js';
import {
    addNoiseLayerFromCatalog,
    getNoiseFabricationDefaultState,
    getNoiseFabricationExecutionPlan,
    setNoiseLayerDynamicRuntime,
    setNoiseLayerExecutionManualPath
} from '../../../src/graphics/gui/noise_fabrication/NoiseTextureGeneratorRegistry.js';

test('NoiseExecutionPathChecker: dynamic propagation defaults later layers to shader unless overridden', () => {
    let state = getNoiseFabricationDefaultState();
    state = addNoiseLayerFromCatalog(state, 'micro_grain');
    const secondLayerId = state.activeLayerId;
    state = addNoiseLayerFromCatalog(state, 'low_frequency_blotch');
    const thirdLayerId = state.activeLayerId;

    const firstLayerId = state.layers[0].id;
    state = setNoiseLayerDynamicRuntime(state, firstLayerId, true);
    state = setNoiseLayerExecutionManualPath(state, thirdLayerId, 'texture_baked');

    const plan = getNoiseFabricationExecutionPlan(state);
    const byId = new Map(plan.layers.map((entry) => [entry.layerId, entry]));

    assert.equal(byId.get(firstLayerId)?.recommendedPath, 'shader');
    assert.equal(byId.get(firstLayerId)?.finalPath, 'shader');
    assert.equal(byId.get(secondLayerId)?.flags.propagatedDynamic, true);
    assert.equal(byId.get(secondLayerId)?.recommendedPath, 'shader');
    assert.equal(byId.get(secondLayerId)?.finalPath, 'shader');

    assert.equal(byId.get(thirdLayerId)?.flags.propagatedDynamic, true);
    assert.equal(byId.get(thirdLayerId)?.recommendedPath, 'shader');
    assert.equal(byId.get(thirdLayerId)?.finalPath, 'texture_baked');
});

test('NoiseExecutionPathChecker: static expensive low-frequency layers are classified as baked', () => {
    const analysis = analyzeNoiseLayerExecution({
        id: 'layer_static_cost',
        name: 'StaticCostly',
        generatorId: 'low_frequency_blotch',
        params: { scale: 0.1, octaves: 6 },
        transform: { scale: 1.0, rotationDeg: 0, offsetU: 0, offsetV: 0 },
        execution: { mode: 'auto', manualPath: 'hybrid', dynamicRuntime: false, largeScaleWorld: false }
    }, {
        questions: {
            dynamicSceneContext: false,
            largeWorldContext: false,
            preferBakedPerformance: true
        }
    });

    assert.equal(analysis.flags.staticExpensive, true);
    assert.equal(analysis.flags.highFrequency, false);
    assert.equal(analysis.recommendedPath, 'texture_baked');
    assert.equal(analysis.finalPath, 'texture_baked');
});

test('NoiseExecutionPathChecker: high-frequency detail is detected and classified for shader execution', () => {
    const analysis = analyzeNoiseLayerExecution({
        id: 'layer_high_freq',
        name: 'HighFreqLines',
        generatorId: 'line_bands',
        params: { lineCount: 96, lineWidth: 0.01, softness: 0.01, jitter: 0.0 },
        transform: { scale: 1.0, rotationDeg: 0, offsetU: 0, offsetV: 0 },
        execution: { mode: 'auto', manualPath: 'hybrid', dynamicRuntime: false, largeScaleWorld: false }
    });

    assert.equal(analysis.flags.highFrequency, true);
    assert.ok(analysis.scores.highFrequency >= 0.62);
    assert.equal(analysis.recommendedPath, 'shader');
});

test('NoiseExecutionPathChecker: large-scale world usage is detected and classified as baked when static', () => {
    const plan = buildNoiseExecutionPlan([
        {
            id: 'layer_large_world',
            name: 'MacroWorldBlotch',
            generatorId: 'low_frequency_blotch',
            params: { scale: 0.2, octaves: 2 },
            transform: { scale: 1.0, rotationDeg: 0, offsetU: 0, offsetV: 0 },
            execution: { mode: 'auto', manualPath: 'hybrid', dynamicRuntime: false, largeScaleWorld: true }
        }
    ]);

    const entry = plan.layers[0];
    assert.equal(entry.flags.largeScaleWorld, true);
    assert.ok(entry.scores.largeScaleWorld >= 0.6);
    assert.equal(entry.recommendedPath, 'texture_baked');
    assert.equal(entry.finalPath, 'texture_baked');
});
