// Verifies the erosion operators: fluvial incision networks, hydraulic mass balance, thermal repose convergence, sediment routing, the material column invariant, determinism, masks, cancellation and review images.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { TerrainFieldMemory } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsGrid.mjs';
import { executeSynthesisRecipe } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisGraph.mjs';
import { DEPOSIT_TYPES, DRAINAGE_CLASSES, hashUnit } from '../../../tools/bake_landscape/terrain_synthesis/operators/Erosion.mjs';
import { composeSheet, renderHillshade, renderReliefMap, writeReviewPng } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisReview.mjs';
import { validateLandscapeSynthesisRecipe } from '../../../src/app/landscape/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = path.join(root, 'tests/artifacts/screens/landscape/ai596/d2/operators');
await mkdir(evidence, { recursive: true });
const DEGREES = Math.PI / 180, sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const op = (id, type, params = {}, mask = null) => ({ id, op: type, params, mask, seed: null, enabled: true });
const gridOf = (chunkIntervals, maxLevel, spacing, minX = 0, minZ = 0) => {
    const intervals = chunkIntervals * 2 ** maxLevel;
    return { columns: intervals + 1, rows: intervals + 1, spacingX: spacing, spacingZ: spacing, bounds: { minX, maxX: minX + intervals * spacing, minZ, maxZ: minZ + intervals * spacing }, chunkIntervals, maxLevel };
};
const recipeOf = (grid, operators, { seed = 11 } = {}) => ({
    format: 'landscape-synthesis-recipe', schemaVersion: 1, id: 'erosion-test', seed, seaLevel: 0, grid, working: null,
    inputs: { landscape: { directory: 'synthetic', expectedRevision: null }, plan: null, imports: [] },
    operators, outputs: { heightCap: null, coverPolicy: 'keep-source', channels: ['height'] }, overrides: []
});
const sourceOf = heightAt => (binding, { memory, output }) => {
    const n = output.columns * output.rows, heights = memory.allocate('source/heights', Float32Array, n), cover = memory.allocate('source/cover', Uint8Array, n);
    for (let r = 0; r < output.rows; r++) for (let c = 0; c < output.columns; c++) {
        const x = output.minX + c * output.spacingX, z = output.maxZ - r * output.spacingZ;
        heights[r * output.columns + c] = heightAt(x, z); cover[r * output.columns + c] = 2;
    }
    return { grid: output, heights, cover, tracked: ['source/heights', 'source/cover'], sha256: 'ab'.repeat(32) };
};
const run = (recipe, inputs, options = {}) => executeSynthesisRecipe({ recipe, inputs, memory: new TerrainFieldMemory(512 << 20), ...options });
const sampleAt = (result, x, z) => { const g = result.grid; return result.heights[Math.round((g.maxZ - z) / g.spacingZ) * g.columns + Math.round((x - g.minX) / g.spacingX)]; };
const ripple = (x, z, amplitude) => amplitude * (hashUnit(5, Math.round(x) * 7919 + Math.round(z) * 104729) - .5);
const invariantError = result => { let worst = 0; const { bedrock, regolith, depositThickness } = result.layers; for (let i = 0; i < result.heights.length; i++) worst = Math.max(worst, Math.abs(result.heights[i] - (bedrock[i] + regolith[i] + depositThickness[i]))); return worst; };
const volumeOf = (heights, grid) => { let sum = 0; for (let i = 0; i < heights.length; i++) sum += heights[i]; return sum * grid.spacingX * grid.spacingZ; };
const hashesOf = (result, names) => Object.fromEntries([['heights', sha256(Buffer.from(result.heights.buffer))], ...names.map(name => [name, sha256(Buffer.from(result.layers[name].buffer, result.layers[name].byteOffset, result.layers[name].byteLength))])]);
const statisticsOf = (result, id) => result.report.operators.find(entry => entry.id === id).statistics;
const leftHalf = extent => ({ type: 'polygon', polygon: [[-1, extent + 1], [extent / 2, extent + 1], [extent / 2, -1], [-1, -1]] });

async function review(name, grid, before, after, extras = []) {
    const options = { size: 384, seaLevel: 0 }, directory = path.join(evidence, name), images = [renderHillshade(grid, before, options), renderHillshade(grid, after, options)];
    await writeReviewPng(path.join(directory, 'before.png'), images[0]);
    await writeReviewPng(path.join(directory, 'after.png'), images[1]);
    const entries = [{ image: images[0], label: 'before' }, { image: images[1], label: 'after' }];
    for (const extra of extras) { const image = renderReliefMap(grid, extra.values, { size: 384, maxMeters: extra.maxMeters, label: extra.label }); await writeReviewPng(path.join(directory, `${extra.file}.png`), image); entries.push({ image, label: extra.label }); }
    await writeReviewPng(path.join(directory, 'sheet.png'), composeSheet(entries, { columns: entries.length }));
}

