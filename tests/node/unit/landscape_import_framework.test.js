// Verifies the coastal leaf stays CPU-only, explicit, and covered by shared bake code identities.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { REPO_ROOT } from '../../../tools/baking/Configuration.mjs';
import { executeBakes } from '../../../tools/baking/Runner.mjs';
import { planBakes } from '../../../tools/baking/Graph.mjs';
import { parseBakeOptions, resolveBakeOptions } from '../../../tools/baking/Options.mjs';
import { bakeJobs } from '../../../tools/baking/registry.mjs';

test('Coastal import scoped settings select one CPU-only job and never enter default production bakes', async () => {
    const plan = planBakes(bakeJobs, 'landscape/coastal-import');
    assert.deepEqual(plan.map(job => job.id), ['landscape/coastal-import']);
    assert.deepEqual(plan[0].configurationPaths, []); assert.equal(plan[0].blender, undefined);
    const options = resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape:source=source path/coastal.zip']));
    assert.equal(options.get('landscape/coastal-import').source, 'source path/coastal.zip');
    assert.ok(planBakes(bakeJobs, 'all').every(job => !job.id.startsWith('landscape')));
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--samples', '64'])), /unsupported/);
    await assert.rejects(plan[0].inputs({ options: {}, root: REPO_ROOT }), /requires --set/);
});

test('Landscape code changes invalidate shared bake checkpoints before reuse', async () => {
    const evidence = path.join(REPO_ROOT, 'tests/artifacts/screens/landscape/ai576/d1/import-tests');
    await mkdir(evidence, { recursive: true });
    const root = await mkdtemp(path.join(evidence, 'framework-')), domain = path.join(root, 'tools/bake_landscape');
    await mkdir(domain, { recursive: true });
    const source = path.join(domain, 'recipe.mjs'); await writeFile(source, 'export const revision = 1;\n');
    let calls = 0;
    const job = { id: 'landscape/fixture', codePaths: ['tools/bake_landscape'], async run(ctx) {
        calls++; const file = path.join(ctx.stage, 'payload.bin'); await writeFile(file, String(calls));
        return { state: 'validated', files: [file] };
    } };
    const context = { root, log: { line() {}, progress() {} }, signal: new AbortController().signal };
    const settings = new Map([[job.id, {}]]);
    await executeBakes([job], settings, context); await executeBakes([job], settings, context);
    assert.equal(calls, 1);
    await writeFile(source, 'export const revision = 2;\n');
    await executeBakes([job], settings, context); assert.equal(calls, 2);
});
