// Capture: AI 503 — bay capitals and arcade imposts project OUT of the wall.
// Grazing close-ups of an arcade impost run (arcade_hall) and a pier capital
// (setback_tower). The scenario loads with mergeBuildingGeometry: false so
// the band meshes keep their buildingFab2Role tags and can be located by a
// scene traverse in world coordinates.
// Output: tests/artifacts/screens/buildings/ai503_<feature>_graze_<tag>.png
// (tag from AI503_TAG, default 'after' — the before shots are taken by
// re-running with the pre-fix generator checked out).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';
import { SHOWCASE_MODELS } from './_showcase_model_configs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const BASE_BUILDING_ID = 'pier_grid_tower_2';
const TAG = /^[a-z0-9_]+$/.test(String(process.env.AI503_TAG ?? '')) ? process.env.AI503_TAG : 'after';

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

function overridesFor(key) {
    return SHOWCASE_MODELS.find((m) => m.key === key)?.overrides ?? null;
}

async function loadModel(page, { overrides, viewport }) {
    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId,
            configOverrides: args.overrides,
            mergeBuildingGeometry: false
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: BASE_BUILDING_ID, overrides, viewport });
    await waitForShowcaseReady(page);
}

// Aim a grazing view down the front (+z) facade at one band: relief this
// small only reads where the raking wall carries its shadow line. `pick`:
// 'top' takes the highest front band (a pier's top capital), 'bottom' the
// lowest (a ground-floor impost run).
async function shootBandGraze(page, { role, pick, name }) {
    const found = await page.evaluate(async ({ role, pick }) => {
        const THREE = await import('three');
        const engine = window.__testHooks.getEngine();
        const centers = [];
        engine.scene.traverse((obj) => {
            if (obj?.userData?.buildingFab2Role !== role) return;
            obj.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(obj);
            centers.push(box.getCenter(new THREE.Vector3()));
        });
        if (!centers.length) return 0;

        // Front (+z) face, the band row the pick asks for, then the row's +x
        // end so the raking view sweeps down the whole run.
        const zMax = Math.max(...centers.map((c) => c.z));
        const front = centers.filter((c) => c.z > zMax - 1.0);
        front.sort((a, b) => (pick === 'top' ? b.y - a.y : a.y - b.y));
        const rowY = front[0].y;
        const row = front.filter((c) => Math.abs(c.y - rowY) < 0.5);
        row.sort((a, b) => b.x - a.x);
        const c = row[Math.floor((row.length - 1) / 2)];

        engine.camera.position.set(c.x + 7.0, c.y + 1.3, c.z + 2.0);
        engine.camera.lookAt(c.x - 5.0, c.y - 0.3, c.z + 0.45);
        engine.camera.updateMatrixWorld(true);
        window.__testHooks.step(30, { render: true });
        for (const id of ['harness-status', 'harness-log']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
        return centers.length;
    }, { role, pick });
    expect(found).toBeGreaterThan(0);
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

test('Capture: AI 503 capital and impost projection', async ({ page }) => {
    test.setTimeout(420_000);
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    const arcadeHall = overridesFor('arcade_hall');
    const setbackTower = overridesFor('setback_tower');

    // Warm-up build: the very first build renders with cold caches.
    await loadModel(page, { overrides: arcadeHall, viewport });

    await loadModel(page, { overrides: arcadeHall, viewport });
    await shootBandGraze(page, { role: 'bay_arcade_impost', pick: 'bottom', name: `ai503_arcade_impost_graze_${TAG}` });

    await loadModel(page, { overrides: setbackTower, viewport });
    await shootBandGraze(page, { role: 'bay_capital', pick: 'top', name: `ai503_pier_capital_graze_${TAG}` });
});
