// Exercises optional binding through real city registry, placement, normalization and JS serialization.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
    validateLandscapeCityBinding, landscapePointToCity, cityPointToLandscape, cityRegionToLandscape,
    cityReservationsToLandscapeConstraints, cityTileLandscapeCoverage, loadCityLandscape,
    assertFlatCityCapability, queryLandscapeSelection, loadLandscapeChunk
} from '../../../src/app/landscape/index.js';
import { CityMap } from '../../../src/app/city/CityMap.js';
import { createCityConfig } from '../../../src/app/city/CityConfig.js';
import { createCitySpecById } from '../../../src/app/city/specs/CitySpecRegistry.js';
import { normalizeCitySpec, applyCitySpecSettings, serializeCitySpecToModule, importCitySpecModule } from '../../../src/app/city/specs/CitySpecAuthoring.js';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const city = () => createCitySpecById('coastal-landscape', createCityConfig());
const cacheSkip = landscapeCacheSkip([city().landscape.manifestUrl.split('/').pop(), 'manifest.12fc8d5c72fa47bd41946c98a8acced91b70738a5c6da469a08843683dc0f95b.json',
    'manifest.496f91b93facbbc9183d939d4da4e758852270fa71ed19e732ad1fa944127c20.json']);
const mapFrom = spec => CityMap.fromSpec(spec, createCityConfig());
const closePoint = (a, b) => { for (const axis of Object.keys(b)) assert.ok(Math.abs(a[axis] - b[axis]) < 1e-9, `${axis}: ${a[axis]} vs ${b[axis]}`); };

test('Landscape city binding: registered JS fixture pins a retained immutable manifest', { skip: cacheSkip }, async () => {
    const spec = city(), manifest = JSON.parse(await readFile(spec.landscape.manifestUrl, 'utf8'));
    const binding = validateLandscapeCityBinding(spec.landscape, { manifest });
    assert.ok(Object.isFrozen(binding.transform.translation));
    assert.equal(binding.landscapeId, manifest.id);
    assert.equal(binding.revision, manifest.revision);
    assert.notEqual(city(), spec);
    const altered = structuredClone(spec.landscape);
    altered.revision = 'stale';
    assert.throws(() => validateLandscapeCityBinding(altered, { manifest }), /revision is stale/);
});

// The nature pass and AI577 D1a published material-only revisions after AI 576 bound the fixture; the city has not reviewed them, so its strict
// pin refuses both. The difference check is the review record an explicit rebind would cite.
test('Landscape city binding: the fixture pin refuses retained material-only publications until an explicit rebind', { skip: cacheSkip }, async () => {
    const binding = city().landscape, directory = binding.manifestUrl.slice(0, binding.manifestUrl.lastIndexOf('/'));
    const snapshot = async name => {
        const bytes = await readFile(`${directory}/${name}`);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), name.match(/^manifest\.([a-f0-9]{64})\.json$/)[1], `${name} is content addressed`);
        return JSON.parse(bytes.toString('utf8'));
    };
    const pinned = await snapshot(binding.manifestUrl.slice(directory.length + 1));
    for (const name of ['manifest.12fc8d5c72fa47bd41946c98a8acced91b70738a5c6da469a08843683dc0f95b.json', 'manifest.496f91b93facbbc9183d939d4da4e758852270fa71ed19e732ad1fa944127c20.json']) {
        const later = await snapshot(name), restored = structuredClone(later);
        assert.match(later.revision, /^materials-/);
        restored.revision = pinned.revision;
        restored.soil.catalog.forEach((soil, index) => { soil.materialId = pinned.soil.catalog[index].materialId; });
        assert.deepEqual(restored, pinned, `${name} differs from the pinned hierarchy snapshot only by its revision and soil material bindings`);
        assert.throws(() => validateLandscapeCityBinding(binding, { manifest: later }), new RegExp(`revision is stale: expected ${pinned.revision}, got ${later.revision}; explicitly rebind`));
        const rebound = validateLandscapeCityBinding({ ...structuredClone(binding), manifestUrl: `${directory}/${name}`, revision: later.revision }, { manifest: later });
        assert.deepEqual([rebound.transform, rebound.extent], [binding.transform, binding.extent]);
        assert.throws(() => validateLandscapeCityBinding(rebound, { manifest: pinned }), /revision is stale/);
    }
});

