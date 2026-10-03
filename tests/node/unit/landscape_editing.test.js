// Tests bounded native queries, deterministic terrain edits, and unpublished revision preparation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    acquireLandscapeRegion, applyLandscapeEditBatch, encodeLandscapeChannel, landscapeGridToWorld,
    planLandscapeRegion, queryLandscapeSelection, resolveLandscapeSoil, sampleLandscapeChunk,
    validateLandscapeEditBatch, validateLandscapeManifest, validateLandscapeNativeSeams
} from '../../../src/app/landscape/index.js';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';

const clone = value => JSON.parse(JSON.stringify(value));
const circle = (x = 0, z = 18, radius = 3) => ({ type: 'circle', center: { x, z }, radius });
const rectangle = (minX, maxX, minZ, maxZ) => ({ type: 'rectangle', minX, maxX, minZ, maxZ });
const raise = (id, deltaMeters, region = circle(), falloff = { type: 'none' }) => ({ id, type: 'raise', deltaMeters, region, falloff });
const soil = (id, soilId, region = circle()) => ({ id, type: 'assign-soil', soilId, region, falloff: { type: 'none' } });
const flatten = (id, heightMeters, region = circle()) => ({ id, type: 'set-height', heightMeters, region, falloff: { type: 'none' } });
const batch = (manifest, operations, id = 'batch-1') => ({ format: 'landscape-edit-batch', schemaVersion: 1, id, landscapeId: manifest.id, expectedRevision: manifest.revision, operations });

function reader(fixture, reads = []) {
    return async id => {
        reads.push(id);
        const chunk = fixture.decoded.get(id);
        if (!chunk) throw new Error(`Missing ${id}`);
        return chunk;
    };
}

function publish(fixture, result) {
    const draft = result.manifestDraft;
    const changed = new Map(result.changedChunks.map(chunk => [chunk.descriptor.id, chunk]));
    draft.editHistory.previousManifestUrl = `manifest.${fixture.manifest.revision}.json`;
    for (const chunk of result.changedChunks) {
        const bytes = encodeLandscapeChannel(chunk.heights, 'float32-le');
        const hash = createHash('sha256').update(bytes).digest('hex');
        chunk.descriptor.channels.height = { ...chunk.descriptor.channels.height, url: `edits/${hash}.height.bin`, sha256: hash, revision: draft.revision };
    }
    const manifest = validateLandscapeManifest(draft);
    const decoded = new Map(manifest.chunks.map(descriptor => {
        const source = changed.get(descriptor.id) ?? fixture.decoded.get(descriptor.id);
        return [descriptor.id, { descriptor, heights: source.heights, landCover: source.landCover }];
    }));
    return { ...fixture, manifest, decoded };
}

test('Landscape editing: point acquisition uses deterministic east/south ownership including the last border', async () => {
    const fixture = createLandscapeModelFixture();
    assert.deepEqual(planLandscapeRegion(fixture.manifest, { type: 'point', x: 0, z: 18 }).chunkIds, ['l1/c1/r1']);
    assert.deepEqual(planLandscapeRegion(fixture.manifest, { type: 'point', x: 8, z: 10 }).chunkIds, ['l1/c1/r1']);
    const reads = [];
    const acquired = await acquireLandscapeRegion(fixture.manifest, { type: 'point', x: 0, z: 18 }, { readChunk: reader(fixture, reads) });
    assert.equal(acquired.status, 'ready');
    assert.equal(acquired.sample(0, 18).accuracy, 'authoritative');
    assert.deepEqual(reads, ['l1/c1/r1']);
    acquired.release();
    acquired.release();
    assert.equal(acquired.status, 'unavailable');
    assert.equal(acquired.decodedBytes, 0);
    assert.equal(acquired.sample(0, 18).reason, 'region-released');
});

test('Landscape editing: bounded region acquisition loads the four corner owners without the overview', async () => {
    const fixture = createLandscapeModelFixture();
    const reads = [];
    const acquired = await acquireLandscapeRegion(fixture.manifest, circle(), { readChunk: reader(fixture, reads) });
    assert.equal(acquired.status, 'ready');
    assert.equal(acquired.chunkIds.length, 4);
    assert.equal(acquired.decodedBytes, 4 * 25 * 5);
    assert.ok(reads.every(id => id.startsWith('l1/')));
    assert.equal(acquired.sample(0, 18).chunkId, 'l1/c1/r1');
    assert.equal(acquired.sample(-6, 24).status, 'unavailable');
    acquired.release();
});

