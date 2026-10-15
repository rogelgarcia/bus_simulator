// Streams the ecosystem's content layers into the viewer (AI 599 D3): the sidecar bound to the loaded landscape, its published tiles and the runtime layers generated in the ecosystem worker, resident inside the ecosystem share and drawn by the instanced renderer.
// @ts-check
// Design: the sidecar is loaded and bound before anything else is reserved (an absent, stale, unbound, invalid or denied sidecar leaves an inert handle
// that says why), the renderer and asset sets come from the embedded recipe through the view's factory, and every frame plans with a bounded cost:
// the visible layers' desired cells (LandscapeEcosystemStreamingPlan) merge nearest first, at most maxInFlight jobs run in the ecosystem worker
// (published tiles fetched and verified, runtime cells generated), one decoded tile attaches per frame within the upload allowance the view passes,
// tiles leaving the keep disc detach (runtime tiles into a bounded cache that saves their regeneration) and a tile that stops being desired is
// cancelled. Every byte is a reservation in the ecosystem share, made before the job starts (a runtime cell reserves a provisional share of its sites,
// corrected on arrival); a denial first evicts tiles nobody wants, then admits the longest rank prefix that fits, materialized so the accounted bytes
// are the held bytes, and reports the degradation. The renderer leases a tile while it is attached (`leases`, a plain counter: a reserved share offers
// none); eviction detaches first. Runtime overrides re-derive the offline tiles in place (no refetch) and regenerate the runtime ones; the density
// scale regenerates the runtime layers only, the offline tiles carry the baked scale.
import { LandscapeWorkerPool } from '../LandscapeWorkerPool.js';
import { LANDSCAPE_ECOSYSTEM } from './LandscapeEcosystemModel.js';
import { createInertEcosystemStreamer, ecosystemBinding, ecosystemCellDistance, ecosystemFrustumPlanes, ecosystemRuntimeEstimate, ecosystemShareAvailable, ecosystemTileAdmission, ecosystemTileBytes, ecosystemTileHeightRange, ecosystemWorkerCacheBytes,
    planEcosystemLayerCells } from './LandscapeEcosystemStreamingPlan.js';
import { ECOSYSTEM_RECORD, LandscapeEcosystemBindingError, applyEcosystemOverrides, ecosystemCellBounds, ecosystemNativeChunkIds, ecosystemOverridesIdentity, ecosystemTileId, ecosystemTileStale, encodeEcosystemTile, landscapeEcosystemStaleness,
    loadLandscapeEcosystem, loadLandscapeEcosystemTiles, sampleLandscapeChunk, validateEcosystemOverrides, validateEcosystemRecipe } from '../../../../app/landscape/index.js';

const STREAMING = LANDSCAPE_ECOSYSTEM.streaming, F = ECOSYSTEM_RECORD.floats, I = ECOSYSTEM_RECORD.idInts, ZERO = Object.freeze({ cpuBytes: 0, gpuBytes: 0 });
const SOURCE_FAILURE = /runtime generation would not reproduce the bake|has no landscape context/;

async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Loads, binds and starts the ecosystem of a loaded landscape. Resolves to a handle whatever happened: `status` is `active` (or `active-partial` when
 * some natives changed since the bake) only when tiles stream; the other statuses carry a `reason` and hold nothing.
 * @param {{landscape:any,url:string,budget:any,createRenderer:(recipe:any,options:{signal?:AbortSignal})=>Promise<{renderer:any,assets:any}>,planning?:{features:readonly any[],dependency?:readonly any[]}|null,
 *   densityScale?:number,overrides?:any,signal?:AbortSignal,isTileInjected?:(tileId:string)=>boolean,workerUrl?:URL}} options landscape is the frozen result of loadLandscapeOverview; budget the view's ecosystem share
 *   (createLandscapeEcosystemLedger); createRenderer builds D4's asset sets and renderer for the embedded recipe (the streamer owns and disposes them); planning the overlay's normalized features and
 *   dependency; isTileInjected names the tiles the view attached itself (never fetched nor evicted here)
 */
