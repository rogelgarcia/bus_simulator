// Declares world-anchored stochastic hex tiling of landscape materials and the exact JavaScript mirror of its shader math.
// @ts-check
// Each material lattice (one per planar projection, plus micro detail) is covered by an equilateral triangle grid measured in texture periods and turned
// by a salt-derived angle, so grid edges align neither with texture, world nor neighbouring-material axes. Every grid vertex
// owns a hashed random offset and a catalog-constrained rotation; a fragment blends the three vertices of its triangle with
// one weight set shared by base color, normals (blended as slopes), ORM and relief, so all surface channels stay coherent.
// hex-contrast sharpens barycentric weights by an exponent and scales them by each sample's relief (Mikkelsen 2022), so
// raised grains win at patch borders instead of ghosting; hex-variance blends around the material's exact mean and restores
// the variance a linear blend loses (Heitz and Neyret 2018, Burley 2019). Gradients are rotated with each sample so mip and
// anisotropic selection stay exact, and sampled tangent-space slopes are rotated back by the inverse rotation. Hashing uses
// the surface warp's integer murmur finalizer, so JavaScript and GLSL select identical vertices, offsets and rotations.
import { landscapeNoiseHash, landscapeNoiseSalt } from './LandscapeSurfaceNoise.js';
import { LANDSCAPE_MICRO_DETAIL } from './LandscapeMicroDetail.js';

/** Compile-time shader modes (LANDSCAPE_MATERIAL_SAMPLING define values). */
export const LANDSCAPE_MATERIAL_SAMPLING_MODES = Object.freeze({ single: 0, 'hex-linear': 1, 'hex-contrast': 2, 'hex-variance': 3 });
export const LANDSCAPE_MATERIAL_SAMPLING_DEFINE = 'LANDSCAPE_MATERIAL_SAMPLING';

const material = (cellsPerPeriod, rotationRangeDegrees, offsetSpreadV, contrastExponent) => Object.freeze({ cellsPerPeriod, rotationRangeDegrees, offsetSpreadV, contrastExponent });

export const LANDSCAPE_MATERIAL_SAMPLING = Object.freeze({
    id: 'landscape-hex-tiling-v1',
    lattice: 'equilateral-triangle-grid-in-texture-periods',
    hash: 'murmur-mixed-integer-hash',
    defaultMode: 'hex-contrast',
    contrastSignal: 'relief-or-luminance',
    contrastFalloff: .6,
    weightCutoff: 1 / 512,
    varianceExponent: 3,
    samplesPerLattice: 3,
    slopeLimit: 128,
    projections: Object.freeze(['top', 'side-x', 'side-z']),
    projectionSaltMixes: Object.freeze([0, 0x9b05688c, 0x1f83d9ab]),
    latticeAngleSaltMix: 0x3c6ef372,
    rotationSaltMix: 0x9e3779b9,
    materials: Object.freeze({
        unknown: material(3, 180, 1, 7),
        seabed: material(3, 0, 0, 7),
        sand: material(3, 0, 0, 7),
        loam: material(3, 180, 1, 7),
        forest: material(3, 180, 1, 7),
        rock: material(3, 180, 1, 7)
    })
});

const SKEW_X = 1 / Math.sqrt(3), SKEW_Y = 2 / Math.sqrt(3), VERTEX_Y = Math.sqrt(3) / 2, LATTICE_SYMMETRY = Math.PI / 3;
const LUMINANCE = [.2126, .7152, .0722];
const frac = value => value - Math.floor(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);

function validateDefinition(soilId, definition) {
    const { cellsPerPeriod, rotationRangeDegrees, offsetSpreadV, contrastExponent } = definition ?? {};
    if (!(finite(cellsPerPeriod) && cellsPerPeriod >= 1 && cellsPerPeriod <= 16) || !(finite(rotationRangeDegrees) && rotationRangeDegrees >= 0 && rotationRangeDegrees <= 180)
        || !(finite(offsetSpreadV) && offsetSpreadV >= 0 && offsetSpreadV <= 1) || !(finite(contrastExponent) && contrastExponent >= 1 && contrastExponent <= 16)) {
        throw new Error(`[LandscapeMaterialSampling] Soil ${soilId} needs 1-16 cells per period, a 0-180 degree rotation range, an offset spread in 0..1 and a contrast exponent in 1..16`);
    }
    return definition;
}
for (const [soilId, definition] of Object.entries(LANDSCAPE_MATERIAL_SAMPLING.materials)) validateDefinition(soilId, definition);

