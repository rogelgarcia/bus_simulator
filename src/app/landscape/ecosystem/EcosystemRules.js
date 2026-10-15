// Defines the landscape-ecosystem v1 rule inputs, density curves and the traced rule evaluation shared by the offline bake and the runtime worker.
// @ts-check
// Design: a rule reads named scalar inputs at a position (terrain, fields, geology, soil and cover, planning distances, distances to other
// layers and the AI577 dressing inputs) and yields a density in [0, 1]: the probability-like fraction of lattice sites a layer keeps there. Every
// input has a documented neutral value that stands in when its source is absent (no fields or geology sidecar, no planning references), so a
// recipe evaluates on any landscape and reports which sources were present. Density terms are piecewise-linear curves; terms of one group combine
// by maximum (an "any of these habitats" rule), groups multiply (every condition must hold). The compiled form evaluates a Float64Array vector
// indexed by the catalog so a bake evaluates millions of sites without per-site objects, and the trace names every factor for the inspection hook.
import { LANDSCAPE_DRESSING_INPUTS } from '../LandscapeDressingInputs.js';
import { LANDSCAPE_GEOLOGY_CATEGORIES, LANDSCAPE_GEOLOGY_CHANNELS } from '../LandscapeGeology.js';
import { requireCondition, requireFinite } from '../internal/LandscapeValidation.js';

export const ECOSYSTEM_ALGORITHM = 'landscape-ecosystem-v1';
/** Distances in metres saturate here (the terrain fields' shore distance saturates at the same reach). */
export const ECOSYSTEM_DISTANCE_CAP = 256;
export const ECOSYSTEM_SOILS = Object.freeze(['unknown', 'seabed', 'sand', 'loam', 'forest', 'rock']);
/** Land-cover class names in catalog id order (LANDSCAPE_MODEL.md: 0 water … 7 runway). */
export const ECOSYSTEM_COVER_CLASSES = Object.freeze(['water', 'sand', 'grass', 'forest', 'rock', 'urban', 'road', 'runway']);
export const ECOSYSTEM_PLANNING_COVER_IDS = Object.freeze([5, 6, 7]);
/** Exclusion zones a layer may name beside the recipe's own zones. */
export const ECOSYSTEM_BUILTIN_ZONES = Object.freeze(['planning-cover', 'roads', 'districts', 'water', 'faces', 'view-corridor']);
export const ECOSYSTEM_MAX_CURVE_POINTS = 16;
export const ECOSYSTEM_MAX_DENSITY_TERMS = 24;

