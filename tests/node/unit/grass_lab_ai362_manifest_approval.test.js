// Node unit tests: AI 362 capture-manifest to scoped V2 approval adapter.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    evaluateGrassPerformanceMeasurement,
    GRASS_LAB_V2_REQUIRED_CAMERA_IDS,
    GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS,
    GRASS_LAB_V2_REQUIRED_LIGHTING_IDS,
    GRASS_LAB_V2_REQUIRED_MOTION_PATH_IDS,
    GRASS_LAB_V2_REQUIRED_PERFORMANCE_SAMPLE_IDS,
    GRASS_LAB_V2_REQUIRED_REGRESSIONS
} from '../../../src/app/grass/GrassLabValidationContract.js';
import {
    Ai362ManifestApprovalError,
    createAi362ApprovalInputFromManifest,
    createAi362ApprovalRecordFromManifest,
    inspectAi362ManifestApproval
} from '../../../tools/grass_lab_capture/ai362_manifest_approval.mjs';

const clone = (value) => structuredClone(value);
const BOUNDARY_SIGNATURE = 'grass-coverage-v2-ai362';
const SOURCE_RECIPE_ID = 'diagnostic_height_150';

function makePerformanceGate() {
    return evaluateGrassPerformanceMeasurement({
        status: 'complete',
        warmup: { frames: 120, durationMs: 2000, stableZeroUploadFrames: 30 },
        cpu: { samplesMs: Array.from({ length: 120 }, () => 0.4) },
        frame: { samplesMs: Array.from({ length: 120 }, () => 16) },
        gpu: {
            supported: true,
            backend: 'webgl2_ext_disjoint_timer_query',
            active: true,
            disjointCount: 0,
            notMeasuredReason: null,
            samples: Array.from({ length: 30 }, (_, index) => ({
                sequence: index + 1,
                submissionSequence: index + 1,
                ms: 2.5
            }))
        },
        graphics: { hardwareAccelerated: true },
        bufferUpdates: { samples: Array.from({ length: 120 }, () => 0) }
    });
}

function makeDiagnostics() {
    return {
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
                { state: 'near_to_billboard', progress: 0.5, weights: { near: 0.5, billboard: 0.5, middle: 0, texture: 0 } },
                { state: 'billboard_to_middle', progress: 0.5, weights: { near: 0, billboard: 0.5, middle: 0.5, texture: 0 } },
                { state: 'middle_to_texture', progress: 0.5, weights: { near: 0, billboard: 0, middle: 0.5, texture: 0.5 } }
            ],
            transitionProgress: 0.5,
            activeTier: 'billboard',
            geometryBeyondCutoff: 0
        },
        nearCarpet: {
            schema: 'near-grass-carpet-v2',
            coverageMode: 'exact_polygon_v2',
            boundarySignature: BOUNDARY_SIGNATURE,
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
            boundarySignature: BOUNDARY_SIGNATURE,
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
            handoffs: ['near_to_billboard', 'billboard_to_middle', 'middle_to_texture'].map((id) => ({
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
                atlasMaps: ['midClusterColor', 'midClusterCoverage', 'midClusterNormal', 'midClusterRoughness', 'midClusterAo']
            }
        },
        accent: {
            schema: 'bus-simulator.grass-localized-accents',
            version: 2,
            coverageMode: 'exact_polygon',
            substrateOwnership: 'coverage_tree_hole',
            weightPolicy: '1_minus_texture_weight',
            boundarySignature: BOUNDARY_SIGNATURE,
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
                atlasMaps: ['accentClumpColor', 'accentClumpCoverage', 'accentClumpNormal', 'accentClumpRoughness', 'accentClumpAo']
            }
        },
        coverage: {
            sourceLoopIdentity: 'road-engine:ai362-source-loops',
            roadEngineSourceLoopIdentity: 'road-engine:ai362-source-loops',
            boundarySignature: BOUNDARY_SIGNATURE,
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
        }
    };
}

function makeCost() {
    return {
        boundaryTriangles: 95_219,
        nearTriangles: 48_000,
        billboardTriangles: 1_400,
        middleTriangles: 2_800,
        accentTriangles: 16,
        coverageLogicalDrawCalls: 2,
        nearLogicalDrawCalls: 2,
        billboardLogicalDrawCalls: 1,
        middleLogicalDrawCalls: 1,
        accentLogicalDrawCalls: 1,
        combinedVisibleGrassTriangles: 147_435,
        combinedVisibleGrassLogicalDrawCalls: 7,
        totalRendererDrawCalls: 18,
        geometryBeyondCutoff: 0
    };
}

