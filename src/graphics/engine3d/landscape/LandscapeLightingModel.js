// Defines the landscape lighting tiers, calibrated atmosphere and water optics, and exact JavaScript mirrors of their shader math.
// @ts-check
// Design: the viewer is lit like the game (calibrated sun, calibrated sky, exposure and tone mapping from the game's resolvers). The aerial
// perspective uses the atmosphere that produced the calibrated sky (Blender sky profile E55: air density 1, aerosol density 0.25, model
// ground albedo 0.3) with the Nishita-family constants (Rayleigh 680/550/440 nm, scale heights 8 km and 1.2 km, Mie 2e-5 m^-1 per unit
// aerosol density, extinction 1.11× scattering, g 0.76), so terrain haze converges to the HDR's own horizon; a per-channel calibration
// measured from that horizon absorbs the higher scattering orders the closed form omits. Water optics describe clear coastal water.
// Only values that change at runtime are uniforms; the physical constants are compile-time defines. AI577 D5c adds the natural-ground material
// response and terrain-reflected light of LandscapeMaterialResponse.js and binds the terrain-field visibility hooks; uLandscapeResponse switches
// each of the three (1 enabled, 0 the D5b model), so isolated programs without the uniform keep the D5b shading exactly.
import { CALIBRATED_DAYLIGHT } from '../../lighting/CalibratedDaylight.js';
import { evaluateLandscapeSkyIrradiance, landscapeSkyRadianceBands, LANDSCAPE_SKY_IRRADIANCE } from './LandscapeSkyIrradiance.js';
import { landscapeEonAlbedo, landscapeEonBrdf, landscapeMaterialResponseDefines, landscapeNaturalSpecularShadowing, landscapeTerrainBounce, landscapeTerrainOccluderLight } from './LandscapeMaterialResponse.js';
import { landscapeSolarDiscVisibility, landscapeTerrainHorizonSine } from '../../../app/landscape/LandscapeTerrainFields.js';

export const LANDSCAPE_LIGHTING_TIERS = Object.freeze({ low: 0, standard: 1, high: 2 });
export const LANDSCAPE_LIGHTING_TIER_DEFINE = 'LANDSCAPE_LIGHTING_TIER';
/** optical water level of a hidden water reference: far below any terrain, so no fragment is submerged */
export const LANDSCAPE_WATER_LEVEL_DISABLED = -1e9;

export const LANDSCAPE_LIGHTING = Object.freeze({
    model: 'landscape-game-lighting-v1',
    defaultTier: 'standard',
    tiers: Object.freeze({
        low: 'calibrated sun and sky (Physical BRDF, sky harmonics), natural-ground material response and open-ground reflected light; no terrain shadows, terrain sky occlusion or occluder bounce; no aerial perspective; the water column keeps its deep-water radiance as a constant source',
        standard: 'low + terrain shadows and terrain sky occlusion from the terrain fields, light reflected by occluding terrain, aerial perspective (isotropic sky, ground and Rayleigh/Mie sun lobes) on terrain and water + an in-water source that decays with depth along the view path',
        high: 'standard + phase-convolved anisotropic sky in-scattering and horizon occlusion of normal-mapped sky reflections'
    }),
    uniforms: Object.freeze({ uLandscapeSky: 9, uLandscapeSun: 1, uLandscapeSunIrradiance: 1, uLandscapeResponse: 1 }),
    uniformVectors: 12,
    sunAngularDiameterDeg: CALIBRATED_DAYLIGHT.angularDiameterDeg,
    hooks: Object.freeze({ sunVisibility: 'landscapeSunVisibility', skyVisibility: 'landscapeSkyVisibility' }),
    // terrain-field binding of the hooks (terrain program, tiers standard and high): the sun margin against the azimuth-interpolated horizon is
    // widened by its screen-space change (antialiased shadow edges) and the sky view is divided by the open-slope term of the field's own slope
    visibility: Object.freeze({ id: 'landscape-terrain-visibility-v1', sun: 'solar-disc-segment-widened-by-fwidth', sky: 'sky-view-over-open-slope-of-field-slope', minimumTier: 'standard' }),
    // AI577 D5 switches (uLandscapeResponse x, y, z, w): natural-ground response, terrain-reflected light, terrain-field visibility and the terrain-driven
    // natural appearance of LandscapeTerrainAppearance.js
    response: Object.freeze({ model: true, bounce: true, terrainVisibility: true, terrainAppearance: true })
});

/**
 * Mirror of landscapeEvaluateTerrainVisibility (lighting.glsl, landscape-terrain-visibility-v1) for one terrain-field sample: the solar disc against
 * the azimuth-interpolated horizon with its angular radius widened to half the sun margin's screen-space change (marginWidth, radians), and the sky
 * view over the open-slope term (1 + cos S) / 2 of the field's slope; both blend to 1 with the sample's availability and the switch.
 * @param {{availability:number,fields:{skyView:number,slopeDegrees:number,horizonSine:ArrayLike<number>}|null}} sample @param {number[]} sunDirection unit
 * @param {{marginWidth?:number,enabled?:boolean}} [options]
 * @returns {{sun:number,sky:number,weight:number,margin:number}}
 */
export function landscapeTerrainVisibility(sample, sunDirection, { marginWidth = 0, enabled = true } = {}) {
    const fields = sample.fields, weight = fields && enabled ? sample.availability : 0, [x, y, z] = sunDirection;
    const azimuth = Math.hypot(x, z) > 1e-6 ? Math.atan2(z, x) : 0;
    const horizon = fields ? Math.asin(Math.min(1, Math.max(0, landscapeTerrainHorizonSine(fields.horizonSine, azimuth)))) : 0;
    const margin = Math.asin(Math.min(1, Math.max(-1, y))) - horizon, radius = Math.max(LANDSCAPE_LIGHTING.sunAngularDiameterDeg * Math.PI / 360, .5 * marginWidth);
    const disc = landscapeSolarDiscVisibility(margin, 0, radius), open = .5 + .5 * Math.cos((fields?.slopeDegrees ?? 0) * Math.PI / 180);
    return { sun: 1 + (disc - 1) * weight, sky: 1 + (Math.min(1, Math.max(0, (fields?.skyView ?? 1) / Math.max(open, 1e-3))) - 1) * weight, weight, margin };
}

