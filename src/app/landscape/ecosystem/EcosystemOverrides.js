// Defines the landscape-ecosystem-overrides v1 document: region parameter overrides, include/exclude masks and pinned or removed instances, applied in a documented order.
// @ts-check
// Order (procedural-first contract, roadmap §6): region parameter overrides (densityScale, scaleMultiplier) and include masks are read by the
// generator while it evaluates a site (an include mask lifts the layer's exclusions inside its region, which cannot be undone after the fact);
// after generation applyEcosystemOverrides removes the features inside exclude masks, then the removed instance ids, then appends the pinned
// instances. Everything is data: overrides survive regeneration because they are keyed by region geometry and structural instance ids.
import { landscapeRegionContains, landscapeRegionIntersectsBounds, validateLandscapeRegion } from '../LandscapeRegions.js';
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId, requireInteger } from '../internal/LandscapeValidation.js';
import { canonicalEcosystemJson } from './EcosystemRecipe.js';
import { ECOSYSTEM_RECORD, createEcosystemTileData, ecosystemInstanceId, parseEcosystemInstanceId, sortEcosystemTile, writeEcosystemRecord } from './EcosystemTiles.js';

export const ECOSYSTEM_OVERRIDES_FORMAT = 'landscape-ecosystem-overrides';
export const ECOSYSTEM_OVERRIDES_SCHEMA_VERSION = 1;
export const ECOSYSTEM_OVERRIDES_LIMITS = Object.freeze({ regions: 256, masks: 256, removed: 65536, pinned: 4096 });
export const ECOSYSTEM_OVERRIDE_ORDER = Object.freeze(['region-parameters (generation)', 'include-masks (generation)', 'exclude-masks', 'removed-instances', 'pinned-instances']);
export const ECOSYSTEM_MASK_MODES = Object.freeze(['include', 'exclude']);

const KEYS = Object.freeze({ document: 'format,id,instances,masks,recipe,regions,schemaVersion', region: 'id,layers,region', parameters: 'densityScale,scaleMultiplier', mask: 'id,layers,mode,region', instances: 'pinned,removed', pinned: 'id,layer,scale,variant,x,yaw,z' });

function requireKeys(value, keys, label) {
    requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
    requireCondition(Object.keys(value).sort().join(',') === keys, `${label} has missing or unsupported fields (expected ${keys})`);
}

function validateLayerSelection(value, label, recipe) {
    if (value === '*') return '*';
    requireCondition(Array.isArray(value) && value.length >= 1 && new Set(value).size === value.length, `${label} must be '*' or a list of distinct layer ids`);
    for (const id of value) { requireId(id, `${label} layer`); if (recipe) requireCondition(Object.hasOwn(recipe.layers, id), `${label} names an unknown layer ${id}`); }
    return Object.freeze([...value]);
}

const selects = (layers, layerId) => layers === '*' || layers.includes(layerId);

/**
 * Validates and deep-freezes an overrides document; with a recipe, layer references are checked against it.
 * @param {unknown} input @param {any} [recipe] validated recipe
 */
