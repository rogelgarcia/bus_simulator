// Checks material relief competition, exact support and bounded footprint/tier transitions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_MATERIAL_BLEND, landscapeMaterialHeightDetail, sampleLandscapeMaterialBlend } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialBlend.js';

const blend = (weights, heights, detail = 1, extra = {}) => sampleLandscapeMaterialBlend({ weights, heights, details: weights.map(() => detail), ...extra });
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('Landscape material blend: true relief reverses the dominant material at equal semantic coverage', () => {
    assert.deepEqual(blend([.5, .5], [.85, .15]).weights, [1, 0]);
    assert.deepEqual(blend([.5, .5], [.15, .85]).weights, [0, 1]);
    assert.deepEqual(blend([.5, .5], [.5, .5]).weights, [.5, .5]);
    assert.equal(LANDSCAPE_MATERIAL_BLEND.measuredDisplacement, false);
});

test('Landscape material blend: absent high relief cannot leak into pure interiors or normalized junctions', () => {
    for (let active = 0; active < 6; active++) {
        const weights = Array.from({ length: 6 }, (_, index) => Number(index === active));
        assert.deepEqual(blend(weights, weights.map(weight => 1 - weight)).weights, weights);
    }
    for (let step = 0; step <= 500; step++) {
        const a = step / 500, weights = [a, (1 - a) * .7, (1 - a) * .3, 0, 0, 0];
        const result = blend(weights, [.1, .65, .95, 1, 1, 1]);
        close(result.weights.reduce((sum, weight) => sum + weight, 0), 1);
        assert.ok(result.weights.every(weight => Number.isFinite(weight) && weight >= 0 && weight <= 1));
        assert.deepEqual(result.weights.slice(3), [0, 0, 0]);
    }
});

test('Landscape material blend: an arriving support channel and competitor ties stay continuous', () => {
    const h = [.2, .2, .2, .2, .2, 1], epsilon = 1e-7;
    const before = blend([.2, .2, .2, .2, .2, 0], h).weights;
    const after = blend(Array.from({ length: 6 }, (_, index) => index === 5 ? epsilon : (1 - epsilon) / 5), h).weights;
    before.forEach((weight, index) => close(after[index], weight, 2e-6));
    const low = blend([.5 - epsilon, .5 + epsilon], [.5, .5]).weights;
    const high = blend([.5 + epsilon, .5 - epsilon], [.5, .5]).weights;
    close(low[0], high[0], 1e-5);
});

test('Landscape material blend: projected score footprints soften relief edges and remain finite on axis-aligned views', () => {
    const point = blend([.5, .5], [.6, .4]);
    const axis = blend([.5, .5], [.6, .4], 1, { scoreDx: [.4, -.4] });
    const diagonal = blend([.5, .5], [.6, .4], 1, { scoreDx: [.4, -.4], scoreDy: [.3, -.3] });
    assert.equal(point.weights[0], 1);
    assert.ok(axis.weights[0] > .5 && axis.weights[0] < point.weights[0]);
    assert.ok(diagonal.weights[0] > .5 && diagonal.weights[0] < axis.weights[0]);
    for (const result of [axis, diagonal]) close(result.weights.reduce((sum, weight) => sum + weight, 0), 1);
});

test('Landscape material blend: unresolved material tiers and minified footprints converge to categorical coverage', () => {
    const at = options => landscapeMaterialHeightDetail({ periodMeters: 4, resolution: 512, metersPerPixel: .01, ...options });
    assert.equal(at({}), 1);
    assert.equal(at({ enabled: false }), 0);
    assert.equal(at({ periodMeters: 16, resolution: 32 }), 0);
    assert.equal(at({ metersPerPixel: .3 }), 0);
    const coarse = at({ resolution: 32 }), fine = at({ resolution: 512 });
    assert.ok(coarse > 0 && coarse < fine);
    for (let index = 0; index <= 20; index++) {
        const transition = index / 20;
        close(at({ resolution: 32, targetResolution: 512, transition }), coarse * (1 - transition) + fine * transition);
    }
    const weights = [.25, .5, .25], heights = [.9, .1, .75];
    assert.deepEqual(blend(weights, heights, 0).weights, weights);
    const almostFar = blend(weights, heights, 1e-8).weights;
    weights.forEach((weight, index) => close(almostFar[index], weight, 1e-8));
});

test('Landscape material blend: tier replacement has identical endpoints and validates its public inputs', () => {
    const value = { periodMeters: 8, resolution: 32, targetResolution: 128, metersPerPixel: .015 };
    close(landscapeMaterialHeightDetail({ ...value, transition: 1 }), landscapeMaterialHeightDetail({ ...value, resolution: 128, transition: 0 }));
    assert.throws(() => landscapeMaterialHeightDetail({ ...value, resolution: 0 }), /positive/);
    assert.throws(() => blend([0, 0], [.5, .5]), /sum to one/);
    assert.throws(() => blend([.5, .5], [.5, 2]), /matching finite/);
});
