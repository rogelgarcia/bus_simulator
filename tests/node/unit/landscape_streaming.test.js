// Tests screen-space planning, hard transient budgets and independent residency interests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLandscapeViewPlanner, LandscapeResidencyBudget, landscapeResourceKey, validateLandscapeManifest } from '../../../src/app/landscape/index.js';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';

const perspective = { projection: 'perspective', position: { x: 0, y: 10000, z: -9982 }, direction: { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 }, viewportHeight: 1080, fovYRadians: Math.PI / 3, zoom: 1 };
const ortho = { projection: 'orthographic', position: { x: 0, y: 10000, z: 18 }, viewportHeight: 1080, orthoHeight: 10000, zoom: 1 };

function hierarchyFixture() {
    const manifest = structuredClone(createLandscapeModelFixture({ maxLevel: 3 }).manifest);
    const root = manifest.chunks[0];
    for (let level = 1; level < 3; level++) {
        const count = 2 ** level;
        const width = (manifest.bounds.maxX - manifest.bounds.minX) / count;
        const depth = (manifest.bounds.maxZ - manifest.bounds.minZ) / count;
        for (let row = 0; row < count; row++) for (let column = 0; column < count; column++) {
            manifest.chunks.push({ ...structuredClone(root), id: `l${level}/c${column}/r${row}`, level, column, row,
                startColumn: column * 4 * 2 ** (3 - level), startRow: row * 4 * 2 ** (3 - level), sampleStride: 2 ** (3 - level),
                bounds: { minX: manifest.bounds.minX + column * width, maxX: manifest.bounds.minX + (column + 1) * width, minZ: manifest.bounds.maxZ - (row + 1) * depth, maxZ: manifest.bounds.maxZ - row * depth }, geometricError: 4 / level });
        }
    }
    for (const chunk of manifest.chunks) if (chunk.level) chunk.parentId = `l${chunk.level - 1}/c${Math.floor(chunk.column / 2)}/r${Math.floor(chunk.row / 2)}`;
    manifest.capabilities.push('chunk-hierarchy-v1');
    manifest.hierarchy = { algorithm: 'native-hierarchy-v1', errorPolicy: 'measured-native-vertices' };
    return validateLandscapeManifest(manifest);
}

test('Landscape streaming: fixed-position perspective FOV and orthographic zoom refine then coarsen', () => {
    const planner = createLandscapeViewPlanner(createLandscapeModelFixture().manifest);
    const wide = planner.plan(perspective);
    const narrow = planner.plan({ ...perspective, fovYRadians: Math.PI / 45 }, { previousLeafIds: wide.desiredLeafIds });
    assert.equal(wide.desiredLeafIds.length, 1);
    assert.equal(narrow.desiredLeafIds.length, 4);
    assert.deepEqual(planner.plan(perspective, { previousLeafIds: narrow.desiredLeafIds }).desiredLeafIds, wide.desiredLeafIds);
    assert.equal(planner.plan(ortho).desiredLeafIds.length, 1);
    const zoomed = planner.plan({ ...ortho, zoom: 40 });
    assert.equal(zoomed.desiredLeafIds.length, 4);
    assert.equal(zoomed.desiredErrorPixels, 0);
    assert.equal(planner.plan(ortho, { previousLeafIds: zoomed.desiredLeafIds }).desiredLeafIds.length, 1);
});

test('Landscape streaming: viewport resolution, altitude and viewing planes affect desired detail', () => {
    const planner = createLandscapeViewPlanner(createLandscapeModelFixture().manifest);
    assert.equal(planner.plan({ ...perspective, viewportHeight: 8000 }).desiredLeafIds.length, 4);
    assert.equal(planner.plan({ ...perspective, position: { x: 0, y: 30, z: 18 } }).desiredLeafIds.length, 4);
    const away = planner.plan({ ...perspective, position: { x: 0, y: 30, z: 18 }, frustumPlanes: [{ x: 1, y: 0, z: 0, w: -100 }] });
    assert.equal(away.desiredLeafIds.length, 1);
    assert.equal(away.desiredVisibleLeafIds.length, 0);
});

test('Landscape streaming: hysteresis keeps prior children until the lower coarsening threshold', () => {
    const manifest = createLandscapeModelFixture().manifest;
    const planner = createLandscapeViewPlanner(manifest);
    const camera = { ...ortho, orthoHeight: manifest.chunks[0].geometricError * 1080 / 1.2 };
    assert.equal(planner.plan(camera).desiredLeafIds.length, 1);
    const prior = manifest.chunks.filter(chunk => chunk.level === 1).map(chunk => chunk.id);
    assert.equal(planner.plan(camera, { previousLeafIds: prior }).desiredLeafIds.length, 4);
    assert.equal(planner.plan({ ...camera, orthoHeight: camera.orthoHeight * 2 }, { previousLeafIds: prior }).desiredLeafIds.length, 1);
});

