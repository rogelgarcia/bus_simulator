// Verifies the embedded placement of import-heights (AI 596 D5): a source landscape inside a sub-rectangle of the recipe grid, decimated by the integer factor, the fill outside it, the recipe rules and the plan without districts or roads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TerrainFieldMemory } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsGrid.mjs';
import { executeSynthesisRecipe } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisGraph.mjs';
import { decimateHeights, embedCover, embedHeights, embedPlacement, resampleToGrid } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisWorkingGrid.mjs';
import { parseSynthesisPlan } from '../../../tools/bake_landscape/terrain_synthesis/operators/Plan.mjs';
import { validateLandscapeSynthesisRecipe } from '../../../src/app/landscape/index.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const op = (id, type, params = {}, mask = null) => ({ id, op: type, params, mask, seed: null, enabled: true });
const gridOf = (chunkIntervals, maxLevel, spacing, minX = 0, minZ = 0) => {
    const intervals = chunkIntervals * 2 ** maxLevel;
    return { columns: intervals + 1, rows: intervals + 1, spacingX: spacing, spacingZ: spacing, bounds: { minX, maxX: minX + intervals * spacing, minZ, maxZ: minZ + intervals * spacing }, chunkIntervals, maxLevel };
};
const recipeOf = (grid, operators, { working = null, plan = false } = {}) => ({
    format: 'landscape-synthesis-recipe', schemaVersion: 1, id: 'embed-test', seed: 11, seaLevel: 0, grid, working,
    inputs: { landscape: { directory: 'synthetic', expectedRevision: null }, plan: plan ? { districts: 'districts.json', roads: 'roads.json', shoreline: 'shoreline.json', beachPoints: 'beach_points.json', landCover: null } : null, imports: [] },
    operators, outputs: { heightCap: null, coverPolicy: 'keep-source', channels: ['height'] }, overrides: []
});
const plainGrid = (columns, spacing, minX, maxZ) => ({ columns, rows: columns, spacingX: spacing, spacingZ: spacing, minX, maxZ });
const fill = (grid, at, Type = Float32Array) => { const out = new Type(grid.columns * grid.rows); for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.columns; c++) out[r * grid.columns + c] = at(grid.minX + c * grid.spacingX, grid.maxZ - r * grid.spacingZ, c, r); return out; };
const smooth = (edge0, edge1, value) => { const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };
const run = (recipe, inputs) => executeSynthesisRecipe({ recipe, inputs, memory: new TerrainFieldMemory(64 << 20) });
// a source landscape over its own bounds, generated from world functions (the engine reads it through the readLandscape hook)
const sourceOf = (grid, heightAt, coverAt) => (binding, { memory }) => {
    const n = grid.columns * grid.rows, heights = memory.allocate('source/heights', Float32Array, n), cover = memory.allocate('source/cover', Uint8Array, n);
    heights.set(fill(grid, heightAt)); cover.set(fill(grid, coverAt, Uint8Array));
    return { grid: { ...grid }, heights, cover, tracked: ['source/heights', 'source/cover'], sha256: 'ee'.repeat(32), revision: 'embedded-r1', seaLevel: 0 };
};

// the 13² target at 2 m over 0..24 and a 5² source at 2 m over 8..16 (rectangle columns 4..8, rows 4..8)
const TARGET = plainGrid(13, 2, 0, 24), SOURCE = plainGrid(5, 2, 8, 16), SOURCE_AT = (x, z) => 10 + x * .5 - z * .25;

