// Declares slope-adaptive material projection and normal mip filtering of landscape surfaces, mirroring chunks/landscape/surface_layers.glsl.
// @ts-check
// Steep ground: the top-down projection stretches a texture by 1/cos(slope) along the fall line. Projection weights are |n|^8 of the
// interpolated geometric normal, normalized; a side projection is used only above its 1/512 weight cutoff (about 24.7 degrees of slope)
// and fades in over the next cutoff, so gentle ground keeps exactly the top projection and its cost while the least-stretched
// projection dominates above about 40 degrees. Side projections map (U, V) to world (horizontal, up), choosing the horizontal sign
// that is not mirrored when the face is seen from outside; each has its own stochastic lattice salt. Base, micro and stochastic samples
// of every projection share its derivatives; tangent slopes become world gradients on the projection axes and are projected onto the
// surface (surface-gradient bump mapping), while the top projection keeps its established tangent frame so gentle ground is unchanged.
// Normal mip filtering: mip-averaged tangent normals shorten; their mean length implies a von Mises-Fisher spread 2/kappa that is added
// to the GGX alpha squared (Toksvig-style), so distant bumpy ground stays as rough as its resolved micro-facets. A small dead zone ignores
// 8-bit encoding error of unit normals.
import { LANDSCAPE_MATERIAL_SAMPLING } from './LandscapeMaterialSampling.js';
import { LANDSCAPE_MICRO_DETAIL } from './LandscapeMicroDetail.js';

export const LANDSCAPE_SURFACE_PROJECTION = Object.freeze({
    id: 'landscape-slope-projection-v1',
    projections: LANDSCAPE_MATERIAL_SAMPLING.projections,
    sharpness: 8,
    cutoff: LANDSCAPE_MATERIAL_SAMPLING.weightCutoff,
    saltMixes: LANDSCAPE_MATERIAL_SAMPLING.projectionSaltMixes,
    frames: Object.freeze({ top: 'U east, V north (established frame)', 'side-x': 'U = -sign(n.x) Z, V up', 'side-z': 'U = sign(n.z) X, V up' })
});

