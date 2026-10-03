// Streams view-dependent soil masks and shared PBR pages independently from mesh tessellation.
// @ts-check
import { createLandscapeAppearancePlanner, loadLandscapeAppearanceManifest } from '../../../app/landscape/index.js';
import { LandscapeAppearanceBudget } from './LandscapeAppearanceBudget.js';
import { createLandscapeAppearanceUniforms, LANDSCAPE_MASK_SLOTS, LANDSCAPE_SOIL_SLOTS } from './LandscapeAppearanceUniforms.js';
import { LandscapeMaskPages } from './LandscapeMaskPages.js';
import { LandscapeMaterialPages } from './LandscapeMaterialPages.js';
import { LandscapeWorkerPool } from './LandscapeWorkerPool.js';
import { landscapeCameraSnapshot } from './LandscapeStreamer.js';
import { LANDSCAPE_NATURAL_PRESENTATION, landscapeNaturalPresentationBytes } from './LandscapeNaturalPresentation.js';

export class LandscapeAppearanceStreamer {
    /** @param {{loaded:any,budget:any,renderer:any,appearanceUrl?:string}} options */
    constructor({ loaded, budget, renderer, appearanceUrl }) {
        Object.assign(this, { loaded, renderer });
        this.resolveBindingFallback = appearanceUrl === undefined;
        this.appearanceUrl = this.resolveBindingFallback ? new URL('./appearance/manifest.json', loaded.manifestUrl).href : appearanceUrl;
        this.prefix = `appearance/${crypto.randomUUID()}`;
        this.budget = new LandscapeAppearanceBudget(budget, this.prefix);
        this.uniforms = createLandscapeAppearanceUniforms();
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
            const contextAdmission = this.budget.reserve(`${this.prefix}/natural-overview-worker`, { cpuBytes: root.landCover.byteLength + landscapeNaturalPresentationBytes(root.descriptor).workingBytes, gpuBytes: 0, kind: 'appearance-natural-worker-context' });
            if (!contextAdmission.admitted) throw new Error(`Natural appearance worker cannot fit: ${contextAdmission.reason}`);
            this.pool = new LandscapeWorkerPool({ size: 1, workerUrl: new URL('./LandscapeAppearanceWorker.js', import.meta.url), context: { type: 'initialize', manifest: this.loaded.manifest, manifestUrl: this.loaded.manifestUrl, appearanceUrl: this.appearanceUrl, root } });
            const capacity = this.budget.limits.gpuBytes < 8 * 1024 * 1024 ? 5 : LANDSCAPE_MASK_SLOTS;
            this.masks = new LandscapeMaskPages({ loaded: this.loaded, budget: this.budget, pool: this.pool, renderer: this.renderer, uniforms: this.uniforms, prefix: this.prefix, capacity });
            this.materials = new LandscapeMaterialPages({ appearance: this.appearance, budget: this.budget, pool: this.pool, renderer: this.renderer, uniforms: this.uniforms, prefix: this.prefix });
            await this.materials.initialize();
            if (!this.disposed) {
                this.planner = createLandscapeAppearancePlanner(this.loaded.manifest, this.appearance, { materialTiling: this.materials.tiling });
                this.initialized = true;
            }
        } catch (error) {
            if (error.name !== 'AbortError' && !this.disposed) this.errors.push({ message: error.message });
            this.releaseResources();
        } finally { if (!this.disposed && this.budget) this.budget.release(key); }
    }

    update(dt, camera, viewportHeight, uploadAllowance) {
        if (!this.initialized || this.disposed) return;
        const start = performance.now();
        const snapshot = landscapeCameraSnapshot(camera, viewportHeight);
        const plan = this.planner.plan(snapshot, { previousMaskIds: this.lastPlan?.desiredMaskIds ?? [], previousTiers: this.lastPlan?.desiredTiers ?? {} });
        this.lastPlan = plan;
        this.masks.plan(plan, snapshot);
        this.uploadedBytes = this.masks.update(dt, uploadAllowance);
        const interests = this.masks.interests(plan);
        this.materials.interest(interests.interests, interests.desiredTiers);
        this.uploadedBytes += this.materials.update(dt, uploadAllowance - this.uploadedBytes);
        this.uniforms.uAppearanceReady.value = this.masks.snapshot().ready && this.materials.ready ? 1 : 0;
        this.peakUploadedBytes = Math.max(this.peakUploadedBytes, this.uploadedBytes);
        this.frameCostMs = performance.now() - start;
    }

    sample(x, z) { return this.masks?.sample(x, z) ?? null; }

    coarsenForReload() {
        if (!this.initialized) return;
        for (const record of [...this.masks.records.values()]) if (record.id !== this.loaded.manifest.overviewId) this.masks.remove(record);
        this.masks.wanted = new Set([this.loaded.manifest.overviewId]);
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

    snapshot() {
        const masks = this.masks?.snapshot(), materials = this.materials?.snapshot(), budget = this.budget?.snapshot();
        const pending = (masks?.pending ?? 0) + (materials?.pending ?? 0);
        const errors = [...this.errors, ...(masks?.errors ?? []), ...(materials?.errors ?? [])];
        return { ready: this.uniforms.uAppearanceReady.value === 1, settled: this.initialized ? pending === 0 && !masks?.transitioning && !masks?.missingWork && materials?.settled === true : errors.length > 0,
            desiredMaskIds: this.lastPlan?.desiredMaskIds ?? [], visibleMaskIds: this.lastPlan?.visibleMaskIds ?? [], residentMaskIds: masks?.residentMaskIds ?? [], maskLods: masks?.maskLods ?? [], maskCapacity: masks?.capacity ?? 0,
            materials: materials?.materials ?? [], desiredTier: this.lastPlan?.desiredTier ?? '32', desiredMaskPixels: this.lastPlan?.desiredMaskPixels ?? 0,
            cpuBytes: budget?.cpuBytes ?? 0, gpuBytes: budget?.gpuBytes ?? 0, reserved: budget?.reserved ?? { cpuBytes: 0, gpuBytes: 0 }, peakCpuBytes: budget?.peakCpuBytes ?? 0, peakGpuBytes: budget?.peakGpuBytes ?? 0,
            pending, queueDepth: this.pool?.snapshot().queued ?? 0, canceled: this.pool?.snapshot().canceled ?? 0, loaded: (masks?.loaded ?? 0) + (materials?.loaded ?? 0), evicted: (masks?.evicted ?? 0) + (materials?.evicted ?? 0),
            uploadedBytesPerFrame: this.uploadedBytes, peakUploadedBytesPerFrame: this.peakUploadedBytes, frameCostMs: this.frameCostMs, errors,
            degradationReason: errors.length ? 'appearance-request-failed' : masks?.degradationReason ?? materials?.degradationReason ?? null,
            revision: this.appearance?.revision ?? null, sourceRevision: this.loaded.manifest.revision, materialTransition: materials?.transition ?? null,
            presentation: { policy: LANDSCAPE_NATURAL_PRESENTATION, inferredSpacingMeters: this.loaded.chunk.descriptor.sampleStride * this.loaded.manifest.grid.spacingX, sourceCoverPreserved: true, semanticSoilPreserved: true },
            materialTiling: this.materials?.tiling ?? {} };
    }

    releaseResources() {
        this.uniforms.uAppearanceReady.value = 0;
        this.materials?.dispose();
        this.masks?.dispose();
        this.pool?.dispose();
        this.materials = this.masks = this.pool = null;
        for (const [name, uniform] of Object.entries(this.uniforms)) if (/^(uSoilBase|uSoilSurface|uBlendBase|uBlendSurface|uMaskPages)/.test(name)) uniform.value = null;
        this.budget?.dispose();
        this.budget = null;
        this.initialized = false;
    }

    dispose() { this.disposed = true; this.abort.abort(); this.releaseResources(); }
}
