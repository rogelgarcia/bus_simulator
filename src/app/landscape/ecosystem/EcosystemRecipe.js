// Defines the landscape-ecosystem-recipe v1 schema: biomes as ordered layer sets, layers with assets, cells, footprints, alignment, variation, LODs and rules.
// @ts-check
// Design: the recipe is the versioned, data-only input of the ecosystem engine (procedural-first contract, roadmap §6). Validation runs once at
// this boundary, fills documented defaults so a validated recipe round-trips through JSON unchanged, and rejects anything the generator or the
// renderer could not honour: a site lattice too dense for the declared footprints, LOD chains that do not reach the view distance, competition
// against a layer that cannot win, halos wider than the neighbouring cell ring (locality), zones and inputs nobody defines. The identity of a
// recipe is the SHA-256 of its canonical JSON, so every tile's content key carries it.
import { validateLandscapeRegion } from '../LandscapeRegions.js';
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId, requireInteger } from '../internal/LandscapeValidation.js';
import { ECOSYSTEM_BUILTIN_ZONES, ECOSYSTEM_MAX_DENSITY_TERMS, isEcosystemRuleInput, validateEcosystemCurve } from './EcosystemRules.js';

export const ECOSYSTEM_RECIPE_FORMAT = 'landscape-ecosystem-recipe';
export const ECOSYSTEM_RECIPE_SCHEMA_VERSION = 1;
export const ECOSYSTEM_RECIPE_IDENTITY = /^ecosystem-recipe-[a-f0-9]{24}$/;
export const ECOSYSTEM_GENERATION_MODES = Object.freeze(['offline', 'runtime']);
export const ECOSYSTEM_ALIGNMENT_MODES = Object.freeze(['upright', 'slope', 'sunk']);
export const ECOSYSTEM_YAW_MODES = Object.freeze(['random', 'none', 'downslope']);
export const ECOSYSTEM_SCALE_DISTRIBUTIONS = Object.freeze(['uniform', 'log-uniform']);
export const ECOSYSTEM_ASSET_KINDS = Object.freeze(['placeholder-rocks', 'catalog-distant']);
export const ECOSYSTEM_CATALOG_SPECIES = Object.freeze(['london_plane', 'silver_linden', 'northern_red_oak', 'american_elm', 'arrowwood_viburnum']);
export const ECOSYSTEM_CATALOG_VARIANTS = Object.freeze(['mature_01', 'mature_02', 'mature_03']);
export const ECOSYSTEM_CATALOG_LEVELS = Object.freeze([3, 4, 5]);
export const ECOSYSTEM_RECIPE_LIMITS = Object.freeze({
    layers: 32, assets: 32, biomes: 16, zones: 32, targets: 32, lods: 8, variants: 8, cellMeters: Object.freeze([16, 1024]), sitesPerAxis: Object.freeze([4, 256]),
    viewDistanceMeters: Object.freeze([20, 4000]), priority: Object.freeze([0, 1000]), childCount: 64, nameLength: 120
});

const KEYS = Object.freeze({
    recipe: 'assets,biomes,format,id,layers,name,schemaVersion,seed,targets,zones',
    layerRequired: 'assetSet,cell,footprint,generation,id,label,lods,rules,viewDistanceMeters', layerOptional: 'alignment,fadeMeters,jitter,shadow,variation',
    rules: 'clumping,competition,density,exclusions,parent',
    competition: 'against,clearanceMeters,priority',
    alignment: 'mode,sinkMeters,sinkScalesWithSize,slopeWeight',
    variation: 'scale,tint,yaw',
    scale: 'distribution,max,min',
    tint: 'channels,value',
    shadow: 'castLevels,maxDistanceMeters',
    biome: 'label,layers,where'
});

function requireKeys(value, keys, label) {
    requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
    requireCondition(Object.keys(value).sort().join(',') === keys, `${label} has missing or unsupported fields (expected ${keys})`);
}

function requireFields(value, required, optional, label) {
    requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
    const present = Object.keys(value), requiredKeys = required.split(','), optionalKeys = optional.split(',');
    requireCondition(requiredKeys.every(key => present.includes(key)) && present.every(key => requiredKeys.includes(key) || optionalKeys.includes(key)), `${label} has missing or unsupported fields (required ${required}; optional ${optional})`);
}