function makeCapture({
    phase,
    recipeId,
    pairId = null,
    focusId = 'height_030',
    lightingPreset = 'daylight',
    motionPath = null,
    evidenceIds = [],
    captureVariant = 'clean',
    approvalDiagnosticSource = false
}) {
    const diagnostics = makeDiagnostics();
    return {
        phase,
        matrix: 'ai362-validation',
        recipeId,
        pairId,
        captureVariant,
        approvalDiagnosticSource,
        snapshotContractVersion: 10,
        evidenceIds,
        uiFree: captureVariant !== 'diagnostic_overlay',
        diagnosticOverlayAttached: captureVariant === 'diagnostic_overlay',
        file: `tests/artifacts/screens/grass/ai362/${phase}_${recipeId}.png`,
        contentSha256: recipeId.padEnd(64, 'a').slice(0, 64).replace(/[^a-f0-9]/g, 'a'),
        png: { width: 3840, height: 2160, format: 'png', lossless: true },
        canvas: { drawingBufferWidth: 3840, drawingBufferHeight: 2160, rendererPixelRatio: 1 },
        camera: {
            position: { x: 1, y: 0.3, z: 3 },
            target: { x: 0, y: 0.04, z: 0 },
            heightMeters: 0.3
        },
        focus: { id: focusId, pose: 'approval' },
        lightingPreset,
        exposure: 1,
        qualityPreset: 'default',
        activeLodTier: 'billboard',
        materialDiagnostics: {
            midCompiledShaderSignature: 'mid-shader-ai362',
            midMaterialId: 'pbr.grass_low_cut_maintained_v2',
            accentMaterialId: 'pbr.grass_low_cut_maintained_v2'
        },
        coverageDiagnostics: clone(diagnostics.coverage),
        nearDiagnostics: clone(diagnostics.nearCarpet),
        hierarchyDiagnostics: clone(diagnostics.field),
        accentDiagnostics: clone(diagnostics.accent),
        lodDiagnostics: clone(diagnostics.autoLod),
        cost: makeCost(),
        motionPath
    };
}

function makePerformanceRow(sampleId, resolution) {
    return {
        phase: 'after',
        matrix: 'ai362-validation',
        sampleId,
        workload: 'stationary_approval',
        qualityPreset: sampleId === 'quality_low'
            ? 'low'
            : sampleId === 'quality_high'
                ? 'high'
                : 'default',
        resolution,
        statistic: 'arithmetic_mean',
        hardware: {
            host: {
                cpuModel: 'Test CPU',
                totalMemoryBytes: 32_000_000_000,
                freeMemoryBytesAtCapture: 16_000_000_000
            },
            browser: {
                graphics: { webglVersion: 'webgl2', hardwareAccelerated: true },
                memory: { gpuBytes: { status: 'not measured', reason: 'WebGL does not expose it' } }
            }
        },
        warmup: { frames: 120, durationMs: 2000, stableZeroUploadFrames: 30 },
        performanceGate: makePerformanceGate(),
        sampleCount: { cpu: 120, gpu: 30, frame: 120 },
        stationaryBufferUpdates: { maximum: 0, pass: true },
        ...makeCost()
    };
}

