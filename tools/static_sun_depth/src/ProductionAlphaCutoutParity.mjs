// Validates independently measured production alpha-cutout spatial parity evidence.
// @ts-check

import {
    canonicalJsonStringify,
    cloneCanonicalJson,
    compareCanonicalStrings
} from '../../../src/app/illumination/bake_source/CanonicalJson.js';

export const PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_SCHEMA =
    'ai531-production-alpha-cutout-spatial-parity-v1';
export const PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_METHOD =
    'independent-three-r183-live-vs-blender-cutout-occupancy-and-first-hit-depth-v1';
export const PRODUCTION_ALPHA_CUTOUT_SAMPLER_PARITY_METHOD =
    'three-r183-live-shadow-sampler-vs-blender-reconstruction-spatial-v1';
export const PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_METHOD =
    'all-cutout-casters-projected-light-texel-coverage-v1';
export const PRODUCTION_ALPHA_CUTOUT_LIVE_CAPTURE_METHOD =
    'three-r183-native-shadow-depth-texture-transform-feedback-v1';
export const PRODUCTION_ALPHA_CUTOUT_BAKE_CAPTURE_METHOD =
    'blender-cutout-only-cycles-z-primary-ray-v1';
export const PRODUCTION_ALPHA_CUTOUT_FIRST_HIT_DEPTH_TOLERANCE_METERS = 5e-3;
export const PRODUCTION_ALPHA_CUTOUT_MISMATCH_KEYS = Object.freeze([
    'anisotropy',
    'coverage',
    'firstHitDepth',
    'forcedOpaque',
    'mip',
    'sidedness',
    'texture',
    'threshold',
    'uv'
]);

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const OCCUPANCY_EVIDENCE_ENCODING = 'u8-occupied-1-empty-0-v1';
const FIRST_HIT_DEPTH_EVIDENCE_ENCODING = 'f32le-world-depth-common-occupied-v1';
const COMPARISON_EVIDENCE_ENCODING = 'u8-alpha-parity-classification-v1';

/**
 * @param {unknown} value
 * @param {{
 *   alphaSemanticsSha256?: string,
 *   casterInventorySha256?: string,
 *   cutoutBindingProjectionSha256?: string,
 *   cutoutCasterCount?: number,
 *   cutoutCasterIdsSha256?: string,
 *   descriptorSha256?: string,
 *   lightingProfileId?: string,
 *   unsupportedBindingIds?: readonly string[]
 * }} [expectations]
 */
