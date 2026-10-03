// Keeps categorical soil/cover pages in a bounded nearest-sampled array with resident ancestor fallback.
// @ts-check
import * as THREE from 'three';
import { landscapeCoverageMaskLayout, LANDSCAPE_SURFACE_COVERAGE, sampleLandscapeSurfaceCoverage, applyLandscapeContourCoverage } from './LandscapeSurfaceCoverage.js';
import { LANDSCAPE_CONTOUR_COVERAGE } from './LandscapeContourCoverage.js';
import { LANDSCAPE_NATURAL_PRESENTATION } from './LandscapeNaturalPresentation.js';

const inside = (bounds, x, z) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;

export class LandscapeMaskPages {
    /** @param {{loaded:any,budget:any,pool:any,renderer:any,uniforms:any,prefix:string,capacity:number}} options */
    constructor({ loaded, budget, pool, renderer, uniforms, prefix, capacity }) {
        Object.assign(this, { loaded, budget, pool, renderer, uniforms, prefix, capacity });
        this.manifest = loaded.manifest;
        this.descriptors = new Map(this.manifest.chunks.map(value => [value.id, value]));
        this.columns = loaded.chunk.descriptor.columns;
        this.rows = loaded.chunk.descriptor.rows;
        if (this.manifest.chunks.some(value => value.columns !== this.columns || value.rows !== this.rows)) throw new Error('Appearance mask array requires equal prepared page dimensions');
        this.layout = landscapeCoverageMaskLayout(loaded.chunk.descriptor);
        this.pageBytes = this.layout.pageBytes;
        this.key = `${prefix}/categorical-mask-array`;
        const admission = budget.reserve(this.key, { cpuBytes: this.pageBytes * capacity, gpuBytes: this.pageBytes * capacity, kind: 'appearance-mask-array' });
        if (!admission.admitted) throw new Error(`Minimum appearance mask cannot fit: ${admission.reason}`);
        this.pixels = new Uint8Array(this.pageBytes * capacity);
        this.texture = new THREE.DataArrayTexture(this.pixels, this.layout.width, this.layout.height, capacity);
        this.texture.format = THREE.RGBAFormat;
        this.texture.colorSpace = THREE.NoColorSpace;
        this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
        this.texture.generateMipmaps = false;
        this.texture.flipY = false;
        this.uniforms.uMaskPages.value = this.texture;
        this.uniforms.uMaskDimensions.value.set(this.columns, this.rows);
        this.records = new Map();
        this.failures = new Map();
        this.wanted = new Set([this.manifest.overviewId]);
        this.loadedCount = 0;
        this.evicted = 0;
        this.request(this.manifest.overviewId, 0, loaded.chunk.landCover);
    }

    request(id, slot, landCover = null) {
        const descriptor = this.descriptors.get(id);
        const key = `${this.prefix}/mask/${this.manifest.revision}/${id}/${descriptor.channels.landCover.sha256}`;
        const admission = this.budget.reserve(key, { cpuBytes: this.layout.decodeBytes, gpuBytes: 0, kind: 'appearance-mask-decode' });
        if (!admission.admitted) { this.degradationReason = admission.reason; return false; }
        const record = { id, key, descriptor, slot, progress: 0, status: 'loading', pixels: null, soils: [], abort: new AbortController(), sourceRevision: this.manifest.revision };
        record.lease = this.budget.shared.acquireLease(key, { consumer: `appearance-mask/${id}`, priority: id === this.manifest.overviewId ? 100 : 40, accuracy: 'approximate' });
        this.records.set(id, record);
        const failure = this.failures.get(id);
        this.pool.request({ type: 'mask', chunkId: id, ...(landCover ? { landCover } : {}) }, { priority: id === this.manifest.overviewId ? 100 : 40, signal: record.abort.signal }).then(result => {
            if (this.disposed || record.abort.signal.aborted || this.records.get(id) !== record) return;
            record.pixels = result.pixels;
            record.soils = result.soils;
            record.sourceIds = result.sourceIds;
            record.sourceRevision = result.sourceRevision;
            record.status = 'decoded';
            this.budget.update(key, { cpuBytes: result.pixels.byteLength, kind: 'appearance-mask-upload-pending' });
            this.loadedCount++;
        }).catch(error => {
            if (error.name === 'AbortError' || this.disposed) return;
            this.failures.set(id, { id, message: error.message, attempts: (failure?.attempts ?? 0) + 1, retryAt: performance.now() + 2500 });
            this.remove(record);
        });
        return true;
    }

