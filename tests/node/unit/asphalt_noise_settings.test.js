// Node unit tests: Asphalt noise settings sanitization.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getDefaultResolvedAsphaltNoiseSettings,
    getResolvedAsphaltNoiseSettings,
    sanitizeAsphaltNoiseSettings
} from '../../../src/graphics/visuals/city/AsphaltNoiseSettings.js';

test('AsphaltNoiseSettings: defaults are sane', () => {
    const d = getDefaultResolvedAsphaltNoiseSettings();
    assert.equal(typeof d.coarse?.albedo, 'boolean');
    assert.equal(typeof d.coarse?.roughness, 'boolean');
    assert.equal(typeof d.fine?.albedo, 'boolean');
    assert.equal(typeof d.fine?.roughness, 'boolean');
    assert.equal(typeof d.fine?.normal, 'boolean');
    assert.equal(typeof d.fine?.normalStrength, 'number');
});

test('AsphaltNoiseSettings: sanitize coerces booleans', () => {
    const s = sanitizeAsphaltNoiseSettings({ albedo: 0, roughness: 'yes' });
    assert.equal(s.coarse.albedo, false);
    assert.equal(s.coarse.roughness, true);
    assert.equal(typeof s.fine.albedo, 'boolean');
    assert.equal(typeof s.fine.roughness, 'boolean');
});

test('AsphaltNoiseSettings: sanitize supports nested coarse/fine', () => {
    const s = sanitizeAsphaltNoiseSettings({
        coarse: { albedo: 0, roughness: 1 },
        fine: { albedo: false, roughness: true }
    });
    assert.equal(s.coarse.albedo, false);
    assert.equal(s.coarse.roughness, true);
    assert.equal(s.fine.albedo, false);
    assert.equal(s.fine.roughness, true);
});

test('AsphaltNoiseSettings: sanitize clamps scale per layer', () => {
    const s = sanitizeAsphaltNoiseSettings({
        coarse: { scale: 999 },
        fine: { scale: 999 }
    });
    assert.equal(s.coarse.scale, 10);
    assert.equal(s.fine.scale, 15);
});

test('AsphaltNoiseSettings: getResolved works without window', () => {
    const resolved = getResolvedAsphaltNoiseSettings();
    assert.deepEqual(resolved, getDefaultResolvedAsphaltNoiseSettings());
});