export function validateEcosystemOverrides(input, recipe = null) {
    const value = clonePlainData(input, 'ecosystem overrides');
    requireKeys(value, KEYS.document, 'ecosystem overrides');
    requireCondition(value.format === ECOSYSTEM_OVERRIDES_FORMAT && value.schemaVersion === ECOSYSTEM_OVERRIDES_SCHEMA_VERSION, 'unsupported ecosystem overrides format/schemaVersion');
    requireId(value.id, 'ecosystem overrides id'); requireId(value.recipe, 'ecosystem overrides recipe');
    if (recipe) requireCondition(value.recipe === recipe.id, `ecosystem overrides target recipe ${value.recipe}, not ${recipe.id}`);
    requireCondition(Array.isArray(value.regions) && value.regions.length <= ECOSYSTEM_OVERRIDES_LIMITS.regions, `ecosystem overrides regions must be an array of at most ${ECOSYSTEM_OVERRIDES_LIMITS.regions}`);
    const ids = new Set(), regions = value.regions.map((entry, i) => {
        requireKeys(entry, KEYS.region, `regions[${i}]`); requireId(entry.id, `regions[${i}].id`);
        requireCondition(!ids.has(entry.id), `override region ${entry.id} is repeated`); ids.add(entry.id);
        requireCondition(!!entry.layers && typeof entry.layers === 'object' && !Array.isArray(entry.layers) && Object.keys(entry.layers).length >= 1, `regions[${i}].layers must map layer ids (or '*') to parameters`);
        const layers = {};
        for (const [layerId, parameters] of Object.entries(entry.layers)) {
            if (layerId !== '*') { requireId(layerId, `regions[${i}].layers key`); if (recipe) requireCondition(Object.hasOwn(recipe.layers, layerId), `regions[${i}] names an unknown layer ${layerId}`); }
            requireCondition(!!parameters && typeof parameters === 'object' && Object.keys(parameters).every(key => KEYS.parameters.split(',').includes(key)) && Object.keys(parameters).length >= 1, `regions[${i}].layers.${layerId} must set densityScale and/or scaleMultiplier`);
            const densityScale = parameters.densityScale ?? 1, scaleMultiplier = parameters.scaleMultiplier ?? 1;
            requireFinite(densityScale, `regions[${i}].layers.${layerId}.densityScale`); requireCondition(densityScale >= 0 && densityScale <= 16, `regions[${i}].layers.${layerId}.densityScale must be in 0..16`);
            requireFinite(scaleMultiplier, `regions[${i}].layers.${layerId}.scaleMultiplier`); requireCondition(scaleMultiplier > 0 && scaleMultiplier <= 16, `regions[${i}].layers.${layerId}.scaleMultiplier must be in (0, 16]`);
            layers[layerId] = Object.freeze({ densityScale, scaleMultiplier });
        }
        return Object.freeze({ id: entry.id, region: validateLandscapeRegion(entry.region, { allowPoint: false }), layers: Object.freeze(layers) });
    });
    requireCondition(Array.isArray(value.masks) && value.masks.length <= ECOSYSTEM_OVERRIDES_LIMITS.masks, `ecosystem overrides masks must be an array of at most ${ECOSYSTEM_OVERRIDES_LIMITS.masks}`);
    const masks = value.masks.map((entry, i) => {
        requireKeys(entry, KEYS.mask, `masks[${i}]`); requireId(entry.id, `masks[${i}].id`);
        requireCondition(!ids.has(entry.id), `override mask ${entry.id} repeats an id`); ids.add(entry.id);
        requireCondition(ECOSYSTEM_MASK_MODES.includes(entry.mode), `masks[${i}].mode must be include or exclude`);
        return Object.freeze({ id: entry.id, mode: entry.mode, region: validateLandscapeRegion(entry.region, { allowPoint: false }), layers: validateLayerSelection(entry.layers, `masks[${i}].layers`, recipe) });
    });
    requireKeys(value.instances, KEYS.instances, 'ecosystem overrides instances');
    requireCondition(Array.isArray(value.instances.removed) && value.instances.removed.length <= ECOSYSTEM_OVERRIDES_LIMITS.removed, `removed instances must be an array of at most ${ECOSYSTEM_OVERRIDES_LIMITS.removed}`);
    const removed = value.instances.removed.map((id, i) => {
        requireCondition(typeof id === 'string', `instances.removed[${i}] must be an instance id`);
        const parsed = parseEcosystemInstanceId(id);
        requireCondition(parsed.pinned === null, `instances.removed[${i}]: remove a pinned instance by deleting its pin`);
        if (recipe) requireCondition(Object.hasOwn(recipe.layers, parsed.layerId), `instances.removed[${i}] names an unknown layer ${parsed.layerId}`);
        return id;
    });
    requireCondition(new Set(removed).size === removed.length, 'removed instance ids must be distinct');
    requireCondition(Array.isArray(value.instances.pinned) && value.instances.pinned.length <= ECOSYSTEM_OVERRIDES_LIMITS.pinned, `pinned instances must be an array of at most ${ECOSYSTEM_OVERRIDES_LIMITS.pinned}`);
    const pins = new Set(), pinned = value.instances.pinned.map((entry, i) => {
        requireKeys(entry, KEYS.pinned, `instances.pinned[${i}]`); requireId(entry.layer, `instances.pinned[${i}].layer`);
        if (recipe) requireCondition(Object.hasOwn(recipe.layers, entry.layer), `instances.pinned[${i}] names an unknown layer ${entry.layer}`);
        requireCondition(typeof entry.id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(entry.id), `instances.pinned[${i}].id must be a short name`);
        const key = `${entry.layer}:pin:${entry.id}`;
        requireCondition(!pins.has(key), `pinned instance ${key} is repeated`); pins.add(key);
        requireFinite(entry.x, `instances.pinned[${i}].x`); requireFinite(entry.z, `instances.pinned[${i}].z`);
        requireFinite(entry.yaw, `instances.pinned[${i}].yaw`); requireFinite(entry.scale, `instances.pinned[${i}].scale`); requireCondition(entry.scale > 0, `instances.pinned[${i}].scale must be positive`);
        requireInteger(entry.variant, 0, 255, `instances.pinned[${i}].variant`);
        return Object.freeze({ layer: entry.layer, id: entry.id, x: entry.x, z: entry.z, yaw: entry.yaw, scale: entry.scale, variant: entry.variant });
    });
    return freezeData({ format: value.format, schemaVersion: value.schemaVersion, id: value.id, recipe: value.recipe, regions, masks, instances: { removed, pinned } });
}

