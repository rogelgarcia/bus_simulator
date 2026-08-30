// Orchestrates the pinned Blender compiler from verified AI 528 input to atomic AI 529 artifacts.
// @ts-check

import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { canonicalJsonStringify, cloneCanonicalJson, compareCanonicalStrings } from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import { validateResolvedCityBakePackage } from '../../../src/graphics/illumination/bake_source/index.js';
import { validateCompilerProfile, validateToolchainContract, loadCompilerJson } from '../profile.mjs';
import { createArtifactTransaction } from './ArtifactTransaction.mjs';
import { runBlenderProcess } from './BlenderProcess.mjs';
import { verifyBlenderRuntimeSignature, verifyBlenderToolchain } from './BlenderToolchain.mjs';
import { asCompilerError, failCompiler } from './CompilerErrors.mjs';
import { hashFileRaw, snapshotFiles } from './FileHashes.mjs';
import {
    INTERMEDIATE_CANONICAL_ENCODING,
    INTERMEDIATE_CANONICAL_ROW_ORIGIN,
    INTERMEDIATE_MANIFEST_SCHEMA,
    INTERMEDIATE_RAW_FORMAT,
    readIntermediateManifest,
    validateIntermediateOutputs,
    writeIntermediateManifest
} from './IntermediateManifest.mjs';
import { createReconstructionPlan } from './ReconstructionPlan.mjs';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PYTHON_RECEIPT_SCHEMA = 'bus-sim-illumination-blender-compile-receipt-v1';
const PYTHON_RECEIPT_STDOUT_PREFIX = 'AI529_COMPILE_RECEIPT=';
const REQUEST_SCHEMA = 'bus-sim-illumination-compiler-request-v1';
const MANIFEST_FILE_NAME = 'intermediate_manifest.json';
const REQUIRED_CHANNEL_IDS = Object.freeze(['direct_receiver', 'indirect_irradiance', 'static_ao_bent_normal', 'static_sun_depth']);

export const COMPILER_JOB_ORDER = Object.freeze(['depth', 'direct', 'indirect', 'ao']);
export const COMPILER_JOB_OUTPUTS = Object.freeze({
    depth: Object.freeze({ id: 'proof_static_sun_depth_position', channel: 'static_sun_depth' }),
    direct: Object.freeze({ id: 'proof_diffuse_direct_only', channel: 'direct_receiver' }),
    indirect: Object.freeze({ id: 'proof_diffuse_indirect_only', channel: 'indirect_irradiance' }),
    ao: Object.freeze({ id: 'proof_ambient_occlusion_separate', channel: 'static_ao_bent_normal' })
});

/** Computes the exact compact canonical compiler inventory consumed by compiler.py. */
export async function computeCompilerScriptInventory(blenderDirectory, deps = {}) {
    assertPathString(blenderDirectory, 'Blender compiler script directory');
    let entries;
    try {
        entries = await (deps.readdirFn ?? readdir)(blenderDirectory, { withFileTypes: true });
    } catch (error) {
        throw asCompilerError(error, 'compiler_script_inventory_unreadable', 'Blender compiler scripts could not be enumerated.', {});
    }
    const names = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.py'))
        .map((entry) => entry.name).sort(compareCanonicalStrings);
    if (!names.includes('compiler.py')) failCompiler('compiler_script_inventory_invalid', 'Blender compiler script inventory does not contain compiler.py.', {});
    const inventory = [];
    for (const name of names) {
        const hashed = await (deps.hashFileFn ?? hashFileRaw)(path.join(blenderDirectory, name));
        inventory.push(Object.freeze({ byteLength: hashed.byteLength, path: name, sha256: hashed.sha256 }));
    }
    const serialized = canonicalJsonStringify(inventory);
    const sha256 = createHash('sha256').update(serialized, 'utf8').digest('hex');
    return Object.freeze({ inventory: Object.freeze(inventory), serialized, sha256 });
}

/** Builds an explicit environment with all Blender user state and temporary files below the stage. */
export function createIsolatedBlenderEnvironment(options) {
    if (!options || typeof options !== 'object') throw new TypeError('Isolated Blender environment options are required');
    assertPathString(options.stagingPath, 'Compiler staging path');
    assertPathString(options.executablePath, 'Blender executable path');
    const hostEnv = options.hostEnv ?? process.env;
    const systemRoot = hostEnv.SystemRoot || hostEnv.SYSTEMROOT || hostEnv.WINDIR || 'C:\\Windows';
    // Keep every writable Blender path under the partial stage while using
    // compact names so Blender's own legacy Win32 cache/temp helpers remain
    // below MAX_PATH even when authoritative output files use a namespaced path.
    const runtimeRoot = path.join(options.stagingPath, '_r');
    const tempPath = path.join(runtimeRoot, 't');
    const configPath = path.join(runtimeRoot, 'c');
    const scriptsPath = path.join(runtimeRoot, 's');
    const extensionsPath = path.join(runtimeRoot, 'e');
    const datafilesPath = path.join(runtimeRoot, 'd');
    const system32 = path.join(systemRoot, 'System32');
    const env = Object.freeze({
        BLENDER_USER_CONFIG: configPath,
        BLENDER_USER_DATAFILES: datafilesPath,
        BLENDER_USER_EXTENSIONS: extensionsPath,
        BLENDER_USER_SCRIPTS: scriptsPath,
        COMSPEC: hostEnv.COMSPEC || path.join(system32, 'cmd.exe'),
        PATH: [path.dirname(options.executablePath), system32].join(path.delimiter),
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONNOUSERSITE: '1',
        SystemRoot: systemRoot,
        TEMP: tempPath,
        TMP: tempPath,
        WINDIR: systemRoot
    });
    return Object.freeze({ env, runtimeRoot, directories: Object.freeze([tempPath, configPath, scriptsPath, extensionsPath, datafilesPath]) });
}

