// Builds the swash band of the animated ocean (AI 597 D4) from the native beach chunks: the sheet geometry per chunk and the run-up inputs of a sea state (pure: no three.js, no shader loader).
// @ts-check
// Design. The sheet must sit on the sand the terrain draws, and the hierarchy's coarser levels differ from the native samples by decimetres,
// so the band is read from the native chunks (the hierarchy's finest level) that touch it (the bounded loader, like the fields): every native sample whose shore distance
// (bilinear from the extent raster) and height lie within LANDSCAPE_OCEAN.swash's band becomes a vertex (grid column, height in millimetres,
// grid row as 16-bit integers), every cell with four band corners two triangles, one geometry per chunk (16-bit indices while a chunk holds
// fewer than 65 536 band vertices). LandscapeOceanSwash.js draws it.
import { loadLandscapeChunk } from '../../../../app/landscape/index.js';
import { LANDSCAPE_OCEAN, landscapeOceanShoreInputs } from './LandscapeOceanModel.js';
import { landscapeOceanSignificantWaveHeight } from './LandscapeOceanSpectrum.js';

export const LANDSCAPE_OCEAN_SWASH = Object.freeze({ recipe: 'landscape-ocean-swash-v1', positionBytes: 6, indexBytes: 2 });

/**
 * The band geometry of one native chunk: vertices for the samples inside the band, two triangles per cell whose four corners are inside.
 * @param {{descriptor:{bounds:{minX:number,maxX:number,minZ:number,maxZ:number},columns:number,rows:number,sampleStride:number},heights:Float32Array}} chunk
 * @param {{minX:number,minZ:number,spacingX:number,spacingZ:number,seaLevel:number}} grid the landscape grid the vertex integers refer to
 * @param {{landMeters:number,seaMeters:number,maxHeightMeters:number,minHeightMeters:number}} band
 * @param {(x:number,z:number)=>number} shoreDistanceAt signed shore distance (m, positive in the water)
 * @returns {{positions:Int16Array,indices:Uint16Array|Uint32Array,vertices:number,triangles:number,bounds:{minX:number,maxX:number,minZ:number,maxZ:number,minY:number,maxY:number}}|null}
 */
export function landscapeOceanSwashChunkGeometry(chunk, grid, band, shoreDistanceAt) {
    const { descriptor, heights } = chunk, { columns, rows, sampleStride } = descriptor, b = descriptor.bounds;
    if (!(heights instanceof Float32Array) || heights.length !== columns * rows) throw new Error('[LandscapeOceanSwash] The chunk heights do not match its descriptor');
    const dx = grid.spacingX * sampleStride, dz = grid.spacingZ * sampleStride;
    const index = new Int32Array(columns * rows).fill(-1), positions = [], bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity, maxY: -Infinity };
    let vertices = 0;
    for (let r = 0; r < rows; r++) {
        const z = b.maxZ - r * dz;
        for (let c = 0; c < columns; c++) {
            const x = b.minX + c * dx, height = heights[r * columns + c] - grid.seaLevel;
            if (height > band.maxHeightMeters || height < -band.minHeightMeters) continue;
            const distance = shoreDistanceAt(x, z);
            if (distance > band.seaMeters || distance < -band.landMeters) continue;
            index[r * columns + c] = vertices++;
            positions.push(Math.round((x - grid.minX) / grid.spacingX), Math.round(heights[r * columns + c] * 1000), Math.round((z - grid.minZ) / grid.spacingZ));
            bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x); bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z);
            bounds.minY = Math.min(bounds.minY, heights[r * columns + c]); bounds.maxY = Math.max(bounds.maxY, heights[r * columns + c]);
        }
    }
    if (!vertices) return null;
    const triangles = [];
    for (let r = 0; r + 1 < rows; r++) for (let c = 0; c + 1 < columns; c++) {
        const a = index[r * columns + c], bb = index[r * columns + c + 1], cc = index[(r + 1) * columns + c], d = index[(r + 1) * columns + c + 1];
        if (a < 0 || bb < 0 || cc < 0 || d < 0) continue;
        triangles.push(a, cc, bb, bb, cc, d);
    }
    if (!triangles.length) return null;
    const indices = vertices > 65535 ? Uint32Array.from(triangles) : Uint16Array.from(triangles);
    return { positions: Int16Array.from(positions), indices, vertices, triangles: triangles.length / 3, bounds };
}

