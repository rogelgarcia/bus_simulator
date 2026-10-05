// Plans, generates, caches and uploads generated fine surface-coverage pages into the fine slots of the shared mask array.
// @ts-check
// Fine records live in the mask-page record map with kind 'detail' and slots above the native capacity, so the shared
// fade loop, children-before-parents eviction and availability uniforms treat them exactly like native pages. A page is
// requested only below a fully faded resident parent; its content identity selects a cached page or one worker
// generation whose scratch is reserved before dispatch. Pages whose canonical support is a single display soil resolve
// as uniform without a slot or upload, and so do their descendants. Fine residency never gates material tiers: fine
// soils join the interests of their visible native ancestor, and visible fine leaves lend their own projected densities
// to the soils of their finest resolved page, so a material's texel demand follows the fine pages where it occurs.
// Every generation and inspection carries the natural soil request of its native owners (AI577 D5), the same request whose
// policy and page hashes enter the page identity, so a cached page always matches the labels of the resident native pages.
import { landscapeSurfaceDetailKey } from '../../../app/landscape/LandscapeSurfaceDetail.js';
import { landscapeTextureBytes } from './LandscapeAppearanceBudget.js';
import { LANDSCAPE_DETAIL_SLOTS_MAX } from './LandscapeCoverageSlots.js';
import { landscapeNaturalPresentationBytes } from './LandscapeNaturalPresentation.js';
import { landscapeSurfaceDetailScratchBytes, landscapeSurfaceDetailUniformSoil } from './LandscapeSurfaceDetailField.js';

const MIB = 1024 * 1024;

export const LANDSCAPE_SURFACE_DETAIL_RUNTIME = Object.freeze({
    workers: 2,
    workerCoverPages: 6,
    uploadsPerFrame: 4,
    retryDelayMs: 2500,
    maxAttempts: 2,
    minimumAppearanceGpuBytes: 8 * MIB,
    requestBudgetMs: 3,
    generationPriority: 40,
    inspectionPriority: 60,
    leasePriority: 30,
    timingSamples: 256
});

