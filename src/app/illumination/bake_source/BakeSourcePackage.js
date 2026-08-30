// Builds and validates deterministic self-describing illumination bake-source packages.
// @ts-check

import {
    assertStableId,
    assertUniqueIds,
    canonicalJsonBytes,
    canonicalJsonStringify,
    cloneCanonicalJson,
    compareCanonicalStrings
} from './CanonicalJson.js';
import { sha256Digest, sha256Hex } from './Hashing.js';
import {
    bytesEqual,
    compareBytes,
    concatBytes,
    copyBytes
} from './internal/ByteArrays.js';

export const BAKE_SOURCE_PACKAGE_MAGIC = 'ILBSRC01';
export const BAKE_SOURCE_PACKAGE_VERSION = 1;
export const BAKE_SOURCE_PACKAGE_SCHEMA = 'bus-simulator/illumination/bake-source-package/v1';
export const BAKE_SOURCE_BUFFER_TABLE_SCHEMA = 'bus-simulator/illumination/bake-source-buffer-table/v1';
export const BAKE_SOURCE_PACKAGE_INTEGRITY_DOMAIN = 'bus-simulator/illumination/bake-source/package-integrity/v1';
export const BAKE_SOURCE_BUFFER_INTEGRITY_DOMAIN = 'bus-simulator/illumination/bake-source/buffer-integrity/v1';

const MAGIC_BYTES = new TextEncoder().encode(BAKE_SOURCE_PACKAGE_MAGIC);
const HEADER_PREFIX_LENGTH = 32;
const INTEGRITY_LENGTH = 32;
const HEADER_LENGTH = HEADER_PREFIX_LENGTH + INTEGRITY_LENGTH;
const UINT32_MAX = 0xffffffff;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const EXPECTED_TABLE_KEYS = Object.freeze(['blobs', 'buffers', 'schema']);
const EXPECTED_BUFFER_KEYS = Object.freeze(['blobIndex', 'id']);
const EXPECTED_BLOB_KEYS = Object.freeze(['byteLength', 'offset', 'sha256']);

/**
 * @typedef {{
 *   id: string,
 *   data: ArrayBuffer | ArrayBufferView
 * }} BakeSourcePackageBuffer
 *
 * @typedef {{
 *   manifest: Record<string, unknown>,
 *   buffers?: readonly BakeSourcePackageBuffer[]
 * }} BuildBakeSourcePackageOptions
 *
 * @typedef {{
 *   id: string,
 *   sha256: string,
 *   byteLength: number,
 *   storageOffset: number,
 *   storageIndex: number
 * }} ParsedBakeSourceBuffer
 *
 * @typedef {{
 *   schema: string,
 *   version: number,
 *   manifest: Readonly<Record<string, unknown>>,
 *   bufferCount: number,
 *   uniqueBufferCount: number,
 *   buffers: readonly Readonly<ParsedBakeSourceBuffer>[],
 *   hasBuffer: (id: string) => boolean,
 *   getBuffer: (id: string) => Uint8Array
 * }} ParsedBakeSourcePackage
 */

/**
 * @param {BuildBakeSourcePackageOptions} options
 * @returns {Promise<Uint8Array>}
 */
