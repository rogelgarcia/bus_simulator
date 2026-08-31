// Builds and verifies the deterministic AI 530 binary illumination container.
// @ts-check

import {
    ILLUMINATION_AGGREGATE_HASH_LENGTH,
    ILLUMINATION_AGGREGATE_HASH_OFFSET,
    ILLUMINATION_BYTE_ORDER,
    ILLUMINATION_COMPRESSION_POLICY,
    ILLUMINATION_HASH_ALGORITHM,
    ILLUMINATION_HEADER_OFFSETS,
    ILLUMINATION_MAX_CHUNKS,
    ILLUMINATION_MAX_CHUNK_BYTES,
    ILLUMINATION_MAX_PACKAGE_BYTES,
    ILLUMINATION_MIP_POLICY,
    ILLUMINATION_PACKAGE_ALIGNMENT,
    ILLUMINATION_PACKAGE_ENDIAN_MARKER,
    ILLUMINATION_PACKAGE_HEADER_LENGTH,
    ILLUMINATION_PACKAGE_MAGIC,
    ILLUMINATION_PACKAGE_SCHEMA,
    ILLUMINATION_PACKAGE_VERSION,
    ILLUMINATION_PADDING_POLICY,
    ILLUMINATION_SUPPORTED_ENCODINGS,
    ILLUMINATION_UNKNOWN_OPTIONAL_POLICY
} from './IlluminationPackageConstants.js';
import { getIlluminationCapabilityProfile } from './IlluminationCapabilityProfiles.js';
import {
    alignIlluminationPackageOffset,
    validateIlluminationChunkTable
} from './IlluminationChunkTable.js';
import {
    encodeRgba16fLittleEndian,
    encodeRgba32fLittleEndian,
    encodeUint32LittleEndian,
    getIlluminationDecodedByteLength,
    validateIlluminationEncodedBytes
} from './IlluminationEncoding.js';
import { failIlluminationPackage } from './IlluminationPackageError.js';
import {
    requireExactKeys,
    requireObject,
    requireSha256,
    stableId,
    validateIlluminationPackageManifest,
    validateIdArray
} from './IlluminationPackageManifest.js';
import {
    evaluateIlluminationPackageCompatibility,
    isSupportedIlluminationResourceEncoding
} from './IlluminationPackageCompatibility.js';
import { rawSha256Hex, rawSha256OwnedHex, sha256HexToBytes } from './RawSha256.js';
import {
    canonicalJsonBytes,
    canonicalJsonStringify,
    cloneCanonicalJson,
    compareCanonicalStrings
} from '../bake_source/CanonicalJson.js';
import { bytesToHex, copyBytes } from './internal/ByteArrays.js';

const MAX_CANONICAL_SECTION_BYTES = 16 * 1024 * 1024;
const SUPPORTED_RESOURCE_TYPES = new Set(['buffer', 'texture_2d', 'texture_2d_array']);
const SUPPORTED_ENCODINGS = new Set(ILLUMINATION_SUPPORTED_ENCODINGS);

/**
 * @typedef {{
 *   id: string,
 *   channelId: string,
 *   data: ArrayBuffer | ArrayBufferView,
 *   resourceType: string,
 *   encoding: string,
 *   precision: string,
 *   dimensions: {width: number, height: number, depth: number, components: number},
 *   rowOrigin: string,
 *   coordinateTransform: null | Record<string, unknown>,
 *   mipLevel: number,
 *   requiredRuntimeCapabilities?: readonly string[]
 * }} IlluminationChunkInput
 */

/**
 * @param {{
 *   cityId: string,
 *   lightingProfileId: string,
 *   selectedCapabilityProfileId: string,
 *   source: Record<string, unknown>,
 *   compilerDescriptor: Record<string, unknown>,
 *   channels: readonly {id: string, required: boolean, sourceSha256: string, profileSha256: string, schemaVersion?: number}[],
 *   chunks: readonly IlluminationChunkInput[]
 * }} options
 * @returns {Promise<Readonly<Record<string, any>>>}
 */
