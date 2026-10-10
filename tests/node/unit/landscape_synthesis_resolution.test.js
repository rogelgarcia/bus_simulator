// Verifies the D3 resolution study pieces: fixture grids per spacing, coincident-vertex equality of the bases, the derived recipes, the leaf registration and the sharpness measurement helpers on synthetic terrain.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { TerrainFieldMemory } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsGrid.mjs';
import { planBakes } from '../../../tools/baking/Graph.mjs';
import { parseBakeOptions, resolveBakeOptions } from '../../../tools/baking/Options.mjs';
import { bakeJobs } from '../../../tools/baking/registry.mjs';
import { createFixtureBase, fixtureGridForSpacing, fixtureSpacingTag, FIXTURE_CITY_EXTENT_METERS, FIXTURE_GRID, FIXTURE_SPACINGS } from '../../../tools/bake_landscape/terrain_synthesis/fixture/FixtureBase.mjs';
import { fixtureGridOf } from '../../../tools/bake_landscape/terrain_synthesis/fixture/SynthesisFixture.mjs';
import { RESOLUTION_CITY_ID_PREFIX, RESOLUTION_CITY_RECIPES, RESOLUTION_LANDSCAPE_ID_PREFIX, RESOLUTION_STUDY_RECIPES, runResolutionStudy } from '../../../tools/bake_landscape/terrain_synthesis/resolution_study/ResolutionStudy.mjs';
import { RESOLUTION_STUDY_RECEIPT } from '../../../tools/bake_landscape/terrain_synthesis/resolution_study/ResolutionStudyJob.mjs';
import { bermCrestMeasure, bluffFaceMeasure, contributingAreaRaster, deepestIncisionPoint, distanceToPolygonBoundary, fixedWindow, gullyWidthMeasure, landformAgreement, nearestLocalMaximum, ridgeCurvatureMeasure, rowsWithTallestRise, selectRidgePoints, transectProfile } from '../../../tools/bake_landscape/terrain_synthesis/resolution_study/ResolutionMeasures.mjs';
import { extractGridWindow, needleStatistics } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisAnalysis.mjs';
import { renderHillshadeWindow } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisReview.mjs';
import { validateLandscapeSynthesisRecipe, LANDSCAPE_SYNTHESIS_OPERATORS } from '../../../src/app/landscape/index.js';

const RADIANS = Math.PI / 180;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const artifacts = path.join(root, 'tests/artifacts/node/landscape_synthesis');
await mkdir(artifacts, { recursive: true });
const gridOf = (columns, rows, spacing) => ({ columns, rows, spacingX: spacing, spacingZ: spacing, minX: 0, maxZ: (rows - 1) * spacing });
const field = (grid, f) => Float32Array.from({ length: grid.columns * grid.rows }, (_, i) => f(grid.minX + (i % grid.columns) * grid.spacingX, grid.maxZ - Math.floor(i / grid.columns) * grid.spacingZ));
const within = (actual, low, high, label) => assert.ok(actual >= low && actual <= high, `${label}: ${actual} not within ${low}..${high}`);
const readRecipe = async file => { const bytes = await readFile(path.resolve(file)); return { bytes, recipe: validateLandscapeSynthesisRecipe(JSON.parse(bytes.toString('utf8'))) }; };

test('Resolution study: the fixture grids at the three spacings share the 1 km bounds and nest dyadically; the city extent adds two levels', () => {
    assert.deepEqual(FIXTURE_SPACINGS.map(fixtureSpacingTag), ['1953', '0977', '0488']);
    const grids = FIXTURE_SPACINGS.map(spacing => fixtureGridForSpacing(spacing));
    assert.deepEqual(grids.map(grid => [grid.columns, grid.rows, grid.maxLevel]), [[513, 513, 1], [1025, 1025, 2], [2049, 2049, 3]]);
    for (const grid of grids) { assert.equal(grid.chunkIntervals, 256); assert.deepEqual(grid.bounds, { minX: 0, maxX: 1000, minZ: 0, maxZ: 1000 }); assert.equal((grid.columns - 1) * grid.spacingX, 1000); assert.equal(grid.columns, 256 * 2 ** grid.maxLevel + 1); }
    assert.deepEqual(FIXTURE_GRID, grids[0]);
    assert.throws(() => fixtureGridForSpacing(3.90625), /not a fixture spacing/);
    assert.throws(() => fixtureSpacingTag(1), /not a fixture spacing/);
    assert.throws(() => fixtureGridForSpacing(1.953125, { extentMeters: 1500 }), /256 x 2\^k/);
    const city = [1.953125, 0.9765625].map(spacing => fixtureGridForSpacing(spacing, { extentMeters: FIXTURE_CITY_EXTENT_METERS }));
    assert.deepEqual(city.map(grid => [grid.columns, grid.maxLevel, grid.bounds.maxX]), [[2049, 3, 4000], [4097, 4, 4000]]);
});

