#!/usr/bin/env node
// Builds a fail-closed AI 531 cutout field from Blender candidates and native textureGrad.

import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {lstat, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
    canonicalJsonBytes,
    canonicalJsonStringify
} from '../../src/app/illumination/bake_source/CanonicalJson.js';
import {validateResolvedCityBakePackage} from
    '../../src/graphics/illumination/bake_source/BakeSourceValidation.js';
import {createIsolatedBlenderEnvironment} from
    '../illumination_bake_compiler/src/CompilerOrchestrator.mjs';
import {runBlenderProcess} from
    '../illumination_bake_compiler/src/BlenderProcess.mjs';
import {
    createProductionStaticSunRequest,
    prepareProductionAuthority,
    selectProductionStaticSunProfiles
} from './src/ProductionOrchestrator.mjs';

export const TEXTURE_GRAD_FIELD_RECEIPT_SCHEMA =
    'ai531-production-alpha-cutout-native-field-receipt-v3';
export const TEXTURE_GRAD_FIELD_SESSION_SCHEMA =
    'ai531-production-alpha-cutout-texture-grad-field-session-v3';
export const TEXTURE_GRAD_FIELD_METHOD =
    'headless-blender-full-lattice-candidates-three-r183-native-texture-grad-v3';
const IMPLICIT_GRADIENT_FIELD_RECEIPT_SCHEMA =
    'ai531-production-alpha-cutout-native-field-receipt-v4';
const IMPLICIT_GRADIENT_FIELD_SESSION_SCHEMA =
    'ai531-production-alpha-cutout-implicit-gradient-field-session-v4';
const IMPLICIT_GRADIENT_FIELD_METHOD =
    'headless-blender-full-lattice-candidates-three-r183-native-implicit-gradient-v4';
const CANDIDATE_RECEIPT_SCHEMA =
    'ai531-production-alpha-cutout-full-lattice-candidate-receipt-v1';
const CANDIDATE_RECORD_BYTE_LENGTH = 40;
const MAXIMUM_CHUNK_RECORDS = 65_536;
const NATIVE_FOLIAGE_COVERAGE =
    'all-visible-material-groups-of-authenticated-cutout-meshes-v1';
const TREE_QUALITY_STORAGE_KEY = 'bus_sim.tree_quality.v1';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const artifactRoot = path.join(repoRoot, 'tests/artifacts/illumination_531');
const runnerPath = fileURLToPath(import.meta.url);
const defaults = Object.freeze({
    ai529Directory: path.join(repoRoot, 'tools/illumination_bake_compiler/blender'),
    archivePath: path.join(
        repoRoot,
        'tests/artifacts/illumination_529/toolchain/blender-5.2.1-windows-x64.zip'
    ),
    executablePath: path.join(
        repoRoot,
        'tests/artifacts/illumination_529/toolchain/portable',
        'blender-5.2.1-windows-x64/blender.exe'
    ),
    inputPath: path.join(
        repoRoot,
        'tests/artifacts/illumination_528/packages/bigcity2/ai531-production/bigcity2.bsib'
    ),
    port: 4173,
    producerPath: path.join(
        here,
        'blender/production_alpha_cutout_sparse_samples.py'
    ),
    profileId: 'ai527.sun.az135.el08',
    profilePath: path.join(
        repoRoot,
        'tools/illumination_bake_compiler/profiles/proof_cpu_12.v1.json'
    ),
    rendererPath: path.join(here, 'blender/production_static_sun.py'),
    silhouetteCompilerPath: path.join(
        here,
        'blender/compile_cutout_silhouettes.py'
    ),
    timeoutMs: 3_600_000,
    toolchainPath: path.join(
        repoRoot,
        'tools/illumination_bake_compiler/toolchain.v1.json'
    )
});

export function parseTextureGradFieldArguments(argv) {
    const options = {...defaults};
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') return Object.freeze({help: true});
        if (flag === '--candidate-only') {
            options.candidateOnly = true;
            continue;
        }
        const value = argv[index + 1];
        if (typeof value !== 'string' || !value || value.startsWith('--')) {
            throw new TypeError(`Missing value for ${flag}`);
        }
        index += 1;
        switch (flag) {
            case '--profile-id': options.profileId = value; break;
            case '--output-root':
                options.outputRoot = assertArtifactChild(value, false);
                break;
            case '--candidate-root':
                options.candidateRoot = assertArtifactChild(value, true);
                break;
            case '--input': options.inputPath = path.resolve(repoRoot, value); break;
            case '--production-authority-root':
                options.productionAuthorityRoot = assertArtifactChild(value, true);
                break;
            case '--sampling':
                if (!['explicit-texture-grad', 'implicit-gradient'].includes(value)) {
                    throw new TypeError('--sampling must be explicit-texture-grad or implicit-gradient');
                }
                options.samplingMode = value;
                break;
            case '--url': options.baseUrl = requireLoopbackUrl(value); break;
            case '--port': options.port = positiveInteger(value, flag); break;
            case '--timeout-ms': options.timeoutMs = positiveInteger(value, flag); break;
            default: throw new TypeError(`Unknown option '${flag}'`);
        }
    }
    if (!options.outputRoot) throw new TypeError('--output-root is required');
    options.samplingMode ??= 'explicit-texture-grad';
    selectProductionStaticSunProfiles([options.profileId]);
    return Object.freeze(options);
}

export function textureGradFieldUsage() {
    return `AI 531 full-lattice native textureGrad field

Usage:
  node tools/static_sun_depth/build_alpha_cutout_texture_grad_field.mjs \\
    --profile-id <release-profile> --output-root <artifact-child>

Options:
  --input <path>           Authenticated current BigCity2 BSIB source
  --candidate-root <path>  Reuse one complete authenticated Blender candidate root
  --candidate-only         Stop after authenticating the headless Blender candidate lattice
  --sampling <mode>        explicit-texture-grad (default) or diagnostic implicit-gradient
  --production-authority-root <path>  Optional legacy descriptor cross-check
  --url <loopback-url>     Reuse an existing repository static server
  --port <number>          Preferred server port (default 4173)
  --timeout-ms <ms>        Pinned Blender timeout (default 3600000)
`;
}

