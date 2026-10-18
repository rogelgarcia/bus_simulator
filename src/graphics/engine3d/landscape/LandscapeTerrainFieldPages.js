// Streams terrain-field pages beside the resident native mask pages into one RGBA8 texture array and samples them exactly in JavaScript.
// @ts-check
// Layer mapping: the layers of the field page bound to native mask slot s occupy array layers s * L .. s * L + L - 1 (L = uTerrainFieldsState.w: the four
// field layers, or seven while the geology is bound), so the shader reuses the mask slot bounds, levels and parents and needs one sampler plus one uvec4
// (uTerrainFieldsState: x/y stale 8 x 8 cell bits, z flags: bit 0 fields active, bit 1 appearance layer resident, bit 2 geology bound, bit 3 override layer
// resident, w layers per page). A field page arrives with a 0.3 s fade whose progress is packed into the native slot's uMaskMeta.w as 1 + 0.25 * progress
// (native slots stay in (0.5, 1.5], fine slots keep 2), written after the mask update every frame. Pages follow their mask record: a page is requested for
// every native mask record that holds a slot, evicted with it, never loaded for a stale chunk, and retried once after a failure. The array is charged to
// the shared ledger under its own ceiling (one eighth of each total) so it never competes with the appearance material demand; an unaffordable array
// leaves the fields explicitly budget-denied. AI577 D5: one more layer after the page layers holds the landscape-scale appearance layer
// (LandscapeTerrainAppearance), derived in the appearance worker from the decoded root page and the root heights and land cover before the root page
// counts as decoded (its working memory reserved meanwhile), then uploaded with the root page in one frame inside the same per-frame upload allowance;
// a failed or unaffordable derivation leaves the root page usable and the layer absent (state bit 1 clear, every terrain-appearance term neutral).
// AI 598 D1: with the surface model on, the geology sidecar (landscape-geology v1) binds like the fields (absent, invalid, binding-mismatch, stale,
// budget-denied and disabled are explicit and never take the fields down) and every native page carries three more layers: its geology field page
// verbatim and its categorical page packed into the halo'd layout, fetched and authenticated by the geology worker job in the same record as the field
// page (one arrival fade serves both); a page whose geology is stale carries the neutral geology layers. A bound overrides document adds one root-grid
// override layer before the appearance layer (which stays last, where terrain_appearance.glsl reads it), rasterized in the worker with the root page.
import { LANDSCAPE_GEOLOGY_LIMIT, LANDSCAPE_SURFACE_RECIPE, LANDSCAPE_TERRAIN_FIELD_CHANNELS, LANDSCAPE_TERRAIN_FIELDS_FILTER, LANDSCAPE_TERRAIN_FIELDS_LAYOUT, LANDSCAPE_TERRAIN_FIELDS_LIMIT,
    createLandscapeSurfaceOneHot, decodeLandscapeGeology, landscapeGeologyLayout, landscapeGeologyStaleness, landscapeSurfaceOneHot, landscapeTerrainFieldsLayout, landscapeTerrainFieldsStaleness,
    landscapeTerrainSunVisibility, loadLandscapeGeology, loadLandscapeTerrainFields, sampleLandscapeGeologyPageUnits, sampleLandscapeTerrainFieldPage, sampleLandscapeTerrainFieldSlots } from '../../../app/landscape/index.js';
import { landscapeTerrainVisibility } from './LandscapeLightingModel.js';
import { LANDSCAPE_TERRAIN_APPEARANCE, landscapeAppearanceLayerWorkBytes, landscapePlanningCoverMask } from './LandscapeTerrainAppearance.js';
import { LANDSCAPE_SURFACE_MODEL_RUNTIME, landscapeSurfaceNeutralGeologyPage } from './LandscapeSurfaceModel.js';

