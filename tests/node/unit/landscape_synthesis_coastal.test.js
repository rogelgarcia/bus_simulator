// Verifies the geology (strata, terraces) and coastal (headland, cove, exposure, bluff, beach, foredune, nearshore bar, reef) synthesis operators on a synthetic straight coast.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { TerrainFieldMemory } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsGrid.mjs';
import { executeSynthesisRecipe } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisGraph.mjs';
import { sampleHeight } from '../../../tools/bake_landscape/terrain_synthesis/operators/Landforms.mjs';
import { beachProfile, COASTAL_ZONE } from '../../../tools/bake_landscape/terrain_synthesis/operators/Coastal.mjs';
import { slopeDegreesRaster } from '../../../tools/bake_landscape/terrain_synthesis/analysis/GridSampling.mjs';
import { composeSheet, createCanvas, renderHillshade, renderProfilePlot, resampleNearest, rgbOf, writeReviewPng } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisReview.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = path.join(root, 'tests/artifacts/screens/landscape/ai596/d2/operators');
await mkdir(evidence, { recursive: true });
const DEGREES = Math.PI / 180, sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const op = (id, type, params = {}, mask = null) => ({ id, op: type, params, mask, seed: null, enabled: true });
const gridOf = (chunkIntervals, maxLevel, spacing, minX = 0, minZ = 0) => {
    const intervals = chunkIntervals * 2 ** maxLevel;
    return { columns: intervals + 1, rows: intervals + 1, spacingX: spacing, spacingZ: spacing, bounds: { minX, maxX: minX + intervals * spacing, minZ, maxZ: minZ + intervals * spacing }, chunkIntervals, maxLevel };
};
const recipeOf = (grid, operators, { working = null, plan = true, seed = 11, landscape = { directory: 'synthetic', expectedRevision: null } } = {}) => ({
    format: 'landscape-synthesis-recipe', schemaVersion: 1, id: 'coastal-test', seed, seaLevel: 0, grid, working,
    inputs: { landscape, plan: plan ? { districts: 'd.json', roads: 'r.json', shoreline: 's.json', beachPoints: 'b.json', landCover: null } : null, imports: [] },
    operators, outputs: { heightCap: null, coverPolicy: 'keep-source', channels: ['height'] }, overrides: []
});
const sourceOf = (heightAt, coverAt = () => 2) => (binding, { memory, output }) => {
    const n = output.columns * output.rows, heights = memory.allocate('source/heights', Float32Array, n), cover = memory.allocate('source/cover', Uint8Array, n);
    for (let r = 0; r < output.rows; r++) for (let c = 0; c < output.columns; c++) {
        const x = output.minX + c * output.spacingX, z = output.maxZ - r * output.spacingZ;
        heights[r * output.columns + c] = heightAt(x, z); cover[r * output.columns + c] = coverAt(x, z);
    }
    return { grid: output, heights, cover, tracked: ['source/heights', 'source/cover'], sha256: 'ab'.repeat(32) };
};
const ORDER = 'X east, Y elevation, Z north; metres';
// a 512 m straight coast: design shoreline at x = 300 with the sea to the west, two districts, one road along z = 30, the plan beach points and an open-view corridor on the backshore
const SHORE_X = 300, EXTENT = 512;
const planOf = ({ districts = null, corridor = [[330, 200], [400, 200], [400, 160], [330, 160]] } = {}) => ({
    districts: districts ?? [{ id: 1, name: 'Hill town', target_elevation_m: 12, typical_design_band_m: '11-13', boundary_xz_m: [[420, 470], [500, 470], [500, 400], [420, 400]] },
        { id: 2, name: 'Shore pad', target_elevation_m: 5, typical_design_band_m: '4-6', boundary_xz_m: [[350, 300], [420, 300], [420, 260], [350, 260]] }],
    roads: { coordinate_order: ORDER, roads: [{ name: 'Main', from: 'A', to: 'B', width_m: 7, type: 'collector', length_m: 140, design_max_grade_percent: 1, centerline_xyz_m: Array.from({ length: 36 }, (_, i) => [360 + i * 4, 1, 30]) }] },
    shoreline: { coordinate_order: 'X east, Y sea level, Z north; metres', points_xyz_m: Array.from({ length: 33 }, (_, i) => [SHORE_X, 0, EXTENT - i * 16]) },
    beachPoints: { coordinate_order: ORDER, points: [{ name: 'Bus stop reservation', xyz_m: [330, 2.6, 100], footprint_m: [30, 6] }, { name: 'Level beach arrival', xyz_m: [320, 2.6, 80] }], open_view_corridor_xz_m: corridor }
});
const GRID = gridOf(64, 2, 2);
const run = (recipe, inputs, options = {}) => executeSynthesisRecipe({ recipe, inputs, memory: new TerrainFieldMemory(512 << 20), ...options });
const at = (result, x, z) => sampleHeight(result.grid, result.heights, x, z);
const index = (result, x, z) => Math.round((result.grid.maxZ - z) / result.grid.spacingZ) * result.grid.columns + Math.round((x - result.grid.minX) / result.grid.spacingX);
const layerAt = (result, name, x, z) => result.layers[name][index(result, x, z)];
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const beachTerrain = x => x < SHORE_X ? -.5 : .04 * (x - SHORE_X);
const beachCover = x => x < SHORE_X ? 0 : x < 360 ? 1 : 2;
const terraceTerrain = x => x < SHORE_X ? -2 : x < 376 ? 1 : x < 380 ? 1 + 14 * (x - 376) / 4 : 15;
const deanTerrain = x => x < SHORE_X ? -.1 * Math.cbrt((SHORE_X - x) ** 2) - .05 : .04 * (x - SHORE_X);
const PLAN = op('plan', 'plan-inputs', { apronPolygon: null, runwayPolygon: null });
const statisticsOf = (result, id) => result.report.operators.find(entry => entry.id === id).statistics;
const assertInvariant = result => {
    const { heights, layers } = result;
    for (let i = 0; i < heights.length; i++) assert.ok(Math.abs(heights[i] - (layers.bedrock[i] + layers.regolith[i] + layers.depositThickness[i])) < 2e-3, `height invariant at sample ${i}: ${heights[i]} vs ${layers.bedrock[i]} + ${layers.regolith[i]} + ${layers.depositThickness[i]}`);
};
const ZONE_COLORS = ['#f4f1e8', '#1c526f', '#7b2cbf', '#3fbf8f', '#2b6ca3', '#9ed0ce', '#efe0b5', '#d8d8a0', '#f5e663', '#8c8c80', '#5a4a2c', '#d62728', '#729d83'].map(rgbOf);
function categoryMap(grid, values, size, colors) {
    const resampled = resampleNearest(grid, values, size), canvas = createCanvas(size, size);
    for (let i = 0; i < size * size; i++) { const color = colors[resampled[i] % colors.length]; canvas.data[i * 3] = color[0]; canvas.data[i * 3 + 1] = color[1]; canvas.data[i * 3 + 2] = color[2]; }
    return canvas;
}
async function review(name, result, before, extra = []) {
    const directory = path.join(evidence, name), options = { size: 256, verticalExaggeration: 2, seaLevel: 0 };
    const earlier = renderHillshade(result.grid, before, options), later = renderHillshade(result.grid, result.heights, options);
    await writeReviewPng(path.join(directory, 'before.png'), earlier);
    await writeReviewPng(path.join(directory, 'after.png'), later);
    const entries = [{ image: earlier, label: `${name} before` }, { image: later, label: `${name} after` }];
    if (result.layers.coastalZone) { const zones = categoryMap(result.grid, result.layers.coastalZone, 256, ZONE_COLORS); await writeReviewPng(path.join(directory, 'zones.png'), zones); entries.push({ image: zones, label: 'coastalZone' }); }
    for (const entry of extra) { await writeReviewPng(path.join(directory, entry.file), entry.image); entries.push({ image: entry.image, label: entry.label }); }
    await writeReviewPng(path.join(directory, 'sheet.png'), composeSheet(entries, { columns: Math.min(3, entries.length) }));
}
const sourceHeights = async (terrain, cover) => { const base = await run(recipeOf(GRID, [op('import', 'import-heights')], { plan: false }), { readLandscape: sourceOf(terrain, cover) }); const copy = Float32Array.from(base.heights); base.release(); return copy; };

