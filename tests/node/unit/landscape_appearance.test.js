// Exercises independent appearance selection, bounded material/semantic requests and revision-aware soil identity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createLandscapeModelFixture as createBaseLandscapeFixture } from './landscape_model_fixture.js';
import { validateLandscapeAppearanceManifest, loadLandscapeAppearanceManifest, loadLandscapeAppearancePage, loadLandscapeCoverMask,
    createLandscapeAppearancePlanner, createLandscapeViewPlanner, applyLandscapeEditBatch, validateLandscapeManifest } from '../../../src/app/landscape/index.js';

const retained = new URL('../../../assets/public/landscape/coastal-city/appearance/', import.meta.url);
const saved = JSON.parse(await readFile(new URL('manifest.aec36e5b53837b67b6316803460980d4b805ce17bc8db7a1919f954bc4781b0b.json', retained), 'utf8'));
function createLandscapeModelFixture(options) {
    const fixture = createBaseLandscapeFixture(options), manifest = fixture.manifest;
    fixture.manifest = validateLandscapeManifest({ ...manifest, soil: { ...manifest.soil,
        catalog: manifest.soil.catalog.map(soil => ({ ...soil, materialId: saved.materials.find(material => material.soilId === soil.id).materialId })) } });
    fixture.resources.set('manifest.json', new TextEncoder().encode(JSON.stringify(fixture.manifest)));
    return fixture;
}
function appearance(manifest) {
    return validateLandscapeAppearanceManifest({ ...structuredClone(saved), landscapeId: manifest.id, preparedFromRevision: manifest.revision, bounds: manifest.bounds, grid: manifest.grid }, manifest);
}
const ortho = { projection: 'orthographic', position: { x: 0, y: 1000, z: 18 }, viewportHeight: 1080, orthoHeight: 1500, zoom: 1 };

test('Appearance schema preserves catalog identity across height/soil revisions and reordered JSON fields', () => {
    const { manifest } = createLandscapeModelFixture(), value = structuredClone(appearance(manifest));
    value.bounds = Object.fromEntries(Object.entries(value.bounds).reverse()); value.grid = Object.fromEntries(Object.entries(value.grid).reverse());
    assert.ok(Object.isFrozen(validateLandscapeAppearanceManifest(value, { ...manifest, revision: 'new-height-revision' })));
    const badSize = structuredClone(value); badSize.materials[0].tiers[0].channels.normal.byteLength++;
    assert.throws(() => validateLandscapeAppearanceManifest(badSize, manifest), /byte size/);
    const badSoil = structuredClone(value); badSoil.materials.reverse();
    assert.throws(() => validateLandscapeAppearanceManifest(badSoil, manifest), /bindings/);
    const badUrl = structuredClone(value); badUrl.materials[0].tiers[0].channels.baseColor.url = '../source.png';
    assert.throws(() => validateLandscapeAppearanceManifest(badUrl), /relative asset path|traverse/);
    assert.throws(() => validateLandscapeAppearanceManifest({ ...value, landscapeId: 'different' }, manifest), /spatial identity/);
});

test('Appearance schema opts into relative relief explicitly while retaining legacy opaque ORM alpha', () => {
    const { manifest } = createLandscapeModelFixture(), legacy = structuredClone(appearance(manifest));
    for (const material of legacy.materials) delete material.height;
    assert.ok(validateLandscapeAppearanceManifest(legacy, manifest).materials.every(material => material.height === undefined));
    const updated = structuredClone(legacy);
    updated.materials[0].height = { encoding: 'orm-alpha-unorm8', interpretation: 'relative-relief', neutral: .5 };
    assert.deepEqual(validateLandscapeAppearanceManifest(updated, manifest).materials[0].height, updated.materials[0].height);
    for (const height of [null, { encoding: 'baseColor-alpha-unorm8', interpretation: 'relative-relief', neutral: .5 },
        { encoding: 'orm-alpha-unorm8', interpretation: 'meters', neutral: .5 }, { encoding: 'orm-alpha-unorm8', interpretation: 'relative-relief', neutral: 1 }]) {
        updated.materials[0].height = height;
        assert.throws(() => validateLandscapeAppearanceManifest(updated, manifest), /height must explicitly declare/);
    }
});

