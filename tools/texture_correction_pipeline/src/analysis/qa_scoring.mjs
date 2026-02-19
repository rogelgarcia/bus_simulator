// Deterministic QA scoring and recommendation logic for texture correction analysis.
import { clamp } from '../utils.mjs';
import { getMaterialReferenceProfile } from './reference_profiles.mjs';

function finiteOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp01(value) {
    return clamp(value, 0, 1, 0);
}

function round4(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 10000) / 10000;
}

function round2(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

function degToRad(v) {
    return Number(v) * (Math.PI / 180);
}

function normalizeLab(value, fallback) {
    const src = Array.isArray(value) ? value : null;
    if (!src || src.length < 3) return fallback;
    const L = finiteOr(src[0], fallback[0]);
    const a = finiteOr(src[1], fallback[1]);
    const b = finiteOr(src[2], fallback[2]);
    return [L, a, b];
}

export function deltaE2000(labA, labB) {
    const [L1, a1, b1] = normalizeLab(labA, [50, 0, 0]);
    const [L2, a2, b2] = normalizeLab(labB, [50, 0, 0]);

    const avgLp = (L1 + L2) / 2;
    const C1 = Math.sqrt((a1 * a1) + (b1 * b1));
    const C2 = Math.sqrt((a2 * a2) + (b2 * b2));
    const avgC = (C1 + C2) / 2;
    const g = 0.5 * (1 - Math.sqrt((avgC ** 7) / ((avgC ** 7) + (25 ** 7))));

    const a1p = (1 + g) * a1;
    const a2p = (1 + g) * a2;
    const C1p = Math.sqrt((a1p * a1p) + (b1 * b1));
    const C2p = Math.sqrt((a2p * a2p) + (b2 * b2));
    const avgCp = (C1p + C2p) / 2;

    const h1p = Math.atan2(b1, a1p);
    const h2p = Math.atan2(b2, a2p);
    const h1pd = h1p >= 0 ? (h1p * (180 / Math.PI)) : ((h1p * (180 / Math.PI)) + 360);
    const h2pd = h2p >= 0 ? (h2p * (180 / Math.PI)) : ((h2p * (180 / Math.PI)) + 360);

    const deltaLp = L2 - L1;
    const deltaCp = C2p - C1p;

    let deltahp = 0;
    if (C1p * C2p !== 0) {
        if (Math.abs(h2pd - h1pd) <= 180) deltahp = h2pd - h1pd;
        else if (h2pd <= h1pd) deltahp = h2pd - h1pd + 360;
        else deltahp = h2pd - h1pd - 360;
    }

    const deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(degToRad(deltahp / 2));
    let avgHp = 0;
    if (C1p * C2p === 0) avgHp = h1pd + h2pd;
    else if (Math.abs(h1pd - h2pd) <= 180) avgHp = (h1pd + h2pd) / 2;
    else if ((h1pd + h2pd) < 360) avgHp = (h1pd + h2pd + 360) / 2;
    else avgHp = (h1pd + h2pd - 360) / 2;

    const t = 1
        - (0.17 * Math.cos(degToRad(avgHp - 30)))
        + (0.24 * Math.cos(degToRad(2 * avgHp)))
        + (0.32 * Math.cos(degToRad((3 * avgHp) + 6)))
        - (0.20 * Math.cos(degToRad((4 * avgHp) - 63)));

    const deltaTheta = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2));
    const rc = 2 * Math.sqrt((avgCp ** 7) / ((avgCp ** 7) + (25 ** 7)));
    const sl = 1 + ((0.015 * ((avgLp - 50) ** 2)) / Math.sqrt(20 + ((avgLp - 50) ** 2)));
    const sc = 1 + (0.045 * avgCp);
    const sh = 1 + (0.015 * avgCp * t);
    const rt = -Math.sin(degToRad(2 * deltaTheta)) * rc;

    const lTerm = deltaLp / sl;
    const cTerm = deltaCp / sc;
    const hTerm = deltaHp / sh;
    return Math.sqrt((lTerm * lTerm) + (cTerm * cTerm) + (hTerm * hTerm) + (rt * cTerm * hTerm));
}

function normalizeDrift(value, tolerance, floor = 1e-6) {
    const v = Math.abs(finiteOr(value, 0));
    const t = Math.max(floor, finiteOr(tolerance, 1));
    return v / t;
}