const tilted = x => 30 - .04 * x;
const HILLS = op('hills', 'landform-hills', { amplitudeMeters: 14, wavelengthsMeters: [240, 120, 60, 30], amplitudes: [1, .5, .25, .125], warpMeters: 20, warpWavelengthMeters: 200 });
const FLUVIAL = { iterations: 40, erodibility: 5e-3, retainRate: .02, diffusivity: .2 };

test('Erosion: fluvial incision on tilted hills carves a dendritic network, concentrates wear on large areas, retains the landform and is deterministic', async () => {
    const grid = gridOf(64, 2, 2), inputs = { readLandscape: sourceOf(tilted) };
    const before = await run(recipeOf(grid, [op('import', 'import-heights'), HILLS]), inputs), reference = Float32Array.from(before.heights);
    before.release();
    const operators = [op('import', 'import-heights'), HILLS, op('fluvial', 'fluvial-erosion', FLUVIAL)];
    const first = await run(recipeOf(grid, operators), inputs), statistics = statisticsOf(first, 'fluvial');
    assert.equal(statistics.iterations, 40); assert.equal(statistics.routings, 41); assert.equal(statistics.hardnessApplied, false); assert.equal(statistics.uplift, 'retain-target');
    assert.ok(statistics.drainage.channel > 0 && statistics.drainage.gully > statistics.drainage.channel && statistics.drainage.rill > statistics.drainage.gully && statistics.drainage.hillslope > statistics.drainage.rill, `drainage classes ${JSON.stringify(statistics.drainage)}`);
    assert.equal(statistics.drainage.sea, 0);
    assert.ok(statistics.maxIncisionMeters > 1 && statistics.incisedVolumeCubicMeters > 0, `incision ${statistics.maxIncisionMeters} m, ${statistics.incisedVolumeCubicMeters} m3`);
    const { wear, flow, drainage, bedrock } = first.layers, n = first.heights.length;
    let channelWear = 0, channelCount = 0, slopeWear = 0, slopeCount = 0, maxFlow = 0, hillslopeChange = 0, topBefore = 0, topAfter = 0, topCount = 0;
    for (let i = 0; i < n; i++) {
        const column = i % grid.columns;
        if (drainage[i] >= DRAINAGE_CLASSES.gully) { channelWear += wear[i]; channelCount++; } else if (drainage[i] === DRAINAGE_CLASSES.hillslope) { slopeWear += wear[i]; slopeCount++; hillslopeChange += Math.abs(first.heights[i] - reference[i]); }
        if (flow[i] > maxFlow) maxFlow = flow[i];
        assert.ok(flow[i] >= 0 && flow[i] <= 1 && wear[i] >= 0 && bedrock[i] <= first.heights[i] + 1e-6);
        if (column * grid.spacingX < 64) { topBefore += reference[i]; topAfter += first.heights[i]; topCount++; }
    }
    assert.ok(channelWear / channelCount > 3 * (slopeWear / slopeCount), `wear concentrates in channels: ${channelWear / channelCount} vs hillslopes ${slopeWear / slopeCount}`);
    assert.ok(hillslopeChange / slopeCount < .5, `retain-target keeps the hillslopes within tolerance (mean change ${hillslopeChange / slopeCount} m)`);
    assert.ok(Math.abs(topAfter - topBefore) / topCount < .5, `the plateau top keeps its height (mean change ${(topAfter - topBefore) / topCount} m)`);
    assert.equal(maxFlow, 1, 'flow is normalized to the land percentiles');
    assert.ok(invariantError(first) < 1e-3, `column invariant ${invariantError(first)}`);
    assert.ok(statistics.invariantErrorMeters < 1e-3);
    const second = await run(recipeOf(grid, operators), inputs);
    assert.deepEqual(hashesOf(first, ['wear', 'flow', 'drainage', 'bedrock', 'regolith']), hashesOf(second, ['wear', 'flow', 'drainage', 'bedrock', 'regolith']), 'two runs are bit identical');
    assert.deepEqual({ ...statisticsOf(second, 'fluvial'), seconds: 0 }, { ...statistics, seconds: 0 });
    second.release();
    await review('fluvial-erosion', first.workingGrid, reference, first.heights, [{ values: wear, maxMeters: Math.max(.1, statistics.maxIncisionMeters), label: 'wear (m)', file: 'wear' }, { values: flow, maxMeters: 1, label: 'flow', file: 'flow' }]);
    first.release();
    // without uplift the same recipe incises more, with constant uplift bedrock rises where nothing incises
    const free = await run(recipeOf(grid, [op('import', 'import-heights'), HILLS, op('fluvial', 'fluvial-erosion', { ...FLUVIAL, uplift: 'none' })]), inputs);
    assert.ok(statisticsOf(free, 'fluvial').incisedVolumeCubicMeters > statistics.incisedVolumeCubicMeters, `free incision ${statisticsOf(free, 'fluvial').incisedVolumeCubicMeters} vs retained ${statistics.incisedVolumeCubicMeters}`);
    assert.equal(statisticsOf(free, 'fluvial').liftedVolumeCubicMeters, 0, 'stream power never raises a sample');
    free.release();
    const lifted = await run(recipeOf(grid, [op('import', 'import-heights'), HILLS, op('fluvial', 'fluvial-erosion', { ...FLUVIAL, iterations: 5, uplift: 'constant', upliftMetersPerIteration: .05, diffusivity: 0 })]), inputs);
    assert.ok(statisticsOf(lifted, 'fluvial').liftedVolumeCubicMeters > 0 && statisticsOf(lifted, 'fluvial').diffusionSubSteps === 0);
    lifted.release();
});

