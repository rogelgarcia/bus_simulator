// Node unit tests for deterministic texture correction pipeline behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { runTextureCorrectionPipeline } from '../../../tools/texture_correction_pipeline/src/pipeline_runner.mjs';

function makeMaterialConfigSource({ materialId, label, classId, folder }) {
    return [
        'export default Object.freeze({',
        `    materialId: ${JSON.stringify(materialId)},`,
        `    label: ${JSON.stringify(label)},`,
        `    classId: ${JSON.stringify(classId)},`,
        "    root: 'surface',",
        '    buildingEligible: false,',
        '    groundEligible: true,',
        '    tileMeters: 4.0,',
        '    mapFiles: Object.freeze({',
        "        baseColor: 'basecolor.jpg',",
        "        normal: 'normal_gl.png',",
        "        orm: 'arm.png'",
        '    }),',
        '    allMapFiles: Object.freeze({',
        `        baseColor: ${JSON.stringify(`assets/public/pbr/${folder}/basecolor.jpg`)},`,
        `        normal: ${JSON.stringify(`assets/public/pbr/${folder}/normal_gl.png`)},`,
        `        orm: ${JSON.stringify(`assets/public/pbr/${folder}/arm.png`)}`,
        '    })',
        '});',
        ''
    ].join('\n');
}

async function createFixtureRepo() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'texture-correction-pipeline-'));
    const pbrRoot = path.resolve(root, 'assets/public/pbr');
    await fs.mkdir(pbrRoot, { recursive: true });

    const fixtures = [
        {
            folder: 'grass_fixture',
            materialId: 'pbr.grass_fixture',
            label: 'Grass Fixture',
            classId: 'grass'
        },
        {
            folder: 'stone_fixture',
            materialId: 'pbr.stone_fixture',
            label: 'Stone Fixture',
            classId: 'stone'
        }
    ];

    for (const item of fixtures) {
        const folder = path.resolve(pbrRoot, item.folder);
        await fs.mkdir(folder, { recursive: true });
        const configPath = path.resolve(folder, 'pbr.material.config.js');
        await fs.writeFile(configPath, makeMaterialConfigSource(item), 'utf8');
    }

    return root;
}

async function importCorrectionConfig(filePath, cacheTag) {
    const href = `${pathToFileURL(filePath).href}?v=${encodeURIComponent(cacheTag)}`;
    return import(href);
}

test('Texture correction pipeline writes deterministic per-material config outputs', async () => {
    const repoRoot = await createFixtureRepo();
    const reportPath = 'tools/texture_correction_pipeline/artifacts/test_report.json';

    const firstRun = await runTextureCorrectionPipeline({
        repoRoot,
        presetId: 'aces',
        write: true,
        reportPath
    });

    assert.equal(firstRun.report.totals.discovered, 2);
    assert.equal(firstRun.report.totals.processed, 2);
    assert.equal(firstRun.report.totals.errors, 0);
    assert.equal(firstRun.report.totals.created, 2);
    assert.ok(Array.isArray(firstRun.report.profileSummary?.activePlugins));
    assert.ok(Array.isArray(firstRun.report.guardedCases));

    const grassOutPath = path.resolve(repoRoot, 'assets/public/pbr/grass_fixture/pbr.material.correction.config.js');
    const grassConfig = await importCorrectionConfig(grassOutPath, 'run1');

    assert.equal(grassConfig.default.materialId, 'pbr.grass_fixture');
    assert.equal(grassConfig.default.classId, 'grass');
    assert.deepEqual(grassConfig.default.presets.aces.enabledPlugins, [
        'roughness_inversion_guard',
        'scalar_map_clipping_guard',
        'roughness_interval_remap',
        'albedo_balance',
        'normal_intensity',
        'metalness_policy'
    ]);
    assert.equal(grassConfig.default.presets.aces.adjustments.roughness.min, 0.65);
    assert.equal(grassConfig.default.presets.aces.adjustments.normal.strength, 0.9);
    assert.equal(grassConfig.default.presets.aces.adjustments.metalness.value, 0);

    const secondRun = await runTextureCorrectionPipeline({
        repoRoot,
        presetId: 'aces',
        write: true,
        reportPath
    });

    assert.equal(secondRun.report.totals.unchanged, 2);
    assert.equal(secondRun.report.totals.updated, 0);
    assert.equal(secondRun.report.totals.errors, 0);
});

test('Texture correction pipeline supports per-run plugin selection', async () => {
    const repoRoot = await createFixtureRepo();
    const reportPath = 'tools/texture_correction_pipeline/artifacts/test_report_plugins.json';

    await runTextureCorrectionPipeline({
        repoRoot,
        presetId: 'aces',
        runEnabledPlugins: ['normal_intensity'],
        write: true,
        reportPath
    });

    const stoneOutPath = path.resolve(repoRoot, 'assets/public/pbr/stone_fixture/pbr.material.correction.config.js');
    const stoneConfig = await importCorrectionConfig(stoneOutPath, 'plugins');

    assert.deepEqual(stoneConfig.default.presets.aces.enabledPlugins, ['normal_intensity']);
    assert.deepEqual(Object.keys(stoneConfig.default.presets.aces.adjustments), ['normal']);
    assert.equal(stoneConfig.default.presets.aces.adjustments.normal.strength, 1);
});
