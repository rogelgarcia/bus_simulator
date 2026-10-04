// Checks the fine surface-detail runtime: profile sizing, the content-addressed view cache and fine-page scheduling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateLandscapeManifest, createLandscapeSurfaceDetailIndex, landscapeSurfaceDetailKey, landscapeSurfaceDetailRecipeHash, LandscapeResidencyBudget } from '../../../src/app/landscape/index.js';
import { LandscapeAppearanceBudget, landscapeTextureBytes } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceBudget.js';
import { landscapeCoverageMaskLayout } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCoverage.js';
import { LANDSCAPE_SURFACE_DETAIL_RECIPE, landscapeSurfaceDetailSeed } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailRecipe.js';
import { LANDSCAPE_SURFACE_DETAIL_CACHE, LandscapeSurfaceDetailCache, landscapeSurfaceDetailCacheCapacity } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailCache.js';
import { LANDSCAPE_SURFACE_DETAIL_RUNTIME, LandscapeSurfaceDetailPages, landscapeSurfaceDetailCapacity, landscapeSurfaceDetailWorkerBytes,
    landscapeSurfaceDetailDisabledSnapshot } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailPages.js';
import { landscapeSurfaceDetailScratchBytes } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailField.js';

const MIB = 1024 * 1024;
const coastalUrl = new URL('../../../assets/public/landscape/coastal-city/manifest.json', import.meta.url);
const coastal = validateLandscapeManifest(JSON.parse(await readFile(coastalUrl, 'utf8')));
const appearance = JSON.parse(await readFile(new URL('appearance/manifest.json', coastalUrl), 'utf8'));
const recipe = LANDSCAPE_SURFACE_DETAIL_RECIPE, seed = landscapeSurfaceDetailSeed(coastal.id, recipe);
const pageBytes = landscapeCoverageMaskLayout(coastal.chunks[0]).pageBytes;
const slots = { total: 81, native: 17, detail: 64 };

test('Surface detail runtime: fine slot capacity follows device slots, levels and the appearance GPU headroom', () => {
    assert.equal(pageBytes, 261 * 261 * 4);
    const materialBytes = 6 * 3 * (landscapeTextureBytes(512) + landscapeTextureBytes(32)) + 3 * landscapeTextureBytes(128);
    const sized = limits => landscapeSurfaceDetailCapacity({ levels: 3, coverageSlots: slots, limits, pageBytes, nativeCapacity: 17, materials: appearance.materials });
    const shipped = sized({ cpuBytes: 192 * MIB, gpuBytes: 96 * MIB });
    assert.deepEqual({ ...shipped }, { capacity: 64, reason: null, headroomBytes: 96 * MIB - 17 * pageBytes - materialBytes, materialAllowanceBytes: materialBytes });
    assert.equal(sized({ cpuBytes: 64 * MIB, gpuBytes: 32 * MIB }).capacity, Math.floor((32 * MIB - 17 * pageBytes - materialBytes) / pageBytes), 'the historical 128/64 MiB profile keeps a full 512-pixel material set');
    assert.equal(sized({ cpuBytes: 64 * MIB, gpuBytes: 32 * MIB }).capacity, 12);
    assert.deepEqual([sized({ cpuBytes: 8 * MIB, gpuBytes: 4 * MIB }).capacity, sized({ cpuBytes: 8 * MIB, gpuBytes: 4 * MIB }).reason], [0, 'appearance-gpu-below-8-mib']);
    assert.deepEqual([sized({ cpuBytes: 16 * MIB, gpuBytes: 8 * MIB }).capacity, sized({ cpuBytes: 16 * MIB, gpuBytes: 8 * MIB }).reason], [0, 'appearance-gpu-headroom']);
    const off = landscapeSurfaceDetailCapacity({ levels: 0, coverageSlots: slots, limits: { gpuBytes: 96 * MIB }, pageBytes, nativeCapacity: 17, materials: appearance.materials });
    assert.deepEqual([off.capacity, off.reason], [0, 'surface-detail-off']);
    const device = landscapeSurfaceDetailCapacity({ levels: 3, coverageSlots: { detail: 12 }, limits: { gpuBytes: 96 * MIB }, pageBytes, nativeCapacity: 17, materials: appearance.materials });
    assert.equal(device.capacity, 12, 'the WebGL2 minimum device keeps its twelve compiled fine slots');
    assert.equal(landscapeSurfaceDetailCapacity({ levels: 3, coverageSlots: { detail: 0 }, limits: { gpuBytes: 96 * MIB }, pageBytes, nativeCapacity: 17, materials: appearance.materials }).reason, 'device-coverage-slots');
    assert.throws(() => landscapeSurfaceDetailCapacity({ levels: 3, coverageSlots: slots, limits: { gpuBytes: 96 * MIB }, pageBytes: 0, nativeCapacity: 17, materials: [] }), /capacity needs/);
    const overview = coastal.chunks.find(chunk => chunk.id === coastal.overviewId);
    assert.equal(landscapeSurfaceDetailWorkerBytes(overview, 257 * 257), 257 * 257 * (1 + 5 + LANDSCAPE_SURFACE_DETAIL_RUNTIME.workerCoverPages));
    const disabled = landscapeSurfaceDetailDisabledSnapshot({ levels: 3, reason: 'appearance-gpu-below-8-mib', recipe, recipeHash: landscapeSurfaceDetailRecipeHash(recipe), seed });
    assert.deepEqual([disabled.enabled, disabled.capacity, disabled.pending, disabled.missingWork], [false, 0, 0, false]);
});

