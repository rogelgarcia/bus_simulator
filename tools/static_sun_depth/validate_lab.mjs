// Runs strict eight-case Lab Scene current-versus-static-sun validation.
// @ts-check

import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {lstat, mkdir, readFile, writeFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
    ILLUMINATION_LAB_VALIDATION_CASES
} from '../../src/app/illumination/validation/IlluminationValidationCaseCatalog.js';
import {
    ILLUMINATION_MAX_CHUNK_BYTES,
    ILLUMINATION_MAX_PACKAGE_BYTES,
    rawSha256Hex
} from '../../src/app/illumination/package/index.js';
import {
    STATIC_SUN_DEPTH_CANONICAL_CHUNK_ID,
    partitionStaticSunDepthLayers,
    staticSunDepthLayerWindowChunkId
} from '../../src/app/illumination/static_sun_depth/index.js';
import {
    LAB_DENSITY_PRODUCTION_PROJECTION
} from './src/LabFixtureDomain.mjs';
import {
    LAB_EVIDENCE_CANVAS_ID,
    LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS,
    extractLabEvidenceRgb,
    requireLabEvidenceCaptureState
} from './src/LabEvidenceCapture.mjs';
import {
    authenticateValidationCaptureSet,
    createValidationCaptureRecord,
    requireCaptureAuthenticationSummary,
    requireCaptureRecord,
    VALIDATION_CAPTURE_SLOTS
} from './src/ValidationCaptureAuthentication.mjs';
import {decodePng} from '../reference_image_inspector/png.mjs';

export const LAB_VALIDATION_REPORT_SCHEMA =
    'bus-sim-static-sun-depth-lab-validation-report-v4';
export const LAB_VALIDATION_FIXTURE_SCHEMA =
    'bus-sim-static-sun-depth-webgl2-lab-fixture-v1';
export const LAB_VALIDATION_CASE_COUNT = 8;
export const LAB_VALIDATION_CAPTURE_DIMENSIONS_PIXELS =
    LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS;
export const LAB_VALIDATION_CAPABILITY_PROFILE_ID = 'development.static_sun_v1';
export const LAB_VALIDATION_PCF = Object.freeze({
    model: 'three-r183-vogel-5-linear-compare-v1',
    radiusTexels: 1.5,
    sampleCount: 5,
    screenRotation: 'interleaved-gradient-noise-gl-fragcoord-v1',
    hardwareComparison: 'linear-four-compare-taps-v1',
    shadowMapSizePolicy: 'derive-exact-live-single-high-v1',
    shadowMapWorldExtentMeters: Object.freeze([680, 680])
});
export const LAB_VALIDATION_SAMPLING_BIAS = Object.freeze({
    model: 'geometric-normal-offset-plus-constant-depth-relief-v1',
    constantDepthReliefMeters: 0.0697915,
    geometricNormalOffsetMeters: 0.0232
});
export const LAB_VALIDATION_TIMING_REASON =
    'not measured for promotion: host reported concurrent processes and shared GPU contention';
