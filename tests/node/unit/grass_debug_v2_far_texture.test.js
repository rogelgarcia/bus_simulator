// A constant canopy must not brighten when texture minification selects a coarser mip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// The preparation is CPU-only; Three is used just for filter enum values.
const source = new URL('../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2FarTexture.js', import.meta.url);
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if (context.parentURL === source.href && specifier === 'three') return {
        url: 'data:text/javascript,export const LinearFilter=1006,LinearMipmapLinearFilter=1008;', shortCircuit: true
    };
    return nextResolve(specifier, context);
} });
const { prepareGrassDebugV2FarTexture, GRASS_FAR_TEXTURE_PROFILE } = await import(source.href);
hooks.deregister();

test('flat canopy color stays constant through every prepared mip level', () => {
    for (const rgb of [[24, 46, 12], [93, 145, 42], [0, 0, 0]]) {
        const data = new Uint8Array(64 * 64 * 4);
        for (let i = 0; i < data.length; i += 4) data.set([...rgb, 255], i);
        const texture = { image: { data, width: 64, height: 64 } };
        prepareGrassDebugV2FarTexture(texture, 16);
        const color = [...texture.mipmaps[0].data.slice(0, 4)];
        assert.equal(texture.mipmaps.length, 7);
        for (const [level, mip] of texture.mipmaps.entries()) {
            for (let i = 0; i < mip.data.length; i += 4)
                assert.deepEqual([...mip.data.slice(i, i + 4)], color, 'mip ' + level + ' changes a constant color');
        }
    }
});

test('contrasting canopy retains cavities without unbounded pale highlights', () => {
    const data = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const bright = (x % 8) < 2 && (y % 8) < 2;
        data.set(bright ? [175, 240, 70, 255] : [8, 18, 3, 255], (y * 64 + x) * 4);
    }
    const texture = { image: { data, width: 64, height: 64 } };
    prepareGrassDebugV2FarTexture(texture, 16);
    for (const mip of texture.mipmaps) for (let i = 0; i < mip.data.length; i += 4) {
        const luma = (mip.data[i] * .2126 + mip.data[i + 1] * .7152 + mip.data[i + 2] * .0722) * GRASS_FAR_TEXTURE_PROFILE.colorRange;
        assert.ok(luma < 122, 'bright leaf exceeds the prepared highlight range');
        assert.ok(mip.data[i + 1] >= mip.data[i], 'green hue reverses');
        assert.equal(mip.data[i + 3], 255);
    }
    const base = texture.mipmaps[0].data;
    assert.ok(base[1] > base[3 * 4 + 1] * 4, 'highlight correction erased the root contrast');
});
