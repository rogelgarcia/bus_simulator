// Defines filtered relative-relief competition and mid-scale clump relief for supported landscape materials.
// @ts-check
// Clump relief reweights the semantic coverage of a transition in log space with world-anchored per-material
// multi-octave gradient noise (the surface warp's lattice noise, mirrored by chunks/landscape/material_clumps.glsl)
// plus the material's own texture relief, so neighboring materials interleave in clumps and tufts whose density follows
// the coverage ramp; the relief competition then resolves blade/grain-scale edges on the reweighted coverage. Relief is
// measured from a floor so it is never negative, and it only acts on a material's confident coverage: reconstruction
// tails below the confidence range can lose weight but never gain it, and the interleaving thins out smoothly instead
// of ending on their cell-aligned support. Reweighting multiplies coverage by positive factors and renormalizes, so
// zero coverage stays zero and single-material coverage is unchanged; every term fades with the pixel footprint.
import { landscapeCoverageRampAverage } from './LandscapeSurfaceCoverage.js';
import { LANDSCAPE_SURFACE_NOISE, landscapeLatticeNoise, landscapeNoiseSalt } from './LandscapeSurfaceNoise.js';

export const LANDSCAPE_MATERIAL_BLEND = Object.freeze({
    id: 'landscape-height-competition-v1',
    heightEncoding: 'orm-alpha-unorm8',
    heightInterpretation: 'relative-relief',
    neutralHeight: .5,
    heightStrength: .7,
    scoreTransitionWidth: .12,
    fadeStartMetersPerPixel: .04,
    fadeEndMetersPerPixel: .2,
    filter: 'maximum-pair-score-projected-ramp-integral',
    measuredDisplacement: false
});

const clumpMaterial = (wavelengthMeters, weight, shaping, textureReliefGain) => Object.freeze({ wavelengthMeters, weight, shaping, textureReliefGain });
const clumpOctave = (frequency, amplitude, rotation) => Object.freeze({ frequency, amplitude, rotation: Object.freeze(rotation) });

export const LANDSCAPE_MATERIAL_CLUMP_OCTAVES = 4;

export const LANDSCAPE_MATERIAL_CLUMPS = Object.freeze({
    id: 'landscape-material-clumps-v1',
    noise: LANDSCAPE_SURFACE_NOISE.id,
    combination: 'log-coverage-reweighting',
    gain: 7,
    octaves: Object.freeze([clumpOctave(1, 1, [.6, .8]), clumpOctave(2.3, .8, [.96, .28]), clumpOctave(5.3, .6, [.28, .96]), clumpOctave(12.1, .45, [.8, .6])]),
    billowCenter: .49,
    fadeStartWavelengths: 1 / 16,
    fadeEndWavelengths: 1 / 4,
    coverageConfidence: Object.freeze([.03, .2]),
    reliefFloor: 2,
    materials: Object.freeze({
        unknown: clumpMaterial(1, .4, 'smooth', 2.5),
        seabed: clumpMaterial(2, .3, 'smooth', 2.5),
        sand: clumpMaterial(1.6, .35, 'smooth', 2.5),
        loam: clumpMaterial(.9, .65, 'billow', 2.5),
        forest: clumpMaterial(1.1, .5, 'billow', 2.5),
        rock: clumpMaterial(1.3, .6, 'billow', 2.5)
    })
});

const clamp = value => Math.max(0, Math.min(1, value));
const smoothstep = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** @param {{periodMeters:number,resolution:number,metersPerPixel:number,targetResolution?:number,transition?:number,enabled?:boolean}} input */
export function landscapeMaterialHeightDetail({ periodMeters, resolution, metersPerPixel, targetResolution = resolution, transition = 0, enabled = true }) {
    if (![periodMeters, resolution, targetResolution].every(value => Number.isFinite(value) && value > 0)
        || !Number.isFinite(metersPerPixel) || metersPerPixel < 0 || !Number.isFinite(transition) || transition < 0 || transition > 1) {
        throw new Error('Landscape material height detail requires positive periods/resolutions and a valid footprint/transition');
    }
    if (!enabled) return 0;
    const model = LANDSCAPE_MATERIAL_BLEND;
    const at = pixels => 1 - smoothstep((Math.max(metersPerPixel, periodMeters / pixels) - model.fadeStartMetersPerPixel)
        / (model.fadeEndMetersPerPixel - model.fadeStartMetersPerPixel));
    return at(resolution) * (1 - transition) + at(targetResolution) * transition;
}

