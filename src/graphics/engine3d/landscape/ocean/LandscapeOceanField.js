// Builds the bathymetry fields of the animated ocean (AI 597) from the saved landscape chunks: depth below sea level rasterized at texel centres over the landscape or surround bounds.
// @ts-check
// Design. The ocean reads the seabed from its own small raster rather than the streamed tiles: the extent at the level-2 hierarchy spacing (4 x the
// native spacing, 3.906 m on coastal v3: the bar, the reef and the 1:20 foreshore are all wider than that) and the surround at its level-1
// spacing (62.5 m: enough to keep the open sea's amplitude off the far coast). Both are rasterized once per load from the saved chunks of that
// level through the bounded loaders, bilinear at texel centres, row 0 at the minimum z (the texture's v axis grows with z), so the GPU lookup
// (xz - min) / size needs no flip. Pure module: the owner wraps the float raster in a texture. Depth is sea level minus height (positive below the
// sea, negative over land); nothing here is authoritative (picking and queries keep the heightfield).
import { loadLandscapeChunk } from '../../../../app/landscape/index.js';

export const LANDSCAPE_OCEAN_FIELD = Object.freeze({ format: 'landscape-ocean-field-v1', channels: Object.freeze({ x: 'depth below sea level (m), negative over land' }), bytesPerTexel: 8 });

/**
 * The layout of a field over a landscape document: its bounds, texel count per side and texel size, and the ids of the chunks of the level it reads.
 * @param {any} manifest a validated landscape manifest @param {number} level hierarchy level of the chunks to read @param {number} texels texels per side
 */
export function landscapeOceanFieldLayout(manifest, level, texels) {
    if (!manifest?.bounds || !Array.isArray(manifest.chunks)) throw new Error('[LandscapeOceanField] A landscape manifest with bounds and chunks is required');
    if (!Number.isInteger(level) || level < 0 || !Number.isInteger(texels) || texels < 2) throw new Error(`[LandscapeOceanField] The field needs a nonnegative level and at least two texels; received ${level}, ${texels}`);
    const chunkIds = manifest.chunks.filter(chunk => chunk.level === level).map(chunk => chunk.id);
    if (!chunkIds.length) throw new Error(`[LandscapeOceanField] ${manifest.id} has no chunks at level ${level}`);
    const { minX, maxX, minZ, maxZ } = manifest.bounds;
    return Object.freeze({ bounds: Object.freeze({ minX, maxX, minZ, maxZ }), texels, texelMetersX: (maxX - minX) / texels, texelMetersZ: (maxZ - minZ) / texels, level, chunkIds: Object.freeze(chunkIds), seaLevel: manifest.coordinates.seaLevel });
}

/**
 * Rasterizes the depth below sea level at the texel centres of a layout from the loaded chunks of its level (bilinear in each chunk's grid; the
 * chunks' shared edges carry identical samples, so the raster is seamless).
 * @param {ReturnType<typeof landscapeOceanFieldLayout>} layout @param {any} manifest @param {Map<string, any>} chunks loaded chunks by id (descriptor, heights)
 * @returns {{depth:Float32Array,statistics:{minDepth:number,maxDepth:number,seaFraction:number}}}
 */
export function rasterizeLandscapeOceanDepth(layout, manifest, chunks) {
    const { texels, bounds, texelMetersX, texelMetersZ, seaLevel } = layout, depth = new Float32Array(texels * texels).fill(NaN);
    const spacingX = manifest.grid.spacingX, spacingZ = manifest.grid.spacingZ;
    for (const id of layout.chunkIds) {
        const chunk = chunks.get(id);
        if (!chunk) throw new Error(`[LandscapeOceanField] chunk ${id} is missing from the loaded set`);
        const { descriptor, heights } = chunk, { minX, maxX, minZ, maxZ } = descriptor.bounds, columns = descriptor.columns, rows = descriptor.rows;
        const dx = spacingX * descriptor.sampleStride, dz = spacingZ * descriptor.sampleStride;
        const c0 = Math.max(0, Math.ceil((minX - bounds.minX) / texelMetersX - 0.5)), c1 = Math.min(texels - 1, Math.floor((maxX - bounds.minX) / texelMetersX - 0.5));
        const r0 = Math.max(0, Math.ceil((minZ - bounds.minZ) / texelMetersZ - 0.5)), r1 = Math.min(texels - 1, Math.floor((maxZ - bounds.minZ) / texelMetersZ - 0.5));
        for (let r = r0; r <= r1; r++) {
            const z = bounds.minZ + (r + 0.5) * texelMetersZ, row = Math.min(rows - 1, Math.max(0, (maxZ - z) / dz)), rowIndex = Math.min(rows - 2, Math.floor(row)), v = row - rowIndex;
            for (let c = c0; c <= c1; c++) {
                const x = bounds.minX + (c + 0.5) * texelMetersX, column = Math.min(columns - 1, Math.max(0, (x - minX) / dx)), columnIndex = Math.min(columns - 2, Math.floor(column)), u = column - columnIndex;
                const o = rowIndex * columns + columnIndex;
                const height = (heights[o] * (1 - u) + heights[o + 1] * u) * (1 - v) + (heights[o + columns] * (1 - u) + heights[o + columns + 1] * u) * v;
                depth[r * texels + c] = seaLevel - height;
            }
        }
    }
    let minDepth = Infinity, maxDepth = -Infinity, sea = 0;
    for (let i = 0; i < depth.length; i++) {
        const value = depth[i];
        if (Number.isNaN(value)) throw new Error(`[LandscapeOceanField] texel ${i % texels}, ${Math.floor(i / texels)} is not covered by the level ${layout.level} chunks`);
        if (value < minDepth) minDepth = value;
        if (value > maxDepth) maxDepth = value;
        if (value > 0) sea++;
    }
    return { depth, statistics: { minDepth, maxDepth, seaFraction: sea / depth.length } };
}

/**
 * Loads the chunks of a field's level through the bounded loader and rasterizes the depth field.
 * @param {{manifest:any,manifestUrl:string,level:number,texels:number,signal?:AbortSignal,loadChunk?:typeof loadLandscapeChunk}} options
 * @returns {Promise<{layout:ReturnType<typeof landscapeOceanFieldLayout>,depth:Float32Array,statistics:{minDepth:number,maxDepth:number,seaFraction:number},chunkBytes:number,milliseconds:number}>}
 */
export async function loadLandscapeOceanField({ manifest, manifestUrl, level, texels, signal, loadChunk = loadLandscapeChunk }) {
    const started = performance.now(), layout = landscapeOceanFieldLayout(manifest, level, texels), chunks = new Map();
    let chunkBytes = 0;
    for (const id of layout.chunkIds) {
        signal?.throwIfAborted();
        const chunk = await loadChunk(manifest, id, { manifestUrl, signal });
        chunks.set(id, chunk);
        chunkBytes += chunk.heights.byteLength;
    }
    signal?.throwIfAborted();
    const { depth, statistics } = rasterizeLandscapeOceanDepth(layout, manifest, chunks);
    return { layout, depth, statistics, chunkBytes, milliseconds: performance.now() - started };
}
