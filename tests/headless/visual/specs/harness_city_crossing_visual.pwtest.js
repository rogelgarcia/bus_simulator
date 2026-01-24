// Visual regression: city crossing.
import test, { expect } from '@playwright/test';
import { bootHarness, renderGoldenFrame, screenshotName } from './_harness_visual_helpers.js';

test('Visual: city_crossing golden frame', async ({ page }) => {
    await bootHarness(page, { query: '?ibl=0' });

    const viewport = { width: 960, height: 540 };
    const seed = 'visual-city-crossing';
    const metrics = await renderGoldenFrame(page, {
        scenarioId: 'city_crossing',
        seed,
        viewport,
        warmupTicks: 40
    });

    expect(metrics?.scenarioId).toBe('city_crossing');
    expect(metrics?.scenario?.roadNetwork?.edges).toBeGreaterThan(0);

    await expect(page).toHaveScreenshot(
        screenshotName({ scenarioId: 'city_crossing', seed, width: viewport.width, height: viewport.height }),
        { maxDiffPixelRatio: 0.001 }
    );
});

