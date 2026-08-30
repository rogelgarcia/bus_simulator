// Node unit tests for the native-resolution Grass Lab evidence contract.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import {
    CARD_BAND_GATE_CONTRACT,
    CARD_BAND_ROI,
    buildBoundaryCaptureRecipes,
    buildCaptureRecipes,
    evaluateBoundaryPairs,
    evaluateBoundaryRepresentationSnapshot,
    evaluateCardBandPairs,
    evaluateLuminancePairs,
    measureCardBandPair,
    measurePngFrame,
    mergeCaptureManifest,
    parseArgs,
    readPngDimensions,
    resolveV2AssetRoot,
    summarizeSettledMaterialVersion
} from '../../../tools/grass_lab_capture/run.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function makeRgbPng(width, height, rgbRows) {
    const chunk = (type, data) => {
        const header = Buffer.alloc(8);
        header.writeUInt32BE(data.length, 0);
        header.write(type, 4, 'ascii');
        return Buffer.concat([header, data, Buffer.alloc(4)]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const scanlines = Buffer.concat(rgbRows.map((row) => Buffer.concat([Buffer.from([0]), Buffer.from(row)])));
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(scanlines)),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

function makeCardBandPng(darkenedColumns = 0) {
    const width = 100;
    const height = 100;
    const rows = Array.from({ length: height }, () => Buffer.alloc(width * 3, 128));
    for (let y = 37; y <= 39; y += 1) {
        for (let x = 5; x < 5 + darkenedColumns; x += 1) {
            rows[y][x * 3] = 32;
            rows[y][x * 3 + 1] = 32;
            rows[y][x * 3 + 2] = 32;
        }
    }
    return makeRgbPng(width, height, rows);
}

function makeCardBandCaptures() {
    const camera = {
        position: { x: -10.62, y: 0.5, z: -71 },
        target: { x: -10.32, y: 0.04, z: -74.4 },
        fovDegrees: 50,
        aspect: 16 / 9,
        nearMeters: 0.02,
        farMeters: 5000
    };
    return [
        { recipeId: 'geometry_on_daylight', lightingPreset: 'daylight', exposure: 1, camera },
        { recipeId: 'texture_only_daylight', lightingPreset: 'daylight', exposure: 1, camera },
        { recipeId: 'geometry_on_overcast', lightingPreset: 'overcast', exposure: 0.98, camera },
        { recipeId: 'texture_only_overcast', lightingPreset: 'overcast', exposure: 0.98, camera }
    ];
}

test('grass capture recipes cover four lights and material, close, grazing, texture, handoff, and far evidence', () => {
    const recipes = buildCaptureRecipes();
    assert.equal(recipes.length, 11);
    assert.deepEqual(new Set(recipes.filter((entry) => entry.material).map((entry) => entry.lighting)), new Set([
        'daylight',
        'overcast',
        'golden',
        'night'
    ]));
    assert.deepEqual(new Set(recipes.map((entry) => entry.role)), new Set([
        'material_fixture',
        'geometry_on_close',
        'geometry_on_neutral_pair',
        'geometry_on_grazing',
        'texture_only',
        'texture_only_neutral_pair',
        'handoff',
        'far'
    ]));
});

test('AI 359 boundary matrix supplies nine native-4K substrate/final pairs with exact target coverage', () => {
    const recipes = buildBoundaryCaptureRecipes();
    assert.equal(recipes.length, 18);
    assert.deepEqual(new Set(recipes.map((entry) => entry.quality)), new Set(['low']));
    assert.deepEqual(new Set(recipes.map((entry) => entry.lighting)), new Set(['daylight']));
    assert.deepEqual(new Set(recipes.map((entry) => entry.evidenceMode)), new Set([
        'substrate_only',
        'boundary_final'
    ]));
    assert.deepEqual(new Set(recipes.map((entry) => entry.pairId)), new Set([
        'straight_030',
        'straight_050',
        'straight_100',
        'straight_zoom',
        'curve',
        'diagonal',
        'inside_corner',
        'outside_corner',
        'tree_base'
    ]));
    assert.deepEqual(
        recipes.filter((entry) => entry.boundaryTarget === 'straight' && !entry.distanceMeters)
            .map((entry) => entry.heightMeters),
        [0.3, 0.3, 0.5, 0.5, 1, 1]
    );
    assert.deepEqual(
        recipes.filter((entry) => entry.pairId === 'straight_zoom').map((entry) => entry.distanceMeters),
        [1.25, 1.25]
    );
});

test('AI 359 read-only boundary inspection does not require an evidence phase', () => {
    const options = parseArgs(['--inspect-boundary']);
    assert.equal(options.inspectBoundary, true);
    assert.equal(options.matrix, 'ai359-boundary');
    assert.equal(options.phase, null);
});

function makeBoundarySnapshot(mode) {
    const final = mode === 'boundary_final';
    return {
        fixtures: { sourceLoopIdentity: 'rendered-sidewalk-loop-359' },
        boundaryEvidence: {
            mode,
            legacyGeometryHidden: true,
            grassEngineVisible: false,
            coverageVisible: final
        },
        coverage: {
            sourceLoopIdentity: 'rendered-sidewalk-loop-359',
            grassOnsetWidthMeters: 0.08,
            sidewalkOnsetDistanceMinMeters: 0.079,
            sidewalkOnsetDistanceMaxMeters: 0.1,
            logicalDrawCalls: final ? 2 : 0,
            physicalEdgeLogicalDraws: final ? 1 : 0,
            triangles: final ? 3200 : 0,
            capTriangles: final ? 120 : 0,
            edgeTriangles: final ? 3080 : 0,
            opaqueCap: true,
            transparentSurface: false,
            alphaTestedSurface: false,
            structuralBaseHeightMeters: 0.0275,
            visibleBladeTipMinMeters: 0.04,
            visibleBladeTipMaxMeters: 0.075,
            antialiasWidthMeters: 0.012,
            diagonalSegments: 4,
            curvedSegments: 8,
            insideCorners: 2,
            outsideCorners: 3,
            treeBaseSegments: 24,
            maxBoundaryDeviationMeters: 0.01,
            hardExclusionIntrusions: 0,
            grassOnsetIntrusions: 0,
            ineligibleCutEdgeRoots: 0
        }
    };
}

function makeBoundaryCaptures() {
    const cameraFor = (recipe) => ({
        position: { x: recipe.pairId.length, y: recipe.heightMeters, z: -3 },
        target: { x: 0, y: 0.03, z: 0 },
        fovDegrees: 50,
        aspect: 16 / 9,
        nearMeters: 0.02,
        farMeters: 5000
    });
    return buildBoundaryCaptureRecipes().map((recipe) => {
        const snapshot = makeBoundarySnapshot(recipe.evidenceMode);
        const approval = evaluateBoundaryRepresentationSnapshot(snapshot, recipe.evidenceMode);
        return {
            recipeId: recipe.id,
            pairId: recipe.pairId,
            evidenceMode: recipe.evidenceMode,
            qualityPreset: recipe.quality,
            lightingPreset: recipe.lighting,
            exposure: 1,
            png: { width: 3840, height: 2160 },
            camera: cameraFor(recipe),
            representationApproval: approval,
            cost: {
                coverageCapTriangles: snapshot.coverage.capTriangles,
                coverageEdgeTriangles: snapshot.coverage.edgeTriangles,
                coverageTriangles: snapshot.coverage.triangles,
                coverageLogicalDrawCalls: snapshot.coverage.logicalDrawCalls
            }
        };
    });
}

test('AI 359 boundary gate requires pair-stable cameras and excludes near/mid/accent geometry', () => {
    const captures = makeBoundaryCaptures();
    const result = evaluateBoundaryPairs(captures);
    assert.equal(result.gateId, 'grass-boundary-paired-approval-v1');
    assert.equal(result.requiredPairCount, 9);
    assert.equal(result.captureCount, 18);
    assert.equal(result.stableSourceLoopIdentity, true);
    assert.equal(result.pass, true);
    assert.equal(result.pairs.every((pair) => pair.alignment.cameraMatch), true);
    assert.equal(result.pairs.every((pair) => pair.substrateApproval.noNearMidAccentRepresentation), true);
    assert.equal(result.pairs.every((pair) => pair.finalApproval.coverageDrawCalls <= 2), true);

    const shifted = structuredClone(captures);
    shifted.find((entry) => entry.recipeId === 'boundary_final_curve').camera.position.x += 0.01;
    assert.equal(evaluateBoundaryPairs(shifted).pass, false);

    const leaked = makeBoundarySnapshot('boundary_final');
    leaked.boundaryEvidence.grassEngineVisible = true;
    const leakApproval = evaluateBoundaryRepresentationSnapshot(leaked, 'boundary_final');
    assert.equal(leakApproval.noNearMidAccentRepresentation, false);
    assert.equal(leakApproval.pass, false);

    const crossedOnset = makeBoundarySnapshot('boundary_final');
    crossedOnset.coverage.grassOnsetIntrusions = 1;
    const crossingApproval = evaluateBoundaryRepresentationSnapshot(crossedOnset, 'boundary_final');
    assert.equal(crossingApproval.checks.finalHasNoGrassOnsetIntrusions, false);
    assert.equal(crossingApproval.pass, false);
});

test('grass capture evaluates identical-camera daylight and overcast turf luminance pairs', () => {
    const captures = [
        { recipeId: 'geometry_on_daylight', frameMetrics: { medianLuminance: 0.3 } },
        { recipeId: 'texture_only_daylight', frameMetrics: { medianLuminance: 0.3 } },
        { recipeId: 'geometry_on_overcast', frameMetrics: { medianLuminance: 0.27 } },
        { recipeId: 'texture_only_overcast', frameMetrics: { medianLuminance: 0.3 } }
    ];
    const result = evaluateLuminancePairs(captures);
    assert.equal(result.pass, true);
    assert.deepEqual(result.roiNormalized, { x: 0.2, y: 0.55, width: 0.6, height: 0.35 });
    assert.deepEqual(result.pairs.map((pair) => pair.ratio), [1, 0.9]);
    const failed = evaluateLuminancePairs(captures.map((entry) => (
        entry.recipeId === 'geometry_on_daylight'
            ? { ...entry, frameMetrics: { medianLuminance: 0.4 } }
            : entry
    )));
    assert.equal(failed.pass, false);
});

test('grass capture PNG verification rejects JPEG payloads and reads exact IHDR dimensions', () => {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.write('IHDR', 12, 'ascii');
    png.writeUInt32BE(3840, 16);
    png.writeUInt32BE(2160, 20);
    assert.deepEqual(readPngDimensions(png), { width: 3840, height: 2160 });
    assert.throws(() => readPngDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), /PNG/);
});

