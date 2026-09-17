import test from 'node:test';
import assert from 'node:assert/strict';
import { profileBakedCpuPhases } from '../../headless/harness/BakedCpuPhaseProfile.js';

function fixture() {
    const listeners = new Set();
    const engine = {
        _stateMachine: { update() {} },
        _bakedLighting: { prepareFrame() {}, frameBegin() {} },
        renderer: { render() { return 42; } },
        _prepareDynamicAo() { this.renderer.render(); },
        _renderAoFrame() { this._prepareDynamicAo(); return this.renderer.render(); },
        addFrameListener(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    return { engine, listeners };
}

test('CPU phase diagnostics preserve nested render results and restore every owner', () => {
    const { engine, listeners } = fixture();
    const owners = [engine, engine.renderer, engine._stateMachine, engine._bakedLighting];
    const originals = owners.map(owner => ({ ...owner }));
    const capture = profileBakedCpuPhases(engine);
    assert.equal(engine._renderAoFrame(), 42);
    for (const listener of listeners) listener({ frameIndex: 7, cpuMs: 123 });
    engine.renderer.render();
    for (const listener of listeners) listener({ frameIndex: 8, cpuMs: 50 });
    const result = capture.finish();
    assert.equal(result.frames[0].cpuMs, 123);
    assert.equal(result.frames[0].phases.rendererRender.calls, 2);
    assert.equal(result.frames[0].phases.dynamicAo.calls, 1);
    assert.equal(result.frames[0].phases.renderAoFrame.calls, 1);
    assert.equal(result.frames[1].phases.rendererRender.calls, 1);
    assert.equal(result.frames[1].phases.dynamicAo, undefined);
    assert.equal(listeners.size, 0);
    owners.forEach((owner, index) => assert.deepEqual(owner, originals[index]));
});

test('CPU phase diagnostics propagate render failures and allow cleanup', () => {
    const { engine, listeners } = fixture();
    const failure = new Error('render failed');
    const original = engine.renderer.render = () => { throw failure; };
    const capture = profileBakedCpuPhases(engine);
    assert.throws(() => engine._renderAoFrame(), error => error === failure);
    for (const listener of listeners) listener({ frameIndex: 9, cpuMs: 10 });
    const result = capture.finish();
    assert.equal(result.frames[0].phases.rendererRender.calls, 1);
    assert.equal(engine.renderer.render, original);
    assert.equal(listeners.size, 0);
});
