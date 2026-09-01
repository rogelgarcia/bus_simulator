// Verifies the AI 531 Lab Scene fixture, exact case plan, lifecycle, and failure gates.
// @ts-check

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
    ILLUMINATION_LAB_VALIDATION_CASES
} from '../../../../src/app/illumination/validation/IlluminationValidationCaseCatalog.js';
import {
    LAB_VALIDATION_CASE_COUNT,
    LAB_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
    LAB_VALIDATION_FIXTURE_SCHEMA,
    LAB_VALIDATION_PCF,
    LAB_VALIDATION_REPORT_SCHEMA,
    LAB_VALIDATION_SAMPLING_BIAS,
    LAB_VALIDATION_THRESHOLDS,
    createLabTileBoundaryEvidence,
    createLabValidationPlan,
    evaluateLabCasterTransition,
    evaluateLabCaseMetrics,
    evaluateLabDynamicBusLiveShadowProof,
    evaluateLabShadowSubmission,
    parseLabValidationArgs,
    requireLabDensityPhaseOracle,
    requireLabEffectiveShadowFilterEvidence,
    requireLabMetricRecord
} from '../../../../tools/static_sun_depth/validate_lab.mjs';
import {
    createSunPointDirectionWorld
} from '../../../../tools/static_sun_depth/src/SunPointDirection.mjs';
import {
    LAB_EVIDENCE_CANVAS_ID,
    LAB_EVIDENCE_CAPTURE_ALPHA_POLICY,
    LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS,
    LAB_EVIDENCE_CAPTURE_ROW_TRANSFORM,
    LAB_EVIDENCE_CAPTURE_SCHEMA,
    createLabEvidenceOpaqueRgba,
    createLabEvidenceOpaqueSamples,
    extractLabEvidenceRgb,
    flipLabEvidenceRgba,
    requireLabEvidenceCaptureState
} from '../../../../tools/static_sun_depth/src/LabEvidenceCapture.mjs';
import {
    LAB_RESIDUAL_TAP_TRACE_SCHEMA,
    traceLabResidualVogelComparisons
} from '../../../../tools/static_sun_depth/src/LabResidualTapTrace.mjs';

test('lab plan consumes exactly eight canonical cases across the three required suns', () => {
    const plan = createLabValidationPlan();
    assert.equal(LAB_VALIDATION_CASE_COUNT, 8);
    assert.equal(plan.caseCount, 8);
    assert.deepEqual(plan.groups.map((group) => group.lightingProfileId), [
        'ai527.sun.az045.el35',
        'ai527.sun.az135.el08',
        'ai527.sun.az225.el12'
    ]);
    assert.deepEqual(plan.groups.map((group) => group.cases.length), [5, 2, 1]);
    assert.equal(plan.groups.flatMap((group) => group.cases).length, 8);
    assert.equal(plan.groups.every((group) => group.cases.every((entry) => (
        entry.kind === 'lab'
        && entry.cityId === 'lab_scene'
        && entry.sunProfile.id === group.lightingProfileId
    ))), true);
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.groups), true);
    assert.equal(Object.isFrozen(plan.groups[0].cases), true);

    const missing = ILLUMINATION_LAB_VALIDATION_CASES.slice(1);
    assert.throws(
        () => createLabValidationPlan(missing),
        /exactly ILLUMINATION_LAB_VALIDATION_CASES/
    );
    const changed = ILLUMINATION_LAB_VALIDATION_CASES.map((entry, index) => (
        index === 0 ? {...entry, cityId: 'bigcity2'} : entry
    ));
    assert.throws(() => createLabValidationPlan(changed), /must target cityId 'lab_scene'/);
});

