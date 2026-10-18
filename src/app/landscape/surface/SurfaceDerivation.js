// Derives the substrate, cover, cover fraction and wetness of a pixel from its input vector through the recipe's rule tables, allocation-free and exactly as the GLSL mirror.
// @ts-check
// Per soil with a positive weight: every rule adds base x product of its term factors to its target (a substrate class, a cover class, the cover
// fraction, or the wetness, which takes the largest rule); class weights normalize (a soil without a firing rule keeps its default class), the
// fraction and the wetness clamp to 0..1; the soil's result fades from its default classes by the field availability and joins the output by the
// soil's weight. Arithmetic is IEEE products, sums, clamps and the cubic ramp only, so the GLSL chunk reproduces it to float precision.
import { requireCondition } from '../internal/LandscapeValidation.js';
import { LANDSCAPE_SURFACE_COVERS, LANDSCAPE_SURFACE_INPUT_INDEX, LANDSCAPE_SURFACE_MODEL, LANDSCAPE_SURFACE_SUBSTRATES, LANDSCAPE_SURFACE_TARGETS, validateLandscapeSurfaceRecipe } from './SurfaceModel.js';

const INDEX = LANDSCAPE_SURFACE_INPUT_INDEX, SUBSTRATES = LANDSCAPE_SURFACE_SUBSTRATES.length, COVERS = LANDSCAPE_SURFACE_COVERS.length, SOILS = LANDSCAPE_SURFACE_MODEL.soils.length;
const compiled = new WeakMap();
const substrateScratch = new Float64Array(SUBSTRATES), coverScratch = new Float64Array(COVERS);
const clamp01 = value => value < 0 ? 0 : value > 1 ? 1 : value;

