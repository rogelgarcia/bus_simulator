// Capture: road surface + marking variation comparison.
import test, { expect } from '@playwright/test';
import { bootHarness, renderGoldenFrame } from './_harness_visual_helpers.js';

async function captureCanvas(page, testInfo, name) {
    const canvas = page.locator('#harness-canvas');
    await expect(canvas).toBeVisible();
    await canvas.screenshot({ path: testInfo.outputPath(name) });
}

test('Capture: road_surface_variation_compare (wide + close)', async ({ page }, testInfo) => {
    await bootHarness(page, { query: '?ibl=0&bloom=0' });

    const seed = 'capture-road-surface-variation';
    const wideViewport = { width: 1280, height: 720 };
    const closeViewport = { width: 1280, height: 720 };

    const wide = await renderGoldenFrame(page, {
        scenarioId: 'road_surface_variation_compare',
        seed,
        viewport: wideViewport,
        warmupTicks: 10,
        scenarioOptions: { camera: 'wide' }
    });

    expect(wide?.scenarioId).toBe('road_surface_variation_compare');
    await captureCanvas(page, testInfo, 'road_surface_variation_compare__wide.png');

    const close = await renderGoldenFrame(page, {
        scenarioId: 'road_surface_variation_compare',
        seed,
        viewport: closeViewport,
        warmupTicks: 10,
        scenarioOptions: { camera: 'close' }
    });

    expect(close?.scenarioId).toBe('road_surface_variation_compare');
    await captureCanvas(page, testInfo, 'road_surface_variation_compare__close.png');
});

