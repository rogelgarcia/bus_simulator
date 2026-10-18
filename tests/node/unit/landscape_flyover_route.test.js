// Verifies the landscape flyover route schema, the smooth timed path, the caption intervals, the plan's ground checks and the tool registration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { FLYOVER_ROUTE_CONVENTIONS, captionAlpha, centripetalCatmullRom, createFlyoverPath, flyoverCaptionIntervals, loadFlyoverRoute, planFlyover, validateFlyoverRoute, viewAngles } from '../../../tools/landscape_flyover/FlyoverRoute.mjs';
import { flyoverMapWindow, renderFlyoverBaseMap } from '../../../tools/landscape_flyover/FlyoverMap.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const routeFile = path.join(root, 'tools/landscape_flyover/routes/coastal-v3-features-v1.json');
const feature = id => ({ id, title: `Title ${id}`, caption: `Caption ${id}`, mapHint: `hint ${id}` });
const key = (position, target, speed, featureId) => ({ position, target, speed, feature: featureId });
function document(overrides = {}) {
    return { format: 'landscape-flyover-route', schemaVersion: 1, id: 'test-route', landscapeId: 'test-landscape', description: 'test', conventions: [...FLYOVER_ROUTE_CONVENTIONS],
        camera: { fovDegrees: 50, minClearanceMeters: 10, maxTurnDegreesPerSecond: 20, captionFadeSeconds: 0.5 }, features: [feature('a'), feature('b')],
        keys: [key([0, 50, 0], [0, 0, 500], 10, 'a'), key([0, 60, 300], [100, 0, 800], 40, 'a'), key([200, 70, 700], [600, 0, 1000], 40, 'b'), key([500, 80, 900], [1500, 0, 1000], 5, 'b')], ...overrides };
}

test('Flyover route: the shipped coastal-v3 feature route validates, shows every feature in flight order and stays within its limits on flat ground', async () => {
    const route = await loadFlyoverRoute(routeFile);
    assert.equal(route.id, 'coastal-v3-features-v1');
    assert.equal(route.landscapeId, 'coastal-city-v3');
    assert.ok(Object.isFrozen(route) && Object.isFrozen(route.keys) && route.keys.every(entry => Object.isFrozen(entry)));
    const path = createFlyoverPath(route), intervals = flyoverCaptionIntervals(route, path.keyTimes);
    assert.deepEqual(intervals.map(interval => interval.feature), route.features.map(entry => entry.id), 'each feature is captioned once, in the order it is flown');
    assert.deepEqual(intervals.map(interval => interval.index), route.features.map((_, index) => index));
    const plan = await planFlyover(route, { fps: 10, seaLevel: 0, sampleGround: () => null });
    assert.deepEqual(plan.violations, []);
    assert.ok(plan.summary.maxTurn.degreesPerSecond <= route.camera.maxTurnDegreesPerSecond);
});

test('Flyover route: the schema rejects unknown features, unused features, near-duplicate keys, edited conventions and extra fields', () => {
    assert.throws(() => validateFlyoverRoute(document({ keys: [key([0, 50, 0], [0, 0, 500], 10, 'a'), key([0, 60, 300], [100, 0, 800], 10, 'zzz')] })), /feature must be null or a feature id/);
    assert.throws(() => validateFlyoverRoute(document({ keys: [key([0, 50, 0], [0, 0, 500], 10, 'a'), key([0, 60, 300], [100, 0, 800], 10, 'a')] })), /features b are never shown/);
    assert.throws(() => validateFlyoverRoute(document({ keys: [key([0, 50, 0], [0, 0, 500], 10, 'a'), key([0.5, 50, 0], [100, 0, 800], 10, 'b')] })), /less than 1 m apart/);
    assert.throws(() => validateFlyoverRoute(document({ conventions: ['changed'] })), /conventions must repeat/);
    assert.throws(() => validateFlyoverRoute({ ...document(), extra: 1 }), /unexpected extra/);
    assert.throws(() => validateFlyoverRoute(document({ keys: [key([0, 50, 0], [0, 50, 0.5], 10, 'a'), key([0, 60, 300], [100, 0, 800], 10, 'b')] })), /looks at its own position/);
    assert.throws(() => validateFlyoverRoute(document({ keys: [key([0, 50, 0], [0, 0, 500], 0, 'a'), key([0, 60, 300], [100, 0, 800], 10, 'b')] })), /speed must be a number/);
});

test('Flyover route: centripetal Catmull-Rom interpolates its control points and degenerates to the point when they coincide', () => {
    const p0 = [0, 0, 0], p1 = [10, 0, 0], p2 = [20, 5, 3], p3 = [40, 5, 3];
    assert.deepEqual(centripetalCatmullRom(p0, p1, p2, p3, 0).map(value => +value.toFixed(9)), p1);
    assert.deepEqual(centripetalCatmullRom(p0, p1, p2, p3, 1).map(value => +value.toFixed(9)), p2);
    assert.deepEqual(centripetalCatmullRom(p0, p1, p1, p3, 0.4), p1);
});

