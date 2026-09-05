// Delays the existing shadow package to exercise receiver activation during loading.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });

test('AI 548: receiver activation preserves a concurrently loading shadow identity', async ({ page }) => {
    test.setTimeout(240_000);
    await page.route('**/static_sun_depth.ilpkg', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 20_000)); await route.continue();
    });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({
        shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { enhanced: true, linked: false, direct: false, indirect: false }
    })));
    await page.goto('/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 120_000 });
    await page.waitForFunction(() => window.__busSim.engine.getIlluminationPipeline(), null, { timeout: 30_000 });
    await page.evaluate(() => {
        const engine = window.__busSim.engine, pipeline = engine.getIlluminationPipeline();
        window.__shadowOverlap = { initial: pipeline.runtime.getSnapshot() };
        const matches = pipeline._liveIdentityMatches.bind(pipeline);
        pipeline._liveIdentityMatches = (descriptor, active, identity) => {
            const result = matches(descriptor, active, identity);
            if (!result) {
                const city = engine.context.city, lights = [];
                engine.scene.traverse((o) => { if (o.isDirectionalLight) lights.push({ name: o.name, id: o.id, visible: o.visible,
                    intensity: o.intensity, allowed: city._csm?.csm?.lights.includes(o), position: o.position.toArray(), target: o.target.position.toArray() }); });
                window.__shadowOverlap.mismatch = { state: window.__busSim.sm.currentName, cityId: city.cityId,
                    attached: (() => { for (let o = city.group; o; o = o.parent) if (o === engine.scene) return true; return false; })(),
                    sun: city.sunRef.direction.toArray(), allowed: city._csm?.csm?.lights.map((o) => ({ id: o.id, visible: o.visible, intensity: o.intensity })),
                    live: pipeline._getLiveIdentity(), expected: descriptor.identity, packageIdentity: identity ?? active?.packageIdentity, lights };
            }
            return result;
        };
    });
    await page.keyboard.press('0');
    await page.locator('.options-tab', { hasText: /^Baked lighting$/i }).click();
    for (const channel of ['indirect', 'direct']) await page.locator('.options-row', { hasText: `Enable baked ${channel} illumination` }).locator('.options-toggle-switch').click();
    let state;
    for (let i = 0; i < 240; i++) {
        state = await page.evaluate(() => ({ ...window.__shadowOverlap, ...window.__busSim.engine.getBakedLightingDebugInfo() }));
        if (state.status.state === 'fallback' || state.receiverLightmaps.state === 'fallback'
            || (state.receiverLightmaps.effective.direct && state.receiverLightmaps.effective.indirect)) break;
        await page.waitForTimeout(500);
    }
    await mkdir('tests/artifacts/screens/illumination_548/shadow-overlap', { recursive: true });
    await writeFile('tests/artifacts/screens/illumination_548/shadow-overlap/result.json', JSON.stringify(state, null, 2));
    expect(state.status.state, JSON.stringify(state)).toBe('active');
    expect(state.receiverLightmaps.effective).toEqual({ direct: true, indirect: true });
    expect(state.mismatch).toBeUndefined();
});
