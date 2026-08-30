// Defines the deterministic polygon grass footprint, boundary distance, and root eligibility contract.
// @ts-check

const EPS = 1e-7;
const HASH_OFFSET = 2166136261;
const HASH_PRIME = 16777619;

export const GRASS_COVERAGE_SCHEMA = 'bus-simulator.grass-coverage';
export const GRASS_COVERAGE_VERSION = 2;

export const GRASS_COVERAGE_DEFAULTS = Object.freeze({
    enabled: true,
    structuralBaseHeightMeters: 0.0275,
    layerHeightMeters: 0.0275,
    substrateRevealMeters: 0.08,
    densityMultiplier: 1,
    exclusionMarginMeters: 0,
    farCoverageThreshold: 0.35,
    edgeAntialiasMeters: 0.012,
    rootClearanceMeters: 0.003,
    cutEdgeEnabled: true,
    cutEdgeSpacingMeters: 0.018,
    cutEdgeInsetMeters: 0.004,
    visibleBladeTipMinMeters: 0.04,
    visibleBladeTipMaxMeters: 0.075,
    accentEligibility: true,
    humidity: 0.35,
    dryness: 0.25
});

function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function round(value, digits = 9) {
    const scale = 10 ** digits;
    const rounded = Math.round(Number(value) * scale) / scale;
    return rounded === 0 ? 0 : rounded;
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

function normalizeBounds(value) {
    const minX = Number(value?.minX);
    const maxX = Number(value?.maxX);
    const minZ = Number(value?.minZ);
    const maxZ = Number(value?.maxZ);
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || maxX <= minX || maxZ <= minZ) {
        throw new Error('[GrassCoverageContract] Bounds must be finite and ordered.');
    }
    return Object.freeze({ minX, maxX, minZ, maxZ });
}

function normalizeRect(value, index) {
    const ax = Number(value?.x0);
    const bx = Number(value?.x1);
    const az = Number(value?.z0);
    const bz = Number(value?.z1);
    if (![ax, bx, az, bz].every(Number.isFinite) || Math.abs(ax - bx) <= EPS || Math.abs(az - bz) <= EPS) {
        throw new Error(`[GrassCoverageContract] Compatibility exclusion rectangle ${index} is invalid.`);
    }
    return Object.freeze({
        id: String(value?.id ?? `compatibility_exclusion_${index}`),
        kind: String(value?.kind ?? 'sidewalk'),
        x0: Math.min(ax, bx),
        x1: Math.max(ax, bx),
        z0: Math.min(az, bz),
        z1: Math.max(az, bz)
    });
}

function polygonArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index++) {
        const a = points[index];
        const b = points[(index + 1) % points.length];
        area += a.x * b.z - b.x * a.z;
    }
    return area * 0.5;
}

function normalizeLoop(value, label) {
    const input = Array.isArray(value) ? value : [];
    const points = [];
    for (let index = 0; index < input.length; index++) {
        const x = Number(input[index]?.x);
        const z = Number(input[index]?.z);
        if (![x, z].every(Number.isFinite)) throw new Error(`[GrassCoverageContract] ${label} point ${index} must have finite x/z.`);
        const previous = points[points.length - 1] ?? null;
        if (previous && Math.hypot(x - previous.x, z - previous.z) <= EPS) continue;
        points.push({ x: round(x), z: round(z) });
    }
    if (points.length >= 2 && Math.hypot(points[0].x - points.at(-1).x, points[0].z - points.at(-1).z) <= EPS) points.pop();
    if (points.length < 3 || Math.abs(polygonArea(points)) <= EPS) {
        throw new Error(`[GrassCoverageContract] ${label} must be a non-degenerate polygon loop.`);
    }
    const ccw = polygonArea(points) > 0 ? points : points.slice().reverse();
    return Object.freeze(ccw.map((point) => Object.freeze(point)));
}

function rectToLoop(rect) {
    return [
        { x: rect.x0, z: rect.z0 },
        { x: rect.x1, z: rect.z0 },
        { x: rect.x1, z: rect.z1 },
        { x: rect.x0, z: rect.z1 }
    ];
}

function pointOnSegment(x, z, a, b, epsilon = EPS) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared <= EPS) return Math.hypot(x - a.x, z - a.z) <= epsilon;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared));
    return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) <= epsilon;
}

