// Adapts one fully verified AI 530 package into a generic staged-resource plan.
// @ts-check

import {
    rawSha256Hex,
    rawSha256OwnedHex,
    rawSha256OwnedSegmentsHex
} from '../../../app/illumination/package/RawSha256.js';
import { isTransferredIlluminationPackageParse } from '../../../app/illumination/package/IlluminationBinaryPackage.js';
import {
    STATIC_SUN_DEPTH_LAYER_WINDOW_SCHEMA,
    validateStaticSunDepthLayerWindowChunks
} from '../../../app/illumination/static_sun_depth/StaticSunDepthChunkWindows.js';
import { createRuntimeFailure } from './IlluminationRuntimeError.js';

const TRUSTED_PACKAGE_SUBVIEWS = new WeakSet();
const TRUSTED_PACKAGE_SEGMENTS = new WeakSet();

const COMPATIBILITY_FAILURES = Object.freeze({
    aggregate_identity_mismatch: Object.freeze({ state: 'failed', reason: 'integrity_failure' }),
    compiler_signature_mismatch: Object.freeze({ state: 'stale', reason: 'compiler_mismatch' }),
    incompatible_capability_profile: Object.freeze({ state: 'stale', reason: 'profile_mismatch' }),
    stale_source: Object.freeze({ state: 'stale', reason: 'source_mismatch' }),
    unsupported_capability: Object.freeze({ state: 'unavailable', reason: 'unsupported_capability' }),
    unsupported_format: Object.freeze({ state: 'unavailable', reason: 'unsupported_capability' }),
    wrong_city: Object.freeze({ state: 'stale', reason: 'city_mismatch' }),
    wrong_profile: Object.freeze({ state: 'stale', reason: 'profile_mismatch' })
});

/**
 * @param {{
 *   manifest: Readonly<Record<string, any>>,
 *   chunkTable: Readonly<Record<string, any>>,
 *   chunks: readonly {descriptor: Readonly<Record<string, any>>, data: Uint8Array}[],
 *   aggregateSha256: string,
 *   compatibility: Readonly<Record<string, any>>
 * }} parsed
 * @param {{residentCpuPolicy?: 'release' | 'retain', prewarmMemory?: {cpuBytes?: number, gpuBytes?: number}}} [options]
 */
