// Pure contract tests for native WebGL2 shadow-depth texture capture.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    NATIVE_SHADOW_DEPTH_CAPTURE_METHOD,
    NATIVE_SHADOW_DEPTH_CAPTURE_ORDER,
    NATIVE_SHADOW_DEPTH_CAPTURE_SCHEMA,
    createNativeShadowDepthCapturePlan,
    validateNativeShadowDepthCaptureEvidence
} from '../../../../tools/static_sun_depth/browser/NativeShadowDepthTextureCapture.js';

function makeEvidence(overrides = {}) {
    const plan = createNativeShadowDepthCapturePlan({
        textureWidth: 8,
        textureHeight: 4,
        region: {x: 2, y: 1, width: 3, height: 2}
    });
    return {
        schema: NATIVE_SHADOW_DEPTH_CAPTURE_SCHEMA,
        method: NATIVE_SHADOW_DEPTH_CAPTURE_METHOD,
        status: 'captured',
        plan,
        sourceProof: {
            attachmentObjectIdentity: 'verified',
            sampledTextureObjectIdentity: 'same-object-v1',
            temporarySamplerCompareMode: 'NONE'
        },
        stateRestoration: {
            gl: 'verified',
            renderer: 'not-provided'
        },
        depthValues: new Float32Array([0, 0.125, 0.25, 0.5, 0.75, 1]),
        ...overrides
    };
}

test('native shadow depth capture plan uses x-fastest lower-left row order', () => {
    const plan = createNativeShadowDepthCapturePlan({
        textureWidth: 8,
        textureHeight: 4,
        region: {x: 2, y: 1, width: 3, height: 2}
    });
    assert.deepEqual(plan, {
        byteLength: 24,
        order: NATIVE_SHADOW_DEPTH_CAPTURE_ORDER,
        region: {x: 2, y: 1, width: 3, height: 2},
        texelCount: 6,
        textureSize: [8, 4]
    });
    assert.ok(Object.isFrozen(plan));
    assert.ok(Object.isFrozen(plan.region));
});

test('native shadow depth capture plan defaults to the complete texture', () => {
    const plan = createNativeShadowDepthCapturePlan({
        textureWidth: 5,
        textureHeight: 3
    });
    assert.deepEqual(plan.region, {x: 0, y: 0, width: 5, height: 3});
    assert.equal(plan.texelCount, 15);
    assert.equal(plan.byteLength, 60);
});

test('native shadow depth capture plan rejects unsafe and out-of-bounds work', () => {
    assert.throws(
        () => createNativeShadowDepthCapturePlan({textureWidth: 0, textureHeight: 1}),
        /textureWidth must be a positive safe integer/
    );
    assert.throws(
        () => createNativeShadowDepthCapturePlan({
            textureWidth: 4,
            textureHeight: 4,
            region: {x: 3, y: 0, width: 2, height: 1}
        }),
        /capture region must remain inside/
    );
    assert.throws(
        () => createNativeShadowDepthCapturePlan({
            textureWidth: 4,
            textureHeight: 4,
            maximumTexels: 15
        }),
        /exceeding maximumTexels 15/
    );
});

test('native shadow depth capture evidence requires attachment identity and restored state', () => {
    const evidence = makeEvidence();
    assert.equal(validateNativeShadowDepthCaptureEvidence(evidence), evidence);

    assert.throws(
        () => validateNativeShadowDepthCaptureEvidence(makeEvidence({method: 'rgba-proxy'})),
        /capture method must be/
    );
    assert.throws(
        () => validateNativeShadowDepthCaptureEvidence(makeEvidence({
            sourceProof: {
                attachmentObjectIdentity: 'unverified',
                sampledTextureObjectIdentity: 'same-object-v1',
                temporarySamplerCompareMode: 'NONE'
            }
        })),
        /authenticated depth attachment proof/
    );
    assert.throws(
        () => validateNativeShadowDepthCaptureEvidence(makeEvidence({
            stateRestoration: {gl: 'failed', renderer: 'not-provided'}
        })),
        /did not verify WebGL state restoration/
    );
});

test('native shadow depth capture evidence rejects missing or invalid float depth values', () => {
    assert.throws(
        () => validateNativeShadowDepthCaptureEvidence(makeEvidence({
            depthValues: new Float32Array(5)
        })),
        /must match the capture plan/
    );
    assert.throws(
        () => validateNativeShadowDepthCaptureEvidence(makeEvidence({
            depthValues: new Float32Array([0, 0.125, 0.25, 0.5, 0.75, 1.25])
        })),
        /outside \[0, 1\]/
    );
});
