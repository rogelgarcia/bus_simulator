// Headless browser tests: BF2 bay master/slave linking + selector presentation.
import test, { expect } from '@playwright/test';

test.setTimeout(240_000);

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

async function getBorderTopColor(locator) {
    return locator.evaluate((el) => getComputedStyle(el).borderTopColor);
}

async function getCssVariable(locator, name) {
    return locator.evaluate((el, cssVarName) => getComputedStyle(el).getPropertyValue(cssVarName).trim(), name);
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

test('BF2: master-driven bay linking supports many slaves + slim slave cards + relink redirect', async ({ page }) => {
    await attachFailFastConsole({ page });
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
    await addBayBtn.click();

    let bayButtons = floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    await expect(bayButtons).toHaveCount(2);

    const bayEditor = floorLayer.locator('.building-fab2-bay-editor');
    const bayEditorLinkBtn = bayEditor.locator('button[aria-label="Link bay"]');
    const duplicateBtn = bayEditor.locator('button').filter({ hasText: 'Duplicate' });
    const linkOverlay = page.locator('.building-fab2-link-overlay:not(.hidden)');
    const linkPanel = linkOverlay.locator('.building-fab2-link-panel');

    let bay1Btn = bayButtons.nth(0);
    let bay2Btn = bayButtons.nth(1);

    await bay1Btn.click();
    await setCurrentBayMaterialToColor({ page, floorLayer, colorLabel: 'Orange' });

    await bayEditorLinkBtn.evaluate((el) => el.click());
    await expect(linkOverlay).toBeVisible();
    await expect(linkPanel.locator('.ui-title')).toContainText('Link bays (master: Bay 1)');
    await page.evaluate(() => {
        const btn = document.querySelector('.building-fab2-link-bay-btn[data-target-bay-id="bay_2"]');
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect(linkPanel.locator('.building-fab2-link-bay-btn[data-target-bay-id="bay_2"]')).toHaveClass(/is-active/);
    await linkPanel.locator('button').filter({ hasText: 'Close' }).click();
    await expect(linkOverlay).toBeHidden();

    // Duplicate from master produces another slave, giving one-master/many-slaves coverage.
    await bay1Btn.click();
    await expect(duplicateBtn).toBeVisible();
    await duplicateBtn.click();
    bayButtons = floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    await expect(bayButtons).toHaveCount(3);
    bay1Btn = bayButtons.nth(0);
    bay2Btn = bayButtons.nth(1);
    const bay3Btn = bayButtons.nth(2);

    await expect(bay1Btn).toHaveClass(/is-link-master/);
    await expect(bay2Btn).toHaveClass(/is-linked/);
    await expect(bay2Btn).toHaveClass(/is-slave-preview/);
    await expect(bay2Btn).toHaveClass(/is-link-slave/);
    await expect(bay3Btn).toHaveClass(/is-linked/);
    await expect(bay3Btn).toHaveClass(/is-slave-preview/);
    await expect(bay3Btn).toHaveClass(/is-link-slave/);

    const bay1Hue = await getCssVariable(bay1Btn, '--building-fab2-bay-link-hue');
    const bay2Hue = await getCssVariable(bay2Btn, '--building-fab2-bay-link-hue');
    expect(bay1Hue).toBeTruthy();
    expect(bay1Hue).toBe(bay2Hue);

    await bay2Btn.click();
    await expect(bayEditor.locator('.building-fab2-bay-linked-overlay-label')).toContainText('Linked to Bay 1');
    await expect(bayEditor.locator('.building-fab2-bay-editor-body-content')).toHaveClass(/is-hidden/);
    await expect(duplicateBtn).toHaveCount(0);
    await expect.poll(async () => getBorderTopColor(bayEditorLinkBtn), { timeout: 5_000 }).toBe('rgb(255, 216, 77)');

    await addBayBtn.click();
    bayButtons = floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    await expect(bayButtons).toHaveCount(4);
    const bay4Btn = bayButtons.nth(3);

    await bay4Btn.click();
    await bayEditorLinkBtn.evaluate((el) => el.click());
    await expect(linkOverlay).toBeVisible();
    await expect(linkPanel.locator('.ui-title')).toContainText('Link bays (master: Bay 4)');
    await page.evaluate(() => {
        const btn = document.querySelector('.building-fab2-link-bay-btn[data-target-bay-id="bay_1"]');
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect(linkPanel.locator('.building-fab2-link-bay-btn[data-target-bay-id="bay_1"]')).toHaveClass(/is-active/);
    await linkPanel.locator('button').filter({ hasText: 'Close' }).click();
    await expect(linkOverlay).toBeHidden();

    const bayButtonsAfterRelink = floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    const bay1AfterRelink = bayButtonsAfterRelink.nth(0);
    const bay2AfterRelink = bayButtonsAfterRelink.nth(1);
    const bay3AfterRelink = bayButtonsAfterRelink.nth(2);
    const bay4AfterRelink = bayButtonsAfterRelink.nth(3);

    await bay1AfterRelink.click();
    await expect(bayEditor.locator('.building-fab2-bay-linked-overlay-label')).toContainText('Linked to Bay 4');
    await bay2AfterRelink.click();
    await expect(bayEditor.locator('.building-fab2-bay-linked-overlay-label')).toContainText('Linked to Bay 4');
    await bay3AfterRelink.click();
    await expect(bayEditor.locator('.building-fab2-bay-linked-overlay-label')).toContainText('Linked to Bay 4');

    await bay4AfterRelink.click();
    await expect(bayEditor.locator('.building-fab2-bay-linked-overlay')).toHaveClass(/hidden/);
    await expect.poll(async () => getBorderTopColor(bayEditorLinkBtn), { timeout: 5_000 }).not.toBe('rgb(255, 216, 77)');
    await expect(duplicateBtn).toBeVisible();

});
