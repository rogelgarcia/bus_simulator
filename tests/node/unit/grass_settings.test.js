import test from 'node:test';
import assert from 'node:assert/strict';
import { GRASS_DEFAULTS, GRASS_STORAGE_KEY, sanitizeGrassSettings, getResolvedGrassSettings, saveGrassSettings, clearSavedGrassSettings } from '../../../src/app/grass/GrassSettings.js';
import { createOptionsPresetFromDraft, parseOptionsPresetJson } from '../../../src/graphics/gui/options/OptionsPreset.js';

test('Grass defaults to High and migrates Texture/3D settings', () => {
    for (const value of [null, {}, { mode: 'invalid' }, { mode: 'current' }, { mode: '3d' }]) assert.deepEqual(sanitizeGrassSettings(value), GRASS_DEFAULTS);
    assert.deepEqual(GRASS_DEFAULTS, { mode: 'high' });
    assert.deepEqual(sanitizeGrassSettings({ mode: 'texture' }), { mode: 'flat' });
    for (const mode of ['flat', 'low', 'medium', 'high', 'ultra']) assert.deepEqual(sanitizeGrassSettings({ mode }), { mode });
});

test('Grass storage survives reload and resets to the source default', () => {
    const old = globalThis.localStorage, values = new Map();
    globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    try {
        assert.equal(getResolvedGrassSettings().mode, 'high');
        for (const mode of ['flat', 'low', 'medium', 'high', 'ultra']) {
            assert.equal(saveGrassSettings({ mode }), true);
            assert.equal(getResolvedGrassSettings().mode, mode);
        }
        values.set(GRASS_STORAGE_KEY, JSON.stringify({ mode: 'texture' }));
        assert.equal(getResolvedGrassSettings().mode, 'flat');
        values.set(GRASS_STORAGE_KEY, JSON.stringify({ mode: '3d' }));
        assert.equal(getResolvedGrassSettings().mode, 'high');
        assert.equal(clearSavedGrassSettings(), true);
        assert.equal(getResolvedGrassSettings().mode, 'high');
        values.set(GRASS_STORAGE_KEY, '{bad');
        assert.equal(getResolvedGrassSettings().mode, 'high');
    } finally { if (old === undefined) delete globalThis.localStorage; else globalThis.localStorage = old; }
});

test('Grass presets migrate Texture, preserve quality and omit the obsolete edge strip', () => {
    const preset = createOptionsPresetFromDraft({ grass: { mode: 'texture' }, asphaltNoise: { livedIn: { sidewalkGrassEdgeStrip: { enabled: true } } } });
    assert.equal(preset.settings.grass.mode, 'flat');
    assert.equal(preset.settings.asphaltNoise.livedIn.sidewalkGrassEdgeStrip, undefined);
    const legacy = parseOptionsPresetJson(JSON.stringify({ schema: 'bus_sim.options_preset', version: 1, settings: {} }));
    assert.equal(legacy.settings.grass.mode, 'high');
    for (const mode of ['flat', 'low', 'medium', 'high', 'ultra']) {
        const preset = createOptionsPresetFromDraft({ grass: { mode } });
        assert.equal(parseOptionsPresetJson(JSON.stringify(preset)).settings.grass.mode, mode);
    }
});
