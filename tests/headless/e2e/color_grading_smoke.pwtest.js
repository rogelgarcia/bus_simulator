// Headless browser tests: LUT color grading should not break harness boot.
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

test('Harness: LUT color grading warm preset loads without crashing', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0&grade=warm&gradeIntensity=1');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);

    await page.evaluate(async () => {
        window.__testHooks.setViewport(960, 540);
        await window.__testHooks.loadScenario('city_straight_road', { seed: 'grade-smoke' });
        window.__testHooks.step(20, { render: true });
    });

    await page.waitForFunction(() => {
        const info = window.__testHooks.getColorGradingDebugInfo?.();
        return info && info.requestedPreset === 'warm';
    });

    const info = await page.evaluate(() => window.__testHooks.getColorGradingDebugInfo?.() ?? null);
    expect(info).not.toBeNull();
    expect(info.requestedPreset).toBe('warm');
    expect(info.intensity).toBe(1);

    if (info.supported) {
        await page.waitForFunction(() => window.__testHooks.getColorGradingDebugInfo?.().status === 'ready', null, { timeout: 5000 });
        const ready = await page.evaluate(() => window.__testHooks.getColorGradingDebugInfo?.() ?? null);
        expect(ready.hasLut).toBe(true);
        expect(ready.enabled).toBe(true);
    } else {
        expect(info.enabled).toBe(false);
    }

    expect(await getErrors()).toEqual([]);
});

