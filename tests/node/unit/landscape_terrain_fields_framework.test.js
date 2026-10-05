// Verifies the terrain-field bake is an explicit Node-only leaf of the landscape domain with scoped options and a distinct receipt claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planBakes } from '../../../tools/baking/Graph.mjs';
import { parseBakeOptions, resolveBakeOptions } from '../../../tools/baking/Options.mjs';
import { bakeJobs } from '../../../tools/baking/registry.mjs';

test('Terrain fields: the registered leaf runs alone, needs no machine executable and stays out of production and import defaults', () => {
    const plan = planBakes(bakeJobs, 'landscape/terrain-fields');
    assert.deepEqual(plan.map(job => job.id), ['landscape/terrain-fields']);
    assert.deepEqual(plan[0].configurationPaths, []);
    assert.equal(plan[0].blender, undefined);
    assert.deepEqual(plan[0].outputs, ['tests/artifacts/screens/landscape/ai577/d5/terrain-fields-validation.json']);
    const defaults = resolveBakeOptions(plan, parseBakeOptions([])).get('landscape/terrain-fields');
    assert.deepEqual(defaults, { directory: 'assets/public/landscape/coastal-city', recipe: 'tools/bake_landscape/terrain_fields/recipe-v1.json', 'verify-determinism': true });
    const scoped = resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/terrain-fields:imports=gaea/imports.json', '--set', 'landscape/terrain-fields:verify-determinism=false']));
    assert.equal(scoped.get('landscape/terrain-fields').imports, 'gaea/imports.json');
    assert.equal(scoped.get('landscape/terrain-fields')['verify-determinism'], false);
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/terrain-fields:source=original.zip'])), /No selected job consumes/);
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/terrain-fields:verify-determinism=maybe'])), /true or false/);
    assert.ok(planBakes(bakeJobs, 'all').every(job => !job.id.startsWith('landscape')));
    assert.ok(planBakes(bakeJobs, 'landscape').every(job => job.id !== 'landscape/terrain-fields'));
});