const inside = (bounds, x, z) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
const levelOf = id => Number(/^l(\d+)\//.exec(id)[1]);

/**
 * Fine slots that fit beside the native mask slots, every material's largest tier and coarse fallback, and one tier
 * transition overlap inside the appearance GPU ceiling; zero without levels or below 8 MiB of appearance GPU.
 * @param {{levels:number,coverageSlots:{detail:number},limits:{gpuBytes:number},pageBytes:number,nativeCapacity:number,materials:ReadonlyArray<{tiers:ReadonlyArray<{resolution:number}>}>}} options
 * @returns {Readonly<{capacity:number,reason:string|null,headroomBytes:number,materialAllowanceBytes:number}>}
 */
export function landscapeSurfaceDetailCapacity({ levels, coverageSlots, limits, pageBytes, nativeCapacity, materials }) {
    if (!Number.isSafeInteger(levels) || levels < 0 || !Number.isSafeInteger(coverageSlots?.detail) || coverageSlots.detail < 0 || !Number.isSafeInteger(limits?.gpuBytes) || limits.gpuBytes < 0
        || !Number.isSafeInteger(pageBytes) || pageBytes < 1 || !Number.isSafeInteger(nativeCapacity) || nativeCapacity < 1 || !Array.isArray(materials)) throw new Error('[LandscapeSurfaceDetail] capacity needs levels, coverage slots, appearance limits, page bytes, native capacity and materials');
    let materialAllowanceBytes = 0, transitionBytes = 0;
    for (const material of materials) {
        const resolutions = material.tiers.map(tier => tier.resolution).sort((a, b) => b - a);
        materialAllowanceBytes += 3 * (landscapeTextureBytes(resolutions[0]) + landscapeTextureBytes(resolutions.at(-1)));
        if (resolutions.length > 2) transitionBytes = Math.max(transitionBytes, 3 * landscapeTextureBytes(resolutions[1]));
    }
    materialAllowanceBytes += transitionBytes;
    const headroomBytes = limits.gpuBytes - nativeCapacity * pageBytes - materialAllowanceBytes;
    const result = (capacity, reason) => Object.freeze({ capacity, reason, headroomBytes, materialAllowanceBytes });
    if (!levels) return result(0, 'surface-detail-off');
    if (limits.gpuBytes < LANDSCAPE_SURFACE_DETAIL_RUNTIME.minimumAppearanceGpuBytes) return result(0, 'appearance-gpu-below-8-mib');
    if (!coverageSlots.detail) return result(0, 'device-coverage-slots');
    const capacity = Math.max(0, Math.min(coverageSlots.detail, LANDSCAPE_DETAIL_SLOTS_MAX, Math.floor(headroomBytes / pageBytes)));
    return result(capacity, capacity ? null : 'appearance-gpu-headroom');
}

/**
 * Controlled bytes of one detail worker context: overview cover copy, natural infill construction, its cover cache and, while terrain-driven
 * natural soil is active, its equally bounded natural-soil page cache (one label byte per chunk sample).
 * @param {any} rootDescriptor @param {number} chunkSamples @param {{naturalSoil?:boolean}} [options]
 */
export function landscapeSurfaceDetailWorkerBytes(rootDescriptor, chunkSamples, { naturalSoil = false } = {}) {
    if (!Number.isSafeInteger(chunkSamples) || chunkSamples < 1) throw new Error('[LandscapeSurfaceDetail] chunkSamples must be a positive integer');
    return rootDescriptor.columns * rootDescriptor.rows + landscapeNaturalPresentationBytes(rootDescriptor).workingBytes
        + LANDSCAPE_SURFACE_DETAIL_RUNTIME.workerCoverPages * chunkSamples * (naturalSoil ? 2 : 1);
}

/** @param {{levels:number,reason:string,recipe:any,recipeHash:string,seed:number}} options */
export function landscapeSurfaceDetailDisabledSnapshot({ levels, reason, recipe, recipeHash, seed }) {
    return { enabled: false, reason, recipe: { id: recipe.id, hash: recipeHash }, seed, levels, finestLevel: null, capacity: 0, firstSlot: null, workers: 0,
        wantedIds: [], residentIds: [], uniformIds: [], pendingIds: [], residentByLevel: {}, uniformByLevel: {}, wantedByLevel: {}, pending: 0, missingWork: false, transitioning: false,
        capacityLimited: false, nativeLimited: 0, budgetLimited: null, slotLimited: false, cache: null, generation: null, uniformResolutions: null, uploads: null, bytes: null,
        errors: [], degradationReason: null, pages: [] };
}

function statistics(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b), at = fraction => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
    return { count: values.length, mean: values.reduce((sum, value) => sum + value, 0) / values.length, median: at(.5), p95: at(.95), max: sorted.at(-1) };
}

export class LandscapeSurfaceDetailPages {
    /**
     * @param {{masks:any,budget:any,pool:any,cache:any,index:any,recipe:any,recipeHash:string,seed:number,levels:number,capacity:number,firstSlot:number,workerContextBytes:number,
     *   natural?:any}} options natural is the ready LandscapeNaturalInference of the native masks (null: overview infill everywhere)
     */
    constructor({ masks, budget, pool, cache, index, recipe, recipeHash, seed, levels, capacity, firstSlot, workerContextBytes, natural = null }) {
        if (!Number.isSafeInteger(capacity) || capacity < 1 || !Number.isSafeInteger(firstSlot) || firstSlot + capacity !== masks.slotCount) throw new Error('[LandscapeSurfaceDetail] fine slots must fill the mask array above the native capacity');
        if (!index || index.levels !== levels || !pool) throw new Error('[LandscapeSurfaceDetail] fine pages need a detail index for their levels and a worker pool');
        Object.assign(this, { masks, budget, pool, cache, index, recipe, recipeHash, seed, levels, capacity, firstSlot, workerContextBytes, natural });
        this.manifest = masks.manifest;
        this.maxLevel = this.manifest.grid.maxLevel;
        this.levelIds = Array.from({ length: levels }, (_, offset) => this.maxLevel + 1 + offset);
        this.scratchBytes = Object.fromEntries(this.levelIds.map(level => [level, landscapeSurfaceDetailScratchBytes(this.manifest, level, recipe)]));
        this.wanted = new Set();
        this.order = [];
        this.prepared = new Map();
        this.failures = new Map();
        this.jobs = 0;
        this.sampleSerial = 0;
        this.capacityLimited = false;
        this.nativeLimited = 0;
        this.budgetLimited = null;
        this.slotLimited = false;
        this.stats = { generated: 0, generationMs: [], cacheHits: 0, cacheMisses: 0, uniform: { proof: 0, descent: 0, memo: 0, generated: 0 }, uploads: 0, uploadedBytes: 0,
            lastUploadBytes: 0, peakUploadBytes: 0, evicted: 0, stored: 0 };
        this.disposed = false;
    }