function pointInLoop(x, z, loop) {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const a = loop[j];
        const b = loop[i];
        if (pointOnSegment(x, z, a, b)) return true;
        const crosses = (a.z > z) !== (b.z > z)
            && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x;
        if (crosses) inside = !inside;
    }
    return inside;
}

function distanceToLoop(x, z, loop) {
    let best = Infinity;
    for (let index = 0; index < loop.length; index++) {
        const a = loop[index];
        const b = loop[(index + 1) % loop.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const lengthSquared = dx * dx + dz * dz;
        const t = lengthSquared <= EPS ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared));
        best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
    }
    return best;
}

function normalizeBoundaryExclusion(value, index) {
    const id = String(value?.id ?? `polygon_exclusion_${index}`);
    const kind = String(value?.kind ?? 'hard_exclusion');
    const sourceLoop = normalizeLoop(value?.sourceLoop ?? value?.onsetLoop, `${id} source loop`);
    const onsetLoop = normalizeLoop(value?.onsetLoop ?? value?.sourceLoop, `${id} onset loop`);
    if (sourceLoop.length !== onsetLoop.length) {
        throw new Error(`[GrassCoverageContract] ${id} source/onset loops must share one point topology.`);
    }
    const substrateRevealMeters = clamp(value?.substrateRevealMeters, 0, 2, 0);
    const sourceIdentity = String(value?.sourceIdentity ?? `${id}:${hashText(JSON.stringify(sourceLoop))}`);
    return Object.freeze({
        id,
        kind,
        shape: String(value?.shape ?? 'polygon'),
        sourceIdentity,
        substrateRevealMeters,
        sourceLoop,
        onsetLoop
    });
}

function assertDefinition(definition) {
    if (definition?.schema !== GRASS_COVERAGE_SCHEMA || definition?.version !== GRASS_COVERAGE_VERSION) {
        throw new Error('[GrassCoverageContract] Unsupported coverage definition.');
    }
}

export function sanitizeGrassCoverageConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    const structuralBaseHeightMeters = clamp(
        source.structuralBaseHeightMeters ?? source.layerHeightMeters,
        0.015,
        0.05,
        GRASS_COVERAGE_DEFAULTS.structuralBaseHeightMeters
    );
    const visibleBladeTipMinMeters = clamp(
        source.visibleBladeTipMinMeters,
        structuralBaseHeightMeters,
        0.12,
        Math.max(structuralBaseHeightMeters, GRASS_COVERAGE_DEFAULTS.visibleBladeTipMinMeters)
    );
    const cutEdgeEnabled = source.cutEdgeEnabled !== false && source.fringeEnabled !== false;
    const cutEdgeSpacingMeters = clamp(
        source.cutEdgeSpacingMeters ?? source.fringeSpacingMeters,
        0.008,
        0.04,
        GRASS_COVERAGE_DEFAULTS.cutEdgeSpacingMeters
    );
    const cutEdgeInsetMeters = clamp(
        source.cutEdgeInsetMeters ?? source.fringeInsetMeters,
        0.001,
        0.02,
        GRASS_COVERAGE_DEFAULTS.cutEdgeInsetMeters
    );
    return Object.freeze({
        enabled: source.enabled !== false,
        structuralBaseHeightMeters,
        layerHeightMeters: structuralBaseHeightMeters,
        substrateRevealMeters: clamp(source.substrateRevealMeters, 0.06, 0.1, GRASS_COVERAGE_DEFAULTS.substrateRevealMeters),
        densityMultiplier: clamp(source.densityMultiplier, 0, 2, GRASS_COVERAGE_DEFAULTS.densityMultiplier),
        exclusionMarginMeters: clamp(source.exclusionMarginMeters, 0, 2, GRASS_COVERAGE_DEFAULTS.exclusionMarginMeters),
        farCoverageThreshold: clamp(source.farCoverageThreshold, 0.05, 0.95, GRASS_COVERAGE_DEFAULTS.farCoverageThreshold),
        edgeAntialiasMeters: clamp(source.edgeAntialiasMeters, 0, 0.015, GRASS_COVERAGE_DEFAULTS.edgeAntialiasMeters),
        rootClearanceMeters: clamp(source.rootClearanceMeters, 0, 0.05, GRASS_COVERAGE_DEFAULTS.rootClearanceMeters),
        cutEdgeEnabled,
        cutEdgeSpacingMeters,
        cutEdgeInsetMeters,
        visibleBladeTipMinMeters,
        visibleBladeTipMaxMeters: clamp(source.visibleBladeTipMaxMeters, visibleBladeTipMinMeters, 0.12, GRASS_COVERAGE_DEFAULTS.visibleBladeTipMaxMeters),
        fringeEnabled: cutEdgeEnabled,
        fringeSpacingMeters: cutEdgeSpacingMeters,
        fringeInsetMeters: cutEdgeInsetMeters,
        accentEligibility: source.accentEligibility !== false,
        humidity: clamp(source.humidity, 0, 1, GRASS_COVERAGE_DEFAULTS.humidity),
        dryness: clamp(source.dryness, 0, 1, GRASS_COVERAGE_DEFAULTS.dryness)
    });
}