function makeManifest() {
    const captures = [];
    for (const [index, cameraId] of GRASS_LAB_V2_REQUIRED_CAMERA_IDS.entries()) {
        const pairId = `camera_${cameraId}`;
        captures.push(makeCapture({
            phase: 'after',
            recipeId: cameraId === 'height_150' ? SOURCE_RECIPE_ID : `after_camera_${cameraId}`,
            pairId,
            focusId: cameraId,
            evidenceIds: index === 0 ? GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS : [],
            captureVariant: cameraId === 'height_150' ? 'diagnostic_overlay' : 'clean',
            approvalDiagnosticSource: cameraId === 'height_150'
        }));
    }
    for (const lightingPreset of GRASS_LAB_V2_REQUIRED_LIGHTING_IDS.filter((id) => id !== 'daylight')) {
        const pairId = `lighting_${lightingPreset}`;
        captures.push(makeCapture({ phase: 'after', recipeId: `after_${pairId}`, pairId, lightingPreset }));
    }
    for (const motionPath of GRASS_LAB_V2_REQUIRED_MOTION_PATH_IDS) {
        captures.push(makeCapture({
            phase: 'after',
            recipeId: `motion_${motionPath}`,
            motionPath,
            captureVariant: 'motion'
        }));
    }
    captures.push(makeCapture({
        phase: 'after',
        recipeId: 'diagnostic_overlay',
        captureVariant: 'diagnostic_overlay'
    }));
    const costSamples = GRASS_LAB_V2_REQUIRED_PERFORMANCE_SAMPLE_IDS.map((sampleId) => (
        makePerformanceRow(sampleId, '1920x1080')
    ));
    const native4kGate = makePerformanceGate();
    const native4kTiming = {
        phase: 'after',
        matrix: 'ai362-validation',
        sampleId: 'native4k_default_billboard_middle',
        resolution: '3840x2160',
        qualityPreset: 'default',
        lightingPreset: 'daylight',
        cameraPreset: 'billboard_middle_handoff',
        statistic: 'arithmetic_mean',
        informationalOnly: true,
        recorded: true,
        performanceMeasurement: { graphics: { hardwareAccelerated: true } },
        performanceGate: native4kGate,
        sampleCount: { cpu: 120, gpu: 30, frame: 120 }
    };
    costSamples.push(native4kTiming);
    return {
        schema: 'grass-lab-capture-manifest-v2',
        generatedAt: '2026-08-31T12:00:00.000Z',
        requiredDrawingBuffer: { width: 3840, height: 2160, pixelRatio: 1 },
        captures,
        diagnosticsByPhase: {
            after: {
                matrix: 'ai362-validation',
                gameplayTouched: false,
                ai362Gate: {
                    pass: true,
                    visualFunctionalPass: true,
                    performanceOwnership: 'deferred_to_ai537',
                    performanceEvidenceComplete: true,
                    baselineReferencePass: true,
                    baselinePairChecks: [{
                        recipeId: SOURCE_RECIPE_ID,
                        baselineRecipeId: 'handoff_pair_billboard_middle_auto',
                        baselineFileVerified: true,
                        pass: true
                    }],
                    reviewCoverage: {
                        cameraIds: GRASS_LAB_V2_REQUIRED_CAMERA_IDS,
                        lightingIds: GRASS_LAB_V2_REQUIRED_LIGHTING_IDS,
                        motionPathIds: GRASS_LAB_V2_REQUIRED_MOTION_PATH_IDS,
                        evidenceIds: GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS
                    }
                },
                ai362BaselineReference: {
                    mode: 'completed_ai361_final_manifest',
                    sourceManifest: 'tests/artifacts/screens/grass/ai361/capture_manifest.json',
                    sourceManifestSha256: 'a'.repeat(64),
                    checks: [{ recipeId: 'handoff_pair_billboard_middle_auto', fileVerified: true, pass: true }],
                    pass: true
                },
                ai362Native4kTiming: native4kTiming,
                ai362RegressionGate: {
                    pass: true,
                    results: GRASS_LAB_V2_REQUIRED_REGRESSIONS.map((id) => ({
                        id,
                        pass: true,
                        evidenceRecipeIds: [SOURCE_RECIPE_ID],
                        checks: { measuredEvidencePass: true },
                        measurements: { sampleCount: 1 }
                    }))
                },
                costSamples
            }
        }
    };
}

function setExplicitDisabledLowQualityHierarchy(capture) {
    capture.fallbackMode = 'low_quality';
    capture.qualityPreset = 'low';
    capture.hierarchyDiagnostics.enabled = false;
    capture.hierarchyDiagnostics.boundarySignature = null;
    capture.hierarchyDiagnostics.placementSignature = null;
    for (const stats of [
        capture.hierarchyDiagnostics,
        capture.hierarchyDiagnostics.billboard,
        capture.hierarchyDiagnostics.middle
    ]) {
        stats.instances = 0;
        stats.triangles = 0;
        stats.drawCalls = 0;
    }
}

