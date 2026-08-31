// Verifies generation fences protect the latest frame, fall back safely, and clean up exactly once.
// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';
import { StaticSunDepthFenceTracker } from '../../../src/graphics/illumination/static_sun_depth/StaticSunDepthFenceTracker.js';

function createGl() {
    let nextId = 0;
    const state = {
        deleted: [],
        finishCount: 0,
        flushCount: 0,
        statuses: []
    };
    const gl = {
        SYNC_GPU_COMMANDS_COMPLETE: 1,
        ALREADY_SIGNALED: 2,
        CONDITION_SATISFIED: 3,
        WAIT_FAILED: 4,
        TIMEOUT_EXPIRED: 5,
        fenceSync() {
            return { id: ++nextId };
        },
        flush() {
            state.flushCount += 1;
        },
        deleteSync(fence) {
            state.deleted.push(fence.id);
        },
        clientWaitSync() {
            return state.statuses.shift() ?? gl.TIMEOUT_EXPIRED;
        },
        finish() {
            state.finishCount += 1;
        }
    };
    return { gl, state };
}

test('latest generation fence supersedes the prior frame and signals once', async () => {
    const { gl, state } = createGl();
    const tracker = new StaticSunDepthFenceTracker({
        getContext: () => gl,
        schedule: (callback) => queueMicrotask(callback)
    });
    assert.equal(tracker.record(7), true);
    assert.equal(tracker.record(7), true);
    assert.deepEqual(state.deleted, [1]);
    assert.deepEqual(tracker.getSnapshot(), { count: 1, generations: [7] });

    state.statuses.push(gl.TIMEOUT_EXPIRED, gl.CONDITION_SATISFIED);
    await tracker.wait(7);
    assert.deepEqual(state.deleted, [1, 2]);
    assert.equal(state.finishCount, 0);
    assert.deepEqual(tracker.getSnapshot(), { count: 0, generations: [] });
});

test('failed fence replacement discards stale coverage and forces finish', () => {
    const { gl, state } = createGl();
    const errors = [];
    const tracker = new StaticSunDepthFenceTracker({
        getContext: () => gl,
        onError: (error) => errors.push(String(error?.message ?? error))
    });
    assert.equal(tracker.record(3), true);
    gl.fenceSync = () => null;
    assert.equal(tracker.record(3), false);
    assert.deepEqual(state.deleted, [1]);
    assert.equal(tracker.wait(3), undefined);
    assert.equal(state.finishCount, 1);
    assert.match(errors[0], /returned null/);
});

test('WAIT_FAILED uses finish while timeout rejects and retains the resource fence', async () => {
    {
        const { gl, state } = createGl();
        const tracker = new StaticSunDepthFenceTracker({ getContext: () => gl });
        tracker.record(1);
        state.statuses.push(gl.WAIT_FAILED);
        await tracker.wait(1);
        assert.equal(state.finishCount, 1);
        assert.deepEqual(state.deleted, [1]);
    }

    {
        const { gl, state } = createGl();
        let now = 0;
        const tracker = new StaticSunDepthFenceTracker({
            getContext: () => gl,
            now: () => now++ === 0 ? 0 : 2,
            timeoutMs: 1,
            schedule: (callback) => queueMicrotask(callback)
        });
        tracker.record(9);
        state.statuses.push(gl.TIMEOUT_EXPIRED);
        await assert.rejects(tracker.wait(9), /did not complete safely/);
        assert.deepEqual(tracker.getSnapshot(), { count: 1, generations: [9] });
        assert.deepEqual(state.deleted, []);
        tracker.dispose();
        tracker.dispose();
        assert.deepEqual(state.deleted, [1]);
    }
});

test('retirement never claims safety without a sync wait or gl.finish', () => {
    const tracker = new StaticSunDepthFenceTracker({
        getContext: () => ({})
    });
    assert.throws(
        () => tracker.wait(5),
        /requires fenceSync\/clientWaitSync or gl\.finish/
    );
});
