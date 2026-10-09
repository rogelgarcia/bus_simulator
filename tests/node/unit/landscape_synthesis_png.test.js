// Verifies the dependency-free PNG codec: 8/16-bit round trips, every scanline filter, CRC enforcement and byte-identical encoding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { crc32, decodePng, encodePng } from '../../../tools/bake_landscape/terrain_synthesis/interchange/PngCodec.mjs';

const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const textured = (width, height, channels, bitDepth, seed) => {
    const random = lcg(seed), maximum = bitDepth === 8 ? 255 : 65535, data = bitDepth === 8 ? new Uint8Array(width * height * channels) : new Uint16Array(width * height * channels);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(random() * (maximum + 1));
    return data;
};

function chunkBytes(type, data) {
    const bytes = Buffer.alloc(12 + data.length);
    bytes.writeUInt32BE(data.length, 0); bytes.write(type, 4, 'latin1'); Buffer.from(data).copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes, 4, 8 + data.length), 8 + data.length);
    return bytes;
}

test('PNG codec: 8-bit gray, RGB, RGBA and 16-bit gray round-trip through both filter strategies', () => {
    for (const [channels, bitDepth] of [[1, 8], [3, 8], [4, 8], [1, 16], [2, 8], [3, 16]]) {
        const width = 37, height = 23, data = textured(width, height, channels, bitDepth, channels * 100 + bitDepth);
        for (const filter of ['none', 'adaptive']) {
            const bytes = encodePng({ width, height, channels, bitDepth, data, filter }), decoded = decodePng(bytes);
            assert.equal(decoded.width, width); assert.equal(decoded.height, height); assert.equal(decoded.channels, channels); assert.equal(decoded.bitDepth, bitDepth);
            assert.deepEqual(decoded.data, data, `${channels}x${bitDepth} ${filter}`);
            assert.equal(decoded.data.constructor, bitDepth === 8 ? Uint8Array : Uint16Array);
        }
    }
});

test('PNG codec: encoding is byte-identical across runs and the adaptive filter chooses non-zero filters on smooth data', () => {
    const width = 64, height = 48, data = new Uint16Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = Math.round(30000 + 20000 * Math.sin(x / 7) * Math.cos(y / 5));
    const first = encodePng({ width, height, channels: 1, bitDepth: 16, data }), second = encodePng({ width, height, channels: 1, bitDepth: 16, data });
    assert.ok(first.equals(second));
    const plain = encodePng({ width, height, channels: 1, bitDepth: 16, data, filter: 'none' });
    assert.ok(!plain.equals(first), 'adaptive filtering changes the stream'); assert.ok(first.length < plain.length, 'adaptive filtering compresses smooth data better');
    assert.deepEqual(decodePng(plain).data, data);
});

test('PNG codec: all five scanline filters decode and a corrupted chunk fails its CRC', () => {
    const width = 9, height = 10, channels = 3, bpp = 3, stride = width * bpp, image = textured(width, height, channels, 8, 7), raw = Buffer.alloc((stride + 1) * height);
    const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
    for (let row = 0; row < height; row++) {
        const type = row % 5, offset = row * (stride + 1);
        raw[offset] = type;
        for (let i = 0; i < stride; i++) {
            const x = image[row * stride + i], a = i >= bpp ? image[row * stride + i - bpp] : 0, b = row ? image[(row - 1) * stride + i] : 0, c = row && i >= bpp ? image[(row - 1) * stride + i - bpp] : 0;
            raw[offset + 1 + i] = (type === 0 ? x : type === 1 ? x - a : type === 2 ? x - b : type === 3 ? x - ((a + b) >> 1) : x - paeth(a, b, c)) & 255;
        }
    }
    const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
    const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunkBytes('IHDR', header), chunkBytes('IDAT', deflateSync(raw)), chunkBytes('IEND', Buffer.alloc(0))]);
    assert.deepEqual(decodePng(bytes).data, image);
    const corrupted = Buffer.from(bytes); corrupted[8 + 25 + 12] ^= 0x40;
    assert.throws(() => decodePng(corrupted), /CRC mismatch/);
    const palette = Buffer.from(bytes); palette[8 + 8 + 9] = 3; palette.writeUInt32BE(crc32(palette, 12, 8 + 8 + 13), 8 + 8 + 13);
    assert.throws(() => decodePng(palette), /palette/);
});

test('PNG codec: boundary validation rejects mismatched data, bad depths and non-PNG input', () => {
    assert.throws(() => encodePng({ width: 4, height: 4, channels: 3, bitDepth: 8, data: new Uint8Array(10) }), /Uint8Array of 48 samples/);
    assert.throws(() => encodePng({ width: 4, height: 4, channels: 1, bitDepth: 16, data: new Uint8Array(16) }), /Uint16Array/);
    assert.throws(() => encodePng({ width: 4, height: 4, channels: 5, bitDepth: 8, data: new Uint8Array(80) }), /channel count/);
    assert.throws(() => encodePng({ width: 4, height: 4, channels: 1, bitDepth: 12, data: new Uint8Array(16) }), /bit depth/);
    assert.throws(() => decodePng(new Uint8Array(40)), /signature/);
    assert.throws(() => decodePng(encodePng({ width: 2, height: 2, channels: 1, bitDepth: 8, data: new Uint8Array(4) }).subarray(0, 40)), /Truncated/);
});
