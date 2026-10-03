// Node unit tests: abrupt distance bands and bounded work in the grass transition lab.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_TRANSITION_DISTANCES,
    GrassDebugV2TransitionSelection,
    TRANSITION_LEVELS
} from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2TransitionSelection.js';

const origin = Object.freeze({ x: 0, z: 0 });
const cell = (x, z = 0) => ({ centerX: x, centerZ: z, minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });

test('Grass transitions: exact thresholds select the farther LOD without a fade', () => {
    const selection = new GrassDebugV2TransitionSelection({ cells: [0, 0.999, 1, 2.999, 3, 5.999, 6, 24.999, 25, 80].map((x) => cell(x)) });
    const result = selection.update(origin, 0);
    assert.deepEqual(DEFAULT_TRANSITION_DISTANCES, [1, 3, 6, 25]);
    assert.deepEqual(TRANSITION_LEVELS, ['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4']);
    assert.deepEqual(Array.from(result.levels), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    assert.deepEqual(Array.from(result.counts), [2, 2, 2, 2, 2]);
    assert.equal(result.changedCount, 10);
    assert.deepEqual(Array.from(result.changedIndices), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('Grass transitions: horizontal radial center distance ignores camera height and orientation', () => {
    const selection = new GrassDebugV2TransitionSelection({ cells: [cell(1.8, 2.4), cell(-3.6, -4.8), cell(0.8, 0.8)] });
    const result = selection.update({ x: 0, y: 200, z: 0, yaw: 0 }, 0);
    assert.deepEqual(Array.from(result.levels), [2, 3, 1]);
    assert.equal(selection.update({ x: 0, y: 1, z: 0, yaw: Math.PI }, 2000).scanned, false);
    assert.equal(selection.getSnapshot().scans, 1);
});

test('Grass transitions: half distance settings force an immediate stationary reclassification', () => {
    const selection = new GrassDebugV2TransitionSelection({ cells: [0.5, 1.5, 3, 12.5, 25].map((x) => cell(x)) });
    selection.update(origin, 0);
    selection.setSettings({ scale: 0.5 });
    const result = selection.update(origin, 1);
    assert.equal(result.scanned, true);
    assert.deepEqual(Array.from(result.levels), [1, 2, 3, 4, 4]);
    assert.equal(result.changedCount, 4);
    assert.deepEqual(selection.getSnapshot().effectiveDistances, [0.5, 1.5, 3, 12.5]);
    selection.setSettings({ distances: [2, 4, 8, 40] });
    assert.deepEqual(Array.from(selection.update(origin, 2).levels), [0, 1, 2, 3, 4]);
});

test('Grass transitions: displacement accumulates, interval caps scans, and result buffers are reused', () => {
    const selection = new GrassDebugV2TransitionSelection({ cells: [cell(1.1), cell(8)] });
    const first = selection.update(origin, 0);
    const arrays = [first.levels, first.changedIndices, first.counts];
    assert.equal(selection.update({ x: 0.1, z: 0 }, 1000).scanned, false);
    const moved = selection.update({ x: 0.25, z: 0 }, 1001);
    assert.equal(moved.scanned, true);
    assert.equal(moved.changedCount, 1);
    assert.equal(moved.changedIndices[0], 0);
    assert.deepEqual(Array.from(moved.levels), [0, 3]);
    assert.equal(selection.update({ x: 0.6, z: 0 }, 1050).scanned, false);
    const next = selection.update({ x: 0.6, z: 0 }, 1101);
    assert.equal(next.scanned, true);
    assert.equal(next.changedCount, 0);
    assert.equal(first, next);
    assert.equal(next.levels, arrays[0]);
    assert.equal(next.changedIndices, arrays[1]);
    assert.equal(next.counts, arrays[2]);
    const snapshot = selection.getSnapshot();
    assert.equal(snapshot.scans, 3);
    assert.equal(snapshot.visitedCells, 6);
    assert.equal(snapshot.skippedStationary, 1);
    assert.equal(snapshot.skippedInterval, 1);
});

test('Grass transitions: stationary updates never scan, and explicit force bypasses both gates', () => {
    const selection = new GrassDebugV2TransitionSelection({ cells: [cell(1.1)], movementThreshold: 0 });
    selection.update(origin, 0);
    for (let i = 0; i < 500; i++) assert.equal(selection.update(origin, i * 1000).scanned, false);
    assert.equal(selection.getSnapshot().visitedCells, 1);
    const forced = selection.update({ x: 0.2, z: 0 }, 1, { force: true });
    assert.equal(forced.scanned, true);
    assert.deepEqual(Array.from(forced.levels), [0]);
    assert.equal(selection.update({ x: 0.21, z: 0 }, 2).scanned, false);
    assert.equal(selection.update({ x: 0.21, z: 0 }, 2, { force: true }).scanned, true);
});

test('Grass transitions: fixed centers and snapshots are isolated from caller input mutation', () => {
    const cells = [cell(4)];
    const distances = [1, 3, 6, 25];
    const selection = new GrassDebugV2TransitionSelection({ cells, distances });
    cells[0].centerX = 100;
    distances[0] = 10;
    assert.deepEqual(Array.from(selection.update(origin, 0).levels), [2]);
    const snapshot = selection.getSnapshot();
    snapshot.distances[0] = 20;
    snapshot.counts[2] = 100;
    assert.equal(selection.getSnapshot().distances[0], 1);
    assert.equal(selection.getSnapshot().counts[2], 1);
    selection.resetMetrics();
    assert.equal(selection.getSnapshot().scans, 0);
    assert.equal(selection.getSnapshot().totalCpuMs, 0);
    assert.equal(selection.update(origin, 1000).scanned, false);
});

test('Grass transitions: invalid settings fail before altering the working configuration', () => {
    for (const options of [{ distances: [1, 2] }, { distances: [1, 3, 3, 25] }, { scale: 0 }, { intervalMs: -1 }, { movementThreshold: NaN }, { sideLeafDistance: -1 }]) {
        assert.throws(() => new GrassDebugV2TransitionSelection({ cells: [], ...options }), RangeError);
    }
    assert.throws(() => new GrassDebugV2TransitionSelection({ cells: [cell(Infinity)] }), RangeError);
    assert.throws(() => new GrassDebugV2TransitionSelection({ cells: [{ ...cell(0), minX: 1 }] }), RangeError);
    const selection = new GrassDebugV2TransitionSelection({ cells: [cell(2)] });
    assert.throws(() => selection.setSettings({ scale: -1 }), RangeError);
    assert.equal(selection.getSnapshot().scale, 1);
    assert.throws(() => selection.update({ x: NaN, z: 0 }, 0), RangeError);
    assert.deepEqual(Array.from(selection.update(origin, 0).levels), [1]);
});

test('Grass transitions: side leaves keep the exact cutoff and full/half presets do not scale it', () => {
    const cells = [24, 25, 35, 35.01, 40].map(x => ({ ...cell(x), edge: 1 }));
    cells.push(cell(30));
    const selection = new GrassDebugV2TransitionSelection({ cells });
    assert.deepEqual([...selection.update(origin, 0).sideLeaves], [0, 1, 1, 0, 0, 0]);
    selection.setSettings({ scale: .5 });
    assert.deepEqual([...selection.update(origin, 1).sideLeaves], [1, 1, 1, 0, 0, 0]);
    assert.equal(selection.getSnapshot().sideLeafDistance, 35);
    selection.setSettings({ sideLeafDistance: 0 });
    const hidden = selection.update(origin, 2);
    assert.equal(hidden.changedCount, 0);
    assert.equal(hidden.sideLeavesChangedCount, 3);
    assert.deepEqual([...hidden.sideLeaves], [0, 0, 0, 0, 0, 0]);
});

test('Grass transitions: crossing only the side-leaf cutoff updates the cached visibility', () => {
    const selection = new GrassDebugV2TransitionSelection({ cells: [{ ...cell(35.1), edge: 2 }], movementThreshold: .25 });
    const mask = selection.update(origin, 0).sideLeaves;
    assert.deepEqual([...mask], [0]);
    assert.equal(selection.update({ x: .2, z: 0 }, 100).scanned, false);
    const crossed = selection.update({ x: .3, z: 0 }, 101);
    assert.equal(crossed.changedCount, 0);
    assert.equal(crossed.sideLeavesChangedCount, 1);
    assert.equal(crossed.sideLeaves, mask);
    assert.deepEqual([...mask], [1]);
    const stationary = selection.update({ x: .3, z: 0 }, 1000);
    assert.equal(stationary.scanned, false);
    assert.equal(stationary.sideLeavesChangedCount, 0);
});
