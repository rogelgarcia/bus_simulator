// Verifies authenticated planning provenance, true X/Y/Z ordering, bounded admission, and source failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadLandscapePlanningReferences, normalizeLandscapePlanningReference, LANDSCAPE_PLANNING_LIMITS } from '../../../src/app/landscape/LandscapePlanningReferences.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const cacheSkip = landscapeCacheSkip();
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/public/landscape/coastal-city');
const manifest = cacheSkip ? null : JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const manifestUrl = 'https://landscape.test/coastal/manifest.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readReference = async reference => JSON.parse(await readFile(path.join(directory, reference.url), 'utf8'));

test('Retained coastal planning references preserve district IDs and road XYZ while exposing exact XZ geometry', { skip: cacheSkip }, async () => {
    const requested = [];
    const result = await loadLandscapePlanningReferences(manifest, { manifestUrl, fetchImpl: async url => {
        const relative = new URL(url).pathname.slice('/coastal/'.length); requested.push(relative);
        return new Response(await readFile(path.join(directory, relative)));
    } });
    assert.equal(requested.length, 4); assert.ok(requested.every(url => url.endsWith('.json')));
    assert.equal(result.features.filter(feature => feature.kind === 'district').length, 7);
    assert.equal(result.features.filter(feature => feature.kind === 'road').length, 41);
    assert.equal(result.features.length, 52); assert.equal(result.authoritativeTerrain, false);
    const district = result.features.find(feature => feature.id === 'district/1');
    assert.equal(district.sourceId, 1); assert.equal(district.name, 'Industrial');
    assert.deepEqual(district.geometry.points[0], { x: 1248, y: null, z: 3900 });
    const road = result.features.find(feature => feature.id === 'road/industrial-service-loop');
    assert.deepEqual(road.geometry.points[0], { x: 1872, y: 26, z: 3496 });
    assert.equal(road.metadata.widthMeters, 7); assert.equal(road.classification, 'advisory');
    const stop = result.features.find(feature => feature.id === 'point/bus-stop-reservation');
    assert.deepEqual(stop.geometry.points[0], { x: 1260, y: 2.6, z: 520 });
    assert.deepEqual(stop.metadata.footprintMeters, { width: 30, depth: 6, orientation: 'source-unspecified' });
    assert.equal(stop.classification, 'reservation'); assert.equal(stop.sourceId, null);
    assert.ok(result.features.some(feature => feature.id === 'view-corridor/beach-open-view'));
    assert.equal(Object.isFrozen(result.features[0].geometry.points[0]), true);
    assert.equal(result.dependency.length, 4); assert.ok(result.pointCount < LANDSCAPE_PLANNING_LIMITS.points);
});

test('Planning source hashes and declared file bounds are checked before interpreting coordinates', { skip: cacheSkip }, async () => {
    let calls = 0;
    await assert.rejects(loadLandscapePlanningReferences(manifest, { manifestUrl, fetchImpl: async url => {
        calls++;
        const bytes = await readFile(path.join(directory, new URL(url).pathname.slice('/coastal/'.length)));
        bytes[0] ^= 1; return new Response(bytes);
    } }), /SHA-256 mismatch/);
    assert.equal(calls, 1);
    const oversized = structuredClone(manifest), reference = oversized.references.find(value => value.role === 'planning-districts');
    reference.byteLength = LANDSCAPE_PLANNING_LIMITS.fileBytes + 1;
    calls = 0;
    await assert.rejects(loadLandscapePlanningReferences(oversized, { manifestUrl, fetchImpl: async () => { calls++; throw new Error('not reached'); } }), /per-file budget/);
    assert.equal(calls, 0);
});

test('Planning normalization refuses ambiguous XYZ, invalid footprints, and out-of-bounds source coordinates', { skip: cacheSkip }, async () => {
    const reference = manifest.references.find(value => value.role === 'planning-beach-reservations'), original = await readReference(reference);
    assert.throws(() => normalizeLandscapePlanningReference(manifest, reference, { ...original, coordinate_order: 'X,Y map coordinates' }), /coordinate convention/);
    const outside = structuredClone(original); outside.points[0].xyz_m[2] = 100000;
    assert.throws(() => normalizeLandscapePlanningReference(manifest, reference, outside), /outside landscape/);
    const footprint = structuredClone(original); footprint.points[0].footprint_m = [30, -6];
    assert.throws(() => normalizeLandscapePlanningReference(manifest, reference, footprint), /footprint dimensions/);
});

test('Duplicate generated feature IDs fail and canceled loads cannot publish planning records', { skip: cacheSkip }, async () => {
    const input = structuredClone(manifest), reference = input.references.find(value => value.role === 'planning-road-centerlines');
    const data = await readReference(reference); data.roads = [data.roads[0], data.roads[0]];
    const bytes = new TextEncoder().encode(JSON.stringify(data)); reference.byteLength = bytes.length; reference.sha256 = hash(bytes); input.references = [reference];
    await assert.rejects(loadLandscapePlanningReferences(input, { manifestUrl, fetchImpl: async () => new Response(bytes) }), /duplicate planning feature/);
    const controller = new AbortController(); let calls = 0; controller.abort(new Error('cancel planning'));
    await assert.rejects(loadLandscapePlanningReferences(manifest, { manifestUrl, signal: controller.signal, fetchImpl: async () => { calls++; throw new Error('not reached'); } }), /cancel planning/);
    assert.equal(calls, 0);
});
