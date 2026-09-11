// Daylight presets preserve source identity and replace complete lighting groups together.
import { test, expect } from '@playwright/test';

test('changing the light recipe updates the live sun color as well as saved settings', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0');
    const colors = await page.evaluate(async () => {
        const THREE = await import('three');
        const { GameEngine } = await import('/src/app/core/GameEngine.js');
        const { LIGHTING_DEFAULTS } = await import('/src/graphics/lighting/LightingSettings.js');
        const city = { sunRef: { color: new THREE.Color().fromArray(LIGHTING_DEFAULTS.sunColorLinear) },
            sun: new THREE.DirectionalLight() };
        const engine = { context: { city }, _lighting: LIGHTING_DEFAULTS, renderer: {},
            _applyShadowSettings() {}, _initIBL() {} };
        GameEngine.prototype.setLightingSettings.call(engine, { sunColorLinear: [1, 1, 1] });
        return [city.sunRef.color.toArray(), city.sun.color.toArray()];
    });
    expect(colors).toEqual([[1, 1, 1], [1, 1, 1]]);
});

test('a new environment prepares the view even when the illumination mode stays Current', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0');
    const preparations = await page.evaluate(async () => {
        const { GameEngine } = await import('/src/app/core/GameEngine.js');
        const { LIGHTING_DEFAULTS } = await import('/src/graphics/lighting/LightingSettings.js');
        let preparations = 0, shadowRebuilds = 0;
        const engine = { _lighting: LIGHTING_DEFAULTS, renderer: {}, _applyShadowSettings() {}, _initIBL() {},
            context: { city: { applyShadowSettings() { shadowRebuilds++; } } },
            _bakedLighting: { requestViewPreparation() { preparations++; } } };
        GameEngine.prototype.setLightingSettings.call(engine, { ibl: { iblId: 'ibl.hdri.german_town_street_2k' } });
        GameEngine.prototype.setLightingSettings.call(engine, { exposure: 1.02 });
        return { preparations, shadowRebuilds };
    });
    expect(preparations).toEqual({ preparations: 1, shadowRebuilds: 1 });
});

test('Options retains the environment and sun color through edit, save and reset drafts', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0');
    const result = await page.evaluate(async () => {
        const { OptionsUI } = await import('/src/graphics/gui/options/OptionsUI.js');
        const { LIGHTING_DEFAULTS } = await import('/src/graphics/lighting/LightingSettings.js');
        const lighting = { ...structuredClone(LIGHTING_DEFAULTS), exposure: 1.02, sunIntensity: 7,
            sunColorLinear: [1, 1, 1], ibl: { ...LIGHTING_DEFAULTS.ibl, iblId: 'ibl.hdri.german_town_street_2k' } };
        const ui = new OptionsUI({ initialLighting: lighting });
        const edited = ui.getDraft().lighting;
        ui.resetToDefaults();
        const reset = ui.getDraft().lighting;
        ui.unmount();
        return { edited, reset, defaults: LIGHTING_DEFAULTS };
    });
    expect(result.edited.ibl.iblId).toBe('ibl.hdri.german_town_street_2k');
    expect(result.edited.sunColorLinear).toEqual([1, 1, 1]);
    expect(result.reset.ibl.iblId).toBe(result.defaults.ibl.iblId);
    expect(result.reset.sunColorLinear).toEqual(result.defaults.sunColorLinear);
});

test('preset controls preserve bus choices and expose manual edits as Custom', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0');
    await page.evaluate(async () => {
        const { OptionsUI } = await import('/src/graphics/gui/options/OptionsUI.js');
        window.presetUi = new OptionsUI({ onLiveChange: draft => { window.lastPresetDraft = draft; } });
        window.presetUi._ensureDraftBakedLighting();
        window.presetUi._draftBakedLighting.bus.glassReflections = true;
        window.presetUi.mount(); window.presetUi.setTab('lighting');
    });
    const row = page.locator('.options-row', { hasText: 'Lighting preset' });
    await row.getByRole('button', { name: 'Previous', exact: true }).click();
    let draft = await page.evaluate(() => window.lastPresetDraft);
    expect(draft.lighting.sunIntensity).toBe(7);
    expect(draft.lighting.sunColorLinear).toEqual([1, 1, 1]);
    expect(draft.lighting.ibl.iblId).toContain('german_town');
    expect(draft.bakedLighting.mode).toBe('current');
    expect(draft.bakedLighting.bus.glassReflections).toBe(true);
    expect(draft.atmosphere.sun).toEqual({ azimuthDeg: 45, elevationDeg: 55 });
    await row.getByRole('button', { name: 'Calibrated', exact: true }).click();
    draft = await page.evaluate(() => window.lastPresetDraft);
    expect(draft.lighting.ibl.iblId).toBe('ibl.calibrated.clear_afternoon_55');
    expect(draft.lighting.sunIntensity).toBeGreaterThan(160);
    expect(draft.bakedLighting.mode).toBe('baked');
    expect(draft.bakedLighting.bus.glassReflections).toBe(true);
    await page.evaluate(() => { window.presetUi._draftLighting.exposure = 1; window.presetUi._emitLiveChange(); });
    await expect(row.locator('.is-active')).toHaveCount(0);
    await expect(page.getByText('Custom settings', { exact: true })).toBeVisible();
    await page.evaluate(() => window.presetUi.unmount());
});

test('loading a preset holds other groups and Cancel wins over delayed HDR completion', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0');
    const result = await page.evaluate(async () => {
        const { OptionsState } = await import('/src/states/OptionsState.js');
        const { applyDaylightPreset } = await import('/src/graphics/lighting/DaylightPresets.js');
        const initial = applyDaylightPreset({}, 'calibrated');
        const previous = applyDaylightPreset(initial, 'previous');
        const calls = [];
        let release;
        const engine = {
            setLightingSettings: value => value.ibl.iblId.includes('german_town')
                ? new Promise(resolve => { release = () => resolve({}); }) : undefined,
            setAtmosphereSettings: value => calls.push(['atmosphere', value.sun.elevationDeg]),
            setBakedLightingSettings: value => calls.push(['baked', value.mode]),
            setColorGradingSettings: value => calls.push(['grade', value.preset]),
            setSunBloomSettings: value => calls.push(['sunBloom', value.enabled])
        };
        const state = new OptionsState(engine, {});
        state._appliedDraft = structuredClone(initial);
        state._initialDraft = structuredClone(initial); state._original = structuredClone(initial);
        const pending = state._applyDraft(previous);
        const before = calls.slice();
        await state._restoreOriginal(); release(); await pending;
        const cancelled = calls.splice(0);
        const next = state._applyDraft(previous); release(); await next;
        return { before, cancelled, committed: calls, finalMode: state._appliedDraft.bakedLighting.mode };
    });
    expect(result.before).toEqual([]);
    expect(result.cancelled).toEqual([]);
    expect(result.committed).toEqual([['baked', 'current']]);
    expect(result.finalMode).toBe('current');
});
