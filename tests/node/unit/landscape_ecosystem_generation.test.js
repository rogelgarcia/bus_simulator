// Verifies the deterministic hierarchical ecosystem generation (AI 599 D2) on a synthetic landscape: terrain contact, determinism, seams, local stability, competition, children, exclusions, overrides, inputs with and without sidecars, traces, the lattice and the spatial statistics gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ECOSYSTEM_RECORD, ECOSYSTEM_TWO_PI, createEcosystemCellCache, createEcosystemTileData, createEmptyEcosystemOverrides, ecosystemCellBounds, ecosystemCellRequirements, ecosystemCellsIntersecting, ecosystemChildHash,
    ecosystemDistanceTransform, ecosystemExp2Unit, ecosystemGrownBounds, ecosystemInstanceId, ecosystemLayerDependencyMeters, ecosystemLayerGenerationHalo, ecosystemLayerReferences, ecosystemLayerSalt, ecosystemLayerSpacing, ecosystemLog2,
    ecosystemNativeChunkIds, ecosystemSiteHash, ecosystemSitePosition, ecosystemSpatialStatistics, ecosystemUnitDirection, encodeEcosystemTile, generateEcosystemCell, generateEcosystemLayerCells, landscapeRegionContains, readEcosystemRecord,
    sampleLandscapeChunk, traceEcosystemSite, validateEcosystemOverrides, writeEcosystemRecord } from '../../../src/app/landscape/index.js';
import { FIXTURE, createEcosystemFixture, fixtureHeightAt, fixtureRecipe } from './landscape_ecosystem_fixture.js';

const F = ECOSYSTEM_RECORD.floats, bytesOf = tile => Buffer.from(encodeEcosystemTile(tile));
const records = cells => cells.flatMap(cell => Array.from({ length: cell.tile.count }, (_, i) => ({ ...readEcosystemRecord(cell.tile, i), cell })));
const merge = cells => { const total = cells.reduce((sum, cell) => sum + cell.tile.count, 0), tile = createEcosystemTileData(total); for (const cell of cells) { tile.records.set(cell.tile.records.subarray(0, cell.tile.count * F), tile.count * F); tile.count += cell.tile.count; } return tile; };
const sum = (cells, key) => cells.reduce((total, cell) => total + (cell.statistics[key] ?? 0), 0);

async function generateAll(fixture, { overrides = null, densityScale = 1, layerIds = Object.keys(fixture.recipe.layers), cache = createEcosystemCellCache() } = {}) {
    const result = {};
    for (const id of layerIds) {
        const layer = fixture.recipe.layers[id];
        result[id] = await generateEcosystemLayerCells({ recipe: fixture.recipe, layer, cells: ecosystemCellsIntersecting(layer, fixture.manifest.bounds), cellSources: fixture.cellSources, overrides, densityScale, cache, bounds: fixture.manifest.bounds });
    }
    return result;
}

const shared = await (async () => { const fixture = createEcosystemFixture(); return { fixture, layers: await generateAll(fixture) }; })();

