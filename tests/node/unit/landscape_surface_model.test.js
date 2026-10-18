// Verifies landscape-surface-model v1: catalogs and inputs, strict recipe validation and identity, the catena of the default recipe, the one-hot and hardness helpers,
// the neutral output, data-only overrides with their root-grid layer round trip, and the GLSL mirror's constants and tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_GEOLOGY_CATEGORIES, LANDSCAPE_SURFACE_CATEGORIES, LANDSCAPE_SURFACE_COVERS, LANDSCAPE_SURFACE_INPUTS, LANDSCAPE_SURFACE_INPUT_INDEX, LANDSCAPE_SURFACE_MODEL, LANDSCAPE_SURFACE_OVERRIDE_LAYER,
    LANDSCAPE_SURFACE_RECIPE, LANDSCAPE_SURFACE_SUBSTRATES, LANDSCAPE_SURFACE_TARGETS, applyLandscapeSurfaceOverrides, canonicalLandscapeSurfaceJson, compileLandscapeSurfaceRecipe, createLandscapeSurfaceInputVector,
    createLandscapeSurfaceOneHot, createLandscapeSurfaceResult, describeLandscapeSurface, landscapeStratumHardness, landscapeSurfaceInputsFrom, landscapeSurfaceOneHot, landscapeSurfaceOverrideAt,
    landscapeSurfaceOverridesIdentity, landscapeSurfaceRamp, landscapeSurfaceRecipeIdentity, rasterizeLandscapeSurfaceOverrideLayer, sampleLandscapeSurface, sampleLandscapeSurfaceOverrideLayer,
    validateLandscapeSurfaceOverrides, validateLandscapeSurfaceRecipe } from '../../../src/app/landscape/index.js';
import { LANDSCAPE_SURFACE_MODEL_RUNTIME, landscapeSurfaceModelDefines, landscapeSurfaceNeutralGeologyPage, packLandscapeSurfaceGeologyPage } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceModel.js';
import { LANDSCAPE_DIAGNOSTICS, LANDSCAPE_SURFACE_COVER_COLORS, LANDSCAPE_SURFACE_SUBSTRATE_COLORS, landscapeSurfaceClassColorDefines } from '../../../src/graphics/engine3d/landscape/LandscapeTerrainDiagnostics.js';

const root = path.resolve('.');
const landscapeError = error => /^\[Landscape\]/.test(error.message);
const INDEX = LANDSCAPE_SURFACE_INPUT_INDEX;
const recipe = validateLandscapeSurfaceRecipe(LANDSCAPE_SURFACE_RECIPE);
const neutralFields = { wetness: .5, flow: 0, deposition: 0, rockExposure: 0, skyView: 1, shoreDistance: 256, convexity: 0, slopeDegrees: 0 };
const neutralGeology = { bedrockOffset: 2, regolith: .5, depositThickness: 0, wear: 0, deposition: 0, flow: 0, waveExposure: 0, faceMask: 0 };
const labelIndex = (name, label) => /** @type {readonly string[]} */ (LANDSCAPE_GEOLOGY_CATEGORIES.find(category => category.name === name).labels).indexOf(label);
// a pure categorical context: one deposit, drainage and zone label with a lithology label (through the one-hot of four equal samples)
function categories({ deposit = 'none', drainage = 'hillslope', zone = 'inland', lithology = 0 } = {}) {
    const quad = [labelIndex('depositType', deposit), lithology, labelIndex('drainage', drainage), labelIndex('coastalZone', zone)];
    return landscapeSurfaceOneHot([quad, quad, quad, quad], [.25, .25, .25, .25], recipe.strata.hardnessPattern);
}
function evaluate({ soil, fields = {}, geology = {}, category = {}, slopeDegrees = 0, height = 10, reach = 0, moisture = 0, disturbance = 0, soilWeights = null }) {
    const vector = landscapeSurfaceInputsFrom({ soilWeights: soilWeights ?? { [soil]: 1 }, fields: { ...neutralFields, ...fields }, geology: { ...neutralGeology, ...geology }, categories: categories(category),
        slopeDegrees, heightAboveSea: height, appearanceLayer: { moisture, reach }, disturbance });
    return describeLandscapeSurface(sampleLandscapeSurface(vector, recipe));
}
const sums = result => ({ substrate: result.substrate.reduce((sum, value) => sum + value, 0), cover: result.cover.reduce((sum, value) => sum + value, 0) });

test('Surface: the catalogs, the input vector and the targets are the fixed v1 contract', () => {
    assert.equal(LANDSCAPE_SURFACE_MODEL.id, 'landscape-surface-model-v1');
    assert.deepEqual(LANDSCAPE_SURFACE_SUBSTRATES.map(entry => entry.id), ['sandstone', 'caprock', 'scree', 'dirt', 'mud', 'sand', 'wet-sand', 'compacted-sand', 'dune-sand', 'cobble', 'shell-grit']);
    assert.deepEqual(LANDSCAPE_SURFACE_COVERS.map(entry => entry.id), ['none', 'turf', 'dry-grass', 'moss', 'broadleaf-litter', 'needle-litter', 'lichen', 'algae', 'wrack']);
    assert.deepEqual(LANDSCAPE_SURFACE_MODEL.soils, ['unknown', 'seabed', 'sand', 'loam', 'forest', 'rock']);
    assert.deepEqual(LANDSCAPE_SURFACE_TARGETS, { substrate: 0, cover: 11, fraction: 20, wetness: 21 });
    for (const [index, definition] of LANDSCAPE_SURFACE_INPUTS.entries()) {
        assert.equal(INDEX[definition.id], index);
        assert.ok(definition.neutral >= definition.range[0] && definition.neutral <= definition.range[1], `${definition.id} neutral inside its range`);
        assert.ok(['soil', 'planning', 'fields', 'geology', 'category', 'fragment', 'appearance', 'derived', 'disturbance', 'availability'].includes(definition.source), definition.id);
    }
    for (const category of LANDSCAPE_SURFACE_CATEGORIES) {
        const labels = /** @type {readonly string[]} */ (LANDSCAPE_GEOLOGY_CATEGORIES.find(entry => entry.name === category.name).labels);
        assert.equal(category.count, labels.length);
        assert.equal(LANDSCAPE_SURFACE_INPUTS[category.inputStart].neutral, 1, `${category.name}: the first label is the neutral one-hot`);
    }
    const vector = createLandscapeSurfaceInputVector();
    assert.equal(vector.length, LANDSCAPE_SURFACE_INPUTS.length);
    assert.equal(vector[INDEX['zone.inland']], 1); assert.equal(vector[INDEX.hardness], .5); assert.equal(vector[INDEX.reachFraction], 10);
    assert.ok(Object.isFrozen(LANDSCAPE_SURFACE_INPUTS) && Object.isFrozen(LANDSCAPE_SURFACE_SUBSTRATES) && Object.isFrozen(recipe) && Object.isFrozen(recipe.soils.sand.substrates));
});