test('lab metric gates require zero missing occluders and false-lit seams', () => {
    const passing = makeMetrics({
        width: 20,
        height: 25,
        pixelCount: 500,
        pixelsOverFourByte: 1,
        maxContinuousSeamRunPixels: LAB_VALIDATION_THRESHOLDS.maxContinuousSeamRunPixels,
        maxRgbErrorByte: LAB_VALIDATION_THRESHOLDS.maxRgbErrorByte,
        meanRgbErrorByte: LAB_VALIDATION_THRESHOLDS.meanRgbErrorByte,
        missingOccluderPixelCount: 0,
        pixelsOverFourBytePercent: LAB_VALIDATION_THRESHOLDS.pixelsOverFourBytePercent,
        seamErrorPixelCount: 1,
        seamFalseLitPixelCount: 0
    });
    assert.deepEqual(evaluateLabCaseMetrics(passing), []);
    assert.deepEqual(evaluateLabCaseMetrics({
        ...passing,
        maxContinuousSeamRunPixels: 2,
        maxRgbErrorByte: 65,
        meanRgbErrorByte: 0.351,
        missingOccluderPixelCount: 1,
        pixelsOverFourByte: 2,
        pixelsOverFourBytePercent: 0.4,
        seamErrorPixelCount: 2,
        seamPixelCount: 2,
        seamFalseLitPixelCount: 1
    }), [
        'mean_rgb_error',
        'pixels_over_four',
        'maximum_rgb_error',
        'missing_occluder',
        'false_lit_seam',
        'continuous_seam'
    ]);
    assert.throws(
        () => evaluateLabCaseMetrics({...passing, missingOccluderPixelCount: NaN}),
        /finite non-negative/
    );
});

test('lab metrics require exact own data keys and consistent finite counts', () => {
    const passing = makeMetrics();
    assert.equal(requireLabMetricRecord(passing), passing);
    const missing = {...passing};
    delete missing.seamPixelCount;
    assert.throws(() => evaluateLabCaseMetrics(missing), /must contain exactly/);
    assert.throws(
        () => evaluateLabCaseMetrics({...passing, unexpected: 0}),
        /must contain exactly/
    );
    assert.throws(
        () => evaluateLabCaseMetrics({...passing, pixelCount: 3}),
        /dimensions and pixelCount/
    );
    const accessor = {...passing};
    Object.defineProperty(accessor, 'seamPixelCount', {
        enumerable: true,
        get: () => 1
    });
    assert.throws(() => evaluateLabCaseMetrics(accessor), /own data property/);
    assert.throws(
        () => evaluateLabCaseMetrics({
            ...passing,
            seamErrorPixelCount: 1,
            maxContinuousSeamRunPixels: 0
        }),
        /contradictory seam evidence/
    );
});

test('lab caster transitions and aggregate tile-boundary evidence are explicit gates', () => {
    const cache = makeDiagnostics('final', {
        active: true,
        staticMeshCount: 8,
        originalCasterCount: 6,
        suppressedCasterCount: 6,
        snapshotMeshCount: 8,
        restores: 2,
        lastReason: null
    });
    const comparison = makeDiagnostics('currentDifference', {
        active: false,
        staticMeshCount: 8,
        originalCasterCount: 6,
        suppressedCasterCount: 6,
        snapshotMeshCount: 0,
        restores: 3,
        lastReason: 'comparison_current_shadow_retained'
    });
    assert.deepEqual(evaluateLabCasterTransition(cache, comparison), []);
    const currentWorkload = makeWorkload(3, 120);
    const cacheWorkload = makeWorkload(0, 0);
    const comparisonWorkload = makeWorkload(3, 120);
    assert.deepEqual(evaluateLabShadowSubmission(
        currentWorkload,
        cacheWorkload,
        comparisonWorkload
    ), []);
    assert.deepEqual(evaluateLabShadowSubmission(
        currentWorkload,
        makeWorkload(1, 24),
        comparisonWorkload
    ), ['static_casters_submitted_in_cache']);
    assert.deepEqual(evaluateLabShadowSubmission(
        currentWorkload,
        cacheWorkload,
        makeWorkload(0, 0, 3, 120)
    ), ['comparison_static_shadow_submission_missing']);
    assert.deepEqual(evaluateLabShadowSubmission(
        currentWorkload,
        makeWorkload(0, 0, 0, 0),
        comparisonWorkload
    ), ['dynamic_bus_live_shadow_submission_missing']);
    assert.deepEqual(
        evaluateLabCasterTransition(
            {...cache, casters: {...cache.casters, suppressedCasterCount: 5}},
            comparison
        ),
        ['static_casters_not_suppressed']
    );
    assert.deepEqual(
        evaluateLabCasterTransition(cache, {
            ...comparison,
            casters: {...comparison.casters, active: true}
        }),
        ['static_casters_not_restored_for_comparison']
    );
    assert.equal(createLabTileBoundaryEvidence([
        {metrics: makeMetrics({seamPixelCount: 4})}
    ]).passed, true);
    assert.equal(createLabTileBoundaryEvidence([
        {metrics: makeMetrics({seamPixelCount: 0})}
    ]).passed, false);
});

