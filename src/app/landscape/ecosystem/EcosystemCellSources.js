// Turns in-memory landscape data (native chunks, field, soil and geology pages, planning features, neighbouring layers) into the ecosystem input sources of one cell and its halo.
// @ts-check
// Design: the Node bake and the browser worker hand the same decoded pages to this module and get the same inputs, byte for byte. Ownership is
// explicit: a position belongs to the native chunk and page whose column and row are `min(count − 1, floor((x − minX) / chunkMeters))` and
// `min(count − 1, floor((maxZ − z) / chunkMeters))`, so the east and south neighbours own shared borders exactly as the acquisition API does.
// Cover distances are an exact Euclidean distance transform (Felzenszwalb & Huttenlocher 2004) of each cover class over the native samples of the
// cell grown by the cover halo, computed once per cell and class, sampled at the nearest native sample and saturated at the halo so the value is a
// pure function of the position; layer distances saturate at the generation halo for the same reason.
import { createLandscapeChunkId } from '../LandscapeManifest.js';
import { sampleLandscapeChunk } from '../LandscapeSampling.js';
import { landscapeRegionContains, landscapeRegionSignedDistance } from '../LandscapeRegions.js';
import { decodeLandscapeTerrainFields, sampleLandscapeTerrainFieldPage, sampleLandscapeTerrainNaturalSoil } from '../LandscapeTerrainFields.js';
import { sampleLandscapeGeologyCategory, sampleLandscapeGeologyPage } from '../LandscapeGeology.js';
import { requireCondition, requireFinite } from '../internal/LandscapeValidation.js';
import { ECOSYSTEM_DISTANCE_CAP } from './EcosystemRules.js';
import { ECOSYSTEM_RECORD, ecosystemCellBounds } from './EcosystemTiles.js';
import { ecosystemGrownBounds } from './EcosystemLattice.js';

/** Halo of the cover distance transform in metres: `distance.cover.*` is exact up to this distance and saturates there. */
export const ECOSYSTEM_COVER_DISTANCE_METERS = 40;
const FAR = 1e12;

/** Native chunk ids (level maxLevel) whose owned area intersects closed bounds, row-major; empty when the bounds miss the landscape. @param {any} manifest validated @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds */
export function ecosystemNativeChunkIds(manifest, bounds) {
    const grid = manifest.grid, count = 2 ** grid.maxLevel, chunkX = grid.spacingX * grid.chunkIntervals, chunkZ = grid.spacingZ * grid.chunkIntervals, b = manifest.bounds;
    if (bounds.maxX < b.minX || bounds.minX > b.maxX || bounds.maxZ < b.minZ || bounds.minZ > b.maxZ) return [];
    const clamp = value => Math.min(count - 1, Math.max(0, value)), ids = [];
    const minColumn = clamp(Math.floor((Math.max(bounds.minX, b.minX) - b.minX) / chunkX)), maxColumn = clamp(Math.floor((Math.min(bounds.maxX, b.maxX) - b.minX) / chunkX));
    const minRow = clamp(Math.floor((b.maxZ - Math.min(bounds.maxZ, b.maxZ)) / chunkZ)), maxRow = clamp(Math.floor((b.maxZ - Math.max(bounds.minZ, b.minZ)) / chunkZ));
    for (let row = minRow; row <= maxRow; row++) for (let column = minColumn; column <= maxColumn; column++) ids.push(createLandscapeChunkId(grid.maxLevel, column, row));
    return ids;
}

/**
 * What one cell needs in memory: its bounds grown by the larger of the generation halo and the cover halo, and the native chunks (and pages) owning them.
 * @param {any} manifest validated @param {any} layer @param {number} cellX @param {number} cellZ @param {number} haloMeters @param {number} [coverDistanceMeters]
 */
