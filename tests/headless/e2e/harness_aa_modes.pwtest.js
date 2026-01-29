// Headless browser tests: AA mode selection + pipeline behavior.
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

test('Harness: AA mode selection toggles pipeline (TAA)', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0&sunBloom=0&grade=off');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);

    await page.evaluate(() => window.__testHooks.setAntiAliasingSettings({ mode: 'off' }));
    const offInfo = await page.evaluate(() => window.__testHooks.getAntiAliasingDebugInfo());
    expect(offInfo.pipelineActive).toBe(false);

    await page.evaluate(() => window.__testHooks.setAntiAliasingSettings({ mode: 'taa' }));
    await page.evaluate(() => window.__testHooks.step(4, { render: true }));
    const taaInfo = await page.evaluate(() => window.__testHooks.getAntiAliasingDebugInfo());
    expect(taaInfo.pipelineActive).toBe(true);
    expect(taaInfo.activeMode).toBe('taa');

    expect(await getErrors()).toEqual([]);
});

