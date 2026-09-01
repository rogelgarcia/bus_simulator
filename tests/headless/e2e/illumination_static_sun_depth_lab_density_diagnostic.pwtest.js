// Diagnostic-only AI 531 phase-locked cache-density sweep.
import test, {expect} from '@playwright/test';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    ILLUMINATION_LAB_VALIDATION_CASES
} from '../../../src/app/illumination/validation/IlluminationValidationCaseCatalog.js';
import {
    LAB_VALIDATION_CAPABILITY_PROFILE_ID,
    LAB_VALIDATION_FIXTURE_SCHEMA,
    LAB_VALIDATION_PCF,
    LAB_VALIDATION_SAMPLING_BIAS,
    LAB_VALIDATION_THRESHOLDS,
    assertLabEvidenceCanvasLifecycle,
    captureLabEvidencePng,
    createLabTileBoundaryEvidence,
    evaluateLabCaseMetrics,
    evaluateLabCasterTransition,
    evaluateLabDynamicBusLiveShadowProof,
    evaluateLabShadowSubmission,
    requireLabEffectiveShadowFilterEvidence
} from '../../../tools/static_sun_depth/validate_lab.mjs';
import {
    unpackThreeRgbaDepthBytes
} from '../../../tools/static_sun_depth/src/ThreeRgbaDepthPacking.mjs';
import {
    LAB_DENSITY_DIAGNOSTIC_CANDIDATES,
    LAB_DENSITY_PRODUCTION_PROJECTION,
    findLabDensityDiagnosticCandidate
} from '../../../tools/static_sun_depth/src/LabFixtureDomain.mjs';
import {
    VALIDATION_CAPTURE_AUTHENTICATION_METHOD,
    authenticateValidationCaptureSet,
    createValidationCaptureRecord
} from '../../../tools/static_sun_depth/src/ValidationCaptureAuthentication.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const outputRoot = path.join(
    repoRoot,
    'tests/artifacts/screens/illumination_531/lab_trials/phase_locked_density_sweep'
);
const captureAuthorityRoot = path.join(
    repoRoot,
    'tests/artifacts/screens/illumination_531'
);
const captureDimensionsPixels = Object.freeze([1280, 720]);
const allCandidates = LAB_DENSITY_DIAGNOSTIC_CANDIDATES;
const SIDEDNESS_VALIDATION = 'three-r183-effective-shadow-side-v1';
const SIDEDNESS_CANDIDATE_ID =
    'diagnostic_exact_ratio_1to1_texel_0p04150390625';
const SIDEDNESS_CASE_ID = 'illum.lab.overview_default';
const RESIDUAL_TAP_TRACE_ID = 'az135_el08_one_pixel_rg8_quantization_v1';
const RESIDUAL_TAP_TRACE_CASE_ID =
    'illum.lab.overhang_receiver_fixture.az135_el08';
const requestedSidednessValidation = String(
    process.env.AI531_SIDEDNESS_VALIDATION || ''
).trim();
if (requestedSidednessValidation
    && requestedSidednessValidation !== SIDEDNESS_VALIDATION) {
    throw new Error('AI531 sidedness validation environment is unsupported');
}
const requestedCandidate = String(process.env.AI531_DENSITY_CANDIDATE || '').trim();
const selectedCandidate = requestedCandidate
    ? findLabDensityDiagnosticCandidate(requestedCandidate)
    : null;
const candidates = Object.freeze(requestedCandidate
    ? selectedCandidate ? [selectedCandidate] : []
    : [...allCandidates]);
