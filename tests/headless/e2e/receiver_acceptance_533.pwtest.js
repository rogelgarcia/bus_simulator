// Records installed-lighting route acceptance without changing the engine or installed publications.
import test, { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome, args: ['--use-angle=d3d11'] } });
const root = path.resolve('tests/artifacts/screens/illumination_533/acceptance');
const modes = [
    { id: 'current', shadows: false },
    { id: 'cached-sun', shadows: true },
    { id: 'original-both', shadows: true, direct: true, indirect: true, historical: true },
    { id: 'enhanced-direct', shadows: true, enhanced: true, direct: true },
    { id: 'enhanced-indirect', shadows: true, enhanced: true, indirect: true },
    { id: 'enhanced-both', shadows: true, enhanced: true, direct: true, indirect: true }
];
const regions = [['open', 0, -216], ['center', 0, 48], ['dense', -120, 216]];
const directions = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]];

test('AI 533 accepted optional lighting: route, channels, memory and moving bus', async ({ page }) => {
    test.setTimeout(900000);
    await mkdir(root, { recursive: true });
    const errors = [], requests = [], measurements = [], route = [];
    page.on('pageerror', error => { errors.push(error.message); console.log('AI533 page error: ' + error.message); });
    page.on('requestfailed', request => console.log('AI533 request failed: ' + request.url() + ' ' + request.failure()?.errorText));
    page.on('console', message => {
        if (message.type() === 'error' && /shader|WebGLProgram|GL_INVALID/i.test(message.text())) errors.push(message.text());
    });
    page.on('request', request => { if (/\.ilpkg(?:\.gz)?(?:$|\?)/.test(request.url())) requests.push(request.url()); });
    await page.setViewportSize({ width: 1280, height: 744 });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({
        shadows: { enabled: false, dynamicResolution: 'high' }, receivers: { enhanced: false, direct: false, indirect: false, linked: false }
    })));
    await page.goto('/?coreTests=0&visibilityMap=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, { timeout: 120000 });
    await page.locator('#btn-start').click();
    await page.waitForFunction(() => window.__busSim.sm.currentName === 'bus_select', null, { timeout: 120000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 120000 });
    const context = await page.evaluate(async () => {
        const { engine: e, sm } = window.__busSim;
        await Promise.all([e.waitForLightingReady(), sm.current.busModel?.userData?.readyPromise,
            sm.current.city?.world?.trees?.readyPromise].filter(Boolean));
        e.stop(); sm.current.gameLoop.paused = true;
        sm.current.update = () => { e.context.city.update(e); e.context.city.updateStaticVisibility(e.camera); };
        e.setViewportSize(1280, 720); e.renderer.setPixelRatio(1); e.renderer.setSize(1280, 720, false);
        e.camera.aspect = 1280 / 720; e.camera.updateProjectionMatrix();
        for (const id of ['hud-game', 'ui-perf-bar']) document.getElementById(id).style.visibility = 'hidden';
        window.acceptance533 = {
            async mode(mode) {
                const started = performance.now(); let done = false;
                const work = e.setBakedLightingSettings({ shadows: { enabled: mode.shadows, dynamicResolution: 'high' },
                    receivers: { enhanced: !!mode.enhanced, direct: !!mode.direct, indirect: !!mode.indirect, debug: 'final', linked: false }
                }).finally(() => done = true);
                for (let frame = 0;; frame++) {
                    e.updateFrame(0); await new Promise(requestAnimationFrame);
                    const d = e.getBakedLightingDebugInfo();
                    if (d.receiverLightmaps.state === 'fallback' && done && mode.historical
                        && /^(direct_receiver_source_mismatch|indirect_irradiance_source_mismatch)(; (direct_receiver_source_mismatch|indirect_irradiance_source_mismatch))*$/.test(d.receiverLightmaps.reason)) break;
                    if (done && d.receiverLightmaps.state === 'fallback') throw new Error('Receiver fallback: ' + d.receiverLightmaps.reason);
                    if (done && mode.shadows && d.status.state === 'fallback') throw new Error('Shadow fallback: ' + JSON.stringify(d.status));
                    if (performance.now() - started > 300000) throw new Error('Mode did not become ready');
                    if (done && frame >= 20 && (!mode.shadows || d.status.effectiveMode === 'baked')
                        && (!(mode.direct || mode.indirect) || d.receiverLightmaps.activationBlend === 1)) break;
                }
                await work; return performance.now() - started;
            },
            camera(x, z, dx, dz) {
                e.camera.fov = 55; e.camera.updateProjectionMatrix();
                e.camera.position.set(x, 3.6831812722, z);
                e.camera.lookAt(x + dx * 20, 3.6831812722 + Math.tan(-9.673 * Math.PI / 180) * 20, z + dz * 20);
                e.camera.updateMatrixWorld(true);
            },
            diagnostics() {
                const d = e.getBakedLightingDebugInfo(), r = d.receiverLightmaps;
                return { shadows: d.status, receivers: { state: r.state, effective: r.effective, reason: r.reason,
                    residentGpuBytes: r.residentGpuBytes, residentCpuBytes: r.residentCpuBytes, channels: r.channels,
                    runtimeCoverage: r.runtimeCoverage, residencyPolicy: r.residencyPolicy },
                    banks: Object.fromEntries(Object.entries(e._bakedLighting.receiverModes).map(([key, bank]) => {
                        const value = bank.getDiagnostics();
                        return [key, { gpuBytes: value.residentGpuBytes, cpuBytes: value.residentCpuBytes }];
                    })), counts: { ...e.renderer.info.memory, programs: e.renderer.info.programs.length } };
            },
            async measure() {
                const gl = e.renderer.getContext(), samples = [], timer = e._gpuFrameTimer;
                for (let frame = 0; frame < 90; frame++) {
                    if (frame === 30) timer?.resetSamples();
                    const start = performance.now(); e.updateFrame(0); gl.finish();
                    if (frame >= 30) samples.push(performance.now() - start);
                    await new Promise(requestAnimationFrame);
                }
                return { samples, gpu: timer?.getSamplesSince(0).map(s => s.ms) ?? [], gpuDiagnostics: timer?.getDiagnostics(),
                    draw: { ...e.renderer.info.render }, diagnostics: this.diagnostics() };
            }
        };
        const gl = e.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { browser: navigator.userAgent, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            lighting: e.lightingSettings, atmosphere: e.atmosphereSettings, shadow: e.shadowSettings, ao: e.ambientOcclusionSettings,
            settings: e.bakedLightingSettings, canvas: [e.renderer.domElement.width, e.renderer.domElement.height],
            pixelRatio: e.renderer.getPixelRatio(), camera: e.camera.position.toArray(), bus: sm.current.busAnchor.position.toArray() };
    });
    expect(requests).toEqual([]);
    const activation = [];
    for (const mode of modes) {
        console.log('AI533 warm ' + mode.id);
        activation.push({ id: mode.id, elapsedMs: await page.evaluate(mode => window.acceptance533.mode(mode), mode),
            diagnostics: await page.evaluate(() => window.acceptance533.diagnostics()) });
        await writeFile(path.join(root, 'activation.json'), JSON.stringify({ context, activation, requests }, null, 2));
    }
    await writeFile(path.join(root, 'activation.json'), JSON.stringify({ context, activation, requests }, null, 2));
    const warmRequests = [...requests];
    for (const [region, x, z] of regions) {
        await page.evaluate(({ x, z }) => window.acceptance533.camera(x, z, 0, -1), { x, z });
        const measuredModes = modes.filter(mode => !mode.historical);
        for (let round = 0; round < 3; round++) for (const mode of round % 2 ? [...measuredModes].reverse() : measuredModes) {
            await page.evaluate(mode => window.acceptance533.mode(mode), mode);
            const value = await page.evaluate(() => window.acceptance533.measure());
            measurements.push({ region, round, mode: mode.id, ...value });
            expect(value.gpuDiagnostics?.disjointCount ?? 0).toBe(0);
            if (mode.direct || mode.indirect) expect(value.diagnostics.receivers.effective).toEqual({ direct: !!mode.direct, indirect: !!mode.indirect });
            if (round === 0) await page.locator('#game-canvas').screenshot({ path: path.join(root, `${region}-${mode.id}.png`) });
            await writeFile(path.join(root, 'measurements.json'), JSON.stringify({ context, measurements }, null, 2));
        }
        for (const [direction, dx, dz] of directions) {
            await page.evaluate(({ x, z, dx, dz }) => window.acceptance533.camera(x, z, dx, dz), { x, z, dx, dz });
            for (const mode of [modes[1], modes[5]]) {
                await page.evaluate(mode => window.acceptance533.mode(mode), mode);
                await page.locator('#game-canvas').screenshot({ path: path.join(root, `${region}-${direction}-${mode.id}.png`) });
                route.push({ region, direction, mode: mode.id, diagnostics: await page.evaluate(() => window.acceptance533.diagnostics()) });
            }
        }
    }
    expect(requests).toEqual(warmRequests);
    await writeFile(path.join(root, 'route.json'), JSON.stringify(route, null, 2));
    const bus = await page.evaluate(async () => {
        const { engine: e, sm } = window.__busSim, anchor = sm.current.busAnchor;
        const original = anchor.position.clone(), values = [];
        let mappedBusMeshes = 0;
        anchor.traverse(o => { if (o.isMesh && o.geometry.hasAttribute('receiverAtlasCoordinate')) mappedBusMeshes++; });
        try {
            for (let i = 0; i < 16; i++) {
                anchor.position.set(-47 + i, original.y, 28); anchor.updateWorldMatrix(true, true);
                e.camera.position.set(-65 + i, 12, 45); e.camera.lookAt(anchor.position); e.camera.updateMatrixWorld(true);
                for (let frame = 0; frame < 3; frame++) { e.updateFrame(0); await new Promise(requestAnimationFrame); }
                const d = e.getIlluminationPipeline().getDiagnostics();
                values.push({ position: anchor.position.toArray(), staticCasters: d.casters,
                    dynamic: d.dynamicShadows, receiverState: e.getBakedLightingDebugInfo().receiverLightmaps.state });
            }
        } finally { anchor.position.copy(original); anchor.updateWorldMatrix(true, true); }
        return { mappedBusMeshes, values };
    });
    await writeFile(path.join(root, 'bus.json'), JSON.stringify(bus, null, 2));
    expect(bus.mappedBusMeshes).toBe(0);
    for (const value of bus.values) {
        expect(value.receiverState).toBe('active');
        expect(value.staticCasters.legacyShadowMapPassDisabled).toBe(true);
        expect(value.dynamic.map.projection.casterIds).toContain('vehicle.player');
        expect(value.dynamic.metrics.drawCalls).toBeGreaterThan(0);
    }
    const counts = [];
    for (let i = 0; i < 4; i++) {
        await page.evaluate(mode => window.acceptance533.mode(mode), modes[0]);
        await page.evaluate(mode => window.acceptance533.mode(mode), modes[5]);
        counts.push(await page.evaluate(() => window.acceptance533.diagnostics().counts));
    }
    expect(new Set(counts.map(value => JSON.stringify(value))).size).toBe(1);
    expect(requests).toEqual(warmRequests);
    expect(errors).toEqual([]);
    await writeFile(path.join(root, 'result.json'), JSON.stringify({ context, counts, requests, errors, frames: measurements.reduce((n, m) => n + m.samples.length, 0) }, null, 2));
});
