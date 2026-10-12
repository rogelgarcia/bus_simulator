// Rasterizes the coast classes of the animated ocean's extent field (AI 597 D2) from the landscape's geology sidecar: the rock flag and the shore exposure at the field's texel centres.
// @ts-check
// Design. The shore wave needs two things the heightfield cannot tell: where the shore is rock (the wave-cut platform and the bluff toe, where
// the train surges and reflects instead of breaking) and how exposed each stretch of shore is to the open sea (the geology's waveExposure, carried
// over the bar, surf and swash zones; a sheltered bay damps the train). Both come from the geology sidecar's pages at the field's own hierarchy
// level, sampled nearest at the texel centres (labels are never interpolated; the exposure is a per-shore value, not a continuous field). The
// exposure is only defined on its zones, so the raster marks the other texels undefined (a negative value) for the owner to fill from the
// nearest defined shore (LandscapeOceanShore.landscapeOceanShoreFill). Pure rasterization plus a bounded loader; a missing sidecar (404) or a
// sidecar bound to another landscape yields the neutral classes (no rock, full exposure) with the reason recorded, never a failed ocean.
import { LANDSCAPE_GEOLOGY_CATEGORIES, LANDSCAPE_GEOLOGY_CHANNELS, LandscapeGeologyBindingError, landscapeGeologyStaleness, loadLandscapeGeology, loadLandscapeGeologyPage } from '../../../../app/landscape/index.js';
import { LANDSCAPE_OCEAN } from './LandscapeOceanModel.js';

export const LANDSCAPE_OCEAN_COAST = Object.freeze({ format: 'landscape-ocean-coast-v1', undefinedExposure: -1, channels: Object.freeze({ r: 'shore exposure (0 sheltered .. 1 open)', g: 'rock (1 platform or bluff toe)' }) });

const ZONE_CATEGORY = LANDSCAPE_GEOLOGY_CATEGORIES.find(category => category.name === 'coastalZone');
const EXPOSURE_CHANNEL = LANDSCAPE_GEOLOGY_CHANNELS.find(channel => channel.name === 'waveExposure');
if (!ZONE_CATEGORY?.labels || !EXPOSURE_CHANNEL) throw new Error('[LandscapeOceanCoast] The geology model lacks the coastal zone category or the wave exposure channel');
const COMPONENTS = 'rgba';

/** @param {ReadonlyArray<string>} names @returns {Set<number>} the zone labels of the names (unknown names throw: the model and the geology must agree) */
function zoneIds(names) {
    return new Set(names.map(name => {
        const id = /** @type {ReadonlyArray<string>} */ (ZONE_CATEGORY.labels).indexOf(name);
        if (id < 0) throw new Error(`[LandscapeOceanCoast] ${name} is not a coastal zone of the geology model`);
        return id;
    }));
}

/**
 * Rasterizes the rock flag, the shore exposure and the zone label at the texel centres of an ocean field layout from the geology pages of its level.
 * @param {{bounds:{minX:number,maxX:number,minZ:number,maxZ:number},texels:number,texelMetersX:number,texelMetersZ:number,level:number,chunkIds:ReadonlyArray<string>}} layout
 * @param {any} geology the validated geology sidecar (layout, pages) @param {Map<string,{fields:Uint8Array,categorical:Uint8Array}>} pages page bytes by page id
 * @param {{chunks:Array<{id:string,level:number,bounds:{minX:number,maxX:number,minZ:number,maxZ:number}}>}} manifest the landscape manifest (the chunk bounds of the level)
 * @param {{rockZones?:ReadonlyArray<string>,exposureZones?:ReadonlyArray<string>}} [options]
 * @returns {{rock:Uint8Array,exposure:Float32Array,zone:Uint8Array,statistics:{rockTexels:number,exposureTexels:number,exposure:{min:number,mean:number,max:number}|null,zones:Record<string,number>}}}
 */
