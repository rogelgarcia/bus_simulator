// Deterministic root-bin layout contract for the cohesive near grass carpet.
// @ts-check

import {
    createGrassCoverageStaticGeometryConfig,
    sampleGrassCoverageContract
} from '../../../app/grass/GrassCoverageContract.js';

const COVERAGE_SCHEMA = 'bus-simulator.grass-coverage';
const COVERAGE_VERSION = 2;
const HASH_OFFSET = 2166136261;
const HASH_PRIME = 16777619;

export const GRASS_NEAR_CARPET_MODE = Object.freeze({
    AUTO: 'auto',
    FORCE: 'force',
    DISABLED: 'disabled'
});

export const GRASS_NEAR_CARPET_DEFAULTS = Object.freeze({
    enabled: false,
    mode: GRASS_NEAR_CARPET_MODE.AUTO,
    seed: 'near-carpet-v2',
    patchSizeMeters: 1.0,
    bladesPerSquareMeter: 64,
    fibersPerRoot: 3,
    radiusMeters: 12,
    chunkSizeMeters: 32,
    yOffsetMeters: 0.0275,
    structuralBaseHeightMeters: 0.0275,
    patchScaleVariation: 0.04,
    colorBrightnessVariation: 0.08,
    baseColor: '#494E30',
    tipColor: '#616743',
    materialId: 'pbr.grass_low_cut_maintained_v2',
    bladeTipElevationMeters: Object.freeze({ min: 0.040, max: 0.075 }),
    bladeWidthMeters: Object.freeze({ min: 0.0022, max: 0.0058 }),
    bendDegrees: Object.freeze({ min: 3, max: 17 }),
    inclinationDegrees: Object.freeze({ min: 0, max: 8 }),
    heightDistributionExponent: 1.35,
    rootJitterFactor: 0.56,
    boundaryRootSpacingMeters: 0.04,
    boundaryRootInsetMeters: 0.0065,
    boundarySafetyMeters: 0.0005,
    roughness: 0.94
});

function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function sanitizeRange(value, defaults, min, max) {
    const source = value && typeof value === 'object' ? value : {};
    const low = clamp(source.min, min, max, defaults.min);
    return Object.freeze({ min: low, max: Math.max(low, clamp(source.max, min, max, defaults.max)) });
}

