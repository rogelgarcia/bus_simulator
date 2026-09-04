// Verifies the generic, shared moving-object shadow projection without a renderer.
// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DYNAMIC_SUN_SHADOW_PROJECTION_SCHEMA,
    fitDynamicSunShadowProjection
} from '../../../src/app/illumination/dynamic_sun_shadow/index.js';

const BUS_A = Object.freeze({ id: 'vehicle.a', min: [-1, 0.5, -3], max: [1, 4.5, 3] });
const BUS_B = Object.freeze({ id: 'vehicle.b', min: [3, 0.5, -2], max: [5, 4.5, 4] });

test('one shared projection contains two interacting moving objects and their low-sun tails', () => {
    const fit = fitDynamicSunShadowProjection({
        casterBounds: [BUS_A, BUS_B],
        sunPointDirectionWorld: [1, 2, 1],
        receiverMinimumY: 0,
        mapSize: 2048,
        worldUnitsPerTexel: 0.025,
        paddingTexels: 8
    });

    assert.equal(fit.schema, DYNAMIC_SUN_SHADOW_PROJECTION_SCHEMA);
    assert.deepEqual(fit.casterIds, ['vehicle.a', 'vehicle.b']);
    assert.equal(fit.casterCount, 2);
    assert.ok(fit.maximumCastDistanceMeters > 5);
    assert.ok(fit.requiredHalfExtentMeters < fit.usableHalfExtentMeters);
    assert.equal(fit.halfExtentMeters, 25.6);
    assert.equal(fit.farMeters > fit.nearMeters, true);
});

test('projection identity is deterministic across registry order and texel-snaps sub-texel motion', () => {
    const options = {
        sunPointDirectionWorld: [1, 3, -2],
        mapSize: 2048,
        worldUnitsPerTexel: 0.025,
        receiverMinimumY: 0
    };
    const forward = fitDynamicSunShadowProjection({ ...options, casterBounds: [BUS_A, BUS_B] });
    const reverse = fitDynamicSunShadowProjection({ ...options, casterBounds: [BUS_B, BUS_A] });
    assert.deepEqual(reverse, forward);

    const snapOptions = { ...options, sunPointDirectionWorld: [0, 1, 0] };
    const snapped = fitDynamicSunShadowProjection({ ...snapOptions, casterBounds: [BUS_A, BUS_B] });
    const shifted = [BUS_A, BUS_B].map((entry) => ({
        ...entry,
        min: [entry.min[0] + 0.004, entry.min[1], entry.min[2]],
        max: [entry.max[0] + 0.004, entry.max[1], entry.max[2]]
    }));
    const subTexel = fitDynamicSunShadowProjection({ ...snapOptions, casterBounds: shifted });
    assert.deepEqual(subTexel.centerLightMeters.slice(0, 2), snapped.centerLightMeters.slice(0, 2));
});

test('projection rejects duplicate identities, below-horizon sun, and over-wide interaction groups', () => {
    assert.throws(
        () => fitDynamicSunShadowProjection({
            casterBounds: [BUS_A, { ...BUS_A }],
            sunPointDirectionWorld: [0, 1, 0]
        }),
        /Duplicate dynamic caster id/
    );
    assert.throws(
        () => fitDynamicSunShadowProjection({
            casterBounds: [BUS_A],
            sunPointDirectionWorld: [0, -1, 0]
        }),
        /must point above/
    );
    assert.throws(
        () => fitDynamicSunShadowProjection({
            casterBounds: [BUS_A, { id: 'vehicle.far', min: [100, 0, 0], max: [102, 4, 5] }],
            sunPointDirectionWorld: [0, 1, 0],
            mapSize: 64,
            worldUnitsPerTexel: 0.1
        }),
        /fixed projection provides/
    );
});

test('15 Hz and 120 Hz driving samples use the current two-object pose at low and high sun', () => {
    const sample = (steps, sunElevationDegrees) => {
        const sunElevationRadians = sunElevationDegrees * Math.PI / 180;
        const sun = [Math.cos(sunElevationRadians), Math.sin(sunElevationRadians), 0];
        let fit = null;
        for (let frame = 0; frame <= steps; frame += 1) {
            const t = frame / steps;
            const aX = -5 + t * 8;
            const bX = 4 - t * 3;
            fit = fitDynamicSunShadowProjection({
                casterBounds: [
                    { id: 'vehicle.a', min: [aX - 1, 0.5, -2], max: [aX + 1, 4.5, 2] },
                    { id: 'vehicle.b', min: [bX - 1, 0.5, -2], max: [bX + 1, 4.5, 2] }
                ],
                sunPointDirectionWorld: sun,
                receiverMinimumY: 0,
                mapSize: 2048,
                worldUnitsPerTexel: 0.025
            });
            assert.deepEqual(fit.casterIds, ['vehicle.a', 'vehicle.b']);
        }
        return fit;
    };
    for (const elevation of [8, 45]) {
        const lowRate = sample(15, elevation);
        const highRate = sample(120, elevation);
        assert.deepEqual(lowRate, highRate);
        if (elevation === 8) assert.ok(lowRate.maximumCastDistanceMeters > 32);
    }
});