export function rasterizeLandscapeOceanCoast(layout, geology, pages, manifest, { rockZones = LANDSCAPE_OCEAN.shore.rockZones, exposureZones = LANDSCAPE_OCEAN.shore.exposureZones } = {}) {
    const { texels, bounds, texelMetersX, texelMetersZ } = layout, count = texels * texels;
    const rock = new Uint8Array(count), exposure = new Float32Array(count).fill(LANDSCAPE_OCEAN_COAST.undefinedExposure), zone = new Uint8Array(count);
    const rockIds = zoneIds(rockZones), exposureIds = zoneIds(exposureZones);
    const fieldLayout = geology.layout, labelLayout = fieldLayout.categorical, samples = labelLayout.samples, intervals = samples - 1;
    const zoneOffset = ZONE_CATEGORY.layer * labelLayout.layerBytes, exposureOffset = EXPOSURE_CHANNEL.layer * fieldLayout.layerBytes, component = COMPONENTS.indexOf(EXPOSURE_CHANNEL.component);
    const zoneCounts = new Uint32Array(/** @type {ReadonlyArray<string>} */ (ZONE_CATEGORY.labels).length);
    let rockTexels = 0, exposureTexels = 0, exposureSum = 0, exposureMin = Infinity, exposureMax = -Infinity;
    for (const id of layout.chunkIds) {
        const page = pages.get(id), chunk = manifest.chunks.find(entry => entry.id === id);
        if (!page || !chunk) throw new Error(`[LandscapeOceanCoast] geology page ${id} is missing from the loaded set`);
        if (page.categorical.length !== labelLayout.byteLength || page.fields.length !== fieldLayout.pageBytes) throw new Error(`[LandscapeOceanCoast] geology page ${id} does not match its layout`);
        const b = chunk.bounds, width = b.maxX - b.minX, height = b.maxZ - b.minZ;
        const c0 = Math.max(0, Math.ceil((b.minX - bounds.minX) / texelMetersX - 0.5)), c1 = Math.min(texels - 1, Math.floor((b.maxX - bounds.minX) / texelMetersX - 0.5));
        const r0 = Math.max(0, Math.ceil((b.minZ - bounds.minZ) / texelMetersZ - 0.5)), r1 = Math.min(texels - 1, Math.floor((b.maxZ - bounds.minZ) / texelMetersZ - 0.5));
        for (let r = r0; r <= r1; r++) {
            const z = bounds.minZ + (r + 0.5) * texelMetersZ, rowNorth = Math.min(intervals, Math.max(0, Math.round((b.maxZ - z) / height * intervals)));
            for (let c = c0; c <= c1; c++) {
                const x = bounds.minX + (c + 0.5) * texelMetersX, column = Math.min(intervals, Math.max(0, Math.round((x - b.minX) / width * intervals)));
                const label = page.categorical[zoneOffset + rowNorth * samples + column], at = r * texels + c;
                zone[at] = label;
                zoneCounts[label]++;
                if (rockIds.has(label)) { rock[at] = 1; rockTexels++; }
                if (!exposureIds.has(label)) continue;
                const value = page.fields[exposureOffset + ((rowNorth + fieldLayout.halo) * fieldLayout.width + column + fieldLayout.halo) * 4 + component] / 255 * EXPOSURE_CHANNEL.scale;
                exposure[at] = value;
                exposureTexels++;
                exposureSum += value;
                if (value < exposureMin) exposureMin = value;
                if (value > exposureMax) exposureMax = value;
            }
        }
    }
    const zones = Object.fromEntries(/** @type {ReadonlyArray<string>} */ (ZONE_CATEGORY.labels).map((name, id) => [name, zoneCounts[id]]));
    return { rock, exposure, zone, statistics: { rockTexels, exposureTexels, exposure: exposureTexels ? { min: exposureMin, mean: exposureSum / exposureTexels, max: exposureMax } : null, zones } };
}

/**
 * The breaking texels per coastal zone of the sea (the D2 gate: breaking belongs to the bars and the foreshore, grows with the sea state, and
 * never happens on rock): texel and breaking counts for every zone that has texels, plus the breaking share of each.
 * @param {Uint8Array} breaking the shore march's breaking mask @param {Uint8Array} zone the coast's zone labels
 * @returns {Record<string,{texels:number,breaking:number,share:number}>}
 */