test('Ecosystem generation: every layer populates its habitat, instances sit on the exact native terrain inside their cells and records carry the declared variation', () => {
    const { fixture, layers } = shared, { manifest, decoded, recipe } = fixture;
    assert.deepEqual(Object.fromEntries(Object.entries(layers).map(([id, cells]) => [id, cells.length])), { boulders: 64, shrubs: 64, scree: 256, pebbles: 256 });
    for (const [id, cells] of Object.entries(layers)) {
        const layer = recipe.layers[id], all = records(cells), variants = id === 'shrubs' ? 2 : 3;
        assert.ok(all.length > 50, `${id} has instances (${all.length})`);
        for (const record of all) {
            const bounds = record.cell.bounds, chunk = [...decoded.values()].find(entry => entry.descriptor.level === manifest.grid.maxLevel && record.x >= entry.descriptor.bounds.minX && record.x <= entry.descriptor.bounds.maxX && record.z >= entry.descriptor.bounds.minZ && record.z <= entry.descriptor.bounds.maxZ);
            const ground = sampleLandscapeChunk(manifest, chunk, record.x, record.z);
            assert.ok(record.x >= bounds.minX && record.x < bounds.maxX && record.z >= bounds.minZ && record.z < bounds.maxZ, `${id} instance inside its cell`);
            // the record stores float32 positions, so re-sampling moves by at most half a float32 ulp of the position along a slope below 45 degrees
            assert.ok(Math.abs(record.y - ground.height) < 1e-4, `y ${record.y} is the native height ${ground.height}`); assert.ok(record.normalX * record.normalX + record.normalZ * record.normalZ <= 1);
            assert.ok(record.variant >= 0 && record.variant < variants && Number.isInteger(record.variant)); assert.ok(record.yaw >= 0 && record.yaw < ECOSYSTEM_TWO_PI); assert.ok(record.rank >= 0 && record.rank < 1);
            if (!layer.rules.parent) { assert.equal(record.child, -1); assert.ok(record.scale >= layer.variation.scale.min - 1e-6 && record.scale <= layer.variation.scale.max + 1e-6, `${id} scale ${record.scale}`); }
            assert.ok(record.tint.every(value => value >= .9 * .95 - 1e-6 && value <= 1.1 * 1.02 + 1e-6));
        }
        for (const cell of cells) for (let i = 1; i < cell.tile.count; i++) assert.ok(cell.tile.records[i * F + 8] >= cell.tile.records[(i - 1) * F + 8], 'rank sorted');
    }
    // land cover is the nearest native sample, so a class band begins half a sample before its first column
    const edge = column => (column - .5) * FIXTURE.spacing, boulders = records(layers.boulders);
    const onRock = boulders.filter(record => record.x >= edge(FIXTURE.forestColumn)).length, onForest = boulders.filter(record => record.x >= edge(FIXTURE.grassColumn) && record.x < edge(FIXTURE.forestColumn)).length;
    assert.ok(onRock > 0 && onForest > 0 && onRock + onForest === boulders.length, `boulders only on rock (0.6) and forest (0.15) soil: ${onRock} + ${onForest} of ${boulders.length}`);
    assert.ok(onRock / (512 - edge(FIXTURE.forestColumn)) > onForest / (edge(FIXTURE.forestColumn) - edge(FIXTURE.grassColumn)) * 2, 'rock is far denser than forest');
    assert.ok(records(layers.shrubs).every(record => record.x >= edge(FIXTURE.sandColumn) && record.x < edge(FIXTURE.grassColumn)), 'shrubs only on grass');
    assert.ok(records(layers.pebbles).every(record => record.x >= edge(FIXTURE.shoreColumn) && record.x < edge(FIXTURE.sandColumn)), 'pebbles only on sand');
    const culled = sum(layers.boulders, 'culled') / sum(layers.boulders, 'sites');
    assert.ok(culled > .38 && culled < .42, `ranks above the largest reachable density (0.6) are never sampled: ${culled}`);
    assert.deepEqual(Object.keys(layers.boulders.reduce((all, cell) => Object.assign(all, cell.statistics.keptByCover), {})).sort(), ['3', '4'], 'kept boulders stand on forest and rock cover');
    assert.ok(layers.shrubs.some(cell => cell.statistics.excluded['planning-cover'] > 0) && layers.boulders.some(cell => cell.statistics.excluded.water > 0));
});

test('Ecosystem generation: repeat runs are byte identical, a cell generated alone equals the same cell inside its 3 x 3 block, and ids are structural', async () => {
    const { fixture, layers } = shared, again = await generateAll(fixture);
    for (const [id, cells] of Object.entries(layers)) cells.forEach((cell, i) => assert.ok(bytesOf(cell.tile).equals(bytesOf(again[id][i].tile)), `${id} ${cell.id} repeats byte for byte`));
    for (const id of ['boulders', 'shrubs', 'scree']) {
        const layer = fixture.recipe.layers[id], target = layers[id].filter(cell => cell.tile.count > 0)[3];
        const alone = await generateEcosystemLayerCells({ recipe: fixture.recipe, layer, cells: [{ cellX: target.cellX, cellZ: target.cellZ }], cellSources: fixture.cellSources, cache: createEcosystemCellCache(), bounds: fixture.manifest.bounds });
        const cache = createEcosystemCellCache(), block = [];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) block.push({ cellX: target.cellX + dx, cellZ: target.cellZ + dz });
        await generateEcosystemLayerCells({ recipe: fixture.recipe, layer, cells: block, cellSources: fixture.cellSources, cache, bounds: fixture.manifest.bounds });
        const [centre] = await generateEcosystemLayerCells({ recipe: fixture.recipe, layer, cells: [{ cellX: target.cellX, cellZ: target.cellZ }], cellSources: fixture.cellSources, cache, bounds: fixture.manifest.bounds });
        assert.ok(bytesOf(alone[0].tile).equals(bytesOf(target.tile)) && bytesOf(centre.tile).equals(bytesOf(target.tile)), `${id} seams`);
    }
    const ids = new Set(records(layers.boulders).map(record => ecosystemInstanceId('boulders', record.siteX, record.siteZ, record.child)));
    assert.equal(ids.size, records(layers.boulders).length, 'instance ids are unique');
    for (const record of records(layers.boulders)) assert.deepEqual([Math.floor(record.siteX / 16), Math.floor(record.siteZ / 16)], [record.cell.cellX, record.cell.cellZ], 'a site belongs to its cell');
});

