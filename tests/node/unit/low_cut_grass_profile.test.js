// Node unit tests: low-cut grass profile, deterministic bake source, and runtime derivation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createDefaultLowCutGrassProfile,
    createLowCutGrassAuthoringBladeDescriptors,
    createLowCutGrassRuntimeBladeData,
    deriveLowCutGrassRuntimeProfile,
    getLowCutGrassAuthoringSignature,
    LOW_CUT_GRASS_AUTHORING_SOURCE_MESH_ID,
    LOW_CUT_GRASS_PROFILE_SCHEMA,
    LOW_CUT_GRASS_PROFILE_VERSION,
    LOW_CUT_GRASS_RUNTIME_SOURCE_MESH_ID,
    parseLowCutGrassProfileJson,
    sanitizeLowCutGrassProfile,
    serializeLowCutGrassProfile
} from '../../../src/graphics/engine3d/grass/LowCutGrassProfile.js';

test('LowCutGrassProfile: defaults target maintained 25-30 mm turf', () => {
    const profile = createDefaultLowCutGrassProfile();
    assert.equal(profile.schema, LOW_CUT_GRASS_PROFILE_SCHEMA);
    assert.equal(profile.version, LOW_CUT_GRASS_PROFILE_VERSION);
    assert.deepEqual(profile.blade.heightMeters, { min: 0.025, max: 0.030 });
    assert.ok(profile.blade.widthMeters.min >= 0.001);
    assert.ok(profile.blade.widthMeters.max <= 0.004);
    assert.equal(profile.carpet.layout, 'area_patch');
    assert.equal(profile.accents.layout, 'localized_tufts');
});

test('LowCutGrassProfile: sanitizer clamps controls and preserves carpet/accent separation', () => {
    const profile = sanitizeLowCutGrassProfile({
        profileId: 'custom.lowcut',
        seed: 'stable',
        blade: { heightMeters: { min: -1, max: 1 }, widthMeters: { min: 0, max: 1 } },
        shape: {
            bendDegrees: { mean: 90, variation: -1 },
            inclinationDegrees: { mean: -90, variation: 100 },
            curvature: { mean: 8, variation: 8 }
        },
        appearance: { dryness: 4, humidity: -2 },
        carpet: { layout: 'localized_tufts', coverage: 8 },
        accents: { layout: 'area_patch', bladesPerTuft: 99 }
    });
    assert.deepEqual(profile.blade.heightMeters, { min: 0.015, max: 0.080 });
    assert.deepEqual(profile.blade.widthMeters, { min: 0.0008, max: 0.010 });
    assert.deepEqual(profile.shape.bendDegrees, { mean: 60, variation: 0 });
    assert.equal(profile.appearance.dryness, 1);
    assert.equal(profile.appearance.humidity, 0);
    assert.equal(profile.carpet.layout, 'area_patch');
    assert.equal(profile.accents.layout, 'localized_tufts');
    assert.equal(profile.accents.bladesPerTuft, 32);
});

test('LowCutGrassProfile: export/import is stable and rejects incompatible documents', () => {
    const original = createDefaultLowCutGrassProfile();
    original.seed = 'roundtrip';
    original.shape.curvature.mean = 0.82;
    const json = serializeLowCutGrassProfile(original);
    const imported = parseLowCutGrassProfileJson(json);
    assert.deepEqual(imported, sanitizeLowCutGrassProfile(original));
    assert.equal(serializeLowCutGrassProfile(imported), json);
    assert.throws(() => parseLowCutGrassProfileJson('{"schema":"wrong","version":1}'), /Unsupported schema/);
    assert.throws(() => parseLowCutGrassProfileJson(`{"schema":"${LOW_CUT_GRASS_PROFILE_SCHEMA}","version":2}`), /Unsupported version/);
});

test('LowCutGrassProfile: identical profile and seed reproduce authored blades and signature', () => {
    const profile = createDefaultLowCutGrassProfile();
    const first = createLowCutGrassAuthoringBladeDescriptors(profile);
    const second = createLowCutGrassAuthoringBladeDescriptors(parseLowCutGrassProfileJson(serializeLowCutGrassProfile(profile)));
    assert.deepEqual(first, second);
    assert.equal(getLowCutGrassAuthoringSignature(profile), getLowCutGrassAuthoringSignature(profile));
    assert.ok(first.every((blade) => blade.heightMeters >= 0.025 && blade.heightMeters <= 0.030));
    assert.ok(first.every((blade) => blade.widthMeters >= 0.0022 && blade.widthMeters <= 0.0032));

    const changed = createDefaultLowCutGrassProfile();
    changed.seed = 'different';
    assert.notDeepEqual(createLowCutGrassAuthoringBladeDescriptors(changed), first);
    assert.notEqual(getLowCutGrassAuthoringSignature(changed), getLowCutGrassAuthoringSignature(profile));
});

test('LowCutGrassProfile: runtime blade is one triangle and one material path', () => {
    const profile = createDefaultLowCutGrassProfile();
    const blade = createLowCutGrassRuntimeBladeData(profile);
    assert.equal(blade.sourceMeshId, LOW_CUT_GRASS_RUNTIME_SOURCE_MESH_ID);
    assert.equal(blade.triangleCount, 1);
    assert.equal(blade.materialSlots, 1);
    assert.equal(blade.groupCount, 0);
    assert.equal(blade.vertexColors, true);
    assert.equal(blade.positions.length, 9);
    assert.equal(blade.colors.length, 9);
    assert.deepEqual(blade.indices, [0, 1, 2]);

    const runtime = deriveLowCutGrassRuntimeProfile(profile);
    assert.equal(runtime.geometry.sourceMeshId, LOW_CUT_GRASS_RUNTIME_SOURCE_MESH_ID);
    assert.equal(runtime.geometry.triangleCount, 1);
    assert.equal(runtime.geometry.materialSlots, 1);
    assert.equal(runtime.carpet.layout, 'area_patch');
    assert.equal(runtime.accents.layout, 'localized_tufts');
    assert.equal('authoring' in runtime, false);
    assert.equal(LOW_CUT_GRASS_AUTHORING_SOURCE_MESH_ID.includes('hires'), true);
});
