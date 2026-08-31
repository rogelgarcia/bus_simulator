// Node unit tests: AI 357 Grass Lab quality, review, budget, and approval contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    GRASS_LAB_CAMERA_PRESETS,
    GRASS_LAB_DEFAULT_BUDGET,
    GRASS_LAB_LIGHTING_PRESETS,
    GRASS_LAB_MOTION_PATHS,
    GRASS_LAB_QUALITY_PRESETS,
    GRASS_LAB_REQUIRED_CAMERA_IDS,
    GRASS_LAB_REQUIRED_REGRESSIONS,
    GRASS_LAB_V2_APPROVAL_SCOPE,
    GRASS_LAB_V2_PERFORMANCE_OWNERSHIP,
    GRASS_LAB_V2_REQUIRED_CAMERA_IDS,
    GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS,
    GRASS_LAB_V2_REQUIRED_LIGHTING_IDS,
    GRASS_LAB_V2_REQUIRED_MOTION_PATH_IDS,
    GRASS_LAB_V2_REQUIRED_PERFORMANCE_SAMPLE_IDS,
    GRASS_LAB_V2_REQUIRED_REGRESSIONS,
    applyGrassLabQualityPreset,
    createGrassLabApprovalRecord,
    createGrassLabV2ApprovalRecord,
    evaluateGrassLabBudget,
    evaluateGrassLabV2VisualFunctionalApproval,
    evaluateGrassPerformanceMeasurement,
    summarizeGrassTimingSamples
} from '../../../src/app/grass/GrassLabValidationContract.js';
import { createGrassLabEngineConfig } from '../../../src/graphics/gui/grass_debugger/GrassLabContract.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const makeSnapshot = ({
    cpu = 0.2,
    gpu = 1.1,
    draws = 5,
    triangles = 50000,
    coverageTriangles = 0,
    coverageDraws = 0,
    beyond = 0
} = {}) => ({
    grass: { updateCpuMs: cpu, logicalDrawCalls: draws, triangles },
    coverage: { triangles: coverageTriangles, logicalDrawCalls: coverageDraws },
    frame: { gpuMs: gpu },
    lod: { geometryBeyondCutoff: beyond }
});

const makePerformanceMeasurement = ({
    cpuMs = 0.4,
    gpuMs = 1.2,
    gpuSupported = true,
    hardwareAccelerated = true
} = {}) => ({
    status: 'complete',
    warmup: { frames: 120, durationMs: 2000, stableZeroUploadFrames: 30 },
    cpu: { samplesMs: Array.from({ length: 120 }, () => cpuMs) },
    frame: { samplesMs: Array.from({ length: 120 }, () => 16) },
    gpu: {
        supported: gpuSupported,
        backend: gpuSupported ? 'webgl2_ext_disjoint_timer_query' : 'unsupported',
        active: gpuSupported,
        disjointCount: 0,
        notMeasuredReason: gpuSupported ? null : 'EXT_disjoint_timer_query_webgl2 unavailable',
        samples: gpuSupported
            ? Array.from({ length: 30 }, (_, index) => ({
                sequence: index + 1,
                submissionSequence: index + 1,
                ms: gpuMs
            }))
            : []
    },
    graphics: { hardwareAccelerated },
    bufferUpdates: { samples: Array.from({ length: 120 }, () => 0) }
});

