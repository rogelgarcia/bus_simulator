// Verifies deterministic AI531 profile and exact-eight release certification.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import {deflateSync} from 'node:zlib';
import {
    canonicalJsonBytes,
    canonicalJsonStringify
} from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import { sha256Hex } from '../../../../src/app/illumination/bake_source/Hashing.js';
import {
    ILLUMINATION_VALIDATION_CASES
} from '../../../../src/app/illumination/validation/IlluminationValidationCaseCatalog.js';
import {
    ILLUMINATION_MAX_CHUNK_BYTES,
    ILLUMINATION_MAX_PACKAGE_BYTES
} from '../../../../src/app/illumination/package/index.js';
import {
    STATIC_SUN_DEPTH_CANONICAL_CHUNK_ID,
    createStableStaticSunDepthBasis,
    createStaticSunDepthLayerWindowEnvelope,
    partitionStaticSunDepthLayers,
    staticSunDepthLayerWindowChunkId
} from '../../../../src/app/illumination/static_sun_depth/index.js';
import {
    authenticatePublishedStaticSunDepthPackage,
    finalizeProductionReleaseCertification,
    parseProductionReleaseCertificationArgs
} from '../../../../tools/static_sun_depth/certify_release.mjs';
import {
    createProductionStaticSunRequest,
    deriveProductionSourceIdentityHashes,
    selectProductionStaticSunProfiles
} from '../../../../tools/static_sun_depth/src/ProductionOrchestrator.mjs';
import {
    AI531_PRODUCTION_RELEASE_PROFILE_IDS,
    buildLabValidationEvidence,
    buildProductionProfileReleaseCertification,
    buildProductionReleaseCertification,
    buildProductionValidationEvidence,
    deriveProductionAlphaCutoutCoverageIdentity
} from '../../../../tools/static_sun_depth/src/ProductionReleaseCertification.mjs';
import {
    authenticateProductionValidationCaptureSet,
    authenticateValidationCaptureSet
} from '../../../../tools/static_sun_depth/src/ValidationCaptureAuthentication.mjs';
import {
    buildAlphaCutoutCoverageCertificationRecord
} from '../../../../tools/static_sun_depth/src/ProductionArtifact.mjs';
import {
    createProductionLiveTexelPhaseEvidence
} from '../../../../tools/static_sun_depth/browser/ProductionTexelPhase.js';
import {
    LAB_DENSITY_PRODUCTION_PROJECTION
} from '../../../../tools/static_sun_depth/src/LabFixtureDomain.mjs';
import {
    PRODUCTION_ALPHA_CUTOUT_BAKE_CAPTURE_METHOD,
    PRODUCTION_ALPHA_CUTOUT_FIRST_HIT_DEPTH_TOLERANCE_METERS,
    PRODUCTION_ALPHA_CUTOUT_LIVE_CAPTURE_METHOD,
    PRODUCTION_ALPHA_CUTOUT_MISMATCH_KEYS,
    PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_METHOD,
    PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_V2_METHOD,
    PRODUCTION_ALPHA_CUTOUT_SAMPLER_PARITY_METHOD,
    PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_METHOD,
    PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_SCHEMA,
    PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_V2_SCHEMA
} from '../../../../tools/static_sun_depth/src/ProductionAlphaCutoutParity.mjs';

const HASHES = Object.freeze(
    Object.fromEntries('abcdefghijklmnop'.split('').map((key, index) => [
        key,
        (index + 1).toString(16).repeat(64)
    ]))
);
const BASE_FIXTURE = makeProfileFixture(AI531_PRODUCTION_RELEASE_PROFILE_IDS[0]);
const BASE_CERTIFICATION = buildProductionProfileReleaseCertification(BASE_FIXTURE);
const CAPTURE_AUTHENTICATION_METHOD =
    'sha256-byte-length-rehash-repo-artifact-confined-v1';
const PRODUCTION_CAPTURE_AUTHENTICATION_METHOD =
    'sha256-byte-length-rehash-png-decode-receiver-mask-partition-v2';
const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

test('profile release certification proves all 1968 accepted casters and exact cutout/BVH evidence', () => {
    const repeated = buildProductionProfileReleaseCertification(
        structuredClone(BASE_FIXTURE)
    );
    assert.equal(
        canonicalJsonStringify(repeated),
        canonicalJsonStringify(BASE_CERTIFICATION)
    );
    assert.equal(BASE_CERTIFICATION.status, 'passed');
    assert.equal(
        BASE_CERTIFICATION.opaque.schema,
        'bus-sim-static-sun-depth-opaque-certification-v1'
    );
    assert.equal(BASE_CERTIFICATION.opaque.missingOccluderCount, 0);
    assert.equal(BASE_CERTIFICATION.alpha.expectedCasterCount, 124);
    assert.equal(BASE_CERTIFICATION.alpha.certifiedCasterCount, 124);
    assert.equal(BASE_CERTIFICATION.alpha.sampleCount, 4096);
    assert.equal(BASE_CERTIFICATION.alpha.firstHitDepthSampleCount, 1024);
    assert.equal(BASE_CERTIFICATION.alpha.maximumAbsoluteFirstHitDepthErrorMeters, 0);
    assert.equal(BASE_CERTIFICATION.alpha.mismatchCounts.mip, 0);
    assert.equal(BASE_CERTIFICATION.alpha.mismatchCounts.anisotropy, 0);
    assert.equal(
        BASE_CERTIFICATION.alpha.schema,
        'bus-sim-static-sun-depth-alpha-cutout-certification-v3'
    );
    assert.equal(BASE_CERTIFICATION.casters.includedCasterCount, 1968);
    assert.equal(BASE_CERTIFICATION.casters.exclusionCount, 0);
    assert.equal(BASE_CERTIFICATION.casters.missingOccluderCount, 0);
    assert.deepEqual(BASE_CERTIFICATION.sourceInventory.categoryCounts, {
        buildings: 1683,
        traffic_controls: 37,
        trees_foliage: 248
    });
    assert.deepEqual(BASE_CERTIFICATION.sourceInventory.coverageModeCounts, {
        cutout: 124,
        forced_opaque: 64,
        opaque: 1780
    });
    const coverageIdentity = deriveProductionAlphaCutoutCoverageIdentity(
        BASE_FIXTURE.manifest
    );
    assert.equal(coverageIdentity.cutoutCasterCount, 124);
    assert.equal(coverageIdentity.cutoutCasterIds.length, 124);
    assert.equal(new Set(coverageIdentity.cutoutCasterIds).size, 124);
    assert.equal(
        coverageIdentity.cutoutCasterIdsSha256,
        BASE_CERTIFICATION.alpha.cutoutCasterIdsSha256
    );
});

test('profile release certification owns the authenticated v2 physical coverage partition', () => {
    const fixture = makeProfileFixture(AI531_PRODUCTION_RELEASE_PROFILE_IDS[0]);
    const artifact = fixture.receipt.alphaCertification.spatialParityArtifact;
    const cutoutCasterIds = fixture.manifest.casterMappings
        .filter((entry) => entry.coverageMode === 'cutout')
        .map((entry) => entry.id)
        .sort();
    artifact.schema = PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_V2_SCHEMA;
    artifact.samplePlanMethod = PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_V2_METHOD;
    artifact.evidence.samplePlan.encoding =
        'canonical-json-ai531-alpha-cutout-sample-plan-v2';
    artifact.inCoverageCasterIds = cutoutCasterIds.slice(0, -1);
    artifact.inCoverageCasterCount = artifact.inCoverageCasterIds.length;
    artifact.outOfCoverageCasterIds = cutoutCasterIds.slice(-1);
    artifact.outOfCoverageCasterCount = artifact.outOfCoverageCasterIds.length;

    const certification = buildProductionProfileReleaseCertification(fixture);
    assert.equal(certification.alpha.expectedCasterCount, 124);
    assert.equal(certification.alpha.certifiedCasterCount, 123);
    assert.deepEqual(
        certification.alpha.certifiedCasterIds,
        artifact.inCoverageCasterIds
    );
    assert.deepEqual(
        certification.alpha.outOfCoverageCasterIds,
        artifact.outOfCoverageCasterIds
    );
});

test('all eight production profiles preserve canonical request and descriptor sampling', () => {
    for (const lightingProfileId of AI531_PRODUCTION_RELEASE_PROFILE_IDS) {
        const fixture = makeProfileFixture(lightingProfileId);
        fixture.descriptor = structuredClone(fixture.descriptor);
        for (const key of [
            'sourceMapRightAxisWorld',
            'sourceMapUpAxisWorld'
        ]) {
            const axis = fixture.descriptor.identity.sampling.pcf[key];
            const magnitude = Math.hypot(...axis);
            fixture.descriptor.identity.sampling.pcf[key] = axis.map(
                (entry) => entry / magnitude
            );
        }
        fixture.receipt.alphaCertification
            .spatialParityArtifact.descriptorSha256 =
                rawCanonicalSha256(fixture.descriptor);
        assert.equal(
            buildProductionProfileReleaseCertification(fixture).status,
            'passed'
        );
    }
});

test('profile release certification rejects caster drift, alpha drift, and opaque mismatches', () => {
    const countDrift = structuredClone(BASE_FIXTURE);
    countDrift.receipt.reconstruction.selectedMappingCount = 6042;
    assert.throws(
        () => buildProductionProfileReleaseCertification(countDrift),
        /all 1968 accepted source casters/
    );

    const excludedCaster = structuredClone(BASE_FIXTURE);
    excludedCaster.manifest.casterMappings[0].channelRelevance.static_sun_depth = false;
    assert.throws(
        () => buildProductionProfileReleaseCertification(excludedCaster),
        /all 1968 accepted source casters/
    );

    const alphaDrift = structuredClone(BASE_FIXTURE);
    alphaDrift.receipt.alphaCertification.coverageInputs[0]
        .inputs[0].coverageSha256 = HASHES.p;
    assert.throws(
        () => buildProductionProfileReleaseCertification(alphaDrift),
        /differs from exact source coverage inputs/
    );

    const forcedOpaqueDrift = structuredClone(BASE_FIXTURE);
    forcedOpaqueDrift.receipt.alphaCertification.forcedOpaqueMaterialVariantCount = 2;
    assert.throws(
        () => buildProductionProfileReleaseCertification(forcedOpaqueDrift),
        /differs from exact source coverage inputs/
    );

    const opaqueMismatch = structuredClone(BASE_FIXTURE);
    opaqueMismatch.receipt.opaqueCertification.occupancyMismatchCount = 1;
    assert.throws(
        () => buildProductionProfileReleaseCertification(opaqueMismatch),
        /contains a mismatch/
    );

    for (const depthEpsilonMeters of [1e-3, 2e-3, 4e-3, 6e-3, 20e-3]) {
        const changedDepthTolerance = structuredClone(BASE_FIXTURE);
        changedDepthTolerance.receipt.opaqueCertification.depthEpsilonMeters =
            depthEpsilonMeters;
        assert.throws(
            () => buildProductionProfileReleaseCertification(changedDepthTolerance),
            /opaque BVH evidence contains a mismatch/
        );
    }

    const directionalFilterDrift = structuredClone(BASE_FIXTURE);
    directionalFilterDrift.receipt.opaqueCertification
        .directionalGeometryFilter.visiblePolygonCount -= 1;
    assert.throws(
        () => buildProductionProfileReleaseCertification(directionalFilterDrift),
        /opaque BVH evidence contains a mismatch/
    );
});

test('valid alpha source hashes cannot bypass sampler, occupancy, mip, or first-hit mismatches', () => {
    const missingParity = structuredClone(BASE_FIXTURE);
    delete missingParity.receipt.alphaCertification.spatialParityArtifact;
    assert.throws(
        () => buildProductionProfileReleaseCertification(missingParity),
        /Unsupported mipmapped or anisotropic cutout reconstruction requires an explicit compatible parity artifact/
    );

    const supportedButUnmeasured = structuredClone(BASE_FIXTURE);
    const supportedBinding = supportedButUnmeasured.manifest.textures.find(
        (entry) => entry.id === 'binding.cutout'
    );
    supportedBinding.anisotropy = 1;
    supportedBinding.generateMipmaps = false;
    supportedBinding.minFilter = 1006;
    const supportedIdentity = deriveProductionSourceIdentityHashes(
        supportedButUnmeasured.manifest
    );
    supportedButUnmeasured.receipt.identity.alphaSemanticsSha256 =
        supportedIdentity.alphaSemanticsSha256;
    supportedButUnmeasured.receipt.input.alphaSemanticsSha256 =
        supportedIdentity.alphaSemanticsSha256;
    supportedButUnmeasured.descriptor.identity.alpha.semanticsSha256 =
        supportedIdentity.alphaSemanticsSha256;
    delete supportedButUnmeasured.receipt.alphaCertification.spatialParityArtifact;
    assert.throws(
        () => buildProductionProfileReleaseCertification(supportedButUnmeasured),
        /requires authenticated measured spatial occupancy and first-hit-depth evidence/
    );

    const incompatibleSampler = structuredClone(BASE_FIXTURE);
    incompatibleSampler.receipt.alphaCertification
        .spatialParityArtifact.unsupportedBindingIds = [];
    assert.throws(
        () => buildProductionProfileReleaseCertification(incompatibleSampler),
        /exact compatible sampler-parity artifact/
    );

    const spatialMismatch = structuredClone(BASE_FIXTURE);
    const spatial = spatialMismatch.receipt.alphaCertification.spatialParityArtifact;
    spatial.matchingOccupancySampleCount -= 1;
    spatial.missingOccluderCount = 1;
    spatial.liveOccupiedSampleCount += 1;
    assert.throws(
        () => buildProductionProfileReleaseCertification(spatialMismatch),
        /measured spatial occupancy or first-hit-depth parity contains a mismatch/
    );

    const mipMismatch = structuredClone(BASE_FIXTURE);
    mipMismatch.receipt.alphaCertification
        .spatialParityArtifact.mismatchCounts.mip = 1;
    assert.throws(
        () => buildProductionProfileReleaseCertification(mipMismatch),
        /measured spatial occupancy or first-hit-depth parity contains a mismatch/
    );

    const firstHitMismatch = structuredClone(BASE_FIXTURE);
    const firstHit = firstHitMismatch.receipt.alphaCertification.spatialParityArtifact;
    firstHit.firstHitDepthMismatchCount = 1;
    firstHit.mismatchCounts.firstHitDepth = 1;
    assert.throws(
        () => buildProductionProfileReleaseCertification(firstHitMismatch),
        /measured spatial occupancy or first-hit-depth parity contains a mismatch/
    );
});

