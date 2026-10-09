// Verifies the landscape-geology v1 contract and bake: codec, strict sidecar, samplers, pages, staleness, loaders, publication, the geology-channels operator and the GLSL mirror.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { LANDSCAPE_GEOLOGY_CATEGORIES, LANDSCAPE_GEOLOGY_CHANNELS, LANDSCAPE_GEOLOGY_LAYERS, LANDSCAPE_SYNTHESIS_LAYERS, LANDSCAPE_SYNTHESIS_OPERATORS, LandscapeGeologyBindingError,
    decodeLandscapeGeology, decodeLandscapeGeologyCategory, decodeLandscapeGeologyChannel, encodeLandscapeGeologyChannel, landscapeGeologyLayout, landscapeGeologyStaleness, landscapeTerrainFieldStaleAt,
    loadLandscapeGeology, loadLandscapeGeologyPage, resolveLandscapeSynthesisParameters, sampleLandscapeGeologyCategory, sampleLandscapeGeologyPage, sampleLandscapeGeologyPageUnits,
    validateLandscapeGeology, validateLandscapeSynthesisRecipe } from '../../../src/app/landscape/index.js';
import { readLandscapeFileManifest } from '../../../tools/landscape_authoring/LandscapeFileIO.mjs';
import { TerrainFieldMemory } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsGrid.mjs';
import { executeSynthesisRecipe } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisGraph.mjs';
import { GEOLOGY_OPERATORS } from '../../../tools/bake_landscape/terrain_synthesis/operators/GeologyChannels.mjs';
import { geologyCoarseTexel } from '../../../tools/bake_landscape/terrain_synthesis/geology/GeologyPages.mjs';
import { prepareLandscapeGeology, publishLandscapeGeology, validateLandscapeGeologyCandidate } from '../../../tools/bake_landscape/terrain_synthesis/geology/GeologyPreparation.mjs';
import { RELIEF_RAMP, composeSheet, createCanvas, rampColor, renderHillshade, resampleArea, resampleNearest, rgbOf, writeReviewPng } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisReview.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const artifacts = path.join(root, 'tests/artifacts/node/landscape_synthesis_geology'), evidence = path.join(root, 'tests/artifacts/screens/landscape/ai596/d2/operators/geology-channels');
await mkdir(artifacts, { recursive: true }); await mkdir(evidence, { recursive: true });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const PROVENANCE = { recipeIdentity: 'synthesis-0123456789abcdef01234567', recipeSha256: 'a'.repeat(64) };
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const op = (id, type, params = {}, mask = null) => ({ id, op: type, params, mask, seed: null, enabled: true });
const gridOf = (chunkIntervals, maxLevel, spacing) => {
    const intervals = chunkIntervals * 2 ** maxLevel;
    return { columns: intervals + 1, rows: intervals + 1, spacingX: spacing, spacingZ: spacing, bounds: { minX: 0, maxX: intervals * spacing, minZ: 0, maxZ: intervals * spacing }, chunkIntervals, maxLevel };
};
const recipeOf = (grid, operators, seed = 11) => ({ format: 'landscape-synthesis-recipe', schemaVersion: 1, id: 'geology-test', seed, seaLevel: 0, grid, working: null,
    inputs: { landscape: { directory: 'synthetic', expectedRevision: null }, plan: null, imports: [] }, operators, outputs: { heightCap: null, coverPolicy: 'keep-source', channels: ['height'] }, overrides: [] });
const sourceOf = heightAt => (binding, { memory, output }) => {
    const n = output.columns * output.rows, heights = memory.allocate('source/heights', Float32Array, n), cover = memory.allocate('source/cover', Uint8Array, n);
    for (let r = 0; r < output.rows; r++) for (let c = 0; c < output.columns; c++) { heights[r * output.columns + c] = heightAt(output.minX + c * output.spacingX, output.maxZ - r * output.spacingZ); cover[r * output.columns + c] = 2; }
    return { grid: output, heights, cover, tracked: ['source/heights', 'source/cover'], sha256: 'ab'.repeat(32) };
};
const run = (recipe, inputs, options = {}) => executeSynthesisRecipe({ recipe, inputs, memory: new TerrainFieldMemory(512 << 20), ...options });
const indexAt = (grid, x, z) => Math.round((grid.maxZ - z) / grid.spacingZ) * grid.columns + Math.round((x - grid.minX) / grid.spacingX);
// a 512 m coast: sea in the west, an east-west valley draining to it, a hill, a 16 m step face and fine ripples
const reviewTerrain = (x, z) => (x - 80) * .06 + 10 * Math.exp(-((x - 360) ** 2 + (z - 300) ** 2) / 8000) - 4 * Math.exp(-((z - 200) ** 2) / 1600) * smooth(60, 120, x) + 16 * smooth(394, 406, x) + 1.5 * Math.sin(x / 23) * Math.cos(z / 17);
const REVIEW_AREAS = { rillAreaSquareMeters: 500, gullyAreaSquareMeters: 3000, channelAreaSquareMeters: 12000 };