// the sidecar decode credit is three times the sidecar byte limit (response bytes, parsed JSON and the validated frozen clone), so it follows
// the limit (256 KiB before AI 596 D3, 1 MiB since: deeper trees list every node)
export const LANDSCAPE_TERRAIN_FIELD_RUNTIME = Object.freeze({
    id: 'landscape-terrain-field-streaming-v1', arrivalSeconds: LANDSCAPE_TERRAIN_FIELDS_FILTER.arrivalSeconds, retryDelayMs: 2500, maxAttempts: 2, maxInFlight: 2,
    workerPriority: 25, budgetShare: 1 / 8, manifestDecodeBytes: LANDSCAPE_TERRAIN_FIELDS_LIMIT * 3, geologyDecodeBytes: LANDSCAPE_GEOLOGY_LIMIT * 3, progressScale: .25, modes: Object.freeze(['auto', 'off']),
    geologyModes: LANDSCAPE_SURFACE_MODEL_RUNTIME.modes
});

const FLAGS = LANDSCAPE_SURFACE_MODEL_RUNTIME.flags, GEOLOGY_LAYERS = LANDSCAPE_SURFACE_MODEL_RUNTIME.layers;
const clamp = (value, low, high) => value < low ? low : value > high ? high : value;

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
     *   createTexture:(input:{pixels:Uint8Array,width:number,height:number,depth:number})=>any,fetchImpl?:typeof fetch,loadSidecar?:()=>Promise<any|null>,
     *   geology?:'on'|'off',geologyUrl?:string|null,overrides?:any,hardnessPattern?:readonly number[]}} options shared is the
     *   LandscapeResidencyBudget; loadSidecar shares an existing memoized sidecar load of the same url (the natural inference source), so it is fetched once;
     *   geology 'on' (AI 598 D1, the surface model switch) streams the geology sidecar at geologyUrl into three more layers per page; overrides is a validated
     *   landscape-surface-overrides document rasterized into the root-grid override layer; hardnessPattern is the recipe's lithology unwrap of the JavaScript mirror
     */
    constructor({ loaded, shared, masks, pool, renderer, uniforms, prefix, url, mode = 'auto', createTexture, fetchImpl, loadSidecar = null, geology = 'off', geologyUrl = null, overrides = null,
        hardnessPattern = LANDSCAPE_SURFACE_RECIPE.strata.hardnessPattern }) {
        if (!LANDSCAPE_TERRAIN_FIELD_RUNTIME.modes.includes(mode)) throw new Error(`[Landscape] terrain fields mode must be auto or off; received ${mode}`);
        if (!LANDSCAPE_TERRAIN_FIELD_RUNTIME.geologyModes.includes(geology)) throw new Error(`[LandscapeSurface] geology mode must be on or off; received ${geology}`);
        Object.assign(this, { loaded, shared, masks, pool, renderer, uniforms, url, mode, createTexture, fetchImpl, loadSidecar, geologyMode: geology, geologyUrl, overrides, hardnessPattern });
        this.prefix = `${prefix}/terrain-fields`;
        this.manifest = loaded.manifest;
        this.status = mode === 'off' ? 'disabled' : 'pending';
        this.reason = mode === 'off' ? 'terrain-fields-off' : 'terrain-fields-loading';
        this.geology = { status: geology === 'off' ? 'disabled' : 'pending', reason: geology === 'off' ? 'surface-model-off' : 'surface-geology-loading', sidecar: null, staleness: null, pages: null, revision: null, layout: null };
        this.layersPerPage = LANDSCAPE_TERRAIN_FIELDS_LAYOUT.layers;
        this.geologyPageBytes = 0;
        this.records = new Map();
        this.owned = new Map();
        this.failures = new Map();
        this.errors = [];
        this.abort = new AbortController();
        this.loadedCount = 0;
        this.evicted = 0;
        this.uploads = { pages: 0, bytes: 0, peakBytesPerFrame: 0, lastFrameBytes: 0 };
        this.peakBytes = { cpuBytes: 0, gpuBytes: 0 };
        this.timing = { updates: 0, lastUpdateMs: 0, peakUpdateMs: 0, totalUpdateMs: 0, pageLoads: 0, totalLoadMs: 0, peakLoadMs: 0, lastUploadMs: 0, peakUploadMs: 0, geologyPages: 0 };
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
            const limits = this.shared.snapshot().limits, share = LANDSCAPE_TERRAIN_FIELD_RUNTIME.budgetShare, layerBytes = this.layout.layerBytes;
            this.ceiling = { cpuBytes: Math.floor(limits.cpuBytes * share), gpuBytes: Math.floor(limits.gpuBytes * share) };
            // the field array alone (its page layers and the appearance layer) must fit the ceiling before any geology is considered: a constrained
            // profile is budget-denied exactly as before AI 598
            const fits = (layers, rootLayers, geologyBytes) => { const bytes = (this.capacity * layers + rootLayers) * layerBytes; return bytes + geologyBytes + this.layout.pageBytes * 2 + geologyBytes * 2 <= this.ceiling.cpuBytes && bytes <= this.ceiling.gpuBytes; };
            if (!fits(this.layout.layers, 1, 0)) { this.fail('budget-denied', 'terrain-fields-ceiling'); return; }
            await this.initializeGeology();
            if (this.disposed) return;
            // a geology whose three layers per slot do not fit degrades to the field layers alone; an override layer that does not fit is left absent
            if (this.geologyActive && !fits(GEOLOGY_LAYERS.perPageWithGeology, 1 + (this.overrides ? 1 : 0), layerBytes * GEOLOGY_LAYERS.geology)) this.geologyFail('budget-denied', 'surface-geology-ceiling');
            if (this.overrides && !fits(this.geologyActive ? GEOLOGY_LAYERS.perPageWithGeology : this.layout.layers, 2, this.geologyActive ? layerBytes * GEOLOGY_LAYERS.geology : 0)) {
                this.overrideLayerState = { status: 'budget-denied', workBytes: 0, error: 'terrain-fields-ceiling' };
                this.overrides = null;
            }
            this.layersPerPage = this.geologyActive ? GEOLOGY_LAYERS.perPageWithGeology : this.layout.layers;
            this.geologyPageBytes = this.geologyActive ? layerBytes * GEOLOGY_LAYERS.geology : 0;
            // the page layers of every native slot, then the override layer (while a document is bound), then the landscape-scale appearance layer (last)
            const pageLayers = this.capacity * this.layersPerPage;
            this.overrideLayerIndex = this.overrides ? pageLayers : null;
            this.appearanceLayerIndex = pageLayers + (this.overrides ? 1 : 0);
            const arrayBytes = (this.appearanceLayerIndex + 1) * layerBytes;
            this.decodeBytes = this.layout.pageBytes * 2 + this.geologyPageBytes * 2;
            this.arrayKey = `${this.prefix}/array`;
            // the CPU side also holds the neutral geology block a page without usable geology copies
            const reserved = this.reserve(this.arrayKey, { cpuBytes: arrayBytes + this.geologyPageBytes, gpuBytes: arrayBytes, kind: 'terrain-fields-array' });
            if (!reserved.admitted) { this.arrayKey = null; this.fail('budget-denied', `terrain-fields-array-${reserved.reason}`); return; }
            this.arrayBytes = arrayBytes;
            this.pixels = new Uint8Array(arrayBytes);
            this.neutralGeology = this.geologyActive ? landscapeSurfaceNeutralGeologyPage(this.layout) : null;
            this.texture = this.createTexture({ pixels: this.pixels, width: this.layout.width, height: this.layout.height, depth: this.appearanceLayerIndex + 1 });
            this.uniforms.uTerrainFields.value = this.texture;
            const state = this.uniforms.uTerrainFieldsState.value;
            state[0] = this.staleness.staleCells[0]; state[1] = this.staleness.staleCells[1]; state[2] = FLAGS.fields | (this.geologyActive ? FLAGS.geology : 0) | (this.surfaceModelOn ? FLAGS.model : 0); state[3] = this.layersPerPage;
            this.status = this.staleness.staleChunks.length ? 'active-partial' : 'active';
            this.reason = this.staleness.staleChunks.length ? 'terrain-fields-stale-chunks' : null;
            this.track();
        } catch (error) {
            if (error.name === 'AbortError' || this.disposed) return;
            this.fail(error.name === 'LandscapeTerrainFieldsBindingError' ? 'binding-mismatch' : 'invalid', error.message);
        } finally { if (!this.disposed) this.release(key); }
    }

    // AI 598 D1: binds the geology sidecar beside the fields; every outcome is explicit and none takes the fields down
    async initializeGeology() {
        if (this.geology.status === 'disabled') return;
        if (!this.geologyUrl) { this.geologyFail('disabled', 'surface-geology-url-missing'); return; }
        const key = `${this.prefix}/geology-manifest`, admission = this.reserve(key, { cpuBytes: LANDSCAPE_TERRAIN_FIELD_RUNTIME.geologyDecodeBytes, gpuBytes: 0, kind: 'surface-geology-manifest-decode' });
        if (!admission.admitted) { this.geologyFail('budget-denied', `surface-geology-manifest-${admission.reason}`); return; }
        try {
            const sidecar = await loadLandscapeGeology(this.geologyUrl, { landscape: this.manifest, signal: this.abort.signal, ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}) });
            if (this.disposed) return;
            if (!sidecar) { this.geologyFail('absent', 'surface-geology-404'); return; }
            const layout = landscapeGeologyLayout(sidecar.terrain.grid.chunkIntervals + 1);
            if (layout.width !== this.layout.width || layout.halo !== this.layout.halo || layout.layerBytes !== this.layout.layerBytes) throw new Error('geology pages do not share the field page layout');
            const staleness = landscapeGeologyStaleness(sidecar, this.manifest);
            if (!sidecar.pages.some(page => staleness.pages[page.id] !== 'stale')) { this.geologyFail('stale', 'surface-geology-all-chunks-stale'); return; }
            Object.assign(this.geology, { status: staleness.staleChunks.length ? 'active-partial' : 'active', reason: staleness.staleChunks.length ? 'surface-geology-stale-chunks' : null, sidecar, staleness,
                pages: new Map(sidecar.pages.map(page => [page.id, page])), revision: sidecar.revision, layout });
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            if (this.disposed) return;
            this.geologyFail(error.name === 'LandscapeGeologyBindingError' ? 'binding-mismatch' : 'invalid', error.message);
        } finally { if (!this.disposed) this.release(key); }
    }

    geologyFail(status, reason) {
        Object.assign(this.geology, { status, reason, sidecar: null, staleness: null, pages: null, revision: null, layout: null });
        if (!['absent', 'disabled'].includes(status)) {
            this.errors.push({ status: `geology-${status}`, message: reason });
            console.warn(`[LandscapeSurface] Geology ${status}: ${reason}`);
        }
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

    get geologyActive() { return this.geology.status === 'active' || this.geology.status === 'active-partial'; }

    /** AI 598 D1: the surface model switch (state bit 4 while the fields are active); off keeps every surface output neutral. */
    get surfaceModelOn() { return this.geologyMode === 'on'; }

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
        const geologyPage = this.geologyActive ? this.geology.pages.get(mask.id) : null, geologyUsable = !!geologyPage && this.geology.staleness.pages[mask.id] !== 'stale';
        const record = { id: mask.id, slot: mask.slot, key, page, status: 'loading', progress: 0, bytes: null, geology: null, abort: new AbortController(), state: this.staleness.pages[mask.id], requestedAt: performance.now() };
        this.records.set(mask.id, record);
        const options = { priority: LANDSCAPE_TERRAIN_FIELD_RUNTIME.workerPriority, signal: record.abort.signal }, jobs = [this.pool.request({ type: 'field', page: page.fields }, options)];
        if (geologyUsable) jobs.push(this.pool.request({ type: 'geology', page: { fields: geologyPage.fields, categorical: geologyPage.categorical }, layout: { width: this.layout.width, halo: this.layout.halo, samples: this.layout.samples, layerBytes: this.layout.layerBytes } }, options));
        Promise.all(jobs).then(async ([result, geologyResult]) => {
            if (this.disposed || record.abort.signal.aborted || this.records.get(record.id) !== record) return;
            if (!(result.bytes instanceof Uint8Array) || result.bytes.length !== this.layout.pageBytes) throw new Error(`terrain field page ${record.id} returned ${result.bytes?.length} bytes`);
            record.bytes = result.bytes;
            if (this.geologyActive) {
                if (geologyUsable) {
                    if (!(geologyResult.bytes instanceof Uint8Array) || geologyResult.bytes.length !== this.geologyPageBytes) throw new Error(`geology page ${record.id} returned ${geologyResult.bytes?.length} bytes`);
                    record.geology = geologyResult.bytes;
                    this.timing.geologyPages++;
                } else record.geology = this.neutralGeology;
            }
            if (record.id === this.manifest.overviewId) {
                await this.deriveAppearanceLayer(record);
                if (this.disposed || record.abort.signal.aborted || this.records.get(record.id) !== record) return;
                if (this.overrides) {
                    await this.deriveOverrideLayer(record);
                    if (this.disposed || record.abort.signal.aborted || this.records.get(record.id) !== record) return;
                }
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
        record.geology = null;
        record.layer = null;
        record.overrideLayer = null;
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
        const root = decoded?.id === this.manifest.overviewId;
        const bytes = this.layout.pageBytes + (decoded?.geology ? this.geologyPageBytes : 0) + (root && decoded.layer ? this.layout.layerBytes : 0) + (root && decoded.overrideLayer ? this.layout.layerBytes : 0);
        if (decoded && bytes <= uploadAllowance) {
            const uploadStarted = performance.now(), base = decoded.slot * this.layersPerPage;
            this.pixels.set(decoded.bytes, base * this.layout.layerBytes);
            decoded.rockExposure = landscapeTerrainFieldPageRockExposure(decoded.bytes, this.layout);
            for (let layer = 0; layer < this.layout.layers; layer++) this.texture.addLayerUpdate(base + layer);
            if (decoded.geology) {
                this.pixels.set(decoded.geology, (base + GEOLOGY_LAYERS.geologyStart) * this.layout.layerBytes);
                for (let layer = 0; layer < GEOLOGY_LAYERS.geology; layer++) this.texture.addLayerUpdate(base + GEOLOGY_LAYERS.geologyStart + layer);
            }
            if (root) { this.uploadAppearanceLayer(decoded); this.uploadOverrideLayer(decoded); }
            this.texture.needsUpdate = true;
            this.renderer.initTexture(this.texture);
            this.texture.clearLayerUpdates();
            decoded.bytes = null;
            decoded.geology = null;
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

    // AI 598 D1: rasterizes the bound overrides document into the root-grid override layer in the appearance worker with the root page; a failure or a
    // denied reservation keeps the root page and leaves the layer absent (state bit 3 clear, every override neutral)
    async deriveOverrideLayer(record) {
        const root = this.loaded.chunk, key = `${this.prefix}/override-layer/${record.page.fields.sha256}`, workBytes = this.layout.layerBytes * 2;
        this.overrideLayerState = { status: 'deriving', workBytes, error: null };
        const admission = this.totals().cpuBytes + workBytes > this.ceiling.cpuBytes ? { admitted: false, reason: 'terrain-fields-ceiling' }
            : this.reserve(key, { cpuBytes: workBytes, gpuBytes: 0, kind: 'surface-override-layer-derivation' });
        if (!admission.admitted) { this.overrideLayerState = { status: 'budget-denied', workBytes, error: admission.reason }; return; }
        const started = performance.now();
        try {
            const input = { overrides: this.overrides, rootGrid: { bounds: { ...root.descriptor.bounds }, samples: this.layout.samples, halo: this.layout.halo, width: this.layout.width } };
            const result = await this.pool.request({ type: 'surface-override-layer', input }, { priority: LANDSCAPE_TERRAIN_FIELD_RUNTIME.workerPriority, signal: record.abort.signal });
            if (!(result.bytes instanceof Uint8Array) || result.bytes.length !== this.layout.layerBytes) throw new Error(`override layer returned ${result.bytes?.length} bytes`);
            record.overrideLayer = { bytes: result.bytes, latencyMs: performance.now() - started };
            this.overrideLayerState = { status: 'derived', workBytes, error: null };
        } catch (error) {
            if (error.name === 'AbortError' || this.disposed) throw error;
            this.overrideLayerState = { status: 'failed', workBytes, error: error.message };
            this.errors.push({ status: 'override-layer-failed', message: error.message });
            console.warn(`[LandscapeSurface] Override layer failed: ${error.message}`);
        } finally { this.release(key); }
    }

    // writes the derived layer to the array layer after the page layers in the root page's upload frame and marks it resident (state bit 1)
    uploadAppearanceLayer(record) {
        if (!record.layer) return;
        this.pixels.set(record.layer.bytes, this.appearanceLayerIndex * this.layout.layerBytes);
        this.texture.addLayerUpdate(this.appearanceLayerIndex);
        this.uniforms.uTerrainFieldsState.value[2] |= FLAGS.appearanceLayer;
        this.appearanceLayer = { id: LANDSCAPE_TERRAIN_APPEARANCE.layer.id, rootId: this.manifest.overviewId, layer: this.appearanceLayerIndex, bytes: this.layout.layerBytes,
            statistics: record.layer.statistics, latencyMs: record.layer.latencyMs, derivedIn: 'appearance worker' };
        this.appearanceLayerState = { ...this.appearanceLayerState, status: 'resident' };
        record.layer = null;
    }

    // writes the override layer before the appearance layer in the same frame and marks it resident (state bit 3)
    uploadOverrideLayer(record) {
        if (!record.overrideLayer || this.overrideLayerIndex === null) return;
        this.pixels.set(record.overrideLayer.bytes, this.overrideLayerIndex * this.layout.layerBytes);
        this.texture.addLayerUpdate(this.overrideLayerIndex);
        this.uniforms.uTerrainFieldsState.value[2] |= FLAGS.overrides;
        this.overrideLayer = { id: this.overrides.id, rootId: this.manifest.overviewId, layer: this.overrideLayerIndex, bytes: this.layout.layerBytes, regions: this.overrides.regions.length, latencyMs: record.overrideLayer.latencyMs, derivedIn: 'appearance worker' };
        this.overrideLayerState = { ...this.overrideLayerState, status: 'resident' };
        record.overrideLayer = null;
    }

    /** CPU copy of the resident landscape-scale appearance layer with its layout, or null before the root page arrives. */
    appearanceLayerSource() {
        if (!this.active || !this.appearanceLayer) return null;
        return { pixels: this.pixels, offset: this.appearanceLayerIndex * this.layout.layerBytes, layout: this.layout };
    }

    /** CPU copy of the resident override layer with its layout and the root bounds (the GPU reads uMaskBounds[0]), or null without a bound document or before the root page arrives. */
    overrideLayerSource() {
        if (!this.active || !this.overrideLayer) return null;
        return { pixels: this.pixels, offset: this.overrideLayerIndex * this.layout.layerBytes, layout: this.layout, bounds: this.loaded.chunk.descriptor.bounds };
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
            fetch: (slot, x, z, out) => sampleLandscapeTerrainFieldPage(this.pixels, slot * this.layersPerPage * this.layout.layerBytes, this.layout, slots[slot].bounds, x, z, out) };
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

    /**
     * AI 598 D1: exact JavaScript mirror of landscapeSurfaceGeology (surface_model.glsl) over the resident geology layers: the decoded geology channels at the
     * same filtered taps and slot walk as the fields, and the one-hot fractions and hardness of the four aligned categorical samples of every contributing
     * slot; availability 0 (geology unbound, stale cell or no resident page) leaves the inputs neutral.
     * @param {number} x @param {number} z @param {{dx?:number[],dy?:number[]}} [options]
     */
    geologySample(x, z, { dx = [0, 0], dy = [0, 0] } = {}) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('[LandscapeSurface] geology sample coordinates must be finite');
        const inert = { status: this.geology.status, reason: this.geology.reason, availability: 0, units: null, geology: null, categories: null, slot: null, contributions: [] };
        if (!this.active || !this.geologyActive) return inert;
        const source = this.slotSource(), walk = sampleLandscapeTerrainFieldSlots(source, x, z, { dx, dy });
        if (walk.availability <= 0) return inert;
        const units = new Float64Array(8), scratch = new Float64Array(8), onehot = createLandscapeSurfaceOneHot(), categories = createLandscapeSurfaceOneHot();
        for (const name of ['depositType', 'drainage', 'coastalZone']) categories[name].fill(0);
        categories.hardness = 0;
        const { layerBytes, width, halo, samples } = this.layout, intervals = samples - 1;
        for (const { slot, weight } of walk.contributions) {
            const offset = slot * this.layersPerPage * layerBytes, bounds = source.slots[slot].bounds;
            sampleLandscapeGeologyPageUnits(this.pixels, offset + GEOLOGY_LAYERS.geologyStart * layerBytes, this.geology.layout, bounds, x, z, scratch);
            for (let i = 0; i < 8; i++) units[i] += scratch[i] * weight;
            const gx = clamp((x - bounds.minX) / (bounds.maxX - bounds.minX) * intervals, 0, intervals), gz = clamp((bounds.maxZ - z) / (bounds.maxZ - bounds.minZ) * intervals, 0, intervals);
            const ix = Math.min(Math.floor(gx), intervals - 1), iz = Math.min(Math.floor(gz), intervals - 1), fx = gx - ix, fz = gz - iz;
            const labels = (column, row) => { const at = offset + GEOLOGY_LAYERS.categorical * layerBytes + ((row + halo) * width + column + halo) * 4; return [this.pixels[at], this.pixels[at + 1], this.pixels[at + 2], this.pixels[at + 3]]; };
            landscapeSurfaceOneHot([labels(ix, iz), labels(ix + 1, iz), labels(ix, iz + 1), labels(ix + 1, iz + 1)], [(1 - fx) * (1 - fz) * weight, fx * (1 - fz) * weight, (1 - fx) * fz * weight, fx * fz * weight], this.hardnessPattern, onehot);
            for (const name of ['depositType', 'drainage', 'coastalZone']) for (let i = 0; i < categories[name].length; i++) categories[name][i] += onehot[name][i];
            categories.hardness += onehot.hardness;
        }
        for (let i = 0; i < 8; i++) units[i] /= walk.availability;
        for (const name of ['depositType', 'drainage', 'coastalZone']) for (let i = 0; i < categories[name].length; i++) categories[name][i] /= walk.availability;
        categories.hardness /= walk.availability;
        return { status: this.geology.status, reason: this.geology.reason, availability: walk.availability, units: [...units], geology: decodeLandscapeGeology(units), categories, slot: walk.contributions[0].slot,
            contributions: walk.contributions, revision: this.geology.revision };
    }

    snapshot() {
        const records = [...this.records.values()], pageStates = this.staleness ? Object.values(this.staleness.pages) : [];
        const pending = records.filter(record => record.status !== 'resident').length;
        const missing = this.active && [...this.masks.records.values()].some(mask => mask.kind !== 'detail' && mask.status === 'resident' && this.pages.has(mask.id)
            && this.staleness.pages[mask.id] !== 'stale' && !this.records.has(mask.id) && (this.failures.get(mask.id)?.attempts ?? 0) < LANDSCAPE_TERRAIN_FIELD_RUNTIME.maxAttempts);
        const arrayBytes = this.arrayKey ? this.arrayBytes : 0, totals = this.totals(), geologyStates = this.geology.staleness ? Object.values(this.geology.staleness.pages) : [];
        return { status: this.status, reason: this.reason, mode: this.mode, url: this.url, recipe: LANDSCAPE_TERRAIN_FIELD_RUNTIME.id,
            revision: this.sidecar?.revision ?? null, terrainRevision: this.sidecar?.terrain.revision ?? null, currentTerrainRevision: this.manifest.revision,
            bound: this.staleness?.bound ?? false, staleChunks: [...(this.staleness?.staleChunks ?? [])], staleCells: [...(this.staleness?.staleCells ?? [0, 0])],
            pageStates: { fresh: pageStates.filter(state => state === 'fresh').length, partial: pageStates.filter(state => state === 'partial').length, stale: pageStates.filter(state => state === 'stale').length },
            residentPages: records.filter(record => record.status === 'resident').map(record => ({ id: record.id, slot: record.slot, progress: record.progress, state: record.state })),
            pending, missingWork: !!missing, settled: !this.active || (pending === 0 && !missing && records.every(record => record.progress === 1 || this.masks.records.get(record.id)?.status !== 'resident')),
            failures: [...this.failures.values()].map(failure => ({ ...failure })), errors: [...this.errors], loaded: this.loadedCount, evicted: this.evicted,
            capacity: this.capacity ?? 0, layersPerPage: this.layersPerPage,
            layerMapping: `layer = native mask slot * ${this.layersPerPage} + k (k 0-3 the field layers${this.geologyActive ? ', 4-5 the geology field layers, 6 the packed categorical labels' : ''}); ${this.overrides ? 'then the root-grid override layer, ' : ''}the last layer is the landscape-scale appearance layer`,
            appearanceLayer: this.appearanceLayer ? { ...this.appearanceLayer, statistics: { ...this.appearanceLayer.statistics } } : null,
            appearanceLayerState: this.appearanceLayerState ? { ...this.appearanceLayerState } : { status: this.active ? 'pending' : 'absent', workBytes: 0, error: null },
            geology: { mode: this.geologyMode, status: this.geology.status, reason: this.geology.reason, url: this.geologyUrl, revision: this.geology.revision, bound: this.geology.staleness?.bound ?? false,
                staleChunks: [...(this.geology.staleness?.staleChunks ?? [])], pageStates: { fresh: geologyStates.filter(state => state === 'fresh').length, partial: geologyStates.filter(state => state === 'partial').length, stale: geologyStates.filter(state => state === 'stale').length },
                layers: this.geologyActive ? [GEOLOGY_LAYERS.geologyStart, GEOLOGY_LAYERS.geologyStart + 1, GEOLOGY_LAYERS.categorical] : [], pageBytes: this.geologyPageBytes, pagesLoaded: this.timing.geologyPages,
                flag: this.geologyActive ? FLAGS.geology : 0, hardnessPattern: [...this.hardnessPattern] },
            overrideLayer: this.overrideLayer ? { ...this.overrideLayer } : null,
            overrideLayerState: this.overrideLayerState ? { ...this.overrideLayerState } : { status: this.overrides ? (this.active ? 'pending' : 'absent') : 'none', workBytes: 0, error: null },
            bytes: { arrayCpu: arrayBytes ? arrayBytes + this.geologyPageBytes : 0, arrayGpu: arrayBytes, pageBytes: this.layout?.pageBytes ?? 0, geologyPageBytes: this.geologyPageBytes, decodeReservation: this.decodeBytes ?? 0, cpuBytes: totals.cpuBytes, gpuBytes: totals.gpuBytes,
                peakCpuBytes: this.peakBytes.cpuBytes, peakGpuBytes: this.peakBytes.gpuBytes, ceiling: this.ceiling ?? null },
            uploads: { ...this.uploads }, degradationReason: this.degradation ?? null,
            timing: { ...this.timing, meanUpdateMs: this.timing.updates ? this.timing.totalUpdateMs / this.timing.updates : 0, meanLoadMs: this.timing.pageLoads ? this.timing.totalLoadMs / this.timing.pageLoads : 0,
                note: 'main-thread update includes sync, one layer-wise upload call and fade; page load is worker fetch plus SHA-256 latency from request to decoded (field and geology pages together)' },
            channels: LANDSCAPE_TERRAIN_FIELD_CHANNELS.map(channel => channel.name),
            shader: { sampler: 'uTerrainFields', state: 'uTerrainFieldsState', progress: 'uMaskMeta.w = 1 + 0.25 * progress on native slots', chunk: 'chunks/landscape/terrain_fields.glsl', included: true,
                consumers: 'terrain program, lighting tiers standard and high: sun visibility, sky visibility, occluder horizons of terrain-reflected light (landscape-terrain-visibility-v1); AI 598 surface model views (geology layers)' } };
    }

    releaseArray() {
        if (this.arrayKey) this.release(this.arrayKey);
        this.arrayKey = null;
        this.appearanceLayer = null;
        this.appearanceLayerState = null;
        this.overrideLayer = null;
        this.overrideLayerState = null;
        this.neutralGeology = null;
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
        this.release(`${this.prefix}/geology-manifest`);
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
