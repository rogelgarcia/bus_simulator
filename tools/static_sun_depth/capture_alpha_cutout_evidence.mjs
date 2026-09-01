#!/usr/bin/env node
// Captures real BigCity2 live cutout samples and runs the matching headless Blender producer.

import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import net from 'node:net';
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
    prepareProductionAuthority,
    selectProductionStaticSunProfiles
} from './src/ProductionOrchestrator.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const artifactRoot = path.join(repoRoot, 'tests/artifacts/illumination_531');
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
    producerPath: path.join(
        repoRoot,
        'tools/static_sun_depth/blender/production_alpha_cutout_sparse_samples.py'
    ),
    productionRendererPath: path.join(
        repoRoot,
        'tools/static_sun_depth/blender/production_static_sun.py'
    ),
    profileId: 'ai527.sun.az135.el08',
    profilePath: path.join(
        repoRoot,
        'tools/illumination_bake_compiler/profiles/proof_cpu_12.v1.json'
    ),
    toolchainPath: path.join(
        repoRoot,
        'tools/illumination_bake_compiler/toolchain.v1.json'
    )
});

export function parseAlphaCutoutEvidenceArguments(argv) {
    const options = {...defaults};
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') return Object.freeze({help: true});
        const value = argv[index + 1];
        if (typeof value !== 'string' || !value || value.startsWith('--')) {
            throw new TypeError(`Missing value for ${flag}`);
        }
        index += 1;
        switch (flag) {
            case '--profile-id':
                options.profileId = value;
                break;
            case '--output-root':
                options.outputRoot = assertArtifactChild(value);
                break;
            case '--url':
                options.baseUrl = requireLoopbackUrl(value);
                break;
            case '--live-root':
                options.liveRoot = assertArtifactChild(value);
                break;
            case '--port':
                options.port = positiveInteger(value, flag);
                break;
            case '--timeout-ms':
                options.timeoutMs = positiveInteger(value, flag);
                break;
            default:
                throw new TypeError(`Unknown option '${flag}'`);
        }
    }
    selectProductionStaticSunProfiles([options.profileId]);
    options.outputRoot ??= path.join(
        artifactRoot,
        'alpha_diagnostics',
        `${options.profileId}-sparse-v1`
    );
    options.timeoutMs ??= 3_600_000;
    options.port ??= 4173;
    return Object.freeze(options);
}

export function alphaCutoutEvidenceUsage() {
    return `AI 531 real alpha-cutout sparse evidence\n\nUsage:\n  node tools/static_sun_depth/capture_alpha_cutout_evidence.mjs [options]\n\nOptions:\n  --profile-id <id>       One AI 531 release lighting profile\n  --output-root <path>    New child below tests/artifacts/illumination_531\n  --url <loopback-url>    Reuse an existing repository server\n  --live-root <path>      Reuse completed live files from an earlier artifact child\n  --port <number>         Preferred local server port (default 4173)\n  --timeout-ms <ms>       Headless Blender timeout (default 3600000)\n`;
}

