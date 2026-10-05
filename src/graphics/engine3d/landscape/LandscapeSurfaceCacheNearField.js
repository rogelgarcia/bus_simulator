// Declares the near field of the runtime surface cache: the footprint band where per-pixel evaluation replaces the cache and the tiles its pass draws.
// @ts-check
// AI577 D6 (landscape-surface-cache-near-v1). The cache's finest pages hold 1.5625 cm texels, while the 4 m soil textures resolve 3.9 mm and a
// camera 1.6 m above the ground sees 2-4 mm pixels, so close ground would be magnified cache texels. There the coverage and materials are evaluated
// per pixel, exactly as without the cache: after the cached frame, the near pass draws the uncached program over the tiles near the camera, keeps only
// fragments whose filtered footprint is below the band end and blends them over the cached color with alpha = weight (it replaces the cached color where
// it owns the fragment completely). The weight is a smoothstep of the cache's own footprint metric max(major / anisotropy, minor) of the planar
// derivatives (surface_cache_near.glsl mirrors landscapeSurfaceCacheNearWeight). The cached frame shades every fragment: skipping the owned ones with
// a discard inside it (a per-tile flag) or a depth-only prepass of them cost more than it saved (measured interleaved at d4-grass-near: discard
// 8.74 ms, prepass 8.45 ms, neither 8.08 ms; at 01-game-pov 6.85, 6.96 and 6.70 ms), as the cached frame's shading is cheap next to its geometry.
// Reach: a one-pixel step turns a ray by at least pixel angle x cos^2(phi) at the off-axis angle phi (1 / (1 + tan^2(fov/2)(1 + aspect^2)) at the screen
// corner) and moves a surface point at distance d at least d times that; the planar projection shortens a step on ground of slope theta by at most
// cos(theta), and the longer step keeps at least 1/sqrt(2) of its length along the strike. So the footprint is at least
// d x pixel angle x cos^2(phi) x max(cos(theta), 1 / (sqrt(2) anisotropy)) and no fragment of a tile whose steepest slope is theta can fall below the band
// end beyond the distance that makes this equal to the end. The pass draws a tile within that distance, and of it only the rows of the native grid that
// lie within the distance in z (plus its skirts); an excluded tile shows the cache and never a hole.
import { LANDSCAPE_SURFACE_CACHE } from './LandscapeSurfaceCacheLayout.js';

export const LANDSCAPE_SURFACE_CACHE_NEAR = Object.freeze({
    id: 'landscape-surface-cache-near-v1',
    // the hand-over band of the cache footprint, in mip-0 texels: the near pass owns fragments at or below start, the cache those at or above end. The
    // cache resolves its own texel (mip 0 at lod 0) and is magnified below it, where grass, forest soil and rock lose up to 12 sRGB bytes; at and
    // above it its difference stays at the 0.3-2 byte level of every cached view, so the band ends at one texel. Measured interleaved against
    // [0.75, 1.25]: the near-crop mean difference to the uncached frame rises by at most 0.22 sRGB bytes (d4-rock-mid 0.21 -> 0.43, d5-horizon-pov
    // 0.94 -> 1.16, d4-*-near and d5-shore-near unchanged at 0.00) while the pass draws 0.2-4.9 ms less (02-oblique 6.55 -> 4.40 ms, d4-sand-ortho-20
    // 7.80 -> 2.89 ms, whose 1.85 cm pixels lay inside the wider band with weights near 0.05)
    startTexels: .75,
    endTexels: 1,
    // safety factor on the derived reach
    distanceMargin: 1.25,
    // the near program draws after the cached tiles (render order 0), depth-tested less-or-equal against the depth they wrote with this polygon offset
    // [factor, units] toward the camera, which covers the depth differences between the two programs' vertex shaders
    renderOrder: 1,
    nearOffset: Object.freeze([-1, -4]),
    modes: Object.freeze(['on', 'off'])
});

const NEAR = LANDSCAPE_SURFACE_CACHE_NEAR;

function positive(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`[LandscapeSurfaceCache] ${label} must be a positive number; received ${value}`);
    return value;
}

/**
 * Hand-over band in meters of the cache footprint. @param {{startTexels?:number,endTexels?:number,texel0Meters?:number}} [options]
 * @returns {Readonly<{start:number,end:number}>}
 */
export function landscapeSurfaceCacheNearBand({ startTexels = NEAR.startTexels, endTexels = NEAR.endTexels, texel0Meters = LANDSCAPE_SURFACE_CACHE.texel0Meters } = {}) {
    positive(startTexels, 'near band start'); positive(endTexels, 'near band end'); positive(texel0Meters, 'texel size');
    if (!(endTexels > startTexels)) throw new Error('[LandscapeSurfaceCache] the near band must end above its start');
    return Object.freeze({ start: startTexels * texel0Meters, end: endTexels * texel0Meters });
}