export async function buildIlluminationBinaryPackage(options) {
    if (!options || typeof options !== 'object') throw new TypeError('Illumination package build options are required');
    stableId(options.cityId, 'cityId');
    stableId(options.lightingProfileId, 'lightingProfileId');
    stableId(options.selectedCapabilityProfileId, 'selectedCapabilityProfileId');
    const capabilityProfile = getIlluminationCapabilityProfile(options.selectedCapabilityProfileId);
    const sourceDescriptor = cloneCanonicalJson(requireObject(options.source, 'source'));
    requireSha256(sourceDescriptor.resolvedSourceSha256, 'source.resolvedSourceSha256');
    const compilerDescriptor = cloneCanonicalJson(requireObject(options.compilerDescriptor, 'compilerDescriptor'));
    const sourceDescriptorSha256 = await rawSha256Hex(canonicalJsonBytes(sourceDescriptor));
    const compilerSignatureSha256 = await rawSha256Hex(canonicalJsonBytes(compilerDescriptor));
    const normalizedChunks = await normalizeChunks(options.chunks);
    const channels = await normalizeChannels(options.channels, normalizedChunks, compilerSignatureSha256);
    const manifest = validateIlluminationPackageManifest({
        byteOrder: ILLUMINATION_BYTE_ORDER,
        capabilityProfiles: [capabilityProfile],
        channels,
        cityId: options.cityId,
        compiler: { descriptor: compilerDescriptor, signatureSha256: compilerSignatureSha256 },
        compressionPolicy: ILLUMINATION_COMPRESSION_POLICY,
        hashAlgorithm: ILLUMINATION_HASH_ALGORITHM,
        lightingProfileId: options.lightingProfileId,
        mipPolicy: ILLUMINATION_MIP_POLICY,
        paddingPolicy: ILLUMINATION_PADDING_POLICY,
        schema: ILLUMINATION_PACKAGE_SCHEMA,
        schemaVersion: 1,
        selectedCapabilityProfileId: options.selectedCapabilityProfileId,
        source: {
            descriptor: sourceDescriptor,
            descriptorSha256: sourceDescriptorSha256,
            resolvedSourceSha256: sourceDescriptor.resolvedSourceSha256
        },
        unknownOptionalPolicy: ILLUMINATION_UNKNOWN_OPTIONAL_POLICY
    });
    const { table, payload, chunkPaddingBytes } = buildChunkTableAndPayload(normalizedChunks, manifest);
    const manifestBytes = canonicalJsonBytes(manifest);
    const tableBytes = canonicalJsonBytes(table);
    requireCanonicalSectionLength(manifestBytes.byteLength, 'manifest');
    requireCanonicalSectionLength(tableBytes.byteLength, 'chunk table');
    const manifestOffset = ILLUMINATION_PACKAGE_HEADER_LENGTH;
    const tableOffset = alignIlluminationPackageOffset(manifestOffset + manifestBytes.byteLength);
    const payloadOffset = alignIlluminationPackageOffset(tableOffset + tableBytes.byteLength);
    const fileLength = payloadOffset + payload.byteLength;
    if (!Number.isSafeInteger(fileLength) || fileLength > ILLUMINATION_MAX_PACKAGE_BYTES) {
        failIlluminationPackage('package_size_exceeded', 'Illumination package exceeds the V1 maximum byte length.', {
            byteLength: fileLength,
            maximum: ILLUMINATION_MAX_PACKAGE_BYTES
        });
    }
    const bytes = new Uint8Array(fileLength);
    bytes.set(manifestBytes, manifestOffset);
    bytes.set(tableBytes, tableOffset);
    bytes.set(payload, payloadOffset);
    const manifestSha256 = await rawSha256Hex(manifestBytes);
    const tableSha256 = await rawSha256Hex(tableBytes);
    const payloadSha256 = await rawSha256Hex(payload);
    writeHeader(bytes, {
        manifestOffset,
        manifestLength: manifestBytes.byteLength,
        tableOffset,
        tableLength: tableBytes.byteLength,
        payloadOffset,
        payloadLength: payload.byteLength,
        fileLength,
        chunkCount: table.chunks.length,
        profileCount: manifest.capabilityProfiles.length,
        channelCount: manifest.channels.length,
        manifestSha256,
        tableSha256,
        payloadSha256
    });
    const aggregateSha256 = await calculateAggregateSha256(bytes);
    bytes.set(sha256HexToBytes(aggregateSha256), ILLUMINATION_AGGREGATE_HASH_OFFSET);
    const structuralPaddingBytes = (tableOffset - manifestOffset - manifestBytes.byteLength)
        + (payloadOffset - tableOffset - tableBytes.byteLength);
    return Object.freeze({
        bytes,
        manifest,
        chunkTable: table,
        aggregateSha256,
        metrics: Object.freeze({
            schema: 'bus-sim-illumination-package-build-metrics-v1',
            packageByteLength: bytes.byteLength,
            manifestByteLength: manifestBytes.byteLength,
            chunkTableByteLength: tableBytes.byteLength,
            payloadByteLength: payload.byteLength,
            decodedByteLength: normalizedChunks.reduce((sum, chunk) => sum + chunk.data.byteLength, 0),
            storedChunkByteLength: normalizedChunks.reduce((sum, chunk) => sum + chunk.data.byteLength, 0),
            paddingByteLength: structuralPaddingBytes + chunkPaddingBytes,
            compressionRatio: 1
        })
    });
}

