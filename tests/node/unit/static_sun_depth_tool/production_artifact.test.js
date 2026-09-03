// Verifies production tile assembly, guard certification, canonical metadata, and release records.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalJsonStringify } from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    createThreeR183DirectionalShadowFilterAxes
} from '../../../../src/app/illumination/static_sun_depth/index.js';
import {
    BLENDER_PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA,
    PRODUCTION_STATIC_SUN_DEPTH_ARTIFACT_SCHEMA,
    PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA,
    buildAlphaCutoutCertificationRecord,
    buildAlphaCutoutCoverageCertificationRecord,
    buildCasterExclusionCertificationRecord,
    buildOpaqueOccluderCertificationRecord,
    buildProductionStaticSunDepthArtifact,
    validateProductionStaticSunDepthArrayPayload,
    validateProductionStaticSunDepthReceipt
} from '../../../../tools/static_sun_depth/src/ProductionArtifact.mjs';
import { StaticSunDepthToolError } from '../../../../tools/static_sun_depth/src/StaticSunDepthToolError.mjs';

const HASHES = Object.freeze({
    alpha: 'a'.repeat(64),
    archive: 'b'.repeat(64),
    caster: 'c'.repeat(64),
    channel: 'd'.repeat(64),
    compiler: 'e'.repeat(64),
    evidence: 'f'.repeat(64),
    executable: '1'.repeat(64),
    geometry: '2'.repeat(64),
    profile: '3'.repeat(64),
    resolved: '4'.repeat(64),
    truth: '5'.repeat(64),
    materials: '6'.repeat(64)
});
const PRODUCTION_TEXEL_SIZE_METERS = 680 / 16384;
const PRODUCTION_INTERIOR_PIXELS = Object.freeze([1870, 1821]);
const PRODUCTION_TILE_SIZE_METERS = Object.freeze([
    PRODUCTION_INTERIOR_PIXELS[0] * PRODUCTION_TEXEL_SIZE_METERS,
    PRODUCTION_INTERIOR_PIXELS[1] * PRODUCTION_TEXEL_SIZE_METERS
]);

test('production builder derives four-pixel internal and exterior guards into one deterministic array', () => {
    const fixture = makeFixture();
    const first = buildProductionStaticSunDepthArtifact(fixture);
    const second = buildProductionStaticSunDepthArtifact(makeFixture());

    assert.equal(first.artifactManifest.schema, PRODUCTION_STATIC_SUN_DEPTH_ARTIFACT_SCHEMA);
    assert.equal(first.artifactManifest.productionEligible, true);
    assert.equal(first.descriptor.identity.layout.guardTexels, 4);
    assert.deepEqual(first.descriptor.identity.layout.tileCount, [2, 2]);
    assert.equal(first.payload.byteLength, 4 * 12 * 12 * 2);
    assert.deepEqual(first.payload, second.payload);
    assert.deepEqual(first.artifactManifest, second.artifactManifest);
    assert.equal(first.descriptorCanonicalJson, canonicalJsonStringify(first.descriptor));
    assert.equal(first.artifactManifestCanonicalJson, canonicalJsonStringify(first.artifactManifest));
    assert.equal(first.artifactManifest.layers.length, 4);
    assert.equal(new Set(first.artifactManifest.layers.map((layer) => layer.sha256)).size, 4);
    assert.equal(first.metrics.guardVerification.guardMismatchCount, 0);
    assert.equal(first.metrics.guardVerification.seamMismatchCount, 0);
    assert.equal(first.metrics.quantization.measurement, 'blender-receipt-measured-v1');
    assert.equal(first.metrics.quantization.occupiedTexelCount, 63);
    assert.equal(first.metrics.quantization.emptyTexelCount, 1);

    const storedWidth = 12;
    assert.equal(readCode(first.payload, 0, storedWidth, 8, 4), codeAt(4, 0));
    assert.equal(readCode(first.payload, 0, storedWidth, 0, 4), 65535);
    assert.equal(readCode(first.payload, 0, storedWidth, 8, 8), codeAt(4, 4));
    assert.deepEqual(
        validateProductionStaticSunDepthArrayPayload({
            descriptor: first.descriptor,
            payload: first.payload
        }),
        first.metrics.guardVerification
    );
});

test('production receipt and payload validation reject stale interiors and any guard mismatch', () => {
    const fixture = makeFixture();
    const stale = structuredClone(fixture.receipt);
    stale.tiles[0].interiorSha256 = '0'.repeat(64);
    assert.throws(
        () => buildProductionStaticSunDepthArtifact({ ...fixture, receipt: stale }),
        (error) => error instanceof StaticSunDepthToolError
            && error.code === 'static_sun_depth_production_interior_mismatch'
    );

    const wrongGuard = structuredClone(fixture.receipt);
    wrongGuard.channel.guardTexels = 3;
    assert.throws(
        () => validateProductionStaticSunDepthReceipt(wrongGuard),
        (error) => error instanceof StaticSunDepthToolError
            && error.code === 'static_sun_depth_production_guard_policy_invalid'
    );

    const built = buildProductionStaticSunDepthArtifact(fixture);
    const tampered = built.payload.slice();
    const offset = ((4 * 12) + 8) * 2;
    tampered[offset] ^= 1;
    assert.throws(
        () => validateProductionStaticSunDepthArrayPayload({
            descriptor: built.descriptor,
            payload: tampered
        }),
        (error) => error instanceof StaticSunDepthToolError
            && error.code === 'static_sun_depth_production_guard_mismatch'
    );
});