/**
 * @param {{model?:boolean,bounce?:boolean,terrainVisibility?:boolean,terrainAppearance?:boolean}|undefined} response
 * @returns {number[]} uLandscapeResponse (absent: the D5b model without terrain-driven appearance; since AI577 D6 that appearance is also a
 * compiled program variant, so a terrain program rendering w = 0 is compiled with terrainAppearance: false)
 */
export function landscapeResponseUniformValue(response) {
    if (response === undefined) return [0, 0, 0, 0];
    if (!response || typeof response !== 'object' || !Object.entries(response).every(([key, value]) => Object.hasOwn(LANDSCAPE_LIGHTING.response, key) && typeof value === 'boolean')) {
        throw new Error(`[Landscape] The lighting response accepts boolean ${Object.keys(LANDSCAPE_LIGHTING.response).join(', ')}`);
    }
    return [response.model ? 1 : 0, response.bounce ? 1 : 0, response.terrainVisibility ? 1 : 0, response.terrainAppearance ? 1 : 0];
}

export const LANDSCAPE_ATMOSPHERE = Object.freeze({
    model: 'landscape-aerial-perspective-v1',
    source: Object.freeze({ daylight: CALIBRATED_DAYLIGHT.id, profile: 'E55', skyModel: 'MULTIPLE_SCATTERING', airDensity: 1, aerosolDensity: .25, ozoneDensity: 1, altitudeMeters: 100, groundAlbedo: .3 }),
    rayleighScattering: Object.freeze([5.802e-6, 13.558e-6, 33.1e-6]),
    rayleighWavelengthsNm: Object.freeze([680, 550, 440]),
    rayleighScaleHeightMeters: 8000,
    mieScatteringPerAerosolDensity: 2e-5,
    mieExtinctionRatio: 1.11,
    mieScaleHeightMeters: 1200,
    mieAnisotropy: .76,
    groundAlbedo: .3,
    rayleighPhaseBands: Object.freeze([1, 0, .1]),
    horizonBandDegrees: 1,
    horizonSamples: 64,
    calibrationRange: Object.freeze([.25, 4])
});

export const LANDSCAPE_WATER_OPTICS = Object.freeze({
    model: 'landscape-water-optics-v1',
    ior: 1.333,
    // pure water (Pope & Fry 1997) weighted toward the Rec.709 primaries plus coastal chlorophyll/CDOM absorption, m^-1
    absorption: Object.freeze([.30, .07, .06]),
    // particle scattering of clear coastal water with a 1.8% backscatter ratio plus half the molecular scattering of water, m^-1
    scattering: .3,
    backscatter: Object.freeze([.006, .0064, .0078]),
    // Gordon et al. (1988) subsurface remote-sensing reflectance rrs = g0·u + g1·u², u = bb / (a + bb)
    reflectanceCoefficients: Object.freeze([.089, .125]),
    // mean cosine of refracted skylight and the diffuse (uniform sky) air-water transmittance
    diffuseCosine: .86,
    diffuseTransmission: .934,
    // diffuse water-air internal reflectance returning upwelling light to the bottom
    internalReflectance: .485,
    // Cox & Munk (1954) mean square slope 0.003 + 0.00512·U for a light breeze U, as GGX alpha = sqrt(mss)
    windSpeedMetersPerSecond: 3
});

/** @param {number} windSpeed @returns {{meanSquareSlope:number,alpha:number,roughness:number}} GGX parameters of a Cox-Munk sea surface */
export function landscapeWaterSurfaceRoughness(windSpeed = LANDSCAPE_WATER_OPTICS.windSpeedMetersPerSecond) {
    if (!(windSpeed >= 0 && windSpeed <= 20)) throw new Error(`[Landscape] Water wind speed must lie within 0–20 m/s; received ${windSpeed}`);
    const meanSquareSlope = .003 + .00512 * windSpeed, alpha = Math.sqrt(meanSquareSlope);
    return { meanSquareSlope, alpha, roughness: Math.sqrt(alpha) };
}

/** @param {string} tier @returns {string} */
export function landscapeLightingTier(tier) {
    if (!Object.hasOwn(LANDSCAPE_LIGHTING_TIERS, tier)) throw new Error(`[Landscape] landscapeLighting must be one of ${Object.keys(LANDSCAPE_LIGHTING_TIERS).join(', ')}; received ${tier}`);
    return tier;
}

const glslFloat = value => {
    if (!Number.isFinite(value)) throw new Error(`[Landscape] Lighting constant ${value} is not finite`);
    const text = Math.abs(value) < 1e-3 && value !== 0 ? value.toExponential(6) : String(value);
    return /[.e]/.test(text) ? text : `${text}.0`;
};
const glslVec3 = values => `vec3(${values.map(glslFloat).join(', ')})`;

/** Mie scattering and extinction coefficients at the reference altitude, m^-1. */
export function landscapeMieCoefficients() {
    const scattering = LANDSCAPE_ATMOSPHERE.mieScatteringPerAerosolDensity * LANDSCAPE_ATMOSPHERE.source.aerosolDensity;
    return { scattering, extinction: scattering * LANDSCAPE_ATMOSPHERE.mieExtinctionRatio, albedo: 1 / LANDSCAPE_ATMOSPHERE.mieExtinctionRatio };
}