export const LAB_VALIDATION_THRESHOLDS = Object.freeze({
    falseLitToleranceByte: 4,
    maxContinuousSeamRunPixels: 1,
    maxRgbErrorByte: 64,
    meanRgbErrorByte: 0.35,
    missingOccluderPixelCount: 0,
    pixelsOverFourBytePercent: 0.2,
    seamErrorToleranceByte: 2,
    seamFalseLitPixelCount: 0
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {boolean} expectedPresent
 */
export async function assertLabEvidenceCanvasLifecycle(page, expectedPresent) {
    const lifecycle = await page.evaluate((canvasId) => ({
        apiPresent: !!window.__ai531LabValidation,
        canvasCount: document.querySelectorAll(`#${canvasId}`).length
    }), LAB_EVIDENCE_CANVAS_ID);
    const expectedCount = expectedPresent ? 1 : 0;
    if (lifecycle.apiPresent !== expectedPresent
        || lifecycle.canvasCount !== expectedCount) {
        throw new Error(
            'Lab evidence canvas lifecycle is invalid: ' + JSON.stringify(lifecycle)
        );
    }
    if (!expectedPresent) return lifecycle;
    const box = await page.locator(`#${LAB_EVIDENCE_CANVAS_ID}`).boundingBox();
    if (!box || JSON.stringify([box.x, box.y, box.width, box.height])
            !== JSON.stringify([
                0,
                0,
                ...LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS
            ])) {
        throw new Error('Lab evidence canvas bounding box is not exactly 1280x720 at origin');
    }
    return lifecycle;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} filePath
 * @param {unknown} value
 * @param {'current'|'cache'|'comparison'} expectedSlot
 */
export async function captureLabEvidencePng(page, filePath, value, expectedSlot) {
    const state = requireLabEvidenceCaptureState(value, expectedSlot);
    await assertLabEvidenceCanvasLifecycle(page, true);
    const liveState = requireLabEvidenceCaptureState(
        await page.evaluate(() => window.__ai531LabValidation.getEvidenceCanvasState()),
        expectedSlot
    );
    if (JSON.stringify(liveState) !== JSON.stringify(state)) {
        throw new Error(`Lab '${expectedSlot}' evidence canvas state changed before capture`);
    }
    await page.locator(`#${LAB_EVIDENCE_CANVAS_ID}`).screenshot({
        path: filePath,
        type: 'png',
        animations: 'disabled',
        caret: 'hide',
        omitBackground: true
    });
    const png = decodePng(await readFile(filePath));
    if (png.width !== LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS[0]
        || png.height !== LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS[1]) {
        throw new Error(`Lab '${expectedSlot}' evidence PNG dimensions changed`);
    }
    if (await rawSha256Hex(png.data) !== state.evidenceRgbaSha256) {
        throw new Error(
            `Lab '${expectedSlot}' evidence PNG changed canonical opaque RGBA bytes`
        );
    }
    const pngRgbSha256 = await rawSha256Hex(
        extractLabEvidenceRgb(png.data, png.width, png.height)
    );
    if (pngRgbSha256 !== state.authoritativeRgbSha256) {
        throw new Error(
            `Lab '${expectedSlot}' evidence PNG changed authoritative RGB bytes`
        );
    }
    for (const sample of state.evidenceSamples) {
        const offset = (
            sample.evidencePixel[1] * png.width + sample.evidencePixel[0]
        ) * 4;
        const pngRgba = Array.from(png.data.subarray(offset, offset + 4));
        if (JSON.stringify(pngRgba) !== JSON.stringify(sample.rgba)) {
            throw new Error(
                `Lab '${expectedSlot}' evidence PNG does not contain its RGB sample`
            );
        }
    }
    return state;
}

const LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS = 1e-9;
const LAB_EXACT_DENSITY_CROP_GRID_POLICY =
    'first-single-chunk-else-minimum-payload-canonical-layer-windows-2x2-through-4x4-v2';
const LAB_EXACT_DENSITY_GRID_CANDIDATES = Object.freeze([
    Object.freeze([2, 2]),
    Object.freeze([3, 2]),
    Object.freeze([2, 3]),
    Object.freeze([3, 3]),
    Object.freeze([4, 2]),
    Object.freeze([2, 4]),
    Object.freeze([4, 3]),
    Object.freeze([3, 4]),
    Object.freeze([4, 4])
]);

export function requireLabEffectiveShadowFilterEvidence(value) {
    const evidence = requirePlainRecord(value, 'lab effective shadow filter');
    requireExactDataKeys(evidence, [
        'effectiveMapSizeTexels',
        'model',
        'radiusTexels',
        'rendererMaxTextureSize',
        'requestedPresetMapSizeTexels',
        'sizePolicy',
        'worldExtentMeters',
        'worldRadiusMeters'
    ], 'lab effective shadow filter');
    const requested = requireExactPositiveIntegerPair(
        evidence.requestedPresetMapSizeTexels,
        'lab requested shadow-map size'
    );
    const effective = requireExactPositiveIntegerPair(
        evidence.effectiveMapSizeTexels,
        'lab effective shadow-map size'
    );
    if (!Number.isSafeInteger(evidence.rendererMaxTextureSize)
        || evidence.rendererMaxTextureSize < 256
        || requested[0] !== 16384 || requested[1] !== 16384
        || effective[0] !== effective[1]
        || effective[0] !== Math.min(16384, evidence.rendererMaxTextureSize)
        || evidence.model !== LAB_VALIDATION_PCF.model
        || evidence.sizePolicy !== LAB_VALIDATION_PCF.shadowMapSizePolicy
        || evidence.radiusTexels !== LAB_VALIDATION_PCF.radiusTexels
        || JSON.stringify(evidence.worldExtentMeters) !== '[680,680]') {
        throw new Error('lab effective shadow filter does not match live single_high policy');
    }
    const expectedWorldRadius = evidence.radiusTexels
        * evidence.worldExtentMeters[0]
        / effective[0];
    if (!Number.isFinite(evidence.worldRadiusMeters)
        || Math.abs(evidence.worldRadiusMeters - expectedWorldRadius) > 1e-15) {
        throw new Error('lab effective shadow filter world radius is inconsistent');
    }
    return evidence;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const allowedScreenshotRoot = path.join(
    repoRoot,
    'tests/artifacts/screens/illumination_531'
);
const defaultOutputRoot = path.join(allowedScreenshotRoot, 'lab');
const expectedCaseIds = Object.freeze(
    ILLUMINATION_LAB_VALIDATION_CASES.map((entry) => entry.id).sort(compareStrings)
);
const expectedProfileIds = Object.freeze([
    'ai527.sun.az045.el35',
    'ai527.sun.az135.el08',
    'ai527.sun.az225.el12'
]);
const CASE_METRIC_KEYS = Object.freeze([
    'dynamicReceiverMaskMethod',
    'dynamicReceiverPixelCount',
    'evaluatedPixelCount',
    'falseLitMethod',
    'height',
    'maxContinuousSeamRunPixels',
    'maxRgbErrorByte',
    'meanRgbErrorByte',
    'missingOccluderPixelCount',
    'pixelCount',
    'pixelsOverFourByte',
    'pixelsOverFourBytePercent',
    'seamErrorPixelCount',
    'seamFalseLitPixelCount',
    'seamMaskMethod',
    'seamPixelCount',
    'width'
]);
const CASE_INTEGER_METRIC_KEYS = Object.freeze([
    'dynamicReceiverPixelCount',
    'evaluatedPixelCount',
    'height',
    'maxContinuousSeamRunPixels',
    'maxRgbErrorByte',
    'missingOccluderPixelCount',
    'pixelCount',
    'pixelsOverFourByte',
    'seamErrorPixelCount',
    'seamFalseLitPixelCount',
    'seamPixelCount',
    'width'
]);

export function createLabValidationPlan(cases = ILLUMINATION_LAB_VALIDATION_CASES) {
    if (!Array.isArray(cases)) throw new TypeError('lab validation cases must be an array');
    const ids = cases.map((entry) => entry?.id).sort(compareStrings);
    if (ids.length !== LAB_VALIDATION_CASE_COUNT
        || ids.some((id, index) => id !== expectedCaseIds[index])) {
        throw new Error('lab runner must consume exactly ILLUMINATION_LAB_VALIDATION_CASES');
    }
    for (const entry of cases) {
        if (entry.kind !== 'lab' || entry.cityId !== 'lab_scene') {
            throw new Error(`lab case '${entry.id}' must target cityId 'lab_scene'`);
        }
        if (entry.camera?.kind !== 'lab_preset' || !entry.camera?.presetId) {
            throw new Error(`lab case '${entry.id}' must use an exact Lab Scene preset`);
        }
    }
    const byProfile = Map.groupBy(cases, (entry) => entry.sunProfile.id);
    const profileIds = [...byProfile.keys()].sort(compareStrings);
    if (profileIds.length !== expectedProfileIds.length
        || profileIds.some((id, index) => id !== expectedProfileIds[index])) {
        throw new Error('lab runner must cover exactly the three canonical sun profiles');
    }
    const coverage = new Set(cases.flatMap((entry) => entry.coverageTags));
    for (const required of [
        'alpha_cutout_silhouette',
        'long_shadow',
        'road',
        'roof',
        'underside_overhang',
        'vertical_receiver',
        'wall'
    ]) {
        if (!coverage.has(required)) throw new Error(`lab validation coverage is missing '${required}'`);
    }
    return freezeDeep({
        caseCount: cases.length,
        fixtureIds: [...new Set(cases.map((entry) => entry.labScenarioId))].sort(compareStrings),
        groups: profileIds.map((lightingProfileId) => ({
            lightingProfileId,
            sunProfile: byProfile.get(lightingProfileId)[0].sunProfile,
            cases: [...byProfile.get(lightingProfileId)]
        }))
    });
}

export function evaluateLabCaseMetrics(value) {
    const metrics = requireLabMetricRecord(value);
    const failures = [];
    if (metrics.meanRgbErrorByte > LAB_VALIDATION_THRESHOLDS.meanRgbErrorByte) {
        failures.push('mean_rgb_error');
    }
    if (metrics.pixelsOverFourBytePercent
        > LAB_VALIDATION_THRESHOLDS.pixelsOverFourBytePercent) {
        failures.push('pixels_over_four');
    }
    if (metrics.maxRgbErrorByte > LAB_VALIDATION_THRESHOLDS.maxRgbErrorByte) {
        failures.push('maximum_rgb_error');
    }
    if (metrics.missingOccluderPixelCount !== 0) failures.push('missing_occluder');
    if (metrics.seamFalseLitPixelCount !== 0) failures.push('false_lit_seam');
    if (metrics.maxContinuousSeamRunPixels
        > LAB_VALIDATION_THRESHOLDS.maxContinuousSeamRunPixels) {
        failures.push('continuous_seam');
    }
    return Object.freeze(failures);
}

export function requireLabMetricRecord(value) {
    const metrics = requirePlainRecord(value, 'lab case metrics');
    requireExactDataKeys(metrics, CASE_METRIC_KEYS, 'lab case metrics');
    for (const key of CASE_METRIC_KEYS.filter((entry) => !entry.endsWith('Method'))) {
        if (!Number.isFinite(metrics[key]) || metrics[key] < 0) {
            throw new TypeError(`lab case metric '${key}' must be a finite non-negative number`);
        }
    }
    for (const key of CASE_INTEGER_METRIC_KEYS) {
        if (!Number.isSafeInteger(metrics[key])) {
            throw new TypeError(`lab case metric '${key}' must be a safe integer`);
        }
    }
    if (metrics.width < 1 || metrics.height < 1
        || metrics.pixelCount !== metrics.width * metrics.height
        || metrics.evaluatedPixelCount < 1
        || metrics.evaluatedPixelCount + metrics.dynamicReceiverPixelCount
            !== metrics.pixelCount) {
        throw new Error('lab case metric dimensions and pixelCount must be consistent');
    }
    if (metrics.maxRgbErrorByte > 255 || metrics.meanRgbErrorByte > 255
        || metrics.pixelsOverFourByte > metrics.evaluatedPixelCount
        || metrics.missingOccluderPixelCount > metrics.evaluatedPixelCount
        || metrics.seamPixelCount > metrics.evaluatedPixelCount
        || metrics.seamErrorPixelCount > metrics.seamPixelCount
        || metrics.seamFalseLitPixelCount > metrics.seamPixelCount
        || metrics.pixelsOverFourBytePercent > 100) {
        throw new Error('lab case metrics contain an impossible count or byte value');
    }
    if ((metrics.seamErrorPixelCount === 0) !== (metrics.maxContinuousSeamRunPixels === 0)
        || metrics.maxContinuousSeamRunPixels > metrics.seamErrorPixelCount
        || metrics.maxContinuousSeamRunPixels > Math.max(metrics.width, metrics.height)
        || metrics.seamFalseLitPixelCount > metrics.missingOccluderPixelCount) {
        throw new Error('lab case metrics contain contradictory seam evidence');
    }
    const expectedPercent = metrics.pixelsOverFourByte / metrics.evaluatedPixelCount * 100;
    if (Math.abs(metrics.pixelsOverFourBytePercent - expectedPercent) > 1e-12) {
        throw new Error('lab pixelsOverFourBytePercent is inconsistent with its count');
    }
    if (metrics.falseLitMethod
            !== 'cache_luma_gt_current_unmasked_3x3_max_plus_4_bytes_v2'
        || metrics.dynamicReceiverMaskMethod
            !== 'dynamic_bus_black_white_material_id_difference_v1'
        || metrics.seamMaskMethod
            !== 'static_sun_depth_seam_debug_red_gt_blue_plus_32_v1') {
        throw new Error('lab case metric method identity is unsupported');
    }
    return metrics;
}

export function evaluateLabCasterTransition(cacheDiagnostics, comparisonDiagnostics) {
    const failures = [];
    const cacheCasters = cacheDiagnostics?.casters;
    const comparisonCasters = comparisonDiagnostics?.casters;
    const cacheSuppressed = isCacheActive(cacheDiagnostics)
        && cacheDiagnostics?.debugMode === 'final'
        && cacheCasters?.active === true
        && Number.isSafeInteger(cacheCasters?.staticMeshCount)
        && cacheCasters.staticMeshCount > 0
        && Number.isSafeInteger(cacheCasters?.originalCasterCount)
        && cacheCasters.originalCasterCount > 0
        && cacheCasters.suppressedCasterCount === cacheCasters.originalCasterCount
        && cacheCasters.snapshotMeshCount === cacheCasters.staticMeshCount;
    if (!cacheSuppressed) failures.push('static_casters_not_suppressed');
    const comparisonRestored = isCacheActive(comparisonDiagnostics)
        && comparisonDiagnostics?.debugMode === 'currentDifference'
        && comparisonCasters?.active === false
        && comparisonCasters?.snapshotMeshCount === 0
        && comparisonCasters?.originalCasterCount === cacheCasters?.originalCasterCount
        && comparisonCasters?.lastReason === 'comparison_current_shadow_retained'
        && Number.isSafeInteger(comparisonCasters?.restores)
        && comparisonCasters.restores === cacheCasters?.restores + 1;
    if (!comparisonRestored) failures.push('static_casters_not_restored_for_comparison');
    return Object.freeze(failures);
}

export function evaluateLabShadowSubmission(
    currentWorkload,
    cacheWorkload,
    comparisonWorkload
) {
    const failures = [];
    const current = requireStaticCityShadowWorkload(currentWorkload, 'lab current');
    const cache = requireStaticCityShadowWorkload(cacheWorkload, 'lab cache');
    const comparison = requireStaticCityShadowWorkload(comparisonWorkload, 'lab comparison');
    const currentBus = requireDynamicBusShadowWorkload(currentWorkload, 'lab current');
    const cacheBus = requireDynamicBusShadowWorkload(cacheWorkload, 'lab cache');
    const comparisonBus = requireDynamicBusShadowWorkload(
        comparisonWorkload,
        'lab comparison'
    );
    if (current.calls <= 0 || current.triangles <= 0) {
        failures.push('current_static_shadow_submission_missing');
    }
    if (Object.values(cache).some((value) => value !== 0)) {
        failures.push('static_casters_submitted_in_cache');
    }
    if (comparison.calls <= 0 || comparison.triangles <= 0) {
        failures.push('comparison_static_shadow_submission_missing');
    }
    if ([currentBus, cacheBus, comparisonBus].some((value) => (
        value.calls <= 0 || value.triangles <= 0
    ))) failures.push('dynamic_bus_live_shadow_submission_missing');
    return Object.freeze(failures);
}

export function evaluateLabDynamicBusLiveShadowProof(value) {
    const proof = requirePlainRecord(value, 'lab dynamic bus live-shadow proof');
    requireExactDataKeys(proof, [
        'darkerStaticPixelCount',
        'maximumLumaDeltaByte',
        'method',
        'passed',
        'receiverMaskMethod',
        'staticGroundSample',
        'toleranceByte'
    ], 'lab dynamic bus live-shadow proof');
    if (proof.method
            !== 'bus_cast_shadow_on_minus_off_exact_temporary_static_horizontal_city_receiver_v1'
        || proof.receiverMaskMethod
            !== 'dynamic_bus_black_white_material_id_difference_v1'
        || !Number.isSafeInteger(proof.darkerStaticPixelCount)
        || proof.darkerStaticPixelCount < 1
        || !Number.isFinite(proof.maximumLumaDeltaByte)
        || proof.maximumLumaDeltaByte <= proof.toleranceByte
        || proof.toleranceByte !== LAB_VALIDATION_THRESHOLDS.falseLitToleranceByte
        || !proof.staticGroundSample
        || proof.staticGroundSample.worldNormal?.[1] < 0.7
        || proof.passed !== true) {
        return Object.freeze(['dynamic_bus_static_ground_shadow_proof']);
    }
    return Object.freeze([]);
}

export function createLabTileBoundaryEvidence(results) {
    if (!Array.isArray(results)) throw new TypeError('lab results must be an array');
    let aggregateSeamPixelCount = 0;
    let aggregateSeamErrorPixelCount = 0;
    let casesWithVisibleTileBoundary = 0;
    for (const result of results) {
        const metrics = requireLabMetricRecord(result?.metrics);
        aggregateSeamPixelCount += metrics.seamPixelCount;
        aggregateSeamErrorPixelCount += metrics.seamErrorPixelCount;
        if (metrics.seamPixelCount > 0) casesWithVisibleTileBoundary += 1;
    }
    return freezeDeep({
        method: 'aggregate_static_sun_depth_seam_debug_pixels_v1',
        aggregateSeamPixelCount,
        aggregateSeamErrorPixelCount,
        casesWithVisibleTileBoundary,
        passed: results.length > 0
            && aggregateSeamPixelCount > 0
            && casesWithVisibleTileBoundary > 0
    });
}

export function validateLabReleaseReport(value) {
    const report = requirePlainRecord(value, 'Lab release validation report');
    requireExactDataKeys(report, [
        'browserDiagnosticGate',
        'browserDiagnostics',
        'captureAuthentication',
        'caseCount',
        'cases',
        'comparisonCondition',
        'environment',
        'expectedCaseCount',
        'failures',
        'fallbackProofs',
        'fixtureAuthority',
        'generatedAt',
        'readiness',
        'receiverScope',
        'sameSessionPairing',
        'schema',
        'status',
        'thresholds',
        'tileBoundaryEvidence',
        'timingContamination'
    ], 'Lab release validation report');
    if (report.schema !== LAB_VALIDATION_REPORT_SCHEMA || report.status !== 'passed') {
        throw new Error('Lab validation report must use the v4 release schema and pass');
    }
    if (report.caseCount !== LAB_VALIDATION_CASE_COUNT
        || report.expectedCaseCount !== LAB_VALIDATION_CASE_COUNT
        || !Array.isArray(report.failures)
        || report.failures.length !== 0
        || !Array.isArray(report.browserDiagnostics)
        || report.browserDiagnostics.length !== 0
        || report.browserDiagnosticGate?.passed !== true
        || report.browserDiagnosticGate?.diagnosticCount !== 0) {
        throw new Error('Lab validation report must contain exactly eight clean passed cases');
    }
    if (report.sameSessionPairing
            !== 'current_and_cache_rgba_indexeddb_then_current_difference_same_lab_page_case_v3'
        || report.comparisonCondition
            !== 'current_difference_with_baked_resource_active_and_current_static_maps_retained_v1'
        || JSON.stringify(report.thresholds) !== JSON.stringify(LAB_VALIDATION_THRESHOLDS)
        || report.timingContamination?.contaminated !== true
        || report.timingContamination?.usableForPromotion !== false
        || typeof report.timingContamination?.reason !== 'string'
        || report.timingContamination.reason.trim()
            !== report.timingContamination.reason
        || report.timingContamination.reason.length < 8) {
        throw new Error('Lab validation release policy or timing evidence is invalid');
    }
    requireExactCanonicalValue(report.receiverScope, {
        compared: 'static_world_receivers_v1',
        excluded: 'exact_visible_dynamic_bus_receiver_pixels_only_v1',
        busCasterPolicy: 'live_shadow_submission_retained_and_static_ground_proven_v1'
    }, 'Lab receiver scope');
    requireExactCanonicalValue(report.fixtureAuthority, {
        schema: LAB_VALIDATION_FIXTURE_SCHEMA,
        artifactClass: 'test_fixture',
        productionEligible: false,
        provenance: 'webgl2_live_static_city_depth_test_fixture_v1',
        blenderCyclesProvenanceClaimed: false
    }, 'Lab fixture authority');
    if (report.readiness?.ready !== true
        || report.readiness?.cityId !== 'lab_scene'
        || report.readiness?.fixtureId !== 'illumination_overhang_receiver_v1'
        || report.readiness?.dynamicBusOutsideStaticCity !== true
        || report.readiness?.dynamicBusCastShadow !== true
        || report.readiness?.treesReady !== true
        || report.readiness?.treePlacementCount < 1
        || report.readiness?.treeChildCount !== report.readiness?.treePlacementCount) {
        throw new Error('Lab validation readiness gate did not pass');
    }
    const filter = requireLabEffectiveShadowFilterEvidence(
        report.environment?.liveDirectionalShadowFilter
    );
    if (filter.rendererMaxTextureSize !== report.environment?.rendererMaxTextureSize
        || JSON.stringify(report.environment?.rendererSize) !== '[1280,720]'
        || report.environment?.rendererPixelRatio !== 1) {
        throw new Error('Lab validation environment differs from its prepared filter');
    }
    requireCaptureAuthenticationSummary(
        report.captureAuthentication,
        LAB_VALIDATION_CASE_COUNT * 3,
        LAB_VALIDATION_CAPTURE_DIMENSIONS_PIXELS
    );
    validateLabFallbackProofs(report.fallbackProofs);
    if (!Array.isArray(report.cases)
        || report.cases.length !== LAB_VALIDATION_CASE_COUNT) {
        throw new Error('Lab validation report must contain exactly eight cases');
    }
    const caseIds = new Set();
    const capturePaths = new Set();
    for (const resultValue of report.cases) {
        const result = requirePlainRecord(resultValue, 'Lab release validation case');
        requireExactDataKeys(result, [
            'camera',
            'captures',
            'caseId',
            'coverageTags',
            'densityPhaseOracle',
            'diagnostics',
            'dynamicBus',
            'dynamicBusLiveShadowProof',
            'fixture',
            'lightingProfileId',
            'metrics',
            'passed',
            'sunProfile',
            'workload'
        ], 'Lab release validation case');
        const canonicalCase = ILLUMINATION_LAB_VALIDATION_CASES.find(
            (entry) => entry.id === result.caseId
        );
        if (!canonicalCase || caseIds.has(result.caseId)) {
            throw new Error('Lab validation cases differ from the exact unique catalog');
        }
        caseIds.add(result.caseId);
        requireExactCanonicalValue({
            camera: result.camera,
            coverageTags: result.coverageTags,
            lightingProfileId: result.lightingProfileId,
            sunProfile: result.sunProfile
        }, {
            camera: canonicalCase.camera,
            coverageTags: canonicalCase.coverageTags,
            lightingProfileId: canonicalCase.sunProfile.id,
            sunProfile: canonicalCase.sunProfile
        }, "Lab case '" + result.caseId + "' canonical projection");
        const captures = requirePlainRecord(
            result.captures,
            "Lab captures '" + result.caseId + "'"
        );
        requireExactDataKeys(
            captures,
            VALIDATION_CAPTURE_SLOTS,
            "Lab captures '" + result.caseId + "'"
        );
        for (const slot of VALIDATION_CAPTURE_SLOTS) {
            const record = requireCaptureRecord(
                captures[slot],
                result.caseId + '.' + slot
            );
            if (!record.path.endsWith('/' + result.caseId + '/' + slot + '.png')
                || capturePaths.has(record.path)) {
                throw new Error('Lab validation capture path is duplicated or misplaced');
            }
            capturePaths.add(record.path);
        }
        const metrics = requireLabMetricRecord(result.metrics);
        const caseFailures = [
            ...evaluateLabCaseMetrics(metrics),
            ...(metrics.width === LAB_VALIDATION_CAPTURE_DIMENSIONS_PIXELS[0]
                    && metrics.height === LAB_VALIDATION_CAPTURE_DIMENSIONS_PIXELS[1]
                ? []
                : ['capture_dimensions']),
            ...evaluateLabCasterTransition(
                result.diagnostics?.cache,
                result.diagnostics?.comparison
            ),
            ...evaluateLabShadowSubmission(
                result.workload?.current,
                result.workload?.cache,
                result.workload?.comparison
            )
        ];
        requireExactCanonicalValue(
            result.workload?.timingContamination,
            report.timingContamination,
            "Lab case '" + result.caseId + "' timing contamination"
        );
        requireExactCanonicalValue(result.dynamicBus, {
            cache: {castShadow: true, outsideStaticCity: true},
            comparison: {castShadow: true, outsideStaticCity: true}
        }, "Lab case '" + result.caseId + "' dynamic bus");
        if (result.caseId === 'illum.lab.bus_grounding_default') {
            caseFailures.push(
                ...evaluateLabDynamicBusLiveShadowProof(
                    result.dynamicBusLiveShadowProof
                )
            );
        } else if (result.dynamicBusLiveShadowProof !== null) {
            caseFailures.push('unexpected_dynamic_bus_live_shadow_proof');
        }
        validateLabReleaseFixture(
            result.fixture,
            filter.effectiveMapSizeTexels,
            result.caseId
        );
        requireLabDensityPhaseOracle(
            result.densityPhaseOracle,
            "Lab case '" + result.caseId + "' current density phase"
        );
        if (result.passed !== true || caseFailures.length > 0) {
            throw new Error(
                "Lab validation case '" + result.caseId + "' failed independent gates: "
                + (caseFailures.join(', ') || 'reported_failed')
            );
        }
    }
    if (caseIds.size !== expectedCaseIds.length
        || expectedCaseIds.some((caseId) => !caseIds.has(caseId))
        || capturePaths.size !== LAB_VALIDATION_CASE_COUNT * 3) {
        throw new Error('Lab validation case or capture inventory is incomplete');
    }
    const tileBoundaryEvidence = createLabTileBoundaryEvidence(report.cases);
    if (JSON.stringify(tileBoundaryEvidence)
        !== JSON.stringify(report.tileBoundaryEvidence)) {
        throw new Error('Lab tile-boundary aggregate differs from case metrics');
    }
    return freezeDeep({
        browserDiagnosticGate: report.browserDiagnosticGate,
        captureAuthentication: report.captureAuthentication,
        caseCount: LAB_VALIDATION_CASE_COUNT,
        comparisonCondition: report.comparisonCondition,
        profileIds: expectedProfileIds,
        tileBoundaryEvidence,
        timingContamination: report.timingContamination,
        zeroMissingOccluderPixelCount: true
    });
}

function validateLabFallbackProofs(value) {
    if (!Array.isArray(value) || value.length !== expectedProfileIds.length) {
        throw new Error('Lab fallback proofs must cover exactly three profiles');
    }
    const seen = new Set();
    for (const proof of value) {
        if (!expectedProfileIds.includes(proof?.lightingProfileId)
            || seen.has(proof?.lightingProfileId)
            || proof?.passed !== true
            || proof?.corruptPackageRejected !== true
            || proof?.activeCacheAfterFailure !== false
            || !Number.isSafeInteger(proof?.restoredCasterCount)
            || proof.restoredCasterCount < 1
            || proof.restoredCasterCount !== proof.expectedRestoredCasterCount
            || proof.dynamicBusOutsideStaticCity !== true
            || proof.dynamicBusCastShadow !== true
            || proof.diagnostics?.active
            || proof.diagnostics?.runtime?.controller?.effectiveMode === 'baked') {
            throw new Error('Lab fallback proof did not restore current rendering');
        }
        seen.add(proof.lightingProfileId);
    }
}

export function requireLabDensityPhaseOracle(
    value,
    label = 'Lab current density phase oracle'
) {
    const oracle = requirePlainRecord(value, label);
    requireExactDataKeys(oracle, [
        'maximumProjectionMatrixError',
        'maximumWorldMatrixError',
        'method',
        'passed'
    ], label);
    if (oracle.method !== 'prepared-shadow-camera-equals-first-current-render-v1'
        || oracle.passed !== true
        || !Number.isFinite(oracle.maximumWorldMatrixError)
        || oracle.maximumWorldMatrixError < 0
        || oracle.maximumWorldMatrixError > 1e-8
        || !Number.isFinite(oracle.maximumProjectionMatrixError)
        || oracle.maximumProjectionMatrixError < 0
        || oracle.maximumProjectionMatrixError > 1e-12) {
        throw new Error(label + ' does not prove the prepared camera survived current rendering');
    }
    return oracle;
}

function validateLabReleaseFixture(value, effectiveMapSizeTexels, validationCaseId) {
    const fixture = requirePlainRecord(value, 'Lab release fixture');
    if (fixture.schema !== LAB_VALIDATION_FIXTURE_SCHEMA
        || fixture.artifactClass !== 'test_fixture'
        || fixture.productionEligible !== false
        || fixture.provenance !== 'webgl2_live_static_city_depth_test_fixture_v1'
        || fixture.blenderCyclesProvenanceClaimed !== false
        || !Number.isSafeInteger(fixture.casterCount)
        || fixture.casterCount < 1
        || !Number.isSafeInteger(fixture.intendedCasterSnapshotCount)
        || fixture.intendedCasterSnapshotCount < fixture.casterCount
        || !Number.isSafeInteger(fixture.staticReceiverMeshCount)
        || fixture.staticReceiverMeshCount < 1
        || !Number.isSafeInteger(fixture.staticReceiverMaterialSlotCount)
        || fixture.staticReceiverMaterialSlotCount < 1
        || !Number.isSafeInteger(fixture.tileCount)
        || fixture.tileCount < 1
        || !Number.isSafeInteger(fixture.payloadBytes)
        || fixture.payloadBytes < 1
        || fixture.biasModel !== LAB_VALIDATION_SAMPLING_BIAS.model
        || fixture.constantDepthReliefMeters
            !== LAB_VALIDATION_SAMPLING_BIAS.constantDepthReliefMeters
        || fixture.geometricNormalOffsetMeters
            !== LAB_VALIDATION_SAMPLING_BIAS.geometricNormalOffsetMeters
        || fixture.pcf?.model !== LAB_VALIDATION_PCF.model
        || fixture.pcf?.radiusTexels !== LAB_VALIDATION_PCF.radiusTexels
        || fixture.pcf?.sampleCount !== LAB_VALIDATION_PCF.sampleCount
        || fixture.pcf?.screenRotation !== LAB_VALIDATION_PCF.screenRotation
        || fixture.pcf?.hardwareComparison !== LAB_VALIDATION_PCF.hardwareComparison
        || JSON.stringify(fixture.pcf?.shadowMapSizeTexels)
            !== JSON.stringify(effectiveMapSizeTexels)
        || JSON.stringify(fixture.pcf?.shadowMapWorldExtentMeters)
            !== JSON.stringify(LAB_VALIDATION_PCF.shadowMapWorldExtentMeters)) {
        throw new Error('Lab fixture is not release authoritative');
    }
    validateLabExactDensityFixture(
        fixture,
        effectiveMapSizeTexels,
        validationCaseId
    );
}

function validateLabExactDensityFixture(
    fixture,
    effectiveMapSizeTexels,
    validationCaseId
) {
    const diagnostic = requirePlainRecord(
        fixture.densityDiagnostic,
        'Lab exact-density diagnostic'
    );
    const exactPitch = LAB_DENSITY_PRODUCTION_PROJECTION.texelSizeMeters;
    const sourcePitch = requireFinitePair(
        diagnostic.sourceTexelPitchMeters,
        'Lab exact-density source texel pitch'
    );
    if (diagnostic.schema !== 'ai531-phase-locked-density-diagnostic-v1'
        || diagnostic.validationCaseId !== validationCaseId
        || diagnostic.requestedCandidateId
            !== LAB_DENSITY_PRODUCTION_PROJECTION.selectedCandidateId
        || diagnostic.requestedTexelSizeMeters !== exactPitch
        || fixture.texelSizeMeters !== exactPitch
        || sourcePitch[0] !== exactPitch
        || sourcePitch[1] !== exactPitch
        || JSON.stringify(effectiveMapSizeTexels) !== '[16384,16384]'
        || diagnostic.phaseAnchorDerivation
            !== 'even-map-adjacent-positive-source-axis-texel-center-projected-to-cache-light-v1'
        || diagnostic.exactThreeToTwoLatticePhaseEvidence !== null) {
        throw new Error('Lab fixture does not prove the selected exact-1:1 density candidate');
    }

    requireFiniteArrayLength(
        diagnostic.sourceShadowCameraMatrixWorld,
        16,
        'Lab exact-density source camera world matrix'
    );
    requireFiniteArrayLength(
        diagnostic.sourceShadowCameraProjectionMatrix,
        16,
        'Lab exact-density source camera projection matrix'
    );
    const sourceCenter = requireFinitePair(
        diagnostic.sourceCameraCenterLightMeters,
        'Lab exact-density source camera center'
    );
    const sourceOffset = requireFinitePair(
        diagnostic.sourceTexelCenterOffsetLightMeters,
        'Lab exact-density source texel-center offset'
    );
    const phaseAnchor = requireFinitePair(
        diagnostic.texelCenterPhaseAnchorLightMeters,
        'Lab exact-density phase anchor'
    );
    const transform = requireFiniteTwoByTwoMatrix(
        diagnostic.sourceToCacheLightAxisTransform,
        'Lab exact-density source-to-cache axes'
    );
    const expectedTransform = [[-1, 0], [0, 1]];
    for (let row = 0; row < 2; row += 1) {
        for (let column = 0; column < 2; column += 1) {
            if (Math.abs(transform[row][column] - expectedTransform[row][column])
                > LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS) {
                throw new Error('Lab exact-density source axes are not the canonical signed permutation');
            }
        }
        const expectedOffset = 0.5 * sourcePitch[0] * transform[row][0]
            + 0.5 * sourcePitch[1] * transform[row][1];
        if (phaseErrorTexels(sourceOffset[row], expectedOffset, exactPitch)
                > LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS
            || phaseErrorTexels(
                phaseAnchor[row],
                sourceCenter[row] + sourceOffset[row],
                exactPitch
            ) > LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS) {
            throw new Error('Lab exact-density texel-center anchor is stale');
        }
    }

    const filter = requirePlainRecord(
        diagnostic.filterRadiusIdentity,
        'Lab exact-density filter identity'
    );
    if (filter.model !== 'three-r183-live-vogel-radius-to-cache-physical-support-v1'
        || filter.oracleRadiusTexels !== LAB_VALIDATION_PCF.radiusTexels
        || filter.oracleRadiusSpace
            !== 'live-directional-shadow-map-source-texels-v1'
        || JSON.stringify(filter.sourceWorldExtentMeters) !== '[680,680]'
        || JSON.stringify(filter.sourceMapSizeTexels) !== '[16384,16384]'
        || JSON.stringify(filter.sourceTexelPitchMeters)
            !== JSON.stringify(sourcePitch)
        || filter.sourceVogelRadiusMeters !== 0.062255859375
        || filter.cacheTexelSizeMeters !== exactPitch
        || filter.derivedCacheRadiusTexels !== LAB_VALIDATION_PCF.radiusTexels
        || filter.derivation
            !== 'oracle-radius-times-live-source-pitch-divided-by-cache-pitch-v1') {
        throw new Error('Lab exact-density filter-radius identity is stale');
    }

    validateLabExactLatticePhase(
        diagnostic.exactRationalLatticePhaseEvidence,
        fixture.staticReceiverDomainLightMeters,
        exactPitch
    );
    validateLabDerivedDensityGrid(
        fixture,
        diagnostic,
        effectiveMapSizeTexels,
        exactPitch,
        phaseAnchor
    );
    validateLabFinalProductionProjection(diagnostic.finalProductionProjection);

    requireExactCanonicalValue(diagnostic.candidatePromotion, {
        strictParityStatus: 'passed',
        promotionClass: 'production-selected-strict-parity-passed-v1',
        promotionBudgetEligible: true
    }, 'Lab exact-density candidate promotion');
}

function validateLabExactLatticePhase(value, receiverDomainValue, exactPitch) {
    const phase = requirePlainRecord(value, 'Lab exact-1:1 lattice phase evidence');
    const receiverDomain = requireFiniteBounds(
        receiverDomainValue,
        3,
        'Lab static-receiver light domain'
    );
    if (phase.method !== 'full-static-receiver-domain-live-lattice-rational-proof-v2'
        || JSON.stringify(phase.ratio) !== '{"sourceTexels":1,"cacheTexels":1}'
        || phase.cacheTexelSizeMeters !== exactPitch
        || JSON.stringify(phase.sourceTexelPitchMeters)
            !== JSON.stringify([exactPitch, exactPitch])
        || JSON.stringify(phase.sourceAxisSigns) !== '[-1,1]'
        || JSON.stringify(phase.signedSourceTexelStepsPerCacheTexel) !== '[-1,1]'
        || phase.repeatingCacheTexelPeriod !== 1
        || phase.repeatingSourceTexelPeriod !== 1
        || phase.passed !== true
        || !isFiniteToleranceValue(
            phase.maximumSourceAxisSignError,
            LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS
        )
        || !isFiniteToleranceValue(
            phase.maximumRatioError,
            LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS
        )
        || !isFiniteToleranceValue(
            phase.maximumNumericPhaseError,
            LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS
        )) {
        throw new Error('Lab exact-1:1 lattice phase evidence is invalid');
    }
    requireExactCanonicalValue(phase.phaseClasses, [
        [{
            axis: 0,
            cacheIndexModulo: 0,
            sourceTexelPhaseNumerator: 0,
            sourceTexelPhaseDenominator: 1
        }],
        [{
            axis: 1,
            cacheIndexModulo: 0,
            sourceTexelPhaseNumerator: 0,
            sourceTexelPhaseDenominator: 1
        }]
    ], 'Lab exact-1:1 phase classes');
    if (!Array.isArray(phase.axes) || phase.axes.length !== 2) {
        throw new Error('Lab exact-1:1 phase axes are incomplete');
    }
    for (let axis = 0; axis < 2; axis += 1) {
        const proof = requirePlainRecord(
            phase.axes[axis],
            'Lab exact-1:1 phase axis ' + axis
        );
        const axisDomain = requireFiniteScalarBounds(
            proof.receiverDomainMeters,
            'Lab exact-1:1 receiver domain axis ' + axis
        );
        const covering = requireFiniteScalarBounds(
            proof.coveringCacheCellBoundsMeters,
            'Lab exact-1:1 covering cache bounds axis ' + axis
        );
        if (proof.axis !== axis
            || proof.sourceAxisSign !== (axis === 0 ? -1 : 1)
            || phaseErrorTexels(
                axisDomain.min,
                receiverDomain.min[axis],
                exactPitch
            ) > LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS
            || phaseErrorTexels(
                axisDomain.max,
                receiverDomain.max[axis],
                exactPitch
            ) > LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS
            || covering.min > axisDomain.min + exactPitch * 1e-9
            || covering.max < axisDomain.max - exactPitch * 1e-9
            || !isFiniteToleranceValue(
                proof.maximumScaledSourceStepIndexError,
                LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS
            )
            || !isFiniteToleranceValue(
                proof.cachePeriodToSourcePeriodError,
                LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS
            )) {
            throw new Error('Lab exact-1:1 phase axis proof is stale');
        }
    }
}

function validateLabDerivedDensityGrid(
    fixture,
    diagnostic,
    effectiveMapSizeTexels,
    exactPitch,
    phaseAnchor
) {
    const limits = requirePlainRecord(diagnostic.limits, 'Lab exact-density limits');
    const guard = requirePlainRecord(diagnostic.guard, 'Lab exact-density guard');
    if (limits.maximumChunkBytes !== ILLUMINATION_MAX_CHUNK_BYTES
        || limits.maximumPackageBytes !== ILLUMINATION_MAX_PACKAGE_BYTES
        || limits.rendererMaxTextureSize !== effectiveMapSizeTexels[0]
        || guard.diagnosticGuardTexels !== 1
        || guard.productionGuardTexels
            !== LAB_DENSITY_PRODUCTION_PROJECTION.guardTexels
        || guard.diagnosticRationale
            !== 'exact-global-cross-layer-filter-fetch-does-not-consume-guard-v1'
        || diagnostic.cropTileGridPolicy !== LAB_EXACT_DENSITY_CROP_GRID_POLICY) {
        throw new Error('Lab exact-density grid limits or guard policy is invalid');
    }
    const requiredBounds = requireFiniteBounds(
        diagnostic.requiredBoundsLightMeters,
        2,
        'Lab exact-density required bounds'
    );
    const cropBounds = requireFiniteBounds(
        diagnostic.cropBoundsLightMeters,
        2,
        'Lab exact-density crop bounds'
    );
    const expectedCropMinimum = requiredBounds.min.map((minimum, axis) => {
        const centerIndex = Math.floor(
            (minimum - phaseAnchor[axis]) / exactPitch + 0.5
        );
        return phaseAnchor[axis] + (centerIndex - 0.5) * exactPitch;
    });
    const requiredTexels = requiredBounds.max.map((maximum, axis) => (
        Math.ceil((maximum - expectedCropMinimum[axis]) / exactPitch)
    ));
    if (requiredTexels.some((entry) => !Number.isSafeInteger(entry) || entry < 1)
        || expectedCropMinimum.some((minimum, axis) => (
            phaseErrorTexels(minimum, cropBounds.min[axis], exactPitch)
                > LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS
        ))) {
        throw new Error('Lab exact-density crop minimum is not phase locked');
    }

    const bounded = LAB_EXACT_DENSITY_GRID_CANDIDATES.map(
        ([tileCountX, tileCountY]) => {
            const interiorSize = Math.max(
                Math.ceil(requiredTexels[0] / tileCountX),
                Math.ceil(requiredTexels[1] / tileCountY)
            );
            const storedSize = interiorSize + guard.diagnosticGuardTexels * 2;
            const layerCount = tileCountX * tileCountY;
            const layerByteLength = storedSize * storedSize * 2;
            const payloadBytes = layerByteLength * layerCount;
            return {
                tileCountX,
                tileCountY,
                interiorSize,
                storedSize,
                layerCount,
                layerByteLength,
                payloadBytes,
                combinedWidth: interiorSize * tileCountX,
                combinedHeight: interiorSize * tileCountY
            };
        }
    ).filter((entry) => (
        entry.storedSize <= limits.rendererMaxTextureSize
        && entry.combinedWidth <= limits.rendererMaxTextureSize
        && entry.combinedHeight <= limits.rendererMaxTextureSize
        && entry.layerByteLength <= limits.maximumChunkBytes
        && entry.payloadBytes <= limits.maximumPackageBytes
    ));
    const selected = bounded.find(
        (entry) => entry.payloadBytes <= limits.maximumChunkBytes
    ) ?? [...bounded].sort((left, right) => (
        left.payloadBytes - right.payloadBytes
        || left.tileCountY - right.tileCountY
        || left.tileCountX - right.tileCountX
    ))[0] ?? null;
    if (!selected) {
        throw new Error('Lab exact-density crop has no bounded canonical grid');
    }

    const tileCount = requireExactPositiveIntegerPair(
        diagnostic.cropTileCount,
        'Lab exact-density crop tile count'
    );
    const combined = requireExactPositiveIntegerPair(
        diagnostic.cropCombinedTexels,
        'Lab exact-density crop combined texels'
    );
    const stored = requireExactPositiveIntegerPair(
        diagnostic.cropStoredTexelsPerLayer,
        'Lab exact-density crop stored texels'
    );
    const expectedWindows = partitionStaticSunDepthLayers(
        selected.layerByteLength,
        selected.layerCount
    );
    const expectedChunkIds = selected.payloadBytes <= ILLUMINATION_MAX_CHUNK_BYTES
        ? [STATIC_SUN_DEPTH_CANONICAL_CHUNK_ID]
        : expectedWindows.map((_, index) => staticSunDepthLayerWindowChunkId(index));
    if (JSON.stringify(tileCount)
            !== JSON.stringify([selected.tileCountX, selected.tileCountY])
        || JSON.stringify(combined)
            !== JSON.stringify([selected.combinedWidth, selected.combinedHeight])
        || JSON.stringify(stored)
            !== JSON.stringify([selected.storedSize, selected.storedSize])
        || diagnostic.cropLayerByteLength !== selected.layerByteLength
        || diagnostic.cropPayloadBytes !== selected.payloadBytes
        || fixture.tileCount !== selected.layerCount
        || JSON.stringify(fixture.storedTexels)
            !== JSON.stringify([selected.storedSize, selected.storedSize])
        || fixture.payloadBytes !== selected.payloadBytes
        || diagnostic.cropChunkCount !== expectedWindows.length
        || JSON.stringify(diagnostic.cropChunkWindows)
            !== JSON.stringify(expectedWindows)
        || fixture.packageChunkCount !== expectedChunkIds.length
        || JSON.stringify(fixture.packageChunkIds)
            !== JSON.stringify(expectedChunkIds)) {
        throw new Error('Lab exact-density fixture differs from its derived grid or chunks');
    }
    for (let axis = 0; axis < 2; axis += 1) {
        const expectedMaximum = cropBounds.min[axis]
            + combined[axis] * exactPitch;
        const firstCenterPhase = (
            cropBounds.min[axis] + exactPitch * 0.5 - phaseAnchor[axis]
        ) / exactPitch;
        const lastCenterPhase = (
            cropBounds.max[axis] - exactPitch * 0.5 - phaseAnchor[axis]
        ) / exactPitch;
        if (phaseErrorTexels(
                cropBounds.max[axis],
                expectedMaximum,
                exactPitch
            ) > LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS
            || Math.abs(firstCenterPhase - Math.round(firstCenterPhase))
                > LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS
            || Math.abs(lastCenterPhase - Math.round(lastCenterPhase))
                > LAB_EXACT_DENSITY_PHASE_TOLERANCE_TEXELS
            || cropBounds.min[axis] > requiredBounds.min[axis] + exactPitch * 1e-9
            || cropBounds.max[axis] < requiredBounds.max[axis] - exactPitch * 1e-9) {
            throw new Error('Lab exact-density crop edge phase or coverage is invalid');
        }
    }
    requireExactCanonicalValue(
        fixture.layoutBoundsLightMeters,
        diagnostic.cropBoundsLightMeters,
        'Lab exact-density fixture layout bounds'
    );
}

function validateLabFinalProductionProjection(value) {
    const projection = requirePlainRecord(
        value,
        'Lab exact-density final production projection'
    );
    for (const [key, expected] of Object.entries(LAB_DENSITY_PRODUCTION_PROJECTION)) {
        requireExactCanonicalValue(
            projection[key],
            expected,
            'Lab final production projection.' + key
        );
    }
    const layerByteLength =
        LAB_DENSITY_PRODUCTION_PROJECTION.storedTexelsPerLayer[0]
        * LAB_DENSITY_PRODUCTION_PROJECTION.storedTexelsPerLayer[1] * 2;
    const windows = partitionStaticSunDepthLayers(
        layerByteLength,
        LAB_DENSITY_PRODUCTION_PROJECTION.layerCount
    );
    if (projection.layerByteLength !== layerByteLength
        || projection.payloadBytes
            !== LAB_DENSITY_PRODUCTION_PROJECTION.payloadBytes
        || projection.canonical64MiBLayerWindowCount !== windows.length
        || JSON.stringify(projection.chunkWindows) !== JSON.stringify(windows)
        || projection.exceedsSingleChunk
            !== (projection.payloadBytes > ILLUMINATION_MAX_CHUNK_BYTES)
        || projection.within256MiB
            !== (projection.payloadBytes <= 256 * 1024 * 1024)
        || projection.within512MiB !== true) {
        throw new Error('Lab final production projection is inconsistent');
    }
}

function requireFinitePair(value, label) {
    return requireFiniteArrayLength(value, 2, label);
}

function requireFiniteArrayLength(value, length, label) {
    if (!Array.isArray(value) || value.length !== length
        || value.some((entry) => !Number.isFinite(entry))) {
        throw new TypeError(label + ' must contain exactly ' + length + ' finite numbers');
    }
    return value;
}

function requireFiniteTwoByTwoMatrix(value, label) {
    if (!Array.isArray(value) || value.length !== 2) {
        throw new TypeError(label + ' must be a finite 2x2 matrix');
    }
    return value.map((row, index) => requireFiniteArrayLength(
        row,
        2,
        label + '[' + index + ']'
    ));
}

function requireFiniteBounds(value, dimensions, label) {
    const bounds = requirePlainRecord(value, label);
    const minimum = requireFiniteArrayLength(bounds.min, dimensions, label + '.min');
    const maximum = requireFiniteArrayLength(bounds.max, dimensions, label + '.max');
    if (minimum.some((entry, index) => entry > maximum[index])) {
        throw new RangeError(label + ' has inverted bounds');
    }
    return {min: minimum, max: maximum};
}

function requireFiniteScalarBounds(value, label) {
    const bounds = requirePlainRecord(value, label);
    if (!Number.isFinite(bounds.min)
        || !Number.isFinite(bounds.max)
        || bounds.min > bounds.max) {
        throw new TypeError(label + ' must contain finite ordered scalar bounds');
    }
    return bounds;
}

function phaseErrorTexels(actual, expected, pitch) {
    return Math.abs(actual - expected) / pitch;
}

function isFiniteToleranceValue(value, maximum) {
    return Number.isFinite(value) && value >= 0 && value <= maximum;
}

function requireExactCanonicalValue(actual, expected, label) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(label + ' differs from the canonical contract');
    }
}

export async function runLabStaticSunDepthValidation(options = {}, deps = {}) {
    const plan = createLabValidationPlan();
    const outputRoot = requireScreenshotOutputRoot(options.outputRoot ?? defaultOutputRoot);
    const warmupFrames = requireInteger(options.warmupFrames ?? 2, 0, 30, 'warmupFrames');
    const timingContamination = freezeDeep({
        contaminated: true,
        reason: normalizeReason(options.timingContaminationReason ?? LAB_VALIDATION_TIMING_REASON),
        usableForPromotion: false
    });
    await mkdir(outputRoot, {recursive: true});
    let server = null;
    let browser = null;
    let page = null;
    const results = [];
    const failures = [];
    const fallbackProofs = [];
    const browserDiagnostics = [];
    let reportWritten = false;
    let liveDirectionalShadowFilter = null;
    try {
        const preferredPort = requireInteger(options.preferredPort ?? 4174, 1024, 65535, 'preferredPort');
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
        const chromiumApi = deps.chromiumApi ?? chromium;
        const chromePath = options.chromePath
            ?? process.env.PLAYWRIGHT_EXECUTABLE_PATH
            ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
        browser = await chromiumApi.launch({
            headless: true,
            ...(chromePath && existsSync(chromePath) ? {executablePath: chromePath} : {}),
            args: [
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--enable-precise-memory-info'
            ]
        });
        page = await browser.newPage({viewport: {width: 1280, height: 744}});
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
        const labUrl = `${baseUrl}/debug_tools/lab_scene.html?coreTests=0`;
        await page.goto(labUrl);
        await page.waitForFunction(() => !!window.__labSceneValidation?.readiness);
        const readiness = await page.evaluate(() => window.__labSceneValidation.readiness);
        if (readiness?.ready !== true
            || readiness.cityId !== 'lab_scene'
            || readiness.fixtureId !== 'illumination_overhang_receiver_v1'
            || readiness.dynamicBusOutsideStaticCity !== true) {
            throw new Error(`Lab Scene readiness contract failed: ${JSON.stringify(readiness)}`);
        }
        await assertLabEvidenceCanvasLifecycle(page, false);
        const environment = await page.evaluate(
            async (settings) => {
                const runtime = await import('/tools/static_sun_depth/browser/LabValidationRuntime.js');
                return runtime.installLabValidationRuntime(settings);
            },
            {
                capabilityProfileId: LAB_VALIDATION_CAPABILITY_PROFILE_ID,
                fixtureSchema: LAB_VALIDATION_FIXTURE_SCHEMA,
                samplingPcf: LAB_VALIDATION_PCF,
                samplingBias: LAB_VALIDATION_SAMPLING_BIAS,
                thresholds: LAB_VALIDATION_THRESHOLDS
            }
        );
        await assertLabEvidenceCanvasLifecycle(page, true);
        for (const group of plan.groups) {
            for (const validationCase of group.cases) {
                const prepared = await page.evaluate(
                    ({profile, validationCase: caseValue, texelSizeMeters}) => (
                        window.__ai531LabValidation.prepareProfile(
                            profile,
                            {validationCase: caseValue, texelSizeMeters}
                        )
                    ),
                    {
                        profile: group.sunProfile,
                        validationCase,
                        texelSizeMeters:
                            LAB_DENSITY_PRODUCTION_PROJECTION.texelSizeMeters
                    }
                );
                const preparedFilter = requireLabEffectiveShadowFilterEvidence(
                    prepared.fixture?.liveDirectionalShadowFilter
                );
                if (liveDirectionalShadowFilter === null) {
                    liveDirectionalShadowFilter = freezeDeep({...preparedFilter});
                } else if (JSON.stringify(preparedFilter)
                    !== JSON.stringify(liveDirectionalShadowFilter)) {
                    throw new Error(
                        'Lab effective live shadow filter changed between cases'
                    );
                }
                if (prepared.fixture?.productionEligible !== false
                    || prepared.fixture?.provenance
                        !== 'webgl2_live_static_city_depth_test_fixture_v1'
                    || JSON.stringify(prepared.fixture?.pcf?.shadowMapSizeTexels)
                        !== JSON.stringify(preparedFilter.effectiveMapSizeTexels)) {
                    throw new Error(
                        "Lab fixture provenance is invalid for '"
                        + validationCase.id + "'"
                    );
                }
                validateLabReleaseFixture(
                    prepared.fixture,
                    preparedFilter.effectiveMapSizeTexels,
                    validationCase.id
                );
                const caseDirectory = path.join(outputRoot, validationCase.id);
                const currentCapturePath = path.join(caseDirectory, 'current.png');
                const cacheCapturePath = path.join(caseDirectory, 'cache.png');
                const comparisonCapturePath = path.join(caseDirectory, 'comparison.png');
                await mkdir(caseDirectory, {recursive: true});
                const current = await page.evaluate(
                    ({caseValue, warmups}) => (
                        window.__ai531LabValidation.captureCurrent(caseValue, warmups)
                    ),
                    {caseValue: validationCase, warmups: warmupFrames}
                );
                const densityPhaseOracle = requireLabDensityPhaseOracle(
                    current.densityPhaseOracle,
                    "Lab case '" + validationCase.id + "' current density phase"
                );
                await captureLabEvidencePng(
                    page,
                    currentCapturePath,
                    current.evidence,
                    'current'
                );
                const activation = await page.evaluate(
                    () => window.__ai531LabValidation.activatePreparedProfile()
                );
                if (!isCacheActive(activation)) {
                    throw new Error(
                        "Lab static-sun fixture fell back for '"
                        + validationCase.id + "': " + JSON.stringify(activation)
                    );
                }
                const cache = await page.evaluate(
                    ({caseValue, warmups}) => (
                        window.__ai531LabValidation.captureCache(caseValue, warmups)
                    ),
                    {caseValue: validationCase, warmups: warmupFrames}
                );
                await captureLabEvidencePng(
                    page,
                    cacheCapturePath,
                    cache.evidence,
                    'cache'
                );
                const comparison = await page.evaluate(
                    ({caseValue, warmups}) => (
                        window.__ai531LabValidation.captureComparisonAndCompare(
                            caseValue,
                            warmups
                        )
                    ),
                    {caseValue: validationCase, warmups: warmupFrames}
                );
                await captureLabEvidencePng(
                    page,
                    comparisonCapturePath,
                    comparison.evidence,
                    'comparison'
                );
                const caseFailures = [
                    ...(!isCacheActive(cache.diagnostics)
                        || !isCacheActive(comparison.diagnostics) ? ['fallback'] : []),
                    ...(cache.dynamicBusOutsideStaticCity !== true
                        || cache.dynamicBusCastShadow !== true
                        || comparison.dynamicBusOutsideStaticCity !== true
                        || comparison.dynamicBusCastShadow !== true
                        ? ['dynamic_bus_ownership'] : []),
                    ...evaluateLabCasterTransition(
                        cache.diagnostics,
                        comparison.diagnostics
                    ),
                    ...evaluateLabShadowSubmission(
                        current.workload,
                        cache.workload,
                        comparison.workload
                    ),
                    ...(validationCase.id === 'illum.lab.bus_grounding_default'
                        ? evaluateLabDynamicBusLiveShadowProof(
                            current.dynamicBusLiveShadowProof
                        ) : []),
                    ...evaluateLabCaseMetrics(comparison.metrics)
                ];
                if (caseFailures.length > 0) {
                    failures.push(freezeDeep({caseId: validationCase.id, failures: caseFailures}));
                }
                results.push(freezeDeep({
                    caseId: validationCase.id,
                    lightingProfileId: group.lightingProfileId,
                    camera: validationCase.camera,
                    coverageTags: validationCase.coverageTags,
                    sunProfile: validationCase.sunProfile,
                    fixture: prepared.fixture,
                    densityPhaseOracle,
                    metrics: comparison.metrics,
                    workload: {
                        current: current.workload,
                        cache: cache.workload,
                        comparison: comparison.workload,
                        timingContamination
                    },
                    diagnostics: {
                        current: current.diagnostics,
                        cache: cache.diagnostics,
                        comparison: comparison.diagnostics
                    },
                    dynamicBusLiveShadowProof: current.dynamicBusLiveShadowProof,
                    dynamicBus: {
                        cache: {
                            castShadow: cache.dynamicBusCastShadow,
                            outsideStaticCity: cache.dynamicBusOutsideStaticCity
                        },
                        comparison: {
                            castShadow: comparison.dynamicBusCastShadow,
                            outsideStaticCity: comparison.dynamicBusOutsideStaticCity
                        }
                    },
                    captures: {
                        current: await createValidationCaptureRecord(
                            currentCapturePath,
                            {
                                authorityRoot: allowedScreenshotRoot,
                                expectedDimensionsPixels:
                                    LAB_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
                                repoRoot
                            }
                        ),
                        cache: await createValidationCaptureRecord(
                            cacheCapturePath,
                            {
                                authorityRoot: allowedScreenshotRoot,
                                expectedDimensionsPixels:
                                    LAB_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
                                repoRoot
                            }
                        ),
                        comparison: await createValidationCaptureRecord(
                            comparisonCapturePath,
                            {
                                authorityRoot: allowedScreenshotRoot,
                                expectedDimensionsPixels:
                                    LAB_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
                                repoRoot
                            }
                        )
                    },
                    passed: caseFailures.length === 0
                }));
            }
            const fallbackProof = await page.evaluate(
                () => window.__ai531LabValidation.proveCurrentFallback()
            );
            fallbackProofs.push(freezeDeep({
                lightingProfileId: group.lightingProfileId,
                ...fallbackProof
            }));
            if (fallbackProof.passed !== true) {
                failures.push(freezeDeep({
                    caseId: 'fallback.' + group.lightingProfileId,
                    failures: ['current_fallback_proof']
                }));
            }
        }
        await page.evaluate(() => window.__ai531LabValidation.dispose());
        await assertLabEvidenceCanvasLifecycle(page, false);
        const tileBoundaryEvidence = createLabTileBoundaryEvidence(results);
        if (!tileBoundaryEvidence.passed) {
            failures.push(freezeDeep({
                caseId: 'aggregate.tile_boundary_evidence',
                failures: ['tile_boundary_evidence_missing']
            }));
        }
        const browserDiagnosticGate = freezeDeep({
            passed: browserDiagnostics.length === 0,
            diagnosticCount: browserDiagnostics.length
        });
        if (!browserDiagnosticGate.passed) {
            failures.push(freezeDeep({
                caseId: 'aggregate.browser_diagnostics',
                failures: ['browser_diagnostics']
            }));
        }
        const captureAuthentication = await authenticateValidationCaptureSet({
            authorityRoot: allowedScreenshotRoot,
            cases: results,
            expectedCaseIds,
            expectedCaptureCount: LAB_VALIDATION_CASE_COUNT * 3,
            expectedDimensionsPixels: LAB_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
            lstatFn: lstat,
            readFileFn: readFile,
            repoRoot
        });
        const report = {
            schema: LAB_VALIDATION_REPORT_SCHEMA,
            generatedAt: new Date().toISOString(),
            status: failures.length === 0 ? 'passed' : 'failed',
            caseCount: results.length,
            expectedCaseCount: LAB_VALIDATION_CASE_COUNT,
            sameSessionPairing:
                'current_and_cache_rgba_indexeddb_then_current_difference_same_lab_page_case_v3',
            comparisonCondition:
                'current_difference_with_baked_resource_active_and_current_static_maps_retained_v1',
            receiverScope: {
                compared: 'static_world_receivers_v1',
                excluded: 'exact_visible_dynamic_bus_receiver_pixels_only_v1',
                busCasterPolicy: 'live_shadow_submission_retained_and_static_ground_proven_v1'
            },
            thresholds: LAB_VALIDATION_THRESHOLDS,
            timingContamination,
            fixtureAuthority: {
                schema: LAB_VALIDATION_FIXTURE_SCHEMA,
                artifactClass: 'test_fixture',
                productionEligible: false,
                provenance: 'webgl2_live_static_city_depth_test_fixture_v1',
                blenderCyclesProvenanceClaimed: false
            },
            environment: {
                ...environment,
                browserVersion: await browser.version(),
                labUrl,
                liveDirectionalShadowFilter
            },
            readiness,
            fallbackProofs,
            tileBoundaryEvidence,
            browserDiagnosticGate,
            browserDiagnostics,
            captureAuthentication,
            failures,
            cases: results
        };
        const reportPath = path.join(outputRoot, 'lab_validation_report.json');
        await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        reportWritten = true;
        if (results.length !== LAB_VALIDATION_CASE_COUNT) {
            throw new Error(`lab validation completed ${results.length} of ${LAB_VALIDATION_CASE_COUNT} cases`);
        }
        if (failures.length > 0) {
            throw new Error(
                `lab validation failed ${failures.length} gates; report=${artifactPath(reportPath)}`
            );
        }
        return freezeDeep({reportPath, report});
    } catch (error) {
        if (!reportWritten) {
            const reportPath = path.join(outputRoot, 'lab_validation_report.json');
            const blockedReport = {
                schema: LAB_VALIDATION_REPORT_SCHEMA,
                generatedAt: new Date().toISOString(),
                status: 'blocked',
                caseCount: results.length,
                expectedCaseCount: LAB_VALIDATION_CASE_COUNT,
                timingContamination,
                fixtureAuthority: {
                    schema: LAB_VALIDATION_FIXTURE_SCHEMA,
                    artifactClass: 'test_fixture',
                    productionEligible: false,
                    blenderCyclesProvenanceClaimed: false
                },
                blocker: {
                    code: 'lab_validation_runtime_blocked',
                    message: String(error?.message ?? error)
                },
                captureAuthentication: null,
                fallbackProofs,
                browserDiagnostics,
                failures,
                cases: results
            };
            await writeFile(reportPath, `${JSON.stringify(blockedReport, null, 2)}\n`, 'utf8');
            throw new Error(
                `lab validation blocked; report=${artifactPath(reportPath)}`,
                {cause: error}
            );
        }
        throw error;
    } finally {
        if (page && !page.isClosed()) {
            await page.evaluate(() => window.__ai531LabValidation?.dispose()).catch(() => {});
        }
        await browser?.close?.().catch(() => {});
        if (server && !server.killed) server.kill('SIGTERM');
    }
}

export function parseLabValidationArgs(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index++) {
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
            '--output-root': 'outputRoot',
            '--url': 'baseUrl',
            '--port': 'preferredPort',
            '--chrome': 'chromePath',
            '--warmup-frames': 'warmupFrames',
            '--timing-contaminated-reason': 'timingContaminationReason'
        })[token];
        if (!key) throw new Error(`Unknown option '${token}'`);
        result[key] = key === 'preferredPort' || key === 'warmupFrames' ? Number(next) : next;
        index++;
    }
    return Object.freeze(result);
}