test('Landscape editing: query context is exact, revision-aware, and reports released native coverage', async () => {
    const fixture = createLandscapeModelFixture();
    const reads = [];
    const request = { x: 0, z: 18, radius: 3, selectionId: 'selection-native', expectedRevision: fixture.manifest.revision, camera: { position: [0, 20, 0] } };
    const result = await queryLandscapeSelection(fixture.manifest, request, { readChunk: reader(fixture, reads) });
    assert.equal(result.provisional, false);
    assert.equal(result.editingReady, true);
    assert.equal(result.sample.accuracy, 'authoritative');
    assert.equal(result.acquisition.chunkIds.length, 4);
    assert.equal(result.acquisition.releasedAfterQuery, true);
    assert.equal(result.acquisition.nativeSpacing.x, 2);
    assert.deepEqual(result.camera, request.camera);
    reads.length = 0;
    await assert.rejects(queryLandscapeSelection(fixture.manifest, { ...request, expectedRevision: 'old' }, { readChunk: reader(fixture, reads) }), /stale selection/);
    assert.equal(reads.length, 0);
});

test('Landscape editing: outside, unavailable, canceled, and byte-limit results do not silently use coarse data', async () => {
    const fixture = createLandscapeModelFixture();
    const reads = [];
    const outside = await acquireLandscapeRegion(fixture.manifest, circle(-8, 18, 1), { readChunk: reader(fixture, reads) });
    assert.equal(outside.status, 'outside');
    assert.equal(reads.length, 0);
    const missing = await acquireLandscapeRegion(fixture.manifest, circle(), { readChunk: async () => { throw new Error('Missing native payload'); } });
    assert.equal(missing.status, 'unavailable');
    assert.match(missing.reason, /Missing native/);
    const controller = new AbortController();
    controller.abort();
    const canceled = await acquireLandscapeRegion(fixture.manifest, circle(), { readChunk: reader(fixture, reads), signal: controller.signal });
    assert.equal(canceled.reason, 'canceled');
    await assert.rejects(acquireLandscapeRegion(fixture.manifest, circle(), { readChunk: reader(fixture, reads), maxDecodedBytes: 499 }), /budget/);
    assert.equal(reads.length, 0);
});

test('Landscape editing: invalid/stale/duplicate batches and invalid soil falloff fail before reading source', async () => {
    const fixture = createLandscapeModelFixture();
    const reads = [];
    const base = batch(fixture.manifest, [raise('raise-1', 2)]);
    const cases = [
        [value => { value.expectedRevision = 'old'; }, /stale/],
        [value => { value.landscapeId = 'other'; }, /different landscape/],
        [value => { value.operations.push(clone(value.operations[0])); }, /duplicate operation/],
        [value => { value.operations[0].region = { type: 'point', x: 0, z: 18 }; }, /explicit circle or rectangle/],
        [value => { value.operations[0].deltaMeters = Infinity; }, /finite/],
        [value => { value.operations[0].falloff = { type: 'linear', distance: 4 }; }, /fit inside/],
        [value => { value.operations[0] = { ...soil('soil-1', 'sand'), falloff: { type: 'linear', distance: 1 } }; }, /hard falloff/],
        [value => { value.operations[0] = soil('soil-1', 'invented'); }, /unknown assigned soil/]
    ];
    for (const [mutate, expected] of cases) {
        const input = clone(base);
        mutate(input);
        await assert.rejects(applyLandscapeEditBatch(fixture.manifest, input, { readChunk: reader(fixture, reads), newRevision: 'edited-1' }), expected);
    }
    assert.deepEqual(reads, []);
});

test('Landscape editing: operation ordering and float32 rounding are reproducible within a batch', async () => {
    const fixture = createLandscapeModelFixture();
    const input = batch(fixture.manifest, [raise('up', 2), flatten('flat', 11), raise('down', -3)]);
    const first = await applyLandscapeEditBatch(fixture.manifest, input, { readChunk: reader(fixture), newRevision: 'edited-1' });
    const second = await applyLandscapeEditBatch(fixture.manifest, input, { readChunk: reader(fixture), newRevision: 'edited-1' });
    assert.deepEqual(first.summary, second.summary);
    for (let i = 0; i < first.changedChunks.length; i++) assert.deepEqual(first.changedChunks[i].heights, second.changedChunks[i].heights);
    const result = publish(fixture, first);
    const query = await queryLandscapeSelection(result.manifest, { x: 0, z: 18, selectionId: 'selected', expectedRevision: 'edited-1' }, { readChunk: reader(result) });
    assert.equal(query.position.y, 8);
    assert.deepEqual(result.manifest.operations.map(operation => operation.id), ['up', 'flat', 'down']);
});