test('Resolution study: the analytic base gives bit-identical float32 heights and cover on the vertices the three grids share', () => {
    const [coarse, medium, fine] = FIXTURE_SPACINGS.map(spacing => createFixtureBase(fixtureGridForSpacing(spacing)));
    assert.equal(coarse.heights.length, 513 * 513); assert.equal(medium.heights.length, 1025 * 1025); assert.equal(fine.heights.length, 2049 * 2049);
    for (let row = 0; row < 513; row++) for (let column = 0; column < 513; column++) {
        const i = row * 513 + column, j = 2 * row * 1025 + 2 * column, k = 4 * row * 2049 + 4 * column;
        if (!Object.is(coarse.heights[i], medium.heights[j]) || !Object.is(coarse.heights[i], fine.heights[k]) || coarse.cover[i] !== medium.cover[j] || coarse.cover[i] !== fine.cover[k]) assert.fail(`coarse vertex (${column}, ${row}) differs on a finer grid`);
    }
    for (let row = 0; row < 1025; row++) for (let column = 0; column < 1025; column++) {
        const j = row * 1025 + column, k = 2 * row * 2049 + 2 * column;
        if (!Object.is(medium.heights[j], fine.heights[k]) || medium.cover[j] !== fine.cover[k]) assert.fail(`medium vertex (${column}, ${row}) differs on the fine grid`);
    }
    // the finer grids hold new samples between the shared vertices, and the bytes are the little-endian float32 of the heights
    assert.ok(fine.heights[4 * 200 * 2049 + 4 * 300 + 1] !== fine.heights[4 * 200 * 2049 + 4 * 300] || fine.heights[4 * 200 * 2049 + 4 * 300 + 2] !== fine.heights[4 * 200 * 2049 + 4 * 300]);
    assert.equal(coarse.heightBytes.length, 513 * 513 * 4);
    assert.equal(new DataView(coarse.heightBytes.buffer).getFloat32(4 * (100 * 513 + 200), true), coarse.heights[100 * 513 + 200]);
    assert.ok(createFixtureBase().heights.every((value, i) => Object.is(value, coarse.heights[i])), 'the default base is the coarse grid');
});