export async function buildBakeSourcePackage(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('Bake-source package options must be an object');
    }
    if (!options.manifest || typeof options.manifest !== 'object' || Array.isArray(options.manifest)) {
        throw new TypeError('Bake-source package manifest must be a canonical object');
    }
    const inputBuffers = options.buffers ?? [];
    if (!Array.isArray(inputBuffers)) throw new TypeError('Bake-source package buffers must be an array');

    const manifestBytes = canonicalJsonBytes(options.manifest);
    const buffers = inputBuffers.map((entry, index) => {
        if (!entry || typeof entry !== 'object') {
            throw new TypeError('Bake-source package buffer[' + index + '] must be an object');
        }
        assertStableId(entry.id, 'Bake-source package buffer[' + index + '].id');
        return {
            id: entry.id,
            data: copyBytes(entry.data, 'Bake-source package buffer "' + entry.id + '" data')
        };
    });
    assertUniqueIds(buffers.map((entry) => entry.id), 'Bake-source package buffers');

    const hashedBuffers = await Promise.all(buffers.map(async (entry) => ({
        ...entry,
        sha256: await sha256Hex(BAKE_SOURCE_BUFFER_INTEGRITY_DOMAIN, entry.data)
    })));
    hashedBuffers.sort((left, right) => compareCanonicalStrings(left.id, right.id));

    const blobsByHash = new Map();
    for (const entry of hashedBuffers) {
        const existing = blobsByHash.get(entry.sha256);
        if (existing) {
            if (!bytesEqual(existing.data, entry.data)) {
                throw new Error('SHA-256 collision detected while deduplicating bake-source buffers');
            }
            continue;
        }
        blobsByHash.set(entry.sha256, { sha256: entry.sha256, data: entry.data });
    }
    const blobs = Array.from(blobsByHash.values());
    blobs.sort((left, right) => {
        const hashOrder = compareCanonicalStrings(left.sha256, right.sha256);
        return hashOrder || compareBytes(left.data, right.data);
    });

    let payloadByteLength = 0;
    const blobIndexByHash = new Map();
    const tableBlobs = blobs.map((blob, index) => {
        assertUint32(blob.data.byteLength, 'Bake-source blob byte length');
        assertUint32(payloadByteLength, 'Bake-source payload offset');
        const descriptor = {
            byteLength: blob.data.byteLength,
            offset: payloadByteLength,
            sha256: blob.sha256
        };
        blobIndexByHash.set(blob.sha256, index);
        payloadByteLength += blob.data.byteLength;
        assertUint32(payloadByteLength, 'Bake-source payload byte length');
        return descriptor;
    });
    const tableBuffers = hashedBuffers.map((entry) => ({
        blobIndex: blobIndexByHash.get(entry.sha256),
        id: entry.id
    }));
    const tableBytes = canonicalJsonBytes({
        blobs: tableBlobs,
        buffers: tableBuffers,
        schema: BAKE_SOURCE_BUFFER_TABLE_SCHEMA
    });
    const payloadBytes = concatBytes(blobs.map((blob) => blob.data));
    const preamble = createHeaderPreamble(
        manifestBytes.byteLength,
        tableBytes.byteLength,
        payloadBytes.byteLength,
        tableBuffers.length,
        tableBlobs.length
    );
    const body = concatBytes([manifestBytes, tableBytes, payloadBytes]);
    const integrity = await sha256Digest(
        BAKE_SOURCE_PACKAGE_INTEGRITY_DOMAIN,
        concatBytes([preamble, body])
    );
    return concatBytes([preamble, integrity, body]);
}

/**
 * @param {ArrayBuffer | ArrayBufferView} input
 * @returns {Promise<Readonly<ParsedBakeSourcePackage>>}
 */