test('final production receipt accepts an authenticated promoted textureGrad v3 field', () => {
    const receipt = makeRawFixture().receipt;
    const method =
        'headless-blender-full-lattice-candidates-three-r183-native-texture-grad-v3';
    const schema = 'ai531-production-alpha-cutout-native-field-receipt-v3';
    Object.assign(receipt.compilerDescriptor.nativeCutoutField, {method, schema});
    Object.assign(receipt.alphaCertification.nativeCutoutField, {method, schema});
    const signature = digest(new TextEncoder().encode(
        canonicalJsonStringify(receipt.compilerDescriptor)
    ));
    receipt.compilerSignatureSha256 = signature;
    receipt.identity.compilerSignatureSha256 = signature;
    assert.doesNotThrow(() => validateProductionStaticSunDepthReceipt(receipt));
});

test('final production receipt accepts an authenticated promoted native union v6 field', () => {
    const receipt = makeRawFixture().receipt;
    const method = 'authenticated-direct-depth24-texture-grad-hole-fill-v6';
    const schema = 'ai531-production-alpha-cutout-native-field-receipt-v6';
    Object.assign(receipt.compilerDescriptor.nativeCutoutField, {method, schema});
    Object.assign(receipt.alphaCertification.nativeCutoutField, {method, schema});
    const signature = digest(new TextEncoder().encode(
        canonicalJsonStringify(receipt.compilerDescriptor)
    ));
    receipt.compilerSignatureSha256 = signature;
    receipt.identity.compilerSignatureSha256 = signature;
    assert.doesNotThrow(() => validateProductionStaticSunDepthReceipt(receipt));
});

test('final production receipt rejects diagnostic and validation-derived native fields', () => {
    const identities = [
        [
            'ai531-production-alpha-cutout-native-field-receipt-v5',
            'authenticated-direct-depth24-texture-grad-minimum-union-v5'
        ],
        [
            'ai531-production-alpha-cutout-native-field-receipt-v7',
            'authenticated-direct-preferred-hole-fill-minus-measured-bake-only-v7'
        ],
        [
            'ai531-production-alpha-cutout-native-field-receipt-v8',
            'authenticated-minimum-union-plus-measured-exact-corrections-v8'
        ],
        [
            'ai531-production-alpha-cutout-native-field-receipt-v9',
            'authenticated-stable-direct-plus-historical-texture-grad-hole-restoration-v9'
        ],
        [
            'ai531-production-alpha-cutout-native-field-receipt-v10',
            'authenticated-stable-direct-historical-hole-restoration-minus-measured-bake-only-v10'
        ],
        [
            'ai531-production-alpha-cutout-native-field-receipt-v11',
            'authenticated-static-shadow-residual-live-depth-corrections-v11'
        ]
    ];
    for (const [schema, method] of identities) {
        const receipt = makeRawFixture().receipt;
        Object.assign(receipt.compilerDescriptor.nativeCutoutField, {method, schema});
        Object.assign(receipt.alphaCertification.nativeCutoutField, {method, schema});
        const signature = digest(new TextEncoder().encode(
            canonicalJsonStringify(receipt.compilerDescriptor)
        ));
        receipt.compilerSignatureSha256 = signature;
        receipt.identity.compilerSignatureSha256 = signature;
        assert.throws(
            () => validateProductionStaticSunDepthReceipt(receipt),
            /native cutout field identity is unsupported/u
        );
    }
});

test('production receipt rejects incomplete row-major inventory and unmeasured quantization', () => {
    const fixture = makeFixture();
    const outOfOrder = structuredClone(fixture.receipt);
    [outOfOrder.tiles[0], outOfOrder.tiles[1]] = [outOfOrder.tiles[1], outOfOrder.tiles[0]];
    assert.throws(
        () => validateProductionStaticSunDepthReceipt(outOfOrder),
        (error) => error instanceof StaticSunDepthToolError
            && error.code === 'static_sun_depth_production_tile_inventory_invalid'
    );

    const unmeasured = structuredClone(fixture.receipt);
    unmeasured.quantizationMeasurements.measurementMethod = 'calculated-only';
    assert.throws(
        () => validateProductionStaticSunDepthReceipt(unmeasured),
        (error) => error instanceof StaticSunDepthToolError
            && error.code === 'static_sun_depth_production_quantization_invalid'
    );
});

