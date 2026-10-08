// Authenticates the published D4 multiscale companion, its CC0 micro source metadata and every page without raw source images.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { decodeLandscapeAppearanceMicroTexel, validateLandscapeAppearanceManifest, validateLandscapeAppearanceMultiscale, validateLandscapeManifest } from '../../../src/app/landscape/index.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const directory = path.resolve('assets/public/landscape/coastal-city/appearance');
const snapshot = '07ec6c0aa26a77487d75959480171c7c1aa4e85565aac643fb34c31d5b339683';
const extended = 'e7856366836d5cbf8a0c7d5ebb77862ca625dd08460b7c4b710b3a0cc6801ca8';
const cacheSkip = landscapeCacheSkip(['manifest.json', 'appearance/manifest.json', 'appearance/multiscale.json', `appearance/manifest.${extended}.json`, `appearance/multiscale.${snapshot}.json`]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async name => JSON.parse(await readFile(path.join(directory, name), 'utf8'));
const page = async entry => readFile(path.join(directory, entry.url));
const toLinear = byte => { const v = byte / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
const toSrgb = v => Math.round(255 * (v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055));

async function published() {
    const bytes = await readFile(path.join(directory, `multiscale.${snapshot}.json`));
    assert.equal(hash(bytes), snapshot);
    const appearance = await json(`manifest.${extended}.json`);
    return { bytes, appearance, value: await validateLandscapeAppearanceMultiscale(JSON.parse(bytes), appearance) };
}

test('Landscape multiscale assets: the D4 companion snapshot extends the current schema-1 appearance and terrain', { skip: cacheSkip }, async () => {
    const { bytes, value } = await published();
    const current = await readFile(path.join(directory, 'multiscale.json'));
    assert.deepEqual(await readFile(path.join(directory, `multiscale.${hash(current)}.json`)), current, 'current companion has an immutable snapshot');
    const landscape = validateLandscapeManifest(JSON.parse(await readFile(path.resolve('assets/public/landscape/coastal-city/manifest.json'), 'utf8')));
    const appearance = validateLandscapeAppearanceManifest(JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')), landscape);
    await validateLandscapeAppearanceMultiscale(JSON.parse(current), appearance);
    assert.equal(value.revision, 'multiscale-eedd520219823e11ff6c7381');
    assert.ok(bytes.length < 256 * 1024);
});

test('Landscape multiscale assets: the CC0 micro source retains provider, scale, recipe and source hashes', { skip: cacheSkip }, async () => {
    const { value } = await published();
    const config = (await import(pathToFileURL(path.resolve('assets/public/pbr/landscape_sand_micro_v1/pbr.material.config.js')).href)).default;
    const recipe = JSON.parse(await readFile(path.resolve('assets/public/pbr/landscape_sand_micro_v1/pbr.landscape.config.json'), 'utf8'));
    assert.deepEqual([config.source.provider, config.source.assetId, config.source.license, config.source.technique], ['ambientCG', 'Ground054', 'CC0-1.0', 'surface-photogrammetry']);
    assert.equal(config.source.archive.sha256, '19aafb7d257cff80eca5374b097abacb714149aa899891be82572e82fbac1326');
    assert.deepEqual(recipe.micro, { algorithm: 'micro-periodic-highpass-v1', encoding: 'micro-normal-height-luminance-v1', radiusPixels: 9, luminanceRangePercentiles: [.1, 99.9] });
    for (const soilId of ['sand', 'seabed']) {
        const micro = value.materials.find(material => material.soilId === soilId).micro;
        assert.equal(micro.materialId, config.materialId);
        assert.equal(micro.tileMeters, config.source.physicalSize.widthMeters);
        assert.equal(micro.tileMeters, config.tileMeters);
        for (const id of micro.provenanceSourceIds) assert.ok(id.startsWith('pbr/landscape_sand_micro_v1/'));
    }
    assert.deepEqual(value.materials.filter(material => material.micro).map(material => material.soilId), ['seabed', 'sand']);
    for (const file of config.source.files) {
        const record = value.provenance.sources.find(source => source.path === `pbr/landscape_sand_micro_v1/${file.file}`);
        assert.equal(record?.sha256, file.sha256); assert.equal(record.byteLength, file.byteLength);
    }
    for (const file of ['pbr.material.config.js', 'pbr.landscape.config.json']) {
        const bytes = await readFile(path.resolve('assets/public/pbr/landscape_sand_micro_v1', file));
        assert.equal(value.provenance.sources.find(source => source.path === `pbr/landscape_sand_micro_v1/${file}`).sha256, hash(bytes));
    }
});

test('Landscape multiscale assets: every 1024 base page authenticates and is the aligned native source of its schema-1 512 page', { skip: cacheSkip }, async () => {
    const { value, appearance } = await published();
    const seen = new Set();
    for (const material of value.materials) {
        const tier = material.tiers[0], previous = appearance.materials.find(entry => entry.soilId === material.soilId).tiers[2];
        for (const [channel, entry] of Object.entries(tier.channels)) {
            if (seen.has(entry.url)) continue;
            seen.add(entry.url);
            const bytes = await page(entry), lower = await page(previous.channels[channel]);
            assert.equal(bytes.length, 1024 * 1024 * 4); assert.equal(hash(bytes), entry.sha256);
            let worst = 0, alphaMin = 255, alphaMax = 0;
            for (let row = 0; row < 512; row += 2) for (let column = 0; column < 512; column += 2) for (let c = 0; c < 4; c++) {
                const texels = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([dy, dx]) => bytes[((row * 2 + dy) * 1024 + column * 2 + dx) * 4 + c]);
                const expected = channel === 'baseColor' && c < 3 ? toSrgb(texels.reduce((sum, byte) => sum + toLinear(byte), 0) / 4) : texels.reduce((a, b) => a + b, 0) / 4;
                if (channel !== 'normal' || c === 3) worst = Math.max(worst, Math.abs(expected - lower[(row * 512 + column) * 4 + c]));
            }
            for (let i = 0; i < bytes.length; i += 4) {
                alphaMin = Math.min(alphaMin, bytes[i + 3]); alphaMax = Math.max(alphaMax, bytes[i + 3]);
                if (channel === 'normal' && i % 4096 === 0) assert.ok(Math.abs(Math.hypot(bytes[i] / 127.5 - 1, bytes[i + 1] / 127.5 - 1, bytes[i + 2] / 127.5 - 1) - 1) <= .015);
            }
            assert.ok(worst <= 1.5, `${material.soilId}/${channel}: 2x2 reduction of the 1024 tier matches the 512 tier (worst ${worst})`);
            if (channel === 'orm') assert.ok(alphaMin < alphaMax, `${material.soilId} 1024 ORM alpha carries relative relief`);
            else assert.equal(alphaMin, 255);
        }
    }
    assert.equal(seen.size, 12, 'six soil bindings over four unique materials');
});

test('Landscape multiscale assets: micro pages are mean-neutral, homogeneous and seamless at every tier', { skip: cacheSkip }, async () => {
    const { value } = await published();
    const micro = value.materials.find(material => material.soilId === 'sand').micro;
    assert.equal(micro.luminanceRange, .625);
    for (const tier of micro.tiers) {
        const bytes = await page(tier.channels.micro), size = tier.resolution, sums = [0, 0, 0, 0];
        assert.equal(hash(bytes), tier.channels.micro.sha256);
        for (let i = 0; i < bytes.length; i += 4) {
            for (let c = 0; c < 4; c++) sums[c] += bytes[i + c];
            assert.ok(Math.hypot(bytes[i] / 127.5 - 1, bytes[i + 1] / 127.5 - 1) <= 1 + 1.5 / 127.5);
        }
        for (const c of [0, 1, 3]) assert.ok(Math.abs(sums[c] / (size * size) - 127.5) < 1, `${size}: channel ${'rgba'[c]} is neutral on average`);
        if (size < 512) continue;
        const blocks = 8, block = size / blocks, means = [];
        for (let by = 0; by < blocks; by++) for (let bx = 0; bx < blocks; bx++) {
            let sum = 0;
            for (let y = by * block; y < (by + 1) * block; y++) for (let x = bx * block; x < (bx + 1) * block; x++) {
                const o = (y * size + x) * 4;
                sum += decodeLandscapeAppearanceMicroTexel(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3], micro.luminanceRange).luminanceRatio;
            }
            means.push(sum / (block * block));
        }
        assert.ok(Math.max(...means) - Math.min(...means) < .02, `${size}: no broad luminance islands (block means ${Math.min(...means).toFixed(4)}..${Math.max(...means).toFixed(4)})`);
        let edge = 0, interior = 0;
        for (let y = 0; y < size; y++) for (let c = 0; c < 4; c++) {
            edge += Math.abs(bytes[(y * size) * 4 + c] - bytes[(y * size + size - 1) * 4 + c]);
            interior += Math.abs(bytes[(y * size + size / 2) * 4 + c] - bytes[(y * size + size / 2 - 1) * 4 + c]);
        }
        assert.ok(edge < interior * 1.5, `${size}: the wrapped tile edge is as continuous as the interior`);
    }
});
