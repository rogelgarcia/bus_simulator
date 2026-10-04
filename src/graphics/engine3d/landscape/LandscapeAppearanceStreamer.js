// Streams view-dependent soil masks and shared PBR pages independently from mesh tessellation.
// @ts-check
// Generated fine surface-detail pages extend the mask array when the configured levels, device slots and appearance GPU
// headroom allow; their two module workers have their contexts reserved before creation, and the recipe warp is shared
// with the terrain shader so native and coarser coverage meander exactly like the generated pages. Material clump relief
// uses the same landscape seed once the soil bindings are known; soils without relief metadata keep plain coverage.
import { createLandscapeAppearancePlanner, loadLandscapeAppearanceManifest, createLandscapeSurfaceDetailIndex, landscapeSurfaceDetailRecipeHash } from '../../../app/landscape/index.js';
import { LandscapeAppearanceBudget } from './LandscapeAppearanceBudget.js';
import { planLandscapeAppearanceDemand } from './LandscapeAppearanceDemand.js';
import { createLandscapeAppearanceUniforms, setLandscapeMaterialClumpUniforms, setLandscapeSurfaceWarpUniforms, LANDSCAPE_MASK_SLOTS, LANDSCAPE_SOIL_SLOTS } from './LandscapeAppearanceUniforms.js';
import { LANDSCAPE_MATERIAL_CLUMPS, landscapeMaterialClumpDefinition, landscapeMaterialClumpUniforms } from './LandscapeMaterialBlend.js';
import { LandscapeMaskPages } from './LandscapeMaskPages.js';
import { LandscapeMaterialPages } from './LandscapeMaterialPages.js';
import { LandscapeWorkerPool } from './LandscapeWorkerPool.js';
import { landscapeCameraSnapshot } from './LandscapeStreamer.js';
import { LANDSCAPE_NATURAL_PRESENTATION, landscapeNaturalPresentationBytes } from './LandscapeNaturalPresentation.js';
import { landscapeCoverageMaskLayout } from './LandscapeSurfaceCoverage.js';
import { LANDSCAPE_SURFACE_DETAIL_RECIPE, landscapeSurfaceDetailSeed, landscapeSurfaceWarpUniforms } from './LandscapeSurfaceDetailRecipe.js';
import { createLandscapeSurfaceWarp } from './LandscapeSurfaceNoise.js';
import { LANDSCAPE_SURFACE_DETAIL_RUNTIME, landscapeSurfaceDetailCapacity, landscapeSurfaceDetailDisabledSnapshot, landscapeSurfaceDetailWorkerBytes } from './LandscapeSurfaceDetailPages.js';

export class LandscapeAppearanceStreamer {
    /**
     * @param {{loaded:any,budget:any,renderer:any,coverageSlots:{total:number,native:number,detail:number,detailMax:number,maxFragmentUniforms:number},appearanceUrl?:string,
     *   surfaceDetail?:{levels:number},detailCache?:any}} options detailCache is the view-owned LandscapeSurfaceDetailCache (or null)
     */
    constructor({ loaded, budget, renderer, coverageSlots, appearanceUrl, surfaceDetail = { levels: 0 }, detailCache = null }) {
        Object.assign(this, { loaded, renderer });
        this.coverageSlots = coverageSlots;
        this.uniforms = createLandscapeAppearanceUniforms(coverageSlots?.total);
        this.resolveBindingFallback = appearanceUrl === undefined;
        this.appearanceUrl = this.resolveBindingFallback ? new URL('./appearance/manifest.json', loaded.manifestUrl).href : appearanceUrl;
        this.prefix = `appearance/${crypto.randomUUID()}`;
        this.recipe = LANDSCAPE_SURFACE_DETAIL_RECIPE;
        if (!Number.isSafeInteger(surfaceDetail?.levels) || surfaceDetail.levels < 0 || surfaceDetail.levels > this.recipe.levels) throw new Error(`[Landscape] surfaceDetail.levels must be an integer from 0 to ${this.recipe.levels}`);
        this.detailLevels = surfaceDetail.levels;
        this.detailCache = detailCache;
        this.recipeHash = landscapeSurfaceDetailRecipeHash(this.recipe);
        this.seed = landscapeSurfaceDetailSeed(loaded.manifest.id, this.recipe);
        this.warpUniforms = landscapeSurfaceWarpUniforms(this.recipe, this.seed);
        this.warp = createLandscapeSurfaceWarp({ seed: this.seed, wavelengths: [...this.recipe.warp.wavelengths], amplitudes: [...this.recipe.warp.amplitudes], shaping: this.recipe.warp.shaping });
        setLandscapeSurfaceWarpUniforms(this.uniforms, this.warpUniforms, true);
        this.detailReason = this.detailLevels ? null : 'surface-detail-off';
        this.budget = new LandscapeAppearanceBudget(budget, this.prefix);
        this.abort = new AbortController();
        this.errors = [];
        this.uploadedBytes = 0;
        this.peakUploadedBytes = 0;
        this.frameCostMs = 0;
    }