/**
 * Returns the coverage config used to build and validate static geometry.
 * Visibility must not remove roots or turn valid geometry into an intrusion.
 */
export function createGrassCoverageStaticGeometryConfig(value) {
    const config = sanitizeGrassCoverageConfig(value);
    if (config.enabled) return config;
    return Object.freeze({ ...config, enabled: true });
}

export function createGrassCoverageDefinition({
    seed = 'grass-coverage-v2',
    bounds,
    boundaryExclusions = [],
    compatibilityExclusionRects = [],
    exclusionRects = [],
    irregularCutRects = []
} = {}) {
    const worldBounds = normalizeBounds(bounds);
    const explicitCompatibility = Array.isArray(compatibilityExclusionRects) ? compatibilityExclusionRects : [];
    const compatibilityInput = explicitCompatibility.length
        ? explicitCompatibility
        : [...(Array.isArray(exclusionRects) ? exclusionRects : []), ...(Array.isArray(irregularCutRects) ? irregularCutRects : [])];
    const compatibilityRects = compatibilityInput.map(normalizeRect);
    const polygons = Array.isArray(boundaryExclusions) ? boundaryExclusions.map(normalizeBoundaryExclusion) : [];
    if (!polygons.length) {
        for (let index = 0; index < compatibilityRects.length; index++) {
            const rect = compatibilityRects[index];
            polygons.push(normalizeBoundaryExclusion({
                id: rect.id,
                kind: rect.kind,
                shape: 'rectangle_compatibility',
                sourceIdentity: `compatibility-rectangle:${rect.id}`,
                sourceLoop: rectToLoop(rect),
                onsetLoop: rectToLoop(rect),
                substrateRevealMeters: 0
            }, index));
        }
    }
    if (!polygons.length) throw new Error('[GrassCoverageContract] At least one polygon exclusion is required.');

    const signaturePayload = polygons.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        sourceIdentity: entry.sourceIdentity,
        reveal: entry.substrateRevealMeters,
        source: entry.sourceLoop,
        onset: entry.onsetLoop
    }));
    const boundarySignature = `grass-coverage-v2-${hashText(JSON.stringify(signaturePayload))}`;
    return Object.freeze({
        schema: GRASS_COVERAGE_SCHEMA,
        version: GRASS_COVERAGE_VERSION,
        seed: String(seed || 'grass-coverage-v2'),
        bounds: worldBounds,
        exclusions: Object.freeze(polygons),
        exclusionRects: Object.freeze(compatibilityRects),
        boundarySignature,
        sourceLoopIdentity: polygons.map((entry) => entry.sourceIdentity).join('|'),
        sources: Object.freeze({
            occupancy: 'hard_polygon_footprint',
            boundaryDistance: 'signed_euclidean_to_grass_onset',
            rootEligibility: 'occupied_plus_boundary_clearance',
            farCoverage: 'appearance_only_no_footprint_alpha',
            substrateBlend: 'independent'
        })
    });
}

