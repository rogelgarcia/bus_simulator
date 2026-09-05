// Captures isolated illumination channels and frame costs at fixed gameplay cameras.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });
test('Receiver illumination: fixed-camera curb lighting and runtime comparison', async ({ page }) => {
    test.setTimeout(1_800_000);
    const root = path.resolve('tests/artifacts/screens/illumination_repair', process.env.REPAIR_RUN ?? 'before');
    await mkdir(root, { recursive: true });
    if (process.env.REPAIR_UNPUBLISHED === '1') {
        const bakeRoot = path.resolve('tests/artifacts/screens/illumination_repair/bake');
        const latest = JSON.parse(await readFile(path.join(bakeRoot, 'latest.json')));
        await page.route('**/assets/baked_lighting/receivers/enhanced/**', (route) => route.fulfill({ status: 302,
            headers: { location: '/' + path.relative(process.cwd(), path.join(bakeRoot, latest.directory,
                path.basename(new URL(route.request().url()).pathname))).replaceAll('\\', '/') } }));
    }
    const errors = [], mapRequests = [];
    page.on('request', (request) => {
        if (/(direct_receiver|indirect_irradiance)\.ilpkg\.gz/.test(request.url())) mapRequests.push(request.url());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error' && /shader|WebGLProgram/i.test(message.text())) errors.push(message.text());
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({
        shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { direct: false, indirect: false }
    })));
    await page.goto('/?coreTests=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, { timeout: 120_000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'bus_select');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 120_000 });
    const context = await page.evaluate(async () => {
        const { engine, sm } = window.__busSim; engine.stop();
        await engine.waitForLightingReady();
        if (sm.current.gameLoop) sm.current.gameLoop.paused = true;
        sm.current.update = () => engine.context.city.update(engine);
        window.__repairCamera = { position: engine.camera.position.toArray(), quaternion: engine.camera.quaternion.toArray() };
        engine.camera.position.set(-159, 1.8, 84); engine.camera.lookAt(-154.605, .12, 90); engine.camera.updateMatrixWorld(true);
        for (const id of ['hud-game', 'ui-perf-bar']) document.getElementById(id).style.visibility = 'hidden';
        const gl = engine.renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
        return { browser: navigator.userAgent,
            gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            lighting: engine.lightingSettings, gameplayCamera: window.__repairCamera };
    });
    const results = [];
    for (const [name, enhanced, direct, indirect, debug] of [
        ['legacy', false, true, true, 'final'], ['enhanced', true, true, true, 'final'],
        ['indirect', true, false, true, 'final'], ['direct', true, true, false, 'final'],
        ['live', true, false, false, 'final'], ['coverage', true, true, true, 'unmapped'],
        ['indirect-map', true, true, true, 'indirect'], ['direct-map', true, true, true, 'direct']
    ]) {
        console.log('REPAIR ' + name);
        const result = await page.evaluate(async ({ enhanced, direct, indirect, debug }) => {
            const engine = window.__busSim.engine;
            let complete = false;
            const change = engine.setBakedLightingSettings({ shadows: { enabled: true, dynamicResolution: 'high' },
                receivers: { enhanced, direct, indirect, debug } }).finally(() => { complete = true; });
            while (!complete) { engine.updateFrame(0); await new Promise((resolve) => setTimeout(resolve, 50)); }
            await change;
            for (let i = 0; i < 30; i++) { engine.updateFrame(0); await new Promise(requestAnimationFrame); }
            const cpu = [], validation = [];
            for (let i = 0; i < 100; i++) {
                const start = performance.now(); engine.updateFrame(0); cpu.push(performance.now() - start);
                await new Promise(requestAnimationFrame);
            }
            for (let i = 0; i < 50; i++) {
                const start = performance.now(); engine._bakedLighting.receivers.frameBegin(); validation.push(performance.now() - start);
            }
            engine.updateFrame(0);
            return { camera: engine.camera.position.toArray(), cpu, validation,
                diagnostics: engine.getBakedLightingDebugInfo(), draw: { ...engine.renderer.info.render } };
        }, { enhanced, direct, indirect, debug });
        results.push({ name, ...result });
        await writeFile(path.join(root, 'result.json'), JSON.stringify({ context, results, errors }, null, 2));
        if (direct || indirect) {
            expect(result.diagnostics.receiverLightmaps.state).toBe('active');
            expect(result.diagnostics.receiverLightmaps.effective).toEqual({ direct, indirect });
        }
        await page.screenshot({ path: path.join(root, name + '.png') });
    }
    if (process.env.REPAIR_BENCHMARK === '1') {
        const residentRequests = [...mapRequests];
        await page.setViewportSize({ width: 3520, height: 1624 });
        await page.evaluate(() => {
            const camera = window.__busSim.engine.camera, saved = window.__repairCamera;
            camera.position.fromArray(saved.position); camera.quaternion.fromArray(saved.quaternion); camera.updateMatrixWorld(true);
        });
        const measurements = [];
        for (let run = 0; run < 4; run++) for (const enhanced of run % 2 ? [true, false] : [false, true]) {
            console.log('REPAIR BENCHMARK ' + run + ' ' + (enhanced ? 'enhanced' : 'original'));
            const measurement = await page.evaluate(async (enhanced) => {
                const engine = window.__busSim.engine, timer = engine._gpuFrameTimer;
                const start = performance.now();
                await engine.setBakedLightingSettings({ shadows: { enabled: true, dynamicResolution: 'high' },
                    receivers: { enhanced, direct: true, indirect: true, debug: 'final' } });
                const activationMs = performance.now() - start;
                const cpu = [], intervals = [], validation = [];
                let previous = performance.now();
                for (let frame = 0; frame < 330; frame++) {
                    if (frame === 30) timer?.resetSamples();
                    const before = performance.now(); engine.updateFrame(0);
                    if (frame >= 30) cpu.push(performance.now() - before);
                    const raf = await new Promise(requestAnimationFrame);
                    if (frame >= 30) intervals.push(raf - previous);
                    previous = raf;
                }
                for (let frame = 0; frame < 30; frame++) {
                    const before = performance.now(); engine._bakedLighting.receivers.frameBegin();
                    validation.push(performance.now() - before);
                    engine.updateFrame(0); await new Promise(requestAnimationFrame);
                }
                timer?.poll();
                return { cpu, intervals, validation, activationMs,
                    gpu: timer?.getSamplesSince(0).filter((s) => s.submissionSequence <= 300).map((s) => s.ms) ?? [],
                    gpuDiagnostics: timer?.getDiagnostics(), camera: engine.camera.position.toArray(),
                    viewport: [innerWidth, innerHeight], pixelRatio: engine.renderer.getPixelRatio(),
                    draw: { ...engine.renderer.info.render }, diagnostics: engine.getBakedLightingDebugInfo() };
            }, enhanced);
            measurements.push({ run, enhanced, ...measurement });
            await writeFile(path.join(root, 'benchmark.json'), JSON.stringify({ context, measurements, errors }, null, 2));
            expect(measurement.diagnostics.receiverLightmaps.state).toBe('active');
            expect(measurement.diagnostics.receiverLightmaps.effective).toEqual({ direct: true, indirect: true });
            expect(measurement.gpu.length).toBeGreaterThan(0);
            expect(measurement.gpuDiagnostics.disjointCount).toBe(0);
            expect(mapRequests, 'Switching compatible cached implementations must not fetch their maps again').toEqual(residentRequests);
            if (run === 0) await page.screenshot({ path: path.join(root, enhanced ? 'wide-enhanced.png' : 'wide-original.png') });
        }
    }
    expect(errors).toEqual([]);
});
