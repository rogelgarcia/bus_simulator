// Verifies exact hierarchy preparation, source-preserving publication, and all-ancestor authoring/revert behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { validateLandscapeManifest } from '../../../src/app/landscape/index.js';
import { createLandscapeAuthoringStore } from '../../../tools/landscape_authoring/LandscapeAuthoringStore.mjs';
import { readLandscapeFileChunk, readLandscapeFileManifest } from '../../../tools/landscape_authoring/LandscapeFileIO.mjs';
import { prepareLandscapeHierarchy } from '../../../tools/bake_landscape/HierarchyPreparation.mjs';
import { publishLandscapeHierarchy, validateHierarchyCandidate } from '../../../tools/bake_landscape/HierarchyPublication.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = path.join(root, 'tests/artifacts/screens/landscape/ai576/d3/hierarchy-tests');
await mkdir(evidence, { recursive: true });

async function fixture() {
    const source = createLandscapeModelFixture({ maxLevel: 3, heightAt: (column, row) => Math.fround(Math.sin(column * 0.37) * 3 + Math.cos(row * 0.29) * 2), coverAt: (column, row) => (column + row) % 8 });
    const parent = await mkdtemp(path.join(evidence, 'fixture-')), directory = path.join(parent, 'saved');
    for (const [url, bytes] of source.resources) {
        const file = path.join(directory, url); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes);
    }
    return { ...source, directory, parent, store: createLandscapeAuthoringStore({ directory }) };
}

async function prepare(value, label = 'candidate') {
    return prepareLandscapeHierarchy({ directory: value.directory, outputDirectory: path.join(value.parent, label) });
}

function batch(manifest, { id = 'hierarchy-edit', x = 24, z = 42, radius = 3 } = {}) {
    return { format: 'landscape-edit-batch', schemaVersion: 1, id, landscapeId: manifest.id, expectedRevision: manifest.revision,
        operations: [
            { id: `${id}/raise`, type: 'raise', region: { type: 'circle', center: { x, z }, radius }, falloff: { type: 'none' }, deltaMeters: 2 },
            { id: `${id}/sand`, type: 'assign-soil', region: { type: 'circle', center: { x, z }, radius }, falloff: { type: 'none' }, soilId: 'sand' }
        ] };
}

test('Hierarchy prepares every level with exact source-aligned values and independently measured errors', async () => {
    const value = await fixture(), prepared = await prepare(value), manifest = await validateHierarchyCandidate(prepared);
    assert.equal(manifest.chunks.length, 85); assert.ok(manifest.capabilities.includes('chunk-hierarchy-v1'));
    assert.equal(prepared.report.builds[0].maximumResidentNativeChunks, 1);
    assert.ok(prepared.report.builds[0].plannedWorkingBytes <= prepared.report.builds[0].workingByteLimit);
    for (const descriptor of manifest.chunks) {
        assert.equal(descriptor.parentId, descriptor.level ? `l${descriptor.level - 1}/c${Math.floor(descriptor.column / 2)}/r${Math.floor(descriptor.row / 2)}` : null);
        const chunk = await readLandscapeFileChunk(descriptor.level === 3 ? value.directory : prepared.outputDirectory, manifest, descriptor.id);
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
            const index = (descriptor.startRow + r * descriptor.sampleStride) * 33 + descriptor.startColumn + c * descriptor.sampleStride;
            assert.ok(Object.is(chunk.heights[r * 5 + c], value.sourceHeights[index]));
            assert.equal(chunk.landCover[r * 5 + c], value.sourceCover[index]);
        }
        let error = 0;
        const span = 4 * descriptor.sampleStride;
        for (let row = 0; row <= span; row++) for (let column = 0; column <= span; column++) {
            const gx = column / descriptor.sampleStride, gy = row / descriptor.sampleStride;
            const c = Math.min(3, Math.floor(gx)), r = Math.min(3, Math.floor(gy)), u = gx - c, v = gy - r;
            const a = chunk.heights[r * 5 + c], b = chunk.heights[r * 5 + c + 1], sw = chunk.heights[(r + 1) * 5 + c], d = chunk.heights[(r + 1) * 5 + c + 1];
            const preview = u >= v ? (1 - u) * a + (u - v) * b + v * d : (1 - v) * a + (v - u) * sw + u * d;
            const native = value.sourceHeights[(descriptor.startRow + row) * 33 + descriptor.startColumn + column];
            error = Math.max(error, Math.abs(native - preview));
        }
        assert.ok(Math.abs(error - descriptor.geometricError) < 1e-10, descriptor.id);
        if (descriptor.level === 3) assert.deepEqual(descriptor.channels, value.manifest.chunks.find(chunk => chunk.id === descriptor.id).channels);
    }
    const missing = structuredClone(manifest); missing.chunks = missing.chunks.filter(chunk => chunk.id !== 'l2/c0/r0');
    assert.throws(() => validateLandscapeManifest(missing), /parent|coverage/);
    const wrongParent = structuredClone(manifest); wrongParent.chunks.find(chunk => chunk.id === 'l2/c0/r0').parentId = 'l0/c0/r0';
    assert.throws(() => validateLandscapeManifest(wrongParent), /direct quadtree parent/);
});

test('Hierarchy publication is repeatable and a corrupt staged payload cannot replace current terrain', async () => {
    const value = await fixture(), initial = await readFile(path.join(value.directory, 'manifest.json'));
    const bad = await prepare(value, 'bad'), channel = bad.manifest.chunks.find(chunk => chunk.level === 1).channels.height;
    const file = path.join(bad.outputDirectory, channel.url), bytes = await readFile(file); bytes[0] ^= 1; await writeFile(file, bytes);
    await assert.rejects(publishLandscapeHierarchy(bad), /hash mismatch/);
    assert.deepEqual(await readFile(path.join(value.directory, 'manifest.json')), initial);
    const first = await prepare(value, 'first'); await publishLandscapeHierarchy(first);
    const repeated = await prepare(value, 'repeated');
    assert.deepEqual(repeated.manifest, first.manifest); assert.equal(repeated.report.changed, false);
    await publishLandscapeHierarchy(repeated);
});

