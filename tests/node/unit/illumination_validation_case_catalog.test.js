// Verifies the canonical AI 527/AI 531 illumination validation inventory.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    AI527_BIGCITY2_MAP_PROFILE,
    AI527_CARDINAL_VIEW_VECTORS,
    AI527_REGIONAL_CAMERA_PROFILE,
    ILLUMINATION_CIVIC_VALIDATION_CASES,
    ILLUMINATION_LAB_VALIDATION_CASES,
    ILLUMINATION_LOW_SUN_VALIDATION_CASES,
    ILLUMINATION_PROFILER_VALIDATION_CASES,
    ILLUMINATION_VALIDATION_CASE_BY_ID,
    ILLUMINATION_VALIDATION_CASES,
    getIlluminationValidationCase
} from '../../../src/app/illumination/validation/IlluminationValidationCaseCatalog.js';

const REGION_CELLS = Object.freeze([
    ['R1C1', 4, 3, -192, -216],
    ['R1C2', 7, 3, -120, -216],
    ['R1C3', 12, 3, 0, -216],
    ['R1C4', 17, 1, 120, -264],
    ['R1C5', 22, 1, 240, -264],
    ['R2C1', 3, 8, -216, -96],
    ['R2C2', 7, 6, -120, -144],
    ['R2C3', 12, 6, 0, -144],
    ['R2C4', 17, 6, 120, -144],
    ['R2C5', 23, 7, 264, -120],
    ['R3C1', 2, 12, -240, 0],
    ['R3C2', 7, 12, -120, 0],
    ['R3C3', 12, 14, 0, 48],
    ['R3C4', 15, 12, 72, 0],
    ['R3C5', 23, 12, 264, 0],
    ['R4C1', 2, 17, -240, 120],
    ['R4C2', 7, 17, -120, 120],
    ['R4C3', 12, 17, 0, 120],
    ['R4C4', 17, 17, 120, 120],
    ['R4C5', 21, 17, 216, 120],
    ['R5C1', 2, 21, -240, 216],
    ['R5C2', 7, 21, -120, 216],
    ['R5C3', 12, 21, 0, 216],
    ['R5C4', 17, 24, 120, 288],
    ['R5C5', 21, 22, 216, 240]
]);

test('catalog has exact deterministic counts, canonical order, ownership, and AI532 exclusions', () => {
    assert.equal(ILLUMINATION_LAB_VALIDATION_CASES.length, 8);
    assert.equal(ILLUMINATION_PROFILER_VALIDATION_CASES.length, 100);
    assert.equal(ILLUMINATION_CIVIC_VALIDATION_CASES.length, 1);
    assert.equal(ILLUMINATION_LOW_SUN_VALIDATION_CASES.length, 96);
    assert.equal(ILLUMINATION_VALIDATION_CASES.length, 205);
    assert.equal(Object.keys(ILLUMINATION_VALIDATION_CASE_BY_ID).length, 205);

    for (const group of [
        ILLUMINATION_LAB_VALIDATION_CASES,
        ILLUMINATION_PROFILER_VALIDATION_CASES,
        ILLUMINATION_CIVIC_VALIDATION_CASES,
        ILLUMINATION_LOW_SUN_VALIDATION_CASES,
        ILLUMINATION_VALIDATION_CASES
    ]) {
        const ids = group.map((entry) => entry.id);
        assert.deepEqual(ids, [...ids].sort());
        assert.equal(new Set(ids).size, ids.length);
    }

    assert.equal(ILLUMINATION_VALIDATION_CASES.filter((entry) => entry.aiOwner === 'AI_527').length, 107);
    assert.equal(ILLUMINATION_VALIDATION_CASES.filter((entry) => entry.aiOwner === 'AI_531').length, 98);
    assert.equal(ILLUMINATION_VALIDATION_CASES.some((entry) => entry.aiOwner === 'AI_532'), false);
    for (const forbiddenId of [
        'illum.lab.partial_bus_shadow_fixture',
        'illum.game.partial_bus_route',
        'illum.game.dynamic_bus_shadow'
    ]) assert.equal(getIlluminationValidationCase(forbiddenId), null);
    assert.equal(ILLUMINATION_VALIDATION_CASES.some((entry) => /partial_bus|dynamic_bus/.test(entry.id)), false);
});

