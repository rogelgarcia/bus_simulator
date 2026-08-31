// Validates canonical AI 530 package manifests and their separate channel provenance.
// @ts-check

import {
    ILLUMINATION_BYTE_ORDER,
    ILLUMINATION_CHANNEL_SCHEMA_VERSION,
    ILLUMINATION_COMPRESSION_POLICY,
    ILLUMINATION_HASH_ALGORITHM,
    ILLUMINATION_KNOWN_CHANNELS,
    ILLUMINATION_MIP_POLICY,
    ILLUMINATION_PACKAGE_SCHEMA,
    ILLUMINATION_PADDING_POLICY,
    ILLUMINATION_UNKNOWN_OPTIONAL_POLICY
} from './IlluminationPackageConstants.js';
import { getIlluminationCapabilityProfile } from './IlluminationCapabilityProfiles.js';
import { failIlluminationPackage } from './IlluminationPackageError.js';
import {
    assertStableId,
    canonicalJsonStringify,
    cloneCanonicalJson,
    compareCanonicalStrings
} from '../bake_source/CanonicalJson.js';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const KNOWN_CHANNELS = new Set(ILLUMINATION_KNOWN_CHANNELS);
const TOP_LEVEL_KEYS = Object.freeze([
    'byteOrder',
    'capabilityProfiles',
    'channels',
    'cityId',
    'compiler',
    'compressionPolicy',
    'hashAlgorithm',
    'lightingProfileId',
    'mipPolicy',
    'paddingPolicy',
    'schema',
    'schemaVersion',
    'selectedCapabilityProfileId',
    'source',
    'unknownOptionalPolicy'
]);

/** @param {unknown} value */
export function validateIlluminationPackageManifest(value) {
    const manifest = requireObject(value, 'manifest');
    requireExactKeys(manifest, TOP_LEVEL_KEYS, 'manifest');
    if (manifest.schema !== ILLUMINATION_PACKAGE_SCHEMA || manifest.schemaVersion !== 1) {
        failIlluminationPackage('manifest_schema_unsupported', 'Illumination package manifest schema is unsupported.', {
            schema: manifest.schema ?? null,
            schemaVersion: manifest.schemaVersion ?? null
        });
    }
    if (manifest.byteOrder !== ILLUMINATION_BYTE_ORDER
        || manifest.hashAlgorithm !== ILLUMINATION_HASH_ALGORITHM
        || manifest.paddingPolicy !== ILLUMINATION_PADDING_POLICY
        || manifest.compressionPolicy !== ILLUMINATION_COMPRESSION_POLICY
        || manifest.mipPolicy !== ILLUMINATION_MIP_POLICY
        || manifest.unknownOptionalPolicy !== ILLUMINATION_UNKNOWN_OPTIONAL_POLICY) {
        failIlluminationPackage('manifest_policy_unsupported', 'Illumination package manifest policy is unsupported.', {});
    }
    stableId(manifest.cityId, 'manifest.cityId');
    stableId(manifest.lightingProfileId, 'manifest.lightingProfileId');
    stableId(manifest.selectedCapabilityProfileId, 'manifest.selectedCapabilityProfileId');
    validateSource(manifest.source);
    validateCompiler(manifest.compiler);
    const profiles = validateProfiles(manifest.capabilityProfiles);
    const selected = profiles.find((entry) => entry.id === manifest.selectedCapabilityProfileId);
    if (!selected) {
        failIlluminationPackage('manifest_selected_profile_missing', 'Selected capability profile is absent from the profile table.', {
            selectedCapabilityProfileId: manifest.selectedCapabilityProfileId
        });
    }
    validateChannels(manifest.channels, selected, manifest.compiler.signatureSha256);
    canonicalJsonStringify(manifest);
    return cloneCanonicalJson(manifest);
}

/** @param {unknown} value */
function validateSource(value) {
    const source = requireObject(value, 'manifest.source');
    requireExactKeys(source, ['descriptor', 'descriptorSha256', 'resolvedSourceSha256'], 'manifest.source');
    requireSha256(source.descriptorSha256, 'manifest.source.descriptorSha256');
    requireSha256(source.resolvedSourceSha256, 'manifest.source.resolvedSourceSha256');
    const descriptor = requireObject(source.descriptor, 'manifest.source.descriptor');
    if (descriptor.resolvedSourceSha256 !== source.resolvedSourceSha256) {
        failIlluminationPackage('manifest_source_identity_mismatch', 'Source wrapper and descriptor resolved-source hashes differ.', {});
    }
    canonicalJsonStringify(descriptor);
}

/** @param {unknown} value */
function validateCompiler(value) {
    const compiler = requireObject(value, 'manifest.compiler');
    requireExactKeys(compiler, ['descriptor', 'signatureSha256'], 'manifest.compiler');
    requireSha256(compiler.signatureSha256, 'manifest.compiler.signatureSha256');
    requireObject(compiler.descriptor, 'manifest.compiler.descriptor');
    canonicalJsonStringify(compiler.descriptor);
}