test('lab validation masks only visible bus receivers and independently proves its live ground shadow', () => {
    const proof = {
        darkerStaticPixelCount: 12,
        maximumLumaDeltaByte: 41.5,
        method: 'bus_cast_shadow_on_minus_off_exact_temporary_static_horizontal_city_receiver_v1',
        passed: true,
        receiverMaskMethod: 'dynamic_bus_black_white_material_id_difference_v1',
        staticGroundSample: {
            objectName: 'RoadSurface',
            pixel: [10, 12],
            world: [0, 0, 0],
            worldNormal: [0, 1, 0],
            lumaDeltaByte: 41.5
        },
        toleranceByte: LAB_VALIDATION_THRESHOLDS.falseLitToleranceByte
    };
    assert.deepEqual(evaluateLabDynamicBusLiveShadowProof(proof), []);
    assert.deepEqual(evaluateLabDynamicBusLiveShadowProof({
        ...proof,
        passed: false,
        staticGroundSample: null
    }), ['dynamic_bus_static_ground_shadow_proof']);
});

test('lab runner CLI is contained to screenshot artifacts and marks timing contaminated', () => {
    assert.deepEqual(parseLabValidationArgs([
        '--warmup-frames', '3',
        '--port', '4190',
        '--timing-contaminated-reason', 'shared GPU is busy'
    ]), {
        warmupFrames: 3,
        preferredPort: 4190,
        timingContaminationReason: 'shared GPU is busy'
    });
    assert.throws(() => parseLabValidationArgs(['--unknown', 'x']), /Unknown option/);
    assert.equal(
        LAB_VALIDATION_FIXTURE_SCHEMA,
        'bus-sim-static-sun-depth-webgl2-lab-fixture-v1'
    );
    assert.equal(
        LAB_VALIDATION_REPORT_SCHEMA,
        'bus-sim-static-sun-depth-lab-validation-report-v4'
    );
    assert.deepEqual(LAB_VALIDATION_CAPTURE_DIMENSIONS_PIXELS, [1280, 720]);
    assert.equal(Object.isFrozen(LAB_VALIDATION_CAPTURE_DIMENSIONS_PIXELS), true);
    assert.deepEqual(LAB_VALIDATION_SAMPLING_BIAS, {
        model: 'geometric-normal-offset-plus-constant-depth-relief-v1',
        constantDepthReliefMeters: 0.0697915,
        geometricNormalOffsetMeters: 0.0232
    });
    assert.equal(Object.isFrozen(LAB_VALIDATION_SAMPLING_BIAS), true);
    assert.deepEqual(LAB_VALIDATION_PCF, {
        model: 'three-r183-vogel-5-linear-compare-v1',
        radiusTexels: 1.5,
        sampleCount: 5,
        screenRotation: 'interleaved-gradient-noise-gl-fragcoord-v1',
        hardwareComparison: 'linear-four-compare-taps-v1',
        shadowMapSizePolicy: 'derive-exact-live-single-high-v1',
        shadowMapWorldExtentMeters: [680, 680]
    });
});

test('lab filter evidence rejects stale install state and hashes prepared effective size', () => {
    const capped = {
        model: 'three-r183-vogel-5-linear-compare-v1',
        requestedPresetMapSizeTexels: [16384, 16384],
        rendererMaxTextureSize: 8192,
        effectiveMapSizeTexels: [8192, 8192],
        worldExtentMeters: [680, 680],
        radiusTexels: 1.5,
        worldRadiusMeters: 0.12451171875,
        sizePolicy: 'derive-exact-live-single-high-v1'
    };
    assert.equal(requireLabEffectiveShadowFilterEvidence(capped), capped);
    const staleInstallState = {
        ...capped,
        worldExtentMeters: [400, 400],
        worldRadiusMeters: 1.5 * 400 / 8192
    };
    assert.throws(
        () => requireLabEffectiveShadowFilterEvidence(staleInstallState),
        /does not match live single_high policy/
    );
    const preparedFullSize = {
        ...capped,
        rendererMaxTextureSize: 16384,
        effectiveMapSizeTexels: [16384, 16384],
        worldExtentMeters: [680, 680],
        worldRadiusMeters: 0.062255859375
    };
    assert.equal(
        requireLabEffectiveShadowFilterEvidence(preparedFullSize),
        preparedFullSize
    );
    assert.throws(
        () => requireLabEffectiveShadowFilterEvidence({
            ...capped,
            effectiveMapSizeTexels: [16384, 16384],
            worldRadiusMeters: 0.062255859375
        }),
        /does not match live single_high policy/
    );
});

