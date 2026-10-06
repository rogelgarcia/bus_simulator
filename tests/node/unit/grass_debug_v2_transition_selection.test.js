// Node unit tests: abrupt distance bands and bounded work in the grass transition lab.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_TRANSITION_DISTANCES,
    GrassDebugV2TransitionSelection,
    TRANSITION_LEVELS
} from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2TransitionSelection.js';

const abrupt = options => new GrassDebugV2TransitionSelection({ distances: [1, 2, 5, 18, 32], transitionFraction: 0, movementThreshold: .25, intervalMs: 100, ...options });

const origin = Object.freeze({ x: 0, z: 0 });
const cell = (x, z = 0) => ({ centerX: x, centerZ: z, minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });

test('Grass transitions: exact thresholds select the farther LOD without a fade', () => {
    const selection = abrupt({ distances: DEFAULT_TRANSITION_DISTANCES, cells: [0, .599, .6, .799, .8, .999, 1, 15.999, 16, 31.999, 32, 80].map((x) => cell(x)) });
    const result = selection.update(origin, 0);
    assert.deepEqual(DEFAULT_TRANSITION_DISTANCES, [.6, .8, 1, 16, 32]);
    assert.deepEqual(TRANSITION_LEVELS, ['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5']);
    assert.deepEqual(Array.from(result.levels), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    assert.deepEqual(Array.from(result.counts), [2, 2, 2, 2, 2, 2]);
    assert.equal(result.changedCount, 12);
    assert.deepEqual(Array.from(result.changedIndices), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test('Grass transitions: horizontal radial center distance ignores camera height and orientation', () => {
    const selection = abrupt({ cells: [cell(1.8, 2.4), cell(-3.6, -4.8), cell(0.8, 0.8)] });
    const result = selection.update({ x: 0, y: 200, z: 0, yaw: 0 }, 0);
    assert.deepEqual(Array.from(result.levels), [2, 3, 1]);
    assert.equal(selection.update({ x: 0, y: 1, z: 0, yaw: Math.PI }, 2000).scanned, false);
    assert.equal(selection.getSnapshot().scans, 1);
});

test('Grass transitions: half distance settings force an immediate stationary reclassification', () => {
    const selection = abrupt({ cells: [0.5, 1, 2.5, 9, 25].map((x) => cell(x)) });
    selection.update(origin, 0);
    selection.setSettings({ scale: 0.5 });
    const result = selection.update(origin, 1);
    assert.equal(result.scanned, true);
    assert.deepEqual(Array.from(result.levels), [1, 2, 3, 4, 5]);
    assert.equal(result.changedCount, 5);
    assert.deepEqual(selection.getSnapshot().effectiveDistances, [0.5, 1, 2.5, 9, 16]);
    selection.setSettings({ distances: [2, 4, 8, 40, 80] });
    assert.deepEqual(Array.from(selection.update(origin, 2).levels), [0, 1, 2, 3, 4]);
});

test('Grass transitions: displacement accumulates, interval caps scans, and result buffers are reused', () => {
    const selection = abrupt({ cells: [cell(1.1), cell(8)] });
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
    const selection = abrupt({ cells: [cell(1.1)], movementThreshold: 0 });
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
    const distances = [1, 2, 5, 18, 32];
    const selection = abrupt({ cells, distances });
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
        assert.throws(() => abrupt({ cells: [], ...options }), RangeError);
    }
    assert.throws(() => abrupt({ cells: [cell(Infinity)] }), RangeError);
    assert.throws(() => abrupt({ cells: [{ ...cell(0), minX: 1 }] }), RangeError);
    const selection = abrupt({ cells: [cell(2)] });
    assert.throws(() => selection.setSettings({ scale: -1 }), RangeError);
    assert.equal(selection.getSnapshot().scale, 1);
    assert.throws(() => selection.update({ x: NaN, z: 0 }, 0), RangeError);
    assert.deepEqual(Array.from(selection.update(origin, 0).levels), [2]);
});

test('Grass transitions: side leaves keep the exact cutoff and full/half presets do not scale it', () => {
    const cells = [17, 18, 35, 35.01, 40].map(x => ({ ...cell(x), edge: 1 }));
    cells.push(cell(30));
    const selection = abrupt({ cells });
    assert.deepEqual([...selection.update(origin, 0).sideLeaves], [0, 0, 1, 0, 0, 0]);
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
    const selection = abrupt({ cells: [{ ...cell(35.1), edge: 2 }], movementThreshold: .25 });
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

test('Grass transitions: default half-band starts at 8.5 m, scales with ranges, and uses faster gates', () => {
    const selection = new GrassDebugV2TransitionSelection({ cells: [cell(0)] });
    const state = selection.getSnapshot();
    assert.deepEqual(state.transitionBands.map(b => [b.start,b.end]), [[.3,.6],[.7,.8],[.9,1],[8.5,16],[24,32]]);
    assert.equal(state.movementThreshold,.2); assert.equal(state.intervalMs,50);
    selection.update(origin,0);
    assert.equal(selection.update({x:.19,z:0},1000).scanned,false);
    assert.equal(selection.update({x:.2,z:0},20).scanned,false);
    assert.equal(selection.update({x:.2,z:0},50).scanned,true);
    selection.setSettings({scale:.5});
    assert.deepEqual(selection.getSnapshot().transitionBands[3],{from:3,to:4,start:4.25,end:8});
    selection.setSettings({transitionFraction:0});
    assert.equal(selection.getSnapshot().transitionBands[3].start,8);
    for(const transitionFraction of [-.1,1.1,NaN])assert.throws(()=>selection.setSettings({transitionFraction}),RangeError);
});

test('Grass transitions: spatial mixture is reproducible, bounded and independent of cell ordering', () => {
    const cells = Array.from({length:2048},(_,i)=>{const a=i*Math.PI*2/2048;return cell(12.25*Math.cos(a),12.25*Math.sin(a));});
    const selection = new GrassDebugV2TransitionSelection({cells, transitionMode:'patches'});
    const before = [...selection.update(origin,0).levels];
    assert(before.every(lod=>lod===3||lod===4));
    const fraction=before.filter(lod=>lod===4).length/before.length;
    assert(Math.abs(fraction-.5)<.04, 'Mid-band should contain approximately half of each LOD: '+fraction);
    const reversed = new GrassDebugV2TransitionSelection({cells:cells.slice().reverse(), transitionMode:'patches'});
    assert.deepEqual([...reversed.update(origin,0).levels].reverse(),before);
    selection.update({x:2,z:0},100);
    assert.deepEqual([...selection.update(origin,200).levels],before);
    const one = new GrassDebugV2TransitionSelection({cells:[cell(0)]});
    assert.equal(one.update({x:8.5,z:0},0).levels[0],3);
    assert.equal(one.update({x:16,z:0},100).levels[0],4);
});

test('Grass transitions: blend candidates include both sides and retain the dominant LOD', () => {
    const selection = new GrassDebugV2TransitionSelection({ cells: [0, .9, 8.5, 12.25, 16, 20].map(x => cell(x)) });
    const result = selection.update(origin, 0), masks = [...result.renderMasks];
    assert.equal(selection.getSnapshot().transitionMethod, 'complementary-screen-door');
    assert.deepEqual(masks.slice(2), [24, 24, 24, 16]);
    masks.forEach((mask, i) => assert(mask & (1 << result.levels[i])));
    selection.setSettings({ transitionMode: 'patches' });
    const patches = selection.update(origin, 1);
    patches.renderMasks.forEach((mask, i) => assert.equal(mask, 1 << patches.levels[i]));
    selection.setSettings({ transitionMode: 'blend', transitionFraction: 0 });
    const abrupt = selection.update(origin, 2);
    abrupt.renderMasks.forEach((mask, i) => assert.equal(mask, 1 << abrupt.levels[i]));
    assert.throws(() => selection.setSettings({ transitionMode: 'unknown' }), RangeError);
});

test('Grass transitions: cached support covers all contributing levels between scans', () => {
    const cells = Array.from({ length: 961 }, (_, i) => cell(i / 20));
    const selection = new GrassDebugV2TransitionSelection({ cells });
    const masks = [...selection.update(origin, 0).renderMasks], state = selection.getSnapshot();
    assert.equal(state.blendGuardMeters, 1.45);
    assert.equal(state.geometrySupportMeters, 1.4);
    for (const displacement of [-1.45, -.2, 0, .2, 1.45]) for (const vertexOffset of [-1.4, 0, 1.4]) {
        cells.forEach((c, i) => {
            const distance = Math.abs(c.centerX + vertexOffset - displacement);
            for (let level = 0; level < 6; level++) {
                const starts = level ? state.transitionBands[level - 1].start : -Infinity;
                const ends = level < 5 ? state.transitionBands[level].end : Infinity;
                if (distance > starts && distance < ends) assert(masks[i] & (1 << level), `${i}, ${displacement}, ${level}`);
            }
        });
    }
});

test('Grass transitions: teleports refresh before the interval can expose missing candidates', () => {
    const selection = new GrassDebugV2TransitionSelection({ cells: [cell(0), cell(20)] });
    const masks = selection.update(origin, 0).renderMasks;
    assert.equal(selection.update({ x: .4, z: 0 }, 10).scanned, false);
    const jump = selection.update({ x: 20, z: 0 }, 11);
    assert.equal(jump.scanned, true);
    assert.equal(jump.renderMasks, masks);
    assert.equal(jump.renderMasks[0], 16);
    assert(jump.renderMasks[1] & 1);
    assert.equal(jump.renderChangedCount, 2);
});

test('Grass transitions: direct-canopy comparison bypasses LOD4 with identical complementary bands', () => {
    const selection = new GrassDebugV2TransitionSelection({ cells: [7, 12, 20, 40].map(x => ({ ...cell(x), edge: 1 })) });
    selection.update(origin, 0);
    selection.setSettings({ bridgeEnabled: false });
    const result = selection.update(origin, 1), state = selection.getSnapshot();
    assert.deepEqual([...result.levels], [3, 3, 5, 5]);
    assert.deepEqual([...result.renderMasks], [40, 40, 32, 32]);
    assert.deepEqual([...result.sideLeaves], [1, 1, 1, 0]);
    assert.equal(state.transitionBands[3].start, state.transitionBands[4].start);
    assert.equal(state.transitionBands[3].end, state.transitionBands[4].end);
    selection.setSettings({ bridgeEnabled: true });
    assert.equal(selection.update(origin, 2).levels[2], 4);
    assert.throws(() => selection.setSettings({ bridgeEnabled: 1 }), RangeError);
});
