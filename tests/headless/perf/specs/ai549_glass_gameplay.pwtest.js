// Matched actual-game control; affected facade workloads are measured in the showcase capture.
import test, { expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { loadBakeConfiguration } from '../../../../tools/baking/Configuration.mjs';

const config = await loadBakeConfiguration(undefined, { requiredPaths: ['browserExecutable'], checkedPaths: ['browserExecutable'] });
const ref = process.env.GLASS_BASELINE_REF;
test.use({ launchOptions: { executablePath: config.browserExecutable, args: ['--enable-precise-memory-info'] } });
test('AI549: matched actual gameplay before and after control', async ({ browser }) => {
    test.skip(!ref, 'Explicit GLASS_BASELINE_REF is required for a historical comparison.');
    test.setTimeout(300000);
    const output = 'tests/artifacts/screens/buildings/burban/ai549/gameplay';
    await fs.mkdir(output, { recursive: true });
    const results = [];
    const files = ['src/app/buildings/window_mesh/WindowMeshSettings.js', 'src/graphics/engine3d/buildings/window_mesh/WindowMeshMaterials.js',
        ...['Burban', 'BGlass', 'terramar'].map(name => `src/graphics/content3d/buildings/configs/${name}.js`)];
    for (const variant of ['before', 'after']) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 744 } }), page = await context.newPage();
        await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({ mode: 'current' })));
        if (variant === 'before') for (const file of files) {
            const body = execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
            await page.route(`**/${file}`, route => route.fulfill({ contentType: 'text/javascript', body }));
        }
        await page.goto('/?coreTests=0');
        await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, { timeout: 120000 });
        await page.locator('#btn-start').click();
        await page.waitForFunction(() => window.__busSim.sm.currentName === 'bus_select', null, { timeout: 120000 });
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.__busSim.sm.currentName === 'game_mode', null, { timeout: 120000 });
        const result = await page.evaluate(async () => {
            const { engine: e, sm } = window.__busSim;
            await Promise.all([e.waitForLightingReady(), sm.current.busModel?.userData?.readyPromise, sm.current.city?.world?.trees?.readyPromise].filter(Boolean));
            e.stop(); sm.current.gameLoop.paused = true;
            const city = sm.current.city;
            sm.current.update = () => { city.update(e); city.updateStaticVisibility(e.camera); };
            sm.current.busAnchor.position.set(0, 0, 0); sm.current.busAnchor.rotation.set(0, 0, 0);
            e.setViewportSize(1280, 720); e.renderer.setPixelRatio(1); e.renderer.setSize(1280, 720, false);
            e.camera.position.set(30, 12, 95); e.camera.lookAt(30, 6, 125); e.camera.aspect = 1280 / 720; e.camera.updateProjectionMatrix();
            const deadline = performance.now() + 90000;
            do {
                e.updateFrame(0); await new Promise(requestAnimationFrame);
                if (performance.now() > deadline) throw new Error(JSON.stringify(e.getBakedLightingDebugInfo()));
            } while (e._bakedLighting.shouldHoldView());
            for (const el of document.querySelectorAll('#hud-game,#ui-perf-bar')) el.style.visibility = 'hidden';
            const frames = [], submit = [];
            for (let i = 0; i < 120; i++) {
                const start = performance.now(); e.updateFrame(0); const cpu = performance.now() - start;
                e.renderer.getContext().finish(); const frame = performance.now() - start;
                if (i >= 30) { frames.push(frame); submit.push(cpu); }
                await new Promise(requestAnimationFrame);
            }
            const stat = values => ({ mean: values.reduce((a, b) => a + b, 0) / values.length,
                p95: values.slice().sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1] });
            let affectedMaterials = 0;
            e.scene.traverse(o => { for (const m of [].concat(o.material || [])) if (m.userData?.architecturalGlass) affectedMaterials++; });
            return { completedFrameMs: stat(frames), cpuSubmitMs: stat(submit), warmup: 30, samples: 90, frames, submit,
                render: { ...e.renderer.info.render }, memory: { ...e.renderer.info.memory, jsHeapBytes: performance.memory?.usedJSHeapSize },
                settings: { lighting: e.lightingSettings, shadows: e.shadowSettings, ao: e.ambientOcclusionSettings, aa: e.antiAliasingSettings,
                    bloom: e.bloomSettings, grading: e.colorGradingSettings }, camera: e.camera.position.toArray(), baked: e.getBakedLightingDebugInfo(), affectedMaterials };
        });
        expect(result.render.triangles).toBeGreaterThan(1000);
        await page.locator('canvas').first().screenshot({ path: `${output}/${variant}.png` });
        results.push({ variant, ...result });
        await context.close();
    }
    expect(results[0].settings).toEqual(results[1].settings);
    expect(results[0].camera).toEqual(results[1].camera);
    await fs.writeFile(`${output}/report.json`, JSON.stringify({ baseline: ref, results }, null, 2));
});