async function run(argv = process.argv.slice(2)) {
    const options = parseTextureGradFieldArguments(argv);
    if (options.help) {
        process.stdout.write(textureGradFieldUsage());
        return;
    }
    if (os.endianness() !== 'LE') {
        throw new Error('AI 531 field output requires a little-endian producer');
    }
    await requireNewRoot(options.outputRoot);
    await mkdir(path.dirname(options.outputRoot), {recursive: true});
    await mkdir(options.outputRoot, {recursive: false});
    const profile = selectProductionStaticSunProfiles([options.profileId])[0];
    const request = createProductionStaticSunRequest(profile);
    const requestBytes = canonicalJsonBytes(request);
    const requestPath = path.join(options.outputRoot, 'candidate_request.json');
    await writeFile(requestPath, requestBytes);
    const [inputBytes, profileBytes] = await Promise.all([
        readFile(options.inputPath),
        readFile(options.profilePath)
    ]);
    const compilerProfile = JSON.parse(profileBytes);
    if (request.lightingProfileId !== profile.id
        || canonicalJsonStringify(request.sunPointDirectionWorld)
            !== canonicalJsonStringify(profile.directionThree)) {
        throw new Error('Production request and selected release profile differ');
    }
    const validated = await validateResolvedCityBakePackage(inputBytes);
    if (validated.report?.valid !== true) {
        throw new Error('The authenticated BigCity2 source package is invalid');
    }
    const authority = await prepareProductionAuthority(options);
    const candidateRoot = options.candidateRoot
        ?? path.join(options.outputRoot, 'candidates');
    if (!options.candidateRoot) {
        await runCandidateBlender({
            authority,
            candidateRoot,
            options,
            requestBytes,
            requestPath
        });
    }
    const candidate = await authenticateCandidateRoot({
        authority,
        candidateRoot,
        profile,
        request
    });
    if (options.candidateOnly) {
        process.stdout.write(canonicalJsonStringify({
            candidateCount: candidate.receipt.capture.candidateCount,
            candidateRoot: path.relative(repoRoot, candidateRoot).replaceAll('\\', '/'),
            receiptSha256: candidate.sha256,
            schema: CANDIDATE_RECEIPT_SCHEMA,
            status: 'complete'
        }) + '\n');
        return;
    }
    let descriptorBytes = candidate.bytes;
    if (options.productionAuthorityRoot) {
        const profileRoot = path.join(options.productionAuthorityRoot, profile.id);
        const [legacyRequestBytes, legacyDescriptorBytes] = await Promise.all([
            readFile(path.join(profileRoot, 'request.json')),
            readFile(path.join(profileRoot, 'descriptor.json'))
        ]);
        if (!Buffer.from(legacyRequestBytes).equals(Buffer.from(requestBytes))) {
            throw new Error('Legacy production authority request differs from the current request');
        }
        descriptorBytes = legacyDescriptorBytes;
    }
    const contract = fieldContract(options.samplingMode);
    const liveSourceToCacheLightAxisTransform = options.samplingMode === 'implicit-gradient'
        ? deriveLiveSourceToCacheLightAxisTransform({
            identity: {
                basis: candidate.receipt.layout.basis,
                sampling: request.sampling
            }
        })
        : null;
    const cutoutMappings = validated.manifest.casterMappings
        .filter((entry) => entry.channelRelevance?.static_sun_depth === true
            && entry.coverageMode === 'cutout');
    const cutoutCasterIds = cutoutMappings
        .map((entry) => entry.id)
        .sort(compareStrings);
    const nativeOwnedMeshInstanceIds = [...new Set(
        cutoutMappings.map((entry) => entry.meshInstanceId)
    )].sort(compareStrings);
    if (cutoutCasterIds.length !== 124
        || canonicalJsonStringify(candidate.receipt.capture.cutoutCasterIds)
            !== canonicalJsonStringify(cutoutCasterIds)) {
        throw new Error('Candidate caster inventory differs from authenticated source');
    }
    const expectedTreeQuality = resolveAuthenticatedTreeQuality(cutoutCasterIds);

    const browser = await beginNativeSampler({
        baseUrl: options.baseUrl,
        expectedCutoutCasterCount: cutoutCasterIds.length,
        expectedTreeQuality,
        liveSourceToCacheLightAxisTransform,
        port: options.port,
        profile,
        samplingMode: options.samplingMode
    });
    if (browser.diagnostics.length > 0) {
        await browser.close();
        throw new Error(
            `Native sampler initialization emitted diagnostics: `
            + canonicalJsonStringify({
                diagnostics: browser.diagnostics,
                networkLedger: browser.networkLedger()
            })
        );
    }
    const resultsRoot = path.join(options.outputRoot, 'native_results');
    await Promise.all([
        mkdir(path.join(options.outputRoot, 'tiles'), {recursive: false}),
        mkdir(resultsRoot, {recursive: false})
    ]);
    const candidateAggregate = createHash('sha256');
    const resultProjection = [];
    const outputs = [];
    let stableCaptureIdentity = null;
    let totalAcceptedCandidates = 0;
    const captureOrder = [
        ...candidate.receipt.capture.outputs.filter(
            (output) => output.candidateCount > 0
        ),
        ...candidate.receipt.capture.outputs.filter(
            (output) => output.candidateCount === 0
        )
    ];
    try {
        for (const candidateOutput of captureOrder) {
            const tileResult = await evaluateTile({
                binding: candidate.receipt.capture.binding,
                browser,
                candidateAggregate,
                candidateOutput,
                candidateRoot,
                expectedSourceTriangleCount:
                    candidate.receipt.capture.sourceCutoutTriangleCount,
                fieldRoot: options.outputRoot,
                layout: candidate.receipt.layout.layout,
                liveSourceToCacheLightAxisTransform,
                profile,
                resultsRoot,
                samplingMode: options.samplingMode,
                stableCaptureIdentity
            });
            stableCaptureIdentity ??= tileResult.captureIdentity;
            totalAcceptedCandidates += tileResult.acceptedCandidateCount;
            resultProjection.push(...tileResult.resultProjection);
            outputs.push(tileResult.output);
            process.stdout.write(
                `AI531_TEXTURE_GRAD_TILE=${candidateOutput.tileId} `
                + `candidates=${candidateOutput.candidateCount} `
                + `occupied=${tileResult.output.occupiedTexelCount}\n`
            );
        }
    } finally {
        await browser.close();
    }
    outputs.sort((left, right) => left.tileIndex - right.tileIndex);
    resultProjection.sort((left, right) => (
        left.tileIndex - right.tileIndex || left.chunkIndex - right.chunkIndex
    ));
    if (browser.diagnostics.length > 0) {
        throw new Error(
            `Native sampler emitted diagnostics: ${canonicalJsonStringify(browser.diagnostics)}`
        );
    }
    if (candidateAggregate.digest('hex')
            !== candidate.receipt.capture.aggregateCandidateBytesSha256) {
        throw new Error('Candidate aggregate bytes changed during native sampling');
    }
    const receipt = await buildUnpromotedReceipt({
        candidate,
        compilerProfile,
        contract,
        cutoutCasterIds,
        descriptorBytes,
        inputBytes,
        nativeOwnedMeshInstanceIds,
        outputs,
        profile,
        resultProjection,
        liveSourceToCacheLightAxisTransform,
        stableCaptureIdentity,
        totalAcceptedCandidates
    });
    const receiptBytes = canonicalJsonBytes(receipt);
    await writeFile(
        path.join(options.outputRoot, 'native_cutout_field_receipt.json'),
        receiptBytes
    );
    process.stdout.write(canonicalJsonStringify({
        candidateCount: candidate.receipt.capture.candidateCount,
        occupiedTexelCount: receipt.aggregate.occupiedTexelCount,
        outputProjectionSha256:
            receipt.source.nativeResultAuthority.outputProjectionSha256,
        receiptSha256: sha256(receiptBytes),
        resultProjectionSha256:
            receipt.source.nativeResultAuthority.resultProjectionSha256,
        schema: contract.receiptSchema,
        status: 'complete_unpromoted'
    }) + '\n');
}

