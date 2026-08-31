// Node unit tests for the native-resolution Grass Lab evidence contract.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import {
    CARD_BAND_GATE_CONTRACT,
    CARD_BAND_ROI,
    buildAi362ValidationRecipes,
    buildBoundaryCaptureRecipes,
    buildCaptureRecipes,
    buildLodCaptureRecipes,
    buildNearCaptureRecipes,
    evaluateBoundaryPairs,
    evaluateBoundaryRepresentationSnapshot,
    evaluateCardBandPairs,
    evaluateLuminancePairs,
    evaluateLodCaptureSet,
    evaluateLodHandoffAppearancePairs,
    evaluateLodPerformanceCostGate,
    evaluateAi362BaselineReference,
    evaluateAi362RegressionGate,
    evaluateAi362ValidationSet,
    enrichAi362ApprovalDiagnosticSource,
    hasCompleteAi362Native4kTimingEvidence,
    evaluateNearPairs,
    evaluateNearRepresentationSnapshot,
    measureCardBandPair,
    measurePngFrame,
    mergeCaptureManifest,
    parseArgs,
    readPngDimensions,
    resolveV2AssetRoot,
    summarizeSettledMaterialVersion,
    verifyAi362MeasurementsOnlyManifest
} from '../../../tools/grass_lab_capture/run.mjs';
import { evaluateGrassPerformanceMeasurement } from '../../../src/app/grass/GrassLabValidationContract.js';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function makePngHeader(width, height) {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.write('IHDR', 12, 'ascii');
    png.writeUInt32BE(width, 16);
    png.writeUInt32BE(height, 20);
    return png;
}

function makeAi362MeasurementsOnlyFixture() {
    const outputRelative = 'tests/artifacts/screens/grass/ai362-verifier-fixture';
    const outputRoot = path.join(REPO_ROOT, ...outputRelative.split('/'));
    const png = makePngHeader(3840, 2160);
    const contentSha256 = createHash('sha256').update(png).digest('hex');
    const files = new Map();
    const captures = buildAi362ValidationRecipes().map((recipe) => {
        const file = path.posix.join(outputRelative, `after_${recipe.id}.png`);
        files.set(path.resolve(REPO_ROOT, file), png);
        return {
            phase: 'after',
            matrix: 'ai362-validation',
            recipeId: recipe.id,
            file,
            contentSha256,
            png: { width: 3840, height: 2160, format: 'png', lossless: true },
            canvas: { drawingBufferWidth: 3840, drawingBufferHeight: 2160, rendererPixelRatio: 1 }
        };
    });
    const manifest = {
        schema: 'grass-lab-capture-manifest-v2',
        requiredDrawingBuffer: { width: 3840, height: 2160, pixelRatio: 1 },
        captures
    };
    const readFileImpl = async (filePath) => {
        const key = path.resolve(filePath);
        if (!files.has(key)) {
            const error = new Error(`Missing fixture file: ${key}`);
            error.code = 'ENOENT';
            throw error;
        }
        return files.get(key);
    };
    return { outputRoot, manifest, files, readFileImpl };
}

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

test('AI 360 near matrix supplies nine native-4K texture/mesh pairs for every required pose', () => {
    const recipes = buildNearCaptureRecipes();
    assert.equal(recipes.length, 18);
    assert.deepEqual(new Set(recipes.map((entry) => entry.quality)), new Set(['default']));
    assert.deepEqual(new Set(recipes.map((entry) => entry.lighting)), new Set(['daylight']));
    assert.deepEqual(new Set(recipes.map((entry) => entry.nearEvidenceMode)), new Set([
        'texture_only',
        'near_mesh'
    ]));
    assert.deepEqual(new Set(recipes.map((entry) => entry.pairId)), new Set([
        'height_030',
        'height_050',
        'height_100',
        'grazing',
        'forward',
        'oblique',
        'top_down',
        'physical_cut_side_profile',
        'bus_scale'
    ]));
    assert.deepEqual(
        recipes.filter((entry) => entry.pairId === 'physical_cut_side_profile')
            .map((entry) => ({ target: entry.boundaryTarget, height: entry.heightMeters, distance: entry.distanceMeters })),
        [
            { target: 'straight', height: 0.3, distance: 1.25 },
            { target: 'straight', height: 0.3, distance: 1.25 }
        ]
    );
    const options = parseArgs(['--phase=before', '--matrix=ai360-near']);
    assert.equal(options.matrix, 'ai360-near');
    assert.equal(options.output, 'tests/artifacts/screens/grass/ai360');
});

test('AI 361 preserves the 15-frame baseline and expands AFTER to the complete 60-role approval matrix', () => {
    const before = buildLodCaptureRecipes('before');
    assert.equal(before.length, 15);
    assert.equal(before.filter((entry) => !entry.motionPath).length, 10);
    assert.equal(before.filter((entry) => entry.motionPath).length, 5);
    assert.deepEqual(before.filter((entry) => entry.role === 'handoff').map((entry) => entry.handoffId), [
        'close_billboard',
        'billboard_middle',
        'middle_texture'
    ]);
    assert.deepEqual(
        before.filter((entry) => entry.role === 'cutoff')
            .map((entry) => ({ handoffId: entry.handoffId, offsetMeters: entry.handoffOffsetMeters })),
        [{ handoffId: 'middle_texture', offsetMeters: 0.5 }]
    );
    assert.deepEqual(before.filter((entry) => entry.motionPath).map((entry) => entry.motionElapsedMs), [
        0,
        2250,
        4500,
        6750,
        8900
    ]);
    assert.deepEqual(before.filter((entry) => entry.motionPath).map((entry) => entry.motionProgress), [
        0,
        0.25,
        0.5,
        0.75,
        0.988889
    ]);
    assert.equal(before.every((entry) => entry.matrix === 'ai361-lod'), true);
    assert.equal(before.every((entry) => entry.quality === 'default' && entry.lighting === 'daylight'), true);

    const after = buildLodCaptureRecipes('after');
    assert.equal(after.length, 60);
    assert.equal(after.filter((entry) => !entry.motionPath).length, 33);
    assert.equal(after.filter((entry) => entry.motionPath).length, 27);
    assert.equal(after.filter((entry) => entry.evidenceGroup === 'handoff_pair').length, 6);
    assert.deepEqual(
        new Set(after.filter((entry) => entry.evidenceGroup === 'handoff_pair').map((entry) => entry.hierarchyEvidenceMode)),
        new Set(['auto', 'texture_only'])
    );
    assert.equal(after.filter((entry) => entry.evidenceGroup === 'special_still').length, 7);
    assert.equal(after.filter((entry) => entry.evidenceGroup === 'four_light_matrix').length, 20);
    assert.deepEqual(
        new Set(after.filter((entry) => entry.evidenceGroup === 'four_light_matrix').map((entry) => entry.lighting)),
        new Set(['daylight', 'overcast', 'golden', 'night'])
    );
    assert.deepEqual(
        new Set(after.filter((entry) => entry.evidenceGroup === 'four_light_matrix').map((entry) => entry.lightRole)),
        new Set(['texture', 'close', 'billboard', 'middle', 'accent'])
    );
    assert.equal(after.filter((entry) => entry.motionPath === 'forward').length, 9);
    assert.equal(after.filter((entry) => entry.motionPath === 'reverse').length, 9);
    assert.equal(after.filter((entry) => entry.motionPath === 'strafe').length, 3);
    assert.equal(after.filter((entry) => entry.motionPath === 'flyover').length, 6);
    assert.ok(after.every((entry) => entry.matrix === 'ai361-lod' && entry.quality === 'default'));

    const options = parseArgs([
        '--phase=before',
        '--matrix=ai361-lod',
        '--recipes=flyover_0000,flyover_4500'
    ]);
    assert.equal(options.output, 'tests/artifacts/screens/grass/ai361');
    assert.deepEqual(options.recipeIds, ['flyover_0000', 'flyover_4500']);
});

test('AI 361 performance deferral is explicit, exact, and scoped to its AFTER matrix', () => {
    const options = parseArgs([
        '--phase=after',
        '--matrix=ai361-lod',
        '--defer-performance-to=AI537'
    ]);
    assert.equal(options.deferPerformanceTo, 'AI537');
    assert.throws(
        () => parseArgs([
            '--phase=before',
            '--matrix=ai361-lod',
            '--defer-performance-to=AI537'
        ]),
        /valid only for --matrix=ai361-lod --phase=after/
    );
    assert.throws(
        () => parseArgs([
            '--phase=after',
            '--matrix=material',
            '--defer-performance-to=AI537'
        ]),
        /valid only for --matrix=ai361-lod --phase=after/
    );
    assert.throws(
        () => parseArgs([
            '--phase=after',
            '--matrix=ai361-lod',
            '--defer-performance-to=AI536'
        ]),
        /must be exactly AI537/
    );
});