// geology layers in meters and raw classes as the erosion, strata and coastal operators would leave them (world-anchored, any grid)
function analyticLayers(grid, heights, seaLevel = 0) {
    const { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, n = columns * rows, extent = (columns - 1) * spacingX;
    const layers = Object.fromEntries(LANDSCAPE_GEOLOGY_LAYERS.map(name => [name, LANDSCAPE_SYNTHESIS_LAYERS[name].type === 'uint8' ? new Uint8Array(n) : new Float32Array(n)]));
    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
        const i = r * columns + c, x = minX + c * spacingX, z = maxZ - r * spacingZ, h = heights[i] - seaLevel, land = h >= 0;
        const regolith = land ? 2.5 + 1.5 * Math.sin(x / 14) + Math.cos(z / 10) : 0, fan = Math.hypot(x - .45 * extent, z - .35 * extent);
        let depositType = 0, deposit = 0;
        if (land && fan < .1 * extent) { depositType = 3; deposit = 1 + 2 * Math.exp(-(fan * fan) / (.003 * extent * extent)); }
        else if (land && h < 1.5) { depositType = 4; deposit = 1.5; }
        layers.regolith[i] = regolith; layers.depositType[i] = depositType; layers.depositThickness[i] = deposit; layers.bedrock[i] = heights[i] - regolith - deposit;
        layers.lithology[i] = land ? 1 + Math.floor(h / 4) % 5 : 0;
        layers.wear[i] = land ? 1.2 * Math.exp(-((x - .7 * extent) ** 2 + (z - .3 * extent) ** 2) / (.03 * extent * extent)) : 0;
        layers.deposition[i] = deposit * .3;
        layers.coastalZone[i] = !land ? (h > -2 ? 4 : 1) : h < .5 ? 5 : h < 1.2 ? 6 : h < 3 ? 7 : 0;
        layers.waveExposure[i] = (land ? h < 3 : h > -2) ? Math.max(0, 1 - z / extent) : 0;
    }
    return layers;
}

// the executor's context shape for one direct operator call (layer store, scope and the catalog defaults)
function operatorContext({ grid, heights, layers = {}, params = {}, seaLevel = 0, mask = null }) {
    const memory = new TerrainFieldMemory(256 << 20), n = grid.columns * grid.rows, store = new Map([['height', heights], ...Object.entries(layers)]), scoped = new Set();
    const layerStore = Object.freeze({ has: name => store.has(name), get(name) { if (!store.has(name)) throw new Error(`missing layer ${name}`); return store.get(name); },
        create(name, Type) { if (store.has(name)) throw new Error(`layer ${name} exists`); const array = memory.allocate(`layer/${name}`, Type, n); store.set(name, array); return array; } });
    const scope = Object.freeze({ allocate(name, Type, length) { scoped.add(`op/test/${name}`); return memory.allocate(`op/test/${name}`, Type, length); },
        free(...names) { for (const name of names) { memory.free(`op/test/${name}`); scoped.delete(`op/test/${name}`); } }, releaseAll() { for (const name of scoped) memory.free(name); scoped.clear(); } });
    const context = Object.freeze({ grid, seaLevel, memory, scope, layers: layerStore, cache: {}, checkpoint() {}, log() {}, mask: () => null,
        operator: { id: 'test', op: 'geology-channels', seed: 1, params: resolveLandscapeSynthesisParameters({ op: 'geology-channels', params }), mask } });
    return { context, memory, store, scope };
}

async function finalizeLayers(options) {
    const harness = operatorContext(options), statistics = await GEOLOGY_OPERATORS['geology-channels'](harness.context);
    harness.scope.releaseAll();
    assert.ok([...harness.memory.entries.keys()].every(name => name.startsWith('layer/')), `only created layers stay tracked: ${[...harness.memory.entries.keys()]}`);
    return { ...harness, statistics };
}

async function fixture() {
    // 65 x 65 native samples at 2 m: sea in the west, a hill, a hollow and an 8 m step face in the east
    const source = createLandscapeModelFixture({ chunkIntervals: 16, maxLevel: 2, minX: 0, minZ: 0, spacing: 2,
        heightAt: (c, r) => Math.fround(c < 12 ? (c - 12) * .4 : (c - 12) * .3 + 3 * Math.exp(-((c - 45) ** 2 + (r - 20) ** 2) / 40) - 2 * Math.exp(-((c - 30) ** 2 + (r - 45) ** 2) / 30) + (c >= 54 ? 8 : 0)),
        coverAt: c => c < 12 ? 0 : c < 17 ? 1 : 2 });
    const parent = await mkdtemp(path.join(artifacts, 'fixture-')), directory = path.join(parent, 'saved');
    for (const [url, bytes] of source.resources) { const file = path.join(directory, url); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
    const g = source.manifest.grid, grid = { columns: g.columns, rows: g.rows, spacingX: g.spacingX, spacingZ: g.spacingZ, minX: source.manifest.bounds.minX, maxZ: source.manifest.bounds.maxZ };
    const finalized = await finalizeLayers({ grid, heights: source.sourceHeights, layers: analyticLayers(grid, source.sourceHeights), params: { rillAreaSquareMeters: 200, gullyAreaSquareMeters: 1000, channelAreaSquareMeters: 4000 } });
    const layers = Object.fromEntries(LANDSCAPE_GEOLOGY_LAYERS.map(name => [name, finalized.store.get(name)]));
    return { ...source, directory, parent, grid, layers, operatorStatistics: finalized.statistics };
}

async function prepare(value, label, options = {}) {
    const source = await readLandscapeFileManifest(value.directory);
    return prepareLandscapeGeology({ directory: value.directory, outputDirectory: path.join(value.parent, label), source, layers: value.layers, grid: value.grid, heights: value.sourceHeights, provenance: PROVENANCE, ...options });
}

const shared = await (async () => { const value = await fixture(); return { value, prepared: await prepare(value, 'candidate') }; })();

function reorder(value) {
    if (Array.isArray(value)) return value.map(reorder);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reorder(entry)]));
}

