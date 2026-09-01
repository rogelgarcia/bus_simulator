// Isolated, non-promotable RGB24+A precision diagnostic for one AI 531 profile.
// @ts-check

import {createHash} from 'node:crypto';
import {
    lstat,
    mkdir,
    readFile,
    rename,
    rm,
    writeFile
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
    canonicalJsonBytes,
    canonicalJsonStringify,
    cloneCanonicalJson,
    compareCanonicalStrings
} from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    ILLUMINATION_MAX_PACKAGE_BYTES
} from '../../../src/app/illumination/package/IlluminationPackageConstants.js';
import {
    STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID
} from '../../../src/app/illumination/static_sun_depth/StaticSunDepthEncoding.js';
import {
    createIsolatedBlenderEnvironment
} from '../../illumination_bake_compiler/src/CompilerOrchestrator.mjs';
import {
    runBlenderProcess
} from '../../illumination_bake_compiler/src/BlenderProcess.mjs';
import {
    assertFileSnapshotsUnchanged,
    hashFileRaw,
    snapshotFiles
} from '../../illumination_bake_compiler/src/FileHashes.mjs';
import {
    buildProductionDepthDiagnosticArtifact,
    validateProductionStaticSunDepthReceipt
} from './ProductionArtifact.mjs';
import {
    authenticateProductionStaticSunDepthReceipt,
    createProductionInputIdentity,
    createProductionLiveIdentity,
    createProductionPackageSource,
    createProductionStaticSunRequest,
    parseProductionReceiptStdoutDescriptor,
    prepareProductionAuthority,
    readAuthenticatedProductionStaticSunDepthInteriors,
    selectProductionStaticSunProfiles
} from './ProductionOrchestrator.mjs';
import {
    buildProductionDepthDiagnosticPackage
} from './ProductionPackage.mjs';

export const PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID =
    'ai527.sun.az135.el08';
export const PRODUCTION_DEPTH_DIAGNOSTIC_INDEX_SCHEMA =
    'bus-sim-static-sun-depth-depth-precision-diagnostic-package-index-v1';
export const PRODUCTION_DEPTH_DIAGNOSTIC_PUBLICATION_SCHEMA =
    'bus-sim-static-sun-depth-depth-precision-diagnostic-publication-v1';
export const PRODUCTION_DEPTH_DIAGNOSTIC_CERTIFICATION_SCHEMA =
    'bus-sim-static-sun-depth-depth-precision-diagnostic-certification-v1';
export const PRODUCTION_DEPTH_DIAGNOSTIC_MANIFEST_SCHEMA =
    'bus-sim-static-sun-depth-depth-precision-diagnostic-manifest-v1';

const CAPABILITY_PROFILE_ID = 'development.static_sun_v1';
const RECEIPT_FILE_NAME = 'production_static_sun_receipt.json';
const PACKAGE_FILE_NAME = 'static_sun_depth.ilpkg';
const PAYLOAD_FILE_NAME = 'static_sun_depth.rgba8';
const SAFE_RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const REQUIRED_PUBLICATION_FILES = Object.freeze([
    'alpha_certification.json',
    'artifact_manifest.json',
    'descriptor.json',
    'diagnostic_certification.json',
    'diagnostic_manifest.json',
    'input_identity.json',
    'metrics.json',
    'opaque_certification.json',
    PACKAGE_FILE_NAME,
    PAYLOAD_FILE_NAME,
    RECEIPT_FILE_NAME,
    'request.json'
]);

/**
 * Produces exactly one isolated diagnostic package and never resumes or
 * overwrites an existing diagnostic root.
 * @param {Record<string, any>} options
 * @param {Record<string, any>} [deps]
 */
export async function orchestrateProductionDepthDiagnostic(options, deps = {}) {
    const normalized = normalizeProductionDepthDiagnosticOptions(options);
    const lstatFn = deps.lstatFn ?? lstat;
    await assertPathAbsent(normalized.artifactRoot, lstatFn, 'diagnostic artifact root');
    const prepareAuthorityFn = deps.prepareAuthorityFn ?? prepareProductionAuthority;
    const executeProfileFn = deps.executeProfileFn
        ?? executeProductionDepthDiagnosticProfile;
    const publishIndexFn = deps.publishIndexFn ?? publishDiagnosticPackageIndex;
    const authority = await prepareAuthorityFn(normalized, deps);
    const profile = selectProductionStaticSunProfiles([
        PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID
    ])[0];
    const result = await executeProfileFn({
        authority,
        options: normalized,
        profile
    }, deps);
    const packageIndex = createProductionDepthDiagnosticPackageIndex(result);
    const packageIndexPath = path.join(normalized.artifactRoot, 'package_index.json');
    await publishIndexFn(packageIndexPath, packageIndex, deps);
    return Object.freeze({
        packageIndex,
        packageIndexPath,
        profile: result
    });
}

