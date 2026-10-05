// Keeps categorical soil/cover pages in a bounded nearest-sampled array with resident ancestor fallback.
// @ts-check
// Generated fine pages occupy the array layers above the native capacity. LandscapeSurfaceDetailPages plans and fills
// them, while this class keeps one record map, fade loop, children-before-parents eviction and availability uniform
// layout for both kinds; the native plan, slots, uploads, inspection and snapshot fields are unchanged by fine pages.
import * as THREE from 'three';
import { landscapeCoverageMaskLayout, LANDSCAPE_SURFACE_COVERAGE, sampleLandscapeSurfaceCoverage, applyLandscapeContourCoverage } from './LandscapeSurfaceCoverage.js';
import { LANDSCAPE_CONTOUR_COVERAGE } from './LandscapeContourCoverage.js';
import { LANDSCAPE_NATURAL_PRESENTATION, LANDSCAPE_NATURAL_TERRAIN_INFERENCE } from './LandscapeNaturalPresentation.js';
import { landscapeNaturalSoilTransientBytes } from '../../../app/landscape/LandscapeNaturalSoil.js';
import { landscapeCoverageMaskOwners } from './LandscapeCoverageMask.js';
import { LandscapeSurfaceDetailPages } from './LandscapeSurfaceDetailPages.js';

const inside = (bounds, x, z) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
const isNative = record => record.kind !== 'detail';
const WARP_STEP_METERS = .01;

// same-level neighbor progress: outside the landscape, uniform pages and descendants of uniform fine pages are fully available
function neighborProgress(byPosition, nativeMaxLevel, level, column, row) {
    const count = 2 ** level;
    if (column < 0 || row < 0 || column >= count || row >= count) return 1;
    const record = byPosition.get(`${level}/${column}/${row}`);
    if (record) return record.status === 'uniform' ? 1 : record.progress;
    for (let parent = level - 1, c = column >> 1, r = row >> 1; parent > nativeMaxLevel; parent--, c >>= 1, r >>= 1) {
        if (byPosition.get(`${parent}/${c}/${r}`)?.status === 'uniform') return 1;
    }
    return 0;
}

export class LandscapeMaskPages {
    /**
     * @param {{loaded:any,budget:any,pool:any,renderer:any,uniforms:any,prefix:string,capacity:number,detail?:any,warp?:{evaluate:(x:number,z:number,out:Float64Array)=>Float64Array}|null,
     *   natural?:any}} options detail: options of LandscapeSurfaceDetailPages without masks/firstSlot; its capacity adds fine layers above the native slots;
     *   natural: the ready LandscapeNaturalInference whose policy every mask request carries (null: overview infill everywhere)
     */
    constructor({ loaded, budget, pool, renderer, uniforms, prefix, capacity, detail = null, warp = null, natural = null }) {
        Object.assign(this, { loaded, budget, pool, renderer, uniforms, prefix, capacity, warp, natural });
        this.manifest = loaded.manifest;
        this.descriptors = new Map(this.manifest.chunks.map(value => [value.id, value]));
        this.columns = loaded.chunk.descriptor.columns;
        this.rows = loaded.chunk.descriptor.rows;
        if (this.manifest.chunks.some(value => value.columns !== this.columns || value.rows !== this.rows)) throw new Error('Appearance mask array requires equal prepared page dimensions');
        this.layout = landscapeCoverageMaskLayout(loaded.chunk.descriptor);
        this.pageBytes = this.layout.pageBytes;
        // largest mask decode reservation: the D1 decode bytes plus one natural-soil page and its fetch buffer while the policy is active
        this.decodeBytes = this.layout.decodeBytes + (natural?.active ? landscapeNaturalSoilTransientBytes(loaded.chunk.descriptor) : 0);
        this.key = `${prefix}/categorical-mask-array`;
        const admission = budget.reserve(this.key, { cpuBytes: this.pageBytes * capacity, gpuBytes: this.pageBytes * capacity, kind: 'appearance-mask-array' });
        if (!admission.admitted) throw new Error(`Minimum appearance mask cannot fit: ${admission.reason}`);
        let detailCapacity = detail?.capacity ?? 0;
        this.detailArrayKey = `${prefix}/surface-detail-array`;
        this.detailDegradation = null;
        if (detailCapacity) {
            const reserved = budget.reserve(this.detailArrayKey, { cpuBytes: this.pageBytes * detailCapacity, gpuBytes: this.pageBytes * detailCapacity, kind: 'appearance-surface-detail-array' });
            if (!reserved.admitted) { this.detailDegradation = `surface-detail-array-${reserved.reason}`; detailCapacity = 0; }
        }
        this.slotCount = capacity + detailCapacity;
        this.pixels = new Uint8Array(this.pageBytes * this.slotCount);
        this.texture = new THREE.DataArrayTexture(this.pixels, this.layout.width, this.layout.height, this.slotCount);
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
        this.nativeMaxLevel = this.manifest.grid.maxLevel;
        this.nativeEpoch = 0;
        this.loadedCount = 0;
        this.evicted = 0;
        this.warpOut = new Float64Array(2);
        this.detail = detailCapacity ? new LandscapeSurfaceDetailPages({ ...detail, masks: this, budget, capacity: detailCapacity, firstSlot: capacity }) : null;
        this.request(this.manifest.overviewId, 0, loaded.chunk.landCover);
    }

