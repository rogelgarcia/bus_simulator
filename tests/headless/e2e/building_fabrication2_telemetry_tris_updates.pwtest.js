// Headless browser tests: BF2 telemetry updates.
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

function parseFormattedCount(raw) {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s || s === 'N/A' || s === '--') return null;
    const num = Number.parseFloat(s);
    if (!Number.isFinite(num)) return null;
    const lower = s.toLowerCase();
    if (lower.endsWith('m')) return num * 1_000_000;
    if (lower.endsWith('k')) return num * 1_000;
    return num;
}

function parseTrisFromPerfText(text) {
    const s = typeof text === 'string' ? text : '';
    const m = s.match(/\bTris:\s*([^·]+)/);
    if (!m) return null;
    return parseFormattedCount(m[1]);
}

test('BF2: telemetry tris updates after rebuild', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('4');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();
    await page.waitForSelector('.building-fab2-layer-group.is-floor');

    const perfRender = page.locator('.ui-perf-bar-render');
    await expect.poll(async () => {
        const text = await perfRender.innerText();
        return parseTrisFromPerfText(text);
    }, { timeout: 10_000 }).not.toBeNull();
    const tris1 = parseTrisFromPerfText(await perfRender.innerText());
    expect(tris1).not.toBeNull();

    const floorsNumber = page.locator('.building-fab2-layer-group.is-floor').first()
        .locator('.building-fab2-layer-row').first()
        .locator('input.building-fab2-layer-number');
    await floorsNumber.fill('30');

    await expect.poll(async () => {
        const text = await perfRender.innerText();
        return parseTrisFromPerfText(text);
    }, { timeout: 5_000 }).not.toBe(tris1);

    expect(await getErrors()).toEqual([]);
});