/**
 * @param {ArrayBuffer | ArrayBufferView} value
 * @param {{expectations?: Record<string, unknown>, runtimeCapabilities?: Iterable<string>}} [options]
 * @returns {Promise<Readonly<Record<string, any>>>}
 */
export async function parseIlluminationBinaryPackage(value, options = {}) {
    const bytes = ownedPackageBytes(value);
    const header = readAndValidateHeader(bytes);
    const manifestBytes = bytes.subarray(header.manifestOffset, header.manifestOffset + header.manifestLength);
    const tableBytes = bytes.subarray(header.tableOffset, header.tableOffset + header.tableLength);
    const payload = bytes.subarray(header.payloadOffset, header.payloadOffset + header.payloadLength);
    await requireHash(manifestBytes, header.manifestSha256, 'manifest_hash_mismatch', 'Manifest SHA-256 does not match the header.');
    await requireHash(tableBytes, header.tableSha256, 'chunk_table_hash_mismatch', 'Chunk-table SHA-256 does not match the header.');
    const manifest = validateIlluminationPackageManifest(decodeCanonicalJson(manifestBytes, 'manifest'));
    const chunkTable = validateIlluminationChunkTable(decodeCanonicalJson(tableBytes, 'chunk table'), { manifest });
    if (header.chunkCount !== chunkTable.chunks.length
        || header.profileCount !== manifest.capabilityProfiles.length
        || header.channelCount !== manifest.channels.length
        || header.payloadLength !== chunkTable.payloadByteLength) {
        failIlluminationPackage('header_inventory_mismatch', 'Header counts or payload length differ from canonical tables.', {});
    }
    await verifyDescriptorSignatures(manifest);
    const chunks = [];
    let payloadCursor = 0;
    for (const entry of chunkTable.chunks) {
        requireZeroBytes(payload, payloadCursor, entry.offset, 'chunk_padding_nonzero');
        const end = entry.offset + entry.byteLength;
        if (!Number.isSafeInteger(end) || end > payload.byteLength) {
            failIlluminationPackage('chunk_bounds_invalid', 'Chunk exceeds the package payload.', { id: entry.id });
        }
        const data = payload.subarray(entry.offset, end);
        await requireHash(data, entry.sha256, 'chunk_hash_mismatch', 'Stored chunk SHA-256 does not match its descriptor.', { id: entry.id });
        await requireHash(data, entry.decodedSha256, 'chunk_decoded_hash_mismatch', 'Decoded chunk SHA-256 does not match its descriptor.', { id: entry.id });
        validateIlluminationEncodedBytes(data, entry.encoding);
        chunks.push(Object.freeze({ descriptor: entry, data }));
        payloadCursor = end;
    }
    requireZeroBytes(payload, payloadCursor, payload.byteLength, 'chunk_padding_nonzero');
    await verifyChannelOutputIntegrity(manifest, chunkTable);
    await requireHash(payload, header.payloadSha256, 'payload_hash_mismatch', 'Payload SHA-256 does not match the header.');
    const aggregateSha256 = await calculateAggregateSha256(bytes);
    if (aggregateSha256 !== header.aggregateSha256) {
        failIlluminationPackage('aggregate_hash_mismatch', 'Aggregate package SHA-256 does not match the zeroed-field identity.', {
            expected: header.aggregateSha256,
            actual: aggregateSha256
        });
    }
    const compatibility = evaluateIlluminationPackageCompatibility(manifest, chunkTable, {
        expectations: options.expectations,
        runtimeCapabilities: options.runtimeCapabilities,
        aggregateSha256
    });
    return Object.freeze({
        header,
        manifest,
        chunkTable,
        chunks: Object.freeze(chunks),
        aggregateSha256,
        compatibility,
        metrics: Object.freeze({
            schema: 'bus-sim-illumination-package-parse-metrics-v1',
            packageByteLength: bytes.byteLength,
            manifestByteLength: manifestBytes.byteLength,
            chunkTableByteLength: tableBytes.byteLength,
            payloadByteLength: payload.byteLength,
            decodedByteLength: chunkTable.chunks.reduce((sum, chunk) => sum + chunk.decodedByteLength, 0)
        })
    });
}

export const verifyIlluminationBinaryPackage = parseIlluminationBinaryPackage;

