// Verifies the upsampling import of a source landscape coarser than the recipe grid (AI 596 D4): the filters, the cover labels, the engine paths and the unchanged same-grid and decimation paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TerrainFieldMemory } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsGrid.mjs';
import { executeSynthesisRecipe } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisGraph.mjs';
import { decimateHeights, resampleToGrid, upsampleCover, upsampleFactor, upsampleHeights } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisWorkingGrid.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const op = (id, type, params = {}, mask = null) => ({ id, op: type, params, mask, seed: null, enabled: true });
const gridOf = (chunkIntervals, maxLevel, spacing, minX = 0, minZ = 0) => {
    const intervals = chunkIntervals * 2 ** maxLevel;
    return { columns: intervals + 1, rows: intervals + 1, spacingX: spacing, spacingZ: spacing, bounds: { minX, maxX: minX + intervals * spacing, minZ, maxZ: minZ + intervals * spacing }, chunkIntervals, maxLevel };
};
const recipeOf = (grid, operators, { working = null, coverPolicy = 'keep-source' } = {}) => ({
    format: 'landscape-synthesis-recipe', schemaVersion: 1, id: 'upsample-test', seed: 7, seaLevel: 0, grid, working,
    inputs: { landscape: { directory: 'synthetic', expectedRevision: null }, plan: null, imports: [] }, operators, outputs: { heightCap: null, coverPolicy, channels: ['height'] }, overrides: []
});
// a source landscape `factor` times coarser than the recipe grid over the same extent, generated from world functions
const coarseSourceOf = (factor, heightAt, coverAt) => (binding, { memory, output }) => {
    const grid = { columns: (output.columns - 1) / factor + 1, rows: (output.rows - 1) / factor + 1, spacingX: output.spacingX * factor, spacingZ: output.spacingZ * factor, minX: output.minX, maxZ: output.maxZ };
    const n = grid.columns * grid.rows, heights = memory.allocate('source/heights', Float32Array, n), cover = memory.allocate('source/cover', Uint8Array, n);
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.columns; c++) {
        const x = grid.minX + c * grid.spacingX, z = grid.maxZ - r * grid.spacingZ;
        heights[r * grid.columns + c] = heightAt(x, z); cover[r * grid.columns + c] = coverAt(x, z);
    }
    return { grid, heights, cover, tracked: ['source/heights', 'source/cover'], sha256: 'cd'.repeat(32), revision: 'coarse-r1' };
};
const run = (recipe, inputs) => executeSynthesisRecipe({ recipe, inputs, memory: new TerrainFieldMemory(256 << 20) });
const plainGrid = (columns, spacing, minX = 0, maxZ = (columns - 1) * spacing) => ({ columns, rows: columns, spacingX: spacing, spacingZ: spacing, minX, maxZ });
const fill = (grid, at, Type = Float32Array) => { const out = new Type(grid.columns * grid.rows); for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.columns; c++) out[r * grid.columns + c] = at(grid.minX + c * grid.spacingX, grid.maxZ - r * grid.spacingZ, c, r); return out; };

test('Upsampling: a 5x5 source upsampled to 9x9 reproduces a linear ramp exactly with every filter and keeps the cover labels', () => {
    const coarse = plainGrid(5, 2), fine = plainGrid(9, 1), ramp = (x, z) => .5 * x - .25 * z + 3;
    assert.equal(upsampleFactor(coarse, fine), 2); assert.equal(upsampleFactor(fine, coarse), null); assert.equal(upsampleFactor(coarse, coarse), 1);
    assert.equal(upsampleFactor(coarse, { ...fine, minX: 1 }), null, 'a shifted extent is not aligned');
    const source = fill(coarse, ramp), expected = fill(fine, ramp);
    for (const filter of ['catmull-rom', 'bilinear']) {
        const out = new Float32Array(fine.columns * fine.rows);
        assert.equal(upsampleHeights(coarse, source, fine, out, filter), 2);
        for (let i = 0; i < out.length; i++) assert.ok(Object.is(out[i], expected[i]), `${filter}: sample ${i} ${out[i]} vs ${expected[i]} (exact at the clamped edges too)`);
    }
    const nearest = new Float32Array(fine.columns * fine.rows);
    upsampleHeights(coarse, source, fine, nearest, 'nearest');
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) assert.equal(nearest[r * 9 + c], source[Math.floor(r / 2) * 5 + Math.floor(c / 2)], 'nearest takes the lower index at a midpoint tie');
    // cover: aligned labels copied, midpoints take the lower-index neighbour, so every label comes from the 2x2 source neighbourhood
    const labels = fill(coarse, (x, z, c, r) => (c + 2 * r) % 8, Uint8Array), cover = new Uint8Array(81);
    assert.equal(upsampleCover(coarse, labels, fine, cover), 2);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) assert.equal(cover[r * 9 + c], labels[Math.floor(r / 2) * 5 + Math.floor(c / 2)], `cover at ${c},${r}`);
    const histogram = (values, length) => { const h = new Array(length).fill(0); for (const value of values) h[value]++; return h; };
    assert.deepEqual(new Set(histogram(cover, 8).map((count, id) => (count ? id : -1)).filter(id => id >= 0)), new Set(histogram(labels, 8).map((count, id) => (count ? id : -1)).filter(id => id >= 0)), 'no label appears or disappears');
    // a cubic bump is interpolated smoothly: aligned samples exact, midpoints between their neighbours' extremes for a monotone row, factor 3 works too
    const coarse3 = plainGrid(5, 3), triple = plainGrid(13, 1), bump = fill(coarse3, x => Math.sin(x / 2.5) * 4), out3 = new Float32Array(169);
    assert.equal(upsampleHeights(coarse3, bump, triple, out3, 'catmull-rom'), 3);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) assert.ok(Object.is(out3[r * 3 * 13 + c * 3], bump[r * 5 + c]), 'aligned sample');
    const ramp3 = fill(coarse3, ramp), expected3 = fill(triple, ramp);
    upsampleHeights(coarse3, ramp3, triple, out3, 'catmull-rom');
    for (let i = 0; i < out3.length; i++) assert.ok(Math.abs(out3[i] - expected3[i]) < 1e-5, `factor 3 linear ramp at ${i}`);
    assert.throws(() => upsampleHeights(fine, expected, coarse, new Float32Array(25), 'catmull-rom'), /integer factor/);
    assert.throws(() => upsampleHeights(coarse, source, fine, new Float32Array(81), 'lanczos'), /Unsupported upsampling filter/);
});

