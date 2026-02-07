// Node unit tests: GTAO update scheduler helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCameraViewStateChanged, shouldUpdateGtaoFixedRate } from '../../../src/graphics/visuals/postprocessing/GtaoUpdateScheduler.js';

test('GtaoUpdateScheduler: fixed-rate cadence is deterministic', () => {
    const frames = Array.from({ length: 10 }, (_, i) => i);

    const every = frames.filter((i) => shouldUpdateGtaoFixedRate({ updateMode: 'every_frame', frameIndex: i }));
    assert.deepEqual(every, frames);

    const half = frames.filter((i) => shouldUpdateGtaoFixedRate({ updateMode: 'half_rate', frameIndex: i }));
    assert.deepEqual(half, [0, 2, 4, 6, 8]);

    const third = frames.filter((i) => shouldUpdateGtaoFixedRate({ updateMode: 'third_rate', frameIndex: i }));
    assert.deepEqual(third, [0, 3, 6, 9]);

    const quarter = frames.filter((i) => shouldUpdateGtaoFixedRate({ updateMode: 'quarter_rate', frameIndex: i }));
    assert.deepEqual(quarter, [0, 4, 8]);
});

test('GtaoUpdateScheduler: identical camera state does not trigger updates', () => {
    const base = {
        position: { x: 1, y: 2, z: 3 },
        quaternion: { x: 0, y: 0, z: 0, w: 1 },
        projection: { type: 'perspective', fov: 55, aspect: 1.5, near: 0.1, far: 500, zoom: 1 }
    };
    const same = JSON.parse(JSON.stringify(base));
    const moved = hasCameraViewStateChanged(base, same, { positionMeters: 0.02, rotationDeg: 0.15, fovDeg: 0 });
    assert.equal(moved, false);
});

test('GtaoUpdateScheduler: thresholds gate motion detection', () => {
    const base = {
        position: { x: 0, y: 0, z: 0 },
        quaternion: { x: 0, y: 0, z: 0, w: 1 },
        projection: { type: 'perspective', fov: 55, aspect: 1, near: 0.1, far: 500, zoom: 1 }
    };

    const tinyMove = { ...base, position: { x: 0.001, y: 0, z: 0 } };
    assert.equal(hasCameraViewStateChanged(base, tinyMove, { positionMeters: 0.01, rotationDeg: 0, fovDeg: 0 }), false);
    assert.equal(hasCameraViewStateChanged(base, tinyMove, { positionMeters: 0.0001, rotationDeg: 0, fovDeg: 0 }), true);

    const fovMove = { ...base, projection: { ...base.projection, fov: 55.05 } };
    assert.equal(hasCameraViewStateChanged(base, fovMove, { positionMeters: 0, rotationDeg: 0, fovDeg: 0.1 }), false);
    assert.equal(hasCameraViewStateChanged(base, fovMove, { positionMeters: 0, rotationDeg: 0, fovDeg: 0.01 }), true);
});

