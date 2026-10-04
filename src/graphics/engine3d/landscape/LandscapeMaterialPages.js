// Shares independently streamed PBR tiers across visible mask interests, retains a coarse fallback and uploads large tiers in steps.
// @ts-check
// A tier record holds one sRGB base-color texture and one linear surface array: normals, ORM and, when the companion multiscale
// sidecar pairs it, the micro-detail layer at the same resolution, so micro detail needs no extra sampler. Uploads proceed one map at a
// time (the base texture or one array layer, each with its mips) while the remaining per-frame allowance fits it, so a 1024-pixel tier
// with micro spans four frames under the shared 8 MiB cap. Only a completely uploaded tier joins the 0.3 s old/new transition, so a
// split upload never shows partial data. Coarsening to a tier above the fallback loads that tier first and blends to it directly
// instead of passing through the 32-pixel fallback. A failed multiscale page disables that material's multiscale tiers explicitly and
// streaming resumes with its schema-1 pages; micro detail shows only while the bound and any arriving tier both carry the layer.
// Each material streams toward its budget-fitted tier (LandscapeAppearanceDemand), never above its own texel demand: materials above
// their fitted tier coarsen first and free room, then materials below it upgrade, the closest first.
import * as THREE from 'three';
import { applyTextureColorSpace, resolvePbrMaterialPipeline } from '../../content3d/materials/PbrTexturePipeline.js';
import { getPbrTextureCalibrationResolver } from '../../content3d/materials/PbrTextureCalibrationResolver.js';
import { landscapeTextureBytes } from './LandscapeAppearanceBudget.js';
import { landscapeMaterialTierBytes } from './LandscapeAppearanceDemand.js';
import { createLandscapeMaterialTiling, LANDSCAPE_MATERIAL_TILING } from './LandscapeMaterialTiling.js';
import { LANDSCAPE_MATERIAL_BLEND } from './LandscapeMaterialBlend.js';
import { landscapeMicroUniformValues } from './LandscapeMicroDetail.js';
import { landscapeMultiscaleFallback, landscapeSchemaMaterialTiers } from './LandscapeMultiscaleTiers.js';

export class LandscapeMaterialPages {
    /**
     * @param {{appearance:any,multiscale?:any,budget:any,pool:any,renderer:any,uniforms:any,prefix:string}} options multiscale is the
     *   resolveLandscapeMultiscaleTiers result; without it every material keeps its schema-1 tiers
     */
    constructor({ appearance, multiscale = landscapeMultiscaleFallback(appearance, 'absent', 'multiscale-not-requested'), budget, pool, renderer, uniforms, prefix }) {
        Object.assign(this, { appearance, multiscale, budget, pool, renderer, uniforms, prefix });
        this.materials = appearance.materials.map((definition, index) => {
            const resolved = multiscale.materials[index];
            if (resolved?.soilId !== definition.soilId) throw new Error(`[Landscape] Multiscale tiers do not follow appearance soil ${definition.soilId}`);
            return { definition, index, coarse: null, current: null, desiredResolution: 32, fittedResolution: 32, priority: 0, refs: new Set(), tiers: resolved.tiers, maps: resolved.maps,
                micro: resolved.micro, multiscaleFailure: null };
        });
        this.limitation = null;
        this.records = new Map();
        this.failures = new Map();
        this.multiscaleFailures = [];
        this.loaded = 0;
        this.evicted = 0;
        this.disposed = false;
        this.tiling = {};
        this.microEnabled = true;
        this.uploads = { maps: 0, bytes: 0, tiers: 0, splitTiers: 0, maxFramesPerTier: 0, lastTier: null };
    }

