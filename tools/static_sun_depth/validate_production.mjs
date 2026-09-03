// Runs strict BigCity2 current-versus-static-sun production validation.
// @ts-check

import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {lstat, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ILLUMINATION_VALIDATION_CASES} from '../../src/app/illumination/validation/IlluminationValidationCaseCatalog.js';
import {
    rawSha256Hex,
    verifyIlluminationBinaryPackage
} from '../../src/app/illumination/package/index.js';
import {canonicalJsonStringify} from '../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    createThreeR183DirectionalShadowFilterAxes,
    validateStaticSunDepthTileSetDescriptor
} from '../../src/app/illumination/static_sun_depth/StaticSunDepthContract.js';
import {
    PRODUCTION_MINIMUM_STATIC_RECEIVER_COVERAGE_RATIO,
    PRODUCTION_VALIDATION_CAPTURE_SLOTS,
    authenticateProductionValidationCaptureSet,
    createValidationCaptureRecord
} from './src/ValidationCaptureAuthentication.mjs';
import {
    requireProductionDepthDiagnosticChunkWindows,
    requireProductionStaticSunDepthChunkWindows
} from './src/ProductionPackage.mjs';
import {
    PRODUCTION_DEPTH_DIAGNOSTIC_INDEX_SCHEMA,
    PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID
} from './src/ProductionDepthDiagnostic.mjs';
import {
    createProductionLiveTexelPhaseEvidence,
    validateProductionStaticSunTexelLattice
} from './browser/ProductionTexelPhase.js';

export {
    createProductionLiveTexelPhaseEvidence,
    validateProductionStaticSunTexelLattice
};

export const PRODUCTION_VALIDATION_INDEX_SCHEMA =
    'bus-sim-static-sun-depth-production-package-index-v1';
export const PRODUCTION_VALIDATION_REPORT_SCHEMA =
    'bus-sim-static-sun-depth-production-validation-report-v4';
export const PRODUCTION_VALIDATION_CASE_COUNT = 197;
export const PRODUCTION_DEPTH_DIAGNOSTIC_VALIDATION_REPORT_SCHEMA =
    'bus-sim-static-sun-depth-depth-precision-diagnostic-validation-report-v1';
export const PRODUCTION_DEPTH_DIAGNOSTIC_VALIDATION_CASE_COUNT = 12;
export const PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS =
    Object.freeze([1280, 720]);
export const PRODUCTION_VALIDATION_CAPABILITY_PROFILE_ID = 'development.static_sun_v1';
export const PRODUCTION_VALIDATION_THRESHOLDS = Object.freeze({
    falseLitToleranceByte: 4,
    maxContinuousSeamRunPixels: 1,
    maxRgbErrorByte: 64,
    meanRgbErrorByte: 0.35,
    pixelsOverFourBytePercent: 0.2,
    seamErrorToleranceByte: 2,
    seamFalseLitPixelCount: 0,
    missingOccluderPixelCount: 0
});

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const screenshotAuthorityRoot = path.join(
    repoRoot,
    'tests/artifacts/screens/illumination_531'
);
const defaultPackageIndexPath = path.join(
    repoRoot,
    'tests/artifacts/illumination_531/package_index.json'
);
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const PROFILE_ID_PATTERN = /^ai527\.sun\.az\d{3}\.el\d{2}$/;
const LIVE_IDENTITY_KEYS = Object.freeze([
    'alphaSemanticsSha256',
    'casterInventorySha256',
    'cityId',
    'developmentCacheAllowed',
    'lightingProfileId',
    'resolvedSourceSha256',
    'staticSunDepthSourceSha256'
]);
const PROFILE_ENTRY_KEYS = Object.freeze(['liveIdentity', 'packagePath']);
const CASE_METRIC_KEYS = Object.freeze([
    'dynamicReceiverMaskedPixelCount',
    'eligibleStaticReceiverPixelCount',
    'falseLitMethod',
    'height',
    'maxContinuousSeamRunPixels',
    'maxRgbErrorByte',
    'meanRgbErrorByte',
    'missingOccluderPixelCount',
    'outsideStaticReceiverPixelCount',
    'pixelCount',
    'pixelsOverFourByte',
    'pixelsOverFourBytePercent',
    'rawSamePixelMaxRgbErrorByte',
    'rawSamePixelMeanRgbErrorByte',
    'rawSamePixelPixelsOverFourByte',
    'rawSamePixelPixelsOverFourBytePercent',
    'rawSamePixelRgbErrorMethod',
    'rgbErrorMethod',
    'seamErrorPixelCount',
    'seamFalseLitPixelCount',
    'seamMaskMethod',
    'seamPixelCount',
    'staticReceiverMaskMethod',
    'width'
]);
const CASE_INTEGER_METRIC_KEYS = Object.freeze([
    'dynamicReceiverMaskedPixelCount',
    'eligibleStaticReceiverPixelCount',
    'height',
    'maxContinuousSeamRunPixels',
    'maxRgbErrorByte',
    'missingOccluderPixelCount',
    'outsideStaticReceiverPixelCount',
    'pixelCount',
    'pixelsOverFourByte',
    'rawSamePixelMaxRgbErrorByte',
    'rawSamePixelPixelsOverFourByte',
    'seamErrorPixelCount',
    'seamFalseLitPixelCount',
    'seamPixelCount',
    'width'
]);
const EXPECTED_NON_LAB_CASE_IDS = Object.freeze(
    ILLUMINATION_VALIDATION_CASES
        .filter((entry) => entry.kind !== 'lab')
        .map((entry) => entry.id)
        .sort(compareStrings)
);
const EXPECTED_DEPTH_DIAGNOSTIC_CASE_IDS = Object.freeze(
    ILLUMINATION_VALIDATION_CASES
        .filter((entry) => entry.kind !== 'lab'
            && entry.sunProfile?.id === PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID)
        .map((entry) => entry.id)
        .sort(compareStrings)
);

/**
 * @param {unknown} value
 * @returns {Readonly<{schema: string, profiles: Readonly<Record<string, Readonly<Record<string, any>>>>}>}
 */
export function validateProductionPackageIndex(value) {
    const source = requirePlainRecord(value, 'package index');
    requireExactDataKeys(source, ['profiles', 'schema'], 'package index');
    if (source.schema !== PRODUCTION_VALIDATION_INDEX_SCHEMA) {
        throw new Error(`package index schema must be '${PRODUCTION_VALIDATION_INDEX_SCHEMA}'`);
    }
    const profileSource = requirePlainRecord(source.profiles, 'package index profiles');
    const ids = Object.keys(profileSource).sort(compareStrings);
    if (ids.length === 0) throw new Error('package index profiles must not be empty');
    const profiles = {};
    for (const lightingProfileId of ids) {
        if (!PROFILE_ID_PATTERN.test(lightingProfileId)) {
            throw new Error(`package index lightingProfileId '${lightingProfileId}' is invalid`);
        }
        const profileProperty = Object.getOwnPropertyDescriptor(profileSource, lightingProfileId);
        if (!profileProperty
            || !profileProperty.enumerable
            || !Object.prototype.hasOwnProperty.call(profileProperty, 'value')) {
            throw new TypeError(
                `package index profile '${lightingProfileId}' must be an enumerable own data property`
            );
        }
        const entry = requirePlainRecord(
            profileProperty.value,
            `package index profile '${lightingProfileId}'`
        );
        requireExactDataKeys(
            entry,
            PROFILE_ENTRY_KEYS,
            `package index profile '${lightingProfileId}'`
        );
        const packagePath = requirePackagePath(entry.packagePath, lightingProfileId);
        const liveIdentity = validateLiveIdentity(entry.liveIdentity, lightingProfileId);
        profiles[lightingProfileId] = freezeDeep({packagePath, liveIdentity});
    }
    return freezeDeep({schema: PRODUCTION_VALIDATION_INDEX_SCHEMA, profiles});
}

/** @param {unknown} value */
export function validateProductionDepthDiagnosticPackageIndex(value) {
    const source = requirePlainRecord(value, 'depth diagnostic package index');
    requireExactDataKeys(
        source,
        ['productionEligible', 'profiles', 'schema'],
        'depth diagnostic package index'
    );
    if (source.schema !== PRODUCTION_DEPTH_DIAGNOSTIC_INDEX_SCHEMA
        || source.productionEligible !== false) {
        throw new Error(
            `depth diagnostic package index must use '${PRODUCTION_DEPTH_DIAGNOSTIC_INDEX_SCHEMA}'`
            + ' and remain explicitly non-promotable'
        );
    }
    const profileSource = requirePlainRecord(
        source.profiles,
        'depth diagnostic package index profiles'
    );
    const ids = Object.keys(profileSource).sort(compareStrings);
    if (JSON.stringify(ids)
        !== JSON.stringify([PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID])) {
        throw new Error(
            `depth diagnostic package index must contain only '${PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID}'`
        );
    }
    const entry = requirePlainRecord(
        profileSource[PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID],
        'depth diagnostic package index profile'
    );
    requireExactDataKeys(
        entry,
        PROFILE_ENTRY_KEYS,
        'depth diagnostic package index profile'
    );
    const packagePath = requirePackagePath(
        entry.packagePath,
        PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID
    );
    if (!packagePath.startsWith(
        'tests/artifacts/illumination_531/diagnostics/'
    )) {
        throw new Error(
            'depth diagnostic package must remain below the separate diagnostics artifact root'
        );
    }
    const liveIdentity = validateLiveIdentity(
        entry.liveIdentity,
        PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID
    );
    return freezeDeep({
        productionEligible: false,
        profiles: {
            [PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID]: {
                liveIdentity,
                packagePath
            }
        },
        schema: PRODUCTION_DEPTH_DIAGNOSTIC_INDEX_SCHEMA
    });
}

export function validateProductionDescriptorFilterIdentity(value) {
    const descriptor = validateStaticSunDepthTileSetDescriptor(value);
    const sampling = descriptor.identity.sampling;
    const expectedAxes = createThreeR183DirectionalShadowFilterAxes(
        descriptor.identity.sunPointDirectionWorld
    );
    const expected = {
        bias: {
            constantDepthReliefMeters: 0.0697915,
            geometricNormalOffsetMeters: 0.0232,
            model: 'geometric-normal-offset-plus-constant-depth-relief-v1'
        },
        comparison: 'receiver-depth-minus-bias-lte-caster-depth-v1',
        emptyPolicy: 'visible-v1',
        outOfBoundsPolicy: 'fail-closed-zero-visibility-v1',
        pcf: {
            hardwareComparison: 'linear-four-compare-taps-v1',
            model: 'three-r183-vogel-5-linear-compare-v1',
            radiusTexels: 1.5,
            sampleCount: 5,
            screenRotation: 'interleaved-gradient-noise-gl-fragcoord-v1',
            shadowMapSizeTexels: [16384, 16384],
            shadowMapWorldExtentMeters: [680, 680],
            sourceMapRightAxisWorld: expectedAxes.rightAxisWorld,
            sourceMapUpAxisWorld: expectedAxes.upAxisWorld
        }
    };
    const {
        sourceMapRightAxisWorld: actualRightAxis,
        sourceMapUpAxisWorld: actualUpAxis,
        ...actualPcfWithoutAxes
    } = sampling.pcf;
    const {
        sourceMapRightAxisWorld: expectedRightAxis,
        sourceMapUpAxisWorld: expectedUpAxis,
        ...expectedPcfWithoutAxes
    } = expected.pcf;
    const hasCompleteAxes = Array.isArray(actualRightAxis)
        && actualRightAxis.length === 3
        && Array.isArray(actualUpAxis)
        && actualUpAxis.length === 3;
    const maximumAxisError = hasCompleteAxes ? Math.max(
        ...actualRightAxis.map((entry, index) => (
            Math.abs(entry - expectedRightAxis[index])
        )),
        ...actualUpAxis.map((entry, index) => (
            Math.abs(entry - expectedUpAxis[index])
        ))
    ) : Infinity;
    if (canonicalJsonStringify({...sampling, pcf: actualPcfWithoutAxes})
            !== canonicalJsonStringify({...expected, pcf: expectedPcfWithoutAxes})
        || maximumAxisError > 1e-12
        || sampling.pcf.radiusTexels * sampling.pcf.shadowMapWorldExtentMeters[0]
            / sampling.pcf.shadowMapSizeTexels[0] !== 0.062255859375) {
        throw new Error(
            'production descriptor must match the effective Three r183 16384 filter identity'
        );
    }
    validateProductionStaticSunTexelLattice(descriptor);
    return descriptor;
}

/**
 * @param {unknown} packageIndex
 * @param {readonly Readonly<Record<string, any>>[]} [catalog]
 */
export function createProductionValidationPlan(
    packageIndex,
    catalog = ILLUMINATION_VALIDATION_CASES
) {
    const index = validateProductionPackageIndex(packageIndex);
    if (!Array.isArray(catalog)) throw new TypeError('illumination validation catalog must be an array');
    const cases = catalog.filter((entry) => entry?.kind !== 'lab');
    const ids = cases.map((entry) => entry?.id).sort(compareStrings);
    if (ids.length !== PRODUCTION_VALIDATION_CASE_COUNT
        || JSON.stringify(ids) !== JSON.stringify(EXPECTED_NON_LAB_CASE_IDS)) {
        const missing = EXPECTED_NON_LAB_CASE_IDS.filter((id) => !ids.includes(id));
        const unexpected = ids.filter((id) => !EXPECTED_NON_LAB_CASE_IDS.includes(id));
        throw new Error(
            `production validation case inventory must contain exactly ${PRODUCTION_VALIDATION_CASE_COUNT}`
            + ` non-lab cases; missing=${JSON.stringify(missing)}`
            + ` unexpected=${JSON.stringify(unexpected)}`
        );
    }
    const unique = new Set(ids);
    if (unique.size !== ids.length) throw new Error('production validation case IDs must be unique');
    const kindCounts = Object.fromEntries(
        ['gameplay_named_pose', 'low_sun_pose', 'profiler_pose'].map((kind) => [
            kind,
            cases.filter((entry) => entry.kind === kind).length
        ])
    );
    if (kindCounts.profiler_pose !== 100
        || kindCounts.gameplay_named_pose !== 1
        || kindCounts.low_sun_pose !== 96) {
        throw new Error(`production validation case kinds are incomplete: ${JSON.stringify(kindCounts)}`);
    }
    for (const entry of cases) {
        if (entry.cityId !== 'bigcity2'
            || entry.sourceHashSlot !== 'resolvedSourceSha256'
            || !PROFILE_ID_PATTERN.test(entry.sunProfile?.id ?? '')) {
            throw new Error(`production validation case '${entry.id}' has invalid BigCity2 ownership`);
        }
    }
    const requiredProfileIds = [...new Set(cases.map((entry) => entry.sunProfile.id))]
        .sort(compareStrings);
    const indexedProfileIds = Object.keys(index.profiles).sort(compareStrings);
    const missingProfiles = requiredProfileIds.filter((id) => !indexedProfileIds.includes(id));
    const unexpectedProfiles = indexedProfileIds.filter((id) => !requiredProfileIds.includes(id));
    if (missingProfiles.length > 0 || unexpectedProfiles.length > 0) {
        throw new Error(
            `package index must map the exact production lightingProfileId inventory;`
            + ` missing=${JSON.stringify(missingProfiles)}`
            + ` unexpected=${JSON.stringify(unexpectedProfiles)}`
        );
    }
    const groups = requiredProfileIds.map((lightingProfileId) => freezeDeep({
        lightingProfileId,
        package: index.profiles[lightingProfileId],
        sunProfile: cases.find((entry) => entry.sunProfile.id === lightingProfileId).sunProfile,
        cases: cases
            .filter((entry) => entry.sunProfile.id === lightingProfileId)
            .sort((left, right) => compareStrings(left.id, right.id))
    }));
    return freezeDeep({
        schema: 'bus-sim-static-sun-depth-production-validation-plan-v1',
        caseCount: cases.length,
        excludedLabCaseCount: ILLUMINATION_VALIDATION_CASES.filter(
            (entry) => entry.kind === 'lab'
        ).length,
        groups
    });
}

