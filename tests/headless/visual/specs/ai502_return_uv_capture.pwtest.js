// Capture: AI 502 — a relief step's return continues the wall texture instead
// of mirroring it. Camera from the AI 502 report: close to the front facade of
// `pier_grid_tower_2` at a grazing angle, where both returns of one pier are
// visible at once and mirrored courses read as a chevron.
// Output: tests/artifacts/screens/buildings/ai502_pier_uv_<tag>[_deep].png
// (tag from AI502_TAG, default 'after' — the before shots are taken by
// re-running with the pre-fix generator checked out).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const BUILDING_ID = 'pier_grid_tower_2';
const TAG = /^[a-z0-9_]+$/.test(String(process.env.AI502_TAG ?? '')) ? process.env.AI502_TAG : 'after';

// From the AI 502 report: eye by the facade, looking down it at a graze —
// pulled in close enough that the brick bond resolves, since a mirrored U on
// horizontally coursed brick only reads at the arris where the bond meets.
const PIER_CAMERA = { eye: { x: 4.5, y: 7.0, z: 21.9 }, target: { x: -5.0, y: 6.2, z: 19.5 } };

async function makeDeepReliefFacades(page) {
    return page.evaluate(async ({ buildingId }) => {
        const catalog = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
        const cfg = catalog.getBuildingConfigById(buildingId);
        const facades = JSON.parse(JSON.stringify(cfg.facades));
        for (const face of Object.values(facades.floor_502 ?? {})) {
            for (const item of face?.layout?.bays?.items ?? []) {
                if (item?.depth) item.depth = { left: -0.6, right: -0.6, linked: true };
            }
        }
        return facades;
    }, { buildingId: BUILDING_ID });
}

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

async function shoot(page, { name, configOverrides = null, viewport }) {
    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId,
            ...(args.configOverrides ? { configOverrides: args.configOverrides } : {})
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: BUILDING_ID, configOverrides, viewport });
    await waitForShowcaseReady(page);

    await page.evaluate((cam) => {
        const engine = window.__testHooks.getEngine();
        engine.camera.position.set(cam.eye.x, cam.eye.y, cam.eye.z);
        engine.camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
        engine.camera.updateMatrixWorld(true);
        window.__testHooks.step(30, { render: true });
        for (const id of ['harness-status', 'harness-log']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
    }, PIER_CAMERA);
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

test('Capture: AI 502 relief-step return UVs', async ({ page }) => {
    test.setTimeout(420_000);
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    // Warm-up build: the very first build renders with cold caches.
    await shoot(page, { name: `ai502_pier_uv_${TAG}`, viewport });
    await shoot(page, { name: `ai502_pier_uv_${TAG}`, viewport });

    const deepFacades = await makeDeepReliefFacades(page);
    await shoot(page, { name: `ai502_pier_uv_${TAG}_deep`, viewport, configOverrides: { facades: deepFacades } });
});