const input = (name, neutral, unit, description) => Object.freeze({ name, neutral, unit, description });
const FIXED_INPUTS = [
    input('slopeDegrees', 0, 'degrees', 'slope of the exact native triangle at the anchor'),
    input('aspectNorth', 0, 'unit', 'north component of the downslope direction (+1 faces north, -1 faces south, 0 flat or east/west)'),
    input('aspectEast', 0, 'unit', 'east component of the downslope direction'),
    input('altitudeMeters', 0, 'meters', 'native height above sea level'),
    input('moisture', .5, 'unit', 'terrain-fields wetness (topographic wetness index)'),
    input('light', 1, 'unit', 'terrain-fields sky view (fraction of the isotropic sky)'),
    input('shoreDistanceMeters', ECOSYSTEM_DISTANCE_CAP, 'meters', 'signed shore distance, land positive, saturating at ±256 m'),
    input('flow', 0, 'unit', 'terrain-fields normalized log specific catchment area'),
    input('deposition', 0, 'unit', 'terrain-fields normalized deposition'),
    input('rockExposure', 0, 'unit', 'terrain-fields rock exposure'),
    input('convexity', 0, 'signed unit', 'terrain-fields multi-scale convexity (-1 concave … 1 convex)'),
    input('planningShare', 0, 'unit', '1 where the nearest native land cover is planning-only (urban, road, runway)'),
    input('geology.lithology', 0, 'label', 'stratum label of the bedrock surface (0 unstratified)'),
    input('distance.roads', ECOSYSTEM_DISTANCE_CAP, 'meters', 'distance to the nearest planning road edge (centerline less half its width), 0 on the road'),
    input('distance.districts', ECOSYSTEM_DISTANCE_CAP, 'meters', 'distance to the nearest district polygon, 0 inside'),
    input('distance.water', ECOSYSTEM_DISTANCE_CAP, 'meters', 'distance to the sea (the positive shore distance), 0 at or below sea level')
];
const SOIL_INPUTS = ECOSYSTEM_SOILS.map(id => input(`soil.${id}`, id === 'unknown' ? 1 : 0, 'unit', `semantic soil coverage weight of ${id} at the nearest native sample`));
const NATURAL_SOIL_INPUTS = ECOSYSTEM_SOILS.map(id => input(`naturalSoil.${id}`, id === 'unknown' ? 1 : 0, 'unit', `display soil weight of ${id} (the terrain-driven natural soil under planning cover, the semantic soil elsewhere)`));
const COVER_INPUTS = ECOSYSTEM_COVER_CLASSES.map(name => input(`cover.${name}`, 0, 'unit', `1 where the nearest native land cover is ${name}`));
const COVER_DISTANCE_INPUTS = ECOSYSTEM_COVER_CLASSES.map(name => input(`distance.cover.${name}`, ECOSYSTEM_DISTANCE_CAP, 'meters', `distance to the nearest native sample of cover ${name} within the halo (0 on it)`));
const GEOLOGY_CHANNEL_INPUTS = LANDSCAPE_GEOLOGY_CHANNELS.map(channel => input(`geology.${channel.name}`, 0, channel.scale === 1 ? 'unit' : 'meters', channel.unit));
const GEOLOGY_LABEL_INPUTS = LANDSCAPE_GEOLOGY_CATEGORIES.filter(category => category.labels).flatMap(category => category.labels.map((label, index) =>
    input(`geology.${category.name}.${label}`, index === 0 ? 1 : 0, 'unit', `1 where the nearest aligned geology sample's ${category.name} is ${label}`)));
const DRESSING_INPUTS = LANDSCAPE_DRESSING_INPUTS.outputs.map(name => input(`dressing.${name}`, 0, 'unit', `landscape-dressing-inputs v1 ${name} of the display soil and fields at the anchor`));

/** Every fixed rule input (the per-recipe `distance.layer.<layerId>` inputs are added by createEcosystemInputCatalog). */
export const ECOSYSTEM_RULE_INPUTS = Object.freeze([...FIXED_INPUTS, ...SOIL_INPUTS, ...NATURAL_SOIL_INPUTS, ...COVER_INPUTS, ...COVER_DISTANCE_INPUTS, ...GEOLOGY_CHANNEL_INPUTS, ...GEOLOGY_LABEL_INPUTS, ...DRESSING_INPUTS]);
const FIXED_BY_NAME = new Map(ECOSYSTEM_RULE_INPUTS.map(entry => [entry.name, entry]));

/** @param {string} name a fixed input name or `distance.layer.<layerId>` */
export function isEcosystemRuleInput(name) { return FIXED_BY_NAME.has(name) || /^distance\.layer\.[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name); }

/**
 * The ordered input vector of a recipe: the fixed inputs followed by one `distance.layer.<layerId>` per layer (recipe layer order), with
 * neutral values; `index(name)` resolves a name once so rules and samplers address the Float64Array directly.
 * @param {readonly string[]} layerIds
 */
export function createEcosystemInputCatalog(layerIds) {
    requireCondition(Array.isArray(layerIds) && new Set(layerIds).size === layerIds.length, 'ecosystem input catalog needs distinct layer ids');
    const entries = Object.freeze([...ECOSYSTEM_RULE_INPUTS, ...layerIds.map(id => input(`distance.layer.${id}`, ECOSYSTEM_DISTANCE_CAP, 'meters', `distance to the nearest feature of layer ${id} within the halo (higher-priority layers only)`))]);
    const indices = new Map(entries.map((entry, i) => [entry.name, i]));
    const neutral = Float64Array.from(entries, entry => entry.neutral);
    return Object.freeze({
        entries, size: entries.length,
        /** @param {string} name */
        index(name) { const value = indices.get(name); requireCondition(value !== undefined, `unknown ecosystem rule input ${name}`); return value; },
        has(name) { return indices.has(name); },
        /** A fresh vector holding every neutral value. */
        neutralVector() { return Float64Array.from(neutral); },
        /** Resets a vector to the neutral values. @param {Float64Array} vector */
        reset(vector) { vector.set(neutral); return vector; }
    });
}

