// A delayed HDR load must preserve the visible profile and cannot win after a newer selection.
import { test, expect } from '@playwright/test';

test('calibrated environment replacement is atomic and stale requests cannot restore old settings', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/tests/headless/harness/index.html?ibl=0');
    await page.waitForFunction(() => !!window.__testHooks);
    await page.evaluate(async () => {
        const engine = window.__testHooks.getEngine();
        await engine._iblPromise;
        window.transitionEngine = engine;
        window.originalLighting = JSON.parse(JSON.stringify(engine.lightingSettings));
    });
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let requested;
    const started = new Promise(resolve => { requested = resolve; });
    await page.route('**/german_town_street_2k.hdr', async route => { requested(); await held; await route.continue(); });
    await page.evaluate(() => {
        const engine = window.transitionEngine;
        window.pendingLegacy = engine.setLightingSettings({ exposure: 1, sunIntensity: 7,
            ibl: { iblId: 'ibl.hdri.german_town_street_2k', enabled: true, setBackground: true } });
    });
    await started;
    expect(await page.evaluate(() => JSON.stringify(window.transitionEngine.lightingSettings) === JSON.stringify(window.originalLighting))).toBe(true);
    await page.evaluate(async () => {
        const engine = window.transitionEngine;
        await engine.setLightingSettings({ ...window.originalLighting, ibl: { ...window.originalLighting.ibl, enabled: true } });
        await engine._iblPromise;
    });
    release();
    await page.evaluate(async () => { await window.pendingLegacy; });
    const state = await page.evaluate(async () => {
        const engine = window.transitionEngine;
        const source = engine.lightingSettings.ibl.hdrUrl, exposure = engine.lightingSettings.exposure;
        const environment = engine._ibl.envMap;
        for (let i = 0; i < 8; i++) {
            engine.setLightingSettings({ ibl: { enabled: false } });
            if (engine.scene.environment !== null) throw new Error('Environment remained active while disabled');
            engine.setLightingSettings({ ibl: { enabled: true } });
            if (engine.scene.environment !== environment) throw new Error('Environment identity was lost on toggle');
        }
        await engine.setLightingSettings({ exposure: 1, sunIntensity: 7,
            ibl: { iblId: 'ibl.hdri.german_town_street_2k', enabled: true, setBackground: true } });
        if (engine.lightingSettings.exposure !== 1 || engine._ibl.envMap === environment
            || !engine.lightingSettings.ibl.hdrUrl.includes('german_town_street')) throw new Error('Complete replacement was not applied');
        await engine.setLightingSettings({ ...window.originalLighting, ibl: { ...window.originalLighting.ibl, enabled: true } });
        if (engine._ibl.envMap !== environment || engine.lightingSettings.exposure !== exposure) throw new Error('Calibrated profile did not restore');
        return { source, exposure, originalExposure: window.originalLighting.exposure };
    });
    expect(state.source).toContain('clear-afternoon-55.hdr');
    expect(state.exposure).toBe(state.originalExposure);
    expect(errors).toEqual([]);
});
