// Defines deterministic exact-coverage tree and feature grass accent placement.
// @ts-check

import {
    GRASS_COVERAGE_SCHEMA,
    GRASS_COVERAGE_VERSION,
    createGrassCoverageStaticGeometryConfig,
    sampleGrassCoverageContract
} from './GrassCoverageContract.js';
import {
    GRASS_AUTO_LOD_SCHEMA,
    GRASS_AUTO_LOD_VERSION
} from './GrassAutoLodContract.js';

const EPS = 1e-7;
const ENVELOPE_DIRECTIONS = Object.freeze(Array.from({ length: 8 }, (_, index) => {
    const angle = index / 8 * Math.PI * 2;
    return Object.freeze({ x: Math.cos(angle), z: Math.sin(angle) });
}));

export const GRASS_LOCALIZED_ACCENT_SCHEMA = 'bus-simulator.grass-localized-accents';
export const GRASS_LOCALIZED_ACCENT_VERSION = 2;
export const GRASS_LOCALIZED_ACCENT_SUBSTRATE_OWNERSHIP = 'coverage_tree_hole';

export function createGrassLocalizedAccentHandoffIdentity({
    accentKey,
    seed,
    boundarySignature
} = {}) {
    const key = String(accentKey ?? '');
    const fieldSeed = String(seed ?? '');
    const signature = String(boundarySignature ?? '');
    if (!key) throw new Error('[GrassLocalizedAccentContract] An accent handoff key is required.');
    if (!fieldSeed) throw new Error('[GrassLocalizedAccentContract] An accent handoff seed is required.');
    if (!signature) throw new Error('[GrassLocalizedAccentContract] An accent boundary signature is required.');
    return JSON.stringify([
        GRASS_AUTO_LOD_SCHEMA,
        GRASS_AUTO_LOD_VERSION,
        'localized_accent',
        fieldSeed,
        signature,
        key
    ]);
}

export const GRASS_LOCALIZED_ACCENT_DEFAULTS = Object.freeze({
    enabled: true,
    wornEnabled: false,
    featureAccentsEnabled: true,
    seed: 'grass-localized-accents-v2',
    clustersPerTree: 4,
    clustersPerFeature: 3,
    trunkRadiusMeters: 0.55,
    ringInnerMeters: 0.82,
    ringOuterMeters: 1.25,
    wornRadiusMeters: 0.76,
    cardWidthMeters: 0.24,
    cardHeightMeters: 0.075,
    cardsPerCluster: 2,
    yOffsetMeters: 0.0285,
    wornYOffsetMeters: 0.028,
    boundarySafetyMeters: 0.0005,
    scaleVariation: 0.14,
    brightnessVariation: 0.08,
    atlasVariants: 8
});