    plan(plan, camera) {
        this.lastPlan = plan;
        const wanted = new Set([this.manifest.overviewId]);
        const visible = [...plan.visibleMaskIds].sort((a, b) => {
            const da = this.descriptors.get(a), db = this.descriptors.get(b);
            const distance = d => Math.hypot((d.bounds.minX + d.bounds.maxX) / 2 - camera.position.x, (d.bounds.minZ + d.bounds.maxZ) / 2 - camera.position.z);
            return plan.maskPixelsById[b] - plan.maskPixelsById[a] || distance(da) - distance(db) || a.localeCompare(b);
        });
        for (const id of visible) {
            const chain = [];
            for (let descriptor = this.descriptors.get(id); descriptor; descriptor = this.descriptors.get(descriptor.parentId)) if (!wanted.has(descriptor.id)) chain.unshift(descriptor.id);
            if (wanted.size + chain.length <= this.capacity) for (const value of chain) wanted.add(value);
        }
        this.wanted = wanted;
        this.capacityLimited = visible.some(id => !wanted.has(id));
        for (const record of [...this.records.values()]) if (!wanted.has(record.id) && record.status !== 'resident') this.remove(record);
    }

    activeChild(record) { return [...this.records.values()].some(value => value.descriptor.parentId === record.id); }

    updateUniforms() {
        const byPosition = new Map([...this.records.values()].filter(record => record.status === 'resident').map(record => [`${record.descriptor.level}/${record.descriptor.column}/${record.descriptor.row}`, record]));
        for (let slot = 0; slot < this.capacity; slot++) this.uniforms.uMaskMeta.value[slot].set(-1, 0, 0, 0);
        for (const record of this.records.values()) {
            if (record.status !== 'resident') continue;
            const { bounds } = record.descriptor;
            this.uniforms.uMaskBounds.value[record.slot].set(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
            const parentSlot = this.records.get(record.descriptor.parentId)?.slot ?? record.slot;
            this.uniforms.uMaskMeta.value[record.slot].set(record.descriptor.level, record.progress, parentSlot, 1);
            const { level, column, row } = record.descriptor, count = 2 ** level, neighbors = [];
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                if (dc === 0 && dr === 0) continue;
                const c = column + dc, r = row + dr;
                neighbors.push(c < 0 || r < 0 || c >= count || r >= count ? 1 : byPosition.get(`${level}/${c}/${r}`)?.progress ?? 0);
            }
            record.neighborProgress = neighbors;
            this.uniforms.uMaskNeighbors0.value[record.slot].set(...neighbors.slice(0, 4));
            this.uniforms.uMaskNeighbors1.value[record.slot].set(...neighbors.slice(4));
        }
    }

