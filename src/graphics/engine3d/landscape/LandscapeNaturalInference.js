// Shares one terrain-driven natural display-soil policy per loaded landscape between the geometry and appearance streams.
// @ts-check
// Planning-only cover (urban, road, runway) displays natural-terrain-inference-v1 labels from the published natural-soil pages of the
// terrain-fields sidecar at every level: native and coarser mask pages, generated fine pages, fallback mesh colors, inspection and material
// interests. The policy is decided once per loaded landscape, before any of those is built, and never changes afterwards, so no page
// mixes policies: while the sidecar is active, a stale native chunk (height or land cover changed since the bake) keeps the
// natural-overview-infill-v1 fallback for exactly its own samples; an absent (404), disabled, invalid, mismatched, all-stale or
// unaffordable sidecar keeps the fallback everywhere. Every case is reported. One source is shared by both streams through the frozen
// `loaded` object (reference counted), so the sidecar is fetched and validated once and the terrain-field pages reuse the same load.
// Natural-soil pages are read by the workers that consume them (authenticated, one at a time) inside reservations that include them;
// this source only holds the bounded page table and the per-native policy.
import { LANDSCAPE_NATURAL_SOIL, createLandscapeNaturalSoilResolver, landscapeNaturalSoilTransientBytes } from '../../../app/landscape/LandscapeNaturalSoil.js';
import { loadLandscapeTerrainFields } from '../../../app/landscape/LandscapeTerrainFieldsPayload.js';
import { landscapeTerrainFieldsStaleness } from '../../../app/landscape/LandscapeTerrainFields.js';

export const LANDSCAPE_NATURAL_INFERENCE = Object.freeze({
    id: 'landscape-natural-inference-runtime-v1',
    policy: LANDSCAPE_NATURAL_SOIL.terrain,
    fallback: LANDSCAPE_NATURAL_SOIL.overview,
    modes: Object.freeze(['terrain', 'overview']),
    defaultMode: 'terrain',
    manifestDecodeBytes: 768 * 1024,
    // the root is built only after the policy is decided; a sidecar that has not arrived by then leaves the overview infill for this load
    // (the terrain-field pages keep awaiting the same request)
    loadTimeoutMs: 10000,
    statuses: Object.freeze(['pending', 'active', 'active-partial', 'absent', 'disabled', 'invalid', 'binding-mismatch', 'stale', 'budget-denied', 'timeout'])
});

/**
 * Validates a natural inference mode (the viewer's landscapeNaturalInference=terrain|overview option; 'overview' forces the former 15.625 m
 * infill everywhere without requesting the sidecar for natural soil). @param {string} mode @returns {'terrain'|'overview'}
 */
export function landscapeNaturalInferenceMode(mode) {
    if (!LANDSCAPE_NATURAL_INFERENCE.modes.includes(mode)) throw new Error(`[Landscape] natural inference must be one of ${LANDSCAPE_NATURAL_INFERENCE.modes.join(', ')}; received ${mode}`);
    return /** @type {any} */ (mode);
}

// one source per frozen `loaded` object: the geometry and appearance streams of a load share it without a reference to each other
const sources = new WeakMap();

/**
 * Acquires the natural inference source of a loaded landscape; the first acquirer's options create it and the last release disposes it. Both
 * streams of a load receive the viewer's mode, so a second acquirer with another mode is an error (one load never mixes policies).
 * @param {any} loaded frozen result of loadLandscapeOverview @param {{ledger?:any,mode?:'terrain'|'overview',url?:string,fetchImpl?:typeof fetch}} [options]
 */
export function acquireLandscapeNaturalInference(loaded, options = {}) {
    let source = sources.get(loaded);
    if (!source || source.disposed) { source = new LandscapeNaturalInference({ loaded, ...options }); sources.set(loaded, source); }
    else if (options.mode !== undefined && options.mode !== source.mode) throw new Error(`[Landscape] natural inference of this load already uses mode ${source.mode}; received ${options.mode}`);
    source.references++;
    let released = false;
    return Object.freeze({ source, release: () => {
        if (released) return;
        released = true;
        if (--source.references === 0) source.dispose();
    } });
}

