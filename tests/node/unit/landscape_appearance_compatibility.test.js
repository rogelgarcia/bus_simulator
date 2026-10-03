// Verifies bounded, explicit material-binding resolution for old terrain snapshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { landscapeAppearanceBindingKey, loadLandscapeAppearanceManifest, LandscapeAppearanceBindingError, validateLandscapeAppearanceManifest } from '../../../src/app/landscape/index.js';

const saved = JSON.parse(await readFile(new URL('../../../assets/public/landscape/coastal-city/appearance/manifest.json', import.meta.url)));
const currentUrl = 'https://fixture/terrain/appearance/manifest.json';
function fixture() {
    const { manifest } = createLandscapeModelFixture();
    const current = { ...structuredClone(saved), landscapeId: manifest.id, preparedFromRevision: manifest.revision, bounds: manifest.bounds, grid: manifest.grid };
    const oldTerrain = structuredClone(manifest), oldAppearance = structuredClone(current);
    oldTerrain.soil.catalog[2].materialId = oldAppearance.materials[2].materialId = 'pbr.archived_sand';
    oldAppearance.revision = 'appearance-old';
    return { manifest, current, oldTerrain, oldAppearance };
}

test('Appearance binding keys use normalized spatial numbers and ordered material IDs, independent of terrain revisions', async () => {
    const { manifest, current, oldTerrain } = fixture(), key = await landscapeAppearanceBindingKey(manifest);
    assert.match(key, /^[a-f0-9]{64}$/);
    assert.equal(await landscapeAppearanceBindingKey(current), key);
    const reordered = structuredClone(manifest);
    reordered.bounds = Object.fromEntries(Object.entries(reordered.bounds).reverse());
    reordered.grid = Object.fromEntries(Object.entries(reordered.grid).reverse());
    reordered.revision = 'authored-height-soil-revision';
    reordered.soil.catalog[2].label = 'Unchanged semantic sand';
    assert.equal(await landscapeAppearanceBindingKey(reordered), key);
    assert.notEqual(await landscapeAppearanceBindingKey(oldTerrain), key);
    const changedGrid = structuredClone(current); changedGrid.grid.spacingX *= 2;
    assert.notEqual(await landscapeAppearanceBindingKey(changedGrid), key);
    const changedOrder = structuredClone(current); changedOrder.materials.reverse();
    assert.notEqual(await landscapeAppearanceBindingKey(changedOrder), key);
});

test('Default appearance lookup loads one binding alias on mismatch; explicit URLs stay strict and pages keep their directory', async () => {
    const { manifest, current, oldTerrain, oldAppearance } = fixture(), requests = [];
    const expectedUrl = new URL(`binding.${await landscapeAppearanceBindingKey(oldTerrain)}.json`, currentUrl).href;
    const fetchImpl = async url => { requests.push(String(url)); return new Response(JSON.stringify(String(url) === expectedUrl ? oldAppearance : current)); };
    assert.equal((await loadLandscapeAppearanceManifest(currentUrl, { landscape: manifest, fetchImpl, resolveBindingFallback: true })).revision, current.revision);
    assert.deepEqual(requests.splice(0), [currentUrl]);
    const result = await loadLandscapeAppearanceManifest(currentUrl, { landscape: oldTerrain, fetchImpl, resolveBindingFallback: true });
    assert.equal(result.revision, oldAppearance.revision); assert.deepEqual(requests.splice(0), [currentUrl, expectedUrl]);
    const page = result.materials[2].tiers[0].channels.baseColor.url;
    assert.equal(new URL(page, expectedUrl).href, new URL(page, currentUrl).href);
    await assert.rejects(loadLandscapeAppearanceManifest(currentUrl, { landscape: oldTerrain, fetchImpl }), LandscapeAppearanceBindingError);
    assert.deepEqual(requests.splice(0), [currentUrl]);
    assert.equal((await loadLandscapeAppearanceManifest(expectedUrl, { landscape: oldTerrain, fetchImpl })).revision, oldAppearance.revision);
    assert.deepEqual(requests.splice(0), [expectedUrl]);
});

test('Binding fallback never hides corruption, oversized responses, unavailable current metadata, or an incompatible alias', async () => {
    const { current, oldTerrain } = fixture();
    const corrupt = structuredClone(current); corrupt.materials[0].tiers[0].channels.baseColor.byteLength++;
    for (const response of [() => new Response(JSON.stringify(corrupt)), () => new Response('{}', { status: 500 }), () => new Response(new Uint8Array(256 * 1024 + 1))]) {
        let calls = 0;
        await assert.rejects(loadLandscapeAppearanceManifest(currentUrl, { landscape: oldTerrain, resolveBindingFallback: true, fetchImpl: async () => { calls++; return response(); } }));
        assert.equal(calls, 1);
    }
    let calls = 0;
    await assert.rejects(loadLandscapeAppearanceManifest(currentUrl, { landscape: oldTerrain, resolveBindingFallback: true,
        fetchImpl: async () => { calls++; return new Response(JSON.stringify(current)); } }), LandscapeAppearanceBindingError);
    assert.equal(calls, 2);
    const abort = new AbortController();
    calls = 0;
    await assert.rejects(loadLandscapeAppearanceManifest(currentUrl, { landscape: oldTerrain, resolveBindingFallback: true, signal: abort.signal,
        fetchImpl: async () => { calls++; abort.abort(); return new Response(JSON.stringify(current)); } }), { name: 'AbortError' });
    assert.equal(calls, 1);
    assert.throws(() => validateLandscapeAppearanceManifest(corrupt, oldTerrain), error => !(error instanceof LandscapeAppearanceBindingError));
});
