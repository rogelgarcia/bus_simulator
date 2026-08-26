// Headless browser tests: BF2 group rhythm controls (AI 493) — repeat bounds,
// the arcade mode with its impost band, and the facade column stacking lock.
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
        const allow = ['ResizeObserver loop limit exceeded'];
        if (allow.some((s) => text.includes(s))) return;
        errors.push({ kind: 'console.error', message: text });
    });
    return async () => {
        const fromPage = await page.evaluate(() => (Array.isArray(window.__e2eErrors) ? window.__e2eErrors : []));
        return [...errors, ...fromPage];
    };
}

const readFaceLayout = (page) => page.evaluate(() => {
    const facades = window.__busSim?.sm?.current?.view?._currentConfig?.facades ?? null;
    if (!facades) return null;
    const layerId = Object.keys(facades)[0];
    return facades[layerId]?.A?.layout ?? null;
});

test('BF2: group repeat bounds, arcade mode and the column stacking lock are authorable', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    // #ui-welcome is in the static HTML before the app boots, so wait for the
    // state machine before sending keys.
    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.waitForFunction(() => !!window.__busSim?.sm?.current, null, { timeout: 60_000 });
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('4');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();

    const floorLayer = page.locator('.building-fab2-layer-group.is-floor').first();
    await expect(floorLayer).toBeVisible();
    await floorLayer.locator('.building-fab2-face-btn').filter({ hasText: 'A' }).click();

    const addBtn = floorLayer.locator('.building-fab2-bay-btn.is-add');
    await addBtn.click();
    await addBtn.click();

    await floorLayer.locator('.building-fab2-bay-selector-add .building-fab2-bay-btn.is-grouping').click();
    const overlay = page.locator('.building-fab2-group-overlay');
    await expect(overlay).toBeVisible();

    // The stacking lock is on by default and is stored only when turned off.
    const stacking = overlay.locator('input[data-role="group:stacking"]');
    await expect(stacking).toBeChecked();
    expect((await readFaceLayout(page))?.stacking ?? null).toBe(null);

    await stacking.uncheck();
    await expect(overlay.locator('input[data-role="group:stacking"]')).not.toBeChecked();
    expect((await readFaceLayout(page))?.stacking?.mode).toBe('per_layer');

    await overlay.locator('input[data-role="group:stacking"]').check();
    expect((await readFaceLayout(page))?.stacking ?? null).toBe(null);

    // Group the two bays, then drive the rhythm controls on the group row.
    await overlay.locator('button[data-action="group:startCreate"]').click();
    const groupBays = overlay.locator('.building-fab2-group-bay-list .building-fab2-group-bay');
    await expect(groupBays).toHaveCount(2);
    await groupBays.nth(0).click();
    await groupBays.nth(1).click();
    await overlay.locator('button[data-action="group:doneCreate"]').click();

    const minRepeats = overlay.locator('input[data-role="group:minRepeats"]');
    const maxRepeats = overlay.locator('input[data-role="group:maxRepeats"]');
    await expect(minRepeats).toHaveCount(1);
    await expect(minRepeats).toHaveValue('1');
    await expect(maxRepeats).toHaveValue('');

    await maxRepeats.fill('3');
    await maxRepeats.blur();
    await expect(overlay.locator('input[data-role="group:maxRepeats"]')).toHaveValue('3');
    expect((await readFaceLayout(page))?.groups?.items?.[0]?.repeat).toEqual({ minRepeats: 1, maxRepeats: 3 });

    await overlay.locator('input[data-role="group:minRepeats"]').fill('2');
    await overlay.locator('input[data-role="group:minRepeats"]').blur();
    expect((await readFaceLayout(page))?.groups?.items?.[0]?.repeat).toEqual({ minRepeats: 2, maxRepeats: 3 });

    // Arcade is a mode of the group; its impost band appears with it.
    const arcade = overlay.locator('input[data-role="group:arcade"]');
    await expect(arcade).not.toBeChecked();
    await expect(overlay.locator('input[data-role="group:arcadeImpost"]')).toHaveCount(0);
    expect((await readFaceLayout(page))?.groups?.items?.[0]?.arcade ?? null).toBe(null);

    await arcade.check();
    const impost = overlay.locator('input[data-role="group:arcadeImpost"]');
    await expect(impost).toHaveCount(1);
    await expect(impost).toBeChecked();

    const withArcade = (await readFaceLayout(page))?.groups?.items?.[0]?.arcade ?? null;
    expect(withArcade?.enabled).toBe(true);
    expect(withArcade?.springing?.mode).toBe('auto');
    expect(withArcade?.impost?.heightMeters).toBeGreaterThan(0);

    await impost.uncheck();
    expect((await readFaceLayout(page))?.groups?.items?.[0]?.arcade?.impost?.enabled).toBe(false);

    await overlay.locator('input[data-role="group:arcade"]').uncheck();
    await expect(overlay.locator('input[data-role="group:arcadeImpost"]')).toHaveCount(0);
    expect((await readFaceLayout(page))?.groups?.items?.[0]?.arcade ?? null).toBe(null);

    expect(await getErrors()).toEqual([]);
});