test('Coastal synthesis: strata index is periodic in the stack level, follows the dip and cycles the hardness pattern', async () => {
    const slope = x => .4 * x, geometry = { origin: [0, 0], thicknessMeters: 6, warpMeters: 0, hardnessNoise: 0, hardnessPattern: [.9, .3] };
    const flat = await run(recipeOf(GRID, [op('import', 'import-heights'), op('strata', 'strata', geometry)], { plan: false }), { readLandscape: sourceOf(slope) });
    const statistics = statisticsOf(flat, 'strata');
    assert.equal(statistics.sourceLayer, 'height'); assert.equal(statistics.periodMeters, 6); assert.equal(statistics.strataPerCycle, 1);
    let checked = 0;
    for (let x = 0; x <= 512; x += 2) {
        const level = slope(x) / 6;
        if (Math.abs(level - Math.round(level)) < .01) continue;
        const expected = Math.floor(level);
        assert.equal(layerAt(flat, 'lithology', x, 256), 1 + expected % 255, `lithology at x=${x}`);
        assert.ok(Math.abs(layerAt(flat, 'hardness', x, 256) - [.9, .3][expected % 2]) < 1e-6, `hardness at x=${x}`);
        checked++;
    }
    assert.ok(checked > 200);
    assert.ok(statistics.strataSeen >= 34 && statistics.indexRange[0] === 0, `strata seen ${statistics.strataSeen}`);
    flat.release();
    // beds rising 100 m/km toward east: the level is 0.3 x instead of 0.4 x, so the boundaries come every 20 m instead of 15 m
    const dipped = await run(recipeOf(GRID, [op('import', 'import-heights'), op('strata', 'strata', { ...geometry, dipEastMetersPerKm: 100 })], { plan: false }), { readLandscape: sourceOf(slope) });
    for (let x = 0; x <= 512; x += 2) {
        const level = (slope(x) - .1 * x) / 6;
        if (Math.abs(level - Math.round(level)) < .01) continue;
        assert.equal(layerAt(dipped, 'lithology', x, 256), 1 + Math.floor(level) % 255, `dipped lithology at x=${x}`);
    }
    assert.equal(layerAt(dipped, 'lithology', 100, 256), layerAt(dipped, 'lithology', 100, 40), 'no north dip: rows agree');
    dipped.release();
    // a thickness pattern [1, 2] cycles 6 m and 12 m strata (period 18 m) and negative levels below the origin index downward
    const patterned = await run(recipeOf(GRID, [op('import', 'import-heights'), op('strata', 'strata', { ...geometry, thicknessPattern: [1, 2], offsetMeters: 30 })], { plan: false }), { readLandscape: sourceOf(slope) });
    assert.equal(statisticsOf(patterned, 'strata').periodMeters, 18);
    assert.equal(layerAt(patterned, 'lithology', 10, 256), 1 + (255 - 3), 'level -26 m lies in stratum -3 (the 12 m bed of cycle -2, levels -30..-18)');
    assert.equal(layerAt(patterned, 'lithology', 80, 256), 1, 'level 2 m: stratum 0 (6 m)'); assert.equal(layerAt(patterned, 'lithology', 100, 256), 2, 'level 10 m: stratum 1 (12 m)'); assert.equal(layerAt(patterned, 'lithology', 130, 256), 3, 'level 22 m: stratum 2');
    const lithologyMap = categoryMap(patterned.grid, patterned.layers.lithology, 256, ZONE_COLORS);
    await writeReviewPng(path.join(evidence, 'strata', 'lithology.png'), lithologyMap);
    const hardness = Float32Array.from(patterned.layers.hardness, value => Math.round(value * 12));
    await writeReviewPng(path.join(evidence, 'strata', 'sheet.png'), composeSheet([{ image: lithologyMap, label: 'strata lithology (pattern [1, 2], offset 30 m)' }, { image: categoryMap(patterned.grid, hardness, 256, ['#101010', '#303030', '#505050', '#707070', '#909090', '#b0b0b0', '#d0d0d0', '#f0f0f0'].map(rgbOf)), label: 'strata hardness' }]));
    patterned.release();
});

