// Headless browser tests: BF2 bay editor height should remain stable.
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

async function getHeightPx(locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) return null;
    return box.height;
}

test('BF2: bay config editor height is stable when adding first bay', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('9');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();

    const floorLayer = page.locator('.building-fab2-layer-group.is-floor').first();
    await expect(floorLayer).toBeVisible();

    await floorLayer.locator('.building-fab2-face-btn').filter({ hasText: 'A' }).click();

    const bayEditor = floorLayer.locator('.building-fab2-bay-editor');
    await expect(bayEditor).toBeVisible();

    const overlayLabel = bayEditor.locator('.building-fab2-bay-editor-overlay-label');
    await expect(overlayLabel).toContainText('Add a bay');

    const h1 = await getHeightPx(bayEditor);
    expect(h1).not.toBeNull();

    const addBayBtn = floorLayer.locator('.building-fab2-bay-btn.is-add');
    await addBayBtn.click();

    await expect(floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)')).toHaveCount(1);
    await expect(bayEditor.locator('.building-fab2-bay-editor-overlay')).toHaveClass(/hidden/);
    await expect(bayEditor.locator('.building-fab2-bay-editor-content')).not.toHaveClass(/is-hidden/);

    const h2 = await getHeightPx(bayEditor);
    expect(h2).not.toBeNull();
    expect(Math.abs(Math.round(h2) - Math.round(h1))).toBeLessThanOrEqual(1);

    expect(await getErrors()).toEqual([]);
});
