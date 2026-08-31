// Builds and validates content-addressed AI 531 static-sun depth fixture artifacts.
// @ts-check

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
    canonicalJsonStringify,
    compareCanonicalStrings
} from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import { hashCanonicalJsonSha256 } from '../../../src/app/illumination/bake_source/Hashing.js';
import { createArtifactTransaction } from '../../illumination_bake_compiler/src/ArtifactTransaction.mjs';
import { hashFileRaw, snapshotFiles } from '../../illumination_bake_compiler/src/FileHashes.mjs';
import {
    readIntermediateManifest,
    validateIntermediateOutputs
} from '../../illumination_bake_compiler/src/IntermediateManifest.mjs';
import {
    STATIC_SUN_DEPTH_BYTE_ORDER,
    STATIC_SUN_DEPTH_EMPTY_CODE,
    STATIC_SUN_DEPTH_ENCODING,
    STATIC_SUN_DEPTH_OCCUPIED_CODE_MAX,
    quantizeStaticSunDepthTile
} from './DepthEncoding.mjs';
import {
    AI529_PROOF_PROFILE_PREFIX,
    resolveIntermediatePath,
    selectStaticSunDepthIntermediate
} from './IntermediateDepth.mjs';
import {
    asStaticSunDepthToolError,
    failStaticSunDepth
} from './StaticSunDepthToolError.mjs';

export const STATIC_SUN_DEPTH_ARTIFACT_SCHEMA = 'bus-sim-static-sun-depth-artifact-v1';
export const STATIC_SUN_DEPTH_CHANNEL_DEFINITION_SCHEMA = 'bus-sim-static-sun-depth-channel-definition-v1';
export const STATIC_SUN_DEPTH_METRICS_SCHEMA = 'bus-sim-static-sun-depth-metrics-v1';
export const STATIC_SUN_DEPTH_RESULT_SCHEMA = 'bus-sim-static-sun-depth-compile-result-v1';
export const STATIC_SUN_DEPTH_CONTENT_DOMAIN = 'bus-simulator/static-sun-depth/artifact-content/v1';

const CONTENT_SCHEMA = 'bus-sim-static-sun-depth-artifact-content-v1';
const PAYLOAD_PATH = 'payload/static_sun_depth.tile_0000_0000.mip_0.rg8';
const CHANNEL_DEFINITION_PATH = 'channel_definition.json';
const METRICS_PATH = 'metrics.json';
const ARTIFACT_MANIFEST_PATH = 'artifact_manifest.json';
const FILE_IDS = Object.freeze(['channel_definition', 'metrics', 'tile_payload']);
const FILE_PATHS = Object.freeze([CHANNEL_DEFINITION_PATH, METRICS_PATH, PAYLOAD_PATH]);

/**
 * @param {{manifestPath: string, outputRoot: string, runId: string, guardPixels: number, fixture: boolean}} options
 */
export async function compileStaticSunDepthArtifact(options) {
    assertCompileOptions(options);
    try {
        return await compileStaticSunDepthArtifactUnchecked(options);
    } catch (error) {
        throw asStaticSunDepthToolError(
            error,
            'static_sun_depth_compile_failed',
            'Static-sun depth compilation failed before atomic promotion.',
            { manifestPath: path.resolve(options.manifestPath) }
        );
    }
}