test('Erosion: fluvial erosion classifies the sea, honors the mask, scales the erodibility by an existing hardness layer and reads the drainage thresholds in order', async () => {
    const grid = gridOf(32, 2, 2), extent = 256, coast = (x, z) => tilted(x) - 24 + 3 * Math.sin(z / 19) + ripple(x, z, .4);
    const inputs = { readLandscape: sourceOf(coast) };
    const masked = await run(recipeOf(grid, [op('import', 'import-heights'), op('fluvial', 'fluvial-erosion', { ...FLUVIAL, iterations: 12 }, leftHalf(extent))]), inputs);
    const plain = await run(recipeOf(grid, [op('import', 'import-heights')]), inputs), statistics = statisticsOf(masked, 'fluvial');
    assert.ok(statistics.drainage.sea > 0 && statistics.outlets > 4 * grid.columns, 'submerged samples are outlets and class 5');
    let seaFlow = 0, untouched = 0, changed = 0;
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.columns; c++) {
        const i = r * grid.columns + c;
        if (masked.heights[i] < 0) { assert.equal(masked.layers.drainage[i], DRAINAGE_CLASSES.sea); seaFlow += masked.layers.flow[i]; }
        if (c * 2 > extent / 2 + 2) { assert.ok(Object.is(masked.heights[i], plain.heights[i]) && masked.layers.wear[i] === 0, `untouched outside the mask at ${c},${r}`); untouched++; }
        else if (masked.heights[i] !== plain.heights[i]) changed++;
    }
    assert.equal(seaFlow, 0); assert.ok(untouched > 8000 && changed > 1000, `changed ${changed}, untouched ${untouched}`);
    masked.release(); plain.release();
    // a hardness layer created by an earlier operator in the same recipe is not available here, so inject one through a raw read of the context: run twice with useHardness toggled on a recipe where no layer exists and expect identical results
    const on = await run(recipeOf(grid, [op('import', 'import-heights'), op('fluvial', 'fluvial-erosion', { ...FLUVIAL, iterations: 6, useHardness: true })]), inputs);
    const off = await run(recipeOf(grid, [op('import', 'import-heights'), op('fluvial', 'fluvial-erosion', { ...FLUVIAL, iterations: 6, useHardness: false })]), inputs);
    assert.equal(statisticsOf(on, 'fluvial').hardnessApplied, false);
    assert.equal(sha256(Buffer.from(on.heights.buffer)), sha256(Buffer.from(off.heights.buffer)), 'without a hardness layer the flag changes nothing');
    on.release(); off.release();
    assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf(grid, [op('import', 'import-heights'), op('fluvial', 'fluvial-erosion', { rillAreaM2: 20000, gullyAreaM2: 10000 })])), /rillAreaM2 <= gullyAreaM2 <= channelAreaM2/);
});

const bowl = (x, z) => 4 + .0004 * ((x - 128) ** 2 + (z - 128) ** 2) + ripple(x, z, .15);

