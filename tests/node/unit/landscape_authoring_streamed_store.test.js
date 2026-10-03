// Verifies large persisted batches, constant working-set admission, and manifest-last failure/cancel behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { createLandscapeAuthoringStore } from '../../../tools/landscape_authoring/LandscapeAuthoringStore.mjs';
import { authoringHash } from '../../../tools/landscape_authoring/AuthoringFiles.mjs';
import { readLandscapeFileChunk } from '../../../tools/landscape_authoring/LandscapeFileIO.mjs';
import { bindLandscapeStateBatchTemplate } from '../../../tools/landscape_authoring/BatchTemplate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = path.join(root, 'tests/artifacts/screens/landscape/ai576/d5/authoring-tests');
await mkdir(evidence, { recursive: true });

async function fixture(maxLevel = 2) {
    const source = createLandscapeModelFixture({ maxLevel, heightAt: () => 0, coverAt: () => 2 });
    const directory = await mkdtemp(path.join(evidence, 'streamed-'));
    for (const [url, bytes] of source.resources) {
        const file = path.join(directory, url); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes);
    }
    return { ...source, directory, store: createLandscapeAuthoringStore({ directory }) };
}
const currentBytes = value => readFile(path.join(value.directory, 'manifest.json'));
const current = async value => JSON.parse((await currentBytes(value)).toString('utf8'));

function largeBatch(manifest, id = 'large-study') {
    const { minX, maxX, minZ, maxZ } = manifest.bounds, center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
    return { format: 'landscape-edit-batch', schemaVersion: 1, id, landscapeId: manifest.id, expectedRevision: manifest.revision,
        regions: [{ id: 'terrain-study-area', name: 'Terrain study area', region: { type: 'polygon',
            points: [{ x: minX, z: minZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }, { x: minX, z: maxZ }] } }],
        operations: [
            { id: `${id}/grade`, type: 'grade', regionId: 'terrain-study-area', falloff: { type: 'none' },
                start: { x: minX, z: center.z, heightMeters: -5 }, end: { x: maxX, z: center.z, heightMeters: 5 } },
            { id: `${id}/raise`, type: 'raise', region: { type: 'circle', center, radius: 6 }, falloff: { type: 'linear', distance: 2 }, deltaMeters: 2 },
            { id: `${id}/smooth`, type: 'smooth', regionId: 'terrain-study-area', falloff: { type: 'none' }, radiusMeters: 4, strength: 0.5 },
            { id: `${id}/soil`, type: 'assign-soil', regionId: 'terrain-study-area', falloff: { type: 'none' }, soilId: 'sand' }
        ] };
}

test('Large named polygon grade/smooth/soil batches stage before release and restore every saved level', async () => {
    const value = await fixture(), input = largeBatch(value.manifest), before = await currentBytes(value);
    const stages = [];
    const result = await value.store.apply(input, { onProgress: async event => {
        assert.equal(Object.isFrozen(event), true);
        if (event.type !== 'chunk-staged') return;
        const bytes = await readFile(path.join(value.directory, event.url));
        assert.equal(bytes.byteLength, event.byteLength); assert.equal(authoringHash(bytes), event.sha256);
        assert.deepEqual(await currentBytes(value), before); stages.push(event.chunkId);
    } });
    const edited = await current(value), summary = result.summary;
    assert.equal(summary.changedNativeIds.length, 16); assert.equal(summary.changedAncestorIds.length, 1);
    assert.ok(summary.heightDeltaRange.min < 0); assert.ok(summary.heightDeltaRange.max > 0);
    assert.ok(summary.changedHeightRange.after.min < summary.changedHeightRange.before.min);
    assert.ok(summary.workingBytes <= summary.workingByteLimit); assert.equal(summary.maxSimultaneousDecodedChunks, 2);
    assert.deepEqual(summary.regionIds, ['terrain-study-area']); assert.equal(summary.validation.seams, 24);
    assert.ok(stages.length > 16); assert.equal(summary.stagedChunks, stages.length);
    assert.ok(edited.capabilities.includes('terrain-editing-v2')); assert.deepEqual(edited.regions, input.regions);
    assert.equal(edited.operations[0].regionId, 'terrain-study-area'); assert.deepEqual(edited.operations[0].region, input.regions[0].region);
    for (const chunk of edited.chunks) assert.deepEqual(chunk.channels.landCover, value.manifest.chunks.find(item => item.id === chunk.id).channels.landCover);
    for (const [url, bytes] of value.resources) if (url !== 'manifest.json') assert.deepEqual(await readFile(path.join(value.directory, url)), Buffer.from(bytes));
    const reopened = createLandscapeAuthoringStore({ directory: value.directory });
    assert.deepEqual((await reopened.readState()).regions, input.regions);
    const point = await reopened.query({ x: 8, z: 26, selectionId: 'large-edit-point', expectedRevision: edited.revision });
    assert.equal(point.sample.soilId, 'sand'); assert.equal(point.sample.landCoverId, 2);
    await reopened.revert({ expectedRevision: edited.revision });
    const restored = await current(value);
    assert.deepEqual(restored.chunks, value.manifest.chunks); assert.deepEqual(restored.regions, []);
    assert.deepEqual(restored.operations, []); assert.deepEqual(restored.soil.overrides, []);
    assert.deepEqual(restored.editHistory.batchIds, [input.id]);
    await assert.rejects(reopened.apply({ ...input, expectedRevision: restored.revision }), /duplicate/);
});