/** @param {Parameters<typeof compileStaticSunDepthArtifact>[0]} options */
async function compileStaticSunDepthArtifactUnchecked(options) {
    const manifestPath = path.resolve(options.manifestPath);
    const artifactDirectory = path.dirname(manifestPath);
    const manifest = await readIntermediateManifest({ manifestPath });
    await validateIntermediateOutputs({ manifest, artifactDirectory });
    const selected = selectStaticSunDepthIntermediate(manifest);
    const isCheckedProof = manifest.profile.id.startsWith(AI529_PROOF_PROFILE_PREFIX);
    if (options.fixture !== true) {
        failStaticSunDepth(
            isCheckedProof ? 'ai529_proof_requires_fixture_flag' : 'static_sun_depth_production_contract_unavailable',
            isCheckedProof
                ? 'The checked AI 529 depth proof cannot be represented as production output without explicit --fixture.'
                : 'This fixture-track tool has no authority to claim a production static-sun depth artifact.',
            {
                fixtureFlagRequired: true,
                profileId: manifest.profile.id,
                productionEligible: false
            }
        );
    }

    const canonicalPath = resolveIntermediatePath(artifactDirectory, selected.output.canonical.path);
    const rawPath = resolveIntermediatePath(artifactDirectory, selected.output.raw.path);
    const snapshotInputs = Object.freeze([
        { id: 'input:canonical_static_sun_depth', filePath: canonicalPath },
        { id: 'input:intermediate_manifest', filePath: manifestPath },
        { id: 'input:raw_static_sun_depth', filePath: rawPath }
    ]);
    const expectedSnapshots = await snapshotFiles(snapshotInputs);
    const snapshotById = new Map(expectedSnapshots.map((entry) => [entry.id, entry]));
    const canonicalBytes = new Uint8Array(await readFile(canonicalPath));
    const canonicalSha256 = rawSha256(canonicalBytes);
    if (canonicalSha256 !== selected.output.canonical.sha256) {
        failStaticSunDepth(
            'static_sun_depth_input_changed',
            'Canonical depth bytes changed after intermediate validation.',
            { actual: canonicalSha256, expected: selected.output.canonical.sha256 }
        );
    }

    const quantized = quantizeStaticSunDepthTile({
        canonicalBytes,
        width: selected.output.canonical.width,
        height: selected.output.canonical.height,
        guardPixels: options.guardPixels,
        clipNearMeters: selected.descriptor.camera.clipNearMeters,
        clipFarMeters: selected.descriptor.camera.clipFarMeters,
        orthographicBoundsMeters: selected.descriptor.camera.orthographicBoundsMeters
    });
    const payloadSha256 = rawSha256(quantized.payload);
    const source = createSourceProvenance({
        manifest,
        selected,
        intermediateManifestByteLength: requireSnapshot(snapshotById, 'input:intermediate_manifest').byteLength,
        intermediateManifestSha256: requireSnapshot(snapshotById, 'input:intermediate_manifest').sha256
    });
    const channelDefinition = createChannelDefinition({
        manifest,
        selected,
        source,
        quantized,
        payloadSha256
    });
    const channelDefinitionBytes = utf8CanonicalBytes(channelDefinition);
    const metrics = createMetrics({
        manifestByteLength: requireSnapshot(snapshotById, 'input:intermediate_manifest').byteLength,
        selected,
        quantized,
        channelDefinitionByteLength: channelDefinitionBytes.byteLength
    });
    const metricsBytes = utf8CanonicalBytes(metrics);
    const files = Object.freeze([
        fileDescriptor('channel_definition', CHANNEL_DEFINITION_PATH, channelDefinitionBytes),
        fileDescriptor('metrics', METRICS_PATH, metricsBytes),
        fileDescriptor('tile_payload', PAYLOAD_PATH, quantized.payload)
    ]);
    const content = Object.freeze({
        artifactClass: 'fixture',
        files,
        productionEligible: false,
        schema: CONTENT_SCHEMA,
        source
    });
    const contentSha256 = await hashCanonicalJsonSha256(STATIC_SUN_DEPTH_CONTENT_DOMAIN, content);
    const artifactManifest = Object.freeze({
        artifactClass: 'fixture',
        contentSha256,
        files,
        productionEligible: false,
        schema: STATIC_SUN_DEPTH_ARTIFACT_SCHEMA,
        source
    });
    const artifactManifestBytes = utf8CanonicalBytes(artifactManifest);
    const transaction = await createArtifactTransaction({
        artifactRoot: path.resolve(options.outputRoot),
        contentSha256,
        runId: options.runId
    });
    await mkdir(path.join(transaction.stagingPath, 'payload'), { recursive: false });
    await Promise.all([
        writeFile(path.join(transaction.stagingPath, ARTIFACT_MANIFEST_PATH), artifactManifestBytes, { flag: 'wx' }),
        writeFile(path.join(transaction.stagingPath, CHANNEL_DEFINITION_PATH), channelDefinitionBytes, { flag: 'wx' }),
        writeFile(path.join(transaction.stagingPath, METRICS_PATH), metricsBytes, { flag: 'wx' }),
        writeFile(path.join(transaction.stagingPath, ...PAYLOAD_PATH.split('/')), quantized.payload, { flag: 'wx' })
    ]);
    const promoted = await transaction.promote({
        expectedSnapshots,
        snapshotInputs,
        validateStage: (stagingPath) => validateStaticSunDepthArtifact(stagingPath, { expectedContentSha256: contentSha256 })
    });
    await validateStaticSunDepthArtifact(promoted.finalPath, { expectedContentSha256: contentSha256 });
    return Object.freeze({
        artifactClass: 'fixture',
        contentSha256,
        finalPath: promoted.finalPath,
        payloadByteLength: quantized.payload.byteLength,
        payloadSha256,
        productionEligible: false,
        schema: STATIC_SUN_DEPTH_RESULT_SCHEMA,
        tileCount: 1
    });
}

