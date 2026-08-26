// src/app/buildings/EdgeBevelModel.js
// Plan edge bevel model (AI 499). Every vertical arris on a fabricated building
// is razor-sharp — the four plan corners and every convex edge the facade
// silhouette creates (bay-relief steps, pier edges). Real masonry softens them
// with a small chamfer, and a chamfer catches light along the cut, which is
// exactly the street-level cue a sharp arris is missing.
//
// ONE feature with scopes, not two features:
//   - `main_corners`      cuts the four plan corners. This is a FOOTPRINT
//                         mutation applied before facade solving, so the
//                         adjacent faces shorten to the fold lines and their
//                         bay layouts solve against the shortened length.
//   - `all_convex_edges`  additionally cuts every remaining convex arris of the
//                         RESOLVED silhouette, after bay layout — no solver
//                         involvement, just a vertex pass over the loop.
//
// `widthMeters` is the width of the chamfer FACET itself (what you see), not
// the cut-back along each face: for an interior angle θ the cut-back is
// `w / (2·sin(θ/2))`, i.e. `w / √2` at a square corner.
//
// This module is deliberately three-free so the generator, the BF2 GUI and node
// unit tests share ONE normalizer and ONE piece of bevel geometry (see the
// facade-solver-renormalizes-bay-windows lesson).
// @ts-check

export const EDGE_BEVEL_SCOPE = Object.freeze({
    /** Only the four plan corners (footprint mutation, pre-solve). */
    MAIN_CORNERS: 'main_corners',
    /** The plan corners plus every convex arris of the resolved silhouette. */
    ALL_CONVEX_EDGES: 'all_convex_edges'
});

export const EDGE_BEVEL_CORNER_IDS = Object.freeze(['AB', 'BC', 'CD', 'DA']);

export const EDGE_BEVEL_WIDTH_MIN_METERS = 0.05;
export const EDGE_BEVEL_WIDTH_MAX_METERS = 1.5;
// A plan chamfer is a masonry detail, not a cut corner: the default is a few
// centimetres, and anything wide enough to read as a fifth facade should be an
// explicit authoring decision.
export const EDGE_BEVEL_DEFAULT_WIDTH_METERS = 0.06;

// A cut may never eat more than this share of either edge it sits between, so a
// bevel can never swallow a short bay-relief step.
export const EDGE_BEVEL_MAX_EDGE_FRACTION = 0.4;
// A window's hole is wider than its glass: reveal, frame and surround all sit
// outside the glass line. A chamfer near an opening keeps this much clear of
// the glass span so the wall cut always still has a segment to land on.
export const EDGE_BEVEL_OPENING_REVEAL_ALLOWANCE_METERS = 0.12;

// Below this the facet is not worth the two extra vertices (and would be
// dropped by loop simplification anyway).
export const EDGE_BEVEL_MIN_FACET_METERS = 0.02;

const EPS = 1e-6;

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function normalizeWidth(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return clamp(num, EDGE_BEVEL_WIDTH_MIN_METERS, EDGE_BEVEL_WIDTH_MAX_METERS, fallback);
}

/**
 * @typedef {Object} EdgeBevelCornerConfig
 * @property {boolean} enabled
 * @property {number | null} widthMeters per-corner override, null = building width
 *
 * @typedef {Object} EdgeBevelConfig
 * @property {true} enabled
 * @property {string} scope
 * @property {number} widthMeters
 * @property {boolean} includeConcave
 * @property {Record<string, EdgeBevelCornerConfig>} corners
 */

/**
 * @param {any} value
 * @returns {EdgeBevelConfig | null}
 */