/** Compile-time define value of a sampling mode name. @param {string} mode @returns {number} */
export function landscapeMaterialSamplingMode(mode) {
    if (typeof mode !== 'string' || !Object.hasOwn(LANDSCAPE_MATERIAL_SAMPLING_MODES, mode)) {
        throw new Error(`[LandscapeMaterialSampling] Material sampling must be one of ${Object.keys(LANDSCAPE_MATERIAL_SAMPLING_MODES).join(', ')}; received ${mode}`);
    }
    return LANDSCAPE_MATERIAL_SAMPLING_MODES[mode];
}

/** Stochastic tiling parameters of a catalog soil. @param {string} soilId */
export function landscapeMaterialSamplingDefinition(soilId) {
    const definition = typeof soilId === 'string' && Object.hasOwn(LANDSCAPE_MATERIAL_SAMPLING.materials, soilId) ? LANDSCAPE_MATERIAL_SAMPLING.materials[soilId] : null;
    if (!definition) throw new Error(`[LandscapeMaterialSampling] No stochastic tiling is defined for soil ${soilId}`);
    return definition;
}

function samplingComponent(soilId) {
    let hash = 0x811c9dc5;
    for (const character of `material-sampling/${soilId}`) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0;
    return hash;
}

/**
 * World-anchored lattice salt of one soil and planar projection, derived from the landscape surface seed; side projection salts are the
 * hashed top salt so the shader needs one salt per soil. The top projection keeps the AI577 D3 lattice exactly.
 * @param {number} seed @param {string} soilId @param {'top'|'side-x'|'side-z'} [projection]
 */
export function landscapeMaterialSamplingSalt(seed, soilId, projection = 'top') {
    landscapeMaterialSamplingDefinition(soilId);
    const index = LANDSCAPE_MATERIAL_SAMPLING.projections.indexOf(projection);
    if (index < 0) throw new Error(`[LandscapeMaterialSampling] Projection must be one of ${LANDSCAPE_MATERIAL_SAMPLING.projections.join(', ')}; received ${projection}`);
    const top = landscapeNoiseSalt(seed, samplingComponent(soilId), 0);
    return index === 0 ? top : landscapeNoiseHash((top ^ LANDSCAPE_MATERIAL_SAMPLING.projectionSaltMixes[index]) >>> 0);
}

/** Salt of the micro-detail lattice that accompanies a projection lattice salt. @param {number} salt uint32 */
export function landscapeMicroSamplingSalt(salt) {
    return landscapeNoiseHash((salt ^ LANDSCAPE_MICRO_DETAIL.saltMix) >>> 0);
}

/** Salt-derived lattice angle in radians, within the triangle grid's sixty-degree symmetry. @param {number} salt */
export function landscapeHexLatticeAngle(salt) {
    return (landscapeNoiseHash((salt ^ LANDSCAPE_MATERIAL_SAMPLING.latticeAngleSaltMix) >>> 0) & 0xffff) / 65536 * LATTICE_SYMMETRY;
}

/**
 * Triangle of the equilateral grid (unit edge) containing a lattice point: integer vertex ids of the skewed grid and their
 * barycentric weights. Barycentric weights are affine invariant, so the skewed fractions give them exactly.
 * @param {number} x @param {number} y
 */
export function landscapeHexTriangle(x, y) {
    if (!finite(x) || !finite(y)) throw new Error('[LandscapeMaterialSampling] Lattice coordinates must be finite');
    const qx = x - y * SKEW_X, qy = y * SKEW_Y, bx = Math.floor(qx), by = Math.floor(qy), fx = qx - bx, fy = qy - by;
    if (fx + fy > 1) return { vertices: [[bx + 1, by + 1], [bx, by + 1], [bx + 1, by]], barycentric: [fx + fy - 1, 1 - fx, 1 - fy] };
    return { vertices: [[bx, by], [bx + 1, by], [bx, by + 1]], barycentric: [1 - fx - fy, fx, fy] };
}

/** Lattice-space position of a skewed grid vertex. @param {number} i @param {number} j @returns {[number, number]} */
export function landscapeHexVertexCenter(i, j) { return [i + j / 2, j * VERTEX_Y]; }

/**
 * Hashed random offset (texture periods; V spread constrained by the catalog) and rotation of one grid vertex.
 * @param {number} i @param {number} j @param {number} salt @param {{rotationRangeRadians:number,offsetSpreadV:number}} options
 */
