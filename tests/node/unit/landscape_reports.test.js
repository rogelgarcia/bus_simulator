// Verifies renderer-independent terrain reports, exact overlaps, budgets, and dependency freshness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { reportLandscapeTerrain, readLandscapeTerrainReport } from '../../../src/app/landscape/LandscapeTerrainReports.js';
import { createLandscapeDependency, checkLandscapeDependency, landscapeChangeInvalidates } from '../../../src/app/landscape/LandscapeDependencies.js';

const requestFor = fixture => ({ expectedRevision: fixture.manifest.revision, shape: { type: 'footprint', region: { type: 'rectangle', ...fixture.manifest.bounds } }, sampleSpacingMeters: 2 });
const readerFor = fixture => ({ readChunk: async id => fixture.decoded.get(id) });

test('Landscape report payload: bounded HTTP reading rejects foreign, stale, and oversized results', async () => {
    const fixture = createLandscapeModelFixture(), report = await reportLandscapeTerrain(fixture.manifest, requestFor(fixture), readerFor(fixture));
    const expected = { landscapeId: fixture.manifest.id, revision: fixture.manifest.revision };
    assert.deepEqual(await readLandscapeTerrainReport(Response.json(report), expected), report);
    await assert.rejects(readLandscapeTerrainReport(Response.json(report), { ...expected, revision: 'stale' }), /identity\/revision/);
    await assert.rejects(readLandscapeTerrainReport(Response.json(report), { ...expected, landscapeId: 'another' }), /identity\/revision/);
    await assert.rejects(readLandscapeTerrainReport(new Response(' '.repeat(512 * 1024 + 1)), expected), /exceeds/);
    await assert.rejects(readLandscapeTerrainReport(new Response('failure', { status: 409 }), expected), /HTTP 409/);
});

test('Landscape reports: one native chunk at a time, exact plane slope and declared sampled composition', async () => {
    const fixture = createLandscapeModelFixture({ heightAt: (column, row) => column * 2 - 8, coverAt: column => column < 4 ? 1 : 4 });
    const report = await reportLandscapeTerrain(fixture.manifest, requestFor(fixture), readerFor(fixture));
    assert.equal(report.status, 'ready'); assert.equal(report.elevation.min, -8); assert.equal(report.elevation.max, 8);
    assert.equal(report.slopeDegrees.min, 45); assert.equal(report.slopeDegrees.max, 45);
    assert.equal(report.area.squareMeters, 256); assert.equal(report.area.exact, true);
    assert.equal(report.resources.chunkReads, 4); assert.equal(report.resources.maxDecodedChunks, 1);
    assert.equal(report.resources.workingBytes, 500); assert.equal(report.sampling.nativeSpacingMeters, 2);
    assert.equal(report.soilComposition.reduce((sum, item) => sum + item.samples, 0), report.sampling.ready);
    assert.ok(report.water.submergedFraction > 0 && report.water.submergedFraction < 1);
    assert.match(report.sampling.interpretation, /unsampled terrain may differ/);
    assert.equal(report.constraintCoverage.status, 'not-requested');
});

test('Landscape reports: source failure stays unknown, partial/outside regions never become zero terrain', async () => {
    const fixture = createLandscapeModelFixture(), request = requestFor(fixture);
    const missing = await reportLandscapeTerrain(fixture.manifest, request, { readChunk: async id => { if (id === 'l1/c0/r0') throw new Error('hash mismatch'); return fixture.decoded.get(id); } });
    assert.equal(missing.status, 'partial'); assert.ok(missing.sampling.unknown > 0); assert.equal(missing.failures[0].reason, 'hash mismatch');
    assert.equal(missing.sampling.ready + missing.sampling.unknown, missing.sampling.requested);
    const unavailable = await reportLandscapeTerrain(fixture.manifest, request, { readChunk: async () => { throw new Error('offline'); } });
    assert.equal(unavailable.status, 'unavailable'); assert.equal(unavailable.elevation, null); assert.equal(unavailable.water, null);
    const partial = await reportLandscapeTerrain(fixture.manifest, { ...request, shape: { type: 'footprint', region: { type: 'circle', center: { x: -8, z: 18 }, radius: 4 } } }, readerFor(fixture));
    assert.equal(partial.status, 'partial'); assert.ok(partial.sampling.outside > 0);
    const outside = await reportLandscapeTerrain(fixture.manifest, { ...request, shape: { type: 'footprint', region: { type: 'circle', center: { x: -80, z: 18 }, radius: 4 } } }, readerFor(fixture));
    assert.equal(outside.status, 'outside'); assert.equal(outside.resources.chunkReads, 0); assert.equal(outside.elevation, null);
});

