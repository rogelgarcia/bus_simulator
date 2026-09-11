// Verify the real city's preset transitions, retained view, persistence and unchanged pose.
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pose = { version: 1, city: 'bigcity2', bus: { modelId: 'city', transform: {
    position: { x: -149.6728057861328, y: 1.70357861618941, z: 231.16934204101562 },
    quaternion: { x: 0, y: -.5546042921376437, z: 0, w: .8321142224133073 }
} }, camera: { position: { x: -129.97369704099222, y: 3.6455266653003706, z: 232.23481817033417 },
    quaternion: { x: -.015480521101161935, y: .6875902917573187, z: .014665839066841829, w: .7257856827686721 },
    fovDeg: 55, locked: true }, simulation: { paused: true } };

async function waitPreset(page, mode, checkSource = true) {
    await page.waitForFunction(({ expected, checkSource }) => {
        const e = window.__busSim?.engine, d = e?.getBakedLightingDebugInfo();
        const source = expected === 'current' ? 'ibl.hdri.german_town_street_2k' : 'ibl.calibrated.clear_afternoon_55';
        return d?.status.effectiveMode === expected && d.view.ready
            && (!checkSource || e.lightingSettings.ibl.iblId === source)
            && (expected === 'current' || d.receiverLightmaps.activationBlend === 1);
    }, { expected: mode, checkSource }, { timeout: 240_000 });
}

async function openLighting(page) {
    await page.keyboard.press('0');
    await expect(page.locator('#ui-options')).toBeVisible();
    await page.locator('.options-tab').getByText('Lighting', { exact: true }).click();
}

test('Previous and Calibrated switch the real game without displaying incomplete baked lighting', async ({ page }) => {
    test.setTimeout(480_000);
    const output = path.resolve('tests/artifacts/screens/daylight_presets', String(Date.now()));
    await mkdir(output, { recursive: true });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error' && /WebGL|shader|program/i.test(message.text())) errors.push(message.text());
    });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.addInitScript(() => {
        localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({ mode: 'current',
            shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { indirect: true },
            busAppearanceVersion: 2, bus: { enabled: false, glassReflections: false, bodyReflections: false, rimShine: false } }));
    });
    await page.goto('/?coreTests=0&gameplayPose=' + encodeURIComponent(JSON.stringify(pose)));
    await page.waitForFunction(() => !!window.__busSim?.sm.current?.busAnchor, null, { timeout: 120_000 });
    await page.evaluate(async () => { await window.__busSim.sm.current.busModel.userData.readyPromise; });
    await waitPreset(page, 'current', false);
    await page.evaluate(async () => {
        await window.__busSim.engine.waitForLightingReady();
        for (let i = 0; i < 60; i++) await new Promise(requestAnimationFrame);
    });
    await page.screenshot({ path: path.join(output, '0-startup.png') });
    await page.evaluate(() => {
        const { engine: e, sm } = window.__busSim;
        window.initialPresetPose = { bus: sm.current.busAnchor.position.toArray(), camera: e.camera.position.toArray() };
        window.presetTransitions = [];
        const render = e._renderAoFrame.bind(e);
        e._renderAoFrame = (...args) => {
            const d = e.getBakedLightingDebugInfo();
            if (e.bakedLightingSettings.mode === 'baked' && d.status.effectiveMode !== 'baked' && d.view.ready)
                window.presetTransitions.push(d.status);
            return render(...args);
        };
    });
    await openLighting(page);
    const row = page.locator('.options-row', { hasText: 'Lighting preset' });
    const records = [];
    for (const name of ['Previous', 'Calibrated', 'Previous', 'Calibrated']) {
        const start = Date.now();
        await row.getByRole('button', { name, exact: true }).click();
        console.log('Waiting for daylight preset:', name);
        await waitPreset(page, name === 'Previous' ? 'current' : 'baked');
        await expect(row.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
        const state = await page.evaluate(() => {
            const { engine: e, sm } = window.__busSim;
            return { lighting: e.lightingSettings, atmosphere: e.atmosphereSettings,
                baked: e.getBakedLightingDebugInfo().status,
                liveSunColor: sm.current.city.sunRef.color.toArray(),
                shadowSunDiameter: sm.current.city._csm?.angularDiameterDegrees,
                pose: { bus: sm.current.busAnchor.position.toArray(), camera: e.camera.position.toArray() },
                initialPose: window.initialPresetPose, incompleteFrames: window.presetTransitions };
        });
        expect(state.atmosphere.sun).toEqual({ azimuthDeg: 45, elevationDeg: 55 });
        expect(state.lighting.sunIntensity).toBe(name === 'Previous' ? 7 : 162.714329883607);
        expect(state.liveSunColor).toEqual(state.lighting.sunColorLinear);
        if (name === 'Previous') expect(state.shadowSunDiameter).toBe(0);
        expect(errors).toEqual([]);
        expect(state.lighting.ibl.iblId).toBe(name === 'Previous' ? 'ibl.hdri.german_town_street_2k' : 'ibl.calibrated.clear_afternoon_55');
        expect(state.pose.bus).toEqual(state.initialPose.bus);
        expect(state.pose.camera).toEqual(state.initialPose.camera);
        expect(state.incompleteFrames).toEqual([]);
        records.push({ name, seconds: (Date.now() - start) / 1000, ...state });
        await page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); });
        await page.screenshot({ path: path.join(output, `${records.length}-${name.toLowerCase()}.png`) });
    }
    await page.locator('.options-footer').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#ui-options')).toHaveCount(0);
    const saved = await page.evaluate(async () => {
        const { getResolvedLightingSettings } = await import('/src/graphics/lighting/LightingSettings.js');
        return getResolvedLightingSettings({ includeUrlOverrides: false });
    });
    expect(saved.ibl.iblId).toBe('ibl.calibrated.clear_afternoon_55');
    expect(saved.sunColorLinear).toEqual(records.at(-1).lighting.sunColorLinear);
    expect(await page.evaluate(() => localStorage.getItem('bus_sim.lighting.v1'))).toBeNull();
    await openLighting(page);
    await row.getByRole('button', { name: 'Previous', exact: true }).click();
    await waitPreset(page, 'current');
    await page.locator('.options-footer').getByRole('button', { name: 'Cancel', exact: true }).click();
    await waitPreset(page, 'baked');
    expect(await page.evaluate(() => window.__busSim.engine.lightingSettings.ibl.iblId)).toBe('ibl.calibrated.clear_afternoon_55');
    await openLighting(page);
    await page.screenshot({ path: path.join(output, '5-use-defaults-button.png') });
    await page.getByRole('button', { name: 'Use defaults', exact: true }).click();
    await expect(page.locator('#ui-options')).toHaveCount(0);
    const defaults = await page.evaluate(async () => {
        const { getDefaultResolvedBakedLightingSettings } = await import('/src/app/illumination/runtime/index.js');
        return { baked: window.__busSim.engine.bakedLightingSettings, expected: getDefaultResolvedBakedLightingSettings(),
            savedBaked: localStorage.getItem('bus_sim.bakedLighting.v1'), savedLighting: localStorage.getItem('bus_sim.lighting.v1') };
    });
    expect(defaults.baked).toEqual(defaults.expected);
    expect(defaults.savedBaked).toBeNull();
    expect(defaults.savedLighting).toBeNull();
    expect(errors).toEqual([]);
    await writeFile(path.join(output, 'transitions.json'), JSON.stringify({ records, saved, errors }, null, 2));
    console.log('Daylight preset evidence:', output);
});
