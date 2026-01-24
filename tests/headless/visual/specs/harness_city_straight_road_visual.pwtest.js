// Visual regression: straight road.
import test, { expect } from '@playwright/test';
import { bootHarness, renderGoldenFrame, screenshotName } from './_harness_visual_helpers.js';

test('Visual: city_straight_road golden frame', async ({ page }) => {
    await bootHarness(page, { query: '?ibl=0&bloom=0' });

    const viewport = { width: 960, height: 540 };
    const seed = 'visual-straight-road';
    const metrics = await renderGoldenFrame(page, {
        scenarioId: 'city_straight_road',
        seed,
        viewport,
        warmupTicks: 40
    });

    expect(metrics?.scenarioId).toBe('city_straight_road');
    expect(metrics?.scenario?.roadNetwork?.edges).toBeGreaterThan(0);

    await expect(page).toHaveScreenshot(
        screenshotName({ scenarioId: 'city_straight_road', seed, width: viewport.width, height: viewport.height }),
        { maxDiffPixelRatio: 0.001 }
    );
});
