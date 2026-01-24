// Headless browser tests: deterministic harness smoke.
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

test('Harness: boots and exposes __testHooks', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);
    const scenarios = await page.evaluate(() => window.__testHooks.listScenarios());
    expect(scenarios).toContain('empty');
    expect(await getErrors()).toEqual([]);
});

test('Harness: loads scenarios deterministically', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks);

    const run = async (seed) => page.evaluate(async (s) => {
        await window.__testHooks.loadScenario('city_crossing', { seed: s });
        window.__testHooks.step(30, { render: true });
        return window.__testHooks.getMetrics();
    }, seed);

    const a = await run('det-seed');
    const b = await run('det-seed');
    expect(a.scenarioId).toBe('city_crossing');
    expect(b.scenarioId).toBe('city_crossing');
    expect(a.scenario).toEqual(b.scenario);
    expect(await getErrors()).toEqual([]);
});
