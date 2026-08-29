// Node unit tests: BF2 stretch-band and push/pull footprint edits.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createFootprintPlan,
    findValidStretchCuts,
    inspectPushPull,
    inspectStretchHandles,
    pushPullFootprint,
    stretchFootprint
} from '../../../src/app/buildings/footprint_edits/BuildingFootprintEdits.js';

const rectangle = () => createFootprintPlan([
    { x: -10, z: 5 },
    { x: 10, z: 5 },
    { x: 10, z: -5 },
    { x: -10, z: -5 }
]);

function runLength(plan, runId) {
    const index = plan.runIds.indexOf(runId);
    const a = plan.points[index];
    const b = plan.points[(index + 1) % plan.points.length];
    return Math.hypot(b.x - a.x, b.z - a.z);
}

function cornerAngles(plan) {
    const result = [];
    for (let i = 0; i < plan.points.length; i++) {
        const prev = plan.points[(i - 1 + plan.points.length) % plan.points.length];
        const point = plan.points[i];
        const next = plan.points[(i + 1) % plan.points.length];
        const ax = prev.x - point.x;
        const az = prev.z - point.z;
        const bx = next.x - point.x;
        const bz = next.z - point.z;
        const denom = Math.hypot(ax, az) * Math.hypot(bx, bz);
        result.push(Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / denom))));
    }
    return result;
}

function assertAnglesEqual(actual, expected, message) {
    assert.equal(actual.length, expected.length, message);
    for (let i = 0; i < actual.length; i++) {
        assert.ok(Math.abs(actual[i] - expected[i]) < 1e-8, `${message} at corner ${i}`);
    }
}

test('BuildingFootprintEdits: perpendicular cut hits the parallel opposite wall', () => {
    const cuts = findValidStretchCuts(rectangle(), 'A', 'end');
    assert.equal(cuts.length, 1);
    assert.deepEqual(cuts[0].crossedRunIds, ['C', 'A']);
    assert.equal(cuts[0].segments.length, 1);
});

test('BuildingFootprintEdits: E/H multi-wall cut stretches every parallel arm', () => {
    const plan = createFootprintPlan([
        { x: -6, z: 6 }, { x: 6, z: 6 }, { x: 6, z: 4 }, { x: -2, z: 4 },
        { x: -2, z: 1 }, { x: 6, z: 1 }, { x: 6, z: -1 }, { x: -2, z: -1 },
        { x: -2, z: -4 }, { x: 6, z: -4 }, { x: 6, z: -6 }, { x: -6, z: -6 }
    ]);
    const cuts = findValidStretchCuts(plan, 'A', 'end');
    assert.equal(cuts.length, 1);
    assert.equal(cuts[0].segments.length, 3);
    assert.deepEqual(cuts[0].crossedRunIds, ['K', 'I', 'G', 'E', 'C', 'A']);

    const stretched = stretchFootprint(plan, { faceId: 'A', end: 'end', delta: 2 });
    for (const id of cuts[0].crossedRunIds) assert.ok(Math.abs(runLength(stretched.footprint, id) - (runLength(plan, id) + 2)) < 1e-8);
});

test('BuildingFootprintEdits: shear-producing diagonal opposite wall disables the handle', () => {
    const trapezoid = createFootprintPlan([
        { x: -8, z: 5 },
        { x: 8, z: 5 },
        { x: 5, z: -5 },
        { x: -5, z: -5 }
    ]);
    const handles = inspectStretchHandles(trapezoid, 'A');
    assert.equal(handles.end.valid, false);
    assert.equal(handles.end.reason, 'crossed_wall_not_parallel');
    assert.equal(findValidStretchCuts(trapezoid, 'A', 'end').length, 0);
});

test('BuildingFootprintEdits: a grazed opposite vertex is epsilon-nudged deterministically', () => {
    const withGrazingVertex = createFootprintPlan([
        { x: -100, z: 5 },
        { x: 100, z: 5 },
        { x: 100, z: -5 },
        { x: 99.99, z: -5 },
        { x: -100, z: -5 }
    ]);
    const cuts = findValidStretchCuts(withGrazingVertex, 'A', 'end');
    assert.equal(cuts.length, 1);
    assert.ok(cuts[0].origin.x < 99.99);
});