test('AI 362 validation matrix covers every required clean, diagnostic, lighting, boundary, fallback, and motion role', () => {
    const recipes = buildAi362ValidationRecipes();
    assert.equal(recipes.length, 114);
    assert.equal(recipes.filter((entry) => !entry.motionPath).length, 83);
    assert.equal(recipes.filter((entry) => entry.motionPath).length, 31);
    assert.equal(recipes.filter((entry) => entry.diagnosticOverlay).length, 40);
    assert.equal(recipes.filter((entry) => entry.repeatOfRecipeId).length, 7);
    assert.equal(recipes.filter((entry) => entry.baselineRecipeId).length, 36);
    assert.equal(recipes.filter((entry) => entry.approvalDiagnosticSource).length, 1);
    assert.equal(recipes.filter((entry) => entry.validationRole === 'height_inspection').length, 14);
    assert.deepEqual(
        new Set(recipes.filter((entry) => entry.validationRole === 'height_inspection').map((entry) => entry.heightInspectionMeters)),
        new Set([0.30, 0.50, 1.00, 1.50, 2.00, 3.00, 5.00])
    );
    assert.deepEqual(
        new Set(recipes.filter((entry) => entry.validationRole === 'general_view').map((entry) => entry.id.replace(/^(clean|diagnostic)_view_/, ''))),
        new Set(['grazing', 'forward', 'oblique', 'top_down', 'bus', 'tree', 'far'])
    );
    assert.deepEqual(
        new Set(recipes.filter((entry) => entry.validationRole === 'boundary_view').map((entry) => entry.boundaryView)),
        new Set(['straight', 'curve', 'diagonal', 'inside_corner', 'outside_corner', 'irregular', 'low_side', 'substrate', 'tree_substrate'])
    );
    const lighting = recipes.filter((entry) => entry.validationRole === 'lighting_critical');
    assert.equal(lighting.length, 24);
    assert.deepEqual(new Set(lighting.map((entry) => entry.lighting)), new Set(['daylight', 'overcast', 'golden', 'night']));
    assert.deepEqual(new Set(lighting.map((entry) => entry.lightingCriticalRole)), new Set(['material', 'edge', 'handoff']));
    assert.deepEqual(
        new Set(recipes.filter((entry) => entry.validationRole === 'fallback').map((entry) => entry.fallbackMode)),
        new Set(['low_quality', 'geometry_disabled'])
    );
    assert.deepEqual(
        Object.fromEntries(['forward', 'reverse', 'strafe', 'flyover'].map((motionPath) => [
            motionPath,
            recipes.filter((entry) => entry.motionPath === motionPath).length
        ])),
        { forward: 10, reverse: 10, strafe: 4, flyover: 7 }
    );
    assert.deepEqual(
        Object.fromEntries(['forward', 'reverse', 'strafe', 'flyover'].map((motionPath) => [
            motionPath,
            recipes.filter((entry) => entry.motionPath === motionPath && !entry.repeatOfRecipeId).length
        ])),
        { forward: 9, reverse: 9, strafe: 3, flyover: 6 }
    );
    const staticPairs = new Map();
    for (const recipe of recipes.filter((entry) => !entry.motionPath && entry.pairId)) {
        const variants = staticPairs.get(recipe.pairId) ?? [];
        variants.push(recipe.captureVariant);
        staticPairs.set(recipe.pairId, variants);
    }
    assert.equal(staticPairs.size, 40);
    assert.equal([...staticPairs.values()].every((variants) => (
        variants.length === 2
        && variants.includes('clean')
        && variants.includes('diagnostic_overlay')
    )), true);
    const stationary = recipes.filter((entry) => entry.stationaryHandoff);
    assert.equal(stationary.length, 9);
    assert.deepEqual(new Set(stationary.map((entry) => entry.handoffId)), new Set([
        'close_billboard',
        'billboard_middle',
        'middle_texture'
    ]));
    assert.equal(stationary.filter((entry) => entry.captureVariant === 'clean_repeat').length, 3);
    assert.equal(recipes.find((entry) => entry.id === 'clean_boundary_tree_substrate').evidenceIds.includes('tree_substrate'), true);
    assert.equal(recipes.find((entry) => entry.id === 'diagnostic_height_150').approvalDiagnosticSource, true);

    const options = parseArgs(['--phase=after', '--matrix=ai362-validation']);
    assert.equal(options.output, 'tests/artifacts/screens/grass/ai362');
    assert.throws(
        () => parseArgs(['--phase=before', '--matrix=ai362-validation']),
        /requires --phase=after/
    );
});

test('AI 362 measurements-only mode is accepted only for the complete AFTER validation matrix', () => {
    const options = parseArgs([
        '--phase=after',
        '--matrix=ai362-validation',
        '--measurements-only'
    ]);
    assert.equal(options.measurementsOnly, true);
    assert.equal(options.output, 'tests/artifacts/screens/grass/ai362');
    assert.throws(
        () => parseArgs(['--phase=after', '--matrix=material', '--measurements-only']),
        /requires --matrix=ai362-validation --phase=after/
    );
    assert.throws(
        () => parseArgs(['--phase=after', '--matrix=ai361-lod', '--measurements-only']),
        /requires --matrix=ai362-validation --phase=after/
    );
    assert.throws(
        () => parseArgs(['--phase=before', '--matrix=ai362-validation', '--measurements-only']),
        /requires --phase=after/
    );
    assert.throws(
        () => parseArgs([
            '--phase=after',
            '--matrix=ai362-validation',
            '--measurements-only',
            '--recipes=clean_height_030'
        ]),
        /cannot be combined with --recipes/
    );
    assert.throws(
        () => parseArgs([
            '--phase=after',
            '--matrix=ai362-validation',
            '--measurements-only',
            '--overwrite'
        ]),
        /cannot be combined with --overwrite/
    );
    assert.throws(
        () => parseArgs(['--measurements-only', '--inspect-boundary']),
        /cannot be combined with --inspect-boundary/
    );
});

test('AI 362 measurements-only verifier returns the exact canonical capture order', async () => {
    const fixture = makeAi362MeasurementsOnlyFixture();
    fixture.manifest.captures.reverse();
    const verified = await verifyAi362MeasurementsOnlyManifest(
        fixture.manifest,
        fixture.outputRoot,
        { readFile: fixture.readFileImpl }
    );
    assert.equal(verified.length, 114);
    assert.deepEqual(
        verified.map((entry) => entry.recipeId),
        buildAi362ValidationRecipes().map((recipe) => recipe.id)
    );
});

test('AI 362 measurements-only verifier rejects missing manifests and PNG files', async () => {
    const fixture = makeAi362MeasurementsOnlyFixture();
    await assert.rejects(
        verifyAi362MeasurementsOnlyManifest(null, fixture.outputRoot, { readFile: fixture.readFileImpl }),
        /requires an existing capture manifest/
    );
    const first = fixture.manifest.captures[0];
    fixture.files.delete(path.resolve(REPO_ROOT, first.file));
    await assert.rejects(
        verifyAi362MeasurementsOnlyManifest(
            fixture.manifest,
            fixture.outputRoot,
            { readFile: fixture.readFileImpl }
        ),
        /PNG is missing for recipe/
    );
});

test('AI 362 measurements-only verifier rejects outside-output paths and non-native metadata', async () => {
    const outside = makeAi362MeasurementsOnlyFixture();
    outside.manifest.captures[0].file = 'tests/artifacts/screens/grass/outside.png';
    await assert.rejects(
        verifyAi362MeasurementsOnlyManifest(
            outside.manifest,
            outside.outputRoot,
            { readFile: outside.readFileImpl }
        ),
        /must use output-local file/
    );

    const metadata = makeAi362MeasurementsOnlyFixture();
    metadata.manifest.captures[0].canvas.rendererPixelRatio = 2;
    await assert.rejects(
        verifyAi362MeasurementsOnlyManifest(
            metadata.manifest,
            metadata.outputRoot,
            { readFile: metadata.readFileImpl }
        ),
        /lacks exact native lossless PNG\/canvas metadata/
    );
});

test('AI 362 measurements-only verifier rejects wrong PNG dimensions and SHA-256', async () => {
    const dimensions = makeAi362MeasurementsOnlyFixture();
    const dimensionEntry = dimensions.manifest.captures[0];
    const wrongSizePng = makePngHeader(1920, 1080);
    dimensions.files.set(path.resolve(REPO_ROOT, dimensionEntry.file), wrongSizePng);
    dimensionEntry.contentSha256 = createHash('sha256').update(wrongSizePng).digest('hex');
    await assert.rejects(
        verifyAi362MeasurementsOnlyManifest(
            dimensions.manifest,
            dimensions.outputRoot,
            { readFile: dimensions.readFileImpl }
        ),
        /is 1920x1080, expected 3840x2160/
    );

    const hash = makeAi362MeasurementsOnlyFixture();
    hash.manifest.captures[0].contentSha256 = '0'.repeat(64);
    await assert.rejects(
        verifyAi362MeasurementsOnlyManifest(
            hash.manifest,
            hash.outputRoot,
            { readFile: hash.readFileImpl }
        ),
        /SHA-256 mismatch/
    );
});