function sanitizeColor(value, fallback) {
    const match = String(value ?? '').trim().match(/^#?([0-9a-f]{6})$/i);
    return match ? `#${match[1].toUpperCase()}` : fallback;
}

function sanitizeMode(value) {
    const mode = String(value ?? GRASS_NEAR_CARPET_DEFAULTS.mode);
    return Object.values(GRASS_NEAR_CARPET_MODE).includes(mode) ? mode : GRASS_NEAR_CARPET_DEFAULTS.mode;
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

function isExactCoverageDefinition(value) {
    return value?.schema === COVERAGE_SCHEMA
        && Number(value?.version) === COVERAGE_VERSION
        && Array.isArray(value?.exclusions);
}

function formatCoverageIdentityNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(9) : 'invalid';
}

/**
 * Boundary signatures intentionally describe exclusion loops only. Near-placement
 * caches also need the definition bounds because the exact sampler treats them as
 * a hard occupancy gate.
 */
export function getGrassNearCarpetCoverageIdentity(definition) {
    if (!isExactCoverageDefinition(definition)) {
        return `coverage:${String(definition?.boundarySignature ?? 'none')}`;
    }
    const bounds = definition.bounds;
    return [
        definition.schema,
        definition.version,
        String(definition.boundarySignature ?? 'none'),
        'bounds',
        formatCoverageIdentityNumber(bounds?.minX),
        formatCoverageIdentityNumber(bounds?.maxX),
        formatCoverageIdentityNumber(bounds?.minZ),
        formatCoverageIdentityNumber(bounds?.maxZ)
    ].join('|');
}

function isInsideRect(x, z, rect) {
    const x0 = Math.min(Number(rect?.x0), Number(rect?.x1));
    const x1 = Math.max(Number(rect?.x0), Number(rect?.x1));
    const z0 = Math.min(Number(rect?.z0), Number(rect?.z1));
    const z1 = Math.max(Number(rect?.z0), Number(rect?.z1));
    return [x0, x1, z0, z1].every(Number.isFinite) && x >= x0 && x <= x1 && z >= z0 && z <= z1;
}

function getRejectedKind(sample) {
    const kind = String(sample?.exclusionKind ?? 'bounds');
    return kind || 'other';
}

function freezeRoot(root) {
    return Object.freeze({ ...root });
}

function createExactBoundarySegments(definition) {
    const segments = [];
    for (const exclusion of definition.exclusions) {
        const loop = exclusion.onsetLoop;
        for (let index = 0; index < loop.length; index++) {
            const a = loop[index];
            const b = loop[(index + 1) % loop.length];
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const length = Math.hypot(dx, dz);
            if (length <= 1e-7) continue;
            segments.push({
                id: exclusion.id + ':segment:' + index,
                exclusionId: exclusion.id,
                kind: exclusion.kind,
                a,
                b,
                grassNormal: { x: dz / length, z: -dx / length },
                length
            });
        }
    }
    return segments;
}

/** @param {unknown} value @returns {Readonly<object>} */
export function sanitizeGrassNearCarpetConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    const config = {
        enabled: source.enabled === true,
        mode: sanitizeMode(source.mode),
        seed: String(source.seed ?? GRASS_NEAR_CARPET_DEFAULTS.seed).trim().slice(0, 160) || GRASS_NEAR_CARPET_DEFAULTS.seed,
        patchSizeMeters: clamp(source.patchSizeMeters, 0.5, 2.0, GRASS_NEAR_CARPET_DEFAULTS.patchSizeMeters),
        bladesPerSquareMeter: Math.round(clamp(source.bladesPerSquareMeter, 4, 96, GRASS_NEAR_CARPET_DEFAULTS.bladesPerSquareMeter)),
        fibersPerRoot: Math.round(clamp(source.fibersPerRoot, 2, 4, GRASS_NEAR_CARPET_DEFAULTS.fibersPerRoot)),
        radiusMeters: clamp(source.radiusMeters, 2, 64, GRASS_NEAR_CARPET_DEFAULTS.radiusMeters),
        chunkSizeMeters: clamp(source.chunkSizeMeters, 4, 32, GRASS_NEAR_CARPET_DEFAULTS.chunkSizeMeters),
        yOffsetMeters: clamp(source.yOffsetMeters, 0, 0.08, GRASS_NEAR_CARPET_DEFAULTS.yOffsetMeters),
        structuralBaseHeightMeters: clamp(source.structuralBaseHeightMeters ?? source.yOffsetMeters, 0.015, 0.05, GRASS_NEAR_CARPET_DEFAULTS.structuralBaseHeightMeters),
        patchScaleVariation: clamp(source.patchScaleVariation, 0, 0.12, GRASS_NEAR_CARPET_DEFAULTS.patchScaleVariation),
        colorBrightnessVariation: clamp(source.colorBrightnessVariation, 0, 0.25, GRASS_NEAR_CARPET_DEFAULTS.colorBrightnessVariation),
        baseColor: sanitizeColor(source.baseColor, GRASS_NEAR_CARPET_DEFAULTS.baseColor),
        tipColor: sanitizeColor(source.tipColor, GRASS_NEAR_CARPET_DEFAULTS.tipColor),
        materialId: String(source.materialId ?? GRASS_NEAR_CARPET_DEFAULTS.materialId).trim().slice(0, 160) || GRASS_NEAR_CARPET_DEFAULTS.materialId,
        bladeTipElevationMeters: sanitizeRange(source.bladeTipElevationMeters, GRASS_NEAR_CARPET_DEFAULTS.bladeTipElevationMeters, 0.0275, 0.12),
        bladeWidthMeters: sanitizeRange(source.bladeWidthMeters, GRASS_NEAR_CARPET_DEFAULTS.bladeWidthMeters, 0.0008, 0.01),
        bendDegrees: sanitizeRange(source.bendDegrees, GRASS_NEAR_CARPET_DEFAULTS.bendDegrees, -60, 60),
        inclinationDegrees: sanitizeRange(source.inclinationDegrees, GRASS_NEAR_CARPET_DEFAULTS.inclinationDegrees, -45, 45),
        heightDistributionExponent: clamp(source.heightDistributionExponent, 0.5, 3, GRASS_NEAR_CARPET_DEFAULTS.heightDistributionExponent),
        rootJitterFactor: clamp(source.rootJitterFactor, 0, 0.8, GRASS_NEAR_CARPET_DEFAULTS.rootJitterFactor),
        boundaryRootSpacingMeters: clamp(source.boundaryRootSpacingMeters, 0.02, 0.1, GRASS_NEAR_CARPET_DEFAULTS.boundaryRootSpacingMeters),
        boundaryRootInsetMeters: clamp(source.boundaryRootInsetMeters, 0.003, 0.02, GRASS_NEAR_CARPET_DEFAULTS.boundaryRootInsetMeters),
        boundarySafetyMeters: clamp(source.boundarySafetyMeters, 0.0001, 0.003, GRASS_NEAR_CARPET_DEFAULTS.boundarySafetyMeters),
        roughness: clamp(source.roughness, 0.45, 1, GRASS_NEAR_CARPET_DEFAULTS.roughness)
    };
    config.bladeTipElevationMeters = Object.freeze({
        min: Math.max(config.structuralBaseHeightMeters, config.bladeTipElevationMeters.min),
        max: Math.max(config.structuralBaseHeightMeters, config.bladeTipElevationMeters.max)
    });
    const visibleMin = Math.max(0.001, config.bladeTipElevationMeters.min - config.structuralBaseHeightMeters);
    const visibleMax = Math.max(visibleMin, config.bladeTipElevationMeters.max - config.structuralBaseHeightMeters);
    config.bladeHeightMeters = Object.freeze({ min: visibleMin, max: visibleMax });
    return Object.freeze(config);
}