/** smoothstep whose edges may descend: 0 at edge0, 1 at edge1 (the term ramp of every rule). @param {number} edge0 @param {number} edge1 @param {number} value */
export function landscapeSurfaceRamp(edge0, edge1, value) {
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

/**
 * Flat rule tables of a recipe in model soil order (the GLSL defines carry the same tables): per soil [ruleStart, ruleCount], default classes and
 * levels, rules as (soil, target, termStart, termCount), bases and terms as (input index, edge0, edge1, weight). Cached per recipe object.
 * @param {any} recipe
 */
export function compileLandscapeSurfaceRecipe(recipe) {
    const cached = compiled.get(recipe);
    if (cached) return cached;
    const validated = validateLandscapeSurfaceRecipe(recipe), rules = [], bases = [], terms = [], soils = new Int32Array(SOILS * 2), defaults = new Int32Array(SOILS * 2), levels = new Float64Array(SOILS * 2);
    LANDSCAPE_SURFACE_MODEL.soils.forEach((soilId, soil) => {
        const definition = validated.soils[soilId], start = rules.length;
        const add = (target, rule) => {
            rules.push(soil, target, terms.length / 4, rule.terms.length); bases.push(rule.base);
            for (const term of rule.terms) terms.push(INDEX[term.input], term.smoothstep[0], term.smoothstep[1], term.weight);
        };
        for (const rule of definition.substrates) add(LANDSCAPE_SURFACE_TARGETS.substrate + LANDSCAPE_SURFACE_SUBSTRATES.findIndex(entry => entry.id === rule.class), rule);
        for (const rule of definition.covers) add(LANDSCAPE_SURFACE_TARGETS.cover + LANDSCAPE_SURFACE_COVERS.findIndex(entry => entry.id === rule.class), rule);
        for (const rule of definition.coverFraction) add(LANDSCAPE_SURFACE_TARGETS.fraction, rule);
        for (const rule of definition.wetness) add(LANDSCAPE_SURFACE_TARGETS.wetness, rule);
        soils[soil * 2] = start / 4; soils[soil * 2 + 1] = rules.length / 4 - start / 4;
        defaults[soil * 2] = LANDSCAPE_SURFACE_SUBSTRATES.findIndex(entry => entry.id === definition.defaults.substrate);
        defaults[soil * 2 + 1] = LANDSCAPE_SURFACE_COVERS.findIndex(entry => entry.id === definition.defaults.cover);
        levels[soil * 2] = definition.defaults.coverFraction; levels[soil * 2 + 1] = definition.defaults.wetness;
    });
    const program = Object.freeze({ recipe: validated, soils, defaults, levels, rules: Int32Array.from(rules), bases: Float64Array.from(bases), terms: Float64Array.from(terms),
        ruleCount: rules.length / 4, termCount: terms.length / 4, hardnessPattern: Float64Array.from(validated.strata.hardnessPattern) });
    // the validated clone is a key too, so callers holding program.recipe never compile twice
    compiled.set(recipe, program); compiled.set(validated, program);
    return program;
}

/** @returns {{substrate:Float64Array,cover:Float64Array,coverFraction:number,wetness:number,disturbance:number,availability:number}} */
export function createLandscapeSurfaceResult() {
    return { substrate: new Float64Array(SUBSTRATES), cover: new Float64Array(COVERS), coverFraction: 0, wetness: 0, disturbance: 0, availability: 0 };
}

/**
 * The surface at one input vector: substrate and cover weights (each summing to 1), the cover fraction, wetness, disturbance and availability.
 * @param {Float64Array} vector @param {any} recipe @param {{out?:ReturnType<typeof createLandscapeSurfaceResult>}} [options] out makes the call allocation-free
 */
export function sampleLandscapeSurface(vector, recipe, { out = createLandscapeSurfaceResult() } = {}) {
    requireCondition(vector instanceof Float64Array && vector.length > INDEX.availability, 'the surface derivation takes the model input vector');
    const program = compileLandscapeSurfaceRecipe(recipe), { rules, bases, terms, soils, defaults, levels } = program, fade = vector[INDEX.fieldsAvailability];
    const substrate = out.substrate, cover = out.cover;
    substrate.fill(0); cover.fill(0);
    let coverFraction = 0, wetness = 0, total = 0;
    for (let soil = 0; soil < SOILS; soil++) total += vector[soil];
    for (let soil = 0; soil < SOILS; soil++) {
        const weight = total > 0 ? vector[soil] / total : 0;
        if (weight <= 0) continue;
        substrateScratch.fill(0); coverScratch.fill(0);
        let fraction = 0, wet = 0;
        for (let rule = soils[soil * 2], end = rule + soils[soil * 2 + 1]; rule < end; rule++) {
            const target = rules[rule * 4 + 1], termStart = rules[rule * 4 + 2], termEnd = termStart + rules[rule * 4 + 3];
            let value = bases[rule];
            for (let term = termStart; term < termEnd; term++) {
                const termWeight = terms[term * 4 + 3];
                value *= 1 - termWeight + termWeight * landscapeSurfaceRamp(terms[term * 4 + 1], terms[term * 4 + 2], vector[terms[term * 4]]);
            }
            if (target < LANDSCAPE_SURFACE_TARGETS.cover) substrateScratch[target] += value;
            else if (target < LANDSCAPE_SURFACE_TARGETS.fraction) coverScratch[target - LANDSCAPE_SURFACE_TARGETS.cover] += value;
            else if (target === LANDSCAPE_SURFACE_TARGETS.fraction) fraction += value;
            else wet = value > wet ? value : wet;
        }
        let substrateTotal = 0, coverTotal = 0;
        for (let i = 0; i < SUBSTRATES; i++) substrateTotal += substrateScratch[i];
        for (let i = 0; i < COVERS; i++) coverTotal += coverScratch[i];
        const defaultSubstrate = defaults[soil * 2], defaultCover = defaults[soil * 2 + 1];
        for (let i = 0; i < SUBSTRATES; i++) substrate[i] += weight * (fade * (substrateTotal > 0 ? substrateScratch[i] / substrateTotal : i === defaultSubstrate ? 1 : 0) + (1 - fade) * (i === defaultSubstrate ? 1 : 0));
        for (let i = 0; i < COVERS; i++) cover[i] += weight * (fade * (coverTotal > 0 ? coverScratch[i] / coverTotal : i === defaultCover ? 1 : 0) + (1 - fade) * (i === defaultCover ? 1 : 0));
        coverFraction += weight * (fade * clamp01(fraction) + (1 - fade) * levels[soil * 2]);
        wetness += weight * (fade * clamp01(wet) + (1 - fade) * levels[soil * 2 + 1]);
    }
    out.coverFraction = coverFraction; out.wetness = wetness; out.disturbance = vector[INDEX.disturbance]; out.availability = vector[INDEX.availability];
    return out;
}

/** The dominant classes of a result with their weights, for inspection and tests. @param {ReturnType<typeof createLandscapeSurfaceResult>} result */
export function describeLandscapeSurface(result) {
    const dominant = (weights, catalog) => { let best = 0; for (let i = 1; i < weights.length; i++) if (weights[i] > weights[best]) best = i; return { id: catalog[best].id, weight: weights[best] }; };
    return { substrate: dominant(result.substrate, LANDSCAPE_SURFACE_SUBSTRATES), cover: dominant(result.cover, LANDSCAPE_SURFACE_COVERS), coverFraction: result.coverFraction, wetness: result.wetness,
        disturbance: result.disturbance, availability: result.availability,
        substrates: Object.fromEntries(LANDSCAPE_SURFACE_SUBSTRATES.map((entry, i) => [entry.id, result.substrate[i]])), covers: Object.fromEntries(LANDSCAPE_SURFACE_COVERS.map((entry, i) => [entry.id, result.cover[i]])) };
}
