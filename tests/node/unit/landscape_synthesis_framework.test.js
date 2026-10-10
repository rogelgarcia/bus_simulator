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
    const parent = planBakes(bakeJobs, 'landscape/synthesis');
    assert.deepEqual(parent.map(job => job.id), ['landscape/synthesis/relief-study', 'landscape/synthesis/fixture', 'landscape/synthesis/resolution-study', 'landscape/synthesis']);
    assert.ok(planBakes(bakeJobs, 'all').every(job => !job.id.startsWith('landscape')));
    assert.ok(planBakes(bakeJobs, 'landscape').every(job => !job.id.startsWith('landscape/synthesis')));
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
