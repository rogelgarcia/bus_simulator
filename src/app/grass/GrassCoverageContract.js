// Defines deterministic binary grass occupancy and partition data independently from rendering.
// @ts-check

const EPS = 1e-7;

export const GRASS_COVERAGE_SCHEMA = 'bus-simulator.grass-coverage';
export const GRASS_COVERAGE_VERSION = 1;

export const GRASS_COVERAGE_DEFAULTS = Object.freeze({
    enabled: true,
    layerHeightMeters: 0.0275,
    densityMultiplier: 1,
    exclusionMarginMeters: 0,
    farCoverageThreshold: 0.35,
    edgeAntialiasMeters: 0.015,
    fringeEnabled: true,
    fringeSpacingMeters: 0.35,
    fringeInsetMeters: 0.055,
    accentEligibility: true,
    humidity: 0.35,
    dryness: 0.25
});

function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
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
        throw new Error(`[GrassCoverageContract] Exclusion rectangle ${index} is invalid.`);
    }
    return Object.freeze({
        id: String(value?.id ?? `exclusion_${index}`),
        kind: String(value?.kind ?? 'sidewalk'),
        x0: Math.min(ax, bx),
        x1: Math.max(ax, bx),
        z0: Math.min(az, bz),
        z1: Math.max(az, bz)
    });
}

function uniqueSorted(values) {
    return [...new Set(values.map((value) => Number(value).toFixed(8)))].map(Number).sort((a, b) => a - b);
}

function pointInRect(x, z, rect, margin = 0) {
    return x >= rect.x0 - margin && x <= rect.x1 + margin && z >= rect.z0 - margin && z <= rect.z1 + margin;
}

export function sanitizeGrassCoverageConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.freeze({
        enabled: source.enabled !== false,
        layerHeightMeters: clamp(source.layerHeightMeters, 0.015, 0.05, GRASS_COVERAGE_DEFAULTS.layerHeightMeters),
        densityMultiplier: clamp(source.densityMultiplier, 0, 2, GRASS_COVERAGE_DEFAULTS.densityMultiplier),
        exclusionMarginMeters: clamp(source.exclusionMarginMeters, 0, 2, GRASS_COVERAGE_DEFAULTS.exclusionMarginMeters),
        farCoverageThreshold: clamp(source.farCoverageThreshold, 0.05, 0.95, GRASS_COVERAGE_DEFAULTS.farCoverageThreshold),
        edgeAntialiasMeters: clamp(source.edgeAntialiasMeters, 0, 0.03, GRASS_COVERAGE_DEFAULTS.edgeAntialiasMeters),
        fringeEnabled: source.fringeEnabled !== false,
        fringeSpacingMeters: clamp(source.fringeSpacingMeters, 0.15, 1, GRASS_COVERAGE_DEFAULTS.fringeSpacingMeters),
        fringeInsetMeters: clamp(source.fringeInsetMeters, 0.01, 0.2, GRASS_COVERAGE_DEFAULTS.fringeInsetMeters),
        accentEligibility: source.accentEligibility !== false,
        humidity: clamp(source.humidity, 0, 1, GRASS_COVERAGE_DEFAULTS.humidity),
        dryness: clamp(source.dryness, 0, 1, GRASS_COVERAGE_DEFAULTS.dryness)
    });
}

export function createGrassCoverageDefinition({ seed = 'grass-coverage-v1', bounds, exclusionRects = [], irregularCutRects = [] } = {}) {
    const worldBounds = normalizeBounds(bounds);
    const sidewalk = Array.isArray(exclusionRects) ? exclusionRects : [];
    const irregular = Array.isArray(irregularCutRects) ? irregularCutRects : [];
    const exclusions = [...sidewalk, ...irregular].map(normalizeRect);
    return Object.freeze({
        schema: GRASS_COVERAGE_SCHEMA,
        version: GRASS_COVERAGE_VERSION,
        seed: String(seed || 'grass-coverage-v1'),
        bounds: worldBounds,
        exclusionRects: Object.freeze(exclusions),
        sources: Object.freeze({
            occupancy: 'binary_exclusion_union',
            farCoverage: 'pbr.grass_low_cut_maintained_v2/far_coverage.png',
            substrateBlend: 'independent'
        })
    });
}