function computeCaptureDrift(capture, reference) {
    const tol = reference?.tolerances ?? {};
    const avgLab = normalizeLab(capture?.avgLab, reference?.avgLab ?? [50, 0, 0]);
    const refLab = normalizeLab(reference?.avgLab, [50, 0, 0]);
    const colorDeltaE = deltaE2000(avgLab, refLab);

    const meanLuminance = finiteOr(capture?.meanLuminance, 0);
    const rmsContrast = finiteOr(capture?.rmsContrast, 0);
    const localContrast = finiteOr(capture?.localContrast, 0);
    const gradientEnergy = finiteOr(capture?.gradientEnergy, 0);
    const laplacianVariance = finiteOr(capture?.laplacianVariance, 0);
    const clipping = finiteOr(capture?.clippingBlackPct, 0) + finiteOr(capture?.clippingWhitePct, 0);

    const drift = Object.freeze({
        colorDeltaE: round4(colorDeltaE),
        luminanceDrift: round4(Math.abs(meanLuminance - finiteOr(reference?.meanLuminance, 0))),
        rmsContrastDrift: round4(Math.abs(rmsContrast - finiteOr(reference?.rmsContrast, 0))),
        localContrastDrift: round4(Math.abs(localContrast - finiteOr(reference?.localContrast, 0))),
        gradientEnergyDrift: round4(Math.abs(gradientEnergy - finiteOr(reference?.gradientEnergy, 0))),
        laplacianVarianceDrift: round4(Math.abs(laplacianVariance - finiteOr(reference?.laplacianVariance, 0))),
        clipping: round4(clipping)
    });

    const weightedScore = (
        0.28 * normalizeDrift(drift.colorDeltaE, tol.deltaE2000 ?? 8.0) +
        0.16 * normalizeDrift(drift.luminanceDrift, tol.luminance ?? 0.12) +
        0.14 * normalizeDrift(drift.rmsContrastDrift, tol.rmsContrast ?? 0.1) +
        0.12 * normalizeDrift(drift.localContrastDrift, tol.localContrast ?? 0.06) +
        0.14 * normalizeDrift(drift.gradientEnergyDrift, tol.gradientEnergy ?? 0.03) +
        0.10 * normalizeDrift(drift.laplacianVarianceDrift, tol.laplacianVariance ?? 0.025) +
        0.06 * normalizeDrift(drift.clipping, tol.clipping ?? 0.03)
    );

    return Object.freeze({
        drift,
        weightedScore: round4(weightedScore)
    });
}

function averageCaptureField(captures, key) {
    if (!Array.isArray(captures) || !captures.length) return 0;
    let sum = 0;
    let count = 0;
    for (const item of captures) {
        const n = Number(item?.[key]);
        if (!Number.isFinite(n)) continue;
        sum += n;
        count += 1;
    }
    return count > 0 ? (sum / count) : 0;
}

export function computeRenderAnomalySummary({
    captures,
    presetId,
    classId
}) {
    const list = Array.isArray(captures) ? captures : [];
    if (!list.length) {
        return Object.freeze({
            captureCount: 0,
            outlierCaptureCount: 0,
            anomalyScore: 0,
            qaScore: 100,
            requiresReview: false,
            heuristicWarning: false,
            meanMetrics: Object.freeze({}),
            captures: []
        });
    }

    const reference = getMaterialReferenceProfile({ presetId, classId });
    const evaluatedCaptures = list.map((capture) => {
        const scored = computeCaptureDrift(capture, reference);
        const flag = scored.weightedScore >= 1.0;
        return Object.freeze({
            ...capture,
            drift: scored.drift,
            anomalyScore: scored.weightedScore,
            outlier: flag
        });
    });

    const outlierCaptureCount = evaluatedCaptures.filter((capture) => capture.outlier).length;
    const anomalyScore = averageCaptureField(evaluatedCaptures, 'anomalyScore');
    const qaScore = round2(clamp(100 - (anomalyScore * 45), 0, 100, 100));
    const requiresReview = outlierCaptureCount >= 2;
    const heuristicWarning = outlierCaptureCount === 1;

    const meanMetrics = Object.freeze({
        meanLuminance: round4(averageCaptureField(evaluatedCaptures, 'meanLuminance')),
        rmsContrast: round4(averageCaptureField(evaluatedCaptures, 'rmsContrast')),
        localContrast: round4(averageCaptureField(evaluatedCaptures, 'localContrast')),
        gradientEnergy: round4(averageCaptureField(evaluatedCaptures, 'gradientEnergy')),
        laplacianVariance: round4(averageCaptureField(evaluatedCaptures, 'laplacianVariance')),
        clippingBlackPct: round4(averageCaptureField(evaluatedCaptures, 'clippingBlackPct')),
        clippingWhitePct: round4(averageCaptureField(evaluatedCaptures, 'clippingWhitePct'))
    });

    return Object.freeze({
        captureCount: evaluatedCaptures.length,
        outlierCaptureCount,
        anomalyScore: round4(anomalyScore),
        qaScore,
        requiresReview,
        heuristicWarning,
        meanMetrics,
        captures: evaluatedCaptures
    });
}

