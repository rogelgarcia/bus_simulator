// Headless deterministic material capture harness integration.
import fs from 'node:fs/promises';
import path from 'node:path';

import { collectCanvasFrameMetrics } from './frame_metrics.mjs';
import { toPosixPath } from '../utils.mjs';

const DEFAULT_HARNESS_SCENARIO_ID = 'material_calibration_capture';

const DEFAULT_CAPTURE_RECIPES = Object.freeze([
    Object.freeze({
        id: 'neutral_front',
        presetId: 'neutral',
        layoutMode: 'full',
        viewId: 'front',
        tilingMultiplier: 1.0,
        plateVisible: true
    }),
    Object.freeze({
        id: 'neutral_left',
        presetId: 'neutral',
        layoutMode: 'full',
        viewId: 'left_oblique',
        tilingMultiplier: 1.0,
        plateVisible: true
    }),
    Object.freeze({
        id: 'sunny_right',
        presetId: 'sunny',
        layoutMode: 'full',
        viewId: 'right_oblique',
        tilingMultiplier: 1.0,
        plateVisible: true
    }),
    Object.freeze({
        id: 'overcast_panel_2x2',
        presetId: 'overcast',
        layoutMode: 'panel',
        viewId: 'panel_perpendicular',
        tilingMultiplier: 2.0,
        plateVisible: false
    })
]);

function sanitizeMaterialSlug(materialId) {
    const raw = String(materialId ?? '').trim();
    const withoutPrefix = raw.startsWith('pbr.') ? raw.slice(4) : raw;
    return withoutPrefix.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'material';
}

function toCaptureOutputFile({
    repoRoot,
    outputRootRel,
    materialId,
    mode,
    recipeId
}) {
    const slug = sanitizeMaterialSlug(materialId);
    const fileRel = toPosixPath(path.join(outputRootRel, slug, `${mode}_${recipeId}.png`));
    const fileAbs = path.resolve(repoRoot, fileRel);
    return { fileRel, fileAbs };
}

async function ensureHarnessScenarioReady(page) {
    await page.waitForFunction(() => {
        if (!window.__testHooks || typeof window.__testHooks.listScenarios !== 'function') return false;
        const ids = window.__testHooks.listScenarios();
        return Array.isArray(ids) && ids.includes('material_calibration_capture');
    }, null, { timeout: 15000 });
}

async function loadCaptureScenario(page, {
    materialId,
    overrides,
    recipe,
    seed
}) {
    return page.evaluate(async ({ materialId, overrides, recipe, seed }) => {
        window.__testHooks.setSeed(seed);
        window.__testHooks.setViewport(1024, 1024);
        window.__testHooks.setFixedDt(1 / 60);
        await window.__testHooks.loadScenario('material_calibration_capture', {
            seed,
            materialId,
            presetId: recipe.presetId,
            layoutMode: recipe.layoutMode,
            viewId: recipe.viewId,
            tilingMultiplier: recipe.tilingMultiplier,
            plateVisible: recipe.plateVisible !== false,
            overrides
        });
        window.__testHooks.stepAdvanced(24, { dt: 1 / 60, renderEachTick: true });
        return window.__testHooks.getMetrics();
    }, {
        materialId,
        overrides: overrides ?? null,
        recipe,
        seed
    });
}

async function waitForTextures(page) {
    try {
        await page.waitForFunction(() => {
            const metrics = window.__testHooks?.getMetrics?.();
            return metrics?.scenarioId === 'material_calibration_capture'
                && metrics?.scenario?.textureReady === true;
        }, null, { timeout: 10000 });
        return true;
    } catch {
        return false;
    }
}

async function captureRecipe({
    repoRoot,
    harnessPage,
    outputRootRel,
    materialId,
    mode,
    recipe,
    overrides
}) {
    const seed = 'texture_correction_capture_v1';
    const scenarioMetrics = await loadCaptureScenario(harnessPage, {
        materialId,
        overrides: mode === 'corrected' ? (overrides ?? null) : null,
        recipe,
        seed
    });

    const textureReady = await waitForTextures(harnessPage);
    if (!textureReady) {
        await harnessPage.evaluate(() => window.__testHooks.stepAdvanced(30, { dt: 1 / 60, renderEachTick: true }));
    }

    const frameMetrics = await collectCanvasFrameMetrics(harnessPage, {
        canvasSelector: '#harness-canvas'
    });

    const output = toCaptureOutputFile({
        repoRoot,
        outputRootRel,
        materialId,
        mode,
        recipeId: recipe.id
    });
    await fs.mkdir(path.dirname(output.fileAbs), { recursive: true });
    await harnessPage.locator('#harness-canvas').screenshot({
        path: output.fileAbs
    });

    return Object.freeze({
        captureId: `${mode}.${recipe.id}`,
        mode,
        recipeId: recipe.id,
        presetId: recipe.presetId,
        layoutMode: recipe.layoutMode,
        viewId: recipe.viewId,
        tilingMultiplier: recipe.tilingMultiplier,
        textureReady,
        scenarioMetrics: scenarioMetrics?.scenario ?? null,
        file: output.fileRel,
        ...frameMetrics
    });
}

export async function runMaterialCaptureHarness({
    repoRoot,
    harnessPage,
    materialId,
    correctedOverrides,
    outputRootRel = 'tools/texture_correction_pipeline/artifacts/captures',
    recipes = null
}) {
    const recipeList = Array.isArray(recipes) && recipes.length ? recipes : DEFAULT_CAPTURE_RECIPES;
    await ensureHarnessScenarioReady(harnessPage);

    const captures = [];
    for (const mode of ['raw', 'corrected']) {
        for (const recipe of recipeList) {
            const capture = await captureRecipe({
                repoRoot,
                harnessPage,
                outputRootRel,
                materialId,
                mode,
                recipe,
                overrides: correctedOverrides
            });
            captures.push(capture);
        }
    }

    return Object.freeze({
        captures,
        outputRoot: outputRootRel
    });
}

