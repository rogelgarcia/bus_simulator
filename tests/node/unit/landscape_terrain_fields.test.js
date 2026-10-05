// Verifies the terrain-fields contract and bake on a synthetic landscape: strict sidecar, staleness, loaders, sampling, publication and imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { LANDSCAPE_TERRAIN_FIELD_CHANNELS, LandscapeTerrainFieldsBindingError, decodeLandscapeTerrainField, decodeLandscapeTerrainFields, encodeLandscapeTerrainField,
    landscapeSolarDiscVisibility, landscapeTerrainFieldStaleAt, landscapeTerrainFieldsLayout, landscapeTerrainFieldsStaleness, landscapeTerrainHorizonSine, landscapeTerrainSunVisibility,
    loadLandscapeTerrainFieldPage, loadLandscapeTerrainFields, sampleLandscapeTerrainFieldPage, sampleLandscapeTerrainFieldSlots, validateLandscapeTerrainFields } from '../../../src/app/landscape/index.js';
import { readLandscapeFileManifest } from '../../../tools/landscape_authoring/LandscapeFileIO.mjs';
import { createLandscapeAuthoringStore } from '../../../tools/landscape_authoring/LandscapeAuthoringStore.mjs';
import { prepareTerrainFields, publishTerrainFields, validateTerrainFieldsCandidate } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsPreparation.mjs';
import { decodeGrayscalePng } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsImports.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = path.join(root, 'tests/artifacts/screens/landscape/ai577/d5/terrain-fields-tests');
const recipeFile = path.join(root, 'tools/bake_landscape/terrain_fields/recipe-v1.json');
await mkdir(evidence, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function reorder(value) {
    if (Array.isArray(value)) return value.map(reorder);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reorder(entry)]));
}