export function computeMapAnomalySummary({
    mapMetrics,
    classId,
    presetId
}) {
    const metrics = mapMetrics && typeof mapMetrics === 'object' ? mapMetrics : {};
    const reference = getMaterialReferenceProfile({ presetId, classId });

    const roughness = metrics.roughness ?? {};
    const albedo = metrics.albedo ?? {};
    const normal = metrics.normal ?? {};
    const tilingRisk = metrics.tilingRisk ?? {};

    const roughnessRange = Math.max(0, finiteOr(roughness.p90, 0) - finiteOr(roughness.p10, 0));
    const nearConstantPenalty = roughness.nearConstant ? 1 : 0;
    const blackClip = finiteOr(albedo.clippingBlackPct, 0);
    const whiteClip = finiteOr(albedo.clippingWhitePct, 0);
    const clipPenalty = Math.max(0, (blackClip + whiteClip) - 0.02);
    const normalLengthError = finiteOr(normal.lengthErrorMean, 0);
    const tilingPenalty = Math.max(
        0,
        finiteOr(tilingRisk.baseColorPeakCorrelation, 0),
        finiteOr(tilingRisk.roughnessPeakCorrelation, 0)
    );
    const luminanceDrift = Math.abs(finiteOr(albedo.luminanceP50, reference.meanLuminance) - finiteOr(reference.meanLuminance, 0.34));

    const anomalyScore = (
        0.2 * normalizeDrift(luminanceDrift, 0.14) +
        0.16 * normalizeDrift(clipPenalty, 0.03) +
        0.18 * normalizeDrift(normalLengthError, 0.15) +
        0.2 * normalizeDrift(tilingPenalty, 0.62) +
        0.16 * normalizeDrift(Math.max(0, 0.18 - roughnessRange), 0.18) +
        0.1 * nearConstantPenalty
    );

    const qaScore = round2(clamp(100 - (anomalyScore * 42), 0, 100, 100));
    return Object.freeze({
        anomalyScore: round4(anomalyScore),
        qaScore,
        contributors: Object.freeze({
            luminanceDrift: round4(luminanceDrift),
            clippingPenalty: round4(clipPenalty),
            normalLengthError: round4(normalLengthError),
            tilingPenalty: round4(tilingPenalty),
            roughnessRange: round4(roughnessRange),
            nearConstantPenalty
        })
    });
}

function getClassRoughnessTarget(classId) {
    const key = typeof classId === 'string' ? classId.trim() : '';
    if (key === 'grass') return Object.freeze({ min: 0.65, max: 0.98, p50: 0.8 });
    if (key === 'ground' || key === 'soil') return Object.freeze({ min: 0.58, max: 0.95, p50: 0.72 });
    if (key === 'stone') return Object.freeze({ min: 0.6, max: 0.95, p50: 0.77 });
    if (key === 'metal') return Object.freeze({ min: 0.2, max: 0.75, p50: 0.44 });
    return Object.freeze({ min: 0.5, max: 0.9, p50: 0.65 });
}