/**
 * Rehashes and semantically checks a complete fixture artifact directory.
 * @param {string} artifactPath
 * @param {{expectedContentSha256?: string}} [options]
 */
export async function validateStaticSunDepthArtifact(artifactPath, options = {}) {
    const root = path.resolve(artifactPath);
    const artifactManifest = await readCanonicalJson(path.join(root, ARTIFACT_MANIFEST_PATH), 'artifact manifest');
    requireExactKeys(artifactManifest, [
        'artifactClass', 'contentSha256', 'files', 'productionEligible', 'schema', 'source'
    ], 'artifact manifest');
    if (artifactManifest.schema !== STATIC_SUN_DEPTH_ARTIFACT_SCHEMA
        || artifactManifest.artifactClass !== 'fixture'
        || artifactManifest.productionEligible !== false) {
        failStaticSunDepth(
            'static_sun_depth_artifact_contract_invalid',
            'Artifact metadata must remain explicitly fixture-only and non-production.',
            {}
        );
    }
    validateSourceProvenance(artifactManifest.source);
    requireSha256(artifactManifest.contentSha256, 'artifact manifest contentSha256');
    if (options.expectedContentSha256 !== undefined
        && artifactManifest.contentSha256 !== options.expectedContentSha256) {
        failStaticSunDepth('static_sun_depth_content_identity_mismatch', 'Artifact content identity is unexpected.', {
            actual: artifactManifest.contentSha256,
            expected: options.expectedContentSha256
        });
    }
    const files = validateFileDescriptors(artifactManifest.files);
    for (const file of files) {
        const filePath = resolveArtifactFile(root, file.path);
        const actual = await hashFileRaw(filePath);
        if (actual.byteLength !== file.byteLength || actual.sha256 !== file.sha256) {
            failStaticSunDepth('static_sun_depth_artifact_file_mismatch', 'An artifact file differs from its exact descriptor.', {
                actualByteLength: actual.byteLength,
                actualSha256: actual.sha256,
                expectedByteLength: file.byteLength,
                expectedSha256: file.sha256,
                id: file.id
            });
        }
    }
    const content = Object.freeze({
        artifactClass: artifactManifest.artifactClass,
        files,
        productionEligible: artifactManifest.productionEligible,
        schema: CONTENT_SCHEMA,
        source: artifactManifest.source
    });
    const contentSha256 = await hashCanonicalJsonSha256(STATIC_SUN_DEPTH_CONTENT_DOMAIN, content);
    if (contentSha256 !== artifactManifest.contentSha256) {
        failStaticSunDepth('static_sun_depth_content_identity_mismatch', 'Artifact content identity does not match its files and source.', {
            actual: contentSha256,
            expected: artifactManifest.contentSha256
        });
    }
    const channelDefinition = await readCanonicalJson(path.join(root, CHANNEL_DEFINITION_PATH), 'channel definition');
    validateChannelDefinition(channelDefinition, files, artifactManifest.source);
    const metrics = await readCanonicalJson(path.join(root, METRICS_PATH), 'metrics');
    validateMetrics(metrics, channelDefinition, files);
    return Object.freeze({ artifactManifest, channelDefinition, contentSha256, metrics });
}