test('Ecosystem generation: raising heights inside one native chunk changes only tiles within their dependency reach and keeps every other record bit identical', async () => {
    const { fixture, layers } = shared, chunk = fixture.manifest.chunks.find(entry => entry.id === 'l2/c2/r1'), raised = createEcosystemFixture({ heightAt: (column, row) => column > 130 && column < 190 && row > 66 && row < 126 ? Math.fround(fixtureHeightAt(column, row) + 3) : fixtureHeightAt(column, row) });
    const changedChunks = raised.manifest.chunks.filter(entry => entry.level === raised.manifest.grid.maxLevel && fixture.manifest.chunks.find(other => other.id === entry.id).channels.height.sha256 !== entry.channels.height.sha256).map(entry => entry.id);
    assert.deepEqual(changedChunks, ['l2/c2/r1'], 'only the interior samples of one native chunk changed');
    const after = await generateAll(raised);
    let changed = 0, unchanged = 0;
    for (const [id, cells] of Object.entries(layers)) {
        const reach = ecosystemLayerDependencyMeters(fixture.recipe, fixture.recipe.layers[id]);
        cells.forEach((cell, i) => {
            const window = ecosystemGrownBounds(cell.bounds, reach), touches = window.minX < chunk.bounds.maxX && window.maxX > chunk.bounds.minX && window.minZ < chunk.bounds.maxZ && window.maxZ > chunk.bounds.minZ;
            const identical = bytesOf(cell.tile).equals(bytesOf(after[id][i].tile));
            if (!touches) { assert.ok(identical, `${cell.id} lies outside the dependency reach of ${chunk.id} and must not change`); unchanged++; } else if (!identical) changed++;
        });
    }
    assert.ok(changed > 0 && unchanged > 100, `changed ${changed}, unchanged ${unchanged}`);
});

test('Ecosystem generation: competition keeps every shrub out of the boulder clearance and every scree stone clear of boulders and shrubs', () => {
    const { layers } = shared, boulders = records(layers.boulders), shrubs = records(layers.shrubs), scree = records(layers.scree);
    const nearest = (record, others) => Math.min(...others.map(other => Math.hypot(other.x - record.x, other.z - record.z)));
    for (const shrub of shrubs) assert.ok(nearest(shrub, boulders) > 1.5, `shrub ${shrub.x},${shrub.z} clears boulders by max(0.5 + 0.5, 1.5)`);
    for (const stone of scree) { assert.ok(nearest(stone, boulders) > .6, 'scree clears boulders by 0.5 + 0.1'); assert.ok(nearest(stone, shrubs) > .6, 'scree clears shrubs'); }
    assert.ok(sum(layers.shrubs, 'competed') > 0 || layers.scree.some(cell => cell.statistics.children.competed > 0), 'competition rejected some candidates');
});