test('release certification rejects legacy, stale-size, and swapped-axis descriptors', () => {
    const legacy = structuredClone(BASE_FIXTURE);
    legacy.descriptor.identity.sampling = {
        bias: {
            constantMeters: 0.04,
            model: 'constant-plus-normal-offset-v1',
            normalOffsetScaleMeters: 0.08
        },
        comparison: 'receiver-depth-minus-bias-lte-caster-depth-v1',
        emptyPolicy: 'visible-v1',
        outOfBoundsPolicy: 'fail-closed-zero-visibility-v1',
        pcf: {model: 'square-nearest-box-v1', radiusTexels: 1}
    };
    assert.throws(
        () => buildProductionProfileReleaseCertification(legacy),
        /authenticated descriptor bias/
    );

    const staleSize = structuredClone(BASE_FIXTURE);
    staleSize.descriptor.identity.sampling.pcf.shadowMapSizeTexels = [
        8192,
        8192
    ];
    assert.throws(
        () => buildProductionProfileReleaseCertification(staleSize),
        /effective Three r183 16384 filter/
    );

    const swappedAxes = structuredClone(BASE_FIXTURE);
    swapSamplingAxes(swappedAxes.descriptor.identity.sampling);
    assert.throws(
        () => buildProductionProfileReleaseCertification(swappedAxes),
        /source-map axes differ from Three r183/
    );
});

test('Lab validation evidence reapplies the exact eight-case catalog, capture, and correctness gates', () => {
    const report = makeLabValidationReport();
    const evidence = buildLabValidationEvidence({
        rawSha256: HASHES.n,
        report
    });
    assert.equal(evidence.schema, 'bus-sim-static-sun-depth-lab-validation-evidence-v1');
    assert.equal(evidence.caseCount, 8);
    assert.equal(evidence.captureAuthentication.captureCount, 24);
    assert.equal(evidence.zeroMissingOccluderPixelCount, true);
    assert.equal(report.cases.every((entry) => entry.fixture.tileCount === 8), true);
    assert.equal(
        report.cases.every((entry) => entry.fixture.packageChunkCount === 2),
        true
    );

    const legacy = makeLabValidationReport();
    legacy.schema = 'bus-sim-static-sun-depth-lab-validation-report-v3';
    assert.throws(
        () => buildLabValidationEvidence({rawSha256: HASHES.n, report: legacy}),
        /v4 release schema and pass/
    );

    const metricFailure = makeLabValidationReport();
    metricFailure.cases[0].metrics.missingOccluderPixelCount = 1;
    assert.throws(
        () => buildLabValidationEvidence({
            rawSha256: HASHES.n,
            report: metricFailure
        }),
        /failed independent gates: missing_occluder/
    );

    const bareCapture = makeLabValidationReport();
    bareCapture.cases[0].captures.cache =
        bareCapture.cases[0].captures.cache.path;
    assert.throws(
        () => buildLabValidationEvidence({
            rawSha256: HASHES.n,
            report: bareCapture
        }),
        /must be a plain object/
    );

    const wrongCaptureSummaryDimensions = makeLabValidationReport();
    wrongCaptureSummaryDimensions.captureAuthentication.dimensionsPixels = [1280, 696];
    assert.throws(
        () => buildLabValidationEvidence({
            rawSha256: HASHES.n,
            report: wrongCaptureSummaryDimensions
        }),
        /capture authentication summary is invalid/
    );

    const wrongMetricDimensions = makeLabValidationReport();
    Object.assign(wrongMetricDimensions.cases[0].metrics, {
        evaluatedPixelCount: 890880,
        height: 696,
        pixelCount: 890880
    });
    assert.throws(
        () => buildLabValidationEvidence({
            rawSha256: HASHES.n,
            report: wrongMetricDimensions
        }),
        /capture_dimensions/
    );

    const catalogDrift = makeLabValidationReport();
    catalogDrift.cases[0].camera.presetId = 'fabricated';
    assert.throws(
        () => buildLabValidationEvidence({
            rawSha256: HASHES.n,
            report: catalogDrift
        }),
        /canonical projection/
    );

    const fallbackFailure = makeLabValidationReport();
    fallbackFailure.fallbackProofs[0].passed = false;
    assert.throws(
        () => buildLabValidationEvidence({
            rawSha256: HASHES.n,
            report: fallbackFailure
        }),
        /fallback proof/
    );

    const toleratedPhaseResidual = makeLabValidationReport();
    toleratedPhaseResidual.cases[0].fixture.densityDiagnostic
        .exactRationalLatticePhaseEvidence.maximumNumericPhaseError = 5e-10;
    assert.doesNotThrow(() => buildLabValidationEvidence({
        rawSha256: HASHES.n,
        report: toleratedPhaseResidual
    }));

    const coarseDensity = makeLabValidationReport();
    coarseDensity.cases[0].fixture.texelSizeMeters = 0.09375;
    assert.throws(
        () => buildLabValidationEvidence({
            rawSha256: HASHES.n,
            report: coarseDensity
        }),
        /selected exact-1:1 density candidate/
    );

    const staleCandidate = makeLabValidationReport();
    staleCandidate.cases[0].fixture.densityDiagnostic.requestedCandidateId =
        'texel_0p09375';
    assert.throws(
        () => buildLabValidationEvidence({
            rawSha256: HASHES.n,
            report: staleCandidate
        }),
        /selected exact-1:1 density candidate/
    );

    const phaseDrift = makeLabValidationReport();
    phaseDrift.cases[0].fixture.densityDiagnostic
        .exactRationalLatticePhaseEvidence.maximumNumericPhaseError = 1.1e-9;
    assert.throws(
        () => buildLabValidationEvidence({
            rawSha256: HASHES.n,
            report: phaseDrift
        }),
        /lattice phase evidence is invalid/
    );

    const currentCameraDrift = makeLabValidationReport();
    currentCameraDrift.cases[0].densityPhaseOracle.maximumWorldMatrixError = 1.1e-8;
    assert.throws(
        () => buildLabValidationEvidence({
            rawSha256: HASHES.n,
            report: currentCameraDrift
        }),
        /prepared camera survived current rendering/
    );

    const gridDrift = makeLabValidationReport();
    gridDrift.cases[0].fixture.tileCount = 4;
    assert.throws(
        () => buildLabValidationEvidence({
            rawSha256: HASHES.n,
            report: gridDrift
        }),
        /derived grid or chunks/
    );

    const chunkDrift = makeLabValidationReport();
    chunkDrift.cases[0].fixture.densityDiagnostic.cropChunkWindows[0].layerCount -= 1;
    assert.throws(
        () => buildLabValidationEvidence({
            rawSha256: HASHES.n,
            report: chunkDrift
        }),
        /derived grid or chunks/
    );
});

test('exact-eight aggregate remains pending without visual evidence and passes contaminated correctness evidence', () => {
    const { index, profiles } = makeExactReleaseInputs();
    const packageIndexSha256 = rawCanonicalSha256(index);
    const pending = buildProductionReleaseCertification({
        expectedValidationReportSha256: null,
        packageIndex: index,
        packageIndexSha256,
        profileCertifications: profiles,
        validationEvidence: null
    });
    assert.equal(pending.status, 'validation_pending');
    assert.equal(pending.releaseEligible, false);
    assert.deepEqual(pending.blockers, [
        'lab_validation_report_missing',
        'production_validation_report_missing'
    ]);
    assert.equal(pending.alphaCutoutCoverage.expectedCasterCount, 124);
    assert.equal(pending.alphaCutoutCoverage.releaseCoveredCasterCount, 124);
    assert.deepEqual(pending.alphaCutoutCoverage.missingCasterIds, []);
    assert.equal(pending.zeroMissingOccluderCounts.labValidationPixels, null);
    assert.equal(pending.zeroMissingOccluderCounts.validationPixels, null);

    const report = makeValidationReport(index);
    const maximumEdgePhaseErrorTexels = report.sourceShadowTexelPhaseEvidence
        .find((entry) => entry.lightingProfileId === 'ai527.sun.az045.el35')
        ?.evidence.maximumEdgePhaseErrorTexels;
    assert.ok(Number.isFinite(maximumEdgePhaseErrorTexels));
    assert.ok(maximumEdgePhaseErrorTexels >= 0);
    assert.ok(maximumEdgePhaseErrorTexels <= 1e-9);
    const validationEvidence = buildProductionValidationEvidence({
        packageIndex: index,
        packageIndexPath: 'tests/artifacts/illumination_531/package_index.json',
        profileCertifications: [...profiles].reverse(),
        rawSha256: HASHES.o,
        report
    });
    const labValidationEvidence = makeLabValidationEvidence();
    const passed = buildProductionReleaseCertification({
        expectedLabValidationReportSha256: HASHES.n,
        expectedValidationReportSha256: HASHES.o,
        labValidationEvidence,
        packageIndex: index,
        packageIndexSha256,
        profileCertifications: [...profiles].reverse(),
        validationEvidence
    });
    assert.equal(passed.status, 'passed');
    assert.equal(
        passed.schema,
        'bus-sim-static-sun-depth-production-release-certification-v3'
    );
    assert.equal(passed.releaseEligible, true);
    assert.equal(passed.performancePromotionEligible, false);
    assert.deepEqual(passed.profileIds, AI531_PRODUCTION_RELEASE_PROFILE_IDS);
    assert.deepEqual(passed.zeroMissingOccluderCounts, {
        alpha: 0,
        caster: 0,
        labValidationPixels: 0,
        opaque: 0,
        validationPixels: 0
    });

    const incompleteProfiles = structuredClone(profiles);
    for (const profile of incompleteProfiles) {
        const missingId = profile.alpha.certifiedCasterIds.at(-1);
        profile.alpha.certifiedCasterIds.pop();
        profile.alpha.certifiedCasterCount -= 1;
        profile.alpha.outOfCoverageCasterIds = [
            ...profile.alpha.outOfCoverageCasterIds,
            missingId
        ].sort();
        profile.alpha = buildAlphaCutoutCoverageCertificationRecord({
            alphaSemanticsSha256: profile.alpha.alphaSemanticsSha256,
            certifiedCasterCount: profile.alpha.certifiedCasterCount,
            certifiedCasterIds: profile.alpha.certifiedCasterIds,
            cutoutBindingProjectionSha256:
                profile.alpha.cutoutBindingProjectionSha256,
            cutoutCasterIdsSha256: profile.alpha.cutoutCasterIdsSha256,
            evidenceSha256: profile.alpha.evidenceSha256,
            expectedCasterCount: profile.alpha.expectedCasterCount,
            firstHitDepthSampleCount: profile.alpha.firstHitDepthSampleCount,
            firstHitDepthToleranceMeters:
                profile.alpha.firstHitDepthToleranceMeters,
            matchingSampleCount: profile.alpha.matchingSampleCount,
            maximumAbsoluteFirstHitDepthErrorMeters:
                profile.alpha.maximumAbsoluteFirstHitDepthErrorMeters,
            mismatchCounts: profile.alpha.mismatchCounts,
            missingOccluderCount: profile.alpha.missingOccluderCount,
            outOfCoverageCasterIds: profile.alpha.outOfCoverageCasterIds,
            parityArtifactSha256: profile.alpha.parityArtifactSha256,
            sampleCount: profile.alpha.sampleCount,
            samplePlanSha256: profile.alpha.samplePlanSha256,
            unexpectedOccluderCount: profile.alpha.unexpectedOccluderCount
        });
    }
    const incomplete = buildProductionReleaseCertification({
        expectedValidationReportSha256: null,
        packageIndex: index,
        packageIndexSha256,
        profileCertifications: incompleteProfiles,
        validationEvidence: null
    });
    assert.equal(incomplete.releaseEligible, false);
    assert.ok(incomplete.blockers.includes('alpha_cutout_release_union_incomplete'));
    assert.equal(incomplete.alphaCutoutCoverage.releaseCoveredCasterCount, 123);
    assert.equal(incomplete.alphaCutoutCoverage.missingCasterIds.length, 1);

    const reboundValidationEvidence = structuredClone(validationEvidence);
    const packageAggregate = reboundValidationEvidence
        .sourceShadowTexelPhaseEvidence[0].packageAggregateSha256;
    reboundValidationEvidence.sourceShadowTexelPhaseEvidence[0]
        .packageAggregateSha256 = (packageAggregate[0] === '0' ? '1' : '0')
            + packageAggregate.slice(1);
    assert.throws(
        () => buildProductionReleaseCertification({
            expectedLabValidationReportSha256: HASHES.n,
            expectedValidationReportSha256: HASHES.o,
            labValidationEvidence,
            packageIndex: index,
            packageIndexSha256,
            profileCertifications: profiles,
            validationEvidence: reboundValidationEvidence
        }),
        /differs from its authenticated package/
    );
});

