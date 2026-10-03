// Verifies bounded staged authoring, immutable operation snapshots, polygon semantics, and ancestor consistency.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import {
    applyLandscapeEditBatch, applyLandscapeEditBatchStreamed, decodeLandscapeChannel, encodeLandscapeChannel,
    landscapeRegionContains, landscapeRegionIntersectsBounds, landscapeRegionWeight, resolveLandscapeSoil,
    validateLandscapeEditBatch, validateLandscapeManifest, validateLandscapeNativeSeams, validateLandscapeRegion
} from '../../../src/app/landscape/index.js';

const clone = value => structuredClone(value);
const rectangle = bounds => ({ type: 'rectangle', ...bounds });
const polygon = bounds => ({ type: 'polygon', points: [{ x: bounds.minX, z: bounds.minZ }, { x: bounds.maxX, z: bounds.minZ }, { x: bounds.maxX, z: bounds.maxZ }, { x: bounds.minX, z: bounds.maxZ }] });
const operation = (id, type, region, parameters = {}) => ({ id, type, region, falloff: { type: 'none' }, ...parameters });
const batch = (manifest, operations, extras = {}) => ({ format: 'landscape-edit-batch', schemaVersion: 1, id: 'advanced-batch', landscapeId: manifest.id, expectedRevision: manifest.revision, operations, ...extras });

function channel(resources, values, encoding, revision = 'fixture-r1') {
    const bytes = encodeLandscapeChannel(values, encoding), sha256 = createHash('sha256').update(bytes).digest('hex');
    const url = `immutable/${sha256}.${encoding}.bin`;
    resources.set(url, bytes);
    return { url, sha256, encoding, byteLength: bytes.length, decodedByteLength: bytes.length, revision };
}

function completeHierarchy(source) {
    const manifest = clone(source.manifest), n = manifest.grid.chunkIntervals + 1, size = manifest.grid.columns;
    for (let level = 1; level < manifest.grid.maxLevel; level++) for (let row = 0; row < 2 ** level; row++) for (let column = 0; column < 2 ** level; column++) {
        const sampleStride = 2 ** (manifest.grid.maxLevel - level), startColumn = column * (n - 1) * sampleStride, startRow = row * (n - 1) * sampleStride;
        const heights = new Float32Array(n * n), cover = new Uint8Array(n * n);
        let minHeight = Infinity, maxHeight = -Infinity;
        for (let r = 0; r <= (n - 1) * sampleStride; r++) for (let c = 0; c <= (n - 1) * sampleStride; c++) {
            const index = (startRow + r) * size + startColumn + c;
            minHeight = Math.min(minHeight, source.sourceHeights[index]); maxHeight = Math.max(maxHeight, source.sourceHeights[index]);
            if (r % sampleStride === 0 && c % sampleStride === 0) {
                const local = r / sampleStride * n + c / sampleStride;
                heights[local] = source.sourceHeights[index]; cover[local] = source.sourceCover[index];
            }
        }
        manifest.chunks.push({ id: `l${level}/c${column}/r${row}`, level, column, row, startColumn, startRow, sampleStride, columns: n, rows: n,
            bounds: { minX: manifest.bounds.minX + startColumn * manifest.grid.spacingX, maxX: manifest.bounds.minX + (startColumn + (n - 1) * sampleStride) * manifest.grid.spacingX,
                minZ: manifest.bounds.maxZ - (startRow + (n - 1) * sampleStride) * manifest.grid.spacingZ, maxZ: manifest.bounds.maxZ - startRow * manifest.grid.spacingZ },
            minHeight, maxHeight, geometricError: maxHeight - minHeight, revision: manifest.revision, parentId: null,
            channels: { height: channel(source.resources, heights, 'float32-le'), landCover: channel(source.resources, cover, 'uint8') } });
    }
    for (const descriptor of manifest.chunks) descriptor.parentId = descriptor.level ? `l${descriptor.level - 1}/c${Math.floor(descriptor.column / 2)}/r${Math.floor(descriptor.row / 2)}` : null;
    manifest.capabilities.push('chunk-hierarchy-v1');
    manifest.hierarchy = { algorithm: 'native-hierarchy-v1', errorPolicy: 'conservative-after-edit' };
    return { ...source, manifest: validateLandscapeManifest(manifest) };
}

