// Verifies the AI 596 D6 altitude-scaled camera near plane: the clamp, the rebuild threshold and the depth-step arithmetic behind it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_CAMERA_DEPTH, landscapeCameraNear, landscapeCameraNearChanged, landscapeDepthStep } from '../../../src/graphics/engine3d/landscape/LandscapeCameraDepth.js';

const near = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) <= epsilon, `${a} differs from ${b}`);

test('LandscapeCameraDepth: the near plane is 0.002 x the height above ground clamped to [0.1, 8] m', () => {
    assert.deepEqual({ ...LANDSCAPE_CAMERA_DEPTH }, { nearPerMeter: 0.002, nearMinMeters: 0.1, nearMaxMeters: 8, farMeters: 25000, updateFraction: 0.1, depthBits: 24 });
    assert.ok(Object.isFrozen(LANDSCAPE_CAMERA_DEPTH));
    near(landscapeCameraNear(0), 0.1);
    near(landscapeCameraNear(1.7), 0.1);
    near(landscapeCameraNear(49.9), 0.1);
    near(landscapeCameraNear(50), 0.1);
    near(landscapeCameraNear(100), 0.2);
    near(landscapeCameraNear(500), 1);
    near(landscapeCameraNear(1000), 2);
    near(landscapeCameraNear(1047.78), 2.09556);
    near(landscapeCameraNear(4000), 8);
    near(landscapeCameraNear(4000.1), 8);
    near(landscapeCameraNear(25000), 8);
    near(landscapeCameraNear(-30), 0.1, 0);
    for (const value of [NaN, Infinity, -Infinity, '100', null, undefined, {}]) assert.throws(() => landscapeCameraNear(/** @type {any} */ (value)), /height above ground must be a finite number/);
});

test('LandscapeCameraDepth: the projection is rebuilt only when the near plane moves by more than a tenth', () => {
    assert.equal(landscapeCameraNearChanged(0.1, 0.1), false);
    assert.equal(landscapeCameraNearChanged(0.1, 0.109), false);
    assert.equal(landscapeCameraNearChanged(0.1, 0.091), false);
    assert.equal(landscapeCameraNearChanged(0.1, 0.1101), true);
    assert.equal(landscapeCameraNearChanged(0.1, 0.0899), true);
    assert.equal(landscapeCameraNearChanged(2, 1.85), false);
    assert.equal(landscapeCameraNearChanged(2, 1.7), true);
    assert.equal(landscapeCameraNearChanged(2, 2.19), false);
    assert.equal(landscapeCameraNearChanged(2, 2.21), true);
    assert.equal(landscapeCameraNearChanged(8, 2), true);
    // a hovering camera whose ground sample jitters by centimetres never rebuilds: 1 km up, +-10 m of height moves near by +-0.02 m (1 %)
    assert.equal(landscapeCameraNearChanged(landscapeCameraNear(1000), landscapeCameraNear(1010)), false);
    assert.equal(landscapeCameraNearChanged(landscapeCameraNear(1000), landscapeCameraNear(1101)), true);
    assert.throws(() => landscapeCameraNearChanged(0, 0.1), /must be positive/);
    assert.throws(() => landscapeCameraNearChanged(0.1, -1), /must be positive/);
    assert.throws(() => landscapeCameraNearChanged(NaN, 0.1), /current near plane must be a finite number/);
    assert.throws(() => landscapeCameraNearChanged(0.1, /** @type {any} */ ('2')), /next near plane must be a finite number/);
});

test('LandscapeCameraDepth: the 24-bit depth step is d^2 / (near 2^24) at the viewer far plane', () => {
    // the arithmetic quoted by LANDSCAPE_VIEWER.md: about 15 m at 5 km with near 0.1, about 0.75 m with near 2, about 60 m at 10 km with near 0.1
    near(landscapeDepthStep(5000, 0.1), 14.9, 0.05);
    near(landscapeDepthStep(5000, 2), 0.745, 0.005);
    near(landscapeDepthStep(5000, 8), 0.186, 0.001);
    near(landscapeDepthStep(10000, 0.1), 59.6, 0.1);
    // the flyover's worst frame (2089, 1047.8 m above ground) now resolves 0.7 m at 5 km, where it resolved 15 m
    near(landscapeDepthStep(5000, landscapeCameraNear(1047.78)), 0.711, 0.002);
    // exact form: d^2 (f - n) / (n f 2^bits); a 16-bit buffer is 256 x coarser
    near(landscapeDepthStep(5000, 0.1, { farMeters: 25000, bits: 24 }), 5000 * 5000 * (25000 - 0.1) / (0.1 * 25000 * 2 ** 24));
    near(landscapeDepthStep(5000, 0.1, { bits: 16 }), landscapeDepthStep(5000, 0.1) * 256);
    assert.ok(landscapeDepthStep(1000, 0.1) < landscapeDepthStep(2000, 0.1) && landscapeDepthStep(2000, 0.1) < landscapeDepthStep(4000, 0.1));
    assert.throws(() => landscapeDepthStep(0.05, 0.1), /0 < near <= distance <= far/);
    assert.throws(() => landscapeDepthStep(30000, 0.1), /0 < near <= distance <= far/);
    assert.throws(() => landscapeDepthStep(5000, 0), /0 < near <= distance <= far/);
    assert.throws(() => landscapeDepthStep(5000, 0.1, { bits: 2.5 }), /integer bits/);
    assert.throws(() => landscapeDepthStep(NaN, 0.1), /view distance must be a finite number/);
});
