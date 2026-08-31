// Defines the sanitized two-batch cohesive field rendering configuration.
// @ts-check

export const GRASS_MID_CLUSTER_SCHEMA = 'bus-simulator.grass-cohesive-field-renderer';
export const GRASS_MID_CLUSTER_VERSION = 2;

export const GRASS_MID_CLUSTER_DEFAULTS = Object.freeze({
    enabled: false,
    seed: 'cohesive-field-v2',
    unitSizeMeters: 1,
    radiusMeters: 25,
    rootJitterFactor: 0.56,
    boundarySafetyMeters: 0.0005,
    billboard: Object.freeze({
        cardsPerUnit: 1,
        widthMeters: 1.15,
        heightMeters: 0.055,
        baseSinkMeters: 0.01,
        brightnessBias: 1.1
    }),
    middle: Object.freeze({
        cardsPerUnit: 2,
        widthMeters: 1.15,
        heightMeters: 0.055,
        baseSinkMeters: 0,
        brightnessBias: 0.98
    }),
    patchSizeMeters: 1,
    cardsPerPatch: 2,
    cardWidthMeters: 1.15,
    cardHeightMeters: 0.055,
    yOffsetMeters: 0.0025,
    scaleVariation: 0.08,
    brightnessVariation: 0.02,
    atlasVariants: 8
});

function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

export function sanitizeGrassMidClusterConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    const billboardSource = source.billboard && typeof source.billboard === 'object' ? source.billboard : {};
    const middleSource = source.middle && typeof source.middle === 'object' ? source.middle : {};
    const legacyWidth = source.cardWidthMeters;
    const legacyHeight = source.cardHeightMeters;
    const billboard = Object.freeze({
        cardsPerUnit: 1,
        widthMeters: clamp(billboardSource.widthMeters ?? legacyWidth, 0.35, 2.5, GRASS_MID_CLUSTER_DEFAULTS.billboard.widthMeters),
        heightMeters: clamp(billboardSource.heightMeters ?? legacyHeight, 0.025, 0.12, GRASS_MID_CLUSTER_DEFAULTS.billboard.heightMeters),
        baseSinkMeters: clamp(billboardSource.baseSinkMeters, 0, 0.02, GRASS_MID_CLUSTER_DEFAULTS.billboard.baseSinkMeters),
        brightnessBias: clamp(billboardSource.brightnessBias, 0.85, 1.15, GRASS_MID_CLUSTER_DEFAULTS.billboard.brightnessBias)
    });
    const middle = Object.freeze({
        cardsPerUnit: 2,
        widthMeters: clamp(middleSource.widthMeters ?? legacyWidth, 0.35, 2.5, GRASS_MID_CLUSTER_DEFAULTS.middle.widthMeters),
        heightMeters: clamp(middleSource.heightMeters ?? legacyHeight, 0.025, 0.12, GRASS_MID_CLUSTER_DEFAULTS.middle.heightMeters),
        baseSinkMeters: clamp(middleSource.baseSinkMeters, 0, 0.02, GRASS_MID_CLUSTER_DEFAULTS.middle.baseSinkMeters),
        brightnessBias: clamp(middleSource.brightnessBias, 0.85, 1.15, GRASS_MID_CLUSTER_DEFAULTS.middle.brightnessBias)
    });
    return Object.freeze({
        schema: GRASS_MID_CLUSTER_SCHEMA,
        version: GRASS_MID_CLUSTER_VERSION,
        enabled: source.enabled === true,
        seed: String(source.seed ?? GRASS_MID_CLUSTER_DEFAULTS.seed).trim().slice(0, 160) || GRASS_MID_CLUSTER_DEFAULTS.seed,
        unitSizeMeters: 1,
        radiusMeters: clamp(source.radiusMeters, 1, 64, GRASS_MID_CLUSTER_DEFAULTS.radiusMeters),
        rootJitterFactor: clamp(source.rootJitterFactor, 0, 0.9, GRASS_MID_CLUSTER_DEFAULTS.rootJitterFactor),
        boundarySafetyMeters: clamp(source.boundarySafetyMeters, 0.0001, 0.01, GRASS_MID_CLUSTER_DEFAULTS.boundarySafetyMeters),
        billboard,
        middle,
        patchSizeMeters: 1,
        cardsPerPatch: middle.cardsPerUnit,
        cardWidthMeters: middle.widthMeters,
        cardHeightMeters: middle.heightMeters,
        yOffsetMeters: clamp(source.yOffsetMeters, 0, 0.08, GRASS_MID_CLUSTER_DEFAULTS.yOffsetMeters),
        scaleVariation: clamp(source.scaleVariation, 0, 0.2, GRASS_MID_CLUSTER_DEFAULTS.scaleVariation),
        brightnessVariation: clamp(source.brightnessVariation, 0, 0.08, GRASS_MID_CLUSTER_DEFAULTS.brightnessVariation),
        atlasVariants: Math.round(clamp(source.atlasVariants, 1, 8, GRASS_MID_CLUSTER_DEFAULTS.atlasVariants))
    });
}