test('Appearance selection refines on flat terrain independently from geometry, mask density and material texels', () => {
    const { manifest } = createLandscapeModelFixture({ heightAt: () => 10 });
    const view = createLandscapeViewPlanner(manifest), planner = createLandscapeAppearancePlanner(manifest, appearance(manifest));
    const overview = planner.plan(ortho), nearCamera = { ...ortho, orthoHeight: 32 }, near = planner.plan(nearCamera);
    assert.deepEqual(view.plan(nearCamera).desiredLeafIds, ['l0/c0/r0']);
    assert.equal(overview.desiredMaskIds.length, 1); assert.equal(overview.desiredTier, '32');
    assert.equal(near.desiredMaskIds.length, 4); assert.equal(near.desiredTiers.loam, '128'); assert.equal(near.desiredTiers.sand, '512');
    assert.equal(planner.plan({ ...ortho, orthoHeight: 4 }).desiredTier, '512');
    assert.equal(planner.plan(nearCamera, { targetMaskPixels: 1000 }).desiredMaskIds.length, 1);
    assert.equal(planner.plan(nearCamera, { targetMaskPixels: 1000 }).desiredTiers.loam, '128');
    assert.equal(planner.plan(nearCamera, { targetMaskPixels: 1000 }).desiredTiers.sand, '512');
    const coarseMaterials = planner.plan(nearCamera, { targetTexelPixels: 1000 });
    assert.equal(coarseMaterials.desiredMaskIds.length, 4); assert.equal(coarseMaterials.desiredTier, '32');
    const away = planner.plan({ ...nearCamera, frustumPlanes: [{ x: 1, y: 0, z: 0, w: -100 }] });
    assert.equal(away.visibleMaskIds.length, 0); assert.equal(away.desiredTier, '32');
    assert.deepEqual(planner.plan({ ...ortho, orthoHeight: 3000 }, { previousMaskIds: near.desiredMaskIds, previousTier: near.desiredTier }).desiredMaskIds, overview.desiredMaskIds);
});

test('Perspective appearance density responds to fixed-position FOV and viewport with bounded source limits', () => {
    const { manifest } = createLandscapeModelFixture({ heightAt: () => 10 });
    const planner = createLandscapeAppearancePlanner(manifest, appearance(manifest));
    const camera = { projection: 'perspective', position: { x: 0, y: 1000, z: 18 }, direction: { x: 0, y: -1, z: 0 }, viewportHeight: 1080, fovYRadians: Math.PI / 2, zoom: 1 };
    assert.equal(planner.plan(camera).desiredTier, '32');
    assert.equal(planner.plan({ ...camera, fovYRadians: .01 }).desiredTier, '512');
    assert.equal(planner.plan({ ...camera, viewportHeight: 108000 }).desiredMaskIds.length, 4);
    assert.equal(planner.plan({ ...camera, fovYRadians: .01 }).sourceLimited, true);
    assert.throws(() => planner.plan({ ...camera, direction: null }), /direction/);
    assert.throws(() => planner.plan(camera, { targetMaskPixels: 0 }), /positive/);
});

test('Appearance selection budgets texels at each physical period and its available tiers, independently of fixed-position orthographic zoom', () => {
    const { manifest } = createLandscapeModelFixture({ heightAt: () => 10 }), sidecar = appearance(manifest);
    const ordinary = createLandscapeAppearancePlanner(manifest, sidecar), calibrated = createLandscapeAppearancePlanner(manifest, sidecar, { materialTiling: { loam: { tileMeters: 16 } } });
    const finer = createLandscapeAppearancePlanner(manifest, sidecar, { materialTiling: { loam: { tileMeters: 16 } }, materialTiers: { loam: [32, 128, 512, 1024] } });
    const camera = { ...ortho, orthoHeight: 200 };
    assert.equal(ordinary.plan(camera).desiredTiers.loam, '32');
    assert.equal(calibrated.plan(camera).desiredTiers.loam, '128', 'a longer physical period needs more texels at the same footprint');
    assert.equal(calibrated.plan({ ...camera, zoom: 20 }).desiredTiers.loam, '512', 'schema-1 tiers stop at 512');
    const zoomed = finer.plan({ ...camera, zoom: 20 });
    assert.equal(zoomed.desiredTiers.loam, '1024', 'a companion 1024 tier refines further');
    assert.deepEqual(finer.materialTiers.loam, [32, 128, 512, 1024]); assert.deepEqual(finer.materialTiers.sand, [32, 128, 512]);
    assert.equal(finer.plan({ ...camera, zoom: 7 }).desiredTiers.loam, '512');
    assert.equal(finer.plan({ ...camera, zoom: 7 }, { previousTiers: zoomed.desiredTiers }).desiredTiers.loam, '1024', 'coarsening waits for 65% of the coarser tier');
    assert.equal(finer.plan({ ...camera, zoom: 5 }, { previousTiers: zoomed.desiredTiers }).desiredTiers.loam, '512');
    assert.throws(() => createLandscapeAppearancePlanner(manifest, sidecar, { materialTiling: { missing: { tileMeters: 4 } } }), /unknown material/);
    assert.throws(() => createLandscapeAppearancePlanner(manifest, sidecar, { materialTiling: { loam: { tileMeters: 0 } } }), /positive physical tileMeters/);
    assert.throws(() => createLandscapeAppearancePlanner(manifest, sidecar, { materialTiling: { loam: { tileMeters: 4, macroTileMeters: 16 } } }), /only a positive physical tileMeters/);
    assert.throws(() => createLandscapeAppearancePlanner(manifest, sidecar, { materialTiers: { loam: [512, 128] } }), /ascending/);
    assert.throws(() => createLandscapeAppearancePlanner(manifest, sidecar, { materialTiers: { missing: [32] } }), /unknown material tier/);
});

