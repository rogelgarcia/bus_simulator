// Validates independently measured production alpha-cutout spatial parity evidence.
// @ts-check

import {createHash} from 'node:crypto';
import {lstat, readFile} from 'node:fs/promises';
import path from 'node:path';
import {
    canonicalJsonStringify,
    cloneCanonicalJson,
    compareCanonicalStrings
} from '../../../src/app/illumination/bake_source/CanonicalJson.js';

export const PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_SCHEMA =
    'ai531-production-alpha-cutout-spatial-parity-native-field-v1';
export const PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_V2_SCHEMA =
    'ai531-production-alpha-cutout-spatial-parity-native-field-v2';
export const PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_METHOD =
    'independent-three-r183-live-vs-production-native-mixed-foliage-field-occupancy-and-first-hit-depth-v3';
export const PRODUCTION_ALPHA_CUTOUT_SAMPLER_PARITY_METHOD =
    'three-r183-live-mixed-foliage-shadow-sampler-vs-production-native-depth24-field-spatial-v3';
export const PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_METHOD =
    'all-cutout-casters-projected-light-texel-coverage-v1';
export const PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_V2_METHOD =
    'per-profile-in-out-cutout-casters-projected-light-texel-coverage-v2';
export const PRODUCTION_ALPHA_CUTOUT_LIVE_CAPTURE_METHOD =
    'three-r183-native-shadow-depth-texture-transform-feedback-v1';
export const PRODUCTION_ALPHA_CUTOUT_BAKE_CAPTURE_METHOD =
    'authenticated-production-native-three-mixed-foliage-depth24-field-v2';
export const PRODUCTION_ALPHA_CUTOUT_FIRST_HIT_DEPTH_TOLERANCE_METERS = 5e-3;
export const PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_SCHEMA =
    'ai531-production-alpha-cutout-sample-plan-v1';
export const PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_V2_SCHEMA =
    'ai531-production-alpha-cutout-sample-plan-v2';
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
const SAMPLE_PLAN_EVIDENCE_ENCODING =
    'canonical-json-ai531-alpha-cutout-sample-plan-v1';
const SAMPLE_PLAN_V2_EVIDENCE_ENCODING =
    'canonical-json-ai531-alpha-cutout-sample-plan-v2';
const EVIDENCE_KEYS = Object.freeze([
    'bakeFirstHitDepth',
    'bakeOccupancy',
    'comparison',
    'liveFirstHitDepth',
    'liveOccupancy',
    'samplePlan'
]);
const COMPARISON_MATCHED_EMPTY = 0;
const COMPARISON_MATCHED_OCCUPIED = 1;
const COMPARISON_MISSING_OCCLUDER = 2;
const COMPARISON_UNEXPECTED_OCCLUDER = 3;
const COMPARISON_FIRST_HIT_DEPTH_MISMATCH = 4;

/**
 * Rehash repository-confined evidence files and derive every spatial count from
 * their bytes. The comparison stream is checked against an independent
 * reconstruction so declared zeroes cannot certify production foliage.
 *
 * @param {{
 *   authorityRoot: string,
 *   evidence: Record<string, {byteLength: number, path: string, sha256: string}>,
 *   metadata: Record<string, any>,
 *   repoRoot: string
 * }} options
 * @param {{readFileFn?: typeof readFile, lstatFn?: typeof lstat}} [deps]
 */
