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
    evaluateProductionCaseMetrics,
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
    'assets/baked_lighting/shadows/package_index.json'
);
const defaultOutputRoot = path.join(
    screenshotAuthorityRoot,
    'production_mismatch_localization_dense_w_az135_el08_v1'
);

/** @param {any} [options] @param {{chromiumApi?: typeof chromium}} [deps] */
export async function runProductionMismatchLocalization(options = {}, deps = {}) {
    const metricsOnly = options.metricsOnly === true;
    const directRender = options.directRender === true;
    const disableGtao = options.disableGtao === true;
    const enableInstancedCasters = options.enableInstancedCasters === true;
    const disableShadowCulling = options.disableShadowCulling === true;
    // The pre-activation capture is the real gameplay renderer and therefore
    // the default oracle. paired-live deliberately remains available only to
    // diagnose the validation-only transition itself.
    const currentSource = options.currentSource ?? 'preactivation';
    const direction = options.direction ?? 'cache_brighter';
    if (currentSource !== 'paired-live'
        && currentSource !== 'paired-live-cache-first'
        && currentSource !== 'preactivation') {
        throw new Error(
            "currentSource must be 'paired-live', 'paired-live-cache-first', or 'preactivation'"
        );
    }
    if (direction !== 'cache_brighter' && direction !== 'cache_darker') {
        throw new Error("direction must be 'cache_brighter' or 'cache_darker'");
    }
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
    const sampleCount = requireInteger(
        options.sampleCount ?? PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT,
        1,
        PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT,
        'sampleCount'
    );
    const targetPixel = options.targetPixel ?? null;
    if (targetPixel && (metricsOnly || sampleCount !== 1)) {
        throw new Error('target pixel requires caster localization with sampleCount 1');
    }
    const timingContaminationReason = normalizeReason(
        options.timingContaminationReason
            ?? 'multiple-process-and-gpu-contention-declared-by-user'
    );
    const targetCaseId = options.caseId
        ?? PRODUCTION_MISMATCH_LOCALIZATION_TARGET_CASE_ID;
    const packageIndex = validateProductionPackageIndex(
        JSON.parse(await readFile(packageIndexPath, 'utf8'))
    );
    const validationCase = ILLUMINATION_VALIDATION_CASES.find(
        (entry) => entry.id === targetCaseId
    );
    if (!validationCase || !validationCase.sunProfile?.id) {
        throw new Error(
            `requested mismatch-localization case ${JSON.stringify(targetCaseId)}`
            + ' is absent or has no sun profile'
        );
    }
    const preludeCaseIds = options.preludeCaseId
        ? String(options.preludeCaseId).split(',').map((entry) => entry.trim()).filter(Boolean)
        : [];
    if (preludeCaseIds.length > 8 || new Set(preludeCaseIds).size !== preludeCaseIds.length) {
        throw new Error('prelude cases must contain at most eight unique IDs');
    }
    const preludeCases = preludeCaseIds.map((caseId) => (
        ILLUMINATION_VALIDATION_CASES.find((entry) => entry.id === caseId)
    ));
    const preludeRepeat = requireInteger(options.preludeRepeat ?? 1, 1, 8, 'preludeRepeat');
    if (preludeCases.length === 0 && options.preludeRepeat !== undefined) {
        throw new Error('prelude repeat requires a prelude case');
    }
    if (preludeCases.some((entry) => (!entry
        || entry.kind === 'lab'
        || entry.sunProfile?.id !== validationCase.sunProfile.id))) {
        throw new Error('prelude case must be a non-lab case in the target sun profile');
    }
    if (preludeCases.length > 0
        && currentSource !== 'paired-live-cache-first'
        && currentSource !== 'preactivation') {
        throw new Error(
            'prelude case requires cache-first or production preactivation current ordering'
        );
    }
    if (preludeCases.length > 0 && currentSource === 'preactivation' && preludeRepeat !== 1) {
        throw new Error('production preactivation preludes cannot be repeated');
    }
    const sourceReportAuthentication = await authenticateSourceReport(
        sourceReportPath,
        validationCase,
        sampleCount,
        !metricsOnly && direction === 'cache_brighter'
    );
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
        await page.route('**/pbr.material.correction.config.js', async (route) => {
            const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
            const diskPath = path.resolve(repoRoot, `.${pathname}`);
            const relative = path.relative(repoRoot, diskPath);
            if (!relative.startsWith('..') && !path.isAbsolute(relative)
                && existsSync(diskPath)) {
                await route.continue();
                return;
            }
            await route.fulfill({
                body: 'export default null;\n',
                contentType: 'text/javascript; charset=utf-8',
                status: 200
            });
        });
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
        if (enableInstancedCasters) {
            await page.evaluate(() => {
                const {engine, sm} = window.__busSim;
                engine.setShadowSettings({
                    ...engine.shadowSettings,
                    instancedCasters: true
                });
                sm.current?.city?.applyShadowSettings?.(engine);
            });
        }
        if (disableShadowCulling) {
            await page.evaluate(() => {
                const city = window.__busSim?.sm?.current?.city;
                // Preserve the culler object and its inventory for diagnostics,
                // but make every conservative test intersect for all warmups.
                if (city?._shadowCuller) city._shadowCuller.paddingMeters = 1_000_000;
            });
        }
        await page.evaluate((enabled) => (
            window.__ai531ProductionValidation.setDirectRenderingForDiagnostics(enabled)
        ), directRender);
        if (disableGtao) {
            await page.evaluate(() => {
                const {engine} = window.__busSim;
                engine.setAmbientOcclusionSettings({
                    ...engine._ambientOcclusion?.settings,
                    mode: 'off'
                });
            });
        }
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
        if (currentSource === 'preactivation') {
            // Mirror the production validator: every genuine current frame is
            // captured before package activation, in catalog order.
            for (const preludeCase of preludeCases) {
                await page.evaluate(
                    async ({caseValue, warmups}) => (
                        window.__ai531ProductionValidation.captureCurrent(caseValue, warmups)
                    ),
                    {caseValue: preludeCase, warmups: warmupFrames}
                );
            }
        }
        const preactivationCurrent = currentSource === 'paired-live-cache-first'
            ? null
            : await page.evaluate(
                async ({caseValue, warmups}) => (
                    window.__ai531ProductionValidation.captureCurrent(caseValue, warmups)
                ),
                {caseValue: validationCase, warmups: warmupFrames}
            );
        if (currentSource === 'preactivation') {
            await gameCanvas.screenshot({path: capturePaths.current, type: 'png'});
        }
        const activation = await page.evaluate(async () => (
            window.__ai531ProductionValidation.activatePreparedProfile()
        ));
        if (!isCacheActive(activation)
            || activation.sourceShadowTexelPhaseEvidence?.status !== 'verified') {
            throw new Error(`target package did not activate with verified phase: ${JSON.stringify(activation)}`);
        }
        if (preludeCases.length > 0) {
            for (let repeat = 0; repeat < preludeRepeat; repeat += 1) {
                for (const preludeCase of preludeCases) {
                    await page.evaluate(async ({caseValue, warmups, productionOrdering}) => {
                        await window.__ai531ProductionValidation.captureCache(caseValue, warmups);
                        if (!productionOrdering) {
                            await window.__ai531ProductionValidation.capturePairedCurrent(
                                caseValue,
                                warmups
                            );
                        }
                        await window.__ai531ProductionValidation.captureComparisonAndCompare(
                            caseValue,
                            warmups
                        );
                        window.__ai531ProductionValidation.captureReceiverMask(
                            caseValue,
                            'staticCityReceiverMask'
                        );
                        window.__ai531ProductionValidation.captureReceiverMask(
                            caseValue,
                            'dynamicReceiverMask'
                        );
                        window.__ai531ProductionValidation.finishReceiverMaskEvidence(caseValue);
                    }, {
                        caseValue: preludeCase,
                        productionOrdering: currentSource === 'preactivation',
                        warmups: warmupFrames
                    });
                }
            }
        }
        let current = preactivationCurrent;
        let cache;
        if (currentSource === 'paired-live-cache-first') {
            // Hardware evidence showed that entering liveFinal perturbs the next
            // cache frame. Capture the untouched cache first, then replace only
            // the stored current oracle while preserving those cache bytes.
            cache = await page.evaluate(
                async ({caseValue, warmups}) => (
                    window.__ai531ProductionValidation.captureCache(caseValue, warmups)
                ),
                {caseValue: validationCase, warmups: warmupFrames}
            );
            await gameCanvas.screenshot({path: capturePaths.cache, type: 'png'});
            current = await page.evaluate(
                async ({caseValue, warmups}) => (
                    window.__ai531ProductionValidation.capturePairedCurrent(caseValue, warmups)
                ),
                {caseValue: validationCase, warmups: warmupFrames}
            );
            await gameCanvas.screenshot({path: capturePaths.current, type: 'png'});
        } else {
            if (currentSource === 'paired-live') {
                current = await page.evaluate(
                    async ({caseValue, warmups}) => (
                        window.__ai531ProductionValidation.capturePairedCurrent(caseValue, warmups)
                    ),
                    {caseValue: validationCase, warmups: warmupFrames}
                );
                await gameCanvas.screenshot({path: capturePaths.current, type: 'png'});
            }
            cache = await page.evaluate(
                async ({caseValue, warmups}) => (
                    window.__ai531ProductionValidation.captureCache(caseValue, warmups)
                ),
                {caseValue: validationCase, warmups: warmupFrames}
            );
            await gameCanvas.screenshot({path: capturePaths.cache, type: 'png'});
        }
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
                request: metricsOnly ? null : {
                    schema: 'ai531-production-mismatch-localization-request-v1',
                    productionEligible: false,
                    sampleCount,
                    direction,
                    ...(targetPixel ? {targetPixel} : {}),
                    ...(validationCase.id
                        === PRODUCTION_MISMATCH_LOCALIZATION_TARGET_CASE_ID
                        ? {}
                        : {targetCaseId: validationCase.id})
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
        if (!metricsOnly && (localization?.samples?.length !== sampleCount
            || localization?.aggregate?.sampleCount
                !== sampleCount
            || localization?.depthColorInferenceUsed !== false
            || localization?.productionEligible !== false)) {
            throw new Error('bounded live caster localization result is incomplete or promotable');
        }
        if (metricsOnly && localization != null) {
            throw new Error('metrics-only probe unexpectedly ran caster localization');
        }
        const metricFailures = evaluateProductionCaseMetrics(comparison.metrics);
        const report = {
            schema: PRODUCTION_MISMATCH_LOCALIZATION_REPORT_SCHEMA,
            diagnosticSchema: PRODUCTION_MISMATCH_LOCALIZATION_SCHEMA,
            generatedAt: new Date().toISOString(),
            status: browserDiagnostics.length > 0
                ? 'invalid_browser_diagnostics'
                : (metricsOnly
                    ? (metricFailures.length === 0 ? 'metrics_passed' : 'metrics_failed')
                    : 'completed'),
            productionEligible: false,
            promotable: false,
            mode: metricsOnly ? 'metrics_only' : 'caster_localization',
            renderPath: directRender ? 'direct_renderer_diagnostic' : 'gameplay_postprocessing',
            postProcessingOverrides: {gtaoDisabled: disableGtao},
            shadowCasterOverrides: {
                instancedCastersEnabled: enableInstancedCasters,
                shadowCullingDisabled: disableShadowCulling
            },
            currentSource,
            preludeCaseIds,
            preludeRepeat: preludeCases.length > 0 ? preludeRepeat : 0,
            direction,
            targetCaseId: validationCase.id,
            lightingProfileId: validationCase.sunProfile.id,
            samplePlan: metricsOnly ? null : {
                method: targetPixel
                    ? 'explicit-single-framebuffer-pixel-v1'
                    : 'stable-hash-one-per-8x8-framebuffer-stratum-then-fill-v1',
                direction,
                ...(targetPixel ? {targetPixel} : {}),
                requestedSampleCount: sampleCount,
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
                metrics: comparison.metrics,
                maximumRgbErrorPixel: comparison.maximumRgbErrorPixel,
                passed: metricFailures.length === 0,
                failures: metricFailures
            },
            captureWorkloads: {
                current: current.workload,
                cache: cache.workload,
                comparison: comparison.workload
            },
            staticShadowDiagnostics: {
                current: current.staticShadow,
                cache: cache.staticShadow,
                comparison: comparison.staticShadow
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

async function authenticateSourceReport(
    reportPath,
    validationCase,
    sampleCount,
    requireMissingCandidates = true
) {
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
        (entry) => entry.caseId === validationCase.id
    );
    if (!target || target.lightingProfileId !== validationCase.sunProfile.id
        || !Number.isSafeInteger(target.metrics?.missingOccluderPixelCount)
        || (requireMissingCandidates
            && target.metrics.missingOccluderPixelCount < sampleCount)) {
        throw new Error(
            'source production report lacks enough strict missing-occluder pixels '
            + 'for the requested bounded target case'
        );
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
        if (token === '--metrics-only' || token === '--direct-render'
            || token === '--disable-gtao' || token === '--enable-instanced-casters'
            || token === '--disable-shadow-culling') {
            const flagKey = token === '--metrics-only' ? 'metricsOnly'
                : (token === '--direct-render' ? 'directRender'
                    : (token === '--disable-gtao'
                        ? 'disableGtao'
                        : (token === '--enable-instanced-casters'
                            ? 'enableInstancedCasters' : 'disableShadowCulling')));
            result[flagKey] = true;
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
            '--case-id': 'caseId',
            '--prelude-case-id': 'preludeCaseId',
            '--prelude-repeat': 'preludeRepeat',
            '--current-source': 'currentSource',
            '--direction': 'direction',
            '--target-pixel': 'targetPixel',
            '--url': 'baseUrl',
            '--port': 'preferredPort',
            '--chrome': 'chromePath',
            '--warmup-frames': 'warmupFrames',
            '--sample-count': 'sampleCount',
            '--timing-contaminated-reason': 'timingContaminationReason'
        })[token];
        if (!key) throw new Error(`Unknown option '${token}'`);
        result[key] = key === 'targetPixel' ? parseTargetPixel(next)
            : key === 'preferredPort' || key === 'warmupFrames'
            || key === 'preludeRepeat'
            || key === 'sampleCount'
            ? Number(next) : next;
        index += 1;
    }
    return Object.freeze(result);
}

function parseTargetPixel(value) {
    const parts = String(value).split(',').map(Number);
    if (parts.length !== 2 || parts.some((entry) => !Number.isSafeInteger(entry) || entry < 0)) {
        throw new Error('target pixel must be two nonnegative integers formatted x,y');
    }
    return parts;
}

export function createProductionMismatchLocalizationUsageText() {
    return [
        'Usage: node tools/static_sun_depth/localize_production_mismatch.mjs [options]',
        '',
        '  --source-report <production_validation_report.json>',
        '  --package-index <package_index.json>',
        '  --output-root <tests/artifacts/screens/illumination_531/...>',
        '  --case-id <validation-case-id>  Explicit failed catalog case with at least 64 missing pixels',
        '  --prelude-case-id <id[,id...]>      Run up to eight same-profile transitions first',
        '  --prelude-repeat <1..8>             Repeat the prelude transition (default 1)',
        '  --current-source <paired-live|paired-live-cache-first|preactivation>',
        '                                      Diagnostic current capture source/order',
        '  --direction <cache_brighter|cache_darker>  Diagnostic mismatch direction',
        '  --target-pixel <x,y>          Localize one exact WebGL framebuffer pixel',
        '  --url <http://127.0.0.1:port>  Reuse a repository static server',
        '  --port <number>                Preferred local port (default 4181)',
        '  --chrome <path>                Installed Chrome/Chromium executable',
        '  --warmup-frames <count>        Frames before each capture (default 2)',
        '  --sample-count <1..64>          Strict missing pixels to localize (default 64)',
        '  --metrics-only                  Skip caster sampling and write parity metrics even with zero missing pixels',
        '  --direct-render                 Diagnostic-only: bypass gameplay post-processing for captures',
        '  --disable-gtao                  Diagnostic-only: retain the composer but disable GTAO',
        '  --enable-instanced-casters      Diagnostic-only: compare optional live facade-detail casters',
        '  --disable-shadow-culling         Diagnostic-only: retain every indexed live static caster',
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
        aggregate: result.report.casterLocalization?.aggregate ?? null
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
