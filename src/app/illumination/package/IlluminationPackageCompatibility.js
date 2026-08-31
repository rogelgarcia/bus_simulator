// Evaluates source/profile/runtime compatibility without allocating or exposing GPU resources.
// @ts-check

import {
    ILLUMINATION_KNOWN_CHANNELS,
    ILLUMINATION_SUPPORTED_ENCODINGS,
    ILLUMINATION_UNKNOWN_OPTIONAL_POLICY
} from './IlluminationPackageConstants.js';

const KNOWN_CHANNELS = new Set(ILLUMINATION_KNOWN_CHANNELS);
const SUPPORTED_ENCODINGS = new Set(ILLUMINATION_SUPPORTED_ENCODINGS);
const SUPPORTED_RESOURCES = new Set(['buffer', 'texture_2d', 'texture_2d_array']);
const BUFFER_ENCODINGS = new Set(['raw_u8', 'uint32_le']);
const TEXTURE_ENCODINGS = new Set(['r8_unorm', 'rgba16f_le', 'rgba32f_le']);

/** @param {string} resourceType @param {string} encoding */
export function isSupportedIlluminationResourceEncoding(resourceType, encoding) {
    if (!SUPPORTED_RESOURCES.has(resourceType) || !SUPPORTED_ENCODINGS.has(encoding)) return false;
    if (resourceType === 'buffer') return BUFFER_ENCODINGS.has(encoding);
    return TEXTURE_ENCODINGS.has(encoding);
}

/**
 * @param {Readonly<Record<string, any>>} manifest
 * @param {Readonly<Record<string, any>>} chunkTable
 * @param {{expectations?: Record<string, unknown>, runtimeCapabilities?: Iterable<string>, aggregateSha256?: string}} [options]
 */