const requestedCaseId = String(process.env.AI531_DENSITY_CASE_ID || '').trim();
const requestedResidualTapTrace = String(
    process.env.AI531_RESIDUAL_TAP_TRACE || ''
).trim();
if (requestedResidualTapTrace
    && requestedResidualTapTrace !== RESIDUAL_TAP_TRACE_ID) {
    throw new Error('AI531 residual tap trace environment is unsupported');
}
const validationCases = Object.freeze(ILLUMINATION_LAB_VALIDATION_CASES.filter((entry) => (
    !requestedCaseId || entry.id === requestedCaseId
)));
if (candidates.length < 1 || validationCases.length < 1) {
    throw new Error('AI531 density diagnostic environment selected no candidate or case');
}
if (requestedResidualTapTrace
    && (requestedSidednessValidation
        || candidates.length !== 1
        || candidates[0].id !== SIDEDNESS_CANDIDATE_ID
        || validationCases.length !== 1
        || validationCases[0].id !== RESIDUAL_TAP_TRACE_CASE_ID)) {
    throw new Error('AI531 residual tap trace requires canonical exact-1:1 az135/el08');
}
if (requestedSidednessValidation
    && (candidates.length !== 1
        || candidates[0].id !== SIDEDNESS_CANDIDATE_ID
        || validationCases.length !== 1
        || validationCases[0].id !== SIDEDNESS_CASE_ID)) {
    throw new Error('AI531 sidedness validation requires canonical RG8 exact-1:1 overview only');
}
const timingContamination = Object.freeze({
    contaminated: true,
    usableForPromotion: false,
    reason: 'host reported concurrent processes and shared GPU contention'
});

function isCacheActive(diagnostics) {
    return !!diagnostics?.active
        && diagnostics?.runtime?.controller?.state === 'active'
        && diagnostics?.runtime?.controller?.effectiveMode === 'baked';
}