/**
 * @param {unknown} packageIndex
 * @param {readonly Readonly<Record<string, any>>[]} [catalog]
 */
export function createProductionDepthDiagnosticValidationPlan(
    packageIndex,
    catalog = ILLUMINATION_VALIDATION_CASES
) {
    const index = validateProductionDepthDiagnosticPackageIndex(packageIndex);
    if (!Array.isArray(catalog)) {
        throw new TypeError('illumination validation catalog must be an array');
    }
    const cases = catalog.filter((entry) => entry?.kind !== 'lab'
        && entry?.sunProfile?.id === PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID);
    const ids = cases.map((entry) => entry?.id).sort(compareStrings);
    if (ids.length !== PRODUCTION_DEPTH_DIAGNOSTIC_VALIDATION_CASE_COUNT
        || JSON.stringify(ids)
            !== JSON.stringify(EXPECTED_DEPTH_DIAGNOSTIC_CASE_IDS)) {
        const missing = EXPECTED_DEPTH_DIAGNOSTIC_CASE_IDS.filter(
            (id) => !ids.includes(id)
        );
        const unexpected = ids.filter(
            (id) => !EXPECTED_DEPTH_DIAGNOSTIC_CASE_IDS.includes(id)
        );
        throw new Error(
            'depth diagnostic validation inventory must contain the exact 12 canonical '
            + `${PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID} cases;`
            + ` missing=${JSON.stringify(missing)}`
            + ` unexpected=${JSON.stringify(unexpected)}`
        );
    }
    if (new Set(ids).size !== ids.length
        || cases.some((entry) => entry.kind !== 'low_sun_pose'
            || entry.cityId !== 'bigcity2'
            || entry.sourceHashSlot !== 'resolvedSourceSha256')) {
        throw new Error('depth diagnostic validation cases have invalid canonical ownership');
    }
    const profilePackage = index.profiles[PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID];
    const sunProfile = cases[0]?.sunProfile;
    return freezeDeep({
        caseCount: cases.length,
        excludedLabCaseCount: ILLUMINATION_VALIDATION_CASES.filter(
            (entry) => entry.kind === 'lab'
        ).length,
        groups: [{
            cases: cases.sort((left, right) => compareStrings(left.id, right.id)),
            lightingProfileId: PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID,
            package: profilePackage,
            sunProfile
        }],
        productionEligible: false,
        schema:
            'bus-sim-static-sun-depth-depth-precision-diagnostic-validation-plan-v1'
    });
}

/** @param {Readonly<Record<string, any>>} metrics */
export function evaluateProductionCaseMetrics(metrics) {
    metrics = requireProductionMetricRecord(metrics);
    const failures = [];
    if (metrics.meanRgbErrorByte > PRODUCTION_VALIDATION_THRESHOLDS.meanRgbErrorByte) {
        failures.push('mean_rgb_error');
    }
    if (metrics.pixelsOverFourBytePercent
        > PRODUCTION_VALIDATION_THRESHOLDS.pixelsOverFourBytePercent) {
        failures.push('pixels_over_four');
    }
    if (metrics.maxRgbErrorByte > PRODUCTION_VALIDATION_THRESHOLDS.maxRgbErrorByte) {
        failures.push('maximum_rgb_error');
    }
    if (metrics.missingOccluderPixelCount
        > PRODUCTION_VALIDATION_THRESHOLDS.missingOccluderPixelCount) {
        failures.push('missing_occluder');
    }
    if (metrics.seamFalseLitPixelCount
        > PRODUCTION_VALIDATION_THRESHOLDS.seamFalseLitPixelCount) {
        failures.push('false_lit_seam');
    }
    if (metrics.maxContinuousSeamRunPixels
        > PRODUCTION_VALIDATION_THRESHOLDS.maxContinuousSeamRunPixels) {
        failures.push('continuous_seam');
    }
    return Object.freeze(failures);
}

/** @param {unknown} value */
export function requireProductionMetricRecord(value) {
    const metrics = requirePlainRecord(value, 'production case metrics');
    requireExactDataKeys(metrics, CASE_METRIC_KEYS, 'production case metrics');
    for (const key of CASE_METRIC_KEYS.filter((entry) => !entry.endsWith('Method'))) {
        if (!Number.isFinite(metrics[key]) || metrics[key] < 0) {
            throw new TypeError(
                `production case metric '${key}' must be a finite non-negative number`
            );
        }
    }
    for (const key of CASE_INTEGER_METRIC_KEYS) {
        if (!Number.isSafeInteger(metrics[key])) {
            throw new TypeError(`production case metric '${key}' must be a safe integer`);
        }
    }
    if (metrics.width < 1 || metrics.height < 1
        || metrics.pixelCount !== metrics.width * metrics.height) {
        throw new Error('production case metric dimensions and pixelCount must be consistent');
    }
    if (metrics.eligibleStaticReceiverPixelCount < 1
        || metrics.eligibleStaticReceiverPixelCount
            + metrics.dynamicReceiverMaskedPixelCount
            + metrics.outsideStaticReceiverPixelCount !== metrics.pixelCount) {
        throw new Error('production static-receiver mask counts must exactly partition pixelCount');
    }
    if (metrics.eligibleStaticReceiverPixelCount < Math.ceil(
        metrics.pixelCount * PRODUCTION_MINIMUM_STATIC_RECEIVER_COVERAGE_RATIO
    )) {
        throw new Error('production static-receiver mask coverage collapsed');
    }
    if (metrics.maxRgbErrorByte > 255 || metrics.meanRgbErrorByte > 255
        || metrics.rawSamePixelMaxRgbErrorByte > 255
        || metrics.rawSamePixelMeanRgbErrorByte > 255
        || metrics.pixelsOverFourByte > metrics.eligibleStaticReceiverPixelCount
        || metrics.rawSamePixelPixelsOverFourByte
            > metrics.eligibleStaticReceiverPixelCount
        || metrics.missingOccluderPixelCount > metrics.eligibleStaticReceiverPixelCount
        || metrics.seamPixelCount > metrics.eligibleStaticReceiverPixelCount
        || metrics.seamErrorPixelCount > metrics.seamPixelCount
        || metrics.seamFalseLitPixelCount > metrics.seamPixelCount
        || metrics.pixelsOverFourBytePercent > 100
        || metrics.rawSamePixelPixelsOverFourBytePercent > 100) {
        throw new Error('production case metrics contain an impossible count or byte value');
    }
    if (metrics.maxRgbErrorByte > metrics.rawSamePixelMaxRgbErrorByte
        || metrics.pixelsOverFourByte > metrics.rawSamePixelPixelsOverFourByte) {
        throw new Error('production aligned RGB metrics contradict raw same-pixel evidence');
    }
    if ((metrics.seamErrorPixelCount === 0) !== (metrics.maxContinuousSeamRunPixels === 0)
        || metrics.maxContinuousSeamRunPixels > metrics.seamErrorPixelCount
        || metrics.maxContinuousSeamRunPixels > Math.max(metrics.width, metrics.height)
        || metrics.seamFalseLitPixelCount > metrics.missingOccluderPixelCount) {
        throw new Error('production case metrics contain contradictory seam evidence');
    }
    const expectedPercent = metrics.pixelsOverFourByte
        / metrics.eligibleStaticReceiverPixelCount * 100;
    if (Math.abs(metrics.pixelsOverFourBytePercent - expectedPercent) > 1e-12) {
        throw new Error('production pixelsOverFourBytePercent is inconsistent with its count');
    }
    const expectedRawSamePixelPercent = metrics.rawSamePixelPixelsOverFourByte
        / metrics.eligibleStaticReceiverPixelCount * 100;
    if (Math.abs(
        metrics.rawSamePixelPixelsOverFourBytePercent - expectedRawSamePixelPercent
    ) > 1e-12) {
        throw new Error(
            'production rawSamePixelPixelsOverFourBytePercent is inconsistent with its count'
        );
    }
    if (metrics.falseLitMethod
            !== 'cache_luma_gt_eligible_current_3x3_max_plus_4_and_same_frame_cache_visibility_gt_live_v3'
        || metrics.rgbErrorMethod
            !== 'nearest_eligible_current_3x3_rgb_chebyshev_v1'
        || metrics.rawSamePixelRgbErrorMethod !== 'same_pixel_rgb_chebyshev_v1'
        || metrics.seamMaskMethod
            !== 'static_sun_depth_seam_debug_red_gt_blue_plus_32_v1'
        || metrics.staticReceiverMaskMethod
            !== 'visible_static_city_receivers_excluding_registered_dynamic_receivers_depth_equality_v2') {
        throw new Error('production case metric method identity is unsupported');
    }
    return metrics;
}

export function evaluateProductionDynamicBusState(current, cache, comparison) {
    const states = [
        requireDynamicBusState(current, 'production current'),
        requireDynamicBusState(cache, 'production cache'),
        requireDynamicBusState(comparison, 'production comparison')
    ];
    const first = states[0];
    const stable = states.every((state) => (
        state.meshCount === first.meshCount
        && state.casterMeshCount === first.casterMeshCount
        && state.receiverMeshCount === first.receiverMeshCount
        && state.registeredDynamicRootCount === first.registeredDynamicRootCount
    ));
    return Object.freeze(stable ? [] : ['dynamic_bus_ownership_or_caster_state']);
}

export function evaluateProductionDynamicBusShadowProof(value) {
    const proof = requireDynamicBusShadowProof(value);
    return Object.freeze(proof.brightenedStaticCityReceiverPixelCount > 0
        ? ['dynamic_bus_shadow_brightening']
        : []);
}

/**
 * @param {Readonly<Record<string, any>>} currentDiagnostics
 * @param {Readonly<Record<string, any>>} cacheDiagnostics
 * @param {Readonly<Record<string, any>>} comparisonDiagnostics
 */
export function evaluateProductionCasterTransition(
    currentDiagnostics,
    cacheDiagnostics,
    comparisonDiagnostics
) {
    const failures = [];
    const currentCasters = currentDiagnostics?.casters;
    const cacheCasters = cacheDiagnostics?.casters;
    const comparisonCasters = comparisonDiagnostics?.casters;
    const currentController = currentDiagnostics?.runtime?.controller;
    const genuineCurrentReady = currentDiagnostics?.active === null
        && currentDiagnostics?.debugMode === 'final'
        && currentCasters?.active === false
        && currentCasters?.snapshotMeshCount === 0
        && currentCasters?.staticMeshCount === 0
        && currentCasters?.originalCasterCount === 0
        && currentCasters?.suppressedCasterCount === 0
        && currentCasters?.restores === 0
        && currentController?.requestedMode === 'current'
        && currentController?.effectiveMode === 'current'
        && currentController?.state === 'unavailable'
        && currentController?.phase === 'disposed'
        && currentController?.reason === 'not_configured';
    if (!genuineCurrentReady) failures.push('genuine_current_lifecycle_invalid');
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
        && comparisonDiagnostics?.debugMode === 'signedDifference'
        && comparisonCasters?.active === false
        && comparisonCasters?.snapshotMeshCount === 0
        && comparisonCasters?.originalCasterCount === cacheCasters?.originalCasterCount
        && comparisonCasters?.lastReason === 'comparison_current_shadow_retained'
        && Number.isSafeInteger(comparisonCasters?.restores)
        && comparisonCasters.restores === cacheCasters?.restores + 1;
    if (!comparisonRestored) failures.push('static_casters_not_restored_for_comparison');
    return Object.freeze(failures);
}