test('Landscape editing: linear falloff preserves the perimeter and explicit rectangle flattening hits its target', async () => {
    const fixture = createLandscapeModelFixture({ heightAt: () => 0 });
    const operation = raise('falloff', 8, circle(0, 18, 4), { type: 'linear', distance: 4 });
    const result = publish(fixture, await applyLandscapeEditBatch(fixture.manifest, batch(fixture.manifest, [operation]), { readChunk: reader(fixture), newRevision: 'falloff-1' }));
    const source = await acquireLandscapeRegion(result.manifest, circle(0, 18, 4), { readChunk: reader(result) });
    assert.equal(source.sample(0, 18).height, 8);
    assert.equal(source.sample(2, 18).height, 4);
    assert.equal(source.sample(4, 18).height, 0);
    source.release();
    const second = publish(result, await applyLandscapeEditBatch(result.manifest, batch(result.manifest, [flatten('rect-flat', -7.25, rectangle(-2, 2, 16, 20))], 'batch-2'), { readChunk: reader(result), newRevision: 'flat-2' }));
    const query = await acquireLandscapeRegion(second.manifest, rectangle(-2, 2, 16, 20), { readChunk: reader(second) });
    assert.equal(query.sample(-2, 16).height, -7.25);
    assert.equal(query.sample(2, 20).height, -7.25);
    query.release();
});

test('Landscape editing: cross-chunk operations preserve exact shared borders and leave original inputs untouched', async () => {
    const fixture = createLandscapeModelFixture();
    const original = new Map([...fixture.decoded].map(([id, chunk]) => [id, chunk.heights.slice()]));
    const input = batch(fixture.manifest, [raise('seam-raise', 2), soil('seam-soil', 'sand')]);
    const result = await applyLandscapeEditBatch(fixture.manifest, input, { readChunk: reader(fixture), newRevision: 'edited-1' });
    assert.equal(result.summary.changedNativeIds.length, 4);
    assert.equal(result.changedChunks.length, 5);
    validateLandscapeNativeSeams(result.changedChunks.filter(chunk => chunk.descriptor.level === 1));
    for (const [id, chunk] of fixture.decoded) assert.deepEqual(chunk.heights, original.get(id));
    for (const changed of result.changedChunks) {
        assert.strictEqual(changed.landCover, fixture.decoded.get(changed.descriptor.id).landCover);
        assert.deepEqual(changed.descriptor.channels.landCover, fixture.manifest.chunks.find(chunk => chunk.id === changed.descriptor.id).channels.landCover);
    }
    assert.deepEqual(fixture.manifest.operations, []);
});

test('Landscape editing: a local edit preserves unrelated chunks and all out-of-region native vertices', async () => {
    const fixture = createLandscapeModelFixture();
    const region = circle(-4, 22, 1.5);
    const result = await applyLandscapeEditBatch(fixture.manifest, batch(fixture.manifest, [raise('local-raise', 2, region)]), { readChunk: reader(fixture), newRevision: 'local-1' });
    assert.deepEqual(result.summary.changedNativeIds, ['l1/c0/r0']);
    const edited = result.changedChunks[0];
    const before = fixture.decoded.get(edited.descriptor.id);
    let changed = 0;
    for (let row = 0; row < edited.descriptor.rows; row++) for (let column = 0; column < edited.descriptor.columns; column++) {
        const i = row * edited.descriptor.columns + column;
        const point = landscapeGridToWorld(fixture.manifest, edited.descriptor.startColumn + column, edited.descriptor.startRow + row);
        if (Math.hypot(point.x + 4, point.z - 22) > 1.5) assert.equal(edited.heights[i], before.heights[i]);
        else changed++;
    }
    assert.equal(changed, 1);
    for (const descriptor of result.manifestDraft.chunks) if (!result.summary.changedChunkIds.includes(descriptor.id)) assert.deepEqual(descriptor, fixture.manifest.chunks.find(chunk => chunk.id === descriptor.id));
});

