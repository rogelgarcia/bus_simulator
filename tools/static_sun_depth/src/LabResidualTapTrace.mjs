// Traces the diagnostic-only AI 531 Three-r183 Vogel/linear depth comparisons.
// @ts-check

export const LAB_RESIDUAL_TAP_TRACE_SCHEMA =
    'ai531-lab-residual-vogel-rg8-quantization-trace-v1';
export const LAB_RESIDUAL_TAP_TRACE_ID =
    'az135_el08_one_pixel_rg8_quantization_v1';

/**
 * Replays exactly five screen-rotated Vogel lookups and their four bilinear
 * comparison taps. Rendering inputs remain caller-owned and unmodified.
 * @param {{
 *   comparisonDepthMeters: number,
 *   fragmentCoordinatePixels: readonly [number, number],
 *   globalCoordinate: readonly [number, number],
 *   readTap: (globalX: number, globalY: number) => {
 *     outOfBounds: boolean,
 *     quantized: number|null,
 *     preRg8DepthMeters: number|null,
 *     decodedDepthMeters: number|null,
 *     currentSourceDepthMeters: number|null,
 *     currentSourceDepthBufferNormalized: number,
 *     sourceShadowTexel: readonly [number, number],
 *     sourceRasterTexel?: readonly [number, number],
 *     rg8Bytes?: readonly [number, number],
 *     reencodedQuantized?: number,
 *     quantizedMatchesPreRg8Encoding?: boolean
 *   },
 *   sourceXLightTexels: readonly [number, number],
 *   sourceYLightTexels: readonly [number, number]
 * }} options
 */