export function evaluateProductionShadowSubmission(
    currentWorkload,
    cacheWorkload,
    comparisonWorkload
) {
    const failures = [];
    const current = requireStaticCityShadowWorkload(currentWorkload, 'production current');
    const cache = requireStaticCityShadowWorkload(cacheWorkload, 'production cache');
    const comparison = requireStaticCityShadowWorkload(
        comparisonWorkload,
        'production comparison'
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
    return Object.freeze(failures);
}

/** @param {readonly Readonly<Record<string, any>>[]} results */
export function createProductionTileBoundaryEvidence(results) {
    if (!Array.isArray(results)) throw new TypeError('production results must be an array');
    let aggregateSeamPixelCount = 0;
    let aggregateSeamErrorPixelCount = 0;
    let casesWithVisibleTileBoundary = 0;
    for (const result of results) {
        const metrics = requireProductionMetricRecord(result?.metrics);
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

/** @param {readonly Readonly<Record<string, any>>[]} results */
export function createProductionDynamicBusEvidence(results) {
    if (!Array.isArray(results)) throw new TypeError('production results must be an array');
    let totalMaskedDynamicReceiverPixelCount = 0;
    let casesWithVisibleDynamicReceiver = 0;
    let cacheShadowDrawCalls = 0;
    let cacheShadowTriangles = 0;
    let affectedStaticCityReceiverPixelCount = 0;
    let casesWithStaticCityShadowImpact = 0;
    let brightenedStaticCityReceiverPixelCount = 0;
    let casesWithStaticCityBrightening = 0;
    for (const result of results) {
        const metrics = requireProductionMetricRecord(result?.metrics);
        const cacheShadow = requireShadowCounterRecord(
            result?.workload?.cache?.dynamicBusShadow,
            'production cache dynamic bus shadow'
        );
        const proof = requireDynamicBusShadowProof(result?.dynamicBus?.shadowProof);
        totalMaskedDynamicReceiverPixelCount += metrics.dynamicReceiverMaskedPixelCount;
        if (metrics.dynamicReceiverMaskedPixelCount > 0) {
            casesWithVisibleDynamicReceiver += 1;
        }
        cacheShadowDrawCalls += cacheShadow.calls;
        cacheShadowTriangles += cacheShadow.triangles;
        affectedStaticCityReceiverPixelCount += proof.affectedStaticCityReceiverPixelCount;
        if (proof.affectedStaticCityReceiverPixelCount > 0) {
            casesWithStaticCityShadowImpact += 1;
        }
        brightenedStaticCityReceiverPixelCount +=
            proof.brightenedStaticCityReceiverPixelCount;
        if (proof.brightenedStaticCityReceiverPixelCount > 0) {
            casesWithStaticCityBrightening += 1;
        }
    }
    return freezeDeep({
        method: 'aggregate_registered_dynamic_receiver_mask_and_signed_bus_shadow_v2',
        staticReceiverMaskMethod:
            'visible_static_city_receivers_excluding_registered_dynamic_receivers_depth_equality_v2',
        dynamicBusShadowProofMethod:
            'bus_cast_shadow_enabled_luma_darker_than_disabled_over_visible_city_receivers_v2',
        totalMaskedDynamicReceiverPixelCount,
        casesWithVisibleDynamicReceiver,
        cacheShadowDrawCalls,
        cacheShadowTriangles,
        affectedStaticCityReceiverPixelCount,
        casesWithStaticCityShadowImpact,
        brightenedStaticCityReceiverPixelCount,
        casesWithStaticCityBrightening,
        passed: results.length > 0
            && totalMaskedDynamicReceiverPixelCount > 0
            && casesWithVisibleDynamicReceiver > 0
            && cacheShadowDrawCalls > 0
            && cacheShadowTriangles > 0
            && affectedStaticCityReceiverPixelCount > 0
            && casesWithStaticCityShadowImpact > 0
            && brightenedStaticCityReceiverPixelCount === 0
            && casesWithStaticCityBrightening === 0
    });
}

/**
 * @param {{
 *   packageIndexPath?: string,
 *   outputRoot?: string,
 *   baseUrl?: string|null,
 *   preferredPort?: number,
 *   chromePath?: string|null,
 *   warmupFrames?: number,
 *   timingContaminationReason?: string|null,
 *   depthPrecisionDiagnostic?: boolean
 * }} [options]
 * @param {{chromiumApi?: typeof chromium}} [deps]
 */
export async function runProductionStaticSunDepthValidation(options = {}, deps = {}) {
    if (options.depthPrecisionDiagnostic !== undefined
        && typeof options.depthPrecisionDiagnostic !== 'boolean') {
        throw new TypeError('depthPrecisionDiagnostic must be boolean');
    }
    const depthPrecisionDiagnostic = options.depthPrecisionDiagnostic === true;
    if (depthPrecisionDiagnostic && !options.packageIndexPath) {
        throw new Error(
            'depth precision diagnostic validation requires an explicit package index'
        );
    }
    const packageIndexPath = requireRepositoryFile(
        options.packageIndexPath ?? defaultPackageIndexPath,
        'package index'
    );
    if (path.basename(packageIndexPath) !== 'package_index.json') {
        throw new Error('production package index must be named package_index.json');
    }
    const outputRoot = requireScreenshotOutputRoot(
        options.outputRoot ?? screenshotAuthorityRoot
    );
    const warmupFrames = requireInteger(options.warmupFrames ?? 2, 0, 30, 'warmupFrames');
    const indexText = await readFile(packageIndexPath, 'utf8');
    let parsedIndex;
    try {
        parsedIndex = JSON.parse(indexText);
    } catch (error) {
        throw new Error('package_index.json is not valid JSON', {cause: error});
    }
    const plan = depthPrecisionDiagnostic
        ? createProductionDepthDiagnosticValidationPlan(parsedIndex)
        : createProductionValidationPlan(parsedIndex);
    const authenticatedPackagesByProfile = await verifyIndexedPackages(
        plan,
        depthPrecisionDiagnostic
    );
    const expectedCaseIds = depthPrecisionDiagnostic
        ? EXPECTED_DEPTH_DIAGNOSTIC_CASE_IDS
        : EXPECTED_NON_LAB_CASE_IDS;
    const expectedCaseCount = plan.caseCount;
    await mkdir(outputRoot, {recursive: true});

    const timingContaminationReason = normalizeOptionalReason(
        options.timingContaminationReason
            ?? process.env.AI531_TIMING_CONTAMINATED_REASON
            ?? null
    );
    const timingContamination = Object.freeze({
        contaminated: timingContaminationReason !== null,
        reason: timingContaminationReason,
        usableForPromotion: timingContaminationReason === null
    });
    let server = null;
    let browser = null;
    const results = [];
    const failures = [];
    const browserDiagnostics = [];
    const sourceShadowFilterIdentityByProfile = new Map();
    const sourceShadowTexelPhaseEvidenceByProfile = new Map();
    try {
        const preferredPort = requireInteger(options.preferredPort ?? 4173, 1024, 65535, 'preferredPort');
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
        const requestedChromePath = options.chromePath
            ?? process.env.PLAYWRIGHT_EXECUTABLE_PATH
            ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
        browser = await chromiumApi.launch({
            headless: true,
            ...(requestedChromePath && existsSync(requestedChromePath)
                ? {executablePath: requestedChromePath}
                : {}),
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
        const productionUrl =
            `${baseUrl}/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0`;
        let environment = null;
        let gameCanvas = null;
        let receiverMaskEvidenceCanvas = null;

        async function initializeProfilePage() {
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
            const nextEnvironment = await installBrowserValidationRuntime(page);
            if (environment === null) {
                environment = nextEnvironment;
            } else if (canonicalJsonStringify(nextEnvironment)
                !== canonicalJsonStringify(environment)) {
                throw new Error('Production validation environment changed between profile pages');
            }
            gameCanvas = page.locator('#game-canvas');
            receiverMaskEvidenceCanvas = page.locator(
                '#ai531-production-receiver-mask-evidence'
            );
            const gameCanvasBounds = await gameCanvas.boundingBox();
            if (!gameCanvasBounds
                || gameCanvasBounds.width
                    !== PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS[0]
                || gameCanvasBounds.height
                    !== PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS[1]) {
                throw new Error(
                    'Production validation game canvas must be exactly 1280x720 CSS pixels: '
                    + JSON.stringify(gameCanvasBounds)
                );
            }
        }

        for (const group of plan.groups) {
            // Cache activation deliberately mutates static caster/material ownership.
            // A fresh page per sun profile prevents those validation-only mutations
            // from becoming the next profile's supposedly genuine current oracle.
            // Current/cache pairs inside the profile still share one page and IDB.
            if (environment !== null) {
                await page.evaluate(async () => {
                    await window.__ai531ProductionValidation?.dispose?.();
                });
            }
            await initializeProfilePage();
            const packageUrl = new URL(group.package.packagePath, `${baseUrl}/`).href;
            await page.evaluate(
                async ({profile, packageUrl: url}) => {
                    await window.__ai531ProductionValidation.prepareProfile({
                        lightingProfileId: profile.lightingProfileId,
                        liveIdentity: profile.package.liveIdentity,
                        packageUrl: url,
                        sunProfile: profile.sunProfile
                    });
                },
                {profile: group, packageUrl}
            );

            // Capture the genuine current engine before cache activation. The
            // cache remains unconfigured here, and every image stays paired in
            // this profile page's IndexedDB until its cache comparison consumes
            // the bytes. liveFinal is intentionally not cycled between cases:
            // repeated shader-hook teardown changes Three's visible-material
            // program cache and corrupts the following cache capture.
            const currentByCase = new Map();
            for (const validationCase of group.cases) {
                const caseDirectory = path.join(outputRoot, validationCase.id);
                const currentCapturePath = path.join(caseDirectory, 'current.png');
                await mkdir(caseDirectory, {recursive: true});
                const current = await page.evaluate(
                    async ({validationCase: caseValue, warmups}) => (
                        window.__ai531ProductionValidation.captureCurrent(caseValue, warmups)
                    ),
                    {validationCase, warmups: warmupFrames}
                );
                currentByCase.set(validationCase.id, current);
                await gameCanvas.screenshot({
                    path: currentCapturePath,
                    type: 'png'
                });
            }

            const activation = await page.evaluate(async () => (
                window.__ai531ProductionValidation.activatePreparedProfile()
            ));
            if (!isCacheActive(activation)) {
                throw new Error(
                    `static-sun cache fell back for '${group.lightingProfileId}':`
                    + ` ${JSON.stringify(activation)}`
                );
            }
            sourceShadowFilterIdentityByProfile.set(
                group.lightingProfileId,
                freezeDeep(activation.sourceShadowFilterIdentity)
            );
            if (activation.sourceShadowTexelPhaseEvidence?.status !== 'verified') {
                throw new Error(
                    'live source shadow texel phase evidence is absent for '
                    + group.lightingProfileId
                );
            }
            sourceShadowTexelPhaseEvidenceByProfile.set(
                group.lightingProfileId,
                freezeDeep(activation.sourceShadowTexelPhaseEvidence)
            );

            for (const validationCase of group.cases) {
                const caseDirectory = path.join(outputRoot, validationCase.id);
                const currentCapturePath = path.join(caseDirectory, 'current.png');
                const cacheCapturePath = path.join(caseDirectory, 'cache.png');
                const comparisonCapturePath = path.join(caseDirectory, 'comparison.png');
                const dynamicReceiverMaskCapturePath = path.join(
                    caseDirectory,
                    'dynamicReceiverMask.png'
                );
                const staticCityReceiverMaskCapturePath = path.join(
                    caseDirectory,
                    'staticCityReceiverMask.png'
                );
                await mkdir(caseDirectory, {recursive: true});
                const cache = await page.evaluate(
                    async ({validationCase: caseValue, warmups}) => (
                        window.__ai531ProductionValidation.captureCache(caseValue, warmups)
                    ),
                    {validationCase, warmups: warmupFrames}
                );
                await gameCanvas.screenshot({
                    path: cacheCapturePath,
                    type: 'png'
                });
                const current = currentByCase.get(validationCase.id);
                if (!current) {
                    throw new Error(`Missing genuine current capture for '${validationCase.id}'`);
                }
                const comparison = await page.evaluate(
                    async ({validationCase: caseValue, warmups}) => (
                        window.__ai531ProductionValidation.captureComparisonAndCompare(
                            caseValue,
                            warmups
                        )
                    ),
                    {validationCase, warmups: warmupFrames}
                );
                await gameCanvas.screenshot({
                    path: comparisonCapturePath,
                    type: 'png'
                });
                const staticCityReceiverMask = await page.evaluate(
                    ({validationCase: caseValue}) => (
                        window.__ai531ProductionValidation.captureReceiverMask(
                            caseValue,
                            'staticCityReceiverMask'
                        )
                    ),
                    {validationCase}
                );
                const receiverMaskEvidenceBounds =
                    await receiverMaskEvidenceCanvas.boundingBox();
                if (!receiverMaskEvidenceBounds
                    || receiverMaskEvidenceBounds.width
                        !== PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS[0]
                    || receiverMaskEvidenceBounds.height
                        !== PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS[1]) {
                    throw new Error(
                        'Production receiver-mask evidence canvas must be exactly '
                        + '1280x720 CSS pixels: '
                        + JSON.stringify(receiverMaskEvidenceBounds)
                    );
                }
                await receiverMaskEvidenceCanvas.screenshot({
                    path: staticCityReceiverMaskCapturePath,
                    type: 'png'
                });
                const dynamicReceiverMask = await page.evaluate(
                    ({validationCase: caseValue}) => (
                        window.__ai531ProductionValidation.captureReceiverMask(
                            caseValue,
                            'dynamicReceiverMask'
                        )
                    ),
                    {validationCase}
                );
                await receiverMaskEvidenceCanvas.screenshot({
                    path: dynamicReceiverMaskCapturePath,
                    type: 'png'
                });
                await page.evaluate(({validationCase: caseValue}) => (
                    window.__ai531ProductionValidation.finishReceiverMaskEvidence(
                        caseValue
                    )
                ), {validationCase});
                if (staticCityReceiverMask.visibleReceiverPixelCount
                        !== comparison.metrics.eligibleStaticReceiverPixelCount
                    || dynamicReceiverMask.visibleReceiverPixelCount
                        !== comparison.metrics.dynamicReceiverMaskedPixelCount) {
                    throw new Error(
                        'Persisted receiver-mask captures differ from comparison metrics for '
                        + validationCase.id
                    );
                }
                const metricFailures = evaluateProductionCaseMetrics(comparison.metrics);
                const fallback = !isCacheActive(cache.diagnostics)
                    || !isCacheActive(comparison.diagnostics);
                const caseFailures = [
                    ...(fallback ? ['fallback'] : []),
                    ...evaluateProductionCasterTransition(
                        current.diagnostics,
                        cache.diagnostics,
                        comparison.diagnostics
                    ),
                    ...evaluateProductionDynamicBusState(
                        current.dynamicBus,
                        cache.dynamicBus,
                        comparison.dynamicBus
                    ),
                    ...evaluateProductionDynamicBusShadowProof(
                        comparison.dynamicBusShadowProof
                    ),
                    ...evaluateProductionShadowSubmission(
                        current.workload,
                        cache.workload,
                        comparison.workload
                    ),
                    ...metricFailures
                ];
                if (caseFailures.length > 0) {
                    failures.push(Object.freeze({
                        caseId: validationCase.id,
                        failures: caseFailures
                    }));
                }
                results.push(Object.freeze({
                    caseId: validationCase.id,
                    kind: validationCase.kind,
                    lightingProfileId: group.lightingProfileId,
                    coverageTags: validationCase.coverageTags,
                    camera: validationCase.camera,
                    sunProfile: validationCase.sunProfile,
                    metrics: comparison.metrics,
                    workload: Object.freeze({
                        current: current.workload,
                        cache: cache.workload,
                        comparison: comparison.workload,
                        timingContamination
                    }),
                    diagnostics: Object.freeze({
                        current: current.diagnostics,
                        cache: cache.diagnostics,
                        comparison: comparison.diagnostics
                    }),
                    dynamicBus: Object.freeze({
                        current: current.dynamicBus,
                        cache: cache.dynamicBus,
                        comparison: comparison.dynamicBus,
                        shadowProof: comparison.dynamicBusShadowProof
                    }),
                    captures: Object.freeze({
                        current: await createValidationCaptureRecord(
                            currentCapturePath,
                            {
                                authorityRoot: screenshotAuthorityRoot,
                                expectedDimensionsPixels:
                                    PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
                                repoRoot
                            }
                        ),
                        cache: await createValidationCaptureRecord(
                            cacheCapturePath,
                            {
                                authorityRoot: screenshotAuthorityRoot,
                                expectedDimensionsPixels:
                                    PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
                                repoRoot
                            }
                        ),
                        comparison: await createValidationCaptureRecord(
                            comparisonCapturePath,
                            {
                                authorityRoot: screenshotAuthorityRoot,
                                expectedDimensionsPixels:
                                    PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
                                repoRoot
                            }
                        ),
                        dynamicReceiverMask: await createValidationCaptureRecord(
                            dynamicReceiverMaskCapturePath,
                            {
                                authorityRoot: screenshotAuthorityRoot,
                                expectedDimensionsPixels:
                                    PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
                                repoRoot
                            }
                        ),
                        staticCityReceiverMask: await createValidationCaptureRecord(
                            staticCityReceiverMaskCapturePath,
                            {
                                authorityRoot: screenshotAuthorityRoot,
                                expectedDimensionsPixels:
                                    PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
                                repoRoot
                            }
                        )
                    }),
                    passed: caseFailures.length === 0
                }));
            }
        }

        await page.evaluate(async () => {
            await window.__ai531ProductionValidation?.dispose?.();
        });
        const tileBoundaryEvidence = createProductionTileBoundaryEvidence(results);
        if (!tileBoundaryEvidence.passed) {
            failures.push(Object.freeze({
                caseId: 'aggregate.tile_boundary_evidence',
                failures: Object.freeze(['tile_boundary_evidence_missing'])
            }));
        }
        const dynamicBusEvidence = createProductionDynamicBusEvidence(results);
        if (!dynamicBusEvidence.passed) {
            failures.push(Object.freeze({
                caseId: 'aggregate.dynamic_bus_evidence',
                failures: Object.freeze(['dynamic_bus_evidence_missing'])
            }));
        }
        const browserDiagnosticGate = freezeDeep({
            passed: browserDiagnostics.length === 0,
            diagnosticCount: browserDiagnostics.length
        });
        if (!browserDiagnosticGate.passed) {
            failures.push(Object.freeze({
                caseId: 'aggregate.browser_diagnostics',
                failures: Object.freeze(['browser_diagnostics'])
            }));
        }
        const captureAuthentication = await authenticateProductionValidationCaptureSet({
            authorityRoot: screenshotAuthorityRoot,
            cases: results,
            expectedCaseIds,
            expectedCaptureCount:
                expectedCaseCount
                * PRODUCTION_VALIDATION_CAPTURE_SLOTS.length,
            expectedDimensionsPixels:
                PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
            lstatFn: lstat,
            readFileFn: readFile,
            repoRoot
        });
        const sourceShadowTexelPhaseEvidence = plan.groups.map((group) => {
            const authenticatedPackage = authenticatedPackagesByProfile.get(
                group.lightingProfileId
            );
            const evidence = sourceShadowTexelPhaseEvidenceByProfile.get(
                group.lightingProfileId
            );
            if (!authenticatedPackage || !evidence) {
                throw new Error(
                    'Production phase evidence is missing an authenticated package binding for '
                    + group.lightingProfileId
                );
            }
            return freezeDeep({
                descriptorSha256: authenticatedPackage.descriptorSha256,
                evidence,
                lightingProfileId: group.lightingProfileId,
                packageAggregateSha256: authenticatedPackage.packageAggregateSha256,
                packagePath: authenticatedPackage.packagePath
            });
        });
        const report = {
            schema: depthPrecisionDiagnostic
                ? PRODUCTION_DEPTH_DIAGNOSTIC_VALIDATION_REPORT_SCHEMA
                : PRODUCTION_VALIDATION_REPORT_SCHEMA,
            generatedAt: new Date().toISOString(),
            status: failures.length === 0 ? 'passed' : 'failed',
            caseCount: results.length,
            expectedCaseCount,
            excludedLabCaseCount: plan.excludedLabCaseCount,
            ...(depthPrecisionDiagnostic ? {
                diagnosticEncoding:
                    'rgba8-rgb24-linear-depth-alpha-occupancy-diagnostic-v1',
                diagnosticProfileId: PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID,
                productionEligible: false
            } : {}),
            sameSessionPairing:
                'current_and_cache_rgba_indexeddb_then_current_difference_same_page_profile_group_v2',
            comparisonCondition:
                'current_difference_with_baked_resource_active_and_current_static_maps_retained_v1',
            thresholds: PRODUCTION_VALIDATION_THRESHOLDS,
            timingContamination,
            environment: {
                ...environment,
                browserVersion: await browser.version(),
                productionUrl: `${baseUrl}/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0`
            },
            packageIndex: artifactPath(packageIndexPath),
            profileGroups: plan.groups.map((group) => ({
                lightingProfileId: group.lightingProfileId,
                packagePath: group.package.packagePath,
                caseCount: group.cases.length,
                sourceShadowFilterIdentity:
                    sourceShadowFilterIdentityByProfile.get(group.lightingProfileId)
            })),
            sourceShadowTexelPhaseEvidence,
            tileBoundaryEvidence,
            dynamicBusEvidence,
            browserDiagnosticGate,
            browserDiagnostics,
            captureAuthentication,
            failures,
            cases: results
        };
        const reportPath = path.join(
            outputRoot,
            depthPrecisionDiagnostic
                ? 'depth_precision_diagnostic_validation_report.json'
                : 'production_validation_report.json'
        );
        await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        if (results.length !== expectedCaseCount) {
            throw new Error(
                `production validation completed ${results.length} of ${expectedCaseCount} cases`
            );
        }
        if (failures.length > 0) {
            throw new Error(
                `production validation failed ${failures.length} cases; report=${artifactPath(reportPath)}`
            );
        }
        return Object.freeze({reportPath, report});
    } finally {
        await browser?.close?.().catch(() => {});
        if (server && !server.killed) server.kill('SIGTERM');
    }
}

/** @param {any} page */
export async function installBrowserValidationRuntime(page) {
    return page.evaluate(async ({thresholds, capabilityProfileId}) => {
        const THREE = await import('three');
        const {StaticSunDepthPipeline} = await import(
            './src/graphics/illumination/static_sun_depth/index.js'
        );
        const {getGameplayPosePreset} = await import(
            './src/app/gameplay/GameplayPoseCatalog.js'
        );
        const {
            productionShadowLumaDarkeningByte,
            requireNonCityDynamicReceiverTarget,
            requireProductionDynamicReceiverRootScope
        } = await import('/tools/static_sun_depth/browser/ProductionReceiverScope.js');
        const {createProductionReceiverMaskPartition} = await import(
            '/tools/static_sun_depth/browser/ProductionReceiverMaskPartition.js'
        );
        const {createProductionLiveTexelPhaseEvidence} = await import(
            '/tools/static_sun_depth/browser/ProductionTexelPhase.js'
        );
        const {engine, sm} = window.__busSim;
        const state = sm.current;
        const city = state.city;
        const renderer = engine.renderer;
        const gl = renderer.getContext();
        engine.stop();
        state.gameLoop?.pause?.();
        state._updateChaseCamera = () => {};
        engine.setViewportSize(1280, 720);
        renderer.setPixelRatio(1);
        renderer.setSize(1280, 720, false);
        engine.camera.aspect = 1280 / 720;
        engine.camera.updateProjectionMatrix();
        const receiverMaskEvidenceCanvas = document.createElement('canvas');
        receiverMaskEvidenceCanvas.id = 'ai531-production-receiver-mask-evidence';
        receiverMaskEvidenceCanvas.width = 1280;
        receiverMaskEvidenceCanvas.height = 720;
        receiverMaskEvidenceCanvas.style.cssText = [
            'background:#000',
            'display:none',
            'height:720px',
            'left:0',
            'pointer-events:none',
            'position:fixed',
            'top:24px',
            'width:1280px',
            'z-index:2147483647'
        ].join(';');
        document.body.append(receiverMaskEvidenceCanvas);
        const receiverMaskEvidenceContext = receiverMaskEvidenceCanvas.getContext(
            '2d',
            {alpha: false}
        );
        if (!receiverMaskEvidenceContext) {
            throw new Error('Production receiver-mask evidence canvas has no 2D context');
        }

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const hardware = {
            gpu: debugInfo
                ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
                : gl.getParameter(gl.RENDERER),
            maximumTextureSizeTexels: renderer.capabilities.maxTextureSize,
            rendererSize: [gl.drawingBufferWidth, gl.drawingBufferHeight],
            rendererPixelRatio: renderer.getPixelRatio(),
            webglVersion: gl.getParameter(gl.VERSION)
        };
        let pipeline = null;
        let preparedProfile = null;
        let preparedLiveSourceShadowOracle = null;
        let activeWorkload = null;
        let currentPass = 'visible_scene';
        let pendingReceiverMaskEvidence = null;
        let directRenderForDiagnostics = false;
        const originalRenderBufferDirect = renderer.renderBufferDirect;
        const originalShadowRender = renderer.shadowMap.render;

        function counters() {
            const value = renderer.info.render;
            return {
                calls: Number(value.calls || 0),
                triangles: Number(value.triangles || 0),
                lines: Number(value.lines || 0),
                points: Number(value.points || 0)
            };
        }

        function add(target, delta) {
            for (const key of ['calls', 'triangles', 'lines', 'points']) {
                target[key] += delta[key];
            }
        }

        function isDescendantOf(object, ancestor) {
            for (let cursor = object; cursor; cursor = cursor.parent) {
                if (cursor === ancestor) return true;
            }
            return false;
        }

        renderer.renderBufferDirect = function ai531ProfiledRenderBufferDirect(
            camera,
            scene,
            geometry,
            material,
            object,
            group
        ) {
            const before = counters();
            const result = originalRenderBufferDirect.call(
                this,
                camera,
                scene,
                geometry,
                material,
                object,
                group
            );
            if (activeWorkload) {
                const after = counters();
                const delta = {
                    calls: after.calls - before.calls,
                    triangles: after.triangles - before.triangles,
                    lines: after.lines - before.lines,
                    points: after.points - before.points
                };
                add(activeWorkload.total, delta);
                if (currentPass === 'shadow_maps') {
                    add(activeWorkload.shadow, delta);
                    if (isDescendantOf(object, city.group)) {
                        add(activeWorkload.staticCityShadow, delta);
                    }
                    if (isDescendantOf(object, state.busAnchor)) {
                        add(activeWorkload.dynamicBusShadow, delta);
                    }
                }
            }
            return result;
        };
        renderer.shadowMap.render = function ai531ProfiledShadowRender(...args) {
            const previous = currentPass;
            currentPass = 'shadow_maps';
            try {
                return originalShadowRender.apply(this, args);
            } finally {
                currentPass = previous;
            }
        };

        function freshWorkload() {
            return {
                total: {calls: 0, triangles: 0, lines: 0, points: 0},
                shadow: {calls: 0, triangles: 0, lines: 0, points: 0},
                staticCityShadow: {calls: 0, triangles: 0, lines: 0, points: 0},
                dynamicBusShadow: {calls: 0, triangles: 0, lines: 0, points: 0},
                frameMs: 0
            };
        }

        function dynamicBusState() {
            const busRoot = state.busAnchor;
            const registeredRoots = city._extraShadowRoots;
            const scope = requireProductionDynamicReceiverRootScope(
                registeredRoots,
                city.group,
                busRoot
            );
            let meshCount = 0;
            let casterMeshCount = 0;
            let receiverMeshCount = 0;
            busRoot.traverse((object) => {
                if (!object?.isMesh) return;
                meshCount += 1;
                if (object.castShadow === true) casterMeshCount += 1;
                if (object.receiveShadow === true) receiverMeshCount += 1;
            });
            if (meshCount < 1 || casterMeshCount < 1 || receiverMeshCount < 1) {
                throw new Error('Dynamic bus must own positive mesh, caster, and receiver inventories');
            }
            return {
                method: 'registered_bus_anchor_outside_static_city_v1',
                rootOutsideStaticCity: true,
                registeredDynamicReceiver: true,
                registeredDynamicRootCount: scope.registeredDynamicRootCount,
                meshCount,
                casterMeshCount,
                receiverMeshCount
            };
        }

        function staticShadowState() {
            let cityMeshCount = 0;
            let enabledCityCasterMeshCount = 0;
            city.group.traverse((object) => {
                if (!object?.isMesh) return;
                cityMeshCount += 1;
                if (object.castShadow === true) enabledCityCasterMeshCount += 1;
            });
            const culler = city._shadowCuller ?? null;
            const cascadeLights = Array.isArray(city._csm?.csm?.lights)
                ? city._csm.csm.lights : [];
            const describeShadowLight = (light) => light ? ({
                position: light.position?.toArray?.() ?? null,
                targetPosition: light.target?.position?.toArray?.() ?? null,
                autoUpdate: light.shadow?.autoUpdate ?? null,
                cameraMatrixWorld: light.shadow?.camera?.matrixWorld?.elements
                    ? Array.from(light.shadow.camera.matrixWorld.elements) : null,
                cameraProjectionMatrix: light.shadow?.camera?.projectionMatrix?.elements
                    ? Array.from(light.shadow.camera.projectionMatrix.elements) : null,
                mapTextureVersion: light.shadow?.map?.texture?.version ?? null,
                needsUpdate: light.shadow?.needsUpdate ?? null,
                shadowMatrix: light.shadow?.matrix?.elements
                    ? Array.from(light.shadow.matrix.elements) : null
            }) : null;
            return {
                cityMeshCount,
                enabledCityCasterMeshCount,
                culler: culler ? {
                    active: culler._active === true,
                    indexedCasterMeshCount: Array.isArray(culler._entries)
                        ? culler._entries.length : null,
                    indexedRootCount: culler._roots?.size ?? null,
                    stats: {...culler.stats}
                } : null,
                rendererShadowMap: {
                    autoUpdate: renderer.shadowMap.autoUpdate,
                    enabled: renderer.shadowMap.enabled,
                    needsUpdate: renderer.shadowMap.needsUpdate
                },
                postProcessing: engine._post?.pipeline?.getDebugInfo?.() ?? null,
                primarySun: describeShadowLight(city.sun),
                cascades: cascadeLights.map(describeShadowLight)
            };
        }

        function applyCase(validationCase) {
            const sun = validationCase.sunProfile;
            engine.setAtmosphereSettings({
                ...engine.atmosphereSettings,
                sun: {
                    ...engine.atmosphereSettings?.sun,
                    azimuthDeg: sun.azimuthDeg,
                    elevationDeg: sun.elevationDeg
                }
            });
            if (validationCase.kind === 'gameplay_named_pose') {
                const preset = getGameplayPosePreset(validationCase.namedPoseId);
                if (!preset?.pose?.camera) {
                    throw new Error(`Missing named camera pose '${validationCase.namedPoseId}'`);
                }
                const camera = preset.pose.camera;
                engine.camera.position.set(
                    camera.position.x,
                    camera.position.y,
                    camera.position.z
                );
                engine.camera.lookAt(camera.target.x, camera.target.y, camera.target.z);
                engine.camera.fov = camera.fovDeg;
            } else {
                const coordinates = validationCase.worldCoordinatesMeters;
                const camera = validationCase.camera;
                const direction = camera.viewVector;
                const pitch = THREE.MathUtils.degToRad(camera.profile.pitchDeg);
                const horizontal = Math.cos(pitch) * 20;
                engine.camera.position.set(
                    coordinates.x,
                    camera.profile.heightMeters,
                    coordinates.z
                );
                engine.camera.lookAt(
                    coordinates.x + direction.x * horizontal,
                    camera.profile.heightMeters + Math.sin(pitch) * 20,
                    coordinates.z + direction.z * horizontal
                );
                engine.camera.fov = camera.profile.fovDeg;
            }
            engine.camera.updateProjectionMatrix();
            engine.camera.updateMatrixWorld(true);
            city.update(engine);
            const azimuth = THREE.MathUtils.degToRad(sun.azimuthDeg);
            const elevation = THREE.MathUtils.degToRad(sun.elevationDeg);
            const horizontal = Math.cos(elevation);
            const expected = new THREE.Vector3(
                Math.cos(azimuth) * horizontal,
                Math.sin(elevation),
                Math.sin(azimuth) * horizontal
            );
            if (city.sunRef.direction.distanceTo(expected) > 1e-8) {
                throw new Error(`Sun direction drift for '${validationCase.id}'`);
            }
        }

        function renderUnmeasuredFrames(count) {
            for (let index = 0; index < count; index += 1) {
                city.update(engine);
                renderValidationFrame();
                gl.finish();
            }
        }

        function resetValidationTemporalHistory() {
            const post = engine._post?.pipeline ?? null;
            post?.taaPass?.resetHistory?.();
            if (post && '_taaJitterIndex' in post) post._taaJitterIndex = 0;
            post?._invalidateGtaoCache?.({resetFrameIndex: true});
            // Camera teleports must not inherit the previous pose's slowly
            // decaying flare/ray visibility; it otherwise appears as a cache
            // brightness error even when both shadow paths are identical.
            for (const rig of [city.sunFlare, city.sunRays]) {
                if (Number.isFinite(rig?._visibility)) rig._visibility = 0;
            }
        }

        function renderValidationFrame() {
            if (!directRenderForDiagnostics || !engine._post?.pipeline) {
                engine.renderFrame();
                return;
            }
            const post = engine._post.pipeline;
            engine._post.pipeline = null;
            try {
                engine.renderFrame();
            } finally {
                engine._post.pipeline = post;
            }
        }

        function renderMeasuredFrame() {
            const workload = freshWorkload();
            const started = performance.now();
            activeWorkload = workload;
            try {
                city.update(engine);
                renderValidationFrame();
                gl.finish();
            } finally {
                activeWorkload = null;
            }
            workload.frameMs = performance.now() - started;
            return workload;
        }

        function captureRgba() {
            const width = gl.drawingBufferWidth;
            const height = gl.drawingBufferHeight;
            const pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return {width, height, pixels};
        }

        function writeReceiverMaskEvidenceCanvas(capture) {
            if (capture.width !== receiverMaskEvidenceCanvas.width
                || capture.height !== receiverMaskEvidenceCanvas.height) {
                throw new Error('Receiver-mask evidence dimensions differ from its canvas');
            }
            const image = receiverMaskEvidenceContext.createImageData(
                capture.width,
                capture.height
            );
            const rowByteLength = capture.width * 4;
            for (let targetY = 0; targetY < capture.height; targetY += 1) {
                const sourceY = capture.height - 1 - targetY;
                const sourceOffset = sourceY * rowByteLength;
                image.data.set(
                    capture.pixels.subarray(sourceOffset, sourceOffset + rowByteLength),
                    targetY * rowByteLength
                );
            }
            receiverMaskEvidenceContext.putImageData(image, 0, 0);
            receiverMaskEvidenceCanvas.style.display = 'block';
        }

        function captureVisibleReceiverIdentityMask(roots, rejectCityTargets = false) {
            if (!Array.isArray(roots) || roots.length < 1
                || roots.some((root) => !root?.traverse)) {
                throw new Error('Receiver identity mask requires positive Object3D roots');
            }
            const scene = engine.scene;
            const targetMeshes = new Set();
            const layerSnapshots = [];
            scene.traverse((object) => {
                if (object?.layers) layerSnapshots.push([object, object.layers.mask]);
                if (object?.isMesh
                    && object.receiveShadow === true
                    && roots.some((root) => isDescendantOf(object, root))) {
                    if (rejectCityTargets) {
                        requireNonCityDynamicReceiverTarget(object, city.group);
                    }
                    targetMeshes.add(object);
                }
            });
            if (targetMeshes.size < 1) {
                throw new Error('Receiver identity mask resolved no receiveShadow meshes');
            }
            const identityLayerMask = 1 << 30;
            const previous = {
                autoClear: renderer.autoClear,
                background: scene.background,
                cameraLayerMask: engine.camera.layers.mask,
                clearAlpha: renderer.getClearAlpha(),
                clearColor: renderer.getClearColor(new THREE.Color()).clone(),
                overrideMaterial: scene.overrideMaterial,
                renderTarget: renderer.getRenderTarget(),
                shadowEnabled: renderer.shadowMap.enabled
            };
            const black = new THREE.MeshBasicMaterial({
                color: 0x000000,
                depthTest: true,
                depthWrite: true,
                side: THREE.FrontSide,
                toneMapped: false
            });
            const white = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                depthFunc: THREE.LessEqualDepth,
                depthTest: true,
                depthWrite: false,
                side: THREE.FrontSide,
                toneMapped: false
            });
            try {
                renderer.setRenderTarget(null);
                renderer.autoClear = true;
                renderer.shadowMap.enabled = false;
                renderer.setClearColor(0x000000, 1);
                scene.background = null;
                scene.overrideMaterial = black;
                renderer.clear(true, true, true);
                renderer.render(scene, engine.camera);
                for (const [object] of layerSnapshots) {
                    object.layers.mask = targetMeshes.has(object) ? identityLayerMask : 0;
                }
                engine.camera.layers.mask = identityLayerMask;
                scene.overrideMaterial = white;
                renderer.autoClear = false;
                renderer.render(scene, engine.camera);
                gl.finish();
                return {
                    capture: captureRgba(),
                    receiverMeshCount: targetMeshes.size
                };
            } finally {
                for (const [object, mask] of layerSnapshots) object.layers.mask = mask;
                engine.camera.layers.mask = previous.cameraLayerMask;
                renderer.autoClear = previous.autoClear;
                renderer.shadowMap.enabled = previous.shadowEnabled;
                renderer.shadowMap.needsUpdate = true;
                renderer.setClearColor(previous.clearColor, previous.clearAlpha);
                scene.background = previous.background;
                scene.overrideMaterial = previous.overrideMaterial;
                renderer.setRenderTarget(previous.renderTarget);
                black.dispose();
                white.dispose();
            }
        }

        function captureDynamicReceiverMask() {
            requireProductionDynamicReceiverRootScope(
                city._extraShadowRoots,
                city.group,
                state.busAnchor
            );
            return captureVisibleReceiverIdentityMask([state.busAnchor], true);
        }

        function captureDirectVisibleScene() {
            const previousTarget = renderer.getRenderTarget();
            const previousAutoClear = renderer.autoClear;
            try {
                renderer.setRenderTarget(null);
                renderer.autoClear = true;
                renderer.shadowMap.needsUpdate = true;
                city.update(engine);
                renderer.render(engine.scene, engine.camera);
                gl.finish();
                return captureRgba();
            } finally {
                renderer.autoClear = previousAutoClear;
                renderer.setRenderTarget(previousTarget);
            }
        }

        function dynamicBusShadowProof(dynamicReceiverMask, staticCityReceiverMask) {
            const busRoot = state.busAnchor;
            const casterMeshes = [];
            busRoot.traverse((object) => {
                if (object?.isMesh && object.castShadow === true) casterMeshes.push(object);
            });
            if (casterMeshes.length < 1) {
                throw new Error('Dynamic bus has no enabled live shadow caster');
            }
            const enabled = captureDirectVisibleScene();
            let disabled;
            try {
                for (const mesh of casterMeshes) mesh.castShadow = false;
                disabled = captureDirectVisibleScene();
            } finally {
                for (const mesh of casterMeshes) mesh.castShadow = true;
                renderer.shadowMap.needsUpdate = true;
            }
            if (enabled.width !== disabled.width || enabled.height !== disabled.height
                || enabled.width !== dynamicReceiverMask.width
                || enabled.height !== dynamicReceiverMask.height
                || enabled.width !== staticCityReceiverMask.width
                || enabled.height !== staticCityReceiverMask.height) {
                throw new Error('Dynamic bus shadow proof capture dimensions differ');
            }
            let staticCityReceiverPixelCount = 0;
            let affectedStaticCityReceiverPixelCount = 0;
            let brightenedStaticCityReceiverPixelCount = 0;
            let maximumLumaDarkeningByte = 0;
            let maximumLumaBrighteningByte = 0;
            const pixelCount = enabled.width * enabled.height;
            for (let pixel = 0; pixel < pixelCount; pixel += 1) {
                const offset = pixel * 4;
                const onDynamicReceiver = dynamicReceiverMask.pixels[offset] > 0
                    || dynamicReceiverMask.pixels[offset + 1] > 0
                    || dynamicReceiverMask.pixels[offset + 2] > 0;
                const onStaticCityReceiver = staticCityReceiverMask.pixels[offset] > 0
                    || staticCityReceiverMask.pixels[offset + 1] > 0
                    || staticCityReceiverMask.pixels[offset + 2] > 0;
                if (onDynamicReceiver || !onStaticCityReceiver) continue;
                staticCityReceiverPixelCount += 1;
                const signedDarkening = productionShadowLumaDarkeningByte(
                    enabled.pixels,
                    disabled.pixels,
                    offset
                );
                const darkening = Math.max(0, signedDarkening);
                const brightening = Math.max(0, -signedDarkening);
                maximumLumaDarkeningByte = Math.max(maximumLumaDarkeningByte, darkening);
                maximumLumaBrighteningByte = Math.max(maximumLumaBrighteningByte, brightening);
                if (darkening > thresholds.falseLitToleranceByte) {
                    affectedStaticCityReceiverPixelCount += 1;
                }
                if (brightening > thresholds.falseLitToleranceByte) {
                    brightenedStaticCityReceiverPixelCount += 1;
                }
            }
            return {
                method:
                    'bus_cast_shadow_enabled_luma_darker_than_disabled_over_visible_city_receivers_v2',
                cityReceiverMaskMethod: 'visible_city_receiver_identity_depth_equality_v1',
                busCasterMeshCount: casterMeshes.length,
                restoredCasterMeshCount: dynamicBusState().casterMeshCount,
                staticCityReceiverPixelCount,
                affectedStaticCityReceiverPixelCount,
                brightenedStaticCityReceiverPixelCount,
                maximumLumaDarkeningByte,
                maximumLumaBrighteningByte
            };
        }

        function openCaptureDatabase() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('ai531-production-validation-v1', 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains('currentRgba')) {
                        db.createObjectStore('currentRgba');
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async function withStore(mode, operation) {
            const db = await openCaptureDatabase();
            try {
                return await new Promise((resolve, reject) => {
                    const transaction = db.transaction('currentRgba', mode);
                    const store = transaction.objectStore('currentRgba');
                    let result;
                    try {
                        result = operation(store);
                    } catch (error) {
                        reject(error);
                        return;
                    }
                    transaction.oncomplete = () => resolve(result?.result ?? result);
                    transaction.onerror = () => reject(transaction.error);
                    transaction.onabort = () => reject(transaction.error);
                });
            } finally {
                db.close();
            }
        }

        async function putCurrent(caseId, capture) {
            const existing = await getCurrent(caseId);
            return withStore('readwrite', (store) => store.put({
                ...(existing?.cachePixels ? {
                    cacheHeight: existing.cacheHeight,
                    cachePixels: existing.cachePixels,
                    cacheWidth: existing.cacheWidth
                } : {}),
                width: capture.width,
                height: capture.height,
                pixels: capture.pixels.buffer
            }, caseId));
        }

        function getCurrent(caseId) {
            return withStore('readonly', (store) => store.get(caseId));
        }

        async function putCache(caseId, capture) {
            const current = await getCurrent(caseId);
            return withStore('readwrite', (store) => store.put({
                ...(current?.pixels ? current : {}),
                cacheWidth: capture.width,
                cacheHeight: capture.height,
                cachePixels: capture.pixels.buffer
            }, caseId));
        }

        function deleteCurrent(caseId) {
            return withStore('readwrite', (store) => store.delete(caseId));
        }

        function clearCurrents() {
            return withStore('readwrite', (store) => store.clear());
        }

        function compareRgba(
            current,
            cache,
            seam,
            signedVisibility,
            dynamicReceiverMask,
            staticCityReceiverMask,
            collectMissingOccluderCandidates = false,
            mismatchCandidateDirection = 'cache_brighter',
            targetPixel = null
        ) {
            if (typeof collectMissingOccluderCandidates !== 'boolean') {
                throw new TypeError('missing-occluder collection flag must be boolean');
            }
            if (mismatchCandidateDirection !== 'cache_brighter'
                && mismatchCandidateDirection !== 'cache_darker') {
                throw new TypeError('mismatch candidate direction is unsupported');
            }
            if (current.width !== cache.width || current.height !== cache.height
                || current.width !== seam.width || current.height !== seam.height
                || current.width !== signedVisibility.width
                || current.height !== signedVisibility.height
                || current.width !== dynamicReceiverMask.width
                || current.height !== dynamicReceiverMask.height
                || current.width !== staticCityReceiverMask.width
                || current.height !== staticCityReceiverMask.height) {
                throw new Error(
                    'Current, cache, seam, signed visibility, and receiver-mask captures differ'
                );
            }
            const width = current.width;
            const height = current.height;
            if (targetPixel && (targetPixel[0] >= width || targetPixel[1] >= height)) {
                throw new RangeError('mismatch target pixel is outside the framebuffer');
            }
            const pixelCount = width * height;
            const eligible = new Uint8Array(pixelCount);
            const currentLuma = new Float32Array(pixelCount);
            const cacheLumaValues = new Float32Array(pixelCount);
            const horizontalMax = new Float32Array(pixelCount);
            const neighborhoodMax = new Float32Array(pixelCount);
            const cacheHorizontalMax = new Float32Array(pixelCount);
            const cacheNeighborhoodMax = new Float32Array(pixelCount);
            let rawSamePixelAbsoluteRgbError = 0;
            let rawSamePixelMaxRgbErrorByte = 0;
            let maximumRgbErrorPixel = null;
            let rawSamePixelPixelsOverFourByte = 0;
            let dynamicReceiverMaskedPixelCount = 0;
            let eligibleStaticReceiverPixelCount = 0;
            let outsideStaticReceiverPixelCount = 0;
            for (let pixel = 0; pixel < pixelCount; pixel += 1) {
                const offset = pixel * 4;
                const onDynamicReceiver = dynamicReceiverMask.pixels[offset] > 0
                    || dynamicReceiverMask.pixels[offset + 1] > 0
                    || dynamicReceiverMask.pixels[offset + 2] > 0;
                const onStaticCityReceiver = staticCityReceiverMask.pixels[offset] > 0
                    || staticCityReceiverMask.pixels[offset + 1] > 0
                    || staticCityReceiverMask.pixels[offset + 2] > 0;
                if (onDynamicReceiver && onStaticCityReceiver) {
                    throw new Error('Visible static and dynamic receiver identity masks overlap');
                }
                if (onDynamicReceiver) {
                    dynamicReceiverMaskedPixelCount += 1;
                    currentLuma[pixel] = Number.NEGATIVE_INFINITY;
                    cacheLumaValues[pixel] = Number.NEGATIVE_INFINITY;
                    continue;
                }
                if (!onStaticCityReceiver) {
                    outsideStaticReceiverPixelCount += 1;
                    currentLuma[pixel] = Number.NEGATIVE_INFINITY;
                    cacheLumaValues[pixel] = Number.NEGATIVE_INFINITY;
                    continue;
                }
                eligible[pixel] = 1;
                eligibleStaticReceiverPixelCount += 1;
                currentLuma[pixel] = current.pixels[offset] * 0.2126
                    + current.pixels[offset + 1] * 0.7152
                    + current.pixels[offset + 2] * 0.0722;
                cacheLumaValues[pixel] = cache.pixels[offset] * 0.2126
                    + cache.pixels[offset + 1] * 0.7152
                    + cache.pixels[offset + 2] * 0.0722;
                let pixelMax = 0;
                for (let channel = 0; channel < 3; channel += 1) {
                    const difference = Math.abs(
                        current.pixels[offset + channel] - cache.pixels[offset + channel]
                    );
                    rawSamePixelAbsoluteRgbError += difference;
                    pixelMax = Math.max(pixelMax, difference);
                    if (difference > rawSamePixelMaxRgbErrorByte) {
                        rawSamePixelMaxRgbErrorByte = difference;
                        maximumRgbErrorPixel = [pixel % width, Math.floor(pixel / width)];
                    }
                }
                if (pixelMax > 4) rawSamePixelPixelsOverFourByte += 1;
            }
            for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                    const index = y * width + x;
                    if (!eligible[index]) {
                        horizontalMax[index] = Number.NEGATIVE_INFINITY;
                        cacheHorizontalMax[index] = Number.NEGATIVE_INFINITY;
                        continue;
                    }
                    horizontalMax[index] = Math.max(
                        currentLuma[y * width + Math.max(0, x - 1)],
                        currentLuma[index],
                        currentLuma[y * width + Math.min(width - 1, x + 1)]
                    );
                    cacheHorizontalMax[index] = Math.max(
                        cacheLumaValues[y * width + Math.max(0, x - 1)],
                        cacheLumaValues[index],
                        cacheLumaValues[y * width + Math.min(width - 1, x + 1)]
                    );
                }
            }
            for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                    const index = y * width + x;
                    if (!eligible[index]) {
                        neighborhoodMax[index] = Number.NEGATIVE_INFINITY;
                        continue;
                    }
                    neighborhoodMax[index] = Math.max(
                        horizontalMax[Math.max(0, y - 1) * width + x],
                        horizontalMax[index],
                        horizontalMax[Math.min(height - 1, y + 1) * width + x]
                    );
                    cacheNeighborhoodMax[index] = Math.max(
                        cacheHorizontalMax[Math.max(0, y - 1) * width + x],
                        cacheHorizontalMax[index],
                        cacheHorizontalMax[Math.min(height - 1, y + 1) * width + x]
                    );
                }
            }
            let absoluteRgbError = 0;
            let maxRgbErrorByte = 0;
            let pixelsOverFourByte = 0;
            for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                    const pixel = y * width + x;
                    if (!eligible[pixel]) continue;
                    const cacheOffset = pixel * 4;
                    let bestMaximumDifference = Number.POSITIVE_INFINITY;
                    let bestAbsoluteDifference = Number.POSITIVE_INFINITY;
                    for (let currentY = Math.max(0, y - 1);
                        currentY <= Math.min(height - 1, y + 1);
                        currentY += 1) {
                        for (let currentX = Math.max(0, x - 1);
                            currentX <= Math.min(width - 1, x + 1);
                            currentX += 1) {
                            const currentPixel = currentY * width + currentX;
                            if (!eligible[currentPixel]) continue;
                            const currentOffset = currentPixel * 4;
                            const redDifference = Math.abs(
                                current.pixels[currentOffset] - cache.pixels[cacheOffset]
                            );
                            const greenDifference = Math.abs(
                                current.pixels[currentOffset + 1] - cache.pixels[cacheOffset + 1]
                            );
                            const blueDifference = Math.abs(
                                current.pixels[currentOffset + 2] - cache.pixels[cacheOffset + 2]
                            );
                            const maximumDifference = Math.max(
                                redDifference,
                                greenDifference,
                                blueDifference
                            );
                            const absoluteDifference = redDifference
                                + greenDifference + blueDifference;
                            if (maximumDifference < bestMaximumDifference
                                || (maximumDifference === bestMaximumDifference
                                    && absoluteDifference < bestAbsoluteDifference)) {
                                bestMaximumDifference = maximumDifference;
                                bestAbsoluteDifference = absoluteDifference;
                            }
                        }
                    }
                    if (!Number.isFinite(bestMaximumDifference)
                        || !Number.isFinite(bestAbsoluteDifference)) {
                        throw new Error(
                            'Eligible RGB comparison pixel has no eligible current neighbor'
                        );
                    }
                    absoluteRgbError += bestAbsoluteDifference;
                    maxRgbErrorByte = Math.max(maxRgbErrorByte, bestMaximumDifference);
                    if (bestMaximumDifference > 4) pixelsOverFourByte += 1;
                }
            }
            const falseLit = new Uint8Array(pixelCount);
            const seamError = new Uint8Array(pixelCount);
            let missingOccluderPixelCount = 0;
            let seamPixelCount = 0;
            let seamErrorPixelCount = 0;
            let seamFalseLitPixelCount = 0;
            const missingOccluderCandidates = collectMissingOccluderCandidates
                ? [] : null;
            for (let pixel = 0; pixel < pixelCount; pixel += 1) {
                if (!eligible[pixel]) continue;
                const offset = pixel * 4;
                const cacheLuma = cache.pixels[offset] * 0.2126
                    + cache.pixels[offset + 1] * 0.7152
                    + cache.pixels[offset + 2] * 0.0722;
                const signedVisibilityFalseLit =
                    signedVisibility.pixels[offset]
                        > signedVisibility.pixels[offset + 2]
                            + thresholds.falseLitToleranceByte;
                if (signedVisibilityFalseLit
                    && cacheLuma
                        > neighborhoodMax[pixel] + thresholds.falseLitToleranceByte) {
                    falseLit[pixel] = 1;
                    missingOccluderPixelCount += 1;
                    if (missingOccluderCandidates
                        && mismatchCandidateDirection === 'cache_brighter') {
                        const offset = pixel * 4;
                        missingOccluderCandidates.push(Object.freeze({
                            pixel: Object.freeze([
                                pixel % width,
                                Math.floor(pixel / width)
                            ]),
                            cacheLuma,
                            cacheRgba: Object.freeze(Array.from(
                                cache.pixels.subarray(offset, offset + 4)
                            )),
                            currentNeighborhoodMaximumLuma: neighborhoodMax[pixel],
                            currentRgba: Object.freeze(Array.from(
                                current.pixels.subarray(offset, offset + 4)
                            ))
                        }));
                    }
                }
                if (missingOccluderCandidates
                    && mismatchCandidateDirection === 'cache_darker') {
                    const signedVisibilityExtraDark =
                        signedVisibility.pixels[offset + 2]
                            > signedVisibility.pixels[offset]
                                + thresholds.falseLitToleranceByte;
                    if (signedVisibilityExtraDark
                        && currentLuma[pixel]
                            > cacheNeighborhoodMax[pixel]
                                + thresholds.falseLitToleranceByte) {
                        missingOccluderCandidates.push(Object.freeze({
                            pixel: Object.freeze([
                                pixel % width,
                                Math.floor(pixel / width)
                            ]),
                            cacheLuma,
                            cacheRgba: Object.freeze(Array.from(
                                cache.pixels.subarray(offset, offset + 4)
                            )),
                            currentNeighborhoodMaximumLuma: currentLuma[pixel],
                            currentRgba: Object.freeze(Array.from(
                                current.pixels.subarray(offset, offset + 4)
                            ))
                        }));
                    }
                }
                const onSeam = seam.pixels[offset] > seam.pixels[offset + 2] + 32;
                if (!onSeam) continue;
                seamPixelCount += 1;
                const maximumDifference = Math.max(
                    Math.abs(current.pixels[offset] - cache.pixels[offset]),
                    Math.abs(current.pixels[offset + 1] - cache.pixels[offset + 1]),
                    Math.abs(current.pixels[offset + 2] - cache.pixels[offset + 2])
                );
                if (maximumDifference > thresholds.seamErrorToleranceByte) {
                    seamError[pixel] = 1;
                    seamErrorPixelCount += 1;
                }
                if (falseLit[pixel]) seamFalseLitPixelCount += 1;
            }
            let maxContinuousSeamRunPixels = 0;
            for (let y = 0; y < height; y += 1) {
                let run = 0;
                for (let x = 0; x < width; x += 1) {
                    run = seamError[y * width + x] ? run + 1 : 0;
                    maxContinuousSeamRunPixels = Math.max(maxContinuousSeamRunPixels, run);
                }
            }
            for (let x = 0; x < width; x += 1) {
                let run = 0;
                for (let y = 0; y < height; y += 1) {
                    run = seamError[y * width + x] ? run + 1 : 0;
                    maxContinuousSeamRunPixels = Math.max(maxContinuousSeamRunPixels, run);
                }
            }
            if (missingOccluderCandidates && targetPixel
                && !missingOccluderCandidates.some((entry) => (
                    entry.pixel[0] === targetPixel[0] && entry.pixel[1] === targetPixel[1]
                ))) {
                const pixel = targetPixel[1] * width + targetPixel[0];
                const offset = pixel * 4;
                missingOccluderCandidates.push(Object.freeze({
                    pixel: Object.freeze([...targetPixel]),
                    cacheLuma: cacheLumaValues[pixel],
                    cacheRgba: Object.freeze(Array.from(cache.pixels.subarray(offset, offset + 4))),
                    currentNeighborhoodMaximumLuma: neighborhoodMax[pixel],
                    currentRgba: Object.freeze(Array.from(current.pixels.subarray(offset, offset + 4)))
                }));
            }
            if (eligibleStaticReceiverPixelCount < 1) {
                throw new Error('Static City receiver mask resolved no visible framebuffer pixel');
            }
            if (eligibleStaticReceiverPixelCount
                + dynamicReceiverMaskedPixelCount
                + outsideStaticReceiverPixelCount !== pixelCount) {
                throw new Error('Static, dynamic, and outside receiver masks do not partition the framebuffer');
            }
            const metrics = {
                width,
                height,
                pixelCount,
                eligibleStaticReceiverPixelCount,
                dynamicReceiverMaskedPixelCount,
                outsideStaticReceiverPixelCount,
                meanRgbErrorByte: absoluteRgbError / (eligibleStaticReceiverPixelCount * 3),
                maxRgbErrorByte,
                pixelsOverFourByte,
                pixelsOverFourBytePercent:
                    pixelsOverFourByte / eligibleStaticReceiverPixelCount * 100,
                rgbErrorMethod: 'nearest_eligible_current_3x3_rgb_chebyshev_v1',
                rawSamePixelMeanRgbErrorByte:
                    rawSamePixelAbsoluteRgbError / (eligibleStaticReceiverPixelCount * 3),
                rawSamePixelMaxRgbErrorByte,
                rawSamePixelPixelsOverFourByte,
                rawSamePixelPixelsOverFourBytePercent:
                    rawSamePixelPixelsOverFourByte
                        / eligibleStaticReceiverPixelCount * 100,
                rawSamePixelRgbErrorMethod: 'same_pixel_rgb_chebyshev_v1',
                missingOccluderPixelCount,
                seamPixelCount,
                seamErrorPixelCount,
                seamFalseLitPixelCount,
                maxContinuousSeamRunPixels,
                falseLitMethod:
                    'cache_luma_gt_eligible_current_3x3_max_plus_4_and_same_frame_cache_visibility_gt_live_v3',
                seamMaskMethod: 'static_sun_depth_seam_debug_red_gt_blue_plus_32_v1',
                staticReceiverMaskMethod:
                    'visible_static_city_receivers_excluding_registered_dynamic_receivers_depth_equality_v2'
            };
            return missingOccluderCandidates
                ? {metrics, maximumRgbErrorPixel, missingOccluderCandidates}
                : metrics;
        }

        function readPreparedLiveSourceShadowFilterIdentity() {
            const light = city.sun;
            const shadow = light?.shadow;
            const camera = shadow?.camera;
            if (!light?.isDirectionalLight || city._csm || !light.visible
                || !light.castShadow || !shadow || !camera || !shadow.map) {
                throw new Error('Prepared profile has no allocated single directional shadow map');
            }
            light.updateMatrixWorld(true);
            light.target.updateMatrixWorld(true);
            shadow.updateMatrices(light);
            camera.updateMatrixWorld(true);
            if (renderer.shadowMap.type !== THREE.PCFShadowMap) {
                throw new Error('Prepared profile does not use Three r183 PCFShadowMap');
            }
            const matrix = camera.matrixWorld.elements;
            const clean = (value) => Object.is(value, -0) ? 0 : value;
            const mapSizeTexels = [shadow.map.width, shadow.map.height];
            if (shadow.mapSize.x !== mapSizeTexels[0]
                || shadow.mapSize.y !== mapSizeTexels[1]
                || renderer.capabilities.maxTextureSize < mapSizeTexels[0]
                || renderer.capabilities.maxTextureSize < mapSizeTexels[1]) {
                throw new Error('Allocated directional shadow map contradicts its effective capability');
            }
            const worldExtentMeters = [
                camera.right - camera.left,
                camera.top - camera.bottom
            ];
            const constantDepthReliefMeters = -shadow.bias * (camera.far - camera.near);
            const pcf = {
                hardwareComparison: 'linear-four-compare-taps-v1',
                model: 'three-r183-vogel-5-linear-compare-v1',
                radiusTexels: shadow.radius,
                sampleCount: 5,
                screenRotation: 'interleaved-gradient-noise-gl-fragcoord-v1',
                shadowMapSizeTexels: mapSizeTexels,
                shadowMapWorldExtentMeters: worldExtentMeters,
                sourceMapRightAxisWorld: [clean(matrix[0]), clean(matrix[1]), clean(matrix[2])],
                sourceMapUpAxisWorld: [clean(matrix[4]), clean(matrix[5]), clean(matrix[6])]
            };
            return {
                filterIdentity: {
                    bias: {
                        constantDepthReliefMeters,
                        geometricNormalOffsetMeters: shadow.normalBias,
                        model: 'geometric-normal-offset-plus-constant-depth-relief-v1'
                    },
                    pcf,
                    sourceShadowCapability: {
                        id: `three-r183-single-high-effective-${mapSizeTexels[0]}-v1`,
                        mapSizeTexels,
                        maximumTextureSizeTexels: renderer.capabilities.maxTextureSize,
                        worldExtentMeters
                    },
                    worldFilterRadiusMeters:
                        pcf.radiusTexels * worldExtentMeters[0] / mapSizeTexels[0]
                },
                sourceCameraBoundsMeters: {
                    bottom: camera.bottom,
                    left: camera.left,
                    right: camera.right,
                    top: camera.top
                },
                sourceCameraCenterWorld: [
                    clean(matrix[12]),
                    clean(matrix[13]),
                    clean(matrix[14])
                ]
            };
        }

        function requireActiveFilterMatchesPreparedLiveOracle(oracle) {
            const descriptor = pipeline?._active?.binding?.descriptor;
            const actual = descriptor?.identity?.sampling;
            if (!actual) throw new Error('Active cache descriptor sampling identity is absent');
            const filterIdentity = oracle.filterIdentity;
            const exactBias = actual.bias?.model === filterIdentity.bias.model
                && Math.abs(actual.bias.constantDepthReliefMeters
                    - filterIdentity.bias.constantDepthReliefMeters) <= 1e-12
                && Math.abs(actual.bias.geometricNormalOffsetMeters
                    - filterIdentity.bias.geometricNormalOffsetMeters) <= 1e-12;
            const pcf = actual.pcf;
            const exactFilter = pcf?.model === filterIdentity.pcf.model
                && pcf.hardwareComparison === filterIdentity.pcf.hardwareComparison
                && pcf.sampleCount === filterIdentity.pcf.sampleCount
                && pcf.screenRotation === filterIdentity.pcf.screenRotation
                && pcf.radiusTexels === filterIdentity.pcf.radiusTexels
                && JSON.stringify(pcf.shadowMapSizeTexels)
                    === JSON.stringify(filterIdentity.pcf.shadowMapSizeTexels)
                && JSON.stringify(pcf.shadowMapWorldExtentMeters)
                    === JSON.stringify(filterIdentity.pcf.shadowMapWorldExtentMeters)
                && pcf.sourceMapRightAxisWorld.every((entry, index) =>
                    Math.abs(entry - filterIdentity.pcf.sourceMapRightAxisWorld[index]) <= 1e-9)
                && pcf.sourceMapUpAxisWorld.every((entry, index) =>
                    Math.abs(entry - filterIdentity.pcf.sourceMapUpAxisWorld[index]) <= 1e-9)
                && pcf.radiusTexels * pcf.shadowMapWorldExtentMeters[0]
                    / pcf.shadowMapSizeTexels[0] === filterIdentity.worldFilterRadiusMeters;
            if (!exactBias || !exactFilter
                || filterIdentity.sourceShadowCapability.id
                    !== 'three-r183-single-high-effective-16384-v1'
                || filterIdentity.worldFilterRadiusMeters !== 0.062255859375) {
                throw new Error(
                    'Active cache filter identity differs from the prepared effective live oracle'
                );
            }
            return createProductionLiveTexelPhaseEvidence({
                descriptor,
                sourceCameraBoundsMeters: oracle.sourceCameraBoundsMeters,
                sourceCameraCenterWorld: oracle.sourceCameraCenterWorld,
                sourceMapRightAxisWorld:
                    filterIdentity.pcf.sourceMapRightAxisWorld,
                sourceMapUpAxisWorld:
                    filterIdentity.pcf.sourceMapUpAxisWorld
            });
        }

        async function disposePipeline() {
            if (!pipeline) return;
            const owned = pipeline;
            pipeline = null;
            engine.installIlluminationPipeline(null);
            await owned.dispose();
        }

        const api = {
            setDirectRenderingForDiagnostics(enabled) {
                directRenderForDiagnostics = enabled === true;
                return directRenderForDiagnostics;
            },
            async prepareProfile(profile) {
                await disposePipeline();
                await clearCurrents();
                preparedProfile = profile;
                preparedLiveSourceShadowOracle = null;
                pipeline = new StaticSunDepthPipeline(engine, {
                    initialMode: 'current',
                    getLiveStaticSunDepthIdentity: () => ({...profile.liveIdentity})
                });
                engine.installIlluminationPipeline(pipeline);
                engine.setAtmosphereSettings({
                    ...engine.atmosphereSettings,
                    sun: {
                        ...engine.atmosphereSettings?.sun,
                        azimuthDeg: profile.sunProfile.azimuthDeg,
                        elevationDeg: profile.sunProfile.elevationDeg
                    }
                });
                city.update(engine);
                return pipeline.getDiagnostics();
            },
            async activatePreparedProfile() {
                if (!pipeline || !preparedProfile) throw new Error('No prepared profile');
                preparedLiveSourceShadowOracle =
                    readPreparedLiveSourceShadowFilterIdentity();
                const live = preparedProfile.liveIdentity;
                await pipeline.setMode('auto', {
                    url: preparedProfile.packageUrl,
                    expectations: {
                        cityId: live.cityId,
                        lightingProfileId: live.lightingProfileId,
                        selectedCapabilityProfileId: capabilityProfileId,
                        resolvedSourceSha256: live.resolvedSourceSha256,
                        staticSunDepthSourceSha256: live.staticSunDepthSourceSha256
                    }
                });
                for (let attempt = 0; attempt < 20; attempt += 1) {
                    city.update(engine);
                    engine.renderFrame();
                    gl.finish();
                    const diagnostics = pipeline.getDiagnostics();
                    if (diagnostics.active) {
                        const sourceShadowTexelPhaseEvidence =
                            requireActiveFilterMatchesPreparedLiveOracle(
                                preparedLiveSourceShadowOracle
                            );
                        return {
                            ...diagnostics,
                            sourceShadowFilterIdentity:
                                preparedLiveSourceShadowOracle.filterIdentity,
                            sourceShadowTexelPhaseEvidence
                        };
                    }
                    if (diagnostics.runtime?.controller?.state === 'failed'
                        || diagnostics.runtime?.controller?.state === 'fallback'
                        || diagnostics.runtime?.controller?.state === 'stale') return diagnostics;
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
                return pipeline.getDiagnostics();
            },
            async captureCurrent(validationCase, warmups) {
                applyCase(validationCase);
                resetValidationTemporalHistory();
                renderUnmeasuredFrames(warmups);
                const workload = renderMeasuredFrame();
                const capture = captureRgba();
                await putCurrent(validationCase.id, capture);
                return {
                    width: capture.width,
                    height: capture.height,
                    workload,
                    dynamicBus: dynamicBusState(),
                    staticShadow: staticShadowState(),
                    diagnostics: pipeline?.getDiagnostics?.() ?? null
                };
            },
            async capturePairedCurrent(validationCase, warmups) {
                if (!pipeline?.getDiagnostics?.().active) {
                    throw new Error('Paired current capture requires an active verified package');
                }
                // Restore live caster ownership against the camera for this case.
                // Reversing these calls rebuilds the CSM culler for the prior case
                // and leaves the first target shadow capture with stale cascades.
                applyCase(validationCase);
                pipeline.setDebugMode('liveFinal');
                resetValidationTemporalHistory();
                renderUnmeasuredFrames(warmups);
                const workload = renderMeasuredFrame();
                const capture = captureRgba();
                await putCurrent(validationCase.id, capture);
                return {
                    width: capture.width,
                    height: capture.height,
                    workload,
                    dynamicBus: dynamicBusState(),
                    staticShadow: staticShadowState(),
                    diagnostics: pipeline.getDiagnostics()
                };
            },
            async captureCache(validationCase, warmups) {
                if (!pipeline) throw new Error('Static-sun pipeline is absent');
                pipeline.setDebugMode('final');
                applyCase(validationCase);
                resetValidationTemporalHistory();
                renderUnmeasuredFrames(warmups);
                const workload = renderMeasuredFrame();
                const cache = captureRgba();
                await putCache(validationCase.id, cache);
                return {
                    width: cache.width,
                    height: cache.height,
                    workload,
                    dynamicBus: dynamicBusState(),
                    staticShadow: staticShadowState(),
                    diagnostics: pipeline.getDiagnostics()
                };
            },
            captureReceiverMask(validationCase, slot) {
                if (!pipeline) throw new Error('Static-sun pipeline is absent');
                if (slot !== 'staticCityReceiverMask' && slot !== 'dynamicReceiverMask') {
                    throw new Error('Receiver-mask capture slot is unsupported');
                }
                const evidence = pendingReceiverMaskEvidence;
                if (!evidence || evidence.caseId !== validationCase?.id) {
                    throw new Error(
                        'Receiver-mask evidence is absent for ' + validationCase?.id
                    );
                }
                if (evidence.consumedSlots.has(slot)) {
                    throw new Error('Receiver-mask evidence slot was already consumed');
                }
                const mask = evidence[slot];
                writeReceiverMaskEvidenceCanvas(mask.capture);
                evidence.consumedSlots.add(slot);
                return {
                    height: mask.capture.height,
                    receiverMeshCount: mask.receiverMeshCount,
                    visibleReceiverPixelCount: mask.visibleReceiverPixelCount,
                    width: mask.capture.width
                };
            },
            finishReceiverMaskEvidence(validationCase) {
                const evidence = pendingReceiverMaskEvidence;
                if (!evidence || evidence.caseId !== validationCase?.id
                    || evidence.consumedSlots.size !== 2) {
                    throw new Error(
                        'Receiver-mask evidence lifecycle is incomplete for '
                        + validationCase?.id
                    );
                }
                receiverMaskEvidenceCanvas.style.display = 'none';
                pendingReceiverMaskEvidence = null;
            },
            async captureComparisonAndCompare(validationCase, warmups) {
                if (!pipeline) throw new Error('Static-sun pipeline is absent');
                const mismatchLocalizationRequest = arguments[2] ?? null;
                const localizeMismatch = mismatchLocalizationRequest !== null;
                const mismatchLocalizationKeys = localizeMismatch
                    ? Object.keys(mismatchLocalizationRequest).sort().join(',')
                    : '';
                const canonicalLegacyTarget = validationCase?.id
                    === 'illum.game.low_sun_matrix.regional_dense.w.az135.el08';
                const explicitBoundedTarget = mismatchLocalizationKeys
                    === 'direction,productionEligible,sampleCount,schema,targetCaseId'
                    && mismatchLocalizationRequest?.targetCaseId
                        === validationCase?.id;
                const canonicalBoundedTarget = mismatchLocalizationKeys
                    === 'direction,productionEligible,sampleCount,schema';
                const canonicalExactPixelTarget = mismatchLocalizationKeys
                    === 'direction,productionEligible,sampleCount,schema,targetPixel';
                const explicitExactPixelTarget = mismatchLocalizationKeys
                    === 'direction,productionEligible,sampleCount,schema,targetCaseId,targetPixel'
                    && mismatchLocalizationRequest?.targetCaseId
                        === validationCase?.id;
                if (localizeMismatch && (
                    !mismatchLocalizationRequest
                    || typeof mismatchLocalizationRequest !== 'object'
                    || Array.isArray(mismatchLocalizationRequest)
                    || (mismatchLocalizationKeys !== 'productionEligible,sampleCount,schema'
                        && !canonicalBoundedTarget && !canonicalExactPixelTarget
                        && !explicitBoundedTarget && !explicitExactPixelTarget)
                    || mismatchLocalizationRequest.schema
                        !== 'ai531-production-mismatch-localization-request-v1'
                    || mismatchLocalizationRequest.productionEligible !== false
                    || !Number.isSafeInteger(mismatchLocalizationRequest.sampleCount)
                    || mismatchLocalizationRequest.sampleCount < 1
                    || mismatchLocalizationRequest.sampleCount > 64
                    || (mismatchLocalizationRequest.targetPixel !== undefined
                        && (mismatchLocalizationRequest.sampleCount !== 1
                            || !Array.isArray(mismatchLocalizationRequest.targetPixel)
                            || mismatchLocalizationRequest.targetPixel.length !== 2
                            || mismatchLocalizationRequest.targetPixel.some((entry) => (
                                !Number.isSafeInteger(entry) || entry < 0
                            ))))
                    || (mismatchLocalizationRequest.direction !== undefined
                        && mismatchLocalizationRequest.direction !== 'cache_brighter'
                        && mismatchLocalizationRequest.direction !== 'cache_darker')
                    || (!canonicalLegacyTarget
                        && !explicitBoundedTarget && !explicitExactPixelTarget)
                )) {
                    throw new Error(
                        'production mismatch localization request must remain exact, bounded, and non-promotable'
                    );
                }
                if (pendingReceiverMaskEvidence) {
                    throw new Error('Prior receiver-mask evidence was not released');
                }
                applyCase(validationCase);
                const stored = await getCurrent(validationCase.id);
                if (!stored?.pixels || !stored?.cachePixels) {
                    throw new Error(
                        `Missing same-session current/cache RGBA for '${validationCase.id}'`
                    );
                }
                const current = {
                    width: stored.width,
                    height: stored.height,
                    pixels: new Uint8Array(stored.pixels)
                };
                const cache = {
                    width: stored.cacheWidth,
                    height: stored.cacheHeight,
                    pixels: new Uint8Array(stored.cachePixels)
                };
                pipeline.setDebugMode('final');
                resetValidationTemporalHistory();
                const rawDynamicReceiverMask = captureDynamicReceiverMask();
                const rawStaticCityReceiverMask =
                    captureVisibleReceiverIdentityMask([city.group]);
                const receiverMaskPartition = createProductionReceiverMaskPartition(
                    rawDynamicReceiverMask.capture,
                    rawStaticCityReceiverMask.capture
                );
                const dynamicBusProof = dynamicBusShadowProof(
                    receiverMaskPartition.dynamicReceiverMask,
                    receiverMaskPartition.staticCityReceiverMask
                );
                pipeline.setDebugMode('seam');
                resetValidationTemporalHistory();
                renderUnmeasuredFrames(1);
                const seam = captureRgba();
                pipeline.setDebugMode('signedDifference');
                resetValidationTemporalHistory();
                renderUnmeasuredFrames(1);
                const signedVisibility = captureRgba();
                const comparisonResult = compareRgba(
                    current,
                    cache,
                    seam,
                    signedVisibility,
                    receiverMaskPartition.dynamicReceiverMask,
                    receiverMaskPartition.staticCityReceiverMask,
                    localizeMismatch,
                    mismatchLocalizationRequest?.direction ?? 'cache_brighter',
                    mismatchLocalizationRequest?.targetPixel ?? null
                );
                const metrics = localizeMismatch
                    ? comparisonResult.metrics : comparisonResult;
                renderUnmeasuredFrames(warmups);
                const workload = renderMeasuredFrame();
                const comparison = captureRgba();
                const mismatchLocalization = localizeMismatch
                    ? (await import(
                        '/tools/static_sun_depth/browser/ProductionMismatchCasterIdPass.js'
                    )).localizeProductionMismatchCasters({
                        THREE,
                        cacheBinding: pipeline._active?.binding,
                        city,
                        engine,
                        renderer,
                        validationCase,
                        missingOccluderCandidates:
                            mismatchLocalizationRequest.targetPixel
                                ? comparisonResult.missingOccluderCandidates.filter((entry) => (
                                    entry.pixel[0] === mismatchLocalizationRequest.targetPixel[0]
                                    && entry.pixel[1] === mismatchLocalizationRequest.targetPixel[1]
                                ))
                                : comparisonResult.missingOccluderCandidates,
                        sampleCount: mismatchLocalizationRequest.sampleCount
                    })
                    : null;
                await deleteCurrent(validationCase.id);
                pendingReceiverMaskEvidence = {
                    caseId: validationCase.id,
                    consumedSlots: new Set(),
                    dynamicReceiverMask: {
                        capture: receiverMaskPartition.dynamicReceiverMask,
                        receiverMeshCount: rawDynamicReceiverMask.receiverMeshCount,
                        visibleReceiverPixelCount:
                            receiverMaskPartition.dynamicReceiverMaskedPixelCount
                    },
                    staticCityReceiverMask: {
                        capture: receiverMaskPartition.staticCityReceiverMask,
                        receiverMeshCount: rawStaticCityReceiverMask.receiverMeshCount,
                        visibleReceiverPixelCount:
                            receiverMaskPartition.eligibleStaticReceiverPixelCount
                    }
                };
                return {
                    metrics,
                    workload,
                    dynamicBus: dynamicBusState(),
                    staticShadow: staticShadowState(),
                    dynamicBusShadowProof: dynamicBusProof,
                    width: comparison.width,
                    height: comparison.height,
                    diagnostics: pipeline.getDiagnostics(),
                    ...(mismatchLocalization ? {
                        maximumRgbErrorPixel: comparisonResult.maximumRgbErrorPixel,
                        mismatchLocalization
                    } : {})
                };
            },
            async dispose() {
                try {
                    await disposePipeline();
                    await clearCurrents();
                } finally {
                    pendingReceiverMaskEvidence = null;
                    receiverMaskEvidenceCanvas.remove();
                    renderer.renderBufferDirect = originalRenderBufferDirect;
                    renderer.shadowMap.render = originalShadowRender;
                }
            }
        };
        window.__ai531ProductionValidation = api;
        return hardware;
    }, {
        thresholds: PRODUCTION_VALIDATION_THRESHOLDS,
        capabilityProfileId: PRODUCTION_VALIDATION_CAPABILITY_PROFILE_ID
    });
}

