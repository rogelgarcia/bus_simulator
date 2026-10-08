// Verifies bounded contour fitting against source facts, digital stairs, page borders and quantization.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_CONTOUR_COVERAGE, buildLandscapeContourCoverage, decodeLandscapeContourSample, sampleLandscapeContourField } from '../../../src/graphics/engine3d/landscape/LandscapeContourCoverage.js';
import { applyLandscapeContourCoverage, sampleLandscapeSurfaceCoverage } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCoverage.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const cacheSkip = landscapeCacheSkip();

function fixture(soilAt, { columns = 33, rows = 33, originColumn = 0, originRow = 0, spacingX = 1.953125, spacingZ = spacingX, soilCount = 6 } = {}) {
    const sourceHalo = 6, sourceWidth = columns + sourceHalo * 2, sourceHeight = rows + sourceHalo * 2;
    const sourcePixels = new Uint8Array(sourceWidth * sourceHeight * 2);
    for (let row = 0; row < sourceHeight; row++) for (let column = 0; column < sourceWidth; column++) {
        const c = originColumn + column - sourceHalo, r = originRow + row - sourceHalo, soil = soilAt(c, r), index = (row * sourceWidth + column) * 2;
        sourcePixels[index] = soil << 4; sourcePixels[index + 1] = (c * 7 + r * 11) & 255;
    }
    const input = { sourcePixels, sourceWidth, sourceHeight, sourceHalo, columns, rows, spacingX, spacingZ, soilCount };
    const pixels = buildLandscapeContourCoverage(input), width = columns + 4, height = rows + 4;
    const field = (xGrid, zGrid) => sampleLandscapeContourField({ pixels, width, height, columns, rows, spacingX, spacingZ, xGrid, zGrid });
    const node = (column, row) => {
        const offset = ((row + 2) * width + column + 2) * 4;
        return decodeLandscapeContourSample(pixels[offset + 2], pixels[offset + 3], spacingX, spacingZ);
    };
    return { ...input, pixels, width, height, field, node };
}

function contourPosition(field, row, low, high) {
    for (let i = 0; i < 35; i++) {
        const middle = (low + high) / 2, result = field(middle, row);
        assert.equal(result.pairs.length, 1);
        assert.ok(result.confidence > .999999);
        if (result.pairs[0].distanceMeters < 0) low = middle; else high = middle;
    }
    return (low + high) / 2;
}

function composedWeights(field, base = [0, 0, 0, 0, 0, 1]) {
    const result = base.map(value => value * (1 - field.confidence));
    for (const pair of field.pairs) {
        const t = Math.max(0, Math.min(1, .5 + pair.distanceMeters / .75)), weight = t * t * (3 - 2 * t);
        result[pair.soils[0]] += pair.confidence * (1 - weight); result[pair.soils[1]] += pair.confidence * weight;
    }
    return result;
}

test('Contour coverage: a long digital straight coast becomes a continuous slope rather than repeated five-row flats', () => {
    const result = fixture((column, row) => column >= 30 - Math.floor(row / 5) ? 3 : 2, { columns: 65, rows: 65 });
    const old = [], fitted = [];
    for (let row = 10; row < 55; row++) {
        const boundary = 30 - Math.floor(row / 5) - .5;
        old.push(boundary); fitted.push(contourPosition(result.field, row, boundary - 1, boundary + 1));
    }
    assert.ok(old.slice(1).filter((value, i) => value === old[i]).length > 30);
    const steps = fitted.slice(1).map((value, i) => value - fitted[i]);
    assert.ok(steps.every(value => value < -.1 && value > -.3), `${Math.min(...steps)}..${Math.max(...steps)}`);
    const error = values => Math.sqrt(values.reduce((sum, value, i) => sum + (value - (29.9 - (i + 10) / 5)) ** 2, 0) / values.length);
    assert.ok(error(fitted) < error(old) / 8, `${error(fitted)} versus ${error(old)}`);
});

