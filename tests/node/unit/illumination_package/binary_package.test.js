// Verifies deterministic layout, independent identities, strict parsing, and corruption rejection.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ILLUMINATION_AGGREGATE_HASH_OFFSET,
    ILLUMINATION_HEADER_OFFSETS,
    ILLUMINATION_PACKAGE_ALIGNMENT,
    ILLUMINATION_PACKAGE_HEADER_LENGTH,
    IlluminationPackageError,
    buildIlluminationBinaryPackage,
    parseIlluminationBinaryPackage,
    validateIlluminationChunkTable,
    validateIlluminationPackageManifest
} from '../../../../src/app/illumination/package/index.js';
import { rawSha256Hex, sha256HexToBytes } from '../../../../src/app/illumination/package/RawSha256.js';
import { HASHES, baseBuildOptions, buildPackageFixture, mutableJson } from './package_fixture.js';

function rejectsCode(code) {
    return (error) => {
        assert.ok(error instanceof IlluminationPackageError);
        assert.equal(error.code, code);
        return true;
    };
}

test('builder emits deterministic canonical bytes with a fixed aligned header and relative chunk offsets', async () => {
    const left = await buildPackageFixture();
    const reversed = baseBuildOptions();
    reversed.channels.reverse();
    reversed.chunks.reverse();
    const right = await buildIlluminationBinaryPackage(reversed);

    assert.deepEqual(left.bytes, right.bytes);
    assert.equal(left.aggregateSha256, right.aggregateSha256);
    assert.equal(left.bytes.byteLength % ILLUMINATION_PACKAGE_ALIGNMENT, 0);
    assert.equal(new DataView(left.bytes.buffer).getUint32(ILLUMINATION_HEADER_OFFSETS.headerLength, true), ILLUMINATION_PACKAGE_HEADER_LENGTH);
    assert.equal(left.chunkTable.chunks[0].offset, 0);
    assert.equal(left.chunkTable.chunks[1].offset % ILLUMINATION_PACKAGE_ALIGNMENT, 0);
    assert.deepEqual(left.chunkTable.chunks.map((chunk) => chunk.id), ['direct.rgba32f', 'mapping.ids']);
    assert.equal(left.metrics.compressionRatio, 1);
    assert.equal(left.metrics.decodedByteLength, 28);
});

test('parser verifies all identities and exposes explicit uncompressed RGBA32F bytes', async () => {
    const built = await buildPackageFixture();
    const parsed = await parseIlluminationBinaryPackage(built.bytes, {
        expectations: {
            cityId: 'fixture.city',
            lightingProfileId: 'fixture.lighting.v1',
            resolvedSourceSha256: HASHES.source,
            compilerSignatureSha256: built.manifest.compiler.signatureSha256,
            aggregateSha256: built.aggregateSha256
        }
    });

    assert.equal(parsed.aggregateSha256, built.aggregateSha256);
    assert.equal(parsed.compatibility.compatible, true);
    assert.equal(parsed.compatibility.reason, 'ready');
    assert.equal(parsed.manifest.source.resolvedSourceSha256, HASHES.source);
    assert.notEqual(parsed.manifest.source.descriptorSha256, parsed.manifest.compiler.signatureSha256);
    for (const channel of parsed.manifest.channels) {
        assert.match(channel.sourceSha256, /^[0-9a-f]{64}$/);
        assert.match(channel.profileSha256, /^[0-9a-f]{64}$/);
        assert.equal(channel.compilerSignatureSha256, parsed.manifest.compiler.signatureSha256);
        assert.match(channel.outputIntegritySha256, /^[0-9a-f]{64}$/);
    }
    const direct = parsed.chunks.find((chunk) => chunk.descriptor.id === 'direct.rgba32f');
    assert.equal(direct.descriptor.compression, 'none');
    assert.equal(direct.descriptor.encoding, 'rgba32f_le');
    assert.equal(direct.descriptor.rowOrigin, 'lower_left');
    assert.deepEqual(Array.from(direct.data), [0, 0, 128, 63, 0, 0, 0, 63, 0, 0, 128, 62, 0, 0, 128, 63]);
});