/**
 * Loads the native chunks (the hierarchy's finest level) the band touches and builds their sheet geometry.
 * @param {{manifest:any,manifestUrl:string,layout:any,shoreDistance:Float32Array,signal?:AbortSignal,loadChunk?:typeof loadLandscapeChunk,band?:any}} options
 *   layout is the extent field layout the shore distance raster follows
 * @returns {Promise<{chunks:Array<{id:string,geometry:NonNullable<ReturnType<typeof landscapeOceanSwashChunkGeometry>>}>,candidates:number,vertices:number,triangles:number,bytes:number,milliseconds:number,grid:{minX:number,minZ:number,spacingX:number,spacingZ:number,seaLevel:number}}>}
 */
export async function loadLandscapeOceanSwashBand({ manifest, manifestUrl, layout, shoreDistance, signal, loadChunk = loadLandscapeChunk, band = LANDSCAPE_OCEAN.swash }) {
    const started = performance.now(), { texels, bounds, texelMetersX, texelMetersZ } = layout;
    const shoreDistanceAt = (x, z) => {
        const u = Math.min(texels - 1, Math.max(0, (x - bounds.minX) / texelMetersX - 0.5)), v = Math.min(texels - 1, Math.max(0, (z - bounds.minZ) / texelMetersZ - 0.5));
        const i = Math.min(texels - 2, Math.floor(u)), j = Math.min(texels - 2, Math.floor(v)), fu = u - i, fv = v - j, o = j * texels + i;
        return (shoreDistance[o] * (1 - fu) + shoreDistance[o + 1] * fu) * (1 - fv) + (shoreDistance[o + texels] * (1 - fu) + shoreDistance[o + texels + 1] * fu) * fv;
    };
    const grid = { minX: manifest.bounds.minX, minZ: manifest.bounds.minZ, spacingX: manifest.grid.spacingX, spacingZ: manifest.grid.spacingZ, seaLevel: manifest.coordinates.seaLevel };
    // candidate chunks: the native chunks (the hierarchy's finest level, maxLevel) whose bounds hold a band texel (shore distance within the band at the texel centre)
    const native = manifest.grid.maxLevel ?? 0;
    const candidates = manifest.chunks.filter(chunk => {
        if (chunk.level !== native) return false;
        const cb = chunk.bounds, c0 = Math.max(0, Math.floor((cb.minX - bounds.minX) / texelMetersX)), c1 = Math.min(texels - 1, Math.ceil((cb.maxX - bounds.minX) / texelMetersX));
        const r0 = Math.max(0, Math.floor((cb.minZ - bounds.minZ) / texelMetersZ)), r1 = Math.min(texels - 1, Math.ceil((cb.maxZ - bounds.minZ) / texelMetersZ));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const d = shoreDistance[r * texels + c]; if (d <= band.seaMeters && d >= -band.landMeters) return true; }
        return false;
    });
    const chunks = [];
    let vertices = 0, triangles = 0, bytes = 0;
    for (const descriptor of candidates) {
        signal?.throwIfAborted();
        const chunk = await loadChunk(manifest, descriptor.id, { manifestUrl, signal });
        const geometry = landscapeOceanSwashChunkGeometry(chunk, grid, band, shoreDistanceAt);
        if (!geometry) continue;
        chunks.push({ id: descriptor.id, geometry });
        vertices += geometry.vertices; triangles += geometry.triangles; bytes += geometry.positions.byteLength + geometry.indices.byteLength;
    }
    signal?.throwIfAborted();
    return { chunks, candidates: candidates.length, vertices, triangles, bytes, milliseconds: performance.now() - started, grid };
}

/**
 * The run-up inputs of a sea state for the sheet: sqrt(H L) of its swell (H the continuous significant height, L the deep-water wavelength) and
 * the swell period. @param {string} seaState @param {string} quality
 */
export function landscapeOceanSwashInputs(seaState, quality) {
    const inputs = landscapeOceanShoreInputs(seaState), heightMeters = landscapeOceanSignificantWaveHeight(seaState, quality).continuousMeters;
    return Object.freeze({ heightMeters, wavelengthMeters: inputs.deepWavelengthMeters, sqrtHeightLength: Math.sqrt(heightMeters * inputs.deepWavelengthMeters), periodSeconds: inputs.periodSeconds });
}