/** Koschmieder meteorological range (2% contrast) per channel at sea level, meters. */
export function landscapeAtmosphereVisibilityMeters() {
    const mie = landscapeMieCoefficients().extinction;
    return LANDSCAPE_ATMOSPHERE.rayleighScattering.map(rayleigh => Math.log(50) / (rayleigh + mie));
}

/**
 * Compile-time constants of a lighting tier (no uniforms). Values are parenthesized or decimal so the shared define builder never
 * turns them into valueless flags.
 * @param {string} tier @returns {Readonly<Record<string,string>>}
 */
export function landscapeLightingDefines(tier) {
    const { rayleighScattering, rayleighScaleHeightMeters, mieScaleHeightMeters, mieAnisotropy, groundAlbedo } = LANDSCAPE_ATMOSPHERE;
    const mie = landscapeMieCoefficients(), water = LANDSCAPE_WATER_OPTICS, surface = landscapeWaterSurfaceRoughness();
    const kappa = water.absorption.map((value, channel) => value + water.backscatter[channel]);
    return Object.freeze({
        [LANDSCAPE_LIGHTING_TIER_DEFINE]: `(${LANDSCAPE_LIGHTING_TIERS[landscapeLightingTier(tier)]})`,
        LANDSCAPE_SUN_ANGULAR_RADIUS: glslFloat(LANDSCAPE_LIGHTING.sunAngularDiameterDeg * Math.PI / 360),
        LANDSCAPE_RAYLEIGH_SCATTERING: glslVec3(rayleighScattering),
        LANDSCAPE_RAYLEIGH_SCALE_HEIGHT: glslFloat(rayleighScaleHeightMeters),
        LANDSCAPE_MIE_SCATTERING: glslFloat(mie.scattering),
        LANDSCAPE_MIE_EXTINCTION: glslFloat(mie.extinction),
        LANDSCAPE_MIE_SCALE_HEIGHT: glslFloat(mieScaleHeightMeters),
        LANDSCAPE_MIE_ANISOTROPY: glslFloat(mieAnisotropy),
        LANDSCAPE_GROUND_ALBEDO: glslFloat(groundAlbedo),
        LANDSCAPE_WATER_IOR: glslFloat(water.ior),
        LANDSCAPE_WATER_BACKSCATTER: glslVec3(water.backscatter),
        LANDSCAPE_WATER_ATTENUATION: glslVec3(kappa),
        LANDSCAPE_WATER_REFLECTANCE_G0: glslFloat(water.reflectanceCoefficients[0]),
        LANDSCAPE_WATER_REFLECTANCE_G1: glslFloat(water.reflectanceCoefficients[1]),
        LANDSCAPE_WATER_DIFFUSE_COSINE: glslFloat(water.diffuseCosine),
        LANDSCAPE_WATER_DIFFUSE_TRANSMISSION: glslFloat(water.diffuseTransmission),
        LANDSCAPE_WATER_INTERNAL_REFLECTANCE: glslFloat(water.internalReflectance),
        LANDSCAPE_WATER_ROUGHNESS: glslFloat(surface.roughness),
        ...landscapeMaterialResponseDefines()
    });
}

/**
 * Unit direction toward the sun in landscape space from the game's azimuth/elevation (azimuthElevationDegToDir: azimuth from +X toward
 * +Z) and an optional city binding yaw (landscape → city rotation about +Y, landscapePointToCity); translation never changes a direction.
 * @param {number} azimuthDeg @param {number} elevationDeg @param {number} [yawDegrees] @returns {number[]}
 */
export function landscapeSunDirection(azimuthDeg, elevationDeg, yawDegrees = 0) {
    for (const value of [azimuthDeg, elevationDeg, yawDegrees]) if (!Number.isFinite(value)) throw new Error('[Landscape] Sun azimuth, elevation and binding yaw must be finite');
    const azimuth = azimuthDeg * Math.PI / 180, elevation = elevationDeg * Math.PI / 180, yaw = yawDegrees * Math.PI / 180;
    const x = Math.cos(azimuth) * Math.cos(elevation), y = Math.sin(elevation), z = Math.sin(azimuth) * Math.cos(elevation);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return [c * x - s * z, y, s * x + c * z];
}

/**
 * Density-weighted length of a straight path through an exponential layer, ∫ exp(-h(t)/H) dt, with altitudes above the reference level.
 * @param {number} altitude0 @param {number} altitude1 @param {number} distance @param {number} scaleHeight @returns {number}
 */
export function landscapeOpticalLength(altitude0, altitude1, distance, scaleHeight) {
    const x = (altitude1 - altitude0) / scaleHeight;
    const shape = Math.abs(x) < 1e-3 ? 1 - .5 * x + x * x / 6 : (1 - Math.exp(-x)) / x;
    return distance * Math.exp(-altitude0 / scaleHeight) * shape;
}

/** @param {number} mu @returns {number} normalized Rayleigh phase function */
const rayleighPhase = mu => 3 / (16 * Math.PI) * (1 + mu * mu);
/** @param {number} mu @param {number} g @returns {number} normalized Henyey-Greenstein phase function */
const henyeyGreenstein = (mu, g) => (1 - g * g) / (4 * Math.PI * (1 + g * g - 2 * g * mu) ** 1.5);

/**
 * @typedef {{seaLevel:number,sunDirection:number[],sunIrradiance:number[],skyCoefficients:ArrayLike<number>,calibration?:number[]}} LandscapeLightingState
 */

/** Isotropic in-scattering source: mean sky radiance plus a lower hemisphere of model-albedo ground lit by sun and sky. @param {LandscapeLightingState} state */
export function landscapeHazeIsotropicSource(state) {
    const up = evaluateLandscapeSkyIrradiance(state.skyCoefficients, [0, 1, 0]).map(value => Math.max(value, 0)), sunHeight = Math.max(state.sunDirection[1], 0);
    return [0, 1, 2].map(channel => state.skyCoefficients[channel] / Math.PI + .5 * LANDSCAPE_ATMOSPHERE.groundAlbedo / Math.PI * (state.sunIrradiance[channel] * sunHeight + up[channel]));
}

