// Verifies terrain-field streaming beside mask pages: layer mapping, progress packing, eviction, staleness, failures, budgets and the GLSL mirror,
// and (AI577 D5) the landscape-scale appearance layer derived in the worker with the root page.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_TERRAIN_FIELD_CHANNELS, LANDSCAPE_TERRAIN_FIELDS_FILTER, LANDSCAPE_TERRAIN_FIELDS_HORIZON, LANDSCAPE_TERRAIN_FIELDS_STALE_GRID, LandscapeResidencyBudget,
    landscapeTerrainFieldsLayout, landscapeTerrainSkyVisibility, sampleLandscapeTerrainFieldPage, validateLandscapeManifest } from '../../../src/app/landscape/index.js';
import { LANDSCAPE_TERRAIN_FIELD_RUNTIME, LandscapeTerrainFieldPages, landscapeTerrainFieldMeta, landscapeTerrainFieldProgress } from '../../../src/graphics/engine3d/landscape/LandscapeTerrainFieldPages.js';
import { buildLandscapeAppearanceLayer, landscapeAppearanceLayerWorkBytes, landscapePlanningCoverMask } from '../../../src/graphics/engine3d/landscape/LandscapeTerrainAppearance.js';
import { readLandscapeFileChunk } from '../../../tools/landscape_authoring/LandscapeFileIO.mjs';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const cacheSkip = landscapeCacheSkip(['manifest.json', 'fields/manifest.json']);
const directory = path.resolve('assets/public/landscape/coastal-city');
const manifestBytes = cacheSkip ? null : await readFile(path.join(directory, 'manifest.json'));
const manifest = cacheSkip ? null : validateLandscapeManifest(JSON.parse(manifestBytes));
const sidecarBytes = cacheSkip ? null : await readFile(path.join(directory, 'fields/manifest.json'));
const sidecar = cacheSkip ? null : JSON.parse(sidecarBytes);
const pageBytes = new Map();
const pageOf = async id => {
    const entry = sidecar.pages.find(page => page.id === id).fields;
    if (!pageBytes.has(entry.url)) pageBytes.set(entry.url, new Uint8Array(await readFile(path.join(directory, 'fields', entry.url))));
    return pageBytes.get(entry.url);
};
const rootChunk = cacheSkip ? null : await readLandscapeFileChunk(directory, manifest, manifest.overviewId);
const vector = (x = 0, y = 0, z = 0, w = 0) => ({ x, y, z, w, set(a, b, c, d) { Object.assign(this, { x: a, y: b, z: c, w: d }); return this; } });

function harness({ fetchBody = sidecarBytes, status = 200, landscape = manifest, budget = {}, mode = 'auto', failFirst = false, layerFails = false } = {}) {
    const uniforms = { uMaskMeta: { value: Array.from({ length: 81 }, () => vector(-1)) }, uMaskBounds: { value: Array.from({ length: 81 }, () => vector()) },
        uMaskSlotRanges: { value: { x: 17, y: 0, z: 0 } }, uTerrainFields: { value: null }, uTerrainFieldsState: { value: new Uint32Array(4) } };
    const records = new Map(), uploads = [], requests = [];
    const masks = { records, capacity: 17, layout: { width: 261, halo: 2 } };
    const shared = new LandscapeResidencyBudget({ cpuBytes: 512 * 1024 * 1024, gpuBytes: 256 * 1024 * 1024, ...budget });
    let failures = failFirst ? 1 : 0;
    const pool = { request: async payload => {
        if (payload.type === 'appearance-layer') {
            requests.push('appearance-layer');
            if (layerFails) throw new Error('simulated derivation failure');
            return buildLandscapeAppearanceLayer(structuredClone(payload.input));
        }
        requests.push(payload.page.url);
        if (failures-- > 0) throw new Error('simulated worker failure');
        const id = sidecar.pages.find(page => page.fields.url === payload.page.url).id;
        return { bytes: Uint8Array.from(await pageOf(id)) };
    } };
    const createTexture = ({ pixels, width, height, depth }) => ({ image: { data: pixels, width, height, depth }, layers: new Set(), needsUpdate: false, disposed: false,
        addLayerUpdate(layer) { this.layers.add(layer); }, clearLayerUpdates() { this.layers.clear(); }, dispose() { this.disposed = true; } });
    const renderer = { initTexture: texture => uploads.push([...texture.layers]) };
    const fetchImpl = async () => new Response(fetchBody, { status });
    const fields = new LandscapeTerrainFieldPages({ loaded: { manifest: landscape, chunk: rootChunk }, shared, masks, pool, renderer, uniforms, prefix: 'appearance/test', url: 'https://fixture/coastal/fields/manifest.json',
        mode, createTexture, fetchImpl });
    const place = (id, slot, statusValue = 'resident') => {
        const descriptor = landscape.chunks.find(chunk => chunk.id === id);
        records.set(id, { id, kind: 'native', slot, status: statusValue, descriptor });
        const b = descriptor.bounds, parent = records.get(descriptor.parentId)?.slot ?? slot;
        uniforms.uMaskBounds.value[slot].set(b.minX, b.maxX, b.minZ, b.maxZ);
        uniforms.uMaskMeta.value[slot].set(descriptor.level, 1, parent, 1);
    };
    const settle = async () => {
        for (let i = 0; i < 4000; i++) {
            fields.update(.05, 8 * 1024 * 1024);
            await new Promise(resolve => setTimeout(resolve, 1));
            if (i > 8 && fields.snapshot().settled) return;
        }
        throw new Error('terrain field pages did not settle');
    };
    return { fields, uniforms, records, uploads, requests, shared, place, settle };
}