/** @param {{manifest: any, selected: any, intermediateManifestByteLength: number, intermediateManifestSha256: string}} options */
function createSourceProvenance(options) {
    const sourceHash = options.manifest.input.channelSources.find((entry) => entry.id === 'static_sun_depth');
    if (!sourceHash) {
        failStaticSunDepth(
            'static_sun_depth_source_hash_missing',
            'The selected static-sun depth output has no AI 528 source-freshness identity.',
            {}
        );
    }
    return Object.freeze({
        canonicalInput: Object.freeze({
            byteLength: options.selected.output.canonical.byteLength,
            encoding: options.selected.output.canonical.encoding,
            rowOrigin: options.selected.output.canonical.rowOrigin,
            sha256: options.selected.output.canonical.sha256
        }),
        compiler: options.manifest.compiler,
        configuration: options.manifest.configuration,
        geometrySha256: options.manifest.input.geometrySha256,
        intermediateManifestByteLength: options.intermediateManifestByteLength,
        intermediateManifestSha256: options.intermediateManifestSha256,
        outputId: options.selected.output.id,
        profile: options.manifest.profile,
        rawDiagnostic: Object.freeze({
            byteLength: options.selected.output.raw.byteLength,
            format: options.selected.output.raw.format,
            sha256: options.selected.output.raw.sha256
        }),
        resolvedSourceSha256: options.manifest.input.resolvedSourceSha256,
        sourceSha256: sourceHash.sha256,
        usedMaterialsSha256: options.manifest.input.usedMaterialsSha256
    });
}

/** @param {{manifest: any, selected: any, source: any, quantized: any, payloadSha256: string}} options */
function createChannelDefinition(options) {
    const { selected, quantized } = options;
    return Object.freeze({
        artifactClass: 'fixture',
        channel: Object.freeze({
            id: 'static_sun_depth',
            profileSha256: options.manifest.profile.sha256,
            required: true,
            schemaVersion: 1,
            sourceSha256: options.source.sourceSha256
        }),
        chunk: Object.freeze({
            byteLength: quantized.payload.byteLength,
            dimensions: Object.freeze({
                components: 2,
                depth: 1,
                height: quantized.tile.stored.height,
                width: quantized.tile.stored.width
            }),
            encoding: STATIC_SUN_DEPTH_ENCODING,
            id: 'static_sun_depth.tile_0000_0000.mip_0',
            mipLevel: 0,
            path: PAYLOAD_PATH,
            precision: 'uint16_normalized_depth_0_through_65534_with_65535_empty',
            requiredRuntimeCapabilities: Object.freeze(['rg8_unorm', 'texture_2d', 'webgl2']),
            resourceType: 'texture_2d',
            rowOrigin: selected.output.canonical.rowOrigin,
            sha256: options.payloadSha256
        }),
        depthEncoding: Object.freeze({
            byteOrder: STATIC_SUN_DEPTH_BYTE_ORDER,
            clipFarMeters: selected.descriptor.camera.clipFarMeters,
            clipNearMeters: selected.descriptor.camera.clipNearMeters,
            decodeFormula: 'near_meters+(code/65534)*(far_meters-near_meters)',
            emptyCode: STATIC_SUN_DEPTH_EMPTY_CODE,
            encoding: STATIC_SUN_DEPTH_ENCODING,
            occupiedCodeMaximum: STATIC_SUN_DEPTH_OCCUPIED_CODE_MAX,
            occupiedCodeMinimum: 0,
            quantization: 'round_to_nearest_clamped_v1'
        }),
        packageInputStatus: Object.freeze({
            ai530DirectlyPackable: false,
            reason: 'AI531 RG8 packed-depth encoding and capability registration are intentionally outside this fixture tool.',
            status: 'fixture_artifact_requires_ai531_runtime_registration'
        }),
        productionEligible: false,
        schema: STATIC_SUN_DEPTH_CHANNEL_DEFINITION_SCHEMA,
        source: options.source,
        tile: Object.freeze({
            grid: Object.freeze({ columns: 1, rows: 1, x: 0, y: 0 }),
            guardPixels: quantized.tile.guardPixels,
            id: 'tile_0000_0000',
            interior: quantized.tile.interior,
            lightSpaceBoundsMeters: quantized.tile.lightSpaceBoundsMeters,
            lightSpaceTexelSizeMeters: quantized.tile.lightSpaceTexelSizeMeters,
            stored: quantized.tile.stored
        })
    });
}

