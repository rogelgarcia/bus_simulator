// Full-game regression for startup blending and repeated resident bank switches.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });

test('Receiver banks stay bounded across repeated gameplay toggles', async ({ page }) => {
    test.setTimeout(900_000);
    const root = path.resolve('tests/artifacts/screens/illumination_optimization/gameplay');
    await mkdir(root, { recursive: true });
    if (process.env.RECEIVER_BENCHMARK === '1') {
        const module = await readFile('src/graphics/illumination/receiver_lightmaps/EnhancedReceiverRenderOptimizations.js', 'utf8');
        await page.route('**/EnhancedReceiverRenderOptimizations.js', (route) => route.fulfill({ contentType: 'text/javascript',
            body: module.replace('const pipeline = engine._post?.pipeline;', 'if (globalThis.__receiverSkipPassOptimizations) return () => {};\n    const pipeline = engine._post?.pipeline;') }));
    }
    if (process.env.RECEIVER_UNPUBLISHED === '1') {
        const bakeRoot = path.resolve('tests/artifacts/screens/illumination_optimization/bake');
        const latest = JSON.parse(await readFile(path.join(bakeRoot, 'latest.json')));
        await page.route('**/assets/baked_lighting/receivers/enhanced/**', (route) => route.fulfill({ status: 302,
            headers: { location: '/' + path.relative(process.cwd(), path.join(bakeRoot, latest.directory,
                path.basename(new URL(route.request().url()).pathname))).replaceAll('\\', '/') } }));
    }
    const errors = [], requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' && /shader|WebGLProgram/i.test(message.text())) errors.push(message.text()); });
    page.on('request', (request) => { if (/(direct_receiver|indirect_irradiance)\.ilpkg\.gz/.test(request.url())) requests.push(request.url()); });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({
        shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { direct: false, indirect: false }
    })));
    await page.goto('/?coreTests=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, { timeout: 120_000 });
    await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'bus_select');
    await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 120_000 });
    await page.evaluate(async () => {
        const { engine: e, sm } = window.__busSim; await e.waitForLightingReady();
        for (let i = 0; i < 120; i++) await new Promise(requestAnimationFrame);
        e.stop(); if (sm.current.gameLoop) sm.current.gameLoop.paused = true;
        sm.current.update = () => { e.context.city.update(e); e.context.city.updateStaticVisibility(e.camera); };
        e.camera.position.set(-46.118720804550826, 9.29357861608618, 5.5516724888548845);
        e.camera.quaternion.set(-.00003949521869236823, .986029183823861, .16657248400840646, .00023379274484623387);
        e.camera.updateMatrixWorld(true);
        for (const id of ['hud-game', 'ui-perf-bar']) document.getElementById(id).style.visibility = 'hidden';
        window.__receiverChange = async (enhanced, on = true) => {
            let done = false;
            const work = e.setBakedLightingSettings({ shadows: { enabled: true, dynamicResolution: 'high' },
                receivers: { enhanced, direct: on, indirect: on, debug: 'final' } }).finally(() => done = true);
            const blends = [];
            do {
                e.updateFrame(0);
                const info = e.getBakedLightingDebugInfo().receiverLightmaps;
                const selected = enhanced ? info.implementation === 'AI548' : info.implementation !== 'AI548';
                if (done && on && selected && info.state === 'fallback') throw new Error(JSON.stringify(info));
                if (selected && info.state === 'active') blends.push(info.activationBlend);
                await new Promise(requestAnimationFrame);
            } while (!done || (on && blends.at(-1) !== 1));
            await work;
            for (let i = 0; i < 8; i++) { e.updateFrame(0); await new Promise(requestAnimationFrame); }
            return { blends, programs: e.renderer.info.programs.length, memory: { ...e.renderer.info.memory },
                draw: { ...e.renderer.info.render }, info: e.getBakedLightingDebugInfo().receiverLightmaps };
        };
        e.updateFrame(0);
    });
    await page.screenshot({ path: path.join(root, 'live.png') });
    const coldOriginal = await page.evaluate(() => window.__receiverChange(false));
    await page.screenshot({ path: path.join(root, 'original.png') });
    const coldEnhanced = await page.evaluate(() => window.__receiverChange(true));
    await page.screenshot({ path: path.join(root, 'enhanced.png') });
    await page.evaluate(() => {
        const e = window.__busSim.engine;
        window.__receiverSavedCamera = { position: e.camera.position.toArray(), quaternion: e.camera.quaternion.toArray() };
        e.camera.position.set(-159, 1.8, 84); e.camera.lookAt(-154.605, .12, 90); e.camera.updateMatrixWorld(true);
    });
    for (const on of [false, true]) {
        await page.evaluate((on) => window.__receiverChange(true, on), on);
        await page.screenshot({ path: path.join(root, on ? 'curb-enhanced.png' : 'curb-live.png') });
    }
    await page.evaluate(() => {
        const e = window.__busSim.engine, saved = window.__receiverSavedCamera;
        e.camera.position.fromArray(saved.position); e.camera.quaternion.fromArray(saved.quaternion); e.camera.updateMatrixWorld(true); e.updateFrame(0);
    });
    await page.evaluate(async () => { await window.__receiverChange(false); await window.__receiverChange(true); });
    const residentRequests = [...requests], cycles = [];
    for (let cycle = 0; cycle < 4; cycle++) for (const enhanced of [false, true]) {
        const off = await page.evaluate((enhanced) => window.__receiverChange(enhanced, false), enhanced);
        const on = await page.evaluate((enhanced) => window.__receiverChange(enhanced), enhanced);
        cycles.push({ cycle, enhanced, off, on });
    }
    await writeFile(path.join(root, 'result.json'), JSON.stringify({ coldOriginal, coldEnhanced, cycles, requests, errors }, null, 2));
    expect(errors).toEqual([]);
    for (const cold of [coldOriginal, coldEnhanced]) {
        expect(cold.info.state).toBe('active');
        expect(cold.info.effective).toEqual({ direct: true, indirect: true });
        expect(cold.blends.some((value) => value > 0 && value < 1)).toBe(true);
        for (let i = 1; i < cold.blends.length; i++) expect(cold.blends[i]).toBeGreaterThanOrEqual(cold.blends[i - 1]);
    }
    expect(requests).toEqual(residentRequests);
    const warmed = cycles[0].on.programs;
    for (const item of cycles) {
        expect(item.off.programs).toBe(warmed); expect(item.on.programs).toBe(warmed);
        expect(item.off.info.reason).toBe('disabled_cached');
        expect(item.on.info.state).toBe('active'); expect(item.on.info.effective).toEqual({ direct: true, indirect: true });
        expect(item.on.blends.every((value) => value === 1)).toBe(true);
        const first = cycles.find((value) => value.enhanced === item.enhanced);
        expect(item.on.memory).toEqual(first.on.memory); expect(item.off.memory).toEqual(first.off.memory);
    }
    if (process.env.RECEIVER_BENCHMARK === '1') {
        await page.setViewportSize({ width: 3520, height: 1624 });
        const measurements = [];
        for (const optimized of [false, true, true, false, true, false, false, true]) {
            console.log('RECEIVER PASS COST ' + measurements.length + ' optimized=' + optimized);
            const measurement = await page.evaluate(async (optimized) => {
                globalThis.__receiverSkipPassOptimizations = !optimized;
                await window.__receiverChange(true, false); await window.__receiverChange(true);
                const e = window.__busSim.engine, timer = e._gpuFrameTimer, cpu = [];
                for (let i = 0; i < 20; i++) { e.updateFrame(0); await new Promise(requestAnimationFrame); }
                timer.resetSamples();
                for (let i = 0; i < 222; i++) {
                    const started = performance.now(); e.updateFrame(0);
                    if (i < 210) cpu.push(performance.now() - started);
                    await new Promise(requestAnimationFrame);
                }
                timer.poll();
                e.updateFrame(0);
                const gl = e.renderer.getContext(), pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const imageHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))).map((v) => v.toString(16).padStart(2, '0')).join('');
                return { optimized, cpu, gpu: timer.getSamplesSince(0).filter((sample) => sample.submissionSequence <= 210).map((sample) => sample.ms),
                    timer: timer.getDiagnostics(), imageHash, draw: { ...e.renderer.info.render }, info: e.getBakedLightingDebugInfo().receiverLightmaps };
            }, optimized);
            measurements.push(measurement);
            await writeFile(path.join(root, 'pass-benchmark.json'), JSON.stringify({ measurements, errors }, null, 2));
            expect(measurement.info.state).toBe('active'); expect(measurement.gpu.length).toBeGreaterThan(0);
            expect(measurement.timer.disjointCount).toBe(0);
            expect(measurement.imageHash).toBe(measurements[0].imageHash);
        }
        expect(requests).toEqual(residentRequests);
    }
});