test('AI 362 measurements-only verifier rejects duplicate, missing, and unexpected recipes', async () => {
    const duplicate = makeAi362MeasurementsOnlyFixture();
    duplicate.manifest.captures[1] = { ...duplicate.manifest.captures[0] };
    await assert.rejects(
        verifyAi362MeasurementsOnlyManifest(
            duplicate.manifest,
            duplicate.outputRoot,
            { readFile: duplicate.readFileImpl }
        ),
        /duplicate recipe/
    );

    const missing = makeAi362MeasurementsOnlyFixture();
    missing.manifest.captures.pop();
    await assert.rejects(
        verifyAi362MeasurementsOnlyManifest(
            missing.manifest,
            missing.outputRoot,
            { readFile: missing.readFileImpl }
        ),
        /requires exactly 114 manifest captures; found 113/
    );

    const unexpected = makeAi362MeasurementsOnlyFixture();
    unexpected.manifest.captures[0].recipeId = 'unexpected_recipe';
    await assert.rejects(
        verifyAi362MeasurementsOnlyManifest(
            unexpected.manifest,
            unexpected.outputRoot,
            { readFile: unexpected.readFileImpl }
        ),
        /found unexpected recipe/
    );
});

test('AI 362 measurements-only merge replaces all verified recipes without deletion or duplication', async () => {
    const fixture = makeAi362MeasurementsOnlyFixture();
    const verified = await verifyAi362MeasurementsOnlyManifest(
        fixture.manifest,
        fixture.outputRoot,
        { readFile: fixture.readFileImpl }
    );
    const diagnostics = {
        measurementsOnly: true,
        costSamples: [{ sampleId: 'fresh' }],
        ai362Gate: { pass: true }
    };
    const result = mergeCaptureManifest(
        fixture.manifest,
        'after',
        verified,
        diagnostics,
        { replaceRecipeIds: buildAi362ValidationRecipes().map((recipe) => recipe.id) }
    );
    assert.equal(result.captures.length, 114);
    assert.equal(new Set(result.captures.map((entry) => entry.recipeId)).size, 114);
    assert.deepEqual(result.diagnosticsByPhase.after.costSamples, [{ sampleId: 'fresh' }]);
    assert.deepEqual(result.ai362GateByPhase.after, { pass: true });
    assert.equal(result.captures[0], verified[0]);
});

function makeLodCaptures(phase = 'before') {
    const recipes = buildLodCaptureRecipes(phase);
    const pairIndexes = new Map();
    return recipes.map((recipe, index) => {
        if (recipe.pairId && !pairIndexes.has(recipe.pairId)) pairIndexes.set(recipe.pairId, index);
        const cameraIndex = recipe.pairId ? pairIndexes.get(recipe.pairId) : index;
        return ({
        phase,
        matrix: 'ai361-lod',
        recipeId: recipe.id,
        pairId: recipe.pairId ?? null,
        hierarchyEvidenceMode: recipe.hierarchyEvidenceMode ?? null,
        handoffId: recipe.handoffId ?? null,
        handoffOffsetMeters: recipe.handoffOffsetMeters ?? null,
        motionPath: recipe.motionPath ?? null,
        motionElapsedMs: recipe.motionElapsedMs ?? null,
        motionProgress: recipe.motionProgress ?? null,
        motionCheckpoint: recipe.motionCheckpoint ?? null,
        motionDeterministicSeek: phase === 'after' && !!recipe.motionPath,
        lodHysteresisReset: phase === 'after',
        contentSha256: index.toString(16).padStart(64, '0'),
        materialVersion: 'v2',
        qualityPreset: 'default',
        lightingPreset: recipe.lighting,
        exposure: 1,
        png: { width: 3840, height: 2160 },
        camera: {
            position: { x: cameraIndex, y: 1, z: -3 },
            target: { x: 0, y: 0.04, z: 0 }
        },
        cost: {
            combinedVisibleGrassTriangles: 170000,
            grassLogicalDrawCalls: 6,
            coverageLogicalDrawCalls: 2,
            geometryBeyondCutoff: 0
        }
        });
    });
}

function makeLodHandoffPngs(darkenedPairId = null) {
    const pngs = new Map();
    for (const recipe of buildLodCaptureRecipes('after')) {
        if (recipe.evidenceGroup !== 'handoff_pair') continue;
        const darkenedColumns = recipe.pairId === darkenedPairId
            && recipe.hierarchyEvidenceMode === 'auto'
            ? 20
            : 0;
        pngs.set(recipe.id, makeCardBandPng(darkenedColumns));
    }
    return pngs;
}

function makeLodPerformanceGate(gpuMeanMs = 1.2, matrix = 'ai361-lod', mutateCostSamples = null) {
    const sampleIds = [
        'quality_low',
        'quality_default',
        'quality_high',
        'default_worst_view',
        'default_transition_overlap'
    ];
    const costSamples = sampleIds.map((sampleId) => {
        const measurement = {
            status: 'complete',
            warmup: { frames: 120, durationMs: 2000, stableZeroUploadFrames: 30 },
            cpu: { samplesMs: Array.from({ length: 120 }, () => 0.4) },
            frame: { samplesMs: Array.from({ length: 120 }, () => 16) },
            gpu: {
                supported: true,
                active: true,
                backend: 'webgl2_ext_disjoint_timer_query',
                disjointCount: 0,
                samples: Array.from({ length: 30 }, (_, index) => ({
                    sequence: index + 1,
                    submissionSequence: index + 1,
                    ms: gpuMeanMs
                }))
            },
            graphics: { hardwareAccelerated: true },
            bufferUpdates: { samples: Array.from({ length: 120 }, () => 0) }
        };
        const performanceGate = evaluateGrassPerformanceMeasurement(measurement);
        return {
            phase: 'after',
            matrix,
            sampleId,
            statistic: 'arithmetic_mean',
            resolution: '1920x1080',
            grassCpuMs: performanceGate.measurements.cpu.meanMs,
            wholeFrameGpuMs: performanceGate.measurements.gpu.meanMs,
            accentTriangles: 16,
            accentLogicalDrawCalls: 1,
            performanceGate,
            budget: {
                structuralPass: true,
                performancePass: performanceGate.pass,
                pass: performanceGate.pass
            }
        };
    });
    if (typeof mutateCostSamples === 'function') mutateCostSamples(costSamples);
    return evaluateLodPerformanceCostGate(costSamples, 'after', matrix);
}