async function buildUnpromotedReceipt(context) {
    const {
        candidate,
        compilerProfile,
        contract,
        cutoutCasterIds,
        descriptorBytes,
        inputBytes,
        nativeOwnedMeshInstanceIds,
        outputs,
        profile,
        resultProjection,
        liveSourceToCacheLightAxisTransform,
        stableCaptureIdentity,
        totalAcceptedCandidates
    } = context;
    if (!stableCaptureIdentity) {
        throw new Error('Native sampler produced no stable identity');
    }
    const outputProjection = outputs.map((output) => ({
        byteLength: output.byteLength,
        coordinates: output.coordinates,
        occupiedTexelCount: output.occupiedTexelCount,
        path: output.path,
        sha256: output.sha256,
        tileId: output.tileId,
        tileIndex: output.tileIndex,
        transparentTexelCount: output.transparentTexelCount
    }));
    const aggregate = {
        occupiedTexelCount: sum(outputs, 'occupiedTexelCount'),
        outputByteLength: sum(outputs, 'byteLength'),
        outputCount: outputs.length,
        requiredOutputCount: candidate.receipt.layout.layout.layerCount,
        transparentTexelCount: sum(outputs, 'transparentTexelCount')
    };
    const producerPaths = [
        runnerPath,
        path.join(here, 'browser/ProductionAlphaCutoutTextureGradCapture.js'),
        defaults.producerPath,
        defaults.silhouetteCompilerPath,
        defaults.rendererPath
    ];
    const producers = await Promise.all(producerPaths.map(sourceDescriptor));
    const cameraOriginDepthMeters =
        candidate.receipt.layout.depth.minDepthMeters
        - compilerProfile.camera.clipStartMeters;
    const sessionCamera = {
        farMeters: float32(
            candidate.receipt.layout.depth.maxDepthMeters
            - cameraOriginDepthMeters
            + compilerProfile.camera.clipStartMeters
        ),
        nearMeters: float32(compilerProfile.camera.clipStartMeters * 0.5),
        originDepthMetersInCacheBasis: cameraOriginDepthMeters,
        projection: 'orthographic-linear-depth-v1'
    };
    const sourceTriangleRecord =
        candidate.receipt.capture.sourceTriangleAuthority;
    return {
        aggregate,
        layout: {
            basis: candidate.receipt.layout.basis,
            depth: candidate.receipt.layout.depth,
            layout: candidate.receipt.layout.layout,
            tilesSha256: sha256(canonicalJsonBytes(candidate.receipt.layout.tiles))
        },
        method: contract.method,
        outputs,
        performance: {
            eligibleForPromotion: false,
            reason: 'host-load-and-gpu-contention-declared-by-user'
        },
        producers,
        productionEligible: false,
        profile: {directionThree: profile.directionThree, id: profile.id},
        schema: contract.receiptSchema,
        session: {
            begin: {
                camera: sessionCamera,
                candidateAuthority: {
                    candidateCount: candidate.receipt.capture.candidateCount,
                    candidateReceiptSha256: candidate.sha256,
                    sourceTriangleAuthoritySha256: sourceTriangleRecord.sha256
                },
                casterCount: cutoutCasterIds.length,
                casterIds: cutoutCasterIds,
                casterMeshCount: nativeOwnedMeshInstanceIds.length,
                graphics: stableCaptureIdentity.graphics,
                ...(liveSourceToCacheLightAxisTransform ? {
                    liveSourceToCacheLightAxisTransform
                } : {}),
                layout: {
                    interiorPixels:
                        candidate.receipt.layout.layout.interiorPixels,
                    layerCount: candidate.receipt.layout.layout.layerCount,
                    tileCount: candidate.receipt.layout.layout.tileCount,
                    tileSizeMeters:
                        candidate.receipt.layout.layout.tileSizeMeters
                },
                lightingProfileId: profile.id,
                method: contract.method,
                nativeFoliageCoverage: NATIVE_FOLIAGE_COVERAGE,
                nativeOwnedMeshCount: nativeOwnedMeshInstanceIds.length,
                schema: contract.sessionSchema,
                status: 'ready',
                texture: stableCaptureIdentity.texture
            },
            diagnostics: [],
            end: {
                capturedTileCount: outputs.length,
                method: contract.method,
                schema: contract.sessionSchema,
                stateRestoration: 'candidate-and-native-sampler-disposed-v1',
                status: 'disposed'
            }
        },
        source: {
            bsib: {byteLength: inputBytes.byteLength, sha256: sha256(inputBytes)},
            candidateAuthority: {
                aggregateCandidateBytesSha256:
                    candidate.receipt.capture.aggregateCandidateBytesSha256,
                candidateCount: candidate.receipt.capture.candidateCount,
                receiptByteLength: candidate.bytes.byteLength,
                receiptSha256: candidate.sha256,
                sourceTriangleAuthority: sourceTriangleRecord
            },
            cutoutCasterCount: cutoutCasterIds.length,
            cutoutCasterIdsSha256:
                sha256(canonicalJsonBytes(cutoutCasterIds)),
            descriptor: {
                byteLength: descriptorBytes.byteLength,
                sha256: sha256(descriptorBytes)
            },
            layoutReceipt: {
                byteLength: candidate.bytes.byteLength,
                compilerSignatureSha256:
                    sha256(canonicalJsonBytes(candidate.receipt.compiler)),
                sha256: candidate.sha256
            },
            nativeOwnedMeshInstanceCount: nativeOwnedMeshInstanceIds.length,
            nativeOwnedMeshInstanceIdsSha256:
                sha256(canonicalJsonBytes(nativeOwnedMeshInstanceIds)),
            nativeResultAuthority: {
                acceptedCandidateCount: totalAcceptedCandidates,
                outputProjectionSha256:
                    sha256(canonicalJsonBytes(outputProjection)),
                resultChunkCount: resultProjection.length,
                resultProjectionSha256:
                    sha256(canonicalJsonBytes(resultProjection))
            }
        },
        status: 'complete_unpromoted'
    };
}

