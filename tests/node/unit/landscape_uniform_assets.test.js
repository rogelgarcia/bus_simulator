// Authenticates uniform landscape materials, preserved sand response, and material-only publication without raw source images.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PBR_MATERIAL_CATALOG } from '../../../assets/public/pbr/_catalog_index.js';
import { LANDSCAPE_SOIL_CATALOG, validateLandscapeManifest, validateLandscapeAppearanceManifest, landscapeAppearanceBindingKey } from '../../../src/app/landscape/index.js';

const directory = path.resolve('assets/public/landscape/coastal-city');
const previousTerrain = '12fc8d5c72fa47bd41946c98a8acced91b70738a5c6da469a08843683dc0f95b';
const previousAppearance = 'aec36e5b53837b67b6316803460980d4b805ce17bc8db7a1919f954bc4781b0b';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const expected = Object.freeze({ unknown: 'pbr.landscape_soil_uniform_v1', seabed: 'pbr.aerial_beach_01', sand: 'pbr.aerial_beach_01',
    loam: 'pbr.landscape_grass_uniform_v1', forest: 'pbr.landscape_forest_soil_uniform_v1', rock: 'pbr.landscape_rock_uniform_v1' });

async function current() {
    const landscape = validateLandscapeManifest(await json(path.join(directory, 'manifest.json')));
    const appearance = validateLandscapeAppearanceManifest(await json(path.join(directory, 'appearance/manifest.json')), landscape);
    return { landscape, appearance };
}

test('Uniform landscape assets: defaults and current snapshots replace only material bindings while retaining old revisions', async () => {
    const { landscape, appearance } = await current();
    assert.deepEqual(Object.fromEntries(LANDSCAPE_SOIL_CATALOG.map(soil => [soil.id, soil.materialId])), expected);
    assert.deepEqual(Object.fromEntries(landscape.soil.catalog.map(soil => [soil.id, soil.materialId])), expected);
    const oldBytes = await readFile(path.join(directory, `manifest.${previousTerrain}.json`));
    assert.equal(hash(oldBytes), previousTerrain);
    const previous = JSON.parse(oldBytes), restored = structuredClone(landscape);
    restored.revision = previous.revision;
    restored.soil.catalog.forEach((soil, i) => { soil.materialId = previous.soil.catalog[i].materialId; });
    assert.deepEqual(restored, previous, 'native channels, land-cover classes, geometry, source references and authoring history remain unchanged');
    for (const folder of [directory, path.join(directory, 'appearance')]) {
        const bytes = await readFile(path.join(folder, 'manifest.json'));
        assert.deepEqual(await readFile(path.join(folder, `manifest.${hash(bytes)}.json`)), bytes);
    }
    const oldAppearanceBytes = await readFile(path.join(directory, 'appearance', `manifest.${previousAppearance}.json`));
    assert.equal(hash(oldAppearanceBytes), previousAppearance);
    const previousSidecar = JSON.parse(oldAppearanceBytes);
    assert.deepEqual(await json(path.join(directory, 'appearance', `binding.${await landscapeAppearanceBindingKey(previousSidecar)}.json`)), previousSidecar);
    assert.equal(appearance.preparedFromRevision, landscape.revision);
});

test('Uniform landscape assets: source licenses, recipes, source-height data and every bounded page authenticate', async () => {
    const { appearance } = await current();
    for (const material of appearance.materials) {
        assert.equal(material.materialId, expected[material.soilId]);
        assert.deepEqual(material.height, { encoding: 'orm-alpha-unorm8', interpretation: 'relative-relief', neutral: .5 });
        const slug = material.materialId.slice(4), configPath = path.resolve('assets/public/pbr', slug, 'pbr.material.config.js');
        const config = (await import(pathToFileURL(configPath).href)).default;
        assert.equal(PBR_MATERIAL_CATALOG.filter(entry => entry.materialId === material.materialId).length, 1);
        assert.equal(config.source.license, 'CC0-1.0');
        for (const source of config.source.files) {
            const record = appearance.provenance.sources.find(entry => entry.path === `pbr/${slug}/${source.file}`);
            assert.equal(record?.sha256, source.sha256);
            assert.equal(record.byteLength, source.byteLength);
        }
        const preparationBytes = await readFile(path.resolve('assets/public/pbr', slug, 'pbr.landscape.config.json'));
        assert.equal(appearance.provenance.sources.find(entry => entry.path === `pbr/${slug}/pbr.landscape.config.json`).sha256, hash(preparationBytes));
        for (const tier of material.tiers) for (const [channel, page] of Object.entries(tier.channels)) {
            const bytes = await readFile(path.join(directory, 'appearance', page.url));
            assert.equal(bytes.length, tier.resolution ** 2 * 4);
            assert.equal(hash(bytes), page.sha256);
            assert.ok(bytes.length <= 1024 * 1024);
            if (channel === 'orm') {
                let min = 255, max = 0;
                for (let i = 3; i < bytes.length; i += 4) { min = Math.min(min, bytes[i]); max = Math.max(max, bytes[i]); }
                assert.ok(min < max && min < 200 && max > 70, `${material.soilId}/${tier.id} carries real relative relief instead of opaque alpha`);
            }
        }
    }
    const rock = PBR_MATERIAL_CATALOG.find(entry => entry.materialId === expected.rock);
    assert.equal(rock.source.assetId, 'Granite005A');
    assert.equal(rock.source.technique, 'procedural');
});