test('Surface detail cache: profile capacity is 48 pages when shipped, bounded below and zero without fine detail', () => {
    assert.equal(LANDSCAPE_SURFACE_DETAIL_CACHE.maxPages, 48);
    assert.equal(landscapeSurfaceDetailCacheCapacity({ limits: { cpuBytes: 384 * MIB, gpuBytes: 192 * MIB }, pageBytes, levels: 3 }), 48 * pageBytes);
    assert.equal(landscapeSurfaceDetailCacheCapacity({ limits: { cpuBytes: 128 * MIB, gpuBytes: 64 * MIB }, pageBytes, levels: 2 }), Math.floor(8 * MIB / pageBytes) * pageBytes);
    assert.equal(landscapeSurfaceDetailCacheCapacity({ limits: { cpuBytes: 16 * MIB, gpuBytes: 8 * MIB }, pageBytes, levels: 3 }), 0);
    assert.equal(landscapeSurfaceDetailCacheCapacity({ limits: { cpuBytes: 384 * MIB, gpuBytes: 192 * MIB }, pageBytes, levels: 0 }), 0);
    for (const input of [{ limits: { cpuBytes: -1, gpuBytes: 1 }, pageBytes, levels: 3 }, { limits: { cpuBytes: 1, gpuBytes: 1 }, pageBytes: 0, levels: 3 }, { limits: { cpuBytes: 1, gpuBytes: 1 }, pageBytes, levels: 1.5 }]) {
        assert.throws(() => landscapeSurfaceDetailCacheCapacity(input), /LandscapeSurfaceDetailCache/);
    }
});

function entry(fill, bytes = 1000) { return { pixels: new Uint8Array(bytes).fill(fill), soils: [fill % 6], sourceIds: ['l3/c0/r0'], metadata: { fill } }; }

