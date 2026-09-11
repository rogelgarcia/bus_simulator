// Records frame phases at a fixed pose or a repeated low-rise approach.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

test.use({ viewport: { width: Number(process.env.PERF_WIDTH || 1280), height: Number(process.env.PERF_HEIGHT || 720) }, video: 'off', trace: 'off' });

test('Calibrated gameplay keeps its bake active during a performance capture', async ({ page }) => {
    const duration = Number(process.env.PERF_SECONDS || 45) * 1000;
    test.setTimeout(180_000 + duration);
    const output = `tests/artifacts/screens/calibrated_performance/${process.env.PERF_CAPTURE_NAME || Date.now()}`;
    await mkdir(output, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const pose = process.env.PERF_POSE ? JSON.parse(await readFile(process.env.PERF_POSE, 'utf8')) : null;
    await page.goto('/?coreTests=0&' + (pose ? 'gameplayPose=' + encodeURIComponent(JSON.stringify(pose)) : 'pose=civic_center_curve_front'));
    await page.waitForFunction(() => {
        const bake = window.__busSim?.engine?._bakedLighting;
        return bake?.effectiveMode === 'baked' && !bake.shouldHoldView() && !document.querySelector('.gameplay-loading');
    }, null, { timeout: 150_000 });
    console.log('Calibrated bake ready; recording', process.env.PERF_ROUTE === '1' ? 'repeated route.' : 'fixed-camera performance.');
    await page.evaluate(({ live, route }) => {
        const { engine: e, sm } = window.__busSim;
        if (live) sm.current.gameLoop.resume();
        const frames = [], gpuSamples = [], restore = [], phases = {};
        let lastGpuSequence = e._gpuFrameTimer.getDiagnostics().sampleSequence;
        const wrap = (object, method, label) => {
            const original = object[method];
            object[method] = function (...args) {
                const start = performance.now();
                try { return original.apply(this, args); }
                finally { phases[label] = (phases[label] || 0) + performance.now() - start; }
            };
            restore.push(() => { object[method] = original; });
        };
        wrap(sm.current, 'update', 'state');
        wrap(e._bakedLighting, 'prepareFrame', 'bake');
        wrap(e._bakedLighting.receivers, 'validateFrame', 'validation');
        wrap(e._illuminationPipeline, 'shadowPrepare', 'shadows');
        wrap(e, '_renderAoFrame', 'render');
        wrap(e, '_prepareDynamicAo', 'ao');
        const update = e.updateFrame, start = performance.now();
        if (route) {
            const applyCamera = sm.current._applyGameplayPoseCamera;
            restore.push(() => { sm.current._applyGameplayPoseCamera = applyCamera; });
            sm.current._applyGameplayPoseCamera = () => {};
        }
        e.updateFrame = function (dt, options) {
            const routeTime = (performance.now() - start) / 1000;
            if (route) {
                const t = routeTime % 16;
                const z = 50 + t * 8, yaw = Math.min(.55, Math.max(0, (z - 72) / 95));
                const x = 78 + Math.max(0, z - 80) * .42;
                sm.current.busAnchor.position.set(x, 1.70357861618941, z);
                sm.current.busAnchor.rotation.set(0, yaw, 0);
                e.camera.position.set(x - Math.sin(yaw)*22, 13, z-Math.cos(yaw)*22);
                e.camera.lookAt(x+Math.sin(yaw)*4, 2.7, z+Math.cos(yaw)*4);
            }
            for (const key in phases) phases[key] = 0;
            const before = performance.now();
            const result = update.call(this, dt, options);
            const cpu = performance.now() - before;
            const samples = e._gpuFrameTimer?.getSamplesSince(lastGpuSequence) ?? [];
            gpuSamples.push(...samples);
            if (samples.length) lastGpuSequence = samples.at(-1).sequence;
            frames.push({ t: performance.now() - start, dt: options.rawDt * 1000,
                gpu: e._gpuFrameTimer?.getLastMs(), ...phases, calls: e.renderer.info.render.calls,
                programs: e.renderer.info.programs.length, generation: e._bakedLighting.generation,
                mode: e._bakedLighting.effectiveMode, heap: performance.memory?.usedJSHeapSize,
                pose: route ? sm.current.busAnchor.position.toArray() : undefined,
                routeTime: route ? routeTime : undefined, cpu,
                submissionSequence: e._gpuFrameTimer?.getDiagnostics().submissionSequence });
            return result;
        };
        window.performanceCapture = { frames, finish() {
            e.updateFrame = update; restore.reverse().forEach(fn => fn());
            return { frames, gpuSamples, diagnostics: e.getBakedLightingDebugInfo(), pose: sm.current._captureGameplayPose(),
                viewport: {width:innerWidth,height:innerHeight,dpr:devicePixelRatio}, time: new Date().toISOString(),
                settings: { lighting:e.lightingSettings, baked:e.bakedLightingSettings, shadows:e.shadowSettings,
                    ao:e.ambientOcclusionSettings, aa:e.antiAliasingSettings, bloom:e.bloomSettings,
                    sunBloom:e.sunBloomSettings, grading:e.colorGradingSettings },
                renderer: { pixelRatio:e.renderer.getPixelRatio(), width:e.renderer.domElement.width,
                    height:e.renderer.domElement.height }, gpuTimer:e._gpuFrameTimer.getDiagnostics() };
        } };
    }, { live: process.env.PERF_LIVE === '1', route: process.env.PERF_ROUTE === '1' });
    const session = process.env.PERF_PROFILE === '1' ? await page.context().newCDPSession(page) : null;
    await session?.send('Profiler.enable');
    await session?.send('Profiler.setSamplingInterval', { interval: 1000 });
    await session?.send('Profiler.start');
    await page.waitForFunction(duration => window.performanceCapture.frames.at(-1)?.t >= duration, duration, { timeout: duration + 20_000 });
    const profile = (await session?.send('Profiler.stop'))?.profile;
    const capture = await page.evaluate(() => window.performanceCapture.finish());
    await writeFile(`${output}/frames.json`, JSON.stringify(capture));
    if (profile) await writeFile(`${output}/cpu.cpuprofile`, JSON.stringify(profile));
    const buckets = [];
    for (let second = 0; second < duration / 1000; second++) {
        const frames = capture.frames.filter(frame => frame.t >= second * 1000 && frame.t < (second + 1) * 1000);
        if (!frames.length) continue;
        const average = field => +(frames.reduce((sum, frame) => sum + (frame[field] || 0), 0) / frames.length).toFixed(2);
        buckets.push({ second, fps: frames.length, cpu: average('cpu'), gpu: average('gpu'),
            validation: average('validation'), render: average('render'), state: average('state'), shadows: average('shadows'),
            maxDt: Math.max(...frames.map(frame => frame.dt)), calls: frames.at(-1).calls,
            programs: frames.at(-1).programs, generation: frames.at(-1).generation });
    }
    await writeFile(`${output}/seconds.json`, JSON.stringify(buckets, null, 2));
    if (process.env.PERF_ROUTE === '1' && capture.gpuSamples) {
        const submissions = new Map(capture.frames.map(frame => [frame.submissionSequence, frame]));
        const routeBuckets = new Map();
        for (const sample of capture.gpuSamples) {
            const frame = submissions.get(sample.submissionSequence);
            if (!frame) continue;
            const lap = Math.floor(frame.routeTime / 16), station = Math.floor((frame.routeTime % 16) * 8);
            const key = `${lap}:${station}`;
            if (!routeBuckets.has(key)) routeBuckets.set(key, {lap,station,gpu:[],cpu:[],calls:[],pose:frame.pose});
            const bucket = routeBuckets.get(key); bucket.gpu.push(sample.ms); bucket.cpu.push(frame.cpu); bucket.calls.push(frame.calls);
        }
        await writeFile(`${output}/route-buckets.json`, JSON.stringify([...routeBuckets.values()], null, 2));
    }
    const warmed = capture.frames.filter(frame => frame.t > 10_000);
    const percentile = (field, fraction) => {
        const values = warmed.map(frame => frame[field] || 0).sort((a, b) => a - b);
        return +values[Math.floor((values.length - 1) * fraction)].toFixed(2);
    };
    const summary = { output, cpuMedian: percentile('cpu', .5), cpuP95: percentile('cpu', .95),
        shadowMedian: percentile('shadows', .5), shadowP95: percentile('shadows', .95),
        dtMedian: percentile('dt', .5), dtP95: percentile('dt', .95),
        minFps: Math.min(...buckets.slice(10).map(bucket => bucket.fps)), maxFps: Math.max(...buckets.slice(10).map(bucket => bucket.fps)) };
    await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
    console.log('Performance capture:', JSON.stringify(summary));
    expect(errors).toEqual([]);
    expect(capture.gpuSamples.length, 'Hardware GPU timing must be available for this benchmark').toBeGreaterThan(0);
    expect(new Set(capture.frames.map(frame => frame.generation)).size).toBe(1);
    expect(capture.frames.every(frame => frame.mode === 'baked')).toBe(true);
});