test('Uniform landscape assets: accepted sand RGB, normal, source scale and calibration remain byte-identical', async () => {
    const { appearance } = await current();
    const old = await json(path.join(directory, 'appearance', `manifest.${previousAppearance}.json`));
    const sand = appearance.materials.find(material => material.soilId === 'sand');
    const previous = old.materials.find(material => material.soilId === 'sand');
    const seabed = appearance.materials.find(material => material.soilId === 'seabed');
    assert.equal(sand.tileMeters, previous.tileMeters);
    assert.deepEqual(sand.calibration, previous.calibration);
    assert.deepEqual(sand.roughnessInputRange, previous.roughnessInputRange);
    assert.deepEqual(seabed.tiers, sand.tiers);
    for (let tier = 0; tier < sand.tiers.length; tier++) for (const channel of ['baseColor', 'normal', 'orm']) {
        const before = await readFile(path.join(directory, 'appearance', previous.tiers[tier].channels[channel].url));
        const after = await readFile(path.join(directory, 'appearance', sand.tiers[tier].channels[channel].url));
        if (channel !== 'orm') assert.deepEqual(after, before);
        else for (let i = 0; i < after.length; i++) if (i % 4 !== 3) assert.equal(after[i], before[i]);
    }
});

test('Uniform landscape assets: replacements retain fine detail without broad color islands or new tiling seams', async () => {
    const { appearance } = await current();
    for (const material of appearance.materials.filter(entry => entry.materialId.startsWith('pbr.landscape_'))) {
        const page = material.tiers[2].channels.baseColor;
        const bytes = await readFile(path.join(directory, 'appearance', page.url));
        const blockMeans = [], mean = [0, 0, 0];
        let seam = 0, adjacent = 0, square = 0;
        for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) {
            const block = [0, 0, 0];
            for (let y = by * 64; y < (by + 1) * 64; y++) for (let x = bx * 64; x < (bx + 1) * 64; x++) for (let c = 0; c < 3; c++) {
                const value = bytes[(y * 512 + x) * 4 + c] / 255;
                block[c] += value / 4096; mean[c] += value / 512 ** 2; square += value * value / (512 ** 2 * 3);
            }
            blockMeans.push(block);
        }
        const blockVariance = blockMeans.reduce((sum, block) => sum + block.reduce((n, value, c) => n + (value - mean[c]) ** 2, 0), 0) / (64 * 3);
        assert.ok(Math.sqrt(blockVariance) < .003, `${material.soilId} should have no broad tonal islands`);
        assert.ok(square - mean.reduce((sum, value) => sum + value * value, 0) / 3 > .00002, `${material.soilId} must retain fine physical color detail`);
        for (let y = 0; y < 512; y++) for (let c = 0; c < 3; c++) {
            seam += Math.abs(bytes[(y * 512) * 4 + c] - bytes[(y * 512 + 511) * 4 + c]) / (512 * 3);
            for (let x = 1; x < 512; x++) adjacent += Math.abs(bytes[(y * 512 + x) * 4 + c] - bytes[(y * 512 + x - 1) * 4 + c]) / (512 * 511 * 3);
        }
        assert.ok(seam < adjacent * 1.5 + 1, `${material.soilId} tile edge is consistent with interior detail`);
    }
});
