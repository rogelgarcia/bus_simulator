// Converts strictly verified AI 529 canonical intermediates into generic AI 530 package inputs.
// @ts-check

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJsonStringify, compareCanonicalStrings } from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import { getIlluminationCapabilityProfile } from '../../../src/app/illumination/package/IlluminationCapabilityProfiles.js';
import {
    readIntermediateManifest,
    validateIntermediateOutputs
} from '../../illumination_bake_compiler/src/IntermediateManifest.mjs';
import { PackageToolError, asPackageToolError } from './PackageToolError.mjs';

const PROFILE_SCHEMA = 'bus-sim-illumination-package-profile-v1';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * @param {{manifestPath: string, profilePath: string, cityId: string, lightingProfileId: string, capabilityProfileId: string}} options
 * @param {{readFileFn?: typeof readFile}} [deps]
 */
export async function createPackageDefinitionFromIntermediate(options, deps = {}) {
    assertOptions(options);
    const readFileFn = deps.readFileFn ?? readFile;
    const started = performance.now();
    const manifestPath = path.resolve(options.manifestPath);
    const artifactDirectory = path.dirname(manifestPath);
    let manifest;
    let verified;
    let profile;
    let manifestBytes;
    let profileBytes;
    try {
        [manifestBytes, profileBytes] = await Promise.all([
            readFileFn(manifestPath),
            readFileFn(path.resolve(options.profilePath))
        ]);
        const manifestText = new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes);
        manifest = await readIntermediateManifest({ manifestPath }, { readFileFn: async () => manifestText });
        profile = parsePackagingProfile(profileBytes);
        verified = await validateIntermediateOutputs({ manifest, artifactDirectory });
    } catch (error) {
        throw asPackageToolError(error, 'intermediate_validation_failed', 'AI 529 intermediate inputs did not pass strict validation.', {
            manifestPath
        });
    }
    const validatedMs = performance.now() - started;
    const capability = getIlluminationCapabilityProfile(options.capabilityProfileId);
    const requiredChannels = new Set(capability.requiredChannels);
    const sourceHashes = new Map(manifest.input.channelSources.map((entry) => [entry.id, entry.sha256]));
    const outputChannels = [...new Set(manifest.outputs.map((entry) => entry.channel))].sort(compareCanonicalStrings);
    const missingRequired = capability.requiredChannels.filter((id) => !outputChannels.includes(id));
    if (missingRequired.length > 0) {
        throw new PackageToolError(
            'intermediate_required_channel_missing',
            'The selected capability profile cannot be packaged from this intermediate inventory.',
            { capabilityProfileId: capability.id, missingRequired }
        );
    }

    const readStarted = performance.now();
    const chunks = [];
    let canonicalByteLength = 0;
    let rawByteLength = 0;
    for (const output of manifest.outputs) {
        const data = new Uint8Array(await readFileFn(path.join(artifactDirectory, ...output.canonical.path.split('/'))));
        if (data.byteLength !== output.canonical.byteLength) {
            throw new PackageToolError('intermediate_output_size_mismatch', 'Canonical bytes changed after AI 529 validation.', {
                outputId: output.id, expected: output.canonical.byteLength, actual: data.byteLength
            });
        }
        const canonicalSha256 = rawSha256(data);
        if (canonicalSha256 !== output.canonical.sha256) {
            throw new PackageToolError('intermediate_output_hash_mismatch', 'Canonical bytes changed after AI 529 validation.', {
                outputId: output.id, expected: output.canonical.sha256, actual: canonicalSha256
            });
        }
        canonicalByteLength += data.byteLength;
        rawByteLength += output.raw.byteLength;
        chunks.push({
            id: output.id,
            channelId: output.channel,
            data,
            resourceType: 'texture_2d',
            encoding: profile.encoding,
            precision: profile.encoding === 'rgba32f_le' ? 'float32' : 'explicit_profile',
            dimensions: {
                components: output.canonical.components,
                depth: 1,
                height: output.canonical.height,
                width: output.canonical.width
            },
            rowOrigin: output.canonical.rowOrigin,
            coordinateTransform: {
                schema: 'bus-sim-illumination-intermediate-coordinate-v1',
                outputDescriptor: output.descriptor
            },
            mipLevel: 0,
            requiredRuntimeCapabilities: ['webgl2', 'texture_2d', profile.encoding]
        });
    }
    const readMs = performance.now() - readStarted;
    chunks.sort((left, right) => compareCanonicalStrings(left.id, right.id));

    const channels = outputChannels.map((id) => {
        const sourceSha256 = sourceHashes.get(id);
        if (!sourceSha256) {
            throw new PackageToolError('intermediate_channel_source_missing', 'An output channel has no AI 528 source-freshness hash.', { id });
        }
        return {
            id,
            required: requiredChannels.has(id),
            sourceSha256,
            profileSha256: manifest.profile.sha256,
            schemaVersion: 1
        };
    });

    return Object.freeze({
        definition: Object.freeze({
            cityId: options.cityId,
            lightingProfileId: options.lightingProfileId,
            selectedCapabilityProfileId: options.capabilityProfileId,
            source: {
                schema: 'bus-sim-illumination-package-source-provenance-v1',
                bakeInputFormat: manifest.input.format,
                bakeInputSchemaVersion: manifest.input.schemaVersion,
                channelSources: manifest.input.channelSources,
                geometrySha256: manifest.input.geometrySha256,
                inputPackageSha256: manifest.input.packageRawSha256,
                intermediateManifestSha256: rawSha256(manifestBytes),
                resolvedSourceSha256: manifest.input.resolvedSourceSha256,
                usedMaterialsSha256: manifest.input.usedMaterialsSha256
            },
            compilerDescriptor: {
                schema: 'bus-sim-illumination-package-compiler-provenance-v1',
                bakeCompiler: manifest.compiler,
                bakeConfiguration: manifest.configuration,
                intermediateProfile: manifest.profile,
                packaging: {
                    implementationOwner: 'AI_530',
                    profile,
                    profileSha256: rawSha256(profileBytes)
                }
            },
            channels,
            chunks
        }),
        metrics: Object.freeze({
            canonicalByteLength,
            intermediateRawByteLength: rawByteLength,
            readCanonicalMs: roundMetric(readMs),
            validateIntermediateMs: roundMetric(validatedMs),
            verifiedOutputCount: verified.outputs.length
        })
    });
}