    records() { return [...this.masks.records.values()].filter(record => record.kind === 'detail'); }

    knownUniform(id) {
        for (let current = id; this.index.isFine(current); current = this.index.parentId(current)) if (this.masks.records.get(current)?.status === 'uniform') return true;
        return false;
    }

    // wanted pages: visible fine leaves under natively wanted pages plus their fine ancestors, by projected sample size then distance
    plan(plan, camera) {
        const detail = plan.detail ?? null, wanted = new Set(), order = [];
        let visible = [];
        if (detail) {
            visible = detail.visibleIds.filter(id => this.masks.wanted.has(this.index.nativeAncestorId(id)));
            const distance = new Map(visible.map(id => {
                const { bounds } = this.index.descriptor(id);
                return [id, Math.hypot((bounds.minX + bounds.maxX) / 2 - camera.position.x, (bounds.minZ + bounds.maxZ) / 2 - camera.position.z)];
            }));
            visible.sort((a, b) => detail.pixelsById[b] - detail.pixelsById[a] || distance.get(a) - distance.get(b) || a.localeCompare(b));
            let slots = 0;
            for (const id of visible) {
                const chain = [];
                for (let current = id; this.index.isFine(current); current = this.index.parentId(current)) if (!wanted.has(current)) chain.unshift(current);
                const cost = chain.filter(value => !this.knownUniform(value)).length;
                if (slots + cost > this.capacity) continue;
                slots += cost;
                for (const value of chain) { wanted.add(value); order.push(value); }
            }
        }
        this.nativeLimited = detail ? detail.visibleIds.length - visible.length : 0;
        this.capacityLimited = visible.some(id => !wanted.has(id));
        this.wanted = wanted;
        this.order = order;
        for (const id of this.prepared.keys()) if (!wanted.has(id)) this.prepared.delete(id);
        for (const record of this.records()) if (!wanted.has(record.id) && record.status !== 'resident') this.masks.remove(record);
    }

    reset() {
        this.wanted = new Set();
        this.order = [];
        this.prepared.clear();
    }

    update(uploadAllowance) {
        if (this.disposed) return 0;
        const uploaded = this.upload(uploadAllowance);
        this.requestPages();
        return uploaded;
    }

    upload(allowance) {
        const pageBytes = this.masks.pageBytes, rank = new Map(this.order.map((id, index) => [id, index]));
        const ready = this.records().filter(record => record.status === 'decoded' && this.masks.records.get(record.descriptor.parentId)?.status === 'resident')
            .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
        let bytes = 0, count = 0;
        for (const record of ready) {
            if (count >= LANDSCAPE_SURFACE_DETAIL_RUNTIME.uploadsPerFrame || bytes + pageBytes > allowance) break;
            this.masks.pixels.set(record.pixels, record.slot * pageBytes);
            this.masks.texture.addLayerUpdate(record.slot);
            record.pixels = null;
            record.status = 'resident';
            record.progress = 0;
            this.budget.update(record.key, { cpuBytes: 0, kind: 'appearance-surface-detail-resident-slot' });
            bytes += pageBytes;
            count++;
        }
        if (count) {
            this.masks.texture.needsUpdate = true;
            this.masks.renderer.initTexture(this.masks.texture);
            this.masks.texture.clearLayerUpdates();
        }
        this.stats.uploads += count;
        this.stats.uploadedBytes += bytes;
        this.stats.lastUploadBytes = bytes;
        this.stats.peakUploadBytes = Math.max(this.stats.peakUploadBytes, bytes);
        return bytes;
    }

    retryAllowed(id) {
        const failure = this.failures.get(id);
        return !failure || failure.attempts < LANDSCAPE_SURFACE_DETAIL_RUNTIME.maxAttempts && performance.now() >= failure.retryAt;
    }

    freeSlot() {
        const used = new Set(this.records().map(record => record.slot));
        for (let slot = this.firstSlot; slot < this.firstSlot + this.capacity; slot++) if (!used.has(slot)) return slot;
        return -1;
    }