export async function parseBakeSourcePackage(input) {
    const bytes = copyBytes(input, 'Bake-source package');
    if (bytes.byteLength < HEADER_LENGTH) throw new Error('bake_source_package_truncated_header');
    for (let index = 0; index < MAGIC_BYTES.length; index += 1) {
        if (bytes[index] !== MAGIC_BYTES[index]) throw new Error('bake_source_package_magic_mismatch');
    }
    const header = new DataView(bytes.buffer, bytes.byteOffset, HEADER_PREFIX_LENGTH);
    const version = header.getUint16(8, true);
    const flags = header.getUint16(10, true);
    if (version !== BAKE_SOURCE_PACKAGE_VERSION) throw new Error('bake_source_package_version_unsupported');
    if (flags !== 0) throw new Error('bake_source_package_flags_unsupported');

    const manifestByteLength = header.getUint32(12, true);
    const tableByteLength = header.getUint32(16, true);
    const payloadByteLength = header.getUint32(20, true);
    const bufferCount = header.getUint32(24, true);
    const uniqueBufferCount = header.getUint32(28, true);
    const expectedLength = HEADER_LENGTH + manifestByteLength + tableByteLength + payloadByteLength;
    if (!Number.isSafeInteger(expectedLength) || expectedLength !== bytes.byteLength) {
        throw new Error('bake_source_package_length_mismatch');
    }

    const preamble = bytes.slice(0, HEADER_PREFIX_LENGTH);
    const storedIntegrity = bytes.slice(HEADER_PREFIX_LENGTH, HEADER_LENGTH);
    const body = bytes.slice(HEADER_LENGTH);
    const computedIntegrity = await sha256Digest(
        BAKE_SOURCE_PACKAGE_INTEGRITY_DOMAIN,
        concatBytes([preamble, body])
    );
    if (!bytesEqual(storedIntegrity, computedIntegrity)) {
        throw new Error('bake_source_package_integrity_mismatch');
    }

    let offset = HEADER_LENGTH;
    const manifestBytes = bytes.slice(offset, offset + manifestByteLength);
    offset += manifestByteLength;
    const tableBytes = bytes.slice(offset, offset + tableByteLength);
    offset += tableByteLength;
    const payloadBytes = bytes.slice(offset);
    const manifest = parseCanonicalObject(manifestBytes, 'bake_source_manifest');
    const table = parseCanonicalObject(tableBytes, 'bake_source_buffer_table');
    const validated = validateBufferTable(table, bufferCount, uniqueBufferCount, payloadByteLength);

    const blobBytes = [];
    for (let index = 0; index < validated.blobs.length; index += 1) {
        const blob = validated.blobs[index];
        const data = payloadBytes.slice(blob.offset, blob.offset + blob.byteLength);
        const sha256 = await sha256Hex(BAKE_SOURCE_BUFFER_INTEGRITY_DOMAIN, data);
        if (sha256 !== blob.sha256) {
            throw new Error('bake_source_buffer_hash_mismatch:' + index);
        }
        blobBytes.push(data);
    }

    const publicBuffers = validated.buffers.map((entry) => {
        const blob = validated.blobs[entry.blobIndex];
        return Object.freeze({
            id: entry.id,
            sha256: blob.sha256,
            byteLength: blob.byteLength,
            storageOffset: blob.offset,
            storageIndex: entry.blobIndex
        });
    });
    const bufferIndexById = new Map(publicBuffers.map((entry) => [entry.id, entry.storageIndex]));
    return Object.freeze({
        schema: BAKE_SOURCE_PACKAGE_SCHEMA,
        version,
        manifest: /** @type {Readonly<Record<string, unknown>>} */ (cloneCanonicalJson(manifest)),
        bufferCount,
        uniqueBufferCount,
        buffers: Object.freeze(publicBuffers),
        hasBuffer(id) {
            assertStableId(id, 'Bake-source buffer ID');
            return bufferIndexById.has(id);
        },
        getBuffer(id) {
            assertStableId(id, 'Bake-source buffer ID');
            const blobIndex = bufferIndexById.get(id);
            if (blobIndex === undefined) throw new Error('Bake-source package has no buffer "' + id + '"');
            return blobBytes[blobIndex].slice();
        }
    });
}

/**
 * @param {number} manifestByteLength
 * @param {number} tableByteLength
 * @param {number} payloadByteLength
 * @param {number} bufferCount
 * @param {number} uniqueBufferCount
 * @returns {Uint8Array}
 */
function createHeaderPreamble(
    manifestByteLength,
    tableByteLength,
    payloadByteLength,
    bufferCount,
    uniqueBufferCount
) {
    const values = [
        ['manifest byte length', manifestByteLength],
        ['table byte length', tableByteLength],
        ['payload byte length', payloadByteLength],
        ['buffer count', bufferCount],
        ['unique buffer count', uniqueBufferCount]
    ];
    for (const [label, value] of values) assertUint32(value, 'Bake-source package ' + label);
    const bytes = new Uint8Array(HEADER_PREFIX_LENGTH);
    bytes.set(MAGIC_BYTES, 0);
    const view = new DataView(bytes.buffer);
    view.setUint16(8, BAKE_SOURCE_PACKAGE_VERSION, true);
    view.setUint16(10, 0, true);
    view.setUint32(12, manifestByteLength, true);
    view.setUint32(16, tableByteLength, true);
    view.setUint32(20, payloadByteLength, true);
    view.setUint32(24, bufferCount, true);
    view.setUint32(28, uniqueBufferCount, true);
    return bytes;
}

/**
 * @param {Uint8Array} bytes
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function parseCanonicalObject(bytes, label) {
    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        throw new Error(label + '_utf8_invalid');
    }
    let value;
    try {
        value = JSON.parse(text);
    } catch {
        throw new Error(label + '_json_invalid');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(label + '_object_required');
    }
    if (canonicalJsonStringify(value) !== text) throw new Error(label + '_not_canonical');
    return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {Record<string, unknown>} table
 * @param {number} expectedBufferCount
 * @param {number} expectedUniqueBufferCount
 * @param {number} payloadByteLength
 * @returns {{
 *   buffers: {id: string, blobIndex: number}[],
 *   blobs: {sha256: string, byteLength: number, offset: number}[]
 * }}
 */
