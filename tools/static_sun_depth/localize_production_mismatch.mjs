#!/usr/bin/env node
// Runs the bounded, artifact-only AI 531 production mismatch caster diagnostic.
// @ts-check

import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ILLUMINATION_VALIDATION_CASES} from '../../src/app/illumination/validation/IlluminationValidationCaseCatalog.js';
import {
    PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
    PRODUCTION_VALIDATION_REPORT_SCHEMA,
    PRODUCTION_VALIDATION_THRESHOLDS,
    installBrowserValidationRuntime,
    validateProductionPackageIndex
} from './validate_production.mjs';
import {
    PRODUCTION_VALIDATION_CAPTURE_SLOTS,
    createValidationCaptureRecord
} from './src/ValidationCaptureAuthentication.mjs';
import {
    PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT,
    PRODUCTION_MISMATCH_LOCALIZATION_SCHEMA,
    PRODUCTION_MISMATCH_LOCALIZATION_TARGET_CASE_ID
} from './browser/ProductionMismatchLocalization.js';

export const PRODUCTION_MISMATCH_LOCALIZATION_REPORT_SCHEMA =
    'ai531-production-mismatch-localization-report-v1';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const screenshotAuthorityRoot = path.join(
    repoRoot,
    'tests/artifacts/screens/illumination_531'
);
const defaultSourceReportPath = path.join(
    screenshotAuthorityRoot,
    'production_final_v1/production_validation_report.json'
);
const defaultPackageIndexPath = path.join(
    repoRoot,
    'tests/artifacts/illumination_531/package_index.json'
);
const defaultOutputRoot = path.join(
    screenshotAuthorityRoot,
    'production_mismatch_localization_dense_w_az135_el08_v1'
);

