// Plans the ecosystem streamer's work per frame (AI 599 D3): the sidecar address, the camera frustum, the desired cells of a layer inside its view disc and the rank-prefix admission of a tile under the share.
// @ts-check
// Design: every decision the streamer takes is a pure function of plain data here (no three, no DOM), so the Node tests cover the planning math
// and the degradation arithmetic without a browser. The frustum planes are extracted from the camera's view-projection product exactly as three's
// Frustum does (Gribb-Hartmann, normalized) and a cell is tested the way the terrain planner tests a chunk: its box over a height range, grown by a
// margin, against every plane. A layer's desired cells are the cells whose boxes meet the disc of its view distance around the camera's ground
// position, inside the landscape bounds and in view, nearest first; a resident cell stays until it leaves the disc grown by the keep hysteresis.
import { LANDSCAPE_ATTACHMENT_KINDS } from '../../../../app/landscape/LandscapeManifest.js';
import { landscapeTerrainFieldsLayout } from '../../../../app/landscape/LandscapeTerrainFields.js';
import { landscapeGeologyLayout } from '../../../../app/landscape/LandscapeGeology.js';
import { ECOSYSTEM_RECORD, ECOSYSTEM_TILE_BYTES_PER_INSTANCE, ecosystemCellBounds, ecosystemTileId } from '../../../../app/landscape/ecosystem/EcosystemTiles.js';
import { ecosystemCellsIntersecting } from '../../../../app/landscape/ecosystem/EcosystemLattice.js';
import { LANDSCAPE_ECOSYSTEM } from './LandscapeEcosystemModel.js';

const UNBOUNDED_HEIGHTS = Object.freeze([-1e4, 1e4]), ZERO = Object.freeze({ cpuBytes: 0, gpuBytes: 0 });
const finite = (value, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`[LandscapeEcosystem] ${label} must be a finite number; received ${String(value)}`);
    return value;
};

/**
 * The ecosystem sidecar address of a loaded landscape: the option's URL, else the manifest attachment of kind landscape-ecosystem, else the sidecar
 * beside the landscape manifest (a pinned manifest.<sha>.json snapshot resolves to the same directory); null when the option is off.
 * @param {string} manifestUrl @param {{attachments?:ReadonlyArray<{kind:string,url:string}>}} manifest @param {{mode:string,url:string|null}} option
 */
export function landscapeEcosystemUrl(manifestUrl, manifest, option) {
    if (typeof manifestUrl !== 'string' || !manifestUrl) throw new Error('[LandscapeEcosystem] The sidecar address needs the landscape manifest URL');
    if (option.mode === 'off') return null;
    if (option.mode === 'url') return new URL(/** @type {string} */ (option.url), manifestUrl).href;
    const attachment = (manifest?.attachments ?? []).find(entry => entry.kind === LANDSCAPE_ATTACHMENT_KINDS[0]);
    return new URL(attachment ? attachment.url : LANDSCAPE_ECOSYSTEM.sidecar, manifestUrl).href;
}

/**
 * The six frustum planes of a camera from its column-major projection and view (world inverse) matrices, each `{x, y, z, w}` with a unit normal so a
 * signed distance is `n . p + w` (three's Frustum.setFromProjectionMatrix order: right, left, bottom, top, far, near).
 * @param {ArrayLike<number>} projection @param {ArrayLike<number>} view
 */
export function ecosystemFrustumPlanes(projection, view) {
    if (projection?.length !== 16 || view?.length !== 16) throw new Error('[LandscapeEcosystem] frustum planes need two 4x4 column-major matrices');
    const m = new Float64Array(16);
    for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += projection[k * 4 + row] * view[column * 4 + k];
        m[column * 4 + row] = sum;
    }
    const plane = (x, y, z, w) => { const length = Math.hypot(x, y, z) || 1; return Object.freeze({ x: x / length, y: y / length, z: z / length, w: w / length }); };
    return Object.freeze([plane(m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]), plane(m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]),
        plane(m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]), plane(m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]),
        plane(m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]), plane(m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14])]);
}

