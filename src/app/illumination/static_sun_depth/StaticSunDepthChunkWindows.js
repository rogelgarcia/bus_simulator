// Defines authenticated whole-layer windows for multi-chunk static-sun texture arrays.
// @ts-check

import { canonicalJsonStringify, cloneCanonicalJson } from '../bake_source/CanonicalJson.js';
import {
    ILLUMINATION_MAX_CHUNK_BYTES,
    ILLUMINATION_MAX_PACKAGE_BYTES
} from '../package/IlluminationPackageConstants.js';
import { validateStaticSunDepthTileSetDescriptor } from './StaticSunDepthContract.js';
import {
    getStaticSunDepthBytesPerTexel,
    STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID
} from './StaticSunDepthEncoding.js';

export const STATIC_SUN_DEPTH_LAYER_WINDOW_SCHEMA =
    'bus-sim-static-sun-depth-layer-window-v1';
export const STATIC_SUN_DEPTH_CANONICAL_CHUNK_ID = 'static_sun_depth.tiles.rg8';
export const STATIC_SUN_DEPTH_DIAGNOSTIC_CHUNK_ID =
    'static_sun_depth.tiles.rgba8_rgb24a_diagnostic';
export const STATIC_SUN_DEPTH_LAYER_WINDOW_CHUNK_PREFIX =
    STATIC_SUN_DEPTH_CANONICAL_CHUNK_ID + '.window.';
export const STATIC_SUN_DEPTH_DIAGNOSTIC_LAYER_WINDOW_CHUNK_PREFIX =
    STATIC_SUN_DEPTH_DIAGNOSTIC_CHUNK_ID + '.window.';
export const STATIC_SUN_DEPTH_LAYER_WINDOW_CHUNK_DIGITS = 5;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ENVELOPE_KEYS = Object.freeze([
    'assembledByteLength',
    'assembledSha256',
    'firstLayer',
    'layerCount',
    'outputDescriptor',
    'schema'
]);

/** @param {number} index @param {'rg8_unorm'|'rgba8_unorm'} [encoding] */
export function staticSunDepthLayerWindowChunkId(index, encoding = 'rg8_unorm') {
    if (!Number.isSafeInteger(index) || index < 0 || index >= 10 ** STATIC_SUN_DEPTH_LAYER_WINDOW_CHUNK_DIGITS) {
        throw new RangeError('Static-sun layer-window chunk index is outside the canonical ID range');
    }
    const prefix = encoding === 'rg8_unorm'
        ? STATIC_SUN_DEPTH_LAYER_WINDOW_CHUNK_PREFIX
        : encoding === 'rgba8_unorm'
            ? STATIC_SUN_DEPTH_DIAGNOSTIC_LAYER_WINDOW_CHUNK_PREFIX
            : null;
    if (prefix === null) throw new TypeError(`Unsupported static-sun window encoding '${encoding}'`);
    return prefix
        + String(index).padStart(STATIC_SUN_DEPTH_LAYER_WINDOW_CHUNK_DIGITS, '0');
}

/** @param {number} layerByteLength @param {number} layerCount @param {number} [maximumChunkBytes] */
export function partitionStaticSunDepthLayers(
    layerByteLength,
    layerCount,
    maximumChunkBytes = ILLUMINATION_MAX_CHUNK_BYTES
) {
    requirePositiveSafeInteger(layerByteLength, 'layerByteLength');
    requirePositiveSafeInteger(layerCount, 'layerCount');
    requirePositiveSafeInteger(maximumChunkBytes, 'maximumChunkBytes');
    if (maximumChunkBytes > ILLUMINATION_MAX_CHUNK_BYTES) {
        throw new RangeError('maximumChunkBytes exceeds the AI 530 per-chunk limit');
    }
    if (layerByteLength > maximumChunkBytes) {
        throw new RangeError('One static-sun texture-array layer exceeds the per-chunk limit');
    }
    const assembledByteLength = layerByteLength * layerCount;
    if (!Number.isSafeInteger(assembledByteLength)
        || assembledByteLength > ILLUMINATION_MAX_PACKAGE_BYTES) {
        throw new RangeError('Static-sun texture-array payload exceeds the AI 530 package limit');
    }
    const layersPerChunk = Math.floor(maximumChunkBytes / layerByteLength);
    const windows = [];
    for (let firstLayer = 0; firstLayer < layerCount; firstLayer += layersPerChunk) {
        const windowLayerCount = Math.min(layersPerChunk, layerCount - firstLayer);
        windows.push(Object.freeze({
            byteLength: windowLayerCount * layerByteLength,
            firstLayer,
            layerCount: windowLayerCount
        }));
    }
    return Object.freeze(windows);
}