export function landscapeOceanCoastZoneBreaking(breaking, zone) {
    if (!(breaking instanceof Uint8Array) || !(zone instanceof Uint8Array) || breaking.length !== zone.length) throw new Error('[LandscapeOceanCoast] The breaking mask and the zone labels must be Uint8Arrays of the same length');
    const labels = /** @type {ReadonlyArray<string>} */ (ZONE_CATEGORY.labels), texels = new Uint32Array(labels.length), broken = new Uint32Array(labels.length);
    for (let i = 0; i < zone.length; i++) { texels[zone[i]]++; if (breaking[i]) broken[zone[i]]++; }
    return Object.fromEntries(labels.map((name, id) => [name, { texels: texels[id], breaking: broken[id], share: texels[id] ? broken[id] / texels[id] : 0 }]).filter(([, value]) => value.texels > 0));
}

/**
 * The beach mask of the coast: 1 on the zones where the shore wave's crests are judged against the beach (LANDSCAPE_OCEAN.shore.beachZones), 0
 * elsewhere (reef edges and bars break obliquely to the main shoreline and are not the gate's beach).
 * @param {Uint8Array} zone the coast's zone labels @param {ReadonlyArray<string>} [zones]
 */
export function landscapeOceanCoastBeachMask(zone, zones = LANDSCAPE_OCEAN.shore.beachZones) {
    if (!(zone instanceof Uint8Array)) throw new Error('[LandscapeOceanCoast] The zone labels must be a Uint8Array');
    const ids = zoneIds(zones), mask = new Uint8Array(zone.length);
    for (let i = 0; i < zone.length; i++) if (ids.has(zone[i])) mask[i] = 1;
    return mask;
}

/**
 * Neutral classes for a landscape without a usable geology: no rock, full exposure everywhere (the train keeps its height to the shore).
 * @param {number} texels
 */
export function neutralLandscapeOceanCoast(texels) {
    const count = texels * texels;
    return { rock: new Uint8Array(count), exposure: new Float32Array(count).fill(1), zone: new Uint8Array(count), statistics: { rockTexels: 0, exposureTexels: 0, exposure: null, zones: {} } };
}

/**
 * Loads the geology sidecar beside the landscape manifest and its pages of the field's level, and rasterizes the coast classes; resolves to the
 * neutral classes with status 'missing' (no sidecar) or 'unbound' (a sidecar of another landscape or frame) instead of failing.
 * @param {{manifest:any,manifestUrl:string,layout:any,signal?:AbortSignal,fetchImpl?:typeof fetch}} options
 * @returns {Promise<{status:'active'|'missing'|'unbound',reason:string|null,stale:boolean,staleChunks:number,revision:string|null,pages:number,rock:Uint8Array,exposure:Float32Array,zone:Uint8Array,statistics:any,milliseconds:number}>}
 */
export async function loadLandscapeOceanCoast({ manifest, manifestUrl, layout, signal, fetchImpl = globalThis.fetch }) {
    const started = performance.now(), url = new URL(LANDSCAPE_OCEAN.shore.sidecar, manifestUrl).href;
    const neutral = (status, reason) => ({ status, reason, stale: false, staleChunks: 0, revision: null, pages: 0, ...neutralLandscapeOceanCoast(layout.texels), milliseconds: performance.now() - started });
    let geology;
    try { geology = await loadLandscapeGeology(url, { landscape: manifest, fetchImpl, signal }); }
    catch (error) {
        if (error instanceof LandscapeGeologyBindingError) return neutral('unbound', error.message);
        throw error;
    }
    if (!geology) return neutral('missing', `no geology sidecar at ${url}`);
    const pages = new Map();
    for (const id of layout.chunkIds) {
        signal?.throwIfAborted();
        const page = geology.pages.find(entry => entry.id === id);
        if (!page) throw new Error(`[LandscapeOceanCoast] the geology has no page ${id}`);
        const [fields, categorical] = await Promise.all([loadLandscapeGeologyPage(page.fields, { manifestUrl: url, fetchImpl, signal }), loadLandscapeGeologyPage(page.categorical, { manifestUrl: url, fetchImpl, signal })]);
        pages.set(id, { fields, categorical });
    }
    signal?.throwIfAborted();
    const staleness = landscapeGeologyStaleness(geology, manifest), staleChunks = staleness.staleChunks?.length ?? 0;
    const raster = rasterizeLandscapeOceanCoast(layout, geology, pages, manifest);
    return { status: 'active', reason: null, stale: staleChunks > 0, staleChunks, revision: geology.revision, pages: pages.size, ...raster, milliseconds: performance.now() - started };
}