const makeV2ApprovalInput = () => {
    const boundarySignature = 'grass-coverage-v2-ai362';
    const performanceMeasurements = GRASS_LAB_V2_REQUIRED_PERFORMANCE_SAMPLE_IDS.map((sampleId) => ({
        sampleId,
        performanceGate: evaluateGrassPerformanceMeasurement(makePerformanceMeasurement({ gpuMs: 2.5 }))
    }));
    return {
        generatedAt: '2026-08-31T00:00:00.000Z',
        approvedBy: 'AI 362 scoped validation',
        qualityPreset: 'default',
        snapshotContractVersion: 10,
        reviewedCameraIds: GRASS_LAB_V2_REQUIRED_CAMERA_IDS,
        reviewedLightingIds: GRASS_LAB_V2_REQUIRED_LIGHTING_IDS,
        reviewedMotionPathIds: GRASS_LAB_V2_REQUIRED_MOTION_PATH_IDS,
        reviewedEvidenceIds: GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS,
        regressions: Object.fromEntries(GRASS_LAB_V2_REQUIRED_REGRESSIONS.map((id) => [id, true])),
        diagnostics: {
            autoLod: {
                schema: 'bus-simulator.grass-auto-lod',
                version: 2,
                force: 'auto',
                forceValues: ['auto', 'near', 'billboard', 'middle', 'texture'],
                weights: { near: 0.5, billboard: 0.5, middle: 0, texture: 0 },
                nearEndMeters: 3,
                billboardEndMeters: 8,
                middleEndMeters: 25,
                transitionWidthMeters: 2,
                hysteresisMeters: 0.75,
                angle: {
                    grazingDeg: 12,
                    topDownDeg: 70,
                    grazingDistanceScale: 0.8,
                    topDownDistanceScale: 1.2
                },
                transitionSamples: [
                    {
                        state: 'near_to_billboard',
                        progress: 0.5,
                        weights: { near: 0.5, billboard: 0.5, middle: 0, texture: 0 }
                    },
                    {
                        state: 'billboard_to_middle',
                        progress: 0.5,
                        weights: { near: 0, billboard: 0.5, middle: 0.5, texture: 0 }
                    },
                    {
                        state: 'middle_to_texture',
                        progress: 0.5,
                        weights: { near: 0, billboard: 0, middle: 0.5, texture: 0.5 }
                    }
                ],
                geometryBeyondCutoff: 0
            },
            nearCarpet: {
                schema: 'near-grass-carpet-v2',
                coverageMode: 'exact_polygon_v2',
                boundarySignature,
                placementSignature: 'near-carpet-v2-ai362',
                ownershipCellSizeMeters: 1,
                rootBinsPerSquareMeter: 64,
                fibersPerRoot: 3,
                candidateBins: 1024,
                eligibleBins: 960,
                representedBins: 960,
                unrepresentedEligibleBins: 0,
                eligibleAreaSquareMeters: 15,
                representedAreaSquareMeters: 15,
                rejectedByKind: { sidewalk: 48, tree_base: 16 },
                exactPostcheckFailures: 0,
                materialId: 'pbr.grass_low_cut_maintained_v2',
                appearanceSource: 'ai358_shared_catalog',
                materialPaths: 1,
                transparent: false,
                depthWrite: true,
                emissive: false,
                stationaryUploadsZero: true
            },
            field: {
                schema: 'bus-simulator.grass-cohesive-field-renderer',
                version: 2,
                coverageMode: 'exact_polygon',
                boundarySignature,
                placementSignature: 'cohesive-field-v2-ai362',
                ownershipCellSizeMeters: 1,
                sharedWorldAlignedLayout: true,
                complementarySamples: true,
                candidateUnits: 1000,
                eligibleUnits: 900,
                representedUnits: 900,
                unrepresentedEligibleUnits: 0,
                eligibleAreaSquareMeters: 900,
                representedAreaSquareMeters: 900,
                rejectedByKind: { sidewalk: 80, tree_base: 20 },
                exactPostcheckFailures: 0,
                exactEnvelopeFailures: 0,
                transitionUnits: 12,
                overlapUnits: 4,
                geometryBeyondCutoff: 0,
                lastBufferUpdates: 0,
                billboard: {
                    candidateUnits: 1000,
                    eligibleUnits: 700,
                    representedUnits: 700,
                    unrepresentedEligibleUnits: 0,
                    eligibleAreaSquareMeters: 700,
                    representedAreaSquareMeters: 700,
                    exactEnvelopeFailures: 0,
                    cardsPerUnit: 1
                },
                middle: {
                    candidateUnits: 1000,
                    eligibleUnits: 700,
                    representedUnits: 700,
                    unrepresentedEligibleUnits: 0,
                    eligibleAreaSquareMeters: 700,
                    representedAreaSquareMeters: 700,
                    exactEnvelopeFailures: 0,
                    cardsPerUnit: 2
                },
                handoffs: [
                    'near_to_billboard',
                    'billboard_to_middle',
                    'middle_to_texture'
                ].map((id) => ({
                    id,
                    sharedSamples: true,
                    complementary: true,
                    outgoingUnits: 48,
                    incomingUnits: 48,
                    transitionUnits: 12,
                    overlapUnits: 4,
                    unrepresentedEligibleUnits: 0,
                    bothHiddenUnits: 0,
                    nonAdjacentOverlapUnits: 0
                })),
                material: {
                    atlasRole: 'midCluster',
                    resolvedMaterialId: 'pbr.grass_low_cut_maintained_v2',
                    materialPaths: 1,
                    alphaCutoff: 0.35,
                    alphaToCoverage: true,
                    transparent: false,
                    alphaLayoutPolicy: 'separate_alpha_map',
                    alphaLayoutChannel: 'green',
                    normalPolicy: 'world_up_blend',
                    worldUpBlend: 1,
                    emissiveIntensity: 0,
                    globalLoaderCalibrated: true,
                    sharedByBillboardAndMiddle: true,
                    atlasMaps: [
                        'midClusterColor',
                        'midClusterCoverage',
                        'midClusterNormal',
                        'midClusterRoughness',
                        'midClusterAo'
                    ]
                }
            },
            accent: {
                schema: 'bus-simulator.grass-localized-accents',
                version: 2,
                coverageMode: 'exact_polygon',
                substrateOwnership: 'coverage_tree_hole',
                weightPolicy: '1_minus_texture_weight',
                boundarySignature,
                placementSignature: 'grass-accents-v2-ai362',
                candidateRoots: 24,
                eligibleRoots: 16,
                representedRoots: 16,
                unrepresentedEligibleRoots: 0,
                rejectedByKind: { sidewalk: 4, tree_base: 4 },
                exactPostcheckFailures: 0,
                exactEnvelopeFailures: 0,
                cardsPerCluster: 2,
                clustersPerTree: 4,
                wornPatches: 0,
                wornTriangles: 0,
                wornDrawCalls: 0,
                wornMaterialPaths: 0,
                stationaryUploadsZero: true,
                material: {
                    atlasRole: 'accentClump',
                    resolvedMaterialId: 'pbr.grass_low_cut_maintained_v2',
                    materialPaths: 1,
                    alphaCutoff: 0.35,
                    alphaToCoverage: true,
                    transparent: false,
                    depthWrite: true,
                    alphaLayoutPolicy: 'separate_alpha_map',
                    alphaLayoutChannel: 'green',
                    normalPolicy: 'world_up_blend',
                    worldUpBlend: 1,
                    emissiveIntensity: 0,
                    globalLoaderCalibrated: true,
                    atlasMaps: [
                        'accentClumpColor',
                        'accentClumpCoverage',
                        'accentClumpNormal',
                        'accentClumpRoughness',
                        'accentClumpAo'
                    ]
                }
            },
            coverage: {
                sourceLoopIdentity: 'road-engine:ai362-source-loops',
                roadEngineSourceLoopIdentity: 'road-engine:ai362-source-loops',
                boundarySignature,
                boundarySignatureStable: true,
                signedDistanceOrientation: 'positive_grass_negative_exclusion',
                occupiedSamples: 96,
                excludedSamples: 96,
                rootEligibleSamples: 96,
                grassOnsetWidthMeters: 0.08,
                grassOnsetWidthMaxMeters: 0.08,
                sidewalkOnsetDistanceMinMeters: 0.08,
                sidewalkOnsetDistanceMaxMeters: 0.08,
                treeSubstrateRevealMinMeters: 0.18,
                treeSubstrateRevealMaxMeters: 0.18,
                structuralBaseHeightMeters: 0.0275,
                visibleBladeTipMinMeters: 0.04,
                visibleBladeTipMaxMeters: 0.075,
                antialiasWidthMeters: 0.012,
                rootClearanceMeters: 0.003,
                diagonalSegments: 8,
                curvedSegments: 24,
                insideCorners: 1,
                outsideCorners: 1,
                treeBaseSegments: 24,
                hardExclusionIntrusions: 0,
                grassOnsetIntrusions: 0,
                ineligibleCutEdgeRoots: 0,
                opaqueCap: true,
                transparentSurface: false,
                alphaTestedSurface: false,
                logicalDrawCalls: 2
            },
            structural: {
                trianglesByTier: {
                    boundary: 95_219,
                    near: 48_000,
                    billboard: 1_400,
                    middle: 2_800,
                    accent: 16
                },
                drawCallsByTier: {
                    boundary: 2,
                    near: 2,
                    billboard: 1,
                    middle: 1,
                    accent: 1
                },
                combinedVisibleGrassTriangles: 147_435,
                combinedVisibleGrassLogicalDrawCalls: 7,
                geometryBeyondCutoff: 0,
                stationaryBufferUpdates: 0
            }
        },
        captureEvidence: {
            drawingBuffer: { width: 3840, height: 2160 },
            pixelRatio: 1,
            actualDrawingBuffer: true,
            format: 'png',
            lossless: true,
            imageDimensionsVerified: true,
            imageCount: 96,
            stateMetadataComplete: true,
            uiFreeVisuals: true,
            separateDiagnosticOverlays: true,
            matchedBeforeAfter: true
        },
        performanceMeasurements,
        gameplayTouched: false
    };
};

