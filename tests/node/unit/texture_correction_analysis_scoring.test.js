// Node unit tests for deterministic texture QA scoring + recommendation logic.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    deltaE2000,
    computeRenderAnomalySummary,
    computeOverallQaSummary,
    deriveRecommendedPluginOptions
} from '../../../tools/texture_correction_pipeline/src/analysis/qa_scoring.mjs';

test('Texture QA: DeltaE2000 is zero for identical Lab colors', () => {
    const value = deltaE2000([54.2, -10.1, 23.5], [54.2, -10.1, 23.5]);
    assert.ok(Math.abs(value) < 1e-9);
});

test('Texture QA: render summary remains stable for near-reference captures', () => {
    const summary = computeRenderAnomalySummary({
        presetId: 'aces',
        classId: 'grass',
        captures: [
            {
                meanLuminance: 0.35,
                rmsContrast: 0.22,
                localContrast: 0.1,
                gradientEnergy: 0.05,
                laplacianVariance: 0.026,
                clippingBlackPct: 0.005,
                clippingWhitePct: 0.004,
                avgLab: [57.5, -14.2, 23.8]
            },
            {
                meanLuminance: 0.37,
                rmsContrast: 0.2,
                localContrast: 0.095,
                gradientEnergy: 0.052,
                laplacianVariance: 0.025,
                clippingBlackPct: 0.006,
                clippingWhitePct: 0.005,
                avgLab: [58.1, -15.4, 24.5]
            }
        ]
    });

    assert.equal(summary.captureCount, 2);
    assert.equal(summary.requiresReview, false);
    assert.equal(summary.heuristicWarning, false);
    assert.ok(summary.qaScore >= 80);
    assert.ok(summary.anomalyScore < 0.6);
});

test('Texture QA: render summary requires review for multi-condition outliers', () => {
    const summary = computeRenderAnomalySummary({
        presetId: 'aces',
        classId: 'grass',
        captures: [
            {
                meanLuminance: 0.9,
                rmsContrast: 0.03,
                localContrast: 0.01,
                gradientEnergy: 0.005,
                laplacianVariance: 0.001,
                clippingBlackPct: 0.0,
                clippingWhitePct: 0.22,
                avgLab: [88.0, -2.0, 5.0]
            },
            {
                meanLuminance: 0.88,
                rmsContrast: 0.035,
                localContrast: 0.015,
                gradientEnergy: 0.006,
                laplacianVariance: 0.0012,
                clippingBlackPct: 0.0,
                clippingWhitePct: 0.2,
                avgLab: [86.0, -1.0, 6.0]
            }
        ]
    });

    assert.equal(summary.captureCount, 2);
    assert.equal(summary.requiresReview, true);
    assert.ok(summary.outlierCaptureCount >= 2);
    assert.ok(summary.anomalyScore >= 1);
    assert.ok(summary.qaScore <= 60);
});

test('Texture QA: recommendation engine adjusts plugin options deterministically', () => {
    const recommendation = deriveRecommendedPluginOptions({
        classId: 'grass',
        presetId: 'aces',
        mapMetrics: {
            albedo: { luminanceP50: 0.19, saturationP50: 0.21, clippingWhitePct: 0.03 },
            roughness: { p50: 0.42 },
            normal: { lengthErrorMean: 0.2 }
        },
        renderSummary: {
            meanMetrics: {
                clippingWhitePct: 0.04,
                gradientEnergy: 0.11
            }
        },
        basePluginOptions: {
            roughness_interval_remap: { min: 0.65, max: 0.98, gamma: 1.0 },
            albedo_balance: { brightness: 1.0, saturation: 1.0, hueDegrees: 0, tintStrength: 0 },
            normal_intensity: { strength: 1.0 }
        }
    });

    const options = recommendation.recommendedPluginOptions;
    assert.ok(options.roughness_interval_remap.min > 0.65);
    assert.ok(options.albedo_balance.brightness > 1.0);
    assert.ok(options.normal_intensity.strength < 1.0);
    assert.ok(recommendation.notes.length >= 1);
});

test('Texture QA: overall summary combines map + render deterministically', () => {
    const overall = computeOverallQaSummary({
        classId: 'grass',
        presetId: 'aces',
        mapMetrics: {
            albedo: { clippingBlackPct: 0.0, clippingWhitePct: 0.01, luminanceP50: 0.34 },
            roughness: { p10: 0.55, p90: 0.9, nearConstant: false },
            normal: { lengthErrorMean: 0.09 },
            tilingRisk: { baseColorPeakCorrelation: 0.31, roughnessPeakCorrelation: 0.28 }
        },
        renderSummary: {
            anomalyScore: 0.42,
            qaScore: 82,
            requiresReview: false,
            heuristicWarning: false
        }
    });

    assert.ok(Number.isFinite(overall.anomalyScore));
    assert.ok(overall.qaScore > 70);
    assert.equal(overall.requiresReview, false);
});

