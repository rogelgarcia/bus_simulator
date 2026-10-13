// Compare complete bus-lab frames at matched moving poses on an explicitly selected hardware browser.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'tests/artifacts/screens/grass/runtime_redesign/moving';
const summarize = values => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    const percentile = p => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
    return { count: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1) };
};
test.use({ viewport: { width: 2147, height: 884 }, deviceScaleFactor: 2, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Immutable grass compares against baked grass on the same moving bus-lab route', async ({ page }) => {
    test.skip(process.env.GRASS_PATCH_BENCHMARK !== '1', 'Opt in with GRASS_PATCH_BENCHMARK=1 on a hardware browser.');
    test.setTimeout(600000); await mkdir(output, { recursive: true });
    const errors = [], runs = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__grassTestView = view;\nlet copyFeedbackTimer;') });
    });
    for (const [run, version] of ['baked', 'patches', 'off', 'off', 'patches', 'baked'].entries()) {
        await page.goto('/debug_tools/grass_debug_v2.html?grass=' + (version === 'off' ? 'patches' : version));
        await page.waitForFunction(() => !!window.__grassDebugV2);
        await page.evaluate(() => window.__grassDebugV2.readiness);
        await page.addStyleTag({ content: 'body.grass-debug-v2 #game-canvas { width: 1907px !important; height: 836px !important; }' });
        await page.evaluate(() => window.__grassTestView.resize());
        await page.waitForFunction(() => {
            const viewport = window.__grassDebugV2.getSnapshot().viewport;
            return viewport.width === 3814 && viewport.height === 1672;
        });
        const data = await page.evaluate(async version => {
            const view = window.__grassTestView, renderer = view.renderer, timer = view.gpuTimer, bench = view.benchmark;
            renderer.setAnimationLoop(null); view.controls.enabled = false;
            if (version === 'off') view.grass.setMode('OFF');
            const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
            const metadata = { gpu: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL), userAgent: navigator.userAgent,
                viewport: view.getSnapshot().viewport, lighting: view.lighting.getSnapshot(), msaaSamples: 4, ambientOcclusion: 'off',
                route: bench.getRouteSnapshot(), strategy: view.grass.getSnapshot().strategy };
            if (/swiftshader|llvmpipe/i.test(metadata.gpu)) throw new Error('This comparison requires hardware rendering.');
            let cursor = timer.getDiagnostics().sampleSequence;
            const samples = [], frames = [], count = 360, duration = bench.flightTiming.durationMs;
            const collect = () => { timer.poll(); const fresh = timer.getSamplesSince(cursor); samples.push(...fresh); if (fresh.length) cursor = fresh.at(-1).sequence; };
            const submit = async (i, lap) => {
                await new Promise(resolve => requestAnimationFrame(resolve)); collect();
                const t = i / (count - 1) * duration;
                bench.route.getPoint(bench.flightTiming.distanceAtTime(t), view.camera.position);
                bench.flightOrientation.sample(t, view.camera.position, view.camera.quaternion);
                view.camera.updateMatrixWorld(true);
                const start = performance.now(); view.grass.update(view.camera.position, 100000 + lap * duration + t);
                const updateMs = performance.now() - start;
                timer.beginFrame(); view.lighting.render(1 / 60); timer.endFrame();
                if (lap > 0) frames.push({ pose: i, cpu: performance.now() - start, updateMs,
                    submission: timer.getDiagnostics().submissionSequence, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
            };
            for (let i = 0; i < count; i++) await submit(i, 0);
            const before = timer.getDiagnostics();
            for (let i = 0; i < count; i++) await submit(i, 1);
            for (let drain = 0; drain < 120 && timer.getDiagnostics().pendingQueryCount; drain++) { await new Promise(resolve => requestAnimationFrame(resolve)); collect(); }
            const after = timer.getDiagnostics(), gpu = new Map(samples.map(sample => [sample.submissionSequence, sample.ms]));
            for (const frame of frames) frame.gpu = gpu.get(frame.submission) ?? null;
            return { metadata, before, after, frames, glError: gl.getError() };
        }, version);
        const summary = Object.fromEntries(['cpu', 'gpu', 'updateMs', 'calls', 'triangles'].map(key => [key, summarize(data.frames.map(frame => frame[key]))]));
        runs.push({ run, version, ...data, summary });
        await writeFile(`${output}/route-${run}-${version}.json`, JSON.stringify(runs.at(-1), null, 2));
        console.log(JSON.stringify({ run, version, gpu: summary.gpu, cpu: summary.cpu, triangles: summary.triangles }));
        expect(data.glError).toBe(0); expect(data.after.disjointCount).toBe(data.before.disjointCount);
        expect(data.frames.every(frame => Number.isFinite(frame.gpu))).toBe(true);
        expect(data.metadata.viewport).toMatchObject({ width: 3814, height: 1672, pixelRatio: 2 });
        if (run < 2) {
            await page.evaluate(() => {
                const view = window.__grassTestView;
                view._lastTime = performance.now(); view.renderer.setAnimationLoop(view._onFrame);
                view.benchmark.start();
            });
            await page.waitForFunction(() => window.__grassTestView.benchmark.phase === 'complete', null, { timeout: 70000 });
            const native = await page.evaluate(() => window.__grassTestView.benchmark.result);
            await writeFile(`${output}/native-${version}.json`, JSON.stringify(native, null, 2));
            expect(native.gpuNote).toBe('');
            for (const pose of ['bus', 'grass', 'overview']) {
                await page.evaluate(pose => window.__grassDebugV2.setCamera(pose), pose);
                const frame = await page.evaluate(() => window.__grassDebugV2.getSnapshot().frame);
                await page.waitForFunction(frame => window.__grassDebugV2.getSnapshot().frame > frame + 35, frame);
                await page.screenshot({ path: `${output}/${version}-${pose}.png` });
            }
        }
    }
    const pairs = [0, 1].map(round => {
        const selected = runs.slice(round * 3, round * 3 + 3), by = Object.fromEntries(selected.map(run => [run.version, run]));
        return { round, savings: summarize(by.baked.frames.map((frame, i) => frame.gpu - by.patches.frames[i].gpu)),
            incremental: summarize(by.patches.frames.map((frame, i) => frame.gpu - by.off.frames[i].gpu)) };
    });
    await writeFile(`${output}/route-summary.json`, JSON.stringify({ runs: runs.map(({ run, version, metadata, summary }) => ({ run, version, metadata, summary })), pairs, errors }, null, 2));
    expect(errors).toEqual([]);
});
