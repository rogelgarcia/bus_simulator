// src/graphics/gui/mesh_fabrication/displayMeshDerivation.js
// Pure display-mesh derivation helpers (no Three.js dependency).

export const DISPLAY_SMOOTHING_MODE = Object.freeze({
    FLAT: 'flat',
    SMOOTH_NORMALS: 'smooth_normals',
    SUBDIVISION_PREVIEW: 'subdivision_preview'
});

export const DISPLAY_WIRE_SOURCE = Object.freeze({
    CANONICAL: 'canonical',
    DISPLAY: 'display'
});

export const DISPLAY_LOD_POLICY = Object.freeze({
    NEAR: 'near',
    MEDIUM: 'medium',
    FAR: 'far'
});

export const DISPLAY_LOD_TRIANGLE_BUDGETS = Object.freeze({
    [DISPLAY_LOD_POLICY.NEAR]: 220000,
    [DISPLAY_LOD_POLICY.MEDIUM]: 140000,
    [DISPLAY_LOD_POLICY.FAR]: 80000
});

const MIN_DISPLAY_SUBDIVISION_LEVEL = 0;
const MAX_DISPLAY_SUBDIVISION_LEVEL = 2;
const DEFAULT_DISPLAY_ADAPTIVE_ERROR_BUDGET_PX = 16;

function clampInt(value, min, max, fallback = min) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const rounded = Math.round(numeric);
    return Math.max(min, Math.min(max, rounded));
}

function clampPositiveNumber(value, fallback = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return numeric;
}

function normalizeDisplaySmoothingMode(value) {
    const mode = String(value ?? '').trim().toLowerCase();
    if (
        mode === DISPLAY_SMOOTHING_MODE.FLAT
        || mode === DISPLAY_SMOOTHING_MODE.SMOOTH_NORMALS
        || mode === DISPLAY_SMOOTHING_MODE.SUBDIVISION_PREVIEW
    ) {
        return mode;
    }
    return DISPLAY_SMOOTHING_MODE.FLAT;
}

function normalizeDisplayWireSource(value) {
    const source = String(value ?? '').trim().toLowerCase();
    if (source === DISPLAY_WIRE_SOURCE.DISPLAY || source === DISPLAY_WIRE_SOURCE.CANONICAL) {
        return source;
    }
    return DISPLAY_WIRE_SOURCE.CANONICAL;
}

function normalizeDisplayLodPolicy(value) {
    const policy = String(value ?? '').trim().toLowerCase();
    if (
        policy === DISPLAY_LOD_POLICY.NEAR
        || policy === DISPLAY_LOD_POLICY.MEDIUM
        || policy === DISPLAY_LOD_POLICY.FAR
    ) {
        return policy;
    }
    return DISPLAY_LOD_POLICY.MEDIUM;
}

function normalizeDisplaySubdivisionLevel(value) {
    return clampInt(value, MIN_DISPLAY_SUBDIVISION_LEVEL, MAX_DISPLAY_SUBDIVISION_LEVEL, MIN_DISPLAY_SUBDIVISION_LEVEL);
}

export function normalizeDisplayMeshBuildConfig(rawValue = null) {
    const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};
    const smoothingMode = normalizeDisplaySmoothingMode(raw.smoothingMode);
    const wireSource = normalizeDisplayWireSource(raw.wireSource);
    const lodPolicy = normalizeDisplayLodPolicy(raw.lodPolicy);
    const requestedSubdivisionLevel = normalizeDisplaySubdivisionLevel(raw.subdivisionLevel);
    const resolvedSubdivisionLevel = normalizeDisplaySubdivisionLevel(
        raw.resolvedSubdivisionLevel === undefined ? requestedSubdivisionLevel : raw.resolvedSubdivisionLevel
    );
    const adaptiveSubdivisionEnabled = !!raw.adaptiveSubdivisionEnabled;
    const adaptiveErrorBudgetPx = clampPositiveNumber(
        raw.adaptiveErrorBudgetPx,
        DEFAULT_DISPLAY_ADAPTIVE_ERROR_BUDGET_PX
    );
    const budgetOverride = clampInt(raw.triangleBudget, 1000, 5000000, NaN);
    const lodBudget = DISPLAY_LOD_TRIANGLE_BUDGETS[lodPolicy] ?? DISPLAY_LOD_TRIANGLE_BUDGETS[DISPLAY_LOD_POLICY.MEDIUM];
    const triangleBudget = Number.isFinite(budgetOverride) ? budgetOverride : lodBudget;
    const effectiveSubdivisionLevel = smoothingMode === DISPLAY_SMOOTHING_MODE.SUBDIVISION_PREVIEW
        ? resolvedSubdivisionLevel
        : MIN_DISPLAY_SUBDIVISION_LEVEL;
    return Object.freeze({
        smoothingMode,
        wireSource,
        lodPolicy,
        triangleBudget,
        subdivisionLevel: requestedSubdivisionLevel,
        resolvedSubdivisionLevel: effectiveSubdivisionLevel,
        adaptiveSubdivisionEnabled,
        adaptiveErrorBudgetPx
    });
}

