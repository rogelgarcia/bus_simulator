import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome, args: ['--use-angle=d3d11'] } });
const root = path.resolve('tests/artifacts/screens/illumination_548');

test('AI 548: controlled illumination benchmark and visual comparisons', async ({ page }) => {
    test.setTimeout(1_800_000);
    await mkdir(root, { recursive: true });
    const variant = process.env.AI548_VARIANT ?? 'baseline';
    const smoke = process.env.AI548_SMOKE === '1';
    let fixture = variant === 'same-coverage' ? path.join(root, 'same-coverage') : null;
    if (process.env.AI548_UNPUBLISHED === '1') {
        const latest = JSON.parse(await readFile(path.join(root, 'bake/latest.json')));
        fixture = path.join(root, 'bake', latest.directory);
    }
    if (fixture) await page.route('**/assets/baked_lighting/receivers/enhanced/**', (route) => route.fulfill({ status: 302,
        headers: { location: '/' + path.relative(process.cwd(), path.join(fixture, path.basename(new URL(route.request().url()).pathname))).replaceAll('\\', '/') } }));
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.text().startsWith('AI548_PHASE')) console.log(message.text());
        if (message.type() === 'error' && /shader|WebGLProgram/i.test(message.text())) errors.push(message.text());
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({
        shadows: { enabled: false, dynamicResolution: 'high' }, receivers: { direct: false, indirect: false }
    })));
    await page.goto('/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 120_000 });
    const context = await page.evaluate(async () => {
        const { engine, sm } = window.__busSim; engine.stop();
        if (sm.current.gameLoop) sm.current.gameLoop.paused = true;
        await engine.waitForLightingReady();
        for (const id of ['hud-game', 'ui-perf-bar']) document.getElementById(id).style.visibility = 'hidden';
        const gl = engine.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { benchmarkContract: 'ai548.engine-timer.uniform-rebind.v2', camera: engine.camera.position.toArray(), lighting: engine.lightingSettings,
            gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            gpuTimerAvailable: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
            browser: navigator.userAgent };
    });
    const modes = [ ['current', false, false, false], ['cached-sun', true, false, false],
        ['indirect', true, false, true], ['combined', true, true, true], ['direct', true, true, false] ];
    if (process.env.AI548_MODE) modes.splice(0, modes.length, ...modes.filter((v) => v[0] === process.env.AI548_MODE));
    const results = [];
    for (let run = 0; run < (smoke ? 1 : 3); run++) for (const [name, shadows, direct, indirect] of run % 2 ? [...modes].reverse() : modes) {
        console.log(`AI548 ${variant} run ${run + 1} ${name}`);
        const measurement = await page.evaluate(async ({ shadows, direct, indirect, enhanced, smoke }) => {
            const engine = window.__busSim.engine;
            const began = performance.now(); let complete = false;
            let observedHeapPeakBytes = performance.memory?.usedJSHeapSize ?? null;
            const change = engine.setBakedLightingSettings({ shadows: { enabled: shadows, dynamicResolution: 'high' },
                receivers: { direct, indirect, enhanced, debug: 'final' } }).finally(() => { complete = true; });
            let phase;
            while (!complete) {
                const status = engine._bakedLighting.receivers.status;
                const next = status.state + ':' + status.reason;
                if (next !== phase) { console.log('AI548_PHASE ' + next); phase = next; }
                engine.updateFrame(0); await new Promise((resolve) => setTimeout(resolve, 50));
                if (performance.memory) observedHeapPeakBytes = Math.max(observedHeapPeakBytes, performance.memory.usedJSHeapSize);
            }
            await change; engine.updateFrame(0);
            const activationMs = performance.now() - began;
            const gl = engine.renderer.getContext();
            const frames = [], intervals = [], validation = [], synchronized = [];
            const timer = engine._gpuFrameTimer;
            let previousRaf = performance.now();
            for (let i = 0; i < (smoke ? 35 : 330); i++) {
                if (i === 30) timer?.resetSamples();
                const start = performance.now(); engine.updateFrame(0); const cpu = performance.now() - start;
                if (i >= 30) frames.push(cpu);
                const raf = await new Promise(requestAnimationFrame);
                if (i >= 30) intervals.push(raf - previousRaf);
                previousRaf = raf;
            }
            for (let i = 0; i < 30; i++) {
                const runtime = engine._bakedLighting.receivers;
                const start = performance.now(); runtime.frameBegin(); validation.push(performance.now() - start);
                const before = performance.now(); engine.updateFrame(0); gl.finish(); synchronized.push(performance.now() - before);
                await new Promise(requestAnimationFrame);
            }
            timer?.poll();
            const gpuDiagnostics = timer?.getDiagnostics();
            const disjoint = gpuDiagnostics?.disjointCount > 0;
            const gpu = timer?.getSamplesSince(0).filter((sample) => sample.submissionSequence <= (smoke ? 5 : 300)).map((sample) => sample.ms) ?? [];
            return { frames, intervals, validation, synchronized, gpu, gpuDiagnostics, disjoint, activationMs, observedHeapPeakBytes,
                diagnostics: engine.getBakedLightingDebugInfo(), draw: { ...engine.renderer.info.render },
                memory: { ...engine.renderer.info.memory }, resources: performance.getEntriesByType('resource')
                    .filter((v) => /receivers|\.hdr|\.png|\.jpg|\.webp/.test(v.name))
                    .map((v) => ({ name: v.name, duration: v.duration, transfer: v.transferSize, start: v.startTime })) };
        }, { shadows, direct, indirect, enhanced: variant !== 'baseline', smoke });
        if (direct || indirect) {
            expect(measurement.diagnostics.receiverLightmaps.state, JSON.stringify(measurement.diagnostics.receiverLightmaps)).toBe('active');
            expect(measurement.diagnostics.receiverLightmaps.effective).toEqual({ direct, indirect });
        }
        if (context.gpuTimerAvailable && !measurement.disjoint) {
            expect(measurement.gpuDiagnostics.disabledReason).toBeNull();
            expect(measurement.gpu.length).toBeGreaterThan(0);
        }
        results.push({ name, run, ...measurement });
        await writeFile(path.join(root, `${variant}${smoke ? '-smoke' : ''}-measurements.json`), JSON.stringify({ context, results, errors }, null, 2));
        if (run === 0) await page.screenshot({ path: path.join(root, `${variant}-${name}.png`) });
    }
    if (process.env.AI548_VISUALS === '1') {
        await page.evaluate(() => {
            const { engine, sm } = window.__busSim;
            window.__ai548SavedUpdate = sm.current.update;
            sm.current.update = () => engine.context.city.update(engine);
        });
        const captures = [];
        const poses = [
            ['ground', [-160, 3, 80], [-172, .3, 96]],
            ['threshold', [-100, 2.5, 5], [-91.6, 3.6, 5]],
            ['overhang', [-131, 38, 140], [-122, 40.4, 145]]
        ];
        for (const [label, position, target] of poses) {
            for (const [mode, direct, indirect, enhanced, debug] of [
                ['live', false, false, true, 'final'], ['legacy', true, true, false, 'final'],
                ['enhanced', true, true, true, 'final'], ['indirect', false, true, true, 'final'],
                ['coverage', true, true, true, 'unmapped'], ['mip', true, true, true, 'mip']
            ]) {
                const capture = await page.evaluate(async ({ position, target, direct, indirect, enhanced, debug }) => {
                    const engine = window.__busSim.engine;
                    engine.camera.position.set(...position); engine.camera.lookAt(...target); engine.camera.updateMatrixWorld(true);
                    await engine.setBakedLightingSettings({ shadows: { enabled: true, dynamicResolution: 'high' },
                        receivers: { direct, indirect, enhanced, debug } });
                    for (let i = 0; i < 30; i++) { engine.updateFrame(0); await new Promise(requestAnimationFrame); }
                    if (direct || indirect) {
                        const info = engine._bakedLighting.receivers.getDiagnostics();
                        if (info.state !== 'active' || info.effective.direct !== direct || info.effective.indirect !== indirect) throw new Error(JSON.stringify(info));
                    }
                    let mappedPixels = null;
                    let surfaceProbes = null;
                    if (debug === 'final' && direct && indirect && enhanced) {
                        const THREE = await import('three'), ray = new THREE.Raycaster();
                        surfaceProbes = [[.12, .48], [.47, .5], [.55, .46], [.7, .5]].map(([x, y]) => {
                            ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), engine.camera);
                            const hits = ray.intersectObject(engine.context.city.group, true).slice(0, 5).map((hit) => ({
                                name: hit.object.name, instance: hit.instanceId, face: hit.faceIndex, distance: hit.distance,
                                point: hit.point.toArray(), material: (Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material).name,
                                visible: (() => { for (let o = hit.object; o; o = o.parent) if (!o.visible) return false; return true; })(),
                                colorWrite: (Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material).colorWrite,
                                mappedObject: engine._bakedLighting.receivers.bindings.geometries.some((entry) => entry.object === hit.object) }));
                            return { screen: [x, y], hits };
                        });
                    }
                    if (debug === 'unmapped') {
                        engine.updateFrame(0);
                        const gl = engine.renderer.getContext(), pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                        mappedPixels = 0;
                        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > 180 && pixels[i + 1] - pixels[i] > 65 && pixels[i + 1] - pixels[i + 2] > 100) mappedPixels++;
                    }
                    let fallbackProbe = null;
                    if (position[1] === 38 && debug === 'final') {
                        const THREE = await import('three'), ray = new THREE.Raycaster();
                        ray.setFromCamera(new THREE.Vector2(.25 * 2 - 1, 1 - .48 * 2), engine.camera);
                        const hit = ray.intersectObject(engine.context.city.group, true).find(({ object }) => {
                            for (let o = object; o; o = o.parent) if (!o.visible) return false;
                            return !Array.isArray(object.material) && object.material.colorWrite;
                        });
                        if (hit) {
                            const material = hit.object.material, properties = engine.renderer.properties.get(material);
                            const attribute = hit.object.geometry.getAttribute('receiverAtlasCoordinate');
                            const uniforms = properties.uniforms ?? {};
                            fallbackProbe = { name: hit.object.name, face: hit.faceIndex, point: hit.point.toArray(),
                                coordinates: attribute ? [hit.face.a, hit.face.b, hit.face.c].map((i) => [attribute.getX(i), attribute.getY(i), attribute.getZ(i), attribute.getW(i)]) : null,
                                uniforms: Object.fromEntries(['ambientLightColor', 'hemisphereLights', 'envMapIntensity', 'receiverIndirectEnabled', 'receiverDirectEnabled', 'receiverAtlasEnabled'].map((key) => [key, uniforms[key]?.value])),
                                shader: engine.renderer.getContext().getShaderSource(properties.currentProgram.fragmentShader) };
                        }
                    }
                    return { position: engine.camera.position.toArray(), mappedPixels, surfaceProbes, fallbackProbe, diagnostics: engine._bakedLighting.receivers.getDiagnostics() };
                }, { position, target, direct, indirect, enhanced, debug });
                expect(capture.position).toEqual(position);
                if (debug === 'unmapped') expect(capture.mappedPixels, label + ' should include mapped pixels').toBeGreaterThan(0);
                captures.push({ label, mode, ...capture });
                await page.screenshot({ path: path.join(root, `${label}-${mode}.png`) });
            }
        }
        await writeFile(path.join(root, 'visual-captures.json'), JSON.stringify(captures, null, 2));
        if (process.env.AI548_POST_COMPARE === '1') {
            await page.evaluate(async () => {
                const engine = window.__busSim.engine;
                await engine.setBakedLightingSettings({ shadows: { enabled: true, dynamicResolution: 'high' },
                    receivers: { direct: false, indirect: true, enhanced: true, debug: 'final' } });
                window.__ai548Post = engine._post.pipeline; engine._post.pipeline = null;
                for (let i = 0; i < 5; i++) engine.updateFrame(0);
            });
            await page.screenshot({ path: path.join(root, 'overhang-no-post.png') });
            await page.evaluate(() => {
                const engine = window.__busSim.engine;
                engine._post.pipeline = window.__ai548Post;
                window.__ai548Ao = engine.ambientOcclusionSettings;
                engine.setAmbientOcclusionSettings({ ...engine.ambientOcclusionSettings, mode: 'off' });
                for (let i = 0; i < 5; i++) engine.updateFrame(0);
            });
            await page.screenshot({ path: path.join(root, 'overhang-no-ao.png') });
            await page.evaluate(() => window.__busSim.engine.setAmbientOcclusionSettings(window.__ai548Ao));
        }
        await page.evaluate(() => { window.__busSim.sm.current.update = window.__ai548SavedUpdate; });
    }
    expect(errors).toEqual([]);
});
