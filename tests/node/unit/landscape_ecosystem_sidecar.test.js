// Verifies the landscape-ecosystem v1 sidecar (AI 599 D2): the staged candidate, strict validation and binding, tile indexes, content keys, staleness, the loaders with a fixture fetch, the bake registration and the publication round trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { createEcosystemFixture, fixtureRecipe } from './landscape_ecosystem_fixture.js';
import { ECOSYSTEM_TILE_BYTES_PER_INSTANCE, LANDSCAPE_ECOSYSTEM_FORMAT, LANDSCAPE_ECOSYSTEM_TILES_FORMAT, LandscapeEcosystemBindingError, ecosystemCellBounds, ecosystemLayerDependencyMeters, ecosystemRecipeIdentity, ecosystemTileContentInput,
    ecosystemTileContentKey, ecosystemTileStale, landscapeEcosystemLayout, landscapeEcosystemRevision, landscapeEcosystemStaleness, loadLandscapeEcosystem, loadLandscapeEcosystemTile, loadLandscapeEcosystemTiles, validateEcosystemOverrides,
    validateLandscapeEcosystem, validateLandscapeEcosystemTiles } from '../../../src/app/landscape/index.js';
import { readLandscapeFileManifest } from '../../../tools/landscape_authoring/LandscapeFileIO.mjs';
import { prepareTerrainFields, publishTerrainFields } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsPreparation.mjs';
import { openEcosystemLandscape } from '../../../tools/bake_landscape/ecosystem/EcosystemFileSources.mjs';
import { runEcosystemGeneration } from '../../../tools/bake_landscape/ecosystem/EcosystemBake.mjs';
import { publishEcosystemSidecar, readCurrentEcosystem, stageEcosystemSidecar, validateEcosystemCandidate } from '../../../tools/bake_landscape/ecosystem/EcosystemPublication.mjs';
import { ECOSYSTEM_RECEIPT } from '../../../tools/bake_landscape/ecosystem/EcosystemJob.mjs';
import { BLUE_NOISE_RECEIPT } from '../../../tools/bake_landscape/ecosystem/blue_noise/BlueNoiseJob.mjs';
import { planBakes } from '../../../tools/baking/Graph.mjs';
import { parseBakeOptions, resolveBakeOptions } from '../../../tools/baking/Options.mjs';
import { bakeJobs } from '../../../tools/baking/registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), artifacts = path.join(root, 'tests/artifacts/node/ecosystem');
await mkdir(artifacts, { recursive: true });
const RECIPE = fixtureRecipe(recipe => { for (const id of ['boulders', 'shrubs']) recipe.layers[id].cell = { meters: 32, sitesPerAxis: 8 }; recipe.zones = {}; recipe.layers.boulders.rules.exclusions = recipe.layers.boulders.rules.exclusions.filter(entry => entry.zone !== 'pond'); });
const LAYER_IDS = ['boulders', 'shrubs'], reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reorder(entry)])) : value;