export function normalizeEdgeBevelConfig(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;
    if (src.enabled === false) return null;

    const scopeRaw = typeof src.scope === 'string' ? src.scope.trim().toLowerCase() : '';
    const scope = scopeRaw === EDGE_BEVEL_SCOPE.ALL_CONVEX_EDGES
        ? EDGE_BEVEL_SCOPE.ALL_CONVEX_EDGES
        : EDGE_BEVEL_SCOPE.MAIN_CORNERS;

    const widthMeters = normalizeWidth(src.widthMeters, EDGE_BEVEL_DEFAULT_WIDTH_METERS);

    const cornersSrc = src.corners && typeof src.corners === 'object' ? src.corners : null;
    const corners = {};
    for (const cornerId of EDGE_BEVEL_CORNER_IDS) {
        const entry = cornersSrc?.[cornerId] && typeof cornersSrc[cornerId] === 'object' ? cornersSrc[cornerId] : null;
        const overrideRaw = entry?.widthMeters;
        corners[cornerId] = {
            enabled: entry?.enabled !== false,
            widthMeters: (overrideRaw === null || overrideRaw === undefined)
                ? null
                : normalizeWidth(overrideRaw, widthMeters)
        };
    }

    return {
        enabled: true,
        scope,
        widthMeters,
        includeConcave: !!src.includeConcave,
        corners
    };
}

/**
 * The facet width to use at one main corner, or 0 when that corner is off.
 *
 * @param {EdgeBevelConfig | null} config
 * @param {string} cornerId
 * @returns {number}
 */
export function resolveCornerBevelWidth(config, cornerId) {
    const cfg = config && typeof config === 'object' ? config : null;
    if (!cfg?.enabled) return 0;
    const corner = cfg.corners?.[cornerId] ?? null;
    if (!corner || corner.enabled === false) return 0;
    const override = corner.widthMeters;
    const width = (override === null || override === undefined || !Number.isFinite(Number(override)))
        ? cfg.widthMeters
        : Number(override);
    return width > 0 ? width : 0;
}

function lengthXZ(ax, az, bx, bz) {
    return Math.hypot(bx - ax, bz - az);
}

function normalizeXZ(x, z) {
    const len = Math.hypot(x, z);
    if (!(len > EPS)) return null;
    return { x: x / len, z: z / len, len };
}

/**
 * Cut-back along each incident edge that yields a facet `widthMeters` wide at a
 * vertex whose incident unit directions are `dirIn` (into the vertex) and
 * `dirOut` (out of it).
 *
 * @returns {number} 0 when the corner is too straight to bevel
 */
export function resolveBevelCutbackMeters({ widthMeters, dirIn, dirOut }) {
    const w = Number(widthMeters) || 0;
    if (!(w > 0)) return 0;
    // Turn angle between the edges; the interior angle is PI - turn.
    const cross = (Number(dirIn?.x) || 0) * (Number(dirOut?.z) || 0) - (Number(dirIn?.z) || 0) * (Number(dirOut?.x) || 0);
    const dot = (Number(dirIn?.x) || 0) * (Number(dirOut?.x) || 0) + (Number(dirIn?.z) || 0) * (Number(dirOut?.z) || 0);
    const turn = Math.atan2(cross, dot);
    // A straight run has no arris to cut.
    if (Math.abs(turn) < 1e-3) return 0;
    const interior = Math.PI - Math.abs(turn);
    const half = Math.sin(interior * 0.5);
    if (!(half > 1e-3)) return 0;
    return w / (2 * half);
}

/**
 * @typedef {Object} BevelVertexResult
 * @property {Array<object>} loop
 * @property {number} beveled how many vertices were cut
 * @property {number} skipped how many were refused (too tight, or clearance)
 */

/**
 * Replace convex vertices of a closed XZ loop with a chamfer facet.
 *
 * The loop is consumed and produced in its own winding; convexity is measured
 * with the same sign convention the corner-treatment resolver uses (positive
 * cross on a positive-area loop).
 *
 * @param {object} options
 * @param {Array<object>} options.loop
 * @param {number} options.widthMeters
 * @param {boolean} [options.includeConcave]
 * @param {(context: {index: number, vertex: object, prev: object, next: object, dirIn: {x:number,z:number}, dirOut: {x:number,z:number}}) => number} [options.maxCutbackFor]
 *   Per-vertex ceiling on the cut-back (meters). Return 0 to skip the vertex.
 * @param {(context: {index: number, vertex: object}) => boolean} [options.skipVertex]
 * @param {(context: {index: number, vertex: object, start: object, end: object, cutbackMeters: number, facetMeters: number}) => void} [options.onBevel]
 * @param {(a: object, b: object, t: number) => object} [options.lerpVertex] carries
 *   per-point metadata (faceId / u / depth) onto the two new vertices.
 * @param {string[] | null} [options.warnings]
 * @returns {BevelVertexResult}
 */