test('quality presets make automatic LOD explicit and low fails gracefully to coverage texture', () => {
    assert.deepEqual(Object.keys(GRASS_LAB_QUALITY_PRESETS), ['low', 'default', 'high']);
    assert.equal(GRASS_LAB_QUALITY_PRESETS.low.nearRadiusMeters, GRASS_LAB_QUALITY_PRESETS.default.nearRadiusMeters);
    assert.ok(GRASS_LAB_QUALITY_PRESETS.default.nearRadiusMeters < GRASS_LAB_QUALITY_PRESETS.high.nearRadiusMeters);
    assert.equal(GRASS_LAB_QUALITY_PRESETS.low.clusterRadiusMeters, GRASS_LAB_QUALITY_PRESETS.default.clusterRadiusMeters);
    assert.ok(GRASS_LAB_QUALITY_PRESETS.default.clusterRadiusMeters < GRASS_LAB_QUALITY_PRESETS.high.clusterRadiusMeters);

    const low = applyGrassLabQualityPreset({}, 'low');
    assert.equal(low.autoLod.force, 'auto');
    assert.equal(low.coverage.enabled, true);
    assert.equal(low.coverage.showSurface, true);
    assert.equal(low.coverage.showLip, true);
    assert.equal(low.lod1.enabled, false);
    assert.equal(low.lod2.enabled, false);
    assert.equal(low.accents.enabled, false);
    assert.equal(low.lod3.enabled, true);
    const lowEngine = createGrassLabEngineConfig(low);
    assert.equal(lowEngine.enabled, false, 'Low quality intentionally leaves the separate hard coverage surface as texture-only grass');

    const approvedDefault = applyGrassLabQualityPreset({}, 'default');
    assert.equal(approvedDefault.lod2.billboardCardsPerUnit, 1);
    assert.equal(approvedDefault.lod2.middleCardsPerUnit, 2);

    const high = applyGrassLabQualityPreset({}, 'high');
    assert.equal(high.autoLod.force, 'auto');
    assert.equal(high.lod1.enabled, true);
    assert.equal(high.lod2.enabled, true);
    assert.equal(high.accents.clustersPerTree, 6);
    assert.equal(high.coverage.densityMultiplier, 1.25);
});