// a 128 m landscape (65 x 65 at 2 m, four 32 m native chunks per axis): sea, sand, grass, forest and rock bands with a planning strip, plus a real terrain-fields sidecar
async function fixture(label) {
    const source = createLandscapeModelFixture({ chunkIntervals: 16, maxLevel: 2, minX: 0, minZ: 0, spacing: 2, heightAt: (column, row) => Math.fround(column < 8 ? (column - 8) * .4 : (column - 8) * .2 + 3 * Math.exp(-((column - 40) ** 2 + (row - 30) ** 2) / 60)),
        coverAt: (column, row) => column < 8 ? 0 : column < 16 ? 1 : row >= 50 && row < 53 ? 6 : column < 36 ? 2 : column < 52 ? 3 : 4 });
    const parent = await mkdtemp(path.join(artifacts, `${label}-`)), directory = path.join(parent, 'saved');
    for (const [url, bytes] of source.resources) { const file = path.join(directory, url); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
    const saved = await readLandscapeFileManifest(directory);
    await publishTerrainFields(await prepareTerrainFields({ directory, outputDirectory: path.join(parent, 'fields-stage'), source: saved, recipeFile: path.join(root, 'tools/bake_landscape/terrain_fields/recipe-v1.json'), verifyDeterminism: false }));
    return { ...source, directory, parent, source: saved };
}

async function stage(value, label, { densityScale = 1, overrides = null, layerIds = LAYER_IDS } = {}) {
    const run = await runEcosystemGeneration({ directory: value.directory, source: value.source, recipe: RECIPE, overrides, densityScale, layerIds });
    const prepared = await stageEcosystemSidecar({ landscape: run.landscape, recipe: RECIPE, recipeSha256: 'c'.repeat(64), overrides, densityScale, layers: run.layers, statistics: { layers: run.statistics, gates: run.gates }, outputDirectory: path.join(value.parent, label) });
    return { run, prepared };
}

const shared = await (async () => { const value = await fixture('candidate'); return { value, ...await stage(value, 'stage') }; })();

test('Ecosystem sidecar: the staged candidate embeds the validated recipe, binds the terrain and the fields, lists every layer by priority and validates byte for byte', async () => {
    const { value, run, prepared } = shared, sidecar = prepared.value, checked = await validateEcosystemCandidate(prepared);
    assert.equal(run.gates.passed, true);
    assert.match(sidecar.revision, /^ecosystem-[a-f0-9]{24}$/); assert.equal(sidecar.revision, await landscapeEcosystemRevision(sidecar));
    assert.equal(sidecar.format, LANDSCAPE_ECOSYSTEM_FORMAT); assert.equal(sidecar.landscapeId, value.manifest.id); assert.equal(sidecar.terrain.revision, value.manifest.revision);
    assert.equal(sidecar.dependencies.recipeIdentity, await ecosystemRecipeIdentity(RECIPE)); assert.equal(sidecar.dependencies.overridesIdentity, null);
    assert.match(sidecar.dependencies.fieldsRevision, /^terrain-fields-/); assert.equal(sidecar.dependencies.geologyRevision, null); assert.deepEqual(sidecar.dependencies.planningSha256s, []);
    assert.deepEqual(sidecar.layers.map(entry => [entry.id, entry.generation, entry.tiles === null, entry.priority]), [['boulders', 'offline', false, 30], ['shrubs', 'offline', false, 20], ['scree', 'runtime', true, 10], ['pebbles', 'runtime', true, 5]]);
    for (const entry of sidecar.layers.slice(0, 2)) { assert.ok(entry.instanceCount > 0 && entry.tiles.count > 0 && entry.tiles.url === `layers/${entry.id}.${entry.tiles.sha256}.json`); assert.ok(entry.bounds.minX >= 0 && entry.bounds.maxX <= 128); }
    assert.deepEqual(checked.checks, { indexes: 2, tiles: sidecar.layers[0].tiles.count + sidecar.layers[1].tiles.count, instances: sidecar.layers[0].instanceCount + sidecar.layers[1].instanceCount });
    assert.equal(prepared.report.sidecarBytes, prepared.bytes.length); assert.ok(prepared.report.sidecarBytes < landscapeEcosystemLayout().limits.manifest);
    const again = await stage(value, 'stage-again');
    assert.ok(again.prepared.bytes.equals(prepared.bytes), 'identical inputs give identical sidecar bytes');
    for (const url of prepared.files.keys()) assert.ok((await readFile(path.join(again.prepared.outputDirectory, url))).equals(await readFile(path.join(prepared.outputDirectory, url))), url);
    const index = JSON.parse(await readFile(path.join(prepared.outputDirectory, sidecar.layers[0].tiles.url), 'utf8'));
    assert.equal(index.format, LANDSCAPE_ECOSYSTEM_TILES_FORMAT); assert.equal(index.layer, 'boulders');
    for (const tile of index.tiles) { assert.equal(tile.payload.byteLength, tile.count * ECOSYSTEM_TILE_BYTES_PER_INSTANCE); assert.deepEqual(tile.bounds, ecosystemCellBounds(32, tile.cellX, tile.cellZ)); assert.equal(tile.contentKey, await ecosystemTileContentKey(sidecar, 'boulders', tile.cellX, tile.cellZ)); }
});

test('Ecosystem sidecar: validation is strict and key-order independent, rejects a malformed or mislabeled manifest and reports typed binding errors', async () => {
    const { value, prepared } = shared, sidecar = JSON.parse(prepared.bytes.toString('utf8'));
    assert.deepEqual(await validateLandscapeEcosystem(reorder(sidecar), reorder(value.manifest)), await validateLandscapeEcosystem(sidecar, value.manifest));
    const mutated = change => { const copy = structuredClone(sidecar); change(copy); return copy; };
    const rejections = {
        'unknown top-level field': [copy => { copy.extra = 1; }, /missing or unsupported/],
        'revision form': [copy => { copy.revision = 'ecosystem-latest'; }, /content derived/],
        'raw recipe': [copy => { delete copy.recipe.layers.boulders.alignment; }, /validated form/],
        'recipe identity': [copy => { copy.dependencies.recipeIdentity = `ecosystem-recipe-${'0'.repeat(24)}`; }, /does not identify the embedded recipe/],
        'overrides identity': [copy => { copy.dependencies.overridesIdentity = `ecosystem-overrides-${'0'.repeat(24)}`; }, /does not identify the embedded overrides/],
        'layer order': [copy => { copy.layers.reverse(); }, /descending priority/],
        'layer cell': [copy => { copy.layers[0].cell.meters = 64; }, /disagrees with the recipe/],
        'index url': [copy => { copy.layers[0].tiles.url = 'layers/other.json'; }, /content-addressed index/],
        'runtime tiles': [copy => { copy.layers[2].tiles = copy.layers[0].tiles; copy.layers[2].instanceCount = copy.layers[0].instanceCount; copy.layers[2].bounds = copy.layers[0].bounds; }, /runtime layer scree cannot publish tiles/],
        'density scale': [copy => { copy.densityScale = 17; }, /densityScale/],
        'statistics shape': [copy => { copy.statistics.layers = 3; }, /statistics\.layers must be an object/],
        'measured claim': [copy => { copy.provenance.measured = true; }, /unmeasured/],
        'native binding': [copy => { copy.terrain.chunks.pop(); }, /bind all 16 native chunks/],
        'planning hashes order': [copy => { copy.dependencies.planningSha256s = ['b'.repeat(64), 'a'.repeat(64)]; }, /sorted and distinct/]
    };
    for (const [label, [change, pattern]] of Object.entries(rejections)) await assert.rejects(validateLandscapeEcosystem(mutated(change), value.manifest), error => pattern.test(error.message) && !(error instanceof LandscapeEcosystemBindingError), label);
    const other = structuredClone(value.manifest); other.id = 'another-landscape';
    await assert.rejects(validateLandscapeEcosystem(sidecar, other), LandscapeEcosystemBindingError);
    const sea = structuredClone(value.manifest); sea.coordinates.seaLevel = 1;
    await assert.rejects(validateLandscapeEcosystem(sidecar, sea), LandscapeEcosystemBindingError);
    const revised = structuredClone(value.manifest); revised.revision = 'materials-only-revision';
    const staleness = landscapeEcosystemStaleness(await validateLandscapeEcosystem(sidecar, revised), revised);
    assert.equal(staleness.bound, false); assert.deepEqual(staleness.staleChunks, []);
    const index = JSON.parse(await readFile(path.join(prepared.outputDirectory, sidecar.layers[0].tiles.url), 'utf8')), context = { sidecar: prepared.value, layerId: 'boulders' };
    const mutatedIndex = change => { const copy = structuredClone(index); change(copy); return copy; };
    await validateLandscapeEcosystemTiles(index, context);
    await assert.rejects(validateLandscapeEcosystemTiles(mutatedIndex(copy => { copy.tiles[0].payload.byteLength += 60; }), context), /bytes per instance/);
    await assert.rejects(validateLandscapeEcosystemTiles(mutatedIndex(copy => { copy.tiles[0].payload.url = 'tiles/x.bin'; }), context), /content-addressed payload/);
    await assert.rejects(validateLandscapeEcosystemTiles(mutatedIndex(copy => { copy.tiles[0].contentKey = 'a'.repeat(64); }), context), /contentKey does not match/);
    await assert.rejects(validateLandscapeEcosystemTiles(mutatedIndex(copy => { copy.tiles[0].bounds.minX += 1; }), context), /cell bounds/);
    await assert.rejects(validateLandscapeEcosystemTiles(mutatedIndex(copy => { copy.tiles[1].cellX = copy.tiles[0].cellX; copy.tiles[1].cellZ = copy.tiles[0].cellZ; copy.tiles[1].id = copy.tiles[0].id; }), context), /inconsistent or repeated/);
    await assert.rejects(validateLandscapeEcosystemTiles(mutatedIndex(copy => { copy.tiles.pop(); }), context), /count disagrees/);
    await assert.rejects(validateLandscapeEcosystemTiles(index, { sidecar: prepared.value, layerId: 'shrubs' }), /belong to layer boulders/);
});

test('Ecosystem sidecar: content keys hash exactly the natives within the dependency reach and the override entries of the cell, and staleness follows them', async () => {
    const fixture = createEcosystemFixture(), { manifest, recipe } = fixture, layer = recipe.layers.boulders;
    const terrain = { revision: manifest.revision, manifestSha256: 'd'.repeat(64), seaLevel: 0, bounds: { ...manifest.bounds }, grid: Object.fromEntries(['columns', 'rows', 'spacingX', 'spacingZ', 'chunkIntervals', 'maxLevel'].map(key => [key, manifest.grid[key]])),
        chunks: manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel).map(chunk => ({ id: chunk.id, height: chunk.channels.height.sha256, landCover: chunk.channels.landCover.sha256 })) };
    const dependencies = { recipeIdentity: await ecosystemRecipeIdentity(recipe), overridesIdentity: null, fieldsRevision: null, geologyRevision: null, planningSha256s: [] };
    const sidecar = { recipe, overrides: null, densityScale: 1, terrain, dependencies }, input = JSON.parse(ecosystemTileContentInput(sidecar, 'boulders', 1, 1));
    assert.equal(ecosystemLayerDependencyMeters(recipe, layer), 40);
    assert.deepEqual(input.natives.map(entry => entry[0]), ['l2/c0/r2', 'l2/c1/r2', 'l2/c0/r3', 'l2/c1/r3'], 'cell 1/1 (64..128 m) grown by 40 m touches the four south-western chunks');
    assert.deepEqual([input.algorithm, input.layer, input.cellX, input.cellZ, input.densityScale, input.fieldsRevision, input.overrideRegions], ['landscape-ecosystem-v1', 'boulders', 1, 1, 1, null, []]);
    const key = await ecosystemTileContentKey(sidecar, 'boulders', 1, 1), moved = structuredClone(terrain);
    moved.chunks.find(entry => entry.id === 'l2/c1/r2').height = 'e'.repeat(64);
    assert.notEqual(await ecosystemTileContentKey({ ...sidecar, terrain: moved }, 'boulders', 1, 1), key, 'a native inside the reach changes the key');
    const far = structuredClone(terrain); far.chunks.find(entry => entry.id === 'l2/c3/r0').height = 'e'.repeat(64);
    assert.equal(await ecosystemTileContentKey({ ...sidecar, terrain: far }, 'boulders', 1, 1), key, 'a native outside the reach does not');
    assert.notEqual(await ecosystemTileContentKey({ ...sidecar, densityScale: 2 }, 'boulders', 1, 1), key);
    const overrides = validateEcosystemOverrides({ format: 'landscape-ecosystem-overrides', schemaVersion: 1, id: 'keys', recipe: recipe.id, regions: [{ id: 'denser', region: { type: 'rectangle', minX: 70, maxX: 90, minZ: 70, maxZ: 90 }, layers: { '*': { densityScale: 2 } } }], masks: [],
        instances: { removed: ['boulders:20,20', 'boulders:3,3', 'shrubs:20,20'], pinned: [] } }, recipe);
    const withOverrides = JSON.parse(ecosystemTileContentInput({ ...sidecar, overrides }, 'boulders', 1, 1));
    assert.deepEqual(withOverrides.overrideRegions, ['boulders:20,20', 'denser'], 'the region touching the cell and the removed id of one of its sites, sorted');
    const edited = structuredClone(manifest); edited.chunks.find(chunk => chunk.id === 'l2/c1/r2').channels.height.sha256 = 'f'.repeat(64); edited.revision = 'edited';
    const staleness = landscapeEcosystemStaleness({ terrain }, edited);
    assert.deepEqual([staleness.bound, [...staleness.staleChunks]], [false, ['l2/c1/r2']]); assert.ok(staleness.staleCells.some(bits => bits !== 0));
    assert.equal(ecosystemTileStale(sidecar, edited, 'boulders', { cellX: 1, cellZ: 1 }, staleness), true);
    assert.equal(ecosystemTileStale(sidecar, edited, 'boulders', { cellX: 7, cellZ: 7 }, staleness), false, 'the far north-eastern cell does not read that chunk');
    assert.equal(ecosystemTileStale(sidecar, manifest, 'boulders', { cellX: 1, cellZ: 1 }), false);
});

