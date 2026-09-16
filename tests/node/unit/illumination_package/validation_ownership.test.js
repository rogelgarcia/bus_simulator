// Checks snapshot safety and single-pass authentication at owned validation boundaries.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { rawSha256Hex } from '../../../../src/app/illumination/package/RawSha256.js';
import { sha256Hex } from '../../../../src/app/illumination/bake_source/Hashing.js';
import * as encoding from '../../../../src/app/illumination/package/IlluminationEncoding.js';
import { parseIlluminationBinaryPackage } from '../../../../src/app/illumination/package/IlluminationBinaryPackage.js';
import { buildPackageFixture } from './package_fixture.js';

test('Hashing snapshots exact borrowed subviews before caller mutation without detaching aliases', async () => {
    const backing = new Uint8Array([9, 1, 2, 3, 8]), view = backing.subarray(1, 4);
    const expected = await sha256Hex('fixture', view);
    const framed = sha256Hex('fixture', view), raw = rawSha256Hex(new DataView(backing.buffer, 1, 3));
    backing.fill(7);
    assert.equal(await framed, expected);
    assert.equal(await raw, createHash('sha256').update(new Uint8Array([1, 2, 3])).digest('hex'));
    assert.deepEqual([...backing], [7, 7, 7, 7, 7]);
    await assert.rejects(rawSha256Hex('invalid'), TypeError);
});

test('Owned encoding validation borrows exact views while the public entry keeps its copy contract', () => {
    const bytes = new Uint8Array(24), view = bytes.subarray(4, 20);
    assert.notEqual(encoding.validateIlluminationEncodedBytes(view, 'rgba32f_le').buffer, bytes.buffer);
    assert.equal(encoding.validateOwnedIlluminationEncodedBytes(view, 'rgba32f_le'), view);
    new DataView(bytes.buffer).setFloat32(16, Infinity, true);
    assert.throws(() => encoding.validateOwnedIlluminationEncodedBytes(view, 'rgba32f_le'), /non-finite/);
    new DataView(bytes.buffer).setFloat32(16, -0, true);
    assert.throws(() => encoding.validateOwnedIlluminationEncodedBytes(view, 'rgba32f_le'), /negative zero/);
    assert.equal(bytes.byteLength, 24);
});

test('Package parser hashes each stored/decoded uncompressed chunk once and still detects changed bytes', async () => {
    const fixture = await buildPackageFixture(), counts = new Map();
    const subtle = globalThis.crypto.subtle, digest = subtle.digest;
    subtle.digest = function(algorithm, value) {
        const key = createHash('sha256').update(value).digest('hex');
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return digest.call(this, algorithm, value);
    };
    let parsed;
    try { parsed = await parseIlluminationBinaryPackage(fixture.bytes); }
    finally { subtle.digest = digest; }
    for (const chunk of parsed.chunks) assert.equal(counts.get(chunk.descriptor.sha256), 1);
    const corrupt = fixture.bytes.slice();
    corrupt[parsed.header.payloadOffset + parsed.chunkTable.chunks[0].offset] ^= 1;
    await assert.rejects(parseIlluminationBinaryPackage(corrupt), error => error.code === 'chunk_hash_mismatch');
});