test('Surface detail cache: pages are taken by identity, evicted least recently stored and reserved exactly in the ledger', () => {
    const shared = new LandscapeResidencyBudget(), cache = new LandscapeSurfaceDetailCache({ budget: shared, key: 'cache', capacityBytes: 3000 });
    const reserved = () => shared.snapshot().entries.find(value => value.key === 'cache');
    assert.deepEqual({ cpu: reserved().cpuBytes, gpu: reserved().gpuBytes, kind: reserved().kind }, { cpu: 0, gpu: 0, kind: 'appearance-surface-detail-cache' });
    for (const fill of [1, 2, 3]) assert.equal(cache.store(`page-${fill}`, entry(fill)), true);
    assert.equal(reserved().cpuBytes, 3000);
    assert.equal(cache.store('page-4', entry(4)), true);
    assert.equal(cache.has('page-1'), false, 'the oldest stored page is evicted first');
    assert.equal(reserved().cpuBytes, 3000);
    assert.equal(cache.take('page-1'), null);
    const taken = cache.take('page-3');
    assert.equal(taken.pixels[0], 3);
    assert.deepEqual(taken.metadata, { fill: 3 });
    assert.equal(cache.has('page-3'), false, 'a hit moves the page out of the cache');
    assert.equal(reserved().cpuBytes, 2000);
    assert.equal(cache.store('page-5', entry(5)), true);
    assert.equal(cache.store('page-5', entry(6)), true, 'a repeated identity replaces its page');
    assert.equal(cache.take('page-5').pixels[0], 6);
    assert.equal(cache.store('huge', entry(7, 4000)), false, 'a page larger than the capacity is rejected');
    const snapshot = cache.snapshot();
    assert.deepEqual({ hits: snapshot.hits, misses: snapshot.misses, evicted: snapshot.evicted, rejected: snapshot.rejected, pages: snapshot.pages, bytes: snapshot.bytes },
        { hits: 2, misses: 1, evicted: 1, rejected: 1, pages: 2, bytes: 2000 });
    assert.throws(() => cache.store('', entry(1)), /identity/);
    assert.throws(() => cache.store('bad', { pixels: [1], soils: [], sourceIds: [] }), /page pixels/);
    cache.dispose();
    assert.equal(shared.has('cache'), false);
    assert.equal(shared.snapshot().cpuBytes, 0);
    assert.throws(() => cache.take('page-2'), /disposed/);
});

test('Surface detail cache: a full shared ledger evicts cached pages before refusing and uniform identities need no bytes', () => {
    const shared = new LandscapeResidencyBudget({ cpuBytes: 5000, gpuBytes: 1000 }), cache = new LandscapeSurfaceDetailCache({ budget: shared, key: 'cache', capacityBytes: 4000 });
    assert.equal(shared.reserve('geometry', { cpuBytes: 2500, gpuBytes: 0, kind: 'geometry' }).admitted, true);
    assert.equal(cache.store('a', entry(1)), true);
    assert.equal(cache.store('b', entry(2)), true);
    assert.equal(cache.store('c', entry(3)), true, 'the oldest page makes room when the ledger is full');
    assert.equal(cache.has('a'), false);
    assert.equal(shared.snapshot().cpuBytes, 4500);
    assert.equal(shared.update('geometry', { cpuBytes: 4500 }).admitted, false);
    shared.release('geometry');
    assert.equal(shared.reserve('geometry', { cpuBytes: 4600, gpuBytes: 0, kind: 'geometry' }).admitted, false);
    assert.equal(shared.reserve('geometry', { cpuBytes: 3000, gpuBytes: 0, kind: 'geometry' }).admitted, true);
    assert.equal(cache.store('d', entry(4)), true);
    assert.equal(cache.snapshot().pages, 2, 'only what the ledger admits is retained');
    assert.equal(shared.update('geometry', { cpuBytes: 5000 }).admitted, false);
    assert.equal(cache.snapshot().deniedReason, 'cpu-budget');
    assert.equal(cache.uniformSoil('u'), -1);
    assert.equal(cache.storeUniform('u', 3), true);
    assert.equal(cache.uniformSoil('u'), 3);
    assert.throws(() => cache.storeUniform('u', 16), /uniform soil/);
    const disabled = new LandscapeSurfaceDetailCache({ budget: shared, key: 'disabled', capacityBytes: 0 });
    assert.equal(disabled.store('x', entry(1)), false);
    assert.equal(disabled.storeUniform('x', 1), false, 'profiles without fine capacity keep no uniform identities either');
    const bounded = new LandscapeSurfaceDetailCache({ budget: shared, key: 'bounded', capacityBytes: 1, maxUniform: 2 });
    for (const id of ['p', 'q', 'r']) bounded.storeUniform(id, 1);
    assert.deepEqual([bounded.uniformSoil('p'), bounded.uniformSoil('q'), bounded.uniformSoil('r')], [-1, 1, 1]);
    for (const value of [cache, disabled, bounded]) value.dispose();
    shared.release('geometry');
    assert.equal(shared.snapshot().cpuBytes, 0);
});