async function runCandidateBlender({
    authority,
    candidateRoot,
    options,
    requestBytes,
    requestPath
}) {
    const stage = path.join(options.outputRoot, '.candidate_blender_stage');
    await mkdir(stage, {recursive: false});
    const isolated = createIsolatedBlenderEnvironment({
        executablePath: options.executablePath,
        stagingPath: stage
    });
    for (const directory of isolated.directories) {
        await mkdir(directory, {recursive: true});
    }
    const [producerBytes, silhouetteBytes] = await Promise.all([
        readFile(options.producerPath),
        readFile(options.silhouetteCompilerPath)
    ]);
    const result = await runBlenderProcess({
        cwd: path.dirname(options.executablePath),
        env: isolated.env,
        executablePath: options.executablePath,
        maxOutputBytes: 1_048_576,
        pythonScriptPath: options.producerPath,
        scriptArgs: [
            '--input', options.inputPath,
            '--output', candidateRoot,
            '--profile', options.profilePath,
            '--request', requestPath,
            '--archive-sha256', authority.verifiedToolchain.archive.sha256,
            '--executable-sha256', authority.verifiedToolchain.executable.sha256,
            '--toolchain-sha256', authority.toolchainSha256,
            '--profile-sha256', authority.profileSha256,
            '--request-sha256', sha256(requestBytes),
            '--producer-script-sha256', sha256(producerBytes),
            '--silhouette-compiler-sha256', sha256(silhouetteBytes),
            '--production-renderer-sha256', authority.rendererScriptSha256,
            '--ai529-script-sha256', authority.ai529ScriptSha256,
            '--package-raw-sha256', authority.packageRawSha256,
            '--emit-full-lattice-candidates'
        ],
        timeoutMs: options.timeoutMs
    });
    const marker = parseReceiptMarker(result.stdout);
    const receiptBytes = await readFile(path.join(candidateRoot, marker.path));
    if (receiptBytes.byteLength !== marker.byteLength
        || sha256(receiptBytes) !== marker.sha256) {
        throw new Error('Headless Blender candidate receipt differs from stdout');
    }
}

export async function authenticateCandidateRoot({authority, candidateRoot, profile, request}) {
    const receiptPath = path.join(candidateRoot, 'capture_receipt.json');
    const entry = await lstat(receiptPath);
    if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error('Candidate receipt must be a regular non-symbolic file');
    }
    const bytes = new Uint8Array(await readFile(receiptPath));
    const receipt = parseCanonicalJson(bytes, 'candidate receipt');
    if (receipt.schema !== CANDIDATE_RECEIPT_SCHEMA
        || receipt.status !== 'complete'
        || receipt.productionEligible !== false
        || receipt.input?.packageRawSha256 !== authority.packageRawSha256
        || receipt.profile?.id !== profile.id
        || canonicalJsonStringify(receipt.profile?.directionThree)
            !== canonicalJsonStringify(request.sunPointDirectionWorld)
        || receipt.capture?.status !== 'captured'
        || receipt.capture?.recordByteLength !== CANDIDATE_RECORD_BYTE_LENGTH
        || receipt.capture?.compilerVersionIdentity?.schema
            !== 'ai531-cutout-full-lattice-candidates-v1') {
        throw new Error('Candidate receipt identity is invalid');
    }
    const triangle = receipt.capture.sourceTriangleAuthority;
    const trianglePath = resolveInside(candidateRoot, triangle.path);
    const triangleEntry = await lstat(trianglePath);
    if (!triangleEntry.isFile() || triangleEntry.isSymbolicLink()) {
        throw new Error('Candidate source-triangle authority is unsafe');
    }
    const triangleBytes = new Uint8Array(await readFile(trianglePath));
    if (triangleBytes.byteLength !== triangle.byteLength
        || sha256(triangleBytes) !== triangle.sha256) {
        throw new Error('Candidate source-triangle authority changed');
    }
    const triangleAuthority = parseCanonicalJson(
        triangleBytes,
        'candidate source-triangle authority'
    );
    if (triangleAuthority.schema
            !== 'ai531-production-alpha-cutout-source-triangle-authority-v1'
        || triangleAuthority.triangles?.length
            !== receipt.capture.sourceCutoutTriangleCount) {
        throw new Error('Candidate source-triangle authority is incomplete');
    }
    const layout = receipt.layout?.layout;
    if (!Array.isArray(receipt.capture.outputs)
        || receipt.capture.outputs.length !== layout?.layerCount
        || layout.tileCount?.[0] * layout.tileCount?.[1] !== layout.layerCount) {
        throw new Error('Candidate output lattice is incomplete');
    }
    let candidateCount = 0;
    let chunkCount = 0;
    for (let tileIndex = 0; tileIndex < receipt.capture.outputs.length; tileIndex += 1) {
        const output = receipt.capture.outputs[tileIndex];
        const coordinates = [
            tileIndex % layout.tileCount[0],
            Math.floor(tileIndex / layout.tileCount[0])
        ];
        const tileId =
            `tile_${String(coordinates[0]).padStart(4, '0')}_`
            + String(coordinates[1]).padStart(4, '0');
        if (output.tileIndex !== tileIndex
            || output.tileId !== tileId
            || canonicalJsonStringify(output.coordinates)
                !== canonicalJsonStringify(coordinates)
            || !Array.isArray(output.chunks)) {
            throw new Error(`Candidate tile ${tileIndex} is noncanonical`);
        }
        let tileCandidateCount = 0;
        for (let index = 0; index < output.chunks.length; index += 1) {
            const chunk = output.chunks[index];
            const expectedPath =
                `chunks/${tileId}/candidate_${String(index).padStart(6, '0')}.bin`;
            if (chunk.chunkIndex !== index || chunk.path !== expectedPath
                || !Number.isSafeInteger(chunk.recordCount)
                || chunk.recordCount < 1
                || chunk.recordCount > MAXIMUM_CHUNK_RECORDS
                || chunk.byteLength
                    !== chunk.recordCount * CANDIDATE_RECORD_BYTE_LENGTH
                || !isSha256(chunk.sha256)) {
                throw new Error(`Candidate chunk ${tileIndex}:${index} is invalid`);
            }
            const chunkEntry = await lstat(resolveInside(candidateRoot, chunk.path));
            if (!chunkEntry.isFile() || chunkEntry.isSymbolicLink()) {
                throw new Error(`Candidate chunk ${tileIndex}:${index} is unsafe`);
            }
            tileCandidateCount += chunk.recordCount;
            chunkCount += 1;
        }
        if (tileCandidateCount !== output.candidateCount) {
            throw new Error(`Candidate tile ${tileIndex} count differs`);
        }
        candidateCount += tileCandidateCount;
    }
    if (candidateCount !== receipt.capture.candidateCount
        || chunkCount !== receipt.capture.chunkCount) {
        throw new Error('Candidate aggregate inventory differs');
    }
    return {bytes, receipt, sha256: sha256(bytes)};
}