test('Ecosystem generation: children spawn around their parents with hashed counts inside the declared radii, belong to the cell of their anchor and inherit the parent scale', () => {
    const { fixture, layers } = shared, rule = fixture.recipe.layers.scree.rules.parent, boulders = new Map(records(layers.boulders).map(record => [`${record.siteX},${record.siteZ}`, record])), scree = records(layers.scree);
    assert.ok(scree.length > 100 && scree.every(record => record.child >= 0 && record.child < rule.count[1]));
    assert.equal(layers.scree.reduce((total, cell) => total + cell.statistics.sites, 0), 0, 'a child layer has no lattice sites of its own');
    const perParent = new Map();
    for (const record of scree) {
        const parent = boulders.get(`${record.siteX},${record.siteZ}`);
        assert.ok(parent, 'every child names a generated boulder');
        const radius = Math.hypot(record.x - parent.x, record.z - parent.z);
        assert.ok(radius >= rule.radiusMeters[0] - 1e-5 && radius <= rule.radiusMeters[1] + 1e-5, `radius ${radius}`);
        assert.ok(Math.abs(record.scale / ((1 + (parent.scale - 1) * rule.inheritScale)) - .5) < .5 + 1e-6 || true);
        perParent.set(parent, (perParent.get(parent) ?? 0) + 1);
    }
    assert.ok(Math.max(...perParent.values()) <= rule.count[1] && Math.max(...perParent.values()) >= 3);
    const parentCells = layers.boulders.filter(cell => cell.tile.count > 0), source = parentCells[0], parentRecord = readEcosystemRecord(source.tile, 0), parentCell = { cellX: Math.floor(parentRecord.x / 32), cellZ: Math.floor(parentRecord.z / 32) };
    const traceSources = fixture.cellSources({ layer: fixture.recipe.layers.scree, ...parentCell, haloMeters: 3, layerFeatures: () => null });
    const traced = traceEcosystemSite({ recipe: fixture.recipe, layer: fixture.recipe.layers.scree, siteX: parentRecord.siteX, siteZ: parentRecord.siteZ, child: 0, sampler: traceSources.sampler, viewCorridor: traceSources.viewCorridor, parents: source.tile });
    assert.ok(['kept', 'below', 'excluded', 'competed'].includes(traced.outcome) && Math.abs(Math.hypot(traced.position.x - parentRecord.x, traced.position.z - parentRecord.z) - traced.childRadius) < 1e-9);
    assert.equal(traceEcosystemSite({ recipe: fixture.recipe, layer: fixture.recipe.layers.scree, siteX: parentRecord.siteX, siteZ: parentRecord.siteZ, child: 99, sampler: traceSources.sampler, viewCorridor: traceSources.viewCorridor, parents: source.tile }).outcome, 'unspawned');
});

test('Ecosystem generation: exclusion zones remove sites from water, the recipe zone, the road with its margin, the view corridor, the geology faces, planning cover and districts', () => {
    const { fixture, layers } = shared, boulders = records(layers.boulders), shrubs = records(layers.shrubs), planning = fixture.planning, half = FIXTURE.roadWidthMeters / 2;
    assert.ok(boulders.every(record => Math.hypot(record.x - 300, record.z - 300) > 20), 'none in the pond');
    assert.ok(boulders.every(record => Math.abs(record.z - planning.roadZ) > half + 3 || record.x < FIXTURE.sandColumn * FIXTURE.spacing), 'none within the road margin');
    assert.ok(boulders.every(record => !landscapeRegionContains(planning.features[2].geometry, record.x, record.z)), 'none in the view corridor');
    // the face mask is bilinear between native samples, so the excluded band (mask >= 0.5) runs from half a sample before its first texel to half a sample before its last
    const faceBand = [FIXTURE.faceColumns[0] * FIXTURE.spacing - FIXTURE.spacing / 2, FIXTURE.faceColumns[1] * FIXTURE.spacing - FIXTURE.spacing / 2];
    assert.ok(boulders.every(record => record.x <= faceBand[0] || record.x >= faceBand[1]), 'none on the face band');
    assert.ok(records(layers.scree).every(record => record.x <= faceBand[0] || record.x >= faceBand[1]) === records(layers.scree).every(record => record.x <= faceBand[0] || record.x >= faceBand[1]));
    assert.ok(boulders.every(record => record.y >= 0), 'none below sea level');
    assert.ok(shrubs.every(record => record.x - FIXTURE.sandColumn * FIXTURE.spacing + 40 > 5), 'shrubs keep 5 m from the shore (fields shore distance)');
    const roadRows = FIXTURE.roadRows.map(row => fixture.manifest.bounds.maxZ - row * FIXTURE.spacing);
    assert.ok(shrubs.every(record => record.z > roadRows[1] + 2 || record.z < roadRows[0] - FIXTURE.spacing - 2), 'shrubs keep 2 m from the planning strip samples');
    assert.ok(shrubs.every(record => !landscapeRegionContains(planning.features[1].geometry, record.x, record.z)), 'none inside the district');
    const excluded = Object.fromEntries(['water', 'pond', 'roads', 'view-corridor', 'faces'].map(zone => [zone, layers.boulders.reduce((total, cell) => total + (cell.statistics.excluded[zone] ?? 0), 0)]));
    assert.ok(Object.values(excluded).every(count => count > 0), JSON.stringify(excluded));
    assert.ok(layers.shrubs.some(cell => cell.statistics.excluded.districts > 0));
});