export function sampleGrassCoverage(definition, x, z, config = null) {
    const bounds = normalizeBounds(definition?.bounds);
    const px = Number(x);
    const pz = Number(z);
    if (!Number.isFinite(px) || !Number.isFinite(pz)) throw new Error('[GrassCoverageContract] Sample coordinates must be finite.');
    const settings = sanitizeGrassCoverageConfig(config);
    if (!settings.enabled || px < bounds.minX || px > bounds.maxX || pz < bounds.minZ || pz > bounds.maxZ) return 0;
    return definition.exclusionRects.some((rect) => pointInRect(px, pz, rect, settings.exclusionMarginMeters)) ? 0 : 1;
}

function findExclusionKind(definition, x, z) {
    return definition.exclusionRects.find((rect) => pointInRect(x, z, rect, EPS * 10))?.kind ?? 'exclusion';
}

function mergeBoundarySegments(segments) {
    const groups = new Map();
    for (const segment of segments) {
        const horizontal = Math.abs(segment.a.z - segment.b.z) <= EPS;
        const constant = horizontal ? segment.a.z : segment.a.x;
        const start = horizontal ? Math.min(segment.a.x, segment.b.x) : Math.min(segment.a.z, segment.b.z);
        const end = horizontal ? Math.max(segment.a.x, segment.b.x) : Math.max(segment.a.z, segment.b.z);
        const key = `${horizontal ? 'h' : 'v'}|${constant.toFixed(8)}|${segment.normal.x},${segment.normal.z}|${segment.kind}`;
        const list = groups.get(key) ?? [];
        list.push({ ...segment, horizontal, constant, start, end });
        groups.set(key, list);
    }

    const merged = [];
    for (const list of groups.values()) {
        list.sort((a, b) => a.start - b.start);
        let active = null;
        for (const segment of list) {
            if (active && segment.start <= active.end + EPS) {
                active.end = Math.max(active.end, segment.end);
                continue;
            }
            if (active) merged.push(active);
            active = { ...segment };
        }
        if (active) merged.push(active);
    }

    return merged.map((segment, index) => Object.freeze({
        id: `boundary_${index}`,
        kind: segment.kind,
        a: Object.freeze(segment.horizontal
            ? { x: segment.start, z: segment.constant }
            : { x: segment.constant, z: segment.start }),
        b: Object.freeze(segment.horizontal
            ? { x: segment.end, z: segment.constant }
            : { x: segment.constant, z: segment.end }),
        normal: Object.freeze({ ...segment.normal }),
        length: segment.end - segment.start
    }));
}