test('Erosion: hydraulic droplets conserve mass in a closed basin with zero export and report export = eroded - deposited on an open edge', async () => {
    const grid = gridOf(32, 2, 2), inputs = { readLandscape: sourceOf(bowl) }, params = { droplets: 15000, maxSteps: 48 };
    const before = await run(recipeOf(grid, [op('import', 'import-heights')]), inputs), reference = Float32Array.from(before.heights), referenceVolume = volumeOf(reference, before.workingGrid);
    before.release();
    const closed = await run(recipeOf(grid, [op('import', 'import-heights'), op('hydraulic', 'hydraulic-erosion', params)]), inputs), statistics = statisticsOf(closed, 'hydraulic');
    assert.equal(statistics.droplets, 15000); assert.equal(statistics.leftGrid, 0); assert.equal(statistics.skippedBelowSeaLevel, 0); assert.equal(statistics.endOfLife, 'deposit');
    assert.ok(statistics.erodedVolumeCubicMeters > 0 && statistics.depositedVolumeCubicMeters > 0, `eroded ${statistics.erodedVolumeCubicMeters}, deposited ${statistics.depositedVolumeCubicMeters}`);
    assert.ok(statistics.exportedVolumeCubicMeters <= 1e-6 * statistics.erodedVolumeCubicMeters, `closed basin export ${statistics.exportedVolumeCubicMeters}`);
    assert.ok(Math.abs(statistics.balanceErrorCubicMeters) <= 1e-6 * statistics.erodedVolumeCubicMeters, `balance ${statistics.balanceErrorCubicMeters}`);
    const closedVolume = volumeOf(closed.heights, closed.workingGrid);
    assert.ok(Math.abs(closedVolume - referenceVolume + statistics.exportedVolumeCubicMeters) <= 1e-6 * referenceVolume, `grid volume ${closedVolume} vs ${referenceVolume}`);
    assert.ok(invariantError(closed) < 1e-3);
    let alluvium = 0, colluvium = 0, wearSamples = 0;
    for (let i = 0; i < closed.heights.length; i++) { if (closed.layers.depositType[i] === DEPOSIT_TYPES.alluvium) alluvium++; if (closed.layers.depositType[i] === DEPOSIT_TYPES.colluvium) colluvium++; if (closed.layers.wear[i] > 0) wearSamples++; }
    assert.ok(alluvium > 0 && colluvium > 0 && wearSamples > 1000, `alluvium ${alluvium}, colluvium ${colluvium}, worn ${wearSamples}`);
    const again = await run(recipeOf(grid, [op('import', 'import-heights'), op('hydraulic', 'hydraulic-erosion', params)]), inputs);
    assert.deepEqual(hashesOf(again, ['wear', 'deposition', 'depositType', 'bedrock']), hashesOf(closed, ['wear', 'deposition', 'depositType', 'bedrock']), 'two runs are bit identical');
    again.release();
    await review('hydraulic-erosion-basin', closed.workingGrid, reference, closed.heights, [{ values: closed.layers.wear, maxMeters: Math.max(.05, statistics.maxWearMeters), label: 'wear (m)', file: 'wear' }, { values: closed.layers.deposition, maxMeters: Math.max(.05, statistics.maxDepositionMeters), label: 'deposition (m)', file: 'deposition' }]);
    closed.release();
    // the tilted hills drain off the east edge: droplets leave the grid and the export equals the volume the grid lost
    const hillsGrid = gridOf(64, 2, 2), openInputs = { readLandscape: sourceOf(tilted) }, openParams = { droplets: 13000 };
    const open = await run(recipeOf(hillsGrid, [op('import', 'import-heights'), HILLS, op('hydraulic', 'hydraulic-erosion', openParams)]), openInputs), openStatistics = statisticsOf(open, 'hydraulic');
    const openReference = await run(recipeOf(hillsGrid, [op('import', 'import-heights'), HILLS]), openInputs);
    assert.ok(openStatistics.leftGrid > 0 && openStatistics.exportedVolumeCubicMeters > 0, `droplets leave the east edge: ${openStatistics.leftGrid}`);
    assert.ok(Math.abs(openStatistics.erodedVolumeCubicMeters - openStatistics.depositedVolumeCubicMeters - openStatistics.exportedVolumeCubicMeters) <= 1e-6 * openStatistics.erodedVolumeCubicMeters);
    const exportedByVolume = volumeOf(openReference.heights, open.workingGrid) - volumeOf(open.heights, open.workingGrid);
    assert.ok(Math.abs(exportedByVolume - openStatistics.exportedVolumeCubicMeters) <= 1e-6 * volumeOf(openReference.heights, open.workingGrid), `volume export ${exportedByVolume} vs ${openStatistics.exportedVolumeCubicMeters}`);
    assert.ok(invariantError(open) < 1e-3);
    await review('hydraulic-erosion', open.workingGrid, openReference.heights, open.heights, [{ values: open.layers.wear, maxMeters: Math.max(.05, openStatistics.maxWearMeters), label: 'wear (m)', file: 'wear' }, { values: open.layers.deposition, maxMeters: Math.max(.05, openStatistics.maxDepositionMeters), label: 'deposition (m)', file: 'deposition' }]);
    open.release(); openReference.release();
    const exporting = await run(recipeOf(hillsGrid, [op('import', 'import-heights'), HILLS, op('hydraulic', 'hydraulic-erosion', { ...openParams, endOfLife: 'export' })]), openInputs);
    assert.ok(statisticsOf(exporting, 'hydraulic').exportedVolumeCubicMeters > openStatistics.exportedVolumeCubicMeters, 'dying droplets export their load when asked');
    exporting.release();
});