test('Contour coverage: the captured retained coastal run smooths its actual four- and five-row source steps', { skip: cacheSkip }, async () => {
    const manifestUrl = new URL('../../../assets/public/landscape/coastal-city/manifest.json', import.meta.url);
    const manifest = JSON.parse(await readFile(manifestUrl)), descriptor = manifest.chunks.find(chunk => chunk.id === 'l3/c2/r6');
    const source = await readFile(new URL(descriptor.channels.landCover.url, manifestUrl));
    const soilByCover = new Map(manifest.soil.landCoverMapping.map(entry => [entry.landCoverId, manifest.soil.catalog.findIndex(soil => soil.id === entry.soilId)]));
    const result = fixture((column, row) => soilByCover.get(source[(20 + row) * descriptor.columns + 20 + column]), { columns: 33, rows: 49, spacingX: manifest.grid.spacingX, spacingZ: manifest.grid.spacingZ });
    const original = [], fitted = [];
    for (let row = 13; row <= 36; row++) {
        let column = 0;
        while (source[(20 + row) * descriptor.columns + 20 + column] !== 2) column++;
        const boundary = column - .5;
        original.push(boundary); fitted.push(contourPosition(result.field, row, boundary - 1, boundary + 1));
    }
    assert.ok(original.slice(1).filter((value, i) => value === original[i]).length >= 17);
    const steps = fitted.slice(1).map((value, i) => value - fitted[i]);
    assert.ok(steps.every(value => value < -.1 && value > -.35), `${Math.min(...steps)}..${Math.max(...steps)}`);
    assert.ok(fitted.every((value, i) => Math.abs(value - original[i]) < .5));
});

test('Contour coverage: islands, one-cell channels and multi-soil junctions retain the source reconstruction', () => {
    const cases = [
        (column, row) => column === 16 && row === 16 ? 2 : 3,
        column => column === 16 ? 2 : 3,
        (column, row) => column < 16 ? 2 : row < 16 ? 3 : 4,
        (column, row) => Math.floor((Math.atan2(row - 16, column - 16) + Math.PI) / (Math.PI / 3)) % 6
    ];
    for (const soilAt of cases) {
        const result = fixture(soilAt);
        for (let row = 14; row <= 18; row++) for (let column = 14; column <= 18; column++) assert.equal(result.node(column, row).valid, false);
        assert.equal(result.field(16, 16).confidence, 0);
    }
});

test('Contour coverage: original RG bytes stay exact and quantized accepted nodes keep their source-side label', () => {
    for (const spacingX of [1.953125, 15.625]) {
        const result = fixture((column, row) => column + Math.floor(row / 5) >= 18 ? 4 : 1, { spacingX });
        const copy = result.sourcePixels.slice(), repeated = buildLandscapeContourCoverage(result);
        assert.deepEqual(result.sourcePixels, copy); assert.deepEqual(repeated, result.pixels);
        let accepted = 0;
        for (let row = -2; row < result.rows + 2; row++) for (let column = -2; column < result.columns + 2; column++) {
            const from = ((row + 6) * result.sourceWidth + column + 6) * 2, to = ((row + 2) * result.width + column + 2) * 4;
            assert.equal(result.pixels[to], result.sourcePixels[from]); assert.equal(result.pixels[to + 1], result.sourcePixels[from + 1]);
            const value = result.node(column, row);
            if (value.valid) {
                accepted++;
                assert.equal(value.soils[value.distanceMeters < 0 ? 0 : 1], result.sourcePixels[from] >> 4);
                assert.ok(Math.abs(value.distanceMeters) >= 4 * spacingX / 4095 - 1e-12);
            }
        }
        assert.ok(accepted > 40);
        const quantum = 8 * spacingX / 4095;
        for (let pair = 0; pair < 15; pair++) for (const distance of [-3.9 * spacingX, -.0001, .0001, 3.9 * spacingX]) {
            const code = Math.round((distance / (4 * spacingX) + 1) * 4095 / 2), packed = pair << 12 | code;
            const decoded = decodeLandscapeContourSample(packed & 255, packed >> 8, spacingX, spacingX);
            assert.equal(decoded.pairIndex, pair); assert.ok(decoded.soils[0] < decoded.soils[1]);
            assert.ok(Math.abs(decoded.distanceMeters - distance) <= quantum / 2 + 1e-12);
            assert.equal(Math.sign(decoded.distanceMeters), Math.sign(distance));
        }
    }
});