export function bevelConvexLoopVertices({
    loop,
    widthMeters,
    includeConcave = false,
    maxCutbackFor = null,
    skipVertex = null,
    lerpVertex = null,
    onBevel = null,
    warnings = null
} = {}) {
    const pts = Array.isArray(loop) ? loop.filter((p) => p && typeof p === 'object') : [];
    const n = pts.length;
    const w = Number(widthMeters) || 0;
    if (n < 3 || !(w > 0)) return { loop: pts, beveled: 0, skipped: 0 };

    const area = signedAreaXZ(pts);
    const orientation = area >= 0 ? 1 : -1;
    const lerp = typeof lerpVertex === 'function'
        ? lerpVertex
        : ((a, b, t) => ({ ...a, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }));

    const out = [];
    let beveled = 0;
    let skipped = 0;

    for (let i = 0; i < n; i++) {
        const prev = pts[(i - 1 + n) % n];
        const cur = pts[i];
        const next = pts[(i + 1) % n];

        const inLen = lengthXZ(prev.x, prev.z, cur.x, cur.z);
        const outLen = lengthXZ(cur.x, cur.z, next.x, next.z);
        const dirIn = normalizeXZ(cur.x - prev.x, cur.z - prev.z);
        const dirOut = normalizeXZ(next.x - cur.x, next.z - cur.z);
        if (!dirIn || !dirOut || !(inLen > EPS) || !(outLen > EPS)) {
            out.push(cur);
            continue;
        }

        const cross = (dirIn.x * dirOut.z - dirIn.z * dirOut.x) * orientation;
        const isConvex = cross > 1e-4;
        const isConcave = cross < -1e-4;
        if (!isConvex && !(includeConcave && isConcave)) {
            out.push(cur);
            continue;
        }

        if (typeof skipVertex === 'function' && skipVertex({ index: i, vertex: cur })) {
            out.push(cur);
            continue;
        }

        let cutback = resolveBevelCutbackMeters({ widthMeters: w, dirIn, dirOut });
        if (!(cutback > 0)) {
            out.push(cur);
            continue;
        }

        // Never eat a neighbouring edge whole.
        cutback = Math.min(cutback, inLen * EDGE_BEVEL_MAX_EDGE_FRACTION, outLen * EDGE_BEVEL_MAX_EDGE_FRACTION);

        if (typeof maxCutbackFor === 'function') {
            const limit = Number(maxCutbackFor({ index: i, vertex: cur, prev, next, dirIn, dirOut }));
            cutback = Math.min(cutback, Number.isFinite(limit) ? Math.max(0, limit) : cutback);
        }

        const facet = 2 * cutback * Math.sin((Math.PI - Math.abs(Math.atan2(
            dirIn.x * dirOut.z - dirIn.z * dirOut.x,
            dirIn.x * dirOut.x + dirIn.z * dirOut.z
        ))) * 0.5);
        if (!(facet >= EDGE_BEVEL_MIN_FACET_METERS)) {
            skipped += 1;
            out.push(cur);
            continue;
        }

        const start = lerp(cur, prev, cutback / inLen);
        const end = lerp(cur, next, cutback / outLen);
        out.push(start);
        out.push(end);
        beveled += 1;
        if (typeof onBevel === 'function') {
            onBevel({ index: i, vertex: cur, start, end, cutbackMeters: cutback, facetMeters: facet });
        }
    }

    if (skipped > 0 && Array.isArray(warnings)) {
        warnings.push(`Edge bevel: ${skipped} convex edge(s) had no room for a facet (kept sharp).`);
    }
    return { loop: out, beveled, skipped };
}

export function signedAreaXZ(loop) {
    const pts = Array.isArray(loop) ? loop : [];
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (!a || !b) continue;
        sum += (Number(a.x) || 0) * (Number(b.z) || 0) - (Number(b.x) || 0) * (Number(a.z) || 0);
    }
    return sum * 0.5;
}

/**
 * Corner ids of a rect footprint, by the bounds corner each one sits on. Face A
 * is +z, B is +x, C is -z, D is -x, so corner "AB" is the +x/+z vertex.
 *
 * @param {Array<object>} loop
 * @returns {Record<string, {x:number, z:number}> | null}
 */
