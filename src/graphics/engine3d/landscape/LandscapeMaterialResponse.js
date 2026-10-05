// Declares the natural-ground reflectance response and terrain-reflected light of the landscape lighting, with exact JavaScript mirrors.
// @ts-check
// Design (landscape-material-response-v1). Dry soil, sand and grass canopies scatter light back toward the sun and keep little forward
// specular sheen unless wet; a single opaque GGX interface over a Lambertian body predicts the opposite at a low sun. Three established,
// separately parameterized terms replace it per material, all neutral at zero (the D5b response):
// - diffuse: EON, the energy-preserving Fujii Oren-Nayar model of rough diffuse surfaces (Portsmouth, Kutz & Hill 2025, JCGT 14(1); the
//   OpenPBR 1.1 diffuse lobe), whose V-cavity single scattering brightens backscatter and darkens forward scatter while its multiple
//   scattering lobe keeps a white surface white. Roughness is chosen so the principal-plane backscatter/forward reflectance ratio at 60°
//   sun and view zenith falls within field goniometer measurements of soils, sand and lawns (about 1.3–3; Kimes 1983, Kimes et al. 1985,
//   Sandmeier & Itten 1999);
// - opposition (hot spot): Hapke's shadow-hiding factor 1 + B0 / (1 + tan(g/2) / h) on single scattering (Hapke 1986, 2002; Kuusk 1985 for
//   canopies), normalized by its cosine-weighted mean at nadir so it moves energy into the backscatter peak instead of adding it;
// - specular shadowing of natural surfaces: the empirical exp(-tan γ) of POLDER surface reflectance (Maignan, Bréon et al. 2009, Remote
//   Sensing of Environment 113:2642), γ being the incidence angle on the reflecting facet, scales the GGX lobe by a per-material weight:
//   porous dry ground loses its grazing forward sheen while normal incidence keeps its Fresnel reflection; smooth or wet ground keeps GGX.
// Terrain-reflected light (landscape-terrain-bounce-v1): the calibrated HDR's lower hemisphere is nearly black, so the facet's view of
// the ground below the horizontal ((1 - n_y)/2 of its cosine-weighted hemisphere, Liu & Jordan 1963) and of the terrain hiding its sky
// ((1 - V)(1 + n_y)/2, Dozier & Frew 1990) is supplied as Lambertian ground of the surface's own material mean albedo. Open ground takes
// the horizontal sun-and-sky irradiance; occluding terrain in each stored horizon azimuth faces back toward the facet at the horizon
// elevation and takes the sun on that orientation plus the sky of its tilt. Second-order interreflection and the shadowing of the
// surrounding terrain itself are not modeled.
const PI = Math.PI;
const FON_C1 = .5 - 2 / (3 * PI), FON_C2 = 2 / 3 - 28 / (15 * PI);
const FON_POLYNOMIAL = Object.freeze([.0571085289, .491881867, -.332181442, .0714429953]);

const material = (diffuseRoughness, specularShadowing, opposition, basis) => Object.freeze({ diffuseRoughness, specularShadowing, opposition, basis });