test('aggregate rejects lab/partial profile inventories, missing pixels, and an explicit report-hash mismatch', () => {
    const { index, profiles } = makeExactReleaseInputs();
    const partial = structuredClone(index);
    delete partial.profiles[AI531_PRODUCTION_RELEASE_PROFILE_IDS[0]];
    assert.throws(
        () => buildProductionReleaseCertification({
            packageIndex: partial,
            packageIndexSha256: HASHES.a,
            profileCertifications: profiles
        }),
        /exact eight non-lab profiles/
    );

    const withLab = structuredClone(index);
    withLab.profiles['ai527.sun.az225.el12'] = withLab.profiles[
        AI531_PRODUCTION_RELEASE_PROFILE_IDS[0]
    ];
    assert.throws(
        () => buildProductionReleaseCertification({
            packageIndex: withLab,
            packageIndexSha256: HASHES.a,
            profileCertifications: profiles
        }),
        /exact eight non-lab profiles/
    );

    const report = makeValidationReport(index);
    report.cases[0].metrics.missingOccluderPixelCount = 1;
    assert.throws(
        () => buildProductionValidationEvidence({
            packageIndex: index,
            packageIndexPath: report.packageIndex,
            profileCertifications: profiles,
            rawSha256: HASHES.o,
            report
        }),
        /independent metrics: missing_occluder/
    );

    const wrongCaptureSummaryDimensions = makeValidationReport(index);
    wrongCaptureSummaryDimensions.captureAuthentication.dimensionsPixels = [1280, 696];
    assert.throws(
        () => buildProductionValidationEvidence({
            packageIndex: index,
            packageIndexPath: wrongCaptureSummaryDimensions.packageIndex,
            profileCertifications: profiles,
            rawSha256: HASHES.o,
            report: wrongCaptureSummaryDimensions
        }),
        /capture authentication summary is invalid/
    );

    const wrongMetricDimensions = makeValidationReport(index);
    Object.assign(wrongMetricDimensions.cases[0].metrics, {
        eligibleStaticReceiverPixelCount: 890879,
        height: 696,
        pixelCount: 890880
    });
    assert.throws(
        () => buildProductionValidationEvidence({
            packageIndex: index,
            packageIndexPath: wrongMetricDimensions.packageIndex,
            profileCertifications: profiles,
            rawSha256: HASHES.o,
            report: wrongMetricDimensions
        }),
        /dimensions differ from the 1280x720 capture policy/
    );

    const workloadFailure = makeValidationReport(index);
    workloadFailure.cases[0].workload.cache.staticCityShadow.calls = 1;
    assert.throws(
        () => buildProductionValidationEvidence({
            packageIndex: index,
            packageIndexPath: workloadFailure.packageIndex,
            profileCertifications: profiles,
            rawSha256: HASHES.o,
            report: workloadFailure
        }),
        /shadow submission gate/
    );

    const casterFailure = makeValidationReport(index);
    casterFailure.cases[0].diagnostics.comparison.casters.active = true;
    assert.throws(
        () => buildProductionValidationEvidence({
            packageIndex: index,
            packageIndexPath: casterFailure.packageIndex,
            profileCertifications: profiles,
            rawSha256: HASHES.o,
            report: casterFailure
        }),
        /caster transition gate/
    );

    const emptyDynamicMask = makeValidationReport(index);
    for (const entry of emptyDynamicMask.cases) {
        entry.metrics.dynamicReceiverMaskedPixelCount = 0;
        entry.metrics.eligibleStaticReceiverPixelCount = entry.metrics.pixelCount;
        entry.metrics.outsideStaticReceiverPixelCount = 0;
    }
    emptyDynamicMask.dynamicBusEvidence.totalMaskedDynamicReceiverPixelCount = 0;
    emptyDynamicMask.dynamicBusEvidence.casesWithVisibleDynamicReceiver = 0;
    assert.throws(
        () => buildProductionValidationEvidence({
            packageIndex: index,
            packageIndexPath: emptyDynamicMask.packageIndex,
            profileCertifications: profiles,
            rawSha256: HASHES.o,
            report: emptyDynamicMask
        }),
        /dynamic bus aggregate/
    );

    const suppressedBus = makeValidationReport(index);
    suppressedBus.cases[0].dynamicBus.cache.casterMeshCount -= 1;
    assert.throws(
        () => buildProductionValidationEvidence({
            packageIndex: index,
            packageIndexPath: suppressedBus.packageIndex,
            profileCertifications: profiles,
            rawSha256: HASHES.o,
            report: suppressedBus
        }),
        /dynamic bus was suppressed or changed/
    );

    const missingBusShadowImpact = makeValidationReport(index);
    for (const entry of missingBusShadowImpact.cases) {
        entry.dynamicBus.shadowProof.affectedStaticCityReceiverPixelCount = 0;
        entry.dynamicBus.shadowProof.maximumLumaDarkeningByte = 0;
    }
    missingBusShadowImpact.dynamicBusEvidence.affectedStaticCityReceiverPixelCount = 0;
    missingBusShadowImpact.dynamicBusEvidence.casesWithStaticCityShadowImpact = 0;
    assert.throws(
        () => buildProductionValidationEvidence({
            packageIndex: index,
            packageIndexPath: missingBusShadowImpact.packageIndex,
            profileCertifications: profiles,
            rawSha256: HASHES.o,
            report: missingBusShadowImpact
        }),
        /dynamic bus aggregate/
    );

    const inverseBusShadow = makeValidationReport(index);
    inverseBusShadow.cases[0].dynamicBus.shadowProof = {
        ...inverseBusShadow.cases[0].dynamicBus.shadowProof,
        affectedStaticCityReceiverPixelCount: 0,
        brightenedStaticCityReceiverPixelCount: 1,
        maximumLumaBrighteningByte: 16,
        maximumLumaDarkeningByte: 0
    };
    inverseBusShadow.dynamicBusEvidence.brightenedStaticCityReceiverPixelCount = 1;
    inverseBusShadow.dynamicBusEvidence.casesWithStaticCityBrightening = 1;
    assert.throws(
        () => buildProductionValidationEvidence({
            packageIndex: index,
            packageIndexPath: inverseBusShadow.packageIndex,
            profileCertifications: profiles,
            rawSha256: HASHES.o,
            report: inverseBusShadow
        }),
        /brightens City receivers/
    );

    const oldProofMethod = makeValidationReport(index);
    oldProofMethod.cases[0].dynamicBus.shadowProof.method =
        'bus_cast_shadow_on_vs_off_over_visible_city_receivers_v1';
    assert.throws(
        () => buildProductionValidationEvidence({
            packageIndex: index,
            packageIndexPath: oldProofMethod.packageIndex,
            profileCertifications: profiles,
            rawSha256: HASHES.o,
            report: oldProofMethod
        }),
        /method is unsupported/
    );

    const oldReportSchema = makeValidationReport(index);
    oldReportSchema.schema = 'bus-sim-static-sun-depth-production-validation-report-v3';
    assert.throws(
        () => buildProductionValidationEvidence({
            packageIndex: index,
            packageIndexPath: oldReportSchema.packageIndex,
            profileCertifications: profiles,
            rawSha256: HASHES.o,
            report: oldReportSchema
        }),
        /release schema and pass/
    );

    const packageReplay = makeValidationReport(index);
    packageReplay.cases[0].diagnostics.cache.runtime.package.aggregateSha256 = HASHES.n;
    assert.throws(
        () => buildProductionValidationEvidence({
            packageIndex: index,
            packageIndexPath: packageReplay.packageIndex,
            profileCertifications: profiles,
            rawSha256: HASHES.o,
            report: packageReplay
        }),
        /package aggregate identity differs/
    );

    const performanceClaim = makeValidationReport(index);
    performanceClaim.timingContamination = {
        contaminated: false,
        reason: null,
        usableForPromotion: true
    };
    assert.throws(
        () => buildProductionValidationEvidence({
            packageIndex: index,
            packageIndexPath: performanceClaim.packageIndex,
            profileCertifications: profiles,
            rawSha256: HASHES.o,
            report: performanceClaim
        }),
        /forbids performance promotion/
    );

    const validEvidence = buildProductionValidationEvidence({
        packageIndex: index,
        packageIndexPath: report.packageIndex,
        profileCertifications: profiles,
        rawSha256: HASHES.o,
        report: makeValidationReport(index)
    });
    assert.throws(
        () => buildProductionReleaseCertification({
            expectedValidationReportSha256: null,
            packageIndex: index,
            packageIndexSha256: rawCanonicalSha256(index),
            profileCertifications: profiles,
            validationEvidence: validEvidence
        }),
        /independent expected report SHA-256/
    );
    assert.throws(
        () => buildProductionReleaseCertification({
            expectedValidationReportSha256: HASHES.n,
            packageIndex: index,
            packageIndexSha256: rawCanonicalSha256(index),
            profileCertifications: profiles,
            validationEvidence: validEvidence
        }),
        /differs from its explicit expected hash/
    );
});

test('validation evidence independently rejects case-catalog and complete metric gate drift', () => {
    const { index, profiles } = makeExactReleaseInputs();
    const certify = (report) => buildProductionValidationEvidence({
        packageIndex: index,
        packageIndexPath: report.packageIndex,
        profileCertifications: profiles,
        rawSha256: HASHES.o,
        report
    });
    const mutation = (mutate, pattern) => {
        const report = structuredClone(makeValidationReport(index));
        mutate(report);
        assert.throws(() => certify(report), pattern);
    };

    mutation(
        (report) => { report.cases[0].caseId = 'illum.noncanonical.fabricated'; },
        /canonical 197-case inventory/
    );
    mutation(
        (report) => {
            report.cases[0].lightingProfileId = AI531_PRODUCTION_RELEASE_PROFILE_IDS.find(
                (id) => id !== report.cases[0].lightingProfileId
            );
        },
        /canonical projection/
    );
    mutation(
        (report) => { report.cases[0].kind = 'profiler_pose'; },
        /canonical projection/
    );
    mutation(
        (report) => { report.cases[0].camera.profile.fovDeg += 1; },
        /canonical projection/
    );
    mutation(
        (report) => { report.cases[0].sunProfile.azimuthDeg += 1; },
        /canonical projection/
    );
    mutation(
        (report) => { delete report.cases[0].metrics.maxRgbErrorByte; },
        /must contain exactly/
    );
    mutation(
        (report) => { report.cases[0].metrics.falseLitMethod = 'unsupported'; },
        /unsupported evidence method/
    );
    mutation(
        (report) => { report.cases[0].metrics.meanRgbErrorByte = 0.351; },
        /independent metrics: mean_rgb_error/
    );
    mutation(
        (report) => {
            report.cases[0].metrics.maxRgbErrorByte = 65;
            report.cases[0].metrics.rawSamePixelMaxRgbErrorByte = 65;
        },
        /independent metrics: maximum_rgb_error/
    );
    mutation(
        (report) => {
            report.cases[0].metrics.pixelsOverFourByte = 2000;
            report.cases[0].metrics.pixelsOverFourBytePercent =
                2000 / report.cases[0].metrics.eligibleStaticReceiverPixelCount * 100;
            report.cases[0].metrics.rawSamePixelPixelsOverFourByte = 2000;
            report.cases[0].metrics.rawSamePixelPixelsOverFourBytePercent =
                2000 / report.cases[0].metrics.eligibleStaticReceiverPixelCount * 100;
        },
        /independent metrics: pixels_over_four/
    );
    mutation(
        (report) => { report.cases[0].metrics.outsideStaticReceiverPixelCount += 1; },
        /does not partition pixelCount/
    );
    mutation(
        (report) => {
            const metrics = report.cases[0].metrics;
            metrics.eligibleStaticReceiverPixelCount = 1;
            metrics.dynamicReceiverMaskedPixelCount = 0;
            metrics.outsideStaticReceiverPixelCount = metrics.pixelCount - 1;
            metrics.pixelsOverFourByte = 0;
            metrics.pixelsOverFourBytePercent = 0;
        },
        /static-receiver mask coverage collapsed/
    );
    mutation(
        (report) => {
            delete report.cases[0].captures.staticCityReceiverMask;
        },
        /must contain exactly/
    );
    mutation(
        (report) => {
            report.captureAuthentication.minimumStaticReceiverPixelCount = 1;
        },
        /capture authentication summary is invalid/
    );
    mutation(
        (report) => {
            report.cases[0].metrics.seamErrorPixelCount = 2;
            report.cases[0].metrics.seamPixelCount = 2;
            report.cases[0].metrics.maxContinuousSeamRunPixels = 2;
        },
        /independent metrics: continuous_seam/
    );
    mutation(
        (report) => { report.cases[0].metrics.pixelsOverFourBytePercent = 1; },
        /inconsistent with its count/
    );
    mutation(
        (report) => { report.thresholds.meanRgbErrorByte = 1; },
        /production validation thresholds/
    );
    mutation(
        (report) => { report.sameSessionPairing = 'unpaired'; },
        /same-session pairing/
    );
    mutation(
        (report) => { delete report.sourceShadowTexelPhaseEvidence; },
        /live texel phase evidence for exactly eight profiles/
    );
    mutation(
        (report) => {
            [
                report.sourceShadowTexelPhaseEvidence[0],
                report.sourceShadowTexelPhaseEvidence[1]
            ] = [
                report.sourceShadowTexelPhaseEvidence[1],
                report.sourceShadowTexelPhaseEvidence[0]
            ];
        },
        /exact ordered profile inventory/
    );
    mutation(
        (report) => {
            const entry = report.sourceShadowTexelPhaseEvidence[0];
            entry.descriptorSha256 = (entry.descriptorSha256[0] === '0' ? '1' : '0')
                + entry.descriptorSha256.slice(1);
        },
        /differs from its authenticated package/
    );
    mutation(
        (report) => {
            report.sourceShadowTexelPhaseEvidence[0]
                .evidence.cacheTexelPitchMeters += 1e-6;
        },
        /unsupported schema, policy, status, or pitch/
    );
    mutation(
        (report) => {
            report.sourceShadowTexelPhaseEvidence[0]
                .evidence.matchedSignedPermutation = [[0.5, 0.5], [0.5, -0.5]];
        },
        /must be a 2x2 signed permutation/
    );
    mutation(
        (report) => {
            report.sourceShadowTexelPhaseEvidence[0]
                .evidence.cacheToLivePhaseIndices[0] += 0.25;
        },
        /cache-to-live phase indices are inconsistent/
    );
    mutation(
        (report) => {
            report.sourceShadowTexelPhaseEvidence[0]
                .evidence.maximumEdgePhaseErrorTexels = 0.25;
        },
        /exceeds the 1e-9 release tolerance/
    );
});

test('release finalizer CLI parses explicit independent Lab and production report hashes', () => {
    const parsed = parseProductionReleaseCertificationArgs([
        '--lab-validation-report',
        'tests/artifacts/screens/illumination_531/lab/lab_validation_report.json',
        '--lab-validation-report-sha256',
        HASHES.n,
        '--validation-report',
        'tests/artifacts/screens/illumination_531/production_validation_report.json',
        '--validation-report-sha256',
        HASHES.o
    ]);
    assert.match(
        parsed.validationReportPath.replaceAll('\\', '/'),
        /production_validation_report\.json$/
    );
    assert.equal(parsed.expectedValidationReportSha256, HASHES.o);
    assert.match(
        parsed.labValidationReportPath.replaceAll('\\', '/'),
        /lab_validation_report\.json$/
    );
    assert.equal(parsed.expectedLabValidationReportSha256, HASHES.n);
    assert.throws(
        () => parseProductionReleaseCertificationArgs([
            '--validation-report-sha256',
            'not-a-hash'
        ]),
        /lowercase SHA-256/
    );
    assert.throws(
        () => parseProductionReleaseCertificationArgs([
            '--lab-validation-report-sha256',
            'not-a-hash'
        ]),
        /lowercase SHA-256/
    );
});

test('release package authentication rejects malformed windows and independently compares full RG8', () => {
    const fixture = makeProfileFixture(AI531_PRODUCTION_RELEASE_PROFILE_IDS[0]);
    const [storedWidth, storedHeight] =
        fixture.descriptor.tiles[0].storedTexels;
    const payloadBytes = Uint8Array.from(
        {
            length: storedWidth * storedHeight * 2
                * fixture.descriptor.tiles.length
        },
        (_, index) => (index * 37 + 11) & 255
    );
    const evidence = {
        descriptor: fixture.descriptor,
        payloadBytes,
        receipt: fixture.receipt
    };
    const verified = makeVerifiedPackageEvidence(evidence, true);
    const result = authenticatePublishedStaticSunDepthPackage(
        verified,
        fixture.descriptor,
        payloadBytes,
        fixture.receipt.request.lightingProfileId
    );
    assert.equal(result.assembledByteLength, payloadBytes.byteLength);
    assert.equal(result.assembledSha256, rawBytesSha256(payloadBytes));

    for (const mutate of [
        (value) => value.chunks.reverse(),
        (value) => { value.chunks[1].descriptor.coordinateTransform.firstLayer = 2; },
        (value) => { value.chunks[1].descriptor.coordinateTransform.firstLayer = 0; },
        (value) => { value.chunks[1].descriptor.id = value.chunks[0].descriptor.id; },
        (value) => {
            value.chunks[1].descriptor.coordinateTransform.assembledSha256 = HASHES.a;
        },
        (value) => { value.chunks[1].data[0] ^= 255; }
    ]) {
        const invalid = structuredClone(verified);
        mutate(invalid);
        assert.throws(
            () => authenticatePublishedStaticSunDepthPackage(
                invalid,
                fixture.descriptor,
                payloadBytes,
                fixture.receipt.request.lightingProfileId
            ),
            /Package chunk/
        );
    }
    const tamperedPayload = payloadBytes.slice();
    tamperedPayload[0] ^= 255;
    assert.throws(
        () => authenticatePublishedStaticSunDepthPackage(
            verified,
            fixture.descriptor,
            tamperedPayload,
            fixture.receipt.request.lightingProfileId
        ),
        /published_sha256|published_bytes/
    );
});

