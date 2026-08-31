// Defines AI 527 capability-profile channel and runtime requirements.
// @ts-check

import {
    ILLUMINATION_CAPABILITY_PROFILE_SCHEMA,
    ILLUMINATION_KNOWN_CHANNELS
} from './IlluminationPackageConstants.js';
import { failIlluminationPackage } from './IlluminationPackageError.js';

const KNOWN = new Set(ILLUMINATION_KNOWN_CHANNELS);

const CATALOG = Object.freeze({
    'transport.fixture_v1': profile({
        id: 'transport.fixture_v1',
        requiredChannels: [],
        optionalChannels: ILLUMINATION_KNOWN_CHANNELS,
        requiredRuntimeCapabilities: [],
        exposure: 'transport_fixture_only'
    }),
    'development.static_sun_v1': profile({
        id: 'development.static_sun_v1',
        requiredChannels: ['static_sun_depth'],
        optionalChannels: [],
        requiredRuntimeCapabilities: ['static_receiver_sampling_v1'],
        exposure: 'internal_validation_only'
    }),
    'baked.hybrid_sun_v1': profile({
        id: 'baked.hybrid_sun_v1',
        requiredChannels: ['static_sun_depth'],
        optionalChannels: ['static_ao_bent_normal'],
        requiredRuntimeCapabilities: [
            'dynamic_bus_shadow_layer_v1',
            'static_sun_sampling_on_bus_v1'
        ],
        exposure: 'player_selectable_after_ai532'
    }),
    'baked.hybrid_sun_indirect_v1': profile({
        id: 'baked.hybrid_sun_indirect_v1',
        requiredChannels: [
            'indirect_irradiance',
            'receiver_mapping',
            'static_sun_depth'
        ],
        optionalChannels: ['static_ao_bent_normal'],
        requiredRuntimeCapabilities: [
            'dynamic_bus_shadow_layer_v1',
            'indirect_receiver_sampling_v1',
            'static_sun_sampling_on_bus_v1'
        ],
        exposure: 'player_selectable_after_channel_validation'
    }),
    'baked.hybrid_sun_direct_indirect_v1': profile({
        id: 'baked.hybrid_sun_direct_indirect_v1',
        requiredChannels: [
            'direct_receiver',
            'indirect_irradiance',
            'receiver_mapping',
            'static_sun_depth'
        ],
        optionalChannels: ['static_ao_bent_normal'],
        requiredRuntimeCapabilities: [
            'direct_receiver_sampling_v1',
            'dynamic_bus_shadow_layer_v1',
            'indirect_receiver_sampling_v1',
            'static_sun_sampling_on_bus_v1'
        ],
        exposure: 'player_selectable_after_direct_promotion'
    })
});

/** @returns {readonly Readonly<Record<string, any>>[]} */
export function listIlluminationCapabilityProfiles() {
    return Object.freeze(Object.values(CATALOG));
}

/**
 * @param {string} id
 * @returns {Readonly<Record<string, any>>}
 */
export function getIlluminationCapabilityProfile(id) {
    const found = CATALOG[id];
    if (!found) {
        failIlluminationPackage('capability_profile_unknown', 'Illumination capability profile is unknown.', { id });
    }
    return found;
}

/**
 * @param {{id: string, requiredChannels: readonly string[], optionalChannels: readonly string[], requiredRuntimeCapabilities: readonly string[], exposure: string}} value
 */
function profile(value) {
    const requiredChannels = sortedUnique(value.requiredChannels);
    const optionalChannels = sortedUnique(value.optionalChannels);
    for (const channelId of [...requiredChannels, ...optionalChannels]) {
        if (!KNOWN.has(channelId)) throw new Error('Capability profile contains unknown channel: ' + channelId);
    }
    if (requiredChannels.some((id) => optionalChannels.includes(id))) {
        throw new Error('Capability profile channel cannot be both required and optional: ' + value.id);
    }
    return Object.freeze({
        schema: ILLUMINATION_CAPABILITY_PROFILE_SCHEMA,
        schemaVersion: 1,
        id: value.id,
        requiredChannels,
        optionalChannels,
        requiredRuntimeCapabilities: sortedUnique(value.requiredRuntimeCapabilities),
        exposure: value.exposure
    });
}

/** @param {readonly string[]} values */
function sortedUnique(values) {
    return Object.freeze([...new Set(values)].sort());
}
