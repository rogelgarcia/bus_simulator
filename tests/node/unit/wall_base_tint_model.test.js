// Node unit tests: shared wall-base tint model conversion + compatibility.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    WALL_BASE_TINT_STATE_DEFAULT,
    applyWallBaseTintStateToWallBase,
    composeTintHexFromState,
    composeTintRgb01FromState,
    resolveWallBaseTintHexFromWallBase,
    resolveWallBaseTintStateFromWallBase,
    rgb01FromHex
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

test('WallBaseTintModel: legacy tint-only data defaults to full tint influence', () => {
    const resolved = resolveWallBaseTintStateFromWallBase({ tintHex: 0xffffff }, WALL_BASE_TINT_STATE_DEFAULT);
    assert.equal(resolved.intensity, 1);
    assert.equal(resolved.brightness, 1);
});

test('WallBaseTintModel: brightness above 1 lifts tint toward white', () => {
    const deepBlue = composeTintRgb01FromState({
        hueDeg: 220,
        saturation: 1,
        value: 0.65,
        intensity: 1,
        brightness: 1
    });
    const lifted = composeTintRgb01FromState({
        hueDeg: 220,
        saturation: 1,
        value: 0.65,
        intensity: 1,
        brightness: 2
    });

    assert.ok(lifted.r >= deepBlue.r, 'Expected red channel to increase toward white.');
    assert.ok(lifted.g >= deepBlue.g, 'Expected green channel to increase toward white.');
    assert.ok(lifted.b >= deepBlue.b, 'Expected blue channel to increase toward white.');
    assertNear(lifted.r, 1, 1e-9, 'Expected brightness max to reach white red channel.');
    assertNear(lifted.g, 1, 1e-9, 'Expected brightness max to reach white green channel.');
    assertNear(lifted.b, 1, 1e-9, 'Expected brightness max to reach white blue channel.');
});

test('WallBaseTintModel: saturation can be reduced without lowering value', () => {
    const saturated = composeTintRgb01FromState({
        hueDeg: 35,
        saturation: 1,
        value: 0.8,
        intensity: 1,
        brightness: 1
    });
    const desaturated = composeTintRgb01FromState({
        hueDeg: 35,
        saturation: 0.2,
        value: 0.8,
        intensity: 1,
        brightness: 1
    });

    const maxSat = Math.max(saturated.r, saturated.g, saturated.b);
    const maxDesat = Math.max(desaturated.r, desaturated.g, desaturated.b);
    const spanSat = Math.max(saturated.r, saturated.g, saturated.b) - Math.min(saturated.r, saturated.g, saturated.b);
    const spanDesat = Math.max(desaturated.r, desaturated.g, desaturated.b) - Math.min(desaturated.r, desaturated.g, desaturated.b);
    assertNear(maxDesat, maxSat, 1e-9, 'Expected max channel (value) to remain stable when lowering saturation.');
    assert.ok(spanDesat < spanSat, 'Expected lower saturation to reduce channel spread.');
});

test('WallBaseTintModel: pure white tint state composes to white hex', () => {
    const hex = composeTintHexFromState({
        hueDeg: 124,
        saturation: 0,
        value: 1,
        intensity: 1,
        brightness: 1
    });
    const rgb = rgb01FromHex(hex, 0);
    assertNear(rgb.r, 1, 1e-9);
    assertNear(rgb.g, 1, 1e-9);
    assertNear(rgb.b, 1, 1e-9);
});