    update(dt, uploadAllowance) {
        this.degradationReason = this.capacityLimited ? 'appearance-mask-capacity' : null;
        for (const record of [...this.records.values()].sort((a, b) => b.descriptor.level - a.descriptor.level)) {
            if (record.status !== 'resident') continue;
            if (this.wanted.has(record.id) || this.activeChild(record)) record.progress = Math.min(1, record.progress + Math.min(dt, .1) / .3);
            else {
                record.progress = Math.max(0, record.progress - Math.min(dt, .1) / .3);
                if (record.progress === 0) this.remove(record);
            }
        }
        const decoded = [...this.records.values()].find(record => record.status === 'decoded' && (!record.descriptor.parentId || this.records.get(record.descriptor.parentId)?.status === 'resident'));
        const bytes = this.uploaded ? this.pageBytes : this.pixels.byteLength;
        let uploadedBytes = 0;
        if (decoded && bytes <= uploadAllowance) {
            this.pixels.set(decoded.pixels, decoded.slot * this.pageBytes);
            if (this.uploaded) this.texture.addLayerUpdate(decoded.slot);
            this.texture.needsUpdate = true;
            this.renderer.initTexture(this.texture);
            this.texture.clearLayerUpdates();
            this.uploaded = true;
            decoded.status = 'resident';
            if (!decoded.descriptor.parentId) decoded.progress = 1;
            decoded.pixels = null;
            this.budget.update(decoded.key, { cpuBytes: 0, kind: 'appearance-mask-resident-slot' });
            uploadedBytes = bytes;
        }
        if (![...this.records.values()].some(record => record.status !== 'resident')) {
            const missing = [...this.wanted].find(id => {
                if (this.records.has(id)) return false;
                const descriptor = this.descriptors.get(id), failure = this.failures.get(id);
                return (!descriptor.parentId || this.records.get(descriptor.parentId)?.progress === 1) && (!failure || failure.attempts < 2 && performance.now() >= failure.retryAt);
            });
            if (missing) {
                const used = new Set([...this.records.values()].map(record => record.slot));
                const slot = Array.from({ length: this.capacity }, (_, index) => index).find(index => !used.has(index));
                if (slot !== undefined) this.request(missing, slot);
            }
        }
        this.updateUniforms();
        return uploadedBytes;
    }

    best(x, z) {
        return [...this.records.values()].filter(record => record.status === 'resident' && inside(record.descriptor.bounds, x, z)).sort((a, b) => b.descriptor.level - a.descriptor.level || a.id.localeCompare(b.id))[0];
    }

    sample(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('Appearance sample coordinates must be finite');
        const record = this.best(x, z);
        if (!record) return null;
        const { bounds } = record.descriptor;
        const column = Math.round((x - bounds.minX) / (bounds.maxX - bounds.minX) * (this.columns - 1));
        const row = Math.round((bounds.maxZ - z) / (bounds.maxZ - bounds.minZ) * (this.rows - 1));
        const index = record.slot * this.pageBytes + ((row + this.layout.halo) * this.layout.width + column + this.layout.halo) * 4;
        return { soilId: this.manifest.soil.catalog[this.pixels[index] & 15].id, displaySoilId: this.manifest.soil.catalog[this.pixels[index] >> 4].id, coverId: this.pixels[index + 1], maskId: record.id, resolution: this.columns, level: record.descriptor.level, revision: record.sourceRevision, spacing: record.descriptor.sampleStride * this.manifest.grid.spacingX };
    }

