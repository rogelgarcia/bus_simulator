// Prepares borrowed city assets ahead of visibility without changing their rendered content.
// @ts-check
import * as THREE from 'three';
import { PreparationQueue } from './PreparationQueue.js';
import { BloomResourcePreparation } from './BloomResourcePreparation.js';
import { TextureRowDecoder } from './TextureRowDecoder.js';
import { TextureResidency } from './TextureResidency.js';
import { canStageImageTexture, createStagedImageTexture, imageTextureBytes } from './StagedImageTexture.js';

const LIMITS = Object.freeze({ cpuMs: 1, frameMs: 24, gpuMs: 33, uploadBytes: 3 * 1024 * 1024, geometryBytes: 3 * 1024 * 1024,
    extraBytes: 256 * 1024 * 1024, stagingBytes: 32 * 1024 * 1024, radius: 220, forwardRadius: 380, maxJobs: 256 });

function* visit(root) {
    const stack = [root];
    while (stack.length) { const object = stack.pop(); yield object; stack.push(...object.children); }
}

function geometryBytes(geometry) {
    const arrays = new Set(Object.values(geometry.attributes).map(a => (a.isInterleavedBufferAttribute ? a.data : a).array));
    if (geometry.index) arrays.add(geometry.index.array);
    return [...arrays].reduce((sum, array) => sum + (array?.byteLength ?? Infinity), 0);
}

function texturesOf(material, renderer) {
    const textures = new Set();
    for (const value of Object.values(material)) if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value);
    for (const uniform of Object.values(renderer.properties.get(material).uniforms ?? {})) {
        if (uniform.value?.isTexture && !uniform.value.isRenderTargetTexture) textures.add(uniform.value);
    }
    return textures;
}

export class NearbyGpuPreparation {
    /** @param {any} renderer */
    constructor(renderer) {
        this.renderer = renderer; this.city = null; this.queue = new PreparationQueue({ maxJobs: LIMITS.maxJobs });
        this.entries = new Map(); this.seen = new WeakSet(); this.materialSeen = new WeakMap(); this.retained = new Map();
        this.materialTextures = new WeakMap(); this.residencyRevision = 0; this.enabled = true;
        this.textureResidency = new TextureResidency(renderer);
        this.disposed = new WeakSet(); this.failed = new WeakSet(); this.listeners = new Map(); this.activeTexture = null;
        this.direction = new THREE.Vector3(); this.offset = new THREE.Vector3(); this.lastCamera = new THREE.Vector3(Infinity, 0, 0);
        this.stats = { geometries: 0, textures: 0, visibleMisses: 0, oversized: 0, extraBytes: 0, peakExtraBytes: 0,
            stagingBytes: 0, peakStagingBytes: 0, scanMs: 0, failures: 0, lastError: null, textureOperations: {} };
        this.frame = { cpuMs: 0, bytes: 0, steps: 0, pending: 0 };
        this.stage = new THREE.Scene(); this.camera = new THREE.Camera();
        this.material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
        this.empty = new THREE.BufferGeometry(); this.mesh = new THREE.Mesh(this.empty, this.material);
        this.mesh.frustumCulled = false; this.stage.add(this.mesh); this.target = new THREE.WebGLRenderTarget(1, 1);
        const original = this.originalDraw = renderer.renderBufferDirect, preparation = this;
        renderer.renderBufferDirect = this.draw = function(camera, scene, geometry, material, object, group) {
            const result = original.call(this, camera, scene, geometry, material, object, group);
            if (scene !== preparation.stage) preparation.observe(geometry, material);
            return result;
        };
        this.onContextLost = () => this.reset(null);
        renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    }

    watch(resource) {
        if (this.listeners.has(resource)) return;
        const handler = () => {
            this.disposed.add(resource); this.queue.cancel(resource); this.releaseEstimate(resource);
            this.seen.delete(resource);
            if (resource.isTexture) { this.textureResidency.forget(resource); this.residencyRevision++; }
            resource.removeEventListener('dispose', handler); this.listeners.delete(resource);
        };
        resource.addEventListener('dispose', handler); this.listeners.set(resource, handler);
    }

