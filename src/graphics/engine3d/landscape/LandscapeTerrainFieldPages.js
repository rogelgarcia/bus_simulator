// Streams terrain-field pages beside the resident native mask pages into one RGBA8 texture array and samples them exactly in JavaScript.
// @ts-check
// Layer mapping: the four layers of the field page bound to native mask slot s occupy array layers 4s .. 4s + 3, so the shader reuses the
// mask slot bounds, levels and parents and needs one sampler plus one uvec4 (uTerrainFieldsState: x/y stale 8 x 8 cell bits, z flags: bit 0
// fields active, bit 1 appearance layer resident, w layers per page). A field page arrives with a 0.3 s fade whose progress is packed into the native slot's uMaskMeta.w as
// 1 + 0.25 * progress (native slots stay in (0.5, 1.5], fine slots keep 2), written after the mask update every frame. Pages follow
// their mask record: a page is requested for every native mask record that holds a slot, evicted with it, never loaded for a stale
// chunk, and retried once after a failure. The array is charged to the shared ledger under its own ceiling (one eighth of each total)
// so it never competes with the appearance material demand; an unaffordable array leaves the fields explicitly budget-denied. AI577 D5: one
// more layer after the page layers holds the landscape-scale appearance layer (LandscapeTerrainAppearance), derived in the appearance worker
// from the decoded root page and the root heights and land cover before the root page counts as decoded (its working memory reserved meanwhile),
// then uploaded with the root page in one frame inside the same per-frame upload allowance; a failed or unaffordable derivation leaves the
// root page usable and the layer absent (state bit 1 clear, every terrain-appearance term neutral).
import { LANDSCAPE_TERRAIN_FIELD_CHANNELS, LANDSCAPE_TERRAIN_FIELDS_FILTER, LANDSCAPE_TERRAIN_FIELDS_LAYOUT, landscapeTerrainFieldsLayout, landscapeTerrainFieldsStaleness,
    landscapeTerrainSunVisibility, loadLandscapeTerrainFields, sampleLandscapeTerrainFieldPage, sampleLandscapeTerrainFieldSlots } from '../../../app/landscape/index.js';
import { landscapeTerrainVisibility } from './LandscapeLightingModel.js';
import { LANDSCAPE_TERRAIN_APPEARANCE, landscapeAppearanceLayerWorkBytes, landscapePlanningCoverMask } from './LandscapeTerrainAppearance.js';

export const LANDSCAPE_TERRAIN_FIELD_RUNTIME = Object.freeze({
    id: 'landscape-terrain-field-streaming-v1', arrivalSeconds: LANDSCAPE_TERRAIN_FIELDS_FILTER.arrivalSeconds, retryDelayMs: 2500, maxAttempts: 2, maxInFlight: 2,
    workerPriority: 25, budgetShare: 1 / 8, manifestDecodeBytes: 768 * 1024, progressScale: .25, modes: Object.freeze(['auto', 'off'])
});

/** Packs a native slot's field arrival progress into uMaskMeta.w (1 = native without fields, up to 1.25 with fields fully arrived). @param {number} progress */
export function landscapeTerrainFieldMeta(progress) { return 1 + LANDSCAPE_TERRAIN_FIELD_RUNTIME.progressScale * Math.max(0, Math.min(1, progress)); }

/** Inverse of landscapeTerrainFieldMeta for native slots; detail or inactive slots carry no field. @param {number} meta */
export function landscapeTerrainFieldProgress(meta) { return meta > .5 && meta <= 1.5 ? Math.max(0, Math.min(1, (meta - 1) / LANDSCAPE_TERRAIN_FIELD_RUNTIME.progressScale)) : 0; }

/**
 * Largest rock exposure (layer 0 alpha) of a field page's own samples, which lends the exposed-rock soil an interest in the page (AI577 D5).
 * @param {Uint8Array} bytes one page (four layers) @param {{width:number,halo:number,samples:number}} layout
 */
export function landscapeTerrainFieldPageRockExposure(bytes, layout) {
    let maximum = 0;
    for (let row = layout.halo; row < layout.halo + layout.samples; row++) for (let column = layout.halo; column < layout.halo + layout.samples; column++) maximum = Math.max(maximum, bytes[(row * layout.width + column) * 4 + 3]);
    return maximum / 255;
}

