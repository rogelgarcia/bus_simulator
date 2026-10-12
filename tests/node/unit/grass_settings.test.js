import test from 'node:test';
import assert from 'node:assert/strict';
import { GRASS_DEFAULTS, GRASS_STORAGE_KEY, sanitizeGrassSettings, getResolvedGrassSettings, saveGrassSettings, clearSavedGrassSettings } from '../../../src/app/grass/GrassSettings.js';
import { createOptionsPresetFromDraft, parseOptionsPresetJson } from '../../../src/graphics/gui/options/OptionsPreset.js';

test('Grass defaults and obsolete settings select 3D, while Texture is explicit', () => {
    for (const value of [null, {}, { mode: 'invalid' }, { mode: 'current' }, { mode: '3d' }]) assert.deepEqual(sanitizeGrassSettings(value), GRASS_DEFAULTS);
    assert.deepEqual(sanitizeGrassSettings({ mode: 'texture' }), { mode: 'texture' });
});

test('Grass storage survives reload and resets to the source default', () => {
    const old = globalThis.localStorage, values = new Map();
    globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    try {
        assert.equal(getResolvedGrassSettings().mode, '3d');
        assert.equal(saveGrassSettings({ mode: 'texture' }), true);
        assert.equal(getResolvedGrassSettings().mode, 'texture');
        assert.equal(clearSavedGrassSettings(), true);
        assert.equal(getResolvedGrassSettings().mode, '3d');
        values.set(GRASS_STORAGE_KEY, '{bad');
        assert.equal(getResolvedGrassSettings().mode, '3d');
    } finally { if (old === undefined) delete globalThis.localStorage; else globalThis.localStorage = old; }
});

test('Grass presets retain explicit Texture and migrate missing mode without retaining the edge strip', () => {
    const preset = createOptionsPresetFromDraft({ grass: { mode: 'texture' }, asphaltNoise: { livedIn: { sidewalkGrassEdgeStrip: { enabled: true } } } });
    assert.equal(preset.settings.grass.mode, 'texture');
    assert.equal(preset.settings.asphaltNoise.livedIn.sidewalkGrassEdgeStrip, undefined);
    const legacy = parseOptionsPresetJson(JSON.stringify({ schema: 'bus_sim.options_preset', version: 1, settings: {} }));
    assert.equal(legacy.settings.grass.mode, '3d');
});
