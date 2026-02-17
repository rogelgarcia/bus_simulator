// Node unit tests: shared deterministic noise foundation behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createValueNoise2DSampler, hashIntPairU32, hashStringToU32, sampleFbm2D } from '../../../src/app/core/noise/DeterministicNoise.js';

test('DeterministicNoise: same seed and coordinates are stable', () => {
    const seed = hashStringToU32('determinism-seed');
    const sampler = createValueNoise2DSampler({
        hashU32: (ix, iy) => hashIntPairU32(ix, iy, seed),
        smoothing: 'hermite'
    });

    const sampleA = sampler.sample(12.345, -6.789);
    const sampleB = sampler.sample(12.345, -6.789);

    assert.equal(seed, 897675844);
    assert.equal(sampleA, sampleB);
    assert.equal(sampleA, 0.5283398288154739);
});

test('DeterministicNoise: fBm output is deterministic for normalized and custom-advance modes', () => {
    const seed = hashStringToU32('determinism-seed');
    const sampler = createValueNoise2DSampler({
        hashU32: (ix, iy) => hashIntPairU32(ix, iy, seed),
        smoothing: 'hermite'
    });

    const normalized = sampleFbm2D(1.234, 5.678, {
        noise2: sampler.sample,
        octaves: 5,
        gain: 0.53,
        lacunarity: 2.11,
        maxOctaves: 8
    });

    const legacyAdvance = sampleFbm2D(1.234, 5.678, {
        noise2: sampler.sample,
        octaves: 4,
        gain: 0.5,
        initialAmplitude: 0.5,
        normalize: false,
        advance: ({ x, y }) => ({
            x: x * 2.03 + 17.7,
            y: y * 2.11 + 31.3
        })
    });

    assert.equal(normalized, 0.46949689729989574);
    assert.equal(legacyAdvance, 0.4697383836297831);
});
