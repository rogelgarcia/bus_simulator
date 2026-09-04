// Orchestrates authenticated pinned-Blender AI 531 production static-sun packages.
// @ts-check

import { createHash } from 'node:crypto';
import {
    lstat,
    mkdir,
    readFile,
    readdir,
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
import { sha256Hex } from '../../../src/app/illumination/bake_source/Hashing.js';
import {
    ILLUMINATION_MAX_PACKAGE_BYTES,
    verifyIlluminationBinaryPackage
} from '../../../src/app/illumination/package/index.js';
import {
    createThreeR183DirectionalShadowFilterAxes
} from '../../../src/app/illumination/static_sun_depth/StaticSunDepthContract.js';
import { validateResolvedCityBakePackage } from '../../../src/graphics/illumination/bake_source/index.js';
import {
    STATIC_SUN_DEPTH_CASTER_SIDEDNESS
} from '../../../src/graphics/lighting/EffectiveShadowSide.js';
import {
    AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT,
    createAi531StaticSunLightProfiles
} from '../../illumination_bake_exporter/profile.mjs';
import {
    loadCompilerJson,
    validateCompilerProfile,
    validateToolchainContract
} from '../../illumination_bake_compiler/profile.mjs';
import {
    createIsolatedBlenderEnvironment
} from '../../illumination_bake_compiler/src/CompilerOrchestrator.mjs';
import { runBlenderProcess } from '../../illumination_bake_compiler/src/BlenderProcess.mjs';
import { verifyBlenderToolchain } from '../../illumination_bake_compiler/src/BlenderToolchain.mjs';
import {
    assertFileSnapshotsUnchanged,
    hashFileRaw,
    snapshotFiles
} from '../../illumination_bake_compiler/src/FileHashes.mjs';
import {
    buildProductionStaticSunDepthArtifact,
    validateProductionStaticSunDepthReceipt
} from './ProductionArtifact.mjs';
import { buildProductionStaticSunDepthPackage } from './ProductionPackage.mjs';
import {
    AI531_PRODUCTION_RELEASE_PROFILE_IDS,
    buildProductionProfileReleaseCertification,
    deriveProductionAlphaCutoutCoverageIdentity,
    validateProductionProfileReleaseCertification
} from './ProductionReleaseCertification.mjs';
import {
    authenticateProductionAlphaCutoutSpatialParityArtifactFiles,
    validateProductionAlphaCutoutSpatialParityArtifact
} from './ProductionAlphaCutoutParity.mjs';
import {
    assertCleanProductionNativeFieldReceipt
} from './ProductionProvenance.mjs';

export const PRODUCTION_STATIC_SUN_REQUEST_SCHEMA =
    'ai531-static-sun-production-request-v4';
export const PRODUCTION_STATIC_SUN_PACKAGE_INDEX_SCHEMA =
    'bus-sim-static-sun-depth-production-package-index-v1';
export const PRODUCTION_STATIC_SUN_PUBLICATION_SCHEMA =
    'bus-sim-static-sun-depth-production-publication-v1';
export const PRODUCTION_STATIC_SUN_CAPABILITY_PROFILE_ID = 'development.static_sun_v1';
export const PRODUCTION_STATIC_SUN_RECEIPT_STDOUT_PREFIX = 'AI531_PRODUCTION_RECEIPT=';
export const PRODUCTION_STATIC_SUN_EFFECTIVE_SHADOW_CAPABILITY = Object.freeze({
    id: 'three-r183-single-high-effective-16384-v1',
    mapSizeTexels: Object.freeze([16384, 16384]),
    worldExtentMeters: Object.freeze([680, 680])
});
export const PRODUCTION_STATIC_SUN_EFFECTIVE_FILTER_WORLD_RADIUS_METERS =
    0.062255859375;

const PRODUCTION_INPUT_IDENTITY_SCHEMA =
    'bus-sim-static-sun-depth-production-input-identity-v1';
const PRODUCTION_CERTIFICATION_SCHEMA =
    'bus-sim-static-sun-depth-production-certification-v1';
const PRODUCTION_METRICS_SCHEMA =
    'bus-sim-static-sun-depth-production-publication-metrics-v1';
const FINAL_FILE_HASH_DOMAIN = 'bus-simulator/illumination/bake-source/final-file/v1';
const EXPECTED_CITY_ID = 'bigcity2';
const EXPECTED_COMPILER_PROFILE_ID = 'ai529.proof.cycles_cpu.threads_12.v1';
const RECEIPT_FILE_NAME = 'production_static_sun_receipt.json';
const PACKAGE_FILE_NAME = 'static_sun_depth.ilpkg';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PROFILE_ID_PATTERN = /^ai527\.sun\.az\d{3}\.el\d{2}$/;
const SAFE_RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const REQUIRED_AI529_SCRIPTS = Object.freeze([
    'bsib.py',
    'canonical.py',
    'errors.py',
    'reconstruct.py',
    'scene.py'
]);
const REQUIRED_PUBLICATION_FILES = Object.freeze([
    'alpha_certification.json',
    'artifact_manifest.json',
    'certification.json',
    'descriptor.json',
    'input_identity.json',
    'metrics.json',
    'opaque_certification.json',
    'release_certification.json',
    PACKAGE_FILE_NAME,
    RECEIPT_FILE_NAME,
    'request.json',
    'static_sun_depth.rg8'
]);

/**
 * @typedef {{id: string, type: string, directionThree: readonly number[]}} StaticSunProfile
 */

/** @param {StaticSunProfile} profile */
export function createProductionStaticSunRequest(profile) {
    requireProfile(profile);
    const filterAxes = createThreeR183DirectionalShadowFilterAxes(profile.directionThree);
    return cloneCanonicalJson({
        boundsMarginMeters: 2,
        casterSidedness: STATIC_SUN_DEPTH_CASTER_SIDEDNESS,
        guardPixels: 4,
        interiorPixels: [...AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.interiorPixels],
        lightingProfileId: profile.id,
        maxPayloadBytes: ILLUMINATION_MAX_PACKAGE_BYTES,
        phasePolicy: AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.phasePolicy,
        sampling: {
            bias: {
                constantDepthReliefMeters: 0.0697915,
                geometricNormalOffsetMeters: 0.0232,
                model: 'geometric-normal-offset-plus-constant-depth-relief-v1'
            },
            pcf: {
                hardwareComparison: 'linear-four-compare-taps-v1',
                model: 'three-r183-vogel-5-linear-compare-v1',
                radiusTexels: 1.5,
                sampleCount: 5,
                screenRotation: 'interleaved-gradient-noise-gl-fragcoord-v1',
                shadowMapSizeTexels: [
                    ...PRODUCTION_STATIC_SUN_EFFECTIVE_SHADOW_CAPABILITY.mapSizeTexels
                ],
                shadowMapWorldExtentMeters: [
                    ...PRODUCTION_STATIC_SUN_EFFECTIVE_SHADOW_CAPABILITY.worldExtentMeters
                ],
                sourceMapRightAxisWorld: [...filterAxes.rightAxisWorld],
                sourceMapUpAxisWorld: [...filterAxes.upAxisWorld]
            }
        },
        schema: PRODUCTION_STATIC_SUN_REQUEST_SCHEMA,
        sourceShadowCapability: {
            id: PRODUCTION_STATIC_SUN_EFFECTIVE_SHADOW_CAPABILITY.id,
            mapSizeTexels: [
                ...PRODUCTION_STATIC_SUN_EFFECTIVE_SHADOW_CAPABILITY.mapSizeTexels
            ],
            worldExtentMeters: [
                ...PRODUCTION_STATIC_SUN_EFFECTIVE_SHADOW_CAPABILITY.worldExtentMeters
            ]
        },
        sunPointDirectionWorld: [...profile.directionThree],
        texelSizeMeters: AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.texelSizeMeters,
        tileSizeMeters: [...AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.tileSizeMeters]
    });
}

/** @param {readonly string[] | undefined} selectedIds */
export function selectProductionStaticSunProfiles(selectedIds) {
    const profiles = createAi531StaticSunLightProfiles().filter((profile) =>
        AI531_PRODUCTION_RELEASE_PROFILE_IDS.includes(profile.id));
    if (selectedIds === undefined) return Object.freeze(profiles);
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
        throw new TypeError('profiles must be a non-empty array when specified');
    }
    const selected = new Set();
    for (const id of selectedIds) {
        if (typeof id !== 'string' || !PROFILE_ID_PATTERN.test(id)) {
            throw new TypeError(`Invalid AI531 lighting profile ID '${String(id)}'`);
        }
        if (selected.has(id)) throw new TypeError(`Duplicate AI531 lighting profile ID '${id}'`);
        selected.add(id);
    }
    const unknown = [...selected].filter((id) => !profiles.some((profile) => profile.id === id));
    if (unknown.length > 0) {
        throw new Error(`Unknown AI531 lighting profile IDs: ${unknown.join(', ')}`);
    }
    return Object.freeze(profiles.filter((profile) => selected.has(profile.id)));
}

/** @param {string} stdout */
export function parseProductionReceiptStdoutDescriptor(stdout) {
    if (typeof stdout !== 'string') throw new TypeError('Blender stdout must be a string');
    const matches = stdout.split(/\r?\n/u)
        .filter((line) => line.startsWith(PRODUCTION_STATIC_SUN_RECEIPT_STDOUT_PREFIX));
    if (matches.length !== 1) {
        throw new Error(
            `Blender stdout must contain exactly one ${PRODUCTION_STATIC_SUN_RECEIPT_STDOUT_PREFIX} descriptor`
        );
    }
    const text = matches[0].slice(PRODUCTION_STATIC_SUN_RECEIPT_STDOUT_PREFIX.length);
    let descriptor;
    try {
        descriptor = JSON.parse(text);
    } catch (error) {
        throw new Error('Blender receipt stdout descriptor is not valid JSON', { cause: error });
    }
    requireExactKeys(
        descriptor,
        ['byteLength', 'path', 'sha256'],
        'Blender stdout receipt descriptor'
    );
    if (canonicalJsonStringify(descriptor) !== text) {
        throw new Error('Blender receipt stdout descriptor is not canonical JSON');
    }
    requirePositiveInteger(descriptor.byteLength, 'Blender stdout receipt byteLength');
    requireSha256(descriptor.sha256, 'Blender stdout receipt sha256');
    if (descriptor.path !== RECEIPT_FILE_NAME) {
        throw new Error(`Blender stdout receipt path must be '${RECEIPT_FILE_NAME}'`);
    }
    return cloneCanonicalJson(descriptor);
}

/** @param {Record<string, any>} manifest */
export function deriveProductionSourceIdentityHashes(manifest) {
    requirePlainObject(manifest, 'validated source manifest');
    for (const key of ['casterMappings', 'materials', 'alphaInputs', 'textures']) {
        if (!Array.isArray(manifest[key])) {
            throw new TypeError(`validated source manifest.${key} must be an array`);
        }
    }
    const selected = manifest.casterMappings
        .filter((entry) => entry?.channelRelevance?.static_sun_depth === true)
        .map((entry) => cloneCanonicalJson(entry))
        .sort((left, right) => compareCanonicalStrings(left.id, right.id));
    const selectedMaterialIds = new Set(selected.map((entry) => entry.materialId));
    const selectedAlphaIds = new Set(selected.map((entry) => entry.alphaInputId));
    const materials = manifest.materials
        .filter((entry) => selectedMaterialIds.has(entry.id))
        .map((entry) => {
            if (typeof entry.preserveShadowSide !== 'boolean'
                || typeof entry.isFoliage !== 'boolean') {
                throw new TypeError(
                    `validated material '`
                    + String(entry.id)
                    + `' must carry explicit V2 shadow-side booleans`
                );
            }
            return {
                alpha: entry.alpha,
                alphaInputId: entry.alphaInputId,
                id: entry.id,
                shadowSide: entry.shadowSide,
                side: entry.side,
                preserveShadowSide: entry.preserveShadowSide,
                isFoliage: entry.isFoliage,
                vertexColors: entry.vertexColors
            };
        })
        .sort((left, right) => compareCanonicalStrings(left.id, right.id));
    const alphaInputs = manifest.alphaInputs
        .filter((entry) => selectedAlphaIds.has(entry.id))
        .map((entry) => cloneCanonicalJson(entry))
        .sort((left, right) => compareCanonicalStrings(left.id, right.id));
    const bindingIds = new Set(alphaInputs.flatMap((entry) =>
        (entry.alpha?.inputs ?? []).map((input) => input.bindingId)));
    const bindings = manifest.textures
        .filter((entry) => bindingIds.has(entry.id))
        .map((entry) => cloneCanonicalJson(entry))
        .sort((left, right) => compareCanonicalStrings(left.id, right.id));
    const sourceIds = new Set(bindings.map((entry) => entry.sourceId));
    const sources = manifest.textures
        .filter((entry) => sourceIds.has(entry.id))
        .map((entry) => ({
            contentSha256: entry.contentSha256,
            coverageChannels: entry.coverageChannels,
            id: entry.id
        }))
        .sort((left, right) => compareCanonicalStrings(left.id, right.id));
    return cloneCanonicalJson({
        alphaSemanticsSha256: rawCanonicalSha256({
            alphaInputs,
            bindings,
            materials,
            schema: 'ai531-static-sun-alpha-semantics-projection-v2',
            sources
        }),
        casterInventorySha256: rawCanonicalSha256({
            channelId: 'static_sun_depth',
            mappings: selected,
            schema: 'ai531-static-sun-caster-inventory-projection-v2'
        })
    });
}