/** Strictly verifies and adapts a Python compile receipt to the authoritative portable manifest. */
export function adaptBlenderCompileReceipt(receiptValue, context) {
    const receipt = requirePlainObject(receiptValue, 'receipt');
    requireExactKeys(receipt, ['checks', 'compiler', 'configuration', 'input', 'intermediateManifests', 'outputs', 'profile', 'reconstruction', 'schema', 'status'], 'receipt');
    if (receipt.schema !== PYTHON_RECEIPT_SCHEMA || receipt.status !== 'complete') {
        receiptFailure('receipt.schema', 'Python compiler receipt is incomplete or uses an unsupported schema.', { schema: receipt.schema ?? null, status: receipt.status ?? null });
    }
    assertAdaptContext(context);
    const jobs = normalizeJobs(context.jobs);
    const expectedOutputs = jobs.map((job) => COMPILER_JOB_OUTPUTS[job]).sort((a, b) => compareCanonicalStrings(a.id, b.id));
    const expectedOutputIds = expectedOutputs.map((entry) => entry.id);
    const expectedConfiguration = {
        compilerScriptSha256: context.compilerScriptSha256,
        profileSha256: context.profileSha256,
        toolchainSha256: context.toolchainSha256
    };
    requireCanonicalEquality(receipt.configuration, expectedConfiguration, 'receipt.configuration');
    const compiler = validateReceiptCompiler(receipt.compiler, context);
    validateReceiptInput(receipt.input, context);
    validateReceiptProfile(receipt.profile, context);
    const checks = validateReceiptChecks(receipt.checks, context.profile, jobs);
    validateReceiptReconstruction(receipt.reconstruction, context);
    const outputs = validateReceiptOutputs(receipt.outputs, expectedOutputs, context.profile);
    validateReceiptSidecarInventory(receipt.intermediateManifests, expectedOutputIds);
    const hashes = context.inputManifest.hashes;
    const summary = context.reconstructionPlan.summary;
    const manifest = {
        checks,
        compiler,
        configuration: expectedConfiguration,
        input: {
            channelSources: cloneCanonicalJson(hashes.channelSources),
            format: context.inputManifest.format,
            geometrySha256: hashes.geometry,
            packageRawSha256: context.packageRawSha256,
            resolvedSourceSha256: hashes.resolvedSource,
            schemaVersion: context.inputManifest.schemaVersion,
            usedMaterialsSha256: hashes.usedMaterials
        },
        outputs,
        profile: { id: context.profile.id, sha256: context.profileSha256 },
        reconstruction: {
            alphaInputCount: summary.alphaInputCount,
            geometryCount: summary.geometryCount,
            materialCount: summary.materialCount,
            meshInstanceCount: summary.meshInstanceCount,
            mode: context.reconstructionMode,
            objectOrder: summary.objectOrder,
            stableIdsPreserved: summary.stableIdsPreserved,
            textureCount: summary.textureCount
        },
        schema: INTERMEDIATE_MANIFEST_SCHEMA
    };
    return Object.freeze({
        manifest: cloneCanonicalJson(manifest),
        expectedOutputIds: Object.freeze(expectedOutputIds),
        sidecars: Object.freeze(cloneCanonicalJson(receipt.intermediateManifests))
    });
}