export async function createLandscapeEcosystemStreamer({ landscape, url, budget, createRenderer, planning = null, densityScale = 1, overrides = null, signal, isTileInjected = () => false, workerUrl = new URL('./LandscapeEcosystemWorker.js', import.meta.url) }) {
    if (!landscape?.manifest || !landscape.chunk || typeof landscape.manifestUrl !== 'string') throw new Error('[LandscapeEcosystem] The streamer needs the loaded landscape');
    if (typeof url !== 'string' || !url) throw new Error('[LandscapeEcosystem] The streamer needs the sidecar manifest URL');
    if (!budget?.reserve || !budget.release || !budget.shareSnapshot) throw new Error('[LandscapeEcosystem] The streamer needs the ecosystem share');
    if (typeof createRenderer !== 'function') throw new Error('[LandscapeEcosystem] The streamer needs the renderer factory');
    if (!(Number.isFinite(densityScale) && densityScale >= 0 && densityScale <= 16)) throw new Error('[LandscapeEcosystem] The density scale must lie in 0..16');
    const started = performance.now(), manifest = landscape.manifest, inert = (status, reason, extra = {}) => createInertEcosystemStreamer({ status, reason, url, landscape, planning, loadMs: performance.now() - started, ...extra });
    const standing = new Map(), release = () => { for (const key of standing.keys()) budget.release(key); standing.clear(); };
    const reserve = (key, bytes) => { const admission = budget.reserve(key, { cpuBytes: bytes, gpuBytes: 0 }); if (admission.admitted) standing.set(key, bytes); return admission; };
    const decodeKey = 'ecosystem/sidecar-decode', decode = reserve(decodeKey, STREAMING.sidecarDecodeBytes);
    if (!decode.admitted) return inert('budget-denied', `ecosystem-sidecar-${decode.reason}`);
    let sidecar;
    try { sidecar = await loadLandscapeEcosystem(url, { landscape: manifest, signal }); }
    catch (error) {
        release();
        if (error.name === 'AbortError') throw error;
        return inert(error instanceof LandscapeEcosystemBindingError ? 'binding-mismatch' : error.message.startsWith('[Landscape]') ? 'invalid' : 'failed', error.message);
    }
    if (!sidecar) { release(); return inert('absent', `no ecosystem sidecar at ${url}`); }
    const staleness = landscapeEcosystemStaleness(sidecar, manifest);
    if (staleness.staleChunks.length === sidecar.terrain.chunks.length) { release(); return inert('stale', `every native of ${sidecar.terrain.revision} changed; the landscape is ${manifest.revision}`, { sidecar }); }
    const recipe = validateEcosystemRecipe(sidecar.recipe), layers = new Map();
    let validatedOverrides = null;
    try {
        validatedOverrides = overrides === null ? null : validateEcosystemOverrides(overrides, recipe);
        for (const entry of sidecar.layers) {
            const layer = recipe.layers[entry.id], state = { layer, entry, generation: layer.generation, visible: true, index: null, indexUrl: null, stale: new Set(), records: new Map(), cache: new Map(), failures: new Map(), failure: null, keepRadius: 0, wanted: 0,
                counters: { loaded: 0, generated: 0, cached: 0, restored: 0, evictions: 0, canceled: 0, denied: 0, degraded: 0, failed: 0 } };
            if (entry.tiles) {
                const admission = reserve(`ecosystem/index/${entry.id}`, entry.tiles.byteLength * STREAMING.indexDecodeFactor);
                if (!admission.admitted) { release(); return inert('budget-denied', `ecosystem-index-${admission.reason}`, { sidecar }); }
                const index = await loadLandscapeEcosystemTiles(entry.tiles, { manifestUrl: url, sidecar, layerId: entry.id, signal });
                state.indexUrl = new URL(entry.tiles.url, url).href; state.index = new Map(index.tiles.map(tile => [tile.id, tile]));
                for (const tile of index.tiles) if (ecosystemTileStale(sidecar, manifest, entry.id, tile, staleness)) state.stale.add(tile.id);
            }
            layers.set(entry.id, state);
        }
    } catch (error) {
        release();
        if (error.name === 'AbortError') throw error;
        return inert(error.message.startsWith('[Landscape]') ? 'invalid' : 'failed', error.message, { sidecar });
    }
    budget.release(decodeKey); standing.delete(decodeKey);
    let rendering;
    try { rendering = await createRenderer(recipe, { signal }); }
    catch (error) {
        release();
        if (error.name === 'AbortError') throw error;
        return inert(/cannot fit/.test(error.message) ? 'budget-denied' : 'failed', error.message, { sidecar });
    }
    if (!rendering?.renderer?.attachTile || !rendering.assets?.get) { release(); rendering?.renderer?.dispose?.(); rendering?.assets?.dispose?.(); throw new Error('[LandscapeEcosystem] createRenderer must resolve to { renderer, assets }'); }
    const workerCache = reserve('ecosystem/worker-cache', ecosystemWorkerCacheBytes(manifest, recipe));
    const indexes = Object.fromEntries([...layers.values()].filter(state => state.index).map(state => [state.layer.id, { tiles: [...state.index.values()] }]));
    const pool = new LandscapeWorkerPool({ size: STREAMING.workers, workerUrl, context: { type: 'initialize', manifest, manifestUrl: landscape.manifestUrl, ecosystemUrl: url, sidecar, indexes, planning: planning ? { features: planning.features } : null, cache: STREAMING.workerCache } });
    const streamer = new LandscapeEcosystemStreamer({ landscape, url, budget, sidecar, recipe, staleness, layers, standing, renderer: rendering.renderer, assets: rendering.assets, pool, planning, densityScale, overrides: validatedOverrides, isTileInjected, loadMs: performance.now() - started });
    if (!workerCache.admitted) for (const state of layers.values()) if (state.generation === 'runtime') state.failure = `the worker caches cannot fit the ecosystem share (${workerCache.reason}); runtime layers are not generated`;
    if (validatedOverrides) streamer.overridesIdentity = await ecosystemOverridesIdentity(validatedOverrides);
    return streamer;
}