async function run(argv = process.argv.slice(2)) {
    const options = parseAlphaCutoutEvidenceArguments(argv);
    if (options.help) {
        process.stdout.write(alphaCutoutEvidenceUsage());
        return;
    }
    await requireNewOutputRoot(options.outputRoot);
    await mkdir(path.dirname(options.outputRoot), {recursive: true});
    await mkdir(options.outputRoot, {recursive: false});
    const inputBytes = await readFile(options.inputPath);
    const validated = await validateResolvedCityBakePackage(inputBytes);
    if (validated.report?.valid !== true) {
        throw new Error('The authenticated BigCity2 source package is invalid');
    }
    const expectedCasterIds = validated.manifest.casterMappings
        .filter((entry) => (
            entry.channelRelevance?.static_sun_depth === true
            && entry.coverageMode === 'cutout'
        ))
        .map((entry) => entry.id)
        .sort(compareStrings);
    if (expectedCasterIds.length !== 124 || new Set(expectedCasterIds).size !== 124) {
        throw new Error(
            `Expected exactly 124 authenticated cutout casters, found ${expectedCasterIds.length}`
        );
    }
    const descriptorPath = path.join(
        artifactRoot,
        'production',
        options.profileId,
        'descriptor.json'
    );
    const requestPath = path.join(
        artifactRoot,
        'production',
        options.profileId,
        'request.json'
    );
    const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'));
    const requestBytes = await readFile(requestPath);
    const profile = selectProductionStaticSunProfiles([options.profileId])[0];
    const request = JSON.parse(requestBytes);
    const directionError = Math.max(...request.sunPointDirectionWorld.map(
        (component, index) => Math.abs(
            component - descriptor.identity.sunPointDirectionWorld[index]
        )
    ));
    if (request.lightingProfileId !== options.profileId || directionError > 1e-12) {
        throw new Error('Production descriptor and request lighting identity differ');
    }

    const live = options.liveRoot
        ? await loadPriorLiveEvidence(options.liveRoot)
        : await captureLiveEvidence({
            baseUrl: options.baseUrl,
            descriptor,
            expectedCasterIds,
            port: options.port,
            profile
        });
    const samplePlanBytes = live.samplePlanBytes
        ?? canonicalJsonBytes(live.samplePlan);
    const sampleRequestBytes = live.sampleRequestBytes
        ?? canonicalJsonBytes(live.bakeSampleRequest);
    const liveOccupancyBytes = live.liveOccupancyBytes
        ?? Uint8Array.from(live.liveOccupancy);
    const liveDepthBytes = live.liveDepthBytes
        ?? encodeFloat32Le(live.liveFirstHitDepthMeters);
    const samplePlanPath = path.join(options.outputRoot, 'sample_plan.json');
    const sampleRequestPath = path.join(options.outputRoot, 'bake_sample_request.json');
    await Promise.all([
        writeFile(samplePlanPath, samplePlanBytes),
        writeFile(sampleRequestPath, sampleRequestBytes),
        writeFile(path.join(options.outputRoot, 'live_occupancy.u8'), liveOccupancyBytes),
        writeFile(path.join(options.outputRoot, 'live_first_hit_depth.f32le'), liveDepthBytes),
        writeFile(
            path.join(options.outputRoot, 'live_capture_receipt.json'),
            canonicalJsonBytes(live.receipt)
        )
    ]);

    const authority = await prepareProductionAuthority({
        ai529Directory: options.ai529Directory,
        archivePath: options.archivePath,
        executablePath: options.executablePath,
        inputPath: options.inputPath,
        profilePath: options.profilePath,
        rendererPath: options.productionRendererPath,
        toolchainPath: options.toolchainPath
    });
    const blenderStage = path.join(options.outputRoot, '.blender_stage');
    const blenderOutput = path.join(options.outputRoot, 'blender');
    await mkdir(blenderStage, {recursive: false});
    const isolated = createIsolatedBlenderEnvironment({
        executablePath: options.executablePath,
        stagingPath: blenderStage
    });
    for (const directory of isolated.directories) {
        await mkdir(directory, {recursive: true});
    }
    const producerSha256 = sha256(await readFile(options.producerPath));
    const result = await runBlenderProcess({
        cwd: path.dirname(options.executablePath),
        env: isolated.env,
        executablePath: options.executablePath,
        maxOutputBytes: 1_048_576,
        pythonScriptPath: options.producerPath,
        scriptArgs: [
            '--input', options.inputPath,
            '--output', blenderOutput,
            '--profile', options.profilePath,
            '--request', requestPath,
            '--sample-request', sampleRequestPath,
            '--archive-sha256', authority.verifiedToolchain.archive.sha256,
            '--executable-sha256', authority.verifiedToolchain.executable.sha256,
            '--toolchain-sha256', authority.toolchainSha256,
            '--profile-sha256', authority.profileSha256,
            '--request-sha256', sha256(requestBytes),
            '--sample-request-sha256', sha256(sampleRequestBytes),
            '--producer-script-sha256', producerSha256,
            '--production-renderer-sha256', authority.rendererScriptSha256,
            '--ai529-script-sha256', authority.ai529ScriptSha256,
            '--package-raw-sha256', authority.packageRawSha256
        ],
        timeoutMs: options.timeoutMs
    });
    const marker = parseReceiptMarker(result.stdout);
    const receiptBytes = await readFile(path.join(blenderOutput, marker.path));
    if (receiptBytes.byteLength !== marker.byteLength
        || sha256(receiptBytes) !== marker.sha256) {
        throw new Error('Headless Blender receipt differs from its stdout descriptor');
    }
    const blenderReceipt = JSON.parse(receiptBytes);
    const bakeOccupancyBytes = await readAuthenticatedEvidenceFile(
        blenderOutput,
        blenderReceipt.capture?.occupancy,
        'Blender occupancy'
    );
    const bakeDepthBytes = await readAuthenticatedEvidenceFile(
        blenderOutput,
        blenderReceipt.capture?.firstHitDepth,
        'Blender first-hit depth'
    );
    const spatialParity = compareAlphaCutoutEvidenceStreams({
        bakeDepthBytes,
        bakeOccupancyBytes,
        liveDepthBytes,
        liveOccupancyBytes,
        samplePlan: live.samplePlan
    });
    await writeFile(
        path.join(options.outputRoot, 'comparison.json'),
        canonicalJsonBytes(spatialParity)
    );
    const report = {
        blenderReceipt: marker,
        coverage: live.receipt.coverage,
        performance: {
            eligibleForPromotion: false,
            reason: 'host-load-and-gpu-contention-declared-by-user'
        },
        productionEligible: live.bakeSampleRequest.productionEligible,
        spatialParity,
        schema: 'ai531-production-alpha-cutout-evidence-run-report-v1',
        status: spatialParity.status === 'passed' ? 'complete' : 'diagnostic_complete'
    };
    await writeFile(
        path.join(options.outputRoot, 'run_report.json'),
        canonicalJsonBytes(report)
    );
    if (live.bakeSampleRequest.productionEligible && spatialParity.status !== 'passed') {
        throw new Error('Production-eligible alpha-cutout evidence contains a measured mismatch');
    }
    process.stdout.write(canonicalJsonStringify(report) + '\n');
}

