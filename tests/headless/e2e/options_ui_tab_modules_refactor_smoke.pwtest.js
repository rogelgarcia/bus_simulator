// Headless browser tests: Options UI tab modularization keeps behavior unchanged.
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

async function goToGameplay(page) {
    await page.goto('/index.html?coreTests=0&debug=true');
    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#ui-select:not(.hidden)');
    await page.keyboard.press('G');
    await page.waitForSelector('#hud-game:not(.hidden)');
}

async function openOptions(page) {
    await page.keyboard.press('0');
    await page.waitForSelector('#ui-options');
}

async function clickTab(page, text) {
    const btn = page.locator('.options-tab', { hasText: text });
    await expect(btn).toHaveCount(1);
    await page.evaluate((tabText) => {
        const tabs = Array.from(document.querySelectorAll('.options-tab'));
        const target = tabs.find((el) => el.textContent?.trim().toLowerCase() === String(tabText).trim().toLowerCase());
        if (!target) throw new Error(`Missing tab: ${tabText}`);
        target.click();
    }, text);
}

function rowByLabel(page, label) {
    const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exact = new RegExp(`^${escaped}$`);
    return page.locator('.options-row', {
        has: page.locator('.options-row-label', { hasText: exact })
    });
}

async function setToggle(page, label, desired) {
    await page.evaluate(({ label, desired }) => {
        const rows = Array.from(document.querySelectorAll('.options-row'));
        const row = rows.find((el) => el.querySelector('.options-row-label')?.textContent?.trim() === label);
        const toggle = row?.querySelector('input[type="checkbox"]') ?? null;
        if (!toggle) throw new Error(`Missing toggle: ${label}`);
        const next = !!desired;
        if (toggle.checked === next) return;
        toggle.checked = next;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }, { label, desired: !!desired });
}

async function getToggle(page, label) {
    return page.evaluate((targetLabel) => {
        const rows = Array.from(document.querySelectorAll('.options-row'));
        const row = rows.find((el) => el.querySelector('.options-row-label')?.textContent?.trim() === targetLabel);
        const toggle = row?.querySelector('input[type="checkbox"]') ?? null;
        if (!toggle) throw new Error(`Missing toggle: ${targetLabel}`);
        return !!toggle.checked;
    }, label);
}

async function clickChoice(page, label, buttonText) {
    await page.evaluate(({ label, buttonText }) => {
        const rows = Array.from(document.querySelectorAll('.options-row'));
        const row = rows.find((el) => el.querySelector('.options-row-label')?.textContent?.trim() === label);
        if (!row) throw new Error(`Missing choice row: ${label}`);
        const btns = Array.from(row.querySelectorAll('button'));
        const btn = btns.find((el) => el.textContent?.trim().toLowerCase() === String(buttonText).trim().toLowerCase());
        if (!btn) throw new Error(`Missing choice button: ${buttonText} in row ${label}`);
        btn.click();
    }, { label, buttonText });
}

async function clickFooterButton(page, buttonText) {
    await page.evaluate((targetText) => {
        const buttons = Array.from(document.querySelectorAll('.options-footer .options-btn'));
        const btn = buttons.find((el) => el.textContent?.trim().toLowerCase() === String(targetText).trim().toLowerCase());
        if (!btn) throw new Error(`Missing footer button: ${targetText}`);
        btn.click();
    }, buttonText);
}

test('Gameplay: options tab modularization preserves tabs and save/cancel/reset flows', async ({ page }) => {
    test.setTimeout(240_000);
    const getErrors = await attachFailFastConsole({ page });
    await page.setViewportSize({ width: 1280, height: 720 });

    await goToGameplay(page);
    await openOptions(page);

    for (const tabText of ['Lighting', 'Graphics', 'Sun Bloom', 'Asphalt', 'Grass', 'Buildings', 'Debug']) {
        await expect(page.locator('.options-tab', { hasText: tabText })).toHaveCount(1);
    }

    await clickTab(page, 'Lighting');
    await expect(rowByLabel(page, 'IBL enabled')).toHaveCount(1);

    await clickTab(page, 'Graphics');
    await expect(rowByLabel(page, 'Active AA')).toHaveCount(1);

    await clickTab(page, 'Sun Bloom');
    await expect(rowByLabel(page, 'Disc radius (°)')).toHaveCount(1);

    await clickTab(page, 'Asphalt');
    await expect(rowByLabel(page, 'Coarse scale')).toHaveCount(1);

    await clickTab(page, 'Grass');
    await expect(rowByLabel(page, 'Sidewalk grass-edge dirt strip')).toHaveCount(1);

    await clickTab(page, 'Buildings');
    await expect(rowByLabel(page, 'Reflective building windows')).toHaveCount(1);

    await clickTab(page, 'Debug');
    await expect(rowByLabel(page, 'Enable vehicle motion debug')).toHaveCount(1);

    await clickTab(page, 'Graphics');
    await clickChoice(page, 'Mode', 'FXAA');
    await expect(rowByLabel(page, 'Active AA').locator('div').last()).toHaveText(/fxaa/i, { timeout: 10_000 });

    await clickTab(page, 'Buildings');
    await setToggle(page, 'Reflective building windows', false);
    const buildingReflectiveIntensity = rowByLabel(page, 'Window glass reflection intensity').locator('input[type="number"]');
    await expect(buildingReflectiveIntensity).toBeDisabled();
    await setToggle(page, 'Reflective building windows', true);
    await expect(buildingReflectiveIntensity).toBeEnabled();

    await clickTab(page, 'Lighting');
    const originalProbeVisibility = await getToggle(page, 'Show IBL probe sphere');

    await setToggle(page, 'Show IBL probe sphere', !originalProbeVisibility);
    await clickFooterButton(page, 'Cancel');
    await expect(page.locator('#ui-options')).toHaveCount(0);

    await openOptions(page);
    await clickTab(page, 'Lighting');
    expect(await getToggle(page, 'Show IBL probe sphere')).toBe(originalProbeVisibility);

    await setToggle(page, 'Show IBL probe sphere', !originalProbeVisibility);
    await clickFooterButton(page, 'Save');
    await expect(page.locator('#ui-options')).toHaveCount(0);

    await openOptions(page);
    await clickTab(page, 'Lighting');
    expect(await getToggle(page, 'Show IBL probe sphere')).toBe(!originalProbeVisibility);

    await setToggle(page, 'Show IBL probe sphere', true);
    expect(await getToggle(page, 'Show IBL probe sphere')).toBe(true);
    await clickFooterButton(page, 'Reset');
    expect(await getToggle(page, 'Show IBL probe sphere')).toBe(false);

    await clickFooterButton(page, 'Cancel');
    await expect(page.locator('#ui-options')).toHaveCount(0);
    expect(await getErrors()).toEqual([]);
});