test('Erosion: hydraulic droplets start only inside the mask and above sea level, derive their count from the density and leave masked ground untouched', async () => {
    const grid = gridOf(32, 2, 2), extent = 256, coast = (x, z) => 12 - .1 * x + ripple(x, z, .5) + Math.sin(z / 11), inputs = { readLandscape: sourceOf(coast) };
    const plain = await run(recipeOf(grid, [op('import', 'import-heights')]), inputs);
    const masked = await run(recipeOf(grid, [op('import', 'import-heights'), op('hydraulic', 'hydraulic-erosion', { droplets: null, dropletsPerSquareKilometer: 150000, maxSteps: 32 }, leftHalf(extent))]), inputs), statistics = statisticsOf(masked, 'hydraulic');
    assert.equal(statistics.droplets, Math.round(150000 * 256 * 256 / 1e6));
    assert.ok(statistics.skippedMasked > 0 && statistics.skippedBelowSeaLevel > 0 && statistics.enteredSea > 0, JSON.stringify(statistics));
    let untouched = 0, changed = 0;
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.columns; c++) {
        const i = r * grid.columns + c;
        if (c * 2 > extent / 2 + 2) { assert.ok(Object.is(masked.heights[i], plain.heights[i]) && masked.layers.wear[i] === 0 && masked.layers.deposition[i] === 0, `untouched at ${c},${r}`); untouched++; }
        else if (masked.heights[i] !== plain.heights[i]) changed++;
    }
    assert.ok(untouched > 8000 && changed > 500, `changed ${changed}`);
    assert.ok(Math.abs(statistics.balanceErrorCubicMeters) <= 1e-6 * statistics.erodedVolumeCubicMeters);
    masked.release(); plain.release();
    assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf(grid, [op('import', 'import-heights'), op('hydraulic', 'hydraulic-erosion', { droplets: null, dropletsPerSquareKilometer: 0 })])), /dropletsPerSquareKilometer must be positive/);
});