/** @param {readonly Readonly<Record<string, any>>[]} entries */
export function buildProductionPackageIndex(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new TypeError('Production package index requires at least one profile entry');
    }
    const profiles = {};
    const sorted = [...entries].sort((left, right) =>
        compareCanonicalStrings(left.lightingProfileId, right.lightingProfileId));
    for (const entry of sorted) {
        requireExactKeys(
            entry,
            ['lightingProfileId', 'liveIdentity', 'packagePath'],
            'package index source entry'
        );
        if (!PROFILE_ID_PATTERN.test(entry.lightingProfileId) || profiles[entry.lightingProfileId]) {
            throw new TypeError(
                `Invalid or duplicate package index profile '${entry.lightingProfileId}'`
            );
        }
        validateLiveIdentity(entry.liveIdentity, entry.lightingProfileId);
        requireCanonicalPackagePath(entry.packagePath);
        profiles[entry.lightingProfileId] = {
            liveIdentity: entry.liveIdentity,
            packagePath: entry.packagePath
        };
    }
    return cloneCanonicalJson({
        profiles,
        schema: PRODUCTION_STATIC_SUN_PACKAGE_INDEX_SCHEMA
    });
}

/**
 * @param {Record<string, any>} options
 * @param {Record<string, any>} [deps]
 */
export async function orchestrateProductionStaticSunDepth(options, deps = {}) {
    const normalized = normalizeOrchestrationOptions(options);
    const prepareAuthorityFn = deps.prepareAuthorityFn ?? prepareProductionAuthority;
    const executeProfileFn = deps.executeProfileFn ?? executeProductionProfile;
    const loadExistingProfileFn = deps.loadExistingProfileFn ?? loadExistingProductionProfile;
    const publishIndexFn = deps.publishIndexFn ?? publishProductionPackageIndex;
    const onProfileCompleteFn = deps.onProfileCompleteFn ?? (() => {});
    const authority = await prepareAuthorityFn(normalized, deps);
    const selectedProfiles = selectProductionStaticSunProfiles(normalized.profiles);
    const selectedIds = new Set(selectedProfiles.map((entry) => entry.id));
    const entries = [];
    const results = [];
    for (const profile of selectProductionStaticSunProfiles()) {
        let result = null;
        if (selectedIds.has(profile.id)) {
            const repeatResults = [];
            for (let repeatIndex = 1; repeatIndex <= normalized.repeat; repeatIndex += 1) {
                result = await executeProfileFn({
                    authority,
                    options: normalized,
                    profile,
                    repeatCount: normalized.repeat,
                    repeatIndex
                }, deps);
                repeatResults.push(result);
            }
            result = Object.freeze({
                ...result,
                repeat: normalized.repeat,
                repeatResults: Object.freeze(repeatResults)
            });
        } else {
            result = await loadExistingProfileFn({ authority, options: normalized, profile }, deps);
        }
        if (!result) continue;
        const entry = normalizeProfileResult(result, profile.id);
        entries.push(entry);
        results.push(result);
        await onProfileCompleteFn(Object.freeze({entry, profile, result}));
    }
    if (entries.length === 0) {
        throw new Error('No production static-sun packages were published or resumed');
    }
    const packageIndex = buildProductionPackageIndex(entries);
    const packageIndexPath = path.join(normalized.artifactRoot, 'package_index.json');
    await publishIndexFn(packageIndexPath, packageIndex, deps);
    return Object.freeze({
        packageIndex,
        packageIndexPath,
        profiles: Object.freeze(results),
        selectedProfileIds: Object.freeze(selectedProfiles.map((entry) => entry.id))
    });
}

/**
 * @param {Record<string, any>} options
 * @param {Record<string, any>} [deps]
 */
export async function prepareProductionAuthority(options, deps = {}) {
    const readFileFn = deps.readFileFn ?? readFile;
    const readdirFn = deps.readdirFn ?? readdir;
    const snapshotFilesFn = deps.snapshotFilesFn ?? snapshotFiles;
    const loadJsonFn = deps.loadJsonFn ?? loadCompilerJson;
    const verifyToolchainFn = deps.verifyToolchainFn ?? verifyBlenderToolchain;
    const validateSourcePackageFn = deps.validateSourcePackageFn
        ?? validateResolvedCityBakePackage;
    const ai529Directory = path.resolve(options.ai529Directory);
    const scriptEntries = await readdirFn(ai529Directory, { withFileTypes: true });
    const scriptNames = scriptEntries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.py'))
        .map((entry) => entry.name)
        .sort(compareCanonicalStrings);
    for (const required of REQUIRED_AI529_SCRIPTS) {
        if (!scriptNames.includes(required)) {
            throw new Error(`AI529 script inventory is missing '${required}'`);
        }
    }
    const snapshotInputs = [
        { id: 'input:package', filePath: options.inputPath },
        { id: 'input:profile', filePath: options.profilePath },
        { id: 'input:renderer', filePath: options.rendererPath },
        { id: 'input:toolchain', filePath: options.toolchainPath },
        ...scriptNames.map((name) => ({
            id: `script:ai529/${name}`,
            filePath: path.join(ai529Directory, name)
        }))
    ];
    const snapshots = await snapshotFilesFn(snapshotInputs);
    const snapshotById = new Map(snapshots.map((entry) => [entry.id, entry]));
    const packageSnapshot = requireSnapshot(snapshotById, 'input:package');
    const profileSnapshot = requireSnapshot(snapshotById, 'input:profile');
    const rendererSnapshot = requireSnapshot(snapshotById, 'input:renderer');
    const toolchainSnapshot = requireSnapshot(snapshotById, 'input:toolchain');
    const ai529ScriptInventory = scriptNames.map((name) => {
        const snapshot = requireSnapshot(snapshotById, `script:ai529/${name}`);
        return cloneCanonicalJson({
            byteLength: snapshot.byteLength,
            path: name,
            sha256: snapshot.sha256
        });
    });
    const ai529ScriptSha256 = rawCanonicalSha256(ai529ScriptInventory);
    const toolchain = validateToolchainContract(await loadJsonFn(options.toolchainPath));
    const compilerProfile = validateCompilerProfile(await loadJsonFn(options.profilePath));
    if (compilerProfile.id !== EXPECTED_COMPILER_PROFILE_ID
        || compilerProfile.backend?.threads !== 12
        || compilerProfile.backend?.cyclesDevice !== 'CPU'
        || compilerProfile.backend?.gpuAllowed !== false) {
        throw new Error(
            `Production static-sun rendering requires '${EXPECTED_COMPILER_PROFILE_ID}'`
        );
    }
    const verifiedToolchain = await verifyToolchainFn({
        archivePath: options.archivePath,
        executablePath: options.executablePath,
        contract: toolchain
    });
    const packageValue = await readFileFn(options.inputPath);
    const packageBytes = copyBytes(packageValue, 'AI531 source package');
    const packageRawSha256 = rawSha256(packageBytes);
    if (packageRawSha256 !== packageSnapshot.sha256
        || packageBytes.byteLength !== packageSnapshot.byteLength) {
        throw new Error('AI531 source package changed after its authoritative snapshot');
    }
    const finalFileDomainSha256 = await sha256Hex(FINAL_FILE_HASH_DOMAIN, packageBytes);
    const validated = await validateSourcePackageFn(packageBytes);
    if (!validated?.manifest || validated?.report?.valid !== true) {
        throw new Error('AI531 source package semantic validation did not pass');
    }
    const manifest = validated.manifest;
    validateManifestAuthority(manifest, toolchain);
    const sourceIdentityHashes = deriveProductionSourceIdentityHashes(manifest);
    const cityId = manifest.source.cityId;
    if (cityId !== EXPECTED_CITY_ID) {
        throw new Error(`Production validation source city must be '${EXPECTED_CITY_ID}'`);
    }
    const channelProfileSha256 = getNamedHash(
        manifest.hashes.channels,
        'static_sun_depth',
        'hashes.channels'
    );
    const channelSourceSha256 = getNamedHash(
        manifest.hashes.channelSources,
        'static_sun_depth',
        'hashes.channelSources'
    );
    validateManifestSunProfiles(manifest);
    return Object.freeze({
        ai529Directory,
        ai529ScriptInventory: Object.freeze(ai529ScriptInventory),
        ai529ScriptSha256,
        channelProfileSha256,
        channelSourceSha256,
        cityId,
        compilerProfile: cloneCanonicalJson(compilerProfile),
        finalFileDomainSha256,
        manifest: cloneCanonicalJson(manifest),
        packageRawSha256,
        snapshots: Object.freeze(snapshots),
        snapshotInputs: Object.freeze(snapshotInputs),
        sourceIdentityHashes,
        sourcePackageHashes: cloneCanonicalJson({
            geometrySha256: manifest.hashes.geometry,
            resolvedSourceSha256: manifest.hashes.resolvedSource,
            usedMaterialsSha256: manifest.hashes.usedMaterials
        }),
        sourceValidationReport: cloneCanonicalJson(validated.report),
        verifiedToolchain,
        toolchain: cloneCanonicalJson(toolchain),
        profileSha256: profileSnapshot.sha256,
        rendererScriptSha256: rendererSnapshot.sha256,
        toolchainSha256: toolchainSnapshot.sha256,
        packageSnapshot
    });
}

/**
 * @param {{authority: Record<string, any>, options: Record<string, any>, profile: StaticSunProfile}} context
 * @param {Record<string, any>} [deps]
 */
export async function executeProductionProfile(context, deps = {}) {
    const request = createProductionStaticSunRequest(context.profile);
    const inputIdentity = createProductionInputIdentity(context.authority, request);
    const finalPath = productionProfilePath(
        context.options.artifactRoot,
        context.profile.id
    );
    const repeatIndex = context.repeatIndex ?? 1;
    const existing = await loadExistingProductionProfile(
        context,
        deps,
        { inputIdentity, finalPath }
    );
    if (existing && repeatIndex === 1) return existing;
    if (!existing && repeatIndex > 1) {
        throw new Error('A repeat verification run requires an authenticated promoted baseline');
    }
    const mkdirFn = deps.mkdirFn ?? mkdir;
    const writeFileFn = deps.writeFileFn ?? writeFile;
    const readFileFn = deps.readFileFn ?? readFile;
    const renameFn = deps.renameFn ?? rename;
    const rmFn = deps.rmFn ?? rm;
    const runBlenderFn = deps.runBlenderFn ?? runBlenderProcess;
    const hashFileFn = deps.hashFileFn ?? hashFileRaw;
    const snapshotFilesFn = deps.snapshotFilesFn ?? snapshotFiles;
    const assertSnapshotsFn = deps.assertSnapshotsFn ?? assertFileSnapshotsUnchanged;
    const buildArtifactFn = deps.buildArtifactFn ?? buildProductionStaticSunDepthArtifact;
    const buildPackageFn = deps.buildPackageFn ?? buildProductionStaticSunDepthPackage;
    const alphaParity = await loadProductionAlphaParityArtifact(context, {
        ...deps,
        lstatFn: deps.lstatFn ?? lstat,
        readFileFn
    });
    const nativeCutoutField = await loadProductionNativeCutoutField(context, {
        ...deps,
        hashFileFn,
        lstatFn: deps.lstatFn ?? lstat,
        readFileFn
    });
    const runId = `${safeProfileDirectory(context.profile.id)}-${process.pid}-${Date.now()}`;
    if (!SAFE_RUN_ID_PATTERN.test(runId)) throw new Error('Generated staging run ID is unsafe');
    const stagingParent = path.join(context.options.artifactRoot, '.staging');
    const stagingRoot = path.join(stagingParent, runId);
    const outputRoot = path.join(stagingRoot, 'output');
    const requestPath = path.join(stagingRoot, 'request.json');
    await mkdirFn(stagingParent, { recursive: true });
    await mkdirFn(stagingRoot, { recursive: false });
    try {
        const requestBytes = canonicalJsonBytes(request);
        await writeFileFn(requestPath, requestBytes);
        const isolated = createIsolatedBlenderEnvironment({
            stagingPath: stagingRoot,
            executablePath: context.options.executablePath
        });
        for (const directory of isolated.directories) {
            await mkdirFn(directory, { recursive: true });
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
                ...(alphaParity ? [
                    '--alpha-parity-artifact',
                    compilerFilesystemPath(alphaParity.path),
                    '--alpha-parity-artifact-sha256',
                    alphaParity.sha256
                ] : []),
                '--native-cutout-field-receipt',
                compilerFilesystemPath(nativeCutoutField.path),
                '--native-cutout-field-receipt-sha256',
                nativeCutoutField.sha256,
                '--output-encoding', 'rg8',
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
            'Blender production receipt'
        );
        if (receiptBytes.byteLength !== stdoutDescriptor.byteLength
            || rawSha256(receiptBytes) !== stdoutDescriptor.sha256) {
            throw new Error(
                'Blender receipt bytes do not match the authenticated stdout descriptor'
            );
        }
        const receipt = parseCanonicalJsonBytes(
            receiptBytes,
            'Blender production receipt'
        );
        const validatedReceipt = validateProductionStaticSunDepthReceipt(receipt);
        if (validatedReceipt.alphaCertification.nativeCutoutField.receiptSha256
                !== nativeCutoutField.sha256) {
            throw new Error(
                'Blender receipt native cutout field differs from the authenticated orchestration input'
            );
        }
        if (alphaParity && canonicalJsonStringify(
            validatedReceipt.alphaCertification.spatialParityArtifact
        ) !== canonicalJsonStringify(alphaParity.artifact)) {
            throw new Error(
                'Blender receipt alpha parity artifact differs from the authenticated orchestration input'
            );
        }
        if (alphaParity) {
            const refreshedAlphaParity = await loadProductionAlphaParityArtifact(
                context,
                {lstatFn: deps.lstatFn ?? lstat, readFileFn}
            );
            if (refreshedAlphaParity.sha256 !== alphaParity.sha256
                || canonicalJsonStringify(refreshedAlphaParity.artifact)
                    !== canonicalJsonStringify(alphaParity.artifact)) {
                throw new Error(
                    'Authenticated alpha parity artifact or evidence changed during production rendering'
                );
            }
        }
        const refreshedNativeCutoutField = await loadProductionNativeCutoutField(
            context,
            {
                ...deps,
                hashFileFn,
                lstatFn: deps.lstatFn ?? lstat,
                readFileFn
            }
        );
        if (refreshedNativeCutoutField.sha256 !== nativeCutoutField.sha256
            || refreshedNativeCutoutField.outputProjectionSha256
                !== nativeCutoutField.outputProjectionSha256) {
            throw new Error(
                'Authenticated native cutout receipt or tile field changed during production rendering'
            );
        }
        authenticateProductionStaticSunDepthReceipt(
            validatedReceipt,
            context.authority,
            request
        );
        const interiorTiles = await readAuthenticatedProductionStaticSunDepthInteriors(
            outputRoot,
            validatedReceipt.outputs,
            readFileFn
        );
        const artifact = buildArtifactFn({
            receipt: validatedReceipt,
            interiorTiles
        });
        if (alphaParity
            && alphaParity.artifact.descriptorSha256
                !== rawCanonicalSha256(artifact.descriptor)) {
            throw new Error(
                'Authenticated alpha parity artifact differs from the freshly rendered production descriptor'
            );
        }
        const source = createProductionPackageSource(validatedReceipt);
        const packaged = await buildPackageFn({
            channelProfileSha256: context.authority.channelProfileSha256,
            cityId: validatedReceipt.identity.cityId,
            compilerDescriptor: validatedReceipt.compilerDescriptor,
            descriptor: artifact.descriptor,
            lightingProfileId: context.profile.id,
            payload: artifact.payload,
            selectedCapabilityProfileId: PRODUCTION_STATIC_SUN_CAPABILITY_PROFILE_ID,
            source
        });
        const liveIdentity = createProductionLiveIdentity(
            validatedReceipt,
            context.profile.id
        );
        const packagePath = repositoryRelativePackagePath(
            context.options.repoRoot,
            path.join(finalPath, PACKAGE_FILE_NAME)
        );
        const releaseCertification = buildProductionProfileReleaseCertification({
            descriptor: artifact.descriptor,
            manifest: context.authority.manifest,
            packageAggregateSha256: packaged.aggregateSha256,
            packagePath,
            receipt: validatedReceipt,
            receiptSha256: stdoutDescriptor.sha256,
            sourceValidationReport: context.authority.sourceValidationReport
        });
        const certification = createCertification(validatedReceipt, artifact);
        const metrics = cloneCanonicalJson({
            artifact: artifact.metrics,
            package: packaged.buildMetrics,
            performance: {
                reason: 'host-load-and-gpu-contention-declared-by-user',
                status: 'not_measured'
            },
            schema: PRODUCTION_METRICS_SCHEMA
        });
        await Promise.all([
            writeCanonicalJson(
                path.join(outputRoot, 'alpha_certification.json'),
                validatedReceipt.alphaCertification,
                writeFileFn
            ),
            writeCanonicalJson(
                path.join(outputRoot, 'artifact_manifest.json'),
                artifact.artifactManifest,
                writeFileFn
            ),
            writeCanonicalJson(
                path.join(outputRoot, 'certification.json'),
                certification,
                writeFileFn
            ),
            writeCanonicalJson(
                path.join(outputRoot, 'descriptor.json'),
                artifact.descriptor,
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
                validatedReceipt.opaqueCertification,
                writeFileFn
            ),
            writeCanonicalJson(
                path.join(outputRoot, 'request.json'),
                request,
                writeFileFn
            ),
            writeCanonicalJson(
                path.join(outputRoot, 'release_certification.json'),
                releaseCertification,
                writeFileFn
            ),
            writeFileFn(path.join(outputRoot, PACKAGE_FILE_NAME), packaged.bytes),
            writeFileFn(
                path.join(outputRoot, 'static_sun_depth.rg8'),
                artifact.payload
            )
        ]);
        await rmFn(isolated.runtimeRoot, { recursive: true, force: true });
        const actualSnapshots = await snapshotFilesFn(context.authority.snapshotInputs);
        assertSnapshotsFn(context.authority.snapshots, actualSnapshots, {
            code: 'production_inputs_stale',
            label: 'Production source, profile, renderer, toolchain, or AI529 scripts'
        });
        const publicationPaths = [
            ...REQUIRED_PUBLICATION_FILES,
            ...validatedReceipt.outputs.map((output) => output.path)
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
            schema: PRODUCTION_STATIC_SUN_PUBLICATION_SCHEMA,
            status: 'complete'
        });
        await writeCanonicalJson(
            path.join(outputRoot, 'publication.json'),
            publication,
            writeFileFn
        );
        if (repeatIndex > 1) {
            assertRepeatPublicationIdentical(
                existing.publication,
                publication,
                validatedReceipt.outputs.map((output) => output.path)
            );
            return Object.freeze({
                ...existing,
                repeatIndex,
                repeatVerified: true
            });
        }
        await assertPathAbsent(finalPath, deps.lstatFn ?? lstat);
        await mkdirFn(path.dirname(finalPath), { recursive: true });
        await renameFn(outputRoot, finalPath);
        return Object.freeze({
            ...packageIndexEntry,
            finalPath,
            publication,
            resumed: false
        });
    } finally {
        await rmFn(stagingRoot, { recursive: true, force: true });
    }
}

