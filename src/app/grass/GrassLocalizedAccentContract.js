// Defines deterministic, coverage-bounded tree and worn-area grass accent placement.
// @ts-check

import { sampleGrassCoverage, sanitizeGrassCoverageConfig } from './GrassCoverageContract.js';

export const GRASS_LOCALIZED_ACCENT_SCHEMA = 'bus-simulator.grass-localized-accents';
export const GRASS_LOCALIZED_ACCENT_VERSION = 1;

export const GRASS_LOCALIZED_ACCENT_DEFAULTS = Object.freeze({
    enabled: true,
    wornEnabled: true,
    featureAccentsEnabled: true,
    seed: 'grass-localized-accents-v1',
    clustersPerTree: 4,
    clustersPerFeature: 3,
    trunkRadiusMeters: 0.55,
    ringInnerMeters: 0.82,
    ringOuterMeters: 1.25,
    wornRadiusMeters: 0.76,
    cardWidthMeters: 0.24,
    cardHeightMeters: 0.075,
    yOffsetMeters: 0.0285,
    wornYOffsetMeters: 0.028,
    scaleVariation: 0.14,
    brightnessVariation: 0.12,
    atlasVariants: 8
});

function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function hashText(value) {
    const text = String(value ?? '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function makeRandom(seed) {
    let value = hashText(seed) || 1;
    return () => {
        value |= 0;
        value = (value + 0x6D2B79F5) | 0;
        let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

function normalizePlacement(value, index, kind) {
    const x = Number(value?.x);
    const y = Number(value?.y);
    const z = Number(value?.z);
    if (![x, z].every(Number.isFinite)) throw new Error(`[GrassLocalizedAccentContract] ${kind} placement ${index} requires finite x/z.`);
    return Object.freeze({
        id: String(value?.id ?? `${kind}_${index}_${x.toFixed(3)}_${z.toFixed(3)}`),
        kind,
        x,
        y: Number.isFinite(y) ? y : 0,
        z,
        rotation: Number.isFinite(Number(value?.rotation)) ? Number(value.rotation) : 0,
        scaleVar: clamp(value?.scaleVar, 0.2, 3, 1),
        variant: Math.max(0, Math.round(clamp(value?.variant, 0, 255, 0)))
    });
}

export function sanitizeGrassLocalizedAccentConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    const ringInnerMeters = clamp(source.ringInnerMeters, 0.35, 2, GRASS_LOCALIZED_ACCENT_DEFAULTS.ringInnerMeters);
    return Object.freeze({
        schema: GRASS_LOCALIZED_ACCENT_SCHEMA,
        version: GRASS_LOCALIZED_ACCENT_VERSION,
        enabled: source.enabled !== false,
        wornEnabled: source.wornEnabled !== false,
        featureAccentsEnabled: source.featureAccentsEnabled !== false,
        seed: String(source.seed ?? GRASS_LOCALIZED_ACCENT_DEFAULTS.seed).trim().slice(0, 160) || GRASS_LOCALIZED_ACCENT_DEFAULTS.seed,
        clustersPerTree: Math.round(clamp(source.clustersPerTree, 3, 6, GRASS_LOCALIZED_ACCENT_DEFAULTS.clustersPerTree)),
        clustersPerFeature: Math.round(clamp(source.clustersPerFeature, 1, 4, GRASS_LOCALIZED_ACCENT_DEFAULTS.clustersPerFeature)),
        trunkRadiusMeters: clamp(source.trunkRadiusMeters, 0.2, 1.2, GRASS_LOCALIZED_ACCENT_DEFAULTS.trunkRadiusMeters),
        ringInnerMeters,
        ringOuterMeters: clamp(source.ringOuterMeters, ringInnerMeters + 0.1, 2.8, GRASS_LOCALIZED_ACCENT_DEFAULTS.ringOuterMeters),
        wornRadiusMeters: clamp(source.wornRadiusMeters, 0.25, ringInnerMeters, GRASS_LOCALIZED_ACCENT_DEFAULTS.wornRadiusMeters),
        cardWidthMeters: clamp(source.cardWidthMeters, 0.08, 0.45, GRASS_LOCALIZED_ACCENT_DEFAULTS.cardWidthMeters),
        cardHeightMeters: clamp(source.cardHeightMeters, 0.035, 0.12, GRASS_LOCALIZED_ACCENT_DEFAULTS.cardHeightMeters),
        yOffsetMeters: clamp(source.yOffsetMeters, 0, 0.1, GRASS_LOCALIZED_ACCENT_DEFAULTS.yOffsetMeters),
        wornYOffsetMeters: clamp(source.wornYOffsetMeters, 0, 0.1, GRASS_LOCALIZED_ACCENT_DEFAULTS.wornYOffsetMeters),
        scaleVariation: clamp(source.scaleVariation, 0, 0.35, GRASS_LOCALIZED_ACCENT_DEFAULTS.scaleVariation),
        brightnessVariation: clamp(source.brightnessVariation, 0, 0.3, GRASS_LOCALIZED_ACCENT_DEFAULTS.brightnessVariation),
        atlasVariants: Math.round(clamp(source.atlasVariants, 1, 8, GRASS_LOCALIZED_ACCENT_DEFAULTS.atlasVariants))
    });
}

export function createGrassLocalizedAccentLayout({
    config,
    treePlacements = [],
    featurePlacements = [],
    coverageDefinition,
    coverageConfig
} = {}) {
    const settings = sanitizeGrassLocalizedAccentConfig(config);
    const coverage = sanitizeGrassCoverageConfig(coverageConfig);
    const trees = (Array.isArray(treePlacements) ? treePlacements : []).map((value, index) => normalizePlacement(value, index, 'tree'));
    const features = settings.featureAccentsEnabled
        ? (Array.isArray(featurePlacements) ? featurePlacements : []).map((value, index) => normalizePlacement(value, index, 'feature'))
        : [];
    const accents = [];
    const wornPatches = [];
    let rejectedCoverage = 0;
    let rejectedInsideTrunk = 0;
    let eligibleTrees = 0;

    if (settings.enabled && coverage.accentEligibility && coverageDefinition) {
        for (const tree of trees) {
            const random = makeRandom(`${settings.seed}|tree|${tree.id}|${tree.variant}`);
            const scale = tree.scaleVar;
            const trunkRadius = settings.trunkRadiusMeters * scale;
            const innerRadius = Math.max(trunkRadius + 0.05, settings.ringInnerMeters * scale);
            const outerRadius = Math.max(innerRadius + 0.05, settings.ringOuterMeters * scale);
            if (settings.wornEnabled && Number(coverageDefinition?.version) < 2) {
                wornPatches.push(Object.freeze({
                    key: `${tree.id}|worn`,
                    sourceId: tree.id,
                    kind: 'tree_worn_substrate',
                    x: tree.x,
                    y: tree.y,
                    z: tree.z,
                    radiusMeters: settings.wornRadiusMeters * scale,
                    yawRadians: tree.rotation
                }));
            }
            const accentCountBeforeTree = accents.length;
            for (let index = 0; index < settings.clustersPerTree; index++) {
                const baseAngle = tree.rotation + (index / settings.clustersPerTree) * Math.PI * 2;
                const angle = baseAngle + (random() - 0.5) * (Math.PI * 0.36);
                const radius = innerRadius + (outerRadius - innerRadius) * (0.18 + random() * 0.82);
                const x = tree.x + Math.cos(angle) * radius;
                const z = tree.z + Math.sin(angle) * radius;
                if (Math.hypot(x - tree.x, z - tree.z) <= trunkRadius) {
                    rejectedInsideTrunk++;
                    continue;
                }
                if (sampleGrassCoverage(coverageDefinition, x, z, coverage) !== 1) {
                    rejectedCoverage++;
                    continue;
                }
                accents.push(Object.freeze({
                    key: `${tree.id}|cluster|${index}`,
                    sourceId: tree.id,
                    kind: 'tree_ring',
                    x,
                    y: tree.y,
                    z,
                    yawRadians: angle + Math.PI * 0.5 + (random() - 0.5) * 0.5,
                    scale: scale * (1 + (random() * 2 - 1) * settings.scaleVariation),
                    brightness: 0.78 + (random() * 2 - 1) * settings.brightnessVariation,
                    dryTint: 0.72 + random() * 0.14,
                    variant: Math.floor(random() * settings.atlasVariants)
                }));
            }
            if (accents.length > accentCountBeforeTree) eligibleTrees++;
        }

        for (const feature of features) {
            const random = makeRandom(`${settings.seed}|feature|${feature.id}|${feature.variant}`);
            for (let index = 0; index < settings.clustersPerFeature; index++) {
                const angle = feature.rotation + (index / settings.clustersPerFeature) * Math.PI * 2 + (random() - 0.5) * 0.8;
                const radius = (0.18 + random() * 0.34) * feature.scaleVar;
                const x = feature.x + Math.cos(angle) * radius;
                const z = feature.z + Math.sin(angle) * radius;
                if (sampleGrassCoverage(coverageDefinition, x, z, coverage) !== 1) {
                    rejectedCoverage++;
                    continue;
                }
                accents.push(Object.freeze({
                    key: `${feature.id}|cluster|${index}`,
                    sourceId: feature.id,
                    kind: 'worn_feature',
                    x,
                    y: feature.y,
                    z,
                    yawRadians: angle + random() * Math.PI,
                    scale: feature.scaleVar * (0.82 + random() * 0.24),
                    brightness: 0.76 + random() * 0.12,
                    dryTint: 0.75 + random() * 0.12,
                    variant: Math.floor(random() * settings.atlasVariants)
                }));
            }
        }
    }

    const signatureSource = accents.map((entry) => [entry.key, entry.x.toFixed(6), entry.z.toFixed(6), entry.variant, entry.scale.toFixed(6)]);
    return Object.freeze({
        schema: GRASS_LOCALIZED_ACCENT_SCHEMA,
        version: GRASS_LOCALIZED_ACCENT_VERSION,
        config: settings,
        treePlacements: Object.freeze(trees),
        featurePlacements: Object.freeze(features),
        accents: Object.freeze(accents),
        wornPatches: Object.freeze(wornPatches),
        eligibleTrees,
        rejectedCoverage,
        rejectedInsideTrunk,
        deterministicSignature: `grass-accents-v1-${hashText(JSON.stringify(signatureSource)).toString(16).padStart(8, '0')}`
    });
}