async function beginNativeSampler({
    baseUrl: requestedBaseUrl,
    expectedCutoutCasterCount,
    expectedTreeQuality,
    liveSourceToCacheLightAxisTransform,
    port: preferredPort,
    profile,
    samplingMode
}) {
    let server = null;
    let browser = null;
    const diagnostics = [];
    const networkLedger = new Map();
    const pendingRequests = new Set();
    const port = requestedBaseUrl ? preferredPort : await findFreePort(preferredPort);
    const baseUrl = requestedBaseUrl ?? `http://127.0.0.1:${port}`;
    try {
        if (!requestedBaseUrl) {
            server = spawn(process.execPath, ['tests/headless/e2e/static_server.mjs'], {
                cwd: repoRoot,
                env: {...process.env, PORT: String(port)},
                stdio: ['ignore', 'ignore', 'pipe']
            });
            let serverError = '';
            server.stderr.on('data', (chunk) => { serverError += String(chunk); });
            await waitForServer(baseUrl).catch((error) => {
                throw new Error(`${error.message}\n${serverError.trim()}`);
            });
        }
        const chromePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH
            || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
        browser = await chromium.launch({
            headless: true,
            ...(existsSync(chromePath) ? {executablePath: chromePath} : {}),
            args: [
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding'
            ]
        });
        const page = await browser.newPage({viewport: {width: 1280, height: 720}});
        page.setDefaultTimeout(0);
        const ledgerFor = (request) => {
            const url = request.url();
            let entry = networkLedger.get(url);
            if (!entry) {
                entry = {failed: 0, finished: 0, started: 0, url};
                networkLedger.set(url, entry);
            }
            return entry;
        };
        page.on('request', (request) => {
            pendingRequests.add(request);
            ledgerFor(request).started += 1;
        });
        page.on('requestfinished', (request) => {
            pendingRequests.delete(request);
            ledgerFor(request).finished += 1;
        });
        page.on('pageerror', (error) => diagnostics.push({
            kind: 'pageerror',
            message: error?.message ?? String(error)
        }));
        page.on('console', (message) => {
            if (message.type() === 'error') {
                diagnostics.push({
                    kind: 'console.error',
                    message: message.text()
                });
            } else if (message.type() === 'warning'
                && message.text().startsWith('[TreeGenerator]')) {
                diagnostics.push({
                    kind: 'console.warning',
                    message: message.text()
                });
            }
        });
        page.on('requestfailed', (request) => {
            pendingRequests.delete(request);
            ledgerFor(request).failed += 1;
            diagnostics.push({
                kind: 'requestfailed',
                message: request.failure()?.errorText ?? 'unknown request failure',
                method: request.method(),
                resourceType: request.resourceType(),
                url: request.url()
            });
        });
        page.on('response', (response) => {
            if (response.status() >= 400) {
                diagnostics.push({
                    kind: 'response',
                    message: String(response.status()),
                    url: response.url()
                });
            }
        });
        await page.addInitScript(({key, value}) => {
            window.localStorage.setItem(key, value);
        }, {key: TREE_QUALITY_STORAGE_KEY, value: expectedTreeQuality});
        await page.goto(
            `${baseUrl}/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0`
        );
        await page.waitForFunction(() => (
            window.__busSim?.sm?.currentName === 'game_mode'
            && window.__busSim?.sm?.current?.city?.cityId === 'bigcity2'
        ), null, {timeout: 180_000});
        const readiness = await page.evaluate(async ({profile: selectedProfile}) => {
            const THREE = await import('three');
            const probe = await import(
                './tools/static_sun_depth/browser/ProductionAlphaCutoutTextureGradCapture.js'
            );
            const {engine, sm} = window.__busSim;
            const state = sm.current;
            const city = state.city;
            engine.stop();
            if (state.gameLoop) state.gameLoop.paused = true;
            await Promise.all([
                engine.waitForLightingReady?.(),
                city.world?.trees?.readyPromise
            ].filter(Boolean));
            const direction = selectedProfile.directionThree;
            const elevationDeg = THREE.MathUtils.radToDeg(Math.asin(direction[1]));
            const azimuthDeg = (
                THREE.MathUtils.radToDeg(Math.atan2(direction[2], direction[0]))
                + 360
            ) % 360;
            engine.setAtmosphereSettings({
                ...engine.atmosphereSettings,
                sun: {
                    ...engine.atmosphereSettings?.sun,
                    azimuthDeg,
                    elevationDeg
                }
            });
            city.update(engine);
            engine.renderFrame();
            engine.renderer.getContext().finish();
            window.__ai531TextureGradField = {city, engine, probe};
            return {
                childCount: city.world?.trees?.group?.children?.length ?? -1,
                placementCount: city.world?.trees?.placements?.length ?? -1,
                quality: city.world?.trees?.quality ?? null,
                storedQuality: window.localStorage.getItem(
                    'bus_sim.tree_quality.v1'
                )
            };
        }, {profile});
        if (readiness.quality !== expectedTreeQuality
            || readiness.storedQuality !== expectedTreeQuality
            || readiness.placementCount !== expectedCutoutCasterCount
            || readiness.childCount !== expectedCutoutCasterCount) {
            throw new Error(
                `Native sampler tree authority differs: `
                + canonicalJsonStringify({
                    diagnostics,
                    expectedTreeQuality,
                    readiness
                })
            );
        }
        const pendingRequestDetails = () => [...pendingRequests].map((request) => ({
            method: request.method(),
            resourceType: request.resourceType(),
            url: request.url()
        }));
        const assertNetworkQuiescent = async (phase) => {
            try {
                await page.waitForLoadState('networkidle', {timeout: 30_000});
            } catch (error) {
                throw new Error(
                    `Native sampler ${phase} did not become network-idle: `
                    + canonicalJsonStringify({
                        diagnostics,
                        pendingRequests: pendingRequestDetails()
                    }),
                    {cause: error}
                );
            }
            await page.evaluate(() => new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            }));
            if (pendingRequests.size > 0) {
                throw new Error(
                    `Native sampler ${phase} retained pending requests: `
                    + canonicalJsonStringify(pendingRequestDetails())
                );
            }
        };
        await assertNetworkQuiescent('initialization');
        return {
            baseUrl,
            diagnostics,
            networkLedger() {
                return [...networkLedger.values()]
                    .filter((entry) => entry.failed > 0)
                    .sort((left, right) => compareStrings(left.url, right.url));
            },
            async captureChunk({binding, chunkUrl, expectedByteLength, label}) {
                return page.evaluate(async ({
                    binding,
                    chunkUrl,
                    expectedByteLength,
                    expectedCutoutCasterCount,
                    label,
                    liveSourceToCacheLightAxisTransform,
                    samplingMode
                }) => {
                    const response = await fetch(chunkUrl, {cache: 'no-store'});
                    if (!response.ok) {
                        throw new Error(
                            `candidate fetch failed with ${response.status}`
                        );
                    }
                    const bytes = await response.arrayBuffer();
                    if (bytes.byteLength !== expectedByteLength
                        || bytes.byteLength % 40 !== 0) {
                        throw new Error('candidate fetch byte length differs');
                    }
                    const matrix = binding.matrix;
                    const view = new DataView(bytes);
                    const count = bytes.byteLength / 40;
                    const samples = new Array(count);
                    for (let index = 0; index < count; index += 1) {
                        const offset = index * 40;
                        const sourceU = view.getFloat32(offset + 16, true);
                        const sourceV = view.getFloat32(offset + 20, true);
                        const cacheGradient = (recordOffset) => {
                            const x = view.getFloat32(offset + recordOffset, true);
                            const y = view.getFloat32(offset + recordOffset + 4, true);
                            return [
                                matrix[0] * x + matrix[3] * y,
                                matrix[1] * x + matrix[4] * y
                            ];
                        };
                        const cacheDx = cacheGradient(24);
                        const cacheDy = cacheGradient(32);
                        const liveGradient = (liveAxis) => [
                            cacheDx[0]
                                * liveSourceToCacheLightAxisTransform[0][liveAxis]
                                + cacheDy[0]
                                * liveSourceToCacheLightAxisTransform[1][liveAxis],
                            cacheDx[1]
                                * liveSourceToCacheLightAxisTransform[0][liveAxis]
                                + cacheDy[1]
                                * liveSourceToCacheLightAxisTransform[1][liveAxis]
                        ];
                        samples[index] = {
                            dUVdx: samplingMode === 'implicit-gradient'
                                ? liveGradient(0) : cacheDx,
                            dUVdy: samplingMode === 'implicit-gradient'
                                ? liveGradient(1) : cacheDy,
                            uv: [
                                matrix[0] * sourceU + matrix[3] * sourceV + matrix[6],
                                matrix[1] * sourceU + matrix[4] * sourceV + matrix[7]
                            ]
                        };
                    }
                    const {city, engine, probe} =
                        window.__ai531TextureGradField;
                    const capture = samplingMode === 'implicit-gradient'
                        ? probe.captureProductionAlphaCutoutImplicitGradientSamples
                        : probe.captureProductionAlphaCutoutTextureGradSamples;
                    return capture({
                        city,
                        engine,
                        expectedCutoutCasterCount,
                        label,
                        samples
                    });
                }, {
                    binding,
                    chunkUrl,
                    expectedByteLength,
                    expectedCutoutCasterCount,
                    label,
                    liveSourceToCacheLightAxisTransform,
                    samplingMode
                });
            },
            async close() {
                await assertNetworkQuiescent('shutdown');
                await browser?.close().catch(() => {});
                server?.kill();
            }
        };
    } catch (error) {
        await browser?.close().catch(() => {});
        server?.kill();
        throw error;
    }
}

