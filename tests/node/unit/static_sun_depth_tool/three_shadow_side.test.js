// Deterministic contract for Three r183 shadow-map sidedness.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    STATIC_SUN_DEPTH_CASTER_SIDEDNESS,
    describeStaticSunDepthEffectiveShadowSide,
    requireStaticSunDepthCasterSidedness,
    resolveStaticSunDepthEffectiveShadowSide,
    resolveThreeR183ShadowAlphaTest,
    resolveThreeR183ShadowSide,
    THREE_BACK_SIDE,
    THREE_DOUBLE_SIDE,
    THREE_FRONT_SIDE
} from '../../../../tools/static_sun_depth/src/ThreeShadowSide.mjs';

test('Three r183 default shadow side flips front/back and retains double side', () => {
    assert.equal(
        resolveThreeR183ShadowSide(THREE_FRONT_SIDE, null),
        THREE_BACK_SIDE
    );
    assert.equal(
        resolveThreeR183ShadowSide(THREE_BACK_SIDE, undefined),
        THREE_FRONT_SIDE
    );
    assert.equal(
        resolveThreeR183ShadowSide(THREE_DOUBLE_SIDE, null),
        THREE_DOUBLE_SIDE
    );
    assert.equal(resolveThreeR183ShadowSide(undefined, null), THREE_BACK_SIDE);
});

test('Three r183 explicit shadowSide overrides ordinary material side', () => {
    for (const ordinary of [THREE_FRONT_SIDE, THREE_BACK_SIDE, THREE_DOUBLE_SIDE]) {
        for (const explicit of [THREE_FRONT_SIDE, THREE_BACK_SIDE, THREE_DOUBLE_SIDE]) {
            assert.equal(resolveThreeR183ShadowSide(ordinary, explicit), explicit);
        }
    }
    assert.throws(() => resolveThreeR183ShadowSide(99, null), /Unsupported Three/);
});

test('single_high effective sidedness forces double except authenticated material preserves', () => {
    assert.equal(resolveStaticSunDepthEffectiveShadowSide({
        side: THREE_FRONT_SIDE,
        shadowSide: null,
        preserveShadowSide: false,
        isFoliage: false
    }), THREE_DOUBLE_SIDE);
    assert.equal(resolveStaticSunDepthEffectiveShadowSide({
        side: THREE_FRONT_SIDE,
        shadowSide: null,
        preserveShadowSide: true,
        isFoliage: false
    }), THREE_BACK_SIDE);
    assert.equal(resolveStaticSunDepthEffectiveShadowSide({
        side: THREE_BACK_SIDE,
        shadowSide: THREE_FRONT_SIDE,
        preserveShadowSide: false,
        isFoliage: true
    }), THREE_FRONT_SIDE);
    assert.deepEqual(describeStaticSunDepthEffectiveShadowSide({
        side: THREE_FRONT_SIDE,
        shadowSide: null,
        preserveShadowSide: false,
        isFoliage: false
    }), {
        authoredSide: THREE_FRONT_SIDE,
        authoredShadowSide: null,
        preserveShadowSide: false,
        isFoliage: false,
        preservesAuthoredShadowSide: false,
        casterSidedness: STATIC_SUN_DEPTH_CASTER_SIDEDNESS,
        effectiveShadowSide: THREE_DOUBLE_SIDE
    });
});

test('effective sidedness policy and boolean inputs fail closed', () => {
    assert.throws(() => resolveThreeR183ShadowSide(0, 99), /Unsupported Three/);
    assert.throws(() => resolveStaticSunDepthEffectiveShadowSide({
        side: 0,
        shadowSide: null,
        preserveShadowSide: 'true',
        isFoliage: false
    }), /must be booleans/);
    assert.throws(() => resolveStaticSunDepthEffectiveShadowSide({
        side: 0,
        shadowSide: null,
        isFoliage: false
    }), /must be booleans/);
    assert.throws(() => resolveStaticSunDepthEffectiveShadowSide({
        side: 0,
        shadowSide: null,
        preserveShadowSide: false
    }), /must be booleans/);
    assert.throws(() => requireStaticSunDepthCasterSidedness({
        ...STATIC_SUN_DEPTH_CASTER_SIDEDNESS,
        extra: true
    }), /keys/);
});

test('Three r183 shadow alpha cutoff mirrors alpha-to-coverage fallback', () => {
    assert.equal(resolveThreeR183ShadowAlphaTest(0, false), 0);
    assert.equal(resolveThreeR183ShadowAlphaTest(0, true), 0.5);
    assert.equal(resolveThreeR183ShadowAlphaTest(undefined, true), 0.5);
    assert.equal(resolveThreeR183ShadowAlphaTest(0.37, true), 0.5);
    assert.equal(resolveThreeR183ShadowAlphaTest(0.37, false), 0.37);
});