test('release finalizer authenticates eight packages and independently rehashes dual reports plus 1009 PNGs', async () => {
    const currentRoot = process.cwd();
    const artifactRoot = path.join(currentRoot, 'tests/artifacts/illumination_531');
    const inputPath = path.join(
        currentRoot,
        'tests/artifacts/illumination_528/packages/bigcity2',
        'ai531-production/bigcity2.bsib'
    );
    const packageIndexPath = path.join(artifactRoot, 'package_index.json');
    const outputPath = path.join(artifactRoot, 'release_certification.json');
    const sourceBytes = Uint8Array.of(66, 83, 73, 66, 5, 3, 1);
    const sourcePackageRawSha256 = rawBytesSha256(sourceBytes);
    const finalFileDomainSha256 = await sha256Hex(
        'bus-simulator/illumination/bake-source/final-file/v1',
        sourceBytes
    );
    const fixtures = AI531_PRODUCTION_RELEASE_PROFILE_IDS.map((lightingProfileId) => {
        const fixture = makeProfileFixture(lightingProfileId);
        const interiorBytes = Uint8Array.of(73, 78, 84, 69, 82, 73, 79, 82);
        fixture.receipt.input.packageRawSha256 = sourcePackageRawSha256;
        fixture.receipt.input.finalFileDomainSha256 = finalFileDomainSha256;
        fixture.receipt.outputs[0].byteLength = interiorBytes.byteLength;
        fixture.receipt.outputs[0].sha256 = rawBytesSha256(interiorBytes);
        fixture.receiptSha256 = rawBytesSha256(canonicalJsonBytes(fixture.receipt));
        return { fixture, interiorBytes };
    });
    const profiles = fixtures.map(({ fixture }) =>
        buildProductionProfileReleaseCertification(fixture));
    const index = makeReleaseIndex(profiles);
    const files = new Map([
        [inputPath, sourceBytes],
        [packageIndexPath, canonicalJsonBytes(index)]
    ]);
    const verifiedEvidence = new Map();
    profiles.forEach((certification, profileIndex) => {
        const { fixture, interiorBytes } = fixtures[profileIndex];
        const profileRoot = path.join(
            artifactRoot,
            'production',
            certification.lightingProfileId
        );
        const certificationBytes = canonicalJsonBytes(certification);
        const receiptBytes = canonicalJsonBytes(fixture.receipt);
        const descriptorBytes = canonicalJsonBytes(fixture.descriptor);
        const alphaBytes = canonicalJsonBytes(fixture.receipt.alphaCertification);
        const opaqueBytes = canonicalJsonBytes(fixture.receipt.opaqueCertification);
        const packageBytes = Uint8Array.of(profileIndex + 1, 83, 83, 68);
        const [storedWidth, storedHeight] =
            fixture.descriptor.tiles[0].storedTexels;
        const payloadBytes = Uint8Array.from(
            {
                length: storedWidth * storedHeight * 2
                    * fixture.descriptor.tiles.length
            },
            (_, index) => (profileIndex * 17 + index * 29 + 3) & 255
        );
        const published = new Map([
            ['alpha_certification.json', alphaBytes],
            ['artifact_manifest.json', canonicalJsonBytes({ status: 'complete' })],
            ['certification.json', canonicalJsonBytes({ status: 'passed' })],
            ['descriptor.json', descriptorBytes],
            ['input_identity.json', canonicalJsonBytes({ sha256: HASHES.a })],
            ['metrics.json', canonicalJsonBytes({ status: 'complete' })],
            ['opaque_certification.json', opaqueBytes],
            ['production_static_sun_receipt.json', receiptBytes],
            ['release_certification.json', certificationBytes],
            ['request.json', canonicalJsonBytes({
                lightingProfileId: certification.lightingProfileId
            })],
            ['static_sun_depth.ilpkg', packageBytes],
            ['static_sun_depth.rg8', payloadBytes],
            [fixture.receipt.outputs[0].path, interiorBytes]
        ]);
        const cutoutCasterIds = fixture.manifest.casterMappings
            .filter((entry) => entry.coverageMode === 'cutout')
            .map((entry) => entry.id)
            .sort();
        for (const [key, bytes] of Object.entries(makeAlphaCutoutEvidenceBytes(
            certification.lightingProfileId,
            cutoutCasterIds
        ))) {
            published.set(`alpha/${alphaEvidenceFileName(key)}`, bytes);
        }
        verifiedEvidence.set(certification.lightingProfileId, {
            descriptor: fixture.descriptor,
            payloadBytes,
            receipt: fixture.receipt
        });
        const publication = {
            files: [...published.entries()]
                .map(([relativePath, bytes]) => ({
                    byteLength: bytes.byteLength,
                    path: relativePath,
                    sha256: rawBytesSha256(bytes)
                }))
                .sort((left, right) => (
                    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
                )),
            inputIdentitySha256: HASHES.a,
            lightingProfileId: certification.lightingProfileId,
            packageAggregateSha256: certification.packageAggregateSha256,
            packageIndexEntry: {
                lightingProfileId: certification.lightingProfileId,
                ...index.profiles[certification.lightingProfileId]
            },
            schema: 'bus-sim-static-sun-depth-production-publication-v1',
            status: 'complete'
        };
        files.set(
            path.join(profileRoot, 'publication.json'),
            canonicalJsonBytes(publication)
        );
        for (const [relativePath, bytes] of published) {
            files.set(path.join(profileRoot, ...relativePath.split('/')), bytes);
        }
    });
    let written = null;
    let verifiedPackageCount = 0;
    const regularEntry = { isSymbolicLink: () => false };
    const validatePayloadFn = ({ descriptor, payload }) => {
        assert.equal(descriptor.tiles.length, 2);
        assert.ok(payload instanceof Uint8Array);
        return { valid: true };
    };
    const buildArtifactFn = ({ receipt, interiorTiles }) => {
        const evidence = verifiedEvidence.get(receipt.request.lightingProfileId);
        assert.equal(interiorTiles.length, receipt.outputs.length);
        assert.equal(
            rawBytesSha256(interiorTiles[0].bytes),
            receipt.outputs[0].sha256
        );
        return {
            descriptor: evidence.descriptor,
            payload: evidence.payloadBytes
        };
    };
    await assert.rejects(
        finalizeProductionReleaseCertification({
            artifactRoot,
            expectedValidationReportSha256: null,
            inputPath,
            outputPath,
            packageIndexPath,
            repoRoot: currentRoot,
            validationReportPath: path.join(
                currentRoot,
                'tests/artifacts/screens/illumination_531/production_validation_report.json'
            )
        }),
        /requires an independent --validation-report-sha256/
    );
    await assert.rejects(
        finalizeProductionReleaseCertification({
            artifactRoot,
            expectedLabValidationReportSha256: null,
            expectedValidationReportSha256: null,
            inputPath,
            labValidationReportPath: path.join(
                currentRoot,
                'tests/artifacts/screens/illumination_531/lab/lab_validation_report.json'
            ),
            outputPath,
            packageIndexPath,
            repoRoot: currentRoot,
            validationReportPath: null
        }),
        /requires an independent --lab-validation-report-sha256/
    );
    await assert.rejects(
        finalizeProductionReleaseCertification({
            artifactRoot,
            expectedValidationReportSha256: null,
            inputPath,
            outputPath,
            packageIndexPath,
            repoRoot: currentRoot,
            validationReportPath: null
        }, {
            lstatFn: async (filePath) => ({
                isSymbolicLink: () => path.resolve(filePath) === artifactRoot
            })
        }),
        /rejects symbolic-link path segment/
    );
    const result = await finalizeProductionReleaseCertification({
        artifactRoot,
        expectedValidationReportSha256: null,
        inputPath,
        outputPath,
        packageIndexPath,
        repoRoot: currentRoot,
        validationReportPath: null
    }, {
        buildArtifactFn,
        lstatFn: async () => regularEntry,
        mkdirFn: async () => {},
        readFileFn: async (filePath) => {
            const value = files.get(path.resolve(filePath));
            if (!value) throw new Error(`Unexpected read '${filePath}'`);
            return value;
        },
        validateReceiptFn: async (value) => value,
        validatePayloadFn,
        validateSourcePackageFn: async (bytes) => {
            assert.equal(rawBytesSha256(bytes), sourcePackageRawSha256);
            return {
                manifest: fixtures[0].fixture.manifest,
                report: fixtures[0].fixture.sourceValidationReport
            };
        },
        verifyPackageFn: async (_bytes, options) => {
            verifiedPackageCount += 1;
            const evidence = verifiedEvidence.get(
                options.expectations.lightingProfileId
            );
            assert.equal(
                options.expectations.selectedCapabilityProfileId,
                'development.static_sun_v1'
            );
            assert.equal(options.expectations.profileSha256, HASHES.n);
            assert.equal(
                options.expectations.compilerSignatureSha256,
                evidence.receipt.compilerSignatureSha256
            );
            const verified = makeVerifiedPackageEvidence(evidence, true);
            assert.deepEqual(Object.keys(verified.manifest.source).sort(), [
                'descriptor',
                'descriptorSha256',
                'resolvedSourceSha256'
            ]);
            return verified;
        },
        writeFileFn: async (filePath, bytes) => {
            assert.equal(path.resolve(filePath), outputPath);
            written = bytes;
        }
    });
    assert.equal(verifiedPackageCount, 8);
    assert.equal(result.certification.status, 'validation_pending');
    assert.equal(result.certification.releaseEligible, false);
    assert.equal(
        new TextDecoder().decode(written),
        canonicalJsonStringify(result.certification)
    );

    const labReport = makeLabValidationReport();
    const productionReport = makeValidationReport(index, profiles);
    await installAuthenticatedCaptureFiles(labReport, files, currentRoot);
    await installAuthenticatedCaptureFiles(productionReport, files, currentRoot);
    const labValidationReportPath = path.join(
        currentRoot,
        'tests/artifacts/screens/illumination_531/lab/lab_validation_report.json'
    );
    const productionValidationReportPath = path.join(
        currentRoot,
        'tests/artifacts/screens/illumination_531/production_validation_report.json'
    );
    const labReportBytes = new TextEncoder().encode(JSON.stringify(labReport));
    const productionReportBytes =
        new TextEncoder().encode(JSON.stringify(productionReport));
    files.set(labValidationReportPath, labReportBytes);
    files.set(productionValidationReportPath, productionReportBytes);
    verifiedPackageCount = 0;
    const passedResult = await finalizeProductionReleaseCertification({
        artifactRoot,
        expectedLabValidationReportSha256: rawBytesSha256(labReportBytes),
        expectedValidationReportSha256: rawBytesSha256(productionReportBytes),
        inputPath,
        labValidationReportPath,
        outputPath,
        packageIndexPath,
        repoRoot: currentRoot,
        validationReportPath: productionValidationReportPath
    }, {
        buildArtifactFn,
        lstatFn: async () => regularEntry,
        mkdirFn: async () => {},
        readFileFn: async (filePath) => {
            const value = files.get(path.resolve(filePath));
            if (!value) throw new Error('Unexpected authenticated fixture read');
            return value;
        },
        validateReceiptFn: async (value) => value,
        validatePayloadFn,
        validateSourcePackageFn: async () => ({
            manifest: fixtures[0].fixture.manifest,
            report: fixtures[0].fixture.sourceValidationReport
        }),
        verifyPackageFn: async (_bytes, options) => makeVerifiedPackageEvidence(
            verifiedEvidence.get(options.expectations.lightingProfileId)
        ),
        writeFileFn: async (_filePath, bytes) => {
            written = bytes;
        }
    });
    assert.equal(verifiedPackageCount, 0);
    assert.equal(passedResult.certification.status, 'passed');
    assert.equal(passedResult.certification.releaseEligible, true);
    assert.equal(
        passedResult.certification.labValidation.captureAuthentication.captureCount,
        24
    );
    assert.equal(
        passedResult.certification.validation.captureAuthentication.captureCount,
        985
    );

    const driftedManifest = structuredClone(fixtures[0].fixture.manifest);
    driftedManifest.hashes.geometry = HASHES.o;
    await assert.rejects(
        finalizeProductionReleaseCertification({
            artifactRoot,
            expectedValidationReportSha256: null,
            inputPath,
            outputPath,
            packageIndexPath,
            repoRoot: currentRoot,
            validationReportPath: null
        }, {
            buildArtifactFn,
            lstatFn: async () => regularEntry,
            mkdirFn: async () => {},
            readFileFn: async (filePath) => files.get(path.resolve(filePath)),
            validateReceiptFn: async (value) => value,
            validatePayloadFn,
            validateSourcePackageFn: async () => ({
                manifest: driftedManifest,
                report: fixtures[0].fixture.sourceValidationReport
            }),
            verifyPackageFn: async () => {
                throw new Error('Package verification must not run after source drift');
            },
            writeFileFn: async () => {}
        }),
        /differs from the fresh source/
    );

    await assert.rejects(
        finalizeProductionReleaseCertification({
            artifactRoot,
            expectedValidationReportSha256: null,
            inputPath,
            outputPath,
            packageIndexPath,
            repoRoot: currentRoot,
            validationReportPath: null
        }, {
            buildArtifactFn,
            lstatFn: async () => regularEntry,
            mkdirFn: async () => {},
            readFileFn: async (filePath) => files.get(path.resolve(filePath)),
            validateReceiptFn: async (value) => value,
            validatePayloadFn,
            validateSourcePackageFn: async () => ({
                manifest: fixtures[0].fixture.manifest,
                report: fixtures[0].fixture.sourceValidationReport
            }),
            verifyPackageFn: async (_bytes, options) => {
                const evidence = verifiedEvidence.get(
                    options.expectations.lightingProfileId
                );
                const verified = makeVerifiedPackageEvidence(evidence);
                verified.chunks[0].descriptor.coordinateTransform = {
                    tampered: true
                };
                return verified;
            },
            writeFileFn: async () => {}
        }),
        /Package chunk .* differs from the published descriptor/
    );

    await assert.rejects(
        finalizeProductionReleaseCertification({
            artifactRoot,
            expectedValidationReportSha256: null,
            inputPath,
            outputPath,
            packageIndexPath,
            repoRoot: currentRoot,
            validationReportPath: null
        }, {
            buildArtifactFn: ({ receipt }) => {
                const evidence = verifiedEvidence.get(
                    receipt.request.lightingProfileId
                );
                return {
                    descriptor: { substituted: true },
                    payload: evidence.payloadBytes
                };
            },
            lstatFn: async () => regularEntry,
            mkdirFn: async () => {},
            readFileFn: async (filePath) => files.get(path.resolve(filePath)),
            validateReceiptFn: async (value) => value,
            validatePayloadFn,
            validateSourcePackageFn: async () => ({
                manifest: fixtures[0].fixture.manifest,
                report: fixtures[0].fixture.sourceValidationReport
            }),
            verifyPackageFn: async () => {
                throw new Error('Package verification must not run after artifact substitution');
            },
            writeFileFn: async () => {}
        }),
        /does not match the canonical artifact rebuilt/
    );

    await assert.rejects(
        finalizeProductionReleaseCertification({
            artifactRoot,
            expectedValidationReportSha256: null,
            inputPath,
            outputPath,
            packageIndexPath,
            repoRoot: currentRoot,
            validationReportPath: null
        }, {
            buildArtifactFn,
            lstatFn: async () => regularEntry,
            mkdirFn: async () => {},
            readFileFn: async (filePath) => files.get(path.resolve(filePath)),
            validateReceiptFn: async (value) => value,
            validatePayloadFn,
            validateSourcePackageFn: async () => ({
                manifest: fixtures[0].fixture.manifest,
                report: fixtures[0].fixture.sourceValidationReport
            }),
            verifyPackageFn: async (_bytes, options) => {
                const evidence = verifiedEvidence.get(
                    options.expectations.lightingProfileId
                );
                const verified = makeVerifiedPackageEvidence(evidence);
                verified.chunks[0].descriptor.encoding = 'rgba8_unorm';
                return verified;
            },
            writeFileFn: async () => {}
        }),
        /Package chunk .* differs from the published descriptor/
    );

    const firstInteriorPath = path.join(
        artifactRoot,
        'production',
        AI531_PRODUCTION_RELEASE_PROFILE_IDS[0],
        ...fixtures[0].fixture.receipt.outputs[0].path.split('/')
    );
    files.set(firstInteriorPath, Uint8Array.of(0));
    await assert.rejects(
        finalizeProductionReleaseCertification({
            artifactRoot,
            expectedValidationReportSha256: null,
            inputPath,
            outputPath,
            packageIndexPath,
            repoRoot: currentRoot,
            validationReportPath: null
        }, {
            lstatFn: async () => regularEntry,
            mkdirFn: async () => {},
            readFileFn: async (filePath) => files.get(path.resolve(filePath)),
            validateReceiptFn: async (value) => value,
            validateSourcePackageFn: async () => ({
                manifest: fixtures[0].fixture.manifest,
                report: fixtures[0].fixture.sourceValidationReport
            }),
            verifyPackageFn: async () => ({ compatibility: { compatible: true } }),
            writeFileFn: async () => {}
        }),
        /differs from its digest/
    );
    files.set(firstInteriorPath, fixtures[0].interiorBytes);

    const firstReceiptPath = path.join(
        artifactRoot,
        'production',
        AI531_PRODUCTION_RELEASE_PROFILE_IDS[0],
        'production_static_sun_receipt.json'
    );
    files.set(firstReceiptPath, canonicalJsonBytes({ tampered: true }));
    await assert.rejects(
        finalizeProductionReleaseCertification({
            artifactRoot,
            expectedValidationReportSha256: null,
            inputPath,
            outputPath,
            packageIndexPath,
            repoRoot: currentRoot,
            validationReportPath: null
        }, {
            lstatFn: async () => regularEntry,
            mkdirFn: async () => {},
            readFileFn: async (filePath) => files.get(path.resolve(filePath)),
            validateReceiptFn: async (value) => value,
            validateSourcePackageFn: async () => ({
                manifest: fixtures[0].fixture.manifest,
                report: fixtures[0].fixture.sourceValidationReport
            }),
            verifyPackageFn: async () => ({ compatibility: { compatible: true } }),
            writeFileFn: async () => {}
        }),
        /differs from its digest/
    );
});

