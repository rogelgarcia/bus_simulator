// Adapts the shared view planner and residency ledger into atomic worker-built terrain coverage.
// @ts-check
import * as THREE from 'three';
import { createLandscapeViewPlanner } from '../../../app/landscape/LandscapeStreaming.js';
import { estimateLandscapeMeshBuffers } from './LandscapeMeshBuffers.js';
import { createLandscapeMesh } from './LandscapeMesh.js';
import { LandscapeWorkerPool } from './LandscapeWorkerPool.js';
import { computeLandscapeTileEdges } from './LandscapeTileEdges.js';
import { landscapeNaturalPresentationBytes } from './LandscapeNaturalPresentation.js';
import { assertLandscapeCoverageSlots } from './LandscapeCoverageSlots.js';

const UPLOAD_BYTES_PER_FRAME = 8 * 1024 * 1024;
const MORPH_SECONDS = .3;
const sourceBytes = descriptor => descriptor.channels.height.decodedByteLength + descriptor.channels.landCover.decodedByteLength;
const arrayBytes = object => Object.values(object).reduce((sum, value) => sum + (ArrayBuffer.isView(value) ? value.byteLength : 0), 0);
const inside = (bounds, x, z) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;

/** @param {any} camera @param {number} viewportHeight @returns {any} */
export function landscapeCameraSnapshot(camera, viewportHeight) {
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const direction = camera.getWorldDirection(new THREE.Vector3());
    return {
        projection: camera.isOrthographicCamera ? 'orthographic' : 'perspective',
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        direction: { x: direction.x, y: direction.y, z: direction.z },
        viewportHeight, zoom: camera.zoom,
        fovYRadians: (camera.fov ?? 50) * Math.PI / 180,
        orthoHeight: camera.isOrthographicCamera ? camera.top - camera.bottom : 1,
        frustumPlanes: frustum.planes.map(plane => ({ x: plane.normal.x, y: plane.normal.y, z: plane.normal.z, w: plane.constant }))
    };
}

export class LandscapeStreamer {
    /** @param {{loaded:any,budget:any,renderer:any,scene:any,coverageSlots:number,mode?:string,lodColors?:boolean,boundaries?:boolean,targetErrorPixels?:number}} options */
    constructor({ loaded, budget, renderer, scene, coverageSlots, mode = 'shaded', lodColors = false, boundaries = false, targetErrorPixels = 1.5 }) {
        this.coverageSlots = assertLandscapeCoverageSlots(coverageSlots);
        this.loaded = loaded;
        this.manifest = loaded.manifest;
        this.budget = budget;
        this.renderer = renderer;
        this.scene = scene;
        this.mode = mode;
        this.lodColors = lodColors;
        this.boundaries = boundaries;
        this.targetErrorPixels = targetErrorPixels;
        this.planner = createLandscapeViewPlanner(this.manifest);
        this.descriptors = new Map(this.manifest.chunks.map(descriptor => [descriptor.id, descriptor]));
        this.children = new Map();
        for (const descriptor of this.manifest.chunks) {
            if (!descriptor.parentId) continue;
            if (!this.children.has(descriptor.parentId)) this.children.set(descriptor.parentId, []);
            this.children.get(descriptor.parentId).push(descriptor.id);
        }
        this.records = new Map();
        this.leaves = new Set();
        this.interests = new Set();
        this.prefetchIds = new Set();
        this.failures = new Map();
        this.instance = crypto.randomUUID();
        this.loadedCount = 0;
        this.evictedCount = 0;
        this.uploadedBytes = 0;
        this.peakUploadBytes = 0;
        this.frameCostMs = 0;
        this.degradationReason = null;
        this.disposed = false;
        this.poolKey = `${this.instance}/worker-context`;
        const contextReservation = budget.reserve(this.poolKey, { cpuBytes: (loaded.decodedBytes + landscapeNaturalPresentationBytes(loaded.chunk.descriptor).workingBytes) * 2, gpuBytes: 0, kind: 'worker-overview-copies-and-natural-infill', pinned: true });
        if (!contextReservation.admitted) throw new Error(`Minimum terrain worker coverage cannot fit: ${contextReservation.reason}`);
        this.pool = new LandscapeWorkerPool({ manifest: this.manifest, manifestUrl: loaded.manifestUrl, root: loaded.chunk });
    }