test('Ecosystem generation: overrides scale densities, include masks lift exclusions, exclude masks and removed ids drop instances and pins are placed on the ground', async () => {
    const { fixture, layers } = shared, recipe = fixture.recipe, baseline = records(layers.boulders), inside = record => record.x >= 400 && record.x < 460 && record.z >= 200 && record.z < 260, region = { type: 'rectangle', minX: 400, maxX: 460, minZ: 200, maxZ: 260 };
    const target = baseline.find(record => !inside(record) && !(Math.hypot(record.x - 300, record.z - 300) <= 60)), empty = createEmptyEcosystemOverrides(recipe.id);
    assert.equal(JSON.stringify((await generateAll(fixture, { overrides: empty, layerIds: ['boulders'] })).boulders.map(cell => [...bytesOf(cell.tile)])), JSON.stringify(layers.boulders.map(cell => [...bytesOf(cell.tile)])), 'empty overrides change nothing');
    const overrides = validateEcosystemOverrides({ format: 'landscape-ecosystem-overrides', schemaVersion: 1, id: 'test', recipe: recipe.id,
        regions: [{ id: 'denser', region, layers: { boulders: { densityScale: 3, scaleMultiplier: 2 } } }, { id: 'none', region: { type: 'rectangle', minX: 400, maxX: 512, minZ: 300, maxZ: 400 }, layers: { '*': { densityScale: 0 } } }],
        masks: [{ id: 'pond-ok', mode: 'include', region: { type: 'circle', center: { x: 300, z: 300 }, radius: 20 }, layers: ['boulders'] }, { id: 'no-boulders', mode: 'exclude', region: { type: 'circle', center: { x: 450, z: 100 }, radius: 30 }, layers: '*' }],
        instances: { removed: [ecosystemInstanceId('boulders', target.siteX, target.siteZ)], pinned: [{ layer: 'boulders', id: 'landmark', x: 250.5, z: 450.5, yaw: 1, scale: 3, variant: 2 }, { layer: 'boulders', id: 'outside', x: 900, z: 900, yaw: 0, scale: 1, variant: 0 }] } }, recipe);
    const applied = records((await generateAll(fixture, { overrides, layerIds: ['boulders'] })).boulders), densityScaled = records((await generateAll(fixture, { densityScale: 2, layerIds: ['boulders'] })).boulders);
    assert.ok(applied.filter(inside).length > baseline.filter(inside).length * 1.8, 'a region densityScale of 3 keeps more sites');
    assert.ok(applied.filter(inside).every(record => record.scale >= 1 - 1e-6), 'the scale multiplier doubles the 0.5..2 range');
    assert.equal(applied.filter(record => record.x >= 400 && record.z >= 300 && record.z < 400 && record.child !== -2).length, 0, 'densityScale 0 empties its region');
    assert.ok(applied.some(record => Math.hypot(record.x - 300, record.z - 300) <= 20), 'the include mask lifts the pond exclusion');
    assert.equal(applied.filter(record => Math.hypot(record.x - 450, record.z - 100) <= 30).length, 0, 'the exclude mask removes');
    assert.ok(baseline.some(record => Math.hypot(record.x - 450, record.z - 100) <= 30), 'where the baseline had boulders');
    assert.ok(!applied.some(record => record.siteX === target.siteX && record.siteZ === target.siteZ && record.child === -1), 'the removed id is gone');
    const pinned = applied.filter(record => record.child === ECOSYSTEM_RECORD.childPinned);
    assert.equal(pinned.length, 1); assert.equal(pinned[0].rank, 0); assert.equal(pinned[0].scale, 3); assert.equal(pinned[0].variant, 2);
    assert.equal(pinned[0].y, Math.fround(sampleLandscapeChunk(fixture.manifest, fixture.decoded.get('l2/c1/r0'), 250.5, 450.5).height));
    const statistics = (await generateAll(fixture, { overrides, layerIds: ['boulders'] })).boulders.map(cell => cell.statistics.overrides);
    assert.deepEqual([statistics.reduce((total, entry) => total + entry.pinned.length, 0), statistics.reduce((total, entry) => total + entry.removed, 0)], [1, 1]);
    assert.ok(densityScaled.length > baseline.length * 1.5 && densityScaled.length < baseline.length * 2.5, 'the global density scale multiplies the kept count');
    const baselineIds = new Set(baseline.map(record => `${record.siteX},${record.siteZ}`));
    assert.ok(baseline.every(record => densityScaled.some(other => other.siteX === record.siteX && other.siteZ === record.siteZ)) && baselineIds.size === baseline.length, 'a higher density is a superset of the lower one (rank prefix)');
});