/** @param {any} [options] @param {{chromiumApi?: typeof chromium}} [deps] */
export async function runProductionMismatchLocalization(options = {}, deps = {}) {
    const sourceReportPath = requireRepositoryFile(
        options.sourceReportPath ?? defaultSourceReportPath,
        'source production report'
    );
    const packageIndexPath = requireRepositoryFile(
        options.packageIndexPath ?? defaultPackageIndexPath,
        'package index'
    );
    const outputRoot = requireOutputRoot(options.outputRoot ?? defaultOutputRoot);
    const warmupFrames = requireInteger(options.warmupFrames ?? 2, 0, 30, 'warmupFrames');
    const timingContaminationReason = normalizeReason(
        options.timingContaminationReason
            ?? 'multiple-process-and-gpu-contention-declared-by-user'
    );
    const sourceReportAuthentication = await authenticateSourceReport(sourceReportPath);
    const packageIndex = validateProductionPackageIndex(
        JSON.parse(await readFile(packageIndexPath, 'utf8'))
    );
    const validationCase = ILLUMINATION_VALIDATION_CASES.find(
        (entry) => entry.id === PRODUCTION_MISMATCH_LOCALIZATION_TARGET_CASE_ID
    );
    if (!validationCase || validationCase.kind !== 'low_sun_pose'
        || validationCase.sunProfile?.id !== 'ai527.sun.az135.el08') {
        throw new Error('canonical mismatch-localization case is absent or drifted');
    }
    const packageEntry = packageIndex.profiles[validationCase.sunProfile.id];
    if (!packageEntry) throw new Error('target diagnostic profile is absent from package index');
    await mkdir(outputRoot, {recursive: true});

    let server = null;
    let browser = null;
    const browserDiagnostics = [];
    try {
        const preferredPort = requireInteger(options.preferredPort ?? 4181, 1024, 65535, 'preferredPort');
        const port = options.baseUrl ? preferredPort : await findFreePort(preferredPort);
        const baseUrl = options.baseUrl ?? `http://127.0.0.1:${port}`;
        if (!options.baseUrl) {
            server = spawn(process.execPath, ['tests/headless/e2e/static_server.mjs'], {
                cwd: repoRoot,
                env: {...process.env, PORT: String(port)},
                stdio: ['ignore', 'ignore', 'pipe']
            });
            let serverError = '';
            server.stderr.on('data', (chunk) => {
                serverError += String(chunk);
                if (serverError.length > 32_768) serverError = serverError.slice(-32_768);
            });
            await waitForServer(baseUrl).catch((error) => {
                throw new Error(`${error.message}\n${serverError.trim()}`);
            });
        } else {
            await waitForServer(baseUrl);
        }
        const requestedChromePath = options.chromePath
            ?? process.env.PLAYWRIGHT_EXECUTABLE_PATH
            ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
        browser = await (deps.chromiumApi ?? chromium).launch({
            headless: true,
            ...(requestedChromePath && existsSync(requestedChromePath)
                ? {executablePath: requestedChromePath} : {}),
            args: [
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--enable-precise-memory-info'
            ]
        });
        const page = await browser.newPage({viewport: {width: 1280, height: 744}});
        page.setDefaultTimeout(0);
        page.on('pageerror', (error) => browserDiagnostics.push({
            kind: 'pageerror',
            message: error?.message ?? String(error)
        }));
        page.on('requestfailed', (request) => browserDiagnostics.push({
            kind: 'requestfailed',
            message: `${request.url()} ${request.failure()?.errorText ?? ''}`
        }));
        page.on('console', (message) => {
            if (message.type() === 'error') {
                browserDiagnostics.push({kind: 'console.error', message: message.text()});
            }
        });
        const productionUrl = `${baseUrl}/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0`;
        await page.goto(productionUrl);
        await page.waitForFunction(() => (
            window.__busSim?.sm?.currentName === 'game_mode'
            && window.__busSim?.sm?.current?.city?.cityId === 'bigcity2'
        ), null, {timeout: 180_000});
        await page.evaluate(async () => {
            const {engine, sm} = window.__busSim;
            await Promise.all([
                engine.waitForLightingReady?.(),
                sm.current?.city?.world?.trees?.readyPromise,
                sm.current?.busModel?.userData?.readyPromise
            ].filter(Boolean));
        });
        const environment = await installBrowserValidationRuntime(page);
        const gameCanvas = page.locator('#game-canvas');
        const receiverMaskCanvas = page.locator('#ai531-production-receiver-mask-evidence');
        const gameCanvasBounds = await gameCanvas.boundingBox();
        if (!gameCanvasBounds
            || gameCanvasBounds.width !== PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS[0]
            || gameCanvasBounds.height !== PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS[1]) {
            throw new Error('mismatch localization requires the exact 1280x720 game canvas');
        }
        const profile = {
            lightingProfileId: validationCase.sunProfile.id,
            liveIdentity: packageEntry.liveIdentity,
            packageUrl: new URL(packageEntry.packagePath, `${baseUrl}/`).href,
            sunProfile: validationCase.sunProfile
        };
        await page.evaluate(async (value) => {
            await window.__ai531ProductionValidation.prepareProfile(value);
        }, profile);
        const capturePaths = Object.fromEntries(PRODUCTION_VALIDATION_CAPTURE_SLOTS.map(
            (slot) => [slot, path.join(outputRoot, `${slot}.png`)]
        ));
        const current = await page.evaluate(
            async ({caseValue, warmups}) => (
                window.__ai531ProductionValidation.captureCurrent(caseValue, warmups)
            ),
            {caseValue: validationCase, warmups: warmupFrames}
        );
        await gameCanvas.screenshot({path: capturePaths.current, type: 'png'});
        const activation = await page.evaluate(async () => (
            window.__ai531ProductionValidation.activatePreparedProfile()
        ));
        if (!isCacheActive(activation)
            || activation.sourceShadowTexelPhaseEvidence?.status !== 'verified') {
            throw new Error(`target package did not activate with verified phase: ${JSON.stringify(activation)}`);
        }
        const cache = await page.evaluate(
            async ({caseValue, warmups}) => (
                window.__ai531ProductionValidation.captureCache(caseValue, warmups)
            ),
            {caseValue: validationCase, warmups: warmupFrames}
        );
        await gameCanvas.screenshot({path: capturePaths.cache, type: 'png'});
        const comparison = await page.evaluate(
            async ({caseValue, warmups, request}) => (
                window.__ai531ProductionValidation.captureComparisonAndCompare(
                    caseValue,
                    warmups,
                    request
                )
            ),
            {
                caseValue: validationCase,
                warmups: warmupFrames,
                request: {
                    schema: 'ai531-production-mismatch-localization-request-v1',
                    productionEligible: false,
                    sampleCount: PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT
                }
            }
        );
        await gameCanvas.screenshot({path: capturePaths.comparison, type: 'png'});
        for (const slot of ['staticCityReceiverMask', 'dynamicReceiverMask']) {
            await page.evaluate(
                ({caseValue, maskSlot}) => (
                    window.__ai531ProductionValidation.captureReceiverMask(
                        caseValue,
                        maskSlot
                    )
                ),
                {caseValue: validationCase, maskSlot: slot}
            );
            await receiverMaskCanvas.screenshot({path: capturePaths[slot], type: 'png'});
        }
        await page.evaluate((caseValue) => (
            window.__ai531ProductionValidation.finishReceiverMaskEvidence(caseValue)
        ), validationCase);
        await page.evaluate(async () => {
            await window.__ai531ProductionValidation.dispose();
        });
        const captures = {};
        for (const slot of PRODUCTION_VALIDATION_CAPTURE_SLOTS) {
            captures[slot] = await createValidationCaptureRecord(capturePaths[slot], {
                authorityRoot: screenshotAuthorityRoot,
                expectedDimensionsPixels: PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
                repoRoot
            });
        }
        const captureEntries = Object.entries(captures)
            .sort(([left], [right]) => compareStrings(left, right));
        const localization = comparison.mismatchLocalization;
        if (localization?.samples?.length !== PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT
            || localization?.aggregate?.sampleCount
                !== PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT
            || localization?.depthColorInferenceUsed !== false
            || localization?.productionEligible !== false) {
            throw new Error('bounded live caster localization result is incomplete or promotable');
        }
        const report = {
            schema: PRODUCTION_MISMATCH_LOCALIZATION_REPORT_SCHEMA,
            diagnosticSchema: PRODUCTION_MISMATCH_LOCALIZATION_SCHEMA,
            generatedAt: new Date().toISOString(),
            status: browserDiagnostics.length === 0 ? 'completed' : 'invalid_browser_diagnostics',
            productionEligible: false,
            promotable: false,
            targetCaseId: validationCase.id,
            lightingProfileId: validationCase.sunProfile.id,
            samplePlan: {
                method: 'stable-hash-one-per-8x8-framebuffer-stratum-then-fill-v1',
                requestedSampleCount: PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT,
                selectedSampleCount: localization.samples.length,
                strictMissingOccluderPixelCount:
                    comparison.metrics.missingOccluderPixelCount,
                framebufferCoordinateSystem: 'webgl-lower-left-origin-v1'
            },
            sourceProductionReport: sourceReportAuthentication,
            freshCaptureAuthentication: {
                captureCount: captureEntries.length,
                captureSetSha256: sha256(Buffer.from(JSON.stringify(captureEntries))),
                dimensionsPixels: PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
                method: 'sha256-byte-length-rehash-five-one-case-pngs-v1',
                captures
            },
            baselineDelta: {
                baselineMissingOccluderPixelCount:
                    sourceReportAuthentication.baselineMissingOccluderPixelCount,
                freshMissingOccluderPixelCount:
                    comparison.metrics.missingOccluderPixelCount,
                deltaMissingOccluderPixelCount:
                    comparison.metrics.missingOccluderPixelCount
                        - sourceReportAuthentication.baselineMissingOccluderPixelCount
            },
            comparison: {
                thresholds: PRODUCTION_VALIDATION_THRESHOLDS,
                metrics: comparison.metrics
            },
            casterLocalization: localization,
            currentDiagnostics: current.diagnostics,
            cacheDiagnostics: cache.diagnostics,
            activation: {
                sourceShadowFilterIdentity: activation.sourceShadowFilterIdentity,
                sourceShadowTexelPhaseEvidence: activation.sourceShadowTexelPhaseEvidence
            },
            browserDiagnosticGate: {
                passed: browserDiagnostics.length === 0,
                diagnosticCount: browserDiagnostics.length
            },
            browserDiagnostics,
            environment: {
                ...environment,
                browserVersion: await browser.version(),
                productionUrl
            },
            timingContamination: {
                contaminated: true,
                reason: timingContaminationReason,
                usableForPromotion: false
            }
        };
        const reportPath = path.join(
            outputRoot,
            'production_mismatch_localization_report.json'
        );
        await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        if (browserDiagnostics.length > 0) {
            throw new Error(`browser diagnostics invalidated mismatch localization; report=${artifactPath(reportPath)}`);
        }
        return Object.freeze({report, reportPath});
    } finally {
        await browser?.close?.().catch(() => {});
        if (server && !server.killed) server.kill('SIGTERM');
    }
}

