// Authenticates one bounded static field and applies it only to registered vehicle variants.
// @ts-check
import * as THREE from 'three';
import { validateDiffuseProbeField } from '../../../app/illumination/diffuse_probes/DiffuseProbeField.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { enhancedLightingKey } from '../receiver_lightmaps/EnhancedReceiverFreshness.js';
import { BusMaterialVariants } from './BusMaterialVariants.js';
import { prepareBusMaterials } from './BusMaterialPreparation.js';

const INDEX = '/assets/baked_lighting/diffuse_probes/index.json';
async function fetchChecked(url, signal) {
    const response = await fetch(url, { signal, cache: 'no-cache' });
    if (!response.ok) throw new Error('bus_probes_unavailable:' + response.status);
    return response;
}

export class BusDiffuseProbeRuntime {
    /** @param {any} engine @param {any} receivers */
    constructor(engine, receivers) {
        this.engine = engine; this.receivers = receivers;
        this.variants = new BusMaterialVariants(engine); this.hooks = new Map();
        this.uniforms = { busProbeEnabled: { value: 0 } };
        this.state = 'off'; this.active = false; this.ready = false;
        this.onContextLost = () => this.invalidate();
        this.engine.renderer?.domElement?.addEventListener('webglcontextlost', this.onContextLost);
    }
    /** Cancel pending work and remove contribution without discarding the bounded cache. */
    suspend(reason = null) {
        this.cancelStaging();
        this.abort?.abort(); this.abort = null;
        this.active = false; this.ready = false; this.uniforms.busProbeEnabled.value = 0;
        if (reason && this.settings?.enabled && this.settings.probes) { this.state = 'disabled'; this.reason = reason; }
        else if (this.state === 'applied' || this.state === 'ready') this.state = 'waiting';
    }
    /** @param {{enabled:boolean, materials:boolean, probes:boolean}} settings */
    configure(settings) {
        this.settings = settings; this.variants.configure(settings);
        this.state = settings.enabled && settings.probes ? 'waiting' : 'off';
        this.reason = null;
    }
    async prepare({ materials = this.variants.materials, background = false, compile = true } = {}) {
        const abort = new AbortController(); this.abort = abort;
        const signal = abort.signal, city = this.engine.context?.city;
        if (!city) throw new Error('bus_probes_no_gameplay_city');
        const report = state => { if (background) this.transitionState = state; else this.state = state; };
        report('loading');
        try {
            if (!materials.size) throw new Error('bus_probes_unsupported_materials_enable_enhanced_materials');
            const index = this.index ?? await (await fetchChecked(INDEX, signal)).json();
            validateDiffuseProbeField(index);
            if (index.count > this.engine.renderer.capabilities.maxTextureSize) throw new Error('bus_probes_unsupported_texture_size');
            if (index.cityId !== city.cityId) throw new Error('bus_probes_city_mismatch');
            this.receivers.validateLightingProfile(index, city);
            report('validating');
            let source = this.receivers.source;
            if (!source || this.receivers.city !== city || this.receivers.key !== enhancedLightingKey(this.engine, city)) {
                const exported = await this.receivers.getSource(city, enhancedLightingKey(this.engine, city));
                signal.throwIfAborted();
                source = { hashes: exported.sourceIdentity, references: exported.liveObjectReferences };
            }
            if (source.hashes.resolvedSource !== index.sourceHash) throw new Error('bus_probes_source_mismatch');
            this.watch = this.receivers.watch ?? this.receivers.makeWatch(source.references);
            if (!this.texture) {
                const url = new URL(index.url, new URL(INDEX, location.href));
                if (url.origin !== location.origin || !url.pathname.startsWith('/assets/baked_lighting/diffuse_probes/')) throw new Error('bus_probes_invalid_url');
                const bytes = await (await fetchChecked(url, signal)).arrayBuffer();
                const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
                if (hash !== index.sha256) throw new Error('bus_probes_hash_mismatch');
                const data = new Float32Array(bytes); validateDiffuseProbeField(index, data); signal.throwIfAborted();
                this.texture = new THREE.DataTexture(data, index.width, index.count, THREE.RGBAFormat, THREE.FloatType);
                this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
                this.texture.generateMipmaps = false; this.texture.colorSpace = THREE.NoColorSpace; this.texture.needsUpdate = true;
                this.index = index;
            }
            const { busProbeShaders: sourceShader } = await import('../../shaders/materials/BusDiffuseProbeShaderLoader.js');
            signal.throwIfAborted();
            const regions = Array.from({ length: 4 }, (_, i) => index.regions[i] ?? { origin: [0,0,0], spacing: [1,1,1], size: [2,2,2], offset: 0 });
            const values = { busProbeField: { value: this.texture }, busProbeRegionCount: { value: index.regions.length },
                busProbeOrigins: { value: regions.map(r => new THREE.Vector3(...r.origin)) },
                busProbeSpacings: { value: regions.map(r => new THREE.Vector3(...r.spacing)) },
                busProbeSizes: { value: new Int32Array(regions.flatMap(r => [...r.size, r.offset])) } };
            for (const [key, uniform] of Object.entries(values)) {
                if (this.uniforms[key]) this.uniforms[key].value = uniform.value;
                else this.uniforms[key] = uniform;
            }
            for (const material of materials) {
                if (this.hooks.has(material)) continue;
                const hook = registerMaterialShaderHook(material, {
                id: 'illumination.bus_diffuse_probes', priority: 310, variantKey: sourceShader.variantKey,
                uniforms: this.uniforms,
                apply: shader => {
                    if (THREE.REVISION !== '183' || !shader.fragmentShader.includes('#include <lights_fragment_end>')) throw new Error('Unsupported bus probe shader contract');
                    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + sourceShader.vertex)
                        .replace('#include <project_vertex>', '#include <project_vertex>\n' + sourceShader.vertexApply);
                    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + sourceShader.fragment)
                        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + sourceShader.fragmentApply);
                    Object.assign(shader.uniforms, this.uniforms);
                }
                });
                const dispose = () => { hook.remove(); this.hooks.delete(material); material.removeEventListener('dispose', dispose); };
                this.hooks.set(material, { remove: dispose }); material.addEventListener('dispose', dispose);
            }
            if (compile) await this.engine.renderer.compileAsync(this.engine.scene, this.engine.camera);
            signal.throwIfAborted();
            if (!background) { this.ready = true; this.state = 'ready'; this.reason = null; }
        } catch (error) {
            if (!signal.aborted && !background) { this.state = 'disabled'; this.reason = error.message; }
            throw error;
        }
    }

    /** Build and prewarm a replacement while the current variant remains visible. */
    async stage(settings, useProbes, shadows) {
        const preparation = new AbortController(); this.preparation = preparation;
        const candidate = this.variants.stage(settings);
        this.transitionState = 'preparing';
        const shadowStage = shadows.stageBusMaterials(candidate);
        this.stagingCleanup = shadowStage.dispose;
        try {
            if (useProbes) await this.prepare({ materials: candidate.materials, background: true, compile: false });
            preparation.signal.throwIfAborted();
            const renderTarget = this.engine.prepareSceneMaterialReplacement?.(candidate.assignments);
            await prepareBusMaterials(this.engine.renderer, candidate.scene, this.engine.camera, this.engine.scene,
                {signal:preparation.signal, renderTarget});
            return { dispose: shadowStage.dispose, commit: () => {
                shadowStage.commit(); this.settings = settings;
                this.ready = useProbes; this.state = useProbes ? 'ready' : 'off'; this.reason = null;
                this.active = false; this.uniforms.busProbeEnabled.value = 0;
            } };
        } catch (error) { shadowStage.dispose(); throw error; }
    }

    cancelStaging() {
        this.preparation?.abort(); this.preparation = null;
        this.abort?.abort(); this.stagingCleanup?.(); this.stagingCleanup = null;
    }
    validateFrame() {
        // The coordinator already validates an active receiver watch once per frame.
        return !this.ready || !this.watch || (this.watch === this.receivers.watch && this.receivers.settings.indirect) || this.watch();
    }
    frameBegin(allow) {
        this.active = allow && this.ready;
        this.uniforms.busProbeEnabled.value = this.active ? 1 : 0;
        if (this.active) this.state = 'applied';
        else if (this.ready) this.state = 'ready';
    }
    getDiagnostics() {
        return { state: this.state, reason: this.reason ?? null, active: this.active, ready: this.ready,
            transitionState: this.transitionState ?? null, transitionError: this.transitionError ?? null,
            ...this.variants.getDiagnostics(), sourceHash: this.index?.sourceHash ?? null, fieldHash: this.index?.sha256 ?? null,
            probeCount: this.index?.count ?? 0, regions: this.index?.regions ?? [],
            residentCpuBytes: this.texture?.image.data.byteLength ?? 0, residentGpuBytes: this.texture?.image.data.byteLength ?? 0,
            representation: 'six_direction_irradiance_with_visibility', coverageFallback: 'smooth_live_diffuse',
            directSun: 'live', specular: 'live_ibl', residency: 'one_verified_field_until_reload_or_disposal' };
    }
    invalidate() { this.suspend(); this.texture?.dispose(); this.texture = null; this.index = null; this.watch = null; }
    dispose() {
        this.engine.renderer?.domElement?.removeEventListener('webglcontextlost', this.onContextLost);
        this.invalidate(); for (const hook of [...this.hooks.values()]) hook.remove(); this.variants.dispose();
    }
}
