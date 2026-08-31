// Builds deterministic area-complete billboard and middle grass coverage units.
// @ts-check

import {
    GRASS_COVERAGE_SCHEMA,
    GRASS_COVERAGE_VERSION,
    createGrassCoveragePartition,
    createGrassCoverageStaticGeometryConfig,
    sampleGrassCoverageContract
} from './GrassCoverageContract.js';

const EPS = 1e-7;
const HASH_OFFSET = 2166136261;
const HASH_PRIME = 16777619;
const ORIENTATION_VARIATION_RADIANS = Math.PI / 4;
const BOUNDARY_COMPLETION_SPACING_METERS = 0.125;
const ENVELOPE_DIRECTIONS = Object.freeze(Array.from({ length: 8 }, (_, index) => {
    const angle = index / 8 * Math.PI * 2;
    return Object.freeze({ x: Math.cos(angle), z: Math.sin(angle) });
}));

export const GRASS_COHESIVE_FIELD_SCHEMA = 'bus-simulator.grass-cohesive-field';
export const GRASS_COHESIVE_FIELD_VERSION = 2;
export const GRASS_COHESIVE_FIELD_UNIT_SIZE_METERS = 1;

export const GRASS_COHESIVE_FIELD_TIER = Object.freeze({
    BILLBOARD: 'billboard',
    MIDDLE: 'middle'
});

export const GRASS_COHESIVE_FIELD_DEFAULTS = Object.freeze({
    seed: 'cohesive-field-v2',
    radiusMeters: 25,
    rootJitterFactor: 0.56,
    boundarySafetyMeters: 0.0005,
    scaleVariation: 0.08,
    atlasVariants: 8,
    billboard: Object.freeze({
        cardsPerUnit: 1,
        widthMeters: 1.15
    }),
    middle: Object.freeze({
        cardsPerUnit: 2,
        widthMeters: 1.15
    })
});

export const GRASS_COHESIVE_FIELD_LAYOUT_DEFAULTS = GRASS_COHESIVE_FIELD_DEFAULTS;

function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function round(value, digits = 9) {
    const scale = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

function formatIdentityNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(9) : 'invalid';
}

function hashText(value) {
    const text = String(value ?? '');
    let hash = HASH_OFFSET;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, HASH_PRIME);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function makeDeterministicUnit(seed) {
    let state = Number.parseInt(hashText(seed), 16) >>> 0;
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function createIndependentUnitJitter(seed, cellX, cellZ, axis, rootJitterFactor) {
    const jitter = (makeDeterministicUnit(`${seed}|${cellX},${cellZ}|root-${axis}`) - 0.5)
        * rootJitterFactor;
    return Math.max(-0.45, Math.min(0.45, jitter));
}

function isExactCoverageDefinition(value) {
    return value?.schema === GRASS_COVERAGE_SCHEMA
        && Number(value?.version) === GRASS_COVERAGE_VERSION
        && Array.isArray(value?.exclusions);
}

function normalizeBounds(value, label) {
    const minX = Number(value?.minX);
    const maxX = Number(value?.maxX);
    const minZ = Number(value?.minZ);
    const maxZ = Number(value?.maxZ);
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || maxX <= minX || maxZ <= minZ) {
        throw new Error(`[GrassCohesiveFieldLayout] ${label} must be finite and ordered.`);
    }
    return Object.freeze({ minX, maxX, minZ, maxZ });
}

function normalizeRect(value, index) {
    const rawX0 = Number(value?.x0);
    const rawX1 = Number(value?.x1);
    const rawZ0 = Number(value?.z0);
    const rawZ1 = Number(value?.z1);
    if (![rawX0, rawX1, rawZ0, rawZ1].every(Number.isFinite)) {
        throw new Error(`[GrassCohesiveFieldLayout] Compatibility rectangle ${index} must have finite x0/x1/z0/z1.`);
    }
    return Object.freeze({
        id: String(value?.id ?? `compatibility_rect_${index}`),
        kind: String(value?.kind ?? 'legacy_rectangle'),
        sourceIdentity: String(value?.sourceIdentity ?? `compatibility-rectangle:${index}`),
        x0: Math.min(rawX0, rawX1),
        x1: Math.max(rawX0, rawX1),
        z0: Math.min(rawZ0, rawZ1),
        z1: Math.max(rawZ0, rawZ1)
    });
}