/**
 * Source radiance of a path whose Rayleigh and Mie layers contribute the given extinction depths (single scattering, without the horizon
 * calibration). Tier high replaces the isotropic sky term of each layer with the sky convolved with that layer's phase function.
 * @param {LandscapeLightingState} state @param {number[]} direction unit view direction @param {string} tier
 * @param {number[]} rayleighDepths per channel @param {number} mieDepth extinction depth of the Mie layer @returns {number[]}
 */
export function landscapeHazeSource(state, direction, tier, rayleighDepths, mieDepth) {
    const level = LANDSCAPE_LIGHTING_TIERS[landscapeLightingTier(tier)];
    const albedo = landscapeMieCoefficients().albedo, g = LANDSCAPE_ATMOSPHERE.mieAnisotropy;
    const mu = direction[0] * state.sunDirection[0] + direction[1] * state.sunDirection[1] + direction[2] * state.sunDirection[2];
    const isotropic = landscapeHazeIsotropicSource(state), average = [0, 1, 2].map(channel => state.skyCoefficients[channel] / Math.PI);
    const phased = weights => landscapeSkyRadianceBands(state.skyCoefficients, direction, weights).map((value, channel) => value - average[channel] + isotropic[channel]);
    const rayleighSky = level > 1 ? phased(LANDSCAPE_ATMOSPHERE.rayleighPhaseBands) : isotropic, mieSky = level > 1 ? phased([1, g, g * g]) : isotropic;
    return [0, 1, 2].map(channel => {
        const sun = state.sunIrradiance[channel], rayleigh = rayleighDepths[channel], total = rayleigh + mieDepth;
        return total > 0 ? (rayleigh * (rayleighSky[channel] + rayleighPhase(mu) * sun) + mieDepth * albedo * (mieSky[channel] + henyeyGreenstein(mu, g) * sun)) / total : 0;
    });
}

/**
 * The radiance an infinitely long path at constant density converges to along a direction (sea-level layer ratio), uncalibrated.
 * @param {LandscapeLightingState} state @param {number[]} direction @param {string} tier @returns {number[]}
 */
export function landscapeHazeAsymptote(state, direction, tier) {
    return landscapeHazeSource(state, direction, tier, LANDSCAPE_ATMOSPHERE.rayleighScattering, landscapeMieCoefficients().extinction);
}

/**
 * Per-channel calibration so the azimuth-averaged asymptote of horizontal paths equals the environment's horizon radiance.
 * @param {LandscapeLightingState} state @param {number[]} horizonRadiance @param {string} tier
 * @returns {{calibration:number[],raw:number[],asymptote:number[],clamped:boolean}}
 */
export function landscapeHazeCalibration(state, horizonRadiance, tier) {
    const samples = LANDSCAPE_ATMOSPHERE.horizonSamples, asymptote = [0, 0, 0];
    for (let index = 0; index < samples; index++) {
        const angle = (index + .5) / samples * 2 * Math.PI;
        landscapeHazeAsymptote(state, [Math.cos(angle), 0, Math.sin(angle)], tier).forEach((value, channel) => { asymptote[channel] += value / samples; });
    }
    const [low, high] = LANDSCAPE_ATMOSPHERE.calibrationRange;
    const raw = asymptote.map((value, channel) => value > 0 ? horizonRadiance[channel] / value : high);
    const calibration = raw.map(value => Math.min(high, Math.max(low, value)));
    return { calibration, raw, asymptote, clamped: calibration.some((value, channel) => value !== raw[channel]) };
}

/**
 * Aerial perspective along a straight path (closed-form two-layer optical depth, single scattering with a path-constant source).
 * @param {LandscapeLightingState} state @param {number[]} origin @param {number[]} target @param {string} tier
 * @returns {{transmittance:number[],inscatter:number[]}}
 */
export function landscapeAerialPerspective(state, origin, target, tier) {
    if (LANDSCAPE_LIGHTING_TIERS[landscapeLightingTier(tier)] === 0) return { transmittance: [1, 1, 1], inscatter: [0, 0, 0] };
    const ray = target.map((value, axis) => value - origin[axis]), distance = Math.hypot(...ray), direction = ray.map(value => value / Math.max(distance, 1e-4));
    const h0 = origin[1] - state.seaLevel, h1 = target[1] - state.seaLevel, mieExtinction = landscapeMieCoefficients().extinction;
    const rayleighLength = landscapeOpticalLength(h0, h1, distance, LANDSCAPE_ATMOSPHERE.rayleighScaleHeightMeters);
    const mieDepth = mieExtinction * landscapeOpticalLength(h0, h1, distance, LANDSCAPE_ATMOSPHERE.mieScaleHeightMeters);
    const rayleighDepths = LANDSCAPE_ATMOSPHERE.rayleighScattering.map(value => value * rayleighLength);
    const source = landscapeHazeSource(state, direction, tier, rayleighDepths, mieDepth), calibration = state.calibration ?? [1, 1, 1];
    const transmittance = rayleighDepths.map(depth => Math.exp(-(depth + mieDepth)));
    return { transmittance, inscatter: source.map((value, channel) => calibration[channel] * value * (1 - transmittance[channel])) };
}

/**
 * Exact unpolarized Fresnel reflectance of the air-water interface for light arriving from the side with index n1.
 * @param {number} cosIncidence cosine of the incidence angle (≥ 0) @param {number} [n1] @param {number} [n2] @returns {number}
 */
export function landscapeWaterFresnel(cosIncidence, n1 = 1, n2 = LANDSCAPE_WATER_OPTICS.ior) {
    const cosine = Math.min(1, Math.max(0, cosIncidence)), sine2 = (n1 / n2) ** 2 * (1 - cosine * cosine);
    if (sine2 >= 1) return 1;
    const transmitted = Math.sqrt(1 - sine2);
    const s = (n1 * cosine - n2 * transmitted) / (n1 * cosine + n2 * transmitted), p = (n2 * cosine - n1 * transmitted) / (n2 * cosine + n1 * transmitted);
    return .5 * (s * s + p * p);
}