test('Contour coverage: independently built adjacent pages and duplicated halos agree byte for byte', () => {
    const soilAt = (column, row) => column + Math.floor(row / 5) >= 17 ? 3 : 2;
    const left = fixture(soilAt, { columns: 17, rows: 17 }), right = fixture(soilAt, { columns: 17, rows: 17, originColumn: 16 });
    for (let row = -2; row <= 18; row++) for (let column = 14; column <= 18; column++) {
        const a = ((row + 2) * left.width + column + 2) * 4, b = ((row + 2) * right.width + column - 16 + 2) * 4;
        assert.deepEqual(left.pixels.slice(a, a + 4), right.pixels.slice(b, b + 4));
    }
    for (let row = 0; row < 16; row += .2) {
        const a = composedWeights(left.field(16 - 1e-8, row)), b = composedWeights(right.field(1e-8, row));
        assert.ok(Math.max(...a.map((value, i) => Math.abs(value - b[i]))) < 1e-6);
    }
});

test('Contour coverage: confidence vanishes continuously across invalid and different-pair corners without coverage holes', () => {
    const columns = 3, rows = 3, width = 7, height = 7, pixels = new Uint8Array(width * height * 4);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 240;
    const assign = (column, row, pair, distance) => {
        const code = pair << 12 | Math.round((distance / 8 + 1) * 4095 / 2), offset = ((row + 2) * width + column + 2) * 4;
        pixels[offset + 2] = code & 255; pixels[offset + 3] = code >> 8;
    };
    assign(0, 0, 0, -.2); assign(1, 0, 5, .3); assign(1, 1, 14, -.1);
    const field = (xGrid, zGrid) => sampleLandscapeContourField({ pixels, width, height, columns, rows, spacingX: 2, spacingZ: 2, xGrid, zGrid });
    for (let y = 0; y <= 2; y += .125) for (let x = 0; x <= 2; x += .125) {
        const weights = composedWeights(field(x, y));
        assert.ok(weights.every(value => Number.isFinite(value) && value >= 0));
        assert.ok(Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
        const nearby = composedWeights(field(x + 1e-8, y - 1e-8));
        assert.ok(Math.max(...weights.map((value, i) => Math.abs(value - nearby[i]))) < 1e-6);
    }
    assert.equal(field(2, 2).confidence, 0);
    const layered = new Uint8Array(pixels.length * 2); layered.set(pixels, pixels.length);
    assert.deepEqual(sampleLandscapeContourField({ pixels: layered, byteOffset: pixels.length, width, height, columns, rows, spacingX: 2, spacingZ: 2, xGrid: .4, zGrid: .7 }), field(.4, .7));
});

test('Contour coverage: source support and tiny valid pages have explicit bounded contracts', () => {
    const tiny = fixture(() => 0, { columns: 2, rows: 2, soilCount: 1 });
    assert.equal(tiny.pixels.byteLength, 6 * 6 * 4);
    assert.equal(tiny.field(1, 1).confidence, 0);
    assert.equal(LANDSCAPE_CONTOUR_COVERAGE.scratchBytes, 0);
    assert.throws(() => buildLandscapeContourCoverage({ ...tiny, sourceHalo: 2 }), /complete RG source/);
    assert.throws(() => buildLandscapeContourCoverage({ ...tiny, soilCount: 7 }), /one to six/);
    assert.throws(() => decodeLandscapeContourSample(256, 0, 2, 2), /byte values/);
    assert.throws(() => sampleLandscapeContourField({ ...tiny, xGrid: NaN, zGrid: 0 }), /finite grid/);
});

test('Contour uniform flag: every kernel support position can veto the fast path, including a foreign outer source halo', () => {
    for (let row = -2; row <= 3; row++) for (let column = -2; column <= 3; column++) {
        const result = fixture((c, r) => c === 8 + column && r === 8 + row ? 2 : 3, { columns: 17, rows: 17 });
        assert.equal(result.node(8, 8).uniformSupport, false, `foreign support offset ${column}/${row}`);
    }
    const channel = fixture(column => column === 9 ? 2 : 3, { columns: 17, rows: 17 });
    assert.equal(channel.node(8, 8).uniformSupport, false);
    const outer = fixture((column, row) => column === 19 && row === 8 ? 2 : 3, { columns: 17, rows: 17 });
    assert.equal(outer.node(16, 8).uniformSupport, false);
    const nearButNonuniform = fixture((column, row) => column === 10 && row === 10 ? 2 : 3, { columns: 17, rows: 17 });
    const offset = ((8 + 2) * nearButNonuniform.width + 8 + 2) * 4;
    assert.equal(nearButNonuniform.pixels[offset + 2], 0);
    assert.equal(nearButNonuniform.pixels[offset + 3], 240);
});

test('Contour uniform flag: constant display regions keep exact source bytes and all four fitted corners invalid', () => {
    const soilAt = (column, row) => column >= 12 ? 3 : row < 5 ? 4 : 2;
    const result = fixture(soilAt), constant = fixture(() => 3, { columns: 17, rows: 17 });
    let flagged = 0;
    for (let row = -2; row < result.rows + 2; row++) for (let column = -2; column < result.columns + 2; column++) {
        const decoded = result.node(column, row);
        if (!decoded.uniformSupport) continue;
        flagged++;
        assert.equal(decoded.valid, false);
        for (let dr = -2; dr <= 3; dr++) for (let dc = -2; dc <= 3; dc++) assert.equal(soilAt(column + dc, row + dr), soilAt(column, row));
        if (column >= 0 && column < result.columns && row >= 0 && row < result.rows) {
            for (let dz = 0; dz <= 1; dz++) for (let dx = 0; dx <= 1; dx++) assert.equal(result.node(column + dx, row + dz).valid, false);
        }
    }
    assert.ok(flagged > 500);
    for (let row = -2; row <= 18; row++) for (let column = -2; column <= 18; column++) {
        const offset = ((row + 2) * constant.width + column + 2) * 4;
        assert.equal(constant.pixels[offset], 3 << 4);
        assert.equal(constant.pixels[offset + 1], (column * 7 + row * 11) & 255);
        assert.equal(constant.pixels[offset + 2], 1); assert.equal(constant.pixels[offset + 3], 240);
        assert.equal(constant.node(column, row).uniformSupport, true);
    }
    assert.equal(LANDSCAPE_CONTOUR_COVERAGE.uniformSupportCode, 0xf001);
});

test('Contour uniform flag: one-hot shortcut exactly matches near and minified reconstruction at corners and clamped exterior', () => {
    const soilAt = column => Math.max(0, Math.min(16, column)) < 9 ? 2 : 3;
    const result = fixture(soilAt, { columns: 17, rows: 17, spacingX: 1.953125, spacingZ: 3.90625 });
    const { columns, rows, spacingX, spacingZ, sourcePixels, sourceWidth, sourceHalo } = result;
    const bounds = { minX: 0, maxX: (columns - 1) * spacingX, minZ: 0, maxZ: (rows - 1) * spacingZ };
    const footprints = [ [[0, 0], [0, 0]], [[.4, .4], [.01, -.02]], [[spacingX, .25 * spacingZ], [0, .75 * spacingZ]],
        [[2 * spacingX, 0], [0, 2 * spacingZ]], [[4 * spacingX, spacingZ], [spacingX, 4 * spacingZ]] ];
    for (const [xGrid, zGrid] of [[0, 0], [16, 16], [4.25, 7.75], [11.8, 2.125], [-.2, -.4], [16.2, 16.4]]) {
        const column = Math.floor(Math.max(0, Math.min(columns - 1, xGrid))), row = Math.floor(Math.max(0, Math.min(rows - 1, zGrid)));
        assert.equal(result.node(column, row).uniformSupport, true);
        const identity = Array.from({ length: 6 }, (_, soil) => soil === soilAt(column) ? 1 : 0);
        for (const [dx, dy] of footprints) {
            const base = sampleLandscapeSurfaceCoverage({ bounds, columns, rows, x: xGrid * spacingX, z: (rows - 1 - zGrid) * spacingZ, dx, dy,
                soilAt: (c, r) => sourcePixels[((r + sourceHalo) * sourceWidth + c + sourceHalo) * 2] >> 4 });
            const full = applyLandscapeContourCoverage(base, { ...result, xGrid, zGrid, dx, dy });
            assert.deepEqual(full.weights, identity);
            assert.equal(full.contour.confidence, 0);
        }
    }
});