    async initialize() {
        const key = `${this.prefix}/manifest`;
        try {
            const admission = this.budget.reserve(key, { cpuBytes: 768 * 1024, gpuBytes: 0, kind: 'appearance-manifest-decode' });
            if (!admission.admitted) throw new Error(`Appearance manifest cannot fit: ${admission.reason}`);
            this.appearance = await loadLandscapeAppearanceManifest(this.appearanceUrl, { landscape: this.loaded.manifest, signal: this.abort.signal, resolveBindingFallback: this.resolveBindingFallback });
            if (this.disposed) return;
            if (this.appearance.materials.length !== LANDSCAPE_SOIL_SLOTS) throw new Error(`Landscape PBR adapter currently supports exactly ${LANDSCAPE_SOIL_SLOTS} soil bindings`);
            const root = { descriptor: this.loaded.chunk.descriptor, landCover: this.loaded.chunk.landCover };
            const sourceSoils = new Set(root.landCover);
            this.provisionalSoils = new Set(this.loaded.manifest.soil.landCoverMapping.filter(entry => sourceSoils.has(entry.landCoverId))
                .map(entry => this.loaded.manifest.soil.catalog.findIndex(soil => soil.id === entry.soilId)));
            const contextAdmission = this.budget.reserve(`${this.prefix}/natural-overview-worker`, { cpuBytes: root.landCover.byteLength + landscapeNaturalPresentationBytes(root.descriptor).workingBytes, gpuBytes: 0, kind: 'appearance-natural-worker-context' });
            if (!contextAdmission.admitted) throw new Error(`Natural appearance worker cannot fit: ${contextAdmission.reason}`);
            this.pool = new LandscapeWorkerPool({ size: 1, workerUrl: new URL('./LandscapeAppearanceWorker.js', import.meta.url), context: { type: 'initialize', manifest: this.loaded.manifest, manifestUrl: this.loaded.manifestUrl, appearanceUrl: this.appearanceUrl, root } });
            const capacity = this.budget.limits.gpuBytes < 8 * 1024 * 1024 ? 5 : LANDSCAPE_MASK_SLOTS;
            const detail = this.createSurfaceDetail(root, capacity);
            this.masks = new LandscapeMaskPages({ loaded: this.loaded, budget: this.budget, pool: this.pool, renderer: this.renderer, uniforms: this.uniforms, prefix: this.prefix, capacity, detail, warp: this.warp });
            if (detail && !this.masks.detail) this.releaseSurfaceDetail(this.masks.detailDegradation);
            this.materials = new LandscapeMaterialPages({ appearance: this.appearance, budget: this.budget, pool: this.pool, renderer: this.renderer, uniforms: this.uniforms, prefix: this.prefix });
            await this.materials.initialize();
            if (!this.disposed) {
                this.clumpUniforms = landscapeMaterialClumpUniforms({ seed: this.seed, soils: this.appearance.materials.map(definition => ({ soilId: definition.soilId, enabled: !!definition.height })) });
                setLandscapeMaterialClumpUniforms(this.uniforms, this.clumpUniforms, true);
                this.planner = createLandscapeAppearancePlanner(this.loaded.manifest, this.appearance, { materialTiling: this.materials.tiling, ...(this.masks.detail ? { surfaceDetail: { levels: this.detailLevels } } : {}) });
                this.initialized = true;
            }
        } catch (error) {
            if (error.name !== 'AbortError' && !this.disposed) this.errors.push({ message: error.message });
            this.releaseResources();
        } finally { if (!this.disposed && this.budget) this.budget.release(key); }
    }

