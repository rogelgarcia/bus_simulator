// Owns optional receiver lightmaps, exact source checks, staging, and frame-boundary activation.
// @ts-check
import * as THREE from 'three';
import { exportResolvedCityBakeIdentity, waitForResolvedCityBakeReadiness } from '../bake_source/index.js';
import { createResolvedIlluminationExportProfile } from '../bake_source/IlluminationExportProfile.js';
import { loadReceiverChannel } from './ReceiverLightmapResources.js';
import { installReceiverLightmapBindings } from './ReceiverLightmapMaterialAdapter.js';

const INDEX = '/assets/baked_lighting/receivers/package_index.json';
const CHANNELS = { direct: 'direct_receiver', indirect: 'indirect_irradiance' };
const SOURCE_TIMEOUT_MS = 180_000;
const FIRST_ACTIVATION_BLEND_MS = 400;

function waitWithAbort(task, signal) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const cleanup = () => signal.removeEventListener('abort', abort);
        const abort = () => { cleanup(); reject(signal.reason); };
        signal.addEventListener('abort', abort, { once: true });
        task.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
    });
}

function lightingKey(engine, city) {
    const profile = createResolvedIlluminationExportProfile({ engine, city });
    return JSON.stringify(profile.lightProfiles);
}

function sourceWatch(references) {
    const checks = [];
    const geometryChecks = [];
    const materials = new Set();
    const arrays = new Set();
    for (const object of references.values()) {
        const geometry = object.geometry;
        geometryChecks.push(() => object.geometry === geometry);
        const matrix = Array.from(object.matrixWorld.elements);
        const parent = object.parent, count = object.count, material = object.material;
        checks.push(() => object.parent === parent && object.count === count && object.material === material
            && matrix.every((v, i) => v === object.matrixWorld.elements[i]));
        for (const attribute of [...Object.values(object.geometry.attributes), object.geometry.index, object.instanceMatrix, object.instanceColor]) {
            if (!attribute || arrays.has(attribute)) continue;
            arrays.add(attribute); const version = attribute.version ?? attribute.data?.version;
            checks.push(() => (attribute.version ?? attribute.data?.version) === version);
        }
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
    for (const material of materials) {
        const values = () => JSON.stringify([material.color?.toArray(), material.emissive?.toArray(), material.emissiveIntensity,
            material.metalness, material.roughness, material.normalMap?.uuid, material.normalScale?.toArray(),
            material.map?.uuid, material.map?.version, material.bumpMap?.uuid, material.displacementMap?.uuid, material.visible, material.opacity]);
        const initial = values(); checks.push(() => values() === initial);
    }
    return (checkGeometry = false) => checks.every((check) => check())
        && (!checkGeometry || geometryChecks.every((check) => check()));
}

export class ReceiverLightmapRuntime {
    /** @param {any} engine */
    constructor(engine) {
        this.engine = engine; this.settings = { direct: false, indirect: false, debug: 'final' };
        this.resources = {}; this.generation = 0; this.status = { state: 'current', reason: 'disabled' };
        this.timings = {};
        this.indexUrl = INDEX; this.loadChannel = loadReceiverChannel;
        this.installBindings = installReceiverLightmapBindings; this.makeWatch = sourceWatch;
        this.lightingKey = lightingKey; this.sourceOptions = {};
        const empty = new THREE.DataArrayTexture(new Uint16Array(4), 1, 1, 1);
        empty.type = THREE.HalfFloatType; empty.needsUpdate = true; this.empty = empty;
        this.uniforms = { receiverAtlasMapping: { value: null }, receiverDirectAtlas: { value: empty },
            receiverIndirectAtlas: { value: empty }, receiverDirectEnabled: { value: 0 }, receiverIndirectEnabled: { value: 0 },
            receiverDebugMode: { value: 0 }, receiverMaxMip: { value: 0 }, receiverAtlasEnabled: { value: 0 }, receiverLightingBlend: { value: 1 } };
        this.onContextLost = () => {
            this.generation++; this.abort?.abort(); this.release();
            this.status = { state: 'fallback', reason: 'webgl_context_lost' };
        };
        this.onContextRestored = () => { void (this.requestRefresh?.() ?? this.refresh()); };
        engine.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
        engine.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    }

    /** @param {{direct: boolean, indirect: boolean, linked?: boolean, debug: string}} settings */
    setSettings(settings) {
        const changed = settings.direct !== this.settings.direct || settings.indirect !== this.settings.indirect;
        this.settings = { ...settings };
        return changed ? this.refresh() : Promise.resolve(this.getDiagnostics());
    }

    getSource(city, key) {
        if (this.sourceJob?.city === city && this.sourceJob.key === key && !this.sourceJob.abort.signal.aborted) {
            return this.sourceJob.promise;
        }
        this.sourceJob?.abort.abort(new Error('source_validation_replaced'));
        const job = { city, key, abort: new AbortController(), started: performance.now(), promise: null };
        this.sourceJob = job;
        const signal = job.abort.signal;
        const timeout = setTimeout(() => job.abort.abort(new Error('source_validation_timeout')), SOURCE_TIMEOUT_MS);
        job.promise = (async () => {
            await waitWithAbort(this.engine.waitForLightingReady(), signal);
            const readiness = await waitWithAbort(waitForResolvedCityBakeReadiness(city), signal);
            const source = await waitWithAbort(exportResolvedCityBakeIdentity({ city,
                profile: createResolvedIlluminationExportProfile({ engine: this.engine, city }),
                readiness: { ...readiness, lightingProfileSourcesReady: true }, includeLiveReferences: true,
                signal, ...this.sourceOptions, onProgress: (progress) => {
                    if (this.sourceJob === job) this.status = { state: 'loading', reason: progress.phase, progress };
                } }), signal);
            this.onSourceExport?.(source.manifest);
            this.timings.sourceValidationMs = performance.now() - job.started;
            this.timings.sourcePhases = source.metrics.phaseTimings;
            return source;
        })().finally(() => {
            clearTimeout(timeout);
            if (this.sourceJob === job) this.sourceJob = null;
        });
        return job.promise;
    }

    async refresh() {
        const refreshStarted = performance.now();
        this.loadingStarted = this.sourceJob?.started ?? refreshStarted;
        const generation = ++this.generation;
        this.abort?.abort();
        this.abort = new AbortController();
        const signal = this.abort.signal;
        this.pending = undefined;
        let loadedChannel = false;
        if (!this.settings.direct && !this.settings.indirect) {
            this.deactivate();
            this.status = { state: 'current', reason: Object.keys(this.resources).length ? 'disabled_cached' : 'disabled' };
            return this.getDiagnostics();
        }
        try {
            const city = this.engine.context?.city;
            if (!city) throw new Error('no_gameplay_city');
            const key = this.lightingKey(this.engine, city);
            if (this.city && (this.city !== city || this.key !== key || !this.watch(!this.bindings))) this.release();
            this.status = { state: 'loading', reason: 'source_validation' };
            const index = await this.fetchIndex(signal);
            if (signal.aborted || generation !== this.generation) return this.getDiagnostics();
            if (index.schema !== 'bus-sim-receiver-lightmap-index-v1' || index.cityId !== city.cityId) throw new Error('city_profile_mismatch');
            this.validateLightingProfile?.(index, city);
            if (Object.entries(this.resources).some(([channel, resource]) => resource.identity.profileId !== index.profileId
                || resource.identity.aggregateSha256 !== index.channels[channel]?.aggregateSha256)) this.release();
            if (!this.source) {
                const source = await waitWithAbort(this.getSource(city, key), signal);
                if (signal.aborted || generation !== this.generation) return this.getDiagnostics();
                this.source = { hashes: source.sourceIdentity, references: source.liveObjectReferences };
                this.city = city; this.key = key; this.watch = this.makeWatch(this.source.references);
            }
            const channelFailures = {};
            for (const [setting, channel] of Object.entries(CHANNELS)) {
                if (signal.aborted || generation !== this.generation) return this.getDiagnostics();
                if (!this.settings[setting] || this.resources[channel]) continue;
                try {
                const descriptor = index.channels[channel];
                if (!descriptor) throw new Error(channel + '_unavailable');
                const sourceHash = this.source.hashes.channelSources.find((v) => v.id === channel)?.sha256;
                if (sourceHash !== descriptor.sourceSha256) throw new Error(channel + '_source_mismatch');
                this.status = { state: 'loading', reason: 'loading_' + setting + '_maps' };
                const resource = await this.loadChannel({ url: new URL(descriptor.url, new URL(this.indexUrl, location.href)).href,
                    descriptor, channel, sourceHash, cityId: city.cityId, profileId: index.profileId, renderer: this.engine.renderer, signal });
                if (signal.aborted || generation !== this.generation) { resource.dispose(); return this.getDiagnostics(); }
                if (this.mappingKey && this.mappingKey !== JSON.stringify(resource.mapping)) { resource.dispose(); throw new Error('channel_mapping_mismatch'); }
                this.mappingKey = JSON.stringify(resource.mapping); this.resources[channel] = resource; loadedChannel = true;
                } catch (error) { channelFailures[channel] = error.message; }
            }
            if (signal.aborted || generation !== this.generation) return this.getDiagnostics();
            const resource = this.resources.indirect_irradiance ?? this.resources.direct_receiver;
            if (!resource) throw new Error(Object.values(channelFailures).join('; ') || 'no_receiver_channels');
            this.uniforms.receiverAtlasMapping.value = resource.mappingTexture;
            this.uniforms.receiverDirectAtlas.value = this.resources.direct_receiver?.texture ?? this.empty;
            this.uniforms.receiverIndirectAtlas.value = this.resources.indirect_irradiance?.texture ?? this.empty;
            this.uniforms.receiverMaxMip.value = resource.mapping.profile.mipLevels - 1;
            this.bindings ??= this.installBindings(resource.mapping, this.source.references, this.uniforms);
            const compileStarted = performance.now();
            this.status = { state: 'loading', reason: 'preparing_shaders' };
            await this.engine.renderer.compileAsync(this.engine.scene, this.engine.camera);
            if (generation !== this.generation) return this.getDiagnostics();
            this.pendingFade = loadedChannel && !this.active;
            this.pending = true; this.status = { state: 'loading', reason: 'ready_to_commit', profileId: index.profileId, channelFailures };
            this.timings.prewarmMs = performance.now() - compileStarted;
            this.timings.lastRefreshMs = performance.now() - refreshStarted;
        } catch (error) {
            if (generation !== this.generation) return this.getDiagnostics();
            this.release(); this.status = { state: 'fallback', reason: error.message };
        }
        return this.getDiagnostics();
    }

    validateFrame() {
        let compatible = !this.city || this.engine.context?.city === this.city;
        if (this.city && (this.active || this.pending)) {
            try { compatible = this.engine.context?.city === this.city && this.watch()
                && this.lightingKey(this.engine, this.city) === this.key
                && (!this.bindings || this.bindings.geometries.every((entry) => entry.object.geometry === entry.geometry)); }
            catch { compatible = false; }
        }
        if (!compatible) {
            if (this.watch?.lastChange) this.timings.sourceInvalidation = this.watch.lastChange;
            this.generation++; this.abort?.abort(); this.release(); this.status = { state: 'fallback', reason: 'source_or_profile_changed' };
        }
        return compatible;
    }

    frameBegin(nowMs = performance.now(), allowActivation = true, validate = true) {
        if (validate) this.validateFrame();
        if (this.pending !== undefined && (!this.pending || allowActivation)) {
            this.active = this.pending; this.pending = undefined;
            this.blendStarted = this.active && this.pendingFade && !this.atomicActivation ? nowMs : null; this.pendingFade = false;
            if (this.active) this.status = { ...this.status, state: 'active', reason: null };
        }
        this.uniforms.receiverLightingBlend.value = this.blendStarted == null ? 1
            : Math.min(1, Math.max(0, (nowMs - this.blendStarted) / FIRST_ACTIVATION_BLEND_MS));
        const active = this.active === true;
        const hybrid = active && this.settings.direct
            && this.engine.getIlluminationPipeline?.()?.runtime?.getSnapshot?.()?.effectiveMode === 'baked';
        this.uniforms.receiverDirectEnabled.value = Number(active && this.settings.direct && !!this.resources.direct_receiver && hybrid);
        this.uniforms.receiverIndirectEnabled.value = Number(active && this.settings.indirect && !!this.resources.indirect_irradiance);
        this.uniforms.receiverAtlasEnabled.value = Number(active);
        if (active && this.settings.direct && !hybrid) this.status.reason = 'direct_requires_active_baked_shadows';
        else if (this.status.reason === 'direct_requires_active_baked_shadows') this.status.reason = null;
        const modes = ['final', 'direct', 'indirect', 'combined', 'uv', 'pages', 'unmapped', 'difference', 'mip'];
        this.uniforms.receiverDebugMode.value = active ? Math.max(0, modes.indexOf(this.settings.debug)) : 0;
    }

    getDiagnostics() {
        return { ...this.status, effective: { direct: !!this.uniforms.receiverDirectEnabled.value,
            indirect: !!this.uniforms.receiverIndirectEnabled.value },
            loadingElapsedMs: this.status.state === 'loading' ? performance.now() - this.loadingStarted : null,
            activationBlend: this.uniforms.receiverLightingBlend.value,
            channels: Object.fromEntries(Object.entries(this.resources).map(([id, v]) => [id, v.metrics])),
            publications: Object.fromEntries(Object.entries(this.resources).map(([id, v]) => [id, v.identity])),
            timings: { ...this.timings }, coverage: (this.resources.indirect_irradiance ?? this.resources.direct_receiver)?.mapping.statistics ?? null };
    }

    async fetchIndex(signal) {
        const response = await fetch(this.indexUrl, { cache: 'no-cache', signal });
        if (!response.ok) throw new Error('no_receiver_package');
        return response.json();
    }

    deactivate() {
        this.sourceJob?.abort.abort(new Error('source_validation_cancelled'));
        this.sourceJob = null;
        this.active = false; this.pending = false;
        this.blendStarted = null; this.pendingFade = false;
        this.uniforms.receiverDirectEnabled.value = 0; this.uniforms.receiverIndirectEnabled.value = 0; this.uniforms.receiverDebugMode.value = 0;
        this.uniforms.receiverAtlasEnabled.value = 0;
        this.bindings?.restore(); this.bindings = null;
    }

    suspend(reason = 'current_requested') {
        this.generation++; this.abort?.abort(); this.deactivate();
        this.status = { state: 'current', reason };
    }

    invalidate() { this.suspend('explicit_revalidation'); this.release(); }

    release() {
        this.deactivate();
        for (const resource of Object.values(this.resources)) resource.dispose();
        this.uniforms.receiverAtlasMapping.value = null;
        this.uniforms.receiverDirectAtlas.value = this.empty; this.uniforms.receiverIndirectAtlas.value = this.empty;
        this.watch = null; this.key = null;
        this.resources = {}; this.source = null; this.city = null; this.mappingKey = null;
    }

    dispose() {
        this.generation++; this.abort?.abort(); this.release(); this.empty.dispose();
        this.engine.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
        this.engine.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    }
}
