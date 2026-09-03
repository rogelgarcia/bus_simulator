// Builds deterministic AI 531 per-profile and exact-release certifications.
// @ts-check

import { createHash } from 'node:crypto';
import {
    canonicalJsonStringify,
    cloneCanonicalJson,
    compareCanonicalStrings
} from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    ILLUMINATION_VALIDATION_CASES
} from '../../../src/app/illumination/validation/IlluminationValidationCaseCatalog.js';
import {
    validateLabReleaseReport
} from '../validate_lab.mjs';
import {
    PRODUCTION_MINIMUM_STATIC_RECEIVER_COVERAGE_RATIO,
    PRODUCTION_VALIDATION_CAPTURE_SLOTS,
    requireCaptureAuthenticationSummary,
    requireProductionCaptureAuthenticationSummary,
    requireCaptureRecord
} from './ValidationCaptureAuthentication.mjs';
import {
    PRODUCTION_OPAQUE_BVH_DEPTH_EPSILON_METERS,
    buildAlphaCutoutCoverageCertificationRecord,
    buildCasterExclusionCertificationRecord,
    buildOpaqueOccluderCertificationRecord
} from './ProductionArtifact.mjs';
import {
    requireStaticSunDepthCasterSidedness,
    resolveStaticSunDepthEffectiveShadowSide
} from '../../../src/graphics/lighting/EffectiveShadowSide.js';
import {
    PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_V2_SCHEMA,
    validateProductionAlphaCutoutSpatialParityArtifact
} from './ProductionAlphaCutoutParity.mjs';

export const PRODUCTION_PROFILE_RELEASE_CERTIFICATION_SCHEMA =
    'bus-sim-static-sun-depth-production-profile-release-certification-v2';
export const PRODUCTION_RELEASE_CERTIFICATION_SCHEMA =
    'bus-sim-static-sun-depth-production-release-certification-v3';
export const PRODUCTION_VALIDATION_EVIDENCE_SCHEMA =
    'bus-sim-static-sun-depth-production-validation-evidence-v4';
export const LAB_VALIDATION_EVIDENCE_SCHEMA =
    'bus-sim-static-sun-depth-lab-validation-evidence-v1';
export const AI531_PRODUCTION_RELEASE_PROFILE_IDS = Object.freeze([
    'ai527.sun.az045.el08',
    'ai527.sun.az045.el35',
    'ai527.sun.az135.el08',
    'ai527.sun.az135.el35',
    'ai527.sun.az225.el08',
    'ai527.sun.az225.el35',
    'ai527.sun.az315.el08',
    'ai527.sun.az315.el35'
]);

export const AI531_PRODUCTION_CASTER_INVENTORY = Object.freeze({
    categoryCounts: Object.freeze({
        buildings: 1683,
        traffic_controls: 37,
        trees_foliage: 248
    }),
    coverageModeCounts: Object.freeze({
        cutout: 124,
        forced_opaque: 64,
        opaque: 1780
    }),
    selectedCasterCount: 1968
});

const PACKAGE_INDEX_SCHEMA =
    'bus-sim-static-sun-depth-production-package-index-v1';
const VALIDATION_REPORT_SCHEMA =
    'bus-sim-static-sun-depth-production-validation-report-v4';
