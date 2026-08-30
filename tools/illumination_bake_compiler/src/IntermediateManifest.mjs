// Validates and rehashes canonical illumination compiler intermediate manifests.
// @ts-check

import { readFile, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import {
    canonicalJsonStringify,
    cloneCanonicalJson,
    compareCanonicalStrings
} from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import { asCompilerError, CompilerError, failCompiler } from './CompilerErrors.mjs';
import { hashFileRaw } from './FileHashes.mjs';

export const INTERMEDIATE_MANIFEST_SCHEMA = 'bus-sim-illumination-intermediate-manifest-v1';
export const INTERMEDIATE_RAW_FORMAT = 'openexr_32bit_float_linear_v1';
export const INTERMEDIATE_CANONICAL_ENCODING = 'float32_little_endian_rgba_lower_left_v1';
export const INTERMEDIATE_CANONICAL_ROW_ORIGIN = 'lower_left';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FORBIDDEN_METADATA_KEY = /^(?:createdAt|createdBy|created_at|created_by|host|hostId|hostName|hostname|machineId|machineName|timestamp|updatedAt|updated_at)$/i;
const TOP_LEVEL_KEYS = Object.freeze([
    'checks',
    'compiler',
    'configuration',
    'input',
    'outputs',
    'profile',
    'reconstruction',
    'schema'
]);

/**
 * Validates the exact V1 shape and returns a deeply frozen canonical clone.
 * @param {unknown} value
 * @param {{expectedOutputIds?: readonly string[]}} [options]
 * @returns {Readonly<Record<string, any>>}
 */
export function validateIntermediateManifest(value, options = {}) {
    const manifest = requireObject(value, 'Intermediate manifest');
    requireExactKeys(manifest, TOP_LEVEL_KEYS, 'Intermediate manifest');
    if (manifest.schema !== INTERMEDIATE_MANIFEST_SCHEMA) {
        failCompiler('intermediate_manifest_schema_unsupported', 'Intermediate manifest schema is unsupported.', {
            expected: INTERMEDIATE_MANIFEST_SCHEMA,
            actual: manifest.schema ?? null
        });
    }
    validateCompiler(manifest.compiler);
    validateConfiguration(manifest.configuration);
    validateInput(manifest.input);
    validateProfile(manifest.profile);
    validateReconstruction(manifest.reconstruction);
    validateChecks(manifest.checks);
    validateOutputs(manifest.outputs, options.expectedOutputIds);
    assertPortableCanonicalData(manifest, '$');
    return /** @type {Readonly<Record<string, any>>} */ (cloneCanonicalJson(manifest));
}

/**
 * @param {unknown} value
 * @param {{expectedOutputIds?: readonly string[]}} [options]
 */
export function serializeIntermediateManifest(value, options = {}) {
    return canonicalJsonStringify(validateIntermediateManifest(value, options));
}

/**
 * @param {{manifestPath: string, expectedOutputIds?: readonly string[]}} options
 * @param {{readFileFn?: typeof readFile}} [deps]
 */
export async function readIntermediateManifest(options, deps = {}) {
    if (!options || typeof options !== 'object' || typeof options.manifestPath !== 'string' || !options.manifestPath) {
        throw new TypeError('Intermediate manifest path is required');
    }
    let text;
    try {
        text = await (deps.readFileFn ?? readFile)(options.manifestPath, 'utf8');
    } catch (error) {
        throw asCompilerError(error, 'intermediate_manifest_read_failed', 'Intermediate manifest could not be read.', {});
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw asCompilerError(error, 'intermediate_manifest_json_invalid', 'Intermediate manifest is not valid JSON.', {});
    }
    const validated = validateIntermediateManifest(parsed, { expectedOutputIds: options.expectedOutputIds });
    if (canonicalJsonStringify(validated) !== text) {
        failCompiler('intermediate_manifest_not_canonical', 'Intermediate manifest bytes are not the strict canonical JSON encoding.', {});
    }
    return validated;
}

/**
 * @param {{manifestPath: string, manifest: unknown, expectedOutputIds?: readonly string[]}} options
 * @param {{writeFileFn?: typeof writeFile}} [deps]
 */
export async function writeIntermediateManifest(options, deps = {}) {
    if (!options || typeof options !== 'object' || typeof options.manifestPath !== 'string' || !options.manifestPath) {
        throw new TypeError('Intermediate manifest write options are required');
    }
    const serialized = serializeIntermediateManifest(options.manifest, {
        expectedOutputIds: options.expectedOutputIds
    });
    try {
        await (deps.writeFileFn ?? writeFile)(options.manifestPath, serialized, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
        throw asCompilerError(error, 'intermediate_manifest_write_failed', 'Canonical intermediate manifest could not be created.', {});
    }
    return serialized;
}

/**
 * Rehashes every declared EXR and canonical float32 output below one staging root.
 * @param {{
 *   manifest: unknown,
 *   artifactDirectory: string,
 *   expectedOutputIds?: readonly string[]
 * }} options
 * @param {{hashFileFn?: typeof hashFileRaw}} [deps]
 */
export async function validateIntermediateOutputs(options, deps = {}) {
    if (!options || typeof options !== 'object') throw new TypeError('Intermediate output validation options are required');
    if (typeof options.artifactDirectory !== 'string' || !options.artifactDirectory) {
        throw new TypeError('Intermediate artifact directory is required');
    }
    const manifest = validateIntermediateManifest(options.manifest, {
        expectedOutputIds: options.expectedOutputIds
    });
    const artifactDirectory = nodePath.resolve(options.artifactDirectory);
    const verified = [];
    for (const output of manifest.outputs) {
        const raw = await verifyOutputFile(output.id, 'raw', output.raw, artifactDirectory, deps.hashFileFn ?? hashFileRaw);
        const canonical = await verifyOutputFile(
            output.id,
            'canonical',
            output.canonical,
            artifactDirectory,
            deps.hashFileFn ?? hashFileRaw
        );
        verified.push(Object.freeze({ id: output.id, raw, canonical }));
    }
    return Object.freeze({ manifest, outputs: Object.freeze(verified) });
}

/**
 * @param {string} outputId
 * @param {string} kind
 * @param {{path: string, byteLength: number, sha256: string}} descriptor
 * @param {string} artifactDirectory
 * @param {typeof hashFileRaw} hashFileFn
 */
async function verifyOutputFile(outputId, kind, descriptor, artifactDirectory, hashFileFn) {
    const filePath = resolveArtifactPath(artifactDirectory, descriptor.path);
    let actual;
    try {
        actual = await hashFileFn(filePath);
    } catch (error) {
        throw new CompilerError('intermediate_output_missing', 'Declared intermediate output is missing or unreadable.', {
            outputId,
            kind,
            path: descriptor.path
        }, { cause: error });
    }
    if (actual.byteLength !== descriptor.byteLength) {
        failCompiler('intermediate_output_size_mismatch', 'Intermediate output byte length does not match its manifest.', {
            outputId,
            kind,
            path: descriptor.path,
            expected: descriptor.byteLength,
            actual: actual.byteLength
        });
    }
    if (actual.sha256 !== descriptor.sha256) {
        failCompiler('intermediate_output_hash_mismatch', 'Intermediate output raw SHA-256 does not match its manifest.', {
            outputId,
            kind,
            path: descriptor.path,
            expected: descriptor.sha256,
            actual: actual.sha256
        });
    }
    return Object.freeze({ path: descriptor.path, byteLength: actual.byteLength, sha256: actual.sha256 });
}

/** @param {unknown} value */
function validateCompiler(value) {
    const compiler = requireObject(value, 'compiler');
    requireExactKeys(compiler, [
        'archiveSha256',
        'architecture',
        'backend',
        'buildHash',
        'buildPlatform',
        'executableSha256',
        'threadCount',
        'version',
        'versionString'
    ], 'compiler');
    requireSha256(compiler.archiveSha256, 'compiler.archiveSha256');
    requireSha256(compiler.executableSha256, 'compiler.executableSha256');
    requireStableString(compiler.architecture, 'compiler.architecture');
    requireStableString(compiler.buildHash, 'compiler.buildHash');
    requireStableString(compiler.buildPlatform, 'compiler.buildPlatform');
    if (compiler.backend !== 'cycles_cpu') failCompiler('intermediate_backend_unsupported', 'Promoted intermediates require Cycles CPU.', {});
    if (canonicalJsonStringify(compiler.version) !== '[5,2,1]' || compiler.versionString !== '5.2.1 LTS') {
        failCompiler('intermediate_blender_version_mismatch', 'Intermediate manifest does not declare Blender 5.2.1 LTS.', {
            version: compiler.version ?? null,
            versionString: compiler.versionString ?? null
        });
    }
    requirePositiveInteger(compiler.threadCount, 'compiler.threadCount');
}

/** @param {unknown} value */
function validateConfiguration(value) {
    const configuration = requireObject(value, 'configuration');
    requireExactKeys(configuration, ['compilerScriptSha256', 'profileSha256', 'toolchainSha256'], 'configuration');
    for (const key of Object.keys(configuration)) requireSha256(configuration[key], `configuration.${key}`);
}

/** @param {unknown} value */
function validateInput(value) {
    const input = requireObject(value, 'input');
    requireExactKeys(input, [
        'channelSources',
        'format',
        'geometrySha256',
        'packageRawSha256',
        'resolvedSourceSha256',
        'schemaVersion',
        'usedMaterialsSha256'
    ], 'input');
    if (input.format !== 'bus-sim-illumination-bake-input-v1' || input.schemaVersion !== 1) {
        failCompiler('intermediate_input_version_unsupported', 'Intermediate input contract must be AI 528 bake-input V1.', {
            format: input.format ?? null,
            schemaVersion: input.schemaVersion ?? null
        });
    }
    for (const key of ['geometrySha256', 'packageRawSha256', 'resolvedSourceSha256', 'usedMaterialsSha256']) {
        requireSha256(input[key], `input.${key}`);
    }
    validateNamedHashes(input.channelSources, 'input.channelSources');
}

/** @param {unknown} value */
function validateProfile(value) {
    const profile = requireObject(value, 'profile');
    requireExactKeys(profile, ['id', 'sha256'], 'profile');
    requireStableString(profile.id, 'profile.id');
    requireSha256(profile.sha256, 'profile.sha256');
}

/** @param {unknown} value */
function validateReconstruction(value) {
    const reconstruction = requireObject(value, 'reconstruction');
    requireExactKeys(reconstruction, [
        'alphaInputCount',
        'geometryCount',
        'materialCount',
        'meshInstanceCount',
        'mode',
        'objectOrder',
        'stableIdsPreserved',
        'textureCount'
    ], 'reconstruction');
    for (const key of ['alphaInputCount', 'geometryCount', 'materialCount', 'meshInstanceCount', 'textureCount']) {
        requireNonNegativeInteger(reconstruction[key], `reconstruction.${key}`);
    }
    requireStableString(reconstruction.mode, 'reconstruction.mode');
    if (reconstruction.objectOrder !== 'stable_id_ascending' || reconstruction.stableIdsPreserved !== true) {
        failCompiler('intermediate_reconstruction_nondeterministic', 'Reconstruction must preserve IDs in ascending stable-ID order.', {});
    }
}

/** @param {unknown} value */
function validateChecks(value) {
    if (!Array.isArray(value) || value.length === 0) throw new TypeError('checks must be a non-empty array');
    let previous = null;
    const ids = new Set();
    for (const entry of value) {
        const check = requireObject(entry, 'check');
        requireExactKeys(check, ['id', 'passed'], 'check');
        requireStableString(check.id, 'check.id');
        if (check.passed !== true) failCompiler('intermediate_check_failed', 'Promoted intermediate checks must all pass.', { id: check.id });
        if (ids.has(check.id) || (previous !== null && compareCanonicalStrings(previous, check.id) >= 0)) {
            failCompiler('intermediate_checks_not_canonical', 'Intermediate checks must have unique ascending stable IDs.', { id: check.id });
        }
        ids.add(check.id);
        previous = check.id;
    }
}

/** @param {unknown} value @param {readonly string[] | undefined} expectedOutputIds */
function validateOutputs(value, expectedOutputIds) {
    if (!Array.isArray(value) || value.length === 0) throw new TypeError('outputs must be a non-empty array');
    const ids = new Set();
    const paths = new Set();
    let previous = null;
    for (const entry of value) {
        const output = requireObject(entry, 'output');
        requireExactKeys(output, ['canonical', 'channel', 'descriptor', 'id', 'raw'], 'output');
        requireStableString(output.id, 'output.id');
        requireStableString(output.channel, `outputs.${output.id}.channel`);
        if (ids.has(output.id) || (previous !== null && compareCanonicalStrings(previous, output.id) >= 0)) {
            failCompiler('intermediate_outputs_not_canonical', 'Intermediate outputs must have unique ascending stable IDs.', { id: output.id });
        }
        ids.add(output.id);
        previous = output.id;
        const descriptor = requireObject(output.descriptor, `outputs.${output.id}.descriptor`);
        canonicalJsonStringify(descriptor);
        validateRaw(output.raw, output.id);
        validateCanonical(output.canonical, output.id);
        for (const outputPath of [output.raw.path, output.canonical.path]) {
            requireRelativePosixPath(outputPath, `outputs.${output.id}.path`);
            if (paths.has(outputPath)) failCompiler('intermediate_output_path_duplicate', 'Intermediate output paths must be unique.', { path: outputPath });
            paths.add(outputPath);
        }
        if (output.raw.path === output.canonical.path) {
            failCompiler('intermediate_output_path_duplicate', 'Raw and canonical outputs must use different files.', { id: output.id });
        }
    }
    if (expectedOutputIds !== undefined) {
        if (!Array.isArray(expectedOutputIds)) throw new TypeError('Expected output IDs must be an array');
        const expected = [...expectedOutputIds];
        for (const id of expected) requireStableString(id, 'expectedOutputIds entry');
        expected.sort(compareCanonicalStrings);
        if (new Set(expected).size !== expected.length) throw new TypeError('Expected output IDs must be unique');
        if (canonicalJsonStringify(expected) !== canonicalJsonStringify([...ids].sort(compareCanonicalStrings))) {
            failCompiler('intermediate_output_inventory_mismatch', 'Intermediate output IDs do not match the requested jobs.', {
                expected,
                actual: [...ids].sort(compareCanonicalStrings)
            });
        }
    }
}

/** @param {unknown} value @param {string} outputId */
function validateRaw(value, outputId) {
    const raw = requireObject(value, `outputs.${outputId}.raw`);
    requireExactKeys(raw, ['byteLength', 'format', 'path', 'sha256'], `outputs.${outputId}.raw`);
    requirePositiveInteger(raw.byteLength, `outputs.${outputId}.raw.byteLength`);
    if (raw.format !== INTERMEDIATE_RAW_FORMAT) {
        failCompiler('intermediate_raw_format_unsupported', 'Authoritative raw outputs must be lossless linear 32-bit OpenEXR.', {
            outputId,
            format: raw.format ?? null
        });
    }
    requireRelativePosixPath(raw.path, `outputs.${outputId}.raw.path`);
    if (!raw.path.toLocaleLowerCase('en-US').endsWith('.exr')) throw new TypeError(`outputs.${outputId}.raw.path must end in .exr`);
    requireSha256(raw.sha256, `outputs.${outputId}.raw.sha256`);
}

/** @param {unknown} value @param {string} outputId */
function validateCanonical(value, outputId) {
    const canonical = requireObject(value, `outputs.${outputId}.canonical`);
    requireExactKeys(canonical, [
        'byteLength',
        'components',
        'encoding',
        'height',
        'path',
        'rowOrigin',
        'sha256',
        'width'
    ], `outputs.${outputId}.canonical`);
    requirePositiveInteger(canonical.width, `outputs.${outputId}.canonical.width`);
    requirePositiveInteger(canonical.height, `outputs.${outputId}.canonical.height`);
    if (canonical.components !== 4
        || canonical.encoding !== INTERMEDIATE_CANONICAL_ENCODING
        || canonical.rowOrigin !== INTERMEDIATE_CANONICAL_ROW_ORIGIN) {
        failCompiler('intermediate_canonical_encoding_unsupported', 'Canonical output must be lower-left RGBA float32 little-endian data.', {
            outputId,
            components: canonical.components ?? null,
            encoding: canonical.encoding ?? null,
            rowOrigin: canonical.rowOrigin ?? null
        });
    }
    const expectedByteLength = canonical.width * canonical.height * canonical.components * 4;
    if (!Number.isSafeInteger(expectedByteLength) || canonical.byteLength !== expectedByteLength) {
        failCompiler('intermediate_canonical_size_invalid', 'Canonical output byte length does not match RGBA float32 dimensions.', {
            outputId,
            expected: Number.isSafeInteger(expectedByteLength) ? expectedByteLength : null,
            actual: canonical.byteLength ?? null
        });
    }
    requireRelativePosixPath(canonical.path, `outputs.${outputId}.canonical.path`);
    requireSha256(canonical.sha256, `outputs.${outputId}.canonical.sha256`);
}

/** @param {unknown} value @param {string} label */
function validateNamedHashes(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
    let previous = null;
    const ids = new Set();
    for (const entry of value) {
        const hash = requireObject(entry, `${label} entry`);
        requireExactKeys(hash, ['id', 'sha256'], `${label} entry`);
        requireStableString(hash.id, `${label}.id`);
        requireSha256(hash.sha256, `${label}.${hash.id}.sha256`);
        if (ids.has(hash.id) || (previous !== null && compareCanonicalStrings(previous, hash.id) >= 0)) {
            failCompiler('intermediate_channel_sources_not_canonical', 'Channel-source hashes must have unique ascending stable IDs.', { id: hash.id });
        }
        ids.add(hash.id);
        previous = hash.id;
    }
}

/** @param {unknown} value @param {string} location */
function assertPortableCanonicalData(value, location) {
    if (typeof value === 'string') {
        if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/')) {
            failCompiler('intermediate_manifest_host_path_forbidden', 'Authoritative manifests may not contain absolute host paths.', { location });
        }
        return;
    }
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
        value.forEach((entry, index) => assertPortableCanonicalData(entry, `${location}[${index}]`));
        return;
    }
    for (const [key, entry] of Object.entries(value)) {
        if (FORBIDDEN_METADATA_KEY.test(key)) {
            failCompiler('intermediate_manifest_nondeterministic_metadata', 'Authoritative manifests may not contain host or timestamp metadata.', {
                location: `${location}.${key}`
            });
        }
        assertPortableCanonicalData(entry, `${location}.${key}`);
    }
}