/** Cosine of the refracted angle below the surface for light arriving at cosIncidence from air. @param {number} cosIncidence @returns {number} */
export function landscapeWaterRefractedCosine(cosIncidence) {
    const cosine = Math.min(1, Math.max(0, cosIncidence));
    return Math.sqrt(1 - (1 - cosine * cosine) / LANDSCAPE_WATER_OPTICS.ior ** 2);
}

/**
 * Exact straight in-water segment of a view ray from origin to a target below the optical water level.
 * @param {number[]} origin @param {number[]} target @param {number} waterLevel
 * @returns {{distance:number,pathLength:number,depth:number,startDepth:number,entry:number[]|null}}
 */
export function landscapeInWaterPath(origin, target, waterLevel) {
    const ray = target.map((value, axis) => value - origin[axis]), distance = Math.hypot(...ray), depth = waterLevel - target[1];
    if (depth <= 0) return { distance, pathLength: 0, depth: 0, startDepth: 0, entry: null };
    if (origin[1] <= waterLevel) return { distance, pathLength: distance, depth, startDepth: waterLevel - origin[1], entry: null };
    const pathLength = distance * depth / (origin[1] - target[1]), fraction = 1 - pathLength / distance;
    return { distance, pathLength, depth, startDepth: 0, entry: origin.map((value, axis) => value + ray[axis] * fraction) };
}

/** @param {number} rate @param {number} length @returns {number} ∫0^length exp(-rate·t) dt */
const exponentialIntegral = (rate, length) => Math.abs(rate * length) < 1e-4 ? length * (1 - .5 * rate * length) : (1 - Math.exp(-rate * length)) / rate;

/**
 * Water column along a straight in-water path. The source relaxes the radiance toward the deep-water equilibrium rrs·Ed(z) of Gordon et al.
 * (1988), scaled so an infinitely deep nadir column reproduces rrs·Ed(0−) exactly; Ed decays with the diffuse attenuation of sun and sky
 * light, and depth changes linearly along the path. Tier low keeps the deep-water radiance at the path's start as a constant source.
 * @param {LandscapeLightingState} state @param {{pathLength:number,descent:number,startDepth:number}} path @param {string} tier
 * @returns {{transmittance:number[],inscatter:number[],diffuseAttenuation:number[],deep:number[]}}
 */
