// Builds strict production AI 531 texture-array artifacts and release certification records.
// @ts-check

import { createHash } from 'node:crypto';
import {
    assertStableId,
    canonicalJsonStringify,
    cloneCanonicalJson,
    compareCanonicalStrings
} from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    STATIC_SUN_DEPTH_CHANNEL_ID,
    STATIC_SUN_DEPTH_CHANNEL_VERSION,
    STATIC_SUN_DEPTH_TILE_SET_SCHEMA,
    createStableStaticSunDepthBasis,
    createThreeR183DirectionalShadowFilterAxes,
    validateStaticSunDepthTileSetDescriptor
} from '../../../src/app/illumination/static_sun_depth/StaticSunDepthContract.js';
import {
    STATIC_SUN_DEPTH_DIAGNOSTIC_EMPTY_ALPHA,
    STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID,
    STATIC_SUN_DEPTH_DIAGNOSTIC_MAX_QUANTIZED,
    STATIC_SUN_DEPTH_DIAGNOSTIC_OCCUPIED_ALPHA,
    STATIC_SUN_DEPTH_EMPTY_QUANTIZED,
    STATIC_SUN_DEPTH_ENCODING_ID,
    STATIC_SUN_DEPTH_MAX_QUANTIZED
} from '../../../src/app/illumination/static_sun_depth/StaticSunDepthEncoding.js';
import {
    ILLUMINATION_MAX_CHUNK_BYTES,
    ILLUMINATION_MAX_PACKAGE_BYTES
} from '../../../src/app/illumination/package/IlluminationPackageConstants.js';
import { failStaticSunDepth } from './StaticSunDepthToolError.mjs';
import {
    requireStaticSunDepthCasterSidedness
} from '../../../src/graphics/lighting/EffectiveShadowSide.js';
import {
    PRODUCTION_ALPHA_CUTOUT_FIRST_HIT_DEPTH_TOLERANCE_METERS,
    PRODUCTION_ALPHA_CUTOUT_MISMATCH_KEYS,
    validateProductionAlphaCutoutSpatialParityArtifact
} from './ProductionAlphaCutoutParity.mjs';

export const PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA =
    'bus-sim-static-sun-depth-production-blender-receipt-v4';
export const BLENDER_PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA =
    'ai531-static-sun-production-render-receipt-v4';
export const BLENDER_PRODUCTION_DEPTH_DIAGNOSTIC_RECEIPT_SCHEMA =
    'ai531-static-sun-depth-precision-diagnostic-receipt-v1';
export const PRODUCTION_STATIC_SUN_DEPTH_ARTIFACT_SCHEMA =
    'bus-sim-static-sun-depth-production-artifact-v1';
export const PRODUCTION_STATIC_SUN_DEPTH_METRICS_SCHEMA =
    'bus-sim-static-sun-depth-production-metrics-v1';
export const PRODUCTION_DEPTH_DIAGNOSTIC_ARTIFACT_SCHEMA =
    'bus-sim-static-sun-depth-precision-diagnostic-artifact-v1';
export const PRODUCTION_DEPTH_DIAGNOSTIC_METRICS_SCHEMA =
    'bus-sim-static-sun-depth-precision-diagnostic-metrics-v1';
export const STATIC_SUN_DEPTH_OPAQUE_CERTIFICATION_SCHEMA =
    'bus-sim-static-sun-depth-opaque-certification-v1';
export const STATIC_SUN_DEPTH_ALPHA_CERTIFICATION_SCHEMA =
    'bus-sim-static-sun-depth-alpha-cutout-certification-v2';
export const STATIC_SUN_DEPTH_CASTER_CERTIFICATION_SCHEMA =
    'bus-sim-static-sun-depth-caster-exclusion-certification-v1';
export const PRODUCTION_OPAQUE_BVH_DEPTH_EPSILON_METERS = 5e-3;

const ARTIFACT_CONTENT_SCHEMA = 'bus-sim-static-sun-depth-production-content-v1';
const ARTIFACT_CONTENT_DOMAIN = 'bus-simulator/static-sun-depth/production-content/v1';
const DIAGNOSTIC_ARTIFACT_CONTENT_SCHEMA =
    'bus-sim-static-sun-depth-precision-diagnostic-content-v1';
const DIAGNOSTIC_ARTIFACT_CONTENT_DOMAIN =
    'bus-simulator/static-sun-depth/precision-diagnostic-content/v1';
const FIXED_GUARD_TEXELS = 4;
const MAX_PRODUCTION_ARRAY_LAYERS = 256;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const BOUNDS_TOLERANCE = 1e-9;
const FILTER_AXIS_TOLERANCE = 1e-9;
const PRODUCTION_REQUEST_SCHEMA = 'ai531-static-sun-production-request-v4';
const PRODUCTION_TEXEL_SIZE_METERS = 680 / 16384;
const PRODUCTION_INTERIOR_PIXELS = Object.freeze([1870, 1821]);
const PRODUCTION_TILE_SIZE_METERS = Object.freeze([
    PRODUCTION_INTERIOR_PIXELS[0] * PRODUCTION_TEXEL_SIZE_METERS,
    PRODUCTION_INTERIOR_PIXELS[1] * PRODUCTION_TEXEL_SIZE_METERS
]);
const PRODUCTION_PHASE_POLICY =
    'absolute-stable-basis-texel-edge-lattice-v1';
const PRODUCTION_SOURCE_SHADOW_CAPABILITY = Object.freeze({
    id: 'three-r183-single-high-effective-16384-v1',
    mapSizeTexels: Object.freeze([16384, 16384]),
    worldExtentMeters: Object.freeze([680, 680])
});
const PRODUCTION_FILTER_WORLD_RADIUS_METERS = 0.062255859375;
const DEPTH_DIAGNOSTIC_LIGHTING_PROFILE_ID = 'ai527.sun.az135.el08';
const PRODUCTION_ENCODING_CONTRACT = Object.freeze({
    artifactClass: 'production',
    artifactSchema: PRODUCTION_STATIC_SUN_DEPTH_ARTIFACT_SCHEMA,
    bytesPerTexel: 2,
    diagnostic: false,
    contentDomain: ARTIFACT_CONTENT_DOMAIN,
    contentSchema: ARTIFACT_CONTENT_SCHEMA,
    maxQuantized: STATIC_SUN_DEPTH_MAX_QUANTIZED,
    measurementMethod: 'blender-canonical-depth-before-rg8-quantization-v1',
    metricsSchema: PRODUCTION_STATIC_SUN_DEPTH_METRICS_SCHEMA,
    outputEncoding: 'rg8',
    outputSuffix: 'rg8',
    payloadEncoding: 'rg8-unorm-two-byte-depth-v1',
    productionEligible: true,
    rawReceiptSchema: BLENDER_PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA,
    receiptManifestSchema: PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA
});
const DIAGNOSTIC_ENCODING_CONTRACT = Object.freeze({
    artifactClass: 'diagnostic',
    artifactSchema: PRODUCTION_DEPTH_DIAGNOSTIC_ARTIFACT_SCHEMA,
    bytesPerTexel: 4,
    diagnostic: true,
    contentDomain: DIAGNOSTIC_ARTIFACT_CONTENT_DOMAIN,
    contentSchema: DIAGNOSTIC_ARTIFACT_CONTENT_SCHEMA,
    maxQuantized: STATIC_SUN_DEPTH_DIAGNOSTIC_MAX_QUANTIZED,
    measurementMethod: 'blender-canonical-depth-before-rgb24-quantization-v1',
    metricsSchema: PRODUCTION_DEPTH_DIAGNOSTIC_METRICS_SCHEMA,
    outputEncoding: 'rgba8_rgb24a',
    outputSuffix: 'rgba8',
    payloadEncoding: 'rgba8-rgb24-depth-alpha-occupancy-v1',
    productionEligible: false,
    rawReceiptSchema: BLENDER_PRODUCTION_DEPTH_DIAGNOSTIC_RECEIPT_SCHEMA,
    receiptManifestSchema: BLENDER_PRODUCTION_DEPTH_DIAGNOSTIC_RECEIPT_SCHEMA
});

/**
 * Validates and owns a complete production Blender receipt.
 * @param {unknown} value
 */
export function validateProductionStaticSunDepthReceipt(value) {
    const receipt = /** @type {Record<string, any>} */ (cloneCanonicalJson(value));
    if (receipt.schema === BLENDER_PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA
        || receipt.schema === BLENDER_PRODUCTION_DEPTH_DIAGNOSTIC_RECEIPT_SCHEMA) {
        validateRawBlenderReceipt(receipt, encodingContractForReceipt(receipt));
        return receipt;
    }
    requireExactKeys(receipt, [
        'artifactClass',
        'channel',
        'compiler',
        'productionEligible',
        'profile',
        'quantizationMeasurements',
        'sampling',
        'schema',
        'source',
        'status',
        'tiles'
    ], 'production receipt');
    if (receipt.schema !== PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA
        || receipt.artifactClass !== 'production'
        || receipt.productionEligible !== true
        || receipt.status !== 'complete') {
        failStaticSunDepth(
            'static_sun_depth_production_receipt_invalid',
            'Static-sun production receipt must be complete and explicitly production eligible.',
            {}
        );
    }
    validateCompiler(receipt.compiler);
    validateSource(receipt.source);
    validateProfile(receipt.profile);
    validateChannel(receipt.channel);
    validateSampling(receipt.sampling, receipt.channel);
    validateReceiptTiles(receipt.tiles, receipt.channel);
    validateQuantizationMeasurements(
        receipt.quantizationMeasurements,
        receipt.channel,
        PRODUCTION_ENCODING_CONTRACT
    );
    return receipt;
}

/**
 * Builds a runtime-valid descriptor and one row-major RG8 array payload.
 * @param {{receipt: unknown, interiorTiles: readonly unknown[]}} options
 */
export function buildProductionStaticSunDepthArtifact(options) {
    return buildStaticSunDepthArtifact(options, PRODUCTION_ENCODING_CONTRACT);
}

export function buildProductionDepthDiagnosticArtifact(options) {
    return buildStaticSunDepthArtifact(options, DIAGNOSTIC_ENCODING_CONTRACT);
}

function buildStaticSunDepthArtifact(options, contract) {
    requireExactKeys(options, ['interiorTiles', 'receipt'], 'production artifact options');
    const sourceReceipt = validateProductionStaticSunDepthReceipt(options.receipt);
    if (contract.diagnostic
        ? sourceReceipt.schema !== BLENDER_PRODUCTION_DEPTH_DIAGNOSTIC_RECEIPT_SCHEMA
        : sourceReceipt.schema === BLENDER_PRODUCTION_DEPTH_DIAGNOSTIC_RECEIPT_SCHEMA) {
        throw new Error(
            contract.diagnostic
                ? 'Depth diagnostic artifact requires the diagnostic Blender receipt schema'
                : 'Production artifact rejects diagnostic Blender receipts'
        );
    }
    const receipt = sourceReceipt.schema === contract.rawReceiptSchema
        ? normalizeRawBlenderReceipt(sourceReceipt, contract)
        : sourceReceipt;
    const interiors = validateInteriorTiles(options.interiorTiles, receipt);
    const interiorStatistics = measureEncodedInteriors(interiors, contract);
    requireMeasuredStatisticsMatch(interiorStatistics, receipt.quantizationMeasurements);

    const payload = deriveArrayPayload(interiors, receipt.channel, contract);
    const layers = createLayerDescriptors(payload, receipt.channel, contract);
    const descriptor = createDescriptor(receipt, layers, contract);
    const guardVerification = validateStaticSunDepthArrayPayload(
        { descriptor, payload },
        contract
    );
    const metrics = createProductionMetrics(
        receipt,
        payload.byteLength,
        guardVerification,
        contract
    );
    const descriptorCanonicalJson = canonicalJsonStringify(descriptor);
    const descriptorBytes = utf8Bytes(descriptorCanonicalJson);
    const receiptCanonicalJson = canonicalJsonStringify(sourceReceipt);
    const receiptBytes = utf8Bytes(receiptCanonicalJson);
    const payloadDescriptor = cloneCanonicalJson({
        byteLength: payload.byteLength,
        encoding: contract.payloadEncoding,
        layerByteLength: layers[0].byteLength,
        layerCount: layers.length,
        layout: 'contiguous-row-major-texture-array-layers-v1',
        rowOrigin: 'min-light-y-v1',
        sha256: rawSha256(payload)
    });
    const descriptorFile = cloneCanonicalJson({
        byteLength: descriptorBytes.byteLength,
        schema: STATIC_SUN_DEPTH_TILE_SET_SCHEMA,
        sha256: rawSha256(descriptorBytes)
    });
    const receiptFile = cloneCanonicalJson({
        byteLength: receiptBytes.byteLength,
        compilerSignatureSha256: receipt.compiler.signatureSha256,
        schema: contract.receiptManifestSchema,
        sha256: rawSha256(receiptBytes)
    });
    const content = cloneCanonicalJson({
        descriptor: descriptorFile,
        layers,
        metrics,
        payload: payloadDescriptor,
        receipt: receiptFile,
        schema: contract.contentSchema
    });
    const artifactManifest = cloneCanonicalJson({
        artifactClass: contract.artifactClass,
        contentSha256: domainSeparatedCanonicalSha256(contract.contentDomain, content),
        descriptor: descriptorFile,
        layers,
        metrics,
        payload: payloadDescriptor,
        productionEligible: contract.productionEligible,
        receipt: receiptFile,
        schema: contract.artifactSchema
    });
    return Object.freeze({
        artifactManifest,
        artifactManifestCanonicalJson: canonicalJsonStringify(artifactManifest),
        descriptor,
        descriptorCanonicalJson,
        metrics,
        payload,
        normalizedReceipt: receipt,
        receipt: sourceReceipt
    });
}

/**
 * Verifies every internal, exterior, and corner guard plus every layer digest.
 * @param {{descriptor: unknown, payload: Uint8Array}} options
 */
export function validateProductionStaticSunDepthArrayPayload(options) {
    return validateStaticSunDepthArrayPayload(
        options,
        PRODUCTION_ENCODING_CONTRACT
    );
}

export function validateProductionDepthDiagnosticArrayPayload(options) {
    return validateStaticSunDepthArrayPayload(
        options,
        DIAGNOSTIC_ENCODING_CONTRACT
    );
}