function makeProfileFixture(lightingProfileId) {
    const manifest = makeManifest();
    const identity = deriveProductionSourceIdentityHashes(manifest);
    const packagePath = packagePathFor(lightingProfileId);
    const compilerDescriptor = {
        backend: 'cycles_cpu',
        schema: 'fixture-ai531-production-compiler-v1'
    };
    const compilerSignatureSha256 = rawCanonicalSha256(compilerDescriptor);
    const request = createProductionStaticSunRequest(
        selectProductionStaticSunProfiles([lightingProfileId])[0]
    );
    const descriptor = makeStaticSunDepthDescriptor({
        compilerSignatureSha256,
        identity,
        request
    });
    const coverageInput = {
        alphaInputId: 'alpha.cutout',
        alphaTest: 0.5,
        inputs: [{
            bindingId: 'binding.cutout',
            channel: 'a',
            coverageBufferId: 'texture.cutout:coverage:a',
            coverageSha256: HASHES.m,
            operation: 'multiply',
            sourceContentSha256: HASHES.l,
            sourceId: 'texture.cutout'
        }],
        materialId: 'material.cutout',
        opacity: 1,
        vertexColors: false
    };
    const spatialParityArtifact = makeAlphaCutoutSpatialParityArtifact({
        descriptor,
        identity,
        lightingProfileId,
        manifest
    });
    return {
        descriptor,
        manifest,
        packageAggregateSha256: HASHES.j,
        packagePath,
        receipt: {
            assumptions: {
                sidedness:
                    'authenticated-three-r183-effective-shadow-side-then-world-space-direction-filter-v1'
            },
            alphaCertification: {
                coverageInputs: [coverageInput],
                cutoutMaterialCount: 1,
                cutoutMaterialIds: ['material.cutout'],
                exactCoverageInputCount: 1,
                forcedOpaqueMaterialVariantCount: 1,
                spatialParityArtifact,
                status: 'exact_inputs_and_binary_render_output_verified'
            },
            compilerDescriptor,
            compilerSignatureSha256,
            casterSidedness: {
                casterSidedness: request.casterSidedness,
                coverageModeMaterialVariantCounts: {
                    cutout: 1,
                    forced_opaque: 1,
                    opaque: 1
                },
                effectiveShadowSideMaterialVariantCounts: {
                    back: 0,
                    double: 3,
                    front: 0
                },
                schema: 'ai531-static-sun-production-caster-sidedness-receipt-v1'
            },
            identity: {
                alphaSemanticsSha256: identity.alphaSemanticsSha256,
                casterInventorySha256: identity.casterInventorySha256,
                cityId: 'bigcity2',
                compilerSignatureSha256
            },
            input: {
                alphaSemanticsSha256: identity.alphaSemanticsSha256,
                casterInventorySha256: identity.casterInventorySha256,
                channelSourceSha256: HASHES.d,
                finalFileDomainSha256: HASHES.e,
                geometrySha256: HASHES.f,
                packageRawSha256: HASHES.g,
                resolvedSourceSha256: HASHES.h,
                usedMaterialsSha256: HASHES.i
            },
            layout: {
                basis: createStableStaticSunDepthBasis(
                    request.sunPointDirectionWorld
                ),
                layout: { tileCount: [1, 2] },
                sunPointDirectionWorld: request.sunPointDirectionWorld
            },
            opaqueCertification: {
                algorithm: 'blender_bvhtree_direction_filtered_primary_ray_v3',
                cutoutFirstHitExcludedSampleCount: 48,
                depthEpsilonMeters: 0.005,
                depthMismatchCount: 0,
                directionalGeometryFilter: {
                    algorithm: 'world_space_direction_filtered_mesh_faces_v1',
                    filteredObjectCount: 64,
                    removedPolygonCount: 400,
                    sourcePolygonCount: 2500,
                    unchangedObjectCount: 5979,
                    visiblePolygonCount: 2100
                },
                eligibleSampleCount: 2000,
                maximumDepthErrorMeters: 0.001,
                occupancyMismatchCount: 0,
                opaqueAndForcedOpaquePolygonCount: 1900,
                sampleCount: 2048,
                samplePlan:
                    '32_by_32_stratified_grid_plus_lcg_seed_531_to_2048_unique_texels',
                status: 'verified'
            },
            outputs: [{ path: 'interiors/tile.rg8', sha256: HASHES.k }],
            reconstruction: {
                channelId: 'static_sun_depth',
                completeSelectedChannel: true,
                inventory: { casterMappingCount: 1968 },
                selectedMappingCount: 1968
            },
            request,
            schema: 'ai531-static-sun-production-render-receipt-v5'
        },
        receiptSha256: HASHES.b,
        sourceValidationReport: { valid: true }
    };
}