test('grass capture measures compositor PNG pixels instead of an unreadable WebGL canvas', () => {
    const png = makeRgbPng(2, 2, [
        [255, 255, 255, 255, 255, 255],
        [0, 0, 0, 0, 0, 0]
    ]);
    const metrics = measurePngFrame(png, { x: 0, y: 0, width: 1, height: 1 });
    assert.equal(metrics.meanLuminance, 0.5);
    assert.equal(metrics.brightPixelFraction, 0.5);
    assert.equal(metrics.sampleWidth, 2);
    assert.equal(metrics.sampleHeight, 2);
});

test('grass capture card-band metric catches a narrow spatial defect that broad medians miss', () => {
    const texture = makeCardBandPng(0);
    const defectiveGeometry = makeCardBandPng(45);
    const acceptableGeometry = makeCardBandPng(9);
    const defect = measureCardBandPair(defectiveGeometry, texture);
    assert.deepEqual(defect.roiNormalized, CARD_BAND_ROI);
    assert.deepEqual(defect.criterion, {
        geometryToTextureRatioExclusiveMax: 0.7,
        textureMinusGeometryExclusiveMin: 0.06
    });
    assert.equal(defect.smoothingRows, 3);
    assert.equal(defect.maximumRawRowDarkenedFraction, 0.5);
    assert.equal(defect.maximumSmoothedRowDarkenedFraction, 0.5);
    assert.equal(defect.pass, false);
    const acceptable = measureCardBandPair(acceptableGeometry, texture);
    assert.equal(acceptable.maximumSmoothedRowDarkenedFraction, 0.1);
    assert.equal(acceptable.pass, true);
});