/** @param {{assembledByteLength: number, assembledSha256: string, firstLayer: number, layerCount: number, outputDescriptor: unknown}} value */
export function createStaticSunDepthLayerWindowEnvelope(value) {
    return validateStaticSunDepthLayerWindowEnvelope({
        ...value,
        schema: STATIC_SUN_DEPTH_LAYER_WINDOW_SCHEMA
    });
}

/** @param {unknown} value */
export function validateStaticSunDepthLayerWindowEnvelope(value) {
    const envelope = cloneCanonicalJson(value);
    requireExactKeys(envelope, ENVELOPE_KEYS, 'static-sun layer-window envelope');
    if (envelope.schema !== STATIC_SUN_DEPTH_LAYER_WINDOW_SCHEMA) {
        throw new TypeError(`Unsupported static-sun layer-window schema '${String(envelope.schema)}'`);
    }
    requirePositiveSafeInteger(envelope.assembledByteLength, 'assembledByteLength');
    if (envelope.assembledByteLength > ILLUMINATION_MAX_PACKAGE_BYTES) {
        throw new RangeError('Static-sun assembled payload exceeds the AI 530 package limit');
    }
    if (typeof envelope.assembledSha256 !== 'string'
        || !SHA256_PATTERN.test(envelope.assembledSha256)) {
        throw new TypeError('assembledSha256 must be 64 lowercase hexadecimal characters');
    }
    requireNonNegativeSafeInteger(envelope.firstLayer, 'firstLayer');
    requirePositiveSafeInteger(envelope.layerCount, 'layerCount');
    const outputDescriptor = validateStaticSunDepthTileSetDescriptor(envelope.outputDescriptor);
    const windowEnd = envelope.firstLayer + envelope.layerCount;
    if (!Number.isSafeInteger(windowEnd) || windowEnd > outputDescriptor.tiles.length) {
        throw new RangeError('Static-sun layer window exceeds outputDescriptor.tiles');
    }
    return Object.freeze({
        assembledByteLength: envelope.assembledByteLength,
        assembledSha256: envelope.assembledSha256,
        firstLayer: envelope.firstLayer,
        layerCount: envelope.layerCount,
        outputDescriptor,
        schema: envelope.schema
    });
}