export async function buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
    options,
    deps = {}
) {
    const input = requireAllowedKeys(
        options,
        ['authorityRoot', 'evidence', 'metadata', 'repoRoot'],
        'production alpha-cutout evidence build options'
    );
    const metadata = requireAllowedKeys(input.metadata, [
        'alphaSemanticsSha256',
        'casterInventorySha256',
        'cutoutBindingProjectionSha256',
        'cutoutCasterCount',
        'cutoutCasterIdsSha256',
        'descriptorSha256',
        'lightingProfileId',
        'liveDepthAttachmentIdentitySha256',
        'samplePlanSha256',
        'unsupportedBindingIds'
    ], 'production alpha-cutout evidence metadata');
    const evidence = requireExactKeys(
        input.evidence,
        EVIDENCE_KEYS,
        'production alpha-cutout evidence file records'
    );
    const roots = normalizeEvidenceRoots(input.repoRoot, input.authorityRoot);
    const readFileFn = deps.readFileFn ?? readFile;
    const lstatFn = deps.lstatFn ?? lstat;
    const authenticated = {};
    const seenPaths = new Set();
    for (const key of EVIDENCE_KEYS) {
        authenticated[key] = await authenticateEvidenceFile(
            key,
            evidence[key],
            roots,
            seenPaths,
            readFileFn,
            lstatFn
        );
    }
    const samplePlanEvidence = validateAuthenticatedSamplePlan(
        authenticated.samplePlan,
        metadata
    );
    const samplePlan = samplePlanEvidence.plan;

    const liveOccupancy = authenticated.liveOccupancy.bytes;
    const bakeOccupancy = authenticated.bakeOccupancy.bytes;
    if (liveOccupancy.byteLength === 0
        || liveOccupancy.byteLength !== bakeOccupancy.byteLength) {
        throw new Error(
            'Production alpha-cutout occupancy files must have the same nonzero sample count'
        );
    }
    requireOccupancyBytes(liveOccupancy, 'live occupancy');
    requireOccupancyBytes(bakeOccupancy, 'bake occupancy');
    if (samplePlan.samples.length !== liveOccupancy.length) {
        throw new Error(
            'Production alpha-cutout sample plan length must equal the occupancy sample count'
        );
    }

    let firstHitDepthSampleCount = 0;
    for (let index = 0; index < liveOccupancy.length; index += 1) {
        if (liveOccupancy[index] === 1 && bakeOccupancy[index] === 1) {
            firstHitDepthSampleCount += 1;
        }
    }
    const expectedDepthByteLength = firstHitDepthSampleCount * 4;
    if (authenticated.liveFirstHitDepth.bytes.byteLength !== expectedDepthByteLength
        || authenticated.bakeFirstHitDepth.bytes.byteLength !== expectedDepthByteLength) {
        throw new Error(
            'Production alpha-cutout first-hit-depth files must contain one Float32 value per common occupied sample'
        );
    }
    const liveDepth = decodeFloat32Le(
        authenticated.liveFirstHitDepth.bytes,
        'live first-hit-depth'
    );
    const bakeDepth = decodeFloat32Le(
        authenticated.bakeFirstHitDepth.bytes,
        'bake first-hit-depth'
    );

    const comparison = new Uint8Array(liveOccupancy.length);
    let bakeOccupiedSampleCount = 0;
    let depthIndex = 0;
    let firstHitDepthMismatchCount = 0;
    let liveOccupiedSampleCount = 0;
    let matchingOccupancySampleCount = 0;
    let maximumAbsoluteFirstHitDepthErrorMeters = 0;
    let missingOccluderCount = 0;
    let unexpectedOccluderCount = 0;
    for (let index = 0; index < liveOccupancy.length; index += 1) {
        const liveOccupied = liveOccupancy[index] === 1;
        const bakeOccupied = bakeOccupancy[index] === 1;
        if (liveOccupied) liveOccupiedSampleCount += 1;
        if (bakeOccupied) bakeOccupiedSampleCount += 1;
        if (liveOccupied && bakeOccupied) {
            matchingOccupancySampleCount += 1;
            const errorMeters = Math.abs(liveDepth[depthIndex] - bakeDepth[depthIndex]);
            maximumAbsoluteFirstHitDepthErrorMeters = Math.max(
                maximumAbsoluteFirstHitDepthErrorMeters,
                errorMeters
            );
            if (errorMeters
                > PRODUCTION_ALPHA_CUTOUT_FIRST_HIT_DEPTH_TOLERANCE_METERS) {
                comparison[index] = COMPARISON_FIRST_HIT_DEPTH_MISMATCH;
                firstHitDepthMismatchCount += 1;
            } else {
                comparison[index] = COMPARISON_MATCHED_OCCUPIED;
            }
            depthIndex += 1;
        } else if (liveOccupied) {
            comparison[index] = COMPARISON_MISSING_OCCLUDER;
            missingOccluderCount += 1;
        } else if (bakeOccupied) {
            comparison[index] = COMPARISON_UNEXPECTED_OCCLUDER;
            unexpectedOccluderCount += 1;
        } else {
            comparison[index] = COMPARISON_MATCHED_EMPTY;
            matchingOccupancySampleCount += 1;
        }
    }
    if (!bytesEqual(authenticated.comparison.bytes, comparison)) {
        throw new Error(
            'Production alpha-cutout comparison evidence differs from independently derived classifications'
        );
    }

    const mismatchCounts = Object.fromEntries(
        PRODUCTION_ALPHA_CUTOUT_MISMATCH_KEYS.map((key) => [key, 0])
    );
    mismatchCounts.coverage = missingOccluderCount + unexpectedOccluderCount;
    mismatchCounts.firstHitDepth = firstHitDepthMismatchCount;
    const artifact = {
        alphaSemanticsSha256: metadata.alphaSemanticsSha256,
        bakeCaptureMethod: PRODUCTION_ALPHA_CUTOUT_BAKE_CAPTURE_METHOD,
        bakeOccupiedSampleCount,
        casterInventorySha256: metadata.casterInventorySha256,
        cutoutBindingProjectionSha256: metadata.cutoutBindingProjectionSha256,
        cutoutCasterCount: metadata.cutoutCasterCount,
        cutoutCasterIdsSha256: metadata.cutoutCasterIdsSha256,
        descriptorSha256: metadata.descriptorSha256,
        evidence: {
            bakeFirstHitDepth: createEvidenceStream(
                authenticated.bakeFirstHitDepth.record,
                FIRST_HIT_DEPTH_EVIDENCE_ENCODING,
                firstHitDepthSampleCount
            ),
            bakeOccupancy: createEvidenceStream(
                authenticated.bakeOccupancy.record,
                OCCUPANCY_EVIDENCE_ENCODING,
                liveOccupancy.length
            ),
            comparison: createEvidenceStream(
                authenticated.comparison.record,
                COMPARISON_EVIDENCE_ENCODING,
                liveOccupancy.length
            ),
            liveFirstHitDepth: createEvidenceStream(
                authenticated.liveFirstHitDepth.record,
                FIRST_HIT_DEPTH_EVIDENCE_ENCODING,
                firstHitDepthSampleCount
            ),
            liveOccupancy: createEvidenceStream(
                authenticated.liveOccupancy.record,
                OCCUPANCY_EVIDENCE_ENCODING,
                liveOccupancy.length
            ),
            samplePlan: createEvidenceStream(
                authenticated.samplePlan.record,
                samplePlanEvidence.v2
                    ? SAMPLE_PLAN_V2_EVIDENCE_ENCODING
                    : SAMPLE_PLAN_EVIDENCE_ENCODING,
                liveOccupancy.length
            )
        },
        firstHitDepthMismatchCount,
        firstHitDepthSampleCount,
        firstHitDepthToleranceMeters:
            PRODUCTION_ALPHA_CUTOUT_FIRST_HIT_DEPTH_TOLERANCE_METERS,
        lightingProfileId: metadata.lightingProfileId,
        liveCaptureMethod: PRODUCTION_ALPHA_CUTOUT_LIVE_CAPTURE_METHOD,
        liveDepthAttachmentIdentitySha256:
            metadata.liveDepthAttachmentIdentitySha256,
        liveOccupiedSampleCount,
        matchingOccupancySampleCount,
        maximumAbsoluteFirstHitDepthErrorMeters,
        method: PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_METHOD,
        mismatchCounts,
        missingOccluderCount,
        sampleCount: liveOccupancy.length,
        samplePlanMethod: samplePlanEvidence.v2
            ? PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_V2_METHOD
            : PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_METHOD,
        samplePlanSha256: metadata.samplePlanSha256,
        samplerParityMethod: PRODUCTION_ALPHA_CUTOUT_SAMPLER_PARITY_METHOD,
        schema: samplePlanEvidence.v2
            ? PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_V2_SCHEMA
            : PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_SCHEMA,
        status: 'measured_spatial_parity_passed',
        unexpectedOccluderCount,
        unsupportedBindingIds: metadata.unsupportedBindingIds,
        ...(samplePlanEvidence.v2 ? {
            inCoverageCasterCount:
                samplePlanEvidence.inCoverageCasterIds.length,
            inCoverageCasterIds: samplePlanEvidence.inCoverageCasterIds,
            outOfCoverageCasterCount:
                samplePlanEvidence.outOfCoverageCasterIds.length,
            outOfCoverageCasterIds: samplePlanEvidence.outOfCoverageCasterIds
        } : {})
    };
    return validateProductionAlphaCutoutSpatialParityArtifact(artifact);
}

