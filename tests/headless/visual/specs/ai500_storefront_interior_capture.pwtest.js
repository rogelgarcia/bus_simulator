// Capture: AI 500 storefront display glazing shop interior.
// Street-level and close-up shots of the `storefront_row_2` ground-floor shop
// row, the view the bug was reported against.
// Output: tests/artifacts/screens/buildings/ai500_*.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');
const TAG = process.env.AI500_TAG ? `_${process.env.AI500_TAG}` : '';

const SHOTS = [
    {
        name: `ai500_storefront_row_2_street${TAG}`,
        buildingId: 'storefront_row_2',
        options: { cameraDir: { x: -0.35, y: 0.10, z: 1.0 }, cameraPadding: 0.34, cameraTargetYFrac: 0.10 }
    },
    {
        // Pedestrian close-up: the bounding-sphere framing never gets near
        // enough for one shopfront, so this shot places the camera by hand in
        // front of a display-glazing panel.
        name: `ai500_storefront_row_2_closeup${TAG}`,
        buildingId: 'storefront_row_2',
        options: { cameraDir: { x: -0.35, y: 0.10, z: 1.0 }, cameraPadding: 0.34, cameraTargetYFrac: 0.10 },
        closeUp: { offset: { x: 1.2, y: 0.4, z: 5.0 } }
    },
    {
        // Grazing sightline along the shop row: the angle the AI 488 preset
        // detune was chosen against, kept as a check that the retuned zoom
        // still leaves parallax headroom before the cell edge clamps.
        name: `ai500_storefront_row_2_grazing${TAG}`,
        buildingId: 'storefront_row_2',
        options: { cameraDir: { x: -0.35, y: 0.10, z: 1.0 }, cameraPadding: 0.34, cameraTargetYFrac: 0.10 },
        closeUp: { offset: { x: 11.0, y: 0.6, z: 3.4 } }
    }
];

test('Capture: AI 500 storefront shop interior', async ({ page }) => {
    test.setTimeout(300_000);
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    // Warm-up build (cold caches render differently on the very first build).
    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', { seed: 'showcase', buildingId: args.buildingId });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: SHOTS[0].buildingId, viewport });
    await page.waitForFunction(() => {
        const textures = window.__testHooks.getMetrics()?.scenario?.textures ?? null;
        return !!textures && textures.total > 0 && textures.ready >= textures.total;
    }, null, { timeout: 60_000, polling: 250 });

    for (const shot of SHOTS) {
        await page.evaluate(async (args) => {
            window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
            await window.__testHooks.loadScenario('building_showcase', {
                seed: 'showcase',
                buildingId: args.buildingId,
                ...args.options
            });
            window.__testHooks.setFixedDt(1 / 60);
            window.__testHooks.step(5, { render: true });
        }, { buildingId: shot.buildingId, options: shot.options, viewport });

        await page.waitForFunction(() => {
            const scenario = window.__testHooks.getMetrics()?.scenario ?? null;
            const textures = scenario?.textures ?? null;
            if (!textures || textures.total <= 0) return false;
            if (textures.ready < textures.total) return false;
            if (scenario.environment?.expected && !scenario.environment.present) return false;
            return true;
        }, null, { timeout: 60_000, polling: 250 });

        if (shot.closeUp) {
            await page.evaluate((offset) => {
                const eng = window.__testHooks.getEngine();
                let target = null;
                eng.scene.traverse((o) => {
                    if (target || !o.isInstancedMesh) return;
                    const mats = Array.isArray(o.material) ? o.material : [o.material];
                    const shop = mats.some((m) => m?.userData?.windowInterior
                        && String(m?.map?.image?.src ?? '').includes('wide_6x4'));
                    if (!shop) return;
                    o.updateMatrixWorld(true);
                    const m = o.matrixWorld.elements;
                    const im = o.instanceMatrix.array;
                    const lx = im[12], ly = im[13], lz = im[14];
                    target = {
                        x: m[0] * lx + m[4] * ly + m[8] * lz + m[12],
                        y: m[1] * lx + m[5] * ly + m[9] * lz + m[13],
                        z: m[2] * lx + m[6] * ly + m[10] * lz + m[14]
                    };
                });
                if (!target) throw new Error('No storefront interior panel found for the close-up shot');
                eng.camera.position.set(target.x + offset.x, target.y + offset.y, target.z + offset.z);
                eng.camera.lookAt(target.x, target.y, target.z);
                eng.camera.updateProjectionMatrix();
            }, shot.closeUp.offset);
        }

        await page.evaluate(() => {
            window.__testHooks.step(30, { render: true });
            for (const id of ['harness-status', 'harness-log']) {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            }
        });

        const metrics = await page.evaluate(() => window.__testHooks.getMetrics());
        expect(metrics?.scenario?.building?.present).toBe(true);

        const canvas = page.locator('#harness-canvas');
        await expect(canvas).toBeVisible();
        await canvas.screenshot({ path: path.join(OUT_DIR, `${shot.name}.png`) });
    }
});
