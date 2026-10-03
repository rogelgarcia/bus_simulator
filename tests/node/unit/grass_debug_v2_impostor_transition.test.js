import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrassImpostorTransition, advanceGrassImpostorTransition } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2ImpostorTransition.js';

test('Grass impostors conserve complementary coverage while entering and leaving geometry', () => {
    const state = createGrassImpostorTransition();
    let parts = advanceGrassImpostorTransition(state, 'view-a', 0, 300);
    assert.deepEqual(parts.map(p => p.high - p.low), [1, 0]);
    parts = advanceGrassImpostorTransition(state, 'view-a', 150, 300);
    assert.deepEqual(parts.map(p => p.high - p.low), [.5, .5]);
    assert.equal(parts.filter(p => p.ownsLeaves).length, 1);
    advanceGrassImpostorTransition(state, 'view-a', 300, 300);
    parts = advanceGrassImpostorTransition(state, null, 320, 300);
    assert.deepEqual(parts.map(p => p.high - p.low), [1, 0]);
    parts = advanceGrassImpostorTransition(state, null, 620, 300);
    assert.deepEqual(parts, [{ key: null, low: 0, high: 1, ownsLeaves: true }]);
});

test('Grass impostors finish the visible blend before retargeting a moving camera', () => {
    const state = createGrassImpostorTransition();
    state.current = 'old';
    advanceGrassImpostorTransition(state, 'next', 100, 300);
    for (const now of [110, 200, 399]) {
        const parts = advanceGrassImpostorTransition(state, 'different-request', now, 300);
        assert.deepEqual(parts.map(p => p.key), ['old', 'next']);
        assert.equal(parts[0].high, parts[1].low);
        assert.equal(parts.reduce((sum, p) => sum + p.high - p.low, 0), 1);
    }
    const parts = advanceGrassImpostorTransition(state, 'different-request', 400, 300);
    assert.deepEqual(parts.map(p => p.key), ['next', 'different-request']);
    assert.deepEqual(parts.map(p => p.high - p.low), [1, 0]);
});