test('Surface: the recipe validator fills weights, rejects unknown inputs, foreign classes, non-finite numbers and incomplete material tables', () => {
    assert.equal(recipe.id, 'coastal-surface-v1');
    assert.equal(recipe.soils.loam.coverFraction[0].terms[0].weight, .3);
    assert.equal(recipe.soils.sand.substrates[0].terms[0].weight, 1, 'an omitted term weight is 1');
    assert.deepEqual(Object.keys(recipe.materials).sort(), [...LANDSCAPE_SURFACE_SUBSTRATES.map(entry => entry.id), ...LANDSCAPE_SURFACE_COVERS.filter(entry => entry.id !== 'none').map(entry => entry.id)].sort());
    assert.equal(recipe.materials.dirt.materialId, 'pbr.landscape_forest_soil_uniform_v1');
    assert.equal(recipe.materials['wet-sand'].materialId, 'pbr.aerial_beach_01');
    const plain = JSON.parse(JSON.stringify(LANDSCAPE_SURFACE_RECIPE)), mutate = change => { const copy = structuredClone(plain); change(copy); return copy; };
    const rejections = {
        'unknown input': copy => { copy.soils.sand.substrates[0].terms[0].input = 'temperature'; },
        'foreign class': copy => { copy.soils.sand.substrates[0].class = 'turf'; },
        'unknown class': copy => { copy.soils.rock.covers[0].class = 'ivy'; },
        'non-finite base': copy => { copy.soils.loam.covers[0].base = Number.NaN; },
        'equal edges': copy => { copy.soils.loam.covers[1].terms[0].smoothstep = [.5, .5]; },
        'weight out of range': copy => { copy.soils.loam.coverFraction[0].terms[0].weight = 1.5; },
        'missing soil': copy => { delete copy.soils.seabed; },
        'extra field': copy => { copy.extra = 1; },
        'missing material': copy => { delete copy.materials.moss; },
        'none bound': copy => { copy.materials.none = { materialId: 'pbr.nothing', parameters: {} }; },
        'default class': copy => { copy.soils.forest.defaults.cover = 'cobble'; },
        'hardness pattern': copy => { copy.strata.hardnessPattern = [.9, .3, .7]; },
        'other model': copy => { copy.model = 'landscape-surface-model-v2'; }
    };
    for (const [label, change] of Object.entries(rejections)) assert.throws(() => validateLandscapeSurfaceRecipe(mutate(change)), landscapeError, label);
    assert.throws(() => landscapeSurfaceInputsFrom({ soilWeights: { lava: 1 }, slopeDegrees: 0, heightAboveSea: 0 }), /does not know soil lava/);
    assert.throws(() => landscapeSurfaceInputsFrom({ soilWeights: { loam: 0 }, slopeDegrees: 0, heightAboveSea: 0 }), /positive total/);
    assert.throws(() => landscapeSurfaceInputsFrom({ soilWeights: { loam: 1 }, slopeDegrees: Number.NaN, heightAboveSea: 0 }), /slopeDegrees/);
    assert.throws(() => landscapeSurfaceInputsFrom({ soilWeights: { loam: 1 }, slopeDegrees: 0, heightAboveSea: 0, disturbance: 2 }), /0\.\.1/);
});

