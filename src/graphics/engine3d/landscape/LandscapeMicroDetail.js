// Declares close-up micro detail of landscape materials: paired micro pages decoded as detail slope, relief and luminance ratio.
// @ts-check
// A companion multiscale sidecar may give a material a micro page per tier, at that tier's resolution and with its own physical
// tileMeters. The page is packed as layer 2 of the material's existing surface array, so micro detail adds no sampler. Micro detail is
// sampled with its own world-anchored stochastic lattice (salt mixed from the soil's top-projection salt) at its true period, and fades
// by the anisotropic projected footprint and the resident micro texel: it is never magnified and leaves before it could alias. Its
// slope adds to the base slope (the gradient of summed height fields), its relief adds to the base relief that drives the height
// competition and clumps, and its luminance ratio multiplies albedo. The encoding stores RGBA linear bytes: detail normal XY with 0.5
// neutral, relative height with 0.5 neutral, and 0.5 + 0.5 (L / mean - 1) / luminanceRange.

export const LANDSCAPE_MICRO_DETAIL = Object.freeze({
    id: 'landscape-micro-detail-v1',
    encoding: 'micro-normal-height-luminance-v1',
    layer: 2,
    saltMix: 0x510e527f,
    sampling: Object.freeze({ cellsPerPeriod: 3, rotationRangeDegrees: 180, offsetSpreadV: 1, contrastExponent: 7 }),
    // meters per pixel relative to the micro period: fully present below period/96, absent above period/24
    fadeStartPeriods: 1 / 96,
    fadeEndPeriods: 1 / 24,
    footprint: 'max(major / 4, minor) of the 3D world screen derivatives, matching the 4x anisotropic material samplers',
    blend: 'surface-gradient-sum',
    // responses for every catalog soil, so any micro layer a sidecar supplies is used; the coastal sidecar supplies sand and seabed
    materials: Object.freeze({
        unknown: Object.freeze({ normalStrength: 1, heightStrength: .3, luminanceStrength: 1 }),
        seabed: Object.freeze({ normalStrength: 1, heightStrength: .3, luminanceStrength: .8 }),
        sand: Object.freeze({ normalStrength: 1, heightStrength: .3, luminanceStrength: 1 }),
        loam: Object.freeze({ normalStrength: 1, heightStrength: .3, luminanceStrength: 1 }),
        forest: Object.freeze({ normalStrength: 1, heightStrength: .3, luminanceStrength: 1 }),
        rock: Object.freeze({ normalStrength: 1, heightStrength: .3, luminanceStrength: 1 })
    })
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const smoothstep = (edge0, edge1, value) => { const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

/** Micro responses of a catalog soil, or null when the soil does not use micro detail. @param {string} soilId */
export function landscapeMicroDetailDefinition(soilId) {
    if (typeof soilId !== 'string') throw new Error('[LandscapeMicroDetail] Soil id must be a string');
    return Object.hasOwn(LANDSCAPE_MICRO_DETAIL.materials, soilId) ? LANDSCAPE_MICRO_DETAIL.materials[soilId] : null;
}

/**
 * Decodes one micro texel (0..1 linear channels) into a detail slope (tangent n.xy / n.z), relative height and luminance ratio; the
 * detail normal XY is clamped to the unit disc like decodeLandscapeAppearanceMicroTexel and the slope is limited like hex samples.
 * @param {readonly number[]} texel RGBA in 0..1 @param {number} luminanceRange sidecar luminance range
 */
export function decodeLandscapeMicroTexel(texel, luminanceRange) {
    if (!Array.isArray(texel) || texel.length !== 4 || !texel.every(value => finite(value) && value >= 0 && value <= 1) || !(finite(luminanceRange) && luminanceRange > 0)) {
        throw new Error('[LandscapeMicroDetail] Micro texels need four channels in 0..1 and a positive luminance range');
    }
    const rawX = texel[0] * 2 - 1, rawY = texel[1] * 2 - 1, scale = Math.min(1, 1 / Math.sqrt(Math.max(rawX * rawX + rawY * rawY, 1e-8)));
    const x = rawX * scale, y = rawY * scale, z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    const depth = Math.max(z, Math.max(Math.abs(x), Math.abs(y)) / 128);
    return { slope: [x / depth, y / depth], height: texel[2], luminanceRatio: 1 + (texel[3] * 2 - 1) * luminanceRange };
}

/**
 * Footprint fade of micro detail: one below fadeStart micro periods per pixel and zero above fadeEnd, using the larger of the projected
 * footprint and the resident micro texel; during a tier arrival the old and new texel fades mix by the transition progress.
 * @param {{microTileMeters:number,metersPerPixel:number,resolution:number,targetResolution?:number,transition?:number}} input
 */
export function landscapeMicroFade({ microTileMeters, metersPerPixel, resolution, targetResolution = resolution, transition = 0 }) {
    if (!(finite(microTileMeters) && microTileMeters > 0) || !(finite(metersPerPixel) && metersPerPixel >= 0) || ![resolution, targetResolution].every(value => finite(value) && value > 0)
        || !(finite(transition) && transition >= 0 && transition <= 1)) throw new Error('[LandscapeMicroDetail] Micro fades need a positive period and resolutions, a footprint and a transition in 0..1');
    const model = LANDSCAPE_MICRO_DETAIL;
    const at = pixels => 1 - smoothstep(microTileMeters * model.fadeStartPeriods, microTileMeters * model.fadeEndPeriods, Math.max(metersPerPixel, microTileMeters / pixels));
    return at(resolution) * (1 - transition) + at(targetResolution) * transition;
}

/** Projected footprint used by micro fades: the anisotropic-filter mip footprint of two screen derivative lengths. @param {number} first @param {number} second */
export function landscapeMicroFootprint(first, second) {
    if (![first, second].every(value => finite(value) && value >= 0)) throw new Error('[LandscapeMicroDetail] Footprints need nonnegative derivative lengths');
    return Math.max(Math.max(first, second) / 4, Math.min(first, second));
}

/**
 * Per-soil shader values of an active micro layer: uSoilTiling.yzw (micro period, normal strength, luminance scale) and uSoilState.z
 * (height strength). The luminance scale folds the sidecar range into the catalog strength.
 * @param {string} soilId @param {{tileMeters:number,luminanceRange:number}} micro
 */
export function landscapeMicroUniformValues(soilId, micro) {
    const definition = landscapeMicroDetailDefinition(soilId);
    if (!definition) throw new Error(`[LandscapeMicroDetail] Soil ${soilId} has no micro detail response`);
    if (!(finite(micro?.tileMeters) && micro.tileMeters > 0) || !(finite(micro?.luminanceRange) && micro.luminanceRange > 0)) throw new Error('[LandscapeMicroDetail] Micro layers need a positive period and luminance range');
    return Object.freeze({ tileMeters: micro.tileMeters, normalStrength: definition.normalStrength, luminanceScale: micro.luminanceRange * definition.luminanceStrength, heightStrength: definition.heightStrength });
}