/**
 * Reauthenticate a persisted parity artifact at a later trust boundary.
 *
 * @param {unknown} value
 * @param {{authorityRoot: string, repoRoot: string}} options
 * @param {{readFileFn?: typeof readFile, lstatFn?: typeof lstat}} [deps]
 */
export async function authenticateProductionAlphaCutoutSpatialParityArtifactFiles(
    value,
    options,
    deps = {}
) {
    const artifact = validateProductionAlphaCutoutSpatialParityArtifact(value);
    const roots = requireAllowedKeys(
        options,
        ['authorityRoot', 'repoRoot'],
        'production alpha-cutout evidence authentication roots'
    );
    const evidence = Object.fromEntries(EVIDENCE_KEYS.map((key) => {
        const stream = artifact.evidence[key];
        return [key, {
            byteLength: stream.byteLength,
            path: stream.path,
            sha256: stream.sha256
        }];
    }));
    const rebuilt = await buildProductionAlphaCutoutSpatialParityArtifactFromFiles({
        authorityRoot: roots.authorityRoot,
        evidence,
        metadata: {
            alphaSemanticsSha256: artifact.alphaSemanticsSha256,
            casterInventorySha256: artifact.casterInventorySha256,
            cutoutBindingProjectionSha256:
                artifact.cutoutBindingProjectionSha256,
            cutoutCasterCount: artifact.cutoutCasterCount,
            cutoutCasterIdsSha256: artifact.cutoutCasterIdsSha256,
            descriptorSha256: artifact.descriptorSha256,
            lightingProfileId: artifact.lightingProfileId,
            liveDepthAttachmentIdentitySha256:
                artifact.liveDepthAttachmentIdentitySha256,
            samplePlanSha256: artifact.samplePlanSha256,
            unsupportedBindingIds: artifact.unsupportedBindingIds
        },
        repoRoot: roots.repoRoot
    }, deps);
    if (canonicalJsonStringify(rebuilt) !== canonicalJsonStringify(artifact)) {
        throw new Error(
            'Production alpha-cutout parity artifact differs from independently reauthenticated evidence files'
        );
    }
    return rebuilt;
}

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
    const v2 = artifact.schema === PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_V2_SCHEMA;
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
        'unsupportedBindingIds',
        ...(v2 ? [
            'inCoverageCasterCount',
            'inCoverageCasterIds',
            'outOfCoverageCasterCount',
            'outOfCoverageCasterIds'
        ] : [])
    ], 'production alpha-cutout spatial parity artifact');

    if ((!v2 && artifact.schema !== PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_SCHEMA)
        || artifact.method !== PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_METHOD
        || artifact.samplerParityMethod !== PRODUCTION_ALPHA_CUTOUT_SAMPLER_PARITY_METHOD
        || artifact.samplePlanMethod !== (v2
            ? PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_V2_METHOD
            : PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_METHOD)
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
    let certifiedCasterCount = artifact.cutoutCasterCount;
    if (v2) {
        const inCoverageCasterIds = requireCanonicalIds(
            artifact.inCoverageCasterIds,
            'alpha parity artifact.inCoverageCasterIds',
            false
        );
        const outOfCoverageCasterIds = requireCanonicalIds(
            artifact.outOfCoverageCasterIds,
            'alpha parity artifact.outOfCoverageCasterIds',
            true
        );
        requirePositiveInteger(
            artifact.inCoverageCasterCount,
            'alpha parity artifact.inCoverageCasterCount'
        );
        requireNonNegativeInteger(
            artifact.outOfCoverageCasterCount,
            'alpha parity artifact.outOfCoverageCasterCount'
        );
        const overlap = inCoverageCasterIds.filter(
            (casterId) => outOfCoverageCasterIds.includes(casterId)
        );
        const allCasterIds = [...inCoverageCasterIds, ...outOfCoverageCasterIds]
            .sort(compareCanonicalStrings);
        if (overlap.length > 0
            || artifact.inCoverageCasterCount !== inCoverageCasterIds.length
            || artifact.outOfCoverageCasterCount !== outOfCoverageCasterIds.length
            || allCasterIds.length !== artifact.cutoutCasterCount
            || cutoutCasterIdsSha256(allCasterIds)
                !== artifact.cutoutCasterIdsSha256) {
            throw new Error(
                'Production alpha-cutout v2 coverage classes must form the exact authenticated caster partition'
            );
        }
        certifiedCasterCount = artifact.inCoverageCasterCount;
    }
    if (artifact.sampleCount < certifiedCasterCount * (v2 ? 2 : 1)
        || artifact.firstHitDepthSampleCount < certifiedCasterCount) {
        throw new Error(
            'Production alpha-cutout spatial parity must non-vacuously sample every covered cutout caster'
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
        'liveOccupancy',
        'samplePlan'
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
    validateEvidenceStream(
        evidence.samplePlan,
        'alpha parity sample-plan evidence',
        artifact.schema === PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_V2_SCHEMA
            ? SAMPLE_PLAN_V2_EVIDENCE_ENCODING
            : SAMPLE_PLAN_EVIDENCE_ENCODING,
        artifact.sampleCount,
        evidence.samplePlan?.byteLength
    );
    if (evidence.samplePlan.byteLength <= 0
        || evidence.samplePlan.sha256 !== artifact.samplePlanSha256) {
        throw new Error(
            'Alpha parity sample-plan evidence differs from the authenticated sample plan identity'
        );
    }
}

function validateEvidenceStream(value, label, encoding, sampleCount, byteLength) {
    const stream = requireExactKeys(
        value,
        ['byteLength', 'encoding', 'path', 'sampleCount', 'sha256'],
        label
    );
    requireNonNegativeInteger(stream.byteLength, `${label}.byteLength`);
    requireNonNegativeInteger(stream.sampleCount, `${label}.sampleCount`);
    requireSha256(stream.sha256, `${label}.sha256`);
    requireSafeRepositoryRelativePath(stream.path, `${label}.path`);
    if (stream.encoding !== encoding
        || stream.sampleCount !== sampleCount
        || stream.byteLength !== byteLength) {
        throw new Error(`${label} does not match the authenticated measurement dimensions`);
    }
}

function normalizeEvidenceRoots(repoRootValue, authorityRootValue) {
    if (typeof repoRootValue !== 'string' || !repoRootValue
        || typeof authorityRootValue !== 'string' || !authorityRootValue) {
        throw new TypeError('Production alpha-cutout evidence roots must be paths');
    }
    const repoRoot = path.resolve(repoRootValue);
    const authorityRoot = path.resolve(authorityRootValue);
    requireInside(repoRoot, authorityRoot, true, 'repository');
    return Object.freeze({authorityRoot, repoRoot});
}

async function authenticateEvidenceFile(
    key,
    value,
    roots,
    seenPaths,
    readFileFn,
    lstatFn
) {
    const record = requireExactKeys(
        value,
        ['byteLength', 'path', 'sha256'],
        `production alpha-cutout evidence file '${key}'`
    );
    requireNonNegativeInteger(
        record.byteLength,
        `production alpha-cutout evidence file '${key}'.byteLength`
    );
    requireSafeRepositoryRelativePath(
        record.path,
        `production alpha-cutout evidence file '${key}'.path`
    );
    requireSha256(
        record.sha256,
        `production alpha-cutout evidence file '${key}'.sha256`
    );
    const absolutePath = path.resolve(
        roots.repoRoot,
        ...record.path.split('/')
    );
    requireInside(roots.repoRoot, absolutePath, false, 'repository');
    requireInside(roots.authorityRoot, absolutePath, false, 'artifact authority');
    const identity = process.platform === 'win32'
        ? absolutePath.toLowerCase()
        : absolutePath;
    if (seenPaths.has(identity)) {
        throw new Error('Production alpha-cutout evidence must use unique files');
    }
    seenPaths.add(identity);
    await assertNoSymlinkPathSegments(
        roots.authorityRoot,
        absolutePath,
        lstatFn
    );
    const bytes = copyBytes(
        await readFileFn(absolutePath),
        `production alpha-cutout evidence file '${key}'`
    );
    if (bytes.byteLength !== record.byteLength
        || rawSha256(bytes) !== record.sha256) {
        throw new Error(
            `Production alpha-cutout evidence file '${key}' differs from its authenticated record`
        );
    }
    return Object.freeze({bytes, record: cloneCanonicalJson(record)});
}

async function assertNoSymlinkPathSegments(root, candidate, lstatFn) {
    const absoluteRoot = path.resolve(root);
    const absoluteCandidate = path.resolve(candidate);
    requireInside(absoluteRoot, absoluteCandidate, false, 'artifact authority');
    const relative = path.relative(absoluteRoot, absoluteCandidate);
    let current = absoluteRoot;
    for (const segment of ['', ...relative.split(path.sep)]) {
        if (segment) current = path.join(current, segment);
        const entry = await lstatFn(current);
        if (entry?.isSymbolicLink?.() === true) {
            throw new Error(
                `Production alpha-cutout evidence rejects symbolic-link path segment '${current}'`
            );
        }
    }
}

function requireSafeRepositoryRelativePath(value, label) {
    if (typeof value !== 'string'
        || value.length === 0
        || value.includes('\\')
        || value.startsWith('/')
        || /^[A-Za-z]:/.test(value)
        || path.posix.normalize(value) !== value
        || value.split('/').includes('..')
        || value.split('/').includes('.')) {
        throw new TypeError(`${label} is unsafe`);
    }
    return value;
}

function requireInside(root, candidate, allowRoot, label) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    if ((!allowRoot && !relative)
        || relative.startsWith('..')
        || path.isAbsolute(relative)) {
        throw new Error(
            `Production alpha-cutout evidence path must stay inside the ${label}`
        );
    }
}

function requireOccupancyBytes(bytes, label) {
    for (let index = 0; index < bytes.length; index += 1) {
        if (bytes[index] !== 0 && bytes[index] !== 1) {
            throw new Error(`${label}[${index}] must be encoded as 0 or 1`);
        }
    }
}

function validateAuthenticatedSamplePlan(authenticated, metadata) {
    if (authenticated.record.sha256 !== metadata.samplePlanSha256) {
        throw new Error(
            'Production alpha-cutout sample-plan file differs from samplePlanSha256'
        );
    }
    let text;
    let plan;
    try {
        text = new TextDecoder('utf-8', {fatal: true}).decode(authenticated.bytes);
        plan = JSON.parse(text);
    } catch (error) {
        throw new Error(
            'Production alpha-cutout sample plan must be canonical UTF-8 JSON',
            {cause: error}
        );
    }
    if (canonicalJsonStringify(plan) !== text) {
        throw new Error('Production alpha-cutout sample plan must be canonical JSON');
    }
    const v2 = plan.schema === PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_V2_SCHEMA;
    requireExactKeys(plan, [
        ...(v2 ? ['inCoverageCasterIds', 'outOfCoverageCasterIds'] : []),
        'lightingProfileId',
        'method',
        'samples',
        'schema'
    ], 'production alpha-cutout sample plan');
    if ((!v2 && plan.schema !== PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_SCHEMA)
        || plan.method !== (v2
            ? PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_V2_METHOD
            : PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_METHOD)
        || plan.lightingProfileId !== metadata.lightingProfileId
        || !Array.isArray(plan.samples)
        || plan.samples.length === 0) {
        throw new Error(
            'Production alpha-cutout sample plan identity or sample inventory is invalid'
        );
    }
    const casterIds = new Set();
    const sampleIdentities = new Set();
    for (let index = 0; index < plan.samples.length; index += 1) {
        const sample = requireExactKeys(plan.samples[index], [
            'casterId',
            'globalTexel',
            'index'
        ], `production alpha-cutout sample plan.samples[${index}]`);
        const casterId = requireNonEmptyString(
            sample.casterId,
            `production alpha-cutout sample plan.samples[${index}].casterId`
        );
        if (sample.index !== index
            || !Array.isArray(sample.globalTexel)
            || sample.globalTexel.length !== 2
            || sample.globalTexel.some((value) => (
                !Number.isSafeInteger(value) || value < 0
            ))) {
            throw new Error(
                'Production alpha-cutout sample plan indices and global texels must be canonical'
            );
        }
        const identity = canonicalJsonStringify([
            casterId,
            sample.globalTexel[0],
            sample.globalTexel[1]
        ]);
        if (sampleIdentities.has(identity)) {
            throw new Error(
                'Production alpha-cutout sample plan must not duplicate caster texels'
            );
        }
        sampleIdentities.add(identity);
        casterIds.add(casterId);
    }
    const sampledCasterIds = [...casterIds].sort(compareCanonicalStrings);
    if (v2) {
        const inCoverageCasterIds = requireCanonicalIds(
            plan.inCoverageCasterIds,
            'production alpha-cutout sample plan.inCoverageCasterIds',
            false
        );
        const outOfCoverageCasterIds = requireCanonicalIds(
            plan.outOfCoverageCasterIds,
            'production alpha-cutout sample plan.outOfCoverageCasterIds',
            true
        );
        const overlap = inCoverageCasterIds.filter(
            (casterId) => outOfCoverageCasterIds.includes(casterId)
        );
        if (overlap.length > 0) {
            throw new Error(
                'Production alpha-cutout sample-plan coverage classes must be disjoint'
            );
        }
        if (canonicalJsonStringify(sampledCasterIds)
            !== canonicalJsonStringify(inCoverageCasterIds)) {
            throw new Error(
                'Production alpha-cutout sample plan must sample every in-coverage caster and no out-of-coverage caster'
            );
        }
        const allCasterIds = [...inCoverageCasterIds, ...outOfCoverageCasterIds]
            .sort(compareCanonicalStrings);
        if (allCasterIds.length !== metadata.cutoutCasterCount
            || cutoutCasterIdsSha256(allCasterIds)
                !== metadata.cutoutCasterIdsSha256) {
            throw new Error(
                'Production alpha-cutout sample-plan coverage classes do not partition the authenticated cutout inventory'
            );
        }
        return {
            inCoverageCasterIds,
            outOfCoverageCasterIds,
            plan,
            v2: true
        };
    }
    if (sampledCasterIds.length !== metadata.cutoutCasterCount
        || cutoutCasterIdsSha256(sampledCasterIds)
            !== metadata.cutoutCasterIdsSha256) {
        throw new Error(
            'Production alpha-cutout sample plan must cover every authenticated cutout caster'
        );
    }
    return {plan, v2: false};
}

function cutoutCasterIdsSha256(casterIds) {
    return rawSha256(new TextEncoder().encode(canonicalJsonStringify({
        casterIds,
        schema: 'ai531-production-alpha-cutout-caster-plan-v1'
    })));
}

function decodeFloat32Le(bytes, label) {
    if (bytes.byteLength % 4 !== 0) {
        throw new Error(`${label} byte length must be divisible by four`);
    }
    const result = new Float32Array(bytes.byteLength / 4);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < result.length; index += 1) {
        const value = view.getFloat32(index * 4, true);
        if (!Number.isFinite(value) || value < 0) {
            throw new Error(`${label}[${index}] must be a non-negative finite Float32`);
        }
        result[index] = value;
    }
    return result;
}

function createEvidenceStream(record, encoding, sampleCount) {
    return cloneCanonicalJson({
        byteLength: record.byteLength,
        encoding,
        path: record.path,
        sampleCount,
        sha256: record.sha256
    });
}

function bytesEqual(left, right) {
    return left.byteLength === right.byteLength
        && left.every((value, index) => value === right[index]);
}

function copyBytes(value, label) {
    if (value instanceof Uint8Array) return value.slice();
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(
            value.buffer,
            value.byteOffset,
            value.byteLength
        ).slice();
    }
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    throw new TypeError(`${label} must be bytes`);
}

function rawSha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
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

function requireCanonicalIds(value, label, allowEmpty = true) {
    if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
        throw new TypeError(`${label} must be a${allowEmpty ? 'n' : ' non-empty'} array`);
    }
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
