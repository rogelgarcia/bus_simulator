// Verifies the terrain synthesis leaves are explicit Node-only members of the landscape domain with scoped options, outside production and import defaults.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { planBakes } from '../../../tools/baking/Graph.mjs';
import { parseBakeOptions, resolveBakeOptions } from '../../../tools/baking/Options.mjs';
import { bakeJobs } from '../../../tools/baking/registry.mjs';
import { RELIEF_STUDY_POSES, RELIEF_STUDY_RECIPES } from '../../../tools/bake_landscape/terrain_synthesis/relief_study/ReliefStudyJob.mjs';
import { validateLandscapeSynthesisRecipe } from '../../../src/app/landscape/index.js';

test('Terrain synthesis: the relief-study leaf runs alone under landscape/synthesis, needs no executable and stays out of production and import defaults', () => {
    const plan = planBakes(bakeJobs, 'landscape/synthesis/relief-study');
    assert.deepEqual(plan.map(job => job.id), ['landscape/synthesis/relief-study']);
    assert.deepEqual(plan[0].configurationPaths, []);
    assert.equal(plan[0].blender, undefined);
    assert.deepEqual(plan[0].outputs, ['tests/artifacts/screens/landscape/ai596/d1/relief-study.json']);
    const defaults = resolveBakeOptions(plan, parseBakeOptions([])).get('landscape/synthesis/relief-study');
    assert.equal(defaults.directory, 'assets/public/landscape/coastal-city');
    assert.equal(defaults.recipes, RELIEF_STUDY_RECIPES.join(','));
    assert.equal(defaults.poses, RELIEF_STUDY_POSES);
    assert.equal(defaults['landscape-root'], 'assets/public/landscape');
    assert.equal(defaults.fields, 'bake');
    const scoped = resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/synthesis/relief-study:recipes=a.json,b.json', '--set', 'landscape/synthesis/relief-study:fields=none']));
    assert.equal(scoped.get('landscape/synthesis/relief-study').recipes, 'a.json,b.json');
    assert.equal(scoped.get('landscape/synthesis/relief-study').fields, 'none');
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/synthesis/relief-study:fields=maybe'])), /bake or none/);
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/synthesis/relief-study:source=original.zip'])), /No selected job consumes/);
    const fixture = planBakes(bakeJobs, 'landscape/synthesis/fixture');
    assert.deepEqual(fixture.map(job => job.id), ['landscape/synthesis/fixture']);
    assert.deepEqual(fixture[0].outputs, ['tests/artifacts/screens/landscape/ai596/d2/fixture/fixture-gate.json']);
    assert.equal(fixture[0].always, true);
    assert.equal(resolveBakeOptions(fixture, parseBakeOptions([])).get('landscape/synthesis/fixture').recipe, 'tools/bake_landscape/terrain_synthesis/fixture/recipes/plateau-road-shoreline.json');
    const resolution = planBakes(bakeJobs, 'landscape/synthesis/resolution-study');
    assert.deepEqual(resolution.map(job => job.id), ['landscape/synthesis/resolution-study']);
    assert.deepEqual(resolution[0].outputs, ['tests/artifacts/screens/landscape/ai596/d3/resolution/resolution-study.json']);
    assert.equal(resolution[0].always, true); assert.deepEqual(resolution[0].configurationPaths, []);
    assert.equal(resolveBakeOptions(resolution, parseBakeOptions([])).get('landscape/synthesis/resolution-study').fields, 'none');
    const coastal = planBakes(bakeJobs, 'landscape/synthesis/coastal-v3');
    assert.deepEqual(coastal.map(job => job.id), ['landscape/synthesis/coastal-v3']);
    assert.deepEqual(coastal[0].outputs, ['tests/artifacts/screens/landscape/ai596/d4/v3/coastal-v3.json']);
    assert.equal(coastal[0].always, true); assert.deepEqual(coastal[0].configurationPaths, []); assert.equal(coastal[0].blender, undefined);
    const coastalDefaults = resolveBakeOptions(coastal, parseBakeOptions([])).get('landscape/synthesis/coastal-v3');
    assert.deepEqual([coastalDefaults.recipe, coastalDefaults['fields-recipe'], coastalDefaults.working, coastalDefaults['landscape-root'], coastalDefaults.fields, coastalDefaults.geology, coastalDefaults['replay-edits'], coastalDefaults.poses],
        ['tools/bake_landscape/terrain_synthesis/recipes/coastal-v3.json', 'tools/bake_landscape/terrain_synthesis/recipes/terrain-fields-coastal-v3.json', 'native', 'assets/public/landscape', 'bake', 'publish', 'none', 'tools/landscape_review/poses/natural-world-v1.json']);
    const coastalScoped = resolveBakeOptions(coastal, parseBakeOptions(['--set', 'landscape/synthesis/coastal-v3:working=1953', '--set', 'landscape/synthesis/coastal-v3:fields=none', '--set', 'landscape/synthesis/coastal-v3:geology=none', '--set', 'landscape/synthesis/coastal-v3:replay-edits=assets/public/landscape/coastal-city-v3'])).get('landscape/synthesis/coastal-v3');
    assert.deepEqual([coastalScoped.working, coastalScoped.fields, coastalScoped.geology, coastalScoped['replay-edits']], ['1953', 'none', 'none', 'assets/public/landscape/coastal-city-v3']);
    assert.throws(() => resolveBakeOptions(coastal, parseBakeOptions(['--set', 'landscape/synthesis/coastal-v3:working=3906'])), /working must be native or 1953/);
    assert.throws(() => resolveBakeOptions(coastal, parseBakeOptions(['--set', 'landscape/synthesis/coastal-v3:geology=maybe'])), /geology must be publish or none/);
    const parent = planBakes(bakeJobs, 'landscape/synthesis');
    assert.deepEqual(parent.map(job => job.id), ['landscape/synthesis/relief-study', 'landscape/synthesis/fixture', 'landscape/synthesis/resolution-study', 'landscape/synthesis/coastal-v3', 'landscape/synthesis']);
    assert.ok(planBakes(bakeJobs, 'all').every(job => !job.id.startsWith('landscape')));
    assert.ok(planBakes(bakeJobs, 'landscape').every(job => !job.id.startsWith('landscape/synthesis')));
});