function fakeMasks(budget, { detailCapacity = 4 } = {}) {
    const nativeCapacity = 17, uniforms = { uMaskMeta: { value: Array.from({ length: nativeCapacity + detailCapacity }, () => ({ values: [-1, 0, 0, 0], set(...values) { this.values = values; } })) } };
    const texture = { layers: [], needsUpdate: false, addLayerUpdate(layer) { this.layers.push(layer); }, clearLayerUpdates() {} };
    const masks = { manifest: coastal, prefix: 'test-appearance', pageBytes, slotCount: nativeCapacity + detailCapacity, capacity: nativeCapacity, pixels: new Uint8Array(pageBytes * (nativeCapacity + detailCapacity)),
        texture, renderer: { initialized: 0, initTexture() { this.initialized++; } }, uniforms, records: new Map(), wanted: new Set([coastal.overviewId]), failures: new Map(),
        descriptors: new Map(coastal.chunks.map(chunk => [chunk.id, chunk])), nativeEpoch: 0, detail: null,
        remove(record) { if (this.records.get(record.id) !== record) return; if (record.kind === 'detail') this.detail.release(record); else this.records.delete(record.id); } };
    for (const id of [coastal.overviewId, 'l1/c0/r1', 'l2/c1/r3', 'l3/c2/r6']) {
        masks.records.set(id, { id, kind: 'native', descriptor: masks.descriptors.get(id), slot: masks.records.size, progress: 1, status: 'resident', soils: [1, 2, 3] });
        masks.wanted.add(id);
    }
    return masks;
}

function fakePool() {
    const jobs = [];
    return { jobs, request(payload, { signal } = {}) {
        return new Promise((resolve, reject) => {
            const job = { payload, resolve, reject };
            signal?.addEventListener('abort', () => reject(new DOMException('canceled', 'AbortError')), { once: true });
            jobs.push(job);
        });
    } };
}

function setup(t, { capacity = 4, cacheBytes = 4 * pageBytes } = {}) {
    let now = 1000;
    t.mock.method(performance, 'now', () => now);
    const shared = new LandscapeResidencyBudget(), budget = new LandscapeAppearanceBudget(shared, 'test-appearance');
    const masks = fakeMasks(budget, { detailCapacity: capacity }), pool = fakePool(), cache = new LandscapeSurfaceDetailCache({ budget: shared, key: 'view-cache', capacityBytes: cacheBytes });
    const index = createLandscapeSurfaceDetailIndex(coastal, { levels: 3 });
    masks.detail = new LandscapeSurfaceDetailPages({ masks, budget, pool, cache, index, recipe, recipeHash: landscapeSurfaceDetailRecipeHash(recipe), seed, levels: 3,
        capacity, firstSlot: 17, workerContextBytes: 0 });
    return { shared, budget, masks, pool, cache, index, detail: masks.detail, advance: ms => { now += ms; } };
}

const camera = { position: { x: 1061, y: 11, z: 888 } };
const plan = (ids, pixels = {}) => ({ visibleMaskIds: ['l3/c2/r6', 'l3/c1/r6'], desiredTiers: { sand: '512', loam: '512', seabed: '128', unknown: '32', forest: '128', rock: '128' },
    detail: { visibleIds: ids, pixelsById: Object.fromEntries(ids.map(id => [id, pixels[id] ?? 10])) } });

test('Surface detail pages: planning keeps fine ancestors, requires natively wanted parents and respects the slot capacity', t => {
    const { detail, masks, index } = setup(t, { capacity: 3 });
    const near = 'l6/c17/r49', far = 'l6/c8/r49', second = 'l5/c10/r24';
    assert.deepEqual([index.nativeAncestorId(near), index.nativeAncestorId(far), index.nativeAncestorId(second)], ['l3/c2/r6', 'l3/c1/r6', 'l3/c2/r6']);
    detail.plan(plan([second, far, near]), camera);
    assert.deepEqual(detail.order, ['l4/c4/r12', 'l5/c8/r24', near], 'the closest chain enters top-down and the next chain no longer fits three slots');
    assert.equal(detail.nativeLimited, 1, 'pages below natively unwanted pages are degraded, not requested');
    assert.equal(detail.capacityLimited, true);
    masks.records.set('l4/c4/r12', { id: 'l4/c4/r12', kind: 'detail', descriptor: index.descriptor('l4/c4/r12'), slot: -1, status: 'uniform', soil: 2, soils: [2], progress: 1 });
    detail.plan(plan([near, second]), camera);
    assert.deepEqual(detail.order, ['l4/c4/r12', 'l5/c8/r24', near, 'l4/c5/r12', second], 'uniform pages and their descendants need no slots');
    assert.equal(detail.capacityLimited, false);
});

