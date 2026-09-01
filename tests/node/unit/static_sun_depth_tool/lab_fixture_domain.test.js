// Deterministic contracts for AI 531 Lab caster and receiver fixture domains.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    partitionStaticSunDepthLayers
} from '../../../../src/app/illumination/static_sun_depth/index.js';
import {
    LAB_DENSITY_DIAGNOSTIC_CANDIDATES,
    LAB_DENSITY_PRODUCTION_PROJECTION,
    createExactRationalLatticePhaseEvidence,
    includeLightDomainPoint,
    createEmptyLightDomain,
    createLiveToCacheVogelRadiusEvidence,
    findLabDensityDiagnosticCandidate,
    unionLightDomains
} from '../../../../tools/static_sun_depth/src/LabFixtureDomain.mjs';

test('receiver-only geometry expands both XY layout and depth encoding domain', () => {
    const casters = createEmptyLightDomain();
    includeLightDomainPoint(casters, [0, 0, 0]);
    includeLightDomainPoint(casters, [4, 5, 6]);
    const receivers = createEmptyLightDomain();
    includeLightDomainPoint(receivers, [-8, -9, -10]);
    includeLightDomainPoint(receivers, [12, 13, 20]);

    assert.deepEqual(unionLightDomains(casters, receivers), {
        min: [-8, -9, -10],
        max: [12, 13, 20]
    });
});

test('light-domain helpers fail closed on absent or malformed receiver bounds', () => {
    const empty = createEmptyLightDomain();
    assert.throws(() => unionLightDomains(empty), /finite ordered XYZ bounds/);
    assert.throws(
        () => includeLightDomainPoint(createEmptyLightDomain(), [0, 1]),
        /three finite coordinates/
    );
});

test('live Three r183 Vogel radius stays in source space and derives cache radius physically', () => {
    const common = {
        oracleRadiusTexels: 1.5,
        sourceWorldExtentMeters: [680, 680],
        sourceMapSizeTexels: [16384, 16384]
    };
    const exactThreeToTwo = createLiveToCacheVogelRadiusEvidence({
        ...common,
        cacheTexelSizeMeters: 0.062255859375
    });
    assert.equal(exactThreeToTwo.sourceTexelPitchMeters[0], 0.04150390625);
    assert.equal(exactThreeToTwo.sourceVogelRadiusMeters, 0.062255859375);
    assert.equal(exactThreeToTwo.oracleRadiusTexels, 1.5);
    assert.equal(exactThreeToTwo.derivedCacheRadiusTexels, 1);

    const exactFourToThree = createLiveToCacheVogelRadiusEvidence({
        ...common,
        cacheTexelSizeMeters: (680 / 16384) * 4 / 3
    });
    assert.equal(exactFourToThree.oracleRadiusTexels, 1.5);
    assert.equal(exactFourToThree.derivedCacheRadiusTexels, 1.125);
    assert.throws(
        () => createLiveToCacheVogelRadiusEvidence({
            ...common,
            sourceWorldExtentMeters: [680, 681],
            cacheTexelSizeMeters: 0.062255859375
        }),
        /isotropic texel pitch/
    );
});

test('generalized exact-rational lattice proof covers receivers and preserves reduced phase period', () => {
    const sourcePitch = 680 / 16384;
    const evidence = createExactRationalLatticePhaseEvidence({
        cacheTexelSizeMeters: sourcePitch * 4 / 3,
        sourceTexelPitchMeters: [sourcePitch, sourcePitch],
        sourceAxisValues: [-1 + Number.EPSILON, 1],
        texelCenterPhaseAnchorLightMeters: [0.125, -0.375],
        receiverDomainLightMeters: {
            min: [-93.75, -61.125, -20],
            max: [107.25, 88.875, 40]
        },
        ratio: {sourceTexels: 4, cacheTexels: 3}
    });
    assert.deepEqual(evidence.ratio, {sourceTexels: 4, cacheTexels: 3});
    assert.deepEqual(evidence.sourceAxisSigns, [-1, 1]);
    assert.deepEqual(
        evidence.signedSourceTexelStepsPerCacheTexel,
        [-4 / 3, 4 / 3]
    );
    assert.equal(evidence.repeatingCacheTexelPeriod, 3);
    assert.equal(evidence.repeatingSourceTexelPeriod, 4);
    assert.deepEqual(
        evidence.phaseClasses[0].map((entry) => entry.sourceTexelPhaseNumerator),
        [0, 2, 1]
    );
    assert.deepEqual(
        evidence.phaseClasses[1].map((entry) => entry.sourceTexelPhaseNumerator),
        [0, 1, 2]
    );
    assert.ok(evidence.maximumNumericPhaseError <= 1e-8);
    for (let axis = 0; axis < 2; axis++) {
        assert.ok(
            evidence.axes[axis].coveringCacheCellBoundsMeters.min
                <= [-93.75, -61.125][axis]
        );
        assert.ok(
            evidence.axes[axis].coveringCacheCellBoundsMeters.max
                >= [107.25, 88.875][axis]
        );
        assert.ok(evidence.axes[axis].maximumScaledSourceStepIndexError <= 1e-8);
        assert.ok(evidence.axes[axis].cachePeriodToSourcePeriodError <= 1e-8);
    }
    assert.throws(
        () => createExactRationalLatticePhaseEvidence({
            cacheTexelSizeMeters: sourcePitch * 8 / 6,
            sourceTexelPitchMeters: [sourcePitch, sourcePitch],
            sourceAxisValues: [-1, 1],
            texelCenterPhaseAnchorLightMeters: [0, 0],
            receiverDomainLightMeters: {min: [0, 0, 0], max: [1, 1, 1]},
            ratio: {sourceTexels: 8, cacheTexels: 6}
        }),
        /input is invalid/
    );
});

