// Headless browser tests: BF2 bay selector group connector lines.
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

test('BF2: bay selector shows reserved connector strip and renders group brackets', async ({ page }) => {
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

    const bayCards = floorLayer.locator('.building-fab2-bay-selector-cards');
    const slots = bayCards.locator('.building-fab2-bay-slot');
    await expect(slots).toHaveCount(1);

    const placeholder = bayCards.locator('.building-fab2-bay-btn.is-placeholder');
    await expect(placeholder).toHaveCount(1);

    const reservedStrip = slots.nth(0).locator('.building-fab2-bay-group-strip');
    await expect(reservedStrip).toHaveCount(1);
    expect(await getHeightPx(reservedStrip)).toBeGreaterThan(0);

    await expect(bayCards.locator('.building-fab2-bay-group-conn')).toHaveCount(0);

    const addBtn = floorLayer.locator('.building-fab2-bay-btn.is-add');
    await addBtn.click();
    await addBtn.click();

    await expect(bayCards.locator('.building-fab2-bay-btn.is-placeholder')).toHaveCount(0);
    await expect(bayCards.locator('.building-fab2-bay-slot')).toHaveCount(2);
    await expect(bayCards.locator('.building-fab2-bay-group-conn')).toHaveCount(0);

    const bayAddRow = floorLayer.locator('.building-fab2-bay-selector-add');
    await bayAddRow.locator('.building-fab2-bay-btn.is-grouping').click();

    const overlay = page.locator('.building-fab2-group-overlay');
    await expect(overlay).toBeVisible();
    await overlay.locator('button[data-action="group:startCreate"]').click();

    const groupBays = overlay.locator('.building-fab2-group-bay-list .building-fab2-group-bay');
    await expect(groupBays).toHaveCount(2);
    await groupBays.nth(0).click();
    await groupBays.nth(1).click();
    await overlay.locator('button[data-action="group:doneCreate"]').click();
    await overlay.locator('.building-fab2-group-header .building-fab2-btn').click();

    const slot1 = bayCards.locator('.building-fab2-bay-slot').nth(0);
    const slot2 = bayCards.locator('.building-fab2-bay-slot').nth(1);
    const seg1 = slot1.locator('.building-fab2-bay-group-strip .building-fab2-bay-group-conn');
    const seg2 = slot2.locator('.building-fab2-bay-group-strip .building-fab2-bay-group-conn');

    await expect(seg1).toHaveCount(1);
    await expect(seg2).toHaveCount(1);
    await expect(seg1).toHaveClass(/is-start/);
    await expect(seg1).not.toHaveClass(/is-end/);
    await expect(seg2).toHaveClass(/is-end/);
    await expect(seg2).not.toHaveClass(/is-start/);

    expect(await getErrors()).toEqual([]);
});