/** @param {{manifestByteLength: number, selected: any, quantized: any, channelDefinitionByteLength: number}} options */
function createMetrics(options) {
    const canonicalInputBytes = options.selected.output.canonical.byteLength;
    const interiorBytes = options.selected.output.canonical.width * options.selected.output.canonical.height * 2;
    const payloadBytes = options.quantized.payload.byteLength;
    const statistics = options.quantized.statistics;
    return Object.freeze({
        artifactClass: 'fixture',
        byteTable: Object.freeze({
            columns: Object.freeze(['resource', 'byteLength', 'measurement']),
            rows: Object.freeze([
                Object.freeze(['intermediate_manifest', options.manifestByteLength, 'raw_file_bytes']),
                Object.freeze(['ai529_raw_exr_diagnostic', options.selected.output.raw.byteLength, 'raw_file_bytes']),
                Object.freeze(['ai529_canonical_rgba32f', canonicalInputBytes, 'raw_file_bytes']),
                Object.freeze(['ai531_rg8_interior', interiorBytes, 'calculated_from_exact_dimensions']),
                Object.freeze(['ai531_rg8_guard_overhead', payloadBytes - interiorBytes, 'exact_encoded_bytes']),
                Object.freeze(['ai531_rg8_guarded_payload', payloadBytes, 'exact_encoded_bytes']),
                Object.freeze(['channel_definition', options.channelDefinitionByteLength, 'canonical_utf8_bytes'])
            ])
        }),
        precisionTable: Object.freeze({
            columns: Object.freeze(['metric', 'value', 'unit']),
            rows: Object.freeze([
                Object.freeze(['occupied_code_minimum', 0, 'code']),
                Object.freeze(['occupied_code_maximum', STATIC_SUN_DEPTH_OCCUPIED_CODE_MAX, 'code']),
                Object.freeze(['empty_code', STATIC_SUN_DEPTH_EMPTY_CODE, 'code']),
                Object.freeze(['encoded_unit', statistics.encodedUnitMeters, 'meters']),
                Object.freeze(['theoretical_maximum_rounding_error', statistics.theoreticalMaximumRoundingErrorMeters, 'meters']),
                Object.freeze(['measured_maximum_absolute_error', statistics.maximumAbsoluteErrorMeters, 'meters']),
                Object.freeze(['measured_mean_absolute_error', statistics.meanAbsoluteErrorMeters, 'meters']),
                Object.freeze(['source_depth_minimum', statistics.sourceDepthMinimumMeters, 'meters']),
                Object.freeze(['source_depth_maximum', statistics.sourceDepthMaximumMeters, 'meters']),
                Object.freeze(['encoded_source_code_minimum', statistics.encodedCodeMinimum, 'code']),
                Object.freeze(['encoded_source_code_maximum', statistics.encodedCodeMaximum, 'code']),
                Object.freeze(['occupied_texels', statistics.occupiedTexelCount, 'texels']),
                Object.freeze(['empty_texels', statistics.emptyTexelCount, 'texels'])
            ])
        }),
        productionEligible: false,
        residencyTable: Object.freeze({
            columns: Object.freeze(['phase', 'cpuLogicalBytes', 'gpuLogicalBytes', 'status', 'reason']),
            rows: Object.freeze([
                Object.freeze(['compiler_source_loaded', canonicalInputBytes, 0, 'measured_exact_logical_buffers', 'Canonical RGBA32F payload only; Node and process overhead are not included.']),
                Object.freeze(['compiler_source_plus_encoded_payload', canonicalInputBytes + payloadBytes, 0, 'measured_exact_logical_buffers', 'Canonical RGBA32F plus guarded RG8 payload; Node and process overhead are not included.']),
                Object.freeze(['runtime_staged_payload', payloadBytes, 0, 'calculated_exact_logical_payload', 'Guarded RG8 payload only; loader bookkeeping is not included.']),
                Object.freeze(['runtime_logical_texture', 0, payloadBytes, 'calculated_exact', 'RG8 dimensions times two bytes per texel']),
                Object.freeze(['physical_gpu_residency', null, null, 'not_measured', 'Unavailable to this offline fixture compiler and WebGL does not expose physical residency.'])
            ])
        }),
        schema: STATIC_SUN_DEPTH_METRICS_SCHEMA
    });
}

