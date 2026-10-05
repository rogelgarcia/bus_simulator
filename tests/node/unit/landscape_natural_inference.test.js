// Verifies terrain-driven natural display soil for planning-only cover: one policy at every level, explicit fallback, identities and budgets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { validateLandscapeManifest, LandscapeResidencyBudget, LANDSCAPE_NATURAL_SOIL, createLandscapeNaturalSoilResolver, landscapeNaturalSoilIdentity, landscapeNaturalSoilIndices,
    validateLandscapeNaturalSoilPage, createLandscapeSurfaceDetailIndex, landscapeSurfaceDetailKey, landscapeSurfaceDetailInputs, landscapeSurfaceDetailSeed, validateLandscapeSurfaceDetailRecipe,
    landscapeSurfaceDetailRecipeHash, landscapeRegionContains } from '../../../src/app/landscape/index.js';
import { LANDSCAPE_NATURAL_INFERENCE, LandscapeNaturalInference, acquireLandscapeNaturalInference, landscapeNaturalInferenceMode } from '../../../src/graphics/engine3d/landscape/LandscapeNaturalInference.js';
import { createLandscapeNaturalPresentation } from '../../../src/graphics/engine3d/landscape/LandscapeNaturalPresentation.js';
import { createLandscapeCoverageMask, landscapeCoverageMaskOwners } from '../../../src/graphics/engine3d/landscape/LandscapeCoverageMask.js';
import { landscapeCoverageMaskLayout } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCoverage.js';
import { LANDSCAPE_CONTOUR_COVERAGE } from '../../../src/graphics/engine3d/landscape/LandscapeContourCoverage.js';
import { createLandscapeSurfaceDetailPage } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailField.js';
import { LANDSCAPE_SURFACE_DETAIL_RECIPE } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailRecipe.js';
import { LANDSCAPE_SURFACE_DETAIL_RUNTIME, landscapeSurfaceDetailWorkerBytes } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailPages.js';
import { buildLandscapeMeshBuffers } from '../../../src/graphics/engine3d/landscape/LandscapeMeshBuffers.js';

