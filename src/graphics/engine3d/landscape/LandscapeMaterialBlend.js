// Defines filtered relative-relief competition for supported landscape materials.
// @ts-check
import { landscapeCoverageRampAverage } from './LandscapeSurfaceCoverage.js';

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

/** @param {{weights:number[],heights:number[],details:number[],scoreDx?:number[],scoreDy?:number[]}} input */
export function sampleLandscapeMaterialBlend({ weights, heights, details, scoreDx = weights.map(() => 0), scoreDy = weights.map(() => 0) }) {
    if (!Array.isArray(weights) || weights.length < 1 || weights.length > 6
        || ![weights, heights, details].every(values => Array.isArray(values) && values.length === weights.length && values.every(value => Number.isFinite(value) && value >= 0 && value <= 1))
        || ![scoreDx, scoreDy].every(values => Array.isArray(values) && values.length === weights.length && values.every(Number.isFinite))) {
        throw new Error('Landscape material blend requires matching finite coverage, height, detail and derivative arrays');
    }
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 1) > 1e-6) throw new Error('Landscape material blend coverage must sum to one');
    const model = LANDSCAPE_MATERIAL_BLEND;
    const scores = weights.map((weight, index) => weight * (1 + model.heightStrength * (2 * heights[index] - 1)));
    const maximum = Math.max(...scores), projectedScoreWidth = [0, 0];
    for (let i = 0; i < weights.length; i++) for (let j = 0; j < i; j++) {
        projectedScoreWidth[0] = Math.max(projectedScoreWidth[0], Math.abs(scoreDx[i] - scoreDx[j]));
        projectedScoreWidth[1] = Math.max(projectedScoreWidth[1], Math.abs(scoreDy[i] - scoreDy[j]));
    }
    const raw = weights.map((weight, index) => weight * landscapeCoverageRampAverage(1 + (scores[index] - maximum) / model.scoreTransitionWidth,
        projectedScoreWidth[0] / model.scoreTransitionWidth, projectedScoreWidth[1] / model.scoreTransitionWidth));
    const heightTotal = raw.reduce((sum, weight) => sum + weight, 0), heightWeights = raw.map(weight => weight / heightTotal);
    const detail = weights.reduce((sum, weight, index) => sum + weight * details[index], 0);
    return { weights: weights.map((weight, index) => weight * (1 - detail) + heightWeights[index] * detail), heightWeights, scores, detail, projectedScoreWidth };
}