test('Landscape city binding: rejects unknown versions/capabilities, machine paths and implicit scaling', () => {
    const binding = city().landscape;
    for (const patch of [
        { schemaVersion: 2 }, { capabilities: [] }, { capabilities: ['landscape-reference-v1', 'future-roads'] },
        { manifestUrl: 'C:/terrain/manifest.json' }, { manifestUrl: 'https://example.org/manifest.json' },
        { manifestUrl: 'assets/public/landscape/../private.json' }, { manifestUrl: 'assets/public/landscape/%2e%2e/private.json' },
        { manifestUrl: 'assets/private/terrain.json' }, { transform: { ...binding.transform, scale: 2 } },
        { transform: { ...binding.transform, yawDegrees: Infinity } }, { extent: { minX: 1, maxX: 1, minZ: 0, maxZ: 1 } }
    ]) assert.throws(() => validateLandscapeCityBinding({ ...binding, ...patch }));
    const fixture = createLandscapeModelFixture();
    assert.throws(() => validateLandscapeCityBinding(binding, { manifest: fixture.manifest }), /identity mismatch/);
});

test('Landscape city binding: rigid transforms preserve meters and invert nonzero origins, yaw and height', () => {
    const binding = structuredClone(city().landscape);
    binding.transform = { translation: { x: -375.5, y: 17.25, z: 621.125 }, yawDegrees: 37, scale: 1 };
    const a = { x: 1234.5, y: -7.5, z: 1987.75 }, b = { x: 1200, y: 2, z: 2030 };
    const transformed = landscapePointToCity(binding, a);
    closePoint(cityPointToLandscape(binding, transformed), a);
    assert.equal(transformed.y, 9.75);
    const other = landscapePointToCity(binding, b);
    assert.ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(transformed.x - other.x, transformed.z - other.z)) < 1e-9);
    const rectangle = cityRegionToLandscape(binding, { type: 'rectangle', minX: -12, maxX: 5, minZ: 3, maxZ: 17 });
    assert.equal(rectangle.type, 'polygon');
    closePoint(landscapePointToCity(binding, rectangle.points[0]), { x: -12, z: 3 });
    assert.equal(cityRegionToLandscape(binding, { type: 'circle', center: { x: 1, z: 2 }, radius: 13 }).radius, 13);
});

test('Landscape city binding: tile centers and partial edge extent never recenter the landscape', () => {
    const spec = city();
    const first = cityTileLandscapeCoverage(spec.landscape, spec, 0, 0);
    assert.equal(first.status, 'inside');
    closePoint(first.polygon.points[0], { x: 1000, z: 1800 });
    const last = cityTileLandscapeCoverage(spec.landscape, spec, 20, 16);
    assert.equal(last.status, 'partial');
    assert.equal(last.coveredArea, 20 * 16);
    const expanded = applyCitySpecSettings(spec, { width: 22, height: 18 });
    assert.equal(cityTileLandscapeCoverage(expanded.landscape, expanded, 21, 17).status, 'outside');
    assert.deepEqual(expanded.origin, spec.origin);
    assert.deepEqual(expanded.landscape, spec.landscape);
});

test('Landscape city binding: normalize, import actual exported JS, resolve and reload preserve authored placement', async () => {
    const spec = city();
    spec.buildings.push({ id: 'disabled-parcel', configId: 'burban', tiles: [[14, 10], [15, 10]], rendered: false, placement: { padding: 3, front: 'north' } });
    const sourceMap = mapFrom(spec);
    const exported = sourceMap.exportSpec({ seed: spec.seed, version: spec.version });
    const moduleText = serializeCitySpecToModule(normalizeCitySpec(exported));
    const importedModule = await import(`data:text/javascript;base64,${Buffer.from(moduleText).toString('base64')}`);
    const imported = importCitySpecModule(importedModule);
    const restored = mapFrom(imported);
    assert.deepEqual(imported.landscape, spec.landscape);
    assert.deepEqual(imported.reservations, spec.reservations);
    assert.deepEqual(imported.buildings.map(({ id, configId, placement, tiles, rendered }) => ({ id, configId, placement, tiles, rendered })), exported.buildings.map(({ id, configId, placement, tiles, rendered }) => ({ id, configId, placement, tiles, rendered })));
    assert.deepEqual(restored.reservations, sourceMap.reservations);
    assert.deepEqual(restored.buildings.map(entry => entry.footprintLoops), sourceMap.buildings.map(entry => entry.footprintLoops));
    assert.equal(imported.buildings[1].rendered, false);
    imported.buildings[0].id = 'mutated-return-value';
    assert.equal(importCitySpecModule(importedModule).buildings[0].id, spec.buildings[0].id);
});

test('Landscape city binding: seed, dimensions and ordinary edits leave reference and placements fixed', () => {
    const spec = city(), original = mapFrom(spec);
    const edited = applyCitySpecSettings(spec, { width: 25, height: 20, seed: 'different-population-seed' });
    edited.roads.push({ points: [{ x: -800, y: 91, z: -120 }, { x: -730, y: 98, z: -120 }], lanesF: 1, lanesB: 1, rendered: false });
    const resolved = mapFrom(normalizeCitySpec(edited));
    const exported = resolved.exportSpec({ seed: edited.seed });
    assert.deepEqual(exported.landscape, spec.landscape);
    assert.deepEqual(exported.origin, spec.origin);
    assert.deepEqual(resolved.reservations, original.reservations);
    assert.deepEqual(resolved.buildings[0].footprintLoops, original.buildings[0].footprintLoops);
    assert.deepEqual(exported.roads[0].points.map(({ x, z }) => ({ x, z })), [{ x: -800, z: -120 }, { x: -730, z: -120 }]);
    closePoint(cityPointToLandscape(exported.landscape, exported.origin), { x: 1012, z: 1812 });
});

