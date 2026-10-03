// Tests the landscape data boundary, source precision, sampling, and bounded loading.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LANDSCAPE_LAND_COVER_CATALOG, LANDSCAPE_MANIFEST_BYTE_LIMIT,
    createLandscapeSelectionContext, decodeLandscapeChannel, encodeLandscapeChannel,
    landscapeCityTileToWorld, landscapeGridToWorld, landscapeWorldToCityTile, landscapeWorldToGrid,
    loadLandscapeChunk, loadLandscapeManifest, loadLandscapeOverview, sampleLandscapeChunk, validateLandscapeManifest
} from '../../../src/app/landscape/index.js';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';

const URL = 'https://example.test/fixture/manifest.json';
const clone = (value) => JSON.parse(JSON.stringify(value));
const near = (actual, expected, epsilon = 1e-10) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test('Landscape model: plain-data round trip preserves stable identities and freezes independent copies', () => {
    const { manifest } = createLandscapeModelFixture();
    const input = clone(manifest);
    const roundTrip = validateLandscapeManifest(input);
    assert.deepEqual(roundTrip, manifest);
    assert.ok(Object.isFrozen(roundTrip) && Object.isFrozen(roundTrip.chunks[0].channels));
    input.name = 'Changed outside';
    assert.equal(roundTrip.name, manifest.name);
    assert.deepEqual(roundTrip.chunks.map((entry) => entry.id), ['l0/c0/r0', 'l1/c0/r0', 'l1/c1/r0', 'l1/c0/r1', 'l1/c1/r1']);
    assert.equal(roundTrip.chunks[0].channels.height.byteLength, 5 * 5 * 4);
});

test('Landscape model: unsupported schema, capabilities, and partial source coverage fail explicitly', () => {
    const { manifest } = createLandscapeModelFixture();
    const cases = [
        [(input) => { input.schemaVersion = 2; }, /schemaVersion/],
        [(input) => { input.capabilities.push('invented-capability'); }, /unsupported required capability/],
        [(input) => { input.chunks.pop(); }, /coverage must be complete/],
        [(input) => { input.chunks[1].channels.landCover = null; }, /landCover is required/],
        [(input) => { input.soil.overrides.push({ id: 'not-implemented' }); }, /unsupported editing capability/],
        [(input) => { input.elevation.noData = 'zero'; }, /no-data contract/],
        [(input) => { input.coordinates.rasterRow0 = 'south'; }, /coordinate convention/],
        [(input) => { input.grid.chunkIntervals = 512; }, /1..256/]
    ];
    for (const [mutate, expected] of cases) {
        const input = clone(manifest);
        mutate(input);
        assert.throws(() => validateLandscapeManifest(input), expected);
    }
});

test('Landscape model: malformed references and chunk identities cannot redirect resource loads', () => {
    const { manifest } = createLandscapeModelFixture();
    const cases = [
        [(input) => { input.chunks[1].channels.height.url = 'chunks/../outside.raw'; }, /traverse/],
        [(input) => { input.chunks[1].channels.height.url = 'https://external.test/h.raw'; }, /relative asset path/],
        [(input) => { input.chunks[1].channels.height.sha256 = 'bad'; }, /SHA-256/],
        [(input) => { input.chunks[1].channels.height.byteLength = 1; }, /byte size/],
        [(input) => { input.chunks[1].startRow = 1; }, /source window/],
        [(input) => { input.chunks[1].bounds.minZ = -90; }, /inconsistent with the native grid/],
        [(input) => { input.chunks[1].parentId = input.chunks[1].id; }, /coarser prepared parent/],
        [(input) => { input.chunks.push(input.chunks[1]); }, /duplicate chunk/],
        [(input) => { input.chunks[0].maxHeight = -1; }, /parent elevation envelope/]
    ];
    for (const [mutate, expected] of cases) {
        const input = clone(manifest);
        mutate(input);
        assert.throws(() => validateLandscapeManifest(input), expected);
    }
    assert.throws(() => validateLandscapeManifest({ ...clone(manifest), viewport: new Map() }), /plain JSON objects/);
});