function validateStaticSunDepthArrayPayload(options, contract) {
    requireExactKeys(options, ['descriptor', 'payload'], 'array payload validation options');
    const descriptor = validateStaticSunDepthTileSetDescriptor(options.descriptor);
    const expectedEncodingId = contract.diagnostic
        ? STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID
        : STATIC_SUN_DEPTH_ENCODING_ID;
    if (descriptor.identity.encoding.id !== expectedEncodingId) {
        throw new Error(`Static-sun array payload encoding must be '${expectedEncodingId}'`);
    }
    const payload = options.payload;
    if (!(payload instanceof Uint8Array)) throw new TypeError('payload must be a Uint8Array');
    const layout = descriptor.identity.layout;
    if (layout.guardTexels !== FIXED_GUARD_TEXELS) {
        failStaticSunDepth(
            'static_sun_depth_production_guard_policy_invalid',
            'Production V1 requires exactly four guard texels.',
            { actual: layout.guardTexels, expected: FIXED_GUARD_TEXELS }
        );
    }
    const interiorWidth = layout.interiorTexels[0];
    const interiorHeight = layout.interiorTexels[1];
    const storedWidth = interiorWidth + FIXED_GUARD_TEXELS * 2;
    const storedHeight = interiorHeight + FIXED_GUARD_TEXELS * 2;
    const layerByteLength = storedWidth * storedHeight
        * contract.bytesPerTexel;
    const expectedByteLength = layerByteLength * descriptor.tiles.length;
    if (!Number.isSafeInteger(expectedByteLength) || payload.byteLength !== expectedByteLength) {
        failStaticSunDepth(
            'static_sun_depth_production_payload_size_mismatch',
            'Production array payload does not match the complete descriptor dimensions.',
            { actual: payload.byteLength, expected: expectedByteLength }
        );
    }

    let comparedGuardTexelCount = 0;
    let exteriorGuardMismatchCount = 0;
    let exteriorGuardTexelCount = 0;
    let internalGuardTexelCount = 0;
    let seamMismatchCount = 0;
    let firstMismatch = null;
    for (let tileIndex = 0; tileIndex < descriptor.tiles.length; tileIndex += 1) {
        const tileX = tileIndex % layout.tileCount[0];
        const tileY = Math.floor(tileIndex / layout.tileCount[0]);
        for (let storedY = 0; storedY < storedHeight; storedY += 1) {
            for (let storedX = 0; storedX < storedWidth; storedX += 1) {
                if (isInterior(storedX, storedY, interiorWidth, interiorHeight)) continue;
                const globalX = tileX * interiorWidth + storedX - FIXED_GUARD_TEXELS;
                const globalY = tileY * interiorHeight + storedY - FIXED_GUARD_TEXELS;
                const exterior = globalX < 0
                    || globalY < 0
                    || globalX >= layout.tileCount[0] * interiorWidth
                    || globalY >= layout.tileCount[1] * interiorHeight;
                const source = resolveInteriorSource(
                    globalX,
                    globalY,
                    layout.tileCount,
                    interiorWidth,
                    interiorHeight
                );
                const actualOffset = tileIndex * layerByteLength
                    + (storedY * storedWidth + storedX)
                        * contract.bytesPerTexel;
                const expectedOffset = source.layerIndex * layerByteLength
                    + ((source.localY + FIXED_GUARD_TEXELS) * storedWidth
                        + source.localX + FIXED_GUARD_TEXELS)
                        * contract.bytesPerTexel;
                let mismatch = false;
                for (let byteIndex = 0;
                    byteIndex < contract.bytesPerTexel;
                    byteIndex += 1) {
                    mismatch ||= payload[actualOffset + byteIndex]
                        !== payload[expectedOffset + byteIndex];
                }
                comparedGuardTexelCount += 1;
                if (exterior) exteriorGuardTexelCount += 1;
                else internalGuardTexelCount += 1;
                if (mismatch) {
                    if (exterior) exteriorGuardMismatchCount += 1;
                    else seamMismatchCount += 1;
                    firstMismatch ??= { storedX, storedY, tileX, tileY };
                }
            }
        }
    }
    const guardMismatchCount = exteriorGuardMismatchCount + seamMismatchCount;
    if (guardMismatchCount !== 0) {
        failStaticSunDepth(
            'static_sun_depth_production_guard_mismatch',
            'Production payload contains a seam, exterior, or corner guard mismatch.',
            {
                exteriorGuardMismatchCount,
                firstMismatch,
                guardMismatchCount,
                seamMismatchCount
            }
        );
    }
    for (let layerIndex = 0; layerIndex < descriptor.tiles.length; layerIndex += 1) {
        const bytes = payload.subarray(layerIndex * layerByteLength, (layerIndex + 1) * layerByteLength);
        const actualSha256 = rawSha256(bytes);
        if (actualSha256 !== descriptor.tiles[layerIndex].contentSha256) {
            failStaticSunDepth(
                'static_sun_depth_production_layer_hash_mismatch',
                'Production payload layer differs from its descriptor digest.',
                {
                    actualSha256,
                    expectedSha256: descriptor.tiles[layerIndex].contentSha256,
                    layerIndex
                }
            );
        }
    }
    return cloneCanonicalJson({
        comparedGuardTexelCount,
        exteriorGuardMismatchCount,
        exteriorGuardTexelCount,
        guardMismatchCount,
        internalGuardTexelCount,
        policy: 'copy-adjacent-clamp-exterior-v1',
        seamMismatchCount,
        status: 'passed'
    });
}

/** @param {unknown} value */
export function buildOpaqueOccluderCertificationRecord(value) {
    const input = /** @type {Record<string, any>} */ (cloneCanonicalJson(value));
    requireExactKeys(input, [
        'bvhTruthSha256',
        'cacheDescriptorSha256',
        'depthToleranceMeters',
        'evidenceSha256',
        'matchingSampleCount',
        'maximumAbsoluteDepthErrorMeters',
        'missingOccluderCount',
        'sampleCount',
        'unexpectedOccluderCount'
    ], 'opaque certification input');
    for (const key of ['bvhTruthSha256', 'cacheDescriptorSha256', 'evidenceSha256']) {
        requireSha256(input[key], `opaque certification.${key}`);
    }
    requirePositiveInteger(input.sampleCount, 'opaque certification.sampleCount');
    for (const key of ['matchingSampleCount', 'missingOccluderCount', 'unexpectedOccluderCount']) {
        requireNonNegativeInteger(input[key], `opaque certification.${key}`);
    }
    requireNonNegativeFinite(input.depthToleranceMeters, 'opaque certification.depthToleranceMeters');
    requireNonNegativeFinite(
        input.maximumAbsoluteDepthErrorMeters,
        'opaque certification.maximumAbsoluteDepthErrorMeters'
    );
    if (input.matchingSampleCount !== input.sampleCount
        || input.missingOccluderCount !== 0
        || input.unexpectedOccluderCount !== 0
        || input.maximumAbsoluteDepthErrorMeters > input.depthToleranceMeters) {
        failStaticSunDepth(
            'static_sun_depth_opaque_certification_failed',
            'Opaque BVH certification requires complete agreement, zero missing occluders, and bounded depth error.',
            {
                matchingSampleCount: input.matchingSampleCount,
                missingOccluderCount: input.missingOccluderCount,
                sampleCount: input.sampleCount,
                unexpectedOccluderCount: input.unexpectedOccluderCount
            }
        );
    }
    return cloneCanonicalJson({
        ...input,
        method: 'deterministic-opaque-bvh-ray-v1',
        schema: STATIC_SUN_DEPTH_OPAQUE_CERTIFICATION_SCHEMA,
        status: 'passed'
    });
}

/** @param {unknown} value */
export function buildAlphaCutoutCertificationRecord(value) {
    const input = /** @type {Record<string, any>} */ (cloneCanonicalJson(value));
    requireExactKeys(input, [
        'alphaSemanticsSha256',
        'certifiedCasterCount',
        'cutoutBindingProjectionSha256',
        'evidenceSha256',
        'expectedCasterCount',
        'firstHitDepthSampleCount',
        'firstHitDepthToleranceMeters',
        'matchingSampleCount',
        'maximumAbsoluteFirstHitDepthErrorMeters',
        'mismatchCounts',
        'missingOccluderCount',
        'parityArtifactSha256',
        'sampleCount',
        'samplePlanSha256',
        'unexpectedOccluderCount'
    ], 'alpha certification input');
    requireSha256(input.alphaSemanticsSha256, 'alpha certification.alphaSemanticsSha256');
    requireSha256(
        input.cutoutBindingProjectionSha256,
        'alpha certification.cutoutBindingProjectionSha256'
    );
    requireSha256(input.evidenceSha256, 'alpha certification.evidenceSha256');
    requireSha256(input.parityArtifactSha256, 'alpha certification.parityArtifactSha256');
    requireSha256(input.samplePlanSha256, 'alpha certification.samplePlanSha256');
    requirePositiveInteger(input.expectedCasterCount, 'alpha certification.expectedCasterCount');
    requirePositiveInteger(input.certifiedCasterCount, 'alpha certification.certifiedCasterCount');
    requirePositiveInteger(input.sampleCount, 'alpha certification.sampleCount');
    requirePositiveInteger(
        input.firstHitDepthSampleCount,
        'alpha certification.firstHitDepthSampleCount'
    );
    requireNonNegativeFinite(
        input.firstHitDepthToleranceMeters,
        'alpha certification.firstHitDepthToleranceMeters'
    );
    requireNonNegativeFinite(
        input.maximumAbsoluteFirstHitDepthErrorMeters,
        'alpha certification.maximumAbsoluteFirstHitDepthErrorMeters'
    );
    requireNonNegativeInteger(input.matchingSampleCount, 'alpha certification.matchingSampleCount');
    requireNonNegativeInteger(input.missingOccluderCount, 'alpha certification.missingOccluderCount');
    requireNonNegativeInteger(
        input.unexpectedOccluderCount,
        'alpha certification.unexpectedOccluderCount'
    );
    requireExactKeys(
        input.mismatchCounts,
        PRODUCTION_ALPHA_CUTOUT_MISMATCH_KEYS,
        'alpha certification.mismatchCounts'
    );
    let mismatchTotal = 0;
    for (const key of PRODUCTION_ALPHA_CUTOUT_MISMATCH_KEYS) {
        requireNonNegativeInteger(input.mismatchCounts[key], `alpha certification.mismatchCounts.${key}`);
        mismatchTotal += input.mismatchCounts[key];
    }
    if (input.certifiedCasterCount !== input.expectedCasterCount
        || input.matchingSampleCount !== input.sampleCount
        || input.firstHitDepthSampleCount < input.expectedCasterCount
        || input.firstHitDepthSampleCount > input.sampleCount
        || input.firstHitDepthToleranceMeters
            !== PRODUCTION_ALPHA_CUTOUT_FIRST_HIT_DEPTH_TOLERANCE_METERS
        || input.maximumAbsoluteFirstHitDepthErrorMeters
            > input.firstHitDepthToleranceMeters
        || input.missingOccluderCount !== 0
        || input.unexpectedOccluderCount !== 0
        || mismatchTotal !== 0) {
        failStaticSunDepth(
            'static_sun_depth_alpha_certification_failed',
            'Alpha-cutout certification requires every caster and sample to match every runtime alpha semantic.',
            {
                certifiedCasterCount: input.certifiedCasterCount,
                expectedCasterCount: input.expectedCasterCount,
                firstHitDepthSampleCount: input.firstHitDepthSampleCount,
                mismatchTotal,
                missingOccluderCount: input.missingOccluderCount,
                unexpectedOccluderCount: input.unexpectedOccluderCount
            }
        );
    }
    return cloneCanonicalJson({
        ...input,
        method: 'measured-runtime-alpha-occupancy-and-first-hit-depth-parity-v2',
        schema: STATIC_SUN_DEPTH_ALPHA_CERTIFICATION_SCHEMA,
        status: 'passed'
    });
}

/** @param {unknown} value */
export function buildCasterExclusionCertificationRecord(value) {
    const input = /** @type {Record<string, any>} */ (cloneCanonicalJson(value));
    requireExactKeys(input, [
        'casterInventorySha256',
        'certifiedCategoryCount',
        'evidenceSha256',
        'exclusions',
        'includedCasterCount',
        'inventoryCasterCount',
        'inventoryCategoryCount',
        'missingOccluderCount'
    ], 'caster certification input');
    requireSha256(input.casterInventorySha256, 'caster certification.casterInventorySha256');
    requireSha256(input.evidenceSha256, 'caster certification.evidenceSha256');
    requirePositiveInteger(input.inventoryCasterCount, 'caster certification.inventoryCasterCount');
    requirePositiveInteger(input.inventoryCategoryCount, 'caster certification.inventoryCategoryCount');
    for (const key of ['certifiedCategoryCount', 'includedCasterCount', 'missingOccluderCount']) {
        requireNonNegativeInteger(input[key], `caster certification.${key}`);
    }
    if (!Array.isArray(input.exclusions)) throw new TypeError('caster certification.exclusions must be an array');
    let previousId = null;
    const exclusions = input.exclusions.map((entry, index) => {
        requireExactKeys(entry, [
            'casterId',
            'evidenceSha256',
            'reason',
            'reviewed',
            'visualConsequence'
        ], `caster certification.exclusions[${index}]`);
        assertStableId(entry.casterId, `caster certification.exclusions[${index}].casterId`);
        if (previousId !== null && compareCanonicalStrings(previousId, entry.casterId) >= 0) {
            failStaticSunDepth(
                'static_sun_depth_caster_certification_failed',
                'Caster exclusions must have unique IDs in canonical ascending order.',
                { casterId: entry.casterId }
            );
        }
        previousId = entry.casterId;
        requireSha256(entry.evidenceSha256, `caster certification.exclusions[${index}].evidenceSha256`);
        requireNonEmptyString(entry.reason, `caster certification.exclusions[${index}].reason`);
        requireNonEmptyString(
            entry.visualConsequence,
            `caster certification.exclusions[${index}].visualConsequence`
        );
        if (entry.reviewed !== true) {
            failStaticSunDepth(
                'static_sun_depth_caster_certification_failed',
                'Every deliberate caster exclusion must be reviewed.',
                { casterId: entry.casterId }
            );
        }
        return entry;
    });
    if (input.missingOccluderCount !== 0
        || input.certifiedCategoryCount !== input.inventoryCategoryCount
        || input.includedCasterCount + exclusions.length !== input.inventoryCasterCount) {
        failStaticSunDepth(
            'static_sun_depth_caster_certification_failed',
            'Caster certification must cover the complete inventory and every caster category with zero missing occluders.',
            {
                certifiedCategoryCount: input.certifiedCategoryCount,
                exclusionCount: exclusions.length,
                includedCasterCount: input.includedCasterCount,
                inventoryCasterCount: input.inventoryCasterCount,
                inventoryCategoryCount: input.inventoryCategoryCount,
                missingOccluderCount: input.missingOccluderCount
            }
        );
    }
    return cloneCanonicalJson({
        ...input,
        exclusionCount: exclusions.length,
        exclusions,
        method: 'hashed-caster-inventory-and-reviewed-exclusions-v1',
        schema: STATIC_SUN_DEPTH_CASTER_CERTIFICATION_SCHEMA,
        status: 'passed'
    });
}