export function createIlluminationPackageResourcePlan(parsed, options = {}) {
    requireParsedPackage(parsed);
    if (!parsed.compatibility.compatible) throwCompatibility(parsed.compatibility);
    const residentCpuPolicy = options.residentCpuPolicy ?? 'release';
    if (!['release', 'retain'].includes(residentCpuPolicy)) {
        throw new TypeError('residentCpuPolicy must be release or retain');
    }
    const chunkById = new Map(parsed.chunks.map((entry) => [entry.descriptor.id, entry]));
    const selectedIds = parsed.compatibility.selectedChunkIds;
    const selectedEntries = selectedIds.map((id) => {
        const entry = chunkById.get(id);
        if (!entry) {
            throw createRuntimeFailure('verified_chunk_missing', `Verified package chunk '${id}' is unavailable.`, {
                reason: 'validation_failure',
                context: { chunkId: id }
            });
        }
        return entry;
    });
    const ownedPackage = isTransferredIlluminationPackageParse(parsed);
    const resources = coalesceSelectedEntries(selectedEntries).map((entry) => {
        const descriptor = entry.descriptor;
        return Object.freeze({
            ...descriptor,
            byteLength: descriptor.byteLength,
            sha256: descriptor.sha256,
            upload: Object.freeze({
                kind: descriptor.resourceType,
                encoding: descriptor.encoding,
                ...(descriptor.resourceType === 'texture_2d' ? {
                    width: descriptor.dimensions.width,
                    height: descriptor.dimensions.height
                } : {}),
                ...(descriptor.resourceType === 'texture_2d_array' ? {
                    width: descriptor.dimensions.width,
                    height: descriptor.dimensions.height,
                    layers: descriptor.dimensions.depth
                } : {}),
                ...(descriptor.resourceType === 'buffer' ? { target: 'array_buffer' } : {})
            }),
            memory: Object.freeze({
                fetchedCpuBytes: ownedPackage ? 0 : descriptor.byteLength,
                decodedCpuBytes: ownedPackage ? 0 : descriptor.decodedByteLength,
                residentCpuBytes: residentCpuPolicy === 'retain' ? descriptor.decodedByteLength : 0,
                residentGpuBytes: descriptor.decodedByteLength
            })
        });
    });
    const requiredChannels = new Set(parsed.compatibility.requiredChannelIds);
    const requiredResourceIds = resources
        .filter((entry) => requiredChannels.has(entry.channelId))
        .map((entry) => entry.id)
        .sort();
    const selectedChannels = [...new Set(resources.map((entry) => entry.channelId))].sort();
    const selectedProfile = parsed.manifest.capabilityProfiles.find(
        (entry) => entry.id === parsed.manifest.selectedCapabilityProfileId
    );
    const requiredCapabilities = new Set(selectedProfile.requiredRuntimeCapabilities);
    for (const resource of resources) {
        for (const capability of resource.requiredRuntimeCapabilities) requiredCapabilities.add(capability);
    }
    const prewarmMemory = normalizeMemory(options.prewarmMemory);
    return Object.freeze({
        id: parsed.aggregateSha256,
        identity: Object.freeze({
            packageId: parsed.aggregateSha256,
            profileId: parsed.manifest.lightingProfileId,
            capabilityProfileId: parsed.manifest.selectedCapabilityProfileId,
            cityId: parsed.manifest.cityId,
            compilerSignature: parsed.manifest.compiler.signatureSha256,
            selectedChannels: Object.freeze(selectedChannels),
            sourceHashes: Object.freeze({
                descriptorSha256: parsed.manifest.source.descriptorSha256,
                resolvedSourceSha256: parsed.manifest.source.resolvedSourceSha256,
                channels: Object.freeze(Object.fromEntries(parsed.manifest.channels.map((channel) => [channel.id, channel.sourceSha256])))
            }),
            integrityHashes: Object.freeze({
                aggregateSha256: parsed.aggregateSha256,
                channels: Object.freeze(Object.fromEntries(parsed.manifest.channels.map((channel) => [channel.id, channel.outputIntegritySha256])))
            })
        }),
        metadata: Object.freeze({
            manifest: parsed.manifest,
            skippedOptionalChannelIds: parsed.compatibility.skippedOptionalChannelIds
        }),
        resources: Object.freeze(resources),
        requiredResourceIds: Object.freeze(requiredResourceIds),
        requiredCapabilities: Object.freeze([...requiredCapabilities].sort()),
        prewarmMemory
    });
}

/** @param {readonly {descriptor: Readonly<Record<string, any>>, data: Uint8Array}[]} entries */
function coalesceSelectedEntries(entries) {
    const staticEntries = entries.filter(
        (entry) => entry.descriptor.channelId === 'static_sun_depth'
    );
    if (staticEntries.length === 0) return entries;
    const hasWindowEnvelope = staticEntries.some(
        (entry) => entry.descriptor.coordinateTransform?.schema
            === STATIC_SUN_DEPTH_LAYER_WINDOW_SCHEMA
    );
    if (staticEntries.length === 1 && !hasWindowEnvelope) return entries;
    const resolved = validateStaticSunDepthLayerWindowChunks(
        staticEntries.map((entry) => entry.descriptor)
    );
    const first = staticEntries[0].descriptor;
    const logical = Object.freeze({
        descriptor: Object.freeze({
            ...first,
            id: resolved.canonicalChunkId,
            byteLength: resolved.assembledByteLength,
            decodedByteLength: resolved.assembledByteLength,
            sha256: resolved.assembledSha256,
            decodedSha256: resolved.assembledSha256,
            dimensions: resolved.dimensions,
            coordinateTransform: resolved.outputDescriptor,
            requiredRuntimeCapabilities: resolved.requiredRuntimeCapabilities,
            sourceChunks: resolved.sourceChunks,
            sourceOwnership: 'authenticated-package-layer-windows-v1'
        }),
        data: staticEntries[0].data
    });
    const result = [];
    let inserted = false;
    for (const entry of entries) {
        if (entry.descriptor.channelId !== 'static_sun_depth') {
            result.push(entry);
        } else if (!inserted) {
            result.push(logical);
            inserted = true;
        }
    }
    return Object.freeze(result);
}

/**
 * @param {{chunks: readonly {descriptor: Readonly<Record<string, any>>, data: Uint8Array}[]}} parsed
 */