test('raw Blender production receipt validates and builds through the exact normalized adapter', () => {
    const fixture = makeRawFixture();
    const validated = validateProductionStaticSunDepthReceipt(fixture.receipt);
    const built = buildProductionStaticSunDepthArtifact(fixture);

    assert.equal(validated.schema, BLENDER_PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA);
    assert.equal(built.receipt.schema, BLENDER_PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA);
    assert.equal(built.normalizedReceipt.schema, PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA);
    assert.equal(built.descriptor.identity.cityId, 'production-city');
    assert.equal(
        built.descriptor.identity.compilerSignatureSha256,
        fixture.receipt.compilerSignatureSha256
    );
    assert.equal(built.payload.byteLength, 1878 * 1829 * 2);
    assert.equal(built.metrics.guardVerification.guardMismatchCount, 0);

    const incompleteAlpha = structuredClone(fixture.receipt);
    incompleteAlpha.alphaCertification.binaryOutputRequired = false;
    assert.throws(
        () => validateProductionStaticSunDepthReceipt(incompleteAlpha),
        (error) => error instanceof StaticSunDepthToolError
            && error.code === 'static_sun_depth_alpha_certification_failed'
    );

    for (const depthEpsilonMeters of [1e-3, 2e-3, 4e-3, 6e-3, 20e-3]) {
        const changedDepthTolerance = structuredClone(fixture.receipt);
        changedDepthTolerance.opaqueCertification.depthEpsilonMeters = depthEpsilonMeters;
        assert.throws(
            () => validateProductionStaticSunDepthReceipt(changedDepthTolerance),
            (error) => error instanceof StaticSunDepthToolError
                && error.code === 'static_sun_depth_opaque_certification_failed'
        );
    }

    const outOfReceiverDomain = structuredClone(fixture.receipt);
    outOfReceiverDomain.layout.layout.boundsLightMeters = { min: [-20, -20], max: [60, 60] };
    outOfReceiverDomain.layout.tiles[0].interiorBoundsLightMeters = {
        min: [-20, -20],
        max: [60, 60]
    };
    assert.throws(
        () => validateProductionStaticSunDepthReceipt(outOfReceiverDomain),
        (error) => error instanceof StaticSunDepthToolError
            && error.code === 'static_sun_depth_production_layout_invalid'
    );

    const inconsistentCasterDepth = structuredClone(fixture.receipt);
    inconsistentCasterDepth.layout.depth.rawCasterBoundsMinDepthMeters = -30;
    inconsistentCasterDepth.layout.depth.rawCombinedBoundsMinDepthMeters = -30;
    inconsistentCasterDepth.layout.depth.minDepthMeters = -32;
    assert.throws(
        () => validateProductionStaticSunDepthReceipt(inconsistentCasterDepth),
        (error) => error instanceof StaticSunDepthToolError
            && error.code === 'static_sun_depth_production_layout_invalid'
    );

    const uncoveredCasterDomain = structuredClone(fixture.receipt);
    uncoveredCasterDomain.layout.derivation.casterWorldBoundsMeters.min[0] = -50;
    uncoveredCasterDomain.layout.derivation.casterWorldBoundsMeters.max[0] = 50;
    assert.throws(
        () => validateProductionStaticSunDepthReceipt(uncoveredCasterDomain),
        (error) => error instanceof StaticSunDepthToolError
            && error.code === 'static_sun_depth_production_layout_invalid'
    );
});

test('production receipt boundaries reject legacy, stale-size, and swapped-axis samplers', () => {
    const rawLegacy = structuredClone(makeRawFixture().receipt);
    delete rawLegacy.request.sampling;
    delete rawLegacy.request.sourceShadowCapability;
    rawLegacy.request.bias = {constantMeters: 0.04, normalOffsetScaleMeters: 0.08};
    rawLegacy.request.pcfRadiusPixels = 1;
    rawLegacy.request.schema = 'ai531-static-sun-production-request-v1';
    assert.throws(
        () => validateProductionStaticSunDepthReceipt(rawLegacy),
        /must contain exactly/
    );

    const rawStaleSize = structuredClone(makeRawFixture().receipt);
    rawStaleSize.request.sampling.pcf.shadowMapSizeTexels = [8192, 8192];
    assert.throws(
        () => validateProductionStaticSunDepthReceipt(rawStaleSize),
        /effective Three r183 production filter/
    );

    const rawSwappedAxes = structuredClone(makeRawFixture().receipt);
    swapSamplingAxes(rawSwappedAxes.request.sampling);
    assert.throws(
        () => validateProductionStaticSunDepthReceipt(rawSwappedAxes),
        /source-map axes do not match Three r183/
    );

    const normalizedLegacy = structuredClone(makeFixture().receipt);
    normalizedLegacy.sampling = {
        bias: {
            constantMeters: 0.04,
            model: 'constant-plus-normal-offset-v1',
            normalOffsetScaleMeters: 0.08
        },
        pcf: {model: 'square-nearest-box-v1', radiusTexels: 1}
    };
    assert.throws(
        () => validateProductionStaticSunDepthReceipt(normalizedLegacy),
        /must contain exactly/
    );

    const normalizedStaleSize = structuredClone(makeFixture().receipt);
    normalizedStaleSize.sampling.pcf.shadowMapSizeTexels = [8192, 8192];
    assert.throws(
        () => validateProductionStaticSunDepthReceipt(normalizedStaleSize),
        /effective Three r183 production filter/
    );

    const normalizedSwappedAxes = structuredClone(makeFixture().receipt);
    swapSamplingAxes(normalizedSwappedAxes.sampling);
    assert.throws(
        () => validateProductionStaticSunDepthReceipt(normalizedSwappedAxes),
        /source-map axes do not match Three r183/
    );
});

