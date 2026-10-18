// Declares the per-material rendering data of every surface-model material, the six soil materials included, as one table for the layered compositor.
// @ts-check
// AI 598 D2 (consumed by D3; pure data, no behaviour). The AI 577 renderer keeps its per-soil tables (calibration, natural-ground response, macro
// variation, clump relief, stochastic sampling, terrain role) in six modules keyed by soil id. The layered model draws up to nineteen class
// materials, so D3 needs the same parameters per material id. The soil materials are referenced from their own tables (the frozen objects, so
// one source of truth stays), the class materials are authored here, each with the reason for its numbers:
// - response: the D5c natural-ground terms (EON diffuse roughness, Maignan specular shadowing weight, Hapke opposition amplitude); porous dry
//   mats and granular ground keep full shadowing and a hot spot, rock keeps part of its GGX sheen, the wet algae film keeps all of it;
// - macro: the landscape-scale responses per unit field deviation (log2 value, saturation, hue degrees, roughness); vegetation varies more
//   in hue than mineral ground, soils darken with moisture, sand and rock stay subtle;
// - clump: the first wavelength, weight, shaping and texture-relief gain of the clump relief that interleaves a material with its neighbours
//   (billow shaping folds the noise into clumps with creases, smooth shaping drapes); the wavelength is the real patch size of the material
//   (tussocks and litter drifts under a metre, bedding slabs and dune ripple sets over a metre), the gain lets stones poke through cover;
// - sampling: stochastic hex tiling cells per period, rotation range, V offset spread and contrast exponent; ripple materials keep their
//   orientation like the beach sand (no rotation, offsets along the crests), everything else rotates freely;
// - terrainRole: the AI 577 D5 development role (catena terms and rock exposure scale by it): developed soils and covers 1, mobile sand a half,
//   loose fragments a quarter, rock substrates and the covers that live on rock -1 or 0;
// - microPaired: the micro-detail material paired with the material's fine tiers (the beach sand's close-up grain), null otherwise.
// Calibration (albedo gain, mean normal slope, reference range) stays in LandscapeMaterialCalibration.js, the measured authority; this table
// references its rows and refuses to load without one.
import { LANDSCAPE_MATERIAL_CALIBRATION } from './LandscapeMaterialCalibration.js';
import { LANDSCAPE_MATERIAL_RESPONSE } from './LandscapeMaterialResponse.js';
import { LANDSCAPE_MACRO_VARIATION } from './LandscapeMacroVariation.js';
import { LANDSCAPE_MATERIAL_CLUMPS } from './LandscapeMaterialBlend.js';
import { LANDSCAPE_MATERIAL_SAMPLING } from './LandscapeMaterialSampling.js';
import { landscapeSoilTerrainRole } from './LandscapeTerrainAppearance.js';

const SAND_MICRO = 'pbr.landscape_sand_micro_v1';
const response = (diffuseRoughness, specularShadowing, opposition, basis) => Object.freeze({ diffuseRoughness, specularShadowing, opposition, basis });
const macro = (value, saturation, hueDegrees, roughness) => Object.freeze({ value, saturation, hueDegrees, roughness });
const clump = (wavelengthMeters, weight, shaping, textureReliefGain) => Object.freeze({ wavelengthMeters, weight, shaping, textureReliefGain });
const sampling = (cellsPerPeriod, rotationRangeDegrees, offsetSpreadV, contrastExponent) => Object.freeze({ cellsPerPeriod, rotationRangeDegrees, offsetSpreadV, contrastExponent });
const ROTATING = sampling(3, 180, 1, 7), RIPPLED = sampling(3, 0, 0, 7);

/** @param {string} soilId @param {string|null} microPaired @param {string} rationale */
function soilMaterial(soilId, microPaired, rationale) {
    return Object.freeze({ soilId, response: LANDSCAPE_MATERIAL_RESPONSE.materials[soilId], macro: LANDSCAPE_MACRO_VARIATION.materials[soilId], clump: LANDSCAPE_MATERIAL_CLUMPS.materials[soilId],
        sampling: LANDSCAPE_MATERIAL_SAMPLING.materials[soilId], terrainRole: landscapeSoilTerrainRole(soilId), microPaired, rationale });
}
/** @param {{response:any,macro:any,clump:any,sampling:any,terrainRole:number,microPaired?:string|null,rationale:string}} definition */
const classMaterial = definition => Object.freeze({ soilId: null, microPaired: null, ...definition });

