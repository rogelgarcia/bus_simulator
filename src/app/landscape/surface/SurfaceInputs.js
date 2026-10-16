// Builds the surface-model input vector from the resident sources (documented neutrals for unbound ones), the one-hot of four aligned categorical samples and the stratum hardness.
// @ts-check
import { requireCondition, requireFinite, requireInteger } from '../internal/LandscapeValidation.js';
import { LANDSCAPE_GEOLOGY_CATEGORIES } from '../LandscapeGeology.js';
import { LANDSCAPE_SURFACE_INPUT_INDEX, LANDSCAPE_SURFACE_INPUTS, LANDSCAPE_SURFACE_MODEL } from './SurfaceModel.js';

const INDEX = LANDSCAPE_SURFACE_INPUT_INDEX;
const FIELD_KEYS = Object.freeze(['wetness', 'flow', 'deposition', 'rockExposure', 'skyView', 'shoreDistance', 'convexity', 'slopeDegrees']);
const GEOLOGY_KEYS = Object.freeze([['bedrockOffset', 'bedrockOffset'], ['regolith', 'regolith'], ['depositThickness', 'depositThickness'], ['wear', 'wear'], ['deposition', 'geologyDeposition'],
    ['flow', 'geologyFlow'], ['waveExposure', 'waveExposure'], ['faceMask', 'faceMask']]);
const PREFIX = Object.freeze({ depositType: 'deposit', drainage: 'drainage', coastalZone: 'zone' });
/** The three labelled categories with their page layer, catalog size and first input index. */
export const LANDSCAPE_SURFACE_CATEGORIES = Object.freeze(LANDSCAPE_GEOLOGY_CATEGORIES.filter(category => category.labels !== null).map(category => Object.freeze({
    name: category.name, layer: category.layer, count: /** @type {readonly string[]} */ (category.labels).length, maximum: category.maximum,
    inputStart: INDEX[`${PREFIX[category.name]}.${/** @type {readonly string[]} */ (category.labels)[0]}`] })));
const LITHOLOGY_LAYER = LANDSCAPE_GEOLOGY_CATEGORIES.find(category => category.name === 'lithology')?.layer ?? 1;
const clamp = (value, low, high) => value < low ? low : value > high ? high : value;

/** @param {Float64Array} [out] @returns {Float64Array} the vector filled with every input's neutral value */
export function createLandscapeSurfaceInputVector(out = new Float64Array(LANDSCAPE_SURFACE_INPUTS.length)) {
    requireCondition(out instanceof Float64Array && out.length === LANDSCAPE_SURFACE_INPUTS.length, `surface input vector needs ${LANDSCAPE_SURFACE_INPUTS.length} entries`);
    LANDSCAPE_SURFACE_INPUTS.forEach((definition, index) => { out[index] = definition.neutral; });
    return out;
}

/**
 * Stratum hardness of a lithology label through the recipe's unwrap (index = L - 1 for L <= 128, L - 256 otherwise; pattern slot ((index mod 4) + 4) mod 4);
 * label 0 is unstratified. @param {number} label @param {readonly number[]} pattern four hardness values
 */
export function landscapeStratumHardness(label, pattern) {
    requireInteger(label, 0, 255, 'lithology label');
    requireCondition(Array.isArray(pattern) && pattern.length === 4 || ArrayBuffer.isView(pattern) && pattern.length === 4, 'the hardness pattern holds four values');
    if (label === 0) return LANDSCAPE_SURFACE_MODEL.strata.unstratifiedHardness;
    const index = label <= 128 ? label - 1 : label - 256;
    return pattern[((index % 4) + 4) % 4];
}

/**
 * One-hot fractions of the labelled categories and the hardness of four aligned categorical samples under bilinear weights (so every class weight is a
 * continuous function of position). @param {ArrayLike<ArrayLike<number>>} labels4 four [depositType, lithology, drainage, coastalZone] label quads
 * @param {ArrayLike<number>} weights4 their bilinear weights @param {readonly number[]} pattern hardness pattern
 * @param {{depositType:Float64Array,drainage:Float64Array,coastalZone:Float64Array,hardness:number}} [out]
 */
export function landscapeSurfaceOneHot(labels4, weights4, pattern, out = createLandscapeSurfaceOneHot()) {
    requireCondition(labels4.length === 4 && weights4.length === 4, 'the one-hot takes four aligned samples and four weights');
    out.depositType.fill(0); out.drainage.fill(0); out.coastalZone.fill(0); out.hardness = 0;
    for (let sample = 0; sample < 4; sample++) {
        const weight = weights4[sample], labels = labels4[sample];
        requireFinite(weight, 'one-hot weight'); requireCondition(weight >= 0, 'one-hot weights are nonnegative');
        if (weight === 0) continue;
        for (const category of LANDSCAPE_SURFACE_CATEGORIES) out[category.name][clamp(labels[category.layer], 0, category.maximum)] += weight;
        out.hardness += weight * landscapeStratumHardness(labels[LITHOLOGY_LAYER], pattern);
    }
    return out;
}

