// Node unit tests: SSAO runtime parameter resolver.
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSsaoPassParams } from '../../../src/graphics/visuals/postprocessing/SsaoPassConfig.js';

test('SsaoPassConfig: zero intensity disables SSAO params', () => {
    const params = resolveSsaoPassParams({
        quality: 'medium',
        radius: 8,
        intensity: 0,
        dynamicScale: 1,
        cameraNear: 0.5,
        cameraFar: 1800
    });

    assert.equal(params.enabled, false);
    assert.equal(params.kernelRadius, 0);
    assert.equal(params.maxDistance, 0);
    assert.equal(params.effectiveIntensity, 0);
});

test('SsaoPassConfig: intensity changes kernel and distance scales', () => {
    const low = resolveSsaoPassParams({
        quality: 'medium',
        radius: 8,
        intensity: 0.2,
        dynamicScale: 1,
        cameraNear: 0.5,
        cameraFar: 1800
    });
    const high = resolveSsaoPassParams({
        quality: 'medium',
        radius: 8,
        intensity: 2,
        dynamicScale: 1,
        cameraNear: 0.5,
        cameraFar: 1800
    });

    assert.equal(low.enabled, true);
    assert.equal(high.enabled, true);
    assert.ok(high.maxDistance > low.maxDistance);
    assert.ok(high.kernelRadius > low.kernelRadius);
    assert.ok(high.minDistance < low.minDistance);
    assert.ok(high.effectiveIntensity > low.effectiveIntensity);
});

test('SsaoPassConfig: quality preset changes tuning limits', () => {
    const low = resolveSsaoPassParams({
        quality: 'low',
        radius: 8,
        intensity: 0.35,
        dynamicScale: 1,
        cameraNear: 0.5,
        cameraFar: 1800
    });
    const high = resolveSsaoPassParams({
        quality: 'high',
        radius: 8,
        intensity: 0.35,
        dynamicScale: 1,
        cameraNear: 0.5,
        cameraFar: 1800
    });

    assert.equal(low.enabled, true);
    assert.equal(high.enabled, true);
    assert.ok(high.maxDistance > low.maxDistance);
    assert.ok(high.kernelRadius > low.kernelRadius);
});

test('SsaoPassConfig: far camera range scales normalized depth thresholds down', () => {
    const compactRange = resolveSsaoPassParams({
        quality: 'medium',
        radius: 8,
        intensity: 0.35,
        dynamicScale: 1,
        cameraNear: 0.5,
        cameraFar: 100
    });
    const wideRange = resolveSsaoPassParams({
        quality: 'medium',
        radius: 8,
        intensity: 0.35,
        dynamicScale: 1,
        cameraNear: 0.5,
        cameraFar: 1800
    });

    assert.ok(compactRange.maxDistance > wideRange.maxDistance);
    assert.ok(compactRange.minDistance > wideRange.minDistance);
    assert.ok(wideRange.maxDistance > wideRange.minDistance);
});