test('camera, pose, lighting, and motion catalogs cover the complete approval ladder', () => {
    const byId = Object.fromEntries(GRASS_LAB_CAMERA_PRESETS.map((preset) => [preset.id, preset]));
    for (const id of GRASS_LAB_REQUIRED_CAMERA_IDS) assert.ok(byId[id], `Missing required camera ${id}`);
    assert.equal(byId.height_030.heightMeters, 0.3);
    assert.deepEqual(
        ['height_050', 'height_100', 'height_150', 'height_200', 'height_300', 'height_500'].map((id) => byId[id].heightMeters),
        [0.5, 1, 1.5, 2, 3, 5]
    );
    assert.equal(byId.gameplay_bus.pose, 'gameplay');
    assert.equal(byId.top_down.pose, 'top_down');
    assert.equal(byId.far_texture.pose, 'far');
    assert.deepEqual(Object.keys(GRASS_LAB_LIGHTING_PRESETS), ['daylight', 'overcast', 'golden', 'night']);
    assert.deepEqual(Object.keys(GRASS_LAB_MOTION_PATHS), ['stationary', 'forward', 'reverse', 'strafe', 'flyover']);
});

test('budget evaluation is deterministic, keeps GPU availability explicit, and catches major regressions', () => {
    assert.equal(GRASS_LAB_DEFAULT_BUDGET.typicalTriangles, 50_000);
    assert.equal(GRASS_LAB_DEFAULT_BUDGET.combinedVisibleGrassTriangles, 200_000);
    assert.ok(
        GRASS_LAB_DEFAULT_BUDGET.typicalTriangles
        < GRASS_LAB_DEFAULT_BUDGET.combinedVisibleGrassTriangles
    );

    const samples = [
        makeSnapshot(),
        makeSnapshot({ cpu: 0.4, gpu: 1.3, triangles: 49_000, coverageTriangles: 120_000 })
    ];
    const first = evaluateGrassLabBudget(samples);
    const second = evaluateGrassLabBudget(samples);
    assert.deepEqual(first, second);
    assert.equal(first.pass, true);
    assert.equal(first.measurements.averageCpuMs, 0.3);
    assert.equal(first.measurements.averageGpuMs, 1.2);
    assert.equal(first.measurements.maximumTriangles, 50000);
    assert.equal(first.measurements.maximumCombinedVisibleGrassTriangles, 169000);

    const boundaryInclusiveDrawOverflow = evaluateGrassLabBudget(makeSnapshot({
        draws: 12,
        coverageDraws: 2
    }));
    assert.equal(boundaryInclusiveDrawOverflow.checks.hardDrawCeiling, false);
    assert.equal(boundaryInclusiveDrawOverflow.pass, false);

    const overPracticalHierarchyTarget = evaluateGrassLabBudget(makeSnapshot({
        triangles: 50_001,
        coverageTriangles: 100_000
    }));
    assert.equal(overPracticalHierarchyTarget.checks.triangles, false);
    assert.equal(overPracticalHierarchyTarget.checks.combinedTriangles, true);
    assert.equal(overPracticalHierarchyTarget.pass, false);

    const overCombinedHardCeiling = evaluateGrassLabBudget(makeSnapshot({
        triangles: 50_000,
        coverageTriangles: 150_001
    }));
    assert.equal(overCombinedHardCeiling.checks.triangles, true);
    assert.equal(overCombinedHardCeiling.checks.combinedTriangles, false);
    assert.equal(overCombinedHardCeiling.pass, false);

    const noGpu = evaluateGrassLabBudget(makeSnapshot({ gpu: null }));
    assert.equal(noGpu.gpuTimingSupported, false);
    assert.equal(noGpu.checks.gpu, null);
    assert.equal(noGpu.pass, true, 'Unsupported GPU timing is documented, not treated as a universal hardware failure');

    const regression = evaluateGrassLabBudget(makeSnapshot({ cpu: 0.8, gpu: 2.2, draws: 13, triangles: 240000, beyond: 1 }));
    assert.equal(regression.pass, false);
    assert.equal(regression.checks.cpu, false);
    assert.equal(regression.checks.hardDrawCeiling, false);
    assert.equal(regression.checks.triangles, false);
    assert.equal(regression.checks.cutoff, false);
});