    resourceCost(descriptor, sourceOnly = false, peak = true) {
        const source = sourceBytes(descriptor);
        const estimate = estimateLandscapeMeshBuffers(descriptor);
        const wireCpu = this.mode === 'shaded' ? 0 : estimate.vertices * 16;
        const wireGpu = this.mode === 'shaded' ? 0 : estimate.wireBytes;
        const boundaryGpu = this.boundaries ? estimate.boundaryBytes : 0;
        return {
            cpuBytes: source * (peak ? 4 : 1) + (sourceOnly ? 0 : estimate.geometryBytes + estimate.wireIndexBytes + estimate.boundaryBytes + wireCpu + (peak ? source : 0)),
            gpuBytes: sourceOnly ? 0 : estimate.geometryBytes + wireGpu + boundaryGpu,
            kind: sourceOnly ? 'source-acquisition' : peak ? 'terrain-build-reservation' : 'terrain-resident'
        };
    }

    reserveRecord(id, sourceOnly = false) {
        const descriptor = this.descriptors.get(id);
        if (!descriptor) throw new Error(`Unknown terrain chunk ${id}`);
        const existing = this.records.get(id);
        if (existing && (sourceOnly || existing.buffers || existing.building)) return existing;
        if (existing && !existing.chunk) { this.degradationReason = 'acquiring-source'; return null; }
        const key = existing?.key ?? JSON.stringify([this.instance, this.manifest.id, this.manifest.revision, id, descriptor.level, descriptor.channels.height.sha256, descriptor.channels.landCover.sha256]);
        const resources = this.resourceCost(descriptor, sourceOnly);
        const admission = existing ? this.budget.update(key, resources) : this.budget.reserve(key, resources);
        if (!admission.admitted) { this.degradationReason = admission.reason; return null; }
        if (existing) { existing.building = true; existing.abort = new AbortController(); return existing; }
        const record = { id, key, descriptor, chunk: null, buffers: null, model: null, uploaded: false, building: !sourceOnly, sourceOnly, refs: 0, abort: new AbortController(), lastUsed: performance.now() };
        this.records.set(id, record);
        return record;
    }

    startRecord(record, parent = null, priority = 0, suppliedChunk = record.chunk) {
        if (record.loading) return record.ready;
        record.loading = true;
        record.ready = this.pool.request({ chunkId: record.id, sourceOnly: record.sourceOnly && !record.building, ...(parent ? { parent: { descriptor: parent.descriptor, heights: parent.heights } } : {}), ...(suppliedChunk ? { chunk: suppliedChunk } : {}) }, { signal: record.abort.signal, priority }).then(result => {
            if (this.disposed || record.abort.signal.aborted || this.records.get(record.id) !== record) throw new DOMException('Obsolete terrain result', 'AbortError');
            record.chunk = suppliedChunk ?? result.chunk;
            record.buffers = result.buffers;
            record.sourceOnly = !result.buffers;
            record.building = false;
            const actual = { cpuBytes: sourceBytes(record.descriptor) + (record.buffers ? arrayBytes(record.buffers) + (this.mode === 'shaded' ? 0 : estimateLandscapeMeshBuffers(record.descriptor).vertices * 16) : 0), gpuBytes: this.resourceCost(record.descriptor, !record.buffers, false).gpuBytes, kind: record.buffers ? 'terrain-upload-pending' : 'source-resident' };
            const admission = this.budget.update(record.key, actual);
            if (!admission.admitted) throw new Error(`Terrain buffer accounting exceeded reservation: ${admission.reason}`);
            this.loadedCount++;
            return record;
        }).finally(() => { record.loading = false; });
        return record.ready;
    }