test('Landscape reports: corridor profile preserves signed grade and exact clearance overlap instead of occupied tiles', async () => {
    const fixture = createLandscapeModelFixture({ heightAt: column => column * 2 });
    const request = { ...requestFor(fixture), shape: { type: 'corridor', points: [{ x: -6, z: 12 }, { x: 6, z: 24 }], widthMeters: 1 },
        constraints: [
            { id: 'crossing', classification: 'reservation', shape: { type: 'footprint', region: { type: 'rectangle', minX: -1, maxX: 1, minZ: 17, maxZ: 19 } } },
            { id: 'same-bounds-but-misses', classification: 'reservation', shape: { type: 'footprint', region: { type: 'rectangle', minX: -5, maxX: -4, minZ: 21, maxZ: 22 } } },
            { id: 'view-corridor', classification: 'advisory', shape: { type: 'corridor', points: [{ x: -6, z: 24 }, { x: 6, z: 12 }], widthMeters: 2 } }
        ] };
    const report = await reportLandscapeTerrain(fixture.manifest, request, readerFor(fixture));
    assert.deepEqual(report.overlaps.map(item => item.id), ['crossing', 'view-corridor']);
    assert.equal(report.constraintCoverage.status, 'evaluated'); assert.equal(report.constraintCoverage.tested, 3);
    assert.equal(report.area.exact, true);
    for (const point of report.corridorProfile.slice(1)) assert.ok(Math.abs(point.gradePercent - 100 / Math.sqrt(2)) < 1e-10);
    const reversed = await reportLandscapeTerrain(fixture.manifest, { ...request, shape: { ...request.shape, points: [...request.shape.points].reverse() } }, readerFor(fixture));
    assert.ok(reversed.corridorProfile.at(-1).gradePercent < 0);
});

test('Landscape reports: circle/polygon overlap handles containment and edge-only crossings', async () => {
    const fixture = createLandscapeModelFixture();
    const report = await reportLandscapeTerrain(fixture.manifest, { ...requestFor(fixture), shape: { type: 'footprint', region: { type: 'circle', center: { x: 0, z: 18 }, radius: 2 } }, constraints: [
        { id: 'edge-touch', classification: 'advisory', shape: { type: 'footprint', region: { type: 'polygon', points: [{ x: 2, z: 17 }, { x: 4, z: 17 }, { x: 4, z: 19 }, { x: 2, z: 19 }] } } },
        { id: 'bbox-false-positive', classification: 'informational', shape: { type: 'footprint', region: { type: 'rectangle', minX: 1.8, maxX: 3, minZ: 19.8, maxZ: 21 } } }
    ] }, readerFor(fixture));
    assert.deepEqual(report.overlaps.map(item => item.id), ['edge-touch']);
});

test('Landscape reports: admission rejects stale, undersampled, oversized, and canceled requests before I/O', async () => {
    const fixture = createLandscapeModelFixture(); let reads = 0;
    const reader = { readChunk: async id => { reads++; return fixture.decoded.get(id); } };
    for (const patch of [{ expectedRevision: 'stale' }, { sampleSpacingMeters: 1 }, { maxSamples: 3 }]) {
        await assert.rejects(reportLandscapeTerrain(fixture.manifest, { ...requestFor(fixture), ...patch }, reader));
    }
    await assert.rejects(reportLandscapeTerrain(fixture.manifest, requestFor(fixture), { ...reader, maxWorkingBytes: 499 }), /working bytes/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(reportLandscapeTerrain(fixture.manifest, requestFor(fixture), { ...reader, signal: controller.signal }), /abort/i);
    assert.equal(reads, 0);
});

test('Landscape dependencies: pin revision, invalidate intersecting channels, reuse unrelated source payloads explicitly', () => {
    const fixture = createLandscapeModelFixture(), bounds = { minX: -7, maxX: -1, minZ: 19, maxZ: 25 };
    const dependency = createLandscapeDependency(fixture.manifest, { bounds, channels: ['height', 'soil'], algorithm: 'test-report-v1' });
    assert.equal(checkLandscapeDependency(dependency, fixture.manifest).status, 'current');
    const next = structuredClone(fixture.manifest); next.revision = 'fixture-r2';
    next.chunks.find(chunk => chunk.id === 'l1/c1/r1').channels.height.sha256 = 'f'.repeat(64);
    next.soil.overrides.push({ region: { type: 'rectangle', minX: 2, maxX: 4, minZ: 12, maxZ: 14 }, soilId: 'sand' });
    assert.equal(checkLandscapeDependency(dependency, next).reason, 'revision-changed');
    assert.equal(checkLandscapeDependency(dependency, next, { requireRevision: false }).status, 'current');
    next.chunks.find(chunk => chunk.id === 'l1/c0/r0').channels.height.sha256 = 'f'.repeat(64);
    assert.equal(checkLandscapeDependency(dependency, next, { requireRevision: false }).reason, 'dependent-content-changed');
    assert.equal(landscapeChangeInvalidates(dependency, { bounds, channels: ['landCover'] }), true);
    assert.equal(landscapeChangeInvalidates(dependency, { bounds, channels: ['water'] }), false);
    assert.equal(landscapeChangeInvalidates(dependency, { bounds: { minX: 2, maxX: 4, minZ: 12, maxZ: 14 }, channels: ['height'] }), false);
});