/** @param {Readonly<Record<string, any>>} plan */
async function verifyIndexedPackages(plan, depthPrecisionDiagnostic = false) {
    const authenticatedPackagesByProfile = new Map();
    for (const group of plan.groups) {
        const absolutePath = path.resolve(repoRoot, ...group.package.packagePath.split('/'));
        await stat(absolutePath).catch((error) => {
            throw new Error(
                `missing production package for '${group.lightingProfileId}':`
                + ` ${group.package.packagePath}`,
                {cause: error}
            );
        });
        const bytes = await readFile(absolutePath);
        const profileRoot = path.dirname(absolutePath);
        const publishedPayload = await readFile(path.join(
            profileRoot,
            depthPrecisionDiagnostic
                ? 'static_sun_depth.rgba8'
                : 'static_sun_depth.rg8'
        ));
        const descriptorBytes = await readFile(path.join(profileRoot, 'descriptor.json'));
        const publishedDescriptor = parseCanonicalPublishedDescriptor(
            descriptorBytes,
            group.lightingProfileId
        );
        const live = group.package.liveIdentity;
        const verified = await verifyIlluminationBinaryPackage(bytes, {
            expectations: {
                cityId: live.cityId,
                lightingProfileId: live.lightingProfileId,
                selectedCapabilityProfileId: PRODUCTION_VALIDATION_CAPABILITY_PROFILE_ID,
                resolvedSourceSha256: live.resolvedSourceSha256,
                staticSunDepthSourceSha256: live.staticSunDepthSourceSha256
            }
        });
        const authenticatePackage = depthPrecisionDiagnostic
            ? authenticateProductionDepthDiagnosticPackage
            : authenticateProductionStaticSunDepthPackage;
        await authenticatePackage(
            verified,
            publishedDescriptor,
            publishedPayload,
            group.package.packagePath
        );
        authenticatedPackagesByProfile.set(group.lightingProfileId, freezeDeep({
            descriptorSha256: await rawSha256Hex(descriptorBytes),
            packageAggregateSha256: verified.aggregateSha256,
            packagePath: group.package.packagePath
        }));
    }
    return authenticatedPackagesByProfile;
}

