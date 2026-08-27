// Capture: AI 505 — a recessed balcony notch at a face END must close its
// corner side with the configured infill instead of standing open to the side
// street. Two framings:
//   1. Garden Court AB corner from the B side: pre-fix the notch column is
//      open (interior panels visible edge-on); post-fix the side glass rails
//      the notch.
//   2. ModernResidential2 around-the-corner pairing: both notches keep their
//      corner-side covers — a no-regression reference (before == after).
// Output: tests/artifacts/screens/buildings/ai505_<name>_<tag>.png
// (tag from AI505_TAG, default 'after' — the before shots are taken by
// re-running with the pre-fix BayBalconyModel checked out).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';
import { SHOWCASE_MODELS } from './_showcase_model_configs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const BASE_BUILDING_ID = 'pier_grid_tower_2';
const TAG = /^[a-z0-9_]+$/.test(String(process.env.AI505_TAG ?? '')) ? process.env.AI505_TAG : 'after';

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

async function loadModel(page, { buildingId, overrides = null, viewport }) {
    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId,
            ...(args.overrides ? { configOverrides: args.overrides } : {}),
            mergeBuildingGeometry: false
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId, overrides, viewport });
    await waitForShowcaseReady(page);
}

// Camera anchored on the building box's +x/+z corner (the AB corner seen from
// the B side street), offsets in meters.
async function shootCorner(page, { buildingId, eye, target, name }) {
    const balconyMeshCount = await page.evaluate(async ({ buildingId, eye, target }) => {
        const THREE = await import('three');
        const engine = window.__testHooks.getEngine();
        const obj = engine.scene.getObjectByName(`showcase_${buildingId}`);
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);

        let balconyMeshes = 0;
        engine.scene.traverse((o) => {
            const role = o?.userData?.buildingFab2Role ?? '';
            if (typeof role === 'string' && role.startsWith('balcony_')) balconyMeshes += 1;
        });

        engine.camera.position.set(box.max.x + eye.dx, eye.y, box.max.z + eye.dz);
        engine.camera.lookAt(box.max.x + target.dx, target.y, box.max.z + target.dz);
        engine.camera.updateMatrixWorld(true);
        window.__testHooks.step(30, { render: true });
        for (const id of ['harness-status', 'harness-log']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
        return balconyMeshes;
    }, { buildingId, eye, target });
    expect(balconyMeshCount).toBeGreaterThan(0);
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

test('Capture: AI 505 notch side closure at face ends', async ({ page }) => {
    test.setTimeout(420_000);
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    const gardenCourt = SHOWCASE_MODELS.find((m) => m.key === 'garden_court')?.overrides ?? null;

    // Warm-up build: the very first build renders with cold caches.
    await loadModel(page, { buildingId: BASE_BUILDING_ID, overrides: gardenCourt, viewport });

    // Garden Court AB corner from the B side street, at second-floor height:
    // straight down the A face's notch column.
    await loadModel(page, { buildingId: BASE_BUILDING_ID, overrides: gardenCourt, viewport });
    await shootCorner(page, {
        buildingId: BASE_BUILDING_ID,
        eye: { dx: 5.0, y: 6.6, dz: 0.4 },
        target: { dx: -1.6, y: 6.2, dz: -1.3 },
        name: `ai505_notch_corner_${TAG}`
    });

    // Tight close-up of the floor-2 corner notch: the side infill (or, pre-fix,
    // the open section with the slider seen edge-on) fills the frame.
    await shootCorner(page, {
        buildingId: BASE_BUILDING_ID,
        eye: { dx: 2.6, y: 5.9, dz: 0.2 },
        target: { dx: -1.4, y: 5.6, dz: -0.9 },
        name: `ai505_notch_closeup_${TAG}`
    });

    // ModernResidential2's paired notches around its corner: the shared side
    // must stay railed-but-open in both tags.
    await loadModel(page, { buildingId: 'modern_residential_2', viewport });
    await shootCorner(page, {
        buildingId: 'modern_residential_2',
        eye: { dx: 7.0, y: 6.4, dz: 4.5 },
        target: { dx: -2.0, y: 5.6, dz: -1.5 },
        name: `ai505_paired_corner_${TAG}`
    });
});
