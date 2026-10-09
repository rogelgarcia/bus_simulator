// Verifies the natural-world review pose file, the direction and resolution math, the strict schema and the tool registration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { REVIEW_POSE_CONVENTIONS, loadReviewPoses, resolveReviewPose, reviewPoseDirection, validateReviewPoses } from '../../../tools/landscape_review/ReviewPoses.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const poseFile = path.join(root, 'tools/landscape_review/poses/natural-world-v1.json');
const EXPECTED_IDS = Array.from({ length: 13 }, (_, index) => `NW-${String(index + 1).padStart(2, '0')}`);
const close = (actual, expected, message) => actual.forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) < 1e-9, `${message}: axis ${axis} ${value} vs ${expected[axis]}`));

function document(poses) {
    return { format: 'landscape-review-poses', schemaVersion: 1, id: 'test-poses', conventions: { ...REVIEW_POSE_CONVENTIONS }, poses };
}
const standing = (overrides = {}) => ({ id: 'NW-01', intent: 'test', x: 10, z: 20, eyeHeightMeters: 1.7, headingDegrees: 90, pitchDegrees: -10, fovDegrees: 55, lookDistanceMeters: 100, references: ['R01'], notes: 'test', ...overrides });

test('Review poses: natural-world-v1 validates and pins NW-01..NW-13 once each with the shared camera conventions', async () => {
    const poses = await loadReviewPoses(poseFile);
    assert.equal(poses.id, 'natural-world-v1');
    assert.deepEqual(poses.poses.map(pose => pose.id), EXPECTED_IDS);
    assert.ok(Object.isFrozen(poses) && Object.isFrozen(poses.poses) && poses.poses.every(pose => Object.isFrozen(pose)));
    for (const pose of poses.poses) {
        assert.equal(pose.fovDegrees, 55, `${pose.id} fov`);
        assert.ok(pose.notes.length > 40, `${pose.id} records how it was chosen`);
        if ('camera' in pose) continue;
        assert.equal(pose.lookDistanceMeters, 100, `${pose.id} look distance`);
        assert.ok('eyeHeightMeters' in pose || 'altitudeMeters' in pose, `${pose.id} height form`);
    }
    const overview = poses.poses.find(pose => pose.id === 'NW-13');
    assert.deepEqual(overview.camera, { position: [4400, 3000, -2300], target: [2000, 0, 2000] });
    const eye = poses.poses.filter(pose => 'eyeHeightMeters' in pose).map(pose => pose.id);
    assert.deepEqual(eye, ['NW-01', 'NW-02', 'NW-03', 'NW-04', 'NW-05', 'NW-06', 'NW-07', 'NW-08']);
    assert.ok(poses.poses.filter(pose => 'altitudeMeters' in pose).every(pose => ['NW-09', 'NW-10', 'NW-11', 'NW-12'].includes(pose.id)));
});

test('Review poses: heading 0 looks north (+Z), 90 east (+X), pitch -90 straight down, and the direction stays unit length', () => {
    close(reviewPoseDirection(0, 0), [0, 0, 1], 'heading 0');
    close(reviewPoseDirection(90, 0), [1, 0, 0], 'heading 90');
    close(reviewPoseDirection(180, 0), [0, 0, -1], 'heading 180');
    close(reviewPoseDirection(270, 0), [-1, 0, 0], 'heading 270');
    close(reviewPoseDirection(0, -90), [0, -1, 0], 'pitch -90');
    close(reviewPoseDirection(0, 30), [0, 0.5, Math.sqrt(3) / 2], 'pitch 30');
    close(reviewPoseDirection(45, -45), [0.5, -Math.SQRT1_2, 0.5], 'heading 45 pitch -45');
    for (const [heading, pitch] of [[17, -3], [250, -8], [340, 12]]) assert.ok(Math.abs(Math.hypot(...reviewPoseDirection(heading, pitch)) - 1) < 1e-12);
    assert.throws(() => reviewPoseDirection(360, 0), /headingDegrees/);
    assert.throws(() => reviewPoseDirection(0, 91), /pitchDegrees/);
});

