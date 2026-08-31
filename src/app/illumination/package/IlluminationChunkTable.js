// Validates the canonical chunk table whose offsets are relative to the package payload.
// @ts-check

import {
    ILLUMINATION_CHUNK_TABLE_SCHEMA,
    ILLUMINATION_MAX_CHUNKS,
    ILLUMINATION_MAX_CHUNK_BYTES,
    ILLUMINATION_PACKAGE_ALIGNMENT,
    ILLUMINATION_SUPPORTED_COMPRESSION
} from './IlluminationPackageConstants.js';
import { getIlluminationDecodedByteLength } from './IlluminationEncoding.js';
import { failIlluminationPackage } from './IlluminationPackageError.js';
import {
    requireExactKeys,
    requireObject,
    requireSha256,
    stableId,
    validateIdArray
} from './IlluminationPackageManifest.js';
import { canonicalJsonStringify, cloneCanonicalJson, compareCanonicalStrings } from '../bake_source/CanonicalJson.js';

const ENTRY_KEYS = Object.freeze([
    'byteLength',
    'channelId',
    'compression',
    'coordinateTransform',
    'decodedByteLength',
    'decodedSha256',
    'dimensions',
    'encoding',
    'id',
    'mipLevel',
    'offset',
    'precision',
    'requiredRuntimeCapabilities',
    'resourceType',
    'rowOrigin',
    'sha256'
]);

/**
 * @param {unknown} value
 * @param {{manifest?: Readonly<Record<string, any>>}} [options]
 */
export function validateIlluminationChunkTable(value, options = {}) {
    const table = requireObject(value, 'chunk table');
    requireExactKeys(table, ['alignment', 'chunks', 'payloadByteLength', 'schema', 'schemaVersion'], 'chunk table');
    if (table.schema !== ILLUMINATION_CHUNK_TABLE_SCHEMA || table.schemaVersion !== 1) {
        failIlluminationPackage('chunk_table_schema_unsupported', 'Illumination chunk table schema is unsupported.', {
            schema: table.schema ?? null,
            schemaVersion: table.schemaVersion ?? null
        });
    }
    if (table.alignment !== ILLUMINATION_PACKAGE_ALIGNMENT) {
        failIlluminationPackage('chunk_table_alignment_unsupported', 'Illumination chunk table alignment is unsupported.', {
            expected: ILLUMINATION_PACKAGE_ALIGNMENT,
            actual: table.alignment ?? null
        });
    }
    if (!Array.isArray(table.chunks) || table.chunks.length === 0 || table.chunks.length > ILLUMINATION_MAX_CHUNKS) {
        failIlluminationPackage('chunk_table_count_invalid', 'Chunk table count is outside V1 limits.', {
            count: Array.isArray(table.chunks) ? table.chunks.length : null
        });
    }
    const ids = new Set();
    let previousId = null;
    let expectedOffset = 0;
    for (const entryValue of table.chunks) {
        const entry = requireObject(entryValue, 'chunk table entry');
        requireExactKeys(entry, ENTRY_KEYS, 'chunk table entry');
        stableId(entry.id, 'chunk id');
        stableId(entry.channelId, `chunk '${entry.id}' channelId`);
        if (ids.has(entry.id) || (previousId !== null && compareCanonicalStrings(previousId, entry.id) >= 0)) {
            failIlluminationPackage('chunk_table_ids_not_canonical', 'Chunk IDs must be unique and ascending.', { id: entry.id });
        }
        if (!Number.isSafeInteger(entry.offset) || entry.offset < 0 || entry.offset % ILLUMINATION_PACKAGE_ALIGNMENT !== 0) {
            failIlluminationPackage('chunk_offset_invalid', 'Chunk offset must be a non-negative aligned safe integer.', { id: entry.id, offset: entry.offset ?? null });
        }
        if (entry.offset !== expectedOffset) {
            failIlluminationPackage('chunk_offset_noncanonical', 'Chunk offset does not follow deterministic aligned packing.', {
                id: entry.id,
                expected: expectedOffset,
                actual: entry.offset
            });
        }
        requireBoundedLength(entry.byteLength, `chunk '${entry.id}' byteLength`);
        requireBoundedLength(entry.decodedByteLength, `chunk '${entry.id}' decodedByteLength`);
        if (!ILLUMINATION_SUPPORTED_COMPRESSION.includes(entry.compression)) {
            failIlluminationPackage('chunk_compression_unsupported', 'V1 illumination chunks require compression none.', {
                id: entry.id,
                compression: entry.compression ?? null
            });
        }
        if (entry.compression === 'none' && entry.byteLength !== entry.decodedByteLength) {
            failIlluminationPackage('chunk_decoded_length_mismatch', 'Uncompressed chunk stored and decoded lengths must match.', { id: entry.id });
        }
        requireSha256(entry.sha256, `chunk '${entry.id}' sha256`);
        requireSha256(entry.decodedSha256, `chunk '${entry.id}' decodedSha256`);
        if (entry.compression === 'none' && entry.sha256 !== entry.decodedSha256) {
            failIlluminationPackage('chunk_decoded_hash_mismatch', 'Uncompressed chunk stored and decoded hashes must match.', { id: entry.id });
        }
        stableId(entry.resourceType, `chunk '${entry.id}' resourceType`);
        stableId(entry.encoding, `chunk '${entry.id}' encoding`);
        stableId(entry.precision, `chunk '${entry.id}' precision`);
        stableId(entry.rowOrigin, `chunk '${entry.id}' rowOrigin`);
        if (entry.mipLevel !== 0) {
            failIlluminationPackage('chunk_mip_level_unsupported', 'V1 illumination chunks require mip level zero.', {
                id: entry.id,
                mipLevel: entry.mipLevel ?? null
            });
        }
        validateDimensions(entry.dimensions, entry.id);
        if (entry.resourceType === 'texture_2d' && entry.dimensions.depth !== 1) {
            failIlluminationPackage('chunk_dimensions_invalid', 'texture_2d chunks must have depth one.', { id: entry.id });
        }
        if (entry.resourceType === 'buffer' && (entry.dimensions.height !== 1 || entry.dimensions.depth !== 1)) {
            failIlluminationPackage('chunk_dimensions_invalid', 'Buffer chunks must have height and depth one.', { id: entry.id });
        }
        if ((entry.resourceType === 'texture_2d' || entry.resourceType === 'texture_2d_array') && entry.rowOrigin !== 'lower_left') {
            failIlluminationPackage('chunk_row_origin_invalid', 'Texture chunks must use the canonical lower-left row origin.', { id: entry.id });
        }
        if (entry.resourceType === 'buffer' && entry.rowOrigin !== 'not_applicable') {
            failIlluminationPackage('chunk_row_origin_invalid', 'Buffer chunks must declare row origin not_applicable.', { id: entry.id });
        }
        validateIdArray(entry.requiredRuntimeCapabilities, `chunk '${entry.id}' requiredRuntimeCapabilities`);
        if (entry.coordinateTransform !== null) canonicalJsonStringify(requireObject(entry.coordinateTransform, `chunk '${entry.id}' coordinateTransform`));
        const expectedDecodedLength = getIlluminationDecodedByteLength(entry);
        if (expectedDecodedLength !== null && expectedDecodedLength !== entry.decodedByteLength) {
            failIlluminationPackage('chunk_encoding_length_mismatch', 'Chunk decoded length does not match its encoding and dimensions.', {
                id: entry.id,
                expected: expectedDecodedLength,
                actual: entry.decodedByteLength
            });
        }
        ids.add(entry.id);
        previousId = entry.id;
        expectedOffset = align(entry.offset + entry.byteLength);
        if (!Number.isSafeInteger(expectedOffset)) throw new RangeError('Chunk payload extent exceeds the safe integer range');
    }
    if (!Number.isSafeInteger(table.payloadByteLength) || table.payloadByteLength !== expectedOffset) {
        failIlluminationPackage('chunk_payload_length_invalid', 'Chunk table payload length does not match deterministic packed extent.', {
            expected: expectedOffset,
            actual: table.payloadByteLength ?? null
        });
    }
    if (options.manifest) validateManifestInventory(options.manifest, table);
    return cloneCanonicalJson(table);
}