test('Embed: a 5² source embedded in a 13² grid reproduces its values exactly and fades to the fill over the declared distance', () => {
    assert.deepEqual(embedPlacement(SOURCE, TARGET), { factor: 1, column: 4, row: 4, columns: 5, rows: 5 });
    const values = fill(SOURCE, SOURCE_AT), out = new Float32Array(169), statistics = embedHeights(SOURCE, values, TARGET, out, { fillMode: 'extend-edge', fillHeightMeters: -5, fillFadeMeters: 6 });
    assert.deepEqual(statistics, { factor: 1, column: 4, row: 4, columns: 5, rows: 5, filledSamples: 169 - 25, fill: { mode: 'extend-edge', heightMeters: -5, fadeMeters: 6, smoothingMeters: 0 } });
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) assert.ok(Object.is(out[(4 + r) * 13 + 4 + c], values[r * 5 + c]), `embedded sample ${c},${r} is the source sample`);
    // one column west of the rectangle: the edge sample of that row faded 2 m toward the fill; three columns west (6 m): exactly the fill
    const edge = r => values[r * 5], expect = (r, distance) => Math.fround(edge(r) + (-5 - edge(r)) * smooth(0, 6, distance));
    for (let r = 0; r < 5; r++) {
        assert.equal(out[(4 + r) * 13 + 3], expect(r, 2), `row ${r} one sample west`);
        assert.equal(out[(4 + r) * 13 + 2], expect(r, 4), `row ${r} two samples west`);
        assert.equal(out[(4 + r) * 13 + 1], -5, `row ${r} at the fade distance holds the fill exactly`);
        assert.equal(out[(4 + r) * 13 + 0], -5);
    }
    // north of the rectangle the top row continues; a corner sample takes the corner value at its Euclidean distance (2, 2 samples: 2 sqrt 2 m)
    assert.equal(out[3 * 13 + 6], Math.fround(values[2] + (-5 - values[2]) * smooth(0, 6, 2)));
    assert.equal(out[2 * 13 + 2], Math.fround(values[0] + (-5 - values[0]) * smooth(0, 6, Math.hypot(4, 4))));
    assert.equal(out[3 * 13 + 3], Math.fround(values[0] + (-5 - values[0]) * smooth(0, 6, Math.hypot(2, 2))));
    assert.equal(out[12 * 13 + 12], -5, 'the far corner is the fill');
    // no fade: the boundary continues unchanged everywhere outside; constant: the fill everywhere outside
    const continued = new Float32Array(169);
    embedHeights(SOURCE, values, TARGET, continued, { fillMode: 'extend-edge', fillHeightMeters: -5, fillFadeMeters: 0 });
    for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) assert.ok(Object.is(continued[r * 13 + c], values[Math.min(4, Math.max(0, r - 4)) * 5 + Math.min(4, Math.max(0, c - 4))]), `continued ${c},${r}`);
    const constant = new Float32Array(169);
    embedHeights(SOURCE, values, TARGET, constant, { fillMode: 'constant', fillHeightMeters: 7 });
    for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) assert.equal(constant[r * 13 + c], r >= 4 && r <= 8 && c >= 4 && c <= 8 ? values[(r - 4) * 5 + c - 4] : 7);
    // the cover: aligned labels inside, the fill class outside
    const labels = fill(SOURCE, (x, z, c, r) => 1 + (c + r) % 4, Uint8Array), cover = new Uint8Array(169);
    assert.deepEqual(embedCover(SOURCE, labels, TARGET, cover, 3), { factor: 1, column: 4, row: 4, columns: 5, rows: 5 });
    for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) assert.equal(cover[r * 13 + c], r >= 4 && r <= 8 && c >= 4 && c <= 8 ? labels[(r - 4) * 5 + c - 4] : 3);
    assert.throws(() => embedHeights(SOURCE, values, TARGET, out, { fillMode: 'mirror' }), /Unsupported embed fill mode/);
    assert.throws(() => embedHeights(SOURCE, values, TARGET, out, { fillFadeMeters: 0, fillSmoothingMeters: 4 }), /smoothing needs a positive fade/);
    // smoothing: an alternating boundary (+-4 around 10) continued two samples out blurs toward its mean while the boundary samples stay exact
    const alternating = fill(SOURCE, (x, z, c, r) => 10 + (c % 2 ? 4 : -4)), plain = new Float32Array(169), smoothed = new Float32Array(169);
    embedHeights(SOURCE, alternating, TARGET, plain, { fillMode: 'extend-edge', fillHeightMeters: 10, fillFadeMeters: 8 });
    const report = embedHeights(SOURCE, alternating, TARGET, smoothed, { fillMode: 'extend-edge', fillHeightMeters: 10, fillFadeMeters: 8, fillSmoothingMeters: 6 });
    assert.deepEqual(report.fill, { mode: 'extend-edge', heightMeters: 10, fadeMeters: 8, smoothingMeters: 6 });
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) assert.ok(Object.is(smoothed[(4 + r) * 13 + 4 + c], alternating[r * 5 + c]), 'the embedded samples are untouched by the smoothing');
    const ripple = out => Math.max(...[4, 5, 6, 7, 8].map(c => Math.abs(out[2 * 13 + c] - 10)));
    assert.ok(Math.abs(ripple(plain) - 2) < 1e-6 && ripple(smoothed) < ripple(plain) / 3, `two samples north the raw continuation ripples by ${ripple(plain).toFixed(2)} m (half the +-4 at half the fade), the smoothed one by ${ripple(smoothed).toFixed(2)} m`);
    assert.ok(Math.abs(smoothed[3 * 13 + 6] - 10) < Math.abs(plain[3 * 13 + 6] - 10), 'one sample out the blur is already narrower than the raw ripple');
    for (let c = 0; c < 13; c++) assert.equal(smoothed[0 * 13 + c], 10, 'at the fade distance the fill is exact');
});

