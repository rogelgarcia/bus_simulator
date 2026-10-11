// Verifies the terrain synthesis leaves are explicit Node-only members of the landscape domain with scoped options, outside production and import defaults.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { planBakes } from '../../../tools/baking/Graph.mjs';
import { parseBakeOptions, resolveBakeOptions } from '../../../tools/baking/Options.mjs';
import { bakeJobs } from '../../../tools/baking/registry.mjs';
import { RELIEF_STUDY_POSES, RELIEF_STUDY_RECIPES } from '../../../tools/bake_landscape/terrain_synthesis/relief_study/ReliefStudyJob.mjs';
import { validateLandscapeSynthesisRecipe } from '../../../src/app/landscape/index.js';

test('Terrain synthesis: the relief-study leaf runs alone under landscape/synthesis, needs no executable and stays out of production and import defaults', () => {
    const plan = planBakes(bakeJobs, 'landscape/synthesis/relief-study');
    assert.deepEqual(plan.map(job => job.id), ['landscape/synthesis/relief-study']);
    assert.deepEqual(plan[0].configurationPaths, []);
    assert.equal(plan[0].blender, undefined);
    assert.deepEqual(plan[0].outputs, ['tests/artifacts/screens/landscape/ai596/d1/relief-study.json']);
    const defaults = resolveBakeOptions(plan, parseBakeOptions([])).get('landscape/synthesis/relief-study');
    assert.equal(defaults.directory, 'assets/public/landscape/coastal-city');
    assert.equal(defaults.recipes, RELIEF_STUDY_RECIPES.join(','));
    assert.equal(defaults.poses, RELIEF_STUDY_POSES);
    assert.equal(defaults['landscape-root'], 'assets/public/landscape');
    assert.equal(defaults.fields, 'bake');
    const scoped = resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/synthesis/relief-study:recipes=a.json,b.json', '--set', 'landscape/synthesis/relief-study:fields=none']));
    assert.equal(scoped.get('landscape/synthesis/relief-study').recipes, 'a.json,b.json');
    assert.equal(scoped.get('landscape/synthesis/relief-study').fields, 'none');
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/synthesis/relief-study:fields=maybe'])), /bake or none/);
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/synthesis/relief-study:source=original.zip'])), /No selected job consumes/);
    const fixture = planBakes(bakeJobs, 'landscape/synthesis/fixture');
    assert.deepEqual(fixture.map(job => job.id), ['landscape/synthesis/fixture']);
    assert.deepEqual(fixture[0].outputs, ['tests/artifacts/screens/landscape/ai596/d2/fixture/fixture-gate.json']);
    assert.equal(fixture[0].always, true);
    assert.equal(resolveBakeOptions(fixture, parseBakeOptions([])).get('landscape/synthesis/fixture').recipe, 'tools/bake_landscape/terrain_synthesis/fixture/recipes/plateau-road-shoreline.json');
    const resolution = planBakes(bakeJobs, 'landscape/synthesis/resolution-study');
    assert.deepEqual(resolution.map(job => job.id), ['landscape/synthesis/resolution-study']);
    assert.deepEqual(resolution[0].outputs, ['tests/artifacts/screens/landscape/ai596/d3/resolution/resolution-study.json']);
    assert.equal(resolution[0].always, true); assert.deepEqual(resolution[0].configurationPaths, []);
    assert.equal(resolveBakeOptions(resolution, parseBakeOptions([])).get('landscape/synthesis/resolution-study').fields, 'none');
    const coastal = planBakes(bakeJobs, 'landscape/synthesis/coastal-v3');
    assert.deepEqual(coastal.map(job => job.id), ['landscape/synthesis/coastal-v3']);
    assert.deepEqual(coastal[0].outputs, ['tests/artifacts/screens/landscape/ai596/d4/v3/coastal-v3.json']);
    assert.equal(coastal[0].always, true); assert.deepEqual(coastal[0].configurationPaths, []); assert.equal(coastal[0].blender, undefined);
    const coastalDefaults = resolveBakeOptions(coastal, parseBakeOptions([])).get('landscape/synthesis/coastal-v3');
    assert.deepEqual([coastalDefaults.recipe, coastalDefaults['fields-recipe'], coastalDefaults.working, coastalDefaults['landscape-root'], coastalDefaults.fields, coastalDefaults.geology, coastalDefaults['replay-edits'], coastalDefaults.poses],
        ['tools/bake_landscape/terrain_synthesis/recipes/coastal-v3.json', 'tools/bake_landscape/terrain_synthesis/recipes/terrain-fields-coastal-v3.json', 'native', 'assets/public/landscape', 'bake', 'publish', 'none', 'tools/landscape_review/poses/natural-world-v1.json']);
    const coastalScoped = resolveBakeOptions(coastal, parseBakeOptions(['--set', 'landscape/synthesis/coastal-v3:working=1953', '--set', 'landscape/synthesis/coastal-v3:fields=none', '--set', 'landscape/synthesis/coastal-v3:geology=none', '--set', 'landscape/synthesis/coastal-v3:replay-edits=assets/public/landscape/coastal-city-v3'])).get('landscape/synthesis/coastal-v3');
    assert.deepEqual([coastalScoped.working, coastalScoped.fields, coastalScoped.geology, coastalScoped['replay-edits']], ['1953', 'none', 'none', 'assets/public/landscape/coastal-city-v3']);
    assert.throws(() => resolveBakeOptions(coastal, parseBakeOptions(['--set', 'landscape/synthesis/coastal-v3:working=3906'])), /working must be native or 1953/);
    assert.throws(() => resolveBakeOptions(coastal, parseBakeOptions(['--set', 'landscape/synthesis/coastal-v3:geology=maybe'])), /geology must be publish or none/);
    const surround = planBakes(bakeJobs, 'landscape/synthesis/surround');
    assert.deepEqual(surround.map(job => job.id), ['landscape/synthesis/surround']);
    assert.deepEqual(surround[0].outputs, ['tests/artifacts/screens/landscape/ai596/d5/surround/surround.json']);
    assert.equal(surround[0].always, true); assert.deepEqual(surround[0].configurationPaths, []); assert.equal(surround[0].blender, undefined);
    const surroundDefaults = resolveBakeOptions(surround, parseBakeOptions([])).get('landscape/synthesis/surround');
    assert.deepEqual([surroundDefaults.recipe, surroundDefaults.landscape, surroundDefaults.output], ['tools/bake_landscape/terrain_synthesis/recipes/coastal-v3-surround.json', 'assets/public/landscape/coastal-city-v3', 'tests/artifacts/screens/landscape/ai596/d5/surround']);
    assert.equal(resolveBakeOptions(surround, parseBakeOptions(['--set', 'landscape/synthesis/surround:landscape=tests/artifacts/v3-copy'])).get('landscape/synthesis/surround').landscape, 'tests/artifacts/v3-copy');
    assert.throws(() => resolveBakeOptions(surround, parseBakeOptions(['--set', 'landscape/synthesis/surround:fields=none'])), /No selected job consumes/);
    const parent = planBakes(bakeJobs, 'landscape/synthesis');
    assert.deepEqual(parent.map(job => job.id), ['landscape/synthesis/relief-study', 'landscape/synthesis/fixture', 'landscape/synthesis/resolution-study', 'landscape/synthesis/coastal-v3', 'landscape/synthesis/surround', 'landscape/synthesis']);
    assert.ok(planBakes(bakeJobs, 'all').every(job => !job.id.startsWith('landscape')));
    assert.ok(planBakes(bakeJobs, 'landscape').every(job => !job.id.startsWith('landscape/synthesis')));
});

