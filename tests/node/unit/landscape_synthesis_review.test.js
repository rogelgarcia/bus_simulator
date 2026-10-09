// Verifies the review renderers: uniform hillshade on planes, deterministic bitmap text, map/plot dimensions and sheet composition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { composeSheet, createCanvas, drawText, glyphRows, renderCoverMap, renderElevationMap, renderHillshade, renderHistogramPlot, renderMultidirectionalHillshade, renderProfilePlot, renderReliefMap, renderSlopeMap, resampleArea } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisReview.mjs';
import { encodePng, decodePng } from '../../../tools/bake_landscape/terrain_synthesis/interchange/PngCodec.mjs';
import { localRelief } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisAnalysis.mjs';

const gridOf = (columns, rows, spacing) => ({ columns, rows, spacingX: spacing, spacingZ: spacing, minX: 0, maxZ: (rows - 1) * spacing });
const field = (grid, f) => Float32Array.from({ length: grid.columns * grid.rows }, (_, i) => f((i % grid.columns) * grid.spacingX, grid.maxZ - Math.floor(i / grid.columns) * grid.spacingZ));
const sha = image => createHash('sha256').update(image.data).digest('hex');

test('Synthesis review: the hillshade of a horizontal plane is uniform at sin(altitude) and a tilted plane is uniform but darker toward the light', () => {
    const grid = gridOf(65, 65, 2), flat = renderHillshade(grid, field(grid, () => 5), { size: 32, seaLevel: 0 });
    assert.equal(flat.width, 32); assert.equal(flat.height, 32);
    const expected = Math.round(255 * Math.sin(Math.PI / 4));
    for (let i = 0; i < flat.data.length; i++) assert.equal(flat.data[i], expected);
    const tilted = renderHillshade(grid, field(grid, x => 5 + .3 * x), { size: 32, azimuthDegrees: 270, altitudeDegrees: 45 });
    for (let i = 3; i < tilted.data.length; i += 3) assert.equal(tilted.data[i], tilted.data[0]);
    assert.ok(tilted.data[0] > expected, 'a plane rising toward the west faces a western light');
    const multi = renderMultidirectionalHillshade(grid, field(grid, () => 5), { size: 16 });
    for (let i = 0; i < multi.data.length; i++) assert.equal(multi.data[i], expected);
    const water = renderHillshade(grid, field(grid, () => -5), { size: 8, seaLevel: 0 });
    assert.ok(water.data[2] > water.data[0], 'submerged ground is tinted blue');
});

test('Synthesis review: bitmap text renders the glyph table exactly and byte-identically', () => {
    const canvas = createCanvas(12, 9, [0, 0, 0]);
    drawText(canvas, 1, 1, 'A', [255, 255, 255], 1);
    const rows = glyphRows('A');
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) assert.equal(canvas.data[((y + 1) * 12 + x + 1) * 3], rows[y] & (1 << (4 - x)) ? 255 : 0, `pixel ${x},${y}`);
    const again = createCanvas(12, 9, [0, 0, 0]); drawText(again, 1, 1, 'A', [255, 255, 255], 1);
    assert.equal(sha(canvas), sha(again));
    const scaled = createCanvas(40, 20); drawText(scaled, 2, 2, 'Hi 42°', [10, 20, 30], 2);
    assert.ok(encodePng(scaled).equals(encodePng(scaled)));
    assert.throws(() => drawText(scaled, 0, 0, 'ñ', [0, 0, 0], 1), /No glyph/);
    assert.throws(() => drawText(scaled, 0, 0, 'x', [0, 0, 0], 1.5), /integer/);
});

test('Synthesis review: maps carry legends, resampling averages exactly and plots and sheets have the requested geometry', () => {
    const grid = gridOf(33, 33, 4), heights = field(grid, (x, z) => (x < 40 ? -4 : Math.min(30, (x - 40) * .4) + Math.sin(z / 9)));
    const cover = Uint8Array.from(heights, (h, i) => (h < 0 ? 0 : h < 2 ? 1 : (i % 7 === 0 ? 5 : 3)));
    const slope = renderSlopeMap(grid, heights, { size: 64 }), relief = renderReliefMap(grid, localRelief(grid, heights, cover, { windowsMeters: [40] }).windows[0].raster, { size: 64, maxMeters: 20 });
    const elevation = renderElevationMap(grid, heights, { size: 64 }), coverMap = renderCoverMap(grid, cover, { size: 64 });
    for (const image of [slope, relief, elevation, coverMap]) { assert.equal(image.width, 64); assert.ok(image.height >= 64 + 44); assert.equal(image.data.length, image.width * image.height * 3); }
    const averaged = resampleArea(gridOf(4, 4, 1), Float32Array.from([1, 3, 1, 3, 1, 3, 1, 3, 5, 7, 5, 7, 5, 7, 5, 7]), 2);
    assert.deepEqual(Array.from(averaged), [2, 2, 6, 6]);
    const profile = renderProfilePlot({ series: [{ label: 'a', distance: [0, 100, 200], height: [0, 10, 5] }], verticalExaggeration: 2, title: 'test', width: 800 });
    assert.equal(profile.width, 800); assert.equal(profile.height, Math.round(12 * 2 * (800 - 102) / 200) + 100, 'range -1..11 m at 2x over 698 px for 200 m');
    const fitted = renderProfilePlot({ series: [{ label: 'a', distance: [0, 100], height: [0, 10] }], verticalExaggeration: null, width: 400, height: 300 });
    assert.equal(fitted.height, 300);
    const histogram = renderHistogramPlot({ bins: ['0-2', '2-5', '5+'], series: [{ label: 'natural', values: [.7, .2, .1] }, { label: 'land', values: [.8, .15, .05] }], title: 'slope', width: 600, height: 300 });
    assert.equal(histogram.width, 600); assert.equal(histogram.height, 300);
    const sheet = composeSheet([{ image: slope, label: 'slope' }, { image: coverMap, label: 'cover' }, { image: profile, label: 'profile' }], { columns: 2, gap: 10, labelHeight: 30 });
    assert.equal(sheet.width, 10 + 2 * (800 + 10)); assert.equal(sheet.height, 10 + 2 * (Math.max(slope.height, coverMap.height, profile.height) + 30 + 10));
    const decoded = decodePng(encodePng(sheet)); assert.deepEqual(decoded.data, sheet.data);
    assert.throws(() => renderReliefMap(grid, new Float32Array(10), { size: 8, maxMeters: 1 }), /Float32Array/);
    assert.throws(() => composeSheet([], {}), /entries/);
});