    async initialize(camera) {
        try {
            const record = this.reserveRecord(this.manifest.overviewId);
            if (!record) throw new Error(`Minimum terrain coverage cannot fit: ${this.degradationReason}`);
            await this.startRecord(record, this.loaded.chunk, 1000, this.loaded.chunk);
            this.uploadRecord(record, camera);
            record.model.mesh.visible = true;
            this.leaves.add(record.id);
            this.budget.update(record.key, { pinned: true });
            return this;
        } catch (error) { this.dispose(); throw error; }
    }

    uploadRecord(record, camera) {
        if (record.uploaded) return 0;
        record.model = createLandscapeMesh(record.buffers, record.chunk.heights, { coverageSlots: this.coverageSlots });
        if (this.appearance) record.model.setAppearance(this.appearance.uniforms);
        if (this.planning) record.model.setPlanning(this.planning.uniforms);
        record.model.setMode(this.mode);
        record.model.setBoundaries(this.boundaries);
        record.model.setLodColors(this.lodColors);
        record.model.mesh.visible = false;
        this.scene.add(record.model.mesh);
        record.model.upload(this.renderer, camera);
        record.uploaded = true;
        this.budget.update(record.key, { kind: 'terrain-resident' });
        return record.model.diagnostics().estimatedGpuBytes;
    }

    setAppearance(appearance) {
        this.appearance = appearance;
        for (const record of this.records.values()) record.model?.setAppearance(appearance.uniforms);
    }

    setPlanning(planning) {
        this.planning = planning;
        for (const record of this.records.values()) record.model?.setPlanning(planning.uniforms);
    }

    evict(record) {
        if (!record || this.leaves.has(record.id) || record.id === this.manifest.overviewId) return false;
        if (this.task && (this.task.parentId === record.id || this.task.ids.includes(record.id))) return false;
        if (record.refs) {
            if (record.chunk && !record.building && record.buffers) {
                record.model?.dispose();
                record.model = null;
                record.buffers = null;
                record.uploaded = false;
                record.sourceOnly = true;
                this.budget.update(record.key, { cpuBytes: sourceBytes(record.descriptor), gpuBytes: 0, kind: 'source-resident' });
            }
            return false;
        }
        if (!this.budget.release(record.key)) return false;
        record.abort.abort();
        record.model?.dispose();
        record.model = null;
        this.records.delete(record.id);
        record.chunk = null;
        record.buffers = null;
        this.evictedCount++;
        return true;
    }

    prune(force = false, keepIds = [], reason = null) {
        const protectedIds = new Set([...(this.task?.ids ?? []), ...keepIds, ...(force ? [] : this.prefetchIds)]);
        if (this.task) protectedIds.add(this.task.parentId);
        for (const record of this.records.values()) if (!protectedIds.has(record.id) && (force || performance.now() - record.lastUsed > 750) && (reason !== 'gpu-budget' || !record.sourceOnly)) this.evict(record);
    }

    cancelTask() {
        const task = this.task;
        if (!task) return;
        this.task = null;
        for (const id of task.ids) {
            const record = this.records.get(id);
            if (this.leaves.has(id)) record?.model?.setMorph(1);
            else this.evict(record);
        }
        if (task.kind === 'coarsen') this.evict(this.records.get(task.parentId));
    }

    splitNeeded(id) { return this.desiredAncestors?.has(id) ?? false; }

    startTask(kind, parentId, ids) {
        const needed = kind === 'refine' ? ids : [parentId];
        const reserved = [];
        const previous = new Map();
        for (const id of needed) {
            const existing = this.records.get(id);
            if (existing) previous.set(id, { building: existing.building, abort: existing.abort, resources: this.budget.snapshot().entries.find(entry => entry.key === existing.key) });
            let record = this.reserveRecord(id);
            if (!record && ['cpu-budget', 'gpu-budget'].includes(this.degradationReason)) { this.prune(true, [...needed, parentId], this.degradationReason); record = this.reserveRecord(id); }
            if (!record) {
                for (const created of reserved) {
                    const prior = previous.get(created.id);
                    if (prior) { created.building = prior.building; created.abort = prior.abort; this.budget.update(created.key, prior.resources); }
                    else this.evict(created);
                }
                return false;
            }
            reserved.push(record);
        }
        this.cancelPrefetch(needed);
        const task = { kind, parentId, ids, phase: 'loading', progress: 0 };
        this.task = task;
        const parentChunk = this.records.get(parentId)?.chunk;
        for (const record of reserved) {
            if (record.buffers) continue;
            const parent = kind === 'refine' ? parentChunk : this.records.get(record.descriptor.parentId)?.chunk;
            this.startRecord(record, parent, 10 + (this.lastPlan?.errorsById[parentId] ?? 0)).catch(error => {
                if (error.name === 'AbortError' || this.disposed || this.task !== task) return;
                const previous = this.failures.get(record.id);
                this.failures.set(record.id, { message: error.message, attempts: (previous?.attempts ?? 0) + 1, retryAt: performance.now() + 2500 });
                this.degradationReason = `detail-request-failed:${record.id}`;
                this.cancelTask();
            });
        }
        return true;
    }