    releaseEstimate(resource) {
        this.stats.extraBytes -= this.retained.get(resource) ?? 0; this.retained.delete(resource);
    }

    observe(geometry, material) {
        this.releaseEstimate(geometry);
        if (!this.seen.has(geometry)) {
            if (this.queue.jobs.has(geometry)) this.stats.visibleMisses++;
            this.seen.add(geometry); this.watch(geometry); this.queue.cancel(geometry); this.releaseEstimate(geometry);
        }
        if (this.materialSeen.get(material) !== this.residencyRevision) {
            this.materialSeen.set(material, this.residencyRevision);
            for (const texture of this.textures(material)) {
                this.releaseEstimate(texture);
                const native = this.textureResidency.remember(texture, true);
                const prepared = this.textureResidency.prepared.get(native);
                if (prepared) { this.releaseEstimate(prepared); this.textureResidency.prepared.delete(native); }
                if (this.queue.jobs.has(texture) && this.renderer.properties.get(texture).__version === texture.version) {
                    this.stats.visibleMisses++; this.queue.cancel(texture);
                }
            }
        }
    }

    textures(material) {
        let cached = this.materialTextures.get(material);
        if (!cached || cached.version !== material.version) {
            cached = { version: material.version, values: [...texturesOf(material, this.renderer)] };
            this.materialTextures.set(material, cached);
        }
        return cached.values;
    }

    retain(resource, bytes) {
        if (resource.isTexture) {
            const native = this.textureResidency.remember(resource);
            if (this.textureResidency.visible.has(native) || this.textureResidency.prepared.has(native)) return;
            this.textureResidency.prepared.set(native, resource);
        }
        this.releaseEstimate(resource); this.residencyRevision++;
        this.retained.set(resource, bytes); this.stats.extraBytes += bytes;
        this.stats.peakExtraBytes = Math.max(this.stats.peakExtraBytes, this.stats.extraBytes);
    }

    reset(city) {
        this.bloom?.dispose(); this.bloom = null;
        this.queue.clear(); this.entries.clear(); this.retained.clear(); this.activeTexture = null;
        this.decoder?.dispose(); this.decoder = null;
        for (const [resource, handler] of this.listeners) resource.removeEventListener('dispose', handler);
        this.listeners.clear(); this.seen = new WeakSet(); this.materialSeen = new WeakMap(); this.disposed = new WeakSet();
        this.materialTextures = new WeakMap(); this.failed = new WeakSet(); this.planner = null;
        this.textureResidency = new TextureResidency(this.renderer);
        this.stats.extraBytes = 0; this.stats.stagingBytes = 0; this.city = city;
        this.frame = { cpuMs: 0, bytes: 0, steps: 0, pending: 0 };
        this.iterator = city ? visit(city.group) : null; this.nextScan = 0; this.nextSelect = 0;
    }

    /** Synchronize ownership before drawing, so first visible use is observed in the right city. */
    syncCity(city) { if (city !== this.city) this.reset(city); }

    scan(now, deadline) {
        if (!this.iterator && now >= this.nextScan) this.iterator = visit(this.city.group);
        let nodes = 0;
        while (this.iterator && nodes++ < 64 && performance.now() < deadline) {
            const item = this.iterator.next();
            if (item.done) { this.iterator = null; this.nextScan = now + 1000; break; }
            const object = item.value, geometry = object.geometry;
            if (!object.isMesh || !geometry || this.disposed.has(geometry)) continue;
            const previous = this.entries.get(object);
            if (previous?.geometry === geometry && previous?.material === object.material) continue;
            const bytes = geometryBytes(geometry);
            if (bytes > LIMITS.geometryBytes) this.stats.oversized++;
            if (!geometry.boundingSphere) geometry.computeBoundingSphere();
            const sphere = geometry.boundingSphere.clone().applyMatrix4(object.matrixWorld);
            this.entries.set(object, { geometry, material: object.material, bytes, sphere });
        }
    }