test('Review poses: eye-height poses stand on the sampled ground, altitude and camera poses only record it', async () => {
    const calls = [];
    const sampleGround = (x, z) => { calls.push([x, z]); return 12.5; };
    const resolved = await resolveReviewPose(standing(), sampleGround);
    assert.deepEqual(calls, [[10, 20]]);
    assert.deepEqual(resolved.position, [10, 14.2, 20]);
    const direction = reviewPoseDirection(90, -10);
    close(resolved.target, [10 + 100 * direction[0], 14.2 + 100 * direction[1], 20 + 100 * direction[2]], 'target 100 m ahead');
    assert.deepEqual({ id: resolved.id, fov: resolved.fov, zoom: resolved.zoom, projection: resolved.projection, groundHeight: resolved.groundHeight }, { id: 'NW-01', fov: 55, zoom: 1, projection: 'perspective', groundHeight: 12.5 });
    assert.ok(Object.isFrozen(resolved) && Object.isFrozen(resolved.position));
    const altitude = await resolveReviewPose(standing({ id: 'NW-09', eyeHeightMeters: undefined, altitudeMeters: 1.5, headingDegrees: 0, pitchDegrees: 0 }), async () => -4);
    assert.deepEqual(altitude.position, [10, 1.5, 20]);
    close(altitude.target, [10, 1.5, 120], 'altitude target');
    assert.equal(altitude.groundHeight, -4);
    const outside = await resolveReviewPose(standing({ id: 'NW-11', eyeHeightMeters: undefined, altitudeMeters: 800, x: -400 }), () => null);
    assert.deepEqual(outside.position, [-400, 800, 20]);
    assert.equal(outside.groundHeight, null);
    const camera = await resolveReviewPose({ id: 'NW-13', intent: 'overview', camera: { position: [4400, 3000, -2300], target: [2000, 0, 2000] }, fovDegrees: 55, references: [], notes: 'preset' }, (x, z) => (x === 4400 && z === -2300 ? null : 99));
    assert.deepEqual({ position: camera.position, target: camera.target, fov: camera.fov, groundHeight: camera.groundHeight }, { position: [4400, 3000, -2300], target: [2000, 0, 2000], fov: 55, groundHeight: null });
    await assert.rejects(resolveReviewPose(standing(), () => null), /outside the landscape/);
    await assert.rejects(resolveReviewPose(standing(), () => 'high'), /ground sampler returned/);
    await assert.rejects(resolveReviewPose(standing(), null), /sampleGround/);
});

test('Review poses: the schema rejects duplicates, ranges, mixed forms, unknown keys and convention drift', () => {
    assert.doesNotThrow(() => validateReviewPoses(document([standing(), standing({ id: 'NW-02', eyeHeightMeters: undefined, altitudeMeters: 25 })])));
    assert.throws(() => validateReviewPoses(document([standing(), standing()])), /duplicated/);
    assert.throws(() => validateReviewPoses(document([standing({ headingDegrees: 360 })])), /headingDegrees/);
    assert.throws(() => validateReviewPoses(document([standing({ headingDegrees: -1 })])), /headingDegrees/);
    assert.throws(() => validateReviewPoses(document([standing({ pitchDegrees: 95 })])), /pitchDegrees/);
    assert.throws(() => validateReviewPoses(document([standing({ fovDegrees: 4 })])), /fovDegrees/);
    assert.throws(() => validateReviewPoses(document([standing({ eyeHeightMeters: 0 })])), /eyeHeightMeters/);
    assert.throws(() => validateReviewPoses(document([standing({ lookDistanceMeters: 0 })])), /lookDistanceMeters/);
    assert.throws(() => validateReviewPoses(document([standing({ altitudeMeters: 5 })])), /exactly one of/);
    assert.throws(() => validateReviewPoses(document([standing({ eyeHeightMeters: undefined })])), /exactly one of/);
    assert.throws(() => validateReviewPoses(document([standing({ extra: true })])), /unknown keys: extra/);
    assert.throws(() => validateReviewPoses(document([standing({ id: 'nw-1' })])), /id must match/);
    assert.throws(() => validateReviewPoses(document([standing({ references: ['R01', 'R01'] })])), /repeats a reference/);
    assert.throws(() => validateReviewPoses(document([standing({ notes: '' })])), /notes/);
    assert.throws(() => validateReviewPoses(document([{ id: 'NW-13', intent: 'x', camera: { position: [1, 2, 3], target: [1, 2, 3] }, fovDegrees: 55, references: [], notes: 'same' }])), /coincide/);
    assert.throws(() => validateReviewPoses(document([{ id: 'NW-13', intent: 'x', camera: { position: [1, 2, 3], target: [1, 2, 4] }, x: 1, fovDegrees: 55, references: [], notes: 'x' }])), /unknown keys: x/);
    assert.throws(() => validateReviewPoses({ ...document([standing()]), format: 'poses' }), /format/);
    assert.throws(() => validateReviewPoses({ ...document([standing()]), schemaVersion: 2 }), /schemaVersion/);
    assert.throws(() => validateReviewPoses({ ...document([standing()]), conventions: { ...REVIEW_POSE_CONVENTIONS, pitchDegrees: 'positive looks down' } }), /conventions.pitchDegrees/);
    assert.throws(() => validateReviewPoses({ ...document([standing()]), poses: [] }), /poses/);
});

test('Review poses: the tool is registered with its README', async () => {
    await access(path.join(root, 'tools/landscape_review/README.md'));
    const registry = await readFile(path.join(root, 'PROJECT_TOOLS.md'), 'utf8');
    assert.match(registry, /^\| landscapeReview \| `tools\/landscape_review\/` \|/m);
});