async function authenticateSourceReport(reportPath) {
    const bytes = await readFile(reportPath);
    const report = JSON.parse(bytes.toString('utf8'));
    if (report.schema !== PRODUCTION_VALIDATION_REPORT_SCHEMA
        || report.status !== 'failed'
        || JSON.stringify(report.thresholds)
            !== JSON.stringify(PRODUCTION_VALIDATION_THRESHOLDS)
        || JSON.stringify(report.captureAuthentication?.dimensionsPixels)
            !== JSON.stringify(PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS)) {
        throw new Error('source production report is stale or incompatible');
    }
    const target = report.cases?.find(
        (entry) => entry.caseId === PRODUCTION_MISMATCH_LOCALIZATION_TARGET_CASE_ID
    );
    if (!target || target.lightingProfileId !== 'ai527.sun.az135.el08'
        || !Number.isSafeInteger(target.metrics?.missingOccluderPixelCount)
        || target.metrics.missingOccluderPixelCount < 1) {
        throw new Error('source production report lacks the exact failed target case');
    }
    const authenticatedCaptures = {};
    for (const slot of PRODUCTION_VALIDATION_CAPTURE_SLOTS) {
        const recorded = target.captures?.[slot];
        if (!recorded?.path) throw new Error(`source target capture '${slot}' is absent`);
        const actual = await createValidationCaptureRecord(
            path.resolve(repoRoot, ...recorded.path.split('/')),
            {
                authorityRoot: screenshotAuthorityRoot,
                expectedDimensionsPixels: PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
                repoRoot
            }
        );
        if (JSON.stringify(actual) !== JSON.stringify(recorded)) {
            throw new Error(`source target capture '${slot}' differs from its report record`);
        }
        authenticatedCaptures[slot] = actual;
    }
    return Object.freeze({
        path: artifactPath(reportPath),
        byteLength: bytes.byteLength,
        sha256: sha256(bytes),
        schema: report.schema,
        reportCaptureSetSha256: report.captureAuthentication.captureSetSha256,
        baselineMissingOccluderPixelCount: target.metrics.missingOccluderPixelCount,
        targetCaptures: authenticatedCaptures
    });
}