test('Coastal synthesis: terraces cut benches onto hard strata (bimodal slopes) and conserve the cut rock as talus with the height invariant', async () => {
    const slope = x => .4 * x, geometry = { origin: [0, 0], thicknessMeters: 6, warpMeters: 0, hardnessPattern: [.9, .3] }, terrace = { ...geometry, hardThreshold: .6, minSlopeDegrees: 15, benchWidthMeters: 12, strength: 1 };
    const before = await sourceHeights(slope);
    const benches = await run(recipeOf(GRID, [op('import', 'import-heights'), op('strata', 'strata', { ...geometry, hardnessNoise: 0 }), op('terraces', 'terraces', { ...terrace, depositTalus: false })], { plan: false }), { readLandscape: sourceOf(slope) });
    const statistics = statisticsOf(benches, 'terraces');
    assert.ok(statistics.benchSamples > 10000 && statistics.talusSamples === 0 && statistics.massBalanceCubicMeters === statistics.cutVolumeCubicMeters, JSON.stringify(statistics));
    // the soft 6 m bed above each hard bed (odd stratum index) is cut to the hard top over the first 8.4 m of its 15 m run (the riser fades in over the last 3.6 m): grid samples x = 15k + 1..7 of every odd bed sit on the bench
    for (let k = 1; k < 16; k += 2) for (let d = 1; d <= 7; d += 2) assert.ok(Math.abs(at(benches, 15 * k + d, 256) - 6 * k) < 1e-3, `bench of stratum ${k} at +${d} m: ${at(benches, 15 * k + d, 256)} vs ${6 * k}`);
    for (let k = 1; k < 16; k += 2) assert.ok(at(benches, 15 * k + 13, 256) > at(benches, 15 * k + 9, 256) + 1 && at(benches, 15 * k + 13, 256) <= slope(15 * k + 13) + 1e-3, `riser of stratum ${k}`);
    for (let k = 0; k < 16; k += 2) for (let d = 2; d <= 14; d += 2) assert.ok(Math.abs(at(benches, 15 * k + d, 256) - slope(15 * k + d)) < 1e-3, `hard stratum ${k} keeps the slope at +${d} m`);
    const memory = new TerrainFieldMemory(64 << 20), slopes = slopeDegreesRaster(benches.grid, benches.heights, memory), bins = [0, 0, 0];
    let counted = 0;
    for (let row = 20; row < benches.grid.rows - 20; row++) for (let column = 20; column < benches.grid.columns - 20; column++) { const value = slopes[row * benches.grid.columns + column]; bins[value < 5 ? 0 : value < 15 ? 1 : 2]++; counted++; }
    memory.free('slope');
    // benches cover 8.4 m of every 30 m of run (28 percent before the central-difference blur at their edges); the rest is the 21.8 degree slope and the risers
    assert.ok(bins[0] / counted > .15 && bins[2] / counted > .5 && bins[1] / counted < .1, `slope histogram is bimodal: ${bins.map(value => (value / counted).toFixed(3)).join(' / ')} below 5, 5..15, above 15 degrees`);
    assertInvariant(benches);
    await review('terraces', benches, before);
    benches.release();
    const talus = await run(recipeOf(GRID, [op('import', 'import-heights'), op('strata', 'strata', geometry), op('terraces', 'terraces', { ...terrace, depositTalus: true, talusSpreadMeters: 16 })], { plan: false }), { readLandscape: sourceOf(slope) });
    const conserved = statisticsOf(talus, 'terraces');
    assert.ok(conserved.talusSamples > 1000 && conserved.stuckRoutes === 0 && Math.abs(conserved.massBalanceCubicMeters) < 1e-6 * conserved.cutVolumeCubicMeters, JSON.stringify(conserved));
    // the talus settles at repose: the lowest bench's share that reaches the west edge, where the slope runs off the landscape, is exported and counted
    assert.ok(Math.abs(conserved.talusVolumeCubicMeters + conserved.reposeExportedVolumeCubicMeters - conserved.cutVolumeCubicMeters) < 1e-6 * conserved.cutVolumeCubicMeters, 'the routed talus plus the export equals the cut volume');
    assert.ok(conserved.reposeExportedVolumeCubicMeters > 0 && conserved.reposeExportedVolumeCubicMeters < .05 * conserved.cutVolumeCubicMeters, `only the lowest bench reaches the edge: ${conserved.reposeExportedVolumeCubicMeters} of ${conserved.cutVolumeCubicMeters} m3`);
    let sum = 0, talusDeposits = 0;
    for (let i = 0; i < talus.heights.length; i++) { sum += talus.heights[i] - before[i]; if (talus.layers.depositType[i] === 1) { talusDeposits++; assert.ok(talus.layers.depositThickness[i] > 0); } }
    assert.ok(Math.abs(sum * 4 + conserved.reposeExportedVolumeCubicMeters) < 1e-4 * conserved.cutVolumeCubicMeters + .5, `the surface volume is conserved to float32 rounding up to the export: ${sum * 4} m3 of ${conserved.cutVolumeCubicMeters}`);
    assert.ok(talusDeposits === conserved.talusSamples, 'talus samples carry depositType 1');
    assertInvariant(talus);
    await review('terraces-talus', talus, before);
    talus.release();
});

test('Coastal synthesis: headland and cove move the sea-level crossing deliberately, report it with the affected design vertices and respect plan protection', async () => {
    const before = await sourceHeights(beachTerrain, beachCover), inputs = { readLandscape: sourceOf(beachTerrain, beachCover), planFiles: planOf() };
    const headland = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('head', 'landform-headland', { center: [SHORE_X, 256], bearingDegrees: 270, lengthMeters: 100, widthMeters: 80, heightMeters: 6, noiseMeters: .5, protectPlan: false })]), inputs);
    const statistics = statisticsOf(headland, 'head');
    assert.ok(statistics.shoreline.maxDisplacementMeters > 85 && statistics.shoreline.maxDisplacementMeters <= 100, `headland displacement ${statistics.shoreline.maxDisplacementMeters}`);
    assert.ok(statistics.shoreline.crossingDeviationMeters.after > 90 && statistics.shoreline.crossingDeviationMeters.before < 1e-6, JSON.stringify(statistics.shoreline));
    assert.ok(statistics.affectedShorelineVertices.count >= 3 && statistics.affectedShorelineVertices.first < statistics.affectedShorelineVertices.last, JSON.stringify(statistics.affectedShorelineVertices));
    assert.ok(at(headland, 240, 256) > 0 && at(headland, SHORE_X, 256) > 3.5 && at(headland, 262.5, 256) > 5.5, 'the promontory is land out to its tip and crests mid footprint');
    assert.ok(Math.abs(at(headland, 240, 100) - beachTerrain(240)) < 1e-6, 'untouched away from the footprint');
    await review('landform-headland', headland, before);
    headland.release();
    const cove = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('cove', 'landform-cove', { center: [SHORE_X, 400], bearingDegrees: 270, lengthMeters: 80, widthMeters: 100, depthMeters: 3, noiseMeters: .3, protectPlan: false })]), inputs);
    const scooped = statisticsOf(cove, 'cove');
    assert.ok(scooped.shoreline.maxDisplacementMeters > 65 && scooped.shoreline.maxDisplacementMeters <= 80, `cove displacement ${scooped.shoreline.maxDisplacementMeters}`);
    assert.ok(at(cove, 340, 400) < 0 && at(cove, 340, 400) > -3.5, `the cove floor is below sea level: ${at(cove, 340, 400)}`);
    assert.ok(scooped.affectedShorelineVertices.count >= 5);
    await review('landform-cove', cove, before);
    cove.release();
    // protectPlan: a headland inside the southwest swim zone (Z 184..936, 150 m seaward of the design line) changes nothing, one near the beach points leaves their radius untouched
    const guarded = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('swim', 'landform-headland', { center: [SHORE_X, 256], lengthMeters: 100, widthMeters: 80, heightMeters: 6 }),
        op('near', 'landform-headland', { center: [SHORE_X, 60], lengthMeters: 60, widthMeters: 120, heightMeters: 6 })]), inputs);
    assert.equal(statisticsOf(guarded, 'swim').changedSamples, 0); assert.ok(statisticsOf(guarded, 'swim').swimZone.samples > 1000);
    const near = statisticsOf(guarded, 'near');
    assert.ok(near.changedSamples > 0 && near.protectedSamples > 0, JSON.stringify(near));
    for (let z = 20; z <= 140; z += 4) for (let x = 260; x <= 380; x += 4) if (Math.hypot(x - 320, z - 80) <= 60 || Math.hypot(x - 330, z - 100) <= 60) assert.equal(at(guarded, x, z), Math.fround(beachTerrain(x)), `protected around the beach points at ${x},${z}`);
    guarded.release();
});