test('Embed: a finer source is decimated by the integer factor with the declared filter into its rectangle, and misaligned sources are refused', () => {
    const fine = plainGrid(9, 1, 8, 16), bump = fill(fine, (x, z) => Math.sin(x / 1.7) * 3 + Math.cos(z / 2.3) * 2 + x * .1);
    assert.deepEqual(embedPlacement(fine, TARGET), { factor: 2, column: 4, row: 4, columns: 5, rows: 5 });
    for (const filter of ['tent', 'nearest']) {
        const expected = new Float32Array(25), out = new Float32Array(169);
        decimateHeights(fine, bump, SOURCE, expected, filter);
        const statistics = embedHeights(fine, bump, TARGET, out, { filter, fillMode: 'constant', fillHeightMeters: 0 });
        assert.equal(statistics.factor, 2); assert.equal(statistics.filledSamples, 144);
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) assert.ok(Object.is(out[(4 + r) * 13 + 4 + c], expected[r * 5 + c]), `${filter} decimated sample ${c},${r}`);
    }
    const labels = fill(fine, (x, z, c, r) => (c * 3 + r) % 5, Uint8Array), cover = new Uint8Array(169);
    embedCover(fine, labels, TARGET, cover, 0);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) assert.equal(cover[(4 + r) * 13 + 4 + c], labels[r * 2 * 9 + c * 2], 'aligned label');
    assert.throws(() => embedPlacement(plainGrid(5, 2, 9, 16), TARGET), /must lie on a target sample/);
    assert.throws(() => embedPlacement(plainGrid(5, 2, 20, 16), TARGET), /leaves the target grid/);
    assert.throws(() => embedPlacement(plainGrid(5, 4, 8, 16), TARGET), /must divide the target spacing/);
    assert.throws(() => embedPlacement(plainGrid(5, 1.5, 8, 16), TARGET), /must divide the target spacing/);
    assert.throws(() => embedPlacement(plainGrid(6, 1, 8, 16), TARGET), /whole target intervals/);
});