export function createGrassCoveragePartition(definition, config = null) {
    if (definition?.schema !== GRASS_COVERAGE_SCHEMA || definition?.version !== GRASS_COVERAGE_VERSION) {
        throw new Error('[GrassCoverageContract] Unsupported coverage definition.');
    }
    const settings = sanitizeGrassCoverageConfig(config);
    const bounds = normalizeBounds(definition.bounds);
    const clippedRects = definition.exclusionRects.map((rect) => ({
        ...rect,
        x0: Math.max(bounds.minX, rect.x0 - settings.exclusionMarginMeters),
        x1: Math.min(bounds.maxX, rect.x1 + settings.exclusionMarginMeters),
        z0: Math.max(bounds.minZ, rect.z0 - settings.exclusionMarginMeters),
        z1: Math.min(bounds.maxZ, rect.z1 + settings.exclusionMarginMeters)
    })).filter((rect) => rect.x1 - rect.x0 > EPS && rect.z1 - rect.z0 > EPS);

    const xs = uniqueSorted([bounds.minX, bounds.maxX, ...clippedRects.flatMap((rect) => [rect.x0, rect.x1])]);
    const zs = uniqueSorted([bounds.minZ, bounds.maxZ, ...clippedRects.flatMap((rect) => [rect.z0, rect.z1])]);
    const covered = Array.from({ length: zs.length - 1 }, () => Array(xs.length - 1).fill(false));
    const cells = [];

    for (let iz = 0; iz + 1 < zs.length; iz++) {
        for (let ix = 0; ix + 1 < xs.length; ix++) {
            const x0 = xs[ix];
            const x1 = xs[ix + 1];
            const z0 = zs[iz];
            const z1 = zs[iz + 1];
            const x = (x0 + x1) * 0.5;
            const z = (z0 + z1) * 0.5;
            const isCovered = settings.enabled && !clippedRects.some((rect) => pointInRect(x, z, rect));
            covered[iz][ix] = isCovered;
            if (isCovered) cells.push(Object.freeze({ x0, x1, z0, z1 }));
        }
    }

    const rawSegments = [];
    const addSegment = (a, b, normal) => {
        const midX = (a.x + b.x) * 0.5 + normal.x * EPS * 20;
        const midZ = (a.z + b.z) * 0.5 + normal.z * EPS * 20;
        rawSegments.push({ a, b, normal, kind: findExclusionKind(definition, midX, midZ) });
    };
    for (let iz = 0; iz + 1 < zs.length; iz++) {
        for (let ix = 0; ix + 1 < xs.length; ix++) {
            if (!covered[iz][ix]) continue;
            const x0 = xs[ix];
            const x1 = xs[ix + 1];
            const z0 = zs[iz];
            const z1 = zs[iz + 1];
            if (ix > 0 && !covered[iz][ix - 1]) addSegment({ x: x0, z: z0 }, { x: x0, z: z1 }, { x: -1, z: 0 });
            if (ix + 1 < xs.length - 1 && !covered[iz][ix + 1]) addSegment({ x: x1, z: z0 }, { x: x1, z: z1 }, { x: 1, z: 0 });
            if (iz > 0 && !covered[iz - 1][ix]) addSegment({ x: x0, z: z0 }, { x: x1, z: z0 }, { x: 0, z: -1 });
            if (iz + 1 < zs.length - 1 && !covered[iz + 1][ix]) addSegment({ x: x0, z: z1 }, { x: x1, z: z1 }, { x: 0, z: 1 });
        }
    }

    const boundarySegments = mergeBoundarySegments(rawSegments);
    const cornerPoints = new Set();
    for (const segment of boundarySegments) {
        cornerPoints.add(`${segment.a.x.toFixed(6)},${segment.a.z.toFixed(6)}`);
        cornerPoints.add(`${segment.b.x.toFixed(6)},${segment.b.z.toFixed(6)}`);
    }
    let outsideCorners = 0;
    let insideCorners = 0;
    const sampleOffset = 0.001;
    for (const key of cornerPoints) {
        const [x, z] = key.split(',').map(Number);
        let excludedQuadrants = 0;
        for (const dx of [-sampleOffset, sampleOffset]) {
            for (const dz of [-sampleOffset, sampleOffset]) {
                if (definition.exclusionRects.some((rect) => pointInRect(x + dx, z + dz, rect, settings.exclusionMarginMeters))) excludedQuadrants++;
            }
        }
        if (excludedQuadrants === 1) outsideCorners++;
        else if (excludedQuadrants === 3) insideCorners++;
    }

    return Object.freeze({
        schema: GRASS_COVERAGE_SCHEMA,
        version: GRASS_COVERAGE_VERSION,
        seed: definition.seed,
        config: settings,
        cells: Object.freeze(cells),
        boundarySegments: Object.freeze(boundarySegments),
        diagnostics: Object.freeze({
            coveredCells: cells.length,
            exclusionRects: definition.exclusionRects.length,
            sidewalkSegments: boundarySegments.filter((segment) => segment.kind === 'sidewalk').length,
            irregularSegments: boundarySegments.filter((segment) => segment.kind === 'irregular_cut').length,
            outsideCorners,
            insideCorners
        })
    });
}