/**
 * @param {{authority: Record<string, any>, options: Record<string, any>, profile: StaticSunProfile}} context
 * @param {Record<string, any>} [deps]
 * @param {{inputIdentity?: Record<string, any>, finalPath?: string}} [prepared]
 */
export async function loadExistingProductionProfile(
    context,
    deps = {},
    prepared = {}
) {
    const finalPath = prepared.finalPath
        ?? productionProfilePath(context.options.artifactRoot, context.profile.id);
    const lstatFn = deps.lstatFn ?? lstat;
    try {
        const entry = await lstatFn(finalPath);
        if (!entry.isDirectory()) {
            throw new Error(`Existing production path is not a directory: ${finalPath}`);
        }
    } catch (error) {
        if (isMissing(error)) return null;
        throw error;
    }
    const readFileFn = deps.readFileFn ?? readFile;
    const hashFileFn = deps.hashFileFn ?? hashFileRaw;
    const verifyPackageFn = deps.verifyPackageFn ?? verifyIlluminationBinaryPackage;
    const inputIdentity = prepared.inputIdentity ?? createProductionInputIdentity(
        context.authority,
        createProductionStaticSunRequest(context.profile)
    );
    const publication = parseCanonicalJsonBytes(
        copyBytes(
            await readFileFn(path.join(finalPath, 'publication.json')),
            'production publication'
        ),
        'production publication'
    );
    validatePublication(
        publication,
        context.profile.id,
        rawCanonicalSha256(inputIdentity)
    );
    for (const file of publication.files) {
        const hashed = await hashFileFn(
            resolvePublishedPath(finalPath, file.path)
        );
        if (hashed.byteLength !== file.byteLength || hashed.sha256 !== file.sha256) {
            throw new Error(
                `Existing publication file '${file.path}' failed its authenticated digest`
            );
        }
    }
    const receipt = validateProductionStaticSunDepthReceipt(
        parseCanonicalJsonBytes(
            copyBytes(
                await readFileFn(path.join(finalPath, RECEIPT_FILE_NAME)),
                'existing receipt'
            ),
            'existing Blender production receipt'
        )
    );
    const request = createProductionStaticSunRequest(context.profile);
    authenticateProductionStaticSunDepthReceipt(
        receipt,
        context.authority,
        request
    );
    await readAuthenticatedProductionStaticSunDepthInteriors(
        finalPath,
        receipt.outputs,
        readFileFn
    );
    const liveIdentity = createProductionLiveIdentity(
        receipt,
        context.profile.id
    );
    if (canonicalJsonStringify(liveIdentity)
        !== canonicalJsonStringify(publication.packageIndexEntry.liveIdentity)) {
        throw new Error(
            'Existing publication live identity differs from its authenticated receipt'
        );
    }
    const releaseCertification = validateProductionProfileReleaseCertification(
        parseCanonicalJsonBytes(
            copyBytes(
                await readFileFn(path.join(finalPath, 'release_certification.json')),
                'existing release certification'
            ),
            'existing release certification'
        ),
        {
            lightingProfileId: context.profile.id,
            liveIdentity,
            packagePath: publication.packageIndexEntry.packagePath
        }
    );
    const publicationFiles = new Map(
        publication.files.map((entry) => [entry.path, entry])
    );
    const descriptor = parseCanonicalJsonBytes(
        copyBytes(
            await readFileFn(path.join(finalPath, 'descriptor.json')),
            'existing production descriptor'
        ),
        'existing production descriptor'
    );
    const nativeCutoutField = await loadProductionNativeCutoutField(
        context,
        {hashFileFn, lstatFn, readFileFn}
    );
    if (receipt.alphaCertification.nativeCutoutField.receiptSha256
            !== nativeCutoutField.sha256
        || receipt.alphaCertification.nativeCutoutField.outputProjectionSha256
            !== nativeCutoutField.outputProjectionSha256) {
        throw new Error(
            'Existing production profile differs from the configured authenticated native cutout field'
        );
    }
    if (context.options.alphaParityRoot !== undefined) {
        const alphaParity = await loadProductionAlphaParityArtifact(
            context,
            {lstatFn, readFileFn}
        );
        if (canonicalJsonStringify(
            receipt.alphaCertification.spatialParityArtifact
        ) !== canonicalJsonStringify(alphaParity.artifact)
            || alphaParity.artifact.descriptorSha256
                !== rawCanonicalSha256(descriptor)) {
            throw new Error(
                'Existing production profile differs from the configured authenticated alpha parity artifact'
            );
        }
    }
    const expectedReleaseCertification = buildProductionProfileReleaseCertification({
        descriptor,
        manifest: context.authority.manifest,
        packageAggregateSha256: publication.packageAggregateSha256,
        packagePath: publication.packageIndexEntry.packagePath,
        receipt,
        receiptSha256: publicationFiles.get(RECEIPT_FILE_NAME)?.sha256,
        sourceValidationReport: context.authority.sourceValidationReport
    });
    if (releaseCertification.receiptSha256
            !== publicationFiles.get(RECEIPT_FILE_NAME)?.sha256
        || releaseCertification.descriptorSha256
            !== publicationFiles.get('descriptor.json')?.sha256
        || releaseCertification.packageAggregateSha256
            !== publication.packageAggregateSha256
        || releaseCertification.compilerSignatureSha256
            !== receipt.compilerSignatureSha256
        || releaseCertification.source.sourceValidationReportSha256
            !== rawCanonicalSha256(context.authority.sourceValidationReport)
        || canonicalJsonStringify(releaseCertification)
            !== canonicalJsonStringify(expectedReleaseCertification)) {
        throw new Error(
            'Existing release certification differs from its authenticated receipt, source, descriptor, or package'
        );
    }
    const packageBytes = copyBytes(
        await readFileFn(path.join(finalPath, PACKAGE_FILE_NAME)),
        'existing production package'
    );
    const verified = await verifyPackageFn(packageBytes, {
        expectations: {
            aggregateSha256: publication.packageAggregateSha256,
            cityId: liveIdentity.cityId,
            lightingProfileId: liveIdentity.lightingProfileId,
            resolvedSourceSha256: liveIdentity.resolvedSourceSha256,
            selectedCapabilityProfileId: PRODUCTION_STATIC_SUN_CAPABILITY_PROFILE_ID,
            staticSunDepthSourceSha256: liveIdentity.staticSunDepthSourceSha256
        }
    });
    if (verified.compatibility?.compatible !== true) {
        throw new Error('Existing production package is not runtime compatible');
    }
    return Object.freeze({
        ...publication.packageIndexEntry,
        finalPath,
        publication,
        resumed: true
    });
}

/**
 * @param {string} packageIndexPath
 * @param {unknown} packageIndex
 * @param {Record<string, any>} [deps]
 */
export async function publishProductionPackageIndex(
    packageIndexPath,
    packageIndex,
    deps = {}
) {
    const mkdirFn = deps.mkdirFn ?? mkdir;
    const writeFileFn = deps.writeFileFn ?? writeFile;
    const renameFn = deps.renameFn ?? rename;
    await mkdirFn(path.dirname(packageIndexPath), { recursive: true });
    const temporaryPath = `${packageIndexPath}.partial-${process.pid}-${Date.now()}`;
    await writeCanonicalJson(temporaryPath, packageIndex, writeFileFn);
    await renameFn(temporaryPath, packageIndexPath);
}

function normalizeOrchestrationOptions(options) {
    requirePlainObject(options, 'Production orchestration options');
    const requiredPaths = [
        'ai529Directory',
        'archivePath',
        'artifactRoot',
        'executablePath',
        'inputPath',
        'nativeCutoutRoot',
        'profilePath',
        'rendererPath',
        'repoRoot',
        'toolchainPath'
    ];
    const normalized = {};
    for (const key of requiredPaths) {
        if (typeof options[key] !== 'string' || !options[key]) {
            throw new TypeError(
                `Production orchestration option '${key}' must be a path`
            );
        }
        normalized[key] = path.resolve(options[key]);
    }
    const expectedAssetAuthority = path.join(
        normalized.repoRoot,
        'assets',
        'baked_lighting',
        'shadows'
    );
    const expectedEvidenceAuthority = path.join(
        normalized.repoRoot,
        'tests',
        'artifacts',
        'illumination_531'
    );
    if (!isPathInside(expectedAssetAuthority, normalized.artifactRoot, true)) {
        throw new Error(
            'artifactRoot must remain below assets/baked_lighting/shadows'
        );
    }
    if (!isPathInside(
        expectedEvidenceAuthority,
        normalized.nativeCutoutRoot,
        false
    )) {
        throw new Error(
            'nativeCutoutRoot must be a named child below tests/artifacts/illumination_531'
        );
    }
    if (options.alphaParityRoot !== undefined) {
        if (typeof options.alphaParityRoot !== 'string'
            || !options.alphaParityRoot) {
            throw new TypeError(
                "Production orchestration option 'alphaParityRoot' must be a path"
            );
        }
        normalized.alphaParityRoot = path.resolve(options.alphaParityRoot);
        if (!isPathInside(
            expectedEvidenceAuthority,
            normalized.alphaParityRoot,
            false
        )) {
            throw new Error(
                'alphaParityRoot must be a named child below tests/artifacts/illumination_531'
            );
        }
    }
    normalized.timeoutMs = options.timeoutMs ?? 21_600_000;
    normalized.rowStripPixels = options.rowStripPixels
        ?? AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.interiorPixels[1];
    normalized.repeat = options.repeat ?? 1;
    requirePositiveInteger(normalized.timeoutMs, 'timeoutMs');
    requirePositiveInteger(normalized.rowStripPixels, 'rowStripPixels');
    requirePositiveInteger(normalized.repeat, 'repeat');
    if (normalized.rowStripPixels
        !== AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.interiorPixels[1]) {
        throw new RangeError(
            'rowStripPixels must equal the rectangular tile interior height for production'
        );
    }
    normalized.profiles = options.profiles === undefined
        ? undefined
        : [...options.profiles];
    if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) {
        throw new TypeError('signal must be an AbortSignal');
    }
    normalized.signal = options.signal;
    return Object.freeze(normalized);
}