test('Embed: import-heights places the source landscape, fills the grid, reports importPlacement and keeps the cover; a coarse working grid embeds at its own factor', async () => {
    const grid = gridOf(3, 2, 2), coverAt = (x, z) => (x + z) % 4 === 0 ? 1 : 4, source = sourceOf(SOURCE, SOURCE_AT, coverAt);
    const params = { placement: 'embed', fillMode: 'extend-edge', fillHeightMeters: -5, fillFadeMeters: 6, fillCoverClass: 3 };
    const result = await run(recipeOf(grid, [op('import', 'import-heights', params)]), { readLandscape: source });
    const statistics = result.report.operators[0].statistics;
    assert.equal(statistics.placement, 'embed'); assert.equal(statistics.revision, 'embedded-r1');
    assert.deepEqual(statistics.importPlacement, { placement: 'embed', factor: 1, outputFactor: 1, rectangle: { column: 4, row: 4, columns: 5, rows: 5 }, filledSamples: 144, fill: { mode: 'extend-edge', heightMeters: -5, fadeMeters: 6, smoothingMeters: 0, coverClass: 3 }, target: 'output' });
    assert.deepEqual(statistics.importResample, { factor: 1, filter: 'none', cover: 'none', target: 'output' }); assert.equal(statistics.workingStride, 1); assert.equal(statistics.filter, 'none');
    const expected = new Float32Array(169), expectedCover = new Uint8Array(169);
    embedHeights(SOURCE, fill(SOURCE, SOURCE_AT), result.grid, expected, { fillMode: 'extend-edge', fillHeightMeters: -5, fillFadeMeters: 6 }); embedCover(SOURCE, fill(SOURCE, coverAt, Uint8Array), result.grid, expectedCover, 3);
    assert.equal(sha256(Buffer.from(result.heights.buffer, result.heights.byteOffset, result.heights.byteLength)), sha256(Buffer.from(expected.buffer)));
    assert.equal(sha256(Buffer.from(result.cover.buffer, result.cover.byteOffset, result.cover.byteLength)), sha256(Buffer.from(expectedCover.buffer)));
    assert.deepEqual(result.report.inputs, [{ id: 'landscape', sha256: 'ee'.repeat(32) }]);
    result.release();
    // a finer source (factor 2 to the output grid) under a coarser working grid (4 m: factor 4) embeds on both grids; the output cover is the output-grid placement
    const fine = plainGrid(9, 1, 8, 16), fineAt = (x, z) => Math.sin(x / 1.7) * 3 + Math.cos(z / 2.3) * 2 + x * .1;
    const coarse = await run(recipeOf(grid, [op('import', 'import-heights', { ...params, filter: 'tent' }), op('out', 'resample', { filter: 'bilinear' })], { working: { spacing: 4 } }), { readLandscape: sourceOf(fine, fineAt, coverAt) });
    const placement = coarse.report.operators[0].statistics.importPlacement;
    assert.deepEqual(placement, { placement: 'embed', factor: 4, outputFactor: 2, rectangle: { column: 2, row: 2, columns: 3, rows: 3 }, filledSamples: 49 - 9, fill: { mode: 'extend-edge', heightMeters: -5, fadeMeters: 6, smoothingMeters: 0, coverClass: 3 }, target: 'working' });
    assert.equal(coarse.report.operators[0].statistics.workingStride, 4); assert.equal(coarse.report.operators[0].statistics.filter, 'tent');
    const working = plainGrid(7, 4, 0, 24), workingHeights = new Float32Array(49), resampled = new Float32Array(169), outputCover = new Uint8Array(169);
    embedHeights(fine, fill(fine, fineAt), working, workingHeights, { filter: 'tent', fillMode: 'extend-edge', fillHeightMeters: -5, fillFadeMeters: 6 });
    for (let i = 0; i < 49; i++) assert.ok(Object.is(coarse.layers.height[i], workingHeights[i]), `working height ${i}`);
    resampleToGrid(working, workingHeights, coarse.grid, resampled, 'bilinear'); embedCover(fine, fill(fine, coverAt, Uint8Array), coarse.grid, outputCover, 3);
    assert.equal(sha256(Buffer.from(coarse.heights.buffer, coarse.heights.byteOffset, coarse.heights.byteLength)), sha256(Buffer.from(resampled.buffer)));
    assert.equal(sha256(Buffer.from(coarse.cover.buffer, coarse.cover.byteOffset, coarse.cover.byteLength)), sha256(Buffer.from(outputCover.buffer)));
    assert.deepEqual(coarse.report.outputCover, { policy: 'keep-source', source: 'native-cover', planningRestoredSamples: 0 });
    coarse.release();
    // the sea level of the embedded landscape must match the recipe, and a source whose origin is off the grid is refused
    await assert.rejects(run(recipeOf(grid, [op('import', 'import-heights', params)]), { readLandscape: (binding, options) => ({ ...source(binding, options), seaLevel: 1 }) }), /sea level 1 differs/);
    await assert.rejects(run(recipeOf(grid, [op('import', 'import-heights', params)]), { readLandscape: sourceOf(plainGrid(5, 2, 9, 16), SOURCE_AT, coverAt) }), /must lie on a target sample/);
});

