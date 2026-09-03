#!/usr/bin/env node
// Replays retained AI 531 cutout candidates through the live native texture sampler.

import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
    canonicalJsonBytes
} from '../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    validateResolvedCityBakePackage
} from '../../src/graphics/illumination/bake_source/BakeSourceValidation.js';
import {
    captureLiveTextureGradEvidence
} from './capture_alpha_cutout_evidence.mjs';
import {
    selectProductionStaticSunProfiles
} from './src/ProductionOrchestrator.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const artifactRoot = path.join(repoRoot, 'tests/artifacts/illumination_531');
const runnerPath = fileURLToPath(import.meta.url);
const captureHelperPath = path.join(here, 'capture_alpha_cutout_evidence.mjs');
const defaultInputPath = path.join(
    repoRoot,
    'tests/artifacts/illumination_528/packages/bigcity2/ai531-production/bigcity2.bsib'
);
const MAXIMUM_CANDIDATE_COUNT = 262_144;
const DEPTH_TOLERANCE_METERS = 5e-3;

export function parseAlphaCutoutTextureGradArguments(argv) {
    const options = {
        inputPath: defaultInputPath,
        port: 4173
    };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') return Object.freeze({help: true});
        const value = argv[index + 1];
        if (typeof value !== 'string' || !value || value.startsWith('--')) {
            throw new TypeError(`Missing value for ${flag}`);
        }
        index += 1;
        switch (flag) {
            case '--candidate-root':
                options.candidateRoot = assertArtifactChild(value);
                break;
            case '--output-root':
                options.outputRoot = assertArtifactChild(value);
                break;
            case '--input':
                options.inputPath = path.resolve(repoRoot, value);
                break;
            case '--url':
                options.baseUrl = requireLoopbackUrl(value);
                break;
            case '--port':
                options.port = positiveInteger(value, flag);
                break;
            default:
                throw new TypeError(`Unknown option '${flag}'`);
        }
    }
    if (!options.candidateRoot || !options.outputRoot) {
        throw new TypeError('--candidate-root and --output-root are required');
    }
    if (options.candidateRoot === options.outputRoot) {
        throw new Error('native textureGrad output must differ from its candidate root');
    }
    return Object.freeze(options);
}

export function alphaCutoutTextureGradUsage() {
    return `AI 531 native alpha textureGrad evidence

Usage:
  node tools/static_sun_depth/capture_alpha_cutout_texture_grad_evidence.mjs \\
    --candidate-root <retained deterministic-silhouette artifact> \\
    --output-root <new illumination_531 artifact child>

Options:
  --input <path>       Authenticated BigCity2 BSIB source
  --url <loopback-url> Reuse an existing repository server
  --port <number>      Preferred local server port (default 4173)
`;
}

