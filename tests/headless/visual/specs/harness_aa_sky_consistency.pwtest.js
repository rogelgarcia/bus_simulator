// Regression: enabling SMAA/FXAA should not change sky/fog colors.
import test, { expect } from '@playwright/test';
import { bootHarness, renderGoldenFrame } from './_harness_visual_helpers.js';

async function sampleSkyAverage(page) {
    return page.evaluate(() => {
        const canvas = document.getElementById('harness-canvas');
        if (!canvas) return null;

        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl?.readPixels) return null;

        const size = 64;
        const margin = 12;
        const w = canvas.width || 1;
        const h = canvas.height || 1;
        const x = Math.max(0, Math.floor(w * 0.5 - size * 0.5));
        const y = Math.max(0, Math.floor(h - size - margin));

        const buf = new Uint8Array(size * size * 4);
        gl.readPixels(x, y, size, size, gl.RGBA, gl.UNSIGNED_BYTE, buf);

        const pxCount = size * size;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        for (let i = 0; i < buf.length; i += 4) {
            sumR += buf[i];
            sumG += buf[i + 1];
            sumB += buf[i + 2];
        }

        return {
            r: sumR / pxCount,
            g: sumG / pxCount,
            b: sumB / pxCount
        };
    });
}

function maxChannelDelta(a, b) {
    if (!a || !b) return Infinity;
    return Math.max(
        Math.abs(a.r - b.r),
        Math.abs(a.g - b.g),
        Math.abs(a.b - b.b)
    );
}

test('Visual: SMAA/FXAA should not shift sky average color', async ({ page }) => {
    await bootHarness(page, { query: '?ibl=0&bloom=0&sunBloom=0&grade=off' });

    await page.evaluate(() => window.__testHooks.setAntiAliasingSettings({ mode: 'off' }));

    await renderGoldenFrame(page, {
        scenarioId: 'city_straight_road',
        seed: 'aa-sky-consistency',
        viewport: { width: 960, height: 540 },
        warmupTicks: 40
    });

    await page.evaluate(() => window.__testHooks.renderFrame());
    const baseline = await sampleSkyAverage(page);
    expect(baseline).not.toBeNull();

    await page.evaluate(() => window.__testHooks.setAntiAliasingSettings({ mode: 'smaa' }));
    await page.evaluate(() => window.__testHooks.step(5, { render: true }));
    const smaa = await sampleSkyAverage(page);
    expect(smaa).not.toBeNull();

    await page.evaluate(() => window.__testHooks.setAntiAliasingSettings({ mode: 'fxaa' }));
    await page.evaluate(() => window.__testHooks.step(5, { render: true }));
    const fxaa = await sampleSkyAverage(page);
    expect(fxaa).not.toBeNull();

    expect(maxChannelDelta(baseline, smaa)).toBeLessThanOrEqual(3);
    expect(maxChannelDelta(baseline, fxaa)).toBeLessThanOrEqual(3);
});