export class LandscapeEcosystemStreamer {
    constructor({ landscape, url, budget, sidecar, recipe, staleness, layers, standing, renderer, assets, pool, planning, densityScale, overrides, isTileInjected, loadMs }) {
        Object.assign(this, { landscape, url, budget, sidecar, recipe, staleness, layers, standing, renderer, assets, pool, planning, isTileInjected, loadMs });
        this.manifest = landscape.manifest;
        this.status = staleness.staleChunks.length ? 'active-partial' : 'active';
        this.reason = staleness.staleChunks.length ? `${staleness.staleChunks.length} natives changed since ${sidecar.terrain.revision}; their tiles are never loaded` : null;
        this.runtimeDensity = densityScale;
        this.overrides = overrides;
        this.overridesIdentity = null;
        this.nativeById = new Map(this.manifest.chunks.filter(chunk => chunk.level === this.manifest.grid.maxLevel).map(chunk => [chunk.id, chunk]));
        this.heightRanges = new Map();
        this.disposed = false;
        this.planned = false;
        this.missing = 0;
        this.degradation = null;
        this.uploadedBytes = 0;
        this.peakUploadedBytes = 0;
        this.invalidations = 0;
        this.determinism = [];
        this.errors = [];
        this.timing = { updates: 0, lastPlanMs: 0, peakPlanMs: 0, totalPlanMs: 0, uploads: 0, lastUploadMs: 0, peakUploadMs: 0, loads: 0, totalLoadMs: 0, peakLoadMs: 0, settledAtMs: null };
    }

    get active() { return !this.disposed; }

    // the generation inputs every worker job carries (the cache key names the overrides and density it was generated under)
    generation() { return { overrides: this.overrides, densityScale: this.runtimeDensity, key: `${this.overridesIdentity ?? 'none'}|${this.runtimeDensity}` }; }

    // the native descriptors' height envelope over a cell (memoized), the box the frustum test grows by the asset reach
    heightRange(layer, cellX, cellZ) {
        const id = ecosystemTileId(layer.id, cellX, cellZ);
        let range = this.heightRanges.get(id);
        if (!range) {
            let low = Infinity, high = -Infinity;
            for (const nativeId of ecosystemNativeChunkIds(this.manifest, ecosystemCellBounds(layer.cell.meters, cellX, cellZ))) { const descriptor = this.nativeById.get(nativeId); low = Math.min(low, descriptor.minHeight); high = Math.max(high, descriptor.maxHeight); }
            range = low <= high ? [low, high] : [this.manifest.coordinates.seaLevel, this.manifest.coordinates.seaLevel];
            this.heightRanges.set(id, range);
        }
        return range;
    }