test('raw performance measurement reports deterministic mean, median, p95, count, and enforces hard timing gates', () => {
    assert.deepEqual(summarizeGrassTimingSamples([0, 1, 2, 3]), {
        meanMs: 1.5,
        medianMs: 1.5,
        p95Ms: 3,
        maxMs: 3,
        sampleCount: 4
    });

    const passing = evaluateGrassPerformanceMeasurement(makePerformanceMeasurement());
    assert.equal(passing.statistic, 'arithmetic_mean');
    assert.equal(passing.measurements.cpu.sampleCount, 120);
    assert.equal(passing.measurements.cpu.meanMs, 0.4);
    assert.equal(passing.measurements.gpu.sampleCount, 30);
    assert.equal(passing.measurements.gpu.meanMs, 1.2);
    assert.equal(passing.measurements.frame.medianMs, 16);
    assert.equal(passing.measurements.frame.p95Ms, 16);
    assert.equal(passing.pass, true);

    assert.equal(
        evaluateGrassPerformanceMeasurement(makePerformanceMeasurement({ cpuMs: 0.600001 })).pass,
        false
    );
    assert.equal(
        evaluateGrassPerformanceMeasurement(makePerformanceMeasurement({ gpuMs: 1.500001 })).pass,
        false
    );

    const duplicateGpuSequence = makePerformanceMeasurement();
    duplicateGpuSequence.gpu.samples[1].sequence = 1;
    assert.equal(evaluateGrassPerformanceMeasurement(duplicateGpuSequence).checks.gpuSequenceIntegrity, false);
    assert.equal(evaluateGrassPerformanceMeasurement(duplicateGpuSequence).pass, false);

    const unsupported = evaluateGrassPerformanceMeasurement(makePerformanceMeasurement({ gpuSupported: false }));
    assert.equal(unsupported.gpuTimingSupported, false);
    assert.equal(unsupported.checks.gpuMean, null);
    assert.equal(unsupported.pass, true);

    const missingReason = makePerformanceMeasurement({ gpuSupported: false });
    missingReason.gpu.notMeasuredReason = null;
    assert.equal(evaluateGrassPerformanceMeasurement(missingReason).pass, false);

    assert.equal(
        evaluateGrassPerformanceMeasurement(makePerformanceMeasurement({ hardwareAccelerated: false })).pass,
        false
    );
});

test('approval stays pending until budget, views, paths, stress, regressions, and no-gameplay gate all pass', () => {
    const budgetResult = evaluateGrassLabBudget(makeSnapshot());
    const regressions = Object.fromEntries(GRASS_LAB_REQUIRED_REGRESSIONS.map((id) => [id, true]));
    const complete = createGrassLabApprovalRecord({
        generatedAt: '2026-08-29T00:00:00.000Z',
        qualityPreset: 'default',
        budgetResult,
        reviewedCameraIds: GRASS_LAB_REQUIRED_CAMERA_IDS,
        reviewedLightingIds: Object.keys(GRASS_LAB_LIGHTING_PRESETS),
        reviewedMotionPathIds: Object.keys(GRASS_LAB_MOTION_PATHS),
        regressions,
        stress: { completed: true, pass: true },
        gameplayTouched: false
    });
    assert.equal(complete.status, 'approved');
    assert.equal(complete.approved, true);
    assert.deepEqual(complete.missingRegressions, []);

    const incomplete = createGrassLabApprovalRecord({ qualityPreset: 'default', budgetResult, regressions });
    assert.equal(incomplete.status, 'pending');
    assert.ok(incomplete.reviewCoverage.missingCameras.length > 0);
    assert.ok(incomplete.reviewCoverage.missingLighting.length > 0);
});

test('V2 review catalogs add the 0.30 m view and complete AI 362 camera, light, path, and evidence ladders', () => {
    assert.equal(GRASS_LAB_V2_APPROVAL_SCOPE, 'visual_functional_motion_determinism');
    assert.deepEqual(GRASS_LAB_V2_PERFORMANCE_OWNERSHIP, {
        status: 'deferred_to_ai537',
        ownerPrompt: 'AI537'
    });
    assert.equal(GRASS_LAB_REQUIRED_CAMERA_IDS.includes('height_030'), false);
    assert.equal(GRASS_LAB_V2_REQUIRED_CAMERA_IDS.includes('height_030'), true);
    for (const id of [
        'height_030',
        'height_050',
        'height_100',
        'height_150',
        'height_200',
        'height_300',
        'height_500',
        'near_grazing',
        'near_forward',
        'near_oblique',
        'gameplay_bus',
        'close_billboard_handoff',
        'billboard_middle_handoff',
        'middle_texture_handoff',
        'top_down',
        'far_texture'
    ]) {
        assert.ok(GRASS_LAB_V2_REQUIRED_CAMERA_IDS.includes(id), `Missing V2 camera evidence id ${id}`);
    }
    assert.deepEqual(GRASS_LAB_V2_REQUIRED_LIGHTING_IDS, ['daylight', 'overcast', 'golden', 'night']);
    assert.deepEqual(
        GRASS_LAB_V2_REQUIRED_MOTION_PATH_IDS,
        ['stationary', 'forward', 'reverse', 'strafe', 'flyover']
    );
    for (const id of [
        'straight_sidewalk',
        'curved_sidewalk',
        'diagonal_cut',
        'inside_corner',
        'outside_corner',
        'irregular_cut',
        'low_side_profile',
        'exposed_substrate',
        'tree_base',
        'tree_substrate',
        'texture_only_fallback',
        'geometry_disabled_fallback'
    ]) {
        assert.ok(GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS.includes(id), `Missing V2 scene evidence id ${id}`);
    }
    assert.equal(Object.isFrozen(GRASS_LAB_V2_REQUIRED_CAMERA_IDS), true);
    assert.equal(Object.isFrozen(GRASS_LAB_V2_REQUIRED_REGRESSIONS), true);
});

