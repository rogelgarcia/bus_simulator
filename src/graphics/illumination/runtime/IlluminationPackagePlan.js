// Adapts one fully verified AI 530 package into a generic staged-resource plan.
// @ts-check

import { rawSha256Hex } from '../../../app/illumination/package/RawSha256.js';
import { createRuntimeFailure } from './IlluminationRuntimeError.js';

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
    const channelById = new Map(parsed.manifest.channels.map((entry) => [entry.id, entry]));
    const selectedIds = parsed.compatibility.selectedChunkIds;
    const resources = selectedIds.map((id) => {
        const entry = chunkById.get(id);
        if (!entry) {
            throw createRuntimeFailure('verified_chunk_missing', `Verified package chunk '${id}' is unavailable.`, {
                reason: 'validation_failure',
                context: { chunkId: id }
            });
        }
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
                decodedCpuBytes: descriptor.decodedByteLength,
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

/**
 * @param {{chunks: readonly {descriptor: Readonly<Record<string, any>>, data: Uint8Array}[]}} parsed
 */
export function createIlluminationPackageChunkReader(parsed) {
    if (!parsed || !Array.isArray(parsed.chunks)) throw new TypeError('Parsed illumination package chunks are required');
    const byId = new Map(parsed.chunks.map((entry) => [entry.descriptor.id, entry.data]));
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
            const data = byId.get(descriptor.id);
            if (!data) {
                throw createRuntimeFailure('verified_chunk_missing', `Verified package chunk '${descriptor.id}' is unavailable.`, {
                    phase: 'fetching',
                    reason: 'fetch_failure',
                    context: { chunkId: descriptor.id }
                });
            }
            return data.slice();
        },
        dispose() {
            if (disposed) return false;
            disposed = true;
            byId.clear();
            return true;
        }
    });
}

/** @param {ArrayBuffer | ArrayBufferView} bytes */
export function hashIlluminationPackageResource(bytes) {
    return rawSha256Hex(bytes);
}

/** @param {ArrayBuffer | ArrayBufferView} bytes @param {Readonly<Record<string, any>>} descriptor */
export function decodeIlluminationPackageResource(bytes, descriptor) {
    if (descriptor.compression !== 'none') {
        throw createRuntimeFailure('chunk_compression_unsupported', `Chunk '${descriptor.id}' uses unsupported compression.`, {
            phase: 'decoding',
            reason: 'unsupported_capability',
            context: { chunkId: descriptor.id, compression: descriptor.compression }
        });
    }
    const data = bytes instanceof Uint8Array
        ? bytes.slice()
        : bytes instanceof ArrayBuffer
            ? new Uint8Array(bytes.slice(0))
            : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice();
    if (data.byteLength !== descriptor.decodedByteLength) {
        throw createRuntimeFailure('chunk_decoded_length_mismatch', `Chunk '${descriptor.id}' decoded length is invalid.`, {
            phase: 'decoding',
            reason: 'decode_failure',
            context: { expected: descriptor.decodedByteLength, actual: data.byteLength }
        });
    }
    return Object.freeze({ decoded: data, cpuBytes: data.byteLength });
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