    retryAllowed(id) {
        const failure = this.failures.get(id);
        return !failure || (failure.attempts < 2 && performance.now() >= failure.retryAt);
    }

    cancelPrefetch(keepIds = []) {
        const keep = new Set(keepIds);
        for (const id of this.prefetchIds) {
            const record = this.records.get(id);
            if (!keep.has(id) || !record?.chunk) this.evict(record);
        }
        this.prefetchIds.clear();
    }

    updatePrefetch() {
        const desired = new Set((this.lastPlan.prefetchIds ?? []).slice(0, 2));
        for (const id of this.prefetchIds) {
            if (!desired.has(id) || !this.records.has(id)) { this.evict(this.records.get(id)); this.prefetchIds.delete(id); }
        }
        if (this.task || this.pool.snapshot().active || this.pool.snapshot().queued) return;
        for (const id of desired) {
            if (this.records.has(id) || !this.retryAllowed(id)) continue;
            const previousReason = this.degradationReason;
            const record = this.reserveRecord(id, true);
            this.degradationReason = previousReason;
            if (!record) break;
            this.prefetchIds.add(id);
            this.startRecord(record, null, -100).catch(error => {
                if (error.name === 'AbortError' || this.disposed) return;
                const previous = this.failures.get(id);
                this.failures.set(id, { message: error.message, attempts: (previous?.attempts ?? 0) + 1, retryAt: performance.now() + 2500, prefetch: true });
                this.prefetchIds.delete(id);
                this.evict(record);
            });
        }
    }

    balancedAfterRefine(parentId) {
        const parent = this.descriptors.get(parentId);
        for (const id of this.leaves) {
            const neighbor = this.descriptors.get(id);
            if (neighbor.level >= parent.level) continue;
            const a = parent.bounds, b = neighbor.bounds;
            const vertical = (a.minX === b.maxX || a.maxX === b.minX) && Math.min(a.maxZ, b.maxZ) > Math.max(a.minZ, b.minZ);
            const horizontal = (a.minZ === b.maxZ || a.maxZ === b.minZ) && Math.min(a.maxX, b.maxX) > Math.max(a.minX, b.minX);
            if (vertical || horizontal) return false;
        }
        return true;
    }

    chooseTask() {
        this.schedulerIdle = false;
        const coarsen = [...this.children].filter(([parentId, ids]) => ids.length === 4 && ids.every(id => this.leaves.has(id)) && !this.splitNeeded(parentId) && this.balancedAfterCoarsen(parentId)).sort((a, b) => this.descriptors.get(b[0]).level - this.descriptors.get(a[0]).level);
        for (const [parentId, ids] of coarsen) if (this.startTask('coarsen', parentId, ids)) return;
        const refine = [...this.leaves].filter(id => this.splitNeeded(id) && this.children.get(id)?.length === 4 && this.children.get(id).every(child => this.retryAllowed(child)) && this.balancedAfterRefine(id)).sort((a, b) => (this.lastPlan.errorsById[b] ?? 0) - (this.lastPlan.errorsById[a] ?? 0));
        for (const id of refine) if (this.startTask('refine', id, this.children.get(id))) return;
        this.schedulerIdle = true;
    }