    async initialize() {
        const resolver = getPbrTextureCalibrationResolver();
        await resolver.preloadOverrides(this.materials.map(value => value.definition.materialId));
        if (this.disposed) return;
        for (const material of this.materials) {
            const { definition, index } = material;
            material.pipeline = resolvePbrMaterialPipeline(definition.materialId, { calibrationOverrides: resolver.getCachedOverrides(definition.materialId), calibrationResolver: resolver });
            const effective = material.pipeline.overrides.effective;
            const remap = effective.roughnessRemap;
            this.tiling[definition.soilId] = createLandscapeMaterialTiling(effective.tileMeters, { microTileMeters: material.micro?.tileMeters ?? null });
            this.uniforms.uSoilScale.value[index].set(effective.tileMeters, effective.normalStrength, effective.aoIntensity, effective.metalness);
            this.uniforms.uSoilState.value[index].set(definition.height ? 1 : 0, 32, 0, 0);
            this.uniforms.uSoilAlbedo.value[index].set(effective.albedoBrightness, effective.albedoHueDegrees * Math.PI / 180, effective.albedoSaturation, effective.albedoTintStrength);
            this.uniforms.uSoilRoughness.value[index].set(remap?.min ?? 0, remap?.max ?? 1, remap?.gamma ?? 1, remap?.invertInput ? 1 : 0);
            const normalize = Number.isFinite(remap?.lowPercentile) && Number.isFinite(remap?.highPercentile);
            this.uniforms.uSoilRange.value[index].set(normalize ? definition.roughnessInputRange.min : 0, normalize ? definition.roughnessInputRange.max : 1, effective.roughness, (material.pipeline.meta?.calibration?.uvRotationDegrees ?? 0) * Math.PI / 180);
        }
        this.uniforms.uSurfaceBlendEnabled.value = this.materials.some(material => !!material.definition.height) ? 1 : 0;
        this.applyMicroUniforms();
        this.initialized = true;
    }

    /** Tier resolutions each soil can stream now, for the view planner and demand. */
    materialTiers() { return Object.fromEntries(this.materials.map(material => [material.definition.soilId, material.tiers.map(tier => tier.resolution)])); }

    /** Tiers a material can still request: its resolved tiers less those whose bounded retries are exhausted. @param {any} material */
    streamableResolutions(material) {
        return material.tiers.map(tier => tier.resolution).filter(resolution => (this.failures.get(`${material.index}/${resolution}`)?.attempts ?? 0) < 2);
    }

    /** Tier a material holds or is acquiring: its bound tier, an arriving transition target or its pending request. @param {any} material */
    heldResolution(material) {
        return Math.max(material.current?.resolution ?? 0, this.transition?.material === material ? this.transition.target.resolution : 0, this.pending?.material === material ? this.pending.resolution : 0);
    }

    // micro detail shows only while the bound tier and any arriving tier of the soil both carry the paired layer
    applyMicroUniforms() {
        for (const material of this.materials) {
            const tiling = this.uniforms.uSoilTiling.value[material.index], state = this.uniforms.uSoilState.value[material.index];
            const arriving = this.transition?.material === material ? this.transition.target : null;
            const active = this.microEnabled && !!material.micro && !!material.current?.micro && (!arriving || arriving.micro);
            const values = active ? landscapeMicroUniformValues(material.definition.soilId, material.micro) : null;
            tiling.set(this.tiling[material.definition.soilId]?.tileMeters ?? material.definition.tileMeters, values?.tileMeters ?? 0, values?.normalStrength ?? 0, values?.luminanceScale ?? 0);
            state.z = values?.heightStrength ?? 0;
        }
    }

    /** @param {boolean} enabled paired micro detail of every material that has it */
    setMicroEnabled(enabled) {
        if (typeof enabled !== 'boolean') throw new Error('[Landscape] Micro detail enablement must be boolean');
        this.microEnabled = enabled;
        this.applyMicroUniforms();
    }