export function createIlluminationPackageChunkReader(parsed) {
    if (!parsed || !Array.isArray(parsed.chunks)) throw new TypeError('Parsed illumination package chunks are required');
    const byId = new Map(parsed.chunks.map((entry) => [entry.descriptor.id, entry.data]));
    const ownsPackageBuffer = isTransferredIlluminationPackageParse(parsed);
    let disposed = false;
    return Object.freeze({
        /** @param {{id: string}} descriptor */
        fetchResource(descriptor) {
            if (disposed) {
                throw createRuntimeFailure('verified_chunk_reader_disposed', 'Verified package chunk bytes have already been released.', {
                    phase: 'fetching',
                    reason: 'fetch_failure',
                    context: { chunkId: descriptor.id }
                });
            }
            const sourceIds = Array.isArray(descriptor.sourceChunks)
                ? descriptor.sourceChunks.map((entry) => entry.id)
                : [descriptor.id];
            const sources = sourceIds.map((id) => byId.get(id));
            if (sources.some((data) => !(data instanceof Uint8Array))) {
                throw createRuntimeFailure('verified_chunk_missing', `Verified package chunk '${descriptor.id}' is unavailable.`, {
                    phase: 'fetching',
                    reason: 'fetch_failure',
                    context: { chunkId: descriptor.id }
                });
            }
            const sourceBytes = /** @type {Uint8Array[]} */ (sources);
            const totalByteLength = sourceBytes.reduce((sum, data) => sum + data.byteLength, 0);
            if (totalByteLength !== descriptor.byteLength) {
                throw createRuntimeFailure('verified_chunk_window_length_mismatch', `Verified package windows for '${descriptor.id}' are incomplete.`, {
                    phase: 'fetching',
                    reason: 'integrity_failure',
                    context: { chunkId: descriptor.id, expected: descriptor.byteLength, actual: totalByteLength }
                });
            }
            if (!ownsPackageBuffer) {
                if (sourceBytes.length === 1) return sourceBytes[0].slice();
                const assembled = new Uint8Array(totalByteLength);
                let offset = 0;
                for (const data of sourceBytes) {
                    assembled.set(data, offset);
                    offset += data.byteLength;
                }
                return assembled;
            }
            const first = sourceBytes[0];
            let contiguous = true;
            for (let index = 1; index < sourceBytes.length; index += 1) {
                const previous = sourceBytes[index - 1];
                const current = sourceBytes[index];
                if (current.buffer !== first.buffer) {
                    throw createRuntimeFailure('verified_chunk_windows_unowned', `Verified package windows for '${descriptor.id}' do not share one owned package buffer.`, {
                        phase: 'fetching',
                        reason: 'integrity_failure',
                        context: { chunkId: descriptor.id, sourceChunkId: sourceIds[index] }
                    });
                }
                contiguous &&= current.byteOffset === previous.byteOffset + previous.byteLength;
            }
            if (!contiguous) {
                const segmented = Object.freeze({
                    byteLength: totalByteLength,
                    ownership: 'borrowed-verified-package-segments-v1',
                    segments: Object.freeze([...sourceBytes])
                });
                TRUSTED_PACKAGE_SEGMENTS.add(segmented);
                return Object.freeze({
                    bytes: segmented,
                    cpuBytes: 0,
                    ownership: segmented.ownership
                });
            }
            const view = new Uint8Array(first.buffer, first.byteOffset, totalByteLength);
            TRUSTED_PACKAGE_SUBVIEWS.add(view);
            return Object.freeze({
                bytes: view,
                cpuBytes: 0,
                ownership: 'borrowed-verified-package-subview-v1'
            });
        },
        dispose() {
            if (disposed) return false;
            disposed = true;
            byId.clear();
            return true;
        }
    });
}

/** @param {unknown} bytes */
export function hashIlluminationPackageResource(bytes) {
    if (isTrustedIlluminationPackageSegmentedBytes(bytes)) {
        return rawSha256OwnedSegmentsHex(bytes.segments);
    }
    if (bytes instanceof Uint8Array && TRUSTED_PACKAGE_SUBVIEWS.has(bytes)) {
        return rawSha256OwnedHex(bytes);
    }
    if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) {
        throw new TypeError('Illumination resource hash input must be binary bytes');
    }
    return rawSha256Hex(bytes);
}