export class LandscapeNaturalInference {
    /** @param {{loaded:any,ledger?:any,mode?:'terrain'|'overview',url?:string,fetchImpl?:typeof fetch}} options ledger is the shared LandscapeResidencyBudget */
    constructor({ loaded, ledger = null, mode = LANDSCAPE_NATURAL_INFERENCE.defaultMode, url = new URL('./fields/manifest.json', loaded.manifestUrl).href, fetchImpl,
        loadTimeoutMs = LANDSCAPE_NATURAL_INFERENCE.loadTimeoutMs }) {
        this.mode = landscapeNaturalInferenceMode(mode);
        this.loadTimeoutMs = loadTimeoutMs;
        this.manifest = loaded.manifest;
        this.ledger = ledger;
        this.url = url;
        this.fetchImpl = fetchImpl;
        this.references = 0;
        this.prefix = `natural-inference/${crypto.randomUUID()}`;
        this.abort = new AbortController();
        this.natives = this.manifest.chunks.filter(chunk => chunk.level === this.manifest.grid.maxLevel).map(chunk => chunk.id);
        this.chunks = new Map(this.manifest.chunks.map(chunk => [chunk.id, chunk]));
        this.pages = new Map();
        this.stale = new Set();
        this.errors = [];
        this.revision = null;
        this.terrainRevision = null;
        this.bound = false;
        this.inference = null;
        this.loadMs = null;
        this.status = this.mode === 'overview' ? 'disabled' : 'pending';
        this.reason = this.mode === 'overview' ? 'natural-inference-overview-mode' : 'natural-inference-loading';
        /** Resolves (never rejects) once the policy is decided. */
        this.ready = this.mode === 'overview' ? Promise.resolve(this) : this.load();
    }