async function fixture() {
    // 65 x 65 native samples at 2 m: sea in the west, a ridge, a hollow and a planning block (cover 5) inside forest
    const source = createLandscapeModelFixture({ chunkIntervals: 16, maxLevel: 2, minX: 0, minZ: 0, spacing: 2,
        heightAt: (c, r) => Math.fround(c < 12 ? (c - 12) * .4 : (c - 12) * .3 + 3 * Math.exp(-((c - 45) ** 2 + (r - 20) ** 2) / 40) - 2 * Math.exp(-((c - 30) ** 2 + (r - 45) ** 2) / 30)),
        coverAt: (c, r) => c < 12 ? 0 : c < 17 ? 1 : (c >= 36 && c < 52 && r >= 36 && r < 56) ? 5 : c < 28 ? 2 : 3 });
    const parent = await mkdtemp(path.join(evidence, 'fixture-')), directory = path.join(parent, 'saved');
    for (const [url, bytes] of source.resources) { const file = path.join(directory, url); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
    return { ...source, directory, parent };
}

async function prepare(value, label = 'candidate', options = {}) {
    const source = await readLandscapeFileManifest(value.directory);
    return prepareTerrainFields({ directory: value.directory, outputDirectory: path.join(value.parent, label), source, recipeFile, ...options });
}

const shared = await (async () => { const value = await fixture(); return { value, prepared: await prepare(value) }; })();

test('Terrain fields: preparation validates every page, binds the exact terrain and rebuilds byte for byte', async () => {
    const { value, prepared } = shared, checked = await validateTerrainFieldsCandidate(prepared);
    assert.equal(prepared.report.determinism.verified, true);
    assert.equal(prepared.value.pages.length, value.manifest.chunks.length);
    assert.equal(prepared.value.terrain.revision, value.manifest.revision);
    assert.ok(checked.checks.shoreSamples > 0 && checked.checks.borderTexels > 0 && checked.checks.coarseTexels > 0);
    const again = await prepare(value, 'rebuild');
    assert.ok((await readFile(again.sidecarFile)).equals(await readFile(prepared.sidecarFile)), 'identical inputs give identical sidecar bytes');
    for (const page of prepared.value.pages) {
        assert.ok((await readFile(path.join(again.outputDirectory, page.fields.url))).equals(await readFile(path.join(prepared.outputDirectory, page.fields.url))));
    }
    assert.ok(prepared.report.memory.peakTrackedBytes > 0 && prepared.report.memory.peakTrackedBytes <= prepared.report.memory.limitBytes);
    const planning = prepared.value.pages.filter(page => page.naturalSoil), withoutPlanning = prepared.value.pages.filter(page => !page.naturalSoil);
    assert.ok(planning.length > 0 && withoutPlanning.length > 0, 'natural soil pages exist only where planning cover is sampled');
});

test('Terrain fields: the sidecar is strict, key-order independent and reports typed binding errors', async () => {
    const { value, prepared } = shared, sidecar = JSON.parse(await readFile(prepared.sidecarFile, 'utf8'));
    assert.deepEqual(await validateLandscapeTerrainFields(reorder(sidecar), reorder(value.manifest)), await validateLandscapeTerrainFields(sidecar, value.manifest));
    const mutated = change => { const copy = structuredClone(sidecar); change(copy); return copy; };
    const rejections = {
        'unknown top-level field': copy => { copy.extra = 1; },
        'unknown page field': copy => { copy.pages[0].note = 'x'; },
        'missing statistics key': copy => { delete copy.statistics.shore; },
        'channel map': copy => { copy.channels[5].scale = 128; },
        'channel order': copy => { copy.channels.reverse(); },
        'layout': copy => { copy.layout.halo = 1; },
        'content key': copy => { copy.pages[1].contentKey = 'a'.repeat(64); },
        'page size': copy => { copy.pages[0].fields.byteLength--; },
        'revision form': copy => { copy.revision = 'terrain-fields-latest'; },
        'measured claim': copy => { copy.provenance.measured = true; },
        'horizon azimuths': copy => { copy.horizon.azimuthsDegrees[1] = 40; },
        'native binding': copy => { copy.terrain.chunks.pop(); }
    };
    for (const [label, change] of Object.entries(rejections)) {
        await assert.rejects(validateLandscapeTerrainFields(mutated(change), value.manifest), error => !(error instanceof LandscapeTerrainFieldsBindingError), label);
    }
    const other = structuredClone(value.manifest); other.id = 'another-landscape';
    await assert.rejects(validateLandscapeTerrainFields(sidecar, other), LandscapeTerrainFieldsBindingError);
    const sea = structuredClone(value.manifest); sea.coordinates.seaLevel = 1;
    await assert.rejects(validateLandscapeTerrainFields(sidecar, sea), LandscapeTerrainFieldsBindingError);
    const revised = structuredClone(value.manifest); revised.revision = 'materials-only-revision';
    const staleness = landscapeTerrainFieldsStaleness(await validateLandscapeTerrainFields(sidecar, revised), revised);
    assert.equal(staleness.bound, false);
    assert.deepEqual(staleness.staleChunks, [], 'a revision change without channel changes keeps every page fresh');
});

test('Terrain fields: an edited native chunk is stale, its ancestors partial, and only its 8 x 8 cells fall back', async () => {
    const { value, prepared } = shared, edited = structuredClone(value.manifest), target = edited.chunks.find(chunk => chunk.id === 'l2/c1/r2');
    target.channels.height.sha256 = 'b'.repeat(64); edited.revision = 'edited-revision';
    const staleness = landscapeTerrainFieldsStaleness(prepared.value, edited);
    assert.deepEqual(staleness.staleChunks, ['l2/c1/r2']);
    assert.equal(staleness.pages['l2/c1/r2'], 'stale');
    assert.equal(staleness.pages['l0/c0/r0'], 'partial');
    assert.equal(staleness.pages['l2/c0/r0'], 'fresh');
    const bounds = prepared.value.terrain.bounds, cell = (bounds.maxX - bounds.minX) / 4;
    assert.equal(landscapeTerrainFieldStaleAt(staleness.staleCells, bounds, bounds.minX + 1.5 * cell, bounds.maxZ - 2.5 * cell), true);
    assert.equal(landscapeTerrainFieldStaleAt(staleness.staleCells, bounds, bounds.minX + .5 * cell, bounds.maxZ - .5 * cell), false);
    const bits = staleness.staleCells[0] + staleness.staleCells[1] * 2 ** 32;
    assert.equal([...bits.toString(2)].filter(bit => bit === '1').length, 4, 'a native chunk of a 4 x 4 grid covers 2 x 2 stale cells');
});

test('Terrain fields: an authored height edit makes exactly its changed native chunks stale and a soil-only edit stales nothing', async () => {
    const value = await fixture(), prepared = await prepare(value, 'authoring', { verifyDeterminism: false }), store = createLandscapeAuthoringStore({ directory: value.directory });
    const raise = { format: 'landscape-edit-batch', schemaVersion: 1, id: 'fields-raise', landscapeId: value.manifest.id, expectedRevision: value.manifest.revision,
        operations: [{ id: 'fields-raise/hill', type: 'raise', region: { type: 'circle', center: { x: 90, z: 40 }, radius: 6 }, falloff: { type: 'linear', distance: 3 }, deltaMeters: 2 }] };
    const applied = await store.apply(raise), edited = (await readLandscapeFileManifest(value.directory)).manifest;
    const staleness = landscapeTerrainFieldsStaleness(prepared.value, edited);
    assert.ok(applied.summary.changedNativeIds.length > 0);
    assert.deepEqual([...staleness.staleChunks].sort(), [...applied.summary.changedNativeIds].sort(), 'stale chunks are exactly the natives whose heights changed');
    assert.equal(staleness.bound, false);
    assert.ok(Object.values(staleness.pages).includes('fresh'), 'unaffected chunks keep valid fields');
    const soil = { format: 'landscape-edit-batch', schemaVersion: 1, id: 'fields-soil', landscapeId: value.manifest.id, expectedRevision: edited.revision,
        operations: [{ id: 'fields-soil/sand', type: 'assign-soil', region: { type: 'circle', center: { x: 20, z: 100 }, radius: 5 }, falloff: { type: 'none' }, soilId: 'sand' }] };
    await store.apply(soil);
    const repainted = (await readLandscapeFileManifest(value.directory)).manifest;
    assert.deepEqual([...landscapeTerrainFieldsStaleness(prepared.value, repainted).staleChunks].sort(), [...applied.summary.changedNativeIds].sort(), 'soil overrides never stale fields');
});

test('Terrain fields: encoders round-trip, keep the shore sign exact and the solar disc visibility is a circular segment', () => {
    for (const definition of LANDSCAPE_TERRAIN_FIELD_CHANNELS) for (let byte = 0; byte < 256; byte++) {
        assert.equal(encodeLandscapeTerrainField(definition, decodeLandscapeTerrainField(definition, byte / 255)), byte, `${definition.name} byte ${byte}`);
    }
    const shore = LANDSCAPE_TERRAIN_FIELD_CHANNELS[5];
    for (const value of [-1e-30, -0, -.001, -300]) assert.ok(encodeLandscapeTerrainField(shore, value) <= 127, `${value} stays water`);
    for (const value of [0, 1e-30, .001, 300]) assert.ok(encodeLandscapeTerrainField(shore, value) >= 128, `${value} stays land`);
    assert.equal(landscapeSolarDiscVisibility(.3, .3), .5);
    assert.equal(landscapeSolarDiscVisibility(.3, .2), 1);
    assert.equal(landscapeSolarDiscVisibility(.2, .3), 0);
    const r = .265 * Math.PI / 180, d = .4;
    assert.ok(Math.abs(landscapeSolarDiscVisibility(d * r, 0) + landscapeSolarDiscVisibility(-d * r, 0) - 1) < 1e-12, 'complementary halves');
    const sines = [.1, .2, .3, .4, .5, .6, .7, .8];
    assert.ok(Math.abs(landscapeTerrainHorizonSine(sines, Math.PI / 8) - .15) < 1e-12);
    assert.ok(Math.abs(landscapeTerrainHorizonSine(sines, -Math.PI / 8) - .45) < 1e-12, 'wraps between 315 and 0 degrees');
    const sun = { x: Math.cos(Math.PI / 4) * Math.cos(.96), y: Math.sin(.96), z: Math.sin(Math.PI / 4) * Math.cos(.96) };
    assert.equal(landscapeTerrainSunVisibility([0, 0, 0, 0, 0, 0, 0, 0], sun), 1);
    assert.equal(landscapeTerrainSunVisibility([0, .99, 0, 0, 0, 0, 0, 0], sun), 0, 'a 82 degree horizon at 45 degrees hides a 55 degree sun');
});

test('Terrain fields: the page sampler is bilinear on encoded bytes and the slot walk honours progress, footprint, staleness and inactivity', async () => {
    const { prepared, value } = shared, layout = landscapeTerrainFieldsLayout(prepared.value.terrain.grid.chunkIntervals + 1);
    const page = prepared.value.pages.find(entry => entry.id === 'l2/c2/r1'), bytes = await readFile(path.join(prepared.outputDirectory, page.fields.url));
    const chunk = value.manifest.chunks.find(entry => entry.id === page.id), b = chunk.bounds, spacing = (b.maxX - b.minX) / (layout.samples - 1);
    const x = b.minX + 3.25 * spacing, z = b.maxZ - 5.5 * spacing, units = sampleLandscapeTerrainFieldPage(bytes, 0, layout, b, x, z);
    for (let k = 0; k < 16; k++) {
        const texel = (tx, ty) => bytes[(k >> 2) * layout.layerBytes + ((ty + layout.halo) * layout.width + tx + layout.halo) * 4 + (k & 3)] / 255;
        const expected = (texel(3, 5) * .75 + texel(4, 5) * .25) * .5 + (texel(3, 6) * .75 + texel(4, 6) * .25) * .5;
        assert.ok(Math.abs(units[k] - expected) < 1e-12);
    }
    const root = value.manifest.chunks.find(entry => entry.id === 'l0/c0/r0'), rootBytes = await readFile(path.join(prepared.outputDirectory, prepared.value.pages.find(entry => entry.id === root.id).fields.url));
    const slots = [{ bounds: root.bounds, level: 0, parent: 0, fieldProgress: 1, native: true, active: true }, { bounds: chunk.bounds, level: 2, parent: 0, fieldProgress: .25, native: true, active: true }];
    const source = { slots, rootBounds: root.bounds, staleCells: [0, 0], active: true, samples: layout.samples,
        fetch: (slot, px, pz, out) => sampleLandscapeTerrainFieldPage(slot === 0 ? rootBytes : bytes, 0, layout, slots[slot].bounds, px, pz, out) };
    const arriving = sampleLandscapeTerrainFieldSlots(source, x, z);
    assert.equal(arriving.availability, 1);
    assert.deepEqual(arriving.contributions.map(entry => [entry.slot, entry.weight]), [[1, .25], [0, .75]]);
    const far = sampleLandscapeTerrainFieldSlots(source, x, z, { dx: [spacing * 3, 0], dy: [0, 0] });
    assert.deepEqual(far.contributions.map(entry => entry.slot), [0], 'a footprint of three child spacings is served by the coarser page');
    assert.equal(sampleLandscapeTerrainFieldSlots({ ...source, staleCells: [0xffffffff, 0xffffffff] }, x, z).availability, 0);
    assert.equal(sampleLandscapeTerrainFieldSlots({ ...source, active: false }, x, z).fields, null);
    const fields = decodeLandscapeTerrainFields(arriving.units);
    assert.ok(fields.skyView > 0 && fields.skyView <= 1 && fields.horizonSine.length === 8);
});

test('Terrain fields: the sidecar loader treats only 404 as absent and the page loader authenticates size and hash', async () => {
    const { prepared, value } = shared, bytes = await readFile(prepared.sidecarFile), url = 'https://fixture/landscape/fields/manifest.json';
    const respond = (body, init) => async () => new Response(body, init);
    assert.equal(await loadLandscapeTerrainFields(url, { landscape: value.manifest, fetchImpl: respond('', { status: 404 }) }), null);
    await assert.rejects(loadLandscapeTerrainFields(url, { landscape: value.manifest, fetchImpl: respond('', { status: 500 }) }), /HTTP 500/);
    await assert.rejects(loadLandscapeTerrainFields(url, { landscape: value.manifest, fetchImpl: respond('{"format":', { status: 200 }) }), /not valid UTF-8 JSON/);
    const other = structuredClone(value.manifest); other.id = 'another-landscape';
    await assert.rejects(loadLandscapeTerrainFields(url, { landscape: other, fetchImpl: respond(bytes, { status: 200 }) }), LandscapeTerrainFieldsBindingError);
    const loaded = await loadLandscapeTerrainFields(url, { landscape: value.manifest, fetchImpl: respond(bytes, { status: 200 }) });
    assert.equal(loaded.revision, prepared.value.revision);
    const entry = prepared.value.pages[0].fields, payload = await readFile(path.join(prepared.outputDirectory, entry.url));
    assert.equal((await loadLandscapeTerrainFieldPage(entry, { manifestUrl: url, fetchImpl: respond(payload, { status: 200 }) })).length, entry.byteLength);
    const corrupt = Uint8Array.from(payload); corrupt[7] ^= 1;
    await assert.rejects(loadLandscapeTerrainFieldPage(entry, { manifestUrl: url, fetchImpl: respond(corrupt, { status: 200 }) }), /SHA-256 mismatch/);
    await assert.rejects(loadLandscapeTerrainFieldPage(entry, { manifestUrl: url, fetchImpl: respond(payload.subarray(1), { status: 200 }) }), /truncated/);
});

test('Terrain fields: publication installs pages and snapshot before the current sidecar and refuses a changed terrain or another landscape', async () => {
    const value = await fixture(), prepared = await prepare(value, 'publish', { verifyDeterminism: false }), terrainBefore = await readFile(path.join(value.directory, 'manifest.json'));
    const installed = await publishTerrainFields(prepared), fields = path.join(value.directory, 'fields');
    assert.ok((await readFile(path.join(fields, 'manifest.json'))).equals(await readFile(prepared.sidecarFile)));
    assert.ok((await readFile(path.join(fields, `manifest.${prepared.report.sidecarSha256}.json`))).equals(await readFile(prepared.sidecarFile)));
    assert.equal(installed.at(-1), path.join(fields, 'manifest.json'), 'the current sidecar switches last');
    assert.ok((await readFile(path.join(value.directory, 'manifest.json'))).equals(terrainBefore), 'terrain is never written');
    assert.equal((await readdir(path.join(fields, 'pages'))).length, new Set(prepared.value.pages.flatMap(page => [page.fields.url, page.naturalSoil?.url]).filter(Boolean)).size);
    await publishTerrainFields(prepared);
    const changed = await fixture(), candidate = await prepare(changed, 'changed', { verifyDeterminism: false });
    await writeFile(path.join(changed.directory, 'manifest.json'), Buffer.concat([await readFile(path.join(changed.directory, 'manifest.json')), Buffer.from(' ')]));
    await assert.rejects(publishTerrainFields(candidate), /terrain changed after planning/);
    await assert.rejects(readFile(path.join(changed.directory, 'fields/manifest.json')), { code: 'ENOENT' });
    const foreign = await fixture(), foreignPrepared = await prepare(foreign, 'foreign', { verifyDeterminism: false }), current = JSON.parse(await readFile(foreignPrepared.sidecarFile, 'utf8'));
    current.landscapeId = 'another-landscape';
    await mkdir(path.join(foreign.directory, 'fields'), { recursive: true });
    await writeFile(path.join(foreign.directory, 'fields/manifest.json'), JSON.stringify(current));
    await assert.rejects(publishTerrainFields(foreignPrepared), LandscapeTerrainFieldsBindingError);
});

function grayscalePng(width, height, values, bitDepth = 16) {
    const chunk = (type, data) => {
        const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
        return Buffer.concat([length, body, crc]);
    };
    const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = bitDepth;
    const stride = width * bitDepth / 8, raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = y % 2 ? 2 : 0;
        for (let x = 0; x < width; x++) {
            const value = Math.round(values[y * width + x] * (bitDepth === 16 ? 65535 : 255)), at = y * (stride + 1) + 1 + x * bitDepth / 8;
            if (bitDepth === 16) raw.writeUInt16BE(value, at); else raw[at] = value;
        }
        if (y % 2) for (let x = stride - 1; x >= 0; x--) raw[y * (stride + 1) + 1 + x] = (raw[y * (stride + 1) + 1 + x] - raw[(y - 1) * (stride + 1) + 1 + x] + 256) & 255;
    }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('Terrain fields: a retained 16-bit Gaea-style map overrides its field on land with recorded provenance', async () => {
    const value = await fixture(), { columns, rows } = value.manifest.grid;
    const gradient = Float64Array.from({ length: columns * rows }, (_, i) => (i % columns) / (columns - 1));
    const png = grayscalePng(columns, rows, gradient);
    const decoded = decodeGrayscalePng(png);
    assert.ok(decoded.values.every((v, i) => Math.abs(v - gradient[i]) <= .5 / 65535), 'filtered 16-bit rows decode exactly');
    await writeFile(path.join(value.parent, 'gaea-flow.png'), png);
    const request = { format: 'landscape-terrain-field-imports', schemaVersion: 1, landscapeId: value.manifest.id, maps: [{ id: 'gaea-flow', field: 'flow', file: 'gaea-flow.png',
        encoding: 'png-gray16', mode: 'replace', weight: 1, rowOrder: 'north-first', provenance: { tool: 'Gaea', toolVersion: 'fixture', node: 'Erosion2/Flow', license: 'fixture' } }] };
    const importsFile = path.join(value.parent, 'imports.json');
    await writeFile(importsFile, JSON.stringify(request));
    const prepared = await prepare(value, 'imported', { importsFile, verifyDeterminism: false });
    assert.deepEqual(prepared.value.provenance.imports.map(entry => [entry.id, entry.field, entry.sha256]), [['gaea-flow', 'flow', hash(png)]]);
    const native = prepared.value.pages.find(page => page.id === 'l2/c3/r1'), bytes = await readFile(path.join(prepared.outputDirectory, native.fields.url));
    const layout = landscapeTerrainFieldsLayout(17), chunk = value.manifest.chunks.find(entry => entry.id === native.id), flow = LANDSCAPE_TERRAIN_FIELD_CHANNELS[1];
    for (const sample of [0, 5, 16]) {
        const column = chunk.startColumn + sample, byte = bytes[((layout.halo + 4) * layout.width + sample + layout.halo) * 4 + 1];
        assert.equal(byte, encodeLandscapeTerrainField(flow, decoded.values[(chunk.startRow + 4) * columns + column]));
    }
    request.maps[0].encoding = 'png-gray8';
    await writeFile(importsFile, JSON.stringify(request));
    await assert.rejects(prepare(value, 'wrong-depth', { importsFile, verifyDeterminism: false }), /declares png-gray8 but is 16-bit/);
});