test('Ecosystem sidecar: the loaders treat only 404 as absent, authenticate every byte and decode tiles', async () => {
    const { value, prepared } = shared, sidecar = prepared.value, url = 'https://fixture/landscape/ecosystem/manifest.json', respond = (body, init) => async () => new Response(body, init);
    const serve = async request => { const relative = new URL(request).pathname.replace('/landscape/ecosystem/', ''); try { return new Response(await readFile(path.join(prepared.outputDirectory, relative)), { status: 200 }); } catch { return new Response('', { status: 404 }); } };
    assert.equal(await loadLandscapeEcosystem(url, { landscape: value.manifest, fetchImpl: respond('', { status: 404 }) }), null);
    await assert.rejects(loadLandscapeEcosystem(url, { landscape: value.manifest, fetchImpl: respond('', { status: 500 }) }), /HTTP 500/);
    await assert.rejects(loadLandscapeEcosystem(url, { landscape: value.manifest, fetchImpl: respond('{"format":', { status: 200 }) }), /not valid UTF-8 JSON/);
    const other = structuredClone(value.manifest); other.id = 'another-landscape';
    await assert.rejects(loadLandscapeEcosystem(url, { landscape: other, fetchImpl: serve }), LandscapeEcosystemBindingError);
    const loaded = await loadLandscapeEcosystem(url, { landscape: value.manifest, fetchImpl: serve });
    assert.equal(loaded.revision, sidecar.revision);
    const entry = loaded.layers.find(layer => layer.id === 'boulders'), index = await loadLandscapeEcosystemTiles(entry.tiles, { manifestUrl: url, sidecar: loaded, layerId: 'boulders', fetchImpl: serve });
    assert.equal(index.tiles.length, entry.tiles.count);
    await assert.rejects(loadLandscapeEcosystemTiles(entry.tiles, { manifestUrl: url, sidecar: loaded, layerId: 'shrubs', fetchImpl: serve }), /belong to layer boulders/);
    await assert.rejects(loadLandscapeEcosystemTiles({ ...entry.tiles, sha256: 'a'.repeat(64) }, { manifestUrl: url, fetchImpl: serve }), /SHA-256 mismatch/);
    // payload urls are relative to the index that lists them (layers/tiles/<sha256>.bin on disk), so the tile loader resolves against the index URL
    const indexUrl = new URL(entry.tiles.url, url).href, tile = index.tiles[0], decoded = await loadLandscapeEcosystemTile(tile, { indexUrl, fetchImpl: serve });
    assert.equal(decoded.count, tile.count); assert.equal(decoded.records.length, tile.count * 12);
    assert.equal(new URL(tile.payload.url, indexUrl).href, `https://fixture/landscape/ecosystem/layers/${tile.payload.url}`);
    const payload = await readFile(path.join(prepared.outputDirectory, 'layers', tile.payload.url)), corrupt = Uint8Array.from(payload); corrupt[7] ^= 1;
    await assert.rejects(loadLandscapeEcosystemTile(tile, { indexUrl, fetchImpl: respond(corrupt, { status: 200 }) }), /SHA-256 mismatch/);
    await assert.rejects(loadLandscapeEcosystemTile(tile, { indexUrl, fetchImpl: respond(payload.subarray(1), { status: 200 }) }), /truncated/);
    await assert.rejects(loadLandscapeEcosystemTile({ ...tile, count: tile.count + 1 }, { indexUrl, fetchImpl: serve }), /size is out of bounds|does not hold/);
    await assert.rejects(loadLandscapeEcosystemTile(tile, { indexUrl: url, fetchImpl: serve }), /HTTP 404/, 'resolved against the manifest instead of the index the payload is missing');
});

