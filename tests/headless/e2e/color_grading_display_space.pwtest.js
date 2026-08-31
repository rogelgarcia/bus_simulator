// Headless browser tests for the display-referred LUT output transform.
import test, { expect } from '@playwright/test';

const ACTIVE_PRESETS = Object.freeze(['cool', 'vivid', 'warm']);

test('Harness: every LUT preset loads in display space and off remains disabled', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = [];

    page.on('pageerror', (error) => errors.push(error?.message ?? String(error)));
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (text.includes('ResizeObserver loop limit exceeded')) return;
        errors.push(text);
    });

    for (const preset of ACTIVE_PRESETS) {
        await page.goto(`/tests/headless/harness/index.html?ibl=0&bloom=0&grade=${preset}&gradeIntensity=1`);
        await page.waitForFunction(() => window.__testHooks?.version === 1);
        await page.evaluate(async (seed) => {
            window.__testHooks.setViewport(960, 540);
            await window.__testHooks.loadScenario('city_straight_road', { seed });
            window.__testHooks.step(20, { render: true });
        }, `grade-display-${preset}`);

        const initial = await page.evaluate(() => window.__testHooks.getColorGradingDebugInfo?.() ?? null);
        expect(initial?.supported).toBe(true);
        await page.waitForFunction(
            () => window.__testHooks.getColorGradingDebugInfo?.().status === 'ready',
            null,
            { timeout: 10_000 }
        );
        const ready = await page.evaluate(() => window.__testHooks.getColorGradingDebugInfo?.() ?? null);
        expect(ready).toMatchObject({
            requestedPreset: preset,
            intensity: 1,
            enabled: true,
            hasLut: true,
            status: 'ready',
            applicationSpace: 'display-referred-srgb-after-tone-mapping',
            lastError: null
        });

        const pixels = await page.locator('canvas').evaluate((canvas) => {
            const context = canvas.getContext('webgl2');
            const rgba = new Uint8Array(4);
            context.readPixels(
                Math.floor(canvas.width / 2),
                Math.floor(canvas.height / 2),
                1,
                1,
                context.RGBA,
                context.UNSIGNED_BYTE,
                rgba
            );
            return Array.from(rgba);
        });
        expect(pixels).toHaveLength(4);
        expect(pixels.every(Number.isFinite)).toBe(true);
    }

    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0&grade=off&gradeIntensity=0');
    await page.waitForFunction(() => window.__testHooks?.version === 1);
    await page.evaluate(async () => {
        window.__testHooks.setViewport(960, 540);
        await window.__testHooks.loadScenario('city_straight_road', { seed: 'grade-display-off' });
        window.__testHooks.step(20, { render: true });
    });
    const off = await page.evaluate(() => window.__testHooks.getColorGradingDebugInfo?.() ?? null);
    expect(off).toMatchObject({
        requestedPreset: 'off',
        intensity: 0,
        enabled: false,
        hasLut: false,
        status: 'off',
        applicationSpace: 'display-referred-srgb-after-tone-mapping',
        lastError: null
    });

    expect(errors).toEqual([]);
});