/** @param {unknown} bytes @param {Readonly<Record<string, any>>} descriptor */
export function decodeIlluminationPackageResource(bytes, descriptor) {
    if (descriptor.compression !== 'none') {
        throw createRuntimeFailure('chunk_compression_unsupported', `Chunk '${descriptor.id}' uses unsupported compression.`, {
            phase: 'decoding',
            reason: 'unsupported_capability',
            context: { chunkId: descriptor.id, compression: descriptor.compression }
        });
    }
    if (isTrustedIlluminationPackageSegmentedBytes(bytes)) {
        if (bytes.byteLength !== descriptor.decodedByteLength) {
            throw createRuntimeFailure('chunk_decoded_length_mismatch', `Chunk '${descriptor.id}' decoded length is invalid.`, {
                phase: 'decoding',
                reason: 'decode_failure',
                context: { expected: descriptor.decodedByteLength, actual: bytes.byteLength }
            });
        }
        return Object.freeze({
            decoded: bytes,
            cpuBytes: 0,
            ownership: bytes.ownership
        });
    }
    const source = bytes instanceof Uint8Array
        ? bytes
        : bytes instanceof ArrayBuffer
            ? new Uint8Array(bytes)
            : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const borrowed = TRUSTED_PACKAGE_SUBVIEWS.has(source);
    const data = borrowed ? source : source.slice();
    if (data.byteLength !== descriptor.decodedByteLength) {
        throw createRuntimeFailure('chunk_decoded_length_mismatch', `Chunk '${descriptor.id}' decoded length is invalid.`, {
            phase: 'decoding',
            reason: 'decode_failure',
            context: { expected: descriptor.decodedByteLength, actual: data.byteLength }
        });
    }
    return Object.freeze({
        decoded: data,
        cpuBytes: borrowed ? 0 : data.byteLength,
        ownership: borrowed
            ? 'borrowed-verified-package-subview-v1'
            : 'owned-decoded-snapshot-v1'
    });
}

/**
 * @param {unknown} value
 * @returns {value is Readonly<{byteLength: number, ownership: string, segments: readonly Uint8Array[]}>}
 */
export function isTrustedIlluminationPackageSegmentedBytes(value) {
    return Boolean(value && typeof value === 'object' && TRUSTED_PACKAGE_SEGMENTS.has(value));
}

/**
 * Makes the sole final owned resource copy from verified contiguous bytes or
 * authenticated package segments.
 * @param {unknown} value
 * @param {string} [resourceId]
 */
export function copyIlluminationPackageResourceBytes(value, resourceId = 'illumination resource') {
    if (isTrustedIlluminationPackageSegmentedBytes(value)) {
        const pixels = new Uint8Array(value.byteLength);
        let offset = 0;
        for (const segment of value.segments) {
            pixels.set(segment, offset);
            offset += segment.byteLength;
        }
        return pixels;
    }
    const source = value instanceof Uint8Array
        ? value
        : value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : ArrayBuffer.isView(value)
                ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
                : null;
    if (!(source instanceof Uint8Array)) {
        throw new TypeError(`Decoded ${resourceId} must be binary bytes or verified package segments.`);
    }
    return source.slice();
}

/** @param {Readonly<Record<string, any>>} compatibility */
function throwCompatibility(compatibility) {
    const mapped = COMPATIBILITY_FAILURES[compatibility.reason]
        ?? Object.freeze({ state: 'failed', reason: 'validation_failure' });
    throw createRuntimeFailure('package_incompatible', 'Illumination package is incompatible with the requested runtime identity.', {
        state: mapped.state,
        phase: 'validating',
        reason: mapped.reason,
        context: {
            compatibilityReason: compatibility.reason,
            details: compatibility.details,
            capabilityCode: compatibility.details?.capabilityCode
                ?? compatibility.missingRuntimeCapabilities?.[0]
                ?? null
        }
    });
}

/** @param {unknown} value */
function requireParsedPackage(value) {
    if (!value || typeof value !== 'object'
        || !value.manifest || !value.chunkTable
        || !Array.isArray(value.chunks)
        || typeof value.aggregateSha256 !== 'string'
        || !value.compatibility || typeof value.compatibility.compatible !== 'boolean') {
        throw new TypeError('A fully parsed illumination package is required');
    }
}

/** @param {{cpuBytes?: number, gpuBytes?: number} | undefined} value */
function normalizeMemory(value = {}) {
    const result = { cpuBytes: value.cpuBytes ?? 0, gpuBytes: value.gpuBytes ?? 0 };
    for (const [key, bytes] of Object.entries(result)) {
        if (!Number.isSafeInteger(bytes) || bytes < 0) throw new TypeError(`prewarmMemory.${key} must be a non-negative safe integer`);
    }
    return Object.freeze(result);
}