/**
 * @param {Readonly<Record<string, any>>} verified
 * @param {unknown} publishedDescriptorValue
 * @param {ArrayBufferView|ArrayBuffer} publishedPayloadValue
 * @param {string} [label]
 */
export async function authenticateProductionStaticSunDepthPackage(
    verified,
    publishedDescriptorValue,
    publishedPayloadValue,
    label = 'production static-sun package'
) {
    return authenticateStaticSunDepthPackage(
        verified,
        publishedDescriptorValue,
        publishedPayloadValue,
        label,
        {
            components: 2,
            payloadFileName: 'static_sun_depth.rg8',
            requireChunkWindows: requireProductionStaticSunDepthChunkWindows
        }
    );
}

/**
 * @param {Readonly<Record<string, any>>} verified
 * @param {unknown} publishedDescriptorValue
 * @param {ArrayBufferView|ArrayBuffer} publishedPayloadValue
 * @param {string} [label]
 */
export async function authenticateProductionDepthDiagnosticPackage(
    verified,
    publishedDescriptorValue,
    publishedPayloadValue,
    label = 'production depth precision diagnostic package'
) {
    return authenticateStaticSunDepthPackage(
        verified,
        publishedDescriptorValue,
        publishedPayloadValue,
        label,
        {
            components: 4,
            payloadFileName: 'static_sun_depth.rgba8',
            requireChunkWindows: requireProductionDepthDiagnosticChunkWindows
        }
    );
}