test('Sixteen and sixty-four native edits retain an identical working-array cap', async () => {
    const summaries = [];
    for (const level of [2, 3]) {
        const value = await fixture(level), result = await value.store.apply(largeBatch(value.manifest));
        assert.equal(result.summary.changedNativeIds.length, 4 ** level);
        summaries.push(result.summary);
        await value.store.revert({ expectedRevision: result.revision });
        assert.deepEqual((await current(value)).chunks, value.manifest.chunks);
    }
    assert.equal(summaries[0].workingBytes, summaries[1].workingBytes);
    assert.equal(summaries[0].workingByteLimit, summaries[1].workingByteLimit);
    assert.equal(summaries[0].validation.workingBytes, summaries[1].validation.workingBytes);
    assert.ok(summaries[1].validation.reads > summaries[0].validation.reads);
});

test('Cancellation during staging, validation, and before publication leaves current bytes and IDs untouched', async () => {
    for (const checkpoint of ['chunk-staged', 'candidate-validated', 'publication-ready']) {
        const value = await fixture(), before = await currentBytes(value), controller = new AbortController();
        let matched = 0;
        await assert.rejects(value.store.apply(largeBatch(value.manifest), { signal: controller.signal, onProgress: event => {
            if (event.type === checkpoint && ++matched === (checkpoint === 'publication-ready' ? 1 : 3)) controller.abort(new Error(`cancel ${checkpoint}`));
        } }), new RegExp(`cancel ${checkpoint}`));
        assert.deepEqual(await currentBytes(value), before);
        assert.equal((await value.store.readState()).canRevert, false);
        assert.ok(!(await readdir(value.directory)).includes('authoring.lock'));
        assert.ok((await readdir(path.join(value.directory, 'payloads'))).length > 0);
        const applied = await value.store.apply(largeBatch(value.manifest));
        assert.equal(applied.status, 'applied'); assert.equal((await current(value)).editHistory.batchIds.length, 1);
    }
});

test('A staging failure releases transaction admission without publishing partial dirty data', async () => {
    const value = await fixture(), before = await currentBytes(value);
    let count = 0;
    await assert.rejects(value.store.apply(largeBatch(value.manifest), { onProgress: event => {
        if (event.type === 'chunk-staged' && ++count === 3) throw new Error('injected staged output failure');
    } }), /injected staged output failure/);
    assert.deepEqual(await currentBytes(value), before); assert.ok(!(await readdir(value.directory)).includes('authoring.lock'));
    const result = await value.store.apply(largeBatch(value.manifest)); assert.equal(result.status, 'applied');
});

