// Resolves the identity and stability of a surface cache page from the resident appearance inputs it depends on.
// @ts-check
// AI577 D6 (landscape-surface-cache-v1). A page depends on the global generation key (recipe, compiled program, every generation uniform that is
// not per mask slot or per transition, sea level, appearance revision and soil bindings), on the mask pages at the levels its texel can still
// resolve (with a margin covering the warp, the reconstruction kernels and the availability bands), and on the tier keys of the soils those
// pages hold plus the exposed-rock soil, and on the geometry tiles the page is drawn from (a level change under a page changes its heights and
// normals). Mask pages that are fading in or out, a material tier transition that changes a soil's key at this mip and geometry transitions
// over the page make it unstable: it is neither generated nor regenerated until they settle, while a stale version keeps rendering. Camera,
// light and time never enter the identity.
import { landscapeSurfaceCacheMaskLevel, landscapeSurfaceCachePageBounds, landscapeSurfaceCachePageIdentity, landscapeSurfaceCacheTexelMeters,
    landscapeSurfaceCacheTierKey, landscapeSurfaceCacheHash } from './LandscapeSurfaceCacheLayout.js';

export const LANDSCAPE_SURFACE_CACHE_INPUTS = Object.freeze({
    id: 'landscape-surface-cache-inputs-v1',
    warpMarginMeters: 3,
    kernelMarginSpacings: 7
});

/**
 * Global generation key: a hash of named parts (strings, numbers, typed arrays or plain arrays), order-independent by name.
 * @param {Readonly<Record<string, any>>} parts
 */
export function landscapeSurfaceCacheGlobalKey(parts) {
    const text = Object.keys(parts).sort().map(name => {
        const value = parts[name];
        const encoded = ArrayBuffer.isView(value) ? Array.from(/** @type {any} */ (value)).join(',') : Array.isArray(value) ? value.join(',') : String(value);
        return `${name}=${encoded}`;
    }).join(';');
    return landscapeSurfaceCacheHash(text);
}

/**
 * Buckets resident mask inputs by level for page queries.
 * @param {{slots:ReadonlyArray<{key:string,level:number,bounds:{minX:number,maxX:number,minZ:number,maxZ:number},progress:number,soils:readonly number[]}>,levelSpacings:readonly number[]}} inputs
 */
export function indexLandscapeSurfaceCacheInputs(inputs) {
    const byLevel = Array.from({ length: inputs.levelSpacings.length }, () => []);
    for (const slot of inputs.slots) {
        if (!Number.isSafeInteger(slot.level) || slot.level < 0 || slot.level >= byLevel.length) throw new Error(`[LandscapeSurfaceCache] mask input ${slot.key} has level ${slot.level} outside ${byLevel.length} levels`);
        const margin = LANDSCAPE_SURFACE_CACHE_INPUTS.warpMarginMeters + LANDSCAPE_SURFACE_CACHE_INPUTS.kernelMarginSpacings * inputs.levelSpacings[slot.level];
        byLevel[slot.level].push({ ...slot, reach: { minX: slot.bounds.minX - margin, maxX: slot.bounds.maxX + margin, minZ: slot.bounds.minZ - margin, maxZ: slot.bounds.maxZ + margin } });
    }
    return byLevel;
}

/**
 * Identity and stability of one page.
 * @param {{geometry:any,global:string,byLevel:ReturnType<typeof indexLandscapeSurfaceCacheInputs>,levelSpacings:readonly number[],
 *   soils:ReadonlyArray<{index:number,tileMeters:number,resolution:number,microTileMeters:number,microResolution:number,transitionResolution:number|null}>,
 *   alwaysSoils?:readonly number[],unstableBoxes?:ReadonlyArray<{minX:number,maxX:number,minZ:number,maxZ:number}>,
 *   tiles?:ReadonlyArray<{id:string,bounds:{minX:number,maxX:number,minZ:number,maxZ:number}}>,mip:number,x:number,z:number}} options tiles are the geometry
 *   sources of this page's mip (the rendered leaves, or the overview tile for coarse pages)
 * @returns {{identity:string,stable:boolean,masks:number,soils:number[],tiles:number}}
 */
export function landscapeSurfaceCachePageInputs({ geometry, global, byLevel, levelSpacings, soils, alwaysSoils = [], unstableBoxes = [], tiles = [], mip, x, z }) {
    const bounds = landscapeSurfaceCachePageBounds(geometry, mip, x, z, { gutter: true }), finest = landscapeSurfaceCacheMaskLevel(geometry, mip, levelSpacings);
    const masks = [], present = new Set(alwaysSoils);
    let stable = true;
    for (let level = 0; level <= finest; level++) {
        for (const slot of byLevel[level]) {
            const r = slot.reach;
            if (r.maxX < bounds.minX || r.minX > bounds.maxX || r.maxZ < bounds.minZ || r.minZ > bounds.maxZ) continue;
            masks.push(slot.key);
            if (slot.progress !== 1) stable = false;
            for (const soil of slot.soils) present.add(soil);
        }
    }
    for (const box of unstableBoxes) if (!(box.maxX < bounds.minX || box.minX > bounds.maxX || box.maxZ < bounds.minZ || box.minZ > bounds.maxZ)) stable = false;
    const sources = [];
    for (const tile of tiles) if (!(tile.bounds.maxX < bounds.minX || tile.bounds.minX > bounds.maxX || tile.bounds.maxZ < bounds.minZ || tile.bounds.minZ > bounds.maxZ)) sources.push(tile.id);
    const texelMeters = landscapeSurfaceCacheTexelMeters(geometry, mip), soilKeys = [];
    for (const index of [...present].sort((a, b) => a - b)) {
        const soil = soils[index];
        if (!soil) throw new Error(`[LandscapeSurfaceCache] page inputs name soil ${index} without a material state`);
        const tier = landscapeSurfaceCacheTierKey({ tileMeters: soil.tileMeters, resolution: soil.resolution, texelMeters });
        const micro = soil.microTileMeters > 0 ? landscapeSurfaceCacheTierKey({ tileMeters: soil.microTileMeters, resolution: soil.microResolution, texelMeters }) : 'none';
        soilKeys.push(`${index}:${tier}:${micro}`);
        if (soil.transitionResolution !== null && landscapeSurfaceCacheTierKey({ tileMeters: soil.tileMeters, resolution: soil.transitionResolution, texelMeters }) !== tier) stable = false;
    }
    return { identity: landscapeSurfaceCachePageIdentity({ global, mip, x, z, masks, soils: soilKeys, tiles: sources }), stable, masks: masks.length, soils: [...present], tiles: sources.length };
}