function signedDistanceToBounds(x, z, bounds) {
    const inside = x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
    if (inside) return Math.min(x - bounds.minX, bounds.maxX - x, z - bounds.minZ, bounds.maxZ - z);
    const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
    const dz = Math.max(bounds.minZ - z, 0, z - bounds.maxZ);
    return -Math.hypot(dx, dz);
}

function signedDistanceToRect(x, z, rect) {
    const inside = x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
    if (inside) return -Math.min(x - rect.x0, rect.x1 - x, z - rect.z0, rect.z1 - z);
    const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
    const dz = Math.max(rect.z0 - z, 0, z - rect.z1);
    return Math.hypot(dx, dz);
}

function createCompatibilitySample(x, z, terrainBounds, rects, coverageConfig) {
    const boundsDistance = signedDistanceToBounds(x, z, terrainBounds);
    let nearestRect = null;
    let nearestSignedDistance = Infinity;
    let excluded = false;
    for (const rect of rects) {
        const signedDistance = signedDistanceToRect(x, z, rect);
        if (Math.abs(signedDistance) < Math.abs(nearestSignedDistance)) {
            nearestRect = rect;
            nearestSignedDistance = signedDistance;
        }
        if (signedDistance <= 0) excluded = true;
    }
    const occupied = boundsDistance >= 0 && !excluded;
    const boundaryDistanceMeters = Number.isFinite(nearestSignedDistance)
        ? round(occupied ? Math.abs(nearestSignedDistance) : -Math.abs(nearestSignedDistance))
        : null;
    const rootEligible = occupied && (!Number.isFinite(nearestSignedDistance)
        || nearestSignedDistance + EPS >= coverageConfig.rootClearanceMeters);
    const nearestKind = boundsDistance < 0 ? 'bounds' : nearestRect?.kind ?? null;
    return Object.freeze({
        occupancy: Number(occupied),
        occupied,
        boundaryDistanceMeters,
        sourceBoundaryDistanceMeters: boundaryDistanceMeters,
        rootEligible,
        antialiasFactor: Number(occupied),
        exclusionId: boundsDistance < 0 ? 'bounds' : nearestRect?.id ?? null,
        exclusionKind: nearestKind,
        sourceIdentity: boundsDistance < 0 ? null : nearestRect?.sourceIdentity ?? null
    });
}

function freezeTierConfig(value, fallback) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.freeze({
        cardsPerUnit: Math.round(clamp(source.cardsPerUnit, 1, 4, fallback.cardsPerUnit)),
        widthMeters: clamp(source.widthMeters, 0.02, 2.5, fallback.widthMeters)
    });
}

/**
 * Sanitizes every placement-affecting cohesive-field layout setting.
 * @param {unknown} value
 * @returns {Readonly<object>}
 */
export function sanitizeGrassCohesiveFieldConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.freeze({
        schema: GRASS_COHESIVE_FIELD_SCHEMA,
        version: GRASS_COHESIVE_FIELD_VERSION,
        seed: String(source.seed ?? GRASS_COHESIVE_FIELD_DEFAULTS.seed).trim().slice(0, 160)
            || GRASS_COHESIVE_FIELD_DEFAULTS.seed,
        unitSizeMeters: GRASS_COHESIVE_FIELD_UNIT_SIZE_METERS,
        radiusMeters: clamp(source.radiusMeters, 1, 64, GRASS_COHESIVE_FIELD_DEFAULTS.radiusMeters),
        rootJitterFactor: clamp(source.rootJitterFactor, 0, 0.9, GRASS_COHESIVE_FIELD_DEFAULTS.rootJitterFactor),
        boundarySafetyMeters: clamp(source.boundarySafetyMeters, 0.0001, 0.01, GRASS_COHESIVE_FIELD_DEFAULTS.boundarySafetyMeters),
        scaleVariation: clamp(source.scaleVariation, 0, 0.2, GRASS_COHESIVE_FIELD_DEFAULTS.scaleVariation),
        atlasVariants: Math.round(clamp(source.atlasVariants, 1, 64, GRASS_COHESIVE_FIELD_DEFAULTS.atlasVariants)),
        billboard: freezeTierConfig(source.billboard, GRASS_COHESIVE_FIELD_DEFAULTS.billboard),
        middle: freezeTierConfig(source.middle, GRASS_COHESIVE_FIELD_DEFAULTS.middle)
    });
}

