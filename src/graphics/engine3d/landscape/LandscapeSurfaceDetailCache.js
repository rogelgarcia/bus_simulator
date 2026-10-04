// Retains evicted generated fine coverage pages by content identity in a byte-bounded least-recently-stored cache.
// @ts-check
// The viewer owns the cache so generated pages survive source reloads; a soil edit changes only the identities of the
// pages it influences, so every other page returns without regeneration. Retained bytes are reserved in the shared
// residency ledger under one key before a page is accepted, and the oldest pages are dropped whenever the byte capacity
// or the ledger cannot hold another. Uniform results carry no pixels and are remembered by identity in a count-bounded set.

const MIB = 1024 * 1024;

export const LANDSCAPE_SURFACE_DETAIL_CACHE = Object.freeze({
    maxPages: 48,
    appearanceCpuShare: 1 / 8,
    minimumAppearanceGpuBytes: 8 * MIB,
    maxUniformIdentities: 4096
});

function requireBytes(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`[LandscapeSurfaceDetailCache] ${label} must be a nonnegative safe integer; received ${value}`);
    return value;
}

function requireIdentity(identity) {
    if (typeof identity !== 'string' || !identity.length) throw new Error('[LandscapeSurfaceDetailCache] page identity must be a nonempty string');
}

/**
 * Byte capacity of the view cache for a shared budget profile: 48 pages bounded by an eighth of the appearance CPU
 * ceiling (half of the total), and zero without generated levels or below 8 MiB of appearance GPU.
 * @param {{limits:{cpuBytes:number,gpuBytes:number},pageBytes:number,levels:number}} options shared total limits
 */
export function landscapeSurfaceDetailCacheCapacity({ limits, pageBytes, levels }) {
    requireBytes(limits?.cpuBytes, 'CPU limit'); requireBytes(limits.gpuBytes, 'GPU limit');
    if (!Number.isSafeInteger(pageBytes) || pageBytes < 1) throw new Error('[LandscapeSurfaceDetailCache] pageBytes must be a positive integer');
    if (!Number.isSafeInteger(levels) || levels < 0) throw new Error('[LandscapeSurfaceDetailCache] levels must be a nonnegative integer');
    const cache = LANDSCAPE_SURFACE_DETAIL_CACHE, appearanceCpu = Math.floor(limits.cpuBytes / 2), appearanceGpu = Math.floor(limits.gpuBytes / 2);
    if (!levels || appearanceGpu < cache.minimumAppearanceGpuBytes) return 0;
    return Math.min(cache.maxPages, Math.floor(appearanceCpu * cache.appearanceCpuShare / pageBytes)) * pageBytes;
}

export class LandscapeSurfaceDetailCache {
    #budget;
    #key;
    #capacityBytes;
    #maxUniform;
    #pages = new Map();
    #uniform = new Map();
    #bytes = 0;
    #stats = { hits: 0, misses: 0, stored: 0, evicted: 0, rejected: 0, uniformHits: 0, uniformStored: 0 };
    #denied = null;
    #disposed = false;

    /** @param {{budget:{reserve:Function,update:Function,release:Function},key:string,capacityBytes:number,maxUniform?:number}} options */
    constructor({ budget, key, capacityBytes, maxUniform = capacityBytes > 0 ? LANDSCAPE_SURFACE_DETAIL_CACHE.maxUniformIdentities : 0 }) {
        if (!budget || !['reserve', 'update', 'release'].every(name => typeof budget[name] === 'function')) throw new Error('[LandscapeSurfaceDetailCache] a residency budget is required');
        if (typeof key !== 'string' || !key.length) throw new Error('[LandscapeSurfaceDetailCache] a ledger key is required');
        this.#budget = budget;
        this.#key = key;
        this.#capacityBytes = requireBytes(capacityBytes, 'capacityBytes');
        this.#maxUniform = requireBytes(maxUniform, 'maxUniform');
        const admission = budget.reserve(key, { cpuBytes: 0, gpuBytes: 0, kind: 'appearance-surface-detail-cache' });
        if (!admission.admitted) throw new Error(`[LandscapeSurfaceDetailCache] cache key cannot be reserved: ${admission.reason}`);
        Object.freeze(this);
    }

