// Headless browser tests: BF2 bay depth edge offsets (left/right + link toggle).
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

function bayDepthNumberInput(bayEditor, label) {
    const row = bayEditor.locator('.building-fab-row').filter({ hasText: label });
    return row.locator('input.building-fab-number');
}

async function dragRangeToFraction(page, locator, fraction) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    const y = (box?.y ?? 0) + (box?.height ?? 0) * 0.5;
    const fromX = (box?.x ?? 0) + (box?.width ?? 0) * 0.2;
    const toX = (box?.x ?? 0) + (box?.width ?? 0) * fraction;
    await page.mouse.move(fromX, y);
    await page.mouse.down();
    await page.mouse.move(toX, y, { steps: 12 });
    await page.mouse.up();
}

test('BF2: bay depth edge offsets link/unlink behavior', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('4');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();

    const floorLayer = page.locator('.building-fab2-layer-group.is-floor').first();
    await expect(floorLayer).toBeVisible();
    await floorLayer.locator('.building-fab2-face-btn').filter({ hasText: 'A' }).click();

    const addBayBtn = floorLayer.locator('.building-fab2-bay-btn.is-add');
    await addBayBtn.click();

    const bayButtons = floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    await expect(bayButtons).toHaveCount(1);
    await bayButtons.first().click();

    const bayEditor = floorLayer.locator('.building-fab2-bay-editor');
    await expect(bayEditor).toBeVisible();

    const leftDepthNumber = bayDepthNumberInput(bayEditor, 'Left edge depth');
    const rightDepthNumber = bayDepthNumberInput(bayEditor, 'Right edge depth');
    await expect(leftDepthNumber).toHaveValue('0');
    await expect(rightDepthNumber).toHaveValue('0');

    const unlinkBtn = bayEditor.locator('button[aria-label="Unlink depth edges"]');
    await expect(unlinkBtn).toBeVisible();
    await unlinkBtn.click();
    const linkBtn = bayEditor.locator('button[aria-label="Link depth edges"]');
    await expect(linkBtn).toBeVisible();

    await leftDepthNumber.fill('1');
    await expect(leftDepthNumber).toHaveValue('1');
    await expect(rightDepthNumber).toHaveValue('0');

    await linkBtn.click();
    await expect(bayEditor.locator('button[aria-label="Unlink depth edges"]')).toBeVisible();
    await expect(rightDepthNumber).toHaveValue('1');

    await rightDepthNumber.fill('0.5');
    await expect(leftDepthNumber).toHaveValue('0.5');
    await expect(rightDepthNumber).toHaveValue('0.5');

    await addBayBtn.click();
    const bayButtonsAfterAdd = floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    await expect(bayButtonsAfterAdd).toHaveCount(2);
    const bay2Btn = bayButtonsAfterAdd.nth(1);
    await bay2Btn.click();

    await bayEditor.locator('button[aria-label="Link bay"]').click();
    const pickerOverlay = page.locator('.ui-picker-overlay:not(.hidden)');
    await expect(pickerOverlay).toBeVisible();
    await pickerOverlay.locator('.ui-picker-option').filter({ hasText: 'Bay 1' }).click();

    await expect(bayEditor.locator('.building-fab2-bay-linked-overlay-label')).toContainText('Linked to Bay 1');
    await expect(bayEditor.locator('.building-fab2-bay-editor-body-content')).toHaveClass(/is-hidden/);

    expect(await getErrors()).toEqual([]);
});

test('BF2: bay depth edge range slider can drag continuously', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('4');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();

    const floorLayer = page.locator('.building-fab2-layer-group.is-floor').first();
    await expect(floorLayer).toBeVisible();
    await floorLayer.locator('.building-fab2-face-btn').filter({ hasText: 'A' }).click();

    const addBayBtn = floorLayer.locator('.building-fab2-bay-btn.is-add');
    await addBayBtn.click();

    const bayButtons = floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    await expect(bayButtons).toHaveCount(1);
    await bayButtons.first().click();

    const bayEditor = floorLayer.locator('.building-fab2-bay-editor');
    await expect(bayEditor).toBeVisible();

    const leftRange = bayEditor.locator('input[type="range"][aria-label="Left edge depth (m)"]');
    await expect(leftRange).toBeVisible();

    const leftNumber = bayDepthNumberInput(bayEditor, 'Left edge depth');
    await expect(leftNumber).toHaveValue('0');

    await dragRangeToFraction(page, leftRange, 0.9);

    await expect.poll(async () => Number.parseFloat(await leftNumber.inputValue()), { timeout: 2000 })
        .toBeGreaterThan(0.2);

    expect(await getErrors()).toEqual([]);
});
