// Verifies the AI 598 D3a CPU mip chains: layout, the GPU-equivalent box filters (linear light for sRGB, bytes for the linear layers, ties to even) and the bake's tiers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_MATERIAL_MIPS, buildLandscapeMaterialMipChain, landscapeMaterialMipLevel, landscapeMaterialMipLevels, landscapeMaterialMipOffsets, reduceLandscapeMaterialLevel } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialMips.js';
import { landscapeTextureBytes } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceBudget.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const cacheSkip = landscapeCacheSkip(['appearance/manifest.json', 'appearance/multiscale.json']);
const appearanceUrl = new URL('../../../assets/public/landscape/coastal-city/appearance/', import.meta.url);
const linear = byte => { const s = byte / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; };
const srgb = value => value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;

test('Material mips: a complete chain is laid out level by level and sized like the GPU estimate of a mipped RGBA8 texture', () => {
    assert.equal(LANDSCAPE_MATERIAL_MIPS.id, 'landscape-material-mips-v1');
    assert.equal(landscapeMaterialMipLevels(1024), 11);
    assert.equal(landscapeMaterialMipLevels(1), 1);
    const layout = landscapeMaterialMipOffsets(128);
    assert.deepEqual([...layout.sizes], [128, 64, 32, 16, 8, 4, 2, 1]);
    assert.deepEqual(layout.offsets.slice(0, 3), [0, 128 * 128 * 4, 128 * 128 * 4 + 64 * 64 * 4]);
    assert.equal(layout.bytes, landscapeTextureBytes(128), 'the chain is exactly the mipped texture estimate (landscapeTextureBytes)');
    assert.equal(landscapeMaterialMipOffsets(1024).bytes, landscapeTextureBytes(1024));
    assert.throws(() => landscapeMaterialMipOffsets(96), /power of two/);
    const chain = buildLandscapeMaterialMipChain(new Uint8Array(4 * 4 * 4).fill(200), 4, { srgb: false });
    assert.equal(chain.length, landscapeTextureBytes(4));
    assert.deepEqual(Array.from(landscapeMaterialMipLevel(chain, 4, 2)), [200, 200, 200, 200], 'a constant map stays constant down to the one-texel level');
    assert.throws(() => buildLandscapeMaterialMipChain(new Uint8Array(3), 1, { srgb: false }), /RGBA8 bytes/);
    assert.throws(() => buildLandscapeMaterialMipChain(new Uint8Array(4), 1, {}), /colour space/);
    assert.throws(() => landscapeMaterialMipLevel(chain, 4, 3), /outside/);
});

test('Material mips: linear layers average their bytes with ties to even and never renormalize normals; sRGB base colour averages in linear light', () => {
    // a 2x2 block of linear bytes: (0 + 1 + 2 + 3) / 4 = 1.5 -> 2 (even); (1 + 1 + 2 + 2) / 4 = 1.5 -> 2; (0 + 0 + 0 + 2) / 4 = 0.5 -> 0; (0 + 0 + 2 + 3) / 4 = 1.25 -> 1
    const level = new Uint8Array([0, 1, 0, 0, 1, 1, 0, 0, 2, 2, 0, 2, 3, 2, 2, 3]), target = new Uint8Array(4);
    reduceLandscapeMaterialLevel(level, 2, target, { srgb: false });
    assert.deepEqual(Array.from(target), [2, 2, 0, 1]);
    // opposing normals average to a shortened vector: the mean normal filter reads that shortening, so the chain keeps it
    const normals = new Uint8Array([255, 128, 128, 255, 1, 128, 128, 255, 128, 255, 128, 255, 128, 1, 128, 255]), mean = new Uint8Array(4);
    reduceLandscapeMaterialLevel(normals, 2, mean, { srgb: false });
    assert.deepEqual(Array.from(mean), [128, 128, 128, 255], 'the unnormalized mean of four unit normals pointing sideways has no length');
    // sRGB: the average of black and white in linear light is 0.5 linear = sRGB 188, not the byte mean 128
    const colour = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]), out = new Uint8Array(4);
    reduceLandscapeMaterialLevel(colour, 2, out, { srgb: true });
    assert.deepEqual(Array.from(out), [188, 188, 188, 255]);
    assert.equal(Math.round(srgb((linear(0) + linear(255)) / 2) * 255), 188);
    assert.throws(() => reduceLandscapeMaterialLevel(level, 2, new Uint8Array(8), { srgb: false }), /half its size/);
});

// the bake's normalized-vector-box renormalizes each published normal tier; the chain keeps the GPU's unnormalized mean, so the directions are compared
const renormalized = bytes => { const out = new Uint8Array(bytes.length); for (let index = 0; index < bytes.length; index += 4) {
    const vector = [0, 1, 2].map(k => bytes[index + k] / 255 * 2 - 1), length = Math.hypot(...vector) || 1;
    for (let k = 0; k < 3; k++) out[index + k] = Math.round((vector[k] / length * .5 + .5) * 255); out[index + 3] = bytes[index + 3]; } return out; };

test('Material mips: reducing a published 1024 page one level agrees with the published 512 tier of the bake within one byte (two for the renormalized normals)', { skip: cacheSkip }, async () => {
    const appearance = JSON.parse(await readFile(new URL('manifest.json', appearanceUrl), 'utf8')), multiscale = JSON.parse(await readFile(new URL('multiscale.json', appearanceUrl), 'utf8'));
    const page = async entry => new Uint8Array((await readFile(new URL(entry.url, appearanceUrl))).buffer);
    for (const soilId of ['loam', 'rock', 'sand', 'forest']) {
        const schema = appearance.materials.find(material => material.soilId === soilId), companion = multiscale.materials.find(material => material.soilId === soilId);
        const fine = companion.tiers.find(tier => tier.resolution === 1024), published = schema.tiers.find(tier => tier.resolution === 512);
        for (const [channel, isSrgb] of [['baseColor', true], ['orm', false], ['normal', false]]) {
            const chain = buildLandscapeMaterialMipChain(await page(fine.channels[channel]), 1024, { srgb: isSrgb }), level = landscapeMaterialMipLevel(chain, 1024, 1), reference = await page(published.channels[channel]);
            const reduced = channel === 'normal' ? renormalized(level) : level;
            let maximum = 0, sum = 0, over = 0, count = 0;
            for (let index = 0; index < reduced.length; index++) {
                if ((index & 3) === 3) continue;
                const difference = Math.abs(reduced[index] - reference[index]);
                maximum = Math.max(maximum, difference); sum += difference; count++; if (difference > 1) over++;
            }
            const label = `${soilId} ${channel}: max ${maximum}, mean ${(sum / count).toFixed(4)}, ${over} components over one byte`;
            if (channel === 'normal') assert.ok(maximum <= 2 && over <= count * 1e-4, label);
            else assert.ok(maximum <= 1, label);
        }
    }
});