test('Landscape editing: root samples rebuild exactly and conservative errors enclose every native checkpoint', async () => {
    const fixture = createLandscapeModelFixture();
    const result = publish(fixture, await applyLandscapeEditBatch(fixture.manifest, batch(fixture.manifest, [raise('up', 2)]), { readChunk: reader(fixture), newRevision: 'root-1' }));
    const root = result.decoded.get(result.manifest.overviewId);
    for (const chunk of result.decoded.values()) {
        if (chunk.descriptor.level !== result.manifest.grid.maxLevel) continue;
        const descriptor = chunk.descriptor;
        for (let row = 0; row < descriptor.rows; row++) for (let column = 0; column < descriptor.columns; column++) {
            const point = landscapeGridToWorld(result.manifest, descriptor.startColumn + column, descriptor.startRow + row);
            const native = chunk.heights[row * descriptor.columns + column];
            const coarse = sampleLandscapeChunk(result.manifest, root, point.x, point.z);
            assert.ok(Math.abs(native - coarse.height) <= root.descriptor.geometricError);
            if ((descriptor.startColumn + column) % root.descriptor.sampleStride === 0 && (descriptor.startRow + row) % root.descriptor.sampleStride === 0) assert.equal(native, coarse.height);
        }
    }
});

test('Landscape editing: ordered hard soil assignments preserve cover classes and are independent from render resolution', async () => {
    const fixture = createLandscapeModelFixture({ coverAt: () => 6 });
    const ops = [soil('sand-region', 'sand', circle(0, 18, 4)), soil('rock-center', 'rock', circle(0, 18, 1))];
    const reads = [];
    const applied = await applyLandscapeEditBatch(fixture.manifest, batch(fixture.manifest, ops), { readChunk: reader(fixture, reads), newRevision: 'soil-1' });
    assert.deepEqual(applied.changedChunks, []);
    assert.deepEqual(applied.summary.channels, ['soil']);
    assert.ok(!reads.includes(fixture.manifest.overviewId));
    const result = publish(fixture, applied);
    assert.equal(resolveLandscapeSoil(result.manifest, 0, 18, 6), 'rock');
    assert.equal(resolveLandscapeSoil(result.manifest, 2, 18, 6), 'sand');
    assert.equal(resolveLandscapeSoil(result.manifest, 6, 18, 6), 'unknown');
    const overview = sampleLandscapeChunk(result.manifest, result.decoded.get(result.manifest.overviewId), 0, 18);
    const native = sampleLandscapeChunk(result.manifest, result.decoded.get('l1/c1/r1'), 0, 18);
    assert.equal(overview.soilId, native.soilId);
    assert.equal(native.landCoverId, 6);
    for (const [id, chunk] of result.decoded) assert.deepEqual(chunk.landCover, fixture.decoded.get(id).landCover);
});

test('Landscape editing: duplicate replay and stale follow-up cannot mutate an already published revision', async () => {
    const fixture = createLandscapeModelFixture();
    const input = batch(fixture.manifest, [raise('up', 2)]);
    const result = publish(fixture, await applyLandscapeEditBatch(fixture.manifest, input, { readChunk: reader(fixture), newRevision: 'edited-1' }));
    const reads = [];
    await assert.rejects(applyLandscapeEditBatch(result.manifest, input, { readChunk: reader(result, reads), newRevision: 'invalid-2' }), /duplicate edit batch/);
    await assert.rejects(applyLandscapeEditBatch(result.manifest, { ...input, id: 'new-but-stale' }, { readChunk: reader(result, reads), newRevision: 'invalid-2' }), /stale edit batch/);
    assert.equal(reads.length, 0);
    const next = publish(result, await applyLandscapeEditBatch(result.manifest, batch(result.manifest, [raise('up-again', 3)], 'batch-2'), { readChunk: reader(result), newRevision: 'edited-2' }));
    assert.deepEqual(next.manifest.editHistory.batchIds, ['batch-1', 'batch-2']);
    const firstHeight = sampleLandscapeChunk(result.manifest, result.decoded.get('l1/c1/r1'), 0, 18).height;
    const nextHeight = sampleLandscapeChunk(next.manifest, next.decoded.get('l1/c1/r1'), 0, 18).height;
    assert.equal(nextHeight - firstHeight, 3);
});

test('Landscape editing: revert tombstones remain valid and prevent replay after restoring original source descriptors', async () => {
    const fixture = createLandscapeModelFixture();
    const input = batch(fixture.manifest, [raise('up', 2)]);
    const edited = publish(fixture, await applyLandscapeEditBatch(fixture.manifest, input, { readChunk: reader(fixture), newRevision: 'edited-1' }));
    const restored = clone(fixture.manifest);
    restored.revision = 'reverted-2';
    restored.capabilities.push('terrain-editing-v1');
    restored.editHistory = { batchIds: edited.manifest.editHistory.batchIds, lastBatchId: null, previousManifestUrl: null };
    const validated = validateLandscapeManifest(restored);
    assert.deepEqual(validated.chunks, fixture.manifest.chunks);
    assert.throws(() => validateLandscapeEditBatch(validated, { ...input, expectedRevision: validated.revision }), /duplicate edit batch/);
});

