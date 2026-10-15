// Verifies the landscape-ecosystem v1 recipe model (AI 599 D1): schema and rejections, round trip and identity, rule curves and traces, the dressing mapping, overrides, the record codec and the manifest attachments.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ECOSYSTEM_RECORD, ECOSYSTEM_RULE_INPUTS, LANDSCAPE_CONTENT_LAYERS_CAPABILITY, LANDSCAPE_DRESSING_INPUTS, applyEcosystemOverrides, canonicalEcosystemJson, compileEcosystemDensity, createEcosystemInputCatalog,
    createEcosystemInputSampler, createEcosystemTileData, createEmptyEcosystemOverrides, decodeEcosystemTile, ecosystemCellBounds, ecosystemCellOf, ecosystemCompetitors, ecosystemExcludedBy, ecosystemInstanceId, ecosystemLayerHaloMeters,
    ecosystemLayerPriorityOrder, ecosystemLayerSpacing, ecosystemOverrideParameters, ecosystemOverridesIdentity, ecosystemOverridesIntersecting, ecosystemRecipeIdentity, ecosystemTileId, encodeEcosystemTile, evaluateEcosystemCurve,
    evaluateEcosystemDensity, landscapeRegionSignedDistance, parseEcosystemInstanceId, parseEcosystemTileId, readEcosystemRecord, sampleLandscapeDressingInputs, sortEcosystemTile, traceEcosystemRule, validateEcosystemOverrides,
    validateEcosystemRecipe, validateLandscapeManifest, writeEcosystemRecord } from '../../../src/app/landscape/index.js';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';