    // natural soil request of a page's native owners (null without a natural inference source: every owner keeps the overview infill)
    naturalRequest(descriptor) { return this.natural ? this.natural.describe(this.index.support(descriptor, this.recipe).owners.map(owner => owner.id)) : null; }

    prepare(id) {
        let prepared = this.prepared.get(id);
        if (!prepared) {
            const descriptor = this.index.descriptor(id), natural = this.naturalRequest(descriptor), inputs = this.index.inputs(descriptor, this.recipe, this.seed, natural);
            prepared = { descriptor, inputs, natural, identity: landscapeSurfaceDetailKey(inputs), proofEpoch: -1 };
            this.prepared.set(id, prepared);
        }
        return prepared;
    }

    proveUniform(descriptor) {
        const nativePages = [...this.masks.records.values()].filter(record => record.kind !== 'detail' && record.status === 'resident' && record.descriptor.level === this.maxLevel)
            .map(record => ({ descriptor: record.descriptor, pixels: this.masks.pixels, byteOffset: record.slot * this.masks.pageBytes }));
        return nativePages.length ? landscapeSurfaceDetailUniformSoil({ manifest: this.manifest, descriptor, recipe: this.recipe, nativePages }) : -1;
    }

    // requests below fully faded parents within a per-frame main-thread allowance: inherited or remembered uniform results,
    // a main-thread uniform proof, a cached page, or one worker generation per free worker
    requestPages() {
        this.budgetLimited = null;
        this.slotLimited = false;
        const started = performance.now();
        let worked = false, slotsExhausted = false;
        for (const id of this.order) {
            if (this.masks.records.has(id) || !this.retryAllowed(id)) continue;
            const parent = this.masks.records.get(this.index.parentId(id));
            if (!parent || !(parent.status === 'uniform' || parent.status === 'resident' && parent.progress === 1)) continue;
            if (parent.status === 'uniform') { this.resolveUniform(id, this.index.descriptor(id), parent.soil, 'descent', null, null); continue; }
            if (worked && performance.now() - started > LANDSCAPE_SURFACE_DETAIL_RUNTIME.requestBudgetMs) break;
            worked = true;
            const prepared = this.prepare(id), { descriptor, identity, inputs } = prepared;
            const remembered = this.cache ? this.cache.uniformSoil(identity) : -1;
            if (remembered >= 0) { this.resolveUniform(id, descriptor, remembered, 'memo', identity, inputs); continue; }
            if (prepared.proofEpoch !== this.masks.nativeEpoch) {
                prepared.proofEpoch = this.masks.nativeEpoch;
                const proven = this.proveUniform(descriptor);
                if (proven >= 0) { this.cache?.storeUniform(identity, proven); this.resolveUniform(id, descriptor, proven, 'proof', identity, inputs); continue; }
            }
            if (slotsExhausted) continue;
            const slot = this.freeSlot();
            if (slot < 0) { this.slotLimited = slotsExhausted = true; continue; }
            if (this.cache?.has(identity)) { this.admitCached(id, prepared, slot); continue; }
            if (this.jobs < LANDSCAPE_SURFACE_DETAIL_RUNTIME.workers) this.generate(id, prepared, slot);
        }
    }

    resolveUniform(id, descriptor, soil, source, identity, inputs) {
        this.masks.records.set(id, { id, kind: 'detail', key: null, lease: null, abort: null, identity, inputs, descriptor, slot: -1, progress: 1, status: 'uniform', soil, soils: [soil], sourceIds: [], metadata: null, source });
        this.stats.uniform[source]++;
    }

    createRecord(id, prepared, slot, status, source, cpuBytes, kind) {
        const key = `${this.masks.prefix}/detail/${id}/${prepared.identity}`;
        const admission = this.budget.reserve(key, { cpuBytes, gpuBytes: 0, kind });
        if (!admission.admitted) { this.budgetLimited = admission.reason; return null; }
        const record = { id, kind: 'detail', key, identity: prepared.identity, inputs: prepared.inputs, descriptor: prepared.descriptor, slot, progress: 0, status, pixels: null, soils: [], sourceIds: [], metadata: null,
            source, abort: new AbortController(), requestedAt: performance.now() };
        record.lease = this.budget.shared.acquireLease(key, { consumer: `appearance-detail/${id}`, priority: LANDSCAPE_SURFACE_DETAIL_RUNTIME.leasePriority, accuracy: 'approximate' });
        this.masks.records.set(id, record);
        return record;
    }