test('V2 record approves only visual-functional scope while preserving every failed timing row for AI 537', () => {
    const input = makeV2ApprovalInput();
    assert.equal(input.performanceMeasurements.every((row) => row.performanceGate.pass === false), true);

    const evaluation = evaluateGrassLabV2VisualFunctionalApproval(input);
    assert.equal(evaluation.pass, true);
    assert.deepEqual(evaluation.failedChecks, []);
    assert.equal(evaluation.performancePassRequired, false);
    assert.equal(evaluation.performanceMeasurementsRecorded, true);
    assert.equal(evaluation.performanceResults.every((row) => row.measuredPass === false), true);

    const record = createGrassLabV2ApprovalRecord(input);
    assert.equal(record.schema, 'grass-lab-approval-v2');
    assert.equal(record.status, 'approved');
    assert.equal(record.approved, true);
    assert.equal(record.approvalScope, 'visual_functional_motion_determinism');
    assert.equal(record.performanceStatus, 'deferred_to_ai537');
    assert.deepEqual(record.performanceOwnership, {
        status: 'deferred_to_ai537',
        ownerPrompt: 'AI537'
    });
    assert.equal(record.performancePassRequired, false);
    assert.equal(record.performanceMeasurements.every((row) => row.performanceGate.pass === false), true);
    assert.equal(record.performance.status, 'deferred_to_ai537');
    assert.deepEqual(record.performance.ownership, {
        status: 'deferred_to_ai537',
        ownerPrompt: 'AI537'
    });
    assert.equal(record.performance.passRequired, false);
    assert.deepEqual(record.performance.measurements, record.performanceMeasurements);
    assert.equal(record.authorization.gameplayAuthorized, false);
    assert.equal(record.authorization.requiredPerformancePrompt, 'AI537');
    assert.equal(record.gameplayTouched, false);
    assert.deepEqual(record.reviewCoverage.missingCameras, []);
    assert.deepEqual(record.reviewCoverage.missingLighting, []);
    assert.deepEqual(record.reviewCoverage.missingPaths, []);
    assert.deepEqual(record.reviewCoverage.missingEvidence, []);
    assert.deepEqual(record.missingRegressions, []);
    assert.deepEqual(record.missingPerformanceSamples, []);

    input.diagnostics.nearCarpet.rootBinsPerSquareMeter = 1;
    input.performanceMeasurements[0].performanceGate.pass = true;
    assert.equal(record.diagnostics.nearCarpet.rootBinsPerSquareMeter, 64);
    assert.equal(record.performanceMeasurements[0].performanceGate.pass, false);
});