export const LANDSCAPE_NORMAL_FILTERING = Object.freeze({
    id: 'landscape-normal-mip-vmf-v1',
    strength: 1,
    lengthDeadZone: .01,
    model: 'alpha^2 += strength * normalStrength^2 * 2 (1 - l^2) / (3 l - l^3), l = min(1, mean mip normal length + dead zone)'
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const smoothstep = (edge0, edge1, value) => { const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

/** Slope in degrees above which a side projection first passes the weight cutoff. */
export function landscapeProjectionActivationDegrees({ sharpness = LANDSCAPE_SURFACE_PROJECTION.sharpness, cutoff = LANDSCAPE_SURFACE_PROJECTION.cutoff } = {}) {
    if (!(finite(sharpness) && sharpness > 0) || !(finite(cutoff) && cutoff > 0 && cutoff < .5)) throw new Error('[LandscapeSurfaceLayers] Activation needs a positive sharpness and a cutoff below 0.5');
    // a slope facing one horizontal axis has side/top weight ratio tan(slope)^k; the side weight equals the cutoff at ratio cutoff / (1 - cutoff)
    return Math.atan((cutoff / (1 - cutoff)) ** (1 / sharpness)) * 180 / Math.PI;
}

/**
 * Normalized projection weights [top, side X, side Z] of a unit geometric normal; zero sharpness keeps the top projection only.
 * @param {readonly number[]} normal @param {{sharpness?:number,cutoff?:number}} [options]
 */
export function landscapeProjectionWeights(normal, { sharpness = LANDSCAPE_SURFACE_PROJECTION.sharpness, cutoff = LANDSCAPE_SURFACE_PROJECTION.cutoff } = {}) {
    if (!Array.isArray(normal) || normal.length !== 3 || !normal.every(finite) || Math.abs(Math.hypot(...normal) - 1) > 1e-3 || !(finite(sharpness) && sharpness >= 0) || !(finite(cutoff) && cutoff > 0)) {
        throw new Error('[LandscapeSurfaceLayers] Projection weights need a unit normal, a nonnegative sharpness and a positive cutoff');
    }
    if (sharpness === 0) return [1, 0, 0];
    const raw = normal.map(value => Math.abs(value) ** sharpness), total = raw[0] + raw[1] + raw[2];
    const top = raw[1] / total, sideX = raw[0] / total * smoothstep(cutoff, 2 * cutoff, raw[0] / total), sideZ = raw[2] / total * smoothstep(cutoff, 2 * cutoff, raw[2] / total);
    const sum = top + sideX + sideZ;
    return [top / sum, sideX / sum, sideZ / sum];
}

/**
 * World unit vectors of increasing U and V for a projection; side projections pick the horizontal sign that is not mirrored from outside.
 * @param {'top'|'side-x'|'side-z'} projection @param {readonly number[]} normal
 */
export function landscapeProjectionFrame(projection, normal) {
    if (!LANDSCAPE_SURFACE_PROJECTION.projections.includes(projection) || !Array.isArray(normal) || normal.length !== 3 || !normal.every(finite)) throw new Error('[LandscapeSurfaceLayers] Unknown projection or invalid normal');
    if (projection === 'top') return { u: [1, 0, 0], v: [0, 0, 1] };
    if (projection === 'side-x') return { u: [0, 0, normal[0] >= 0 ? -1 : 1], v: [0, 1, 0] };
    return { u: [normal[2] >= 0 ? 1 : -1, 0, 0], v: [0, 1, 0] };
}

/**
 * Tangent-plane perturbation of a world gradient direction d = U slope.x + V slope.y: d - n (n . d). The shaded normal is
 * normalize(n + sum of weighted perturbations).
 * @param {readonly number[]} normal @param {readonly number[]} direction
 */
export function landscapeSurfaceGradient(normal, direction) {
    if (![normal, direction].every(vector => Array.isArray(vector) && vector.length === 3 && vector.every(finite))) throw new Error('[LandscapeSurfaceLayers] Surface gradients need two 3D vectors');
    const along = normal[0] * direction[0] + normal[1] * direction[1] + normal[2] * direction[2];
    return direction.map((value, index) => value - normal[index] * along);
}

/**
 * GGX roughness widened by the spread implied by a mean mip-filtered normal length (Toksvig-style vMF approximation).
 * @param {{roughness:number,meanLength:number,normalStrength:number,strength?:number}} input
 */
export function landscapeFilteredRoughness({ roughness, meanLength, normalStrength, strength = LANDSCAPE_NORMAL_FILTERING.strength }) {
    if (!(finite(roughness) && roughness >= 0 && roughness <= 1) || !(finite(meanLength) && meanLength >= 0) || !(finite(normalStrength) && normalStrength >= 0) || !(finite(strength) && strength >= 0)) {
        throw new Error('[LandscapeSurfaceLayers] Filtered roughness needs a roughness in 0..1, a mean length, a normal strength and a strength');
    }
    if (strength === 0) return roughness;
    const length = Math.min(1, meanLength + LANDSCAPE_NORMAL_FILTERING.lengthDeadZone);
    const spread = 2 * (1 - length * length) / Math.max(3 * length - length ** 3, 1e-4) * normalStrength ** 2 * strength;
    return Math.sqrt(Math.sqrt(roughness ** 4 + spread));
}

/**
 * Terrain shader interface (chunks/landscape/surface_layers.glsl): uSurfaceLayers vec4(projection sharpness or 0 for the top
 * projection only, normal filtering strength, micro fade start and end in micro periods per pixel) and uMicroSampling vec4(lattice
 * cells per micro period, rotation range in radians, V offset spread, contrast exponent).
 * @param {{projection?:boolean,normalFiltering?:boolean}} [options]
 */
export function landscapeSurfaceLayerUniforms({ projection = true, normalFiltering = true } = {}) {
    if (typeof projection !== 'boolean' || typeof normalFiltering !== 'boolean') throw new Error('[LandscapeSurfaceLayers] Layer enablement must be boolean');
    const micro = LANDSCAPE_MICRO_DETAIL, sampling = micro.sampling;
    return Object.freeze({
        uSurfaceLayers: Float32Array.of(projection ? LANDSCAPE_SURFACE_PROJECTION.sharpness : 0, normalFiltering ? LANDSCAPE_NORMAL_FILTERING.strength : 0, micro.fadeStartPeriods, micro.fadeEndPeriods),
        uMicroSampling: Float32Array.of(sampling.cellsPerPeriod, sampling.rotationRangeDegrees * Math.PI / 180, sampling.offsetSpreadV, sampling.contrastExponent)
    });
}
