// Measures ordinary garage entry through the first visible baked frames, without pre-driving.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { decodeFrameRecording, recordingFramePose } from '../../../src/app/gameplay/recording/FrameRecording.js';
import { startBakedGpuTelemetry } from '../harness/BakedGpuTelemetry.js';

test.use({ video: 'off', trace: 'off', deviceScaleFactor: 2 });

test('Baked startup: garage transition, preparation and first visible frames', async ({ page }) => {
    test.skip(!process.env.BAKED_STARTUP_INPUT, 'Set BAKED_STARTUP_INPUT to the recorded startup.');
    test.setTimeout(360_000);
    const steadyFrames = Number(process.env.BAKED_STARTUP_STEADY_FRAMES ?? 180);
    if (!Number.isInteger(steadyFrames) || steadyFrames < 180 || steadyFrames > 5000) throw new Error('Invalid settled sample length');
    const recording = await decodeFrameRecording(await readFile(process.env.BAKED_STARTUP_INPUT, 'utf8'));
    const c = recording.columns, pose = recordingFramePose(recording, 0);
    const name = process.env.BAKED_STARTUP_NAME || 'diagnostic';
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid artifact name');
    const output = `tests/artifacts/screens/ai574_baked_startup/${name}`;
    await mkdir(output, { recursive: true });
    const telemetryStream = process.env.BAKED_STARTUP_GPU_TELEMETRY === '1'
        ? createWriteStream(`${output}/gpu-telemetry.jsonl`) : null;
    const telemetryWritten = telemetryStream ? finished(telemetryStream) : null;
    telemetryWritten?.catch(() => {});
    const telemetry = telemetryStream ? startBakedGpuTelemetry({ onRow: row => telemetryStream.write(JSON.stringify(row) + '\n') }) : null;
    let telemetryFinished;
    const finishTelemetry = () => telemetryFinished ??= telemetry?.stop().then(async data => {
        telemetryStream.end(); await telemetryWritten;
        await writeFile(`${output}/gpu-telemetry.json`, JSON.stringify(data));
        return data;
    });
    page.once('close', finishTelemetry);
    if (process.env.BAKED_STARTUP_BASELINE === '1') {
        const snapshot = process.env.BAKED_STARTUP_BASELINE_SNAPSHOT || 'before-src';
        if (!/^[a-zA-Z0-9_-]+$/.test(snapshot)) throw new Error('Invalid baseline snapshot');
        const root = `tests/artifacts/screens/ai574_baked_startup/${snapshot}/`;
        const files = JSON.parse(await readFile(root + 'files.json', 'utf8'));
        await page.context().route('**/src/**', async route => {
            const file = new URL(route.request().url()).pathname.slice(1);
            if (!files.includes(file)) return route.continue();
            return route.fulfill({ body: await readFile(root + file), contentType: file.endsWith('.js') ? 'text/javascript' : 'text/plain' });
        });
    }
    const errors = [], responses = new Map();
    const shaderWarnings=[];
    page.on('console',message=>{if(/X3595|X4000|VALIDATE_STATUS|Shader Error/.test(message.text()))shaderWarnings.push(message.text());});
    page.on('pageerror', error => { errors.push(error.message); console.log(error.message); });
    page.context().on('response', response => {
        const path = new URL(response.url()).pathname;
        if (path.startsWith('/src/') && /\.(js|glsl)$/.test(path)) responses.set(path,
            response.body().then(body => ({ path, sha256: createHash('sha256').update(body).digest('hex') })));
    });
    await page.setViewportSize({ width: c.width[0] / 2, height: c.height[0] / 2 + 48 });
    await page.goto('/?coreTests=0&debug=true');
    await page.waitForFunction(() => !!window.__busSim, null, { timeout: 60_000 });
    await page.evaluate(() => window.__busSim.sm.go('bus_select'));
    await page.waitForFunction(() => !!window.__busSim.sm.current.showcase, null, { timeout: 60_000 });
    await page.evaluate(async pose => {
        const { engine, sm } = window.__busSim;
        await sm.current.showcase.bus.userData.readyPromise;
        await engine.waitForLightingReady();
        const url = new URL(location.href); url.searchParams.set('gameplayPose', JSON.stringify(pose));
        history.replaceState(null, '', url);
    }, pose);
    const profiler = process.env.BAKED_STARTUP_PROFILE === '1' ? await page.context().newCDPSession(page) : null;
    if (profiler) { await profiler.send('Profiler.enable'); await profiler.send('Profiler.start'); }
    const memorySamples = [];
    const memorySession = process.env.BAKED_STARTUP_MEMORY === '1' ? await page.context().newCDPSession(page) : null;
    let memorySampling = !!memorySession;
    page.once('close', () => { memorySampling = false; });
    const memoryTask = (async () => {
        while (memorySampling) {
            try { memorySamples.push({ time: Date.now(), ...await memorySession.send('Runtime.getHeapUsage') }); }
            catch (error) { if (!page.isClosed()) memorySamples.push({ error: error.message }); break; }
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    })();
    await page.evaluate(async ({ profileShaders, profileUniforms }) => {
      window.startBakedStartupCapture = async () => {
        const { captureRecordingSettings } = await import('/src/graphics/gui/gameplay/RecordingSettings.js');
        const { engine: e, sm } = window.__busSim, b = e._bakedLighting;
        const shaderProfiler = profileShaders ? (await import('/tests/headless/harness/BakedShaderProfile.js')).profileBakedShaders(e.renderer) : null;
        const uniformProfiler = profileUniforms ? (await import('/tests/headless/harness/BakedUniformProfile.js')).profileBakedUniforms(e.renderer) : null;
        const frames = [], events = [], samples = [], longTasks = [];
        const start = performance.now(), initialTimer = e._gpuFrameTimer.getDiagnostics();
        let sequence = initialTimer.sampleSequence, previous = '', readyFrames = 0, heldStarted = null, uniformStartFrame = 0;
        const event = (type, detail = {}) => events.push({ time: performance.now() - start, type, ...detail });
        const request = b.requestViewPreparation.bind(b);
        b.requestViewPreparation = (...args) => { event('request', { cause: args[0] ?? 'unspecified', revision: b.viewRevision + 1 }); return request(...args); };
        const prepare = e.prepareLightingView.bind(e);
        e.prepareLightingView = (...args) => {
            const revision = b.viewRevision;
            event('prepare-start', { revision });
            args[0].addEventListener('abort', () => event('prepare-abort', { revision }), { once: true });
            return prepare(...args).then(value => { event('prepare-end', { revision }); return value; }, error => {
                event('prepare-error', { revision, error: error.message }); throw error;
            });
        };
        const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(task => ({ time: task.startTime - start, ms: task.duration }))));
        observer.observe({ type: 'longtask' });
        const drain = () => {
            const fresh = e._gpuFrameTimer.getSamplesSince(sequence); samples.push(...fresh);
            if (fresh.length) sequence = fresh.at(-1).sequence;
        };
        const remove = e.addFrameListener(f => {
            if (sm.currentName !== 'game_mode') return;
            drain();
            const held = b.shouldHoldView(), info = e.renderer.info;
            const state = [b.generation, b.loading, b.ready, b.effectiveMode, b.viewRevision, b.viewPreparing, b.viewDirty, b.receivers.status.reason];
            const key = state.join('|');
            if (key !== previous) { event('state', { state }); previous = key; }
            if (held && b.effectiveMode === 'baked' && heldStarted === null) heldStarted = performance.now() - start;
            frames.push({ frame: f.frameIndex, time: performance.now() - start, cpu: f.cpuMs, interval: f.rawDt * 1000,
                gpuQuerySuppressed: e._gpuFrameTimer.wholeFrameSuppressed === true,
                submission: e._gpuFrameTimer.getDiagnostics().submissionSequence, rendered: f.rendered, held,
                mode: b.effectiveMode, generation: b.generation, calls: info.render.calls, triangles: info.render.triangles,
                geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs.length,
                width: e.renderer.domElement.width, height: e.renderer.domElement.height, hidden: document.hidden });
            if (f.rendered && b.effectiveMode === 'baked' && !held) readyFrames++;
        });
        window.bakedStartup = { frames, events, get readyFrames() { return readyFrames; }, get heldStarted() { return heldStarted; },
            elapsed: () => performance.now() - start, event,
            startUniformProfile() { uniformStartFrame = readyFrames; uniformProfiler?.start(); },
            finish() { drain(); remove(); observer.disconnect(); b.requestViewPreparation = request; e.prepareLightingView = prepare;
                // Restore nested GL instrumentation in reverse installation order.
                const uniformProfile = uniformProfiler ? { frames: readyFrames - uniformStartFrame, rows: uniformProfiler.finish() } : null;
                return { frames, events, samples, longTasks, captureStartNavigationMs: start, timeOriginMs: performance.timeOrigin, shaderProfile: shaderProfiler?.finish(),
                    uniformProfile,
                    initialTimer, finalTimer: e._gpuFrameTimer.getDiagnostics(),
                    baked: b.getDiagnostics(), settings: captureRecordingSettings(e),
                    cityInputs: e.context.cityInputs?.diagnostics() ?? null,
                    gpuRenderer: e.renderer.getContext().getParameter(e.renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL) }; } };
      };
      await window.startBakedStartupCapture();
    }, { profileShaders: process.env.BAKED_STARTUP_SHADER_PROFILE === '1', profileUniforms: process.env.BAKED_STARTUP_UNIFORM_PROFILE === '1' });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__busSim.sm.currentName === 'game_mode', null, { timeout: 60_000 });
    if (process.env.BAKED_STARTUP_RESIZE === '1') {
        // Preserve recorded resize order/gaps, aligned early in preparation so faster versions receive the same stress.
        await page.waitForFunction(() => window.bakedStartup.heldStarted !== null, null, { timeout: 150_000 });
        for (const [offset, width] of [[1000, 2506], [6250, 3390], [8150, 2506], [11220, 3390]]) {
            await page.waitForFunction(offset => window.bakedStartup.elapsed() - window.bakedStartup.heldStarted >= offset, offset);
            await page.setViewportSize({ width: width / 2, height: c.height[0] / 2 + 48 });
            await page.evaluate(width => window.bakedStartup.event('resize', { width }), width);
        }
    }
    // Resizing can finish after a faster implementation first becomes visible.
    // Retain those transition frames, then collect an equal final-size sample.
    const settlingStart = await page.evaluate(() => {
        const count = window.bakedStartup.readyFrames;
        window.bakedStartup.event('settling-start', { visibleFrames: count });
        return count;
    });
    let settledProfiler;
    if (process.env.BAKED_STARTUP_PASS_PROFILE === '1') {
        if (steadyFrames < 900) throw new Error('Pass profiling requires at least 900 frames');
        await page.waitForFunction(count => window.bakedStartup.readyFrames >= count, settlingStart + 300, { timeout: 200_000 });
        await page.evaluate(async () => {
            const { profileBakedPasses } = await import('/tests/headless/harness/BakedPassProfile.js');
            window.bakedPassProfile = profileBakedPasses(window.__busSim.engine);
        });
    }
    if (process.env.BAKED_STARTUP_UNIFORM_PROFILE === '1') {
        if (steadyFrames < 900) throw new Error('Uniform profiling requires at least 900 frames');
        await page.waitForFunction(count => window.bakedStartup.readyFrames >= count, settlingStart + 300, { timeout: 200_000 });
        await page.evaluate(() => window.bakedStartup.startUniformProfile());
    }
    if (process.env.BAKED_STARTUP_SETTLED_PROFILE === '1') {
        if (steadyFrames < 900) throw new Error('Settled profiling requires at least 900 frames');
        await page.waitForFunction(count => window.bakedStartup.readyFrames >= count, settlingStart + 300, { timeout: 200_000 });
        settledProfiler = await page.context().newCDPSession(page);
        await settledProfiler.send('Profiler.enable'); await settledProfiler.send('Profiler.start');
    }
    await page.waitForFunction(count => window.bakedStartup.readyFrames >= count || window.__busSim.engine._bakedLighting.viewError || window.__busSim.engine._bakedLighting.failure,
        settlingStart + steadyFrames, { timeout: 200_000 });
    if (settledProfiler) {
        const { profile } = await settledProfiler.send('Profiler.stop'); await settledProfiler.detach();
        await writeFile(`${output}/settled.cpuprofile`, JSON.stringify(profile));
    }
    if (profiler) {
        const { profile } = await profiler.send('Profiler.stop'); await profiler.detach();
        await writeFile(`${output}/startup.cpuprofile`, JSON.stringify(profile));
    }
    await page.waitForTimeout(200);
    if (process.env.BAKED_STARTUP_PASS_PROFILE === '1') {
        await writeFile(`${output}/pass-profile.json`, JSON.stringify(await page.evaluate(() => window.bakedPassProfile.finish())));
    }
    const result = await page.evaluate(() => window.bakedStartup.finish());
    memorySampling = false; await memoryTask; await memorySession?.detach();
    result.memorySamples = memorySamples;
    if (result.shaderProfile) {
        await writeFile(`${output}/shader-profile.json`, JSON.stringify(result.shaderProfile));
        delete result.shaderProfile;
    }
    const normalize = value => JSON.parse(JSON.stringify(value, (key, v) => typeof v === 'string' && /^https?:/.test(v) ? new URL(v).pathname : v));
    expect(normalize(result.settings.settings)).toEqual(normalize(recording.metadata.defaults));
    const gpu = new Map(result.samples.map(s => [s.submissionSequence, s.ms]));
    for (const frame of result.frames) frame.gpu = frame.gpuQuerySuppressed ? null : gpu.get(frame.submission) ?? null;
    result.conditions = { baseline: process.env.BAKED_STARTUP_BASELINE === '1',
        baselineSnapshot: process.env.BAKED_STARTUP_BASELINE === '1' ? process.env.BAKED_STARTUP_BASELINE_SNAPSHOT || 'before-src' : null,
        profile: !!profiler, settledProfile: !!settledProfiler, shaderProfile: process.env.BAKED_STARTUP_SHADER_PROFILE === '1',
        uniformProfile: process.env.BAKED_STARTUP_UNIFORM_PROFILE === '1', memorySampling: !!memorySession, steadyFrames, settlingStart,
        passProfile: process.env.BAKED_STARTUP_PASS_PROFILE === '1',
        resize: process.env.BAKED_STARTUP_RESIZE === '1' ? 'recorded-widths-and-gaps-preparation-aligned' : 'none', input: process.env.BAKED_STARTUP_INPUT };
    result.shaderWarnings=shaderWarnings;
    await writeFile(`${output}/startup.json`, JSON.stringify(result));
    const sources = await Promise.all(responses.values());
    await writeFile(`${output}/sources.json`, JSON.stringify(sources, null, 2));
    const sceneOnly='body * {visibility:hidden!important} #game-canvas {visibility:visible!important}';
    await page.locator('#game-canvas').screenshot({ path: `${output}/final.png`, style:sceneOnly });
    const visible = result.frames.filter(f => f.rendered && f.mode === 'baked' && !f.held);
    const summary = { firstVisible: visible[0], timings: result.baked.timings, longTasks: result.longTasks.sort((a,b) => b.ms-a.ms).slice(0,10),
        preparation: result.events.filter(e => e.type.startsWith('prepare') || e.type === 'request'), samples: result.frames.length };
    await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
    expect(errors).toEqual([]);
    expect(memorySamples.filter(sample => sample.error)).toEqual([]);
    expect(shaderWarnings).toEqual([]);
    expect(result.baked.view.ready).toBe(true);
    expect(visible.length).toBeGreaterThanOrEqual(steadyFrames);
    expect(visible.every(f => !f.hidden && [2506, c.width[0]].includes(f.width) && f.height === c.height[0])).toBe(true);
    expect(visible.slice(-Math.min(600, steadyFrames)).every(f => f.width === c.width[0])).toBe(true);
    expect(result.finalTimer.disjointCount).toBe(result.initialTimer.disjointCount);
    if (process.env.BAKED_STARTUP_WARM === '1') {
        await page.evaluate(async () => {
            const engine=window.__busSim.engine;
            await engine.setBakedLightingSettings({...engine._bakedLighting.getSettings(),mode:'current'});
        });
        await page.waitForFunction(()=>!window.__busSim.engine._bakedLighting.shouldHoldView());
        await page.evaluate(async () => {
            await window.startBakedStartupCapture();
            const engine=window.__busSim.engine;
            await engine.setBakedLightingSettings({...engine._bakedLighting.getSettings(),mode:'auto'});
        });
        await page.waitForFunction(count=>window.bakedStartup.readyFrames>=count,steadyFrames,{timeout:150_000});
        await page.waitForTimeout(200);
        const warm=await page.evaluate(()=>window.bakedStartup.finish());
        warm.conditions = { ...result.conditions, activation: 'warm' };
        warm.memoryEnd = memorySession ? await (async () => {
            const session = await page.context().newCDPSession(page);
            try { return await session.send('Runtime.getHeapUsage'); }
            finally { await session.detach(); }
        })() : null;
        const samples=new Map(warm.samples.map(s=>[s.submissionSequence,s.ms]));
        for(const frame of warm.frames)frame.gpu=frame.gpuQuerySuppressed?null:samples.get(frame.submission)??null;
        await writeFile(`${output}/warm.json`,JSON.stringify(warm));
        await page.locator('#game-canvas').screenshot({path:`${output}/warm.png`,style:sceneOnly});
        expect(normalize(warm.settings.settings)).toEqual(normalize(result.settings.settings));
        expect(warm.baked.view.ready).toBe(true);
        const warmVisible=warm.frames.filter(f=>f.rendered && f.mode==='baked' && !f.held);
        expect(warmVisible.length).toBeGreaterThanOrEqual(steadyFrames);
        expect(warmVisible.every(f=>!f.hidden && f.width===c.width[0] && f.height===c.height[0])).toBe(true);
        expect(warm.finalTimer.disjointCount).toBe(warm.initialTimer.disjointCount);
        expect(shaderWarnings).toEqual([]);
        expect(errors).toEqual([]);
    }
    if (process.env.BAKED_STARTUP_LIFECYCLE === '1') {
        const { captureBakedActivationLifecycle } = await import('../harness/BakedActivationLifecycle.js');
        await captureBakedActivationLifecycle(page, output);
        expect(errors).toEqual([]);
        expect(shaderWarnings).toEqual([]);
    }
    const telemetryResult = await finishTelemetry();
    if (telemetry) {
        expect(telemetryResult.errors).toEqual([]);
        expect(telemetryResult.rows.length).toBeGreaterThan(0);
    }
});
