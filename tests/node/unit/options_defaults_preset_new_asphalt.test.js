// Node unit tests: preset promotion (new_asphalt) matches code defaults.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDefaultResolvedLightingSettings } from '../../../src/graphics/lighting/LightingSettings.js';
import { getDefaultResolvedBloomSettings } from '../../../src/graphics/visuals/postprocessing/BloomSettings.js';
import { getDefaultResolvedColorGradingSettings } from '../../../src/graphics/visuals/postprocessing/ColorGradingSettings.js';
import { getDefaultResolvedBuildingWindowVisualsSettings } from '../../../src/graphics/visuals/buildings/BuildingWindowVisualsSettings.js';
import { getDefaultResolvedAsphaltNoiseSettings } from '../../../src/graphics/visuals/city/AsphaltNoiseSettings.js';
import { getDefaultResolvedSunFlareSettings } from '../../../src/graphics/visuals/sun/SunFlareSettings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function readPreset() {
    const filePath = path.resolve(repoRoot, 'downloads/bus_sim_options_preset_new_asphalt.json');
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
}

test('Options defaults: promoted new_asphalt preset matches code defaults', () => {
    const preset = readPreset();
    assert.equal(preset.schema, 'bus_sim.options_preset');
    assert.equal(preset.version, 1);
    assert.equal(preset.name, 'new_asphalt');
    assert.ok(preset.settings);

    const s = preset.settings;

    const lighting = getDefaultResolvedLightingSettings();
    assert.equal(lighting.exposure, s.lighting.exposure);
    assert.equal(lighting.hemiIntensity, s.lighting.hemiIntensity);
    assert.equal(lighting.sunIntensity, s.lighting.sunIntensity);
    assert.equal(lighting.ibl.enabled, s.lighting.ibl.enabled);
    assert.equal(lighting.ibl.envMapIntensity, s.lighting.ibl.envMapIntensity);
    assert.equal(lighting.ibl.setBackground, s.lighting.ibl.setBackground);

    assert.deepEqual(getDefaultResolvedBloomSettings(), s.bloom);
    assert.deepEqual(getDefaultResolvedColorGradingSettings(), s.colorGrading);
    assert.deepEqual(getDefaultResolvedSunFlareSettings(), s.sunFlare);
    assert.deepEqual(getDefaultResolvedBuildingWindowVisualsSettings(), s.buildingWindowVisuals);
    assert.deepEqual(getDefaultResolvedAsphaltNoiseSettings(), s.asphaltNoise);
});