/**
 * Near weight of a fragment, mirror of landscapeSurfaceCacheNearWeight in surface_cache_near.glsl: 1 at and below the band start, 0 at and above its end.
 * @param {{dx:readonly number[],dy:readonly number[],anisotropy:number,start:number,end:number}} input planar derivatives (meters per pixel)
 */
export function landscapeSurfaceCacheNearWeight({ dx, dy, anisotropy, start, end }) {
    if (!(end > 0)) return 0;
    const a = Math.hypot(dx[0], dx[1]), b = Math.hypot(dy[0], dy[1]), footprint = Math.max(Math.max(a, b) / anisotropy, Math.min(a, b));
    const t = Math.min(1, Math.max(0, (footprint - start) / (end - start)));
    return 1 - t * t * (3 - 2 * t);
}

/** Lower bound of the cache footprint per unit of the pixel's distance step on ground whose steepest slope has this cosine. */
function slopeFloor(slopeCosine, anisotropy) { return Math.max(Math.min(1, Math.max(0, slopeCosine)), 1 / (Math.SQRT2 * anisotropy)); }

/**
 * Distance from the camera within which a fragment on ground of the given steepest slope can still have a near weight (see the reach derivation
 * above), times the margin. An orthographic view either has such fragments anywhere (Infinity) or none (0).
 * @param {{camera:{projection:string,fovYRadians:number,zoom:number,viewportHeight:number,orthoHeight:number},aspect:number,anisotropy:number,end:number,
 *   slopeCosine?:number,margin?:number}} options slopeCosine is the cosine of the steepest slope (1 for flat ground)
 */
export function landscapeSurfaceCacheNearReach({ camera, aspect, anisotropy, end, slopeCosine = 1, margin = NEAR.distanceMargin }) {
    positive(aspect, 'aspect'); positive(anisotropy, 'anisotropy'); positive(margin, 'margin');
    if (!(end > 0)) return 0;
    const floor = slopeFloor(slopeCosine, anisotropy);
    if (camera.projection === 'orthographic') {
        const pixel = camera.orthoHeight / camera.zoom / camera.viewportHeight;
        return pixel * floor < end * margin ? Infinity : 0;
    }
    const t = Math.tan(camera.fovYRadians / 2) / camera.zoom, pixelAngle = 2 * t / camera.viewportHeight, corner = 1 + t * t * (1 + aspect * aspect);
    return end * corner * margin / (pixelAngle * floor);
}

/**
 * Tiles the near pass draws, each with its reach: those whose box (bounds and height range) lies within the reach of the camera position.
 * @param {{position:{x:number,y:number,z:number},reachOf:(tile:any)=>number,tiles:ReadonlyArray<{id:string,bounds:{minX:number,maxX:number,minZ:number,maxZ:number},minHeight:number,maxHeight:number}>}} options
 * @returns {Array<{id:string,reach:number}>}
 */
export function selectLandscapeSurfaceCacheNearTiles({ position, reachOf, tiles }) {
    const selected = [];
    for (const tile of tiles) {
        const reach = reachOf(tile);
        if (!(reach > 0)) continue;
        if (reach === Infinity) { selected.push({ id: tile.id, reach }); continue; }
        const b = tile.bounds;
        const dx = Math.max(b.minX - position.x, 0, position.x - b.maxX), dz = Math.max(b.minZ - position.z, 0, position.z - b.maxZ);
        const dy = Math.max(tile.minHeight - position.y, 0, position.y - tile.maxHeight);
        if (Math.hypot(dx, dy, dz) < reach) selected.push({ id: tile.id, reach });
    }
    return selected;
}

/**
 * Index range of a tile's surface rows (row 0 north, six indices per cell) that intersect [z - reach, z + reach], and of its skirt (after the surface).
 * @param {{bounds:{minZ:number,maxZ:number},rows:number,columns:number,z:number,reach:number}} options
 * @returns {{rows:{start:number,count:number}|null,skirt:{start:number,count:number}}}
 */
export function landscapeSurfaceCacheNearRanges({ bounds, rows, columns, z, reach }) {
    const perRow = 6 * (columns - 1), surface = (rows - 1) * perRow, skirt = { start: surface, count: 6 * (2 * columns + 2 * rows - 4) };
    if (!(reach > 0)) return { rows: null, skirt };
    if (reach === Infinity) return { rows: { start: 0, count: surface }, skirt };
    const dz = (bounds.maxZ - bounds.minZ) / (rows - 1);
    const first = Math.max(0, Math.floor((bounds.maxZ - (z + reach)) / dz)), last = Math.min(rows - 2, Math.ceil((bounds.maxZ - (z - reach)) / dz));
    return { rows: last < first ? null : { start: first * perRow, count: (last - first + 1) * perRow }, skirt };
}
