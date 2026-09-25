// Compare the combined grazing corrections with identical 50,000-leaf submissions and framing.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/corrections_50k');
const poses = ['top', 'oblique', 'grazing'], cases = ['empty', 'disabled', 'enabled'];
async function gpuStatus() {
    try { return (await promisify(execFile)('nvidia-smi', ['--query-gpu=name,driver_version,utilization.gpu,temperature.gpu,power.draw,clocks.current.graphics', '--format=csv'])).stdout.trim(); }
    catch (error) { return `Unavailable: ${error.message}`; }
}

test('50K leaves: normal facing and alpha coverage enabled versus disabled in three poses', async ({ page, browser }) => {
    test.skip(process.env.GRASS_CORRECTIONS_BENCHMARK !== '1', 'Opt in with GRASS_CORRECTIONS_BENCHMARK=1.');
    test.setTimeout(600000); await mkdir(output, { recursive: true });
    const errors = [], blocks = [], preflight = {}, telemetry = [{ phase: 'before', value: await gpuStatus() }];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness); await page.evaluate(() => window.__plantCardsReadiness);
    const metadata = await page.evaluate(async () => {
        const { createGrassCorrectionsBenchmark } = await import('/tests/headless/perf/helpers/grass_corrections_benchmark.js');
        window.__correctionsBenchmark = await createGrassCorrectionsBenchmark(window.__plantCardsStudy);
        return window.__correctionsBenchmark.metadata;
    });
    metadata.browser = browser.version(); metadata.date = new Date().toISOString();
    metadata.schedule = '8 rounds per pose; 30 warmup frames then 120 samples/case. Every frame contains all three cases in balanced rotating/reversed order. Pose order rotates between rounds.';
    expect(metadata.leaves).toBe(50000); expect(metadata.instances).toBe(2500);
    expect(metadata.cards).toBe(60000); expect(metadata.triangles).toBe(120000); expect(metadata.samples).toBe(4);
    for (const pose of poses) {
        expect(metadata.poses[pose].fullyInFrustum).toBe(2500);
        preflight[pose] = {};
        for (const name of ['disabled', 'enabled']) {
            const capture = await page.evaluate(({ pose, name }) => window.__correctionsBenchmark.capture(pose, name), { pose, name });
            await writeFile(path.join(output, `${pose}-${name}.jpg`), Buffer.from(capture.image.split(',')[1], 'base64'));
            delete capture.image; preflight[pose][name] = capture;
            expect(capture.coveredPixels).toBeGreaterThan(1000);
            expect(await page.evaluate(() => window.__plantCardsStudy.cards.getSnapshot().corrections))
                .toEqual(metadata.cases[name]);
        }
    }
    if (process.env.GRASS_CORRECTIONS_CAPTURE_ONLY === '1') {
        await page.evaluate(() => window.__correctionsBenchmark.dispose());
        expect(errors).toEqual([]); return;
    }
    console.log(`[GrassCorrections] ${metadata.renderer}; ${metadata.leaves} leaves, ${metadata.cards} cards, ${metadata.triangles} triangles.`);
    await writeFile(path.join(output, 'preflight.json'), JSON.stringify({ metadata, preflight, errors }, null, 2));
    for (let round = 0; round < 8; round++) {
        const order = poses.slice(round % poses.length).concat(poses.slice(0, round % poses.length));
        for (const pose of order) {
            const block = await page.evaluate(({ pose, round }) => window.__correctionsBenchmark.runRound(pose, round), { pose, round });
            blocks.push(block);
            console.log(`[GrassCorrections] ${pose} round ${round + 1}: ${cases.map(name => `${name}=${summarizeBenchmarkTimings(block.records[name].gpu).averageMs.toFixed(4)}ms`).join(', ')}`);
        }
        telemetry.push({ phase: `round-${round + 1}`, value: await gpuStatus() });
        await writeFile(path.join(output, 'partial.json'), JSON.stringify({ metadata, preflight, blocks, telemetry, errors }, null, 2));
    }
    expect(await page.evaluate(() => window.__correctionsBenchmark.verifyStatic())).toBe(true);
    const results = {};
    for (const pose of poses) {
        const selected = blocks.filter(block => block.pose === pose), result = results[pose] = {};
        for (const name of cases) {
            result[name] = { gpu: summarizeBenchmarkTimings(selected.flatMap(block => block.records[name].gpu)),
                roundMeans: selected.map(block => summarizeBenchmarkTimings(block.records[name].gpu).averageMs) };
            expect(result[name].gpu.count).toBe(960);
        }
        const roundDeltas = result.enabled.roundMeans.map((value, i) => value - result.disabled.roundMeans[i]);
        const mean = roundDeltas.reduce((a, b) => a + b, 0) / roundDeltas.length;
        const sd = Math.sqrt(roundDeltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (roundDeltas.length - 1));
        const margin = 2.365 * sd / Math.sqrt(roundDeltas.length);
        result.difference = { averageMs: mean, percent: mean / result.disabled.gpu.averageMs * 100,
            roundDeltas, approximate95PercentIntervalMs: [mean - margin, mean + margin] };
        for (const name of ['disabled', 'enabled']) result[name].averageMinusEmptyMs = result[name].gpu.averageMs - result.empty.gpu.averageMs;
    }
    await page.evaluate(() => window.__correctionsBenchmark.dispose()); await page.close();
    telemetry.push({ phase: 'after', value: await gpuStatus() });
    await writeFile(path.join(output, 'results.json'), JSON.stringify({ metadata, preflight, results, blocks, telemetry, errors }, null, 2));
    const lines = ['# 50,000 leaves: normal facing + alpha coverage', '',
        `GPU: ${metadata.renderer}. Chrome ${metadata.browser}. ${metadata.date}.`, '',
        '- Current LOD3 · 24: 2,500 twenty-leaf tufts, 60,000 cards, 120,000 triangles, one draw.',
        '- 1920 x 1080, RGBA16F with depth and 4x MSAA. Game sun and environment.',
        '- Both corrections enabled versus both disabled. Disabled retains ordinary alpha testing and alpha-to-coverage; it removes the new normal-facing and coverage correction features.',
        '- The whole fixed field is inside each perspective camera: top (90°), oblique (45°), grazing (8°). Each pose has its own framing; framing is identical between ON and OFF. Empty screen area varies by pose.',
        '- Eight interleaved rounds, 960 valid GPU samples per case/pose. All hitches retained; no disjoint, pending or missing query results accepted. Static transforms and balanced case order checked.',
        '- GPU times include clear and resolve. The empty pass reports that baseline; P99 values are absolute and never baseline-subtracted.',
        `- ${metadata.scope}`, '',
        '| Pose | Both OFF mean / P99 ms | Both ON mean / P99 ms | Added mean | Empty mean ms |',
        '|---|---:|---:|---:|---:|'];
    for (const pose of poses) {
        const r = results[pose];
        lines.push(`| ${pose} | ${r.disabled.gpu.averageMs.toFixed(4)} / ${r.disabled.gpu.p99Ms.toFixed(4)} | ${r.enabled.gpu.averageMs.toFixed(4)} / ${r.enabled.gpu.p99Ms.toFixed(4)} | ${r.difference.averageMs.toFixed(4)} ms (${r.difference.percent.toFixed(1)}%) | ${r.empty.gpu.averageMs.toFixed(4)} |`);
    }
    lines.push('', '| Pose | Paired round delta range ms | Approximate 95% interval ms | OFF / ON leaf alpha coverage |',
        '|---|---:|---:|---:|');
    for (const pose of poses) {
        const d = results[pose].difference, p = preflight[pose];
        lines.push(`| ${pose} | ${Math.min(...d.roundDeltas).toFixed(4)} to ${Math.max(...d.roundDeltas).toFixed(4)} | ${d.approximate95PercentIntervalMs.map(value => value.toFixed(4)).join(' to ')} | ${(p.disabled.alphaCoverageFraction * 100).toFixed(2)}% / ${(p.enabled.alphaCoverageFraction * 100).toFixed(2)}% |`);
    }
    lines.push('', 'GPU clocks are not locked; per-round telemetry is retained in results.json. Absolute timings and P99 tails reflect the current desktop operating state. Compare paired means within this run rather than absolute totals against earlier benchmarks.', '',
        'The confidence interval uses eight paired round means (Student t, 7 degrees of freedom); it describes within-run variation, not variation across machines. Alpha coverage may render more covered samples, so this is the combined practical cost, not isolated shader arithmetic. It does not separate the individual costs of the two features. Startup/bake cost and extra coverage texture memory are excluded.', '',
        'Reproduce: select `tests/headless/perf/specs/grass_corrections_50k.pwtest.js`; set `GRASS_CORRECTIONS_BENCHMARK=1`, `PERF_BASE_URL` to the checkout server and `PLAYWRIGHT_EXECUTABLE_PATH` to hardware Chrome; run `node tools/run_selected_test/run.mjs`.', '',
        'Raw samples, query diagnostics, counts, camera bounds, captures and GPU telemetry: [results.json](results.json).', '');
    await writeFile(path.join(output, 'report.md'), lines.join('\n'));
    console.log(JSON.stringify(results)); expect(errors).toEqual([]);
});