test('Landscape model: north raster rows and inclusive corners map to world meters with a nonzero origin', () => {
    const { manifest } = createLandscapeModelFixture();
    assert.deepEqual(landscapeGridToWorld(manifest, 0, 0), { x: -8, z: 26 });
    assert.deepEqual(landscapeGridToWorld(manifest, 8, 8), { x: 8, z: 10 });
    assert.deepEqual(landscapeWorldToGrid(manifest, 8, 10), { status: 'ready', column: 8, row: 8 });
    assert.deepEqual(landscapeWorldToGrid(manifest, -8.001, 10), { status: 'outside' });
    assert.throws(() => landscapeGridToWorld(manifest, 9, 0), /outside/);
});

test('Landscape model: native coastal resolution is exactly 4000 / 2048 with row zero at the north', () => {
    const manifest = { bounds: { minX: 0, maxX: 4000, minZ: 0, maxZ: 4000 }, grid: { columns: 2049, rows: 2049, spacingX: 1.953125, spacingZ: 1.953125 } };
    assert.deepEqual(landscapeGridToWorld(manifest, 256, 256), { x: 500, z: 3500 });
    assert.deepEqual(landscapeGridToWorld(manifest, 2048, 2048), { x: 4000, z: 0 });
});

test('Landscape model: little-endian height payloads preserve float32 precision, seabed, and signed zero', () => {
    const values = new Float32Array([-30, -0, 0, 49.219654, 1 / 3]);
    const encoded = encodeLandscapeChannel(values, 'float32-le');
    const channel = { encoding: 'float32-le', byteLength: encoded.length, decodedByteLength: encoded.length };
    assert.equal(new DataView(encoded.buffer).getFloat32(0, true), -30);
    assert.deepEqual(decodeLandscapeChannel(encoded, channel), values);
    assert.ok(Object.is(decodeLandscapeChannel(encoded, channel)[1], -0));
    assert.throws(() => decodeLandscapeChannel(encoded.subarray(0, -1), channel), /byte count/);
    assert.throws(() => decodeLandscapeChannel(encoded, channel, { minHeight: 0 }), /outside declared bounds/);
    assert.throws(() => encodeLandscapeChannel([NaN], 'float32-le'), /finite/);
    assert.throws(() => encodeLandscapeChannel([1e39], 'float32-le'), /float32 range/);
    const corrupt = encoded.slice();
    new DataView(corrupt.buffer).setFloat32(0, Infinity, true);
    assert.throws(() => decodeLandscapeChannel(corrupt, channel), /nonfinite/);
});

test('Landscape model: categorical IDs stay discrete and planning pavement does not claim known soil', () => {
    const values = Uint8Array.from({ length: 8 }, (_, index) => index);
    const encoded = encodeLandscapeChannel(values, 'uint8');
    const channel = { encoding: 'uint8', byteLength: 8, decodedByteLength: 8 };
    assert.deepEqual(decodeLandscapeChannel(encoded, channel, { allowedIds: new Set(values) }), values);
    assert.throws(() => decodeLandscapeChannel(encoded, channel, { allowedIds: new Set([0]) }), /unknown land-cover/);
    assert.throws(() => encodeLandscapeChannel([1.5], 'uint8'), /must be uint8/);
    for (const id of [5, 6, 7]) {
        assert.equal(LANDSCAPE_LAND_COVER_CATALOG[id].soilId, 'unknown');
        assert.equal(LANDSCAPE_LAND_COVER_CATALOG[id].planningOnly, true);
    }
});