test('release certification records require zero missing occluders and complete alpha/caster coverage', () => {
    const opaque = buildOpaqueOccluderCertificationRecord({
        bvhTruthSha256: HASHES.truth,
        cacheDescriptorSha256: HASHES.compiler,
        depthToleranceMeters: 0.02,
        evidenceSha256: HASHES.evidence,
        matchingSampleCount: 2000,
        maximumAbsoluteDepthErrorMeters: 0.012,
        missingOccluderCount: 0,
        sampleCount: 2000,
        unexpectedOccluderCount: 0
    });
    assert.equal(opaque.status, 'passed');

    const alphaInput = {
        alphaSemanticsSha256: HASHES.alpha,
        certifiedCasterCount: 14,
        cutoutBindingProjectionSha256: HASHES.compiler,
        evidenceSha256: HASHES.evidence,
        expectedCasterCount: 14,
        firstHitDepthSampleCount: 1000,
        firstHitDepthToleranceMeters: 0.005,
        matchingSampleCount: 4000,
        maximumAbsoluteFirstHitDepthErrorMeters: 0.001,
        mismatchCounts: {
            anisotropy: 0,
            coverage: 0,
            firstHitDepth: 0,
            forcedOpaque: 0,
            mip: 0,
            sidedness: 0,
            texture: 0,
            threshold: 0,
            uv: 0
        },
        missingOccluderCount: 0,
        parityArtifactSha256: HASHES.truth,
        sampleCount: 4000,
        samplePlanSha256: HASHES.profile,
        unexpectedOccluderCount: 0
    };
    const alpha = buildAlphaCutoutCertificationRecord(alphaInput);
    assert.equal(alpha.status, 'passed');

    const cutoutCasterIds = ['caster.alpha', 'caster.beta', 'caster.gamma'];
    const cutoutCasterIdsSha256 = createHash('sha256')
        .update(canonicalJsonStringify({
            casterIds: cutoutCasterIds,
            schema: 'ai531-production-alpha-cutout-caster-plan-v1'
        }))
        .digest('hex');
    const coverageAlphaInput = {
        ...alphaInput,
        certifiedCasterCount: 2,
        certifiedCasterIds: ['caster.alpha', 'caster.beta'],
        cutoutCasterIdsSha256,
        expectedCasterCount: 3,
        outOfCoverageCasterIds: ['caster.gamma']
    };
    const coverageAlpha = buildAlphaCutoutCoverageCertificationRecord(
        coverageAlphaInput
    );
    assert.equal(
        coverageAlpha.schema,
        'bus-sim-static-sun-depth-alpha-cutout-certification-v3'
    );
    assert.deepEqual(coverageAlpha.certifiedCasterIds, [
        'caster.alpha',
        'caster.beta'
    ]);
    assert.deepEqual(coverageAlpha.outOfCoverageCasterIds, ['caster.gamma']);
    assert.throws(
        () => buildAlphaCutoutCoverageCertificationRecord({
            ...coverageAlphaInput,
            certifiedCasterIds: ['caster.alpha', 'caster.gamma']
        }),
        /exact partition/
    );

    const casters = buildCasterExclusionCertificationRecord({
        casterInventorySha256: HASHES.caster,
        certifiedCategoryCount: 8,
        evidenceSha256: HASHES.evidence,
        exclusions: [
            {
                casterId: 'decorative-sign-non-sun-facing',
                evidenceSha256: HASHES.truth,
                reason: 'No sun-facing silhouette in the fixed profile.',
                reviewed: true,
                visualConsequence: 'No visible current/cache difference in the complete catalog.'
            },
            {
                casterId: 'sealed-underground-cap',
                evidenceSha256: HASHES.truth,
                reason: 'Fully enclosed below every receiver.',
                reviewed: true,
                visualConsequence: 'No visible or sampled shadow consequence.'
            }
        ],
        includedCasterCount: 98,
        inventoryCasterCount: 100,
        inventoryCategoryCount: 8,
        missingOccluderCount: 0
    });
    assert.equal(casters.status, 'passed');
    assert.equal(casters.exclusionCount, 2);

    assert.throws(
        () => buildOpaqueOccluderCertificationRecord({
            bvhTruthSha256: HASHES.truth,
            cacheDescriptorSha256: HASHES.compiler,
            depthToleranceMeters: 0.02,
            evidenceSha256: HASHES.evidence,
            matchingSampleCount: 1999,
            maximumAbsoluteDepthErrorMeters: 0.012,
            missingOccluderCount: 1,
            sampleCount: 2000,
            unexpectedOccluderCount: 0
        }),
        (error) => error instanceof StaticSunDepthToolError
            && error.code === 'static_sun_depth_opaque_certification_failed'
    );
    assert.throws(
        () => buildAlphaCutoutCertificationRecord({
            ...alphaInput,
            certifiedCasterCount: 13,
        }),
        (error) => error instanceof StaticSunDepthToolError
            && error.code === 'static_sun_depth_alpha_certification_failed'
    );
    assert.throws(
        () => buildCasterExclusionCertificationRecord({
            casterInventorySha256: HASHES.caster,
            certifiedCategoryCount: 8,
            evidenceSha256: HASHES.evidence,
            exclusions: [],
            includedCasterCount: 99,
            inventoryCasterCount: 100,
            inventoryCategoryCount: 8,
            missingOccluderCount: 0
        }),
        (error) => error instanceof StaticSunDepthToolError
            && error.code === 'static_sun_depth_caster_certification_failed'
    );
});

