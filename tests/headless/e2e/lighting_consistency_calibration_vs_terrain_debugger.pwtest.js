// Headless browser tests: Material Calibration (user mode) and Terrain Debugger should agree on global lighting.
import test, { expect } from '@playwright/test';

// These pages are fairly heavy; allow extra time in CI / low-end runners.
test.setTimeout(240_000);

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

test('Lighting: calibration user mode matches global (hemi/sun/exposure) like Terrain Debugger', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.setViewportSize({ width: 960, height: 540 });

    const lightingOverride = {
        exposure: 1.77,
        toneMapping: 'aces',
        hemiIntensity: 0.42,
        sunIntensity: 0.73,
        ibl: { enabled: true, envMapIntensity: 0.31, setBackground: true }
    };
    const expectedStorage = JSON.stringify(lightingOverride);

    await page.addInitScript((settings) => {
        try {
            window.localStorage.setItem('bus_sim.lighting.v1', JSON.stringify(settings));
        } catch {}
    }, lightingOverride);

    await page.goto('/index.html?screen=material_calibration');
    await page.waitForSelector('#material-calibration-hud');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'material_calibration');
    await page.waitForFunction(() => !!window.__busSim?.engine?.scene?.getObjectByName?.('material_calibration_root'));

    const calibration = await page.evaluate(() => {
        const engine = window.__busSim?.engine ?? null;
        const renderer = engine?.renderer ?? null;
        const lighting = engine?.lightingSettings ?? null;
        const root = engine?.scene?.getObjectByName?.('material_calibration_root') ?? null;

        let hemi = null;
        let sun = null;
        root?.traverse?.((obj) => {
            if (!hemi && obj?.isHemisphereLight) hemi = obj;
            if (!sun && obj?.isDirectionalLight) sun = obj;
        });

        return {
            storage: window.localStorage.getItem('bus_sim.lighting.v1'),
            lighting: lighting ? {
                exposure: lighting.exposure,
                toneMapping: lighting.toneMapping,
                hemiIntensity: lighting.hemiIntensity,
                sunIntensity: lighting.sunIntensity,
                ibl: {
                    enabled: lighting.ibl?.enabled,
                    envMapIntensity: lighting.ibl?.envMapIntensity,
                    setBackground: lighting.ibl?.setBackground,
                    iblId: lighting.ibl?.iblId ?? null
                }
            } : null,
            renderer: renderer ? {
                toneMapping: renderer.toneMapping ?? null,
                exposure: renderer.toneMappingExposure ?? null
            } : null,
            lights: {
                hemiIntensity: hemi?.intensity ?? null,
                sunIntensity: sun?.intensity ?? null
            }
        };
    });

    expect(calibration.storage).toBe(expectedStorage);
    expect(calibration.lighting?.exposure).toBeCloseTo(lightingOverride.exposure, 3);
    expect(calibration.lighting?.hemiIntensity).toBeCloseTo(lightingOverride.hemiIntensity, 3);
    expect(calibration.lighting?.sunIntensity).toBeCloseTo(lightingOverride.sunIntensity, 3);
    expect(calibration.renderer?.exposure).toBeCloseTo(lightingOverride.exposure, 3);
    expect(calibration.lights?.hemiIntensity).toBeCloseTo(lightingOverride.hemiIntensity, 3);
    expect(calibration.lights?.sunIntensity).toBeCloseTo(lightingOverride.sunIntensity, 3);

    await page.goto('/debug_tools/terrain_debug.html');
    await page.waitForSelector('#ui-terrain-debugger');
    await page.waitForFunction(() => typeof window.__terrainDebugHooks?.getLightingInfo === 'function');

    const terrain = await page.evaluate(() => window.__terrainDebugHooks.getLightingInfo());

    const terrainStorage = await page.evaluate(() => window.localStorage.getItem('bus_sim.lighting.v1'));
    expect(terrainStorage).toBe(expectedStorage);
    expect(terrain?.resolvedLightingDefaults?.exposure).toBeCloseTo(lightingOverride.exposure, 3);
    expect(terrain?.resolvedLightingDefaults?.hemiIntensity).toBeCloseTo(lightingOverride.hemiIntensity, 3);
    expect(terrain?.resolvedLightingDefaults?.sunIntensity).toBeCloseTo(lightingOverride.sunIntensity, 3);
    expect(terrain?.renderer?.exposure).toBeCloseTo(lightingOverride.exposure, 3);
    expect(terrain?.lights?.hemi?.intensity).toBeCloseTo(lightingOverride.hemiIntensity, 3);
    expect(terrain?.lights?.sun?.intensity).toBeCloseTo(lightingOverride.sunIntensity, 3);

    expect(await getErrors()).toEqual([]);
});