const TABLE = Object.freeze({
    'pbr.landscape_soil_uniform_v1': soilMaterial('unknown', null, 'the unknown-substrate soil material (bare mineral soil): the per-soil tables of AI 577'),
    'pbr.aerial_beach_01': soilMaterial('sand', SAND_MICRO, 'the sand soil material, paired with the close-up sand micro layer; the seabed shares it and its submerged response (no shadowing, no opposition, the water film) is the wet state the recipe parameters express'),
    'pbr.landscape_grass_uniform_v1': soilMaterial('loam', null, 'the loam soil material (short lawn grass): the per-soil tables of AI 577'),
    'pbr.landscape_forest_soil_uniform_v1': soilMaterial('forest', null, 'the forest soil material, also the colluvial dirt substrate of every soil: the per-soil tables of AI 577'),
    'pbr.landscape_rock_uniform_v1': soilMaterial('rock', null, 'the exposed-rock soil material (weathered granite): the per-soil tables of AI 577'),
    'pbr.landscape_sandstone_v1': classMaterial({ response: response(.2, .6, .15, 'pale bedded sandstone: smoother than soil, partly smooth bedding faces keep some sheen'), macro: macro(.07, .05, 1, .03),
        clump: clump(1.3, .5, 'billow', 2.5), sampling: ROTATING, terrainRole: -1,
        rationale: 'bedding slabs weather out in 1-1.5 m plates, so clumps at 1.3 m with creases between slabs; a rock substrate takes no catena development (role -1 like the granite)' }),
    'pbr.landscape_caprock_v1': classMaterial({ response: response(.15, .5, .1, 'hard caprock beds: crystalline facets like the granite, half shadowing'), macro: macro(.06, .04, 1, .03),
        clump: clump(1.6, .6, 'billow', 2.5), sampling: ROTATING, terrainRole: -1,
        rationale: 'hard beds break into larger blocks than the soft strata (1.6 m), weighted a little more so the rim stays legible against the sandstone; rock substrate role -1' }),
    'pbr.landscape_scree_v1': classMaterial({ response: response(.3, 1, .3, 'angular talus: porous, rough, full shadowing, moderate hot spot'), macro: macro(.07, .05, 1, .03),
        clump: clump(.7, .55, 'billow', 2.5), sampling: ROTATING, terrainRole: .25,
        rationale: 'talus lobes and fragment heaps form 0.5-1 m piles that must poke through turf and litter, so billow clumps at 0.7 m; loose fragments develop little soil (role 0.25)' }),
    'pbr.landscape_mud_v1': classMaterial({ response: response(.3, .8, .3, 'fine silt: porous when dry; the wet state of the model removes the shadowing for the water film'), macro: macro(.1, .08, 1.5, .04),
        clump: clump(1.2, .4, 'smooth', 2.5), sampling: ROTATING, terrainRole: 1,
        rationale: 'silt drapes in smooth sheets without tufts (smooth shaping, 1.2 m), and darkens with moisture like the soils (macro value 0.1); a fully developed soil (role 1)' }),
    'pbr.landscape_dune_sand_v1': classMaterial({ response: response(.25, 1, .25, 'dry granular sand: weak broad backscatter like the beach sand'), macro: macro(.05, .05, 1, .03),
        clump: clump(1.8, .3, 'smooth', 2.5), sampling: RIPPLED, terrainRole: .5,
        rationale: 'wind-ripple sets run in 1.5-2 m trains, so smooth clumps at 1.8 m and ripples keep their orientation (no rotation) like the beach sand; mobile sand develops half (role 0.5)' }),
    'pbr.landscape_cobble_v1': classMaterial({ response: response(.2, .6, .2, 'water-worn stones: smoother than scree, more of the GGX sheen'), macro: macro(.06, .04, 1, .03),
        clump: clump(1, .45, 'smooth', 3), sampling: ROTATING, terrainRole: 0,
        rationale: 'cobble beds pile in smooth 1 m lobes, and the stones must win against sand by their own relief, so the texture relief gain is raised to 3; loose stones develop no soil (role 0)' }),
    'pbr.landscape_shell_grit_v1': classMaterial({ response: response(.25, .9, .25, 'shell grit: granular like sand with a little sheen from shell faces'), macro: macro(.05, .05, 1, .03),
        clump: clump(1.5, .35, 'smooth', 2.5), sampling: ROTATING, terrainRole: .3,
        rationale: 'storm berms drift shell grit in 1-2 m smooth bands over the sand (1.5 m, smooth); grit develops little (role 0.3)' }),
    'pbr.landscape_turf_v1': classMaterial({ response: response(.3, 1, .5, 'short grass canopy: shadowing canopy, pronounced hot spot (the loam grass response)'), macro: macro(.1, .1, 3, .03),
        clump: clump(.9, .65, 'billow', 2.5), sampling: ROTATING, terrainRole: 1,
        rationale: 'the sward keeps the loam grass numbers so the grass districts render as before: tussocks at 0.9 m, lush hollows darker and greener (hue 3 degrees); developed soil (role 1)' }),
    'pbr.landscape_dry_grass_v1': classMaterial({ response: response(.3, 1, .45, 'dry sward: shadowing canopy with a hot spot, slightly weaker than green turf'), macro: macro(.09, .08, 2, .03),
        clump: clump(.8, .6, 'billow', 2.5), sampling: ROTATING, terrainRole: 1,
        rationale: 'dead tufts stand in 0.6-1 m clumps with bare ground between (billow at 0.8 m); a dry sward varies less in hue than lush grass (2 degrees)' }),
    'pbr.landscape_moss_v1': classMaterial({ response: response(.35, 1, .5, 'moss mat: dense porous cushions, rough diffuse response, strong hot spot'), macro: macro(.08, .08, 2, .03),
        clump: clump(.5, .6, 'billow', 2.5), sampling: ROTATING, terrainRole: 1,
        rationale: 'moss colonizes in 0.3-0.6 m cushions on shaded rock and soil, so the smallest clumps of the table (0.5 m, billow); it darkens and greens in moist hollows (macro 0.08 / 2 degrees)' }),
    'pbr.landscape_broadleaf_litter_v1': classMaterial({ response: response(.35, 1, .35, 'dry leaf litter: rough and porous like the forest humus, moderate hot spot'), macro: macro(.09, .06, 1.5, .04),
        clump: clump(.6, .5, 'billow', 2.5), sampling: ROTATING, terrainRole: 1,
        rationale: 'litter drifts and the bare gaps between them are leaf-pile sized (0.6 m, billow), so the dirt shows through at that scale under the canopy; forest macro numbers' }),
    'pbr.landscape_needle_litter_v1': classMaterial({ response: response(.35, 1, .4, 'needle mat: rough, porous, a slightly stronger hot spot than leaves'), macro: macro(.08, .05, 1, .04),
        clump: clump(.7, .45, 'billow', 2.5), sampling: ROTATING, terrainRole: 1,
        rationale: 'needles mat into 0.5-1 m drifts under crowns (0.7 m, billow) and vary less in hue than leaf litter (1 degree)' }),
    'pbr.landscape_lichen_rock_v1': classMaterial({ response: response(.3, .9, .2, 'lichen crust: matte, rough diffuse response, strong shadowing'), macro: macro(.06, .04, 1, .03),
        clump: clump(1.1, .5, 'billow', 2.5), sampling: ROTATING, terrainRole: 0,
        rationale: 'lichen colonies cover stable faces in metre-sized patches (1.1 m, billow); a cover on rock takes no catena development (role 0)' }),
    'pbr.landscape_algae_rock_v1': classMaterial({ response: response(.15, 0, .05, 'wet algae film: keeps the GGX sheen like submerged sand, almost no shadow hiding'), macro: macro(.05, .04, 1, .02),
        clump: clump(1.2, .4, 'smooth', 2.5), sampling: ROTATING, terrainRole: 0,
        rationale: 'algal mats sheet the platform in smooth metre-scale patches (1.2 m, smooth); the film is specular, so it is the one class material without natural-surface shadowing; the green biofilm tint is the class parameter D3 applies' })
});