/**
 * @param {{authority: Record<string, any>, options: Record<string, any>, profile: Record<string, any>}} context
 * @param {Record<string, any>} [deps]
 */
export async function executeProductionDepthDiagnosticProfile(context, deps = {}) {
    if (context.profile?.id !== PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID) {
        throw new Error(
            `Depth precision diagnostic is hard-gated to '${PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID}'`
        );
    }
    const mkdirFn = deps.mkdirFn ?? mkdir;
    const writeFileFn = deps.writeFileFn ?? writeFile;
    const readFileFn = deps.readFileFn ?? readFile;
    const renameFn = deps.renameFn ?? rename;
    const rmFn = deps.rmFn ?? rm;
    const lstatFn = deps.lstatFn ?? lstat;
    const runBlenderFn = deps.runBlenderFn ?? runBlenderProcess;
    const hashFileFn = deps.hashFileFn ?? hashFileRaw;
    const snapshotFilesFn = deps.snapshotFilesFn ?? snapshotFiles;
    const assertSnapshotsFn = deps.assertSnapshotsFn
        ?? assertFileSnapshotsUnchanged;
    const request = createProductionStaticSunRequest(context.profile);
    const inputIdentity = createProductionInputIdentity(context.authority, request);
    const finalPath = path.join(
        context.options.artifactRoot,
        PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID
    );
    const runId = `rgb24a-${process.pid}-${Date.now()}`;
    if (!SAFE_RUN_ID_PATTERN.test(runId)) {
        throw new Error('Generated diagnostic staging run ID is unsafe');
    }
    const stagingParent = path.join(context.options.artifactRoot, '.staging');
    const stagingRoot = path.join(stagingParent, runId);
    const outputRoot = path.join(stagingRoot, 'output');
    const requestPath = path.join(stagingRoot, 'request.json');
    await mkdirFn(stagingParent, {recursive: true});
    await mkdirFn(stagingRoot, {recursive: false});
    try {
        const requestBytes = canonicalJsonBytes(request);
        await writeFileFn(requestPath, requestBytes);
        const isolated = createIsolatedBlenderEnvironment({
            stagingPath: stagingRoot,
            executablePath: context.options.executablePath
        });
        for (const directory of isolated.directories) {
            await mkdirFn(directory, {recursive: true});
        }
        const processResult = await runBlenderFn({
            executablePath: context.options.executablePath,
            pythonScriptPath: context.options.rendererPath,
            scriptArgs: [
                '--input', compilerFilesystemPath(context.options.inputPath),
                '--output', compilerFilesystemPath(outputRoot),
                '--profile', compilerFilesystemPath(context.options.profilePath),
                '--request', compilerFilesystemPath(requestPath),
                '--archive-sha256', context.authority.verifiedToolchain.archive.sha256,
                '--executable-sha256',
                context.authority.verifiedToolchain.executable.sha256,
                '--toolchain-sha256', context.authority.toolchainSha256,
                '--profile-sha256', context.authority.profileSha256,
                '--request-sha256', rawSha256(requestBytes),
                '--renderer-script-sha256', context.authority.rendererScriptSha256,
                '--ai529-script-sha256', context.authority.ai529ScriptSha256,
                '--package-raw-sha256', context.authority.packageRawSha256,
                '--output-encoding', 'rgba8_rgb24a',
                '--row-strip-pixels', String(context.options.rowStripPixels)
            ],
            cwd: path.dirname(context.options.executablePath),
            env: isolated.env,
            timeoutMs: context.options.timeoutMs,
            signal: context.options.signal
        });
        const stdoutDescriptor = parseProductionReceiptStdoutDescriptor(
            processResult.stdout
        );
        const receiptBytes = copyBytes(
            await readFileFn(path.join(outputRoot, RECEIPT_FILE_NAME)),
            'Blender depth diagnostic receipt'
        );
        if (receiptBytes.byteLength !== stdoutDescriptor.byteLength
            || rawSha256(receiptBytes) !== stdoutDescriptor.sha256) {
            throw new Error(
                'Depth diagnostic receipt bytes differ from the authenticated stdout descriptor'
            );
        }
        const receipt = validateProductionStaticSunDepthReceipt(
            parseCanonicalJsonBytes(receiptBytes, 'Blender depth diagnostic receipt')
        );
        authenticateProductionStaticSunDepthReceipt(
            receipt,
            context.authority,
            request
        );
        const interiorTiles = await readAuthenticatedProductionStaticSunDepthInteriors(
            outputRoot,
            receipt.outputs,
            readFileFn
        );
        const artifact = buildProductionDepthDiagnosticArtifact({
            receipt,
            interiorTiles
        });
        if (artifact.descriptor.identity.encoding.id
                !== STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID
            || artifact.artifactManifest.productionEligible !== false
            || artifact.payload.byteLength > ILLUMINATION_MAX_PACKAGE_BYTES) {
            throw new Error(
                'Depth diagnostic artifact violates its encoding, eligibility, or logical-byte cap'
            );
        }
        const packaged = await buildProductionDepthDiagnosticPackage({
            channelProfileSha256: context.authority.channelProfileSha256,
            cityId: receipt.identity.cityId,
            compilerDescriptor: receipt.compilerDescriptor,
            descriptor: artifact.descriptor,
            lightingProfileId: context.profile.id,
            payload: artifact.payload,
            selectedCapabilityProfileId: CAPABILITY_PROFILE_ID,
            source: createProductionPackageSource(receipt)
        });
        const liveIdentity = createProductionLiveIdentity(
            receipt,
            context.profile.id
        );
        const packagePath = repositoryRelativePackagePath(
            context.options.repoRoot,
            path.join(finalPath, PACKAGE_FILE_NAME)
        );
        const diagnosticCertification = cloneCanonicalJson({
            artifactContentSha256: artifact.artifactManifest.contentSha256,
            encodingId: STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID,
            guard: artifact.metrics.guardVerification,
            logicalPayloadByteLength: artifact.payload.byteLength,
            maximumLogicalPayloadBytes: ILLUMINATION_MAX_PACKAGE_BYTES,
            productionEligible: false,
            quantization: artifact.metrics.quantization,
            receiptSha256: stdoutDescriptor.sha256,
            schema: PRODUCTION_DEPTH_DIAGNOSTIC_CERTIFICATION_SCHEMA,
            status: 'passed'
        });
        const diagnosticManifest = cloneCanonicalJson({
            changedVariable:
                'profile-global-depth-precision-and-explicit-occupancy-only-v1',
            controlEncodingId: 'rg8-packed-linear-depth-v1',
            diagnosticEncodingId: STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID,
            lightingProfileId: context.profile.id,
            productionEligible: false,
            preservedVariables: [
                'alpha-cutout-semantics',
                'bias',
                'geometry',
                'guard-layout',
                'light-basis-and-bounds',
                'pcf',
                'source-transforms',
                'texel-phase'
            ],
            schema: PRODUCTION_DEPTH_DIAGNOSTIC_MANIFEST_SCHEMA
        });
        const metrics = cloneCanonicalJson({
            artifact: artifact.metrics,
            package: packaged.buildMetrics,
            performance: {
                reason: 'host-load-and-gpu-contention-declared-by-user',
                status: 'not_measured'
            },
            productionEligible: false,
            schema: 'bus-sim-static-sun-depth-depth-precision-diagnostic-publication-metrics-v1'
        });
        await Promise.all([
            writeCanonicalJson(
                path.join(outputRoot, 'alpha_certification.json'),
                receipt.alphaCertification,
                writeFileFn
            ),
            writeCanonicalJson(
                path.join(outputRoot, 'artifact_manifest.json'),
                artifact.artifactManifest,
                writeFileFn
            ),
            writeCanonicalJson(
                path.join(outputRoot, 'descriptor.json'),
                artifact.descriptor,
                writeFileFn
            ),
            writeCanonicalJson(
                path.join(outputRoot, 'diagnostic_certification.json'),
                diagnosticCertification,
                writeFileFn
            ),
            writeCanonicalJson(
                path.join(outputRoot, 'diagnostic_manifest.json'),
                diagnosticManifest,
                writeFileFn
            ),
            writeCanonicalJson(
                path.join(outputRoot, 'input_identity.json'),
                inputIdentity,
                writeFileFn
            ),
            writeCanonicalJson(
                path.join(outputRoot, 'metrics.json'),
                metrics,
                writeFileFn
            ),
            writeCanonicalJson(
                path.join(outputRoot, 'opaque_certification.json'),
                receipt.opaqueCertification,
                writeFileFn
            ),
            writeCanonicalJson(
                path.join(outputRoot, 'request.json'),
                request,
                writeFileFn
            ),
            writeFileFn(path.join(outputRoot, PACKAGE_FILE_NAME), packaged.bytes),
            writeFileFn(path.join(outputRoot, PAYLOAD_FILE_NAME), artifact.payload)
        ]);
        await rmFn(isolated.runtimeRoot, {recursive: true, force: true});
        const actualSnapshots = await snapshotFilesFn(
            context.authority.snapshotInputs
        );
        assertSnapshotsFn(context.authority.snapshots, actualSnapshots, {
            code: 'depth_diagnostic_inputs_stale',
            label: 'Depth diagnostic source, profile, renderer, toolchain, or AI529 scripts'
        });
        const publicationPaths = [
            ...REQUIRED_PUBLICATION_FILES,
            ...receipt.outputs.map((output) => output.path)
        ].sort(compareCanonicalStrings);
        const files = [];
        for (const relativePath of publicationPaths) {
            const absolutePath = resolvePublishedPath(outputRoot, relativePath);
            const hashed = await hashFileFn(absolutePath);
            files.push({
                byteLength: hashed.byteLength,
                path: relativePath,
                sha256: hashed.sha256
            });
        }
        const packageIndexEntry = cloneCanonicalJson({
            lightingProfileId: context.profile.id,
            liveIdentity,
            packagePath
        });
        const publication = cloneCanonicalJson({
            files,
            inputIdentitySha256: rawCanonicalSha256(inputIdentity),
            lightingProfileId: context.profile.id,
            packageAggregateSha256: packaged.aggregateSha256,
            packageIndexEntry,
            productionEligible: false,
            schema: PRODUCTION_DEPTH_DIAGNOSTIC_PUBLICATION_SCHEMA,
            status: 'complete'
        });
        await writeCanonicalJson(
            path.join(outputRoot, 'publication.json'),
            publication,
            writeFileFn
        );
        await assertPathAbsent(finalPath, lstatFn, 'diagnostic profile destination');
        await renameFn(outputRoot, finalPath);
        return Object.freeze({
            ...packageIndexEntry,
            finalPath,
            publication,
            resumed: false
        });
    } finally {
        await rmFn(stagingRoot, {recursive: true, force: true});
    }
}