/** @param {Record<string, any>} receipt */
function validateRawBlenderReceipt(receipt, contract) {
    requireExactKeys(receipt, [
        'alphaCertification',
        'assumptions',
        'casterSidedness',
        'compiler',
        'compilerDescriptor',
        'compilerSignatureSha256',
        'configuration',
        'identity',
        'input',
        'layout',
        'opaqueCertification',
        'outputs',
        'profile',
        'quantizationMeasurements',
        'reconstruction',
        'request',
        'schema',
        'status'
    ], 'Blender production receipt');
    if (receipt.status !== 'complete') {
        failStaticSunDepth(
            'static_sun_depth_production_receipt_invalid',
            'Blender production receipt is incomplete.',
            { status: receipt.status ?? null }
        );
    }
    validateRawCompiler(receipt.compiler, receipt.compilerDescriptor, receipt.configuration);
    validateRawIdentity(receipt);
    validateRawInput(receipt.input, receipt.identity);
    validateRawAssumptions(receipt.assumptions, contract);
    validateRawCasterSidedness(receipt.casterSidedness, receipt.request);
    validateRawRequest(receipt.request);
    if (contract.diagnostic
        && receipt.request.lightingProfileId
            !== DEPTH_DIAGNOSTIC_LIGHTING_PROFILE_ID) {
        throw new Error(
            `Depth diagnostic receipt is restricted to '${DEPTH_DIAGNOSTIC_LIGHTING_PROFILE_ID}'`
        );
    }
    validateRawLayout(receipt.layout, receipt.request, contract);
    validateRawOutputs(receipt.outputs, receipt.layout, contract);
    validateRawQuantization(
        receipt.quantizationMeasurements,
        receipt.layout,
        receipt.outputs,
        contract
    );
    validateRawOpaqueCertification(receipt.opaqueCertification);
    validateRawAlphaCertification(receipt.alphaCertification, receipt.outputs);
    validateRawProfile(receipt.profile, receipt.configuration, receipt.request);
    validateRawReconstruction(receipt.reconstruction);
}

function encodingContractForReceipt(receipt) {
    if (receipt.schema === BLENDER_PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA) {
        return PRODUCTION_ENCODING_CONTRACT;
    }
    if (receipt.schema === BLENDER_PRODUCTION_DEPTH_DIAGNOSTIC_RECEIPT_SCHEMA) {
        return DIAGNOSTIC_ENCODING_CONTRACT;
    }
    throw new Error(`Unsupported Blender receipt schema '${String(receipt.schema)}'`);
}

function validateRawCasterSidedness(value, request) {
    requireExactKeys(value, [
        'casterSidedness',
        'coverageModeMaterialVariantCounts',
        'effectiveShadowSideMaterialVariantCounts',
        'schema'
    ], 'Blender caster sidedness receipt');
    if (value.schema !== 'ai531-static-sun-production-caster-sidedness-receipt-v1') {
        throw new TypeError('Blender caster sidedness receipt schema is unsupported');
    }
    requireStaticSunDepthCasterSidedness(value.casterSidedness);
    if (canonicalJsonStringify(value.casterSidedness)
        !== canonicalJsonStringify(request.casterSidedness)) {
        throw new Error('Blender caster sidedness receipt differs from its request');
    }
    requireExactKeys(value.coverageModeMaterialVariantCounts,
        ['cutout', 'forced_opaque', 'opaque'], 'Blender caster coverage counts');
    requireExactKeys(value.effectiveShadowSideMaterialVariantCounts,
        ['back', 'double', 'front'], 'Blender effective shadow-side counts');
    const coverage = value.coverageModeMaterialVariantCounts;
    const effective = value.effectiveShadowSideMaterialVariantCounts;
    for (const [label, record] of [['coverage', coverage], ['effective', effective]]) {
        for (const count of Object.values(record)) {
            if (!Number.isSafeInteger(count) || count < 0) {
                throw new TypeError(`Blender ${label} sidedness count must be a nonnegative integer`);
            }
        }
    }
    const coverageTotal = Object.values(coverage).reduce((sum, count) => sum + count, 0);
    const effectiveTotal = Object.values(effective).reduce((sum, count) => sum + count, 0);
    if (coverageTotal <= 0 || coverageTotal !== effectiveTotal) {
        throw new Error('Blender caster sidedness material-variant totals are inconsistent');
    }
}

/** @param {Record<string, any>} receipt */
function normalizeRawBlenderReceipt(receipt, contract) {
    const layout = receipt.layout.layout;
    const depth = receipt.layout.depth;
    const normalized = {
        artifactClass: contract.artifactClass,
        channel: {
            boundsLightMeters: layout.boundsLightMeters,
            guardPolicy: 'copy-adjacent-clamp-exterior-v1',
            guardTexels: layout.guardPixels,
            interiorTexels: layout.interiorPixels,
            maxDepthMeters: depth.maxDepthMeters,
            minDepthMeters: depth.minDepthMeters,
            order: layout.order,
            originWorld: receipt.layout.basis.originWorld,
            rowOrigin: 'min-light-y-v1',
            sunPointDirectionWorld: receipt.layout.sunPointDirectionWorld,
            texelSizeMeters: layout.texelSizeMeters,
            tileCount: layout.tileCount
        },
        compiler: {
            archiveSha256: receipt.compiler.archiveSha256,
            architecture: receipt.compiler.architecture,
            backend: receipt.compiler.backend,
            buildHash: receipt.compiler.blenderBuildHash,
            buildPlatform: receipt.compiler.operatingSystem,
            executableSha256: receipt.compiler.executableSha256,
            signatureSha256: receipt.compilerSignatureSha256,
            threadCount: receipt.compiler.fixedThreadCount,
            version: receipt.compiler.blenderVersion,
            versionString: receipt.compiler.blenderVersionString
        },
        productionEligible: contract.productionEligible,
        profile: { id: receipt.profile.id, sha256: receipt.profile.rawSha256 },
        quantizationMeasurements: receipt.quantizationMeasurements,
        sampling: receipt.request.sampling,
        schema: contract.diagnostic
            ? BLENDER_PRODUCTION_DEPTH_DIAGNOSTIC_RECEIPT_SCHEMA
            : PRODUCTION_STATIC_SUN_DEPTH_RECEIPT_SCHEMA,
        source: {
            alphaSemanticsSha256: receipt.identity.alphaSemanticsSha256,
            casterInventorySha256: receipt.identity.casterInventorySha256,
            channelSourceSha256: receipt.input.channelSourceSha256,
            cityId: receipt.identity.cityId,
            geometrySha256: receipt.input.geometrySha256,
            resolvedSourceSha256: receipt.input.resolvedSourceSha256,
            usedMaterialsSha256: receipt.input.usedMaterialsSha256
        },
        status: 'complete',
        tiles: receipt.outputs.map((output) => ({
            coordinates: output.coordinates,
            id: output.tileId,
            interiorByteLength: output.byteLength,
            interiorSha256: output.sha256
        }))
    };
    return contract.diagnostic
        ? normalized
        : validateProductionStaticSunDepthReceipt(normalized);
}

function validateRawCompiler(compiler, descriptor, configuration) {
    requireExactKeys(compiler, [
        'archiveSha256', 'architecture', 'backend', 'blenderBuildHash',
        'blenderVersion', 'blenderVersionString', 'cyclesDevice',
        'executableSha256', 'fixedThreadCount', 'gpuAllowed', 'operatingSystem'
    ], 'Blender receipt.compiler');
    requireExactKeys(descriptor, [
        'ai529ScriptSha256', 'archiveSha256', 'backend', 'blenderBuildHash',
        'blenderVersion', 'cyclesDevice', 'executableSha256', 'fixedThreadCount',
        'gpuAllowed', 'profileSha256', 'rendererScriptSha256', 'schema',
        'toolchainSha256'
    ], 'Blender receipt.compilerDescriptor');
    requireExactKeys(configuration, [
        'ai529ScriptInventory', 'ai529ScriptSha256', 'profileSha256',
        'rendererScriptSha256', 'requestSha256', 'toolchainSha256'
    ], 'Blender receipt.configuration');
    for (const key of ['archiveSha256', 'executableSha256']) {
        requireSha256(compiler[key], `Blender receipt.compiler.${key}`);
    }
    for (const key of [
        'ai529ScriptSha256', 'profileSha256', 'rendererScriptSha256',
        'requestSha256', 'toolchainSha256'
    ]) requireSha256(configuration[key], `Blender receipt.configuration.${key}`);
    if (compiler.backend !== 'cycles_cpu'
        || compiler.cyclesDevice !== 'CPU'
        || compiler.gpuAllowed !== false
        || compiler.operatingSystem !== 'Windows'
        || compiler.architecture !== 'x86_64'
        || canonicalJsonStringify(compiler.blenderVersion) !== '[5,2,1]'
        || compiler.blenderVersionString !== '5.2.1 LTS') {
        failStaticSunDepth(
            'static_sun_depth_production_compiler_invalid',
            'Raw receipt must pin Windows x86_64 Blender 5.2.1 Cycles CPU.',
            {}
        );
    }
    requirePositiveInteger(compiler.fixedThreadCount, 'Blender receipt.compiler.fixedThreadCount');
    const expectedDescriptor = {
        ai529ScriptSha256: configuration.ai529ScriptSha256,
        archiveSha256: compiler.archiveSha256,
        backend: compiler.backend,
        blenderBuildHash: compiler.blenderBuildHash,
        blenderVersion: compiler.blenderVersion,
        cyclesDevice: compiler.cyclesDevice,
        executableSha256: compiler.executableSha256,
        fixedThreadCount: compiler.fixedThreadCount,
        gpuAllowed: compiler.gpuAllowed,
        profileSha256: configuration.profileSha256,
        rendererScriptSha256: configuration.rendererScriptSha256,
        schema: 'ai531-static-sun-production-compiler-v1',
        toolchainSha256: configuration.toolchainSha256
    };
    if (canonicalJsonStringify(descriptor) !== canonicalJsonStringify(expectedDescriptor)) {
        failStaticSunDepth(
            'static_sun_depth_production_compiler_invalid',
            'Compiler descriptor differs from the verified Blender configuration.',
            {}
        );
    }
    if (!Array.isArray(configuration.ai529ScriptInventory)
        || configuration.ai529ScriptInventory.length === 0) {
        throw new TypeError('Blender receipt AI529 script inventory must be non-empty');
    }
    let previousPath = null;
    for (const entry of configuration.ai529ScriptInventory) {
        requireExactKeys(entry, ['byteLength', 'path', 'sha256'], 'AI529 script inventory entry');
        requirePositiveInteger(entry.byteLength, 'AI529 script inventory byteLength');
        requireNonEmptyString(entry.path, 'AI529 script inventory path');
        requireSha256(entry.sha256, 'AI529 script inventory sha256');
        if (previousPath !== null && compareCanonicalStrings(previousPath, entry.path) >= 0) {
            throw new Error('AI529 script inventory paths must be unique and ascending');
        }
        previousPath = entry.path;
    }
}

function validateRawIdentity(receipt) {
    requireSha256(receipt.compilerSignatureSha256, 'Blender receipt.compilerSignatureSha256');
    const actualSignature = rawSha256(utf8Bytes(canonicalJsonStringify(receipt.compilerDescriptor)));
    requireExactKeys(receipt.identity, [
        'alphaSemanticsSha256', 'casterInventorySha256', 'cityId',
        'compilerDescriptor', 'compilerSignatureSha256'
    ], 'Blender receipt.identity');
    assertStableId(receipt.identity.cityId, 'Blender receipt.identity.cityId');
    requireSha256(receipt.identity.alphaSemanticsSha256, 'Blender identity alpha semantics');
    requireSha256(receipt.identity.casterInventorySha256, 'Blender identity caster inventory');
    if (receipt.compilerSignatureSha256 !== actualSignature
        || receipt.identity.compilerSignatureSha256 !== actualSignature
        || canonicalJsonStringify(receipt.identity.compilerDescriptor)
            !== canonicalJsonStringify(receipt.compilerDescriptor)) {
        failStaticSunDepth(
            'static_sun_depth_production_identity_mismatch',
            'Raw compiler and identity declarations are not canonically identical.',
            {}
        );
    }
}

function validateRawInput(input, identity) {
    requireExactKeys(input, [
        'alphaSemanticsSha256', 'casterInventorySha256', 'channelSourceSha256',
        'finalFileDomainSha256', 'geometrySha256', 'packageRawSha256',
        'resolvedSourceSha256', 'usedMaterialsSha256'
    ], 'Blender receipt.input');
    for (const key of Object.keys(input)) requireSha256(input[key], `Blender receipt.input.${key}`);
    if (input.alphaSemanticsSha256 !== identity.alphaSemanticsSha256
        || input.casterInventorySha256 !== identity.casterInventorySha256) {
        failStaticSunDepth(
            'static_sun_depth_production_identity_mismatch',
            'Raw receipt input and identity hashes differ.',
            {}
        );
    }
}