    /** @param {number} dt seconds @param {any} camera @param {number} viewportHeight @param {number} [uploadAllowance] remaining bytes of the frame's upload cap @returns {number} uploaded bytes */
    update(dt, camera, viewportHeight, uploadAllowance = Infinity) {
        this.uploadedBytes = 0;
        if (this.disposed) return 0;
        const started = performance.now();
        camera.updateMatrixWorld();
        const planes = ecosystemFrustumPlanes(camera.projectionMatrix.elements, camera.matrixWorldInverse.elements), x = camera.position.x, z = camera.position.z, wanted = [];
        this.cameraX = x; this.cameraZ = z;
        for (const state of this.layers.values()) {
            for (const record of state.records.values()) record.desired = false;
            state.wanted = 0;
            if (!state.visible || state.failure) continue;
            const asset = this.assets.get(state.layer.assetSet), margin = asset.heightMeters * state.layer.variation.scale.max + 2 * asset.footprintRadiusMeters;
            const plan = planEcosystemLayerCells({ layer: state.layer, cameraX: x, cameraZ: z, landscapeBounds: this.manifest.bounds, planes, heightRangeOf: (cellX, cellZ) => this.heightRange(state.layer, cellX, cellZ), margin,
                include: state.index ? id => state.index.has(id) && !state.stale.has(id) : null });
            state.keepRadius = plan.keepRadius;
            for (const cell of plan.desired) {
                if (this.isTileInjected(cell.id)) continue;
                state.wanted++;
                const record = state.records.get(cell.id);
                if (record) { record.desired = true; record.distance = cell.distance; } else if (!this.retryBlocked(state, cell.id)) wanted.push({ state, cell });
            }
        }
        wanted.sort((a, b) => a.cell.distance - b.cell.distance || a.cell.id.localeCompare(b.cell.id));
        for (const state of this.layers.values()) for (const record of [...state.records.values()]) {
            if (record.desired) continue;
            record.distance = ecosystemCellDistance(record.bounds, x, z);
            // a loading tile nobody wants is cancelled; a resident one stays until it leaves the keep disc (or its layer is hidden)
            if (record.status === 'loading' || !state.visible || record.distance > state.keepRadius) this.retire(state, record);
        }
        this.trimRuntimeCache();
        let inFlight = this.inFlight(), missing = 0;
        for (const { state, cell } of wanted) {
            const cached = state.cache.get(cell.id);
            if (cached) { this.restore(state, cached, cell); continue; }
            if (inFlight >= STREAMING.maxInFlight) { missing++; continue; }
            const outcome = this.request(state, cell);
            if (outcome === 'requested') inFlight++; else if (outcome !== 'denied') missing++;
        }
        this.missing = missing;
        this.uploadOne(uploadAllowance);
        this.renderer.update({ camera, dt });
        this.planned = true;
        const elapsed = performance.now() - started;
        this.timing.updates++; this.timing.lastPlanMs = elapsed; this.timing.totalPlanMs += elapsed; this.timing.peakPlanMs = Math.max(this.timing.peakPlanMs, elapsed);
        if (this.settled()) this.timing.settledAtMs ??= performance.now(); else this.timing.settledAtMs = null;
        return this.uploadedBytes;
    }

    inFlight() { let count = 0; for (const state of this.layers.values()) for (const record of state.records.values()) if (record.status === 'loading') count++; return count; }

    retryBlocked(state, id) {
        const failure = state.failures.get(id);
        return !!failure && (failure.attempts >= STREAMING.maxAttempts || performance.now() < failure.retryAt);
    }

    // reserves the tile's bytes (an offline tile's exact size, a runtime cell's provisional estimate) and starts its job; a denial evicts unwanted tiles, then admits a rank prefix
    request(state, cell) {
        const entry = state.index?.get(cell.id) ?? null, estimate = entry ? ecosystemTileBytes(entry.count) : ecosystemRuntimeEstimate(state.layer), key = `ecosystem/stream/${cell.id}`;
        let admission = this.budget.reserve(key, estimate), reserved = estimate, admitted = entry ? entry.count : null, reason = null;
        if (!admission.admitted && this.freeRoom(estimate)) admission = this.budget.reserve(key, estimate);
        if (!admission.admitted) {
            const prefix = ecosystemTileAdmission({ count: entry ? entry.count : estimate.cpuBytes / (ECOSYSTEM_RECORD.bytes + ECOSYSTEM_RECORD.idBytes), available: ecosystemShareAvailable(this.budget.shareSnapshot()) });
            if (prefix.admitted === 0 || !(admission = this.budget.reserve(key, { cpuBytes: prefix.cpuBytes, gpuBytes: prefix.gpuBytes })).admitted) { state.counters.denied++; this.degradation = prefix.reason ?? `ecosystem-${admission.reason}`; return 'denied'; }
            reserved = { cpuBytes: prefix.cpuBytes, gpuBytes: prefix.gpuBytes }; admitted = prefix.admitted; reason = prefix.reason; this.degradation = reason;
        }
        const record = { id: cell.id, layerId: state.layer.id, cellX: cell.cellX, cellZ: cell.cellZ, bounds: cell.bounds, entry, status: 'loading', key, reserved, admitted, reason, abort: new AbortController(), tile: null, drawn: null, count: 0, fullCount: entry?.count ?? null,
            overrideResult: null, desired: true, distance: cell.distance, requestedAt: performance.now(), leases: 0 };
        state.records.set(cell.id, record);
        const payload = entry ? { type: 'tile', layerId: state.layer.id, tile: entry, indexUrl: state.indexUrl } : { type: 'generate', layerId: state.layer.id, cellX: cell.cellX, cellZ: cell.cellZ, ...this.generation() };
        this.pool.request(payload, { priority: STREAMING.workerPriority + Math.max(0, 1 - cell.distance / 4000), signal: record.abort.signal }).then(result => this.arrive(state, record, result), error => this.fail(state, record, error));
        return 'requested';
    }

