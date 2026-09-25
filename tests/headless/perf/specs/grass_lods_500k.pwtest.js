// Compare 24, 12 and 6-card production LODs for the same 500,000 leaves.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile, copyFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lods_500k');
const poses = ['top', 'oblique', 'grazing'], cases = ['empty', 'lod24', 'lod12', 'lod6'];
async function gpuStatus() {
    try { return (await promisify(execFile)('nvidia-smi', ['--query-gpu=name,driver_version,utilization.gpu,temperature.gpu,power.draw,clocks.current.graphics', '--format=csv'])).stdout.trim(); }
    catch (error) { return `Unavailable: ${error.message}`; }
}

test('500K leaves: LOD3 24 versus 12 versus 6 with identical placements', async ({ page, browser }) => {
    test.skip(process.env.GRASS_LODS_500K_BENCHMARK !== '1', 'Opt in with GRASS_LODS_500K_BENCHMARK=1.');
    test.setTimeout(600000); await mkdir(output, { recursive: true });
    const errors = [], blocks = [], preflight = {}, telemetry = [{ phase: 'before', value: await gpuStatus() }];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness); await page.evaluate(() => window.__plantCardsReadiness);
    const metadata = await page.evaluate(async () => {
        const { createGrassLods500kBenchmark } = await import('/tests/headless/perf/helpers/grass_lods_500k_benchmark.js');
        window.__lods500kBenchmark = await createGrassLods500kBenchmark(window.__plantCardsStudy);
        return window.__lods500kBenchmark.metadata;
    });
    metadata.browser = browser.version(); metadata.date = new Date().toISOString();
    metadata.schedule = '8 rounds per pose; 30 warmup frames then 120 samples/case. Every frame contains all four cases in balanced rotating/reversed order. Pose order rotates between rounds.';
    expect(metadata.leaves).toBe(500000); expect(metadata.samples).toBe(4);
    expect(metadata.cases.lod24).toMatchObject({ instances: 25000, leavesPerGroup: 20, leaves: 500000, cardsPerGroup: 24, cards: 600000, triangles: 1200000, drawCalls: 1 });
    expect(metadata.cases.lod12).toMatchObject({ instances: 25000, leavesPerGroup: 20, leaves: 500000, cardsPerGroup: 12, cards: 300000, triangles: 600000, drawCalls: 1 });
    expect(metadata.cases.lod6).toMatchObject({ instances: 25000, leavesPerGroup: 20, leaves: 500000, cardsPerGroup: 6, cards: 150000, triangles: 300000, drawCalls: 1 });
    expect(metadata.cases.lod12.cardWidthMeters).toBe(metadata.cases.lod24.cardWidthMeters);
    expect(metadata.cases.lod6.cardWidthMeters).toBe(metadata.cases.lod24.cardWidthMeters);
    expect(metadata.proof).toMatchObject({ representedLeaves: 500000, identicalInstanceMatrices: true,
        sameMaterial: true, originalProductionGeometry: true, originalProductionAtlas: true });
    expect(metadata.corrections).toEqual({ normalFacing: true, alphaCoverage: true });
    expect(telemetry[0].value.startsWith('Unavailable:')).toBe(false);
    for (const pose of poses) {
        expect(metadata.poses[pose].fullyInFrustum).toBe(25000);
        preflight[pose] = {};
        for (const name of ['lod24', 'lod12', 'lod6']) {
            const capture = await page.evaluate(({ pose, name }) => window.__lods500kBenchmark.capture(pose, name), { pose, name });
            await writeFile(path.join(output, `${pose}-${name}.jpg`), Buffer.from(capture.image.split(',')[1], 'base64'));
            delete capture.image; preflight[pose][name] = capture;
            expect(capture.coveredPixels).toBeGreaterThan(1000);
            expect(await page.evaluate(() => window.__plantCardsStudy.cards.getSnapshot().corrections)).toEqual(metadata.corrections);
        }
        preflight[pose].imageDifferences = {};
        for (const name of ['lod12', 'lod6']) {
            preflight[pose].imageDifferences[name] = await page.evaluate(({ pose, name }) => window.__lods500kBenchmark.compareImages(pose, name), { pose, name });
            preflight[pose][name].coverageChangePercent = (preflight[pose][name].alphaPixelEquivalents / preflight[pose].lod24.alphaPixelEquivalents - 1) * 100;
        }
        await writeFile(path.join(output, 'preflight.json'), JSON.stringify({ metadata, preflight, errors }, null, 2));
    }
    if (process.env.GRASS_LODS_500K_CAPTURE_ONLY === '1') {
        await page.evaluate(() => window.__lods500kBenchmark.dispose()); expect(errors).toEqual([]); return;
    }
    console.log(`[GrassLods500k] ${metadata.renderer}; 500,000 leaves; three grass cases plus empty; shared material, placements and full-field framing verified.`);
    for (let round = 0; round < 8; round++) {
        const order = poses.slice(round % poses.length).concat(poses.slice(0, round % poses.length));
        for (const pose of order) {
            const block = await page.evaluate(({ pose, round }) => window.__lods500kBenchmark.runRound(pose, round), { pose, round });
            blocks.push(block);
            console.log(`[GrassLods500k] ${pose} round ${round + 1}: ${cases.map(name => `${name}=${summarizeBenchmarkTimings(block.records[name].gpu).averageMs.toFixed(4)}ms`).join(', ')}`);
        }
        telemetry.push({ phase: `round-${round + 1}`, value: await gpuStatus() });
        await writeFile(path.join(output, 'partial.json'), JSON.stringify({ metadata, preflight, blocks, telemetry, errors }, null, 2));
    }
    expect(await page.evaluate(() => window.__lods500kBenchmark.verifyStatic())).toBe(true);
    const results = {};
    const comparisons = [
        ['lod12_vs_lod24', 'lod12', 'lod24'],
        ['lod6_vs_lod24', 'lod6', 'lod24'],
        ['lod6_vs_lod12', 'lod6', 'lod12']
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
        for (const name of ['lod24', 'lod12', 'lod6']) r[name].averageMinusEmptyMs = r[name].gpu.averageMs - r.empty.gpu.averageMs;
    }
    await page.evaluate(() => window.__lods500kBenchmark.dispose()); await page.close();
    telemetry.push({ phase: 'after', value: await gpuStatus() });
    expect(errors).toEqual([]);
    expect(telemetry.every(entry => !entry.value.startsWith('Unavailable:'))).toBe(true);
    const stamp = metadata.date.replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z');
    const archive = path.resolve('tests/artifacts/screens/grass_debug_v2/benchmark_archive', stamp + '_lods_500k');
    metadata.archiveDirectory = path.relative(process.cwd(), archive);
    await writeFile(path.join(output, 'results.json'), JSON.stringify({ metadata, preflight, results, blocks, telemetry, errors }, null, 2));
    const names = ['lod24', 'lod12', 'lod6'];
    const labels = { lod24: 'LOD3 · 24', lod12: 'LOD3 · 12', lod6: 'LOD3 · 6' };
    const lines = ['# 500,000 leaves: LOD3 · 24 versus · 12 versus · 6', '',
        'GPU: ' + metadata.renderer + '. Chrome ' + metadata.browser + '. ' + metadata.date + '.', '',
        '| LOD | Leaves | Tufts | Cards per tuft | Total cards | Total triangles | Draws |',
        '|---|---:|---:|---:|---:|---:|---:|'];
    for (const name of names) {
        const c = metadata.cases[name];
        lines.push('| ' + [labels[name], c.leaves, c.instances, c.cardsPerGroup, c.cards, c.triangles, c.drawCalls].join(' | ') + ' |');
    }
    lines.push('', '- All three cases use original live production geometries and share the original PBR atlas, mip chain and material. Normal facing and Alpha coverage are enabled.',
        '- Exactly 25,000 bit-identical tuft transforms in every case; twenty source leaves per tuft, at unchanged source spacing.',
        '- Field: ' + metadata.fieldMeters.map(value => value.toFixed(3)).join(' × ') + ' m. ' + metadata.rowOccupancy,
        '- All 500,000 represented leaves remain inside top (90°), oblique (45°) and grazing (8°) cameras. Framing is identical between LODs.',
        '- The larger field is framed by pulling the cameras back. This is not ten times the earlier count within the same screen-scale/density setup.',
        '- 1920 × 1080 RGBA16F + depth, 4× MSAA; same game sunlight/environment.',
        '- Eight rounds, 30 warmup frames then 120 GPU samples per case/pose: 960 valid samples. Empty/LOD24/LOD12/LOD6 are interleaved with balanced positions and rotating pose order.',
        '- Source and submitted counts, static matrices, timer queries and shader program counts pass validation. Coverage and image differences are recorded separately.',
        '- ' + metadata.scope, '',
        '| Pose | LOD24 avg / P99 ms | LOD12 avg / P99 ms | LOD6 avg / P99 ms | Empty avg ms |',
        '|---|---:|---:|---:|---:|');
    for (const pose of poses) {
        const r = results[pose];
        lines.push('| ' + [pose, ...names.map(name => r[name].gpu.averageMs.toFixed(4) + ' / ' + r[name].gpu.p99Ms.toFixed(4)),
            r.empty.gpu.averageMs.toFixed(4)].join(' | ') + ' |');
    }
    lines.push('', '| Pose | Comparison | Mean difference | Approximate 95% interval ms |',
        '|---|---|---:|---:|');
    for (const pose of poses) for (const [key] of comparisons) {
        const c = results[pose].comparisons[key];
        lines.push('| ' + [pose, key, c.meanMs.toFixed(4) + ' ms (' + c.percent.toFixed(1) + '%)',
            c.approximate95PercentIntervalMs.map(value => value.toFixed(4)).join(' to ')].join(' | ') + ' |');
    }
    lines.push('', '| Pose | LOD | Mean above empty ms | Alpha pixel-equivalents | Alpha coverage change vs LOD24 |',
        '|---|---|---:|---:|---:|');
    for (const pose of poses) for (const name of names) {
        const p = preflight[pose][name];
        lines.push('| ' + [pose, labels[name], results[pose][name].averageMinusEmptyMs.toFixed(4), p.alphaPixelEquivalents.toFixed(1),
            name === 'lod24' ? '0%' : p.coverageChangePercent.toFixed(3) + '%'].join(' | ') + ' |');
    }
    lines.push('', 'The proxy geometry changes with LOD, so silhouette, sample coverage and shading can differ despite identical source placements. Final alpha coverage is not total fragment overdraw or an image-equivalence proof.',
        '', 'Approximate intervals use eight paired round means and Student t (seven degrees of freedom). Negative differences favor the candidate. GPU clocks are not locked, desktop load is not isolated, and telemetry is retained. P99 is absolute, never baseline-subtracted.',
        '', 'Reproduce: tests/headless/perf/specs/grass_lods_500k.pwtest.js; GRASS_LODS_500K_BENCHMARK=1; PERF_BASE_URL and PLAYWRIGHT_EXECUTABLE_PATH set to hardware Chrome; node tools/run_selected_test/run.mjs.',
        '', 'Raw results: [results.json](results.json). Setup and image diagnostics: [preflight.json](preflight.json).',
        '', '| Pose | LOD24 | LOD12 | LOD6 |', '|---|---|---|---|');
    for (const pose of poses) lines.push('| ' + pose + ' | ' + names.map(name => '[Capture](' + pose + '-' + name + '.jpg)').join(' | ') + ' |');
    await writeFile(path.join(output, 'report.md'), lines.join('\n') + '\n');
    await mkdir(path.dirname(archive), { recursive: true }); await mkdir(archive);
    for (const file of await readdir(output)) {
        if (['report.md', 'results.json', 'preflight.json'].includes(file) || /^(top|oblique|grazing)-(lod24|lod12|lod6)\.jpg$/.test(file))
            await copyFile(path.join(output, file), path.join(archive, file));
    }
    console.log(JSON.stringify({ results, archive,
        coverage: Object.fromEntries(poses.map(pose => [pose, Object.fromEntries(['lod12', 'lod6'].map(name => [name, preflight[pose][name].coverageChangePercent]))])) }));
});