function validateRawAssumptions(value, contract) {
    const expected = /** @type {Record<string, string>} */ ({
        depthMaterial:
            'cycles_z_pass_with_binary_principled_visibility_v1',
        f32Intermediate: 'rgba_f32le_lower_left_with_depth_in_b_and_binary_occupancy_in_a_v1',
        guardGeneration: 'not_performed_outputs_are_unguarded_interiors',
        performanceUse: 'render_timings_are_intentionally_absent_and_must_be_measured_by_the_outer_acceptance_run',
        pointSun: 'one_normalized_receiver_to_sun_direction_no_angular_penumbra',
        sidedness: 'authenticated-three-r183-effective-shadow-side-then-world-space-direction-filter-v1',
        spatialSampling: 'one_deterministic_cycles_primary_camera_sample_per_texel'
    });
    if (contract.diagnostic) {
        expected.rgba8Rgb24aEncoding =
            'profile_global_linear_endpoints_rgb_0_through_16777215_with_alpha_255_occupied_0_empty_v1';
    } else {
        expected.rg8Encoding =
            'linear_endpoints_0_through_65534_with_65535_empty_msb_first_v1';
    }
    requireExactKeys(value, Object.keys(expected), 'Blender receipt.assumptions');
    if (canonicalJsonStringify(value) !== canonicalJsonStringify(expected)) {
        failStaticSunDepth(
            'static_sun_depth_production_receipt_invalid',
            'Raw Blender production assumptions differ from V1.',
            {}
        );
    }
}

function validateRawRequest(request) {
    requireExactKeys(request, [
        'boundsMarginMeters', 'casterSidedness', 'guardPixels', 'interiorPixels',
        'lightingProfileId', 'maxPayloadBytes', 'phasePolicy', 'sampling',
        'schema', 'sourceShadowCapability', 'sunPointDirectionWorld',
        'texelSizeMeters', 'tileSizeMeters'
    ], 'Blender receipt.request');
    requireStaticSunDepthCasterSidedness(request.casterSidedness);
    assertStableId(request.lightingProfileId, 'Blender receipt.request.lightingProfileId');
    const pinned = {
        boundsMarginMeters: 2,
        guardPixels: FIXED_GUARD_TEXELS,
        interiorPixels: PRODUCTION_INTERIOR_PIXELS,
        maxPayloadBytes: ILLUMINATION_MAX_PACKAGE_BYTES,
        phasePolicy: PRODUCTION_PHASE_POLICY,
        schema: PRODUCTION_REQUEST_SCHEMA,
        texelSizeMeters: PRODUCTION_TEXEL_SIZE_METERS,
        tileSizeMeters: PRODUCTION_TILE_SIZE_METERS
    };
    for (const [key, expected] of Object.entries(pinned)) {
        if (canonicalJsonStringify(request[key])
            !== canonicalJsonStringify(expected)) {
            failStaticSunDepth(
                'static_sun_depth_production_layout_invalid',
                'Raw production request changed a pinned layout value.',
                { actual: request[key], expected, field: key }
            );
        }
    }
    if (canonicalJsonStringify(request.sourceShadowCapability)
            !== canonicalJsonStringify(PRODUCTION_SOURCE_SHADOW_CAPABILITY)) {
        failStaticSunDepth(
            'static_sun_depth_production_layout_invalid',
            'Raw production request changed the effective source-shadow capability.',
            { actual: request.sourceShadowCapability }
        );
    }
    const direction = requireFiniteVector(request.sunPointDirectionWorld, 3, 'Blender request sun direction');
    if (Math.abs(Math.hypot(...direction) - 1) > 1e-12) {
        throw new RangeError('Blender request sun direction must be normalized');
    }
    validateProductionSamplingPolicy(request.sampling, direction, 'Blender receipt.request.sampling');
}

function validateRawLayout(layoutRecord, request, contract) {
    requireExactKeys(layoutRecord, [
        'basis', 'depth', 'derivation', 'layout', 'sunPointDirectionWorld', 'tiles'
    ], 'Blender receipt.layout');
    requireExactKeys(layoutRecord.basis, [
        'depthAxisWorld', 'originWorld', 'policy', 'rightAxisWorld', 'upAxisWorld'
    ], 'Blender receipt.layout.basis');
    requireExactKeys(layoutRecord.depth, [
        'maxDepthMeters', 'minDepthMeters', 'rawCasterBoundsMaxDepthMeters',
        'rawCasterBoundsMinDepthMeters', 'rawCombinedBoundsMaxDepthMeters',
        'rawCombinedBoundsMinDepthMeters', 'rawReceiverMapBoundsMaxDepthMeters',
        'rawReceiverMapBoundsMinDepthMeters'
    ], 'Blender receipt.layout.depth');
    requireExactKeys(layoutRecord.derivation, [
        'boundsInput', 'boundsMarginMeters', 'casterCornerCount',
        'casterWorldBoundsMeters', 'centering', 'cornerCount',
        'phaseAlignment', 'receiverMapCornerCount',
        'receiverMapWorldBoundsMeters', 'sourceMap'
    ], 'Blender receipt.layout.derivation');
    requireExactKeys(layoutRecord.layout, [
        'boundsLightMeters', 'finalGuardedPayloadBytes', 'guardPixels',
        'interiorPixels', 'layerCount', 'order', 'storedPixels',
        'texelSizeMeters', 'tileCount', 'tileSizeMeters'
    ], 'Blender receipt.layout.layout');
    if (canonicalJsonStringify(layoutRecord.sunPointDirectionWorld)
        !== canonicalJsonStringify(request.sunPointDirectionWorld)
        || layoutRecord.basis.policy !== 'least-aligned-world-axis-v1') {
        failStaticSunDepth(
            'static_sun_depth_production_layout_invalid',
            'Raw layout sun identity or basis policy differs from the request.',
            {}
        );
    }
    const stableBasis = createStableStaticSunDepthBasis(
        layoutRecord.sunPointDirectionWorld,
        layoutRecord.basis.originWorld
    );
    for (const axis of ['rightAxisWorld', 'upAxisWorld', 'depthAxisWorld']) {
        if (!vectorsNearlyEqual(stableBasis[axis], layoutRecord.basis[axis])) {
            failStaticSunDepth(
                'static_sun_depth_production_layout_invalid',
                'Raw Blender basis does not match the runtime stable sun basis.',
                { axis }
            );
        }
    }
    const layout = layoutRecord.layout;
    const tileCount = requireIntegerVector2(layout.tileCount, 1, 'Blender receipt.layout.tileCount');
    const interiorPixels = requireIntegerVector2(
        layout.interiorPixels,
        1,
        'Blender receipt.layout.interiorPixels'
    );
    const storedPixels = requireIntegerVector2(
        layout.storedPixels,
        1,
        'Blender receipt.layout.storedPixels'
    );
    const tileSizeMeters = requireFiniteVector(
        layout.tileSizeMeters,
        2,
        'Blender receipt.layout.tileSizeMeters'
    );
    const layerCount = tileCount[0] * tileCount[1];
    if (layout.guardPixels !== request.guardPixels
        || canonicalJsonStringify(interiorPixels)
            !== canonicalJsonStringify(request.interiorPixels)
        || canonicalJsonStringify(tileSizeMeters)
            !== canonicalJsonStringify(request.tileSizeMeters)
        || storedPixels[0] !== interiorPixels[0] + layout.guardPixels * 2
        || storedPixels[1] !== interiorPixels[1] + layout.guardPixels * 2
        || layout.layerCount !== layerCount
        || layout.order !== 'row-major-y-then-x-v1'
        || layout.texelSizeMeters !== request.texelSizeMeters
        || tileSizeMeters[0] !== interiorPixels[0] * layout.texelSizeMeters
        || tileSizeMeters[1] !== interiorPixels[1] * layout.texelSizeMeters
        || layout.finalGuardedPayloadBytes
            !== storedPixels[0] * storedPixels[1]
                * contract.bytesPerTexel * layerCount
        || layout.finalGuardedPayloadBytes > request.maxPayloadBytes) {
        failStaticSunDepth(
            'static_sun_depth_production_layout_invalid',
            'Raw Blender layout dimensions or payload accounting are inconsistent.',
            {}
        );
    }
    requireExactKeys(layout.boundsLightMeters, ['max', 'min'], 'Blender receipt.layout bounds');
    const minimum = requireFiniteVector(layout.boundsLightMeters.min, 2, 'Blender layout bounds min');
    const maximum = requireFiniteVector(layout.boundsLightMeters.max, 2, 'Blender layout bounds max');
    if (!nearlyEqual(maximum[0], minimum[0] + tileCount[0] * tileSizeMeters[0])
        || !nearlyEqual(maximum[1], minimum[1] + tileCount[1] * tileSizeMeters[1])) {
        failStaticSunDepth('static_sun_depth_production_layout_invalid', 'Raw bounds do not cover the tile grid.', {});
    }
    validateRawPhaseAlignment(
        layoutRecord.derivation.phaseAlignment,
        layoutRecord.basis,
        minimum,
        request
    );
    for (const key of Object.keys(layoutRecord.depth)) requireFinite(layoutRecord.depth[key], `Blender depth.${key}`);
    const depth = layoutRecord.depth;
    if (!(depth.rawCasterBoundsMinDepthMeters <= depth.rawCasterBoundsMaxDepthMeters
        && depth.rawReceiverMapBoundsMinDepthMeters <= depth.rawReceiverMapBoundsMaxDepthMeters
        && depth.minDepthMeters < depth.rawCombinedBoundsMinDepthMeters
        && depth.rawCombinedBoundsMinDepthMeters <= depth.rawCombinedBoundsMaxDepthMeters
        && depth.rawCombinedBoundsMaxDepthMeters < depth.maxDepthMeters)
        || !nearlyEqual(
            depth.rawCombinedBoundsMinDepthMeters,
            Math.min(depth.rawCasterBoundsMinDepthMeters, depth.rawReceiverMapBoundsMinDepthMeters)
        )
        || !nearlyEqual(
            depth.rawCombinedBoundsMaxDepthMeters,
            Math.max(depth.rawCasterBoundsMaxDepthMeters, depth.rawReceiverMapBoundsMaxDepthMeters)
        )
        || !nearlyEqual(
            depth.minDepthMeters,
            depth.rawCombinedBoundsMinDepthMeters - request.boundsMarginMeters
        )
        || !nearlyEqual(
            depth.maxDepthMeters,
            depth.rawCombinedBoundsMaxDepthMeters + request.boundsMarginMeters
        )) {
        failStaticSunDepth(
            'static_sun_depth_production_layout_invalid',
            'Raw depth bounds do not exactly enclose both caster and receiver-map bounds.',
            {}
        );
    }
    const derivation = layoutRecord.derivation;
    if (derivation.boundsInput
            !== 'reconstructed_static_sun_object_bounds_plus_verified_source_map_receiver_footprint_v1'
        || derivation.boundsMarginMeters !== request.boundsMarginMeters
        || derivation.centering
            !== 'minimum_whole_tiles_then_nearest_valid_absolute_texel_edge_v2') {
        failStaticSunDepth('static_sun_depth_production_layout_invalid', 'Raw layout derivation is unsupported.', {});
    }
    const casterBounds = validateRawWorldBounds(
        derivation.casterWorldBoundsMeters,
        'Blender layout caster world bounds'
    );
    const receiverBounds = validateRawWorldBounds(
        derivation.receiverMapWorldBoundsMeters,
        'Blender layout receiver-map world bounds'
    );
    requireExactKeys(derivation.sourceMap, [
        'edgePolicy', 'heightTiles', 'originWorld', 'tileSizeMeters', 'widthTiles'
    ], 'Blender receipt.layout.derivation.sourceMap');
    const sourceMap = derivation.sourceMap;
    const sourceOrigin = requireFiniteVector(sourceMap.originWorld, 3, 'Blender source-map origin');
    requirePositiveInteger(sourceMap.widthTiles, 'Blender source-map width');
    requirePositiveInteger(sourceMap.heightTiles, 'Blender source-map height');
    requirePositiveFinite(sourceMap.tileSizeMeters, 'Blender source-map tile size');
    const expectedReceiverMinimum = [
        sourceOrigin[0] - sourceMap.tileSizeMeters * 0.5,
        Math.min(casterBounds.minimum[1], sourceOrigin[1]),
        sourceOrigin[2] - sourceMap.tileSizeMeters * 0.5
    ];
    const expectedReceiverMaximum = [
        expectedReceiverMinimum[0] + sourceMap.widthTiles * sourceMap.tileSizeMeters,
        Math.max(casterBounds.maximum[1], sourceOrigin[1]),
        expectedReceiverMinimum[2] + sourceMap.heightTiles * sourceMap.tileSizeMeters
    ];
    const combinedWorldMinimum = casterBounds.minimum.map(
        (entry, index) => Math.min(entry, receiverBounds.minimum[index])
    );
    const combinedWorldMaximum = casterBounds.maximum.map(
        (entry, index) => Math.max(entry, receiverBounds.maximum[index])
    );
    const expectedBasisOrigin = combinedWorldMinimum.map(
        (entry, index) => (entry + combinedWorldMaximum[index]) * 0.5
    );
    const casterProjectedBounds = projectRawWorldBounds(casterBounds, layoutRecord.basis);
    const receiverProjectedBounds = projectRawWorldBounds(receiverBounds, layoutRecord.basis);
    const combinedProjectedMinimum = casterProjectedBounds.minimum.map(
        (entry, index) => Math.min(entry, receiverProjectedBounds.minimum[index])
    );
    const combinedProjectedMaximum = casterProjectedBounds.maximum.map(
        (entry, index) => Math.max(entry, receiverProjectedBounds.maximum[index])
    );
    const receiverDomainIsCovered = [0, 1].every((axis) => {
        const requiredMinimum = receiverProjectedBounds.minimum[axis]
            - request.boundsMarginMeters;
        const requiredMaximum = receiverProjectedBounds.maximum[axis]
            + request.boundsMarginMeters;
        return (minimum[axis] < requiredMinimum || nearlyEqual(minimum[axis], requiredMinimum))
            && (maximum[axis] > requiredMaximum || nearlyEqual(maximum[axis], requiredMaximum));
    });
    const casterWorldBoundsStayWithinReceiverFootprintMargin = [0, 2]
        .every((axis) => (
            (casterBounds.minimum[axis]
                > receiverBounds.minimum[axis] - request.boundsMarginMeters
                || nearlyEqual(
                    casterBounds.minimum[axis],
                    receiverBounds.minimum[axis] - request.boundsMarginMeters
                ))
            && (casterBounds.maximum[axis]
                < receiverBounds.maximum[axis] + request.boundsMarginMeters
                || nearlyEqual(
                    casterBounds.maximum[axis],
                    receiverBounds.maximum[axis] + request.boundsMarginMeters
                ))
        ));
    const casterDepthIsWithinAggregateWorldBounds =
        (depth.rawCasterBoundsMinDepthMeters
            > casterProjectedBounds.minimum[2]
            || nearlyEqual(
                depth.rawCasterBoundsMinDepthMeters,
                casterProjectedBounds.minimum[2]
            ))
        && (depth.rawCasterBoundsMaxDepthMeters
            < casterProjectedBounds.maximum[2]
            || nearlyEqual(
                depth.rawCasterBoundsMaxDepthMeters,
                casterProjectedBounds.maximum[2]
            ));
    if (sourceMap.edgePolicy !== 'origin_is_first_tile_center_expand_half_tile_v1'
        || !vectorsNearlyEqual(receiverBounds.minimum, expectedReceiverMinimum)
        || !vectorsNearlyEqual(receiverBounds.maximum, expectedReceiverMaximum)
        || !vectorsNearlyEqual(layoutRecord.basis.originWorld, expectedBasisOrigin)
        || !casterDepthIsWithinAggregateWorldBounds
        || !nearlyEqual(
            depth.rawReceiverMapBoundsMinDepthMeters,
            receiverProjectedBounds.minimum[2]
        )
        || !nearlyEqual(
            depth.rawReceiverMapBoundsMaxDepthMeters,
            receiverProjectedBounds.maximum[2]
        )
        || !receiverDomainIsCovered
        || !casterWorldBoundsStayWithinReceiverFootprintMargin) {
        failStaticSunDepth(
            'static_sun_depth_production_layout_invalid',
            'Raw caster/receiver projections, coverage, or combined basis origin are inconsistent.',
            {
                actualBasisOrigin: layoutRecord.basis.originWorld,
                casterProjectedBounds,
                casterDepthIsWithinAggregateWorldBounds,
                casterWorldBoundsStayWithinReceiverFootprintMargin,
                combinedProjectedMaximum,
                combinedProjectedMinimum,
                depth: {
                    rawCasterBoundsMaxDepthMeters:
                        depth.rawCasterBoundsMaxDepthMeters,
                    rawCasterBoundsMinDepthMeters:
                        depth.rawCasterBoundsMinDepthMeters,
                    rawCombinedBoundsMaxDepthMeters:
                        depth.rawCombinedBoundsMaxDepthMeters,
                    rawCombinedBoundsMinDepthMeters:
                        depth.rawCombinedBoundsMinDepthMeters,
                    rawReceiverMapBoundsMaxDepthMeters:
                        depth.rawReceiverMapBoundsMaxDepthMeters,
                    rawReceiverMapBoundsMinDepthMeters:
                        depth.rawReceiverMapBoundsMinDepthMeters
                },
                expectedBasisOrigin,
                expectedReceiverMaximum,
                expectedReceiverMinimum,
                receiverDomainIsCovered,
                receiverProjectedBounds
            }
        );
    }
    requirePositiveInteger(derivation.casterCornerCount, 'Blender layout caster cornerCount');
    requirePositiveInteger(derivation.receiverMapCornerCount, 'Blender layout receiver-map cornerCount');
    requirePositiveInteger(derivation.cornerCount, 'Blender layout combined cornerCount');
    if (derivation.casterCornerCount % 8 !== 0
        || derivation.receiverMapCornerCount !== 8
        || derivation.cornerCount
            !== derivation.casterCornerCount + derivation.receiverMapCornerCount) {
        failStaticSunDepth(
            'static_sun_depth_production_layout_invalid',
            'Raw caster and receiver-map corner accounting is inconsistent.',
            {}
        );
    }
    validateRawLayoutTiles(layoutRecord.tiles, layout);
}