    /**
     * @param {Map<number,Set<string>>} interests visible mask IDs referencing each soil index @param {Object<string,string>} desiredTiers each material's own texel demand
     * @param {{fittedTiers?:Object<string,string>,priorities?:Object<string,number>,limitation?:string|null}} [composition] the budget-fitted tiers that cap
     *   streaming, the densities ordering upgrades and the ceiling that kept a fitted tier below its demand; isolated callers without a composition stream
     *   the desired tiers directly
     */
    interest(interests, desiredTiers, { fittedTiers = desiredTiers, priorities = {}, limitation = null } = {}) {
        for (const material of this.materials) {
            const soilId = material.definition.soilId;
            material.refs = interests.get(material.index) ?? new Set();
            material.desiredResolution = material.refs.size ? Number(desiredTiers[soilId] ?? 32) : 32;
            material.fittedResolution = Math.min(material.desiredResolution, Number(fittedTiers[soilId] ?? 32));
            material.priority = material.refs.size ? priorities[soilId] ?? 0 : 0;
            if (material.current) this.syncLeases(material.current, material.refs);
        }
        this.limitation = limitation;
        const pending = this.pending, current = pending?.material.current;
        if (pending && pending.resolution !== 32 && (pending.resolution > pending.material.fittedResolution
            || current && pending.resolution < current.resolution && pending.material.fittedResolution >= current.resolution)) this.remove(pending);
    }

    syncLeases(record, refs) {
        for (const [id, lease] of record.leases) if (!refs.has(id)) { lease.release(); record.leases.delete(id); }
        for (const id of refs) if (!record.leases.has(id)) record.leases.set(id, this.budget.shared.acquireLease(record.key, { consumer: `appearance/${id}`, priority: 30, accuracy: 'approximate' }));
    }

    request(material, resolution) {
        const tier = material.tiers.find(value => value.resolution === resolution);
        if (!tier) return false;
        const id = `${material.index}/${resolution}`;
        const failure = this.failures.get(id);
        if (failure && (failure.attempts >= 2 || performance.now() < failure.retryAt)) return false;
        const maps = tier.pages.length, { rawBytes, gpuBytes } = landscapeMaterialTierBytes(resolution, maps);
        const key = `${this.prefix}/material/${material.definition.soilId}/${material.definition.materialId}/${resolution}/${tier.pages.map(value => value.page.sha256).join('/')}`;
        const admission = this.budget.reserve(key, { cpuBytes: rawBytes * 2, gpuBytes, kind: 'appearance-material-decode' });
        if (!admission.admitted) { this.degradationReason = admission.reason; return false; }
        const record = { id, key, material, resolution, tier, maps, micro: tier.pages.some(value => value.role === 'micro'), multiscale: tier.pages.some(value => value.source === 'multiscale'),
            bytes: rawBytes, status: 'loading', uploadedMaps: 0, uploadFrames: 0, abort: new AbortController(), leases: new Map(), baseColor: null, surface: null, baseTexture: null, surfaceTexture: null };
        this.records.set(id, record);
        this.pending = record;
        this.pool.request({ type: 'material', resolution, pages: tier.pages }, { priority: resolution === 32 ? 90 : 20, signal: record.abort.signal }).then(result => {
            if (this.disposed || record.abort.signal.aborted || this.records.get(id) !== record) return;
            record.baseColor = result.baseColor;
            record.surface = result.surface;
            record.status = 'decoded';
            this.budget.update(key, { cpuBytes: rawBytes, kind: 'appearance-material-upload-pending' });
            this.loaded++;
        }).catch(error => {
            if (error.name === 'AbortError' || this.disposed) return;
            if (record.multiscale) this.disableMultiscale(material, error.message);
            else this.failures.set(id, { materialId: material.definition.materialId, resolution, message: error.message, attempts: (failure?.attempts ?? 0) + 1, retryAt: performance.now() + 2500 });
            this.remove(record);
        });
        return true;
    }

    // a failed companion page returns the material to its schema-1 tiers; resident records stay valid and keep serving until replaced
    disableMultiscale(material, message) {
        if (material.multiscaleFailure) return;
        material.multiscaleFailure = message;
        material.tiers = landscapeSchemaMaterialTiers(material.definition);
        material.maps = 3;
        material.micro = null;
        for (const id of [...this.failures.keys()]) if (id.startsWith(`${material.index}/`)) this.failures.delete(id);
        this.multiscaleFailures.push({ soilId: material.definition.soilId, materialId: material.definition.materialId, message });
        this.applyMicroUniforms();
    }

    configure(texture, srgb) {
        applyTextureColorSpace(texture, { srgb });
        texture.flipY = false;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        texture.needsUpdate = true;
    }