    // fine slot capacity, both worker contexts and the detail pool; explicit reasons replace silent omission
    createSurfaceDetail(root, nativeCapacity) {
        const pageBytes = landscapeCoverageMaskLayout(root.descriptor).pageBytes;
        const sizing = landscapeSurfaceDetailCapacity({ levels: this.detailLevels, coverageSlots: this.coverageSlots, limits: this.budget.limits, pageBytes, nativeCapacity, materials: this.appearance.materials });
        this.detailSizing = sizing;
        if (!sizing.capacity) { this.detailReason = sizing.reason; return null; }
        const manifest = this.loaded.manifest, contextBytes = landscapeSurfaceDetailWorkerBytes(root.descriptor, (manifest.grid.chunkIntervals + 1) ** 2), keys = [];
        for (let index = 0; index < LANDSCAPE_SURFACE_DETAIL_RUNTIME.workers; index++) {
            const key = `${this.prefix}/surface-detail-worker/${index}`, admission = this.budget.reserve(key, { cpuBytes: contextBytes, gpuBytes: 0, kind: 'appearance-surface-detail-worker-context' });
            if (!admission.admitted) { for (const reserved of keys) this.budget.release(reserved); this.detailReason = `surface-detail-worker-${admission.reason}`; return null; }
            keys.push(key);
        }
        this.detailWorkerKeys = keys;
        this.detailPool = new LandscapeWorkerPool({ size: LANDSCAPE_SURFACE_DETAIL_RUNTIME.workers, workerUrl: new URL('./LandscapeSurfaceDetailWorker.js', import.meta.url),
            context: { type: 'initialize', manifest, manifestUrl: this.loaded.manifestUrl, root, recipe: this.recipe, seed: this.seed, coverPages: LANDSCAPE_SURFACE_DETAIL_RUNTIME.workerCoverPages } });
        return { capacity: sizing.capacity, pool: this.detailPool, cache: this.detailCache, index: createLandscapeSurfaceDetailIndex(manifest, { levels: this.detailLevels }),
            recipe: this.recipe, recipeHash: this.recipeHash, seed: this.seed, levels: this.detailLevels, workerContextBytes: contextBytes * LANDSCAPE_SURFACE_DETAIL_RUNTIME.workers };
    }

    releaseSurfaceDetail(reason) {
        this.detailPool?.dispose();
        this.detailPool = null;
        for (const key of this.detailWorkerKeys ?? []) this.budget.release(key);
        this.detailWorkerKeys = [];
        this.detailReason = reason;
    }

    prepare(camera, viewportHeight) {
        if (!this.initialized || this.disposed) return;
        const started = performance.now();
        const snapshot = landscapeCameraSnapshot(camera, viewportHeight), detail = this.masks.detail;
        const plan = this.planner.plan(snapshot, { previousMaskIds: this.lastPlan?.desiredMaskIds ?? [], previousTiers: this.lastPlan?.desiredTiers ?? {},
            ...(detail ? { previousDetailIds: this.lastPlan?.detail?.desiredIds ?? [] } : {}) });
        this.lastPlan = plan;
        this.masks.plan(plan, snapshot);
        const interests = this.masks.interests(plan).interests;
        const demand = planLandscapeAppearanceDemand({
            fixedCpuBytes: this.masks.pixels.byteLength + this.loaded.chunk.landCover.byteLength + landscapeNaturalPresentationBytes(this.loaded.chunk.descriptor).workingBytes
                + (detail ? detail.workerContextBytes + detail.demandCpuBytes() : 0),
            fixedGpuBytes: this.masks.pixels.byteLength, decodeBytes: this.masks.layout.decodeBytes, limits: this.budget.limits,
            materials: this.materials.materials.map(material => {
                const interested = interests.size ? interests.has(material.index) : this.provisionalSoils.has(material.index);
                return { soilId: material.definition.soilId, index: material.index, priority: interests.get(material.index)?.size ?? 0,
                    desiredResolution: interested ? Number(plan.desiredTiers[material.definition.soilId] ?? 32) : 32,
                    resolutions: material.definition.tiers.map(tier => tier.resolution) };
            })
        });
        this.budget.protectDemand(demand);
        this.prepared = true;
        this.prepareCostMs = performance.now() - started;
    }