/** Executes one compiler transaction and returns its promoted content address. */
export async function compileIlluminationBake(options, deps = {}) {
    assertCompileOptions(options);
    const jobs = normalizeJobs(options.jobs ?? COMPILER_JOB_ORDER);
    const reconstructionMode = options.reconstructionMode ?? 'validate';
    const blenderDirectory = path.resolve(options.blenderDirectory ?? path.join(path.dirname(options.profilePath), '..', 'blender'));
    const pythonScriptPath = path.join(blenderDirectory, 'compiler.py');
    try {
        const toolchain = validateToolchainContract(await (deps.loadCompilerJsonFn ?? loadCompilerJson)(options.toolchainPath));
        const profile = validateCompilerProfile(await (deps.loadCompilerJsonFn ?? loadCompilerJson)(options.profilePath));
        const verifiedToolchain = await (deps.verifyToolchainFn ?? verifyBlenderToolchain)({
            archivePath: options.archivePath,
            executablePath: options.executablePath,
            contract: toolchain
        });
        const compilerScripts = await computeCompilerScriptInventory(blenderDirectory);
        const snapshotInputs = await buildCompilerSnapshotInputs({ ...options, blenderDirectory });
        const expectedSnapshots = await snapshotFiles(snapshotInputs);
        const snapshotById = new Map(expectedSnapshots.map((entry) => [entry.id, entry]));
        const packageSnapshot = snapshotById.get('input:package');
        const profileSnapshot = snapshotById.get('input:profile');
        const toolchainSnapshot = snapshotById.get('input:toolchain');
        if (!packageSnapshot || !profileSnapshot || !toolchainSnapshot) {
            failCompiler('compiler_snapshot_incomplete', 'Authoritative compiler snapshots are incomplete.', {});
        }
        let packageBytes;
        try {
            packageBytes = await readFile(options.inputPath);
        } catch (error) {
            throw asCompilerError(error, 'compiler_input_unreadable', 'AI 528 package could not be read for semantic validation.', {});
        }
        const packageReadSha256 = createHash('sha256').update(packageBytes).digest('hex');
        if (packageReadSha256 !== packageSnapshot.sha256 || packageBytes.byteLength !== packageSnapshot.byteLength) {
            failCompiler('compiler_input_changed', 'AI 528 package bytes changed after the authoritative snapshot.', {
                expectedSha256: packageSnapshot.sha256,
                actualSha256: packageReadSha256
            });
        }
        const validatedPackage = await (deps.validateResolvedPackageFn ?? validateResolvedCityBakePackage)(packageBytes);
        packageBytes = null;
        if (!validatedPackage?.manifest || validatedPackage?.report?.valid !== true) {
            failCompiler('compiler_input_semantic_validation_failed', 'AI 528 semantic package validation did not return a valid report.', {});
        }
        assertPinnedCompilerReference(validatedPackage.manifest, toolchain);
        const reconstructionPlan = createReconstructionPlan(validatedPackage.manifest);
        const request = {
            compilerScriptSha256: compilerScripts.sha256,
            inputSha256: packageSnapshot.sha256,
            jobs,
            profileId: profile.id,
            profileSha256: profileSnapshot.sha256,
            reconstructionMode,
            schema: REQUEST_SCHEMA,
            toolchainId: toolchain.id,
            toolchainSha256: toolchainSnapshot.sha256
        };
        const contentSha256 = createHash('sha256').update(canonicalJsonStringify(request), 'utf8').digest('hex');
        const transaction = await (deps.createTransactionFn ?? createArtifactTransaction)({
            artifactRoot: options.artifactRoot,
            contentSha256,
            runId: options.runId
        });
        const isolated = createIsolatedBlenderEnvironment({ stagingPath: transaction.stagingPath, executablePath: options.executablePath });
        for (const directory of isolated.directories) await mkdir(directory, { recursive: true });
        const scriptArgs = [
            '--mode', 'compile', '--input', compilerFilesystemPath(options.inputPath),
            '--output', compilerFilesystemPath(transaction.stagingPath), '--profile', compilerFilesystemPath(options.profilePath),
            '--archive-sha256', verifiedToolchain.archive.sha256,
            '--executable-sha256', verifiedToolchain.executable.sha256,
            '--toolchain-sha256', toolchainSnapshot.sha256,
            '--profile-sha256', profileSnapshot.sha256,
            '--compiler-script-sha256', compilerScripts.sha256,
            '--package-raw-sha256', packageSnapshot.sha256,
            '--reconstruction-mode', reconstructionMode, '--jobs', jobs.join(',')
        ];
        const processResult = await (deps.runBlenderFn ?? runBlenderProcess)({
            executablePath: options.executablePath,
            pythonScriptPath,
            scriptArgs,
            cwd: path.dirname(options.executablePath),
            env: isolated.env,
            timeoutMs: options.timeoutMs ?? 21_600_000,
            signal: options.signal
        });
        const receiptPath = path.join(transaction.stagingPath, 'compile_receipt.json');
        const receipt = await readCanonicalJson(receiptPath, 'blender_receipt');
        await verifyReceiptDescriptorFromStdout(processResult.stdout, receiptPath);
        const adapted = adaptBlenderCompileReceipt(receipt, {
            toolchain,
            profile,
            profileSha256: profileSnapshot.sha256,
            toolchainSha256: toolchainSnapshot.sha256,
            compilerScriptSha256: compilerScripts.sha256,
            packageRawSha256: packageSnapshot.sha256,
            inputManifest: validatedPackage.manifest,
            reconstructionPlan,
            reconstructionMode,
            jobs
        });
        await verifyReceiptSidecars(transaction.stagingPath, adapted.sidecars);
        await validateIntermediateOutputs({ manifest: adapted.manifest, artifactDirectory: transaction.stagingPath, expectedOutputIds: adapted.expectedOutputIds });
        await rm(isolated.runtimeRoot, { recursive: true, force: true });
        const manifestPath = path.join(transaction.stagingPath, MANIFEST_FILE_NAME);
        const manifestText = await writeIntermediateManifest({ manifestPath, manifest: adapted.manifest, expectedOutputIds: adapted.expectedOutputIds });
        const promoted = await transaction.promote({
            expectedSnapshots,
            snapshotInputs,
            validateStage: async (stagingPath) => {
                const authoritative = await readIntermediateManifest({ manifestPath: path.join(stagingPath, MANIFEST_FILE_NAME), expectedOutputIds: adapted.expectedOutputIds });
                await validateIntermediateOutputs({ manifest: authoritative, artifactDirectory: stagingPath, expectedOutputIds: adapted.expectedOutputIds });
            }
        });
        return Object.freeze({
            contentSha256,
            finalPath: promoted.finalPath,
            manifest: adapted.manifest,
            manifestSha256: createHash('sha256').update(manifestText, 'utf8').digest('hex'),
            manifestText,
            request: Object.freeze(cloneCanonicalJson(request))
        });
    } catch (error) {
        throw asCompilerError(error, 'illumination_compile_failed', 'Illumination bake compilation failed.', {});
    }
}