function makeRawFixture() {
    const interiorPixels = PRODUCTION_INTERIOR_PIXELS;
    const pixelCount = interiorPixels[0] * interiorPixels[1];
    const bytes = new Uint8Array(pixelCount * 2);
    for (let offset = 0; offset < bytes.byteLength; offset += 2) {
        bytes[offset] = 0;
        bytes[offset + 1] = 100;
    }
    bytes[0] = 0xff;
    bytes[1] = 0xff;
    const compilerDescriptor = {
        ai529ScriptSha256: HASHES.truth,
        archiveSha256: HASHES.archive,
        backend: 'cycles_cpu',
        blenderBuildHash: '9e2066aef7ef',
        blenderVersion: [5, 2, 1],
        cyclesDevice: 'CPU',
        executableSha256: HASHES.executable,
        fixedThreadCount: 12,
        gpuAllowed: false,
        nativeCutoutField: {
            method: 'three-r183-production-lattice-mixed-foliage-depth24-native-readback-v2',
            nativeOwnedMeshInstanceCount: 1,
            nativeOwnedMeshInstanceIdsSha256: HASHES.caster,
            producerInventorySha256: HASHES.evidence,
            schema: 'ai531-production-alpha-cutout-native-field-receipt-v2'
        },
        profileSha256: HASHES.profile,
        rendererScriptSha256: HASHES.geometry,
        schema: 'ai531-static-sun-production-compiler-v3',
        toolchainSha256: HASHES.materials
    };
    const compilerSignatureSha256 = digest(
        new TextEncoder().encode(canonicalJsonStringify(compilerDescriptor))
    );
    const decodedDepth = -10 + (100 / 65534) * 20;
    const output = {
        byteLength: bytes.byteLength,
        coordinates: [0, 0],
        encoding: 'rg8',
        occupiedPixelCount: pixelCount - 1,
        path: 'tiles/tile_0000_0000.interior.rg8',
        rowOrigin: 'min-light-y-v1',
        sha256: digest(bytes),
        tileId: 'tile_0000_0000',
        transparentPixelCount: 1,
        unguardedInterior: true
    };
    const identity = {
        alphaSemanticsSha256: HASHES.alpha,
        casterInventorySha256: HASHES.caster,
        cityId: 'production-city',
        compilerDescriptor,
        compilerSignatureSha256
    };
    return {
        interiorTiles: [{ bytes, coordinates: [0, 0], id: 'tile_0000_0000' }],
        receipt: {
            alphaCertification: {
                binaryAlphaEpsilon: 1e-6,
                binaryOutputRequired: true,
                coverageInputs: [],
                cutoutMaterialCount: 0,
                cutoutMaterialIds: [],
                exactCoverageInputCount: 0,
                forcedOpaqueMaterialVariantCount: 1,
                nativeCutoutField: {
                    cutoutCasterCount: 1,
                    cutoutCasterIdsSha256: HASHES.caster,
                    method: 'three-r183-production-lattice-mixed-foliage-depth24-native-readback-v2',
                    nativeOwnedMeshInstanceCount: 1,
                    nativeOwnedMeshInstanceIdsSha256: HASHES.caster,
                    outputProjectionSha256: HASHES.channel,
                    producerInventorySha256: HASHES.evidence,
                    receiptByteLength: 1,
                    receiptSha256: HASHES.truth,
                    schema: 'ai531-production-alpha-cutout-native-field-receipt-v2',
                    status: 'authenticated_complete_native_field',
                    tilesSha256: HASHES.geometry
                },
                occupiedRenderedPixelCount: pixelCount - 1,
                status: 'native_three_mixed_mesh_field_min_merged_with_cycles_opaque_including_mixed_foliage_verified',
                transparentRenderedPixelCount: 1
            },
            assumptions: {
                depthMaterial:
                    'cycles_opaque_including_mixed_foliage_z_pass_min_merged_with_native_three_mixed_mesh_depth24_v3',
                f32Intermediate: 'rgba_f32le_lower_left_with_depth_in_b_and_binary_occupancy_in_a_v1',
                guardGeneration: 'not_performed_outputs_are_unguarded_interiors',
                performanceUse: 'render_timings_are_intentionally_absent_and_must_be_measured_by_the_outer_acceptance_run',
                pointSun: 'one_normalized_receiver_to_sun_direction_no_angular_penumbra',
                rg8Encoding: 'linear_endpoints_0_through_65534_with_65535_empty_msb_first_v1',
                sidedness: 'authenticated-three-r183-effective-shadow-side-then-world-space-direction-filter-v1',
                spatialSampling:
                    'one_cycles_opaque_including_mixed_foliage_primary_sample_min_merged_with_one_native_three_mixed_mesh_depth24_sample_per_texel_v3'
            },
            compiler: {
                archiveSha256: HASHES.archive,
                architecture: 'x86_64',
                backend: 'cycles_cpu',
                blenderBuildHash: '9e2066aef7ef',
                blenderVersion: [5, 2, 1],
                blenderVersionString: '5.2.1 LTS',
                cyclesDevice: 'CPU',
                executableSha256: HASHES.executable,
                fixedThreadCount: 12,
                gpuAllowed: false,
                operatingSystem: 'Windows'
            },
            compilerDescriptor,
            compilerSignatureSha256,
            casterSidedness: {
                casterSidedness: {
                    model: 'three-r183-effective-shadow-side-v1',
                    preserveMaterialFlagSemantics: 'material-userdata-preserveShadowSide-or-isFoliage-v1',
                    twoSidedCasting: true
                },
                coverageModeMaterialVariantCounts: {
                    cutout: 0,
                    forced_opaque: 1,
                    opaque: 0
                },
                effectiveShadowSideMaterialVariantCounts: {
                    back: 0,
                    double: 1,
                    front: 0
                },
                schema: 'ai531-static-sun-production-caster-sidedness-receipt-v1'
            },
            configuration: {
                ai529ScriptInventory: [{ byteLength: 1, path: 'bsib.py', sha256: HASHES.truth }],
                ai529ScriptSha256: HASHES.truth,
                profileSha256: HASHES.profile,
                rendererScriptSha256: HASHES.geometry,
                requestSha256: HASHES.channel,
                toolchainSha256: HASHES.materials
            },
            identity,
            input: {
                alphaSemanticsSha256: HASHES.alpha,
                casterInventorySha256: HASHES.caster,
                channelSourceSha256: HASHES.channel,
                finalFileDomainSha256: HASHES.compiler,
                geometrySha256: HASHES.geometry,
                packageRawSha256: HASHES.executable,
                resolvedSourceSha256: HASHES.resolved,
                usedMaterialsSha256: HASHES.materials
            },
            layout: {
                basis: {
                    depthAxisWorld: [0, -1, 0],
                    originWorld: [0, 0, 0],
                    policy: 'least-aligned-world-axis-v1',
                    rightAxisWorld: [0, 0, -1],
                    upAxisWorld: [1, 0, 0]
                },
                depth: {
                    maxDepthMeters: 10,
                    minDepthMeters: -10,
                    rawCasterBoundsMaxDepthMeters: 8,
                    rawCasterBoundsMinDepthMeters: -8,
                    rawCombinedBoundsMaxDepthMeters: 8,
                    rawCombinedBoundsMinDepthMeters: -8,
                    rawReceiverMapBoundsMaxDepthMeters: 8,
                    rawReceiverMapBoundsMinDepthMeters: -8
                },
                derivation: {
                    boundsInput: 'reconstructed_static_sun_object_bounds_plus_verified_source_map_receiver_footprint_v1',
                    boundsMarginMeters: 2,
                    casterCornerCount: 8,
                    casterWorldBoundsMeters: { min: [-20, -8, -20], max: [20, 8, 20] },
                    centering: 'minimum_whole_tiles_then_nearest_valid_absolute_texel_edge_v2',
                    cornerCount: 16,
                    phaseAlignment: {
                        absoluteBoundsMinimumTexelIndices: [-935, -911],
                        absoluteOriginProjectionMeters: [0, 0],
                        maximumEdgePhaseErrorTexels: 0,
                        policy: 'absolute-stable-basis-texel-edge-lattice-v1',
                        texelSizeMeters: PRODUCTION_TEXEL_SIZE_METERS
                    },
                    receiverMapCornerCount: 8,
                    receiverMapWorldBoundsMeters: {
                        min: [-35.5, -8, -35.5],
                        max: [35.5, 8, 35.5]
                    },
                    sourceMap: {
                        edgePolicy: 'origin_is_first_tile_center_expand_half_tile_v1',
                        heightTiles: 71,
                        originWorld: [-35, 0, -35],
                        tileSizeMeters: 1,
                        widthTiles: 71
                    }
                },
                layout: {
                    boundsLightMeters: {
                        min: [
                            -935 * PRODUCTION_TEXEL_SIZE_METERS,
                            -911 * PRODUCTION_TEXEL_SIZE_METERS
                        ],
                        max: [
                            935 * PRODUCTION_TEXEL_SIZE_METERS,
                            910 * PRODUCTION_TEXEL_SIZE_METERS
                        ]
                    },
                    finalGuardedPayloadBytes: 1878 * 1829 * 2,
                    guardPixels: 4,
                    interiorPixels,
                    layerCount: 1,
                    order: 'row-major-y-then-x-v1',
                    storedPixels: [1878, 1829],
                    texelSizeMeters: PRODUCTION_TEXEL_SIZE_METERS,
                    tileCount: [1, 1],
                    tileSizeMeters: PRODUCTION_TILE_SIZE_METERS
                },
                sunPointDirectionWorld: [0, 1, 0],
                tiles: [{
                    coordinates: [0, 0],
                    id: 'tile_0000_0000',
                    interiorBoundsLightMeters: {
                        min: [
                            -935 * PRODUCTION_TEXEL_SIZE_METERS,
                            -911 * PRODUCTION_TEXEL_SIZE_METERS
                        ],
                        max: [
                            935 * PRODUCTION_TEXEL_SIZE_METERS,
                            910 * PRODUCTION_TEXEL_SIZE_METERS
                        ]
                    }
                }]
            },
            opaqueCertification: {
                algorithm: 'blender_bvhtree_direction_filtered_primary_ray_v3',
                cutoutFirstHitExcludedSampleCount: 0,
                depthEpsilonMeters: 5e-3,
                depthMismatchCount: 0,
                directionalGeometryFilter: {
                    algorithm: 'world_space_direction_filtered_mesh_faces_v1',
                    filteredObjectCount: 1,
                    removedPolygonCount: 1,
                    sourcePolygonCount: 2,
                    unchangedObjectCount: 0,
                    visiblePolygonCount: 1
                },
                eligibleSampleCount: 128,
                maximumDepthErrorMeters: 0,
                occupancyMismatchCount: 0,
                opaqueAndForcedOpaquePolygonCount: 1,
                sampleCount: 128,
                samplePlan: '32_by_32_stratified_grid_plus_lcg_seed_531_to_2048_unique_texels',
                status: 'verified'
            },
            outputs: [output],
            profile: {
                applied: {
                    alphaCutoutPolicy: 'compile_exact_coverage_threshold_to_silhouette_geometry',
                    bakeTarget: 'IMAGE_TEXTURES',
                    colorManagement: 'scene_linear_raw_no_display_transform',
                    cyclesDevice: 'CPU',
                    depthPrecision: 'rgba_float32_openexr_and_canonical_f32le',
                    depthSampling: 'orthographic_nearest_visible_surface',
                    dof: false,
                    motionBlur: false,
                    profileId: 'ai531.production.fixed_sun.v1',
                    samplingPattern: 'SOBOL_BURLEY',
                    threadCount: 12,
                    uvOrigin: 'lower_left',
                    world: 'explicit_profile_linear_color_and_strength'
                },
                id: 'ai531.production.fixed_sun.v1',
                productionOverrides: {
                    cameraClipEndMeters: 20.2,
                    cameraClipStartMeters: 0.05,
                    cameraOriginDepthMeters: -10.1,
                    cyclesDevice: 'CPU',
                    depthReadback: 'cycles_z_pass_composited_to_rgb_with_render_alpha_v1',
                    gpuAllowed: false,
                    persistentData: true,
                    primaryRaySamples: 1,
                    rowStripPixels: 1821
                },
                rawSha256: HASHES.profile
            },
            quantizationMeasurements: {
                emptyTexelCount: 1,
                encodedCodeMaximum: 100,
                encodedCodeMinimum: 100,
                maximumAbsoluteErrorMeters: 0,
                meanAbsoluteErrorMeters: 0,
                measurementMethod: 'blender-canonical-depth-before-rg8-quantization-v1',
                occupiedTexelCount: pixelCount - 1,
                sourceDepthMaximumMeters: decodedDepth,
                sourceDepthMinimumMeters: decodedDepth
            },
            reconstruction: {
                channelId: 'static_sun_depth',
                collection: 'AI529_Reconstructed',
                completeSelectedChannel: true,
                geometryDatablockCount: 1,
                instanceObjectCount: 1,
                inventory: {
                    bufferCount: 1,
                    casterMappingCount: 1,
                    channelIds: ['static_sun_depth'],
                    geometryCount: 1,
                    instanceCount: 1,
                    materialCount: 1,
                    objectCount: 1,
                    receiverMappingCount: 1,
                    semanticBufferDigestsVerified: true,
                    textureCount: 0
                },
                mode: 'full_static_sun_depth',
                normalConversionChecks: 1,
                selectedMappingCount: 1,
                stableIdOrdering: 'canonical_ascending',
                stableIdsPreservedAsCustomMetadata: true,
                textureSourceCount: 0,
                uvIdentityChecks: 1
            },
            request: {
                boundsMarginMeters: 2,
                casterSidedness: {
                    model: 'three-r183-effective-shadow-side-v1',
                    preserveMaterialFlagSemantics: 'material-userdata-preserveShadowSide-or-isFoliage-v1',
                    twoSidedCasting: true
                },
                guardPixels: 4,
                interiorPixels,
                lightingProfileId: 'ai531.production.fixed_sun.v1',
                maxPayloadBytes: 512 * 1024 * 1024,
                phasePolicy: 'absolute-stable-basis-texel-edge-lattice-v1',
                sampling: makeProductionSampling([0, 1, 0]),
                schema: 'ai531-static-sun-production-request-v4',
                sourceShadowCapability: makeSourceShadowCapability(),
                sunPointDirectionWorld: [0, 1, 0],
                texelSizeMeters: PRODUCTION_TEXEL_SIZE_METERS,
                tileSizeMeters: PRODUCTION_TILE_SIZE_METERS
            },
            schema: BLENDER_PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA,
            status: 'complete'
        }
    };
}