function staging(fixture) {
    const resources = new Map(fixture.resources), reads = [], writes = [];
    const readChunk = async (id, { descriptor, signal } = {}) => {
        signal?.throwIfAborted();
        assert.equal(descriptor.id, id);
        reads.push({ id, sha256: descriptor.channels.height.sha256 });
        return { descriptor, heights: decodeLandscapeChannel(resources.get(descriptor.channels.height.url), descriptor.channels.height),
            landCover: decodeLandscapeChannel(resources.get(descriptor.channels.landCover.url), descriptor.channels.landCover) };
    };
    const stageChunk = async ({ descriptor, heights, landCover }, progress) => {
        assert.equal(landCover.length, heights.length);
        assert.ok(progress.workingBytes <= progress.workingByteLimit);
        const result = channel(resources, heights, 'float32-le', descriptor.revision);
        writes.push({ id: descriptor.id, ...progress, signal: undefined });
        return result.sha256 === descriptor.channels.height.sha256 ? descriptor.channels.height : result;
    };
    return { resources, reads, writes, readChunk, stageChunk };
}

async function apply(fixture, input, options = {}) {
    const io = staging(fixture);
    const result = await applyLandscapeEditBatchStreamed(fixture.manifest, input, { ...io, newRevision: 'advanced-r2', ...options });
    result.manifestDraft.editHistory.previousManifestUrl = 'snapshots/before.json';
    const manifest = validateLandscapeManifest(result.manifestDraft);
    return { ...result, ...io, manifest, chunk: descriptor => io.readChunk(descriptor.id, { descriptor }) };
}

async function verifySamples(result, expected) {
    const native = [];
    for (const descriptor of result.manifest.chunks) {
        const chunk = await result.chunk(descriptor);
        if (descriptor.level === result.manifest.grid.maxLevel) native.push(chunk);
        for (let row = 0; row < descriptor.rows; row++) for (let column = 0; column < descriptor.columns; column++) {
            const c = descriptor.startColumn + column * descriptor.sampleStride, r = descriptor.startRow + row * descriptor.sampleStride;
            assert.ok(Object.is(chunk.heights[row * descriptor.columns + column], expected(c, r)), `${descriptor.id} @ ${c},${r}`);
        }
    }
    validateLandscapeNativeSeams(native);
}

test('Advanced regions: concave polygons include edges, exclude gaps, and use nearest-edge falloff', () => {
    const region = validateLandscapeRegion({ type: 'polygon', points: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 6 }, { x: 0, z: 6 }] });
    assert.equal(landscapeRegionContains(region, 2, 4), true);
    assert.equal(landscapeRegionContains(region, 3, 4), false);
    assert.equal(landscapeRegionIntersectsBounds(region, { minX: 3, maxX: 5, minZ: 3, maxZ: 5 }), false);
    assert.equal(landscapeRegionIntersectsBounds(region, { minX: 2, maxX: 3, minZ: 3, maxZ: 5 }), true);
    assert.equal(landscapeRegionWeight(region, { type: 'linear', distance: 1 }, 1.75, 4), 0.25);
    assert.equal(landscapeRegionWeight(region, { type: 'none' }, 2, 4), 1);
    for (const points of [
        [{ x: 0, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }, { x: 4, z: 0 }],
        [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }],
        [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 3 }],
        [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 0, z: 3 }, { x: 0, z: 0 }]
    ]) assert.throws(() => validateLandscapeRegion({ type: 'polygon', points }));
    assert.throws(() => validateLandscapeRegion({ ...region, holes: [] }), /holes/);
});