async function authenticateStaticSunDepthPackage(
    verified,
    publishedDescriptorValue,
    publishedPayloadValue,
    label,
    contract
) {
    if (verified?.compatibility?.compatible !== true) {
        throw new Error(`${label} is not runtime compatible`);
    }
    const resolved = contract.requireChunkWindows(verified.chunks);
    const publishedDescriptor = validateStaticSunDepthTileSetDescriptor(
        publishedDescriptorValue
    );
    validateProductionDescriptorFilterIdentity(resolved.outputDescriptor);
    const expectedDimensions = createStaticSunDepthDimensions(
        publishedDescriptor,
        contract.components
    );
    if (canonicalJsonStringify(resolved.outputDescriptor)
            !== canonicalJsonStringify(publishedDescriptor)
        || canonicalJsonStringify(resolved.dimensions)
            !== canonicalJsonStringify(expectedDimensions)) {
        throw new Error(`${label} differs from the published descriptor or dimensions`);
    }
    const assembled = await independentlyAssembleStaticSunDepthChunks(
        verified.chunks,
        resolved,
        label
    );
    const publishedPayload = copyByteView(
        publishedPayloadValue,
        `${label} published ${contract.payloadFileName}`
    );
    const publishedSha256 = await rawSha256Hex(publishedPayload);
    if (publishedPayload.byteLength !== resolved.assembledByteLength
        || publishedSha256 !== resolved.assembledSha256
        || !byteViewsEqual(assembled, publishedPayload)) {
        throw new Error(
            `${label} assembled bytes differ from the authenticated published `
            + contract.payloadFileName
        );
    }
    return Object.freeze({
        assembledByteLength: resolved.assembledByteLength,
        assembledSha256: resolved.assembledSha256,
        dimensions: resolved.dimensions,
        outputDescriptor: resolved.outputDescriptor
    });
}