/**
 * Whether a box (cell bounds over a height range) grown by a margin meets every plane: the terrain planner's test (the farthest corner along each normal).
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds @param {readonly number[]} heightRange @param {ReadonlyArray<{x:number,y:number,z:number,w:number}>} planes @param {number} [margin]
 */
export function ecosystemBoxVisible(bounds, heightRange, planes, margin = 0) {
    return planes.every(plane => plane.x * (plane.x >= 0 ? bounds.maxX : bounds.minX) + plane.y * (plane.y >= 0 ? heightRange[1] : heightRange[0]) + plane.z * (plane.z >= 0 ? bounds.maxZ : bounds.minZ) + plane.w + margin >= 0);
}

/** Horizontal distance from a point to a cell's box (0 inside). @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds @param {number} x @param {number} z */
export function ecosystemCellDistance(bounds, x, z) {
    return Math.hypot(Math.max(0, bounds.minX - x, x - bounds.maxX), Math.max(0, bounds.minZ - z, z - bounds.maxZ));
}

/**
 * The desired cells of a layer: the cells whose boxes meet the view disc around the camera's ground position, inside the landscape bounds, admitted by
 * `include` (an offline layer's published, fresh cells) and in the frustum when planes are given, nearest first (ties by cell z then x). The keep radius
 * is the disc grown by the hysteresis: a cell beyond it is evicted, a cell between the two stays resident but is never fetched.
 * @param {{layer:any,cameraX:number,cameraZ:number,landscapeBounds:{minX:number,maxX:number,minZ:number,maxZ:number},planes?:ReadonlyArray<any>|null,heightRangeOf?:((cellX:number,cellZ:number)=>readonly number[])|null,
 *   margin?:number,include?:((id:string,cellX:number,cellZ:number)=>boolean)|null,keepHysteresis?:number}} options
 * @returns {{desired:ReadonlyArray<Readonly<{id:string,cellX:number,cellZ:number,bounds:any,distance:number}>>,viewRadius:number,keepRadius:number,candidates:number}}
 */
export function planEcosystemLayerCells({ layer, cameraX, cameraZ, landscapeBounds, planes = null, heightRangeOf = null, margin = 0, include = null, keepHysteresis = LANDSCAPE_ECOSYSTEM.streaming.keepHysteresis }) {
    const radius = finite(layer?.viewDistanceMeters, 'the layer view distance'), x = finite(cameraX, 'the camera x'), z = finite(cameraZ, 'the camera z');
    if (!(finite(keepHysteresis, 'the keep hysteresis') >= 1)) throw new Error('[LandscapeEcosystem] The keep hysteresis must be at least 1');
    const b = landscapeBounds, square = { minX: Math.max(b.minX, x - radius), maxX: Math.min(b.maxX, x + radius), minZ: Math.max(b.minZ, z - radius), maxZ: Math.min(b.maxZ, z + radius) };
    const desired = [];
    let candidates = 0;
    if (square.maxX >= square.minX && square.maxZ >= square.minZ) for (const cell of ecosystemCellsIntersecting(layer, square)) {
        const bounds = ecosystemCellBounds(layer.cell.meters, cell.cellX, cell.cellZ);
        // a cell touching the landscape only along its far edge (maxX === bounds.minX) owns no native sample and is never generated
        if (bounds.minX >= b.maxX || bounds.minZ >= b.maxZ || bounds.maxX <= b.minX || bounds.maxZ <= b.minZ) continue;
        const distance = ecosystemCellDistance(bounds, x, z);
        if (distance > radius) continue;
        candidates++;
        const id = ecosystemTileId(layer.id, cell.cellX, cell.cellZ);
        if (include && !include(id, cell.cellX, cell.cellZ)) continue;
        if (planes && !ecosystemBoxVisible(bounds, heightRangeOf ? heightRangeOf(cell.cellX, cell.cellZ) : UNBOUNDED_HEIGHTS, planes, margin)) continue;
        desired.push(Object.freeze({ id, cellX: cell.cellX, cellZ: cell.cellZ, bounds, distance }));
    }
    desired.sort((a, c) => a.distance - c.distance || a.cellZ - c.cellZ || a.cellX - c.cellX);
    return { desired: Object.freeze(desired), viewRadius: radius, keepRadius: radius * keepHysteresis, candidates };
}