function resolveAuthenticatedTreeQuality(casterIds) {
    const qualities = new Set();
    for (const casterId of casterIds) {
        if (String(casterId).includes('SM_H_Tree_')) qualities.add('desktop');
        else if (String(casterId).includes('SM_L_Tree_')) qualities.add('mobile');
        else throw new Error('Authenticated cutout caster has unknown tree quality');
    }
    if (qualities.size !== 1) {
        throw new Error('Authenticated cutout casters mix tree quality tiers');
    }
    return [...qualities][0];
}

export function deriveLiveSourceToCacheLightAxisTransform(descriptor) {
    const cacheAxes = [
        descriptor?.identity?.basis?.rightAxisWorld,
        descriptor?.identity?.basis?.upAxisWorld
    ];
    const liveAxes = [
        descriptor?.identity?.sampling?.pcf?.sourceMapRightAxisWorld,
        descriptor?.identity?.sampling?.pcf?.sourceMapUpAxisWorld
    ];
    const requireAxis = (axis, label) => {
        if (!Array.isArray(axis) || axis.length !== 3
            || axis.some((value) => !Number.isFinite(value))) {
            throw new Error(`Production descriptor ${label} is invalid`);
        }
        return axis;
    };
    cacheAxes.forEach((axis, index) => requireAxis(axis, `cache axis ${index}`));
    liveAxes.forEach((axis, index) => requireAxis(axis, `live axis ${index}`));
    const dot = (left, right) => left.reduce(
        (total, value, index) => total + value * right[index],
        0
    );
    const transform = cacheAxes.map((cacheAxis) => liveAxes.map((liveAxis) => {
        const value = dot(cacheAxis, liveAxis);
        for (const canonical of [-1, 0, 1]) {
            if (Math.abs(value - canonical) <= 1e-9) return canonical;
        }
        throw new Error(
            'Live and cache light axes are not an authenticated signed permutation'
        );
    }));
    const validLine = (values) => (
        values.filter((value) => Math.abs(value) === 1).length === 1
        && values.filter((value) => value === 0).length === 1
    );
    const columns = [
        [transform[0][0], transform[1][0]],
        [transform[0][1], transform[1][1]]
    ];
    if (!transform.every(validLine) || !columns.every(validLine)) {
        throw new Error('Live-to-cache light-axis transform is not bijective');
    }
    return transform;
}

