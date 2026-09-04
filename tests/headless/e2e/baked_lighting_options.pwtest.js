// Headless browser tests: baked-shadow Options intent remains transactional and fail-safe.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test, { expect } from '@playwright/test';

const SCREENSHOT_DIR = path.resolve('tests/artifacts/screens/illumination_535');

async function goToGameplay(page) {
    await page.goto('/?pose=civic_center_curve_front&coreTests=0&ibl=0&bloom=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 60_000 });
    await page.waitForSelector('#hud-game:not(.hidden)');
    await page.evaluate(() => window.__busSim.engine.stop());
}

async function openOptions(page) {
    await page.keyboard.press('0');
    await page.waitForSelector('#ui-options');
}

async function clickTab(page, text) {
    const tab = page.locator('.options-tab', { hasText: new RegExp(`^${text}$`, 'i') });
    await expect(tab).toHaveCount(1);
    await page.evaluate((tabText) => {
        const tabs = Array.from(document.querySelectorAll('.options-tab'));
        const target = tabs.find((element) => element.textContent?.trim().toLowerCase() === tabText.toLowerCase());
        if (!(target instanceof HTMLButtonElement)) throw new Error(`Missing tab: ${tabText}`);
        target.click();
    }, text);
}

async function setBakedShadows(page, enabled) {
    await page.evaluate((desired) => {
        const rows = Array.from(document.querySelectorAll('.options-row'));
        const row = rows.find((element) => element.textContent?.includes('Enable baked shadows'));
        const toggle = row?.querySelector('input[type="checkbox"]');
        if (!(toggle instanceof HTMLInputElement)) throw new Error('Missing baked-shadow toggle.');
        if (toggle.checked === desired) return;
        toggle.checked = desired;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }, enabled);
}

async function setMovingShadowResolution(page, resolution) {
    await page.evaluate((desired) => {
        const rows = Array.from(document.querySelectorAll('.options-row'));
        const row = rows.find((element) => element.textContent?.includes('Moving-object shadow resolution'));
        const button = Array.from(row?.querySelectorAll('button') ?? [])
            .find((element) => element.textContent?.trim().toLowerCase() === desired.toLowerCase());
        if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing moving-shadow resolution: ${desired}`);
        button.click();
    }, resolution);
}

async function getMovingShadowResolution(page) {
    return page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.options-row'));
        const row = rows.find((element) => element.textContent?.includes('Moving-object shadow resolution'));
        return row?.querySelector('button.is-active')?.textContent?.trim() ?? null;
    });
}

async function clickFooter(page, text) {
    await page.evaluate((buttonText) => {
        const buttons = Array.from(document.querySelectorAll('.options-footer .options-btn'));
        const target = buttons.find((element) => element.textContent?.trim().toLowerCase() === buttonText.toLowerCase());
        if (!(target instanceof HTMLButtonElement)) throw new Error(`Missing footer button: ${buttonText}`);
        target.click();
    }, text);
}

async function getLegacyShadowSummary(page) {
    return page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll('.options-section'));
        const section = sections.find((element) => (
            element.querySelector('.options-section-title')?.textContent?.trim() === 'Shadows (legacy)'
        ));
        const buttons = Array.from(section?.querySelectorAll('button') ?? []);
        return {
            count: buttons.length,
            allDisabled: buttons.every((button) => button.disabled),
            allEnabled: buttons.every((button) => !button.disabled),
            selected: buttons.filter((button) => button.classList.contains('is-active')).map((button) => button.textContent?.trim())
        };
    });
}

test('Gameplay: baked shadows have a safe fallback and preserve legacy shadow settings', async ({ page }) => {
    test.setTimeout(120_000);
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    await page.route('**/static_sun_depth.ilpkg', (route) => route.fulfill({ status: 404, body: 'intentionally unavailable' }));
    await page.setViewportSize({ width: 1280, height: 720 });
    await goToGameplay(page);
    await openOptions(page);

    await clickTab(page, 'Baked lighting');
    await expect(page.locator('.options-body')).toContainText('precomputed map lighting');
    await expect(page.locator('.options-body')).toContainText('should improve performance');
    await expect(page.locator('.options-body')).toContainText('Direct and indirect baked-light controls will be added here later.');
    expect(await getMovingShadowResolution(page)).toBe('Medium');
    await setBakedShadows(page, true);
    await setMovingShadowResolution(page, 'High');
    expect(await page.evaluate(() => window.__busSim.engine.bakedLightingSettings.shadows.dynamicResolution)).toBe('high');
    await expect(page.locator('.options-row', { hasText: 'Map / sun profile' })).toContainText('ai527.sun.az045.el35');
    await expect(page.locator('.options-row', { hasText: 'Active path' })).toContainText('Legacy shadows');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'baked-lighting-safe-fallback.png') });

    await clickTab(page, 'Graphics');
    const disabledSummary = await getLegacyShadowSummary(page);
    expect(disabledSummary.count).toBeGreaterThan(0);
    expect(disabledSummary.allDisabled).toBe(true);
    const selectedBeforeCancel = disabledSummary.selected;
    await page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll('.options-section'));
        const section = sections.find((element) => (
            element.querySelector('.options-section-title')?.textContent?.trim() === 'Shadows (legacy)'
        ));
        section?.scrollIntoView({ block: 'center' });
    });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'legacy-shadow-controls-disabled.png') });

    await clickFooter(page, 'Cancel');
    await openOptions(page);
    await clickTab(page, 'Baked lighting');
    await expect(page.locator('.options-row', { hasText: 'Enable baked shadows' }).locator('input')).not.toBeChecked();
    expect(await getMovingShadowResolution(page)).toBe('Medium');
    await clickTab(page, 'Graphics');
    const restoredSummary = await getLegacyShadowSummary(page);
    expect(restoredSummary.allEnabled).toBe(true);
    expect(restoredSummary.selected).toEqual(selectedBeforeCancel);

    await clickTab(page, 'Baked lighting');
    await setBakedShadows(page, true);
    await setMovingShadowResolution(page, 'High');
    await clickFooter(page, 'Save');
    await openOptions(page);
    await clickTab(page, 'Baked lighting');
    await expect(page.locator('.options-row', { hasText: 'Enable baked shadows' }).locator('input')).toBeChecked();
    expect(await getMovingShadowResolution(page)).toBe('High');

    await clickFooter(page, 'Reset');
    await expect(page.locator('.options-row', { hasText: 'Enable baked shadows' }).locator('input')).not.toBeChecked();
    expect(await getMovingShadowResolution(page)).toBe('Medium');
    await clickFooter(page, 'Cancel');
});