test('Streamed editing: sixteen and sixty-four native chunks have the same working reservation', async () => {
    const results = [];
    for (const maxLevel of [2, 3]) {
        const fixture = completeHierarchy(createLandscapeModelFixture({ maxLevel, heightAt: () => 0 }));
        const region = polygon(fixture.manifest.bounds);
        const input = batch(fixture.manifest, [operation('raise', 'raise', region, { deltaMeters: 2 }), operation('smooth', 'smooth', region, { radiusMeters: 4, strength: 1 })]);
        const result = await apply(fixture, input);
        assert.equal(result.changedChunks, undefined);
        assert.equal(result.summary.changedNativeIds.length, 4 ** maxLevel);
        assert.equal(result.summary.changedAncestorIds.length, (4 ** maxLevel - 1) / 3);
        assert.equal(result.summary.maxSimultaneousDecodedChunks, 2);
        assert.ok(result.summary.readCount > result.summary.changedNativeIds.length);
        assert.equal(result.summary.acquiredNativeChunkIds.length, 4 ** maxLevel);
        assert.deepEqual(result.summary.heightDeltaRange, { min: 2, max: 2 });
        assert.deepEqual(result.summary.changedHeightRange, { before: { min: 0, max: 0 }, after: { min: 2, max: 2 } });
        await verifySamples(result, () => 2);
        for (const descriptor of result.manifest.chunks) assert.deepEqual(descriptor.channels.landCover, fixture.manifest.chunks.find(value => value.id === descriptor.id).channels.landCover);
        results.push(result.summary);
    }
    assert.equal(results[0].workingBytes, results[1].workingBytes);
    assert.deepEqual(results[0].workingBuffers, results[1].workingBuffers);
});

test('Streamed smoothing: every chunk reads the preceding operation snapshot and canonical halo, independent of visitation', async () => {
    const fixture = completeHierarchy(createLandscapeModelFixture({ maxLevel: 2, minX: 0, minZ: 0, spacing: 1, heightAt: () => 0 }));
    const region = polygon(fixture.manifest.bounds);
    const input = batch(fixture.manifest, [
        operation('spike', 'raise', { type: 'circle', center: { x: 8, z: 8 }, radius: .2 }, { deltaMeters: 81 }),
        operation('blur', 'smooth', region, { radiusMeters: 4, strength: 1 })
    ]);
    const forward = await apply(fixture, input), reverse = await apply(fixture, input, { chunkOrder: 'reverse' });
    assert.deepEqual(forward.manifest, reverse.manifest);
    await verifySamples(forward, (column, row) => Math.abs(column - 8) <= 4 && Math.abs(row - 8) <= 4 ? 1 : 0);
    const blurredWrites = forward.writes.filter(value => value.operationId === 'blur');
    assert.ok(blurredWrites.length > 4);
    const stagedBlur = new Set(blurredWrites.map(value => value.id));
    assert.ok(stagedBlur.has('l2/c0/r0'));
});

test('Streamed smoothing: source boundaries repeat clamped samples and ordered iterations compose', async () => {
    const fixture = createLandscapeModelFixture({ maxLevel: 1, spacing: 1, minX: 0, minZ: 0, heightAt: (c, r) => c === 0 && r === 0 ? 9 : 0 });
    const region = rectangle(fixture.manifest.bounds), size = fixture.manifest.grid.columns;
    const operations = [operation('smooth-1', 'smooth', region, { radiusMeters: 1, strength: 1 }), operation('smooth-2', 'smooth', region, { radiusMeters: 1, strength: .5 })];
    let expected = fixture.sourceHeights.slice();
    for (const op of operations) {
        const previous = expected, next = new Float32Array(previous.length);
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
            let sum = 0;
            for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) sum += previous[Math.max(0, Math.min(size - 1, r + y)) * size + Math.max(0, Math.min(size - 1, c + x))];
            next[r * size + c] = Math.fround(previous[r * size + c] + (sum / 9 - previous[r * size + c]) * op.strength);
        }
        expected = next;
    }
    const result = await apply(fixture, batch(fixture.manifest, operations));
    await verifySamples(result, (c, r) => expected[r * size + c]);
    assert.ok(result.summary.heightDeltaRange.min < 0 && result.summary.heightDeltaRange.max > 0);
});