/**
 * Validates a piecewise-linear curve: 2..16 points with strictly increasing x and y in [0, 1].
 * @param {unknown} curve @param {string} label @returns {ReadonlyArray<readonly [number, number]>}
 */
export function validateEcosystemCurve(curve, label) {
    requireCondition(Array.isArray(curve) && curve.length >= 2 && curve.length <= ECOSYSTEM_MAX_CURVE_POINTS, `${label} must be a curve of 2..${ECOSYSTEM_MAX_CURVE_POINTS} points`);
    const points = curve.map((point, i) => {
        requireCondition(Array.isArray(point) && point.length === 2, `${label}[${i}] must be an [x, y] pair`);
        requireFinite(point[0], `${label}[${i}].x`); requireFinite(point[1], `${label}[${i}].y`);
        requireCondition(point[1] >= 0 && point[1] <= 1, `${label}[${i}].y must be in [0, 1]`);
        requireCondition(i === 0 || point[0] > curve[i - 1][0], `${label} x values must increase strictly`);
        return Object.freeze([point[0], point[1]]);
    });
    return Object.freeze(points);
}

/** Evaluates a validated curve at x, clamped to its end values. @param {ReadonlyArray<readonly [number, number]>} points @param {number} x */
export function evaluateEcosystemCurve(points, x) {
    const last = points.length - 1;
    if (x <= points[0][0]) return points[0][1];
    if (x >= points[last][0]) return points[last][1];
    let i = 1;
    while (points[i][0] < x) i++;
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
}

/**
 * Compiles a layer's density terms against the catalog: each term `{input, curve, group?}` resolves its input index; terms sharing a group
 * combine by maximum, groups multiply. Terms without a group form their own group.
 * @param {ReadonlyArray<{input:string,curve:any,group?:string}>} terms validated terms
 * @param {ReturnType<typeof createEcosystemInputCatalog>} catalog
 */
export function compileEcosystemDensity(terms, catalog) {
    const groups = new Map();
    terms.forEach((term, i) => {
        const key = term.group ?? `#${i}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ input: term.input, index: catalog.index(term.input), curve: term.curve, group: key });
    });
    return Object.freeze([...groups.values()].map(group => Object.freeze(group)));
}

/**
 * Evaluates compiled density groups over an input vector: the product over groups of the maximum curve value in the group.
 * @param {ReadonlyArray<ReadonlyArray<{input:string,index:number,curve:any,group:string}>>} groups @param {Float64Array} vector
 * @param {Array<{input:string,value:number,weight:number,group:string}>|null} [factors] when given, every term's input value and curve value is appended
 */
export function evaluateEcosystemDensity(groups, vector, factors = null) {
    let density = 1;
    for (const group of groups) {
        let best = 0;
        for (const term of group) {
            const value = vector[term.index], weight = evaluateEcosystemCurve(term.curve, value);
            if (weight > best) best = weight;
            if (factors) factors.push({ input: term.input, value, weight, group: term.group });
        }
        density *= best;
        if (density === 0 && !factors) break;
    }
    return density;
}

/**
 * The traced rule evaluation at one position: density after the curves, the clumping factor and the override scale, plus the exclusion that
 * rejected the site (or null). `clumping` and `densityScale` are supplied by the generator (noise and overrides live there).
 * @param {ReadonlyArray<ReadonlyArray<{input:string,index:number,curve:any,group:string}>>} groups
 * @param {Float64Array} vector @param {{clumping?:number,densityScale?:number,excluded?:string|null}} [context]
 * @returns {{density:number,curveDensity:number,clumping:number,densityScale:number,excluded:string|null,factors:Array<{input:string,value:number,weight:number,group:string}>}}
 */
export function traceEcosystemRule(groups, vector, { clumping = 1, densityScale = 1, excluded = null } = {}) {
    requireFinite(clumping, 'clumping'); requireFinite(densityScale, 'densityScale');
    const factors = [], curveDensity = evaluateEcosystemDensity(groups, vector, factors);
    const density = excluded ? 0 : Math.min(1, Math.max(0, curveDensity * clumping * densityScale));
    return { density, curveDensity, clumping, densityScale, excluded, factors };
}