/** @param {Uint8Array} bytes */
function parsePackagingProfile(bytes) {
    let parsed;
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        parsed = JSON.parse(text);
        if (canonicalJsonStringify(parsed) !== text.trimEnd()) throw new Error('not_canonical');
    } catch (error) {
        throw new PackageToolError('package_profile_invalid', 'Packaging profile must be canonical UTF-8 JSON.', {}, { cause: error });
    }
    const expected = ['compression', 'encoding', 'generateMipmaps', 'logicalRowOrigin', 'mipPolicy', 'paddingPolicy', 'schema', 'unpackAlignment'];
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || canonicalJsonStringify(Object.keys(parsed).sort()) !== canonicalJsonStringify(expected)
        || parsed.schema !== PROFILE_SCHEMA
        || parsed.compression !== 'none'
        || parsed.encoding !== 'rgba32f_le'
        || parsed.generateMipmaps !== false
        || parsed.logicalRowOrigin !== 'lower_left'
        || parsed.unpackAlignment !== 1) {
        throw new PackageToolError('package_profile_unsupported', 'Packaging profile is not the AI 530 deterministic fallback profile.', {});
    }
    return parsed;
}

/** @param {Uint8Array} bytes */
function rawSha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

/** @param {number} value */
function roundMetric(value) {
    return Math.round(value * 1000) / 1000;
}

/** @param {Parameters<typeof createPackageDefinitionFromIntermediate>[0]} options */
function assertOptions(options) {
    if (!options || typeof options !== 'object') throw new TypeError('Intermediate adapter options are required');
    for (const key of ['manifestPath', 'profilePath', 'cityId', 'lightingProfileId', 'capabilityProfileId']) {
        if (typeof options[key] !== 'string' || !options[key]) throw new TypeError(`${key} is required`);
    }
    if (options.cityId.trim() !== options.cityId || options.lightingProfileId.trim() !== options.lightingProfileId) {
        throw new TypeError('City and lighting profile IDs must not have surrounding whitespace');
    }
    for (const value of [manifestPathSha(options.manifestPath), manifestPathSha(options.profilePath)]) {
        if (value !== null && !SHA256_PATTERN.test(value)) throw new TypeError('Unexpected embedded SHA-256 path segment');
    }
}

/** @param {string} value */
function manifestPathSha(value) {
    const match = value.match(/[\\/]([0-9a-f]{64})[\\/]/);
    return match?.[1] ?? null;
}
