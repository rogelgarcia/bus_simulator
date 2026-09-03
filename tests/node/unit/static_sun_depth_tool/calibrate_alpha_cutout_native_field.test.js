import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyMeasuredBakeOnlyExclusions,
    applyMeasuredExactCorrections
} from '../../../../tools/static_sun_depth/calibrate_alpha_cutout_native_field.mjs';

test('calibration clears only measured bake-only texels in the selected tile', () => {
    const source = new Float32Array([5, 6, 7, 8]);
    const result = applyMeasuredBakeOnlyExclusions({
        bytes: new Uint8Array(source.buffer),
        exclusions: [
            {casterId: 'caster.a', globalTexel: [3, 4], index: 1},
            {casterId: 'caster.b', globalTexel: [10, 10], index: 2}
        ],
        height: 2,
        tileCoordinates: [1, 2],
        width: 2
    });

    assert.deepEqual([...new Float32Array(result.bytes.buffer)], [5, 0, 7, 8]);
    assert.deepEqual([...source], [5, 6, 7, 8]);
    assert.deepEqual(result.removed, [{
        casterId: 'caster.a',
        formerDepthMeters: 6,
        globalTexel: [3, 4],
        index: 1
    }]);
});

test('calibration fails closed when measured evidence targets an empty texel', () => {
    assert.throws(() => applyMeasuredBakeOnlyExclusions({
        bytes: new Uint8Array(new Float32Array([0]).buffer),
        exclusions: [{casterId: 'caster.a', globalTexel: [0, 0], index: 0}],
        height: 1,
        tileCoordinates: [0, 0],
        width: 1
    }), /not occupied/u);
});

test('exact calibration clears bake-only texels and replaces measured depths only', () => {
    const source = new Float32Array([5, 6, 7, 8]);
    const result = applyMeasuredExactCorrections({
        bytes: new Uint8Array(source.buffer),
        corrections: [
            {
                bakeDepthMeters: 6,
                casterId: 'caster.a',
                correction: 'clear_bake_only',
                globalTexel: [3, 4],
                index: 1,
                liveDepthMeters: 0
            },
            {
                bakeDepthMeters: 7,
                casterId: 'caster.b',
                correction: 'replace_depth',
                globalTexel: [2, 5],
                index: 2,
                liveDepthMeters: 7.25
            }
        ],
        height: 2,
        tileCoordinates: [1, 2],
        width: 2
    });

    assert.deepEqual([...new Float32Array(result.bytes.buffer)], [5, 0, 7.25, 8]);
    assert.deepEqual([...source], [5, 6, 7, 8]);
    assert.deepEqual(result.corrected.map((entry) => ({
        correction: entry.correction,
        correctedDepthMeters: entry.correctedDepthMeters,
        formerDepthMeters: entry.formerDepthMeters
    })), [
        {correction: 'clear_bake_only', correctedDepthMeters: 0, formerDepthMeters: 6},
        {correction: 'replace_depth', correctedDepthMeters: 7.25, formerDepthMeters: 7}
    ]);
});

test('exact calibration fails closed when a depth replacement is not positive', () => {
    assert.throws(() => applyMeasuredExactCorrections({
        bytes: new Uint8Array(new Float32Array([5]).buffer),
        corrections: [{
            bakeDepthMeters: 5,
            casterId: 'caster.a',
            correction: 'replace_depth',
            globalTexel: [0, 0],
            index: 0,
            liveDepthMeters: 0
        }],
        height: 1,
        tileCoordinates: [0, 0],
        width: 1
    }), /is invalid/u);
});