/** @param {unknown} value */
function validateProfiles(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
        failIlluminationPackage('manifest_profile_table_invalid', 'Capability profile table must contain between one and 32 entries.', {});
    }
    const ids = new Set();
    let previous = null;
    for (const entryValue of value) {
        const entry = requireObject(entryValue, 'manifest capability profile');
        stableId(entry.id, 'manifest capability profile id');
        if (ids.has(entry.id) || (previous !== null && compareCanonicalStrings(previous, entry.id) >= 0)) {
            failIlluminationPackage('manifest_profiles_not_canonical', 'Capability profiles must have unique ascending IDs.', { id: entry.id });
        }
        const canonical = getIlluminationCapabilityProfile(entry.id);
        if (canonicalJsonStringify(entry) !== canonicalJsonStringify(canonical)) {
            failIlluminationPackage('manifest_profile_contract_mismatch', 'Capability profile does not match the AI 527 contract.', { id: entry.id });
        }
        ids.add(entry.id);
        previous = entry.id;
    }
    return value;
}

/** @param {unknown} value @param {Record<string, any>} selectedProfile @param {string} compilerSignatureSha256 */
function validateChannels(value, selectedProfile, compilerSignatureSha256) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
        failIlluminationPackage('manifest_channel_table_invalid', 'Channel table must contain between one and 64 entries.', {});
    }
    const byId = new Map();
    const selectedProfileChannels = new Set([
        ...selectedProfile.requiredChannels,
        ...selectedProfile.optionalChannels
    ]);
    let previous = null;
    for (const entryValue of value) {
        const entry = requireObject(entryValue, 'manifest channel');
        requireExactKeys(entry, [
            'chunkIds',
            'compilerSignatureSha256',
            'id',
            'outputIntegritySha256',
            'profileSha256',
            'required',
            'schemaVersion',
            'sourceSha256'
        ], 'manifest channel');
        stableId(entry.id, 'manifest channel id');
        if (byId.has(entry.id) || (previous !== null && compareCanonicalStrings(previous, entry.id) >= 0)) {
            failIlluminationPackage('manifest_channels_not_canonical', 'Channels must have unique ascending IDs.', { id: entry.id });
        }
        if (typeof entry.required !== 'boolean') throw new TypeError(`manifest channel '${entry.id}' required must be boolean`);
        if (entry.required && !KNOWN_CHANNELS.has(entry.id)) {
            failIlluminationPackage('unknown_required_channel', 'Unknown required illumination channels cannot activate.', { id: entry.id });
        }
        if (KNOWN_CHANNELS.has(entry.id) && entry.schemaVersion !== ILLUMINATION_CHANNEL_SCHEMA_VERSION) {
            failIlluminationPackage('channel_schema_unsupported', 'Known illumination channel schema is unsupported.', {
                id: entry.id,
                schemaVersion: entry.schemaVersion ?? null
            });
        }
        if (!Number.isSafeInteger(entry.schemaVersion) || entry.schemaVersion <= 0) throw new TypeError('Channel schemaVersion must be positive');
        for (const key of ['sourceSha256', 'profileSha256', 'compilerSignatureSha256', 'outputIntegritySha256']) {
            requireSha256(entry[key], `manifest channel '${entry.id}'.${key}`);
        }
        if (entry.compilerSignatureSha256 !== compilerSignatureSha256) {
            failIlluminationPackage('channel_compiler_signature_mismatch', 'Channel compiler signature differs from package compiler signature.', { id: entry.id });
        }
        validateIdArray(entry.chunkIds, `manifest channel '${entry.id}' chunkIds`, false);
        byId.set(entry.id, entry);
        previous = entry.id;
    }
    for (const requiredId of selectedProfile.requiredChannels) {
        const entry = byId.get(requiredId);
        if (!entry || entry.required !== true) {
            failIlluminationPackage('capability_profile_channel_missing', 'Capability profile minimum required channel is absent or optional.', {
                profileId: selectedProfile.id,
                channelId: requiredId
            });
        }
    }
    for (const entry of value) {
        if (entry.required && !selectedProfileChannels.has(entry.id)) {
            failIlluminationPackage(
                'capability_profile_channel_unexpected',
                'A required channel is not declared by the selected capability profile.',
                { profileId: selectedProfile.id, channelId: entry.id }
            );
        }
    }
}

/** @param {unknown} value @param {string} label @param {boolean} allowEmpty */
export function validateIdArray(value, label, allowEmpty = true) {
    if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new TypeError(label + ' must be an array');
    const seen = new Set();
    let previous = null;
    for (const id of value) {
        stableId(id, label + ' entry');
        if (seen.has(id) || (previous !== null && compareCanonicalStrings(previous, id) >= 0)) {
            failIlluminationPackage('manifest_id_inventory_not_canonical', label + ' must contain unique ascending IDs.', { id });
        }
        seen.add(id);
        previous = id;
    }
    return value;
}

/** @param {unknown} value @param {string} label */
export function requireSha256(value, label) {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new TypeError(label + ' must be 64 lowercase hexadecimal characters');
}

/** @param {unknown} value @param {string} label */
export function requireObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
        throw new TypeError(label + ' must be a plain object');
    }
    return /** @type {Record<string, any>} */ (value);
}

/** @param {Record<string, any>} value @param {readonly string[]} expected @param {string} label */
export function requireExactKeys(value, expected, label) {
    const actual = Object.keys(value).sort(compareCanonicalStrings);
    const wanted = [...expected].sort(compareCanonicalStrings);
    if (canonicalJsonStringify(actual) !== canonicalJsonStringify(wanted)) {
        failIlluminationPackage('manifest_keys_invalid', label + ' keys are invalid.', { expected: wanted, actual });
    }
}

/** @param {unknown} value @param {string} label */
export function stableId(value, label) {
    try {
        assertStableId(value, label);
    } catch (error) {
        throw new TypeError(error instanceof Error ? error.message : String(error));
    }
}