const requireRange = (value, label, minimum, maximum) => { requireFinite(value, label); requireCondition(value >= minimum && value <= maximum, `${label} must be in ${minimum}..${maximum}`); return value; };
const requireUnitRange = (pair, label) => {
    requireCondition(Array.isArray(pair) && pair.length === 2, `${label} must be a [min, max] pair`);
    requireFinite(pair[0], `${label}[0]`); requireFinite(pair[1], `${label}[1]`);
    requireCondition(pair[0] <= pair[1] && pair[0] >= 0, `${label} must be an ascending nonnegative pair`);
    return Object.freeze([pair[0], pair[1]]);
};
const isPowerOfTwo = value => Number.isSafeInteger(value) && value > 0 && (value & (value - 1)) === 0;

function validateTerms(terms, label) {
    requireCondition(Array.isArray(terms) && terms.length <= ECOSYSTEM_MAX_DENSITY_TERMS, `${label} must be an array of at most ${ECOSYSTEM_MAX_DENSITY_TERMS} terms`);
    return Object.freeze(terms.map((term, i) => {
        requireCondition(!!term && typeof term === 'object' && ['input', 'curve', 'group'].every(key => key in term || key === 'group') && Object.keys(term).every(key => ['input', 'curve', 'group'].includes(key)), `${label}[${i}] must declare input and curve (and an optional group)`);
        requireCondition(typeof term.input === 'string' && isEcosystemRuleInput(term.input), `${label}[${i}].input ${term.input} is not an ecosystem rule input`);
        const result = { input: term.input, curve: validateEcosystemCurve(term.curve, `${label}[${i}].curve`) };
        if (term.group !== undefined) { requireCondition(typeof term.group === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/.test(term.group), `${label}[${i}].group must be a short identifier`); result.group = term.group; }
        return Object.freeze(result);
    }));
}

function validateAssetSet(id, asset) {
    requireId(id, 'asset set id');
    requireCondition(!!asset && typeof asset === 'object' && ECOSYSTEM_ASSET_KINDS.includes(asset.kind), `asset set ${id} must declare a kind (${ECOSYSTEM_ASSET_KINDS.join(', ')})`);
    requireRange(asset.footprintRadiusMeters, `asset set ${id}.footprintRadiusMeters`, 0, 64);
    requireRange(asset.heightMeters, `asset set ${id}.heightMeters`, .01, 128);
    requireCondition(Array.isArray(asset.lods) && asset.lods.length >= 1 && asset.lods.length <= ECOSYSTEM_RECIPE_LIMITS.lods, `asset set ${id}.lods must list 1..${ECOSYSTEM_RECIPE_LIMITS.lods} levels`);
    const levels = asset.lods.map((lod, i) => { requireInteger(lod?.level, 0, 15, `asset set ${id}.lods[${i}].level`); return lod.level; });
    requireCondition(levels.every((level, i) => i === 0 || level > levels[i - 1]), `asset set ${id}.lods levels must increase`);
    if (asset.kind === 'placeholder-rocks') {
        requireKeys(asset, 'footprintRadiusMeters,heightMeters,kind,lods,seed,variants', `asset set ${id}`);
        requireInteger(asset.variants, 1, ECOSYSTEM_RECIPE_LIMITS.variants, `asset set ${id}.variants`);
        requireInteger(asset.seed, 0, 0xffffffff, `asset set ${id}.seed`);
        const lods = asset.lods.map((lod, i) => { requireKeys(lod, 'level,triangles', `asset set ${id}.lods[${i}]`); requireInteger(lod.triangles, 2, 65536, `asset set ${id}.lods[${i}].triangles`); return Object.freeze({ level: lod.level, triangles: lod.triangles }); });
        return Object.freeze({ kind: asset.kind, variants: asset.variants, seed: asset.seed, footprintRadiusMeters: asset.footprintRadiusMeters, heightMeters: asset.heightMeters, lods: Object.freeze(lods) });
    }
    requireKeys(asset, 'footprintRadiusMeters,heightMeters,kind,lods,species,variants', `asset set ${id}`);
    requireCondition(ECOSYSTEM_CATALOG_SPECIES.includes(asset.species), `asset set ${id}.species must be a catalog species (${ECOSYSTEM_CATALOG_SPECIES.join(', ')})`);
    requireCondition(Array.isArray(asset.variants) && asset.variants.length >= 1 && new Set(asset.variants).size === asset.variants.length && asset.variants.every(variant => ECOSYSTEM_CATALOG_VARIANTS.includes(variant)), `asset set ${id}.variants must list distinct catalog variants`);
    const lods = asset.lods.map((lod, i) => { requireKeys(lod, 'level', `asset set ${id}.lods[${i}]`); requireCondition(ECOSYSTEM_CATALOG_LEVELS.includes(lod.level), `asset set ${id}.lods[${i}].level must be a distant catalog level (${ECOSYSTEM_CATALOG_LEVELS.join(', ')})`); return Object.freeze({ level: lod.level }); });
    return Object.freeze({ kind: asset.kind, species: asset.species, variants: Object.freeze([...asset.variants]), footprintRadiusMeters: asset.footprintRadiusMeters, heightMeters: asset.heightMeters, lods: Object.freeze(lods) });
}

