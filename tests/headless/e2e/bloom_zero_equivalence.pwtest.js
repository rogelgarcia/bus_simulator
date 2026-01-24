// Headless browser tests: bloom should be a no-op at zero strength.
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

async function bootAndMeasure(page, { query, scenarioId, seed, warmupTicks = 40, viewport = { width: 960, height: 540 } }) {
    await page.goto(`/tests/headless/harness/index.html${query}`);
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);

    return page.evaluate(async (args) => {
        const { scenarioId, seed, warmupTicks, viewport } = args;
        window.__testHooks.setViewport(viewport.width, viewport.height);
        await window.__testHooks.loadScenario(scenarioId, { seed });
        window.__testHooks.step(warmupTicks, { render: true });

        const canvas = document.getElementById('harness-canvas');
        const w = canvas?.width ?? 0;
        const h = canvas?.height ?? 0;
        if (!canvas || w <= 0 || h <= 0) return { ok: false, error: 'Missing or invalid harness canvas' };

        const tmp = document.createElement('canvas');
        tmp.width = w;
        tmp.height = h;
        const ctx = tmp.getContext('2d', { willReadFrequently: true });
        if (!ctx) return { ok: false, error: 'Failed to create 2D canvas context' };

        ctx.drawImage(canvas, 0, 0);
        let img;
        try {
            img = ctx.getImageData(0, 0, w, h);
        } catch (err) {
            return { ok: false, error: err?.message ?? String(err ?? 'getImageData failed') };
        }

        const data = img.data;
        const sampleCols = 16;
        const sampleRows = 9;
        const samples = [];
        for (let ry = 0; ry < sampleRows; ry++) {
            for (let cx = 0; cx < sampleCols; cx++) {
                const x = Math.min(w - 1, Math.max(0, Math.floor(((cx + 0.5) / sampleCols) * w)));
                const y = Math.min(h - 1, Math.max(0, Math.floor(((ry + 0.5) / sampleRows) * h)));
                const i = (y * w + x) * 4;
                const rgba = (((data[i] & 255) << 24) | ((data[i + 1] & 255) << 16) | ((data[i + 2] & 255) << 8) | (data[i + 3] & 255)) >>> 0;
                samples.push(rgba);
            }
        }

        let sumLuma = 0;
        const stride = 8;
        for (let y = 0; y < h; y += stride) {
            for (let x = 0; x < w; x += stride) {
                const i = (y * w + x) * 4;
                const r = data[i] / 255;
                const g = data[i + 1] / 255;
                const b = data[i + 2] / 255;
                sumLuma += (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
            }
        }
        const sampleCount = Math.ceil(w / stride) * Math.ceil(h / stride);
        const meanLuma = sampleCount > 0 ? sumLuma / sampleCount : 0;

        return {
            ok: true,
            meanLuma,
            samples,
            bloom: window.__testHooks.getBloomDebugInfo?.() ?? null
        };
    }, { scenarioId, seed, warmupTicks, viewport });
}

test('Bloom: zero strength matches bloom off', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    const scenarioId = 'city_straight_road';
    const seed = 'bloom-zero-equivalence';

    const off = await bootAndMeasure(page, {
        query: '?ibl=0&bloom=0',
        scenarioId,
        seed
    });
    expect(off.ok).toBe(true);
    expect(off.bloom?.enabled).toBe(false);

    const zero = await bootAndMeasure(page, {
        query: '?ibl=0&bloom=1&bloomStrength=0&bloomRadius=0&bloomThreshold=0',
        scenarioId,
        seed
    });
    expect(zero.ok).toBe(true);
    expect(zero.bloom?.enabled).toBe(true);

    expect(zero.samples).toEqual(off.samples);
    expect(Math.abs(zero.meanLuma - off.meanLuma)).toBeLessThan(1e-4);
    expect(await getErrors()).toEqual([]);
});

