// Hardware-only, full-scene forward bus-camera comparisons of grass appearance strategies.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const recordingResolution = process.env.GRASS_LEAF_BUS_VIEWPORT === 'recording';
const riseStudy = process.env.GRASS_LEAF_BUS_TRANSITION === 'rise';
const rounds = Number(process.env.GRASS_LEAF_BUS_ROUNDS || 3);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 3) throw new Error('GRASS_LEAF_BUS_ROUNDS must be 1, 2 or 3.');
test.use({ viewport: recordingResolution ? { width: 2147, height: 884 } : { width: 1600, height: 1000 }, deviceScaleFactor: 2, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
        args: ['--force-color-profile=srgb', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] } });
const summarize = values => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    const percentile = fraction => sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;
    return { count: sorted.length, mean: sorted.length ? sorted.reduce((sum, n) => sum + n, 0) / sorted.length : null,
        median: percentile(.5), p95: percentile(.95), p99: percentile(.99), maximum: sorted.at(-1) ?? null };
};
async function gpuStatus() {
    try { return (await promisify(execFile)('nvidia-smi', ['--query-gpu=name,driver_version,utilization.gpu,memory.used,temperature.gpu,power.draw,clocks.current.graphics', '--format=csv'], { windowsHide: true })).stdout.trim(); }
    catch (error) { return `Unavailable: ${error.message}`; }
}

