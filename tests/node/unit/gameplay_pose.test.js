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

test('copied gameplay transforms retain exact anchor height and normalize full orientations', () => {
    const source = {
        bus: { transform: { position: { x: 4, y: 2.8, z: -6 }, quaternion: { x: 1, y: 0, z: 0, w: 1 } } },
        camera: { position: { x: 8, y: 12, z: 10 }, quaternion: { x: 0, y: 1, z: 1, w: 0 } }
    };
    const pose = readGameplayPoseFromSearch(`?gameplayPose=${encodeURIComponent(JSON.stringify(source))}`);
    assert.deepEqual(pose.bus.transform.position, source.bus.transform.position);
    assert.equal(pose.bus.position, undefined);
    assert.ok(Math.abs(pose.bus.transform.quaternion.x - Math.SQRT1_2) < 1e-12);
    assert.deepEqual(resolveGameplayPoseCamera(pose, { x: 0, y: 0, z: 0 }).quaternion, pose.camera.quaternion);
    assert.equal(Object.isFrozen(pose.bus.transform), true);
});

test('incomplete or invalid copied transforms cannot silently launch a different view', () => {
    for (const quaternion of [{ x: 0, y: 0, z: 0, w: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: NaN, w: 1 }]) {
        assert.throws(() => sanitizeGameplayPose({ camera: { quaternion } }), /quaternion/);
    }
    assert.throws(() => sanitizeGameplayPose({ bus: { transform: { position: { x: 0, y: 1, z: 0 } } } }), /requires/);
});
