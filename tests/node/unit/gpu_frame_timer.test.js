// Node unit tests for WebGL timer-query provenance and sample sequencing.

import assert from 'node:assert/strict';
import test from 'node:test';

import { getOrCreateGpuFrameTimer } from '../../../src/graphics/engine3d/perf/GpuFrameTimer.js';

function createFakeWebGl2({ extensionSupported = true } = {}) {
    const extension = { TIME_ELAPSED_EXT: 35007, GPU_DISJOINT_EXT: 36795 };
    let nextId = 1;
    let activeQuery = null;
    let disjoint = false;
    return {
        NO_ERROR: 0,
        QUERY_RESULT_AVAILABLE: 34919,
        QUERY_RESULT: 34918,
        createQuery() {
            return { id: nextId++, ns: 1_250_000 };
        },
        deleteQuery() {},
        beginQuery(_target, query) {
            activeQuery = query;
        },
        endQuery() {
            activeQuery = null;
        },
        getQueryParameter(query, parameter) {
            return parameter === this.QUERY_RESULT_AVAILABLE ? true : query.ns;
        },
        getExtension(name) {
            return name === 'EXT_disjoint_timer_query_webgl2' && extensionSupported ? extension : null;
        },
        getParameter(parameter) {
            return parameter === extension.GPU_DISJOINT_EXT ? disjoint : null;
        },
        getError() {
            return this.NO_ERROR;
        },
        isContextLost() {
            return false;
        },
        setDisjoint(value) {
            disjoint = value;
        },
        getActiveQuery() {
            return activeQuery;
        }
    };
}

test('GPU frame timer exposes backend, unique completion/submission sequences, and reset state', () => {
    const gl = createFakeWebGl2();
    const timer = getOrCreateGpuFrameTimer({ getContext: () => gl });
    assert.equal(timer.isSupported, true);
    assert.equal(timer.getDiagnostics().backend, 'webgl2_ext_disjoint_timer_query');

    timer.beginFrame();
    assert.ok(gl.getActiveQuery());
    timer.endFrame();
    timer.poll();

    assert.deepEqual(timer.getSamplesSince(0).map(({ sequence, submissionSequence, ms }) => ({
        sequence,
        submissionSequence,
        ms
    })), [{ sequence: 1, submissionSequence: 1, ms: 1.25 }]);
    assert.equal(timer.getDiagnostics().sampleCount, 1);
    assert.equal(timer.getDiagnostics().pendingQueryCount, 0);
    assert.equal(timer.resetSamples(), true);
    assert.equal(timer.getDiagnostics().sampleCount, 0);
    assert.deepEqual(timer.getSamplesSince(0), []);
});

test('GPU frame timer documents unsupported and disjoint query states without CPU proxies', () => {
    const unsupported = getOrCreateGpuFrameTimer({
        getContext: () => createFakeWebGl2({ extensionSupported: false })
    });
    assert.equal(unsupported.isSupported, false);
    assert.equal(unsupported.getLastMs(), null);
    assert.equal(unsupported.getDiagnostics().backend, 'unsupported');
    assert.match(unsupported.getDiagnostics().disabledReason, /unavailable/);

    const gl = createFakeWebGl2();
    const timer = getOrCreateGpuFrameTimer({ getContext: () => gl });
    timer.beginFrame();
    timer.endFrame();
    gl.setDisjoint(true);
    timer.poll();
    assert.equal(timer.getDiagnostics().disjointCount, 1);
    assert.equal(timer.getDiagnostics().sampleCount, 0);
    assert.equal(timer.getLastMs(), null);
});
