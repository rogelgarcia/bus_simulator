// Headless browser tests: vehicle visual smoothing reduces screen-space spikes under uneven dt.
import test, { expect } from '@playwright/test';

async function runProbe({ page, visualSmoothing }) {
    return page.evaluate(async (payload) => {
        const { visualSmoothing: smoothing } = payload;

        window.__testHooks.setViewport(960, 540);
        await window.__testHooks.loadScenario('vehicle_motion_flicker_probe', {
            seed: 'vehicle-motion-probe',
            throttle: 0.8,
            maxDistMeters: 1.5,
            maxYawDeg: 45,
            visualSmoothing: smoothing ?? null
        });

        const dtFast = 1 / 60;
        const dtSpike = 0.05;
        for (let i = 0; i < 240; i++) {
            const dt = (i % 10 === 0) ? dtSpike : dtFast;
            window.__testHooks.step(1, { dt, render: false });
        }

        return window.__testHooks.getMetrics();
    }, { visualSmoothing });
}

test('Harness: vehicle visual smoothing reduces max per-frame world step under dt spikes', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);

    const baseline = await runProbe({ page, visualSmoothing: null });
    const smoothed = await runProbe({
        page,
        visualSmoothing: { enabled: true, catchupFactor: 1.6, maxLagMeters: 2.0, nominalFps: 60 }
    });

    expect(baseline.scenarioId).toBe('vehicle_motion_flicker_probe');
    expect(smoothed.scenarioId).toBe('vehicle_motion_flicker_probe');

    const a = Number(baseline.scenario?.maxFrameDist ?? 0);
    const b = Number(smoothed.scenario?.maxFrameDist ?? 0);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(a * 0.8);
});