test('grass capture evaluates aligned daylight and overcast live-card PNG pairs independently', () => {
    const texture = makeCardBandPng(0);
    const geometry = makeCardBandPng(45);
    const pngByRecipe = new Map([
        ['geometry_on_daylight', geometry],
        ['texture_only_daylight', texture],
        ['geometry_on_overcast', geometry],
        ['texture_only_overcast', texture]
    ]);
    const result = evaluateCardBandPairs(makeCardBandCaptures(), pngByRecipe);
    assert.equal(result.gateId, 'live-field-card-band-v1');
    assert.equal(result.sampleScope, 'height_050_live_field_cards');
    assert.equal(result.materialFixtureAutomation, 'human-evidence-only');
    assert.equal(result.pass, false);
    assert.deepEqual(result.pairs.map((pair) => pair.alignment.pass), [true, true]);
    assert.deepEqual(result.pairs.map((pair) => pair.maximumSmoothedRowDarkenedFraction), [0.5, 0.5]);

    const acceptableGeometry = makeCardBandPng(9);
    pngByRecipe.set('geometry_on_daylight', acceptableGeometry);
    pngByRecipe.set('geometry_on_overcast', acceptableGeometry);
    const acceptable = evaluateCardBandPairs(makeCardBandCaptures(), pngByRecipe);
    assert.equal(acceptable.pass, true);
    const shiftedCaptures = makeCardBandCaptures().map((capture) => (
        capture.recipeId === 'texture_only_daylight'
            ? { ...capture, camera: { ...capture.camera, position: { ...capture.camera.position, x: -10.61 } } }
            : capture
    ));
    const shifted = evaluateCardBandPairs(shiftedCaptures, pngByRecipe);
    assert.equal(shifted.pairs[0].alignment.cameraMatch, false);
    assert.equal(shifted.pairs[0].pass, false);
    assert.equal(shifted.pass, false);
});