function validateAlignment(value, label) {
    const alignment = value ?? { mode: 'upright' };
    requireCondition(!!alignment && typeof alignment === 'object' && ECOSYSTEM_ALIGNMENT_MODES.includes(alignment.mode), `${label}.mode must be one of ${ECOSYSTEM_ALIGNMENT_MODES.join(', ')}`);
    requireCondition(Object.keys(alignment).every(key => KEYS.alignment.split(',').includes(key)), `${label} has unsupported fields`);
    const slopeWeight = alignment.slopeWeight ?? (alignment.mode === 'slope' ? 1 : 0), sinkMeters = alignment.sinkMeters ?? 0;
    requireRange(slopeWeight, `${label}.slopeWeight`, 0, 1); requireRange(sinkMeters, `${label}.sinkMeters`, 0, 16);
    requireCondition(alignment.mode !== 'sunk' || sinkMeters > 0, `${label} mode sunk requires a positive sinkMeters`);
    requireCondition(alignment.sinkScalesWithSize === undefined || typeof alignment.sinkScalesWithSize === 'boolean', `${label}.sinkScalesWithSize must be boolean`);
    return Object.freeze({ mode: alignment.mode, slopeWeight, sinkMeters, sinkScalesWithSize: alignment.sinkScalesWithSize ?? true });
}

function validateVariation(value, label) {
    const variation = value ?? {};
    requireCondition(!!variation && typeof variation === 'object' && Object.keys(variation).every(key => KEYS.variation.split(',').includes(key)), `${label} has unsupported fields`);
    const scale = variation.scale ?? { min: 1, max: 1, distribution: 'uniform' };
    requireKeys(scale, KEYS.scale, `${label}.scale`);
    requireRange(scale.min, `${label}.scale.min`, .01, 100); requireRange(scale.max, `${label}.scale.max`, scale.min, 100);
    requireCondition(ECOSYSTEM_SCALE_DISTRIBUTIONS.includes(scale.distribution), `${label}.scale.distribution must be one of ${ECOSYSTEM_SCALE_DISTRIBUTIONS.join(', ')}`);
    const yaw = variation.yaw ?? 'random';
    requireCondition(ECOSYSTEM_YAW_MODES.includes(yaw), `${label}.yaw must be one of ${ECOSYSTEM_YAW_MODES.join(', ')}`);
    const tint = variation.tint ?? { value: [1, 1], channels: { r: [1, 1], g: [1, 1], b: [1, 1] } };
    requireKeys(tint, KEYS.tint, `${label}.tint`);
    requireKeys(tint.channels, 'b,g,r', `${label}.tint.channels`);
    const channels = Object.freeze({ r: requireUnitRange(tint.channels.r, `${label}.tint.channels.r`), g: requireUnitRange(tint.channels.g, `${label}.tint.channels.g`), b: requireUnitRange(tint.channels.b, `${label}.tint.channels.b`) });
    return Object.freeze({ scale: Object.freeze({ min: scale.min, max: scale.max, distribution: scale.distribution }), yaw, tint: Object.freeze({ value: requireUnitRange(tint.value, `${label}.tint.value`), channels }) });
}