    // one map per step: the base texture, then each surface array layer (the first array upload allocates every layer and mip level)
    uploadMap(record) {
        const resolution = record.resolution;
        if (record.uploadedMaps === 0) {
            record.baseTexture = new THREE.DataTexture(record.baseColor, resolution, resolution, THREE.RGBAFormat);
            this.configure(record.baseTexture, true);
            this.renderer.initTexture(record.baseTexture);
        } else {
            if (!record.surfaceTexture) {
                record.surfaceTexture = new THREE.DataArrayTexture(record.surface, resolution, resolution, record.maps - 1);
                this.configure(record.surfaceTexture, false);
            }
            record.surfaceTexture.addLayerUpdate(record.uploadedMaps - 1);
            record.surfaceTexture.needsUpdate = true;
            this.renderer.initTexture(record.surfaceTexture);
            record.surfaceTexture.clearLayerUpdates();
        }
        record.uploadedMaps++;
    }

    bind(material, record) {
        this.uniforms[`uSoilBase${material.index}`].value = record.baseTexture;
        this.uniforms[`uSoilSurface${material.index}`].value = record.surfaceTexture;
        this.uniforms.uSoilState.value[material.index].y = record.resolution;
        material.current = record;
        this.syncLeases(record, material.refs);
        this.applyMicroUniforms();
    }

    beginTransition(material, target) {
        this.transition = { material, from: material.current, target, progress: 0 };
        this.uniforms.uMaterialBlendIndex.value = material.index;
        this.uniforms.uMaterialBlend.value = 0;
        this.uniforms.uBlendBase.value = target.baseTexture;
        this.uniforms.uBlendSurface.value = target.surfaceTexture;
        this.uniforms.uBlendResolution.value = target.resolution;
        this.applyMicroUniforms();
    }

    update(dt, uploadAllowance) {
        if (!this.initialized || this.disposed) return 0;
        this.idle = false;
        this.degradationReason = null;
        if (this.transition) {
            const transition = this.transition;
            transition.progress = Math.min(1, transition.progress + Math.min(dt, .1) / .3);
            this.uniforms.uMaterialBlend.value = transition.progress;
            if (transition.progress === 1) {
                this.syncLeases(transition.from, new Set());
                this.transition = null;
                this.bind(transition.material, transition.target);
                this.uniforms.uMaterialBlendIndex.value = -1;
                this.uniforms.uBlendBase.value = transition.target.baseTexture;
                this.uniforms.uBlendSurface.value = transition.target.surfaceTexture;
                if (transition.from.resolution !== 32) this.remove(transition.from);
            }
            return 0;
        }
        if (this.pending) {
            const record = this.pending;
            if (record.status !== 'decoded' && record.status !== 'uploading') return 0;
            const mapBytes = landscapeTextureBytes(record.resolution);
            let uploaded = 0;
            while (record.uploadedMaps < record.maps && uploaded + mapBytes <= uploadAllowance) { this.uploadMap(record); uploaded += mapBytes; }
            if (uploaded) { record.uploadFrames++; this.uploads.maps += uploaded / mapBytes; this.uploads.bytes += uploaded; }
            if (record.uploadedMaps < record.maps) {
                if (uploaded && record.status !== 'uploading') { record.status = 'uploading'; this.budget.update(record.key, { kind: 'appearance-material-uploading' }); }
                return uploaded;
            }
            record.status = 'resident';
            this.budget.update(record.key, { kind: 'appearance-material-resident' });
            this.pending = null;
            this.uploads.tiers++;
            if (record.uploadFrames > 1) this.uploads.splitTiers++;
            this.uploads.maxFramesPerTier = Math.max(this.uploads.maxFramesPerTier, record.uploadFrames);
            this.uploads.lastTier = { soilId: record.material.definition.soilId, resolution: record.resolution, maps: record.maps, frames: record.uploadFrames };
            if (record.resolution === 32 && !record.material.coarse) { record.material.coarse = record; this.bind(record.material, record); }
            else this.beginTransition(record.material, record);
            return uploaded;
        }
        const missingCoarse = this.materials.filter(material => !material.coarse && (this.failures.get(`${material.index}/32`)?.attempts ?? 0) < 2);
        const coarse = missingCoarse.find(material => performance.now() >= (this.failures.get(`${material.index}/32`)?.retryAt ?? 0));
        if (coarse) { this.idle = !this.request(coarse, 32); return 0; }
        if (!this.ready) { this.idle = missingCoarse.length === 0; return 0; }
        const down = this.materials.find(material => material.current.resolution > material.fittedResolution);
        if (down) {
            const target = down.tiers.filter(tier => tier.resolution > 32 && tier.resolution <= down.fittedResolution).at(-1);
            if (!target || !this.request(down, target.resolution)) this.beginTransition(down, down.coarse);
            return 0;
        }
        const up = this.materials.filter(material => material.current.resolution < material.fittedResolution).sort((a, b) => b.priority - a.priority || b.refs.size - a.refs.size || a.index - b.index);
        for (const material of up) {
            const tiers = material.tiers.filter(tier => tier.resolution > material.current.resolution && tier.resolution <= material.fittedResolution).reverse();
            for (const tier of tiers) if (this.request(material, tier.resolution)) return 0;
        }
        this.idle = true;
        return 0;
    }