export function sampleGrassCoverageContract(definition, x, z, config = null) {
    assertDefinition(definition);
    const px = Number(x);
    const pz = Number(z);
    if (!Number.isFinite(px) || !Number.isFinite(pz)) throw new Error('[GrassCoverageContract] Sample coordinates must be finite.');
    const settings = sanitizeGrassCoverageConfig(config);
    const bounds = definition.bounds;
    const insideBounds = px >= bounds.minX && px <= bounds.maxX && pz >= bounds.minZ && pz <= bounds.maxZ;
    let nearest = null;
    let nearestDistance = Infinity;
    let sourceBoundaryDistanceMeters = Infinity;
    let excluded = false;
    for (const exclusion of definition.exclusions) {
        const distance = distanceToLoop(px, pz, exclusion.onsetLoop);
        const sourceDistance = distanceToLoop(px, pz, exclusion.sourceLoop);
        const signedSourceDistance = pointInLoop(px, pz, exclusion.sourceLoop) ? -sourceDistance : sourceDistance;
        sourceBoundaryDistanceMeters = Math.min(sourceBoundaryDistanceMeters, signedSourceDistance);
        if (distance < nearestDistance) {
            nearest = exclusion;
            nearestDistance = distance;
        }
        if (pointInLoop(px, pz, exclusion.onsetLoop)) excluded = true;
    }
    const occupied = settings.enabled && insideBounds && !excluded;
    const boundaryDistanceMeters = Number.isFinite(nearestDistance)
        ? round(occupied ? nearestDistance : -nearestDistance)
        : null;
    const rootEligible = occupied && nearestDistance + EPS >= settings.rootClearanceMeters;
    const antialiasFactor = occupied && settings.edgeAntialiasMeters > EPS
        ? Math.min(1, nearestDistance / settings.edgeAntialiasMeters)
        : Number(occupied);
    return Object.freeze({
        occupancy: Number(occupied),
        occupied,
        boundaryDistanceMeters,
        sourceBoundaryDistanceMeters: Number.isFinite(sourceBoundaryDistanceMeters) ? round(sourceBoundaryDistanceMeters) : null,
        rootEligible,
        antialiasFactor: round(antialiasFactor),
        exclusionId: nearest?.id ?? (insideBounds ? null : 'bounds'),
        exclusionKind: nearest?.kind ?? (insideBounds ? null : 'bounds'),
        sourceIdentity: nearest?.sourceIdentity ?? null
    });
}

export function sampleGrassCoverage(definition, x, z, config = null) {
    return sampleGrassCoverageContract(definition, x, z, config).occupancy;
}

export function sampleGrassRootEligibility(definition, x, z, config = null) {
    return sampleGrassCoverageContract(definition, x, z, config).rootEligible;
}

function createBoundarySegments(definition) {
    const segments = [];
    for (const exclusion of definition.exclusions) {
        const loop = exclusion.onsetLoop;
        for (let index = 0; index < loop.length; index++) {
            const a = loop[index];
            const b = loop[(index + 1) % loop.length];
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const length = Math.hypot(dx, dz);
            if (length <= EPS) continue;
            const grassNormal = Object.freeze({ x: dz / length, z: -dx / length });
            segments.push(Object.freeze({
                id: `${exclusion.id}:segment:${index}`,
                exclusionId: exclusion.id,
                kind: exclusion.kind,
                sourceIdentity: exclusion.sourceIdentity,
                a,
                b,
                grassNormal,
                normal: grassNormal,
                length: round(length),
                diagonal: Math.abs(dx) > EPS && Math.abs(dz) > EPS
            }));
        }
    }
    return Object.freeze(segments);
}

