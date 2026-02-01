// Headless browser tests: hi-res grass blade "white shine" regression guard.
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

test('Grass blade (hi-res): disabling shine removes near-white highlights', async ({ page }) => {
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
            x: Math.max(0, Math.min(w - 1, Math.floor(w * 0.25))),
            y: Math.max(0, Math.min(h - 1, Math.floor(h * 0.08))),
            w: Math.max(1, Math.floor(w * 0.5)),
            h: Math.max(1, Math.floor(h * 0.84))
        };

        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Missing offscreen 2D context');

        const measure = () => {
            ctx.drawImage(canvas, 0, 0);
            const data = ctx.getImageData(roi.x, roi.y, roi.w, roi.h).data;
            let maxMinRGB = 0;
            let nearWhiteCount = 0;
            let count = 0;
            for (let i = 0; i + 2 < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const minRGB = Math.min(r, g, b);
                if (minRGB > maxMinRGB) maxMinRGB = minRGB;
                if (r > 240 && g > 240 && b > 240) nearWhiteCount += 1;
                count += 1;
            }
            return {
                maxMinRGB,
                nearWhiteRatio: count ? nearWhiteCount / count : 0
            };
        };

        const renderAndMeasure = async (params) => {
            await window.__testHooks.loadScenario('grass_blade_hires_shine', {
                seed: 'blade-shine',
                ...params
            });
            window.__testHooks.step(12, { render: true });
            window.__testHooks.renderFrame();
            const metrics = window.__testHooks.getMetrics();
            return { pixels: measure(), metrics };
        };

        const shineOff = await renderAndMeasure({
            edgeTintEnabled: false,
            edgeTintStrength: 1,
            grazingShineEnabled: false,
            grazingShine: 1,
            grazingShineRoughness: 0,
            specularIntensity: 0,
            roughness: 0.88,
            metalness: 0.0
        });

        const shineOn = await renderAndMeasure({
            edgeTintEnabled: true,
            edgeTintStrength: 0.7,
            grazingShineEnabled: true,
            grazingShine: 1,
            grazingShineRoughness: 0.08,
            specularIntensity: 1,
            roughness: 0.22,
            metalness: 0.0
        });

        return {
            viewport,
            roi,
            shineOff,
            shineOn
        };
    });

    expect(result.shineOff.pixels.maxMinRGB).toBeLessThan(210);
    expect(result.shineOff.pixels.nearWhiteRatio).toBeLessThan(0.0002);

    const offMat = result.shineOff.metrics?.scenario?.material ?? null;
    expect(offMat?.specularIntensity).toBe(0);
    expect(offMat?.sheen).toBe(0);
    expect(offMat?.clearcoat).toBe(0);

    const onMat = result.shineOn.metrics?.scenario?.material ?? null;
    expect(onMat?.specularIntensity).toBe(1);
    expect(onMat?.sheen).toBeGreaterThan(0.01);
    expect(onMat?.clearcoat).toBeGreaterThan(0.01);

    expect(await getErrors()).toEqual([]);
});