const EXPECTED_VALIDATION_CASE_COUNT = 197;
const EXPECTED_EXCLUDED_LAB_CASE_COUNT = 8;
const EXPECTED_VALIDATION_CAPTURE_DIMENSIONS_PIXELS = Object.freeze([1280, 720]);
const EXPECTED_LAB_VALIDATION_PROFILE_IDS = Object.freeze([
    'ai527.sun.az045.el35',
    'ai527.sun.az135.el08',
    'ai527.sun.az225.el12'
]);
const PROFILE_ID_PATTERN = /^ai527\.sun\.az\d{3}\.el\d{2}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const EXPECTED_VALIDATION_THRESHOLDS = Object.freeze({
    falseLitToleranceByte: 4,
    maxContinuousSeamRunPixels: 1,
    maxRgbErrorByte: 64,
    meanRgbErrorByte: 0.35,
    pixelsOverFourBytePercent: 0.2,
    seamErrorToleranceByte: 2,
    seamFalseLitPixelCount: 0,
    missingOccluderPixelCount: 0
});
const VALIDATION_CASE_METRIC_KEYS = Object.freeze([
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
const VALIDATION_CASE_INTEGER_METRIC_KEYS = Object.freeze([
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
const EXPECTED_VALIDATION_CASES = Object.freeze(
    ILLUMINATION_VALIDATION_CASES
        .filter((entry) => entry.kind !== 'lab')
        .map((entry) => cloneCanonicalJson({
            camera: entry.camera,
            caseId: entry.id,
            coverageTags: entry.coverageTags,
            kind: entry.kind,
            lightingProfileId: entry.sunProfile.id,
            sunProfile: entry.sunProfile
        }))
);
const EXPECTED_VALIDATION_CASE_BY_ID = new Map(
    EXPECTED_VALIDATION_CASES.map((entry) => [entry.caseId, entry])
);
const MIPMAPPED_MIN_FILTERS = new Set([1004, 1005, 1007, 1008]);
const CUTOUT_BINDING_PROJECTION_SCHEMA =
    'ai531-production-alpha-cutout-binding-projection-v1';
const CUTOUT_CASTER_PLAN_SCHEMA =
    'ai531-production-alpha-cutout-caster-plan-v1';
const LIVE_TEXEL_PHASE_EVIDENCE_SCHEMA =
    'ai531-production-live-texel-phase-evidence-v1';
const LIVE_TEXEL_PHASE_POLICY =
    'three-r183-even-map-world-origin-snapped-live-texel-center-v1';
const LIVE_TEXEL_PITCH_METERS = 680 / 16384;
const LIVE_TEXEL_PHASE_TOLERANCE = 1e-9;

/**
 * @param {{
 *   descriptor: unknown,
 *   manifest: unknown,
 *   packageAggregateSha256: string,
 *   packagePath: string,
 *   receipt: unknown,
 *   receiptSha256: string,
 *   sourceValidationReport: unknown
 * }} options
 */
export function buildProductionProfileReleaseCertification(options) {
    const source = requirePlainObject(options, 'profile release certification options');
    requireExactKeys(source, [
        'descriptor',
        'manifest',
        'packageAggregateSha256',
        'packagePath',
        'receipt',
        'receiptSha256',
        'sourceValidationReport'
    ], 'profile release certification options');
    const descriptor = requirePlainObject(source.descriptor, 'production descriptor');
    const manifest = requirePlainObject(source.manifest, 'authenticated source manifest');
    const receipt = requirePlainObject(source.receipt, 'authenticated production receipt');
    const sourceValidationReport = requirePlainObject(
        source.sourceValidationReport,
        'source validation report'
    );
    requireSha256(source.packageAggregateSha256, 'packageAggregateSha256');
    requireSha256(source.receiptSha256, 'receiptSha256');
    if (sourceValidationReport.valid !== true) {
        throw new Error('Source validation report must be valid');
    }

    const lightingProfileId = requireReleaseProfileId(
        receipt.request?.lightingProfileId,
        'receipt.request.lightingProfileId'
    );
    requirePackagePath(source.packagePath, lightingProfileId);
    requireReleaseSamplingPolicy(descriptor, receipt, lightingProfileId);
    const inventory = deriveCasterInventoryEvidence(manifest, receipt);
    const sourceIdentities = deriveSourceIdentityHashes(manifest);
    requireReceiptSourceIdentity(receipt, sourceIdentities);
    const receiptSha256 = source.receiptSha256;
    const descriptorSha256 = rawCanonicalSha256(descriptor);
    const opaque = buildOpaqueRecord({
        descriptorSha256,
        receipt,
        receiptSha256
    });
    const alpha = buildAlphaRecord({
        descriptorSha256,
        inventory,
        lightingProfileId,
        manifest,
        receipt,
        receiptSha256
    });
    const casters = buildCasterRecord({
        inventory,
        receipt,
        receiptSha256
    });
    const result = cloneCanonicalJson({
        alpha,
        casters,
        compilerSignatureSha256: receipt.compilerSignatureSha256,
        descriptorSha256,
        lightingProfileId,
        opaque,
        packageAggregateSha256: source.packageAggregateSha256,
        packagePath: source.packagePath,
        receiptSha256,
        schema: PRODUCTION_PROFILE_RELEASE_CERTIFICATION_SCHEMA,
        source: {
            ...receipt.input,
            cityId: receipt.identity.cityId,
            sourceValidationReportSha256: rawCanonicalSha256(sourceValidationReport)
        },
        sourceInventory: {
            categoryCounts: inventory.categoryCounts,
            coverageModeCounts: inventory.coverageModeCounts,
            includedCasterIdsSha256: inventory.includedCasterIdsSha256,
            includedCasterProjectionSha256: inventory.includedCasterProjectionSha256,
            selectedCasterCount: inventory.selected.length
        },
        status: 'passed'
    });
    return validateProductionProfileReleaseCertification(result);
}

/**
 * @param {unknown} value
 * @param {{lightingProfileId?: string, liveIdentity?: unknown, packagePath?: string}} [expectations]
 */
export function validateProductionProfileReleaseCertification(value, expectations = {}) {
    const record = cloneCanonicalJson(value);
    requireExactKeys(record, [
        'alpha',
        'casters',
        'compilerSignatureSha256',
        'descriptorSha256',
        'lightingProfileId',
        'opaque',
        'packageAggregateSha256',
        'packagePath',
        'receiptSha256',
        'schema',
        'source',
        'sourceInventory',
        'status'
    ], 'profile release certification');
    if (record.schema !== PRODUCTION_PROFILE_RELEASE_CERTIFICATION_SCHEMA
        || record.status !== 'passed') {
        throw new Error('Profile release certification must use the release schema and pass');
    }
    requireReleaseProfileId(record.lightingProfileId, 'profile release lightingProfileId');
    if (expectations.lightingProfileId !== undefined
        && record.lightingProfileId !== expectations.lightingProfileId) {
        throw new Error('Profile release certification lighting profile differs from expectation');
    }
    requirePackagePath(record.packagePath, record.lightingProfileId);
    if (expectations.packagePath !== undefined
        && record.packagePath !== expectations.packagePath) {
        throw new Error('Profile release certification package path differs from package index');
    }
    for (const key of [
        'compilerSignatureSha256',
        'descriptorSha256',
        'packageAggregateSha256',
        'receiptSha256'
    ]) requireSha256(record[key], `profile release certification.${key}`);
    validateProfileSource(record.source);
    validateSourceInventory(record.sourceInventory);
    validateOpaqueRecord(record.opaque);
    validateAlphaRecord(record.alpha);
    validateCasterRecord(record.casters);
    if (record.source.alphaSemanticsSha256 !== record.alpha.alphaSemanticsSha256
        || record.source.casterInventorySha256 !== record.casters.casterInventorySha256
        || record.sourceInventory.selectedCasterCount
            !== record.casters.inventoryCasterCount
        || record.sourceInventory.coverageModeCounts.cutout
            !== record.alpha.expectedCasterCount) {
        throw new Error('Profile release certification source and nested records disagree');
    }
    if (expectations.liveIdentity !== undefined) {
        requireLiveIdentityMatch(record, expectations.liveIdentity);
    }
    return cloneCanonicalJson(record);
}

/**
 * @param {{
 *   packageIndex: unknown,
 *   packageIndexPath: string,
 *   profileCertifications: readonly unknown[] | Record<string, unknown>,
 *   rawSha256: string,
 *   report: unknown
 * }} options
 */
export function buildProductionValidationEvidence(options) {
    const source = requirePlainObject(options, 'production validation evidence options');
    requireExactKeys(source, [
        'packageIndex',
        'packageIndexPath',
        'profileCertifications',
        'rawSha256',
        'report'
    ], 'production validation evidence options');
    requireSha256(source.rawSha256, 'production validation report rawSha256');
    const index = validateExactReleasePackageIndex(source.packageIndex);
    const certifications = normalizeProfileCertifications(
        source.profileCertifications,
        index
    );
    const report = requirePlainObject(source.report, 'production validation report');
    if (report.schema !== VALIDATION_REPORT_SCHEMA || report.status !== 'passed') {
        throw new Error('Production validation report must use the release schema and pass');
    }
    if (report.caseCount !== EXPECTED_VALIDATION_CASE_COUNT
        || report.expectedCaseCount !== EXPECTED_VALIDATION_CASE_COUNT) {
        throw new Error('Production validation report must contain exactly 197 cases');
    }
    if (report.excludedLabCaseCount !== EXPECTED_EXCLUDED_LAB_CASE_COUNT) {
        throw new Error('Production validation report must exclude exactly eight lab cases');
    }
    if (report.sameSessionPairing
        !== 'current_and_cache_rgba_indexeddb_then_current_difference_same_page_profile_group_v2') {
        throw new Error('Production validation same-session pairing is not release authoritative');
    }
    if (report.comparisonCondition
        !== 'current_difference_with_baked_resource_active_and_current_static_maps_retained_v1') {
        throw new Error('Production validation comparison condition is not release authoritative');
    }
    requireCanonicalMatch(
        EXPECTED_VALIDATION_THRESHOLDS,
        report.thresholds,
        'production validation thresholds'
    );
    if (report.packageIndex !== source.packageIndexPath) {
        throw new Error('Production validation report refers to a different package index path');
    }
    if (!Array.isArray(report.failures) || report.failures.length !== 0) {
        throw new Error('Production validation report contains failures');
    }
    if (!Array.isArray(report.browserDiagnostics)
        || report.browserDiagnostics.length !== 0
        || report.browserDiagnosticGate?.passed !== true
        || report.browserDiagnosticGate?.diagnosticCount !== 0) {
        throw new Error('Production validation browser diagnostic gate did not pass');
    }
    const captureAuthentication = requireProductionCaptureAuthenticationSummary(
        report.captureAuthentication,
        EXPECTED_VALIDATION_CASE_COUNT * PRODUCTION_VALIDATION_CAPTURE_SLOTS.length,
        EXPECTED_VALIDATION_CAPTURE_DIMENSIONS_PIXELS
    );
    const tileBoundaryEvidence = requireTileBoundaryAggregate(report.tileBoundaryEvidence);
    if (report.dynamicBusEvidence?.passed !== true) {
        throw new Error('Production validation has no non-vacuous dynamic-bus evidence');
    }
    validateTimingContamination(report.timingContamination);
    const groups = normalizeValidationGroups(report.profileGroups, index);
    const sourceShadowTexelPhaseEvidence =
        normalizeProductionLiveTexelPhaseEvidence(
            report.sourceShadowTexelPhaseEvidence,
            {certifications, index}
        );
    const cases = normalizeValidationCases(report.cases, certifications);
    const caseProfileIds = [...new Set(cases.map((entry) => entry.lightingProfileId))]
        .sort(compareCanonicalStrings);
    if (canonicalJsonStringify(caseProfileIds)
        !== canonicalJsonStringify(AI531_PRODUCTION_RELEASE_PROFILE_IDS)) {
        throw new Error('Production validation cases do not cover the exact release profiles');
    }
    const groupCaseCount = groups.reduce((sum, entry) => sum + entry.caseCount, 0);
    if (groupCaseCount !== EXPECTED_VALIDATION_CASE_COUNT) {
        throw new Error('Production validation profile-group counts do not total 197');
    }
    for (const certification of certifications) {
        if (!groups.some((group) => group.lightingProfileId === certification.lightingProfileId)) {
            throw new Error(`Production validation omitted '${certification.lightingProfileId}'`);
        }
    }
    for (const group of groups) {
        const actualCaseCount = cases.filter(
            (entry) => entry.lightingProfileId === group.lightingProfileId
        ).length;
        if (group.caseCount !== actualCaseCount) {
            throw new Error(
                `Production validation group '${group.lightingProfileId}' case count is inconsistent`
            );
        }
    }
    const aggregateSeamPixelCount = cases.reduce(
        (sum, entry) => sum + entry.seamPixelCount,
        0
    );
    const aggregateSeamErrorPixelCount = cases.reduce(
        (sum, entry) => sum + entry.seamErrorPixelCount,
        0
    );
    const casesWithVisibleTileBoundary = cases.filter(
        (entry) => entry.seamPixelCount > 0
    ).length;
    if (tileBoundaryEvidence.aggregateSeamPixelCount
            !== aggregateSeamPixelCount
        || tileBoundaryEvidence.aggregateSeamErrorPixelCount
            !== aggregateSeamErrorPixelCount
        || tileBoundaryEvidence.casesWithVisibleTileBoundary
            !== casesWithVisibleTileBoundary) {
        throw new Error('Production validation tile-boundary aggregate differs from case metrics');
    }
    validateDynamicBusAggregate(report.dynamicBusEvidence, cases);
    return cloneCanonicalJson({
        browserDiagnosticGate: report.browserDiagnosticGate,
        canonicalSha256: rawCanonicalSha256(report),
        caseCount: EXPECTED_VALIDATION_CASE_COUNT,
        comparisonCondition: report.comparisonCondition,
        captureAuthentication,
        dynamicBusEvidence: report.dynamicBusEvidence,
        packageIndexSha256: rawCanonicalSha256(index),
        profileIds: AI531_PRODUCTION_RELEASE_PROFILE_IDS,
        rawSha256: source.rawSha256,
        schema: PRODUCTION_VALIDATION_EVIDENCE_SCHEMA,
        sourceShadowTexelPhaseEvidence,
        status: 'passed',
        tileBoundaryEvidence,
        timingContamination: report.timingContamination,
        zeroMissingOccluderPixelCount: true
    });
}

/**
 * @param {{rawSha256: string, report: unknown}} options
 */
export function buildLabValidationEvidence(options) {
    const source = requirePlainObject(options, 'Lab validation evidence options');
    requireExactKeys(
        source,
        ['rawSha256', 'report'],
        'Lab validation evidence options'
    );
    requireSha256(source.rawSha256, 'Lab validation report rawSha256');
    const report = requirePlainObject(source.report, 'Lab validation report');
    const validated = validateLabReleaseReport(report);
    return cloneCanonicalJson({
        ...validated,
        canonicalSha256: rawCanonicalSha256(report),
        rawSha256: source.rawSha256,
        schema: LAB_VALIDATION_EVIDENCE_SCHEMA,
        status: 'passed'
    });
}

/**
 * @param {{
 *   expectedLabValidationReportSha256?: string|null,
 *   expectedValidationReportSha256?: string|null,
 *   labValidationEvidence?: unknown|null,
 *   packageIndex: unknown,
 *   packageIndexSha256: string,
 *   profileCertifications: readonly unknown[] | Record<string, unknown>,
 *   validationEvidence?: unknown|null
 * }} options
 */
export function buildProductionReleaseCertification(options) {
    const source = requirePlainObject(options, 'production release certification options');
    requireOnlyKeys(source, [
        'expectedLabValidationReportSha256',
        'expectedValidationReportSha256',
        'labValidationEvidence',
        'packageIndex',
        'packageIndexSha256',
        'profileCertifications',
        'validationEvidence'
    ], 'production release certification options');
    requireSha256(source.packageIndexSha256, 'packageIndexSha256');
    const index = validateExactReleasePackageIndex(source.packageIndex);
    const profiles = normalizeProfileCertifications(
        source.profileCertifications,
        index
    );
    const expectedValidationReportSha256 = source.expectedValidationReportSha256 ?? null;
    if (expectedValidationReportSha256 !== null) {
        requireSha256(expectedValidationReportSha256, 'expectedValidationReportSha256');
    }
    const expectedLabValidationReportSha256 =
        source.expectedLabValidationReportSha256 ?? null;
    if (expectedLabValidationReportSha256 !== null) {
        requireSha256(
            expectedLabValidationReportSha256,
            'expectedLabValidationReportSha256'
        );
    }
    let labValidationEvidence = null;
    if (source.labValidationEvidence !== null
        && source.labValidationEvidence !== undefined) {
        if (expectedLabValidationReportSha256 === null) {
            throw new Error(
                'Passed Lab validation requires an independent expected report SHA-256'
            );
        }
        labValidationEvidence = validateLabValidationEvidence(
            source.labValidationEvidence
        );
        if (labValidationEvidence.rawSha256
            !== expectedLabValidationReportSha256) {
            throw new Error('Lab validation report differs from its explicit expected hash');
        }
    }
    let validationEvidence = null;
    if (source.validationEvidence !== null && source.validationEvidence !== undefined) {
        if (expectedValidationReportSha256 === null) {
            throw new Error(
                'Passed production validation requires an independent expected report SHA-256'
            );
        }
        validationEvidence = validateValidationEvidence(source.validationEvidence);
        if (validationEvidence.packageIndexSha256 !== source.packageIndexSha256) {
            throw new Error('Production validation evidence differs from the package index hash');
        }
        if (validationEvidence.rawSha256 !== expectedValidationReportSha256) {
            throw new Error('Production validation report differs from its explicit expected hash');
        }
        normalizeProductionLiveTexelPhaseEvidence(
            validationEvidence.sourceShadowTexelPhaseEvidence,
            {certifications: profiles, index}
        );
    }
    const sharedSource = sharedSourceIdentity(profiles);
    const profileEntries = profiles.map((entry) => ({
        certificationSha256: rawCanonicalSha256(entry),
        lightingProfileId: entry.lightingProfileId,
        packageAggregateSha256: entry.packageAggregateSha256,
        packagePath: entry.packagePath
    }));
    const alphaCutoutCoverage = buildReleaseAlphaCutoutCoverage(profiles);
    const blockers = [
        ...(alphaCutoutCoverage.status === 'complete'
            ? [] : ['alpha_cutout_release_union_incomplete']),
        ...(labValidationEvidence === null ? ['lab_validation_report_missing'] : []),
        ...(validationEvidence === null ? ['production_validation_report_missing'] : [])
    ];
    const releaseEligible = blockers.length === 0;
    return cloneCanonicalJson({
        alphaCutoutCoverage,
        blockers,
        expectedLabValidationReportSha256,
        expectedValidationReportSha256,
        labValidation: labValidationEvidence,
        packageIndexSha256: source.packageIndexSha256,
        performancePromotionEligible: false,
        profileCertificationSetSha256: rawCanonicalSha256({
            profiles: profileEntries,
            schema: 'ai531-production-profile-certification-set-v2'
        }),
        profileIds: AI531_PRODUCTION_RELEASE_PROFILE_IDS,
        profiles: profileEntries,
        releaseEligible,
        schema: PRODUCTION_RELEASE_CERTIFICATION_SCHEMA,
        sharedSource,
        status: releaseEligible ? 'passed' : 'validation_pending',
        validation: validationEvidence,
        zeroMissingOccluderCounts: {
            alpha: profiles.reduce((sum, entry) => sum + entry.alpha.missingOccluderCount, 0),
            caster: profiles.reduce((sum, entry) => sum + entry.casters.missingOccluderCount, 0),
            opaque: profiles.reduce((sum, entry) => sum + entry.opaque.missingOccluderCount, 0),
            labValidationPixels: labValidationEvidence === null ? null : 0,
            validationPixels: validationEvidence === null ? null : 0
        }
    });
}

function deriveCasterInventoryEvidence(manifest, receipt) {
    if (!Array.isArray(manifest.casterMappings)) {
        throw new TypeError('authenticated source manifest.casterMappings must be an array');
    }
    const selected = manifest.casterMappings
        .filter((entry) => entry?.channelRelevance?.static_sun_depth === true)
        .map((entry) => cloneCanonicalJson(entry))
        .sort((left, right) => compareCanonicalStrings(left.id, right.id));
    requireCanonicalUniqueIds(selected, 'selected caster mappings');
    if (selected.length !== AI531_PRODUCTION_CASTER_INVENTORY.selectedCasterCount
        || manifest.casterMappings.length !== selected.length
        || receipt.reconstruction?.selectedMappingCount !== selected.length
        || receipt.reconstruction?.inventory?.casterMappingCount !== selected.length
        || receipt.reconstruction?.completeSelectedChannel !== true
        || receipt.reconstruction?.channelId !== 'static_sun_depth') {
        throw new Error(
            'Production caster certification requires all 1968 accepted source casters and matching reconstruction counts'
        );
    }
    const categoryCounts = countNamedValues(selected, 'category');
    const coverageModeCounts = countNamedValues(selected, 'coverageMode');
    requireExpectedCounts(
        categoryCounts,
        AI531_PRODUCTION_CASTER_INVENTORY.categoryCounts,
        'caster category'
    );
    requireExpectedCounts(
        coverageModeCounts,
        AI531_PRODUCTION_CASTER_INVENTORY.coverageModeCounts,
        'caster coverage mode'
    );
    const inclusionProjection = selected.map((entry) => ({
        alphaInputId: entry.alphaInputId,
        category: entry.category,
        coverageMode: entry.coverageMode,
        id: entry.id,
        materialId: entry.materialId
    }));
    return {
        categoryCounts,
        coverageModeCounts,
        includedCasterIdsSha256: rawCanonicalSha256({
            ids: selected.map((entry) => entry.id),
            schema: 'ai531-production-included-caster-ids-v1'
        }),
        includedCasterProjectionSha256: rawCanonicalSha256({
            mappings: inclusionProjection,
            schema: 'ai531-production-included-caster-projection-v1'
        }),
        selected
    };
}

function deriveSourceIdentityHashes(manifest) {
    for (const key of ['alphaInputs', 'casterMappings', 'materials', 'textures']) {
        if (!Array.isArray(manifest[key])) {
            throw new TypeError(`authenticated source manifest.${key} must be an array`);
        }
    }
    const selected = manifest.casterMappings
        .filter((entry) => entry?.channelRelevance?.static_sun_depth === true)
        .map((entry) => cloneCanonicalJson(entry))
        .sort((left, right) => compareCanonicalStrings(left.id, right.id));
    const casterSidedness = requireStaticSunDepthCasterSidedness(
        manifest.channelProfiles?.find((entry) => entry.id === 'static_sun_depth')?.casterSidedness
    );
    const materialById = new Map(manifest.materials.map((entry) => [entry.id, entry]));
    for (const mapping of selected) {
        const material = materialById.get(mapping.materialId);
        const expectedPreserve = material?.preserveShadowSide === true
            || material?.isFoliage === true;
        const expectedEffective = resolveStaticSunDepthEffectiveShadowSide({
            side: material?.side,
            shadowSide: material?.shadowSide,
            preserveShadowSide: material?.preserveShadowSide,
            isFoliage: material?.isFoliage
        }, casterSidedness);
        if (mapping.side !== material?.side || mapping.shadowSide !== material?.shadowSide
            || mapping.preserveShadowSide !== expectedPreserve
            || mapping.effectiveShadowSide !== expectedEffective) {
            throw new Error(`Authenticated caster '${mapping.id}' sidedness does not recompute`);
        }
    }
    const materialIds = new Set(selected.map((entry) => entry.materialId));
    const alphaIds = new Set(selected.map((entry) => entry.alphaInputId));
    const materials = manifest.materials
        .filter((entry) => materialIds.has(entry.id))
        .map((entry) => ({
            alpha: entry.alpha,
            alphaInputId: entry.alphaInputId,
            id: entry.id,
            shadowSide: entry.shadowSide,
            side: entry.side,
            preserveShadowSide: entry.preserveShadowSide === true,
            isFoliage: entry.isFoliage === true,
            vertexColors: entry.vertexColors
        }))
        .sort((left, right) => compareCanonicalStrings(left.id, right.id));
    const alphaInputs = manifest.alphaInputs
        .filter((entry) => alphaIds.has(entry.id))
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
    return {
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
    };
}

function requireReceiptSourceIdentity(receipt, identities) {
    if (receipt.identity?.alphaSemanticsSha256 !== identities.alphaSemanticsSha256
        || receipt.input?.alphaSemanticsSha256 !== identities.alphaSemanticsSha256
        || receipt.identity?.casterInventorySha256 !== identities.casterInventorySha256
        || receipt.input?.casterInventorySha256 !== identities.casterInventorySha256) {
        throw new Error('Authenticated receipt differs from independently derived source identity');
    }
    for (const key of [
        'channelSourceSha256',
        'finalFileDomainSha256',
        'geometrySha256',
        'packageRawSha256',
        'resolvedSourceSha256',
        'usedMaterialsSha256'
    ]) requireSha256(receipt.input[key], `authenticated receipt.input.${key}`);
    requireSha256(receipt.compilerSignatureSha256, 'authenticated compiler signature');
    if (receipt.identity?.compilerSignatureSha256 !== receipt.compilerSignatureSha256) {
        throw new Error('Authenticated receipt compiler signature is inconsistent');
    }
}

function requireReleaseSamplingPolicy(descriptor, receipt, lightingProfileId) {
    if (receipt.schema !== 'ai531-static-sun-production-render-receipt-v5') {
        throw new Error('Authenticated receipt must use the final production render schema');
    }
    const request = requireExactKeys(receipt.request, [
        'boundsMarginMeters',
        'casterSidedness',
        'guardPixels',
        'interiorPixels',
        'lightingProfileId',
        'maxPayloadBytes',
        'phasePolicy',
        'sampling',
        'schema',
        'sourceShadowCapability',
        'sunPointDirectionWorld',
        'texelSizeMeters',
        'tileSizeMeters'
    ], 'authenticated receipt request');
    requireStaticSunDepthCasterSidedness(request.casterSidedness);
    if (request.schema !== 'ai531-static-sun-production-request-v4'
        || request.lightingProfileId !== lightingProfileId) {
        throw new Error('Authenticated receipt request is not the final profile-owned request');
    }
    const identity = requirePlainObject(descriptor.identity, 'authenticated descriptor identity');
    const exactTexelSizeMeters = 680 / 16384;
    requireCanonicalMatch(
        [1870, 1821],
        request.interiorPixels,
        'authenticated request rectangular interior'
    );
    requireCanonicalMatch(
        [1870 * exactTexelSizeMeters, 1821 * exactTexelSizeMeters],
        request.tileSizeMeters,
        'authenticated request rectangular tile size'
    );
    if (request.phasePolicy
            !== 'absolute-stable-basis-texel-edge-lattice-v1'
        || request.texelSizeMeters !== exactTexelSizeMeters) {
        throw new Error('Authenticated request is not on the exact live-shadow texel lattice');
    }
    const layout = requirePlainObject(identity.layout, 'authenticated descriptor layout');
    requireCanonicalMatch(
        request.interiorPixels,
        layout.interiorTexels,
        'authenticated descriptor rectangular interior'
    );
    if (layout.texelSizeMeters !== exactTexelSizeMeters) {
        throw new Error('Authenticated descriptor texel pitch differs from the live shadow');
    }
    const basis = requirePlainObject(identity.basis, 'authenticated descriptor basis');
    const boundsMinimum = requireFiniteVector2(
        layout.boundsLightMeters?.min,
        'authenticated descriptor minimum bounds'
    );
    const absoluteOriginProjection = [
        dot3(basis.originWorld, basis.rightAxisWorld),
        dot3(basis.originWorld, basis.upAxisWorld)
    ];
    const maximumPhaseError = Math.max(...boundsMinimum.map((entry, axis) => {
        const phase = (entry + absoluteOriginProjection[axis])
            / exactTexelSizeMeters;
        return Math.abs(phase - Math.round(phase));
    }));
    if (maximumPhaseError > 1e-9) {
        throw new Error('Authenticated descriptor is not phase-aligned to live shadow texel edges');
    }
    const direction = requireUnitVector3(
        identity.sunPointDirectionWorld,
        'authenticated descriptor sun direction'
    );
    const requestDirection = requireUnitVector3(
        request.sunPointDirectionWorld,
        'authenticated request sun direction'
    );
    if (!vectorsNearlyEqual(direction, requestDirection, 1e-12)) {
        throw new Error('Authenticated request and descriptor sun directions differ');
    }
    const sampling = requireExactKeys(identity.sampling, [
        'bias',
        'comparison',
        'emptyPolicy',
        'outOfBoundsPolicy',
        'pcf'
    ], 'authenticated descriptor sampling');
    if (sampling.comparison !== 'receiver-depth-minus-bias-lte-caster-depth-v1'
        || sampling.emptyPolicy !== 'visible-v1'
        || sampling.outOfBoundsPolicy !== 'fail-closed-zero-visibility-v1') {
        throw new Error('Authenticated descriptor comparison policy is unsupported');
    }
    const expectedBias = {
        constantDepthReliefMeters: 0.0697915,
        geometricNormalOffsetMeters: 0.0232,
        model: 'geometric-normal-offset-plus-constant-depth-relief-v1'
    };
    requireCanonicalMatch(expectedBias, sampling.bias, 'authenticated descriptor bias');
    const pcf = requireExactKeys(sampling.pcf, [
        'hardwareComparison',
        'model',
        'radiusTexels',
        'sampleCount',
        'screenRotation',
        'shadowMapSizeTexels',
        'shadowMapWorldExtentMeters',
        'sourceMapRightAxisWorld',
        'sourceMapUpAxisWorld'
    ], 'authenticated descriptor pcf');
    if (pcf.hardwareComparison !== 'linear-four-compare-taps-v1'
        || pcf.model !== 'three-r183-vogel-5-linear-compare-v1'
        || pcf.radiusTexels !== 1.5
        || pcf.sampleCount !== 5
        || pcf.screenRotation !== 'interleaved-gradient-noise-gl-fragcoord-v1'
        || canonicalJsonStringify(pcf.shadowMapSizeTexels) !== '[16384,16384]'
        || canonicalJsonStringify(pcf.shadowMapWorldExtentMeters) !== '[680,680]'
        || pcf.radiusTexels * pcf.shadowMapWorldExtentMeters[0]
            / pcf.shadowMapSizeTexels[0] !== 0.062255859375) {
        throw new Error('Authenticated descriptor differs from the effective Three r183 16384 filter');
    }
    const expectedAxes = deriveThreeR183FilterAxes(direction);
    const right = requireUnitVector3(
        pcf.sourceMapRightAxisWorld,
        'authenticated descriptor source-map right axis'
    );
    const up = requireUnitVector3(
        pcf.sourceMapUpAxisWorld,
        'authenticated descriptor source-map up axis'
    );
    if (!vectorsNearlyEqual(right, expectedAxes.rightAxisWorld, 1e-9)
        || !vectorsNearlyEqual(up, expectedAxes.upAxisWorld, 1e-9)) {
        throw new Error('Authenticated descriptor source-map axes differ from Three r183');
    }
    const requestSampling = requireExactKeys(
        request.sampling,
        ['bias', 'pcf'],
        'authenticated request sampling'
    );
    requireCanonicalMatch(
        expectedBias,
        requestSampling.bias,
        'authenticated request bias'
    );
    const requestPcf = requireExactKeys(requestSampling.pcf, [
        'hardwareComparison',
        'model',
        'radiusTexels',
        'sampleCount',
        'screenRotation',
        'shadowMapSizeTexels',
        'shadowMapWorldExtentMeters',
        'sourceMapRightAxisWorld',
        'sourceMapUpAxisWorld'
    ], 'authenticated request pcf');
    for (const key of [
        'hardwareComparison',
        'model',
        'radiusTexels',
        'sampleCount',
        'screenRotation',
        'shadowMapSizeTexels',
        'shadowMapWorldExtentMeters'
    ]) {
        requireCanonicalMatch(
            pcf[key],
            requestPcf[key],
            'authenticated request pcf.' + key
        );
    }
    const requestRight = requireUnitVector3(
        requestPcf.sourceMapRightAxisWorld,
        'authenticated request source-map right axis'
    );
    const requestUp = requireUnitVector3(
        requestPcf.sourceMapUpAxisWorld,
        'authenticated request source-map up axis'
    );
    if (!vectorsNearlyEqual(right, requestRight, 1e-12)
        || !vectorsNearlyEqual(up, requestUp, 1e-12)) {
        throw new Error(
            'Authenticated request and descriptor source-map axes differ'
        );
    }
    requireCanonicalMatch({
        id: 'three-r183-single-high-effective-16384-v1',
        mapSizeTexels: [16384, 16384],
        worldExtentMeters: [680, 680]
    }, request.sourceShadowCapability, 'authenticated request source-shadow capability');
}

function buildOpaqueRecord({ descriptorSha256, receipt, receiptSha256 }) {
    const raw = requireExactKeys(
        receipt.opaqueCertification,
        [
            'algorithm',
            'cutoutFirstHitExcludedSampleCount',
            'depthEpsilonMeters',
            'depthMismatchCount',
            'directionalGeometryFilter',
            'eligibleSampleCount',
            'maximumDepthErrorMeters',
            'occupancyMismatchCount',
            'opaqueAndForcedOpaquePolygonCount',
            'sampleCount',
            'samplePlan',
            'status'
        ],
        'authenticated receipt opaque certification'
    );
    const directionalGeometryFilter = requireExactKeys(
        raw.directionalGeometryFilter,
        [
            'algorithm',
            'filteredObjectCount',
            'removedPolygonCount',
            'sourcePolygonCount',
            'unchangedObjectCount',
            'visiblePolygonCount'
        ],
        'authenticated receipt directional geometry filter'
    );
    for (const key of [
        'filteredObjectCount',
        'removedPolygonCount',
        'sourcePolygonCount',
        'unchangedObjectCount',
        'visiblePolygonCount'
    ]) {
        if (!Number.isSafeInteger(directionalGeometryFilter[key])
            || directionalGeometryFilter[key] < 0) {
            throw new TypeError(
                `authenticated receipt directional geometry filter.${key} must be a non-negative safe integer`
            );
        }
    }
    if (raw.status !== 'verified'
        || raw.algorithm !== 'blender_bvhtree_direction_filtered_primary_ray_v3'
        || raw.depthEpsilonMeters !== PRODUCTION_OPAQUE_BVH_DEPTH_EPSILON_METERS
        || raw.samplePlan
            !== '32_by_32_stratified_grid_plus_lcg_seed_531_to_2048_unique_texels'
        || !Number.isSafeInteger(raw.opaqueAndForcedOpaquePolygonCount)
        || raw.opaqueAndForcedOpaquePolygonCount <= 0
        || directionalGeometryFilter.algorithm
            !== 'world_space_direction_filtered_mesh_faces_v1'
        || directionalGeometryFilter.sourcePolygonCount <= 0
        || directionalGeometryFilter.visiblePolygonCount <= 0
        || directionalGeometryFilter.visiblePolygonCount
            + directionalGeometryFilter.removedPolygonCount
            !== directionalGeometryFilter.sourcePolygonCount
        || directionalGeometryFilter.filteredObjectCount
            + directionalGeometryFilter.unchangedObjectCount <= 0
        || receipt.assumptions?.sidedness
            !== 'authenticated-three-r183-effective-shadow-side-then-world-space-direction-filter-v1'
        || raw.depthMismatchCount !== 0
        || raw.occupancyMismatchCount !== 0
        || raw.eligibleSampleCount + raw.cutoutFirstHitExcludedSampleCount
            !== raw.sampleCount) {
        throw new Error('Authenticated opaque BVH evidence contains a mismatch');
    }
    const bvhTruthSha256 = rawCanonicalSha256({
        algorithm: raw.algorithm,
        casterInventorySha256: receipt.identity.casterInventorySha256,
        directionalGeometryFilter,
        geometrySha256: receipt.input.geometrySha256,
        layout: receipt.layout,
        samplePlan: raw.samplePlan,
        schema: 'ai531-production-opaque-bvh-truth-authority-v2',
        sidednessAssumption: receipt.assumptions.sidedness
    });
    const evidenceSha256 = rawCanonicalSha256({
        opaqueCertification: raw,
        outputs: receipt.outputs,
        receiptSha256,
        schema: 'ai531-production-opaque-bvh-result-evidence-v1'
    });
    return buildOpaqueOccluderCertificationRecord({
        bvhTruthSha256,
        cacheDescriptorSha256: descriptorSha256,
        depthToleranceMeters: raw.depthEpsilonMeters,
        evidenceSha256,
        matchingSampleCount: raw.eligibleSampleCount,
        maximumAbsoluteDepthErrorMeters: raw.maximumDepthErrorMeters,
        missingOccluderCount: raw.occupancyMismatchCount,
        sampleCount: raw.eligibleSampleCount,
        unexpectedOccluderCount: 0
    });
}

function buildAlphaRecord({
    descriptorSha256,
    inventory,
    lightingProfileId,
    manifest,
    receipt,
    receiptSha256
}) {
    const raw = requirePlainObject(
        receipt.alphaCertification,
        'authenticated receipt alpha certification'
    );
    const expectedCoverage = deriveExpectedAlphaCoverage(manifest, inventory.selected);
    const expectedForcedOpaqueMaterialVariantCount = new Set(
        inventory.selected
            .filter((entry) => entry.coverageMode === 'forced_opaque')
            .map((entry) => entry.materialId)
    ).size;
    const expectedStatus = raw.nativeCutoutField
        ? 'native_three_mixed_mesh_field_min_merged_with_cycles_opaque_including_mixed_foliage_verified'
        : 'exact_inputs_and_binary_render_output_verified';
    if (raw.status !== expectedStatus
        || canonicalJsonStringify(raw.cutoutMaterialIds)
            !== canonicalJsonStringify(expectedCoverage.cutoutMaterialIds)
        || canonicalJsonStringify(raw.coverageInputs)
            !== canonicalJsonStringify(expectedCoverage.coverageInputs)
        || raw.cutoutMaterialCount !== expectedCoverage.cutoutMaterialIds.length
        || raw.exactCoverageInputCount !== expectedCoverage.exactCoverageInputCount
        || raw.forcedOpaqueMaterialVariantCount
            !== expectedForcedOpaqueMaterialVariantCount) {
        throw new Error('Authenticated alpha receipt differs from exact source coverage inputs');
    }
    const expectedCasterCount = inventory.coverageModeCounts.cutout;
    if (!raw.spatialParityArtifact) {
        if (expectedCoverage.unsupportedBindingIds.length > 0) {
            throw new Error(
                'Unsupported mipmapped or anisotropic cutout reconstruction requires an explicit compatible parity artifact'
            );
        }
        throw new Error(
            'Alpha-cutout release certification requires authenticated measured spatial occupancy and first-hit-depth evidence'
        );
    }
    const parityArtifact = validateProductionAlphaCutoutSpatialParityArtifact(
        raw.spatialParityArtifact,
        {
            alphaSemanticsSha256: receipt.identity.alphaSemanticsSha256,
            casterInventorySha256: receipt.identity.casterInventorySha256,
            cutoutBindingProjectionSha256:
                expectedCoverage.cutoutBindingProjectionSha256,
            cutoutCasterCount: expectedCasterCount,
            cutoutCasterIdsSha256: expectedCoverage.cutoutCasterIdsSha256,
            descriptorSha256,
            lightingProfileId,
            unsupportedBindingIds: expectedCoverage.unsupportedBindingIds
        }
    );
    const parityArtifactSha256 = rawCanonicalSha256(parityArtifact);
    const v2Coverage = parityArtifact.schema
        === PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_V2_SCHEMA;
    const certifiedCasterIds = v2Coverage
        ? parityArtifact.inCoverageCasterIds
        : expectedCoverage.cutoutCasterIds;
    const outOfCoverageCasterIds = v2Coverage
        ? parityArtifact.outOfCoverageCasterIds
        : [];
    return buildAlphaCutoutCoverageCertificationRecord({
        alphaSemanticsSha256: receipt.identity.alphaSemanticsSha256,
        certifiedCasterCount: certifiedCasterIds.length,
        certifiedCasterIds,
        cutoutBindingProjectionSha256:
            expectedCoverage.cutoutBindingProjectionSha256,
        cutoutCasterIdsSha256: expectedCoverage.cutoutCasterIdsSha256,
        evidenceSha256: rawCanonicalSha256({
            coverageInputs: expectedCoverage.coverageInputs,
            forcedOpaqueMaterialVariantCount: expectedForcedOpaqueMaterialVariantCount,
            parityArtifact,
            parityArtifactSha256,
            receiptAlphaCertification: raw,
            receiptSha256,
            schema: 'ai531-production-alpha-cutout-evidence-v3'
        }),
        expectedCasterCount,
        firstHitDepthSampleCount: parityArtifact.firstHitDepthSampleCount,
        firstHitDepthToleranceMeters: parityArtifact.firstHitDepthToleranceMeters,
        matchingSampleCount: parityArtifact.matchingOccupancySampleCount,
        maximumAbsoluteFirstHitDepthErrorMeters:
            parityArtifact.maximumAbsoluteFirstHitDepthErrorMeters,
        mismatchCounts: parityArtifact.mismatchCounts,
        missingOccluderCount: parityArtifact.missingOccluderCount,
        outOfCoverageCasterIds,
        parityArtifactSha256,
        sampleCount: parityArtifact.sampleCount,
        samplePlanSha256: parityArtifact.samplePlanSha256,
        unexpectedOccluderCount: parityArtifact.unexpectedOccluderCount
    });
}

function deriveExpectedAlphaCoverage(manifest, selected) {
    const cutoutMappings = selected.filter((entry) => entry.coverageMode === 'cutout');
    const cutoutMaterialIds = [...new Set(cutoutMappings.map((entry) => entry.materialId))]
        .sort(compareCanonicalStrings);
    const materials = new Map(manifest.materials.map((entry) => [entry.id, entry]));
    const alphaInputs = new Map(manifest.alphaInputs.map((entry) => [entry.id, entry]));
    const textures = new Map(manifest.textures.map((entry) => [entry.id, entry]));
    const sampledBuffers = new Map();
    const samplerBindings = new Map();
    let exactCoverageInputCount = 0;
    const coverageInputs = cutoutMaterialIds.map((materialId) => {
        const material = requirePlainObject(
            materials.get(materialId),
            `cutout material '${materialId}'`
        );
        const alpha = requirePlainObject(
            alphaInputs.get(material.alphaInputId),
            `cutout alpha input '${material.alphaInputId}'`
        );
        const alphaEntries = alpha.alpha?.inputs;
        if (!Array.isArray(alphaEntries) || alphaEntries.length === 0) {
            throw new Error(`Cutout material '${materialId}' has no exact alpha inputs`);
        }
        const inputs = alphaEntries.map((entry) => {
            const binding = requirePlainObject(
                textures.get(entry.bindingId),
                `alpha binding '${entry.bindingId}'`
            );
            const textureSource = requirePlainObject(
                textures.get(binding.sourceId),
                `alpha texture source '${binding.sourceId}'`
            );
            samplerBindings.set(binding.id, projectCutoutSamplerBinding(binding));
            const coverage = requirePlainObject(
                textureSource.coverageChannels?.[entry.channel],
                `alpha coverage '${textureSource.id}:${entry.channel}'`
            );
            requireSha256(coverage.sha256, 'alpha source coverage sha256');
            requirePositiveInteger(coverage.pixelCount, 'alpha source coverage pixelCount');
            requireSha256(textureSource.contentSha256, 'alpha source contentSha256');
            const coverageBufferId = `${textureSource.id}:coverage:${entry.channel}`;
            const prior = sampledBuffers.get(coverageBufferId);
            if (prior !== undefined && prior !== coverage.pixelCount) {
                throw new Error(`Alpha coverage buffer '${coverageBufferId}' has inconsistent size`);
            }
            sampledBuffers.set(coverageBufferId, coverage.pixelCount);
            return {
                bindingId: binding.id,
                channel: entry.channel,
                coverageBufferId,
                coverageSha256: coverage.sha256,
                operation: entry.operation,
                sourceContentSha256: textureSource.contentSha256,
                sourceId: textureSource.id
            };
        }).sort((left, right) => compareCanonicalStrings(
            `${left.bindingId}\u0000${left.channel}`,
            `${right.bindingId}\u0000${right.channel}`
        ));
        exactCoverageInputCount += inputs.length;
        return {
            alphaInputId: alpha.id,
            alphaTest: alpha.alpha.alphaTest,
            inputs,
            materialId,
            opacity: alpha.alpha.opacity,
            vertexColors: alpha.vertexColors
        };
    });
    const cutoutCasterIds = cutoutMappings.map((entry) => entry.id)
        .sort(compareCanonicalStrings);
    const bindingProjection = [...samplerBindings.values()]
        .sort((left, right) => compareCanonicalStrings(left.id, right.id));
    const unsupportedBindingIds = bindingProjection
        .filter((binding) => MIPMAPPED_MIN_FILTERS.has(binding.minFilter)
            || binding.anisotropy !== 1)
        .map((binding) => binding.id);
    return {
        coverageInputs,
        cutoutBindingProjectionSha256: rawCanonicalSha256({
            bindings: bindingProjection,
            schema: CUTOUT_BINDING_PROJECTION_SCHEMA
        }),
        cutoutCasterIdsSha256: rawCanonicalSha256({
            casterIds: cutoutCasterIds,
            schema: CUTOUT_CASTER_PLAN_SCHEMA
        }),
        cutoutCasterIds,
        cutoutMaterialIds,
        exactCoverageInputCount,
        unsupportedBindingIds
    };
}

export function deriveProductionAlphaCutoutCoverageIdentity(manifestValue) {
    const manifest = requirePlainObject(
        manifestValue,
        'authenticated alpha-cutout coverage manifest'
    );
    if (!Array.isArray(manifest.casterMappings)) {
        throw new TypeError(
            'authenticated alpha-cutout coverage manifest.casterMappings must be an array'
        );
    }
    const selected = manifest.casterMappings
        .filter((entry) => entry?.channelRelevance?.static_sun_depth === true)
        .map((entry) => cloneCanonicalJson(entry))
        .sort((left, right) => compareCanonicalStrings(left.id, right.id));
    requireCanonicalUniqueIds(selected, 'alpha-cutout coverage caster mappings');
    const coverage = deriveExpectedAlphaCoverage(manifest, selected);
    return cloneCanonicalJson({
        cutoutBindingProjectionSha256:
            coverage.cutoutBindingProjectionSha256,
        cutoutCasterCount: coverage.cutoutCasterIds.length,
        cutoutCasterIds: coverage.cutoutCasterIds,
        cutoutCasterIdsSha256: coverage.cutoutCasterIdsSha256,
        unsupportedBindingIds: coverage.unsupportedBindingIds
    });
}

function projectCutoutSamplerBinding(value) {
    const binding = requirePlainObject(value, 'cutout texture binding');
    const projection = {
        anisotropy: binding.anisotropy,
        center: binding.center,
        channel: binding.channel,
        colorSpace: binding.colorSpace,
        flipY: binding.flipY,
        generateMipmaps: binding.generateMipmaps,
        id: binding.id,
        magFilter: binding.magFilter,
        mapping: binding.mapping,
        matrix: binding.matrix,
        matrixAutoUpdate: binding.matrixAutoUpdate,
        minFilter: binding.minFilter,
        offset: binding.offset,
        premultiplyAlpha: binding.premultiplyAlpha,
        repeat: binding.repeat,
        rotation: binding.rotation,
        sourceId: binding.sourceId,
        unpackAlignment: binding.unpackAlignment,
        wrapS: binding.wrapS,
        wrapT: binding.wrapT
    };
    requireNonEmptyString(projection.id, 'cutout texture binding.id');
    requireNonEmptyString(projection.sourceId, 'cutout texture binding.sourceId');
    for (const key of [
        'anisotropy', 'channel', 'magFilter', 'mapping', 'minFilter',
        'rotation', 'unpackAlignment', 'wrapS', 'wrapT'
    ]) requireFiniteNumber(projection[key], `cutout texture binding.${key}`);
    if (projection.anisotropy < 1
        || typeof projection.colorSpace !== 'string'
        || typeof projection.flipY !== 'boolean'
        || typeof projection.generateMipmaps !== 'boolean'
        || typeof projection.matrixAutoUpdate !== 'boolean'
        || typeof projection.premultiplyAlpha !== 'boolean'
        || !Array.isArray(projection.matrix)
        || projection.matrix.length !== 9
        || projection.matrix.some((entry) => !Number.isFinite(entry))) {
        throw new TypeError(
            `Cutout texture binding '${projection.id}' has incomplete authenticated sampler semantics`
        );
    }
    for (const [key, length] of [['center', 2], ['offset', 2], ['repeat', 2]]) {
        if (!Array.isArray(projection[key])
            || projection[key].length !== length
            || projection[key].some((entry) => !Number.isFinite(entry))) {
            throw new TypeError(
                `Cutout texture binding '${projection.id}'.${key} is invalid`
            );
        }
    }
    return cloneCanonicalJson(projection);
}

function buildCasterRecord({ inventory, receipt, receiptSha256 }) {
    return buildCasterExclusionCertificationRecord({
        casterInventorySha256: receipt.identity.casterInventorySha256,
        certifiedCategoryCount: Object.keys(inventory.categoryCounts).length,
        evidenceSha256: rawCanonicalSha256({
            casterInventorySha256: receipt.identity.casterInventorySha256,
            includedCasterIdsSha256: inventory.includedCasterIdsSha256,
            includedCasterProjectionSha256: inventory.includedCasterProjectionSha256,
            receiptReconstruction: receipt.reconstruction,
            receiptSha256,
            schema: 'ai531-production-caster-inclusion-evidence-v1'
        }),
        exclusions: [],
        includedCasterCount: receipt.reconstruction.selectedMappingCount,
        inventoryCasterCount: inventory.selected.length,
        inventoryCategoryCount: Object.keys(inventory.categoryCounts).length,
        missingOccluderCount: inventory.selected.length
            - receipt.reconstruction.selectedMappingCount
    });
}

function validateExactReleasePackageIndex(value) {
    const index = cloneCanonicalJson(value);
    requireExactKeys(index, ['profiles', 'schema'], 'production package index');
    if (index.schema !== PACKAGE_INDEX_SCHEMA) {
        throw new Error(`Production package index schema must be '${PACKAGE_INDEX_SCHEMA}'`);
    }
    const profiles = requirePlainObject(index.profiles, 'production package index profiles');
    const ids = Object.keys(profiles).sort(compareCanonicalStrings);
    if (canonicalJsonStringify(ids)
        !== canonicalJsonStringify(AI531_PRODUCTION_RELEASE_PROFILE_IDS)) {
        throw new Error('Production release requires the exact eight non-lab profiles');
    }
    for (const lightingProfileId of ids) {
        const entry = requirePlainObject(
            profiles[lightingProfileId],
            `package index profile '${lightingProfileId}'`
        );
        requireExactKeys(
            entry,
            ['liveIdentity', 'packagePath'],
            `package index profile '${lightingProfileId}'`
        );
        requirePackagePath(entry.packagePath, lightingProfileId);
        validateLiveIdentity(entry.liveIdentity, lightingProfileId);
    }
    return index;
}

function normalizeProfileCertifications(value, index) {
    let values;
    if (Array.isArray(value)) {
        values = [...value];
    } else {
        const source = requirePlainObject(value, 'profile certifications');
        values = Object.values(source);
    }
    if (values.length !== AI531_PRODUCTION_RELEASE_PROFILE_IDS.length) {
        throw new Error('Production release requires exactly eight profile certifications');
    }
    const byId = new Map();
    for (const value of values) {
        const candidate = requirePlainObject(value, 'profile certification');
        if (byId.has(candidate.lightingProfileId)) {
            throw new Error(`Duplicate profile certification '${candidate.lightingProfileId}'`);
        }
        const indexed = index.profiles[candidate.lightingProfileId];
        if (!indexed) {
            throw new Error(`Unexpected profile certification '${candidate.lightingProfileId}'`);
        }
        const validated = validateProductionProfileReleaseCertification(candidate, {
            lightingProfileId: candidate.lightingProfileId,
            liveIdentity: indexed.liveIdentity,
            packagePath: indexed.packagePath
        });
        byId.set(candidate.lightingProfileId, validated);
    }
    return AI531_PRODUCTION_RELEASE_PROFILE_IDS.map((id) => {
        const record = byId.get(id);
        if (!record) throw new Error(`Missing profile certification '${id}'`);
        return record;
    });
}

function normalizeValidationGroups(value, index) {
    if (!Array.isArray(value) || value.length !== AI531_PRODUCTION_RELEASE_PROFILE_IDS.length) {
        throw new Error('Production validation report must contain exactly eight profile groups');
    }
    const groups = value.map((entry) => {
        const group = requirePlainObject(entry, 'production validation profile group');
        requireExactKeys(group, [
            'caseCount',
            'lightingProfileId',
            'packagePath',
            'sourceShadowFilterIdentity'
        ], 'production validation profile group');
        const lightingProfileId = requireReleaseProfileId(
            group.lightingProfileId,
            'production validation profile group lightingProfileId'
        );
        if (group.packagePath !== index.profiles[lightingProfileId].packagePath
            || !Number.isSafeInteger(group.caseCount)
            || group.caseCount <= 0) {
            throw new Error(`Production validation group '${lightingProfileId}' is inconsistent`);
        }
        requireReportedLiveFilterIdentity(
            group.sourceShadowFilterIdentity,
            lightingProfileId
        );
        return {
            caseCount: group.caseCount,
            lightingProfileId,
            packagePath: group.packagePath,
            sourceShadowFilterIdentity: group.sourceShadowFilterIdentity
        };
    }).sort((left, right) => compareCanonicalStrings(
        left.lightingProfileId,
        right.lightingProfileId
    ));
    const ids = groups.map((entry) => entry.lightingProfileId);
    if (new Set(ids).size !== ids.length
        || canonicalJsonStringify(ids)
            !== canonicalJsonStringify(AI531_PRODUCTION_RELEASE_PROFILE_IDS)) {
        throw new Error('Production validation groups differ from the exact release profiles');
    }
    return groups;
}

function normalizeProductionLiveTexelPhaseEvidence(value, bindings = {}) {
    if (!Array.isArray(value)
        || value.length !== AI531_PRODUCTION_RELEASE_PROFILE_IDS.length) {
        throw new Error(
            'Production validation must contain live texel phase evidence for exactly eight profiles'
        );
    }
    const certifications = bindings.certifications ?? null;
    const certificationById = certifications === null
        ? null
        : new Map(certifications.map((entry) => [entry.lightingProfileId, entry]));
    const index = bindings.index ?? null;
    return value.map((entryValue, entryIndex) => {
        const label = `production live texel phase evidence[${entryIndex}]`;
        const entry = requireExactKeys(entryValue, [
            'descriptorSha256',
            'evidence',
            'lightingProfileId',
            'packageAggregateSha256',
            'packagePath'
        ], label);
        const lightingProfileId = requireReleaseProfileId(
            entry.lightingProfileId,
            `${label}.lightingProfileId`
        );
        if (lightingProfileId !== AI531_PRODUCTION_RELEASE_PROFILE_IDS[entryIndex]) {
            throw new Error(
                'Production live texel phase evidence differs from the exact ordered profile inventory'
            );
        }
        requireSha256(entry.descriptorSha256, `${label}.descriptorSha256`);
        requireSha256(
            entry.packageAggregateSha256,
            `${label}.packageAggregateSha256`
        );
        requirePackagePath(entry.packagePath, lightingProfileId);
        if (index !== null
            && entry.packagePath !== index.profiles[lightingProfileId]?.packagePath) {
            throw new Error(
                `Production live texel phase evidence '${lightingProfileId}' differs from its package index`
            );
        }
        if (certificationById !== null) {
            const certification = certificationById.get(lightingProfileId);
            if (!certification
                || entry.descriptorSha256 !== certification.descriptorSha256
                || entry.packageAggregateSha256 !== certification.packageAggregateSha256
                || entry.packagePath !== certification.packagePath) {
                throw new Error(
                    `Production live texel phase evidence '${lightingProfileId}' differs from its authenticated package`
                );
            }
        }
        return cloneCanonicalJson({
            descriptorSha256: entry.descriptorSha256,
            evidence: requireProductionLiveTexelPhaseEvidence(
                entry.evidence,
                lightingProfileId
            ),
            lightingProfileId,
            packageAggregateSha256: entry.packageAggregateSha256,
            packagePath: entry.packagePath
        });
    });
}

function requireProductionLiveTexelPhaseEvidence(value, lightingProfileId) {
    const label = `production live texel phase proof '${lightingProfileId}'`;
    const evidence = requireExactKeys(value, [
        'cacheAbsoluteGridEdgeTexelIndices',
        'cacheAbsoluteGridEdgesMeters',
        'cacheBasis',
        'cacheBoundsLightMeters',
        'cacheFirstTexelCenterLightMeters',
        'cacheTexelPitchMeters',
        'cacheToLivePhaseIndices',
        'liveMatchedSignedPermutation',
        'liveSignedPermutationMaximumError',
        'liveSourceToCacheLightAxisTransform',
        'matchedSignedPermutation',
        'maximumEdgePhaseErrorTexels',
        'maximumPhaseIndexError',
        'policy',
        'schema',
        'signedPermutationMaximumError',
        'sourceAxisMaximumError',
        'sourceCameraBoundsMeters',
        'sourceCameraCenterCacheLightMeters',
        'sourceCameraCenterMaximumSnapErrorTexels',
        'sourceCameraCenterSourceMeters',
        'sourceCameraCenterTexelIndices',
        'sourceCameraCenterWorld',
        'sourceLowerTexelCenterCacheLightMeters',
        'sourceLowerTexelCenterOffsetMeters',
        'sourceMapRightAxisWorld',
        'sourceMapUpAxisWorld',
        'sourceTexelPitchMeters',
        'sourceToCacheLightAxisTransform',
        'status'
    ], label);
    if (evidence.schema !== LIVE_TEXEL_PHASE_EVIDENCE_SCHEMA
        || evidence.policy !== LIVE_TEXEL_PHASE_POLICY
        || evidence.status !== 'verified'
        || evidence.cacheTexelPitchMeters !== LIVE_TEXEL_PITCH_METERS) {
        throw new Error(`${label} has an unsupported schema, policy, status, or pitch`);
    }
    const sourcePitch = requireFiniteVector2(
        evidence.sourceTexelPitchMeters,
        `${label}.sourceTexelPitchMeters`
    );
    if (sourcePitch[0] !== LIVE_TEXEL_PITCH_METERS
        || sourcePitch[1] !== LIVE_TEXEL_PITCH_METERS) {
        throw new Error(`${label} does not use the exact 1:1 live source pitch`);
    }

    const basis = requireExactKeys(evidence.cacheBasis, [
        'originWorld',
        'rightAxisWorld',
        'upAxisWorld'
    ], `${label}.cacheBasis`);
    const originWorld = requireFiniteVector3(
        basis.originWorld,
        `${label}.cacheBasis.originWorld`
    );
    const cacheAxes = [
        requireUnitVector3(basis.rightAxisWorld, `${label}.cache right axis`),
        requireUnitVector3(basis.upAxisWorld, `${label}.cache up axis`)
    ];
    if (Math.abs(dot3(cacheAxes[0], cacheAxes[1])) > LIVE_TEXEL_PHASE_TOLERANCE) {
        throw new Error(`${label} cache axes are not orthogonal`);
    }
    const sourceAxes = [
        requireUnitVector3(
            evidence.sourceMapRightAxisWorld,
            `${label}.sourceMapRightAxisWorld`
        ),
        requireUnitVector3(
            evidence.sourceMapUpAxisWorld,
            `${label}.sourceMapUpAxisWorld`
        )
    ];
    const canonicalProfile = EXPECTED_VALIDATION_CASES.find(
        (entry) => entry.lightingProfileId === lightingProfileId
    )?.sunProfile;
    if (!canonicalProfile) throw new Error(`${label} has no canonical sun profile`);
    const expectedSourceAxes = deriveThreeR183FilterAxes(
        sunPointDirectionFromAngles(
            canonicalProfile.azimuthDeg,
            canonicalProfile.elevationDeg
        )
    );
    const expectedSourceAxisArray = [
        expectedSourceAxes.rightAxisWorld,
        expectedSourceAxes.upAxisWorld
    ];
    const sourceAxisMaximumError = maximumVectorSetDifference(
        sourceAxes,
        expectedSourceAxisArray
    );
    requireConsistentPhaseError(
        evidence.sourceAxisMaximumError,
        sourceAxisMaximumError,
        `${label}.sourceAxisMaximumError`
    );

    const expectedTransform = cacheAxes.map((cacheAxis) => (
        sourceAxes.map((sourceAxis) => dot3(cacheAxis, sourceAxis))
    ));
    const sourceTransform = requireMatrix2(
        evidence.sourceToCacheLightAxisTransform,
        `${label}.sourceToCacheLightAxisTransform`
    );
    const liveTransform = requireMatrix2(
        evidence.liveSourceToCacheLightAxisTransform,
        `${label}.liveSourceToCacheLightAxisTransform`
    );
    if (!matricesNearlyEqual(sourceTransform, expectedTransform)
        || !matricesNearlyEqual(liveTransform, expectedTransform)) {
        throw new Error(`${label} source/cache axis transform is inconsistent`);
    }
    const matchedPermutation = requireSignedPermutation2(
        evidence.matchedSignedPermutation,
        `${label}.matchedSignedPermutation`
    );
    const liveMatchedPermutation = requireSignedPermutation2(
        evidence.liveMatchedSignedPermutation,
        `${label}.liveMatchedSignedPermutation`
    );
    if (canonicalJsonStringify(matchedPermutation)
            !== canonicalJsonStringify(liveMatchedPermutation)) {
        throw new Error(`${label} static and live signed permutations differ`);
    }
    requireConsistentPhaseError(
        evidence.signedPermutationMaximumError,
        maximumMatrixDifference(sourceTransform, matchedPermutation),
        `${label}.signedPermutationMaximumError`
    );
    requireConsistentPhaseError(
        evidence.liveSignedPermutationMaximumError,
        maximumMatrixDifference(liveTransform, liveMatchedPermutation),
        `${label}.liveSignedPermutationMaximumError`
    );

    const bounds = requireLightBounds(
        evidence.cacheBoundsLightMeters,
        `${label}.cacheBoundsLightMeters`
    );
    const absoluteEdges = requireLightBounds(
        evidence.cacheAbsoluteGridEdgesMeters,
        `${label}.cacheAbsoluteGridEdgesMeters`
    );
    const originProjection = cacheAxes.map((axis) => dot3(originWorld, axis));
    const expectedAbsoluteEdges = {
        min: bounds.min.map((entry, axis) => entry + originProjection[axis]),
        max: bounds.max.map((entry, axis) => entry + originProjection[axis])
    };
    if (!vectorsNearlyEqual(absoluteEdges.min, expectedAbsoluteEdges.min, 1e-9)
        || !vectorsNearlyEqual(absoluteEdges.max, expectedAbsoluteEdges.max, 1e-9)) {
        throw new Error(`${label} absolute cache edges are inconsistent`);
    }
    const edgeIndices = requireExactKeys(
        evidence.cacheAbsoluteGridEdgeTexelIndices,
        ['max', 'min'],
        `${label}.cacheAbsoluteGridEdgeTexelIndices`
    );
    const reportedEdgeIndices = {
        min: requireFiniteVector2(edgeIndices.min, `${label}.edgeIndices.min`),
        max: requireFiniteVector2(edgeIndices.max, `${label}.edgeIndices.max`)
    };
    const expectedEdgeIndices = {
        min: expectedAbsoluteEdges.min.map((entry) => entry / LIVE_TEXEL_PITCH_METERS),
        max: expectedAbsoluteEdges.max.map((entry) => entry / LIVE_TEXEL_PITCH_METERS)
    };
    if (!vectorsNearlyEqual(reportedEdgeIndices.min, expectedEdgeIndices.min, 1e-9)
        || !vectorsNearlyEqual(reportedEdgeIndices.max, expectedEdgeIndices.max, 1e-9)) {
        throw new Error(`${label} cache edge indices are inconsistent`);
    }
    const maximumEdgePhaseError = maximumIntegerPhaseError([
        ...expectedEdgeIndices.min,
        ...expectedEdgeIndices.max
    ]);
    requireConsistentPhaseError(
        evidence.maximumEdgePhaseErrorTexels,
        maximumEdgePhaseError,
        `${label}.maximumEdgePhaseErrorTexels`
    );

    const cameraBounds = requireExactKeys(evidence.sourceCameraBoundsMeters, [
        'bottom',
        'left',
        'right',
        'top'
    ], `${label}.sourceCameraBoundsMeters`);
    for (const key of ['bottom', 'left', 'right', 'top']) {
        requireFiniteNumber(cameraBounds[key], `${label}.sourceCameraBoundsMeters.${key}`);
    }
    if (Math.abs(cameraBounds.right - cameraBounds.left - 680) > 1e-9
        || Math.abs(cameraBounds.top - cameraBounds.bottom - 680) > 1e-9) {
        throw new Error(`${label} live shadow camera extent differs from 680 metres`);
    }
    const cameraCenterWorld = requireFiniteVector3(
        evidence.sourceCameraCenterWorld,
        `${label}.sourceCameraCenterWorld`
    );
    const expectedCenterSource = sourceAxes.map(
        (axis) => dot3(cameraCenterWorld, axis)
    );
    const centerSource = requireFiniteVector2(
        evidence.sourceCameraCenterSourceMeters,
        `${label}.sourceCameraCenterSourceMeters`
    );
    if (!vectorsNearlyEqual(centerSource, expectedCenterSource, 1e-9)) {
        throw new Error(`${label} source camera center projection is inconsistent`);
    }
    const expectedCenterIndices = expectedCenterSource.map(
        (entry) => entry / LIVE_TEXEL_PITCH_METERS
    );
    const centerIndices = requireFiniteVector2(
        evidence.sourceCameraCenterTexelIndices,
        `${label}.sourceCameraCenterTexelIndices`
    );
    if (!vectorsNearlyEqual(centerIndices, expectedCenterIndices, 1e-9)) {
        throw new Error(`${label} source camera center texel indices are inconsistent`);
    }
    requireConsistentPhaseError(
        evidence.sourceCameraCenterMaximumSnapErrorTexels,
        maximumIntegerPhaseError(expectedCenterIndices),
        `${label}.sourceCameraCenterMaximumSnapErrorTexels`
    );

    const relativeCameraCenter = cameraCenterWorld.map(
        (entry, axis) => entry - originWorld[axis]
    );
    const expectedCenterCache = cacheAxes.map(
        (axis) => dot3(relativeCameraCenter, axis)
    );
    const centerCache = requireFiniteVector2(
        evidence.sourceCameraCenterCacheLightMeters,
        `${label}.sourceCameraCenterCacheLightMeters`
    );
    if (!vectorsNearlyEqual(centerCache, expectedCenterCache, 1e-9)) {
        throw new Error(`${label} cache-space camera center is inconsistent`);
    }
    const expectedLowerOffset = [
        cameraBounds.left + LIVE_TEXEL_PITCH_METERS / 2,
        cameraBounds.bottom + LIVE_TEXEL_PITCH_METERS / 2
    ];
    const lowerOffset = requireFiniteVector2(
        evidence.sourceLowerTexelCenterOffsetMeters,
        `${label}.sourceLowerTexelCenterOffsetMeters`
    );
    if (!vectorsNearlyEqual(lowerOffset, expectedLowerOffset, 1e-9)) {
        throw new Error(`${label} source lower texel-center offset is inconsistent`);
    }
    const expectedLowerCache = expectedCenterCache.map((center, cacheAxis) => (
        center
        + expectedTransform[cacheAxis][0] * expectedLowerOffset[0]
        + expectedTransform[cacheAxis][1] * expectedLowerOffset[1]
    ));
    const lowerCache = requireFiniteVector2(
        evidence.sourceLowerTexelCenterCacheLightMeters,
        `${label}.sourceLowerTexelCenterCacheLightMeters`
    );
    if (!vectorsNearlyEqual(lowerCache, expectedLowerCache, 1e-9)) {
        throw new Error(`${label} cache-space source lower texel center is inconsistent`);
    }
    const expectedFirstCacheCenter = bounds.min.map(
        (entry) => entry + LIVE_TEXEL_PITCH_METERS / 2
    );
    const firstCacheCenter = requireFiniteVector2(
        evidence.cacheFirstTexelCenterLightMeters,
        `${label}.cacheFirstTexelCenterLightMeters`
    );
    if (!vectorsNearlyEqual(firstCacheCenter, expectedFirstCacheCenter, 1e-9)) {
        throw new Error(`${label} first cache texel center is inconsistent`);
    }
    const expectedPhaseIndices = expectedFirstCacheCenter.map((entry, axis) => (
        (entry - expectedLowerCache[axis]) / LIVE_TEXEL_PITCH_METERS
    ));
    const phaseIndices = requireFiniteVector2(
        evidence.cacheToLivePhaseIndices,
        `${label}.cacheToLivePhaseIndices`
    );
    if (!vectorsNearlyEqual(phaseIndices, expectedPhaseIndices, 1e-9)) {
        throw new Error(`${label} cache-to-live phase indices are inconsistent`);
    }
    requireConsistentPhaseError(
        evidence.maximumPhaseIndexError,
        maximumIntegerPhaseError(expectedPhaseIndices),
        `${label}.maximumPhaseIndexError`
    );
    return cloneCanonicalJson(evidence);
}

function requireReportedLiveFilterIdentity(value, lightingProfileId) {
    const source = requireExactKeys(value, [
        'bias',
        'pcf',
        'sourceShadowCapability',
        'worldFilterRadiusMeters'
    ], `production validation live filter '${lightingProfileId}'`);
    const bias = requireExactKeys(source.bias, [
        'constantDepthReliefMeters',
        'geometricNormalOffsetMeters',
        'model'
    ], `production validation live filter '${lightingProfileId}'.bias`);
    if (bias.model !== 'geometric-normal-offset-plus-constant-depth-relief-v1'
        || Math.abs(bias.constantDepthReliefMeters - 0.0697915) > 1e-12
        || Math.abs(bias.geometricNormalOffsetMeters - 0.0232) > 1e-12) {
        throw new Error(`Production validation live bias '${lightingProfileId}' is unsupported`);
    }
    const pcf = requireExactKeys(source.pcf, [
        'hardwareComparison',
        'model',
        'radiusTexels',
        'sampleCount',
        'screenRotation',
        'shadowMapSizeTexels',
        'shadowMapWorldExtentMeters',
        'sourceMapRightAxisWorld',
        'sourceMapUpAxisWorld'
    ], `production validation live filter '${lightingProfileId}'.pcf`);
    const canonicalProfile = EXPECTED_VALIDATION_CASES.find(
        (entry) => entry.lightingProfileId === lightingProfileId
    )?.sunProfile;
    if (!canonicalProfile) {
        throw new Error(`Production validation live filter '${lightingProfileId}' has no profile`);
    }
    const direction = sunPointDirectionFromAngles(
        canonicalProfile.azimuthDeg,
        canonicalProfile.elevationDeg
    );
    const expectedAxes = deriveThreeR183FilterAxes(direction);
    const right = requireUnitVector3(
        pcf.sourceMapRightAxisWorld,
        `production validation live filter '${lightingProfileId}' right axis`
    );
    const up = requireUnitVector3(
        pcf.sourceMapUpAxisWorld,
        `production validation live filter '${lightingProfileId}' up axis`
    );
    if (pcf.hardwareComparison !== 'linear-four-compare-taps-v1'
        || pcf.model !== 'three-r183-vogel-5-linear-compare-v1'
        || pcf.radiusTexels !== 1.5
        || pcf.sampleCount !== 5
        || pcf.screenRotation !== 'interleaved-gradient-noise-gl-fragcoord-v1'
        || canonicalJsonStringify(pcf.shadowMapSizeTexels) !== '[16384,16384]'
        || canonicalJsonStringify(pcf.shadowMapWorldExtentMeters) !== '[680,680]'
        || !vectorsNearlyEqual(right, expectedAxes.rightAxisWorld, 1e-9)
        || !vectorsNearlyEqual(up, expectedAxes.upAxisWorld, 1e-9)
        || source.worldFilterRadiusMeters !== 0.062255859375) {
        throw new Error(`Production validation live filter '${lightingProfileId}' is unsupported`);
    }
    requireCanonicalMatch({
        id: 'three-r183-single-high-effective-16384-v1',
        mapSizeTexels: [16384, 16384],
        maximumTextureSizeTexels: 16384,
        worldExtentMeters: [680, 680]
    }, source.sourceShadowCapability, `production validation live capability '${lightingProfileId}'`);
}

function normalizeValidationCases(value, certifications) {
    if (!Array.isArray(value) || value.length !== EXPECTED_VALIDATION_CASE_COUNT) {
        throw new Error('Production validation cases must contain exactly 197 entries');
    }
    const ids = new Set();
    const capturePaths = new Set();
    const certificationByProfile = new Map(certifications.map((entry) => [
        entry.lightingProfileId,
        entry
    ]));
    const normalized = value.map((entry, index) => {
        const result = requirePlainObject(entry, `production validation case[${index}]`);
        requireExactKeys(result, [
            'camera',
            'captures',
            'caseId',
            'coverageTags',
            'diagnostics',
            'dynamicBus',
            'kind',
            'lightingProfileId',
            'metrics',
            'passed',
            'sunProfile',
            'workload'
        ], `production validation case[${index}]`);
        if (typeof result.caseId !== 'string' || !result.caseId || ids.has(result.caseId)) {
            throw new Error('Production validation case IDs must be nonempty and unique');
        }
        ids.add(result.caseId);
        const expectedCase = EXPECTED_VALIDATION_CASE_BY_ID.get(result.caseId);
        if (!expectedCase) {
            throw new Error(
                `Production validation case '${result.caseId}' is not in the canonical 197-case inventory`
            );
        }
        const lightingProfileId = requireReleaseProfileId(
            result.lightingProfileId,
            `production validation case '${result.caseId}' lightingProfileId`
        );
        requireCanonicalMatch(expectedCase, {
            camera: result.camera,
            caseId: result.caseId,
            coverageTags: result.coverageTags,
            kind: result.kind,
            lightingProfileId,
            sunProfile: result.sunProfile
        }, `production validation case '${result.caseId}' canonical projection`);
        validateValidationCaptureRecords(result, capturePaths);
        const metrics = requireProductionValidationCaseMetrics(
            result.metrics,
            `production validation case '${result.caseId}' metrics`
        );
        const metricFailures = evaluateProductionValidationCaseMetrics(metrics);
        if (result.passed !== true || metricFailures.length > 0) {
            throw new Error(
                `Production validation case '${result.caseId}' did not pass independent metrics:`
                + ` ${metricFailures.join(', ') || 'reported_failed'}`
            );
        }
        const certification = certificationByProfile.get(lightingProfileId);
        if (!certification) {
            throw new Error(
                `Production validation case '${result.caseId}' has no profile certification`
            );
        }
        const releaseGates = validateProductionCaseReleaseGates(result, certification);
        return {
            affectedStaticCityReceiverPixelCount:
                releaseGates.affectedStaticCityReceiverPixelCount,
            brightenedStaticCityReceiverPixelCount:
                releaseGates.brightenedStaticCityReceiverPixelCount,
            cacheDynamicBusShadowCalls: releaseGates.cacheDynamicBusShadowCalls,
            cacheDynamicBusShadowTriangles: releaseGates.cacheDynamicBusShadowTriangles,
            caseId: result.caseId,
            dynamicReceiverMaskedPixelCount: metrics.dynamicReceiverMaskedPixelCount,
            lightingProfileId,
            seamErrorPixelCount: metrics.seamErrorPixelCount,
            seamPixelCount: result.metrics.seamPixelCount
        };
    });
    if (ids.size !== EXPECTED_VALIDATION_CASE_BY_ID.size
        || EXPECTED_VALIDATION_CASES.some((entry) => !ids.has(entry.caseId))
        || capturePaths.size
            !== EXPECTED_VALIDATION_CASE_COUNT * PRODUCTION_VALIDATION_CAPTURE_SLOTS.length) {
        throw new Error('Production validation cases differ from the canonical 197-case inventory');
    }
    return normalized;
}

function validateValidationCaptureRecords(result, capturePaths) {
    const label = "production validation captures '" + result.caseId + "'";
    const captures = requireExactKeys(
        result.captures,
        PRODUCTION_VALIDATION_CAPTURE_SLOTS,
        label
    );
    for (const slot of PRODUCTION_VALIDATION_CAPTURE_SLOTS) {
        const record = requireCaptureRecord(
            captures[slot],
            result.caseId + '.' + slot
        );
        if (!record.path.endsWith('/' + result.caseId + '/' + slot + '.png')
            || capturePaths.has(record.path)) {
            throw new Error(
                "Production capture '" + result.caseId + '.' + slot
                + "' is duplicated or misplaced"
            );
        }
        capturePaths.add(record.path);
    }
}

function requireProductionValidationCaseMetrics(value, label) {
    const metrics = requirePlainObject(value, label);
    requireExactKeys(metrics, VALIDATION_CASE_METRIC_KEYS, label);
    for (const key of VALIDATION_CASE_METRIC_KEYS.filter((entry) => !entry.endsWith('Method'))) {
        if (!Number.isFinite(metrics[key]) || metrics[key] < 0) {
            throw new TypeError(`${label}.${key} must be a finite non-negative number`);
        }
    }
    for (const key of VALIDATION_CASE_INTEGER_METRIC_KEYS) {
        if (!Number.isSafeInteger(metrics[key])) {
            throw new TypeError(`${label}.${key} must be a safe integer`);
        }
    }
    if (metrics.width !== EXPECTED_VALIDATION_CAPTURE_DIMENSIONS_PIXELS[0]
        || metrics.height !== EXPECTED_VALIDATION_CAPTURE_DIMENSIONS_PIXELS[1]) {
        throw new Error(label + ' dimensions differ from the 1280x720 capture policy');
    }
    if (metrics.width < 1 || metrics.height < 1
        || metrics.pixelCount !== metrics.width * metrics.height) {
        throw new Error(`${label} dimensions and pixelCount are inconsistent`);
    }
    if (metrics.eligibleStaticReceiverPixelCount < 1
        || metrics.eligibleStaticReceiverPixelCount
            + metrics.dynamicReceiverMaskedPixelCount
            + metrics.outsideStaticReceiverPixelCount !== metrics.pixelCount) {
        throw new Error(`${label} static-receiver mask does not partition pixelCount`);
    }
    if (metrics.eligibleStaticReceiverPixelCount < Math.ceil(
        metrics.pixelCount * PRODUCTION_MINIMUM_STATIC_RECEIVER_COVERAGE_RATIO
    )) {
        throw new Error(`${label} static-receiver mask coverage collapsed`);
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
        throw new Error(`${label} contains an impossible count or byte value`);
    }
    if (metrics.maxRgbErrorByte > metrics.rawSamePixelMaxRgbErrorByte
        || metrics.pixelsOverFourByte > metrics.rawSamePixelPixelsOverFourByte) {
        throw new Error(`${label} aligned RGB metrics contradict raw same-pixel evidence`);
    }
    if ((metrics.seamErrorPixelCount === 0) !== (metrics.maxContinuousSeamRunPixels === 0)
        || metrics.maxContinuousSeamRunPixels > metrics.seamErrorPixelCount
        || metrics.maxContinuousSeamRunPixels > Math.max(metrics.width, metrics.height)
        || metrics.seamFalseLitPixelCount > metrics.missingOccluderPixelCount) {
        throw new Error(`${label} contains contradictory seam evidence`);
    }
    const expectedPercent = metrics.pixelsOverFourByte
        / metrics.eligibleStaticReceiverPixelCount * 100;
    if (Math.abs(metrics.pixelsOverFourBytePercent - expectedPercent) > 1e-12) {
        throw new Error(`${label}.pixelsOverFourBytePercent is inconsistent with its count`);
    }
    const expectedRawSamePixelPercent = metrics.rawSamePixelPixelsOverFourByte
        / metrics.eligibleStaticReceiverPixelCount * 100;
    if (Math.abs(
        metrics.rawSamePixelPixelsOverFourBytePercent - expectedRawSamePixelPercent
    ) > 1e-12) {
        throw new Error(
            `${label}.rawSamePixelPixelsOverFourBytePercent is inconsistent with its count`
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
        throw new Error(`${label} uses an unsupported evidence method`);
    }
    return metrics;
}

function evaluateProductionValidationCaseMetrics(metrics) {
    const failures = [];
    if (metrics.meanRgbErrorByte > EXPECTED_VALIDATION_THRESHOLDS.meanRgbErrorByte) {
        failures.push('mean_rgb_error');
    }
    if (metrics.pixelsOverFourBytePercent
        > EXPECTED_VALIDATION_THRESHOLDS.pixelsOverFourBytePercent) {
        failures.push('pixels_over_four');
    }
    if (metrics.maxRgbErrorByte > EXPECTED_VALIDATION_THRESHOLDS.maxRgbErrorByte) {
        failures.push('maximum_rgb_error');
    }
    if (metrics.missingOccluderPixelCount
        > EXPECTED_VALIDATION_THRESHOLDS.missingOccluderPixelCount) {
        failures.push('missing_occluder');
    }
    if (metrics.seamFalseLitPixelCount
        > EXPECTED_VALIDATION_THRESHOLDS.seamFalseLitPixelCount) {
        failures.push('false_lit_seam');
    }
    if (metrics.maxContinuousSeamRunPixels
        > EXPECTED_VALIDATION_THRESHOLDS.maxContinuousSeamRunPixels) {
        failures.push('continuous_seam');
    }
    return failures;
}

function requireTileBoundaryAggregate(value) {
    const evidence = requirePlainObject(value, 'production tile-boundary aggregate');
    requireExactKeys(evidence, [
        'aggregateSeamErrorPixelCount',
        'aggregateSeamPixelCount',
        'casesWithVisibleTileBoundary',
        'method',
        'passed'
    ], 'production tile-boundary aggregate');
    if (evidence.method !== 'aggregate_static_sun_depth_seam_debug_pixels_v1'
        || evidence.passed !== true
        || !Number.isSafeInteger(evidence.aggregateSeamErrorPixelCount)
        || evidence.aggregateSeamErrorPixelCount < 0
        || !Number.isSafeInteger(evidence.aggregateSeamPixelCount)
        || evidence.aggregateSeamPixelCount < 1
        || evidence.aggregateSeamErrorPixelCount > evidence.aggregateSeamPixelCount
        || !Number.isSafeInteger(evidence.casesWithVisibleTileBoundary)
        || evidence.casesWithVisibleTileBoundary < 1
        || evidence.casesWithVisibleTileBoundary > EXPECTED_VALIDATION_CASE_COUNT) {
        throw new Error('Production validation has invalid or vacuous tile-boundary evidence');
    }
    return evidence;
}

function validateProductionCaseReleaseGates(result, certification) {
    const current = requireShadowCounters(
        result.workload?.current,
        `production validation case '${result.caseId}' current workload`
    );
    const cache = requireShadowCounters(
        result.workload?.cache,
        `production validation case '${result.caseId}' cache workload`
    );
    const comparison = requireShadowCounters(
        result.workload?.comparison,
        `production validation case '${result.caseId}' comparison workload`
    );
    if (current.calls <= 0 || current.triangles <= 0
        || Object.values(cache).some((value) => value !== 0)
        || comparison.calls <= 0 || comparison.triangles <= 0) {
        throw new Error(
            `Production validation case '${result.caseId}' shadow submission gate did not pass`
        );
    }
    const currentBusShadow = requireDynamicBusShadowCounters(
        result.workload?.current,
        `production validation case '${result.caseId}' current workload`
    );
    const cacheBusShadow = requireDynamicBusShadowCounters(
        result.workload?.cache,
        `production validation case '${result.caseId}' cache workload`
    );
    const comparisonBusShadow = requireDynamicBusShadowCounters(
        result.workload?.comparison,
        `production validation case '${result.caseId}' comparison workload`
    );
    const busStates = ['current', 'cache', 'comparison'].map((phase) => (
        requireDynamicBusState(
            result.dynamicBus?.[phase],
            `production validation case '${result.caseId}' ${phase} dynamic bus`
        )
    ));
    const busInventory = busStates[0];
    if (!busStates.every((state) => (
        state.meshCount === busInventory.meshCount
        && state.casterMeshCount === busInventory.casterMeshCount
        && state.receiverMeshCount === busInventory.receiverMeshCount
        && state.registeredDynamicRootCount === busInventory.registeredDynamicRootCount
    ))) {
        throw new Error(
            `Production validation case '${result.caseId}' dynamic bus was suppressed or changed`
        );
    }
    const shadowProof = requireDynamicBusShadowProof(
        result.dynamicBus?.shadowProof,
        `production validation case '${result.caseId}' dynamic bus shadow proof`
    );
    if (shadowProof.busCasterMeshCount !== busInventory.casterMeshCount) {
        throw new Error(
            `Production validation case '${result.caseId}' dynamic bus shadow proof inventory differs`
        );
    }
    if (shadowProof.brightenedStaticCityReceiverPixelCount > 0) {
        throw new Error(
            `Production validation case '${result.caseId}' bus shadow proof brightens City receivers`
        );
    }
    for (const counters of [currentBusShadow, cacheBusShadow, comparisonBusShadow]) {
        if (counters.calls === 0 && counters.triangles !== 0) {
            throw new Error(
                `Production validation case '${result.caseId}' dynamic bus workload is contradictory`
            );
        }
    }
    const currentDiagnostics = requirePlainObject(
        result.diagnostics?.current,
        `production validation case '${result.caseId}' current diagnostics`
    );
    const cacheDiagnostics = requirePlainObject(
        result.diagnostics?.cache,
        `production validation case '${result.caseId}' cache diagnostics`
    );
    const comparisonDiagnostics = requirePlainObject(
        result.diagnostics?.comparison,
        `production validation case '${result.caseId}' comparison diagnostics`
    );
    const currentCasters = requirePlainObject(
        currentDiagnostics.casters,
        `production validation case '${result.caseId}' current casters`
    );
    const cacheCasters = requirePlainObject(
        cacheDiagnostics.casters,
        `production validation case '${result.caseId}' cache casters`
    );
    const comparisonCasters = requirePlainObject(
        comparisonDiagnostics.casters,
        `production validation case '${result.caseId}' comparison casters`
    );
    for (const diagnostics of [currentDiagnostics, cacheDiagnostics, comparisonDiagnostics]) {
        if (diagnostics.runtime?.package?.aggregateSha256
                !== certification.packageAggregateSha256
            || diagnostics.runtime?.package?.lightingProfileId
                !== certification.lightingProfileId) {
            throw new Error(
                `Production validation case '${result.caseId}' package aggregate identity differs`
            );
        }
    }
    const currentRetained = isCacheActive(currentDiagnostics)
        && currentDiagnostics.debugMode === 'liveFinal'
        && currentCasters.active === false
        && currentCasters.snapshotMeshCount === 0
        && Number.isSafeInteger(currentCasters.originalCasterCount)
        && currentCasters.originalCasterCount > 0
        && Number.isSafeInteger(currentCasters.restores)
        && currentCasters.lastReason === 'validation_live_final_shadow_retained';
    const cacheSuppressed = isCacheActive(cacheDiagnostics)
        && cacheDiagnostics.debugMode === 'final'
        && cacheCasters.active === true
        && Number.isSafeInteger(cacheCasters.staticMeshCount)
        && cacheCasters.staticMeshCount > 0
        && Number.isSafeInteger(cacheCasters.originalCasterCount)
        && cacheCasters.originalCasterCount > 0
        && cacheCasters.suppressedCasterCount === cacheCasters.originalCasterCount
        && cacheCasters.snapshotMeshCount === cacheCasters.staticMeshCount;
    const comparisonRestored = isCacheActive(comparisonDiagnostics)
        && comparisonDiagnostics.debugMode === 'signedDifference'
        && comparisonCasters.active === false
        && comparisonCasters.snapshotMeshCount === 0
        && comparisonCasters.originalCasterCount === cacheCasters.originalCasterCount
        && cacheCasters.originalCasterCount === currentCasters.originalCasterCount
        && comparisonCasters.lastReason === 'comparison_current_shadow_retained'
        && Number.isSafeInteger(cacheCasters.restores)
        && Number.isSafeInteger(comparisonCasters.restores)
        && cacheCasters.restores === currentCasters.restores
        && comparisonCasters.restores === cacheCasters.restores + 1;
    if (!currentRetained || !cacheSuppressed || !comparisonRestored) {
        throw new Error(
            `Production validation case '${result.caseId}' caster transition gate did not pass`
        );
    }
    return {
        affectedStaticCityReceiverPixelCount:
            shadowProof.affectedStaticCityReceiverPixelCount,
        brightenedStaticCityReceiverPixelCount:
            shadowProof.brightenedStaticCityReceiverPixelCount,
        cacheDynamicBusShadowCalls: cacheBusShadow.calls,
        cacheDynamicBusShadowTriangles: cacheBusShadow.triangles
    };
}

function requireShadowCounters(value, label) {
    const workload = requirePlainObject(value, label);
    const counters = requirePlainObject(workload.staticCityShadow, `${label}.staticCityShadow`);
    requireExactKeys(
        counters,
        ['calls', 'lines', 'points', 'triangles'],
        `${label}.staticCityShadow`
    );
    for (const value of Object.values(counters)) {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new TypeError(`${label} counters must be non-negative safe integers`);
        }
    }
    return counters;
}

function requireDynamicBusShadowCounters(value, label) {
    const workload = requirePlainObject(value, label);
    const counters = requirePlainObject(
        workload.dynamicBusShadow,
        `${label}.dynamicBusShadow`
    );
    requireExactKeys(
        counters,
        ['calls', 'lines', 'points', 'triangles'],
        `${label}.dynamicBusShadow`
    );
    for (const count of Object.values(counters)) {
        if (!Number.isSafeInteger(count) || count < 0) {
            throw new TypeError(`${label} dynamic bus counters must be non-negative safe integers`);
        }
    }
    return counters;
}

function requireDynamicBusState(value, label) {
    const state = requirePlainObject(value, label);
    requireExactKeys(state, [
        'casterMeshCount',
        'meshCount',
        'method',
        'receiverMeshCount',
        'registeredDynamicReceiver',
        'registeredDynamicRootCount',
        'rootOutsideStaticCity'
    ], label);
    if (state.method !== 'registered_bus_anchor_outside_static_city_v1'
        || state.rootOutsideStaticCity !== true
        || state.registeredDynamicReceiver !== true) {
        throw new Error(`${label} ownership is unsupported`);
    }
    for (const key of [
        'casterMeshCount',
        'meshCount',
        'receiverMeshCount',
        'registeredDynamicRootCount'
    ]) {
        if (!Number.isSafeInteger(state[key]) || state[key] < 1) {
            throw new TypeError(`${label} '${key}' must be a positive safe integer`);
        }
    }
    if (state.casterMeshCount > state.meshCount
        || state.receiverMeshCount > state.meshCount) {
        throw new Error(`${label} mesh inventory is contradictory`);
    }
    return state;
}

function requireDynamicBusShadowProof(value, label) {
    const proof = requirePlainObject(value, label);
    requireExactKeys(proof, [
        'affectedStaticCityReceiverPixelCount',
        'brightenedStaticCityReceiverPixelCount',
        'busCasterMeshCount',
        'cityReceiverMaskMethod',
        'maximumLumaBrighteningByte',
        'maximumLumaDarkeningByte',
        'method',
        'restoredCasterMeshCount',
        'staticCityReceiverPixelCount'
    ], label);
    if (proof.method
            !== 'bus_cast_shadow_enabled_luma_darker_than_disabled_over_visible_city_receivers_v2'
        || proof.cityReceiverMaskMethod
            !== 'visible_city_receiver_identity_depth_equality_v1') {
        throw new Error(`${label} method is unsupported`);
    }
    for (const key of [
        'affectedStaticCityReceiverPixelCount',
        'brightenedStaticCityReceiverPixelCount',
        'busCasterMeshCount',
        'restoredCasterMeshCount',
        'staticCityReceiverPixelCount'
    ]) {
        if (!Number.isSafeInteger(proof[key]) || proof[key] < 0) {
            throw new TypeError(`${label} '${key}' must be a non-negative safe integer`);
        }
    }
    for (const key of ['maximumLumaBrighteningByte', 'maximumLumaDarkeningByte']) {
        if (!Number.isFinite(proof[key]) || proof[key] < 0 || proof[key] > 255) {
            throw new TypeError(`${label} '${key}' must be a luma byte magnitude`);
        }
    }
    if (proof.busCasterMeshCount < 1
        || proof.restoredCasterMeshCount !== proof.busCasterMeshCount
        || proof.staticCityReceiverPixelCount < 1
        || proof.affectedStaticCityReceiverPixelCount > proof.staticCityReceiverPixelCount
        || proof.brightenedStaticCityReceiverPixelCount > proof.staticCityReceiverPixelCount
        || (proof.affectedStaticCityReceiverPixelCount > 0)
            !== (proof.maximumLumaDarkeningByte > 4)
        || (proof.brightenedStaticCityReceiverPixelCount > 0)
            !== (proof.maximumLumaBrighteningByte > 4)) {
        throw new Error(`${label} is contradictory`);
    }
    return proof;
}

function validateDynamicBusAggregate(value, cases) {
    const evidence = requireDynamicBusAggregate(value);
    const expected = {
        affectedStaticCityReceiverPixelCount: cases.reduce(
            (sum, entry) => sum + entry.affectedStaticCityReceiverPixelCount,
            0
        ),
        brightenedStaticCityReceiverPixelCount: cases.reduce(
            (sum, entry) => sum + entry.brightenedStaticCityReceiverPixelCount,
            0
        ),
        cacheShadowDrawCalls: cases.reduce(
            (sum, entry) => sum + entry.cacheDynamicBusShadowCalls,
            0
        ),
        cacheShadowTriangles: cases.reduce(
            (sum, entry) => sum + entry.cacheDynamicBusShadowTriangles,
            0
        ),
        casesWithStaticCityShadowImpact: cases.filter(
            (entry) => entry.affectedStaticCityReceiverPixelCount > 0
        ).length,
        casesWithStaticCityBrightening: cases.filter(
            (entry) => entry.brightenedStaticCityReceiverPixelCount > 0
        ).length,
        casesWithVisibleDynamicReceiver: cases.filter(
            (entry) => entry.dynamicReceiverMaskedPixelCount > 0
        ).length,
        totalMaskedDynamicReceiverPixelCount: cases.reduce(
            (sum, entry) => sum + entry.dynamicReceiverMaskedPixelCount,
            0
        )
    };
    if (Object.entries(expected).some(([key, count]) => evidence[key] !== count)) {
        throw new Error('Production dynamic bus aggregate differs from case evidence');
    }
}

function requireDynamicBusAggregate(value) {
    const evidence = requirePlainObject(value, 'production dynamic bus aggregate');
    requireExactKeys(evidence, [
        'affectedStaticCityReceiverPixelCount',
        'brightenedStaticCityReceiverPixelCount',
        'cacheShadowDrawCalls',
        'cacheShadowTriangles',
        'casesWithStaticCityShadowImpact',
        'casesWithStaticCityBrightening',
        'casesWithVisibleDynamicReceiver',
        'dynamicBusShadowProofMethod',
        'method',
        'passed',
        'staticReceiverMaskMethod',
        'totalMaskedDynamicReceiverPixelCount'
    ], 'production dynamic bus aggregate');
    if (evidence.passed !== true
        || evidence.method
            !== 'aggregate_registered_dynamic_receiver_mask_and_signed_bus_shadow_v2'
        || evidence.staticReceiverMaskMethod
            !== 'visible_static_city_receivers_excluding_registered_dynamic_receivers_depth_equality_v2'
        || evidence.dynamicBusShadowProofMethod
            !== 'bus_cast_shadow_enabled_luma_darker_than_disabled_over_visible_city_receivers_v2'
        || [
            'affectedStaticCityReceiverPixelCount',
            'cacheShadowDrawCalls',
            'cacheShadowTriangles',
            'casesWithStaticCityShadowImpact',
            'casesWithVisibleDynamicReceiver',
            'totalMaskedDynamicReceiverPixelCount'
        ].some((key) => !Number.isSafeInteger(evidence[key]) || evidence[key] < 1)) {
        throw new Error('Production dynamic bus aggregate is incomplete');
    }
    if (evidence.brightenedStaticCityReceiverPixelCount !== 0
        || evidence.casesWithStaticCityBrightening !== 0) {
        throw new Error('Production dynamic bus aggregate contains inverse brightening');
    }
    return evidence;
}

function isCacheActive(diagnostics) {
    return diagnostics.active !== null
        && diagnostics.active !== undefined
        && diagnostics.runtime?.controller?.state === 'active'
        && diagnostics.runtime?.controller?.effectiveMode === 'baked';
}

function validateValidationEvidence(value) {
    const evidence = cloneCanonicalJson(value);
    requireExactKeys(evidence, [
        'browserDiagnosticGate',
        'canonicalSha256',
        'caseCount',
        'comparisonCondition',
        'captureAuthentication',
        'dynamicBusEvidence',
        'packageIndexSha256',
        'profileIds',
        'rawSha256',
        'schema',
        'sourceShadowTexelPhaseEvidence',
        'status',
        'tileBoundaryEvidence',
        'timingContamination',
        'zeroMissingOccluderPixelCount'
    ], 'production validation evidence');
    if (evidence.schema !== PRODUCTION_VALIDATION_EVIDENCE_SCHEMA
        || evidence.status !== 'passed'
        || evidence.caseCount !== EXPECTED_VALIDATION_CASE_COUNT
        || evidence.zeroMissingOccluderPixelCount !== true
        || evidence.browserDiagnosticGate?.passed !== true
        || evidence.tileBoundaryEvidence?.passed !== true
        || evidence.dynamicBusEvidence?.passed !== true
        || canonicalJsonStringify(evidence.profileIds)
            !== canonicalJsonStringify(AI531_PRODUCTION_RELEASE_PROFILE_IDS)) {
        throw new Error('Production validation evidence is incomplete');
    }
    requireSha256(evidence.canonicalSha256, 'validation evidence canonicalSha256');
    requireSha256(evidence.packageIndexSha256, 'validation evidence packageIndexSha256');
    requireSha256(evidence.rawSha256, 'validation evidence rawSha256');
    requireProductionCaptureAuthenticationSummary(
        evidence.captureAuthentication,
        EXPECTED_VALIDATION_CASE_COUNT * PRODUCTION_VALIDATION_CAPTURE_SLOTS.length,
        EXPECTED_VALIDATION_CAPTURE_DIMENSIONS_PIXELS
    );
    requireDynamicBusAggregate(evidence.dynamicBusEvidence);
    normalizeProductionLiveTexelPhaseEvidence(
        evidence.sourceShadowTexelPhaseEvidence
    );
    validateTimingContamination(evidence.timingContamination);
    return evidence;
}

function validateLabValidationEvidence(value) {
    const evidence = cloneCanonicalJson(value);
    requireExactKeys(evidence, [
        'browserDiagnosticGate',
        'canonicalSha256',
        'captureAuthentication',
        'caseCount',
        'comparisonCondition',
        'profileIds',
        'rawSha256',
        'schema',
        'status',
        'tileBoundaryEvidence',
        'timingContamination',
        'zeroMissingOccluderPixelCount'
    ], 'Lab validation evidence');
    if (evidence.schema !== LAB_VALIDATION_EVIDENCE_SCHEMA
        || evidence.status !== 'passed'
        || evidence.caseCount !== EXPECTED_EXCLUDED_LAB_CASE_COUNT
        || evidence.zeroMissingOccluderPixelCount !== true
        || evidence.browserDiagnosticGate?.passed !== true
        || evidence.tileBoundaryEvidence?.passed !== true) {
        throw new Error('Lab validation evidence is incomplete');
    }
    if (canonicalJsonStringify(evidence.profileIds)
        !== canonicalJsonStringify(EXPECTED_LAB_VALIDATION_PROFILE_IDS)) {
        throw new Error('Lab validation evidence differs from the exact profile catalog');
    }
    requireSha256(evidence.canonicalSha256, 'Lab validation canonicalSha256');
    requireSha256(evidence.rawSha256, 'Lab validation rawSha256');
    requireCaptureAuthenticationSummary(
        evidence.captureAuthentication,
        EXPECTED_EXCLUDED_LAB_CASE_COUNT * 3,
        EXPECTED_VALIDATION_CAPTURE_DIMENSIONS_PIXELS
    );
    validateTimingContamination(evidence.timingContamination);
    return evidence;
}

function sharedSourceIdentity(profiles) {
    const first = profiles[0];
    const shared = {
        alphaSemanticsSha256: first.source.alphaSemanticsSha256,
        casterInventorySha256: first.source.casterInventorySha256,
        channelSourceSha256: first.source.channelSourceSha256,
        cityId: first.source.cityId,
        compilerSignatureSha256: first.compilerSignatureSha256,
        finalFileDomainSha256: first.source.finalFileDomainSha256,
        geometrySha256: first.source.geometrySha256,
        packageRawSha256: first.source.packageRawSha256,
        resolvedSourceSha256: first.source.resolvedSourceSha256,
        sourceValidationReportSha256: first.source.sourceValidationReportSha256,
        usedMaterialsSha256: first.source.usedMaterialsSha256
    };
    for (const entry of profiles.slice(1)) {
        const candidate = {
            alphaSemanticsSha256: entry.source.alphaSemanticsSha256,
            casterInventorySha256: entry.source.casterInventorySha256,
            channelSourceSha256: entry.source.channelSourceSha256,
            cityId: entry.source.cityId,
            compilerSignatureSha256: entry.compilerSignatureSha256,
            finalFileDomainSha256: entry.source.finalFileDomainSha256,
            geometrySha256: entry.source.geometrySha256,
            packageRawSha256: entry.source.packageRawSha256,
            resolvedSourceSha256: entry.source.resolvedSourceSha256,
            sourceValidationReportSha256: entry.source.sourceValidationReportSha256,
            usedMaterialsSha256: entry.source.usedMaterialsSha256
        };
        if (canonicalJsonStringify(candidate) !== canonicalJsonStringify(shared)) {
            throw new Error('Production profile certifications have different source/compiler authority');
        }
    }
    return shared;
}

function validateProfileSource(value) {
    requireExactKeys(value, [
        'alphaSemanticsSha256',
        'casterInventorySha256',
        'channelSourceSha256',
        'cityId',
        'finalFileDomainSha256',
        'geometrySha256',
        'packageRawSha256',
        'resolvedSourceSha256',
        'sourceValidationReportSha256',
        'usedMaterialsSha256'
    ], 'profile certification source');
    if (value.cityId !== 'bigcity2') {
        throw new Error("Production profile certification cityId must be 'bigcity2'");
    }
    for (const key of Object.keys(value).filter((key) => key !== 'cityId')) {
        requireSha256(value[key], `profile certification source.${key}`);
    }
}

function validateSourceInventory(value) {
    requireExactKeys(value, [
        'categoryCounts',
        'coverageModeCounts',
        'includedCasterIdsSha256',
        'includedCasterProjectionSha256',
        'selectedCasterCount'
    ], 'profile certification sourceInventory');
    requireExpectedCounts(
        value.categoryCounts,
        AI531_PRODUCTION_CASTER_INVENTORY.categoryCounts,
        'profile certification caster category'
    );
    requireExpectedCounts(
        value.coverageModeCounts,
        AI531_PRODUCTION_CASTER_INVENTORY.coverageModeCounts,
        'profile certification caster coverage mode'
    );
    if (value.selectedCasterCount !== AI531_PRODUCTION_CASTER_INVENTORY.selectedCasterCount) {
        throw new Error('Profile certification source inventory must contain 1968 accepted casters');
    }
    requireSha256(value.includedCasterIdsSha256, 'includedCasterIdsSha256');
    requireSha256(value.includedCasterProjectionSha256, 'includedCasterProjectionSha256');
}

function validateOpaqueRecord(record) {
    const source = requirePlainObject(record, 'profile opaque certification');
    const rebuilt = buildOpaqueOccluderCertificationRecord({
        bvhTruthSha256: source.bvhTruthSha256,
        cacheDescriptorSha256: source.cacheDescriptorSha256,
        depthToleranceMeters: source.depthToleranceMeters,
        evidenceSha256: source.evidenceSha256,
        matchingSampleCount: source.matchingSampleCount,
        maximumAbsoluteDepthErrorMeters: source.maximumAbsoluteDepthErrorMeters,
        missingOccluderCount: source.missingOccluderCount,
        sampleCount: source.sampleCount,
        unexpectedOccluderCount: source.unexpectedOccluderCount
    });
    requireCanonicalMatch(rebuilt, source, 'profile opaque certification');
}

function validateAlphaRecord(record) {
    const source = requirePlainObject(record, 'profile alpha certification');
    const rebuilt = buildAlphaCutoutCoverageCertificationRecord({
        alphaSemanticsSha256: source.alphaSemanticsSha256,
        certifiedCasterCount: source.certifiedCasterCount,
        certifiedCasterIds: source.certifiedCasterIds,
        cutoutBindingProjectionSha256: source.cutoutBindingProjectionSha256,
        cutoutCasterIdsSha256: source.cutoutCasterIdsSha256,
        evidenceSha256: source.evidenceSha256,
        expectedCasterCount: source.expectedCasterCount,
        firstHitDepthSampleCount: source.firstHitDepthSampleCount,
        firstHitDepthToleranceMeters: source.firstHitDepthToleranceMeters,
        matchingSampleCount: source.matchingSampleCount,
        maximumAbsoluteFirstHitDepthErrorMeters:
            source.maximumAbsoluteFirstHitDepthErrorMeters,
        mismatchCounts: source.mismatchCounts,
        missingOccluderCount: source.missingOccluderCount,
        outOfCoverageCasterIds: source.outOfCoverageCasterIds,
        parityArtifactSha256: source.parityArtifactSha256,
        sampleCount: source.sampleCount,
        samplePlanSha256: source.samplePlanSha256,
        unexpectedOccluderCount: source.unexpectedOccluderCount
    });
    requireCanonicalMatch(rebuilt, source, 'profile alpha certification');
}

function buildReleaseAlphaCutoutCoverage(profiles) {
    const first = profiles[0].alpha;
    const expectedCasterCount = first.expectedCasterCount;
    const cutoutCasterIdsSha256 = first.cutoutCasterIdsSha256;
    const expectedCasterIds = [
        ...first.certifiedCasterIds,
        ...first.outOfCoverageCasterIds
    ].sort(compareCanonicalStrings);
    const releaseCovered = new Set();
    const profileCoverage = profiles.map((profile) => {
        const alpha = profile.alpha;
        if (alpha.expectedCasterCount !== expectedCasterCount
            || alpha.cutoutCasterIdsSha256 !== cutoutCasterIdsSha256) {
            throw new Error(
                'Production alpha-cutout profile coverage has different authenticated caster inventories'
            );
        }
        alpha.certifiedCasterIds.forEach((casterId) => releaseCovered.add(casterId));
        return {
            certifiedCasterCount: alpha.certifiedCasterCount,
            certifiedCasterIdsSha256: rawCanonicalSha256({
                casterIds: alpha.certifiedCasterIds,
                schema: CUTOUT_CASTER_PLAN_SCHEMA
            }),
            lightingProfileId: profile.lightingProfileId,
            outOfCoverageCasterCount: alpha.outOfCoverageCasterIds.length,
            outOfCoverageCasterIdsSha256: rawCanonicalSha256({
                casterIds: alpha.outOfCoverageCasterIds,
                schema: CUTOUT_CASTER_PLAN_SCHEMA
            })
        };
    });
    const releaseCoveredCasterIds = [...releaseCovered].sort(compareCanonicalStrings);
    const missingCasterIds = expectedCasterIds.filter(
        (casterId) => !releaseCovered.has(casterId)
    );
    return cloneCanonicalJson({
        cutoutCasterIdsSha256,
        expectedCasterCount,
        missingCasterIds,
        profileCoverage,
        profileCoverageSha256: rawCanonicalSha256({
            profiles: profileCoverage,
            schema: 'ai531-production-alpha-cutout-profile-coverage-set-v1'
        }),
        releaseCoveredCasterCount: releaseCoveredCasterIds.length,
        releaseCoveredCasterIdsSha256: rawCanonicalSha256({
            casterIds: releaseCoveredCasterIds,
            schema: CUTOUT_CASTER_PLAN_SCHEMA
        }),
        schema: 'ai531-production-alpha-cutout-release-union-v1',
        status: missingCasterIds.length === 0 ? 'complete' : 'incomplete'
    });
}

function validateCasterRecord(record) {
    const source = requirePlainObject(record, 'profile caster certification');
    const rebuilt = buildCasterExclusionCertificationRecord({
        casterInventorySha256: source.casterInventorySha256,
        certifiedCategoryCount: source.certifiedCategoryCount,
        evidenceSha256: source.evidenceSha256,
        exclusions: source.exclusions,
        includedCasterCount: source.includedCasterCount,
        inventoryCasterCount: source.inventoryCasterCount,
        inventoryCategoryCount: source.inventoryCategoryCount,
        missingOccluderCount: source.missingOccluderCount
    });
    requireCanonicalMatch(rebuilt, source, 'profile caster certification');
    if (source.exclusionCount !== 0
        || source.exclusions.length !== 0
        || source.includedCasterCount
            !== AI531_PRODUCTION_CASTER_INVENTORY.selectedCasterCount) {
        throw new Error('Production caster certification must include all 1968 accepted casters');
    }
}

function requireLiveIdentityMatch(record, value) {
    const liveIdentity = validateLiveIdentity(value, record.lightingProfileId);
    const expected = {
        alphaSemanticsSha256: record.source.alphaSemanticsSha256,
        casterInventorySha256: record.source.casterInventorySha256,
        cityId: record.source.cityId,
        lightingProfileId: record.lightingProfileId,
        resolvedSourceSha256: record.source.resolvedSourceSha256,
        staticSunDepthSourceSha256: record.source.channelSourceSha256
    };
    for (const [key, expectedValue] of Object.entries(expected)) {
        if (liveIdentity[key] !== expectedValue) {
            throw new Error(`Profile release certification live identity '${key}' differs`);
        }
    }
}

function validateLiveIdentity(value, lightingProfileId) {
    const identity = requirePlainObject(value, `live identity '${lightingProfileId}'`);
    requireExactKeys(identity, [
        'alphaSemanticsSha256',
        'casterInventorySha256',
        'cityId',
        'developmentCacheAllowed',
        'lightingProfileId',
        'resolvedSourceSha256',
        'staticSunDepthSourceSha256'
    ], `live identity '${lightingProfileId}'`);
    if (identity.cityId !== 'bigcity2'
        || identity.developmentCacheAllowed !== true
        || identity.lightingProfileId !== lightingProfileId) {
        throw new Error(`Live identity '${lightingProfileId}' has invalid ownership`);
    }
    for (const key of [
        'alphaSemanticsSha256',
        'casterInventorySha256',
        'resolvedSourceSha256',
        'staticSunDepthSourceSha256'
    ]) requireSha256(identity[key], `live identity '${lightingProfileId}'.${key}`);
    return identity;
}

function validateTimingContamination(value) {
    const timing = requirePlainObject(value, 'validation timing contamination');
    requireExactKeys(
        timing,
        ['contaminated', 'reason', 'usableForPromotion'],
        'validation timing contamination'
    );
    if (timing.contaminated !== true
        || timing.usableForPromotion !== false
        || typeof timing.reason !== 'string'
        || !timing.reason) {
        throw new Error(
            'AI531 correctness certification requires contaminated timing and forbids performance promotion'
        );
    }
}

function countNamedValues(entries, key) {
    const counts = {};
    for (const entry of entries) {
        const value = entry[key];
        if (typeof value !== 'string' || !value) {
            throw new TypeError(`caster mapping.${key} must be a nonempty string`);
        }
        counts[value] = (counts[value] ?? 0) + 1;
    }
    return Object.fromEntries(
        Object.entries(counts).sort(([left], [right]) => compareCanonicalStrings(left, right))
    );
}

function requireExpectedCounts(actual, expected, label) {
    const source = requirePlainObject(actual, `${label} counts`);
    for (const value of Object.values(source)) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new TypeError(`${label} counts must be positive safe integers`);
        }
    }
    if (canonicalJsonStringify(source) !== canonicalJsonStringify(expected)) {
        throw new Error(`${label} counts differ from the authenticated AI531 release inventory`);
    }
}

function requireCanonicalUniqueIds(entries, label) {
    let previous = null;
    for (const entry of entries) {
        if (typeof entry.id !== 'string' || !entry.id
            || (previous !== null && compareCanonicalStrings(previous, entry.id) >= 0)) {
            throw new Error(`${label} must have unique canonical IDs`);
        }
        previous = entry.id;
    }
}

function requireCanonicalMatch(expected, actual, label) {
    if (canonicalJsonStringify(expected) !== canonicalJsonStringify(actual)) {
        throw new Error(`${label} is not canonical or contains unsupported fields`);
    }
}

function requireReleaseProfileId(value, label) {
    if (typeof value !== 'string'
        || !PROFILE_ID_PATTERN.test(value)
        || !AI531_PRODUCTION_RELEASE_PROFILE_IDS.includes(value)) {
        throw new TypeError(`${label} must be one of the exact eight release profiles`);
    }
    return value;
}

function requirePackagePath(value, lightingProfileId) {
    const expectedSuffix = `/production/${lightingProfileId}/static_sun_depth.ilpkg`;
    if (typeof value !== 'string'
        || !value.startsWith('tests/artifacts/illumination_531/')
        || !value.endsWith(expectedSuffix)
        || value.includes('\\')
        || value.includes('..')) {
        throw new TypeError(
            `Package path for '${lightingProfileId}' must be canonical and profile-owned`
        );
    }
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
    const source = requirePlainObject(value, label);
    const actualKeys = Object.keys(source).sort(compareCanonicalStrings);
    const expectedKeys = [...expected].sort(compareCanonicalStrings);
    if (canonicalJsonStringify(actualKeys) !== canonicalJsonStringify(expectedKeys)) {
        throw new TypeError(`${label} must contain exactly ${expectedKeys.join(', ')}`);
    }
    for (const key of expectedKeys) {
        const property = Object.getOwnPropertyDescriptor(source, key);
        if (!property || !property.enumerable
            || !Object.prototype.hasOwnProperty.call(property, 'value')) {
            throw new TypeError(`${label}.${key} must be an enumerable own data property`);
        }
    }
    return source;
}

function requireOnlyKeys(value, allowed, label) {
    const source = requirePlainObject(value, label);
    const unexpected = Object.keys(source).filter((key) => !allowed.includes(key));
    if (unexpected.length > 0) {
        throw new TypeError(`${label} contains unexpected ${unexpected.join(', ')}`);
    }
    for (const required of ['packageIndex', 'packageIndexSha256', 'profileCertifications']) {
        if (!Object.prototype.hasOwnProperty.call(source, required)) {
            throw new TypeError(`${label}.${required} is required`);
        }
    }
    return source;
}

function requireSha256(value, label) {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
        throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
    }
}

function requireNonEmptyString(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.trim() !== value) {
        throw new TypeError(`${label} must be a non-empty trimmed string`);
    }
    return value;
}

