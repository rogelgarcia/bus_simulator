// Declares the world-anchored landscape-scale appearance variation of natural materials and the exact JavaScript mirror of its shader.
// @ts-check
// Repeating base tiles are homogeneous by design, so broad variation must come from the landscape itself. Two decorrelated unit fields
// (tone and chroma) of four rotated octaves from 400 m down to 25.6 m are unique and never repeat: hashed lattice noise anchored to world
// X/Z, seeded from the landscape seed and independent of camera, tiles, geometry LOD or residency. Each octave is quintic value noise
// whose corner hash yields both fields (low and high 16 bits), so the pair costs one hash per lattice corner; this field is evaluated for
// every terrain fragment, so it is kept several times cheaper than gradient noise. Every octave fades between 1/16 and 1/4 of its
// wavelength per pixel and the sum is divided by its unfaded deviation, a true low-pass: an unresolvable octave contributes its zero mean
// instead of aliasing. Data-driven per-material responses turn the fields into restrained log2 value, saturation, hue (rotation about the
// gray axis) and roughness changes. The field vector is the D5 input point: terrain-driven terms (slope, moisture, deposition) are added
// to the same vector before the unchanged responses. The shader chunk is chunks/landscape/macro_variation.glsl.
import { landscapeNoiseHash, landscapeNoiseSalt } from './LandscapeSurfaceNoise.js';

const octave = (wavelengthMeters, amplitude, rotation) => Object.freeze({ wavelengthMeters, amplitude, rotation: Object.freeze(rotation) });
const response = (value, saturation, hueDegrees, roughness) => Object.freeze({ value, saturation, hueDegrees, roughness });

export const LANDSCAPE_MACRO_VARIATION_OCTAVES = 4;

export const LANDSCAPE_MACRO_VARIATION = Object.freeze({
    id: 'landscape-macro-variation-v1',
    noise: 'landscape-dual-value-noise-v1',
    fields: Object.freeze(['tone', 'chroma']),
    octaves: Object.freeze([octave(400, 1, [1, 0]), octave(160, .65, [.8, .6]), octave(64, .35, [.28, .96]), octave(25.6, .18, [.6, .8])]),
    // standard deviation of one quintic dual-value-noise octave (measured over decorrelated samples of many salts)
    octaveDeviation: .4525,
    fadeStartWavelengths: 1 / 16,
    fadeEndWavelengths: 1 / 4,
    footprint: 'major axis of the 3D world screen derivatives',
    responseUnits: 'per unit field deviation: log2 value, saturation fraction, hue degrees, roughness',
    // lush grass is darker, greener and more saturated; soils darken with moisture; sand and rock stay subtle
    materials: Object.freeze({
        unknown: response(.08, .06, 1, .03),
        seabed: response(.06, .05, 1, .02),
        sand: response(.05, .06, 1, .03),
        loam: response(.10, .10, 3, .03),
        forest: response(.09, .06, 1.5, .04),
        rock: response(.07, .05, 1, .03)
    })
});

