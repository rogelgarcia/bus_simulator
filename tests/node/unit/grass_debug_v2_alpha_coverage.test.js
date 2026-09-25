// Coverage mips retain thin cutouts without leaking alpha between atlas pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrassAlphaCoverageMipmaps } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2AlphaCoverage.js';

test('Grass coverage: preserve partially covered strips and the untouched base image', () => {
    const width = 32, height = 16, data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width / 2; x++) {
        const i = (y * width + x) * 4;
        data.set([20, 140, 10, x % 4 === 0 ? 60 : 0], i);
    }
    const original = data.slice();
    const mips = createGrassAlphaCoverageMipmaps(data, width, height, { pages: 2 });
    assert.deepEqual(data, original);
    assert.equal(mips[0].data, data);
    assert.deepEqual(mips.map(({ width, height }) => [width, height]), [[32, 16], [16, 8], [8, 4], [4, 2], [2, 1], [1, 1]]);
    const first = mips[1]; let retained = 0;
    for (let y = 0; y < first.height; y++) for (let x = 0; x < first.width; x++) {
        const i = (y * first.width + x) * 4;
        if (x >= first.width / 2 || x % 2) assert.equal(first.data[i + 3], 0);
        else {
            assert.ok(first.data[i + 3] > 255 * 0.15, 'Averaged alpha 30 must survive the cutoff of 38.25');
            assert.deepEqual([...first.data.slice(i, i + 3)], [20, 140, 10]); retained++;
        }
    }
    assert.ok(retained > 0);
    for (const level of mips.slice(1, -1)) for (let y = 0; y < level.height; y++) for (let x = level.width / 2; x < level.width; x++) {
        assert.equal(level.data[(y * level.width + x) * 4 + 3], 0, 'Empty atlas page stays empty');
    }
});

test('Grass coverage: opaque and empty textures stay unchanged at all mip levels', () => {
    for (const alpha of [0, 255]) {
        const data = new Uint8Array(8 * 4 * 4);
        for (let i = 0; i < data.length; i += 4) data.set([30, 150, 40, alpha], i);
        for (const level of createGrassAlphaCoverageMipmaps(data, 8, 4)) {
            for (let i = 0; i < level.data.length; i += 4) assert.deepEqual([...level.data.slice(i, i + 4)], [30, 150, 40, alpha]);
        }
    }
    assert.throws(() => createGrassAlphaCoverageMipmaps(new Uint8Array(12), 3, 1), /power-of-two/);
});