test('AI 361 capture gate requires a complete V2 4K matrix, budgets, cutoff, and deterministic after motion', () => {
    const before = evaluateLodCaptureSet(makeLodCaptures('before'), 'before');
    assert.equal(before.gateId, 'grass-lod-hierarchy-capture-v2');
    assert.equal(before.staticCaptureCount, 10);
    assert.equal(before.motionCaptureCount, 5);
    assert.equal(before.uniqueMotionFrames, true);
    assert.equal(before.pass, true);

    const afterCaptures = makeLodCaptures('after');
    const appearanceGate = evaluateLodHandoffAppearancePairs(afterCaptures, makeLodHandoffPngs());
    const performanceGate = makeLodPerformanceGate();
    assert.equal(appearanceGate.pairs.length, 3);
    assert.equal(appearanceGate.pass, true);
    assert.equal(performanceGate.pass, true);
    const after = evaluateLodCaptureSet(afterCaptures, 'after', appearanceGate, performanceGate);
    assert.equal(after.staticCaptureCount, 33);
    assert.equal(after.motionCaptureCount, 27);
    assert.equal(after.handoffPairsAligned, true);
    assert.equal(after.pass, true);

    for (const mutate of [
        (captures) => captures.pop(),
        (captures) => { captures[0].png.width = 1920; },
        (captures) => { captures[0].materialVersion = 'v1'; },
        (captures) => { captures[0].cost.combinedVisibleGrassTriangles = 200001; },
        (captures) => { captures[0].cost.grassLogicalDrawCalls = 13; },
        (captures) => { captures[0].cost.coverageLogicalDrawCalls = 3; },
        (captures) => {
            captures[0].cost.grassLogicalDrawCalls = 12;
            captures[0].cost.coverageLogicalDrawCalls = 2;
        },
        (captures) => { captures[0].cost.geometryBeyondCutoff = 1; },
        (captures) => { captures[0].cost.geometryBeyondCutoff = null; },
        (captures) => { delete captures[0].cost.geometryBeyondCutoff; },
        (captures) => { captures[0].cost.geometryBeyondCutoff = Number.NaN; },
        (captures) => { captures.find((entry) => entry.motionPath).motionDeterministicSeek = false; },
        (captures) => { captures[0].lodHysteresisReset = false; },
        (captures) => {
            const pair = captures.filter((entry) => entry.pairId === 'handoff_close_billboard');
            pair[1].camera.position.x += 1;
        },
        (captures) => {
            const motion = captures.filter((entry) => entry.motionPath === 'flyover');
            motion[1].contentSha256 = motion[0].contentSha256;
        }
    ]) {
        const captures = structuredClone(makeLodCaptures('after'));
        mutate(captures);
        const mutatedAppearance = evaluateLodHandoffAppearancePairs(captures, makeLodHandoffPngs());
        assert.equal(evaluateLodCaptureSet(captures, 'after', mutatedAppearance, performanceGate).pass, false);
    }

    const darkenedCaptures = makeLodCaptures('after');
    const darkenedAppearance = evaluateLodHandoffAppearancePairs(
        darkenedCaptures,
        makeLodHandoffPngs('handoff_close_billboard')
    );
    assert.equal(darkenedAppearance.pass, false);
    assert.equal(darkenedAppearance.pairs.find((pair) => pair.pairId === 'handoff_close_billboard').measurement.pass, false);
    assert.equal(evaluateLodCaptureSet(darkenedCaptures, 'after', darkenedAppearance, performanceGate).pass, false);

    const gpuOverflow = makeLodPerformanceGate(1.500001);
    assert.equal(gpuOverflow.pass, false);
    assert.equal(gpuOverflow.evidenceComplete, true);
    assert.equal(gpuOverflow.structuralPass, true);
    assert.equal(gpuOverflow.performancePass, false);
    const gpuOverflowFinalGate = evaluateLodCaptureSet(
        makeLodCaptures('after'),
        'after',
        appearanceGate,
        gpuOverflow
    );
    assert.equal(gpuOverflowFinalGate.performanceCostPass, false);
    assert.equal(gpuOverflowFinalGate.performanceRequired, true);
    assert.deepEqual(gpuOverflowFinalGate.performanceOwnership, { status: 'required', owner: 'AI361' });
    assert.equal(gpuOverflowFinalGate.pass, false);

    const wrongOwnerGate = evaluateLodCaptureSet(
        makeLodCaptures('after'),
        'after',
        appearanceGate,
        gpuOverflow,
        { deferPerformanceTo: 'AI536' }
    );
    assert.equal(wrongOwnerGate.performanceRequired, true);
    assert.deepEqual(wrongOwnerGate.performanceOwnership, { status: 'required', owner: 'AI361' });
    assert.equal(wrongOwnerGate.pass, false);

    const deferredGate = evaluateLodCaptureSet(
        makeLodCaptures('after'),
        'after',
        appearanceGate,
        gpuOverflow,
        { deferPerformanceTo: 'AI537' }
    );
    assert.equal(deferredGate.performanceGate.pass, false);
    assert.equal(deferredGate.performanceCostPass, false);
    assert.equal(deferredGate.performanceRequired, false);
    assert.equal(deferredGate.performanceEvidenceComplete, true);
    assert.equal(deferredGate.performanceStructuralPass, true);
    assert.deepEqual(deferredGate.performanceOwnership, { status: 'deferred', owner: 'AI537' });
    assert.equal(deferredGate.visualFunctionalPass, true);
    assert.equal(deferredGate.pass, true);

    const deferredManifest = mergeCaptureManifest(null, 'after', makeLodCaptures('after'), {
        lodPerformanceGate: gpuOverflow,
        lodGate: deferredGate
    });
    assert.equal(deferredManifest.lodPerformanceGateByPhase.after.pass, false);
    assert.equal(deferredManifest.lodGateByPhase.after.performanceCostPass, false);
    assert.equal(deferredManifest.lodGateByPhase.after.performanceRequired, false);
    assert.deepEqual(
        deferredManifest.lodGateByPhase.after.performanceOwnership,
        { status: 'deferred', owner: 'AI537' }
    );
    assert.equal(deferredManifest.lodGateByPhase.after.pass, true);

    const deferredWithoutMeasurements = evaluateLodCaptureSet(
        makeLodCaptures('after'),
        'after',
        appearanceGate,
        null,
        { deferPerformanceTo: 'AI537' }
    );
    assert.equal(deferredWithoutMeasurements.performanceEvidenceComplete, false);
    assert.equal(deferredWithoutMeasurements.pass, false);

    const deferredDarkenedGate = evaluateLodCaptureSet(
        darkenedCaptures,
        'after',
        darkenedAppearance,
        gpuOverflow,
        { deferPerformanceTo: 'AI537' }
    );
    assert.equal(deferredDarkenedGate.performanceRequired, false);
    assert.equal(deferredDarkenedGate.visualFunctionalPass, false);
    assert.equal(deferredDarkenedGate.pass, false);

    const structurallyInvalidPerformanceGate = structuredClone(gpuOverflow);
    structurallyInvalidPerformanceGate.structuralPass = false;
    const deferredStructuralFailure = evaluateLodCaptureSet(
        makeLodCaptures('after'),
        'after',
        appearanceGate,
        structurallyInvalidPerformanceGate,
        { deferPerformanceTo: 'AI537' }
    );
    assert.equal(deferredStructuralFailure.performanceStructuralPass, false);
    assert.equal(deferredStructuralFailure.pass, false);
});