test('parser snapshots mutable caller bytes once before asynchronous integrity work', async () => {
    const built = await buildPackageFixture();
    const payloadOffset = new DataView(
        built.bytes.buffer,
        built.bytes.byteOffset,
        built.bytes.byteLength
    ).getUint32(ILLUMINATION_HEADER_OFFSETS.payloadOffset, true);
    const originalPayloadByte = built.bytes[payloadOffset];
    const parsing = parseIlluminationBinaryPackage(built.bytes);
    built.bytes[payloadOffset] ^= 0x01;

    const parsed = await parsing;
    const firstChunk = parsed.chunks.find((chunk) => chunk.descriptor.offset === 0);
    assert.equal(firstChunk.data[0], originalPayloadByte);
    assert.notEqual(built.bytes[payloadOffset], firstChunk.data[0]);
    assert.equal(parsed.compatibility.compatible, true);
});

test('expectation mismatches are compatibility outcomes after full integrity verification', async () => {
    const built = await buildPackageFixture();
    for (const [expectations, reason] of [
        [{ cityId: 'other.city' }, 'wrong_city'],
        [{ lightingProfileId: 'other.profile' }, 'wrong_profile'],
        [{ resolvedSourceSha256: 'f'.repeat(64) }, 'stale_source'],
        [{ staticSunDepthSourceSha256: 'd'.repeat(64) }, 'stale_source'],
        [{ selectedCapabilityProfileId: 'baked.hybrid_sun_v1' }, 'incompatible_capability_profile'],
        [{ aggregateSha256: 'e'.repeat(64) }, 'aggregate_identity_mismatch']
    ]) {
        const parsed = await parseIlluminationBinaryPackage(built.bytes, { expectations });
        assert.equal(parsed.compatibility.compatible, false);
        assert.equal(parsed.compatibility.reason, reason);
    }
});

test('payload corruption, aggregate corruption, metadata padding, version, and truncation reject precisely', async () => {
    const built = await buildPackageFixture();
    const view = new DataView(built.bytes.buffer, built.bytes.byteOffset, built.bytes.byteLength);
    const payloadOffset = view.getUint32(ILLUMINATION_HEADER_OFFSETS.payloadOffset, true);
    const manifestOffset = view.getUint32(ILLUMINATION_HEADER_OFFSETS.manifestOffset, true);
    const manifestLength = view.getUint32(ILLUMINATION_HEADER_OFFSETS.manifestLength, true);
    const tableOffset = view.getUint32(ILLUMINATION_HEADER_OFFSETS.tableOffset, true);

    const payloadCorrupt = built.bytes.slice();
    payloadCorrupt[payloadOffset] ^= 0x01;
    await assert.rejects(() => parseIlluminationBinaryPackage(payloadCorrupt), rejectsCode('chunk_hash_mismatch'));

    const manifestCorrupt = built.bytes.slice();
    manifestCorrupt[manifestOffset] ^= 0x01;
    await assert.rejects(() => parseIlluminationBinaryPackage(manifestCorrupt), rejectsCode('manifest_hash_mismatch'));

    const tableCorrupt = built.bytes.slice();
    tableCorrupt[tableOffset] ^= 0x01;
    await assert.rejects(() => parseIlluminationBinaryPackage(tableCorrupt), rejectsCode('chunk_table_hash_mismatch'));

    const aggregateCorrupt = built.bytes.slice();
    aggregateCorrupt[ILLUMINATION_AGGREGATE_HASH_OFFSET] ^= 0x01;
    await assert.rejects(() => parseIlluminationBinaryPackage(aggregateCorrupt), rejectsCode('aggregate_hash_mismatch'));

    assert.ok(tableOffset > manifestOffset + manifestLength);
    const paddingCorrupt = built.bytes.slice();
    paddingCorrupt[manifestOffset + manifestLength] = 1;
    await assert.rejects(() => parseIlluminationBinaryPackage(paddingCorrupt), rejectsCode('metadata_padding_nonzero'));

    const versionCorrupt = built.bytes.slice();
    new DataView(versionCorrupt.buffer).setUint16(ILLUMINATION_HEADER_OFFSETS.major, 2, true);
    await assert.rejects(() => parseIlluminationBinaryPackage(versionCorrupt), rejectsCode('package_version_unsupported'));

    await assert.rejects(() => parseIlluminationBinaryPackage(built.bytes.subarray(0, built.bytes.length - 1)), rejectsCode('header_bounds_invalid'));
    await assert.rejects(() => parseIlluminationBinaryPackage(built.bytes.subarray(0, 100)), rejectsCode('package_truncated'));
});

