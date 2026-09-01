// Small deterministic helpers shared by the AI 531 Lab fixture and its tests.
// @ts-check

import {
    AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT
} from '../../illumination_bake_exporter/profile.mjs';

const LIVE_SOURCE_TEXEL_PITCH_METERS = 680 / 16384;
const PRODUCTION_LAYER_COUNT = 77;
const PRODUCTION_INTERIOR_TEXELS = Object.freeze(
    [...AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.interiorPixels]
);
const PRODUCTION_TILE_SIZE_METERS = Object.freeze(
    [...AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.tileSizeMeters]
);
const PRODUCTION_STORED_TEXELS = Object.freeze(
    PRODUCTION_INTERIOR_TEXELS.map(
        (value) => value + AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.guardPixels * 2
    )
);
const PRODUCTION_PAYLOAD_BYTES = PRODUCTION_STORED_TEXELS[0]
    * PRODUCTION_STORED_TEXELS[1] * 2 * PRODUCTION_LAYER_COUNT;

export const LAB_DENSITY_PRODUCTION_PROJECTION = Object.freeze({
    schema: 'ai531-final-rectangular-production-projection-v1',
    layoutPolicy: AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.policy,
    phasePolicy: AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.phasePolicy,
    selectedCandidateId:
        'diagnostic_exact_ratio_1to1_texel_0p04150390625',
    texelSizeMeters: AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.texelSizeMeters,
    tileSizeMeters: PRODUCTION_TILE_SIZE_METERS,
    interiorTexelsPerLayer: PRODUCTION_INTERIOR_TEXELS,
    guardTexels: AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.guardPixels,
    storedTexelsPerLayer: PRODUCTION_STORED_TEXELS,
    layerCount: PRODUCTION_LAYER_COUNT,
    payloadBytes: PRODUCTION_PAYLOAD_BYTES,
    maximumPayloadBytes:
        AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.maximumPayloadBytes,
    within512MiB: PRODUCTION_PAYLOAD_BYTES
        <= AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.maximumPayloadBytes
});

const densityCandidate = (
    id,
    texelSizeMeters,
    exactLatticeRatio,
    strictParityStatus = 'failed'
) => Object.freeze({
    id,
    texelSizeMeters,
    exactLatticeRatio: exactLatticeRatio
        ? Object.freeze({...exactLatticeRatio})
        : null,
    strictParityStatus,
    promotionClass: strictParityStatus === 'passed'
        ? 'production-selected-strict-parity-passed-v1'
        : 'diagnostic-only-strict-parity-failed-v1',
    productionEligible: strictParityStatus === 'passed'
        && id === LAB_DENSITY_PRODUCTION_PROJECTION.selectedCandidateId
        && Math.abs(
            texelSizeMeters - LAB_DENSITY_PRODUCTION_PROJECTION.texelSizeMeters
        ) <= 1e-15
});

export const LAB_DENSITY_DIAGNOSTIC_CANDIDATES = Object.freeze([
    densityCandidate('texel_0p078125', 0.078125, null),
    densityCandidate('texel_0p0625', 0.0625, null),
    densityCandidate(
        'texel_0p062255859375',
        LIVE_SOURCE_TEXEL_PITCH_METERS * 3 / 2,
        {sourceTexels: 3, cacheTexels: 2}
    ),
    densityCandidate(
        'diagnostic_exact_ratio_1to1_texel_0p04150390625',
        LIVE_SOURCE_TEXEL_PITCH_METERS,
        {sourceTexels: 1, cacheTexels: 1},
        'passed'
    ),
    densityCandidate(
        'exact_ratio_65to64_texel_0p04215240478515625',
        LIVE_SOURCE_TEXEL_PITCH_METERS * 65 / 64,
        {sourceTexels: 65, cacheTexels: 64}
    ),
    densityCandidate(
        'exact_ratio_4to3_texel_0p05533854166666667',
        LIVE_SOURCE_TEXEL_PITCH_METERS * 4 / 3,
        {sourceTexels: 4, cacheTexels: 3}
    ),
    densityCandidate(
        'exact_ratio_5to4_texel_0p0518798828125',
        LIVE_SOURCE_TEXEL_PITCH_METERS * 5 / 4,
        {sourceTexels: 5, cacheTexels: 4}
    ),
    densityCandidate(
        'exact_ratio_6to5_texel_0p0498046875',
        LIVE_SOURCE_TEXEL_PITCH_METERS * 6 / 5,
        {sourceTexels: 6, cacheTexels: 5}
    )
]);

