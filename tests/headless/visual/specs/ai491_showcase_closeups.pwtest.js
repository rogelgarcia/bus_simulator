// Capture: AI 491 close-up shots of the material-infrastructure showcase
// buildings (brick_bank_2 slots/trim + rusticated base, banded_loft_2 bands).
// Also the reference example for the showcase scenario's close-up camera
// options (cameraDir / cameraPadding / cameraTargetYFrac).
// Output: tests/artifacts/screens/buildings/ai491_*.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const SHOTS = [
    {
        name: 'ai491_brick_bank_2_closeup_trim',
        buildingId: 'brick_bank_2',
        options: { cameraDir: { x: -0.55, y: 0.22, z: 1.0 }, cameraPadding: 0.42, cameraTargetYFrac: 0.62 }
    },
    {
        name: 'ai491_brick_bank_2_closeup_base',
        buildingId: 'brick_bank_2',
        options: { cameraDir: { x: -0.7, y: 0.16, z: 1.0 }, cameraPadding: 0.4, cameraTargetYFrac: 0.16 }
    },
    {
        name: 'ai491_banded_loft_2_closeup_bands',
        buildingId: 'banded_loft_2',
        options: { cameraDir: { x: -0.55, y: 0.2, z: 1.0 }, cameraPadding: 0.45, cameraTargetYFrac: 0.55 }
    }
];

test('Capture: AI 491 close-ups', async ({ page }) => {
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