    arrive(state, record, result) {
        if (this.disposed || record.abort.signal.aborted || state.records.get(record.id) !== record) return;
        const { records, ids, count } = result;
        if (!(records instanceof Float32Array) || records.length !== count * F || !(ids instanceof Int32Array) || ids.length !== count * I) { this.fail(state, record, new Error(`tile ${record.id} returned malformed arrays`)); return; }
        const loadMs = performance.now() - record.requestedAt;
        this.timing.loads++; this.timing.totalLoadMs += loadMs; this.timing.peakLoadMs = Math.max(this.timing.peakLoadMs, loadMs);
        record.fullCount = count; record.loadMs = loadMs;
        // an offline tile keeps the prefix admitted at request time (its payload is fetched whole); a runtime cell replaces its estimate by its exact size, or by the prefix that fits now
        let admitted = record.entry ? Math.min(record.admitted ?? count, count) : count;
        if (!record.entry) {
            const exact = ecosystemTileBytes(count);
            let update = this.budget.update(record.key, exact);
            if (!update.admitted && this.freeRoom(exact, record)) update = this.budget.update(record.key, exact);
            if (update.admitted) { record.reserved = exact; record.reason = null; }
            else {
                const prefix = ecosystemTileAdmission({ count, available: ecosystemShareAvailable(this.budget.shareSnapshot(), record.reserved) });
                this.budget.update(record.key, { cpuBytes: prefix.cpuBytes, gpuBytes: prefix.gpuBytes });
                record.reserved = { cpuBytes: prefix.cpuBytes, gpuBytes: prefix.gpuBytes }; admitted = prefix.admitted; record.reason = prefix.reason; this.degradation = prefix.reason;
            }
            state.counters.generated++;
        } else state.counters.loaded++;
        record.tile = admitted < count ? { records: records.slice(0, admitted * F), ids: ids.slice(0, admitted * I), count: admitted } : { records, ids, count };
        record.count = admitted;
        if (admitted < count) state.counters.degraded++;
        record.status = 'decoded';
        this.redraw(state, record);
    }

    // the drawn tile: the decoded one, or for an offline tile under runtime overrides the post-generation steps applied to it (the pristine tile is kept for the next change)
    redraw(state, record) {
        if (!this.overrides || state.generation !== 'offline') {
            record.drawn = record.tile; record.overrideResult = null;
            const alone = ecosystemTileBytes(record.tile.count);
            if (record.reserved.cpuBytes !== alone.cpuBytes || record.reserved.gpuBytes !== alone.gpuBytes) { this.budget.update(record.key, alone); record.reserved = alone; }
            return;
        }
        const applied = applyEcosystemOverrides(record.tile, { layerId: record.layerId, bounds: record.bounds, overrides: this.overrides, groundAt: (x, z) => { const sample = sampleLandscapeChunk(this.manifest, this.landscape.chunk, x, z); return sample.status === 'ready' ? { height: sample.height, normal: sample.normal } : null; } });
        record.drawn = applied.tile; record.overrideResult = { masked: applied.masked, removed: applied.removed, pinned: applied.pinned.length, unplaced: applied.unplaced.length };
        const both = { cpuBytes: ecosystemTileBytes(record.tile.count).cpuBytes + ecosystemTileBytes(applied.tile.count).cpuBytes, gpuBytes: ecosystemTileBytes(applied.tile.count).gpuBytes };
        if (this.budget.update(record.key, both).admitted) { record.reserved = both; return; }
        // no room for the pristine copy beside the drawn one: the drawn tile stands alone and a later change refetches it
        record.tile = applied.tile; record.count = applied.tile.count;
        const alone = ecosystemTileBytes(applied.tile.count);
        this.budget.update(record.key, alone); record.reserved = alone;
    }

    uploadOne(uploadAllowance) {
        let best = null;
        for (const state of this.layers.values()) for (const record of state.records.values()) if (record.status === 'decoded' && (!best || record.distance < best.record.distance)) best = { state, record };
        if (!best) return;
        const { record } = best, bytes = record.drawn.records.byteLength;
        if (bytes > uploadAllowance) return;
        const started = performance.now();
        this.renderer.attachTile({ id: record.id, layerId: record.layerId, cellX: record.cellX, cellZ: record.cellZ, bounds: record.bounds, heightRange: ecosystemTileHeightRange(record.drawn.records, record.drawn.count, this.manifest.coordinates.seaLevel), records: record.drawn.records, ids: record.drawn.ids, count: record.drawn.count });
        record.status = 'resident'; record.leases = 1;
        this.uploadedBytes = bytes; this.peakUploadedBytes = Math.max(this.peakUploadedBytes, bytes);
        this.timing.uploads++; this.timing.lastUploadMs = performance.now() - started; this.timing.peakUploadMs = Math.max(this.timing.peakUploadMs, this.timing.lastUploadMs);
    }

    detach(record) {
        if (record.status === 'resident') { this.renderer.detachTile(record.id); record.leases = 0; }
    }