    select(camera, now, deadline) {
        if (camera.position.distanceToSquared(this.lastCamera) > LIMITS.radius ** 2) {
            this.queue.clear(); this.planner = null; this.nextSelect = 0;
        }
        this.lastCamera.copy(camera.position);
        if (!this.planner && now >= this.nextSelect) { this.planner = this.entries.entries(); this.wanted = new Set(); }
        camera.getWorldDirection(this.direction);
        let nodes = 0;
        while (this.planner && nodes++ < 64 && performance.now() < deadline) {
            const item = this.planner.next();
            if (item.done) {
                this.planner = null; this.nextSelect = now + 100;
                for (const [key, job] of this.queue.jobs) if (!job.persistent && !this.wanted.has(key)) this.queue.cancel(key);
                break;
            }
            const [object, entry] = item.value;
            if (!object.parent || this.disposed.has(entry.geometry)) { this.entries.delete(object); continue; }
            this.offset.copy(entry.sphere.center).sub(camera.position);
            const distance = Math.max(0, this.offset.length() - entry.sphere.radius);
            const forward = this.offset.dot(this.direction) >= 0;
            if (distance > (forward ? LIMITS.forwardRadius : LIMITS.radius)) continue;
            const priority = distance * (this.offset.dot(this.direction) < 0 ? 1.4 : 1);
            const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
            for (const material of materials) for (const texture of this.textures(material)) {
                // A material upload can block far longer than one small geometry; reserve queue space for it.
                this.wanted.add(texture); this.enqueueTexture(texture, priority - LIMITS.radius * 2);
            }
            this.wanted.add(entry.geometry); this.enqueueGeometry(entry, priority + 1);
        }
    }

    enqueueTexture(texture, priority) {
        if (this.disposed.has(texture) || this.failed.has(texture) || this.renderer.properties.get(texture).__version === texture.version
            || this.textureResidency.ready(texture)) return;
        if (this.queue.jobs.has(texture)) { this.queue.jobs.get(texture).priority = priority; return; }
        if (!canStageImageTexture(texture)) return;
        if (Math.max(texture.image.width, texture.image.height) > this.renderer.capabilities.maxTextureSize) return;
        const bytes = imageTextureBytes(texture);
        if (bytes > LIMITS.stagingBytes) { this.stats.oversized++; return; }
        let work = null;
        const admitted = this.queue.add(texture, { priority,
            step: budget => {
                if (this.disposed.has(texture)) return { done: true };
                if (this.renderer.properties.get(texture).__version === texture.version || this.textureResidency.ready(texture)) {
                    if (work) this.stats.visibleMisses++;
                    return { done: true };
                }
                if (!work) {
                    if (this.activeTexture || this.extraBytes() + bytes > LIMITS.extraBytes) return { waiting: true };
                    this.activeTexture = texture; this.stats.stagingBytes = bytes;
                    this.stats.peakStagingBytes = Math.max(this.stats.peakStagingBytes, bytes);
                    this.decoder ??= new TextureRowDecoder();
                    work = createStagedImageTexture(this.renderer, texture, () => { this.stats.textures++; this.retain(texture, bytes); }, this.decoder);
                }
                const started = performance.now();
                try { return work.step(budget); }
                catch (error) { this.failed.add(texture); throw error; }
                finally {
                    const elapsed = performance.now() - started;
                    const metrics = this.stats.textureOperations[work.phase] ??= { count: 0, ms: 0, maxMs: 0, source: null };
                    metrics.count++; metrics.ms += elapsed;
                    if (elapsed > metrics.maxMs) { metrics.maxMs = elapsed; metrics.source = texture.image.constructor.name + ':' + texture.name; }
                }
            },
            cancel: () => { work?.cancel(); if (this.activeTexture === texture) { this.activeTexture = null; this.stats.stagingBytes = 0; } }
        });
        if (admitted) { this.watch(texture); this.residencyRevision++; }
    }