test('Lab records preserve exact presets, coverage, sun profiles, and two AI531 overhang variants', () => {
    const byBaseId = Map.groupBy(ILLUMINATION_LAB_VALIDATION_CASES, (entry) => entry.baseCaseId);
    assert.deepEqual([...byBaseId.keys()].sort(), [
        'illum.lab.bus_grounding_default',
        'illum.lab.corner_low_sun',
        'illum.lab.foliage_alpha_backlight',
        'illum.lab.glass_reflection_control',
        'illum.lab.overhang_receiver_fixture',
        'illum.lab.overview_default',
        'illum.lab.road_wall_default'
    ]);
    assert.equal(byBaseId.get('illum.lab.overhang_receiver_fixture').length, 2);
    assert.deepEqual(
        byBaseId.get('illum.lab.overhang_receiver_fixture').map((entry) => [entry.sunProfile.azimuthDeg, entry.sunProfile.elevationDeg]),
        [[45, 35], [135, 8]]
    );
    assert.deepEqual(
        byBaseId.get('illum.lab.overhang_receiver_fixture').map((entry) => entry.aiOwner),
        ['AI_531', 'AI_531']
    );
    assert.deepEqual(getIlluminationValidationCase('illum.lab.overview_default').camera, {
        fixtureId: 'lab_scene_standard_v1',
        kind: 'lab_preset',
        presetId: 'overview',
        profileId: 'lab_scene_camera_preset_v1'
    });
    assert.equal(getIlluminationValidationCase('illum.lab.foliage_alpha_backlight').camera.presetId, 'crossing_bus_right_wide');
    assert.deepEqual(
        [
            getIlluminationValidationCase('illum.lab.corner_low_sun').sunProfile.azimuthDeg,
            getIlluminationValidationCase('illum.lab.corner_low_sun').sunProfile.elevationDeg
        ],
        [135, 8]
    );
    assert.deepEqual(
        [
            getIlluminationValidationCase('illum.lab.foliage_alpha_backlight').sunProfile.azimuthDeg,
            getIlluminationValidationCase('illum.lab.foliage_alpha_backlight').sunProfile.elevationDeg
        ],
        [225, 12]
    );
    const coverage = new Set(ILLUMINATION_LAB_VALIDATION_CASES.flatMap((entry) => entry.coverageTags));
    for (const tag of [
        'alpha_cutout_silhouette', 'asphalt', 'bus_ground_contact', 'curb', 'emissive_control',
        'global_balance', 'ibl_control', 'long_shadow', 'road', 'roof', 'transmitted_gaps',
        'underside_overhang', 'vertical_facades', 'vertical_receiver', 'wall'
    ]) assert.equal(coverage.has(tag), true, `missing Lab coverage '${tag}'`);
});

test('100 profiler poses retain all 25 authoritative cells, derived world coordinates, and four cardinals', () => {
    assert.deepEqual(AI527_BIGCITY2_MAP_PROFILE, {
        heightTiles: 25,
        id: 'bigcity2.ai527.v1',
        originMeters: { x: -288, z: -288 },
        sourceHashSlot: 'resolvedSourceSha256',
        tileSizeMeters: 24,
        widthTiles: 25
    });
    assert.deepEqual(AI527_REGIONAL_CAMERA_PROFILE, {
        fovDeg: 55,
        heightMeters: 3.6831812722,
        id: 'ai527.regional_camera.v1',
        pitchDeg: -9.673
    });
    assert.deepEqual(AI527_CARDINAL_VIEW_VECTORS, [
        { id: 'N', x: 0, z: -1 },
        { id: 'E', x: 1, z: 0 },
        { id: 'S', x: 0, z: 1 },
        { id: 'W', x: -1, z: 0 }
    ]);

    const expectedIds = [];
    for (const [regionId, cellX, cellY, worldX, worldZ] of REGION_CELLS) {
        const poses = ILLUMINATION_PROFILER_VALIDATION_CASES.filter((entry) => entry.profilerRegion.id === regionId);
        assert.equal(poses.length, 4, regionId);
        assert.deepEqual(new Set(poses.map((entry) => entry.camera.viewVector.id)), new Set(['N', 'E', 'S', 'W']));
        for (const pose of poses) {
            assert.deepEqual(pose.mapCell, { authority: 'authoritative', x: cellX, y: cellY });
            assert.deepEqual(pose.worldCoordinatesMeters, {
                authority: 'derived_from_bigcity2_origin_and_tile_size_v1',
                x: worldX,
                z: worldZ
            });
            assert.equal(pose.camera.profile, AI527_REGIONAL_CAMERA_PROFILE);
            assert.equal(pose.sourceHashSlot, 'resolvedSourceSha256');
            assert.deepEqual([pose.sunProfile.azimuthDeg, pose.sunProfile.elevationDeg], [45, 35]);
            expectedIds.push(`illum.profiler.${regionId.toLowerCase()}.${pose.camera.viewVector.id.toLowerCase()}`);
        }
    }
    assert.deepEqual(ILLUMINATION_PROFILER_VALIDATION_CASES.map((entry) => entry.id), expectedIds.sort());
    assert.equal(ILLUMINATION_PROFILER_VALIDATION_CASES.filter((entry) => entry.coverageTags.includes('city_edge')).length, 64);
    assert.equal(ILLUMINATION_PROFILER_VALIDATION_CASES.filter((entry) => entry.baseCaseId === 'illum.game.regional_open').length, 4);
    assert.equal(ILLUMINATION_PROFILER_VALIDATION_CASES.filter((entry) => entry.baseCaseId === 'illum.game.regional_center').length, 4);
    assert.equal(ILLUMINATION_PROFILER_VALIDATION_CASES.filter((entry) => entry.baseCaseId === 'illum.game.regional_dense').length, 4);
});