    // a tile leaving the keep disc: loading jobs are cancelled, offline tiles release their bytes, generated runtime tiles wait in the cache
    retire(state, record) {
        state.records.delete(record.id);
        if (record.status === 'loading') { record.abort.abort(); this.budget.release(record.key); state.counters.canceled++; return; }
        this.detach(record);
        state.counters.evictions++;
        if (state.generation === 'runtime') { record.status = 'cached'; record.drawn = null; state.cache.set(record.id, record); state.counters.cached++; return; }
        this.budget.release(record.key);
    }

    drop(state, record) {
        if (state.cache.delete(record.id)) { this.budget.release(record.key); return; }
        if (!state.records.delete(record.id)) return;
        if (record.status === 'loading') { record.abort.abort(); state.counters.canceled++; } else { this.detach(record); state.counters.evictions++; }
        this.budget.release(record.key);
    }

    restore(state, cached, cell) {
        state.cache.delete(cached.id);
        cached.status = 'decoded'; cached.desired = true; cached.distance = cell.distance; cached.drawn = cached.tile;
        state.records.set(cached.id, cached); state.counters.restored++;
    }

    cacheBytes() { let bytes = 0; for (const state of this.layers.values()) for (const record of state.cache.values()) bytes += record.reserved.cpuBytes; return bytes; }

    trimRuntimeCache() {
        let total = this.cacheBytes();
        if (total <= STREAMING.runtimeCacheBytes) return;
        const cached = [];
        for (const state of this.layers.values()) for (const record of state.cache.values()) cached.push({ state, record, distance: ecosystemCellDistance(record.bounds, this.cameraX, this.cameraZ) });
        cached.sort((a, b) => b.distance - a.distance);
        for (const { state, record } of cached) { if (total <= STREAMING.runtimeCacheBytes) break; total -= record.reserved.cpuBytes; this.drop(state, record); }
    }

    // evicts the farthest tiles nobody wants (cached first, then resident ones outside the view disc) until the share has room for `needed`; false when nothing could go
    freeRoom(needed, keep = null) {
        const candidates = [], x = this.cameraX ?? 0, z = this.cameraZ ?? 0;
        for (const state of this.layers.values()) {
            for (const record of state.cache.values()) candidates.push({ state, record, rank: 1, distance: ecosystemCellDistance(record.bounds, x, z) });
            for (const record of state.records.values()) if (!record.desired && record !== keep && record.status !== 'loading') candidates.push({ state, record, rank: 0, distance: ecosystemCellDistance(record.bounds, x, z) });
        }
        candidates.sort((a, b) => b.rank - a.rank || b.distance - a.distance);
        let freed = false;
        for (const { state, record } of candidates) {
            const available = ecosystemShareAvailable(this.budget.shareSnapshot(), keep?.reserved ?? ZERO);
            if (available.cpuBytes >= needed.cpuBytes && available.gpuBytes >= needed.gpuBytes) break;
            this.drop(state, record); freed = true;
        }
        return freed;
    }

    fail(state, record, error) {
        if (error.name === 'AbortError' || this.disposed || state.records.get(record.id) !== record) return;
        state.records.delete(record.id);
        this.budget.release(record.key);
        const previous = state.failures.get(record.id);
        state.failures.set(record.id, { attempts: (previous?.attempts ?? 0) + 1, retryAt: performance.now() + STREAMING.retryDelayMs, message: error.message });
        state.counters.failed++;
        if (SOURCE_FAILURE.test(error.message)) state.failure = error.message;
        if (this.errors.length < 16) this.errors.push({ layerId: state.layer.id, tileId: record.id, message: error.message });
        console.warn(`[LandscapeEcosystem] tile ${record.id} failed: ${error.message}`);
    }

    /** Re-derives every tile for an overrides document (null clears it): offline tiles in place, runtime tiles regenerate. Resolves with the snapshot. @param {any} document */
    async setOverrides(document) {
        const next = document === null || document === undefined ? null : validateEcosystemOverrides(document, this.recipe), identity = next ? await ecosystemOverridesIdentity(next) : null;
        if (this.disposed || identity === this.overridesIdentity) return this.snapshot();
        this.overrides = next; this.overridesIdentity = identity;
        this.invalidate({ runtime: true, offline: true });
        return this.snapshot();
    }

    /** The density scale of the runtime layers (the offline tiles carry the baked scale, reported in the snapshot). @param {number} scale */
    setDensityScale(scale) {
        if (!(Number.isFinite(scale) && scale >= 0 && scale <= 16)) throw new Error(`[LandscapeEcosystem] The density scale must lie in 0..16; received ${String(scale)}`);
        if (scale === this.runtimeDensity) return;
        this.runtimeDensity = scale;
        this.invalidate({ runtime: true, offline: false });
    }