export function landscapeHexVertexTransform(i, j, salt, { rotationRangeRadians, offsetSpreadV }) {
    if (!Number.isSafeInteger(i) || !Number.isSafeInteger(j)) throw new Error('[LandscapeMaterialSampling] Grid vertices must be integers');
    const h = landscapeNoiseHash((Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ salt) >>> 0);
    const g = landscapeNoiseHash((h ^ LANDSCAPE_MATERIAL_SAMPLING.rotationSaltMix) >>> 0);
    return { offset: [(h & 0xffff) / 65536, (h >>> 16) * offsetSpreadV / 65536], angle: ((g & 0xffff) / 65535 * 2 - 1) * rotationRangeRadians };
}

/**
 * The three samples of one material lattice at texture coordinate (u, v): sample coordinates rotated about their vertex
 * centers plus the hashed offset (wrapped to one period), rotations and normalized pre-contrast weights barycentric^exponent.
 * @param {{u:number,v:number,cellsPerPeriod:number,salt:number,rotationRangeRadians:number,offsetSpreadV:number,exponent:number}} input
 */
export function landscapeHexLattice({ u, v, cellsPerPeriod, salt, rotationRangeRadians, offsetSpreadV, exponent }) {
    if (![u, v].every(finite) || !(finite(cellsPerPeriod) && cellsPerPeriod > 0) || !(finite(exponent) && exponent >= 1) || !Number.isSafeInteger(salt) || salt < 0 || salt > 0xffffffff) {
        throw new Error('[LandscapeMaterialSampling] Lattices need finite coordinates, positive cells, an exponent of at least one and a uint32 salt');
    }
    const angle = landscapeHexLatticeAngle(salt), cb = Math.cos(angle), sb = Math.sin(angle);
    const triangle = landscapeHexTriangle((cb * u - sb * v) * cellsPerPeriod, (sb * u + cb * v) * cellsPerPeriod);
    const samples = triangle.vertices.map(([i, j], k) => {
        const transform = landscapeHexVertexTransform(i, j, salt, { rotationRangeRadians, offsetSpreadV });
        const [x, y] = landscapeHexVertexCenter(i, j), centerU = (cb * x + sb * y) / cellsPerPeriod, centerV = (-sb * x + cb * y) / cellsPerPeriod;
        const c = Math.cos(transform.angle), s = Math.sin(transform.angle), lu = u - centerU, lv = v - centerV;
        return { vertex: [i, j], center: [centerU, centerV], offset: transform.offset, angle: transform.angle, rotation: [c, s],
            uv: [c * lu - s * lv + frac(centerU + transform.offset[0]), s * lu + c * lv + frac(centerV + transform.offset[1])], barycentric: triangle.barycentric[k] };
    });
    const sharpened = triangle.barycentric.map(weight => Math.max(0, weight) ** exponent), total = sharpened.reduce((sum, weight) => sum + weight, 0);
    return { latticeAngle: angle, samples, weights: sharpened.map(weight => weight / total) };
}

/** Rotates a texture-coordinate gradient into a sample's rotated frame. @param {[number, number]} gradient @param {[number, number]} rotation cos, sin */
export function landscapeHexRotateGradient([x, y], [c, s]) { return [c * x - s * y, s * x + c * y]; }

/**
 * Tangent-space normal of a rotated sample as a slope (height derivative) in the unrotated texture frame: the slope is
 * limited like Mikkelsen's derivative conversion, less the page's mean slope in the texture frame (AI577 D5c de-leaning, zero
 * by default), then rotated by the inverse sample rotation.
 * @param {[number, number, number]} normal decoded OpenGL tangent normal @param {[number, number]} rotation cos, sin @param {number} [slopeLimit]
 * @param {[number, number]} [meanSlope] the page's mean slope (LandscapeMaterialCalibration)
 */
export function landscapeHexNormalSlope([x, y, z], [c, s], slopeLimit = LANDSCAPE_MATERIAL_SAMPLING.slopeLimit, [mx, my] = [0, 0]) {
    const depth = Math.max(Math.abs(z), Math.max(Math.abs(x), Math.abs(y)) / slopeLimit), sx = x / depth - mx, sy = y / depth - my;
    return [c * sx + s * sy, -s * sx + c * sy];
}

/**
 * Final sample weights of a mode: samples whose largest possible final weight stays below the cutoff are skipped (never
 * fetched) and fade in over one more cutoff so the blend stays continuous; hex-contrast scales the rest by mix(1, signal,
 * falloff) and the result is renormalized.
 * @param {{weights:number[],signals?:number[],mode:string,contrastFalloff?:number,cutoff?:number}} input weights are normalized pre-contrast weights
 */
