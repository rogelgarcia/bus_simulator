// Node unit tests: AI 357 Grass Lab quality, review, budget, and approval contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    GRASS_LAB_CAMERA_PRESETS,
    GRASS_LAB_LIGHTING_PRESETS,
    GRASS_LAB_MOTION_PATHS,
    GRASS_LAB_QUALITY_PRESETS,
    GRASS_LAB_REQUIRED_CAMERA_IDS,
    GRASS_LAB_REQUIRED_REGRESSIONS,
    applyGrassLabQualityPreset,
    createGrassLabApprovalRecord,
    evaluateGrassLabBudget
} from '../../../src/app/grass/GrassLabValidationContract.js';
import { createGrassLabEngineConfig } from '../../../src/graphics/gui/grass_debugger/GrassLabContract.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const makeSnapshot = ({ cpu = 0.2, gpu = 1.1, draws = 5, triangles = 50000, beyond = 0 } = {}) => ({
    grass: { updateCpuMs: cpu, logicalDrawCalls: draws, triangles },
    frame: { gpuMs: gpu },
    lod: { geometryBeyondCutoff: beyond }
});

test('quality presets make automatic LOD explicit and low fails gracefully to coverage texture', () => {
    assert.deepEqual(Object.keys(GRASS_LAB_QUALITY_PRESETS), ['low', 'default', 'high']);
    assert.ok(GRASS_LAB_QUALITY_PRESETS.low.nearRadiusMeters < GRASS_LAB_QUALITY_PRESETS.default.nearRadiusMeters);
    assert.ok(GRASS_LAB_QUALITY_PRESETS.default.nearRadiusMeters < GRASS_LAB_QUALITY_PRESETS.high.nearRadiusMeters);
    assert.ok(GRASS_LAB_QUALITY_PRESETS.low.clusterRadiusMeters < GRASS_LAB_QUALITY_PRESETS.default.clusterRadiusMeters);
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
    assert.deepEqual(Object.keys(GRASS_LAB_MOTION_PATHS), ['stationary', 'flyover']);
});

test('budget evaluation is deterministic, keeps GPU availability explicit, and catches major regressions', () => {
    const samples = [makeSnapshot(), makeSnapshot({ cpu: 0.4, gpu: 1.3, triangles: 62000 })];
    const first = evaluateGrassLabBudget(samples);
    const second = evaluateGrassLabBudget(samples);
    assert.deepEqual(first, second);
    assert.equal(first.pass, true);
    assert.equal(first.measurements.averageCpuMs, 0.3);
    assert.equal(first.measurements.averageGpuMs, 1.2);
    assert.equal(first.measurements.maximumTriangles, 62000);

    const noGpu = evaluateGrassLabBudget(makeSnapshot({ gpu: null }));
    assert.equal(noGpu.gpuTimingSupported, false);
    assert.equal(noGpu.checks.gpu, null);
    assert.equal(noGpu.pass, true, 'Unsupported GPU timing is documented, not treated as a universal hardware failure');

    const regression = evaluateGrassLabBudget(makeSnapshot({ cpu: 0.8, gpu: 2.2, draws: 13, triangles: 120000, beyond: 1 }));
    assert.equal(regression.pass, false);
    assert.equal(regression.checks.cpu, false);
    assert.equal(regression.checks.hardDrawCeiling, false);
    assert.equal(regression.checks.triangles, false);
    assert.equal(regression.checks.cutoff, false);
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
        assert.ok(statSync(`${REPO_ROOT}/screens/grass_ai357/${file}`).size > 50000, `Missing or empty approval capture ${file}`);
    }
});
