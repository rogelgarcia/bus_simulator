// Deterministic plugin that enforces class/preset metalness policy defaults.
import { clamp } from '../utils.mjs';

function resolveValue(options) {
    const raw = Number(options?.value);
    if (!Number.isFinite(raw)) return null;
    return clamp(raw, 0, 1, 0);
}

function toBoolean(value, fallback = false) {
    if (value === true) return true;
    if (value === false) return false;
    return fallback;
}

export const metalnessPolicyPlugin = Object.freeze({
    id: 'metalness_policy',
    label: 'Metalness Policy',
    run(context) {
        const options = context?.pluginOptions ?? {};
        if (toBoolean(options.enabled, true) === false) {
            return Object.freeze({ applied: false });
        }

        const value = resolveValue(options);
        if (value == null) {
            return Object.freeze({ applied: false });
        }

        return Object.freeze({
            applied: true,
            pluginData: Object.freeze({
                mode: 'constant',
                value
            }),
            adjustments: Object.freeze({
                metalness: Object.freeze({
                    mode: 'constant',
                    value
                })
            })
        });
    }
});

export default metalnessPolicyPlugin;