test('Streamed smoothing: a largest supported native page and eight-sample halo fit the declared fixed working cap', async () => {
    const fixture = createLandscapeModelFixture({ chunkIntervals: 256, maxLevel: 0, spacing: 1, minX: 0, minZ: 0, heightAt: (c, r) => c === 128 && r === 128 ? 289 : 0 });
    const input = batch(fixture.manifest, [operation('widest-kernel', 'smooth', rectangle(fixture.manifest.bounds), { radiusMeters: 8, strength: 1 })]);
    const io = staging(fixture);
    await assert.rejects(applyLandscapeEditBatchStreamed(fixture.manifest, input, { ...io, newRevision: 'too-small', maxWorkingBytes: 2_387_010 }), /need 2387011 bytes/);
    assert.equal(io.reads.length + io.writes.length, 0);
    const result = await apply(fixture, input);
    assert.equal(result.summary.workingBytes, 2_387_011);
    assert.deepEqual(result.summary.workingBuffers.haloRadiusSamples, { x: 8, z: 8 });
    assert.deepEqual(result.summary.heightDeltaRange, { min: -288, max: 1 });
    await verifySamples(result, (c, r) => Math.abs(c - 128) <= 8 && Math.abs(r - 128) <= 8 ? 1 : 0);
});

test('Streamed grade and named polygon soil preserve stable IDs, explicit falloff, and old source outside the region', async () => {
    const fixture = completeHierarchy(createLandscapeModelFixture({ maxLevel: 2, minX: 0, minZ: 0, spacing: 1, heightAt: () => 0, coverAt: () => 6 }));
    const region = polygon({ minX: 2, maxX: 14, minZ: 2, maxZ: 14 });
    const input = batch(fixture.manifest, [
        { id: 'grade', type: 'grade', regionId: 'district', falloff: { type: 'linear', distance: 2 }, start: { x: 4, z: 8, heightMeters: 10 }, end: { x: 12, z: 8, heightMeters: 26 } },
        { id: 'sand', type: 'assign-soil', regionId: 'district', falloff: { type: 'none' }, soilId: 'sand' }
    ], { regions: [{ id: 'district', name: 'Graded district', region }] });
    const result = await apply(fixture, input);
    await verifySamples(result, (c, r) => {
        const z = 16 - r, weight = landscapeRegionWeight(region, input.operations[0].falloff, c, z);
        return Math.fround((10 + Math.max(0, Math.min(1, (c - 4) / 8)) * 16) * weight);
    });
    assert.deepEqual(result.summary.channels, ['height', 'soil']);
    assert.deepEqual(result.summary.regionIds, ['district']);
    assert.equal(resolveLandscapeSoil(result.manifest, 8, 8, 6), 'sand');
    assert.equal(resolveLandscapeSoil(result.manifest, 1, 8, 6), 'unknown');
    assert.deepEqual(result.manifest.regions, input.regions);
    assert.ok(result.manifest.capabilities.includes('terrain-editing-v2'));
    const noCapability = clone(result.manifest); noCapability.capabilities = noCapability.capabilities.filter(value => value !== 'terrain-editing-v2');
    assert.throws(() => validateLandscapeManifest(noCapability), /terrain-editing-v2/);
    const wrongOverride = clone(result.manifest);
    wrongOverride.soil.overrides[0].region.points[1].z = 3;
    assert.throws(() => validateLandscapeManifest(wrongOverride), /region differs/);
    const wrongNamed = clone(result.manifest); wrongNamed.regions[0].region.points[1].z = 3;
    assert.throws(() => validateLandscapeManifest(wrongNamed), /differs from named region/);
    const followUp = batch(result.manifest, [{ id: 'next-raise', type: 'raise', regionId: 'district', falloff: { type: 'none' }, deltaMeters: 1 }], { id: 'follow-up' });
    const next = await apply({ manifest: result.manifest, resources: result.resources }, followUp, { newRevision: 'advanced-r3' });
    assert.deepEqual(next.manifest.regions, input.regions);
    assert.throws(() => validateLandscapeEditBatch(result.manifest, { ...followUp, regions: input.regions }), /duplicate named region/);
});