test('Material requests authenticate one bounded raw page and refuse budget, corrupt, oversized and stale work', async () => {
    const page = saved.materials[0].tiers[0].channels.baseColor, bytes = await readFile(new URL(page.url, retained));
    let requests = 0;
    const fetchImpl = async () => { requests++; return new Response(bytes); }, manifestUrl = 'https://fixture/appearance/manifest.json';
    const loaded = await loadLandscapeAppearancePage(page, { manifestUrl, fetchImpl });
    assert.equal(loaded.byteLength, 4096); assert.equal(requests, 1);
    await assert.rejects(loadLandscapeAppearancePage(page, { manifestUrl, fetchImpl, maxDecodedBytes: 4095 }), /budget/); assert.equal(requests, 1);
    const corrupt = Buffer.from(bytes); corrupt[0] ^= 1;
    await assert.rejects(loadLandscapeAppearancePage(page, { manifestUrl, fetchImpl: async () => new Response(corrupt) }), /SHA-256/);
    await assert.rejects(loadLandscapeAppearancePage(page, { manifestUrl, fetchImpl: async () => new Response(new Uint8Array(4097)) }), /exceeds/);
    const abort = new AbortController(); abort.abort();
    await assert.rejects(loadLandscapeAppearancePage(page, { manifestUrl, fetchImpl, signal: abort.signal }), { name: 'AbortError' }); assert.equal(requests, 1);
    await assert.rejects(loadLandscapeAppearanceManifest(manifestUrl, { fetchImpl: async () => new Response(new Uint8Array(256 * 1024 + 1)) }), /exceeds/);
});

test('Categorical mask loading fetches only cover, preserves planning classes, and updates every sampled soil level by revision', async () => {
    const fixture = createLandscapeModelFixture({ heightAt: () => 10, coverAt: (c, r) => (c + r) % 8 }), { manifest } = fixture;
    const options = { manifestUrl: 'https://fixture/fixture/manifest.json', fetchImpl: fixture.fetchImpl };
    const original = await loadLandscapeCoverMask(manifest, 'l0/c0/r0', options);
    assert.deepEqual(fixture.requests, [manifest.chunks[0].channels.landCover.url]);
    for (let i = 0; i < original.landCover.length; i++) if (original.landCover[i] >= 5) assert.equal(original.soilIndices[i], 0);
    const batch = { format: 'landscape-edit-batch', schemaVersion: 1, id: 'soil-mask-test', landscapeId: manifest.id, expectedRevision: manifest.revision,
        operations: [{ id: 'soil-mask-test/sand', type: 'assign-soil', region: { type: 'circle', center: { x: 0, z: 18 }, radius: 2 }, falloff: { type: 'none' }, soilId: 'sand' }] };
    const edited = await applyLandscapeEditBatch(manifest, batch, { readChunk: async id => fixture.decoded.get(id), newRevision: 'soil-edited' });
    edited.manifestDraft.editHistory.previousManifestUrl = `manifest.${'0'.repeat(64)}.json`;
    const current = validateLandscapeManifest(edited.manifestDraft);
    for (const descriptor of current.chunks) {
        const mask = await loadLandscapeCoverMask(current, descriptor.id, options);
        assert.equal(mask.sourceRevision, 'soil-edited'); assert.deepEqual(mask.landCover, fixture.decoded.get(descriptor.id).landCover);
        const column = (0 - descriptor.bounds.minX) / (manifest.grid.spacingX * descriptor.sampleStride);
        const row = (descriptor.bounds.maxZ - 18) / (manifest.grid.spacingZ * descriptor.sampleStride);
        assert.equal(mask.soilIndices[row * descriptor.columns + column], 2);
    }
    const before = fixture.requests.length;
    await assert.rejects(loadLandscapeCoverMask(current, 'l0/c0/r0', { ...options, maxDecodedBytes: 49 }), /budget/);
    assert.equal(fixture.requests.length, before);
    assert.ok(fixture.requests.every(url => url.endsWith('.landCover.bin')));
    assert.equal(createHash('sha256').update(original.landCover).digest('hex'), manifest.chunks[0].channels.landCover.sha256);
});
