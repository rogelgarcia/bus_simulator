import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyMeasuredResidualCorrections,
    getResidualDepthParitySamples
} from '../../../../tools/static_sun_depth/calibrate_static_shadow_residual_field.mjs';

test('residual calibration ignores explicit unsupported-receiver samples', () => {
    assert.deepEqual(getResidualDepthParitySamples({
        depthTapParity: null,
        receiver: {status: 'unsupported'}
    }), []);
    const samples = [{sampleIndex: 0}];
    assert.equal(
        getResidualDepthParitySamples({depthTapParity: {samples}}),
        samples
    );
});

test('residual calibration fills only measured texels in the selected tile', () => {
    const source = new Float32Array([0, 8, 0, 4]);
    const result = applyMeasuredResidualCorrections({
        bytes: new Uint8Array(source.buffer),
        corrections: [
            {globalTexel: [2, 4], liveDepthMeters: 3.5},
            {globalTexel: [20, 40], liveDepthMeters: 1.25}
        ],
        height: 2,
        tileCoordinates: [1, 2],
        width: 2
    });

    assert.deepEqual([...new Float32Array(result.bytes.buffer)], [3.5, 8, 0, 4]);
    assert.deepEqual([...source], [0, 8, 0, 4]);
    assert.deepEqual(result.applied.map((entry) => ({
        correctedDepthMeters: entry.correctedDepthMeters,
        formerDepthMeters: entry.formerDepthMeters,
        globalTexel: entry.globalTexel
    })), [{
        correctedDepthMeters: 3.5,
        formerDepthMeters: 0,
        globalTexel: [2, 4]
    }]);
});

test('residual calibration replaces an occupied texel only with nearer depth', () => {
    const result = applyMeasuredResidualCorrections({
        bytes: new Uint8Array(new Float32Array([8]).buffer),
        corrections: [{globalTexel: [0, 0], liveDepthMeters: 7.25}],
        height: 1,
        tileCoordinates: [0, 0],
        width: 1
    });

    assert.deepEqual([...new Float32Array(result.bytes.buffer)], [7.25]);
    assert.equal(result.applied[0].formerDepthMeters, 8);
});

test('residual calibration rejects zero, equal, and farther measured depths', () => {
    for (const liveDepthMeters of [0, 8, 9]) {
        assert.throws(() => applyMeasuredResidualCorrections({
            bytes: new Uint8Array(new Float32Array([8]).buffer),
            corrections: [{globalTexel: [0, 0], liveDepthMeters}],
            height: 1,
            tileCoordinates: [0, 0],
            width: 1
        }), /not a nearer finite depth/u);
    }
});
