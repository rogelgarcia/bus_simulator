// Node unit tests: Sun flare settings sanitization.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getSunFlarePresetById } from '../../../src/graphics/visuals/sun/SunFlarePresets.js';
import { getDefaultResolvedSunFlareSettings, sanitizeSunFlareSettings } from '../../../src/graphics/visuals/sun/SunFlareSettings.js';

test('SunFlareSettings: defaults are sane', () => {
    const d = getDefaultResolvedSunFlareSettings();
    assert.equal(typeof d.enabled, 'boolean');
    assert.equal(typeof d.preset, 'string');
    assert.equal(typeof d.strength, 'number');
    assert.ok(d.strength >= 0 && d.strength <= 2);
});

test('SunFlareSettings: sanitize clamps and normalizes', () => {
    const s = sanitizeSunFlareSettings({
        enabled: 0,
        preset: ' CINEMATIC ',
        strength: 999
    });

    assert.deepEqual(s, {
        enabled: false,
        preset: 'cinematic',
        strength: 2
    });
});

test('SunFlarePresets: lookup returns a preset', () => {
    const p = getSunFlarePresetById('subtle');
    assert.ok(p);
    assert.equal(p.id, 'subtle');
    assert.ok(p.core?.sizePx > 0);
});