/** Clump parameters of a catalog soil. @param {string} soilId */
export function landscapeMaterialClumpDefinition(soilId) {
    const definition = typeof soilId === 'string' && Object.hasOwn(LANDSCAPE_MATERIAL_CLUMPS.materials, soilId) ? LANDSCAPE_MATERIAL_CLUMPS.materials[soilId] : null;
    if (!definition) throw new Error(`[LandscapeMaterialBlend] No clump relief is defined for soil ${soilId}`);
    return definition;
}

function clumpComponent(soilId) {
    let hash = 0x811c9dc5;
    for (const character of `material-clumps/${soilId}`) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0;
    return hash;
}

/** World-anchored octave salts of one soil, derived from the landscape surface seed. @param {number} seed @param {string} soilId @returns {number[]} */
export function landscapeMaterialClumpSalts(seed, soilId) {
    landscapeMaterialClumpDefinition(soilId);
    const component = clumpComponent(soilId);
    return LANDSCAPE_MATERIAL_CLUMPS.octaves.map((_, octave) => landscapeNoiseSalt(seed, component, octave));
}

function clumpNoise(x, z, inverseWavelength, rotation, salt) {
    const u = (rotation[0] * x - rotation[1] * z) * inverseWavelength + (salt & 0xffff) / 65536;
    const v = (rotation[1] * x + rotation[0] * z) * inverseWavelength + (salt >>> 16) / 65536;
    return landscapeLatticeNoise(u, v, salt);
}

/**
 * Footprint-faded clump value: rotated octaves of increasing frequency, each fading from 1/16 to 1/4 of its wavelength
 * per pixel and normalized in quadrature so fading keeps the variance; billow shaping folds the sum into 2|n| - center,
 * whose creases become gaps between clumps. The first octave's fade scales the result to zero once it is unresolved.
 * @param {{x:number,z:number,wavelengthMeters:number,shaping:'smooth'|'billow',salts:number[],metersPerPixel:number}} input
 */
export function landscapeMaterialClumpValue({ x, z, wavelengthMeters, shaping, salts, metersPerPixel }) {
    const model = LANDSCAPE_MATERIAL_CLUMPS;
    if (![x, z].every(Number.isFinite) || !(Number.isFinite(wavelengthMeters) && wavelengthMeters > 0) || !['smooth', 'billow'].includes(shaping)
        || !Array.isArray(salts) || salts.length !== model.octaves.length || !Number.isFinite(metersPerPixel) || metersPerPixel < 0) {
        throw new Error('[LandscapeMaterialBlend] Clump values need a finite position, positive wavelength, shaping, one salt per octave and a footprint');
    }
    const fade = wavelength => 1 - smoothstep((metersPerPixel - wavelength * model.fadeStartWavelengths) / (wavelength * (model.fadeEndWavelengths - model.fadeStartWavelengths)));
    const first = fade(wavelengthMeters);
    if (first <= 0) return 0;
    let sum = 0, power = 0;
    for (const [index, octave] of model.octaves.entries()) {
        const amplitude = octave.amplitude * fade(wavelengthMeters / octave.frequency);
        if (amplitude <= 0) break;
        sum += amplitude * clumpNoise(x, z, octave.frequency / wavelengthMeters, octave.rotation, salts[index]);
        power += amplitude * amplitude;
    }
    const value = sum / Math.sqrt(power);
    return first * (shaping === 'billow' ? 2 * Math.abs(value) - model.billowCenter : value);
}

