// Headless browser tests: BF2 bay linking (full spec) + inherited material placeholder.
import test, { expect } from '@playwright/test';

test.setTimeout(120_000);

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

async function getThumbBackgroundColor(locator) {
    return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

async function getBorderTopColor(locator) {
    return locator.evaluate((el) => getComputedStyle(el).borderTopColor);
}

async function getTextColor(locator) {
    return locator.evaluate((el) => getComputedStyle(el).color);
}

async function getDefaultMaterialThumbBackgroundColor(locator) {
    return locator.evaluate((el) => {
        const parent = el.parentElement ?? document.body;
        const probe = document.createElement('div');
        probe.className = 'building-fab-material-thumb';
        parent.appendChild(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
    });
}

async function setCurrentBayMaterialToColor({ page, floorLayer, colorLabel }) {
    const bayEditor = floorLayer.locator('.building-fab2-bay-editor');
    await bayEditor.locator('.building-fab2-bay-material-content .building-fab-material-button').click();
    const materialPanel = page.locator('.building-fab2-material-panel:not(.hidden)');
    await expect(materialPanel).toBeVisible();

    const baseSection = materialPanel.locator('.building-fab-details').first();
    await baseSection.locator('.building-fab-material-button').first().click();

    const pickerOverlay = page.locator('.ui-picker-overlay:not(.hidden)');
    await expect(pickerOverlay).toBeVisible();
    await pickerOverlay.locator('.ui-picker-tab').filter({ hasText: 'Color' }).click();
    await pickerOverlay.locator('.ui-picker-option').filter({ hasText: colorLabel }).click();

    await materialPanel.locator('button').filter({ hasText: 'Close' }).click();
    await expect(materialPanel).toBeHidden();
}

test('BF2: bay full linking + duplicate + inherited material placeholder', async ({ page }) => {
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

    const addBayBtn = floorLayer.locator('.building-fab2-bay-btn.is-add');
    await addBayBtn.click();
    await addBayBtn.click();

    const bayButtons = floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    await expect(bayButtons).toHaveCount(2);

    const bay1Btn = bayButtons.nth(0);
    const bay2Btn = bayButtons.nth(1);

    await bay1Btn.click();

    const bayEditor = floorLayer.locator('.building-fab2-bay-editor');
    const bayEditorMaterialText = bayEditor.locator('.building-fab2-bay-material-content .building-fab-material-text');
    const bayEditorMaterialThumb = bayEditor.locator('.building-fab2-bay-material-content .building-fab-material-thumb');
    const bayEditorLinkBtn = bayEditor.locator('button[aria-label="Link bay"]');
    const bayEditorClearOverrideBtn = bayEditor.locator('button[aria-label="Clear override"]');
    const duplicateBtn = bayEditor.locator('button').filter({ hasText: 'Duplicate' });
    await expect(bayEditorMaterialText).toHaveText('Inherited');
    const defaultThumbBg = await getDefaultMaterialThumbBackgroundColor(bayEditorMaterialThumb);
    await expect.poll(async () => getThumbBackgroundColor(bayEditorMaterialThumb), { timeout: 5_000 }).toBe(defaultThumbBg);
    await expect.poll(async () => getBorderTopColor(bayEditorLinkBtn), { timeout: 5_000 }).not.toBe('rgb(255, 216, 77)');
    await expect(bayEditorClearOverrideBtn).toHaveCount(0);

    await setCurrentBayMaterialToColor({ page, floorLayer, colorLabel: 'Orange' });
    await expect(bayEditorClearOverrideBtn).toBeVisible();
    await expect(bayEditor.locator('button').filter({ hasText: 'Clear override' })).toHaveCount(0);

    const bay1Thumb = bay1Btn.locator('.building-fab2-bay-btn-thumb');
    await expect.poll(async () => getThumbBackgroundColor(bay1Thumb), { timeout: 5_000 }).not.toBe('rgba(0, 0, 0, 0.2)');
    const bg1 = await getThumbBackgroundColor(bay1Thumb);

    await bay2Btn.click();
    await bayEditorLinkBtn.click();

    const pickerOverlay = page.locator('.ui-picker-overlay:not(.hidden)');
    await expect(pickerOverlay).toBeVisible();
    await pickerOverlay.locator('.ui-picker-option').filter({ hasText: 'Bay 1' }).click();

    await expect(bayEditor.locator('.building-fab2-bay-linked-overlay-label')).toContainText('Linked to Bay 1');
    await expect(bayEditor.locator('.building-fab2-bay-editor-body-content')).toHaveClass(/is-hidden/);
    await expect(duplicateBtn).toHaveCount(0);
    await expect.poll(async () => getBorderTopColor(bayEditorLinkBtn), { timeout: 5_000 }).toBe('rgb(255, 216, 77)');

    const bay2Label = bay2Btn.locator('.building-fab2-bay-btn-label');
    await expect(bay2Btn).toHaveClass(/is-linked/);
    await expect(bay2Label).toContainText('1');
    await expect(bay2Label.locator('.building-fab2-bay-label-icon')).toHaveText('link');
    await expect.poll(async () => getTextColor(bay2Label), { timeout: 5_000 }).toBe('rgba(255, 255, 255, 0.72)');
    await expect.poll(async () => getTextColor(bay2Label.locator('.building-fab2-bay-label-icon')), { timeout: 5_000 }).toBe('rgba(255, 255, 255, 0.72)');

    const bay2Thumb = bay2Btn.locator('.building-fab2-bay-btn-thumb');
    await expect.poll(async () => getThumbBackgroundColor(bay2Thumb), { timeout: 5_000 }).toBe(bg1);

    await bay1Btn.click();
    await expect.poll(async () => getBorderTopColor(bayEditorLinkBtn), { timeout: 5_000 }).not.toBe('rgb(255, 216, 77)');
    await expect(duplicateBtn).toBeVisible();
    await duplicateBtn.click();

    const bayButtonsAfterDup = floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    await expect(bayButtonsAfterDup).toHaveCount(3);
    await expect(floorLayer.locator('.building-fab2-bay-btn.is-active .building-fab2-bay-btn-label')).toHaveText('1');

    const bay3Btn = bayButtonsAfterDup.nth(2);
    const bay3Thumb = bay3Btn.locator('.building-fab2-bay-btn-thumb');
    await expect.poll(async () => getThumbBackgroundColor(bay3Thumb), { timeout: 5_000 }).toBe(bg1);

    const bay3Label = bay3Btn.locator('.building-fab2-bay-btn-label');
    await expect(bay3Btn).toHaveClass(/is-linked/);
    await expect(bay3Label).toContainText('1');
    await expect(bay3Label.locator('.building-fab2-bay-label-icon')).toHaveText('link');
    await expect.poll(async () => getTextColor(bay3Label), { timeout: 5_000 }).toBe('rgba(255, 255, 255, 0.72)');
    await expect.poll(async () => getTextColor(bay3Label.locator('.building-fab2-bay-label-icon')), { timeout: 5_000 }).toBe('rgba(255, 255, 255, 0.72)');

    await bay3Btn.click();
    await expect(bayEditor.locator('.building-fab2-bay-linked-overlay-label')).toContainText('Linked to Bay 1');
    await expect(bayEditor.locator('.building-fab2-bay-editor-body-content')).toHaveClass(/is-hidden/);
    await expect(duplicateBtn).toHaveCount(0);

    await bay1Btn.click();
    await setCurrentBayMaterialToColor({ page, floorLayer, colorLabel: 'Blue tint' });

    const bg1b = await getThumbBackgroundColor(bay1Thumb);
    const bg2b = await getThumbBackgroundColor(bay2Thumb);
    const bg3b = await getThumbBackgroundColor(bay3Thumb);
    expect(bg1b).toBe(bg2b);
    expect(bg1b).toBe(bg3b);
    expect(bg1b).not.toBe(bg1);

    await addBayBtn.click();
    const bayButtonsAfterAdd = floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    await expect(bayButtonsAfterAdd).toHaveCount(4);

    await bay1Btn.click();
    await bayEditorLinkBtn.click();
    await expect(pickerOverlay).toBeVisible();
    await pickerOverlay.locator('.ui-picker-option').filter({ hasText: 'Bay 4' }).click();

    await expect(bayEditor.locator('.building-fab2-bay-linked-overlay-label')).toContainText('Linked to Bay 4');
    await expect(duplicateBtn).toHaveCount(0);
    await expect.poll(async () => getBorderTopColor(bayEditorLinkBtn), { timeout: 5_000 }).toBe('rgb(255, 216, 77)');

    await bay2Btn.click();
    await expect(bayEditor.locator('.building-fab2-bay-linked-overlay-label')).toContainText('Linked to Bay 4');

    await bay3Btn.click();
    await expect(bayEditor.locator('.building-fab2-bay-linked-overlay-label')).toContainText('Linked to Bay 4');

    expect(await getErrors()).toEqual([]);
});
