// Headless browser test: Sun Bloom occlusion mode must respect alpha-cutout foliage transparency.
import test, { expect } from '@playwright/test';

async function attachFailFastConsole({ page }) {
    const issues = [];
    await page.addInitScript(() => {
        window.__e2eErrors = [];
        window.addEventListener('unhandledrejection', (e) => {
            const msg = e?.reason?.message ?? String(e?.reason ?? 'unhandledrejection');
            window.__e2eErrors.push({ kind: 'unhandledrejection', message: msg });
        });
    });
    page.on('pageerror', (err) => {
        issues.push({ kind: 'pageerror', message: err?.message ?? String(err) });
    });
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        const allow = [
            'ResizeObserver loop limit exceeded'
        ];
        if (allow.some((s) => text.includes(s))) return;
        issues.push({ kind: 'console.error', message: text });
    });
    page.on('requestfailed', (req) => {
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        issues.push({ kind: 'requestfailed', message: `${req.url()} (${type})` });
    });
    page.on('response', (res) => {
        const req = res.request();
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        const status = res.status();
        if (status < 400) return;
        issues.push({ kind: 'http', message: `${status} ${res.url()} (${type})` });
    });
    return async () => {
        const fromPage = await page.evaluate(() => Array.isArray(window.__e2eErrors) ? window.__e2eErrors : []);
        return [...issues, ...fromPage];
    };
}

async function readAveragedLuma(page, points, sampleRadiusPx = 2) {
    return page.evaluate(({ points, sampleRadiusPx }) => {
        const canvas = document.getElementById('harness-canvas');
        const w = canvas?.width ?? 0;
        const h = canvas?.height ?? 0;
        if (!canvas || w <= 0 || h <= 0) return { ok: false, error: 'Missing canvas' };

        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return { ok: false, error: 'Missing WebGL context' };

        const result = {};
        for (const p of Array.isArray(points) ? points : []) {
            const id = String(p?.id ?? '');
            if (!id) continue;
            const u = Math.min(1, Math.max(0, Number(p?.u) || 0));
            const v = Math.min(1, Math.max(0, Number(p?.v) || 0));
            const x = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
            const yTop = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
            const y = Math.min(h - 1, Math.max(0, h - 1 - yTop));
            const radius = Math.max(0, Math.floor(Number(sampleRadiusPx) || 0));

            let sum = 0;
            let count = 0;
            for (let oy = -radius; oy <= radius; oy += 1) {
                const sy = Math.min(h - 1, Math.max(0, y + oy));
                for (let ox = -radius; ox <= radius; ox += 1) {
                    const sx = Math.min(w - 1, Math.max(0, x + ox));
                    const px = new Uint8Array(4);
                    gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                    const r = px[0] / 255;
                    const g = px[1] / 255;
                    const b = px[2] / 255;
                    sum += (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
                    count += 1;
                }
            }

            result[id] = { luma: count > 0 ? sum / count : 0 };
        }

        return { ok: true, points: result, size: { w, h } };
    }, { points, sampleRadiusPx });
}

async function renderScenarioAndSample(page, { query }) {
    await page.goto(`/tests/headless/harness/index.html${query}`);
    await page.waitForFunction(() => window.__testHooks?.version === 1);

    const metrics = await page.evaluate(async () => {
        window.__testHooks.setViewport(1280, 720);
        window.__testHooks.setFixedDt(1 / 60);
        await window.__testHooks.loadScenario('sun_bloom_foliage_occlusion', { seed: 'sunbloom-325' });
        window.__testHooks.step(25, { render: true });
        return window.__testHooks.getMetrics();
    });

    const scenario = metrics?.scenario ?? null;
    const samplePoints = scenario?.samplePoints ?? null;
    const ids = ['buildingTransparent', 'skyTransparent'];
    const points = ids.map((id) => ({
        id,
        u: samplePoints?.[id]?.u ?? -1,
        v: samplePoints?.[id]?.v ?? -1,
        onScreen: samplePoints?.[id]?.onScreen === true
    }));
    for (const p of points) expect(p.onScreen).toBe(true);

    const pixels = await readAveragedLuma(page, points, 2);
    expect(pixels.ok).toBe(true);
    return pixels.points;
}

test('Sun Bloom: occlusion mode respects alpha-cutout foliage transparency', async ({ page }) => {
    const getIssues = await attachFailFastConsole({ page });

    const commonQuery = [
        'ibl=0',
        'bloom=0',
        'grade=off',
        'aa=off',
        'ao=off',
        'shadows=off'
    ].join('&');

    const bloomQuery = [
        'sunBloom=1',
        'sunBloomStrength=1.8',
        'sunBloomRadius=0.82',
        'sunBloomThreshold=1.0',
        'sunBloomBrightnessOnly=1',
        'sunBloomDiscIntensity=90',
        'sunBloomDiscFalloff=2.2'
    ].join('&');

    const disabled = await renderScenarioAndSample(page, { query: `?${commonQuery}&sunBloom=0&sunBloomMode=selective` });
    const selective = await renderScenarioAndSample(page, { query: `?${commonQuery}&${bloomQuery}&sunBloomMode=selective` });
    const occlusion = await renderScenarioAndSample(page, { query: `?${commonQuery}&${bloomQuery}&sunBloomMode=occlusion` });

    const minBloomDelta = 0.02;
    expect(selective.buildingTransparent.luma).toBeGreaterThan(disabled.buildingTransparent.luma + minBloomDelta);
    expect(selective.skyTransparent.luma).toBeGreaterThan(disabled.skyTransparent.luma + minBloomDelta);

    const maxModeDelta = 0.02;
    expect(Math.abs(occlusion.buildingTransparent.luma - selective.buildingTransparent.luma)).toBeLessThan(maxModeDelta);
    expect(Math.abs(occlusion.skyTransparent.luma - selective.skyTransparent.luma)).toBeLessThan(maxModeDelta);

    expect(await getIssues()).toEqual([]);
});