test('Bus camera: matched forward laps compare experimental and existing grass', async ({ page, browser }) => {
    test.skip(process.env.GRASS_LEAF_BUS_BENCHMARK !== '1', 'Opt in with GRASS_LEAF_BUS_BENCHMARK=1 and a hardware Chrome executable.');
    test.setTimeout(600000);
    const root = riseStudy ? 'tests/artifacts/screens/grass/lod4_rise_transition/benchmark' : 'tests/artifacts/screens/grass/lod4_offline_leaf_fill/bus_benchmark';
    const output = path.resolve(root, new Date().toISOString().replace(/[:.]/g, '-'));
    await mkdir(output, { recursive: true });
    const blocks = [], telemetry = [], errors = [], cases = riseStudy ? {
        auto: { mode: 'AUTO' }, autoRise: { mode: 'AUTO', rise: true }
    } : {
        lod3: { mode: 'LOD3', baked: false }, lod4: { mode: 'LOD4', baked: false },
        lod4Baked: { mode: 'LOD4', baked: true }, auto: { mode: 'AUTO', baked: false }, autoBaked: { mode: 'AUTO', baked: true }
    };
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__grassTestView = view;\nlet copyFeedbackTimer;') });
    });
    const orders = (riseStudy ? [['auto', 'autoRise'], ['autoRise', 'auto'], ['auto', 'autoRise']] :
        [ ['lod3', 'lod4', 'lod4Baked', 'auto', 'autoBaked'], ['autoBaked', 'auto', 'lod4Baked', 'lod4', 'lod3'],
            ['lod4', 'lod4Baked', 'lod3', 'autoBaked', 'auto'] ]).slice(0, rounds);
    const metadata = { date: new Date().toISOString(), browser: browser.version(), orders, output, viewportProfile: recordingResolution ? 'recording' : 'comparison',
        scope: 'Full bus lab including lighting/postprocessing. Fixed bus height, pitch and heading; 71.06 m forward, 360 matched poses per pass.' };
    console.log(`[BusGrass] Output: ${output}`);
    for (const [round, order] of orders.entries()) for (const name of order) {
        const config = cases[name];
        await page.goto('/debug_tools/grass_debug_v2.html?grass=patches' + (config.baked ? '&leafFill=baked' : '') + (config.rise ? '&handoff=rise' : ''));
        await page.waitForFunction(() => !!window.__grassDebugV2);
        await page.evaluate(() => window.__grassDebugV2.readiness);
        telemetry.push({ round, name, before: await gpuStatus() });
        const block = await page.evaluate(async mode => {
            const { measureGrassBusPass } = await import('/tests/headless/perf/helpers/grass_patch_bus_benchmark.js');
            return measureGrassBusPass(window.__grassTestView, { mode });
        }, config.mode);
        block.round = round; block.name = name;
        block.summary = { gpu: summarize(block.rows.map(row => row.gpuMs)), cpu: summarize(block.rows.map(row => row.cpuMs)),
            frame: summarize(block.rows.map(row => row.frameMs)), framesOver33ms: block.rows.filter(row => row.frameMs > 33.5).length,
            framesOver50ms: block.rows.filter(row => row.frameMs > 50.1).length };
        blocks.push(block);
        await writeFile(path.join(output, 'partial.json'), JSON.stringify({ metadata, telemetry, blocks, errors }, null, 2));
        console.log(`[BusGrass] round ${round + 1} ${name}: GPU ${block.summary.gpu.mean?.toFixed(2)} ms / p95 ${block.summary.gpu.p95?.toFixed(2)}, frame p95 ${block.summary.frame.p95.toFixed(2)}, >50 ms ${block.summary.framesOver50ms}, coverage ${block.timer.coverage}`);
        expect(block.timer.valid, name + ': disjoint-checked, complete GPU coverage').toBe(true);
        expect(block.viewport).toEqual({ width: recordingResolution ? 3814 : 2720, height: recordingResolution ? 1672 : 1904, pixelRatio: 2 });
        expect(block.gpuName).not.toMatch(/swiftshader|llvmpipe|software/i);
        expect(block.uploads).toEqual({ buffers: 0, textures: 0, bufferCreates: 0 });
        expect(block.memory.after).toEqual(block.memory.before);
        expect(block.glError).toBe(0);
        if (round === 0) {
            await page.evaluate(() => {
                const view = window.__grassTestView;
                view.camera.position.copy(view.busPose.position); view.camera.updateMatrixWorld(true); view.render(performance.now());
            });
            await page.screenshot({ path: path.join(output, `${name}-bus-start.png`), clip: await page.locator('#game-canvas').boundingBox() });
        }
        await page.evaluate(() => window.__grassTestView.destroy());
    }
    const results = Object.fromEntries(Object.keys(cases).map(name => {
        const selected = blocks.filter(block => block.name === name), rows = selected.flatMap(block => block.rows);
        return [name, { gpu: summarize(rows.map(row => row.gpuMs)), cpu: summarize(rows.map(row => row.cpuMs)), frame: summarize(rows.map(row => row.frameMs)),
            blockGpuMeans: selected.map(block => block.summary.gpu.mean), framesOver33ms: selected.reduce((sum, block) => sum + block.summary.framesOver33ms, 0),
            framesOver50ms: selected.reduce((sum, block) => sum + block.summary.framesOver50ms, 0) }];
    }));
    const paired = {};
    for (const [previous, candidate] of (riseStudy ? [['auto', 'autoRise']] : [['lod4', 'lod4Baked'], ['auto', 'autoBaked']])) {
        const deltas = [], rounds = [];
        for (let round = 0; round < orders.length; round++) {
            const a = blocks.find(block => block.name === previous && block.round === round), b = blocks.find(block => block.name === candidate && block.round === round);
            expect(a.origin).toEqual(b.origin); expect(a.quaternion).toEqual(b.quaternion); expect(a.viewport).toEqual(b.viewport);
            const values = a.rows.map((row, i) => {
                expect(row.distance).toBe(b.rows[i].distance); expect(row.triangles).toBe(b.rows[i].triangles); expect(row.calls).toBe(b.rows[i].calls);
                return b.rows[i].gpuMs - row.gpuMs;
            });
            deltas.push(...values); rounds.push(summarize(values));
        }
        paired[previous] = { gpuDeltaMs: summarize(deltas), rounds };
    }
    telemetry.push({ phase: 'end', value: await gpuStatus() });
    await writeFile(path.join(output, 'results.json'), JSON.stringify({ metadata, results, paired, telemetry, blocks, errors }, null, 2));
    await writeFile(path.resolve(root, 'latest.json'), JSON.stringify({ output }, null, 2));
    console.log(`[BusGrass] Summary: ${JSON.stringify({ results, paired })}`);
    expect(errors).toEqual([]);
});