function validateBufferTable(table, expectedBufferCount, expectedUniqueBufferCount, payloadByteLength) {
    assertExactKeys(table, EXPECTED_TABLE_KEYS, 'bake_source_buffer_table');
    if (table.schema !== BAKE_SOURCE_BUFFER_TABLE_SCHEMA) {
        throw new Error('bake_source_buffer_table_schema_unsupported');
    }
    if (!Array.isArray(table.buffers) || table.buffers.length !== expectedBufferCount) {
        throw new Error('bake_source_buffer_count_mismatch');
    }
    if (!Array.isArray(table.blobs) || table.blobs.length !== expectedUniqueBufferCount) {
        throw new Error('bake_source_unique_buffer_count_mismatch');
    }

    const blobs = table.blobs.map((rawBlob, index) => {
        if (!rawBlob || typeof rawBlob !== 'object' || Array.isArray(rawBlob)) {
            throw new Error('bake_source_blob_invalid:' + index);
        }
        const blob = /** @type {Record<string, unknown>} */ (rawBlob);
        assertExactKeys(blob, EXPECTED_BLOB_KEYS, 'bake_source_blob:' + index);
        if (typeof blob.sha256 !== 'string' || !SHA256_PATTERN.test(blob.sha256)) {
            throw new Error('bake_source_blob_hash_invalid:' + index);
        }
        assertUint32(blob.byteLength, 'bake_source_blob_byte_length:' + index);
        assertUint32(blob.offset, 'bake_source_blob_offset:' + index);
        return {
            sha256: /** @type {string} */ (blob.sha256),
            byteLength: /** @type {number} */ (blob.byteLength),
            offset: /** @type {number} */ (blob.offset)
        };
    });
    let nextOffset = 0;
    for (let index = 0; index < blobs.length; index += 1) {
        const blob = blobs[index];
        if (index > 0 && compareCanonicalStrings(blobs[index - 1].sha256, blob.sha256) >= 0) {
            throw new Error('bake_source_blobs_not_strictly_hash_sorted');
        }
        if (blob.offset !== nextOffset) throw new Error('bake_source_blob_layout_not_contiguous:' + index);
        nextOffset += blob.byteLength;
        if (!Number.isSafeInteger(nextOffset) || nextOffset > payloadByteLength) {
            throw new Error('bake_source_blob_out_of_bounds:' + index);
        }
    }
    if (nextOffset !== payloadByteLength) throw new Error('bake_source_payload_length_mismatch');

    const buffers = table.buffers.map((rawBuffer, index) => {
        if (!rawBuffer || typeof rawBuffer !== 'object' || Array.isArray(rawBuffer)) {
            throw new Error('bake_source_buffer_invalid:' + index);
        }
        const buffer = /** @type {Record<string, unknown>} */ (rawBuffer);
        assertExactKeys(buffer, EXPECTED_BUFFER_KEYS, 'bake_source_buffer:' + index);
        assertStableId(buffer.id, 'bake_source_buffer_id:' + index);
        if (!Number.isSafeInteger(buffer.blobIndex)
            || /** @type {number} */ (buffer.blobIndex) < 0
            || /** @type {number} */ (buffer.blobIndex) >= blobs.length) {
            throw new Error('bake_source_buffer_blob_index_invalid:' + index);
        }
        return {
            id: /** @type {string} */ (buffer.id),
            blobIndex: /** @type {number} */ (buffer.blobIndex)
        };
    });
    assertUniqueIds(buffers.map((entry) => entry.id), 'bake_source_buffer_table');
    for (let index = 1; index < buffers.length; index += 1) {
        if (compareCanonicalStrings(buffers[index - 1].id, buffers[index].id) >= 0) {
            throw new Error('bake_source_buffers_not_strictly_id_sorted');
        }
    }
    const referencedBlobs = new Set(buffers.map((entry) => entry.blobIndex));
    if (referencedBlobs.size !== blobs.length) throw new Error('bake_source_buffer_table_contains_unreferenced_blob');
    return { buffers, blobs };
}

/**
 * @param {Record<string, unknown>} value
 * @param {readonly string[]} expected
 * @param {string} label
 */
function assertExactKeys(value, expected, label) {
    const keys = Object.keys(value).sort(compareCanonicalStrings);
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
        throw new Error(label + '_keys_invalid');
    }
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {asserts value is number}
 */
function assertUint32(value, label) {
    if (!Number.isInteger(value) || /** @type {number} */ (value) < 0 || /** @type {number} */ (value) > UINT32_MAX) {
        throw new RangeError(label + ' must be a uint32 integer');
    }
}