test('Geology: the codec round-trips every channel, categorical texels decode to their labels and the catalogs agree with the engine layers', () => {
    for (const definition of LANDSCAPE_GEOLOGY_CHANNELS) for (let byte = 0; byte < 256; byte++) {
        assert.equal(encodeLandscapeGeologyChannel(definition, decodeLandscapeGeologyChannel(definition, byte / 255)), byte, `${definition.name} byte ${byte}`);
    }
    const regolith = LANDSCAPE_GEOLOGY_CHANNELS.find(channel => channel.name === 'regolith');
    assert.equal(encodeLandscapeGeologyChannel(regolith, 9), 255); assert.equal(encodeLandscapeGeologyChannel(regolith, -1), 0); assert.equal(encodeLandscapeGeologyChannel(regolith, 4), 128);
    for (let label = 0; label < 256; label++) assert.equal(decodeLandscapeGeologyCategory(label / 255), label);
    assert.deepEqual(decodeLandscapeGeology([0, .5, 1, .25, 1, .5, 0, 1]), { bedrockOffset: 0, regolith: 4, depositThickness: 30, wear: .25, deposition: 1, flow: .5, waveExposure: 0, faceMask: 1 });
    assert.deepEqual(LANDSCAPE_GEOLOGY_CHANNELS.map(channel => `${channel.layer}${channel.component}`), ['0r', '0g', '0b', '0a', '1r', '1g', '1b', '1a']);
    for (const name of LANDSCAPE_GEOLOGY_LAYERS) assert.ok(LANDSCAPE_SYNTHESIS_LAYERS[name], `${name} is a declared engine layer`);
    for (const category of LANDSCAPE_GEOLOGY_CATEGORIES) {
        assert.equal(LANDSCAPE_SYNTHESIS_LAYERS[category.name].type, 'uint8');
        assert.equal(category.maximum, category.labels ? category.labels.length - 1 : 255);
    }
    for (const channel of LANDSCAPE_GEOLOGY_CHANNELS.filter(entry => entry.name !== 'bedrockOffset')) assert.equal(LANDSCAPE_SYNTHESIS_LAYERS[channel.name].type, 'float32');
    assert.deepEqual([...LANDSCAPE_SYNTHESIS_OPERATORS['geology-channels'].layers.writes], [...LANDSCAPE_GEOLOGY_LAYERS]);
    assert.deepEqual([...LANDSCAPE_SYNTHESIS_OPERATORS['geology-channels'].layers.reads], ['height']);
    assert.equal(landscapeGeologyLayout(257).pageBytes, 261 * 261 * 4 * 2); assert.equal(landscapeGeologyLayout(257).categorical.byteLength, 257 * 257 * 4);
});

test('Geology: preparation binds the exact terrain, validates every page and rebuilds byte for byte', async () => {
    const { value, prepared } = shared, checked = await validateLandscapeGeologyCandidate(prepared);
    assert.equal(prepared.report.determinism.verified, true);
    assert.equal(prepared.value.pages.length, value.manifest.chunks.length);
    assert.equal(prepared.value.terrain.revision, value.manifest.revision);
    assert.match(prepared.value.revision, /^geology-[a-f0-9]{24}$/);
    assert.ok(checked.checks.borderTexels > 0 && checked.checks.borderLabels > 0 && checked.checks.alignedLabels > 0 && checked.checks.coarseTexels > 0, JSON.stringify(checked.checks));
    const statistics = prepared.value.statistics;
    assert.ok(statistics.land.landSamples > 0 && statistics.land.waterSamples > 0);
    assert.ok(statistics.channels.regolith.maximum <= 8 && statistics.channels.regolith.minimum >= 0 && statistics.channels.depositThickness.maximum <= 30);
    assert.ok(statistics.categories.depositType.histogram.alluvium > 0 && statistics.categories.depositType.histogram['beach-sand'] > 0, JSON.stringify(statistics.categories.depositType));
    assert.ok(statistics.categories.drainage.histogram.sea === statistics.land.waterSamples && statistics.categories.coastalZone.histogram.offshore > 0);
    assert.ok(statistics.invariant.maxResidualMeters <= 1e-3 && statistics.invariant.maxBedrockAboveHeightMeters <= 1e-3);
    assert.ok(prepared.report.pages.uniqueFieldPages <= prepared.report.pages.count && prepared.report.pages.uniqueCategoricalPages <= prepared.report.pages.count);
    const again = await prepare(value, 'rebuild');
    assert.ok((await readFile(again.sidecarFile)).equals(await readFile(prepared.sidecarFile)), 'identical inputs give identical sidecar bytes');
    for (const page of prepared.value.pages) for (const key of ['fields', 'categorical']) {
        assert.ok((await readFile(path.join(again.outputDirectory, page[key].url))).equals(await readFile(path.join(prepared.outputDirectory, page[key].url))), `${page.id} ${key}`);
    }
    const moved = Float32Array.from(value.sourceHeights); moved[100] += 1;
    await assert.rejects(prepare(value, 'wrong-heights', { heights: moved, verifyDeterminism: false }), /heights differ from the native terrain/);
    const { lithology, ...incomplete } = value.layers;
    await assert.rejects(prepare(value, 'wrong-layers', { layers: incomplete, verifyDeterminism: false }), /layers must be exactly/);
    const raised = { ...value.layers, bedrock: Float32Array.from(value.layers.bedrock) }; raised.bedrock[5] += 1;
    await assert.rejects(prepare(value, 'bedrock-above', { layers: raised, verifyDeterminism: false }), /bedrock lies 1 m above the height at sample 5/);
    const broken = { ...value.layers, bedrock: Float32Array.from(value.layers.bedrock) }; broken.bedrock[2100] -= 1;
    await assert.rejects(prepare(value, 'broken-invariant', { layers: broken, verifyDeterminism: false }), /is violated by 1(\.0+\d*)? m at sample 2100/);
    const mislabeled = { ...value.layers, depositType: Uint8Array.from(value.layers.depositType) }; mislabeled.depositType[3] = 9;
    await assert.rejects(prepare(value, 'bad-label', { layers: mislabeled, verifyDeterminism: false }), /exceeds the catalog maximum/);
    await assert.rejects(prepare(value, 'bad-identity', { provenance: { recipeIdentity: 'relief-b', recipeSha256: 'a'.repeat(64) }, verifyDeterminism: false }), /recipeIdentity/);
});