export function landscapeWaterColumn(state, { pathLength, descent, startDepth }, tier) {
    const water = LANDSCAPE_WATER_OPTICS, level = LANDSCAPE_LIGHTING_TIERS[landscapeLightingTier(tier)];
    const kappa = water.absorption.map((value, channel) => value + water.backscatter[channel]);
    const mu = Math.max(state.sunDirection[1], 0), refracted = landscapeWaterRefractedCosine(mu), sunTransmission = 1 - landscapeWaterFresnel(mu);
    const up = evaluateLandscapeSkyIrradiance(state.skyCoefficients, [0, 1, 0]).map(value => Math.max(value, 0));
    const slope = descent / Math.max(pathLength, 1e-4);
    const result = { transmittance: [0, 0, 0], inscatter: [0, 0, 0], diffuseAttenuation: [0, 0, 0], deep: [0, 0, 0] };
    for (let channel = 0; channel < 3; channel++) {
        const sunPlane = state.sunIrradiance[channel] * mu * sunTransmission, skyPlane = up[channel] * water.diffuseTransmission, surface = sunPlane + skyPlane;
        const diffuse = kappa[channel] * (sunPlane / Math.max(refracted, 1e-3) + skyPlane / water.diffuseCosine) / Math.max(surface, 1e-6);
        const u = water.backscatter[channel] / kappa[channel], deep = (water.reflectanceCoefficients[0] + water.reflectanceCoefficients[1] * u) * u * surface * Math.exp(-diffuse * startDepth);
        const transmittance = Math.exp(-kappa[channel] * pathLength);
        result.transmittance[channel] = transmittance;
        result.inscatter[channel] = level === 0 ? deep * (1 - transmittance) : deep * (kappa[channel] + diffuse) * exponentialIntegral(kappa[channel] + diffuse * slope, pathLength);
        result.diffuseAttenuation[channel] = diffuse;
        result.deep[channel] = deep;
    }
    return result;
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = value => { const length = Math.hypot(...value); return value.map(component => component / length); };
const clamp01 = value => Math.min(1, Math.max(0, value));

/** Karis' analytic split-sum environment BRDF (landscapeDfg). @param {number} dotNV @param {number} roughness @returns {number[]} */
export function landscapeDfg(dotNV, roughness) {
    const r = [-1, -.0275, -.572, .022].map((value, index) => roughness * value + [1, .0425, 1.04, -.04][index]);
    const a004 = Math.min(r[0] * r[0], 2 ** (-9.28 * dotNV)) * r[0] + r[1];
    return [-1.04 * a004 + r[2], 1.04 * a004 + r[3]];
}

/** three.js BRDF_GGX with f90 = 1 (landscapeBrdfGgx). @param {number[]} l @param {number[]} v @param {number[]} n @param {number[]} f0 @param {number} roughness @returns {number[]} */
export function landscapeBrdfGgx(l, v, n, f0, roughness) {
    const alpha = roughness * roughness, a2 = alpha * alpha, h = normalize([l[0] + v[0], l[1] + v[1], l[2] + v[2]]);
    const dotNL = clamp01(dot(n, l)), dotNV = clamp01(dot(n, v)), dotNH = clamp01(dot(n, h)), dotVH = clamp01(dot(v, h));
    const gv = dotNL * Math.sqrt(a2 + (1 - a2) * dotNV * dotNV), gl = dotNV * Math.sqrt(a2 + (1 - a2) * dotNL * dotNL);
    const visibility = .5 / Math.max(gv + gl, 1e-6), denominator = dotNH * dotNH * (a2 - 1) + 1, fresnel = 2 ** ((-5.55473 * dotVH - 6.98316) * dotVH);
    return f0.map(value => (value * (1 - fresnel) + fresnel) * visibility / Math.PI * a2 / (denominator * denominator));
}

function brdfMultiscatter(l, v, n, f0, roughness) {
    const dfgV = landscapeDfg(clamp01(dot(n, v)), roughness), dfgL = landscapeDfg(clamp01(dot(n, l)), roughness);
    const emsV = 1 - dfgV[0] - dfgV[1], emsL = 1 - dfgL[0] - dfgL[1], single = landscapeBrdfGgx(l, v, n, f0, roughness);
    return f0.map((value, channel) => {
        const fssEssV = value * dfgV[0] + dfgV[1], fssEssL = value * dfgL[0] + dfgL[1], favg = value + (1 - value) * .047619;
        return single[channel] + fssEssV * fssEssL * favg / (1 - emsV * emsL * favg + 1e-6) * emsV * emsL;
    });
}

/**
 * Reflected radiance of an opaque surface under a sun, the sky and terrain-reflected light (landscapeReflectedRadiance). occlusion is the material
 * ambient occlusion; skyVisibility (default 1) the terrain sky visibility; response (default zero, the D5b Lambert/GGX model) the natural-ground
 * response [EON roughness, specular shadowing weight, opposition amplitude]; light.groundIrradiance (default zero) the terrain-reflected irradiance.
 * @param {{albedo:number[],normal:number[],view:number[],roughness:number,metalness:number,occlusion:number,skyVisibility?:number,response?:number[]}} surface
 * @param {{sunDirection:number[],sunIrradiance:number[],skyIrradiance:number[],skyRadiance:number[],groundIrradiance?:number[]}} light @returns {number[]}
 */
export function landscapeReflectedRadiance({ albedo, normal: n, view: v, roughness, metalness, occlusion, skyVisibility = 1, response = [0, 0, 0] }, light) {
    const l = light.sunDirection, f0 = albedo.map(value => .04 + (value - .04) * metalness), dotNL = clamp01(dot(n, l)), dotNV = clamp01(dot(n, v));
    const half = normalize([l[0] + v[0], l[1] + v[1], l[2] + v[2]]), shadowing = landscapeNaturalSpecularShadowing(clamp01(dot(v, half)), response[1]);
    const specular = brdfMultiscatter(l, v, n, f0, roughness), fab = landscapeDfg(dotNV, roughness), ems = 1 - fab[0] - fab[1], skyOcclusion = occlusion * skyVisibility;
    const diffuseColors = albedo.map(value => value * (1 - metalness)), diffuse = landscapeEonBrdf(diffuseColors, response[0], response[2], l, v, n);
    const ambientAlbedo = landscapeEonAlbedo(diffuseColors, response[0], dotNV), ground = light.groundIrradiance ?? [0, 0, 0];
    const specularOcclusion = clamp01((dotNV + skyOcclusion) ** (2 ** (-16 * roughness - 1)) - 1 + skyOcclusion) * landscapeNaturalSpecularShadowing(dotNV, response[1]);
    return albedo.map((_, channel) => {
        const single = f0[channel] * fab[0] + fab[1], favg = f0[channel] + (1 - f0[channel]) * .047619;
        const multi = single * favg / (1 - ems * favg) * ems, cosine = light.skyIrradiance[channel] / Math.PI;
        const direct = light.sunIrradiance[channel] * dotNL * (specular[channel] * shadowing + diffuse[channel]);
        return direct + (light.skyRadiance[channel] * single + multi * cosine) * specularOcclusion
            + ambientAlbedo[channel] * (1 - single - multi) * (cosine * skyOcclusion + ground[channel] * occlusion / Math.PI);
    });
}

const skyIrradiance = (state, n) => evaluateLandscapeSkyIrradiance(state.skyCoefficients, n).map(value => Math.max(value, 0));

/** Horizontal sun-and-sky irradiance (landscapeHorizontalIrradiance). @param {LandscapeLightingState} state */
export function landscapeHorizontalIrradiance(state) {
    const up = skyIrradiance(state, [0, 1, 0]);
    return state.sunIrradiance.map((value, channel) => value * Math.max(state.sunDirection[1], 0) + up[channel]);
}
const dominantReflection = (n, v, roughness) => { const r2 = roughness ** 4, d = dot(n, v), reflected = v.map((value, axis) => 2 * d * n[axis] - value); return normalize(reflected.map((value, axis) => value + (n[axis] - value) * r2)); };
const refractedSun = sun => { const x = sun[0] / LANDSCAPE_WATER_OPTICS.ior, z = sun[2] / LANDSCAPE_WATER_OPTICS.ior; return [x, Math.sqrt(Math.max(1 - x * x - z * z, 0)), z]; };

/** Split-sum reflectance of the water surface seen along v from above (landscapeWaterReflectance). @param {number[]} v @returns {number} */
export function landscapeWaterReflectance(v) {
    const f0 = ((LANDSCAPE_WATER_OPTICS.ior - 1) / (LANDSCAPE_WATER_OPTICS.ior + 1)) ** 2, fab = landscapeDfg(Math.max(v[1], 1e-4), landscapeWaterSurfaceRoughness().roughness);
    return f0 * fab[0] + fab[1];
}

/**
 * Radiance of a terrain fragment before tone mapping (terrainRadiance in terrain.frag.glsl) away from the one-pixel waterline blend, with a
 * perspective (origin = camera) or orthographic (origin on the camera plane) view ray and tiers low or standard. state.response holds the
 * uLandscapeResponse switches (absent: the D5b model). The fragment's response [EON roughness, specular shadowing weight, opposition amplitude]
 * and ground albedo default to the D5b neutral values; sunVisibility, skyVisibility and the eight horizon sines (with fieldWeight > 0) stand
 * for the evaluated terrain-field hooks (neutral when omitted); occluderNormal is the geometric normal that weighs the occluders (default normal).
 * @param {LandscapeLightingState & {waterLevel:number,response?:{model?:boolean,bounce?:boolean,terrainVisibility?:boolean}}} state
 * @param {{albedo:number[],normal:number[],roughness:number,metalness:number,ao:number,world:number[],origin:number[],response?:number[],groundAlbedo?:number[],
 *   sunVisibility?:number,skyVisibility?:number,horizonSine?:number[]|null,fieldWeight?:number,occluderNormal?:number[]}} fragment @param {string} tier
 * @returns {number[]}
 */
export function landscapeTerrainRadiance(state, { albedo, normal: n, roughness, metalness, ao, world, origin, response = [0, 0, 0], groundAlbedo = albedo,
    sunVisibility = 1, skyVisibility = 1, horizonSine = null, fieldWeight = 0, occluderNormal = n }, tier) {
    if (LANDSCAPE_LIGHTING_TIERS[landscapeLightingTier(tier)] > 1) throw new Error('[Landscape] The terrain radiance mirror covers tiers low and standard');
    const switches = landscapeResponseUniformValue(state.response), effective = response.map(value => value * switches[0]);
    const ray = origin.map((value, axis) => value - world[axis]), distance = Math.hypot(...ray), v = ray.map(value => value / Math.max(distance, 1e-4));
    const sun = state.sunDirection, depth = state.waterLevel - world[1], surface = { albedo, normal: n, view: v, roughness, metalness, occlusion: ao, skyVisibility, response: effective };
    if (depth <= 0) {
        const reflection = dominantReflection(n, v, roughness), skyRadiance = skyIrradiance(state, reflection).map(value => value / Math.PI);
        let groundIrradiance = [0, 0, 0];
        if (switches[1] > .5) {
            const occluders = LANDSCAPE_LIGHTING_TIERS[tier] > 0 && fieldWeight > 0 && horizonSine ? landscapeTerrainOccluderLight(occluderNormal, horizonSine, sun) : null;
            groundIrradiance = landscapeTerrainBounce({ normal: n, groundAlbedo, skyVisibility, occluders, sunDirection: sun, sunIrradiance: state.sunIrradiance,
                skyUp: skyIrradiance(state, [0, 1, 0]) }).irradiance;
            const horizontal = landscapeHorizontalIrradiance(state);
            for (let channel = 0; channel < 3; channel++) skyRadiance[channel] += groundAlbedo[channel] * horizontal[channel] * ((.5 - .5 * reflection[1]) / Math.PI);
        }
        const light = { sunDirection: sun, sunIrradiance: state.sunIrradiance.map(value => value * sunVisibility), skyIrradiance: skyIrradiance(state, n), skyRadiance, groundIrradiance };
        const haze = landscapeAerialPerspective(state, origin, world, tier), radiance = landscapeReflectedRadiance(surface, light);
        return radiance.map((value, channel) => value * haze.transmittance[channel] + haze.inscatter[channel]);
    }
    const water = LANDSCAPE_WATER_OPTICS, kappa = water.absorption.map((value, channel) => value + water.backscatter[channel]);
    const startDepth = Math.max(state.waterLevel - origin[1], 0), pathLength = origin[1] > state.waterLevel ? distance * depth / Math.max(origin[1] - world[1], 1e-4) : distance;
    const refracted = refractedSun(sun), mu = Math.max(sun[1], 0), muWater = Math.max(refracted[1], 1e-3), up = skyIrradiance(state, [0, 1, 0]), reflection = dominantReflection(n, v, roughness);
    const recycled = albedo.map((value, channel) => 1 / (1 - water.internalReflectance * value * Math.exp(-2 * kappa[channel] * depth)));
    const light = { sunDirection: refracted,
        sunIrradiance: state.sunIrradiance.map((value, channel) => value * (1 - landscapeWaterFresnel(mu)) * (mu / muWater) * Math.exp(-kappa[channel] * depth / muWater) * recycled[channel] * sunVisibility),
        skyIrradiance: up.map((value, channel) => value * water.diffuseTransmission * Math.exp(-kappa[channel] * depth / water.diffuseCosine) * recycled[channel] * (.5 + .5 * n[1])),
        skyRadiance: up.map((value, channel) => value * water.diffuseTransmission * Math.exp(-kappa[channel] * depth / water.diffuseCosine) * (.5 + .5 * reflection[1]) / Math.PI) };
    const column = landscapeWaterColumn(state, { pathLength, descent: depth - startDepth, startDepth }, tier);
    let radiance = landscapeReflectedRadiance(surface, light).map((value, channel) => value * column.transmittance[channel] + column.inscatter[channel]);
    if (origin[1] > state.waterLevel) {
        const entry = world.map((value, axis) => value + v[axis] * pathLength), haze = landscapeAerialPerspective(state, origin, entry, tier);
        const f0 = ((water.ior - 1) / (water.ior + 1)) ** 2, glint = landscapeBrdfGgx(sun, v, [0, 1, 0], [f0, f0, f0], landscapeWaterSurfaceRoughness().roughness);
        const transmission = Math.max(1 - landscapeWaterReflectance(v), 1e-3);
        radiance = radiance.map((value, channel) => (value / (water.ior * water.ior) + state.sunIrradiance[channel] * clamp01(sun[1]) * glint[channel] * sunVisibility / transmission) * haze.transmittance[channel] + haze.inscatter[channel]);
    }
    return radiance;
}

/** Physical constants and runtime state reported in the lighting snapshot. */
export function landscapeLightingConstants() {
    const mie = landscapeMieCoefficients(), surface = landscapeWaterSurfaceRoughness();
    return {
        atmosphere: { ...LANDSCAPE_ATMOSPHERE, mieScattering: mie.scattering, mieExtinction: mie.extinction, mieAlbedo: mie.albedo, visibilityMeters: landscapeAtmosphereVisibilityMeters() },
        water: { ...LANDSCAPE_WATER_OPTICS, attenuation: LANDSCAPE_WATER_OPTICS.absorption.map((value, channel) => value + LANDSCAPE_WATER_OPTICS.backscatter[channel]), surface },
        sky: { model: LANDSCAPE_SKY_IRRADIANCE.model, basis: LANDSCAPE_SKY_IRRADIANCE.basis, bands: LANDSCAPE_SKY_IRRADIANCE.bands }
    };
}

/**
 * The fixed reference illumination of isolated material probes: the pre-D5 shader's sun direction and radiance scale with its
 * hemisphere ambient expressed as sky irradiance, so relative material measurements keep their established magnitudes. It is not used
 * by the viewer.
 */
export const LANDSCAPE_REFERENCE_PROBE_LIGHTING = (() => {
    const length = Math.hypot(-.44, .87, -.22), ground = [.30, .34, .25], sky = [.65, .78, .83], scale = Math.PI * .68;
    const coefficients = new Array(33).fill(0);
    for (let channel = 0; channel < 3; channel++) { coefficients[channel] = scale * (ground[channel] + sky[channel]) / 2; coefficients[6 + channel] = scale * (sky[channel] - ground[channel]) / 2; }
    return Object.freeze({ sunDirection: Object.freeze([-.44 / length, .87 / length, -.22 / length]), sunIrradiance: Object.freeze([2.7, 2.6, 2.3]),
        skyCoefficients: Object.freeze(coefficients), calibration: Object.freeze([0, 0, 0]), seaLevel: 0, waterLevel: LANDSCAPE_WATER_LEVEL_DISABLED });
})();

/**
 * Uniform values of a lighting state in the shader layout (uLandscapeSky planar per channel, sun direction with the atmosphere's reference
 * level, sun irradiance with the optical water level, the response switches; an absent state.response is the D5b model).
 * @param {LandscapeLightingState & {waterLevel:number,response?:{model?:boolean,bounce?:boolean,terrainVisibility?:boolean}}} state
 * @returns {{uLandscapeSky:Float32Array,uLandscapeSun:Float32Array,uLandscapeSunIrradiance:Float32Array,uLandscapeResponse:Float32Array}}
 */
export function landscapeLightingUniformValues(state) {
    const { sunDirection, sunIrradiance, skyCoefficients, seaLevel, waterLevel } = state, calibration = state.calibration ?? [1, 1, 1];
    if (sunDirection?.length !== 3 || Math.abs(Math.hypot(...sunDirection) - 1) > 1e-5) throw new Error('[Landscape] The sun direction must be a unit vector');
    if (sunIrradiance?.length !== 3 || !sunIrradiance.every(value => Number.isFinite(value) && value >= 0)) throw new Error('[Landscape] The sun irradiance needs three non-negative channels');
    if (!Number.isFinite(seaLevel) || !Number.isFinite(waterLevel)) throw new Error('[Landscape] Sea and water levels must be finite');
    const sky = new Float32Array(36);
    for (let channel = 0; channel < 3; channel++) {
        for (let index = 0; index < LANDSCAPE_SKY_IRRADIANCE.coefficients; index++) sky[channel * 12 + index] = skyCoefficients[index * 3 + channel];
        sky[channel * 12 + 11] = calibration[channel];
    }
    return { uLandscapeSky: sky, uLandscapeSun: Float32Array.of(...sunDirection, seaLevel), uLandscapeSunIrradiance: Float32Array.of(...sunIrradiance, waterLevel),
        uLandscapeResponse: Float32Array.from(landscapeResponseUniformValue(state.response)) };
}

/**
 * Shader uniform cells ({value}) of a lighting state; without a state, the calibrated sun with no sky light, no water body and the shipped
 * response switches, which a material holds until the view lighting binds its shared cells.
 * @param {LandscapeLightingState & {waterLevel:number,response?:{model?:boolean,bounce?:boolean,terrainVisibility?:boolean}}} [state]
 * @returns {{uLandscapeSky:{value:Float32Array},uLandscapeSun:{value:Float32Array},uLandscapeSunIrradiance:{value:Float32Array},uLandscapeResponse:{value:Float32Array}}}
 */
export function createLandscapeLightingUniforms(state) {
    const values = landscapeLightingUniformValues(state ?? { sunDirection: landscapeSunDirection(CALIBRATED_DAYLIGHT.azimuthDeg, CALIBRATED_DAYLIGHT.elevationDeg),
        sunIrradiance: [...CALIBRATED_DAYLIGHT.sunNormalRgb], skyCoefficients: new Array(LANDSCAPE_SKY_IRRADIANCE.coefficients * 3).fill(0), seaLevel: 0, waterLevel: LANDSCAPE_WATER_LEVEL_DISABLED,
        response: { ...LANDSCAPE_LIGHTING.response } });
    return { uLandscapeSky: { value: values.uLandscapeSky }, uLandscapeSun: { value: values.uLandscapeSun }, uLandscapeSunIrradiance: { value: values.uLandscapeSunIrradiance },
        uLandscapeResponse: { value: values.uLandscapeResponse } };
}

/** Uniform cells of LANDSCAPE_REFERENCE_PROBE_LIGHTING (the D5b response) for isolated material probes (compile them with the low tier and
 * terrainAppearance: false: no haze, no water, no terrain-driven appearance). */
export function createLandscapeReferenceProbeLightingUniforms() { return createLandscapeLightingUniforms({ ...LANDSCAPE_REFERENCE_PROBE_LIGHTING }); }
