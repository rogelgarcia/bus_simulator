// Defines landscape-dressing-inputs v1: deterministic grass, shrub, tree, rock and beach-debris inputs from soil coverage and terrain fields.
// @ts-check
// Contract only: later vegetation and prop systems turn these unit inputs into placements; nothing here places objects. Every output is a
// product of soil-coverage terms and smooth terrain-field terms, so a soil that cannot host a dressing contributes exactly zero (no grass on
// sand, rock, seabed or unassigned planning substrate; no trees outside forest soil; debris only on sand near the waterline). Planning-only
// cover is reserved for later city content and suppresses every output. Missing fields use documented neutral values and are reported.
import { requireCondition, requireFinite } from './internal/LandscapeValidation.js';

const smooth = (edge0, edge1, value) => { const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };
const unit = value => Math.max(0, Math.min(1, value));

export const LANDSCAPE_DRESSING_INPUTS = Object.freeze({
    format: 'landscape-dressing-inputs', schemaVersion: 1, id: 'landscape-dressing-inputs-v1',
    outputs: Object.freeze(['grassDensity', 'shrubSuitability', 'treeSuitability', 'rockScatter', 'beachDebris']),
    soils: Object.freeze(['unknown', 'seabed', 'sand', 'loam', 'forest', 'rock']),
    neutralFields: Object.freeze({ wetness: .5, flow: 0, deposition: 0, rockExposure: 0, skyView: 1, shoreDistance: 256, convexity: 0, slopeDegrees: 0 }),
    parameters: Object.freeze({
        grass: Object.freeze({ loam: 1, forestUnderstory: .25, slopeDegrees: Object.freeze([25, 40]), rockSuppression: .85, moistureBase: .6, shoreMeters: Object.freeze([0, 4]) }),
        shrub: Object.freeze({ loam: .6, forest: .8, slopeDegrees: Object.freeze([30, 45]), rockSuppression: .6, moistureBase: .5, shoreMeters: Object.freeze([5, 20]) }),
        tree: Object.freeze({ forest: 1, slopeDegrees: Object.freeze([28, 36]), rockSuppression: .8, waterlogged: Object.freeze([.85, 1]), waterloggedSuppression: .6, shoreMeters: Object.freeze([15, 40]) }),
        rock: Object.freeze({ rockSoil: .6, rockSoilExposure: .4, vegetatedExposure: .7 }),
        debris: Object.freeze({ sand: 1, waterlineMeters: Object.freeze([0, 2]), reachMeters: Object.freeze([8, 25]), slopeDegrees: Object.freeze([10, 20]) })
    })
});

/**
 * @param {{soilWeights:Record<string,number>,planningShare?:number,fields?:{wetness:number,flow:number,deposition:number,rockExposure:number,skyView:number,shoreDistance:number,convexity:number,slopeDegrees:number}|null}} input
 *   soilWeights: display soil coverage weights by soil ID (normalized here; unknown IDs are rejected); planningShare: 0..1 share of planning-only cover
 * @returns {{grassDensity:number,shrubSuitability:number,treeSuitability:number,rockScatter:number,beachDebris:number,fieldsAvailable:boolean,recipe:string}}
 */
export function sampleLandscapeDressingInputs({ soilWeights, planningShare = 0, fields = null }) {
    requireCondition(!!soilWeights && typeof soilWeights === 'object', 'dressing inputs require soil coverage weights');
    let total = 0;
    for (const [soilId, weight] of Object.entries(soilWeights)) {
        requireCondition(LANDSCAPE_DRESSING_INPUTS.soils.includes(soilId), `dressing inputs do not know soil ${soilId}`);
        requireFinite(weight, `soil weight ${soilId}`); requireCondition(weight >= 0, `soil weight ${soilId} must be nonnegative`);
        total += weight;
    }
    requireCondition(total > 0, 'dressing inputs require positive total soil coverage');
    requireFinite(planningShare, 'planningShare'); requireCondition(planningShare >= 0 && planningShare <= 1, 'planningShare must be in [0, 1]');
    const w = soilId => (soilWeights[soilId] ?? 0) / total, f = fields ?? LANDSCAPE_DRESSING_INPUTS.neutralFields, p = LANDSCAPE_DRESSING_INPUTS.parameters;
    for (const key of Object.keys(LANDSCAPE_DRESSING_INPUTS.neutralFields)) requireFinite(f[key], `dressing field ${key}`);
    const natural = 1 - planningShare, land = f.shoreDistance > 0 ? 1 : 0;
    const grass = (w('loam') * p.grass.loam + w('forest') * p.grass.forestUnderstory * f.skyView) * (1 - smooth(p.grass.slopeDegrees[0], p.grass.slopeDegrees[1], f.slopeDegrees))
        * (1 - p.grass.rockSuppression * f.rockExposure) * (p.grass.moistureBase + (1 - p.grass.moistureBase) * f.wetness) * smooth(p.grass.shoreMeters[0], p.grass.shoreMeters[1], f.shoreDistance);
    const shrub = (w('loam') * p.shrub.loam + w('forest') * p.shrub.forest) * (1 - smooth(p.shrub.slopeDegrees[0], p.shrub.slopeDegrees[1], f.slopeDegrees))
        * (1 - p.shrub.rockSuppression * f.rockExposure) * (p.shrub.moistureBase + (1 - p.shrub.moistureBase) * f.wetness) * smooth(p.shrub.shoreMeters[0], p.shrub.shoreMeters[1], f.shoreDistance);
    const tree = w('forest') * p.tree.forest * (1 - smooth(p.tree.slopeDegrees[0], p.tree.slopeDegrees[1], f.slopeDegrees)) * (1 - p.tree.rockSuppression * f.rockExposure)
        * (1 - p.tree.waterloggedSuppression * smooth(p.tree.waterlogged[0], p.tree.waterlogged[1], f.wetness)) * smooth(p.tree.shoreMeters[0], p.tree.shoreMeters[1], f.shoreDistance);
    const rock = (w('rock') * (p.rock.rockSoil + p.rock.rockSoilExposure * f.rockExposure) + (w('loam') + w('forest')) * p.rock.vegetatedExposure * f.rockExposure) * land;
    const debris = w('sand') * p.debris.sand * smooth(p.debris.waterlineMeters[0], p.debris.waterlineMeters[1], f.shoreDistance)
        * (1 - smooth(p.debris.reachMeters[0], p.debris.reachMeters[1], f.shoreDistance)) * (1 - smooth(p.debris.slopeDegrees[0], p.debris.slopeDegrees[1], f.slopeDegrees));
    return { grassDensity: unit(grass * natural), shrubSuitability: unit(shrub * natural), treeSuitability: unit(tree * natural), rockScatter: unit(rock * natural),
        beachDebris: unit(debris * natural), fieldsAvailable: !!fields, recipe: LANDSCAPE_DRESSING_INPUTS.id };
}
