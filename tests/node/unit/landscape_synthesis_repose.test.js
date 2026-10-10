// Verifies the repose bound of every depositing operator on small synthetic surfaces: no sample ends as a needle (one sample above all 8 neighbours), the mass balance stays exact, the geology column invariant holds and the runs are deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TerrainFieldMemory } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsGrid.mjs';
import { executeSynthesisRecipe } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisGraph.mjs';
import { DEPOSIT_TYPES, neighborTable, reposeCeiling } from '../../../tools/bake_landscape/terrain_synthesis/operators/Erosion.mjs';
import { needleStatistics } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisAnalysis.mjs';

const DEGREES = Math.PI / 180, sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const op = (id, type, params = {}, mask = null) => ({ id, op: type, params, mask, seed: null, enabled: true });
const gridOf = (chunkIntervals, maxLevel, spacing) => {
    const intervals = chunkIntervals * 2 ** maxLevel;
    return { columns: intervals + 1, rows: intervals + 1, spacingX: spacing, spacingZ: spacing, bounds: { minX: 0, maxX: intervals * spacing, minZ: 0, maxZ: intervals * spacing }, chunkIntervals, maxLevel };
};
const recipeOf = (grid, operators, { seed = 11, seaLevel = 0 } = {}) => ({
    format: 'landscape-synthesis-recipe', schemaVersion: 1, id: 'repose-test', seed, seaLevel, grid, working: null,
    inputs: { landscape: { directory: 'synthetic', expectedRevision: null }, plan: null, imports: [] },
    operators, outputs: { heightCap: null, coverPolicy: 'keep-source', channels: ['height'] }, overrides: []
});
const sourceOf = heightAt => (binding, { memory, output }) => {
    const n = output.columns * output.rows, heights = memory.allocate('source/heights', Float32Array, n), cover = memory.allocate('source/cover', Uint8Array, n);
    for (let r = 0; r < output.rows; r++) for (let c = 0; c < output.columns; c++) {
        const x = output.minX + c * output.spacingX, z = output.maxZ - r * output.spacingZ;
        heights[r * output.columns + c] = heightAt(x, z); cover[r * output.columns + c] = 2;
    }
    return { grid: output, heights, cover, tracked: ['source/heights', 'source/cover'], sha256: 'ab'.repeat(32) };
};
const run = (recipe, inputs) => executeSynthesisRecipe({ recipe, inputs, memory: new TerrainFieldMemory(512 << 20) });
const statisticsOf = (result, id) => result.report.operators.find(entry => entry.id === id).statistics;
const invariantError = result => { let worst = 0; const { bedrock, regolith, depositThickness } = result.layers; for (let i = 0; i < result.heights.length; i++) worst = Math.max(worst, Math.abs(result.heights[i] - (bedrock[i] + regolith[i] + depositThickness[i]))); return worst; };
const volumeOf = (heights, grid) => { let sum = 0; for (let i = 0; i < heights.length; i++) sum += heights[i]; return sum * grid.spacingX * grid.spacingZ; };
const needlesOf = result => needleStatistics(result.workingGrid, result.heights, 2);
const indexOf = (grid, x, z) => Math.round((grid.maxZ - z) / grid.spacingZ) * grid.columns + Math.round((x - grid.minX) / grid.spacingX);
const heightsHash = result => sha256(Buffer.from(result.heights.buffer, result.heights.byteOffset, result.heights.byteLength));
// the largest amount any selected sample stands above the repose plane of its neighbours (h - min_j (h_j + d_ij tan)) beyond what those
// neighbours lost after the deposit (allowance(j): erosion or entrainment of a neighbour later in the operator legitimately undercuts a deposit)
function reposeExcess(result, tangent, select = () => true, allowance = () => 0) {
    const grid = result.workingGrid, neighbors = neighborTable(grid), { heights } = result;
    let worst = -Infinity;
    for (let row = 0; row < grid.rows; row++) for (let column = 0; column < grid.columns; column++) {
        const i = row * grid.columns + column;
        if (!select(i)) continue;
        let undercut = 0;
        for (let k = 0; k < 8; k++) { const r = row + neighbors.dr[k], c = column + neighbors.dc[k]; if (r >= 0 && c >= 0 && r < grid.rows && c < grid.columns) undercut = Math.max(undercut, allowance(i + neighbors.offset[k])); }
        worst = Math.max(worst, heights[i] - reposeCeiling(heights, grid, neighbors, row, column, i, tangent) - undercut);
    }
    return worst;
}
const referenceOf = async (grid, operators, inputs) => { const base = await run(recipeOf(grid, operators), inputs); const heights = Float32Array.from(base.heights), volume = volumeOf(heights, base.workingGrid); base.release(); return { heights, volume }; };