/** @param {readonly Readonly<Record<string, any>>[]} chunks */
export function validateStaticSunDepthLayerWindowChunks(chunks) {
    if (!Array.isArray(chunks) || chunks.length < 1) {
        throw new TypeError('Static-sun layer-window chunks must be a non-empty array');
    }
    let firstEnvelope = null;
    let firstDescriptor = null;
    let outputDescriptorCanonicalJson = null;
    let capabilitiesCanonicalJson = null;
    let nextLayer = 0;
    let nextOffset = null;
    const sourceChunks = [];
    for (let index = 0; index < chunks.length; index += 1) {
        const descriptor = requireRecord(chunks[index], `static-sun chunks[${index}]`);
        const expectedId = staticSunDepthLayerWindowChunkId(
            index,
            descriptor.encoding
        );
        if (descriptor.id !== expectedId) {
            throw new Error(`Static-sun layer-window chunk ID must be '${expectedId}'`);
        }
        if (descriptor.channelId !== 'static_sun_depth'
            || descriptor.resourceType !== 'texture_2d_array'
            || !['rg8_unorm', 'rgba8_unorm'].includes(descriptor.encoding)
            || descriptor.precision !== 'unorm8'
            || descriptor.rowOrigin !== 'lower_left'
            || descriptor.compression !== 'none'
            || descriptor.mipLevel !== 0) {
            throw new Error(`Static-sun layer-window chunk '${descriptor.id}' has an incompatible resource contract`);
        }
        const envelope = validateStaticSunDepthLayerWindowEnvelope(descriptor.coordinateTransform);
        const diagnostic = envelope.outputDescriptor.identity.encoding.id
            === STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID;
        if ((diagnostic ? 'rgba8_unorm' : 'rg8_unorm') !== descriptor.encoding) {
            throw new Error(`Static-sun layer-window chunk '${descriptor.id}' encoding differs from its output descriptor`);
        }
        if (envelope.firstLayer !== nextLayer) {
            throw new Error(`Static-sun layer-window chunk '${descriptor.id}' creates a gap, overlap, or reorder at layer ${nextLayer}`);
        }
        const dimensions = requireRecord(descriptor.dimensions, `chunk '${descriptor.id}' dimensions`);
        const stored = envelope.outputDescriptor.tiles[0]?.storedTexels;
        const bytesPerTexel = getStaticSunDepthBytesPerTexel(
            envelope.outputDescriptor.identity.encoding
        );
        if (!Array.isArray(stored)
            || dimensions.components !== bytesPerTexel
            || dimensions.width !== stored[0]
            || dimensions.height !== stored[1]
            || dimensions.depth !== envelope.layerCount) {
            throw new Error(`Static-sun layer-window chunk '${descriptor.id}' dimensions do not match its authenticated layer window`);
        }
        const layerByteLength = stored[0] * stored[1] * bytesPerTexel;
        const windowByteLength = layerByteLength * envelope.layerCount;
        if (!Number.isSafeInteger(windowByteLength)
            || descriptor.byteLength !== windowByteLength
            || descriptor.decodedByteLength !== windowByteLength
            || windowByteLength > ILLUMINATION_MAX_CHUNK_BYTES) {
            throw new Error(`Static-sun layer-window chunk '${descriptor.id}' byte length is invalid`);
        }
        if (descriptor.sha256 !== descriptor.decodedSha256
            || typeof descriptor.sha256 !== 'string'
            || !SHA256_PATTERN.test(descriptor.sha256)) {
            throw new Error(`Static-sun layer-window chunk '${descriptor.id}' digest contract is invalid`);
        }
        if (!Number.isSafeInteger(descriptor.offset) || descriptor.offset < 0) {
            throw new Error(`Static-sun layer-window chunk '${descriptor.id}' offset is invalid`);
        }
        if (nextOffset !== null && descriptor.offset < nextOffset) {
            throw new Error('Static-sun layer-window package byte ranges overlap or reorder');
        }
        const currentDescriptorCanonicalJson = canonicalJsonStringify(envelope.outputDescriptor);
        const currentCapabilitiesCanonicalJson = canonicalJsonStringify(descriptor.requiredRuntimeCapabilities);
        if (firstEnvelope === null) {
            firstEnvelope = envelope;
            firstDescriptor = descriptor;
            outputDescriptorCanonicalJson = currentDescriptorCanonicalJson;
            capabilitiesCanonicalJson = currentCapabilitiesCanonicalJson;
        } else if (envelope.assembledByteLength !== firstEnvelope.assembledByteLength
            || envelope.assembledSha256 !== firstEnvelope.assembledSha256
            || currentDescriptorCanonicalJson !== outputDescriptorCanonicalJson
            || currentCapabilitiesCanonicalJson !== capabilitiesCanonicalJson) {
            throw new Error(`Static-sun layer-window chunk '${descriptor.id}' has an inconsistent authenticated envelope`);
        }
        sourceChunks.push(Object.freeze({
            byteLength: descriptor.byteLength,
            firstLayer: envelope.firstLayer,
            id: descriptor.id,
            layerCount: envelope.layerCount,
            offset: descriptor.offset,
            sha256: descriptor.sha256
        }));
        nextLayer += envelope.layerCount;
        nextOffset = descriptor.offset + descriptor.byteLength;
    }
    const envelope = /** @type {Readonly<Record<string, any>>} */ (firstEnvelope);
    const descriptor = /** @type {Readonly<Record<string, any>>} */ (firstDescriptor);
    const outputDescriptor = envelope.outputDescriptor;
    const stored = outputDescriptor.tiles[0].storedTexels;
    const bytesPerTexel = getStaticSunDepthBytesPerTexel(
        outputDescriptor.identity.encoding
    );
    const expectedAssembledByteLength = stored[0] * stored[1]
        * bytesPerTexel * outputDescriptor.tiles.length;
    if (nextLayer !== outputDescriptor.tiles.length
        || envelope.assembledByteLength !== expectedAssembledByteLength) {
        throw new Error('Static-sun layer-window chunks do not cover the exact output texture-array layer inventory');
    }
    return Object.freeze({
        assembledByteLength: envelope.assembledByteLength,
        assembledSha256: envelope.assembledSha256,
        dimensions: Object.freeze({
            components: bytesPerTexel,
            depth: outputDescriptor.tiles.length,
            height: stored[1],
            width: stored[0]
        }),
        outputDescriptor,
        canonicalChunkId: descriptor.encoding === 'rgba8_unorm'
            ? STATIC_SUN_DEPTH_DIAGNOSTIC_CHUNK_ID
            : STATIC_SUN_DEPTH_CANONICAL_CHUNK_ID,
        resourceEncoding: descriptor.encoding,
        requiredRuntimeCapabilities: descriptor.requiredRuntimeCapabilities,
        sourceChunks: Object.freeze(sourceChunks)
    });
}

/** @param {unknown} value @param {string} label */
function requireRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(label + ' must be an object');
    }
    return /** @type {Record<string, any>} */ (value);
}

/** @param {unknown} value @param {readonly string[]} expected @param {string} label */
function requireExactKeys(value, expected, label) {
    const record = requireRecord(value, label);
    const actual = Object.keys(record).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length
        || actual.some((key, index) => key !== wanted[index])) {
        throw new TypeError(`${label} must contain exactly: ${wanted.join(', ')}`);
    }
}

/** @param {unknown} value @param {string} label */
function requirePositiveSafeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new TypeError(label + ' must be a positive safe integer');
    }
}

/** @param {unknown} value @param {string} label */
function requireNonNegativeSafeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(label + ' must be a non-negative safe integer');
    }
}