/** An empty overrides document for a recipe. @param {string} recipeId */
export function createEmptyEcosystemOverrides(recipeId) {
    return validateEcosystemOverrides({ format: ECOSYSTEM_OVERRIDES_FORMAT, schemaVersion: ECOSYSTEM_OVERRIDES_SCHEMA_VERSION, id: `${recipeId}-overrides`, recipe: recipeId, regions: [], masks: [], instances: { removed: [], pinned: [] } });
}

async function sha256Hex(text) {
    requireCondition(!!globalThis.crypto?.subtle, 'Ecosystem identity requires Web Crypto');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** `ecosystem-overrides-<24 hex>` of a validated document's canonical JSON. @param {any} overrides */
export async function ecosystemOverridesIdentity(overrides) { return `ecosystem-overrides-${(await sha256Hex(canonicalEcosystemJson(validateEcosystemOverrides(overrides)))).slice(0, 24)}`; }

/**
 * The generation-time parameters at a position: the product of the matching regions' densityScale and scaleMultiplier for the layer (a region
 * entry for '*' applies to every layer, a layer entry overrides it), and whether an include mask lifts the layer's exclusions here.
 * @param {any} overrides validated @param {string} layerId @param {number} x @param {number} z
 */
export function ecosystemOverrideParameters(overrides, layerId, x, z) {
    let densityScale = 1, scaleMultiplier = 1, included = false;
    const regionIds = [];
    for (const entry of overrides.regions) {
        const parameters = entry.layers[layerId] ?? entry.layers['*'];
        if (!parameters || !landscapeRegionContains(entry.region, x, z)) continue;
        densityScale *= parameters.densityScale; scaleMultiplier *= parameters.scaleMultiplier; regionIds.push(entry.id);
    }
    for (const mask of overrides.masks) if (mask.mode === 'include' && selects(mask.layers, layerId) && landscapeRegionContains(mask.region, x, z)) { included = true; regionIds.push(mask.id); }
    return { densityScale, scaleMultiplier, included, regionIds };
}

/** Ids of the regions and masks that touch a layer inside some bounds (part of a tile's content key). @param {any} overrides @param {string} layerId @param {any} bounds */
export function ecosystemOverridesIntersecting(overrides, layerId, bounds) {
    const ids = [];
    for (const entry of overrides.regions) if ((entry.layers[layerId] || entry.layers['*']) && landscapeRegionIntersectsBounds(entry.region, bounds)) ids.push(entry.id);
    for (const mask of overrides.masks) if (selects(mask.layers, layerId) && landscapeRegionIntersectsBounds(mask.region, bounds)) ids.push(mask.id);
    for (const pin of overrides.instances.pinned) if (pin.layer === layerId && pin.x >= bounds.minX && pin.x < bounds.maxX && pin.z >= bounds.minZ && pin.z < bounds.maxZ) ids.push(`${pin.layer}:pin:${pin.id}`);
    return ids.sort();
}

/**
 * The post-generation steps over one tile: exclude masks remove features inside them, removed ids drop their features, pinned instances of the
 * layer inside the tile bounds are appended (placed on the ground the caller samples). Returns a new rank-sorted tile and the counts.
 * @param {import('./EcosystemTiles.js').EcosystemTileData} tile @param {{layerId:string,bounds:{minX:number,maxX:number,minZ:number,maxZ:number},overrides:any,
 *   groundAt:(x:number,z:number)=>({height:number,normal:{x:number,y:number,z:number}}|null)}} options
 * @returns {{tile:import('./EcosystemTiles.js').EcosystemTileData,masked:number,removed:number,pinned:string[],unplaced:string[]}}
 */
export function applyEcosystemOverrides(tile, { layerId, bounds, overrides, groundAt }) {
    const excludes = overrides.masks.filter(mask => mask.mode === 'exclude' && selects(mask.layers, layerId) && landscapeRegionIntersectsBounds(mask.region, bounds));
    const removed = new Set(overrides.instances.removed.filter(id => parseEcosystemInstanceId(id).layerId === layerId));
    const pins = overrides.instances.pinned.filter(pin => pin.layer === layerId && pin.x >= bounds.minX && pin.x < bounds.maxX && pin.z >= bounds.minZ && pin.z < bounds.maxZ);
    const result = createEcosystemTileData(tile.count + pins.length), F = ECOSYSTEM_RECORD.floats, I = ECOSYSTEM_RECORD.idInts;
    let masked = 0, dropped = 0;
    for (let i = 0; i < tile.count; i++) {
        const o = i * F, x = tile.records[o], z = tile.records[o + 2];
        if (excludes.some(mask => landscapeRegionContains(mask.region, x, z))) { masked++; continue; }
        if (removed.size && removed.has(ecosystemInstanceId(layerId, tile.ids[i * I], tile.ids[i * I + 1], tile.ids[i * I + 2]))) { dropped++; continue; }
        result.records.set(tile.records.subarray(o, o + F), result.count * F); result.ids.set(tile.ids.subarray(i * I, i * I + I), result.count * I); result.count++;
    }
    const pinned = [], unplaced = [];
    for (const pin of pins) {
        const ground = groundAt(pin.x, pin.z);
        if (!ground) { unplaced.push(`${layerId}:pin:${pin.id}`); continue; }
        writeEcosystemRecord(result, result.count++, { x: pin.x, y: ground.height, z: pin.z, scale: pin.scale, normalX: ground.normal.x, normalZ: ground.normal.z, yaw: pin.yaw, variant: pin.variant, rank: 0, tint: [1, 1, 1],
            siteX: Math.round(pin.x * 8), siteZ: Math.round(pin.z * 8), child: ECOSYSTEM_RECORD.childPinned });
        pinned.push(`${layerId}:pin:${pin.id}`);
    }
    return { tile: sortEcosystemTile(result), masked, removed: dropped, pinned, unplaced };
}