export class LandscapeTerrainFieldPages {
    /**
     * @param {{loaded:any,shared:any,masks:any,pool:any,renderer:{initTexture:(texture:any)=>void},uniforms:any,prefix:string,url:string,mode?:'auto'|'off',
     *   createTexture:(input:{pixels:Uint8Array,width:number,height:number,depth:number})=>any,fetchImpl?:typeof fetch,loadSidecar?:()=>Promise<any|null>}} options shared is the
     *   LandscapeResidencyBudget; loadSidecar shares an existing memoized sidecar load of the same url (the natural inference source), so it is fetched once
     */
    constructor({ loaded, shared, masks, pool, renderer, uniforms, prefix, url, mode = 'auto', createTexture, fetchImpl, loadSidecar = null }) {
        if (!LANDSCAPE_TERRAIN_FIELD_RUNTIME.modes.includes(mode)) throw new Error(`[Landscape] terrain fields mode must be auto or off; received ${mode}`);
        Object.assign(this, { loaded, shared, masks, pool, renderer, uniforms, url, mode, createTexture, fetchImpl, loadSidecar });
        this.prefix = `${prefix}/terrain-fields`;
        this.manifest = loaded.manifest;
        this.status = mode === 'off' ? 'disabled' : 'pending';
        this.reason = mode === 'off' ? 'terrain-fields-off' : 'terrain-fields-loading';
        this.records = new Map();
        this.owned = new Map();
        this.failures = new Map();
        this.errors = [];
        this.abort = new AbortController();
        this.loadedCount = 0;
        this.evicted = 0;
        this.uploads = { pages: 0, bytes: 0, peakBytesPerFrame: 0, lastFrameBytes: 0 };
        this.peakBytes = { cpuBytes: 0, gpuBytes: 0 };
        this.timing = { updates: 0, lastUpdateMs: 0, peakUpdateMs: 0, totalUpdateMs: 0, pageLoads: 0, totalLoadMs: 0, peakLoadMs: 0, lastUploadMs: 0, peakUploadMs: 0 };
    }

