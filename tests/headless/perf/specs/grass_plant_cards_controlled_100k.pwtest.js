// Fixed interior coverage isolates density comparisons from the shrinking visible field boundary.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/tuft_benchmark_controlled_100k');
const cases = ['off', 'side_by_side:joined', 'side_by_side:split', 'overlap_50:joined', 'overlap_50:split'];
const views = ['interior_bus_height', 'interior_low', 'interior_top'];
const summarize = values => ({ ...summarizeBenchmarkTimings(values), medianMs: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] });
async function gpuStatus() {
    try { return (await promisify(execFile)('nvidia-smi', ['--query-gpu=name,driver_version,utilization.gpu,temperature.gpu,power.draw,clocks.current.graphics', '--format=csv'])).stdout.trim(); }
    catch (error) { return `Unavailable: ${error.message}`; }
}

test('100K tufts with full-screen interior coverage and interleaved densities', async ({ page, browser }) => {
    test.skip(process.env.GRASS_TUFT_BENCHMARK !== '1', 'Opt in with GRASS_TUFT_BENCHMARK=1.');
    test.setTimeout(600000);
    await mkdir(output, { recursive: true });
    const errors = [], telemetry = [{ phase: 'before', value: await gpuStatus() }], blocks = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const metadata = await page.evaluate(async () => {
        const { createPlantCardBenchmark } = await import('/tests/headless/perf/helpers/grass_plant_cards_benchmark.js');
        window.__tuftBenchmark = await createPlantCardBenchmark(window.__plantCardsStudy);
        return { ...window.__tuftBenchmark.metadata, instanceState: window.__tuftBenchmark.getInstanceState() };
    });
    metadata.date = new Date().toISOString(); metadata.browser = browser.version();
    metadata.schedule = 'All four density/card combinations plus OFF in each frame, rotating/reversing their order. All transforms are uploaded before timing.';
    const preflight = {};
    for (const pose of views) {
        const footprint = await page.evaluate(pose => window.__tuftBenchmark.getGroundFootprint(pose), pose);
        const [width, depth] = metadata.layouts.overlap_50.fieldMeters;
        for (const [x, y, z] of footprint) {
            expect(Math.abs(y)).toBeLessThan(1e-6);
            expect(Math.abs(x)).toBeLessThan(width / 2 - 1);
            expect(z).toBeGreaterThan(1); expect(z).toBeLessThan(depth - 1);
        }
        preflight[pose] = { footprint, cases: {} };
        for (const name of cases.slice(1)) {
            const proxy = await page.evaluate(({ pose, name }) => window.__tuftBenchmark.measureProxyOverdraw(pose, name), { pose, name });
            expect(proxy.unavailable).toBeUndefined();
            expect(proxy.coveredFraction, `${pose}/${name}: card footprint must fill the screen`).toBeGreaterThan(0.999);
            const capture = await page.evaluate(({ pose, name }) => {
                const bench = window.__tuftBenchmark, gl = window.__plantCardsStudy.renderer.getContext();
                bench.capture(pose, 'off'); const background = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, background);
                const image = bench.capture(pose, name), pixels = new Uint8Array(1920 * 1080 * 4);
                gl.readPixels(0, 0, 1920, 1080, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                let occupied = 0;
                for (let i = 0; i < pixels.length; i += 4) if (pixels[i] !== background[0] || pixels[i + 1] !== background[1] || pixels[i + 2] !== background[2]) occupied++;
                return { image, visibleLeafPixelFraction: occupied / (1920 * 1080) };
            }, { pose, name });
            await writeFile(path.join(output, `${pose}-${name.replace(':', '-')}.png`), Buffer.from(capture.image.split(',')[1], 'base64'));
            preflight[pose].cases[name] = { ...proxy, visibleLeafPixelFraction: capture.visibleLeafPixelFraction };
        }
    }
    await writeFile(path.join(output, 'preflight.json'), JSON.stringify({ metadata, preflight, errors }, null, 2));
    console.log(`[ControlledTuftBenchmark] preflight ${JSON.stringify(preflight)}`);
    const results = {};
    for (const pose of views) {
        for (let round = 0; round < 6; round++) {
            const shift = round % cases.length, order = cases.slice(shift).concat(cases.slice(0, shift));
            const group = await page.evaluate(({ pose, order }) => window.__tuftBenchmark.runPairedBlock(pose, order, 30, 120), { pose, order });
            blocks.push(...group.map(block => ({ round, ...block })));
            telemetry.push({ phase: `${pose}:${round}`, value: await gpuStatus() });
            await writeFile(path.join(output, 'partial.json'), JSON.stringify({ metadata, preflight, blocks, telemetry, errors }, null, 2));
            console.log(`[ControlledTuftBenchmark] ${pose} round ${round + 1}: ${group.map(b => `${b.name}=${b.averageMs.toFixed(3)}ms`).join(', ')}`);
        }
        const result = results[pose] = {};
        for (const name of cases) {
            const selected = blocks.filter(block => block.pose === pose && block.name === name);
            result[name] = { gpu: summarize(selected.flatMap(b => b.gpu)), cpu: summarize(selected.flatMap(b => b.cpu)),
                frame: summarize(selected.flatMap(b => b.frame)), blockMeans: selected.map(b => b.averageMs) };
            expect(result[name].gpu.count).toBe(720);
        }
        for (const name of cases.slice(1)) result[name].meanMinusOffMs = result[name].gpu.averageMs - result.off.gpu.averageMs;
        result.densityDifference = {};
        for (const name of ['joined', 'split']) {
            const a = result[`side_by_side:${name}`], b = result[`overlap_50:${name}`];
            result.densityDifference[name] = { ms: b.gpu.averageMs - a.gpu.averageMs,
                percent: (b.gpu.averageMs / a.gpu.averageMs - 1) * 100,
                roundDeltasMs: b.blockMeans.map((mean, i) => mean - a.blockMeans[i]) };
        }
        console.log(`[ControlledTuftBenchmark] ${pose}: ${JSON.stringify(result)}`);
    }
    expect(await page.evaluate(() => window.__tuftBenchmark.getInstanceState())).toEqual(metadata.instanceState);
    await page.evaluate(() => window.__tuftBenchmark.dispose()); await page.close();
    await new Promise(resolve => setTimeout(resolve, 1500));
    telemetry.push({ phase: 'after-page-close', value: await gpuStatus() });
    await writeFile(path.join(output, 'results.json'), JSON.stringify({ metadata, preflight, results, blocks, telemetry, errors }, null, 2));
    const lines = ['# Controlled interior benchmark: 100,000 grass tufts', '',
        `GPU: ${metadata.renderer}. Browser: ${metadata.browser}.`, '',
        '- 100,000 tufts / 2,000,000 represented leaves per case. One draw per case; all instances submitted.',
        '- Three cards: 600,000 triangles. Four cards: 800,000 triangles. Geometry, material, PBR maps and sunlight match the current study.',
        '- Same camera and resolution for all densities and layouts. 1920 x 1080 RGBA16F, 4x MSAA, clear and resolve included.',
        '- The screen lies entirely inside both fields. Ground-frustum corners have at least 1 m of boundary margin; projected card footprint coverage must exceed 99.9% before timing.',
        '- Interior cameras look farther down than the earlier exterior views to exclude field edges. They are controlled views, not the gameplay chase camera.',
        '- Actual opaque leaf coverage is reported separately: alpha holes naturally change with density, while field coverage remains fixed.',
        '- All four density/card combinations plus OFF render in every measured frame, with rotating/reversed order. Four static instance buffers eliminate timed matrix uploads.',
        '- Six rounds, each 30 warmup + 120 measured frames = 720 GPU samples/case/view. Incomplete/disjoint samples fail the run; all hitches retained.',
        `- ${metadata.scope}`, '',
        '| View | Cards | Adjacent mean / P99 ms | Half-area overlap mean / P99 ms | Mean increase | OFF mean ms |',
        '|---|---|---:|---:|---:|---:|'];
    for (const pose of views) for (const name of ['joined', 'split']) {
        const r = results[pose], a = r[`side_by_side:${name}`].gpu, b = r[`overlap_50:${name}`].gpu, delta = r.densityDifference[name];
        lines.push(`| ${pose} | ${name === 'joined' ? 3 : 4} | ${a.averageMs.toFixed(3)} / ${a.p99Ms.toFixed(3)} | ${b.averageMs.toFixed(3)} / ${b.p99Ms.toFixed(3)} | ${delta.ms.toFixed(3)} ms (${delta.percent.toFixed(1)}%) | ${r.off.gpu.averageMs.toFixed(3)} |`);
    }
    lines.push('', '## Coverage and potential overdraw', '',
        'The additive diagnostic disables depth and alpha tests to count projected card layers, including transparent regions. It is not an executed-fragment counter. Visible leaf pixels come from the lit MSAA screenshot versus its clear color.', '',
        '| View | Case | Card footprint coverage | Visible leaf pixels | Potential layers / covered pixel |', '|---|---|---:|---:|---:|');
    for (const pose of views) for (const name of cases.slice(1)) {
        const p = preflight[pose].cases[name];
        lines.push(`| ${pose} | ${name} | ${(p.coveredFraction * 100).toFixed(3)}% | ${(p.visibleLeafPixelFraction * 100).toFixed(2)}% | ${p.meanLayersCoveredPixels.toFixed(3)} |`);
    }
    lines.push('', '## Scope', '',
        'This removes shrinking outer-field coverage as a confound. It measures the practical density change: more visible tufts and alpha coverage, depth rejection and overlap within the same screen region. All instances are submitted, but hardware clipping still rejects offscreen primitives. It does not isolate fragment-shader cost from every other GPU stage.', '',
        'The five-pass paired load differs from the earlier three-pass/exterior benchmark; compare densities within this run, not absolute times between runs. No sub-1 ms whole-game guarantee is implied.', '',
        'Raw samples, static buffer checks, camera footprints, diagnostics and telemetry: [results.json](results.json).', '',
        'Reproduce: select `tests/headless/perf/specs/grass_plant_cards_controlled_100k.pwtest.js` in `tests/.selected_test`; set `GRASS_TUFT_BENCHMARK=1`, `PERF_BASE_URL` to the checkout server and `PLAYWRIGHT_EXECUTABLE_PATH` to hardware-accelerated Chrome; run `node tools/run_selected_test/run.mjs`.', '');
    await writeFile(path.join(output, 'report.md'), lines.join('\n'));
    expect(errors).toEqual([]);
});
