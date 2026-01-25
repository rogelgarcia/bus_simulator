// Capture: asphalt noise (color + roughness) close-up.
import test, { expect } from '@playwright/test';
import { bootHarness, renderGoldenFrame } from './_harness_visual_helpers.js';

async function captureCanvas(page, testInfo, name) {
    const canvas = page.locator('#harness-canvas');
    await expect(canvas).toBeVisible();
    return canvas.screenshot({ path: testInfo.outputPath(name) });
}

test('Capture: asphalt_noise_debug (grid + macro, stable)', async ({ page }, testInfo) => {
    await bootHarness(page, { query: '?ibl=0&bloom=0' });

    const seed = 'capture-asphalt-noise-debug';
    const viewport = { width: 1280, height: 720 };
    const params = {
        baseRoughness: 0.78,
        coarse: {
            scale: 0.09,
            colorStrength: 0.24,
            dirtyStrength: 0.22,
            roughnessStrength: 0.32
        },
        fine: {
            scale: 12.0,
            colorStrength: 0.08,
            dirtyStrength: 0.0,
            roughnessStrength: 0.2
        }
    };

    const grid = await renderGoldenFrame(page, {
        scenarioId: 'asphalt_noise_debug',
        seed,
        viewport,
        warmupTicks: 10,
        scenarioOptions: { camera: 'grid', ...params }
    });
    expect(grid?.scenarioId).toBe('asphalt_noise_debug');
    await captureCanvas(page, testInfo, 'asphalt_noise_debug__grid.png');

    const macro = await renderGoldenFrame(page, {
        scenarioId: 'asphalt_noise_debug',
        seed,
        viewport,
        warmupTicks: 10,
        scenarioOptions: { camera: 'macro', ...params }
    });
    expect(macro?.scenarioId).toBe('asphalt_noise_debug');

    const a = await captureCanvas(page, testInfo, 'asphalt_noise_debug__macro.png');
    await page.evaluate(() => window.__testHooks.step(60, { render: true }));
    const b = await captureCanvas(page, testInfo, 'asphalt_noise_debug__macro_after_60.png');
    expect(b.equals(a)).toBe(true);
});