test('Surface detail pages: cached pages need no worker, uploads stay bounded and evicted resident pages return to the cache', t => {
    const { detail, masks, pool, cache, index, shared } = setup(t);
    const id = 'l4/c4/r12', inputs = index.inputs(index.descriptor(id), recipe, seed), identity = landscapeSurfaceDetailKey(inputs);
    const pixels = new Uint8Array(pageBytes).fill(7);
    assert.equal(cache.store(identity, { pixels, soils: [2, 3], sourceIds: ['l3/c2/r6'], metadata: { key: identity } }), true);
    detail.plan(plan([id]), camera);
    detail.update(8 * MIB);
    assert.equal(pool.jobs.length, 0, 'a cache hit dispatches no generation');
    const record = masks.records.get(id);
    assert.deepEqual([record.status, record.source, record.slot, record.identity], ['decoded', 'cache', 17, identity]);
    assert.equal(cache.snapshot().pages, 0);
    assert.equal(shared.snapshot().entries.find(value => value.key === record.key).cpuBytes, pageBytes, 'the pending page is reserved in the appearance ledger');
    assert.equal(detail.update(pageBytes - 1), 0, 'the remaining shared upload allowance gates layer uploads');
    assert.equal(detail.update(8 * MIB), pageBytes);
    assert.deepEqual([record.status, record.progress, masks.texture.layers.at(-1), masks.pixels[17 * pageBytes]], ['resident', 0, 17, 7]);
    assert.equal(shared.snapshot().entries.find(value => value.key === record.key).cpuBytes, 0, 'the resident layer is accounted by the fine array reservation');
    const interests = new Map(), tiers = {};
    detail.interests(plan([id]), interests, tiers);
    assert.deepEqual([...interests.get(2)], ['l3/c2/r6'], 'fine soils join their visible native ancestor');
    assert.equal(tiers.sand, '512');
    masks.records.get('l3/c2/r6').progress = .5;
    const fading = {};
    detail.interests(plan([id]), new Map(), fading);
    assert.equal(fading.sand, '32', 'fine residency never upgrades tiers beyond what the native page allows');
    masks.pixels[17 * pageBytes] = 9;
    masks.remove(record);
    assert.equal(masks.records.has(id), false);
    assert.deepEqual(masks.uniforms.uMaskMeta.value[17].values, [-1, 0, 0, 0]);
    assert.equal(cache.take(identity).pixels[0], 9, 'the resident layer is copied from the CPU mirror into the cache');
    assert.equal(shared.snapshot().entries.some(value => value.key === record.key), false);
});

