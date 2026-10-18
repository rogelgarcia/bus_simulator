// The default landscape-surface-recipe (coastal-surface-v1): the catena of the natural-world roadmap §7 as data rules per soil, and the material bindings.
// @ts-check
// Rule reading: `rule(class, base, ...terms)` adds base x product of term factors to a class; a term `t(input, edge0, edge1, weight)` is
// (1 - weight) + weight x smoothstep(edge0, edge1, input) with descending edges allowed ([40, 25] is 1 below 25 and 0 above 40). Thresholds were set
// on coastal terrain v3 (tests/artifacts/screens/landscape/ai598/d1, the D1 transects): the mantle is `bedrockOffset` (the published regolith
// channel is 0.02 m on average), the shore wetting is `reachFraction` (height / coastal reach: saturated core below 0.45, the firm foreshore to
// 0.95, the wrack line at the upper swash limit 0.95-1.3, dry sand above), the platform and the bluff toe are coastal zone labels, talus and
// colluvium are deposit labels weighted by thickness, the forest edge is the fragment's own forest weight. Planning cover keeps the natural
// inference of its display soil, so no rule reads planningShare.
import { LANDSCAPE_SURFACE_MODEL } from './SurfaceModel.js';

const t = (input, edge0, edge1, weight = 1) => Object.freeze({ input, smoothstep: Object.freeze([edge0, edge1]), weight });
const rule = (classId, base, ...terms) => Object.freeze({ class: classId, base, terms: Object.freeze(terms) });
const level = (base, ...terms) => Object.freeze({ base, terms: Object.freeze(terms) });
const soil = (defaults, substrates, covers, coverFraction, wetness) => Object.freeze({ defaults: Object.freeze(defaults), substrates: Object.freeze(substrates), covers: Object.freeze(covers), coverFraction: Object.freeze(coverFraction), wetness: Object.freeze(wetness) });
const material = (materialId, parameters = {}) => Object.freeze({ materialId, parameters: Object.freeze(parameters) });

// ledges catch soil and turf only above the shore reach; the wettest topographic index, flat-pond drainage and deposition count as wet only where the
// catena agrees (hollows): the appearance layer's planning exclusion zeroes the catena on graded pads and the high-city plateau, so their flat TWI stays dry
const DRY = t('reachFraction', .8, 1.2), HOLLOW = t('catenaMoisture', -.2, .3);
// wetness is the largest of: the saturated shore core (below 0.45 of the reach, like the appearance wetting), below sea level, and in hollows the wettest
// topographic index, flat-pond drainage where the index agrees, and depositional ground that is also wet
const WETNESS = Object.freeze([
    level(1, t('reachFraction', 1, .45)),
    level(1, t('heightAboveSea', .05, -.05)),
    level(1, t('wetness', .85, .97), HOLLOW),
    level(.85, t('drainage.flat-pond', .2, .8), t('wetness', .4, .7), HOLLOW),
    level(1, t('deposition', .3, .9), t('wetness', .5, .9), HOLLOW)
]);
// the wrack line is a few metres at the upper swash limit (reach fraction 0.96-1.1), never on the platform or the bluff toe; D3b's breakup makes it ragged
const WRACK_LINE = [t('reachFraction', .96, 1), t('reachFraction', 1.1, 1.04), t('zone.platform', .6, .2), t('zone.bluff-toe', .6, .2)];
const WET_PLATFORM = zone => [t(zone, 0, 1), t('reachFraction', 1.2, .8)];
const NO_FACE = t('faceMask', .5, .3);