test('lab current-density oracle accepts bounded numeric noise and rejects camera drift', () => {
    const oracle = {
        maximumProjectionMatrixError: 5e-13,
        maximumWorldMatrixError: 5e-9,
        method: 'prepared-shadow-camera-equals-first-current-render-v1',
        passed: true
    };
    assert.equal(requireLabDensityPhaseOracle(oracle), oracle);
    assert.throws(
        () => requireLabDensityPhaseOracle({
            ...oracle,
            maximumWorldMatrixError: 1.1e-8
        }),
        /prepared camera survived current rendering/
    );
    assert.throws(
        () => requireLabDensityPhaseOracle({
            ...oracle,
            maximumProjectionMatrixError: 1.1e-12
        }),
        /prepared camera survived current rendering/
    );
    assert.throws(
        () => requireLabDensityPhaseOracle({...oracle, passed: false}),
        /prepared camera survived current rendering/
    );
});

test('lab evidence capture flips raw RGBA and preserves RGB through opaque canonicalization', () => {
    const raw = Uint8Array.from([
        1, 2, 3, 0, 4, 5, 6, 128,
        7, 8, 9, 254, 10, 11, 12, 255
    ]);
    const flipped = flipLabEvidenceRgba(raw, 2, 2);
    assert.deepEqual(Array.from(flipped), [
        7, 8, 9, 254, 10, 11, 12, 255,
        1, 2, 3, 0, 4, 5, 6, 128
    ]);
    const opaque = createLabEvidenceOpaqueRgba(flipped, 2, 2);
    assert.deepEqual(Array.from(opaque), [
        7, 8, 9, 255, 10, 11, 12, 255,
        1, 2, 3, 255, 4, 5, 6, 255
    ]);
    assert.deepEqual(Array.from(extractLabEvidenceRgb(flipped, 2, 2)), [
        7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6
    ]);
    assert.deepEqual(
        Array.from(extractLabEvidenceRgb(opaque, 2, 2)),
        Array.from(extractLabEvidenceRgb(flipped, 2, 2))
    );
    const samples = createLabEvidenceOpaqueSamples(raw, 2, 2);
    assert.deepEqual(samples[0], {
        evidencePixel: [0, 1],
        rgba: [1, 2, 3, 255],
        sourcePixel: [0, 0]
    });
    const state = {
        alphaPolicy: LAB_EVIDENCE_CAPTURE_ALPHA_POLICY,
        authoritativeRgbSha256: 'b'.repeat(64),
        authoritativeRgbaSha256: 'c'.repeat(64),
        canvasId: LAB_EVIDENCE_CANVAS_ID,
        dimensionsPixels: LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS,
        evidenceRgbaSha256: 'a'.repeat(64),
        evidenceSamples: [{
            evidencePixel: [10, 699],
            rgba: [1, 2, 3, 255],
            sourcePixel: [10, 20]
        }],
        revision: 1,
        rowTransform: LAB_EVIDENCE_CAPTURE_ROW_TRANSFORM,
        schema: LAB_EVIDENCE_CAPTURE_SCHEMA,
        slot: 'current'
    };
    assert.equal(requireLabEvidenceCaptureState(state, 'current'), state);
    assert.throws(
        () => requireLabEvidenceCaptureState({...state, slot: 'cache'}, 'current'),
        /invalid/
    );
    assert.throws(
        () => requireLabEvidenceCaptureState({
            ...state,
            evidenceSamples: [{...state.evidenceSamples[0], evidencePixel: [10, 698]}]
        }),
        /vertical flip/
    );
});