export function deriveNativeTextureGradComparison({
    captureValues,
    flattenedCandidates,
    liveDepthBytes,
    liveOccupancyBytes,
    sampleRequest
}) {
    if (!Array.isArray(captureValues)
        || captureValues.length !== flattenedCandidates.length
        || captureValues.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
        throw new TypeError('native textureGrad values do not match candidate authority');
    }
    if (!(liveOccupancyBytes instanceof Uint8Array)
        || !(liveDepthBytes instanceof Uint8Array)
        || liveDepthBytes.byteLength !== liveOccupancyBytes.byteLength * 4
        || sampleRequest.samples?.length !== liveOccupancyBytes.byteLength) {
        throw new TypeError('retained live streams do not match the sample request');
    }
    const liveDepth = new DataView(
        liveDepthBytes.buffer,
        liveDepthBytes.byteOffset,
        liveDepthBytes.byteLength
    );
    const candidatesBySample = new Map(
        sampleRequest.samples.map((sample) => [sample.index, []])
    );
    flattenedCandidates.forEach((entry, index) => {
        const candidates = candidatesBySample.get(entry.sampleIndex);
        if (!candidates) throw new Error('candidate references an unknown sample index');
        candidates.push({
            coverage: captureValues[index],
            lightDepthMeters: entry.candidate.lightDepthMeters,
            source: entry.candidate.source,
            sourceTriangleIndex: entry.candidate.sourceTriangleIndex
        });
    });
    const sourceOrigin = Number(
        sampleRequest.depthReference?.sourceCameraOriginDepthMetersInCacheBasis
    );
    if (!Number.isFinite(sourceOrigin)) {
        throw new TypeError('sample request has no finite source camera origin');
    }
    let bakeOccupiedSampleCount = 0;
    let commonOccupiedSampleCount = 0;
    let depthMismatchCount = 0;
    let liveOccupiedSampleCount = 0;
    let maximumFirstHitDepthErrorMeters = 0;
    let occupancyMismatchCount = 0;
    const mismatches = [];
    for (const sample of sampleRequest.samples) {
        if (sample.index < 0 || sample.index >= liveOccupancyBytes.byteLength) {
            throw new Error('sample request index is outside retained live streams');
        }
        const liveOccupied = requireBinaryOccupancy(
            liveOccupancyBytes[sample.index],
            sample.index
        ) === 1;
        liveOccupiedSampleCount += Number(liveOccupied);
        const allCandidates = candidatesBySample.get(sample.index);
        const accepted = allCandidates
            .filter((entry) => entry.coverage >= 0.5)
            .sort((left, right) => left.lightDepthMeters - right.lightDepthMeters);
        const bakeOccupied = accepted.length > 0;
        bakeOccupiedSampleCount += Number(bakeOccupied);
        if (bakeOccupied !== liveOccupied) {
            occupancyMismatchCount += 1;
            mismatches.push({
                bakeOccupied,
                globalTexel: sample.globalTexel,
                index: sample.index,
                kind: 'occupancy',
                liveOccupied,
                maximumCoverage: Math.max(
                    ...allCandidates.map((entry) => entry.coverage),
                    0
                )
            });
            continue;
        }
        if (!bakeOccupied) continue;
        commonOccupiedSampleCount += 1;
        const liveDistance = liveDepth.getFloat32(sample.index * 4, true);
        if (!Number.isFinite(liveDistance) || liveDistance <= 0) {
            throw new Error(`occupied live depth ${sample.index} is invalid`);
        }
        const liveLightDepth = sourceOrigin + liveDistance;
        const errorMeters = Math.abs(
            accepted[0].lightDepthMeters - liveLightDepth
        );
        maximumFirstHitDepthErrorMeters = Math.max(
            maximumFirstHitDepthErrorMeters,
            errorMeters
        );
        if (errorMeters > DEPTH_TOLERANCE_METERS) {
            depthMismatchCount += 1;
            mismatches.push({
                bake: accepted.slice(0, 4),
                errorMeters,
                globalTexel: sample.globalTexel,
                index: sample.index,
                kind: 'depth',
                liveLightDepthMeters: liveLightDepth
            });
        }
    }
    return Object.freeze({
        bakeOccupiedSampleCount,
        commonOccupiedSampleCount,
        depthMismatchCount,
        firstHitDepthToleranceMeters: DEPTH_TOLERANCE_METERS,
        liveOccupiedSampleCount,
        maximumFirstHitDepthErrorMeters,
        mismatchCount: occupancyMismatchCount + depthMismatchCount,
        mismatches,
        occupancyMismatchCount,
        sampleCount: sampleRequest.samples.length,
        schema: 'ai531-production-alpha-cutout-native-texture-grad-comparison-v1',
        status: occupancyMismatchCount === 0 && depthMismatchCount === 0
            ? 'matched' : 'mismatched'
    });
}