test('manifest and chunk validators reject extra keys, bad offsets, overlap-equivalent packing, and missing profile minimums', async () => {
    const built = await buildPackageFixture();
    const extra = mutableJson(built.manifest);
    extra.integrity = {};
    assert.throws(() => validateIlluminationPackageManifest(extra), rejectsCode('manifest_keys_invalid'));

    const badOffset = mutableJson(built.chunkTable);
    badOffset.chunks[1].offset += ILLUMINATION_PACKAGE_ALIGNMENT;
    badOffset.payloadByteLength += ILLUMINATION_PACKAGE_ALIGNMENT;
    assert.throws(() => validateIlluminationChunkTable(badOffset, { manifest: built.manifest }), rejectsCode('chunk_offset_noncanonical'));

    const missing = mutableJson(built.manifest);
    missing.selectedCapabilityProfileId = 'development.static_sun_v1';
    missing.capabilityProfiles = [{
        schema: 'bus-sim-illumination-capability-profile-v1',
        schemaVersion: 1,
        id: 'development.static_sun_v1',
        requiredChannels: ['static_sun_depth'],
        optionalChannels: [],
        requiredRuntimeCapabilities: ['static_receiver_sampling_v1'],
        exposure: 'internal_validation_only'
    }];
    assert.throws(() => validateIlluminationPackageManifest(missing), rejectsCode('capability_profile_channel_missing'));
});

test('V1 rejects nonzero mip levels at build and verified parse boundaries', async () => {
    const base = baseBuildOptions();
    base.chunks[0].mipLevel = 1;
    await assert.rejects(
        () => buildIlluminationBinaryPackage(base),
        rejectsCode('build_chunk_mip_level_unsupported')
    );

    const built = await buildPackageFixture();
    const invalidTable = mutableJson(built.chunkTable);
    invalidTable.chunks[0].mipLevel = 1;
    assert.throws(
        () => validateIlluminationChunkTable(invalidTable, { manifest: built.manifest }),
        rejectsCode('chunk_mip_level_unsupported')
    );

    const resealed = built.bytes.slice();
    const view = new DataView(resealed.buffer, resealed.byteOffset, resealed.byteLength);
    const tableOffset = view.getUint32(ILLUMINATION_HEADER_OFFSETS.tableOffset, true);
    const tableLength = view.getUint32(ILLUMINATION_HEADER_OFFSETS.tableLength, true);
    const tableBytes = resealed.subarray(tableOffset, tableOffset + tableLength);
    const tableText = new TextDecoder().decode(tableBytes);
    const replacedText = tableText.replace('"mipLevel":0', '"mipLevel":1');
    assert.notEqual(replacedText, tableText);
    tableBytes.set(new TextEncoder().encode(replacedText));
    resealed.set(sha256HexToBytes(await rawSha256Hex(tableBytes)), ILLUMINATION_HEADER_OFFSETS.tableSha256);
    const aggregateInput = resealed.slice();
    aggregateInput.fill(0, ILLUMINATION_AGGREGATE_HASH_OFFSET, ILLUMINATION_AGGREGATE_HASH_OFFSET + 32);
    resealed.set(sha256HexToBytes(await rawSha256Hex(aggregateInput)), ILLUMINATION_AGGREGATE_HASH_OFFSET);
    await assert.rejects(
        () => parseIlluminationBinaryPackage(resealed),
        rejectsCode('chunk_mip_level_unsupported')
    );
});