test('Resolution study: the derived recipes keep the D2 recipe except the grid, the import dimensions, the density-scaled droplets, the physical brush and the export file', async () => {
    const [d2, r0977, r0488] = await Promise.all(RESOLUTION_STUDY_RECIPES.map(readRecipe));
    assert.equal(d2.recipe.id, 'ai596-d2-fixture-plateau-road-shoreline'); assert.equal(d2.recipe.grid.spacingX, 1.953125); assert.deepEqual(fixtureGridOf(d2.recipe), FIXTURE_GRID);
    const radiusCap = LANDSCAPE_SYNTHESIS_OPERATORS['hydraulic-erosion'].parameters.radius.max;
    assert.equal(radiusCap, 16);
    const expected = { '0977': { columns: 1025, maxLevel: 2, radius: 10 }, '0488': { columns: 2049, maxLevel: 3, radius: 16 } };
    for (const { recipe } of [r0977, r0488]) {
        const grid = fixtureGridOf(recipe), tag = fixtureSpacingTag(grid.spacingX);
        assert.equal(recipe.id, `ai596-d3-fixture-plateau-road-shoreline-${tag}`); assert.equal(recipe.seed, d2.recipe.seed); assert.equal(recipe.seaLevel, 0); assert.equal(recipe.working, null);
        assert.deepEqual(recipe.inputs, d2.recipe.inputs); assert.deepEqual(recipe.outputs, d2.recipe.outputs); assert.deepEqual(recipe.overrides, []);
        assert.equal(grid.columns, expected[tag].columns); assert.equal(grid.maxLevel, expected[tag].maxLevel);
        assert.equal(recipe.operators.length, d2.recipe.operators.length);
        recipe.operators.forEach((operator, i) => {
            const source = d2.recipe.operators[i];
            assert.equal(operator.id, source.id); assert.equal(operator.op, source.op); assert.deepEqual(operator.mask, source.mask); assert.equal(operator.seed, source.seed); assert.equal(operator.enabled, source.enabled);
            if (operator.op === 'import-heights') assert.deepEqual(operator.params, { ...source.params, columns: grid.columns, rows: grid.rows });
            else if (operator.op === 'hydraulic-erosion') assert.deepEqual(operator.params, { ...source.params, droplets: null, dropletsPerSquareKilometer: 30000, radius: expected[tag].radius });
            else if (operator.op === 'export-map') assert.deepEqual(operator.params, { ...source.params, file: `fixture-height-${tag}.exr` });
            else assert.deepEqual(operator.params, source.params, `${operator.id} parameters are unchanged`);
        });
        // the density reproduces the D2 count over the 1 km² fixture and the brush keeps its 9.77 m radius until the catalog cap bites at 0.488 m
        assert.equal(Math.round(30000 * ((grid.columns - 1) * grid.spacingX) ** 2 / 1e6), d2.recipe.operators.find(operator => operator.op === 'hydraulic-erosion').params.droplets);
        assert.equal(expected[tag].radius, Math.min(radiusCap, Math.round(5 * 1.953125 / grid.spacingX)));
    }
    assert.equal(r0977.recipe.operators.find(operator => operator.op === 'hydraulic-erosion').params.radius * 0.9765625, 9.765625);
    assert.equal(r0488.recipe.operators.find(operator => operator.op === 'hydraulic-erosion').params.radius * 0.48828125, 7.8125);
    assert.throws(() => fixtureGridOf({ ...r0977.recipe, grid: { ...r0977.recipe.grid, maxLevel: 3 } }), /native fixture grid/);
});

test('Resolution study: the city-extent recipes run the reduced operator chain on the 4 km base without a plan', async () => {
    for (const file of RESOLUTION_CITY_RECIPES) {
        const { recipe } = await readRecipe(file), grid = fixtureGridOf(recipe), tag = fixtureSpacingTag(grid.spacingX);
        assert.equal(recipe.id, `ai596-d3-fixture-city-extent-${tag}`); assert.equal(recipe.seed, 596200); assert.equal(recipe.inputs.plan, null); assert.equal(recipe.inputs.landscape, null);
        assert.deepEqual([grid.columns, grid.maxLevel, grid.bounds.maxX], tag === '1953' ? [2049, 3, 4000] : [4097, 4, 4000]);
        assert.deepEqual(recipe.operators.map(operator => operator.op), ['import-heights', 'landform-hills', 'strata', 'fluvial-erosion', 'hydraulic-erosion', 'thermal-weathering', 'sediment-deposit', 'terraces', 'height-cap', 'geology-channels', 'resample']);
        const hydraulic = recipe.operators.find(operator => operator.op === 'hydraulic-erosion').params;
        assert.equal(hydraulic.droplets, null); assert.equal(hydraulic.dropletsPerSquareKilometer, 30000); assert.equal(hydraulic.radius, tag === '1953' ? 5 : 10);
        assert.equal(recipe.operators.find(operator => operator.op === 'fluvial-erosion').params.iterations, 40);
        assert.equal(recipe.outputs.heightCap, 160); assert.equal(recipe.operators.find(operator => operator.op === 'height-cap').params.capMeters, 160);
        for (const operator of recipe.operators) if (operator.mask) assert.equal(operator.mask.type, 'height', `${operator.id} masks by height, the plan is 1 km`);
        assert.equal(recipe.operators.find(operator => operator.op === 'import-heights').params.columns, grid.columns);
    }
});