/** The share bytes of a tile of `count` instances: records and ids on the CPU, records on the GPU. @param {number} count */
export function ecosystemTileBytes(count) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`[LandscapeEcosystem] A tile byte count needs a nonnegative integer instance count; received ${String(count)}`);
    return Object.freeze({ cpuBytes: count * ECOSYSTEM_TILE_BYTES_PER_INSTANCE, gpuBytes: count * ECOSYSTEM_RECORD.bytes });
}

/** The provisional reservation of a runtime cell before its count is known: a fraction of its lattice sites. @param {{cell:{sitesPerAxis:number}}} layer @param {number} [fraction] */
export function ecosystemRuntimeEstimate(layer, fraction = LANDSCAPE_ECOSYSTEM.streaming.runtimeEstimateFraction) {
    return ecosystemTileBytes(Math.max(1, Math.ceil(layer.cell.sitesPerAxis ** 2 * finite(fraction, 'the runtime estimate fraction'))));
}

/** The room a share has left: its limits less its own accounting (plus a reservation being replaced). @param {{cpuBytes:number,gpuBytes:number,limits:{cpuBytes:number,gpuBytes:number}}} share @param {{cpuBytes:number,gpuBytes:number}} [replacing] */
export function ecosystemShareAvailable(share, replacing = { cpuBytes: 0, gpuBytes: 0 }) {
    return Object.freeze({ cpuBytes: Math.max(0, share.limits.cpuBytes - share.cpuBytes + replacing.cpuBytes), gpuBytes: Math.max(0, share.limits.gpuBytes - share.gpuBytes + replacing.gpuBytes) });
}

/**
 * The rank prefix of a tile the available room admits: the whole tile when it fits, otherwise the longest prefix whose bytes fit on both sides, with
 * the side that bounds it as the degradation reason (ecosystem-cpu-budget or ecosystem-gpu-budget); zero instances when not even one fits.
 * @param {{count:number,available:{cpuBytes:number,gpuBytes:number}}} options
 * @returns {Readonly<{admitted:number,fraction:number,reason:string|null,cpuBytes:number,gpuBytes:number}>}
 */
export function ecosystemTileAdmission({ count, available }) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`[LandscapeEcosystem] A tile admission needs a nonnegative integer instance count; received ${String(count)}`);
    const byCpu = Math.floor(finite(available.cpuBytes, 'the available CPU bytes') / ECOSYSTEM_TILE_BYTES_PER_INSTANCE), byGpu = Math.floor(finite(available.gpuBytes, 'the available GPU bytes') / ECOSYSTEM_RECORD.bytes);
    const admitted = Math.max(0, Math.min(count, byCpu, byGpu)), bytes = ecosystemTileBytes(admitted);
    const reason = admitted >= count ? null : byCpu <= byGpu ? 'ecosystem-cpu-budget' : 'ecosystem-gpu-budget';
    return Object.freeze({ admitted, fraction: count === 0 ? 1 : admitted / count, reason, cpuBytes: bytes.cpuBytes, gpuBytes: bytes.gpuBytes });
}