export function createLabValidationUsageText() {
    return [
        'Usage: node tools/static_sun_depth/validate_lab.mjs [options]',
        '',
        '  --output-root <tests/artifacts/screens/illumination_531/...>',
        '  --url <http://127.0.0.1:port>          Reuse a repository static server',
        '  --port <number>                        Preferred local port (default 4174)',
        '  --chrome <path>                        Installed Chrome/Chromium executable',
        '  --warmup-frames <count>                Frames before each capture (default 2)',
        '  --timing-contaminated-reason <text>    Non-promotable timing context',
        ''
    ].join('\n');
}

function requireExactPositiveIntegerPair(value, label) {
    if (!Array.isArray(value) || value.length !== 2
        || value.some((entry) => !Number.isSafeInteger(entry) || entry < 1)) {
        throw new TypeError(`${label} must contain exactly two positive integers`);
    }
    return value;
}

function requirePlainRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype
            && Object.getPrototypeOf(value) !== null)) {
        throw new TypeError(`${label} must be a plain object`);
    }
    return value;
}

function requireExactDataKeys(value, expected, label) {
    const actual = Object.keys(value).sort(compareStrings);
    const wanted = [...expected].sort(compareStrings);
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
        throw new TypeError(`${label} must contain exactly ${wanted.join(', ')}`);
    }
    for (const key of wanted) {
        const property = Object.getOwnPropertyDescriptor(value, key);
        if (!property || !property.enumerable
            || !Object.prototype.hasOwnProperty.call(property, 'value')) {
            throw new TypeError(`${label}.${key} must be an enumerable own data property`);
        }
    }
}