    admitCached(id, prepared, slot) {
        const record = this.createRecord(id, prepared, slot, 'decoded', 'cache', this.masks.pageBytes, 'appearance-surface-detail-upload-pending');
        if (!record) return;
        const cached = this.cache.take(prepared.identity);
        Object.assign(record, { pixels: cached.pixels, soils: cached.soils, sourceIds: cached.sourceIds, metadata: cached.metadata });
        this.stats.cacheHits++;
    }

    generate(id, prepared, slot) {
        const record = this.createRecord(id, prepared, slot, 'generating', 'worker', this.scratchBytes[prepared.descriptor.level], 'appearance-surface-detail-generation');
        if (!record) return;
        this.jobs++;
        this.stats.cacheMisses++;
        this.pool.request({ type: 'detail', pageId: id, ...(prepared.natural ? { natural: prepared.natural } : {}) }, { priority: LANDSCAPE_SURFACE_DETAIL_RUNTIME.generationPriority, signal: record.abort.signal }).then(result => {
            if (this.disposed || record.abort.signal.aborted || this.masks.records.get(id) !== record) return;
            if (result.metadata?.key !== record.identity) throw new Error(`[LandscapeSurfaceDetail] worker identity ${result.metadata?.key} differs from ${record.identity} for ${id}`);
            this.stats.generated++;
            this.stats.generationMs.push(result.metadata.timingsMs.total);
            if (this.stats.generationMs.length > LANDSCAPE_SURFACE_DETAIL_RUNTIME.timingSamples) this.stats.generationMs.shift();
            record.generationMs = result.metadata.timingsMs.total;
            record.roundTripMs = performance.now() - record.requestedAt;
            if (result.metadata.shortcut) {
                this.cache?.storeUniform(record.identity, result.metadata.uniformSoil);
                record.lease.release();
                this.budget.release(record.key);
                Object.assign(record, { key: null, lease: null, slot: -1, progress: 1, status: 'uniform', soil: result.metadata.uniformSoil, soils: [result.metadata.uniformSoil], source: 'generated' });
                this.stats.uniform.generated++;
                return;
            }
            if (result.pixels?.byteLength !== this.masks.pageBytes) throw new Error(`[LandscapeSurfaceDetail] page ${id} does not match the mask array layout`);
            Object.assign(record, { pixels: result.pixels, soils: result.soils, sourceIds: result.sourceIds, metadata: result.metadata, status: 'decoded' });
            this.budget.update(record.key, { cpuBytes: result.pixels.byteLength, kind: 'appearance-surface-detail-upload-pending' });
        }).catch(error => {
            if (error.name === 'AbortError' || this.disposed || this.masks.records.get(id) !== record) return;
            const previous = this.failures.get(id);
            this.failures.set(id, { id, identity: record.identity, level: record.descriptor.level, message: error.message, attempts: (previous?.attempts ?? 0) + 1,
                retryAt: performance.now() + LANDSCAPE_SURFACE_DETAIL_RUNTIME.retryDelayMs });
            this.masks.remove(record);
        }).finally(() => { this.jobs--; });
    }

    // called by LandscapeMaskPages.remove: retains resident or decoded pages in the view cache before freeing the slot
    release(record) {
        record.abort?.abort();
        const pageBytes = this.masks.pageBytes, entry = { soils: [...record.soils], sourceIds: [...record.sourceIds], metadata: record.metadata };
        if (record.key) { record.lease?.release(); this.budget.release(record.key); }
        if (this.cache && record.identity && record.status === 'resident') {
            if (this.cache.capacityBytes >= pageBytes && this.cache.store(record.identity, { ...entry, pixels: this.masks.pixels.slice(record.slot * pageBytes, (record.slot + 1) * pageBytes) })) this.stats.stored++;
        } else if (this.cache && record.identity && record.status === 'decoded' && record.pixels && this.cache.store(record.identity, { ...entry, pixels: record.pixels })) this.stats.stored++;
        record.pixels = null;
        this.masks.records.delete(record.id);
        if (record.slot >= 0) this.masks.uniforms.uMaskMeta.value[record.slot].set(-1, 0, 0, 0);
        if (record.status === 'resident') this.stats.evicted++;
    }

