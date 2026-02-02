// Headless browser tests: BF2 bay selector cards layout + state icons.
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

test('BF2: bay selector placeholder, separate +Bay row, and state icons', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('9');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();

    const rightPanel = page.locator('.building-fab2-right-panel');
    await expect(rightPanel).toBeVisible();
    const rightBox = await rightPanel.boundingBox();
    expect(rightBox).not.toBeNull();
    expect(rightBox.width).toBeGreaterThanOrEqual(500);

    const floorLayer = page.locator('.building-fab2-layer-group.is-floor').first();
    await expect(floorLayer).toBeVisible();

    await floorLayer.locator('.building-fab2-face-btn').filter({ hasText: 'A' }).click();

    const bayCards = floorLayer.locator('.building-fab2-bay-selector-cards');
    const bayAddRow = floorLayer.locator('.building-fab2-bay-selector-add');

    const placeholder = bayCards.locator('.building-fab2-bay-btn.is-placeholder');
    await expect(placeholder).toHaveCount(1);
    await expect(placeholder).toBeDisabled();
    await expect(placeholder.locator('.building-fab2-bay-btn-label')).toHaveText('-');

    const addBtn = bayAddRow.locator('.building-fab2-bay-btn.is-add');
    await expect(addBtn).toHaveCount(1);
    await expect(bayCards.locator('.building-fab2-bay-btn.is-add')).toHaveCount(0);

    await addBtn.click();

    await expect(bayCards.locator('.building-fab2-bay-btn.is-placeholder')).toHaveCount(0);
    const bay1Btn = bayCards.locator('.building-fab2-bay-btn').first();
    await expect(bay1Btn).toBeVisible();
    await expect(bay1Btn.locator('.building-fab2-bay-btn-label')).toHaveText('1');

    const icons = bay1Btn.locator('.building-fab2-bay-btn-icons .ui-icon');
    await expect(icons).toHaveCount(1);
    await expect(icons.nth(0)).toHaveText('open_in_full');

    await floorLayer.locator('select.building-fab2-bay-expand-select').selectOption('prefer_repeat');
    await expect(icons).toHaveCount(2);
    await expect(icons.nth(1)).toHaveText('content_copy');

    await floorLayer.locator('button[aria-label="Fixed width"]').click();
    await expect(icons.nth(0)).toHaveText('radio_button_checked');

    for (let i = 0; i < 5; i++) await addBtn.click();

    const bayButtons = bayCards.locator('.building-fab2-bay-btn');
    await expect(bayButtons).toHaveCount(6);

    const rowTops = [];
    for (let i = 0; i < 4; i++) {
        const box = await bayButtons.nth(i).boundingBox();
        expect(box).not.toBeNull();
        rowTops.push(Math.round(box.y));
    }
    expect(new Set(rowTops).size).toBe(1);

    expect(await getErrors()).toEqual([]);
});