export function getRenderTriangleRecords(objectDef) {
    const records = [];
    if (Array.isArray(objectDef?.renderTriangles) && objectDef.renderTriangles.length > 0) {
        for (let i = 0; i < objectDef.renderTriangles.length; i++) {
            const tri = objectDef.renderTriangles[i];
            const indices = Array.isArray(tri?.indices) ? tri.indices : null;
            if (!indices || indices.length !== 3) continue;
            records.push(Object.freeze({
                id: String(tri.id ?? `${objectDef.id}.triangle.seed.t${String(i).padStart(3, '0')}`),
                faceId: String(tri.faceId ?? ''),
                indices: Object.freeze([
                    Number(indices[0]) | 0,
                    Number(indices[1]) | 0,
                    Number(indices[2]) | 0
                ])
            }));
        }
        if (records.length > 0) return records;
    }

    const triangles = Array.isArray(objectDef?.triangles) ? objectDef.triangles : [];
    const fallbackFaceId = String(objectDef?.faces?.[0]?.id ?? '');
    for (let i = 0; i < triangles.length; i++) {
        const tri = triangles[i];
        if (!Array.isArray(tri) || tri.length !== 3) continue;
        records.push(Object.freeze({
            id: `${objectDef.id}.triangle.seed.t${String(i).padStart(3, '0')}`,
            faceId: fallbackFaceId,
            indices: Object.freeze([
                Number(tri[0]) | 0,
                Number(tri[1]) | 0,
                Number(tri[2]) | 0
            ])
        }));
    }
    return records;
}

export function deriveDisplayTriangulation(objectDef, requestedSubdivisionLevel, triangleBudget) {
    const sourceVertices = Array.isArray(objectDef?.vertices) ? objectDef.vertices : [];
    const derivedVertices = sourceVertices.map((v) => [
        Number(v?.[0]) || 0,
        Number(v?.[1]) || 0,
        Number(v?.[2]) || 0
    ]);
    let derivedTriangles = getRenderTriangleRecords(objectDef).map((record) => Object.freeze({
        a: record.indices[0],
        b: record.indices[1],
        c: record.indices[2],
        faceId: record.faceId
    }));

    let appliedSubdivisionLevel = 0;
    const level = normalizeDisplaySubdivisionLevel(requestedSubdivisionLevel);
    const maxTriangles = clampInt(
        triangleBudget,
        1000,
        5000000,
        DISPLAY_LOD_TRIANGLE_BUDGETS[DISPLAY_LOD_POLICY.MEDIUM]
    );

    while (appliedSubdivisionLevel < level) {
        if ((derivedTriangles.length * 4) > maxTriangles) break;
        const midpointCache = new Map();
        const nextTriangles = [];
        const getMidpointIndex = (ai, bi) => {
            const a = Math.min(ai, bi);
            const b = Math.max(ai, bi);
            const key = `${a}|${b}`;
            const cached = midpointCache.get(key);
            if (cached !== undefined) return cached;

            const av = derivedVertices[a] ?? [0, 0, 0];
            const bv = derivedVertices[b] ?? [0, 0, 0];
            const idx = derivedVertices.length;
            derivedVertices.push([
                (av[0] + bv[0]) * 0.5,
                (av[1] + bv[1]) * 0.5,
                (av[2] + bv[2]) * 0.5
            ]);
            midpointCache.set(key, idx);
            return idx;
        };

        for (const tri of derivedTriangles) {
            const ab = getMidpointIndex(tri.a, tri.b);
            const bc = getMidpointIndex(tri.b, tri.c);
            const ca = getMidpointIndex(tri.c, tri.a);
            const faceId = tri.faceId;
            nextTriangles.push(
                Object.freeze({ a: tri.a, b: ab, c: ca, faceId }),
                Object.freeze({ a: ab, b: tri.b, c: bc, faceId }),
                Object.freeze({ a: ca, b: bc, c: tri.c, faceId }),
                Object.freeze({ a: ab, b: bc, c: ca, faceId })
            );
        }
        derivedTriangles = nextTriangles;
        appliedSubdivisionLevel += 1;
    }

    return Object.freeze({
        vertices: Object.freeze(derivedVertices),
        triangles: Object.freeze(derivedTriangles),
        triangleFaceIds: Object.freeze(derivedTriangles.map((tri) => tri.faceId)),
        appliedSubdivisionLevel
    });
}