/** @param {number} cellX @param {number} cellZ @returns {string} */
export function getGrassNearCarpetCellKey(cellX, cellZ) {
    return `${Math.trunc(cellX)},${Math.trunc(cellZ)}`;
}

/** @param {string} key @returns {{cellX:number, cellZ:number}} */
export function parseGrassNearCarpetCellKey(key) {
    const [rawX, rawZ] = String(key ?? '').split(',');
    const cellX = Number(rawX);
    const cellZ = Number(rawZ);
    if (!Number.isInteger(cellX) || !Number.isInteger(cellZ)) throw new Error(`[GrassNearCarpetLayout] Invalid cell key: ${String(key)}`);
    return { cellX, cellZ };
}

/** @param {Readonly<object>} config @returns {number} */
export function getGrassNearCarpetRootsPerPatch(config) {
    const source = sanitizeGrassNearCarpetConfig(config);
    return Math.max(1, Math.round(source.bladesPerSquareMeter * source.patchSizeMeters * source.patchSizeMeters));
}

/** Historical name retained for consumers that report physical blade fibers. */
export function getGrassNearCarpetBladesPerPatch(config) {
    const source = sanitizeGrassNearCarpetConfig(config);
    return getGrassNearCarpetRootsPerPatch(source) * source.fibersPerRoot;
}

function getRootGridDimensions(rootCount) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(rootCount)));
    return { columns, rows: Math.max(1, Math.ceil(rootCount / columns)) };
}

/**
 * Creates world-stable one-metre ownership cells containing exact-tested V2 roots.
 * Legacy rectangles are consulted only when no AI359 polygon definition is present.
 */