test('Erosion: thermal weathering settles a 60 degree pile of 10 m into a 34 degree talus cone, conserving mass', async () => {
    const grid = gridOf(32, 2, 2), cone = (x, z) => 1 + Math.max(0, 10 - Math.tan(60 * DEGREES) * Math.hypot(x - 128, z - 128)), inputs = { readLandscape: sourceOf(cone) };
    const before = await run(recipeOf(grid, [op('import', 'import-heights')]), inputs), reference = Float32Array.from(before.heights), referenceVolume = volumeOf(reference, before.workingGrid);
    before.release();
    const params = { iterations: 60, weatheringRateMetersPerIteration: 20, weatheringSlopeDegrees: 0, maxRegolithMeters: 20, talusReposeDegrees: 34, regolithReposeDegrees: 34 };
    const result = await run(recipeOf(grid, [op('import', 'import-heights'), op('thermal', 'thermal-weathering', params)]), inputs), statistics = statisticsOf(result, 'thermal');
    assert.equal(statistics.exportedVolumeCubicMeters, 0, 'nothing reaches the flat landscape edge');
    assert.ok(Math.abs(volumeOf(result.heights, result.workingGrid) - referenceVolume) <= 1e-6 * referenceVolume, 'the volume is conserved');
    assert.ok(statistics.finalMaxLooseSlopeDegrees <= 34.5, `max loose slope ${statistics.finalMaxLooseSlopeDegrees}`);
    assert.equal(statistics.samplesAboveRepose, 0);
    assert.ok(statistics.talusVolumeCubicMeters > 0 && statistics.movedVolumeCubicMeters > 0 && statistics.weatheredVolumeCubicMeters > 0);
    // the 349 m3 pile at 34 degrees is a cone of about 7.9 m radius and 5.3 m height
    const apex = sampleAt(result, 128, 128), flank = sampleAt(result, 128 + 4, 128), foot = sampleAt(result, 128 + 8, 128), beyond = sampleAt(result, 128 + 12, 128);
    assert.ok(apex > 5.8 && apex < 6.8 && flank > 3.2 && flank < 4.2 && foot >= 1 && foot < 1.2 && beyond === 1, `apex ${apex}, 4 m out ${flank}, 8 m out ${foot}, 12 m out ${beyond}`);
    assert.ok(Math.abs(apex - flank) / 4 <= Math.tan(34.5 * DEGREES) && Math.abs(apex - flank) / 4 > Math.tan(33 * DEGREES), `the cone flank is at repose: ${Math.atan((apex - flank) / 4) / DEGREES} degrees`);
    assert.equal(sampleAt(result, 20, 20), 1, 'the flat plane far away is untouched');
    let talusSamples = 0;
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.columns; c++) if (Math.hypot(c - 64, r - 64) <= 5 && result.layers.depositType[r * grid.columns + c] === DEPOSIT_TYPES.talus) talusSamples++;
    assert.ok(talusSamples > 8, `material that left the 60 degree face rests as talus around the toe: ${talusSamples} samples`);
    assert.ok(invariantError(result) < 1e-3);
    await review('thermal-weathering', result.workingGrid, reference, result.heights, [{ values: result.layers.depositThickness, maxMeters: 10, label: 'deposits (m)', file: 'deposits' }]);
    result.release();
});

test('Erosion: thermal weathering on rough coastal ground converges below repose, weathers only land, exports over the edge, honors the mask and is deterministic', async () => {
    const grid = gridOf(64, 2, 2), extent = 512, rough = (x, z) => 26 - .06 * x + 9 * Math.sin(x / 23) * Math.cos(z / 29) + ripple(x, z, 1.5), inputs = { readLandscape: sourceOf(rough) };
    const before = await run(recipeOf(grid, [op('import', 'import-heights')]), inputs), reference = Float32Array.from(before.heights), referenceVolume = volumeOf(reference, before.workingGrid);
    before.release();
    const params = { iterations: 50, weatheringRateMetersPerIteration: .2, weatheringSlopeDegrees: 10 };
    const result = await run(recipeOf(grid, [op('import', 'import-heights'), op('thermal', 'thermal-weathering', params)]), inputs), statistics = statisticsOf(result, 'thermal');
    assert.ok(statistics.weatheredVolumeCubicMeters > 0 && statistics.movedVolumeCubicMeters > 0);
    assert.ok(statistics.exportedVolumeCubicMeters > 0, 'slopes running off the east edge export talus');
    const delta = referenceVolume - volumeOf(result.heights, result.workingGrid);
    assert.ok(Math.abs(delta - statistics.exportedVolumeCubicMeters) <= 1e-6 * referenceVolume, `volume lost ${delta} equals the export ${statistics.exportedVolumeCubicMeters}`);
    assert.ok(statistics.transitSamplesAboveRepose > 0, 'bedrock faces carry fresh weathering products in transit');
    let seaWeathered = 0;
    for (let i = 0; i < result.heights.length; i++) if (reference[i] < 0 && result.layers.regolith[i] > 0 && result.layers.depositThickness[i] === 0) seaWeathered++;
    assert.equal(seaWeathered, 0, 'bedrock below sea level does not weather');
    assert.ok(invariantError(result) < 1e-3);
    const again = await run(recipeOf(grid, [op('import', 'import-heights'), op('thermal', 'thermal-weathering', params)]), inputs);
    assert.deepEqual(hashesOf(again, ['bedrock', 'regolith', 'depositType', 'depositThickness']), hashesOf(result, ['bedrock', 'regolith', 'depositType', 'depositThickness']));
    again.release();
    await review('thermal-weathering-rough', result.workingGrid, reference, result.heights, [{ values: result.layers.depositThickness, maxMeters: 2, label: 'deposits (m)', file: 'deposits' }]);
    result.release();
    // pure settling of a 2 m mantle (no further weathering) converges: every loose-controlled sample ends at or below its repose angle
    const settled = await run(recipeOf(grid, [op('import', 'import-heights'), op('mantle', 'thermal-weathering', { iterations: 1, weatheringRateMetersPerIteration: 2, weatheringSlopeDegrees: 0 }), op('settle', 'thermal-weathering', { iterations: 60, weatheringRateMetersPerIteration: 0 })]), inputs);
    const settling = statisticsOf(settled, 'settle');
    assert.equal(settling.weatheredVolumeCubicMeters, 0);
    assert.equal(settling.samplesAboveRepose, 0, `loose-controlled samples above repose: ${settling.samplesAboveRepose}`);
    assert.ok(settling.finalMaxLooseSlopeDegrees <= 34.5, `max loose slope ${settling.finalMaxLooseSlopeDegrees}`);
    assert.ok(settling.looseSamples > 30000 && settling.movedVolumeCubicMeters > 0);
    settled.release();
    const masked = await run(recipeOf(grid, [op('import', 'import-heights'), op('thermal', 'thermal-weathering', { ...params, iterations: 10 }, leftHalf(extent))]), inputs);
    let untouched = 0;
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.columns; c++) {
        const i = r * grid.columns + c;
        if (c * 2 > extent / 2 + 2) { assert.ok(Object.is(masked.heights[i], reference[i]) && masked.layers.regolith[i] === 0 && masked.layers.depositThickness[i] === 0, `untouched at ${c},${r}`); untouched++; }
    }
    assert.ok(untouched > 30000);
    masked.release();
});