    invalidate({ runtime, offline }) {
        for (const state of this.layers.values()) {
            if (state.generation === 'runtime') {
                if (!runtime) continue;
                for (const record of [...state.records.values()]) { this.drop(state, record); this.invalidations++; }
                for (const record of [...state.cache.values()]) { this.drop(state, record); this.invalidations++; }
            } else if (offline) for (const record of state.records.values()) {
                if (record.status === 'loading') continue;
                this.detach(record); record.status = 'decoded';
                this.redraw(state, record); this.invalidations++;
            }
        }
    }

    /** @param {string} layerId @param {boolean} visible a hidden layer streams nothing and releases its tiles */
    setLayerVisible(layerId, visible) {
        const state = this.layers.get(layerId);
        if (!state) throw new Error(`[LandscapeEcosystem] unknown ecosystem layer ${String(layerId)}`);
        if (typeof visible !== 'boolean') throw new Error('[LandscapeEcosystem] layer visibility must be boolean');
        state.visible = visible;
    }

    /** Drops a tile the view takes over (the injection hook). @param {string} tileId */
    evictTile(tileId) {
        for (const state of this.layers.values()) { const record = state.records.get(tileId) ?? state.cache.get(tileId); if (record) { this.drop(state, record); return true; } }
        return false;
    }

    /** The rule trace at a position of a site layer, or at a picked instance (its parent site and child index) of any layer. @param {string} layerId @param {number} x @param {number} z @param {{siteX?:number,siteZ?:number,child?:number}} [site] */
    trace(layerId, x, z, site = {}) {
        if (!this.recipe.layers[layerId]) return Promise.reject(new Error(`[LandscapeEcosystem] unknown ecosystem layer ${String(layerId)}`));
        if (!Number.isFinite(x) || !Number.isFinite(z)) return Promise.reject(new Error('[LandscapeEcosystem] trace coordinates must be finite'));
        return this.pool.request({ type: 'trace', layerId, x, z, siteX: site.siteX, siteZ: site.siteZ, child: site.child, ...this.generation() }, { priority: STREAMING.workerPriority + 10 });
    }

    /** SHA-256 of the encoded tile of a cell as the worker generates (or reads) it: the Node/browser determinism gate. @param {string} layerId @param {number} cellX @param {number} cellZ */
    async hashCell(layerId, cellX, cellZ) {
        if (!this.recipe.layers[layerId]) throw new Error(`[LandscapeEcosystem] unknown ecosystem layer ${String(layerId)}`);
        if (!Number.isInteger(cellX) || !Number.isInteger(cellZ)) throw new Error('[LandscapeEcosystem] a cell hash needs integer cell coordinates');
        const started = performance.now(), result = await this.pool.request({ type: 'hash', layerId, cellX, cellZ, ...this.generation() }, { priority: STREAMING.workerPriority + 5 });
        const check = { layerId, cellX, cellZ, id: ecosystemTileId(layerId, cellX, cellZ), hash: result.hash, count: result.count, byteLength: result.byteLength, generation: result.generation, milliseconds: performance.now() - started };
        this.determinism.push(check); if (this.determinism.length > 8) this.determinism.shift();
        return check;
    }

    findRecord(tileId) {
        for (const state of this.layers.values()) { const record = state.records.get(tileId) ?? state.cache.get(tileId); if (record) return { state, record }; }
        return null;
    }

    /** A resident (or cached) tile's summary with the SHA-256 of its held records and ids (the published payload's hash when undegraded). @param {string} tileId */
    async tileSummary(tileId) {
        const found = this.findRecord(tileId);
        if (!found || !found.record.tile) return null;
        const { state, record } = found;
        return { id: record.id, layerId: record.layerId, generation: state.generation, cellX: record.cellX, cellZ: record.cellZ, bounds: record.bounds, status: record.status, count: record.fullCount, held: record.tile.count, drawn: record.drawn?.count ?? 0, fraction: record.fullCount ? record.tile.count / record.fullCount : 1,
            reason: record.reason, cpuBytes: record.reserved.cpuBytes, gpuBytes: record.reserved.gpuBytes, loadMs: record.loadMs ?? null, overrideResult: record.overrideResult, sha256: await sha256Hex(encodeEcosystemTile(record.tile)),
            published: record.entry ? { count: record.entry.count, sha256: record.entry.payload.sha256, byteLength: record.entry.payload.byteLength, contentKey: record.entry.contentKey } : null };
    }

    /** Resident instances of a layer per cell, as counts and densities. @param {string} layerId */
    heatmap(layerId) {
        const state = this.layers.get(layerId);
        if (!state) throw new Error(`[LandscapeEcosystem] unknown ecosystem layer ${String(layerId)}`);
        const area = state.layer.cell.meters ** 2 / 1e6, cells = [];
        for (const record of state.records.values()) if (record.status === 'resident') cells.push({ cellX: record.cellX, cellZ: record.cellZ, id: record.id, count: record.drawn.count, perSquareKilometer: record.drawn.count / area });
        return { layerId, cellMeters: state.layer.cell.meters, cells: cells.sort((a, b) => a.cellZ - b.cellZ || a.cellX - b.cellX) };
    }