/** @param {readonly IlluminationChunkInput[]} values */
async function normalizeChunks(values) {
    if (!Array.isArray(values) || values.length === 0 || values.length > ILLUMINATION_MAX_CHUNKS) {
        failIlluminationPackage('build_chunk_count_invalid', 'Build requires a non-empty chunk inventory within V1 limits.', {});
    }
    const sorted = [...values].sort((left, right) => compareCanonicalStrings(left?.id, right?.id));
    const ids = new Set();
    const result = [];
    for (const input of sorted) {
        if (!input || typeof input !== 'object') throw new TypeError('Chunk input must be an object');
        stableId(input.id, 'chunk id');
        stableId(input.channelId, `chunk '${input.id}' channelId`);
        if (ids.has(input.id)) failIlluminationPackage('build_chunk_id_duplicate', 'Chunk IDs must be unique.', { id: input.id });
        stableId(input.resourceType, `chunk '${input.id}' resourceType`);
        if (!SUPPORTED_RESOURCE_TYPES.has(input.resourceType)) {
            failIlluminationPackage('build_resource_type_unsupported', 'Build chunk resource type is unsupported.', { id: input.id, resourceType: input.resourceType });
        }
        stableId(input.encoding, `chunk '${input.id}' encoding`);
        if (!SUPPORTED_ENCODINGS.has(input.encoding)) {
            failIlluminationPackage('build_encoding_unsupported', 'Build chunk encoding is unsupported.', { id: input.id, encoding: input.encoding });
        }
        if (!isSupportedIlluminationResourceEncoding(input.resourceType, input.encoding)) {
            failIlluminationPackage('build_resource_encoding_unsupported', 'Build chunk resource type and encoding combination is unsupported.', {
                id: input.id,
                resourceType: input.resourceType,
                encoding: input.encoding
            });
        }
        stableId(input.precision, `chunk '${input.id}' precision`);
        stableId(input.rowOrigin, `chunk '${input.id}' rowOrigin`);
        if (input.mipLevel !== 0) {
            failIlluminationPackage('build_chunk_mip_level_unsupported', 'V1 illumination chunks require mip level zero.', {
                id: input.id,
                mipLevel: input.mipLevel ?? null
            });
        }
        const dimensions = normalizeDimensions(input.dimensions, input.id);
        if (input.resourceType === 'texture_2d' && dimensions.depth !== 1) throw new TypeError(`chunk '${input.id}' texture_2d depth must be one`);
        if (input.resourceType === 'buffer' && (dimensions.height !== 1 || dimensions.depth !== 1)) {
            throw new TypeError(`chunk '${input.id}' buffer height and depth must be one`);
        }
        const data = normalizeChunkData(input);
        const expectedLength = getIlluminationDecodedByteLength({ encoding: input.encoding, precision: input.precision, dimensions });
        if (expectedLength !== data.byteLength) {
            failIlluminationPackage('build_chunk_length_mismatch', 'Build chunk bytes do not match encoding dimensions.', {
                id: input.id,
                expected: expectedLength,
                actual: data.byteLength
            });
        }
        if (data.byteLength === 0 || data.byteLength > ILLUMINATION_MAX_CHUNK_BYTES) {
            failIlluminationPackage('build_chunk_size_exceeded', 'Build chunk byte length is outside V1 limits.', { id: input.id, byteLength: data.byteLength });
        }
        validateIlluminationEncodedBytes(data, input.encoding);
        const sha256 = await rawSha256Hex(data);
        const requiredRuntimeCapabilities = [...(input.requiredRuntimeCapabilities ?? [])].sort(compareCanonicalStrings);
        validateIdArray(requiredRuntimeCapabilities, `chunk '${input.id}' requiredRuntimeCapabilities`);
        let coordinateTransform = null;
        if (input.coordinateTransform !== null) coordinateTransform = cloneCanonicalJson(requireObject(input.coordinateTransform, `chunk '${input.id}' coordinateTransform`));
        result.push(Object.freeze({
            id: input.id,
            channelId: input.channelId,
            data,
            resourceType: input.resourceType,
            encoding: input.encoding,
            precision: input.precision,
            dimensions,
            rowOrigin: input.rowOrigin,
            coordinateTransform,
            mipLevel: input.mipLevel,
            requiredRuntimeCapabilities: Object.freeze(requiredRuntimeCapabilities),
            sha256
        }));
        ids.add(input.id);
    }
    return Object.freeze(result);
}

/**
 * @param {readonly {id: string, required: boolean, sourceSha256: string, profileSha256: string, schemaVersion?: number}[]} values
 * @param {readonly Readonly<Record<string, any>>[]} chunks
 * @param {string} compilerSignatureSha256
 */