function validateReceiptCompiler(compilerValue, context) {
    const compiler = requirePlainObject(compilerValue, 'receipt.compiler');
    requireExactKeys(compiler, [
        'archiveSha256', 'architecture', 'backend', 'blenderBuildHash', 'blenderVersion',
        'blenderVersionString', 'executableSha256', 'fixedThreadCount', 'operatingSystem'
    ], 'receipt.compiler');
    const runtime = verifyBlenderRuntimeSignature({
        architecture: compiler.architecture,
        buildHash: compiler.blenderBuildHash,
        buildPlatform: compiler.operatingSystem,
        version: compiler.blenderVersion,
        versionString: compiler.blenderVersionString
    }, context.toolchain);
    const expected = {
        archiveSha256: context.toolchain.archive.officialSha256,
        backend: 'cycles_cpu',
        executableSha256: context.toolchain.blender.executableSha256,
        fixedThreadCount: context.profile.backend.threads
    };
    for (const [key, value] of Object.entries(expected)) {
        if (compiler[key] !== value) receiptFailure(`receipt.compiler.${key}`, 'Python compiler declaration does not match the verified request.', { expected: value, actual: compiler[key] ?? null });
    }
    return {
        archiveSha256: compiler.archiveSha256,
        architecture: runtime.architecture,
        backend: 'cycles_cpu',
        buildHash: runtime.buildHash,
        buildPlatform: runtime.buildPlatform,
        executableSha256: compiler.executableSha256,
        threadCount: compiler.fixedThreadCount,
        version: runtime.version,
        versionString: runtime.versionString
    };
}

function validateReceiptInput(inputValue, context) {
    const input = requirePlainObject(inputValue, 'receipt.input');
    requireExactKeys(input, ['channelSourceSha256', 'finalFileDomainSha256', 'geometrySha256', 'packageRawSha256', 'resolvedSourceSha256', 'usedMaterialsSha256'], 'receipt.input');
    requireSha256(input.finalFileDomainSha256, 'receipt.input.finalFileDomainSha256');
    const hashes = context.inputManifest.hashes;
    const expectedChannels = Object.fromEntries(hashes.channelSources.map((entry) => [entry.id, entry.sha256]));
    requireCanonicalEquality(input.channelSourceSha256, expectedChannels, 'receipt.input.channelSourceSha256');
    const expected = { geometrySha256: hashes.geometry, packageRawSha256: context.packageRawSha256, resolvedSourceSha256: hashes.resolvedSource, usedMaterialsSha256: hashes.usedMaterials };
    for (const [key, value] of Object.entries(expected)) {
        if (input[key] !== value) receiptFailure(`receipt.input.${key}`, 'Python input declaration does not match the independently validated package.', { expected: value, actual: input[key] ?? null });
    }
}

function validateReceiptProfile(profileValue, context) {
    const value = requirePlainObject(profileValue, 'receipt.profile');
    requireExactKeys(value, ['applied', 'id', 'rawSha256'], 'receipt.profile');
    if (value.id !== context.profile.id || value.rawSha256 !== context.profileSha256) receiptFailure('receipt.profile', 'Python profile identity or digest does not match the verified profile.', {});
    const expectedApplied = {
        alphaCutoutPolicy: 'compile_exact_coverage_threshold_to_silhouette_geometry',
        bakeTarget: context.profile.bake.target,
        colorManagement: 'scene_linear_raw_no_display_transform',
        cyclesDevice: context.profile.backend.cyclesDevice,
        depthPrecision: 'rgba_float32_openexr_and_canonical_f32le',
        depthSampling: 'orthographic_nearest_visible_surface',
        dof: context.profile.scene.depthOfField,
        motionBlur: context.profile.scene.motionBlur,
        profileId: context.profile.id,
        samplingPattern: context.profile.sampling.pattern,
        threadCount: context.profile.backend.threads,
        uvOrigin: context.profile.output.rowOrigin,
        world: 'explicit_profile_linear_color_and_strength'
    };
    requireCanonicalEquality(value.applied, expectedApplied, 'receipt.profile.applied');
}

