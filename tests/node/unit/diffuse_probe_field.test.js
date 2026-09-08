// Validates corrupt/oversized payload rejection and the directional irradiance contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDiffuseProbeField, ambientCubeIrradiance, decodeProbeOctDirection } from '../../../src/app/illumination/diffuse_probes/DiffuseProbeField.js';
import { sanitizeBakedLightingSettings } from '../../../src/app/illumination/runtime/BakedLightingSettings.js';
import { createOptionsPresetFromDraft, parseOptionsPresetJson, applyOptionsPresetToDraft } from '../../../src/graphics/gui/options/OptionsPreset.js';
const fixture = () => ({ schema: 'bus-sim-diffuse-probes-v1', representation: 'ambient-cube-irradiance-oct-depth-v1',
    regions: [{ origin: [0,0,0], spacing: [4,1,4], size: [2,2,2], offset: 0 }], count: 8, width: 70,
    depthSize: 8, maxDistance: 40, bytes: 8*70*16, sourceHash: 'a'.repeat(64), sha256: 'b'.repeat(64),
    sourceProfiles: [], cityId: 'fixture' });
test('probe fields reject invalid grids, identities and non-finite data before allocation/upload', () => {
    const field = fixture(), data = new Float32Array(field.bytes / 4);
    assert.equal(validateDiffuseProbeField(field, data), field);
    for (const patch of [{ count: 20000 }, { bytes: 1 }, { sourceHash: '' }, { width: 4 }, { depthSize: 0 }]) assert.throws(() => validateDiffuseProbeField({ ...field, ...patch }));
    assert.throws(() => validateDiffuseProbeField(field, new Float32Array(1)));
    data[0] = NaN; assert.throws(() => validateDiffuseProbeField(field, data));
    data[0] = 0; data[3] = .5; assert.throws(() => validateDiffuseProbeField(field, data));
    field.regions[0].spacing[1] = 0; assert.throws(() => validateDiffuseProbeField(field));
});
test('ambient cube preserves constant irradiance and separates positive/negative normals', () => {
    const constant = Array.from({ length: 6 }, () => [2,3,4]);
    for (const normal of [[0,1,0],[1,2,3],[-1,-2,-3]]) ambientCubeIrradiance(constant, normal).forEach((v,i) => assert.ok(Math.abs(v - constant[0][i]) < 1e-10));
    const directions = Array.from({ length: 6 }, (_, i) => [i,i,i]);
    assert.deepEqual(ambientCubeIrradiance(directions, [0,-1,0]), [3,3,3]);
    for (let i = 0; i < 64; i++) assert.ok(Math.abs(Math.hypot(...decodeProbeOctDirection((i%8+.5)/8, (Math.floor(i/8)+.5)/8)) - 1) < 1e-10);
});
test('bus enhancements remain opt-in and preserve separate material/probe intent across modes', () => {
    assert.deepEqual(sanitizeBakedLightingSettings({}).bus, { enabled: false, materials: true, probes: true });
    for (const mode of ['current', 'baked', 'auto']) {
        const value = sanitizeBakedLightingSettings({ mode, bus: { enabled: true, materials: false, probes: true } });
        assert.deepEqual(value.bus, { enabled: true, materials: false, probes: true });
        assert.deepEqual(sanitizeBakedLightingSettings(value), value);
    }
});

test('bus feature preferences round-trip through presets without enabling legacy saves', () => {
    const bus={enabled:true,materials:false,probes:true};
    const preset=createOptionsPresetFromDraft({bakedLighting:{mode:'auto',bus}});
    const imported=parseOptionsPresetJson(JSON.stringify(preset));
    assert.deepEqual(applyOptionsPresetToDraft({},imported).bakedLighting.bus,bus);
    assert.equal(parseOptionsPresetJson(JSON.stringify({bakedLighting:{receivers:{indirect:true}}})).settings.bakedLighting.bus.enabled,false);
});