function validateRawPhaseAlignment(value, basis, boundsMinimum, request) {
    requireExactKeys(value, [
        'absoluteBoundsMinimumTexelIndices',
        'absoluteOriginProjectionMeters',
        'maximumEdgePhaseErrorTexels',
        'policy',
        'texelSizeMeters'
    ], 'Blender receipt.layout.derivation.phaseAlignment');
    const indices = requireFiniteVector(
        value.absoluteBoundsMinimumTexelIndices,
        2,
        'Blender phase edge indices'
    );
    if (!indices.every(Number.isSafeInteger)) {
        throw new TypeError('Blender phase edge indices must be safe integers');
    }
    const originProjection = requireFiniteVector(
        value.absoluteOriginProjectionMeters,
        2,
        'Blender absolute origin projection'
    );
    const expectedProjection = [
        dot3(basis.originWorld, basis.rightAxisWorld),
        dot3(basis.originWorld, basis.upAxisWorld)
    ];
    if (value.policy !== request.phasePolicy
        || value.policy !== PRODUCTION_PHASE_POLICY
        || value.texelSizeMeters !== request.texelSizeMeters
        || value.texelSizeMeters !== PRODUCTION_TEXEL_SIZE_METERS
        || !vectorsNearlyEqual(originProjection, expectedProjection)) {
        failStaticSunDepth(
            'static_sun_depth_production_layout_invalid',
            'Raw production phase identity differs from the live-shadow lattice.',
            {}
        );
    }
    let maximumError = 0;
    for (let axis = 0; axis < 2; axis += 1) {
        const phase = (boundsMinimum[axis] + originProjection[axis])
            / value.texelSizeMeters;
        maximumError = Math.max(maximumError, Math.abs(phase - indices[axis]));
    }
    requireNonNegativeFinite(
        value.maximumEdgePhaseErrorTexels,
        'Blender maximum edge phase error'
    );
    if (maximumError > 1e-9
        || Math.abs(maximumError - value.maximumEdgePhaseErrorTexels) > 1e-12) {
        failStaticSunDepth(
            'static_sun_depth_production_layout_invalid',
            'Raw production bounds are not phase-aligned to live shadow texel edges.',
            { maximumError }
        );
    }
}

function validateRawWorldBounds(record, label) {
    requireExactKeys(record, ['max', 'min'], label);
    const minimum = requireFiniteVector(record.min, 3, `${label} min`);
    const maximum = requireFiniteVector(record.max, 3, `${label} max`);
    if (minimum.some((entry, index) => entry > maximum[index])) {
        failStaticSunDepth(
            'static_sun_depth_production_layout_invalid',
            'Raw world bounds are not increasing.',
            { label }
        );
    }
    return { maximum, minimum };
}

function projectRawWorldBounds(bounds, basis) {
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    const axes = [basis.rightAxisWorld, basis.upAxisWorld, basis.depthAxisWorld];
    for (const x of [bounds.minimum[0], bounds.maximum[0]]) {
        for (const y of [bounds.minimum[1], bounds.maximum[1]]) {
            for (const z of [bounds.minimum[2], bounds.maximum[2]]) {
                const relative = [x, y, z].map(
                    (entry, index) => entry - basis.originWorld[index]
                );
                axes.forEach((axis, axisIndex) => {
                    const projected = dot3(relative, axis);
                    minimum[axisIndex] = Math.min(minimum[axisIndex], projected);
                    maximum[axisIndex] = Math.max(maximum[axisIndex], projected);
                });
            }
        }
    }
    return { maximum, minimum };
}

function validateRawLayoutTiles(tiles, layout) {
    if (!Array.isArray(tiles) || tiles.length !== layout.layerCount) {
        failStaticSunDepth('static_sun_depth_production_tile_inventory_invalid', 'Raw layout tiles are incomplete.', {});
    }
    tiles.forEach((tile, index) => {
        requireExactKeys(tile, ['coordinates', 'id', 'interiorBoundsLightMeters'], `Blender layout.tiles[${index}]`);
        const x = index % layout.tileCount[0];
        const y = Math.floor(index / layout.tileCount[0]);
        if (tile.id !== tileId(x, y)
            || canonicalJsonStringify(tile.coordinates) !== canonicalJsonStringify([x, y])) {
            failStaticSunDepth('static_sun_depth_production_tile_inventory_invalid', 'Raw layout tiles are not row-major.', { index });
        }
        requireExactKeys(tile.interiorBoundsLightMeters, ['max', 'min'], `Blender tile ${index} bounds`);
        const expectedMinimum = [
            layout.boundsLightMeters.min[0] + x * layout.tileSizeMeters[0],
            layout.boundsLightMeters.min[1] + y * layout.tileSizeMeters[1]
        ];
        const expectedMaximum = expectedMinimum.map(
            (entry, axis) => entry + layout.tileSizeMeters[axis]
        );
        if (!vectorsNearlyEqual(tile.interiorBoundsLightMeters.min, expectedMinimum)
            || !vectorsNearlyEqual(tile.interiorBoundsLightMeters.max, expectedMaximum)) {
            failStaticSunDepth('static_sun_depth_production_tile_inventory_invalid', 'Raw tile bounds are inconsistent.', { index });
        }
    });
}

function validateRawOutputs(outputs, layoutRecord, contract) {
    const layout = layoutRecord.layout;
    if (!Array.isArray(outputs) || outputs.length !== layout.layerCount) {
        failStaticSunDepth('static_sun_depth_production_tile_inventory_invalid', 'Raw outputs are incomplete.', {});
    }
    const byteLength = layout.interiorPixels[0] * layout.interiorPixels[1]
        * contract.bytesPerTexel;
    outputs.forEach((output, index) => {
        requireExactKeys(output, [
            'byteLength', 'coordinates', 'encoding', 'occupiedPixelCount',
            'path', 'rowOrigin', 'sha256', 'tileId', 'transparentPixelCount',
            'unguardedInterior'
        ], `Blender receipt.outputs[${index}]`);
        const tile = layoutRecord.tiles[index];
        requireNonNegativeInteger(output.occupiedPixelCount, `Blender output ${index} occupied count`);
        requireNonNegativeInteger(output.transparentPixelCount, `Blender output ${index} transparent count`);
        requireSha256(output.sha256, `Blender output ${index} sha256`);
        if (output.tileId !== tile.id
            || canonicalJsonStringify(output.coordinates) !== canonicalJsonStringify(tile.coordinates)
            || output.path
                !== `tiles/${output.tileId}.interior.${contract.outputSuffix}`
            || output.encoding !== contract.outputEncoding
            || output.rowOrigin !== 'min-light-y-v1'
            || output.unguardedInterior !== true
            || output.byteLength !== byteLength
            || output.occupiedPixelCount + output.transparentPixelCount
                !== layout.interiorPixels[0] * layout.interiorPixels[1]) {
            failStaticSunDepth('static_sun_depth_production_tile_inventory_invalid', 'Raw output differs from its layout tile.', { index });
        }
    });
}

function validateRawQuantization(measurements, layoutRecord, outputs, contract) {
    requireExactKeys(measurements, [
        'emptyTexelCount', 'encodedCodeMaximum', 'encodedCodeMinimum',
        'maximumAbsoluteErrorMeters', 'meanAbsoluteErrorMeters',
        'measurementMethod', 'occupiedTexelCount', 'sourceDepthMaximumMeters',
        'sourceDepthMinimumMeters'
    ], 'Blender receipt.quantizationMeasurements');
    const occupied = outputs.reduce((sum, output) => sum + output.occupiedPixelCount, 0);
    const empty = outputs.reduce((sum, output) => sum + output.transparentPixelCount, 0);
    if (measurements.occupiedTexelCount !== occupied || measurements.emptyTexelCount !== empty) {
        failStaticSunDepth('static_sun_depth_production_quantization_invalid', 'Raw quantization counts differ from outputs.', {});
    }
    const normalizedChannel = {
        tileCount: layoutRecord.layout.tileCount,
        interiorTexels: layoutRecord.layout.interiorPixels,
        minDepthMeters: layoutRecord.depth.minDepthMeters,
        maxDepthMeters: layoutRecord.depth.maxDepthMeters
    };
    validateQuantizationMeasurements(measurements, normalizedChannel, contract);
}

function validateRawOpaqueCertification(value) {
    requireExactKeys(value, [
        'algorithm', 'cutoutFirstHitExcludedSampleCount', 'depthEpsilonMeters',
        'depthMismatchCount', 'directionalGeometryFilter', 'eligibleSampleCount',
        'maximumDepthErrorMeters', 'occupancyMismatchCount',
        'opaqueAndForcedOpaquePolygonCount',
        'sampleCount', 'samplePlan', 'status'
    ], 'Blender receipt.opaqueCertification');
    for (const key of [
        'cutoutFirstHitExcludedSampleCount', 'depthMismatchCount',
        'eligibleSampleCount', 'occupancyMismatchCount'
    ]) requireNonNegativeInteger(value[key], `opaque certification.${key}`);
    requirePositiveInteger(value.opaqueAndForcedOpaquePolygonCount, 'opaque certification polygon count');
    requirePositiveInteger(value.sampleCount, 'opaque certification sampleCount');
    requireNonNegativeFinite(value.depthEpsilonMeters, 'opaque certification epsilon');
    requireNonNegativeFinite(value.maximumDepthErrorMeters, 'opaque certification maximum error');
    const directionalFilter = value.directionalGeometryFilter;
    requireExactKeys(directionalFilter, [
        'algorithm', 'filteredObjectCount', 'removedPolygonCount',
        'sourcePolygonCount', 'unchangedObjectCount', 'visiblePolygonCount'
    ], 'Blender receipt.opaqueCertification.directionalGeometryFilter');
    for (const key of [
        'filteredObjectCount', 'removedPolygonCount', 'sourcePolygonCount',
        'unchangedObjectCount', 'visiblePolygonCount'
    ]) requireNonNegativeInteger(directionalFilter[key], `directional geometry filter.${key}`);
    if (directionalFilter.algorithm !== 'world_space_direction_filtered_mesh_faces_v1'
        || directionalFilter.sourcePolygonCount <= 0
        || directionalFilter.visiblePolygonCount <= 0
        || directionalFilter.visiblePolygonCount + directionalFilter.removedPolygonCount
            !== directionalFilter.sourcePolygonCount
        || directionalFilter.filteredObjectCount + directionalFilter.unchangedObjectCount <= 0) {
        failStaticSunDepth(
            'static_sun_depth_opaque_certification_failed',
            'Raw Blender directional geometry filtering is incomplete.',
            {}
        );
    }
    if (value.algorithm !== 'blender_bvhtree_direction_filtered_primary_ray_v3'
        || value.samplePlan !== '32_by_32_stratified_grid_plus_lcg_seed_531_to_2048_unique_texels'
        || value.status !== 'verified'
        || value.depthEpsilonMeters !== PRODUCTION_OPAQUE_BVH_DEPTH_EPSILON_METERS
        || value.depthMismatchCount !== 0
        || value.occupancyMismatchCount !== 0
        || value.maximumDepthErrorMeters > value.depthEpsilonMeters
        || value.eligibleSampleCount < Math.min(128, value.sampleCount)
        || value.eligibleSampleCount + value.cutoutFirstHitExcludedSampleCount !== value.sampleCount) {
        failStaticSunDepth(
            'static_sun_depth_opaque_certification_failed',
            'Raw Blender opaque certification is incomplete or contains a mismatch.',
            {}
        );
    }
}