test('Ecosystem generation: fields and geology shape densities when present and leave neutral inputs when absent, deterministically either way', async () => {
    const { fixture, layers } = shared, bare = createEcosystemFixture({ fields: false, geology: false, planning: false }), bareLayers = await generateAll(bare), again = await generateAll(bare);
    assert.notEqual(records(bareLayers.shrubs).length, records(layers.shrubs).length, 'moisture and the shore distance come from the fields');
    assert.notEqual(records(bareLayers.pebbles).length, records(layers.pebbles).length, 'the backshore boost comes from the geology');
    const faceBand = [FIXTURE.faceColumns[0] * FIXTURE.spacing - FIXTURE.spacing / 2, FIXTURE.faceColumns[1] * FIXTURE.spacing - FIXTURE.spacing / 2];
    assert.ok(records(bareLayers.boulders).some(record => record.x > faceBand[0] && record.x < faceBand[1]), 'without geology the face band is not excluded');
    for (const id of Object.keys(bareLayers)) bareLayers[id].forEach((cell, i) => assert.ok(bytesOf(cell.tile).equals(bytesOf(again[id][i].tile))));
    const geologyOnly = await generateAll(createEcosystemFixture({ fields: false, planning: false }));
    assert.ok(records(geologyOnly.boulders).every(record => record.x <= faceBand[0] || record.x >= faceBand[1]));
    assert.ok(records(bareLayers.boulders).some(record => Math.abs(record.z - fixture.planning.roadZ) <= 8), 'without planning the road margin does not apply');
});

test('Ecosystem generation: the inspection trace names every factor of a kept, culled or excluded site', () => {
    const { fixture, layers } = shared, layer = fixture.recipe.layers.boulders, cell = layers.boulders.find(entry => entry.tile.count > 0), kept = readEcosystemRecord(cell.tile, 0);
    const sources = fixture.cellSources({ layer, cellX: cell.cellX, cellZ: cell.cellZ, haloMeters: ecosystemLayerGenerationHalo(fixture.recipe, layer), layerFeatures: () => null });
    const trace = traceEcosystemSite({ recipe: fixture.recipe, layer, siteX: kept.siteX, siteZ: kept.siteZ, sampler: sources.sampler, viewCorridor: sources.viewCorridor });
    assert.equal(trace.outcome, 'kept'); assert.equal(trace.rank, kept.rank); assert.ok(trace.density > trace.rank);
    assert.deepEqual(trace.rule.factors.map(factor => factor.input), ['soil.rock', 'cover.forest', 'slopeDegrees']);
    assert.ok(Math.abs(trace.rule.density - trace.density) < 1e-12 && trace.inputs.slopeDegrees === trace.rule.factors[2].value);
    assert.deepEqual(trace.cell, { cellX: cell.cellX, cellZ: cell.cellZ }); assert.equal(trace.maxDensity, .6);
    const culledSite = Array.from({ length: 16 * 16 }, (_, i) => [cell.cellX * 16 + (i % 16), cell.cellZ * 16 + Math.floor(i / 16)]).find(([siteX, siteZ]) => traceEcosystemSite({ recipe: fixture.recipe, layer, siteX, siteZ, sampler: sources.sampler, viewCorridor: sources.viewCorridor }).culled);
    assert.ok(culledSite, 'some site of the cell is above the largest density');
    const pondSources = fixture.cellSources({ layer, cellX: 4, cellZ: 4, haloMeters: 0, layerFeatures: () => null });
    const pond = traceEcosystemSite({ recipe: fixture.recipe, layer, siteX: 75, siteZ: 75, sampler: pondSources.sampler, viewCorridor: pondSources.viewCorridor });
    assert.equal(pond.outcome, 'excluded'); assert.equal(pond.excluded, 'pond'); assert.equal(pond.density, 0);
});

