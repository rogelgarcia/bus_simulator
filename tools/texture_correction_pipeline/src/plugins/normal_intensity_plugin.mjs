// Deterministic normal intensity plugin.
import { clamp } from '../utils.mjs';

function hasNormalMap(material) {
    const mapFiles = material?.mapFiles ?? {};
    return typeof mapFiles.normal === 'string' && mapFiles.normal.trim().length > 0;
}

export const normalIntensityPlugin = Object.freeze({
    id: 'normal_intensity',
    label: 'Normal Intensity',
    run(context) {
        const material = context?.material ?? null;
        if (!hasNormalMap(material)) {
            return Object.freeze({
                applied: false,
                skippedReason: 'missing_normal_map'
            });
        }

        const options = context?.pluginOptions ?? {};
        const strength = clamp(options.strength, 0.0, 4.0, 1.0);

        const data = Object.freeze({
            mode: 'scale',
            strength
        });

        return Object.freeze({
            applied: true,
            pluginData: data,
            adjustments: Object.freeze({
                normal: data
            })
        });
    }
});

export default normalIntensityPlugin;