export function compareAlphaCutoutEvidenceStreams(options) {
    const {
        bakeDepthBytes,
        bakeOccupancyBytes,
        liveDepthBytes,
        liveOccupancyBytes,
        samplePlan
    } = options ?? {};
    if (!(bakeOccupancyBytes instanceof Uint8Array)
        || !(liveOccupancyBytes instanceof Uint8Array)
        || !(bakeDepthBytes instanceof Uint8Array)
        || !(liveDepthBytes instanceof Uint8Array)
        || bakeOccupancyBytes.byteLength !== liveOccupancyBytes.byteLength
        || bakeDepthBytes.byteLength !== liveDepthBytes.byteLength
        || bakeDepthBytes.byteLength !== bakeOccupancyBytes.byteLength * 4
        || samplePlan?.samples?.length !== bakeOccupancyBytes.byteLength) {
        throw new TypeError('Alpha-cutout evidence stream lengths do not align');
    }
    const bakeDepth = new DataView(
        bakeDepthBytes.buffer,
        bakeDepthBytes.byteOffset,
        bakeDepthBytes.byteLength
    );
    const liveDepth = new DataView(
        liveDepthBytes.buffer,
        liveDepthBytes.byteOffset,
        liveDepthBytes.byteLength
    );
    const occupancyMismatches = [];
    const depthMismatches = [];
    let bakeOccupiedSampleCount = 0;
    let liveOccupiedSampleCount = 0;
    let commonOccupiedSampleCount = 0;
    let depthErrorSumMeters = 0;
    let maximumFirstHitDepthErrorMeters = 0;
    for (let index = 0; index < bakeOccupancyBytes.byteLength; index += 1) {
        const bakeOccupied = requireBinaryOccupancy(bakeOccupancyBytes[index], index, 'bake');
        const liveOccupied = requireBinaryOccupancy(liveOccupancyBytes[index], index, 'live');
        bakeOccupiedSampleCount += bakeOccupied;
        liveOccupiedSampleCount += liveOccupied;
        if (bakeOccupied !== liveOccupied) {
            occupancyMismatches.push({
                bakeOccupied,
                casterId: samplePlan.samples[index].casterId,
                globalTexel: [...samplePlan.samples[index].globalTexel],
                index,
                liveOccupied
            });
        }
        const bakeValue = bakeDepth.getFloat32(index * 4, true);
        const liveValue = liveDepth.getFloat32(index * 4, true);
        if (!Number.isFinite(bakeValue) || bakeValue < 0
            || !Number.isFinite(liveValue) || liveValue < 0
            || (!bakeOccupied && bakeValue !== 0)
            || (!liveOccupied && liveValue !== 0)) {
            throw new Error(`Alpha-cutout first-hit depth stream is invalid at index ${index}`);
        }
        if (!bakeOccupied || !liveOccupied) continue;
        commonOccupiedSampleCount += 1;
        const errorMeters = Math.abs(bakeValue - liveValue);
        depthErrorSumMeters += errorMeters;
        maximumFirstHitDepthErrorMeters = Math.max(
            maximumFirstHitDepthErrorMeters,
            errorMeters
        );
        if (errorMeters > 5e-3) {
            depthMismatches.push({
                bakeDepthMeters: bakeValue,
                casterId: samplePlan.samples[index].casterId,
                errorMeters,
                globalTexel: [...samplePlan.samples[index].globalTexel],
                index,
                liveDepthMeters: liveValue
            });
        }
    }
    const mismatchCount = occupancyMismatches.length + depthMismatches.length;
    return {
        bakeOccupiedSampleCount,
        commonOccupiedSampleCount,
        depthMismatchCount: depthMismatches.length,
        depthMismatches,
        firstHitDepthToleranceMeters: 5e-3,
        liveOccupiedSampleCount,
        maximumFirstHitDepthErrorMeters,
        meanFirstHitDepthErrorMeters: commonOccupiedSampleCount > 0
            ? depthErrorSumMeters / commonOccupiedSampleCount
            : 0,
        mismatchCount,
        occupancyMismatchCount: occupancyMismatches.length,
        occupancyMismatches,
        sampleCount: bakeOccupancyBytes.byteLength,
        schema: 'ai531-production-alpha-cutout-spatial-comparison-diagnostic-v1',
        status: mismatchCount === 0 ? 'passed' : 'mismatched'
    };
}

