// Acquires only bounded native regions for camera-independent queries and edit inputs.
// @ts-check
import { createLandscapeChunkId } from './LandscapeManifest.js';
import { sampleLandscapeChunk } from './LandscapeSampling.js';
import { landscapeRegionBounds, landscapeRegionContains, landscapeRegionIntersectsBounds, validateLandscapeRegion } from './LandscapeRegions.js';
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId, requireInteger } from './internal/LandscapeValidation.js';

export const LANDSCAPE_MAX_NATIVE_CHUNKS = 4;
export const LANDSCAPE_QUERY_BYTE_LIMIT = 2 * 1024 * 1024;

/** @typedef {{readChunk:(id:string,options:{signal?:AbortSignal})=>Promise<import('./LandscapePayload.js').LandscapeChunk>,signal?:AbortSignal,maxNativeChunks?:number,maxDecodedBytes?:number}} LandscapeAcquisitionOptions */

function pointChunkId(manifest, x, z) {
    const grid = manifest.grid;
    const count = 2 ** grid.maxLevel;
    const column = Math.min(count - 1, Math.floor((x - manifest.bounds.minX) / (grid.spacingX * grid.chunkIntervals)));
    const row = Math.min(count - 1, Math.floor((manifest.bounds.maxZ - z) / (grid.spacingZ * grid.chunkIntervals)));
    return createLandscapeChunkId(grid.maxLevel, column, row);
}

/** @param {import('./LandscapeManifest.js').LandscapeManifest} manifest @param {import('./LandscapeRegions.js').LandscapeRegion} input @param {{maxNativeChunks?:number,maxDecodedBytes?:number}} [options] @returns {object} */
export function planLandscapeRegion(manifest, input, { maxNativeChunks = LANDSCAPE_MAX_NATIVE_CHUNKS, maxDecodedBytes = LANDSCAPE_QUERY_BYTE_LIMIT } = {}) {
    const region = validateLandscapeRegion(input);
    requireInteger(maxNativeChunks, 1, LANDSCAPE_MAX_NATIVE_CHUNKS, 'maxNativeChunks');
    requireFinite(maxDecodedBytes, 'maxDecodedBytes');
    requireCondition(maxDecodedBytes > 0 && maxDecodedBytes <= LANDSCAPE_QUERY_BYTE_LIMIT, 'query decoded budget must be positive and at most 2 MiB');
    const bounds = landscapeRegionBounds(region);
    if (bounds.minX < manifest.bounds.minX || bounds.maxX > manifest.bounds.maxX || bounds.minZ < manifest.bounds.minZ || bounds.maxZ > manifest.bounds.maxZ) {
        return freezeData({ status: 'outside', region, bounds, chunkIds: [], decodedBytes: 0 });
    }
    const chunks = region.type === 'point'
        ? [manifest.chunks.find((chunk) => chunk.id === pointChunkId(manifest, region.x, region.z))]
        : manifest.chunks.filter((chunk) => chunk.level === manifest.grid.maxLevel && landscapeRegionIntersectsBounds(region, chunk.bounds));
    requireCondition(chunks.every(Boolean) && chunks.length > 0, 'native region coverage is unavailable in the manifest');
    requireCondition(chunks.length <= maxNativeChunks, `region needs ${chunks.length} native chunks; D2 limit is ${maxNativeChunks}; reduce the selection footprint`);
    const decodedBytes = chunks.reduce((sum, chunk) => sum + chunk.channels.height.decodedByteLength + chunk.channels.landCover.decodedByteLength, 0);
    requireCondition(decodedBytes <= maxDecodedBytes, `region needs ${decodedBytes} decoded bytes; budget ${maxDecodedBytes}`);
    return freezeData({ status: 'ready', region, bounds, chunkIds: chunks.map((chunk) => chunk.id), decodedBytes });
}

/** @param {import('./LandscapeManifest.js').LandscapeManifest} manifest @param {import('./LandscapePayload.js').LandscapeChunk} chunk @param {{nativeOnly?:boolean}} [options] @returns {void} */
export function validateAcquiredLandscapeChunk(manifest, chunk, { nativeOnly = true } = {}) {
    const descriptor = manifest.chunks.find((entry) => entry.id === chunk?.descriptor?.id);
    requireCondition(!!descriptor && (!nativeOnly || descriptor.level === manifest.grid.maxLevel) && descriptor.revision === chunk.descriptor.revision, 'acquired chunk identity/revision is stale or invalid');
    for (const key of ['level', 'column', 'row', 'startColumn', 'startRow', 'sampleStride', 'columns', 'rows']) requireCondition(descriptor[key] === chunk.descriptor[key], `acquired chunk has invalid ${key}`);
    for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) requireCondition(descriptor.bounds[key] === chunk.descriptor.bounds[key], `acquired chunk has invalid bounds.${key}`);
    for (const channel of ['height', 'landCover']) requireCondition(descriptor.channels[channel].sha256 === chunk.descriptor.channels?.[channel]?.sha256, `acquired ${channel} content does not match manifest`);
    const count = descriptor.columns * descriptor.rows;
    requireCondition(chunk.heights instanceof Float32Array && chunk.landCover instanceof Uint8Array && chunk.heights.length === count && chunk.landCover.length === count, 'acquired native chunk has invalid arrays');
    const known = new Set(manifest.landCover.catalog.map((entry) => entry.id));
    for (let i = 0; i < count; i++) requireCondition(Number.isFinite(chunk.heights[i]) && chunk.heights[i] >= descriptor.minHeight && chunk.heights[i] <= descriptor.maxHeight && known.has(chunk.landCover[i]), `acquired native chunk ${descriptor.id} contains invalid sample ${i}`);
}