async function run(argv = process.argv.slice(2)) {
    const options = parseAlphaCutoutTextureGradArguments(argv);
    if (options.help) {
        process.stdout.write(alphaCutoutTextureGradUsage());
        return;
    }
    if (existsSync(options.outputRoot)) {
        throw new Error('native textureGrad output root already exists');
    }
    await mkdir(path.dirname(options.outputRoot), {recursive: true});
    await mkdir(options.outputRoot, {recursive: false});
    const [
        candidateReceiptBytes,
        candidateRunReportBytes,
        sampleRequestBytes,
        liveOccupancyBytes,
        liveDepthBytes,
        inputBytes,
        runnerBytes,
        captureHelperBytes
    ] = await Promise.all([
        readFile(path.join(options.candidateRoot, 'blender/capture_receipt.json')),
        readFile(path.join(options.candidateRoot, 'run_report.json')),
        readFile(path.join(options.candidateRoot, 'bake_sample_request.json')),
        readFile(path.join(options.candidateRoot, 'live_occupancy.u8')),
        readFile(path.join(options.candidateRoot, 'live_first_hit_depth.f32le')),
        readFile(options.inputPath),
        readFile(runnerPath),
        readFile(captureHelperPath)
    ]);
    const candidateReceipt = parseCanonicalJson(
        candidateReceiptBytes,
        'candidate Blender receipt'
    );
    const candidateRunReport = parseCanonicalJson(
        candidateRunReportBytes,
        'candidate run report'
    );
    const sampleRequest = parseCanonicalJson(
        sampleRequestBytes,
        'candidate sample request'
    );
    authenticateCandidateReceipt(
        candidateReceipt,
        candidateReceiptBytes,
        candidateRunReport
    );
    const validated = await validateResolvedCityBakePackage(inputBytes);
    if (validated.report?.valid !== true) {
        throw new Error('native textureGrad source BSIB is invalid');
    }
    const binding = validated.manifest.textures.find(
        (entry) => entry.id === candidateReceipt.coverageDiagnostic.bindingId
    );
    if (!binding || binding.kind !== 'binding') {
        throw new Error('candidate receipt binding is absent from authenticated BSIB');
    }
    const expectedCutoutCasterIds = validated.manifest.casterMappings
        .filter((entry) => entry.channelRelevance?.static_sun_depth === true
            && entry.coverageMode === 'cutout')
        .map((entry) => entry.id)
        .sort(compareStrings);
    if (expectedCutoutCasterIds.length !== 124) {
        throw new Error('native textureGrad evidence requires 124 cutout casters');
    }
    const flattenedCandidates = flattenCandidates(candidateReceipt, binding);
    const textureSamples = flattenedCandidates.map((entry) => entry.textureSample);
    const queryBytes = canonicalJsonBytes({
        bindingId: binding.id,
        samples: textureSamples,
        schema: 'ai531-production-alpha-cutout-native-texture-grad-query-v1'
    });
    const profile = selectProductionStaticSunProfiles([
        sampleRequest.lightingProfileId
    ])[0];
    const capture = await captureLiveTextureGradEvidence({
        baseUrl: options.baseUrl,
        expectedCutoutCasterCount: expectedCutoutCasterIds.length,
        port: options.port,
        profile,
        samples: textureSamples
    });
    const comparison = deriveNativeTextureGradComparison({
        captureValues: capture.values,
        flattenedCandidates,
        liveDepthBytes: new Uint8Array(liveDepthBytes),
        liveOccupancyBytes: new Uint8Array(liveOccupancyBytes),
        sampleRequest
    });
    const performance = Object.freeze({
        eligibleForPromotion: false,
        reason: 'host-load-and-gpu-contention-declared-by-user'
    });
    const captureRecord = {
        ...capture,
        candidateAuthority: {
            bindingId: binding.id,
            bindingSha256: sha256(canonicalJsonBytes(binding)),
            candidateCount: flattenedCandidates.length,
            compilerVersionIdentity:
                candidateReceipt.coverageDiagnostic.compilerVersionIdentity,
            cutoutCasterIdsSha256:
                sha256(canonicalJsonBytes(expectedCutoutCasterIds)),
            query: {
                byteLength: queryBytes.byteLength,
                sha256: sha256(queryBytes)
            },
            sourceBsib: {
                byteLength: inputBytes.byteLength,
                sha256: sha256(inputBytes)
            },
            sourceReceiptByteLength: candidateReceiptBytes.byteLength,
            sourceReceiptSha256: sha256(candidateReceiptBytes)
        },
        orchestration: {
            captureHelper: sourceDescriptor(captureHelperPath, captureHelperBytes),
            runner: sourceDescriptor(runnerPath, runnerBytes)
        },
        performance
    };
    const captureBytes = canonicalJsonBytes(captureRecord);
    const report = {
        ...comparison,
        candidateRoot: artifactPath(options.candidateRoot),
        capture: {
            byteLength: captureBytes.byteLength,
            path: 'native_texture_grad_capture.json',
            sha256: sha256(captureBytes)
        },
        performance
    };
    await Promise.all([
        writeFile(
            path.join(options.outputRoot, 'native_texture_grad_capture.json'),
            captureBytes
        ),
        writeFile(
            path.join(options.outputRoot, 'comparison_report.json'),
            canonicalJsonBytes(report)
        )
    ]);
    process.stdout.write(`${JSON.stringify(report)}\n`);
}