function assertPhaseDiagnostic(fixture, validationCase, candidate) {
    const texelSizeMeters = candidate.texelSizeMeters;
    const diagnostic = fixture?.densityDiagnostic;
    expect(fixture.casterCount).toBeGreaterThan(0);
    expect(fixture.intendedCasterSnapshotCount).toBeGreaterThanOrEqual(
        fixture.casterCount
    );
    expect(fixture.staticReceiverMeshCount).toBeGreaterThan(0);
    expect(fixture.staticReceiverMaterialSlotCount).toBeGreaterThan(0);
    expect(diagnostic?.schema).toBe('ai531-phase-locked-density-diagnostic-v1');
    expect(diagnostic.validationCaseId).toBe(validationCase.id);
    expect(diagnostic.requestedCandidateId).toBe(candidate.id);
    expect(diagnostic.requestedTexelSizeMeters).toBe(texelSizeMeters);
    expect(diagnostic.phaseAnchorDerivation).toBe(
        'even-map-adjacent-positive-source-axis-texel-center-projected-to-cache-light-v1'
    );
    expect(diagnostic.sourceToCacheLightAxisTransform[0][0]).toBeCloseTo(-1, 6);
    expect(diagnostic.sourceToCacheLightAxisTransform[0][1]).toBeCloseTo(0, 6);
    expect(diagnostic.sourceToCacheLightAxisTransform[1][0]).toBeCloseTo(0, 6);
    expect(diagnostic.sourceToCacheLightAxisTransform[1][1]).toBeCloseTo(1, 6);
    for (let axis = 0; axis < 2; axis++) {
        const expectedOffset = 0.5 * diagnostic.sourceTexelPitchMeters[0]
                * diagnostic.sourceToCacheLightAxisTransform[axis][0]
            + 0.5 * diagnostic.sourceTexelPitchMeters[1]
                * diagnostic.sourceToCacheLightAxisTransform[axis][1];
        expect(diagnostic.sourceTexelCenterOffsetLightMeters[axis]).toBeCloseTo(
            expectedOffset,
            12
        );
        expect(diagnostic.texelCenterPhaseAnchorLightMeters[axis]).toBeCloseTo(
            diagnostic.sourceCameraCenterLightMeters[axis] + expectedOffset,
            12
        );
        expect(diagnostic.cropBoundsLightMeters.min[axis]).toBeLessThanOrEqual(
            diagnostic.requiredBoundsLightMeters.min[axis] + 1e-9
        );
        expect(diagnostic.cropBoundsLightMeters.max[axis]).toBeGreaterThanOrEqual(
            diagnostic.requiredBoundsLightMeters.max[axis] - 1e-9
        );
        const firstCenter = diagnostic.cropBoundsLightMeters.min[axis]
            + texelSizeMeters * 0.5;
        const phaseIndex = (firstCenter
            - diagnostic.texelCenterPhaseAnchorLightMeters[axis]) / texelSizeMeters;
        expect(phaseIndex).toBeCloseTo(Math.round(phaseIndex), 10);
    }
    expect(diagnostic.cropPayloadBytes).toBe(fixture.payloadBytes);
    expect(diagnostic.cropTileGridPolicy).toBe(
        'first-single-chunk-else-minimum-payload-canonical-layer-windows-2x2-through-4x4-v2'
    );
    expect(fixture.tileCount).toBe(
        diagnostic.cropTileCount[0] * diagnostic.cropTileCount[1]
    );
    expect(diagnostic.cropCombinedTexels).toEqual([
        (diagnostic.cropStoredTexelsPerLayer[0]
            - diagnostic.guard.diagnosticGuardTexels * 2)
            * diagnostic.cropTileCount[0],
        (diagnostic.cropStoredTexelsPerLayer[1]
            - diagnostic.guard.diagnosticGuardTexels * 2)
            * diagnostic.cropTileCount[1]
    ]);
    expect(diagnostic.cropLayerByteLength).toBeLessThanOrEqual(
        diagnostic.limits.maximumChunkBytes
    );
    expect(diagnostic.cropPayloadBytes).toBeLessThanOrEqual(
        diagnostic.limits.maximumPackageBytes
    );
    expect(diagnostic.cropChunkCount).toBe(diagnostic.cropChunkWindows.length);
    expect(fixture.packageChunkCount).toBe(diagnostic.cropChunkCount);
    expect(fixture.packageChunkIds).toHaveLength(diagnostic.cropChunkCount);
    expect(diagnostic.cropChunkWindows.reduce(
        (sum, window) => sum + window.layerCount,
        0
    )).toBe(fixture.tileCount);
    for (let index = 0; index < diagnostic.cropChunkWindows.length; index++) {
        const window = diagnostic.cropChunkWindows[index];
        const previous = diagnostic.cropChunkWindows[index - 1];
        expect(window.firstLayer).toBe(
            previous ? previous.firstLayer + previous.layerCount : 0
        );
        expect(window.byteLength).toBe(
            window.layerCount * diagnostic.cropLayerByteLength
        );
        expect(window.byteLength).toBeLessThanOrEqual(
            diagnostic.limits.maximumChunkBytes
        );
    }
    expect(diagnostic.fullDomainProjection.exceedsSingleChunk).toBe(true);
    expect(diagnostic.finalProductionProjection).toMatchObject({
        ...LAB_DENSITY_PRODUCTION_PROJECTION,
        tileSizeMeters: [77.6123046875, 75.57861328125],
        interiorTexelsPerLayer: [1870, 1821],
        storedTexelsPerLayer: [1878, 1829],
        layerByteLength: 6869724,
        payloadBytes: 528968748,
        canonical64MiBLayerWindowCount: 9,
        exceedsSingleChunk: true,
        within256MiB: false,
        within512MiB: true
    });
    expect(diagnostic.finalProductionProjection.chunkWindows).toHaveLength(9);
    expect(diagnostic.candidatePromotion).toEqual({
        strictParityStatus: candidate.strictParityStatus,
        promotionClass: candidate.promotionClass,
        promotionBudgetEligible: candidate.productionEligible
    });
    if (candidate.id === 'exact_ratio_65to64_texel_0p04215240478515625') {
        expect(diagnostic.candidatePromotion).toEqual({
            strictParityStatus: 'failed',
            promotionClass: 'diagnostic-only-strict-parity-failed-v1',
            promotionBudgetEligible: false
        });
    }
    expect(diagnostic.filterRadiusIdentity).toMatchObject({
        model: 'three-r183-live-vogel-radius-to-cache-physical-support-v1',
        oracleRadiusTexels: 1.5,
        oracleRadiusSpace: 'live-directional-shadow-map-source-texels-v1',
        sourceWorldExtentMeters: [680, 680],
        sourceMapSizeTexels: [16384, 16384],
        sourceTexelPitchMeters: [0.04150390625, 0.04150390625],
        sourceVogelRadiusMeters: 0.062255859375,
        cacheTexelSizeMeters: texelSizeMeters,
        derivation:
            'oracle-radius-times-live-source-pitch-divided-by-cache-pitch-v1'
    });
    expect(diagnostic.filterRadiusIdentity.derivedCacheRadiusTexels).toBeCloseTo(
        0.062255859375 / texelSizeMeters,
        12
    );
    if (candidate.exactLatticeRatio?.sourceTexels === 1
        && candidate.exactLatticeRatio?.cacheTexels === 1
        && validationCase.id === SIDEDNESS_CASE_ID) {
        expect(diagnostic).toMatchObject({
            cropTileCount: [4, 2],
            cropStoredTexelsPerLayer: [2477, 2477],
            cropLayerByteLength: 12271058,
            cropPayloadBytes: 98168464,
            cropChunkCount: 2,
            cropChunkWindows: [
                {byteLength: 61355290, firstLayer: 0, layerCount: 5},
                {byteLength: 36813174, firstLayer: 5, layerCount: 3}
            ]
        });
    }
    if (candidate.exactLatticeRatio) {
        const lattice = diagnostic.exactRationalLatticePhaseEvidence;
        expect(lattice).toMatchObject({
            method: 'full-static-receiver-domain-live-lattice-rational-proof-v2',
            ratio: candidate.exactLatticeRatio,
            cacheTexelSizeMeters: texelSizeMeters,
            sourceTexelPitchMeters: [0.04150390625, 0.04150390625],
            sourceAxisSigns: [-1, 1],
            repeatingCacheTexelPeriod: candidate.exactLatticeRatio.cacheTexels,
            repeatingSourceTexelPeriod: candidate.exactLatticeRatio.sourceTexels,
            passed: true
        });
        expect(lattice.maximumSourceAxisSignError).toBeLessThanOrEqual(1e-12);
        expect(lattice.maximumRatioError).toBeLessThanOrEqual(1e-12);
        expect(lattice.maximumNumericPhaseError).toBeLessThanOrEqual(1e-8);
        expect(lattice.phaseClasses).toHaveLength(2);
        expect(lattice.phaseClasses[0]).toHaveLength(
            candidate.exactLatticeRatio.cacheTexels
        );
        for (let axis = 0; axis < 2; axis++) {
            const proof = lattice.axes[axis];
            expect(proof.coveringCacheCellBoundsMeters.min).toBeLessThanOrEqual(
                fixture.staticReceiverDomainLightMeters.min[axis] + 1e-9
            );
            expect(proof.coveringCacheCellBoundsMeters.max).toBeGreaterThanOrEqual(
                fixture.staticReceiverDomainLightMeters.max[axis] - 1e-9
            );
            expect(proof.maximumScaledSourceStepIndexError).toBeLessThanOrEqual(1e-8);
            expect(proof.cachePeriodToSourcePeriodError).toBeLessThanOrEqual(1e-8);
        }
        const isThreeToTwo = candidate.exactLatticeRatio.sourceTexels === 3
            && candidate.exactLatticeRatio.cacheTexels === 2;
        if (isThreeToTwo) {
            expect(diagnostic.exactThreeToTwoLatticePhaseEvidence).toEqual(
                diagnostic.exactRationalLatticePhaseEvidence
            );
        } else {
            expect(diagnostic.exactThreeToTwoLatticePhaseEvidence).toBeNull();
        }
    } else {
        expect(diagnostic.exactRationalLatticePhaseEvidence).toBeNull();
        expect(diagnostic.exactThreeToTwoLatticePhaseEvidence).toBeNull();
    }
    expect(diagnostic.guard).toEqual({
        diagnosticGuardTexels: 1,
        diagnosticRationale:
            'exact-global-cross-layer-filter-fetch-does-not-consume-guard-v1',
        productionGuardTexels: 4
    });
    const receiver = diagnostic.visibleStaticReceiverEvidence;
    expect(receiver.method).toBe(
        'static_city_receive_shadow_supported_visible_material_packed_camera_depth_unproject_xyz_v2'
    );
    expect(receiver.eligibleMeshCount).toBeGreaterThan(0);
    expect(receiver.eligibleMaterialSlotCount).toBeGreaterThan(0);
    expect(receiver.receiverPixelCount).toBeGreaterThan(0);
    expect(receiver.receiverPixelCount).toBeLessThan(1280 * 720);
    expect(receiver.minimumDecodedDepth).toBeGreaterThanOrEqual(0);
    expect(receiver.maximumDecodedDepth).toBeGreaterThan(receiver.minimumDecodedDepth);
    expect(receiver.maximumDecodedDepth).toBeLessThan(1);
    expect(receiver.decodedDepthSamples.length).toBe(8);
    for (const sample of receiver.decodedDepthSamples) {
        expect(sample.rgba).toHaveLength(4);
        expect(unpackThreeRgbaDepthBytes(new Uint8Array(sample.rgba))).toBe(
            sample.decodedDepth
        );
    }
    expect(diagnostic.encodingDomainLightMeters).toEqual(
        fixture.fixtureDomainLightMeters
    );
    expect(fixture.encoding.minDepthMeters).toBeLessThanOrEqual(
        fixture.staticReceiverDomainLightMeters.min[2]
    );
    expect(fixture.encoding.maxDepthMeters).toBeGreaterThanOrEqual(
        fixture.staticReceiverDomainLightMeters.max[2]
    );
    expect(fixture.encoding.minDepthMeters).toBeLessThanOrEqual(
        receiver.boundsLightMeters.min[2]
    );
    expect(fixture.encoding.maxDepthMeters).toBeGreaterThanOrEqual(
        receiver.boundsLightMeters.max[2]
    );
    for (let axis = 0; axis < 3; axis++) {
        const visibleSpan = receiver.boundsLightMeters.max[axis]
            - receiver.boundsLightMeters.min[axis];
        expect(visibleSpan).toBeGreaterThan(axis < 2 ? texelSizeMeters : 0);
        expect(receiver.boundsLightMeters.min[axis]).toBeGreaterThanOrEqual(
            receiver.eligibleReceiverBoundsLightMeters.min[axis] - 1e-6
        );
        expect(receiver.boundsLightMeters.max[axis]).toBeLessThanOrEqual(
            receiver.eligibleReceiverBoundsLightMeters.max[axis] + 1e-6
        );
        expect(fixture.fixtureDomainLightMeters.min[axis]).toBeLessThanOrEqual(
            fixture.casterDomainLightMeters.min[axis]
        );
        expect(fixture.fixtureDomainLightMeters.min[axis]).toBeLessThanOrEqual(
            fixture.staticReceiverDomainLightMeters.min[axis]
        );
        expect(fixture.fixtureDomainLightMeters.max[axis]).toBeGreaterThanOrEqual(
            fixture.casterDomainLightMeters.max[axis]
        );
        expect(fixture.fixtureDomainLightMeters.max[axis]).toBeGreaterThanOrEqual(
            fixture.staticReceiverDomainLightMeters.max[axis]
        );
        if (axis < 2) {
            expect(diagnostic.normalLayoutBoundsLightMeters.min[axis])
                .toBeLessThanOrEqual(
                    fixture.fixtureDomainLightMeters.min[axis]
                    - diagnostic.cropPaddingMeters + 1e-9
                );
            expect(diagnostic.normalLayoutBoundsLightMeters.max[axis])
                .toBeGreaterThanOrEqual(
                    fixture.fixtureDomainLightMeters.max[axis]
                    + diagnostic.cropPaddingMeters - 1e-9
                );
        }
    }
    return diagnostic;
}