async function independentlyAssembleStaticSunDepthChunks(chunks, resolved, label) {
    if (!Array.isArray(chunks)
        || chunks.length !== resolved.sourceChunks.length) {
        throw new Error(`${label} verified chunk inventory differs from its resolved windows`);
    }
    const assembled = new Uint8Array(resolved.assembledByteLength);
    let writeOffset = 0;
    for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        const source = resolved.sourceChunks[index];
        const data = copyByteView(chunk?.data, `${label} chunk '${source.id}'`);
        if (chunk?.descriptor?.id !== source.id
            || data.byteLength !== source.byteLength
            || await rawSha256Hex(data) !== source.sha256
            || writeOffset + data.byteLength > assembled.byteLength) {
            throw new Error(`${label} chunk '${source.id}' differs from its authenticated window`);
        }
        assembled.set(data, writeOffset);
        writeOffset += data.byteLength;
    }
    if (writeOffset !== assembled.byteLength
        || await rawSha256Hex(assembled) !== resolved.assembledSha256) {
        throw new Error(`${label} assembled SHA-256 or byte length is invalid`);
    }
    return assembled;
}

function createStaticSunDepthDimensions(descriptor, components = 2) {
    const stored = descriptor.tiles[0].storedTexels;
    return Object.freeze({
        components,
        depth: descriptor.tiles.length,
        height: stored[1],
        width: stored[0]
    });
}