test('Resolution study: the leaf is an always-run Node-only child of landscape/synthesis with scoped options and fixed landscape ids', () => {
    const plan = planBakes(bakeJobs, 'landscape/synthesis/resolution-study');
    assert.deepEqual(plan.map(job => job.id), ['landscape/synthesis/resolution-study']);
    assert.equal(plan[0].always, true); assert.deepEqual(plan[0].configurationPaths, []); assert.equal(plan[0].blender, undefined);
    assert.deepEqual(plan[0].outputs, [RESOLUTION_STUDY_RECEIPT]); assert.equal(RESOLUTION_STUDY_RECEIPT, 'tests/artifacts/screens/landscape/ai596/d3/resolution/resolution-study.json');
    const defaults = resolveBakeOptions(plan, parseBakeOptions([])).get('landscape/synthesis/resolution-study');
    assert.equal(defaults.recipes, RESOLUTION_STUDY_RECIPES.join(',')); assert.equal(defaults.output, 'tests/artifacts/screens/landscape/ai596/d3/resolution'); assert.equal(defaults['landscape-root'], 'assets/public/landscape');
    assert.equal(defaults.fields, 'none'); assert.equal(defaults['city-extent'], 'false'); assert.equal(defaults['city-recipes'], RESOLUTION_CITY_RECIPES.join(','));
    const scoped = resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/synthesis/resolution-study:fields=bake', '--set', 'landscape/synthesis/resolution-study:city-extent=true'])).get('landscape/synthesis/resolution-study');
    assert.equal(scoped.fields, 'bake'); assert.equal(scoped['city-extent'], 'true');
    assert.equal(resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/synthesis/resolution-study:city-extent=only'])).get('landscape/synthesis/resolution-study')['city-extent'], 'only');
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/synthesis/resolution-study:city-extent=yes'])), /true, false or only/);
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/synthesis/resolution-study:fields=maybe'])), /bake or none/);
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/synthesis/resolution-study:recipes='])), /expects job\/id:option=value/);
    assert.deepEqual(planBakes(bakeJobs, 'landscape/synthesis').map(job => job.id), ['landscape/synthesis/relief-study', 'landscape/synthesis/fixture', 'landscape/synthesis/resolution-study', 'landscape/synthesis']);
    assert.ok(planBakes(bakeJobs, 'all').every(job => !job.id.startsWith('landscape')));
    assert.ok(planBakes(bakeJobs, 'landscape').every(job => !job.id.startsWith('landscape/synthesis')));
    assert.deepEqual(FIXTURE_SPACINGS.map(spacing => `${RESOLUTION_LANDSCAPE_ID_PREFIX}${fixtureSpacingTag(spacing)}`), ['ai596-d3-fixture-1953', 'ai596-d3-fixture-0977', 'ai596-d3-fixture-0488']);
    assert.deepEqual([1.953125, 0.9765625].map(spacing => `${RESOLUTION_CITY_ID_PREFIX}${fixtureSpacingTag(spacing)}`), ['ai596-d3-fixture-4km-1953', 'ai596-d3-fixture-4km-0977']);
});

test('Resolution study: the city-only mode refuses to run without the receipt of a full run to merge into', async () => {
    const outputRoot = await mkdtemp(path.join(artifacts, 'city-only-'));
    await assert.rejects(runResolutionStudy({ root, recipeFiles: [], outputRoot, cityExtent: 'only' }), /city-extent=only needs the receipt of a full run/);
    await writeFile(path.join(outputRoot, 'resolution-study.json'), JSON.stringify({ format: 'landscape-resolution-study', schemaVersion: 1, spacings: [] }));
    await assert.rejects(runResolutionStudy({ root, recipeFiles: [], outputRoot, cityExtent: 'only' }), /not a resolution-study receipt with measured spacings/);
});

// a shore-normal synthetic coast: seabed, a 1:21 foreshore to 1.44 m, a parabolic berm crest (1.8 m at x = 136), a flat backshore and a 10 m face at `faceDegrees` behind x = 160
const coastHeight = faceDegrees => x => {
    const faceRun = 10 / Math.tan(faceDegrees * RADIANS);
    if (x < 100) return .06 * (x - 100);
    if (x < 130) return .048 * (x - 100);
    if (x < 142) return 1.8 - .01 * (x - 136) ** 2;
    if (x < 160) return 1.44;
    if (x < 160 + faceRun) return 1.44 + (x - 160) * Math.tan(faceDegrees * RADIANS);
    return 11.44 + (x - 160 - faceRun) * Math.tan(5 * RADIANS);
};

test('Resolution study: the bluff face run, rise, slopes and crest radius and the berm crest width read a synthetic coast profile', () => {
    const grid = gridOf(801, 21, .5), heights = field(grid, coastHeight(65)), profile = transectProfile(grid, heights, 5, 0, 300);
    assert.equal(profile.x.length, 1201); assert.equal(profile.stepMeters, .25);
    const bluff = bluffFaceMeasure(profile, { seaLevel: 0 });
    within(bluff.crossingX, 99.9, 100.1, 'crossing');
    assert.ok(bluff.face, 'a 65 degree face is found');
    within(bluff.face.runMeters, 4.4, 5.1, 'face run (exact 4.66 m)'); within(bluff.face.riseMeters, 9.5, 10.3, 'face rise'); within(bluff.face.meanSlopeDegrees, 60, 68, 'mean face slope');
    within(bluff.face.toeX, 159.5, 160.5, 'toe'); within(bluff.face.crestX, 164.3, 165.2, 'crest');
    within(bluff.face.crestRadiusMeters, .8, 1.3, 'crest radius (2 m chord over a sharp corner)'); within(bluff.face.toeRadiusMeters, .8, 1.3, 'toe radius');
    within(bluff.steepest.slopeDegrees, 60, 70, 'steepest station'); within(bluff.steepest.x, 160, 165, 'steepest station on the face'); within(bluff.steepest.rise5mMeters, 9, 11, 'the 5 m around the steepest station span the whole face');
    const berm = bermCrestMeasure(profile, { seaLevel: 0 });
    within(berm.berm.height, 1.79, 1.81, 'berm height'); within(berm.berm.distanceFromCrossing, 35.5, 36.5, 'berm distance'); within(berm.berm.crestWidthMeters, 5.75, 6.5, 'berm crest width (exact 6.32 m within 0.1 m)');
    assert.equal(berm.berm.bandMeters, .1); within(berm.berm.crestRadiusMeters, 49, 51, 'berm crest radius: the parabola 1.8 - 0.01 dx^2 has curvature 0.02 (the 2 m chord is exact on a parabola)');
    assert.equal(bluff.needleStationsSkipped, 0);
    // a 30 degree slope is no face: the measurement reports the steepest station and no run
    const gentle = bluffFaceMeasure(transectProfile(grid, field(grid, coastHeight(30)), 5, 0, 300), { seaLevel: 0 });
    assert.equal(gentle.face, null); within(gentle.steepest.slopeDegrees, 29, 31, 'gentle steepest slope');
    // a 6 m one-sample needle on the backshore is steeper than the face but rises and falls within a meter: skipped, the face is still found
    const needled = field(grid, (x, z) => coastHeight(65)(x) + (x === 150 ? 6 : 0)), spiked = bluffFaceMeasure(transectProfile(grid, needled, 5, 0, 300), { seaLevel: 0 });
    assert.ok(spiked.needleStationsSkipped > 0); within(spiked.steepest.x, 160, 165, 'the steepest non-needle station is on the face'); within(spiked.face.toeX, 159.5, 160.5, 'face toe with the needle present');
    const naive = bluffFaceMeasure(transectProfile(grid, needled, 5, 0, 300), { seaLevel: 0, needleDropFraction: 2 });
    within(naive.steepest.x, 149, 151, 'without the needle rule the spike wins'); assert.equal(naive.needleStationsSkipped, 0);
    // no crossing: nothing to measure
    assert.deepEqual(bluffFaceMeasure(transectProfile(grid, field(grid, () => 5), 5, 0, 300)), { crossingX: null, steepest: null, face: null, needleStationsSkipped: 0 });
    assert.deepEqual(bermCrestMeasure(transectProfile(grid, field(grid, () => 5), 5, 0, 300)), { crossingX: null, berm: null });
});

test('Resolution study: polygon clearance, the nearest summit, the landform agreement on shared vertices and the bluff-face rows', () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
    assert.equal(distanceToPolygonBoundary(square, 5, 5), 0); assert.equal(distanceToPolygonBoundary(square, 15, 5), 5); within(distanceToPolygonBoundary(square, 13, 14), 4.99, 5.01, 'corner distance'); assert.equal(distanceToPolygonBoundary(square, 5, -2), 2);
    const grid = gridOf(41, 41, 1), heights = field(grid, (x, z) => 30 - ((x - 23) ** 2 + (z - 17) ** 2) / 50);
    const summit = nearestLocalMaximum(grid, heights, 20, 20, 6);
    assert.deepEqual([summit.x, summit.z], [23, 17]); within(summit.distanceMeters, 4.24, 4.25, 'summit distance'); assert.equal(summit.height, heights[(40 - 17) * 41 + 23]);
    assert.throws(() => nearestLocalMaximum(grid, heights, 20.5, 20.5, .4), /no native sample/);
    // the fine grid nests the coarse grid; one raised shared vertex is the largest difference
    const plane = (x, z) => x * .1 + z * .05, coarse = { grid: gridOf(11, 11, 2), heights: field(gridOf(11, 11, 2), plane) }, fine = { grid: gridOf(21, 21, 1), heights: field(gridOf(21, 21, 1), plane) };
    fine.heights[(20 - 6) * 21 + 4] += 2.5;
    const agreement = landformAgreement(coarse, fine);
    assert.equal(agreement.ratio, 2); assert.equal(agreement.sharedVertices, 121); within(agreement.absoluteDeltaMeters.max, 2.49, 2.51, 'max delta'); assert.deepEqual([agreement.maxAt.x, agreement.maxAt.z], [4, 6]);
    assert.equal(agreement.absoluteDeltaMeters.p50, 0); assert.equal(agreement.within['3m'], 1); within(agreement.within['1m'], 120 / 121 - 1e-9, 120 / 121 + 1e-9, 'within 1 m');
    assert.throws(() => landformAgreement(coarse, { grid: gridOf(16, 16, 1), heights: new Float32Array(256) }), /nests/);
    // the tallest 5 m rise per third (bands = floor(row * 3 / 41): rows 0-13, 14-27, 28-40): a 9 m step on the row z = 30 (north third), a uniform 1 m step elsewhere (the first row of the middle third, z = 26), a 4 m step at z = 5 (south third)
    const steps = field(grid, (x, z) => (x < 20 ? 0 : z === 30 ? 9 : z === 5 ? 4 : 1));
    const rows = rowsWithTallestRise(grid, steps, () => ({ xStart: 0, xEnd: 40 }), { bands: 3 });
    assert.deepEqual(rows.map(row => [row.band, row.z, row.riseMeters, row.riseRunMeters]), [[0, 30, 9, 5], [1, 26, 1, 5], [2, 5, 4, 5]]);
    for (const row of rows) within(row.x, 15, 20, 'the rise sits across the step');
    assert.deepEqual(rowsWithTallestRise(grid, steps, z => (z === 5 ? { xStart: 0, xEnd: 40 } : null)), [{ band: 2, row: 35, z: 5, x: 17.5, riseMeters: 4, riseRunMeters: 5 }]);
    assert.throws(() => rowsWithTallestRise(grid, steps, null), /needs rangeOf/);
});