for (const candidate of candidates) {
    test(`AI 531 phase-locked density diagnostic ${candidate.texelSizeMeters}`, async ({
        browserName,
        page
    }) => {
        test.setTimeout(2_400_000);
        expect(browserName).toBe('chromium');
        page.setDefaultTimeout(0);
        await page.setViewportSize({width: 1280, height: 744});
        const artifactDirectoryName = requestedSidednessValidation
            ? 'sidedness_effective_shadow_side_exact_1to1_overview'
            : requestedResidualTapTrace
                ? 'residual_tap_trace_az135_el08_native_depth_v7'
                : candidate.id;
        const candidateRoot = path.join(outputRoot, artifactDirectoryName);
        await mkdir(candidateRoot, {recursive: true});
        const browserDiagnostics = [];
        page.on('pageerror', (error) => browserDiagnostics.push({
            kind: 'pageerror',
            message: String(error?.message ?? error)
        }));
        page.on('requestfailed', (request) => {
            if (new URL(request.url()).origin === new URL(page.url()).origin) {
                browserDiagnostics.push({
                    kind: 'requestfailed',
                    message: `${request.url()} ${request.failure()?.errorText ?? ''}`
                });
            }
        });
        page.on('console', (message) => {
            if (message.type() === 'error') {
                browserDiagnostics.push({kind: 'console.error', message: message.text()});
            }
        });
        await page.goto('/debug_tools/lab_scene.html?coreTests=0');
        await page.waitForFunction(() => !!window.__labSceneValidation?.readiness);
        const readiness = await page.evaluate(() => window.__labSceneValidation.readiness);
        expect(readiness).toMatchObject({
            ready: true,
            cityId: 'lab_scene',
            dynamicBusOutsideStaticCity: true
        });
        const canvasBox = await page.locator('#game-canvas').boundingBox();
        expect(canvasBox).toMatchObject({width: 1280, height: 720});
        await assertLabEvidenceCanvasLifecycle(page, false);
        const environment = await page.evaluate(async (settings) => {
            const runtime = await import(
                '/tools/static_sun_depth/browser/LabValidationRuntime.js'
            );
            return runtime.installLabValidationRuntime(settings);
        }, {
            capabilityProfileId: LAB_VALIDATION_CAPABILITY_PROFILE_ID,
            fixtureSchema: LAB_VALIDATION_FIXTURE_SCHEMA,
            samplingPcf: LAB_VALIDATION_PCF,
            samplingBias: LAB_VALIDATION_SAMPLING_BIAS,
            residualTapTrace: requestedResidualTapTrace || null,
            thresholds: LAB_VALIDATION_THRESHOLDS
        });
        await assertLabEvidenceCanvasLifecycle(page, true);
        const results = [];
        const failures = [];
        const fallbackProofs = [];
        const blockers = [];
        try {
            expect(environment.rendererMaxTextureSize).toBe(16384);
            for (const validationCase of validationCases) {
                const caseRoot = path.join(candidateRoot, validationCase.id);
                await mkdir(caseRoot, {recursive: true});
                try {
                    const capturePaths = {
                        current: path.join(caseRoot, 'current.png'),
                        cache: path.join(caseRoot, 'cache.png'),
                        comparison: path.join(caseRoot, 'comparison.png')
                    };
                    const prepared = await page.evaluate((request) => (
                        window.__ai531LabValidation.prepareProfile(
                            request.validationCase.sunProfile,
                            request
                        )
                    ), {
                        validationCase,
                        texelSizeMeters: candidate.texelSizeMeters
                    });
                    const effectiveFilter = requireLabEffectiveShadowFilterEvidence(
                        prepared.fixture.liveDirectionalShadowFilter
                    );
                    expect(effectiveFilter.effectiveMapSizeTexels).toEqual([16384, 16384]);
                    const densityDiagnostic = assertPhaseDiagnostic(
                        prepared.fixture,
                        validationCase,
                        candidate
                    );
                    const current = await page.evaluate(({caseValue}) => (
                        window.__ai531LabValidation.captureCurrent(caseValue, 2)
                    ), {caseValue: validationCase});
                    expect(current.densityPhaseOracle).toMatchObject({
                        method: 'prepared-shadow-camera-equals-first-current-render-v1',
                        passed: true
                    });
                    expect(
                        current.densityPhaseOracle.maximumWorldMatrixError
                    ).toBeLessThanOrEqual(1e-8);
                    expect(
                        current.densityPhaseOracle.maximumProjectionMatrixError
                    ).toBeLessThanOrEqual(1e-12);
                    await captureLabEvidencePng(
                        page,
                        capturePaths.current,
                        current.evidence,
                        'current'
                    );
                    const activation = await page.evaluate(() => (
                        window.__ai531LabValidation.activatePreparedProfile()
                    ));
                    const cache = await page.evaluate(({caseValue}) => (
                        window.__ai531LabValidation.captureCache(caseValue, 2)
                    ), {caseValue: validationCase});
                    await captureLabEvidencePng(
                        page,
                        capturePaths.cache,
                        cache.evidence,
                        'cache'
                    );
                    const comparison = await page.evaluate(({caseValue}) => (
                        window.__ai531LabValidation.captureComparisonAndCompare(
                            caseValue,
                            2
                        )
                    ), {caseValue: validationCase});
                    await captureLabEvidencePng(
                        page,
                        capturePaths.comparison,
                        comparison.evidence,
                        'comparison'
                    );
                    const residualTapTraceSample = requestedResidualTapTrace
                        ? comparison.missingOccluderSamples.find(({pixel}) => (
                            pixel?.[0] === 375 && pixel?.[1] === 298
                        ))
                        : null;
                    const residualTapTrace = requestedResidualTapTrace
                        ? await page.evaluate(({caseValue, sample}) => (
                            window.__ai531LabValidation.traceResidualTap(
                                caseValue,
                                sample
                            )
                        ), {
                            caseValue: validationCase,
                            sample: residualTapTraceSample
                        }) : null;
                    if (requestedResidualTapTrace) {
                        expect(residualTapTraceSample).toBeTruthy();
                        expect(residualTapTrace).toMatchObject({
                            schema: 'ai531-lab-one-pixel-depth-trace-v1',
                            traceId: RESIDUAL_TAP_TRACE_ID,
                            validationCaseId: RESIDUAL_TAP_TRACE_CASE_ID,
                            screenPixel: [375, 298],
                            evidencePngPixel: [375, 421],
                            filterTrace: {
                                vogelSampleCount: 5,
                                comparisonTapCount: 20
                            }
                        });
                    }
                    const captureOptions = {
                        authorityRoot: captureAuthorityRoot,
                        expectedDimensionsPixels: captureDimensionsPixels,
                        repoRoot
                    };
                    const captures = {
                        current: await createValidationCaptureRecord(
                            capturePaths.current,
                            captureOptions
                        ),
                        cache: await createValidationCaptureRecord(
                            capturePaths.cache,
                            captureOptions
                        ),
                        comparison: await createValidationCaptureRecord(
                            capturePaths.comparison,
                            captureOptions
                        )
                    };
                    const caseFailures = [
                        ...(!isCacheActive(activation)
                            || !isCacheActive(cache.diagnostics)
                            || !isCacheActive(comparison.diagnostics)
                            ? ['fallback'] : []),
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
                    const fallbackProof = await page.evaluate(() => (
                        window.__ai531LabValidation.proveCurrentFallback()
                    ));
                    fallbackProofs.push({
                        caseId: validationCase.id,
                        ...fallbackProof
                    });
                    if (fallbackProof.passed !== true) {
                        caseFailures.push('current_fallback_proof');
                    }
                    if (caseFailures.length > 0) {
                        failures.push({caseId: validationCase.id, failures: caseFailures});
                    }
                    results.push({
                        caseId: validationCase.id,
                        lightingProfileId: validationCase.sunProfile.id,
                        camera: validationCase.camera,
                        coverageTags: validationCase.coverageTags,
                        sunProfile: validationCase.sunProfile,
                        fixture: prepared.fixture,
                        densityDiagnostic,
                        metrics: comparison.metrics,
                        workload: {
                            current: current.workload,
                            cache: cache.workload,
                            comparison: comparison.workload,
                            timingContamination
                        },
                        diagnostics: {
                            current: current.diagnostics,
                            activation,
                            cache: cache.diagnostics,
                            comparison: comparison.diagnostics
                        },
                        dynamicBusLiveShadowProof: current.dynamicBusLiveShadowProof,
                        densityPhaseOracle: current.densityPhaseOracle,
                        missingOccluderSamples: comparison.missingOccluderSamples,
                        residualTapTrace,
                        captures,
                        failures: caseFailures,
                        passed: caseFailures.length === 0
                    });
                } catch (error) {
                    blockers.push({
                        caseId: validationCase.id,
                        message: String(error?.message ?? error),
                        stack: String(error?.stack ?? '')
                    });
                }
            }
        } finally {
            await page.evaluate(() => window.__ai531LabValidation?.dispose());
            await assertLabEvidenceCanvasLifecycle(page, false);
        }
        let captureAuthentication = null;
        if (blockers.length === 0 && results.length === validationCases.length) {
            try {
                captureAuthentication = await authenticateValidationCaptureSet({
                    authorityRoot: captureAuthorityRoot,
                    cases: results,
                    expectedCaseIds: validationCases.map((entry) => entry.id),
                    expectedCaptureCount: validationCases.length * 3,
                    expectedDimensionsPixels: captureDimensionsPixels,
                    repoRoot
                });
            } catch (error) {
                blockers.push({
                    caseId: 'aggregate.capture_authentication',
                    message: String(error?.message ?? error),
                    stack: String(error?.stack ?? '')
                });
            }
        }
        const tileBoundaryEvidence = createLabTileBoundaryEvidence(results);
        if (!tileBoundaryEvidence.passed) {
            failures.push({
                caseId: 'aggregate.tile_boundary_evidence',
                failures: ['tile_boundary_evidence_missing']
            });
        }
        if (browserDiagnostics.length > 0) {
            failures.push({
                caseId: 'aggregate.browser_diagnostics',
                failures: ['browser_diagnostics']
            });
        }
        const report = {
            schema: 'ai531-phase-locked-density-sweep-candidate-v1',
            generatedAt: new Date().toISOString(),
            candidate,
            status: blockers.length > 0
                ? 'blocked' : failures.length > 0 ? 'failed' : 'passed',
            strictGatePolicy: {
                thresholds: LAB_VALIDATION_THRESHOLDS,
                receiverScope: 'static_world_receivers_v1',
                excludedPixels: 'exact_visible_dynamic_bus_receiver_pixels_only_v1',
                bias: LAB_VALIDATION_SAMPLING_BIAS,
                pcf: LAB_VALIDATION_PCF,
                sidednessValidation: requestedSidednessValidation ? {
                    model: requestedSidednessValidation,
                    cacheDepthEncoding: 'canonical-rg8-v1',
                    productionEligible: false,
                    thresholdsUnchanged: true
                } : null,
                residualTapTrace: requestedResidualTapTrace ? {
                    id: requestedResidualTapTrace,
                    renderingSemanticsChanged: false,
                    thresholdsChanged: false,
                    sourceDepthAuthority:
                        'same-bake-packed-rgba-depth-before-rg8-quantization-v1'
                } : null
            },
            timingContamination,
            environment,
            readiness,
            browserDiagnostics,
            captureAuthentication,
            tileBoundaryEvidence,
            fallbackProofs,
            blockers,
            failures,
            caseCount: results.length,
            expectedCaseCount: validationCases.length,
            cases: results
        };
        await writeFile(
            path.join(candidateRoot, 'lab_validation_report.json'),
            `${JSON.stringify(report, null, 2)}\n`,
            'utf8'
        );
        expect(blockers).toEqual([]);
        expect(results).toHaveLength(validationCases.length);
        expect(captureAuthentication).toMatchObject({
            captureCount: validationCases.length * 3,
            dimensionsPixels: captureDimensionsPixels,
            method: VALIDATION_CAPTURE_AUTHENTICATION_METHOD
        });
        expect(browserDiagnostics).toEqual([]);
    });
}

test.afterAll(async () => {
    if (requestedSidednessValidation || requestedResidualTapTrace) return;
    const reports = [];
    for (const candidate of allCandidates) {
        try {
            reports.push(JSON.parse(await readFile(
                path.join(outputRoot, candidate.id, 'lab_validation_report.json'),
                'utf8'
            )));
        } catch {
            // A blocked browser launch still leaves the individual test failure authoritative.
        }
    }
    await mkdir(outputRoot, {recursive: true});
    await writeFile(
        path.join(outputRoot, 'lab_density_report.json'),
        `${JSON.stringify({
            schema: 'ai531-phase-locked-density-sweep-v1',
            generatedAt: new Date().toISOString(),
            candidateOrderMeters: allCandidates.map((entry) => entry.texelSizeMeters),
            timingContamination,
            reports
        }, null, 2)}\n`,
        'utf8'
    );
});