function makeAi362Captures() {
    const recipes = buildAi362ValidationRecipes();
    const recipeIndexes = new Map(recipes.map((recipe, index) => [recipe.id, index]));
    const pairIndexes = new Map();
    const captures = recipes.map((recipe, index) => {
        if (recipe.pairId && !pairIndexes.has(recipe.pairId)) pairIndexes.set(recipe.pairId, index);
        const identityRecipe = recipe.repeatOfRecipeId
            ? recipes[recipeIndexes.get(recipe.repeatOfRecipeId)]
            : recipe;
        const identityIndex = recipeIndexes.get(identityRecipe.id);
        const cameraIndex = identityRecipe.pairId ? pairIndexes.get(identityRecipe.pairId) : identityIndex;
        const contentIndex = recipe.repeatOfRecipeId ? identityIndex : index;
        const heightMeters = Number(recipe.heightInspectionMeters ?? recipe.heightMeters ?? 1.5);
        const handoffTransitionState = {
            close_billboard: 'near_to_billboard',
            billboard_middle: 'billboard_to_middle',
            middle_texture: 'middle_to_texture'
        }[recipe.handoffId] ?? null;
        const validMotionCenter = recipe.motionCheckpoint === 'center'
            && recipe.handoffId === 'close_billboard';
        const validStationaryTransition = recipe.stationaryHandoff === true
            && handoffTransitionState != null;
        const invalidMotionCenterState = recipe.motionCheckpoint === 'center'
            ? {
                billboard_middle: 'billboard',
                middle_texture: 'middle'
            }[recipe.handoffId] ?? null
            : null;
        const transitionState = validMotionCenter || validStationaryTransition
            ? handoffTransitionState
            : invalidMotionCenterState;
        const transitionProgress = validMotionCenter || validStationaryTransition ? 0.5 : 0;
        const weights = transitionState === 'near_to_billboard'
            ? { near: 0.5, billboard: 0.5, middle: 0, texture: 0 }
            : (transitionState === 'billboard_to_middle'
                ? { near: 0, billboard: 0.5, middle: 0.5, texture: 0 }
                : (transitionState === 'middle_to_texture'
                    ? { near: 0, billboard: 0, middle: 0.5, texture: 0.5 }
                    : (transitionState === 'billboard'
                        ? { near: 0, billboard: 1, middle: 0, texture: 0 }
                        : (transitionState === 'middle'
                            ? { near: 0, billboard: 0, middle: 1, texture: 0 }
                            : { near: 1, billboard: 0, middle: 0, texture: 0 }))));
        const lowQualityFallback = recipe.fallbackMode === 'low_quality'
            && recipe.quality === 'low';
        return {
            phase: 'after',
            matrix: 'ai362-validation',
            role: recipe.role,
            recipeId: recipe.id,
            pairId: recipe.pairId ?? null,
            evidenceGroup: recipe.evidenceGroup ?? null,
            validationRole: recipe.validationRole ?? null,
            captureVariant: recipe.captureVariant ?? null,
            evidenceIds: [...(recipe.evidenceIds ?? [])],
            approvalDiagnosticSource: recipe.approvalDiagnosticSource === true,
            baselineRecipeId: recipe.baselineRecipeId ?? null,
            repeatOfRecipeId: recipe.repeatOfRecipeId ?? null,
            stationaryHandoff: recipe.stationaryHandoff === true,
            diagnosticOverlay: recipe.diagnosticOverlay === true,
            diagnosticOverlayAttached: recipe.diagnosticOverlay === true,
            uiFree: recipe.diagnosticOverlay !== true,
            boundaryView: recipe.boundaryView ?? null,
            boundaryTarget: recipe.boundaryTarget ?? null,
            lightingCriticalRole: recipe.lightingCriticalRole ?? null,
            fallbackMode: recipe.fallbackMode ?? null,
            evidenceMode: recipe.evidenceMode ?? null,
            hierarchyEvidenceMode: recipe.hierarchyEvidenceMode ?? null,
            handoffId: recipe.handoffId ?? null,
            motionPath: recipe.motionPath ?? null,
            motionElapsedMs: recipe.motionElapsedMs ?? null,
            motionProgress: recipe.motionProgress ?? null,
            motionCheckpoint: recipe.motionCheckpoint ?? null,
            motionDeterministicSeek: !!recipe.motionPath,
            lodHysteresisReset: true,
            contentSha256: contentIndex.toString(16).padStart(64, '0'),
            lightingPreset: recipe.lighting,
            qualityPreset: recipe.quality,
            activeLodTier: 'near',
            snapshotContractVersion: 10,
            materialVersion: 'v2',
            materialDiagnostics: {
                midCompiledShaderSignature: 'variant:midCluster:v2',
                midMaterialId: 'pbr.grass_low_cut_maintained_v2',
                accentMaterialId: 'pbr.grass_low_cut_maintained_v2',
                midEmissiveIntensity: 0,
                accentEmissiveIntensity: 0
            },
            camera: {
                position: { x: cameraIndex, y: heightMeters, z: -3 },
                target: { x: 0, y: 0.04, z: 0 },
                heightMeters,
                fovDegrees: 50,
                aspect: 16 / 9,
                nearMeters: 0.02,
                farMeters: 5000
            },
            exposure: 1,
            canvas: {
                drawingBufferWidth: 3840,
                drawingBufferHeight: 2160,
                rendererPixelRatio: 1
            },
            png: { width: 3840, height: 2160, format: 'png', lossless: true },
            frameMetrics: {
                meanLuminance: 0.3,
                medianLuminance: 0.29,
                meanSaturation: 0.2,
                brightPixelFraction: 0.0001
            },
            coverageDiagnostics: {
                boundarySignature: 'grass-coverage-v2-ai362',
                hardExclusionIntrusions: 0,
                grassOnsetIntrusions: 0,
                ineligibleCutEdgeRoots: 0,
                antialiasWidthMeters: 0.01,
                structuralBaseHeightMeters: 0.0275,
                visibleBladeTipMinMeters: 0.04,
                visibleBladeTipMaxMeters: 0.075,
                occupiedSamples: 10,
                excludedSamples: 10,
                rootEligibleSamples: 10,
                sourceLoopIdentity: 'road-engine-loops-v2'
            },
            nearDiagnostics: {
                boundarySignature: 'grass-coverage-v2-ai362',
                placementSignature: 'near-carpet-v2-ai362',
                candidateBins: 128,
                eligibleBins: 128,
                representedBins: 128,
                unrepresentedEligibleBins: 0,
                exactPostcheckFailures: 0,
                ineligibleRoots: 0,
                instanceCount: 384,
                lastBufferUpdates: 0
            },
            hierarchyDiagnostics: lowQualityFallback ? {
                enabled: false,
                schema: 'bus-simulator.grass-cohesive-field-renderer',
                version: 2,
                boundarySignature: null,
                placementSignature: null,
                candidateUnits: 0,
                eligibleUnits: 0,
                representedUnits: 0,
                unrepresentedEligibleUnits: 0,
                exactPostcheckFailures: 0,
                exactEnvelopeFailures: 0,
                overlapUnits: 0,
                instances: 0,
                triangles: 0,
                drawCalls: 0,
                billboard: { instances: 0, triangles: 0, drawCalls: 0 },
                middle: { instances: 0, triangles: 0, drawCalls: 0 },
                geometryBeyondCutoff: 0,
                cutoffRejectedUnits: 0,
                lastBufferUpdates: 0,
                materialPaths: 0
            } : {
                enabled: true,
                schema: 'bus-simulator.grass-cohesive-field-renderer',
                version: 2,
                coverageMode: 'exact_polygon',
                boundarySignature: 'grass-coverage-v2-ai362',
                placementSignature: 'cohesive-field-v2-ai362',
                candidateUnits: 256,
                eligibleUnits: 256,
                representedUnits: 256,
                unrepresentedEligibleUnits: 0,
                exactPostcheckFailures: 0,
                exactEnvelopeFailures: 0,
                overlapUnits: 16,
                instances: 256,
                geometryBeyondCutoff: 0,
                cutoffRejectedUnits: 0,
                lastBufferUpdates: 0,
                atlasRole: 'midCluster',
                atlasMaps: [
                    'midClusterColor',
                    'midClusterCoverage',
                    'midClusterNormal',
                    'midClusterRoughness',
                    'midClusterAo'
                ],
                resolvedMaterialId: 'pbr.grass_low_cut_maintained_v2',
                materialPaths: 1,
                billboard: {
                    instances: 64,
                    triangles: 128,
                    drawCalls: 1,
                    cardsPerUnit: 1
                },
                middle: {
                    instances: 64,
                    triangles: 256,
                    drawCalls: 1,
                    cardsPerUnit: 2
                },
                alphaCutoff: 0.35,
                alphaToCoverage: true,
                transparent: false,
                depthWrite: true
            },
            accentDiagnostics: {
                boundarySignature: 'grass-coverage-v2-ai362',
                placementSignature: 'localized-accent-v2-ai362',
                candidateRoots: 16,
                eligibleRoots: 16,
                representedRoots: 16,
                unrepresentedEligibleRoots: 0,
                exactPostcheckFailures: 0,
                exactEnvelopeFailures: 0,
                substrateOwnership: 'coverage_tree_hole',
                wornPatches: 0,
                wornTriangles: 0,
                wornDrawCalls: 0,
                wornMaterialPaths: 0,
                geometryBeyondCutoff: 0,
                lastBufferUpdates: 0,
                atlasRole: 'accentClump',
                resolvedMaterialId: 'pbr.grass_low_cut_maintained_v2',
                materialPaths: 1,
                alphaCutoff: 0.35,
                alphaToCoverage: true,
                transparent: false,
                depthWrite: true
            },
            lodDiagnostics: {
                version: 2,
                activeTier: 'near',
                weights,
                transitionState: transitionState ?? 'texture_only',
                transitionProgress,
                geometryBeyondCutoff: 0
            },
            cost: {
                combinedVisibleGrassTriangles: 170000,
                combinedVisibleGrassLogicalDrawCalls: 6,
                coverageLogicalDrawCalls: 2,
                totalRendererDrawCalls: 16,
                trianglesByTier: { near: 60000, billboard: 2000, middle: 12000, accent: 16 },
                geometryBeyondCutoff: 0
            }
        };
    });
    const enrichment = enrichAi362ApprovalDiagnosticSource(captures);
    assert.equal(enrichment.enriched, true);
    assert.equal(captures.filter((entry) => entry.approvalDiagnosticsEnriched === true).length, 1);
    return captures;
}

function makeAi362BaselineReference(captures) {
    const baselineCaptures = [];
    const fileVerifications = [];
    for (const recipe of buildAi362ValidationRecipes().filter((entry) => entry.baselineRecipeId)) {
        const current = captures.find((entry) => entry.recipeId === recipe.id);
        baselineCaptures.push({
            ...structuredClone(current),
            phase: 'after',
            matrix: 'ai361-lod',
            recipeId: recipe.baselineRecipeId,
            file: `tests/artifacts/screens/grass/ai361/after_${recipe.baselineRecipeId}.png`
        });
        fileVerifications.push({
            recipeId: recipe.baselineRecipeId,
            exists: true,
            losslessPng: true,
            width: 3840,
            height: 2160,
            contentSha256: current.contentSha256
        });
    }
    return evaluateAi362BaselineReference({
        schema: 'grass-lab-capture-manifest-v2',
        captures: baselineCaptures,
        lodGateByPhase: {
            after: { pass: true, visualFunctionalPass: true }
        }
    }, {
        sourceManifestSha256: 'f'.repeat(64),
        fileVerifications
    });
}

function makeAi362Native4kTiming() {
    const performanceMeasurement = {
        status: 'complete',
        warmup: { frames: 120, durationMs: 2000, stableZeroUploadFrames: 30 },
        cpu: { samplesMs: Array.from({ length: 120 }, () => 0.4) },
        frame: { samplesMs: Array.from({ length: 120 }, () => 16) },
        gpu: {
            supported: false,
            active: false,
            backend: 'unavailable',
            notMeasuredReason: 'SwiftShader does not expose GPU timer queries',
            disjointCount: 0,
            samples: []
        },
        graphics: { hardwareAccelerated: false, renderer: 'SwiftShader' },
        bufferUpdates: { samples: Array.from({ length: 120 }, () => 0) }
    };
    const performanceGate = evaluateGrassPerformanceMeasurement(performanceMeasurement);
    return {
        phase: 'after',
        matrix: 'ai362-validation',
        sampleId: 'native4k_default_billboard_middle',
        resolution: '3840x2160',
        statistic: 'arithmetic_mean',
        informationalOnly: true,
        recorded: hasCompleteAi362Native4kTimingEvidence(performanceGate),
        hardware: {
            host: { totalMemoryBytes: 1 },
            browser: { graphics: { renderer: 'SwiftShader', hardwareAccelerated: false } }
        },
        performanceMeasurement,
        performanceGate
    };
}

function makeAi362GateOptions(captures) {
    const baselineReference = makeAi362BaselineReference(captures);
    const regressionGate = evaluateAi362RegressionGate(captures, { baselineReference });
    return {
        performanceOwnership: 'deferred_to_ai537',
        baselineReference,
        native4kTiming: makeAi362Native4kTiming(),
        regressionGate
    };
}