test('Surface detail pages: generation reserves scratch, uniform results free the slot and descendants inherit uniformity', async t => {
    const { detail, masks, pool, index, shared } = setup(t);
    const id = 'l4/c4/r12', child = 'l5/c8/r24', grandchild = 'l6/c17/r49';
    detail.plan(plan([grandchild]), camera);
    detail.update(8 * MIB);
    assert.equal(pool.jobs.length, 1);
    assert.deepEqual(pool.jobs[0].payload, { type: 'detail', pageId: id });
    const record = masks.records.get(id), reservation = shared.snapshot().entries.find(value => value.key === record.key);
    assert.deepEqual([reservation.cpuBytes, reservation.kind], [landscapeSurfaceDetailScratchBytes(coastal, 4, recipe), 'appearance-surface-detail-generation']);
    assert.equal(masks.records.has(child), false, 'children wait for a fully faded resident parent');
    pool.jobs[0].resolve({ pixels: null, soils: [3], sourceIds: [], metadata: { key: record.identity, shortcut: true, uniformSoil: 3, timingsMs: { total: 4 } } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual([record.status, record.slot, record.soil, record.key], ['uniform', -1, 3, null]);
    assert.equal(shared.snapshot().entries.some(value => value.kind === 'appearance-surface-detail-generation'), false);
    detail.update(8 * MIB);
    assert.deepEqual([masks.records.get(child).status, masks.records.get(child).source, masks.records.get(grandchild).status], ['uniform', 'descent', 'uniform']);
    assert.equal(pool.jobs.length, 1, 'uniform descendants need no generation');
    assert.equal(detail.cache.uniformSoil(record.identity), 3, 'support-uniform results are remembered by identity');
    const snapshot = detail.snapshot();
    assert.deepEqual([snapshot.uniformIds.length, snapshot.pending, snapshot.missingWork, snapshot.uniformResolutions.generated, snapshot.uniformResolutions.descent], [3, 0, false, 1, 2]);
    assert.equal(index.isFine(grandchild), true);
});

test('Surface detail pages: failed generation keeps the parent, records the identity and retries once after 2.5 s', async t => {
    const { detail, masks, pool, advance } = setup(t);
    const id = 'l4/c4/r12', settle = () => new Promise(resolve => setTimeout(resolve, 0));
    detail.plan(plan([id]), camera);
    detail.update(8 * MIB);
    const identity = masks.records.get(id).identity;
    pool.jobs[0].reject(new Error('landscape cover l3/c2/r6 HTTP 500'));
    await settle();
    assert.equal(masks.records.has(id), false);
    assert.equal(masks.records.get('l3/c2/r6').status, 'resident', 'the parent coverage is retained');
    assert.deepEqual({ ...detail.failures.get(id), retryAt: undefined }, { id, identity, level: 4, message: 'landscape cover l3/c2/r6 HTTP 500', attempts: 1, retryAt: undefined });
    assert.equal(detail.snapshot().missingWork, true, 'a pending retry keeps the view unsettled');
    detail.update(8 * MIB);
    assert.equal(pool.jobs.length, 1, 'no retry before 2.5 seconds');
    advance(LANDSCAPE_SURFACE_DETAIL_RUNTIME.retryDelayMs);
    detail.update(8 * MIB);
    assert.equal(pool.jobs.length, 2);
    pool.jobs[1].reject(new Error('landscape cover l3/c2/r6 HTTP 500'));
    await settle();
    advance(10000);
    detail.update(8 * MIB);
    assert.equal(pool.jobs.length, 2, 'at most one retry');
    const snapshot = detail.snapshot();
    assert.deepEqual([snapshot.errors[0].attempts, snapshot.missingWork, snapshot.degradationReason], [2, false, 'surface-detail-request-failed']);
});

test('Surface detail pages: obsolete work is canceled and a budget refusal is explicit degradation', async t => {
    const { detail, masks, pool, shared } = setup(t);
    detail.plan(plan(['l4/c4/r12']), camera);
    detail.update(8 * MIB);
    let canceled = false;
    masks.records.get('l4/c4/r12').abort.signal.addEventListener('abort', () => { canceled = true; });
    detail.plan(plan([]), camera);
    assert.equal(canceled, true, 'unwanted generation aborts its worker job');
    assert.equal(masks.records.size, 4);
    assert.equal(shared.snapshot().entries.some(value => value.key.includes('/detail/')), false);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(detail.jobs, 0);
    assert.equal(shared.reserve('pressure', { cpuBytes: 384 * MIB - shared.snapshot().cpuBytes, gpuBytes: 0, kind: 'geometry' }).admitted, true, 'only the appearance credit remains, smaller than L4 scratch');
    detail.plan(plan(['l4/c4/r12']), camera);
    detail.update(8 * MIB);
    assert.equal(pool.jobs.length, 1);
    const snapshot = detail.snapshot();
    assert.deepEqual([snapshot.budgetLimited, snapshot.missingWork, snapshot.degradationReason], ['cpu-budget', false, 'surface-detail-budget']);
});
