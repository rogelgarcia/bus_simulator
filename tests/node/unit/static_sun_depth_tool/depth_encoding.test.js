// Verifies exact RG8 depth codes, sentinel reservation, guards, and precision reporting.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    STATIC_SUN_DEPTH_EMPTY_CODE,
    decodeStaticSunDepth,
    encodeStaticSunDepth,
    quantizeStaticSunDepthTile
} from '../../../../tools/static_sun_depth/src/DepthEncoding.mjs';
import { StaticSunDepthToolError } from '../../../../tools/static_sun_depth/src/StaticSunDepthToolError.mjs';
import { defaultPixels, encodeRgba32f } from './fixture.js';

test('depth quantization reserves 65535 and maps near, midpoint, and far exactly', () => {
    assert.equal(encodeStaticSunDepth(1, 1, 11), 0);
    assert.equal(encodeStaticSunDepth(6, 1, 11), 32767);
    assert.equal(encodeStaticSunDepth(11, 1, 11), 65534);
    assert.equal(decodeStaticSunDepth(0, 1, 11), 1);
    assert.equal(decodeStaticSunDepth(32767, 1, 11), 6);
    assert.equal(decodeStaticSunDepth(65534, 1, 11), 11);
    assert.equal(STATIC_SUN_DEPTH_EMPTY_CODE, 65535);
});

test('guard generation duplicates nearest RG8 edge texels deterministically', () => {
    const result = quantizeStaticSunDepthTile({
        canonicalBytes: encodeRgba32f(defaultPixels()),
        width: 2,
        height: 2,
        guardPixels: 1,
        clipNearMeters: 1,
        clipFarMeters: 11,
        orthographicBoundsMeters: { bottom: -1, left: -1, right: 1, top: 1 }
    });
    assert.deepEqual(result.tile.interior, { height: 2, storedOriginX: 1, storedOriginY: 1, width: 2 });
    assert.deepEqual(result.tile.stored, { height: 4, width: 4 });
    assert.deepEqual([...result.payload], [
        255, 255, 255, 255, 0, 0, 0, 0,
        255, 255, 255, 255, 0, 0, 0, 0,
        127, 255, 127, 255, 255, 254, 255, 254,
        127, 255, 127, 255, 255, 254, 255, 254
    ]);
    assert.equal(result.statistics.emptyTexelCount, 1);
    assert.equal(result.statistics.occupiedTexelCount, 3);
    assert.equal(result.statistics.maximumAbsoluteErrorMeters, 0);
    assert.equal(result.statistics.encodedCodeMinimum, 0);
    assert.equal(result.statistics.encodedCodeMaximum, 65534);
});

test('ambiguous occupancy and invalid empty sentinels fail closed', () => {
    const common = {
        width: 2,
        height: 2,
        guardPixels: 1,
        clipNearMeters: 1,
        clipFarMeters: 11,
        orthographicBoundsMeters: { bottom: -1, left: -1, right: 1, top: 1 }
    };
    const fractional = defaultPixels();
    fractional[0] = [0, 0, 0, 0.5];
    assert.throws(
        () => quantizeStaticSunDepthTile({ ...common, canonicalBytes: encodeRgba32f(fractional) }),
        (error) => error instanceof StaticSunDepthToolError && error.code === 'static_sun_depth_occupancy_ambiguous'
    );
    const nonzeroEmpty = defaultPixels();
    nonzeroEmpty[0] = [0, 0, 2, 0];
    assert.throws(
        () => quantizeStaticSunDepthTile({ ...common, canonicalBytes: encodeRgba32f(nonzeroEmpty) }),
        (error) => error instanceof StaticSunDepthToolError && error.code === 'static_sun_depth_empty_sentinel_mismatch'
    );
});