    update(dt, camera, viewportHeight, uploadAllowance) {
        if (!this.initialized || this.disposed) return;
        if (!this.prepared) this.prepare(camera, viewportHeight);
        const start = performance.now();
        this.prepared = false;
        const plan = this.lastPlan;
        this.uploadedBytes = this.masks.update(dt, uploadAllowance);
        const interests = this.masks.interests(plan);
        this.materials.interest(interests.interests, interests.desiredTiers);
        this.uploadedBytes += this.materials.update(dt, uploadAllowance - this.uploadedBytes);
        this.uniforms.uAppearanceReady.value = this.masks.ready && this.materials.ready ? 1 : 0;
        this.peakUploadedBytes = Math.max(this.peakUploadedBytes, this.uploadedBytes);
        this.frameCostMs = performance.now() - start + this.prepareCostMs;
    }

    sample(x, z) { return this.masks?.sample(x, z) ?? null; }

    coverageSample(x, z, options) { return this.masks?.coverageSample(x, z, options) ?? null; }

    /** Generator-internal inspection through a detail worker. @param {number} x @param {number} z */
    detailSample(x, z) {
        if (!this.masks?.detail) throw new Error(`[Landscape] Generated surface detail is not active: ${this.detailReason ?? 'appearance not initialized'}`);
        return this.masks.detail.sample(x, z);
    }

    /** @param {boolean} enabled shared recipe warp of native and coarser coverage (generated pages keep their baked warp) */
    setSurfaceWarp(enabled) { setLandscapeSurfaceWarpUniforms(this.uniforms, this.warpUniforms, enabled); }

    /** @param {boolean} enabled mid-scale clump relief of material transitions (texture relief competition is unaffected) */
    setMaterialClumps(enabled) {
        if (!this.clumpUniforms) throw new Error('[Landscape] Material clump relief is configured once the appearance materials are initialized');
        setLandscapeMaterialClumpUniforms(this.uniforms, this.clumpUniforms, enabled);
    }

    clumpSnapshot() {
        return { enabled: this.uniforms.uClumpSettings.value[3] === 1, recipe: LANDSCAPE_MATERIAL_CLUMPS.id, seed: this.seed, gain: LANDSCAPE_MATERIAL_CLUMPS.gain,
            octaves: LANDSCAPE_MATERIAL_CLUMPS.octaves.map(octave => ({ frequency: octave.frequency, amplitude: octave.amplitude })), fadeWavelengths: [LANDSCAPE_MATERIAL_CLUMPS.fadeStartWavelengths, LANDSCAPE_MATERIAL_CLUMPS.fadeEndWavelengths],
            materials: (this.appearance?.materials ?? []).map(definition => ({ soilId: definition.soilId, enabled: !!definition.height && !!this.clumpUniforms, ...landscapeMaterialClumpDefinition(definition.soilId) })) };
    }

    coarsenForReload() {
        if (!this.initialized) return;
        for (const record of [...this.masks.records.values()]) if (record.id !== this.loaded.manifest.overviewId) this.masks.remove(record);
        this.masks.wanted = new Set([this.loaded.manifest.overviewId]);
        this.masks.detail?.reset();
        this.masks.updateUniforms();
        this.materials.transition = null;
        this.uniforms.uMaterialBlendIndex.value = -1;
        this.uniforms.uBlendBase.value = null;
        this.uniforms.uBlendSurface.value = null;
        for (const material of this.materials.materials) {
            if (material.current) this.materials.syncLeases(material.current, new Set());
            material.refs.clear();
            if (material.coarse) this.materials.bind(material, material.coarse);
        }
        for (const record of [...this.materials.records.values()]) if (record.resolution !== 32) this.materials.remove(record);
        this.budget.floor = { cpuBytes: 0, gpuBytes: 0 };
        this.budget.shared.update(this.budget.key, this.budget.credit(this.budget.totals()));
    }

    detailSnapshot(masks) {
        if (masks?.detail) return { ...masks.detail, sizing: this.detailSizing ?? null };
        return { ...landscapeSurfaceDetailDisabledSnapshot({ levels: this.detailLevels, reason: this.detailReason ?? 'appearance-not-initialized', recipe: this.recipe, recipeHash: this.recipeHash, seed: this.seed }),
            sizing: this.detailSizing ?? null };
    }