/** @param {string} id @param {string} filePath @param {Uint8Array} bytes */
function fileDescriptor(id, filePath, bytes) {
    return Object.freeze({ byteLength: bytes.byteLength, id, path: filePath, sha256: rawSha256(bytes) });
}

/** @param {Map<string, any>} snapshots @param {string} id */
function requireSnapshot(snapshots, id) {
    const snapshot = snapshots.get(id);
    if (!snapshot) throw new Error(`Missing authoritative input snapshot '${id}'`);
    return snapshot;
}

/** @param {unknown} value */
function utf8CanonicalBytes(value) {
    return new TextEncoder().encode(canonicalJsonStringify(value));
}

/** @param {Uint8Array} bytes */
function rawSha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

/** @param {string} filePath @param {string} label */
async function readCanonicalJson(filePath, label) {
    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(filePath));
    } catch (error) {
        failStaticSunDepth('static_sun_depth_artifact_read_failed', `${label} could not be read as UTF-8.`, {}, error);
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        failStaticSunDepth('static_sun_depth_artifact_json_invalid', `${label} is not valid JSON.`, {}, error);
    }
    if (canonicalJsonStringify(parsed) !== text) {
        failStaticSunDepth('static_sun_depth_artifact_not_canonical', `${label} is not exact canonical JSON.`, {});
    }
    return parsed;
}

/** @param {unknown} value */
function validateFileDescriptors(value) {
    if (!Array.isArray(value) || value.length !== FILE_IDS.length) {
        failStaticSunDepth('static_sun_depth_artifact_inventory_invalid', 'Artifact file inventory is incomplete.', {});
    }
    let previous = null;
    const ids = [];
    const paths = [];
    for (const entry of value) {
        requireExactKeys(entry, ['byteLength', 'id', 'path', 'sha256'], 'artifact file');
        if (typeof entry.id !== 'string' || typeof entry.path !== 'string') {
            failStaticSunDepth('static_sun_depth_artifact_inventory_invalid', 'Artifact file IDs and paths must be strings.', {});
        }
        if (previous !== null && compareCanonicalStrings(previous, entry.id) >= 0) {
            failStaticSunDepth('static_sun_depth_artifact_inventory_invalid', 'Artifact files must use unique ascending IDs.', {});
        }
        if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength <= 0) {
            failStaticSunDepth('static_sun_depth_artifact_inventory_invalid', 'Artifact file byte lengths must be positive safe integers.', {});
        }
        requireSha256(entry.sha256, `artifact file '${entry.id}' sha256`);
        ids.push(entry.id);
        paths.push(entry.path);
        previous = entry.id;
    }
    if (canonicalJsonStringify(ids) !== canonicalJsonStringify(FILE_IDS)
        || canonicalJsonStringify(paths.sort(compareCanonicalStrings)) !== canonicalJsonStringify([...FILE_PATHS].sort(compareCanonicalStrings))) {
        failStaticSunDepth('static_sun_depth_artifact_inventory_invalid', 'Artifact file IDs or paths differ from the V1 contract.', {});
    }
    return Object.freeze(value.map((entry) => Object.freeze({ ...entry })));
}

