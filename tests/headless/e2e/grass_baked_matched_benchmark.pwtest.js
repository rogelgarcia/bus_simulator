// Compare the bus renderer's original lit/card strategy with the latest baked strategy on identical fields and ranges.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { writeGrassBakedMatchedBenchmarkReport } from '../visual/grass_baked_matched_benchmark_report.mjs';

const output = 'tests/artifacts/screens/grass_debug_v2/baked_lighting/matched_benchmark';
test.use({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });

test('original bus grass and baked v10 share LOD distances during soil-relative measurement', async ({ page }) => {
    test.setTimeout(900000); const errors = [], runs = [], views = [];
    await mkdir(output, { recursive: true });
    const id = new Date().toISOString().replace(/[:.]/g, '-'), runDirectory = `${output}/${id}`;
    await mkdir(runDirectory, { recursive: true });
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
        if (message.text().startsWith('Benchmark:')) console.log(message.text());
    });
    await page.route('**/GrassDebugV2BakedLightingScene.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('const api = Object.freeze', 'window.__matchedBenchmark = { renderer, currentCards, assets, bakedAssets };\nconst api = Object.freeze') });
    });
    await page.goto('/debug_tools/grass_baked_lighting_scene.html?appearance=detailed&shelter=0&strategy=baked');
    const initial = await page.evaluate(() => window.__grassBakedReadiness);
    expect(initial.appearance.paletteRevision).toBe('lod-canopy-detail-10');
    expect(initial.selection.effectiveDistances).toEqual([.6, .8, 20, 30, 40]);
    expect(initial.selection.transitionFraction).toBe(.1);
    expect(initial.fields.current.fields).toEqual(initial.fields.baked.fields);
    expect(initial.fields.current.cells).toBe(1296);
    expect(initial.fields.current.fadeStyle).toBe(initial.fields.baked.fadeStyle);
    expect(initial.fields.current.lod3CardsPerSquareMeter).toBe(12);
    expect(initial.fields.current.lod4CardsPerSquareMeter).toBe(6);
    expect(initial.fields.baked.lod3CardsPerSquareMeter).toBe(0);
    expect(initial.shadows.externalCasters).toBe(0);
    const hardware = await page.evaluate(() => {
        const { renderer, currentCards } = window.__matchedBenchmark, gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER), vendor: gl.getParameter(info ? info.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
            antialias: gl.getContextAttributes().antialias, pixelRatio: renderer.getPixelRatio(),
            referenceCards: currentCards.map(card => card.getSnapshot()) };
    });
    await page.evaluate(() => {
        window.__grassBakedScene.setAnimating(false);
        for (const id of ['scene-panel', 'split-labels', 'scene-performance']) document.getElementById(id).hidden = true;
    });
    for (const pose of ['bus_14m_front', 'bus_25m_rear', 'bus_45m_side']) {
        await page.evaluate(pose => { const viewer = window.__grassBakedScene; viewer.setPose(pose); viewer.setLod('AUTO'); viewer.step(0); }, pose);
        for (const strategy of ['current', 'baked']) {
            views.push(await page.evaluate(strategy => { const viewer = window.__grassBakedScene; viewer.setStrategy(strategy); viewer.step(0); return viewer.getSnapshot(); }, strategy));
            await page.locator('#scene-canvas').screenshot({ path: `${runDirectory}/${pose}-${strategy}.png` });
        }
        const run = await page.evaluate(async () => {
            let previousRound = '';
            return window.__grassBakedScene.benchmark({ rounds: 6, frames: 96, rendersPerFrame: 4,
                onProgress(message) { const round = message.split(' · ')[0]; if (round !== previousRound && round.startsWith('Round')) { console.log('Benchmark: ' + round); previousRound = round; } } });
        });
        runs.push(run);
        const data = { id, timestamp: new Date().toISOString(), initial, hardware, views, runs, errors };
        await writeFile(`${runDirectory}/results.json`, JSON.stringify(data, null, 2));
        await writeFile(`${output}/results.json`, JSON.stringify(data, null, 2));
        await writeGrassBakedMatchedBenchmarkReport(output, data);
        console.log('Benchmark: completed ' + pose);
        expect(run.selection.effectiveDistances).toEqual([.6, .8, 20, 30, 40]);
        expect(run.results).toHaveLength(15);
        for (const row of run.results) {
            expect(row.samples).toBeGreaterThanOrEqual(row.lod === 'OFF' ? 6 * 7 * 92 : 6 * 92);
            expect(row.gpuMs).toBeGreaterThan(0);
            expect(row.soilGpuMs + row.aboveSoilMs).toBeCloseTo(row.gpuMs, 8);
        }
        for (const measurement of run.measurements.filter(row => row.strategy === 'baked')) {
            const before = run.measurements.find(row => row.round === measurement.round && row.strategy === 'current' && row.lod === measurement.lod);
            expect(measurement.levels).toEqual(before.levels);
            expect(measurement.blendCandidateCells).toBe(before.blendCandidateCells);
        }
    }
    expect(errors).toEqual([]);
    await page.goto('/' + output + '/index.html');
    await expect(page.locator('h1')).toHaveText('Original bus grass vs baked v10');
    await expect(page.locator('[data-summary="AUTO"] tbody tr')).toHaveCount(3);
    await page.screenshot({ path: `${runDirectory}/report.png`, fullPage: true });
});
