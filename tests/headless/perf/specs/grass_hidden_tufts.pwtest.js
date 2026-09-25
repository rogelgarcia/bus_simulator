// Compare fully overlapping stacks with their unchanged visible front members alone.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });
const stackLayers = Number(process.env.GRASS_HIDDEN_LAYERS ?? 2);
if (![2, 10].includes(stackLayers)) throw new Error('GRASS_HIDDEN_LAYERS must be 2 or 10.');
const output = path.resolve(`tests/artifacts/screens/grass_debug_v2/hidden_tufts${stackLayers === 2 ? '' : '_10'}`);
const cases = stackLayers === 2 ? ['off', 'adjacent', 'full_near_first', 'full_far_first', 'visible_only']
    : ['off', 'visible_only', 'pair_near_first', 'pair_far_first', 'full_near_first', 'full_far_first'];
const overlapCases = stackLayers === 2 ? ['full_near_first', 'full_far_first'] : ['pair_near_first', 'pair_far_first', 'full_near_first', 'full_far_first'];
const summarize = values => ({ ...summarizeBenchmarkTimings(values), medianMs: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] });
async function gpuStatus() {
    try { return (await promisify(execFile)('nvidia-smi', ['--query-gpu=name,driver_version,utilization.gpu,temperature.gpu,power.draw,clocks.current.graphics', '--format=csv'])).stdout.trim(); }
    catch (error) { return `Unavailable: ${error.message}`; }
}