test('A four-native-chunk edit rebuilds all nine ancestors and preserves unrelated channels/errors through revert', async () => {
    const value = await fixture(), prepared = await prepare(value); await publishLandscapeHierarchy(prepared);
    const original = (await readLandscapeFileManifest(value.directory)).manifest, result = await value.store.apply(batch(original));
    assert.equal(result.summary.changedNativeIds.length, 4); assert.equal(result.summary.changedAncestorIds.length, 9);
    assert.ok(result.summary.workingBytes <= result.summary.workingByteLimit);
    const edited = (await readLandscapeFileManifest(value.directory)).manifest;
    assert.equal(edited.hierarchy.errorPolicy, 'conservative-after-edit');
    assert.deepEqual(edited.chunks.find(chunk => chunk.id === 'l2/c0/r0'), original.chunks.find(chunk => chunk.id === 'l2/c0/r0'));
    for (const chunk of edited.chunks) assert.deepEqual(chunk.channels.landCover, original.chunks.find(node => node.id === chunk.id).channels.landCover);
    for (const id of result.summary.changedAncestorIds) {
        const chunk = await readLandscapeFileChunk(value.directory, edited, id), descriptor = chunk.descriptor;
        const column = (16 - descriptor.startColumn) / descriptor.sampleStride, row = (16 - descriptor.startRow) / descriptor.sampleStride;
        assert.equal(chunk.heights[row * 5 + column], Math.fround(value.sourceHeights[16 * 33 + 16] + 2));
        assert.ok(descriptor.geometricError >= original.chunks.find(node => node.id === id).geometricError);
    }
    await value.store.revert({ expectedRevision: edited.revision });
    const reverted = (await readLandscapeFileManifest(value.directory)).manifest;
    assert.deepEqual(reverted.chunks, original.chunks); assert.equal(reverted.chunks.length, 85);
    await assert.rejects(value.store.apply({ ...batch(reverted), expectedRevision: reverted.revision }), /duplicate/);
});

test('Sub-ancestor-grid edits invalidate conservative error metadata without rewriting identical ancestor channels', async () => {
    const value = await fixture(); await publishLandscapeHierarchy(await prepare(value));
    const original = (await readLandscapeFileManifest(value.directory)).manifest;
    const result = await value.store.apply(batch(original, { id: 'tiny', x: 2, z: 64, radius: 0.2 }));
    const edited = (await readLandscapeFileManifest(value.directory)).manifest;
    assert.equal(result.summary.changedNativeIds.length, 1); assert.equal(result.summary.changedAncestorIds.length, 3);
    for (const id of result.summary.changedAncestorIds) {
        const before = original.chunks.find(chunk => chunk.id === id), after = edited.chunks.find(chunk => chunk.id === id);
        assert.deepEqual(after.channels, before.channels); assert.notEqual(after.revision, before.revision);
        assert.ok(after.geometricError > before.geometricError);
    }
});

test('Hierarchy preparation preserves preexisting authored edits and upgrades the last-batch revert snapshot', async () => {
    const value = await fixture(), input = batch(value.manifest, { id: 'before-hierarchy' });
    await value.store.apply(input);
    const authored = (await readLandscapeFileManifest(value.directory)).manifest;
    const prepared = await prepare(value); assert.equal(prepared.report.builds.length, 2);
    await publishLandscapeHierarchy(prepared);
    const current = (await readLandscapeFileManifest(value.directory)).manifest;
    assert.deepEqual(current.operations, authored.operations); assert.deepEqual(current.soil, authored.soil);
    assert.deepEqual(current.editHistory.batchIds, authored.editHistory.batchIds); assert.equal(current.editHistory.lastBatchId, input.id);
    const previous = await readLandscapeFileManifest(value.directory, current.editHistory.previousManifestUrl);
    assert.equal(previous.manifest.chunks.length, 85);
    await value.store.revert({ expectedRevision: current.revision });
    const reverted = (await readLandscapeFileManifest(value.directory)).manifest;
    assert.equal(reverted.chunks.length, 85); assert.deepEqual(reverted.operations, []);
    for (const chunk of reverted.chunks.filter(chunk => chunk.level === 3)) assert.deepEqual(chunk.channels, value.manifest.chunks.find(node => node.id === chunk.id).channels);
    assert.deepEqual(reverted.editHistory.batchIds, [input.id]);
});

test('Hierarchy publication authenticates upgraded revert-only payloads before installing a new current manifest', async () => {
    const value = await fixture(); await value.store.apply(batch(value.manifest));
    const current = await readFile(path.join(value.directory, 'manifest.json')), prepared = await prepare(value);
    const previous = await readLandscapeFileManifest(prepared.outputDirectory, prepared.manifest.editHistory.previousManifestUrl);
    const currentUrls = new Set(prepared.manifest.chunks.map(chunk => chunk.channels.height.url));
    const channel = previous.manifest.chunks.find(chunk => chunk.level < 3 && !currentUrls.has(chunk.channels.height.url)).channels.height;
    const file = path.join(prepared.outputDirectory, channel.url), bytes = await readFile(file);
    bytes[0] ^= 1; await writeFile(file, bytes);
    await assert.rejects(publishLandscapeHierarchy(prepared), /payload hash mismatch/);
    assert.deepEqual(await readFile(path.join(value.directory, 'manifest.json')), current);
});