export const sanitizeGrassCohesiveFieldLayoutConfig = sanitizeGrassCohesiveFieldConfig;

function createCoverageIdentity(exactDefinition, terrainBounds, rects) {
    const terrainIdentity = [
        formatIdentityNumber(terrainBounds.minX),
        formatIdentityNumber(terrainBounds.maxX),
        formatIdentityNumber(terrainBounds.minZ),
        formatIdentityNumber(terrainBounds.maxZ)
    ].join(',');
    if (exactDefinition) {
        const bounds = exactDefinition.bounds;
        return [
            exactDefinition.schema,
            exactDefinition.version,
            String(exactDefinition.boundarySignature ?? 'none'),
            'definition-bounds',
            formatIdentityNumber(bounds?.minX),
            formatIdentityNumber(bounds?.maxX),
            formatIdentityNumber(bounds?.minZ),
            formatIdentityNumber(bounds?.maxZ),
            'terrain-bounds',
            terrainIdentity
        ].join('|');
    }
    const rectangleIdentity = rects.map((rect) => [
        rect.id,
        rect.kind,
        rect.sourceIdentity,
        formatIdentityNumber(rect.x0),
        formatIdentityNumber(rect.x1),
        formatIdentityNumber(rect.z0),
        formatIdentityNumber(rect.z1)
    ].join(':')).join(';');
    return `compatibility|terrain-bounds|${terrainIdentity}|rectangles|${hashText(rectangleIdentity)}`;
}

function makeTierDiagnostics() {
    return {
        candidateUnits: 0,
        eligibleUnits: 0,
        representedUnits: 0,
        unrepresentedEligibleUnits: 0,
        eligibleAreaSquareMeters: 0,
        representedAreaSquareMeters: 0,
        missingAreaSquareMeters: 0,
        exactEnvelopeFailures: 0,
        envelopeSamples: 0,
        footprintClampedUnits: 0,
        minimumFootprintScale: Infinity,
        maximumFootprintScale: 0
    };
}

function freezeTierDiagnostics(value) {
    return Object.freeze({
        ...value,
        eligibleAreaSquareMeters: round(value.eligibleAreaSquareMeters),
        representedAreaSquareMeters: round(value.representedAreaSquareMeters),
        missingAreaSquareMeters: round(value.eligibleAreaSquareMeters - value.representedAreaSquareMeters),
        minimumFootprintScale: Number.isFinite(value.minimumFootprintScale) ? round(value.minimumFootprintScale) : 0,
        maximumFootprintScale: round(value.maximumFootprintScale)
    });
}