function makeAlphaCutoutSpatialParityArtifact({
    descriptor,
    identity,
    lightingProfileId,
    manifest
}) {
    const binding = manifest.textures.find((entry) => entry.id === 'binding.cutout');
    const bindingProjection = {
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
    const cutoutCasterIds = manifest.casterMappings
        .filter((entry) => entry.coverageMode === 'cutout')
        .map((entry) => entry.id)
        .sort();
    const sampleCount = 4096;
    const firstHitDepthSampleCount = 1024;
    const evidenceBytes = makeAlphaCutoutEvidenceBytes(
        lightingProfileId,
        cutoutCasterIds
    );
    const evidenceStream = (key, encoding, streamSampleCount) => ({
        byteLength: evidenceBytes[key].byteLength,
        encoding,
        path: `tests/artifacts/illumination_531/production/${lightingProfileId}/alpha/${alphaEvidenceFileName(key)}`,
        sampleCount: streamSampleCount,
        sha256: rawBytesSha256(evidenceBytes[key])
    });
    return {
        alphaSemanticsSha256: identity.alphaSemanticsSha256,
        bakeCaptureMethod: PRODUCTION_ALPHA_CUTOUT_BAKE_CAPTURE_METHOD,
        bakeOccupiedSampleCount: firstHitDepthSampleCount,
        casterInventorySha256: identity.casterInventorySha256,
        cutoutBindingProjectionSha256: rawCanonicalSha256({
            bindings: [bindingProjection],
            schema: 'ai531-production-alpha-cutout-binding-projection-v1'
        }),
        cutoutCasterCount: cutoutCasterIds.length,
        cutoutCasterIdsSha256: rawCanonicalSha256({
            casterIds: cutoutCasterIds,
            schema: 'ai531-production-alpha-cutout-caster-plan-v1'
        }),
        descriptorSha256: rawCanonicalSha256(descriptor),
        evidence: {
            bakeFirstHitDepth: evidenceStream(
                'bakeFirstHitDepth',
                'f32le-world-depth-common-occupied-v1',
                firstHitDepthSampleCount
            ),
            bakeOccupancy: evidenceStream(
                'bakeOccupancy',
                'u8-occupied-1-empty-0-v1',
                sampleCount
            ),
            comparison: evidenceStream(
                'comparison',
                'u8-alpha-parity-classification-v1',
                sampleCount
            ),
            liveFirstHitDepth: evidenceStream(
                'liveFirstHitDepth',
                'f32le-world-depth-common-occupied-v1',
                firstHitDepthSampleCount
            ),
            liveOccupancy: evidenceStream(
                'liveOccupancy',
                'u8-occupied-1-empty-0-v1',
                sampleCount
            ),
            samplePlan: evidenceStream(
                'samplePlan',
                'canonical-json-ai531-alpha-cutout-sample-plan-v1',
                sampleCount
            )
        },
        firstHitDepthMismatchCount: 0,
        firstHitDepthSampleCount,
        firstHitDepthToleranceMeters:
            PRODUCTION_ALPHA_CUTOUT_FIRST_HIT_DEPTH_TOLERANCE_METERS,
        lightingProfileId,
        liveCaptureMethod: PRODUCTION_ALPHA_CUTOUT_LIVE_CAPTURE_METHOD,
        liveDepthAttachmentIdentitySha256: HASHES.g,
        liveOccupiedSampleCount: firstHitDepthSampleCount,
        matchingOccupancySampleCount: sampleCount,
        maximumAbsoluteFirstHitDepthErrorMeters: 0,
        method: PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_METHOD,
        mismatchCounts: Object.fromEntries(
            PRODUCTION_ALPHA_CUTOUT_MISMATCH_KEYS.map((key) => [key, 0])
        ),
        missingOccluderCount: 0,
        sampleCount,
        samplePlanMethod: PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_METHOD,
        samplePlanSha256: rawBytesSha256(evidenceBytes.samplePlan),
        samplerParityMethod: PRODUCTION_ALPHA_CUTOUT_SAMPLER_PARITY_METHOD,
        schema: PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_SCHEMA,
        status: 'measured_spatial_parity_passed',
        unexpectedOccluderCount: 0,
        unsupportedBindingIds: ['binding.cutout']
    };
}

function makeAlphaCutoutEvidenceBytes(lightingProfileId, cutoutCasterIds) {
    const sampleCount = 4096;
    const occupiedSampleCount = 1024;
    const occupancy = new Uint8Array(sampleCount);
    occupancy.fill(1, 0, occupiedSampleCount);
    const comparison = new Uint8Array(sampleCount);
    comparison.fill(1, 0, occupiedSampleCount);
    const depth = new Uint8Array(occupiedSampleCount * 4);
    const view = new DataView(depth.buffer);
    for (let index = 0; index < occupiedSampleCount; index += 1) {
        view.setFloat32(index * 4, 1, true);
    }
    return {
        bakeFirstHitDepth: depth.slice(),
        bakeOccupancy: occupancy.slice(),
        comparison,
        liveFirstHitDepth: depth.slice(),
        liveOccupancy: occupancy.slice(),
        samplePlan: canonicalJsonBytes({
            lightingProfileId,
            method: PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_METHOD,
            samples: Array.from({length: sampleCount}, (_, index) => ({
                casterId: cutoutCasterIds[index % cutoutCasterIds.length],
                globalTexel: [index, 0],
                index
            })),
            schema: 'ai531-production-alpha-cutout-sample-plan-v1'
        })
    };
}

function alphaEvidenceFileName(key) {
    return `${key.replace(/[A-Z]/g, (value) => `_${value.toLowerCase()}`)}.bin`;
}

function makeStaticSunDepthDescriptor({compilerSignatureSha256, identity, request}) {
    const sunPointDirectionWorld = request.sunPointDirectionWorld;
    const interiorTexels = request.interiorPixels;
    const tileSizeMeters = request.tileSizeMeters;
    const storedTexels = interiorTexels.map((entry) => entry + 8);
    const layoutMaximum = [
        tileSizeMeters[0],
        tileSizeMeters[1] * 2
    ];
    return {
        identity: {
            alpha: {
                coverage: 'opacity-times-vertex-alpha-times-map-a-times-alpha-map-g-v1',
                forcedOpaque: 'shadow-as-opaque-v1',
                model: 'evaluated-runtime-coverage-v1',
                semanticsSha256: identity.alphaSemanticsSha256,
                sidedness: 'material-side-and-shadow-side-v1',
                threshold: 'discard-when-coverage-lt-alpha-test-v1'
            },
            basis: createStableStaticSunDepthBasis(sunPointDirectionWorld),
            casterInventorySha256: identity.casterInventorySha256,
            channelId: 'static_sun_depth',
            channelSourceSha256: HASHES.d,
            channelVersion: 1,
            cityId: 'bigcity2',
            compilerSignatureSha256,
            encoding: {
                emptyQuantized: 65535,
                greenChannel: 'quantized-low-byte-v1',
                id: 'rg8-packed-linear-depth-v1',
                maxDepthMeters: 10,
                maxQuantized: 65534,
                minDepthMeters: 0,
                quantization: 'linear-endpoints-inclusive-v1',
                redChannel: 'quantized-high-byte-v1'
            },
            layout: {
                boundsLightMeters: {max: layoutMaximum, min: [0, 0]},
                guardPolicy: 'copy-adjacent-clamp-exterior-v1',
                guardTexels: 4,
                interiorTexels,
                lookup: 'half-open-min-inclusive-max-exclusive-v1',
                order: 'row-major-y-then-x-v1',
                rowOrigin: 'min-light-y-v1',
                texelSizeMeters: request.texelSizeMeters,
                tileCount: [1, 2]
            },
            sampling: {
                bias: request.sampling.bias,
                comparison: 'receiver-depth-minus-bias-lte-caster-depth-v1',
                emptyPolicy: 'visible-v1',
                outOfBoundsPolicy: 'fail-closed-zero-visibility-v1',
                pcf: request.sampling.pcf
            },
            sunPointDirectionWorld
        },
        schema: 'static-sun-depth-tile-set-v1',
        tiles: [{
            contentSha256: HASHES.d,
            coordinates: [0, 0],
            id: 'tile.0.0',
            interiorBoundsLightMeters: {max: tileSizeMeters, min: [0, 0]},
            storedTexels
        }, {
            contentSha256: HASHES.e,
            coordinates: [0, 1],
            id: 'tile.0.1',
            interiorBoundsLightMeters: {
                max: layoutMaximum,
                min: [0, tileSizeMeters[1]]
            },
            storedTexels
        }]
    };
}

function swapSamplingAxes(sampling) {
    const right = sampling.pcf.sourceMapRightAxisWorld;
    sampling.pcf.sourceMapRightAxisWorld = sampling.pcf.sourceMapUpAxisWorld;
    sampling.pcf.sourceMapUpAxisWorld = right;
}

function makeManifest() {
    const casterMappings = [];
    for (let index = 0; index < 1968; index += 1) {
        const category = index < 1683
            ? 'buildings'
            : index < 1720 ? 'traffic_controls' : 'trees_foliage';
        const coverageMode = index < 1780
            ? 'opaque'
            : index < 1844 ? 'forced_opaque' : 'cutout';
        const suffix = coverageMode === 'forced_opaque' ? 'forced' : coverageMode;
        casterMappings.push({
            alphaInputId: `alpha.${suffix}`,
            category,
            channelRelevance: { static_sun_depth: true },
            coverageMode,
            effectiveShadowSide: 2,
            id: `caster/${String(index).padStart(4, '0')}`,
            materialId: `material.${suffix}`,
            preserveShadowSide: false,
            shadowSide: 2,
            side: 2
        });
    }
    const opaqueAlpha = {
        alphaTest: 0,
        inputs: [],
        mode: 'opaque',
        opacity: 1
    };
    const cutoutAlpha = {
        alphaTest: 0.5,
        inputs: [{
            bindingId: 'binding.cutout',
            channel: 'a',
            operation: 'multiply'
        }],
        mode: 'cutout',
        opacity: 1
    };
    const materials = [
        ['opaque', opaqueAlpha],
        ['forced', opaqueAlpha],
        ['cutout', cutoutAlpha]
    ].map(([suffix, alpha]) => ({
        alpha,
        alphaInputId: `alpha.${suffix}`,
        id: `material.${suffix}`,
        isFoliage: false,
        preserveShadowSide: false,
        shadowSide: 2,
        side: 2,
        vertexColors: false
    }));
    const alphaInputs = materials.map((material) => ({
        alpha: material.alpha,
        id: material.alphaInputId,
        materialId: material.id,
        shadowSide: material.shadowSide,
        side: material.side,
        vertexColors: material.vertexColors
    }));
    return {
        alphaInputs,
        casterMappings,
        channelProfiles: [{
            casterSidedness: {
                model: 'three-r183-effective-shadow-side-v1',
                preserveMaterialFlagSemantics: 'material-userdata-preserveShadowSide-or-isFoliage-v1',
                twoSidedCasting: true
            },
            id: 'static_sun_depth'
        }],
        hashes: {
            channels: [{ id: 'static_sun_depth', sha256: HASHES.n }],
            channelSources: [{ id: 'static_sun_depth', sha256: HASHES.d }],
            geometry: HASHES.f,
            resolvedSource: HASHES.h,
            usedMaterials: HASHES.i
        },
        materials,
        source: { cityId: 'bigcity2' },
        textures: [{
            anisotropy: 8,
            center: [0, 0],
            channel: 0,
            colorSpace: 'srgb',
            flipY: true,
            generateMipmaps: true,
            id: 'binding.cutout',
            kind: 'binding',
            magFilter: 1006,
            mapping: 300,
            matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
            matrixAutoUpdate: true,
            minFilter: 1008,
            offset: [0, 0],
            premultiplyAlpha: false,
            repeat: [1, 1],
            rotation: 0,
            sourceId: 'texture.cutout',
            unpackAlignment: 4,
            wrapS: 1001,
            wrapT: 1001
        }, {
            contentSha256: HASHES.l,
            coverageChannels: {
                a: {
                    byteLength: 4096,
                    pixelCount: 4096,
                    sha256: HASHES.m
                }
            },
            id: 'texture.cutout',
            kind: 'source'
        }]
    };
}

function makeExactReleaseInputs() {
    const profiles = AI531_PRODUCTION_RELEASE_PROFILE_IDS.map((lightingProfileId) => {
        const record = structuredClone(BASE_CERTIFICATION);
        record.lightingProfileId = lightingProfileId;
        record.packagePath = packagePathFor(lightingProfileId);
        return record;
    });
    const index = makeReleaseIndex(profiles);
    return { index, profiles };
}

function makeReleaseIndex(profiles) {
    return {
        profiles: Object.fromEntries(profiles.map((record) => [
            record.lightingProfileId,
            {
                liveIdentity: {
                    alphaSemanticsSha256: record.source.alphaSemanticsSha256,
                    casterInventorySha256: record.source.casterInventorySha256,
                    cityId: 'bigcity2',
                    developmentCacheAllowed: true,
                    lightingProfileId: record.lightingProfileId,
                    resolvedSourceSha256: record.source.resolvedSourceSha256,
                    staticSunDepthSourceSha256: record.source.channelSourceSha256
                },
                packagePath: record.packagePath
            }
        ])),
        schema: 'bus-sim-static-sun-depth-production-package-index-v1'
    };
}

function makeVerifiedPackageEvidence(evidence, useWindows = false) {
    const sourceDescriptor = {
        ...evidence.receipt.input,
        cityId: evidence.receipt.identity.cityId,
        schema: 'bus-sim-static-sun-depth-production-source-v1'
    };
    const stored = evidence.descriptor.tiles[0].storedTexels;
    const layerByteLength = stored[0] * stored[1] * 2;
    const requiredRuntimeCapabilities = [
        'fragment_highp_float',
        'rg8_unorm',
        'texture_2d_array',
        'webgl2'
    ];
    const makeChunk = (data, id, depth, offset, coordinateTransform) => {
        const sha256 = rawBytesSha256(data);
        return {
            data,
            descriptor: {
                byteLength: data.byteLength,
                channelId: 'static_sun_depth',
                compression: 'none',
                coordinateTransform,
                decodedByteLength: data.byteLength,
                decodedSha256: sha256,
                dimensions: {
                    components: 2,
                    depth,
                    height: stored[1],
                    width: stored[0]
                },
                encoding: 'rg8_unorm',
                id,
                mipLevel: 0,
                offset,
                precision: 'unorm8',
                requiredRuntimeCapabilities,
                resourceType: 'texture_2d_array',
                rowOrigin: 'lower_left',
                sha256
            }
        };
    };
    let chunks;
    if (useWindows) {
        const assembledSha256 = rawBytesSha256(evidence.payloadBytes);
        chunks = evidence.descriptor.tiles.map((_tile, index) => {
            const data = evidence.payloadBytes.slice(
                index * layerByteLength,
                (index + 1) * layerByteLength
            );
            return makeChunk(
                data,
                `static_sun_depth.tiles.rg8.window.${String(index).padStart(5, '0')}`,
                1,
                index * layerByteLength,
                createStaticSunDepthLayerWindowEnvelope({
                    assembledByteLength: evidence.payloadBytes.byteLength,
                    assembledSha256,
                    firstLayer: index,
                    layerCount: 1,
                    outputDescriptor: evidence.descriptor
                })
            );
        });
    } else {
        chunks = [makeChunk(
            evidence.payloadBytes,
            'static_sun_depth.tiles.rg8',
            evidence.descriptor.tiles.length,
            0,
            evidence.descriptor
        )];
    }
    return {
        chunks,
        compatibility: { compatible: true },
        manifest: {
            compiler: {
                descriptor: evidence.receipt.compilerDescriptor,
                signatureSha256: evidence.receipt.compilerSignatureSha256
            },
            source: {
                descriptor: sourceDescriptor,
                descriptorSha256: rawCanonicalSha256(sourceDescriptor),
                resolvedSourceSha256: sourceDescriptor.resolvedSourceSha256
            }
        }
    };
}

async function installAuthenticatedCaptureFiles(report, files, currentRoot) {
    const production = Object.hasOwn(
        report.cases[0]?.captures ?? {},
        'staticCityReceiverMask'
    );
    const slots = production
        ? [
            'cache',
            'comparison',
            'current',
            'dynamicReceiverMask',
            'staticCityReceiverMask'
        ]
        : ['cache', 'comparison', 'current'];
    const staticMaskBytes = production
        ? makeMaskPng(1280, 720, (pixel) => pixel < 821599)
        : null;
    const dynamicMaskBytes = production
        ? makeMaskPng(1280, 720, (pixel) => pixel === 821599)
        : null;
    for (const [caseIndex, validationCase] of report.cases.entries()) {
        for (const [slotIndex, slot] of slots.entries()) {
            const record = validationCase.captures[slot];
            const bytes = slot === 'staticCityReceiverMask'
                ? staticMaskBytes
                : slot === 'dynamicReceiverMask'
                    ? dynamicMaskBytes
                    : makePng(1280, 720, [
                        caseIndex & 255,
                        (caseIndex >>> 8) & 255,
                        slotIndex
                    ]);
            const absolutePath = path.resolve(
                currentRoot,
                ...record.path.split('/')
            );
            files.set(absolutePath, bytes);
            validationCase.captures[slot] = {
                byteLength: bytes.byteLength,
                path: record.path,
                sha256: rawBytesSha256(bytes)
            };
        }
    }
    const authenticate = production
        ? authenticateProductionValidationCaptureSet
        : authenticateValidationCaptureSet;
    report.captureAuthentication = await authenticate({
        authorityRoot: path.join(
            currentRoot,
            'tests/artifacts/screens/illumination_531'
        ),
        cases: report.cases,
        expectedCaseIds: report.cases.map((entry) => entry.caseId),
        expectedCaptureCount: report.cases.length * slots.length,
        expectedDimensionsPixels: [1280, 720],
        lstatFn: async () => ({isSymbolicLink: () => false}),
        readFileFn: async (filePath) => files.get(path.resolve(filePath)),
        repoRoot: currentRoot
    });
}

function makeLabValidationReport() {
    const timingContamination = {
        contaminated: true,
        reason: 'concurrent processes and shared GPU contention',
        usableForPromotion: false
    };
    const cases = ILLUMINATION_VALIDATION_CASES
        .filter((entry) => entry.kind === 'lab')
        .map((entry) => ({
            camera: structuredClone(entry.camera),
            captures: {
                cache: makeCaptureRecord(entry.id, 'cache'),
                comparison: makeCaptureRecord(entry.id, 'comparison'),
                current: makeCaptureRecord(entry.id, 'current')
            },
            caseId: entry.id,
            coverageTags: structuredClone(entry.coverageTags),
            densityPhaseOracle: makeLabDensityPhaseOracle(),
            diagnostics: makeLabDiagnostics(),
            dynamicBus: {
                cache: {castShadow: true, outsideStaticCity: true},
                comparison: {castShadow: true, outsideStaticCity: true}
            },
            dynamicBusLiveShadowProof:
                entry.id === 'illum.lab.bus_grounding_default'
                    ? makeLabDynamicBusProof()
                    : null,
            fixture: makeLabFixture(entry.id),
            lightingProfileId: entry.sunProfile.id,
            metrics: makeLabMetrics(),
            passed: true,
            sunProfile: structuredClone(entry.sunProfile),
            workload: makeLabWorkload(timingContamination)
        }));
    return {
        browserDiagnosticGate: {diagnosticCount: 0, passed: true},
        browserDiagnostics: [],
        captureAuthentication: {
            captureCount: 24,
            captureSetSha256: HASHES.m,
            dimensionsPixels: [1280, 720],
            method: CAPTURE_AUTHENTICATION_METHOD
        },
        caseCount: 8,
        cases,
        comparisonCondition:
            'current_difference_with_baked_resource_active_and_current_static_maps_retained_v1',
        environment: {
            browserVersion: 'fixture-browser',
            gpu: 'fixture-gpu',
            labUrl: 'http://127.0.0.1/debug_tools/lab_scene.html?coreTests=0',
            liveDirectionalShadowFilter: {
                effectiveMapSizeTexels: [16384, 16384],
                model: 'three-r183-vogel-5-linear-compare-v1',
                radiusTexels: 1.5,
                rendererMaxTextureSize: 16384,
                requestedPresetMapSizeTexels: [16384, 16384],
                sizePolicy: 'derive-exact-live-single-high-v1',
                worldExtentMeters: [680, 680],
                worldRadiusMeters: 0.062255859375
            },
            rendererMaxTextureSize: 16384,
            rendererPixelRatio: 1,
            rendererSize: [1280, 720],
            webglVersion: 'WebGL 2 fixture'
        },
        expectedCaseCount: 8,
        failures: [],
        fallbackProofs: [
            'ai527.sun.az045.el35',
            'ai527.sun.az135.el08',
            'ai527.sun.az225.el12'
        ].map((lightingProfileId) => ({
            activeCacheAfterFailure: false,
            corruptPackageRejected: true,
            diagnostics: {
                active: null,
                runtime: {controller: {effectiveMode: 'current'}}
            },
            dynamicBusCastShadow: true,
            dynamicBusOutsideStaticCity: true,
            expectedRestoredCasterCount: 6,
            lightingProfileId,
            passed: true,
            requestThrew: true,
            restoredCasterCount: 6
        })),
        fixtureAuthority: {
            schema: 'bus-sim-static-sun-depth-webgl2-lab-fixture-v1',
            artifactClass: 'test_fixture',
            productionEligible: false,
            provenance: 'webgl2_live_static_city_depth_test_fixture_v1',
            blenderCyclesProvenanceClaimed: false
        },
        generatedAt: '2026-08-31T12:00:00.000Z',
        readiness: {
            activeCameraPresetId: 'overview',
            cityId: 'lab_scene',
            dynamicBusCastShadow: true,
            dynamicBusOutsideStaticCity: true,
            fixtureId: 'illumination_overhang_receiver_v1',
            ready: true,
            receiverRoles: ['road', 'roof_and_underside', 'vertical_wall'],
            treeChildCount: 4,
            treePlacementCount: 4,
            treesReady: true
        },
        receiverScope: {
            compared: 'static_world_receivers_v1',
            excluded: 'exact_visible_dynamic_bus_receiver_pixels_only_v1',
            busCasterPolicy: 'live_shadow_submission_retained_and_static_ground_proven_v1'
        },
        sameSessionPairing:
            'current_and_cache_rgba_indexeddb_then_current_difference_same_lab_page_case_v3',
        schema: 'bus-sim-static-sun-depth-lab-validation-report-v4',
        status: 'passed',
        thresholds: {
            falseLitToleranceByte: 4,
            maxContinuousSeamRunPixels: 1,
            maxRgbErrorByte: 64,
            meanRgbErrorByte: 0.35,
            missingOccluderPixelCount: 0,
            pixelsOverFourBytePercent: 0.2,
            seamErrorToleranceByte: 2,
            seamFalseLitPixelCount: 0
        },
        tileBoundaryEvidence: {
            method: 'aggregate_static_sun_depth_seam_debug_pixels_v1',
            aggregateSeamPixelCount: 8,
            aggregateSeamErrorPixelCount: 0,
            casesWithVisibleTileBoundary: 8,
            passed: true
        },
        timingContamination
    };
}

function makeLabMetrics() {
    return {
        dynamicReceiverMaskMethod: 'dynamic_bus_black_white_material_id_difference_v1',
        dynamicReceiverPixelCount: 0,
        evaluatedPixelCount: 921600,
        falseLitMethod: 'cache_luma_gt_current_unmasked_3x3_max_plus_4_bytes_v2',
        height: 720,
        maxContinuousSeamRunPixels: 0,
        maxRgbErrorByte: 0,
        meanRgbErrorByte: 0,
        missingOccluderPixelCount: 0,
        pixelCount: 921600,
        pixelsOverFourByte: 0,
        pixelsOverFourBytePercent: 0,
        seamErrorPixelCount: 0,
        seamFalseLitPixelCount: 0,
        seamMaskMethod: 'static_sun_depth_seam_debug_red_gt_blue_plus_32_v1',
        seamPixelCount: 1,
        width: 1280
    };
}

function makeLabDiagnostics() {
    const controller = {effectiveMode: 'baked', state: 'active'};
    return {
        cache: {
            active: {lightingProfileId: 'fixture'},
            casters: {
                active: true,
                originalCasterCount: 6,
                restores: 2,
                snapshotMeshCount: 8,
                staticMeshCount: 8,
                suppressedCasterCount: 6
            },
            debugMode: 'final',
            runtime: {controller}
        },
        comparison: {
            active: {lightingProfileId: 'fixture'},
            casters: {
                active: false,
                lastReason: 'comparison_current_shadow_retained',
                originalCasterCount: 6,
                restores: 3,
                snapshotMeshCount: 0
            },
            debugMode: 'currentDifference',
            runtime: {controller}
        },
        current: {
            active: null,
            runtime: {controller: {effectiveMode: 'current', state: 'idle'}}
        }
    };
}

function makeLabWorkload(timingContamination) {
    const dynamicBusShadow = {calls: 1, lines: 0, points: 0, triangles: 48};
    return {
        cache: {
            dynamicBusShadow: structuredClone(dynamicBusShadow),
            staticCityShadow: {calls: 0, lines: 0, points: 0, triangles: 0}
        },
        comparison: {
            dynamicBusShadow: structuredClone(dynamicBusShadow),
            staticCityShadow: {calls: 2, lines: 0, points: 0, triangles: 120}
        },
        current: {
            dynamicBusShadow: structuredClone(dynamicBusShadow),
            staticCityShadow: {calls: 2, lines: 0, points: 0, triangles: 120}
        },
        timingContamination: structuredClone(timingContamination)
    };
}

function makeLabDynamicBusProof() {
    return {
        darkerStaticPixelCount: 1,
        maximumLumaDeltaByte: 16,
        method:
            'bus_cast_shadow_on_minus_off_exact_temporary_static_horizontal_city_receiver_v1',
        passed: true,
        receiverMaskMethod: 'dynamic_bus_black_white_material_id_difference_v1',
        staticGroundSample: {
            lumaDeltaByte: 16,
            objectName: 'RoadSurface',
            pixel: [1, 1],
            world: [0, 0, 0],
            worldNormal: [0, 1, 0]
        },
        toleranceByte: 4
    };
}

function makeLabDensityPhaseOracle() {
    return {
        maximumProjectionMatrixError: 0,
        maximumWorldMatrixError: 0,
        method: 'prepared-shadow-camera-equals-first-current-render-v1',
        passed: true
    };
}

function makeLabFixture(validationCaseId) {
    const texelSizeMeters = LAB_DENSITY_PRODUCTION_PROJECTION.texelSizeMeters;
    const requiredTexels = [9900, 4950];
    const cropTileCount = [4, 2];
    const interiorSize = 2475;
    const storedSize = interiorSize + 2;
    const tileCount = cropTileCount[0] * cropTileCount[1];
    const layerByteLength = storedSize * storedSize * 2;
    const payloadBytes = layerByteLength * tileCount;
    const cropChunkWindows = partitionStaticSunDepthLayers(
        layerByteLength,
        tileCount
    );
    const packageChunkIds = cropChunkWindows.map(
        (_, index) => staticSunDepthLayerWindowChunkId(index)
    );
    const cropBoundsLightMeters = {
        min: [0, 0],
        max: requiredTexels.map((value) => value * texelSizeMeters)
    };
    const staticReceiverDomainLightMeters = {
        min: [0, 0, -1],
        max: [
            cropBoundsLightMeters.max[0],
            cropBoundsLightMeters.max[1],
            1
        ]
    };
    const phaseAnchor = [texelSizeMeters * 0.5, texelSizeMeters * 0.5];
    const productionLayerByteLength =
        LAB_DENSITY_PRODUCTION_PROJECTION.storedTexelsPerLayer[0]
        * LAB_DENSITY_PRODUCTION_PROJECTION.storedTexelsPerLayer[1] * 2;
    const productionChunkWindows = partitionStaticSunDepthLayers(
        productionLayerByteLength,
        LAB_DENSITY_PRODUCTION_PROJECTION.layerCount
    );
    const densityDiagnostic = {
        candidatePromotion: {
            strictParityStatus: 'passed',
            promotionClass: 'production-selected-strict-parity-passed-v1',
            promotionBudgetEligible: true
        },
        cropBoundsLightMeters: structuredClone(cropBoundsLightMeters),
        cropChunkCount: cropChunkWindows.length,
        cropChunkWindows: structuredClone(cropChunkWindows),
        cropCombinedTexels: [...requiredTexels],
        cropLayerByteLength: layerByteLength,
        cropPayloadBytes: payloadBytes,
        cropStoredTexelsPerLayer: [storedSize, storedSize],
        cropTileCount,
        cropTileGridPolicy:
            'first-single-chunk-else-minimum-payload-canonical-layer-windows-2x2-through-4x4-v2',
        exactRationalLatticePhaseEvidence: {
            axes: [0, 1].map((axis) => ({
                axis,
                cachePeriodToSourcePeriodError: 0,
                coveringCacheCellBoundsMeters: {
                    min: staticReceiverDomainLightMeters.min[axis],
                    max: staticReceiverDomainLightMeters.max[axis]
                },
                maximumScaledSourceStepIndexError: 0,
                receiverDomainMeters: {
                    min: staticReceiverDomainLightMeters.min[axis],
                    max: staticReceiverDomainLightMeters.max[axis]
                },
                sourceAxisSign: axis === 0 ? -1 : 1
            })),
            cacheTexelSizeMeters: texelSizeMeters,
            maximumNumericPhaseError: 0,
            maximumRatioError: 0,
            maximumSourceAxisSignError: 0,
            method: 'full-static-receiver-domain-live-lattice-rational-proof-v2',
            passed: true,
            phaseClasses: [
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
            ],
            ratio: {sourceTexels: 1, cacheTexels: 1},
            repeatingCacheTexelPeriod: 1,
            repeatingSourceTexelPeriod: 1,
            signedSourceTexelStepsPerCacheTexel: [-1, 1],
            sourceAxisSigns: [-1, 1],
            sourceTexelPitchMeters: [texelSizeMeters, texelSizeMeters]
        },
        exactThreeToTwoLatticePhaseEvidence: null,
        filterRadiusIdentity: {
            cacheTexelSizeMeters: texelSizeMeters,
            derivation:
                'oracle-radius-times-live-source-pitch-divided-by-cache-pitch-v1',
            derivedCacheRadiusTexels: 1.5,
            model: 'three-r183-live-vogel-radius-to-cache-physical-support-v1',
            oracleRadiusSpace: 'live-directional-shadow-map-source-texels-v1',
            oracleRadiusTexels: 1.5,
            sourceMapSizeTexels: [16384, 16384],
            sourceTexelPitchMeters: [texelSizeMeters, texelSizeMeters],
            sourceVogelRadiusMeters: 0.062255859375,
            sourceWorldExtentMeters: [680, 680]
        },
        finalProductionProjection: {
            ...structuredClone(LAB_DENSITY_PRODUCTION_PROJECTION),
            canonical64MiBLayerWindowCount: productionChunkWindows.length,
            chunkWindows: structuredClone(productionChunkWindows),
            exceedsSingleChunk:
                LAB_DENSITY_PRODUCTION_PROJECTION.payloadBytes
                    > ILLUMINATION_MAX_CHUNK_BYTES,
            layerByteLength: productionLayerByteLength,
            payloadBytes: LAB_DENSITY_PRODUCTION_PROJECTION.payloadBytes,
            within256MiB:
                LAB_DENSITY_PRODUCTION_PROJECTION.payloadBytes
                    <= 256 * 1024 * 1024,
            within512MiB: true
        },
        guard: {
            diagnosticGuardTexels: 1,
            diagnosticRationale:
                'exact-global-cross-layer-filter-fetch-does-not-consume-guard-v1',
            productionGuardTexels:
                LAB_DENSITY_PRODUCTION_PROJECTION.guardTexels
        },
        limits: {
            maximumChunkBytes: ILLUMINATION_MAX_CHUNK_BYTES,
            maximumPackageBytes: ILLUMINATION_MAX_PACKAGE_BYTES,
            rendererMaxTextureSize: 16384
        },
        phaseAnchorDerivation:
            'even-map-adjacent-positive-source-axis-texel-center-projected-to-cache-light-v1',
        requestedCandidateId:
            LAB_DENSITY_PRODUCTION_PROJECTION.selectedCandidateId,
        requestedTexelSizeMeters: texelSizeMeters,
        requiredBoundsLightMeters: structuredClone(cropBoundsLightMeters),
        schema: 'ai531-phase-locked-density-diagnostic-v1',
        sourceCameraCenterLightMeters: [texelSizeMeters, 0],
        sourceShadowCameraMatrixWorld: [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ],
        sourceShadowCameraProjectionMatrix: [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ],
        sourceTexelCenterOffsetLightMeters: [
            -texelSizeMeters * 0.5,
            texelSizeMeters * 0.5
        ],
        sourceTexelPitchMeters: [texelSizeMeters, texelSizeMeters],
        sourceToCacheLightAxisTransform: [[-1, 0], [0, 1]],
        texelCenterPhaseAnchorLightMeters: phaseAnchor,
        validationCaseId
    };
    return {
        artifactClass: 'test_fixture',
        biasModel: 'geometric-normal-offset-plus-constant-depth-relief-v1',
        blenderCyclesProvenanceClaimed: false,
        casterCount: 6,
        constantDepthReliefMeters: 0.0697915,
        densityDiagnostic,
        geometricNormalOffsetMeters: 0.0232,
        intendedCasterSnapshotCount: 6,
        layoutBoundsLightMeters: structuredClone(cropBoundsLightMeters),
        packageChunkCount: packageChunkIds.length,
        packageChunkIds,
        payloadBytes,
        pcf: {
            hardwareComparison: 'linear-four-compare-taps-v1',
            model: 'three-r183-vogel-5-linear-compare-v1',
            radiusTexels: 1.5,
            sampleCount: 5,
            screenRotation: 'interleaved-gradient-noise-gl-fragcoord-v1',
            shadowMapSizeTexels: [16384, 16384],
            shadowMapWorldExtentMeters: [680, 680],
            sourceMapRightAxisWorld: [1, 0, 0],
            sourceMapUpAxisWorld: [0, 1, 0]
        },
        productionEligible: false,
        provenance: 'webgl2_live_static_city_depth_test_fixture_v1',
        schema: 'bus-sim-static-sun-depth-webgl2-lab-fixture-v1',
        staticReceiverDomainLightMeters,
        staticReceiverMaterialSlotCount: 2,
        staticReceiverMeshCount: 2,
        storedTexels: [storedSize, storedSize],
        texelSizeMeters,
        tileCount
    };
}

function makeValidationReport(index, profiles = null) {
    const canonicalCases = ILLUMINATION_VALIDATION_CASES
        .filter((entry) => entry.kind !== 'lab')
        .sort((left, right) => (
            left.sunProfile.id.localeCompare(right.sunProfile.id)
            || left.id.localeCompare(right.id)
        ));
    const cases = canonicalCases.map((entry) => ({
        camera: structuredClone(entry.camera),
        captures: {
            cache: makeCaptureRecord(entry.id, 'cache'),
            comparison: makeCaptureRecord(entry.id, 'comparison'),
            current: makeCaptureRecord(entry.id, 'current'),
            dynamicReceiverMask: makeCaptureRecord(entry.id, 'dynamicReceiverMask'),
            staticCityReceiverMask: makeCaptureRecord(entry.id, 'staticCityReceiverMask')
        },
        caseId: entry.id,
        coverageTags: structuredClone(entry.coverageTags),
        diagnostics: makeCaseDiagnostics(entry.sunProfile.id, HASHES.j),
        dynamicBus: makeDynamicBusEvidence(),
        kind: entry.kind,
        lightingProfileId: entry.sunProfile.id,
        metrics: makeValidationMetrics(),
        passed: true,
        sunProfile: structuredClone(entry.sunProfile),
        workload: makeCaseWorkload()
    }));
    const counts = Object.fromEntries(AI531_PRODUCTION_RELEASE_PROFILE_IDS.map(
        (lightingProfileId) => [
            lightingProfileId,
            cases.filter((entry) => entry.lightingProfileId === lightingProfileId).length
        ]
    ));
    const boundProfiles = profiles ?? AI531_PRODUCTION_RELEASE_PROFILE_IDS.map(
        (lightingProfileId) => ({
            ...structuredClone(BASE_CERTIFICATION),
            lightingProfileId,
            packagePath: index.profiles[lightingProfileId].packagePath
        })
    );
    const certificationById = new Map(boundProfiles.map(
        (entry) => [entry.lightingProfileId, entry]
    ));
    return {
        browserDiagnosticGate: { diagnosticCount: 0, passed: true },
        browserDiagnostics: [],
        captureAuthentication: {
            captureCount: 985,
            captureSetSha256: HASHES.m,
            dimensionsPixels: [1280, 720],
            method: PRODUCTION_CAPTURE_AUTHENTICATION_METHOD,
            minimumStaticReceiverCoverageRatio: 1 / 16,
            minimumStaticReceiverPixelCount: 821599
        },
        caseCount: 197,
        cases,
        comparisonCondition:
            'current_difference_with_baked_resource_active_and_current_static_maps_retained_v1',
        excludedLabCaseCount: 8,
        expectedCaseCount: 197,
        failures: [],
        dynamicBusEvidence: {
            affectedStaticCityReceiverPixelCount: 197,
            brightenedStaticCityReceiverPixelCount: 0,
            cacheShadowDrawCalls: 197,
            cacheShadowTriangles: 9456,
            casesWithStaticCityShadowImpact: 197,
            casesWithStaticCityBrightening: 0,
            casesWithVisibleDynamicReceiver: 197,
            dynamicBusShadowProofMethod:
                'bus_cast_shadow_enabled_luma_darker_than_disabled_over_visible_city_receivers_v2',
            method: 'aggregate_registered_dynamic_receiver_mask_and_signed_bus_shadow_v2',
            passed: true,
            staticReceiverMaskMethod:
                'visible_static_city_receivers_excluding_registered_dynamic_receivers_depth_equality_v2',
            totalMaskedDynamicReceiverPixelCount: 197
        },
        packageIndex: 'tests/artifacts/illumination_531/package_index.json',
        profileGroups: AI531_PRODUCTION_RELEASE_PROFILE_IDS.map(
            (lightingProfileId) => ({
                caseCount: counts[lightingProfileId],
                lightingProfileId,
                packagePath: index.profiles[lightingProfileId].packagePath,
                sourceShadowFilterIdentity:
                    makeSourceShadowFilterIdentity(lightingProfileId)
            })
        ),
        sameSessionPairing:
            'current_and_cache_rgba_indexeddb_then_current_difference_same_page_profile_group_v2',
        sourceShadowTexelPhaseEvidence: AI531_PRODUCTION_RELEASE_PROFILE_IDS.map(
            (lightingProfileId) => {
                const certification = certificationById.get(lightingProfileId);
                assert.ok(certification);
                return {
                    descriptorSha256: certification.descriptorSha256,
                    evidence: makeLiveTexelPhaseEvidence(lightingProfileId),
                    lightingProfileId,
                    packageAggregateSha256: certification.packageAggregateSha256,
                    packagePath: certification.packagePath
                };
            }
        ),
        schema: 'bus-sim-static-sun-depth-production-validation-report-v4',
        status: 'passed',
        thresholds: {
            falseLitToleranceByte: 4,
            maxContinuousSeamRunPixels: 1,
            maxRgbErrorByte: 64,
            meanRgbErrorByte: 0.35,
            missingOccluderPixelCount: 0,
            pixelsOverFourBytePercent: 0.2,
            seamErrorToleranceByte: 2,
            seamFalseLitPixelCount: 0
        },
        tileBoundaryEvidence: {
            aggregateSeamErrorPixelCount: 0,
            aggregateSeamPixelCount: 197,
            casesWithVisibleTileBoundary: 197,
            method: 'aggregate_static_sun_depth_seam_debug_pixels_v1',
            passed: true
        },
        timingContamination: {
            contaminated: true,
            reason: 'concurrent processes and shared GPU contention',
            usableForPromotion: false
        }
    };
}

function makeCaptureRecord(caseId, slot) {
    return {
        byteLength: 33,
        path: 'tests/artifacts/screens/illumination_531/'
            + caseId + '/' + slot + '.png',
        sha256: HASHES.a
    };
}

function makeLabValidationEvidence() {
    return {
        browserDiagnosticGate: {diagnosticCount: 0, passed: true},
        canonicalSha256: HASHES.a,
        captureAuthentication: {
            captureCount: 24,
            captureSetSha256: HASHES.b,
            dimensionsPixels: [1280, 720],
            method: CAPTURE_AUTHENTICATION_METHOD
        },
        caseCount: 8,
        comparisonCondition:
            'current_difference_with_baked_resource_active_and_current_static_maps_retained_v1',
        profileIds: [
            'ai527.sun.az045.el35',
            'ai527.sun.az135.el08',
            'ai527.sun.az225.el12'
        ],
        rawSha256: HASHES.n,
        schema: 'bus-sim-static-sun-depth-lab-validation-evidence-v1',
        status: 'passed',
        tileBoundaryEvidence: {
            aggregateSeamErrorPixelCount: 0,
            aggregateSeamPixelCount: 8,
            casesWithVisibleTileBoundary: 8,
            method: 'aggregate_static_sun_depth_seam_debug_pixels_v1',
            passed: true
        },
        timingContamination: {
            contaminated: true,
            reason: 'concurrent processes and shared GPU contention',
            usableForPromotion: false
        },
        zeroMissingOccluderPixelCount: true
    };
}

function makeSourceShadowFilterIdentity(lightingProfileId) {
    const request = createProductionStaticSunRequest(
        selectProductionStaticSunProfiles([lightingProfileId])[0]
    );
    return {
        bias: request.sampling.bias,
        pcf: request.sampling.pcf,
        sourceShadowCapability: {
            ...request.sourceShadowCapability,
            maximumTextureSizeTexels: 16384
        },
        worldFilterRadiusMeters: 0.062255859375
    };
}

function makeLiveTexelPhaseEvidence(lightingProfileId) {
    const fixture = makeProfileFixture(lightingProfileId);
    const pcf = fixture.descriptor.identity.sampling.pcf;
    const evidence = structuredClone(createProductionLiveTexelPhaseEvidence({
        descriptor: fixture.descriptor,
        sourceCameraBoundsMeters: {
            bottom: -340,
            left: -340,
            right: 340,
            top: 340
        },
        sourceCameraCenterWorld: [0, 0, 0],
        sourceMapRightAxisWorld: pcf.sourceMapRightAxisWorld,
        sourceMapUpAxisWorld: pcf.sourceMapUpAxisWorld
    }));
    if (lightingProfileId === 'ai527.sun.az045.el35') {
        const residualTexels = 5e-10;
        const edgeOffsetMeters = evidence.cacheTexelPitchMeters * residualTexels;
        evidence.cacheBoundsLightMeters.max[0] += edgeOffsetMeters;
        evidence.cacheAbsoluteGridEdgesMeters.max[0] += edgeOffsetMeters;
        evidence.cacheAbsoluteGridEdgeTexelIndices.max[0] =
            evidence.cacheAbsoluteGridEdgesMeters.max[0]
                / evidence.cacheTexelPitchMeters;
        evidence.maximumEdgePhaseErrorTexels = Math.max(
            ...[
                ...evidence.cacheAbsoluteGridEdgeTexelIndices.min,
                ...evidence.cacheAbsoluteGridEdgeTexelIndices.max
            ].map((entry) => Math.abs(entry - Math.round(entry)))
        );
    }
    return evidence;
}

function makeValidationMetrics(overrides = {}) {
    const maxRgbErrorByte = overrides.maxRgbErrorByte ?? 0;
    const meanRgbErrorByte = overrides.meanRgbErrorByte ?? 0;
    const pixelsOverFourByte = overrides.pixelsOverFourByte ?? 0;
    const eligibleStaticReceiverPixelCount =
        overrides.eligibleStaticReceiverPixelCount ?? 821599;
    const rawSamePixelMaxRgbErrorByte =
        overrides.rawSamePixelMaxRgbErrorByte ?? maxRgbErrorByte;
    const rawSamePixelMeanRgbErrorByte =
        overrides.rawSamePixelMeanRgbErrorByte ?? meanRgbErrorByte;
    const rawSamePixelPixelsOverFourByte =
        overrides.rawSamePixelPixelsOverFourByte ?? pixelsOverFourByte;
    return {
        dynamicReceiverMaskedPixelCount: 1,
        eligibleStaticReceiverPixelCount,
        falseLitMethod:
            'cache_luma_gt_eligible_current_3x3_max_plus_4_and_same_frame_cache_visibility_gt_live_v3',
        height: 720,
        maxContinuousSeamRunPixels: 0,
        maxRgbErrorByte,
        meanRgbErrorByte,
        missingOccluderPixelCount: 0,
        outsideStaticReceiverPixelCount: 100000,
        pixelCount: 921600,
        pixelsOverFourByte,
        pixelsOverFourBytePercent:
            pixelsOverFourByte / eligibleStaticReceiverPixelCount * 100,
        rawSamePixelMaxRgbErrorByte,
        rawSamePixelMeanRgbErrorByte,
        rawSamePixelPixelsOverFourByte,
        rawSamePixelPixelsOverFourBytePercent:
            rawSamePixelPixelsOverFourByte / eligibleStaticReceiverPixelCount * 100,
        rawSamePixelRgbErrorMethod: 'same_pixel_rgb_chebyshev_v1',
        rgbErrorMethod: 'nearest_eligible_current_3x3_rgb_chebyshev_v1',
        seamErrorPixelCount: 0,
        seamFalseLitPixelCount: 0,
        seamMaskMethod: 'static_sun_depth_seam_debug_red_gt_blue_plus_32_v1',
        seamPixelCount: 1,
        staticReceiverMaskMethod:
            'visible_static_city_receivers_excluding_registered_dynamic_receivers_depth_equality_v2',
        width: 1280,
        ...overrides
    };
}

function makeCaseWorkload() {
    return {
        cache: {
            dynamicBusShadow: { calls: 1, lines: 0, points: 0, triangles: 48 },
            staticCityShadow: { calls: 0, lines: 0, points: 0, triangles: 0 }
        },
        comparison: {
            dynamicBusShadow: { calls: 1, lines: 0, points: 0, triangles: 48 },
            staticCityShadow: { calls: 2, lines: 0, points: 0, triangles: 120 }
        },
        current: {
            dynamicBusShadow: { calls: 1, lines: 0, points: 0, triangles: 48 },
            staticCityShadow: { calls: 2, lines: 0, points: 0, triangles: 120 }
        }
    };
}

function makeDynamicBusEvidence() {
    const state = {
        casterMeshCount: 8,
        meshCount: 10,
        method: 'registered_bus_anchor_outside_static_city_v1',
        receiverMeshCount: 9,
        registeredDynamicReceiver: true,
        registeredDynamicRootCount: 1,
        rootOutsideStaticCity: true
    };
    return {
        cache: structuredClone(state),
        comparison: structuredClone(state),
        current: structuredClone(state),
        shadowProof: {
            affectedStaticCityReceiverPixelCount: 1,
            brightenedStaticCityReceiverPixelCount: 0,
            busCasterMeshCount: 8,
            cityReceiverMaskMethod: 'visible_city_receiver_identity_depth_equality_v1',
            maximumLumaBrighteningByte: 0,
            maximumLumaDarkeningByte: 16,
            method:
                'bus_cast_shadow_enabled_luma_darker_than_disabled_over_visible_city_receivers_v2',
            restoredCasterMeshCount: 8,
            staticCityReceiverPixelCount: 500
        }
    };
}

function makeCaseDiagnostics(lightingProfileId, aggregateSha256) {
    const controller = { effectiveMode: 'baked', state: 'active' };
    const packageIdentity = { aggregateSha256, lightingProfileId };
    return {
        current: {
            active: { lightingProfileId: 'fixture' },
            casters: {
                active: false,
                lastReason: 'validation_live_final_shadow_retained',
                originalCasterCount: 1968,
                restores: 0,
                snapshotMeshCount: 0
            },
            debugMode: 'liveFinal',
            runtime: { controller, package: packageIdentity }
        },
        cache: {
            active: { lightingProfileId: 'fixture' },
            casters: {
                active: true,
                originalCasterCount: 1968,
                restores: 0,
                snapshotMeshCount: 1968,
                staticMeshCount: 1968,
                suppressedCasterCount: 1968
            },
            debugMode: 'final',
            runtime: { controller, package: packageIdentity }
        },
        comparison: {
            active: { lightingProfileId: 'fixture' },
            casters: {
                active: false,
                lastReason: 'comparison_current_shadow_retained',
                originalCasterCount: 1968,
                restores: 1,
                snapshotMeshCount: 0
            },
            debugMode: 'signedDifference',
            runtime: { controller, package: packageIdentity }
        }
    };
}

function packagePathFor(lightingProfileId) {
    return `tests/artifacts/illumination_531/production/${lightingProfileId}/static_sun_depth.ilpkg`;
}

function rawCanonicalSha256(value) {
    return createHash('sha256')
        .update(canonicalJsonStringify(value), 'utf8')
        .digest('hex');
}

function rawBytesSha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function makePng(width, height, payload = []) {
    const bytes = new Uint8Array(33 + payload.length);
    bytes.set(PNG_SIGNATURE, 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13, false);
    bytes.set([73, 72, 68, 82], 12);
    view.setUint32(16, width, false);
    view.setUint32(20, height, false);
    bytes[24] = 8;
    bytes[25] = 6;
    bytes.set(payload, 33);
    return bytes;
}

function makeMaskPng(width, height, predicate) {
    const scanlines = new Uint8Array(height * (width + 1));
    for (let y = 0; y < height; y += 1) {
        const rowOffset = y * (width + 1);
        scanlines[rowOffset] = 0;
        for (let x = 0; x < width; x += 1) {
            scanlines[rowOffset + x + 1] = predicate(y * width + x) ? 255 : 0;
        }
    }
    const ihdr = new Uint8Array(13);
    const ihdrView = new DataView(ihdr.buffer);
    ihdrView.setUint32(0, width, false);
    ihdrView.setUint32(4, height, false);
    ihdr.set([8, 0, 0, 0, 0], 8);
    return concatenateBytes([
        PNG_SIGNATURE,
        makePngChunk('IHDR', ihdr),
        makePngChunk('IDAT', deflateSync(scanlines)),
        makePngChunk('IEND', new Uint8Array())
    ]);
}

function makePngChunk(type, data) {
    const typeBytes = new TextEncoder().encode(type);
    const result = new Uint8Array(12 + data.byteLength);
    const view = new DataView(result.buffer);
    view.setUint32(0, data.byteLength, false);
    result.set(typeBytes, 4);
    result.set(data, 8);
    view.setUint32(8 + data.byteLength, crc32(concatenateBytes([typeBytes, data])), false);
    return result;
}

function concatenateBytes(values) {
    const result = new Uint8Array(
        values.reduce((sum, value) => sum + value.byteLength, 0)
    );
    let offset = 0;
    for (const value of values) {
        result.set(value, offset);
        offset += value.byteLength;
    }
    return result;
}

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