    updateEdges() {
        const tiles = [...this.leaves].map(id => { const record = this.records.get(id); return { id, level: record.descriptor.level, bounds: record.descriptor.bounds, morph: record.model.morph }; });
        for (const edge of computeLandscapeTileEdges(tiles)) this.records.get(edge.id).model.setEdges(edge.coarser, edge.morph);
    }

    balancedAfterCoarsen(parentId) {
        const parent = this.descriptors.get(parentId), a = parent.bounds;
        for (const id of this.leaves) {
            const neighbor = this.descriptors.get(id), b = neighbor.bounds;
            if (neighbor.level <= parent.level + 1) continue;
            const vertical = (a.minX === b.maxX || a.maxX === b.minX) && Math.min(a.maxZ, b.maxZ) > Math.max(a.minZ, b.minZ);
            const horizontal = (a.minZ === b.maxZ || a.maxZ === b.minZ) && Math.min(a.maxX, b.maxX) > Math.max(a.minX, b.minX);
            if (vertical || horizontal) return false;
        }
        return true;
    }

    advanceTask(dt, camera) {
        const task = this.task;
        if (!task) return;
        const needed = task.kind === 'refine' ? task.ids : [task.parentId];
        if (task.phase === 'loading') {
            for (const id of needed) {
                const record = this.records.get(id);
                if (!record?.buffers || record.uploaded) continue;
                const bytes = this.resourceCost(record.descriptor, false, false).gpuBytes;
                if (this.uploadedBytes + bytes > UPLOAD_BYTES_PER_FRAME) break;
                this.uploadedBytes += this.uploadRecord(record, camera);
                break;
            }
            if (!needed.every(id => this.records.get(id)?.uploaded)) return;
            if (task.kind === 'refine') {
                this.records.get(task.parentId).model.mesh.visible = false;
                this.leaves.delete(task.parentId);
                for (const id of task.ids) { const record = this.records.get(id); record.model.setMorph(0); record.model.mesh.visible = true; this.leaves.add(id); }
                this.updateEdges();
            }
            task.phase = 'morph';
        }
        task.progress = Math.min(1, task.progress + dt / MORPH_SECONDS);
        for (const id of task.ids) this.records.get(id).model.setMorph(task.kind === 'refine' ? task.progress : 1 - task.progress);
        this.updateEdges();
        if (task.progress < 1) return;
        if (task.kind === 'coarsen') {
            for (const id of task.ids) { this.records.get(id).model.mesh.visible = false; this.leaves.delete(id); }
            const parent = this.records.get(task.parentId);
            parent.model.setMorph(1);
            parent.model.mesh.visible = true;
            this.leaves.add(parent.id);
        }
        const completedIds = task.kind === 'refine' ? [task.parentId] : task.ids;
        this.task = null;
        for (const id of completedIds) { const record = this.records.get(id); if (record) record.lastUsed = performance.now(); }
        this.updateEdges();
    }

    /** @param {number} dt seconds @param {any} camera @param {number} viewportHeight */
    update(dt, camera, viewportHeight) {
        if (this.disposed || !this.leaves.size) return;
        const started = performance.now();
        this.uploadedBytes = 0;
        if (this.inspectionUpload) {
            const root = this.records.get(this.manifest.overviewId);
            root.model.upload(this.renderer, camera);
            this.uploadedBytes = root.model.diagnostics().estimatedGpuBytes;
            this.inspectionUpload = false;
        }
        const cameraState = landscapeCameraSnapshot(camera, viewportHeight);
        cameraState.velocity = this.previousCameraPosition && dt > 0 ? {
            x: (camera.position.x - this.previousCameraPosition.x) / dt,
            y: (camera.position.y - this.previousCameraPosition.y) / dt,
            z: (camera.position.z - this.previousCameraPosition.z) / dt
        } : { x: 0, y: 0, z: 0 };
        this.previousCameraPosition = camera.position.clone();
        this.lastPlan = this.planner.plan(cameraState, { previousLeafIds: this.lastPlan?.desiredLeafIds ?? [...this.leaves], targetErrorPixels: this.targetErrorPixels });
        this.desiredAncestors = new Set();
        for (const id of this.lastPlan.desiredLeafIds) {
            let descriptor = this.descriptors.get(id);
            while (descriptor.parentId) { this.desiredAncestors.add(descriptor.parentId); descriptor = this.descriptors.get(descriptor.parentId); }
        }
        if (this.task?.phase === 'loading' && ((this.task.kind === 'refine') !== this.splitNeeded(this.task.parentId))) this.cancelTask();
        if (!this.task) { this.degradationReason = this.failures.size ? 'detail-request-failed' : null; this.chooseTask(); }
        this.advanceTask(Math.min(dt, .1), camera);
        this.updatePrefetch();
        this.prune();
        this.peakUploadBytes = Math.max(this.peakUploadBytes, this.uploadedBytes);
        this.frameCostMs = performance.now() - started;
    }