export function resolveRectCornerPositions(loop) {
    const pts = Array.isArray(loop) ? loop : [];
    if (pts.length < 3) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
        const x = Number(p?.x);
        const z = Number(p?.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return null;
    return {
        AB: { x: maxX, z: maxZ },
        BC: { x: maxX, z: minZ },
        CD: { x: minX, z: minZ },
        DA: { x: minX, z: maxZ }
    };
}

/**
 * Cut the four main plan corners of a rect footprint loop.
 *
 * @param {object} options
 * @param {Array<object>} options.loop wall-outer loop (rect)
 * @param {EdgeBevelConfig | null} options.config
 * @param {string[] | null} [options.warnings]
 * @returns {{loop: Array<object>, facets: Array<{cornerId: string, start: {x:number,z:number}, end: {x:number,z:number}, widthMeters: number, cutbackMeters: number}>}}
 */
export function bevelRectLoopMainCorners({ loop, config, warnings = null } = {}) {
    const pts = Array.isArray(loop) ? loop.filter((p) => p && typeof p === 'object') : [];
    const cfg = config && typeof config === 'object' && config.enabled ? config : null;
    if (!cfg || pts.length < 3) return { loop: pts, facets: [] };

    const cornerPositions = resolveRectCornerPositions(pts);
    if (!cornerPositions) return { loop: pts, facets: [] };

    const wanted = new Map();
    for (const cornerId of EDGE_BEVEL_CORNER_IDS) {
        const width = resolveCornerBevelWidth(cfg, cornerId);
        if (width > 0) wanted.set(cornerId, width);
    }
    if (!wanted.size) return { loop: pts, facets: [] };

    // Match each requested corner to the loop vertex sitting on it. A footprint
    // that is not a simple rect (already beveled, L-shaped, …) simply keeps its
    // corners: main-corner bevels are rect-only for now.
    const snapTol = 1e-3;
    const cornerIdByIndex = new Map();
    for (const [cornerId, width] of wanted) {
        const target = cornerPositions[cornerId];
        let bestIndex = -1;
        let bestDist = snapTol;
        for (let i = 0; i < pts.length; i++) {
            const d = Math.hypot((Number(pts[i].x) || 0) - target.x, (Number(pts[i].z) || 0) - target.z);
            if (d < bestDist) {
                bestDist = d;
                bestIndex = i;
            }
        }
        if (bestIndex < 0) {
            if (Array.isArray(warnings)) warnings.push(`Edge bevel: no footprint vertex at corner ${cornerId}; skipped.`);
            continue;
        }
        cornerIdByIndex.set(bestIndex, { cornerId, width });
    }
    if (!cornerIdByIndex.size) return { loop: pts, facets: [] };

    const facets = [];
    let widestWanted = 0;
    for (const [, entry] of cornerIdByIndex) widestWanted = Math.max(widestWanted, entry.width);
    const result = bevelConvexLoopVertices({
        loop: pts,
        widthMeters: widestWanted,
        includeConcave: false,
        skipVertex: ({ index }) => !cornerIdByIndex.has(index),
        maxCutbackFor: ({ index, dirIn, dirOut }) => {
            const entry = cornerIdByIndex.get(index) ?? null;
            if (!entry) return 0;
            return resolveBevelCutbackMeters({ widthMeters: entry.width, dirIn, dirOut });
        },
        lerpVertex: (cur, toward, t) => ({
            ...cur,
            x: cur.x + (toward.x - cur.x) * t,
            z: cur.z + (toward.z - cur.z) * t
        }),
        onBevel: ({ index, start, end, cutbackMeters, facetMeters }) => {
            const entry = cornerIdByIndex.get(index) ?? null;
            if (!entry) return;
            facets.push({
                cornerId: entry.cornerId,
                start: { x: Number(start.x) || 0, z: Number(start.z) || 0 },
                end: { x: Number(end.x) || 0, z: Number(end.z) || 0 },
                widthMeters: facetMeters,
                cutbackMeters
            });
        },
        warnings
    });

    return { loop: result.loop, facets };
}