function createPartitionDiagnostics(definition, segments, settings) {
    let insideCorners = 0;
    let outsideCorners = 0;
    let curvedSegments = 0;
    let insideCurveSegments = 0;
    let outsideCurveSegments = 0;
    let maxBoundaryDeviationMeters = 0;
    let boundaryDeviationTotal = 0;
    let deviationSamples = 0;
    let sidewalkOnsetDistanceMinMeters = Infinity;
    let sidewalkOnsetDistanceMaxMeters = 0;
    let worstBoundaryDeviation = null;
    for (const exclusion of definition.exclusions) {
        const onset = exclusion.onsetLoop;
        for (let index = 0; index < onset.length; index++) {
            const previous = onset[(index - 1 + onset.length) % onset.length];
            const current = onset[index];
            const next = onset[(index + 1) % onset.length];
            const ax = current.x - previous.x;
            const az = current.z - previous.z;
            const bx = next.x - current.x;
            const bz = next.z - current.z;
            const turnDegrees = Math.atan2(ax * bz - az * bx, ax * bx + az * bz) * 180 / Math.PI;
            if (Math.abs(turnDegrees) >= 15 && exclusion.kind !== 'tree_base') {
                if (turnDegrees > 0) outsideCorners++;
                else insideCorners++;
            } else if (Math.abs(turnDegrees) >= 0.5 && Math.abs(turnDegrees) < 15) curvedSegments++;
            if (exclusion.kind !== 'tree_base' && Math.abs(turnDegrees) >= 0.01 && Math.abs(turnDegrees) < 15) {
                if (turnDegrees > 0) outsideCurveSegments++;
                else insideCurveSegments++;
            }
            const sourceDistance = distanceToLoop(current.x, current.z, exclusion.sourceLoop);
            const deviation = Math.abs(sourceDistance - exclusion.substrateRevealMeters);
            maxBoundaryDeviationMeters = Math.max(maxBoundaryDeviationMeters, deviation);
            boundaryDeviationTotal += deviation;
            deviationSamples++;
            if (exclusion.kind === 'sidewalk') {
                sidewalkOnsetDistanceMinMeters = Math.min(sidewalkOnsetDistanceMinMeters, sourceDistance);
                sidewalkOnsetDistanceMaxMeters = Math.max(sidewalkOnsetDistanceMaxMeters, sourceDistance);
            }
            if (!worstBoundaryDeviation || deviation > worstBoundaryDeviation.deviationMeters) {
                worstBoundaryDeviation = {
                    exclusionId: exclusion.id,
                    kind: exclusion.kind,
                    pointIndex: index,
                    point: { x: current.x, z: current.z },
                    previousOnsetPoint: { ...previous },
                    nextOnsetPoint: { ...next },
                    sourcePoint: { ...exclusion.sourceLoop[index] },
                    previousSourcePoint: { ...exclusion.sourceLoop[(index - 1 + exclusion.sourceLoop.length) % exclusion.sourceLoop.length] },
                    nextSourcePoint: { ...exclusion.sourceLoop[(index + 1) % exclusion.sourceLoop.length] },
                    sourceDistanceMeters: round(sourceDistance),
                    declaredRevealMeters: exclusion.substrateRevealMeters,
                    deviationMeters: round(deviation),
                    insideSource: pointInLoop(current.x, current.z, exclusion.sourceLoop),
                    turnDegrees: round(turnDegrees, 6)
                };
            }
        }
    }

    // RoadEngine tessellates rounded turns finely, so a complete inside or
    // outside corner may be a run of sub-degree vertices rather than one
    // vertex above the sharp-corner threshold. Report that run as one corner
    // feature while retaining the segment count separately.
    if (insideCorners === 0 && insideCurveSegments > 0) insideCorners = 1;
    if (outsideCorners === 0 && outsideCurveSegments > 0) outsideCorners = 1;

    let occupiedSamples = 0;
    let excludedSamples = 0;
    let rootEligibleSamples = 0;
    for (const segment of segments) {
        const midpoint = { x: (segment.a.x + segment.b.x) * 0.5, z: (segment.a.z + segment.b.z) * 0.5 };
        const occupied = sampleGrassCoverageContract(
            definition,
            midpoint.x + segment.grassNormal.x * (settings.rootClearanceMeters + 0.002),
            midpoint.z + segment.grassNormal.z * (settings.rootClearanceMeters + 0.002),
            settings
        );
        const excluded = sampleGrassCoverageContract(
            definition,
            midpoint.x - segment.grassNormal.x * 0.002,
            midpoint.z - segment.grassNormal.z * 0.002,
            settings
        );
        occupiedSamples += occupied.occupancy;
        rootEligibleSamples += Number(occupied.rootEligible);
        excludedSamples += Number(excluded.occupancy === 0);
    }

    const sidewalkReveals = definition.exclusions
        .filter((entry) => entry.kind === 'sidewalk')
        .map((entry) => entry.substrateRevealMeters)
        .filter((value) => value > 0);
    const treeReveals = definition.exclusions
        .filter((entry) => entry.kind === 'tree_base')
        .map((entry) => entry.substrateRevealMeters)
        .filter((value) => value > 0);
    const worstExclusion = worstBoundaryDeviation
        ? definition.exclusions.find((entry) => entry.id === worstBoundaryDeviation.exclusionId)
        : null;
    const worstBoundaryWindow = worstExclusion && worstBoundaryDeviation
        ? Array.from({ length: 13 }, (_, offset) => {
            const index = (worstBoundaryDeviation.pointIndex - 6 + offset + worstExclusion.onsetLoop.length) % worstExclusion.onsetLoop.length;
            return Object.freeze({
                index,
                source: worstExclusion.sourceLoop[index],
                onset: worstExclusion.onsetLoop[index]
            });
        })
        : [];
    return Object.freeze({
        sourceLoopIdentity: definition.sourceLoopIdentity,
        boundarySignature: definition.boundarySignature,
        sourceLoops: definition.exclusions.length,
        grassOnsetWidthMeters: sidewalkReveals.length ? round(Math.min(...sidewalkReveals)) : 0,
        grassOnsetWidthMaxMeters: sidewalkReveals.length ? round(Math.max(...sidewalkReveals)) : 0,
        sidewalkOnsetDistanceMinMeters: Number.isFinite(sidewalkOnsetDistanceMinMeters) ? round(sidewalkOnsetDistanceMinMeters) : 0,
        sidewalkOnsetDistanceMaxMeters: round(sidewalkOnsetDistanceMaxMeters),
        treeSubstrateRevealMinMeters: treeReveals.length ? round(Math.min(...treeReveals)) : 0,
        treeSubstrateRevealMaxMeters: treeReveals.length ? round(Math.max(...treeReveals)) : 0,
        structuralBaseHeightMeters: settings.structuralBaseHeightMeters,
        visibleBladeTipMinMeters: settings.visibleBladeTipMinMeters,
        visibleBladeTipMaxMeters: settings.visibleBladeTipMaxMeters,
        antialiasWidthMeters: settings.edgeAntialiasMeters,
        rootClearanceMeters: settings.rootClearanceMeters,
        boundarySegments: segments.length,
        sidewalkSegments: segments.filter((segment) => segment.kind === 'sidewalk').length,
        treeBaseSegments: segments.filter((segment) => segment.kind === 'tree_base').length,
        diagonalSegments: segments.filter((segment) => segment.diagonal).length,
        curvedSegments,
        insideCurveSegments,
        outsideCurveSegments,
        outsideCorners,
        insideCorners,
        occupiedSamples,
        excludedSamples,
        rootEligibleSamples,
        maxBoundaryDeviationMeters: round(maxBoundaryDeviationMeters),
        meanBoundaryDeviationMeters: deviationSamples ? round(boundaryDeviationTotal / deviationSamples) : 0,
        worstBoundaryDeviation: worstBoundaryDeviation ? Object.freeze({
            ...worstBoundaryDeviation,
            point: Object.freeze(worstBoundaryDeviation.point),
            previousOnsetPoint: Object.freeze(worstBoundaryDeviation.previousOnsetPoint),
            nextOnsetPoint: Object.freeze(worstBoundaryDeviation.nextOnsetPoint),
            sourcePoint: Object.freeze(worstBoundaryDeviation.sourcePoint),
            previousSourcePoint: Object.freeze(worstBoundaryDeviation.previousSourcePoint),
            nextSourcePoint: Object.freeze(worstBoundaryDeviation.nextSourcePoint)
        }) : null,
        worstBoundaryWindow: Object.freeze(worstBoundaryWindow)
    });
}

export function createGrassCoveragePartition(definition, config = null) {
    assertDefinition(definition);
    const settings = sanitizeGrassCoverageConfig(config);
    const bounds = definition.bounds;
    const contour = normalizeLoop([
        { x: bounds.minX, z: bounds.minZ },
        { x: bounds.maxX, z: bounds.minZ },
        { x: bounds.maxX, z: bounds.maxZ },
        { x: bounds.minX, z: bounds.maxZ }
    ], 'coverage bounds');
    const holeLoops = Object.freeze(definition.exclusions.map((entry) => entry.onsetLoop));
    const boundarySegments = createBoundarySegments(definition);
    return Object.freeze({
        schema: GRASS_COVERAGE_SCHEMA,
        version: GRASS_COVERAGE_VERSION,
        seed: definition.seed,
        config: settings,
        contour,
        holeLoops,
        exclusions: definition.exclusions,
        boundarySegments,
        diagnostics: createPartitionDiagnostics(definition, boundarySegments, settings)
    });
}
