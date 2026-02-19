// Baseline preset-aware correction profile for deterministic terrain calibration.
import { CORRECTION_PRESET_BASELINE } from './constants.mjs';

const GLOBAL_ENABLED_PLUGINS = Object.freeze([
    'roughness_inversion_guard',
    'scalar_map_clipping_guard',
    'roughness_interval_remap',
    'albedo_balance',
    'normal_intensity',
    'metalness_policy'
]);

const DEFAULT_PLUGIN_OPTIONS = Object.freeze({
    roughness_inversion_guard: Object.freeze({
        enabled: true,
        minUsableRange: 0.18,
        minScoreDelta: 0.22,
        lowP50Threshold: 0.46,
        lowClipThreshold: 0.55,
        minEvidenceCount: 2
    }),
    scalar_map_clipping_guard: Object.freeze({
        enabled: true,
        albedoClipThreshold: 0.025,
        roughnessClipThreshold: 0.65,
        aoClipThreshold: 0.92,
        nonMetalMeanThreshold: 0.1
    }),
    roughness_interval_remap: Object.freeze({
        min: 0.55,
        max: 0.92,
        gamma: 1.0,
        normalizeInputPercentiles: Object.freeze([5, 95])
    }),
    albedo_balance: Object.freeze({
        brightness: 1.0,
        saturation: 1.0,
        hueDegrees: 0.0,
        tintStrength: 0.0
    }),
    normal_intensity: Object.freeze({
        strength: 1.0
    }),
    metalness_policy: Object.freeze({
        enabled: true
    })
});

