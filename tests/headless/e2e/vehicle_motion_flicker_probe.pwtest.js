// Headless browser tests: vehicle motion probe under uneven dt (deterministic harness).
import test, { expect } from '@playwright/test';

test('Harness: vehicle motion probe reports no large single-frame spikes', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);

        const metrics = await page.evaluate(async () => {
        await window.__testHooks.loadScenario('vehicle_motion_flicker_probe', {
            seed: 'vehicle-motion-probe',
            throttle: 0.6,
            maxDistMeters: 0.9,
            maxYawDeg: 25
        });

        // Alternate between a normal dt and a clamped "slow frame" dt.
        const dtA = 1 / 60;
        const dtB = 0.05;
        for (let i = 0; i < 240; i++) {
            window.__testHooks.step(1, { dt: (i % 2 === 0) ? dtA : dtB, render: false });
        }

        return window.__testHooks.getMetrics();
    });

    expect(metrics.scenarioId).toBe('vehicle_motion_flicker_probe');
    expect(metrics.scenario.frames).toBeGreaterThan(50);
    expect(metrics.scenario.spikes).toBe(0);
});