function validateReceiptChecks(checksValue, profile, jobs) {
    const checks = requirePlainObject(checksValue, 'receipt.checks');
    const expected = {
        alphaCutout: {
            coveredCells: 33,
            opaqueTriangleCount: 66,
            policy: 'exact_scalar_coverage_threshold_compiled_to_silhouette_geometry',
            status: 'verified',
            transparentCells: 31
        },
        normal: { expected: ['0', '0', '1'], status: 'verified' },
        transform: { sourcePoint: ['1', '2', '3'], status: 'verified', targetPoint: ['1', '-3', '2'] },
        uv: { logicalOrigin: 'lower_left', status: 'verified', vFlip: false },
        channelIsolation: {
            aoSeparate: true,
            diffuseDirectPassFilter: jobs.includes('direct') ? ['DIRECT'] : true,
            diffuseIndirectPassFilter: jobs.includes('indirect') ? ['INDIRECT'] : true,
            pairwiseDecodedPixelsDistinct: true,
            receiverColorExcludedFromLightOnlyChannels: true,
            status: 'verified'
        },
        profile: {
            adaptiveSampling: profile.sampling.adaptiveSampling,
            denoise: profile.sampling.denoising,
            samples: profile.sampling.samples,
            seed: profile.sampling.seed
        },
        ...(jobs.includes('depth') ? {
            depth: { emptySentinelPresent: true, nearerSilhouetteAndFartherReceiverPresent: true, nearestVisibleDepth: true, status: 'verified' }
        } : {})
    };
    requireCanonicalEquality(checks, expected, 'receipt.checks');
    return Object.keys(expected).sort(compareCanonicalStrings).map((id) => ({ id, passed: true }));
}

function validateReceiptReconstruction(value, context) {
    const reconstruction = requirePlainObject(value, 'receipt.reconstruction');
    const inventory = requirePlainObject(reconstruction.inventory, 'receipt.reconstruction.inventory');
    const manifest = context.inputManifest;
    const expectedInventory = {
        bufferCount: manifest.buffers.length,
        casterMappingCount: manifest.casterMappings.length,
        channelIds: [...REQUIRED_CHANNEL_IDS],
        geometryCount: manifest.geometries.length,
        instanceCount: manifest.meshInstances.length,
        materialCount: manifest.materials.length,
        objectCount: manifest.objects.length,
        receiverMappingCount: manifest.receiverMappings.length,
        semanticBufferDigestsVerified: true,
        textureCount: manifest.textures.length
    };
    requireCanonicalEquality(inventory, expectedInventory, 'receipt.reconstruction.inventory');
    if (reconstruction.mode !== context.reconstructionMode
        || reconstruction.stableIdOrdering !== 'canonical_ascending'
        || reconstruction.stableIdsPreservedAsCustomMetadata !== true) {
        receiptFailure('receipt.reconstruction', 'Python reconstruction mode or stable-ID policy does not match the request.', {});
    }
    if (context.reconstructionMode === 'validate') {
        requireExactKeys(reconstruction, ['inventory', 'mode', 'stableIdOrdering', 'stableIdsPreservedAsCustomMetadata'], 'receipt.reconstruction');
        return;
    }
    requireExactKeys(reconstruction, [
        'channelId', 'collection', 'completeSelectedChannel', 'geometryDatablockCount', 'instanceObjectCount',
        'inventory', 'mode', 'normalConversionChecks', 'selectedMappingCount', 'stableIdOrdering',
        'stableIdsPreservedAsCustomMetadata', 'textureSourceCount', 'uvIdentityChecks'
    ], 'receipt.reconstruction');
    if (reconstruction.channelId !== 'all' || reconstruction.completeSelectedChannel !== true) receiptFailure('receipt.reconstruction', 'Full reconstruction did not complete the all-channel selection.', {});
    for (const key of ['geometryDatablockCount', 'instanceObjectCount', 'normalConversionChecks', 'selectedMappingCount', 'textureSourceCount', 'uvIdentityChecks']) {
        requireNonNegativeInteger(reconstruction[key], `receipt.reconstruction.${key}`);
    }
    if (reconstruction.instanceObjectCount !== context.reconstructionPlan.summary.meshInstanceCount) {
        receiptFailure('receipt.reconstruction.instanceObjectCount', 'Full reconstruction instance count differs from the independent Node plan.', {
            expected: context.reconstructionPlan.summary.meshInstanceCount,
            actual: reconstruction.instanceObjectCount
        });
    }
}