async function readAuthenticatedEvidenceFile(root, record, label) {
    if (!record || typeof record !== 'object'
        || !Number.isSafeInteger(record.byteLength) || record.byteLength <= 0
        || typeof record.path !== 'string' || !/^[a-z0-9_.-]+$/u.test(record.path)
        || !/^[0-9a-f]{64}$/u.test(record.sha256)) {
        throw new TypeError(`${label} receipt record is invalid`);
    }
    const bytes = await readFile(path.join(root, record.path));
    if (bytes.byteLength !== record.byteLength || sha256(bytes) !== record.sha256) {
        throw new Error(`${label} differs from its authenticated Blender receipt`);
    }
    return bytes;
}

function requireBinaryOccupancy(value, index, label) {
    if (value !== 0 && value !== 1) {
        throw new Error(`${label} occupancy[${index}] must be zero or one`);
    }
    return value;
}

async function captureLiveEvidence(options) {
    let server = null;
    let browser = null;
    const diagnostics = [];
    try {
        const port = options.baseUrl ? options.port : await findFreePort(options.port);
        const baseUrl = options.baseUrl ?? `http://127.0.0.1:${port}`;
        if (!options.baseUrl) {
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
        page.on('pageerror', (error) => diagnostics.push({
            kind: 'pageerror', message: error?.message ?? String(error)
        }));
        page.on('console', (message) => {
            if (message.type() === 'error') {
                diagnostics.push({kind: 'console.error', message: message.text()});
            }
        });
        await page.goto(`${baseUrl}/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0`);
        await page.waitForFunction(() => (
            window.__busSim?.sm?.currentName === 'game_mode'
            && window.__busSim?.sm?.current?.city?.cityId === 'bigcity2'
        ), null, {timeout: 180_000});
        const result = await page.evaluate(async ({descriptor, expectedCasterIds, profile}) => {
            const THREE = await import('three');
            const planner = await import(
                './tools/static_sun_depth/browser/ProductionAlphaCutoutSamplePlan.js'
            );
            const liveProducer = await import(
                './tools/static_sun_depth/browser/ProductionAlphaCutoutLiveDepthCapture.js'
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
            const direction = profile.directionThree;
            const elevationDeg = THREE.MathUtils.radToDeg(Math.asin(direction[1]));
            const azimuthDeg = THREE.MathUtils.radToDeg(
                Math.atan2(direction[2], direction[0])
            );
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
            const candidates = planner.createProductionAlphaCutoutCandidatePlan({
                THREE,
                city,
                descriptor,
                expectedCasterIds,
                lightingProfileId: profile.id
            });
            const liveCapture = liveProducer.captureProductionAlphaCutoutLiveShadowDepth({
                THREE,
                city,
                engine,
                expectedCutoutCasterCount: expectedCasterIds.length,
                label: `${profile.id}-all-cutout-candidates`,
                texels: candidates.candidates.map((candidate) => candidate.liveTexel)
            });
            const selected = planner.selectProductionAlphaCutoutSamplePlan(
                candidates,
                liveCapture,
                {allowOutOfCoverageDiagnostic: true}
            );
            const liveOccupancy = selected.selectedCandidateIndices.map(
                (index) => liveCapture.liveOccupancy[index]
            );
            const liveFirstHitDepthMeters = selected.selectedCandidateIndices.map(
                (index) => liveCapture.sampleFirstHitDepthMeters[index]
            );
            return {
                bakeSampleRequest: selected.bakeSampleRequest,
                liveFirstHitDepthMeters,
                liveOccupancy,
                receipt: {
                    coverage: {
                        authenticatedCasterCount: candidates.casterIds.length,
                        candidateCount: candidates.candidates.length,
                        outOfCoverageCasterIds: selected.outOfCoverageCasterIds,
                        sampledCasterCount: selected.diagnostics.authenticatedFirstHitSampleCount
                    },
                    diagnostics: selected.diagnostics,
                    nativeCapture: {
                        sourceProof: liveCapture.nativeCapture.sourceProof,
                        stateRestoration: liveCapture.nativeCapture.stateRestoration,
                        transfer: liveCapture.nativeCapture.transfer
                    },
                    schema: 'ai531-production-alpha-cutout-live-sparse-capture-receipt-v1',
                    stateRestoration: liveCapture.stateRestoration,
                    status: 'complete'
                },
                samplePlan: selected.samplePlan
            };
        }, {
            descriptor: options.descriptor,
            expectedCasterIds: options.expectedCasterIds,
            profile: options.profile
        });
        const blocking = diagnostics.filter((entry) => !(
            entry.kind === 'console.error'
            && entry.message.includes('Failed to load resource')
        ));
        if (blocking.length > 0) {
            throw new Error(`Live capture emitted blocking diagnostics: ${JSON.stringify(blocking)}`);
        }
        return result;
    } finally {
        await browser?.close().catch(() => {});
        server?.kill();
    }
}

async function loadPriorLiveEvidence(liveRoot) {
    const relative = path.relative(artifactRoot, liveRoot);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Prior live root must stay below illumination_531');
    }
    const [
        samplePlanBytes,
        sampleRequestBytes,
        liveOccupancyBytes,
        liveDepthBytes,
        receiptBytes
    ] = await Promise.all([
        readFile(path.join(liveRoot, 'sample_plan.json')),
        readFile(path.join(liveRoot, 'bake_sample_request.json')),
        readFile(path.join(liveRoot, 'live_occupancy.u8')),
        readFile(path.join(liveRoot, 'live_first_hit_depth.f32le')),
        readFile(path.join(liveRoot, 'live_capture_receipt.json'))
    ]);
    const samplePlan = JSON.parse(samplePlanBytes);
    const bakeSampleRequest = JSON.parse(sampleRequestBytes);
    const receipt = JSON.parse(receiptBytes);
    if (receipt.schema !== 'ai531-production-alpha-cutout-live-sparse-capture-receipt-v1'
        || receipt.status !== 'complete'
        || samplePlan.samples?.length !== liveOccupancyBytes.byteLength
        || liveDepthBytes.byteLength !== liveOccupancyBytes.byteLength * 4
        || bakeSampleRequest.samples?.length !== liveOccupancyBytes.byteLength) {
        throw new Error('Prior live evidence is incomplete or internally inconsistent');
    }
    return {
        bakeSampleRequest,
        liveDepthBytes,
        liveOccupancyBytes,
        receipt,
        samplePlan,
        samplePlanBytes,
        sampleRequestBytes
    };
}

function encodeFloat32Le(values) {
    const buffer = Buffer.alloc(values.length * 4);
    values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
    return buffer;
}

function parseReceiptMarker(stdout) {
    const prefix = 'AI531_ALPHA_CUTOUT_BAKE_SPARSE_RECEIPT=';
    const lines = String(stdout).split(/\r?\n/u)
        .filter((line) => line.startsWith(prefix));
    if (lines.length !== 1) throw new Error('Headless Blender emitted no unique receipt marker');
    const value = JSON.parse(lines[0].slice(prefix.length));
    if (!Number.isSafeInteger(value.byteLength) || value.byteLength <= 0
        || value.path !== 'capture_receipt.json'
        || !/^[0-9a-f]{64}$/u.test(value.sha256)) {
        throw new Error('Headless Blender receipt marker is invalid');
    }
    return value;
}

async function requireNewOutputRoot(outputRoot) {
    const relative = path.relative(artifactRoot, outputRoot);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Evidence output root must be a named child below illumination_531');
    }
    try {
        await stat(outputRoot);
        throw new Error('Evidence output root already exists; refusing to overwrite it');
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
    }
}