test('Coastal synthesis: exposure is 1 on a straight open coast, lower inside a cove, and classifies offshore samples', async () => {
    const before = await sourceHeights(beachTerrain, beachCover), inputs = { readLandscape: sourceOf(beachTerrain, beachCover), planFiles: planOf() };
    const straight = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('exposure', 'coastal-exposure', { fetchDirections: 24, fetchMeters: 1500 })]), inputs);
    const statistics = statisticsOf(straight, 'exposure');
    assert.ok(statistics.waterlineExposure.min >= .99 && statistics.waterlineExposure.max <= 1 && statistics.waterlineSamples >= 257, JSON.stringify(statistics));
    assert.ok(layerAt(straight, 'waveExposure', 304, 100) >= .95 && layerAt(straight, 'waveExposure', 296, 100) >= .95, 'full exposure beside the waterline');
    assert.ok(layerAt(straight, 'waveExposure', 400, 100) === 0 && layerAt(straight, 'waveExposure', 40, 100) === 0, 'faded beyond the inland and offshore reach');
    assert.ok(layerAt(straight, 'waveExposure', 330, 100) > .05 && layerAt(straight, 'waveExposure', 330, 100) < .95, 'smoothstep fade inland');
    assert.equal(layerAt(straight, 'coastalZone', 50, 100), COASTAL_ZONE.offshore); assert.equal(layerAt(straight, 'coastalZone', 400, 100), COASTAL_ZONE.inland);
    straight.release();
    const sheltered = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('cove', 'landform-cove', { center: [SHORE_X, 400], bearingDegrees: 270, lengthMeters: 80, widthMeters: 100, depthMeters: 3, noiseMeters: 0, protectPlan: false }), op('exposure', 'coastal-exposure')]), inputs);
    const head = layerAt(sheltered, 'waveExposure', 384, 400), open = layerAt(sheltered, 'waveExposure', 304, 100);
    assert.ok(head < .85 && head > .2 && open >= .95, `cove head ${head} vs open coast ${open}`);
    assert.ok(statisticsOf(sheltered, 'exposure').waterlineExposure.min < .8);
    await review('coastal-exposure', sheltered, before, [{ file: 'exposure.png', label: 'waveExposure (x 12)', image: categoryMap(sheltered.grid, Float32Array.from(sheltered.layers.waveExposure, value => Math.round(value * 12)), 256, ZONE_COLORS) }]);
    sheltered.release();
});