test('unknown required channels reject while versioned unknown optional channels remain integrity-checked and skipped', async () => {
    const base = baseBuildOptions();
    const unknownChunk = {
        id: 'future.payload',
        channelId: 'future_extension_channel',
        data: new Uint8Array([1, 2, 3, 4]),
        resourceType: 'buffer',
        encoding: 'raw_u8',
        precision: 'uint8',
        dimensions: { width: 4, height: 1, depth: 1, components: 1 },
        rowOrigin: 'not_applicable',
        coordinateTransform: null,
        mipLevel: 0,
        requiredRuntimeCapabilities: []
    };
    const optional = await buildIlluminationBinaryPackage({
        ...base,
        channels: [...base.channels, {
            id: 'future_extension_channel',
            required: false,
            sourceSha256: 'a'.repeat(64),
            profileSha256: 'b'.repeat(64),
            schemaVersion: 7
        }],
        chunks: [...base.chunks, unknownChunk]
    });
    const parsed = await parseIlluminationBinaryPackage(optional.bytes);
    assert.equal(parsed.compatibility.compatible, true);
    assert.deepEqual(parsed.compatibility.skippedOptionalChannelIds, ['future_extension_channel']);

    await assert.rejects(() => buildIlluminationBinaryPackage({
        ...base,
        channels: [...base.channels, {
            id: 'future_extension_channel',
            required: true,
            sourceSha256: 'a'.repeat(64),
            profileSha256: 'b'.repeat(64),
            schemaVersion: 7
        }],
        chunks: [...base.chunks, unknownChunk]
    }), rejectsCode('unknown_required_channel'));
});

test('named capability profiles enforce runtime minimum capabilities without changing package integrity', async () => {
    const sun = await buildIlluminationBinaryPackage({
        cityId: 'fixture.city',
        lightingProfileId: 'fixture.sun',
        selectedCapabilityProfileId: 'baked.hybrid_sun_v1',
        source: { resolvedSourceSha256: HASHES.source },
        compilerDescriptor: { id: 'compiler.fixture' },
        channels: [{
            id: 'static_sun_depth', required: true,
            sourceSha256: HASHES.sunSource, profileSha256: HASHES.sunProfile
        }],
        chunks: [{
            id: 'sun.depth', channelId: 'static_sun_depth', data: new Uint8Array([0x12, 0x34, 0xff, 0xff]),
            resourceType: 'texture_2d', encoding: 'rg8_unorm', precision: 'unorm8',
            dimensions: { width: 2, height: 1, depth: 1, components: 2 }, rowOrigin: 'lower_left',
            coordinateTransform: null, mipLevel: 0, requiredRuntimeCapabilities: []
        }]
    });
    const unsupported = await parseIlluminationBinaryPackage(sun.bytes, { runtimeCapabilities: [] });
    assert.equal(unsupported.compatibility.compatible, false);
    assert.equal(unsupported.compatibility.reason, 'unsupported_capability');
    assert.deepEqual(unsupported.compatibility.missingRuntimeCapabilities, [
        'dynamic_bus_shadow_layer_v1',
        'static_sun_sampling_on_bus_v1'
    ]);
    const supported = await parseIlluminationBinaryPackage(sun.bytes, {
        runtimeCapabilities: ['static_sun_sampling_on_bus_v1', 'dynamic_bus_shadow_layer_v1']
    });
    assert.equal(supported.compatibility.compatible, true);
    assert.equal(supported.chunks[0].descriptor.encoding, 'rg8_unorm');
    assert.deepEqual(Array.from(supported.chunks[0].data), [0x12, 0x34, 0xff, 0xff]);
});