export const LANDSCAPE_MATERIAL_RESPONSE = Object.freeze({
    id: 'landscape-material-response-v1',
    diffuse: 'eon-energy-preserving-oren-nayar',
    opposition: 'hapke-shadow-hiding-normalized',
    specularShadowing: 'maignan-2009-exp-tan-incidence',
    bounce: 'landscape-terrain-bounce-v1',
    // Hapke/Kuusk angular width h of the opposition peak: blade width over canopy depth of short grass, and the porosity-related width of
    // soils, both about 0.05-0.1; one width keeps the blended peak shape stable across material boundaries
    oppositionWidth: .06,
    referenceZenithDegrees: 60,
    materials: Object.freeze({
        unknown: material(.3, 1, .35, 'bare mineral soil: porous, moderately rough'),
        seabed: material(.25, 0, 0, 'submerged sand: water-filled pores keep the wet interface specular; no shadow hiding under refraction'),
        sand: material(.25, 1, .25, 'dry beach sand: granular, weak broad backscatter'),
        loam: material(.3, 1, .5, 'short grass canopy: shadowing canopy, pronounced hot spot'),
        forest: material(.35, 1, .35, 'forest litter and humus: rough, porous'),
        rock: material(.15, .5, .1, 'weathered granite outcrop: partly smooth crystalline facets')
    })
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp01 = value => Math.min(1, Math.max(0, value));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function validateMaterial(soilId, definition) {
    const { diffuseRoughness, specularShadowing, opposition } = definition ?? {};
    if (![diffuseRoughness, specularShadowing].every(value => finite(value) && value >= 0 && value <= 1) || !(finite(opposition) && opposition >= 0 && opposition <= 2)) {
        throw new Error(`[LandscapeMaterialResponse] Soil ${soilId} needs a diffuse roughness and specular shadowing weight in 0..1 and an opposition amplitude in 0..2`);
    }
    return definition;
}
for (const [soilId, definition] of Object.entries(LANDSCAPE_MATERIAL_RESPONSE.materials)) validateMaterial(soilId, definition);

/** Natural-ground response of a catalog soil. @param {string} soilId */
export function landscapeMaterialResponseDefinition(soilId) {
    const definition = typeof soilId === 'string' && Object.hasOwn(LANDSCAPE_MATERIAL_RESPONSE.materials, soilId) ? LANDSCAPE_MATERIAL_RESPONSE.materials[soilId] : null;
    if (!definition) throw new Error(`[LandscapeMaterialResponse] No natural-ground response is defined for soil ${soilId}`);
    return definition;
}

/** Fujii Oren-Nayar directional albedo of a unit-albedo surface, exact closed form (EON paper, E_FON). @param {number} mu @param {number} r */
export function landscapeFonAlbedoExact(mu, r) {
    const af = 1 / (1 + FON_C1 * r), si = Math.sqrt(Math.max(0, 1 - mu * mu));
    const g = si * (Math.acos(Math.min(1, Math.max(-1, mu))) - si * mu) + 2 / 3 * (si / Math.max(mu, 1e-9) * (1 - si * si * si) - si);
    return af + r * af / PI * g;
}

/** Polynomial fit of the Fujii Oren-Nayar directional albedo used by the shader (landscapeFonAlbedo). @param {number} mu @param {number} r */
export function landscapeFonAlbedo(mu, r) {
    const m = 1 - mu, [g1, g2, g3, g4] = FON_POLYNOMIAL;
    return (1 + r * m * (g1 + m * (g2 + m * (g3 + m * g4)))) / (1 + FON_C1 * r);
}

/** Cosine-weighted mean directional albedo of the Fujii Oren-Nayar lobe. @param {number} r */
export function landscapeFonMeanAlbedo(r) { return (1 + FON_C2 * r) / (1 + FON_C1 * r); }

/**
 * Hapke shadow-hiding opposition profile 1 / (1 + tan(g/2) / h) at the phase angle g between the directions toward the light and the viewer.
 * @param {number} cosPhase cos g = l·v @param {number} [width] h
 */
export function landscapeOppositionProfile(cosPhase, width = LANDSCAPE_MATERIAL_RESPONSE.oppositionWidth) {
    const c = Math.min(1, Math.max(-1, cosPhase)), halfTangent = Math.sqrt(Math.max(0, 1 - c) / Math.max(1 + c, 1e-6));
    return 1 / (1 + halfTangent / width);
}

const oppositionMeans = new Map();
/** Cosine-weighted mean of the opposition profile over the light hemisphere of a nadir view (its normalization). @param {number} [width] */
export function landscapeOppositionMean(width = LANDSCAPE_MATERIAL_RESPONSE.oppositionWidth) {
    if (!(finite(width) && width > 0)) throw new Error('[LandscapeMaterialResponse] The opposition width must be positive');
    if (oppositionMeans.has(width)) return oppositionMeans.get(width);
    // phase angle = light zenith for a nadir view: 2 ∫ b(θ) cos θ sin θ dθ by the midpoint rule
    const steps = 20000;
    let sum = 0;
    for (let i = 0; i < steps; i++) { const theta = (i + .5) / steps * PI / 2; sum += landscapeOppositionProfile(Math.cos(theta), width) * Math.sin(2 * theta); }
    const mean = sum * (PI / 2) / steps;
    oppositionMeans.set(width, mean);
    return mean;
}

/** Normalized opposition factor of single scattering. @param {number} cosPhase @param {number} amplitude B0 */
export function landscapeOppositionFactor(cosPhase, amplitude) {
    return (1 + amplitude * landscapeOppositionProfile(cosPhase)) / (1 + amplitude * landscapeOppositionMean());
}

/**
 * Natural-surface specular shadowing mix(1, exp(-tan γ), weight) with cos γ the incidence cosine on the reflecting facet (v·h).
 * @param {number} cosIncidence @param {number} weight
 */
export function landscapeNaturalSpecularShadowing(cosIncidence, weight) {
    const c = Math.max(cosIncidence, 1e-4), tangent = Math.sqrt(Math.max(0, 1 - c * c)) / c;
    return 1 + (Math.exp(-tangent) - 1) * weight;
}

/**
 * EON diffuse BRDF (energy-preserving Fujii Oren-Nayar, approximate albedo fit) with the normalized opposition factor on single scattering.
 * @param {number[]} rho diffuse color per channel @param {number} r roughness @param {number} opposition B0
 * @param {number[]} l unit direction toward the light @param {number[]} v unit direction toward the viewer @param {number[]} n unit normal
 * @returns {number[]}
 */
export function landscapeEonBrdf(rho, r, opposition, l, v, n) {
    const muI = clamp01(dot(n, l)), muO = clamp01(dot(n, v)), s = dot(l, v) - muI * muO;
    const sOverT = s > 0 ? s / Math.max(muI, muO, 1e-6) : s, af = 1 / (1 + FON_C1 * r);
    const single = af * (1 + r * sOverT) * landscapeOppositionFactor(dot(l, v), opposition);
    const mean = af * (1 + FON_C2 * r), lobe = Math.max(1e-7, 1 - landscapeFonAlbedo(muO, r)) * Math.max(1e-7, 1 - landscapeFonAlbedo(muI, r)) / Math.max(1e-7, 1 - mean);
    return rho.map(value => (value * single + value * value * mean / (1 - value * (1 - mean)) * lobe) / PI);
}

/** EON directional albedo under uniform illumination (the ambient diffuse response). @param {number[]} rho @param {number} r @param {number} muO */
export function landscapeEonAlbedo(rho, r, muO) {
    const e = landscapeFonAlbedo(clamp01(muO), r), mean = landscapeFonMeanAlbedo(r);
    return rho.map(value => value * e + value * value * mean / (1 - value * (1 - mean)) * (1 - e));
}

/**
 * Principal-plane backscatter/forward reflectance ratio of a material's diffuse response at equal sun and view zenith (the field
 * goniometer comparison quantity; backscatter is the hot spot direction).
 * @param {string} soilId @param {number} [zenithDegrees] @param {number} [albedo]
 */
export function landscapeBackscatterRatio(soilId, zenithDegrees = LANDSCAPE_MATERIAL_RESPONSE.referenceZenithDegrees, albedo = .2) {
    const { diffuseRoughness, opposition } = landscapeMaterialResponseDefinition(soilId), t = zenithDegrees * PI / 180, n = [0, 1, 0];
    const v = [Math.sin(t), Math.cos(t), 0], back = landscapeEonBrdf([albedo], diffuseRoughness, opposition, v, v, n)[0];
    const forward = landscapeEonBrdf([albedo], diffuseRoughness, opposition, [-Math.sin(t), Math.cos(t), 0], v, n)[0];
    return back / forward;
}

/**
 * Occluders of terrain-reflected light (landscapeTerrainOccluderLight in lighting.glsl): in each stored horizon azimuth the terrain up to the
 * horizon elevation h faces back toward the facet at slope h; azimuths weigh by the cosine-weighted solid angle ∫ (a cos e + n_y sin e) cos e de
 * of their hidden band [0, h]. The terrain program weighs them for the geometric normal once per fragment.
 * @param {number[]} n unit facet normal @param {ArrayLike<number>} horizonSine the eight stored sines (azimuths 0..315° counterclockwise from +X toward +Z)
 * @param {number[]} s unit direction toward the sun @returns {{sun:number,sky:number,total:number}} mean sun cosine and sky view (open ground: max(s_y, 0), 1)
 */
export function landscapeTerrainOccluderLight(n, horizonSine, s) {
    let total = 0, sun = 0, sky = 0;
    for (let k = 0; k < 8; k++) {
        const azimuth = k * PI / 4, c = Math.cos(azimuth), z = Math.sin(azimuth), sine = Math.min(1, Math.max(0, horizonSine[k])), h = Math.asin(sine), cosine = Math.sqrt(1 - sine * sine);
        const weight = Math.max(0, (n[0] * c + n[2] * z) * (.5 * h + .5 * sine * cosine) + n[1] * .5 * sine * sine);
        // occluder normal (-cos φ sin h, cos h, -sin φ sin h)
        sun += weight * Math.max(0, cosine * s[1] - sine * (s[0] * c + s[2] * z));
        sky += weight * (.5 + .5 * cosine);
        total += weight;
    }
    return total > 1e-6 ? { sun: sun / total, sky: sky / total, total } : { sun: Math.max(s[1], 0), sky: 1, total };
}

/**
 * Terrain-reflected irradiance on a facet (landscapeTerrainBounce in lighting.glsl): ground below the horizontal ((1 - n_y)/2) at the horizontal
 * sun-and-sky irradiance plus, where terrain hides the sky ((1 - V)(1 + n_y)/2), the fragment's occluders. occluders is null without terrain
 * fields (and in tier low, where V stays 1).
 * @param {{normal:number[],groundAlbedo:number[],skyVisibility:number,occluders?:{sun:number,sky:number}|null,sunDirection:number[],sunIrradiance:number[],skyUp:number[]}} input
 * @returns {{irradiance:number[],below:number,occluded:number}} irradiance already includes the ground albedo
 */
export function landscapeTerrainBounce({ normal: n, groundAlbedo, skyVisibility, occluders = null, sunDirection: s, sunIrradiance, skyUp }) {
    const horizontalSun = Math.max(s[1], 0), below = .5 - .5 * n[1], occluded = occluders && skyVisibility < 1 ? (1 - skyVisibility) * (.5 + .5 * n[1]) : 0;
    const occluderSun = occluders?.sun ?? horizontalSun, occluderSky = occluders?.sky ?? 1;
    const irradiance = groundAlbedo.map((albedo, channel) => albedo * (below * (sunIrradiance[channel] * horizontalSun + skyUp[channel])
        + occluded * (sunIrradiance[channel] * occluderSun + skyUp[channel] * occluderSky)));
    return { irradiance, below, occluded };
}

/**
 * Shader values of the soil slots: uSoilResponse vec4(diffuse roughness, specular shadowing weight, mean normal slope X, Y) (the slope is
 * written by the material calibration) and the opposition amplitude for uSoilState.w.
 * @param {ReadonlyArray<{soilId:string}>} soils @returns {Readonly<{response:Float32Array,opposition:Float32Array}>}
 */
export function landscapeMaterialResponseValues(soils) {
    if (!Array.isArray(soils) || soils.length < 1 || soils.length > 6) throw new Error('[LandscapeMaterialResponse] Response values need one to six soil slots');
    const response = new Float32Array(soils.length * 4), opposition = new Float32Array(soils.length);
    soils.forEach(({ soilId }, index) => {
        const definition = landscapeMaterialResponseDefinition(soilId);
        response.set([definition.diffuseRoughness, definition.specularShadowing, 0, 0], index * 4);
        opposition[index] = definition.opposition;
    });
    return Object.freeze({ response, opposition });
}

/** Compile-time constants of the response chunk. @returns {Readonly<Record<string,string>>} */
export function landscapeMaterialResponseDefines() {
    const text = value => { const string = String(value); return /[.e]/.test(string) ? string : `${string}.0`; };
    return Object.freeze({
        LANDSCAPE_FON_C1: text(FON_C1),
        LANDSCAPE_FON_C2: text(FON_C2),
        LANDSCAPE_OPPOSITION_WIDTH: text(LANDSCAPE_MATERIAL_RESPONSE.oppositionWidth),
        LANDSCAPE_OPPOSITION_MEAN: text(landscapeOppositionMean())
    });
}

/** Model description for snapshots and evidence. */
export function landscapeMaterialResponseSnapshot() {
    return { id: LANDSCAPE_MATERIAL_RESPONSE.id, diffuse: LANDSCAPE_MATERIAL_RESPONSE.diffuse, opposition: LANDSCAPE_MATERIAL_RESPONSE.opposition,
        specularShadowing: LANDSCAPE_MATERIAL_RESPONSE.specularShadowing, bounce: LANDSCAPE_MATERIAL_RESPONSE.bounce, oppositionWidth: LANDSCAPE_MATERIAL_RESPONSE.oppositionWidth,
        oppositionMean: landscapeOppositionMean(),
        materials: Object.fromEntries(Object.entries(LANDSCAPE_MATERIAL_RESPONSE.materials).map(([soilId, definition]) => [soilId, { ...definition, backscatterRatio60: landscapeBackscatterRatio(soilId) }])) };
}