/** @param {Record<string, any>} result */
export function createProductionDepthDiagnosticPackageIndex(result) {
    if (result?.lightingProfileId !== PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID
        || result?.liveIdentity?.lightingProfileId
            !== PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID) {
        throw new Error('Depth diagnostic index requires the exact diagnostic profile identity');
    }
    requireDiagnosticPackagePath(result.packagePath);
    return cloneCanonicalJson({
        profiles: {
            [PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID]: {
                liveIdentity: result.liveIdentity,
                packagePath: result.packagePath
            }
        },
        productionEligible: false,
        schema: PRODUCTION_DEPTH_DIAGNOSTIC_INDEX_SCHEMA
    });
}

/** @param {Record<string, any>} options */
export function normalizeProductionDepthDiagnosticOptions(options) {
    requirePlainObject(options, 'Depth diagnostic options');
    const requiredPaths = [
        'ai529Directory',
        'archivePath',
        'artifactRoot',
        'executablePath',
        'inputPath',
        'profilePath',
        'rendererPath',
        'repoRoot',
        'toolchainPath'
    ];
    const normalized = {};
    for (const key of requiredPaths) {
        if (typeof options[key] !== 'string' || !options[key]) {
            throw new TypeError(`Depth diagnostic option '${key}' must be a path`);
        }
        normalized[key] = path.resolve(options[key]);
    }
    const diagnosticAuthority = path.join(
        normalized.repoRoot,
        'tests',
        'artifacts',
        'illumination_531',
        'diagnostics'
    );
    if (!isPathInside(diagnosticAuthority, normalized.artifactRoot, false)) {
        throw new Error(
            'artifactRoot must stay in a named child below tests/artifacts/illumination_531/diagnostics/'
        );
    }
    normalized.timeoutMs = options.timeoutMs ?? 21_600_000;
    normalized.rowStripPixels = options.rowStripPixels ?? 1821;
    if (!Number.isSafeInteger(normalized.timeoutMs) || normalized.timeoutMs <= 0) {
        throw new TypeError('timeoutMs must be a positive safe integer');
    }
    if (normalized.rowStripPixels !== 1821) {
        throw new RangeError('rowStripPixels must preserve the production tile height of 1821');
    }
    if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) {
        throw new TypeError('signal must be an AbortSignal');
    }
    normalized.signal = options.signal;
    return Object.freeze(normalized);
}

