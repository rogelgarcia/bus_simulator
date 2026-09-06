// Exercises screen AO and baked illumination independently through gameplay Options.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });

test('Baked illumination survives AO changes in Options', async ({ page }) => {
    test.setTimeout(600000);
    const root = path.resolve('tests/artifacts/screens/illumination_ao');
    await mkdir(root, { recursive: true });
    const errors = [], requests = [], snapshots = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/\.ilpkg\.gz/.test(request.url())) requests.push(request.url()); });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({
        shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { enhanced: true, direct: true, indirect: true }
    })));
    await page.goto('/?coreTests=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, { timeout: 120000 });
    await page.locator('#btn-start').click();
    await page.waitForFunction(() => window.__busSim.sm.currentName === 'bus_select', null, { timeout: 120000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__busSim.sm.currentName === 'game_mode', null, { timeout: 120000 });
    await page.waitForFunction(() => {
        const d = window.__busSim.engine.getBakedLightingDebugInfo().receiverLightmaps;
        if (d.state === 'fallback') throw new Error(JSON.stringify(d));
        return d.state === 'active' && d.activationBlend === 1;
    }, null, { timeout: 300000 });
    await page.evaluate(async () => {
        const T = await import('three');
        const { engine: e, sm } = window.__busSim;
        await e.waitForLightingReady();
        sm.current.gameLoop.paused = true;
        sm.current.update = () => { e.context.city.update(e); e.context.city.updateStaticVisibility(e.camera); };
        e.camera.position.set(47, 11, 120); e.camera.lookAt(47, 9, 145); e.camera.updateMatrixWorld(true);
        window.aoRawSceneProbe = () => {
            const renderer = e.renderer, previous = renderer.getRenderTarget();
            const target = new T.WebGLRenderTarget(64, 64, { type: T.FloatType });
            const pixels = new Float32Array(16 * 16 * 4);
            try {
                renderer.setRenderTarget(target); renderer.render(e.scene, e.camera);
                renderer.readRenderTargetPixels(target, 24, 24, 16, 16, pixels);
                return [0, 1, 2].map(channel => pixels.reduce((sum, value, i) => sum + (i % 4 === channel ? value : 0), 0) / 256);
            } finally { renderer.setRenderTarget(previous); target.dispose(); }
        };
    });
    await page.waitForTimeout(500);
    const snapshot = async label => {
        const value = await page.evaluate(() => {
            const e = window.__busSim.engine;
            return { receiver: e.getBakedLightingDebugInfo().receiverLightmaps, ao: e.ambientOcclusionSettings, radiance: window.aoRawSceneProbe(),
                programs: e.renderer.info.programs.length };
        });
        snapshots.push({ label, ...value });
        console.log(label, value.receiver.state, value.receiver.reason, JSON.stringify(value.receiver.timings.sourceInvalidation ?? null));
        await writeFile(path.join(root, 'result.json'), JSON.stringify({ snapshots, errors, requests }, null, 2));
        return value;
    };
    const initial = await snapshot('initial');
    const originalAo = await page.evaluate(() => window.__busSim.engine.ambientOcclusionSettings.mode);
    await page.evaluate(() => {
        const e = window.__busSim.engine;
        window.aoReceiverResources = { ...e._bakedLighting.receivers.resources };
    });
    const assertActive = async label => {
        await expect.poll(() => page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo().receiverLightmaps.state), { timeout: 120000 }).toBe('active');
        const state = await snapshot(label);
        expect(state.receiver.effective).toEqual({ direct: true, indirect: true });
        for (let channel = 0; channel < 3; channel++) expect(state.radiance[channel]).toBeCloseTo(initial.radiance[channel], 5);
        expect(await page.evaluate(() => Object.entries(window.aoReceiverResources)
            .every(([key, value]) => window.__busSim.engine._bakedLighting.receiverModes.enhanced.resources[key] === value))).toBe(true);
        return state;
    };
    await page.keyboard.press('0');
    await page.locator('.options-tab', { hasText: /^Graphics$/i }).click();
    const section = page.locator('.options-section').filter({ has: page.locator('.options-section-title', { hasText: /^Ambient Occlusion$/i }) });
    const row = section.locator('.options-row').filter({ has: page.locator('.options-row-label', { hasText: /^Mode$/ }) });
    for (const mode of ['Off', 'GTAO']) {
        await row.getByRole('button', { name: mode, exact: true }).click();
        await page.waitForTimeout(1500);
        const state = await snapshot(mode);
        await page.screenshot({ path: path.join(root, mode + '.png') });
        expect(state.receiver.state, JSON.stringify(state.receiver)).toBe('active');
        expect(state.receiver.effective).toEqual({ direct: true, indirect: true });
    }
    await row.getByRole('button', { name: 'Off', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('#ui-options')).toHaveCount(0);
    await page.waitForTimeout(1000);
    await assertActive('cancel-ao');
    expect(await page.evaluate(() => window.__busSim.engine.ambientOcclusionSettings.mode)).toBe(originalAo);

    await page.keyboard.press('0');
    await page.locator('.options-tab', { hasText: /^Baked lighting$/i }).click();
    const toggle = label => page.locator('.options-row', { hasText: label }).locator('.options-toggle-switch');
    await toggle('Enhanced baked illumination (AI 548)').click();
    await expect.poll(() => page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo().receiverLightmaps.state), { timeout: 180000 }).toBe('active');
    await toggle('Enhanced baked illumination (AI 548)').click();
    await assertActive('enhanced-return');
    const warmedRequests = requests.length;
    const counts = [];
    for (let cycle = 0; cycle < 3; cycle++) {
        await page.locator('.options-tab', { hasText: /^Graphics$/i }).click();
        for (const mode of ['Off', 'SSAO', 'GTAO']) {
            await row.getByRole('button', { name: mode, exact: true }).click();
            await page.waitForTimeout(500);
            await assertActive(mode + cycle);
        }
        await page.locator('.options-tab', { hasText: /^Baked lighting$/i }).click();
        await toggle('Enable baked indirect illumination').click();
        await expect.poll(() => page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo().receiverLightmaps.effective)).toEqual({ direct: false, indirect: false });
        const disabled = await snapshot('channels-off' + cycle);
        expect(Math.max(...disabled.radiance.map((value, channel) => Math.abs(value - initial.radiance[channel])))).toBeGreaterThan(0.005);
        await toggle('Enable baked direct illumination').click();
        counts.push((await assertActive('channels-return' + cycle)).programs);
    }
    expect(requests.length).toBe(warmedRequests);
    expect(counts[2]).toBe(counts[1]);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.keyboard.press('0');
    await page.locator('.options-tab', { hasText: /^Graphics$/i }).click();
    await row.getByRole('button', { name: 'Off', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.keyboard.press('0');
    await assertActive('saved-ao-off');
    expect(await page.evaluate(() => window.__busSim.engine.ambientOcclusionSettings.mode)).toBe('off');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(errors).toEqual([]);
});
