// Deterministic guard that enables roughness input inversion when evidence is high-confidence.
import { clamp } from '../utils.mjs';

function finiteOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function round4(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 10000) / 10000;
}

function getClassTarget(classId) {
    const id = typeof classId === 'string' ? classId.trim() : '';
    if (id === 'grass') return Object.freeze({ min: 0.65, max: 0.98, p50: 0.8 });
    if (id === 'ground' || id === 'soil') return Object.freeze({ min: 0.58, max: 0.95, p50: 0.72 });
    if (id === 'stone') return Object.freeze({ min: 0.6, max: 0.95, p50: 0.77 });
    if (id === 'metal') return Object.freeze({ min: 0.2, max: 0.75, p50: 0.44 });
    return Object.freeze({ min: 0.5, max: 0.9, p50: 0.65 });
}

function toBoolean(value, fallback = false) {
    if (value === true) return true;
    if (value === false) return false;
    return fallback;
}

function scoreDistance({ p10, p50, p90, target }) {
    return (
        Math.abs(p10 - target.min)
        + Math.abs(p50 - target.p50)
        + Math.abs(p90 - target.max)
    );
}

export const roughnessInversionGuardPlugin = Object.freeze({
    id: 'roughness_inversion_guard',
    label: 'Roughness Inversion Guard',
    run(context) {
        const options = context?.pluginOptions ?? {};
        if (toBoolean(options.enabled, true) === false) {
            return Object.freeze({ applied: false });
        }

        const classId = typeof context?.classId === 'string' ? context.classId.trim() : '';
        if (classId === 'metal') {
            return Object.freeze({ applied: false });
        }

        const roughness = context?.analysis?.mapMetrics?.roughness ?? null;
        if (roughness?.available !== true) {
            return Object.freeze({ applied: false });
        }

        const p10 = finiteOr(roughness.p10, NaN);
        const p50 = finiteOr(roughness.p50, NaN);
        const p90 = finiteOr(roughness.p90, NaN);
        const range = finiteOr(roughness.usableRangeWidth, NaN);
        const clippingLowPct = finiteOr(roughness.clippingLowPct, 0);
        if (!Number.isFinite(p10) || !Number.isFinite(p50) || !Number.isFinite(p90) || !Number.isFinite(range)) {
            return Object.freeze({ applied: false });
        }

        const minUsableRange = clamp(options.minUsableRange, 0, 1, 0.18);
        if (range < minUsableRange) {
            return Object.freeze({ applied: false });
        }

        const target = getClassTarget(classId);
        const rawScore = scoreDistance({ p10, p50, p90, target });
        const invScore = scoreDistance({
            p10: 1 - p90,
            p50: 1 - p50,
            p90: 1 - p10,
            target
        });
        const scoreDelta = rawScore - invScore;

        const minScoreDelta = clamp(options.minScoreDelta, 0.05, 2.0, 0.22);
        const lowP50Threshold = clamp(options.lowP50Threshold, 0, 1, Math.max(0, target.p50 - 0.2));
        const lowClipThreshold = clamp(options.lowClipThreshold, 0, 1, 0.55);
        const minEvidenceCount = Math.round(clamp(options.minEvidenceCount, 1, 3, 2));

        const evidence = [];
        if (scoreDelta >= minScoreDelta) evidence.push('score_delta');
        if (p50 <= lowP50Threshold && (1 - p50) >= (target.p50 - 0.06)) evidence.push('low_p50');
        if (clippingLowPct >= lowClipThreshold) evidence.push('low_clipping');

        if (evidence.length < minEvidenceCount) {
            return Object.freeze({ applied: false });
        }

        const confidence = clamp(scoreDelta, 0, 5, 0);
        return Object.freeze({
            applied: true,
            pluginData: Object.freeze({
                mode: 'invert_input',
                invertInput: true,
                confidence: round4(confidence),
                evidence: Object.freeze([...evidence]),
                rawScore: round4(rawScore),
                invertedScore: round4(invScore),
                target: Object.freeze(target)
            }),
            adjustments: Object.freeze({
                roughness: Object.freeze({
                    invertInput: true
                })
            }),
            warnings: Object.freeze([
                `roughness_inversion_guard:invert_input_enabled`
            ])
        });
    }
});

export default roughnessInversionGuardPlugin;