export async function loadProductionAlphaParityArtifact(context, deps = {}) {
    const root = context.options.alphaParityRoot;
    if (root === undefined) return null;
    const readFileFn = deps.readFileFn ?? readFile;
    const lstatFn = deps.lstatFn ?? lstat;
    const artifactPath = path.join(
        root,
        safeProfileDirectory(context.profile.id),
        'spatial_parity_artifact.json'
    );
    if (!isPathInside(root, artifactPath, false)) {
        throw new Error('Alpha parity artifact path escaped its configured root');
    }
    const entry = await lstatFn(artifactPath);
    if (entry?.isSymbolicLink?.() === true) {
        throw new Error('Alpha parity artifact must not be a symbolic link');
    }
    const bytes = copyBytes(
        await readFileFn(artifactPath),
        'production alpha parity artifact'
    );
    const parsed = parseCanonicalJsonBytes(
        bytes,
        'production alpha parity artifact'
    );
    const artifact = await authenticateProductionAlphaCutoutSpatialParityArtifactFiles(
        parsed,
        {
            authorityRoot: root,
            repoRoot: context.options.repoRoot
        },
        {lstatFn, readFileFn}
    );
    const coverage = deriveProductionAlphaCutoutCoverageIdentity(
        context.authority.manifest
    );
    const validated = validateProductionAlphaCutoutSpatialParityArtifact(
        artifact,
        {
            alphaSemanticsSha256:
                context.authority.sourceIdentityHashes.alphaSemanticsSha256,
            casterInventorySha256:
                context.authority.sourceIdentityHashes.casterInventorySha256,
            cutoutBindingProjectionSha256:
                coverage.cutoutBindingProjectionSha256,
            cutoutCasterCount: coverage.cutoutCasterCount,
            cutoutCasterIdsSha256: coverage.cutoutCasterIdsSha256,
            lightingProfileId: context.profile.id,
            unsupportedBindingIds: coverage.unsupportedBindingIds
        }
    );
    return Object.freeze({
        artifact: validated,
        path: artifactPath,
        sha256: rawSha256(bytes)
    });
}

export function deriveLiveSourceToCacheLightAxisTransform(cacheBasis, pcf) {
    const cacheAxes = [cacheBasis?.rightAxisWorld, cacheBasis?.upAxisWorld];
    const liveAxes = [pcf?.sourceMapRightAxisWorld, pcf?.sourceMapUpAxisWorld];
    const requireAxis = (axis, label) => {
        if (!Array.isArray(axis) || axis.length !== 3
            || axis.some((value) => !Number.isFinite(value))) {
            throw new Error(`Native cutout ${label} is invalid`);
        }
        return axis;
    };
    cacheAxes.forEach((axis, index) => requireAxis(axis, `cache axis ${index}`));
    liveAxes.forEach((axis, index) => requireAxis(axis, `live axis ${index}`));
    const transform = cacheAxes.map((cacheAxis) => liveAxes.map((liveAxis) => {
        const dot = cacheAxis.reduce(
            (total, value, index) => total + value * liveAxis[index],
            0
        );
        const canonical = [-1, 0, 1].find(
            (candidate) => Math.abs(dot - candidate) <= 1e-9
        );
        if (canonical === undefined) {
            throw new Error('Native cutout axes are not a signed permutation');
        }
        return canonical;
    }));
    const lines = [
        ...transform,
        [transform[0][0], transform[1][0]],
        [transform[0][1], transform[1][1]]
    ];
    if (lines.some((line) => line.reduce(
        (total, value) => total + Math.abs(value),
        0
    ) !== 1)) {
        throw new Error('Native cutout axis transform is not bijective');
    }
    return transform;
}

function validateRebasedNativeFieldMigration(migration, composition, authority) {
    requireExactKeys(migration, [
        'candidateSourceIdentity', 'current', 'historical', 'method', 'schema'
    ], 'native rebased field migration');
    if (migration.schema
            !== 'ai531-production-alpha-cutout-native-field-migration-v1'
        || migration.method
            !== 'current-and-historical-direct-byte-identity-plus-candidate-source-equivalence-v1') {
        throw new Error('Native rebased field migration identity is unsupported');
    }
    const candidate = migration.candidateSourceIdentity;
    requireExactKeys(candidate, [
        'aggregateCandidateBytesSha256', 'candidateCount', 'samplerSha256',
        'sourceTriangleAuthority', 'tileQueriesSha256'
    ], 'native rebased field candidate identity');
    requireSha256(
        candidate.aggregateCandidateBytesSha256,
        'native rebased aggregate candidate bytes'
    );
    requireNonNegativeInteger(
        candidate.candidateCount,
        'native rebased candidate count'
    );
    if (candidate.candidateCount < 1) {
        throw new Error('Native rebased field candidate count must be positive');
    }
    requireSha256(candidate.samplerSha256, 'native rebased sampler identity');
    requireSha256(candidate.tileQueriesSha256, 'native rebased tile-query identity');
    requireExactKeys(candidate.sourceTriangleAuthority, [
        'byteLength', 'sha256'
    ], 'native rebased source triangle authority');
    if (!Number.isSafeInteger(candidate.sourceTriangleAuthority.byteLength)
        || candidate.sourceTriangleAuthority.byteLength < 1) {
        throw new Error('Native rebased source triangle authority is incomplete');
    }
    requireSha256(
        candidate.sourceTriangleAuthority.sha256,
        'native rebased source triangles'
    );
    for (const [label, source] of [
        ['current', migration.current],
        ['historical', migration.historical]
    ]) {
        requireExactKeys(source, [
            'bsib', 'direct', 'textureGrad'
        ], `native rebased ${label} source`);
        requireExactKeys(source.bsib, ['byteLength', 'sha256'], `${label} BSIB`);
        if (!Number.isSafeInteger(source.bsib.byteLength) || source.bsib.byteLength < 1) {
            throw new Error(`Native rebased ${label} BSIB length is invalid`);
        }
        requireSha256(source.bsib.sha256, `native rebased ${label} BSIB`);
        for (const [fieldLabel, proof] of [
            ['direct', source.direct], ['textureGrad', source.textureGrad]
        ]) {
            requireExactKeys(proof, [
                'method', 'outputProjectionSha256', 'receiptSha256', 'schema'
            ], `native rebased ${label} ${fieldLabel}`);
            requireSha256(
                proof.outputProjectionSha256,
                `native rebased ${label} ${fieldLabel} output projection`
            );
            requireSha256(
                proof.receiptSha256,
                `native rebased ${label} ${fieldLabel} receipt`
            );
        }
        if (source.direct.schema
                !== 'ai531-production-alpha-cutout-native-field-receipt-v2'
            || source.textureGrad.schema
                !== 'ai531-production-alpha-cutout-native-field-receipt-v3') {
            throw new Error(`Native rebased ${label} field schemas are unsupported`);
        }
    }
    if (migration.current.bsib.sha256 !== authority.packageRawSha256
        || migration.current.bsib.byteLength !== authority.packageSnapshot.byteLength
        || migration.historical.bsib.sha256 === migration.current.bsib.sha256
        || migration.current.direct.outputProjectionSha256
            !== migration.historical.direct.outputProjectionSha256
        || canonicalJsonStringify(migration.current.direct)
            !== canonicalJsonStringify(composition.direct)
        || canonicalJsonStringify(migration.historical.textureGrad)
            !== canonicalJsonStringify(composition.textureGrad)) {
        throw new Error('Native rebased field migration proof is inconsistent');
    }
}