function validateLayer(id, layer, recipe) {
    requireId(id, 'layer id');
    requireCondition(!/[:,]/.test(id), `layer id ${id} must not contain ':' or ',' (instance ids use them)`);
    requireFields(layer, KEYS.layerRequired, KEYS.layerOptional, `layer ${id}`);
    requireCondition(layer.id === id, `layer ${id} must carry its own id`);
    requireCondition(typeof layer.label === 'string' && layer.label.length > 0 && layer.label.length <= ECOSYSTEM_RECIPE_LIMITS.nameLength, `layer ${id}.label is required`);
    requireCondition(Object.hasOwn(recipe.assets, layer.assetSet), `layer ${id} names an unknown asset set ${layer.assetSet}`);
    requireCondition(ECOSYSTEM_GENERATION_MODES.includes(layer.generation), `layer ${id}.generation must be offline or runtime`);
    requireKeys(layer.cell, 'meters,sitesPerAxis', `layer ${id}.cell`);
    requireCondition(isPowerOfTwo(layer.cell.meters) && layer.cell.meters >= ECOSYSTEM_RECIPE_LIMITS.cellMeters[0] && layer.cell.meters <= ECOSYSTEM_RECIPE_LIMITS.cellMeters[1], `layer ${id}.cell.meters must be a power of two in ${ECOSYSTEM_RECIPE_LIMITS.cellMeters.join('..')}`);
    requireCondition(isPowerOfTwo(layer.cell.sitesPerAxis) && layer.cell.sitesPerAxis >= ECOSYSTEM_RECIPE_LIMITS.sitesPerAxis[0] && layer.cell.sitesPerAxis <= ECOSYSTEM_RECIPE_LIMITS.sitesPerAxis[1], `layer ${id}.cell.sitesPerAxis must be a power of two in ${ECOSYSTEM_RECIPE_LIMITS.sitesPerAxis.join('..')}`);
    requireKeys(layer.footprint, 'clearanceMeters,radiusMeters', `layer ${id}.footprint`);
    requireRange(layer.footprint.radiusMeters, `layer ${id}.footprint.radiusMeters`, 0, 64); requireRange(layer.footprint.clearanceMeters, `layer ${id}.footprint.clearanceMeters`, 0, 256);
    const jitter = layer.jitter ?? .35;
    requireRange(jitter, `layer ${id}.jitter`, 0, .5);
    const spacing = layer.cell.meters / layer.cell.sitesPerAxis;
    requireCondition(layer.footprint.radiusMeters === 0 || spacing * (1 - 2 * jitter) >= 2 * layer.footprint.radiusMeters,
        `layer ${id}: the site spacing ${spacing} m with jitter ${jitter} cannot keep footprints of radius ${layer.footprint.radiusMeters} m apart (spacing × (1 − 2·jitter) must reach the footprint diameter)`);
    requireRange(layer.viewDistanceMeters, `layer ${id}.viewDistanceMeters`, ECOSYSTEM_RECIPE_LIMITS.viewDistanceMeters[0], ECOSYSTEM_RECIPE_LIMITS.viewDistanceMeters[1]);
    const asset = recipe.assets[layer.assetSet], assetLevels = asset.lods.map(lod => lod.level);
    requireCondition(Array.isArray(layer.lods) && layer.lods.length >= 1 && layer.lods.length <= ECOSYSTEM_RECIPE_LIMITS.lods, `layer ${id}.lods must list 1..${ECOSYSTEM_RECIPE_LIMITS.lods} entries`);
    const lods = layer.lods.map((lod, i) => {
        requireKeys(lod, 'distanceMeters,level', `layer ${id}.lods[${i}]`);
        requireCondition(assetLevels.includes(lod.level), `layer ${id}.lods[${i}].level ${lod.level} is not a level of asset set ${layer.assetSet}`);
        requireRange(lod.distanceMeters, `layer ${id}.lods[${i}].distanceMeters`, 1, ECOSYSTEM_RECIPE_LIMITS.viewDistanceMeters[1]);
        requireCondition(i === 0 || (lod.level > layer.lods[i - 1].level && lod.distanceMeters > layer.lods[i - 1].distanceMeters), `layer ${id}.lods must increase in level and distance`);
        return Object.freeze({ level: lod.level, distanceMeters: lod.distanceMeters });
    });
    requireCondition(lods[lods.length - 1].distanceMeters === layer.viewDistanceMeters, `layer ${id}: the last LOD must reach viewDistanceMeters`);
    const fadeMeters = layer.fadeMeters ?? Math.max(5, layer.viewDistanceMeters * .05);
    requireRange(fadeMeters, `layer ${id}.fadeMeters`, 0, lods[0].distanceMeters);
    const shadow = layer.shadow ?? { castLevels: [], maxDistanceMeters: 0 };
    requireKeys(shadow, KEYS.shadow, `layer ${id}.shadow`);
    requireCondition(Array.isArray(shadow.castLevels) && shadow.castLevels.every(level => assetLevels.includes(level)) && new Set(shadow.castLevels).size === shadow.castLevels.length, `layer ${id}.shadow.castLevels must list distinct asset levels`);
    requireRange(shadow.maxDistanceMeters, `layer ${id}.shadow.maxDistanceMeters`, 0, layer.viewDistanceMeters);
    const rules = layer.rules;
    requireCondition(!!rules && typeof rules === 'object' && Object.keys(rules).every(key => KEYS.rules.split(',').includes(key)) && rules.density !== undefined && rules.competition !== undefined && rules.exclusions !== undefined, `layer ${id}.rules must declare density, competition and exclusions (clumping and parent are optional)`);
    const density = validateTerms(rules.density, `layer ${id}.rules.density`);
    requireCondition(density.length >= 1, `layer ${id}.rules.density needs at least one term`);
    let clumping = null;
    if (rules.clumping !== undefined && rules.clumping !== null) {
        requireKeys(rules.clumping, 'contrast,octaves,threshold,wavelengthMeters', `layer ${id}.rules.clumping`);
        requireRange(rules.clumping.wavelengthMeters, `layer ${id}.rules.clumping.wavelengthMeters`, 1, 4000); requireRange(rules.clumping.contrast, `layer ${id}.rules.clumping.contrast`, 0, 1);
        requireRange(rules.clumping.threshold, `layer ${id}.rules.clumping.threshold`, 0, 1); requireInteger(rules.clumping.octaves, 1, 3, `layer ${id}.rules.clumping.octaves`);
        clumping = Object.freeze({ wavelengthMeters: rules.clumping.wavelengthMeters, contrast: rules.clumping.contrast, threshold: rules.clumping.threshold, octaves: rules.clumping.octaves });
    }
    let parent = null;
    if (rules.parent !== undefined && rules.parent !== null) {
        requireKeys(rules.parent, 'count,inheritScale,layer,radiusMeters', `layer ${id}.rules.parent`);
        requireCondition(typeof rules.parent.layer === 'string' && rules.parent.layer !== id, `layer ${id}.rules.parent.layer must name another layer`);
        requireCondition(Array.isArray(rules.parent.count) && rules.parent.count.length === 2, `layer ${id}.rules.parent.count must be [min, max]`);
        requireInteger(rules.parent.count[0], 0, ECOSYSTEM_RECIPE_LIMITS.childCount, `layer ${id}.rules.parent.count[0]`); requireInteger(rules.parent.count[1], rules.parent.count[0], ECOSYSTEM_RECIPE_LIMITS.childCount, `layer ${id}.rules.parent.count[1]`);
        const radius = requireUnitRange(rules.parent.radiusMeters, `layer ${id}.rules.parent.radiusMeters`);
        requireCondition(radius[0] > 0, `layer ${id}.rules.parent.radiusMeters must be positive`);
        requireRange(rules.parent.inheritScale, `layer ${id}.rules.parent.inheritScale`, 0, 1);
        parent = Object.freeze({ layer: rules.parent.layer, count: Object.freeze([rules.parent.count[0], rules.parent.count[1]]), radiusMeters: radius, inheritScale: rules.parent.inheritScale });
    }
    requireKeys(rules.competition, KEYS.competition, `layer ${id}.rules.competition`);
    requireInteger(rules.competition.priority, ECOSYSTEM_RECIPE_LIMITS.priority[0], ECOSYSTEM_RECIPE_LIMITS.priority[1], `layer ${id}.rules.competition.priority`);
    const clearanceMeters = rules.competition.clearanceMeters ?? layer.footprint.clearanceMeters;
    requireRange(clearanceMeters, `layer ${id}.rules.competition.clearanceMeters`, 0, 256);
    requireCondition(rules.competition.against === 'all' || (Array.isArray(rules.competition.against) && rules.competition.against.every(other => typeof other === 'string')), `layer ${id}.rules.competition.against must be 'all' or a list of layer ids`);
    const competition = Object.freeze({ priority: rules.competition.priority, clearanceMeters, against: rules.competition.against === 'all' ? 'all' : Object.freeze([...rules.competition.against]) });
    requireCondition(Array.isArray(rules.exclusions) && rules.exclusions.length <= 16, `layer ${id}.rules.exclusions must be an array of at most 16 zones`);
    const exclusions = rules.exclusions.map((exclusion, i) => {
        requireCondition(!!exclusion && typeof exclusion === 'object' && Object.keys(exclusion).every(key => ['zone', 'marginMeters'].includes(key)) && typeof exclusion.zone === 'string', `layer ${id}.rules.exclusions[${i}] must declare a zone`);
        requireCondition(ECOSYSTEM_BUILTIN_ZONES.includes(exclusion.zone) || Object.hasOwn(recipe.zones, exclusion.zone), `layer ${id}.rules.exclusions[${i}] names an unknown zone ${exclusion.zone}`);
        const marginMeters = exclusion.marginMeters ?? 0;
        requireRange(marginMeters, `layer ${id}.rules.exclusions[${i}].marginMeters`, 0, 256);
        return Object.freeze({ zone: exclusion.zone, marginMeters });
    });
    requireCondition(new Set(exclusions.map(exclusion => exclusion.zone)).size === exclusions.length, `layer ${id}.rules.exclusions repeats a zone`);
    return Object.freeze({ id, label: layer.label, assetSet: layer.assetSet, generation: layer.generation, cell: Object.freeze({ meters: layer.cell.meters, sitesPerAxis: layer.cell.sitesPerAxis }),
        footprint: Object.freeze({ radiusMeters: layer.footprint.radiusMeters, clearanceMeters: layer.footprint.clearanceMeters }), jitter, alignment: validateAlignment(layer.alignment, `layer ${id}.alignment`),
        variation: validateVariation(layer.variation, `layer ${id}.variation`), viewDistanceMeters: layer.viewDistanceMeters, lods: Object.freeze(lods), fadeMeters,
        shadow: Object.freeze({ castLevels: Object.freeze([...shadow.castLevels]), maxDistanceMeters: shadow.maxDistanceMeters }),
        rules: Object.freeze({ density, clumping, parent, competition, exclusions: Object.freeze(exclusions) }) });
}

