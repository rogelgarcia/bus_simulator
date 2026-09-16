import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profileBakedPasses } from '../../headless/harness/BakedPassProfile.js';

function fixture() {
    let activeQuery = null, deleted = 0, ended = 0, disjoint = false;
    const gl = {
        CURRENT_QUERY: 1, QUERY_RESULT_AVAILABLE: 2, QUERY_RESULT: 3,
        getExtension: () => ({ TIME_ELAPSED_EXT: 4, GPU_DISJOINT_EXT: 5 }),
        getQuery: () => activeQuery, getParameter: () => disjoint,
        createQuery: () => ({}),
        beginQuery(target, query) { assert.equal(activeQuery, null, 'Elapsed queries must never nest'); activeQuery = query; },
        endQuery() { ended++; activeQuery = null; },
        getQueryParameter: (query, key) => key === 2 ? true : 2e6,
        deleteQuery() { deleted++; },
        drawArrays() {}, uniformMatrix4fv() {}, texSubImage2D() {}, bufferSubData() {},
        getAttachedShaders: () => []
    };
    const timer = { beginFrame() { gl.beginQuery(4, {}); }, endFrame() { gl.endQuery(4); } };
    const engine = { frameIndex: 1, scene: {}, _gpuFrameTimer: timer, _bakedLighting: {}, renderer: {
        getContext: () => gl, getRenderTarget: () => ({ width: 100, height: 50 }),
        render() { gl.drawArrays(); gl.uniformMatrix4fv({}, false, new Float32Array(16));
            gl.texSubImage2D(0, 0, 0, 0, 1, 1, 0, 0, new Float32Array(4)); }
    } };
    return { gl, engine, timer, deleted: () => deleted, ended: () => ended, disjoint: () => { disjoint = true; } };
}

test('Baked pass diagnostics: suppress whole-frame queries and preserve actual upload volume', () => {
    const f = fixture(), originalRender = f.engine.renderer.render;
    const capture = profileBakedPasses(f.engine);
    assert.equal(f.engine._gpuFrameTimer.wholeFrameSuppressed, true);
    f.engine._gpuFrameTimer.beginFrame();
    f.engine.renderer.render(f.engine.scene);
    f.engine._gpuFrameTimer.endFrame();
    const result = capture.finish(), row = result.passes[0];
    assert.equal(row.gpuMs, 2);
    assert.equal(row.calls.drawArrays, 1);
    assert.equal(row.uniformElements, 16);
    assert.equal(row.textureUploadBytes, 16);
    assert.equal(row.bufferUploadBytes, 0);
    assert.equal(result.disjoints, 0);
    assert.equal(f.deleted(), 1);
    assert.equal(f.ended(), 1);
    assert.equal(f.engine._gpuFrameTimer, f.timer);
    assert.equal(f.engine.renderer.render, originalRender);
});

test('Baked pass diagnostics: discard disjoint samples and restore after a failed draw', () => {
    const f = fixture();
    f.engine.renderer.render = () => { throw new Error('draw failed'); };
    const original = f.engine.renderer.render, capture = profileBakedPasses(f.engine);
    assert.throws(() => f.engine.renderer.render(f.engine.scene), /draw failed/);
    f.disjoint();
    const result = capture.finish();
    assert.equal(result.passes[0].gpuMs, null);
    assert.equal(result.disjoints, 1);
    assert.equal(f.ended(), 1);
    assert.equal(f.deleted(), 1);
    assert.equal(f.engine._gpuFrameTimer, f.timer);
    assert.equal(f.engine.renderer.render, original);
});

test('Baked pass diagnostics: never end a foreign elapsed query', () => {
    const f = fixture(), foreign = {};
    f.gl.beginQuery(4, foreign);
    const capture = profileBakedPasses(f.engine);
    f.engine.renderer.render(f.engine.scene);
    const result = capture.finish();
    assert.equal(result.skippedQueries, 1);
    assert.equal(result.passes[0].gpuMs, null);
    assert.equal(f.gl.getQuery(), foreign);
    assert.equal(f.ended(), 0);
    assert.equal(f.deleted(), 0);
});

test('Baked pass diagnostics: pending samples remain missing and their queries are released', () => {
    const f = fixture();
    f.gl.getQueryParameter = () => false;
    const capture = profileBakedPasses(f.engine);
    f.engine.renderer.render(f.engine.scene);
    const result = capture.finish();
    assert.equal(result.pendingQueries, 1);
    assert.equal(result.passes[0].gpuMs, null);
    assert.equal(f.deleted(), 1);
});