test('Landscape streaming: focused detail remains a complete partition with adjacent levels differing at most one', () => {
    const manifest = hierarchyFixture();
    const planner = createLandscapeViewPlanner(manifest);
    const result = planner.plan({ ...ortho, orthoHeight: 100, frustumPlanes: [{ x: 1, y: 0, z: 0, w: -22 }, { x: -1, y: 0, z: 0, w: 23 }, { x: 0, y: 0, z: 1, w: -42 }, { x: 0, y: 0, z: -1, w: 43 }] });
    const leaves = result.desiredLeafIds.map(id => manifest.chunks.find(chunk => chunk.id === id));
    assert.ok(leaves.some(chunk => chunk.level === 3));
    assert.ok(leaves.some(chunk => chunk.level < 3));
    assert.equal(leaves.reduce((sum, chunk) => sum + 1 / 4 ** chunk.level, 0), 1);
    for (const a of leaves) for (const b of leaves) {
        const xOverlap = Math.min(a.bounds.maxX, b.bounds.maxX) > Math.max(a.bounds.minX, b.bounds.minX);
        const zOverlap = Math.min(a.bounds.maxZ, b.bounds.maxZ) > Math.max(a.bounds.minZ, b.bounds.minZ);
        const adjacent = xOverlap && (a.bounds.minZ === b.bounds.maxZ || a.bounds.maxZ === b.bounds.minZ) || zOverlap && (a.bounds.minX === b.bounds.maxX || a.bounds.maxX === b.bounds.minX);
        if (adjacent) assert.ok(Math.abs(a.level - b.level) <= 1, `${a.id} / ${b.id}`);
    }
});

test('Landscape streaming: unsupported skipped hierarchy stays covered and reports unmet desired error', () => {
    const planner = createLandscapeViewPlanner(createLandscapeModelFixture({ maxLevel: 3 }).manifest);
    const result = planner.plan({ ...ortho, orthoHeight: 1 });
    assert.deepEqual(result.desiredLeafIds, ['l0/c0/r0']);
    assert.equal(result.sourceLimited, true);
    assert.ok(result.desiredErrorPixels > result.targetErrorPixels);
});

test('Landscape streaming: predictive prefetch is bounded and advances beyond the visible partition', () => {
    const manifest = hierarchyFixture();
    const planner = createLandscapeViewPlanner(manifest);
    const camera = { ...ortho, orthoHeight: 100, frustumPlanes: [{ x: -1, y: 0, z: 0, w: -7 }] };
    const stationary = planner.plan(camera);
    const moving = planner.plan({ ...camera, velocity: { x: 40, y: 0, z: 0 } });
    assert.equal(moving.prefetchIds.length, 2);
    assert.notDeepEqual(moving.prefetchIds, stationary.prefetchIds);
    for (const id of moving.prefetchIds) {
        assert.equal(moving.visibilityById[id], false);
        assert.equal(moving.desiredLeafIds.includes(id), false);
    }
    assert.ok(planner.plan({ ...camera, velocity: { x: 1000000, y: 0, z: 0 } }).prefetchIds.length <= 2);
});

test('Landscape streaming: rejects invalid cameras instead of producing NaN plans', () => {
    const planner = createLandscapeViewPlanner(createLandscapeModelFixture().manifest);
    for (const bad of [{ ...perspective, zoom: 0 }, { ...perspective, fovYRadians: Math.PI }, { ...ortho, orthoHeight: NaN }, { ...perspective, direction: { x: 0, y: 0, z: 0 } }]) assert.throws(() => planner.plan(bad));
    assert.throws(() => planner.plan(perspective, { previousLeafIds: ['unknown'] }), /unknown previous leaf/);
});

test('Landscape streaming: perspective error includes magnification from elevation changing view depth', () => {
    const manifest = structuredClone(createLandscapeModelFixture().manifest);
    const root = manifest.chunks[0];
    root.geometricError = 1;
    const position = { x: 0, y: root.maxHeight - 1 + 30, z: root.bounds.minZ - 100 };
    const planner = createLandscapeViewPlanner(manifest);
    const result = planner.plan({ ...perspective, position });
    const focal = perspective.viewportHeight / (2 * Math.tan(perspective.fovYRadians / 2));
    const project = y => (y + 100) / (-y + 100);
    const actualPixels = Math.abs(project(-29) - project(-30)) * focal;
    assert.ok(result.errorsById[root.id] >= actualPixels, `${result.errorsById[root.id]} must bound ${actualPixels}`);
});

