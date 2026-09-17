// Independent prop depths must retain geometry hidden in the main sun map.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterizeSmallCaster } from '../../../src/app/illumination/static_sun_depth/SmallCasterDepthRaster.js';

const bounds = [-1, -1, -10, 1, 1, 10], size = 16;
const triangle = [-.8, -.8, -2, .8, -.8, -2, 0, .8, -2];
const decode = (raw, x, y) => raw[(y * size + x) * 2] * 256 + raw[(y * size + x) * 2 + 1];

test('opaque prop raster retains nearest depth and empty texels independent of winding', () => {
    const raw = rasterizeSmallCaster({ positions: triangle, bounds, size });
    const reverse = [...triangle.slice(6), ...triangle.slice(3, 6), ...triangle.slice(0, 3)];
    assert.deepEqual(raw, rasterizeSmallCaster({ positions: reverse, bounds, size }));
    assert.equal(decode(raw, 8, 7), Math.round(.4 * 65534));
    assert.equal(decode(raw, 0, 15), 65535);
    const behind = triangle.map((value, i) => i % 3 === 2 ? 3 : value);
    assert.deepEqual(raw, rasterizeSmallCaster({ positions: [...behind, ...triangle], bounds, size }));
});

test('prop raster interpolates sloped triangle depth at the pixel center', () => {
    const positions = triangle.map((value, i) => i % 3 === 2 ? triangle[i - 2] * 2 - 2 : value);
    const raw = rasterizeSmallCaster({ positions, bounds, size });
    const x = (8.5 / size) * 2 - 1;
    assert.ok(Math.abs(decode(raw, 8, 7) - Math.round((x * 2 + 8) / 20 * 65534)) <= 1);
    assert.ok(rasterizeSmallCaster({ positions: [0, 0, 0, 0, 0, -1, 0, 0, -2], bounds, size }).every(v => v === 255));
});