/** @param {readonly string[]} argv */
export function parseProductionMismatchLocalizationArgs(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--help') {
            result.help = true;
            continue;
        }
        const next = argv[index + 1];
        if (!token.startsWith('--') || !next || next.startsWith('--')) {
            throw new Error(`Option '${token}' requires a value`);
        }
        const key = ({
            '--source-report': 'sourceReportPath',
            '--package-index': 'packageIndexPath',
            '--output-root': 'outputRoot',
            '--url': 'baseUrl',
            '--port': 'preferredPort',
            '--chrome': 'chromePath',
            '--warmup-frames': 'warmupFrames',
            '--timing-contaminated-reason': 'timingContaminationReason'
        })[token];
        if (!key) throw new Error(`Unknown option '${token}'`);
        result[key] = key === 'preferredPort' || key === 'warmupFrames'
            ? Number(next) : next;
        index += 1;
    }
    return Object.freeze(result);
}

export function createProductionMismatchLocalizationUsageText() {
    return [
        'Usage: node tools/static_sun_depth/localize_production_mismatch.mjs [options]',
        '',
        '  --source-report <production_validation_report.json>',
        '  --package-index <package_index.json>',
        '  --output-root <tests/artifacts/screens/illumination_531/...>',
        '  --url <http://127.0.0.1:port>  Reuse a repository static server',
        '  --port <number>                Preferred local port (default 4181)',
        '  --chrome <path>                Installed Chrome/Chromium executable',
        '  --warmup-frames <count>        Frames before each capture (default 2)',
        '  --timing-contaminated-reason <text>',
        ''
    ].join('\n');
}

async function findFreePort(start) {
    for (let port = start; port < Math.min(65536, start + 200); port += 1) {
        if (await canListen(port)) return port;
    }
    throw new Error(`No free mismatch-localization port found from ${start}`);
}

function canListen(port) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.unref();
        probe.once('error', () => resolve(false));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
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

function requireRepositoryFile(value, label) {
    if (typeof value !== 'string' || !value) throw new TypeError(`${label} must be a path`);
    const resolved = path.resolve(value);
    const relative = path.relative(repoRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`${label} must stay inside the repository`);
    }
    return resolved;
}

function requireOutputRoot(value) {
    const resolved = path.resolve(value);
    const relative = path.relative(screenshotAuthorityRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('output root must stay below the AI531 screenshot authority');
    }
    return resolved;
}

function requireInteger(value, minimum, maximum, label) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new TypeError(`${label} must be an integer from ${minimum} through ${maximum}`);
    }
    return value;
}

function normalizeReason(value) {
    if (typeof value !== 'string' || value.trim() !== value
        || value.length < 1 || value.length > 512) {
        throw new TypeError('timing contamination reason must be a trimmed nonempty string');
    }
    return value;
}

function isCacheActive(diagnostics) {
    return diagnostics?.active
        && diagnostics?.runtime?.controller?.state === 'active'
        && diagnostics?.runtime?.controller?.effectiveMode === 'baked';
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function artifactPath(filePath) {
    return path.relative(repoRoot, filePath).replaceAll('\\', '/');
}

function compareStrings(left, right) {
    return left === right ? 0 : left < right ? -1 : 1;
}

async function main() {
    const options = parseProductionMismatchLocalizationArgs(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(createProductionMismatchLocalizationUsageText());
        return;
    }
    const result = await runProductionMismatchLocalization(options);
    process.stdout.write(`${JSON.stringify({
        ok: true,
        productionEligible: false,
        report: artifactPath(result.reportPath),
        strictMissingOccluderPixelCount:
            result.report.comparison.metrics.missingOccluderPixelCount,
        aggregate: result.report.casterLocalization.aggregate
    }, null, 2)}\n`);
}

const invokedUrl = process.argv[1]
    ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedUrl === import.meta.url) {
    await main().catch((error) => {
        process.stderr.write(`[ProductionMismatchLocalization] ${error?.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
