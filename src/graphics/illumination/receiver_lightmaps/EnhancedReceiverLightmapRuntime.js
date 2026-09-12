// Supplies the standard baked indirect path, including AI 548 coverage and optimizations.
// @ts-check
import * as THREE from 'three';
import { ReceiverLightmapRuntime } from './ReceiverLightmapRuntime.js';
import { createEnhancedReceiverLoader } from './EnhancedReceiverResources.js';
import { installEnhancedReceiverBindingsAsync } from './EnhancedReceiverMaterialAdapter.js';
import { createEnhancedSourceWatch, enhancedLightingKey } from './EnhancedReceiverFreshness.js';
import { collectResolvedCityBakeRoots } from '../bake_source/BakeSourceScene.js';
import { installEnhancedReceiverRenderOptimizations } from './EnhancedReceiverRenderOptimizations.js';
import { createResolvedIlluminationExportProfile } from '../bake_source/IlluminationExportProfile.js';
import { SUPPORTED_RECEIVER_TRANSPORTS } from '../../../app/illumination/receiver_lightmaps/ReceiverTransportPolicy.js';

export class EnhancedReceiverLightmapRuntime extends ReceiverLightmapRuntime {
    /** @param {any} engine */
    constructor(engine) {
        super(engine);
        this.indexUrl = '/assets/baked_lighting/receivers/enhanced/package_index.json';
        const load = createEnhancedReceiverLoader(engine.renderer);
        this.loadChannel = (request) => {
            // Alpha contributors were unsupported in the historical per-channel source hash.
            // New transport therefore authenticates the complete, unmodified source identity too.
            if (SUPPORTED_RECEIVER_TRANSPORTS.includes(this.cachedIndex?.mapping.profile.transportPolicy)
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
        this.installBindings = async (mapping, references, uniforms, signal) => {
            this.updateDecodeUniforms();
            const binding = await installEnhancedReceiverBindingsAsync(mapping, references, uniforms, uniforms.receiverAtlasMapping.value.image.data, signal);
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
    validateLightingProfile(index, city) {
        const live = createResolvedIlluminationExportProfile({ engine: this.engine, city });
        for (const id of ['sun.default', 'hemisphere.current', 'environment.default']) {
            const expected = index.sourceProfiles?.find(profile => profile.id === id);
            const actual = live.lightProfiles.find(profile => profile.id === id);
            if (actual.source) {
                const source = new URL(actual.source, location.href);
                // Match the source exporter's same-origin project URL identity.
                actual.source = source.origin === location.origin ? source.pathname : source.href;
            }
            if (!expected || Object.keys(actual).some(key => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]))) {
                throw new Error(`lighting_profile_mismatch:${id}`);
            }
        }
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