async function evaluateTile({
    binding,
    browser,
    candidateAggregate,
    candidateOutput,
    candidateRoot,
    expectedSourceTriangleCount,
    fieldRoot,
    layout,
    liveSourceToCacheLightAxisTransform,
    profile,
    resultsRoot,
    samplingMode,
    stableCaptureIdentity
}) {
    const [width, height] = layout.interiorPixels;
    const depths = new Float32Array(width * height);
    const resultProjection = [];
    let acceptedCandidateCount = 0;
    let captureIdentity = stableCaptureIdentity;
    for (const chunk of candidateOutput.chunks) {
        const chunkPath = resolveInside(candidateRoot, chunk.path);
        const candidateBytes = new Uint8Array(await readFile(chunkPath));
        if (candidateBytes.byteLength !== chunk.byteLength
            || sha256(candidateBytes) !== chunk.sha256) {
            throw new Error(
                `Candidate chunk ${candidateOutput.tileId}:${chunk.chunkIndex} changed`
            );
        }
        candidateAggregate.update(candidateBytes);
        const relative = path.relative(repoRoot, chunkPath).replaceAll('\\', '/');
        const chunkUrl = new URL(
            '/' + relative.split('/').map(encodeURIComponent).join('/'),
            browser.baseUrl
        ).href;
        const capture = await browser.captureChunk({
            binding,
            chunkUrl,
            expectedByteLength: chunk.byteLength,
            label:
                `${profile.id}-${candidateOutput.tileId}-`
                + `candidate-${chunk.chunkIndex}`
        });
        if (capture.status !== 'captured_and_restored'
            || capture.stateRestoration !== 'verified'
            || capture.values?.length !== chunk.recordCount) {
            throw new Error('Native textureGrad chunk did not restore exact state');
        }
        const identity = {
            graphics: capture.graphics,
            liveSourceToCacheLightAxisTransform,
            method: capture.method,
            schema: capture.schema,
            texture: capture.texture
        };
        if (captureIdentity === null) captureIdentity = identity;
        if (canonicalJsonStringify(captureIdentity)
                !== canonicalJsonStringify(identity)) {
            throw new Error('Native textureGrad producer identity changed between chunks');
        }
        const resultBytes = encodeFloat32Le(capture.values);
        const resultRelative =
            `${candidateOutput.tileId}/result_`
            + `${String(chunk.chunkIndex).padStart(6, '0')}.f32le`;
        const resultPath = path.join(resultsRoot, resultRelative);
        await mkdir(path.dirname(resultPath), {recursive: true});
        await writeFile(resultPath, resultBytes);
        const resultRecord = {
            byteLength: resultBytes.byteLength,
            candidateSha256: chunk.sha256,
            chunkIndex: chunk.chunkIndex,
            path: path.relative(fieldRoot, resultPath).replaceAll('\\', '/'),
            recordCount: chunk.recordCount,
            sha256: sha256(resultBytes),
            tileId: candidateOutput.tileId,
            tileIndex: candidateOutput.tileIndex
        };
        resultProjection.push(resultRecord);
        const view = new DataView(
            candidateBytes.buffer,
            candidateBytes.byteOffset,
            candidateBytes.byteLength
        );
        for (let index = 0; index < chunk.recordCount; index += 1) {
            const offset = index * CANDIDATE_RECORD_BYTE_LENGTH;
            const globalX = view.getUint32(offset, true);
            const globalY = view.getUint32(offset + 4, true);
            const depth = view.getFloat32(offset + 8, true);
            const sourceTriangleIndex = view.getUint32(offset + 12, true);
            const localX = globalX - candidateOutput.coordinates[0] * width;
            const localY = globalY - candidateOutput.coordinates[1] * height;
            if (localX < 0 || localX >= width || localY < 0 || localY >= height
                || sourceTriangleIndex >= expectedSourceTriangleCount
                || !Number.isFinite(depth)) {
                throw new Error(
                    `Candidate record escaped authority at ${candidateOutput.tileId}:`
                    + `${chunk.chunkIndex}:${index}`
                );
            }
            const coverage = capture.values[index];
            if (!Number.isFinite(coverage) || coverage < 0 || coverage > 1) {
                throw new Error('Native textureGrad returned invalid coverage');
            }
            if (coverage < 0.5) continue;
            if (Object.is(depth, 0) || Object.is(depth, -0)) {
                throw new Error('Accepted candidate depth collides with empty encoding');
            }
            acceptedCandidateCount += 1;
            const localIndex = localY * width + localX;
            const previous = depths[localIndex];
            if (previous === 0 || depth < previous) depths[localIndex] = depth;
        }
    }
    if (captureIdentity === null) {
        throw new Error('Empty candidate tile was evaluated before sampler identity');
    }
    let occupiedTexelCount = 0;
    let minimumDepthMeters = Infinity;
    let maximumDepthMeters = -Infinity;
    for (const depth of depths) {
        if (depth === 0) continue;
        occupiedTexelCount += 1;
        minimumDepthMeters = Math.min(minimumDepthMeters, depth);
        maximumDepthMeters = Math.max(maximumDepthMeters, depth);
    }
    const fieldBytes = new Uint8Array(depths.buffer);
    const tilePath = path.join(
        fieldRoot,
        'tiles',
        `${candidateOutput.tileId}.cutout-first-hit.f32le`
    );
    await writeFile(tilePath, fieldBytes);
    const queryProjection = candidateOutput.chunks.map((chunk) => ({
        byteLength: chunk.byteLength,
        chunkIndex: chunk.chunkIndex,
        recordCount: chunk.recordCount,
        sha256: chunk.sha256
    }));
    const output = {
        byteLength: fieldBytes.byteLength,
        coordinates: candidateOutput.coordinates,
        maximumDepthMeters:
            occupiedTexelCount === 0 ? null : maximumDepthMeters,
        minimumDepthMeters:
            occupiedTexelCount === 0 ? null : minimumDepthMeters,
        nativeCapture: {
            candidateAuthority: {
                acceptedCandidateCount,
                candidateCount: candidateOutput.candidateCount,
                chunkCount: candidateOutput.chunks.length,
                queryProjectionSha256:
                    sha256(canonicalJsonBytes(queryProjection)),
                resultProjectionSha256:
                    sha256(canonicalJsonBytes(resultProjection))
            },
            implementation: captureIdentity.graphics,
            sampling: {
                alphaTest: 0.5,
                bindingId: binding.id,
                ...(samplingMode === 'implicit-gradient' ? {
                    liveSourceToCacheLightAxisTransform:
                        captureIdentity.liveSourceToCacheLightAxisTransform
                } : {}),
                method: captureIdentity.method,
                schema: captureIdentity.schema,
                texture: captureIdentity.texture
            },
            stateRestoration: {gl: 'verified', renderer: 'verified'},
            transfer: {
                component: 'native-alpha-r-float32-readback-v1',
                resultEncoding: 'f32-little-endian-one-value-per-candidate-v1',
                synchronization: 'blocking-read-pixels-v1'
            }
        },
        occupiedTexelCount,
        path:
            `tiles/${candidateOutput.tileId}.cutout-first-hit.f32le`,
        rowOrigin: 'min-light-y-v1',
        sha256: sha256(fieldBytes),
        tileId: candidateOutput.tileId,
        tileIndex: candidateOutput.tileIndex,
        transparentTexelCount: depths.length - occupiedTexelCount,
        xAxis: 'increasing-cache-light-right-v1'
    };
    return {
        acceptedCandidateCount,
        captureIdentity,
        output,
        resultProjection
    };
}

