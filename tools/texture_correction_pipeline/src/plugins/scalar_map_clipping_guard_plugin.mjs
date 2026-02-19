// Deterministic guard that flags high-confidence scalar/albedo clipping anomalies.
import { clamp } from '../utils.mjs';

function finiteOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value, fallback = false) {
    if (value === true) return true;
    if (value === false) return false;
    return fallback;
}

export const scalarMapClippingGuardPlugin = Object.freeze({
    id: 'scalar_map_clipping_guard',
    label: 'Scalar Map Clipping Guard',
    run(context) {
        const options = context?.pluginOptions ?? {};
        if (toBoolean(options.enabled, true) === false) {
            return Object.freeze({ applied: false });
        }

        const classId = typeof context?.classId === 'string' ? context.classId.trim() : '';
        const metrics = context?.analysis?.mapMetrics ?? null;
        if (!metrics || typeof metrics !== 'object') {
            return Object.freeze({ applied: false });
        }

        const albedo = metrics.albedo ?? {};
        const roughness = metrics.roughness ?? {};
        const ao = metrics.ao ?? {};
        const metalness = metrics.metalness ?? {};

        const albedoClipThreshold = clamp(options.albedoClipThreshold, 0, 1, 0.025);
        const roughnessClipThreshold = clamp(options.roughnessClipThreshold, 0, 1, 0.65);
        const aoClipThreshold = clamp(options.aoClipThreshold, 0, 1, 0.92);
        const nonMetalMeanThreshold = clamp(options.nonMetalMeanThreshold, 0, 1, 0.1);
        const nonMetalClass = classId !== 'metal';

        const flags = [];

        if (finiteOr(albedo.clippingWhitePct, 0) > albedoClipThreshold) flags.push('albedo_white_clipping_high');
        if (finiteOr(albedo.clippingBlackPct, 0) > albedoClipThreshold) flags.push('albedo_black_clipping_high');
        if (finiteOr(roughness.clippingLowPct, 0) > roughnessClipThreshold) flags.push('roughness_low_clipping_high');
        if (finiteOr(roughness.clippingHighPct, 0) > roughnessClipThreshold) flags.push('roughness_high_clipping_high');
        if (ao.available === true && finiteOr(ao.binaryMass, 0) > aoClipThreshold) flags.push('ao_binary_mass_high');
        if (nonMetalClass && metalness.available === true && finiteOr(metalness.mean, 0) > nonMetalMeanThreshold) {
            flags.push('non_metal_class_metalness_mean_high');
        }

        if (!flags.length) {
            return Object.freeze({ applied: false });
        }

        return Object.freeze({
            applied: true,
            pluginData: Object.freeze({
                mode: 'map_sanity_flags',
                flags: Object.freeze([...flags]),
                thresholds: Object.freeze({
                    albedoClipThreshold,
                    roughnessClipThreshold,
                    aoClipThreshold,
                    nonMetalMeanThreshold
                })
            }),
            warnings: Object.freeze(flags.map((flag) => `scalar_map_clipping_guard:${flag}`))
        });
    }
});

export default scalarMapClippingGuardPlugin;
