// Validates conservative screen-space sun-bloom occluder selection rules.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    expandNdcRect,
    isNdcRectViewportRelevant,
    shouldRetainSunBloomOccluder
} from '../../../src/graphics/visuals/postprocessing/SunBloomOcclusionMath.js';

test('Sun bloom filtering: fully offscreen emitter bounds are irrelevant', () => {
    assert.equal(isNdcRectViewportRelevant({ minX: 1.2, minY: -0.2, maxX: 1.6, maxY: 0.2 }), false);
});

test('Sun bloom filtering: guard band retains screen-edge overlap', () => {
    const effectRect = expandNdcRect({ minX: 0.9, minY: -0.1, maxX: 1.0, maxY: 0.1 }, 0.08, 0.08);
    assert.equal(shouldRetainSunBloomOccluder({
        effectRect,
        effectFarDepth: 100,
        occluderRect: { minX: 1.03, minY: -0.03, maxX: 1.06, maxY: 0.03 },
        occluderNearDepth: 20
    }), true);
});

test('Sun bloom filtering: an occluder behind every emitter is rejected', () => {
    assert.equal(shouldRetainSunBloomOccluder({
        effectRect: { minX: -0.2, minY: -0.2, maxX: 0.2, maxY: 0.2 },
        effectFarDepth: 80,
        occluderRect: { minX: -0.1, minY: -0.1, maxX: 0.1, maxY: 0.1 },
        occluderNearDepth: 90
    }), false);
});

test('Sun bloom filtering: a large nearby bound is retained when its center may be outside the effect', () => {
    assert.equal(shouldRetainSunBloomOccluder({
        effectRect: { minX: -0.1, minY: -0.1, maxX: 0.1, maxY: 0.1 },
        effectFarDepth: 100,
        occluderRect: { minX: -1.4, minY: -0.8, maxX: 0.05, maxY: 0.8 },
        occluderNearDepth: 2
    }), true);
});

test('Sun bloom filtering: missing or unsafe bounds remain conservatively eligible', () => {
    assert.equal(shouldRetainSunBloomOccluder({
        uncertain: true,
        effectRect: { minX: -0.1, minY: -0.1, maxX: 0.1, maxY: 0.1 },
        effectFarDepth: 100,
        occluderRect: { minX: 5, minY: 5, maxX: 6, maxY: 6 },
        occluderNearDepth: 200
    }), true);
});