test('lab residual trace exposes all 5 Vogel and 20 linear taps and isolates RG8 bit flips', () => {
    const makeTap = (decodedDepthMeters) => ({
        outOfBounds: false,
        quantized: 1234,
        preRg8DepthMeters: 9.999,
        decodedDepthMeters,
        currentSourceDepthMeters: 9.999,
        currentSourceDepthBufferNormalized: 0.5,
        sourceShadowTexel: [100, 200],
        sourceRasterTexel: [4, 5],
        rg8Bytes: [4, 210],
        reencodedQuantized: 1234,
        quantizedMatchesPreRg8Encoding: true
    });
    const causal = traceLabResidualVogelComparisons({
        comparisonDepthMeters: 10,
        fragmentCoordinatePixels: [375.5, 298.5],
        globalCoordinate: [100.25, 200.75],
        sourceXLightTexels: [-1.5, 0],
        sourceYLightTexels: [0, 1.5],
        readTap: () => makeTap(10.001)
    });
    assert.equal(causal.schema, LAB_RESIDUAL_TAP_TRACE_SCHEMA);
    assert.equal(causal.vogelSampleCount, 5);
    assert.equal(causal.comparisonTapCount, 20);
    assert.equal(causal.vogelSamples.length, 5);
    assert.equal(causal.vogelSamples.every((sample) => sample.taps.length === 4), true);
    assert.equal(causal.changedComparisonBitCount, 20);
    assert.equal(causal.preRg8Visibility, 0);
    assert.equal(causal.rg8Visibility, 1);
    assert.equal(causal.quantizationAssessment.causal, true);
    assert.equal(
        causal.quantizationAssessment.conclusion,
        'proven_rg8_changed_weighted_depth_comparison_result'
    );

    const refuted = traceLabResidualVogelComparisons({
        comparisonDepthMeters: 10,
        fragmentCoordinatePixels: [375.5, 298.5],
        globalCoordinate: [100.25, 200.75],
        sourceXLightTexels: [-1.5, 0],
        sourceYLightTexels: [0, 1.5],
        readTap: () => makeTap(9.998)
    });
    assert.equal(refuted.changedComparisonBitCount, 0);
    assert.equal(refuted.quantizationAssessment.causal, false);
    assert.equal(
        refuted.quantizationAssessment.conclusion,
        'refuted_no_depth_comparison_bit_changed'
    );
});

test('lab fixture uses the canonical azimuth convention', () => {
    const direction = createSunPointDirectionWorld(135, 8);
    assert.equal(direction[0] < 0, true);
    assert.equal(direction[1] > 0, true);
    assert.equal(direction[2] > 0, true);
    assert.ok(Math.abs(Math.hypot(...direction) - 1) < 1e-12);
    assert.throws(() => createSunPointDirectionWorld(NaN, 8), /must be finite/);
});

test('Lab Scene owns the overhang fixture and leaves the dynamic bus outside city ownership', async () => {
    const viewSource = await readFile('src/graphics/gui/lab_scene/LabSceneView.js', 'utf8');
    const mainSource = await readFile('src/graphics/gui/lab_scene/main.js', 'utf8');
    for (const pattern of [
        /cityId: 'lab_scene'/,
        /illumination_overhang_receiver_v1/,
        /OverhangRoadReceiver/,
        /OverhangVerticalWallReceiver/,
        /OverhangRoofAndUndersideReceiver/,
        /roof_and_underside/,
        /OverhangAlphaCutoutCaster/,
        /alphaTest: 0\.5/,
        /this\.engine\?\.scene\?\.add\(bus\)/,
        /id: 'overhang_receiver_fixture'/,
        /dynamicBusOutsideStaticCity/,
        /dynamicBusCastShadow/
    ]) assert.match(viewSource, pattern);
    assert.doesNotMatch(viewSource, /root\.add\(bus\)/);
    for (const pattern of [
        /window\.__labSceneValidation = Object\.freeze/,
        /view: \{ enumerable: true, get: \(\) => view \}/,
        /engine: \{ enumerable: true, get: \(\) => view\.engine \}/,
        /city: \{ enumerable: true, get: \(\) => view\.city \}/,
        /applyCameraPreset/,
        /readiness: \{ enumerable: true, value: started \}/
    ]) assert.match(mainSource, pattern);
    assert.doesNotMatch(mainSource, /productionMode|productionEligible|setMode/);
});