function flattenCandidates(receipt, binding) {
    const diagnostics = receipt.coverageDiagnostic?.restrictedSampleDiagnostics;
    if (!Array.isArray(diagnostics)) {
        throw new Error('candidate receipt has no restricted sample diagnostics');
    }
    const flattened = [];
    for (const sample of diagnostics) {
        for (const candidate of sample.candidates ?? []) {
            const uv = applyTextureMatrix(candidate.uv, binding.matrix);
            const gradients = candidate.uvGradients;
            if (!Array.isArray(gradients) || gradients.length !== 2) {
                throw new Error('candidate has no exact UV gradients');
            }
            const shaderGradients = gradients.map((gradient) => {
                const pair = finitePair(gradient, 'candidate UV gradient');
                return binding.flipY ? [pair[0], -pair[1]] : pair;
            });
            flattened.push({
                candidate,
                sampleIndex: resolveSampleIndex(receipt.sampleRequest, sample.x, sample.y),
                textureSample: {
                    dUVdx: shaderGradients[0],
                    dUVdy: shaderGradients[1],
                    uv
                }
            });
        }
    }
    if (flattened.length < 1 || flattened.length > MAXIMUM_CANDIDATE_COUNT) {
        throw new Error('candidate count is outside the bounded native probe');
    }
    return flattened;
}

function resolveSampleIndex(sampleRequest, x, y) {
    const matches = sampleRequest.samples.filter(
        (sample) => sample.globalTexel?.[0] === x && sample.globalTexel?.[1] === y
    );
    if (matches.length !== 1) {
        throw new Error('candidate pixel has no unique sample-request owner');
    }
    return matches[0].index;
}

function applyTextureMatrix(uv, matrix) {
    const source = finitePair(uv, 'candidate UV');
    if (!Array.isArray(matrix) || matrix.length !== 9
        || matrix.some((value) => !Number.isFinite(value))) {
        throw new Error('authenticated texture binding matrix is invalid');
    }
    return [
        matrix[0] * source[0] + matrix[3] * source[1] + matrix[6],
        matrix[1] * source[0] + matrix[4] * source[1] + matrix[7]
    ];
}

function authenticateCandidateReceipt(receipt, receiptBytes, runReport) {
    const descriptor = runReport.blenderReceipt;
    if (receipt.status !== 'complete'
        || receipt.productionEligible !== false
        || receipt.coverageDiagnostic?.productionEligible !== false
        || receipt.coverageDiagnostic?.mode
            !== 'diagnostic_deterministic_compiled_cutout_silhouette_v1'
        || descriptor?.path !== 'capture_receipt.json'
        || descriptor.byteLength !== receiptBytes.byteLength
        || descriptor.sha256 !== sha256(receiptBytes)) {
        throw new Error('candidate Blender receipt authentication failed');
    }
}

function parseCanonicalJson(bytes, label) {
    const value = JSON.parse(bytes);
    if (!Buffer.from(canonicalJsonBytes(value)).equals(bytes)) {
        throw new Error(`${label} is not canonical JSON`);
    }
    return value;
}

function assertArtifactChild(value) {
    const resolved = path.resolve(repoRoot, value);
    const relative = path.relative(artifactRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('native textureGrad paths must stay below illumination_531');
    }
    return resolved;
}

function artifactPath(value) {
    return path.relative(repoRoot, value).replaceAll('\\', '/');
}

function sourceDescriptor(value, bytes) {
    return {
        byteLength: bytes.byteLength,
        path: artifactPath(value),
        sha256: sha256(bytes)
    };
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

function finitePair(value, label) {
    if (!Array.isArray(value) || value.length !== 2
        || value.some((entry) => !Number.isFinite(entry))) {
        throw new TypeError(`${label} must contain two finite numbers`);
    }
    return [Number(value[0]), Number(value[1])];
}

function requireBinaryOccupancy(value, index) {
    if (value !== 0 && value !== 1) {
        throw new Error(`live occupancy[${index}] must be binary`);
    }
    return value;
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function compareStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    run().catch((error) => {
        process.stderr.write(`${error?.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