export async function loadProductionNativeCutoutField(context, deps = {}) {
    const root = context.options.nativeCutoutRoot;
    const readFileFn = deps.readFileFn ?? readFile;
    const lstatFn = deps.lstatFn ?? lstat;
    const hashFileFn = deps.hashFileFn ?? hashFileRaw;
    const profileRoot = path.join(root, safeProfileDirectory(context.profile.id));
    const receiptPath = path.join(profileRoot, 'native_cutout_field_receipt.json');
    if (!isPathInside(root, receiptPath, false)) {
        throw new Error('Native cutout receipt path escaped its configured root');
    }
    const receiptEntry = await lstatFn(receiptPath);
    if (!receiptEntry.isFile() || receiptEntry.isSymbolicLink()) {
        throw new Error('Native cutout receipt must be a regular non-symbolic file');
    }
    const bytes = copyBytes(
        await readFileFn(receiptPath),
        'production native cutout field receipt'
    );
    const receipt = parseCanonicalJsonBytes(
        bytes,
        'production native cutout field receipt'
    );
    if (context.allowUnpromotedNativeCutoutField !== true) {
        assertCleanProductionNativeFieldReceipt(receipt);
    }
    const receiptKeys = [
        'aggregate', 'layout', 'method', 'outputs', 'performance', 'producers',
        'productionEligible', 'profile', 'schema', 'session', 'source', 'status'
    ];
    const promotedV2 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v2'
        && receipt.method
            === 'three-r183-production-lattice-mixed-foliage-depth24-native-readback-v2'
        && receipt.status === 'complete'
        && receipt.productionEligible === true;
    const unpromotedV3 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v3'
        && receipt.method
            === 'headless-blender-full-lattice-candidates-three-r183-native-texture-grad-v3'
        && receipt.status === 'complete_unpromoted'
        && receipt.productionEligible === false;
    const unpromotedV4 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v4'
        && receipt.method
            === 'headless-blender-full-lattice-candidates-three-r183-native-implicit-gradient-v4'
        && receipt.status === 'complete_unpromoted'
        && receipt.productionEligible === false;
    const promotedV3 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v3'
        && receipt.method
            === 'headless-blender-full-lattice-candidates-three-r183-native-texture-grad-v3'
        && receipt.status === 'complete'
        && receipt.productionEligible === true;
    const unpromotedV5 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v5'
        && receipt.method
            === 'authenticated-direct-depth24-texture-grad-minimum-union-v5'
        && receipt.status === 'complete_unpromoted'
        && receipt.productionEligible === false;
    const promotedV5 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v5'
        && receipt.method
            === 'authenticated-direct-depth24-texture-grad-minimum-union-v5'
        && receipt.status === 'complete'
        && receipt.productionEligible === true;
    const unpromotedV6 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v6'
        && receipt.method
            === 'authenticated-direct-depth24-texture-grad-hole-fill-v6'
        && receipt.status === 'complete_unpromoted'
        && receipt.productionEligible === false;
    const promotedV6 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v6'
        && receipt.method
            === 'authenticated-direct-depth24-texture-grad-hole-fill-v6'
        && receipt.status === 'complete'
        && receipt.productionEligible === true;
    const unpromotedV7 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v7'
        && receipt.method
            === 'authenticated-direct-preferred-hole-fill-minus-measured-bake-only-v7'
        && receipt.status === 'complete_unpromoted'
        && receipt.productionEligible === false;
    const promotedV7 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v7'
        && receipt.method
            === 'authenticated-direct-preferred-hole-fill-minus-measured-bake-only-v7'
        && receipt.status === 'complete'
        && receipt.productionEligible === true;
    const unpromotedV8 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v8'
        && receipt.method
            === 'authenticated-minimum-union-plus-measured-exact-corrections-v8'
        && receipt.status === 'complete_unpromoted'
        && receipt.productionEligible === false;
    const promotedV8 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v8'
        && receipt.method
            === 'authenticated-minimum-union-plus-measured-exact-corrections-v8'
        && receipt.status === 'complete'
        && receipt.productionEligible === true;
    const unpromotedV9 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v9'
        && receipt.method
            === 'authenticated-stable-direct-plus-historical-texture-grad-hole-restoration-v9'
        && receipt.status === 'complete_unpromoted'
        && receipt.productionEligible === false;
    const promotedV9 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v9'
        && receipt.method
            === 'authenticated-stable-direct-plus-historical-texture-grad-hole-restoration-v9'
        && receipt.status === 'complete'
        && receipt.productionEligible === true;
    const unpromotedV10 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v10'
        && receipt.method
            === 'authenticated-stable-direct-historical-hole-restoration-minus-measured-bake-only-v10'
        && receipt.status === 'complete_unpromoted'
        && receipt.productionEligible === false;
    const promotedV10 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v10'
        && receipt.method
            === 'authenticated-stable-direct-historical-hole-restoration-minus-measured-bake-only-v10'
        && receipt.status === 'complete'
        && receipt.productionEligible === true;
    const unpromotedV11 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v11'
        && receipt.method
            === 'authenticated-static-shadow-residual-live-depth-corrections-v11'
        && receipt.status === 'complete_unpromoted'
        && receipt.productionEligible === false;
    const promotedV11 = receipt.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v11'
        && receipt.method
            === 'authenticated-static-shadow-residual-live-depth-corrections-v11'
        && receipt.status === 'complete'
        && receipt.productionEligible === true;
    requireExactKeys(
        receipt,
        promotedV3 || promotedV5 || promotedV6 || promotedV7 || promotedV8
            || promotedV9
            || promotedV10 || promotedV11
            ? [...receiptKeys, 'promotion'] : receiptKeys,
        'production native cutout field receipt'
    );
    if ((!promotedV2 && !promotedV3 && !promotedV5 && !promotedV6
            && !promotedV7 && !promotedV8 && !promotedV9 && !promotedV10
            && !promotedV11
            && !(context.allowUnpromotedNativeCutoutField === true
                && (unpromotedV3 || unpromotedV4 || unpromotedV5
                    || unpromotedV6 || unpromotedV7 || unpromotedV8
                    || unpromotedV9 || unpromotedV10 || unpromotedV11)))
        || receipt.profile?.id !== context.profile.id
        || canonicalJsonStringify(receipt.profile?.directionThree)
            !== canonicalJsonStringify(context.profile.directionThree)) {
        throw new Error('Native cutout field receipt is not complete for the selected profile');
    }
    const coverage = deriveProductionAlphaCutoutCoverageIdentity(
        context.authority.manifest
    );
    const cutoutCasterIds = context.authority.manifest.casterMappings
        .filter((entry) => entry.channelRelevance?.static_sun_depth === true
            && entry.coverageMode === 'cutout')
        .map((entry) => entry.id)
        .sort(compareCanonicalStrings);
    const cutoutCasterIdsSha256 = rawCanonicalSha256(cutoutCasterIds);
    const nativeOwnedMeshInstanceIds = [...new Set(
        context.authority.manifest.casterMappings
            .filter((entry) => entry.channelRelevance?.static_sun_depth === true
                && entry.coverageMode === 'cutout')
            .map((entry) => entry.meshInstanceId)
    )].sort(compareCanonicalStrings);
    const nativeOwnedMeshInstanceIdsSha256 = rawCanonicalSha256(
        nativeOwnedMeshInstanceIds
    );
    if (receipt.source?.bsib?.sha256 !== context.authority.packageRawSha256
        || receipt.source?.bsib?.byteLength
            !== context.authority.packageSnapshot.byteLength
        || receipt.source?.cutoutCasterCount !== coverage.cutoutCasterCount
        || receipt.source?.cutoutCasterIdsSha256 !== cutoutCasterIdsSha256
        || receipt.source?.nativeOwnedMeshInstanceCount
            !== nativeOwnedMeshInstanceIds.length
        || receipt.source?.nativeOwnedMeshInstanceIdsSha256
            !== nativeOwnedMeshInstanceIdsSha256
        || receipt.session?.diagnostics?.length !== 0
        || receipt.session?.begin?.casterCount !== coverage.cutoutCasterCount
        || receipt.session?.begin?.nativeOwnedMeshCount
            !== nativeOwnedMeshInstanceIds.length
        || receipt.session?.begin?.nativeFoliageCoverage
            !== 'all-visible-material-groups-of-authenticated-cutout-meshes-v1'
        || rawCanonicalSha256(receipt.session?.begin?.casterIds)
            !== cutoutCasterIdsSha256
        || receipt.session?.end?.status !== 'disposed') {
        throw new Error(
            'Native cutout field source, live caster inventory, or clean-session proof is invalid'
        );
    }
    if (unpromotedV5 || promotedV5 || unpromotedV6 || promotedV6
        || unpromotedV7 || promotedV7 || unpromotedV8 || promotedV8
        || unpromotedV9 || promotedV9 || unpromotedV10 || promotedV10
        || unpromotedV11 || promotedV11) {
        const composition = receipt.source?.composition;
        requireExactKeys(composition, [
            'direct', 'method', ...(unpromotedV9 || promotedV9
                || unpromotedV10 || promotedV10 || unpromotedV11 || promotedV11
                ? ['migration'] : []),
            'schema', 'textureGrad'
        ], 'native composed field source');
        for (const [label, proof] of [
            ['direct', composition.direct],
            ['textureGrad', composition.textureGrad]
        ]) {
            requireExactKeys(proof, [
                'method', 'outputProjectionSha256', 'receiptSha256', 'schema'
            ], `native composed field ${label}`);
            requireSha256(proof.outputProjectionSha256, `${label} output projection`);
            requireSha256(proof.receiptSha256, `${label} receipt`);
        }
        const directPreferred = unpromotedV6 || promotedV6
            || unpromotedV7 || promotedV7;
        const rebased = unpromotedV9 || promotedV9 || unpromotedV10 || promotedV10
            || unpromotedV11 || promotedV11;
        if (composition.schema !== (rebased
                ? 'ai531-production-alpha-cutout-native-field-composition-v3'
                : directPreferred
                    ? 'ai531-production-alpha-cutout-native-field-composition-v2'
                    : 'ai531-production-alpha-cutout-native-field-composition-v1')
            || composition.method !== (rebased
                ? 'authenticated-current-direct-plus-candidate-equivalent-historical-texture-grad-hole-fill-v3'
                : directPreferred
                    ? 'authenticated-source-fields-plus-direct-preferred-hole-fill-v2'
                    : 'authenticated-source-fields-plus-bytewise-minimum-union-v1')
            || composition.direct.schema
                !== 'ai531-production-alpha-cutout-native-field-receipt-v2'
            || composition.textureGrad.schema
                !== 'ai531-production-alpha-cutout-native-field-receipt-v3') {
            throw new Error('Native composed field source identity is unsupported');
        }
        if (rebased) {
            validateRebasedNativeFieldMigration(
                composition.migration,
                composition,
                context.authority
            );
        }
    }
    if (unpromotedV7 || promotedV7 || unpromotedV8 || promotedV8
        || unpromotedV10 || promotedV10) {
        validateCalibratedNativeFieldSource(
            receipt.source?.calibration,
            unpromotedV10 || promotedV10 ? 'v10'
                : unpromotedV8 || promotedV8 ? 'v8' : 'v7'
        );
    } else if (!(unpromotedV11 || promotedV11)
        && Object.hasOwn(receipt.source ?? {}, 'calibration')) {
        throw new Error('Only calibrated native cutout fields may declare calibration evidence');
    }
    if (unpromotedV11 || promotedV11) {
        if (Object.hasOwn(receipt.source ?? {}, 'calibration')) {
            validateCalibratedNativeFieldSource(receipt.source.calibration, 'v10');
        }
        validateResidualNativeFieldSource(receipt.source?.residualCalibration);
    } else if (Object.hasOwn(receipt.source ?? {}, 'residualCalibration')) {
        throw new Error('Only v11 native fields may declare residual calibration evidence');
    }
    const layout = receipt.layout?.layout;
    const layerCount = layout?.layerCount;
    const tileCount = layout?.tileCount;
    const interiorPixels = layout?.interiorPixels;
    const expectedAxisTransform = unpromotedV4
        ? deriveLiveSourceToCacheLightAxisTransform(
            receipt.layout?.basis,
            createProductionStaticSunRequest(context.profile).sampling.pcf
        )
        : null;
    if (unpromotedV4) {
        if (canonicalJsonStringify(
            receipt.session?.begin?.liveSourceToCacheLightAxisTransform
        ) !== canonicalJsonStringify(expectedAxisTransform)) {
            throw new Error(
                'Native v4 cutout session has an invalid live-to-cache light-axis transform'
            );
        }
    } else if (Object.hasOwn(
        receipt.session?.begin ?? {},
        'liveSourceToCacheLightAxisTransform'
    )) {
        throw new Error('Legacy native cutout session declares a v4-only axis transform');
    }
    if (!Array.isArray(receipt.outputs)
        || !Number.isSafeInteger(layerCount)
        || receipt.outputs.length !== layerCount
        || canonicalJsonStringify(interiorPixels)
            !== canonicalJsonStringify(
                AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.interiorPixels
            )
        || !Array.isArray(tileCount)
        || tileCount.length !== 2
        || tileCount[0] * tileCount[1] !== layerCount) {
        throw new Error('Native cutout field layout or output inventory is incomplete');
    }
    const expectedByteLength = interiorPixels[0] * interiorPixels[1] * 4;
    let occupiedTexelCount = 0;
    let transparentTexelCount = 0;
    let outputByteLength = 0;
    let acceptedCandidateCount = 0;
    let candidateCount = 0;
    let candidateChunkCount = 0;
    let nativeCaptureIdentity = null;
    const textureGradV3 = unpromotedV3 || promotedV3;
    const nativeCandidateField = textureGradV3 || unpromotedV4;
    const composedV5 = unpromotedV5 || promotedV5;
    const composedV6 = unpromotedV6 || promotedV6;
    const composedV7 = unpromotedV7 || promotedV7;
    const composedV8 = unpromotedV8 || promotedV8;
    const composedV9 = unpromotedV9 || promotedV9;
    const composedV10 = unpromotedV10 || promotedV10;
    const composedV11 = unpromotedV11 || promotedV11;
    let excludedBakeOnlySampleCount = 0;
    let correctedBakeOnlySampleCount = 0;
    let correctedDepthSampleCount = 0;
    const outputProjection = [];
    for (let index = 0; index < receipt.outputs.length; index += 1) {
        const output = receipt.outputs[index];
        const expectedCoordinates = [index % tileCount[0], Math.floor(index / tileCount[0])];
        const expectedTileId = `tile_${String(expectedCoordinates[0]).padStart(4, '0')}_${String(expectedCoordinates[1]).padStart(4, '0')}`;
        const expectedPath = `tiles/${expectedTileId}.cutout-first-hit.f32le`;
        if (output.tileIndex !== index
            || output.tileId !== expectedTileId
            || canonicalJsonStringify(output.coordinates)
                !== canonicalJsonStringify(expectedCoordinates)
            || output.path !== expectedPath
            || output.byteLength !== expectedByteLength
            || output.rowOrigin !== 'min-light-y-v1'
            || output.xAxis !== 'increasing-cache-light-right-v1'
            || !Number.isSafeInteger(output.occupiedTexelCount)
            || !Number.isSafeInteger(output.transparentTexelCount)
            || output.occupiedTexelCount < 0
            || output.transparentTexelCount < 0
            || output.occupiedTexelCount + output.transparentTexelCount
                !== interiorPixels[0] * interiorPixels[1]) {
            throw new Error(`Native cutout tile ${index} differs from its lattice contract`);
        }
        if (nativeCandidateField) {
            const nativeCapture = output.nativeCapture;
            const candidateAuthority = nativeCapture?.candidateAuthority;
            const identity = {
                implementation: nativeCapture?.implementation,
                sampling: nativeCapture?.sampling,
                stateRestoration: nativeCapture?.stateRestoration,
                transfer: nativeCapture?.transfer
            };
            if (!Number.isSafeInteger(candidateAuthority?.acceptedCandidateCount)
                || !Number.isSafeInteger(candidateAuthority?.candidateCount)
                || !Number.isSafeInteger(candidateAuthority?.chunkCount)
                || candidateAuthority.acceptedCandidateCount < 0
                || candidateAuthority.candidateCount < 0
                || candidateAuthority.chunkCount < 0
                || candidateAuthority.acceptedCandidateCount
                    < output.occupiedTexelCount
                || !(
                    nativeCapture?.sampling?.schema
                        === 'ai531-production-alpha-cutout-native-texture-grad-capture-v2'
                    && nativeCapture?.sampling?.method
                        === 'live-three-native-texture-explicit-gradient-batched-rgba32f-readback-v2'
                    || nativeCapture?.sampling?.schema
                        === 'ai531-production-alpha-cutout-native-implicit-gradient-capture-v3'
                    && nativeCapture?.sampling?.method
                        === 'live-three-native-texture-implicit-gradient-instanced-2x2-rgba32f-readback-v3'
                )
                || (unpromotedV4 && canonicalJsonStringify(
                    nativeCapture?.sampling?.liveSourceToCacheLightAxisTransform
                ) !== canonicalJsonStringify(expectedAxisTransform))
                || (!unpromotedV4 && Object.hasOwn(
                    nativeCapture?.sampling ?? {},
                    'liveSourceToCacheLightAxisTransform'
                ))
                || nativeCapture?.stateRestoration?.gl !== 'verified'
                || nativeCapture?.stateRestoration?.renderer !== 'verified') {
                throw new Error(`Native cutout tile ${index} has invalid native capture proof`);
            }
            requireSha256(
                candidateAuthority.queryProjectionSha256,
                `native cutout tile ${index} query projection sha256`
            );
            requireSha256(
                candidateAuthority.resultProjectionSha256,
                `native cutout tile ${index} result projection sha256`
            );
            if (nativeCaptureIdentity === null) nativeCaptureIdentity = identity;
            else if (canonicalJsonStringify(nativeCaptureIdentity)
                    !== canonicalJsonStringify(identity)) {
                throw new Error('Native cutout capture identity changed between tiles');
            }
            acceptedCandidateCount += candidateAuthority.acceptedCandidateCount;
            candidateCount += candidateAuthority.candidateCount;
            candidateChunkCount += candidateAuthority.chunkCount;
        } else if (composedV5 || composedV6 || composedV7 || composedV8
            || composedV9 || composedV10 || composedV11) {
            requireExactKeys(output.nativeCapture, [
                ...(composedV7 || composedV8 || composedV10
                    || composedV11 && output.nativeCapture.calibration
                    ? ['calibration'] : []),
                'direct', 'method', ...(composedV11 ? ['residualCalibration'] : []),
                'textureGrad'
            ], `native composed tile ${index} capture`);
            for (const [label, proof] of [
                ['direct', output.nativeCapture.direct],
                ['textureGrad', output.nativeCapture.textureGrad]
            ]) {
                requireExactKeys(proof, [
                    'byteLength', 'occupiedTexelCount', 'sha256'
                ], `native composed tile ${index} ${label}`);
                if (proof.byteLength !== expectedByteLength
                    || !Number.isSafeInteger(proof.occupiedTexelCount)
                    || proof.occupiedTexelCount < 0) {
                    throw new Error(`Native composed tile ${index} source proof is invalid`);
                }
                requireSha256(proof.sha256, `native composed tile ${index} ${label} sha256`);
            }
            const expectedCompositionMethod = composedV11
                ? 'stable-field-plus-authenticated-nearer-live-depth-residuals-v4'
                : composedV10
                ? 'stable-direct-historical-hole-restoration-minus-measured-bake-only-v3'
                : composedV9
                ? 'stable-direct-first-hit-plus-historical-texture-grad-hole-restoration-v3'
                : composedV8
                ? 'minimum-union-plus-measured-exact-corrections-v2'
                : composedV7
                    ? 'direct-preferred-hole-fill-minus-measured-bake-only-v1'
                : composedV6
                    ? 'direct-depth24-first-hit-plus-texture-grad-hole-fill-v2'
                : 'minimum-nonzero-first-hit-depth-union-v1';
            if (output.nativeCapture.method !== expectedCompositionMethod) {
                throw new Error(`Native composed tile ${index} method is invalid`);
            }
            if (composedV7 || composedV10) {
                const calibration = output.nativeCapture.calibration;
                requireExactKeys(
                    calibration,
                    ['excludedBakeOnlyTexelCount', 'sourceByteLength', 'sourceSha256'],
                    `native calibrated tile ${index}`
                );
                requireNonNegativeInteger(
                    calibration.excludedBakeOnlyTexelCount,
                    `native calibrated tile ${index} excluded count`
                );
                requireSha256(
                    calibration.sourceSha256,
                    `native calibrated tile ${index} source sha256`
                );
                if (calibration.sourceByteLength !== expectedByteLength) {
                    throw new Error(`Native calibrated tile ${index} source length is invalid`);
                }
                excludedBakeOnlySampleCount += calibration.excludedBakeOnlyTexelCount;
            } else if (composedV8) {
                const calibration = output.nativeCapture.calibration;
                requireExactKeys(
                    calibration,
                    [
                        'correctedBakeOnlyTexelCount', 'correctedDepthTexelCount',
                        'sourceByteLength', 'sourceSha256'
                    ],
                    `native exact calibrated tile ${index}`
                );
                requireNonNegativeInteger(
                    calibration.correctedBakeOnlyTexelCount,
                    `native exact calibrated tile ${index} bake-only count`
                );
                requireNonNegativeInteger(
                    calibration.correctedDepthTexelCount,
                    `native exact calibrated tile ${index} depth count`
                );
                requireSha256(
                    calibration.sourceSha256,
                    `native exact calibrated tile ${index} source sha256`
                );
                if (calibration.sourceByteLength !== expectedByteLength) {
                    throw new Error(
                        `Native exact calibrated tile ${index} source length is invalid`
                    );
                }
                correctedBakeOnlySampleCount += calibration.correctedBakeOnlyTexelCount;
                correctedDepthSampleCount += calibration.correctedDepthTexelCount;
            }
            if (composedV11) {
                const residual = output.nativeCapture.residualCalibration;
                requireExactKeys(residual, [
                    'correctedTexelCount', 'sourceByteLength', 'sourceSha256'
                ], `native residual tile ${index}`);
                requireNonNegativeInteger(
                    residual.correctedTexelCount,
                    `native residual tile ${index} corrected count`
                );
                requireSha256(
                    residual.sourceSha256,
                    `native residual tile ${index} source sha256`
                );
                if (residual.sourceByteLength !== expectedByteLength) {
                    throw new Error(`Native residual tile ${index} source length is invalid`);
                }
                correctedDepthSampleCount += residual.correctedTexelCount;
            }
        }
        requireSha256(output.sha256, `native cutout tile ${index} sha256`);
        const outputPath = resolvePublishedPath(profileRoot, output.path);
        const outputEntry = await lstatFn(outputPath);
        if (!outputEntry.isFile() || outputEntry.isSymbolicLink()) {
            throw new Error(`Native cutout tile ${index} must be a regular non-symbolic file`);
        }
        const hashed = await hashFileFn(outputPath);
        if (hashed.byteLength !== output.byteLength
            || hashed.sha256 !== output.sha256) {
            throw new Error(`Native cutout tile ${index} failed its authenticated digest`);
        }
        occupiedTexelCount += output.occupiedTexelCount;
        transparentTexelCount += output.transparentTexelCount;
        outputByteLength += output.byteLength;
        outputProjection.push({
            byteLength: output.byteLength,
            coordinates: output.coordinates,
            occupiedTexelCount: output.occupiedTexelCount,
            path: output.path,
            sha256: output.sha256,
            tileId: output.tileId,
            tileIndex: output.tileIndex,
            transparentTexelCount: output.transparentTexelCount
        });
    }
    const expectedAggregate = {
        occupiedTexelCount,
        outputByteLength,
        outputCount: layerCount,
        requiredOutputCount: layerCount,
        transparentTexelCount
    };
    if (canonicalJsonStringify(receipt.aggregate)
            !== canonicalJsonStringify(expectedAggregate)) {
        throw new Error('Native cutout field aggregate differs from its tile inventory');
    }
    if (nativeCandidateField && (
        receipt.source?.candidateAuthority?.candidateCount !== candidateCount
        || receipt.source?.nativeResultAuthority?.acceptedCandidateCount
            !== acceptedCandidateCount
        || receipt.source?.nativeResultAuthority?.resultChunkCount
            !== candidateChunkCount
    )) {
        throw new Error('Native cutout candidate/result authority differs from tile proofs');
    }
    if (composedV7 && receipt.source.calibration.excludedBakeOnlySampleCount
            !== excludedBakeOnlySampleCount) {
        throw new Error('Native calibrated field exclusion total differs from its tile proofs');
    }
    if (composedV10 && receipt.source.calibration.excludedBakeOnlySampleCount
            !== excludedBakeOnlySampleCount) {
        throw new Error('Native rebased calibrated field exclusion total differs from its tile proofs');
    }
    if (composedV11 && receipt.source.residualCalibration.correctedTexelCount
            !== correctedDepthSampleCount) {
        throw new Error('Native residual field correction total differs from its tile proofs');
    }
    if (composedV8 && (
        receipt.source.calibration.correctedBakeOnlySampleCount
            !== correctedBakeOnlySampleCount
        || receipt.source.calibration.correctedDepthSampleCount
            !== correctedDepthSampleCount
    )) {
        throw new Error('Native exact calibrated field totals differ from its tile proofs');
    }
    const outputProjectionSha256 = rawCanonicalSha256(outputProjection);
    if (promotedV3 || promotedV5 || promotedV6 || promotedV7 || promotedV8
        || promotedV9 || promotedV10 || promotedV11) {
        await authenticateNativeCutoutFieldPromotion({
            context,
            deps: {lstatFn, readFileFn},
            outputProjectionSha256,
            profileRoot,
            receipt
        });
    }
    return Object.freeze({
        eligibility: promotedV2 || promotedV3 || promotedV5 || promotedV6
            || promotedV7 || promotedV8 || promotedV9
            || promotedV10 || promotedV11
            ? 'promoted' : 'unpromoted',
        outputProjectionSha256,
        path: receiptPath,
        receipt: cloneCanonicalJson(receipt),
        sha256: rawSha256(bytes)
    });
}

