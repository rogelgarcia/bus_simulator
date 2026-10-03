// Exercises report persistence boundaries, CLI output, and authenticated failures through real files.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { createLandscapeAuthoringStore } from '../../../tools/landscape_authoring/LandscapeAuthoringStore.mjs';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';

test('Landscape report store: read-only CLI/HTTP, single working set, hash-failure unknown, stale rejection', async () => {
    const evidence = path.resolve('tests/artifacts/screens/landscape/ai576/d6/report-tests');
    await mkdir(evidence, { recursive: true });
    const directory = await mkdtemp(path.join(evidence, 'fixture-')), fixture = createLandscapeModelFixture();
    for (const [url, bytes] of fixture.resources) {
        const file = path.join(directory, url); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes);
    }
    const before = await readFile(path.join(directory, 'manifest.json'));
    const request = { expectedRevision: fixture.manifest.revision, shape: { type: 'footprint', region: { type: 'rectangle', ...fixture.manifest.bounds } }, sampleSpacingMeters: 2 };
    const store = createLandscapeAuthoringStore({ directory }), active = store.report(request);
    await assert.rejects(store.report(request), /Working-set budget busy/);
    assert.equal((await active).status, 'ready');
    await assert.rejects(store.report({ ...request, expectedRevision: 'stale' }), /stale/);
    const input = path.join(directory, 'report-request.json'); await writeFile(input, JSON.stringify(request));
    const cli = spawnSync(process.execPath, ['tools/landscape_authoring/run.mjs', 'report', '--directory', directory, '--request', input], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr); assert.equal(JSON.parse(cli.stdout).status, 'ready');
    const channel = fixture.manifest.chunks.find(chunk => chunk.id === 'l1/c0/r0').channels.height;
    const bytes = await readFile(path.join(directory, channel.url)); bytes[0] ^= 1; await writeFile(path.join(directory, channel.url), bytes);
    const server = createLandscapeServer({ root: path.resolve('.'), landscapeDirectory: directory });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}/api/landscape/report`;
    try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
        assert.equal(response.status, 200);
        const report = await response.json(); assert.equal(report.status, 'partial'); assert.match(report.failures[0].reason, /hash mismatch/);
        const rejected = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://example.invalid' }, body: JSON.stringify(request) });
        assert.equal(rejected.status, 403);
        assert.deepEqual(await readFile(path.join(directory, 'manifest.json')), before);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