test('Coastal synthesis: the bluff cuts a face at the declared slope down to a sloping platform, retreat moves the crest, talus and the invariant hold', async () => {
    const before = await sourceHeights(terraceTerrain), inputs = { readLandscape: sourceOf(terraceTerrain), planFiles: planOf() };
    const polygon = [[380, 512], [512, 512], [512, 0], [380, 0]], tanFace = Math.tan(65 * DEGREES), tanPlatform = Math.tan(1 * DEGREES);
    const params = { source: 'polygon', polygon, retreatMeters: 10, faceSlopeDegrees: 65, platformHeightMeters: .8, platformSlopeDegrees: 1, platformWidthMeters: 40, talusVolumeFraction: .1, talusSlopeDegrees: 33, blendMeters: 6, protectPlan: false };
    const bluff = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('bluff', 'coastal-bluff', params)]), inputs);
    const statistics = statisticsOf(bluff, 'bluff');
    assert.equal(at(bluff, 390, 256), 15, 'the retreated crest keeps the terrace height'); assert.equal(at(bluff, 396, 256), 15, 'landward of the crest nothing changes');
    assert.ok(Math.abs((at(bluff, 390, 256) - at(bluff, 388, 256)) / 2 - tanFace) < 1e-3, `face slope ${(at(bluff, 390, 256) - at(bluff, 388, 256)) / 2} vs ${tanFace}`);
    const toe = 390 - (15 - .8) / tanFace;
    assert.ok(Math.abs(at(bluff, 370, 256) - (.8 - (toe - 370) * tanPlatform)) < 1e-3, `platform height at 370: ${at(bluff, 370, 256)}`);
    assert.ok(Math.abs((at(bluff, 370, 256) - at(bluff, 350, 256)) / 20 - tanPlatform) < 1e-4, 'platform slope 1 degree');
    assert.ok(Math.abs(at(bluff, 320, 256) - 1) < 1e-6 && Math.abs(at(bluff, 250, 256) + 2) < 1e-6, 'beyond the platform and its blend the former surface resumes');
    assert.equal(layerAt(bluff, 'coastalZone', 396, 256), COASTAL_ZONE.bluffCrown); assert.equal(layerAt(bluff, 'coastalZone', 388, 256), COASTAL_ZONE.bluffFace); assert.equal(layerAt(bluff, 'coastalZone', 360, 256), COASTAL_ZONE.platform);
    assert.equal(layerAt(bluff, 'coastalZone', 382, 256), COASTAL_ZONE.bluffToe); assert.equal(layerAt(bluff, 'faceMask', 388, 256), 1); assert.equal(layerAt(bluff, 'faceMask', 360, 256), 0);
    assert.ok(statistics.talusHeightMeters > 2 && statistics.talusHeightMeters < 9 && statistics.talusSamples > 200, JSON.stringify(statistics));
    assert.ok(Math.abs(statistics.talusVolumeCubicMeters - .1 * statistics.cutVolumeCubicMeters) < .3 * .1 * statistics.cutVolumeCubicMeters, `talus ${statistics.talusVolumeCubicMeters} of ${.1 * statistics.cutVolumeCubicMeters}`);
    let talus = 0;
    for (let z = 100; z <= 400; z += 10) { const i = index(bluff, 380, z); if (bluff.layers.depositType[i] === 1) talus++; }
    assert.ok(talus > 20, `talus deposits at the toe: ${talus}`);
    assert.equal(statistics.shoreline.flippedSamples, 0); assert.equal(statistics.shoreline.maxDisplacementMeters, 0);
    assertInvariant(bluff);
    await review('coastal-bluff', bluff, before, [{ file: 'faceMask.png', label: 'faceMask', image: categoryMap(bluff.grid, bluff.layers.faceMask, 256, ZONE_COLORS) }]);
    bluff.release();
    const unretreated = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('bluff', 'coastal-bluff', { ...params, retreatMeters: 0 })]), inputs);
    // without retreat the crest stays on the boundary (x = 380): the old 74 degree rise in front of it is steeper than the 65 degree face, so cut-only leaves it; with 10 m of retreat the face cuts the terrace at x = 384 and the platform takes x = 378
    assert.ok(at(unretreated, 380, 256) === 15 && at(unretreated, 384, 256) === 15 && at(unretreated, 378, 256) === 8 && at(bluff, 384, 256) < 7 && at(bluff, 378, 256) < 1,
        `retreat moves the crest: x=384 ${at(unretreated, 384, 256)} -> ${at(bluff, 384, 256)}, x=378 ${at(unretreated, 378, 256)} -> ${at(bluff, 378, 256)}`);
    unretreated.release();
    // a platform wide enough to drop below sea level moves the waterline seaward of the design line: reported, not hidden
    const wide = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('bluff', 'coastal-bluff', { ...params, platformWidthMeters: 90 })]), inputs);
    const moved = statisticsOf(wide, 'bluff').shoreline;
    assert.ok(moved.flippedSamples > 1000 && moved.maxDisplacementMeters > 30 && moved.maxDisplacementMeters < 40 && moved.crossingDeviationMeters.after > 36 && moved.crossingDeviationMeters.after < 39, JSON.stringify(moved));
    wide.release();
    // detect: the crest is the first point along the shoreline normal where the ground reaches minCliffHeightMeters (x = 378 on this terrace), protection keeps the corridor and districts
    const detected = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('bluff', 'coastal-bluff', { ...params, source: 'detect', polygon: null, minCliffHeightMeters: 8, maxDistanceFromShoreMeters: 120, retreatMeters: 10 })]), inputs);
    assert.ok(Math.abs(at(detected, 384, 256) - (15 - (388 - 384) * tanFace)) < 1e-2 || Math.abs(at(detected, 384, 256) - (15 - (388 - 384) * tanFace)) < .5, `detected crest near x=388: ${at(detected, 384, 256)}`);
    assert.ok(statisticsOf(detected, 'bluff').faceSamples > 500 && statisticsOf(detected, 'bluff').protectedSamples === 0);
    detected.release();
    const guarded = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('bluff', 'coastal-bluff', { ...params, source: 'detect', polygon: null, minCliffHeightMeters: 8, maxDistanceFromShoreMeters: 120, protectPlan: true })]), inputs);
    assert.ok(statisticsOf(guarded, 'bluff').protectedSamples > 0);
    for (let z = 164; z <= 196; z += 8) for (let x = 334; x <= 396; x += 4) assert.equal(at(guarded, x, z), terraceTerrain(x), `corridor untouched at ${x},${z}`);
    guarded.release();
});