export function validateResidualNativeFieldSource(value) {
    requireExactKeys(value, [
        'correctedTexelCount', 'correctedTexels', 'localizationReports',
        'method', 'productionPackage', 'schema', 'sourceField',
        'sourceProductionReport'
    ], 'native residual calibration');
    if (value.schema !== 'ai531-production-static-shadow-residual-calibration-v4'
        || value.method
            !== 'apply-authenticated-same-session-nearer-live-depth-residuals-v4') {
        throw new Error('Native residual calibration identity is unsupported');
    }
    requireNonNegativeInteger(value.correctedTexelCount, 'native residual corrected count');
    if (value.correctedTexelCount < 1
        || !Array.isArray(value.correctedTexels)
        || value.correctedTexels.length !== value.correctedTexelCount
        || !Array.isArray(value.localizationReports)
        || value.localizationReports.length < 1) {
        throw new Error('Native residual correction inventory is incomplete');
    }
    requireExactKeys(value.sourceField, [
        'method', 'outputProjectionSha256', 'receiptSha256', 'schema'
    ], 'native residual source field');
    const sourceV9 = value.sourceField.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v9'
        && value.sourceField.method
            === 'authenticated-stable-direct-plus-historical-texture-grad-hole-restoration-v9';
    const sourceV10 = value.sourceField.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v10'
        && value.sourceField.method
            === 'authenticated-stable-direct-historical-hole-restoration-minus-measured-bake-only-v10';
    const sourceV11 = value.sourceField.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v11'
        && value.sourceField.method
            === 'authenticated-static-shadow-residual-live-depth-corrections-v11';
    if (!sourceV9 && !sourceV10 && !sourceV11) {
        throw new Error('Native residual source field is unsupported');
    }
    requireSha256(value.sourceField.outputProjectionSha256, 'native residual source projection');
    requireSha256(value.sourceField.receiptSha256, 'native residual source receipt');
    const seen = new Set();
    for (const correction of value.correctedTexels) {
        requireExactKeys(correction, [
            'casterClasses', 'correctedDepthMeters', 'formerDepthMeters',
            'globalTexel', 'liveDepthMeters', 'observationCount',
            'observationSha256', 'reportSha256s'
        ], 'native residual corrected texel');
        if (!Array.isArray(correction.globalTexel)
            || correction.globalTexel.length !== 2
            || correction.globalTexel.some((entry) => (
                !Number.isSafeInteger(entry) || entry < 0
            ))
            || !Number.isFinite(correction.liveDepthMeters)
            || correction.liveDepthMeters === 0
            || correction.correctedDepthMeters !== Math.fround(correction.liveDepthMeters)
            || !Number.isFinite(correction.formerDepthMeters)
            || correction.formerDepthMeters !== 0
                && correction.correctedDepthMeters >= correction.formerDepthMeters
            || !Number.isSafeInteger(correction.observationCount)
            || correction.observationCount < 1
            || !Array.isArray(correction.casterClasses)
            || correction.casterClasses.length < 1
            || !Array.isArray(correction.reportSha256s)
            || correction.reportSha256s.length < 1) {
            throw new Error('Native residual corrected texel is invalid');
        }
        requireSha256(correction.observationSha256, 'native residual observation digest');
        correction.reportSha256s.forEach((digest) => (
            requireSha256(digest, 'native residual report digest')
        ));
        const key = canonicalJsonStringify(correction.globalTexel);
        if (seen.has(key)) throw new Error('Native residual corrected texel is duplicated');
        seen.add(key);
    }
    for (const report of value.localizationReports) {
        requireExactKeys(report, [
            'byteLength', 'captureSetSha256', 'casterClasses', 'path',
            'sha256', 'targetCaseId'
        ], 'native residual localization report');
        if (!Number.isSafeInteger(report.byteLength) || report.byteLength < 1
            || !Array.isArray(report.casterClasses) || report.casterClasses.length < 1
            || typeof report.path !== 'string' || !report.path
            || typeof report.targetCaseId !== 'string' || !report.targetCaseId) {
            throw new Error('Native residual localization report proof is invalid');
        }
        requireSha256(report.captureSetSha256, 'native residual capture set');
        requireSha256(report.sha256, 'native residual localization report');
    }
    requireExactKeys(value.productionPackage, [
        'alphaCertification', 'packagePath'
    ], 'native residual production package');
    requireExactKeys(value.productionPackage.alphaCertification, [
        'byteLength', 'path', 'sha256'
    ], 'native residual alpha certification');
    requireSha256(
        value.productionPackage.alphaCertification.sha256,
        'native residual alpha certification'
    );
    requireExactKeys(value.sourceProductionReport, [
        'byteLength', 'path', 'schema', 'sha256'
    ], 'native residual source production report');
    if (value.sourceProductionReport.schema
            !== 'bus-sim-static-sun-depth-production-validation-report-v4') {
        throw new Error('Native residual source production report schema is unsupported');
    }
    requireSha256(value.sourceProductionReport.sha256, 'native residual source report');
}