function createProbePositions({ cellX, cellZ, unitSizeMeters, seed, rootJitterFactor }) {
    const x0 = cellX * unitSizeMeters;
    const z0 = cellZ * unitSizeMeters;
    const jitterX = createIndependentUnitJitter(seed, cellX, cellZ, 'x', rootJitterFactor);
    const jitterZ = createIndependentUnitJitter(seed, cellX, cellZ, 'z', rootJitterFactor);
    return [
        { x: x0 + (0.5 + jitterX) * unitSizeMeters, z: z0 + (0.5 + jitterZ) * unitSizeMeters, role: 'jittered' },
        { x: x0 + 0.5 * unitSizeMeters, z: z0 + 0.5 * unitSizeMeters, role: 'center' },
        { x: x0 + 0.08 * unitSizeMeters, z: z0 + 0.08 * unitSizeMeters, role: 'corner_nw' },
        { x: x0 + 0.92 * unitSizeMeters, z: z0 + 0.08 * unitSizeMeters, role: 'corner_ne' },
        { x: x0 + 0.08 * unitSizeMeters, z: z0 + 0.92 * unitSizeMeters, role: 'corner_sw' },
        { x: x0 + 0.92 * unitSizeMeters, z: z0 + 0.92 * unitSizeMeters, role: 'corner_se' }
    ];
}

function getRejectedKind(sample) {
    return String(sample?.exclusionKind ?? 'bounds') || 'other';
}

function getAvailableFootprintRadius(x, z, sample, terrainBounds, safetyMeters) {
    const boundsDistance = Math.max(0, signedDistanceToBounds(x, z, terrainBounds));
    const boundaryDistance = Number(sample?.boundaryDistanceMeters);
    const coverageDistance = Number.isFinite(boundaryDistance) ? Math.max(0, boundaryDistance) : Infinity;
    return Math.max(0, Math.min(boundsDistance, coverageDistance) - safetyMeters);
}

/**
 * Creates one deterministic shared layout used by both simplified field tiers.
 * Exact AI 359 polygon coverage is authoritative whenever a V2 definition is supplied.
 * @param {object} options
 * @param {number} options.cameraX
 * @param {number} options.cameraZ
 * @param {object} options.terrainBounds
 * @param {unknown} [options.config]
 * @param {object|null} [options.coverageDefinition]
 * @param {unknown} [options.coverageConfig]
 * @param {Array<object>} [options.exclusionRects]
 * @param {Map<string,Readonly<object>>} [options.coverageSampleCache]
 * @returns {Readonly<object>}
 */