test('Landscape residency: reserves old/new overlap before work and rejects overflow atomically', () => {
    const budget = new LandscapeResidencyBudget({ cpuBytes: 100, gpuBytes: 60 });
    assert.equal(budget.reserve('root', { cpuBytes: 10, gpuBytes: 10, kind: 'geometry', pinned: true }).admitted, true);
    assert.equal(budget.reserve('work', { cpuBytes: 80, gpuBytes: 45, kind: 'decode-staging' }).admitted, true);
    assert.deepEqual(budget.reserve('too-large', { cpuBytes: 20, gpuBytes: 1, kind: 'query' }), { admitted: false, reason: 'cpu-budget' });
    assert.deepEqual(budget.update('work', { gpuBytes: 55 }), { admitted: false, reason: 'gpu-budget' });
    assert.equal(budget.snapshot().gpuBytes, 55);
    assert.equal(budget.snapshot().cpuBytes, 90);
    assert.equal(budget.release('root'), false);
    assert.equal(budget.update('work', { cpuBytes: 30, gpuBytes: 40, kind: 'resident' }).admitted, true);
    assert.equal(budget.snapshot().peakCpuBytes, 90);
    assert.equal(budget.release('work'), true);
    budget.dispose();
    assert.equal(budget.snapshot().cpuBytes, 0);
    assert.equal(budget.snapshot().gpuBytes, 0);
});

test('Landscape residency: offscreen native query, shadow and collision leases survive camera release in any order', () => {
    const budget = new LandscapeResidencyBudget({ cpuBytes: 100, gpuBytes: 100 });
    budget.reserve('tile', { cpuBytes: 50, gpuBytes: 30, kind: 'native-source' });
    const camera = budget.acquireLease('tile', { consumer: 'camera' });
    const query = budget.acquireLease('tile', { consumer: 'edit-query', priority: 100, accuracy: 'authoritative' });
    const shadow = budget.acquireLease('tile', { consumer: 'shadow', priority: 20 });
    const collision = budget.acquireLease('tile', { consumer: 'future-collision-test', priority: 200, accuracy: 'authoritative' });
    camera.release();
    assert.equal(budget.release('tile'), false);
    shadow.release();
    collision.release();
    assert.equal(budget.release('tile'), false);
    assert.equal(budget.snapshot().entries[0].leases[0].consumer, 'edit-query');
    query.release();
    query.release();
    assert.equal(budget.release('tile'), true);
    assert.equal(budget.snapshot().leaseCount, 0);
});

test('Landscape residency: repeated movement, canceled work and denied requests leave no accumulation', () => {
    const budget = new LandscapeResidencyBudget({ cpuBytes: 100, gpuBytes: 80 });
    for (let i = 0; i < 100; i++) {
        budget.reserve(`request-${i}`, { cpuBytes: 80, gpuBytes: 70, kind: 'worker' });
        const lease = budget.acquireLease(`request-${i}`, { consumer: 'query' });
        assert.equal(budget.reserve('overflow', { cpuBytes: 21, gpuBytes: 1, kind: 'worker' }).admitted, false);
        lease.release();
        budget.release(`request-${i}`);
        assert.equal(budget.snapshot().entries.length, 0);
    }
    assert.equal(budget.snapshot().cpuBytes, 0);
    assert.equal(budget.snapshot().gpuBytes, 0);
    assert.equal(budget.snapshot().peakCpuBytes, 80);
    assert.equal(budget.snapshot().peakGpuBytes, 70);
});

test('Landscape residency: resource identity includes landscape, revision, spatial LOD and channel content', () => {
    const manifest = createLandscapeModelFixture().manifest;
    const descriptor = manifest.chunks[0];
    const key = landscapeResourceKey(manifest, descriptor, 'height');
    assert.notEqual(key, landscapeResourceKey({ ...manifest, id: 'other' }, descriptor, 'height'));
    assert.notEqual(key, landscapeResourceKey({ ...manifest, revision: 'other' }, descriptor, 'height'));
    assert.notEqual(key, landscapeResourceKey(manifest, descriptor, 'landCover'));
    assert.notEqual(key, landscapeResourceKey(manifest, { ...descriptor, channels: { ...descriptor.channels, height: { ...descriptor.channels.height, revision: 'edited' } } }, 'height'));
});