test('Repose: sediment-deposit routing a loaded channel into a flat pond leaves no needle, fills the pond flat, keeps the refused excess in the flux and balances exactly', async () => {
    // a 1 percent channel floor between 30 percent valley walls (below the 30 degree alluvium repose) draining into a closed flat-floored pond at the east end
    const grid = gridOf(32, 2, 2), pond = (x, z) => x > 200 && x < 240 && Math.abs(z - 128) < 20;
    const valley = (x, z) => (pond(x, z) ? 8 : 10 + .01 * (256 - x) + .3 * Math.abs(z - 128)), inputs = { readLandscape: sourceOf(valley) };
    const mantle = op('mantle', 'thermal-weathering', { iterations: 1, weatheringRateMetersPerIteration: 1, weatheringSlopeDegrees: 0 }), operators = [op('import', 'import-heights'), mantle, op('sediment', 'sediment-deposit')];
    const reference = await referenceOf(grid, [op('import', 'import-heights'), mantle], inputs);
    const result = await run(recipeOf(grid, operators), inputs), statistics = statisticsOf(result, 'sediment'), needles = needlesOf(result);
    assert.equal(needles.count, 0, `needles after sediment-deposit: ${JSON.stringify(needles)}`);
    assert.ok(statistics.reposeLimitedSamples > 0 && statistics.reposeDeferredVolumeCubicMeters > 0, `the channel floor exercised the bound: ${JSON.stringify(statistics)}`);
    assert.ok(statistics.lakes >= 1 && statistics.pondVolumeCubicMeters > 0 && statistics.depositedVolumeCubicMeters > statistics.pondVolumeCubicMeters, 'the pond trapped part of the flux and the channel floor took the rest');
    assert.ok(Math.abs(statistics.balanceErrorCubicMeters) <= 1e-6 * (statistics.entrainedVolumeCubicMeters + statistics.suppliedVolumeCubicMeters), `balance ${statistics.balanceErrorCubicMeters}`);
    assert.ok(Math.abs(volumeOf(result.heights, result.workingGrid) - reference.volume + statistics.exportedVolumeCubicMeters) <= 1e-6 * reference.volume, 'the grid volume follows the export');
    assert.ok(invariantError(result) < 1e-3 && statistics.invariantErrorMeters < 1e-3);
    // the pond fill is flat: every floor sample the mantle left at 8 m (the pit walls shed into the samples beside them) rose to one level, below the rim
    let floorMin = Infinity, floorMax = -Infinity, floorRaised = 0;
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.columns; c++) {
        const x = c * 2, z = 256 - r * 2, i = r * grid.columns + c;
        if (!pond(x, z) || reference.heights[i] !== 8) continue;
        floorMin = Math.min(floorMin, result.heights[i]); floorMax = Math.max(floorMax, result.heights[i]);
        if (result.layers.deposition[i] > 0) floorRaised++;
    }
    assert.ok(floorRaised > 200 && floorMax - floorMin < 1e-3 && floorMin > 8 && floorMax <= 10.56 + 1e-3, `flat pond fill: ${floorRaised} samples at ${floorMin}..${floorMax}`);
    // nothing deposited stands above the alluvium repose plane of its neighbours beyond what entrainment took from a neighbour later in the pass (float32 storage tolerance)
    assert.ok(reposeExcess(result, Math.tan(30 * DEGREES), i => result.layers.deposition[i] > 0, j => Math.max(0, reference.heights[j] - result.heights[j])) <= 1e-3, 'deposits respect the repose plane');
    const again = await run(recipeOf(grid, operators), inputs);
    assert.equal(heightsHash(again), heightsHash(result), 'two runs are bit identical');
    assert.deepEqual({ ...statisticsOf(again, 'sediment'), seconds: 0 }, { ...statistics, seconds: 0 });
    again.release(); result.release();
});