const LUMINANCE = [.2126, .7152, .0722];
const GRAY_AXIS = 1 / Math.sqrt(3);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const smoothstep = (edge0, edge1, value) => { const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

for (const [soilId, definition] of Object.entries(LANDSCAPE_MACRO_VARIATION.materials)) {
    if (!['value', 'saturation', 'hueDegrees', 'roughness'].every(key => finite(definition[key]) && Math.abs(definition[key]) <= (key === 'hueDegrees' ? 15 : .5))) {
        throw new Error(`[LandscapeMacroVariation] Soil ${soilId} needs bounded value, saturation, hue and roughness responses`);
    }
}

/** Macro responses of a catalog soil. @param {string} soilId */
export function landscapeMacroVariationDefinition(soilId) {
    const definition = typeof soilId === 'string' && Object.hasOwn(LANDSCAPE_MACRO_VARIATION.materials, soilId) ? LANDSCAPE_MACRO_VARIATION.materials[soilId] : null;
    if (!definition) throw new Error(`[LandscapeMacroVariation] No macro variation is defined for soil ${soilId}`);
    return definition;
}

function fieldComponent() {
    let hash = 0x811c9dc5;
    for (const character of 'macro-variation') hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0;
    return hash;
}

/** World-anchored octave salts, derived from the landscape surface seed; each salt drives both fields of its octave. @param {number} seed */
export function landscapeMacroVariationSalts(seed) {
    return Object.freeze(LANDSCAPE_MACRO_VARIATION.octaves.map((_, index) => landscapeNoiseSalt(seed, fieldComponent(), index)));
}

/** Reciprocal of the unfaded field deviation, so each field has unit standard deviation. */
export function landscapeMacroVariationScale() {
    const model = LANDSCAPE_MACRO_VARIATION;
    return 1 / (model.octaveDeviation * Math.sqrt(model.octaves.reduce((sum, value) => sum + value.amplitude ** 2, 0)));
}

function corner(i, j, salt) {
    const h = landscapeNoiseHash((Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ salt) >>> 0);
    return [(h & 0xffff) / 65535 * 2 - 1, (h >>> 16) / 65535 * 2 - 1];
}

/**
 * One rotated, salt-offset dual value-noise octave: [tone, chroma] in [-1, 1] at a world position.
 * @param {number} x @param {number} z @param {number} inverseWavelength @param {readonly number[]} rotation cos, sin @param {number} salt uint32
 */
export function landscapeMacroNoise(x, z, inverseWavelength, rotation, salt) {
    if (![x, z, inverseWavelength].every(finite) || !Number.isSafeInteger(salt) || salt < 0 || salt > 0xffffffff) throw new Error('[LandscapeMacroVariation] Macro noise needs a finite position and wavelength and a uint32 salt');
    const u = (rotation[0] * x - rotation[1] * z) * inverseWavelength + (salt & 0xffff) / 65536, v = (rotation[1] * x + rotation[0] * z) * inverseWavelength + (salt >>> 16) / 65536;
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const su = fu * fu * fu * (fu * (fu * 6 - 15) + 10), sv = fv * fv * fv * (fv * (fv * 6 - 15) + 10);
    const a = corner(i, j, salt), b = corner(i + 1, j, salt), c = corner(i, j + 1, salt), d = corner(i + 1, j + 1, salt);
    return [0, 1].map(k => { const bottom = a[k] + (b[k] - a[k]) * su, top = c[k] + (d[k] - c[k]) * su; return bottom + (top - bottom) * sv; });
}

/**
 * Footprint-filtered tone and chroma fields (unit deviation) at a world position.
 * @param {{x:number,z:number,metersPerPixel:number,salts:readonly number[],enabled?:boolean}} input
 */
export function landscapeMacroField({ x, z, metersPerPixel, salts, enabled = true }) {
    const model = LANDSCAPE_MACRO_VARIATION;
    if (![x, z].every(finite) || !finite(metersPerPixel) || metersPerPixel < 0 || !Array.isArray(salts) || salts.length !== model.octaves.length) {
        throw new Error('[LandscapeMacroVariation] The macro field needs a finite position, a nonnegative footprint and one salt per octave');
    }
    if (!enabled) return { tone: 0, chroma: 0 };
    let tone = 0, chroma = 0;
    model.octaves.forEach((value, index) => {
        const amplitude = value.amplitude * (1 - smoothstep(value.wavelengthMeters * model.fadeStartWavelengths, value.wavelengthMeters * model.fadeEndWavelengths, metersPerPixel));
        if (amplitude <= 0) return;
        const [octaveTone, octaveChroma] = landscapeMacroNoise(x, z, 1 / value.wavelengthMeters, value.rotation, salts[index]);
        tone += amplitude * octaveTone;
        chroma += amplitude * octaveChroma;
    });
    const scale = landscapeMacroVariationScale();
    return { tone: tone * scale, chroma: chroma * scale };
}

/**
 * Applies a soil's responses to linear albedo: hue rotation about the gray axis and saturation about Rec.709 luminance follow chroma,
 * the log2 value follows tone.
 * @param {string} soilId @param {{tone:number,chroma:number}} field @param {readonly number[]} rgb linear albedo
 */
export function landscapeMacroAlbedo(soilId, { tone, chroma }, rgb) {
    const definition = landscapeMacroVariationDefinition(soilId);
    if (![tone, chroma].every(finite) || !Array.isArray(rgb) || rgb.length !== 3 || !rgb.every(finite)) throw new Error('[LandscapeMacroVariation] Albedo variation needs a finite field and linear RGB');
    const angle = definition.hueDegrees * Math.PI / 180 * chroma, cosine = Math.cos(angle), sine = Math.sin(angle);
    const projection = (rgb[0] + rgb[1] + rgb[2]) * GRAY_AXIS;
    const cross = [GRAY_AXIS * (rgb[2] - rgb[1]), GRAY_AXIS * (rgb[0] - rgb[2]), GRAY_AXIS * (rgb[1] - rgb[0])];
    const rotated = rgb.map((channel, index) => channel * cosine + cross[index] * sine + GRAY_AXIS * projection * (1 - cosine));
    const luminance = rotated.reduce((sum, channel, index) => sum + channel * LUMINANCE[index], 0), saturation = Math.max(0, 1 + definition.saturation * chroma);
    const gain = 2 ** (definition.value * tone);
    return rotated.map(channel => Math.max(0, (luminance + (channel - luminance) * saturation) * gain));
}

/** @param {string} soilId @param {{tone:number,chroma:number}} field @param {number} roughness */
export function landscapeMacroRoughness(soilId, { tone }, roughness) {
    const definition = landscapeMacroVariationDefinition(soilId);
    if (!finite(tone) || !finite(roughness)) throw new Error('[LandscapeMacroVariation] Roughness variation needs a finite field and roughness');
    return Math.max(0.05, Math.min(1, roughness + definition.roughness * tone));
}

/**
 * Terrain shader interface (chunks/landscape/macro_variation.glsl): uMacroOctaves[4] vec4(1 / wavelength, amplitude, cos, sin),
 * uMacroSalts ivec4 octave salts (two's-complement), uMacroSettings vec4(enabled, fade start and end in wavelengths, field scale) and
 * per soil slot uSoilMacro vec4(log2 value, saturation, hue radians, roughness) per unit field.
 * @param {{seed:number,soils:ReadonlyArray<{soilId:string}>,enabled?:boolean}} input
 */
export function landscapeMacroVariationUniforms({ seed, soils, enabled = true }) {
    if (!Array.isArray(soils) || soils.length < 1 || soils.length > 6 || typeof enabled !== 'boolean') throw new Error('[LandscapeMacroVariation] Macro uniforms need one to six soil slots and boolean enablement');
    const model = LANDSCAPE_MACRO_VARIATION, salts = landscapeMacroVariationSalts(seed);
    const octaves = new Float32Array(LANDSCAPE_MACRO_VARIATION_OCTAVES * 4), responses = new Float32Array(24);
    model.octaves.forEach((value, index) => octaves.set([1 / value.wavelengthMeters, value.amplitude, value.rotation[0], value.rotation[1]], index * 4));
    soils.forEach(({ soilId }, index) => {
        const definition = landscapeMacroVariationDefinition(soilId);
        responses.set([definition.value, definition.saturation, definition.hueDegrees * Math.PI / 180, definition.roughness], index * 4);
    });
    return Object.freeze({ uMacroOctaves: octaves, uMacroSalts: Int32Array.from(salts, salt => salt | 0), uSoilMacro: responses,
        uMacroSettings: Float32Array.of(enabled ? 1 : 0, model.fadeStartWavelengths, model.fadeEndWavelengths, landscapeMacroVariationScale()) });
}