const finite = value => typeof value === 'number' && Number.isFinite(value);

/**
 * Validates a surface materials table: every entry has a calibration row, a response in the D5c ranges, bounded macro responses, a positive clump
 * wavelength with a known shaping, lattice parameters in the stochastic ranges, a terrain role in [-1, 1] and a null or pbr micro pairing.
 * @param {Record<string, any>} table @returns {Record<string, any>}
 */
export function validateLandscapeSurfaceMaterials(table) {
    if (!table || typeof table !== 'object') throw new Error('[LandscapeSurfaceMaterials] A materials table is required');
    for (const [materialId, definition] of Object.entries(table)) {
        const label = `[LandscapeSurfaceMaterials] Material ${materialId}`;
        if (!/^pbr\.[a-zA-Z0-9_-]+$/.test(materialId)) throw new Error(`${label} needs a pbr material id`);
        if (!Object.hasOwn(LANDSCAPE_MATERIAL_CALIBRATION.materials, materialId)) throw new Error(`${label} has no landscape calibration row`);
        const { response: r, macro: m, clump: c, sampling: s, terrainRole, microPaired, rationale } = definition ?? {};
        if (![r?.diffuseRoughness, r?.specularShadowing].every(value => finite(value) && value >= 0 && value <= 1) || !(finite(r?.opposition) && r.opposition >= 0 && r.opposition <= 2) || typeof r?.basis !== 'string') {
            throw new Error(`${label} needs a diffuse roughness and specular shadowing weight in 0..1, an opposition amplitude in 0..2 and a basis`);
        }
        if (!['value', 'saturation', 'hueDegrees', 'roughness'].every(key => finite(m?.[key]) && Math.abs(m[key]) <= (key === 'hueDegrees' ? 15 : .5))) throw new Error(`${label} needs bounded macro responses`);
        if (!(finite(c?.wavelengthMeters) && c.wavelengthMeters > 0 && c.wavelengthMeters <= 8) || !(finite(c?.weight) && c.weight >= 0 && c.weight <= 1) || !['smooth', 'billow'].includes(c?.shaping)
            || !(finite(c?.textureReliefGain) && c.textureReliefGain >= 0 && c.textureReliefGain <= 8)) throw new Error(`${label} needs a clump wavelength in (0, 8] m, a weight in 0..1, smooth or billow shaping and a texture relief gain in 0..8`);
        if (!(finite(s?.cellsPerPeriod) && s.cellsPerPeriod >= 1 && s.cellsPerPeriod <= 16) || !(finite(s?.rotationRangeDegrees) && s.rotationRangeDegrees >= 0 && s.rotationRangeDegrees <= 180)
            || !(finite(s?.offsetSpreadV) && s.offsetSpreadV >= 0 && s.offsetSpreadV <= 1) || !(finite(s?.contrastExponent) && s.contrastExponent >= 1 && s.contrastExponent <= 16)) {
            throw new Error(`${label} needs 1-16 cells per period, a 0-180 degree rotation range, an offset spread in 0..1 and a contrast exponent in 1..16`);
        }
        if (!(finite(terrainRole) && terrainRole >= -1 && terrainRole <= 1)) throw new Error(`${label} needs a terrain role in -1..1`);
        if (microPaired !== null && !(typeof microPaired === 'string' && /^pbr\.[a-zA-Z0-9_-]+$/.test(microPaired))) throw new Error(`${label} needs a null or pbr micro pairing`);
        if (typeof rationale !== 'string' || !rationale) throw new Error(`${label} needs a rationale`);
    }
    return table;
}

/** Every surface-model material by material id, soil materials first in catalog order, then the class materials in class order. */
export const LANDSCAPE_SURFACE_MATERIALS = Object.freeze(validateLandscapeSurfaceMaterials(TABLE));

/** Rendering data of one material; D3 must not draw a material this table does not know. @param {string} materialId */
export function landscapeSurfaceMaterialDefinition(materialId) {
    const definition = typeof materialId === 'string' && Object.hasOwn(LANDSCAPE_SURFACE_MATERIALS, materialId) ? LANDSCAPE_SURFACE_MATERIALS[materialId] : null;
    if (!definition) throw new Error(`[LandscapeSurfaceMaterials] No surface material data is defined for ${materialId}`);
    return definition;
}

/** Calibration row of a surface material (the measured authority), with its id. @param {string} materialId */
export function landscapeSurfaceMaterialCalibration(materialId) {
    landscapeSurfaceMaterialDefinition(materialId);
    return Object.freeze({ materialId, ...LANDSCAPE_MATERIAL_CALIBRATION.materials[materialId] });
}