export function deriveRecommendedPluginOptions({
    classId,
    presetId,
    mapMetrics,
    renderSummary,
    basePluginOptions
}) {
    const metrics = mapMetrics && typeof mapMetrics === 'object' ? mapMetrics : {};
    const render = renderSummary && typeof renderSummary === 'object' ? renderSummary : {};
    const reference = getMaterialReferenceProfile({ presetId, classId });
    const baseline = basePluginOptions && typeof basePluginOptions === 'object' ? basePluginOptions : {};

    const notes = [];
    const recommended = {};

    const baseRough = baseline.roughness_interval_remap ?? {};
    const targetRough = getClassRoughnessTarget(classId);
    const roughnessP50 = finiteOr(metrics?.roughness?.p50, targetRough.p50);
    const clipWhite = finiteOr(render?.meanMetrics?.clippingWhitePct, 0);

    let roughMin = finiteOr(baseRough.min, targetRough.min);
    let roughMax = finiteOr(baseRough.max, targetRough.max);
    let roughGamma = finiteOr(baseRough.gamma, 1.0);

    if (roughnessP50 < targetRough.p50 - 0.12) {
        roughMin += 0.06;
        roughMax += 0.04;
        notes.push('roughness raised due to low p50 roughness.');
    } else if (roughnessP50 > targetRough.p50 + 0.12) {
        roughMin -= 0.04;
        roughMax -= 0.03;
        notes.push('roughness lowered due to high p50 roughness.');
    }

    if (clipWhite > 0.015) {
        roughMin += 0.04;
        roughMax += 0.03;
        roughGamma = Math.max(0.8, roughGamma - 0.08);
        notes.push('roughness raised to reduce highlight clipping.');
    }

    roughMin = clamp(roughMin, 0, 1, targetRough.min);
    roughMax = clamp(Math.max(roughMin, roughMax), 0, 1, targetRough.max);
    roughGamma = clamp(roughGamma, 0.2, 2.5, 1.0);
    recommended.roughness_interval_remap = Object.freeze({
        min: round4(roughMin),
        max: round4(roughMax),
        gamma: round4(roughGamma)
    });

    const baseAlbedo = baseline.albedo_balance ?? {};
    const lumP50 = finiteOr(metrics?.albedo?.luminanceP50, reference.meanLuminance);
    const satP50 = finiteOr(metrics?.albedo?.saturationP50, reference.targetSaturation);
    const brightnessGain = clamp(finiteOr(reference.meanLuminance, 0.34) / Math.max(0.04, lumP50), 0.6, 1.45, 1.0);
    const saturationGain = clamp(finiteOr(reference.targetSaturation, 0.3) / Math.max(0.05, satP50), 0.7, 1.35, 1.0);
    recommended.albedo_balance = Object.freeze({
        brightness: round4(brightnessGain * finiteOr(baseAlbedo.brightness, 1.0)),
        saturation: round4(saturationGain * finiteOr(baseAlbedo.saturation, 1.0)),
        hueDegrees: round4(finiteOr(baseAlbedo.hueDegrees, 0)),
        tintStrength: round4(finiteOr(baseAlbedo.tintStrength, 0))
    });
    if (Math.abs(brightnessGain - 1) > 0.05 || Math.abs(saturationGain - 1) > 0.06) {
        notes.push('albedo gain adjusted toward class luminance/saturation reference.');
    }

    const baseNormal = baseline.normal_intensity ?? {};
    const normalError = finiteOr(metrics?.normal?.lengthErrorMean, 0);
    const detailEnergy = finiteOr(render?.meanMetrics?.gradientEnergy, finiteOr(reference.gradientEnergy, 0.04));
    let normalStrength = finiteOr(baseNormal.strength, 1.0);
    if (normalError > 0.14) {
        normalStrength *= 0.86;
        notes.push('normal strength reduced due to high normal length error.');
    }
    if (detailEnergy > finiteOr(reference.gradientEnergy, 0.04) * 1.35) {
        normalStrength *= 0.92;
        notes.push('normal strength reduced due to high render detail energy.');
    }
    normalStrength = clamp(normalStrength, 0.45, 1.5, 1.0);
    recommended.normal_intensity = Object.freeze({
        strength: round4(normalStrength)
    });

    return Object.freeze({
        recommendedPluginOptions: Object.freeze(recommended),
        notes: Object.freeze(notes)
    });
}

export function computeOverallQaSummary({
    classId,
    presetId,
    mapMetrics,
    renderSummary
}) {
    const mapSummary = computeMapAnomalySummary({ mapMetrics, classId, presetId });
    const render = renderSummary && typeof renderSummary === 'object' ? renderSummary : {
        anomalyScore: 0,
        qaScore: 100,
        captureCount: 0,
        outlierCaptureCount: 0,
        requiresReview: false,
        heuristicWarning: false
    };

    const overallAnomaly = (0.45 * finiteOr(mapSummary.anomalyScore, 0)) + (0.55 * finiteOr(render.anomalyScore, 0));
    const qaScore = round2(clamp(100 - (overallAnomaly * 46), 0, 100, 100));

    return Object.freeze({
        map: mapSummary,
        render: render,
        anomalyScore: round4(overallAnomaly),
        qaScore,
        requiresReview: !!render.requiresReview || overallAnomaly >= 1.05,
        heuristicWarning: !!render.heuristicWarning || (overallAnomaly >= 0.9 && overallAnomaly < 1.05)
    });
}