test('civic and full low-sun matrix preserve named pose, regional cells, views, and all sun combinations', () => {
    const civic = ILLUMINATION_CIVIC_VALIDATION_CASES[0];
    assert.equal(civic.id, 'illum.game.civic_curve_front');
    assert.equal(civic.namedPoseId, 'civic_center_curve_front');
    assert.equal(civic.camera.namedPoseId, 'civic_center_curve_front');
    assert.deepEqual(civic.coverageTags, ['bus_front_material', 'facade', 'intersection', 'road_shadow']);

    const expectedRegional = new Map([
        ['regional_open', { cell: [12, 3], world: [0, -216], tags: ['open_roof_horizon'] }],
        ['regional_center', { cell: [12, 14], world: [0, 48], tags: ['intersection'] }],
        ['regional_dense', { cell: [7, 21], world: [-120, 216], tags: ['dense_southern_geometry'] }]
    ]);
    for (const [key, expected] of expectedRegional) {
        const cases = ILLUMINATION_LOW_SUN_VALIDATION_CASES.filter((entry) => entry.id.includes(`.${key}.`));
        assert.equal(cases.length, 32, key);
        assert.deepEqual(new Set(cases.map((entry) => entry.camera.viewVector.id)), new Set(['N', 'E', 'S', 'W']));
        assert.deepEqual(
            new Set(cases.map((entry) => `${entry.sunProfile.azimuthDeg}/${entry.sunProfile.elevationDeg}`)),
            new Set(['45/8', '45/35', '135/8', '135/35', '225/8', '225/35', '315/8', '315/35'])
        );
        for (const entry of cases) {
            assert.equal(entry.aiOwner, 'AI_531');
            assert.deepEqual([entry.mapCell.x, entry.mapCell.y], expected.cell);
            assert.deepEqual([entry.worldCoordinatesMeters.x, entry.worldCoordinatesMeters.z], expected.world);
            assert.equal(entry.coverageTags.includes(expected.tags[0]), true);
            assert.equal(entry.coverageTags.includes('low_sun_matrix'), true);
            assert.equal(entry.coverageTags.includes(entry.sunProfile.elevationDeg === 8 ? 'low_sun' : 'high_sun_control'), true);
        }
    }
});

test('all public catalog objects are deeply frozen with sorted unique coverage tags and exact lookup identity', () => {
    assert.equal(deeplyFrozen(ILLUMINATION_VALIDATION_CASES), true);
    assert.equal(deeplyFrozen(ILLUMINATION_VALIDATION_CASE_BY_ID), true);
    assert.equal(deeplyFrozen(AI527_CARDINAL_VIEW_VECTORS), true);
    for (const entry of ILLUMINATION_VALIDATION_CASES) {
        assert.equal(entry.sourceHashSlot === 'resolvedSourceSha256' || entry.sourceHashSlot === 'labSceneRevisionSha256', true);
        assert.equal(entry.coverageTags.length > 0, true);
        assert.deepEqual(entry.coverageTags, [...new Set(entry.coverageTags)].sort());
        assert.equal(getIlluminationValidationCase(entry.id), entry);
        assert.equal(Object.isFrozen(entry.sunProfile), true);
        assert.equal(entry.aiOwner === 'AI_527' || entry.aiOwner === 'AI_531', true);
    }
    assert.equal(getIlluminationValidationCase(' illum.game.civic_curve_front'), null);
    assert.equal(getIlluminationValidationCase('missing'), null);
    assert.equal(getIlluminationValidationCase(/** @type {any} */ (null)), null);
    assert.throws(() => ILLUMINATION_VALIDATION_CASES.push({}), TypeError);
    assert.throws(() => ILLUMINATION_VALIDATION_CASES[0].coverageTags.push('mutation'), TypeError);
    const regional = ILLUMINATION_PROFILER_VALIDATION_CASES[0];
    assert.throws(() => { regional.mapCell.x = 99; }, TypeError);
    assert.throws(() => { regional.camera.profile.heightMeters = 0; }, TypeError);
});

function deeplyFrozen(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return true;
    seen.add(value);
    if (!Object.isFrozen(value)) return false;
    return Object.values(value).every((entry) => deeplyFrozen(entry, seen));
}