test('AI 362 gate passes only complete visual/functional evidence with five failing rows deferred to AI537', () => {
    const performanceGate = makeLodPerformanceGate(1.500001, 'ai362-validation');
    assert.equal(performanceGate.evidenceComplete, true);
    assert.equal(performanceGate.checks.length, 5);
    assert.equal(performanceGate.structuralPass, true);
    assert.equal(performanceGate.performancePass, false);
    assert.equal(performanceGate.pass, false);

    const captures = makeAi362Captures();
    const gateOptions = makeAi362GateOptions(captures);
    const approvalSource = captures.find((entry) => entry.approvalDiagnosticSource === true);
    const ordinaryCapture = captures.find((entry) => entry.approvalDiagnosticSource !== true);
    assert.equal(ordinaryCapture.coverageDiagnostics.signedDistanceOrientation, undefined);
    assert.equal(ordinaryCapture.coverageDiagnostics.roadEngineSourceLoopIdentity, undefined);
    assert.equal(ordinaryCapture.coverageDiagnostics.boundarySignatureStable, undefined);
    assert.equal(ordinaryCapture.hierarchyDiagnostics.handoffs, undefined);
    assert.equal(approvalSource.coverageDiagnostics.signedDistanceOrientation, 'positive_grass_negative_exclusion');
    assert.equal(
        approvalSource.coverageDiagnostics.roadEngineSourceLoopIdentity,
        approvalSource.coverageDiagnostics.sourceLoopIdentity
    );
    assert.equal(approvalSource.coverageDiagnostics.boundarySignatureStable, true);
    assert.equal(approvalSource.hierarchyDiagnostics.material.sharedByBillboardAndMiddle, true);
    assert.deepEqual(
        approvalSource.lodDiagnostics.transitionSamples.map((entry) => entry.evidenceRecipeId),
        [
            'motion_forward_close_billboard_center',
            'clean_stationary_billboard_middle',
            'clean_stationary_middle_texture'
        ]
    );
    assert.equal(approvalSource.lodDiagnostics.transitionSamples.every((entry) => (
        entry.progress > 0 && entry.progress < 1
    )), true);
    assert.equal(gateOptions.native4kTiming.performanceGate.checks.hardwareAdapter, false);
    assert.equal(gateOptions.native4kTiming.performanceGate.pass, false);
    assert.equal(hasCompleteAi362Native4kTimingEvidence(gateOptions.native4kTiming.performanceGate), true);
    assert.equal(gateOptions.native4kTiming.recorded, true);
    assert.equal(gateOptions.baselineReference.pass, true);
    assert.equal(gateOptions.baselineReference.requiredRecipeCount, 36);
    assert.equal(gateOptions.regressionGate.pass, true);
    assert.equal(gateOptions.regressionGate.results.every((entry) => (
        entry.checks.approvalDiagnosticSourceExact === true
    )), true);
    assert.equal(gateOptions.regressionGate.results.every((entry) => entry.evidenceRecipeIds.length > 0), true);
    const duplicateApprovalSource = structuredClone(captures);
    duplicateApprovalSource[0].approvalDiagnosticSource = true;
    duplicateApprovalSource[0].approvalDiagnosticsEnriched = true;
    const duplicateApprovalRegressionGate = evaluateAi362RegressionGate(duplicateApprovalSource, {
        baselineReference: gateOptions.baselineReference
    });
    assert.equal(duplicateApprovalRegressionGate.pass, false);
    assert.equal(duplicateApprovalRegressionGate.results.every((entry) => (
        entry.checks.approvalDiagnosticSourceExact === false
    )), true);
    const evaluateRegressionMutation = (mutate) => {
        const mutated = structuredClone(captures);
        mutate(mutated);
        return evaluateAi362RegressionGate(mutated, {
            baselineReference: gateOptions.baselineReference
        });
    };
    const missingBoundarySamples = evaluateRegressionMutation((entries) => {
        entries.find((entry) => entry.validationRole === 'boundary_view')
            .coverageDiagnostics.occupiedSamples = 0;
    });
    assert.equal(
        missingBoundarySamples.results.find((entry) => entry.id === 'signed_distance_orientation').pass,
        false
    );
    const mismatchedBoundarySignature = evaluateRegressionMutation((entries) => {
        entries.find((entry) => entry.validationRole === 'boundary_view')
            .coverageDiagnostics.boundarySignature = 'wrong-boundary';
    });
    assert.equal(
        mismatchedBoundarySignature.results.find((entry) => entry.id === 'signed_distance_orientation').pass,
        false
    );
    assert.equal(
        mismatchedBoundarySignature.results.find((entry) => entry.id === 'source_loop_identity').pass,
        false
    );
    const mismatchedSourceIdentity = evaluateRegressionMutation((entries) => {
        entries.find((entry) => entry.validationRole === 'boundary_view')
            .coverageDiagnostics.sourceLoopIdentity = 'wrong-source';
    });
    assert.equal(
        mismatchedSourceIdentity.results.find((entry) => entry.id === 'source_loop_identity').pass,
        false
    );
    const missingHandoffEvidence = evaluateRegressionMutation((entries) => {
        entries.find((entry) => entry.approvalDiagnosticSource)
            .hierarchyDiagnostics.handoffs[0].evidenceRecipeId = 'missing-recipe';
    });
    assert.equal(
        missingHandoffEvidence.results.find((entry) => entry.id === 'both_hidden_handoff_gaps').pass,
        false
    );
    const incompleteRegressionGate = evaluateAi362RegressionGate(captures.slice(1), {
        baselineReference: gateOptions.baselineReference
    });
    assert.equal(incompleteRegressionGate.pass, false);
    assert.equal(incompleteRegressionGate.results.every((entry) => entry.checks.exactCaptureSet === false), true);
    assert.equal(incompleteRegressionGate.results.every((entry) => entry.pass === false), true);
    const gate = evaluateAi362ValidationSet(captures, performanceGate, gateOptions);
    assert.equal(gate.gateId, 'grass-ai362-validation-v1');
    assert.equal(gate.captureCount, 114);
    assert.equal(gate.requiredStaticCaptures, 83);
    assert.equal(gate.requiredMotionCaptures, 31);
    assert.equal(gate.requiredDiagnosticOverlays, 40);
    assert.equal(gate.requiredBaselinePairs, 36);
    assert.equal(gate.requiredDeterministicRepeats, 7);
    assert.equal(gate.requiredPerformanceRows, 5);
    assert.equal(gate.recordedPerformanceRows, 5);
    assert.equal(gate.missingRecipeIds.length, 0);
    assert.equal(gate.staticPairChecks.every((entry) => entry.pass), true);
    assert.equal(gate.baselinePairChecks.every((entry) => entry.pass), true);
    assert.equal(gate.stationaryHandoffChecks.every((entry) => entry.pass), true);
    assert.equal(gate.deterministicRepeatChecks.every((entry) => entry.exactPixelMatch), true);
    assert.equal(gate.uniqueDeterministicMotion, true);
    assert.equal(gate.native4kTimingRecorded, true);
    assert.equal(gate.regressionGatePass, true);
    assert.equal(gate.approvalDiagnosticSourceCount, 1);
    assert.equal(gate.approvalDiagnosticsEnriched, true);
    assert.equal(gate.performanceOwnership, 'deferred_to_ai537');
    assert.equal(gate.performanceOwnershipPass, true);
    assert.equal(gate.performanceRequired, false);
    assert.equal(gate.performanceCostPass, false);
    assert.equal(gate.performanceVerdictRecorded, true);
    assert.equal(gate.performanceStillFailing, true);
    assert.equal(gate.visualFunctionalPass, true);
    assert.equal(gate.pass, true);
    assert.equal(
        gate.checks.find((entry) => entry.recipeId === 'clean_fallback_low').exactCoverageMetadata,
        true
    );

    const crossRouteDuplicate = structuredClone(captures);
    const repeatedSourceIds = new Set(crossRouteDuplicate
        .filter((entry) => entry.repeatOfRecipeId)
        .map((entry) => entry.repeatOfRecipeId));
    const forwardFrame = crossRouteDuplicate.find((entry) => (
        entry.motionPath === 'forward'
        && !entry.repeatOfRecipeId
        && !repeatedSourceIds.has(entry.recipeId)
    ));
    const reverseFrame = crossRouteDuplicate.find((entry) => (
        entry.motionPath === 'reverse'
        && !entry.repeatOfRecipeId
        && !repeatedSourceIds.has(entry.recipeId)
    ));
    reverseFrame.contentSha256 = forwardFrame.contentSha256;
    const crossRouteGate = evaluateAi362ValidationSet(
        crossRouteDuplicate,
        performanceGate,
        gateOptions
    );
    assert.equal(crossRouteGate.motionPathChecks.every((entry) => entry.pass), true);
    assert.equal(crossRouteGate.deterministicRepeatsPass, true);
    assert.equal(crossRouteGate.uniqueDeterministicMotion, true);
    assert.equal(crossRouteGate.pass, true);

    for (const invalidateSharedMaterial of [
        (field) => { field.materialPaths = 2; },
        (field) => { field.atlasRole = 'accentClump'; },
        (field) => { field.atlasMaps = field.atlasMaps.slice(1); },
        (field) => { field.billboard.instances = 0; },
        (field) => { field.middle.cardsPerUnit = 1; }
    ]) {
        const invalidSharedMaterial = structuredClone(captures);
        const sourceField = invalidSharedMaterial.find((entry) => entry.approvalDiagnosticSource)
            .hierarchyDiagnostics;
        invalidateSharedMaterial(sourceField);
        enrichAi362ApprovalDiagnosticSource(invalidSharedMaterial);
        assert.equal(
            invalidSharedMaterial.find((entry) => entry.approvalDiagnosticSource)
                .hierarchyDiagnostics.material.sharedByBillboardAndMiddle,
            false
        );
    }

    const manifest = mergeCaptureManifest(null, 'after', captures, {
        ai362PerformanceGate: performanceGate,
        ai362BaselineReference: gateOptions.baselineReference,
        ai362Native4kTiming: gateOptions.native4kTiming,
        ai362RegressionGate: gateOptions.regressionGate,
        ai362Gate: gate,
        gameplayTouched: false,
        costSamples: [...performanceGate.checks, gateOptions.native4kTiming]
    });
    assert.equal(manifest.ai362PerformanceGateByPhase.after.pass, false);
    assert.equal(manifest.ai362GateByPhase.after.performanceCostPass, false);
    assert.equal(manifest.ai362GateByPhase.after.performanceOwnership, 'deferred_to_ai537');
    assert.equal(manifest.ai362GateByPhase.after.pass, true);
    assert.equal(manifest.ai362BaselineReferenceByPhase.after.pass, true);
    assert.equal(manifest.ai362Native4kTimingByPhase.after.recorded, true);
    assert.equal(manifest.ai362RegressionGateByPhase.after.pass, true);
    assert.equal(manifest.diagnosticsByPhase.after.gameplayTouched, false);
    assert.equal(manifest.diagnosticsByPhase.after.costSamples.at(-1).resolution, '3840x2160');

    for (const mutate of [
        (entries) => entries.pop(),
        (entries) => { entries[0].png.width = 1920; },
        (entries) => { entries[0].canvas.rendererPixelRatio = 2; },
        (entries) => { entries[0].camera.target.x = Number.NaN; },
        (entries) => { entries[0].snapshotContractVersion = 9; },
        (entries) => { entries[0].lightingPreset = 'night'; },
        (entries) => { entries[0].evidenceIds = []; },
        (entries) => { entries.find((entry) => entry.approvalDiagnosticSource).approvalDiagnosticsEnriched = false; },
        (entries) => { entries[0].materialDiagnostics.midCompiledShaderSignature = ''; },
        (entries) => { entries[0].nearDiagnostics.boundarySignature = 'wrong'; },
        (entries) => {
            entries.find((entry) => entry.recipeId === 'clean_fallback_low')
                .hierarchyDiagnostics.billboard.instances = 1;
        },
        (entries) => { entries[0].nearDiagnostics.unrepresentedEligibleBins = 1; },
        (entries) => { entries[0].hierarchyDiagnostics.exactEnvelopeFailures = 1; },
        (entries) => { entries[0].hierarchyDiagnostics.cutoffRejectedUnits = 1; },
        (entries) => { entries[0].accentDiagnostics.wornTriangles = 2; },
        (entries) => { entries[0].coverageDiagnostics.hardExclusionIntrusions = 1; },
        (entries) => { entries[0].cost.combinedVisibleGrassTriangles = 200001; },
        (entries) => { entries[0].lodDiagnostics.geometryBeyondCutoff = 1; },
        (entries) => { entries.find((entry) => entry.motionPath).motionDeterministicSeek = false; },
        (entries) => { entries.find((entry) => entry.stationaryHandoff).nearDiagnostics.lastBufferUpdates = 1; },
        (entries) => { entries.find((entry) => entry.repeatOfRecipeId).contentSha256 = 'a'.repeat(64); },
        (entries) => {
            const motion = entries.filter((entry) => entry.motionPath);
            motion[1].contentSha256 = motion[0].contentSha256;
        },
        (entries) => { entries.find((entry) => entry.diagnosticOverlay).diagnosticOverlayAttached = false; },
        (entries) => {
            const clean = entries.find((entry) => entry.captureVariant === 'clean' && entry.pairId);
            const diagnostic = entries.find((entry) => entry.pairId === clean.pairId && entry.captureVariant === 'diagnostic_overlay');
            diagnostic.contentSha256 = clean.contentSha256;
        },
        (entries) => {
            const pair = entries.filter((entry) => entry.pairId === entries[0].pairId);
            pair[1].camera.position.x += 1;
        }
    ]) {
        const mutated = structuredClone(captures);
        mutate(mutated);
        assert.equal(evaluateAi362ValidationSet(mutated, performanceGate, gateOptions).pass, false);
    }

    assert.equal(evaluateAi362ValidationSet(captures, performanceGate, {
        ...gateOptions,
        performanceOwnership: 'AI362'
    }).pass, false);
    assert.equal(evaluateAi362ValidationSet(captures, null, gateOptions).pass, false);
    const passingTimingGate = evaluateAi362ValidationSet(
        captures,
        makeLodPerformanceGate(1.2, 'ai362-validation'),
        gateOptions
    );
    assert.equal(passingTimingGate.performanceCostPass, true);
    assert.equal(passingTimingGate.performanceStillFailing, false);
    assert.equal(passingTimingGate.pass, true);
    const structuralFailure = structuredClone(performanceGate);
    structuralFailure.structuralPass = false;
    assert.equal(evaluateAi362ValidationSet(captures, structuralFailure, gateOptions).pass, false);

    const missingPerformanceRow = makeLodPerformanceGate(1.500001, 'ai362-validation', (rows) => rows.pop());
    assert.equal(missingPerformanceRow.evidenceComplete, false);
    assert.equal(evaluateAi362ValidationSet(captures, missingPerformanceRow, gateOptions).pass, false);
    const duplicatePerformanceRow = makeLodPerformanceGate(1.500001, 'ai362-validation', (rows) => {
        rows.push(structuredClone(rows[0]));
    });
    assert.equal(duplicatePerformanceRow.evidenceComplete, false);
    assert.equal(evaluateAi362ValidationSet(captures, duplicatePerformanceRow, gateOptions).pass, false);
    const wrongResolution = makeLodPerformanceGate(1.500001, 'ai362-validation', (rows) => {
        rows[0].resolution = '3840x2160';
    });
    assert.equal(wrongResolution.evidenceComplete, false);
    assert.equal(evaluateAi362ValidationSet(captures, wrongResolution, gateOptions).pass, false);
    const missingAccentCost = makeLodPerformanceGate(1.500001, 'ai362-validation', (rows) => {
        delete rows[0].accentTriangles;
    });
    assert.equal(missingAccentCost.evidenceComplete, false);
    assert.equal(evaluateAi362ValidationSet(captures, missingAccentCost, gateOptions).pass, false);
    const explicitlyUnsupportedGpu = makeLodPerformanceGate(1.500001, 'ai362-validation', (rows) => {
        for (const row of rows) {
            row.wholeFrameGpuMs = null;
            row.performanceGate.gpuTimingSupported = false;
            row.performanceGate.checks.gpuUnavailableReason = true;
            row.performanceGate.pass = false;
            row.budget.performancePass = false;
            row.budget.pass = false;
        }
    });
    assert.equal(explicitlyUnsupportedGpu.evidenceComplete, true);
    assert.equal(explicitlyUnsupportedGpu.performancePass, false);
    assert.equal(explicitlyUnsupportedGpu.checks.every((entry) => entry.gpuUnavailableReasonRecorded), true);
    assert.equal(evaluateAi362ValidationSet(captures, explicitlyUnsupportedGpu, gateOptions).pass, true);

    const badBaseline = structuredClone(gateOptions.baselineReference);
    badBaseline.checks[0].fileVerified = false;
    badBaseline.checks[0].pass = false;
    badBaseline.pass = false;
    assert.equal(evaluateAi362ValidationSet(captures, performanceGate, {
        ...gateOptions,
        baselineReference: badBaseline
    }).pass, false);
    assert.equal(evaluateAi362ValidationSet(captures, performanceGate, {
        ...gateOptions,
        native4kTiming: { ...gateOptions.native4kTiming, recorded: false }
    }).pass, false);
    const incompleteNative4kTiming = structuredClone(gateOptions.native4kTiming);
    incompleteNative4kTiming.performanceGate.checks.warmupFrames = false;
    assert.equal(hasCompleteAi362Native4kTimingEvidence(incompleteNative4kTiming.performanceGate), false);
    assert.equal(evaluateAi362ValidationSet(captures, performanceGate, {
        ...gateOptions,
        native4kTiming: incompleteNative4kTiming
    }).pass, false);
    const undocumentedGpuSupport = structuredClone(gateOptions.native4kTiming.performanceGate);
    delete undocumentedGpuSupport.gpuTimingSupported;
    assert.equal(hasCompleteAi362Native4kTimingEvidence(undocumentedGpuSupport), false);
    assert.equal(evaluateAi362ValidationSet(captures, performanceGate, {
        ...gateOptions,
        regressionGate: { ...gateOptions.regressionGate, pass: false }
    }).pass, false);
});

