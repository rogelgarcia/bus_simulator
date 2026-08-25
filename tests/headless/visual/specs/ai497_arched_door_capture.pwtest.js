// Capture: AI 497 arched entry doors — leaves terminated at the springing line,
// a transom bar, and a glazed fanlight in the lunette.
// Output: tests/artifacts/screens/buildings/ai497_*.png
// Set AI497_TAG=before / AI497_TAG=after to keep both sides of a comparison.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');
const TAG = process.env.AI497_TAG ? `_${process.env.AI497_TAG}` : '';

const SHOTS = [
    {
        // stone_lowrise_2's entrance: door_wood_arch, the asset the bug was
        // reported against.
        name: `ai497_stone_lowrise_2_entrance${TAG}`,
        buildingId: 'stone_lowrise_2',
        camera: { position: { x: -3.4, y: 1.6, z: 23.4 }, target: { x: -5.7, y: 1.0, z: 18.8 } }
    },
    {
        // Head-on close-up of the head: leaves, transom, fanlight.
        name: `ai497_stone_lowrise_2_entrance_head${TAG}`,
        buildingId: 'stone_lowrise_2',
        camera: { position: { x: -5.7, y: 2.1, z: 21.6 }, target: { x: -5.7, y: 2.0, z: 18.6 } }
    },
    {
        // gov_center_2 uses the same door asset at civic scale.
        name: `ai497_gov_center_2_entrance${TAG}`,
        buildingId: 'gov_center_2',
        camera: { position: { x: 0.0, y: 2.0, z: 30.0 }, target: { x: 0.0, y: 1.9, z: 24.0 } }
    }
];

test('Capture: AI 497 arched doors', async ({ page }) => {
    test.setTimeout(300_000);
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '2');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 2;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    // Warm-up build (cold caches render differently on the very first build).
    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', { seed: 'showcase', buildingId: args.buildingId });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: SHOTS[0].buildingId, viewport });

    for (const shot of SHOTS) {
        await page.evaluate(async (args) => {
            window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
            await window.__testHooks.loadScenario('building_showcase', {
                seed: 'showcase',
                buildingId: args.buildingId
            });
            window.__testHooks.setFixedDt(1 / 60);
            window.__testHooks.step(5, { render: true });
        }, { buildingId: shot.buildingId, viewport });

        await page.waitForFunction(() => {
            const textures = window.__testHooks.getMetrics()?.scenario?.textures ?? null;
            return !!textures && textures.total > 0 && textures.ready >= textures.total;
        }, null, { timeout: 120_000 });

        await page.evaluate((camera) => {
            const engine = window.__testHooks.getEngine();
            engine.camera.position.set(camera.position.x, camera.position.y, camera.position.z);
            engine.camera.lookAt(camera.target.x, camera.target.y, camera.target.z);
            engine.camera.updateProjectionMatrix();
            window.__testHooks.step(3, { render: true });
        }, shot.camera);

        await page.screenshot({ path: path.join(OUT_DIR, `${shot.name}.png`) });
    }
});
