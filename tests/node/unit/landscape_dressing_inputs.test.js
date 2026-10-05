// Verifies landscape-dressing-inputs v1: soil agreement, terrain responses, planning suppression, neutral fields and validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_DRESSING_INPUTS, sampleLandscapeDressingInputs } from '../../../src/app/landscape/index.js';

const open = { wetness: .5, flow: .1, deposition: .1, rockExposure: 0, skyView: 1, shoreDistance: 120, convexity: 0, slopeDegrees: 4 };
const sample = (soil, fields = open, planningShare = 0) => sampleLandscapeDressingInputs({ soilWeights: { [soil]: 1 }, planningShare, fields });

test('Dressing inputs: soils that cannot host a dressing contribute exactly zero', () => {
    for (const soil of ['sand', 'rock', 'seabed', 'unknown']) {
        const value = sample(soil);
        assert.equal(value.grassDensity, 0, `${soil} has no grass`);
        assert.equal(value.treeSuitability, 0, `${soil} has no trees`);
        assert.equal(value.shrubSuitability, 0, `${soil} has no shrubs`);
    }
    for (const soil of ['loam', 'forest', 'rock', 'seabed', 'unknown']) assert.equal(sample(soil, { ...open, shoreDistance: 6 }).beachDebris, 0, `${soil} has no beach debris`);
    assert.equal(sample('loam').treeSuitability, 0, 'trees need forest soil');
    assert.ok(sample('loam').grassDensity > .7 && sample('forest').treeSuitability > .9 && sample('rock').rockScatter >= .6);
});

test('Dressing inputs: terrain fields shape each output smoothly and the shoreline gates land dressings', () => {
    assert.ok(sample('sand', { ...open, shoreDistance: 6 }).beachDebris > .9, 'the wrack line holds debris');
    assert.equal(sample('sand', { ...open, shoreDistance: 60 }).beachDebris, 0, 'dry dunes far from the water hold none');
    assert.equal(sample('sand', { ...open, shoreDistance: -3 }).beachDebris, 0, 'none below the waterline');
    assert.equal(sample('forest', { ...open, slopeDegrees: 40 }).treeSuitability, 0, 'no trees on 40 degree slopes');
    assert.ok(sample('forest', { ...open, wetness: 1 }).treeSuitability < sample('forest').treeSuitability, 'waterlogged hollows thin trees');
    assert.ok(sample('loam', { ...open, rockExposure: .9 }).grassDensity < .3 * sample('loam').grassDensity, 'exposed rock suppresses grass');
    assert.ok(sample('loam', { ...open, rockExposure: .9 }).rockScatter > .5, 'and scatters rocks');
    assert.equal(sample('loam', { ...open, shoreDistance: -1 }).grassDensity, 0, 'no grass under water');
    let previous = -1;
    for (let slope = 0; slope <= 45; slope += .5) {
        const value = sample('loam', { ...open, slopeDegrees: slope }).grassDensity;
        assert.ok(previous < 0 || value <= previous + 1e-12, 'grass never increases with slope');
        previous = value;
    }
});

test('Dressing inputs: mixed coverage blends linearly, planning cover suppresses everything and neutral fields are reported', () => {
    const mixed = sampleLandscapeDressingInputs({ soilWeights: { loam: 1, sand: 1 }, fields: open }), loam = sample('loam');
    assert.ok(Math.abs(mixed.grassDensity - loam.grassDensity / 2) < 1e-12, 'weights are normalized coverage');
    for (const key of LANDSCAPE_DRESSING_INPUTS.outputs) assert.equal(sample('forest', open, 1)[key], 0, `${key} is reserved under planning cover`);
    const neutral = sampleLandscapeDressingInputs({ soilWeights: { loam: 1 } });
    assert.equal(neutral.fieldsAvailable, false);
    assert.ok(neutral.grassDensity > 0);
    for (const key of LANDSCAPE_DRESSING_INPUTS.outputs) for (const soil of LANDSCAPE_DRESSING_INPUTS.soils) {
        const value = sample(soil, { ...open, rockExposure: 1, wetness: 1, slopeDegrees: 0, shoreDistance: 5 })[key];
        assert.ok(value >= 0 && value <= 1);
    }
    assert.throws(() => sampleLandscapeDressingInputs({ soilWeights: { lava: 1 } }), /do not know soil lava/);
    assert.throws(() => sampleLandscapeDressingInputs({ soilWeights: { loam: 0 } }), /positive total/);
    assert.throws(() => sampleLandscapeDressingInputs({ soilWeights: { loam: 1 }, planningShare: 2 }), /planningShare/);
    assert.throws(() => sampleLandscapeDressingInputs({ soilWeights: { loam: 1 }, fields: { ...open, wetness: NaN } }), /wetness/);
});