export function createGrassCohesiveFieldLayout(options = {}) {
    const cameraX = Number(options.cameraX);
    const cameraZ = Number(options.cameraZ);
    if (!Number.isFinite(cameraX) || !Number.isFinite(cameraZ)) {
        throw new Error('[GrassCohesiveFieldLayout] cameraX/cameraZ must be finite.');
    }
    const config = sanitizeGrassCohesiveFieldConfig(options.config);
    const terrainBounds = normalizeBounds(options.terrainBounds, 'terrainBounds');
    const suppliedDefinition = options.coverageDefinition ?? null;
    if (suppliedDefinition && !isExactCoverageDefinition(suppliedDefinition)) {
        throw new Error('[GrassCohesiveFieldLayout] coverageDefinition must use the AI 359 V2 schema.');
    }
    const exactDefinition = isExactCoverageDefinition(suppliedDefinition) ? suppliedDefinition : null;
    const coverageConfig = createGrassCoverageStaticGeometryConfig(options.coverageConfig);
    const rects = exactDefinition
        ? Object.freeze([])
        : Object.freeze((Array.isArray(options.exclusionRects) ? options.exclusionRects : []).map(normalizeRect));
    const coverageMode = exactDefinition ? 'exact_polygon' : (rects.length ? 'rectangle_compatibility' : 'terrain_bounds');
    const boundarySignature = exactDefinition?.boundarySignature
        ?? `compatibility-${hashText(JSON.stringify(rects))}`;
    const sourceLoopIdentity = exactDefinition?.sourceLoopIdentity ?? '';
    const coverageIdentity = createCoverageIdentity(exactDefinition, terrainBounds, rects);
    const coverageSampleCache = options.coverageSampleCache instanceof Map ? options.coverageSampleCache : null;
    const unitSize = GRASS_COHESIVE_FIELD_UNIT_SIZE_METERS;
    const unitArea = unitSize * unitSize;
    const centerCellX = Math.floor(cameraX / unitSize);
    const centerCellZ = Math.floor(cameraZ / unitSize);
    const centerX = (centerCellX + 0.5) * unitSize;
    const centerZ = (centerCellZ + 0.5) * unitSize;
    const radiusSq = config.radiusMeters * config.radiusMeters;
    const cellRadius = Math.ceil((config.radiusMeters + unitSize * Math.SQRT2) / unitSize);
    const diagnostics = {
        candidateUnits: 0,
        eligibleUnits: 0,
        representedUnits: 0,
        unrepresentedEligibleUnits: 0,
        rejectedUnits: 0,
        partialUnits: 0,
        candidateProbes: 0,
        eligibleProbes: 0,
        rejectedProbes: 0,
        eligibleAreaSquareMeters: 0,
        representedAreaSquareMeters: 0,
        missingAreaSquareMeters: 0,
        rejectedByKind: {},
        exactPostcheckFailures: 0,
        exactEnvelopeFailures: 0,
        boundaryCompletionProbes: 0,
        boundaryCompletionSelectedUnits: 0,
        coverageSampleCacheHits: 0,
        coverageSampleCacheMisses: 0
    };
    const tierDiagnostics = {
        billboard: makeTierDiagnostics(),
        middle: makeTierDiagnostics()
    };

    const insideCandidateRegion = (x, z) => {
        const dx = x - centerX;
        const dz = z - centerZ;
        return dx * dx + dz * dz <= radiusSq
            && x >= terrainBounds.minX && x <= terrainBounds.maxX
            && z >= terrainBounds.minZ && z <= terrainBounds.maxZ;
    };
    const sampleRoot = (x, z) => {
        const sampleKey = [
            coverageIdentity,
            coverageConfig.rootClearanceMeters.toFixed(9),
            coverageConfig.edgeAntialiasMeters.toFixed(9),
            x.toFixed(9),
            z.toFixed(9)
        ].join('|');
        if (coverageSampleCache?.has(sampleKey)) {
            diagnostics.coverageSampleCacheHits++;
            return coverageSampleCache.get(sampleKey);
        }
        diagnostics.coverageSampleCacheMisses++;
        const terrainDistance = signedDistanceToBounds(x, z, terrainBounds);
        let sample = exactDefinition
            ? sampleGrassCoverageContract(exactDefinition, x, z, coverageConfig)
            : createCompatibilitySample(x, z, terrainBounds, rects, coverageConfig);
        if (terrainDistance < 0 && sample.occupied) {
            sample = Object.freeze({
                ...sample,
                occupancy: 0,
                occupied: false,
                rootEligible: false,
                antialiasFactor: 0,
                exclusionId: 'bounds',
                exclusionKind: 'bounds',
                sourceIdentity: null
            });
        }
        if (coverageSampleCache) {
            if (coverageSampleCache.size >= 120000) coverageSampleCache.delete(coverageSampleCache.keys().next().value);
            coverageSampleCache.set(sampleKey, sample);
        }
        return sample;
    };
    const boundaryCompletionByCell = new Map();
    if (exactDefinition) {
        const partition = createGrassCoveragePartition(exactDefinition, coverageConfig);
        const insetMeters = coverageConfig.rootClearanceMeters + config.boundarySafetyMeters + 0.003;
        for (const segment of partition.boundarySegments) {
            const count = Math.max(1, Math.ceil(segment.length / BOUNDARY_COMPLETION_SPACING_METERS));
            for (let index = 0; index < count; index++) {
                const t = (index + 0.5) / count;
                const x = segment.a.x + (segment.b.x - segment.a.x) * t
                    + segment.grassNormal.x * insetMeters;
                const z = segment.a.z + (segment.b.z - segment.a.z) * t
                    + segment.grassNormal.z * insetMeters;
                if (!insideCandidateRegion(x, z)) continue;
                const key = `${Math.floor(x / unitSize)},${Math.floor(z / unitSize)}`;
                const probes = boundaryCompletionByCell.get(key) ?? [];
                probes.push({ x, z, role: 'boundary_completion' });
                boundaryCompletionByCell.set(key, probes);
                diagnostics.boundaryCompletionProbes++;
            }
        }
    }
    const checkEnvelope = (x, z, radius) => {
        if (!exactDefinition || radius <= EPS) return { passed: radius > EPS, samples: 0 };
        let samples = 0;
        for (const direction of ENVELOPE_DIRECTIONS) {
            samples++;
            const sample = sampleRoot(x + direction.x * radius, z + direction.z * radius);
            if (!sample.occupied) return { passed: false, samples };
        }
        return { passed: true, samples };
    };
    const createTierCandidate = ({ tier, unitKey, x, z, yawRadians, scale, atlasVariant, availableRadius, rootPostcheckPassed }) => {
        const settings = config[tier];
        const requestedRadius = settings.widthMeters * scale * 0.5;
        const safeRadius = Math.min(requestedRadius, availableRadius);
        const footprintScale = requestedRadius > EPS ? safeRadius / requestedRadius : 0;
        const envelope = rootPostcheckPassed
            ? checkEnvelope(x, z, safeRadius)
            : { passed: false, samples: 0 };
        const represented = rootPostcheckPassed && safeRadius > EPS && envelope.passed;
        const stats = tierDiagnostics[tier];
        stats.envelopeSamples += envelope.samples;
        if (exactDefinition && rootPostcheckPassed && safeRadius > EPS && !envelope.passed) {
            stats.exactEnvelopeFailures++;
            diagnostics.exactEnvelopeFailures++;
        }
        if (represented) {
            stats.representedUnits++;
            stats.representedAreaSquareMeters += unitArea;
            stats.minimumFootprintScale = Math.min(stats.minimumFootprintScale, footprintScale);
            stats.maximumFootprintScale = Math.max(stats.maximumFootprintScale, footprintScale);
            if (footprintScale < 1 - EPS) stats.footprintClampedUnits++;
        }
        return Object.freeze({
            key: `${unitKey}|${tier}`,
            unitKey,
            tier,
            x,
            z,
            yawRadians,
            scale,
            variant: atlasVariant,
            atlasVariant,
            cardsPerUnit: settings.cardsPerUnit,
            requestedWidthMeters: settings.widthMeters,
            widthMeters: represented ? safeRadius * 2 : 0,
            footprintRadiusMeters: represented ? safeRadius : 0,
            footprintScale: represented ? footprintScale : 0,
            represented,
            exactEnvelopePassed: envelope.passed,
            exactEnvelopeSamples: envelope.samples
        });
    };

    const units = [];
    const billboardUnits = [];
    const middleUnits = [];
    const placementParts = [
        coverageIdentity,
        config.seed,
        config.radiusMeters,
        config.rootJitterFactor,
        config.boundarySafetyMeters,
        config.scaleVariation,
        config.atlasVariants,
        config.billboard.cardsPerUnit,
        config.billboard.widthMeters,
        config.middle.cardsPerUnit,
        config.middle.widthMeters
    ];

    for (let cellZ = centerCellZ - cellRadius; cellZ <= centerCellZ + cellRadius; cellZ++) {
        for (let cellX = centerCellX - cellRadius; cellX <= centerCellX + cellRadius; cellX++) {
            const unitKey = `${cellX},${cellZ}`;
            const probes = [...createProbePositions({
                cellX,
                cellZ,
                unitSizeMeters: unitSize,
                seed: config.seed,
                rootJitterFactor: config.rootJitterFactor
            }), ...(boundaryCompletionByCell.get(unitKey) ?? [])]
                .filter((probe) => insideCandidateRegion(probe.x, probe.z));
            if (!probes.length) continue;
            const scale = 1 + (
                makeDeterministicUnit(`${config.seed}|${unitKey}|scale`) * 2 - 1
            ) * config.scaleVariation;
            const requiredFootprintRadius = Math.max(
                config.billboard.widthMeters,
                config.middle.widthMeters
            ) * scale * 0.5;
            diagnostics.candidateUnits++;
            diagnostics.candidateProbes += probes.length;
            tierDiagnostics.billboard.candidateUnits++;
            tierDiagnostics.middle.candidateUnits++;
            const sampledProbes = probes.map((probe) => {
                const sample = sampleRoot(probe.x, probe.z);
                const availableRadius = sample.rootEligible
                    ? getAvailableFootprintRadius(probe.x, probe.z, sample, terrainBounds, config.boundarySafetyMeters)
                    : 0;
                if (sample.rootEligible) diagnostics.eligibleProbes++;
                else diagnostics.rejectedProbes++;
                return { ...probe, sample, availableRadius };
            });
            const eligibleProbes = sampledProbes.filter((probe) => probe.sample.rootEligible);
            if (!eligibleProbes.length) {
                diagnostics.rejectedUnits++;
                const kind = getRejectedKind(sampledProbes[0]?.sample);
                diagnostics.rejectedByKind[kind] = (diagnostics.rejectedByKind[kind] ?? 0) + 1;
                continue;
            }
            const selected = sampledProbes.find((probe) => (
                probe.sample.rootEligible
                && probe.availableRadius + EPS >= requiredFootprintRadius
            )) ?? eligibleProbes.sort((a, b) => b.availableRadius - a.availableRadius)[0];
            if (selected.role === 'boundary_completion') diagnostics.boundaryCompletionSelectedUnits++;
            const yawRadians = (
                makeDeterministicUnit(`${config.seed}|${unitKey}|yaw`) * 2 - 1
            ) * ORIENTATION_VARIATION_RADIANS;
            const atlasVariant = Math.floor(makeDeterministicUnit(`${config.seed}|${unitKey}|atlas`) * config.atlasVariants);
            const stableSample = makeDeterministicUnit(`${config.seed}|${unitKey}|handoff`);
            const rootPostcheck = sampleRoot(selected.x, selected.z);
            const rootPostcheckPassed = !exactDefinition || rootPostcheck.rootEligible;
            if (!rootPostcheckPassed) diagnostics.exactPostcheckFailures++;
            if (eligibleProbes.length < sampledProbes.length) diagnostics.partialUnits++;
            diagnostics.eligibleUnits++;
            diagnostics.eligibleAreaSquareMeters += unitArea;
            tierDiagnostics.billboard.eligibleUnits++;
            tierDiagnostics.billboard.eligibleAreaSquareMeters += unitArea;
            tierDiagnostics.middle.eligibleUnits++;
            tierDiagnostics.middle.eligibleAreaSquareMeters += unitArea;

            const common = {
                unitKey,
                x: selected.x,
                z: selected.z,
                yawRadians,
                scale,
                atlasVariant,
                availableRadius: selected.availableRadius,
                rootPostcheckPassed
            };
            const billboard = createTierCandidate({ tier: GRASS_COHESIVE_FIELD_TIER.BILLBOARD, ...common });
            const middle = createTierCandidate({ tier: GRASS_COHESIVE_FIELD_TIER.MIDDLE, ...common });
            if (billboard.represented && middle.represented) {
                diagnostics.representedUnits++;
                diagnostics.representedAreaSquareMeters += unitArea;
            }
            const unit = Object.freeze({
                key: unitKey,
                cellX,
                cellZ,
                x: selected.x,
                z: selected.z,
                areaSquareMeters: unitArea,
                probeRole: selected.role,
                eligibleProbeCount: eligibleProbes.length,
                candidateProbeCount: sampledProbes.length,
                partial: eligibleProbes.length < sampledProbes.length,
                stableSample,
                yawRadians,
                scale,
                variant: atlasVariant,
                atlasVariant,
                footprintScale: Math.min(billboard.footprintScale, middle.footprintScale),
                boundaryDistanceMeters: selected.sample.boundaryDistanceMeters,
                sourceBoundaryDistanceMeters: selected.sample.sourceBoundaryDistanceMeters,
                rootClearanceMeters: coverageConfig.rootClearanceMeters,
                nearestExclusionId: selected.sample.exclusionId,
                nearestExclusionKind: selected.sample.exclusionKind,
                sourceIdentity: selected.sample.sourceIdentity,
                availableFootprintRadiusMeters: selected.availableRadius,
                exactPostcheckPassed: rootPostcheckPassed,
                billboard,
                middle
            });
            units.push(unit);
            billboardUnits.push(billboard);
            middleUnits.push(middle);
            placementParts.push([
                unit.key,
                unit.x.toFixed(6),
                unit.z.toFixed(6),
                unit.yawRadians.toFixed(6),
                unit.scale.toFixed(6),
                unit.atlasVariant,
                billboard.widthMeters.toFixed(6),
                Number(billboard.represented),
                middle.widthMeters.toFixed(6),
                Number(middle.represented)
            ].join('@'));
        }
    }

    diagnostics.unrepresentedEligibleUnits = Math.max(0, diagnostics.eligibleUnits - diagnostics.representedUnits);
    diagnostics.missingAreaSquareMeters = diagnostics.eligibleAreaSquareMeters - diagnostics.representedAreaSquareMeters;
    tierDiagnostics.billboard.unrepresentedEligibleUnits = Math.max(
        0,
        tierDiagnostics.billboard.eligibleUnits - tierDiagnostics.billboard.representedUnits
    );
    tierDiagnostics.middle.unrepresentedEligibleUnits = Math.max(
        0,
        tierDiagnostics.middle.eligibleUnits - tierDiagnostics.middle.representedUnits
    );
    const frozenBillboardDiagnostics = freezeTierDiagnostics(tierDiagnostics.billboard);
    const frozenMiddleDiagnostics = freezeTierDiagnostics(tierDiagnostics.middle);
    const frozenRejectedByKind = Object.freeze({ ...diagnostics.rejectedByKind });
    const frozenDiagnostics = Object.freeze({
        ...diagnostics,
        eligibleAreaSquareMeters: round(diagnostics.eligibleAreaSquareMeters),
        representedAreaSquareMeters: round(diagnostics.representedAreaSquareMeters),
        missingAreaSquareMeters: round(diagnostics.missingAreaSquareMeters),
        rejectedByKind: frozenRejectedByKind,
        tiers: Object.freeze({
            billboard: frozenBillboardDiagnostics,
            middle: frozenMiddleDiagnostics
        })
    });
    const placementSignature = `cohesive-field-v2-${hashText(placementParts.join('|'))}`;
    const cacheIdentity = [
        coverageIdentity,
        coverageConfig.rootClearanceMeters,
        coverageConfig.edgeAntialiasMeters,
        config.seed,
        config.radiusMeters,
        config.rootJitterFactor,
        config.boundarySafetyMeters,
        config.scaleVariation,
        config.atlasVariants,
        config.billboard.cardsPerUnit,
        config.billboard.widthMeters,
        config.middle.cardsPerUnit,
        config.middle.widthMeters,
        centerCellX,
        centerCellZ
    ].join('|');
    const frozenUnits = Object.freeze(units);
    return Object.freeze({
        schema: GRASS_COHESIVE_FIELD_SCHEMA,
        version: GRASS_COHESIVE_FIELD_VERSION,
        config,
        coverageMode,
        coverageIdentity,
        boundarySignature,
        sourceLoopIdentity,
        placementSignature,
        cacheIdentity,
        center: Object.freeze({ cellX: centerCellX, cellZ: centerCellZ, x: centerX, z: centerZ }),
        terrainBounds,
        units: frozenUnits,
        tiers: Object.freeze({
            billboard: Object.freeze({
                units: Object.freeze(billboardUnits),
                diagnostics: frozenBillboardDiagnostics
            }),
            middle: Object.freeze({
                units: Object.freeze(middleUnits),
                diagnostics: frozenMiddleDiagnostics
            })
        }),
        diagnostics: frozenDiagnostics
    });
}