test('Upsampling: import-heights upsamples a coarser landscape onto the recipe grid, reports importResample and keeps the nearest cover', async () => {
    const grid = gridOf(16, 2, 1), ramp = (x, z) => .01 * x * x / 10 + .3 * z, coverAt = (x, z) => (x < 20 ? 1 : z > 40 ? 3 : 2);
    for (const [resample, label] of [['catmull-rom', 'default'], ['bilinear', 'declared'], ['nearest', 'declared']]) {
        const params = resample === 'catmull-rom' && label === 'default' ? {} : { resample };
        const result = await run(recipeOf(grid, [op('import', 'import-heights', params)]), { readLandscape: coarseSourceOf(2, ramp, coverAt) });
        const statistics = result.report.operators[0].statistics;
        assert.deepEqual(statistics.importResample, { factor: 2, filter: resample, cover: 'nearest', target: 'output', workingFactor: 2 });
        assert.deepEqual(statistics.nativeGrid, { columns: 33, rows: 33, spacingX: 2, spacingZ: 2 });
        assert.equal(statistics.workingStride, 1); assert.equal(statistics.filter, 'none'); assert.equal(statistics.revision, 'coarse-r1');
        // the output equals a direct upsample of the coarse source with the same filter, and the cover the nearest labels
        const coarse = plainGrid(33, 2, 0, 64), source = fill(coarse, ramp), expected = new Float32Array(65 * 65), expectedCover = new Uint8Array(65 * 65);
        upsampleHeights(coarse, source, result.grid, expected, resample); upsampleCover(coarse, fill(coarse, coverAt, Uint8Array), result.grid, expectedCover);
        assert.equal(sha256(Buffer.from(result.heights.buffer, result.heights.byteOffset, result.heights.byteLength)), sha256(Buffer.from(expected.buffer)), `${resample} heights`);
        assert.equal(sha256(Buffer.from(result.cover.buffer, result.cover.byteOffset, result.cover.byteLength)), sha256(Buffer.from(expectedCover.buffer)), `${resample} cover`);
        for (let r = 0; r < 33; r++) for (let c = 0; c < 33; c++) assert.ok(Object.is(result.heights[r * 2 * 65 + c * 2], source[r * 33 + c]), 'aligned samples are the source samples');
        assert.deepEqual(result.report.inputs, [{ id: 'landscape', sha256: 'cd'.repeat(32) }]);
        result.release();
    }
    // a source finer than the recipe grid or over another extent is refused with the grid difference
    await assert.rejects(run(recipeOf(gridOf(8, 2, 2), [op('import', 'import-heights')]), { readLandscape: coarseSourceOf(.5, ramp, coverAt) }), /grid columns 65 differs from the recipe grid 33 \(a source may only be the recipe grid or coarser/);
});

test('Upsampling: with a working grid equal to the coarse source the heights are adopted unchanged, resampled at the end, and the output cover is the nearest source label', async () => {
    const grid = gridOf(16, 2, 1), heightAt = (x, z) => 2 * Math.sin(x / 7) + Math.cos(z / 5), coverAt = (x, z) => (x + z) % 3 === 0 ? 1 : 2;
    const result = await run(recipeOf(grid, [op('import', 'import-heights', { resample: 'bilinear' }), op('out', 'resample', { filter: 'bicubic' })], { working: { spacing: 2 } }), { readLandscape: coarseSourceOf(2, heightAt, coverAt) });
    const statistics = result.report.operators[0].statistics;
    assert.deepEqual(statistics.importResample, { factor: 2, filter: 'none', cover: 'nearest', target: 'output', workingFactor: 1 });
    assert.deepEqual(result.report.working, { spacing: 2, columns: 33, rows: 33 }); assert.equal(result.report.resampled, true);
    const coarse = plainGrid(33, 2, 0, 64), source = fill(coarse, heightAt);
    for (let i = 0; i < source.length; i++) assert.ok(Object.is(result.layers.height[i], source[i]), `working height ${i} is the source sample`);
    const expected = new Float32Array(65 * 65), expectedCover = new Uint8Array(65 * 65);
    resampleToGrid(coarse, source, result.grid, expected, 'bicubic'); upsampleCover(coarse, fill(coarse, coverAt, Uint8Array), result.grid, expectedCover);
    assert.equal(sha256(Buffer.from(result.heights.buffer, result.heights.byteOffset, result.heights.byteLength)), sha256(Buffer.from(expected.buffer)));
    assert.equal(sha256(Buffer.from(result.cover.buffer, result.cover.byteOffset, result.cover.byteLength)), sha256(Buffer.from(expectedCover.buffer)));
    assert.deepEqual(result.report.outputCover, { policy: 'keep-source', source: 'native-cover', planningRestoredSamples: 0 });
    result.release();
    // a working grid coarser than the coarse source decimates the source with the declared filter
    const decimated = await run(recipeOf(grid, [op('import', 'import-heights', { filter: 'tent' }), op('out', 'resample', { filter: 'bilinear' })], { working: { spacing: 4 } }), { readLandscape: coarseSourceOf(2, heightAt, coverAt) });
    const working = plainGrid(17, 4, 0, 64), tent = new Float32Array(17 * 17);
    decimateHeights(coarse, source, working, tent, 'tent');
    assert.deepEqual(decimated.report.operators[0].statistics.importResample, { factor: 2, filter: 'none', cover: 'nearest', target: 'output', workingStride: 2, decimation: 'tent' });
    for (let i = 0; i < tent.length; i++) assert.ok(Object.is(decimated.layers.height[i], tent[i]), `decimated working height ${i}`);
    decimated.release();
});

test('Upsampling: the same-grid and decimation paths are unchanged (importResample factor 1) and bit-identical across runs', async () => {
    const grid = gridOf(16, 2, 1), heightAt = (x, z) => .1 * x + .05 * z * z / 10;
    const sourceOf = (binding, { memory, output }) => {
        const n = output.columns * output.rows, heights = memory.allocate('source/heights', Float32Array, n), cover = memory.allocate('source/cover', Uint8Array, n);
        for (let r = 0; r < output.rows; r++) for (let c = 0; c < output.columns; c++) { heights[r * output.columns + c] = heightAt(output.minX + c, output.maxZ - r); cover[r * output.columns + c] = 2; }
        return { grid: output, heights, cover, tracked: ['source/heights', 'source/cover'], sha256: 'ab'.repeat(32) };
    };
    const same = await run(recipeOf(grid, [op('import', 'import-heights')]), { readLandscape: sourceOf });
    assert.deepEqual(same.report.operators[0].statistics.importResample, { factor: 1, filter: 'none', cover: 'none', target: 'output' });
    for (let r = 0; r < 65; r++) for (let c = 0; c < 65; c++) assert.ok(Object.is(same.heights[r * 65 + c], Math.fround(heightAt(c, 64 - r))));
    same.release();
    const coarse = await run(recipeOf(grid, [op('import', 'import-heights'), op('out', 'resample', { filter: 'bilinear' })], { working: { spacing: 2 } }), { readLandscape: sourceOf });
    const again = await run(recipeOf(grid, [op('import', 'import-heights'), op('out', 'resample', { filter: 'bilinear' })], { working: { spacing: 2 } }), { readLandscape: sourceOf });
    assert.deepEqual(coarse.report.operators[0].statistics.importResample, { factor: 1, filter: 'none', cover: 'none', target: 'working' });
    assert.equal(coarse.report.operators[0].statistics.workingStride, 2); assert.equal(coarse.report.operators[0].statistics.filter, 'tent');
    assert.equal(sha256(Buffer.from(coarse.heights.buffer, coarse.heights.byteOffset, coarse.heights.byteLength)), sha256(Buffer.from(again.heights.buffer, again.heights.byteOffset, again.heights.byteLength)));
    coarse.release(); again.release();
});