test('Ecosystem sidecar: publication installs tiles, indexes and the snapshot before the current sidecar, keeps the previous snapshot and refuses a changed terrain or another landscape', async () => {
    const value = await fixture('publish'), { prepared } = await stage(value, 'first'), terrainBefore = await readFile(path.join(value.directory, 'manifest.json')), fieldsBefore = await readFile(path.join(value.directory, 'fields/manifest.json'));
    const installed = await publishEcosystemSidecar(prepared), destination = path.join(value.directory, 'ecosystem');
    assert.ok((await readFile(path.join(destination, 'manifest.json'))).equals(prepared.bytes)); assert.ok((await readFile(path.join(destination, `manifest.${prepared.report.sidecarSha256}.json`))).equals(prepared.bytes));
    assert.equal(installed.at(-1), path.join(destination, 'manifest.json'), 'the current sidecar switches last');
    assert.ok((await readFile(path.join(value.directory, 'manifest.json'))).equals(terrainBefore) && (await readFile(path.join(value.directory, 'fields/manifest.json'))).equals(fieldsBefore), 'terrain and fields are never written');
    assert.equal((await readdir(path.join(destination, 'layers/tiles'))).length, [...prepared.files.keys()].filter(url => url.startsWith('layers/tiles/')).length);
    assert.deepEqual((await readdir(path.join(destination, 'layers'))).filter(name => name.endsWith('.json')).length, 2);
    await assert.rejects(readdir(path.join(destination, 'tiles')), { code: 'ENOENT' }, 'payloads live beside their indexes');
    await publishEcosystemSidecar(prepared);
    assert.equal((await readCurrentEcosystem(destination)).value.revision, prepared.value.revision);
    const denser = await stage(value, 'second', { densityScale: 2 });
    assert.notEqual(denser.prepared.value.revision, prepared.value.revision); assert.ok(denser.prepared.value.layers[0].instanceCount > prepared.value.layers[0].instanceCount);
    await publishEcosystemSidecar(denser.prepared);
    assert.ok((await readFile(path.join(destination, 'manifest.json'))).equals(denser.prepared.bytes));
    assert.ok((await readFile(path.join(destination, `manifest.${prepared.report.sidecarSha256}.json`))).equals(prepared.bytes), 'the previous snapshot is kept');
    const changed = await fixture('changed'), candidate = await stage(changed, 'changed');
    await writeFile(path.join(changed.directory, 'manifest.json'), Buffer.concat([await readFile(path.join(changed.directory, 'manifest.json')), Buffer.from(' ')]));
    await assert.rejects(publishEcosystemSidecar(candidate.prepared), /terrain changed after planning/);
    await assert.rejects(readFile(path.join(changed.directory, 'ecosystem/manifest.json')), { code: 'ENOENT' });
    const foreign = await fixture('foreign'), foreignCandidate = await stage(foreign, 'foreign'), current = JSON.parse(foreignCandidate.prepared.bytes.toString('utf8'));
    current.landscapeId = 'another-landscape';
    await mkdir(path.join(foreign.directory, 'ecosystem'), { recursive: true });
    await writeFile(path.join(foreign.directory, 'ecosystem/manifest.json'), JSON.stringify(current));
    await assert.rejects(publishEcosystemSidecar(foreignCandidate.prepared), LandscapeEcosystemBindingError);
});