test('browser runtime uses AI530, the real pipeline, guarded world depth, and current fallback', async () => {
    const runnerSource = await readFile('tools/static_sun_depth/validate_lab.mjs', 'utf8');
    const runtimeSource = await readFile(
        'tools/static_sun_depth/browser/LabValidationRuntime.js',
        'utf8'
    );
    const densitySource = await readFile(
        'tests/headless/e2e/illumination_static_sun_depth_lab_density_diagnostic.pwtest.js',
        'utf8'
    );
    const depthPackingSource = await readFile(
        'tools/static_sun_depth/src/ThreeRgbaDepthPacking.mjs',
        'utf8'
    );
    const labStylesSource = await readFile(
        'src/graphics/gui/lab_scene/styles.css',
        'utf8'
    );
    for (const pattern of [
        /ILLUMINATION_LAB_VALIDATION_CASES/,
        /debug_tools\/lab_scene\.html\?coreTests=0/,
        /newPage\(\{viewport: \{width: 1280, height: 744\}\}\)/,
        /tests\/artifacts\/screens\/illumination_531/,
        /path\.join\(allowedScreenshotRoot, 'lab'\)/,
        /current\.png/,
        /cache\.png/,
        /comparison\.png/,
        /createValidationCaptureRecord/,
        /authenticateValidationCaptureSet/,
        /captureAuthentication/,
        /current_static_maps_retained_v1/,
        /sameSessionPairing/,
        /same_lab_page_case_v3/,
        /timingContamination/,
        /productionEligible: false/,
        /blenderCyclesProvenanceClaimed: false/,
        /proveCurrentFallback/,
        /LAB_DENSITY_PRODUCTION_PROJECTION\.texelSizeMeters/,
        /\{validationCase: caseValue, texelSizeMeters\}/,
        /requireLabDensityPhaseOracle/,
        /captureLabEvidencePng/,
        /rawSha256Hex\(png\.data\)/,
        /authoritativeRgbSha256/,
        /assertLabEvidenceCanvasLifecycle/,
        /validateLabReleaseFixture\(/,
        /static_casters_not_suppressed/,
        /tile_boundary_evidence_missing/,
        /browser_diagnostics/,
        /lab validation failed/
    ]) assert.match(runnerSource, pattern);
    assert.equal(
        (runnerSource.match(
            /window\.__ai531LabValidation\.proveCurrentFallback\(\)/g
        ) ?? []).length,
        1
    );
    assert.doesNotMatch(runnerSource, /fixture\.tileCount !== 4/);
    for (const pattern of [
        /buildIlluminationBinaryPackage/,
        /StaticSunDepthPipeline/,
        /createStableStaticSunDepthBasis/,
        /createSunPointDirectionWorld/,
        /new THREE\.MeshDepthMaterial\(/,
        /depthPacking: THREE\.RGBADepthPacking/,
        /renderer\.readRenderTargetPixels\(/,
        /format: THREE\.RGBAFormat/,
        /type: THREE\.UnsignedByteType/,
        /unpackThreeRgbaDepthBytes/,
        /city\.getStaticSunDepthCasterMeshes\?\.\(\)/,
        /fixtureCasterMeshes\.has\(node\)/,
        /collectAllStaticReceiverDomainLight\(basis\)/,
        /fixtureDomainLightMeters = unionLightDomains\(/,
        /visibleStaticReceiverEvidence\.boundsLightMeters/,
        /findLabDensityDiagnosticCandidate/,
        /createExactRationalLatticePhaseEvidence/,
        /createLiveToCacheVogelRadiusEvidence/,
        /buildProductionStaticSunDepthChunkInputs/,
        /partitionStaticSunDepthLayers/,
        /first-single-chunk-else-minimum-payload-canonical-layer-windows-2x2-through-4x4-v2/,
        /exactRationalLatticePhaseEvidence/,
        /filterRadiusIdentity/,
        /LAB_DENSITY_PRODUCTION_PROJECTION/,
        /productionProjection\.interiorTexelsPerLayer/,
        /finalProductionProjection/,
        /candidatePromotion/,
        /Lab normal layout does not cover caster\/receiver XY domain/,
        /Lab depth encoding does not cover caster\/receiver depth domain/,
        /resolveThreeR183ShadowAlphaTest/,
        /describeStaticSunDepthEffectiveShadowSide/,
        /getStaticSunDepthAuthoredMaterialShadowSide/,
        /authoredShadowSide/,
        /effectiveShadowSide/,
        /ai531-lab-caster-sidedness-receipt-v1/,
        /material\?\.visible !== false/,
        /clearPreexistingWebGlErrors\(\);/,
        /const maximumCombinedTexels = Math\.min\(/,
        /8192/,
        /packageApi\.ILLUMINATION_MAX_CHUNK_BYTES \/ \(4 \* 2\)/,
        /maximumCombinedTexelsFromChunk/,
        /const texelQuantizationMeters = 1 \/ 64;/,
        /const geometricNormalOffsetMeters = samplingBias\.geometricNormalOffsetMeters;/,
        /constantDepthReliefMeters/,
        /geometric-normal-offset-plus-constant-depth-relief-v1/,
        /pcf: samplingPcfWithAxes/,
        /let interiorWidth = interiorSize;/,
        /let interiorHeight = interiorSize;/,
        /encodeStaticSunDepthMeters/,
        /tileCount: \[tileCountX, tileCountY\]/,
        /const layerIndex = tileY \* tileCountX \+ tileX;/,
        /copy-adjacent-clamp-exterior-v1/,
        /indexedDB\.open\('ai531-lab-validation-v1'/,
        /captureCurrent/,
        /captureCache/,
        /captureComparisonAndCompare/,
        /publishEvidenceCapture\('current', capture\)/,
        /publishEvidenceCapture\('cache', cache\)/,
        /publishEvidenceCapture\('comparison', comparison\)/,
        /getEvidenceCanvasState/,
        /releaseEvidenceCanvas/,
        /putImageData/,
        /createLabEvidenceOpaqueRgba/,
        /extractLabEvidenceRgb/,
        /LAB_EVIDENCE_CAPTURE_ALPHA_POLICY/,
        /traceLabResidualTap|traceResidualTap/,
        /traceLabResidualVogelComparisons/,
        /same-bake-packed-rgba-depth-before-rg8-quantization-v1/,
        /targeted-three-r183-native-depth-comparison-binary-search-v5/,
        /owned\.setMode\('current'\)/,
        /Lab pipeline did not commit current mode before profile replacement/,
        /renderer\.compile\(engine\.scene, engine\.camera\)/,
        /captureVisibilityDebugProof/,
        /visibilitySampleSha256/,
        /setDebugMode\('seam'\)/,
        /setDebugMode\('currentDifference'\)/,
        /staticCityShadow/,
        /memory:\/\/ai531-lab-fixture\/corrupt/,
        /dynamicBusOutsideStaticCity/,
        /dynamic_bus_black_white_material_id_difference_v1/,
        /proveDynamicBusLiveShadow/,
        /dynamicBusShadow/,
        /productionEligible: false/,
        /webgl2_live_static_city_depth_test_fixture_v1/
    ]) assert.match(runtimeSource, pattern);
    assert.doesNotMatch(runtimeSource, /candidate\.productionInteriorTexels/);
    assert.doesNotMatch(runtimeSource, /candidate\.productionTileSizeMeters/);
    for (const pattern of [
        /page\.setViewportSize\(\{width: 1280, height: 744\}\)/,
        /expect\(canvasBox\)\.toMatchObject\(\{width: 1280, height: 720\}\)/,
        /createValidationCaptureRecord/,
        /authenticateValidationCaptureSet/,
        /expectedDimensionsPixels: captureDimensionsPixels/,
        /captureLabEvidencePng/,
        /assertLabEvidenceCanvasLifecycle/,
        /VALIDATION_CAPTURE_AUTHENTICATION_METHOD/
        ,/AI531_SIDEDNESS_VALIDATION/
        ,/AI531_RESIDUAL_TAP_TRACE/
        ,/residual_tap_trace_az135_el08_native_depth_v7/
        ,/sidedness_effective_shadow_side_exact_1to1_overview/
        ,/productionEligible: false/
    ]) assert.match(densitySource, pattern);
    assert.doesNotMatch(runnerSource, /locator\('#game-canvas'\)\.screenshot/);
    assert.doesNotMatch(densitySource, /locator\('#game-canvas'\)\.screenshot/);
    assert.ok(
        runtimeSource.indexOf("publishEvidenceCapture('current', capture)")
            > runtimeSource.lastIndexOf('verifyPreparedDensityPhase(validationCase)')
    );
    assert.ok(
        runtimeSource.indexOf("publishEvidenceCapture('comparison', comparison)")
            > runtimeSource.indexOf('await deleteCurrent(validationCase.id)')
    );
    assert.match(
        runtimeSource,
        /cache_luma_gt_current_unmasked_3x3_max_plus_4_bytes_v2/
    );
    const comparisonSource = runtimeSource.slice(
        runtimeSource.indexOf('function compareRgba('),
        runtimeSource.indexOf('function createBusIdMaterial(')
    );
    assert.doesNotMatch(comparisonSource, /Math\.round/);
    for (const pattern of [
        /\.lab-validation-evidence-canvas/,
        /position: fixed/,
        /top: 0/,
        /left: 0/,
        /width: 1280px/,
        /height: 720px/,
        /pointer-events: none/
    ]) assert.match(labStylesSource, pattern);
    assert.doesNotMatch(
        runtimeSource,
        /LAB_EXACT_PACKED_DEPTH_DISCRIMINATOR|setDiagnosticDepthEncodingMode|AI531LabExactThreeR183PackedDepthDiscriminator/
    );
    assert.doesNotMatch(
        densitySource,
        /AI531_STRUCTURAL_DISCRIMINATOR|structural_exact_rgba_depth_1to1_overview|structural-depth-encoding-discriminator/
    );
    for (const pattern of [
        /red \/ 256/,
        /green \/ 65536/,
        /blue \/ 16777216/,
        /alpha \/ 4278190080/
    ]) assert.match(depthPackingSource, pattern);
    assert.doesNotMatch(runtimeSource, /2 \* texelSizeMeters \/ elevationSin/);
    assert.doesNotMatch(runtimeSource, /gl\.DEPTH_COMPONENT|gl\.FLOAT/);
    assert.doesNotMatch(runtimeSource, /blender\.exe|cycles_cpu/);
});

test('headless static server streams exact-length assets over keep-alive connections', async () => {
    const serverSource = await readFile('tests/headless/e2e/static_server.mjs', 'utf8');
    assert.match(serverSource, /createReadStream/);
    assert.match(serverSource, /pipeline\(createReadStream\(diskPath\), res\)/);
    assert.match(serverSource, /'content-length': String\(info\.size\)/);
    assert.match(serverSource, /server\.keepAliveTimeout = 120_000/);
    assert.doesNotMatch(serverSource, /'connection': 'close'/);
});

function makeMetrics(overrides = {}) {
    const pixelsOverFourByte = overrides.pixelsOverFourByte ?? 0;
    const pixelCount = overrides.pixelCount ?? 4;
    const dynamicReceiverPixelCount = overrides.dynamicReceiverPixelCount ?? 0;
    const evaluatedPixelCount = overrides.evaluatedPixelCount
        ?? pixelCount - dynamicReceiverPixelCount;
    return {
        dynamicReceiverMaskMethod: 'dynamic_bus_black_white_material_id_difference_v1',
        dynamicReceiverPixelCount,
        evaluatedPixelCount,
        falseLitMethod: 'cache_luma_gt_current_unmasked_3x3_max_plus_4_bytes_v2',
        height: 2,
        maxContinuousSeamRunPixels: 0,
        maxRgbErrorByte: 0,
        meanRgbErrorByte: 0,
        missingOccluderPixelCount: 0,
        pixelCount,
        pixelsOverFourByte,
        pixelsOverFourBytePercent: pixelsOverFourByte / evaluatedPixelCount * 100,
        seamErrorPixelCount: 0,
        seamFalseLitPixelCount: 0,
        seamMaskMethod: 'static_sun_depth_seam_debug_red_gt_blue_plus_32_v1',
        seamPixelCount: 1,
        width: 2,
        ...overrides
    };
}

function makeDiagnostics(debugMode, casters) {
    return {
        active: {generation: 1},
        debugMode,
        casters,
        runtime: {controller: {state: 'active', effectiveMode: 'baked'}}
    };
}

function makeWorkload(calls, triangles, busCalls = 2, busTriangles = 40) {
    return {
        staticCityShadow: {calls, triangles, lines: 0, points: 0},
        dynamicBusShadow: {
            calls: busCalls,
            triangles: busTriangles,
            lines: 0,
            points: 0
        }
    };
}