test('Landscape model: sampling follows NW-SE triangles rather than bilinear elevation', () => {
    const fixture = createLandscapeModelFixture({ chunkIntervals: 1, maxLevel: 0, minX: 0, minZ: 0, spacing: 1, heightAt: (c, r) => c === 1 && r === 1 ? 4 : 0, coverAt: (c, r) => c + r * 2 });
    const chunk = fixture.decoded.get('l0/c0/r0');
    const sample = sampleLandscapeChunk(fixture.manifest, chunk, 0.75, 0.75);
    near(sample.height, 1);
    near(sample.normal.x, 0);
    near(sample.normal.y, 1 / Math.sqrt(17));
    near(sample.normal.z, 4 / Math.sqrt(17));
    assert.equal(sample.landCoverId, 1);
    assert.equal(sample.soilId, 'sand');
    assert.equal(sample.accuracy, 'authoritative');
    assert.equal(sample.provisional, false);
    const otherTriangle = sampleLandscapeChunk(fixture.manifest, chunk, 0.25, 0.25);
    near(otherTriangle.height, 1);
    near(otherTriangle.normal.x, -4 / Math.sqrt(17));
    near(otherTriangle.normal.z, 0);
});

test('Landscape model: normals use world derivatives and categorical half ties choose east/south', () => {
    const fixture = createLandscapeModelFixture({ heightAt: (c, r) => 2 * c * 2 - 3 * r * 2 + 5, coverAt: (c, r) => (c + r) % 8 });
    const chunk = fixture.decoded.get('l1/c0/r0');
    const sample = sampleLandscapeChunk(fixture.manifest, chunk, -7, 25);
    near(sample.height, 4);
    near(sample.normal.x, -2 / Math.sqrt(14));
    near(sample.normal.y, 1 / Math.sqrt(14));
    near(sample.normal.z, -3 / Math.sqrt(14));
    assert.equal(sample.landCoverId, 2);
});

test('Landscape model: native chunk border heights and categories are identical from either side', () => {
    const { manifest, decoded } = createLandscapeModelFixture();
    const west = decoded.get('l1/c0/r0');
    const east = decoded.get('l1/c1/r0');
    for (let z = 18; z <= 26; z += 0.25) {
        const a = sampleLandscapeChunk(manifest, west, 0, z);
        const b = sampleLandscapeChunk(manifest, east, 0, z);
        assert.equal(a.height, b.height);
        assert.equal(a.landCoverId, b.landCoverId);
        assert.equal(a.soilId, b.soilId);
    }
});

test('Landscape model: zero/negative heights and missing coverage remain distinct', () => {
    const fixture = createLandscapeModelFixture({ heightAt: (c) => c - 2 });
    const chunk = fixture.decoded.get('l1/c0/r0');
    const zero = sampleLandscapeChunk(fixture.manifest, chunk, -4, 24);
    assert.equal(zero.status, 'ready');
    assert.equal(zero.height, 0);
    assert.equal(zero.submerged, false);
    const seabed = sampleLandscapeChunk(fixture.manifest, chunk, -8, 26);
    assert.equal(seabed.waterDepth, 2);
    assert.equal(seabed.submerged, true);
    assert.equal(sampleLandscapeChunk(fixture.manifest, chunk, -9, 26).status, 'outside');
    assert.equal(sampleLandscapeChunk(fixture.manifest, chunk, 4, 26).status, 'unavailable');
});

test('Landscape model: coarse context is explicitly provisional and excludes persistent camera state', () => {
    const { manifest, decoded } = createLandscapeModelFixture();
    const before = JSON.stringify(manifest);
    const context = createLandscapeSelectionContext(manifest, decoded.get(manifest.overviewId), { x: 0, z: 18, radius: 2, selectionId: 'selection-1', camera: { position: { x: 1, y: 20, z: 3 } } });
    assert.equal(context.sourceRevision, 'fixture-r1');
    assert.equal(context.provisional, true);
    assert.equal(context.editingReady, false);
    assert.deepEqual(context.region, { type: 'circle', center: { x: 0, z: 18 }, radius: 2 });
    assert.equal(context.sample.sampleSpacing.x, 4);
    assert.ok(Object.isFrozen(context));
    assert.equal(JSON.stringify(manifest), before);
    assert.throws(() => createLandscapeSelectionContext(manifest, decoded.get(manifest.overviewId), { x: -8, z: 18, radius: 2, selectionId: 'bad-edge' }), /exceeds landscape/);
});