function validateRawAlphaCertification(value, outputs) {
    const requiredKeys = [
        'binaryAlphaEpsilon', 'binaryOutputRequired', 'coverageInputs',
        'cutoutMaterialCount', 'cutoutMaterialIds', 'exactCoverageInputCount',
        'forcedOpaqueMaterialVariantCount', 'occupiedRenderedPixelCount',
        'status', 'transparentRenderedPixelCount'
    ];
    const hasSpatialParityArtifact = !!value
        && typeof value === 'object'
        && !Array.isArray(value)
        && Object.prototype.hasOwnProperty.call(value, 'spatialParityArtifact');
    requireExactKeys(
        value,
        hasSpatialParityArtifact
            ? [...requiredKeys, 'spatialParityArtifact']
            : requiredKeys,
        'Blender receipt.alphaCertification'
    );
    if (hasSpatialParityArtifact) {
        validateProductionAlphaCutoutSpatialParityArtifact(
            value.spatialParityArtifact
        );
    }
    for (const key of [
        'cutoutMaterialCount', 'exactCoverageInputCount',
        'forcedOpaqueMaterialVariantCount', 'occupiedRenderedPixelCount',
        'transparentRenderedPixelCount'
    ]) requireNonNegativeInteger(value[key], `alpha certification.${key}`);
    if (!Array.isArray(value.cutoutMaterialIds) || !Array.isArray(value.coverageInputs)) {
        throw new TypeError('alpha certification material IDs and coverage inputs must be arrays');
    }
    const occupied = outputs.reduce((sum, output) => sum + output.occupiedPixelCount, 0);
    const empty = outputs.reduce((sum, output) => sum + output.transparentPixelCount, 0);
    if (value.binaryAlphaEpsilon !== 1e-6
        || value.binaryOutputRequired !== true
        || value.status !== 'exact_inputs_and_binary_render_output_verified'
        || value.cutoutMaterialCount !== value.cutoutMaterialIds.length
        || value.cutoutMaterialCount !== value.coverageInputs.length
        || value.occupiedRenderedPixelCount !== occupied
        || value.transparentRenderedPixelCount !== empty) {
        failStaticSunDepth(
            'static_sun_depth_alpha_certification_failed',
            'Raw alpha certification is incomplete or inconsistent.',
            {}
        );
    }
    let previousId = null;
    let exactInputCount = 0;
    value.coverageInputs.forEach((coverage, index) => {
        requireExactKeys(coverage, [
            'alphaInputId', 'alphaTest', 'inputs', 'materialId', 'opacity',
            'vertexColors'
        ], `alpha coverageInputs[${index}]`);
        assertStableId(coverage.materialId, `alpha coverageInputs[${index}].materialId`);
        assertStableId(coverage.alphaInputId, `alpha coverageInputs[${index}].alphaInputId`);
        if (value.cutoutMaterialIds[index] !== coverage.materialId
            || (previousId !== null && compareCanonicalStrings(previousId, coverage.materialId) >= 0)
            || !Array.isArray(coverage.inputs)
            || coverage.inputs.length === 0) {
            failStaticSunDepth(
                'static_sun_depth_alpha_certification_failed',
                'Cutout alpha inputs are incomplete or non-canonical.',
                { index }
            );
        }
        previousId = coverage.materialId;
        coverage.inputs.forEach((input, inputIndex) => {
            requireExactKeys(input, [
                'bindingId', 'channel', 'coverageBufferId', 'coverageSha256',
                'operation', 'sourceContentSha256', 'sourceId'
            ], `alpha coverageInputs[${index}].inputs[${inputIndex}]`);
            for (const id of ['bindingId', 'coverageBufferId', 'sourceId']) {
                assertStableId(input[id], `alpha input.${id}`);
            }
            requireSha256(input.coverageSha256, 'alpha input.coverageSha256');
            requireSha256(input.sourceContentSha256, 'alpha input.sourceContentSha256');
            requireNonEmptyString(input.channel, 'alpha input.channel');
            requireNonEmptyString(input.operation, 'alpha input.operation');
        });
        exactInputCount += coverage.inputs.length;
    });
    if (exactInputCount !== value.exactCoverageInputCount) {
        failStaticSunDepth(
            'static_sun_depth_alpha_certification_failed',
            'Exact alpha coverage input count is incomplete.',
            {}
        );
    }
}

function validateRawProfile(profile, configuration, request) {
    requireExactKeys(profile, ['applied', 'id', 'productionOverrides', 'rawSha256'], 'Blender receipt.profile');
    assertStableId(profile.id, 'Blender receipt.profile.id');
    requireSha256(profile.rawSha256, 'Blender receipt.profile.rawSha256');
    if (profile.rawSha256 !== configuration.profileSha256) {
        failStaticSunDepth('static_sun_depth_production_receipt_invalid', 'Raw profile hash differs from configuration.', {});
    }
    requireExactKeys(profile.productionOverrides, [
        'cameraClipEndMeters', 'cameraClipStartMeters',
        'cameraOriginDepthMeters', 'cyclesDevice', 'depthReadback', 'gpuAllowed',
        'persistentData', 'primaryRaySamples', 'rowStripPixels'
    ], 'Blender receipt.profile.productionOverrides');
    if (profile.productionOverrides.cyclesDevice !== 'CPU'
        || profile.productionOverrides.gpuAllowed !== false
        || profile.productionOverrides.depthReadback
            !== 'cycles_z_pass_composited_to_rgb_with_render_alpha_v1'
        || profile.productionOverrides.persistentData !== true
        || profile.productionOverrides.primaryRaySamples !== 1) {
        failStaticSunDepth(
            'static_sun_depth_production_compiler_invalid',
            'Raw production overrides are not deterministic CPU primary rays.',
            {}
        );
    }
    requirePositiveInteger(profile.productionOverrides.rowStripPixels, 'production rowStripPixels');
    if (profile.productionOverrides.rowStripPixels !== request.interiorPixels[1]) {
        throw new RangeError(
            'production rowStripPixels must equal the tile interior height'
        );
    }
    for (const key of ['cameraClipEndMeters', 'cameraClipStartMeters', 'cameraOriginDepthMeters']) {
        requireFinite(profile.productionOverrides[key], `production overrides.${key}`);
    }
    requireExactKeys(profile.applied, [
        'alphaCutoutPolicy', 'bakeTarget', 'colorManagement', 'cyclesDevice',
        'depthPrecision', 'depthSampling', 'dof', 'motionBlur', 'profileId',
        'samplingPattern', 'threadCount', 'uvOrigin', 'world'
    ], 'Blender receipt.profile.applied');
    if (profile.applied.profileId !== profile.id
        || profile.applied.cyclesDevice !== 'CPU'
        || profile.applied.dof !== false
        || profile.applied.motionBlur !== false
        || profile.applied.uvOrigin !== 'lower_left') {
        failStaticSunDepth('static_sun_depth_production_receipt_invalid', 'Raw applied profile is inconsistent.', {});
    }
}

function validateRawReconstruction(value) {
    requireExactKeys(value, [
        'channelId', 'collection', 'completeSelectedChannel',
        'geometryDatablockCount', 'instanceObjectCount', 'inventory', 'mode',
        'normalConversionChecks', 'selectedMappingCount', 'stableIdOrdering',
        'stableIdsPreservedAsCustomMetadata', 'textureSourceCount',
        'uvIdentityChecks'
    ], 'Blender receipt.reconstruction');
    if (value.channelId !== 'static_sun_depth'
        || value.completeSelectedChannel !== true
        || value.mode !== 'full_static_sun_depth'
        || value.stableIdOrdering !== 'canonical_ascending'
        || value.stableIdsPreservedAsCustomMetadata !== true) {
        failStaticSunDepth(
            'static_sun_depth_production_receipt_invalid',
            'Raw reconstruction is incomplete or non-deterministic.',
            {}
        );
    }
    assertStableId(value.collection, 'Blender receipt.reconstruction.collection');
    for (const key of [
        'geometryDatablockCount', 'instanceObjectCount', 'normalConversionChecks',
        'selectedMappingCount', 'textureSourceCount', 'uvIdentityChecks'
    ]) requireNonNegativeInteger(value[key], `reconstruction.${key}`);
    requireExactKeys(value.inventory, [
        'bufferCount', 'casterMappingCount', 'channelIds', 'geometryCount',
        'instanceCount', 'materialCount', 'objectCount', 'receiverMappingCount',
        'semanticBufferDigestsVerified', 'textureCount'
    ], 'Blender receipt.reconstruction.inventory');
    for (const key of Object.keys(value.inventory)) {
        if (key !== 'channelIds' && key !== 'semanticBufferDigestsVerified') {
            requireNonNegativeInteger(value.inventory[key], `reconstruction.inventory.${key}`);
        }
    }
    if (value.inventory.semanticBufferDigestsVerified !== true
        || !Array.isArray(value.inventory.channelIds)
        || !value.inventory.channelIds.includes('static_sun_depth')) {
        failStaticSunDepth(
            'static_sun_depth_production_receipt_invalid',
            'Raw reconstruction inventory was not fully verified.',
            {}
        );
    }
}

/** @param {any} compiler */
function validateCompiler(compiler) {
    requireExactKeys(compiler, [
        'archiveSha256',
        'architecture',
        'backend',
        'buildHash',
        'buildPlatform',
        'executableSha256',
        'signatureSha256',
        'threadCount',
        'version',
        'versionString'
    ], 'production receipt.compiler');
    for (const key of ['archiveSha256', 'executableSha256', 'signatureSha256']) {
        requireSha256(compiler[key], `production receipt.compiler.${key}`);
    }
    for (const key of ['architecture', 'buildHash', 'buildPlatform']) {
        requireNonEmptyString(compiler[key], `production receipt.compiler.${key}`);
    }
    requirePositiveInteger(compiler.threadCount, 'production receipt.compiler.threadCount');
    if (compiler.backend !== 'cycles_cpu'
        || canonicalJsonStringify(compiler.version) !== '[5,2,1]'
        || compiler.versionString !== '5.2.1 LTS') {
        failStaticSunDepth(
            'static_sun_depth_production_compiler_invalid',
            'Production receipt must pin Blender 5.2.1 LTS with Cycles CPU.',
            { backend: compiler.backend, version: compiler.version, versionString: compiler.versionString }
        );
    }
}

/** @param {any} source */
function validateSource(source) {
    requireExactKeys(source, [
        'alphaSemanticsSha256',
        'casterInventorySha256',
        'channelSourceSha256',
        'cityId',
        'geometrySha256',
        'resolvedSourceSha256',
        'usedMaterialsSha256'
    ], 'production receipt.source');
    assertStableId(source.cityId, 'production receipt.source.cityId');
    for (const key of Object.keys(source).filter((key) => key !== 'cityId')) {
        requireSha256(source[key], `production receipt.source.${key}`);
    }
}

/** @param {any} profile */
function validateProfile(profile) {
    requireExactKeys(profile, ['id', 'sha256'], 'production receipt.profile');
    assertStableId(profile.id, 'production receipt.profile.id');
    requireSha256(profile.sha256, 'production receipt.profile.sha256');
}