export function evaluateIlluminationPackageCompatibility(manifest, chunkTable, options = {}) {
    const expectations = options.expectations ?? {};
    const expectationChecks = [
        ['cityId', manifest.cityId, 'wrong_city'],
        ['lightingProfileId', manifest.lightingProfileId, 'wrong_profile'],
        ['selectedCapabilityProfileId', manifest.selectedCapabilityProfileId, 'incompatible_capability_profile'],
        ['resolvedSourceSha256', manifest.source.resolvedSourceSha256, 'stale_source'],
        ['compilerSignatureSha256', manifest.compiler.signatureSha256, 'compiler_signature_mismatch'],
        ['aggregateSha256', options.aggregateSha256, 'aggregate_identity_mismatch']
    ];
    for (const [key, actual, reason] of expectationChecks) {
        if (expectations[key] !== undefined && expectations[key] !== actual) {
            return result(false, reason, [], [], [], [], { expected: expectations[key], actual: actual ?? null });
        }
    }
    if (expectations.profileSha256 !== undefined
        && manifest.channels.some((channel) => channel.profileSha256 !== expectations.profileSha256)) {
        return result(false, 'wrong_profile', [], [], [], [], {
            expected: expectations.profileSha256,
            actual: [...new Set(manifest.channels.map((channel) => channel.profileSha256))].sort()
        });
    }
    const selectedProfile = manifest.capabilityProfiles.find((profile) => profile.id === manifest.selectedCapabilityProfileId);
    const selectedProfileChannelIds = new Set([
        ...selectedProfile.requiredChannels,
        ...selectedProfile.optionalChannels
    ]);
    const providedCapabilities = options.runtimeCapabilities === undefined ? null : new Set(options.runtimeCapabilities);
    const requiredChannelIds = manifest.channels.filter((channel) => channel.required).map((channel) => channel.id);
    const selectedChunkIds = [];
    const skippedOptionalChannelIds = [];
    const missingRuntimeCapabilities = new Set();
    const unsupportedRequiredFormats = [];
    for (const capability of selectedProfile.requiredRuntimeCapabilities) {
        if (providedCapabilities !== null && !providedCapabilities.has(capability)) missingRuntimeCapabilities.add(capability);
    }
    for (const channel of manifest.channels) {
        const chunks = chunkTable.chunks.filter((chunk) => chunk.channelId === channel.id);
        const outsideSelectedProfile = !selectedProfileChannelIds.has(channel.id);
        if (outsideSelectedProfile && channel.required) {
            return result(false, 'incompatible_capability_profile', requiredChannelIds, selectedChunkIds,
                skippedOptionalChannelIds, [...missingRuntimeCapabilities], {
                    profileId: selectedProfile.id,
                    channelId: channel.id
                });
        }
        const unknownOptional = !KNOWN_CHANNELS.has(channel.id) && !channel.required
            && manifest.unknownOptionalPolicy === ILLUMINATION_UNKNOWN_OPTIONAL_POLICY;
        const unsupportedFormats = chunks.filter(
            (chunk) => !isSupportedIlluminationResourceEncoding(chunk.resourceType, chunk.encoding)
        );
        const unsupportedFormat = unsupportedFormats.length > 0;
        const missingChunkCaps = [];
        if (providedCapabilities !== null) {
            for (const chunk of chunks) {
                for (const capability of chunk.requiredRuntimeCapabilities) {
                    if (!providedCapabilities.has(capability)) missingChunkCaps.push(capability);
                }
            }
        }
        if (outsideSelectedProfile || unknownOptional || unsupportedFormat || missingChunkCaps.length > 0) {
            if (channel.required) {
                for (const chunk of unsupportedFormats) {
                    unsupportedRequiredFormats.push(Object.freeze({
                        channelId: channel.id,
                        chunkId: chunk.id,
                        resourceType: chunk.resourceType,
                        encoding: chunk.encoding,
                        capabilityCode: unsupportedFormatCapabilityCode(chunk.resourceType, chunk.encoding)
                    }));
                }
                for (const capability of missingChunkCaps) missingRuntimeCapabilities.add(capability);
            } else {
                skippedOptionalChannelIds.push(channel.id);
            }
            continue;
        }
        selectedChunkIds.push(...chunks.map((chunk) => chunk.id));
    }
    if (unsupportedRequiredFormats.length > 0) {
        const formats = Object.freeze([...unsupportedRequiredFormats].sort(compareUnsupportedFormats));
        const channelIds = Object.freeze([...new Set(formats.map((entry) => entry.channelId))].sort());
        const capabilityCodes = Object.freeze([...new Set(formats.map((entry) => entry.capabilityCode))].sort());
        return result(false, 'unsupported_format', requiredChannelIds, selectedChunkIds, skippedOptionalChannelIds,
            [...missingRuntimeCapabilities], {
                capabilityCode: capabilityCodes[0],
                capabilityCodes,
                channelIds,
                formats
            });
    }
    if (missingRuntimeCapabilities.size > 0) {
        return result(false, 'unsupported_capability', requiredChannelIds, selectedChunkIds, skippedOptionalChannelIds,
            [...missingRuntimeCapabilities], {});
    }
    return result(true, 'ready', requiredChannelIds, selectedChunkIds, skippedOptionalChannelIds, [], {});
}

/** @param {string} resourceType @param {string} encoding */
function unsupportedFormatCapabilityCode(resourceType, encoding) {
    return `resource_format:${resourceType}:${encoding}`;
}

/** @param {Readonly<Record<string, string>>} left @param {Readonly<Record<string, string>>} right */
function compareUnsupportedFormats(left, right) {
    const leftKey = `${left.channelId}\u0000${left.chunkId}\u0000${left.resourceType}\u0000${left.encoding}`;
    const rightKey = `${right.channelId}\u0000${right.chunkId}\u0000${right.resourceType}\u0000${right.encoding}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

/** @param {boolean} compatible @param {string} reason @param {string[]} required @param {string[]} selected @param {string[]} skipped @param {string[]} missing @param {Record<string, unknown>} details */
function result(compatible, reason, required, selected, skipped, missing, details) {
    return Object.freeze({
        compatible,
        reason,
        requiredChannelIds: Object.freeze([...required].sort()),
        selectedChunkIds: Object.freeze([...selected].sort()),
        skippedOptionalChannelIds: Object.freeze([...skipped].sort()),
        missingRuntimeCapabilities: Object.freeze([...new Set(missing)].sort()),
        details: Object.freeze({ ...details })
    });
}