test('Landscape editing: oversized and scattered batches fail before any source I/O', async () => {
    const fixture = createLandscapeModelFixture({ maxLevel: 2 });
    const reads = [];
    const region = rectangle(fixture.manifest.bounds.minX, fixture.manifest.bounds.maxX, fixture.manifest.bounds.minZ, fixture.manifest.bounds.maxZ);
    await assert.rejects(applyLandscapeEditBatch(fixture.manifest, batch(fixture.manifest, [raise('too-wide', 2, region)]), { readChunk: reader(fixture, reads), newRevision: 'invalid' }), /native chunks/);
    const ops = [circle(-6, 40, 1), circle(2, 40, 1), circle(10, 40, 1), circle(18, 40, 1), circle(-6, 32, 1)].map((region, index) => raise(`scattered-${index}`, 1, region));
    await assert.rejects(applyLandscapeEditBatch(fixture.manifest, batch(fixture.manifest, ops), { readChunk: reader(fixture, reads), newRevision: 'invalid' }), /5 native chunks/);
    assert.deepEqual(reads, []);
});

test('Landscape editing: caller decoded limits apply to the whole batch union before I/O', async () => {
    const fixture = createLandscapeModelFixture();
    const reads = [];
    const operations = [raise('left', 2, circle(-4, 22, 1)), raise('right', 2, circle(4, 22, 1))];
    await assert.rejects(applyLandscapeEditBatch(fixture.manifest, batch(fixture.manifest, operations), { readChunk: reader(fixture, reads), newRevision: 'invalid-budget', maxDecodedBytes: 200 }), /250 decoded bytes; budget 200/);
    assert.deepEqual(reads, []);
});

test('Landscape editing: failed/canceled source acquisition and inconsistent shared edges leave source intact', async () => {
    const fixture = createLandscapeModelFixture();
    const input = batch(fixture.manifest, [raise('up', 2)]);
    const before = JSON.stringify(fixture.manifest);
    let count = 0;
    await assert.rejects(applyLandscapeEditBatch(fixture.manifest, input, { newRevision: 'failed', readChunk: async id => { if (++count === 2) throw new Error('read failed'); return fixture.decoded.get(id); } }), /read failed/);
    const controller = new AbortController();
    await assert.rejects(applyLandscapeEditBatch(fixture.manifest, input, { newRevision: 'canceled', signal: controller.signal, readChunk: async id => { controller.abort(); return fixture.decoded.get(id); } }), { name: 'AbortError' });
    const bad = fixture.decoded.get('l1/c1/r0');
    const corrupt = { ...bad, heights: bad.heights.slice() };
    corrupt.heights[0] = Math.fround(corrupt.heights[0] + 0.1);
    await assert.rejects(applyLandscapeEditBatch(fixture.manifest, input, { newRevision: 'invalid-seam', readChunk: async id => id === bad.descriptor.id ? corrupt : fixture.decoded.get(id) }), /seam mismatch/);
    assert.equal(JSON.stringify(fixture.manifest), before);
});

test('Landscape editing: edited manifests require valid capability, history pointers, operation ordering, and soil references', async () => {
    const fixture = createLandscapeModelFixture();
    const applied = await applyLandscapeEditBatch(fixture.manifest, batch(fixture.manifest, [soil('soil-1', 'sand')]), { readChunk: reader(fixture), newRevision: 'soil-1' });
    assert.throws(() => validateLandscapeManifest(applied.manifestDraft), /snapshot must be present together/);
    const result = publish(fixture, applied);
    const reordered = clone(result.manifest);
    const region = reordered.soil.overrides[0].region;
    reordered.soil.overrides[0].region = { radius: region.radius, center: region.center, type: region.type };
    assert.doesNotThrow(() => validateLandscapeManifest(reordered));
    for (const mutate of [
        value => { value.capabilities = value.capabilities.filter(capability => capability !== 'terrain-editing-v1'); },
        value => { value.editHistory.batchIds.push('batch-1'); },
        value => { value.operations[0].sequence = 1; },
        value => { value.soil.overrides[0].soilId = 'rock'; },
        value => { value.soil.overrides = []; }
    ]) {
        const input = clone(result.manifest);
        mutate(input);
        assert.throws(() => validateLandscapeManifest(input));
    }
});
