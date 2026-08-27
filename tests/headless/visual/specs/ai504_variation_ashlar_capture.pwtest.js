// Capture: AI 504 — world-space material variation must not warp crisp
// patterned walls. Straight-on view of the Garden Court ashlar ground floor,
// variation ON vs OFF: the block coursing must read identically in both, with
// variation contributing only tint/roughness wear. Pre-fix, the wall preset's
// default-enabled anti-tiling sheared the pattern into diagonal dashes and
// broke it at wall-segment seams.
// Output: tests/artifacts/screens/buildings/ai504_ashlar_{var|novar}_<tag>.png
// (tag from AI504_TAG, default 'after' — the before shots are taken by
// re-running with the pre-fix MaterialVariationSystem checked out; the novar
// shot is the fixed target either way.)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';
import { SHOWCASE_MODELS } from './_showcase_model_configs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const BASE_BUILDING_ID = 'pier_grid_tower_2';
const TAG = /^[a-z0-9_]+$/.test(String(process.env.AI504_TAG ?? '')) ? process.env.AI504_TAG : 'after';

async function waitForShowcaseReady(page) {
    await page.waitForFunction(() => {
        const scenario = window.__testHooks.getMetrics()?.scenario ?? null;
        const textures = scenario?.textures ?? null;
        if (!textures || textures.total <= 0) return false;
        if (textures.ready < textures.total) return false;
        if (scenario.environment?.expected && !scenario.environment.present) return false;
        return true;
    }, null, { timeout: 60_000, polling: 250 });
}

function gardenCourtOverrides({ variation }) {
    const base = SHOWCASE_MODELS.find((m) => m.key === 'garden_court')?.overrides ?? null;
    const overrides = JSON.parse(JSON.stringify(base));
    if (!variation) {
        for (const layer of overrides.layers ?? []) {
            if (layer?.materialVariation) layer.materialVariation = { enabled: false };
        }
    }
    return overrides;
}

// Straight-on view of the front (+z) ground floor, close enough that the
// ashlar block joints resolve.
async function shootGroundFloorFront(page, { overrides, name, viewport }) {
    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId,
            configOverrides: args.overrides
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: BASE_BUILDING_ID, overrides, viewport });
    await waitForShowcaseReady(page);

    await page.evaluate(async ({ buildingId }) => {
        const THREE = await import('three');
        const engine = window.__testHooks.getEngine();
        const obj = engine.scene.getObjectByName(`showcase_${buildingId}`);
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);
        const cx = (box.min.x + box.max.x) / 2;
        engine.camera.position.set(cx, 2.0, box.max.z + 7.5);
        engine.camera.lookAt(cx, 2.2, box.max.z);
        engine.camera.updateMatrixWorld(true);
        window.__testHooks.step(30, { render: true });
        for (const id of ['harness-status', 'harness-log']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
    }, { buildingId: BASE_BUILDING_ID });
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

test('Capture: AI 504 variation on ashlar keeps the block pattern', async ({ page }) => {
    test.setTimeout(420_000);
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    const withVar = gardenCourtOverrides({ variation: true });
    const withoutVar = gardenCourtOverrides({ variation: false });

    // Warm-up build: the very first build renders with cold caches.
    await shootGroundFloorFront(page, { overrides: withVar, name: `ai504_ashlar_var_${TAG}`, viewport });

    await shootGroundFloorFront(page, { overrides: withVar, name: `ai504_ashlar_var_${TAG}`, viewport });

    // Guard (post-fix behavior): with the standard wear recipe, no wall
    // material may carry an active anti-tiling uniform — the variation must
    // ride the texture, not displace it.
    if (TAG !== 'before') {
        const activeAnti = await page.evaluate(() => {
            const engine = window.__testHooks.getEngine();
            let checked = 0;
            let active = 0;
            engine.scene.traverse((obj) => {
                const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
                for (const mat of mats) {
                    const uniforms = mat?.userData?.materialVariationConfig?.uniforms ?? null;
                    if (!uniforms?.anti) continue;
                    checked += 1;
                    if (uniforms.anti.x > 0) active += 1;
                }
            });
            return { checked, active };
        });
        expect(activeAnti.checked).toBeGreaterThan(0);
        expect(activeAnti.active).toBe(0);
    }

    await shootGroundFloorFront(page, { overrides: withoutVar, name: `ai504_ashlar_novar_${TAG}`, viewport });
});
