// Defines the sanitized one-batch atlas-cluster rendering configuration.
// @ts-check

export const GRASS_MID_CLUSTER_DEFAULTS = Object.freeze({
    enabled: false,
    seed: 'mid-cluster-v1',
    patchSizeMeters: 2,
    cardsPerPatch: 2,
    cardWidthMeters: 1.15,
    cardHeightMeters: 0.055,
    yOffsetMeters: 0.0275,
    scaleVariation: 0.08,
    brightnessVariation: 0.08,
    atlasVariants: 8
});

function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

export function sanitizeGrassMidClusterConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.freeze({
        enabled: source.enabled === true,
        seed: String(source.seed ?? GRASS_MID_CLUSTER_DEFAULTS.seed).trim().slice(0, 160) || GRASS_MID_CLUSTER_DEFAULTS.seed,
        patchSizeMeters: clamp(source.patchSizeMeters, 1, 4, GRASS_MID_CLUSTER_DEFAULTS.patchSizeMeters),
        cardsPerPatch: Math.round(clamp(source.cardsPerPatch, 1, 2, GRASS_MID_CLUSTER_DEFAULTS.cardsPerPatch)),
        cardWidthMeters: clamp(source.cardWidthMeters, 0.35, 2.5, GRASS_MID_CLUSTER_DEFAULTS.cardWidthMeters),
        cardHeightMeters: clamp(source.cardHeightMeters, 0.025, 0.12, GRASS_MID_CLUSTER_DEFAULTS.cardHeightMeters),
        yOffsetMeters: clamp(source.yOffsetMeters, 0, 0.08, GRASS_MID_CLUSTER_DEFAULTS.yOffsetMeters),
        scaleVariation: clamp(source.scaleVariation, 0, 0.2, GRASS_MID_CLUSTER_DEFAULTS.scaleVariation),
        brightnessVariation: clamp(source.brightnessVariation, 0, 0.25, GRASS_MID_CLUSTER_DEFAULTS.brightnessVariation),
        atlasVariants: Math.round(clamp(source.atlasVariants, 1, 8, GRASS_MID_CLUSTER_DEFAULTS.atlasVariants))
    });
}