async function normalizeChannels(values, chunks, compilerSignatureSha256) {
    if (!Array.isArray(values) || values.length === 0 || values.length > 64) throw new TypeError('Build channels must contain between one and 64 entries');
    const sorted = [...values].sort((left, right) => compareCanonicalStrings(left?.id, right?.id));
    const seen = new Set();
    const result = [];
    for (const input of sorted) {
        if (!input || typeof input !== 'object') throw new TypeError('Channel input must be an object');
        stableId(input.id, 'channel id');
        if (seen.has(input.id)) failIlluminationPackage('build_channel_id_duplicate', 'Channel IDs must be unique.', { id: input.id });
        if (typeof input.required !== 'boolean') throw new TypeError(`channel '${input.id}' required must be boolean`);
        requireSha256(input.sourceSha256, `channel '${input.id}' sourceSha256`);
        requireSha256(input.profileSha256, `channel '${input.id}' profileSha256`);
        const schemaVersion = input.schemaVersion ?? 1;
        if (!Number.isSafeInteger(schemaVersion) || schemaVersion <= 0) throw new TypeError(`channel '${input.id}' schemaVersion must be positive`);
        const channelChunks = chunks.filter((chunk) => chunk.channelId === input.id);
        if (channelChunks.length === 0) failIlluminationPackage('build_channel_chunks_missing', 'Every package channel must own at least one chunk.', { id: input.id });
        const chunkIds = channelChunks.map((chunk) => chunk.id).sort(compareCanonicalStrings);
        const outputIntegritySha256 = await calculateChannelOutputIntegrity(input.id, channelChunks);
        result.push({
            chunkIds,
            compilerSignatureSha256,
            id: input.id,
            outputIntegritySha256,
            profileSha256: input.profileSha256,
            required: input.required,
            schemaVersion,
            sourceSha256: input.sourceSha256
        });
        seen.add(input.id);
    }
    for (const chunk of chunks) {
        if (!seen.has(chunk.channelId)) {
            failIlluminationPackage('build_chunk_channel_missing', 'Build chunk references a missing channel.', {
                chunkId: chunk.id,
                channelId: chunk.channelId
            });
        }
    }
    return result;
}

/** @param {readonly Readonly<Record<string, any>>[]} chunks @param {Readonly<Record<string, any>>} manifest */
function buildChunkTableAndPayload(chunks, manifest) {
    let offset = 0;
    const entries = [];
    for (const chunk of chunks) {
        entries.push({
            byteLength: chunk.data.byteLength,
            channelId: chunk.channelId,
            compression: 'none',
            coordinateTransform: chunk.coordinateTransform,
            decodedByteLength: chunk.data.byteLength,
            decodedSha256: chunk.sha256,
            dimensions: chunk.dimensions,
            encoding: chunk.encoding,
            id: chunk.id,
            mipLevel: chunk.mipLevel,
            offset,
            precision: chunk.precision,
            requiredRuntimeCapabilities: chunk.requiredRuntimeCapabilities,
            resourceType: chunk.resourceType,
            rowOrigin: chunk.rowOrigin,
            sha256: chunk.sha256
        });
        offset = alignIlluminationPackageOffset(offset + chunk.data.byteLength);
    }
    const payload = new Uint8Array(offset);
    let rawByteLength = 0;
    for (let index = 0; index < chunks.length; index += 1) {
        payload.set(chunks[index].data, entries[index].offset);
        rawByteLength += chunks[index].data.byteLength;
    }
    const table = validateIlluminationChunkTable({
        alignment: ILLUMINATION_PACKAGE_ALIGNMENT,
        chunks: entries,
        payloadByteLength: payload.byteLength,
        schema: 'bus-sim-illumination-chunk-table-v1',
        schemaVersion: 1
    }, { manifest });
    return { table, payload, chunkPaddingBytes: payload.byteLength - rawByteLength };
}

/** @param {Uint8Array} bytes @param {Record<string, any>} fields */
function writeHeader(bytes, fields) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, ILLUMINATION_PACKAGE_HEADER_LENGTH);
    for (let index = 0; index < ILLUMINATION_PACKAGE_MAGIC.length; index += 1) bytes[index] = ILLUMINATION_PACKAGE_MAGIC.charCodeAt(index);
    view.setUint16(ILLUMINATION_HEADER_OFFSETS.major, ILLUMINATION_PACKAGE_VERSION.major, true);
    view.setUint16(ILLUMINATION_HEADER_OFFSETS.minor, ILLUMINATION_PACKAGE_VERSION.minor, true);
    view.setUint32(ILLUMINATION_HEADER_OFFSETS.endianMarker, ILLUMINATION_PACKAGE_ENDIAN_MARKER, true);
    view.setUint32(ILLUMINATION_HEADER_OFFSETS.headerLength, ILLUMINATION_PACKAGE_HEADER_LENGTH, true);
    for (const key of ['manifestOffset', 'manifestLength', 'tableOffset', 'tableLength', 'payloadOffset', 'payloadLength', 'fileLength']) {
        view.setUint32(ILLUMINATION_HEADER_OFFSETS[key], fields[key], true);
    }
    view.setUint32(ILLUMINATION_HEADER_OFFSETS.alignment, ILLUMINATION_PACKAGE_ALIGNMENT, true);
    view.setUint32(ILLUMINATION_HEADER_OFFSETS.flags, 0, true);
    view.setUint32(ILLUMINATION_HEADER_OFFSETS.chunkCount, fields.chunkCount, true);
    view.setUint32(ILLUMINATION_HEADER_OFFSETS.profileCount, fields.profileCount, true);
    view.setUint32(ILLUMINATION_HEADER_OFFSETS.channelCount, fields.channelCount, true);
    view.setUint32(ILLUMINATION_HEADER_OFFSETS.reserved, 0, true);
    bytes.set(sha256HexToBytes(fields.manifestSha256), ILLUMINATION_HEADER_OFFSETS.manifestSha256);
    bytes.set(sha256HexToBytes(fields.tableSha256), ILLUMINATION_HEADER_OFFSETS.tableSha256);
    bytes.set(sha256HexToBytes(fields.payloadSha256), ILLUMINATION_HEADER_OFFSETS.payloadSha256);
}

