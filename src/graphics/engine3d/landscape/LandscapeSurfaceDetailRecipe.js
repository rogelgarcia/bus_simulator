// Declares the versioned generated surface-detail recipe and its data-driven soil-pair transition profiles.
// @ts-check
// The recipe is renderer-independent data validated by the app-layer contract; its canonical hash and the default seed
// are part of every fine page identity. The seed derives from the recipe family, not its version, so tuning passes keep
// every boundary's procedural realization. Pair profiles resolve exact unordered pairs first, then wildcard partners in
// catalog order (rock before unknown), then the default profile. Transition widths are wide enough (0.8-2 m) for the
// material height competition to show physical interleaving instead of cut-out edges. The warp octaves are shared
// with the terrain shader through landscapeSurfaceWarpUniforms so native, coarse and generated coverage meander alike.
// v4 (AI577 D5) changes only the base labels: planning-only samples read the terrain-driven natural-soil labels of their native owners
// (natural-terrain-inference-v1, with the per-native overview-infill fallback) instead of the 15.625 m overview infill, and page identities
// add each owner's natural-soil policy and page hash, so v3 and v4 pages, and terrain and fallback pages, never share a cache entry.
import { validateLandscapeSurfaceDetailRecipe, landscapeSurfaceDetailRecipeHash, landscapeSurfaceDetailSeed, landscapeSurfaceDetailSearchRadius } from '../../../app/landscape/LandscapeSurfaceDetail.js';
import { LANDSCAPE_NATURAL_SOIL } from '../../../app/landscape/LandscapeNaturalSoil.js';
import { createLandscapeSurfaceWarp } from './LandscapeSurfaceNoise.js';

export { validateLandscapeSurfaceDetailRecipe, landscapeSurfaceDetailRecipeHash, landscapeSurfaceDetailSeed, landscapeSurfaceDetailSearchRadius };

export const LANDSCAPE_SURFACE_DETAIL_RECIPE = validateLandscapeSurfaceDetailRecipe({
    id: 'landscape-surface-detail-v4',
    family: 'landscape-surface-detail',
    levels: 3,
    units: 'world-xz-meters',
    generated: true,
    measuredDetail: false,
    base: { labels: LANDSCAPE_NATURAL_SOIL.terrain, boundary: 'smoothed-native-marching-squares-v1', encoding: 'landscape-contour-coverage-v1' },
    boundary: {
        saddle: 'minority-4x4-lower-index',
        smoothing: 'turning-limited-local-quadratic',
        kernel: 'triweight',
        sigmaCells: 3,
        windowSigmas: 3,
        turningCosine: -.17,
        maxDisplacementCells: 1,
        gapFraction: .45,
        gapSegments: 3,
        loops: { maxPerimeterCells: 8, subdivisions: 4, lambda: .5, mu: -.53, iterations: 16 }
    },
    transitionReferenceWidth: .75,
    maxTransitionWidth: 2.5,
    octaveMinimumSamples: 4,
    search: { minimumSamples: 4, guardSamples: 3 },
    labelTies: 'lower-soil-index',
    distance: 'warped-nearest-boundary',
    warp: { wavelengths: [48, 24, 12, 6], amplitudes: [1.8, .75, .35, .1], shaping: 'quintic-odd', noise: 'landscape-gradient-noise-v1' },
    breakup: { wavelengths: [8, 4, 2, 1], amplitudes: [.5, .35, .2, .1], shaping: 'ridged-mix', ridgedMix: .35, junctionFadeMeters: 1, noise: 'landscape-gradient-noise-v1' },
    pairProfiles: {
        default: { widthMeters: 1, breakup: 1 },
        pairs: [
            { soils: ['loam', 'sand'], widthMeters: 1.2, breakup: 1.6 },
            { soils: ['sand', 'seabed'], widthMeters: 2, breakup: .35 },
            { soils: ['forest', 'loam'], widthMeters: 2, breakup: 1.8 },
            { soils: ['forest', 'sand'], widthMeters: 1.4, breakup: 1.3 },
            { soils: ['loam', 'seabed'], widthMeters: 1.4, breakup: .8 },
            { soils: ['forest', 'seabed'], widthMeters: 1.4, breakup: .8 }
        ],
        partners: [
            { soil: 'rock', widthMeters: .8, breakup: 1.5 },
            { soil: 'unknown', widthMeters: 1.2, breakup: 1.2 }
        ]
    }
});

