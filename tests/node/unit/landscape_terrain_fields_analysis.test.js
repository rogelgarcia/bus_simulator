// Verifies the global terrain-field analyses on synthetic grids: flow, depressions, flats, horizons, sky view, shore distance and inference.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TerrainFieldMemory, gaussianBoxRadii, gaussianSmooth, terrainGradient } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsGrid.mjs';
import { flowAccumulation, priorityFlood, resolveFlats } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsHydrology.mjs';
import { TERRAIN_HORIZON_STORED_STEPS, horizonScratch, horizonSine, horizonStepAzimuth, skyViewDirections, skyViewSlice, sweepHorizon } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsHorizon.mjs';
import { shoreDistance } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsShore.mjs';
import { computeTerrainFields } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsGlobal.mjs';
import { LANDSCAPE_TERRAIN_FIELD_CHANNELS, decodeLandscapeTerrainField } from '../../../src/app/landscape/index.js';

const recipe = JSON.parse(await readFile(path.resolve('tools/bake_landscape/terrain_fields/recipe-v1.json'), 'utf8'));
const memory = () => new TerrainFieldMemory(256 * 1024 * 1024);
const gridOf = (columns, rows, spacing = 2) => ({ columns, rows, spacingX: spacing, spacingZ: spacing, minX: 0, maxZ: (rows - 1) * spacing });
const field = (grid, f) => Float32Array.from({ length: grid.columns * grid.rows }, (_, i) => f(i % grid.columns, Math.floor(i / grid.columns)));
const outletMask = (grid, heights, seaLevel = -Infinity) => Uint8Array.from(heights, (h, i) => {
    const c = i % grid.columns, r = Math.floor(i / grid.columns);
    return r === 0 || c === 0 || r === grid.rows - 1 || c === grid.columns - 1 || h < seaLevel ? 1 : 0;
});
function route(grid, heights, exponent = 1.1) {
    const m = memory(), flood = priorityFlood(grid, heights, outletMask(grid, heights), m), flats = resolveFlats(grid, flood, m);
    return { flood, flats, ...flowAccumulation(grid, flood, flats, exponent, m) };
}

test('Terrain fields: MFD on a tilted plane conserves area and grows linearly downslope away from the side edges', () => {
    const grid = gridOf(41, 41), heights = field(grid, c => 100 - c * .5), { area, flood } = route(grid, heights), cell = grid.spacingX * grid.spacingZ;
    let outletArea = 0;
    for (let i = 0; i < area.length; i++) if (flood.outlet[i]) outletArea += area[i];
    assert.ok(Math.abs(outletArea - area.length * cell) < 1e-6 * area.length * cell, 'every unit of area reaches an outlet exactly once');
    const middle = 20;
    for (let c = 3; c < 18; c++) assert.ok(Math.abs(area[middle * grid.columns + c] / cell - c) < 1e-9, `column ${c} carries ${c} upslope cells on the symmetric center row`);
});

test('Terrain fields: a cone spreads flow isotropically and a V valley concentrates it on the axis', () => {
    const cone = gridOf(61, 61), coneHeights = field(cone, (c, r) => 40 - Math.hypot(c - 30, r - 30)), coneArea = route(cone, coneHeights).area;
    const at = (c, r) => coneArea[r * cone.columns + c];
    const samples = [at(30 + 12, 30), at(30 - 12, 30), at(30, 30 + 12), at(30, 30 - 12)];
    assert.ok(Math.max(...samples) / Math.min(...samples) < 1.0001, `axis samples at equal radius agree: ${samples}`);
    const valley = gridOf(41, 61), valleyHeights = field(valley, (c, r) => Math.abs(c - 20) * .4 + (60 - r) * .2), valleyArea = route(valley, valleyHeights).area;
    const axis = valleyArea[50 * valley.columns + 20], side = valleyArea[50 * valley.columns + 26];
    assert.ok(axis > 20 * side, `axis accumulation ${axis} must dominate the side slope ${side}`);
});

test('Terrain fields: Priority-Flood fills a closed pit to its spill level and flats drain through their low edge without stranded samples', () => {
    const grid = gridOf(31, 31), heights = field(grid, (c, r) => 10 + c * .1 - 3 * Math.max(0, 1 - Math.hypot(c - 15, r - 15) / 6));
    const { flood, flats, area } = route(grid, heights);
    assert.ok(flood.statistics.filledSamples > 50 && flood.statistics.maximumFillMeters > 2);
    for (let r = 12; r <= 18; r++) for (let c = 12; c <= 18; c++) assert.ok(flood.filled[r * grid.columns + c] >= heights[r * grid.columns + c]);
    assert.ok(flats.statistics.flatSamples > 0 && flats.statistics.undrainedFlatSamples === 0);
    let outletArea = 0;
    for (let i = 0; i < area.length; i++) if (flood.outlet[i]) outletArea += area[i];
    assert.ok(Math.abs(outletArea - area.length * grid.spacingX * grid.spacingZ) < 1e-6);
});