test('bounded density catalog identifies the upper bound and rational ladder exactly', () => {
    assert.equal(LAB_DENSITY_DIAGNOSTIC_CANDIDATES.length, 8);
    const oneToOne = findLabDensityDiagnosticCandidate(
        'diagnostic_exact_ratio_1to1_texel_0p04150390625'
    );
    assert.deepEqual(oneToOne.exactLatticeRatio, {sourceTexels: 1, cacheTexels: 1});
    assert.equal(oneToOne.texelSizeMeters, 0.04150390625);
    assert.equal(oneToOne.strictParityStatus, 'passed');
    assert.equal(oneToOne.productionEligible, true);
    assert.equal(
        oneToOne.promotionClass,
        'production-selected-strict-parity-passed-v1'
    );
    assert.equal('productionInteriorTexels' in oneToOne, false);
    assert.equal('productionTileSizeMeters' in oneToOne, false);
    assert.deepEqual(LAB_DENSITY_PRODUCTION_PROJECTION, {
        schema: 'ai531-final-rectangular-production-projection-v1',
        layoutPolicy: 'per_profile_phase_locked_rectangular_light_space_grid_v2',
        phasePolicy: 'absolute-stable-basis-texel-edge-lattice-v1',
        selectedCandidateId:
            'diagnostic_exact_ratio_1to1_texel_0p04150390625',
        texelSizeMeters: 680 / 16384,
        tileSizeMeters: [77.6123046875, 75.57861328125],
        interiorTexelsPerLayer: [1870, 1821],
        guardTexels: 4,
        storedTexelsPerLayer: [1878, 1829],
        layerCount: 77,
        payloadBytes: 528968748,
        maximumPayloadBytes: 512 * 1024 * 1024,
        within512MiB: true
    });
    const failedNearExact = findLabDensityDiagnosticCandidate(
        'exact_ratio_65to64_texel_0p04215240478515625'
    );
    assert.deepEqual(
        failedNearExact.exactLatticeRatio,
        {sourceTexels: 65, cacheTexels: 64}
    );
    assert.equal(failedNearExact.strictParityStatus, 'failed');
    assert.equal(failedNearExact.productionEligible, false);
    assert.equal(
        failedNearExact.promotionClass,
        'diagnostic-only-strict-parity-failed-v1'
    );
    const ladder = ['4to3', '5to4', '6to5'].map((ratio) => (
        LAB_DENSITY_DIAGNOSTIC_CANDIDATES.find((entry) => entry.id.includes(ratio))
    ));
    assert.deepEqual(
        ladder.map((entry) => entry.strictParityStatus),
        ['failed', 'failed', 'failed']
    );
    assert.ok(ladder.every((entry) => entry.productionEligible === false));
    assert.deepEqual(
        LAB_DENSITY_DIAGNOSTIC_CANDIDATES
            .filter((entry) => entry.strictParityStatus === 'passed')
            .map((entry) => entry.id),
        [oneToOne.id]
    );
    assert.equal(
        findLabDensityDiagnosticCandidate('0.0553385416666667').id,
        'exact_ratio_4to3_texel_0p05533854166666667'
    );
    assert.equal(findLabDensityDiagnosticCandidate('unknown'), null);
});

test('1:1 Lab overview crop uses complete deterministic canonical layer windows', () => {
    const layerByteLength = 2477 * 2477 * 2;
    const windows = partitionStaticSunDepthLayers(layerByteLength, 8);
    assert.deepEqual(windows, [
        {byteLength: layerByteLength * 5, firstLayer: 0, layerCount: 5},
        {byteLength: layerByteLength * 3, firstLayer: 5, layerCount: 3}
    ]);
    assert.equal(
        windows.reduce((sum, window) => sum + window.byteLength, 0),
        98168464
    );
    assert.equal(
        windows.reduce((sum, window) => sum + window.layerCount, 0),
        8
    );
});