function assertArtifactChild(value) {
    const resolved = path.resolve(repoRoot, value);
    const relative = path.relative(artifactRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Output must stay below tests/artifacts/illumination_531');
    }
    return resolved;
}

function requireLoopbackUrl(value) {
    const url = new URL(value);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
        throw new Error('--url must use a loopback host');
    }
    return url.href.replace(/\/$/u, '');
}

function positiveInteger(value, label) {
    if (!/^[1-9][0-9]*$/u.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new TypeError(`${label} must be a positive safe integer`);
    }
    return Number(value);
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function compareStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function canListen(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.once('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
}

async function findFreePort(start) {
    for (let port = start; port < start + 200; port += 1) {
        if (await canListen(port)) return port;
    }
    throw new Error(`No free evidence capture port found from ${start}`);
}

async function waitForServer(baseUrl) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
        try {
            const response = await fetch(`${baseUrl}/__health`);
            if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Static server did not become healthy at ${baseUrl}`);
}

if (process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    run().catch((error) => {
        const processContext = error?.context && typeof error.context === 'object'
            ? {
                exitCode: error.context.exitCode ?? null,
                signal: error.context.signal ?? null,
                stderr: String(error.context.stderr ?? '').slice(-32_768),
                stdout: String(error.context.stdout ?? '').slice(-32_768)
            }
            : null;
        process.stderr.write(canonicalJsonStringify({
            code: typeof error?.code === 'string' ? error.code : null,
            message: error instanceof Error ? error.message : String(error),
            processContext,
            schema: 'ai531-production-alpha-cutout-evidence-run-error-v1'
        }) + '\n');
        process.exitCode = 1;
    });
}