test('Terrain fields: horizon sweeps are exact on rows, columns and diagonals and match analytic steps and planes', () => {
    const grid = gridOf(65, 65), tangents = new Float32Array(65 * 65), scratch = horizonScratch(grid);
    const flat = field(grid, () => 3);
    for (const step of TERRAIN_HORIZON_STORED_STEPS) { sweepHorizon(grid, flat, step, tangents, scratch); assert.ok(tangents.every(t => t <= 0)); }
    // a 10 m wall along the east edge: looking east from column c sees atan(10 / distance)
    const wall = field(grid, c => c >= 60 ? 10 : 0);
    sweepHorizon(grid, wall, [1, 0], tangents, scratch);
    for (const c of [0, 20, 50, 59]) assert.ok(Math.abs(tangents[32 * 65 + c] - 10 / ((60 - c) * 2)) < 1e-6, `column ${c}`);
    sweepHorizon(grid, wall, [-1, 0], tangents, scratch);
    assert.ok(tangents[32 * 65 + 30] <= 0, 'looking away from the wall sees no horizon');
    // diagonal NE (column +1, row -1) toward a spike: exact elevation angle along the diagonal
    const spike = field(grid, (c, r) => c === 50 && r === 14 ? 20 : 0);
    sweepHorizon(grid, spike, [1, -1], tangents, scratch);
    assert.ok(Math.abs(tangents[(14 + 20) * 65 + 30] - 20 / (20 * Math.SQRT2 * 2)) < 1e-6);
    // a plane rising to the east: uphill horizon equals the plane slope, downhill none
    const plane = field(grid, c => c * .5);
    sweepHorizon(grid, plane, [1, 0], tangents, scratch);
    assert.ok(Math.abs(tangents[10 * 65 + 10] - .25) < 1e-9);
    assert.equal(horizonSine(tangents[10 * 65 + 64]), 0, 'the east edge has no terrain ahead');
    assert.deepEqual(TERRAIN_HORIZON_STORED_STEPS.map(step => Math.round(horizonStepAzimuth(step, grid) * 180 / Math.PI)), [0, 45, 90, 135, 180, 225, 270, 315]);
});

test('Terrain fields: the facet sky-view integral is 1 on open flat ground and (1 + cos S) / 2 on an unobstructed slope', () => {
    const grid = gridOf(9, 9), directions = skyViewDirections(grid);
    assert.ok(Math.abs(directions.reduce((sum, d) => sum + d.weight, 0) - 2 * Math.PI) < 1e-12);
    const svf = (normal) => directions.reduce((sum, d) => sum + d.weight * skyViewSlice(-Infinity, normal[1], normal[0] * Math.cos(d.azimuth) + normal[2] * Math.sin(d.azimuth)), 0) / Math.PI;
    assert.ok(Math.abs(svf([0, 1, 0]) - 1) < 1e-12);
    for (const degrees of [10, 25, 40]) {
        const s = degrees * Math.PI / 180, value = svf([Math.sin(s), Math.cos(s), 0]);
        assert.ok(Math.abs(value - (1 + Math.cos(s)) / 2) < .004, `${degrees} degrees: ${value} vs ${(1 + Math.cos(s)) / 2}`);
    }
    // a uniform horizon of h in every direction leaves cos^2 h of the sky for a horizontal facet
    const h = 20 * Math.PI / 180, ring = directions.reduce((sum, d) => sum + d.weight * skyViewSlice(Math.tan(h), 1, 0), 0) / Math.PI;
    assert.ok(Math.abs(ring - Math.cos(h) ** 2) < 1e-12);
});

test('Terrain fields: shore distance is exact for a straight shoreline, signs follow sea level and an island ring is near-Euclidean', () => {
    const grid = gridOf(41, 41, 2), straight = field(grid, c => c * 2 - 31), m = memory(), { distance, statistics } = shoreDistance(grid, straight, 0, m);
    for (let i = 0; i < distance.length; i++) {
        const x = (i % 41) * 2;
        assert.ok(Math.abs(distance[i] - (x - 31)) < 1e-4, `sample ${i}: ${distance[i]} vs ${x - 31}`);
        assert.equal(distance[i] >= 0, straight[i] >= 0);
    }
    assert.ok(statistics.maximumAdjacentMeters <= 2 + 1e-9);
    const island = field(grid, (c, r) => 30 - Math.hypot(c - 20, r - 20) * 2), ring = shoreDistance(grid, island, 0, memory()).distance;
    for (let i = 0; i < ring.length; i++) {
        const radius = Math.hypot(i % 41 - 20, Math.floor(i / 41) - 20) * 2, expected = 30 - radius;
        assert.ok(Math.abs(ring[i] - expected) < .15, `sample ${i}: ${ring[i]} vs ${expected}`);
    }
});