async function publishDiagnosticPackageIndex(packageIndexPath, packageIndex, deps) {
    const mkdirFn = deps.mkdirFn ?? mkdir;
    const writeFileFn = deps.writeFileFn ?? writeFile;
    const renameFn = deps.renameFn ?? rename;
    await mkdirFn(path.dirname(packageIndexPath), {recursive: true});
    const temporaryPath = `${packageIndexPath}.partial-${process.pid}-${Date.now()}`;
    await writeCanonicalJson(temporaryPath, packageIndex, writeFileFn);
    await renameFn(temporaryPath, packageIndexPath);
}

function repositoryRelativePackagePath(repoRoot, absolutePath) {
    const relative = path.relative(repoRoot, absolutePath).replaceAll('\\', '/');
    requireDiagnosticPackagePath(relative);
    return relative;
}

function requireDiagnosticPackagePath(value) {
    if (typeof value !== 'string'
        || !value.endsWith('.ilpkg')
        || value.includes('\\')
        || value.startsWith('/')
        || path.posix.normalize(value) !== value
        || value.split('/').includes('..')
        || !value.startsWith('tests/artifacts/illumination_531/diagnostics/')) {
        throw new TypeError(
            'Diagnostic package path must be canonical and remain below the diagnostic artifact root'
        );
    }
}