/** The site spacing of a layer in metres. @param {{cell:{meters:number,sitesPerAxis:number}}} layer */
export function ecosystemLayerSpacing(layer) { return layer.cell.meters / layer.cell.sitesPerAxis; }

/** The distance within which a feature of layer `other` rejects a candidate of `layer`. */
export function ecosystemCompetitionDistance(layer, other) {
    return Math.max(layer.footprint.radiusMeters + other.footprint.radiusMeters, layer.rules.competition.clearanceMeters);
}

/** Layers of higher priority a layer competes against, in descending priority. @param {any} recipe validated @param {any} layer */
export function ecosystemCompetitors(recipe, layer) {
    const against = layer.rules.competition.against;
    return ecosystemLayerPriorityOrder(recipe).map(id => recipe.layers[id]).filter(other => other.rules.competition.priority > layer.rules.competition.priority && (against === 'all' || against.includes(other.id)));
}

/**
 * The generation halo of a layer in metres: how far outside its cell the generator must look (competitors' features, the parent's features).
 * Bounded by validation to half of every competitor's or parent's cell, so one ring of their cells covers it.
 * @param {any} recipe validated @param {any} layer
 */
export function ecosystemLayerHaloMeters(recipe, layer) {
    let halo = 0;
    for (const other of ecosystemCompetitors(recipe, layer)) halo = Math.max(halo, ecosystemCompetitionDistance(layer, other));
    if (layer.rules.parent) halo = Math.max(halo, layer.rules.parent.radiusMeters[1]);
    return halo;
}

