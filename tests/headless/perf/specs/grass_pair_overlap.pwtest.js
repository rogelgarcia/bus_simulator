// Same visible geometry and projected size; only pair overlap and instance order change.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/pair_overlap');
const cases = ['off', 'adjacent', 'half_near_first', 'half_far_first', 'full_near_first', 'full_far_first'];
const summarize = values => ({ ...summarizeBenchmarkTimings(values), medianMs: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] });
async function gpuStatus() {
    try { return (await promisify(execFile)('nvidia-smi', ['--query-gpu=name,driver_version,utilization.gpu,temperature.gpu,power.draw,clocks.current.graphics', '--format=csv'])).stdout.trim(); }
    catch (error) { return `Unavailable: ${error.message}`; }
}

test('same visible tufts: adjacent versus partial/full overlap at fixed projected scale', async ({ page, browser }) => {
    test.skip(process.env.GRASS_TUFT_BENCHMARK !== '1', 'Opt in with GRASS_TUFT_BENCHMARK=1.');
    test.setTimeout(900000);
    await mkdir(output, { recursive: true });
    const experiments = [], errors = [], telemetry = [{ phase: 'before', value: await gpuStatus() }];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness); await page.evaluate(() => window.__plantCardsReadiness);
    for (const instances of [2, 100000]) for (const view of ['top', 'inclined']) for (const variant of ['joined', 'split']) {
        const id = `${instances}-${view}-${variant}`, folder = path.join(output, id); await mkdir(folder, { recursive: true });
        const metadata = await page.evaluate(async options => {
            const { createGrassPairOverlapBenchmark } = await import('/tests/headless/perf/helpers/grass_pair_overlap_benchmark.js');
            window.__pairBench = await createGrassPairOverlapBenchmark(window.__plantCardsStudy, options);
            return window.__pairBench.metadata;
        }, { instances, view, variant });
        metadata.browser = browser.version(); metadata.date = new Date().toISOString();
        const diagnostics = {};
        for (const name of cases.slice(1)) {
            const proof = metadata.proofs[name];
            expect(proof.fullyInFrustum).toBe(instances);
            expect(proof.projectedTuftPixels).toEqual(metadata.proofs.adjacent.projectedTuftPixels);
            expect(proof.depthRange).toEqual(metadata.proofs.adjacent.depthRange);
            diagnostics[name] = await page.evaluate(name => window.__pairBench.diagnose(name), name);
            for (const channel of ['cardFootprints', 'alphaLeaves']) {
                const raster = diagnostics[name][channel];
                expect(raster.layerPixels).toBeGreaterThanOrEqual(raster.uniquePixels);
                expect(raster.maxLayers).toBeGreaterThanOrEqual(1);
                expect(Number.isInteger(raster.layerPixels)).toBe(true);
            }
            const image = await page.evaluate(name => window.__pairBench.capture(name), name);
            await writeFile(path.join(folder, `${name}.jpg`), Buffer.from(image.split(',')[1], 'base64'));
        }
        for (const name of cases.slice(2)) {
            for (const channel of ['cardFootprints', 'alphaLeaves']) {
                const ratio = diagnostics[name][channel].layerPixels / diagnostics.adjacent[channel].layerPixels;
                expect(Math.abs(ratio - 1), `${id}/${name}/${channel}: equal potential raster area`).toBeLessThan(0.01);
            }
        }
        const experiment = { id, metadata, diagnostics, rounds: [], results: {} }; experiments.push(experiment);
        await writeFile(path.join(folder, 'preflight.json'), JSON.stringify({ metadata, diagnostics }, null, 2));
        console.log(`[PairOverlap] ${id} preflight passed: ${instances} fully in frame; tuft ${metadata.proofs.adjacent.projectedTuftPixels.map(n => n.toFixed(2)).join(' x ')} px; raster area unchanged.`);
        for (let round = 0; round < 8; round++) {
            const offset = round % cases.length, order = cases.slice(offset).concat(cases.slice(0, offset));
            const measured = await page.evaluate(order => window.__pairBench.runRound(order, 30, 120), order);
            experiment.rounds.push(measured);
            console.log(`[PairOverlap] ${id} round ${round + 1}: ${cases.map(name => `${name}=${summarize(measured.records[name].gpu).averageMs.toFixed(3)}`).join(', ')}`);
        }
        expect(await page.evaluate(() => window.__pairBench.verifyStatic())).toBe(true);
        for (const name of cases) {
            const gpu = summarize(experiment.rounds.flatMap(round => round.records[name].gpu)); expect(gpu.count).toBe(960);
            experiment.results[name] = { gpu, roundMeans: experiment.rounds.map(round => summarize(round.records[name].gpu).averageMs) };
        }
        const base = experiment.results.adjacent, off = experiment.results.off.gpu.averageMs;
        for (const name of cases.slice(1)) {
            const result = experiment.results[name];
            result.meanMinusOffMs = result.gpu.averageMs - off;
            result.deltaFromAdjacentMs = result.gpu.averageMs - base.gpu.averageMs;
            result.percentFromAdjacent = (result.gpu.averageMs / base.gpu.averageMs - 1) * 100;
            result.roundDeltasMs = result.roundMeans.map((ms, i) => ms - base.roundMeans[i]);
        }
        telemetry.push({ phase: id, value: await gpuStatus() });
        await page.evaluate(() => window.__pairBench.dispose());
        await writeFile(path.join(output, 'results.json'), JSON.stringify({ experiments, telemetry, errors }, null, 2));
    }
    const lines = ['# Same-visible-tuft overlap benchmark', '',
        `GPU: ${experiments[0].metadata.renderer}. Chrome ${browser.version()}.`, '',
        '1920 x 1080, RGBA16F, 4x MSAA. Current twenty-leaf tuft and shared PBR material. GPU times include target clear and resolve; OFF measures that baseline. No ground, shadows, sky, bus or postprocessing.', '',
        'Each comparison uses identical tuft identities, full-frustum counts, orientation, projected size, depth and camera. Only the second member of each pair moves horizontally. All geometry stays inside the frustum, even when leaves become occluded. Orthographic projection and integer-pixel translations preserve scale and texture sampling phase. Untimed raster diagnostics must confirm total card and alpha-tested layer area stays within 1% of the adjacent baseline.', '',
        'Half overlap means 50% of one tuft footprint overlaps its partner (pair union shrinks 25%). Full overlap means coincident projected footprints (pair union shrinks 50%). A fixed 4 mm camera-depth separation avoids coplanar surfaces. Near-first and far-first retain identical positions and only reverse pair submission order. Independent pairs do not overlap one another.', '',
        'Eight interleaved rounds, 30 warmup + 120 samples per round: 960 samples/case. OFF and all five layouts render in each measured frame with rotating/reversed case order. All samples, including hitches, retained. No disjoint, missing or pending queries accepted. Static matrix buffers verified.', '',
        '| Tufts | View | Cards/tuft | Case | Mean / P99 ms | Delta vs adjacent | Round delta range ms |',
        '|---:|---|---:|---|---:|---:|---:|'];
    for (const experiment of experiments) for (const name of cases.slice(1)) {
        const r = experiment.results[name], m = experiment.metadata;
        lines.push(`| ${m.instances} | ${m.view} | ${m.variant === 'joined' ? 3 : 4} | ${name} | ${r.gpu.averageMs.toFixed(3)} / ${r.gpu.p99Ms.toFixed(3)} | ${r.deltaFromAdjacentMs.toFixed(3)} ms (${r.percentFromAdjacent.toFixed(1)}%) | ${Math.min(...r.roundDeltasMs).toFixed(3)} to ${Math.max(...r.roundDeltasMs).toFixed(3)} |`);
    }
    lines.push('', '## Potential raster redundancy', '',
        'Additive diagnostics disable depth rejection. Card footprints count transparent texels too; alpha leaves use the material cutoff without MSAA/alpha-to-coverage. Redundant fraction is (summed layer pixels - unique covered pixels) / summed layer pixels. It describes potential repeated coverage, not executed shader invocations or GPU time wasted. It includes overlap between cards inside each tuft. Actual GPU timings retain normal depth testing, alpha testing and alpha-to-coverage.', '',
        '| Tufts | View | Cards/tuft | Case | Tuft pixels | Card layer pixels | Card redundant fraction | Alpha layer pixels | Alpha redundant fraction | Alpha unique pixels |',
        '|---:|---|---:|---|---|---:|---:|---:|---:|---:|');
    for (const experiment of experiments) for (const name of ['adjacent', 'half_near_first', 'full_near_first']) {
        const { metadata: m, diagnostics } = experiment, d = diagnostics[name];
        lines.push(`| ${m.instances} | ${m.view} | ${m.variant === 'joined' ? 3 : 4} | ${name} | ${m.proofs[name].projectedTuftPixels.map(n => n.toFixed(2)).join(' x ')} | ${d.cardFootprints.layerPixels.toFixed(0)} | ${(d.cardFootprints.redundantFraction * 100).toFixed(1)}% | ${d.alphaLeaves.layerPixels.toFixed(0)} | ${(d.alphaLeaves.redundantFraction * 100).toFixed(1)}% | ${d.alphaLeaves.uniquePixels} |`);
    }
    lines.push('', '## Interpretation limits', '',
        'All 100,000 tufts fit inside the image and are therefore only a few pixels wide. The two-tuft case tests large cards. Compare layouts within a count/view/card configuration; do not treat changes between counts as pure scaling of the same screen workload. Empty regions created by overlap are intentional: filling them with extra tufts or zooming would invalidate the fixed-visible-geometry comparison.', '',
        'Fully aligned duplicates are a controlled limit, not a natural randomized grass distribution. Depth order is tested explicitly. Small timing differences should be judged against per-round variation and the OFF baseline; this experiment does not attribute individual GPU stages or establish a whole-game budget.', '',
        'Raw samples, metadata, telemetry and preflight checks: [results.json](results.json). Captures are stored in each count-view-variant subfolder.', '',
        'Reproduce: select `tests/headless/perf/specs/grass_pair_overlap.pwtest.js`; set `GRASS_TUFT_BENCHMARK=1`, `PERF_BASE_URL` and hardware `PLAYWRIGHT_EXECUTABLE_PATH`; run `node tools/run_selected_test/run.mjs`.', '');
    await writeFile(path.join(output, 'report.md'), lines.join('\n'));
    expect(errors).toEqual([]);
});
