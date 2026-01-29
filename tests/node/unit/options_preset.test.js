// Node unit tests: Options preset schema + sanitization.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    OPTIONS_PRESET_SCHEMA_ID,
    OPTIONS_PRESET_VERSION,
    applyOptionsPresetToDraft,
    createOptionsPresetFromDraft,
    parseOptionsPresetJson
} from '../../../src/graphics/gui/options/OptionsPreset.js';

test('OptionsPreset: createOptionsPresetFromDraft produces schema + clamps', () => {
    const preset = createOptionsPresetFromDraft({
        lighting: { exposure: 999, hemiIntensity: -1, sunIntensity: '2', ibl: { enabled: 'yes', envMapIntensity: 999, setBackground: 0 } },
        bloom: { enabled: 1, strength: 999, radius: -1, threshold: 'nope' },
        colorGrading: { preset: 'Filmic', intensity: 999 },
        sunFlare: { enabled: '0', preset: 'Subtle', strength: -1, components: { core: 0, halo: 1, starburst: 'yes', ghosting: null } },
        buildingWindowVisuals: { reflective: { enabled: 'yes', glass: { colorHex: -1, metalness: 2, roughness: -1, transmission: 2, ior: 999, envMapIntensity: 999 } } },
        asphaltNoise: { coarse: { scale: 999 }, fine: { scale: 999 }, color: { value: 999, warmCool: -999, saturation: 999 } }
    });

    assert.equal(preset.schema, OPTIONS_PRESET_SCHEMA_ID);
    assert.equal(preset.version, OPTIONS_PRESET_VERSION);
    assert.equal(preset.settings.lighting.exposure, 5);
    assert.equal(preset.settings.lighting.hemiIntensity, 0);
    assert.equal(preset.settings.lighting.sunIntensity, 2);
    assert.equal(preset.settings.lighting.ibl.envMapIntensity, 5);
    assert.equal(preset.settings.bloom.strength, 3);
    assert.equal(preset.settings.bloom.radius, 0);
    assert.equal(preset.settings.bloom.threshold, 5);
    assert.equal(preset.settings.colorGrading.intensity, 1);
    assert.equal(preset.settings.sunFlare.enabled, false);
    assert.equal(preset.settings.sunFlare.strength, 0);
    assert.equal(preset.settings.buildingWindowVisuals.reflective.glass.metalness, 1);
    assert.equal(preset.settings.buildingWindowVisuals.reflective.glass.roughness, 0);
    assert.equal(preset.settings.buildingWindowVisuals.reflective.glass.transmission, 1);
    assert.equal(preset.settings.buildingWindowVisuals.reflective.glass.ior, 2.5);
    assert.equal(preset.settings.buildingWindowVisuals.reflective.glass.envMapIntensity, 5);
    assert.equal(preset.settings.asphaltNoise.coarse.scale, 10);
    assert.equal(preset.settings.asphaltNoise.fine.scale, 15);
    assert.equal(preset.settings.asphaltNoise.color.value, 0.35);
    assert.equal(preset.settings.asphaltNoise.color.warmCool, -0.25);
    assert.equal(preset.settings.asphaltNoise.color.saturation, 0.5);
});

test('OptionsPreset: parse migrates legacy shape (no version)', () => {
    const json = JSON.stringify({
        lighting: { exposure: 2.2 },
        includes: { bloom: false }
    });
    const preset = parseOptionsPresetJson(json);
    assert.equal(preset.version, 1);
    assert.equal(preset.settings.lighting.exposure, 2.2);
    assert.equal(preset.includes.bloom, false);
});

test('OptionsPreset: applyOptionsPresetToDraft respects includes', () => {
    const base = {
        lighting: { exposure: 1.6, hemiIntensity: 0.85, sunIntensity: 1.2, ibl: { enabled: false, envMapIntensity: 0.25, setBackground: false } },
        bloom: { enabled: false, strength: 0.2, radius: 0.1, threshold: 1.05 }
    };
    const preset = parseOptionsPresetJson(JSON.stringify({
        version: 1,
        schema: OPTIONS_PRESET_SCHEMA_ID,
        includes: { bloom: false },
        settings: { lighting: { exposure: 3.0 }, bloom: { enabled: true } }
    }));
    const merged = applyOptionsPresetToDraft(base, preset);
    assert.equal(merged.lighting.exposure, 3);
    assert.equal(merged.bloom.enabled, false);
});

test('OptionsPreset: antiAliasing is included and sanitized', () => {
    const preset = createOptionsPresetFromDraft({
        antiAliasing: {
            mode: 'FXAA',
            msaa: { samples: 999 },
            smaa: { preset: 'ULTRA', threshold: -1, maxSearchSteps: 999, maxSearchStepsDiag: -1, cornerRounding: 999 },
            fxaa: { preset: 'sharp', edgeThreshold: 999 }
        }
    });

    assert.equal(preset.settings.antiAliasing.mode, 'fxaa');
    assert.equal(preset.settings.antiAliasing.msaa.samples, 8);
    assert.equal(preset.settings.antiAliasing.smaa.preset, 'ultra');
    assert.equal(preset.settings.antiAliasing.smaa.threshold, 0.01);
    assert.equal(preset.settings.antiAliasing.smaa.maxSearchSteps, 64);
    assert.equal(preset.settings.antiAliasing.smaa.maxSearchStepsDiag, 0);
    assert.equal(preset.settings.antiAliasing.smaa.cornerRounding, 100);
    assert.equal(preset.settings.antiAliasing.fxaa.edgeThreshold, 0.5);
});