test('Coastal synthesis: the beach imposes the Dean profile offshore, a 1:20 foreshore, the berm at 30 m and 1.8 m, a backshore meeting the ground, sand deposits and zones', async () => {
    const before = await sourceHeights(beachTerrain, beachCover), inputs = { readLandscape: sourceOf(beachTerrain, beachCover), planFiles: planOf() };
    const params = { beachBandMeters: 100, blendMeters: 20, offshoreReachMeters: 200, protectPlan: false };
    const beach = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('beach', 'coastal-beach', params)]), inputs);
    const statistics = statisticsOf(beach, 'beach'), profile = beachProfile({ deanA: .1, foreshoreSlopeRatio: 20, swashDepthMeters: 1, bermHeightMeters: 1.8, bermDistanceMeters: 30, bermFaceRunMeters: 6, bermWidthMeters: 12, backshoreSlopeDegrees: 1 }, 0);
    assert.ok(Math.abs(statistics.deanOriginMeters - profile.x0) < 1e-6 && profile.x0 < 0, `Dean virtual origin ${profile.x0} m seaward of the design line`);
    const z = 256, h = x => at(beach, x, z);
    for (let x = 230; x <= 276; x += 2) { const dean = -.1 * Math.cbrt(((SHORE_X - x) - profile.x0) ** 2); assert.ok(Math.abs(h(x) - dean) < .01, `Dean profile at x=${x}: ${h(x)} vs ${dean}`); }
    assert.ok(Math.abs(h(280) + 1) < .02 && Math.abs(h(300)) < .02, `foreshore through -1 m at 20 m and the waterline: ${h(280)}, ${h(300)}`);
    const ratio = (324 - 280) / (h(324) - h(280));
    assert.ok(Math.abs(ratio - 20) < 1, `measured foreshore slope 1:${ratio}`);
    assert.ok(Math.abs(h(330) - 1.8) < .02 && Math.abs(h(340) - 1.8) < .02, `berm at 30..42 m: ${h(330)}, ${h(340)}`);
    assert.ok(Math.abs(h(360) - (1.8 - 18 * Math.tan(DEGREES))) < .02, `backshore at 60 m: ${h(360)}`);
    assert.ok(Math.abs(h(400) - beachTerrain(400)) < 1e-6 && Math.abs(h(420) - beachTerrain(420)) < 1e-6, 'beyond the band the ground is untouched');
    assert.ok(h(390) > h(380) && h(390) < beachTerrain(390), 'the backshore blends up into the ramp inside the blend');
    const summary = statistics.transectSummary;
    assert.ok(summary.applied === 5 && Math.abs(summary.foreshoreSlopeRatio - 20) < 1 && Math.abs(summary.bermHeightMeters - 1.8) < .02 && Math.abs(summary.bermDistanceMeters - 30) < 1.5, JSON.stringify(summary));
    assert.ok(summary.backshoreMeetsGroundMeters >= 42 && summary.backshoreMeetsGroundMeters <= 48, `the backshore first meets the 4 percent ramp (1.8 m at 45 m) at ${summary.backshoreMeetsGroundMeters} m`);
    for (let x = 280; x <= 342; x += 2) { const i = index(beach, x, z); assert.equal(beach.layers.depositType[i], 4, `beach sand at x=${x}`); assert.ok(beach.layers.depositThickness[i] >= .5 - 1e-6, `sand at least 0.5 m at x=${x}: ${beach.layers.depositThickness[i]}`); }
    assert.equal(layerAt(beach, 'coastalZone', 276, z), COASTAL_ZONE.surf); assert.equal(layerAt(beach, 'coastalZone', 300, z), COASTAL_ZONE.swash); assert.equal(layerAt(beach, 'coastalZone', 334, z), COASTAL_ZONE.berm); assert.equal(layerAt(beach, 'coastalZone', 360, z), COASTAL_ZONE.backshore);
    assert.ok(statistics.zoneSamples.surf > 1000 && statistics.zoneSamples.swash > 1000 && statistics.zoneSamples.berm > 1000 && statistics.zoneSamples.backshore > 1000, JSON.stringify(statistics.zoneSamples));
    assert.equal(statistics.shoreline.flippedSamples, 0);
    assertInvariant(beach);
    const distance = Array.from({ length: 111 }, (_, i) => 200 + i * 2);
    const plot = renderProfilePlot({ series: [{ label: 'before', distance: distance.map(x => x - SHORE_X), height: distance.map(x => sampleHeight(beach.grid, before, x, z)) }, { label: 'after (coastal-beach)', distance: distance.map(x => x - SHORE_X), height: distance.map(x => h(x)) }],
        verticalExaggeration: 4, title: 'coastal-beach transect z=256 (distance from the design shoreline)', width: 1000, markers: [{ distance: -20, label: 'swash -1 m' }, { distance: 0, label: 'waterline' }, { distance: 30, label: 'berm' }, { distance: 42, label: 'backshore' }] });
    await review('coastal-beach', beach, before, [{ file: 'transect.png', label: 'transect', image: plot }]);
    beach.release();
    // protection: the arrival pad and the bus stop keep their radius; a polygon mask limits the beach to the southern half
    const guarded = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('beach', 'coastal-beach', { ...params, protectPlan: true })]), inputs);
    for (let zz = 20; zz <= 140; zz += 4) for (let x = 260; x <= 380; x += 4) if (Math.hypot(x - 320, zz - 80) <= 60 || Math.hypot(x - 330, zz - 100) <= 60) assert.equal(at(guarded, x, zz), Math.fround(beachTerrain(x)), `protected at ${x},${zz}`);
    assert.ok(statisticsOf(guarded, 'beach').protectedSamples > 1000 && Math.abs(at(guarded, 330, 400) - 1.8) < .02);
    guarded.release();
    const masked = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('beach', 'coastal-beach', params, { type: 'polygon', polygon: [[0, 256], [512, 256], [512, 0], [0, 0]] })]), inputs);
    for (let x = 200; x <= 420; x += 4) assert.equal(at(masked, x, 300), Math.fround(beachTerrain(x)), `mask excludes z=300 at x=${x}`);
    assert.ok(Math.abs(at(masked, 330, 100) - 1.8) < .02);
    masked.release();
});

test('Coastal synthesis: the foredune rises only where the backshore has room and never inside the corridor, districts, roads or the point radius', async () => {
    const before = await sourceHeights(beachTerrain, beachCover), inputs = { readLandscape: sourceOf(beachTerrain, beachCover), planFiles: planOf() };
    const result = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('beach', 'coastal-beach', { beachBandMeters: 100, blendMeters: 20, offshoreReachMeters: 200, protectPlan: false }), op('dune', 'coastal-foredune', {})]), inputs);
    const beach = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('beach', 'coastal-beach', { beachBandMeters: 100, blendMeters: 20, offshoreReachMeters: 200, protectPlan: false })]), inputs);
    const statistics = statisticsOf(result, 'dune'), rise = (x, z) => at(result, x, z) - at(beach, x, z);
    // 4 m at 8 degrees needs a 28.5 m seaward run, but the crest sits 20 m behind the base: the run is clipped to 19.7 m (11.5 degrees, reported), the lee keeps 20 degrees
    assert.ok(statistics.effectiveHeightMeters === 4 && Math.abs(statistics.effectiveSeawardSlopeDegrees - Math.atan(4 / 19.725) / DEGREES) < 1e-3 && statistics.footprintMeters < 32 && statistics.stationsWithRoom > 100 && statistics.stationsWithRoom < statistics.stations, JSON.stringify(statistics));
    assert.ok(rise(362, 256) >= 2.5 && rise(362, 256) <= 5.5, `crest at z=256: +${rise(362, 256)} m`);
    assert.ok(rise(362, 440) >= 2.5 && rise(362, 440) <= 5.5, `crest at z=440: +${rise(362, 440)} m`);
    assert.ok(rise(342, 256) < .3 && rise(350, 256) > .5 && rise(350, 256) < rise(362, 256) && rise(366, 256) > .5 && rise(366, 256) < rise(362, 256), 'the dune starts at the base and both faces rise toward the crest');
    assert.ok(Math.abs((rise(356, 256) - rise(348, 256)) / 8 - rise(362, 256) / 19.725) < .02, 'the clipped seaward face is linear from the base to the crest');
    assert.ok(Math.abs((rise(364, 256) - rise(368, 256)) / 4 - Math.tan(20 * DEGREES)) < .02, `lee face at 20 degrees: ${Math.atan((rise(364, 256) - rise(368, 256)) / 4) / DEGREES}`);
    const declared = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('beach', 'coastal-beach', { beachBandMeters: 100, blendMeters: 20, offshoreReachMeters: 200, protectPlan: false }), op('dune', 'coastal-foredune', { crestDistanceMeters: 30, heightVariationMeters: 0 })]), inputs);
    const flatRise = (x, z) => at(declared, x, z) - at(beach, x, z);
    assert.ok(Math.abs(statisticsOf(declared, 'dune').effectiveSeawardSlopeDegrees - 8) < 1e-6 && Math.abs(flatRise(372, 256) - 4) < 1e-3, 'with room for the run the seaward face keeps its declared slope');
    assert.ok(Math.abs((flatRise(360, 256) - flatRise(352, 256)) / 8 - Math.tan(8 * DEGREES)) < 1e-3, `seaward face at 8 degrees: ${Math.atan((flatRise(360, 256) - flatRise(352, 256)) / 8) / DEGREES}`);
    declared.release();
    assert.equal(rise(362, 280), 0, 'no dune where the shore pad district leaves 8 m of backshore'); assert.equal(rise(346, 280), 0);
    assert.equal(rise(346, 30), 0, 'no dune where the road blocks the backshore'); assert.equal(rise(362, 30), 0);
    for (let z = 160; z <= 200; z += 4) for (let x = 330; x <= 400; x += 2) assert.equal(rise(x, z), 0, `never inside the corridor at ${x},${z}`);
    for (let z = 20; z <= 140; z += 4) for (let x = 300; x <= 400; x += 4) if (Math.hypot(x - 320, z - 80) <= 60 || Math.hypot(x - 330, z - 100) <= 60) assert.equal(rise(x, z), 0, `point radius at ${x},${z}`);
    assert.equal(layerAt(result, 'coastalZone', 362, 256), COASTAL_ZONE.foredune); assert.equal(layerAt(result, 'depositType', 362, 256), 5);
    assert.ok(layerAt(result, 'depositThickness', 362, 256) >= rise(362, 256) - 1e-3);
    assert.equal(statistics.shoreline.flippedSamples, 0);
    assertInvariant(result);
    await review('coastal-foredune', result, before);
    result.release(); beach.release();
});