/** @returns {{depositType:Float64Array,drainage:Float64Array,coastalZone:Float64Array,hardness:number}} the neutral one-hot (first label of each category, hardness 0.5) */
export function createLandscapeSurfaceOneHot() {
    const out = { depositType: new Float64Array(0), drainage: new Float64Array(0), coastalZone: new Float64Array(0), hardness: LANDSCAPE_SURFACE_MODEL.strata.unstratifiedHardness };
    for (const category of LANDSCAPE_SURFACE_CATEGORIES) { out[category.name] = new Float64Array(category.count); out[category.name][0] = 1; }
    return out;
}

/**
 * Fills the input vector of one position: normalized soil weights, the planning share, the decoded terrain fields, the decoded geology, the categorical
 * one-hot, the fragment's slope and height, the appearance layer (catena moisture, coastal reach), the disturbance and the availabilities; a null
 * source keeps its neutral inputs. Availability = the mean availability of the fields and the geology; fieldsAvailability drives the fade from the
 * default classes. The vector carries availability at LANDSCAPE_SURFACE_INPUT_INDEX.availability.
 * @param {{soilWeights:Record<string,number>,planningShare?:number,fields?:any,geology?:any,categories?:any,slopeDegrees:number,heightAboveSea:number,appearanceLayer?:{moisture:number,reach:number}|null,
 *   disturbance?:number,fieldsAvailability?:number,geologyAvailability?:number}} input @param {Float64Array} [out]
 */
export function landscapeSurfaceInputsFrom({ soilWeights, planningShare = 0, fields = null, geology = null, categories = null, slopeDegrees, heightAboveSea, appearanceLayer = null, disturbance = 0,
    fieldsAvailability = fields ? 1 : 0, geologyAvailability = geology ? 1 : 0 }, out = new Float64Array(LANDSCAPE_SURFACE_INPUTS.length)) {
    createLandscapeSurfaceInputVector(out);
    requireCondition(!!soilWeights && typeof soilWeights === 'object', 'surface inputs require soil coverage weights');
    let total = 0;
    for (const [soilId, weight] of Object.entries(soilWeights)) {
        requireCondition(LANDSCAPE_SURFACE_MODEL.soils.includes(soilId), `the surface model does not know soil ${soilId}`);
        requireFinite(weight, `soil weight ${soilId}`); requireCondition(weight >= 0, `soil weight ${soilId} must be nonnegative`);
        total += weight;
    }
    requireCondition(total > 0, 'surface inputs require positive total soil coverage');
    for (const [soilId, weight] of Object.entries(soilWeights)) out[INDEX[`soil.${soilId}`]] = weight / total;
    for (const [name, value] of Object.entries({ planningShare, slopeDegrees, heightAboveSea, disturbance, fieldsAvailability, geologyAvailability })) {
        requireFinite(value, `surface input ${name}`);
    }
    requireCondition(planningShare >= 0 && planningShare <= 1 && disturbance >= 0 && disturbance <= 1 && fieldsAvailability >= 0 && fieldsAvailability <= 1 && geologyAvailability >= 0 && geologyAvailability <= 1,
        'planningShare, disturbance and the availabilities must be in 0..1');
    out[INDEX.planningShare] = planningShare;
    if (fields) for (const key of FIELD_KEYS) { requireFinite(fields[key], `terrain field ${key}`); out[INDEX[key]] = fields[key]; }
    if (geology) for (const [key, id] of GEOLOGY_KEYS) { requireFinite(geology[key], `geology channel ${key}`); out[INDEX[id]] = geology[key]; }
    if (categories) {
        for (const category of LANDSCAPE_SURFACE_CATEGORIES) {
            const fractions = categories[category.name];
            requireCondition(!!fractions && fractions.length === category.count, `one-hot ${category.name} needs ${category.count} fractions`);
            for (let i = 0; i < category.count; i++) out[category.inputStart + i] = fractions[i];
        }
        requireFinite(categories.hardness, 'hardness'); out[INDEX.hardness] = categories.hardness;
    }
    out[INDEX.geometricSlopeDegrees] = slopeDegrees; out[INDEX.heightAboveSea] = heightAboveSea;
    const reach = appearanceLayer ? appearanceLayer.reach : 0;
    if (appearanceLayer) { requireFinite(appearanceLayer.moisture, 'catena moisture'); requireFinite(reach, 'coastal reach'); out[INDEX.catenaMoisture] = appearanceLayer.moisture; out[INDEX.coastalReach] = reach; }
    out[INDEX.reachFraction] = clamp(heightAboveSea / Math.max(reach, .01), -10, 10);
    out[INDEX.disturbance] = disturbance;
    out[INDEX.fieldsAvailability] = fieldsAvailability;
    out[INDEX.availability] = .5 * (fieldsAvailability + geologyAvailability);
    return out;
}
