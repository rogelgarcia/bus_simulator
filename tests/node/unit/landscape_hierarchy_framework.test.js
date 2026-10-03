// Verifies current-source maintenance is an explicit bounded CPU bake independent from import and production branches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planBakes } from '../../../tools/baking/Graph.mjs';
import { parseBakeOptions, resolveBakeOptions } from '../../../tools/baking/Options.mjs';
import { bakeJobs } from '../../../tools/baking/registry.mjs';

test('Hierarchy maintenance selects only current-source preparation and never schedules original import or unrelated bakes', () => {
    const plan = planBakes(bakeJobs, 'landscape/hierarchy');
    assert.deepEqual(plan.map(job => job.id), ['landscape/hierarchy']);
    assert.deepEqual(plan[0].configurationPaths, []);
    assert.equal(plan[0].blender, undefined); assert.equal(plan[0].always, true);
    const settings = resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/hierarchy:directory=saved edited landscape']));
    assert.equal(settings.get('landscape/hierarchy').directory, 'saved edited landscape');
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/hierarchy:source=original.zip'])), /No selected job consumes/);
    assert.ok(planBakes(bakeJobs, 'all').every(job => !job.id.startsWith('landscape')));
    assert.ok(planBakes(bakeJobs, 'landscape').every(job => job.id !== 'landscape/hierarchy'));
});