test('Coastal synthesis: the nearshore bar crest sits at the declared distance and depth with a trough landward, or on the depth contour when derived', async () => {
    const before = await sourceHeights(deanTerrain), inputs = { readLandscape: sourceOf(deanTerrain), planFiles: planOf() };
    const explicit = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('bar', 'coastal-nearshore', { barDistanceMeters: 150, barHeightMeters: 1.2, maxCrestDepthMeters: -1.5, wanderMeters: 15, wavelengthMeters: 250 })]), inputs);
    const statistics = statisticsOf(explicit, 'bar'), expectedCrest = deanTerrain(SHORE_X - 150) + 1.2;
    assert.ok(expectedCrest < -1.5 && Math.abs(statistics.crest.meanDepthMeters - expectedCrest) < .05 && Math.abs(statistics.crest.meanDistanceMeters - 150) < 6, JSON.stringify(statistics.crest));
    for (const z of [100, 256, 400]) {
        let peak = -Infinity, peakX = null, trough = Infinity;
        for (let x = 100; x <= 200; x += 2) if (at(explicit, x, z) > peak) { peak = at(explicit, x, z); peakX = x; }
        for (let x = 160; x <= 220; x += 2) trough = Math.min(trough, at(explicit, x, z) - deanTerrain(x));
        assert.ok(Math.abs(peak - (deanTerrain(peakX) + 1.2)) < .03 && Math.abs((SHORE_X - peakX) - 150) < 18, `crest at z=${z}: ${peak} at ${SHORE_X - peakX} m (1.2 m above ${deanTerrain(peakX)})`);
        assert.ok(trough < -.4 && trough > -.6, `trough at z=${z}: ${trough}`);
        assert.equal(layerAt(explicit, 'coastalZone', peakX, z), COASTAL_ZONE.bar); assert.equal(layerAt(explicit, 'depositType', peakX, z), 4);
    }
    assert.ok(explicit.heights.every(value => value <= -1.5 + 1e-6 || value >= 0 || value > -1.5 && value < 0) && statistics.shoreline.flippedSamples === 0);
    assertInvariant(explicit);
    await review('coastal-nearshore', explicit, before);
    explicit.release();
    const shallow = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('bar', 'coastal-nearshore', { barDistanceMeters: 60, barHeightMeters: 1.2, maxCrestDepthMeters: -1.5, wanderMeters: 0 })]), inputs);
    assert.ok(Math.abs(statisticsOf(shallow, 'bar').crest.maxDepthMeters + 1.5) < 1e-6 && statisticsOf(shallow, 'bar').crest.maxDepthMeters <= -1.5, 'a bar on a shallow profile is capped at maxCrestDepthMeters');
    shallow.release();
    const derived = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('bar', 'coastal-nearshore', { barDepthMeters: -2.5, wanderMeters: 0 })]), inputs);
    const contour = (2.45 / .1) ** 1.5, located = statisticsOf(derived, 'bar');
    assert.ok(located.locatedStations === located.stations && Math.abs(located.crest.meanDistanceMeters - contour) < 4, `derived crest at ${located.crest.meanDistanceMeters} m vs the -2.5 m contour at ${contour} m`);
    derived.release();
});

test('Coastal synthesis: the reef rises within its depth band at the declared coverage and never inside the swim zone', async () => {
    const reefTerrain = x => x < SHORE_X ? -6 : .04 * (x - SHORE_X), before = await sourceHeights(reefTerrain), inputs = { readLandscape: sourceOf(reefTerrain), planFiles: planOf() };
    const reef = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('reef', 'coastal-reef', { coverageFraction: .5, minDepthMeters: -4, maxDepthMeters: -1 })]), inputs);
    const statistics = statisticsOf(reef, 'reef');
    assert.ok(statistics.reefFraction > .45 && statistics.reefFraction < .55 && statistics.swimZone.samples > 1000 && statistics.reefSamples > 3000, JSON.stringify(statistics));
    assert.ok(statistics.reefTopDepthMeters[0] >= -4 - 1e-6 && statistics.reefTopDepthMeters[1] <= -1 + 1e-6, `reef tops ${statistics.reefTopDepthMeters}`);
    let raised = 0;
    for (let i = 0; i < reef.heights.length; i++) {
        const column = i % reef.grid.columns, row = Math.floor(i / reef.grid.columns), x = column * 2, z = 512 - row * 2;
        if (reef.heights[i] !== before[i]) { raised++; assert.ok(reef.heights[i] > before[i] && reef.heights[i] <= -1 + 1e-6 && reef.layers.depositType[i] === 6 && Math.abs(reef.layers.depositThickness[i] - (reef.heights[i] - before[i])) < 1e-3, `reef sample ${x},${z}`); }
        // the swim zone polygon joins the design vertices between Z 184 and 936 (here 192..512) 150 m seaward and 60 m landward; the scanline fill is half open at its top and right edges
        if (z >= 192 && z < 512 && x >= SHORE_X - 150 && x < SHORE_X + 60) assert.equal(reef.heights[i], before[i], `swim zone untouched at ${x},${z}`);
    }
    assert.equal(raised, statistics.reefSamples);
    assert.ok(layerAt(reef, 'coastalZone', 100, 100) === COASTAL_ZONE.reef || layerAt(reef, 'coastalZone', 100, 100) === 0);
    assert.equal(statistics.shoreline.flippedSamples, 0);
    assertInvariant(reef);
    await review('coastal-reef', reef, before);
    reef.release();
    const dense = await run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, op('reef', 'coastal-reef', { coverageFraction: .9, protectPlan: false }, { type: 'polygon', polygon: [[0, 100], [200, 100], [200, 0], [0, 0]] })]), inputs);
    const masked = statisticsOf(dense, 'reef');
    assert.ok(masked.reefFraction > .85 && masked.swimZone === null, JSON.stringify(masked));
    for (let z = 120; z <= 500; z += 20) for (let x = 20; x <= 280; x += 20) assert.equal(at(dense, x, z), -6, `mask excludes ${x},${z}`);
    dense.release();
});