function validateCalibratedNativeFieldSource(value, version) {
    const calibration = value;
    if (version === 'v8') {
        requireExactKeys(calibration, [
            'correctedBakeOnlySampleCount', 'correctedDepthSampleCount',
            'correctedSamples', 'descriptorSha256', 'diagnosticEvidence',
            'diagnosticReport', 'method', 'schema', 'sourceField'
        ], 'native exact calibrated field source');
        if (calibration.schema
                !== 'ai531-production-alpha-cutout-native-field-calibration-v2'
            || calibration.method
                !== 'apply-only-independently-measured-occupancy-and-depth-corrections-v2') {
            throw new Error('Native exact calibrated field source identity is unsupported');
        }
        requireNonNegativeInteger(
            calibration.correctedBakeOnlySampleCount,
            'native exact calibration bake-only count'
        );
        requireNonNegativeInteger(
            calibration.correctedDepthSampleCount,
            'native exact calibration depth count'
        );
        if (calibration.correctedBakeOnlySampleCount
                + calibration.correctedDepthSampleCount < 1) {
            throw new Error('Native exact calibration correction inventory is empty');
        }
        validateCalibratedNativeFieldCommon(calibration);
        const sourceField = calibration.sourceField;
        if (sourceField.schema
                !== 'ai531-production-alpha-cutout-native-field-receipt-v5'
            || sourceField.method
                !== 'authenticated-direct-depth24-texture-grad-minimum-union-v5') {
            throw new Error('Native exact calibration source field must be the v5 minimum union');
        }
        if (!Array.isArray(calibration.correctedSamples)
            || calibration.correctedSamples.length
                !== calibration.correctedBakeOnlySampleCount
                    + calibration.correctedDepthSampleCount) {
            throw new Error('Native exact calibration sample inventory is incomplete');
        }
        let previousIndex = -1;
        let bakeOnlyCount = 0;
        let depthCount = 0;
        const texels = new Set();
        for (const sample of calibration.correctedSamples) {
            requireExactKeys(sample, [
                'bakeDepthMeters', 'casterId', 'correctedDepthMeters',
                'correction', 'formerDepthMeters', 'globalTexel', 'index',
                'liveDepthMeters'
            ], 'native exact calibration sample');
            if (typeof sample.casterId !== 'string' || !sample.casterId
                || !Number.isFinite(sample.bakeDepthMeters)
                || sample.bakeDepthMeters <= 0
                || !Number.isFinite(sample.formerDepthMeters)
                || sample.formerDepthMeters <= 0
                || !Number.isFinite(sample.liveDepthMeters)
                || sample.liveDepthMeters < 0
                || !Number.isFinite(sample.correctedDepthMeters)
                || sample.correctedDepthMeters < 0
                || !Number.isSafeInteger(sample.index)
                || sample.index <= previousIndex
                || !Array.isArray(sample.globalTexel)
                || sample.globalTexel.length !== 2
                || sample.globalTexel.some((entry) => (
                    !Number.isSafeInteger(entry) || entry < 0
                ))) {
                throw new Error('Native exact calibration sample is invalid');
            }
            if (sample.correction === 'clear_bake_only') {
                if (sample.liveDepthMeters !== 0 || sample.correctedDepthMeters !== 0) {
                    throw new Error('Native exact bake-only correction is invalid');
                }
                bakeOnlyCount += 1;
            } else if (sample.correction === 'replace_depth') {
                if (sample.liveDepthMeters <= 0
                    || sample.correctedDepthMeters !== Math.fround(sample.liveDepthMeters)
                    || Math.abs(sample.bakeDepthMeters - sample.liveDepthMeters) <= 5e-3) {
                    throw new Error('Native exact depth correction is invalid');
                }
                depthCount += 1;
            } else {
                throw new Error('Native exact calibration correction kind is unsupported');
            }
            const texelIdentity = canonicalJsonStringify(sample.globalTexel);
            if (texels.has(texelIdentity)) {
                throw new Error('Native exact calibration texels must be unique');
            }
            texels.add(texelIdentity);
            previousIndex = sample.index;
        }
        if (bakeOnlyCount !== calibration.correctedBakeOnlySampleCount
            || depthCount !== calibration.correctedDepthSampleCount) {
            throw new Error('Native exact calibration correction counts are inconsistent');
        }
        return;
    }
    requireExactKeys(calibration, [
        'descriptorSha256', 'diagnosticEvidence', 'diagnosticReport',
        'excludedBakeOnlySampleCount', 'excludedSamples', 'method', 'schema',
        'sourceField'
    ], 'native calibrated field source');
    const rebased = version === 'v10';
    if (calibration.schema !== (rebased
            ? 'ai531-production-alpha-cutout-native-field-calibration-v3'
            : 'ai531-production-alpha-cutout-native-field-calibration-v1')
        || calibration.method !== (rebased
            ? 'remove-only-independently-measured-rebased-bake-occupied-live-empty-texels-v3'
            : 'remove-only-independently-measured-bake-occupied-live-empty-texels-v1')) {
        throw new Error('Native calibrated field source identity is unsupported');
    }
    validateCalibratedNativeFieldCommon(calibration);
    requirePositiveInteger(
        calibration.excludedBakeOnlySampleCount,
        'native calibration excluded sample count'
    );
    const sourceField = calibration.sourceField;
    if (sourceField.schema !== (rebased
            ? 'ai531-production-alpha-cutout-native-field-receipt-v9'
            : 'ai531-production-alpha-cutout-native-field-receipt-v6')
        || sourceField.method !== (rebased
            ? 'authenticated-stable-direct-plus-historical-texture-grad-hole-restoration-v9'
            : 'authenticated-direct-depth24-texture-grad-hole-fill-v6')) {
        throw new Error(
            `Native calibration source field must be the ${rebased ? 'v9 rebased' : 'v6 hole-fill'} field`
        );
    }
    if (!Array.isArray(calibration.excludedSamples)
        || calibration.excludedSamples.length
            !== calibration.excludedBakeOnlySampleCount) {
        throw new Error('Native calibration excluded sample inventory is incomplete');
    }
    let previousIndex = -1;
    const texels = new Set();
    for (const sample of calibration.excludedSamples) {
        requireExactKeys(sample, [
            'casterId', 'formerDepthMeters', 'globalTexel', 'index'
        ], 'native calibration excluded sample');
        if (typeof sample.casterId !== 'string' || !sample.casterId
            || !Number.isFinite(sample.formerDepthMeters)
            || sample.formerDepthMeters === 0
            || !Number.isSafeInteger(sample.index)
            || sample.index <= previousIndex
            || !Array.isArray(sample.globalTexel)
            || sample.globalTexel.length !== 2
            || sample.globalTexel.some((entry) => (
                !Number.isSafeInteger(entry) || entry < 0
            ))) {
            throw new Error('Native calibration excluded sample is invalid');
        }
        const texelIdentity = canonicalJsonStringify(sample.globalTexel);
        if (texels.has(texelIdentity)) {
            throw new Error('Native calibration excluded texels must be unique');
        }
        texels.add(texelIdentity);
        previousIndex = sample.index;
    }
}

function validateCalibratedNativeFieldCommon(calibration) {
    requireSha256(calibration.descriptorSha256, 'native calibration descriptor sha256');
    const report = calibration.diagnosticReport;
    requireExactKeys(
        report,
        ['byteLength', 'path', 'sha256'],
        'native calibration diagnostic report'
    );
    validateCalibrationFileRecord(report, 'native calibration diagnostic report');
    const evidence = calibration.diagnosticEvidence;
    requireExactKeys(evidence, [
        'bakeFirstHitDepth', 'bakeOccupancy', 'comparison',
        'liveFirstHitDepth', 'liveOccupancy', 'samplePlan'
    ], 'native calibration diagnostic evidence');
    for (const [key, record] of Object.entries(evidence)) {
        validateCalibrationFileRecord(record, `native calibration evidence ${key}`);
    }
    const sourceField = calibration.sourceField;
    requireExactKeys(sourceField, [
        'method', 'outputProjectionSha256', 'receiptSha256', 'schema'
    ], 'native calibration source field');
    requireSha256(sourceField.outputProjectionSha256, 'native calibration source projection');
    requireSha256(sourceField.receiptSha256, 'native calibration source receipt');
}

function validateCalibrationFileRecord(value, label) {
    const record = value;
    requireExactKeys(record, ['byteLength', 'path', 'sha256'], label);
    requirePositiveInteger(record.byteLength, `${label} byteLength`);
    requireSafeRelativePath(record.path, `${label} path`);
    if (!record.path.startsWith('tests/artifacts/illumination_531/')) {
        throw new Error(`${label} must stay below illumination_531`);
    }
    requireSha256(record.sha256, `${label} sha256`);
}

async function authenticateNativeCutoutFieldPromotion(options) {
    const {context, deps, outputProjectionSha256, profileRoot, receipt} = options;
    const promotion = receipt.promotion;
    requireExactKeys(promotion, [
        'method', 'nativeFieldIdentitySha256', 'parityArtifactSha256',
        'parityDescriptorSha256', 'schema', 'status',
        'unpromotedReceiptByteLength', 'unpromotedReceiptSha256'
    ], 'native cutout field promotion');
    for (const key of [
        'nativeFieldIdentitySha256', 'parityArtifactSha256',
        'parityDescriptorSha256', 'unpromotedReceiptSha256'
    ]) requireSha256(promotion[key], `native cutout field promotion.${key}`);
    requirePositiveInteger(
        promotion.unpromotedReceiptByteLength,
        'native cutout field promotion.unpromotedReceiptByteLength'
    );
    if (promotion.schema
            !== 'ai531-production-alpha-cutout-native-field-promotion-v1'
        || promotion.method
            !== 'authenticated-unpromoted-field-plus-file-backed-spatial-parity-v1'
        || promotion.status !== 'passed') {
        throw new Error('Native cutout field promotion identity is unsupported');
    }
    const originalPath = path.join(
        profileRoot,
        'unpromoted_native_cutout_field_receipt.json'
    );
    const originalEntry = await deps.lstatFn(originalPath);
    if (!originalEntry.isFile() || originalEntry.isSymbolicLink()) {
        throw new Error('Promoted native cutout field requires its regular original receipt');
    }
    const originalBytes = copyBytes(
        await deps.readFileFn(originalPath),
        'unpromoted native cutout field receipt'
    );
    const original = parseCanonicalJsonBytes(
        originalBytes,
        'unpromoted native cutout field receipt'
    );
    const expectedOriginal = {...receipt};
    delete expectedOriginal.promotion;
    expectedOriginal.productionEligible = false;
    expectedOriginal.status = 'complete_unpromoted';
    if (originalBytes.byteLength !== promotion.unpromotedReceiptByteLength
        || rawSha256(originalBytes) !== promotion.unpromotedReceiptSha256
        || canonicalJsonStringify(original)
            !== canonicalJsonStringify(expectedOriginal)) {
        throw new Error('Promoted native cutout field differs from its authenticated original');
    }
    if (context.options.alphaParityRoot === undefined) {
        throw new Error('Promoted textureGrad field requires --alpha-parity-root');
    }
    const parity = await loadProductionAlphaParityArtifact(context, deps);
    const identityPath = path.join(
        context.options.alphaParityRoot,
        safeProfileDirectory(context.profile.id),
        'native_field_identity.json'
    );
    const identityEntry = await deps.lstatFn(identityPath);
    if (!identityEntry.isFile() || identityEntry.isSymbolicLink()) {
        throw new Error('Promoted textureGrad parity requires a regular native field identity');
    }
    const identityBytes = copyBytes(
        await deps.readFileFn(identityPath),
        'native field parity identity'
    );
    const identity = parseCanonicalJsonBytes(
        identityBytes,
        'native field parity identity'
    );
    requireExactKeys(identity, [
        'method', 'outputProjectionSha256', 'receiptSha256', 'schema'
    ], 'native field parity identity');
    if (identity.schema !== 'ai531-native-mixed-foliage-field-parity-source-v2'
        || identity.method !== receipt.method
        || identity.receiptSha256 !== promotion.unpromotedReceiptSha256
        || identity.outputProjectionSha256 !== outputProjectionSha256
        || rawSha256(identityBytes) !== promotion.nativeFieldIdentitySha256
        || parity.sha256 !== promotion.parityArtifactSha256
        || parity.artifact.descriptorSha256 !== promotion.parityDescriptorSha256) {
        throw new Error('Native cutout promotion differs from its field or parity evidence');
    }
}

export function createProductionInputIdentity(authority, request) {
    return cloneCanonicalJson({
        ai529Scripts: {
            inventory: authority.ai529ScriptInventory,
            sha256: authority.ai529ScriptSha256
        },
        compilerProfile: {
            id: authority.compilerProfile.id,
            sha256: authority.profileSha256
        },
        rendererScriptSha256: authority.rendererScriptSha256,
        request,
        requestSha256: rawCanonicalSha256(request),
        schema: PRODUCTION_INPUT_IDENTITY_SCHEMA,
        source: {
            channelProfileSha256: authority.channelProfileSha256,
            channelSourceSha256: authority.channelSourceSha256,
            cityId: authority.cityId,
            finalFileDomainSha256: authority.finalFileDomainSha256,
            packageRawSha256: authority.packageRawSha256,
            sourceIdentityHashes: authority.sourceIdentityHashes,
            sourcePackageHashes: authority.sourcePackageHashes
        },
        snapshots: authority.snapshots,
        toolchain: {
            archiveSha256: authority.verifiedToolchain.archive.sha256,
            executableSha256: authority.verifiedToolchain.executable.sha256,
            sha256: authority.toolchainSha256
        }
    });
}

export function authenticateProductionStaticSunDepthReceipt(
    receipt,
    authority,
    request
) {
    const expectedInput = {
        alphaSemanticsSha256: authority.sourceIdentityHashes.alphaSemanticsSha256,
        casterInventorySha256: authority.sourceIdentityHashes.casterInventorySha256,
        channelSourceSha256: authority.channelSourceSha256,
        finalFileDomainSha256: authority.finalFileDomainSha256,
        geometrySha256: authority.sourcePackageHashes.geometrySha256,
        packageRawSha256: authority.packageRawSha256,
        resolvedSourceSha256: authority.sourcePackageHashes.resolvedSourceSha256,
        usedMaterialsSha256: authority.sourcePackageHashes.usedMaterialsSha256
    };
    const expectedConfiguration = {
        ai529ScriptInventory: authority.ai529ScriptInventory,
        ai529ScriptSha256: authority.ai529ScriptSha256,
        profileSha256: authority.profileSha256,
        rendererScriptSha256: authority.rendererScriptSha256,
        requestSha256: rawCanonicalSha256(request),
        toolchainSha256: authority.toolchainSha256
    };
    if (canonicalJsonStringify(receipt.input)
            !== canonicalJsonStringify(expectedInput)
        || canonicalJsonStringify(receipt.configuration)
            !== canonicalJsonStringify(expectedConfiguration)
        || canonicalJsonStringify(receipt.request)
            !== canonicalJsonStringify(request)) {
        throw new Error(
            'Blender receipt input, configuration, or request differs from independently verified authority'
        );
    }
    if (receipt.profile.id !== authority.compilerProfile.id
        || receipt.profile.rawSha256 !== authority.profileSha256
        || receipt.compiler.archiveSha256
            !== authority.verifiedToolchain.archive.sha256
        || receipt.compiler.executableSha256
            !== authority.verifiedToolchain.executable.sha256
        || receipt.compiler.fixedThreadCount
            !== authority.compilerProfile.backend.threads
        || receipt.identity.cityId !== authority.cityId
        || receipt.identity.alphaSemanticsSha256
            !== authority.sourceIdentityHashes.alphaSemanticsSha256
        || receipt.identity.casterInventorySha256
            !== authority.sourceIdentityHashes.casterInventorySha256) {
        throw new Error(
            'Blender receipt compiler, source, or production identity is not authoritative'
        );
    }
}

export async function readAuthenticatedProductionStaticSunDepthInteriors(
    outputRoot,
    outputs,
    readFileFn
) {
    const interiors = [];
    for (const output of outputs) {
        const filePath = resolvePublishedPath(outputRoot, output.path);
        const bytes = copyBytes(
            await readFileFn(filePath),
            `interior '${output.tileId}'`
        );
        if (bytes.byteLength !== output.byteLength
            || rawSha256(bytes) !== output.sha256) {
            throw new Error(
                `Blender interior '${output.tileId}' differs from its receipt digest`
            );
        }
        interiors.push({
            bytes,
            coordinates: output.coordinates,
            id: output.tileId
        });
    }
    return interiors;
}

