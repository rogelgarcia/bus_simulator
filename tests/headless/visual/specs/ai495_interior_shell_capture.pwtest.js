// Capture: AI 495 interior shell — see-through ground floor and opaque
// openings on interior-backed walls.
// Output: tests/artifacts/screens/buildings/ai495_*.png
// Set AI495_TAG=before / AI495_TAG=after to keep both sides of a comparison.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');
const TAG = process.env.AI495_TAG ? `_${process.env.AI495_TAG}` : '';

const SHOTS = [
    {
        // Street level, looking diagonally into the ground-floor glazing: the
        // sightline the report showed crossing the whole building.
        name: `ai495_mainstreet_block_through_view${TAG}`,
        buildingId: 'mainstreet_block',
        camera: { position: { x: 2.0, y: 1.6, z: 25.0 }, target: { x: -8.0, y: 1.3, z: 12.0 } }
    },
    {
        // Head-on into one shopfront, close enough to read what is behind glass.
        name: `ai495_mainstreet_block_shopfront${TAG}`,
        buildingId: 'mainstreet_block',
        camera: { position: { x: -6.5, y: 1.5, z: 23.5 }, target: { x: -6.5, y: 1.4, z: 12.0 } }
    },
    {
        // An upper floor that has a real interior room behind the glass.
        name: `ai495_mainstreet_block_upper_room${TAG}`,
        buildingId: 'mainstreet_block',
        camera: { position: { x: -6.5, y: 7.2, z: 24.0 }, target: { x: -6.5, y: 7.0, z: 12.0 } }
    },
    {
        // Standing inside a ground-floor room, looking at the far wall: the view
        // the report showed with a glazed door rendering as opaque wall.
        name: `ai495_mainstreet_block_inside_room${TAG}`,
        buildingId: 'mainstreet_block',
        camera: { position: { x: -6.0, y: 1.7, z: 17.5 }, target: { x: -6.0, y: 1.5, z: 5.0 } }
    },
    {
        // Same room, looking along it: shows how much of the shell is closed.
        name: `ai495_mainstreet_block_inside_room_wide${TAG}`,
        buildingId: 'mainstreet_block',
        camera: { position: { x: 6.0, y: 2.2, z: 17.5 }, target: { x: -10.0, y: 1.6, z: 8.0 } }
    },
    {
        // gov_center_2: every layer has interior.enabled false, so the glazing
        // has nothing behind it — the reported straight-through sightline.
        name: `ai495_gov_center_2_through_view${TAG}`,
        buildingId: 'gov_center_2',
        camera: { position: { x: -16.0, y: 2.4, z: 32.0 }, target: { x: 4.0, y: 2.0, z: 21.0 } }
    },
    {
        name: `ai495_gov_center_2_through_view_closeup${TAG}`,
        buildingId: 'gov_center_2',
        camera: { position: { x: -5.0, y: 2.2, z: 29.5 }, target: { x: -5.0, y: 2.0, z: 22.0 } }
    },
    {
        // beige_1 ground floor: same recipe, different config.
        name: `ai495_beige_1_through_view${TAG}`,
        buildingId: 'beige_1',
        camera: { position: { x: -9.0, y: 1.6, z: 26.5 }, target: { x: 2.0, y: 1.4, z: 17.0 } }
    },
    {
        // stone_lowrise_2 ground floor: same question on a different config.
        name: `ai495_stone_lowrise_2_through_view${TAG}`,
        buildingId: 'stone_lowrise_2',
        camera: { position: { x: 3.0, y: 1.6, z: 23.0 }, target: { x: -5.0, y: 1.3, z: 8.0 } }
    }
];

test('Capture: AI 495 interior shell', async ({ page }) => {
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
