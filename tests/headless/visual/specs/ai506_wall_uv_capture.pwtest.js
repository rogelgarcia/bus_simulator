// Capture: AI 506 — facade wall texture U anchoring on the Garden Court
// garage face (B). Two framings from the report: the whole garage face
// straight-on, and the last-two-windows / BC-corner close-up where the
// trailing collapse was reported.
// Output: tests/artifacts/screens/buildings/ai506_garage_face_<tag>.png and
// ai506_bc_corner_<tag>.png (tag from AI506_TAG, default 'after').
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';
import { SHOWCASE_MODELS } from './_showcase_model_configs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const BASE_BUILDING_ID = 'pier_grid_tower_2';
const TAG = /^[a-z0-9_]+$/.test(String(process.env.AI506_TAG ?? '')) ? process.env.AI506_TAG : 'after';

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

async function shoot(page, { eye, target, name, viewport }) {
    await page.evaluate(({ eye, target }) => {
        const engine = window.__testHooks.getEngine();
        engine.camera.position.set(eye.x, eye.y, eye.z);
        engine.camera.lookAt(target.x, target.y, target.z);
        engine.camera.updateMatrixWorld(true);
        window.__testHooks.step(30, { render: true });
        for (const id of ['harness-status', 'harness-log']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
    }, { eye, target });
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

test('Capture: AI 506 garage face wall UV anchoring', async ({ page }) => {
    test.setTimeout(420_000);
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    const overrides = SHOWCASE_MODELS.find((m) => m.key === 'garden_court')?.overrides ?? null;
    const load = () => page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId,
            configOverrides: args.overrides
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: BASE_BUILDING_ID, overrides, viewport });

    // Warm-up build: the very first build renders with cold caches.
    await load();
    await waitForShowcaseReady(page);
    await load();
    await waitForShowcaseReady(page);

    // Building site: footprint 22x13 centered on (0, 12); face B is x=+11,
    // z from 18.5 (AB corner) to 5.5 (BC corner), garage floor y 0..4.
    await shoot(page, {
        eye: { x: 23.0, y: 2.4, z: 12.0 },
        target: { x: 11.0, y: 2.2, z: 12.0 },
        name: `ai506_garage_face_${TAG}`,
        viewport
    });
    await shoot(page, {
        eye: { x: 17.5, y: 2.1, z: 7.6 },
        target: { x: 11.0, y: 2.1, z: 7.6 },
        name: `ai506_bc_corner_${TAG}`,
        viewport
    });
});