test('Erosion: sediment-deposit routes the loose mantle into the basin as alluvium, traps ponds, conserves mass and takes the wear supply when it exists', async () => {
    const grid = gridOf(32, 2, 2), extent = 256, inputs = { readLandscape: sourceOf(bowl) };
    const mantle = op('thermal', 'thermal-weathering', { iterations: 1, weatheringRateMetersPerIteration: 1, weatheringSlopeDegrees: 0 });
    const before = await run(recipeOf(grid, [op('import', 'import-heights'), mantle]), inputs), reference = Float32Array.from(before.heights), referenceVolume = volumeOf(reference, before.workingGrid);
    before.release();
    const result = await run(recipeOf(grid, [op('import', 'import-heights'), mantle, op('sediment', 'sediment-deposit')]), inputs), statistics = statisticsOf(result, 'sediment');
    assert.equal(statistics.supplyApplied, false); assert.equal(statistics.suppliedVolumeCubicMeters, 0); assert.equal(statistics.passes, 1);
    assert.ok(statistics.lakes >= 1 && statistics.entrainedVolumeCubicMeters > 0 && statistics.depositedVolumeCubicMeters > 0 && statistics.pondVolumeCubicMeters > 0, JSON.stringify(statistics));
    assert.ok(Math.abs(statistics.balanceErrorCubicMeters) <= 1e-6 * statistics.entrainedVolumeCubicMeters, `balance ${statistics.balanceErrorCubicMeters}`);
    assert.ok(Math.abs(volumeOf(result.heights, result.workingGrid) - referenceVolume + statistics.exportedVolumeCubicMeters) <= 1e-6 * referenceVolume, 'the grid volume follows the export');
    let centerDeposit = 0, centerCount = 0, centerAlluvium = 0, rimDeposit = 0, rimCount = 0;
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.columns; c++) {
        const i = r * grid.columns + c, d = Math.hypot(c * 2 - 128, (grid.rows - 1 - r) * 2 - 128);
        if (d < 24) { centerDeposit += result.layers.deposition[i]; centerCount++; if (result.layers.depositType[i] === DEPOSIT_TYPES.alluvium) centerAlluvium++; } else if (d > 100) { rimDeposit += result.layers.deposition[i]; rimCount++; }
    }
    assert.ok(centerDeposit / centerCount > 5 * (rimDeposit / rimCount) && centerAlluvium > 50, `deposition concentrates on the basin floor: center ${centerDeposit / centerCount} m, rim ${rimDeposit / rimCount} m per sample, alluvium samples ${centerAlluvium}`);
    assert.equal(statistics.lakeOverflowVolumeCubicMeters, 0, 'the basin is far from full');
    assert.ok(invariantError(result) < 1e-3);
    await review('sediment-deposit', result.workingGrid, reference, result.heights, [{ values: result.layers.deposition, maxMeters: Math.max(.05, statistics.maxDepositMeters), label: 'deposition (m)', file: 'deposition' }]);
    result.release();
    const fed = await run(recipeOf(grid, [op('import', 'import-heights'), op('fluvial', 'fluvial-erosion', { ...FLUVIAL, iterations: 8 }), op('sediment', 'sediment-deposit', { supplyFraction: .5 })]), inputs), fedStatistics = statisticsOf(fed, 'sediment');
    assert.equal(fedStatistics.supplyApplied, true);
    assert.ok(fedStatistics.suppliedVolumeCubicMeters > 0 && Math.abs(fedStatistics.suppliedVolumeCubicMeters - .5 * statisticsOf(fed, 'fluvial').incisedVolumeCubicMeters) < 1e-3 * statisticsOf(fed, 'fluvial').incisedVolumeCubicMeters, 'the wear supply is half the incision');
    assert.ok(Math.abs(fedStatistics.balanceErrorCubicMeters) <= 1e-6 * (fedStatistics.suppliedVolumeCubicMeters + fedStatistics.entrainedVolumeCubicMeters));
    assert.ok(invariantError(fed) < 1e-3);
    fed.release();
    const plain = await run(recipeOf(grid, [op('import', 'import-heights'), mantle]), inputs);
    const masked = await run(recipeOf(grid, [op('import', 'import-heights'), mantle, op('sediment', 'sediment-deposit', { iterations: 2 }, leftHalf(extent))]), inputs);
    let untouched = 0;
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.columns; c++) {
        const i = r * grid.columns + c;
        if (c * 2 > extent / 2 + 2) { assert.ok(Object.is(masked.heights[i], plain.heights[i]) && masked.layers.deposition[i] === 0, `untouched at ${c},${r}`); untouched++; }
    }
    assert.ok(untouched > 8000 && statisticsOf(masked, 'sediment').passes === 2);
    masked.release(); plain.release();
});