function makeFixture() {
    const interiorTiles = [];
    const receiptTiles = [];
    for (let tileY = 0; tileY < 2; tileY += 1) {
        for (let tileX = 0; tileX < 2; tileX += 1) {
            const id = tileId(tileX, tileY);
            const bytes = new Uint8Array(4 * 4 * 2);
            for (let localY = 0; localY < 4; localY += 1) {
                for (let localX = 0; localX < 4; localX += 1) {
                    const globalX = tileX * 4 + localX;
                    const globalY = tileY * 4 + localY;
                    const code = codeAt(globalX, globalY);
                    const offset = (localY * 4 + localX) * 2;
                    bytes[offset] = code >>> 8;
                    bytes[offset + 1] = code & 0xff;
                }
            }
            interiorTiles.push({ bytes, coordinates: [tileX, tileY], id });
            receiptTiles.push({
                coordinates: [tileX, tileY],
                id,
                interiorByteLength: bytes.byteLength,
                interiorSha256: digest(bytes)
            });
        }
    }
    return {
        interiorTiles,
        receipt: {
            artifactClass: 'production',
            channel: {
                boundsLightMeters: {
                    min: [0, 0],
                    max: [
                        8 * PRODUCTION_TEXEL_SIZE_METERS,
                        8 * PRODUCTION_TEXEL_SIZE_METERS
                    ]
                },
                guardPolicy: 'copy-adjacent-clamp-exterior-v1',
                guardTexels: 4,
                interiorTexels: [4, 4],
                maxDepthMeters: 10,
                minDepthMeters: -10,
                order: 'row-major-y-then-x-v1',
                originWorld: [0, 0, 0],
                rowOrigin: 'min-light-y-v1',
                sunPointDirectionWorld: [0, 1, 0],
                texelSizeMeters: PRODUCTION_TEXEL_SIZE_METERS,
                tileCount: [2, 2]
            },
            compiler: {
                archiveSha256: HASHES.archive,
                architecture: 'x86_64',
                backend: 'cycles_cpu',
                buildHash: '9e2066aef7ef',
                buildPlatform: 'Windows',
                executableSha256: HASHES.executable,
                signatureSha256: HASHES.compiler,
                threadCount: 12,
                version: [5, 2, 1],
                versionString: '5.2.1 LTS'
            },
            productionEligible: true,
            profile: { id: 'ai531.production.fixed_sun.v1', sha256: HASHES.profile },
            quantizationMeasurements: {
                emptyTexelCount: 1,
                encodedCodeMaximum: codeAt(7, 7),
                encodedCodeMinimum: codeAt(1, 0),
                maximumAbsoluteErrorMeters: 0.0001,
                meanAbsoluteErrorMeters: 0.00005,
                measurementMethod: 'blender-canonical-depth-before-rg8-quantization-v1',
                occupiedTexelCount: 63,
                sourceDepthMaximumMeters: 9.75,
                sourceDepthMinimumMeters: -9.75
            },
            sampling: makeProductionSampling([0, 1, 0]),
            schema: PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA,
            source: {
                alphaSemanticsSha256: HASHES.alpha,
                casterInventorySha256: HASHES.caster,
                channelSourceSha256: HASHES.channel,
                cityId: 'production-city',
                geometrySha256: HASHES.geometry,
                resolvedSourceSha256: HASHES.resolved,
                usedMaterialsSha256: HASHES.materials
            },
            status: 'complete',
            tiles: receiptTiles
        }
    };
}

