// BF2 GUI regression (AI 494): the decoration Configuration tab exposes the
// "Follow recesses" toggle for `inheritOnDerivedSurfaces`, and toggling it
// writes through to the exported config.
import { test, expect } from '@playwright/test';

test('BF2: decoration Follow recesses toggle round-trips inheritOnDerivedSurfaces', async ({ page }) => {
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

    await page.locator('.building-fab2-editor-mode[data-mode="decoration"]').click();
    await page.locator('.building-fab2-decoration-header button', { hasText: '+ Decoration Set' }).click();
    await page.locator('.building-fab2-decoration-set button', { hasText: '+ Decoration' }).first().click();

    const entry = page.locator('.building-fab2-decoration-entry').first();
    await entry.locator('.building-fab2-decoration-tab', { hasText: 'Configuration' }).click();
    const followRow = entry.locator('.building-fab2-row').filter({ hasText: 'Follow recesses' });
    await expect(followRow).toBeVisible();

    const readFlag = () => page.evaluate(() => {
        const sets = window.__busSim?.sm?.current?.view?._currentConfig?.wallDecorations?.sets ?? [];
        return sets[0]?.decorations?.[0]?.inheritOnDerivedSurfaces ?? null;
    });

    // Defaults to on, matching BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC §5.2.
    await expect(followRow.locator('button', { hasText: 'On' })).toHaveClass(/is-active/);
    expect(await readFlag()).toBe(true);

    await followRow.locator('button', { hasText: 'Off' }).click();
    await expect(followRow.locator('button', { hasText: 'Off' })).toHaveClass(/is-active/);
    expect(await readFlag()).toBe(false);

    await followRow.locator('button', { hasText: 'On' }).click();
    await expect(followRow.locator('button', { hasText: 'On' })).toHaveClass(/is-active/);
    expect(await readFlag()).toBe(true);

    const relevantErrors = consoleErrors.filter((e) => !e.includes('favicon'));
    expect(relevantErrors, `console errors: ${relevantErrors.join(' || ')}`).toEqual([]);
});
