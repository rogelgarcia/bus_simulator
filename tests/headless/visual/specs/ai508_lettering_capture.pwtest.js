// Capture: AI 508 — facade signage lettering. "BRADBURY" as raised sandstone
// block letters in the frieze band over the bradbury_block entry portal
// (above the archivolt, under the floor top), authored as a
// wallDecorations.lettering item via configOverrides — the config itself
// adopts the sign in AI 511.
// Output: tests/artifacts/screens/buildings/ai508_bradbury_frieze_<tag>.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const TAG = /^[a-z0-9_]+$/.test(String(process.env.AI508_TAG ?? '')) ? process.env.AI508_TAG : 'after';

// The entry portal arch carries a 0.52m archivolt band; the sign sits in the
// clear sandstone band between the archivolt crown and the floor top, in the
// same stone as the base (slot), reading as carved-relief lettering.
const LETTERING_OVERRIDE = {
    wallDecorations: {
        lettering: [
            {
                id: 'sign_bradbury',
                text: 'BRADBURY',
                target: {
                    layerId: 'floor_bb1',
                    bayRef: 'A:entry_8',
                    zone: 'opening_header',
                    floor: 1,
                    yOffsetMeters: 0.3
                },
                heightMeters: 0.24,
                depthMeters: 0.045,
                letterSpacingRatio: 0.26,
                material: { kind: 'slot', id: 'base' }
            }
        ]
    }
};

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

async function loadModel(page, { viewport }) {
    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: 'bradbury_block',
            configOverrides: args.overrides,
            mergeBuildingGeometry: false
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { overrides: LETTERING_OVERRIDE, viewport });
    await waitForShowcaseReady(page);
}

// Frame the portal frieze from street level: find the sign mesh by its role
// tag (the scenario loads unmerged so roles survive) and aim just under it.
async function shootFrieze(page, { name, dist, lift, side }) {
    const found = await page.evaluate(async ({ dist, lift, side }) => {
        const THREE = await import('three');
        const engine = window.__testHooks.getEngine();
        let sign = null;
        engine.scene.traverse((obj) => {
            if (!sign && obj?.userData?.buildingFab2Role === 'facade_lettering') sign = obj;
        });
        if (!sign) return 0;
        sign.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(sign);
        const c = box.getCenter(new THREE.Vector3());

        engine.camera.position.set(c.x + side, c.y - lift, c.z + dist);
        engine.camera.lookAt(c.x, c.y - 0.35, c.z - 0.4);
        engine.camera.updateMatrixWorld(true);
        window.__testHooks.step(30, { render: true });
        for (const id of ['harness-status', 'harness-log']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
        return 1;
    }, { dist, lift, side });
    expect(found).toBe(1);
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

test('Capture: AI 508 BRADBURY frieze lettering', async ({ page }) => {
    test.setTimeout(420_000);
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    // Warm-up build: the very first build renders with cold caches.
    await loadModel(page, { viewport });

    await loadModel(page, { viewport });
    await shootFrieze(page, { name: `ai508_bradbury_frieze_closeup_${TAG}`, dist: 3.4, lift: 1.1, side: 0.9 });
    await shootFrieze(page, { name: `ai508_bradbury_entry_${TAG}`, dist: 8.5, lift: 2.6, side: 2.4 });
});
