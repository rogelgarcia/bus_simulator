// Headless browser tests: window mesh shade visibility regression guard.
import test, { expect } from '@playwright/test';

async function attachFailFastConsole({ page }) {
    const errors = [];
    await page.addInitScript(() => {
        window.__e2eErrors = [];
        window.addEventListener('unhandledrejection', (e) => {
            const msg = e?.reason?.message ?? String(e?.reason ?? 'unhandledrejection');
            window.__e2eErrors.push({ kind: 'unhandledrejection', message: msg });
        });
    });
    page.on('pageerror', (err) => {
        errors.push({ kind: 'pageerror', message: err?.message ?? String(err) });
    });
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        const allow = [
            'ResizeObserver loop limit exceeded'
        ];
        if (allow.some((s) => text.includes(s))) return;
        errors.push({ kind: 'console.error', message: text });
    });
    page.on('requestfailed', (req) => {
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        errors.push({ kind: 'requestfailed', message: `${req.url()} (${type})` });
    });
    page.on('response', (res) => {
        const req = res.request();
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        const status = res.status();
        if (status < 400) return;
        errors.push({ kind: 'http', message: `${status} ${res.url()} (${type})` });
    });
    return async () => {
        const fromPage = await page.evaluate(() => Array.isArray(window.__e2eErrors) ? window.__e2eErrors : []);
        return [...errors, ...fromPage];
    };
}

function luminanceFromRgb(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test('Window mesh: shade renders and affects pixels', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);

    const result = await page.evaluate(async () => {
        const viewport = { width: 960, height: 540 };
        window.__testHooks.setViewport(viewport.width, viewport.height);
        window.__testHooks.setFixedDt(1 / 60);

        const canvas = document.getElementById('harness-canvas');
        if (!canvas) throw new Error('Missing #harness-canvas');

        const w = Math.max(1, canvas.width | 0);
        const h = Math.max(1, canvas.height | 0);
        const roi = {
            x: Math.max(0, Math.min(w - 1, Math.floor(w * 0.41))),
            y: Math.max(0, Math.min(h - 1, Math.floor(h * 0.34))),
            w: Math.max(1, Math.floor(w * 0.18)),
            h: Math.max(1, Math.floor(h * 0.26))
        };

        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Missing offscreen 2D context');

        const grabLuma = () => {
            ctx.drawImage(canvas, 0, 0);
            const data = ctx.getImageData(roi.x, roi.y, roi.w, roi.h).data;
            let sum = 0;
            let count = 0;
            for (let i = 0; i + 2 < data.length; i += 4) {
                sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
                count += 1;
            }
            return count ? sum / count : 0;
        };

        const renderAndMeasure = async (shadeCoverage) => {
            await window.__testHooks.loadScenario('window_mesh_shade_visibility', {
                seed: 'shade-vis',
                shadeCoverage,
                randomizeCoverage: false,
                shadeColorHex: 0x111111,
                glassOpacity: 0.35
            });
            window.__testHooks.step(20, { render: true });
            window.__testHooks.renderFrame();
            return grabLuma();
        };

        const lumaNoShade = await renderAndMeasure(0.0);
        const lumaFullShade = await renderAndMeasure(1.0);

        return {
            viewport,
            roi,
            lumaNoShade,
            lumaFullShade
        };
    });

    const delta = result.lumaNoShade - result.lumaFullShade;
    expect(delta).toBeGreaterThan(18);
    expect(await getErrors()).toEqual([]);
});

