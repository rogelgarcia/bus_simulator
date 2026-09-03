// Verifies deterministic first-hit union for authenticated native fields.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    composeNativeDepthFields
} from '../../../../tools/static_sun_depth/compose_alpha_cutout_native_field.mjs';

test('native field composition preserves direct hits and fills only direct holes', () => {
    const direct = new Float32Array([0, -4, -2, -3]);
    const textureGrad = new Float32Array([-5, 0, -2.5, -1]);

    assert.deepEqual(
        [...composeNativeDepthFields(direct, textureGrad)],
        [-5, -4, -2, -3]
    );
});

test('native field composition rejects mismatched or non-finite inputs', () => {
    assert.throws(
        () => composeNativeDepthFields(new Float32Array(1), new Float32Array(2)),
        /equal lengths/u
    );
    assert.throws(
        () => composeNativeDepthFields(
            new Float32Array([Number.NaN]),
            new Float32Array([0])
        ),
        /finite/u
    );
});