export function ecosystemCellRequirements(manifest, layer, cellX, cellZ, haloMeters, coverDistanceMeters = ECOSYSTEM_COVER_DISTANCE_METERS) {
    requireFinite(haloMeters, 'haloMeters'); requireCondition(haloMeters >= 0, 'haloMeters must not be negative');
    const bounds = ecosystemGrownBounds(ecosystemCellBounds(layer.cell.meters, cellX, cellZ), Math.max(haloMeters, coverDistanceMeters));
    return { bounds, chunkIds: ecosystemNativeChunkIds(manifest, bounds) };
}

// one-dimensional squared distance transform (lower envelope of parabolas) over `n` values of `f` read at stride `stride`
function distanceTransform1d(f, offset, stride, n, d, v, z) {
    let k = 0;
    v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
        const fq = f[offset + q * stride] + q * q;
        let s = (fq - (f[offset + v[k] * stride] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) { k--; s = (fq - (f[offset + v[k] * stride] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
        k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[offset + v[k] * stride]; }
}

/** Exact squared Euclidean distance (in samples) of every grid sample to the nearest marked sample; FAR where nothing is marked. @param {Uint8Array} marks @param {number} width @param {number} height */
export function ecosystemDistanceTransform(marks, width, height) {
    const squared = new Float64Array(width * height), scratch = new Float64Array(Math.max(width, height)), v = new Int32Array(Math.max(width, height)), z = new Float64Array(Math.max(width, height) + 1);
    for (let i = 0; i < squared.length; i++) squared[i] = marks[i] ? 0 : FAR;
    for (let x = 0; x < width; x++) { distanceTransform1d(squared, x, width, height, scratch, v, z); for (let y = 0; y < height; y++) squared[y * width + x] = scratch[y]; }
    for (let y = 0; y < height; y++) { distanceTransform1d(squared, y * width, 1, width, scratch, v, z); for (let x = 0; x < width; x++) squared[y * width + x] = scratch[x]; }
    return squared;
}

const segmentDistance = (ax, az, bx, bz, x, z) => {
    const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz, t = length > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
    return Math.hypot(x - ax - t * dx, z - az - t * dz);
};
const intersects = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

/**
 * @param {{manifest:any,chunks:Map<string,{descriptor:any,heights:Float32Array,landCover:Uint8Array}>,fieldPages?:Map<string,Uint8Array>|null,fieldsLayout?:any,naturalSoilPages?:Map<string,Uint8Array>|null,
 *   geologyPages?:Map<string,{fields:Uint8Array,categorical:Uint8Array}>|null,geologyLayout?:any,planning?:{features:readonly any[]}|null,bounds:{minX:number,maxX:number,minZ:number,maxZ:number},
 *   coverDistanceMeters?:number,layerDistanceMeters?:number,layerFeatures?:((layerId:string)=>({records:Float32Array,count:number}|null))|null}} options
 *   bounds: the cell bounds (the cover window is these grown by coverDistanceMeters); layerDistanceMeters: saturation of `distance.layer.*` (the generation halo)
 * @returns {import('./EcosystemInputs.js').EcosystemInputSources & {viewCorridor:(x:number,z:number)=>boolean}}
 */
export function createEcosystemCellSources({ manifest, chunks, fieldPages = null, fieldsLayout = null, naturalSoilPages = null, geologyPages = null, geologyLayout = null, planning = null, bounds,
    coverDistanceMeters = ECOSYSTEM_COVER_DISTANCE_METERS, layerDistanceMeters = ECOSYSTEM_DISTANCE_CAP, layerFeatures = null }) {
    requireCondition(!!manifest && chunks instanceof Map && !!bounds, 'ecosystem cell sources need the manifest, the native chunks and the cell bounds');
    requireCondition((fieldPages === null) === (fieldsLayout === null) && (geologyPages === null) === (geologyLayout === null), 'field and geology pages come with their layouts');
    requireFinite(coverDistanceMeters, 'coverDistanceMeters'); requireFinite(layerDistanceMeters, 'layerDistanceMeters');
    const grid = manifest.grid, count = 2 ** grid.maxLevel, chunkX = grid.spacingX * grid.chunkIntervals, chunkZ = grid.spacingZ * grid.chunkIntervals, b = manifest.bounds, seaLevel = manifest.coordinates.seaLevel;
    const ownerId = (x, z) => createLandscapeChunkId(grid.maxLevel, Math.min(count - 1, Math.floor((x - b.minX) / chunkX)), Math.min(count - 1, Math.floor((b.maxZ - z) / chunkZ)));
    const chunkOf = (x, z) => { const id = ownerId(x, z), chunk = chunks.get(id); requireCondition(!!chunk, `ecosystem cell sources lack native chunk ${id}`); return chunk; };
    const pageOf = (pages, x, z, label) => { const id = ownerId(x, z), page = pages.get(id); requireCondition(!!page, `ecosystem cell sources lack the ${label} page of ${id}`); return page; };
    const soilIds = manifest.soil.catalog.map(soil => soil.id);
    const inside = (x, z) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
    const window = { minX: Math.max(b.minX, bounds.minX - coverDistanceMeters), maxX: Math.min(b.maxX, bounds.maxX + coverDistanceMeters), minZ: Math.max(b.minZ, bounds.minZ - coverDistanceMeters), maxZ: Math.min(b.maxZ, bounds.maxZ + coverDistanceMeters) };
    const column0 = Math.ceil((window.minX - b.minX) / grid.spacingX - 1e-9), column1 = Math.floor((window.maxX - b.minX) / grid.spacingX + 1e-9), row0 = Math.ceil((b.maxZ - window.maxZ) / grid.spacingZ - 1e-9), row1 = Math.floor((b.maxZ - window.minZ) / grid.spacingZ + 1e-9);
    const width = Math.max(0, column1 - column0 + 1), height = Math.max(0, row1 - row0 + 1), transforms = new Map();
    let coverWindow = null;
    const coverAt = (column, row) => {
        const chunkColumn = Math.min(count - 1, Math.floor(column / grid.chunkIntervals)), chunkRow = Math.min(count - 1, Math.floor(row / grid.chunkIntervals)), id = createLandscapeChunkId(grid.maxLevel, chunkColumn, chunkRow);
        const chunk = chunks.get(id);
        requireCondition(!!chunk, `ecosystem cell sources lack native chunk ${id} of the cover window`);
        return chunk.landCover[(row - chunk.descriptor.startRow) * chunk.descriptor.columns + column - chunk.descriptor.startColumn];
    };
    const transformOf = landCoverId => {
        if (transforms.has(landCoverId)) return transforms.get(landCoverId);
        if (!coverWindow) { coverWindow = new Uint8Array(width * height); for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) coverWindow[row * width + column] = coverAt(column0 + column, row0 + row); }
        const marks = new Uint8Array(width * height);
        let any = false;
        for (let i = 0; i < marks.length; i++) if (coverWindow[i] === landCoverId) { marks[i] = 1; any = true; }
        const transform = any ? ecosystemDistanceTransform(marks, width, height) : null;
        transforms.set(landCoverId, transform);
        return transform;
    };
    const roads = [], districts = [], corridors = [], reach = ecosystemGrownBounds(bounds, ECOSYSTEM_DISTANCE_CAP);
    for (const feature of planning?.features ?? []) {
        if (feature.kind === 'road' && feature.geometry.type === 'polyline') {
            const half = feature.metadata.widthMeters / 2, points = feature.geometry.points;
            if (!intersects(ecosystemGrownBounds(feature.bounds, half), reach)) continue;
            for (let i = 1; i < points.length; i++) {
                const a = points[i - 1], b = points[i], segment = { minX: Math.min(a.x, b.x) - half, maxX: Math.max(a.x, b.x) + half, minZ: Math.min(a.z, b.z) - half, maxZ: Math.max(a.z, b.z) + half };
                if (intersects(segment, reach)) roads.push([a.x, a.z, b.x, b.z, half]);
            }
        } else if (feature.kind === 'district' && feature.geometry.type === 'polygon') {
            if (intersects(feature.bounds, reach)) districts.push({ type: 'polygon', points: feature.geometry.points });
        } else if (feature.kind === 'view-corridor' && feature.geometry.type === 'polygon') {
            if (intersects(feature.bounds, reach)) corridors.push({ type: 'polygon', points: feature.geometry.points });
        }
    }
    return Object.freeze({
        terrain(x, z) {
            if (!inside(x, z)) return null;
            const sample = sampleLandscapeChunk(manifest, chunkOf(x, z), x, z);
            requireCondition(sample.status === 'ready', `ecosystem terrain sample at ${x}, ${z} is ${sample.status}`);
            return { height: sample.height, normal: sample.normal, slopeDegrees: sample.slopeDegrees, soilId: sample.soilId, landCoverId: sample.landCoverId, seaLevel };
        },
        fields: fieldPages === null ? null : (x, z) => {
            if (!inside(x, z)) return null;
            return decodeLandscapeTerrainFields(sampleLandscapeTerrainFieldPage(pageOf(fieldPages, x, z, 'terrain-fields'), 0, fieldsLayout, chunkOf(x, z).descriptor.bounds, x, z));
        },
        naturalSoil: naturalSoilPages === null ? null : (x, z) => {
            if (!inside(x, z)) return null;
            const page = naturalSoilPages.get(ownerId(x, z));
            if (!page) return null;
            const label = sampleLandscapeTerrainNaturalSoil(page, chunkOf(x, z).descriptor, x, z);
            requireCondition(label < soilIds.length, `natural soil label ${label} is not a catalog soil`);
            return soilIds[label];
        },
        geology: geologyPages === null ? null : (x, z) => {
            if (!inside(x, z)) return null;
            const page = pageOf(geologyPages, x, z, 'geology'), descriptor = chunkOf(x, z).descriptor;
            return { channels: sampleLandscapeGeologyPage(page.fields, geologyLayout, descriptor, x, z), categories: sampleLandscapeGeologyCategory(page.categorical, descriptor, x, z) };
        },
        roadDistance: planning === null ? null : (x, z) => {
            let nearest = ECOSYSTEM_DISTANCE_CAP;
            for (const [ax, az, bx, bz, half] of roads) { const distance = segmentDistance(ax, az, bx, bz, x, z) - half; if (distance < nearest) nearest = distance; }
            return Math.max(0, nearest);
        },
        districtDistance: planning === null ? null : (x, z) => {
            let nearest = ECOSYSTEM_DISTANCE_CAP;
            for (const region of districts) { const signed = landscapeRegionSignedDistance(region, x, z); if (signed >= 0) return 0; if (-signed < nearest) nearest = -signed; }
            return nearest;
        },
        viewCorridor(x, z) { return corridors.some(region => landscapeRegionContains(region, x, z)); },
        coverDistance(x, z, landCoverId) {
            if (!inside(x, z) || width === 0 || height === 0) return null;
            const transform = transformOf(landCoverId);
            if (!transform) return coverDistanceMeters;
            const column = Math.min(width - 1, Math.max(0, Math.round((x - b.minX) / grid.spacingX) - column0)), row = Math.min(height - 1, Math.max(0, Math.round((b.maxZ - z) / grid.spacingZ) - row0));
            const squared = transform[row * width + column];
            return squared >= FAR ? coverDistanceMeters : Math.min(coverDistanceMeters, Math.sqrt(squared) * grid.spacingX);
        },
        layerDistance: layerFeatures === null ? null : (x, z, layerId) => {
            const features = layerFeatures(layerId);
            if (!features) return null;
            let nearest = layerDistanceMeters;
            const F = ECOSYSTEM_RECORD.floats, records = features.records;
            for (let i = 0; i < features.count; i++) { const distance = Math.hypot(records[i * F] - x, records[i * F + 2] - z); if (distance < nearest) nearest = distance; }
            return nearest;
        }
    });
}