test('V2 visual-functional approval fails closed on every review, exact-contract, structural, capture, and no-gameplay gate', () => {
    const mutations = [
        ['0.30 m camera', 'cameraEvidence', (input) => {
            input.reviewedCameraIds = input.reviewedCameraIds.filter((id) => id !== 'height_030');
        }],
        ['night lighting', 'lightingEvidence', (input) => {
            input.reviewedLightingIds = input.reviewedLightingIds.filter((id) => id !== 'night');
        }],
        ['reverse motion', 'motionEvidence', (input) => {
            input.reviewedMotionPathIds = input.reviewedMotionPathIds.filter((id) => id !== 'reverse');
        }],
        ['irregular cut evidence', 'requiredEvidence', (input) => {
            input.reviewedEvidenceIds = input.reviewedEvidenceIds.filter((id) => id !== 'irregular_cut');
        }],
        ['pixel regression', 'regressions', (input) => {
            input.regressions.isolated_bright_points = false;
        }],
        ['snapshot contract', 'snapshotContractV10', (input) => {
            input.snapshotContractVersion = 9;
        }],
        ['automatic primary', 'automaticLodPrimary', (input) => {
            input.diagnostics.autoLod.force = 'near';
        }],
        ['AutoLOD identity', 'autoLodIdentity', (input) => {
            input.diagnostics.autoLod.version = 1;
        }],
        ['AutoLOD forces', 'autoLodForceValues', (input) => {
            input.diagnostics.autoLod.forceValues.push('cluster');
        }],
        ['AutoLOD weights', 'autoLodWeights', (input) => {
            input.diagnostics.autoLod.weights.texture = 0.2;
        }],
        ['AutoLOD thresholds', 'autoLodThresholds', (input) => {
            input.diagnostics.autoLod.billboardEndMeters = 9;
        }],
        ['AutoLOD transition sample', 'autoLodTransitions', (input) => {
            input.diagnostics.autoLod.transitionSamples.pop();
        }],
        ['AutoLOD angles', 'autoLodAngles', (input) => {
            input.diagnostics.autoLod.angle.topDownDeg = 69;
        }],
        ['near coverage mode', 'nearExactCoverage', (input) => {
            input.diagnostics.nearCarpet.coverageMode = 'rectangle_compatibility';
        }],
        ['near root density', 'nearCanonicalDensity', (input) => {
            input.diagnostics.nearCarpet.rootBinsPerSquareMeter = 63;
        }],
        ['near fibers', 'nearCanonicalDensity', (input) => {
            input.diagnostics.nearCarpet.fibersPerRoot = 2;
        }],
        ['near complete bins', 'nearCompleteBins', (input) => {
            input.diagnostics.nearCarpet.unrepresentedEligibleBins = 1;
        }],
        ['near postcheck', 'nearExactDiagnostics', (input) => {
            input.diagnostics.nearCarpet.exactPostcheckFailures = 1;
        }],
        ['near material', 'nearMaterial', (input) => {
            input.diagnostics.nearCarpet.emissive = true;
        }],
        ['field exact layout', 'fieldExactCoverage', (input) => {
            input.diagnostics.field.ownershipCellSizeMeters = 2;
        }],
        ['field complete units', 'fieldCompleteUnits', (input) => {
            input.diagnostics.field.unrepresentedEligibleUnits = 1;
        }],
        ['field envelope', 'fieldExactDiagnostics', (input) => {
            input.diagnostics.field.exactEnvelopeFailures = 1;
        }],
        ['field tier envelope', 'fieldTierCoverage', (input) => {
            input.diagnostics.field.billboard.exactEnvelopeFailures = 1;
        }],
        ['field handoff gap', 'fieldHandoffs', (input) => {
            input.diagnostics.field.handoffs[0].bothHiddenUnits = 1;
        }],
        ['field cards', 'fieldCards', (input) => {
            input.diagnostics.field.middle.cardsPerUnit = 1;
        }],
        ['field material', 'fieldMaterial', (input) => {
            input.diagnostics.field.material.atlasMaps =
                input.diagnostics.field.material.atlasMaps.filter((id) => id !== 'midClusterCoverage');
        }],
        ['accent ownership', 'accentExactCoverage', (input) => {
            input.diagnostics.accent.substrateOwnership = 'worn_disc';
        }],
        ['accent complete roots', 'accentCompleteRoots', (input) => {
            input.diagnostics.accent.unrepresentedEligibleRoots = 1;
        }],
        ['accent exact root', 'accentExactDiagnostics', (input) => {
            input.diagnostics.accent.exactPostcheckFailures = 1;
        }],
        ['accent cards', 'accentCards', (input) => {
            input.diagnostics.accent.cardsPerCluster = 3;
        }],
        ['worn cost', 'accentNoWornCost', (input) => {
            input.diagnostics.accent.wornTriangles = 2;
        }],
        ['accent material', 'accentMaterial', (input) => {
            input.diagnostics.accent.material.worldUpBlend = 0;
        }],
        ['RoadEngine source', 'boundarySourceIdentity', (input) => {
            input.diagnostics.coverage.roadEngineSourceLoopIdentity = 'different-loop';
        }],
        ['shared boundary signature', 'boundarySignatureShared', (input) => {
            input.diagnostics.field.boundarySignature = 'different-boundary';
        }],
        ['signed distance', 'boundarySignedDistance', (input) => {
            input.diagnostics.coverage.signedDistanceOrientation = 'negative_grass';
        }],
        ['substrate reveal', 'boundaryReveal', (input) => {
            input.diagnostics.coverage.grassOnsetWidthMeters = 0.101;
        }],
        ['structural base', 'boundaryDimensions', (input) => {
            input.diagnostics.coverage.structuralBaseHeightMeters = 0.031;
        }],
        ['boundary topology', 'boundaryTopology', (input) => {
            input.diagnostics.coverage.insideCorners = 0;
        }],
        ['hard exclusion', 'boundaryHardExclusions', (input) => {
            input.diagnostics.coverage.hardExclusionIntrusions = 1;
        }],
        ['boundary draws', 'boundaryOpaqueBatch', (input) => {
            input.diagnostics.coverage.logicalDrawCalls = 3;
        }],
        ['boundary reference triangles', 'structuralBoundaryReference', (input) => {
            input.diagnostics.structural.trianglesByTier.boundary = 95_218;
            input.diagnostics.structural.combinedVisibleGrassTriangles = 147_434;
        }],
        ['combined triangle ceiling', 'structuralTriangleCeiling', (input) => {
            input.diagnostics.structural.trianglesByTier.near = 100_000;
            input.diagnostics.structural.combinedVisibleGrassTriangles = 200_001;
        }],
        ['combined draw ceiling', 'structuralDrawCeiling', (input) => {
            input.diagnostics.structural.drawCallsByTier.near = 8;
            input.diagnostics.structural.combinedVisibleGrassLogicalDrawCalls = 13;
        }],
        ['cutoff geometry', 'geometryCutoff', (input) => {
            input.diagnostics.autoLod.geometryBeyondCutoff = 1;
        }],
        ['stationary uploads', 'stationaryUploads', (input) => {
            input.diagnostics.structural.stationaryBufferUpdates = 1;
        }],
        ['native 4K', 'native4kCapture', (input) => {
            input.captureEvidence.drawingBuffer.width = 3839;
        }],
        ['lossless PNG', 'losslessPngCapture', (input) => {
            input.captureEvidence.format = 'jpeg';
        }],
        ['capture metadata', 'captureTraceability', (input) => {
            input.captureEvidence.stateMetadataComplete = false;
        }],
        ['performance evidence row', 'performanceMeasurementsRecorded', (input) => {
            input.performanceMeasurements.pop();
        }],
        ['gameplay isolation', 'noGameplayChanges', (input) => {
            input.gameplayTouched = true;
        }]
    ];

    for (const [label, expectedFailedCheck, mutate] of mutations) {
        const input = structuredClone(makeV2ApprovalInput());
        mutate(input);
        const evaluation = evaluateGrassLabV2VisualFunctionalApproval(input);
        assert.equal(evaluation.pass, false, label);
        assert.ok(evaluation.failedChecks.includes(expectedFailedCheck), `${label}: expected ${expectedFailedCheck}`);
        const record = createGrassLabV2ApprovalRecord(input);
        assert.equal(record.status, 'pending', label);
        assert.equal(record.authorization.gameplayAuthorized, false, label);
    }
});