export function createGrassNearCarpetCellSet(options) {
    const config = sanitizeGrassNearCarpetConfig(options?.config);
    const cameraX = Number(options?.cameraX);
    const cameraZ = Number(options?.cameraZ);
    if (!Number.isFinite(cameraX) || !Number.isFinite(cameraZ)) throw new Error('[GrassNearCarpetLayout] cameraX/cameraZ must be finite.');
    const bounds = options?.terrainBounds;
    const minX = Number(bounds?.minX);
    const maxX = Number(bounds?.maxX);
    const minZ = Number(bounds?.minZ);
    const maxZ = Number(bounds?.maxZ);
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || maxX <= minX || maxZ <= minZ) {
        throw new Error('[GrassNearCarpetLayout] terrainBounds must be finite and ordered.');
    }

    const exactDefinition = isExactCoverageDefinition(options?.coverageDefinition)
        ? options.coverageDefinition
        : null;
    const coverageConfig = exactDefinition
        ? createGrassCoverageStaticGeometryConfig(options?.coverageConfig)
        : null;
    const exclusionRects = Array.isArray(options?.exclusionRects) ? options.exclusionRects : [];
    const coverageMode = exactDefinition ? 'exact_polygon_v2' : (exclusionRects.length ? 'legacy_rectangles' : 'terrain_bounds');
    const boundarySignature = exactDefinition?.boundarySignature
        ?? `legacy-${hashText(JSON.stringify(exclusionRects))}`;
    const coverageIdentity = exactDefinition
        ? getGrassNearCarpetCoverageIdentity(exactDefinition)
        : boundarySignature;
    const patchSize = config.patchSizeMeters;
    const centerCellX = Math.floor(cameraX / patchSize);
    const centerCellZ = Math.floor(cameraZ / patchSize);
    const centerX = (centerCellX + 0.5) * patchSize;
    const centerZ = (centerCellZ + 0.5) * patchSize;
    const radius = config.radiusMeters;
    const radiusSq = radius * radius;
    const cellRadius = Math.ceil((radius + patchSize * Math.SQRT2) / patchSize);
    const rootsPerPatch = getGrassNearCarpetRootsPerPatch(config);
    const { columns, rows } = getRootGridDimensions(rootsPerPatch);
    const binDepth = patchSize / rows;
    const mutableCells = new Map();
    const rootPositionKeys = new Set();
    const coverageSampleCache = options?.coverageSampleCache instanceof Map
        ? options.coverageSampleCache
        : null;
    const diagnostics = {
        candidateBins: 0,
        eligibleBins: 0,
        representedBins: 0,
        unrepresentedEligibleBins: 0,
        acceptedRoots: 0,
        rejectedRoots: 0,
        clippedRoots: 0,
        rejectedByKind: {},
        partialCells: 0,
        boundaryRootCandidates: 0,
        boundaryRoots: 0,
        boundaryRootRejected: 0,
        exactPostcheckFailures: 0,
        ineligibleRoots: 0,
        sidewalkIntrusions: 0,
        treeIntrusions: 0,
        eligibleAreaSquareMeters: 0,
        representedAreaSquareMeters: 0,
        coverageSampleCacheHits: 0,
        coverageSampleCacheMisses: 0
    };

    const insideRadiusAndTerrain = (x, z) => {
        const dx = x - centerX;
        const dz = z - centerZ;
        return dx * dx + dz * dz <= radiusSq
            && x >= minX && x <= maxX
            && z >= minZ && z <= maxZ;
    };
    const sampleRoot = (x, z) => {
        const rootClearanceMeters = Number(coverageConfig?.rootClearanceMeters ?? 0);
        const edgeAntialiasMeters = Number(coverageConfig?.edgeAntialiasMeters ?? 0);
        const sampleKey = coverageSampleCache
            ? coverageIdentity + '|' + rootClearanceMeters.toFixed(9) + '|' + edgeAntialiasMeters.toFixed(9) + '|' + x.toFixed(9) + ',' + z.toFixed(9)
            : null;
        if (sampleKey && coverageSampleCache.has(sampleKey)) {
            diagnostics.coverageSampleCacheHits++;
            return coverageSampleCache.get(sampleKey);
        }
        diagnostics.coverageSampleCacheMisses++;
        let result;
        if (exactDefinition) result = sampleGrassCoverageContract(exactDefinition, x, z, coverageConfig);
        else {
            const rejectedRect = exclusionRects.find((rect) => isInsideRect(x, z, rect));
            const occupied = !rejectedRect;
            result = {
                occupancy: Number(occupied),
                occupied,
                rootEligible: occupied,
                boundaryDistanceMeters: null,
                sourceBoundaryDistanceMeters: null,
                antialiasFactor: Number(occupied),
                exclusionId: rejectedRect?.id ?? null,
                exclusionKind: rejectedRect?.kind ?? (rejectedRect ? 'legacy_rectangle' : null),
                sourceIdentity: null
            };
        }
        if (sampleKey) {
            if (coverageSampleCache.size >= 120000) coverageSampleCache.delete(coverageSampleCache.keys().next().value);
            coverageSampleCache.set(sampleKey, result);
        }
        return result;
    };
    const ensureMutableCell = (cellX, cellZ) => {
        const key = getGrassNearCarpetCellKey(cellX, cellZ);
        let cell = mutableCells.get(key);
        if (!cell) {
            cell = {
                key,
                cellX,
                cellZ,
                x: (cellX + 0.5) * patchSize,
                z: (cellZ + 0.5) * patchSize,
                roots: [],
                candidateBins: 0,
                eligibleBins: 0,
                rejectedBins: 0
            };
            mutableCells.set(key, cell);
        }
        return cell;
    };
    const addRoot = (cell, root) => {
        const positionKey = `${Math.round(root.x * 10000)},${Math.round(root.z * 10000)}`;
        if (rootPositionKeys.has(positionKey)) return false;
        rootPositionKeys.add(positionKey);
        cell.roots.push(freezeRoot(root));
        return true;
    };

    for (let cellZ = centerCellZ - cellRadius; cellZ <= centerCellZ + cellRadius; cellZ++) {
        for (let cellX = centerCellX - cellRadius; cellX <= centerCellX + cellRadius; cellX++) {
            const cellMinX = cellX * patchSize;
            const cellMinZ = cellZ * patchSize;
            let cell = null;
            for (let index = 0; index < rootsPerPatch; index++) {
                const row = Math.floor(index / columns);
                const rowStart = row * columns;
                const columnsInRow = Math.min(columns, rootsPerPatch - rowStart);
                const column = index - rowStart;
                const binWidth = patchSize / columnsInRow;
                const binArea = binWidth * binDepth;
                const x0 = cellMinX + column * binWidth;
                const z0 = cellMinZ + row * binDepth;
                const jitterX = (makeDeterministicUnit(`${config.seed}|${cellX},${cellZ}|${index}|x`) - 0.5) * config.rootJitterFactor;
                const jitterZ = (makeDeterministicUnit(`${config.seed}|${cellX},${cellZ}|${index}|z`) - 0.5) * config.rootJitterFactor;
                const candidates = [
                    { x: x0 + (0.5 + jitterX) * binWidth, z: z0 + (0.5 + jitterZ) * binDepth },
                    { x: x0 + 0.5 * binWidth, z: z0 + 0.5 * binDepth },
                    { x: x0 + 0.08 * binWidth, z: z0 + 0.08 * binDepth },
                    { x: x0 + 0.92 * binWidth, z: z0 + 0.08 * binDepth },
                    { x: x0 + 0.08 * binWidth, z: z0 + 0.92 * binDepth },
                    { x: x0 + 0.92 * binWidth, z: z0 + 0.92 * binDepth }
                ].filter((candidate) => insideRadiusAndTerrain(candidate.x, candidate.z));
                if (!candidates.length) continue;
                diagnostics.candidateBins++;
                cell = cell ?? ensureMutableCell(cellX, cellZ);
                cell.candidateBins++;
                let accepted = null;
                let firstRejectedSample = null;
                for (const candidate of candidates) {
                    const sample = sampleRoot(candidate.x, candidate.z);
                    if (!firstRejectedSample) firstRejectedSample = sample;
                    if (!sample.rootEligible) continue;
                    accepted = { ...candidate, sample };
                    break;
                }
                if (!accepted) {
                    diagnostics.rejectedRoots++;
                    cell.rejectedBins++;
                    const kind = getRejectedKind(firstRejectedSample);
                    diagnostics.rejectedByKind[kind] = (diagnostics.rejectedByKind[kind] ?? 0) + 1;
                    continue;
                }
                diagnostics.eligibleBins++;
                diagnostics.eligibleAreaSquareMeters += binArea;
                cell.eligibleBins++;
                const added = addRoot(cell, {
                    key: `${cell.key}:bin:${index}`,
                    cellKey: cell.key,
                    binIndex: index,
                    source: 'occupancy_bin',
                    x: accepted.x,
                    z: accepted.z,
                    boundaryDistanceMeters: accepted.sample.boundaryDistanceMeters,
                    sourceBoundaryDistanceMeters: accepted.sample.sourceBoundaryDistanceMeters,
                    rootClearanceMeters: coverageConfig?.rootClearanceMeters ?? 0,
                    nearestExclusionId: accepted.sample.exclusionId,
                    nearestExclusionKind: accepted.sample.exclusionKind
                });
                if (added) {
                    diagnostics.representedBins++;
                    diagnostics.representedAreaSquareMeters += binArea;
                }
            }
        }
    }

    if (exactDefinition) {
        const boundaryInset = Math.max(
            config.boundaryRootInsetMeters,
            coverageConfig.rootClearanceMeters + config.bladeWidthMeters.max * 0.5 + config.boundarySafetyMeters
        );
        for (const segment of createExactBoundarySegments(exactDefinition)) {
            const count = Math.max(1, Math.ceil(segment.length / config.boundaryRootSpacingMeters));
            for (let index = 0; index < count; index++) {
                const t = (index + 0.5) / count;
                const boundaryX = segment.a.x + (segment.b.x - segment.a.x) * t;
                const boundaryZ = segment.a.z + (segment.b.z - segment.a.z) * t;
                const x = boundaryX + segment.grassNormal.x * boundaryInset;
                const z = boundaryZ + segment.grassNormal.z * boundaryInset;
                if (!insideRadiusAndTerrain(x, z)) continue;
                diagnostics.boundaryRootCandidates++;
                const sample = sampleRoot(x, z);
                if (!sample.rootEligible) {
                    diagnostics.boundaryRootRejected++;
                    continue;
                }
                const cellX = Math.floor(x / patchSize);
                const cellZ = Math.floor(z / patchSize);
                const cell = ensureMutableCell(cellX, cellZ);
                const added = addRoot(cell, {
                    key: `${cell.key}:boundary:${segment.id}:${index}`,
                    cellKey: cell.key,
                    binIndex: null,
                    source: 'boundary_row',
                    x,
                    z,
                    boundaryDistanceMeters: sample.boundaryDistanceMeters,
                    sourceBoundaryDistanceMeters: sample.sourceBoundaryDistanceMeters,
                    rootClearanceMeters: coverageConfig.rootClearanceMeters,
                    nearestExclusionId: sample.exclusionId,
                    nearestExclusionKind: sample.exclusionKind
                });
                if (added) diagnostics.boundaryRoots++;
            }
        }
    }

    const cells = new Map();
    const placementParts = [
        coverageIdentity,
        config.seed,
        config.bladesPerSquareMeter,
        config.fibersPerRoot,
        config.rootJitterFactor,
        config.bladeTipElevationMeters.min,
        config.bladeTipElevationMeters.max,
        config.bladeWidthMeters.min,
        config.bladeWidthMeters.max,
        config.bendDegrees.min,
        config.bendDegrees.max,
        config.inclinationDegrees.min,
        config.inclinationDegrees.max,
        config.heightDistributionExponent,
        config.colorBrightnessVariation,
        config.structuralBaseHeightMeters
    ];
    for (const [key, cell] of mutableCells) {
        if (!cell.roots.length) continue;
        if (cell.rejectedBins > 0 && cell.eligibleBins > 0) diagnostics.partialCells++;
        if (exactDefinition) {
            for (const root of cell.roots) {
                const postcheck = sampleRoot(root.x, root.z);
                if (postcheck.rootEligible) continue;
                diagnostics.exactPostcheckFailures++;
                diagnostics.ineligibleRoots++;
                const kind = getRejectedKind(postcheck);
                if (/sidewalk|road|path/i.test(kind)) diagnostics.sidewalkIntrusions++;
                if (/tree/i.test(kind)) diagnostics.treeIntrusions++;
            }
        }
        const roots = Object.freeze(cell.roots.slice());
        for (const root of roots) placementParts.push(`${root.key}@${root.x.toFixed(6)},${root.z.toFixed(6)}`);
        cells.set(key, Object.freeze({ ...cell, roots }));
    }
    diagnostics.acceptedRoots = [...cells.values()].reduce((sum, cell) => sum + cell.roots.length, 0);
    diagnostics.clippedRoots = diagnostics.rejectedRoots + diagnostics.boundaryRootRejected;
    diagnostics.unrepresentedEligibleBins = Math.max(0, diagnostics.eligibleBins - diagnostics.representedBins);
    diagnostics.rejectedByKind = Object.freeze({ ...diagnostics.rejectedByKind });
    const placementSignature = `near-carpet-v2-${hashText(placementParts.join('|'))}`;
    const cacheIdentity = [
        coverageIdentity,
        coverageConfig?.rootClearanceMeters ?? 0,
        coverageConfig?.edgeAntialiasMeters ?? 0,
        config.seed,
        config.patchSizeMeters,
        config.bladesPerSquareMeter,
        config.fibersPerRoot,
        config.radiusMeters,
        config.rootJitterFactor,
        config.boundaryRootSpacingMeters,
        config.boundaryRootInsetMeters,
        config.boundarySafetyMeters,
        config.bladeWidthMeters.min,
        config.bladeWidthMeters.max,
        config.bladeTipElevationMeters.min,
        config.bladeTipElevationMeters.max,
        config.bendDegrees.min,
        config.bendDegrees.max,
        config.inclinationDegrees.min,
        config.inclinationDegrees.max,
        config.heightDistributionExponent,
        config.colorBrightnessVariation,
        config.structuralBaseHeightMeters,
        centerCellX,
        centerCellZ,
        minX,
        maxX,
        minZ,
        maxZ
    ].join('|');
    return {
        centerCellX,
        centerCellZ,
        cells,
        diagnostics: Object.freeze(diagnostics),
        boundarySignature,
        placementSignature,
        cacheIdentity,
        coverageMode
    };
}

/** @param {Map<string,Readonly<object>>|null} previous @param {Map<string,Readonly<object>>} next @returns {{entering:Array<Readonly<object>>,leaving:Array<Readonly<object>>,retained:number}} */
export function diffGrassNearCarpetCellSets(previous, next) {
    const before = previous instanceof Map ? previous : new Map();
    if (!(next instanceof Map)) throw new Error('[GrassNearCarpetLayout] next must be a Map.');
    const entering = [];
    const leaving = [];
    let retained = 0;
    for (const [key, cell] of next) {
        if (before.has(key)) retained++;
        else entering.push(cell);
    }
    for (const [key, cell] of before) if (!next.has(key)) leaving.push(cell);
    return { entering, leaving, retained };
}

/** @param {Readonly<object>} cell @param {Readonly<object>} config @returns {string} */
export function getGrassNearCarpetChunkKey(cell, config) {
    const source = sanitizeGrassNearCarpetConfig(config);
    const chunkCells = Math.max(1, Math.round(source.chunkSizeMeters / source.patchSizeMeters));
    return `${Math.floor(Number(cell?.cellX) / chunkCells)},${Math.floor(Number(cell?.cellZ) / chunkCells)}`;
}
