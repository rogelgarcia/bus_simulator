// Verifies camera-only bookmark persistence and exact planning-guide buffer sizes without a renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LandscapeBookmarks, validateLandscapeBookmarkCamera } from '../../../src/graphics/gui/landscape_fabrication/LandscapeBookmarks.js';
import { buildLandscapePlanningPositions, landscapePlanningVertexCount, landscapePlanningHeight } from '../../../src/graphics/engine3d/landscape/LandscapePlanningGeometry.js';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';

const camera = { position: [100, 200, 300], target: [20, 10, 40], projection: 'orthographic', fov: 50, orthoHeight: 800, zoom: 2 };
function storage() {
    const entries = new Map();
    return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}
const options = value => ({ landscapeId: 'coastal-city', source: 'https://landscape.test/coastal/manifest.json', storage: value });

test('Bookmarks retain projection and camera across reopen without including terrain revision or edit state', () => {
    const local = storage(), first = new LandscapeBookmarks(options(local)), saved = first.save('Beach approach', camera);
    camera.position[0] = 101;
    const reopened = new LandscapeBookmarks(options(local));
    assert.equal(reopened.error, null); assert.deepEqual(reopened.get(saved.id), saved);
    assert.equal(reopened.get(saved.id).camera.position[0], 100);
    const document = JSON.parse([...local.entries.values()][0]);
    assert.equal(document.revision, undefined); assert.equal(document.operations, undefined);
    const updated = reopened.save('Beach approach', { ...camera, zoom: 4 });
    assert.equal(updated.id, saved.id); assert.equal(reopened.snapshot().length, 1);
    reopened.remove(saved.id); assert.deepEqual(new LandscapeBookmarks(options(local)).snapshot(), []);
});

test('Malformed bookmark data and storage failures cannot silently replace valid saved views', () => {
    const local = storage(), bookmarks = new LandscapeBookmarks(options(local));
    bookmarks.save('Valid', camera);
    local.setItem = () => { throw new Error('quota'); };
    assert.throws(() => bookmarks.save('Denied', camera), /storage is unavailable/); assert.equal(bookmarks.snapshot().length, 1);
    assert.throws(() => validateLandscapeBookmarkCamera({ ...camera, position: [NaN, 2, 3] }), /position\/target/);
    assert.throws(() => bookmarks.save(' ', camera), /name must/);
    const damaged = storage(); damaged.entries.set(bookmarks.key, '{not JSON');
    const reopened = new LandscapeBookmarks(options(damaged)); assert.ok(reopened.error); assert.deepEqual(reopened.snapshot(), []);
    const other = new LandscapeBookmarks({ ...options(local), source: 'https://landscape.test/other/manifest.json' }); assert.deepEqual(other.snapshot(), []);
});

test('Guide allocation matches the reserved typed-array bytes and uses XZ with current overview heights', () => {
    const fixture = createLandscapeModelFixture({ maxLevel: 1, heightAt: (column, row) => column + row, coverAt: () => 2 });
    const chunk = fixture.decoded.get(fixture.manifest.overviewId), point = { x: 0, y: 999, z: 18 };
    const features = [{ geometry: { type: 'polyline', points: [point, { x: 8, y: 999, z: 18 }] } },
        { geometry: { type: 'point', points: [point] } }];
    assert.equal(landscapePlanningHeight(chunk, 0, 18), 8);
    assert.equal(landscapePlanningVertexCount(features), 6);
    const positions = buildLandscapePlanningPositions(features, chunk);
    assert.equal(positions.byteLength, 6 * 3 * 4);
    assert.deepEqual([...positions.slice(0, 3)], [0, 9.5, 18]);
    assert.equal(point.y, 999); assert.ok(!positions.includes(999));
});