const CHAIN = [op('import', 'import-heights'), PLAN, op('exposure', 'coastal-exposure'), op('bluff', 'coastal-bluff', { source: 'polygon', polygon: [[380, 512], [512, 512], [512, 400], [380, 400]], retreatMeters: 6, platformWidthMeters: 20 }),
    op('strata', 'strata', { thicknessMeters: 4, dipEastMetersPerKm: 20 }), op('terraces', 'terraces', { thicknessMeters: 4, dipEastMetersPerKm: 20, minSlopeDegrees: 10 }),
    op('beach', 'coastal-beach', { beachBandMeters: 100, blendMeters: 20, offshoreReachMeters: 200 }), op('dune', 'coastal-foredune'), op('bar', 'coastal-nearshore', { barDistanceMeters: 90 }),
    op('reef', 'coastal-reef', {}, { type: 'polygon', polygon: [[0, 180], [250, 180], [250, 0], [0, 0]] }), op('head', 'landform-headland', { center: [SHORE_X, 470], lengthMeters: 60, widthMeters: 60, heightMeters: 4, protectPlan: false })];
const LAYERS = ['bedrock', 'regolith', 'depositType', 'depositThickness', 'lithology', 'hardness', 'coastalZone', 'waveExposure', 'faceMask'];

test('Coastal synthesis: the whole coastal chain is bit identical across runs, reseeds with the recipe seed and strata read the bedrock an earlier operator created', async () => {
    const terrain = x => x < SHORE_X ? -.1 * Math.cbrt((SHORE_X - x) ** 2) - .3 : .04 * (x - SHORE_X) + 5 * smooth(360, 420, x), inputs = { readLandscape: sourceOf(terrain, beachCover), planFiles: planOf() };
    const before = await sourceHeights(terrain, beachCover), first = await run(recipeOf(GRID, CHAIN), inputs), second = await run(recipeOf(GRID, CHAIN), inputs);
    assert.equal(sha256(Buffer.from(first.heights.buffer)), sha256(Buffer.from(second.heights.buffer)), 'identical heights');
    for (const name of LAYERS) assert.equal(sha256(Buffer.from(first.layers[name].buffer)), sha256(Buffer.from(second.layers[name].buffer)), `identical ${name}`);
    assert.deepEqual(first.report.operators.map(entry => entry.statistics), second.report.operators.map(entry => entry.statistics));
    assert.equal(statisticsOf(first, 'strata').sourceLayer, 'bedrock');
    assert.deepEqual(statisticsOf(first, 'exposure').createdLayers, ['waveExposure', 'coastalZone']); assert.deepEqual(statisticsOf(first, 'bluff').createdLayers, ['faceMask', 'bedrock', 'regolith', 'depositType', 'depositThickness']);
    assert.ok(statisticsOf(first, 'head').shoreline.maxDisplacementMeters > 40, 'the headland reports its deliberate displacement');
    for (const id of ['beach', 'dune', 'bar', 'reef']) assert.ok(statisticsOf(first, id).shoreline.maxDisplacementMeters <= 10, `${id} keeps the crossing inside the tolerance: ${statisticsOf(first, id).shoreline.maxDisplacementMeters}`);
    assertInvariant(first);
    for (const value of first.heights) assert.ok(Number.isFinite(value));
    await review('coastal-chain', first, before, [{ file: 'depositType.png', label: 'depositType', image: categoryMap(first.grid, first.layers.depositType, 256, ZONE_COLORS) }]);
    first.release(); second.release();
    const reseeded = await run(recipeOf(GRID, CHAIN, { seed: 12 }), inputs);
    assert.notEqual(sha256(Buffer.from(reseeded.heights.buffer)), sha256(Buffer.from(before.buffer)));
    assert.notEqual(statisticsOf(reseeded, 'reef').noiseThreshold, null);
    reseeded.release();
});

test('Coastal synthesis: the recipe validator rejects inconsistent coastal parameters with actionable messages', async () => {
    const reject = (operator, pattern) => assert.rejects(run(recipeOf(GRID, [op('import', 'import-heights'), PLAN, operator]), { readLandscape: sourceOf(beachTerrain), planFiles: planOf() }), pattern);
    await reject(op('bluff', 'coastal-bluff', { source: 'polygon' }), /polygon is required with source polygon/);
    await reject(op('bluff', 'coastal-bluff', { polygon: [[0, 0], [10, 0], [10, 10]] }), /applies only to source polygon/);
    await reject(op('bluff', 'coastal-bluff', { talusSlopeDegrees: 70 }), /talusSlopeDegrees must be below faceSlopeDegrees/);
    await reject(op('beach', 'coastal-beach', { foreshoreSlopeRatio: 10 }), /above bermHeightMeters/);
    await reject(op('beach', 'coastal-beach', { bermFaceRunMeters: 40 }), /shorter than bermDistanceMeters/);
    await reject(op('reef', 'coastal-reef', { minDepthMeters: -1, maxDepthMeters: -3 }), /minDepthMeters must be below maxDepthMeters/);
    await reject(op('dune', 'coastal-foredune'), /reads layer coastalZone before any enabled operator writes it/);
});