    coverageSample(x, z, { dx = [0, 0], dy = [0, 0] } = {}) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('Coverage sample coordinates must be finite');
        const record = this.best(x, z);
        if (!record) return null;
        const spacingX = record.descriptor.sampleStride * this.manifest.grid.spacingX, spacingZ = record.descriptor.sampleStride * this.manifest.grid.spacingZ;
        const base = sampleLandscapeSurfaceCoverage({ bounds: record.descriptor.bounds, columns: this.columns, rows: this.rows, x, z, dx, dy,
            soilCount: this.manifest.soil.catalog.length, soilAt: (column, row) => this.pixels[record.slot * this.pageBytes + ((row + this.layout.halo) * this.layout.width + column + this.layout.halo) * 4] >> 4 });
        const result = applyLandscapeContourCoverage(base, { pixels: this.pixels, width: this.layout.width, height: this.layout.height, columns: this.columns, rows: this.rows,
            spacingX, spacingZ, xGrid: (x - record.descriptor.bounds.minX) / spacingX, zGrid: (record.descriptor.bounds.maxZ - z) / spacingZ, byteOffset: record.slot * this.pageBytes, dx, dy });
        return { ...result, recipe: LANDSCAPE_SURFACE_COVERAGE.id, maskId: record.id, sourceIds: record.sourceIds, level: record.descriptor.level,
            sourceRevision: record.sourceRevision, soilIds: this.manifest.soil.catalog.map(soil => soil.id), inspection: 'resident-page-before-hierarchy-transition' };
    }

    interests(plan) {
        const interests = new Map(), desiredTiers = {};
        for (const id of plan.visibleMaskIds) {
            let descriptor = this.descriptors.get(id), record;
            while (descriptor) {
                record = this.records.get(descriptor.id);
                if (record?.status === 'resident') break;
                descriptor = this.descriptors.get(descriptor.parentId);
            }
            if (!record || record.status !== 'resident') continue;
            for (const index of record.soils) {
                if (!interests.has(index)) interests.set(index, new Set());
                interests.get(index).add(id);
                const soilId = this.manifest.soil.catalog[index].id;
                const tier = record.id === id && record.progress === 1 ? Number(plan.desiredTiers[soilId]) : 32;
                desiredTiers[soilId] = String(Math.max(Number(desiredTiers[soilId] ?? 32), tier));
            }
        }
        return { interests, desiredTiers };
    }

    remove(record) {
        if (this.records.get(record.id) !== record) return;
        record.abort.abort();
        record.lease.release();
        record.pixels = null;
        this.records.delete(record.id);
        this.budget.release(record.key);
        this.uniforms.uMaskMeta.value[record.slot].set(-1, 0, 0, 0);
        this.evicted++;
    }

    snapshot() {
        const missing = [...this.wanted].some(id => {
            if (this.records.has(id)) return false;
            for (let descriptor = this.descriptors.get(id); descriptor; descriptor = this.descriptors.get(descriptor.parentId)) if ((this.failures.get(descriptor.id)?.attempts ?? 0) >= 2) return false;
            return !this.degradationReason?.includes('budget');
        });
        return { ready: this.records.get(this.manifest.overviewId)?.status === 'resident', pending: [...this.records.values()].filter(record => record.status !== 'resident').length,
            missingWork: missing,
            transitioning: [...this.records.values()].some(record => record.status === 'resident' && (record.progress !== 1 || !this.wanted.has(record.id))),
            residentMaskIds: [...this.records.values()].filter(record => record.status === 'resident').map(record => record.id),
            maskLods: [...this.records.values()].filter(record => record.status === 'resident').map(record => ({ id: record.id, level: record.descriptor.level, progress: record.progress, revision: record.sourceRevision })),
            coverage: { ...LANDSCAPE_SURFACE_COVERAGE, maskWidth: this.layout.width, maskHeight: this.layout.height, allocatedMaskBytes: this.pixels.byteLength,
                decodedMaskReservationBytes: this.layout.decodeBytes, contour: LANDSCAPE_CONTOUR_COVERAGE, sourceLimited: this.lastPlan?.sourceLimited ?? false,
                coordinates: 'world-XZ-meters', landscapeId: this.manifest.id, sourceRevision: this.manifest.revision,
                sourceSpacingMeters: { x: this.manifest.grid.spacingX, z: this.manifest.grid.spacingZ },
                soilBindings: this.manifest.soil.catalog.map(soil => ({ soilId: soil.id, materialId: soil.materialId })),
                naturalReference: { policy: LANDSCAPE_NATURAL_PRESENTATION, id: this.manifest.overviewId, sha256: this.loaded.chunk.descriptor.channels.landCover.sha256,
                    spacingMeters: this.loaded.chunk.descriptor.sampleStride * this.manifest.grid.spacingX },
                residentDependencies: [...this.records.values()].filter(record => record.status === 'resident').map(record => ({ id: record.id, sourceIds: record.sourceIds })) },
            wantedMaskIds: [...this.wanted], capacity: this.capacity, errors: [...this.failures.values()], loaded: this.loadedCount, evicted: this.evicted, degradationReason: this.degradationReason };
    }

    dispose() {
        this.disposed = true;
        for (const record of [...this.records.values()]) this.remove(record);
        this.texture.dispose();
        this.texture.image.data = null;
        this.texture = null;
        this.pixels = null;
        this.budget.release(this.key);
    }
}
