// Pure selection contracts for all-caster live alpha-cutout sample plans.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PRODUCTION_ALPHA_CUTOUT_CANDIDATE_PLAN_SCHEMA,
    selectProductionAlphaCutoutSamplePlan
} from '../../../../tools/static_sun_depth/browser/ProductionAlphaCutoutSamplePlan.js';

function candidatePlan() {
    return {
        schema: PRODUCTION_ALPHA_CUTOUT_CANDIDATE_PLAN_SCHEMA,
        lightingProfileId: 'ai527.sun.az135.el08',
        candidates: [
            {casterId: 'caster.alpha', expectedDepthNormalized: 0.1, globalTexel: [10, 20], liveTexel: [50, 20]},
            {casterId: 'caster.alpha', expectedDepthNormalized: 0.2, globalTexel: [11, 20], liveTexel: [49, 20]},
            {casterId: 'caster.alpha', expectedDepthNormalized: 0.3, globalTexel: [12, 20], liveTexel: [48, 20]},
            {casterId: 'caster.beta', expectedDepthNormalized: 0.4, globalTexel: [30, 40], liveTexel: [30, 40]},
            {casterId: 'caster.beta', expectedDepthNormalized: 0.5, globalTexel: [31, 40], liveTexel: [29, 40]},
            {casterId: 'caster.beta', expectedDepthNormalized: 0.6, globalTexel: [32, 40], liveTexel: [28, 40]}
        ],
        casterIds: ['caster.alpha', 'caster.beta'],
        cacheMapSizeTexels: [64, 64],
        shadowCamera: {
            cacheDepthAxisWorld: [0, 0, 1],
            farMeters: 11,
            nearMeters: 1,
            sourceCameraDepthAxisMaximumError: 0,
            sourceCameraOriginDepthMetersInCacheBasis: -10
        },
        shadowMapSizeTexels: [64, 64]
    };
}

function liveCapture() {
    return {
        liveOccupancy: Uint8Array.of(1, 0, 1, 1, 0, 1),
        sampleFirstHitDepthMeters: new Float32Array([2, 0, 4.02, 5, 0, 7.2]),
        sampleCount: 6,
        shadowCamera: {
            nearMeters: 1,
            farMeters: 11,
            projection: 'orthographic-linear-depth-v1'
        },
        shadowMapSizeTexels: [64, 64]
    };
}

test('alpha cutout sample-plan selection covers each caster with first-hit and empty texels', () => {
    const result = selectProductionAlphaCutoutSamplePlan(
        candidatePlan(),
        liveCapture(),
        {emptySamplesPerCaster: 1, occupiedSamplesPerCaster: 1}
    );
    assert.deepEqual(result.samplePlan, {
        lightingProfileId: 'ai527.sun.az135.el08',
        method: 'all-cutout-casters-projected-light-texel-coverage-v1',
        samples: [
            {casterId: 'caster.alpha', globalTexel: [10, 20], index: 0},
            {casterId: 'caster.alpha', globalTexel: [11, 20], index: 1},
            {casterId: 'caster.beta', globalTexel: [30, 40], index: 2},
            {casterId: 'caster.beta', globalTexel: [31, 40], index: 3}
        ],
        schema: 'ai531-production-alpha-cutout-sample-plan-v1'
    });
    assert.deepEqual(result.selectedCandidateIndices, [0, 1, 3, 4]);
    assert.deepEqual(result.bakeSampleRequest, {
        depthReference: {
            cacheDepthAxisWorld: [0, 0, 1],
            encoding: 'source-shadow-camera-distance-meters-v1',
            sourceCameraFarMeters: 11,
            sourceCameraNearMeters: 1,
            sourceCameraOriginDepthMetersInCacheBasis: -10
        },
        lightingProfileId: 'ai527.sun.az135.el08',
        method: 'all-cutout-casters-projected-light-texel-coverage-v1',
        productionEligible: true,
        samples: [
            {casterId: 'caster.alpha', globalTexel: [10, 20], index: 0},
            {casterId: 'caster.alpha', globalTexel: [11, 20], index: 1},
            {casterId: 'caster.beta', globalTexel: [30, 40], index: 2},
            {casterId: 'caster.beta', globalTexel: [31, 40], index: 3}
        ],
        schema: 'ai531-production-alpha-cutout-bake-sample-request-v1'
    });
    assert.deepEqual(result.diagnostics, {
        authenticatedFirstHitSampleCount: 2,
        candidateCount: 6,
        casterCount: 2,
        emptyCoverageSampleCount: 2,
        maximumSelectedFirstHitDepthErrorMeters: 0,
        sampleCount: 4
    });
});

test('alpha cutout sample-plan selection marks partial live-map coverage diagnostic-only', () => {
    const partial = candidatePlan();
    partial.casterIds = ['caster.alpha', 'caster.beta', 'caster.gamma'];
    partial.outOfCoverageCasterIds = ['caster.gamma'];
    const result = selectProductionAlphaCutoutSamplePlan(
        partial,
        liveCapture(),
        {allowOutOfCoverageDiagnostic: true}
    );
    assert.equal(result.productionEligible, false);
    assert.equal(
        result.samplePlan.schema,
        'ai531-production-alpha-cutout-in-coverage-diagnostic-plan-v1'
    );
    assert.equal(
        result.bakeSampleRequest.schema,
        'ai531-production-alpha-cutout-in-coverage-bake-diagnostic-request-v1'
    );
    assert.deepEqual(result.outOfCoverageCasterIds, ['caster.gamma']);
    assert.throws(
        () => selectProductionAlphaCutoutSamplePlan(partial, liveCapture()),
        /outside the live shadow map/
    );
});

test('alpha cutout sample-plan selection rejects mislabeled or absent caster first hits', () => {
    const mismatched = liveCapture();
    mismatched.sampleFirstHitDepthMeters[0] = 2.02;
    mismatched.liveOccupancy[2] = 0;
    assert.throws(
        () => selectProductionAlphaCutoutSamplePlan(candidatePlan(), mismatched),
        /caster.alpha.*authenticated first-hit candidate/
    );

    const wrongSize = liveCapture();
    wrongSize.shadowMapSizeTexels = [32, 32];
    assert.throws(
        () => selectProductionAlphaCutoutSamplePlan(candidatePlan(), wrongSize),
        /shadow-map dimensions differ/
    );
});