const CLASS_PROFILES = Object.freeze({
    asphalt: Object.freeze({
        notes: 'Road asphalt target: high roughness and non-metal default.',
        targets: Object.freeze({
            roughness: Object.freeze({ min: 0.5, max: 0.9, gamma: 1.0 }),
            metalness: Object.freeze({ value: 0.0, allowPerTextureOverride: true })
        }),
        pluginOptions: Object.freeze({
            roughness_interval_remap: Object.freeze({ min: 0.5, max: 0.9, gamma: 1.0 }),
            metalness_policy: Object.freeze({ value: 0.0 })
        })
    }),
    brick: Object.freeze({
        notes: 'Brick facade target: rough-matte non-metal baseline.',
        targets: Object.freeze({
            roughness: Object.freeze({ min: 0.45, max: 0.9, gamma: 1.0 }),
            metalness: Object.freeze({ value: 0.0, allowPerTextureOverride: true })
        }),
        pluginOptions: Object.freeze({
            roughness_interval_remap: Object.freeze({ min: 0.45, max: 0.9, gamma: 1.0 }),
            metalness_policy: Object.freeze({ value: 0.0 })
        })
    }),
    concrete: Object.freeze({
        notes: 'Concrete target: broad roughness with non-metal default.',
        targets: Object.freeze({
            roughness: Object.freeze({ min: 0.52, max: 0.93, gamma: 1.0 }),
            metalness: Object.freeze({ value: 0.0, allowPerTextureOverride: true })
        }),
        pluginOptions: Object.freeze({
            roughness_interval_remap: Object.freeze({ min: 0.52, max: 0.93, gamma: 1.0 }),
            metalness_policy: Object.freeze({ value: 0.0 })
        })
    }),
    grass: Object.freeze({
        notes: 'Dry grass starter range is physically plausible: roughness min 0.65, max 0.98, non-metal enforced.',
        targets: Object.freeze({
            roughness: Object.freeze({ min: 0.65, max: 0.98, gamma: 1.0 }),
            metalness: Object.freeze({ value: 0.0, allowPerTextureOverride: true })
        }),
        pluginOptions: Object.freeze({
            roughness_interval_remap: Object.freeze({ min: 0.65, max: 0.98, gamma: 1.0 }),
            normal_intensity: Object.freeze({ strength: 0.9 }),
            metalness_policy: Object.freeze({ value: 0.0 })
        })
    }),
    ground: Object.freeze({
        notes: 'Soil/ground target favors matte behavior with non-metal default.',
        targets: Object.freeze({
            roughness: Object.freeze({ min: 0.58, max: 0.95, gamma: 1.0 }),
            metalness: Object.freeze({ value: 0.0, allowPerTextureOverride: true })
        }),
        pluginOptions: Object.freeze({
            roughness_interval_remap: Object.freeze({ min: 0.58, max: 0.95, gamma: 1.0 }),
            normal_intensity: Object.freeze({ strength: 0.95 }),
            metalness_policy: Object.freeze({ value: 0.0 })
        })
    }),
    soil: Object.freeze({
        notes: 'Alias of ground class defaults for preset portability.',
        targets: Object.freeze({
            roughness: Object.freeze({ min: 0.58, max: 0.95, gamma: 1.0 }),
            metalness: Object.freeze({ value: 0.0, allowPerTextureOverride: true })
        }),
        pluginOptions: Object.freeze({
            roughness_interval_remap: Object.freeze({ min: 0.58, max: 0.95, gamma: 1.0 }),
            normal_intensity: Object.freeze({ strength: 0.95 }),
            metalness_policy: Object.freeze({ value: 0.0 })
        })
    }),
    metal: Object.freeze({
        notes: 'Metal assets preserve metallic response by disabling non-metal policy.',
        targets: Object.freeze({
            roughness: Object.freeze({ min: 0.2, max: 0.75, gamma: 1.0 }),
            metalness: Object.freeze({ value: 1.0, allowPerTextureOverride: true })
        }),
        disabledPlugins: Object.freeze([
            'metalness_policy'
        ]),
        pluginOptions: Object.freeze({
            roughness_interval_remap: Object.freeze({ min: 0.2, max: 0.75, gamma: 1.0 }),
            normal_intensity: Object.freeze({ strength: 0.85 })
        })
    }),
    pavers: Object.freeze({
        notes: 'Pavers keep non-metal default with medium roughness range.',
        targets: Object.freeze({
            roughness: Object.freeze({ min: 0.5, max: 0.9, gamma: 1.0 }),
            metalness: Object.freeze({ value: 0.0, allowPerTextureOverride: true })
        }),
        pluginOptions: Object.freeze({
            roughness_interval_remap: Object.freeze({ min: 0.5, max: 0.9, gamma: 1.0 }),
            metalness_policy: Object.freeze({ value: 0.0 })
        })
    }),
    plaster_stucco: Object.freeze({
        notes: 'Plaster/stucco target is matte non-metal.',
        targets: Object.freeze({
            roughness: Object.freeze({ min: 0.48, max: 0.88, gamma: 1.0 }),
            metalness: Object.freeze({ value: 0.0, allowPerTextureOverride: true })
        }),
        pluginOptions: Object.freeze({
            roughness_interval_remap: Object.freeze({ min: 0.48, max: 0.88, gamma: 1.0 }),
            metalness_policy: Object.freeze({ value: 0.0 })
        })
    }),
    roof_tiles: Object.freeze({
        notes: 'Roof tiles baseline uses medium-high roughness and non-metal default.',
        targets: Object.freeze({
            roughness: Object.freeze({ min: 0.5, max: 0.9, gamma: 1.0 }),
            metalness: Object.freeze({ value: 0.0, allowPerTextureOverride: true })
        }),
        pluginOptions: Object.freeze({
            roughness_interval_remap: Object.freeze({ min: 0.5, max: 0.9, gamma: 1.0 }),
            metalness_policy: Object.freeze({ value: 0.0 })
        })
    }),
    stone: Object.freeze({
        notes: 'Rock/stone target keeps broad matte response with non-metal default.',
        targets: Object.freeze({
            roughness: Object.freeze({ min: 0.6, max: 0.95, gamma: 1.0 }),
            metalness: Object.freeze({ value: 0.0, allowPerTextureOverride: true })
        }),
        pluginOptions: Object.freeze({
            roughness_interval_remap: Object.freeze({ min: 0.6, max: 0.95, gamma: 1.0 }),
            metalness_policy: Object.freeze({ value: 0.0 })
        })
    })
});

export const DEFAULT_TEXTURE_CORRECTION_PROFILE = Object.freeze({
    schema: 'bus_sim.texture_correction_profile',
    version: 1,
    profileId: 'terrain_baseline_v1',
    description: 'Deterministic baseline plugin profile for terrain and surface PBR assets.',
    presets: Object.freeze({
        [CORRECTION_PRESET_BASELINE]: Object.freeze({
            enabledPlugins: GLOBAL_ENABLED_PLUGINS,
            pluginOptions: DEFAULT_PLUGIN_OPTIONS,
            classProfiles: CLASS_PROFILES
        })
    })
});

export default DEFAULT_TEXTURE_CORRECTION_PROFILE;