function validateReceiptOutputs(outputsValue, expectedOutputs, profile) {
    if (!Array.isArray(outputsValue)) receiptFailure('receipt.outputs', 'Python outputs must be an array.', {});
    const expectedIds = expectedOutputs.map((entry) => entry.id);
    requireCanonicalEquality(outputsValue.map((entry) => entry?.jobId), expectedIds, 'receipt.outputs order');
    return outputsValue.map((entry, index) => {
        const output = requirePlainObject(entry, `receipt.outputs[${index}]`);
        requireExactKeys(output, ['canonicalDecoded', 'channelDescriptor', 'dimensions', 'jobId', 'pixelStatistics', 'rawContainer', 'rowOrder'], `receipt.outputs[${index}]`);
        const expected = expectedOutputs[index];
        const dimensions = requirePlainObject(output.dimensions, `receipt.outputs.${output.jobId}.dimensions`);
        requireExactKeys(dimensions, ['channels', 'height', 'width'], `receipt.outputs.${output.jobId}.dimensions`);
        if (dimensions.channels !== 4 || dimensions.width !== profile.bake.resolution || dimensions.height !== profile.bake.resolution) receiptFailure(`receipt.outputs.${output.jobId}.dimensions`, 'Output dimensions do not match the fixed compiler profile.', {});
        if (output.rowOrder !== 'blender_image_buffer_lower_left_origin_rows') receiptFailure(`receipt.outputs.${output.jobId}.rowOrder`, 'Output row order is unsupported.', {});
        const raw = requirePlainObject(output.rawContainer, `receipt.outputs.${output.jobId}.rawContainer`);
        requireExactKeys(raw, ['byteLength', 'codec', 'path', 'precision', 'sha256'], `receipt.outputs.${output.jobId}.rawContainer`);
        const canonical = requirePlainObject(output.canonicalDecoded, `receipt.outputs.${output.jobId}.canonicalDecoded`);
        requireExactKeys(canonical, ['byteLength', 'encoding', 'path', 'sha256'], `receipt.outputs.${output.jobId}.canonicalDecoded`);
        const expectedRawPath = `${profile.output.rawDirectory}/${output.jobId}.raw.exr`;
        const expectedCanonicalPath = `${profile.output.canonicalDirectory}/${output.jobId}.rgba.f32le`;
        if (raw.codec !== 'openexr_zip_lossless' || raw.precision !== 'float32_per_channel'
            || raw.path !== expectedRawPath || canonical.path !== expectedCanonicalPath
            || canonical.encoding !== 'little_endian_ieee754_float32_rgba_tightly_packed') {
            receiptFailure(`receipt.outputs.${output.jobId}`, 'Output encoding, codec, or stable relative path does not match the profile.', {});
        }
        requirePositiveInteger(raw.byteLength, `receipt.outputs.${output.jobId}.rawContainer.byteLength`);
        requireSha256(raw.sha256, `receipt.outputs.${output.jobId}.rawContainer.sha256`);
        requireSha256(canonical.sha256, `receipt.outputs.${output.jobId}.canonicalDecoded.sha256`);
        const expectedCanonicalBytes = dimensions.width * dimensions.height * 4 * 4;
        if (canonical.byteLength !== expectedCanonicalBytes) receiptFailure(`receipt.outputs.${output.jobId}.canonicalDecoded.byteLength`, 'Canonical pixel byte length does not match RGBA float32 dimensions.', { expected: expectedCanonicalBytes, actual: canonical.byteLength ?? null });
        validatePixelStatistics(output.pixelStatistics, dimensions.width * dimensions.height, output.jobId);
        requirePlainObject(output.channelDescriptor, `receipt.outputs.${output.jobId}.channelDescriptor`);
        canonicalJsonStringify(output.channelDescriptor);
        return {
            canonical: { byteLength: canonical.byteLength, components: 4, encoding: INTERMEDIATE_CANONICAL_ENCODING, height: dimensions.height, path: canonical.path, rowOrigin: INTERMEDIATE_CANONICAL_ROW_ORIGIN, sha256: canonical.sha256, width: dimensions.width },
            channel: expected.channel,
            descriptor: cloneCanonicalJson(output.channelDescriptor),
            id: output.jobId,
            raw: { byteLength: raw.byteLength, format: INTERMEDIATE_RAW_FORMAT, path: raw.path, sha256: raw.sha256 }
        };
    });
}

function validatePixelStatistics(value, pixelCount, outputId) {
    const stats = requirePlainObject(value, `receipt.outputs.${outputId}.pixelStatistics`);
    requireExactKeys(stats, ['alphaNonzeroCount', 'alphaZeroCount', 'componentMaximumF32', 'componentMinimumF32'], `receipt.outputs.${outputId}.pixelStatistics`);
    requireNonNegativeInteger(stats.alphaNonzeroCount, `receipt.outputs.${outputId}.pixelStatistics.alphaNonzeroCount`);
    requireNonNegativeInteger(stats.alphaZeroCount, `receipt.outputs.${outputId}.pixelStatistics.alphaZeroCount`);
    if (stats.alphaNonzeroCount + stats.alphaZeroCount !== pixelCount
        || typeof stats.componentMaximumF32 !== 'string' || !/^[0-9a-f]{8}$/.test(stats.componentMaximumF32)
        || typeof stats.componentMinimumF32 !== 'string' || !/^[0-9a-f]{8}$/.test(stats.componentMinimumF32)) {
        receiptFailure(`receipt.outputs.${outputId}.pixelStatistics`, 'Output pixel statistics are incomplete or inconsistent.', {});
    }
}

