// Regression: compiled window-part merging must preserve the authored pixels.
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const VIEWPORT = Object.freeze({ width: 960, height: 540 });

async function waitForShowcaseReady(page) {
    await page.waitForFunction(() => {
        const metrics = window.__testHooks.getMetrics()?.scenario;
        return metrics?.textures?.total > 0 && metrics.textures.ready === metrics.textures.total;
    }, null, { timeout: 60_000, polling: 250 });
}

async function loadBradbury(page, mergeBuildingWindowAssemblies) {
    await page.evaluate(async ({ viewport, mergeWindows }) => {
        window.__testHooks.setViewport(viewport.width, viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'ai518_parity',
            buildingId: 'bradbury_block',
            mergeBuildingGeometry: true,
            mergeBuildingWindowAssemblies: mergeWindows
        });
        window.__testHooks.setFixedDt(1 / 60);
    }, { viewport: VIEWPORT, mergeWindows: mergeBuildingWindowAssemblies });
    await waitForShowcaseReady(page);
    await page.evaluate(() => window.__testHooks.step(30, { render: true }));
}

async function storePixels(page, key) {
    await page.evaluate((storageKey) => {
        const renderer = window.__testHooks.getEngine().renderer;
        const gl = renderer.getContext();
        const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        window[storageKey] = pixels;
    }, key);
}

test('AI 518: compiled Bradbury windows preserve viewport pixels', async ({ page }) => {
    test.setTimeout(180_000);
    await bootHarness(page, { query: '' });
    await page.setViewportSize(VIEWPORT);

    await loadBradbury(page, false);
    await loadBradbury(page, false);
    await storePixels(page, '__ai518WindowBaseline');
    await loadBradbury(page, true);
    await storePixels(page, '__ai518WindowCompiled');

    const result = await page.evaluate(() => {
        const baseline = window.__ai518WindowBaseline;
        const compiled = window.__ai518WindowCompiled;
        let changed = 0;
        let maxDelta = 0;
        const pixelCount = baseline.length / 4;
        for (let pixel = 0; pixel < pixelCount; pixel++) {
            let pixelDelta = 0;
            for (let channel = 0; channel < 3; channel++) {
                const index = pixel * 4 + channel;
                const delta = Math.abs(baseline[index] - compiled[index]);
                pixelDelta = Math.max(pixelDelta, delta);
                maxDelta = Math.max(maxDelta, delta);
            }
            if (pixelDelta > 2) changed += 1;
        }
        return { changed, changedPercent: changed / pixelCount * 100, maxDelta };
    });

    expect(result.changedPercent).toBeLessThanOrEqual(0.1);
});