export function traceLabResidualVogelComparisons(options) {
    const comparisonDepthMeters = requireFinite(
        options?.comparisonDepthMeters,
        'comparisonDepthMeters'
    );
    const fragmentCoordinatePixels = requirePair(
        options?.fragmentCoordinatePixels,
        'fragmentCoordinatePixels'
    );
    const globalCoordinate = requirePair(options?.globalCoordinate, 'globalCoordinate');
    const sourceXLightTexels = requirePair(
        options?.sourceXLightTexels,
        'sourceXLightTexels'
    );
    const sourceYLightTexels = requirePair(
        options?.sourceYLightTexels,
        'sourceYLightTexels'
    );
    if (typeof options?.readTap !== 'function') {
        throw new TypeError('Lab residual trace requires readTap');
    }
    const noise = interleavedGradientNoise(fragmentCoordinatePixels);
    const phiRadians = noise * Math.PI * 2;
    const vogelSamples = [];
    let preRg8WeightedVisibleSampleSum = 0;
    let rg8WeightedVisibleSampleSum = 0;
    let currentWeightedVisibleSampleSum = 0;
    let changedComparisonBitCount = 0;
    let currentVsCacheChangedComparisonBitCount = 0;
    let currentVsPreRg8ChangedComparisonBitCount = 0;
    let sourceOccupancyMismatchTapCount = 0;
    let maximumAbsoluteQuantizationErrorMeters = 0;
    let maximumAbsoluteCurrentVsPreRg8DepthDeltaMeters = 0;
    let minimumAbsolutePreRg8ComparisonMarginMeters = Infinity;
    let minimumAbsoluteRg8ComparisonMarginMeters = Infinity;

    for (let sampleIndex = 0; sampleIndex < 5; sampleIndex += 1) {
        const disk = vogelDiskSample(sampleIndex, 5, phiRadians);
        const offsetTexels = [
            disk[0] * sourceXLightTexels[0] + disk[1] * sourceYLightTexels[0],
            disk[0] * sourceXLightTexels[1] + disk[1] * sourceYLightTexels[1]
        ];
        const lookupCoordinate = [
            globalCoordinate[0] + offsetTexels[0],
            globalCoordinate[1] + offsetTexels[1]
        ];
        const linearPosition = [
            lookupCoordinate[0] - 0.5,
            lookupCoordinate[1] - 0.5
        ];
        const baseTexel = [
            Math.floor(linearPosition[0]),
            Math.floor(linearPosition[1])
        ];
        const fraction = [
            linearPosition[0] - baseTexel[0],
            linearPosition[1] - baseTexel[1]
        ];
        const coordinatesAndWeights = [
            [baseTexel[0], baseTexel[1], (1 - fraction[0]) * (1 - fraction[1])],
            [baseTexel[0] + 1, baseTexel[1], fraction[0] * (1 - fraction[1])],
            [baseTexel[0], baseTexel[1] + 1, (1 - fraction[0]) * fraction[1]],
            [baseTexel[0] + 1, baseTexel[1] + 1, fraction[0] * fraction[1]]
        ];
        const taps = [];
        let preRg8SampleVisibility = 0;
        let rg8SampleVisibility = 0;
        let currentSampleVisibility = 0;
        for (const [globalX, globalY, weight] of coordinatesAndWeights) {
            const tap = requireTap(options.readTap(globalX, globalY));
            const preRg8Visible = tap.outOfBounds
                ? false
                : tap.preRg8DepthMeters === null
                    || comparisonDepthMeters <= tap.preRg8DepthMeters;
            const rg8Visible = tap.outOfBounds
                ? false
                : tap.decodedDepthMeters === null
                    || comparisonDepthMeters <= tap.decodedDepthMeters;
            const currentVisible = tap.outOfBounds
                ? false
                : tap.currentSourceDepthMeters === null
                    || comparisonDepthMeters <= tap.currentSourceDepthMeters;
            const quantizationErrorMeters = tap.preRg8DepthMeters === null
                || tap.decodedDepthMeters === null
                ? null : tap.decodedDepthMeters - tap.preRg8DepthMeters;
            const preRg8ComparisonMarginMeters = tap.preRg8DepthMeters === null
                ? null : tap.preRg8DepthMeters - comparisonDepthMeters;
            const rg8ComparisonMarginMeters = tap.decodedDepthMeters === null
                ? null : tap.decodedDepthMeters - comparisonDepthMeters;
            const currentComparisonMarginMeters = tap.currentSourceDepthMeters === null
                ? null : tap.currentSourceDepthMeters - comparisonDepthMeters;
            const currentVsPreRg8DepthDeltaMeters = tap.preRg8DepthMeters === null
                || tap.currentSourceDepthMeters === null
                ? null : tap.currentSourceDepthMeters - tap.preRg8DepthMeters;
            if (quantizationErrorMeters !== null) {
                maximumAbsoluteQuantizationErrorMeters = Math.max(
                    maximumAbsoluteQuantizationErrorMeters,
                    Math.abs(quantizationErrorMeters)
                );
            }
            if (preRg8ComparisonMarginMeters !== null) {
                minimumAbsolutePreRg8ComparisonMarginMeters = Math.min(
                    minimumAbsolutePreRg8ComparisonMarginMeters,
                    Math.abs(preRg8ComparisonMarginMeters)
                );
            }
            if (rg8ComparisonMarginMeters !== null) {
                minimumAbsoluteRg8ComparisonMarginMeters = Math.min(
                    minimumAbsoluteRg8ComparisonMarginMeters,
                    Math.abs(rg8ComparisonMarginMeters)
                );
            }
            if (preRg8Visible !== rg8Visible) changedComparisonBitCount += 1;
            if (currentVisible !== rg8Visible) currentVsCacheChangedComparisonBitCount += 1;
            if (currentVisible !== preRg8Visible) {
                currentVsPreRg8ChangedComparisonBitCount += 1;
            }
            if ((tap.currentSourceDepthMeters === null)
                !== (tap.preRg8DepthMeters === null)) {
                sourceOccupancyMismatchTapCount += 1;
            }
            if (currentVsPreRg8DepthDeltaMeters !== null) {
                maximumAbsoluteCurrentVsPreRg8DepthDeltaMeters = Math.max(
                    maximumAbsoluteCurrentVsPreRg8DepthDeltaMeters,
                    Math.abs(currentVsPreRg8DepthDeltaMeters)
                );
            }
            preRg8SampleVisibility += (preRg8Visible ? 1 : 0) * weight;
            rg8SampleVisibility += (rg8Visible ? 1 : 0) * weight;
            currentSampleVisibility += (currentVisible ? 1 : 0) * weight;
            taps.push(Object.freeze({
                globalTexel: Object.freeze([globalX, globalY]),
                linearWeight: weight,
                outOfBounds: tap.outOfBounds,
                quantized: tap.quantized,
                rg8Bytes: tap.rg8Bytes ? Object.freeze([...tap.rg8Bytes]) : null,
                sourceRasterTexel: tap.sourceRasterTexel
                    ? Object.freeze([...tap.sourceRasterTexel]) : null,
                sourceShadowTexel: tap.sourceShadowTexel
                    ? Object.freeze([...tap.sourceShadowTexel]) : null,
                currentSourceDepthBufferNormalized:
                    tap.currentSourceDepthBufferNormalized ?? null,
                reencodedQuantized: tap.reencodedQuantized ?? null,
                quantizedMatchesPreRg8Encoding:
                    tap.quantizedMatchesPreRg8Encoding ?? null,
                preRg8DepthMeters: tap.preRg8DepthMeters,
                decodedDepthMeters: tap.decodedDepthMeters,
                currentSourceDepthMeters: tap.currentSourceDepthMeters,
                quantizationErrorMeters,
                currentVsPreRg8DepthDeltaMeters,
                preRg8ComparisonMarginMeters,
                rg8ComparisonMarginMeters,
                currentComparisonMarginMeters,
                preRg8Visible,
                rg8Visible,
                currentVisible,
                comparisonBitChangedByRg8: preRg8Visible !== rg8Visible,
                currentVsCacheComparisonBitChanged: currentVisible !== rg8Visible,
                currentVsPreRg8ComparisonBitChanged: currentVisible !== preRg8Visible
            }));
        }
        preRg8WeightedVisibleSampleSum += preRg8SampleVisibility;
        rg8WeightedVisibleSampleSum += rg8SampleVisibility;
        currentWeightedVisibleSampleSum += currentSampleVisibility;
        vogelSamples.push(Object.freeze({
            sampleIndex,
            disk: Object.freeze(disk),
            offsetTexels: Object.freeze(offsetTexels),
            lookupCoordinate: Object.freeze(lookupCoordinate),
            linearPosition: Object.freeze(linearPosition),
            baseTexel: Object.freeze(baseTexel),
            fraction: Object.freeze(fraction),
            preRg8SampleVisibility,
            rg8SampleVisibility,
            currentSampleVisibility,
            taps: Object.freeze(taps)
        }));
    }
    const preRg8Visibility = preRg8WeightedVisibleSampleSum / 5;
    const rg8Visibility = rg8WeightedVisibleSampleSum / 5;
    const currentVisibility = currentWeightedVisibleSampleSum / 5;
    const visibilityDelta = rg8Visibility - preRg8Visibility;
    const quantizationCausal = changedComparisonBitCount > 0
        && Math.abs(visibilityDelta) > 1e-15;
    return Object.freeze({
        schema: LAB_RESIDUAL_TAP_TRACE_SCHEMA,
        comparisonDepthMeters,
        fragmentCoordinatePixels: Object.freeze([...fragmentCoordinatePixels]),
        globalCoordinate: Object.freeze([...globalCoordinate]),
        interleavedGradientNoise: noise,
        phiRadians,
        sourceXLightTexels: Object.freeze([...sourceXLightTexels]),
        sourceYLightTexels: Object.freeze([...sourceYLightTexels]),
        vogelSampleCount: 5,
        comparisonTapCount: 20,
        changedComparisonBitCount,
        currentVsCacheChangedComparisonBitCount,
        currentVsPreRg8ChangedComparisonBitCount,
        sourceOccupancyMismatchTapCount,
        maximumAbsoluteQuantizationErrorMeters,
        maximumAbsoluteCurrentVsPreRg8DepthDeltaMeters,
        minimumAbsolutePreRg8ComparisonMarginMeters:
            finiteOrNull(minimumAbsolutePreRg8ComparisonMarginMeters),
        minimumAbsoluteRg8ComparisonMarginMeters:
            finiteOrNull(minimumAbsoluteRg8ComparisonMarginMeters),
        preRg8WeightedVisibleSampleSum,
        rg8WeightedVisibleSampleSum,
        currentWeightedVisibleSampleSum,
        preRg8Visibility,
        rg8Visibility,
        currentVisibility,
        currentVsCacheVisibilityDelta: rg8Visibility - currentVisibility,
        currentVsPreRg8VisibilityDelta: preRg8Visibility - currentVisibility,
        visibilityDelta,
        quantizationAssessment: Object.freeze({
            causal: quantizationCausal,
            conclusion: quantizationCausal
                ? 'proven_rg8_changed_weighted_depth_comparison_result'
                : changedComparisonBitCount === 0
                    ? 'refuted_no_depth_comparison_bit_changed'
                    : 'refuted_changed_bits_cancelled_in_weighted_filter'
        }),
        sourceRasterAssessment: Object.freeze({
            currentMatchesBakePreRg8:
                sourceOccupancyMismatchTapCount === 0
                && currentVsPreRg8ChangedComparisonBitCount === 0,
            conclusion: sourceOccupancyMismatchTapCount > 0
                ? 'current_vs_bake_source_occupancy_or_alpha_coverage_mismatch'
                : currentVsPreRg8ChangedComparisonBitCount > 0
                    ? 'current_vs_bake_source_depth_comparison_mismatch'
                    : 'current_and_bake_source_comparison_bits_match'
        }),
        vogelSamples: Object.freeze(vogelSamples)
    });
}