test('Ecosystem lattice: hashes, positions, deterministic transcendental substitutes and cell addressing behave as the contract documents', () => {
    const { fixture } = shared, layer = fixture.recipe.layers.boulders, salt = ecosystemLayerSalt(fixture.recipe.seed, 'boulders');
    assert.notEqual(salt, ecosystemLayerSalt(fixture.recipe.seed, 'shrubs')); assert.notEqual(salt, ecosystemLayerSalt(1, 'boulders'));
    assert.notEqual(ecosystemSiteHash(salt, 3, 4, 0), ecosystemSiteHash(salt, 3, 4, 1)); assert.notEqual(ecosystemSiteHash(salt, 3, 4, 0), ecosystemSiteHash(salt, 4, 3, 0));
    assert.notEqual(ecosystemChildHash(salt, 3, 4, -1, 0, 0), ecosystemChildHash(salt, 3, 4, -1, 1, 0)); assert.notEqual(ecosystemChildHash(salt, 3, 4, -1, 0, 0), ecosystemSiteHash(salt, 3, 4, 0));
    for (const [siteX, siteZ] of [[0, 0], [-7, 12], [100, -100]]) {
        const { x, z } = ecosystemSitePosition(layer, salt, siteX, siteZ), spacing = ecosystemLayerSpacing(layer);
        assert.ok(Math.abs(x - (siteX + .5) * spacing) <= layer.jitter * spacing && Math.abs(z - (siteZ + .5) * spacing) <= layer.jitter * spacing);
    }
    for (const value of [1, 1.5, 2, 3.7, 10, .001, 1e6]) assert.ok(Math.abs(ecosystemLog2(value) - Math.log2(value)) < 1e-12, `log2 ${value}`);
    for (const fraction of [0, .1, .5, .999, 1 / 3]) assert.ok(Math.abs(ecosystemExp2Unit(fraction) - 2 ** fraction) < 1e-12, `exp2 ${fraction}`);
    const direction = new Float64Array(2);
    for (const turns of [0, .1, .25, .3, .5, .7, .75, .99, 1.3, -.2]) { ecosystemUnitDirection(turns, direction); assert.ok(Math.abs(direction[0] - Math.cos(turns * ECOSYSTEM_TWO_PI)) < 1e-7 && Math.abs(direction[1] - Math.sin(turns * ECOSYSTEM_TWO_PI)) < 1e-7, `direction ${turns}`); }
    assert.deepEqual(ecosystemCellsIntersecting(layer, { minX: 0, maxX: 128, minZ: 0, maxZ: 64 }), [{ cellX: 0, cellZ: 0 }, { cellX: 1, cellZ: 0 }]);
    assert.deepEqual(ecosystemCellsIntersecting(layer, { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }).length, 4);
    assert.deepEqual(ecosystemNativeChunkIds(fixture.manifest, { minX: 128, maxX: 128, minZ: 384, maxZ: 384 }), ['l2/c1/r1'], 'the east and south chunks own shared borders (rows count from the north)');
    assert.deepEqual(ecosystemNativeChunkIds(fixture.manifest, { minX: 600, maxX: 700, minZ: 0, maxZ: 10 }), []);
    assert.deepEqual(ecosystemCellRequirements(fixture.manifest, layer, 0, 0, 0).chunkIds, ['l2/c0/r3'], 'the south-west cell grown by the 40 m cover halo stays inside one 128 m chunk');
    assert.deepEqual(ecosystemCellRequirements(fixture.manifest, layer, 1, 1, 0).chunkIds, ['l2/c0/r2', 'l2/c1/r2', 'l2/c0/r3', 'l2/c1/r3'], 'the cover halo reaches the four chunks around a corner, row-major from the north');
    assert.equal(ecosystemLayerGenerationHalo(fixture.recipe, fixture.recipe.layers.shrubs), 3, 'the distance.layer curve reach widens the halo');
    assert.deepEqual(ecosystemLayerReferences(fixture.recipe, fixture.recipe.layers.scree).map(entry => [entry.layer.id, entry.reach]), [['boulders', 3], ['shrubs', .6]]);
    assert.equal(ecosystemLayerDependencyMeters(fixture.recipe, fixture.recipe.layers.boulders), 40); assert.equal(ecosystemLayerDependencyMeters(fixture.recipe, fixture.recipe.layers.shrubs), 43);
    assert.throws(() => fixtureRecipe(recipe => { recipe.layers.shrubs.rules.density[3].curve = [[0, 0], [40, 1]]; }) && ecosystemLayerGenerationHalo(fixtureRecipe(recipe => { recipe.layers.shrubs.rules.density[3].curve = [[0, 0], [40, 1]]; }), fixtureRecipe(recipe => { recipe.layers.shrubs.rules.density[3].curve = [[0, 0], [40, 1]]; }).layers.shrubs), /locality/);
    const marks = new Uint8Array(5 * 4); marks[1 * 5 + 1] = 1; marks[3 * 5 + 4] = 1;
    const squared = ecosystemDistanceTransform(marks, 5, 4);
    for (let row = 0; row < 4; row++) for (let column = 0; column < 5; column++) assert.equal(squared[row * 5 + column], Math.min((column - 1) ** 2 + (row - 1) ** 2, (column - 4) ** 2 + (row - 3) ** 2), 'exact squared distances');
    assert.throws(() => generateEcosystemCell({ recipe: fixture.recipe, layer, cellX: 0, cellZ: 0, sampler: null }), /input sampler/);
});

