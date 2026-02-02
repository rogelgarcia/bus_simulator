// Headless browser tests: BF2 grouping panel for repeat groups.
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

test('BF2: grouping panel creates and removes repeat groups', async ({ page }) => {
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

    const bayAddRow = floorLayer.locator('.building-fab2-bay-selector-add');
    const addBtn = bayAddRow.locator('.building-fab2-bay-btn.is-add');
    const groupingBtn = bayAddRow.locator('.building-fab2-bay-btn.is-grouping');
    await expect(addBtn).toHaveCount(1);
    await expect(groupingBtn).toHaveCount(1);

    await addBtn.click();
    await addBtn.click();
    await addBtn.click();

    await groupingBtn.click();
    const overlay = page.locator('.building-fab2-group-overlay');
    await expect(overlay).toBeVisible();

    const bayList = overlay.locator('.building-fab2-group-bay-list .building-fab2-group-bay');
    await expect(bayList).toHaveCount(3);
    await expect(bayList.nth(0)).toHaveText('1');
    await expect(bayList.nth(1)).toHaveText('2');
    await expect(bayList.nth(2)).toHaveText('3');

    await overlay.locator('button[data-action="group:startCreate"]').click();
    await expect(overlay.locator('button[data-action="group:doneCreate"]')).toBeDisabled();

    await bayList.nth(0).click();
    await expect(overlay.locator('button[data-action="group:doneCreate"]')).toBeDisabled();
    await bayList.nth(1).click();
    await overlay.locator('button[data-action="group:doneCreate"]').click();

    const groupRows = overlay.locator('.building-fab2-group-row');
    await expect(groupRows).toHaveCount(1);

    await overlay.locator('button[data-action="group:startCreate"]').click();
    await expect(bayList.nth(0)).toBeDisabled();
    await expect(bayList.nth(1)).toBeDisabled();
    await bayList.nth(2).click();
    await expect(overlay.locator('button[data-action="group:doneCreate"]')).toBeDisabled();
    await overlay.locator('button[data-action="group:cancelCreate"]').click();

    await overlay.locator('button[data-action="group:remove"]').click();
    await expect(groupRows).toHaveCount(0);
    await expect(overlay.locator('.building-fab2-group-list .building-fab2-hint')).toHaveText('No groups yet.');

    await overlay.locator('.building-fab2-group-header .building-fab2-btn').click();
    await expect(overlay).toHaveClass(/hidden/);

    expect(await getErrors()).toEqual([]);
});
