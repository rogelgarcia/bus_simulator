// Plugin registry for deterministic texture correction execution order.
import { albedoBalancePlugin } from './albedo_balance_plugin.mjs';
import { metalnessPolicyPlugin } from './metalness_policy_plugin.mjs';
import { normalIntensityPlugin } from './normal_intensity_plugin.mjs';
import { roughnessInversionGuardPlugin } from './roughness_inversion_guard_plugin.mjs';
import { roughnessIntervalRemapPlugin } from './roughness_interval_remap_plugin.mjs';
import { scalarMapClippingGuardPlugin } from './scalar_map_clipping_guard_plugin.mjs';

export const TEXTURE_CORRECTION_PLUGINS = Object.freeze([
    roughnessInversionGuardPlugin,
    scalarMapClippingGuardPlugin,
    roughnessIntervalRemapPlugin,
    albedoBalancePlugin,
    normalIntensityPlugin,
    metalnessPolicyPlugin
]);

const PLUGIN_BY_ID = new Map(TEXTURE_CORRECTION_PLUGINS.map((plugin) => [plugin.id, plugin]));

export function getTextureCorrectionPlugin(id) {
    const key = String(id ?? '').trim();
    return PLUGIN_BY_ID.get(key) ?? null;
}

export function getTextureCorrectionPluginIds() {
    return TEXTURE_CORRECTION_PLUGINS.map((plugin) => plugin.id);
}