function parseCanonicalPublishedDescriptor(bytes, lightingProfileId) {
    const text = new TextDecoder().decode(bytes);
    let descriptor;
    try {
        descriptor = JSON.parse(text);
    } catch (error) {
        throw new Error(
            `published descriptor '${lightingProfileId}' is not valid JSON`,
            {cause: error}
        );
    }
    if (text !== canonicalJsonStringify(descriptor)) {
        throw new Error(`published descriptor '${lightingProfileId}' is not canonical JSON`);
    }
    return descriptor;
}

function copyByteView(value, label) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value).slice();
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    }
    throw new TypeError(`${label} must be byte data`);
}

function byteViewsEqual(left, right) {
    if (left.byteLength !== right.byteLength) return false;
    for (let index = 0; index < left.byteLength; index += 1) {
        if (left[index] !== right[index]) return false;
    }
    return true;
}

/** @param {unknown} value @param {string} lightingProfileId */
function validateLiveIdentity(value, lightingProfileId) {
    const source = requirePlainRecord(value, `live identity '${lightingProfileId}'`);
    requireExactDataKeys(source, LIVE_IDENTITY_KEYS, `live identity '${lightingProfileId}'`);
    if (source.cityId !== 'bigcity2') {
        throw new Error(`live identity '${lightingProfileId}' cityId must be 'bigcity2'`);
    }
    if (source.lightingProfileId !== lightingProfileId) {
        throw new Error(`live identity '${lightingProfileId}' lightingProfileId must match its map key`);
    }
    if (source.developmentCacheAllowed !== true) {
        throw new Error(`live identity '${lightingProfileId}' must explicitly allow the development cache`);
    }
    for (const key of [
        'alphaSemanticsSha256',
        'casterInventorySha256',
        'resolvedSourceSha256',
        'staticSunDepthSourceSha256'
    ]) {
        if (typeof source[key] !== 'string' || !HASH_PATTERN.test(source[key])) {
            throw new TypeError(`live identity '${lightingProfileId}'.${key} must be a lowercase SHA-256`);
        }
    }
    return freezeDeep(Object.fromEntries(LIVE_IDENTITY_KEYS.map((key) => [key, source[key]])));
}

/** @param {unknown} value @param {string} lightingProfileId */
function requirePackagePath(value, lightingProfileId) {
    if (typeof value !== 'string'
        || !value.endsWith('.ilpkg')
        || value.includes('\\')
        || value.startsWith('/')
        || !/^[A-Za-z0-9._/-]+$/.test(value)
        || path.posix.normalize(value) !== value
        || value.split('/').includes('..')
        || !value.startsWith('tests/artifacts/illumination_531/')) {
        throw new TypeError(
            `package index profile '${lightingProfileId}'.packagePath must be a canonical`
            + ' repository-relative .ilpkg below tests/artifacts/illumination_531/'
        );
    }
    return value;
}

/** @param {unknown} value @param {string} label */
function requirePlainRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype
            && Object.getPrototypeOf(value) !== null)) {
        throw new TypeError(`${label} must be a plain object`);
    }
    return /** @type {Record<string, any>} */ (value);
}

/** @param {Record<string, any>} value @param {readonly string[]} expected @param {string} label */
function requireExactDataKeys(value, expected, label) {
    const actual = Object.keys(value).sort(compareStrings);
    const wanted = [...expected].sort(compareStrings);
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
        throw new TypeError(`${label} must contain exactly ${wanted.join(', ')}`);
    }
    for (const key of wanted) {
        const property = Object.getOwnPropertyDescriptor(value, key);
        if (!property || !property.enumerable || !Object.prototype.hasOwnProperty.call(property, 'value')) {
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

function requireShadowCounterRecord(value, label) {
    const counters = requirePlainRecord(value, label);
    requireExactDataKeys(
        counters,
        ['calls', 'lines', 'points', 'triangles'],
        label
    );
    for (const [key, count] of Object.entries(counters)) {
        if (!Number.isSafeInteger(count) || count < 0) {
            throw new TypeError(`${label} '${key}' must be a non-negative integer`);
        }
    }
    return counters;
}

function requireDynamicBusState(value, label) {
    const state = requirePlainRecord(value, `${label} dynamic bus state`);
    requireExactDataKeys(state, [
        'casterMeshCount',
        'meshCount',
        'method',
        'receiverMeshCount',
        'registeredDynamicReceiver',
        'registeredDynamicRootCount',
        'rootOutsideStaticCity'
    ], `${label} dynamic bus state`);
    if (state.method !== 'registered_bus_anchor_outside_static_city_v1'
        || state.rootOutsideStaticCity !== true
        || state.registeredDynamicReceiver !== true) {
        throw new Error(`${label} dynamic bus ownership is unsupported`);
    }
    for (const key of [
        'casterMeshCount',
        'meshCount',
        'receiverMeshCount',
        'registeredDynamicRootCount'
    ]) {
        if (!Number.isSafeInteger(state[key]) || state[key] < 1) {
            throw new TypeError(`${label} dynamic bus '${key}' must be a positive integer`);
        }
    }
    if (state.casterMeshCount > state.meshCount
        || state.receiverMeshCount > state.meshCount) {
        throw new Error(`${label} dynamic bus mesh inventory is contradictory`);
    }
    return state;
}

function requireDynamicBusShadowProof(value) {
    const proof = requirePlainRecord(value, 'production dynamic bus shadow proof');
    requireExactDataKeys(proof, [
        'affectedStaticCityReceiverPixelCount',
        'brightenedStaticCityReceiverPixelCount',
        'busCasterMeshCount',
        'cityReceiverMaskMethod',
        'maximumLumaBrighteningByte',
        'maximumLumaDarkeningByte',
        'method',
        'restoredCasterMeshCount',
        'staticCityReceiverPixelCount'
    ], 'production dynamic bus shadow proof');
    if (proof.method
            !== 'bus_cast_shadow_enabled_luma_darker_than_disabled_over_visible_city_receivers_v2'
        || proof.cityReceiverMaskMethod
            !== 'visible_city_receiver_identity_depth_equality_v1') {
        throw new Error('production dynamic bus shadow proof method is unsupported');
    }
    for (const key of [
        'affectedStaticCityReceiverPixelCount',
        'brightenedStaticCityReceiverPixelCount',
        'busCasterMeshCount',
        'restoredCasterMeshCount',
        'staticCityReceiverPixelCount'
    ]) {
        if (!Number.isSafeInteger(proof[key]) || proof[key] < 0) {
            throw new TypeError(
                `production dynamic bus shadow proof '${key}' must be a non-negative integer`
            );
        }
    }
    for (const key of ['maximumLumaBrighteningByte', 'maximumLumaDarkeningByte']) {
        if (!Number.isFinite(proof[key]) || proof[key] < 0 || proof[key] > 255) {
            throw new TypeError(
                `production dynamic bus shadow proof '${key}' must be a luma byte magnitude`
            );
        }
    }
    const tolerance = PRODUCTION_VALIDATION_THRESHOLDS.falseLitToleranceByte;
    if (proof.busCasterMeshCount < 1
        || proof.restoredCasterMeshCount !== proof.busCasterMeshCount
        || proof.staticCityReceiverPixelCount < 1
        || proof.affectedStaticCityReceiverPixelCount
            > proof.staticCityReceiverPixelCount
        || proof.brightenedStaticCityReceiverPixelCount
            > proof.staticCityReceiverPixelCount
        || (proof.affectedStaticCityReceiverPixelCount > 0)
            !== (proof.maximumLumaDarkeningByte > tolerance)
        || (proof.brightenedStaticCityReceiverPixelCount > 0)
            !== (proof.maximumLumaBrighteningByte > tolerance)) {
        throw new Error('production dynamic bus shadow proof is contradictory');
    }
    return proof;
}

/** @param {string} filePath @param {string} label */
function requireRepositoryFile(filePath, label) {
    const resolved = path.resolve(repoRoot, filePath);
    const relative = path.relative(repoRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`${label} must stay inside the repository`);
    }
    return resolved;
}

/** @param {string} outputRoot */
function requireScreenshotOutputRoot(outputRoot) {
    const resolved = path.resolve(repoRoot, outputRoot);
    const relative = path.relative(screenshotAuthorityRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('outputRoot must stay below tests/artifacts/screens/illumination_531/');
    }
    return resolved;
}

/** @param {number} start */
async function findFreePort(start) {
    for (let port = start; port < Math.min(65536, start + 200); port += 1) {
        if (await canListen(port)) return port;
    }
    throw new Error(`No free production-validation port found from ${start}`);
}

/** @param {number} port */
function canListen(port) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.unref();
        probe.once('error', () => resolve(false));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
}

/** @param {string} baseUrl */
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

/** @param {unknown} value @param {number} minimum @param {number} maximum @param {string} label */
function requireInteger(value, minimum, maximum, label) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
        throw new TypeError(`${label} must be an integer from ${minimum} through ${maximum}`);
    }
    return number;
}

/** @param {unknown} value */
function normalizeOptionalReason(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' || value.trim() !== value || value.length > 512) {
        throw new TypeError('timingContaminationReason must be a trimmed string of at most 512 characters');
    }
    return value;
}

/** @param {Readonly<Record<string, any>>} diagnostics */
function isCacheActive(diagnostics) {
    return diagnostics?.active !== null
        && diagnostics?.active !== undefined
        && diagnostics?.runtime?.controller?.state === 'active'
        && diagnostics?.runtime?.controller?.effectiveMode === 'baked';
}

/** @param {string} filePath */
function artifactPath(filePath) {
    return path.relative(repoRoot, filePath).replaceAll('\\', '/');
}

/** @param {string} left @param {string} right */
function compareStrings(left, right) {
    return left === right ? 0 : left < right ? -1 : 1;
}

/** @template T @param {T} value @returns {Readonly<T>} */
function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
        return /** @type {Readonly<T>} */ (value);
    }
    for (const entry of Object.values(value)) freezeDeep(entry);
    return /** @type {Readonly<T>} */ (Object.freeze(value));
}

/** @param {readonly string[]} argv */
export function parseProductionValidationArgs(argv) {
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
            '--package-index': 'packageIndexPath',
            '--output-root': 'outputRoot',
            '--url': 'baseUrl',
            '--port': 'preferredPort',
            '--chrome': 'chromePath',
            '--warmup-frames': 'warmupFrames',
            '--timing-contaminated-reason': 'timingContaminationReason'
        })[token];
        if (!key) throw new Error(`Unknown option '${token}'`);
        result[key] = key === 'preferredPort' || key === 'warmupFrames' ? Number(next) : next;
        index += 1;
    }
    return Object.freeze(result);
}

export function createProductionValidationUsageText() {
    return [
        'Usage: node tools/static_sun_depth/validate_production.mjs [options]',
        '',
        '  --package-index <package_index.json>  Exact 8-profile production mapping',
        '  --output-root <tests/artifacts/screens/illumination_531/...>',
        '  --url <http://127.0.0.1:port>          Reuse a repository static server',
        '  --port <number>                        Preferred local port (default 4173)',
        '  --chrome <path>                        Installed Chrome/Chromium executable',
        '  --warmup-frames <count>                Frames before each capture (default 2)',
        '  --timing-contaminated-reason <text>    Mark timings non-promotable',
        ''
    ].join('\n');
}

async function main() {
    const options = parseProductionValidationArgs(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(createProductionValidationUsageText());
        return;
    }
    const result = await runProductionStaticSunDepthValidation(options);
    process.stdout.write(`${JSON.stringify({
        ok: true,
        report: artifactPath(result.reportPath),
        caseCount: result.report.caseCount,
        timingContamination: result.report.timingContamination
    }, null, 2)}\n`);
}

const invokedUrl = process.argv[1]
    ? pathToFileURL(path.resolve(process.argv[1])).href
    : null;
if (invokedUrl === import.meta.url) {
    await main().catch((error) => {
        process.stderr.write(`[StaticSunDepthProductionValidation] ${error?.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
