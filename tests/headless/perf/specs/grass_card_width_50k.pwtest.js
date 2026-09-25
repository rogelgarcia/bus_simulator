// Wider grass cards must reduce geometry while preserving all 50,000 represented leaf positions.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/card_width_50k');
const poses = ['top', 'oblique', 'grazing'], cases = ['empty', 'current', 'wide'];
async function gpuStatus() {
    try { return (await promisify(execFile)('nvidia-smi', ['--query-gpu=name,driver_version,utilization.gpu,temperature.gpu,power.draw,clocks.current.graphics', '--format=csv'])).stdout.trim(); }
    catch (error) { return `Unavailable: ${error.message}`; }
}

test('50K leaves: current versus 4x card width with identical leaf placement', async ({ page, browser }) => {
    test.skip(process.env.GRASS_CARD_WIDTH_BENCHMARK !== '1', 'Opt in with GRASS_CARD_WIDTH_BENCHMARK=1.');
    test.setTimeout(600000); await mkdir(output, { recursive: true });
    const errors = [], blocks = [], preflight = {}, telemetry = [{ phase: 'before', value: await gpuStatus() }];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness); await page.evaluate(() => window.__plantCardsReadiness);
    const metadata = await page.evaluate(async () => {
        const { createGrassCardWidthBenchmark } = await import('/tests/headless/perf/helpers/grass_card_width_benchmark.js');
        window.__cardWidthBenchmark = await createGrassCardWidthBenchmark(window.__plantCardsStudy);
        return window.__cardWidthBenchmark.metadata;
    });
    metadata.browser = browser.version(); metadata.date = new Date().toISOString();
    metadata.schedule = '8 rounds per pose; 30 warmup frames then 120 samples/case. Every frame contains all three cases in balanced rotating/reversed order. Pose order rotates between rounds.';
    expect(metadata.leaves).toBe(50000); expect(metadata.samples).toBe(4);
    expect(metadata.cases.current).toMatchObject({ instances: 2500, leavesPerGroup: 20, leaves: 50000, cards: 60000, triangles: 120000, drawCalls: 1 });
    expect(metadata.cases.wide).toMatchObject({ instances: 625, leavesPerGroup: 80, leaves: 50000, cards: 15000, triangles: 30000, drawCalls: 1 });
    expect(metadata.cases.wide.cardWidthMeters).toBeCloseTo(metadata.cases.current.cardWidthMeters * 4, 10);
    expect(metadata.proof.representedLeaves).toBe(50000); expect(metadata.proof.sourcePointChecks).toBe(100000);
    expect(metadata.proof.maximumLeafPositionErrorMeters).toBeLessThan(0.00001);
    expect(metadata.proof.maximumFieldBoundsErrorMeters).toBeLessThan(0.00001);
    expect(metadata.proof.sameMaterial).toBe(true);
    expect(metadata.corrections).toEqual({ normalFacing: true, alphaCoverage: true });
    for (const pose of poses) {
        expect(metadata.poses[pose].fullyInFrustum).toBe(2500);
        preflight[pose] = {};
        for (const name of ['current', 'wide']) {
            const capture = await page.evaluate(({ pose, name }) => window.__cardWidthBenchmark.capture(pose, name), { pose, name });
            await writeFile(path.join(output, `${pose}-${name}.jpg`), Buffer.from(capture.image.split(',')[1], 'base64'));
            delete capture.image; preflight[pose][name] = capture;
            expect(capture.coveredPixels).toBeGreaterThan(1000);
            expect(await page.evaluate(() => window.__plantCardsStudy.cards.getSnapshot().corrections)).toEqual(metadata.corrections);
        }
        preflight[pose].imageDifference = await page.evaluate(pose => window.__cardWidthBenchmark.compareImages(pose), pose);
        await writeFile(path.join(output, 'preflight.json'), JSON.stringify({ metadata, preflight, errors }, null, 2));
        const delta = preflight[pose].imageDifference;
        expect(delta.changedOverSixteenFraction, 'Large pixel changes must be rare despite different triangle rasterization').toBeLessThan(0.01);
        expect(delta.meanRgbError, 'Average color difference must stay below one 8-bit level').toBeLessThan(1);
        expect(delta.meanAlphaError, 'Average coverage difference must stay below one 8-bit level').toBeLessThan(1);
        expect(Math.abs(preflight[pose].wide.alphaPixelEquivalents / preflight[pose].current.alphaPixelEquivalents - 1),
            'Card width must not change leaf coverage').toBeLessThan(0.002);
    }
    if (process.env.GRASS_CARD_WIDTH_CAPTURE_ONLY === '1') {
        await page.evaluate(() => window.__cardWidthBenchmark.dispose()); expect(errors).toEqual([]); return;
    }
    console.log(`[GrassCardWidth] ${metadata.renderer}; 50,000 leaves; 60,000 versus 15,000 cards; placement and image checks passed.`);
    for (let round = 0; round < 8; round++) {
        const order = poses.slice(round % poses.length).concat(poses.slice(0, round % poses.length));
        for (const pose of order) {
            const block = await page.evaluate(({ pose, round }) => window.__cardWidthBenchmark.runRound(pose, round), { pose, round });
            blocks.push(block);
            console.log(`[GrassCardWidth] ${pose} round ${round + 1}: ${cases.map(name => `${name}=${summarizeBenchmarkTimings(block.records[name].gpu).averageMs.toFixed(4)}ms`).join(', ')}`);
        }
        telemetry.push({ phase: `round-${round + 1}`, value: await gpuStatus() });
        await writeFile(path.join(output, 'partial.json'), JSON.stringify({ metadata, preflight, blocks, telemetry, errors }, null, 2));
    }
    expect(await page.evaluate(() => window.__cardWidthBenchmark.verifyStatic())).toBe(true);
    const results = {};
    for (const pose of poses) {
        const selected = blocks.filter(block => block.pose === pose), result = results[pose] = {};
        for (const name of cases) {
            result[name] = { gpu: summarizeBenchmarkTimings(selected.flatMap(block => block.records[name].gpu)),
                roundMeans: selected.map(block => summarizeBenchmarkTimings(block.records[name].gpu).averageMs) };
            expect(result[name].gpu.count).toBe(960);
        }
        const roundDeltas = result.wide.roundMeans.map((value, i) => value - result.current.roundMeans[i]);
        const mean = roundDeltas.reduce((a, b) => a + b, 0) / roundDeltas.length;
        const sd = Math.sqrt(roundDeltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (roundDeltas.length - 1));
        const margin = 2.365 * sd / Math.sqrt(roundDeltas.length);
        result.difference = { averageMs: mean, percent: mean / result.current.gpu.averageMs * 100,
            roundDeltas, approximate95PercentIntervalMs: [mean - margin, mean + margin] };
        for (const name of ['current', 'wide']) result[name].averageMinusEmptyMs = result[name].gpu.averageMs - result.empty.gpu.averageMs;
    }
    await page.evaluate(() => window.__cardWidthBenchmark.dispose()); await page.close();
    telemetry.push({ phase: 'after', value: await gpuStatus() });
    await writeFile(path.join(output, 'results.json'), JSON.stringify({ metadata, preflight, results, blocks, telemetry, errors }, null, 2));
    const lines = ['# 50,000 leaves: current versus four-times-wider cards', '',
        `GPU: ${metadata.renderer}. Chrome ${metadata.browser}. ${metadata.date}.`, '',
        '| Layout | Width | Leaves per 24-card group | Groups | Total cards | Total triangles | Draw calls |',
        '|---|---:|---:|---:|---:|---:|---:|'];
    for (const name of ['current', 'wide']) {
        const c = metadata.cases[name];
        lines.push(`| ${name} | ${c.cardWidthMeters.toFixed(6)} m | ${c.leavesPerGroup} | ${c.instances} | ${c.cards} | ${c.triangles} | ${c.drawCalls} |`);
    }
    lines.push('', '- Both configurations represent exactly 50,000 leaves, using the current LOD3 · 24 profile.',
        '- Four neighboring 20-leaf groups merge into a single 80-leaf group. Each plane is 4x wider, retaining the same bends, heights and source leaf positions.',
        '- Both use the same repeat-wrapped 2048-square first-page PBR textures and coverage mip chain. The wide geometry spans four repeats rather than stretching the leaves or reducing texel density. This isolates card grouping; it does not test a larger unique atlas.',
        '- Normal facing and Alpha coverage remain enabled in both cases.',
        '- 1920 x 1080 RGBA16F + depth, 4x MSAA, game sunlight and environment. One draw per case.',
        '- All leaves are inside each camera: top (90°), oblique (45°), grazing (8°). Framing is identical between layouts. The field has 39 rows of 64 narrow groups plus four groups in the final row.',
        '- Eight interleaved rounds: 960 valid GPU samples/case/pose. Every frame includes empty/current/wide in balanced rotating/reversed order; pose order rotates. No missing/disjoint queries, dynamic matrix uploads or shader compilation accepted.',
        `- ${metadata.scope}`, '',
        '| Pose | Current mean / P99 ms | 4x width mean / P99 ms | Wide minus current mean | Empty mean ms |',
        '|---|---:|---:|---:|---:|');
    for (const pose of poses) {
        const r = results[pose];
        lines.push(`| ${pose} | ${r.current.gpu.averageMs.toFixed(4)} / ${r.current.gpu.p99Ms.toFixed(4)} | ${r.wide.gpu.averageMs.toFixed(4)} / ${r.wide.gpu.p99Ms.toFixed(4)} | ${r.difference.averageMs.toFixed(4)} ms (${r.difference.percent.toFixed(1)}%) | ${r.empty.gpu.averageMs.toFixed(4)} |`);
    }
    lines.push('', '| Pose | Paired round difference range ms | Approximate 95% interval ms | Current / wide alpha pixel-equivalents | Image mean RGB difference, 0–255 |',
        '|---|---:|---:|---:|---:|');
    for (const pose of poses) {
        const d = results[pose].difference, p = preflight[pose];
        lines.push(`| ${pose} | ${Math.min(...d.roundDeltas).toFixed(4)} to ${Math.max(...d.roundDeltas).toFixed(4)} | ${d.approximate95PercentIntervalMs.map(value => value.toFixed(4)).join(' to ')} | ${p.current.alphaPixelEquivalents.toFixed(1)} / ${p.wide.alphaPixelEquivalents.toFixed(1)} | ${p.imageDifference.meanRgbError.toFixed(6)} |`);
    }
    lines.push('', `100,000 source-point checks cover every represented leaf's root and tip. Maximum placement difference: ${metadata.proof.maximumLeafPositionErrorMeters.toExponential(3)} m (Float32 rounding).`,
        '', 'GPU clocks are not locked; telemetry is retained. The interval uses eight paired round differences (Student t, 7 degrees of freedom); it reflects within-run variation. Negative differences favor wide cards. GPU totals include target clear/resolve; empty measures that baseline. P99 values are never baseline-subtracted. Do not compare absolute totals to earlier runs with different framing or clock state.',
        '', 'Reproduce: select `tests/headless/perf/specs/grass_card_width_50k.pwtest.js`; set `GRASS_CARD_WIDTH_BENCHMARK=1`, `PERF_BASE_URL` and `PLAYWRIGHT_EXECUTABLE_PATH` to hardware Chrome; run `node tools/run_selected_test/run.mjs`.',
        '', 'Raw samples, counts, camera proofs, leaf-position checks, image comparisons and GPU telemetry: [results.json](results.json).', '');
    await writeFile(path.join(output, 'report.md'), lines.join('\n'));
    console.log(JSON.stringify(results)); expect(errors).toEqual([]);
});