    get capacityBytes() { return this.#capacityBytes; }
    get bytes() { return this.#bytes; }

    #active() { if (this.#disposed) throw new Error('[LandscapeSurfaceDetailCache] cache is disposed'); }

    #account() {
        const admission = this.#budget.update(this.#key, { cpuBytes: this.#bytes });
        if (!admission.admitted) throw new Error(`[LandscapeSurfaceDetailCache] shrinking the cache reservation was refused: ${admission.reason}`);
    }

    #evictOldest() {
        const [identity, entry] = this.#pages.entries().next().value;
        this.#pages.delete(identity);
        this.#bytes -= entry.bytes;
        this.#stats.evicted++;
        this.#account();
    }

    /** @param {string} identity */
    has(identity) { this.#active(); requireIdentity(identity); return this.#pages.has(identity); }

    /** Removes and returns a retained page, counting a hit or a miss. @param {string} identity */
    take(identity) {
        this.#active();
        requireIdentity(identity);
        const entry = this.#pages.get(identity);
        if (!entry) { this.#stats.misses++; return null; }
        this.#pages.delete(identity);
        this.#bytes -= entry.bytes;
        this.#account();
        this.#stats.hits++;
        return entry;
    }

    /**
     * Retains a page under its identity, evicting the oldest pages as needed; returns false when it cannot be held.
     * @param {string} identity @param {{pixels:Uint8Array,soils:ReadonlyArray<number>,sourceIds:ReadonlyArray<string>,metadata:any}} entry
     */
    store(identity, entry) {
        this.#active();
        requireIdentity(identity);
        if (!(entry?.pixels instanceof Uint8Array) || !entry.pixels.byteLength || !Array.isArray(entry.soils) || !Array.isArray(entry.sourceIds)) throw new Error('[LandscapeSurfaceDetailCache] entries need page pixels, soils and source ids');
        const bytes = entry.pixels.byteLength;
        if (this.#pages.has(identity)) { this.#bytes -= this.#pages.get(identity).bytes; this.#pages.delete(identity); this.#account(); }
        if (bytes > this.#capacityBytes) { this.#stats.rejected++; return false; }
        while (this.#bytes + bytes > this.#capacityBytes) this.#evictOldest();
        for (;;) {
            const admission = this.#budget.update(this.#key, { cpuBytes: this.#bytes + bytes });
            if (admission.admitted) break;
            this.#denied = admission.reason;
            if (!this.#pages.size) { this.#stats.rejected++; return false; }
            this.#evictOldest();
        }
        this.#pages.set(identity, Object.freeze({ pixels: entry.pixels, soils: entry.soils, sourceIds: entry.sourceIds, metadata: entry.metadata, bytes }));
        this.#bytes += bytes;
        this.#stats.stored++;
        return true;
    }

    /** Uniform display soil remembered for an identity, or -1. @param {string} identity */
    uniformSoil(identity) {
        this.#active();
        requireIdentity(identity);
        const soil = this.#uniform.get(identity);
        if (soil === undefined) return -1;
        this.#uniform.delete(identity);
        this.#uniform.set(identity, soil);
        this.#stats.uniformHits++;
        return soil;
    }

    /** @param {string} identity @param {number} soil */
    storeUniform(identity, soil) {
        this.#active();
        requireIdentity(identity);
        if (!Number.isSafeInteger(soil) || soil < 0 || soil > 15) throw new Error('[LandscapeSurfaceDetailCache] uniform soil must be a packed soil index 0..15');
        if (!this.#maxUniform) return false;
        this.#uniform.delete(identity);
        this.#uniform.set(identity, soil);
        while (this.#uniform.size > this.#maxUniform) this.#uniform.delete(this.#uniform.keys().next().value);
        this.#stats.uniformStored++;
        return true;
    }

    snapshot() {
        return Object.freeze({ capacityBytes: this.#capacityBytes, bytes: this.#bytes, pages: this.#pages.size, uniformIdentities: this.#uniform.size, maxUniformIdentities: this.#maxUniform,
            ...this.#stats, deniedReason: this.#denied, disposed: this.#disposed });
    }

    dispose() {
        if (this.#disposed) return;
        this.#pages.clear();
        this.#uniform.clear();
        this.#bytes = 0;
        this.#disposed = true;
        this.#budget.release(this.#key);
    }
}
