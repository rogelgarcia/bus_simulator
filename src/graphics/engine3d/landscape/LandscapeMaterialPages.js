// Shares independently streamed PBR tiers across visible mask interests and retains a coarse fallback.
// @ts-check
import * as THREE from 'three';
import { applyTextureColorSpace, resolvePbrMaterialPipeline } from '../../content3d/materials/PbrTexturePipeline.js';
import { getPbrTextureCalibrationResolver } from '../../content3d/materials/PbrTextureCalibrationResolver.js';
import { landscapeTextureBytes } from './LandscapeAppearanceBudget.js';

export class LandscapeMaterialPages {
    /** @param {{appearance:any,budget:any,pool:any,renderer:any,uniforms:any,prefix:string}} options */
    constructor({ appearance, budget, pool, renderer, uniforms, prefix }) {
        Object.assign(this, { appearance, budget, pool, renderer, uniforms, prefix });
        this.materials = appearance.materials.map((definition, index) => ({ definition, index, coarse: null, current: null, desiredResolution: 32, refs: new Set() }));
        this.records = new Map();
        this.failures = new Map();
        this.loaded = 0;
        this.evicted = 0;
        this.disposed = false;
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
            this.uniforms.uSoilScale.value[index].set(effective.tileMeters, effective.normalStrength, effective.aoIntensity, effective.metalness);
            this.uniforms.uSoilAlbedo.value[index].set(effective.albedoBrightness, effective.albedoHueDegrees * Math.PI / 180, effective.albedoSaturation, effective.albedoTintStrength);
            this.uniforms.uSoilRoughness.value[index].set(remap?.min ?? 0, remap?.max ?? 1, remap?.gamma ?? 1, remap?.invertInput ? 1 : 0);
            const normalize = Number.isFinite(remap?.lowPercentile) && Number.isFinite(remap?.highPercentile);
            this.uniforms.uSoilRange.value[index].set(normalize ? definition.roughnessInputRange.min : 0, normalize ? definition.roughnessInputRange.max : 1, effective.roughness, (material.pipeline.meta?.calibration?.uvRotationDegrees ?? 0) * Math.PI / 180);
        }
        this.initialized = true;
    }

    interest(interests, desiredTiers) {
        for (const material of this.materials) {
            material.refs = interests.get(material.index) ?? new Set();
            material.desiredResolution = material.refs.size ? Number(desiredTiers[material.definition.soilId] ?? 32) : 32;
            if (material.current) this.syncLeases(material.current, material.refs);
        }
        if (this.pending && this.pending.resolution > this.pending.material.desiredResolution && this.pending.resolution !== 32) this.remove(this.pending);
    }

    syncLeases(record, refs) {
        for (const [id, lease] of record.leases) if (!refs.has(id)) { lease.release(); record.leases.delete(id); }
        for (const id of refs) if (!record.leases.has(id)) record.leases.set(id, this.budget.shared.acquireLease(record.key, { consumer: `appearance/${id}`, priority: 30, accuracy: 'approximate' }));
    }

    request(material, resolution) {
        const tier = material.definition.tiers.find(value => value.resolution === resolution);
        const id = `${material.index}/${resolution}`;
        const failure = this.failures.get(id);
        if (failure && (failure.attempts >= 2 || performance.now() < failure.retryAt)) return false;
        const bytes = resolution * resolution * 12;
        const key = `${this.prefix}/material/${material.definition.materialId}/${resolution}/${Object.values(tier.channels).map(value => value.sha256).join('/')}`;
        const admission = this.budget.reserve(key, { cpuBytes: bytes * 2, gpuBytes: landscapeTextureBytes(resolution) * 3, kind: 'appearance-material-decode' });
        if (!admission.admitted) { this.degradationReason = admission.reason; return false; }
        const record = { id, key, material, resolution, tier, bytes, status: 'loading', abort: new AbortController(), leases: new Map(), baseColor: null, surface: null, baseTexture: null, surfaceTexture: null };
        this.records.set(id, record);
        this.pending = record;
        this.pool.request({ type: 'material', tier }, { priority: resolution === 32 ? 90 : 20, signal: record.abort.signal }).then(result => {
            if (this.disposed || record.abort.signal.aborted || this.records.get(id) !== record) return;
            record.baseColor = result.baseColor;
            record.surface = result.surface;
            record.status = 'decoded';
            this.budget.update(key, { cpuBytes: bytes, kind: 'appearance-material-upload-pending' });
            this.loaded++;
        }).catch(error => {
            if (error.name === 'AbortError' || this.disposed) return;
            this.failures.set(id, { materialId: material.definition.materialId, resolution, message: error.message, attempts: (failure?.attempts ?? 0) + 1, retryAt: performance.now() + 2500 });
            this.remove(record);
        });
        return true;
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
        this.renderer.initTexture(texture);
    }

    bind(material, record) {
        this.uniforms[`uSoilBase${material.index}`].value = record.baseTexture;
        this.uniforms[`uSoilSurface${material.index}`].value = record.surfaceTexture;
        material.current = record;
        this.syncLeases(record, material.refs);
    }

    beginTransition(material, target) {
        this.transition = { material, from: material.current, target, progress: 0 };
        this.uniforms.uMaterialBlendIndex.value = material.index;
        this.uniforms.uMaterialBlend.value = 0;
        this.uniforms.uBlendBase.value = target.baseTexture;
        this.uniforms.uBlendSurface.value = target.surfaceTexture;
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
                this.bind(transition.material, transition.target);
                this.uniforms.uMaterialBlendIndex.value = -1;
                this.uniforms.uBlendBase.value = transition.target.baseTexture;
                this.uniforms.uBlendSurface.value = transition.target.surfaceTexture;
                this.transition = null;
                if (transition.from.resolution !== 32) this.remove(transition.from);
            }
            return 0;
        }
        if (this.pending) {
            const record = this.pending;
            const uploadCost = landscapeTextureBytes(record.resolution) * 3;
            if (record.status !== 'decoded' || uploadCost > uploadAllowance) return 0;
            record.baseTexture = new THREE.DataTexture(record.baseColor, record.resolution, record.resolution, THREE.RGBAFormat);
            record.surfaceTexture = new THREE.DataArrayTexture(record.surface, record.resolution, record.resolution, 2);
            this.configure(record.baseTexture, true);
            this.configure(record.surfaceTexture, false);
            record.status = 'resident';
            this.budget.update(record.key, { kind: 'appearance-material-resident' });
            this.pending = null;
            if (record.resolution === 32) { record.material.coarse = record; this.bind(record.material, record); }
            else this.beginTransition(record.material, record);
            return uploadCost;
        }
        const missingCoarse = this.materials.filter(material => !material.coarse && (this.failures.get(`${material.index}/32`)?.attempts ?? 0) < 2);
        const coarse = missingCoarse.find(material => performance.now() >= (this.failures.get(`${material.index}/32`)?.retryAt ?? 0));
        if (coarse) { this.idle = !this.request(coarse, 32); return 0; }
        if (!this.ready) { this.idle = missingCoarse.length === 0; return 0; }
        const down = this.materials.find(material => material.current.resolution > material.desiredResolution);
        if (down) { this.beginTransition(down, down.coarse); return 0; }
        const up = this.materials.filter(material => material.current.resolution < material.desiredResolution).sort((a, b) => b.refs.size - a.refs.size || a.index - b.index);
        for (const material of up) {
            const tiers = material.definition.tiers.filter(tier => tier.resolution > material.current.resolution && tier.resolution <= material.desiredResolution).reverse();
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
        return { ready: this.ready, settled: this.idle === true && !this.pending && !this.transition, pending: this.pending ? 1 : 0, transition: this.transition ? { materialId: this.transition.material.definition.materialId, from: this.transition.from.resolution, to: this.transition.target.resolution, progress: this.transition.progress } : null,
            materials: this.materials.map(material => ({ materialId: material.definition.materialId, soilId: material.definition.soilId, resolution: material.current?.resolution ?? 0, desiredResolution: material.desiredResolution, refCount: material.refs.size, tileMeters: material.pipeline?.overrides.effective.tileMeters ?? material.definition.tileMeters, calibration: material.pipeline?.diagnostics ?? null })),
            errors: [...this.failures.values()], loaded: this.loaded, evicted: this.evicted, degradationReason: this.degradationReason };
    }

    dispose() {
        this.disposed = true;
        for (const record of [...this.records.values()]) this.remove(record);
        this.transition = null;
        for (const material of this.materials) { material.current = material.coarse = null; material.refs.clear(); }
    }
}