function fieldContract(samplingMode) {
    if (samplingMode === 'explicit-texture-grad') {
        return Object.freeze({
            method: TEXTURE_GRAD_FIELD_METHOD,
            receiptSchema: TEXTURE_GRAD_FIELD_RECEIPT_SCHEMA,
            sessionSchema: TEXTURE_GRAD_FIELD_SESSION_SCHEMA
        });
    }
    if (samplingMode === 'implicit-gradient') {
        return Object.freeze({
            method: IMPLICIT_GRADIENT_FIELD_METHOD,
            receiptSchema: IMPLICIT_GRADIENT_FIELD_RECEIPT_SCHEMA,
            sessionSchema: IMPLICIT_GRADIENT_FIELD_SESSION_SCHEMA
        });
    }
    throw new TypeError(`Unsupported native field sampling mode '${String(samplingMode)}'`);
}

function parseReceiptMarker(stdout) {
    const prefix = 'AI531_ALPHA_CUTOUT_BAKE_SPARSE_RECEIPT=';
    const lines = String(stdout).split(/\r?\n/u)
        .filter((line) => line.startsWith(prefix));
    if (lines.length !== 1) {
        throw new Error('Pinned Blender emitted no unique candidate receipt marker');
    }
    const value = JSON.parse(lines[0].slice(prefix.length));
    if (value.path !== 'capture_receipt.json'
        || !Number.isSafeInteger(value.byteLength)
        || value.byteLength <= 0
        || !isSha256(value.sha256)) {
        throw new Error('Pinned Blender candidate receipt marker is invalid');
    }
    return value;
}

function parseCanonicalJson(bytes, label) {
    const value = JSON.parse(Buffer.from(bytes).toString('utf8'));
    if (!Buffer.from(canonicalJsonBytes(value)).equals(Buffer.from(bytes))) {
        throw new Error(`${label} is not canonical JSON`);
    }
    return value;
}

function resolveInside(root, relative) {
    if (typeof relative !== 'string' || relative.includes('\\')) {
        throw new Error('Artifact path is invalid');
    }
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, ...relative.split('/'));
    const relation = path.relative(resolvedRoot, resolved);
    if (!relation || relation.startsWith('..') || path.isAbsolute(relation)) {
        throw new Error('Artifact path escaped its root');
    }
    return resolved;
}

function assertArtifactChild(value, requireExisting) {
    const resolved = path.resolve(repoRoot, value);
    const relative = path.relative(artifactRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('AI 531 textureGrad paths must stay below illumination_531');
    }
    if (requireExisting && !existsSync(resolved)) {
        throw new Error('Requested AI 531 authority root does not exist');
    }
    return resolved;
}

async function requireNewRoot(root) {
    try {
        await stat(root);
        throw new Error('AI 531 textureGrad output root already exists');
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
    }
}

function requireLoopbackUrl(value) {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:'
        || !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
        throw new TypeError('--url must name a loopback HTTP server');
    }
    return parsed.origin;
}

function positiveInteger(value, label) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new TypeError(`${label} must be a positive integer`);
    }
    return parsed;
}

function encodeFloat32Le(values) {
    const bytes = new Uint8Array(values.length * 4);
    const view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setFloat32(index * 4, value, true));
    return bytes;
}

function float32(value) {
    return new Float32Array([value])[0];
}

function sum(values, key) {
    return values.reduce((total, value) => total + value[key], 0);
}

async function sourceDescriptor(value) {
    const bytes = new Uint8Array(await readFile(value));
    const relative = path.relative(repoRoot, value);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Producer path escaped the repository');
    }
    return {
        byteLength: bytes.byteLength,
        path: relative.replaceAll('\\', '/'),
        sha256: sha256(bytes)
    };
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function isSha256(value) {
    return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function compareStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

async function findFreePort(start) {
    for (let port = start; port < start + 100; port += 1) {
        if (await canListen(port)) return port;
    }
    throw new Error('No free loopback port found for native textureGrad build');
}

function canListen(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => {
            server.close(() => resolve(true));
        });
    });
}

async function waitForServer(baseUrl) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            const response = await fetch(`${baseUrl}/package.json`);
            if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for the repository static server');
}

if (process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    run().catch((error) => {
        process.stderr.write(`${error?.stack ?? error}\n`);
        if (typeof error?.toJSON === 'function') {
            process.stderr.write(canonicalJsonStringify(error.toJSON()) + '\n');
        }
        process.exitCode = 1;
    });
}