/** @param {any} value @param {readonly any[]} files @param {any} source */
function validateChannelDefinition(value, files, source) {
    requireExactKeys(value, [
        'artifactClass', 'channel', 'chunk', 'depthEncoding', 'packageInputStatus',
        'productionEligible', 'schema', 'source', 'tile'
    ], 'channel definition');
    if (value.schema !== STATIC_SUN_DEPTH_CHANNEL_DEFINITION_SCHEMA
        || value.artifactClass !== 'fixture' || value.productionEligible !== false
        || value.channel?.id !== 'static_sun_depth'
        || value.chunk?.encoding !== STATIC_SUN_DEPTH_ENCODING
        || value.chunk?.path !== PAYLOAD_PATH
        || value.depthEncoding?.emptyCode !== STATIC_SUN_DEPTH_EMPTY_CODE
        || value.packageInputStatus?.ai530DirectlyPackable !== false) {
        failStaticSunDepth('static_sun_depth_channel_definition_invalid', 'Channel definition violates the fixture-only V1 contract.', {});
    }
    if (canonicalJsonStringify(value.source) !== canonicalJsonStringify(source)) {
        failStaticSunDepth('static_sun_depth_channel_definition_invalid', 'Channel and artifact source provenance differ.', {});
    }
    const payload = files.find((entry) => entry.id === 'tile_payload');
    if (!payload || value.chunk.byteLength !== payload.byteLength || value.chunk.sha256 !== payload.sha256) {
        failStaticSunDepth('static_sun_depth_channel_definition_invalid', 'Channel chunk does not match the hashed tile payload.', {});
    }
    const expectedByteLength = value.chunk.dimensions?.width * value.chunk.dimensions?.height * 2;
    if (!Number.isSafeInteger(expectedByteLength) || expectedByteLength !== payload.byteLength) {
        failStaticSunDepth('static_sun_depth_channel_definition_invalid', 'RG8 chunk dimensions do not match its exact byte length.', {});
    }
}

/** @param {any} value @param {any} channelDefinition @param {readonly any[]} files */
function validateMetrics(value, channelDefinition, files) {
    requireExactKeys(value, [
        'artifactClass', 'byteTable', 'precisionTable', 'productionEligible', 'residencyTable', 'schema'
    ], 'metrics');
    if (value.schema !== STATIC_SUN_DEPTH_METRICS_SCHEMA
        || value.artifactClass !== 'fixture' || value.productionEligible !== false
        || !Array.isArray(value.byteTable?.rows)
        || !Array.isArray(value.precisionTable?.rows)
        || !Array.isArray(value.residencyTable?.rows)) {
        failStaticSunDepth('static_sun_depth_metrics_invalid', 'Metrics do not contain the required fixture tables.', {});
    }
    const payload = files.find((entry) => entry.id === 'tile_payload');
    const channelFile = files.find((entry) => entry.id === 'channel_definition');
    const byteRows = tableRowsById(value.byteTable.rows, 'byte table');
    const residencyRows = tableRowsById(value.residencyTable.rows, 'residency table');
    const precisionRows = tableRowsById(value.precisionTable.rows, 'precision table');
    const interiorBytes = channelDefinition.tile.interior.width * channelDefinition.tile.interior.height * 2;
    const expectedBytes = new Map([
        ['intermediate_manifest', channelDefinition.source.intermediateManifestByteLength],
        ['ai529_raw_exr_diagnostic', channelDefinition.source.rawDiagnostic.byteLength],
        ['ai529_canonical_rgba32f', channelDefinition.source.canonicalInput.byteLength],
        ['ai531_rg8_interior', interiorBytes],
        ['ai531_rg8_guard_overhead', payload.byteLength - interiorBytes],
        ['ai531_rg8_guarded_payload', payload.byteLength],
        ['channel_definition', channelFile.byteLength]
    ]);
    for (const [id, expected] of expectedBytes) {
        if (byteRows.get(id)?.[1] !== expected) {
            failStaticSunDepth('static_sun_depth_metrics_invalid', 'Byte table differs from exact artifact resources.', { id });
        }
    }
    if (precisionRows.get('occupied_code_maximum')?.[1] !== STATIC_SUN_DEPTH_OCCUPIED_CODE_MAX
        || precisionRows.get('empty_code')?.[1] !== STATIC_SUN_DEPTH_EMPTY_CODE
        || residencyRows.get('runtime_staged_payload')?.[1] !== payload.byteLength
        || residencyRows.get('runtime_logical_texture')?.[2] !== payload.byteLength
        || residencyRows.get('physical_gpu_residency')?.[3] !== 'not_measured') {
        failStaticSunDepth('static_sun_depth_metrics_invalid', 'Precision or residency table contradicts the artifact contract.', {});
    }
}