    settled() {
        if (!this.planned || this.missing > 0) return false;
        for (const state of this.layers.values()) for (const record of state.records.values()) if (record.status !== 'resident') return false;
        return true;
    }

    // the keys never shadow the renderer's (tiles, instances, drawn, tileIds name what is attached; resident* names what the streamer holds), so the view spreads both
    snapshot() {
        const layers = [], residentIds = [];
        let resident = 0, pending = 0, residentInstances = 0, drawnInstances = 0, cacheBytes = 0, degraded = 0, degradationReason = this.degradation;
        for (const state of this.layers.values()) {
            const summary = { id: state.layer.id, generation: state.generation, priority: state.layer.rules.competition.priority, visible: state.visible, desired: state.wanted, resident: 0, pending: 0, cached: state.cache.size, cachedBytes: 0, published: state.index?.size ?? null, stale: state.stale.size,
                instances: 0, drawn: 0, degraded: 0, cpuBytes: 0, gpuBytes: 0, ...state.counters, failure: state.failure, failures: state.failures.size, keepRadius: state.keepRadius };
            for (const record of state.records.values()) {
                if (record.status === 'resident') { summary.resident++; summary.instances += record.fullCount; summary.drawn += record.drawn.count; residentIds.push(record.id); } else summary.pending++;
                summary.cpuBytes += record.reserved.cpuBytes; summary.gpuBytes += record.reserved.gpuBytes;
                if (record.reason) { summary.degraded++; degradationReason ??= record.reason; }
            }
            for (const record of state.cache.values()) { summary.cachedBytes += record.reserved.cpuBytes; summary.cpuBytes += record.reserved.cpuBytes; summary.gpuBytes += record.reserved.gpuBytes; }
            resident += summary.resident; pending += summary.pending; residentInstances += summary.instances; drawnInstances += summary.drawn; cacheBytes += summary.cachedBytes; degraded += summary.degraded;
            layers.push(summary);
        }
        const standing = { cpuBytes: [...this.standing.values()].reduce((sum, bytes) => sum + bytes, 0), gpuBytes: 0 }, runtime = layers.filter(layer => layer.generation === 'runtime');
        return { recipe: LANDSCAPE_ECOSYSTEM.id, status: this.status, reason: this.reason, url: this.url, present: true, revision: this.sidecar.revision, recipeId: this.recipe.id, recipeIdentity: this.sidecar.dependencies.recipeIdentity,
            binding: ecosystemBinding(this.sidecar, this.manifest, this.staleness, this.planning), settled: this.settled(), layers, resident, pending, missing: this.missing, residentInstances, drawnInstances, degraded, standing, share: this.budget.shareSnapshot(),
            uploadedBytesPerFrame: this.uploadedBytes, peakUploadedBytesPerFrame: this.peakUploadedBytes, degradationReason, invalidations: this.invalidations,
            runtime: { generated: runtime.reduce((sum, layer) => sum + layer.generated, 0), cached: runtime.reduce((sum, layer) => sum + layer.cached, 0), restored: runtime.reduce((sum, layer) => sum + layer.restored, 0), evictions: runtime.reduce((sum, layer) => sum + layer.evictions, 0), cacheBytes, cacheLimitBytes: STREAMING.runtimeCacheBytes,
                workerCacheBytes: this.standing.get('ecosystem/worker-cache') ?? 0, available: runtime.every(layer => layer.failure === null) },
            worker: this.pool.snapshot(), determinism: [...this.determinism], densityScale: { offline: this.sidecar.densityScale, runtime: this.runtimeDensity }, overrides: this.overrides ? { id: this.overrides.id, identity: this.overridesIdentity } : null,
            timing: { ...this.timing, meanPlanMs: this.timing.updates ? this.timing.totalPlanMs / this.timing.updates : 0, meanLoadMs: this.timing.loads ? this.timing.totalLoadMs / this.timing.loads : 0, note: 'plan is the main-thread update (planning, residency, one attach); load is the worker round trip from request to decoded' },
            errors: [...this.errors], loadMs: this.loadMs, residentIds };
    }

    /** Releases every tile, the worker, the renderer and the asset sets, then the standing reservations; the share itself stays with the view. */
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.pool.dispose();
        for (const state of this.layers.values()) {
            for (const record of [...state.records.values()]) { state.records.delete(record.id); if (record.status === 'loading') record.abort.abort(); else this.detach(record); this.budget.release(record.key); }
            for (const record of [...state.cache.values()]) { state.cache.delete(record.id); this.budget.release(record.key); }
        }
        this.renderer.dispose();
        this.assets.dispose();
        for (const key of this.standing.keys()) this.budget.release(key);
        this.standing.clear();
    }
}