test('Geology: the sidecar is strict, key-order independent and reports typed binding errors', async () => {
    const { value, prepared } = shared, sidecar = JSON.parse(await readFile(prepared.sidecarFile, 'utf8'));
    assert.deepEqual(await validateLandscapeGeology(reorder(sidecar), reorder(value.manifest)), await validateLandscapeGeology(sidecar, value.manifest));
    const mutated = change => { const copy = structuredClone(sidecar); change(copy); return copy; };
    const rejections = {
        'unknown top-level field': copy => { copy.extra = 1; },
        'unknown page field': copy => { copy.pages[0].note = 'x'; },
        'missing statistics key': copy => { delete copy.statistics.invariant; },
        'channel scale': copy => { copy.channels[0].scale = 16; },
        'channel order': copy => { copy.channels.reverse(); },
        'category label': copy => { copy.categories[0].labels[1] = 'scree'; },
        'category maximum': copy => { copy.categories[1].maximum = 7; },
        'layout halo': copy => { copy.layout.halo = 1; },
        'categorical layout': copy => { copy.layout.categorical.layers = 3; },
        'content key': copy => { copy.pages[1].contentKey = 'a'.repeat(64); },
        'page size': copy => { copy.pages[0].categorical.byteLength--; },
        'revision form': copy => { copy.revision = 'geology-latest'; },
        'measured claim': copy => { copy.provenance.measured = true; },
        'recipe identity': copy => { copy.provenance.recipeIdentity = 'relief-b-raised-80'; },
        'native binding': copy => { copy.terrain.chunks.pop(); }
    };
    for (const [label, change] of Object.entries(rejections)) {
        await assert.rejects(validateLandscapeGeology(mutated(change), value.manifest), error => /^\[Landscape\]/.test(error.message) && !(error instanceof LandscapeGeologyBindingError), label);
    }
    const other = structuredClone(value.manifest); other.id = 'another-landscape';
    await assert.rejects(validateLandscapeGeology(sidecar, other), LandscapeGeologyBindingError);
    const sea = structuredClone(value.manifest); sea.coordinates.seaLevel = 1;
    await assert.rejects(validateLandscapeGeology(sidecar, sea), LandscapeGeologyBindingError);
    const revised = structuredClone(value.manifest); revised.revision = 'materials-only-revision';
    const staleness = landscapeGeologyStaleness(await validateLandscapeGeology(sidecar, revised), revised);
    assert.equal(staleness.bound, false);
    assert.deepEqual(staleness.staleChunks, [], 'a revision change without channel changes keeps every page fresh');
});

