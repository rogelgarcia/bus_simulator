// Samples the fixed NW-SE height triangulation and creates provisional AI context.
// @ts-check
import { landscapeWorldToGrid } from './LandscapeCoordinates.js';
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId } from './internal/LandscapeValidation.js';

/** @param {import('./LandscapeManifest.js').LandscapeManifest} manifest @param {import('./LandscapePayload.js').LandscapeChunk} chunk @param {number} x @param {number} z @returns {object} */
export function sampleLandscapeChunk(manifest, chunk, x, z) {
    const nativeSample = landscapeWorldToGrid(manifest, x, z);
    const identity = { landscapeId: manifest.id, revision: manifest.revision };
    if (nativeSample.status === 'outside') return { status: 'outside', ...identity };
    const descriptor = chunk.descriptor;
    requireCondition(manifest.chunks.some((entry) => entry.id === descriptor.id && entry.revision === descriptor.revision), 'chunk identity/revision does not belong to this manifest');
    requireCondition(chunk.heights instanceof Float32Array && chunk.landCover instanceof Uint8Array && chunk.heights.length === descriptor.columns * descriptor.rows && chunk.landCover.length === chunk.heights.length, 'chunk has invalid decoded arrays');
    const { minX, maxX, minZ, maxZ } = descriptor.bounds;
    if (x < minX || x > maxX || z < minZ || z > maxZ) return { status: 'unavailable', ...identity, reason: 'point-is-not-in-this-chunk' };
    const spacingX = manifest.grid.spacingX * descriptor.sampleStride;
    const spacingZ = manifest.grid.spacingZ * descriptor.sampleStride;
    const column = Math.min(descriptor.columns - 1, Math.max(0, (x - minX) / spacingX));
    const row = Math.min(descriptor.rows - 1, Math.max(0, (maxZ - z) / spacingZ));
    const c = Math.min(descriptor.columns - 2, Math.floor(column));
    const r = Math.min(descriptor.rows - 2, Math.floor(row));
    const u = column - c;
    const v = row - r;
    const a = chunk.heights[r * descriptor.columns + c];
    const b = chunk.heights[r * descriptor.columns + c + 1];
    const sw = chunk.heights[(r + 1) * descriptor.columns + c];
    const d = chunk.heights[(r + 1) * descriptor.columns + c + 1];
    const du = u >= v ? b - a : d - sw;
    const dv = u >= v ? d - b : sw - a;
    const height = a + du * u + dv * v;
    const dx = du / spacingX;
    const dz = -dv / spacingZ;
    const normalLength = Math.hypot(dx, 1, dz);
    const landCoverId = chunk.landCover[Math.round(row) * descriptor.columns + Math.round(column)];
    const soilId = manifest.soil.landCoverMapping.find((entry) => entry.landCoverId === landCoverId)?.soilId;
    requireCondition(Number.isFinite(height) && !!soilId, 'chunk contains invalid height/land-cover data');
    const provisional = descriptor.sampleStride !== 1;
    return {
        status: 'ready', ...identity, chunkId: descriptor.id,
        accuracy: provisional ? 'approximate' : 'authoritative', provisional,
        position: { x, y: height, z }, height,
        normal: { x: -dx / normalLength, y: 1 / normalLength, z: -dz / normalLength },
        slopeDegrees: Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI,
        soilId, landCoverId, sampleSpacing: { x: spacingX, z: spacingZ },
        nativeSample: { column: nativeSample.column, row: nativeSample.row },
        seaLevel: manifest.coordinates.seaLevel,
        waterDepth: Math.max(0, manifest.coordinates.seaLevel - height), submerged: height < manifest.coordinates.seaLevel
    };
}

/** @param {import('./LandscapeManifest.js').LandscapeManifest} manifest @param {import('./LandscapePayload.js').LandscapeChunk} chunk @param {{x:number,z:number,selectionId:string,radius?:number,camera?:object}} options @returns {object} */
export function createLandscapeSelectionContext(manifest, chunk, { x, z, selectionId, radius, camera }) {
    requireId(selectionId, 'selectionId');
    const sample = sampleLandscapeChunk(manifest, chunk, x, z);
    requireCondition(sample.status === 'ready', `cannot select terrain with status ${sample.status}`);
    let region = { type: 'point', x, z };
    if (radius !== undefined) {
        requireFinite(radius, 'selection radius');
        requireCondition(radius > 0 && radius <= Math.max(manifest.bounds.maxX - manifest.bounds.minX, manifest.bounds.maxZ - manifest.bounds.minZ), 'selection radius must be positive and bounded by the landscape span');
        requireCondition(x - radius >= manifest.bounds.minX && x + radius <= manifest.bounds.maxX && z - radius >= manifest.bounds.minZ && z + radius <= manifest.bounds.maxZ, 'selection circle exceeds landscape bounds');
        region = { type: 'circle', center: { x, z }, radius };
    }
    return freezeData({
        format: 'landscape-selection', schemaVersion: 1,
        landscapeId: manifest.id, sourceRevision: manifest.revision, selectionId,
        coordinates: 'world-x-east-y-up-z-north-meters', position: sample.position,
        region, sample, provisional: sample.provisional,
        editingReady: !sample.provisional,
        ...(camera === undefined ? {} : { camera: clonePlainData(camera, 'camera') })
    });
}