test('Resolution study: the quadratic crest fit recovers a cylinder radius at any spacing (to float32 storage) with the across-crest bearing', () => {
    for (const spacing of [1, 2]) {
        const grid = gridOf(40 / spacing + 1, 40 / spacing + 1, spacing);
        const straight = ridgeCurvatureMeasure(grid, field(grid, x => 50 - (x - 20) ** 2 / 20), 20, 20, 6);
        within(straight.crestRadiusMeters, 9.99, 10.01, `radius at ${spacing} m`); within(straight.k2, -1e-4, 1e-4, 'no curvature along the crest'); within(straight.gradient, 0, 1e-4, 'flat at the crest');
        within(straight.acrossCrestBearingDegrees, 89.5, 90.5, 'across the crest is east-west'); within(straight.height, 49.999, 50.001, 'crest height');
        const theta = 30 * RADIANS, tilted = ridgeCurvatureMeasure(grid, field(grid, (x, z) => 50 - ((x - 20) * Math.cos(theta) + (z - 20) * Math.sin(theta)) ** 2 / 20), 20, 20, 6);
        within(tilted.crestRadiusMeters, 9.99, 10.01, 'tilted radius'); within(tilted.acrossCrestBearingDegrees, 59.5, 60.5, 'tilted bearing');
        assert.ok(straight.samples >= 6 && straight.samples <= Math.PI * 36 / (spacing * spacing) + 20);
    }
    const valley = ridgeCurvatureMeasure(gridOf(41, 41, 1), field(gridOf(41, 41, 1), x => (x - 20) ** 2 / 20), 20, 20, 6);
    assert.equal(valley.crestRadiusMeters, null); within(valley.k1, -1e-4, 1e-4, 'a valley has no negative curvature');
    assert.equal(ridgeCurvatureMeasure(gridOf(41, 41, 1), field(gridOf(41, 41, 1), () => 7), 20, 20, 6).acrossCrestBearingDegrees, null, 'a flat surface has no crest direction');
    assert.throws(() => ridgeCurvatureMeasure(gridOf(41, 41, 1), new Float32Array(41 * 41), 20, 20, .4), /at least 6/);
});