test('Geology: an edited native chunk is stale, its ancestors partial, and only its 8 x 8 cells fall back', () => {
    const { value, prepared } = shared, edited = structuredClone(value.manifest), target = edited.chunks.find(chunk => chunk.id === 'l2/c1/r2');
    target.channels.height.sha256 = 'b'.repeat(64); edited.revision = 'edited-revision';
    const staleness = landscapeGeologyStaleness(prepared.value, edited);
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

test('Geology: page samplers are exact at native samples, bilinear between them, and categorical reads are the nearest aligned labels on every level', async () => {
    const { value, prepared } = shared, layout = landscapeGeologyLayout(17), grid = value.grid, pageOf = id => prepared.value.pages.find(entry => entry.id === id);
    const bytesOf = async entry => new Uint8Array(await readFile(path.join(prepared.outputDirectory, entry.url)));
    const page = pageOf('l2/c2/r1'), bytes = await bytesOf(page.fields), labels = await bytesOf(page.categorical), chunk = value.manifest.chunks.find(entry => entry.id === page.id), b = chunk.bounds;
    const spacing = (b.maxX - b.minX) / (layout.samples - 1), layerOf = (name, i) => name === 'bedrockOffset' ? value.sourceHeights[i] - value.layers.bedrock[i] : value.layers[name][i];
    const global = (c, r) => (chunk.startRow + r) * grid.columns + chunk.startColumn + c;
    const exact = sampleLandscapeGeologyPage(bytes, layout, chunk, b.minX + 3 * spacing, b.maxZ - 5 * spacing);
    for (const definition of LANDSCAPE_GEOLOGY_CHANNELS) {
        const expected = decodeLandscapeGeologyChannel(definition, encodeLandscapeGeologyChannel(definition, layerOf(definition.name, global(3, 5))) / 255);
        assert.ok(Math.abs(exact[definition.name] - expected) < 1e-12, `${definition.name}: ${exact[definition.name]} vs ${expected}`);
    }
    // the offset (32 m scale) and the two thicknesses (8 and 30 m scales) agree within their quantization steps
    assert.ok(exact.regolith >= 0 && Math.abs(exact.bedrockOffset - exact.regolith - exact.depositThickness) < 32 / 255 / 2 + 8 / 255 / 2 + 30 / 255 / 2 + 1e-9, 'the offset carries regolith and deposit');
    const between = sampleLandscapeGeologyPageUnits(bytes, 0, layout, b, b.minX + 3.25 * spacing, b.maxZ - 5.5 * spacing);
    for (let k = 0; k < LANDSCAPE_GEOLOGY_CHANNELS.length; k++) {
        const texel = (tx, ty) => bytes[(k >> 2) * layout.layerBytes + ((ty + layout.halo) * layout.width + tx + layout.halo) * 4 + (k & 3)] / 255;
        const expected = (texel(3, 5) * .75 + texel(4, 5) * .25) * .5 + (texel(3, 6) * .75 + texel(4, 6) * .25) * .5;
        assert.ok(Math.abs(between[k] - expected) < 1e-12, `channel ${k} bilinear`);
    }
    const nearest = sampleLandscapeGeologyCategory(labels, chunk, b.minX + 3.4 * spacing, b.maxZ - 5.6 * spacing);
    for (const category of LANDSCAPE_GEOLOGY_CATEGORIES) assert.equal(nearest[category.name], value.layers[category.name][global(3, 6)], category.name);
    assert.ok(Object.values(nearest).some(label => label > 0), 'the fixture carries non-zero labels here');
    // the coarse root page (the fixture has levels 0 and 2) holds the same labels at shared positions as the native page below it
    const coarse = pageOf('l0/c0/r0'), coarseChunk = value.manifest.chunks.find(entry => entry.id === coarse.id), coarseLabels = await bytesOf(coarse.categorical), cb = coarseChunk.bounds, coarseSpacing = (cb.maxX - cb.minX) / 16;
    let compared = 0;
    for (let r = 0; r <= 16; r += 2) for (let c = 0; c <= 16; c += 3) {
        const x = cb.minX + c * coarseSpacing, z = cb.maxZ - r * coarseSpacing, native = value.manifest.chunks.find(entry => entry.level === 2 && x >= entry.bounds.minX && x <= entry.bounds.maxX && z >= entry.bounds.minZ && z <= entry.bounds.maxZ);
        const nativeLabels = await bytesOf(pageOf(native.id).categorical);
        assert.deepEqual(sampleLandscapeGeologyCategory(coarseLabels, coarseChunk, x, z), sampleLandscapeGeologyCategory(nativeLabels, native, x, z));
        compared++;
    }
    assert.equal(compared, 54);
    // a coarse field texel is the tent prefilter of the native texels it covers
    const rootBytes = await bytesOf(coarse.fields), intervals = 16, nativeBytes = Object.fromEntries(await Promise.all(prepared.value.pages.filter(entry => entry.level === 2).map(async entry => [entry.id, await bytesOf(entry.fields)])));
    const nativeTexel = (column, row) => {
        const nc = Math.min(3, Math.floor(column / intervals)), nr = Math.min(3, Math.floor(row / intervals)), tx = column - nc * intervals + layout.halo, ty = row - nr * intervals + layout.halo;
        return Uint8Array.from({ length: 8 }, (_, k) => nativeBytes[`l2/c${nc}/r${nr}`][(k >> 2) * layout.layerBytes + (ty * layout.width + tx) * 4 + (k & 3)]);
    };
    for (const [tx, ty] of [[2, 2], [9, 11], [18, 7], [0, 20]]) {
        const expected = geologyCoarseTexel(nativeTexel, grid, coarseChunk, tx, ty, layout.halo);
        for (let k = 0; k < 8; k++) assert.equal(rootBytes[(k >> 2) * layout.layerBytes + (ty * layout.width + tx) * 4 + (k & 3)], expected[k], `root texel ${tx},${ty} channel ${k}`);
    }
    assert.throws(() => sampleLandscapeGeologyPage(bytes.subarray(1), layout, chunk, 0, 0), /does not match its layout/);
    assert.throws(() => sampleLandscapeGeologyCategory(labels.subarray(1), chunk, 0, 0), /does not match its chunk/);
});

test('Geology: the sidecar loader treats only 404 as absent and the page loader authenticates size and hash', async () => {
    const { prepared, value } = shared, bytes = await readFile(prepared.sidecarFile), url = 'https://fixture/landscape/geology/manifest.json';
    const respond = (body, init) => async () => new Response(body, init);
    assert.equal(await loadLandscapeGeology(url, { landscape: value.manifest, fetchImpl: respond('', { status: 404 }) }), null);
    await assert.rejects(loadLandscapeGeology(url, { landscape: value.manifest, fetchImpl: respond('', { status: 500 }) }), /HTTP 500/);
    await assert.rejects(loadLandscapeGeology(url, { landscape: value.manifest, fetchImpl: respond('{"format":', { status: 200 }) }), /not valid UTF-8 JSON/);
    const other = structuredClone(value.manifest); other.id = 'another-landscape';
    await assert.rejects(loadLandscapeGeology(url, { landscape: other, fetchImpl: respond(bytes, { status: 200 }) }), LandscapeGeologyBindingError);
    const loaded = await loadLandscapeGeology(url, { landscape: value.manifest, fetchImpl: respond(bytes, { status: 200 }) });
    assert.equal(loaded.revision, prepared.value.revision);
    for (const key of ['fields', 'categorical']) {
        const entry = prepared.value.pages[0][key], payload = await readFile(path.join(prepared.outputDirectory, entry.url));
        assert.equal((await loadLandscapeGeologyPage(entry, { manifestUrl: url, fetchImpl: respond(payload, { status: 200 }) })).length, entry.byteLength);
        const corrupt = Uint8Array.from(payload); corrupt[7] ^= 1;
        await assert.rejects(loadLandscapeGeologyPage(entry, { manifestUrl: url, fetchImpl: respond(corrupt, { status: 200 }) }), /SHA-256 mismatch/);
        await assert.rejects(loadLandscapeGeologyPage(entry, { manifestUrl: url, fetchImpl: respond(payload.subarray(1), { status: 200 }) }), /truncated/);
    }
});

test('Geology: publication installs pages and snapshots before the current sidecar, keeps the previous snapshot and refuses a changed terrain or another landscape', async () => {
    const value = await fixture(), prepared = await prepare(value, 'publish', { verifyDeterminism: false }), terrainBefore = await readFile(path.join(value.directory, 'manifest.json'));
    const installed = await publishLandscapeGeology(prepared), geology = path.join(value.directory, 'geology');
    assert.ok((await readFile(path.join(geology, 'manifest.json'))).equals(await readFile(prepared.sidecarFile)));
    assert.ok((await readFile(path.join(geology, `manifest.${prepared.report.sidecarSha256}.json`))).equals(await readFile(prepared.sidecarFile)));
    assert.equal(installed.at(-1), path.join(geology, 'manifest.json'), 'the current sidecar switches last');
    assert.ok((await readFile(path.join(value.directory, 'manifest.json'))).equals(terrainBefore), 'terrain is never written');
    const entries = await readdir(value.directory);
    assert.ok(!entries.includes('fields') && !entries.includes('appearance'), 'fields and appearance are never written');
    assert.equal((await readdir(path.join(geology, 'pages'))).length, new Set(prepared.value.pages.flatMap(page => [page.fields.url, page.categorical.url])).size);
    await publishLandscapeGeology(prepared);
    const second = await prepare(value, 'publish-2', { verifyDeterminism: false, provenance: { recipeIdentity: 'synthesis-' + 'f'.repeat(24), recipeSha256: 'b'.repeat(64) } });
    assert.notEqual(second.value.revision, prepared.value.revision, 'another recipe identity is another geology revision');
    await publishLandscapeGeology(second);
    assert.ok((await readFile(path.join(geology, 'manifest.json'))).equals(await readFile(second.sidecarFile)));
    assert.ok((await readFile(path.join(geology, `manifest.${prepared.report.sidecarSha256}.json`))).equals(await readFile(prepared.sidecarFile)), 'the previous snapshot is kept');
    const changed = await fixture(), candidate = await prepare(changed, 'changed', { verifyDeterminism: false });
    await writeFile(path.join(changed.directory, 'manifest.json'), Buffer.concat([await readFile(path.join(changed.directory, 'manifest.json')), Buffer.from(' ')]));
    await assert.rejects(publishLandscapeGeology(candidate), /terrain changed after preparation/);
    await assert.rejects(readFile(path.join(changed.directory, 'geology/manifest.json')), { code: 'ENOENT' });
    const foreign = await fixture(), foreignPrepared = await prepare(foreign, 'foreign', { verifyDeterminism: false }), current = JSON.parse(await readFile(foreignPrepared.sidecarFile, 'utf8'));
    current.landscapeId = 'another-landscape';
    await mkdir(path.join(foreign.directory, 'geology'), { recursive: true });
    await writeFile(path.join(foreign.directory, 'geology/manifest.json'), JSON.stringify(current));
    await assert.rejects(publishLandscapeGeology(foreignPrepared), LandscapeGeologyBindingError);
});

const PALETTE = ['#f0f0e8', '#d7263d', '#ff9f43', '#2b6ca3', '#3fbf8f', '#f5e663', '#7b2cbf', '#8c564b', '#17becf', '#1b1b1b', '#9ed0ce', '#729d83', '#d2b192'].map(rgbOf);
function scalarImage(grid, values, size, maximum) {
    const data = resampleArea(grid, values, size), canvas = createCanvas(size, size);
    for (let i = 0; i < size * size; i++) { const color = rampColor(RELIEF_RAMP, data[i] / maximum); canvas.data[i * 3] = color[0]; canvas.data[i * 3 + 1] = color[1]; canvas.data[i * 3 + 2] = color[2]; }
    return canvas;
}
function labelImage(grid, labels, size) {
    const data = resampleNearest(grid, labels, size), canvas = createCanvas(size, size);
    for (let i = 0; i < size * size; i++) { const color = PALETTE[data[i] % PALETTE.length]; canvas.data[i * 3] = color[0]; canvas.data[i * 3 + 1] = color[1]; canvas.data[i * 3 + 2] = color[2]; }
    return canvas;
}
async function writeReview(grid, heights, layer, statistics) {
    const size = 256, offset = new Float32Array(heights.length);
    for (let i = 0; i < heights.length; i++) offset[i] = heights[i] - layer('bedrock')[i];
    const entries = [{ image: renderHillshade(grid, heights, { size }), label: 'hillshade' }];
    const scalar = (values, maximum, label) => entries.push({ image: scalarImage(grid, values, size, maximum), label }), labels = (values, label) => entries.push({ image: labelImage(grid, values, size), label });
    scalar(offset, 32, 'bedrockOffset 0..32 m'); scalar(layer('regolith'), 8, 'regolith 0..8 m'); labels(layer('depositType'), 'depositType'); scalar(layer('depositThickness'), 30, 'depositThickness 0..30 m');
    labels(layer('lithology'), 'lithology'); scalar(layer('wear'), 1, 'wear 0..1'); scalar(layer('deposition'), 1, 'deposition 0..1'); scalar(layer('flow'), 1, 'flow 0..1'); labels(layer('drainage'), 'drainage');
    scalar(layer('faceMask'), 1, 'faceMask 0..1'); labels(layer('coastalZone'), 'coastalZone'); scalar(layer('waveExposure'), 1, 'waveExposure 0..1');
    await writeReviewPng(path.join(evidence, 'sheet.png'), composeSheet(entries, { columns: 4 }));
    await writeReviewPng(path.join(evidence, 'hillshade.png'), renderHillshade(grid, heights, { size: 512 }));
    await writeFile(path.join(evidence, 'statistics.json'), JSON.stringify(statistics, null, 2) + '\n');
}

test('Geology: geology-channels creates neutral layers, derives the face mask, flow and drainage of the final surface, is deterministic and refuses a mask', async () => {
    const grid = gridOf(64, 2, 2), operators = [op('import', 'import-heights'), op('geology', 'geology-channels', REVIEW_AREAS)], inputs = { readLandscape: sourceOf(reviewTerrain) };
    const first = await run(recipeOf(grid, operators), inputs), second = await run(recipeOf(grid, operators), inputs), statistics = first.report.operators[1].statistics, g = first.grid;
    assert.deepEqual(statistics.defaultedLayers, [...LANDSCAPE_GEOLOGY_LAYERS], 'every geology layer is created when no earlier operator produced it');
    for (const name of LANDSCAPE_GEOLOGY_LAYERS) {
        assert.ok(first.layers[name], `${name} exists`);
        assert.equal(sha256(Buffer.from(first.layers[name].buffer)), sha256(Buffer.from(second.layers[name].buffer)), `${name} is deterministic`);
    }
    assert.deepEqual(statistics, second.report.operators[1].statistics);
    assert.equal(sha256(Buffer.from(first.heights.buffer)), sha256(Buffer.from(second.heights.buffer)));
    for (let i = 0; i < first.heights.length; i++) assert.ok(Object.is(first.layers.bedrock[i], first.heights[i]), 'defaulted bedrock is the height');
    const { faceMask, flow, drainage, coastalZone } = first.layers;
    assert.ok(faceMask[indexAt(g, 400, 100)] > .1 && faceMask[indexAt(g, 200, 100)] === 0 && statistics.faceMask.faceSamples > 0 && statistics.faceMask.maxSlopeDegrees > 55, `face mask ${faceMask[indexAt(g, 400, 100)]} / ${statistics.faceMask.maxSlopeDegrees}`);
    assert.ok(flow.every(value => value >= 0 && value <= 1) && statistics.flow.recomputed && statistics.flow.logSpecificCatchmentRange[1] > statistics.flow.logSpecificCatchmentRange[0]);
    assert.ok(flow[indexAt(g, 300, 200)] > flow[indexAt(g, 300, 140)], 'the valley axis collects more flow than its flank');
    assert.equal(drainage[indexAt(g, 20, 256)], 5, 'the sea is its own class');
    assert.ok(statistics.drainage.hillslope > statistics.drainage.rill && statistics.drainage.rill > 0 && statistics.drainage.gully > 0 && statistics.drainage.channel > 0 && statistics.drainage.sea > 0, JSON.stringify(statistics.drainage));
    assert.ok(coastalZone.every((zone, i) => zone === (first.heights[i] < 0 ? 1 : 0)), 'sea samples without a class become offshore, land stays inland');
    assert.equal(statistics.coast.offshoreFilledSamples, statistics.drainage.sea);
    assert.deepEqual([statistics.normalization.wear.source, statistics.normalization.wear.normalizationMeters, statistics.normalization.deposition.source], ['none', 1, 'none']);
    assert.deepEqual(statistics.categories.depositType, { none: first.heights.length });
    assert.equal(statistics.thickness.invariantViolations, 0);
    first.release(); second.release();
    const kept = await run(recipeOf(grid, [op('import', 'import-heights'), op('geology', 'geology-channels', { recomputeFlow: false })]), inputs), keptStatistics = kept.report.operators[1].statistics;
    assert.equal(keptStatistics.flow.recomputed, false);
    assert.ok(kept.layers.flow.every(value => value === 0) && kept.layers.drainage.every((value, i) => value === (kept.heights[i] < 0 ? 5 : 0)), 'kept layers are the neutral ones, sea relabeled');
    kept.release();
    await assert.rejects(run(recipeOf(grid, [op('import', 'import-heights'), op('geology', 'geology-channels', {}, { type: 'all' })]), inputs), /does not take a mask/);
    const rules = { 'face slopes': { faceStartDegrees: 70, faceFullDegrees: 60 }, 'drainage areas': { gullyAreaSquareMeters: 500 }, 'flow percentiles': { flowPercentiles: [90, 50] } };
    for (const [label, params] of Object.entries(rules)) {
        assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf(grid, [op('import', 'import-heights'), op('geology', 'geology-channels', params)])), error => /^\[Landscape\] recipe\.operators\[1\] \(geology-channels\)/.test(error.message), label);
    }
    // review sheet: the channels on the same 257 x 257 coast with analytic erosion, strata and coastal layers finalized by the operator
    const heights = new Float32Array(g.columns * g.rows);
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.columns; c++) heights[r * g.columns + c] = reviewTerrain(g.minX + c * g.spacingX, g.maxZ - r * g.spacingZ);
    const review = await finalizeLayers({ grid: g, heights, layers: analyticLayers(g, heights), params: REVIEW_AREAS });
    assert.ok(review.statistics.categories.depositType.alluvium > 0 && review.statistics.categories.lithology['2'] > 0 && review.statistics.normalization.wear.source === 'land-p99');
    await writeReview(g, heights, name => review.store.get(name), { defaults: statistics, review: review.statistics });
    for (const file of ['sheet.png', 'hillshade.png', 'statistics.json']) assert.ok((await readFile(path.join(evidence, file))).length > 0, file);
});

