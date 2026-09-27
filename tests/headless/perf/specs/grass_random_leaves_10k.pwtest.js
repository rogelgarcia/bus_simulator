// Opt-in 10,000 randomized single-leaf comparison at full LOD0, ten cards and five cards.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { summarizeBenchmarkTimings as summarize } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/random_leaves_10k');
async function telemetry() {
    try { return (await promisify(execFile)('nvidia-smi', ['--query-gpu=name,driver_version,utilization.gpu,temperature.gpu,power.draw,clocks.current.graphics', '--format=csv'])).stdout.trim(); }
    catch (error) { return error.message; }
}

test('10K leaves in one square meter: LOD0 versus LOD3 10 and 5', async ({ page, browser }) => {
    test.skip(process.env.GRASS_RANDOM_10K !== '1', 'Opt in with GRASS_RANDOM_10K=1.');
    test.setTimeout(600000); await mkdir(output, { recursive: true });
    const errors = [], blocks = [], gpuStatus = [{ phase: 'before', value: await telemetry() }];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=leaf');
    await page.waitForFunction(() => !!window.__plantCardsReadiness); await page.evaluate(() => window.__plantCardsReadiness);
    const metadata = await page.evaluate(async () => {
        const { createGrassRandomLeaves10kBenchmark } = await import('/tests/headless/perf/helpers/grass_random_leaves_10k_benchmark.js');
        window.__random10k = await createGrassRandomLeaves10kBenchmark(window.__plantCardsStudy);
        return window.__random10k.metadata;
    });
    metadata.browser = browser.version(); metadata.date = new Date().toISOString();
    metadata.schedule = 'Three rotating rounds; each block has 20 warmup frames and 100 GPU samples. All cases use the same three-quarter camera. Cached sun shadows and per-frame sun-shadow refresh measured separately.';
    for (const bend of metadata.variation.bends) expect(bend.lengthMeters).toBeCloseTo(metadata.variation.bends[2].lengthMeters, 7);
    expect(metadata.leaves).toBe(10000); expect(metadata.identicalPlacements).toBe(true);
    expect(metadata.bounds.min[0]).toBeGreaterThanOrEqual(-0.500001); expect(metadata.bounds.max[0]).toBeLessThanOrEqual(0.500001);
    expect(metadata.bounds.min[2]).toBeGreaterThanOrEqual(-0.500001); expect(metadata.bounds.max[2]).toBeLessThanOrEqual(0.500001);
    expect(metadata.cases.lod0.triangles).toBe(78560000);
    expect(metadata.cases.lod10).toMatchObject({ leaves: 10000, cards: 100000, triangles: 200000 });
    expect(metadata.cases.lod5).toMatchObject({ leaves: 10000, cards: 50000, triangles: 100000 });
    for (const name of ['lod0', 'lod10', 'lod5']) expect(metadata.submitted[name].triangles).toBeGreaterThanOrEqual(metadata.cases[name].triangles);
    await writeFile(path.join(output, 'placements.json'), JSON.stringify(await page.evaluate(() => window.__random10k.placements)));
    await writeFile(path.join(output, 'metadata.json'), JSON.stringify(metadata, null, 2));
    console.log('[GrassRandom10K] ' + metadata.renderer + '; setup and counts verified.');
    for (const pose of ['three_quarter', 'top']) for (const name of ['lod0', 'lod10', 'lod5']) {
        const capture = await page.evaluate(({ name, pose }) => window.__random10k.capture(name, pose), { name, pose });
        await writeFile(path.join(output, pose + '-' + name + '.png'), Buffer.from(capture.split(',')[1], 'base64'));
    }
    console.log('[GrassRandom10K] Six screenshots saved.');
    for (let round = 0; round < 3; round++) {
        const cases = ['empty', 'lod0', 'lod10', 'lod5'];
        const order = cases.slice(round).concat(cases.slice(0, round));
        for (const refreshShadows of [false, true]) for (const name of order) {
            if (refreshShadows && name === 'empty') continue;
            const block = await page.evaluate(({ name, refreshShadows }) => window.__random10k.runBlock(name, refreshShadows), { name, refreshShadows });
            blocks.push({ round, ...block });
            console.log('[GrassRandom10K] Round ' + (round + 1) + ' ' + name + (refreshShadows ? ' refreshed shadows ' : ' cached shadows ')
                + summarize(block.gpu).averageMs.toFixed(3) + ' ms GPU.');
            await writeFile(path.join(output, 'partial.json'), JSON.stringify({ metadata, blocks, errors }, null, 2));
        }
        gpuStatus.push({ phase: 'round-' + (round + 1), value: await telemetry() });
    }
    const results = {};
    for (const name of ['empty', 'lod0', 'lod10', 'lod5']) {
        results[name] = {};
        for (const refreshShadows of [false, true]) {
            const selected = blocks.filter(block => block.name === name && block.refreshShadows === refreshShadows);
            if (!selected.length) continue;
            const stats = { gpu: summarize(selected.flatMap(b => b.gpu)), cpuSubmission: summarize(selected.flatMap(b => b.cpuSubmission)),
                frameInterval: summarize(selected.flatMap(b => b.frameInterval)), roundGpuMeans: selected.map(b => summarize(b.gpu).averageMs),
                submitted: selected[0].submitted };
            expect(stats.gpu.count).toBe(300);
            results[name][refreshShadows ? 'refreshedShadows' : 'cachedShadows'] = stats;
        }
    }
    for (const name of ['lod0', 'lod10', 'lod5']) results[name].cachedShadows.aboveEmptyMs =
        results[name].cachedShadows.gpu.averageMs - results.empty.cachedShadows.gpu.averageMs;
    await writeFile(path.join(output, 'results.json'), JSON.stringify({ metadata, results, blocks, gpuStatus, errors }, null, 2));
    expect(errors).toEqual([]);
    const lines = ['# 10,000 randomized leaves in a 1 m square', '',
        metadata.date + '. ' + metadata.renderer + '. Chrome ' + metadata.browser + '. 1920 × 1080.', '',
        '| Representation | Leaves | Cards | Grass triangles | Grass draws | GPU mean / P99, cached shadows | GPU mean / P99, refreshed shadows |',
        '|---|---:|---:|---:|---:|---:|---:|'];
    for (const name of ['lod0', 'lod10', 'lod5']) {
        const c = metadata.cases[name], r = results[name], format = s => s.gpu.averageMs.toFixed(3) + ' / ' + s.gpu.p99Ms.toFixed(3) + ' ms';
        lines.push('| ' + [name, c.leaves, c.cards, c.triangles, c.grassDrawCalls, format(r.cachedShadows), format(r.refreshedShadows)].join(' | ') + ' |');
    }
    lines.push('', 'Empty ground scene GPU mean: ' + results.empty.cachedShadows.gpu.averageMs.toFixed(3) + ' ms.', '',
        metadata.scope, '', metadata.schedule, '',
        'Variations: full azimuth; -15° to +20° inclination; ±12° roll; 80–115% uniform size; 0–3 mm extra burial. Five bend profiles (0.6, 0.8, 1.0, 1.2, 1.4 forward curvature factor), normalized to preserve source arc length before scale. All leaf and card bounds fit inside the square. Intersections are allowed.',
        '', 'LOD0 is 7,136 blade triangles + 720 shoot triangles per instance. The root soil shoulder is not duplicated. Each LOD3 has its own baked curved-source atlas and both corrections enabled. Instance-normal transformation is included so randomized cards retain correct lighting.',
        '', 'GPU values time the full render, using asynchronous non-disjoint queries. Cached shadows reflect a stationary authoring view; refreshed shadows include rebuilding the shadow map each frame. Triangle totals in the table count grass geometry once; submitted pass totals, CPU submission and RAF intervals are in results.json. RAF intervals include display pacing and any query-backlog throttling; they are not GPU time. Setup and compilation are excluded. Desktop GPU clocks are not locked.',
        '', 'Captures: [LOD0](three_quarter-lod0.png), [LOD3 · 10](three_quarter-lod10.png), [LOD3 · 5](three_quarter-lod5.png). Top views use the same filenames with top-.',
        '', 'Reproduce: GRASS_RANDOM_10K=1, PERF_BASE_URL=http://localhost:8001, PLAYWRIGHT_EXECUTABLE_PATH set to hardware Chrome; select tests/headless/perf/specs/grass_random_leaves_10k.pwtest.js with tools/run_selected_test/run.mjs.',
        '', '[Raw results](results.json) · [Placements](placements.json)', '');
    await writeFile(path.join(output, 'report.md'), lines.join('\n'));
    console.log(JSON.stringify({ results, output }));
});
