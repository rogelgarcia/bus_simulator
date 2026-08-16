// Capture: standalone building showcase screenshots for catalog building configs.
//
// Renders each building through the `building_showcase` harness scenario (game
// terrain, slab, sky and lighting) and captures a screenshot only after every
// material texture reports a decoded image (and the IBL environment map is in
// place when enabled), so captures never show half-loaded textures.
//
// Usage:
// - All catalog buildings: npx playwright test -c tests/headless/visual/visual.config.mjs harness_building_showcase_capture
// - One building:          BUILDING_ID=brick_midrise npx playwright test -c tests/headless/visual/visual.config.mjs harness_building_showcase_capture
// - Higher resolution:     CAPTURE_SCALE=2 renders at 2560x1440 (base 1280x720)
//
// Output: tests/artifacts/screens/buildings/<buildingId>.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

test('Capture: building showcase (textures ready before screenshot)', async ({ page }) => {
    test.setTimeout(300_000);
    // No query overrides: run the full default pipeline (IBL, grading, GTAO)
    // so captures match the game's current option defaults.
    await bootHarness(page, { query: '' });

    const requested = String(process.env.BUILDING_ID ?? '').trim();
    const ids = requested
        ? [requested]
        : await page.evaluate(async () => {
            const mod = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
            return mod.getBuildingConfigs().map((cfg) => cfg.id);
        });
    expect(ids.length).toBeGreaterThan(0);

    await fs.mkdir(OUT_DIR, { recursive: true });

    // Optional camera overrides, for street-level / grazing-angle inspection
    // shots next to the default three-quarter catalog view:
    //   CAMERA_DIR="x,y,z"      view direction (e.g. "-0.2,0.06,1" = near head-on,
    //                           "-1,0.05,0.25" = grazing along the facade)
    //   CAMERA_PADDING=0.55     framing distance multiplier (smaller = closer)
    //   CAMERA_TARGET_Y_FRAC    0..1 height of the look-at point on the building
    //   CAPTURE_SUFFIX=grazing  writes <id>_<suffix>.png instead of <id>.png
    const parseCameraDir = (raw) => {
        const parts = String(raw ?? '').split(',').map((p) => Number(p.trim()));
        if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) return null;
        return { x: parts[0], y: parts[1], z: parts[2] };
    };
    const cameraDir = parseCameraDir(process.env.CAMERA_DIR);
    const cameraPaddingRaw = Number(process.env.CAMERA_PADDING);
    const cameraPadding = Number.isFinite(cameraPaddingRaw) ? cameraPaddingRaw : null;
    const cameraTargetYFracRaw = Number(process.env.CAMERA_TARGET_Y_FRAC);
    const cameraTargetYFrac = Number.isFinite(cameraTargetYFracRaw) ? cameraTargetYFracRaw : null;
    const captureSuffix = String(process.env.CAPTURE_SUFFIX ?? '').trim();
    const scenarioOptions = {
        ...(cameraDir ? { cameraDir } : {}),
        ...(cameraPadding !== null ? { cameraPadding } : {}),
        ...(cameraTargetYFrac !== null ? { cameraTargetYFrac } : {})
    };

    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    // Warm-up build: a scenario's first build in a fresh page renders differently
    // from later builds (cold caches). Builds 2+ are pixel-identical, so discard
    // one build up front to make captures reproducible across runs.
    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', { seed: 'showcase', buildingId: args.buildingId, ...args.scenarioOptions });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: ids[0], viewport, scenarioOptions });
    await page.waitForFunction(() => {
        const scenario = window.__testHooks.getMetrics()?.scenario ?? null;
        const textures = scenario?.textures ?? null;
        if (!textures || textures.total <= 0) return false;
        return textures.ready >= textures.total;
    }, null, { timeout: 60_000, polling: 250 });

    for (const buildingId of ids) {
        await page.evaluate(async (args) => {
            window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
            await window.__testHooks.loadScenario('building_showcase', { seed: 'showcase', buildingId: args.buildingId, ...args.scenarioOptions });
            window.__testHooks.setFixedDt(1 / 60);
            window.__testHooks.step(5, { render: true });
        }, { buildingId, viewport, scenarioOptions });

        // Texture readiness gate: capture only once every texture is decoded.
        await page.waitForFunction(() => {
            const scenario = window.__testHooks.getMetrics()?.scenario ?? null;
            const textures = scenario?.textures ?? null;
            if (!textures || textures.total <= 0) return false;
            if (textures.ready < textures.total) return false;
            if (scenario.environment?.expected && !scenario.environment.present) return false;
            return true;
        }, null, { timeout: 60_000, polling: 250 });

        // Settle half-rate GTAO / temporal effects, then present the frame.
        await page.evaluate(() => {
            window.__testHooks.step(30, { render: true });
        });

        const metrics = await page.evaluate(() => window.__testHooks.getMetrics());
        expect(metrics?.scenarioId).toBe('building_showcase');
        expect(metrics?.scenario?.buildingId).toBe(buildingId);
        expect(metrics?.scenario?.building?.present).toBe(true);

        await page.evaluate(() => {
            for (const id of ['harness-status', 'harness-log']) {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            }
        });
        const canvas = page.locator('#harness-canvas');
        await expect(canvas).toBeVisible();
        const outName = captureSuffix ? `${buildingId}_${captureSuffix}.png` : `${buildingId}.png`;
        await canvas.screenshot({ path: path.join(OUT_DIR, outName) });
    }
});