const RECIPE_FILE = path.resolve('tools/bake_landscape/ecosystem/recipes/coastal-v3-ecosystem-v1.json');
const loadRecipe = async () => JSON.parse(await readFile(RECIPE_FILE, 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const withLayer = (recipe, id, mutate) => { const copy = clone(recipe); mutate(copy.layers[id], copy); return copy; };

test('Ecosystem recipe: the coastal v3 development recipe validates, fills its defaults and round-trips through JSON unchanged', async () => {
    const raw = await loadRecipe(), recipe = validateEcosystemRecipe(raw);
    assert.equal(recipe.id, 'coastal-v3-ecosystem-v1');
    assert.deepEqual(Object.keys(recipe.layers), ['boulders', 'shrubs', 'pebbles', 'boulder-scree']);
    assert.deepEqual(ecosystemLayerPriorityOrder(recipe), ['boulders', 'shrubs', 'pebbles', 'boulder-scree']);
    assert.equal(ecosystemLayerSpacing(recipe.layers.boulders), 4);
    assert.equal(ecosystemLayerSpacing(recipe.layers.pebbles), .5);
    assert.ok(Object.isFrozen(recipe.layers.shrubs.rules.density[0].curve));
    assert.equal(recipe.layers.boulders.rules.parent, null);
    assert.equal(recipe.layers['boulder-scree'].rules.parent.layer, 'boulders');
    assert.deepEqual(recipe.biomes['coastal-natural'].where, []);
    const again = validateEcosystemRecipe(clone(recipe));
    assert.deepEqual(again, recipe);
    assert.equal(canonicalEcosystemJson(again), canonicalEcosystemJson(recipe));
    // defaults: a layer without alignment, variation, shadow, jitter or fadeMeters gets the documented values
    const minimal = withLayer(raw, 'boulders', layer => { delete layer.alignment; delete layer.variation; delete layer.shadow; delete layer.jitter; delete layer.fadeMeters; layer.footprint.radiusMeters = .3; });
    const filled = validateEcosystemRecipe(minimal).layers.boulders;
    assert.deepEqual(filled.alignment, { mode: 'upright', slopeWeight: 0, sinkMeters: 0, sinkScalesWithSize: true });
    assert.deepEqual(filled.variation.scale, { min: 1, max: 1, distribution: 'uniform' });
    assert.equal(filled.variation.yaw, 'random');
    assert.deepEqual(filled.shadow, { castLevels: [], maxDistanceMeters: 0 });
    assert.equal(filled.jitter, .35);
    assert.equal(filled.fadeMeters, 45);
});

test('Ecosystem recipe: the identity follows the canonical content, not the key order, and changes with any parameter', async () => {
    const raw = await loadRecipe();
    const identity = await ecosystemRecipeIdentity(raw);
    assert.match(identity, /^ecosystem-recipe-[a-f0-9]{24}$/);
    const reordered = Object.fromEntries(Object.entries(raw).reverse());
    assert.equal(await ecosystemRecipeIdentity(reordered), identity);
    const changed = withLayer(raw, 'shrubs', layer => { layer.rules.density[0].curve[1][1] = .1; });
    assert.notEqual(await ecosystemRecipeIdentity(changed), identity);
    assert.equal(canonicalEcosystemJson({ b: [1, { d: 2, c: 3 }], a: null }), '{"a":null,"b":[1,{"c":3,"d":2}]}');
});

test('Ecosystem recipe: the validator rejects what the generator or renderer could not honour', async () => {
    const raw = await loadRecipe();
    const rejects = (mutate, pattern) => assert.throws(() => validateEcosystemRecipe(mutate(clone(raw))), pattern);
    rejects(recipe => { recipe.layers.boulders.rules.density.push({ input: 'temperature', curve: [[0, 0], [1, 1]] }); return recipe; }, /not an ecosystem rule input/);
    rejects(recipe => { recipe.layers.boulders.rules.density[0].curve = [[0, 0], [0, 1]]; return recipe; }, /increase strictly/);
    rejects(recipe => { recipe.layers.boulders.rules.density[0].curve = [[0, 0], [1, 1.5]]; return recipe; }, /y must be in/);
    rejects(recipe => { recipe.layers.shrubs.jitter = .45; return recipe; }, /cannot keep footprints/);
    rejects(recipe => { recipe.layers.shrubs.lods[2].distanceMeters = 500; return recipe; }, /last LOD must reach viewDistanceMeters/);
    rejects(recipe => { recipe.layers.shrubs.lods[1].level = 9; return recipe; }, /not a level of asset set/);
    rejects(recipe => { recipe.layers.shrubs.rules.competition.priority = 30; return recipe; }, /share priority 30/);
    rejects(recipe => { recipe.layers['boulder-scree'].rules.competition.against = ['boulders', 'pebbles', 'boulder-scree']; return recipe; }, /higher priority/);
    rejects(recipe => { recipe.layers.boulders.rules.exclusions.push({ zone: 'lava' }); return recipe; }, /unknown zone lava/);
    rejects(recipe => { recipe.layers.boulders.rules.exclusions.push({ zone: 'faces' }); return recipe; }, /repeats a zone/);
    rejects(recipe => { recipe.layers.pebbles.rules.competition.clearanceMeters = 100; return recipe; }, /exceeds half of its 128 m cell/);
    rejects(recipe => { recipe.layers['boulder-scree'].rules.parent.radiusMeters = [1, 200]; return recipe; }, /child radius exceeds half/);
    rejects(recipe => { recipe.layers['boulder-scree'].rules.parent.layer = 'pebbles'; recipe.layers['boulder-scree'].rules.competition.priority = 12; recipe.layers['boulder-scree'].rules.competition.against = ['boulders', 'shrubs']; recipe.biomes['coastal-natural'].layers = ['boulders', 'shrubs', 'boulder-scree', 'pebbles']; return recipe; }, /parent pebbles must have a higher priority/);
    rejects(recipe => { recipe.biomes['coastal-natural'].layers = ['boulders', 'shrubs', 'pebbles']; return recipe; }, /belongs to no biome/);
    rejects(recipe => { recipe.biomes.second = { label: 'again', layers: ['pebbles'] }; return recipe; }, /exactly one biome/);
    rejects(recipe => { recipe.biomes['coastal-natural'].layers = ['shrubs', 'boulders', 'pebbles', 'boulder-scree']; return recipe; }, /descending priority/);
    rejects(recipe => { recipe.layers.boulders.cell.meters = 100; return recipe; }, /power of two/);
    rejects(recipe => { recipe.layers.boulders.extra = 1; return recipe; }, /missing or unsupported fields/);
    rejects(recipe => { recipe.assets.rocks.kind = 'scan'; return recipe; }, /must declare a kind/);
    rejects(recipe => { recipe.assets.shrubs.species = 'oak'; return recipe; }, /catalog species/);
    rejects(recipe => { recipe.zones.faces = { type: 'rectangle', minX: 0, maxX: 1, minZ: 0, maxZ: 1 }; return recipe; }, /shadows a built-in zone/);
    rejects(recipe => { recipe.layers.shrubs.rules.density.push({ input: 'distance.layer.pebbles', curve: [[0, 0], [5, 1]] }); return recipe; }, /layer of higher priority/);
    rejects(recipe => { recipe.targets.trees.basis = ''; return recipe; }, /basis must explain/);
    rejects(recipe => { recipe.seed = -1; return recipe; }, /seed/);
    assert.throws(() => validateEcosystemRecipe({ ...clone(raw), format: 'other' }), /unsupported ecosystem recipe format/);
});

test('Ecosystem recipe: competitors, competition distances and halos follow the priorities and footprints', async () => {
    const recipe = validateEcosystemRecipe(await loadRecipe());
    assert.deepEqual(ecosystemCompetitors(recipe, recipe.layers.shrubs).map(layer => layer.id), ['boulders']);
    assert.deepEqual(ecosystemCompetitors(recipe, recipe.layers['boulder-scree']).map(layer => layer.id), ['boulders', 'shrubs', 'pebbles']);
    assert.equal(ecosystemLayerHaloMeters(recipe, recipe.layers.boulders), 0);
    assert.equal(ecosystemLayerHaloMeters(recipe, recipe.layers.shrubs), 1.55);
    assert.equal(ecosystemLayerHaloMeters(recipe, recipe.layers['boulder-scree']), 2.4);
});

test('Ecosystem rules: curves interpolate and clamp, groups take their maximum, groups multiply, and the trace names every factor', () => {
    const curve = [[0, 0], [10, 1], [20, .5]];
    assert.equal(evaluateEcosystemCurve(curve, -5), 0); assert.equal(evaluateEcosystemCurve(curve, 5), .5); assert.equal(evaluateEcosystemCurve(curve, 15), .75); assert.equal(evaluateEcosystemCurve(curve, 25), .5);
    const catalog = createEcosystemInputCatalog(['a']);
    assert.equal(catalog.size, ECOSYSTEM_RULE_INPUTS.length + 1);
    assert.equal(catalog.entries.at(-1).name, 'distance.layer.a');
    const vector = catalog.neutralVector();
    assert.equal(vector[catalog.index('soil.unknown')], 1); assert.equal(vector[catalog.index('moisture')], .5); assert.equal(vector[catalog.index('geology.coastalZone.inland')], 1);
    const groups = compileEcosystemDensity([{ group: 'habitat', input: 'soil.rock', curve: [[0, 0], [1, .5]] }, { group: 'habitat', input: 'soil.loam', curve: [[0, 0], [1, .2]] }, { input: 'slopeDegrees', curve: [[0, 1], [40, 0]] }], catalog);
    assert.equal(groups.length, 2);
    vector[catalog.index('soil.rock')] = 1; vector[catalog.index('soil.loam')] = .5; vector[catalog.index('slopeDegrees')] = 20;
    assert.ok(Math.abs(evaluateEcosystemDensity(groups, vector) - .25) < 1e-12, 'max(0.5, 0.1) × 0.5');
    const trace = traceEcosystemRule(groups, vector, { clumping: .8, densityScale: 2 });
    assert.ok(Math.abs(trace.density - .4) < 1e-12 && Math.abs(trace.curveDensity - .25) < 1e-12);
    assert.deepEqual(trace.factors.map(factor => [factor.input, factor.weight]), [['soil.rock', .5], ['soil.loam', .1], ['slopeDegrees', .5]]);
    assert.equal(traceEcosystemRule(groups, vector, { excluded: 'roads' }).density, 0);
    assert.equal(traceEcosystemRule(groups, vector, { densityScale: 10 }).density, 1, 'density saturates at one');
    assert.throws(() => catalog.index('wind'), /unknown ecosystem rule input/);
});

test('Ecosystem inputs: the sampler maps terrain, fields, geology and planning onto the catalog, keeps neutral values for absent sources and reproduces the dressing inputs exactly', () => {
    const fixture = createLandscapeModelFixture(), { manifest } = fixture, chunk = fixture.decoded.get('l1/c1/r0');
    const terrain = (x, z) => {
        if (x < chunk.descriptor.bounds.minX || x > chunk.descriptor.bounds.maxX || z < chunk.descriptor.bounds.minZ || z > chunk.descriptor.bounds.maxZ) return null;
        return { height: 3.5, normal: { x: -.3, y: Math.sqrt(1 - .09 - .16), z: .4 }, slopeDegrees: 30, soilId: 'loam', landCoverId: 2, seaLevel: manifest.coordinates.seaLevel };
    };
    const bare = createEcosystemInputSampler({ layerIds: ['boulders'], sources: { terrain } });
    const inside = bare.sample(4, 20);
    assert.ok(inside && inside.availability.fields === false && inside.availability.geology === false && inside.availability.planning === false);
    const described = bare.describe(inside.vector);
    assert.equal(described.slopeDegrees, 30); assert.equal(described.altitudeMeters, 3.5); assert.equal(described['soil.loam'], 1); assert.equal(described['soil.unknown'], 0); assert.equal(described['naturalSoil.loam'], 1);
    assert.equal(described['cover.grass'], 1); assert.equal(described.moisture, .5, 'neutral without fields'); assert.equal(described['distance.roads'], 256); assert.equal(described['geology.depositType.none'], 1);
    assert.ok(Math.abs(described.aspectNorth - .8) < 1e-12 && Math.abs(described.aspectEast + .6) < 1e-12, 'the downslope direction from the normal');
    const neutralDressing = sampleLandscapeDressingInputs({ soilWeights: { loam: 1 }, planningShare: 0, fields: null });
    for (const name of LANDSCAPE_DRESSING_INPUTS.outputs) assert.equal(described[`dressing.${name}`], neutralDressing[name]);
    assert.equal(bare.sample(-100, 20), null);
    const fields = { wetness: .7, flow: .2, deposition: .1, rockExposure: .4, skyView: .9, shoreDistance: 37, convexity: -.2, slopeDegrees: 30 };
    const full = createEcosystemInputSampler({ layerIds: ['boulders'], sources: { terrain: (x, z) => ({ ...terrain(x, z), landCoverId: 6, soilId: 'unknown' }), fields: () => fields, naturalSoil: () => 'forest',
        geology: () => ({ channels: { bedrockOffset: 2, regolith: .5, depositThickness: 1.5, wear: .3, deposition: .2, flow: .1, waveExposure: 0, faceMask: .6 }, categories: { depositType: 1, lithology: 7, drainage: 2, coastalZone: 10 } }),
        roadDistance: () => 4, districtDistance: () => 300, coverDistance: (x, z, id) => id === 3 ? 12 : null, layerDistance: (x, z, id) => id === 'boulders' ? 2.5 : null } });
    const sample = full.sample(4, 20), values = full.describe(sample.vector);
    assert.deepEqual(sample.availability, { fields: true, geology: true, naturalSoil: true, planning: true, coverDistance: true, layerDistance: true });
    assert.equal(values.planningShare, 1); assert.equal(values['soil.unknown'], 1); assert.equal(values['naturalSoil.forest'], 1); assert.equal(values['cover.road'], 1);
    assert.equal(values.moisture, .7); assert.equal(values.light, .9); assert.equal(values.shoreDistanceMeters, 37); assert.equal(values['distance.water'], 37);
    assert.equal(values['geology.depositType.talus'], 1); assert.equal(values['geology.depositType.none'], 0); assert.equal(values['geology.coastalZone.bluff-toe'], 1); assert.equal(values['geology.drainage.gully'], 1);
    assert.equal(values['geology.lithology'], 7); assert.equal(values['geology.faceMask'], .6); assert.equal(values['geology.depositThickness'], 1.5);
    assert.equal(values['distance.roads'], 4); assert.equal(values['distance.districts'], 256, 'distances saturate at 256 m'); assert.equal(values['distance.cover.forest'], 12); assert.equal(values['distance.cover.sand'], 256); assert.equal(values['distance.layer.boulders'], 2.5);
    const dressing = sampleLandscapeDressingInputs({ soilWeights: { forest: 1 }, planningShare: 1, fields });
    for (const name of LANDSCAPE_DRESSING_INPUTS.outputs) assert.equal(values[`dressing.${name}`], dressing[name], `dressing ${name} under planning cover with the natural soil`);
    // exclusion zones read the same vector
    const context = { zones: { pond: { type: 'circle', center: { x: 4, z: 20 }, radius: 3 } }, viewCorridor: () => true, regionDistance: landscapeRegionSignedDistance };
    const at = { x: 4, z: 20, terrain: sample.terrain, vector: sample.vector, catalog: full.catalog };
    assert.equal(ecosystemExcludedBy('planning-cover', 0, at, context), true);
    assert.equal(ecosystemExcludedBy('roads', 3, at, context), false); assert.equal(ecosystemExcludedBy('roads', 4, at, context), true);
    assert.equal(ecosystemExcludedBy('faces', 0, at, context), true); assert.equal(ecosystemExcludedBy('water', 15, at, context), false); assert.equal(ecosystemExcludedBy('water', 40, at, context), true);
    assert.equal(ecosystemExcludedBy('view-corridor', 0, at, context), true); assert.equal(ecosystemExcludedBy('pond', 0, at, context), true);
    assert.equal(ecosystemExcludedBy('pond', 0, { ...at, x: 9 }, context), false); assert.equal(ecosystemExcludedBy('pond', 2.5, { ...at, x: 9 }, context), true);
    assert.throws(() => ecosystemExcludedBy('lake', 0, at, context), /unknown exclusion zone/);
});

test('Ecosystem tiles: cells, ids and the record codec round-trip, sort by rank and reject malformed payloads', () => {
    assert.deepEqual(ecosystemCellOf(256, 300, -10), { cellX: 1, cellZ: -1 });
    assert.deepEqual(ecosystemCellBounds(128, 2, 3), { minX: 256, maxX: 384, minZ: 384, maxZ: 512 });
    assert.equal(ecosystemTileId('boulders', 3, -2), 'boulders/x3/z-2');
    assert.deepEqual(parseEcosystemTileId('boulder-scree/x3/z-2'), { layerId: 'boulder-scree', cellX: 3, cellZ: -2 });
    assert.equal(ecosystemInstanceId('shrubs', -12, 40), 'shrubs:-12,40');
    assert.equal(ecosystemInstanceId('boulder-scree', 7, 9, 2), 'boulder-scree:7,9:2');
    assert.deepEqual(parseEcosystemInstanceId('shrubs:-12,40'), { layerId: 'shrubs', siteX: -12, siteZ: 40, child: -1, pinned: null });
    assert.deepEqual(parseEcosystemInstanceId('boulders:pin:big-one'), { layerId: 'boulders', siteX: 0, siteZ: 0, child: -2, pinned: 'big-one' });
    assert.throws(() => parseEcosystemInstanceId('shrubs:x'), /not an ecosystem instance id/);
    const tile = createEcosystemTileData(3);
    writeEcosystemRecord(tile, 0, { x: 1, y: 2, z: 3, scale: 1.5, normalX: .1, normalZ: -.2, yaw: 1, variant: 2, rank: .9, tint: [1, .9, .8], siteX: 10, siteZ: 11, child: -1 });
    writeEcosystemRecord(tile, 1, { x: 4, y: 5, z: 6, scale: .5, normalX: 0, normalZ: 0, yaw: 2, variant: 0, rank: .1, tint: [1, 1, 1], siteX: 12, siteZ: 13, child: 3 });
    writeEcosystemRecord(tile, 2, { x: 7, y: 8, z: 9, scale: 1, normalX: 0, normalZ: 0, yaw: 0, variant: 1, rank: .1, tint: [1, 1, 1], siteX: 5, siteZ: 13, child: -1 });
    tile.count = 3;
    const sorted = sortEcosystemTile(tile);
    assert.deepEqual([0, 1, 2].map(i => readEcosystemRecord(sorted, i).siteX), [5, 12, 10], 'ranks ascending, ties by site');
    const bytes = encodeEcosystemTile(sorted);
    assert.equal(bytes.byteLength, 3 * 60);
    const decoded = decodeEcosystemTile(bytes);
    assert.equal(decoded.count, 3);
    assert.deepEqual(readEcosystemRecord(decoded, 2), { ...readEcosystemRecord(sorted, 2), tint: [1, Math.fround(.9), Math.fround(.8)] });
    assert.throws(() => decodeEcosystemTile(bytes.subarray(0, 59)), /whole number/);
    const corrupt = encodeEcosystemTile(sorted); new DataView(corrupt.buffer).setFloat32(ECOSYSTEM_RECORD.rank * 4, 2, true);
    assert.throws(() => decodeEcosystemTile(corrupt), /invalid rank or scale/);
    assert.throws(() => writeEcosystemRecord(tile, 0, { x: 1, y: 2, z: 3, scale: 0, normalX: 0, normalZ: 0, yaw: 0, variant: 0, rank: .5, tint: [1, 1, 1], siteX: 0, siteZ: 0, child: -1 }), /scale, rank and variant/);
});

test('Ecosystem overrides: the document validates against the recipe, region parameters and masks resolve at a position, and the post-generation steps apply in order', async () => {
    const recipe = validateEcosystemRecipe(await loadRecipe());
    const empty = createEmptyEcosystemOverrides(recipe.id);
    assert.equal(empty.recipe, recipe.id);
    const document = {
        format: 'landscape-ecosystem-overrides', schemaVersion: 1, id: 'test-overrides', recipe: recipe.id,
        regions: [{ id: 'denser-bluff', region: { type: 'rectangle', minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, layers: { '*': { densityScale: 2 }, shrubs: { densityScale: .5, scaleMultiplier: 1.2 } } }],
        masks: [{ id: 'no-boulders-here', mode: 'exclude', region: { type: 'circle', center: { x: 50, z: 50 }, radius: 10 }, layers: ['boulders'] }, { id: 'allow-shrubs', mode: 'include', region: { type: 'rectangle', minX: 60, maxX: 70, minZ: 60, maxZ: 70 }, layers: '*' }],
        instances: { removed: ['boulders:3,4', 'shrubs:1,1:2'], pinned: [{ layer: 'boulders', id: 'landmark', x: 80, z: 80, yaw: .5, scale: 2, variant: 1 }, { layer: 'boulders', id: 'outside', x: 500, z: 500, yaw: 0, scale: 1, variant: 0 }] }
    };
    const overrides = validateEcosystemOverrides(document, recipe);
    assert.deepEqual(ecosystemOverrideParameters(overrides, 'boulders', 50, 50), { densityScale: 2, scaleMultiplier: 1, included: false, regionIds: ['denser-bluff'] });
    assert.deepEqual(ecosystemOverrideParameters(overrides, 'shrubs', 65, 65), { densityScale: .5, scaleMultiplier: 1.2, included: true, regionIds: ['denser-bluff', 'allow-shrubs'] });
    assert.deepEqual(ecosystemOverrideParameters(overrides, 'shrubs', 150, 150), { densityScale: 1, scaleMultiplier: 1, included: false, regionIds: [] });
    assert.deepEqual(ecosystemOverridesIntersecting(overrides, 'boulders', { minX: 0, maxX: 128, minZ: 0, maxZ: 128 }), ['allow-shrubs', 'boulders:pin:landmark', 'denser-bluff', 'no-boulders-here']);
    assert.deepEqual(ecosystemOverridesIntersecting(overrides, 'boulders', { minX: 200, maxX: 300, minZ: 200, maxZ: 300 }), []);
    const identity = await ecosystemOverridesIdentity(overrides);
    assert.match(identity, /^ecosystem-overrides-[a-f0-9]{24}$/);
    assert.equal(await ecosystemOverridesIdentity(document), identity);
    const tile = createEcosystemTileData(3);
    const base = { y: 1, scale: 1, normalX: 0, normalZ: 0, yaw: 0, variant: 0, tint: [1, 1, 1], child: -1 };
    writeEcosystemRecord(tile, 0, { ...base, x: 52, z: 52, rank: .2, siteX: 1, siteZ: 1 });
    writeEcosystemRecord(tile, 1, { ...base, x: 20, z: 20, rank: .3, siteX: 3, siteZ: 4 });
    writeEcosystemRecord(tile, 2, { ...base, x: 90, z: 90, rank: .4, siteX: 9, siteZ: 9 });
    tile.count = 3;
    const applied = applyEcosystemOverrides(tile, { layerId: 'boulders', bounds: { minX: 0, maxX: 128, minZ: 0, maxZ: 128 }, overrides, groundAt: (x, z) => x === 80 ? { height: 12, normal: { x: 0, y: 1, z: 0 } } : null });
    assert.equal(applied.masked, 1, 'the feature inside the exclude mask');
    assert.equal(applied.removed, 1, 'the removed id');
    assert.deepEqual(applied.pinned, ['boulders:pin:landmark']);
    assert.deepEqual(applied.unplaced, []);
    assert.equal(applied.tile.count, 2);
    const pinned = readEcosystemRecord(applied.tile, 0);
    assert.equal(pinned.rank, 0, 'pinned instances lead the rank order so coarse coverage keeps them');
    assert.equal(pinned.child, ECOSYSTEM_RECORD.childPinned); assert.equal(pinned.y, 12); assert.equal(pinned.scale, 2); assert.equal(pinned.variant, 1);
    assert.equal(readEcosystemRecord(applied.tile, 1).siteX, 9);
    assert.throws(() => validateEcosystemOverrides({ ...document, instances: { removed: ['boulders:pin:x'], pinned: [] } }, recipe), /deleting its pin/);
    assert.throws(() => validateEcosystemOverrides({ ...document, masks: [{ id: 'denser-bluff', mode: 'exclude', region: { type: 'circle', center: { x: 0, z: 0 }, radius: 1 }, layers: '*' }] }, recipe), /repeats an id/);
    assert.throws(() => validateEcosystemOverrides({ ...document, regions: [{ id: 'r', region: { type: 'point', x: 0, z: 0 }, layers: { '*': { densityScale: 1 } } }] }, recipe), /explicit circle, rectangle, or polygon/);
    assert.throws(() => validateEcosystemOverrides({ ...document, regions: [{ id: 'r', region: { type: 'circle', center: { x: 0, z: 0 }, radius: 1 }, layers: { trees: { densityScale: 1 } } }] }, recipe), /unknown layer trees/);
    assert.throws(() => validateEcosystemOverrides({ ...document, recipe: 'other' }, recipe), /target recipe other/);
});

test('Ecosystem manifest: attachments stay empty without content-layers-v1 and name content layers by id, kind, url and revision with it', () => {
    const { manifest } = createLandscapeModelFixture();
    const attachment = { id: 'ecosystem', kind: 'landscape-ecosystem', url: 'ecosystem/manifest.json', revision: 'ecosystem-000000000000000000000000' };
    assert.throws(() => validateLandscapeManifest({ ...manifest, attachments: [attachment] }), /attachments must be empty/);
    const capable = validateLandscapeManifest({ ...manifest, capabilities: [...manifest.capabilities, LANDSCAPE_CONTENT_LAYERS_CAPABILITY], attachments: [attachment] });
    assert.deepEqual(capable.attachments, [attachment]);
    assert.ok(Object.isFrozen(capable.attachments[0]));
    const capabilities = [...manifest.capabilities, LANDSCAPE_CONTENT_LAYERS_CAPABILITY];
    assert.throws(() => validateLandscapeManifest({ ...manifest, capabilities, attachments: [{ ...attachment, kind: 'roads' }] }), /unsupported attachment kind/);
    assert.throws(() => validateLandscapeManifest({ ...manifest, capabilities, attachments: [attachment, attachment] }), /duplicate attachment/);
    assert.throws(() => validateLandscapeManifest({ ...manifest, capabilities, attachments: [{ ...attachment, url: '../elsewhere.json' }] }), /relative asset path|traverse/);
    assert.throws(() => validateLandscapeManifest({ ...manifest, capabilities, attachments: [{ id: 'x', kind: 'landscape-ecosystem', url: 'a.json' }] }), /exactly id, kind, url and revision/);
});