    get ready() { return this.materials.every(material => !!material.coarse); }

    remove(record) {
        if (this.records.get(record.id) !== record) return;
        record.abort.abort();
        this.syncLeases(record, new Set());
        record.baseTexture?.dispose();
        record.surfaceTexture?.dispose();
        if (record.baseTexture) record.baseTexture.image.data = null;
        if (record.surfaceTexture) record.surfaceTexture.image.data = null;
        record.baseTexture = record.surfaceTexture = record.baseColor = record.surface = null;
        this.records.delete(record.id);
        this.budget.release(record.key);
        if (this.pending === record) this.pending = null;
        this.evicted++;
    }

    snapshot() {
        const pending = this.pending;
        return { ready: this.ready, settled: this.idle === true && !this.pending && !this.transition, pending: pending ? 1 : 0,
            pendingTier: pending ? { soilId: pending.material.definition.soilId, resolution: pending.resolution, status: pending.status, maps: pending.maps, uploadedMaps: pending.uploadedMaps, micro: pending.micro } : null,
            transition: this.transition ? { materialId: this.transition.material.definition.materialId, from: this.transition.from.resolution, to: this.transition.target.resolution, progress: this.transition.progress } : null,
            blend: { enabled: this.uniforms.uSurfaceBlendEnabled.value === 1, recipe: LANDSCAPE_MATERIAL_BLEND },
            materials: this.materials.map(material => ({ materialId: material.definition.materialId, soilId: material.definition.soilId, resolution: material.current?.resolution ?? 0, desiredResolution: material.desiredResolution,
                fittedResolution: material.fittedResolution, density: material.priority,
                refCount: material.refs.size, tileMeters: material.pipeline?.overrides.effective.tileMeters ?? material.definition.tileMeters, calibration: material.pipeline?.diagnostics ?? null, height: material.definition.height ?? null,
                tiers: material.tiers.map(tier => tier.resolution), maps: material.current?.maps ?? material.maps, micro: material.micro ? { ...material.micro, resident: !!material.current?.micro, shown: this.uniforms.uSoilTiling.value[material.index].y > 0 } : null,
                multiscaleFailure: material.multiscaleFailure })),
            micro: { enabled: this.microEnabled }, uploads: { ...this.uploads, lastTier: this.uploads.lastTier ? { ...this.uploads.lastTier } : null }, multiscaleFailures: [...this.multiscaleFailures],
            tiling: LANDSCAPE_MATERIAL_TILING.id, errors: [...this.failures.values()], loaded: this.loaded, evicted: this.evicted, degradationReason: this.degradationReason ?? this.limitation };
    }

    dispose() {
        this.disposed = true;
        for (const record of [...this.records.values()]) this.remove(record);
        this.transition = null;
        for (const material of this.materials) { material.current = material.coarse = null; material.refs.clear(); }
    }
}