/** @param {any} value */
function validateSourceProvenance(value) {
    requireExactKeys(value, [
        'canonicalInput', 'compiler', 'configuration', 'geometrySha256',
        'intermediateManifestByteLength', 'intermediateManifestSha256', 'outputId',
        'profile', 'rawDiagnostic', 'resolvedSourceSha256', 'sourceSha256',
        'usedMaterialsSha256'
    ], 'source provenance');
    for (const key of [
        'geometrySha256', 'intermediateManifestSha256', 'resolvedSourceSha256',
        'sourceSha256', 'usedMaterialsSha256'
    ]) requireSha256(value[key], 'source provenance ' + key);
    if (!Number.isSafeInteger(value.intermediateManifestByteLength) || value.intermediateManifestByteLength <= 0
        || typeof value.outputId !== 'string' || !value.outputId) {
        failStaticSunDepth('static_sun_depth_source_invalid', 'Source provenance has an invalid manifest size or output ID.', {});
    }
    requireExactKeys(value.canonicalInput, ['byteLength', 'encoding', 'rowOrigin', 'sha256'], 'canonical source');
    requireExactKeys(value.rawDiagnostic, ['byteLength', 'format', 'sha256'], 'raw diagnostic source');
    requireExactKeys(value.profile, ['id', 'sha256'], 'source profile');
    for (const record of [value.canonicalInput, value.rawDiagnostic]) {
        if (!Number.isSafeInteger(record.byteLength) || record.byteLength <= 0) {
            failStaticSunDepth('static_sun_depth_source_invalid', 'Source payload byte length is invalid.', {});
        }
        requireSha256(record.sha256, 'source payload sha256');
    }
    requireSha256(value.profile.sha256, 'source profile sha256');
}

/** @param {any[]} rows @param {string} label */
function tableRowsById(rows, label) {
    const result = new Map();
    for (const row of rows) {
        if (!Array.isArray(row) || typeof row[0] !== 'string' || result.has(row[0])) {
            failStaticSunDepth('static_sun_depth_metrics_invalid', label + ' rows must have unique string IDs.', {});
        }
        result.set(row[0], row);
    }
    return result;
}

/** @param {string} root @param {string} relativePath */
function resolveArtifactFile(root, relativePath) {
    if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\')) {
        failStaticSunDepth('static_sun_depth_artifact_path_invalid', 'Artifact file paths must be relative POSIX paths.', {});
    }
    const resolved = path.resolve(root, ...relativePath.split('/'));
    const relative = path.relative(root, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        failStaticSunDepth('static_sun_depth_artifact_path_invalid', 'Artifact file path escapes its content directory.', {});
    }
    return resolved;
}

/** @param {Record<string, any>} value @param {readonly string[]} expected @param {string} label */
function requireExactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        failStaticSunDepth('static_sun_depth_artifact_shape_invalid', `${label} must be a plain object.`, {});
    }
    const actual = Object.keys(value).sort(compareCanonicalStrings);
    const wanted = [...expected].sort(compareCanonicalStrings);
    if (canonicalJsonStringify(actual) !== canonicalJsonStringify(wanted)) {
        failStaticSunDepth('static_sun_depth_artifact_shape_invalid', `${label} keys are invalid.`, { actual, expected: wanted });
    }
}

/** @param {unknown} value @param {string} label */
function requireSha256(value, label) {
    if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
        failStaticSunDepth('static_sun_depth_artifact_hash_invalid', `${label} must be a lowercase SHA-256.`, {});
    }
}

/** @param {Parameters<typeof compileStaticSunDepthArtifact>[0]} options */
function assertCompileOptions(options) {
    if (!options || typeof options !== 'object') throw new TypeError('Static-sun depth compile options are required');
    for (const key of ['manifestPath', 'outputRoot', 'runId']) {
        if (typeof options[key] !== 'string' || !options[key]) throw new TypeError(`${key} is required`);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.runId)) {
        throw new TypeError('runId must be a filesystem-safe stable identifier');
    }
    if (!Number.isSafeInteger(options.guardPixels) || options.guardPixels < 1 || options.guardPixels > 64) {
        throw new RangeError('guardPixels must be an integer from 1 through 64');
    }
    if (typeof options.fixture !== 'boolean') throw new TypeError('fixture must be boolean');
}