test('Complete candidate validation rejects corrupt unchanged channels in a soil-only edit', async () => {
    const value = await fixture(), before = await currentBytes(value), input = largeBatch(value.manifest);
    input.operations = [input.operations.at(-1)];
    const channel = value.manifest.chunks.at(-1).channels.height;
    const file = path.join(value.directory, channel.url), bytes = await readFile(file); bytes[0] ^= 1; await writeFile(file, bytes);
    await assert.rejects(value.store.apply(input), /hash mismatch/);
    assert.deepEqual(await currentBytes(value), before); assert.ok(!(await readdir(value.directory)).includes('authoring.lock'));
});

test('Large revert authenticates old payloads and remains cancelable until the current switch', async () => {
    const value = await fixture(), applied = await value.store.apply(largeBatch(value.manifest)), before = await currentBytes(value);
    const controller = new AbortController();
    await assert.rejects(value.store.revert({ expectedRevision: applied.revision, signal: controller.signal, onProgress: event => {
        if (event.type === 'candidate-validated' && event.completed === 3) controller.abort(new Error('cancel revert'));
    } }), /cancel revert/);
    assert.deepEqual(await currentBytes(value), before);
    const channel = value.manifest.chunks.at(-1).channels.height, file = path.join(value.directory, channel.url);
    const bytes = await readFile(file); bytes[0] ^= 1; await writeFile(file, bytes);
    await assert.rejects(value.store.revert({ expectedRevision: applied.revision }), /hash mismatch/);
    assert.deepEqual(await currentBytes(value), before); assert.ok(!(await readdir(value.directory)).includes('authoring.lock'));
});

test('Descriptor-aware readers reopen staged channels without changing native spatial authority', async () => {
    const value = await fixture(), applied = await value.store.apply(largeBatch(value.manifest)), edited = await current(value);
    const descriptor = edited.chunks.find(chunk => chunk.id === applied.summary.changedNativeIds[0]);
    const chunk = await readLandscapeFileChunk(value.directory, value.manifest, descriptor.id, { descriptor });
    assert.ok(chunk.heights.some(height => height !== 0)); assert.equal(chunk.descriptor.channels.height.sha256, descriptor.channels.height.sha256);
    await assert.rejects(readLandscapeFileChunk(value.directory, value.manifest, descriptor.id, { descriptor: { ...descriptor, startColumn: 99 } }), /spatial identity/);
});

test('State templates preserve stable named regions without claiming native acquisition', async () => {
    const value = await fixture(), template = largeBatch(value.manifest);
    template.id = '$batchId'; template.landscapeId = '$state.landscapeId'; template.expectedRevision = '$state.revision';
    for (const operation of template.operations) operation.id = operation.type;
    const batch = bindLandscapeStateBatchTemplate(template, await value.store.readState(), { batchId: 'bound-large' });
    assert.equal(batch.regions[0].id, 'terrain-study-area'); assert.equal(batch.operations[0].id, 'bound-large/grade');
    assert.equal(batch.operations[0].regionId, 'terrain-study-area');
    assert.equal(batch.editingReady, undefined); assert.equal(batch.acquisition, undefined);
    await value.store.apply(batch);
    assert.throws(() => bindLandscapeStateBatchTemplate(template, { revision: 'x' }, { batchId: 'bad' }), /saved landscapeId/);
});

test('Working-set admission and final current-byte checks precede any current-manifest replacement', async () => {
    const value = await fixture(), before = await currentBytes(value);
    const constrained = createLandscapeAuthoringStore({ directory: value.directory, maxWorkingBytes: 1 });
    await assert.rejects(constrained.apply(largeBatch(value.manifest)), /working buffers.*budget 1/);
    assert.deepEqual(await currentBytes(value), before); assert.ok(!(await readdir(value.directory)).includes('payloads'));
    const external = Buffer.concat([before, Buffer.from('\n')]);
    await assert.rejects(value.store.apply(largeBatch(value.manifest), { onProgress: async event => {
        if (event.type === 'publication-ready') await writeFile(path.join(value.directory, 'manifest.json'), external);
    } }), /Current manifest changed/);
    assert.deepEqual(await currentBytes(value), external); assert.ok(!(await readdir(value.directory)).includes('authoring.lock'));
    assert.equal((await value.store.readState()).canRevert, false);
});
