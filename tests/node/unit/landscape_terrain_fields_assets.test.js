// Authenticates the published coastal terrain fields: binding, every page hash, shoreline sign, natural soil semantics and dressing agreement.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { LANDSCAPE_TERRAIN_FIELD_CHANNELS, decodeLandscapeTerrainFields, landscapeTerrainFieldsLayout, landscapeTerrainFieldsStaleness, sampleLandscapeDressingInputs, sampleLandscapeTerrainNaturalSoil,
    validateLandscapeManifest, validateLandscapeTerrainFields } from '../../../src/app/landscape/index.js';
import { readLandscapeFileChunk } from '../../../tools/landscape_authoring/LandscapeFileIO.mjs';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const cacheSkip = landscapeCacheSkip(['manifest.json', 'fields/manifest.json']);
const root = path.resolve('assets/public/landscape/coastal-city'), fields = path.join(root, 'fields');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = cacheSkip ? null : validateLandscapeManifest(JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')));
const currentBytes = cacheSkip ? null : await readFile(path.join(fields, 'manifest.json'));
const sidecar = cacheSkip ? null : await validateLandscapeTerrainFields(JSON.parse(currentBytes), manifest);
const layout = landscapeTerrainFieldsLayout(257);

test('Landscape terrain field assets: the current sidecar is immutable-snapshotted and bound fresh to the current terrain', { skip: cacheSkip }, async () => {
    assert.ok((await readFile(path.join(fields, `manifest.${hash(currentBytes)}.json`))).equals(currentBytes));
    assert.equal(sidecar.revision, 'terrain-fields-5dbdfc766dca6cce908bd7b4');
    assert.equal(sidecar.terrain.manifestSha256, hash(await readFile(path.join(root, 'manifest.json'))));
    const staleness = landscapeTerrainFieldsStaleness(sidecar, manifest);
    assert.equal(staleness.bound, true);
    assert.deepEqual(staleness.staleChunks, []);
    assert.equal(sidecar.pages.length, 85);
    assert.ok(currentBytes.length < 256 * 1024);
    assert.deepEqual(sidecar.provenance.imports, []);
    assert.equal(sidecar.provenance.measured, false);
});

test('Landscape terrain field assets: every published page authenticates by size and content address', { skip: cacheSkip }, async () => {
    const entries = new Map(sidecar.pages.flatMap(page => [page.fields, page.naturalSoil]).filter(Boolean).map(entry => [entry.url, entry]));
    for (const entry of entries.values()) {
        const bytes = await readFile(path.join(fields, entry.url));
        assert.equal(bytes.length, entry.byteLength);
        assert.equal(hash(bytes), entry.sha256);
        assert.ok(entry.url.startsWith(`pages/${entry.sha256}.`));
    }
    assert.equal(sidecar.pages.filter(page => page.fields.byteLength === layout.pageBytes).length, 85);
});

test('Landscape terrain field assets: every level reads identical natural labels at shared sample positions', { skip: cacheSkip }, async () => {
    const natives = new Map(), byId = new Map(manifest.chunks.map(chunk => [chunk.id, chunk])), soilIds = manifest.soil.catalog.map(soil => soil.id);
    const coverSoil = new Map(manifest.soil.landCoverMapping.map(entry => [entry.landCoverId, soilIds.indexOf(entry.soilId)]));
    const nativeLabel = async (x, z) => {
        const chunk = manifest.chunks.find(entry => entry.level === manifest.grid.maxLevel && x >= entry.bounds.minX && x <= entry.bounds.maxX && z >= entry.bounds.minZ && z <= entry.bounds.maxZ);
        if (!natives.has(chunk.id)) {
            const page = sidecar.pages.find(entry => entry.id === chunk.id);
            natives.set(chunk.id, page.naturalSoil ? new Uint8Array(await readFile(path.join(fields, page.naturalSoil.url))) : (await readLandscapeFileChunk(root, manifest, chunk.id)).landCover.map(cover => coverSoil.get(cover)));
        }
        return sampleLandscapeTerrainNaturalSoil(natives.get(chunk.id), chunk, x, z);
    };
    let compared = 0;
    for (const page of sidecar.pages.filter(entry => entry.level < manifest.grid.maxLevel && entry.naturalSoil)) {
        const chunk = byId.get(page.id), labels = new Uint8Array(await readFile(path.join(fields, page.naturalSoil.url))), step = (chunk.bounds.maxX - chunk.bounds.minX) / 256;
        for (let k = 0; k < 40; k++) {
            const c = (k * 37 + 5) % 257, r = (k * 61 + 11) % 257, x = chunk.bounds.minX + c * step, z = chunk.bounds.maxZ - r * step;
            assert.equal(sampleLandscapeTerrainNaturalSoil(labels, chunk, x, z), await nativeLabel(x, z), `${page.id} sample ${c},${r}`);
            compared++;
        }
    }
    assert.ok(compared >= 600, `${compared} coarse samples compared with the native labels`);
});

test('Landscape terrain field assets: native pages keep the sea-level sign, natural soils keep semantics and dressings agree with soil', { skip: cacheSkip }, async () => {
    const soilIds = manifest.soil.catalog.map(soil => soil.id), coverSoil = new Map(manifest.soil.landCoverMapping.map(entry => [entry.landCoverId, soilIds.indexOf(entry.soilId)]));
    const planning = new Set(manifest.landCover.catalog.filter(entry => entry.planningOnly).map(entry => entry.id)), counts = { sand: 0, rock: 0, seabed: 0, forest: 0, loam: 0 };
    for (const page of sidecar.pages.filter(entry => entry.level === manifest.grid.maxLevel && (entry.column + entry.row) % 3 === 0)) {
        const chunk = await readLandscapeFileChunk(root, manifest, page.id), bytes = await readFile(path.join(fields, page.fields.url));
        const natural = page.naturalSoil ? await readFile(path.join(fields, page.naturalSoil.url)) : null;
        for (let r = 0; r < 257; r += 4) for (let c = 0; c < 257; c += 4) {
            const i = r * 257 + c, texel = ((r + layout.halo) * layout.width + c + layout.halo) * 4;
            const units = LANDSCAPE_TERRAIN_FIELD_CHANNELS.map((_, k) => bytes[(k >> 2) * layout.layerBytes + texel + (k & 3)] / 255);
            const decoded = decodeLandscapeTerrainFields(units);
            assert.equal(decoded.shoreDistance >= 0, chunk.heights[i] >= manifest.coordinates.seaLevel, `${page.id} sample ${c},${r} shore sign`);
            const cover = chunk.landCover[i], display = natural ? natural[i] : coverSoil.get(cover);
            if (!planning.has(cover)) assert.equal(display, coverSoil.get(cover), `${page.id} natural soil keeps the semantic soil`);
            else assert.ok(!['unknown'].includes(soilIds[display]), 'planning samples receive a natural soil');
            const dressing = sampleLandscapeDressingInputs({ soilWeights: { [soilIds[display]]: 1 }, planningShare: planning.has(cover) ? 1 : 0, fields: decoded });
            const soil = soilIds[display];
            if (['sand', 'rock', 'seabed', 'unknown'].includes(soil) || planning.has(cover)) assert.equal(dressing.grassDensity, 0, `${soil} at ${page.id} has no grass`);
            if (soil !== 'forest' || planning.has(cover)) assert.equal(dressing.treeSuitability, 0, `${soil} at ${page.id} has no trees`);
            if (soil !== 'sand' || planning.has(cover)) assert.equal(dressing.beachDebris, 0);
            if (soil in counts && !planning.has(cover)) counts[soil]++;
        }
    }
    assert.ok(counts.sand > 0 && counts.forest > 0 && counts.seabed > 0, `the sampled natives cover several soils: ${JSON.stringify(counts)}`);
});
