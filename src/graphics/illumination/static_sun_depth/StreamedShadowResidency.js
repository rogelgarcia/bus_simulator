// Optional detail residency owned by one authenticated static shadow binding.
import * as THREE from 'three';
import { canonicalJsonBytes } from '../../../app/illumination/bake_source/CanonicalJson.js';
import { rawSha256Hex } from '../../../app/illumination/package/index.js';
import { ShadowPageResidency, STREAMED_SHADOW_LIMITS as LIMITS,
    validateStreamedShadowManifest, streamedShadowPrototypeOptions } from '../../../app/illumination/static_sun_depth/StreamedShadowPages.js';

async function boundedText(response) {
    const reader = response.body.getReader(), chunks = []; let bytes = 0;
    try {
        while (true) {
            const {value, done} = await reader.read(); if (done) break;
            bytes += value.length;
            if (bytes > LIMITS.maximumManifestBytes) throw new Error('Oversized shadow metadata');
            chunks.push(value);
        }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    const all = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(all);
}

export class StreamedShadowResidency {
    constructor(binding, renderer) {
        this.binding = binding; this.renderer = renderer; this.generation = 0; this.enabled = false;
        this.worker = null; this.pool = null; this.manifest = null; this.pending = new Set(); this.ready = [];
        this.failures = new Map(); this.residency = new ShadowPageResidency(); this.nextSelection = 0;
        this.metrics = {state: 'off', requests: 0, hits: 0, misses: 0, emptySkips: 0, failures: 0,
            fetchMs: 0, decodeMs: 0, hashMs: 0, uploadMs: 0, maximumUploadMs: 0, cpuBytes: 0, gpuBytes: 0, peakResident: 0};
    }
    async setEnabled(enabled) {
        if (enabled === this.enabled) return;
        this.enabled = enabled; const generation = ++this.generation;
        this.binding.uniforms.staticSunStreamEnabled.value = 0;
        if (!enabled) { this.release(); this.metrics.state = 'off'; return; }
        this.metrics.state = 'loading';
        this.abort = new AbortController();
        try {
            if (this.binding.streamedShaderAvailable === false) throw new Error('Detail shader explicitly disabled for this diagnostic session');
            const indexUrl = streamedShadowPrototypeOptions(location.search).indexUrl;
            const response = await fetch(indexUrl, {cache: 'no-cache', signal: this.abort.signal});
            if (!response.ok) throw new Error(`Detail index HTTP ${response.status}`);
            const indexText = await boundedText(response);
            if (indexText.length > LIMITS.maximumManifestBytes) throw new Error('Oversized detail index');
            const index = JSON.parse(indexText);
            if (index.schema !== 'bus-sim-static-shadow-streaming-index-v1' || !Array.isArray(index.profiles)) throw new Error('Invalid detail index');
            const hash = await rawSha256Hex(canonicalJsonBytes(this.binding.descriptor));
            const entry = index.profiles.find(p => p.parentDescriptorSha256 === hash);
            if (!entry || !/^\/(assets|tests\/artifacts)\/[a-zA-Z0-9_./-]+\/manifest.json$/.test(entry.url)
                || entry.url.includes('..')) throw new Error('No matching detail bake');
            const manifestResponse = await fetch(entry.url, {cache: 'no-cache', signal: this.abort.signal});
            if (!manifestResponse.ok) throw new Error('Detail manifest unavailable');
            const text = await boundedText(manifestResponse);
            if (text.length > LIMITS.maximumManifestBytes || await rawSha256Hex(new TextEncoder().encode(text)) !== entry.sha256) throw new Error('Detail manifest integrity failure');
            const manifest = await validateStreamedShadowManifest(JSON.parse(text), this.binding.descriptor);
            if (!this.enabled || generation !== this.generation) return;
            this.manifest = manifest; this.baseUrl = new URL(entry.url, location.href); this.pages = new Map(manifest.pages.map(p => [p.id, p]));
            const size = manifest.interiorTexels + 2 * manifest.guardTexels;
            this.pageBytes = size * size * 2;
            const parentBytes = this.binding.texture.image.data.byteLength;
            const tableBytes = manifest.tileCount[0] * manifest.tileCount[1] * 16;
            const slots = Math.min(LIMITS.slots, Math.floor((512 * 1024 * 1024 - parentBytes - tableBytes) / this.pageBytes));
            if (slots < 1) throw new Error('Detail pool exceeds the 512 MiB static shadow budget');
            this.residency = new ShadowPageResidency(slots);
            this.pool = new THREE.DataArrayTexture(new Uint8Array(this.pageBytes * slots), size, size, slots);
            if (typeof this.pool.addLayerUpdate !== 'function') throw new Error('Three texture-array layer updates unavailable');
            this.pool.format = THREE.RGFormat; this.pool.type = THREE.UnsignedByteType;
            this.pool.minFilter = this.pool.magFilter = THREE.NearestFilter; this.pool.generateMipmaps = false;
            this.pool.unpackAlignment = 1; this.pool.needsUpdate = true;
            this.table = new THREE.DataTexture(new Float32Array(manifest.tileCount[0] * manifest.tileCount[1] * 4),
                ...manifest.tileCount, THREE.RGBAFormat, THREE.FloatType);
            this.table.minFilter = this.table.magFilter = THREE.NearestFilter; this.table.needsUpdate = true;
            const allocationStarted = performance.now();
            this.renderer.initTexture(this.pool); this.renderer.initTexture(this.table);
            this.metrics.allocationMs = performance.now() - allocationStarted;
            const u = this.binding.uniforms;
            u.staticSunStreamTiles.value = this.pool; u.staticSunStreamTable.value = this.table;
            u.staticSunStreamLayout.value.set(manifest.interiorTexels, manifest.interiorTexels, manifest.guardTexels, manifest.texelSizeMeters);
            u.staticSunStreamTileCount.value.set(...manifest.tileCount);
            this.worker = new Worker(new URL('./StreamedShadowWorker.js', import.meta.url), {type: 'module'});
            this.worker.onmessage = ({data}) => {
                if (generation !== this.generation) return;
                this.pending.delete(data.id);
                if (data.error) { this.metrics.failures++; this.failures.set(data.id, performance.now() + 30000); this.metrics.lastError = data.error; }
                else { this.ready.push(data); for (const [key, value] of Object.entries(data.timings)) this.metrics[key] += value; }
            };
            this.worker.onerror = event => { this.metrics.lastError = event.message; this.release(); this.metrics.state = 'parent fallback'; };
            this.metrics.gpuBytes = this.pool.image.data.byteLength + this.table.image.data.byteLength;
            this.metrics.cpuBytes = this.metrics.gpuBytes + LIMITS.concurrency * this.pageBytes * 3;
            this.metrics.state = 'ready'; u.staticSunStreamEnabled.value = 1;
        } catch (error) {
            if (generation !== this.generation) return;
            this.release(); this.metrics.state = 'parent fallback'; this.metrics.lastError = error.message;
        }
    }
    update(camera, seconds, moverRoot = null) {
        if (!this.worker || !this.enabled) return;
        const u = this.binding.uniforms; u.staticSunStreamTime.value = seconds;
        if (seconds >= this.nextSelection) {
            this.nextSelection = seconds + 0.15;
            // Screen-error cutoff: the parent texel needs more than 0.7 pixels.
            // Project the entire truncated frustum, including elevated receivers.
            const height = this.renderer.domElement.height;
            const pitch = this.binding.descriptor.identity.layout.texelSizeMeters;
            const reach = Math.min(camera.far, pitch * height / (2 * Math.tan(camera.fov * Math.PI / 360)) / 0.7);
            const bounds = new THREE.Box2(); bounds.makeEmpty();
            const matrix = u.staticSunDepthWorldToLight.value;
            for (const distance of [camera.near, reach]) for (const x of [-1, 1]) for (const y of [-1, 1]) {
                const p = new THREE.Vector3(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
                const forward = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld);
                p.multiplyScalar(distance / Math.max(0.01, p.dot(forward))).add(camera.position).applyMatrix4(matrix);
                bounds.expandByPoint(new THREE.Vector2(p.x, p.y));
            }
            const margin = this.manifest.guardTexels * this.manifest.texelSizeMeters;
            bounds.expandByScalar(margin);
            if (moverRoot) {
                const mover = moverRoot.getWorldPosition(new THREE.Vector3()).applyMatrix4(matrix);
                const now = new THREE.Vector2(mover.x, mover.y);
                if (this.previousMover && seconds > this.previousMover.seconds) {
                    const delta = now.clone().sub(this.previousMover.point).multiplyScalar(0.75 / (seconds - this.previousMover.seconds));
                    delta.clampLength(0, 25); bounds.expandByPoint(now.clone().add(delta));
                }
                bounds.expandByPoint(now); this.previousMover = {point: now, seconds};
            }
            const center = camera.position.clone().applyMatrix4(matrix), edge = this.manifest.interiorTexels * this.manifest.texelSizeMeters;
            const candidates = [];
            for (const page of this.manifest.pages) {
                const x = this.manifest.origin[0] + (page.id % this.manifest.tileCount[0]) * edge;
                const y = this.manifest.origin[1] + Math.floor(page.id / this.manifest.tileCount[0]) * edge;
                if (x + edge < bounds.min.x || y + edge < bounds.min.y || x > bounds.max.x || y > bounds.max.y) continue;
                candidates.push({page, distance: (x + edge / 2 - center.x) ** 2 + (y + edge / 2 - center.y) ** 2});
            }
            candidates.sort((a, b) => a.distance - b.distance || a.page.id - b.page.id);
            const wanted = candidates.filter(v => !v.page.empty).slice(0, this.residency.capacity).map(v => v.page.id);
            this.metrics.hits += wanted.filter(id => this.residency.entries.has(id)).length;
            this.metrics.selectionFallbacks = wanted.filter(id => !this.residency.entries.has(id)).length;
            this.residency.select(wanted, seconds); this.wanted = wanted;
            for (const entry of this.residency.entries.values()) {
                const offset = entry.id * 4, data = this.table.image.data;
                if (this.residency.wanted.has(entry.id)) {
                    if (data[offset + 2] > 0) {
                        const currentWeight = Math.min(Math.max(0, Math.min(1, (seconds - data[offset + 1]) / LIMITS.fadeSeconds)),
                            1 - Math.max(0, Math.min(1, (seconds - data[offset + 2]) / LIMITS.fadeSeconds)));
                        data[offset + 1] = seconds - currentWeight * LIMITS.fadeSeconds;
                        data[offset + 2] = 0; this.table.needsUpdate = true;
                    }
                } else if (data[offset + 2] === 0) {
                    data[offset + 2] = entry.lastUsed + LIMITS.retainedSeconds - LIMITS.fadeSeconds;
                    this.table.needsUpdate = true;
                }
            }
            for (const {page} of candidates) if (page.empty && this.table.image.data[page.id * 4] === 0) {
                this.table.image.data.set([-1, seconds - LIMITS.fadeSeconds, 0, 0], page.id * 4);
                this.table.needsUpdate = true; this.metrics.emptySkips++;
            }
        }
        // One bounded page copy/upload per rendered frame; never a synchronous fetch.
        const ready = this.ready.shift();
        if (ready && this.residency.wanted.has(ready.id)) {
            const entry = this.residency.admit(ready.id, seconds);
            if (entry) {
                const start = performance.now();
                if (entry.evicted !== null) this.table.image.data.fill(0, entry.evicted * 4, entry.evicted * 4 + 4);
                this.pool.image.data.set(ready.raw, entry.slot * this.pageBytes);
                this.pool.addLayerUpdate(entry.slot); this.pool.needsUpdate = true; this.renderer.initTexture(this.pool);
                this.table.image.data.set([entry.slot + 1, seconds, 0, 0], entry.id * 4); this.table.needsUpdate = true;
                const elapsed = performance.now() - start; this.metrics.uploadMs += elapsed;
                this.metrics.maximumUploadMs = Math.max(this.metrics.maximumUploadMs, elapsed);
                this.metrics.peakResident = Math.max(this.metrics.peakResident, this.residency.entries.size);
            } else {
                // Keep authenticated bytes while the previous page fades out.
                // Dropping them here causes repeated fetch/decode work each frame.
                this.ready.unshift(ready);
            }
        }
        for (const id of this.wanted ?? []) {
            if (this.residency.entries.has(id)) continue;
            if (this.pending.size + this.ready.length >= LIMITS.concurrency) break;
            if (this.pending.has(id) || this.ready.some(v => v.id === id) || (this.failures.get(id) ?? 0) > performance.now()) continue;
            const page = this.pages.get(id); this.pending.add(id); this.metrics.requests++; this.metrics.misses++;
            this.worker.postMessage({id, page, url: new URL(page.path, this.baseUrl).href});
        }
    }
    diagnostics() { return {...this.metrics, resident: this.residency.entries.size, capacity: this.residency.capacity,
        pending: this.pending.size, queued: this.ready.length, evictions: this.residency.evictions,
        parentFallback: 'complete authenticated V1 map', coverage: this.manifest?.coverage ?? 'unavailable',
        counterPolicy: 'CPU page-selection/fetch events; fragment fallback counts are not measured'}; }
    release() {
        this.binding.uniforms.staticSunStreamEnabled.value = 0;
        this.binding.uniforms.staticSunStreamTiles.value = null;
        this.binding.uniforms.staticSunStreamTable.value = null;
        this.abort?.abort(); this.abort = null; this.previousMover = null;
        this.worker?.terminate(); this.worker = null; this.pool?.dispose(); this.table?.dispose();
        this.pool = null; this.table = null; this.pending.clear(); this.ready.length = 0; this.residency.clear();
        this.metrics.cpuBytes = this.metrics.gpuBytes = 0;
    }
    dispose() { this.enabled = false; this.generation++; this.release(); }
}