function validateReceiptSidecarInventory(value, expectedIds) {
    if (!Array.isArray(value)) receiptFailure('receipt.intermediateManifests', 'Python sidecar inventory must be an array.', {});
    requireCanonicalEquality(value.map((entry) => entry?.jobId), expectedIds, 'receipt.intermediateManifests order');
    for (const entryValue of value) {
        const entry = requirePlainObject(entryValue, 'receipt.intermediateManifests entry');
        requireExactKeys(entry, ['byteLength', 'jobId', 'path', 'sha256'], 'receipt.intermediateManifests entry');
        const expectedPath = `channels/${entry.jobId}/${entry.jobId}.manifest.json`;
        if (entry.path !== expectedPath) receiptFailure('receipt.intermediateManifests.path', 'Python sidecar path is not the stable job path.', { expected: expectedPath, actual: entry.path ?? null });
        requirePositiveInteger(entry.byteLength, 'receipt.intermediateManifests.byteLength');
        requireSha256(entry.sha256, 'receipt.intermediateManifests.sha256');
    }
}

async function verifyReceiptSidecars(root, sidecars) {
    for (const sidecar of sidecars) {
        const filePath = resolveStagePath(root, sidecar.path);
        const hashed = await hashFileRaw(filePath);
        if (hashed.byteLength !== sidecar.byteLength || hashed.sha256 !== sidecar.sha256) {
            failCompiler('blender_sidecar_mismatch', 'Python intermediate sidecar bytes do not match the compile receipt.', { jobId: sidecar.jobId, path: sidecar.path });
        }
        await readCanonicalJson(filePath, 'blender_sidecar');
    }
}

async function verifyReceiptDescriptorFromStdout(stdout, receiptPath) {
    const records = stdout.split(/\r?\n/).filter((line) => line.startsWith(PYTHON_RECEIPT_STDOUT_PREFIX));
    if (records.length !== 1) failCompiler('blender_receipt_signal_invalid', 'Blender stdout did not contain exactly one canonical compile-receipt signal.', { count: records.length });
    let descriptor;
    try {
        descriptor = JSON.parse(records[0].slice(PYTHON_RECEIPT_STDOUT_PREFIX.length));
    } catch (error) {
        throw asCompilerError(error, 'blender_receipt_signal_invalid', 'Blender compile-receipt signal is not valid JSON.', {});
    }
    const value = requirePlainObject(descriptor, 'Blender receipt descriptor');
    requireExactKeys(value, ['byteLength', 'path', 'sha256'], 'Blender receipt descriptor');
    if (value.path !== 'compile_receipt.json') receiptFailure('receipt descriptor path', 'Blender receipt descriptor path is invalid.', { actual: value.path ?? null });
    const hashed = await hashFileRaw(receiptPath);
    if (hashed.byteLength !== value.byteLength || hashed.sha256 !== value.sha256) failCompiler('blender_receipt_hash_mismatch', 'Compile receipt bytes do not match the Blender stdout descriptor.', {});
}

async function readCanonicalJson(filePath, label) {
    let text;
    try {
        text = await readFile(filePath, 'utf8');
    } catch (error) {
        throw asCompilerError(error, `${label}_read_failed`, `${label} could not be read.`, {});
    }
    let value;
    try {
        value = JSON.parse(text);
    } catch (error) {
        throw asCompilerError(error, `${label}_json_invalid`, `${label} is not valid JSON.`, {});
    }
    if (canonicalJsonStringify(value) !== text) failCompiler(`${label}_not_canonical`, `${label} is not canonical JSON.`, {});
    return value;
}

async function buildCompilerSnapshotInputs(options) {
    const inputs = [
        { id: 'input:archive', filePath: options.archivePath },
        { id: 'input:executable', filePath: options.executablePath },
        { id: 'input:package', filePath: options.inputPath },
        { id: 'input:profile', filePath: options.profilePath },
        { id: 'input:toolchain', filePath: options.toolchainPath }
    ];
    const directoryGroups = [
        { directory: options.blenderDirectory, extension: '.py', prefix: 'script:python/' },
        { directory: path.join(path.dirname(options.blenderDirectory), 'src'), extension: '.mjs', prefix: 'script:node/src/' },
        { directory: path.dirname(options.blenderDirectory), extension: '.mjs', prefix: 'script:node/' }
    ];
    for (const group of directoryGroups) {
        let entries;
        try {
            entries = await readdir(group.directory, { withFileTypes: true });
        } catch (error) {
            throw asCompilerError(error, 'compiler_script_inventory_unreadable', 'Compiler source scripts could not be enumerated.', { directoryName: path.basename(group.directory) });
        }
        for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(group.extension)).sort((a, b) => compareCanonicalStrings(a.name, b.name))) {
            inputs.push({ id: group.prefix + entry.name, filePath: path.join(group.directory, entry.name) });
        }
    }
    return Object.freeze(inputs);
}