test('Terrain fields: smoothing keeps constants, Kovesi radii match the requested sigma and the gradient follows mesh normals', () => {
    const grid = gridOf(33, 17), constant = field(grid, () => 7.25), smooth = gaussianSmooth(grid, constant, 3, memory(), 'smooth');
    assert.ok(smooth.every(value => Math.abs(value - 7.25) < 1e-12));
    for (const sigma of [2, 4, 12, 40]) assert.ok(Math.abs(gaussianBoxRadii(sigma).sigmaSamples - sigma) / sigma < .1);
    const plane = field(grid, (c, r) => c * .3 - r * .2), { dhdx, dhdz } = terrainGradient(grid, plane, memory());
    assert.ok(Math.abs(dhdx[100] - .15) < 1e-6 && Math.abs(dhdz[100] - .1) < 1e-6, 'east derivative 0.3/2 and north derivative +0.2/2 (rows run south)');
});

function synthetic() {
    // coast at the west, rolling land with a valley, a planning block inside forest and another touching the beach
    const grid = gridOf(129, 129, 2), heights = field(grid, (c, r) => Math.fround(c < 20 ? (c - 20) * .3 : Math.min(30, (c - 20) * .25) + 2 * Math.sin(r * .1) - 3 * Math.exp(-((r - 64) ** 2) / 60)));
    const cover = Uint8Array.from(heights, (h, i) => {
        const c = i % 129, r = Math.floor(i / 129);
        if (h < 0) return 0;
        if (c < 30) return 1;
        if ((c >= 70 && c < 100 && r >= 20 && r < 50) || (c >= 25 && c < 40 && r >= 90 && r < 110)) return 5;
        return c < 45 ? 2 : 3;
    });
    const soilIds = ['unknown', 'seabed', 'sand', 'loam', 'forest', 'rock'], coverSoil = new Uint8Array(256).fill(255), planningCover = new Uint8Array(256);
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [6, 0], [7, 0]].forEach(([coverId, soil]) => { coverSoil[coverId] = soil; });
    planningCover[5] = planningCover[6] = planningCover[7] = 1;
    return { grid, heights, cover, seaLevel: 0, soilIds, coverSoil, planningCover, recipe };
}

test('Terrain fields: the full global stage is deterministic, finite and keeps every non-planning natural soil', () => {
    const input = synthetic(), first = computeTerrainFields({ ...input, memory: memory() }), second = computeTerrainFields({ ...input, memory: memory() });
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    assert.deepEqual(first.channels.map(hash), second.channels.map(hash));
    assert.equal(hash(first.naturalSoil), hash(second.naturalSoil));
    assert.deepEqual(first.statistics, second.statistics);
    for (let i = 0; i < input.cover.length; i++) {
        if (!input.planningCover[input.cover[i]]) assert.equal(first.naturalSoil[i], input.coverSoil[input.cover[i]]);
        else assert.ok(['sand', 'loam', 'forest', 'rock', 'seabed'].includes(input.soilIds[first.naturalSoil[i]]));
    }
    const shore = LANDSCAPE_TERRAIN_FIELD_CHANNELS.findIndex(channel => channel.name === 'shoreDistance');
    for (let i = 0; i < input.heights.length; i++) assert.equal(first.channels[shore][i] >= 128, input.heights[i] >= 0, 'shore distance sign follows sea level exactly');
    const block = first.naturalSoil[35 * 129 + 85], beachBlock = first.naturalSoil[100 * 129 + 26];
    assert.equal(input.soilIds[block], 'forest', 'a planning block inside forest continues the forest');
    assert.equal(input.soilIds[beachBlock], 'sand', 'a planning block on the beach continues the sand');
    const wetness = LANDSCAPE_TERRAIN_FIELD_CHANNELS.findIndex(channel => channel.name === 'wetness');
    assert.ok(first.channels[wetness].every((byte, i) => input.heights[i] >= 0 || byte === 255), 'submerged samples are saturated');
    const horizon = decodeLandscapeTerrainField(LANDSCAPE_TERRAIN_FIELD_CHANNELS[8], first.channels[8][64 * 129 + 64] / 255);
    assert.ok(horizon >= 0 && horizon <= 1);
});
