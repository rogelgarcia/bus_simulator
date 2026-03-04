// Headless browser tests: Three.js upgrade smoke for key entry points.
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
            'ResizeObserver loop limit exceeded',
            'Failed to load resource: the server responded with a status of 500 (Internal Server Error)'
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

test('Three upgrade: main app boots without import/runtime errors', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');
    await page.waitForSelector('#ui-welcome:not(.hidden)');
    expect(await getErrors()).toEqual([]);
});

test('Three upgrade: mesh fabrication screen boots without import/runtime errors', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/screens/mesh_fabrication.html');
    await page.waitForSelector('.mesh-fab-root');
    expect(await getErrors()).toEqual([]);
});

test('Three upgrade: harness boots without import/runtime errors', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);
    expect(await getErrors()).toEqual([]);
});
