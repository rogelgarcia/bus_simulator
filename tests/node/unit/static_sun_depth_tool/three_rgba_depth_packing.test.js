// Deterministic CPU contract for Three r183 RGBA packed-depth readback.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    unpackThreeRgbaDepthBytes
} from '../../../../tools/static_sun_depth/src/ThreeRgbaDepthPacking.mjs';

function packReferenceR183Depth(depth) {
    let remaining = depth;
    const red = Math.floor(remaining * 256);
    remaining -= red / 256;
    const green = Math.floor(remaining * 65536);
    remaining -= green / 65536;
    const blue = Math.floor(remaining * 16777216);
    remaining -= blue / 16777216;
    const alpha = Math.round(remaining * 4278190080);
    return new Uint8Array([red, green, blue, alpha]);
}

test('Three r183 RGBA packed depth is red-most-significant', () => {
    assert.equal(unpackThreeRgbaDepthBytes(new Uint8Array([128, 0, 0, 0])), 0.5);
    assert.equal(
        unpackThreeRgbaDepthBytes(new Uint8Array([0, 128, 0, 0])),
        128 / 65536
    );
    assert.equal(
        unpackThreeRgbaDepthBytes(new Uint8Array([0, 0, 128, 0])),
        128 / 16777216
    );
    assert.equal(
        unpackThreeRgbaDepthBytes(new Uint8Array([0, 0, 0, 128])),
        128 / 4278190080
    );
    assert.equal(unpackThreeRgbaDepthBytes(new Uint8Array([255, 255, 255, 255])), 1);
});

test('Three r183 RGBA packed-depth weights round-trip deterministic depths', () => {
    const depths = [0, 1 / 256, 0.1, 0.5, 0.965, 0.999999, 1 - 1 / 16777216];
    for (const depth of depths) {
        assert.ok(
            Math.abs(unpackThreeRgbaDepthBytes(packReferenceR183Depth(depth)) - depth)
                <= 1 / 4278190080,
            `depth ${depth}`
        );
    }
});