    async initialize() {
        if (this.mode === 'off') return;
        const key = `${this.prefix}/manifest`, admission = this.reserve(key, { cpuBytes: LANDSCAPE_TERRAIN_FIELD_RUNTIME.manifestDecodeBytes, gpuBytes: 0, kind: 'terrain-fields-manifest-decode' });
        if (!admission.admitted) { this.fail('budget-denied', `terrain-fields-manifest-${admission.reason}`); return; }
        try {
            const sidecar = this.loadSidecar ? await this.loadSidecar()
                : await loadLandscapeTerrainFields(this.url, { landscape: this.manifest, signal: this.abort.signal, ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}) });
            if (this.disposed) return;
            if (!sidecar) { this.fail('absent', 'terrain-fields-404'); return; }
            this.sidecar = sidecar;
            this.layout = landscapeTerrainFieldsLayout(sidecar.terrain.grid.chunkIntervals + 1);
            if (this.layout.width !== this.masks.layout.width || this.layout.halo !== this.masks.layout.halo) throw new Error('terrain field pages do not share the mask page layout');
            this.staleness = landscapeTerrainFieldsStaleness(sidecar, this.manifest);
            this.pages = new Map(sidecar.pages.map(page => [page.id, page]));
            const usable = sidecar.pages.some(page => this.staleness.pages[page.id] !== 'stale');
            if (!usable) { this.fail('stale', 'terrain-fields-all-chunks-stale'); return; }
            this.capacity = this.masks.capacity;
            // the page layers of every native slot, then the landscape-scale appearance layer
            this.appearanceLayerIndex = this.capacity * this.layout.layers;
            const arrayBytes = this.capacity * this.layout.pageBytes + this.layout.layerBytes, limits = this.shared.snapshot().limits, share = LANDSCAPE_TERRAIN_FIELD_RUNTIME.budgetShare;
            this.ceiling = { cpuBytes: Math.floor(limits.cpuBytes * share), gpuBytes: Math.floor(limits.gpuBytes * share) };
            this.decodeBytes = this.layout.pageBytes * 2;
            if (arrayBytes + this.decodeBytes > this.ceiling.cpuBytes || arrayBytes > this.ceiling.gpuBytes) { this.fail('budget-denied', 'terrain-fields-ceiling'); return; }
            this.arrayKey = `${this.prefix}/array`;
            const reserved = this.reserve(this.arrayKey, { cpuBytes: arrayBytes, gpuBytes: arrayBytes, kind: 'terrain-fields-array' });
            if (!reserved.admitted) { this.arrayKey = null; this.fail('budget-denied', `terrain-fields-array-${reserved.reason}`); return; }
            this.pixels = new Uint8Array(arrayBytes);
            this.texture = this.createTexture({ pixels: this.pixels, width: this.layout.width, height: this.layout.height, depth: this.appearanceLayerIndex + 1 });
            this.uniforms.uTerrainFields.value = this.texture;
            const state = this.uniforms.uTerrainFieldsState.value;
            state[0] = this.staleness.staleCells[0]; state[1] = this.staleness.staleCells[1]; state[2] = 1; state[3] = this.layout.layers;
            this.status = this.staleness.staleChunks.length ? 'active-partial' : 'active';
            this.reason = this.staleness.staleChunks.length ? 'terrain-fields-stale-chunks' : null;
            this.track();
        } catch (error) {
            if (error.name === 'AbortError' || this.disposed) return;
            this.fail(error.name === 'LandscapeTerrainFieldsBindingError' ? 'binding-mismatch' : 'invalid', error.message);
        } finally { if (!this.disposed) this.release(key); }
    }

    fail(status, reason) {
        this.status = status;
        this.reason = reason;
        if (!['absent', 'disabled'].includes(status)) {
            this.errors.push({ status, message: reason });
            console.warn(`[Landscape] Terrain fields ${status}: ${reason}`);
        }
        this.releaseArray();
    }

    get active() { return this.status === 'active' || this.status === 'active-partial'; }

    /** Largest rock exposure of a resident field page (0 when absent or not yet resident). @param {string} id native mask page ID */
    rockExposure(id) {
        const record = this.records.get(id);
        return record?.status === 'resident' ? record.rockExposure ?? 0 : 0;
    }

    // field records mirror the native mask records that hold a slot; an evicted or moved mask page takes its field page with it
    sync() {
        const masks = this.masks.records;
        for (const record of [...this.records.values()]) {
            const mask = masks.get(record.id);
            if (!mask || mask.slot !== record.slot || mask.kind === 'detail') this.remove(record);
        }
        let inFlight = [...this.records.values()].filter(record => record.status === 'loading').length;
        const now = performance.now();
        for (const mask of [...masks.values()].sort((a, b) => (b.status === 'resident') - (a.status === 'resident') || a.descriptor.level - b.descriptor.level || a.id.localeCompare(b.id))) {
            if (inFlight >= LANDSCAPE_TERRAIN_FIELD_RUNTIME.maxInFlight) break;
            if (mask.kind === 'detail' || this.records.has(mask.id)) continue;
            const page = this.pages.get(mask.id), failure = this.failures.get(mask.id);
            if (!page || this.staleness.pages[mask.id] === 'stale') continue;
            if (failure && (failure.attempts >= LANDSCAPE_TERRAIN_FIELD_RUNTIME.maxAttempts || now < failure.retryAt)) continue;
            if (this.request(mask, page)) inFlight++;
        }
    }

    request(mask, page) {
        const key = `${this.prefix}/page/${mask.id}/${page.fields.sha256}`;
        const totals = this.totals();
        if (totals.cpuBytes + this.decodeBytes > this.ceiling.cpuBytes) return false;
        const admission = this.reserve(key, { cpuBytes: this.decodeBytes, gpuBytes: 0, kind: 'terrain-fields-decode' });
        if (!admission.admitted) { this.degradation = `terrain-fields-decode-${admission.reason}`; return false; }
        const record = { id: mask.id, slot: mask.slot, key, page, status: 'loading', progress: 0, bytes: null, abort: new AbortController(), state: this.staleness.pages[mask.id], requestedAt: performance.now() };
        this.records.set(mask.id, record);
        this.pool.request({ type: 'field', page: page.fields }, { priority: LANDSCAPE_TERRAIN_FIELD_RUNTIME.workerPriority, signal: record.abort.signal }).then(async result => {
            if (this.disposed || record.abort.signal.aborted || this.records.get(record.id) !== record) return;
            if (!(result.bytes instanceof Uint8Array) || result.bytes.length !== this.layout.pageBytes) throw new Error(`terrain field page ${record.id} returned ${result.bytes?.length} bytes`);
            record.bytes = result.bytes;
            if (record.id === this.manifest.overviewId) {
                await this.deriveAppearanceLayer(record);
                if (this.disposed || record.abort.signal.aborted || this.records.get(record.id) !== record) return;
            }
            record.status = 'decoded';
            this.loadedCount++;
            const loadMs = performance.now() - record.requestedAt;
            this.timing.pageLoads++; this.timing.totalLoadMs += loadMs; this.timing.peakLoadMs = Math.max(this.timing.peakLoadMs, loadMs);
        }).catch(error => {
            if (error.name === 'AbortError' || this.disposed || this.records.get(record.id) !== record) return;
            const previous = this.failures.get(record.id);
            this.failures.set(record.id, { id: record.id, message: error.message, attempts: (previous?.attempts ?? 0) + 1, retryAt: performance.now() + LANDSCAPE_TERRAIN_FIELD_RUNTIME.retryDelayMs });
            this.remove(record);
        });
        this.track();
        return true;
    }

    remove(record) {
        if (this.records.get(record.id) !== record) return;
        record.abort.abort();
        record.bytes = null;
        record.layer = null;
        this.records.delete(record.id);
        this.release(record.key);
        if (record.status === 'resident') this.evicted++;
    }

    /** @param {number} dt seconds @param {number} uploadAllowance remaining bytes of the shared per-frame upload cap @returns {number} uploaded bytes */
    update(dt, uploadAllowance) {
        this.uploads.lastFrameBytes = 0;
        if (!this.active || this.disposed) return 0;
        const started = performance.now();
        this.sync();
        const masks = this.masks.records;
        let uploaded = 0;
        const decoded = [...this.records.values()].find(record => record.status === 'decoded');
        const root = decoded?.id === this.manifest.overviewId, bytes = this.layout.pageBytes + (root && decoded.layer ? this.layout.layerBytes : 0);
        if (decoded && bytes <= uploadAllowance) {
            const uploadStarted = performance.now(), base = decoded.slot * this.layout.layers;
            this.pixels.set(decoded.bytes, base * this.layout.layerBytes);
            decoded.rockExposure = landscapeTerrainFieldPageRockExposure(decoded.bytes, this.layout);
            for (let layer = 0; layer < this.layout.layers; layer++) this.texture.addLayerUpdate(base + layer);
            if (root) this.uploadAppearanceLayer(decoded);
            this.texture.needsUpdate = true;
            this.renderer.initTexture(this.texture);
            this.texture.clearLayerUpdates();
            decoded.bytes = null;
            decoded.status = 'resident';
            this.release(decoded.key);
            uploaded = bytes;
            this.uploads.pages++; this.uploads.bytes += uploaded;
            this.timing.lastUploadMs = performance.now() - uploadStarted; this.timing.peakUploadMs = Math.max(this.timing.peakUploadMs, this.timing.lastUploadMs);
        }
        const step = Math.min(dt, .1) / LANDSCAPE_TERRAIN_FIELD_RUNTIME.arrivalSeconds;
        for (const record of this.records.values()) {
            const mask = masks.get(record.id);
            if (record.status !== 'resident' || mask?.status !== 'resident') continue;
            record.progress = Math.min(1, record.progress + step);
            this.uniforms.uMaskMeta.value[record.slot].w = landscapeTerrainFieldMeta(record.progress);
        }
        this.uploads.lastFrameBytes = uploaded;
        this.uploads.peakBytesPerFrame = Math.max(this.uploads.peakBytesPerFrame, uploaded);
        this.track();
        const elapsed = performance.now() - started;
        this.timing.updates++; this.timing.lastUpdateMs = elapsed; this.timing.totalUpdateMs += elapsed; this.timing.peakUpdateMs = Math.max(this.timing.peakUpdateMs, elapsed);
        return uploaded;
    }

    // AI577 D5: derives the landscape-scale appearance layer of the decoded root page in the appearance worker (root heights and land cover copied
    // into the request) while its working memory is reserved; a failure or a denied reservation keeps the root page and leaves the layer absent
    async deriveAppearanceLayer(record) {
        const root = this.loaded.chunk, key = `${this.prefix}/appearance-layer/${record.page.fields.sha256}`, workBytes = landscapeAppearanceLayerWorkBytes(this.layout.samples);
        this.appearanceLayerState = { status: 'deriving', workBytes, error: null };
        const admission = this.totals().cpuBytes + workBytes > this.ceiling.cpuBytes ? { admitted: false, reason: 'terrain-fields-ceiling' }
            : this.reserve(key, { cpuBytes: workBytes, gpuBytes: 0, kind: 'terrain-appearance-layer-derivation' });
        if (!admission.admitted) { this.appearanceLayerState = { status: 'budget-denied', workBytes, error: admission.reason }; return; }
        const started = performance.now();
        try {
            const input = { fieldPage: record.bytes, layout: this.layout, heights: root.heights, cover: root.landCover, planningMask: landscapePlanningCoverMask(this.manifest.landCover.catalog),
                staleCells: [...this.staleness.staleCells], bounds: { ...root.descriptor.bounds } };
            const result = await this.pool.request({ type: 'appearance-layer', input }, { priority: LANDSCAPE_TERRAIN_FIELD_RUNTIME.workerPriority, signal: record.abort.signal });
            if (!(result.bytes instanceof Uint8Array) || result.bytes.length !== this.layout.layerBytes) throw new Error(`appearance layer returned ${result.bytes?.length} bytes`);
            record.layer = { bytes: result.bytes, statistics: result.statistics, latencyMs: performance.now() - started };
            this.appearanceLayerState = { status: 'derived', workBytes, error: null };
        } catch (error) {
            if (error.name === 'AbortError' || this.disposed) throw error;
            this.appearanceLayerState = { status: 'failed', workBytes, error: error.message };
            this.errors.push({ status: 'appearance-layer-failed', message: error.message });
            console.warn(`[Landscape] Terrain appearance layer failed: ${error.message}`);
        } finally { this.release(key); }
    }

    // writes the derived layer to the array layer after the page layers in the root page's upload frame and marks it resident (state bit 1)
    uploadAppearanceLayer(record) {
        if (!record.layer) return;
        this.pixels.set(record.layer.bytes, this.appearanceLayerIndex * this.layout.layerBytes);
        this.texture.addLayerUpdate(this.appearanceLayerIndex);
        this.uniforms.uTerrainFieldsState.value[2] |= 2;
        this.appearanceLayer = { id: LANDSCAPE_TERRAIN_APPEARANCE.layer.id, rootId: this.manifest.overviewId, layer: this.appearanceLayerIndex, bytes: this.layout.layerBytes,
            statistics: record.layer.statistics, latencyMs: record.layer.latencyMs, derivedIn: 'appearance worker' };
        this.appearanceLayerState = { ...this.appearanceLayerState, status: 'resident' };
        record.layer = null;
    }

    /** CPU copy of the resident landscape-scale appearance layer with its layout, or null before the root page arrives. */
    appearanceLayerSource() {
        if (!this.active || !this.appearanceLayer) return null;
        return { pixels: this.pixels, offset: this.appearanceLayerIndex * this.layout.layerBytes, layout: this.layout };
    }

    totals() {
        return [...this.owned.values()].reduce((sum, entry) => ({ cpuBytes: sum.cpuBytes + entry.cpuBytes, gpuBytes: sum.gpuBytes + entry.gpuBytes }), { cpuBytes: 0, gpuBytes: 0 });
    }

    track() {
        const totals = this.totals();
        this.peakBytes = { cpuBytes: Math.max(this.peakBytes.cpuBytes, totals.cpuBytes), gpuBytes: Math.max(this.peakBytes.gpuBytes, totals.gpuBytes) };
    }

    // slot table of the JavaScript mirror, read from the same uniforms the shader reads
    slotSource() {
        const meta = this.uniforms.uMaskMeta.value, bounds = this.uniforms.uMaskBounds.value, ranges = this.uniforms.uMaskSlotRanges.value, slots = [];
        for (let slot = 0; slot < meta.length; slot++) {
            const m = meta[slot], b = bounds[slot];
            slots.push({ bounds: { minX: b.x, maxX: b.y, minZ: b.z, maxZ: b.w }, level: m.x, parent: m.z, fieldProgress: slot < ranges.x ? landscapeTerrainFieldProgress(m.w) : 0,
                native: m.w <= 1.5, active: slot < ranges.x && m.w > .5 });
        }
        return { slots, rootBounds: this.manifest.bounds, staleCells: this.staleness?.staleCells ?? [0, 0], active: this.active, samples: this.layout?.samples ?? 2,
            fetch: (slot, x, z, out) => sampleLandscapeTerrainFieldPage(this.pixels, slot * this.layout.pageBytes, this.layout, slots[slot].bounds, x, z, out) };
    }

    /**
     * Exact JavaScript mirror of landscapeTerrainFieldsAt (terrain_fields.glsl) over the resident pages; availability 0 means analytic fallback.
     * @param {number} x @param {number} z @param {{dx?:number[],dy?:number[],sunDirection?:{x:number,y:number,z:number}}} [options]
     */
    sample(x, z, { dx = [0, 0], dy = [0, 0], sunDirection } = {}) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('[Landscape] terrain field sample coordinates must be finite');
        if (!this.active) return { status: this.status, reason: this.reason, availability: 0, fields: null };
        const result = sampleLandscapeTerrainFieldSlots(this.slotSource(), x, z, { dx, dy });
        const sun = result.fields && sunDirection ? 1 - result.availability + result.availability * landscapeTerrainSunVisibility(result.fields.horizonSine, sunDirection) : 1;
        // AI577 D5c: the terrain program's hook values (landscapeEvaluateTerrainVisibility) at this footprint, without the screen-space edge widening
        const length = sunDirection ? Math.hypot(sunDirection.x, sunDirection.y, sunDirection.z) : 0;
        const hooks = length > 0 ? landscapeTerrainVisibility(result, [sunDirection.x / length, sunDirection.y / length, sunDirection.z / length]) : null;
        return { status: this.status, availability: result.availability, contributions: result.contributions, units: [...result.units], fields: result.fields,
            channels: result.fields ? Object.fromEntries(LANDSCAPE_TERRAIN_FIELD_CHANNELS.map((channel, i) => [channel.name, result.units[i]])) : null,
            ...(sunDirection ? { sunVisibility: sun, lightingHooks: { sunVisibility: hooks.sun, skyVisibility: hooks.sky, weight: hooks.weight } } : {}), revision: this.sidecar?.revision ?? null };
    }

    snapshot() {
        const records = [...this.records.values()], pageStates = this.staleness ? Object.values(this.staleness.pages) : [];
        const pending = records.filter(record => record.status !== 'resident').length;
        const missing = this.active && [...this.masks.records.values()].some(mask => mask.kind !== 'detail' && mask.status === 'resident' && this.pages.has(mask.id)
            && this.staleness.pages[mask.id] !== 'stale' && !this.records.has(mask.id) && (this.failures.get(mask.id)?.attempts ?? 0) < LANDSCAPE_TERRAIN_FIELD_RUNTIME.maxAttempts);
        const arrayBytes = this.arrayKey ? this.capacity * this.layout.pageBytes + this.layout.layerBytes : 0, totals = this.totals();
        return { status: this.status, reason: this.reason, mode: this.mode, url: this.url, recipe: LANDSCAPE_TERRAIN_FIELD_RUNTIME.id,
            revision: this.sidecar?.revision ?? null, terrainRevision: this.sidecar?.terrain.revision ?? null, currentTerrainRevision: this.manifest.revision,
            bound: this.staleness?.bound ?? false, staleChunks: [...(this.staleness?.staleChunks ?? [])], staleCells: [...(this.staleness?.staleCells ?? [0, 0])],
            pageStates: { fresh: pageStates.filter(state => state === 'fresh').length, partial: pageStates.filter(state => state === 'partial').length, stale: pageStates.filter(state => state === 'stale').length },
            residentPages: records.filter(record => record.status === 'resident').map(record => ({ id: record.id, slot: record.slot, progress: record.progress, state: record.state })),
            pending, missingWork: !!missing, settled: !this.active || (pending === 0 && !missing && records.every(record => record.progress === 1 || this.masks.records.get(record.id)?.status !== 'resident')),
            failures: [...this.failures.values()].map(failure => ({ ...failure })), errors: [...this.errors], loaded: this.loadedCount, evicted: this.evicted,
            capacity: this.capacity ?? 0, layersPerPage: LANDSCAPE_TERRAIN_FIELDS_LAYOUT.layers, layerMapping: 'layer = native mask slot * 4 + k; the last layer is the landscape-scale appearance layer',
            appearanceLayer: this.appearanceLayer ? { ...this.appearanceLayer, statistics: { ...this.appearanceLayer.statistics } } : null,
            appearanceLayerState: this.appearanceLayerState ? { ...this.appearanceLayerState } : { status: this.active ? 'pending' : 'absent', workBytes: 0, error: null },
            bytes: { arrayCpu: arrayBytes, arrayGpu: arrayBytes, pageBytes: this.layout?.pageBytes ?? 0, decodeReservation: this.decodeBytes ?? 0, cpuBytes: totals.cpuBytes, gpuBytes: totals.gpuBytes,
                peakCpuBytes: this.peakBytes.cpuBytes, peakGpuBytes: this.peakBytes.gpuBytes, ceiling: this.ceiling ?? null },
            uploads: { ...this.uploads }, degradationReason: this.degradation ?? null,
            timing: { ...this.timing, meanUpdateMs: this.timing.updates ? this.timing.totalUpdateMs / this.timing.updates : 0, meanLoadMs: this.timing.pageLoads ? this.timing.totalLoadMs / this.timing.pageLoads : 0,
                note: 'main-thread update includes sync, one layer-wise upload call and fade; page load is worker fetch plus SHA-256 latency from request to decoded' },
            channels: LANDSCAPE_TERRAIN_FIELD_CHANNELS.map(channel => channel.name),
            shader: { sampler: 'uTerrainFields', state: 'uTerrainFieldsState', progress: 'uMaskMeta.w = 1 + 0.25 * progress on native slots', chunk: 'chunks/landscape/terrain_fields.glsl', included: true,
                consumers: 'terrain program, lighting tiers standard and high: sun visibility, sky visibility, occluder horizons of terrain-reflected light (landscape-terrain-visibility-v1)' } };
    }

    releaseArray() {
        if (this.arrayKey) this.release(this.arrayKey);
        this.arrayKey = null;
        this.appearanceLayer = null;
        this.appearanceLayerState = null;
        this.texture?.dispose();
        if (this.texture?.image) this.texture.image.data = null;
        this.texture = null;
        this.pixels = null;
        if (this.uniforms?.uTerrainFields) this.uniforms.uTerrainFields.value = null;
        if (this.uniforms?.uTerrainFieldsState) this.uniforms.uTerrainFieldsState.value.fill(0);
    }

    dispose() {
        this.disposed = true;
        this.abort.abort();
        for (const record of [...this.records.values()]) this.remove(record);
        this.releaseArray();
        this.release(`${this.prefix}/manifest`);
    }

    // ledger entries owned by the fields, tracked locally so per-frame accounting never scans the shared ledger
    reserve(key, resources) {
        const admission = this.shared.reserve(key, resources);
        if (admission.admitted) this.owned.set(key, { cpuBytes: resources.cpuBytes, gpuBytes: resources.gpuBytes });
        return admission;
    }

    release(key) {
        if (!this.owned.has(key)) return;
        if (this.shared.release(key)) this.owned.delete(key);
    }
}