test('Resolution study: the gully width reads the bank-to-bank distance of a V channel in the area class, and the contributing area routes a plane', () => {
    // dyadic coefficients keep every height and the bank level floor + 1 exact in float32, so the banks are hit exactly at the 2 m step
    const grid = gridOf(121, 121, .5), heights = field(grid, (x, z) => .25 * z + .5 * Math.abs(x - 30)), area = new Float64Array(grid.columns * grid.rows);
    for (let row = 0; row < grid.rows; row++) area[row * grid.columns + 60] = 20000;
    const wide = gullyWidthMeasure(grid, heights, area, { include: () => true, areaMinM2: 10000, areaMaxM2: 50000, bankMeters: 1 });
    assert.equal(wide.candidates, 121); assert.equal(wide.visited, 121); assert.equal(wide.measured, 121); assert.equal(wide.flat, 0); assert.equal(wide.unbounded, 0);
    within(wide.widthMeters.mean, 3.999, 4.001, 'width at 1 m above the floor'); within(wide.widthMeters.min, 3.999, 4.001, 'min'); within(wide.widthMeters.max, 3.999, 4.001, 'max');
    const narrow = gullyWidthMeasure(grid, heights, area, { include: () => true, areaMinM2: 10000, areaMaxM2: 50000, bankMeters: .5, maxSamples: 10 });
    assert.equal(narrow.stride, 13); assert.equal(narrow.visited, 10); within(narrow.widthMeters.median, 1.999, 2.001, 'width at 0.5 m');
    const bounded = gullyWidthMeasure(grid, heights, area, { include: () => true, areaMinM2: 10000, areaMaxM2: 50000, bankMeters: 20 });
    assert.equal(bounded.measured, 0); assert.equal(bounded.unbounded, 121); assert.equal(bounded.widthMeters, null); assert.equal(bounded.needles, 0);
    // a 5 m lump on one floor sample is a needle: skipped and counted, the other floors measure as before
    const lumpy = Float32Array.from(heights);
    lumpy[60 * grid.columns + 60] += 5;
    const skipped = gullyWidthMeasure(grid, lumpy, area, { include: () => true, areaMinM2: 10000, areaMaxM2: 50000, bankMeters: 1 });
    assert.equal(skipped.needles, 1); assert.equal(skipped.candidates, 120); assert.equal(skipped.measured, 120); within(skipped.widthMeters.max, 3.999, 4.001, 'the lump does not widen its neighbours');
    assert.equal(gullyWidthMeasure(grid, heights, area, { include: i => i % grid.columns !== 60, areaMinM2: 10000, areaMaxM2: 50000 }).candidates, 0);
    const deepest = deepestIncisionPoint(grid, heights, area, { include: () => true, areaMinM2: 10000, areaMaxM2: 50000, ridgeWindowMeters: 60, marginMeters: 5 });
    assert.equal(deepest.x, 30); assert.equal(deepest.areaM2, 20000); within(deepest.incisionMeters, 22.4, 22.6, 'incision below the 60 m ridge window (15 m across + 7.5 m up the floor)');
    assert.equal(deepestIncisionPoint(grid, heights, area, { include: () => true, areaMinM2: 10000, areaMaxM2: 50000, marginMeters: 80 }), null);
    // a plane draining south: the first interior row receives nothing (the edge row is an outlet) and the area grows down the slope
    const plane = gridOf(21, 21, 1), memory = new TerrainFieldMemory(64 << 20), routed = contributingAreaRaster(plane, field(plane, (x, z) => .1 * z), 0, memory);
    assert.equal(routed.length, 441); assert.equal(routed[1 * 21 + 10], 1); assert.ok(routed[15 * 21 + 10] > routed[5 * 21 + 10] && routed[5 * 21 + 10] > routed[1 * 21 + 10]);
    assert.equal(memory.bytes, 0, 'the routing arrays are released');
});