test('Ecosystem sidecar: a stale or unbound fields sidecar is refused before generation and an absent one leaves the inputs neutral', async () => {
    const value = await fixture('stale'), fields = JSON.parse(await readFile(path.join(value.directory, 'fields/manifest.json'), 'utf8'));
    fields.terrain.chunks[0].height = 'a'.repeat(64);
    await writeFile(path.join(value.directory, 'fields/manifest.json'), JSON.stringify(fields));
    await assert.rejects(openEcosystemLandscape({ directory: value.directory, recipe: RECIPE }), /contentKey|stale natives|re-run landscape\/terrain-fields/);
    const bare = await fixture('bare');
    await writeFile(path.join(bare.directory, 'fields/manifest.json'), '');
    await assert.rejects(openEcosystemLandscape({ directory: bare.directory, recipe: RECIPE }), /JSON/);
    const { rm } = await import('node:fs/promises');
    await rm(path.join(bare.directory, 'fields'), { recursive: true });
    const landscape = await openEcosystemLandscape({ directory: bare.directory, recipe: RECIPE });
    assert.equal(landscape.fields, null); assert.equal(landscape.geology, null);
    const staged = await stage(bare, 'bare-stage');
    assert.equal(staged.prepared.value.dependencies.fieldsRevision, null);
    assert.notEqual(staged.prepared.value.layers[1].instanceCount, shared.prepared.value.layers[1].instanceCount, 'shrubs read the fields when present');
});