/** @param {unknown} value */
function requireTap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || typeof value.outOfBounds !== 'boolean'
        || !(value.quantized === null
            || Number.isSafeInteger(value.quantized)
                && value.quantized >= 0 && value.quantized <= 65535)
        || !(value.preRg8DepthMeters === null
            || Number.isFinite(value.preRg8DepthMeters))
        || !(value.decodedDepthMeters === null
            || Number.isFinite(value.decodedDepthMeters))
        || !(value.currentSourceDepthMeters === null
            || Number.isFinite(value.currentSourceDepthMeters))) {
        throw new TypeError('Lab residual comparison tap is invalid');
    }
    if (!value.outOfBounds
        && (!Array.isArray(value.sourceRasterTexel)
            || value.sourceRasterTexel.length !== 2
            || value.sourceRasterTexel.some((entry) => !Number.isSafeInteger(entry))
            || !Array.isArray(value.rg8Bytes)
            || value.rg8Bytes.length !== 2
            || value.rg8Bytes.some((entry) => (
                !Number.isSafeInteger(entry) || entry < 0 || entry > 255
            ))
            || !Number.isSafeInteger(value.reencodedQuantized)
            || value.reencodedQuantized < 0 || value.reencodedQuantized > 65535
            || typeof value.quantizedMatchesPreRg8Encoding !== 'boolean')) {
        throw new TypeError('Lab residual resident comparison tap metadata is invalid');
    }
    if (!value.outOfBounds
        && (!Array.isArray(value.sourceShadowTexel)
            || value.sourceShadowTexel.length !== 2
            || value.sourceShadowTexel.some((entry) => !Number.isSafeInteger(entry))
            || !Number.isFinite(value.currentSourceDepthBufferNormalized)
            || value.currentSourceDepthBufferNormalized < 0
            || value.currentSourceDepthBufferNormalized > 1)) {
        throw new TypeError('Lab residual current-source tap metadata is invalid');
    }
    return value;
}