    coarsenToRoot() {
        this.schedulerIdle = false;
        this.cancelPrefetch();
        this.cancelTask();
        for (const id of this.leaves) { const record = this.records.get(id); if (record?.model) record.model.mesh.visible = false; }
        this.leaves.clear();
        const root = this.records.get(this.manifest.overviewId);
        if (root?.model) { root.model.mesh.visible = true; root.model.setMorph(1); root.model.setEdges([0, 0, 0, 0]); this.leaves.add(root.id); }
        this.prune(true);
    }

    setInspection({ mode = this.mode, lod = this.lodColors, boundaries = this.boundaries }) {
        const previousMode = this.mode, previousBoundaries = this.boundaries;
        if (mode === previousMode && boundaries === previousBoundaries) {
            this.lodColors = lod;
            for (const record of this.records.values()) record.model?.setLodColors(lod);
            return;
        }
        this.coarsenToRoot();
        this.mode = mode;
        this.boundaries = boundaries;
        this.lodColors = lod;
        const root = this.records.get(this.manifest.overviewId);
        const resources = this.resourceCost(root.descriptor, false, false);
        const admission = this.budget.update(root.key, resources);
        if (!admission.admitted) { this.mode = previousMode; this.boundaries = previousBoundaries; throw new Error(`Inspection cannot fit the shared budget: ${admission.reason}`); }
        root.model.setMode(mode);
        root.model.setBoundaries(boundaries);
        root.model.setLodColors(lod);
        this.inspectionUpload = true;
    }