test('Terrain synthesis: the coastal-v3 recipe binds the v2 landscape at its revision onto the 4097² grid through the D4 operator chain and derives the cover', async () => {
    const recipe = validateLandscapeSynthesisRecipe(JSON.parse(await readFile(path.resolve('tools/bake_landscape/terrain_synthesis/recipes/coastal-v3.json'), 'utf8')));
    assert.equal(recipe.id, 'ai596-coastal-v3'); assert.equal(recipe.grid.columns, 4097); assert.equal(recipe.grid.spacingX, .9765625); assert.equal(recipe.grid.maxLevel, 4); assert.equal(recipe.working, null);
    assert.deepEqual(recipe.inputs.landscape, { directory: 'assets/public/landscape/coastal-city', expectedRevision: 'materials-bfcf20f7e27aa79db4d9983b' });
    assert.equal(recipe.outputs.coverPolicy, 'derive'); assert.equal(recipe.outputs.heightCap, 90);
    const ops = recipe.operators.filter(entry => entry.enabled).map(entry => entry.op);
    for (const required of ['import-heights', 'plan-inputs', 'landform-plateau', 'landform-hills', 'strata', 'fluvial-erosion', 'hydraulic-erosion', 'thermal-weathering', 'sediment-deposit', 'terraces', 'coastal-exposure', 'coastal-bluff', 'coastal-beach', 'coastal-foredune', 'coastal-nearshore', 'coastal-reef',
        'constrain-districts', 'constrain-points', 'constrain-roads', 'constrain-shoreline', 'constrain-runway', 'height-cap', 'export-map', 'geology-channels', 'derive-land-cover', 'resample']) assert.ok(ops.includes(required), `${required} is in the recipe`);
    assert.ok(ops.indexOf('constrain-points') < ops.lastIndexOf('constrain-districts') && ops.indexOf('constrain-points') < ops.indexOf('constrain-roads'), 'the corridor descent precedes the plaza and the road fit (D2 lesson)');
    assert.ok(ops.indexOf('geology-channels') < ops.indexOf('derive-land-cover') && ops[ops.length - 1] === 'resample');
    const beach = recipe.operators.find(entry => entry.op === 'coastal-beach').params, fluvial = recipe.operators.find(entry => entry.op === 'fluvial-erosion').params, sediment = recipe.operators.find(entry => entry.op === 'sediment-deposit').params;
    assert.ok(beach.deanA >= .1 && beach.deanA <= .14 && beach.bermHeightMeters >= 1.5 && beach.bermHeightMeters <= 2 && beach.deanDepthMeters === 8 && beach.offshoreMode === 'replace');
    assert.equal(fluvial.retainRate, .003); assert.equal(fluvial.iterations, 150); assert.equal(sediment.supplyFraction, .1);
    assert.equal(recipe.operators.find(entry => entry.op === 'coastal-bluff').params.talusVolumeFraction, .04, 'the bluff talus wedge is 4% of the cut (10% buried the lower third of a 12 m face)');
    // every plan district gets a designed edge: the plateau an escarpment, the low districts a 30 degree embankment blended over 5 m; never a feather
    const edges = recipe.operators.filter(entry => entry.enabled && entry.op === 'constrain-districts');
    assert.ok(edges.every(entry => entry.params.profile !== 'feather'), 'no district is feathered');
    assert.ok(edges.filter(entry => entry.params.profile === 'embankment').every(entry => entry.params.slopeDegrees === 30 && entry.params.combine === 'blend' && entry.params.blendMeters === 5));
    assert.deepEqual([...new Set(edges.flatMap(entry => entry.params.districtIds))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(edges.find(entry => entry.params.districtIds.includes(4)).params.profile, 'escarpment');
    const fields = JSON.parse(await readFile(path.resolve('tools/bake_landscape/terrain_synthesis/recipes/terrain-fields-coastal-v3.json'), 'utf8')), base = JSON.parse(await readFile(path.resolve('tools/bake_landscape/terrain_fields/recipe-v1.json'), 'utf8'));
    assert.equal(fields.workingLimitBytes, 1879048192, 'the v3 fields recipe raises the working limit for 4097² (about 1.5 GB of tracked arrays)');
    assert.deepEqual({ ...fields, workingLimitBytes: null }, { ...base, workingLimitBytes: null }, 'everything else equals the v1 fields recipe');
});

test('Terrain synthesis: the coastal-v3-surround recipe embeds v3 at its revision into the 32 km grid, masks every landform outside the extent and continues the design shoreline through the committed far-shoreline plan', async () => {
    const recipe = validateLandscapeSynthesisRecipe(JSON.parse(await readFile(path.resolve('tools/bake_landscape/terrain_synthesis/recipes/coastal-v3-surround.json'), 'utf8')));
    assert.equal(recipe.id, 'ai596-coastal-v3-surround'); assert.equal(recipe.seed, 596400, 'the v3 seed, so the shared hills operator id yields the same world-anchored octaves');
    assert.deepEqual(recipe.grid, { columns: 2049, rows: 2049, spacingX: 15.625, spacingZ: 15.625, bounds: { minX: -14000, maxX: 18000, minZ: -14000, maxZ: 18000 }, chunkIntervals: 256, maxLevel: 3 });
    assert.equal(recipe.working, null); assert.equal(recipe.seaLevel, 0); assert.equal(recipe.outputs.coverPolicy, 'derive'); assert.equal(recipe.outputs.heightCap, 500);
    assert.deepEqual(recipe.inputs.landscape, { directory: 'assets/public/landscape/coastal-city-v3', expectedRevision: 'synthesis-7045f619de9de74a367bc3a8' });
    const enabled = recipe.operators.filter(entry => entry.enabled), ops = enabled.map(entry => entry.op);
    assert.deepEqual(enabled[0].params, { placement: 'embed', filter: 'tent', fillMode: 'extend-edge', fillHeightMeters: 18, fillFadeMeters: 300, fillSmoothingMeters: 150, fillCoverClass: 3 });
    for (const required of ['import-heights', 'plan-inputs', 'coastal-beach', 'landform-hills', 'landform-cove', 'fluvial-erosion', 'constrain-shoreline', 'height-cap', 'geology-channels', 'derive-land-cover', 'resample']) assert.ok(ops.includes(required), `${required} is in the recipe`);
    assert.equal(enabled.filter(entry => entry.op === 'landform-headland').length, 0, 'the headlands are spurs of the continued relief, not domes');
    const coveIds = enabled.filter(entry => entry.op === 'landform-cove').map(entry => entry.id);
    assert.ok(coveIds.some(id => id.startsWith('cove-north')) && coveIds.some(id => id.startsWith('cove-south')), 'a cove on each continuation');
    const spurs = enabled.find(entry => entry.id === 'spurs');
    assert.equal(spurs.op, 'landform-hills'); assert.ok(spurs.params.anisotropy >= 2 && spurs.params.anisotropy <= 3 && spurs.params.bearingDegrees === 270 && spurs.params.combine === 'max' && spurs.params.offset === 'signed', 'the spur field is a ridged field stretched across the coast, max-composited');
    assert.ok(spurs.mask.selectors.some(selector => selector.type === 'distance' && selector.feature === 'shoreline' && selector.edge.from < selector.edge.to && selector.edge.to <= 300), 'the spurs rise within a few hundred meters of the far shoreline');
    assert.ok(spurs.mask.selectors.some(selector => selector.type === 'distance' && selector.feature === 'shoreline' && selector.edge.from > selector.edge.to), 'the spurs fade out inland');
    // the v3 hills field: same seed and operator id, the same octaves except the 44 m one (below the 15.625 m grid), the amplitude rescaled so every kept octave keeps its meters
    const v3 = validateLandscapeSynthesisRecipe(JSON.parse(await readFile(path.resolve('tools/bake_landscape/terrain_synthesis/recipes/coastal-v3.json'), 'utf8'))), v3Hills = v3.operators.find(entry => entry.id === 'hills').params, hills = enabled.find(entry => entry.id === 'hills').params;
    assert.deepEqual(hills.wavelengthsMeters, v3Hills.wavelengthsMeters.slice(0, 4)); assert.deepEqual(hills.amplitudes, v3Hills.amplitudes.slice(0, 4));
    assert.equal(hills.amplitudeMeters, v3Hills.amplitudeMeters * hills.amplitudes.reduce((a, b) => a + b, 0) / v3Hills.amplitudes.reduce((a, b) => a + b, 0));
    for (const key of ['ridgedMix', 'offset', 'warpMeters', 'warpWavelengthMeters', 'combine']) assert.equal(hills[key], v3Hills[key], key);
    const shelf = enabled.find(entry => entry.op === 'coastal-beach').params, v3Beach = v3.operators.find(entry => entry.op === 'coastal-beach').params;
    assert.deepEqual([shelf.deanA, shelf.deanDepthMeters, shelf.shelfSlopeDegrees, shelf.offshoreMode], [v3Beach.deanA, v3Beach.deanDepthMeters, v3Beach.shelfSlopeDegrees, 'replace'], 'the shelf continues the v3 Dean profile and slope');
    assert.ok(shelf.shelfFloorDepthMeters >= 30 && shelf.shelfFloorDepthMeters <= 60 && shelf.protectPlan === false);
    // every operator that moves the surface is masked to the outside of the city extent with a 0..300 m blend (0 on the extent and its boundary)
    const extent = [[0, 0], [4000, 0], [4000, 4000], [0, 4000]], outside = { type: 'polygon', polygon: extent, edge: { from: 0, to: -300 } };
    for (const entry of enabled) {
        if (['import-heights', 'plan-inputs', 'geology-channels', 'derive-land-cover', 'resample'].includes(entry.op)) { assert.equal(entry.mask, null, `${entry.id} takes no mask`); continue; }
        const selectors = entry.mask.type === 'multiply' ? entry.mask.selectors : [entry.mask], blend = entry.op === 'coastal-beach' ? { ...outside, edge: { from: 0, to: -30 } } : outside;
        assert.ok(selectors.some(selector => JSON.stringify(selector) === JSON.stringify(blend)), `${entry.id} is masked outside the extent with the ${-blend.edge.to} m blend`);
    }
    assert.ok(enabled.filter(entry => entry.op === 'landform-cove').every(entry => entry.params.protectPlan === false && entry.params.bearingDegrees === 270));
    assert.ok(ops.indexOf('coastal-beach') < ops.indexOf('landform-cove') && ops.indexOf('landform-cove') < ops.indexOf('fluvial-erosion') && ops.indexOf('fluvial-erosion') < ops.indexOf('sediment-deposit') && ops.indexOf('sediment-deposit') < ops.indexOf('constrain-shoreline'));
    const ranges = enabled.find(entry => entry.id === 'ranges').params;
    assert.deepEqual([ranges.combine, ranges.offset], ['max', 'signed'], 'the ranges are max-composited ridges rising from the plain');
    assert.ok(ranges.wavelengthsMeters[0] >= 8000 && ranges.amplitudes[2] <= .25 && ranges.amplitudes[3] <= .1, 'the 8-12 km octaves dominate and the 1-3 km octaves stay weak, so the ranges read as a few massifs');
    assert.deepEqual(enabled.find(entry => entry.id === 'cap').params, { capMeters: 500, shoulderMeters: 150 });
    assert.ok(ops.indexOf('geology-channels') < ops.indexOf('derive-land-cover') && ops[ops.length - 1] === 'resample');
    // the committed far shoreline: the design line verbatim between (880, 4000) and (1048, 0), continued to 100 m beyond the bounds, rebuilt from the recipe's promontories
    const author = await import('../../../tools/bake_landscape/terrain_synthesis/surround/plan/author.mjs');
    const committed = JSON.parse(await readFile(path.resolve(recipe.inputs.plan.shoreline), 'utf8')), points = committed.points_xyz_m;
    assert.equal(committed.coordinate_order, author.FAR_SHORELINE_ORDER);
    const first = points.findIndex(point => point[0] === 880 && point[2] === 4000), last = points.findIndex(point => point[0] === 1048 && point[2] === 0);
    assert.ok(first > 0 && last > first && last - first === 800, 'the 801 design points sit between the continuations');
    assert.equal(points[0][2], 18100); assert.ok(points[points.length - 1][2] <= -14100, 'the south end reaches the bound (a promontory arc may end beyond it)');
    const rebuilt = author.buildFarShoreline({ designPoints: points.slice(first, last + 1), recipe });
    assert.deepEqual(rebuilt, committed, 'far_shoreline.json is the authored continuation of the recipe');
    const features = author.recipePromontories(recipe), coast = author.farShorelineCoast(recipe), round3 = value => Math.round(value * 1000) / 1000;
    const spans = [];
    for (const feature of features) {
        const line = coast.at(feature.center[1]), arc = author.promontoryArc(feature, coast);
        assert.ok(Math.abs(line - author.promontoryFootprintCenterX(feature)) <= .05, `${feature.id}: the footprint center (3/8 of the length from the recipe center) lies on the far coast`);
        for (const end of [arc.points[0], arc.points[arc.points.length - 1]]) assert.ok(points.some(point => point[0] === round3(end.x) && point[2] === round3(end.z)), `${feature.id}: the committed line passes through the coast crossing (${round3(end.x)}, ${round3(end.z)})`);
        const within = points.filter(point => point[2] >= arc.zSouth && point[2] <= arc.zNorth), reach = feature.kind === 'headland' ? Math.min(...within.map(point => point[0])) : Math.max(...within.map(point => point[0]));
        const protrusion = feature.kind === 'headland' ? line - reach : reach - line;
        assert.ok(protrusion >= .5 * feature.lengthMeters && protrusion <= .75 * feature.lengthMeters + .025 * feature.widthMeters, `${feature.id} protrudes about 5/8 of its length (${protrusion.toFixed(0)} m)`);
        for (const [south, north, id] of spans) assert.ok(arc.zNorth < south || arc.zSouth > north, `${feature.id} and ${id} do not overlap along the coast`);
        spans.push([arc.zSouth, arc.zNorth, feature.id]);
    }
    assert.ok(spans.every(([south, north]) => north <= 4000 || south >= 4000) && spans.every(([south, north]) => south >= 0 || north <= 0), 'no promontory reaches into the design shoreline range');
    // the spur headlands: the coast bulges seaward where the recipe's spur field is high, never within 1.5 km of the design line's ends, and the
    // committed vertices carry the displaced coast exactly
    const headlands = author.farShorelineHeadlands(coast);
    assert.ok(headlands.length >= 4 && headlands.every(headland => headland.displacementMeters >= 300 && headland.displacementMeters <= author.SPUR_DISPLACEMENT.maxMeters), `${headlands.length} spur headlands of 300..${author.SPUR_DISPLACEMENT.maxMeters} m`);
    assert.ok(headlands.every(headland => headland.z >= 5500 || headland.z <= -1500), 'no spur headland within 1.5 km of the design shoreline');
    for (const z of [4020, 5000, 3980 - 4000, -20, -1000]) assert.equal(coast.displacement(z), 0, `the coast at z ${z} is the base coast`);
    for (const headland of headlands.slice(0, 3)) assert.ok(points.some(point => point[2] === headland.z && Math.abs(point[0] - headland.x) <= 1e-3), `the committed line carries the headland tip at z ${headland.z}`);
    for (const name of ['districts', 'roads', 'beachPoints']) {
        const file = JSON.parse(await readFile(path.resolve(recipe.inputs.plan[name]), 'utf8'));
        assert.deepEqual(name === 'districts' ? file : file[name === 'roads' ? 'roads' : 'points'], [], `${name}: the surround plan has no ${name}`);
    }
});

test('Terrain synthesis: the shipped relief variant recipes validate, differ only where the study says and bind the coastal grid', async () => {
    const recipes = [];
    for (const file of RELIEF_STUDY_RECIPES) recipes.push(validateLandscapeSynthesisRecipe(JSON.parse(await readFile(path.resolve(file), 'utf8'))));
    assert.deepEqual(recipes.map(recipe => recipe.id), ['ai596-relief-a-v2-sharpened', 'ai596-relief-b-raised-80', 'ai596-relief-c-dramatic-160']);
    for (const recipe of recipes) {
        assert.equal(recipe.grid.columns, 2049); assert.equal(recipe.grid.spacingX, 1.953125); assert.equal(recipe.working, null);
        assert.equal(recipe.inputs.landscape.directory, 'assets/public/landscape/coastal-city');
        assert.deepEqual(recipe.operators.map(operator => operator.op).filter(op => ['import-heights', 'plan-inputs', 'constrain-roads', 'constrain-shoreline', 'constrain-points', 'constrain-runway', 'height-cap', 'resample'].includes(op)).length, 8);
        assert.equal(recipe.outputs.heightCap, recipe.operators.find(operator => operator.op === 'height-cap').params.capMeters);
    }
    const highCity = recipes.map(recipe => recipe.operators.find(operator => operator.id === 'high-city').params.heightMeters);
    assert.deepEqual(highCity, [49, 80, 160]);
    assert.deepEqual(recipes.map(recipe => recipe.outputs.heightCap), [50, 90, 170]);
    assert.ok(new Set(recipes.map(recipe => recipe.seed)).size === 3, 'each variant has its own seed');
});