/** @param {unknown} value @param {string} label */
function requirePair(value, label) {
    if (!Array.isArray(value) || value.length !== 2
        || value.some((entry) => !Number.isFinite(entry))) {
        throw new TypeError(`Lab residual ${label} must be a finite pair`);
    }
    return /** @type {[number, number]} */ ([value[0], value[1]]);
}

/** @param {unknown} value @param {string} label */
function requireFinite(value, label) {
    if (!Number.isFinite(value)) throw new TypeError(`Lab residual ${label} must be finite`);
    return Number(value);
}

/** @param {readonly [number, number]} position */
function interleavedGradientNoise(position) {
    return fract(52.9829189 * fract(
        position[0] * 0.06711056 + position[1] * 0.00583715
    ));
}

/** @param {number} sampleIndex @param {number} sampleCount @param {number} phi */
function vogelDiskSample(sampleIndex, sampleCount, phi) {
    const radius = Math.sqrt((sampleIndex + 0.5) / sampleCount);
    const theta = sampleIndex * 2.399963229728653 + phi;
    return [Math.cos(theta) * radius, Math.sin(theta) * radius];
}

/** @param {number} value */
function fract(value) {
    return value - Math.floor(value);
}

/** @param {number} value */
function finiteOrNull(value) {
    return Number.isFinite(value) ? value : null;
}
