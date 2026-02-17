// Headless browser tests: Lab Scene tool should load with camera presets + layers controls.
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
        const allow = ['ResizeObserver loop limit exceeded'];
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

async function waitFrames(page, count = 4) {
    await page.evaluate(async (n) => {
        const frames = Math.max(1, Number(n) || 1);
        for (let i = 0; i < frames; i++) await new Promise(requestAnimationFrame);
    }, count);
}

test('Lab Scene: standalone tool loads with presets and layers panel', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.setViewportSize({ width: 1200, height: 700 });

    await page.goto('/debug_tools/lab_scene.html');

    await page.waitForSelector('.lab-scene-controls');
    await page.waitForSelector('.lab-scene-preset-btn');
    await expect(page.locator('.lab-scene-preset-btn')).toHaveCount(8);
    await page.waitForSelector('.lab-scene-control-select');

    await page.click('.lab-scene-preset-btn[data-preset-id="crossing_bus_right_wide"]');
    await waitFrames(page, 8);

    expect(await getErrors()).toEqual([]);
});
