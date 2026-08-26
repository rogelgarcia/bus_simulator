// Headless browser tests: BF2 plan edge bevel controls (AI 499) — scope, facet
// width and per-corner overrides.
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

const readBevel = (page) => page.evaluate(() => (
    window.__busSim?.sm?.current?.view?._currentConfig?.edgeBevel ?? null
));

test('BF2: the plan edge bevel is authorable with scope, width and per-corner overrides', async ({ page }) => {
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

    const section = page.locator('.building-fab2-layer-group.is-building').filter({ hasText: 'Edge bevel' });
    await expect(section).toHaveCount(1);
    await section.locator('.building-fab2-layer-summary').click();

    // Off by default, and nothing is written until it is turned on.
    expect(await readBevel(page)).toBeNull();
    await expect(section.locator('select[data-role="edgeBevel:scope"]')).toHaveCount(0);

    await section.locator('button[data-role="edgeBevel:enabled"][data-state="on"]').click();
    const on = await readBevel(page);
    expect(on?.enabled).toBe(true);
    expect(on?.scope).toBe('main_corners');
    expect(on?.widthMeters).toBeGreaterThan(0);

    // Both scopes are offered (AI 501 shipped all_convex_edges), and the wider
    // scope reveals the concave opt-in toggle.
    const scope = section.locator('select[data-role="edgeBevel:scope"]');
    await expect(scope).toHaveValue('main_corners');
    expect(await scope.locator('option').count()).toBe(2);
    await expect(section.locator('button[data-role="edgeBevel:includeConcave"]')).toHaveCount(0);
    await scope.selectOption('all_convex_edges');
    expect((await readBevel(page))?.scope).toBe('all_convex_edges');
    await expect(section.locator('button[data-role="edgeBevel:includeConcave"][data-state="on"]')).toHaveCount(1);
    await section.locator('button[data-role="edgeBevel:includeConcave"][data-state="on"]').click();
    expect((await readBevel(page))?.includeConcave).toBe(true);
    await scope.selectOption('main_corners');
    expect((await readBevel(page))?.scope).toBe('main_corners');

    // Facet width, clamped to the model's range.
    const width = section.locator('input[data-role="edgeBevel:width"]');
    await width.fill('0.8');
    await width.dispatchEvent('input');
    expect((await readBevel(page))?.widthMeters).toBeCloseTo(0.8, 3);
    await width.fill('9');
    await width.dispatchEvent('input');
    expect((await readBevel(page))?.widthMeters).toBeCloseTo(1.5, 3);

    // Per-corner: turning one off hides its width row and records the opt-out.
    await expect(section.locator('input[data-role="edgeBevel:cornerWidth:AB"]')).toHaveCount(1);
    await section.locator('button[data-role="edgeBevel:corner:AB"][data-state="off"]').click();
    expect((await readBevel(page))?.corners?.AB?.enabled).toBe(false);
    await expect(section.locator('input[data-role="edgeBevel:cornerWidth:AB"]')).toHaveCount(0);

    const bcWidth = section.locator('input[data-role="edgeBevel:cornerWidth:BC"]');
    await bcWidth.fill('0.4');
    await bcWidth.dispatchEvent('input');
    const withCorner = await readBevel(page);
    expect(withCorner?.corners?.BC?.widthMeters).toBeCloseTo(0.4, 3);
    expect(withCorner?.corners?.CD?.widthMeters).toBeNull();

    // Turning the feature off drops the block entirely so a plain building
    // round-trips unchanged.
    await section.locator('button[data-role="edgeBevel:enabled"][data-state="off"]').click();
    expect(await readBevel(page)).toBeNull();

    expect(await getErrors()).toEqual([]);
});