function resolveProfile(recipe, first, second) {
    const exact = recipe.pairProfiles.pairs.find(entry => entry.soils[0] === first && entry.soils[1] === second || entry.soils[0] === second && entry.soils[1] === first);
    if (exact) return Object.freeze({ widthMeters: exact.widthMeters, breakup: exact.breakup, source: `pair:${[...exact.soils].sort().join('|')}` });
    const partner = recipe.pairProfiles.partners.find(entry => entry.soil === first || entry.soil === second);
    if (partner) return Object.freeze({ widthMeters: partner.widthMeters, breakup: partner.breakup, source: `partner:${partner.soil}` });
    return Object.freeze({ widthMeters: recipe.pairProfiles.default.widthMeters, breakup: recipe.pairProfiles.default.breakup, source: 'default' });
}

/** Transition profile of an unordered soil pair. @param {any} recipe @param {string} soilIdA @param {string} soilIdB */
export function landscapeSurfacePairProfile(recipe, soilIdA, soilIdB) {
    if (typeof soilIdA !== 'string' || typeof soilIdB !== 'string' || !soilIdA || !soilIdB || soilIdA === soilIdB) throw new Error('[LandscapeSurfaceDetail] pair profiles need two different soil ids');
    return resolveProfile(validateLandscapeSurfaceDetailRecipe(recipe), soilIdA, soilIdB);
}

/** Profiles for the fifteen lexicographic pairs of a soil catalog. @param {any} recipe @param {string[]} soilIds */
export function landscapeSurfacePairProfiles(recipe, soilIds) {
    const validated = validateLandscapeSurfaceDetailRecipe(recipe);
    if (!Array.isArray(soilIds) || soilIds.length < 1 || soilIds.length > 6 || new Set(soilIds).size !== soilIds.length || !soilIds.every(id => typeof id === 'string' && id)) throw new Error('[LandscapeSurfaceDetail] pair profiles need one to six unique soil ids');
    const profiles = [];
    for (let first = 0; first < 6; first++) for (let second = first + 1; second < 6; second++) {
        profiles.push(second < soilIds.length ? resolveProfile(validated, soilIds[first], soilIds[second]) : null);
    }
    return Object.freeze(profiles);
}

/** Seed-independent compile-time defines of the recipe warp for chunks/landscape/surface_warp.glsl. @param {any} recipe */
export function landscapeSurfaceWarpDefines(recipe) {
    const validated = validateLandscapeSurfaceDetailRecipe(recipe);
    return Object.freeze({ LANDSCAPE_SURFACE_WARP_OCTAVES: String(validated.warp.wavelengths.length), ...(validated.warp.shaping === 'quintic-odd' ? { LANDSCAPE_SURFACE_WARP_QUINTIC: '' } : {}) });
}

/**
 * Shader interface of the recipe warp for chunks/landscape/surface_warp.glsl: compile-time defines and the flat uniform
 * arrays uLandscapeWarpWaves (vec4 per octave), uLandscapeWarpOffsets (vec4 per octave) and uLandscapeWarpSalts (ivec2).
 * @param {any} recipe @param {number} seed
 */
export function landscapeSurfaceWarpUniforms(recipe, seed) {
    const validated = validateLandscapeSurfaceDetailRecipe(recipe);
    const warp = createLandscapeSurfaceWarp({ seed, wavelengths: [...validated.warp.wavelengths], amplitudes: [...validated.warp.amplitudes], shaping: validated.warp.shaping });
    return Object.freeze({
        defines: landscapeSurfaceWarpDefines(validated),
        uniforms: Object.freeze({ uLandscapeWarpWaves: warp.uniforms.waves, uLandscapeWarpOffsets: warp.uniforms.offsets, uLandscapeWarpSalts: warp.uniforms.salts }),
        maxDisplacementMeters: warp.maxDisplacement
    });
}