test('Ecosystem sidecar: the bake leaves are registered under landscape/ecosystem with the blue-noise check as a dependency, scoped options and distinct receipts', () => {
    const plan = planBakes(bakeJobs, 'landscape/ecosystem');
    assert.deepEqual(plan.map(job => job.id), ['landscape/ecosystem/blue-noise', 'landscape/ecosystem']);
    for (const job of plan) { assert.deepEqual(job.configurationPaths, []); assert.equal(job.blender, undefined); }
    assert.deepEqual(plan[0].outputs, [BLUE_NOISE_RECEIPT]); assert.deepEqual(plan[1].outputs, [ECOSYSTEM_RECEIPT]);
    const defaults = resolveBakeOptions(plan, parseBakeOptions([])).get('landscape/ecosystem');
    assert.deepEqual(defaults, { directory: 'assets/public/landscape/coastal-city-v3', recipe: 'tools/bake_landscape/ecosystem/recipes/coastal-v3-ecosystem-v1.json', density: 1, receipt: ECOSYSTEM_RECEIPT });
    const scoped = resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/ecosystem:layers=boulders,shrubs', '--set', 'landscape/ecosystem:density=0.5', '--set', 'landscape/ecosystem:overrides=overrides.json'])).get('landscape/ecosystem');
    assert.deepEqual(scoped.layers, ['boulders', 'shrubs']); assert.equal(scoped.density, .5); assert.equal(scoped.overrides, 'overrides.json');
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/ecosystem:density=20'])), /0\.\.16/);
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/ecosystem:layers=a b'])), /comma-separated/);
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/ecosystem:source=x.zip'])), /No selected job consumes/);
    assert.ok(planBakes(bakeJobs, 'all').every(job => !job.id.startsWith('landscape')));
    assert.ok(planBakes(bakeJobs, 'landscape').every(job => !job.id.startsWith('landscape/ecosystem')));
    assert.deepEqual(planBakes(bakeJobs, 'landscape/ecosystem/blue-noise').map(job => job.id), ['landscape/ecosystem/blue-noise']);
});