test('Terrain field pages: pages follow resident mask slots into layers 4s..4s+3 and arrive through the packed uMaskMeta.w fade', { skip: cacheSkip }, async () => {
    const h = harness();
    await h.fields.initialize();
    assert.equal(h.fields.status, 'active');
    assert.deepEqual([...h.uniforms.uTerrainFieldsState.value], [0, 0, 1, 4]);
    h.place('l0/c0/r0', 0); h.place('l1/c0/r1', 3); h.place('l2/c1/r2', 6);
    await h.settle();
    assert.deepEqual(h.uploads.map(layers => layers.sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]), [[0, 1, 2, 3, 68], [12, 13, 14, 15], [24, 25, 26, 27]],
        'one page per upload at slot * 4 + k; the appearance layer (after the 17 x 4 page layers) uploads with the root page');
    for (const slot of [0, 3, 6]) assert.equal(h.uniforms.uMaskMeta.value[slot].w, 1.25);
    const layout = landscapeTerrainFieldsLayout(257), page = await pageOf('l1/c0/r1');
    assert.deepEqual(h.fields.pixels.subarray(3 * layout.pageBytes, 4 * layout.pageBytes), page);
    const snapshot = h.fields.snapshot();
    assert.equal(snapshot.residentPages.length, 3);
    assert.equal(snapshot.settled, true);
    assert.equal(snapshot.bytes.arrayGpu, 17 * layout.pageBytes + layout.layerBytes);
    assert.equal(h.shared.snapshot().entries.filter(entry => entry.kind === 'terrain-fields-decode').length, 0, 'decode reservations end with the upload');
    assert.equal(h.shared.snapshot().entries.filter(entry => entry.kind === 'terrain-appearance-layer-derivation').length, 0, 'the derivation reservation ends with it');
    assert.ok(snapshot.uploads.peakBytesPerFrame <= layout.pageBytes + layout.layerBytes);
    // AI577 D5: the derived layer is resident (state bit 1) and byte-identical to a direct derivation from the root page, heights and cover
    assert.equal(h.uniforms.uTerrainFieldsState.value[2], 3);
    assert.equal(snapshot.appearanceLayerState.status, 'resident');
    assert.equal(snapshot.appearanceLayer.layer, 68);
    const expected = buildLandscapeAppearanceLayer({ fieldPage: await pageOf('l0/c0/r0'), layout, heights: rootChunk.heights, cover: rootChunk.landCover,
        planningMask: landscapePlanningCoverMask(manifest.landCover.catalog), staleCells: [0, 0], bounds: rootChunk.descriptor.bounds });
    assert.deepEqual(h.fields.pixels.subarray(68 * layout.layerBytes, 69 * layout.layerBytes), expected.bytes);
    assert.deepEqual(h.fields.appearanceLayerSource().offset, 68 * layout.layerBytes);
    assert.ok(Math.abs(landscapeTerrainFieldProgress(landscapeTerrainFieldMeta(.4)) - .4) < 1e-12);
    assert.equal(landscapeTerrainFieldProgress(2), 0, 'fine slots carry no field');
});