test('AI 357 validation remains isolated to the Grass Lab and exposes repeatable automation hooks', () => {
    const main = readFileSync(`${REPO_ROOT}/src/graphics/gui/grass_debugger/main.js`, 'utf8');
    const view = readFileSync(`${REPO_ROOT}/src/graphics/gui/grass_debugger/view/GrassDebuggerView.js`, 'utf8');
    const gameplay = readFileSync(`${REPO_ROOT}/src/states/GameplayState.js`, 'utf8');
    assert.match(main, /getValidationDiagnostics/);
    assert.match(main, /focusCamera/);
    assert.match(main, /runStress/);
    assert.match(view, /_updateValidationMotion/);
    assert.match(view, /setValidationDiagnostics/);
    assert.doesNotMatch(gameplay, /GrassLabValidationContract|GrassNearCarpetSystem|GrassMidClusterSystem|GrassLocalizedAccentSystem/);
});

test('AI 357 record remains complete historical V1 evidence but cannot authorize gameplay', () => {
    const record = JSON.parse(readFileSync(`${REPO_ROOT}/specs/grass/GRASS_LAB_APPROVAL_AI357.json`, 'utf8'));
    assert.equal(record.status, 'approved');
    assert.equal(record.approved, true);
    assert.equal(record.authorization.status, 'superseded');
    assert.equal(record.authorization.gameplayAuthorized, false);
    assert.equal(record.authorization.replacementRecord, 'specs/grass/GRASS_LAB_APPROVAL_AI362.json');
    assert.equal(record.gameplayTouched, false);
    assert.equal(record.budgetResult.pass, true);
    assert.equal(record.budgetResult.measurements.maximumDrawCalls <= 12, true);
    assert.equal(record.budgetResult.measurements.maximumTriangles <= 100000, true);
    assert.deepEqual(record.missingRegressions, []);
    assert.deepEqual(record.reviewCoverage.missingCameras, []);
    assert.deepEqual(record.reviewCoverage.missingLighting, []);
    assert.deepEqual(record.reviewCoverage.missingPaths, []);
    assert.equal(record.screenshotDirectory, 'tests/artifacts/screens/grass/ai357');
    const localEvidenceDirectory = `${REPO_ROOT}/${record.screenshotDirectory}`;
    if (existsSync(localEvidenceDirectory)) {
        for (const file of [
            '01_height_030m_daylight_close_grazing.jpg',
            '02_height_050m_golden_grazing.jpg',
            '03_height_100m_overcast_medium.jpg',
            '05_gameplay_bus_camera_daylight.jpg',
            '07_top_down_overcast_coverage.jpg',
            '08_far_texture_only_daylight.jpg',
            '09_tree_tuft_worn_substrate_golden.jpg',
            '11_low_quality_texture_boundary_bus.jpg',
            '12_high_quality_top_down_stress.jpg'
        ]) {
            assert.ok(statSync(`${localEvidenceDirectory}/${file}`).size > 50000, `Missing or empty approval capture ${file}`);
        }
    }
});