test('Repose: terraces whose talus routes dead-end in a hollow fill it to the repose plane, roll the rest on to the benches below or off the edge, and balance exactly', async () => {
    // a 38.7 degree slope (steeper than the 34 degree talus repose, so nothing rests on its flanks; benches cut onto every hard 6 m stratum) with a
    // one-sample hollow 8 m deep below the bench at x = 76..82: the routes descending through it have no lower neighbour, so the whole load of every
    // such route used to stack on that one sample; now the hollow fills to its repose plane and the rest rolls down to the flat benches below, each
    // taking a repose-deep layer, and what reaches the west edge, where the ground runs off the landscape, is exported and counted
    const grid = gridOf(32, 2, 2), hollowBase = .8 * 60 - 8, slope = (x, z) => (x === 60 && z === 128 ? hollowBase : .8 * x), inputs = { readLandscape: sourceOf(slope) };
    const geometry = { origin: [0, 0], thicknessMeters: 6, warpMeters: 0, hardnessPattern: [.9, .3] };
    const operators = [op('import', 'import-heights'), op('strata', 'strata', { ...geometry, hardnessNoise: 0 }), op('terraces', 'terraces', { ...geometry, hardThreshold: .6, minSlopeDegrees: 15, benchWidthMeters: 12, strength: 1, depositTalus: true, talusSpreadMeters: 16 })];
    const result = await run(recipeOf(grid, operators), inputs), statistics = statisticsOf(result, 'terraces'), needles = needlesOf(result);
    assert.equal(needles.count, 0, `needles after terraces: ${JSON.stringify(needles)}`);
    assert.ok(statistics.reposeLimitedSamples > 0 && statistics.reposeHops > 0, `the bound rolled the hollow's overflow on: ${JSON.stringify(statistics)}`);
    assert.ok(statistics.talusVolumeCubicMeters > 0 && statistics.reposeExportedVolumeCubicMeters > 0 && statistics.exportedRoutes > 0, 'what rolls off the west edge is exported and counted');
    assert.ok(Math.abs(statistics.talusVolumeCubicMeters + statistics.reposeExportedVolumeCubicMeters - statistics.cutVolumeCubicMeters) <= 1e-6 * statistics.cutVolumeCubicMeters, 'deposited + exported = cut');
    assert.ok(Math.abs(statistics.massBalanceCubicMeters) <= 1e-6 * statistics.cutVolumeCubicMeters, `mass balance ${statistics.massBalanceCubicMeters}`);
    const hollow = indexOf(result.workingGrid, 60, 128), neighbors = neighborTable(result.workingGrid);
    assert.ok(result.heights[hollow] > hollowBase + 1 && result.layers.depositType[hollow] === DEPOSIT_TYPES.talus, `the hollow took talus: ${result.heights[hollow]} m`);
    assert.ok(Math.abs(result.heights[hollow] - reposeCeiling(result.heights, result.workingGrid, neighbors, 64, 30, hollow, Math.tan(34 * DEGREES))) <= 1e-3, 'the hollow filled exactly to the repose plane of its neighbours');
    assert.ok(reposeExcess(result, Math.tan(34 * DEGREES), i => result.layers.depositType[i] === DEPOSIT_TYPES.talus) <= 1e-3, 'talus respects the repose plane everywhere');
    // the rolled-on talus rests on the flat benches and nowhere on the over-repose flanks, not even against the edge column (the ground runs off the grid there)
    let onFlanks = 0, benchTalus = 0;
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.columns; c++) {
        const i = r * grid.columns + c;
        if (i === hollow || result.layers.depositType[i] !== DEPOSIT_TYPES.talus) continue;
        const level = Math.floor(slope(c * 2, 0) / 6);
        if (level % 2 === 1) benchTalus++; else onFlanks++;
    }
    assert.ok(benchTalus > 20 && onFlanks === 0, `talus rests on the benches: ${benchTalus} bench samples, ${onFlanks} on the flanks`);
    assert.ok(invariantError(result) < 2e-3);
    const again = await run(recipeOf(grid, operators), inputs);
    assert.equal(heightsHash(again), heightsHash(result), 'two runs are bit identical');
    again.release(); result.release();
});

