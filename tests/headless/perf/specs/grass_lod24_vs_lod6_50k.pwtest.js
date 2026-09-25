// Compare the live 24-card and 6-card LODs for the same 50,000 source leaves.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile, copyFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod24_vs_lod6_50k');
const poses = ['top', 'oblique', 'grazing'], cases = ['empty', 'lod24', 'lod6'];
async function gpuStatus() {
    try { return (await promisify(execFile)('nvidia-smi', ['--query-gpu=name,driver_version,utilization.gpu,temperature.gpu,power.draw,clocks.current.graphics', '--format=csv'])).stdout.trim(); }
    catch (error) { return `Unavailable: ${error.message}`; }
}

test('50K leaves: LOD3 24 versus LOD3 6 with identical source leaf placement', async ({ page, browser }) => {
    test.skip(process.env.GRASS_LOD_COMPARISON_BENCHMARK !== '1', 'Opt in with GRASS_LOD_COMPARISON_BENCHMARK=1.');
    test.setTimeout(600000); await mkdir(output, { recursive: true });
    const errors = [], blocks = [], preflight = {}, telemetry = [{ phase: 'before', value: await gpuStatus() }];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness); await page.evaluate(() => window.__plantCardsReadiness);
    const metadata = await page.evaluate(async () => {
        const { createGrassLodComparisonBenchmark } = await import('/tests/headless/perf/helpers/grass_lod_comparison_benchmark.js');
        window.__lodComparisonBenchmark = await createGrassLodComparisonBenchmark(window.__plantCardsStudy);
        return window.__lodComparisonBenchmark.metadata;
    });
    metadata.browser = browser.version(); metadata.date = new Date().toISOString();
    metadata.schedule = '8 rounds per pose; 30 warmup frames then 120 samples/case. Every frame contains all three cases in balanced rotating/reversed order. Pose order rotates between rounds.';
    expect(metadata.leaves).toBe(50000); expect(metadata.samples).toBe(4);
    expect(metadata.cases.lod24).toMatchObject({ instances: 2500, leavesPerGroup: 20, leaves: 50000, cardsPerGroup: 24, cards: 60000, triangles: 120000, drawCalls: 1 });
    expect(metadata.cases.lod6).toMatchObject({ instances: 2500, leavesPerGroup: 20, leaves: 50000, cardsPerGroup: 6, cards: 15000, triangles: 30000, drawCalls: 1 });
    expect(metadata.cases.lod6.cardWidthMeters).toBe(metadata.cases.lod24.cardWidthMeters);
    expect(metadata.proof).toMatchObject({ representedLeaves: 50000, identicalInstanceMatrices: true,
        sameMaterial: true, originalProductionGeometry: true, originalProductionAtlas: true });
    expect(metadata.corrections).toEqual({ normalFacing: true, alphaCoverage: true });
    for (const pose of poses) {
        expect(metadata.poses[pose].fullyInFrustum).toBe(2500);
        preflight[pose] = {};
        for (const name of ['lod24', 'lod6']) {
            const capture = await page.evaluate(({ pose, name }) => window.__lodComparisonBenchmark.capture(pose, name), { pose, name });
            await writeFile(path.join(output, `${pose}-${name}.jpg`), Buffer.from(capture.image.split(',')[1], 'base64'));
            delete capture.image; preflight[pose][name] = capture;
            expect(capture.coveredPixels).toBeGreaterThan(1000);
            expect(await page.evaluate(() => window.__plantCardsStudy.cards.getSnapshot().corrections)).toEqual(metadata.corrections);
        }
        preflight[pose].imageDifference = await page.evaluate(pose => window.__lodComparisonBenchmark.compareImages(pose), pose);
        preflight[pose].coverageChangePercent = (preflight[pose].lod6.alphaPixelEquivalents / preflight[pose].lod24.alphaPixelEquivalents - 1) * 100;
        await writeFile(path.join(output, 'preflight.json'), JSON.stringify({ metadata, preflight, errors }, null, 2));
    }
    if (process.env.GRASS_LOD_COMPARISON_CAPTURE_ONLY === '1') {
        await page.evaluate(() => window.__lodComparisonBenchmark.dispose()); expect(errors).toEqual([]); return;
    }
    console.log(`[GrassLodComparison] ${metadata.renderer}; 50,000 leaves; 60,000 versus 15,000 cards; identical transforms, production geometries and full-field framing verified.`);
    for (let round = 0; round < 8; round++) {
        const order = poses.slice(round % poses.length).concat(poses.slice(0, round % poses.length));
        for (const pose of order) {
            const block = await page.evaluate(({ pose, round }) => window.__lodComparisonBenchmark.runRound(pose, round), { pose, round });
            blocks.push(block);
            console.log(`[GrassLodComparison] ${pose} round ${round + 1}: ${cases.map(name => `${name}=${summarizeBenchmarkTimings(block.records[name].gpu).averageMs.toFixed(4)}ms`).join(', ')}`);
        }
        telemetry.push({ phase: `round-${round + 1}`, value: await gpuStatus() });
        await writeFile(path.join(output, 'partial.json'), JSON.stringify({ metadata, preflight, blocks, telemetry, errors }, null, 2));
    }
    expect(await page.evaluate(() => window.__lodComparisonBenchmark.verifyStatic())).toBe(true);
    const results = {};
    for (const pose of poses) {
        const selected = blocks.filter(block => block.pose === pose), result = results[pose] = {};
        for (const name of cases) {
            result[name] = { gpu: summarizeBenchmarkTimings(selected.flatMap(block => block.records[name].gpu)),
                roundMeans: selected.map(block => summarizeBenchmarkTimings(block.records[name].gpu).averageMs) };
            expect(result[name].gpu.count).toBe(960);
        }
        const roundDeltas = result.lod6.roundMeans.map((value, i) => value - result.lod24.roundMeans[i]);
        const mean = roundDeltas.reduce((a, b) => a + b, 0) / roundDeltas.length;
        const sd = Math.sqrt(roundDeltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (roundDeltas.length - 1));
        const margin = 2.365 * sd / Math.sqrt(roundDeltas.length);
        result.difference = { averageMs: mean, percent: mean / result.lod24.gpu.averageMs * 100,
            roundDeltas, approximate95PercentIntervalMs: [mean - margin, mean + margin] };
        for (const name of ['lod24', 'lod6']) result[name].averageMinusEmptyMs = result[name].gpu.averageMs - result.empty.gpu.averageMs;
    }
    await page.evaluate(() => window.__lodComparisonBenchmark.dispose()); await page.close();
    telemetry.push({ phase: 'after', value: await gpuStatus() });
    expect(errors).toEqual([]);
    const stamp = metadata.date.replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z');
    const archive = path.resolve('tests/artifacts/screens/grass_debug_v2/benchmark_archive', stamp + '_lod24_vs_lod6_50k');
    metadata.archiveDirectory = path.relative(process.cwd(), archive);
    await writeFile(path.join(output, 'results.json'), JSON.stringify({ metadata, preflight, results, blocks, telemetry, errors }, null, 2));
    const lines = ['# 50,000 leaves: LOD3 · 24 versus LOD3 · 6', '',
        'GPU: ' + metadata.renderer + '. Chrome ' + metadata.browser + '. ' + metadata.date + '.', '',
        '| LOD | Leaves | Tufts | Cards per tuft | Total cards | Total triangles | Draws |',
        '|---|---:|---:|---:|---:|---:|---:|'];
    for (const name of ['lod24', 'lod6']) {
        const c = metadata.cases[name];
        lines.push('| ' + [name, c.leaves, c.instances, c.cardsPerGroup, c.cards, c.triangles, c.drawCalls].join(' | ') + ' |');
    }
    lines.push('', '- Both cases use the live production geometry, original shared PBR atlas and material. Normal facing and Alpha coverage are enabled.',
        '- All 2,500 instance matrices match exactly. Each tuft represents the same 20 source leaves. No width changes or source-leaf redistribution.',
        '- All 50,000 represented leaves are inside top (90°), oblique (45°) and grazing (8°) cameras. Identical camera/framing per case; pose footprints differ.',
        '- Field: ' + metadata.fieldMeters.map(value => value.toFixed(3)).join(' × ') + ' m. ' + metadata.rowOccupancy,
        '- 1920 × 1080 RGBA16F + depth, 4× MSAA; game sunlight and environment.',
        '- Eight balanced interleaved rounds, 30 warmup frames then 120 samples/case/pose/round: 960 GPU samples per case/pose. Pose order rotates.',
        '- No missing/disjoint queries, runtime matrix uploads or shader compilation accepted. Submitted card/triangle counts checked each pass.',
        '- ' + metadata.scope, '',
        '| Pose | LOD24 mean / P99 ms | LOD6 mean / P99 ms | LOD6 minus LOD24 | Empty mean ms |',
        '|---|---:|---:|---:|---:|');
    for (const pose of poses) {
        const r = results[pose];
        lines.push('| ' + [pose, r.lod24.gpu.averageMs.toFixed(4) + ' / ' + r.lod24.gpu.p99Ms.toFixed(4),
            r.lod6.gpu.averageMs.toFixed(4) + ' / ' + r.lod6.gpu.p99Ms.toFixed(4),
            r.difference.averageMs.toFixed(4) + ' ms (' + r.difference.percent.toFixed(1) + '%)',
            r.empty.gpu.averageMs.toFixed(4)].join(' | ') + ' |');
    }
    lines.push('', '| Pose | LOD24 / LOD6 mean above empty ms | Approximate 95% interval, LOD6 minus LOD24 ms | LOD24 / LOD6 alpha pixel-equivalents | Alpha coverage change |',
        '|---|---:|---:|---:|---:|');
    for (const pose of poses) {
        const r = results[pose], p = preflight[pose];
        lines.push('| ' + [pose, r.lod24.averageMinusEmptyMs.toFixed(4) + ' / ' + r.lod6.averageMinusEmptyMs.toFixed(4),
            r.difference.approximate95PercentIntervalMs.map(value => value.toFixed(4)).join(' to '),
            p.lod24.alphaPixelEquivalents.toFixed(1) + ' / ' + p.lod6.alphaPixelEquivalents.toFixed(1),
            p.coverageChangePercent.toFixed(3) + '%'].join(' | ') + ' |');
    }
    lines.push('', 'Total card surface area per tuft: LOD24 ' + metadata.proof.cardAreaPerGroupMetersSquared.lod24.toFixed(6)
        + ' m²; LOD6 ' + metadata.proof.cardAreaPerGroupMetersSquared.lod6.toFixed(6) + ' m².',
        '', 'This measures the practical LOD change: fewer segments can alter silhouette, projected area and sampling. It is not an identical-image or isolated triangle-throughput benchmark. Final alpha coverage is not total fragment overdraw.',
        '', 'GPU clocks are not locked; telemetry is retained. Approximate intervals use eight paired round differences (Student t, seven degrees of freedom) and describe within-run variation. Negative differences favor LOD6. GPU pass totals include clear/resolve; empty measures that baseline. P99 is never baseline-subtracted. Do not compare absolute totals to previous runs.',
        '', 'Reproduce: select tests/headless/perf/specs/grass_lod24_vs_lod6_50k.pwtest.js, set GRASS_LOD_COMPARISON_BENCHMARK=1, PERF_BASE_URL and PLAYWRIGHT_EXECUTABLE_PATH to hardware Chrome, then run node tools/run_selected_test/run.mjs.',
        '', 'Full data: [results.json](results.json). Validation: [preflight.json](preflight.json).',
        '', '| Pose | LOD3 · 24 | LOD3 · 6 |', '|---|---|---|');
    for (const pose of poses) lines.push('| ' + pose + ' | [Capture](' + pose + '-lod24.jpg) | [Capture](' + pose + '-lod6.jpg) |');
    await writeFile(path.join(output, 'report.md'), lines.join('\n') + '\n');
    await mkdir(path.dirname(archive), { recursive: true });
    await mkdir(archive);
    for (const file of await readdir(output)) {
        if (['report.md', 'results.json', 'preflight.json'].includes(file) || /^(top|oblique|grazing)-(lod24|lod6)\.jpg$/.test(file))
            await copyFile(path.join(output, file), path.join(archive, file));
    }
    console.log(JSON.stringify({ results, archive, coverage: Object.fromEntries(poses.map(pose => [pose, preflight[pose].coverageChangePercent])) }));
});
