// Verifies the fail-closed textureGrad native-field promotion record.

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
    buildPromotedNativeCutoutFieldReceipt,
    parseNativeFieldPromotionArguments
} from '../../../../tools/static_sun_depth/promote_alpha_cutout_native_field.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const SHA_D = 'd'.repeat(64);

test('promotion CLI accepts the authenticated BSIB input path', () => {
    const options = parseNativeFieldPromotionArguments([
        '--input', 'tests/artifacts/illumination_528/packages/bigcity2/fresh/bigcity2.bsib',
        '--input-root', 'tests/artifacts/illumination_531/native_cutout_fields/source',
        '--parity-root', 'tests/artifacts/illumination_531/parity/source',
        '--output-root', 'tests/artifacts/illumination_531/native_cutout_fields/promoted',
        '--profiles', 'ai527.sun.az135.el08'
    ]);

    assert.equal(
        options.inputPath.endsWith('tests\\artifacts\\illumination_528\\packages\\bigcity2\\fresh\\bigcity2.bsib'),
        true
    );
    assert.deepEqual(options.profiles, ['ai527.sun.az135.el08']);
});

test('native textureGrad promotion retains the original receipt identity', () => {
    const source = {
        schema: 'ai531-production-alpha-cutout-native-field-receipt-v3',
        method: 'headless-blender-full-lattice-candidates-three-r183-native-texture-grad-v3',
        status: 'complete_unpromoted',
        productionEligible: false
    };
    const promoted = buildPromotedNativeCutoutFieldReceipt({
        nativeFieldIdentitySha256: SHA_A,
        parityArtifactSha256: SHA_B,
        parityDescriptorSha256: SHA_C,
        receipt: source,
        unpromotedReceiptByteLength: 123,
        unpromotedReceiptSha256: SHA_D
    });
    assert.equal(promoted.status, 'complete');
    assert.equal(promoted.productionEligible, true);
    assert.equal(promoted.promotion.unpromotedReceiptSha256, SHA_D);
    assert.equal(promoted.promotion.nativeFieldIdentitySha256, SHA_A);
    assert.equal(source.status, 'complete_unpromoted');
    assert.equal(source.productionEligible, false);
});

test('authenticated union promotion retains the original composite identity', () => {
    const source = {
        schema: 'ai531-production-alpha-cutout-native-field-receipt-v6',
        method: 'authenticated-direct-depth24-texture-grad-hole-fill-v6',
        status: 'complete_unpromoted',
        productionEligible: false
    };
    const promoted = buildPromotedNativeCutoutFieldReceipt({
        nativeFieldIdentitySha256: SHA_A,
        parityArtifactSha256: SHA_B,
        parityDescriptorSha256: SHA_C,
        receipt: source,
        unpromotedReceiptByteLength: 456,
        unpromotedReceiptSha256: SHA_D
    });

    assert.equal(promoted.method, source.method);
    assert.equal(promoted.schema, source.schema);
    assert.equal(promoted.status, 'complete');
    assert.equal(promoted.productionEligible, true);
});

test('authenticated calibration v7 is diagnostic-only and cannot be promoted', () => {
    const source = {
        schema: 'ai531-production-alpha-cutout-native-field-receipt-v7',
        method: 'authenticated-direct-preferred-hole-fill-minus-measured-bake-only-v7',
        status: 'complete_unpromoted',
        productionEligible: false
    };
    assert.throws(() => buildPromotedNativeCutoutFieldReceipt({
        nativeFieldIdentitySha256: SHA_A,
        parityArtifactSha256: SHA_B,
        parityDescriptorSha256: SHA_C,
        receipt: source,
        unpromotedReceiptByteLength: 789,
        unpromotedReceiptSha256: SHA_D
    }), /complete unpromoted textureGrad receipt or composite receipt/u);
});

test('authenticated exact calibration v8 is diagnostic-only and cannot be promoted', () => {
    const source = {
        schema: 'ai531-production-alpha-cutout-native-field-receipt-v8',
        method: 'authenticated-minimum-union-plus-measured-exact-corrections-v8',
        status: 'complete_unpromoted',
        productionEligible: false
    };
    assert.throws(() => buildPromotedNativeCutoutFieldReceipt({
        nativeFieldIdentitySha256: SHA_A,
        parityArtifactSha256: SHA_B,
        parityDescriptorSha256: SHA_C,
        receipt: source,
        unpromotedReceiptByteLength: 987,
        unpromotedReceiptSha256: SHA_D
    }), /complete unpromoted textureGrad receipt or composite receipt/u);
});

test('authenticated residual v11 is diagnostic-only and cannot be promoted', () => {
    const source = {
        schema: 'ai531-production-alpha-cutout-native-field-receipt-v11',
        method: 'authenticated-static-shadow-residual-live-depth-corrections-v11',
        status: 'complete_unpromoted',
        productionEligible: false
    };
    assert.throws(() => buildPromotedNativeCutoutFieldReceipt({
        nativeFieldIdentitySha256: SHA_A,
        parityArtifactSha256: SHA_B,
        parityDescriptorSha256: SHA_C,
        receipt: source,
        unpromotedReceiptByteLength: 1111,
        unpromotedReceiptSha256: SHA_D
    }), /complete unpromoted textureGrad receipt or composite receipt/u);
});

test('native textureGrad promotion rejects an already eligible receipt', () => {
    assert.throws(() => buildPromotedNativeCutoutFieldReceipt({
        nativeFieldIdentitySha256: SHA_A,
        parityArtifactSha256: SHA_B,
        parityDescriptorSha256: SHA_C,
        receipt: {
            schema: 'ai531-production-alpha-cutout-native-field-receipt-v3',
            method: 'headless-blender-full-lattice-candidates-three-r183-native-texture-grad-v3',
            status: 'complete',
            productionEligible: true
        },
        unpromotedReceiptByteLength: 123,
        unpromotedReceiptSha256: SHA_D
    }), /complete unpromoted textureGrad receipt/u);
});

test('promotion verifier uses a mutable top-level receipt copy', async () => {
    const source = await readFile(new URL(
        '../../../../tools/static_sun_depth/src/ProductionOrchestrator.mjs',
        import.meta.url
    ), 'utf8');
    assert.match(source, /const expectedOriginal = \{\.\.\.receipt\};/u);
});
