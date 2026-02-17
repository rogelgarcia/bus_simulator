// Headless browser tests: BF2 view panel toggles.
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

test('BF2: view panel toggles are switches + Show dummy affects tris', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('4');

    await page.waitForSelector('#building-fab2-hud');

    await expect(page.locator('button:has-text("Hide face mark in view")')).toHaveCount(0);
    const hideFaceToggle = page.locator('input[aria-label="Hide face mark in view"]');
    const showDummyToggle = page.locator('input[aria-label="Show dummy"]');
    await expect(hideFaceToggle).toHaveAttribute('type', 'checkbox');
    await expect(showDummyToggle).toHaveAttribute('type', 'checkbox');

    await expect(hideFaceToggle).not.toBeChecked();
    await expect(showDummyToggle).not.toBeChecked();
    await expect(showDummyToggle).toBeDisabled();

    await page.locator('.building-fab2-create-btn').click();
    await page.waitForSelector('.building-fab2-layer-group.is-floor');
    await expect(showDummyToggle).toBeEnabled();

    const perfRender = page.locator('.ui-perf-bar-render');
    await expect.poll(async () => parseTrisFromPerfText(await perfRender.innerText()), { timeout: 10_000 }).not.toBeNull();

    const baseline = parseTrisFromPerfText(await perfRender.innerText());
    expect(baseline).not.toBeNull();
    const baselineTris = baseline ?? 0;

    await showDummyToggle.check();
    await expect.poll(async () => parseTrisFromPerfText(await perfRender.innerText()) ?? -1, { timeout: 5_000 })
        .toBeGreaterThan(baselineTris);
    const withDummyTris = parseTrisFromPerfText(await perfRender.innerText()) ?? baselineTris;

    await showDummyToggle.uncheck();
    await expect.poll(async () => parseTrisFromPerfText(await perfRender.innerText()) ?? -1, { timeout: 5_000 })
        .toBeLessThan(withDummyTris);

    expect(await getErrors()).toEqual([]);
});
