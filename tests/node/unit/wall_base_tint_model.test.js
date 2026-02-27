// Node unit tests: shared wall-base tint model conversion + compatibility.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    WALL_BASE_TINT_STATE_DEFAULT,
    applyWallBaseTintStateToWallBase,
    composeTintHexFromState,
    resolveWallBaseTintHexFromWallBase,
    resolveWallBaseTintStateFromWallBase
} from '../../../src/app/buildings/WallBaseTintModel.js';

function assertNear(actual, expected, eps = 1e-9, msg = '') {
    const a = Number(actual);
    const e = Number(expected);
    assert.ok(Number.isFinite(a), `Expected finite number. ${msg}`);
    assert.ok(Math.abs(a - e) <= eps, `${msg} (actual=${a}, expected=${e}, eps=${eps})`);
}

test('WallBaseTintModel: state round-trips through wallBase serialization fields', () => {
    const state = {
        hueDeg: 214.25,
        saturation: 0.42,
        value: 0.68,
        intensity: 0.83,
        brightness: 1.27
    };

    const wallBase = applyWallBaseTintStateToWallBase({}, state);
    const restored = resolveWallBaseTintStateFromWallBase(wallBase);

    assertNear(restored.hueDeg, state.hueDeg, 1e-6, 'Expected hueDeg to round-trip.');
    assertNear(restored.saturation, state.saturation, 1e-6, 'Expected saturation to round-trip.');
    assertNear(restored.value, state.value, 1e-6, 'Expected value to round-trip.');
    assertNear(restored.intensity, state.intensity, 1e-6, 'Expected intensity to round-trip.');
    assertNear(restored.brightness, state.brightness, 1e-6, 'Expected brightness to round-trip.');
    assert.equal(
        resolveWallBaseTintHexFromWallBase(wallBase),
        composeTintHexFromState(state),
        'Expected wallBase tintHex to match composed state tint.'
    );
});

test('WallBaseTintModel: old tint-only configs remain supported', () => {
    const legacy = { tintHex: 0x3d5a7f };
    const resolved = resolveWallBaseTintStateFromWallBase(legacy);
    const next = applyWallBaseTintStateToWallBase({}, resolved);

    assert.equal(resolveWallBaseTintHexFromWallBase(legacy), resolveWallBaseTintHexFromWallBase(next));
    assert.equal(typeof next.tintHueDeg, 'number');
    assert.equal(typeof next.tintSaturation, 'number');
    assert.equal(typeof next.tintValue, 'number');
    assert.equal(typeof next.tintIntensity, 'number');
    assert.equal(typeof next.tintBrightness, 'number');
});

test('WallBaseTintModel: near-white legacy tint infers zero legacy intensity fallback', () => {
    const resolved = resolveWallBaseTintStateFromWallBase({ tintHex: 0xffffff }, WALL_BASE_TINT_STATE_DEFAULT);
    assert.equal(resolved.intensity, 0);
    assert.equal(resolved.brightness, 1);
});