// LandscapeMaskPages imports three for its texture array only; its reservations run on a stub
const stub = source => `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
const threeStub = stub(`export const RGBAFormat = 1023, NearestFilter = 1003, NoColorSpace = '';
    export class DataArrayTexture { constructor(data, width, height, depth = 1) { this.image = { data, width, height, depth }; } addLayerUpdate() {} clearLayerUpdates() {} dispose() {} }`);
const maskUrl = new URL('../../../src/graphics/engine3d/landscape/LandscapeMaskPages.js?natural-inference-mock', import.meta.url);
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if ((context.parentURL ?? '').startsWith(maskUrl.href) && specifier === 'three') return { url: threeStub, shortCircuit: true };
    return nextResolve(specifier, context);
} });
const { LandscapeMaskPages } = await import(maskUrl.href);
hooks.deregister();

const coastalUrl = new URL('../../../assets/public/landscape/coastal-city/manifest.json', import.meta.url);
const coastalJson = JSON.parse(await readFile(coastalUrl, 'utf8'));
const coastal = validateLandscapeManifest(coastalJson);
const sidecarFile = new URL('fields/manifest.json', coastalUrl), sidecarBytes = await readFile(sidecarFile), sidecar = JSON.parse(sidecarBytes);
const MANIFEST_URL = 'https://fixture.invalid/coastal-city/manifest.json', FIELDS_URL = 'https://fixture.invalid/coastal-city/fields/manifest.json';
const soilIds = coastal.soil.catalog.map(soil => soil.id), soilIndex = id => soilIds.indexOf(id);
const files = new Map();
const fileBytes = async url => { if (!files.has(url.href)) files.set(url.href, new Uint8Array(await readFile(url))); return files.get(url.href); };
const chunkOf = (manifest, id) => manifest.chunks.find(chunk => chunk.id === id);
const loadCover = async id => ({ landCover: await fileBytes(new URL(chunkOf(coastal, id).channels.landCover.url, coastalUrl)) });
const naturalReads = [];
const loadNatural = async (entry, url) => {
    assert.equal(url, FIELDS_URL, 'natural pages resolve against the terrain-fields manifest');
    naturalReads.push(entry.sha256);
    return Uint8Array.from(await fileBytes(new URL(entry.url, sidecarFile)));
};
const naturalPage = async id => { const entry = sidecar.pages.find(page => page.id === id).naturalSoil; return entry ? fileBytes(new URL(entry.url, sidecarFile)) : null; };
const overview = chunkOf(coastal, coastal.overviewId), overviewCover = (await loadCover(overview.id)).landCover;
const presentationOf = manifest => createLandscapeNaturalPresentation(manifest, { descriptor: chunkOf(manifest, manifest.overviewId), landCover: overviewCover });
const presentation = presentationOf(coastal);

function fetchFor(body = sidecarBytes, status = 200) {
    const requests = [];
    const fetchImpl = async url => { requests.push(String(url)); return String(url) === FIELDS_URL ? new Response(body, { status }) : new Response('', { status: 404 }); };
    return { requests, fetchImpl };
}

async function sourceFor(manifest = coastal, { body, status, mode = 'terrain', ledger = null } = {}) {
    const { requests, fetchImpl } = fetchFor(body, status);
    const source = new LandscapeNaturalInference({ loaded: { manifest, manifestUrl: MANIFEST_URL }, ledger, mode, fetchImpl });
    await source.ready;
    return Object.assign(source, { requests });
}

const terrain = await sourceFor();

function staleManifest(ids) {
    const draft = structuredClone(coastalJson);
    for (const id of ids) draft.chunks.find(chunk => chunk.id === id).channels.height.sha256 = 'c'.repeat(64);
    draft.revision = 'natural-inference-stale';
    return validateLandscapeManifest(draft);
}

function withOverrides(manifest, entries) {
    const draft = structuredClone(manifest);
    draft.capabilities = [...new Set([...draft.capabilities, 'terrain-editing-v1', 'terrain-editing-v2'])];
    draft.revision = 'natural-inference-overrides';
    draft.operations = entries.map((entry, sequence) => ({ id: `soil-${sequence}`, type: 'assign-soil', soilId: entry.soilId, region: entry.region, falloff: { type: 'none' }, sequence, batchId: 'batch-1' }));
    draft.soil.overrides = entries.map((entry, sequence) => ({ id: `soil-${sequence}`, sequence, batchId: 'batch-1', soilId: entry.soilId, region: entry.region }));
    draft.editHistory = { batchIds: ['batch-1'], lastBatchId: 'batch-1', previousManifestUrl: `manifest.${'0'.repeat(64)}.json` };
    return validateLandscapeManifest(draft);
}

async function mask(id, source = terrain, manifest = coastal, displayPresentation = presentation) {
    const descriptor = chunkOf(manifest, id), natural = source ? source.describe(landscapeCoverageMaskOwners(manifest, descriptor).map(owner => owner.id)) : null;
    const result = await createLandscapeCoverageMask({ manifest, manifestUrl: coastalUrl.href, presentation: displayPresentation, chunkId: id, loadCover, natural, loadNatural });
    return { ...result, descriptor, layout: landscapeCoverageMaskLayout(descriptor) };
}

// every texel of a page keyed by its clamped global sample (halos included)
function texels(page) {
    const { descriptor, layout, pixels } = page, map = new Map();
    for (let row = 0; row < layout.height; row++) for (let column = 0; column < layout.width; column++) {
        const globalColumn = Math.max(0, Math.min(coastal.grid.columns - 1, descriptor.startColumn + (column - layout.halo) * descriptor.sampleStride));
        const globalRow = Math.max(0, Math.min(coastal.grid.rows - 1, descriptor.startRow + (row - layout.halo) * descriptor.sampleStride));
        const offset = (row * layout.width + column) * 4, key = `${globalColumn}/${globalRow}`;
        if (!map.has(key)) map.set(key, { globalColumn, globalRow, display: pixels[offset] >> 4, semantic: pixels[offset] & 15, cover: pixels[offset + 1], code: pixels[offset + 2] | pixels[offset + 3] << 8 });
    }
    return map;
}

function compareShared(pages) {
    const seen = new Map();
    let shared = 0;
    for (const page of pages) for (const [key, texel] of texels(page)) {
        const previous = seen.get(key);
        if (previous) { shared++; assert.deepEqual([texel.display, texel.semantic, texel.cover], [previous.display, previous.semantic, previous.cover], `${page.descriptor.id} ${key} disagrees with ${previous.id}`); }
        else seen.set(key, { ...texel, id: page.descriptor.id });
    }
    return shared;
}

// the label a sample must display: overrides last, semantic soil for natural cover, the published label (or the overview infill on a stale native)
async function expectedDisplay(manifest, display, globalColumn, globalRow, cover, stale = new Set()) {
    const x = manifest.bounds.minX + globalColumn * manifest.grid.spacingX, z = manifest.bounds.maxZ - globalRow * manifest.grid.spacingZ;
    const native = `l3/c${Math.min(7, Math.floor(globalColumn / 256))}/r${Math.min(7, Math.floor(globalRow / 256))}`, chunk = chunkOf(manifest, native);
    if (!display.isPlanning(cover) || stale.has(native)) return display.sample(x, z, cover) >> 4;
    const labels = await naturalPage(native);
    assert.ok(labels, `planning cover in ${native} needs a published natural-soil page`);
    return display.sample(x, z, cover, labels[(globalRow - chunk.startRow) * 257 + globalColumn - chunk.startColumn]) >> 4;
}

test('Natural inference: the shared source binds the published sidecar, reports every native and shares one load', async () => {
    assert.equal(terrain.status, 'active');
    assert.equal(terrain.requests.length, 1);
    const snapshot = terrain.snapshot();
    assert.deepEqual([snapshot.policy, snapshot.fallbackPolicy, snapshot.mode, snapshot.revision, snapshot.terrainRevision, snapshot.bound],
        [LANDSCAPE_NATURAL_SOIL.terrain, LANDSCAPE_NATURAL_SOIL.overview, 'terrain', 'terrain-fields-5dbdfc766dca6cce908bd7b4', coastal.revision, true]);
    assert.deepEqual(snapshot.natives, { total: 64, terrain: 64, overview: 0 });
    assert.deepEqual(snapshot.pages, { published: 58, unique: 27, byteLength: 66049, transientWorkerBytes: 132098 });
    assert.equal(snapshot.fallbackScope, 'none');
    assert.ok(Object.values(snapshot.policyByNative).every(policy => policy === LANDSCAPE_NATURAL_SOIL.terrain));
    assert.equal(snapshot.inference.planningSamples, 747898);
    // the terrain-field pages reuse the memoized sidecar load instead of fetching it again
    assert.equal(await terrain.sidecar(), await terrain.sidecar());
    assert.equal(terrain.requests.length, 1);
    const request = terrain.describe(['l3/c3/r3', 'l3/c0/r0']);
    assert.deepEqual(request.pages['l3/c0/r0'], null, 'a chunk without planning cover has no page');
    assert.equal(request.pages['l3/c3/r3'].byteLength, 66049);
    assert.deepEqual(request.overviewNatives, []);
    assert.throws(() => terrain.describe(['l9/c0/r0']), /no chunk/);
    const loaded = { manifest: coastal, manifestUrl: MANIFEST_URL }, { fetchImpl, requests } = fetchFor();
    const first = acquireLandscapeNaturalInference(loaded, { fetchImpl }), second = acquireLandscapeNaturalInference(loaded, { fetchImpl });
    assert.equal(first.source, second.source, 'both streams of one load share a source');
    assert.throws(() => acquireLandscapeNaturalInference(loaded, { mode: 'overview' }), /already uses mode terrain; received overview/, 'one load never mixes policies');
    await first.source.ready;
    assert.equal(requests.length, 1);
    first.release(); first.release();
    assert.equal(second.source.disposed, undefined, 'a source lives while any stream holds it');
    second.release();
    assert.equal(second.source.disposed, true);
    const third = acquireLandscapeNaturalInference(loaded, { fetchImpl });
    assert.notEqual(third.source, first.source, 'a disposed source is never reused');
    third.release();
});

test('Natural inference: planning samples display the published labels identically at every level, page border and halo', async () => {
    const chain = await Promise.all(['l0/c0/r0', 'l1/c0/r0', 'l2/c1/r1', 'l3/c3/r3', 'l3/c4/r3'].map(id => mask(id)));
    const shared = compareShared(chain);
    assert.ok(shared > 50000, `${shared} shared samples compared`);
    let planning = 0, differs = 0;
    for (const page of chain) for (const texel of texels(page).values()) {
        assert.equal(texel.display, await expectedDisplay(coastal, presentation, texel.globalColumn, texel.globalRow, texel.cover), `${page.descriptor.id} ${texel.globalColumn}/${texel.globalRow}`);
        if (!presentation.isPlanning(texel.cover)) continue;
        planning++;
        const x = texel.globalColumn * coastal.grid.spacingX, z = 4000 - texel.globalRow * coastal.grid.spacingZ;
        if (texel.display !== presentation.sample(x, z, texel.cover) >> 4) differs++;
        assert.equal(texel.semantic, soilIndex('unknown'), 'semantic soil keeps the imported planning class');
        assert.notEqual(texel.display, soilIndex('unknown'));
    }
    assert.ok(planning > 100000 && differs > 10000, `${differs} of ${planning} planning samples differ from the overview infill`);
    for (const page of chain) assert.equal(page.natural.overviewSamples, 0);
    assert.deepEqual(chain.map(page => page.natural.terrainSamples > 0), [true, true, true, true, true]);
    // contour codes of adjacent native pages agree bit for bit on their shared border and halos
    const [left, right] = [texels(chain[3]), texels(chain[4])];
    let border = 0;
    for (const [key, texel] of right) if (left.has(key)) { border++; assert.equal(left.get(key).code, texel.code, key); }
    assert.equal(border, 5 * 261);
    // fallback mesh colors use the same labels: a planning vertex has the color of its published natural soil
    const native = chunkOf(coastal, 'l3/c3/r3'), labels = await naturalPage('l3/c3/r3'), resolver = createLandscapeNaturalSoilResolver(coastal, terrain.describe([native.id]));
    const cover = (await loadCover(native.id)).landCover, chunk = { descriptor: native, heights: new Float32Array(257 * 257), landCover: cover };
    const buffers = buildLandscapeMeshBuffers({ chunk, manifest: coastal, presentation, naturalAt: (column, row) => resolver.label(labels, native, native.startColumn + column, native.startRow + row) });
    const palette = new Map(coastal.landCover.catalog.map(entry => [entry.soilId, entry.color]));
    const linear = hex => [16, 8, 0].map(shift => { const s = (parseInt(hex.slice(1), 16) >> shift & 255) / 255; return Math.round((s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4) * 255); });
    for (const i of [0, 1000, 33024, 66048]) assert.deepEqual([...buffers.colors.slice(i * 3, i * 3 + 3)], linear(palette.get(soilIds[labels[i]])), `vertex ${i}`);
});

test('Natural inference: a stale native keeps the overview infill for exactly its samples at every level, without seams', async () => {
    const edited = staleManifest(['l3/c3/r3']), source = await sourceFor(edited), display = presentationOf(edited);
    assert.equal(source.status, 'active-partial');
    assert.equal(source.reason, 'terrain-fields-stale-chunks');
    const snapshot = source.snapshot();
    assert.deepEqual(snapshot.overviewNatives, [{ id: 'l3/c3/r3', reason: 'stale' }]);
    assert.deepEqual(snapshot.natives, { total: 64, terrain: 63, overview: 1 });
    assert.equal(snapshot.policyByNative['l3/c3/r3'], LANDSCAPE_NATURAL_SOIL.overview);
    assert.equal(snapshot.fallbackScope, 'stale-natives');
    const chain = await Promise.all(['l0/c0/r0', 'l1/c0/r0', 'l2/c1/r1', 'l3/c3/r3', 'l3/c4/r3', 'l3/c2/r3'].map(id => mask(id, source, edited, display)));
    assert.ok(compareShared(chain) > 50000);
    const stale = new Set(['l3/c3/r3']);
    for (const page of chain) for (const texel of texels(page).values()) {
        assert.equal(texel.display, await expectedDisplay(edited, display, texel.globalColumn, texel.globalRow, texel.cover, stale), `${page.descriptor.id} ${texel.globalColumn}/${texel.globalRow}`);
    }
    const [l0, , l2, staleNative, fresh] = chain;
    // a sample belongs to the native min(7, floor(index / 256)) on each axis: the stale page's east column and south row are owned by its fresh
    // neighbors (their channels, which include those samples, are unchanged), so both pages choose the same policy for them
    assert.deepEqual([staleNative.natural.terrainSamples, staleNative.natural.overviewByReason.stale], [2 * 257 - 1, 256 * 256], 'the stale native falls back for every sample it owns');
    assert.ok(fresh.natural.terrainSamples === 66049 && fresh.natural.overviewSamples === 0, 'its fresh neighbor keeps the published labels');
    assert.ok(l2.natural.terrainSamples > 0 && l2.natural.overviewByReason.stale > 0 && l0.natural.overviewByReason.stale > 0, 'coarser pages mix per native, never per page');
    assert.equal(staleNative.natural.pages.includes('l3/c3/r3'), false, 'a fully stale native never reads its natural page');
    assert.ok(staleNative.natural.pages.includes('l3/c4/r3') && staleNative.natural.pages.includes('l3/c3/r4'), 'its shared border reads the owning neighbors');
    const [left, right] = [texels(staleNative), texels(fresh)];
    for (const [key, texel] of right) if (left.has(key)) assert.equal(left.get(key).code, texel.code, `stale/fresh border ${key}`);
    const warn = console.warn; console.warn = () => {};
    const all = await sourceFor(staleManifest(coastal.chunks.filter(chunk => chunk.level === 3).map(chunk => chunk.id))).finally(() => { console.warn = warn; });
    assert.deepEqual(all.errors, [{ status: 'stale', message: 'terrain-fields-all-chunks-stale' }]);
    assert.deepEqual([all.status, all.reason, all.describe(['l3/c3/r3']).active], ['stale', 'terrain-fields-all-chunks-stale', false]);
});

test('Natural inference: absent, disabled, invalid and mismatched sidecars fall back everywhere with an explicit status', async () => {
    const absent = await sourceFor(coastal, { body: '', status: 404 });
    assert.deepEqual([absent.status, absent.reason, absent.errors.length], ['absent', 'terrain-fields-404', 0]);
    assert.deepEqual(absent.snapshot().natives, { total: 64, terrain: 0, overview: 64 });
    assert.equal(absent.snapshot().fallbackScope, 'all-natives');
    const disabled = await sourceFor(coastal, { mode: 'overview' });
    assert.deepEqual([disabled.status, disabled.reason, disabled.requests.length], ['disabled', 'natural-inference-overview-mode', 0]);
    const corrupt = structuredClone(sidecar); corrupt.pages[3].naturalSoil.byteLength = 7;
    const warn = console.warn; console.warn = () => {};
    try {
        const invalid = await sourceFor(coastal, { body: JSON.stringify(corrupt) });
        assert.equal(invalid.status, 'invalid');
        assert.match(invalid.reason, /naturalSoil/);
        const mismatch = structuredClone(coastalJson); mismatch.coordinates.seaLevel = 3;
        assert.equal((await sourceFor(validateLandscapeManifest(mismatch))).status, 'binding-mismatch');
        const budget = new LandscapeResidencyBudget({ cpuBytes: 512 * 1024, gpuBytes: 1024 });
        const denied = await sourceFor(coastal, { ledger: budget });
        assert.deepEqual([denied.status, denied.reason], ['budget-denied', 'natural-inference-manifest-cpu-budget']);
        // a sidecar that has not arrived when the root must be built leaves this load on the overview infill
        const hanging = new LandscapeNaturalInference({ loaded: { manifest: coastal, manifestUrl: MANIFEST_URL }, loadTimeoutMs: 20, fetchImpl: () => new Promise(() => {}) });
        assert.deepEqual([(await hanging.ready).status, hanging.reason, hanging.describe(['l3/c3/r3']).active], ['timeout', 'natural-inference-sidecar-timeout-20-ms', false]);
        hanging.dispose();
    } finally { console.warn = warn; }
    // every inactive source displays exactly the former overview infill
    for (const id of ['l1/c0/r0', 'l3/c3/r3']) {
        const fallback = await mask(id, absent), reference = await mask(id, null);
        assert.deepEqual(fallback.pixels, reference.pixels, id);
        assert.equal(fallback.natural.terrainSamples, 0);
        assert.equal(fallback.natural.overviewSamples, fallback.natural.overviewByReason.inactive);
    }
    // the viewer forwards its mode to both streams (AI577 D5: a LandscapeView option, no module-level default)
    assert.throws(() => landscapeNaturalInferenceMode('nearest'), /natural inference must be one of terrain, overview/);
    assert.equal(landscapeNaturalInferenceMode('overview'), 'overview');
    assert.throws(() => new LandscapeNaturalInference({ loaded: { manifest: coastal, manifestUrl: MANIFEST_URL }, mode: 'nearest' }), /natural inference must be one of terrain, overview/);
    assert.equal(new LandscapeNaturalInference({ loaded: { manifest: coastal, manifestUrl: MANIFEST_URL }, mode: 'overview' }).mode, 'overview');
    const viewer = new LandscapeNaturalInference({ loaded: { manifest: coastal, manifestUrl: MANIFEST_URL }, mode: 'overview', fetchImpl: () => { throw new Error('the overview switch must not request the sidecar'); } });
    assert.equal((await viewer.ready).status, 'disabled');
    assert.equal(LANDSCAPE_NATURAL_INFERENCE.defaultMode, 'terrain');
});

test('Natural inference: ordered soil overrides still win over terrain labels, including an explicit override to unknown', async () => {
    const sand = { type: 'rectangle', minX: 1700, maxX: 1800, minZ: 2200, maxZ: 2300 }, unknown = { type: 'circle', center: { x: 1760, z: 2260 }, radius: 15 };
    const edited = withOverrides(coastal, [{ soilId: 'sand', region: sand }, { soilId: 'unknown', region: unknown }]), display = presentationOf(edited);
    const source = await sourceFor(edited);
    assert.equal(source.status, 'active', 'soil overrides never stale natural soil');
    const chain = await Promise.all(['l2/c1/r1', 'l3/c3/r3'].map(id => mask(id, source, edited, display)));
    compareShared(chain);
    let inUnknown = 0, inSand = 0, outside = 0;
    for (const texel of texels(chain[1]).values()) {
        const x = texel.globalColumn * edited.grid.spacingX, z = 4000 - texel.globalRow * edited.grid.spacingZ;
        if (landscapeRegionContains(unknown, x, z)) { inUnknown++; assert.deepEqual([texel.display, texel.semantic], [soilIndex('unknown'), soilIndex('unknown')]); }
        else if (landscapeRegionContains(sand, x, z)) { inSand++; assert.deepEqual([texel.display, texel.semantic], [soilIndex('sand'), soilIndex('sand')]); }
        else {
            outside++;
            assert.equal(texel.display, await expectedDisplay(edited, display, texel.globalColumn, texel.globalRow, texel.cover));
        }
    }
    assert.ok(inUnknown > 100 && inSand > 1000 && outside > 60000, `${inUnknown} unknown, ${inSand} sand, ${outside} outside`);
    assert.ok(chain[1].soils.includes(soilIndex('unknown')), 'an explicit unknown override keeps its material interest');
});

test('Natural inference: generated fine pages read the same labels and v4 identities separate recipes and policies', async () => {
    const recipe = LANDSCAPE_SURFACE_DETAIL_RECIPE, seed = landscapeSurfaceDetailSeed(coastal.id, recipe), index = createLandscapeSurfaceDetailIndex(coastal, { levels: 3 });
    const id = 'l6/c31/r28', descriptor = index.descriptor(id), owners = index.support(descriptor, recipe).owners.map(owner => owner.id);
    const terrainRequest = terrain.describe(owners), base = { manifest: coastal, descriptor, recipe, seed, presentation, loadCover };
    naturalReads.length = 0;
    const fine = await createLandscapeSurfaceDetailPage({ ...base, natural: terrainRequest, loadNatural }), fallback = await createLandscapeSurfaceDetailPage(base);
    assert.ok(naturalReads.length > 0 && naturalReads.length <= owners.length);
    assert.deepEqual([...fine.metadata.naturalSoilIds], owners.filter(owner => terrainRequest.pages[owner]));
    assert.deepEqual(fallback.metadata.naturalSoilIds, []);
    // identities: the worker key equals the main-thread key of the same request, and policies never share one
    assert.equal(fine.metadata.key, landscapeSurfaceDetailKey(index.inputs(descriptor, recipe, seed, terrainRequest)));
    assert.equal(fallback.metadata.key, landscapeSurfaceDetailKey(index.inputs(descriptor, recipe, seed, null)));
    assert.notEqual(fine.metadata.key, fallback.metadata.key);
    assert.deepEqual(fine.metadata.inputs.natural, owners.map(owner => ({ id: owner, policy: LANDSCAPE_NATURAL_SOIL.terrain, sha256: terrainRequest.pages[owner]?.sha256 ?? null })));
    const v3 = validateLandscapeSurfaceDetailRecipe({ ...structuredClone(recipe), id: 'landscape-surface-detail-v3', base: { ...structuredClone(recipe.base), labels: LANDSCAPE_NATURAL_SOIL.overview } });
    assert.notEqual(landscapeSurfaceDetailRecipeHash(v3), landscapeSurfaceDetailRecipeHash(recipe));
    const v3Inputs = landscapeSurfaceDetailInputs(coastal, id, v3, seed);
    assert.deepEqual([v3Inputs.schemaVersion, v3Inputs.natural], [1, undefined]);
    assert.notEqual(landscapeSurfaceDetailKey(v3Inputs), fallback.metadata.key, 'v3 and v4 pages never share a cache identity');
    await assert.rejects(createLandscapeSurfaceDetailPage({ ...base, recipe: v3, seed, natural: terrainRequest, loadNatural }), /cannot read natural soil requests/);
    const v3Page = await createLandscapeSurfaceDetailPage({ ...base, recipe: v3, seed });
    assert.deepEqual(v3Page.pixels, fallback.pixels, 'the overview fallback reproduces the v3 labels byte for byte');
    // the terrain page differs where terrain labels differ; a uniform fine texel inside a 9 x 9 native neighborhood of one display label
    // (farther than the 3 m warp plus one smoothing cell from any native boundary) shows exactly that native label
    let different = 0, compared = 0, decisive = 0;
    for (let offset = 0; offset < fine.pixels.length; offset += 4) if (fine.pixels[offset] >> 4 !== fallback.pixels[offset] >> 4) different++;
    assert.ok(different > 1000, `${different} fine texels change with the policy`);
    const native = new Map([...texels(await mask('l3/c3/r3')), ...texels(await mask('l3/c4/r3'))]), width = descriptor.columns + 4;
    const neighborhood = (nativeColumn, nativeRow) => {
        let label = -1;
        for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
            const texel = native.get(`${nativeColumn + dc}/${nativeRow + dr}`);
            if (!texel || label >= 0 && texel.display !== label) return -1;
            label = texel.display;
        }
        return label;
    };
    for (let row = 0; row < descriptor.rows + 4; row += 3) for (let column = 0; column < width; column += 3) {
        const offset = (row * width + column) * 4;
        if ((fine.pixels[offset + 2] | fine.pixels[offset + 3] << 8) !== LANDSCAPE_CONTOUR_COVERAGE.uniformSupportCode) continue;
        const fineColumn = descriptor.fineStartColumn + column - 2, fineRow = descriptor.fineStartRow + row - 2, label = neighborhood(Math.round(fineColumn / 8), Math.round(fineRow / 8));
        if (label < 0) continue;
        compared++;
        assert.equal(fine.pixels[offset] >> 4, label, `${id} uniform texel ${fineColumn},${fineRow}`);
        if (fallback.pixels[offset] >> 4 !== label) decisive++;
    }
    assert.ok(compared > 100 && decisive > 10, `${compared} uniform texels compared, ${decisive} of them differ from the overview fallback`);
    // a stale owner renews exactly the keys of pages whose support it owns
    const staleSource = await sourceFor(staleManifest(['l3/c3/r3']));
    for (const page of ['l6/c31/r28', 'l6/c33/r28', 'l6/c40/r28']) {
        const fineDescriptor = index.descriptor(page), pageOwners = index.support(fineDescriptor, recipe).owners.map(owner => owner.id);
        const before = landscapeSurfaceDetailKey(index.inputs(fineDescriptor, recipe, seed, terrain.describe(pageOwners)));
        const after = landscapeSurfaceDetailKey(index.inputs(fineDescriptor, recipe, seed, staleSource.describe(pageOwners)));
        assert.equal(before !== after, pageOwners.includes('l3/c3/r3'), page);
    }
    assert.deepEqual(landscapeNaturalSoilIdentity(coastal, null, ['l3/c3/r3']), [{ id: 'l3/c3/r3', policy: LANDSCAPE_NATURAL_SOIL.overview }]);
});

test('Natural inference: pages are validated and their worker bytes are reserved in the mask, detail and build accounting', async () => {
    const page = await naturalPage('l3/c3/r3'), chunk = chunkOf(coastal, 'l3/c3/r3');
    assert.deepEqual(landscapeNaturalSoilIndices(coastal), ['seabed', 'sand', 'loam', 'forest', 'rock'].map(soilIndex).sort((a, b) => a - b));
    assert.equal(validateLandscapeNaturalSoilPage(coastal, chunk, page), page);
    assert.throws(() => validateLandscapeNaturalSoilPage(coastal, chunk, page.subarray(1)), /must hold 66049 labels/);
    const bad = page.slice(); bad[77] = soilIndex('unknown');
    assert.throws(() => validateLandscapeNaturalSoilPage(coastal, chunk, bad), /label 0 at 77 is not a natural catalog soil/);
    const resolver = createLandscapeNaturalSoilResolver(coastal, terrain.describe(['l3/c3/r3']));
    await assert.rejects(resolver.load(chunk, async () => bad), /not a natural catalog soil/);
    assert.throws(() => createLandscapeNaturalSoilResolver(coastal, { ...terrain.describe(['l3/c3/r3']), url: 'file:///x' }), /absolute terrain-fields manifest URL/);
    assert.throws(() => resolver.entry(chunkOf(coastal, 'l3/c0/r0')), /does not cover chunk/);
    // transient worker bytes: one page and its fetch buffer when a chunk reads a page, nothing otherwise
    assert.equal(terrain.transientBytes(['l3/c3/r3']), 2 * 66049);
    assert.equal(terrain.transientBytes(['l3/c0/r0', 'l3/c1/r0']), 0);
    assert.equal((await sourceFor(staleManifest(['l3/c3/r3']))).transientBytes(['l3/c3/r3']), 0, 'a fully stale chunk reads no page');
    assert.equal((await sourceFor(coastal, { mode: 'overview' })).transientBytes(['l3/c3/r3']), 0);
    // detail worker contexts add their bounded natural page cache only while the policy is active
    const plain = landscapeSurfaceDetailWorkerBytes(overview, 257 * 257), natural = landscapeSurfaceDetailWorkerBytes(overview, 257 * 257, { naturalSoil: true });
    assert.equal(natural - plain, LANDSCAPE_SURFACE_DETAIL_RUNTIME.workerCoverPages * 66049);
    assert.equal(natural, 1188882);
    // mask decode reservations include the natural pages of their owners and end with the upload
    const shared = new LandscapeResidencyBudget(), requests = [];
    const budget = { shared, reserve: (key, resources) => shared.reserve(key, resources), update: (key, resources) => shared.update(key, resources), release: key => shared.release(key) };
    const vector = () => ({ set() { return this; } }), uniforms = { uMaskPages: { value: null }, uMaskDimensions: { value: vector() }, uMaskMeta: { value: Array.from({ length: 17 }, vector) } };
    const pool = { request: payload => { requests.push(payload); return new Promise(() => {}); } };
    const masks = new LandscapeMaskPages({ loaded: { manifest: coastal, chunk: { descriptor: overview, landCover: overviewCover } }, budget, pool, renderer: { initTexture() {} }, uniforms, prefix: 'natural-test', capacity: 17, natural: terrain });
    assert.equal(masks.decodeBytes, 945598 + 132098);
    masks.request('l3/c3/r3', 1); masks.request('l3/c0/r0', 2);
    const decode = shared.snapshot().entries.filter(entry => entry.kind === 'appearance-mask-decode').map(entry => [entry.key.split('/mask/')[1].split('/').slice(1, 4).join('/'), entry.cpuBytes]);
    assert.deepEqual(decode, [['l0/c0/r0', 945598 + 132098], ['l3/c3/r3', 945598 + 132098], ['l3/c0/r0', 945598]]);
    assert.equal(requests[1].natural.pages['l3/c3/r3'].sha256, sidecar.pages.find(entry => entry.id === 'l3/c3/r3').naturalSoil.sha256);
    assert.deepEqual(Object.keys(requests[1].natural.pages), landscapeCoverageMaskOwners(coastal, chunk).map(owner => owner.id));
    masks.dispose();
    assert.deepEqual([shared.snapshot().cpuBytes, shared.snapshot().entries.length], [0, 0]);
    const ledger = new LandscapeResidencyBudget(), loading = new LandscapeNaturalInference({ loaded: { manifest: coastal, manifestUrl: MANIFEST_URL }, ledger, fetchImpl: fetchFor().fetchImpl });
    assert.deepEqual(ledger.snapshot().entries.map(entry => [entry.kind, entry.cpuBytes]), [['natural-inference-manifest-decode', LANDSCAPE_NATURAL_INFERENCE.manifestDecodeBytes]]);
    await loading.ready;
    assert.deepEqual([ledger.snapshot().cpuBytes, ledger.snapshot().entries.length], [0, 0], 'only the bounded page table stays after the decode');
    loading.dispose();
});