test('Terrain synthesis: the coastal-v3 recipe binds the v2 landscape at its revision onto the 4097² grid through the D4 operator chain and derives the cover', async () => {
    const recipe = validateLandscapeSynthesisRecipe(JSON.parse(await readFile(path.resolve('tools/bake_landscape/terrain_synthesis/recipes/coastal-v3.json'), 'utf8')));
    assert.equal(recipe.id, 'ai596-coastal-v3'); assert.equal(recipe.grid.columns, 4097); assert.equal(recipe.grid.spacingX, .9765625); assert.equal(recipe.grid.maxLevel, 4); assert.equal(recipe.working, null);
    assert.deepEqual(recipe.inputs.landscape, { directory: 'assets/public/landscape/coastal-city', expectedRevision: 'materials-bfcf20f7e27aa79db4d9983b' });
    assert.equal(recipe.outputs.coverPolicy, 'derive'); assert.equal(recipe.outputs.heightCap, 90);
    const ops = recipe.operators.filter(entry => entry.enabled).map(entry => entry.op);
    for (const required of ['import-heights', 'plan-inputs', 'landform-plateau', 'landform-hills', 'strata', 'fluvial-erosion', 'hydraulic-erosion', 'thermal-weathering', 'sediment-deposit', 'terraces', 'coastal-exposure', 'coastal-bluff', 'coastal-beach', 'coastal-foredune', 'coastal-nearshore', 'coastal-reef',
        'constrain-districts', 'constrain-points', 'constrain-roads', 'constrain-shoreline', 'constrain-runway', 'height-cap', 'export-map', 'geology-channels', 'derive-land-cover', 'resample']) assert.ok(ops.includes(required), `${required} is in the recipe`);
    assert.ok(ops.indexOf('constrain-points') < ops.lastIndexOf('constrain-districts') && ops.indexOf('constrain-points') < ops.indexOf('constrain-roads'), 'the corridor descent precedes the plaza and the road fit (D2 lesson)');
    assert.ok(ops.indexOf('geology-channels') < ops.indexOf('derive-land-cover') && ops[ops.length - 1] === 'resample');
    const beach = recipe.operators.find(entry => entry.op === 'coastal-beach').params, fluvial = recipe.operators.find(entry => entry.op === 'fluvial-erosion').params, sediment = recipe.operators.find(entry => entry.op === 'sediment-deposit').params;
    assert.ok(beach.deanA >= .1 && beach.deanA <= .14 && beach.bermHeightMeters >= 1.5 && beach.bermHeightMeters <= 2 && beach.deanDepthMeters === 8 && beach.offshoreMode === 'replace');
    assert.equal(fluvial.retainRate, .003); assert.equal(fluvial.iterations, 150); assert.equal(sediment.supplyFraction, .1);
    assert.equal(recipe.operators.find(entry => entry.op === 'coastal-bluff').params.talusVolumeFraction, .04, 'the bluff talus wedge is 4% of the cut (10% buried the lower third of a 12 m face)');
    // every plan district gets a designed edge: the plateau an escarpment, the low districts a 30 degree embankment blended over 5 m; never a feather
    const edges = recipe.operators.filter(entry => entry.enabled && entry.op === 'constrain-districts');
    assert.ok(edges.every(entry => entry.params.profile !== 'feather'), 'no district is feathered');
    assert.ok(edges.filter(entry => entry.params.profile === 'embankment').every(entry => entry.params.slopeDegrees === 30 && entry.params.combine === 'blend' && entry.params.blendMeters === 5));
    assert.deepEqual([...new Set(edges.flatMap(entry => entry.params.districtIds))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(edges.find(entry => entry.params.districtIds.includes(4)).params.profile, 'escarpment');
    const fields = JSON.parse(await readFile(path.resolve('tools/bake_landscape/terrain_synthesis/recipes/terrain-fields-coastal-v3.json'), 'utf8')), base = JSON.parse(await readFile(path.resolve('tools/bake_landscape/terrain_fields/recipe-v1.json'), 'utf8'));
    assert.equal(fields.workingLimitBytes, 1879048192, 'the v3 fields recipe raises the working limit for 4097² (about 1.5 GB of tracked arrays)');
    assert.deepEqual({ ...fields, workingLimitBytes: null }, { ...base, workingLimitBytes: null }, 'everything else equals the v1 fields recipe');
});

test('Terrain synthesis: the shipped relief variant recipes validate, differ only where the study says and bind the coastal grid', async () => {
    const recipes = [];
    for (const file of RELIEF_STUDY_RECIPES) recipes.push(validateLandscapeSynthesisRecipe(JSON.parse(await readFile(path.resolve(file), 'utf8'))));
    assert.deepEqual(recipes.map(recipe => recipe.id), ['ai596-relief-a-v2-sharpened', 'ai596-relief-b-raised-80', 'ai596-relief-c-dramatic-160']);
    for (const recipe of recipes) {
        assert.equal(recipe.grid.columns, 2049); assert.equal(recipe.grid.spacingX, 1.953125); assert.equal(recipe.working, null);
        assert.equal(recipe.inputs.landscape.directory, 'assets/public/landscape/coastal-city');
        assert.deepEqual(recipe.operators.map(operator => operator.op).filter(op => ['import-heights', 'plan-inputs', 'constrain-roads', 'constrain-shoreline', 'constrain-points', 'constrain-runway', 'height-cap', 'resample'].includes(op)).length, 8);
        assert.equal(recipe.outputs.heightCap, recipe.operators.find(operator => operator.op === 'height-cap').params.capMeters);
    }
    const highCity = recipes.map(recipe => recipe.operators.find(operator => operator.id === 'high-city').params.heightMeters);
    assert.deepEqual(highCity, [49, 80, 160]);
    assert.deepEqual(recipes.map(recipe => recipe.outputs.heightCap), [50, 90, 170]);
    assert.ok(new Set(recipes.map(recipe => recipe.seed)).size === 3, 'each variant has its own seed');
});