test('Geology: wear and deposition normalize by their land p99 or a declared constant, thickness layers clamp into range and the bedrock follows the invariant', async () => {
    const grid = { columns: 65, rows: 65, spacingX: 2, spacingZ: 2, minX: 0, maxZ: 128 }, n = 65 * 65, heights = new Float32Array(n);
    for (let r = 0; r < 65; r++) for (let c = 0; c < 65; c++) heights[r * 65 + c] = (c - 10) * .5 + Math.sin(r / 6);
    const land = i => heights[i] >= 0, base = () => {
        const layers = analyticLayers(grid, heights);
        for (let i = 0; i < n; i++) { layers.wear[i] = land(i) ? 2 * Math.exp(-((i % 65 - 40) ** 2 + (Math.floor(i / 65) - 30) ** 2) / 100) : 0; layers.deposition[i] = land(i) ? .5 * (i % 65) / 64 : 0; }
        // sample 100 (land): regolith beyond 8 m; sample 220 (land): 5 m regolith over a 35 m deposit; samples 300/301: bedrock off the invariant; sample 5 (sea): no coastal class
        layers.regolith[100] = 10; layers.bedrock[100] = heights[100] - 10 - layers.depositThickness[100];
        layers.regolith[220] = 5; layers.depositThickness[220] = 35; layers.bedrock[220] = heights[220] - 5 - 35;
        layers.bedrock[300] += .5; layers.bedrock[301] -= .25; layers.waveExposure[400] = 1.5; layers.coastalZone[5] = 0;
        return layers;
    };
    const auto = await finalizeLayers({ grid, heights, layers: base() }), s = auto.statistics;
    assert.equal(s.normalization.wear.source, 'land-p99');
    assert.ok(s.normalization.wear.normalizationMeters > 0 && s.normalization.wear.normalizationMeters < 2 && s.normalization.wear.saturatedSamples > 0, JSON.stringify(s.normalization.wear));
    assert.ok(Math.max(...auto.store.get('wear')) === 1 && Math.max(...auto.store.get('deposition')) === 1 && s.normalization.deposition.source === 'land-p99');
    assert.equal(s.thickness.regolithClampedSamples, 1); assert.equal(s.thickness.depositThicknessClampedSamples, 1); assert.equal(s.thickness.invariantViolations, 2);
    assert.ok(Math.abs(s.thickness.maxInvariantResidualMeters - .5) < 1e-5);
    assert.equal(s.thickness.bedrockOffsetBeyondScaleSamples, 1, 'regolith 8 plus deposit 30 exceeds the 32 m offset scale once');
    const bedrock = auto.store.get('bedrock'), regolith = auto.store.get('regolith'), deposit = auto.store.get('depositThickness');
    for (let i = 0; i < n; i++) assert.ok(Math.abs(heights[i] - bedrock[i] - regolith[i] - deposit[i]) <= 1e-3 && bedrock[i] <= heights[i] + 1e-3, `invariant at ${i}`);
    assert.equal(regolith[100], 8); assert.equal(deposit[220], 30); assert.equal(regolith[220], 5);
    assert.equal(s.coast.waveExposureClampedSamples, 1); assert.equal(auto.store.get('waveExposure')[400], 1);
    assert.equal(auto.store.get('coastalZone')[5], 1, 'an unclassified sea sample becomes offshore');
    assert.ok(s.ranges.wear[1] === 1 && s.ranges.regolith[1] === 8 && s.ranges.bedrockOffset[0] >= 0);
    const declared = await finalizeLayers({ grid, heights, layers: base(), params: { wearNormalizationMeters: 4, depositionNormalizationMeters: 1 } });
    assert.deepEqual([declared.statistics.normalization.wear.source, declared.statistics.normalization.wear.normalizationMeters, declared.statistics.normalization.wear.saturatedSamples], ['declared', 4, 0]);
    assert.ok(Math.abs(Math.max(...declared.store.get('wear')) - .5) < 1e-6 && Math.abs(Math.max(...declared.store.get('deposition')) - .5) < 1e-6);
    const mislabeled = base(); mislabeled.depositType[7] = 9;
    await assert.rejects(finalizeLayers({ grid, heights, layers: mislabeled }), /depositType label 9 at sample 7 exceeds the catalog maximum 6/);
});