export const LANDSCAPE_SURFACE_RECIPE = Object.freeze({
    format: LANDSCAPE_SURFACE_MODEL.recipe.format, schemaVersion: LANDSCAPE_SURFACE_MODEL.recipe.schemaVersion, id: 'coastal-surface-v1', model: LANDSCAPE_SURFACE_MODEL.id,
    strata: Object.freeze({ hardnessPattern: Object.freeze([.9, .3, .7, .2]) }),
    defaults: Object.freeze({ coverFraction: .5 }),
    soils: Object.freeze({
        unknown: soil({ substrate: 'dirt', cover: 'none', coverFraction: 0, wetness: 0 }, [rule('dirt', 1)], [rule('none', 1)], [], WETNESS),
        seabed: soil({ substrate: 'sand', cover: 'none', coverFraction: 0, wetness: 1 },
            [rule('sand', 1), rule('sandstone', 1, t('deposit.reef-rock', 0, 1))],
            [rule('none', .3), rule('algae', 1, t('deposit.reef-rock', 0, 1))],
            [level(.8, t('deposit.reef-rock', 0, 1))],
            [level(1)]),
        sand: soil({ substrate: 'sand', cover: 'none', coverFraction: 0, wetness: 0 },
            [rule('wet-sand', 1, t('reachFraction', .5, .2)), rule('wet-sand', 1, t('shoreDistance', 1.5, 0)), rule('wet-sand', 1, t('zone.surf', 0, 1)), rule('wet-sand', 1, t('zone.offshore', 0, 1)),
                rule('wet-sand', 1, t('zone.bar', 0, 1)), rule('wet-sand', 1, t('zone.reef', 0, 1)),
                rule('compacted-sand', 1, t('reachFraction', .2, .5), t('reachFraction', 1.15, .95)),
                rule('sand', 1, t('reachFraction', .9, 1.2), t('zone.foredune', .6, .2), t('deposit.dune-sand', .6, .2), t('zone.platform', .6, .2), t('zone.bluff-toe', .6, .2)), rule('sand', .05),
                rule('shell-grit', .7, t('zone.berm', 0, 1), t('waveExposure', .45, .85)), rule('shell-grit', .5, t('zone.backshore', 0, 1), t('waveExposure', .45, .85)),
                rule('dune-sand', 1, t('zone.foredune', 0, 1)), rule('dune-sand', 1, t('deposit.dune-sand', 0, 1)),
                rule('cobble', 1, t('zone.platform', 0, 1)), rule('cobble', 1, t('zone.bluff-toe', 0, 1)), rule('cobble', .8, t('deposit.talus', 0, 1), t('shoreDistance', 80, 30))],
            [rule('none', .15), rule('wrack', 1, ...WRACK_LINE), rule('dry-grass', 1, t('zone.foredune', 0, 1)), rule('dry-grass', 1, t('deposit.dune-sand', 0, 1)),
                rule('algae', 1, ...WET_PLATFORM('zone.platform')), rule('algae', 1, ...WET_PLATFORM('zone.bluff-toe'))],
            [level(.3, ...WRACK_LINE), level(.45, t('zone.foredune', 0, 1), t('depositThickness', .2, 1.5)), level(.15, t('deposit.dune-sand', 0, 1), t('depositThickness', .2, 1.5), t('zone.foredune', .6, .2)),
                level(.85, ...WET_PLATFORM('zone.platform')), level(.85, ...WET_PLATFORM('zone.bluff-toe'))],
            WETNESS),
        loam: soil({ substrate: 'dirt', cover: 'turf', coverFraction: .85, wetness: 0 },
            [rule('dirt', 1), rule('scree', .7, t('slopeDegrees', 18, 32)), rule('scree', .6, t('convexity', .2, .6), t('wetness', .5, .3)), rule('scree', .8, t('rockExposure', .15, .6)),
                rule('scree', 1, t('deposit.talus', 0, 1)), rule('scree', .6, t('deposit.colluvium', 0, 1), t('depositThickness', 0, .5)),
                rule('mud', 1, t('wetness', .75, .95), HOLLOW), rule('mud', .9, t('drainage.flat-pond', .2, .8), t('wetness', .45, .7), HOLLOW), rule('mud', .8, t('deposition', .5, .9), t('wetness', .4, .7), HOLLOW),
                rule('sand', 1, t('deposit.beach-sand', 0, 1)), rule('sand', 1, t('deposit.dune-sand', 0, 1))],
            [rule('none', .08), rule('turf', 1, t('rockExposure', .7, .3)), rule('dry-grass', 1, t('convexity', .1, .5), t('wetness', .5, .3)), rule('dry-grass', .8, t('slopeDegrees', 20, 35)),
                rule('dry-grass', .6, t('catenaMoisture', 0, -.5)), rule('moss', 1, t('wetness', .7, .9), t('skyView', .8, .5)), rule('moss', .8, t('drainage.flat-pond', .2, .8), t('wetness', .6, .8), HOLLOW),
                rule('moss', .7, t('skyView', .6, .35), t('wetness', .55, .75)), rule('moss', .6, t('catenaMoisture', .3, .8), t('skyView', .9, .6))],
            [level(.95, t('wetness', .2, .55, .3), t('slopeDegrees', 45, 25, .35), t('rockExposure', .8, .2, .8), t('convexity', .7, .2, .3), t('disturbance', 1, .3, .8))],
            WETNESS),
        forest: soil({ substrate: 'dirt', cover: 'broadleaf-litter', coverFraction: .9, wetness: 0 },
            [rule('dirt', 1), rule('scree', .9, t('slopeDegrees', 22, 34)), rule('scree', .8, t('bedrockOffset', .8, .2), t('slopeDegrees', 12, 25)), rule('scree', 1, t('deposit.talus', 0, 1)),
                rule('scree', .6, t('deposit.colluvium', 0, 1), t('depositThickness', 0, .5)), rule('scree', .8, t('rockExposure', .2, .6)),
                rule('mud', 1, t('wetness', .78, .95), HOLLOW), rule('mud', .9, t('drainage.flat-pond', .2, .8), t('wetness', .55, .8), HOLLOW)],
            [rule('none', .08), rule('broadleaf-litter', 1), rule('needle-litter', .9, t('convexity', .1, .45), t('wetness', .45, .25)), rule('needle-litter', .8, t('waveExposure', .2, .6)),
                rule('moss', 1, t('wetness', .65, .9), t('skyView', .75, .45)), rule('moss', .7, t('catenaMoisture', .3, .8), t('skyView', .95, .75)),
                rule('turf', 1, t('soil.forest', .9, .5), t('skyView', .7, .9))],
            [level(.92, t('soil.forest', .3, 1, .6), t('rockExposure', .8, .2, .8), t('slopeDegrees', 50, 30, .4), t('disturbance', 1, .3, .8))],
            WETNESS),
        rock: soil({ substrate: 'sandstone', cover: 'none', coverFraction: 0, wetness: 0 },
            [rule('sandstone', 1, t('hardness', .65, .5)), rule('sandstone', .05), rule('caprock', 1, t('hardness', .5, .65)),
                rule('scree', 1, t('deposit.talus', 0, 1), t('depositThickness', 0, .8)), rule('scree', .8, t('deposit.colluvium', 0, 1), t('depositThickness', 0, .8)),
                rule('cobble', .8, t('zone.platform', 0, 1)), rule('cobble', .6, t('zone.bluff-toe', 0, 1)),
                rule('dirt', .5, t('slopeDegrees', 30, 15), t('convexity', .3, -.2), t('bedrockOffset', .1, .5), DRY)],
            [rule('none', .25), rule('algae', 1, ...WET_PLATFORM('zone.platform')), rule('algae', 1, ...WET_PLATFORM('zone.bluff-toe')),
                rule('lichen', .8, t('faceMask', .5, .2), t('slopeDegrees', 15, 30), t('slopeDegrees', 70, 55), t('skyView', .7, .9)),
                rule('moss', 1, t('skyView', .7, .45), t('wetness', .55, .8), NO_FACE), rule('moss', .6, t('catenaMoisture', .3, .8), NO_FACE),
                rule('turf', 1, t('slopeDegrees', 25, 12), t('convexity', .1, -.2), NO_FACE, DRY)],
            [level(.85, ...WET_PLATFORM('zone.platform'), NO_FACE), level(.85, ...WET_PLATFORM('zone.bluff-toe'), NO_FACE),
                level(.3, t('faceMask', .5, .2), t('slopeDegrees', 15, 30), t('slopeDegrees', 70, 55), t('skyView', .7, .9)),
                level(.55, t('skyView', .7, .45), t('wetness', .55, .8), NO_FACE), level(.25, t('slopeDegrees', 25, 12), t('convexity', .1, -.2), NO_FACE, DRY)],
            WETNESS)
    }),
    // the material of every class (consumed by D2, which publishes the new CC0 materials, and D3, which composites them); `none` binds nothing.
    // sand, wet-sand and compacted-sand are one material in three states; dirt is the existing plain forest soil
    materials: Object.freeze({
        sandstone: material('pbr.landscape_sandstone_v1'), caprock: material('pbr.landscape_caprock_v1'), scree: material('pbr.landscape_scree_v1'),
        dirt: material('pbr.landscape_forest_soil_uniform_v1'), mud: material('pbr.landscape_mud_v1'),
        sand: material('pbr.aerial_beach_01', { wetness: 0, reliefScale: 1 }), 'wet-sand': material('pbr.aerial_beach_01', { wetness: 1, reliefScale: 1, specularFilm: 1 }),
        'compacted-sand': material('pbr.aerial_beach_01', { wetness: .6, reliefScale: .5 }), 'dune-sand': material('pbr.landscape_dune_sand_v1'),
        cobble: material('pbr.landscape_cobble_v1'), 'shell-grit': material('pbr.landscape_shell_grit_v1'),
        turf: material('pbr.landscape_turf_v1'), 'dry-grass': material('pbr.landscape_dry_grass_v1'), moss: material('pbr.landscape_moss_v1'),
        'broadleaf-litter': material('pbr.landscape_broadleaf_litter_v1'), 'needle-litter': material('pbr.landscape_needle_litter_v1'), lichen: material('pbr.landscape_lichen_rock_v1'),
        algae: material('pbr.landscape_algae_rock_v1'), wrack: material('pbr.landscape_wrack_v1')
    })
});