    request(id, slot, landCover = null) {
        const descriptor = this.descriptors.get(id);
        const key = `${this.prefix}/mask/${this.manifest.revision}/${id}/${descriptor.channels.landCover.sha256}`;
        // the job reads the natural-soil pages of its same-level owners one at a time, inside this decode reservation
        const owners = this.natural ? landscapeCoverageMaskOwners(this.manifest, descriptor).map(owner => owner.id) : [], natural = this.natural?.describe(owners) ?? null;
        const admission = this.budget.reserve(key, { cpuBytes: this.layout.decodeBytes + (this.natural?.transientBytes(owners) ?? 0), gpuBytes: 0, kind: 'appearance-mask-decode' });
        if (!admission.admitted) { this.degradationReason = admission.reason; return false; }
        const record = { id, kind: 'native', key, descriptor, slot, progress: 0, status: 'loading', pixels: null, soils: [], abort: new AbortController(), sourceRevision: this.manifest.revision, natural: null };
        record.lease = this.budget.shared.acquireLease(key, { consumer: `appearance-mask/${id}`, priority: id === this.manifest.overviewId ? 100 : 40, accuracy: 'approximate' });
        this.records.set(id, record);
        const failure = this.failures.get(id);
        this.pool.request({ type: 'mask', chunkId: id, ...(landCover ? { landCover } : {}), ...(natural ? { natural } : {}) }, { priority: id === this.manifest.overviewId ? 100 : 40, signal: record.abort.signal }).then(result => {
            if (this.disposed || record.abort.signal.aborted || this.records.get(id) !== record) return;
            record.pixels = result.pixels;
            record.soils = result.soils;
            record.sourceIds = result.sourceIds;
            record.sourceRevision = result.sourceRevision;
            record.natural = result.natural ?? null;
            // a fresh native without a published label for a planning sample means the catalog differs from the bake: shown on the fallback, never silently
            if (record.natural?.overviewByReason.unpublished) console.warn(`[Landscape] Natural soil: ${record.natural.overviewByReason.unpublished} planning samples of ${id} have no published label and show the overview infill; re-bake the terrain fields`);
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
        for (const record of [...this.records.values()]) if (isNative(record) && !wanted.has(record.id) && record.status !== 'resident') this.remove(record);
        this.detail?.plan(plan, camera);
    }

    get ready() { return this.records.get(this.manifest.overviewId)?.status === 'resident'; }

    activeChild(record) { return [...this.records.values()].some(value => value.descriptor.parentId === record.id); }

    wants(record) { return isNative(record) ? this.wanted.has(record.id) : this.detail.wanted.has(record.id); }

    updateUniforms() {
        const byPosition = new Map([...this.records.values()].filter(record => record.status === 'resident' || record.status === 'uniform')
            .map(record => [`${record.descriptor.level}/${record.descriptor.column}/${record.descriptor.row}`, record]));
        for (let slot = 0; slot < (this.slotCount ?? this.capacity); slot++) this.uniforms.uMaskMeta.value[slot].set(-1, 0, 0, 0);
        let nativeEnd = 1, detailStart = Infinity, detailEnd = 0;
        for (const record of this.records.values()) {
            if (record.status !== 'resident') continue;
            if (isNative(record)) nativeEnd = Math.max(nativeEnd, record.slot + 1);
            else { detailStart = Math.min(detailStart, record.slot); detailEnd = Math.max(detailEnd, record.slot + 1); }
            const { bounds } = record.descriptor;
            this.uniforms.uMaskBounds.value[record.slot].set(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
            const parentSlot = this.records.get(record.descriptor.parentId)?.slot ?? record.slot;
            this.uniforms.uMaskMeta.value[record.slot].set(record.descriptor.level, record.progress, parentSlot, isNative(record) ? 1 : 2);
            const { level, column, row } = record.descriptor, neighbors = [];
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                if (dc === 0 && dr === 0) continue;
                neighbors.push(neighborProgress(byPosition, this.nativeMaxLevel ?? Infinity, level, column + dc, row + dr));
            }
            record.neighborProgress = neighbors;
            this.uniforms.uMaskNeighbors0.value[record.slot].set(...neighbors.slice(0, 4));
            this.uniforms.uMaskNeighbors1.value[record.slot].set(...neighbors.slice(4));
        }
        this.uniforms.uMaskSlotRanges.value.set(nativeEnd, detailEnd ? detailStart : 0, detailEnd);
    }

    update(dt, uploadAllowance) {
        this.degradationReason = this.capacityLimited ? 'appearance-mask-capacity' : null;
        for (const record of [...this.records.values()].sort((a, b) => b.descriptor.level - a.descriptor.level)) {
            if (record.status !== 'resident' || this.records.get(record.id) !== record) continue;
            if (this.wants(record) || this.activeChild(record)) record.progress = Math.min(1, record.progress + Math.min(dt, .1) / .3);
            else {
                record.progress = Math.max(0, record.progress - Math.min(dt, .1) / .3);
                if (record.progress === 0) this.remove(record);
            }
        }
        const decoded = [...this.records.values()].find(record => isNative(record) && record.status === 'decoded' && (!record.descriptor.parentId || this.records.get(record.descriptor.parentId)?.status === 'resident'));
        const layered = this.slotCount > this.capacity, bytes = this.uploaded || layered ? this.pageBytes : this.pixels.byteLength;
        let uploadedBytes = 0;
        if (decoded && bytes <= uploadAllowance) {
            this.pixels.set(decoded.pixels, decoded.slot * this.pageBytes);
            if (this.uploaded || layered) this.texture.addLayerUpdate(decoded.slot);
            this.texture.needsUpdate = true;
            this.renderer.initTexture(this.texture);
            this.texture.clearLayerUpdates();
            this.uploaded = true;
            decoded.status = 'resident';
            if (!decoded.descriptor.parentId) decoded.progress = 1;
            decoded.pixels = null;
            this.budget.update(decoded.key, { cpuBytes: 0, kind: 'appearance-mask-resident-slot' });
            this.nativeEpoch++;
            uploadedBytes = bytes;
        }
        if (![...this.records.values()].some(record => isNative(record) && record.status !== 'resident')) {
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
        if (this.detail) uploadedBytes += this.detail.update(uploadAllowance - uploadedBytes);
        this.updateUniforms();
        return uploadedBytes;
    }

    best(x, z) {
        return [...this.records.values()].filter(record => isNative(record) && record.status === 'resident' && inside(record.descriptor.bounds, x, z)).sort((a, b) => b.descriptor.level - a.descriptor.level || a.id.localeCompare(b.id))[0];
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

    // world warp and its Jacobian, matching the shader's warped native coverage coordinates and footprint derivatives
    warpAt(x, z) {
        if (!this.warp || this.uniforms.uSurfaceWarpEnabled.value !== 1) return { enabled: false, x: 0, z: 0, jacobian: [1, 0, 0, 1] };
        const at = (px, pz) => { this.warp.evaluate(px, pz, this.warpOut); return [this.warpOut[0], this.warpOut[1]]; };
        const [wx, wz] = at(x, z), east = at(x + WARP_STEP_METERS, z), west = at(x - WARP_STEP_METERS, z), north = at(x, z + WARP_STEP_METERS), south = at(x, z - WARP_STEP_METERS);
        const scale = 1 / (2 * WARP_STEP_METERS);
        return { enabled: true, x: wx, z: wz, jacobian: [1 + (east[0] - west[0]) * scale, (north[0] - south[0]) * scale, (east[1] - west[1]) * scale, 1 + (north[1] - south[1]) * scale] };
    }

    sampleRecord(record, x, z, dx, dy) {
        const { bounds } = record.descriptor, offset = record.slot * this.pageBytes;
        const spacingX = record.descriptor.sampleStride * this.manifest.grid.spacingX, spacingZ = record.descriptor.sampleStride * this.manifest.grid.spacingZ;
        const base = sampleLandscapeSurfaceCoverage({ bounds, columns: this.columns, rows: this.rows, x, z, dx, dy,
            soilCount: this.manifest.soil.catalog.length, soilAt: (column, row) => this.pixels[offset + ((row + this.layout.halo) * this.layout.width + column + this.layout.halo) * 4] >> 4 });
        const result = applyLandscapeContourCoverage(base, { pixels: this.pixels, width: this.layout.width, height: this.layout.height, columns: this.columns, rows: this.rows,
            spacingX, spacingZ, xGrid: (x - bounds.minX) / spacingX, zGrid: (bounds.maxZ - z) / spacingZ, byteOffset: offset, dx, dy });
        return { ...result, spacing: { x: spacingX, z: spacingZ } };
    }

    coverageSample(x, z, { dx = [0, 0], dy = [0, 0] } = {}) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('Coverage sample coordinates must be finite');
        const soilIds = this.manifest.soil.catalog.map(soil => soil.id), fine = this.detail?.best(x, z);
        if (fine) {
            const common = { recipe: LANDSCAPE_SURFACE_COVERAGE.id, maskId: fine.id, sourceIds: fine.sourceIds, level: fine.descriptor.level, soilIds, generated: true, measured: false,
                spacing: { ...fine.descriptor.spacing }, identity: fine.identity, inputs: fine.inputs, detailRecipe: { id: this.detail.recipe.id, hash: this.detail.recipeHash }, seed: this.detail.seed,
                source: fine.source, warp: { enabled: false, baked: true, x: 0, z: 0 }, inspection: 'resident-page-before-hierarchy-transition' };
            if (fine.status === 'uniform') return { ...common, uniform: true, weights: soilIds.map((_, index) => index === fine.soil ? 1 : 0) };
            return { ...this.sampleRecord(fine, x, z, dx, dy), ...common, uniform: false };
        }
        const warp = this.warpAt(x, z), [a, b, c, d] = warp.jacobian, warpedX = x + warp.x, warpedZ = z + warp.z;
        const record = this.best(warpedX, warpedZ);
        if (!record) return null;
        const result = this.sampleRecord(record, warpedX, warpedZ, [a * dx[0] + b * dx[1], c * dx[0] + d * dx[1]], [a * dy[0] + b * dy[1], c * dy[0] + d * dy[1]]);
        return { ...result, recipe: LANDSCAPE_SURFACE_COVERAGE.id, maskId: record.id, sourceIds: record.sourceIds, level: record.descriptor.level,
            sourceRevision: record.sourceRevision, soilIds, inspection: 'resident-page-before-hierarchy-transition', generated: false, measured: true,
            warp: { enabled: warp.enabled, baked: false, x: warp.x, z: warp.z }, warpedPosition: { x: warpedX, z: warpedZ } };
    }

    // every soil of a visible page's resident record (or nearest resident ancestor) leases that page; a fully faded-in visible page lends
    // its projected density to its soils, except a native page the plan splits into fine leaves, whose visible leaves lend their own
    interests(plan) {
        const interests = new Map(), densityBySoil = {}, split = new Set(this.detail ? plan.detail?.splitNativeIds ?? [] : []);
        for (const id of plan.visibleMaskIds) {
            let descriptor = this.descriptors.get(id), record;
            while (descriptor) {
                record = this.records.get(descriptor.id);
                if (record?.status === 'resident') break;
                descriptor = this.descriptors.get(descriptor.parentId);
            }
            if (!record || record.status !== 'resident') continue;
            const density = record.id === id && record.progress === 1 && !split.has(id) ? plan.pixelsPerMeterById[id] : 0;
            for (const index of record.soils) {
                if (!interests.has(index)) interests.set(index, new Set());
                interests.get(index).add(id);
                const soilId = this.manifest.soil.catalog[index].id;
                densityBySoil[soilId] = Math.max(densityBySoil[soilId] ?? 0, density);
            }
        }
        this.detail?.interests(plan, interests, densityBySoil);
        return { interests, densityBySoil };
    }

    remove(record) {
        if (this.records.get(record.id) !== record) return;
        if (!isNative(record)) { this.detail.release(record); return; }
        record.abort.abort();
        record.lease.release();
        record.pixels = null;
        this.records.delete(record.id);
        this.budget.release(record.key);
        this.uniforms.uMaskMeta.value[record.slot].set(-1, 0, 0, 0);
        if (record.status === 'resident') this.nativeEpoch++;
        this.evicted++;
    }

    // planning-only samples of resident native pages (page area only, not halos) by the policy that chose their display soil, per page and summed
    naturalSamples(records) {
        const total = { terrain: 0, overview: 0, overviewByReason: { inactive: 0, stale: 0, unpublished: 0 } }, pages = [];
        for (const record of records) {
            const natural = record.natural;
            if (!natural) continue;
            total.terrain += natural.terrainSamples; total.overview += natural.overviewSamples;
            for (const reason of Object.keys(total.overviewByReason)) total.overviewByReason[reason] += natural.overviewByReason[reason];
            if (natural.terrainSamples || natural.overviewSamples) pages.push({ id: record.id, level: record.descriptor.level, terrain: natural.terrainSamples, overview: natural.overviewSamples,
                overviewByReason: { ...natural.overviewByReason }, naturalPages: [...natural.pages] });
        }
        return { ...total, pages };
    }

    snapshot() {
        const records = [...this.records.values()].filter(isNative);
        const missing = [...this.wanted].some(id => {
            if (this.records.has(id)) return false;
            for (let descriptor = this.descriptors.get(id); descriptor; descriptor = this.descriptors.get(descriptor.parentId)) if ((this.failures.get(descriptor.id)?.attempts ?? 0) >= 2) return false;
            return !this.degradationReason?.includes('budget');
        });
        return { ready: this.ready, pending: records.filter(record => record.status !== 'resident').length,
            missingWork: missing,
            transitioning: records.some(record => record.status === 'resident' && (record.progress !== 1 || !this.wanted.has(record.id))),
            residentMaskIds: records.filter(record => record.status === 'resident').map(record => record.id),
            maskLods: records.filter(record => record.status === 'resident').map(record => ({ id: record.id, level: record.descriptor.level, progress: record.progress, revision: record.sourceRevision })),
            coverage: { ...LANDSCAPE_SURFACE_COVERAGE, maskWidth: this.layout.width, maskHeight: this.layout.height, allocatedMaskBytes: this.pageBytes * this.capacity,
                decodedMaskReservationBytes: this.decodeBytes, contour: LANDSCAPE_CONTOUR_COVERAGE, sourceLimited: this.lastPlan?.sourceLimited ?? false,
                coordinates: 'world-XZ-meters', landscapeId: this.manifest.id, sourceRevision: this.manifest.revision,
                sourceSpacingMeters: { x: this.manifest.grid.spacingX, z: this.manifest.grid.spacingZ },
                soilBindings: this.manifest.soil.catalog.map(soil => ({ soilId: soil.id, materialId: soil.materialId })),
                naturalReference: { policy: this.natural?.active ? LANDSCAPE_NATURAL_TERRAIN_INFERENCE : LANDSCAPE_NATURAL_PRESENTATION, fallbackPolicy: LANDSCAPE_NATURAL_PRESENTATION,
                    id: this.manifest.overviewId, sha256: this.loaded.chunk.descriptor.channels.landCover.sha256, spacingMeters: this.loaded.chunk.descriptor.sampleStride * this.manifest.grid.spacingX,
                    terrainRevision: this.natural?.revision ?? null, maskDecodeBytes: { layout: this.layout.decodeBytes, naturalPages: this.decodeBytes - this.layout.decodeBytes } },
                naturalSamples: this.naturalSamples(records.filter(record => record.status === 'resident')),
                residentDependencies: records.filter(record => record.status === 'resident').map(record => ({ id: record.id, sourceIds: record.sourceIds })),
                allocatedArrayBytes: this.pixels.byteLength, arrayLayers: this.slotCount },
            wantedMaskIds: [...this.wanted], capacity: this.capacity, errors: [...this.failures.values()], loaded: this.loadedCount, evicted: this.evicted, degradationReason: this.degradationReason,
            detail: this.detail?.snapshot() ?? null };
    }

    dispose() {
        this.disposed = true;
        this.detail?.dispose();
        for (const record of [...this.records.values()]) this.remove(record);
        this.texture.dispose();
        this.texture.image.data = null;
        this.texture = null;
        this.pixels = null;
        this.budget.release(this.key);
        this.budget.release(this.detailArrayKey);
    }
}
