// Unit tests of the AI 597 D4 swash sheet's pure parts: the band geometry of a native chunk and the run-up inputs of a sea state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_OCEAN_SWASH, landscapeOceanSwashChunkGeometry, landscapeOceanSwashInputs, loadLandscapeOceanSwashBand } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanSwashBand.js';
import { LANDSCAPE_OCEAN, landscapeOceanShoreInputs } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanModel.js';
import { landscapeOceanSignificantWaveHeight } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanSpectrum.js';
import { landscapeOceanFieldLayout } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanField.js';

/** A 9 x 9 native chunk over 0..8 m: a planar beach rising eastward (1:10, the waterline at x = 4) with a 3 m knoll in the north-east corner. */
function beachChunk() {
    const columns = 9, rows = 9, heights = new Float32Array(columns * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) heights[r * columns + c] = (c - 4) * .1 + (r === 0 && c === 8 ? 3 : 0);
    return { descriptor: { bounds: { minX: 0, maxX: 8, minZ: 0, maxZ: 8 }, columns, rows, sampleStride: 1 }, heights };
}
const grid = { minX: 0, minZ: 0, spacingX: 1, spacingZ: 1, seaLevel: 0 };
const band = { landMeters: 3, seaMeters: 1, maxHeightMeters: .25, minHeightMeters: .15 };
const shoreDistanceAt = (x, z) => 4 - x;

test('Swash geometry: the band takes the native samples by shore distance and height, with triangles only between band corners', () => {
    const geometry = landscapeOceanSwashChunkGeometry(beachChunk(), grid, band, shoreDistanceAt);
    assert.ok(geometry);
    // columns 3..7 lie within 1 m of water and 3 m of land: heights -0.1..0.3, so column 7 (0.3 m) is above the band and column 3 (-0.1 m) inside
    const columns = new Set();
    for (let i = 0; i < geometry.positions.length; i += 3) columns.add(geometry.positions[i]);
    assert.deepEqual([...columns].sort((a, b) => a - b), [3, 4, 5, 6]);
    assert.equal(geometry.vertices, 4 * 9);
    assert.equal(geometry.triangles, 3 * 8 * 2);
    assert.ok(geometry.indices instanceof Uint16Array);
    // heights in millimetres, rows counted from the south, the bounds in world metres
    const first = Array.from(geometry.positions.subarray(0, 3));
    assert.deepEqual(first, [3, -100, 8]);
    assert.deepEqual(geometry.bounds, { minX: 3, maxX: 6, minZ: 0, maxZ: 8, minY: -.10000000149011612, maxY: .20000000298023224 });
    // a chunk without band samples yields null; mismatched heights throw
    assert.equal(landscapeOceanSwashChunkGeometry(beachChunk(), grid, band, () => 50), null);
    assert.throws(() => landscapeOceanSwashChunkGeometry({ descriptor: beachChunk().descriptor, heights: new Float32Array(3) }, grid, band, shoreDistanceAt), /do not match/);
    assert.equal(LANDSCAPE_OCEAN_SWASH.positionBytes, 6);
});

test('Swash band loader: only the native chunks holding band texels are loaded, the geometry totals add up', async () => {
    const manifest = { bounds: { minX: 0, maxX: 16, minZ: 0, maxZ: 16 }, grid: { spacingX: 1, spacingZ: 1, columns: 17, rows: 17, chunkIntervals: 8, maxLevel: 0 }, coordinates: { seaLevel: 0 },
        chunks: [0, 1].flatMap(row => [0, 1].map(column => ({ id: `l0/c${column}/r${row}`, level: 0, bounds: { minX: column * 8, maxX: column * 8 + 8, minZ: 8 - row * 8, maxZ: 16 - row * 8 }, columns: 9, rows: 9, sampleStride: 1 }))).concat([{ id: 'l1/c0/r0', level: 1, bounds: { minX: 0, maxX: 16, minZ: 0, maxZ: 16 }, columns: 9, rows: 9, sampleStride: 2 }]) };
    const layout = landscapeOceanFieldLayout(manifest, 1, 8), shoreDistance = new Float32Array(64);
    // the waterline runs north-south at x = 4: the western chunks hold the band, the eastern ones are 4+ m inland
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) shoreDistance[r * 8 + c] = 4 - (c + .5) * 2;
    const loaded = [];
    const loadChunk = async (_, id) => { loaded.push(id); const chunk = manifest.chunks.find(entry => entry.id === id), heights = new Float32Array(81); for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) heights[r * 9 + c] = (chunk.bounds.minX + c - 4) * .1; return { descriptor: chunk, heights }; };
    const result = await loadLandscapeOceanSwashBand({ manifest, manifestUrl: 'http://example.test/manifest.json', layout, shoreDistance, loadChunk, band });
    assert.deepEqual(loaded.sort(), ['l0/c0/r0', 'l0/c0/r1']);
    assert.equal(result.candidates, 2); assert.equal(result.chunks.length, 2);
    assert.equal(result.vertices, result.chunks.reduce((sum, entry) => sum + entry.geometry.vertices, 0));
    assert.equal(result.bytes, result.chunks.reduce((sum, entry) => sum + entry.geometry.positions.byteLength + entry.geometry.indices.byteLength, 0));
    assert.deepEqual(result.grid, { minX: 0, minZ: 0, spacingX: 1, spacingZ: 1, seaLevel: 0 });
});

test('Swash inputs: the run-up of a sea state follows its significant height and swell wavelength', () => {
    const moderate = landscapeOceanSwashInputs('moderate', 'medium'), rough = landscapeOceanSwashInputs('rough', 'medium');
    assert.equal(moderate.heightMeters, landscapeOceanSignificantWaveHeight('moderate', 'medium').continuousMeters);
    assert.equal(moderate.wavelengthMeters, landscapeOceanShoreInputs('moderate').deepWavelengthMeters);
    assert.ok(Math.abs(moderate.sqrtHeightLength - Math.sqrt(moderate.heightMeters * moderate.wavelengthMeters)) < 1e-12);
    assert.equal(moderate.periodSeconds, 8.5);
    assert.ok(rough.sqrtHeightLength > moderate.sqrtHeightLength);
    assert.ok(LANDSCAPE_OCEAN.swash.landMeters > LANDSCAPE_OCEAN.swash.seaMeters && LANDSCAPE_OCEAN.swash.cyclesRemembered <= 12);
});