/** @param {Uint8Array} bytes */
function readAndValidateHeader(bytes) {
    if (bytes.byteLength < ILLUMINATION_PACKAGE_HEADER_LENGTH) {
        failIlluminationPackage('package_truncated', 'Illumination package is shorter than its fixed header.', { byteLength: bytes.byteLength });
    }
    if (bytes.byteLength > ILLUMINATION_MAX_PACKAGE_BYTES) {
        failIlluminationPackage('package_size_exceeded', 'Illumination package exceeds the V1 maximum.', { byteLength: bytes.byteLength });
    }
    let magic = '';
    for (let index = 0; index < ILLUMINATION_PACKAGE_MAGIC.length; index += 1) magic += String.fromCharCode(bytes[index]);
    if (magic !== ILLUMINATION_PACKAGE_MAGIC) failIlluminationPackage('package_magic_invalid', 'Illumination package magic is invalid.', { magic });
    const view = new DataView(bytes.buffer, bytes.byteOffset, ILLUMINATION_PACKAGE_HEADER_LENGTH);
    const major = view.getUint16(ILLUMINATION_HEADER_OFFSETS.major, true);
    const minor = view.getUint16(ILLUMINATION_HEADER_OFFSETS.minor, true);
    if (major !== ILLUMINATION_PACKAGE_VERSION.major || minor !== ILLUMINATION_PACKAGE_VERSION.minor) {
        failIlluminationPackage('package_version_unsupported', 'Illumination package version is unsupported.', { major, minor });
    }
    const endianMarker = view.getUint32(ILLUMINATION_HEADER_OFFSETS.endianMarker, true);
    if (endianMarker !== ILLUMINATION_PACKAGE_ENDIAN_MARKER) failIlluminationPackage('package_endian_invalid', 'Illumination package endian marker is invalid.', {});
    const header = {
        magic,
        major,
        minor,
        endianMarker,
        headerLength: view.getUint32(ILLUMINATION_HEADER_OFFSETS.headerLength, true),
        manifestOffset: view.getUint32(ILLUMINATION_HEADER_OFFSETS.manifestOffset, true),
        manifestLength: view.getUint32(ILLUMINATION_HEADER_OFFSETS.manifestLength, true),
        tableOffset: view.getUint32(ILLUMINATION_HEADER_OFFSETS.tableOffset, true),
        tableLength: view.getUint32(ILLUMINATION_HEADER_OFFSETS.tableLength, true),
        payloadOffset: view.getUint32(ILLUMINATION_HEADER_OFFSETS.payloadOffset, true),
        payloadLength: view.getUint32(ILLUMINATION_HEADER_OFFSETS.payloadLength, true),
        fileLength: view.getUint32(ILLUMINATION_HEADER_OFFSETS.fileLength, true),
        alignment: view.getUint32(ILLUMINATION_HEADER_OFFSETS.alignment, true),
        flags: view.getUint32(ILLUMINATION_HEADER_OFFSETS.flags, true),
        chunkCount: view.getUint32(ILLUMINATION_HEADER_OFFSETS.chunkCount, true),
        profileCount: view.getUint32(ILLUMINATION_HEADER_OFFSETS.profileCount, true),
        channelCount: view.getUint32(ILLUMINATION_HEADER_OFFSETS.channelCount, true),
        reserved: view.getUint32(ILLUMINATION_HEADER_OFFSETS.reserved, true),
        manifestSha256: bytesToHex(bytes.subarray(ILLUMINATION_HEADER_OFFSETS.manifestSha256, ILLUMINATION_HEADER_OFFSETS.manifestSha256 + 32)),
        tableSha256: bytesToHex(bytes.subarray(ILLUMINATION_HEADER_OFFSETS.tableSha256, ILLUMINATION_HEADER_OFFSETS.tableSha256 + 32)),
        payloadSha256: bytesToHex(bytes.subarray(ILLUMINATION_HEADER_OFFSETS.payloadSha256, ILLUMINATION_HEADER_OFFSETS.payloadSha256 + 32)),
        aggregateSha256: bytesToHex(bytes.subarray(ILLUMINATION_AGGREGATE_HASH_OFFSET, ILLUMINATION_AGGREGATE_HASH_OFFSET + ILLUMINATION_AGGREGATE_HASH_LENGTH))
    };
    if (header.headerLength !== ILLUMINATION_PACKAGE_HEADER_LENGTH || header.manifestOffset !== ILLUMINATION_PACKAGE_HEADER_LENGTH) {
        failIlluminationPackage('header_layout_invalid', 'Fixed header or manifest offset is invalid.', {});
    }
    if (header.alignment !== ILLUMINATION_PACKAGE_ALIGNMENT || header.flags !== 0 || header.reserved !== 0) {
        failIlluminationPackage('header_policy_invalid', 'Header alignment, flags, or reserved word is invalid.', {});
    }
    requireZeroBytes(bytes, 200, ILLUMINATION_PACKAGE_HEADER_LENGTH, 'header_reserved_nonzero');
    requireCanonicalSectionLength(header.manifestLength, 'manifest');
    requireCanonicalSectionLength(header.tableLength, 'chunk table');
    const expectedTableOffset = alignIlluminationPackageOffset(header.manifestOffset + header.manifestLength);
    const expectedPayloadOffset = alignIlluminationPackageOffset(header.tableOffset + header.tableLength);
    if (header.tableOffset !== expectedTableOffset || header.payloadOffset !== expectedPayloadOffset
        || header.fileLength !== bytes.byteLength || header.payloadOffset + header.payloadLength !== header.fileLength) {
        failIlluminationPackage('header_bounds_invalid', 'Header offsets, lengths, or file length are inconsistent.', {
            expectedTableOffset,
            expectedPayloadOffset,
            actualFileLength: bytes.byteLength
        });
    }
    if (header.chunkCount === 0 || header.chunkCount > ILLUMINATION_MAX_CHUNKS || header.profileCount === 0 || header.channelCount === 0) {
        failIlluminationPackage('header_count_invalid', 'Header inventory counts are outside V1 limits.', {});
    }
    requireZeroBytes(bytes, header.manifestOffset + header.manifestLength, header.tableOffset, 'metadata_padding_nonzero');
    requireZeroBytes(bytes, header.tableOffset + header.tableLength, header.payloadOffset, 'metadata_padding_nonzero');
    return Object.freeze(header);
}