    enqueueGeometry(entry, priority) {
        const { geometry, bytes } = entry;
        if (bytes > LIMITS.geometryBytes || this.seen.has(geometry) || this.disposed.has(geometry)) return;
        const admitted = this.queue.add(geometry, { priority, step: budget => {
            if (this.disposed.has(geometry) || this.seen.has(geometry)) return { done: true };
            if (bytes > budget || this.extraBytes() + bytes > LIMITS.extraBytes) return { waiting: true };
            this.mesh.geometry = geometry;
            const renderer = this.renderer, target = renderer.getRenderTarget();
            const face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
            const { frame: _frame, ...info } = renderer.info.render, autoReset = renderer.info.autoReset;
            const shadowAuto = renderer.shadowMap.autoUpdate, shadowNeeds = renderer.shadowMap.needsUpdate;
            try {
                renderer.info.autoReset = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
                renderer.setRenderTarget(this.target); renderer.render(this.stage, this.camera);
            } finally {
                renderer.setRenderTarget(target, face, mip); renderer.info.autoReset = autoReset; Object.assign(renderer.info.render, info);
                renderer.shadowMap.autoUpdate = shadowAuto; renderer.shadowMap.needsUpdate = shadowNeeds; this.mesh.geometry = this.empty;
            }
            this.seen.add(geometry); this.stats.geometries++; this.retain(geometry, bytes);
            return { done: true, bytes };
        } });
        if (admitted) this.watch(geometry);
    }

    /** @param {any} city @param {any} camera @param {{elapsedMs: number, ready: boolean, gpuMs?: number|null, pipeline?: any, scene?: any}} frame */
    update(city, camera, { elapsedMs, ready, gpuMs = null, pipeline = null, scene = null }) {
        if (this.renderer.getContext().isContextLost() || !this.enabled) return;
        this.syncCity(city);
        const started = performance.now();
        this.frame = { cpuMs: 0, bytes: 0, steps: 0, pending: this.queue.jobs.size };
        if (!city?.group?.parent || !ready || elapsedMs >= LIMITS.frameMs || (gpuMs !== null && gpuMs >= LIMITS.gpuMs)) return;
        this.scan(started, started + .2); this.stats.scanMs += performance.now() - started;
        this.select(camera, started, started + .45);
        if (pipeline !== this.bloom?.pipeline) {
            this.bloom?.dispose(); this.bloom = pipeline ? new BloomResourcePreparation(this.renderer, pipeline, this.queue) : null;
        }
        this.bloom?.update(city, camera, scene, () => LIMITS.extraBytes - this.stats.extraBytes);
        const budget = Math.min(LIMITS.cpuMs, LIMITS.frameMs - elapsedMs, LIMITS.gpuMs - (gpuMs ?? 0)) - (performance.now() - started);
        try { this.frame = this.queue.run({ milliseconds: budget, bytes: LIMITS.uploadBytes, steps: 16 }); }
        catch (error) {
            this.stats.failures++; this.stats.lastError = String(error); this.queue.clear();
            console.warn('[NearbyGpuPreparation] Preparation failed; ordinary rendering retained:', error);
        }
        this.frame.cpuMs = performance.now() - started;
    }

    extraBytes() { return this.stats.extraBytes + (this.bloom?.stats.extraBytes ?? 0) + (this.bloom?.stats.reservedBytes ?? 0); }

    diagnostics() { return { ...this.stats, textureOperations: Object.fromEntries(Object.entries(this.stats.textureOperations).map(([k,v])=>[k,{...v}])), bloom: this.bloom ? { ...this.bloom.stats } : null,
        queue: { ...this.queue.stats }, frame: { ...this.frame }, limits: LIMITS }; }

    dispose() {
        this.reset(null);
        if (this.renderer.renderBufferDirect === this.draw) this.renderer.renderBufferDirect = this.originalDraw;
        this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
        this.target.dispose(); this.material.dispose(); this.empty.dispose();
    }
}