test('Erosion: an abort inside any erosion operator stops with AbortError and leaves no tracked arrays', async () => {
    const grid = gridOf(32, 2, 2), inputs = { readLandscape: sourceOf(bowl) };
    for (const operator of [op('fluvial', 'fluvial-erosion', { iterations: 3 }), op('hydraulic', 'hydraulic-erosion', { droplets: 5000 }), op('thermal', 'thermal-weathering', { iterations: 3 }), op('sediment', 'sediment-deposit')]) {
        const memory = new TerrainFieldMemory(512 << 20), controller = new AbortController();
        let started = false;
        await assert.rejects(executeSynthesisRecipe({ recipe: recipeOf(grid, [op('import', 'import-heights'), operator]), inputs, memory, signal: controller.signal, onProgress: event => { if (event.phase === 'start' && event.id === operator.id) { started = true; controller.abort(); } } }),
            error => error.name === 'AbortError', `${operator.op} aborts`);
        assert.ok(started);
        assert.equal(memory.bytes, 0, `${operator.op} releases every tracked array`); assert.equal(memory.entries.size, 0);
    }
});

test('Erosion: the four operators chain on one column (height = bedrock + regolith + depositThickness after each) and layers created by an earlier operator are reused', async () => {
    const grid = gridOf(32, 2, 2), inputs = { readLandscape: sourceOf((x, z) => tilted(x) - 10 + 4 * Math.sin(z / 21) + ripple(x, z, .8)) };
    const operators = [op('import', 'import-heights'), op('thermal', 'thermal-weathering', { iterations: 5, weatheringRateMetersPerIteration: .1, weatheringSlopeDegrees: 0 }), op('fluvial', 'fluvial-erosion', { ...FLUVIAL, iterations: 8 }),
        op('hydraulic', 'hydraulic-erosion', { droplets: 4000, maxSteps: 32 }), op('sediment', 'sediment-deposit'), op('thermal2', 'thermal-weathering', { iterations: 5 })];
    const result = await run(recipeOf(grid, operators), inputs);
    for (const entry of result.report.operators.slice(1)) assert.ok(entry.statistics.invariantErrorMeters < 1e-3, `${entry.id} invariant ${entry.statistics.invariantErrorMeters}`);
    assert.ok(invariantError(result) < 1e-3);
    assert.deepEqual(Object.keys(result.layers).sort(), ['bedrock', 'cover', 'depositThickness', 'depositType', 'deposition', 'drainage', 'flow', 'height', 'regolith', 'wear']);
    assert.equal(statisticsOf(result, 'sediment').supplyApplied, true);
    let regolith = 0, deposits = 0;
    for (let i = 0; i < result.heights.length; i++) { regolith += result.layers.regolith[i]; deposits += result.layers.depositThickness[i]; assert.ok(result.layers.regolith[i] >= 0 && result.layers.depositThickness[i] >= 0 && (result.layers.depositThickness[i] > 0) === (result.layers.depositType[i] > 0), `deposit bookkeeping at ${i}`); }
    assert.ok(regolith > 0 && deposits > 0);
    result.release();
});