test('Streamed editing: net-zero relative changes preserve original payload identities and unrelated chunks', async () => {
    const fixture = completeHierarchy(createLandscapeModelFixture({ maxLevel: 2, heightAt: () => 0 }));
    const region = { type: 'circle', center: { x: 0, z: 18 }, radius: 2 };
    const result = await apply(fixture, batch(fixture.manifest, [operation('up', 'raise', region, { deltaMeters: 8 }), operation('down', 'raise', region, { deltaMeters: -8 })]));
    assert.deepEqual(result.manifest.chunks, fixture.manifest.chunks);
    assert.deepEqual(result.summary.changedChunkIds, []);
    assert.equal(result.summary.heightDeltaRange, null);
    assert.equal(result.summary.changedHeightRange, null);
    assert.equal(result.manifest.operations.length, 2);
    assert.ok(result.writes.length > 0);
});

test('Streamed editing: complete validation and working-budget refusal happen before reads or staged writes', async () => {
    const fixture = createLandscapeModelFixture({ maxLevel: 2 }), region = polygon(fixture.manifest.bounds);
    const valid = batch(fixture.manifest, [operation('valid', 'raise', region, { deltaMeters: 2 })]);
    const invalidOperations = [
        operation('bad', 'smooth', region, { radiusMeters: 0, strength: 1 }),
        operation('bad', 'smooth', region, { radiusMeters: 18, strength: 1 }),
        operation('bad', 'smooth', region, { radiusMeters: 2, strength: 0 }),
        operation('bad', 'grade', region, { start: { x: 0, z: 18, heightMeters: 2 }, end: { x: 0, z: 18, heightMeters: 8 } }),
        { id: 'bad', type: 'raise', regionId: 'missing', falloff: { type: 'none' }, deltaMeters: 2 }
    ];
    for (const invalid of invalidOperations) {
        const io = staging(fixture);
        await assert.rejects(applyLandscapeEditBatchStreamed(fixture.manifest, { ...valid, operations: [...valid.operations, invalid] }, { ...io, newRevision: 'invalid' }));
        assert.equal(io.reads.length + io.writes.length, 0);
    }
    const io = staging(fixture);
    await assert.rejects(applyLandscapeEditBatchStreamed(fixture.manifest, valid, { ...io, newRevision: 'too-small', maxWorkingBytes: 1 }), /working buffers need/);
    await assert.rejects(applyLandscapeEditBatch(fixture.manifest, valid, { readChunk: io.readChunk, newRevision: 'legacy' }), /applyLandscapeEditBatchStreamed/);
    assert.equal(io.reads.length + io.writes.length, 0);
});

test('Streamed editing: stale descriptor readers, corrupt halos, failed writes and cancellation cannot return a candidate', async () => {
    const fixture = createLandscapeModelFixture({ maxLevel: 1, heightAt: () => 0 }), region = rectangle(fixture.manifest.bounds);
    const input = batch(fixture.manifest, [operation('up', 'raise', region, { deltaMeters: 2 }), operation('blur', 'smooth', region, { radiusMeters: 2, strength: 1 })]);
    const original = JSON.stringify(fixture.manifest), stale = staging(fixture);
    await assert.rejects(applyLandscapeEditBatchStreamed(fixture.manifest, input, { ...stale, newRevision: 'bad-reader', readChunk: async id => fixture.decoded.get(id) }), /stale or invalid/);
    const corrupt = staging(fixture);
    await assert.rejects(applyLandscapeEditBatchStreamed(fixture.manifest, input, { ...corrupt, newRevision: 'bad-halo', readChunk: async (id, options) => {
        const chunk = await corrupt.readChunk(id, options);
        if (id === 'l1/c1/r0') { chunk.landCover[0] = 7; }
        return chunk;
    } }), /seam mismatch/);
    const failed = staging(fixture);
    await assert.rejects(applyLandscapeEditBatchStreamed(fixture.manifest, input, { ...failed, newRevision: 'failed-write', stageChunk: async () => { throw new Error('disk unavailable'); } }), /disk unavailable/);
    const canceled = staging(fixture), controller = new AbortController();
    await assert.rejects(applyLandscapeEditBatchStreamed(fixture.manifest, input, { ...canceled, newRevision: 'canceled', signal: controller.signal, stageChunk: async (chunk, progress) => {
        const descriptor = await canceled.stageChunk(chunk, progress); controller.abort(); return descriptor;
    } }), { name: 'AbortError' });
    assert.equal(canceled.writes.length, 1);
    assert.equal(JSON.stringify(fixture.manifest), original);
});
