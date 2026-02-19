// Deterministic albedo balancing plugin.
import { clamp } from '../utils.mjs';

function hasBaseColorMap(material) {
    const mapFiles = material?.mapFiles ?? {};
    return typeof mapFiles.baseColor === 'string' && mapFiles.baseColor.trim().length > 0;
}

export const albedoBalancePlugin = Object.freeze({
    id: 'albedo_balance',
    label: 'Albedo Balance',
    run(context) {
        const material = context?.material ?? null;
        if (!hasBaseColorMap(material)) {
            return Object.freeze({
                applied: false,
                skippedReason: 'missing_basecolor_map'
            });
        }

        const options = context?.pluginOptions ?? {};
        const brightness = clamp(options.brightness, 0.0, 4.0, 1.0);
        const saturation = clamp(options.saturation, 0.0, 2.0, 1.0);
        const hueDegrees = clamp(options.hueDegrees, -180.0, 180.0, 0.0);
        const tintStrength = clamp(options.tintStrength, 0.0, 1.0, 0.0);

        const data = Object.freeze({
            mode: 'gain_tint',
            brightness,
            saturation,
            hueDegrees,
            tintStrength
        });

        return Object.freeze({
            applied: true,
            pluginData: data,
            adjustments: Object.freeze({
                albedo: data
            })
        });
    }
});

export default albedoBalancePlugin;