test('Terrain field pages: the JavaScript sampler reads exactly the uploaded bytes through the shader slot walk', { skip: cacheSkip }, async () => {
    const h = harness();
    await h.fields.initialize();
    h.place('l0/c0/r0', 0); h.place('l1/c0/r1', 2); h.place('l2/c1/r2', 5); h.place('l3/c2/r5', 9);
    await h.settle();
    const native = manifest.chunks.find(chunk => chunk.id === 'l3/c2/r5'), x = native.bounds.minX + 123.4, z = native.bounds.minZ + 321.7;
    const sample = h.fields.sample(x, z), layout = landscapeTerrainFieldsLayout(257);
    const expected = sampleLandscapeTerrainFieldPage(await pageOf('l3/c2/r5'), 0, layout, native.bounds, x, z);
    assert.equal(sample.availability, 1);
    assert.deepEqual(sample.contributions.map(entry => entry.slot), [9]);
    sample.units.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-12));
    const far = h.fields.sample(x, z, { dx: [40, 0], dy: [0, 0] });
    assert.deepEqual(far.contributions.map(entry => entry.level), [0], 'a 40 m footprint is served by the 15.6 m root page');
    const sun = h.fields.sample(x, z, { sunDirection: { x: .4056, y: .8192, z: .4056 } });
    assert.ok(sun.sunVisibility >= 0 && sun.sunVisibility <= 1);
    assert.ok(landscapeTerrainSkyVisibility(sample.fields.skyView, { x: 0, y: 1, z: 0 }) <= 1);
});

test('Terrain field pages: an evicted or moved mask page takes its field page with it', { skip: cacheSkip }, async () => {
    const h = harness();
    await h.fields.initialize();
    h.place('l0/c0/r0', 0); h.place('l1/c1/r0', 1);
    await h.settle();
    assert.equal(h.fields.snapshot().residentPages.length, 2);
    h.records.delete('l1/c1/r0'); h.uniforms.uMaskMeta.value[1].set(-1, 0, 0, 0);
    h.fields.update(.05, 8 * 1024 * 1024);
    assert.deepEqual(h.fields.snapshot().residentPages.map(page => page.id), ['l0/c0/r0']);
    assert.equal(h.uniforms.uMaskMeta.value[1].w, 0, 'no field progress is written for a vacated slot');
    h.place('l1/c1/r0', 4);
    await h.settle();
    assert.deepEqual(h.fields.snapshot().residentPages.map(page => [page.id, page.slot]).sort(), [['l0/c0/r0', 0], ['l1/c1/r0', 4]]);
    assert.equal(h.fields.snapshot().evicted, 1);
});

test('Terrain field pages: edited chunks are never loaded, their cells are flagged and ancestors stay partially usable', { skip: cacheSkip }, async () => {
    const edited = structuredClone(JSON.parse(manifestBytes)), target = edited.chunks.find(chunk => chunk.id === 'l3/c2/r5');
    target.channels.height.sha256 = 'c'.repeat(64); edited.revision = 'edited-terrain';
    const h = harness({ landscape: validateLandscapeManifest(edited) });
    await h.fields.initialize();
    assert.equal(h.fields.status, 'active-partial');
    h.place('l0/c0/r0', 0); h.place('l3/c2/r5', 7);
    await h.settle();
    const snapshot = h.fields.snapshot();
    assert.deepEqual(snapshot.staleChunks, ['l3/c2/r5']);
    assert.deepEqual(snapshot.residentPages.map(page => [page.id, page.state]), [['l0/c0/r0', 'partial']]);
    const bit = 5 * LANDSCAPE_TERRAIN_FIELDS_STALE_GRID + 2;
    assert.equal((h.uniforms.uTerrainFieldsState.value[bit >> 5] >>> (bit & 31)) & 1, 1);
    const inside = h.fields.sample(target.bounds.minX + 10, target.bounds.minZ + 10), outside = h.fields.sample(100, 100);
    assert.equal(inside.availability, 0, 'a stale cell falls back to analytic terms');
    assert.equal(outside.availability, 1, 'the partial root page still serves fresh cells');
});

