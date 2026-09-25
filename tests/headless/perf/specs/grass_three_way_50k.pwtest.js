// Retest card width and curve subdivision together under one material, framing and sampling schedule.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile, copyFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/three_way_50k');
const poses = ['top', 'oblique', 'grazing'], cases = ['empty', 'lod24', 'wide24', 'lod6'];
async function gpuStatus() {
    try { return (await promisify(execFile)('nvidia-smi', ['--query-gpu=name,driver_version,utilization.gpu,temperature.gpu,power.draw,clocks.current.graphics', '--format=csv'])).stdout.trim(); }
    catch (error) { return `Unavailable: ${error.message}`; }
}

test('50K leaves: regular LOD24, 4x-wide LOD24 and LOD6 with shared textures', async ({ page, browser }) => {
    test.skip(process.env.GRASS_THREE_WAY_BENCHMARK !== '1', 'Opt in with GRASS_THREE_WAY_BENCHMARK=1.');
    test.setTimeout(600000); await mkdir(output, { recursive: true });
    const errors = [], blocks = [], preflight = {}, telemetry = [{ phase: 'before', value: await gpuStatus() }];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness); await page.evaluate(() => window.__plantCardsReadiness);
    const metadata = await page.evaluate(async () => {
        const { createGrassThreeWayBenchmark } = await import('/tests/headless/perf/helpers/grass_three_way_benchmark.js');
        window.__threeWayBenchmark = await createGrassThreeWayBenchmark(window.__plantCardsStudy);
        return window.__threeWayBenchmark.metadata;
    });
    metadata.browser = browser.version(); metadata.date = new Date().toISOString();
    metadata.schedule = '8 rounds per pose; 30 warmup frames then 120 samples/case. Every frame contains all four cases in balanced rotating/reversed order. Pose order rotates between rounds.';
    expect(metadata.leaves).toBe(50000); expect(metadata.samples).toBe(4);
    expect(metadata.cases.lod24).toMatchObject({ instances: 2500, leavesPerGroup: 20, leaves: 50000, cardsPerGroup: 24, cards: 60000, triangles: 120000, drawCalls: 1 });
    expect(metadata.cases.wide24).toMatchObject({ instances: 625, leavesPerGroup: 80, leaves: 50000, cardsPerGroup: 24, cards: 15000, triangles: 30000, drawCalls: 1 });
    expect(metadata.cases.lod6).toMatchObject({ instances: 2500, leavesPerGroup: 20, leaves: 50000, cardsPerGroup: 6, cards: 15000, triangles: 30000, drawCalls: 1 });
    expect(metadata.cases.wide24.cardWidthMeters).toBeCloseTo(metadata.cases.lod24.cardWidthMeters * 4, 10);
    expect(metadata.cases.lod6.cardWidthMeters).toBe(metadata.cases.lod24.cardWidthMeters);
    expect(metadata.proof).toMatchObject({ representedLeaves: 50000, sourcePointChecks: 100000, sameMaterial: true, sameLodInstanceMatrices: true });
    expect(metadata.proof.maximumLeafPositionErrorMeters).toBeLessThan(0.00001);
    expect(metadata.corrections).toEqual({ normalFacing: true, alphaCoverage: true });
    expect(telemetry[0].value.startsWith('Unavailable:')).toBe(false);
    for (const pose of poses) {
        expect(metadata.poses[pose].fullyInFrustum).toBe(2500);
        preflight[pose] = {};
        for (const name of ['lod24', 'wide24', 'lod6']) {
            const capture = await page.evaluate(({ pose, name }) => window.__threeWayBenchmark.capture(pose, name), { pose, name });
            await writeFile(path.join(output, `${pose}-${name}.jpg`), Buffer.from(capture.image.split(',')[1], 'base64'));
            delete capture.image; preflight[pose][name] = capture;
            expect(capture.coveredPixels).toBeGreaterThan(1000);
            expect(await page.evaluate(() => window.__plantCardsStudy.cards.getSnapshot().corrections)).toEqual(metadata.corrections);
        }
        preflight[pose].imageDifferences = {};
        for (const name of ['wide24', 'lod6']) {
            preflight[pose].imageDifferences[name] = await page.evaluate(({ pose, name }) => window.__threeWayBenchmark.compareImages(pose, name), { pose, name });
            preflight[pose][name].coverageChangePercent = (preflight[pose][name].alphaPixelEquivalents / preflight[pose].lod24.alphaPixelEquivalents - 1) * 100;
        }
        const widthDelta = preflight[pose].imageDifferences.wide24;
        expect(widthDelta.meanRgbError).toBeLessThan(1);
        expect(widthDelta.meanAlphaError).toBeLessThan(1);
        expect(widthDelta.changedOverSixteenFraction).toBeLessThan(0.01);
        expect(Math.abs(preflight[pose].wide24.coverageChangePercent)).toBeLessThan(0.2);
        preflight[pose].triangleMetrics = await page.evaluate(pose => window.__threeWayBenchmark.projectedTriangleMetrics(pose), pose);
        for (const name of ['lod24', 'wide24', 'lod6']) expect(preflight[pose].triangleMetrics[name].triangles).toBe(metadata.cases[name].triangles);
        await writeFile(path.join(output, 'preflight.json'), JSON.stringify({ metadata, preflight, errors }, null, 2));
    }
    if (process.env.GRASS_THREE_WAY_CAPTURE_ONLY === '1') {
        await page.evaluate(() => window.__threeWayBenchmark.dispose()); expect(errors).toEqual([]); return;
    }
    console.log(`[GrassThreeWay] ${metadata.renderer}; 50,000 leaves; three grass cases plus empty; shared material, placements and full-field framing verified.`);
    for (let round = 0; round < 8; round++) {
        const order = poses.slice(round % poses.length).concat(poses.slice(0, round % poses.length));
        for (const pose of order) {
            const block = await page.evaluate(({ pose, round }) => window.__threeWayBenchmark.runRound(pose, round), { pose, round });
            blocks.push(block);
            console.log(`[GrassThreeWay] ${pose} round ${round + 1}: ${cases.map(name => `${name}=${summarizeBenchmarkTimings(block.records[name].gpu).averageMs.toFixed(4)}ms`).join(', ')}`);
        }
        telemetry.push({ phase: `round-${round + 1}`, value: await gpuStatus() });
        await writeFile(path.join(output, 'partial.json'), JSON.stringify({ metadata, preflight, blocks, telemetry, errors }, null, 2));
    }
    expect(await page.evaluate(() => window.__threeWayBenchmark.verifyStatic())).toBe(true);
    const results = {};
    const comparisons = [
        ['wide24_vs_lod24', 'wide24', 'lod24'],
        ['lod6_vs_lod24', 'lod6', 'lod24'],
        ['lod6_vs_wide24', 'lod6', 'wide24']
    ];
    for (const pose of poses) {
        const selected = blocks.filter(block => block.pose === pose), r = results[pose] = {};
        for (const name of cases) {
            r[name] = { gpu: summarizeBenchmarkTimings(selected.flatMap(block => block.records[name].gpu)),
                roundMeans: selected.map(block => summarizeBenchmarkTimings(block.records[name].gpu).averageMs) };
            expect(r[name].gpu.count).toBe(960);
        }
        r.comparisons = {};
        for (const [key, candidate, reference] of comparisons) {
            const deltas = r[candidate].roundMeans.map((value, index) => value - r[reference].roundMeans[index]);
            const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
            const sd = Math.sqrt(deltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (deltas.length - 1));
            const margin = 2.365 * sd / Math.sqrt(deltas.length);
            r.comparisons[key] = { meanMs: mean, percent: mean / r[reference].gpu.averageMs * 100,
                roundDeltas: deltas, approximate95PercentIntervalMs: [mean - margin, mean + margin] };
        }
        for (const name of ['lod24', 'wide24', 'lod6']) r[name].averageMinusEmptyMs = r[name].gpu.averageMs - r.empty.gpu.averageMs;
    }
    await page.evaluate(() => window.__threeWayBenchmark.dispose()); await page.close();
    telemetry.push({ phase: 'after', value: await gpuStatus() });
    expect(errors).toEqual([]);
    expect(telemetry.every(entry => !entry.value.startsWith('Unavailable:'))).toBe(true);
    const stamp = metadata.date.replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z');
    const archive = path.resolve('tests/artifacts/screens/grass_debug_v2/benchmark_archive', stamp + '_three_way_50k');
    metadata.archiveDirectory = path.relative(process.cwd(), archive);
    await writeFile(path.join(output, 'results.json'), JSON.stringify({ metadata, preflight, results, blocks, telemetry, errors }, null, 2));
    const labels = { lod24: 'LOD3 · 24', wide24: 'LOD3 · 24, 4x width', lod6: 'LOD3 · 6' };
    const lines = ['# 50,000 leaves: controlled width versus subdivision benchmark', '',
        'GPU: ' + metadata.renderer + '. Chrome ' + metadata.browser + '. ' + metadata.date + '.', '',
        '| Case | Leaves | Groups | Leaves/group | Total cards | Total triangles | Draws |',
        '|---|---:|---:|---:|---:|---:|---:|'];
    for (const name of ['lod24', 'wide24', 'lod6']) {
        const c = metadata.cases[name];
        lines.push('| ' + [labels[name], c.leaves, c.instances, c.leavesPerGroup, c.cards, c.triangles, c.drawCalls].join(' | ') + ' |');
    }
    lines.push('', '- All three cases share the same first-page 2048-square repeating PBR textures and corrected alpha mip chain. Normal facing and Alpha coverage stay enabled.',
        '- The wide cards use four texture repeats, preserving source leaf positions and texel density. LOD6 uses the same narrow transforms as LOD24, with fewer curve segments.',
        '- The original two comparisons used different texture layouts and GPU operating conditions. This run controls those differences between its cases.',
        '- 100,000 source-point checks verify every root and tip in the wide grouping. Maximum placement error: ' + metadata.proof.maximumLeafPositionErrorMeters.toExponential(3) + ' m.',
        '- All 50,000 leaves remain inside each of the top (90°), oblique (45°), and grazing (8°) cameras. Identical framing per case; pose footprints differ.',
        '- 1920 × 1080 RGBA16F + depth, 4x MSAA; same game sunlight and environment.',
        '- Eight rounds, 30 warmup frames then 120 samples/case/pose: 960 valid GPU samples. Empty and all three grass cases are interleaved with balanced positions and rotating pose order.',
        '- Submitted counts, static matrices, query validity, image coverage and shader program counts are checked.',
        '- ' + metadata.scope, '',
        '| Pose | LOD24 avg / P99 ms | Wide LOD24 avg / P99 ms | LOD6 avg / P99 ms | Empty avg ms |',
        '|---|---:|---:|---:|---:|');
    for (const pose of poses) {
        const r = results[pose];
        lines.push('| ' + [pose, ...['lod24', 'wide24', 'lod6'].map(name => r[name].gpu.averageMs.toFixed(4) + ' / ' + r[name].gpu.p99Ms.toFixed(4)),
            r.empty.gpu.averageMs.toFixed(4)].join(' | ') + ' |');
    }
    lines.push('', '| Pose | Comparison | Mean difference | Approximate 95% interval ms |',
        '|---|---|---:|---:|');
    for (const pose of poses) for (const [key] of comparisons) {
        const c = results[pose].comparisons[key];
        lines.push('| ' + [pose, key, c.meanMs.toFixed(4) + ' ms (' + c.percent.toFixed(1) + '%)',
            c.approximate95PercentIntervalMs.map(value => value.toFixed(4)).join(' to ')].join(' | ') + ' |');
    }
    lines.push('', '| Pose | Case | Mean above empty ms | Alpha pixel-equivalents | Coverage change vs LOD24 | Triangle perimeter / area, px⁻¹ | Mean longest edge / altitude |',
        '|---|---|---:|---:|---:|---:|---:|');
    for (const pose of poses) for (const name of ['lod24', 'wide24', 'lod6']) {
        const p = preflight[pose][name], t = preflight[pose].triangleMetrics[name];
        lines.push('| ' + [pose, labels[name], results[pose][name].averageMinusEmptyMs.toFixed(4), p.alphaPixelEquivalents.toFixed(1),
            name === 'lod24' ? '0%' : p.coverageChangePercent.toFixed(3) + '%',
            t.perimeterPerArea.toFixed(3), t.meanLongestEdgeToAltitude.toFixed(2)].join(' | ') + ' |');
    }
    lines.push('', 'Projected triangle area/perimeter diagnostics include transparent parts of cards and count every triangle. They describe geometry, not measured fragment invocations, overdraw or GPU hardware counters. Shared edges count for each adjacent triangle. Matching final alpha coverage does not imply identical intermediate fragment work.',
        '', 'Approximate intervals use eight paired round means and Student t (seven degrees of freedom). Negative differences favor the candidate. GPU clocks are not locked, desktop load is not isolated, and telemetry is retained. P99 is not baseline-subtracted.',
        '', 'Reproduce: tests/headless/perf/specs/grass_three_way_50k.pwtest.js; GRASS_THREE_WAY_BENCHMARK=1; PERF_BASE_URL and PLAYWRIGHT_EXECUTABLE_PATH set to hardware Chrome; node tools/run_selected_test/run.mjs.',
        '', 'Raw samples and diagnostics: [results.json](results.json). Setup checks: [preflight.json](preflight.json).',
        '', '| Pose | LOD24 | Wide LOD24 | LOD6 |', '|---|---|---|---|');
    for (const pose of poses) lines.push('| ' + pose + ' | ' + ['lod24', 'wide24', 'lod6'].map(name => '[Capture](' + pose + '-' + name + '.jpg)').join(' | ') + ' |');
    await writeFile(path.join(output, 'report.md'), lines.join('\n') + '\n');
    await mkdir(path.dirname(archive), { recursive: true }); await mkdir(archive);
    for (const file of await readdir(output)) {
        if (['report.md', 'results.json', 'preflight.json'].includes(file) || /^(top|oblique|grazing)-(lod24|wide24|lod6)\.jpg$/.test(file))
            await copyFile(path.join(output, file), path.join(archive, file));
    }
    console.log(JSON.stringify({ results, archive, rasterMetrics: Object.fromEntries(poses.map(pose => [pose, preflight[pose].triangleMetrics])) }));
});