function makeNearSnapshot(mode) {
    const mesh = mode === 'near_mesh';
    return {
        nearEvidence: {
            mode,
            textureOnly: !mesh,
            nearMeshVisible: mesh,
            midAndAccentHidden: true
        },
        coverage: {
            boundarySignature: 'grass-coverage-v2-ai360',
            sourceLoopIdentity: 'rendered-sidewalk-and-tree-loops',
            logicalDrawCalls: 2,
            triangles: 95219,
            opaqueCap: true,
            transparentSurface: false,
            alphaTestedSurface: false
        },
        grass: {
            triangles: mesh ? 48000 : 0,
            logicalDrawCalls: mesh ? 2 : 0,
            trianglesByTier: { near: mesh ? 48000 : 0, mid: 0, accent: 0 },
            nearCarpet: {
                triangles: mesh ? 48000 : 0,
                drawCalls: mesh ? 2 : 0,
                materialPaths: mesh ? 1 : 0,
                transparent: false,
                depthWrite: true,
                castShadow: false,
                frustumCulled: true,
                coverageMode: 'exact_polygon_v2',
                boundarySignature: 'grass-coverage-v2-ai360',
                eligibleBins: mesh ? 16000 : 0,
                representedBins: mesh ? 16000 : 0,
                unrepresentedOccupancyBins: 0,
                unrepresentedEligibleBins: 0,
                exactPostcheckFailures: 0,
                ineligibleRoots: 0,
                sidewalkIntrusions: 0,
                treeIntrusions: 0,
                stationaryUploadsZero: true
            }
        }
    };
}