function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function round(value, digits = 9) {
    const scale = 10 ** digits;
    const result = Math.round((Number(value) + Number.EPSILON) * scale) / scale;
    return result === 0 ? 0 : result;
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

function hashHex(value) {
    return hashText(value).toString(16).padStart(8, '0');
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

function isExactCoverageDefinition(value) {
    return value?.schema === GRASS_COVERAGE_SCHEMA
        && Number(value?.version) === GRASS_COVERAGE_VERSION
        && Array.isArray(value?.exclusions);
}

function normalizePlacement(value, index, kind) {
    const x = Number(value?.x);
    const y = Number(value?.y);
    const z = Number(value?.z);
    if (![x, z].every(Number.isFinite)) {
        throw new Error(`[GrassLocalizedAccentContract] ${kind} placement ${index} requires finite x/z.`);
    }
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

function distanceToBounds(x, z, bounds) {
    if (!bounds) return 0;
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return 0;
    return Math.min(x - bounds.minX, bounds.maxX - x, z - bounds.minZ, bounds.maxZ - z);
}

function incrementRejected(rejectedByKind, sample) {
    const kind = String(sample?.exclusionKind ?? 'bounds') || 'other';
    rejectedByKind[kind] = (rejectedByKind[kind] ?? 0) + 1;
}

function freezeRejectedByKind(value) {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return Object.freeze(Object.fromEntries(entries));
}

function resolveInwardYaw(sampleRoot, x, z, fallbackYaw, boundaryDistanceMeters) {
    const probeRadius = clamp(boundaryDistanceMeters, 0.02, 0.12, 0.06);
    let bestYaw = fallbackYaw;
    let bestScore = -Infinity;
    for (let index = 0; index < 16; index++) {
        const yaw = fallbackYaw + index / 16 * Math.PI * 2;
        const sample = sampleRoot(x + Math.cos(yaw) * probeRadius, z + Math.sin(yaw) * probeRadius);
        const distance = Number(sample.boundaryDistanceMeters);
        const score = sample.occupied ? (Number.isFinite(distance) ? distance : 1000000) : -1;
        if (score > bestScore + EPS) {
            bestScore = score;
            bestYaw = yaw;
        }
    }
    return bestYaw;
}

function resolveEnvelope({
    sampleRoot,
    x,
    z,
    yawRadians,
    requestedRadiusMeters,
    initialFootprintScale
}) {
    let footprintScale = clamp(initialFootprintScale, 0, 1, 0);
    let probes = [];
    for (let attempt = 0; attempt < 7; attempt++) {
        const radius = requestedRadiusMeters * footprintScale;
        probes = ENVELOPE_DIRECTIONS.map((direction) => {
            const cosine = Math.cos(yawRadians);
            const sine = Math.sin(yawRadians);
            const dx = direction.x * cosine - direction.z * sine;
            const dz = direction.x * sine + direction.z * cosine;
            return sampleRoot(x + dx * radius, z + dz * radius);
        });
        if (probes.every((sample) => sample.occupied)) {
            return Object.freeze({
                footprintScale: round(footprintScale),
                samples: Object.freeze(probes),
                passed: true
            });
        }
        footprintScale *= 0.72;
    }
    return Object.freeze({
        footprintScale: round(footprintScale),
        samples: Object.freeze(probes),
        passed: false
    });
}

export function sanitizeGrassLocalizedAccentConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    const ringInnerMeters = clamp(source.ringInnerMeters, 0.35, 2, GRASS_LOCALIZED_ACCENT_DEFAULTS.ringInnerMeters);
    return Object.freeze({
        schema: GRASS_LOCALIZED_ACCENT_SCHEMA,
        version: GRASS_LOCALIZED_ACCENT_VERSION,
        enabled: source.enabled !== false,
        wornEnabled: false,
        featureAccentsEnabled: source.featureAccentsEnabled !== false,
        seed: String(source.seed ?? GRASS_LOCALIZED_ACCENT_DEFAULTS.seed).trim().slice(0, 160)
            || GRASS_LOCALIZED_ACCENT_DEFAULTS.seed,
        clustersPerTree: Math.round(clamp(source.clustersPerTree, 3, 6, GRASS_LOCALIZED_ACCENT_DEFAULTS.clustersPerTree)),
        clustersPerFeature: Math.round(clamp(source.clustersPerFeature, 1, 4, GRASS_LOCALIZED_ACCENT_DEFAULTS.clustersPerFeature)),
        trunkRadiusMeters: clamp(source.trunkRadiusMeters, 0.2, 1.2, GRASS_LOCALIZED_ACCENT_DEFAULTS.trunkRadiusMeters),
        ringInnerMeters,
        ringOuterMeters: clamp(source.ringOuterMeters, ringInnerMeters + 0.1, 2.8, GRASS_LOCALIZED_ACCENT_DEFAULTS.ringOuterMeters),
        wornRadiusMeters: clamp(source.wornRadiusMeters, 0.25, ringInnerMeters, GRASS_LOCALIZED_ACCENT_DEFAULTS.wornRadiusMeters),
        cardWidthMeters: clamp(source.cardWidthMeters, 0.08, 0.45, GRASS_LOCALIZED_ACCENT_DEFAULTS.cardWidthMeters),
        cardHeightMeters: clamp(source.cardHeightMeters, 0.035, 0.12, GRASS_LOCALIZED_ACCENT_DEFAULTS.cardHeightMeters),
        cardsPerCluster: 2,
        yOffsetMeters: clamp(source.yOffsetMeters, 0, 0.1, GRASS_LOCALIZED_ACCENT_DEFAULTS.yOffsetMeters),
        wornYOffsetMeters: clamp(source.wornYOffsetMeters, 0, 0.1, GRASS_LOCALIZED_ACCENT_DEFAULTS.wornYOffsetMeters),
        boundarySafetyMeters: clamp(source.boundarySafetyMeters, 0.0001, 0.01, GRASS_LOCALIZED_ACCENT_DEFAULTS.boundarySafetyMeters),
        scaleVariation: clamp(source.scaleVariation, 0, 0.35, GRASS_LOCALIZED_ACCENT_DEFAULTS.scaleVariation),
        brightnessVariation: clamp(source.brightnessVariation, 0, 0.08, GRASS_LOCALIZED_ACCENT_DEFAULTS.brightnessVariation),
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
    const coverage = createGrassCoverageStaticGeometryConfig(coverageConfig);
    const definition = coverageDefinition ?? null;
    if (definition && !isExactCoverageDefinition(definition)) {
        throw new Error('[GrassLocalizedAccentContract] coverageDefinition must use the AI 359 V2 schema.');
    }
    const trees = Object.freeze((Array.isArray(treePlacements) ? treePlacements : [])
        .map((value, index) => normalizePlacement(value, index, 'tree')));
    const features = Object.freeze(settings.featureAccentsEnabled
        ? (Array.isArray(featurePlacements) ? featurePlacements : [])
            .map((value, index) => normalizePlacement(value, index, 'feature'))
        : []);
    const accents = [];
    const rejectedByKind = { sidewalk: 0, tree_base: 0, bounds: 0, other: 0 };
    let candidateRoots = 0;
    let eligibleRoots = 0;
    let rejectedCoverage = 0;
    let rejectedInsideTrunk = 0;
    let exactPostcheckFailures = 0;
    let exactEnvelopeFailures = 0;
    let envelopeSamples = 0;
    let footprintClampedRoots = 0;
    let minimumEmittedBoundaryDistanceMeters = Infinity;
    let eligibleTrees = 0;

    const sampleRoot = (x, z) => sampleGrassCoverageContract(definition, x, z, coverage);
    const tryAddAccent = ({
        key,
        sourceId,
        kind,
        x,
        y,
        z,
        baseYaw,
        nominalScale,
        random,
        trunk
    }) => {
        candidateRoots++;
        const rootSample = sampleRoot(x, z);
        if (!rootSample.rootEligible) {
            rejectedCoverage++;
            incrementRejected(rejectedByKind, rootSample);
            return false;
        }
        if (trunk && Math.hypot(x - trunk.x, z - trunk.z) <= trunk.radiusMeters + EPS) {
            rejectedInsideTrunk++;
            return false;
        }
        eligibleRoots++;
        const postcheck = sampleRoot(x, z);
        if (!postcheck.rootEligible) {
            exactPostcheckFailures++;
            return false;
        }
        const boundaryDistance = Number(postcheck.boundaryDistanceMeters);
        const boundsDistance = distanceToBounds(x, z, definition.bounds);
        const availableRadius = Math.max(
            0,
            Math.min(Number.isFinite(boundaryDistance) ? boundaryDistance : Infinity, boundsDistance)
                - settings.boundarySafetyMeters
        );
        const requestedRadius = settings.cardWidthMeters * nominalScale * 0.5;
        const initialFootprintScale = requestedRadius > EPS ? Math.min(1, availableRadius / requestedRadius) : 1;
        const yawRadians = resolveInwardYaw(sampleRoot, x, z, baseYaw, boundaryDistance);
        const envelope = resolveEnvelope({
            sampleRoot,
            x,
            z,
            yawRadians,
            requestedRadiusMeters: requestedRadius,
            initialFootprintScale
        });
        envelopeSamples += envelope.samples.length;
        if (!envelope.passed) {
            exactEnvelopeFailures++;
            return false;
        }
        if (envelope.footprintScale < 1 - EPS) footprintClampedRoots++;
        const appearanceScale = round(1 + (random() * 2 - 1) * settings.brightnessVariation);
        const finalScale = round(nominalScale * envelope.footprintScale);
        accents.push(Object.freeze({
            key,
            sourceId,
            kind,
            x: round(x),
            y: round(y),
            z: round(z),
            yawRadians: round(yawRadians),
            nominalScale: round(nominalScale),
            scale: finalScale,
            footprintScale: envelope.footprintScale,
            boundaryDistanceMeters: Number.isFinite(boundaryDistance) ? round(boundaryDistance) : null,
            sourceBoundaryDistanceMeters: postcheck.sourceBoundaryDistanceMeters,
            exclusionId: postcheck.exclusionId,
            exclusionKind: postcheck.exclusionKind,
            sourceIdentity: postcheck.sourceIdentity,
            appearanceScale,
            brightness: appearanceScale,
            dryTint: 1,
            variant: Math.floor(random() * settings.atlasVariants),
            cardsPerCluster: settings.cardsPerCluster
        }));
        if (Number.isFinite(boundaryDistance)) {
            minimumEmittedBoundaryDistanceMeters = Math.min(minimumEmittedBoundaryDistanceMeters, boundaryDistance);
        }
        return true;
    };

    if (settings.enabled && coverage.accentEligibility && definition) {
        for (const tree of trees) {
            const random = makeRandom(`${settings.seed}|tree|${tree.id}|${tree.variant}`);
            const sourceScale = tree.scaleVar;
            const trunkRadius = settings.trunkRadiusMeters * sourceScale;
            const innerRadius = Math.max(trunkRadius + 0.05, settings.ringInnerMeters * sourceScale);
            const outerRadius = Math.max(innerRadius + 0.05, settings.ringOuterMeters * sourceScale);
            let representedForTree = 0;
            for (let index = 0; index < settings.clustersPerTree; index++) {
                const baseAngle = tree.rotation + index / settings.clustersPerTree * Math.PI * 2;
                const angle = baseAngle + (random() - 0.5) * (Math.PI * 0.36);
                const radius = innerRadius + (outerRadius - innerRadius) * (0.18 + random() * 0.82);
                const x = tree.x + Math.cos(angle) * radius;
                const z = tree.z + Math.sin(angle) * radius;
                const nominalScale = sourceScale * (1 + (random() * 2 - 1) * settings.scaleVariation);
                representedForTree += Number(tryAddAccent({
                    key: `${tree.id}|cluster|${index}`,
                    sourceId: tree.id,
                    kind: 'tree_ring',
                    x,
                    y: tree.y,
                    z,
                    baseYaw: angle,
                    nominalScale,
                    random,
                    trunk: { x: tree.x, z: tree.z, radiusMeters: trunkRadius }
                }));
            }
            if (representedForTree > 0) eligibleTrees++;
        }

        for (const feature of features) {
            const random = makeRandom(`${settings.seed}|feature|${feature.id}|${feature.variant}`);
            for (let index = 0; index < settings.clustersPerFeature; index++) {
                const angle = feature.rotation + index / settings.clustersPerFeature * Math.PI * 2
                    + (random() - 0.5) * 0.8;
                const radius = (0.18 + random() * 0.34) * feature.scaleVar;
                const x = feature.x + Math.cos(angle) * radius;
                const z = feature.z + Math.sin(angle) * radius;
                const nominalScale = feature.scaleVar * (0.82 + random() * 0.24);
                tryAddAccent({
                    key: `${feature.id}|cluster|${index}`,
                    sourceId: feature.id,
                    kind: 'explicit_feature',
                    x,
                    y: feature.y,
                    z,
                    baseYaw: angle + random() * Math.PI,
                    nominalScale,
                    random,
                    trunk: null
                });
            }
        }
    }

    accents.sort((a, b) => a.key.localeCompare(b.key));
    const representedRoots = accents.length;
    const unrepresentedEligibleRoots = Math.max(0, eligibleRoots - representedRoots);
    const frozenRejectedByKind = freezeRejectedByKind(rejectedByKind);
    const signaturePayload = {
        schema: GRASS_LOCALIZED_ACCENT_SCHEMA,
        version: GRASS_LOCALIZED_ACCENT_VERSION,
        seed: settings.seed,
        boundarySignature: definition?.boundarySignature ?? '',
        sourceLoopIdentity: definition?.sourceLoopIdentity ?? '',
        rootClearanceMeters: coverage.rootClearanceMeters,
        config: settings,
        trees,
        features,
        accents,
        rejectedByKind: frozenRejectedByKind
    };
    const placementSignature = `grass-accents-v2-${hashHex(JSON.stringify(signaturePayload))}`;
    return Object.freeze({
        schema: GRASS_LOCALIZED_ACCENT_SCHEMA,
        version: GRASS_LOCALIZED_ACCENT_VERSION,
        config: settings,
        substrateOwnership: GRASS_LOCALIZED_ACCENT_SUBSTRATE_OWNERSHIP,
        coverageMode: definition ? 'exact_polygon' : 'none',
        boundarySignature: String(definition?.boundarySignature ?? ''),
        sourceLoopIdentity: String(definition?.sourceLoopIdentity ?? ''),
        rootClearanceMeters: coverage.rootClearanceMeters,
        treePlacements: trees,
        featurePlacements: features,
        accents: Object.freeze(accents),
        wornPatches: Object.freeze([]),
        candidateRoots,
        eligibleRoots,
        representedRoots,
        unrepresentedEligibleRoots,
        eligibleTrees,
        rejectedCoverage,
        rejectedInsideTrunk,
        rejectedByKind: frozenRejectedByKind,
        exactPostcheckFailures,
        exactEnvelopeFailures,
        envelopeSamples,
        footprintClampedRoots,
        minimumEmittedBoundaryDistanceMeters: Number.isFinite(minimumEmittedBoundaryDistanceMeters)
            ? round(minimumEmittedBoundaryDistanceMeters)
            : null,
        placementSignature,
        deterministicSignature: placementSignature
    });
}
