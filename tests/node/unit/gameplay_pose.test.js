import test from 'node:test';
import assert from 'node:assert/strict';
import {
    readGameplayPoseFromSearch,
    resolveGameplayPoseCamera,
    sanitizeGameplayPose
} from '../../../src/app/gameplay/GameplayPose.js';
import {
    GAMEPLAY_POSE_CATALOG,
    getGameplayPosePreset
} from '../../../src/app/gameplay/GameplayPoseCatalog.js';

test('gameplay pose catalog exposes an immutable civic-center preset', () => {
    const entry = getGameplayPosePreset('CIVIC_CENTER_CURVE_FRONT');
    assert.equal(entry?.id, 'civic_center_curve_front');
    assert.equal(entry?.pose?.city, 'bigcity2');
    assert.equal(entry?.pose?.bus?.modelId, 'city');
    assert.equal(Object.isFrozen(GAMEPLAY_POSE_CATALOG), true);
    assert.equal(Object.isFrozen(entry?.pose?.camera), true);
});

test('named gameplay pose loads from the short pose query parameter', () => {
    const pose = readGameplayPoseFromSearch('?pose=civic_center_curve_front');
    assert.equal(pose?.presetId, 'civic_center_curve_front');
    assert.deepEqual(pose?.bus?.position, { x: -144, z: 48 });
    assert.equal(pose?.simulation?.paused, true);
    assert.equal(Object.isFrozen(pose), true);
});

test('inline gameplay pose overrides nested preset values', () => {
    const inline = JSON.stringify({
        bus: { position: { x: -80 }, wheelRotationDeg: 135 },
        camera: { fovDeg: 48 },
        hud: { visible: false }
    });
    const pose = readGameplayPoseFromSearch(`?pose=civic_center_curve_front&gameplayPose=${encodeURIComponent(inline)}`);
    assert.deepEqual(pose?.bus?.position, { x: -80, z: 48 });
    assert.equal(pose?.bus?.steeringWheelDeg, 135);
    assert.equal(pose?.camera?.fovDeg, 48);
    assert.equal(pose?.hud?.visible, false);
});

test('orbit camera angles resolve into a deterministic world-space camera', () => {
    const pose = sanitizeGameplayPose({
        camera: { yawDeg: 180, pitchDeg: 0, distance: 20, locked: true }
    });
    const camera = resolveGameplayPoseCamera(pose, { x: 10, y: 2, z: 30 });
    assert.ok(camera);
    assert.ok(Math.abs(camera.position.x - 10) < 1e-9);
    assert.ok(Math.abs(camera.position.y - 2) < 1e-9);
    assert.ok(Math.abs(camera.position.z - 10) < 1e-9);
    assert.deepEqual(camera.target, { x: 10, y: 2, z: 30 });
});

test('invalid gameplay pose input is rejected at the URL boundary', () => {
    const warnings = [];
    const pose = readGameplayPoseFromSearch('?pose=missing_pose', {
        warn: (message, error) => warnings.push({ message, error })
    });
    assert.equal(pose, null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].message, /invalid gameplay pose/i);
});