/** @param {Array<import('./LandscapePayload.js').LandscapeChunk>} chunks @returns {void} */
export function validateLandscapeNativeSeams(chunks) {
    for (let a = 0; a < chunks.length; a++) for (let b = a + 1; b < chunks.length; b++) {
        const first = chunks[a];
        const second = chunks[b];
        const f = first.descriptor;
        const s = second.descriptor;
        const minColumn = Math.max(f.startColumn, s.startColumn);
        const maxColumn = Math.min(f.startColumn + f.columns - 1, s.startColumn + s.columns - 1);
        const minRow = Math.max(f.startRow, s.startRow);
        const maxRow = Math.min(f.startRow + f.rows - 1, s.startRow + s.rows - 1);
        for (let row = minRow; row <= maxRow; row++) for (let column = minColumn; column <= maxColumn; column++) {
            const i = (row - f.startRow) * f.columns + column - f.startColumn;
            const j = (row - s.startRow) * s.columns + column - s.startColumn;
            requireCondition(Object.is(first.heights[i], second.heights[j]) && first.landCover[i] === second.landCover[j], `native seam mismatch ${f.id}/${s.id} at column ${column}, row ${row}`);
        }
    }
}

/** @param {import('./LandscapeManifest.js').LandscapeManifest} manifest @param {import('./LandscapeRegions.js').LandscapeRegion} region @param {LandscapeAcquisitionOptions} options @returns {Promise<object>} */
export async function acquireLandscapeRegion(manifest, region, { readChunk, signal, ...limits }) {
    const plan = planLandscapeRegion(manifest, region, limits);
    requireCondition(typeof readChunk === 'function', 'readChunk is required');
    if (plan.status === 'outside') return plan;
    const chunks = new Map();
    let released = false;
    const release = () => { chunks.clear(); released = true; };
    try {
        for (const id of plan.chunkIds) {
            signal?.throwIfAborted();
            const chunk = await readChunk(id, { signal });
            signal?.throwIfAborted();
            validateAcquiredLandscapeChunk(manifest, chunk);
            chunks.set(id, chunk);
        }
        validateLandscapeNativeSeams([...chunks.values()]);
    } catch (error) {
        release();
        return freezeData({ status: 'unavailable', accuracy: 'authoritative', reason: error.name === 'AbortError' ? 'canceled' : error.message, chunkIds: plan.chunkIds, decodedBytes: 0 });
    }
    return Object.freeze({
        get status() { return released ? 'unavailable' : 'ready'; },
        accuracy: 'authoritative', region: plan.region, bounds: plan.bounds,
        chunkIds: plan.chunkIds,
        get decodedBytes() { return released ? 0 : plan.decodedBytes; },
        sample(x, z) {
            requireFinite(x, 'sample x');
            requireFinite(z, 'sample z');
            if (released) return { status: 'unavailable', reason: 'region-released' };
            if (!landscapeRegionContains(plan.region, x, z)) return { status: 'unavailable', reason: 'outside-acquired-region' };
            const chunk = chunks.get(pointChunkId(manifest, x, z));
            requireCondition(!!chunk, 'acquired region has missing native point coverage');
            return sampleLandscapeChunk(manifest, chunk, x, z);
        },
        release
    });
}

/** @param {import('./LandscapeManifest.js').LandscapeManifest} manifest @param {{x:number,z:number,selectionId:string,radius?:number,expectedRevision:string,camera?:object}} selection @param {LandscapeAcquisitionOptions} options @returns {Promise<object>} */
export async function queryLandscapeSelection(manifest, selection, options) {
    requireCondition(selection.expectedRevision === manifest.revision, `stale selection: expected ${selection.expectedRevision}, current ${manifest.revision}`);
    requireFinite(selection.x, 'selection.x');
    requireFinite(selection.z, 'selection.z');
    requireId(selection.selectionId, 'selectionId');
    const camera = selection.camera === undefined ? undefined : clonePlainData(selection.camera, 'camera');
    const radius = selection.radius ?? 0;
    requireFinite(radius, 'selection.radius');
    requireCondition(radius >= 0, 'selection.radius must not be negative');
    const region = radius > 0 ? { type: 'circle', center: { x: selection.x, z: selection.z }, radius } : { type: 'point', x: selection.x, z: selection.z };
    const acquired = await acquireLandscapeRegion(manifest, region, options);
    requireCondition(acquired.status === 'ready', `authoritative selection ${acquired.status}: ${acquired.reason ?? 'outside landscape'}`);
    try {
        const sample = acquired.sample(selection.x, selection.z);
        const context = {
            format: 'landscape-selection', schemaVersion: 1,
            landscapeId: manifest.id, sourceRevision: manifest.revision, selectionId: selection.selectionId,
            coordinates: 'world-x-east-y-up-z-north-meters', position: sample.position,
            region, sample, provisional: false, editingReady: true,
            acquisition: {
                status: 'ready', accuracy: 'authoritative', sourceRevision: manifest.revision,
                chunkIds: acquired.chunkIds, decodedBytes: acquired.decodedBytes,
                revisions: acquired.chunkIds.map((id) => ({ id, revision: manifest.chunks.find((chunk) => chunk.id === id).revision })),
                nativeSpacing: { x: manifest.grid.spacingX, z: manifest.grid.spacingZ },
                releasedAfterQuery: true
            },
            ...(camera === undefined ? {} : { camera })
        };
        return freezeData(context);
    } finally {
        acquired.release();
    }
}