/** @param {unknown} value Candidate ID or exact numeric texel size. */
export function findLabDensityDiagnosticCandidate(value) {
    const text = String(value ?? '').trim();
    const numeric = Number(value);
    return LAB_DENSITY_DIAGNOSTIC_CANDIDATES.find((entry) => (
        entry.id === text
        || (Number.isFinite(numeric)
            && Math.abs(entry.texelSizeMeters - numeric) <= 1e-15)
    )) ?? null;
}

/** @returns {{min: number[], max: number[]}} */
export function createEmptyLightDomain() {
    return {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity]
    };
}

/**
 * @param {{min: number[], max: number[]}} target
 * @param {number[]} point Light-space [right, up, depth].
 * @returns {{min: number[], max: number[]}}
 */
export function includeLightDomainPoint(target, point) {
    if (!target || !Array.isArray(point) || point.length !== 3
        || !point.every(Number.isFinite)) {
        throw new TypeError('Lab light-domain point must contain three finite coordinates');
    }
    for (let axis = 0; axis < 3; axis++) {
        target.min[axis] = Math.min(target.min[axis], point[axis]);
        target.max[axis] = Math.max(target.max[axis], point[axis]);
    }
    return target;
}

/**
 * Union one or more finite light-space domains. Keeping depth beside XY makes
 * it impossible for layout and encoding coverage to silently diverge.
 * @param  {...{min: number[], max: number[]}} domains
 * @returns {{min: number[], max: number[]}}
 */
export function unionLightDomains(...domains) {
    const combined = createEmptyLightDomain();
    for (const domain of domains) {
        if (!domain || domain.min?.length !== 3 || domain.max?.length !== 3
            || !domain.min.every(Number.isFinite)
            || !domain.max.every(Number.isFinite)
            || domain.min.some((value, axis) => value > domain.max[axis])) {
            throw new TypeError('Lab light domain must contain finite ordered XYZ bounds');
        }
        includeLightDomainPoint(combined, domain.min);
        includeLightDomainPoint(combined, domain.max);
    }
    return combined;
}

/**
 * Records the exact conversion performed by the CPU sampler and GPU adapter:
 * Three's radius remains expressed in live source-map texels, is converted to
 * a physical light-plane radius, and only then is expressed in cache texels.
 * This is the Vogel disk offset radius; the separate conservative crop margin
 * also includes the hardware-linear comparison footprint.
 * @param {{
 *   oracleRadiusTexels: number,
 *   sourceWorldExtentMeters: readonly number[],
 *   sourceMapSizeTexels: readonly number[],
 *   cacheTexelSizeMeters: number
 * }} value
 */
export function createLiveToCacheVogelRadiusEvidence(value) {
    const oracleRadiusTexels = Number(value?.oracleRadiusTexels);
    const cacheTexelSizeMeters = Number(value?.cacheTexelSizeMeters);
    const sourceWorldExtentMeters = Array.from(value?.sourceWorldExtentMeters ?? []);
    const sourceMapSizeTexels = Array.from(value?.sourceMapSizeTexels ?? []);
    if (!Number.isFinite(oracleRadiusTexels) || oracleRadiusTexels <= 0
        || !Number.isFinite(cacheTexelSizeMeters) || cacheTexelSizeMeters <= 0
        || sourceWorldExtentMeters.length !== 2
        || !sourceWorldExtentMeters.every((entry) => Number.isFinite(entry) && entry > 0)
        || sourceMapSizeTexels.length !== 2
        || !sourceMapSizeTexels.every((entry) => Number.isSafeInteger(entry) && entry > 0)) {
        throw new TypeError('Lab Vogel radius evidence requires positive live and cache dimensions');
    }
    const sourceTexelPitchMeters = sourceWorldExtentMeters.map(
        (extent, axis) => extent / sourceMapSizeTexels[axis]
    );
    if (Math.abs(sourceTexelPitchMeters[0] - sourceTexelPitchMeters[1]) > 1e-12) {
        throw new Error('Lab live directional shadow source must have an isotropic texel pitch');
    }
    const sourceVogelRadiusMeters = oracleRadiusTexels * sourceTexelPitchMeters[0];
    return Object.freeze({
        model: 'three-r183-live-vogel-radius-to-cache-physical-support-v1',
        oracleRadiusTexels,
        oracleRadiusSpace: 'live-directional-shadow-map-source-texels-v1',
        sourceWorldExtentMeters: Object.freeze(sourceWorldExtentMeters),
        sourceMapSizeTexels: Object.freeze(sourceMapSizeTexels),
        sourceTexelPitchMeters: Object.freeze(sourceTexelPitchMeters),
        sourceVogelRadiusMeters,
        cacheTexelSizeMeters,
        derivedCacheRadiusTexels: sourceVogelRadiusMeters / cacheTexelSizeMeters,
        derivation:
            'oracle-radius-times-live-source-pitch-divided-by-cache-pitch-v1'
    });
}