export function validateProductionAlphaCutoutSpatialParityArtifact(
    value,
    expectations = {}
) {
    const artifact = /** @type {Record<string, any>} */ (cloneCanonicalJson(value));
    requireExactKeys(artifact, [
        'alphaSemanticsSha256',
        'bakeCaptureMethod',
        'bakeOccupiedSampleCount',
        'casterInventorySha256',
        'cutoutBindingProjectionSha256',
        'cutoutCasterCount',
        'cutoutCasterIdsSha256',
        'descriptorSha256',
        'evidence',
        'firstHitDepthMismatchCount',
        'firstHitDepthSampleCount',
        'firstHitDepthToleranceMeters',
        'lightingProfileId',
        'liveCaptureMethod',
        'liveDepthAttachmentIdentitySha256',
        'liveOccupiedSampleCount',
        'matchingOccupancySampleCount',
        'maximumAbsoluteFirstHitDepthErrorMeters',
        'method',
        'mismatchCounts',
        'missingOccluderCount',
        'sampleCount',
        'samplePlanMethod',
        'samplePlanSha256',
        'samplerParityMethod',
        'schema',
        'status',
        'unexpectedOccluderCount',
        'unsupportedBindingIds'
    ], 'production alpha-cutout spatial parity artifact');

    if (artifact.schema !== PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_SCHEMA
        || artifact.method !== PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_METHOD
        || artifact.samplerParityMethod !== PRODUCTION_ALPHA_CUTOUT_SAMPLER_PARITY_METHOD
        || artifact.samplePlanMethod !== PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_METHOD
        || artifact.liveCaptureMethod !== PRODUCTION_ALPHA_CUTOUT_LIVE_CAPTURE_METHOD
        || artifact.bakeCaptureMethod !== PRODUCTION_ALPHA_CUTOUT_BAKE_CAPTURE_METHOD
        || artifact.status !== 'measured_spatial_parity_passed') {
        throw new Error(
            'Production alpha-cutout parity artifact must contain independently measured live-versus-bake evidence'
        );
    }

    for (const key of [
        'alphaSemanticsSha256',
        'casterInventorySha256',
        'cutoutBindingProjectionSha256',
        'cutoutCasterIdsSha256',
        'descriptorSha256',
        'liveDepthAttachmentIdentitySha256',
        'samplePlanSha256'
    ]) requireSha256(artifact[key], `alpha parity artifact.${key}`);
    requireNonEmptyString(artifact.lightingProfileId, 'alpha parity artifact.lightingProfileId');
    requirePositiveInteger(artifact.cutoutCasterCount, 'alpha parity artifact.cutoutCasterCount');
    requirePositiveInteger(artifact.sampleCount, 'alpha parity artifact.sampleCount');
    requirePositiveInteger(
        artifact.firstHitDepthSampleCount,
        'alpha parity artifact.firstHitDepthSampleCount'
    );
    for (const key of [
        'bakeOccupiedSampleCount',
        'firstHitDepthMismatchCount',
        'liveOccupiedSampleCount',
        'matchingOccupancySampleCount',
        'missingOccluderCount',
        'unexpectedOccluderCount'
    ]) requireNonNegativeInteger(artifact[key], `alpha parity artifact.${key}`);
    requireNonNegativeFinite(
        artifact.maximumAbsoluteFirstHitDepthErrorMeters,
        'alpha parity artifact.maximumAbsoluteFirstHitDepthErrorMeters'
    );
    if (artifact.firstHitDepthToleranceMeters
        !== PRODUCTION_ALPHA_CUTOUT_FIRST_HIT_DEPTH_TOLERANCE_METERS) {
        throw new Error(
            'Production alpha-cutout parity must use the fixed 5 mm first-hit-depth tolerance'
        );
    }
    if (artifact.sampleCount < artifact.cutoutCasterCount
        || artifact.firstHitDepthSampleCount < artifact.cutoutCasterCount) {
        throw new Error(
            'Production alpha-cutout spatial parity must non-vacuously sample every cutout caster'
        );
    }
    if (artifact.matchingOccupancySampleCount
            + artifact.missingOccluderCount
            + artifact.unexpectedOccluderCount !== artifact.sampleCount
        || artifact.liveOccupiedSampleCount
            !== artifact.firstHitDepthSampleCount + artifact.missingOccluderCount
        || artifact.bakeOccupiedSampleCount
            !== artifact.firstHitDepthSampleCount + artifact.unexpectedOccluderCount) {
        throw new Error(
            'Production alpha-cutout occupancy counts are not a complete spatial partition'
        );
    }

    requireExactKeys(
        artifact.mismatchCounts,
        PRODUCTION_ALPHA_CUTOUT_MISMATCH_KEYS,
        'production alpha-cutout spatial mismatch counts'
    );
    let mismatchTotal = 0;
    for (const key of PRODUCTION_ALPHA_CUTOUT_MISMATCH_KEYS) {
        requireNonNegativeInteger(
            artifact.mismatchCounts[key],
            `alpha parity artifact.mismatchCounts.${key}`
        );
        mismatchTotal += artifact.mismatchCounts[key];
    }
    if (artifact.firstHitDepthMismatchCount
        !== artifact.mismatchCounts.firstHitDepth) {
        throw new Error(
            'Production alpha-cutout first-hit-depth mismatch evidence is inconsistent'
        );
    }

    requireCanonicalIds(
        artifact.unsupportedBindingIds,
        'alpha parity artifact.unsupportedBindingIds'
    );
    validateEvidenceStreams(artifact.evidence, artifact);
    validateExpectations(artifact, expectations);

    if (artifact.matchingOccupancySampleCount !== artifact.sampleCount
        || artifact.missingOccluderCount !== 0
        || artifact.unexpectedOccluderCount !== 0
        || artifact.firstHitDepthMismatchCount !== 0
        || artifact.maximumAbsoluteFirstHitDepthErrorMeters
            > artifact.firstHitDepthToleranceMeters
        || mismatchTotal !== 0) {
        throw new Error(
            'Production alpha-cutout measured spatial occupancy or first-hit-depth parity contains a mismatch'
        );
    }
    return cloneCanonicalJson(artifact);
}