/** @param {Uint8Array} bytes */
async function calculateAggregateSha256(bytes) {
    const savedAggregate = bytes.slice(
        ILLUMINATION_AGGREGATE_HASH_OFFSET,
        ILLUMINATION_AGGREGATE_HASH_OFFSET + ILLUMINATION_AGGREGATE_HASH_LENGTH
    );
    bytes.fill(0, ILLUMINATION_AGGREGATE_HASH_OFFSET, ILLUMINATION_AGGREGATE_HASH_OFFSET + ILLUMINATION_AGGREGATE_HASH_LENGTH);
    try {
        return await rawSha256OwnedHex(bytes);
    } finally {
        bytes.set(savedAggregate, ILLUMINATION_AGGREGATE_HASH_OFFSET);
    }
}

/** @param {Readonly<Record<string, any>>} manifest */
async function verifyDescriptorSignatures(manifest) {
    const sourceSha256 = await rawSha256Hex(canonicalJsonBytes(manifest.source.descriptor));
    if (sourceSha256 !== manifest.source.descriptorSha256) {
        failIlluminationPackage('source_descriptor_hash_mismatch', 'Source descriptor SHA-256 is invalid.', {
            expected: manifest.source.descriptorSha256,
            actual: sourceSha256
        });
    }
    const compilerSha256 = await rawSha256Hex(canonicalJsonBytes(manifest.compiler.descriptor));
    if (compilerSha256 !== manifest.compiler.signatureSha256) {
        failIlluminationPackage('compiler_signature_mismatch', 'Compiler descriptor signature SHA-256 is invalid.', {
            expected: manifest.compiler.signatureSha256,
            actual: compilerSha256
        });
    }
}

