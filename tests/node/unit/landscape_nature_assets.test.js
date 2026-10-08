// Verifies the retained beach-material publication without requiring local-only raw PBR maps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sandConfig from '../../../assets/public/pbr/aerial_beach_01/pbr.material.config.js';
import { PBR_MATERIAL_CATALOG } from '../../../assets/public/pbr/_catalog_index.js';
import { validateLandscapeManifest, validateLandscapeAppearanceManifest } from '../../../src/app/landscape/index.js';
import { createCoastalLandscapeCitySpec } from '../../../src/app/city/specs/CoastalLandscapeCitySpec.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const directory = path.resolve('assets/public/landscape/coastal-city');
const materialSnapshotHash = '12fc8d5c72fa47bd41946c98a8acced91b70738a5c6da469a08843683dc0f95b';
const appearanceSnapshotHash = 'aec36e5b53837b67b6316803460980d4b805ce17bc8db7a1919f954bc4781b0b';
const cacheSkip = landscapeCacheSkip([path.basename(createCoastalLandscapeCitySpec().landscape.manifestUrl), `manifest.${materialSnapshotHash}.json`,
    `appearance/manifest.${appearanceSnapshotHash}.json`]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function snapshot(folder, sha256) {
    const bytes = await readFile(path.join(folder, `manifest.${sha256}.json`));
    assert.equal(hash(bytes), sha256);
    return JSON.parse(bytes);
}

test('Landscape nature assets: beach publication changes only the material binding and revision', { skip: cacheSkip }, async () => {
    const original = JSON.parse(await readFile(path.resolve(createCoastalLandscapeCitySpec().landscape.manifestUrl)));
    const published = validateLandscapeManifest(await snapshot(directory, materialSnapshotHash));
    assert.notEqual(published.revision, original.revision);
    assert.equal(published.soil.catalog.find(soil => soil.id === 'sand').materialId, sandConfig.materialId);
    const restored = structuredClone(published);
    restored.revision = original.revision;
    restored.soil.catalog.find(soil => soil.id === 'sand').materialId = 'pbr.coast_sand_rocks_02';
    assert.deepEqual(restored, original, 'native channels, raw classifications, source references and authoring history are unchanged');
});

test('Landscape nature assets: CC0 source identity, source hashes and all nine bounded sand pages authenticate', { skip: cacheSkip }, async () => {
    const landscape = await snapshot(directory, materialSnapshotHash);
    const appearance = validateLandscapeAppearanceManifest(await snapshot(path.join(directory, 'appearance'), appearanceSnapshotHash), landscape);
    const sand = appearance.materials.find(material => material.soilId === 'sand');
    assert.equal(sand.materialId, sandConfig.materialId);
    assert.equal(sand.tileMeters, 30);
    assert.equal(sandConfig.source.license, 'CC0-1.0');
    assert.equal(sandConfig.source.assetUrl, 'https://polyhaven.com/a/aerial_beach_01');
    assert.equal(PBR_MATERIAL_CATALOG.filter(material => material.materialId === sand.materialId).length, 1);
    for (const source of sandConfig.source.files) {
        const retained = appearance.provenance.sources.find(record => record.path === `pbr/aerial_beach_01/${source.file}`);
        assert.equal(retained.sha256, source.sha256);
        assert.equal(retained.byteLength, source.byteLength);
    }
    assert.deepEqual(sand.tiers.map(tier => tier.resolution), [32, 128, 512]);
    for (const tier of sand.tiers) for (const page of Object.values(tier.channels)) {
        const bytes = await readFile(path.join(directory, 'appearance', page.url));
        assert.equal(bytes.length, page.byteLength);
        assert.equal(hash(bytes), page.sha256);
        assert.ok(bytes.length <= 1024 * 1024);
    }
});
