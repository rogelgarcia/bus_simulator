// Owns the opt-in AI 548 runtime; the legacy receiver runtime remains independently cached.
// @ts-check
import * as THREE from 'three';
import { ReceiverLightmapRuntime } from './ReceiverLightmapRuntime.js';
import { createEnhancedReceiverLoader } from './EnhancedReceiverResources.js';
import { installEnhancedReceiverBindings } from './EnhancedReceiverMaterialAdapter.js';
import { createEnhancedSourceWatch, enhancedLightingKey } from './EnhancedReceiverFreshness.js';
import { collectResolvedCityBakeRoots } from '../bake_source/BakeSourceScene.js';
import { installEnhancedReceiverRenderOptimizations } from './EnhancedReceiverRenderOptimizations.js';

export class EnhancedReceiverLightmapRuntime extends ReceiverLightmapRuntime {
    /** @param {any} engine */
    constructor(engine) {
        super(engine);
        this.indexUrl = '/assets/baked_lighting/receivers/enhanced/package_index.json';
        const load = createEnhancedReceiverLoader(engine.renderer);
        this.loadChannel = (request) => {
            // Alpha contributors were unsupported in the historical per-channel source hash.
            // New transport therefore authenticates the complete, unmodified source identity too.
            if (this.cachedIndex?.mapping.profile.transportPolicy === 'declared-alpha-coverage-v1'
                && this.source?.hashes.resolvedSource !== this.cachedIndex.sourceHash) throw new Error('complete_receiver_source_mismatch');
            return load({ ...request, resolvedSourceHash: this.source?.hashes.resolvedSource });
        };
        this.lightingKey = enhancedLightingKey;
        this.makeWatch = (references) => {
            const entries = collectResolvedCityBakeRoots(this.engine.context.city);
            return createEnhancedSourceWatch(references, { roots: entries.map((entry) => entry.root),
                ignoreVisibility: new Set(entries.filter((entry) => entry.ignoreRootVisibility).map((entry) => entry.root)) });
        };
        this.sourceOptions = { textureConcurrency: 4 };
        for (const channel of ['Direct', 'Indirect']) for (const kind of ['Scale', 'Bias']) {
            this.uniforms[`receiver${channel}${kind}`] = { value: Array.from({ length: 24 }, () => new THREE.Vector4(0, 0, 0, 0)) };
        }
        this.installBindings = (mapping, references, uniforms) => {
            this.updateDecodeUniforms();
            const binding = installEnhancedReceiverBindings(mapping, references, uniforms, uniforms.receiverAtlasMapping.value.image.data);
            this.watch?.setGeometryOverrides?.(binding.geometries);
            const restoreRender = installEnhancedReceiverRenderOptimizations(engine);
            return { ...binding, restore() { restoreRender(); binding.restore(); } };
        };
    }
    updateDecodeUniforms() {
        for (const [name, channel] of [['Direct', 'direct_receiver'], ['Indirect', 'indirect_irradiance']]) {
            const resource = this.resources[channel];
            if (!resource) continue;
            for (let i = 0; i < resource.scale.length; i++) {
                this.uniforms[`receiver${name}Scale`].value[i].copy(resource.scale[i]);
                this.uniforms[`receiver${name}Bias`].value[i].copy(resource.bias[i]);
            }
        }
    }
    async refresh() {
        const result = await super.refresh(); this.updateDecodeUniforms(); return result;
    }
    async fetchIndex(signal) {
        if (this.cachedIndex) return this.cachedIndex;
        const index = await super.fetchIndex(signal);
        signal.throwIfAborted(); this.cachedIndex = index; return index;
    }
    getDiagnostics() {
        const result = super.getDiagnostics();
        const resources = Object.values(this.resources), maps = new Set(resources.map((v) => v.mappingTexture));
        const sharedBytes = [...maps].reduce((sum, v) => sum + v.image.data.byteLength, 0);
        return { ...result, implementation: 'AI548', residentGpuBytes: resources.reduce((sum, v) => sum + v.metrics.gpuBytes, sharedBytes),
            residentCpuBytes: resources.reduce((sum, v) => sum + v.metrics.cpuBytes, sharedBytes),
            sourceValidationPolicy: 'exact_field_watch', sourceWatch: this.watch?.statistics,
            runtimeCoverage: this.bindings?.coverage ?? null,
            residencyPolicy: 'bounded_publication_cached_until_invalidation' };
    }
    release() { super.release(); this.cachedIndex = null; }
}
