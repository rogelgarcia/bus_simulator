// Resolves the identity and stability of a surface cache page from the resident appearance inputs it depends on.
// @ts-check
// AI577 D6 (landscape-surface-cache-v1). A page depends on the global generation key (recipe, compiled program, every generation uniform that is
// not per mask slot or per transition, sea level, appearance revision and soil bindings), on the mask pages at the levels its texel can still
// resolve (with a margin covering the warp, the reconstruction kernels and the availability bands), and on the tier keys of the soils those
// pages hold plus the exposed-rock soil, and on the geometry tiles the page is drawn from (a level change under a page changes its heights and
// normals). Mask pages that are fading in or out, a material tier transition that changes a soil's key at this mip and geometry transitions
// over the page make it unstable: a missing page generates from them at once as a provisional version, a resident one is not regenerated until
// they settle (its current version keeps rendering). Invalidation is monotonic (landscapeSurfaceCacheInputChange): inputs that only coarsened
// (mask pages evicted, a material tier downgraded) never invalidate a page generated from finer ones. Camera, light and time never enter the identity.
import { landscapeSurfaceCacheMaskLevel, landscapeSurfaceCachePageBounds, landscapeSurfaceCachePageIdentity, landscapeSurfaceCacheTexelMeters,
    landscapeSurfaceCacheTierKey, landscapeSurfaceCacheHash } from './LandscapeSurfaceCacheLayout.js';

export const LANDSCAPE_SURFACE_CACHE_INPUTS = Object.freeze({
    id: 'landscape-surface-cache-inputs-v1',
    warpMarginMeters: 3,
    kernelMarginSpacings: 7
});

const numberScratch = new Float64Array(1), numberWords = new Uint32Array(numberScratch.buffer);

/**
 * Global generation key: a 53-bit hash (two FNV-1a lanes, as landscapeSurfaceCacheHash) of named parts (strings, numbers, typed arrays or plain
 * arrays), order-independent by name. Numbers enter as their IEEE-754 bits, so the key is computed every frame without building strings.
 * @param {Readonly<Record<string, any>>} parts
 */
export function landscapeSurfaceCacheGlobalKey(parts) {
    let a = 0x811c9dc5, b = 0x9e3779b9;
    const word = value => { a = Math.imul(a ^ value, 0x01000193) >>> 0; b = Math.imul(b ^ value, 0x5bd1e995) >>> 0; b ^= b >>> 15; };
    const text = value => { for (let i = 0; i < value.length; i++) word(value.charCodeAt(i)); word(0x1f); };
    const number = value => { numberScratch[0] = value; word(numberWords[0]); word(numberWords[1]); };
    for (const name of Object.keys(parts).sort()) {
        text(name);
        const value = parts[name];
        if (ArrayBuffer.isView(value) || Array.isArray(value)) {
            const list = /** @type {any} */ (value);
            word(list.length);
            for (let i = 0; i < list.length; i++) { const element = list[i]; if (typeof element === 'number') number(element); else text(String(element)); }
        } else if (typeof value === 'number') number(value);
        else text(String(value));
        word(0x3b);
    }
    return (a >>> 0).toString(16).padStart(8, '0') + ((b >>> 0) & 0x1fffff).toString(16).padStart(6, '0');
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
 * @returns {{identity:string,stable:boolean,masks:number,soils:number[],tiles:number,parts:{global:string,masks:string[],soils:Array<[number,string,string]>,tiles:string[]}}}
 *   parts are the identity's components, kept with a resident page for the monotonic comparison
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
    const texelMeters = landscapeSurfaceCacheTexelMeters(geometry, mip), soilKeys = [], soilTiers = [];
    for (const index of [...present].sort((a, b) => a - b)) {
        const soil = soils[index];
        if (!soil) throw new Error(`[LandscapeSurfaceCache] page inputs name soil ${index} without a material state`);
        const [tier, micro] = landscapeSurfaceCacheSoilTiers(soil, texelMeters);
        soilKeys.push(`${index}:${tier}:${micro}`);
        soilTiers.push([index, tier, micro]);
        if (soil.transitionResolution !== null && landscapeSurfaceCacheTierKey({ tileMeters: soil.tileMeters, resolution: soil.transitionResolution, texelMeters }) !== tier) stable = false;
    }
    sources.sort();
    return { identity: landscapeSurfaceCachePageIdentity({ global, mip, x, z, masks, soils: soilKeys, tiles: sources }), stable, masks: masks.length, soils: [...present], tiles: sources.length,
        parts: { global, masks, soils: soilTiers, tiles: sources } };
}

/**
 * Tier keys (base, micro) of a soil's bound material at a page texel: 'resolved', the tier resolution, or 'none' without a micro layer.
 * @param {{tileMeters:number,resolution:number,microTileMeters:number,microResolution:number}} soil @param {number} texelMeters
 * @returns {[string, string]}
 */
export function landscapeSurfaceCacheSoilTiers(soil, texelMeters) {
    return [landscapeSurfaceCacheTierKey({ tileMeters: soil.tileMeters, resolution: soil.resolution, texelMeters }),
        soil.microTileMeters > 0 ? landscapeSurfaceCacheTierKey({ tileMeters: soil.microTileMeters, resolution: soil.microResolution, texelMeters }) : 'none'];
}

/** Rank of a tier key: 'resolved' outranks every resolution, a resolution ranks by its size, 'none' (no micro layer) ranks lowest. @param {string} key */
export function landscapeSurfaceCacheTierRank(key) { return key === 'resolved' ? Infinity : key === 'none' ? -1 : Number(key); }

/**
 * Monotonic invalidation: why a resident page generated from `previous` inputs is stale under `next`, or null when it is not. A page is stale when
 * the global key differs, its geometry sources differ, it now depends on a mask page that was not among its own (a new, edited or finer page) or a
 * soil it holds now binds a finer material or micro tier at its texel (or newly appears). Inputs that only coarsened (mask pages evicted, a tier
 * downgraded) never invalidate it: its content stays the finer one, which those inputs return to as they stream back.
 * @param {{global:string,masks:readonly string[],soils:ReadonlyArray<readonly [number, string, string]>,tiles:readonly string[]}} previous
 * @param {{global:string,masks:readonly string[],soils:ReadonlyArray<readonly [number, string, string]>,tiles:readonly string[]}} next
 * @returns {'global'|'tiles'|'masks'|'soils'|null}
 */
export function landscapeSurfaceCacheInputChange(previous, next) {
    if (!previous || previous.global !== next.global) return 'global';
    if (previous.tiles.length !== next.tiles.length || next.tiles.some((id, index) => id !== previous.tiles[index])) return 'tiles';
    if (next.masks.length) {
        const own = new Set(previous.masks);
        for (const key of next.masks) if (!own.has(key)) return 'masks';
    }
    for (const [index, tier, micro] of next.soils) {
        const old = previous.soils.find(soil => soil[0] === index);
        if (!old || landscapeSurfaceCacheTierRank(tier) > landscapeSurfaceCacheTierRank(old[1]) || landscapeSurfaceCacheTierRank(micro) > landscapeSurfaceCacheTierRank(old[2])) return 'soils';
    }
    return null;
}