test('Terrain field pages: a failed page retries once, absent, invalid, mismatched and disabled sidecars are explicit', { skip: cacheSkip }, async () => {
    const h = harness({ failFirst: true });
    await h.fields.initialize();
    h.place('l0/c0/r0', 0);
    h.fields.update(.05, 8 * 1024 * 1024);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.fields.snapshot().failures[0].attempts, 1);
    h.fields.failures.get('l0/c0/r0').retryAt = 0;
    await h.settle();
    assert.equal(h.fields.snapshot().residentPages.length, 1);
    const absent = harness({ status: 404, fetchBody: '' }); await absent.fields.initialize();
    assert.deepEqual([absent.fields.status, absent.fields.reason], ['absent', 'terrain-fields-404']);
    const invalid = harness({ fetchBody: '{"format":"landscape-terrain-fields"}' }); await invalid.fields.initialize();
    assert.equal(invalid.fields.status, 'invalid');
    const other = structuredClone(JSON.parse(manifestBytes)); other.coordinates.seaLevel = 2;
    const mismatch = harness({ landscape: validateLandscapeManifest(other) }); await mismatch.fields.initialize();
    assert.equal(mismatch.fields.status, 'binding-mismatch');
    const off = harness({ mode: 'off' }); await off.fields.initialize();
    assert.equal(off.fields.status, 'disabled');
    for (const value of [absent, invalid, mismatch, off]) assert.equal(value.shared.snapshot().cpuBytes, 0, `${value.fields.status} holds no bytes`);
});

test('Terrain field pages: a failed or unaffordable appearance-layer derivation keeps the root page and leaves the layer absent', { skip: cacheSkip }, async () => {
    const failed = harness({ layerFails: true });
    await failed.fields.initialize();
    failed.place('l0/c0/r0', 0);
    await failed.settle();
    assert.deepEqual(failed.fields.snapshot().residentPages.map(page => page.id), ['l0/c0/r0']);
    assert.equal(failed.uniforms.uTerrainFieldsState.value[2], 1, 'fields active, layer bit clear: every terrain-appearance term stays neutral');
    assert.equal(failed.fields.snapshot().appearanceLayerState.status, 'failed');
    assert.equal(failed.fields.appearanceLayerSource(), null);
    assert.equal(failed.shared.snapshot().entries.filter(entry => entry.kind === 'terrain-appearance-layer-derivation').length, 0);
    // 200 MiB: the array and one decode fit the one-eighth ceiling, the derivation's working memory does not
    const layout = landscapeTerrainFieldsLayout(257), denied = harness({ budget: { cpuBytes: 200 * 1024 * 1024, gpuBytes: 256 * 1024 * 1024 } });
    await denied.fields.initialize();
    assert.ok(17 * layout.pageBytes + layout.layerBytes + 2 * layout.pageBytes + landscapeAppearanceLayerWorkBytes(257) > denied.fields.ceiling.cpuBytes);
    denied.place('l0/c0/r0', 0);
    await denied.settle();
    assert.deepEqual([denied.fields.snapshot().appearanceLayerState.status, denied.uniforms.uTerrainFieldsState.value[2]], ['budget-denied', 1]);
    assert.deepEqual(denied.fields.snapshot().residentPages.map(page => page.id), ['l0/c0/r0']);
    assert.ok(!denied.requests.includes('appearance-layer'), 'no derivation runs without its reservation');
});