/** @param {string} artifactDirectory @param {string} relativePath */
function resolveArtifactPath(artifactDirectory, relativePath) {
    requireRelativePosixPath(relativePath, 'Intermediate output path');
    const resolved = nodePath.resolve(artifactDirectory, ...relativePath.split('/'));
    const relative = nodePath.relative(artifactDirectory, resolved);
    if (!relative || relative.startsWith('..') || nodePath.isAbsolute(relative)) {
        failCompiler('intermediate_output_path_escape', 'Intermediate output path escapes its staging directory.', { path: relativePath });
    }
    return resolved;
}

/** @param {unknown} value @param {string} label */
function requireObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
        throw new TypeError(`${label} must be a plain object`);
    }
    return /** @type {Record<string, any>} */ (value);
}

/** @param {Record<string, any>} value @param {readonly string[]} expected @param {string} label */
function requireExactKeys(value, expected, label) {
    const actual = Object.keys(value).sort(compareCanonicalStrings);
    const sortedExpected = [...expected].sort(compareCanonicalStrings);
    if (canonicalJsonStringify(actual) !== canonicalJsonStringify(sortedExpected)) {
        failCompiler('intermediate_manifest_shape_invalid', `${label} does not have the exact V1 keys.`, {
            label,
            expected: sortedExpected,
            actual
        });
    }
}

/** @param {unknown} value @param {string} label */
function requireSha256(value, label) {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new TypeError(`${label} must be a lowercase raw SHA-256`);
}

/** @param {unknown} value @param {string} label */
function requireStableString(value, label) {
    if (typeof value !== 'string' || !value || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new TypeError(`${label} must be a non-empty stable string`);
    }
}

/** @param {unknown} value @param {string} label */
function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive safe integer`);
}

/** @param {unknown} value @param {string} label */
function requireNonNegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
}

/** @param {unknown} value @param {string} label */
function requireRelativePosixPath(value, label) {
    if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/')
        || /^[A-Za-z]:/.test(value) || nodePath.posix.normalize(value) !== value
        || value === '.' || value.split('/').includes('..')) {
        throw new TypeError(`${label} must be a normalized relative POSIX path`);
    }
}