    /** Memoized sidecar load, shared with the terrain-field pages: null for HTTP 404, otherwise the validated sidecar or an explicit error. */
    sidecar() {
        this.sidecarPromise ??= loadLandscapeTerrainFields(this.url, { landscape: this.manifest, signal: this.abort.signal, ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}) });
        return this.sidecarPromise;
    }

    async load() {
        const started = performance.now(), key = `${this.prefix}/manifest`;
        const admission = this.ledger ? this.ledger.reserve(key, { cpuBytes: LANDSCAPE_NATURAL_INFERENCE.manifestDecodeBytes, gpuBytes: 0, kind: 'natural-inference-manifest-decode' }) : { admitted: true, reason: null };
        if (!admission.admitted) { this.fail('budget-denied', `natural-inference-manifest-${admission.reason}`); return this; }
        try {
            let timer;
            const expired = Symbol('natural-inference-timeout');
            const sidecar = await Promise.race([this.sidecar(), new Promise(resolve => { timer = setTimeout(() => resolve(expired), this.loadTimeoutMs); })]).finally(() => clearTimeout(timer));
            if (this.disposed) return this;
            if (sidecar === expired) { this.fail('timeout', `natural-inference-sidecar-timeout-${this.loadTimeoutMs}-ms`); return this; }
            if (!sidecar) { this.fail('absent', 'terrain-fields-404'); return this; }
            const missing = this.manifest.chunks.filter(chunk => !sidecar.pages.some(page => page.id === chunk.id)).map(chunk => chunk.id);
            if (missing.length) throw new Error(`natural soil needs a page entry for every chunk; missing ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ', ...' : ''}`);
            const staleness = landscapeTerrainFieldsStaleness(sidecar, this.manifest);
            for (const page of sidecar.pages) this.pages.set(page.id, page.naturalSoil ? Object.freeze({ url: page.naturalSoil.url, sha256: page.naturalSoil.sha256, byteLength: page.naturalSoil.byteLength }) : null);
            for (const id of staleness.staleChunks) this.stale.add(id);
            Object.assign(this, { revision: sidecar.revision, terrainRevision: sidecar.terrain.revision, bound: staleness.bound, inference: sidecar.statistics.naturalSoil ?? null });
            if (this.stale.size === this.natives.length) { this.fail('stale', 'terrain-fields-all-chunks-stale'); return this; }
            this.status = this.stale.size ? 'active-partial' : 'active';
            this.reason = this.stale.size ? 'terrain-fields-stale-chunks' : null;
        } catch (error) {
            if (error.name === 'AbortError' || this.disposed) return this;
            this.fail(error.name === 'LandscapeTerrainFieldsBindingError' ? 'binding-mismatch' : 'invalid', error.message);
        } finally {
            this.ledger?.release(key);
            this.loadMs = performance.now() - started;
        }
        return this;
    }

    fail(status, reason) {
        this.status = status;
        this.reason = reason;
        this.pages.clear();
        if (!['absent', 'disabled'].includes(status)) {
            this.errors.push({ status, message: reason });
            console.warn(`[Landscape] Natural inference falls back to ${LANDSCAPE_NATURAL_SOIL.overview} (${status}): ${reason}`);
        }
    }

    get active() { return this.status === 'active' || this.status === 'active-partial'; }

    /** Effective policy of a native chunk. @param {string} id */
    nativePolicy(id) { return this.active && !this.stale.has(id) ? LANDSCAPE_NATURAL_SOIL.terrain : LANDSCAPE_NATURAL_SOIL.overview; }

    /** landscape-natural-soil-request for a job that reads the given chunks (inactive: overview infill everywhere). @param {string[]} chunkIds */
    describe(chunkIds) {
        if (!this.active) return { format: LANDSCAPE_NATURAL_SOIL.format, policy: LANDSCAPE_NATURAL_SOIL.terrain, active: false, url: null, overviewNatives: [], pages: {} };
        return { format: LANDSCAPE_NATURAL_SOIL.format, policy: LANDSCAPE_NATURAL_SOIL.terrain, active: true, url: this.url, overviewNatives: [...this.stale].sort(),
            pages: Object.fromEntries(chunkIds.map(id => {
                if (!this.chunks.has(id)) throw new Error(`[Landscape] natural inference has no chunk ${id}`);
                return [id, this.pages.get(id) ?? null];
            })) };
    }

    /** Worker bytes of reading the natural-soil pages of these chunks one at a time (0 when none is needed). @param {string[]} chunkIds */
    transientBytes(chunkIds) {
        if (!this.active || !chunkIds.length) return 0;
        const resolver = createLandscapeNaturalSoilResolver(this.manifest, this.describe(chunkIds)), chunks = chunkIds.map(id => this.chunks.get(id));
        return chunks.some(chunk => resolver.needsPage(chunk)) ? landscapeNaturalSoilTransientBytes(chunks[0]) : 0;
    }

    snapshot() {
        const terrain = this.natives.filter(id => this.nativePolicy(id) === LANDSCAPE_NATURAL_SOIL.terrain);
        const published = [...this.pages.values()].filter(Boolean);
        return {
            recipe: LANDSCAPE_NATURAL_INFERENCE.id, mode: this.mode, configuredPolicy: this.mode === 'terrain' ? LANDSCAPE_NATURAL_SOIL.terrain : LANDSCAPE_NATURAL_SOIL.overview,
            policy: this.active ? LANDSCAPE_NATURAL_SOIL.terrain : LANDSCAPE_NATURAL_SOIL.overview, fallbackPolicy: LANDSCAPE_NATURAL_SOIL.overview,
            status: this.status, reason: this.reason, url: this.url, revision: this.revision, terrainRevision: this.terrainRevision, currentTerrainRevision: this.manifest.revision, bound: this.bound,
            natives: { total: this.natives.length, terrain: terrain.length, overview: this.natives.length - terrain.length },
            fallbackScope: this.active ? (this.stale.size ? 'stale-natives' : 'none') : 'all-natives',
            overviewNatives: this.active ? [...this.stale].sort().map(id => ({ id, reason: 'stale' })) : [],
            policyByNative: Object.fromEntries(this.natives.map(id => [id, this.nativePolicy(id)])),
            pages: { published: published.length, unique: new Set(published.map(page => page.sha256)).size, byteLength: published[0]?.byteLength ?? 0,
                transientWorkerBytes: published.length ? LANDSCAPE_NATURAL_SOIL.transientPages * published[0].byteLength : 0 },
            inference: this.inference, loadMs: this.loadMs, errors: [...this.errors], references: this.references
        };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.abort.abort();
        this.ledger?.release(`${this.prefix}/manifest`);
    }
}