export function landscapeHexWeights({ weights, signals = [1, 1, 1], mode, contrastFalloff = LANDSCAPE_MATERIAL_SAMPLING.contrastFalloff, cutoff = LANDSCAPE_MATERIAL_SAMPLING.weightCutoff }) {
    const value = landscapeMaterialSamplingMode(mode);
    if (value === 0 || !Array.isArray(weights) || weights.length !== 3 || !weights.every(weight => finite(weight) && weight >= 0) || !Array.isArray(signals) || signals.length !== 3 || !signals.every(finite)) {
        throw new Error('[LandscapeMaterialSampling] Hex weights need a hex mode, three nonnegative weights and three finite signals');
    }
    const keep = 1 - contrastFalloff;
    const bounds = weights.map((weight, k) => value === 2 ? weight / (weight + keep * (weights.reduce((sum, other) => sum + other, 0) - weight)) : weight);
    const fetched = bounds.map(bound => bound >= cutoff);
    const ramp = bound => { const t = Math.max(0, Math.min(1, (bound - cutoff) / cutoff)); return t * t * (3 - 2 * t); };
    const scaled = weights.map((weight, k) => !fetched[k] ? 0 : weight * ramp(bounds[k]) * (value === 2 ? keep + contrastFalloff * signals[k] : 1));
    const total = scaled.reduce((sum, weight) => sum + weight, 0);
    return { weights: scaled.map(weight => weight / total), fetched };
}

/** Contrast signal of a sample: relief when the material declares height, otherwise linear luminance. @param {number[]} albedo @param {number} height @param {boolean} heightEnabled */
export function landscapeHexContrastSignal(albedo, height, heightEnabled) {
    return heightEnabled ? height : albedo.reduce((sum, channel, index) => sum + channel * LUMINANCE[index], 0);
}

/**
 * Blends one channel of the three samples: weighted sum for hex-linear and hex-contrast; for hex-variance the deviations
 * from the material mean are rescaled by 1/sqrt(sum of squared weights), which keeps the variance of independent samples.
 * @param {{values:number[],weights:number[],mode:string,mean?:number,clamp?:boolean}} input
 */
export function landscapeHexBlend({ values, weights, mode, mean = 0, clamp = false }) {
    const value = landscapeMaterialSamplingMode(mode);
    if (!Array.isArray(values) || values.length !== 3 || !values.every(finite) || !finite(mean)) throw new Error('[LandscapeMaterialSampling] Hex blends need three finite values and a finite mean');
    let result;
    if (value === 3) {
        const gain = 1 / Math.sqrt(weights.reduce((sum, weight) => sum + weight * weight, 0));
        result = mean + weights.reduce((sum, weight, k) => sum + weight * (values[k] - mean), 0) * gain;
    } else result = weights.reduce((sum, weight, k) => sum + weight * values[k], 0);
    return clamp ? Math.max(0, Math.min(1, result)) : result;
}

/**
 * Terrain shader interface (chunks/landscape/stochastic_tiling.glsl): per soil slot uSoilStochastic vec4(cells per period,
 * rotation range in radians, V offset spread, contrast exponent), the top-projection salts in uSoilStochasticSalts (two ivec4,
 * soils 0-3 then 4-5) and uStochasticSettings vec4(contrast falloff, weight cutoff, variance exponent, samples per lattice).
 * The sample count is always three; it is a uniform so the shader compiler keeps one loop body. Disabled soils keep zero
 * rows, which selects one unrotated lattice sample at runtime. The slope limit is the shader constant LANDSCAPE_HEX_SLOPE_LIMIT.
 * @param {{seed:number,soils:ReadonlyArray<{soilId:string,enabled:boolean}>}} input
 */
export function landscapeMaterialSamplingUniforms({ seed, soils }) {
    if (!Array.isArray(soils) || soils.length < 1 || soils.length > 6 || !soils.every(soil => typeof soil?.enabled === 'boolean')) {
        throw new Error('[LandscapeMaterialSampling] Sampling uniforms need one to six soil slots with boolean enablement');
    }
    const model = LANDSCAPE_MATERIAL_SAMPLING, stochastic = new Float32Array(24), salts = new Int32Array(8);
    soils.forEach(({ soilId, enabled }, index) => {
        const definition = landscapeMaterialSamplingDefinition(soilId), salt = landscapeMaterialSamplingSalt(seed, soilId);
        if (!enabled) return;
        stochastic.set([definition.cellsPerPeriod, definition.rotationRangeDegrees * Math.PI / 180, definition.offsetSpreadV, definition.contrastExponent], index * 4);
        salts[index] = salt | 0;
    });
    return Object.freeze({ uSoilStochastic: stochastic, uSoilStochasticSalts: salts,
        uStochasticSettings: Float32Array.of(model.contrastFalloff, model.weightCutoff, model.varianceExponent, model.samplesPerLattice) });
}
