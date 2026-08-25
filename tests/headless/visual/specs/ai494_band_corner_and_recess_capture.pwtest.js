// Capture: AI 494 band decorations at a building corner and through a recess.
// Street-level and close-up shots of the two reported defects:
//   - the corner band segment rotated 90° out of plane ("fin"),
//   - the base band stopping dead at a recessed bay.
// Output: tests/artifacts/screens/buildings/ai494_*.png
// Set AI494_TAG=before / AI494_TAG=after to keep both sides of a comparison.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');
const TAG = process.env.AI494_TAG ? `_${process.env.AI494_TAG}` : '';

const SHOTS = [
    {
        // The A/B corner of the ground floor: the bay that used to render its
        // head band and base band as fins sticking out of the wall.
        name: `ai494_stone_lowrise_2_corner${TAG}`,
        buildingId: 'stone_lowrise_2',
        camera: { position: { x: 16.5, y: 3.2, z: 26.0 }, target: { x: 9.0, y: 2.4, z: 18.6 } }
    },
    {
        name: `ai494_stone_lowrise_2_corner_closeup${TAG}`,
        buildingId: 'stone_lowrise_2',
        camera: { position: { x: 11.6, y: 1.9, z: 21.4 }, target: { x: 9.0, y: 1.2, z: 18.7 } }
    },
    {
        // A recessed entrance bay flanked by piers: the base band should run
        // through the recess instead of stopping at its edge.
        name: `ai494_mainstreet_block_recess${TAG}`,
        buildingId: 'mainstreet_block',
        camera: { position: { x: -4.5, y: 2.6, z: 27.5 }, target: { x: -6.4, y: 1.4, z: 19.0 } }
    },
    {
        name: `ai494_mainstreet_block_recess_closeup${TAG}`,
        buildingId: 'mainstreet_block',
        camera: { position: { x: -4.6, y: 1.3, z: 22.6 }, target: { x: -6.6, y: 0.7, z: 19.0 } }
    },
    {
        // A recessed door bay: the band follows the reveal in and out around the
        // doorway instead of running across the threshold.
        name: `ai494_stone_lowrise_2_door_recess${TAG}`,
        buildingId: 'stone_lowrise_2',
        camera: { position: { x: -3.4, y: 1.6, z: 23.4 }, target: { x: -5.7, y: 1.0, z: 18.8 } }
    },
    {
        // The recessed entrance bay itself — the view the bug was reported from.
        name: `ai494_mainstreet_block_entrance${TAG}`,
        buildingId: 'mainstreet_block',
        camera: { position: { x: -5.6, y: 1.8, z: 24.5 }, target: { x: -8.0, y: 1.2, z: 19.0 } }
    }
];

test('Capture: AI 494 band corner + recess', async ({ page }) => {
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