    snapshot() {
        const masks = this.masks?.snapshot(), materials = this.materials?.snapshot(), budget = this.budget?.snapshot(), detail = this.detailSnapshot(masks);
        const pending = (masks?.pending ?? 0) + (materials?.pending ?? 0) + detail.pending;
        const errors = [...this.errors, ...(masks?.errors ?? []), ...(materials?.errors ?? [])];
        return { ready: this.uniforms.uAppearanceReady.value === 1,
            settled: this.initialized ? pending === 0 && !masks?.transitioning && !masks?.missingWork && materials?.settled === true && !detail.missingWork && !detail.transitioning : errors.length > 0,
            desiredMaskIds: this.lastPlan?.desiredMaskIds ?? [], visibleMaskIds: this.lastPlan?.visibleMaskIds ?? [], residentMaskIds: masks?.residentMaskIds ?? [], maskLods: masks?.maskLods ?? [], maskCapacity: masks?.capacity ?? 0,
            materials: materials?.materials ?? [], desiredTier: this.lastPlan?.desiredTier ?? '32', desiredMaskPixels: this.lastPlan?.desiredMaskPixels ?? 0,
            cpuBytes: budget?.cpuBytes ?? 0, gpuBytes: budget?.gpuBytes ?? 0, reserved: budget?.reserved ?? { cpuBytes: 0, gpuBytes: 0 }, peakCpuBytes: budget?.peakCpuBytes ?? 0, peakGpuBytes: budget?.peakGpuBytes ?? 0,
            demandReservation: budget?.demand ?? null,
            pending, queueDepth: this.pool?.snapshot().queued ?? 0, canceled: this.pool?.snapshot().canceled ?? 0, loaded: (masks?.loaded ?? 0) + (materials?.loaded ?? 0), evicted: (masks?.evicted ?? 0) + (materials?.evicted ?? 0),
            uploadedBytesPerFrame: this.uploadedBytes, peakUploadedBytesPerFrame: this.peakUploadedBytes, frameCostMs: this.frameCostMs, errors,
            degradationReason: errors.length ? 'appearance-request-failed' : masks?.degradationReason ?? materials?.degradationReason ?? detail.degradationReason ?? null,
            revision: this.appearance?.revision ?? null, sourceRevision: this.loaded.manifest.revision, materialTransition: materials?.transition ?? null,
            presentation: { policy: LANDSCAPE_NATURAL_PRESENTATION, inferredSpacingMeters: this.loaded.chunk.descriptor.sampleStride * this.loaded.manifest.grid.spacingX, sourceCoverPreserved: true, semanticSoilPreserved: true },
            coverage: masks?.coverage ?? null,
            coverageSlots: { ...this.coverageSlots },
            detail: { ...detail, workerPool: this.detailPool?.snapshot() ?? null },
            surfaceWarp: { enabled: this.uniforms.uSurfaceWarpEnabled.value === 1, recipe: this.recipe.id, seed: this.seed, wavelengths: [...this.recipe.warp.wavelengths],
                amplitudes: [...this.recipe.warp.amplitudes], maxDisplacementMeters: this.warpUniforms.maxDisplacementMeters, appliesTo: 'native-and-coarser-coverage; generated pages carry it baked' },
            materialBlend: materials?.blend ?? null,
            materialClumps: this.clumpSnapshot(),
            materialTiling: this.materials?.tiling ?? {} };
    }

    releaseResources() {
        this.uniforms.uAppearanceReady.value = 0;
        this.materials?.dispose();
        this.masks?.dispose();
        this.pool?.dispose();
        this.detailPool?.dispose();
        this.materials = this.masks = this.pool = this.detailPool = null;
        for (const [name, uniform] of Object.entries(this.uniforms)) if (/^(uSoilBase|uSoilSurface|uBlendBase|uBlendSurface|uMaskPages)/.test(name)) uniform.value = null;
        this.budget?.dispose();
        this.budget = null;
        this.initialized = false;
    }

    dispose() { this.disposed = true; this.abort.abort(); this.releaseResources(); }
}