function assertPinnedCompilerReference(manifest, toolchain) {
    const references = manifest.compilerReferences;
    if (!Array.isArray(references) || references.length !== 1) failCompiler('compiler_reference_unsupported', 'AI 528 package must contain exactly one AI 529 compiler reference.', {});
    const reference = references[0];
    const expected = {
        archive: toolchain.archive.fileName,
        archiveSha256: toolchain.archive.officialSha256,
        backend: 'cycles_cpu',
        id: 'blender-5.2.1-lts-cycles-cpu-contract-v1',
        implementationOwner: 'AI_529',
        schema: 'bus-sim-illumination-compiler-reference-v1'
    };
    for (const [key, value] of Object.entries(expected)) {
        if (reference?.[key] !== value) failCompiler('compiler_reference_unsupported', 'AI 528 compiler reference does not match the pinned AI 529 toolchain.', { field: key });
    }
    if (!['pending', 'implemented'].includes(reference.implementationStatus)) failCompiler('compiler_reference_unsupported', 'AI 528 compiler reference has an unsupported implementation status.', {});
    const expectedRefs = [
        'prompts/AI_529_TOOLS_blender_cycles_headless_bake_compiler.md',
        'specs/graphics/illumination_bake_input.md',
        'specs/graphics/illumination_framework.md'
    ].sort(compareCanonicalStrings);
    if (!Array.isArray(reference.configurationRefs)
        || canonicalJsonStringify([...reference.configurationRefs].sort(compareCanonicalStrings)) !== canonicalJsonStringify(expectedRefs)
        || new Set(reference.configurationRefs).size !== expectedRefs.length) {
        failCompiler('compiler_configuration_refs_invalid', 'AI 528 compiler configuration references are incomplete or duplicated.', {});
    }
}

function resolveStagePath(root, relativePath) {
    if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\') || relativePath.startsWith('/')
        || /^[A-Za-z]:/.test(relativePath) || path.posix.normalize(relativePath) !== relativePath
        || relativePath.split('/').includes('..')) {
        failCompiler('blender_receipt_path_invalid', 'Blender receipt contains an unsafe output path.', { path: relativePath ?? null });
    }
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, ...relativePath.split('/'));
    const relative = path.relative(resolvedRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) failCompiler('blender_receipt_path_invalid', 'Blender receipt output path escapes its stage.', { path: relativePath });
    return resolved;
}

function compilerFilesystemPath(filePath) {
    const resolved = path.resolve(filePath);
    return process.platform === 'win32' ? path.toNamespacedPath(resolved) : resolved;
}

function normalizeJobs(jobs) {
    if (!Array.isArray(jobs) || jobs.length === 0 || jobs.some((job) => typeof job !== 'string')) throw new TypeError('Compiler jobs must be a non-empty array');
    if (new Set(jobs).size !== jobs.length || jobs.some((job) => !COMPILER_JOB_ORDER.includes(job))) throw new TypeError('Compiler jobs must be a unique subset of depth,direct,indirect,ao');
    const selected = new Set(jobs);
    return Object.freeze(COMPILER_JOB_ORDER.filter((job) => selected.has(job)));
}

function assertAdaptContext(context) {
    if (!context || typeof context !== 'object') throw new TypeError('Receipt adaptation context is required');
    for (const key of ['profileSha256', 'toolchainSha256', 'compilerScriptSha256', 'packageRawSha256']) requireSha256(context[key], `context.${key}`);
    if (!context.toolchain || !context.profile || !context.inputManifest || !context.reconstructionPlan) throw new TypeError('Receipt adaptation context is incomplete');
    if (!['validate', 'full'].includes(context.reconstructionMode)) throw new TypeError('Reconstruction mode must be validate or full');
}

function assertCompileOptions(options) {
    if (!options || typeof options !== 'object') throw new TypeError('Compiler options are required');
    for (const key of ['inputPath', 'archivePath', 'executablePath', 'toolchainPath', 'profilePath', 'artifactRoot', 'runId']) assertPathString(options[key], `Compiler ${key}`);
    if (options.reconstructionMode !== undefined && !['validate', 'full'].includes(options.reconstructionMode)) throw new TypeError('Compiler reconstructionMode must be validate or full');
    if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0)) throw new TypeError('Compiler timeoutMs must be a positive safe integer');
}

function requirePlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) receiptFailure(label, `${label} must be a plain JSON object.`, {});
    return value;
}

function requireExactKeys(value, expected, label) {
    const actual = Object.keys(value).sort(compareCanonicalStrings);
    const wanted = [...expected].sort(compareCanonicalStrings);
    if (canonicalJsonStringify(actual) !== canonicalJsonStringify(wanted)) receiptFailure(label, `${label} has unsupported or missing keys.`, { expected: wanted, actual });
}

function requireCanonicalEquality(actual, expected, label) {
    let actualText;
    let expectedText;
    try {
        actualText = canonicalJsonStringify(actual);
        expectedText = canonicalJsonStringify(expected);
    } catch (error) {
        throw asCompilerError(error, 'blender_receipt_invalid', `${label} is not canonical JSON data.`, { label });
    }
    if (actualText !== expectedText) receiptFailure(label, `${label} does not match the independently verified value.`, { expected, actual });
}

function requireSha256(value, label) {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) receiptFailure(label, `${label} must be a lowercase raw SHA-256.`, {});
}

function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) receiptFailure(label, `${label} must be a positive safe integer.`, { actual: value ?? null });
}

function requireNonNegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) receiptFailure(label, `${label} must be a non-negative safe integer.`, { actual: value ?? null });
}

function receiptFailure(label, message, context) {
    failCompiler('blender_receipt_invalid', message, { field: label, ...context });
}

function assertPathString(value, label) {
    if (typeof value !== 'string' || !value) throw new TypeError(`${label} must be a non-empty string`);
}
