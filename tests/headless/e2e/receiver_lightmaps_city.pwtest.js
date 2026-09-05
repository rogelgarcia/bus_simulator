import test, { expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome, args: ['--use-angle=d3d11'] } });

test('Receiver illumination: current, cached sun, direct, indirect and combined city modes', async ({ page }) => {
    test.setTimeout(1_200_000);
    const artifactRoot = path.resolve('tests/artifacts/screens/illumination_533');
    const sourceOnly = process.env.AI533_SOURCE_ONLY === '1';
    const latest = sourceOnly ? { directory: '4b26313a86b0c5e11be7bf2d8a854fbb07d5cc390f1075fb093d223a0787cb6e' }
        : JSON.parse(await readFile(path.join(artifactRoot, 'bake/latest.json')));
    expect(latest.directory).toMatch(/^[a-f0-9]{64}$/);
    const baked = path.join(artifactRoot, 'bake', latest.directory);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' && /shader|WebGLProgram|texture/i.test(message.text())) errors.push(message.text()); });
    if (process.env.AI533_INSTALLED !== '1') {
        await page.route('**/assets/baked_lighting/receivers/**', async (route) => route.fulfill({
            path: path.join(baked, path.basename(new URL(route.request().url()).pathname))
        }));
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({
        shadows: { enabled: false, dynamicResolution: 'high' }, receivers: { direct: false, indirect: false }
    })));
    await page.goto('/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 120_000 });
    await page.evaluate(async () => {
        const { engine, sm } = window.__busSim; engine.stop();
        if (sm.current.gameLoop) sm.current.gameLoop.paused = true;
        await engine.waitForLightingReady();
        engine._bakedLighting.receivers.onSourceExport = (manifest) => { window.__ai533LiveSource = manifest; console.log('AI533 source export complete'); };
    });
    const results = [];
    const configurations = process.env.AI533_SOURCE_ONLY === '1' ? [['source-check', false, false, true]] : [
        ['current', false, false, false], ['cached-sun', true, false, false],
        ['baked-indirect', true, false, true], ['baked-both', true, true, true], ['baked-direct', true, true, false]
    ];
    for (const [name, shadows, direct, indirect] of configurations) {
        console.log('AI533 configuration: ' + name);
        await page.evaluate(async ({ shadows, direct, indirect }) => {
            const engine = window.__busSim.engine;
            let complete = false;
            const change = engine.setBakedLightingSettings({ shadows: { enabled: shadows, dynamicResolution: 'high' }, receivers: { direct, indirect, debug: 'final' } })
                .finally(() => { complete = true; });
            while (!complete) {
                engine.updateFrame(0);
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            await change;
            for (let i = 0; i < 5; i++) { engine.updateFrame(0); await new Promise(requestAnimationFrame); }
        }, { shadows, direct, indirect });
        if (direct || indirect) {
            const manifest = await page.evaluate(() => window.__ai533LiveSource ?? null);
            await writeFile(path.join(artifactRoot, 'live-source-manifest.json'), JSON.stringify(manifest));
            if (sourceOnly) { expect(manifest?.objects.length).toBeGreaterThan(0); return; }
        }
        const measurements = await page.evaluate(async () => {
            const engine = window.__busSim.engine;
            const gl = engine.renderer.getContext();
            const extension = gl.getExtension('WEBGL_debug_renderer_info');
            const frameTimes = [];
            for (let i = 0; i < 40; i++) {
                const before = performance.now(); engine.updateFrame(0); gl.finish();
                if (i >= 10) frameTimes.push(performance.now() - before);
                await new Promise(requestAnimationFrame);
            }
            frameTimes.sort((a, b) => a - b);
            return { diagnostics: engine.getBakedLightingDebugInfo(), frameTimes, medianMs: (frameTimes[14] + frameTimes[15]) / 2,
                draw: { ...engine.renderer.info.render }, memory: { ...engine.renderer.info.memory },
                gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
        });
        results.push({ name, ...measurements });
        await writeFile(path.join(artifactRoot, 'city-measurements.json'), JSON.stringify(results, null, 2));
        if (direct || indirect) {
            expect(measurements.diagnostics.receiverLightmaps.state, JSON.stringify(measurements.diagnostics.receiverLightmaps)).toBe('active');
            expect(measurements.diagnostics.receiverLightmaps.effective).toEqual({ direct, indirect });
        }
        await page.screenshot({ path: path.join(artifactRoot, `${name}.png`) });
        await page.evaluate(() => {
            const { engine, sm } = window.__busSim;
            window.__ai533Camera = { position: engine.camera.position.clone(), quaternion: engine.camera.quaternion.clone(), update: sm.current.update };
            for (const id of ['hud-game', 'ui-perf-bar']) document.getElementById(id).style.visibility = 'hidden';
            sm.current.update = () => engine.context.city.update(engine);
            engine.camera.position.set(-20, 85, 90); engine.camera.lookAt(-82, 35, 145);
            engine.camera.updateMatrixWorld(true);
            for (let i = 0; i < 5; i++) engine.updateFrame(0);
        });
        await page.screenshot({ path: path.join(artifactRoot, `${name}-roofs.png`) });
        if (name === 'baked-both') {
            for (const debug of ['unmapped', 'indirect', 'difference']) {
                await page.evaluate(async (debug) => {
                    const engine = window.__busSim.engine;
                    await engine.setBakedLightingSettings({ ...engine.bakedLightingSettings, receivers: { direct: true, indirect: true, debug } });
                    for (let i = 0; i < 5; i++) engine.updateFrame(0);
                }, debug);
                await page.screenshot({ path: path.join(artifactRoot, `debug-${debug}-roofs.png`) });
            }
            await page.evaluate(async () => {
                const engine = window.__busSim.engine;
                await engine.setBakedLightingSettings({ ...engine.bakedLightingSettings, receivers: { direct: true, indirect: true, debug: 'final' } });
                engine.updateFrame(0);
            });
        }
        await page.evaluate(() => {
            const { engine, sm } = window.__busSim, saved = window.__ai533Camera;
            engine.camera.position.copy(saved.position); engine.camera.quaternion.copy(saved.quaternion);
            engine.camera.updateMatrixWorld(true); sm.current.update = saved.update;
            for (const id of ['hud-game', 'ui-perf-bar']) document.getElementById(id).style.visibility = '';
        });
    }
    expect(errors).toEqual([]);
    const stale = await page.evaluate(() => {
        const engine = window.__busSim.engine;
        const object = engine._bakedLighting.receivers.bindings.geometries[0].object;
        object.position.x += 1; object.updateWorldMatrix(true, true); engine.updateFrame(0);
        const result = engine.getBakedLightingDebugInfo().receiverLightmaps;
        object.position.x -= 1; object.updateWorldMatrix(true, true);
        return result;
    });
    expect(stale.state).toBe('fallback');
    expect(stale.reason).toBe('source_or_profile_changed');
    await page.evaluate(async () => {
        const engine = window.__busSim.engine;
        await engine.setBakedLightingSettings({ shadows: { enabled: false }, receivers: { direct: false, indirect: false } });
        engine.updateFrame(0);
    });
    const final = await page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo());
    expect(final.receiverLightmaps.effective).toEqual({ direct: false, indirect: false });
    expect(final.receiverLightmaps.channels).toEqual({});
});