function resolvePublishedPath(root, relativePath) {
    if (typeof relativePath !== 'string'
        || !relativePath
        || relativePath.includes('\\')
        || relativePath.startsWith('/')
        || path.posix.normalize(relativePath) !== relativePath
        || relativePath.split('/').includes('..')) {
        throw new TypeError('Published path must be canonical and relative');
    }
    const absoluteRoot = path.resolve(root);
    const resolved = path.resolve(absoluteRoot, ...relativePath.split('/'));
    if (!isPathInside(absoluteRoot, resolved, false)) {
        throw new Error(`Published path '${relativePath}' escapes its diagnostic root`);
    }
    return resolved;
}

function isPathInside(root, candidate, allowEqual) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    return (allowEqual && relative === '')
        || (relative !== ''
            && !relative.startsWith('..')
            && !path.isAbsolute(relative));
}

async function assertPathAbsent(targetPath, lstatFn, label) {
    try {
        await lstatFn(targetPath);
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') return;
        throw error;
    }
    throw new Error(`${label} already exists: ${targetPath}`);
}

function compilerFilesystemPath(filePath) {
    const resolved = path.resolve(filePath);
    return process.platform === 'win32'
        ? path.toNamespacedPath(resolved)
        : resolved;
}

async function writeCanonicalJson(filePath, value, writeFileFn) {
    await writeFileFn(filePath, canonicalJsonBytes(value));
}

function parseCanonicalJsonBytes(bytes, label) {
    let text;
    try {
        text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    } catch (error) {
        throw new Error(`${label} is not valid UTF-8`, {cause: error});
    }
    let value;
    try {
        value = JSON.parse(text);
    } catch (error) {
        throw new Error(`${label} is not valid JSON`, {cause: error});
    }
    if (canonicalJsonStringify(value) !== text) {
        throw new Error(`${label} is not canonical JSON`);
    }
    return value;
}

function copyBytes(value, label) {
    if (value instanceof Uint8Array) return value.slice();
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    }
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    throw new TypeError(`${label} must be bytes`);
}

function rawSha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function rawCanonicalSha256(value) {
    return createHash('sha256')
        .update(canonicalJsonStringify(value), 'utf8')
        .digest('hex');
}

function requirePlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype
            && Object.getPrototypeOf(value) !== null)) {
        throw new TypeError(`${label} must be a plain object`);
    }
    return value;
}
