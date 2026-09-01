// Verifies the AI 531 production source profile and exact point-sun inventory.
// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    AI531_STATIC_SUN_PROFILE_ANGLES,
    createAi531StaticSunLightProfiles,
    createResolvedIlluminationExportProfile,
    ILLUMINATION_COMPILER_REFERENCE
} from '../../../../tools/illumination_bake_exporter/profile.mjs';

test('AI 531 export profile declares the exact nine point suns and bounded tiled layout', () => {
    const profiles = createAi531StaticSunLightProfiles();
    assert.equal(profiles.length, 9);
    assert.deepEqual(
        profiles.map((entry) => entry.id),
        AI531_STATIC_SUN_PROFILE_ANGLES.map(({ azimuthDeg, elevationDeg }) =>
            `ai527.sun.az${String(azimuthDeg).padStart(3, '0')}.el${String(elevationDeg).padStart(2, '0')}`)
    );
    for (const profile of profiles) {
        assert.equal(profile.angularDiameterDegrees, 0);
        assert.equal(profile.filterModel, 'point_direction_depth_with_runtime_pcf_v1');
        assert.ok(Math.abs(Math.hypot(...profile.directionThree) - 1) < 1e-12);
        assert.ok(Object.isFrozen(profile));
        assert.ok(Object.isFrozen(profile.directionThree));
    }
    const azimuth135 = profiles.find((entry) => entry.id === 'ai527.sun.az135.el35');
    assert.ok(azimuth135.directionThree[0] < 0);
    assert.ok(azimuth135.directionThree[2] > 0);

    const color = (r, g, b) => ({ isColor: true, r, g, b });
    const profile = createResolvedIlluminationExportProfile({
        city: {
            cityId: 'bigcity2',
            sunRef: { direction: { x: 0.5, y: 0.7071067811865476, z: 0.5 }, color: color(1, 1, 1), intensity: 5.75 },
            hemi: { color: color(0.7, 0.8, 1), groundColor: color(0.3, 0.25, 0.2), intensity: 1.2 }
        },
        engine: {
            scene: { environment: { userData: { iblHdrUrl: '/assets/public/hdri/test.hdr' } } },
            lightingSettings: { ibl: { enabled: true, envMapIntensity: 1 } }
        }
    });
    const channel = profile.channelConfigurations.static_sun_depth;
    assert.equal(channel.schema, 'bus-sim-static-sun-depth-source-v4');
    assert.deepEqual(channel.lightProfileIds, profiles.map((entry) => entry.id));
    assert.deepEqual(channel.casterSidedness, {
        model: 'three-r183-effective-shadow-side-v1',
        preserveMaterialFlagSemantics: 'material-userdata-preserveShadowSide-or-isFoliage-v1',
        twoSidedCasting: true
    });
    assert.deepEqual(channel.layout, {
        policy: 'per_profile_phase_locked_rectangular_light_space_grid_v2',
        texelSizeMeters: 0.04150390625,
        tileSizeMeters: [77.6123046875, 75.57861328125],
        interiorPixels: [1870, 1821],
        guardPixels: 4,
        maximumPayloadBytes: 536870912,
        layerOrder: 'row-major-y-then-x-v1',
        phasePolicy: 'absolute-stable-basis-texel-edge-lattice-v1'
    });
    assert.deepEqual(channel.filtering, {
        sourceModel: 'point_direction_v1',
        runtimeModel: 'square_nearest_box_v1',
        radiusPixels: 1
    });
    assert.equal(ILLUMINATION_COMPILER_REFERENCE.implementationStatus, 'done');
});