/** Footprint fade of a soil's first clump octave, which bounds the whole clump term. @param {number} wavelengthMeters @param {number} metersPerPixel */
export function landscapeMaterialClumpDetail(wavelengthMeters, metersPerPixel) {
    if (!(Number.isFinite(wavelengthMeters) && wavelengthMeters > 0) || !Number.isFinite(metersPerPixel) || metersPerPixel < 0) throw new Error('[LandscapeMaterialBlend] Clump detail needs a positive wavelength and a footprint');
    const model = LANDSCAPE_MATERIAL_CLUMPS;
    return 1 - smoothstep((metersPerPixel - wavelengthMeters * model.fadeStartWavelengths) / (wavelengthMeters * (model.fadeEndWavelengths - model.fadeStartWavelengths)));
}

/**
 * Floored log-space relief of one soil at a world position: the relief floor scaled by the resolvable detail, plus the
 * centered clump term and the material's texture relief, clamped at zero. Unresolved footprints return zero.
 * @param {{soilId:string,seed:number,x:number,z:number,metersPerPixel:number,height?:number,heightDetail?:number,enabled?:boolean}} input
 */
export function landscapeMaterialClumpRelief({ soilId, seed, x, z, metersPerPixel, height = LANDSCAPE_MATERIAL_BLEND.neutralHeight, heightDetail = 0, enabled = true }) {
    const definition = landscapeMaterialClumpDefinition(soilId), model = LANDSCAPE_MATERIAL_CLUMPS;
    if (![height, heightDetail].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error('[LandscapeMaterialBlend] Clump relief needs a height and height detail in 0..1');
    if (!enabled) return 0;
    const clumpDetail = landscapeMaterialClumpDetail(definition.wavelengthMeters, metersPerPixel);
    const value = landscapeMaterialClumpValue({ x, z, wavelengthMeters: definition.wavelengthMeters, shaping: definition.shaping, salts: landscapeMaterialClumpSalts(seed, soilId), metersPerPixel });
    return Math.max(0, model.reliefFloor * Math.max(clumpDetail, heightDetail) + model.gain * definition.weight * value
        + definition.textureReliefGain * heightDetail * (height - LANDSCAPE_MATERIAL_BLEND.neutralHeight));
}

/**
 * Terrain shader interface of the clump relief for chunks/landscape/material_clumps.glsl: per soil slot
 * uSoilClumps vec4(1 / first wavelength, weight, texture relief gain, billow center or 0 for smooth) and
 * uSoilClumpSalts ivec4 octave salts, plus the shared uClumpOctaves vec4(frequency, amplitude, cos, sin) rows (zero
 * amplitude ends the octave list), uClumpSettings vec4(gain, fade start, fade end in wavelengths, enabled) and
 * uClumpConfidence vec4(coverage confidence start, end, relief floor, 0). Soils without relief metadata keep zero rows,
 * which leaves their coverage untouched.
 * @param {{seed:number,soils:ReadonlyArray<{soilId:string,enabled:boolean}>}} input
 */
export function landscapeMaterialClumpUniforms({ seed, soils }) {
    if (!Array.isArray(soils) || soils.length < 1 || soils.length > 6 || !soils.every(soil => typeof soil?.enabled === 'boolean')) {
        throw new Error('[LandscapeMaterialBlend] Clump uniforms need one to six soil slots with boolean enablement');
    }
    const model = LANDSCAPE_MATERIAL_CLUMPS, clumps = new Float32Array(24), salts = new Int32Array(24), octaves = new Float32Array(LANDSCAPE_MATERIAL_CLUMP_OCTAVES * 4);
    soils.forEach(({ soilId, enabled }, index) => {
        const definition = landscapeMaterialClumpDefinition(soilId), octaveSalts = landscapeMaterialClumpSalts(seed, soilId), billow = definition.shaping === 'billow';
        if (!enabled) return;
        clumps.set([1 / definition.wavelengthMeters, definition.weight, definition.textureReliefGain, billow ? model.billowCenter : 0], index * 4);
        salts.set(octaveSalts.map(salt => salt | 0), index * 4);
    });
    model.octaves.forEach((octave, index) => octaves.set([octave.frequency, octave.amplitude, octave.rotation[0], octave.rotation[1]], index * 4));
    return Object.freeze({ uSoilClumps: clumps, uSoilClumpSalts: salts, uClumpOctaves: octaves,
        uClumpSettings: Float32Array.of(model.gain, model.fadeStartWavelengths, model.fadeEndWavelengths, 1), uClumpConfidence: Float32Array.of(model.coverageConfidence[0], model.coverageConfidence[1], model.reliefFloor, 0) });
}

/**
 * Coverage reweighted by floored clump relief: each material's exponent is its relief times the smoothstep confidence of
 * its coverage, so tails below the confidence range can only lose weight. Absent materials, single-material coverage and
 * all-zero relief keep the input exactly.
 * @param {number[]} weights @param {number[]} relief non-negative floored relief per material
 */
export function landscapeClumpedCoverage(weights, relief) {
    if (!Array.isArray(weights) || !Array.isArray(relief) || relief.length !== weights.length || !weights.every(value => Number.isFinite(value) && value >= 0)
        || !relief.every(value => Number.isFinite(value) && value >= 0)) throw new Error('[LandscapeMaterialBlend] Clumped coverage needs matching nonnegative coverage and relief arrays');
    const present = weights.map((weight, index) => weight > 0 ? index : -1).filter(index => index >= 0);
    if (present.length < 2 || present.every(index => relief[index] === 0)) return [...weights];
    const [start, end] = LANDSCAPE_MATERIAL_CLUMPS.coverageConfidence;
    const exponents = weights.map((weight, index) => weight > 0 ? smoothstep((weight - start) / (end - start)) * relief[index] : 0);
    const maximum = Math.max(...present.map(index => exponents[index]));
    const raw = weights.map((weight, index) => weight > 0 ? weight * Math.exp(exponents[index] - maximum) : 0), total = raw.reduce((sum, value) => sum + value, 0);
    return raw.map(value => value / total);
}

/** @param {{weights:number[],heights:number[],details:number[],clumpRelief?:number[],scoreDx?:number[],scoreDy?:number[]}} input clumpRelief is the floored relief of landscapeMaterialClumpRelief */
export function sampleLandscapeMaterialBlend({ weights, heights, details, clumpRelief = weights.map(() => 0), scoreDx = weights.map(() => 0), scoreDy = weights.map(() => 0) }) {
    if (!Array.isArray(weights) || weights.length < 1 || weights.length > 6
        || ![weights, heights, details].every(values => Array.isArray(values) && values.length === weights.length && values.every(value => Number.isFinite(value) && value >= 0 && value <= 1))
        || !(Array.isArray(clumpRelief) && clumpRelief.length === weights.length && clumpRelief.every(value => Number.isFinite(value) && value >= 0))
        || ![scoreDx, scoreDy].every(values => Array.isArray(values) && values.length === weights.length && values.every(Number.isFinite))) {
        throw new Error('Landscape material blend requires matching finite coverage, height, detail, clump and derivative arrays');
    }
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 1) > 1e-6) throw new Error('Landscape material blend coverage must sum to one');
    const model = LANDSCAPE_MATERIAL_BLEND, clumpedWeights = landscapeClumpedCoverage(weights, clumpRelief);
    const scores = clumpedWeights.map((weight, index) => weight * (1 + model.heightStrength * (2 * heights[index] - 1)));
    const maximum = Math.max(...scores), projectedScoreWidth = [0, 0];
    for (let i = 0; i < weights.length; i++) for (let j = 0; j < i; j++) {
        projectedScoreWidth[0] = Math.max(projectedScoreWidth[0], Math.abs(scoreDx[i] - scoreDx[j]));
        projectedScoreWidth[1] = Math.max(projectedScoreWidth[1], Math.abs(scoreDy[i] - scoreDy[j]));
    }
    const raw = clumpedWeights.map((weight, index) => weight * landscapeCoverageRampAverage(1 + (scores[index] - maximum) / model.scoreTransitionWidth,
        projectedScoreWidth[0] / model.scoreTransitionWidth, projectedScoreWidth[1] / model.scoreTransitionWidth));
    const heightTotal = raw.reduce((sum, weight) => sum + weight, 0), heightWeights = raw.map(weight => weight / heightTotal);
    const detail = clumpedWeights.reduce((sum, weight, index) => sum + weight * details[index], 0);
    return { weights: clumpedWeights.map((weight, index) => weight * (1 - detail) + heightWeights[index] * detail), clumpedWeights, heightWeights, scores, detail, projectedScoreWidth };
}