test('Resolution study: ridge points, fixed windows, window extraction and the window hillshade work on a two-hill grid', () => {
    const grid = gridOf(101, 101, 2), heights = field(grid, (x, z) => 20 * Math.exp(-((x - 60) ** 2 + (z - 60) ** 2) / 400) + 12 * Math.exp(-((x - 150) ** 2 + (z - 140) ** 2) / 300));
    const points = selectRidgePoints(grid, heights, { include: () => true, count: 6, separationMeters: 50, localWindowMeters: 30, reliefWindowMeters: 100 });
    assert.deepEqual(points.map(point => [point.id, point.x, point.z]), [['R1', 60, 60], ['R2', 150, 140]]);
    within(points[0].reliefMeters, 19, 20.01, 'relief of the big hill'); assert.ok(points[0].height > points[1].height);
    // a one-sample spike outranks both hills by relief but is no ridge: the prominence limit keeps it out, and the needle statistics count it
    const spiked = Float32Array.from(heights);
    spiked[(100 - 10) * 101 + 90] += 30;
    assert.deepEqual(selectRidgePoints(grid, spiked, { include: () => true, count: 6, separationMeters: 50 }).map(point => [point.x, point.z]), [[60, 60], [150, 140]]);
    assert.equal(selectRidgePoints(grid, spiked, { include: () => true, count: 1, separationMeters: 50, maxProminenceMeters: 40 })[0].x, 180, 'a looser prominence limit admits the spike');
    const needles = needleStatistics(grid, spiked, 2);
    assert.equal(needles.count, 1); within(needles.maxProminenceMeters, 29, 31, 'spike prominence'); assert.deepEqual([needles.maxAt.x, needles.maxAt.z], [180, 20]); assert.equal(needles.perSquareKilometer, 1 / .04);
    assert.equal(needleStatistics(grid, heights, 2).count, 0, 'smooth hills have no needles');
    assert.equal(selectRidgePoints(grid, heights, { include: () => true, count: 1, separationMeters: 50 }).length, 1);
    assert.equal(selectRidgePoints(grid, heights, { include: () => true, count: 6, separationMeters: 500 }).length, 1, 'the separation keeps one point');
    const window = fixedWindow(grid, 61, 59, 10, 'hill');
    assert.equal(window.id, 'hill'); assert.equal(window.sizeMeters, 20); assert.equal(window.maxX - window.minX, 20); assert.equal(window.maxZ - window.minZ, 20);
    assert.equal(window.minX % 2, 0); within(window.centerX, 59, 63, 'center x'); within(window.centerZ, 57, 61, 'center z'); assert.deepEqual(window.requested, { centerX: 61, centerZ: 59 });
    const corner = fixedWindow(grid, 0, 0, 10);
    assert.equal(corner.minX, 0); assert.equal(corner.minZ, 0); assert.equal(corner.maxX, 20);
    assert.throws(() => fixedWindow(grid, 61, 59, 9), /even interval count/);
    const inner = extractGridWindow(grid, heights, window);
    assert.equal(inner.grid.columns, 11); assert.equal(inner.grid.rows, 11); assert.equal(inner.grid.minX, window.minX); assert.equal(inner.grid.maxZ, window.maxZ); assert.equal(inner.values.length, 121);
    assert.equal(inner.values[5 * 11 + 5], heights[((grid.maxZ - window.centerZ) / 2) * grid.columns + window.centerX / 2]);
    const haloed = extractGridWindow(grid, heights, window, { halo: 1 });
    assert.equal(haloed.grid.columns, 13); assert.deepEqual(haloed.halo, { west: 1, north: 1, east: 1, south: 1 }); assert.equal(haloed.values[1 * 13 + 1], inner.values[0]);
    assert.deepEqual(extractGridWindow(grid, heights, corner, { halo: 1 }).halo, { west: 0, north: 1, east: 1, south: 0 }, 'the window at the south-west corner has no halo on its south and west sides');
    assert.throws(() => extractGridWindow(grid, heights, { minX: 1, maxX: 21, minZ: 0, maxZ: 20 }), /not on a native vertex/);
    const image = renderHillshadeWindow(grid, heights, { window, size: 64, seaLevel: 0 }), again = renderHillshadeWindow(grid, heights, { window, size: 64, seaLevel: 0 });
    assert.equal(image.width, 64); assert.equal(image.height, 64); assert.equal(image.channels, 3); assert.ok(Buffer.from(image.data).equals(Buffer.from(again.data)), 'deterministic');
    assert.ok(image.data.some((value, i) => i % 3 === 0 && value > 0), 'the lit side is shaded');
});