test('Landscape city binding: dropping authored squares or omitting origin fails before rebuilding', () => {
    const spec = city();
    assert.throws(() => applyCitySpecSettings(spec, { width: 5 }), /excludes authored square/);
    assert.throws(() => mapFrom({ ...spec, width: 5 }), /excludes authored square/);
    const withoutOrigin = { ...spec };
    delete withoutOrigin.origin;
    assert.throws(() => normalizeCitySpec(withoutOrigin), /explicit positive grid/);
    assert.throws(() => mapFrom(withoutOrigin), /explicit positive grid/);
    assert.throws(() => normalizeCitySpec({ ...spec, tileSize: 0 }), /explicit positive grid/);
    assert.throws(() => mapFrom({ ...spec, width: undefined }), /explicit positive grid/);
    assert.throws(() => mapFrom({ ...spec, height: 0 }), /explicit positive grid/);
    assert.throws(() => mapFrom({ ...spec, width: 2 ** 32 + 21 }), /explicit positive grid/);
});

test('Landscape city binding: reservation adapter uses resolved footprints, preserves IDs and inverse yaw', () => {
    const spec = city(), reservations = mapFrom(spec).reservations;
    spec.landscape.transform.yawDegrees = -31;
    const constraints = cityReservationsToLandscapeConstraints(spec.landscape, reservations);
    assert.equal(constraints[0].id, reservations[0].id);
    assert.equal(constraints[0].classification, 'reservation');
    constraints[0].shape.region.points.forEach((point, index) => closePoint(landscapePointToCity(spec.landscape, point), reservations[0].loops[0][index]));
    assert.throws(() => cityReservationsToLandscapeConstraints(spec.landscape, [reservations[0], reservations[0]]), /duplicate reservation/);
});

test('Landscape city binding: a renderer-free consumer loads the pinned manifest and samples native terrain', async () => {
    const fixture = createLandscapeModelFixture(), binding = structuredClone(city().landscape);
    Object.assign(binding, { landscapeId: fixture.manifest.id, revision: fixture.manifest.revision, extent: { ...fixture.manifest.bounds } });
    binding.manifestUrl = 'assets/public/landscape/fixture/manifest.json';
    const calls = [], baseUrl = 'https://landscape.test/';
    const fetchImpl = async url => {
        const key = String(url);
        calls.push(key);
        if (key.endsWith('/manifest.json')) return new Response(JSON.stringify(fixture.manifest));
        const relative = key.replace(`${baseUrl}assets/public/landscape/fixture/`, '');
        const bytes = fixture.resources.get(relative);
        assert.ok(bytes, relative);
        return new Response(bytes);
    };
    const loaded = await loadCityLandscape(binding, { baseUrl, fetchImpl });
    assert.equal(calls.length, 1);
    const selection = await queryLandscapeSelection(loaded.manifest, { x: 0, z: 18, selectionId: 'consumer-point', expectedRevision: binding.revision }, {
        readChunk: id => loadLandscapeChunk(loaded.manifest, id, { manifestUrl: loaded.manifestUrl, fetchImpl })
    });
    assert.equal(selection.provisional, false);
    assert.equal(selection.acquisition.accuracy, 'authoritative');
    assert.ok(Number.isFinite(selection.sample.height));
    const cityPoint = landscapePointToCity(binding, { x: selection.position.x, y: selection.sample.height, z: selection.position.z });
    closePoint(cityPointToLandscape(binding, cityPoint), { x: 0, y: selection.sample.height, z: 18 });
});

test('Landscape city binding: flat-city compatibility and explicit terrain capability refusal', () => {
    const legacy = createCitySpecById('demo', createCityConfig({ size: 192 }));
    const normalized = normalizeCitySpec(legacy);
    assert.equal('landscape' in normalized, false);
    const changed = applyCitySpecSettings(normalized, { width: 10, height: 12 });
    assert.deepEqual(changed.origin, { x: -108, z: -132 });
    assert.equal('landscape' in mapFrom(legacy).exportSpec(), false);
    assert.doesNotThrow(() => assertFlatCityCapability(legacy, 'slabs'));
    assert.throws(() => assertFlatCityCapability(city(), 'slabs'), /slabs does not support landscape-bound cities.*reference plan/);
});