test('Embed: the recipe rules bind the fill parameters to placement embed and embed to landscape sources; the catalog defaults keep the extent placement', () => {
    const grid = gridOf(3, 2, 2), valid = recipeOf(grid, [op('import', 'import-heights', { placement: 'embed', fillHeightMeters: 20, fillFadeMeters: 300, fillCoverClass: 3 })]);
    const recipe = validateLandscapeSynthesisRecipe(valid);
    assert.equal(recipe.operators[0].params.placement, 'embed');
    assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf(grid, [op('import', 'import-heights', { fillFadeMeters: 300 })])), /fillFadeMeters applies only to placement embed/);
    assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf(grid, [op('import', 'import-heights', { placement: 'extent', fillMode: 'constant' })])), /fillMode applies only to placement embed/);
    assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf(grid, [op('import', 'import-heights', { source: 'raw-float32', file: 'h.raw', columns: 13, rows: 13, placement: 'embed' })])), /placement embed applies only to landscape sources/);
    assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf(grid, [op('import', 'import-heights', { placement: 'embed', fillMode: 'mirror' })])), /fillMode must be one of extend-edge, constant/);
    assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf(grid, [op('import', 'import-heights', { placement: 'embed', fillFadeMeters: -1 })])), /fillFadeMeters must be in 0..100000/);
    const same = validateLandscapeSynthesisRecipe(recipeOf(grid, [op('import', 'import-heights')]));
    assert.equal(same.operators[0].params.placement, undefined, 'defaults are not filled into the validated copy');
});

test('Embed: a plan without districts or roads parses, plan-inputs leaves the road distance infinite and constrain-roads refuses it', async () => {
    const order = 'X east, Y elevation, Z north; metres';
    const files = { districts: [], roads: { coordinate_order: order, roads: [] }, shoreline: { coordinate_order: 'X east, Y sea level, Z north; metres', points_xyz_m: [[8, 0, 30], [10, 0, 12], [8, 0, -6]] }, beachPoints: { coordinate_order: order, points: [] } };
    const plan = parseSynthesisPlan(files);
    assert.deepEqual(plan.districts, []); assert.deepEqual(plan.roads, []); assert.equal(plan.shoreline.length, 3); assert.equal(plan.beachPoints.corridor, null);
    const grid = gridOf(3, 2, 2), source = sourceOf(plainGrid(13, 2, 0, 24), (x, z) => x - 9, (x, z) => (x < 9 ? 0 : 2));
    const result = await run(recipeOf(grid, [op('import', 'import-heights'), op('plan', 'plan-inputs', { landSide: 'east', runwayPolygon: null, apronPolygon: null })], { plan: true }), { readLandscape: source, planFiles: files });
    const statistics = result.report.operators[1].statistics;
    assert.deepEqual(statistics.districts, {}); assert.deepEqual(statistics.roads, { count: 0, featureSamples: 0, segments: 0 });
    assert.ok(statistics.shoreline.landSamples > 0 && statistics.shoreline.landSamples < 169);
    for (let i = 0; i < 169; i++) { assert.equal(result.layers.roadDistance[i], Infinity); assert.equal(result.layers.roadIndex[i], -1); assert.equal(result.layers.districtId[i], 0); }
    assert.ok(result.layers.shoreSigned[6 * 13 + 12] > 0 && result.layers.shoreSigned[6 * 13 + 0] < 0, 'the land side is east');
    result.release();
    await assert.rejects(run(recipeOf(grid, [op('import', 'import-heights'), op('plan', 'plan-inputs', { runwayPolygon: null, apronPolygon: null }), op('roads', 'constrain-roads')], { plan: true }), { readLandscape: source, planFiles: files }), /the plan has no road to constrain/);
    assert.throws(() => parseSynthesisPlan({ ...files, districts: new Array(256).fill({ id: 1 }) }), /0\.\.255 district records/);
    assert.throws(() => parseSynthesisPlan({ ...files, roads: { coordinate_order: order, roads: new Array(513).fill({}) } }), /0\.\.512 roads/);
});