function makeNearCaptures({ meshLuminance = 0.3 } = {}) {
    return buildNearCaptureRecipes().map((recipe) => {
        const snapshot = makeNearSnapshot(recipe.nearEvidenceMode);
        return {
            recipeId: recipe.id,
            pairId: recipe.pairId,
            nearEvidenceMode: recipe.nearEvidenceMode,
            lightingPreset: recipe.lighting,
            qualityPreset: recipe.quality,
            exposure: 1,
            png: { width: 3840, height: 2160 },
            camera: {
                position: { x: recipe.pairId.length, y: recipe.heightMeters ?? 0.5, z: -3 },
                target: { x: 0, y: 0.03, z: 0 },
                fovDegrees: 50,
                aspect: 16 / 9,
                nearMeters: 0.02,
                farMeters: 5000
            },
            frameMetrics: {
                medianLuminance: recipe.nearEvidenceMode === 'near_mesh' ? meshLuminance : 0.3
            },
            representationApproval: evaluateNearRepresentationSnapshot(snapshot, recipe.nearEvidenceMode)
        };
    });
}

test('AI 360 paired gate requires V2 opaque near-only geometry, aligned cameras, and luminance agreement', () => {
    const textureApproval = evaluateNearRepresentationSnapshot(makeNearSnapshot('texture_only'), 'texture_only');
    const meshApproval = evaluateNearRepresentationSnapshot(makeNearSnapshot('near_mesh'), 'near_mesh');
    assert.equal(textureApproval.pass, true);
    assert.equal(meshApproval.pass, true);

    const result = evaluateNearPairs(makeNearCaptures());
    assert.equal(result.expectedPairIds.length, 9);
    assert.equal(result.pairs.length, 9);
    assert.equal(result.pairs.every((pair) => pair.cameraMatch && pair.luminanceMatch), true);
    assert.equal(result.pass, true);

    const shifted = structuredClone(makeNearCaptures());
    shifted.find((entry) => entry.recipeId === 'near_mesh_physical_cut_side_profile').camera.position.x += 0.01;
    assert.equal(evaluateNearPairs(shifted).pass, false);

    const tooDark = evaluateNearPairs(makeNearCaptures({ meshLuminance: 0.2 }));
    assert.equal(tooDark.pairs.every((pair) => pair.luminanceMatch === false), true);
    assert.equal(tooDark.pass, false, 'AI 358 luminance mismatch must fail AI 360 approval');

    const leaking = makeNearSnapshot('near_mesh');
    leaking.grass.trianglesByTier.mid = 12;
    assert.equal(evaluateNearRepresentationSnapshot(leaking, 'near_mesh').pass, false);

    const rectangleFallback = makeNearSnapshot('near_mesh');
    rectangleFallback.grass.nearCarpet.coverageMode = 'rectangle_compatibility';
    assert.equal(evaluateNearRepresentationSnapshot(rectangleFallback, 'near_mesh').pass, false);

    const missingBins = makeNearSnapshot('near_mesh');
    missingBins.grass.nearCarpet.unrepresentedEligibleBins = 1;
    missingBins.grass.nearCarpet.representedBins -= 1;
    assert.equal(evaluateNearRepresentationSnapshot(missingBins, 'near_mesh').pass, false);

    const ineligible = makeNearSnapshot('near_mesh');
    ineligible.grass.nearCarpet.exactPostcheckFailures = 1;
    assert.equal(evaluateNearRepresentationSnapshot(ineligible, 'near_mesh').pass, false);

    const translucent = makeNearSnapshot('near_mesh');
    translucent.coverage.opaqueCap = false;
    assert.equal(evaluateNearRepresentationSnapshot(translucent, 'near_mesh').pass, false);

    const overBudget = makeNearSnapshot('near_mesh');
    overBudget.grass.triangles = 105000;
    overBudget.grass.nearCarpet.triangles = 105000;
    overBudget.grass.trianglesByTier.near = 105000;
    assert.equal(evaluateNearRepresentationSnapshot(overBudget, 'near_mesh').pass, false);
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
    const diagnostics = {
        ok: true,
        cardBandGate: { pass: false },
        nearGate: { pass: true },
        lodGate: { pass: true }
    };
    const result = mergeCaptureManifest(existing, 'before', [{ phase: 'before', file: 'before_new.png' }], diagnostics);
    assert.equal(result.schema, 'grass-lab-capture-manifest-v2');
    assert.deepEqual(result.requiredDrawingBuffer, { width: 3840, height: 2160, pixelRatio: 1 });
    assert.deepEqual(result.captures.map((entry) => entry.file), ['after_keep.png', 'before_new.png']);
    assert.deepEqual(result.diagnosticsByPhase, { after: { ok: true }, before: diagnostics });
    assert.deepEqual(result.cardBandGateByPhase, { after: { pass: true }, before: { pass: false } });
    assert.deepEqual(result.nearGateByPhase, { before: { pass: true } });
    assert.deepEqual(result.lodGateByPhase, { before: { pass: true } });
});

test('grass capture partial recipe replacement preserves static and other-phase manifest entries', () => {
    const existing = {
        captures: [
            { phase: 'before', recipeId: 'close_billboard_handoff', file: 'before_static.png' },
            { phase: 'before', recipeId: 'flyover_0000', file: 'before_motion_old.png' },
            { phase: 'after', recipeId: 'flyover_0000', file: 'after_motion.png' }
        ]
    };
    const replacement = {
        phase: 'before',
        recipeId: 'flyover_0000',
        file: 'before_motion_new.png'
    };
    const result = mergeCaptureManifest(
        existing,
        'before',
        [replacement],
        { lodGate: { pass: true } },
        { replaceRecipeIds: ['flyover_0000'] }
    );
    assert.deepEqual(result.captures.map((entry) => entry.file), [
        'before_static.png',
        'after_motion.png',
        'before_motion_new.png'
    ]);
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
        'setBoundaryEvidenceMode',
        'setNearEvidenceMode',
        'setHierarchyEvidenceMode',
        'focusHandoff',
        'seekMotionPath',
        'resetLodHysteresis',
        'beginPerformanceMeasurement',
        'getPerformanceMeasurement',
        'getGpuTimerDiagnostics'
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
    assert.match(runner, /ai360-near/);
    assert.match(runner, /buildNearCaptureRecipes/);
    assert.match(runner, /unrepresentedEligibleBins/);
    assert.match(runner, /combinedVisibleGrassTriangles/);
    assert.match(runner, /ai361-lod/);
    assert.match(runner, /buildLodCaptureRecipes/);
    assert.match(runner, /grass-lod-hierarchy-capture-v2/);
    assert.match(runner, /motionDeterministicSeek/);
    assert.match(runner, /billboardTriangles/);
    assert.match(runner, /middleTriangles/);
    assert.match(main, /requestedPowerPreference: 'high-performance'/);
    assert.match(main, /unmaskedRenderer/);
    assert.match(runner, /--force-high-performance-gpu/);
    assert.match(runner, /PERFORMANCE_WARMUP_FRAMES = 120/);
    assert.match(runner, /maximumDurationMs: 600000/);
    assert.match(runner, /PERFORMANCE_SAMPLE_FRAMES = 120/);
    assert.match(runner, /evaluateGrassPerformanceMeasurement/);
    assert.match(runner, /grass-lod-performance-cost-v1/);
    assert.match(runner, /recipe\.matrix === VALIDATION_MATRIX/);
    assert.match(runner, /useFrozenPageClip/);
    assert.match(runner, /recipe\.matrix === VALIDATION_MATRIX\s*\? 1/);
    assert.match(runner, /Page\.captureScreenshot/);
    assert.match(runner, /optimizeForSpeed: true/);
    assert.match(runner, /clip: \{ x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 \}/);
    assert.deepEqual(CARD_BAND_GATE_CONTRACT, {
        geometryToTextureRatio: 0.7,
        minimumLuminanceDelta: 0.06,
        smoothingRows: 3,
        maximumDarkenedFraction: 0.1
    });
});