test('Geology: the GLSL chunk mirrors every channel scale, category label and layer index, declares no uniforms and is not included by any program yet', async () => {
    const source = await readFile(path.join(root, 'src/graphics/shaders/chunks/landscape/geology.glsl'), 'utf8'), code = source.replace(/\/\/[^\n]*/g, '');
    const snake = value => value.replace(/([A-Z])/g, '_$1').replace(/-/g, '_').toUpperCase();
    const constant = (type, name) => { const match = new RegExp(`const ${type} ${name} = ([0-9.e+-]+);`).exec(code); assert.ok(match, `${name} is declared`); return Number(match[1]); };
    for (const channel of LANDSCAPE_GEOLOGY_CHANNELS) assert.equal(constant('float', `LANDSCAPE_GEOLOGY_${snake(channel.name)}_SCALE`), channel.scale, channel.name);
    for (const category of LANDSCAPE_GEOLOGY_CATEGORIES) {
        assert.equal(constant('int', `LANDSCAPE_GEOLOGY_LAYER_${snake(category.name)}`), category.layer, category.name);
        for (const [index, label] of (category.labels ?? []).entries()) assert.equal(constant('int', `LANDSCAPE_GEOLOGY_${snake(category.name)}_${snake(label)}`), index, `${category.name} ${label}`);
    }
    assert.equal([...code.matchAll(/const int LANDSCAPE_GEOLOGY_(DEPOSIT_TYPE|DRAINAGE|COASTAL_ZONE)_\w+ =/g)].length, LANDSCAPE_GEOLOGY_CATEGORIES.reduce((sum, category) => sum + (category.labels?.length ?? 0), 0), 'no extra labels in the shader');
    assert.ok(!/\buniform\b/.test(code), 'the chunk binds nothing yet');
    assert.match(source, /#define LANDSCAPE_GEOLOGY 1/);
    for (const name of ['landscapeGeologyNone', 'landscapeGeologyDecode', 'landscapeGeologyCategory']) assert.ok(new RegExp(`\\b${name}\\(`).test(code), name);
    assert.match(code, /l0\.r \* LANDSCAPE_GEOLOGY_BEDROCK_OFFSET_SCALE, l0\.g \* LANDSCAPE_GEOLOGY_REGOLITH_SCALE, l0\.b \* LANDSCAPE_GEOLOGY_DEPOSIT_THICKNESS_SCALE, l0\.a \* LANDSCAPE_GEOLOGY_WEAR_SCALE/);
    assert.match(code, /l1\.r \* LANDSCAPE_GEOLOGY_DEPOSITION_SCALE, l1\.g \* LANDSCAPE_GEOLOGY_FLOW_SCALE, l1\.b \* LANDSCAPE_GEOLOGY_WAVE_EXPOSURE_SCALE, l1\.a \* LANDSCAPE_GEOLOGY_FACE_MASK_SCALE/);
    assert.match(code, /int\(floor\(texel \* 255\.0 \+ 0\.5\)\)/);
    const programs = path.join(root, 'src/graphics/shaders/materials/landscape');
    for (const file of await readdir(programs)) assert.ok(!(await readFile(path.join(programs, file), 'utf8')).includes('landscape/geology'), `${file} does not include the geology chunk in AI 596`);
});