/**
 * Proves an exact reduced rational cache/live pitch ratio across the entire
 * static receiver domain. Integer-scaled phase checks avoid pretending that a
 * repeating rational lattice must be bit-identical in binary floating point.
 * @param {{
 *   cacheTexelSizeMeters: number,
 *   sourceTexelPitchMeters: readonly number[],
 *   sourceAxisValues: readonly number[],
 *   texelCenterPhaseAnchorLightMeters: readonly number[],
 *   receiverDomainLightMeters: {min: number[], max: number[]},
 *   ratio: {sourceTexels: number, cacheTexels: number}
 * }} value
 */
export function createExactRationalLatticePhaseEvidence(value) {
    const cacheTexelSizeMeters = Number(value?.cacheTexelSizeMeters);
    const sourceTexelPitchMeters = Array.from(value?.sourceTexelPitchMeters ?? []);
    const sourceAxisValues = Array.from(value?.sourceAxisValues ?? []);
    const anchors = Array.from(value?.texelCenterPhaseAnchorLightMeters ?? []);
    const receiverDomain = value?.receiverDomainLightMeters;
    const sourceTexels = Number(value?.ratio?.sourceTexels);
    const cacheTexels = Number(value?.ratio?.cacheTexels);
    if (!Number.isFinite(cacheTexelSizeMeters) || cacheTexelSizeMeters <= 0
        || sourceTexelPitchMeters.length !== 2
        || !sourceTexelPitchMeters.every((entry) => Number.isFinite(entry) && entry > 0)
        || sourceAxisValues.length !== 2 || !sourceAxisValues.every(Number.isFinite)
        || anchors.length !== 2 || !anchors.every(Number.isFinite)
        || !receiverDomain || receiverDomain.min?.length !== 3
        || receiverDomain.max?.length !== 3
        || !receiverDomain.min.every(Number.isFinite)
        || !receiverDomain.max.every(Number.isFinite)
        || !Number.isSafeInteger(sourceTexels) || sourceTexels <= 0
        || !Number.isSafeInteger(cacheTexels) || cacheTexels <= 0
        || greatestCommonDivisor(sourceTexels, cacheTexels) !== 1) {
        throw new TypeError('Lab rational lattice evidence input is invalid');
    }
    const expectedRatio = sourceTexels / cacheTexels;
    const ratioErrors = sourceTexelPitchMeters.map((pitch) => (
        Math.abs(cacheTexelSizeMeters / pitch - expectedRatio)
    ));
    const maximumRatioError = Math.max(...ratioErrors);
    const maximumSourceAxisSignError = Math.max(
        ...sourceAxisValues.map((entry) => Math.abs(Math.abs(entry) - 1))
    );
    if (maximumRatioError > 1e-12 || maximumSourceAxisSignError > 1e-12) {
        throw new Error('Lab rational candidate is not commensurate with the live lattice');
    }
    const sourceAxisSigns = sourceAxisValues.map((entry) => Math.sign(entry));
    const axes = [];
    let maximumNumericPhaseError = 0;
    for (let axis = 0; axis < 2; axis++) {
        const receiverMinimum = receiverDomain.min[axis];
        const receiverMaximum = receiverDomain.max[axis];
        if (receiverMinimum > receiverMaximum) {
            throw new TypeError('Lab rational receiver domain must be ordered');
        }
        const anchor = anchors[axis];
        const sourcePitch = sourceTexelPitchMeters[axis];
        const minimumCacheIndex = Math.floor(
            (receiverMinimum - anchor) / cacheTexelSizeMeters + 0.5
        );
        const maximumCacheIndex = Math.ceil(
            (receiverMaximum - anchor) / cacheTexelSizeMeters - 0.5
        );
        const coverageMinimum = anchor
            + (minimumCacheIndex - 0.5) * cacheTexelSizeMeters;
        const coverageMaximum = anchor
            + (maximumCacheIndex + 0.5) * cacheTexelSizeMeters;
        if (coverageMinimum > receiverMinimum + 1e-9
            || coverageMaximum < receiverMaximum - 1e-9) {
            throw new Error('Lab rational lattice does not cover the full receiver domain');
        }
        const sampleIndices = Array.from(new Set([
            minimumCacheIndex,
            minimumCacheIndex + 1,
            minimumCacheIndex + cacheTexels,
            maximumCacheIndex - cacheTexels,
            maximumCacheIndex - 1,
            maximumCacheIndex
        ].filter((index) => index >= minimumCacheIndex && index <= maximumCacheIndex)));
        let axisMaximumPhaseError = 0;
        for (const cacheIndex of sampleIndices) {
            const cacheCenter = anchor + cacheIndex * cacheTexelSizeMeters;
            const actualScaledSourceSteps = cacheTexels
                * (cacheCenter - anchor) / sourcePitch;
            const expectedScaledSourceSteps = cacheIndex * sourceTexels;
            axisMaximumPhaseError = Math.max(
                axisMaximumPhaseError,
                Math.abs(actualScaledSourceSteps - expectedScaledSourceSteps)
            );
        }
        let periodTranslationError = 0;
        if (maximumCacheIndex - minimumCacheIndex >= cacheTexels) {
            for (const cacheIndex of [
                minimumCacheIndex,
                maximumCacheIndex - cacheTexels
            ]) {
                const first = anchor + cacheIndex * cacheTexelSizeMeters;
                const afterPeriod = anchor
                    + (cacheIndex + cacheTexels) * cacheTexelSizeMeters;
                periodTranslationError = Math.max(
                    periodTranslationError,
                    Math.abs((afterPeriod - first) / sourcePitch - sourceTexels)
                );
            }
        }
        maximumNumericPhaseError = Math.max(
            maximumNumericPhaseError,
            axisMaximumPhaseError,
            periodTranslationError
        );
        axes.push(Object.freeze({
            axis,
            sourceAxisSign: sourceAxisSigns[axis],
            receiverDomainMeters: Object.freeze({
                min: receiverMinimum,
                max: receiverMaximum
            }),
            coveringCacheIndexRange: Object.freeze([
                minimumCacheIndex,
                maximumCacheIndex
            ]),
            coveringCacheCellBoundsMeters: Object.freeze({
                min: coverageMinimum,
                max: coverageMaximum
            }),
            sampledCacheIndices: Object.freeze(sampleIndices),
            maximumScaledSourceStepIndexError: axisMaximumPhaseError,
            cachePeriodToSourcePeriodError: periodTranslationError
        }));
    }
    if (maximumNumericPhaseError > 1e-8) {
        throw new Error(`Lab rational lattice phase error ${maximumNumericPhaseError}`);
    }
    const phaseClasses = sourceAxisSigns.map((sign, axis) => Object.freeze(
        Array.from({length: cacheTexels}, (_, cacheIndexModulo) => {
            const signedNumerator = sign * cacheIndexModulo * sourceTexels;
            const positiveNumerator = (
                (signedNumerator % cacheTexels) + cacheTexels
            ) % cacheTexels;
            return Object.freeze({
                axis,
                cacheIndexModulo,
                sourceTexelPhaseNumerator: positiveNumerator,
                sourceTexelPhaseDenominator: cacheTexels
            });
        })
    ));
    return Object.freeze({
        method: 'full-static-receiver-domain-live-lattice-rational-proof-v2',
        ratio: Object.freeze({sourceTexels, cacheTexels}),
        cacheTexelSizeMeters,
        sourceTexelPitchMeters: Object.freeze(sourceTexelPitchMeters),
        sourceAxisSigns: Object.freeze(sourceAxisSigns),
        maximumSourceAxisSignError,
        maximumRatioError,
        signedSourceTexelStepsPerCacheTexel: Object.freeze(
            sourceAxisSigns.map((sign) => sign * expectedRatio)
        ),
        repeatingCacheTexelPeriod: cacheTexels,
        repeatingSourceTexelPeriod: sourceTexels,
        phaseClasses: Object.freeze(phaseClasses),
        axes: Object.freeze(axes),
        maximumNumericPhaseError,
        passed: true
    });
}

function greatestCommonDivisor(left, right) {
    let a = left;
    let b = right;
    while (b !== 0) {
        const next = a % b;
        a = b;
        b = next;
    }
    return a;
}