test('Flyover route: the timed path passes the keys at their times and speeds and never jumps or jerks between frames', () => {
    const route = validateFlyoverRoute(document()), path = createFlyoverPath(route), fps = 30;
    assert.ok(path.keyTimes.every((time, index) => index === 0 || time > path.keyTimes[index - 1]));
    route.keys.forEach((entry, index) => {
        const at = path.sample(path.keyTimes[index]);
        at.position.forEach((value, axis) => assert.ok(Math.abs(value - entry.position[axis]) < 0.05, `key ${index} position axis ${axis}`));
        at.target.forEach((value, axis) => assert.ok(Math.abs(value - entry.target[axis]) < 0.2, `key ${index} target axis ${axis}`));
        assert.ok(Math.abs(at.speed - entry.speed) < 0.05, `key ${index} speed ${at.speed}`);
    });
    let previous = path.sample(0), previousStep = null, maxAcceleration = 0;
    for (let frame = 1; frame <= Math.floor(path.duration * fps); frame++) {
        const at = path.sample(frame / fps), step = Math.hypot(...at.position.map((value, axis) => value - previous.position[axis]));
        assert.ok(step <= Math.max(at.speed, previous.speed) / fps * 1.02 + 1e-6, `frame ${frame} moves ${step} m at ${at.speed} m/s`);
        if (previousStep !== null) maxAcceleration = Math.max(maxAcceleration, Math.abs(step - previousStep) * fps * fps);
        previous = at; previousStep = step;
    }
    assert.ok(maxAcceleration < 20, `the pace eases between keys (max ${maxAcceleration.toFixed(2)} m/s²)`);
    assert.ok(Math.abs(path.sample(path.duration).distance - path.length) < 1e-6);
});

test('Flyover route: captions merge consecutive keys of one feature and fade in and out', () => {
    const route = validateFlyoverRoute(document()), times = [0, 10, 20, 30];
    const intervals = flyoverCaptionIntervals(route, times);
    assert.deepEqual(intervals, [{ feature: 'a', index: 0, startSeconds: 0, endSeconds: 20 }, { feature: 'b', index: 1, startSeconds: 20, endSeconds: 30 }]);
    assert.equal(captionAlpha(intervals[0], 0, 0.5), 0);
    assert.equal(captionAlpha(intervals[0], 10, 0.5), 1);
    assert.equal(captionAlpha(intervals[0], 20, 0.5), 0);
    assert.ok(captionAlpha(intervals[0], 0.25, 0.5) > 0 && captionAlpha(intervals[0], 0.25, 0.5) < 1);
});

test('Flyover route: the plan measures clearance over max(ground, sea level) and reports clearance and turn-rate violations', async () => {
    const route = validateFlyoverRoute(document());
    const flat = await planFlyover(route, { fps: 10, seaLevel: 0, sampleGround: () => 5 });
    assert.deepEqual(flat.violations, []);
    assert.ok(Math.abs(flat.summary.minClearance.meters - 45) < 1e-6, `clearance ${flat.summary.minClearance.meters}`);
    assert.equal(flat.frames[0].overWater, false);
    assert.ok(Math.abs(flat.frames[0].heightAboveSurface - 45) < 1e-6);
    const sea = await planFlyover(route, { fps: 10, seaLevel: 0, sampleGround: () => -20 });
    assert.equal(sea.frames[0].overWater, true);
    assert.ok(Math.abs(sea.frames[0].heightAboveSurface - 50) < 1e-6, 'over water the height is above the sea surface');
    const hill = await planFlyover(route, { fps: 10, seaLevel: 0, sampleGround: (x, z) => (Math.hypot(x - 200, z - 700) < 30 ? 65 : 0) });
    assert.match(hill.violations.join('\n'), /clearance .* is below 10 m/);
    const spin = validateFlyoverRoute(document({ camera: { ...document().camera, maxTurnDegreesPerSecond: 1 } }));
    assert.match((await planFlyover(spin, { fps: 10, seaLevel: 0, sampleGround: () => 0 })).violations.join('\n'), /turn rate .* is above 1 deg\/s/);
    assert.deepEqual(viewAngles([0, 0, 0], [10, 0, 0]), { headingDegrees: 90, pitchDegrees: 0 });
});

test('Flyover map: the window is square around the track and the base map colours water by depth and land by cover', () => {
    const window = flyoverMapWindow([{ position: [0, 0, 0] }, { position: [6000, 0, 1000] }], { marginFraction: 0, minimumMeters: 100 });
    assert.deepEqual(window, { minX: 0, maxX: 6000, minZ: -2500, maxZ: 3500 });
    const heights = new Float32Array([10, 10, -20, -20]), landCover = new Uint8Array([3, 3, 0, 0]);
    const source = { manifest: {}, bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, chunks: [{ descriptor: { columns: 2, rows: 2, bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 } }, heights, landCover }] };
    const map = renderFlyoverBaseMap({ window: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, size: 8, sources: [source], seaLevel: 0, extent: { minX: -10, maxX: 110, minZ: -10, maxZ: 110 } });
    const pixel = (column, row) => [...map.data.slice((row * 8 + column) * 3, (row * 8 + column) * 3 + 3)];
    const [nr, ng, nb] = pixel(4, 1), [sr, sg, sb] = pixel(4, 6);
    assert.ok(ng > nb && ng > nr * 0.9, `north half is forest green: ${[nr, ng, nb]}`);
    assert.ok(sb > sr, `south half is water blue: ${[sr, sg, sb]}`);
});

test('Flyover tool: README exists and the tool is registered in PROJECT_TOOLS.md', async () => {
    await access(path.join(root, 'tools/landscape_flyover/README.md'));
    const registry = await readFile(path.join(root, 'PROJECT_TOOLS.md'), 'utf8');
    assert.match(registry, /^\| landscapeFlyover \| `tools\/landscape_flyover\/` \|/m);
});
