// Persist default inheritance rather than a snapshot, and preserve explicit user overrides.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

async function openOptions(page) {
    await page.waitForFunction(() => !!window.__testHooks);
    await page.evaluate(async () => {
        const { OptionsState } = await import('/src/states/OptionsState.js');
        const engine = window.__testHooks.getEngine();
        const sm = { popOverlay: () => window.defaultsOptions.exit() };
        window.defaultsOptions = new OptionsState(engine, sm);
        window.defaultsOptions.enter({ overlay: true });
    });
}

test('opening Options preserves the previous environment source and sun color', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0');
    await page.waitForFunction(() => !!window.__testHooks);
    await page.evaluate(async () => {
        await window.__testHooks.getEngine().setLightingSettings({ sunColorLinear: [1, 1, 1],
            ibl: { enabled: false, setBackground: false, iblId: 'ibl.hdri.german_town_street_2k' } });
    });
    await openOptions(page);
    const lighting = await page.evaluate(() => window.defaultsOptions._ui.getDraft().lighting);
    expect(lighting.sunColorLinear).toEqual([1, 1, 1]);
    expect(lighting.ibl.iblId).toBe('ibl.hdri.german_town_street_2k');
});

test('Use defaults clears only Options overrides and follows changed source defaults after reload', async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/tests/headless/harness/index.html');
    await page.addStyleTag({ url: '/src/graphics/gui/shared/styles.css' });
    await page.addStyleTag({ url: '/src/graphics/gui/options/styles.css' });
    await openOptions(page);
    const count = await page.evaluate(async () => {
        const { saveOptionsDraft } = await import('/src/graphics/gui/options/OptionsPersistence.js');
        const draft = window.defaultsOptions._ui.getDraft();
        draft.lighting.exposure = 1.2;
        saveOptionsDraft(draft, null, { reset: true });
        const count = localStorage.length;
        localStorage.setItem('defaults-test-unrelated', 'keep');
        return count;
    });
    expect(count).toBe(14);
    const output = path.resolve('tests/artifacts/screens/options_use_defaults');
    await mkdir(output, { recursive: true });
    const button = page.getByRole('button', { name: 'Use defaults', exact: true });
    await expect(button).toBeVisible();
    await expect(page.locator('.options-footer button').first()).toHaveText('Use defaults');
    await page.screenshot({ path: path.join(output, 'use-defaults-button.png') });
    await page.setViewportSize({ width: 600, height: 800 });
    await expect(button).toBeInViewport();
    const boxes = await page.locator('.options-footer button').evaluateAll(buttons => buttons.map(button => {
        const { x, y, width, height } = button.getBoundingClientRect();
        return { x, y, width, height };
    }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height).toBe(false);
    }
    page.once('dialog', async dialog => {
        expect(dialog.type()).toBe('confirm');
        expect(dialog.message()).toContain('clear your saved Options settings');
        await dialog.accept();
    });
    await button.click();
    await expect(page.locator('#ui-options')).toHaveCount(0);
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({ 'defaults-test-unrelated': 'keep' });

    // Reopening and saving without edits must not pin today's defaults again.
    await openOptions(page);
    await page.evaluate(() => window.defaultsOptions._ui.setTab('baked_lighting'));
    for (const label of ['Enable baked indirect illumination', 'Glass reflections', 'Body reflections', 'Rim shine']) {
        await expect(page.getByRole('checkbox', { name: label, exact: true })).toBeChecked();
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#ui-options')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.length)).toBe(1);

    let sourceExposure = .123;
    await page.route('**/src/graphics/lighting/CalibratedDaylight.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace(/exposure: [^,]+,/, `exposure: ${sourceExposure},`) });
    });
    await page.reload();
    await openOptions(page);
    expect(await page.evaluate(() => window.defaultsOptions._ui.getDraft().lighting.exposure)).toBe(.123);
    // Only the explicitly edited group becomes a saved override.
    await page.evaluate(() => { window.defaultsOptions._ui._draftLighting.exposure = .25; });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#ui-options')).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(['bus_sim.lighting.v1', 'defaults-test-unrelated']);
    sourceExposure = .2;
    await page.reload();
    await openOptions(page);
    expect(await page.evaluate(() => window.defaultsOptions._ui.getDraft().lighting.exposure)).toBe(.25);
});

test('dismissing Use defaults confirmation leaves saved, preview and unsaved settings intact', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    await openOptions(page);
    const before = await page.evaluate(async () => {
        const ui = window.defaultsOptions._ui;
        localStorage.setItem('bus_sim.lighting.v1', JSON.stringify({ exposure: .7 }));
        ui._draftLighting.exposure = .4;
        await ui._emitLiveChange();
        return { saved: { ...localStorage }, draft: ui.getDraft(), lighting: window.__testHooks.getEngine().lightingSettings };
    });
    let confirmed = false;
    page.once('dialog', async dialog => { confirmed = true; await dialog.dismiss(); });
    await page.getByRole('button', { name: 'Use defaults', exact: true }).click();
    expect(confirmed).toBe(true);
    await expect(page.locator('#ui-options')).toHaveCount(1);
    const after = await page.evaluate(() => ({ saved: { ...localStorage }, draft: window.defaultsOptions._ui.getDraft(),
        lighting: window.__testHooks.getEngine().lightingSettings }));
    expect(after).toEqual(before);
});

test('Reset stays a preview until Save, while Cancel preserves saved settings', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    await openOptions(page);
    await page.evaluate(() => { window.defaultsOptions._ui._draftLighting.exposure = .3; });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#ui-options')).toHaveCount(0);
    const saved = await page.evaluate(() => ({ ...localStorage }));
    await openOptions(page);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(saved);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('#ui-options')).toHaveCount(0);
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(saved);
    await openOptions(page);
    expect(await page.evaluate(() => window.defaultsOptions._ui.getDraft().lighting.exposure)).toBe(.3);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#ui-options')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.length)).toBe(14);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bus_sim.lighting.v1')).exposure)).toBe(.0511001705221839);
});

test('cancelling a pending Use defaults load does not clear saved overrides', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0');
    const result = await page.evaluate(async () => {
        const { OptionsState } = await import('/src/states/OptionsState.js');
        const { applyDaylightPreset } = await import('/src/graphics/lighting/DaylightPresets.js');
        const { saveOptionsDraft } = await import('/src/graphics/gui/options/OptionsPersistence.js');
        const previous = applyDaylightPreset({}, 'previous');
        saveOptionsDraft(previous, previous, { reset: true });
        const saved = JSON.stringify({ ...localStorage });
        let release, closes = 0;
        const engine = { setLightingSettings: settings => settings.ibl.iblId.includes('calibrated')
            ? new Promise(resolve => { release = () => resolve({}); }) : undefined };
        const state = new OptionsState(engine, { go: () => closes++ });
        state._original = previous; state._initialDraft = previous; state._appliedDraft = previous;
        const pending = state._useDefaults(applyDaylightPreset(previous, 'calibrated'));
        await state._restoreOriginal(); release(); await pending;
        return { retained: saved === JSON.stringify({ ...localStorage }), closes };
    });
    expect(result).toEqual({ retained: true, closes: 0 });
});
