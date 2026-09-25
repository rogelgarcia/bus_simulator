// Hardware-only experiment: counterbalanced GPU timings for the two current twenty-leaf tuft layouts.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });
const schedule = process.env.GRASS_TUFT_SCHEDULE === 'paired' ? 'paired' : 'blocks';
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/tuft_benchmark_100k', schedule === 'paired' ? 'paired' : '.');
const summarize = values => ({ ...summarizeBenchmarkTimings(values), medianMs: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] });
async function gpuStatus() {
    try { return (await promisify(execFile)('nvidia-smi', ['--query-gpu=name,driver_version,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,clocks.current.graphics', '--format=csv'])).stdout.trim(); }
    catch (error) { return `Unavailable: ${error.message}`; }
}

test('100K twenty-leaf tufts: three versus four cards, adjacent and half-area overlap', async ({ page, browser }) => {
    test.skip(process.env.GRASS_TUFT_BENCHMARK !== '1', 'Opt in to the hardware experiment with GRASS_TUFT_BENCHMARK=1.');
    test.setTimeout(900000);
    await mkdir(output, { recursive: true });
    const telemetry = [{ phase: 'before', value: await gpuStatus() }], errors = [], blocks = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const metadata = await page.evaluate(async () => {
        const { createPlantCardBenchmark } = await import('/tests/headless/perf/helpers/grass_plant_cards_benchmark.js');
        window.__tuftBenchmark = await createPlantCardBenchmark(window.__plantCardsStudy);
        return window.__tuftBenchmark.metadata;
    });
    metadata.browser = browser.version(); metadata.date = new Date().toISOString(); metadata.schedule = schedule;
    console.log(`[TuftBenchmark] ${JSON.stringify(metadata)}`);
    const orders = [['off', 'joined', 'split'], ['split', 'joined', 'off'], ['joined', 'off', 'split'],
        ['split', 'off', 'joined'], ['off', 'split', 'joined'], ['joined', 'split', 'off']];
    const results = {};
    for (const layout of ['side_by_side', 'overlap_50']) {
      await page.evaluate(layout => window.__tuftBenchmark.setLayout(layout), layout);
      results[layout] = {};
      for (const pose of ['bus_height', 'low', 'overview']) {
        for (const [round, order] of orders.entries()) {
            if (schedule === 'paired') {
                const group = await page.evaluate(({ pose, order }) => window.__tuftBenchmark.runPairedBlock(pose, order), { pose, order });
                blocks.push(...group.map(block => ({ layout, round, ...block })));
            } else {
                for (const name of order) {
                    const block = await page.evaluate(({ pose, name }) => window.__tuftBenchmark.runBlock(pose, name), { pose, name });
                    blocks.push({ layout, round, ...block });
                }
            }
            telemetry.push({ phase: `${layout}:${pose}:${round}`, value: await gpuStatus() });
            await writeFile(path.join(output, 'partial.json'), JSON.stringify({ metadata, orders, blocks, telemetry, errors }, null, 2));
            console.log(`[TuftBenchmark] ${layout} ${pose} round ${round + 1}: ${blocks.slice(-3).map(b => `${b.name}=${b.averageMs.toFixed(3)}ms`).join(', ')}`);
        }
        results[layout][pose] = {};
        for (const name of ['off', 'joined', 'split']) {
            const selected = blocks.filter(block => block.layout === layout && block.pose === pose && block.name === name);
            results[layout][pose][name] = { gpu: summarize(selected.flatMap(b => b.gpu)), cpu: summarize(selected.flatMap(b => b.cpu)),
                frame: summarize(selected.flatMap(b => b.frame)), blockMeans: selected.map(b => b.averageMs) };
        }
        const result = results[layout][pose];
        for (const name of ['joined', 'split']) result[name].meanMinusOffMs = result[name].gpu.averageMs - result.off.gpu.averageMs;
        result.splitMinusJoinedMs = result.split.gpu.averageMs - result.joined.gpu.averageMs;
        result.splitReductionPercent = (1 - result.split.gpu.averageMs / result.joined.gpu.averageMs) * 100;
        result.pairedRoundDeltasMs = result.split.blockMeans.map((mean, i) => mean - result.joined.blockMeans[i]);
        for (const name of ['joined', 'split']) {
            result[name].proxyOverdraw = await page.evaluate(({ pose, name }) => window.__tuftBenchmark.measureProxyOverdraw(pose, name), { pose, name });
            const data = await page.evaluate(({ pose, name }) => window.__tuftBenchmark.capture(pose, name), { pose, name });
            await writeFile(path.join(output, `${layout}-${pose}-${name}.png`), Buffer.from(data.split(',')[1], 'base64'));
        }
        console.log(`[TuftBenchmark] ${layout} ${pose} result: ${JSON.stringify(result)}`);
      }
    }
    await page.evaluate(() => window.__tuftBenchmark.dispose());
    await page.close();
    await new Promise(resolve => setTimeout(resolve, 1500));
    telemetry.push({ phase: 'after-page-close', value: await gpuStatus() });
    await writeFile(path.join(output, 'results.json'), JSON.stringify({ metadata, orders, results, blocks, telemetry, errors }, null, 2));
    const lines = ['# 100,000 twenty-leaf tuft benchmark', '',
        `GPU: ${metadata.renderer}. Browser: ${metadata.browser}.`, '',
        '- 100,000 tufts, 2,000,000 represented leaves, one instanced draw per case.',
        '- Three cards: 300,000 cards / 600,000 triangles. Four cards: 400,000 cards / 800,000 triangles.',
        '- Same current geometry, shared 4096 x 2048 albedo/normal/roughness atlases, game sun and HDR environment.',
        '- 1920 x 1080 RGBA16F target, 4x MSAA; clear and resolve included.',
        '- 400 x 250 placements. Test 1 uses exact adjacent tuft footprints; test 2 shrinks total footprint area by 50% at fixed count. Both axes compress, with the near field edge fixed at Z = 0.',
        ...Object.entries(metadata.layouts).map(([name, layout]) => `- ${name}: ${layout.fieldMeters.map(v => v.toFixed(3)).join(' x ')} m = ${layout.areaSquareMeters.toFixed(3)} square metres.`),
        '- Camera poses remain identical across both density tests. This measures the combined density/coverage effect; the overview also covers fewer screen pixels after compression.',
        '- Six counterbalanced rounds per view; 24 warmup + 120 measured frames per block; 720 samples/case/view.',
        schedule === 'paired' ? '- Paired schedule: all three cases rendered in each animation frame, rotating/reversing their order. Higher aggregate GPU load than the separate-block schedule; do not pool absolute timings.'
            : '- Separate-block schedule: one case rendered per animation frame; six balanced case orders.',
        '- GPU elapsed queries; complete coverage required. P99 uses nearest rank and retains all hitches.',
        `- ${metadata.scope}`, '',
        '| Density | View | Cards | Mean GPU ms | P99 GPU ms | Median GPU ms | Mean minus OFF ms |',
        '|---|---|---|---:|---:|---:|---:|'];
    for (const [layout, views] of Object.entries(results)) for (const [pose, result] of Object.entries(views)) for (const name of ['off', 'joined', 'split']) {
        const r = result[name]; lines.push(`| ${layout} | ${pose} | ${{ off: 'OFF', joined: '3 cards', split: '4 cards' }[name]} | ${r.gpu.averageMs.toFixed(3)} | ${r.gpu.p99Ms.toFixed(3)} | ${r.gpu.medianMs.toFixed(3)} | ${name === 'off' ? '—' : r.meanMinusOffMs.toFixed(3)} |`);
    }
    lines.push('', '## Four-card difference', '', '| Density | View | 4 cards minus 3 cards (ms) | Mean reduction | Paired round deltas (ms) |', '|---|---|---:|---:|---|');
    for (const [layout, views] of Object.entries(results)) for (const [pose, r] of Object.entries(views)) lines.push(`| ${layout} | ${pose} | ${r.splitMinusJoinedMs.toFixed(3)} | ${r.splitReductionPercent.toFixed(1)}% | ${r.pairedRoundDeltasMs.map(v => v.toFixed(3)).join(', ')} |`);
    lines.push('', '## Potential proxy overdraw', '', 'Separate untimed additive coverage pass at 960 x 540, with depth and alpha tests disabled. Counts projected card layers including transparent texels; these are not measured fragment-shader invocations. Actual depth rejection and alpha coverage change executed shading work.', '',
        '| Density | View | Cards | Layers / frame pixel | Layers / covered pixel | Covered pixels | Maximum layers |', '|---|---|---|---:|---:|---:|---:|');
    for (const [layout, views] of Object.entries(results)) for (const [pose, r] of Object.entries(views)) for (const name of ['joined', 'split']) {
        const o = r[name].proxyOverdraw;
        if (o.unavailable) lines.push(`| ${layout} | ${pose} | ${name} | unavailable | — | — | — |`);
        else lines.push(`| ${layout} | ${pose} | ${name === 'joined' ? 3 : 4} | ${o.meanLayersFullFrame.toFixed(3)} | ${o.meanLayersCoveredPixels.toFixed(3)} | ${(o.coveredFraction * 100).toFixed(1)}% | ${o.maxLayers} |`);
    }
    lines.push('', 'These are isolated grass-pass measurements, not whole-game frame timings. Mean-minus-OFF is a difference of means; P99 values are not subtracted. Repeated runs and other cameras/densities can change the ranking.',
        '', '## Reproduce', '', 'Select `tests/headless/perf/specs/grass_plant_cards_100k.pwtest.js` in `tests/.selected_test`; set `GRASS_TUFT_BENCHMARK=1`, `PERF_BASE_URL` to the project server and `PLAYWRIGHT_EXECUTABLE_PATH` to a hardware-accelerated Chrome, then run `node tools/run_selected_test/run.mjs`. Set `GRASS_TUFT_SCHEDULE=paired` for the paired schedule.',
        '', 'Raw samples, per-round telemetry and metadata: [results.json](results.json). Captures show the actual measured grass-only scene.', '', '## GPU telemetry', '');
    for (const entry of [telemetry[0], telemetry.at(-1)]) lines.push(`### ${entry.phase}`, '', '```text', entry.value, '```', '');
    await writeFile(path.join(output, 'report.md'), lines.join('\n'));
    expect(errors).toEqual([]);
    expect(metadata.instances).toBe(100000); expect(metadata.source.sourceLeaves).toBe(20);
    expect(metadata.layouts.overlap_50.areaSquareMeters / metadata.layouts.side_by_side.areaSquareMeters).toBeCloseTo(0.5, 12);
    metadata.layouts.side_by_side.spacingMeters.forEach((spacing, i) => expect(spacing).toBeCloseTo(metadata.tuftFootprintMeters[i], 12));
    for (const views of Object.values(results)) for (const r of Object.values(views)) for (const name of ['off', 'joined', 'split']) expect(r[name].gpu.count).toBe(720);
});