/** @param {any} channel */
function validateChannel(channel) {
    requireExactKeys(channel, [
        'boundsLightMeters',
        'guardPolicy',
        'guardTexels',
        'interiorTexels',
        'maxDepthMeters',
        'minDepthMeters',
        'order',
        'originWorld',
        'rowOrigin',
        'sunPointDirectionWorld',
        'texelSizeMeters',
        'tileCount'
    ], 'production receipt.channel');
    if (channel.guardTexels !== FIXED_GUARD_TEXELS
        || channel.guardPolicy !== 'copy-adjacent-clamp-exterior-v1') {
        failStaticSunDepth(
            'static_sun_depth_production_guard_policy_invalid',
            'Production V1 requires four texels with the internal-copy/exterior-clamp guard policy.',
            { guardPolicy: channel.guardPolicy, guardTexels: channel.guardTexels }
        );
    }
    if (channel.order !== 'row-major-y-then-x-v1' || channel.rowOrigin !== 'min-light-y-v1') {
        failStaticSunDepth(
            'static_sun_depth_production_tile_inventory_invalid',
            'Production tiles must use increasing light-space Y then X with a minimum-Y row origin.',
            { order: channel.order, rowOrigin: channel.rowOrigin }
        );
    }
    const tileCount = requireIntegerVector2(channel.tileCount, 1, 'production receipt.channel.tileCount');
    const interior = requireIntegerVector2(channel.interiorTexels, 1, 'production receipt.channel.interiorTexels');
    if (interior[0] < FIXED_GUARD_TEXELS
        || interior[1] < FIXED_GUARD_TEXELS) {
        failStaticSunDepth(
            'static_sun_depth_production_layout_invalid',
            'Production V1 requires both rectangular dimensions to contain the four-pixel guard.',
            { interiorTexels: interior }
        );
    }
    const layerCount = tileCount[0] * tileCount[1];
    const storedWidth = interior[0] + FIXED_GUARD_TEXELS * 2;
    const storedHeight = interior[1] + FIXED_GUARD_TEXELS * 2;
    const layerByteLength = storedWidth * storedHeight * 2;
    const payloadByteLength = layerByteLength * layerCount;
    if (!Number.isSafeInteger(layerCount)
        || layerCount > MAX_PRODUCTION_ARRAY_LAYERS
        || !Number.isSafeInteger(layerByteLength)
        || layerByteLength > ILLUMINATION_MAX_CHUNK_BYTES
        || !Number.isSafeInteger(payloadByteLength)
        || payloadByteLength > ILLUMINATION_MAX_PACKAGE_BYTES) {
        failStaticSunDepth(
            'static_sun_depth_production_layout_invalid',
            'Production texture-array layout exceeds the V1 layer, chunk, or package byte limit.',
            { layerByteLength, layerCount, payloadByteLength }
        );
    }
    requirePositiveFinite(channel.texelSizeMeters, 'production receipt.channel.texelSizeMeters');
    requireFiniteVector(channel.originWorld, 3, 'production receipt.channel.originWorld');
    const direction = requireFiniteVector(
        channel.sunPointDirectionWorld,
        3,
        'production receipt.channel.sunPointDirectionWorld'
    );
    const directionLength = Math.hypot(...direction);
    if (Math.abs(directionLength - 1) > 1e-9) {
        throw new RangeError('production receipt.channel.sunPointDirectionWorld must be a unit vector');
    }
    requireFinite(channel.minDepthMeters, 'production receipt.channel.minDepthMeters');
    requireFinite(channel.maxDepthMeters, 'production receipt.channel.maxDepthMeters');
    if (channel.maxDepthMeters <= channel.minDepthMeters) {
        throw new RangeError('production receipt.channel depth bounds must be increasing');
    }
    requireExactKeys(channel.boundsLightMeters, ['max', 'min'], 'production receipt.channel.boundsLightMeters');
    const minimum = requireFiniteVector(
        channel.boundsLightMeters.min,
        2,
        'production receipt.channel.boundsLightMeters.min'
    );
    const maximum = requireFiniteVector(
        channel.boundsLightMeters.max,
        2,
        'production receipt.channel.boundsLightMeters.max'
    );
    const expectedMaximum = [
        minimum[0] + tileCount[0] * interior[0] * channel.texelSizeMeters,
        minimum[1] + tileCount[1] * interior[1] * channel.texelSizeMeters
    ];
    if (!nearlyEqual(maximum[0], expectedMaximum[0]) || !nearlyEqual(maximum[1], expectedMaximum[1])) {
        failStaticSunDepth(
            'static_sun_depth_production_layout_invalid',
            'Production receipt light-space bounds do not match its complete tile grid.',
            { actual: maximum, expected: expectedMaximum }
        );
    }
    const basis = createStableStaticSunDepthBasis(
        channel.sunPointDirectionWorld,
        channel.originWorld
    );
    const originProjection = [
        dot3(channel.originWorld, basis.rightAxisWorld),
        dot3(channel.originWorld, basis.upAxisWorld)
    ];
    const maximumPhaseError = Math.max(...minimum.map((entry, axis) => {
        const phase = (entry + originProjection[axis]) / channel.texelSizeMeters;
        return Math.abs(phase - Math.round(phase));
    }));
    if (channel.texelSizeMeters !== PRODUCTION_TEXEL_SIZE_METERS
        || maximumPhaseError > 1e-9) {
        failStaticSunDepth(
            'static_sun_depth_production_layout_invalid',
            'Production receipt is not aligned to the absolute live-shadow texel lattice.',
            { maximumPhaseError }
        );
    }
}

/** @param {any} sampling @param {any} channel */
function validateSampling(sampling, channel) {
    validateProductionSamplingPolicy(
        sampling,
        channel.sunPointDirectionWorld,
        'production receipt.sampling'
    );
    if (sampling.bias.constantDepthReliefMeters
            + sampling.bias.geometricNormalOffsetMeters
        > channel.maxDepthMeters - channel.minDepthMeters) {
        throw new RangeError('production receipt sampling bias exceeds the depth range');
    }
}

function validateProductionSamplingPolicy(sampling, direction, label) {
    requireExactKeys(sampling, ['bias', 'pcf'], label);
    requireExactKeys(sampling.bias, [
        'constantDepthReliefMeters',
        'geometricNormalOffsetMeters',
        'model'
    ], `${label}.bias`);
    const expectedBias = {
        constantDepthReliefMeters: 0.0697915,
        geometricNormalOffsetMeters: 0.0232,
        model: 'geometric-normal-offset-plus-constant-depth-relief-v1'
    };
    if (canonicalJsonStringify(sampling.bias) !== canonicalJsonStringify(expectedBias)) {
        throw new Error(`${label}.bias must match the final geometric production policy`);
    }
    requireExactKeys(sampling.pcf, [
        'hardwareComparison',
        'model',
        'radiusTexels',
        'sampleCount',
        'screenRotation',
        'shadowMapSizeTexels',
        'shadowMapWorldExtentMeters',
        'sourceMapRightAxisWorld',
        'sourceMapUpAxisWorld'
    ], `${label}.pcf`);
    const pcf = sampling.pcf;
    if (pcf.hardwareComparison !== 'linear-four-compare-taps-v1'
        || pcf.model !== 'three-r183-vogel-5-linear-compare-v1'
        || pcf.radiusTexels !== 1.5
        || pcf.sampleCount !== 5
        || pcf.screenRotation !== 'interleaved-gradient-noise-gl-fragcoord-v1'
        || canonicalJsonStringify(pcf.shadowMapSizeTexels) !== '[16384,16384]'
        || canonicalJsonStringify(pcf.shadowMapWorldExtentMeters) !== '[680,680]') {
        throw new Error(`${label}.pcf must match the effective Three r183 production filter`);
    }
    const right = requireFiniteVector(pcf.sourceMapRightAxisWorld, 3, `${label}.pcf.sourceMapRightAxisWorld`);
    const up = requireFiniteVector(pcf.sourceMapUpAxisWorld, 3, `${label}.pcf.sourceMapUpAxisWorld`);
    const expectedAxes = createThreeR183DirectionalShadowFilterAxes(direction);
    if (!vectorsNearlyEqual(right, expectedAxes.rightAxisWorld, FILTER_AXIS_TOLERANCE)
        || !vectorsNearlyEqual(up, expectedAxes.upAxisWorld, FILTER_AXIS_TOLERANCE)) {
        throw new Error(`${label}.pcf source-map axes do not match Three r183`);
    }
    const worldRadius = pcf.radiusTexels
        * pcf.shadowMapWorldExtentMeters[0]
        / pcf.shadowMapSizeTexels[0];
    if (worldRadius !== PRODUCTION_FILTER_WORLD_RADIUS_METERS) {
        throw new Error(`${label}.pcf effective world radius must be ${PRODUCTION_FILTER_WORLD_RADIUS_METERS}`);
    }
}

/** @param {any[]} tiles @param {any} channel */
function validateReceiptTiles(tiles, channel) {
    if (!Array.isArray(tiles)) throw new TypeError('production receipt.tiles must be an array');
    const expectedCount = channel.tileCount[0] * channel.tileCount[1];
    const expectedByteLength = channel.interiorTexels[0] * channel.interiorTexels[1] * 2;
    if (tiles.length !== expectedCount) {
        failStaticSunDepth(
            'static_sun_depth_production_tile_inventory_invalid',
            'Production receipt does not contain the complete tile grid.',
            { actual: tiles.length, expected: expectedCount }
        );
    }
    tiles.forEach((tile, index) => {
        requireExactKeys(tile, [
            'coordinates',
            'id',
            'interiorByteLength',
            'interiorSha256'
        ], `production receipt.tiles[${index}]`);
        const expectedX = index % channel.tileCount[0];
        const expectedY = Math.floor(index / channel.tileCount[0]);
        const coordinates = requireIntegerVector2(
            tile.coordinates,
            0,
            `production receipt.tiles[${index}].coordinates`
        );
        if (coordinates[0] !== expectedX
            || coordinates[1] !== expectedY
            || tile.id !== tileId(expectedX, expectedY)
            || tile.interiorByteLength !== expectedByteLength) {
            failStaticSunDepth(
                'static_sun_depth_production_tile_inventory_invalid',
                'Production receipt tiles must be complete and in exact row-major order.',
                { index, tileId: tile.id }
            );
        }
        requireSha256(tile.interiorSha256, `production receipt.tiles[${index}].interiorSha256`);
    });
}

/** @param {any} measurements @param {any} channel */
function validateQuantizationMeasurements(measurements, channel, contract) {
    requireExactKeys(measurements, [
        'emptyTexelCount',
        'encodedCodeMaximum',
        'encodedCodeMinimum',
        'maximumAbsoluteErrorMeters',
        'meanAbsoluteErrorMeters',
        'measurementMethod',
        'occupiedTexelCount',
        'sourceDepthMaximumMeters',
        'sourceDepthMinimumMeters'
    ], 'production receipt.quantizationMeasurements');
    if (measurements.measurementMethod !== contract.measurementMethod) {
        failStaticSunDepth(
            'static_sun_depth_production_quantization_invalid',
            'Production quantization error must be measured against Blender canonical depth.',
            { measurementMethod: measurements.measurementMethod }
        );
    }
    requirePositiveInteger(measurements.occupiedTexelCount, 'quantization.occupiedTexelCount');
    requireNonNegativeInteger(measurements.emptyTexelCount, 'quantization.emptyTexelCount');
    const texelCount = channel.tileCount[0]
        * channel.tileCount[1]
        * channel.interiorTexels[0]
        * channel.interiorTexels[1];
    if (measurements.occupiedTexelCount + measurements.emptyTexelCount !== texelCount) {
        failStaticSunDepth(
            'static_sun_depth_production_quantization_invalid',
            'Measured occupied and empty texels do not cover every production interior.',
            { texelCount }
        );
    }
    for (const key of ['encodedCodeMinimum', 'encodedCodeMaximum']) {
        requireIntegerInRange(
            measurements[key],
            0,
            contract.maxQuantized,
            `quantization.${key}`
        );
    }
    if (measurements.encodedCodeMaximum < measurements.encodedCodeMinimum) {
        throw new RangeError('quantization encoded code bounds must be increasing');
    }
    for (const key of ['sourceDepthMinimumMeters', 'sourceDepthMaximumMeters']) {
        requireFinite(measurements[key], `quantization.${key}`);
    }
    if (measurements.sourceDepthMinimumMeters < channel.minDepthMeters
        || measurements.sourceDepthMaximumMeters > channel.maxDepthMeters
        || measurements.sourceDepthMaximumMeters < measurements.sourceDepthMinimumMeters) {
        failStaticSunDepth(
            'static_sun_depth_production_quantization_invalid',
            'Measured source depths are outside the declared signed depth range.',
            {}
        );
    }
    requireNonNegativeFinite(
        measurements.maximumAbsoluteErrorMeters,
        'quantization.maximumAbsoluteErrorMeters'
    );
    requireNonNegativeFinite(measurements.meanAbsoluteErrorMeters, 'quantization.meanAbsoluteErrorMeters');
    const theoreticalMaximum = (channel.maxDepthMeters - channel.minDepthMeters)
        / contract.maxQuantized / 2;
    const tolerance = Math.max(Number.EPSILON, theoreticalMaximum * 1e-12);
    if (measurements.meanAbsoluteErrorMeters > measurements.maximumAbsoluteErrorMeters
        || measurements.maximumAbsoluteErrorMeters > theoreticalMaximum + tolerance) {
        failStaticSunDepth(
            'static_sun_depth_production_quantization_invalid',
            'Measured depth quantization error exceeds the endpoint-inclusive rounding bound.',
            {
                measuredMaximum: measurements.maximumAbsoluteErrorMeters,
                theoreticalMaximum
            }
        );
    }
}

/** @param {readonly unknown[]} values @param {any} receipt */
function validateInteriorTiles(values, receipt) {
    if (!Array.isArray(values) || values.length !== receipt.tiles.length) {
        failStaticSunDepth(
            'static_sun_depth_production_interior_mismatch',
            'Production interior tile bytes do not cover the receipt inventory.',
            { actual: Array.isArray(values) ? values.length : null, expected: receipt.tiles.length }
        );
    }
    return values.map((value, index) => {
        const tile = /** @type {Record<string, any>} */ (value);
        requireExactKeys(tile, ['bytes', 'coordinates', 'id'], `interiorTiles[${index}]`);
        if (!(tile.bytes instanceof Uint8Array)) throw new TypeError(`interiorTiles[${index}].bytes must be a Uint8Array`);
        const expected = receipt.tiles[index];
        if (tile.id !== expected.id
            || canonicalJsonStringify(tile.coordinates) !== canonicalJsonStringify(expected.coordinates)
            || tile.bytes.byteLength !== expected.interiorByteLength
            || rawSha256(tile.bytes) !== expected.interiorSha256) {
            failStaticSunDepth(
                'static_sun_depth_production_interior_mismatch',
                'Production interior tile bytes differ from the Blender receipt.',
                { index, tileId: tile.id ?? null }
            );
        }
        return Object.freeze({
            bytes: tile.bytes,
            coordinates: expected.coordinates,
            id: expected.id
        });
    });
}

/** @param {readonly {bytes: Uint8Array}[]} interiors */
function measureEncodedInteriors(interiors, contract) {
    let emptyTexelCount = 0;
    let encodedCodeMaximum = 0;
    let encodedCodeMinimum = contract.maxQuantized;
    let occupiedTexelCount = 0;
    for (const tile of interiors) {
        for (let offset = 0;
            offset < tile.bytes.byteLength;
            offset += contract.bytesPerTexel) {
            let empty;
            let code;
            if (contract.diagnostic) {
                const alpha = tile.bytes[offset + 3];
                if (alpha !== STATIC_SUN_DEPTH_DIAGNOSTIC_EMPTY_ALPHA
                    && alpha !== STATIC_SUN_DEPTH_DIAGNOSTIC_OCCUPIED_ALPHA) {
                    throw new Error('Diagnostic interior occupancy alpha must be exactly 0 or 255');
                }
                empty = alpha === STATIC_SUN_DEPTH_DIAGNOSTIC_EMPTY_ALPHA;
                code = tile.bytes[offset] * 65536
                    + tile.bytes[offset + 1] * 256
                    + tile.bytes[offset + 2];
                if (empty && code !== 0) {
                    throw new Error('Diagnostic empty texels must have canonical zero RGB depth');
                }
            } else {
                code = tile.bytes[offset] * 256 + tile.bytes[offset + 1];
                empty = code === STATIC_SUN_DEPTH_EMPTY_QUANTIZED;
            }
            if (empty) {
                emptyTexelCount += 1;
            } else {
                occupiedTexelCount += 1;
                encodedCodeMinimum = Math.min(encodedCodeMinimum, code);
                encodedCodeMaximum = Math.max(encodedCodeMaximum, code);
            }
        }
    }
    return Object.freeze({
        emptyTexelCount,
        encodedCodeMaximum,
        encodedCodeMinimum,
        occupiedTexelCount
    });
}