test('selected capability profiles skip undeclared optional channels and reject undeclared required channels', async () => {
    const base = baseBuildOptions();
    const sunChannel = {
        id: 'static_sun_depth', required: true,
        sourceSha256: HASHES.sunSource, profileSha256: HASHES.sunProfile
    };
    const sunChunk = {
        id: 'sun.depth', channelId: 'static_sun_depth', data: new Float32Array([10, 10, 10, 1]),
        resourceType: 'texture_2d', encoding: 'rgba32f_le', precision: 'float32',
        dimensions: { width: 1, height: 1, depth: 1, components: 4 }, rowOrigin: 'lower_left',
        coordinateTransform: null, mipLevel: 0, requiredRuntimeCapabilities: []
    };
    const optionalDirect = { ...base.channels.find((entry) => entry.id === 'direct_receiver'), required: false };
    const directChunk = base.chunks.find((entry) => entry.channelId === 'direct_receiver');
    const built = await buildIlluminationBinaryPackage({
        cityId: 'fixture.city',
        lightingProfileId: 'fixture.sun',
        selectedCapabilityProfileId: 'baked.hybrid_sun_v1',
        source: { resolvedSourceSha256: HASHES.source },
        compilerDescriptor: { id: 'compiler.fixture' },
        channels: [sunChannel, optionalDirect],
        chunks: [sunChunk, directChunk]
    });
    const parsed = await parseIlluminationBinaryPackage(built.bytes);
    assert.deepEqual(parsed.compatibility.selectedChunkIds, ['sun.depth']);
    assert.deepEqual(parsed.compatibility.requiredChannelIds, ['static_sun_depth']);
    assert.deepEqual(parsed.compatibility.skippedOptionalChannelIds, ['direct_receiver']);

    await assert.rejects(() => buildIlluminationBinaryPackage({
        cityId: 'fixture.city',
        lightingProfileId: 'fixture.sun',
        selectedCapabilityProfileId: 'baked.hybrid_sun_v1',
        source: { resolvedSourceSha256: HASHES.source },
        compilerDescriptor: { id: 'compiler.fixture' },
        channels: [sunChannel, { ...optionalDirect, required: true }],
        chunks: [sunChunk, directChunk]
    }), rejectsCode('capability_profile_channel_unexpected'));
});

test('a missing optional channel remains a complete compatible capability-profile fixture', async () => {
    const built = await buildIlluminationBinaryPackage({
        cityId: 'fixture.city',
        lightingProfileId: 'fixture.sun',
        selectedCapabilityProfileId: 'baked.hybrid_sun_v1',
        source: { resolvedSourceSha256: HASHES.source },
        compilerDescriptor: { id: 'compiler.fixture' },
        channels: [{
            id: 'static_sun_depth', required: true,
            sourceSha256: HASHES.sunSource, profileSha256: HASHES.sunProfile
        }],
        chunks: [{
            id: 'sun.depth', channelId: 'static_sun_depth', data: new Float32Array([10, 10, 10, 1]),
            resourceType: 'texture_2d', encoding: 'rgba32f_le', precision: 'float32',
            dimensions: { width: 1, height: 1, depth: 1, components: 4 }, rowOrigin: 'lower_left',
            coordinateTransform: null, mipLevel: 0, requiredRuntimeCapabilities: []
        }]
    });
    const parsed = await parseIlluminationBinaryPackage(built.bytes, {
        runtimeCapabilities: ['dynamic_bus_shadow_layer_v1', 'static_sun_sampling_on_bus_v1']
    });
    assert.equal(parsed.compatibility.compatible, true);
    assert.deepEqual(parsed.compatibility.selectedChunkIds, ['sun.depth']);
    assert.equal(parsed.manifest.channels.some((channel) => channel.id === 'static_ao_bent_normal'), false);
});

test('swapped equal-size chunk payloads fail the owning chunk checksum', async () => {
    const base = baseBuildOptions();
    const built = await buildPackageFixture({
        chunks: base.chunks.map((chunk) => chunk.id === 'mapping.ids'
            ? {
                ...chunk,
                data: new Uint32Array([7, 11, 13, 17]),
                dimensions: { ...chunk.dimensions, width: 4 }
            }
            : chunk)
    });
    const swapped = built.bytes.slice();
    const payloadOffset = new DataView(swapped.buffer).getUint32(ILLUMINATION_HEADER_OFFSETS.payloadOffset, true);
    const [first, second] = built.chunkTable.chunks;
    assert.equal(first.byteLength, second.byteLength);
    const firstBytes = swapped.slice(payloadOffset + first.offset, payloadOffset + first.offset + first.byteLength);
    const secondBytes = swapped.slice(payloadOffset + second.offset, payloadOffset + second.offset + second.byteLength);
    swapped.set(secondBytes, payloadOffset + first.offset);
    swapped.set(firstBytes, payloadOffset + second.offset);
    await assert.rejects(() => parseIlluminationBinaryPackage(swapped), rejectsCode('chunk_hash_mismatch'));
});