/** @param {Readonly<Record<string, any>>} manifest @param {Readonly<Record<string, any>>} table */
async function verifyChannelOutputIntegrity(manifest, table) {
    for (const channel of manifest.channels) {
        const chunks = table.chunks.filter((chunk) => chunk.channelId === channel.id);
        const actual = await calculateChannelOutputIntegrity(channel.id, chunks);
        if (actual !== channel.outputIntegritySha256) {
            failIlluminationPackage('channel_output_integrity_mismatch', 'Channel output-integrity SHA-256 is invalid.', {
                channelId: channel.id,
                expected: channel.outputIntegritySha256,
                actual
            });
        }
    }
}

/** @param {string} channelId @param {readonly Readonly<Record<string, any>>[]} chunks */
async function calculateChannelOutputIntegrity(channelId, chunks) {
    return rawSha256Hex(canonicalJsonBytes({
        channelId,
        chunks: chunks.map((chunk) => ({
            decodedByteLength: chunk.data?.byteLength ?? chunk.decodedByteLength,
            decodedSha256: chunk.sha256 ?? chunk.decodedSha256,
            id: chunk.id
        })).sort((left, right) => compareCanonicalStrings(left.id, right.id))
    }));
}

/** @param {Uint8Array} bytes @param {string} expected @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
async function requireHash(bytes, expected, code, message, details = {}) {
    const actual = await rawSha256OwnedHex(bytes);
    if (actual !== expected) failIlluminationPackage(code, message, { ...details, expected, actual });
}

/** @param {Uint8Array} bytes @param {string} label */
function decodeCanonicalJson(bytes, label) {
    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
        failIlluminationPackage('canonical_json_utf8_invalid', label + ' is not valid UTF-8.', {});
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        failIlluminationPackage('canonical_json_invalid', label + ' is not valid JSON.', {});
    }
    if (canonicalJsonStringify(parsed) !== text) failIlluminationPackage('canonical_json_noncanonical', label + ' bytes are not canonical JSON.', {});
    return parsed;
}

/** @param {Uint8Array} bytes @param {number} start @param {number} end @param {string} code */
function requireZeroBytes(bytes, start, end, code) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > bytes.byteLength) {
        failIlluminationPackage('package_bounds_invalid', 'Package byte range is invalid.', { start, end, byteLength: bytes.byteLength });
    }
    for (let index = start; index < end; index += 1) {
        if (bytes[index] !== 0) failIlluminationPackage(code, 'Illumination package deterministic padding must be zero.', { offset: index });
    }
}

/** @param {unknown} value @param {string} chunkId */
function normalizeDimensions(value, chunkId) {
    const dimensions = requireObject(value, `chunk '${chunkId}' dimensions`);
    requireExactKeys(dimensions, ['components', 'depth', 'height', 'width'], `chunk '${chunkId}' dimensions`);
    const result = {};
    for (const key of ['components', 'depth', 'height', 'width']) {
        if (!Number.isSafeInteger(dimensions[key]) || dimensions[key] <= 0) throw new TypeError(`chunk '${chunkId}' dimensions.${key} must be positive`);
        result[key] = dimensions[key];
    }
    return Object.freeze(result);
}

/** @param {IlluminationChunkInput} input */
function normalizeChunkData(input) {
    if (input.encoding === 'rgba32f_le' && input.data instanceof Float32Array) return encodeRgba32fLittleEndian(input.data);
    if (input.encoding === 'rgba16f_le' && input.data instanceof Float32Array) return encodeRgba16fLittleEndian(input.data);
    if (input.encoding === 'uint32_le' && input.data instanceof Uint32Array) return encodeUint32LittleEndian(input.data);
    const value = /** @type {ArrayBuffer | ArrayBufferView} */ (input.data);
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    return copyBytes(value, `chunk '${input.id}' data`);
}

/** @param {number} byteLength @param {string} label */
function requireCanonicalSectionLength(byteLength, label) {
    if (!Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength > MAX_CANONICAL_SECTION_BYTES) {
        failIlluminationPackage('canonical_section_size_invalid', `Illumination ${label} byte length is outside V1 limits.`, {
            byteLength,
            maximum: MAX_CANONICAL_SECTION_BYTES
        });
    }
}

/** @param {ArrayBuffer | ArrayBufferView} value */
function byteView(value) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError('Illumination package must be an ArrayBuffer or ArrayBuffer view');
}

/** @param {ArrayBuffer | ArrayBufferView} value */
function ownedPackageBytes(value) {
    const source = byteView(value);
    if (source.byteLength > ILLUMINATION_MAX_PACKAGE_BYTES) {
        failIlluminationPackage('package_size_exceeded', 'Illumination package exceeds the V1 maximum byte length.', {
            byteLength: source.byteLength,
            maximum: ILLUMINATION_MAX_PACKAGE_BYTES
        });
    }
    return source.slice();
}