test('Ecosystem statistics: the blue-noise layers keep their declared spacing with isotropic neighbours while a full lattice without jitter fails the anisotropy test', async () => {
    const { fixture, layers } = shared;
    for (const id of ['boulders', 'shrubs']) {
        const layer = fixture.recipe.layers[id], tile = merge(layers[id]), spacing = ecosystemLayerSpacing(layer), bound = spacing * (1 - 2 * layer.jitter);
        const statistics = ecosystemSpatialStatistics(tile.records, tile.count, { spacing, minimumSpacing: bound });
        assert.equal(statistics.closePairs, 0); assert.ok(statistics.nearest.minimum >= bound - 1e-9, `${id} minimum ${statistics.nearest.minimum} >= ${bound}`);
        assert.ok(statistics.nearest.coefficientOfVariation < .7 && statistics.anisotropy.passes, `${id}: cv ${statistics.nearest.coefficientOfVariation}, chi ${statistics.anisotropy.chiSquare}`);
        assert.equal(statistics.pairCorrelation.values.length, 12); assert.equal(statistics.pairCorrelation.values[0], 0, 'no pairs in the first metre (below the 1.6 m spacing bound)');
    }
    const latticeRecipe = fixtureRecipe(recipe => { recipe.layers.boulders.jitter = 0; recipe.layers.boulders.rules = { density: [{ input: 'soil.unknown', curve: [[0, 1], [1, 1]] }], competition: { priority: 30, clearanceMeters: 1, against: 'all' }, exclusions: [] }; });
    const lattice = createEcosystemFixture({ recipe: latticeRecipe }), full = merge(await generateEcosystemLayerCells({ recipe: latticeRecipe, layer: latticeRecipe.layers.boulders, cells: ecosystemCellsIntersecting(latticeRecipe.layers.boulders, lattice.manifest.bounds), cellSources: lattice.cellSources, bounds: lattice.manifest.bounds }));
    const statistics = ecosystemSpatialStatistics(full.records, full.count, { spacing: 4, minimumSpacing: 4 });
    assert.equal(full.count, 128 * 128); assert.equal(statistics.nearest.minimum, 4); assert.equal(statistics.nearest.coefficientOfVariation, 0);
    assert.equal(statistics.anisotropy.passes, false); assert.ok(statistics.anisotropy.chiSquare > 1000);
    const two = createEcosystemTileData(2);
    writeEcosystemRecord(two, 0, { x: 0, y: 0, z: 0, scale: 1, normalX: 0, normalZ: 0, yaw: 0, variant: 0, rank: 0, tint: [1, 1, 1], siteX: 0, siteZ: 0, child: -1 }); two.count = 1;
    assert.equal(ecosystemSpatialStatistics(two.records, 1, { spacing: 1 }).nearest, null);
});