function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new TypeError(`${label} must be a positive safe integer`);
    }
}

function requireFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${label} must be a finite number`);
    }
    return value;
}

function requireFiniteVector2(value, label) {
    if (!Array.isArray(value) || value.length !== 2
        || value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
        throw new TypeError(label + ' must contain two finite numbers');
    }
    return value;
}

function requireFiniteVector3(value, label) {
    if (!Array.isArray(value) || value.length !== 3
        || value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
        throw new TypeError(`${label} must contain three finite numbers`);
    }
    return value;
}

function requireMatrix2(value, label) {
    if (!Array.isArray(value) || value.length !== 2) {
        throw new TypeError(`${label} must contain two rows`);
    }
    return value.map((row, rowIndex) => (
        requireFiniteVector2(row, `${label}[${rowIndex}]`)
    ));
}

function requireSignedPermutation2(value, label) {
    const matrix = requireMatrix2(value, label);
    const entriesAreSignedUnitValues = matrix.every((row) => (
        row.every((entry) => entry === -1 || entry === 0 || entry === 1)
    ));
    const rowsHaveOneSignedUnit = matrix.every((row) => (
        row.reduce((sum, entry) => sum + Math.abs(entry), 0) === 1
    ));
    const columnsHaveOneSignedUnit = [0, 1].every((column) => (
        Math.abs(matrix[0][column]) + Math.abs(matrix[1][column]) === 1
    ));
    if (!entriesAreSignedUnitValues
        || !rowsHaveOneSignedUnit
        || !columnsHaveOneSignedUnit) {
        throw new Error(`${label} must be a 2x2 signed permutation`);
    }
    return matrix;
}

function requireLightBounds(value, label) {
    const source = requireExactKeys(value, ['max', 'min'], label);
    const bounds = {
        max: requireFiniteVector2(source.max, `${label}.max`),
        min: requireFiniteVector2(source.min, `${label}.min`)
    };
    if (bounds.min.some((entry, axis) => entry >= bounds.max[axis])) {
        throw new RangeError(`${label} must have a positive extent on both axes`);
    }
    return bounds;
}

function maximumVectorSetDifference(left, right) {
    if (left.length !== right.length) return Number.POSITIVE_INFINITY;
    let maximum = 0;
    for (let vectorIndex = 0; vectorIndex < left.length; vectorIndex += 1) {
        if (left[vectorIndex].length !== right[vectorIndex].length) {
            return Number.POSITIVE_INFINITY;
        }
        for (let axis = 0; axis < left[vectorIndex].length; axis += 1) {
            maximum = Math.max(
                maximum,
                Math.abs(left[vectorIndex][axis] - right[vectorIndex][axis])
            );
        }
    }
    return maximum;
}

function maximumMatrixDifference(left, right) {
    return maximumVectorSetDifference(left, right);
}

function matricesNearlyEqual(left, right, tolerance = LIVE_TEXEL_PHASE_TOLERANCE) {
    return maximumMatrixDifference(left, right) <= tolerance;
}

function maximumIntegerPhaseError(values) {
    return values.reduce((maximum, value) => (
        Math.max(maximum, Math.abs(value - Math.round(value)))
    ), 0);
}

function requireConsistentPhaseError(value, computed, label) {
    requireFiniteNumber(value, label);
    requireFiniteNumber(computed, `${label} recomputation`);
    if (value < 0
        || value > LIVE_TEXEL_PHASE_TOLERANCE
        || computed > LIVE_TEXEL_PHASE_TOLERANCE
        || Math.abs(value - computed) > 1e-12) {
        throw new Error(
            `${label} is inconsistent or exceeds the ${LIVE_TEXEL_PHASE_TOLERANCE} release tolerance`
        );
    }
    return value;
}

function requireUnitVector3(value, label) {
    if (!Array.isArray(value) || value.length !== 3
        || value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
        throw new TypeError(`${label} must contain three finite numbers`);
    }
    if (Math.abs(Math.hypot(...value) - 1) > 1e-9) {
        throw new RangeError(`${label} must be a unit vector`);
    }
    return value;
}

function deriveThreeR183FilterAxes(pointDirection) {
    const backward = normalizeVector3(pointDirection);
    let right = cross3([0, 1, 0], backward);
    if (Math.hypot(...right) <= Number.EPSILON) {
        const perturbed = normalizeVector3([
            backward[0] + 0.0001,
            backward[1],
            backward[2]
        ]);
        right = cross3([0, 1, 0], perturbed);
    }
    right = normalizeVector3(right);
    return {
        rightAxisWorld: right,
        upAxisWorld: normalizeVector3(cross3(backward, right))
    };
}

function sunPointDirectionFromAngles(azimuthDeg, elevationDeg) {
    if (!Number.isFinite(azimuthDeg) || !Number.isFinite(elevationDeg)) {
        throw new TypeError('Independent release sun angles must be finite');
    }
    const azimuth = azimuthDeg * Math.PI / 180;
    const elevation = elevationDeg * Math.PI / 180;
    const horizontal = Math.cos(elevation);
    return [
        Math.cos(azimuth) * horizontal,
        Math.sin(elevation),
        Math.sin(azimuth) * horizontal
    ];
}

function normalizeVector3(value) {
    const length = Math.hypot(...value);
    if (!Number.isFinite(length) || length <= 0) {
        throw new RangeError('Independent Three r183 axis derivation is degenerate');
    }
    return value.map((entry) => Object.is(entry / length, -0) ? 0 : entry / length);
}

function cross3(left, right) {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0]
    ];
}

function dot3(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function vectorsNearlyEqual(left, right, tolerance) {
    return left.length === right.length
        && left.every((entry, index) => Math.abs(entry - right[index]) <= tolerance);
}

function rawCanonicalSha256(value) {
    return createHash('sha256')
        .update(canonicalJsonStringify(value), 'utf8')
        .digest('hex');
}