    best(x, z) {
        let best = null;
        for (const record of this.masks.records.values()) {
            if (record.kind !== 'detail' || record.status !== 'resident' && record.status !== 'uniform' || !inside(record.descriptor.bounds, x, z)) continue;
            if (!best || record.descriptor.level > best.descriptor.level) best = record;
        }
        return best;
    }

    // resident and uniform fine soils join the interests of their visible native ancestor; once that native page has fully faded in, each
    // visible fine leaf lends its projected density to the soils of its finest resolved page (the native page while none is resolved)
    interests(plan, interests, densityBySoil) {
        const visible = new Set(plan.visibleMaskIds), catalog = this.manifest.soil.catalog;
        for (const record of this.records()) {
            if (record.status !== 'resident' && record.status !== 'uniform') continue;
            const nativeId = record.descriptor.nativeAncestorId;
            if (!visible.has(nativeId)) continue;
            for (const index of record.soils) {
                if (!interests.has(index)) interests.set(index, new Set());
                interests.get(index).add(nativeId);
            }
        }
        for (const id of plan.detail?.visibleIds ?? []) {
            const nativeId = this.index.nativeAncestorId(id), native = this.masks.records.get(nativeId);
            if (!visible.has(nativeId) || native?.status !== 'resident' || native.progress !== 1) continue;
            let soils = native.soils;
            for (let current = id; this.index.isFine(current); current = this.index.parentId(current)) {
                const record = this.masks.records.get(current);
                if (record?.status === 'resident' || record?.status === 'uniform') { soils = record.soils; break; }
            }
            for (const index of soils) densityBySoil[catalog[index].id] = Math.max(densityBySoil[catalog[index].id] ?? 0, plan.detail.pixelsPerMeterById[id]);
        }
    }

    blocked(id) {
        for (let current = id; this.index.isFine(current); current = this.index.parentId(current)) {
            if ((this.failures.get(current)?.attempts ?? 0) >= LANDSCAPE_SURFACE_DETAIL_RUNTIME.maxAttempts) return true;
        }
        for (let descriptor = this.masks.descriptors.get(this.index.nativeAncestorId(id)); descriptor; descriptor = this.masks.descriptors.get(descriptor.parentId)) {
            if ((this.masks.failures.get(descriptor.id)?.attempts ?? 0) >= 2) return true;
        }
        return this.budgetLimited !== null;
    }

    missingWork() {
        for (const id of this.wanted) if (!this.masks.records.has(id) && !this.blocked(id)) return true;
        return false;
    }

    demandCpuBytes() {
        const levels = this.records().filter(record => record.status === 'generating').map(record => record.descriptor.level);
        for (const id of this.order) if (!this.masks.records.has(id) && !this.knownUniform(id)) levels.push(levelOf(id));
        return levels.map(level => this.scratchBytes[level]).sort((a, b) => b - a).slice(0, LANDSCAPE_SURFACE_DETAIL_RUNTIME.workers).reduce((sum, value) => sum + value, 0);
    }

    pageAt(x, z, level) {
        const count = 2 ** level, bounds = this.manifest.bounds;
        const column = Math.max(0, Math.min(count - 1, Math.floor((x - bounds.minX) / (bounds.maxX - bounds.minX) * count)));
        const row = Math.max(0, Math.min(count - 1, Math.floor((bounds.maxZ - z) / (bounds.maxZ - bounds.minZ) * count)));
        return `l${level}/c${column}/r${row}`;
    }

    /** Generator-internal inspection of the finest resident fine page (or finest-level page) at a world position. @param {number} x @param {number} z */
    async sample(x, z) {
        const bounds = this.manifest.bounds;
        if (!Number.isFinite(x) || !Number.isFinite(z) || x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) throw new Error(`[LandscapeSurfaceDetail] inspection point ${x},${z} lies outside the landscape`);
        const record = this.best(x, z), pageId = record?.id ?? this.pageAt(x, z, this.index.finestLevel), level = this.index.descriptor(pageId).level;
        const key = `${this.masks.prefix}/detail-sample/${++this.sampleSerial}`;
        const admission = this.budget.reserve(key, { cpuBytes: this.scratchBytes[level], gpuBytes: 0, kind: 'appearance-surface-detail-inspection' });
        if (!admission.admitted) throw new Error(`[LandscapeSurfaceDetail] inspection cannot fit: ${admission.reason}`);
        try {
            const natural = this.naturalRequest(this.index.descriptor(pageId));
            const result = await this.pool.request({ type: 'detail-sample', pageId, x, z, ...(natural ? { natural } : {}) }, { priority: LANDSCAPE_SURFACE_DETAIL_RUNTIME.inspectionPriority });
            return { ...result.sample, resident: record ? { id: record.id, status: record.status, identity: record.identity, source: record.source, level: record.descriptor.level } : null };
        } finally { this.budget.release(key); }
    }