/** @param {ReturnType<typeof measureEncodedInteriors>} actual @param {any} expected */
function requireMeasuredStatisticsMatch(actual, expected) {
    for (const key of [
        'emptyTexelCount',
        'encodedCodeMaximum',
        'encodedCodeMinimum',
        'occupiedTexelCount'
    ]) {
        if (actual[key] !== expected[key]) {
            failStaticSunDepth(
                'static_sun_depth_production_quantization_mismatch',
                'Encoded production interiors contradict Blender quantization measurements.',
                { actual: actual[key], expected: expected[key], metric: key }
            );
        }
    }
}

/** @param {readonly {bytes: Uint8Array}[]} interiors @param {any} channel */
function deriveArrayPayload(interiors, channel, contract) {
    const interiorWidth = channel.interiorTexels[0];
    const interiorHeight = channel.interiorTexels[1];
    const storedWidth = interiorWidth + FIXED_GUARD_TEXELS * 2;
    const storedHeight = interiorHeight + FIXED_GUARD_TEXELS * 2;
    const layerByteLength = storedWidth * storedHeight
        * contract.bytesPerTexel;
    const payload = new Uint8Array(layerByteLength * interiors.length);
    for (let layerIndex = 0; layerIndex < interiors.length; layerIndex += 1) {
        const tileX = layerIndex % channel.tileCount[0];
        const tileY = Math.floor(layerIndex / channel.tileCount[0]);
        for (let storedY = 0; storedY < storedHeight; storedY += 1) {
            const globalY = tileY * interiorHeight + storedY - FIXED_GUARD_TEXELS;
            const clampedY = clamp(globalY, 0, channel.tileCount[1] * interiorHeight - 1);
            const ownerY = Math.floor(clampedY / interiorHeight);
            const localY = clampedY - ownerY * interiorHeight;
            for (let storedX = 0; storedX < storedWidth; storedX += 1) {
                const globalX = tileX * interiorWidth + storedX - FIXED_GUARD_TEXELS;
                const clampedX = clamp(globalX, 0, channel.tileCount[0] * interiorWidth - 1);
                const ownerX = Math.floor(clampedX / interiorWidth);
                const localX = clampedX - ownerX * interiorWidth;
                const sourceBytes = interiors[ownerY * channel.tileCount[0] + ownerX].bytes;
                const sourceOffset = (localY * interiorWidth + localX)
                    * contract.bytesPerTexel;
                const destinationOffset = layerIndex * layerByteLength
                    + (storedY * storedWidth + storedX)
                        * contract.bytesPerTexel;
                payload.set(
                    sourceBytes.subarray(
                        sourceOffset,
                        sourceOffset + contract.bytesPerTexel
                    ),
                    destinationOffset
                );
            }
        }
    }
    return payload;
}

/** @param {Uint8Array} payload @param {any} channel */
function createLayerDescriptors(payload, channel, contract) {
    const storedWidth = channel.interiorTexels[0] + FIXED_GUARD_TEXELS * 2;
    const storedHeight = channel.interiorTexels[1] + FIXED_GUARD_TEXELS * 2;
    const layerByteLength = storedWidth * storedHeight
        * contract.bytesPerTexel;
    return cloneCanonicalJson(Array.from({ length: channel.tileCount[0] * channel.tileCount[1] }, (_, index) => {
        const x = index % channel.tileCount[0];
        const y = Math.floor(index / channel.tileCount[0]);
        const offset = index * layerByteLength;
        return {
            byteLength: layerByteLength,
            coordinates: [x, y],
            id: tileId(x, y),
            offset,
            sha256: rawSha256(payload.subarray(offset, offset + layerByteLength))
        };
    }));
}

/** @param {any} receipt @param {readonly any[]} layers */
function createDescriptor(receipt, layers, contract) {
    const { channel, sampling, source } = receipt;
    const basis = createStableStaticSunDepthBasis(channel.sunPointDirectionWorld, channel.originWorld);
    const tileWidthMeters = channel.interiorTexels[0] * channel.texelSizeMeters;
    const tileHeightMeters = channel.interiorTexels[1] * channel.texelSizeMeters;
    return validateStaticSunDepthTileSetDescriptor({
        identity: {
            alpha: {
                coverage: 'opacity-times-vertex-alpha-times-map-a-times-alpha-map-g-v1',
                forcedOpaque: 'shadow-as-opaque-v1',
                model: 'evaluated-runtime-coverage-v1',
                semanticsSha256: source.alphaSemanticsSha256,
                sidedness: 'material-side-and-shadow-side-v1',
                threshold: 'discard-when-coverage-lt-alpha-test-v1'
            },
            basis,
            casterInventorySha256: source.casterInventorySha256,
            channelId: STATIC_SUN_DEPTH_CHANNEL_ID,
            channelSourceSha256: source.channelSourceSha256,
            channelVersion: STATIC_SUN_DEPTH_CHANNEL_VERSION,
            cityId: source.cityId,
            compilerSignatureSha256: receipt.compiler.signatureSha256,
            encoding: contract.diagnostic ? {
                alphaChannel: 'occupied-255-empty-0-v1',
                blueChannel: 'quantized-low-byte-v1',
                emptyAlpha: STATIC_SUN_DEPTH_DIAGNOSTIC_EMPTY_ALPHA,
                greenChannel: 'quantized-middle-byte-v1',
                id: STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID,
                maxDepthMeters: channel.maxDepthMeters,
                maxQuantized: STATIC_SUN_DEPTH_DIAGNOSTIC_MAX_QUANTIZED,
                minDepthMeters: channel.minDepthMeters,
                occupiedAlpha: STATIC_SUN_DEPTH_DIAGNOSTIC_OCCUPIED_ALPHA,
                quantization: 'linear-endpoints-inclusive-v1',
                redChannel: 'quantized-high-byte-v1'
            } : {
                emptyQuantized: STATIC_SUN_DEPTH_EMPTY_QUANTIZED,
                greenChannel: 'quantized-low-byte-v1',
                id: STATIC_SUN_DEPTH_ENCODING_ID,
                maxDepthMeters: channel.maxDepthMeters,
                maxQuantized: STATIC_SUN_DEPTH_MAX_QUANTIZED,
                minDepthMeters: channel.minDepthMeters,
                quantization: 'linear-endpoints-inclusive-v1',
                redChannel: 'quantized-high-byte-v1'
            },
            layout: {
                boundsLightMeters: channel.boundsLightMeters,
                guardPolicy: channel.guardPolicy,
                guardTexels: channel.guardTexels,
                interiorTexels: channel.interiorTexels,
                lookup: 'half-open-min-inclusive-max-exclusive-v1',
                order: channel.order,
                rowOrigin: channel.rowOrigin,
                texelSizeMeters: channel.texelSizeMeters,
                tileCount: channel.tileCount
            },
            sampling: {
                bias: sampling.bias,
                comparison: 'receiver-depth-minus-bias-lte-caster-depth-v1',
                emptyPolicy: 'visible-v1',
                outOfBoundsPolicy: 'fail-closed-zero-visibility-v1',
                pcf: sampling.pcf
            },
            sunPointDirectionWorld: channel.sunPointDirectionWorld
        },
        schema: STATIC_SUN_DEPTH_TILE_SET_SCHEMA,
        tiles: layers.map((layer, index) => {
            const x = index % channel.tileCount[0];
            const y = Math.floor(index / channel.tileCount[0]);
            const minimumX = channel.boundsLightMeters.min[0] + x * tileWidthMeters;
            const minimumY = channel.boundsLightMeters.min[1] + y * tileHeightMeters;
            return {
                contentSha256: layer.sha256,
                coordinates: [x, y],
                id: layer.id,
                interiorBoundsLightMeters: {
                    max: [minimumX + tileWidthMeters, minimumY + tileHeightMeters],
                    min: [minimumX, minimumY]
                },
                storedTexels: [
                    channel.interiorTexels[0] + FIXED_GUARD_TEXELS * 2,
                    channel.interiorTexels[1] + FIXED_GUARD_TEXELS * 2
                ]
            };
        })
    });
}

/** @param {any} receipt @param {number} payloadByteLength @param {any} guardVerification */
function createProductionMetrics(receipt, payloadByteLength, guardVerification, contract) {
    const { channel, quantizationMeasurements: measured } = receipt;
    const interiorByteLength = channel.tileCount[0]
        * channel.tileCount[1]
        * channel.interiorTexels[0]
        * channel.interiorTexels[1]
        * contract.bytesPerTexel;
    const encodedUnitMeters = (channel.maxDepthMeters - channel.minDepthMeters)
        / contract.maxQuantized;
    return cloneCanonicalJson({
        byteTable: {
            guardOverheadByteLength: payloadByteLength - interiorByteLength,
            interiorByteLength,
            payloadByteLength
        },
        guardVerification,
        quantization: {
            emptyTexelCount: measured.emptyTexelCount,
            encodedCodeMaximum: measured.encodedCodeMaximum,
            encodedCodeMinimum: measured.encodedCodeMinimum,
            encodedUnitMeters,
            measuredMaximumAbsoluteErrorMeters: measured.maximumAbsoluteErrorMeters,
            measuredMeanAbsoluteErrorMeters: measured.meanAbsoluteErrorMeters,
            measurement: 'blender-receipt-measured-v1',
            occupiedTexelCount: measured.occupiedTexelCount,
            sourceDepthMaximumMeters: measured.sourceDepthMaximumMeters,
            sourceDepthMinimumMeters: measured.sourceDepthMinimumMeters,
            theoreticalMaximumRoundingErrorMeters: encodedUnitMeters / 2
        },
        schema: contract.metricsSchema
    });
}

function resolveInteriorSource(globalX, globalY, tileCount, interiorWidth, interiorHeight) {
    const maximumX = tileCount[0] * interiorWidth - 1;
    const maximumY = tileCount[1] * interiorHeight - 1;
    const clampedX = clamp(globalX, 0, maximumX);
    const clampedY = clamp(globalY, 0, maximumY);
    const ownerX = Math.floor(clampedX / interiorWidth);
    const ownerY = Math.floor(clampedY / interiorHeight);
    return {
        layerIndex: ownerY * tileCount[0] + ownerX,
        localX: clampedX - ownerX * interiorWidth,
        localY: clampedY - ownerY * interiorHeight
    };
}

function isInterior(storedX, storedY, interiorWidth, interiorHeight) {
    return storedX >= FIXED_GUARD_TEXELS
        && storedX < FIXED_GUARD_TEXELS + interiorWidth
        && storedY >= FIXED_GUARD_TEXELS
        && storedY < FIXED_GUARD_TEXELS + interiorHeight;
}

function tileId(x, y) {
    return `tile_${String(x).padStart(4, '0')}_${String(y).padStart(4, '0')}`;
}

function rawSha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function domainSeparatedCanonicalSha256(domain, value) {
    const bytes = utf8Bytes(canonicalJsonStringify(value));
    const domainBytes = utf8Bytes(domain);
    const lengths = new Uint8Array(8);
    const view = new DataView(lengths.buffer);
    view.setUint32(0, domainBytes.byteLength, true);
    view.setUint32(4, bytes.byteLength, true);
    return rawSha256(Buffer.concat([Buffer.from(lengths), Buffer.from(domainBytes), Buffer.from(bytes)]));
}

function utf8Bytes(value) {
    return new TextEncoder().encode(value);
}

function requireExactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${label} must be a plain object`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${label} must be a plain object`);
    }
    const actual = Object.keys(value).sort(compareCanonicalStrings);
    const wanted = [...expected].sort(compareCanonicalStrings);
    if (canonicalJsonStringify(actual) !== canonicalJsonStringify(wanted)) {
        throw new Error(`${label} must contain exactly: ${wanted.join(', ')}`);
    }
}

function requireSha256(value, label) {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
        throw new TypeError(`${label} must be a lowercase SHA-256 hex digest`);
    }
}

function requireNonEmptyString(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.trim() !== value) {
        throw new TypeError(`${label} must be a non-empty string without surrounding whitespace`);
    }
}

function requireFinite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${label} must be finite`);
    }
}

function requirePositiveFinite(value, label) {
    requireFinite(value, label);
    if (value <= 0) throw new RangeError(`${label} must be positive`);
}

function requireNonNegativeFinite(value, label) {
    requireFinite(value, label);
    if (value < 0) throw new RangeError(`${label} must be non-negative`);
}

function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(`${label} must be a positive safe integer`);
    }
}

function requireNonNegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${label} must be a non-negative safe integer`);
    }
}

function requireIntegerInRange(value, minimum, maximum, label) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
    }
}

function requireIntegerVector2(value, minimum, label) {
    if (!Array.isArray(value) || value.length !== 2) throw new TypeError(`${label} must contain two integers`);
    value.forEach((entry, index) => requireIntegerInRange(entry, minimum, 16384, `${label}[${index}]`));
    return value;
}

function requireFiniteVector(value, length, label) {
    if (!Array.isArray(value) || value.length !== length) {
        throw new TypeError(`${label} must contain ${length} finite numbers`);
    }
    value.forEach((entry, index) => requireFinite(entry, `${label}[${index}]`));
    return value;
}

function dot3(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function nearlyEqual(left, right) {
    return Math.abs(left - right) <= BOUNDS_TOLERANCE * Math.max(1, Math.abs(left), Math.abs(right));
}

function vectorsNearlyEqual(left, right) {
    return Array.isArray(left)
        && Array.isArray(right)
        && left.length === right.length
        && left.every((entry, index) => nearlyEqual(entry, right[index]));
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}
