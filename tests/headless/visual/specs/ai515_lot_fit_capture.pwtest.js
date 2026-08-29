// Capture: AI 515 — one catalog building fitted to narrow and wide city lots.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

test('Capture: AI 515 narrow and wide lot fitting', async ({ page }) => {
    test.setTimeout(180_000);
    await bootHarness(page, { query: '' });
    await fs.mkdir(OUT_DIR, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(async () => {
        window.__testHooks.setViewport(1280, 720);
        await window.__testHooks.loadScenario('ai515_lot_fit_compare', { seed: 'ai515' });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(30, { render: true });
    });
    await page.waitForFunction(() => {
        const metrics = window.__testHooks.getMetrics()?.scenario;
        return metrics?.textures?.total > 0 && metrics.textures.ready >= metrics.textures.total;
    }, null, { timeout: 60_000, polling: 250 });
    const metrics = await page.evaluate(() => window.__testHooks.getMetrics().scenario);
    expect(metrics.buildingId).toBe('banded_loft_2');
    expect(metrics.wide.width).toBeGreaterThan(metrics.narrow.width + 10);
    await page.evaluate(() => {
        for (const id of ['harness-status', 'harness-log']) {
            const element = document.getElementById(id);
            if (element) element.style.display = 'none';
        }
        window.__testHooks.step(10, { render: true });
    });
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, 'ai515_same_building_narrow_wide_lots.png') });
});