    snapshot() {
        const records = this.records(), byLevel = ids => Object.fromEntries(this.levelIds.map(level => [level, ids.filter(id => levelOf(id) === level).length]));
        const resident = records.filter(record => record.status === 'resident'), uniform = records.filter(record => record.status === 'uniform');
        const pending = records.filter(record => record.status === 'generating' || record.status === 'decoded'), errors = [...this.failures.values()];
        const exhausted = errors.some(failure => failure.attempts >= LANDSCAPE_SURFACE_DETAIL_RUNTIME.maxAttempts);
        return {
            enabled: true, reason: null, recipe: { id: this.recipe.id, hash: this.recipeHash }, seed: this.seed, levels: this.levels, finestLevel: this.index.finestLevel,
            naturalLabels: { recipe: this.recipe.base.labels, policy: this.natural?.active ? this.natural.snapshot().policy : 'natural-overview-infill-v1', status: this.natural?.status ?? 'none' },
            capacity: this.capacity, firstSlot: this.firstSlot, workers: LANDSCAPE_SURFACE_DETAIL_RUNTIME.workers,
            wantedIds: [...this.wanted], residentIds: resident.map(record => record.id), uniformIds: uniform.map(record => record.id), pendingIds: pending.map(record => record.id),
            residentByLevel: byLevel(resident.map(record => record.id)), uniformByLevel: byLevel(uniform.map(record => record.id)), wantedByLevel: byLevel([...this.wanted]),
            pending: pending.length, missingWork: this.missingWork(), transitioning: resident.some(record => record.progress !== 1 || !this.wanted.has(record.id)),
            capacityLimited: this.capacityLimited, nativeLimited: this.nativeLimited, budgetLimited: this.budgetLimited, slotLimited: this.slotLimited,
            cache: { hits: this.stats.cacheHits, misses: this.stats.cacheMisses, stored: this.stats.stored, view: this.cache?.snapshot() ?? null },
            generation: { completed: this.stats.generated, active: this.jobs, totalMs: statistics(this.stats.generationMs), scratchBytesByLevel: { ...this.scratchBytes } },
            uniformResolutions: { ...this.stats.uniform },
            uploads: { count: this.stats.uploads, bytes: this.stats.uploadedBytes, lastFrameBytes: this.stats.lastUploadBytes, peakFrameBytes: this.stats.peakUploadBytes, perFrameLimit: LANDSCAPE_SURFACE_DETAIL_RUNTIME.uploadsPerFrame },
            bytes: { arrayCpuBytes: this.capacity * this.masks.pageBytes, arrayGpuBytes: this.capacity * this.masks.pageBytes, pageBytes: this.masks.pageBytes,
                pendingCpuBytes: records.reduce((sum, record) => sum + (record.pixels?.byteLength ?? 0), 0),
                generationReservedBytes: records.filter(record => record.status === 'generating').reduce((sum, record) => sum + this.scratchBytes[record.descriptor.level], 0),
                workerContextBytes: this.workerContextBytes },
            evicted: this.stats.evicted, errors,
            degradationReason: this.budgetLimited ? 'surface-detail-budget' : this.capacityLimited ? 'surface-detail-capacity' : this.nativeLimited ? 'surface-detail-native-capacity' : exhausted ? 'surface-detail-request-failed' : null,
            pages: records.map(record => ({ id: record.id, level: record.descriptor.level, status: record.status, slot: record.slot, progress: record.progress, identity: record.identity,
                source: record.source, sourceIds: [...record.sourceIds], generationMs: record.generationMs ?? null, soil: record.status === 'uniform' ? this.manifest.soil.catalog[record.soil].id : null }))
        };
    }

    dispose() {
        this.disposed = true;
        for (const record of this.records()) this.masks.remove(record);
        this.reset();
    }
}