    /** @param {string[]} ids @param {{consumer:string,priority?:number,accuracy?:string,signal?:AbortSignal}} options */
    async acquireChunks(ids, { consumer, priority = 100, accuracy = 'authoritative', signal } = {}) {
        if (!Array.isArray(ids) || !ids.length || ids.length > 4 || new Set(ids).size !== ids.length) throw new Error('Consumer requests require one to four distinct chunks');
        if (accuracy === 'authoritative' && ids.some(id => this.descriptors.get(id)?.level !== this.manifest.grid.maxLevel)) throw new Error('Authoritative leases require native chunks');
        signal?.throwIfAborted();
        const held = [], byId = new Map();
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            signal?.removeEventListener('abort', release);
            for (const { record, lease } of held) { lease.release(); record.refs--; this.evict(record); }
            held.length = 0;
            this.interests.delete(release);
            byId.clear();
        };
        this.interests.add(release);
        signal?.addEventListener('abort', release, { once: true });
        try {
            for (const id of ids) {
                signal?.throwIfAborted();
                let record = this.records.get(id);
                if (!record) {
                    record = this.reserveRecord(id, true);
                    if (!record) { this.prune(true, ids); record = this.reserveRecord(id, true); }
                    if (!record) throw new Error(`Consumer ${consumer} cannot acquire ${id}: ${this.degradationReason}`);
                    this.startRecord(record, null, priority);
                }
                const lease = this.budget.acquireLease(record.key, { consumer, priority, accuracy });
                record.refs++;
                held.push({ record, lease });
                if (!record.chunk) await record.ready;
                signal?.throwIfAborted();
                if (released || this.disposed) throw new DOMException('Consumer acquisition canceled', 'AbortError');
                byId.set(id, record.chunk);
            }
            return Object.freeze({ chunkIds: Object.freeze([...ids]), release, readChunk: async id => {
                if (released || !byId.has(id)) throw new Error('Requested source is not held by this consumer lease');
                return byId.get(id);
            } });
        } catch (error) { release(); throw error; }
    }

    renderedMeshes() { return [...this.leaves].map(id => this.records.get(id).model.mesh); }
    renderedChunkAt(x, z) { const id = [...this.leaves].find(id => inside(this.descriptors.get(id).bounds, x, z)); return id ? this.records.get(id).chunk : null; }

    snapshot() {
        const records = [...this.records.values()];
        const rendered = [...this.leaves].map(id => this.records.get(id));
        const metrics = rendered.map(record => record.model.diagnostics());
        let achievedErrorPixels = rendered.reduce((max, record) => this.lastPlan?.visibilityById[record.id] ? Math.max(max, this.lastPlan.errorsById[record.id]) : max, 0);
        if (this.task?.phase === 'morph' && this.lastPlan?.visibilityById[this.task.parentId]) achievedErrorPixels = Math.max(achievedErrorPixels, this.lastPlan.errorsById[this.task.parentId]);
        const pending = this.pool.snapshot();
        return {
            settled: this.schedulerIdle === true && !this.task && !pending.active && !pending.queued && !this.inspectionUpload,
            desiredLeafIds: this.lastPlan?.desiredLeafIds ?? [this.manifest.overviewId], residentLeafIds: [...this.leaves],
            residentIds: records.map(record => record.id), residentSourceIds: records.filter(record => record.chunk).map(record => record.id),
            targetErrorPixels: this.targetErrorPixels, desiredErrorPixels: this.lastPlan?.desiredErrorPixels ?? null, achievedErrorPixels,
            targetMet: achievedErrorPixels <= this.targetErrorPixels, degradationReason: this.degradationReason ?? (this.task ? 'loading-detail' : null),
            pending: pending.active + pending.queued, canceled: pending.canceled, loaded: this.loadedCount, evicted: this.evictedCount,
            queueDepth: pending.queued, activeWorkers: pending.active, uploadedBytesPerFrame: this.uploadedBytes, peakUploadedBytesPerFrame: this.peakUploadBytes, uploadLimitBytes: UPLOAD_BYTES_PER_FRAME, frameCostMs: this.frameCostMs,
            prefetchIds: [...this.prefetchIds],
            errors: [...this.failures].map(([id, value]) => ({ id, ...value })), budget: this.budget.snapshot(),
            sourceBytes: records.reduce((sum, record) => sum + (record.chunk ? sourceBytes(record.descriptor) : 0), 0),
            vertices: metrics.reduce((sum, metric) => sum + metric.vertices, 0), triangles: metrics.reduce((sum, metric) => sum + metric.triangles, 0),
            geometryBytes: metrics.reduce((sum, metric) => sum + metric.geometryBytes, 0), overlayBytes: records.reduce((sum, record) => sum + (record.model?.diagnostics().overlayBytes ?? 0), 0),
            estimatedGpuBytes: this.budget.snapshot().gpuBytes, estimatedPeakBytes: this.budget.snapshot().peakCpuBytes, memoryCapBytes: this.budget.snapshot().limits.cpuBytes,
            transition: this.task ? { kind: this.task.kind, parentId: this.task.parentId, phase: this.task.phase, progress: this.task.progress } : null,
            lods: rendered.map(record => ({ id: record.id, level: record.descriptor.level, errorPixels: this.lastPlan?.errorsById[record.id] ?? null, geometricError: record.descriptor.geometricError, morph: record.model.morph, resident: true }))
        };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const release of [...this.interests]) release();
        this.pool.dispose();
        for (const record of this.records.values()) {
            record.abort.abort();
            record.model?.dispose();
            record.model = null;
            record.chunk = null;
            record.buffers = null;
            this.budget.update(record.key, { pinned: false });
            this.budget.release(record.key);
        }
        this.budget.update(this.poolKey, { pinned: false });
        this.budget.release(this.poolKey);
        this.records.clear();
        this.leaves.clear();
        this.loaded = null;
    }
}
