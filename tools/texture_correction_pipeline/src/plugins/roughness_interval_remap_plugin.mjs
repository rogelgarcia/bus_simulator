// Deterministic roughness interval remap plugin.
import { clamp } from '../utils.mjs';

function resolveSourceMap(material) {
    const mapFiles = material?.mapFiles ?? {};
    if (typeof mapFiles.roughness === 'string' && mapFiles.roughness.trim().length > 0) {
        return Object.freeze({ map: 'roughness', channel: 'r' });
    }
    if (typeof mapFiles.orm === 'string' && mapFiles.orm.trim().length > 0) {
        return Object.freeze({ map: 'orm', channel: 'g' });
    }
    return null;
}

function resolveNormalizeWindow(rawValue) {
    const list = Array.isArray(rawValue) ? rawValue : null;
    if (!list || list.length !== 2) return null;
    const lo = clamp(list[0], 0.0, 100.0, 5.0);
    const hi = clamp(list[1], 0.0, 100.0, 95.0);
    if (!(hi > lo)) return null;
    return Object.freeze([lo, hi]);
}

export const roughnessIntervalRemapPlugin = Object.freeze({
    id: 'roughness_interval_remap',
    label: 'Roughness Interval Remap',
    run(context) {
        const material = context?.material ?? null;
        const source = resolveSourceMap(material);
        if (!source) {
            return Object.freeze({
                applied: false,
                skippedReason: 'missing_roughness_source_map'
            });
        }

        const options = context?.pluginOptions ?? {};
        const min = clamp(options.min, 0.0, 1.0, 0.55);
        const maxRaw = clamp(options.max, 0.0, 1.0, 0.92);
        const max = maxRaw >= min ? maxRaw : min;
        const gamma = clamp(options.gamma, 0.1, 4.0, 1.0);
        const invertInput = options?.invertInput === true;
        const normalizeWindow = resolveNormalizeWindow(options.normalizeInputPercentiles);

        const data = Object.freeze({
            mode: 'interval_remap',
            source,
            outputRange: Object.freeze({ min, max }),
            response: Object.freeze({
                type: 'gamma',
                gamma
            }),
            inputTransform: Object.freeze({
                mode: invertInput ? 'invert' : 'identity'
            }),
            inputNormalization: normalizeWindow
                ? Object.freeze({
                    mode: 'percentile_window',
                    lowPercentile: normalizeWindow[0],
                    highPercentile: normalizeWindow[1]
                })
                : Object.freeze({
                    mode: 'none'
                })
        });

        const adjustments = Object.freeze({
            roughness: Object.freeze({
                min,
                max,
                gamma,
                sourceMap: source.map,
                sourceChannel: source.channel,
                invertInput: invertInput === true ? true : undefined,
                normalizeInputPercentiles: normalizeWindow ? normalizeWindow : null
            })
        });

        return Object.freeze({
            applied: true,
            pluginData: data,
            adjustments
        });
    }
});

export default roughnessIntervalRemapPlugin;