test('Repose: hydraulic droplets converging on a funnel floor with heavy loads leave no needle at their end of life, spread what the corners refuse over the brush and balance exactly', async () => {
    // an 11 degree funnel: every droplet erodes down the flank (loads of meters) and dies on the floor, where the old end-of-life deposit stacked its whole load on four samples
    const grid = gridOf(32, 2, 2), funnel = (x, z) => 4 + .2 * Math.hypot(x - 128, z - 128), inputs = { readLandscape: sourceOf(funnel) };
    const params = { droplets: 12000, maxSteps: 200, capacity: 50, erosionRate: 1, maxErosionPerStepMeters: 2, depositionRate: .01, radius: 3 };
    const reference = await referenceOf(grid, [op('import', 'import-heights')], inputs);
    const result = await run(recipeOf(grid, [op('import', 'import-heights'), op('hydraulic', 'hydraulic-erosion', params)]), inputs), statistics = statisticsOf(result, 'hydraulic'), needles = needlesOf(result);
    assert.equal(needles.count, 0, `needles after hydraulic-erosion: ${JSON.stringify(needles)}`);
    assert.equal(statistics.leftGrid, 0);
    assert.ok(statistics.reposeLimitedSamples > 0 && statistics.depositedVolumeCubicMeters > 0, `the floor exercised the bound: ${JSON.stringify(statistics)}`);
    assert.ok(Math.abs(statistics.balanceErrorCubicMeters) <= 1e-6 * statistics.erodedVolumeCubicMeters, `balance ${statistics.balanceErrorCubicMeters}`);
    assert.ok(Math.abs(statistics.exportedVolumeCubicMeters - statistics.endOfLifeExportedVolumeCubicMeters) <= 1e-9 * statistics.erodedVolumeCubicMeters, 'in a closed funnel the only export is what the end of life cannot place');
    assert.ok(Math.abs(volumeOf(result.heights, result.workingGrid) - reference.volume + statistics.exportedVolumeCubicMeters) <= 1e-6 * reference.volume, 'the grid volume follows the export');
    assert.ok(invariantError(result) < 1e-3);
    // a deposit stands above the plane only by what the brush later eroded from a neighbour (the wear layer bounds that undercut)
    assert.ok(reposeExcess(result, Math.tan(34 * DEGREES), i => result.layers.deposition[i] > 0, j => result.layers.wear[j]) <= 1e-3, 'deposits respect the colluvium repose plane up to later undercutting');
    const again = await run(recipeOf(grid, [op('import', 'import-heights'), op('hydraulic', 'hydraulic-erosion', params)]), inputs);
    assert.equal(heightsHash(again), heightsHash(result), 'two runs are bit identical');
    again.release(); result.release();
});

test('Repose: thermal settling into a one-sample pit under a thick mantle never stacks a needle, holds the refused inflow at the donors and conserves mass', async () => {
    // flat ground with a 10 m pit and a 20 m loose mantle: eight donors shedding into the pit used to raise it 28 m above them in one iteration
    const grid = gridOf(32, 1, 2), pit = (x, z) => (x === 64 && z === 64 ? 10 : 20), inputs = { readLandscape: sourceOf(pit) };
    const mantle = { iterations: 1, weatheringRateMetersPerIteration: 20, maxRegolithMeters: 20, weatheringSlopeDegrees: 0 };
    const reference = await referenceOf(grid, [op('import', 'import-heights')], inputs);
    const result = await run(recipeOf(grid, [op('import', 'import-heights'), op('mantle', 'thermal-weathering', mantle), op('settle', 'thermal-weathering', { iterations: 3, weatheringRateMetersPerIteration: 0 })]), inputs);
    const first = statisticsOf(result, 'mantle'), settle = statisticsOf(result, 'settle'), needles = needlesOf(result), center = indexOf(result.workingGrid, 64, 64);
    assert.equal(needles.count, 0, `needles after thermal settling: ${JSON.stringify(needles)}`);
    assert.ok(first.reposeLimitedSamples === 1 && first.reposeHeldVolumeCubicMeters > 0, `the pit refused part of the inflow: ${JSON.stringify(first)}`);
    assert.equal(settle.samplesAboveRepose, 0);
    assert.equal(first.exportedVolumeCubicMeters + settle.exportedVolumeCubicMeters, 0, 'flat ground exports nothing');
    assert.ok(Math.abs(volumeOf(result.heights, result.workingGrid) - reference.volume) <= 1e-6 * reference.volume, 'the volume is conserved');
    const ring = [center - 1, center + 1, center - grid.columns, center + grid.columns].map(i => result.heights[i]);
    assert.ok(result.heights[center] <= Math.min(...ring) + 2 * Math.tan(34 * DEGREES) + 1e-3 && result.heights[center] > 10, `the pit rests within repose of its ring: ${result.heights[center]} vs ${ring}`);
    assert.ok(invariantError(result) < 1e-3);
    result.release();
});