test('a fully resealed but unsupported resource format is an explicit compatibility outcome', async () => {
    const built = await buildPackageFixture();
    const unsupported = built.bytes.slice();
    const view = new DataView(unsupported.buffer, unsupported.byteOffset, unsupported.byteLength);
    const tableOffset = view.getUint32(ILLUMINATION_HEADER_OFFSETS.tableOffset, true);
    const tableLength = view.getUint32(ILLUMINATION_HEADER_OFFSETS.tableLength, true);
    const tableBytes = unsupported.subarray(tableOffset, tableOffset + tableLength);
    const tableText = new TextDecoder().decode(tableBytes);
    const replacedText = tableText.replace('"resourceType":"texture_2d"', '"resourceType":"texture_xd"');
    assert.notEqual(replacedText, tableText);
    const replacedBytes = new TextEncoder().encode(replacedText);
    assert.equal(replacedBytes.byteLength, tableBytes.byteLength);
    tableBytes.set(replacedBytes);

    const tableSha256 = await rawSha256Hex(tableBytes);
    unsupported.set(sha256HexToBytes(tableSha256), ILLUMINATION_HEADER_OFFSETS.tableSha256);
    const aggregateInput = unsupported.slice();
    aggregateInput.fill(0, ILLUMINATION_AGGREGATE_HASH_OFFSET, ILLUMINATION_AGGREGATE_HASH_OFFSET + 32);
    const aggregateSha256 = await rawSha256Hex(aggregateInput);
    unsupported.set(sha256HexToBytes(aggregateSha256), ILLUMINATION_AGGREGATE_HASH_OFFSET);

    const parsed = await parseIlluminationBinaryPackage(unsupported);
    assert.equal(parsed.compatibility.compatible, false);
    assert.equal(parsed.compatibility.reason, 'unsupported_format');
    assert.deepEqual(parsed.compatibility.details, {
        capabilityCode: 'resource_format:texture_xd:rgba32f_le',
        capabilityCodes: ['resource_format:texture_xd:rgba32f_le'],
        channelIds: ['direct_receiver'],
        formats: [{
            capabilityCode: 'resource_format:texture_xd:rgba32f_le',
            channelId: 'direct_receiver',
            chunkId: 'direct.rgba32f',
            encoding: 'rgba32f_le',
            resourceType: 'texture_xd'
        }]
    });
    assert.ok(Object.isFrozen(parsed.compatibility.details.capabilityCodes));
    assert.ok(Object.isFrozen(parsed.compatibility.details.formats));
    assert.ok(Object.isFrozen(parsed.compatibility.details.formats[0]));
});

test('a resealed container with a bad chunk offset fails through the authoritative parser', async () => {
    const built = await buildPackageFixture();
    const invalid = built.bytes.slice();
    const view = new DataView(invalid.buffer, invalid.byteOffset, invalid.byteLength);
    const tableOffset = view.getUint32(ILLUMINATION_HEADER_OFFSETS.tableOffset, true);
    const tableLength = view.getUint32(ILLUMINATION_HEADER_OFFSETS.tableLength, true);
    const tableBytes = invalid.subarray(tableOffset, tableOffset + tableLength);
    const tableText = new TextDecoder().decode(tableBytes);
    const replacedText = tableText.replace('"offset":16', '"offset":32');
    assert.notEqual(replacedText, tableText);
    const replacedBytes = new TextEncoder().encode(replacedText);
    assert.equal(replacedBytes.byteLength, tableBytes.byteLength);
    tableBytes.set(replacedBytes);

    invalid.set(sha256HexToBytes(await rawSha256Hex(tableBytes)), ILLUMINATION_HEADER_OFFSETS.tableSha256);
    const aggregateInput = invalid.slice();
    aggregateInput.fill(0, ILLUMINATION_AGGREGATE_HASH_OFFSET, ILLUMINATION_AGGREGATE_HASH_OFFSET + 32);
    invalid.set(sha256HexToBytes(await rawSha256Hex(aggregateInput)), ILLUMINATION_AGGREGATE_HASH_OFFSET);
    await assert.rejects(() => parseIlluminationBinaryPackage(invalid), rejectsCode('chunk_offset_noncanonical'));
});
