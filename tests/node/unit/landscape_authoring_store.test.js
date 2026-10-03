// Exercises persistent bounded authoring, exact queries, atomic failure, immutable revisions, and replay-safe revert.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { createLandscapeAuthoringStore } from '../../../tools/landscape_authoring/LandscapeAuthoringStore.mjs';
import { acquireAuthoringLock } from '../../../tools/landscape_authoring/AuthoringFiles.mjs';
import { bindLandscapeBatchTemplate } from '../../../tools/landscape_authoring/BatchTemplate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = path.join(root, 'tests/artifacts/screens/landscape/ai576/d2/authoring-tests');
await mkdir(evidence, { recursive: true });

async function fixture({ manifestOnly = false } = {}) {
    const source = createLandscapeModelFixture({ maxLevel: 2, heightAt: () => 0, coverAt: () => 2 });
    const directory = await mkdtemp(path.join(evidence, 'fixture-'));
    for (const [url, bytes] of source.resources) {
        if (manifestOnly && url !== 'manifest.json') continue;
        const file = path.join(directory, url); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes);
    }
    return { ...source, directory, store: createLandscapeAuthoringStore({ directory }) };
}

const selection = revision => ({ x: 0, z: 34, radius: 3, selectionId: 'cross-boundary-selection', expectedRevision: revision });
const region = { type: 'circle', center: { x: 0, z: 34 }, radius: 3 };
function batch(manifest, id = 'raise-and-sand') {
    return { format: 'landscape-edit-batch', schemaVersion: 1, id, landscapeId: manifest.id, expectedRevision: manifest.revision,
        operations: [
            { id: `${id}/raise`, type: 'raise', region, falloff: { type: 'linear', distance: 1 }, deltaMeters: 2 },
            { id: `${id}/sand`, type: 'assign-soil', region, falloff: { type: 'none' }, soilId: 'sand' }
        ] };
}
const current = async directory => JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));

test('Authoring store queries exact native selections with bounded readiness and stale/outside rejection', async () => {
    const value = await fixture(), before = await readFile(path.join(value.directory, 'manifest.json'));
    const context = await value.store.query(selection(value.manifest.revision));
    assert.equal(context.provisional, false); assert.equal(context.editingReady, true);
    assert.equal(context.sample.accuracy, 'authoritative'); assert.equal(context.position.y, 0);
    assert.equal(context.sample.soilId, 'loam'); assert.equal(context.acquisition.chunkIds.length, 4);
    assert.equal(context.acquisition.releasedAfterQuery, true);
    assert.equal(context.acquisition.decodedBytes, 4 * 25 * 5);
    await assert.rejects(value.store.query(selection('stale-revision')), /stale/);
    await assert.rejects(value.store.query({ ...selection(value.manifest.revision), x: 1000 }), /outside/);
    assert.deepEqual(await readFile(path.join(value.directory, 'manifest.json')), before);
});

test('Authoring store admits one native working set and rejects overlapping requests without a queue', async () => {
    const value = await fixture();
    const active = value.store.query(selection(value.manifest.revision));
    await assert.rejects(value.store.query(selection(value.manifest.revision)), /Working-set budget busy/);
    await assert.rejects(value.store.apply(batch(value.manifest)), /Working-set budget busy/);
    assert.equal((await active).editingReady, true);
    assert.equal((await value.store.query(selection(value.manifest.revision))).editingReady, true);
});

test('Authoring store caps query acquisition but large edits require their actual native files', async () => {
    const value = await fixture({ manifestOnly: true });
    await assert.rejects(value.store.query({ ...selection(value.manifest.revision), x: 8, z: 26, radius: 12 }), /native chunks; D2 limit is 4/);
    const large = batch(value.manifest); large.operations[0].region = { type: 'rectangle', ...value.manifest.bounds };
    await assert.rejects(value.store.apply(large), /ENOENT|unavailable/);
    assert.equal((await current(value.directory)).revision, value.manifest.revision);
});