/** @param {unknown} value @param {string} chunkId */
function validateDimensions(value, chunkId) {
    const dimensions = requireObject(value, `chunk '${chunkId}' dimensions`);
    requireExactKeys(dimensions, ['components', 'depth', 'height', 'width'], `chunk '${chunkId}' dimensions`);
    for (const key of ['components', 'depth', 'height', 'width']) {
        if (!Number.isSafeInteger(dimensions[key]) || dimensions[key] <= 0) {
            throw new TypeError(`chunk '${chunkId}' dimensions.${key} must be a positive safe integer`);
        }
    }
}

/** @param {number} value @param {string} label */
function requireBoundedLength(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > ILLUMINATION_MAX_CHUNK_BYTES) {
        failIlluminationPackage('chunk_length_invalid', label + ' is outside V1 limits.', { value: value ?? null, maximum: ILLUMINATION_MAX_CHUNK_BYTES });
    }
}

/** @param {Readonly<Record<string, any>>} manifest @param {Record<string, any>} table */
function validateManifestInventory(manifest, table) {
    const channelById = new Map(manifest.channels.map((channel) => [channel.id, channel]));
    const actualByChannel = new Map(manifest.channels.map((channel) => [channel.id, []]));
    for (const chunk of table.chunks) {
        if (!channelById.has(chunk.channelId)) {
            failIlluminationPackage('chunk_channel_missing', 'Chunk references a channel absent from the manifest.', {
                chunkId: chunk.id,
                channelId: chunk.channelId
            });
        }
        actualByChannel.get(chunk.channelId).push(chunk.id);
    }
    for (const channel of manifest.channels) {
        const actual = actualByChannel.get(channel.id).sort(compareCanonicalStrings);
        if (canonicalJsonStringify(actual) !== canonicalJsonStringify(channel.chunkIds)) {
            failIlluminationPackage('channel_chunk_inventory_mismatch', 'Manifest channel chunk inventory differs from the chunk table.', {
                channelId: channel.id,
                expected: channel.chunkIds,
                actual
            });
        }
    }
}

/** @param {number} value */
export function alignIlluminationPackageOffset(value) {
    return align(value);
}

/** @param {number} value */
function align(value) {
    return Math.ceil(value / ILLUMINATION_PACKAGE_ALIGNMENT) * ILLUMINATION_PACKAGE_ALIGNMENT;
}