function requireStaticCityShadowWorkload(workload, label) {
    const source = requirePlainRecord(workload, `${label} workload`);
    const counters = requirePlainRecord(
        source.staticCityShadow,
        `${label} workload.staticCityShadow`
    );
    requireExactDataKeys(
        counters,
        ['calls', 'lines', 'points', 'triangles'],
        `${label} workload.staticCityShadow`
    );
    for (const [key, value] of Object.entries(counters)) {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new TypeError(`${label} static City shadow '${key}' must be a non-negative integer`);
        }
    }
    return counters;
}

function requireDynamicBusShadowWorkload(workload, label) {
    const source = requirePlainRecord(workload, `${label} workload`);
    const counters = requirePlainRecord(
        source.dynamicBusShadow,
        `${label} workload.dynamicBusShadow`
    );
    requireExactDataKeys(
        counters,
        ['calls', 'lines', 'points', 'triangles'],
        `${label} workload.dynamicBusShadow`
    );
    for (const [key, value] of Object.entries(counters)) {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new TypeError(`${label} dynamic bus shadow '${key}' must be a non-negative integer`);
        }
    }
    return counters;
}

function isCacheActive(diagnostics) {
    return !!diagnostics?.active
        && diagnostics?.runtime?.controller?.state === 'active'
        && diagnostics?.runtime?.controller?.effectiveMode === 'baked';
}