test('Authoring store publishes cross-border height/soil batches, reloads, and reverts without replaying IDs', async () => {
    const value = await fixture(), original = value.manifest, input = batch(original);
    const savedOriginals = new Map();
    for (const [url, bytes] of value.resources) if (url !== 'manifest.json') savedOriginals.set(url, Buffer.from(bytes));
    const result = await value.store.apply(input), edited = await current(value.directory);
    assert.equal(result.status, 'applied'); assert.equal(result.revision, edited.revision); assert.notEqual(edited.revision, original.revision);
    assert.equal(edited.operations.length, 2); assert.equal(edited.soil.overrides.length, 1);
    assert.deepEqual(edited.editHistory.batchIds, [input.id]); assert.equal(edited.editHistory.lastBatchId, input.id);
    assert.match(edited.editHistory.previousManifestUrl, /^manifest\.[a-f0-9]{64}\.json$/);
    assert.deepEqual(edited.chunks.find(chunk => chunk.id === 'l2/c3/r3'), original.chunks.find(chunk => chunk.id === 'l2/c3/r3'));
    for (const chunk of edited.chunks) assert.deepEqual(chunk.channels.landCover, original.chunks.find(item => item.id === chunk.id).channels.landCover);
    const reopened = createLandscapeAuthoringStore({ directory: value.directory });
    const context = await reopened.query(selection(edited.revision));
    assert.equal(context.position.y, 2); assert.equal(context.sample.soilId, 'sand'); assert.equal(context.sample.landCoverId, 2);
    assert.equal((await reopened.readState()).canRevert, true);
    for (const [url, bytes] of savedOriginals) assert.deepEqual(await readFile(path.join(value.directory, url)), bytes);
    const undo = await reopened.revert({ expectedRevision: edited.revision, batchId: input.id }), reverted = await current(value.directory);
    assert.equal(undo.status, 'reverted'); assert.equal(undo.revision, reverted.revision);
    assert.deepEqual(reverted.chunks, original.chunks); assert.deepEqual(reverted.operations, []); assert.deepEqual(reverted.soil.overrides, []);
    assert.deepEqual(reverted.editHistory.batchIds, [input.id]); assert.equal((await reopened.readState()).canRevert, false);
    const restoredContext = await reopened.query(selection(reverted.revision));
    assert.equal(restoredContext.position.y, 0); assert.equal(restoredContext.sample.soilId, 'loam');
    await assert.rejects(reopened.apply({ ...input, expectedRevision: reverted.revision }), /duplicate/);
    await assert.rejects(reopened.revert({ expectedRevision: reverted.revision }), /No last applied batch/);
    assert.ok((await readdir(value.directory)).filter(name => /^manifest\.[a-f0-9]{64}\.json$/.test(name)).length >= 3);
});

test('Invalid, stale and corrupted native edits leave current saved data and history unchanged', async () => {
    const value = await fixture(), before = await readFile(path.join(value.directory, 'manifest.json'));
    const invalid = batch(value.manifest); invalid.operations[1].soilId = 'invented-soil';
    await assert.rejects(value.store.apply(invalid), /unknown assigned soil/);
    await assert.rejects(value.store.apply({ ...batch(value.manifest), expectedRevision: 'old' }), /stale/);
    const channel = value.manifest.chunks.find(chunk => chunk.id === 'l2/c0/r0').channels.height;
    const file = path.join(value.directory, channel.url), bytes = await readFile(file); bytes[0] ^= 1; await writeFile(file, bytes);
    await assert.rejects(value.store.apply(batch(value.manifest)), /hash mismatch|unavailable/);
    assert.deepEqual(await readFile(path.join(value.directory, 'manifest.json')), before);
    assert.ok(!(await readdir(value.directory)).includes('authoring.lock'));
});

test('Revert authenticates its saved snapshot and restored payloads before switching current data', async () => {
    const value = await fixture(); await value.store.apply(batch(value.manifest));
    const edited = await current(value.directory), before = await readFile(path.join(value.directory, 'manifest.json'));
    const oldChannel = value.manifest.chunks.find(chunk => chunk.id === 'l2/c0/r0').channels.height;
    const file = path.join(value.directory, oldChannel.url), bytes = await readFile(file); bytes[0] ^= 1; await writeFile(file, bytes);
    await assert.rejects(value.store.revert({ expectedRevision: edited.revision }), /hash mismatch/);
    assert.deepEqual(await readFile(path.join(value.directory, 'manifest.json')), before);
    await assert.rejects(value.store.revert({ expectedRevision: value.manifest.revision }), /stale/);
});

test('Authoring transactions reject live lock owners and recover only a known dead process', async () => {
    const value = await fixture(), release = await acquireAuthoringLock(value.directory);
    try { await assert.rejects(value.store.apply(batch(value.manifest)), /Another authoring transaction/); }
    finally { await release(); }
    const exited = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' }); assert.equal(exited.status, 0);
    const token = randomUUID(); await writeFile(path.join(value.directory, 'authoring.lock'), JSON.stringify({ pid: exited.pid, token }));
    await value.store.apply(batch(value.manifest));
    assert.ok((await readdir(value.directory)).includes(`authoring-interrupted-${token}.json`));
    assert.ok(!(await readdir(value.directory)).includes('authoring.lock'));
});

test('Example template binds fresh exact area context and cannot promote a provisional point', async () => {
    const value = await fixture();
    const template = JSON.parse(await readFile(path.join(root, 'tools/landscape_authoring/examples/raise_and_sand.template.json'), 'utf8'));
    const context = await value.store.query({ ...selection(value.manifest.revision), radius: 6 });
    const input = bindLandscapeBatchTemplate(template, context, { batchId: 'example-once' });
    assert.equal(input.expectedRevision, value.manifest.revision); assert.equal(input.landscapeId, value.manifest.id);
    assert.deepEqual(input.operations[0].region, context.region); assert.equal(input.operations[0].id, 'example-once/raise');
    await value.store.apply(input);
    assert.throws(() => bindLandscapeBatchTemplate(template, { ...context, provisional: true }, { batchId: 'another' }), /exact bounded-area/);
    assert.throws(() => bindLandscapeBatchTemplate(template, { ...context, region: { type: 'point', x: 0, z: 34 } }, { batchId: 'point' }), /exact bounded-area/);
});