test(`hidden-tuft cost: ${stackLayers} aligned tufts versus visible front tufts only`, async ({ page, browser }) => {
    test.skip(process.env.GRASS_TUFT_BENCHMARK !== '1', 'Opt in with GRASS_TUFT_BENCHMARK=1.');
    test.setTimeout(900000); await mkdir(output, { recursive: true });
    const experiments = [], errors = [], telemetry = [{ phase: 'before', value: await gpuStatus() }];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness); await page.evaluate(() => window.__plantCardsReadiness);
    for (const instances of [stackLayers, 100000]) for (const view of ['top', 'inclined']) for (const variant of ['joined', 'split']) {
        const id = `${instances}-${view}-${variant}`, folder = path.join(output, id); await mkdir(folder, { recursive: true });
        const metadata = await page.evaluate(async options => {
            const { createGrassPairOverlapBenchmark } = await import('/tests/headless/perf/helpers/grass_pair_overlap_benchmark.js');
            window.__hiddenBench = await createGrassPairOverlapBenchmark(window.__plantCardsStudy, options);
            return window.__hiddenBench.metadata;
        }, { instances, view, variant, stackLayers });
        metadata.browser = browser.version(); metadata.date = new Date().toISOString();
        expect(await page.evaluate(() => window.__hiddenBench.verifyVisibleSubset())).toBe(true);
        expect(metadata.cases.visible_only.instances).toBe(instances / stackLayers);
        expect(metadata.cases.visible_only.triangles).toBe(metadata.cases.full_near_first.triangles / stackLayers);
        expect(metadata.proofs.visible_only.fullyInFrustum).toBe(instances / stackLayers);
        expect(metadata.proofs.visible_only.projectedTuftPixels).toEqual(metadata.proofs.full_near_first.projectedTuftPixels);
        for (const name of overlapCases) {
            const layers = name.startsWith('pair_') ? 2 : stackLayers;
            expect(metadata.cases[name].instances).toBe(instances / stackLayers * layers);
            expect(metadata.proofs[name].fullyInFrustum).toBe(metadata.cases[name].instances);
        }
        const imageComparison = await page.evaluate(names => window.__hiddenBench.compareVisibleImages(names), overlapCases);
        for (const difference of Object.values(imageComparison)) {
            expect(difference.meanAbsoluteChannelDifference).toBeLessThan(0.05);
            expect(difference.changedOverTwoLevelsFraction).toBeLessThan(0.001);
        }
        const diagnostics = {};
        for (const name of [...overlapCases, 'visible_only']) diagnostics[name] = await page.evaluate(name => window.__hiddenBench.diagnose(name), name);
        for (const channel of ['cardFootprints', 'alphaLeaves']) {
            const visible = diagnostics.visible_only[channel];
            for (const name of overlapCases) {
                const full = diagnostics[name][channel], layers = name.startsWith('pair_') ? 2 : stackLayers;
                expect(Math.abs(visible.layerPixels * layers / full.layerPixels - 1)).toBeLessThan(0.001);
                expect(Math.abs(visible.uniquePixels / full.uniquePixels - 1)).toBeLessThan(0.001);
            }
        }
        for (const name of cases.slice(1)) {
            const image = await page.evaluate(name => window.__hiddenBench.capture(name), name);
            await writeFile(path.join(folder, `${name}.jpg`), Buffer.from(image.split(',')[1], 'base64'));
        }
        const experiment = { id, metadata, imageComparison, diagnostics, rounds: [], results: {}, hiddenCost: {} }; experiments.push(experiment);
        await writeFile(path.join(folder, 'preflight.json'), JSON.stringify({ metadata, imageComparison, diagnostics }, null, 2));
        console.log(`[HiddenTufts] ${id}: ${instances} -> ${instances / stackLayers} submitted; image ${JSON.stringify(imageComparison)}`);
        for (let round = 0; round < 8; round++) {
            const offset = round % cases.length, order = cases.slice(offset).concat(cases.slice(0, offset));
            const measured = await page.evaluate(order => window.__hiddenBench.runRound(order, 30, 120), order);
            for (const counts of Object.values(measured.positionCounts)) expect(counts).toEqual(new Array(cases.length).fill(120 / cases.length));
            experiment.rounds.push(measured);
            console.log(`[HiddenTufts] ${id} round ${round + 1}: ${cases.map(name => `${name}=${summarize(measured.records[name].gpu).averageMs.toFixed(3)}`).join(', ')}`);
        }
        expect(await page.evaluate(() => window.__hiddenBench.verifyStatic())).toBe(true);
        for (const name of cases) {
            const gpu = summarize(experiment.rounds.flatMap(round => round.records[name].gpu)); expect(gpu.count).toBe(960);
            experiment.results[name] = { gpu, roundMeans: experiment.rounds.map(round => summarize(round.records[name].gpu).averageMs) };
        }
        const off = experiment.results.off.gpu.averageMs, visible = experiment.results.visible_only;
        for (const name of cases.slice(1)) experiment.results[name].meanMinusOffMs = experiment.results[name].gpu.averageMs - off;
        for (const name of overlapCases) {
            const full = experiment.results[name], differences = full.roundMeans.map((ms, i) => ms - visible.roundMeans[i]);
            const mean = differences.reduce((sum, d) => sum + d, 0) / differences.length;
            const sd = Math.sqrt(differences.reduce((sum, d) => sum + (d - mean) ** 2, 0) / (differences.length - 1));
            const margin = 2.364624251 * sd / Math.sqrt(differences.length);
            experiment.hiddenCost[name] = { savedMs: mean, savedPercentOfTotal: mean / full.gpu.averageMs * 100,
                savedPercentOfGrassIncrement: mean / full.meanMinusOffMs * 100, roundDifferencesMs: differences,
                incrementMultiplierVsVisible: full.meanMinusOffMs / visible.meanMinusOffMs,
                interval95Ms: [mean - margin, mean + margin], positiveRounds: differences.filter(d => d > 0).length };
        }
        telemetry.push({ phase: id, value: await gpuStatus() });
        await page.evaluate(() => window.__hiddenBench.dispose());
        await writeFile(path.join(output, 'results.json'), JSON.stringify({ experiments, telemetry, errors }, null, 2));
    }
    const lines = [`# Hidden tuft cost: ${stackLayers - 1} hidden behind each visible tuft`, '',
        `GPU: ${experiments[0].metadata.renderer}. Chrome ${browser.version()}.`, '',
        '1920 x 1080, RGBA16F, 4x MSAA. Current twenty-leaf tuft, shared PBR material. OFF measures target clear/resolve. Grass-only: no ground, bus, sky, shadows, wind or postprocessing.', '',
        `Fully aligned stacks have ${stackLayers} members, separated by 4 mm along camera depth. Visible-only removes all ${stackLayers - 1} rear instances, retaining the exact front instance matrix, material, camera and projected size. This reduces ${stackLayers} tufts to 1, or 100,000 to ${100000 / stackLayers}. No runtime visibility algorithm runs: this measures the rendering benefit of already knowing which instances can be omitted.`, '',
        'Before timing, raw RGB images are compared for both submission orders against visible-only: mean absolute difference must be below 0.05 of 255 levels and fewer than 0.1% of pixels may differ by over two levels. Additive diagnostics must preserve unique covered pixels within 0.1% while reducing potential raster layers in proportion to the removed instances. Remaining geometry stays entirely in frame and front instance matrices must match exactly.', '',
        `${cases.join(', ')} are interleaved in every measured frame. Order rotates through every position before reversing; every case must appear equally often in every slot. Eight rounds of 30 warmup + 120 samples = 960 samples/case. All hitches retained; incomplete/disjoint queries fail. Static instance buffers and per-case submitted triangle/draw counts verified.`, '',
        stackLayers === 10 ? 'Pair controls retain the front tuft plus its nearest hidden copy. They provide fresh 1-, 2- and 10-layer comparisons in the same view and run.' : 'Adjacent is the prior side-by-side reference.', '',
        '| Original tufts | View | Cards/tuft | Case | Submitted tufts | Mean / P99 ms | Mean minus OFF ms |',
        '|---:|---|---:|---|---:|---:|---:|'];
    for (const e of experiments) for (const name of cases) {
        const r = e.results[name], m = e.metadata;
        lines.push(`| ${m.instances} | ${m.view} | ${m.variant === 'joined' ? 3 : 4} | ${name} | ${name === 'off' ? 0 : m.cases[name].instances} | ${r.gpu.averageMs.toFixed(3)} / ${r.gpu.p99Ms.toFixed(3)} | ${name === 'off' ? '0.000' : r.meanMinusOffMs.toFixed(3)} |`);
    }
    lines.push('', '## Rendering cost avoided by removing hidden tufts', '',
        'Savings are full overlap minus visible-only. Percentages use both total GPU pass time and estimated grass increment after subtracting the same OFF mean. P99 values are never subtracted. Approximate 95% Student t intervals use eight paired round-mean differences (7 degrees of freedom); exploratory, not corrected for multiple comparisons.', '',
        '| Original tufts | View | Cards/tuft | Stack submission | Saved ms | Saved total | Saved grass increment | Grass multiplier vs visible | Approximate interval ms | Positive rounds |',
        '|---:|---|---:|---|---:|---:|---:|---:|---:|---:|');
    for (const e of experiments) for (const [name, c] of Object.entries(e.hiddenCost)) {
        const m = e.metadata;
        lines.push(`| ${m.instances} | ${m.view} | ${m.variant === 'joined' ? 3 : 4} | ${name} | ${c.savedMs.toFixed(3)} | ${c.savedPercentOfTotal.toFixed(1)}% | ${c.savedPercentOfGrassIncrement.toFixed(1)}% | ${c.incrementMultiplierVsVisible.toFixed(2)}x | ${c.interval95Ms.map(n => n.toFixed(3)).join(' to ')} | ${c.positiveRounds}/8 |`);
    }
    lines.push('', '## Image comparison', '', '| Experiment | Stack submission | Changed pixels | Pixels differing by >2 levels | Mean absolute channel difference /255 |', '|---|---|---:|---:|---:|');
    for (const e of experiments) for (const [name, d] of Object.entries(e.imageComparison)) lines.push(`| ${e.id} | ${name} | ${d.changedPixels} | ${(d.changedOverTwoLevelsFraction * 100).toFixed(5)}% | ${d.meanAbsoluteChannelDifference.toFixed(6)} |`);
    lines.push('', '## Scope', '',
        'This removes complete duplicates that are hidden from these fixed views; it does not remove partially visible tufts or build gameplay occlusion culling. Any future visibility calculation has its own cost. The 100,000-tuft configurations have small projected tufts; the single-stack configurations test large projected cards. Projected sizes are recorded in metadata. Compare within each configuration. Small differences need to be assessed against round variation.', '',
        'Camera layout and interleaved workload may differ from earlier experiments; use the newly measured OFF and controls, rather than mixing runs. Ratios against a small OFF-subtracted visible cost are especially sensitive to noise; retain absolute millisecond savings and round intervals.', '',
        'Raw samples, counts, image differences, raster diagnostics and telemetry: [results.json](results.json). Captures are saved under each experiment folder.', '',
        `Reproduce: select \`tests/headless/perf/specs/grass_hidden_tufts.pwtest.js\`; set \`GRASS_HIDDEN_LAYERS=${stackLayers}\`, \`GRASS_TUFT_BENCHMARK=1\`, \`PERF_BASE_URL\` and hardware \`PLAYWRIGHT_EXECUTABLE_PATH\`; run \`node tools/run_selected_test/run.mjs\`.`, '');
    await writeFile(path.join(output, 'report.md'), lines.join('\n'));
    expect(errors).toEqual([]);
});