test('BuildingFootprintEdits: a concave re-entry that meets an angled wall is rejected', () => {
    const concave = createFootprintPlan([
        { x: -8, z: 6 }, { x: 1, z: 6 }, { x: 8, z: 0 },
        { x: -1, z: -6 }, { x: -8, z: -6 }, { x: -2, z: 0 }
    ]);
    const handles = inspectStretchHandles(concave, 'A');
    assert.equal(handles.end.valid, false);
    assert.equal(handles.end.reason, 'crossed_wall_not_parallel');
});

test('BuildingFootprintEdits: stretch preserves angles and stable run ids', () => {
    const plan = rectangle();
    const beforeAngles = cornerAngles(plan);
    const result = stretchFootprint(plan, { faceId: 'A', end: 'end', delta: 4 });
    assert.equal(result.appliedDelta, 4);
    assert.deepEqual(result.footprint.runIds, plan.runIds);
    assert.equal(runLength(result.footprint, 'A'), 24);
    assert.equal(runLength(result.footprint, 'C'), 24);
    assert.equal(runLength(result.footprint, 'B'), 10);
    assertAnglesEqual(cornerAngles(result.footprint), beforeAngles, 'stretch must preserve every corner angle');
});

test('BuildingFootprintEdits: stretch shrink clamps to every affected facade minimum', () => {
    const result = stretchFootprint(rectangle(), {
        faceId: 'A',
        end: 'end',
        delta: -50,
        minLengthByRunId: { A: 7, C: 8 }
    });
    assert.equal(result.clamped, true);
    assert.ok(Math.abs(result.appliedDelta + 12) < 1e-8);
    assert.equal(runLength(result.footprint, 'C'), 8);
    assert.ok(result.warnings.some((warning) => warning.includes('still solves')));
});

test('BuildingFootprintEdits: connected push/pull re-intersects neighbors and preserves angles', () => {
    const plan = rectangle();
    const beforeAngles = cornerAngles(plan);
    const result = pushPullFootprint(plan, { faceId: 'A', delta: 3 });
    assert.deepEqual(result.footprint.runIds, plan.runIds);
    assert.equal(runLength(result.footprint, 'A'), 20);
    assert.equal(runLength(result.footprint, 'B'), 13);
    assert.equal(runLength(result.footprint, 'D'), 13);
    assertAnglesEqual(cornerAngles(result.footprint), beforeAngles, 'push/pull must preserve every corner angle');
});

test('BuildingFootprintEdits: parallel neighboring wall disables connected push/pull', () => {
    const splitCorner = createFootprintPlan([
        { x: -10, z: 5 }, { x: 0, z: 5 }, { x: 10, z: 5 },
        { x: 10, z: -5 }, { x: -10, z: -5 }
    ]);
    const validity = inspectPushPull(splitCorner, 'B');
    assert.equal(validity.valid, false);
    assert.equal(validity.reason, 'parallel_neighbor');
});

test('BuildingFootprintEdits: detached push spawns connectors and keeps parent/other ids stable', () => {
    const plan = rectangle();
    const result = pushPullFootprint(plan, { faceId: 'A', delta: 2, detached: true });
    assert.deepEqual(result.connectorRunIds, ['E', 'F']);
    assert.deepEqual(result.footprint.runIds, ['E', 'A', 'F', 'B', 'C', 'D']);
    assert.equal(runLength(result.footprint, 'A'), runLength(plan, 'A'));
    assert.equal(runLength(result.footprint, 'B'), runLength(plan, 'B'));
    assert.equal(runLength(result.footprint, 'C'), runLength(plan, 'C'));
    assert.equal(runLength(result.footprint, 'D'), runLength(plan, 'D'));
    assert.equal(runLength(result.footprint, 'E'), 2);
    assert.equal(runLength(result.footprint, 'F'), 2);
});
