// tests/node/unit/facade_bay_group_model.test.js
// AI 493: facade bay GROUP model — repeat bounds, arcade normalization and the
// shared springing math (the rule that keeps a mixed-width arcade from stilting
// an arch past its own semicircle).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    ARCADE_IMPOST_DEFAULTS,
    ARCADE_MIN_RISE_RATIO,
    ARCADE_SPRINGING_MODE,
    FACADE_BAY_STACKING_MODE,
    normalizeArcadeConfig,
    normalizeFacadeBayGroupRepeat,
    normalizeFacadeStackingSpec,
    resolveArcadeArchHeightRatio,
    resolveArcadeSpringingOffset
} from '../../../src/app/buildings/FacadeBayGroupModel.js';

// A 2.0m opening whose head sits 3.0m above the floor, natural rise 0.4m.
const WIDE = Object.freeze({ headOffsetMeters: 3.0, widthMeters: 2.0, archHeightRatio: 0.2 });
// A 1.0m opening at the same head height: natural rise 0.2m, so it springs
// 0.2m HIGHER than the wide one.
const NARROW = Object.freeze({ headOffsetMeters: 3.0, widthMeters: 1.0, archHeightRatio: 0.2 });

function assertClose(actual, expected, message) {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? "value"}: ${actual} != ${expected}`);
}

test('group repeat: defaults to repeat-if-fits and clamps max below min', () => {
    assert.deepEqual(normalizeFacadeBayGroupRepeat(null), { minRepeats: 1, maxRepeats: 'auto' });
    assert.deepEqual(normalizeFacadeBayGroupRepeat({ minRepeats: 3 }), { minRepeats: 3, maxRepeats: 'auto' });
    assert.deepEqual(normalizeFacadeBayGroupRepeat({ minRepeats: 0, maxRepeats: 4 }), { minRepeats: 1, maxRepeats: 4 });
    assert.deepEqual(normalizeFacadeBayGroupRepeat({ minRepeats: 5, maxRepeats: 2 }), { minRepeats: 5, maxRepeats: 5 });
    assert.deepEqual(normalizeFacadeBayGroupRepeat({ maxRepeats: null }), { minRepeats: 1, maxRepeats: 'auto' });
});

test('arcade config: absent impost means the default band, explicit false removes it', () => {
    assert.equal(normalizeArcadeConfig(null), null);
    assert.equal(normalizeArcadeConfig({ enabled: false }), null);

    const on = normalizeArcadeConfig({ enabled: true });
    assert.equal(on.enabled, true);
    assert.equal(on.springing.mode, ARCADE_SPRINGING_MODE.AUTO);
    assert.equal(on.springing.offsetMeters, null);
    assert.equal(on.impost.heightMeters, ARCADE_IMPOST_DEFAULTS.heightMeters);
    assert.deepEqual(on.impost.material, { kind: 'match_wall', id: 'match_wall' });

    const noImpost = normalizeArcadeConfig({ enabled: true, impost: { enabled: false } });
    assert.equal(noImpost.impost.enabled, false, 'the band is disabled, not dropped, so it round-trips');
    assert.equal(on.impost.enabled, true);

    const slotted = normalizeArcadeConfig({ enabled: true, impost: { material: { kind: 'slot', id: 'trim' } } });
    assert.deepEqual(slotted.impost.material, { kind: 'slot', id: 'trim' });
});

test('arcade config: a fixed springing needs an offset, otherwise it stays auto', () => {
    const fixed = normalizeArcadeConfig({ enabled: true, springing: { mode: 'fixed', offsetMeters: 2.4 } });
    assert.equal(fixed.springing.mode, ARCADE_SPRINGING_MODE.FIXED);
    assert.equal(fixed.springing.offsetMeters, 2.4);

    const noOffset = normalizeArcadeConfig({ enabled: true, springing: { mode: 'fixed' } });
    assert.equal(noOffset.springing.mode, ARCADE_SPRINGING_MODE.AUTO);
});

test('stacking spec: locks columns by default', () => {
    assert.equal(normalizeFacadeStackingSpec(null).mode, FACADE_BAY_STACKING_MODE.LOCK_COLUMNS);
    assert.equal(normalizeFacadeStackingSpec({ mode: 'per_layer' }).mode, FACADE_BAY_STACKING_MODE.PER_LAYER);
    assert.equal(normalizeFacadeStackingSpec({ mode: 'nonsense' }).mode, FACADE_BAY_STACKING_MODE.LOCK_COLUMNS);
});

test('springing: the HIGHEST natural line wins so no arch is stilted', () => {
    const springing = resolveArcadeSpringingOffset({ members: [WIDE, NARROW] });
    // The narrow arch springs at 3.0 - 0.2 = 2.8; the wide one at 3.0 - 0.4 = 2.6.
    assert.equal(springing, 2.8);

    const narrow = resolveArcadeArchHeightRatio({ member: NARROW, springingOffsetMeters: springing });
    assert.equal(narrow.met, true);
    assert.equal(narrow.heightRatio, 0.2, 'the member that defines the line keeps its natural rise');

    const wide = resolveArcadeArchHeightRatio({ member: WIDE, springingOffsetMeters: springing });
    assert.equal(wide.met, true);
    assertClose(wide.heightRatio, 0.1, 'the wide arch flattens to segmental to meet the line');
    assert.ok(wide.heightRatio < WIDE.archHeightRatio, 'never rises above its natural semicircle');
});

test('springing: a uniform run already sits on one line', () => {
    const members = [NARROW, { ...NARROW }, { ...NARROW }];
    const springing = resolveArcadeSpringingOffset({ members });
    assert.equal(springing, 2.8);
    for (const member of members) {
        const resolved = resolveArcadeArchHeightRatio({ member, springingOffsetMeters: springing });
        assert.equal(resolved.met, true);
        assert.equal(resolved.heightRatio, 0.2);
    }
});

test('springing: unarched members are ignored, an all-flat run has no line', () => {
    const flat = { headOffsetMeters: 3.0, widthMeters: 1.4, archHeightRatio: 0 };
    assert.equal(resolveArcadeSpringingOffset({ members: [flat] }), null);
    assert.equal(resolveArcadeSpringingOffset({ members: [] }), null);
    assert.equal(resolveArcadeSpringingOffset({ members: [flat, NARROW] }), 2.8);
});

test('springing: an out-of-reach line leaves the opening alone', () => {
    // A fixed line above the opening head cannot be met.
    const tooHigh = resolveArcadeArchHeightRatio({ member: NARROW, springingOffsetMeters: 3.2 });
    assert.equal(tooHigh.met, false);
    assert.equal(tooHigh.heightRatio, NARROW.archHeightRatio);

    // A line so low the arch would flatten away is refused too.
    const tooLow = resolveArcadeArchHeightRatio({
        member: NARROW,
        springingOffsetMeters: NARROW.headOffsetMeters - (ARCADE_MIN_RISE_RATIO * NARROW.widthMeters) * 0.5
    });
    assert.equal(tooLow.met, false);
    assert.equal(tooLow.heightRatio, NARROW.archHeightRatio);

    // And a line BELOW natural would mean stilting, which is also refused.
    const stilted = resolveArcadeArchHeightRatio({ member: NARROW, springingOffsetMeters: 2.5 });
    assert.equal(stilted.met, false);
    assert.equal(stilted.heightRatio, NARROW.archHeightRatio);
});

test('springing: a fixed offset overrides the auto line', () => {
    const springing = resolveArcadeSpringingOffset({
        members: [WIDE, NARROW],
        springing: { mode: ARCADE_SPRINGING_MODE.FIXED, offsetMeters: 2.7 }
    });
    assert.equal(springing, 2.7);
    assertClose(resolveArcadeArchHeightRatio({ member: WIDE, springingOffsetMeters: springing }).heightRatio, 0.15);
});