test('AI 362 adapter builds an approved scoped record only from complete live-shaped manifest evidence', () => {
    const manifest = makeManifest();
    const inspection = inspectAi362ManifestApproval(manifest);
    assert.equal(inspection.ready, true, JSON.stringify(inspection.gaps));
    assert.deepEqual(inspection.gaps, []);

    const input = createAi362ApprovalInputFromManifest(manifest);
    assert.equal(input.snapshotContractVersion, 10);
    assert.equal(input.captureEvidence.imageCount > 0, true);
    assert.equal(input.captureEvidence.screenshotManifest.length, input.captureEvidence.imageCount);
    assert.equal(input.performanceMeasurements.length, 5);
    assert.equal(input.performanceMeasurements.every((row) => row.performanceGate.pass === false), true);

    const record = createAi362ApprovalRecordFromManifest(manifest);
    assert.equal(record.status, 'approved');
    assert.equal(record.approvalScope, 'visual_functional_motion_determinism');
    assert.equal(record.performance.status, 'deferred_to_ai537');
    assert.equal(record.performance.passRequired, false);
    assert.equal(record.performance.measurements.length, 5);
    assert.equal(record.authorization.gameplayAuthorized, false);
    assert.equal(record.captureEvidence.matchedBeforeAfter, true);
    assert.equal(record.captureEvidence.native4kPerformanceMeasurements.length, 1);
});

test('AI 362 adapter accepts only an explicit zero-geometry low-quality hierarchy fallback', async (t) => {
    const manifest = makeManifest();
    const fallback = manifest.captures.find((entry) => entry.recipeId === 'after_camera_height_030');
    setExplicitDisabledLowQualityHierarchy(fallback);
    assert.equal(inspectAi362ManifestApproval(manifest).ready, true);

    const mutations = [
        ['fallback role', (capture) => { capture.fallbackMode = null; }],
        ['low quality', (capture) => { capture.qualityPreset = 'default'; }],
        ['disabled hierarchy', (capture) => { capture.hierarchyDiagnostics.enabled = true; }],
        ['zero top-level geometry', (capture) => { capture.hierarchyDiagnostics.instances = 1; }],
        ['zero billboard geometry', (capture) => { capture.hierarchyDiagnostics.billboard.triangles = 2; }],
        ['zero middle geometry', (capture) => { capture.hierarchyDiagnostics.middle.drawCalls = 1; }],
        ['explicit null signature', (capture) => { delete capture.hierarchyDiagnostics.boundarySignature; }]
    ];
    for (const [label, mutate] of mutations) {
        await t.test(label, () => {
            const invalid = clone(manifest);
            const capture = invalid.captures.find((entry) => entry.recipeId === 'after_camera_height_030');
            mutate(capture);
            const inspection = inspectAi362ManifestApproval(invalid);
            assert.equal(inspection.ready, false);
            assert.equal(inspection.gaps.some((gap) => gap.path.includes('captures.after') && gap.path.endsWith('.state')), true);
        });
    }
});

test('AI 362 adapter refuses missing raw evidence instead of synthesizing approval facts', async (t) => {
    const mutations = [
        ['exact handoff diagnostics', (manifest) => {
            const source = manifest.captures.find((entry) => entry.approvalDiagnosticSource);
            delete source.hierarchyDiagnostics.handoffs;
        }, 'approval.fieldHandoffs'],
        ['regression measurement provenance', (manifest) => {
            manifest.diagnosticsByPhase.after.ai362RegressionGate.results[0].checks = {};
            manifest.diagnosticsByPhase.after.ai362RegressionGate.results[0].measurements = {};
        }, 'regressions.isolated_bright_points'],
        ['verified immutable baseline mapping', (manifest) => {
            manifest.diagnosticsByPhase.after.ai362BaselineReference.pass = false;
        }, 'captures.beforeAfterPairs'],
        ['required 1080p performance row', (manifest) => {
            manifest.diagnosticsByPhase.after.costSamples = manifest.diagnosticsByPhase.after.costSamples
                .filter((row) => row.sampleId !== 'quality_high');
        }, 'performanceMeasurements.quality_high'],
        ['informational native-4K timing row', (manifest) => {
            delete manifest.diagnosticsByPhase.after.ai362Native4kTiming;
        }, 'ai362Native4kTiming'],
        ['explicit lossless PNG fact', (manifest) => {
            const capture = manifest.captures.find((entry) => entry.phase === 'after');
            delete capture.png.lossless;
        }, 'png']
    ];

    for (const [label, mutate, expectedPath] of mutations) {
        await t.test(label, () => {
            const manifest = makeManifest();
            mutate(manifest);
            const inspection = inspectAi362ManifestApproval(manifest);
            assert.equal(inspection.ready, false);
            assert.equal(inspection.gaps.some((gap) => gap.path.includes(expectedPath)), true, JSON.stringify(inspection.gaps));
            assert.throws(
                () => createAi362ApprovalRecordFromManifest(manifest),
                (error) => error instanceof Ai362ManifestApprovalError
                    && error.gaps.some((gap) => gap.path.includes(expectedPath))
            );
        });
    }
});