/** The [min, max] of the anchor heights of a tile's records (the fallback for an empty tile). @param {Float32Array} records @param {number} count @param {number} fallback */
export function ecosystemTileHeightRange(records, count, fallback) {
    if (count === 0) return [fallback, fallback];
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < count; i++) { const y = records[i * ECOSYSTEM_RECORD.floats + ECOSYSTEM_RECORD.y]; if (y < low) low = y; if (y > high) high = y; }
    return [low, high];
}

/** The declared capacity of the worker's caches (native chunks, field and geology pages with their label pages, generated cells), reserved once in the share. @param {any} manifest @param {any} recipe */
export function ecosystemWorkerCacheBytes(manifest, recipe) {
    const streaming = LANDSCAPE_ECOSYSTEM.streaming, samples = manifest.grid.chunkIntervals + 1, chunkBytes = samples * samples * 5, geology = landscapeGeologyLayout(samples), cache = streaming.workerCache;
    const pageBytes = landscapeTerrainFieldsLayout(samples).pageBytes + samples * samples + geology.pageBytes + geology.categorical.byteLength;
    const cellBytes = Math.max(0, ...Object.values(recipe.layers).map(layer => layer.cell.sitesPerAxis ** 2 * ECOSYSTEM_TILE_BYTES_PER_INSTANCE * cache.cellFraction));
    return streaming.workers * (cache.chunks * chunkBytes + cache.pages * pageBytes + cache.cells * Math.ceil(cellBytes));
}

/** How a sidecar binds the loaded landscape: the terrain revisions, the natives that changed, the field and geology revisions it depends on and whether the planning references match. */
export function ecosystemBinding(sidecar, manifest, staleness, planning) {
    const planningSha256s = [...new Set((planning?.dependency ?? []).map(entry => entry.sha256))].sort();
    return Object.freeze({ landscapeId: sidecar.landscapeId, terrainRevision: sidecar.terrain.revision, currentTerrainRevision: manifest.revision, bound: staleness?.bound ?? sidecar.terrain.revision === manifest.revision, staleChunks: staleness?.staleChunks.length ?? 0,
        fieldsRevision: sidecar.dependencies.fieldsRevision, geologyRevision: sidecar.dependencies.geologyRevision, planningBound: planning === null ? null : planningSha256s.join(',') === sidecar.dependencies.planningSha256s.join(',') });
}

/** An ecosystem handle that holds nothing and says why (absent, stale, unbound, invalid, denied or failed sidecars): the streamer's contract with every method inert. */
export function createInertEcosystemStreamer({ status, reason, url, landscape, planning, loadMs, sidecar = null }) {
    const snapshot = Object.freeze({ recipe: LANDSCAPE_ECOSYSTEM.id, status, reason, url, present: false, revision: sidecar?.revision ?? null, recipeId: sidecar?.recipe.id ?? null, recipeIdentity: sidecar?.dependencies.recipeIdentity ?? null,
        binding: sidecar ? ecosystemBinding(sidecar, landscape.manifest, null, planning) : null, settled: true, layers: [], resident: 0, pending: 0, residentInstances: 0, drawnInstances: 0, standing: ZERO, uploadedBytesPerFrame: 0, peakUploadedBytesPerFrame: 0, degradationReason: null,
        runtime: null, worker: null, determinism: [], invalidations: 0, densityScale: { offline: sidecar?.densityScale ?? null, runtime: null }, overrides: null, timing: null, errors: [], loadMs, residentIds: [] });
    const refuse = () => Promise.reject(new Error(`[LandscapeEcosystem] no ecosystem is active (${status}: ${reason})`));
    return Object.freeze({ status, reason, url, renderer: null, assets: null, recipe: null, sidecar, update() { return 0; }, setOverrides() { return Promise.resolve(snapshot); }, setDensityScale() {}, setLayerVisible() {}, evictTile() { return false; },
        trace: refuse, hashCell: refuse, tileSummary() { return Promise.resolve(null); }, heatmap() { return { layerId: null, cellMeters: null, cells: [] }; }, snapshot() { return snapshot; }, dispose() {} });
}