function validateEvidenceStreams(value, artifact) {
    const evidence = requireExactKeys(value, [
        'bakeFirstHitDepth',
        'bakeOccupancy',
        'comparison',
        'liveFirstHitDepth',
        'liveOccupancy'
    ], 'production alpha-cutout parity evidence streams');
    validateEvidenceStream(
        evidence.liveOccupancy,
        'live occupancy evidence',
        OCCUPANCY_EVIDENCE_ENCODING,
        artifact.sampleCount,
        artifact.sampleCount
    );
    validateEvidenceStream(
        evidence.bakeOccupancy,
        'bake occupancy evidence',
        OCCUPANCY_EVIDENCE_ENCODING,
        artifact.sampleCount,
        artifact.sampleCount
    );
    validateEvidenceStream(
        evidence.liveFirstHitDepth,
        'live first-hit-depth evidence',
        FIRST_HIT_DEPTH_EVIDENCE_ENCODING,
        artifact.firstHitDepthSampleCount,
        artifact.firstHitDepthSampleCount * 4
    );
    validateEvidenceStream(
        evidence.bakeFirstHitDepth,
        'bake first-hit-depth evidence',
        FIRST_HIT_DEPTH_EVIDENCE_ENCODING,
        artifact.firstHitDepthSampleCount,
        artifact.firstHitDepthSampleCount * 4
    );
    validateEvidenceStream(
        evidence.comparison,
        'alpha parity comparison evidence',
        COMPARISON_EVIDENCE_ENCODING,
        artifact.sampleCount,
        artifact.sampleCount
    );
}

function validateEvidenceStream(value, label, encoding, sampleCount, byteLength) {
    const stream = requireExactKeys(
        value,
        ['byteLength', 'encoding', 'sampleCount', 'sha256'],
        label
    );
    requireNonNegativeInteger(stream.byteLength, `${label}.byteLength`);
    requireNonNegativeInteger(stream.sampleCount, `${label}.sampleCount`);
    requireSha256(stream.sha256, `${label}.sha256`);
    if (stream.encoding !== encoding
        || stream.sampleCount !== sampleCount
        || stream.byteLength !== byteLength) {
        throw new Error(`${label} does not match the authenticated measurement dimensions`);
    }
}

function validateExpectations(artifact, expectations) {
    const expected = requireAllowedKeys(expectations, [
        'alphaSemanticsSha256',
        'casterInventorySha256',
        'cutoutBindingProjectionSha256',
        'cutoutCasterCount',
        'cutoutCasterIdsSha256',
        'descriptorSha256',
        'lightingProfileId',
        'unsupportedBindingIds'
    ], 'alpha parity expectations');
    for (const key of [
        'alphaSemanticsSha256',
        'casterInventorySha256',
        'cutoutBindingProjectionSha256',
        'cutoutCasterCount',
        'cutoutCasterIdsSha256',
        'descriptorSha256',
        'lightingProfileId'
    ]) {
        if (expected[key] !== undefined && artifact[key] !== expected[key]) {
            throw new Error(`Production alpha-cutout parity artifact ${key} differs from authenticated production input`);
        }
    }
    if (expected.unsupportedBindingIds !== undefined) {
        const expectedIds = requireCanonicalIds(
            expected.unsupportedBindingIds,
            'alpha parity expectations.unsupportedBindingIds'
        );
        if (canonicalJsonStringify(artifact.unsupportedBindingIds)
            !== canonicalJsonStringify(expectedIds)) {
            throw new Error(
                'Unsupported mipmapped or anisotropic cutout bindings require an exact compatible sampler-parity artifact'
            );
        }
    }
}

function requireCanonicalIds(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
    const ids = value.map((entry, index) => (
        requireNonEmptyString(entry, `${label}[${index}]`)
    ));
    const canonical = [...new Set(ids)].sort(compareCanonicalStrings);
    if (canonicalJsonStringify(ids) !== canonicalJsonStringify(canonical)) {
        throw new TypeError(`${label} must contain unique IDs in canonical order`);
    }
    return ids;
}

function requireAllowedKeys(value, allowed, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${label} must be a plain object`);
    }
    const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unexpected.length > 0) {
        throw new TypeError(`${label} contains unexpected ${unexpected.join(', ')}`);
    }
    return /** @type {Record<string, any>} */ (value);
}

function requireExactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${label} must be a plain object`);
    }
    const actualKeys = Object.keys(value).sort(compareCanonicalStrings);
    const expectedKeys = [...expected].sort(compareCanonicalStrings);
    if (canonicalJsonStringify(actualKeys) !== canonicalJsonStringify(expectedKeys)) {
        throw new TypeError(`${label} must contain exactly ${expectedKeys.join(', ')}`);
    }
    return /** @type {Record<string, any>} */ (value);
}

function requireSha256(value, label) {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
        throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
    }
}

function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new TypeError(`${label} must be a positive safe integer`);
    }
}

function requireNonNegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${label} must be a non-negative safe integer`);
    }
}

function requireNonNegativeFinite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new TypeError(`${label} must be a non-negative finite number`);
    }
}

function requireNonEmptyString(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.trim() !== value) {
        throw new TypeError(`${label} must be a non-empty trimmed string`);
    }
    return value;
}
