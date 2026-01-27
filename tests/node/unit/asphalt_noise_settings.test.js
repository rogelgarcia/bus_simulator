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
    assert.equal(typeof d.markings?.enabled, 'boolean');
    assert.equal(typeof d.markings?.colorStrength, 'number');
    assert.equal(typeof d.markings?.roughnessStrength, 'number');
    assert.equal(typeof d.markings?.debug, 'boolean');
    assert.equal(typeof d.color?.value, 'number');
    assert.equal(typeof d.color?.warmCool, 'number');
    assert.equal(typeof d.color?.saturation, 'number');
    assert.equal(typeof d.livedIn?.edgeDirt?.enabled, 'boolean');
    assert.equal(typeof d.livedIn?.edgeDirt?.strength, 'number');
    assert.equal(typeof d.livedIn?.edgeDirt?.width, 'number');
    assert.equal(typeof d.livedIn?.cracks?.strength, 'number');
    assert.equal(typeof d.livedIn?.patches?.coverage, 'number');
    assert.equal(typeof d.livedIn?.tireWear?.scale, 'number');
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
        fine: { scale: 999 },
        markings: { enabled: 'yes', colorStrength: 999, roughnessStrength: -999, debug: 1 },
        color: { value: 999, warmCool: -999, saturation: 999 },
        livedIn: { edgeDirt: { width: 999 }, patches: { coverage: -999 } }
    });
    assert.equal(s.coarse.scale, 10);
    assert.equal(s.fine.scale, 15);
    assert.equal(s.markings.enabled, true);
    assert.equal(s.markings.colorStrength, 0.5);
    assert.equal(s.markings.roughnessStrength, 0);
    assert.equal(s.markings.debug, true);
    assert.equal(s.color.value, 0.35);
    assert.equal(s.color.warmCool, -0.25);
    assert.equal(s.color.saturation, 0.5);
    assert.equal(s.livedIn.edgeDirt.width, 2);
    assert.equal(s.livedIn.patches.coverage, 0);
});

test('AsphaltNoiseSettings: getResolved works without window', () => {
    const resolved = getResolvedAsphaltNoiseSettings();
    assert.deepEqual(resolved, getDefaultResolvedAsphaltNoiseSettings());
});
