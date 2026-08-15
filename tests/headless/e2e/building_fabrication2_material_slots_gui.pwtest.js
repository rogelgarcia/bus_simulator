// BF2 GUI regression (AI 491): boots the editor, creates a building and
// verifies the material infrastructure controls render and respond — the
// building-level Material slots editor (with brick preset + tint jitter),
// the per-layer Wall preset picker and the Banding controls.
import { test, expect } from '@playwright/test';

test('BF2: material slots editor, brick preset picker and banding controls render', async ({ page }) => {
    test.setTimeout(180_000);
    const consoleErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0', { waitUntil: 'domcontentloaded' });

    // Wait for the app state machine before sending keys (welcome HTML is
    // static and visible long before boot).
    await page.waitForFunction(() => !!window.__busSim?.sm?.current, null, { timeout: 60_000 });
    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)', { timeout: 30_000 });
    await page.keyboard.press('4');
    await page.waitForSelector('#building-fab2-hud', { timeout: 30_000 });
    await page.locator('.building-fab2-create-btn').click();

    // Building-level sections exist and are distinct from floor layers.
    const slotsHeader = page.locator('.building-fab2-layer-group.is-building .building-fab2-layer-title', { hasText: 'Material slots' });
    await expect(slotsHeader).toBeVisible();
    const cornersHeader = page.locator('.building-fab2-layer-group.is-building .building-fab2-layer-title', { hasText: 'Corners' });
    await expect(cornersHeader).toBeVisible();

    // Open the slots section; assign a brick preset to wallPrimary.
    await slotsHeader.click();
    const slotsGroup = page.locator('.building-fab2-layer-group.is-building').filter({ hasText: 'Material slots' });
    const wallPrimaryRow = slotsGroup.locator('.building-fab2-layer-row').filter({ hasText: 'wallPrimary' });
    await expect(wallPrimaryRow).toBeVisible();
    await wallPrimaryRow.locator('select').selectOption('preset:brick.red_standard');

    // The jitter toggle appears for preset slots after re-render.
    await expect(slotsGroup.locator('.building-fab-row', { hasText: 'Tint jitter' })).toBeVisible();

    // Open the first real floor layer: Wall preset + Banding controls exist.
    const floorLayer = page.locator('.building-fab2-layer-group.is-floor').first();
    await expect(floorLayer).toBeVisible();
    const floorBody = floorLayer.locator('.building-fab2-layer-body').first();
    if (await floorBody.evaluate((el) => el.classList.contains('hidden'))) {
        await floorLayer.locator('.building-fab2-layer-summary').first().click();
    }
    await expect(floorLayer.locator('.building-fab2-subtitle', { hasText: 'Wall preset' })).toBeVisible();
    await expect(floorLayer.locator('.building-fab2-subtitle', { hasText: 'Banding' })).toBeVisible();

    // Enable banding and confirm its controls render.
    const bandingRow = floorLayer.locator('.building-fab-row', { hasText: 'Banding' }).first();
    await bandingRow.locator('button', { hasText: 'On' }).click();
    await expect(floorLayer.locator('.building-fab2-layer-row', { hasText: 'Band material' })).toBeVisible();

    const relevantErrors = consoleErrors.filter((e) => !e.includes('favicon'));
    expect(relevantErrors, `console errors: ${relevantErrors.join(' || ')}`).toEqual([]);
});