export function createProductionPackageSource(receipt) {
    return cloneCanonicalJson({
        alphaSemanticsSha256: receipt.input.alphaSemanticsSha256,
        casterInventorySha256: receipt.input.casterInventorySha256,
        channelSourceSha256: receipt.input.channelSourceSha256,
        cityId: receipt.identity.cityId,
        finalFileDomainSha256: receipt.input.finalFileDomainSha256,
        geometrySha256: receipt.input.geometrySha256,
        packageRawSha256: receipt.input.packageRawSha256,
        resolvedSourceSha256: receipt.input.resolvedSourceSha256,
        schema: 'bus-sim-static-sun-depth-production-source-v1',
        usedMaterialsSha256: receipt.input.usedMaterialsSha256
    });
}

export function createProductionLiveIdentity(receipt, lightingProfileId) {
    return cloneCanonicalJson({
        alphaSemanticsSha256: receipt.identity.alphaSemanticsSha256,
        casterInventorySha256: receipt.identity.casterInventorySha256,
        cityId: receipt.identity.cityId,
        developmentCacheAllowed: true,
        lightingProfileId,
        resolvedSourceSha256: receipt.input.resolvedSourceSha256,
        staticSunDepthSourceSha256: receipt.input.channelSourceSha256
    });
}

function createCertification(receipt, artifact) {
    return cloneCanonicalJson({
        alpha: receipt.alphaCertification,
        casterIdentity: {
            casterInventorySha256: receipt.identity.casterInventorySha256,
            selectedMappingCount: receipt.reconstruction.selectedMappingCount,
            status: 'authenticated-complete-selected-channel-inventory'
        },
        guard: artifact.metrics.guardVerification,
        opaque: receipt.opaqueCertification,
        quantization: artifact.metrics.quantization,
        schema: PRODUCTION_CERTIFICATION_SCHEMA,
        status: 'passed'
    });
}

function validateManifestAuthority(manifest, toolchain) {
    requirePlainObject(manifest, 'validated source manifest');
    requirePlainObject(manifest.hashes, 'validated source manifest.hashes');
    for (const key of ['geometry', 'resolvedSource', 'usedMaterials']) {
        requireSha256(
            manifest.hashes[key],
            `validated source manifest.hashes.${key}`
        );
    }
    const references = manifest.compilerReferences;
    if (!Array.isArray(references) || references.length !== 1) {
        throw new Error(
            'Validated source must contain exactly one pinned compiler reference'
        );
    }
    const reference = references[0];
    const expected = {
        archive: toolchain.archive.fileName,
        archiveSha256: toolchain.archive.officialSha256,
        backend: 'cycles_cpu',
        id: 'blender-5.2.1-lts-cycles-cpu-contract-v1',
        implementationOwner: 'AI_529',
        implementationStatus: 'done',
        schema: 'bus-sim-illumination-compiler-reference-v1'
    };
    for (const [key, value] of Object.entries(expected)) {
        if (reference?.[key] !== value) {
            throw new Error(
                `Validated source compiler reference '${key}' is not pinned`
            );
        }
    }
    const expectedRefs = [
        'prompts/AI_DONE_529_TOOLS_blender_cycles_headless_bake_compiler_DONE.md',
        'specs/graphics/illumination_bake_input.md',
        'specs/graphics/illumination_framework.md'
    ].sort(compareCanonicalStrings);
    const actualRefs = Array.isArray(reference.configurationRefs)
        ? [...reference.configurationRefs].sort(compareCanonicalStrings)
        : [];
    if (new Set(actualRefs).size !== expectedRefs.length
        || canonicalJsonStringify(actualRefs)
            !== canonicalJsonStringify(expectedRefs)) {
        throw new Error(
            'Validated source compiler configuration references are incomplete'
        );
    }
}

function validateManifestSunProfiles(manifest) {
    if (!Array.isArray(manifest.lightingProfiles)
        || !Array.isArray(manifest.channelProfiles)) {
        throw new TypeError(
            'Validated source lighting/channel profile inventories are missing'
        );
    }
    const declared = new Map(
        manifest.lightingProfiles.map((entry) => [entry.id, entry])
    );
    const expected = createAi531StaticSunLightProfiles();
    for (const profile of expected) {
        const actual = declared.get(profile.id);
        if (!actual
            || actual.type !== profile.type
            || actual.angularDiameterDegrees !== 0
            || actual.filterModel !== profile.filterModel
            || canonicalJsonStringify(actual.directionThree)
                !== canonicalJsonStringify(profile.directionThree)) {
            throw new Error(
                `Validated source lighting profile '${profile.id}' differs from the runtime factory`
            );
        }
    }
    const channel = manifest.channelProfiles.find(
        (entry) => entry.id === 'static_sun_depth'
    );
    const expectedIds = expected.map((entry) => entry.id);
    if (!channel
        || canonicalJsonStringify(channel.lightProfileIds)
            !== canonicalJsonStringify(expectedIds)) {
        throw new Error(
            'Validated static_sun_depth channel is not bound to the exact nine-profile inventory'
        );
    }
}

function validatePublication(value, lightingProfileId, inputIdentitySha256) {
    requireExactKeys(value, [
        'files',
        'inputIdentitySha256',
        'lightingProfileId',
        'packageAggregateSha256',
        'packageIndexEntry',
        'schema',
        'status'
    ], 'production publication');
    requireSha256(
        value.packageAggregateSha256,
        'production publication packageAggregateSha256'
    );
    if (value.schema !== PRODUCTION_STATIC_SUN_PUBLICATION_SCHEMA
        || value.status !== 'complete'
        || value.lightingProfileId !== lightingProfileId
        || value.inputIdentitySha256 !== inputIdentitySha256) {
        throw new Error(
            `Existing production publication '${lightingProfileId}' is stale or incomplete`
        );
    }
    if (!Array.isArray(value.files)
        || value.files.length < REQUIRED_PUBLICATION_FILES.length) {
        throw new Error(
            'Existing production publication file inventory is incomplete'
        );
    }
    let previous = null;
    const found = new Set();
    for (const file of value.files) {
        requireExactKeys(
            file,
            ['byteLength', 'path', 'sha256'],
            'production publication file'
        );
        requirePositiveInteger(
            file.byteLength,
            `publication '${file.path}' byteLength`
        );
        requireSha256(file.sha256, `publication '${file.path}' sha256`);
        requireSafeRelativePath(file.path, 'publication file path');
        if (previous !== null
            && compareCanonicalStrings(previous, file.path) >= 0) {
            throw new Error(
                'Production publication files must be unique and canonically sorted'
            );
        }
        previous = file.path;
        found.add(file.path);
    }
    for (const required of REQUIRED_PUBLICATION_FILES) {
        if (!found.has(required)) {
            throw new Error(`Production publication is missing '${required}'`);
        }
    }
    normalizeProfileResult(value.packageIndexEntry, lightingProfileId);
}

function assertRepeatPublicationIdentical(baseline, candidate, interiorPaths) {
    const selectedPaths = [
        'descriptor.json',
        PACKAGE_FILE_NAME,
        'release_certification.json',
        'static_sun_depth.rg8',
        ...interiorPaths
    ].sort(compareCanonicalStrings);
    const baselineFiles = new Map(
        baseline.files.map((entry) => [entry.path, entry])
    );
    const candidateFiles = new Map(
        candidate.files.map((entry) => [entry.path, entry])
    );
    if (baseline.packageAggregateSha256 !== candidate.packageAggregateSha256) {
        throw new Error(
            'Repeat production package aggregate differs from the promoted baseline'
        );
    }
    for (const relativePath of selectedPaths) {
        const left = baselineFiles.get(relativePath);
        const right = candidateFiles.get(relativePath);
        if (!left || !right
            || left.byteLength !== right.byteLength
            || left.sha256 !== right.sha256) {
            throw new Error(
                `Repeat production output '${relativePath}' differs from the promoted baseline`
            );
        }
    }
}

function validateLiveIdentity(value, lightingProfileId) {
    requireExactKeys(value, [
        'alphaSemanticsSha256',
        'casterInventorySha256',
        'cityId',
        'developmentCacheAllowed',
        'lightingProfileId',
        'resolvedSourceSha256',
        'staticSunDepthSourceSha256'
    ], `live identity '${lightingProfileId}'`);
    if (value.cityId !== EXPECTED_CITY_ID
        || value.developmentCacheAllowed !== true
        || value.lightingProfileId !== lightingProfileId) {
        throw new Error(
            `live identity '${lightingProfileId}' has invalid ownership`
        );
    }
    for (const key of [
        'alphaSemanticsSha256',
        'casterInventorySha256',
        'resolvedSourceSha256',
        'staticSunDepthSourceSha256'
    ]) {
        requireSha256(
            value[key],
            `live identity '${lightingProfileId}'.${key}`
        );
    }
}

function normalizeProfileResult(value, lightingProfileId) {
    requirePlainObject(value, `profile result '${lightingProfileId}'`);
    const entry = {
        lightingProfileId: value.lightingProfileId,
        liveIdentity: value.liveIdentity,
        packagePath: value.packagePath
    };
    requireExactKeys(
        entry,
        ['lightingProfileId', 'liveIdentity', 'packagePath'],
        'normalized profile result'
    );
    if (entry.lightingProfileId !== lightingProfileId) {
        throw new Error(
            `Profile result '${lightingProfileId}' has mismatched lightingProfileId`
        );
    }
    validateLiveIdentity(entry.liveIdentity, lightingProfileId);
    requireCanonicalPackagePath(entry.packagePath);
    return cloneCanonicalJson(entry);
}

function getNamedHash(entries, id, label) {
    if (!Array.isArray(entries)) throw new TypeError(`${label} must be an array`);
    const matches = entries.filter((entry) => entry?.id === id);
    if (matches.length !== 1) {
        throw new Error(`${label} must contain exactly one '${id}' entry`);
    }
    requireSha256(matches[0].sha256, `${label}.${id}.sha256`);
    return matches[0].sha256;
}

function requireProfile(profile) {
    requirePlainObject(profile, 'static-sun profile');
    if (!PROFILE_ID_PATTERN.test(profile.id)
        || profile.type !== 'directional_sun'
        || !Array.isArray(profile.directionThree)
        || profile.directionThree.length !== 3
        || profile.directionThree.some((value) => !Number.isFinite(value))) {
        throw new TypeError('static-sun profile is invalid');
    }
    const length = Math.hypot(...profile.directionThree);
    if (Math.abs(length - 1) > 1e-12) {
        throw new Error(`static-sun profile '${profile.id}' is not normalized`);
    }
}

function requireSnapshot(snapshotById, id) {
    const snapshot = snapshotById.get(id);
    if (!snapshot) throw new Error(`Authoritative snapshot '${id}' is missing`);
    return snapshot;
}

function productionProfilePath(artifactRoot, profileId) {
    return path.join(
        artifactRoot,
        'production',
        safeProfileDirectory(profileId)
    );
}

function safeProfileDirectory(profileId) {
    if (!PROFILE_ID_PATTERN.test(profileId)) {
        throw new TypeError('Unsafe production profile directory ID');
    }
    return profileId;
}

function repositoryRelativePackagePath(repoRoot, absolutePath) {
    const relative = path.relative(repoRoot, absolutePath).replaceAll('\\', '/');
    requireCanonicalPackagePath(relative);
    return relative;
}

function requireCanonicalPackagePath(value) {
    if (typeof value !== 'string'
        || !value.endsWith('.ilpkg')
        || value.includes('\\')
        || value.startsWith('/')
        || !/^[A-Za-z0-9._/-]+$/.test(value)
        || path.posix.normalize(value) !== value
        || value.split('/').includes('..')
        || !value.startsWith('assets/baked_lighting/shadows/')) {
        throw new TypeError(
            'Production packagePath must be repository-relative below assets/baked_lighting/shadows'
        );
    }
}

function resolvePublishedPath(root, relativePath) {
    requireSafeRelativePath(relativePath, 'published relative path');
    const absoluteRoot = path.resolve(root);
    const resolved = path.resolve(
        absoluteRoot,
        ...relativePath.split('/')
    );
    if (!isPathInside(absoluteRoot, resolved, false)) {
        throw new Error(
            `Published path '${relativePath}' escapes its production root`
        );
    }
    return resolved;
}

function requireSafeRelativePath(value, label) {
    if (typeof value !== 'string'
        || !value
        || value.includes('\\')
        || value.startsWith('/')
        || /^[A-Za-z]:/.test(value)
        || path.posix.normalize(value) !== value
        || value.split('/').includes('..')) {
        throw new TypeError(
            `${label} must be a canonical safe relative path`
        );
    }
}

function isPathInside(root, candidate, allowEqual) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    return (allowEqual && relative === '')
        || (relative !== ''
            && !relative.startsWith('..')
            && !path.isAbsolute(relative));
}

async function assertPathAbsent(targetPath, lstatFn) {
    try {
        await lstatFn(targetPath);
    } catch (error) {
        if (isMissing(error)) return;
        throw error;
    }
    throw new Error(
        `Production publication destination already exists: ${targetPath}`
    );
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
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
        throw new Error(`${label} is not valid UTF-8`, { cause: error });
    }
    let value;
    try {
        value = JSON.parse(text);
    } catch (error) {
        throw new Error(`${label} is not valid JSON`, { cause: error });
    }
    if (canonicalJsonStringify(value) !== text) {
        throw new Error(`${label} is not canonical JSON`);
    }
    return value;
}

function copyBytes(value, label) {
    if (value instanceof Uint8Array) return value.slice();
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(
            value.buffer,
            value.byteOffset,
            value.byteLength
        ).slice();
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

function requireExactKeys(value, expected, label) {
    const object = requirePlainObject(value, label);
    const actual = Object.keys(object).sort(compareCanonicalStrings);
    const wanted = [...expected].sort(compareCanonicalStrings);
    if (canonicalJsonStringify(actual) !== canonicalJsonStringify(wanted)) {
        throw new TypeError(
            `${label} must contain exactly ${wanted.join(', ')}`
        );
    }
}

function requireSha256(value, label) {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
        throw new TypeError(`${label} must be a lowercase SHA-256`);
    }
}

function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new TypeError(`${label} must be a positive safe integer`);
    }
}

function requireNonNegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${label} must be a non-negative safe integer`);
    }
}

function isMissing(error) {
    return Boolean(
        error
        && typeof error === 'object'
        && error.code === 'ENOENT'
    );
}
