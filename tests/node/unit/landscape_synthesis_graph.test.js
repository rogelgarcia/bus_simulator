// Verifies the terrain synthesis engine on small synthetic grids: distance transforms, designed edge profiles, constraints, determinism, halos, resampling and cancellation.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { TerrainFieldMemory } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsGrid.mjs';
import { executeSynthesisRecipe } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisGraph.mjs';
import { exactDistanceTransform } from '../../../tools/bake_landscape/terrain_synthesis/operators/Distance.mjs';
import { createHillsRelief } from '../../../tools/bake_landscape/terrain_synthesis/operators/Landforms.mjs';
import { createNoiseField } from '../../../tools/bake_landscape/terrain_synthesis/operators/Warps.mjs';
import { resolveLandscapeSynthesisParameters } from '../../../src/app/landscape/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = path.join(root, 'tests/artifacts/screens/landscape/ai596/d1/engine-tests');
await mkdir(evidence, { recursive: true });
const DEGREES = Math.PI / 180, sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const op = (id, type, params = {}, mask = null) => ({ id, op: type, params, mask, seed: null, enabled: true });
const gridOf = (chunkIntervals, maxLevel, spacing, minX = 0, minZ = 0) => {
    const intervals = chunkIntervals * 2 ** maxLevel;
    return { columns: intervals + 1, rows: intervals + 1, spacingX: spacing, spacingZ: spacing, bounds: { minX, maxX: minX + intervals * spacing, minZ, maxZ: minZ + intervals * spacing }, chunkIntervals, maxLevel };
};
const recipeOf = (grid, operators, { working = null, plan = true, seed = 11, landscape = { directory: 'synthetic', expectedRevision: null } } = {}) => ({
    format: 'landscape-synthesis-recipe', schemaVersion: 1, id: 'graph-test', seed, seaLevel: 0, grid, working,
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
const planOf = (extent, { shoreX = () => 60, road = null, district = null } = {}) => ({
    districts: [district ?? { id: 1, name: 'Hill town', target_elevation_m: 30, typical_design_band_m: '29-31', boundary_xz_m: [[150, 200], [220, 210], [230, 140], [160, 130]] }],
    roads: { coordinate_order: ORDER, roads: [road ?? { name: 'Main', from: 'A', to: 'B', width_m: 7, type: 'collector', length_m: 0, design_max_grade_percent: 1, centerline_xyz_m: Array.from({ length: 41 }, (_, i) => [70 + i * 4, 1 + i * .3, 40 + i * 4]) }] },
    shoreline: { coordinate_order: 'X east, Y sea level, Z north; metres', points_xyz_m: Array.from({ length: 33 }, (_, i) => [shoreX(extent - i * extent / 32), 0, extent - i * extent / 32]) },
    beachPoints: { coordinate_order: ORDER, points: [{ name: 'Bus stop reservation', xyz_m: [100, 2.6, 60], footprint_m: [30, 6] }, { name: 'Level beach arrival', xyz_m: [80, 2.6, 80] }], open_view_corridor_xz_m: [[70, 120], [110, 120], [110, 90], [70, 90]] }
});
const run = (recipe, inputs, options = {}) => executeSynthesisRecipe({ recipe, inputs, memory: new TerrainFieldMemory(512 << 20), ...options });
const sampleAt = (result, x, z) => { const g = result.grid; return result.heights[Math.round((g.maxZ - z) / g.spacingZ) * g.columns + Math.round((x - g.minX) / g.spacingX)]; };

test('Synthesis engine: the separable squared distance transform is exact against brute force with anisotropic spacing', () => {
    const grid = { columns: 37, rows: 29, spacingX: 2, spacingZ: 3, minX: 10, maxZ: 100 }, n = grid.columns * grid.rows, feature = new Uint8Array(n);
    let state = 12345;
    for (let i = 0; i < n; i++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; if (state / 2 ** 32 < .02) feature[i] = 1; }
    feature[5 * grid.columns + 7] = 1;
    const memory = new TerrainFieldMemory(64 << 20), edt = exactDistanceTransform(grid, feature, memory, 'edt');
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.columns; c++) {
        let best = Infinity;
        for (let rr = 0; rr < grid.rows; rr++) for (let cc = 0; cc < grid.columns; cc++) if (feature[rr * grid.columns + cc]) best = Math.min(best, Math.hypot((r - rr) * grid.spacingZ, (c - cc) * grid.spacingX));
        const i = r * grid.columns + c, j = edt.nearest[i];
        assert.ok(Math.abs(edt.distance[i] - best) < 1e-5, `distance at ${c},${r}`);
        assert.ok(feature[j] === 1 && Math.abs(Math.hypot((r - Math.floor(j / grid.columns)) * grid.spacingZ, (c - j % grid.columns) * grid.spacingX) - best) < 1e-9, `nearest feature at ${c},${r}`);
    }
    edt.release();
    assert.equal(memory.bytes, 0);
    const none = exactDistanceTransform(grid, new Uint8Array(n), memory, 'none');
    assert.equal(none.distance[0], Infinity); assert.equal(none.nearest[0], -1);
    none.release();
});

test('Synthesis engine: the escarpment profile builds a flat rim, a face at the declared slope and a talus apron down to the ground', async () => {
    const grid = gridOf(64, 2, 1), polygon = [[60, 200], [100, 200], [100, 60], [60, 60]];
    const params = { polygon, heightMeters: 40, rimWidthMeters: 10, faceSlopeDegrees: 60, faceDropMeters: 20, talusSlopeDegrees: 30, blendMeters: 0, combine: 'max' };
    const result = await run(recipeOf(grid, [op('import', 'import-heights'), op('plateau', 'landform-plateau', params)], { plan: false }), { readLandscape: sourceOf(() => 0) });
    const tanFace = Math.tan(60 * DEGREES), tanTalus = Math.tan(30 * DEGREES), faceRun = 20 / tanFace, toe = 10 + faceRun + 20 / tanTalus;
    const expected = d => d <= 10 ? 40 : d <= 10 + faceRun ? 40 - (d - 10) * tanFace : d <= toe ? 20 - (d - 10 - faceRun) * tanTalus : 0;
    for (let d = 1; d <= 70; d++) assert.ok(Math.abs(sampleAt(result, 100 + d, 130) - expected(d)) < 1e-4, `profile at d=${d}: ${sampleAt(result, 100 + d, 130)} vs ${expected(d)}`);
    assert.equal(sampleAt(result, 80, 130), 40, 'inside the polygon the target replaces the surface');
    assert.equal(sampleAt(result, 105, 130), 40, 'rim band');
    assert.ok(Math.abs((sampleAt(result, 112, 130) - sampleAt(result, 120, 130)) / 8 - tanFace) < 1e-6, 'measured face slope');
    assert.ok(Math.abs((sampleAt(result, 125, 130) - sampleAt(result, 150, 130)) / 25 - tanTalus) < 1e-6, 'measured talus slope');
    assert.equal(sampleAt(result, 100 + 70, 130), 0, 'untouched beyond the toe');
    const statistics = result.report.operators[1].statistics;
    assert.equal(statistics.loweredSamples, 0);
    // the designed run dilates the 40 x 140 m polygon by the 56.19 m toe: about 35.7k of the 66k samples
    assert.ok(statistics.raisedSamples > statistics.insideSamples && statistics.raisedSamples > 34000 && statistics.raisedSamples < 37500, `raised ${statistics.raisedSamples}`);
    result.release();
    const feather = await run(recipeOf(grid, [op('import', 'import-heights'), op('plateau', 'landform-plateau', { polygon, heightMeters: 40, profile: 'feather', featherMeters: 50, combine: 'replace' })], { plan: false }), { readLandscape: sourceOf(() => 0) });
    const smooth = t => { const s = Math.min(1, Math.max(0, t)); return s * s * (3 - 2 * s); };
    for (let d = 1; d <= 60; d++) assert.ok(Math.abs(sampleAt(feather, 100 + d, 130) - 40 * (1 - smooth(d / 50))) < 1e-4, `feather at d=${d}`);
    feather.release();
    // a v2-style flank (40 m plateau feathered to 5 m over 150 m east of x=100): replace with the probe base removes the feather behind the escarpment
    const flank = x => x <= 100 ? 40 : 5 + 35 * (1 - smooth((x - 100) / 150));
    const carved = await run(recipeOf(grid, [op('import', 'import-heights'), op('plateau', 'landform-plateau', { ...params, combine: 'replace', baseMode: 'probe', baseProbeMeters: 150 })], { plan: false }), { readLandscape: sourceOf(x => flank(x)) });
    assert.equal(carved.report.operators[1].statistics.baseMode, 'probe');
    const probeToe = 10 + faceRun + 15 / tanTalus;
    for (let d = 1; d <= 155; d++) {
        const expectedCarved = d <= 10 ? 40 : d <= 10 + faceRun ? 40 - (d - 10) * tanFace : d <= probeToe ? 20 - (d - 10 - faceRun) * tanTalus : d <= 150 ? Math.min(flank(100 + d), 5) : flank(100 + d);
        assert.ok(Math.abs(sampleAt(carved, 100 + d, 130) - expectedCarved) < 1e-4, `probe base at d=${d}: ${sampleAt(carved, 100 + d, 130)} vs ${expectedCarved}`);
    }
    assert.ok(Math.abs((sampleAt(carved, 112, 130) - sampleAt(carved, 120, 130)) / 8 - tanFace) < 1e-6, 'the face is cut into the flank at the declared slope');
    const sampled = await run(recipeOf(grid, [op('import', 'import-heights'), op('plateau', 'landform-plateau', { ...params, combine: 'replace', baseMode: 'sample-ground' })], { plan: false }), { readLandscape: sourceOf(x => flank(x)) });
    assert.ok(Math.abs(sampleAt(sampled, 115, 130) - flank(115)) < 1e-6, 'sample-ground cannot cut into a flank above the profile');
    // daylight on ground that dips under the rim, rises above the face, then falls away: the face is cut, the talus buries the low ground and daylights at the last crossing
    const cliffy = x => x <= 100 ? 40 : x <= 130 ? 40 - (x - 100) * .3 : x <= 170 ? 31 - (x - 130) * 1.2 : -17;
    const daylit = await run(recipeOf(grid, [op('import', 'import-heights'), op('plateau', 'landform-plateau', { ...params, combine: 'replace' })], { plan: false }), { readLandscape: sourceOf(x => cliffy(x)) });
    assert.equal(daylit.report.operators[1].statistics.baseMode, 'daylight'); assert.equal(daylit.report.operators[1].statistics.undaylightedSamples, 0);
    assert.ok(Math.abs(sampleAt(daylit, 115, 130) - (40 - 5 * tanFace)) < 1e-4, 'the face is cut where the ground is above the descent');
    const talusAt = d => 20 - (d - 10 - faceRun) * tanTalus, daylightToe = 10 + faceRun + 37 / tanTalus;
    assert.ok(Math.abs(sampleAt(daylit, 180, 130) - talusAt(80)) < 1e-4, 'the talus buries the low ground before it daylights');
    assert.ok(daylightToe > 80 && daylightToe < 90 && Math.abs(sampleAt(daylit, 100 + 95, 130) + 17) < 1e-6 && Math.abs(sampleAt(daylit, 240, 130) + 17) < 1e-6, 'beyond the daylight toe the ground is untouched');
    carved.release(); sampled.release(); daylit.release();
});

test('Synthesis engine: plan inputs rasterize districts, a signed shoreline and exact road distances with design heights', async () => {
    const grid = gridOf(32, 2, 2), extent = 256;
    const result = await run(recipeOf(grid, [op('import', 'import-heights'), op('plan', 'plan-inputs', { apronPolygon: null, runwayPolygon: [[180, 100], [190, 100], [190, 40], [180, 40]] })]), { readLandscape: sourceOf((x, z) => (x - 60) * .1), planFiles: planOf(extent) });
    const at = (layer, x, z) => result.layers[layer][Math.round((extent - z) / 2) * grid.columns + Math.round(x / 2)];
    assert.equal(at('districtId', 190, 170), 1); assert.equal(at('districtId', 40, 40), 0);
    assert.equal(at('landMask', 200, 128), 1); assert.equal(at('landMask', 20, 128), 0);
    assert.ok(Math.abs(at('shoreSigned', 200, 128) - 140) < 1e-3 && Math.abs(at('shoreSigned', 20, 128) + 40) < 1e-3, 'signed distance to the straight design shoreline at x=60');
    assert.equal(at('roadDistance', 70, 40), 0); assert.ok(Math.abs(at('roadHeight', 70, 40) - 1) < 1e-6); assert.equal(at('roadWidth', 70, 40), 7); assert.equal(at('roadIndex', 70, 40), 0);
    assert.ok(Math.abs(at('roadDistance', 70 + 40, 40) - 40 / Math.SQRT2) < 1e-3, 'exact distance to the diagonal centerline');
    assert.equal(at('corridorMask', 90, 100), 1); assert.equal(at('runwayMask', 184, 70), 1); assert.equal(at('apronMask', 184, 70), 0);
    assert.deepEqual(result.report.inputs.map(entry => entry.id), ['landscape', 'plan/beachPoints', 'plan/districts', 'plan/roads', 'plan/shoreline']);
    result.release();
});

test('Synthesis engine: constrain-roads limits the centerline grade and builds cut and fill shoulders at the declared slopes', async () => {
    const grid = gridOf(32, 2, 2), extent = 256, terrain = x => .05 * x + 3 * Math.sin(x / 8);
    const road = { name: 'Straight', from: 'A', to: 'B', width_m: 7, type: 'collector', length_m: 224, design_max_grade_percent: 0, centerline_xyz_m: Array.from({ length: 57 }, (_, i) => [16 + i * 4, 0, 128]) };
    // the 3 m ripple is far steeper than the grade, so the fitted ends sit up to about 1.6 m off the ground: declare that tolerance
    const params = { maxGradePercent: 6, profileSmoothingMeters: 0, marginMeters: 1, shoulderWidthMeters: 10, cutSlopeDegrees: 45, fillSlopeDegrees: 30, endFitToleranceMeters: 2 };
    const result = await run(recipeOf(grid, [op('import', 'import-heights'), op('plan', 'plan-inputs', { apronPolygon: null, runwayPolygon: null }), op('roads', 'constrain-roads', params)]),
        { readLandscape: sourceOf(x => terrain(x)), planFiles: planOf(extent, { shoreX: () => 2, road }) });
    const statistics = result.report.operators[2].statistics;
    assert.equal(statistics.roads[0].feasible, true);
    assert.ok(statistics.roads[0].endDeviationMeters.every(value => value < 2), `fitted ends ${statistics.roads[0].endDeviationMeters}`);
    assert.ok(statistics.roads[0].sampledMaxGradePercent > 20, 'the raw terrain is far steeper than the limit');
    assert.ok(statistics.maxGradePercent <= 6 + 1e-9, `profile grade ${statistics.maxGradePercent}`);
    for (let i = 1; i < 57; i++) {
        const grade = Math.abs(sampleAt(result, 16 + i * 4, 128) - sampleAt(result, 16 + (i - 1) * 4, 128)) / 4 * 100;
        assert.ok(grade <= 6 + 1e-3, `terrain grade along the centerline at station ${i} (float32 storage): ${grade}`);
    }
    const H = x => sampleAt(result, x, 128), run4 = 8 - 4.5;
    let cuts = 0, fills = 0;
    for (const x of [40, 60, 80, 100, 120, 140, 160, 180, 200]) {
        const G = terrain(x), expected = G > H(x) ? Math.min(G, H(x) + run4 * Math.tan(45 * DEGREES)) : Math.max(G, H(x) - run4 * Math.tan(30 * DEGREES));
        assert.ok(Math.abs(sampleAt(result, x, 136) - expected) < 1e-4, `shoulder at x=${x}: ${sampleAt(result, x, 136)} vs ${expected}`);
        if (G > H(x)) cuts++; else fills++;
        assert.ok(Math.abs(sampleAt(result, x, 160) - G) < 1e-6, 'beyond the shoulder the terrain is untouched');
    }
    assert.ok(cuts > 0 && fills > 0, 'both cut and fill cases were measured');
    assert.ok(Math.abs(result.layers.roadHeight[64 * grid.columns + 50] - H(100)) < 1e-6, 'road layers carry the constrained profile');
    result.release();
});

test('Synthesis engine: constrain-shoreline keeps the sea-level crossing within the tolerance of the design shoreline', async () => {
    const grid = gridOf(32, 2, 2), extent = 256;
    const operators = [op('import', 'import-heights'), op('plan', 'plan-inputs', { apronPolygon: null, runwayPolygon: null }), op('shore', 'constrain-shoreline', { toleranceMeters: 10, minLandHeightMeters: .3, maxSeaHeightMeters: -.3, bandSlopeDegrees: 12, blendMeters: 30 })];
    const result = await run(recipeOf(grid, operators), { readLandscape: sourceOf(x => (x - 140) * .1), planFiles: planOf(extent, { shoreX: () => 100 }) });
    assert.equal(result.report.operators[2].statistics.crossingViolations, 0);
    for (let row = 0; row < grid.rows; row++) {
        let crossing = null;
        for (let column = 0; column < grid.columns; column++) {
            const x = column * 2, h = result.heights[row * grid.columns + column];
            if (x >= 110) assert.ok(h >= .3 - 1e-6, `land at x=${x} row ${row}: ${h}`);
            if (x <= 90) assert.ok(h <= -.3 + 1e-6, `sea at x=${x} row ${row}: ${h}`);
            if (crossing === null && h >= 0) crossing = x;
        }
        assert.ok(crossing >= 90 && crossing <= 110, `crossing at ${crossing} in row ${row}`);
    }
    assert.ok(Math.abs(sampleAt(result, 240, 128) - 10) < 1e-6, 'far land is untouched');
    result.release();
});

const FULL = extent => [op('import', 'import-heights'), op('plan', 'plan-inputs', { runwayPolygon: [[180, 100], [190, 100], [190, 40], [180, 40]], apronPolygon: null }),
    op('plateau', 'landform-plateau', { districtId: 1, rimWidthMeters: 6, faceDropMeters: 8, blendMeters: 10 }),
    op('hills', 'landform-hills', { amplitudeMeters: 6, wavelengthsMeters: [80, 40, 20], amplitudes: [1, .5, .25], warpMeters: 10, warpWavelengthMeters: 60 }, { type: 'min', selectors: [{ type: 'distance', feature: 'shoreline', edge: { from: 20, to: 60 } }, { type: 'district', ids: [1], invert: true }] }),
    op('valley', 'landform-valley', { polyline: [[120, 240], [140, 160], [170, 120]], widthMeters: 30, depthMeters: 4 }),
    op('warp', 'warp', { strengthMeters: 4, wavelengthsMeters: [50, 20], amplitudes: [1, .5] }),
    op('noise', 'noise', { amplitudeMeters: .5, wavelengthsMeters: [16, 8, 4], amplitudes: [1, .5, .25] }, { type: 'multiply', selectors: [{ type: 'slope', edge: { from: 2, to: 10 } }, { type: 'flow', edge: { from: 4, to: 2 } }, { type: 'cover', classes: [2] }, { type: 'curvature', edge: { from: -.01, to: .01 }, scaleMeters: 6 }] }),
    op('districts', 'constrain-districts', { inside: 'band', bandMeters: 1, maxSlopeDegrees: 8 }), op('roads', 'constrain-roads', { shoulderWidthMeters: 8 }), op('shore', 'constrain-shoreline'),
    op('points', 'constrain-points', { corridorOrigin: [90, 90], corridorRunMeters: 30, corridorInlandHeightMeters: 6 }), op('runway', 'constrain-runway', { heightMeters: 12 }), op('cap', 'height-cap', { capMeters: 32, shoulderMeters: 4 })];

test('Synthesis engine: every operator runs on the synthetic plan and two runs are bit identical', async () => {
    const grid = gridOf(32, 2, 2), extent = 256, inputs = { readLandscape: sourceOf((x, z) => (x - 60) * .12 + 3 * Math.sin(z / 40), x => x < 60 ? 0 : x < 80 ? 1 : 2), planFiles: planOf(extent) };
    const first = await run(recipeOf(grid, FULL(extent)), inputs), second = await run(recipeOf(grid, FULL(extent)), inputs);
    assert.equal(first.report.operators.length, 13);
    assert.equal(sha256(Buffer.from(first.heights.buffer)), sha256(Buffer.from(second.heights.buffer)), 'identical heights');
    assert.deepEqual(first.report.operators.map(entry => entry.statistics), second.report.operators.map(entry => entry.statistics), 'identical statistics');
    assert.equal(first.report.identity, second.report.identity);
    assert.match(first.report.identity, /^synthesis-[a-f0-9]{24}$/);
    const byOp = Object.fromEntries(first.report.operators.map(entry => [entry.op, entry.statistics]));
    assert.ok(byOp['landform-valley'].carvedSamples > 0 && byOp.noise.octaves === 3 && byOp['constrain-districts'].slopeLimitedSamples >= 0 && byOp['constrain-shoreline'].crossingViolations === 0);
    assert.ok(byOp['constrain-points'].pads['Level beach arrival'].samples > 0 && byOp['constrain-points'].footprints['Bus stop reservation'].samples > 0 && byOp['constrain-points'].corridor.samples > 0);
    assert.ok(Math.abs(sampleAt(first, 80, 80) - 2.6) < 1e-6 && Math.abs(sampleAt(first, 100, 60) - 2.6) < 1e-6, 'pads are level at their heights');
    assert.ok(byOp['height-cap'].cappedSamples > 0 && first.heights.every(h => h <= 32 + 1e-6));
    for (const h of first.heights) assert.ok(Number.isFinite(h));
    first.release(); second.release();
    const reseeded = await run(recipeOf(grid, FULL(extent), { seed: 12 }), inputs);
    assert.notEqual(sha256(Buffer.from(reseeded.heights.buffer)), sha256(Buffer.from(first.heights.buffer)), 'another recipe seed changes the relief');
    reseeded.release();
});

test('Synthesis engine: noise and hills are world anchored, so a window with a halo reproduces the global result exactly', async () => {
    const heightAt = (x, z) => .01 * x + .02 * z, operators = [op('import', 'import-heights'), op('hills', 'landform-hills', { amplitudeMeters: 9, wavelengthsMeters: [60, 30, 15], amplitudes: [1, .5, .25], warpMeters: 12, warpWavelengthMeters: 80, anisotropy: 1.5, bearingDegrees: 30 }),
        op('noise', 'noise', { amplitudeMeters: 1.5, wavelengthsMeters: [20, 10, 5], amplitudes: [1, .5, .25], shaping: 'ridged-mix', ridgedMix: .4 })];
    const global = await run(recipeOf(gridOf(32, 2, 2), operators, { plan: false }), { readLandscape: sourceOf(heightAt) });
    const window = await run(recipeOf(gridOf(16, 2, 2, 32, 32), operators, { plan: false }), { readLandscape: sourceOf(heightAt) });
    assert.equal(window.grid.minX, 32); assert.equal(window.grid.maxZ, 160);
    let compared = 0;
    for (let r = 0; r < window.grid.rows; r++) for (let c = 0; c < window.grid.columns; c++) {
        const globalIndex = (r + 48) * global.grid.columns + c + 16;
        assert.ok(Object.is(window.heights[r * window.grid.columns + c], global.heights[globalIndex]), `window ${c},${r} differs from the global grid`);
        compared++;
    }
    assert.equal(compared, 65 * 65);
    const hills = createHillsRelief(global.report.operators[1].statistics.seed, resolveLandscapeSynthesisParameters(operators[1])), noise = createNoiseField(global.report.operators[2].statistics.seed, resolveLandscapeSynthesisParameters(operators[2]));
    assert.ok(Object.is(global.heights[100 * 129 + 70], Math.fround(Math.fround(Math.fround(heightAt(140, 56)) + hills(140, 56)) + noise(140, 56))), 'the sampled fields reproduce the layer arithmetic');
    global.release(); window.release();
});

test('Synthesis engine: a coarse working grid resamples to the output grid with exact bounds, corners and aligned samples, keeping the native cover', async () => {
    const heightAt = (x, z) => 5 + .002 * (x - 128) ** 2 - .001 * (z - 100) ** 2 + 2 * Math.sin(x / 15), coverAt = (x, z) => ((x + z) / 2) % 7;
    for (const [filter, decimation] of [['bilinear', 'tent'], ['bicubic', 'tent'], ['bicubic', 'nearest']]) {
        const grid = gridOf(32, 2, 2), operators = [op('import', 'import-heights', { filter: decimation }), op('out', 'resample', { filter })];
        const result = await run(recipeOf(grid, operators, { plan: false, working: { spacing: 4 } }), { readLandscape: sourceOf(heightAt, coverAt) });
        assert.deepEqual(result.report.working, { spacing: 4, columns: 65, rows: 65 });
        assert.equal(result.report.resampled, true); assert.equal(result.report.resampleFilter, filter);
        assert.equal(result.heights.length, 129 * 129); assert.equal(result.cover.length, 129 * 129);
        assert.deepEqual([result.grid.minX, result.grid.maxZ, result.grid.spacingX, result.grid.columns], [0, 256, 2, 129]);
        const working = result.layers.height;
        for (let r = 0; r < 65; r++) for (let c = 0; c < 65; c++) assert.ok(Object.is(result.heights[r * 2 * 129 + c * 2], working[r * 65 + c]), `${filter}: aligned sample ${c},${r} is exact`);
        for (const [c, r] of [[0, 0], [128, 0], [0, 128], [128, 128]]) assert.ok(Object.is(result.heights[r * 129 + c], working[(r / 2) * 65 + c / 2]), `${filter}: corner ${c},${r}`);
        if (decimation === 'nearest') for (let r = 0; r < 65; r++) for (let c = 0; c < 65; c++) assert.equal(working[r * 65 + c], Math.fround(heightAt(c * 4, 256 - r * 4)), 'nearest decimation keeps aligned native values');
        for (let r = 0; r < 129; r++) for (let c = 0; c < 129; c++) assert.equal(result.cover[r * 129 + c], coverAt(c * 2, 256 - r * 2), 'the output cover is the native cover');
        if (filter === 'bilinear') {
            const value = result.heights[65 * 129 + 65], a = working[32 * 65 + 32], b = working[32 * 65 + 33], c = working[33 * 65 + 32], d = working[33 * 65 + 33];
            assert.ok(Math.abs(value - (a + b + c + d) / 4) < 1e-5, 'a centered sample is the mean of its four working neighbors');
        }
        let worst = 0;
        for (let r = 1; r < 128; r += 7) for (let c = 1; c < 128; c += 5) worst = Math.max(worst, Math.abs(result.heights[r * 129 + c] - heightAt(c * 2, 256 - r * 2)));
        assert.ok(worst < 1.5, `${filter} ${decimation}: resampled heights stay close to the smooth source (worst ${worst})`);
        result.release();
    }
});

test('Synthesis engine: an aborted signal stops with AbortError and leaves no tracked arrays', async () => {
    const grid = gridOf(32, 2, 2), extent = 256, inputs = { readLandscape: sourceOf(x => x * .1), planFiles: planOf(extent) };
    const aborted = new AbortController(); aborted.abort();
    const memory = new TerrainFieldMemory(512 << 20);
    await assert.rejects(executeSynthesisRecipe({ recipe: recipeOf(grid, FULL(extent)), inputs, memory, signal: aborted.signal }), error => error.name === 'AbortError');
    assert.equal(memory.bytes, 0); assert.equal(memory.entries.size, 0);
    const controller = new AbortController(), progress = [];
    await assert.rejects(executeSynthesisRecipe({ recipe: recipeOf(grid, FULL(extent)), inputs, memory, signal: controller.signal, onProgress: event => { progress.push(event); if (event.phase === 'done' && event.index === 2) controller.abort(); } }),
        error => error.name === 'AbortError');
    assert.equal(memory.bytes, 0, 'a mid-run abort releases every tracked array');
    assert.ok(progress.some(event => event.phase === 'start' && event.id === 'plateau') && !progress.some(event => event.id === 'valley'), 'execution stopped after the abort');
});

test('Synthesis engine: import-heights reads a saved landscape directory and raw float32 files, binding the exact grid', async () => {
    const fixture = createLandscapeModelFixture({ chunkIntervals: 16, maxLevel: 2, minX: 0, minZ: 0, spacing: 2, heightAt: (c, r) => Math.fround(c * .3 - r * .1 + 2 * Math.sin(c / 5)), coverAt: (c, r) => c < 12 ? 0 : r < 20 ? 2 : 3 });
    const directory = path.join(await mkdtemp(path.join(evidence, 'fixture-')), 'saved');
    for (const [url, bytes] of fixture.resources) { const file = path.join(directory, url); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
    const grid = gridOf(16, 2, 2), landscape = { directory, expectedRevision: 'fixture-r1' };
    const result = await run(recipeOf(grid, [op('import', 'import-heights')], { plan: false, landscape }), {});
    assert.equal(sha256(Buffer.from(result.heights.buffer)), sha256(Buffer.from(fixture.sourceHeights.buffer)));
    assert.equal(sha256(result.cover), sha256(fixture.sourceCover));
    assert.equal(result.report.operators[0].statistics.revision, 'fixture-r1');
    assert.equal(result.report.inputs[0].id, 'landscape');
    result.release();
    await assert.rejects(run(recipeOf(grid, [op('import', 'import-heights')], { plan: false, landscape: { directory, expectedRevision: 'other' } }), {}), /revision fixture-r1, the recipe expects other/);
    await assert.rejects(run(recipeOf(gridOf(16, 2, 4), [op('import', 'import-heights')], { plan: false, landscape }), {}), /grid spacingX 2 differs from the recipe grid 4/);
    const raw = Buffer.alloc(fixture.sourceHeights.length * 4);
    fixture.sourceHeights.forEach((value, i) => raw.writeFloatLE(value, i * 4));
    const imported = await run(recipeOf(grid, [op('import', 'import-heights', { source: 'raw-float32', file: 'heights.raw', columns: 65, rows: 65, coverClass: 4 })], { plan: false, landscape: null }), { readFile: () => raw });
    assert.equal(sha256(Buffer.from(imported.heights.buffer)), sha256(Buffer.from(fixture.sourceHeights.buffer)));
    assert.ok(imported.cover.every(value => value === 4));
    assert.equal(imported.report.inputs[0].id, 'import/heights');
    imported.release();
    await assert.rejects(run(recipeOf(grid, [op('import', 'import-heights', { source: 'raw-float32', file: 'heights.raw', columns: 65, rows: 65 })], { plan: false, landscape: null }), { readFile: () => raw.subarray(4) }), /holds \d+ bytes/);
});

test('Synthesis engine: insideMode keep leaves the plateau interior unchanged and cuts the edge from the boundary ground (a bluff along a terrace)', async () => {
    const grid = gridOf(64, 2, 1), polygon = [[0, 200], [100, 200], [100, 60], [0, 60]];
    // a 20 m terrace at x <= 100 that ramps down to a 2 m beach over 140 m (the v2 beach-to-centre rise)
    const terrace = x => x <= 100 ? 20 : Math.max(2, 20 - (x - 100) * (18 / 140));
    const params = { polygon, insideMode: 'keep', rimWidthMeters: 4, faceSlopeDegrees: 65, faceDropMeters: 0, blendMeters: 0, baseMode: 'probe', baseProbeMeters: 45, combine: 'replace' };
    const result = await run(recipeOf(grid, [op('import', 'import-heights'), op('bluff', 'landform-plateau', params)], { plan: false }), { readLandscape: sourceOf(x => terrace(x)) });
    const tanFace = Math.tan(65 * DEGREES), base = terrace(145), toe = 4 + (20 - base) / tanFace;
    const expected = d => d <= 4 ? 20 : d <= toe ? 20 - (d - 4) * tanFace : d <= 45 ? base : terrace(100 + d);
    for (const x of [10, 50, 99]) assert.equal(sampleAt(result, x, 130), 20, `inside unchanged at x=${x}`);
    for (let d = 1; d <= 80; d++) assert.ok(Math.abs(sampleAt(result, 100 + d, 130) - expected(d)) < 1e-4, `bluff profile at d=${d}: ${sampleAt(result, 100 + d, 130)} vs ${expected(d)}`);
    const statistics = result.report.operators[1].statistics;
    assert.equal(statistics.insideMode, 'keep'); assert.equal(statistics.heightMeters, null);
    // only the rim band at the two polygon corners lifts ramp samples to the terrace height; the bluff itself only cuts
    assert.ok(statistics.raisedSamples < 1000 && statistics.maxRaiseMeters < 1, `corner rim raises ${statistics.raisedSamples} samples by ${statistics.maxRaiseMeters} m`);
    assert.ok(statistics.loweredSamples > 5000, `the bluff cut lowers the ramp: ${statistics.loweredSamples}`);
    result.release();
    await assert.rejects(run(recipeOf(grid, [op('import', 'import-heights'), op('bluff', 'landform-plateau', { ...params, heightMeters: 12 })], { plan: false }), { readLandscape: sourceOf(x => terrace(x)) }), /does not apply when insideMode is keep/);
});

test('Synthesis engine: the extrapolate base removes a feather without a bench and roads hold a level approach into their end nodes', async () => {
    // 513 m wide so the probe distance plus the extrapolation span (x = 300) stays inside the grid (positions outside clamp to the edge)
    const grid = gridOf(128, 2, 1), polygon = [[60, 200], [100, 200], [100, 60], [60, 60]];
    const smooth = t => { const s = Math.min(1, Math.max(0, t)); return s * s * (3 - 2 * s); };
    // a 40 m plateau feathered over 150 m onto natural ground that slopes 2 percent away from the plateau: natural 14 m at x=100
    const natural = x => 14 - (x - 100) * .02, flank = x => x <= 100 ? 40 : natural(x) + (40 - natural(x)) * (1 - smooth((x - 100) / 150));
    const params = { polygon, heightMeters: 40, rimWidthMeters: 10, faceSlopeDegrees: 60, faceDropMeters: 15, talusSlopeDegrees: 30, blendMeters: 0, baseMode: 'extrapolate', baseProbeMeters: 150, extrapolationMeters: 50, combine: 'replace' };
    const result = await run(recipeOf(grid, [op('import', 'import-heights'), op('plateau', 'landform-plateau', params)], { plan: false }), { readLandscape: sourceOf(x => flank(x)) });
    const tanFace = Math.tan(60 * DEGREES), tanTalus = Math.tan(30 * DEGREES), descent = d => d <= 10 ? 40 : d <= 10 + 15 / tanFace ? 40 - (d - 10) * tanFace : 25 - (d - 10 - 15 / tanFace) * tanTalus;
    // the talus daylights where the descent meets the extrapolated natural line; beyond it the old feather is cut down to that line
    let toe = 10; while (descent(toe) > natural(100 + toe)) toe += .001;
    for (let d = 1; d <= 149; d++) {
        const expected = d <= toe ? descent(d) : natural(100 + d), actual = sampleAt(result, 100 + d, 130);
        assert.ok(Math.abs(actual - expected) < .02, `extrapolated profile at d=${d}: ${actual} vs ${expected}`);
    }
    assert.ok(Math.abs(sampleAt(result, 260, 130) - flank(260)) < 1e-6, 'untouched beyond the probe distance');
    assert.equal(result.report.operators[1].statistics.undaylightedSamples, 0);
    result.release();
    // a road climbing onto the plateau: its last 30 m stay at the plateau height, the approach below is limited to 6 percent
    const roadGrid = gridOf(64, 2, 2), road = { name: 'Ascent', from: 'A', to: 'B', width_m: 7, type: 'collector', length_m: 0, design_max_grade_percent: 1, centerline_xyz_m: Array.from({ length: 161 }, (_, i) => [20 + i * 3, 0, 128]) };
    // 24 m of climb over 450 m is feasible at 6 percent with margin; the raw ground steps up 20 m before the end node
    const ground = x => x < 440 ? 2 : x < 460 ? 2 + (x - 440) * 1.2 : 26;
    const roads = await run(recipeOf(roadGrid, [op('import', 'import-heights'), op('plan', 'plan-inputs'), op('roads', 'constrain-roads', { maxGradePercent: 6, profileSmoothingMeters: 0, junctionLevelMeters: 30, shoulderWidthMeters: 10 })]),
        { readLandscape: sourceOf(x => ground(x)), planFiles: planOf(256, { road, shoreX: () => -1 }) });
    const profile = roads.report.operators[2].statistics.roads[0];
    assert.ok(profile.maxGradePercent <= 6 + 1e-9, `limited grade ${profile.maxGradePercent}`);
    for (const x of [476, 485, 494, 500]) assert.ok(Math.abs(sampleAt(roads, x, 128) - 26) < 1e-3, `level approach at x=${x}: ${sampleAt(roads, x, 128)}`);
    assert.ok(sampleAt(roads, 440, 128) < 26 - 0.06 * 25, 'the approach below the level section descends');
    assert.ok(profile.feasible && profile.endDeviationMeters.every(value => value < .25), `fitted ends ${profile.endDeviationMeters}`);
    roads.release();
});

test('Synthesis engine: an embankment edge descends from the boundary itself (no escarpment rim), fills a bank to the lower ground and leaves a short blended cut where the ground stands above the pad', async () => {
    // a 10 m pad on flat 2 m ground to the west (fill side) and 18 m ground to the east (cut side); the embankment is 30 degrees, blended over 4 m
    const grid = gridOf(64, 2, 1), polygon = [[100, 200], [160, 200], [160, 60], [100, 60]], ground = x => (x < 160 ? 2 : 18), DEG = Math.PI / 180;
    const params = { polygon, heightMeters: 10, profile: 'embankment', slopeDegrees: 30, baseMode: 'daylight', daylightReachMeters: 100, combine: 'blend', blendMeters: 4 };
    const result = await run(recipeOf(grid, [op('import', 'import-heights'), op('pad', 'landform-plateau', params)], { plan: false }), { readLandscape: sourceOf(x => ground(x)) });
    const toe = 8 / Math.tan(30 * DEG);
    for (let d = 1; d <= 40; d++) {
        const actual = sampleAt(result, 100 - d, 130), expected = d <= toe - 4 ? 10 - d * Math.tan(30 * DEG) : d >= toe + 4 ? 2 : null;
        if (expected !== null) assert.ok(Math.abs(actual - expected) < .05, `bank at d=${d}: ${actual} vs ${expected}`);
        assert.ok(actual >= 2 - 1e-6 && actual <= 10 + 1e-6, `the bank never cuts below the ground or above the pad at d=${d}: ${actual}`);
    }
    assert.ok(Math.abs(sampleAt(result, 130, 130) - 10) < 1e-6 && Math.abs(sampleAt(result, 40, 130) - 2) < 1e-6, 'pad and far ground untouched');
    // cut side: the ground above the pad is reached within the blend width, never trenched below either level
    for (let d = 1; d <= 30; d++) { const actual = sampleAt(result, 160 + d, 130); assert.ok(actual >= 10 - 1e-6 && actual <= 18 + 1e-6, `cut at d=${d}: ${actual}`); if (d >= 5) assert.ok(Math.abs(actual - 18) < 1e-6, `ground restored beyond the blend at d=${d}: ${actual}`); }
    assert.equal(result.report.operators[1].statistics.undaylightedSamples, 0);
    assert.ok(result.report.operators[1].statistics.maxLowerMeters < 8.5, `nothing is lowered more than the pad step: ${result.report.operators[1].statistics.maxLowerMeters}`);
    result.release();
});