test('Surface: the recipe identity is a canonical SHA-256 independent of key order and the compiled tables are stable', async () => {
    const identity = await landscapeSurfaceRecipeIdentity(LANDSCAPE_SURFACE_RECIPE), reordered = JSON.parse(JSON.stringify(LANDSCAPE_SURFACE_RECIPE, (key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value));
    assert.match(identity, /^surface-recipe-[a-f0-9]{24}$/);
    assert.equal(await landscapeSurfaceRecipeIdentity(reordered), identity);
    assert.equal(canonicalLandscapeSurfaceJson(validateLandscapeSurfaceRecipe(reordered)), canonicalLandscapeSurfaceJson(recipe));
    const changed = structuredClone(JSON.parse(JSON.stringify(LANDSCAPE_SURFACE_RECIPE))); changed.soils.sand.covers[0].base += .01;
    assert.notEqual(await landscapeSurfaceRecipeIdentity(changed), identity);
    const program = compileLandscapeSurfaceRecipe(LANDSCAPE_SURFACE_RECIPE);
    assert.equal(program, compileLandscapeSurfaceRecipe(LANDSCAPE_SURFACE_RECIPE), 'compiled once per recipe object');
    assert.equal(program, compileLandscapeSurfaceRecipe(program.recipe), 'the validated clone keys the same program');
    assert.ok(program.ruleCount > 60 && program.ruleCount <= LANDSCAPE_SURFACE_MODEL.limits.rules && program.termCount > program.ruleCount);
    let rule = 0;
    for (let soil = 0; soil < 6; soil++) { assert.equal(program.soils[soil * 2], rule, 'soil rule ranges are contiguous in model soil order'); rule += program.soils[soil * 2 + 1]; }
    assert.equal(rule, program.ruleCount);
    for (let i = 0; i < program.ruleCount; i++) assert.ok(program.rules[i * 4 + 1] >= 0 && program.rules[i * 4 + 1] <= LANDSCAPE_SURFACE_TARGETS.wetness);
});

test('Surface: the ramp, the stratum hardness unwrap and the one-hot of four aligned samples are exact', () => {
    assert.equal(landscapeSurfaceRamp(0, 1, .5), .5); assert.equal(landscapeSurfaceRamp(0, 1, -1), 0); assert.equal(landscapeSurfaceRamp(0, 1, 2), 1);
    assert.equal(landscapeSurfaceRamp(40, 25, 20), 1, 'descending edges: 1 below edge1'); assert.equal(landscapeSurfaceRamp(40, 25, 45), 0); assert.ok(Math.abs(landscapeSurfaceRamp(40, 25, 32.5) - .5) < 1e-12);
    const pattern = recipe.strata.hardnessPattern;
    assert.equal(landscapeStratumHardness(0, pattern), .5, 'unstratified');
    // v3 labels: 1..17 are strata 0..16, 244..255 are strata -12..-1; the slot is ((index mod 4) + 4) mod 4
    assert.equal(landscapeStratumHardness(1, pattern), .9); assert.equal(landscapeStratumHardness(2, pattern), .3); assert.equal(landscapeStratumHardness(3, pattern), .7); assert.equal(landscapeStratumHardness(4, pattern), .2);
    assert.equal(landscapeStratumHardness(5, pattern), .9); assert.equal(landscapeStratumHardness(128, pattern), pattern[127 % 4]);
    assert.equal(landscapeStratumHardness(255, pattern), .2, 'L 255 is stratum -1, slot 3'); assert.equal(landscapeStratumHardness(254, pattern), .7, 'stratum -2, slot 2');
    assert.equal(landscapeStratumHardness(253, pattern), .3); assert.equal(landscapeStratumHardness(252, pattern), .9); assert.equal(landscapeStratumHardness(129, pattern), pattern[((-127 % 4) + 4) % 4]);
    assert.throws(() => landscapeStratumHardness(256, pattern), /lithology label/);
    const quads = [[1, 254, 0, 6], [1, 254, 0, 6], [5, 255, 4, 8], [5, 255, 4, 8]], onehot = landscapeSurfaceOneHot(quads, [.25, .25, .25, .25], pattern);
    assert.equal(onehot.depositType.length, 7); assert.equal(onehot.drainage.length, 6); assert.equal(onehot.coastalZone.length, 13);
    assert.deepEqual([...onehot.depositType], [0, .5, 0, 0, 0, .5, 0]); assert.deepEqual([...onehot.drainage], [.5, 0, 0, 0, .5, 0]);
    assert.equal(onehot.coastalZone[6], .5); assert.equal(onehot.coastalZone[8], .5);
    assert.ok(Math.abs(onehot.hardness - (.7 + .2) / 2) < 1e-12, 'hardness is bilinear over the samples');
    const weighted = landscapeSurfaceOneHot(quads, [1, 0, 0, 0], pattern);
    assert.deepEqual([...weighted.coastalZone], [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    const clamped = landscapeSurfaceOneHot([[9, 0, 9, 99], [9, 0, 9, 99], [9, 0, 9, 99], [9, 0, 9, 99]], [.25, .25, .25, .25], pattern);
    assert.equal(clamped.depositType[6], 1, 'labels beyond the catalog clamp to its maximum');
    assert.throws(() => landscapeSurfaceOneHot(quads.slice(1), [1, 0, 0], pattern), /four aligned samples/);
    assert.deepEqual([...createLandscapeSurfaceOneHot().depositType], [1, 0, 0, 0, 0, 0, 0]);
});

test('Surface: the catena of the default recipe (sand soil) follows the shore from the swash to the dune, the platform and the toe', () => {
    const reach = 1.2;
    const swash = evaluate({ soil: 'sand', category: { deposit: 'beach-sand', zone: 'swash' }, fields: { shoreDistance: 5, slopeDegrees: 3 }, height: .2, reach });
    assert.equal(swash.substrate.id, 'wet-sand'); assert.ok(swash.wetness > .95, 'the saturated core is wet'); assert.equal(swash.cover.id, 'none');
    const foreshore = evaluate({ soil: 'sand', category: { deposit: 'beach-sand', zone: 'swash' }, fields: { shoreDistance: 20, slopeDegrees: 3 }, height: .85, reach });
    assert.equal(foreshore.substrate.id, 'compacted-sand'); assert.ok(foreshore.substrates['compacted-sand'] > .8);
    const line = evaluate({ soil: 'sand', category: { deposit: 'beach-sand', zone: 'berm' }, fields: { shoreDistance: 35, slopeDegrees: 4, waveExposure: .2 }, height: 1.236, reach });
    assert.equal(line.cover.id, 'wrack', 'the wrack line at the upper swash limit (reach fraction 1.03)'); assert.ok(line.coverFraction > .2 && line.coverFraction < .4, `thin: ${line.coverFraction}`);
    const above = evaluate({ soil: 'sand', category: { deposit: 'beach-sand', zone: 'berm' }, fields: { shoreDistance: 35, slopeDegrees: 4, waveExposure: .2 }, height: 1.5, reach });
    assert.equal(above.cover.id, 'none', 'a few metres above the limit (reach fraction 1.25) the berm is bare'); assert.equal(above.coverFraction, 0);
    const berm = evaluate({ soil: 'sand', category: { deposit: 'beach-sand', zone: 'berm' }, fields: { shoreDistance: 40, slopeDegrees: 4 }, geology: { waveExposure: .9 }, height: 2.2, reach });
    assert.equal(berm.substrate.id, 'sand'); assert.ok(berm.substrates['shell-grit'] > .3, `shell grit where the exposure is high: ${berm.substrates['shell-grit']}`); assert.equal(berm.wetness, 0);
    const backshore = evaluate({ soil: 'sand', category: { deposit: 'beach-sand', zone: 'backshore' }, fields: { shoreDistance: 60, slopeDegrees: 2 }, height: 2.4, reach });
    assert.equal(backshore.substrate.id, 'sand'); assert.equal(backshore.cover.id, 'none'); assert.equal(backshore.coverFraction, 0);
    const dune = evaluate({ soil: 'sand', category: { deposit: 'dune-sand', zone: 'foredune' }, fields: { shoreDistance: 55, slopeDegrees: 9 }, geology: { depositThickness: 3 }, height: 4, reach });
    assert.equal(dune.substrate.id, 'dune-sand'); assert.ok(dune.substrates['dune-sand'] > .9); assert.equal(dune.cover.id, 'dry-grass'); assert.ok(Math.abs(dune.coverFraction - .45) < 1e-9, `dune grass rises with the deposit to the foredune level alone: ${dune.coverFraction}`);
    const thin = evaluate({ soil: 'sand', category: { deposit: 'dune-sand', zone: 'foredune' }, fields: { shoreDistance: 55, slopeDegrees: 9 }, geology: { depositThickness: .3 }, height: 4, reach });
    assert.ok(thin.coverFraction < dune.coverFraction, 'a thin dune carries less grass');
    const platform = evaluate({ soil: 'sand', category: { deposit: 'none', drainage: 'flat-pond', zone: 'platform' }, fields: { shoreDistance: 90, slopeDegrees: 1, wetness: .95, deposition: .45 }, height: .4, reach: 1.1 });
    assert.equal(platform.substrate.id, 'cobble'); assert.equal(platform.cover.id, 'algae'); assert.ok(platform.coverFraction > .8); assert.ok(platform.wetness > .95);
    const toe = evaluate({ soil: 'sand', category: { deposit: 'talus', zone: 'bluff-toe' }, fields: { shoreDistance: 110, slopeDegrees: 20 }, geology: { depositThickness: 1 }, height: 3, reach: .9 });
    assert.equal(toe.substrate.id, 'cobble'); assert.equal(toe.cover.id, 'none', 'above the reach the toe carries no algae');
    const inland = evaluate({ soil: 'sand', category: { deposit: 'alluvium', zone: 'inland' }, fields: { shoreDistance: 256 }, height: 12 });
    assert.equal(inland.substrate.id, 'sand'); assert.ok(inland.substrates.sand > .99); assert.equal(inland.cover.id, 'none');
    const seabed = evaluate({ soil: 'seabed', category: { deposit: 'beach-sand', drainage: 'sea', zone: 'surf' }, fields: { shoreDistance: -20, wetness: 1 }, height: -3 });
    assert.equal(seabed.substrate.id, 'sand'); assert.equal(seabed.wetness, 1);
    const reef = evaluate({ soil: 'seabed', category: { deposit: 'reef-rock', drainage: 'sea', zone: 'reef' }, fields: { shoreDistance: -40, wetness: 1 }, height: -4 });
    assert.equal(reef.substrate.id, 'sandstone'); assert.equal(reef.cover.id, 'algae'); assert.ok(reef.coverFraction > .7);
});

test('Surface: the catena of the default recipe (loam and forest) puts turf on moist flats, dry grass and scree on convex dry ground, litter in the canopy and turf at the edge', () => {
    const lawn = evaluate({ soil: 'loam', category: { deposit: 'alluvium' }, fields: { wetness: .5, slopeDegrees: 3 }, slopeDegrees: 3, height: 5 });
    assert.equal(lawn.substrate.id, 'dirt'); assert.equal(lawn.cover.id, 'turf'); assert.ok(lawn.coverFraction >= .85 && lawn.coverFraction <= .95, `moist flat turf fraction ${lawn.coverFraction}`);
    const ridge = evaluate({ soil: 'loam', fields: { wetness: .2, convexity: .5, slopeDegrees: 26 }, slopeDegrees: 26, height: 30, moisture: -.4 });
    assert.equal(ridge.cover.id, 'dry-grass'); assert.ok(ridge.substrates.scree > .25, `scree share on convex dry steep ground: ${ridge.substrates.scree}`); assert.ok(ridge.coverFraction < lawn.coverFraction);
    const hollow = evaluate({ soil: 'loam', category: { drainage: 'flat-pond' }, fields: { wetness: .9, deposition: .7, skyView: .6 }, height: 3, moisture: .6 });
    assert.equal(hollow.substrate.id, 'mud'); assert.equal(hollow.cover.id, 'moss'); assert.ok(hollow.wetness > .8, `a wet hollow: ${hollow.wetness}`);
    const shade = evaluate({ soil: 'loam', fields: { wetness: .7, skyView: .4 }, height: 8 });
    assert.ok(shade.covers.moss > shade.covers.turf * .5, `shaded moist loam grows moss: ${shade.covers.moss} vs turf ${shade.covers.turf}`);
    const exposed = evaluate({ soil: 'loam', fields: { rockExposure: .8 }, height: 8 });
    assert.ok(exposed.coverFraction < .5, `rock exposure thins the cover: ${exposed.coverFraction}`); assert.ok(exposed.substrates.scree > .3);
    const canopy = evaluate({ soil: 'forest', category: { deposit: 'alluvium' }, fields: { wetness: .15, convexity: -.1, slopeDegrees: 10, skyView: .99 }, geology: { bedrockOffset: .06, wear: .77 }, slopeDegrees: 10, height: 15 });
    assert.equal(canopy.substrate.id, 'dirt'); assert.ok(canopy.substrates.dirt > .95); assert.equal(canopy.cover.id, 'broadleaf-litter'); assert.ok(Math.abs(canopy.coverFraction - .92) < 1e-9, `litter fraction inside the canopy ${canopy.coverFraction}`);
    const crown = evaluate({ soil: 'forest', fields: { wetness: .1, convexity: .6 }, geology: { waveExposure: .5 }, height: 20 });
    assert.ok(crown.covers['needle-litter'] > .4, `exposed dry crowns carry needle litter: ${crown.covers['needle-litter']}`);
    const moist = evaluate({ soil: 'forest', fields: { wetness: .85, skyView: .5 }, height: 6, moisture: .5 });
    assert.equal(moist.cover.id, 'moss');
    const edge = evaluate({ soil: 'forest', soilWeights: { forest: .55, loam: .45 }, fields: { skyView: .95, wetness: .45 }, height: 10 });
    assert.ok(edge.covers.turf > .4, `the forest edge opens to turf: ${edge.covers.turf}`); assert.ok(edge.coverFraction < canopy.coverFraction, 'litter thins at the edge');
    const steep = evaluate({ soil: 'forest', fields: { slopeDegrees: 33 }, geology: { bedrockOffset: .1 }, slopeDegrees: 33, height: 40 });
    assert.ok(steep.substrates.scree > .4, `a steep thin mantle is scree: ${steep.substrates.scree}`);
    const floor = evaluate({ soil: 'forest', category: { drainage: 'flat-pond' }, fields: { wetness: .9 }, height: 2, moisture: .4 });
    assert.equal(floor.substrate.id, 'mud');
    const unknown = evaluate({ soil: 'unknown', fields: { wetness: .9 }, height: 2 });
    assert.equal(unknown.substrate.id, 'dirt'); assert.equal(unknown.cover.id, 'none'); assert.equal(unknown.coverFraction, 0);
});

test('Surface: the catena of the default recipe (rock soil) reads the strata hardness, talus, the wet toe, lichen, moss, ledges and bare faces', () => {
    const soft = evaluate({ soil: 'rock', category: { lithology: 255 }, fields: { slopeDegrees: 45, skyView: .8 }, slopeDegrees: 45, height: 20 });
    assert.equal(soft.substrate.id, 'sandstone', 'hardness 0.2 is the soft stratum');
    const hard = evaluate({ soil: 'rock', category: { lithology: 1 }, fields: { slopeDegrees: 45, skyView: .8 }, slopeDegrees: 45, height: 20 });
    assert.equal(hard.substrate.id, 'caprock', 'hardness 0.9 is the caprock'); assert.ok(hard.substrates.caprock > .9);
    const talus = evaluate({ soil: 'rock', category: { deposit: 'talus', lithology: 4, zone: 'bluff-toe' }, fields: { slopeDegrees: 49, skyView: .79, rockExposure: .65 }, geology: { depositThickness: 1.1 }, slopeDegrees: 49, height: 3.9, reach: 1.2 });
    assert.ok(talus.substrates.scree > .3, `talus weighted by thickness: ${talus.substrates.scree}`); assert.ok(talus.substrates.cobble > .15); assert.equal(talus.cover.id, 'lichen'); assert.ok(talus.coverFraction < .3);
    const thinTalus = evaluate({ soil: 'rock', category: { deposit: 'talus', lithology: 4 }, fields: { slopeDegrees: 49, skyView: .79 }, geology: { depositThickness: .1 }, slopeDegrees: 49, height: 10 });
    assert.ok(thinTalus.substrates.scree < talus.substrates.scree);
    const platform = evaluate({ soil: 'rock', category: { lithology: 1, drainage: 'flat-pond', zone: 'platform' }, fields: { slopeDegrees: 1, wetness: .75, skyView: .86, convexity: -.5 }, slopeDegrees: 1, height: .6, reach: .9 });
    assert.equal(platform.cover.id, 'algae'); assert.ok(platform.coverFraction > .8); assert.ok(platform.wetness > .6, `the platform is wet from the ungated reach level: ${platform.wetness}`); assert.ok(platform.covers.turf < .05, 'no turf inside the shore reach');
    const face = evaluate({ soil: 'rock', category: { lithology: 12 }, fields: { slopeDegrees: 60, skyView: .75, faceMask: .8 }, geology: { faceMask: .8 }, slopeDegrees: 60, height: 60 });
    assert.equal(face.cover.id, 'none'); assert.ok(face.covers.none > .99, 'faces carry no cover'); assert.equal(face.coverFraction, 0);
    const stable = evaluate({ soil: 'rock', category: { lithology: 12 }, fields: { slopeDegrees: 40, skyView: .95, faceMask: 0 }, slopeDegrees: 40, height: 30 });
    assert.equal(stable.cover.id, 'lichen'); assert.ok(stable.coverFraction > .2 && stable.coverFraction < .35, `lichen keeps a low fraction: ${stable.coverFraction}`);
    const shaded = evaluate({ soil: 'rock', fields: { slopeDegrees: 20, skyView: .4, wetness: .7 }, slopeDegrees: 20, height: 12, moisture: .4 });
    assert.equal(shaded.cover.id, 'moss');
    const ledge = evaluate({ soil: 'rock', fields: { slopeDegrees: 8, convexity: -.3, skyView: .98 }, geology: { bedrockOffset: .4 }, slopeDegrees: 8, height: 25 });
    assert.equal(ledge.cover.id, 'turf'); assert.ok(ledge.coverFraction > .15 && ledge.coverFraction < .3, `turf in cracks keeps a small fraction: ${ledge.coverFraction}`); assert.ok(ledge.substrates.dirt > .2, 'ledges catch soil');
});

test('Surface: weights sum to 1, blend linearly across soils, fade to the documented neutral and the output is allocation-free with out', () => {
    for (const soil of LANDSCAPE_SURFACE_MODEL.soils) {
        const vector = landscapeSurfaceInputsFrom({ soilWeights: { [soil]: 1 }, fields: { ...neutralFields, wetness: .9, slopeDegrees: 30 }, geology: neutralGeology, categories: categories({ deposit: 'talus', zone: 'platform' }), slopeDegrees: 30, heightAboveSea: .3, appearanceLayer: { moisture: .5, reach: 1 } });
        const result = sampleLandscapeSurface(vector, recipe), total = sums(result);
        assert.ok(Math.abs(total.substrate - 1) < 1e-12 && Math.abs(total.cover - 1) < 1e-12, `${soil} weights sum to 1`);
        assert.ok(result.coverFraction >= 0 && result.coverFraction <= 1 && result.wetness >= 0 && result.wetness <= 1);
        assert.equal(result.availability, 1);
    }
    const sand = evaluate({ soil: 'sand', category: { deposit: 'beach-sand', zone: 'berm' }, height: 2, reach: 1 }), loam = evaluate({ soil: 'loam', category: { deposit: 'beach-sand', zone: 'berm' }, height: 2, reach: 1 });
    const mixed = evaluate({ soil: 'sand', soilWeights: { sand: 3, loam: 1 }, category: { deposit: 'beach-sand', zone: 'berm' }, height: 2, reach: 1 });
    for (const id of Object.keys(mixed.substrates)) assert.ok(Math.abs(mixed.substrates[id] - (.75 * sand.substrates[id] + .25 * loam.substrates[id])) < 1e-12, `${id} blends by soil weight`);
    assert.ok(Math.abs(mixed.coverFraction - (.75 * sand.coverFraction + .25 * loam.coverFraction)) < 1e-12);
    // nothing bound: the soil's default substrate and cover at the recipe's default fraction and wetness
    const neutral = describeLandscapeSurface(sampleLandscapeSurface(landscapeSurfaceInputsFrom({ soilWeights: { loam: 1 }, slopeDegrees: 0, heightAboveSea: 10 }), recipe));
    assert.deepEqual([neutral.substrate.id, neutral.substrate.weight, neutral.cover.id, neutral.cover.weight, neutral.coverFraction, neutral.wetness, neutral.availability], ['dirt', 1, 'turf', 1, recipe.soils.loam.defaults.coverFraction, 0, 0]);
    const seabedNeutral = describeLandscapeSurface(sampleLandscapeSurface(landscapeSurfaceInputsFrom({ soilWeights: { seabed: 1 }, slopeDegrees: 0, heightAboveSea: -5 }), recipe));
    assert.deepEqual([seabedNeutral.substrate.id, seabedNeutral.cover.id, seabedNeutral.wetness], ['sand', 'none', 1]);
    // half-arrived fields blend the derived classes with the default by the field availability; the geology alone counts half the availability
    const vector = landscapeSurfaceInputsFrom({ soilWeights: { loam: 1 }, fields: { ...neutralFields, rockExposure: .8 }, slopeDegrees: 0, heightAboveSea: 10, fieldsAvailability: .5 });
    const half = describeLandscapeSurface(sampleLandscapeSurface(vector, recipe)), full = evaluate({ soil: 'loam', fields: { rockExposure: .8 }, height: 10 });
    assert.equal(half.availability, .25);
    assert.ok(Math.abs(half.coverFraction - (.5 * full.coverFraction + .5 * .85)) < 1e-12);
    assert.ok(Math.abs(half.substrates.scree - .5 * full.substrates.scree) < 1e-12);
    const out = createLandscapeSurfaceResult(), again = sampleLandscapeSurface(vector, recipe, { out });
    assert.equal(again, out);
    assert.throws(() => sampleLandscapeSurface(new Float64Array(3), recipe), /model input vector/);
});

test('Surface: overrides validate strictly, pin and scale after the procedural pass, and the root-grid layer round-trips the document at its resolution', async () => {
    const document = { format: 'landscape-surface-overrides', schemaVersion: 1, id: 'test-overrides', recipe: 'coastal-surface-v1', regions: [
        { id: 'quarry', region: { type: 'circle', center: { x: 100, z: 100 }, radius: 30 }, substrate: 'scree', coverFractionScale: .25 },
        { id: 'marsh', region: { type: 'rectangle', minX: 150, maxX: 250, minZ: 50, maxZ: 120 }, cover: 'moss', wetnessOffset: .5, disturbance: .3 },
        { id: 'overlap', region: { type: 'polygon', points: [{ x: 90, z: 90 }, { x: 130, z: 90 }, { x: 130, z: 130 }, { x: 90, z: 130 }] }, cover: 'none', coverFractionScale: 2 }] };
    const overrides = validateLandscapeSurfaceOverrides(document, recipe);
    assert.ok(Object.isFrozen(overrides) && overrides.regions[0].cover === null && overrides.regions[1].substrate === null);
    const identity = await landscapeSurfaceOverridesIdentity(document);
    assert.match(identity, /^surface-overrides-[a-f0-9]{24}$/);
    assert.equal(await landscapeSurfaceOverridesIdentity({ ...document, regions: [...document.regions].map(region => Object.fromEntries(Object.entries(region).reverse())) }), identity);
    for (const [label, change] of Object.entries({
        'other recipe': copy => { copy.recipe = 'other'; }, 'unknown class': copy => { copy.regions[0].substrate = 'lava'; }, 'cover as substrate': copy => { copy.regions[0].substrate = 'moss'; },
        'scale range': copy => { copy.regions[0].coverFractionScale = 3; }, 'offset range': copy => { copy.regions[1].wetnessOffset = -2; }, 'empty region': copy => { delete copy.regions[0].substrate; delete copy.regions[0].coverFractionScale; },
        'repeated id': copy => { copy.regions[1].id = 'quarry'; }, 'point region': copy => { copy.regions[0].region = { type: 'point', x: 1, z: 2 }; }, 'extra field': copy => { copy.regions[0].note = 'x'; }
    })) { const copy = structuredClone(document); change(copy); assert.throws(() => validateLandscapeSurfaceOverrides(copy, recipe), landscapeError, label); }
    const inside = landscapeSurfaceOverrideAt(overrides, 100, 100), later = landscapeSurfaceOverrideAt(overrides, 125, 125), outside = landscapeSurfaceOverrideAt(overrides, 500, 500);
    assert.deepEqual(inside, { substrate: 2, cover: 0, coverFractionScale: 2, wetnessOffset: 0, disturbance: -1 }, 'the later overlapping region wins per field');
    assert.deepEqual(later, { substrate: -1, cover: 0, coverFractionScale: 2, wetnessOffset: 0, disturbance: -1 });
    assert.deepEqual(outside, { substrate: -1, cover: -1, coverFractionScale: 1, wetnessOffset: 0, disturbance: -1 });
    const result = sampleLandscapeSurface(landscapeSurfaceInputsFrom({ soilWeights: { loam: 1 }, fields: neutralFields, slopeDegrees: 2, heightAboveSea: 5 }), recipe), before = result.coverFraction;
    applyLandscapeSurfaceOverrides(result, overrides, 200, 100);
    assert.equal(result.cover[3], 1, 'the cover pin is a one-hot'); assert.equal(result.coverFraction, before); assert.ok(Math.abs(result.wetness - .5) < 1e-12); assert.equal(result.disturbance, .3);
    applyLandscapeSurfaceOverrides(result, overrides, 80, 100);
    assert.equal(result.substrate[2], 1); assert.ok(Math.abs(result.coverFraction - before * .25) < 1e-12);
    // the layer: every root sample encodes the document at its position; nearest pins and bilinear scales decode back within the byte quantization
    const rootGrid = { bounds: { minX: 0, maxX: 320, minZ: 0, maxZ: 320 }, samples: 33, halo: 2, width: 37 }, bytes = rasterizeLandscapeSurfaceOverrideLayer(overrides, rootGrid);
    assert.equal(bytes.length, 37 * 37 * 4);
    assert.deepEqual([...bytes.subarray(0, 4)], LANDSCAPE_SURFACE_OVERRIDE_LAYER.neutral, 'the halo corner is the neutral texel');
    const spacing = 10, texel = (column, row) => bytes.subarray(((row + 2) * 37 + column + 2) * 4, ((row + 2) * 37 + column + 2) * 4 + 4);
    assert.deepEqual([...texel(10, 22)], [2, 0, 254, 128], 'sample (100, 100): scree pin, none pin, scale 2');
    assert.deepEqual([...texel(20, 22)], [255, 3, 127, 128 + 64], 'sample (200, 100): moss pin, wetness +0.5 (0.504 after the byte)');
    const layout = { width: 37, halo: 2, samples: 33 };
    for (const [x, z] of [[100, 100], [200, 100], [125, 125], [5, 300], [160, 60]]) {
        const sampled = sampleLandscapeSurfaceOverrideLayer(bytes, 0, layout, rootGrid.bounds, x, z), expected = landscapeSurfaceOverrideAt(overrides, Math.round(x / spacing) * spacing, Math.round(z / spacing) * spacing);
        assert.deepEqual([sampled.substrate, sampled.cover], [expected.substrate, expected.cover], `${x},${z} pins are nearest`);
        assert.ok(Math.abs(sampled.coverFractionScale - expected.coverFractionScale) < 1 / 127 + 1e-9 && Math.abs(sampled.wetnessOffset - expected.wetnessOffset) < 1 / 127 + 1e-9, `${x},${z} scales within a byte`);
    }
    const between = sampleLandscapeSurfaceOverrideLayer(bytes, 0, layout, rootGrid.bounds, 135, 100);
    assert.ok(between.coverFractionScale > 1 && between.coverFractionScale < 2, 'the scale is bilinear between a scaled and a neutral sample');
});

test('Surface: the GLSL mirror carries the catalog sizes, flags, layer indices and every define the chunk reads; it adds no sampler and compiles into the diagnostics variant only', async () => {
    const source = await readFile(path.join(root, 'src/graphics/shaders/chunks/landscape/surface_model.glsl'), 'utf8'), code = source.replace(/\/\/[^\n]*/g, '');
    const constant = (type, name) => { const match = new RegExp(`const ${type} ${name} = ([0-9.e+-]+)u?;`).exec(code); assert.ok(match, `${name} is declared`); return Number(match[1]); };
    assert.equal(constant('uint', 'LANDSCAPE_SURFACE_FLAG_GEOLOGY'), LANDSCAPE_SURFACE_MODEL_RUNTIME.flags.geology);
    assert.equal(constant('uint', 'LANDSCAPE_SURFACE_FLAG_OVERRIDES'), LANDSCAPE_SURFACE_MODEL_RUNTIME.flags.overrides);
    assert.equal(constant('uint', 'LANDSCAPE_SURFACE_FLAG_MODEL'), LANDSCAPE_SURFACE_MODEL_RUNTIME.flags.model);
    assert.equal(constant('int', 'LANDSCAPE_SURFACE_GEOLOGY_LAYER'), LANDSCAPE_SURFACE_MODEL_RUNTIME.layers.geologyStart);
    assert.equal(constant('int', 'LANDSCAPE_SURFACE_CATEGORICAL_LAYER'), LANDSCAPE_SURFACE_MODEL_RUNTIME.layers.categorical);
    assert.equal(constant('float', 'LANDSCAPE_SURFACE_OVERRIDE_SCALE_UNIT'), LANDSCAPE_SURFACE_OVERRIDE_LAYER.scaleUnit);
    assert.equal(constant('float', 'LANDSCAPE_SURFACE_OVERRIDE_OFFSET_ZERO'), LANDSCAPE_SURFACE_OVERRIDE_LAYER.offsetZero);
    assert.equal(constant('float', 'LANDSCAPE_SURFACE_REACH_FRACTION_LIMIT'), LANDSCAPE_SURFACE_INPUTS[INDEX.reachFraction].range[1]);
    assert.match(source, /#include <shaderlib:landscape\/geology>/); assert.match(source, /#define LANDSCAPE_SURFACE_MODEL 1/);
    assert.ok(!/\buniform\b/.test(code) && !/\bsampler/.test(code.replace(/uTerrainFields/g, '')), 'the chunk declares no uniform and no sampler');
    const defines = landscapeSurfaceModelDefines(LANDSCAPE_SURFACE_RECIPE), used = new Set([...code.matchAll(/\bLANDSCAPE_SURFACE_[A-Z_]+\b/g)].map(match => match[0]));
    const declared = new Set([...Object.keys(defines), ...Object.keys(landscapeSurfaceClassColorDefines()), ...[...code.matchAll(/const \w+ (LANDSCAPE_SURFACE_\w+)/g)].map(match => match[1]), 'LANDSCAPE_SURFACE_MODEL']);
    for (const name of used) assert.ok(declared.has(name), `${name} is a define or a chunk constant`);
    for (const name of Object.keys(defines)) assert.ok(used.has(name), `${name} is read by the chunk`);
    assert.equal(defines.LANDSCAPE_SURFACE_SUBSTRATE_COUNT, '(11)'); assert.equal(defines.LANDSCAPE_SURFACE_COVER_COUNT, '(9)'); assert.equal(defines.LANDSCAPE_SURFACE_INPUT_COUNT, `(${LANDSCAPE_SURFACE_INPUTS.length})`);
    assert.equal(defines.LANDSCAPE_SURFACE_HARDNESS, 'vec4(0.9, 0.3, 0.7, 0.2)');
    assert.equal(defines.LANDSCAPE_SURFACE_NEUTRAL_LIST.split(', ').length, LANDSCAPE_SURFACE_INPUTS.length);
    assert.equal((defines.LANDSCAPE_SURFACE_RULE_LIST.match(/ivec4\(/g) ?? []).length, compileLandscapeSurfaceRecipe(LANDSCAPE_SURFACE_RECIPE).ruleCount);
    assert.ok(!Object.values(defines).some(value => value === '1' || value === 1), 'no define collapses into a valueless flag');
    for (const name of ['landscapeSurfaceModel', 'landscapeSurfaceGeology', 'landscapeSurfaceCategorical', 'landscapeStratumHardness', 'landscapeSurfaceOverrideLayer', 'landscapeSurfaceRamp', 'landscapeSurfaceSubstrateColor', 'landscapeSurfaceCoverColor']) assert.ok(new RegExp(`\\b${name}\\(`).test(code), name);
    assert.match(code, /int shifted = \(label <= 128 \? label - 1 : label - 256\) \+ 256, slot = shifted - \(shifted \/ 4\) \* 4;/, 'the unwrap never feeds a negative operand to the modulo');
    // the terrain program includes the chunk inside its diagnostics block only; the geology chunk enters through it (no program includes it directly)
    const terrain = await readFile(path.join(root, 'src/graphics/shaders/materials/landscape/terrain.frag.glsl'), 'utf8');
    assert.match(terrain, /#ifdef LANDSCAPE_TERRAIN_DIAGNOSTICS\s+(?:\/\/[^\n]*\s+)*#include <shaderlib:landscape\/surface_model>/);
    assert.equal((terrain.match(/landscape\/surface_model/g) ?? []).length, 1);
    assert.deepEqual(LANDSCAPE_DIAGNOSTICS.slice(13), LANDSCAPE_SURFACE_MODEL_RUNTIME.diagnostics);
    for (const entry of LANDSCAPE_SURFACE_SUBSTRATES) assert.ok(LANDSCAPE_SURFACE_SUBSTRATE_COLORS[entry.id], `${entry.id} has a review colour`);
    for (const entry of LANDSCAPE_SURFACE_COVERS) assert.ok(LANDSCAPE_SURFACE_COVER_COLORS[entry.id], `${entry.id} has a review colour`);
    assert.equal(new Set(Object.values(LANDSCAPE_SURFACE_SUBSTRATE_COLORS).map(color => color.hex)).size, LANDSCAPE_SURFACE_SUBSTRATES.length, 'distinct substrate colours');
});

test('Surface: the geology layers of a slot pack the field page verbatim and the labels into the halo\'d layout; the neutral page decodes to the neutral inputs', () => {
    const layout = { width: 9, halo: 2, samples: 5, layerBytes: 9 * 9 * 4 }, fieldBytes = new Uint8Array(2 * layout.layerBytes).map((_, i) => i & 255), labels = new Uint8Array(4 * 25);
    for (let plane = 0; plane < 4; plane++) for (let i = 0; i < 25; i++) labels[plane * 25 + i] = plane * 40 + i;
    const packed = packLandscapeSurfaceGeologyPage(fieldBytes, labels, layout);
    assert.equal(packed.length, 3 * layout.layerBytes);
    assert.deepEqual(packed.subarray(0, 2 * layout.layerBytes), fieldBytes);
    const texel = (column, row) => [...packed.subarray(2 * layout.layerBytes + (row * 9 + column) * 4, 2 * layout.layerBytes + (row * 9 + column) * 4 + 4)];
    assert.deepEqual(texel(2, 2), [0, 40, 80, 120], 'sample (0, 0) at the halo offset'); assert.deepEqual(texel(6, 6), [24, 64, 104, 144], 'sample (4, 4)');
    assert.deepEqual(texel(0, 0), texel(2, 2), 'the halo ring is edge-clamped'); assert.deepEqual(texel(8, 3), texel(6, 3));
    assert.throws(() => packLandscapeSurfaceGeologyPage(fieldBytes.subarray(1), labels, layout), /do not match/);
    const neutral = landscapeSurfaceNeutralGeologyPage(layout);
    assert.equal(neutral.length, 3 * layout.layerBytes);
    assert.deepEqual([...neutral.subarray(0, 4)], [16, 16, 0, 0], 'bedrockOffset 2 m of 32, regolith 0.5 m of 8');
    assert.ok(neutral.subarray(2 * layout.layerBytes).every(byte => byte === 0), 'every label is 0');
});