test('Landscape model: city tile origins are centers with half-open edges and positive world Z rows', () => {
    const grid = { origin: { x: -10, z: 20 }, tileSize: 4, width: 3, height: 2 };
    assert.deepEqual(landscapeCityTileToWorld(grid, 1, 1), { x: -6, z: 24 });
    assert.deepEqual(landscapeWorldToCityTile(grid, -12, 18), { status: 'ready', column: 0, row: 0 });
    assert.deepEqual(landscapeWorldToCityTile(grid, -8, 22), { status: 'ready', column: 1, row: 1 });
    assert.deepEqual(landscapeWorldToCityTile(grid, 0, 22), { status: 'outside', column: 3, row: 1 });
    assert.equal(landscapeWorldToCityTile(grid, -12.001, 20).status, 'outside');
});

test('Landscape model: overview loader reads exactly manifest and coarse channels without native source allocation', async () => {
    const fixture = createLandscapeModelFixture();
    const result = await loadLandscapeOverview(URL, { fetchImpl: fixture.fetchImpl });
    assert.deepEqual(fixture.requests, ['manifest.json', 'chunks/l0/c0/r0.height.bin', 'chunks/l0/c0/r0.landCover.bin']);
    assert.equal(result.decodedBytes, 25 * 5);
    assert.equal(result.encodedBytes, 25 * 5);
    assert.equal(result.chunk.heights.length, 25);
    assert.deepEqual(result.chunk.heights, fixture.decoded.get('l0/c0/r0').heights);
    assert.equal(sampleLandscapeChunk(result.manifest, result.chunk, -8, 26).accuracy, 'approximate');
});

test('Landscape model: chunk memory admission happens before I/O and standalone native loads are bounded', async () => {
    const fixture = createLandscapeModelFixture();
    await assert.rejects(loadLandscapeChunk(fixture.manifest, 'l1/c0/r0', { manifestUrl: URL, fetchImpl: fixture.fetchImpl, maxDecodedBytes: 124 }), /budget/);
    assert.deepEqual(fixture.requests, []);
    const chunk = await loadLandscapeChunk(fixture.manifest, 'l1/c0/r0', { manifestUrl: URL, fetchImpl: fixture.fetchImpl, maxDecodedBytes: 125 });
    assert.equal(chunk.heights.length, 25);
    assert.equal(fixture.requests.length, 2);
});

test('Landscape model: corrupt hashes, truncated payloads, and oversized bodies fail without replacing a prior result', async () => {
    const fixture = createLandscapeModelFixture();
    const initial = await loadLandscapeOverview(URL, { fetchImpl: fixture.fetchImpl });
    const key = 'chunks/l0/c0/r0.height.bin';
    const original = fixture.resources.get(key);
    const corrupt = original.slice();
    corrupt[0] ^= 1;
    fixture.resources.set(key, corrupt);
    await assert.rejects(loadLandscapeOverview(URL, { fetchImpl: fixture.fetchImpl }), /SHA-256 mismatch/);
    assert.deepEqual(initial.chunk.heights, fixture.decoded.get('l0/c0/r0').heights);
    fixture.resources.set(key, original.subarray(0, -1));
    await assert.rejects(loadLandscapeOverview(URL, { fetchImpl: fixture.fetchImpl }), /truncated/);
    fixture.resources.set(key, new Uint8Array(original.length + 1));
    await assert.rejects(loadLandscapeOverview(URL, { fetchImpl: fixture.fetchImpl }), /exceeds/);
    await assert.rejects(loadLandscapeManifest(URL, { fetchImpl: async () => new Response('', { headers: { 'content-length': String(LANDSCAPE_MANIFEST_BYTE_LIMIT + 1) } }) }), /Content-Length/);
});

test('Landscape model: aborted acquisition does not dispatch a payload request', async () => {
    const fixture = createLandscapeModelFixture();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(loadLandscapeChunk(fixture.manifest, fixture.manifest.overviewId, { manifestUrl: URL, fetchImpl: fixture.fetchImpl, signal: controller.signal }), { name: 'AbortError' });
    assert.deepEqual(fixture.requests, []);
});
