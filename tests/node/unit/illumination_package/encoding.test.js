// Verifies explicit little-endian uncompressed encodings used by the generic fallback path.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    decodeRgba16fLittleEndian,
    decodeRgba32fLittleEndian,
    encodeRgba16fLittleEndian,
    encodeRgba32fLittleEndian,
    float16BitsToFloat32,
    float32ToFloat16Bits,
    getIlluminationDecodedByteLength,
    validateIlluminationEncodedBytes
} from '../../../../src/app/illumination/package/index.js';

test('RGBA32F fallback is canonical little-endian and preserves finite values', () => {
    const encoded = encodeRgba32fLittleEndian([1, -2, 0.5, 65504]);
    assert.deepEqual(Array.from(encoded), [
        0, 0, 128, 63,
        0, 0, 0, 192,
        0, 0, 0, 63,
        0, 224, 127, 71
    ]);
    assert.deepEqual(Array.from(decodeRgba32fLittleEndian(encoded)), [1, -2, 0.5, 65504]);
    assert.throws(() => encodeRgba32fLittleEndian([1, 2, 3, NaN]), /finite/);
    assert.throws(() => encodeRgba32fLittleEndian([1, 2, 3, Number.MAX_VALUE]), /representable range/);
});

test('RGBA16F conversion uses exact IEEE binary16 bits and round-trips finite fixtures', () => {
    const values = [1, -2, 0, 65504];
    const encoded = encodeRgba16fLittleEndian(values);
    assert.deepEqual(Array.from(encoded), [0x00, 0x3c, 0x00, 0xc0, 0x00, 0x00, 0xff, 0x7b]);
    assert.deepEqual(Array.from(decodeRgba16fLittleEndian(encoded)), values);
    assert.equal(float32ToFloat16Bits(1), 0x3c00);
    assert.equal(float16BitsToFloat32(0x3c00), 1);
    assert.throws(() => float32ToFloat16Bits(70000), /range/);
    assert.throws(() => float32ToFloat16Bits(Infinity), /finite/);
});

test('encoding dimensions derive exact lengths and reject precision/component mismatches', () => {
    assert.equal(getIlluminationDecodedByteLength({
        encoding: 'rgba32f_le', precision: 'float32',
        dimensions: { width: 4, height: 2, depth: 1, components: 4 }
    }), 128);
    assert.equal(getIlluminationDecodedByteLength({
        encoding: 'future_encoding', precision: 'future',
        dimensions: { width: 1, height: 1, depth: 1, components: 1 }
    }), null);
    assert.throws(() => getIlluminationDecodedByteLength({
        encoding: 'rgba16f_le', precision: 'float32',
        dimensions: { width: 1, height: 1, depth: 1, components: 4 }
    }), /precision/);
    assert.throws(() => getIlluminationDecodedByteLength({
        encoding: 'rgba32f_le', precision: 'float32',
        dimensions: { width: 1, height: 1, depth: 1, components: 3 }
    }), /component/);
});

test('floating payload validation rejects non-finite values and non-canonical negative zero', () => {
    const rgba32 = new Uint8Array(16);
    const rgba32View = new DataView(rgba32.buffer);
    rgba32View.setFloat32(0, Infinity, true);
    assert.throws(() => validateIlluminationEncodedBytes(rgba32, 'rgba32f_le'), /non-finite/);
    rgba32View.setFloat32(0, -0, true);
    assert.throws(() => validateIlluminationEncodedBytes(rgba32, 'rgba32f_le'), /negative zero/);

    const rgba16 = new Uint8Array(8);
    const rgba16View = new DataView(rgba16.buffer);
    rgba16View.setUint16(0, 0x7c00, true);
    assert.throws(() => validateIlluminationEncodedBytes(rgba16, 'rgba16f_le'), /non-finite/);
    rgba16View.setUint16(0, 0x8000, true);
    assert.throws(() => validateIlluminationEncodedBytes(rgba16, 'rgba16f_le'), /negative zero/);
});