function makeProductionSampling(sunPointDirectionWorld) {
    const axes = createThreeR183DirectionalShadowFilterAxes(
        sunPointDirectionWorld
    );
    return {
        bias: {
            constantDepthReliefMeters: 0.0697915,
            geometricNormalOffsetMeters: 0.0232,
            model: 'geometric-normal-offset-plus-constant-depth-relief-v1'
        },
        pcf: {
            hardwareComparison: 'linear-four-compare-taps-v1',
            model: 'three-r183-vogel-5-linear-compare-v1',
            radiusTexels: 1.5,
            sampleCount: 5,
            screenRotation: 'interleaved-gradient-noise-gl-fragcoord-v1',
            shadowMapSizeTexels: [16384, 16384],
            shadowMapWorldExtentMeters: [680, 680],
            sourceMapRightAxisWorld: axes.rightAxisWorld,
            sourceMapUpAxisWorld: axes.upAxisWorld
        }
    };
}

function makeSourceShadowCapability() {
    return {
        id: 'three-r183-single-high-effective-16384-v1',
        mapSizeTexels: [16384, 16384],
        worldExtentMeters: [680, 680]
    };
}

function swapSamplingAxes(sampling) {
    const right = sampling.pcf.sourceMapRightAxisWorld;
    sampling.pcf.sourceMapRightAxisWorld = sampling.pcf.sourceMapUpAxisWorld;
    sampling.pcf.sourceMapUpAxisWorld = right;
}

function codeAt(globalX, globalY) {
    if (globalX === 0 && globalY === 0) return 65535;
    return 100 + globalY * 8 + globalX;
}

function readCode(payload, layerIndex, storedWidth, x, y) {
    const layerBytes = storedWidth * storedWidth * 2;
    const offset = layerIndex * layerBytes + (y * storedWidth + x) * 2;
    return payload[offset] * 256 + payload[offset + 1];
}

function tileId(x, y) {
    return `tile_${String(x).padStart(4, '0')}_${String(y).padStart(4, '0')}`;
}

function digest(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}