/** Layer ids by descending competition priority (priorities are unique per recipe). @param {any} recipe validated */
export function ecosystemLayerPriorityOrder(recipe) {
    return Object.values(recipe.layers).sort((a, b) => b.rules.competition.priority - a.rules.competition.priority).map(layer => layer.id);
}

/**
 * Validates and deep-freezes a recipe document (defaults filled; unknown fields rejected; key order irrelevant).
 * @param {unknown} input @returns {any}
 */
export function validateEcosystemRecipe(input) {
    const value = clonePlainData(input, 'ecosystem recipe');
    requireKeys(value, KEYS.recipe, 'ecosystem recipe');
    requireCondition(value.format === ECOSYSTEM_RECIPE_FORMAT && value.schemaVersion === ECOSYSTEM_RECIPE_SCHEMA_VERSION, 'unsupported ecosystem recipe format/schemaVersion');
    requireId(value.id, 'ecosystem recipe id');
    requireCondition(typeof value.name === 'string' && value.name.length > 0 && value.name.length <= ECOSYSTEM_RECIPE_LIMITS.nameLength, 'ecosystem recipe name is required');
    requireInteger(value.seed, 0, 0xffffffff, 'ecosystem recipe seed');
    requireCondition(!!value.zones && typeof value.zones === 'object' && !Array.isArray(value.zones) && Object.keys(value.zones).length <= ECOSYSTEM_RECIPE_LIMITS.zones, 'ecosystem recipe zones must be an object');
    const zones = {};
    for (const [id, region] of Object.entries(value.zones)) {
        requireId(id, `zone id ${id}`); requireCondition(!ECOSYSTEM_BUILTIN_ZONES.includes(id), `zone ${id} shadows a built-in zone`);
        zones[id] = validateLandscapeRegion(region, { allowPoint: false });
    }
    requireCondition(!!value.assets && typeof value.assets === 'object' && !Array.isArray(value.assets) && Object.keys(value.assets).length >= 1 && Object.keys(value.assets).length <= ECOSYSTEM_RECIPE_LIMITS.assets, 'ecosystem recipe needs 1..32 asset sets');
    const assets = {};
    for (const [id, asset] of Object.entries(value.assets)) assets[id] = validateAssetSet(id, asset);
    requireCondition(!!value.layers && typeof value.layers === 'object' && !Array.isArray(value.layers) && Object.keys(value.layers).length >= 1 && Object.keys(value.layers).length <= ECOSYSTEM_RECIPE_LIMITS.layers, 'ecosystem recipe needs 1..32 layers');
    const partial = { assets, zones }, layers = {};
    for (const [id, layer] of Object.entries(value.layers)) layers[id] = validateLayer(id, layer, partial);
    const recipe = { format: value.format, schemaVersion: value.schemaVersion, id: value.id, name: value.name, seed: value.seed, zones, assets, layers, biomes: {}, targets: {} };
    const priorities = new Map();
    for (const layer of Object.values(layers)) {
        requireCondition(!priorities.has(layer.rules.competition.priority), `layers ${priorities.get(layer.rules.competition.priority)} and ${layer.id} share priority ${layer.rules.competition.priority}`);
        priorities.set(layer.rules.competition.priority, layer.id);
        if (layer.rules.competition.against !== 'all') for (const other of layer.rules.competition.against) {
            requireCondition(Object.hasOwn(layers, other), `layer ${layer.id} competes against an unknown layer ${other}`);
            requireCondition(layers[other].rules.competition.priority > layer.rules.competition.priority, `layer ${layer.id} can only compete against layers of higher priority (${other} is not)`);
        }
        for (const other of ecosystemCompetitors(recipe, layer)) requireCondition(ecosystemCompetitionDistance(layer, other) <= other.cell.meters / 2, `layer ${layer.id}: the competition distance to ${other.id} exceeds half of its ${other.cell.meters} m cell (locality)`);
        if (layer.rules.parent) {
            const parent = layers[layer.rules.parent.layer];
            requireCondition(!!parent, `layer ${layer.id} names an unknown parent layer ${layer.rules.parent.layer}`);
            requireCondition(parent.rules.competition.priority > layer.rules.competition.priority, `layer ${layer.id}: the parent ${parent.id} must have a higher priority`);
            requireCondition(!parent.rules.parent, `layer ${layer.id}: a parent layer cannot itself be a child layer`);
            requireCondition(layer.rules.parent.radiusMeters[1] <= parent.cell.meters / 2, `layer ${layer.id}: the child radius exceeds half of the parent's ${parent.cell.meters} m cell (locality)`);
        }
        for (const term of layer.rules.density) if (term.input.startsWith('distance.layer.')) {
            const other = term.input.slice('distance.layer.'.length);
            requireCondition(Object.hasOwn(layers, other) && layers[other].rules.competition.priority > layer.rules.competition.priority, `layer ${layer.id} reads distance.layer.${other}, which must be a layer of higher priority`);
        }
    }
    requireCondition(!!value.biomes && typeof value.biomes === 'object' && !Array.isArray(value.biomes) && Object.keys(value.biomes).length >= 1 && Object.keys(value.biomes).length <= ECOSYSTEM_RECIPE_LIMITS.biomes, 'ecosystem recipe needs 1..16 biomes');
    const assigned = new Map();
    for (const [id, biome] of Object.entries(value.biomes)) {
        requireId(id, `biome id ${id}`);
        requireCondition(!!biome && typeof biome === 'object' && Object.keys(biome).every(key => KEYS.biome.split(',').includes(key)) && typeof biome.label === 'string' && biome.label.length > 0 && Array.isArray(biome.layers) && biome.layers.length >= 1, `biome ${id} needs a label and an ordered layer list`);
        biome.layers.forEach((layerId, i) => {
            requireCondition(Object.hasOwn(layers, layerId), `biome ${id} lists an unknown layer ${layerId}`);
            requireCondition(!assigned.has(layerId), `layer ${layerId} belongs to biomes ${assigned.get(layerId)} and ${id}; a layer belongs to exactly one biome`);
            assigned.set(layerId, id);
            requireCondition(i === 0 || layers[biome.layers[i - 1]].rules.competition.priority > layers[layerId].rules.competition.priority, `biome ${id} must list its layers in descending priority`);
        });
        recipe.biomes[id] = Object.freeze({ label: biome.label, layers: Object.freeze([...biome.layers]), where: biome.where === undefined ? Object.freeze([]) : validateTerms(biome.where, `biome ${id}.where`) });
    }
    for (const layerId of Object.keys(layers)) requireCondition(assigned.has(layerId), `layer ${layerId} belongs to no biome`);
    requireCondition(!!value.targets && typeof value.targets === 'object' && !Array.isArray(value.targets) && Object.keys(value.targets).length <= ECOSYSTEM_RECIPE_LIMITS.targets, 'ecosystem recipe targets must be an object');
    for (const [id, target] of Object.entries(value.targets)) {
        requireId(id, `target id ${id}`);
        requireKeys(target, 'basis,perSquareKilometer', `target ${id}`);
        requireRange(target.perSquareKilometer, `target ${id}.perSquareKilometer`, 0, 1e9);
        requireCondition(typeof target.basis === 'string' && target.basis.length > 0 && target.basis.length <= 400, `target ${id}.basis must explain the number`);
        recipe.targets[id] = Object.freeze({ perSquareKilometer: target.perSquareKilometer, basis: target.basis });
    }
    return freezeData(recipe);
}

/** Canonical JSON (sorted keys at every depth) of plain data, the text the recipe and override identities hash. @param {unknown} value */
export function canonicalEcosystemJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalEcosystemJson).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalEcosystemJson(value[key])}`).join(',')}}`;
}

async function sha256Hex(text) {
    requireCondition(!!globalThis.crypto?.subtle, 'Ecosystem identity requires Web Crypto');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** `ecosystem-recipe-<24 hex>` of a validated recipe's canonical JSON. @param {any} recipe validated @returns {Promise<string>} */
export async function ecosystemRecipeIdentity(recipe) { return `ecosystem-recipe-${(await sha256Hex(canonicalEcosystemJson(validateEcosystemRecipe(recipe)))).slice(0, 24)}`; }