function normalizeReason(value) {
    if (typeof value !== 'string' || value.trim().length < 8) {
        throw new TypeError('timing contamination reason must be a descriptive string');
    }
    return value.trim();
}

function requireInteger(value, minimum, maximum, label) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new RangeError(`${label} must be an integer in [${minimum}, ${maximum}]`);
    }
    return value;
}

function requireScreenshotOutputRoot(value) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new TypeError('outputRoot must be a path');
    }
    const absolute = path.resolve(repoRoot, value);
    const relative = path.relative(allowedScreenshotRoot, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('lab validation output must remain under tests/artifacts/screens/illumination_531');
    }
    return absolute;
}

async function findFreePort(preferred) {
    for (let port = preferred; port < preferred + 100; port++) {
        if (await canListen(port)) return port;
    }
    throw new Error(`No free port found from ${preferred} through ${preferred + 99}`);
}

function canListen(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => server.close(() => resolve(true)));
        server.listen(port, '127.0.0.1');
    });
}

async function waitForServer(baseUrl) {
    let lastError = null;
    for (let attempt = 0; attempt < 120; attempt++) {
        try {
            const response = await fetch(baseUrl, {cache: 'no-store'});
            if (response.ok) return;
        } catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for static server at ${baseUrl}`, {cause: lastError});
}

function artifactPath(value) {
    return path.relative(repoRoot, path.resolve(value)).replaceAll('\\', '/');
}

function compareStrings(left, right) {
    return left === right ? 0 : left < right ? -1 : 1;
}

function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) freezeDeep(child);
    return Object.freeze(value);
}

async function main() {
    const options = parseLabValidationArgs(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(createLabValidationUsageText());
        return;
    }
    const result = await runLabStaticSunDepthValidation(options);
    process.stdout.write(`${JSON.stringify({
        ok: true,
        caseCount: result.report.caseCount,
        report: artifactPath(result.reportPath),
        timingContamination: result.report.timingContamination
    }, null, 2)}\n`);
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedUrl === import.meta.url) {
    await main().catch((error) => {
        process.stderr.write(`[StaticSunDepthLabValidation] ${error?.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
