// Runs the public authoring CLI against an isolated saved landscape through query, data operations, and revert.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cli = path.join(root, 'tools/landscape_authoring/run.mjs');

test('Landscape authoring CLI binds and applies saved data operations to the queried revision, then reverts', async () => {
    const evidence = path.join(root, 'tests/artifacts/screens/landscape/ai576/d2/authoring-tests');
    await mkdir(evidence, { recursive: true });
    const directory = await mkdtemp(path.join(evidence, 'cli-'));
    const fixture = createLandscapeModelFixture({ maxLevel: 2, heightAt: () => 0, coverAt: () => 2 });
    for (const [url, bytes] of fixture.resources) {
        const file = path.join(directory, url); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes);
    }
    function run(args, expected = 0) {
        const result = spawnSync(process.execPath, [cli, ...args, '--directory', directory], { cwd: root, encoding: 'utf8' });
        assert.equal(result.status, expected, result.stdout + result.stderr);
        return expected ? result.stderr : JSON.parse(result.stdout);
    }
    const state = run(['state']), contextFile = path.join(directory, 'selection.json'), batchFile = path.join(directory, 'batch.json');
    const context = run(['query', '--x', '0', '--z', '34', '--radius', '6', '--selection-id', 'cli-area', '--expected-revision', state.revision, '--output', contextFile]);
    assert.equal(context.editingReady, true);
    const input = run(['bind', '--template', 'tools/landscape_authoring/examples/raise_and_sand.template.json', '--context', contextFile, '--batch-id', 'cli-raise-sand', '--output', batchFile]);
    assert.equal(input.expectedRevision, state.revision); assert.ok((await readFile(batchFile, 'utf8')).includes('deltaMeters'));
    const applied = run(['apply', '--batch', batchFile]); assert.notEqual(applied.revision, state.revision);
    const exact = run(['query', '--x', '0', '--z', '34', '--selection-id', 'after-cli', '--expected-revision', applied.revision]);
    assert.equal(exact.position.y, 2); assert.equal(exact.sample.soilId, 'sand');
    assert.match(run(['apply', '--batch', batchFile], 1), /duplicate/);
    const reverted = run(['revert', '--expected-revision', applied.revision]); assert.equal(reverted.canRevert, false);
    assert.equal(run(['state']).revision, reverted.revision);
    assert.match(run(['query', '--x', '0', '--z', '34', '--selection-id', 'stale', '--expected-revision', applied.revision], 1), /stale/);
});