test('grass capture manifest keeps the other phase and replaces only the requested phase', () => {
    const existing = {
        captures: [
            { phase: 'before', file: 'before_old.png' },
            { phase: 'after', file: 'after_keep.png' }
        ],
        diagnosticsByPhase: { after: { ok: true } },
        cardBandGateByPhase: { after: { pass: true } }
    };
    const diagnostics = { ok: true, cardBandGate: { pass: false } };
    const result = mergeCaptureManifest(existing, 'before', [{ phase: 'before', file: 'before_new.png' }], diagnostics);
    assert.equal(result.schema, 'grass-lab-capture-manifest-v2');
    assert.deepEqual(result.requiredDrawingBuffer, { width: 3840, height: 2160, pixelRatio: 1 });
    assert.deepEqual(result.captures.map((entry) => entry.file), ['after_keep.png', 'before_new.png']);
    assert.deepEqual(result.diagnosticsByPhase, { after: { ok: true }, before: diagnostics });
    assert.deepEqual(result.cardBandGateByPhase, { after: { pass: true }, before: { pass: false } });
});

test('grass capture phase summary uses settled per-capture material diagnostics', () => {
    const staleSwitch = {
        supported: true,
        materialVersion: 'v1',
        result: { version: 'v1', midCompiledShaderSignature: 'stale-v2' }
    };
    const settled = summarizeSettledMaterialVersion(staleSwitch, [{
        materialVersion: 'v1',
        materialDiagnostics: {
            version: 'v1',
            midCompiledShaderSignature: 'settled-v1',
            midCompiledAlphaLayout: 'packed_basecolor_alpha'
        }
    }]);
    assert.deepEqual(settled, {
        supported: true,
        materialVersion: 'v1',
        result: {
            version: 'v1',
            midCompiledShaderSignature: 'settled-v1',
            midCompiledAlphaLayout: 'packed_basecolor_alpha'
        }
    });
});

test('grass capture confines V2 staging overrides to repository-local Lab assets', () => {
    assert.equal(
        resolveV2AssetRoot('tests/artifacts/grass_material_baker/grass_low_cut_maintained_v2'),
        path.join(REPO_ROOT, 'tests/artifacts/grass_material_baker/grass_low_cut_maintained_v2')
    );
    assert.throws(() => resolveV2AssetRoot('../outside'), /repository-relative subdirectory/);
    assert.equal(resolveV2AssetRoot(null), null);
});

test('Grass Lab exposes supported capture APIs and capture CSS removes dock and performance-bar offsets', async () => {
    const [main, styles, runner] = await Promise.all([
        readFile(new URL('../../../src/graphics/gui/grass_debugger/main.js', import.meta.url), 'utf8'),
        readFile(new URL('../../../src/graphics/gui/grass_debugger/styles.css', import.meta.url), 'utf8'),
        readFile(new URL('../../../tools/grass_lab_capture/run.mjs', import.meta.url), 'utf8')
    ]);
    for (const api of [
        'enterCaptureMode',
        'exitCaptureMode',
        'settleCaptureFrames',
        'getCaptureMetadata',
        'focusMaterialFixture',
        'setMaterialLighting',
        'setMaterialVersion',
        'focusBoundaryCamera',
        'setBoundaryEvidenceMode'
    ]) assert.match(main, new RegExp(`${api}:`));
    assert.match(main, /drawingBufferWidth/);
    assert.match(main, /rendererPixelRatio === 1/);
    assert.match(styles, /body\.grass-lab-capture-mode #game-canvas/);
    assert.match(styles, /width: 100vw !important/);
    assert.match(styles, /height: 100vh !important/);
    assert.match(styles, /\.ui-perf-bar/);
    assert.match(runner, /\['low', 'default', 'high'\]/);
    assert.match(runner, /visibleGrassTriangleCeiling: 200000/);
    assert.match(runner, /live-field-card-band-v1/);
    assert.match(runner, /maximumSmoothedRowDarkenedFraction/);
    assert.match(runner, /--v2-asset-root=/);
    assert.match(runner, /lab_staging_override/);
    assert.match(runner, /page\.route/);
    assert.match(runner, /--matrix=/);
    assert.match(runner, /grass-boundary-paired-approval-v1/);
    assert.match(runner, /noNearMidAccentRepresentation/);
    assert.deepEqual(CARD_BAND_GATE_CONTRACT, {
        geometryToTextureRatio: 0.7,
        minimumLuminanceDelta: 0.06,
        smoothingRows: 3,
        maximumDarkenedFraction: 0.1
    });
});