test('Terrain field pages: the array has its own ceiling, constrained profiles are budget-denied and disposal releases everything', { skip: cacheSkip }, async () => {
    const small = harness({ budget: { cpuBytes: 128 * 1024 * 1024, gpuBytes: 64 * 1024 * 1024 } });
    await small.fields.initialize();
    assert.deepEqual([small.fields.status, small.fields.reason], ['budget-denied', 'terrain-fields-ceiling']);
    const h = harness();
    await h.fields.initialize();
    h.place('l0/c0/r0', 0); h.place('l1/c0/r0', 1);
    await h.settle();
    const totals = h.fields.totals();
    assert.ok(totals.gpuBytes <= h.fields.ceiling.gpuBytes && totals.cpuBytes <= h.fields.ceiling.cpuBytes);
    assert.equal(h.fields.ceiling.gpuBytes, 256 * 1024 * 1024 * LANDSCAPE_TERRAIN_FIELD_RUNTIME.budgetShare);
    const texture = h.fields.texture;
    h.fields.dispose();
    assert.equal(h.shared.snapshot().cpuBytes, 0);
    assert.equal(h.shared.snapshot().gpuBytes, 0);
    assert.equal(texture.disposed, true);
    assert.equal(h.uniforms.uTerrainFields.value, null);
});

test('Terrain field pages: the GLSL chunk declares one sampler and one uvec4 and mirrors every JavaScript constant', async () => {
    const source = await readFile(path.resolve('src/graphics/shaders/chunks/landscape/terrain_fields.glsl'), 'utf8');
    const constant = name => Number(new RegExp(`const float ${name} = ([0-9.e+-]+);`).exec(source)?.[1]);
    const uniforms = [...source.replace(/\/\/[^\n]*/g, '').matchAll(/\buniform\s+(\w+)\s+(\w+)\s*;/g)].map(match => `${match[1]} ${match[2]}`);
    assert.deepEqual(uniforms, ['sampler2DArray uTerrainFields', 'uvec4 uTerrainFieldsState']);
    assert.equal(constant('LANDSCAPE_TERRAIN_FIELD_SHORE_METERS'), LANDSCAPE_TERRAIN_FIELD_CHANNELS.find(channel => channel.name === 'shoreDistance').scale);
    assert.equal(constant('LANDSCAPE_TERRAIN_FIELD_SLOPE_DEGREES'), LANDSCAPE_TERRAIN_FIELD_CHANNELS.find(channel => channel.name === 'slope').scale);
    assert.ok(Math.abs(constant('LANDSCAPE_TERRAIN_FIELD_SOLAR_RADIUS') - LANDSCAPE_TERRAIN_FIELDS_HORIZON.solarRadiusDegrees * Math.PI / 180) < 1e-15);
    assert.equal(constant('LANDSCAPE_TERRAIN_FIELD_COARSER_START'), LANDSCAPE_TERRAIN_FIELDS_FILTER.coarserStartCells);
    assert.equal(constant('LANDSCAPE_TERRAIN_FIELD_COARSER_END'), LANDSCAPE_TERRAIN_FIELDS_FILTER.coarserEndCells);
    assert.equal(constant('LANDSCAPE_TERRAIN_FIELD_PROGRESS_SCALE'), LANDSCAPE_TERRAIN_FIELD_RUNTIME.progressScale);
    assert.equal(constant('LANDSCAPE_TERRAIN_FIELD_STALE_GRID'), LANDSCAPE_TERRAIN_FIELDS_STALE_GRID);
    for (const name of ['landscapeTerrainFieldsAt', 'landscapeTerrainFieldsAtFootprint', 'landscapeTerrainFieldsDecode', 'landscapeTerrainHorizonSine', 'landscapeSolarDiscVisibility',
        'landscapeTerrainFieldsSunVisibility', 'landscapeTerrainFieldsSkyVisibility']) assert.ok(new RegExp(`\\b${name}\\(`).test(source), name);
    // AI577 D5c integration: the terrain program includes the chunk before the lighting hooks; the water and backdrop programs do not
    assert.match(await readFile(path.resolve('src/graphics/shaders/materials/landscape/terrain.frag.glsl'), 'utf8'), /#include <shaderlib:landscape\/terrain_fields>\s+#include <shaderlib:landscape\/lighting_visibility>/);
    for (const program of ['water.frag.glsl', 'backdrop.frag.glsl']) assert.ok(!(await readFile(path.resolve(`src/graphics/shaders/materials/landscape/${program}`), 'utf8')).includes('terrain_fields'), `${program} keeps neutral hooks`);
    assert.match(source, /#define LANDSCAPE_TERRAIN_FIELDS 1/);
});
