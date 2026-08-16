// src/app/buildings/BayBalconyModel.js
// Bay balcony feature model (AI 489): ONE feature with modes, not separate
// balcony types. A balcony is a per-bay facade feature (like `capital` or
// `window`) with `placement: 'projecting' | 'recessed'`:
//   - projecting: platform slab + railing kit outside the facade plane, with a
//     support mode (cantilever / corbel_brackets / posts_to_below);
//   - recessed: the notch comes from the bay's own negative `depth` (the
//     existing bay recession); the balcony contributes the notch floor slab,
//     the front railing near the nominal facade plane, and the notch soffit.
// Side covers are adjacency-driven: a side that abuts wall gets no infill, a
// side facing open air gets the configured infill. Per-side overrides
// (auto | always | never) exist for art control. The juliet balconet is a
// preset of the same feature (tiny depth, opening-width platform, grid infill).
//
// Depth sign convention (matches the facade silhouette): positive bay depth
// bulges OUTWARD past the nominal facade line, negative depth recesses inward.
// A recessed balcony bay therefore authors `depth: { left: -d, right: -d }`.
//
// This module is deliberately three-free so the solver, the generator, the
// BF2 GUI and node unit tests can all share ONE normalizer (see the
// facade-solver-renormalizes-bay-windows lesson: every opening/bay field must
// survive all three whitelists — sharing the model module keeps them aligned).
// @ts-check

export const BALCONY_PLACEMENT = Object.freeze({
    PROJECTING: 'projecting',
    RECESSED: 'recessed'
});

export const BALCONY_SUPPORT_MODE = Object.freeze({
    CANTILEVER: 'cantilever',
    CORBEL_BRACKETS: 'corbel_brackets',
    POSTS_TO_BELOW: 'posts_to_below'
});

export const BALCONY_SIDE_POLICY = Object.freeze({
    AUTO: 'auto',
    ALWAYS: 'always',
    NEVER: 'never'
});

export const BALCONY_RAILING_INFILL = Object.freeze({
    OPEN: 'open',
    SOLID_WALL: 'solid_wall',
    GLASS_PANEL: 'glass_panel',
    GRID: 'grid'
});

export const BALCONY_GRID_PATTERN = Object.freeze({
    VERTICAL_BARS: 'vertical_bars',
    HORIZONTAL_BARS: 'horizontal_bars'
});

export const BALCONY_PLATFORM_WIDTH_MODE = Object.freeze({
    BAY: 'bay',
    OPENING: 'opening'
});

export const BALCONY_SIDE_IDS = Object.freeze(['left', 'front', 'right']);

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, Math.round(num)));
}

function deepClone(value) {
    if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
        return out;
    }
    return value;
}

// Plain-object deep merge; override scalars/arrays win, objects merge.
function mergeDeep(base, override) {
    const a = base && typeof base === 'object' && !Array.isArray(base) ? base : null;
    const b = override && typeof override === 'object' && !Array.isArray(override) ? override : null;
    if (!a) return deepClone(override);
    if (!b) return deepClone(base);
    const out = deepClone(a);
    for (const [k, v] of Object.entries(b)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
            out[k] = mergeDeep(out[k], v);
        } else if (v !== undefined) {
            out[k] = deepClone(v);
        }
    }
    return out;
}

function normalizeEnum(value, allowed, fallback) {
    const typed = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return allowed.includes(typed) ? typed : fallback;
}

function normalizeInfill(value, fallback) {
    // Accept the old draft-spec camelCase aliases.
    const raw = typeof value === 'string' ? value.trim() : '';
    const aliased = raw === 'solidWall' ? 'solid_wall' : (raw === 'glassPanel' ? 'glass_panel' : raw);
    return normalizeEnum(aliased, Object.values(BALCONY_RAILING_INFILL), fallback);
}

// Wall-material spec dialect (same as bay capitals): {kind: texture|color|slot|
// match_wall, id}. Slot refs are rewritten by the material-slots pre-pass.
function normalizeWallMaterialSpec(value, fallback = null) {
    const src = value && typeof value === 'object' ? value : null;
    const kind = src?.kind;
    const id = typeof src?.id === 'string' ? src.id : '';
    if ((kind === 'texture' || kind === 'color' || kind === 'slot') && id) return { kind, id };
    if (kind === 'match_wall') return { kind: 'match_wall', id: 'match_wall' };
    return fallback ? deepClone(fallback) : { kind: 'match_wall', id: 'match_wall' };
}

function normalizeHex(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return (Math.round(num) >>> 0) & 0xffffff;
}

function normalizeSides(value) {
    const src = value && typeof value === 'object' ? value : {};
    const policies = Object.values(BALCONY_SIDE_POLICY);
    return {
        left: normalizeEnum(src.left, policies, BALCONY_SIDE_POLICY.AUTO),
        front: normalizeEnum(src.front, policies, BALCONY_SIDE_POLICY.AUTO),
        right: normalizeEnum(src.right, policies, BALCONY_SIDE_POLICY.AUTO)
    };
}

function normalizeFloors(value) {
    const src = value && typeof value === 'object' ? value : {};
    // 1-based, matching wallDecorations floorInterval; end 0 = all floors.
    const start = clampInt(src.start, 1, 99, 1);
    const every = clampInt(src.every, 1, 99, 1);
    const endRaw = Number(src.end);
    const end = Number.isFinite(endRaw) && endRaw > 0 ? clampInt(endRaw, start, 99, start) : 0;
    return { start, every, end };
}

/**
 * Normalizes a bay balcony config. Returns null when absent or disabled.
 * `presetId` (when it resolves) provides the base config; explicit fields on
 * the value deep-merge on top, so authored configs stay tiny.
 */
export function normalizeBalconyConfig(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src || src.enabled === false) return null;

    const presetId = typeof src.presetId === 'string' && src.presetId.trim() ? src.presetId.trim() : null;
    const preset = presetId ? (BALCONY_PRESET_CONFIG_BY_ID[presetId] ?? null) : null;
    const merged = preset ? mergeDeep(preset, src) : src;

    const platformSrc = merged.platform && typeof merged.platform === 'object' ? merged.platform : {};
    const supportSrc = merged.support && typeof merged.support === 'object' ? merged.support : {};
    const railingSrc = merged.railing && typeof merged.railing === 'object' ? merged.railing : {};
    const topRailSrc = railingSrc.topRail && typeof railingSrc.topRail === 'object' ? railingSrc.topRail : {};
    const postsSrc = railingSrc.posts && typeof railingSrc.posts === 'object' ? railingSrc.posts : {};
    const gridSrc = railingSrc.grid && typeof railingSrc.grid === 'object' ? railingSrc.grid : {};
    const solidSrc = railingSrc.solid && typeof railingSrc.solid === 'object' ? railingSrc.solid : {};
    const glassSrc = railingSrc.glass && typeof railingSrc.glass === 'object' ? railingSrc.glass : {};

    const placement = normalizeEnum(merged.placement, Object.values(BALCONY_PLACEMENT), BALCONY_PLACEMENT.PROJECTING);
    // Test the raw value, not Number(raw): Number(null) is 0, which would turn
    // the null "auto depth" sentinel into a clamped 0.03 on re-normalization
    // (configs are normalized once in the solver and again in the generator).
    const depthRaw = platformSrc.depthMeters;
    const widthMode = normalizeEnum(platformSrc.widthMode, Object.values(BALCONY_PLATFORM_WIDTH_MODE), BALCONY_PLATFORM_WIDTH_MODE.BAY);

    return {
        enabled: true,
        ...(presetId ? { presetId } : {}),
        placement,
        platform: {
            // null = auto: projecting falls back to 1.4m, recessed fills the
            // bay's own recession (notch) up to the nominal facade plane.
            depthMeters: Number.isFinite(depthRaw) ? clamp(depthRaw, 0.03, 2.5, 1.4) : null,
            thicknessMeters: clamp(platformSrc.thicknessMeters, 0.03, 0.6, 0.16),
            widthMode,
            // Margin between the platform edge and the reference span edge:
            // widthMode 'bay' shrinks inward from the bay edges, 'opening'
            // grows outward past the opening edges.
            sideMarginMeters: clamp(platformSrc.sideMarginMeters, 0.0, 2.0, widthMode === BALCONY_PLATFORM_WIDTH_MODE.OPENING ? 0.12 : 0.0),
            elevationMeters: clamp(platformSrc.elevationMeters, -1.0, 1.0, 0.0),
            material: normalizeWallMaterialSpec(platformSrc.material)
        },
        support: {
            mode: normalizeEnum(supportSrc.mode, Object.values(BALCONY_SUPPORT_MODE), BALCONY_SUPPORT_MODE.CANTILEVER),
            bracketHeightMeters: clamp(supportSrc.bracketHeightMeters, 0.08, 1.2, 0.35),
            postSizeMeters: clamp(supportSrc.postSizeMeters, 0.04, 0.4, 0.12),
            material: normalizeWallMaterialSpec(supportSrc.material)
        },
        railing: {
            heightMeters: clamp(railingSrc.heightMeters, 0.3, 1.8, 1.05),
            insetMeters: clamp(railingSrc.insetMeters, 0.0, 0.5, 0.04),
            infill: normalizeInfill(railingSrc.infill, BALCONY_RAILING_INFILL.GLASS_PANEL),
            colorHex: normalizeHex(railingSrc.colorHex, 0x1f2225),
            roughness: clamp(railingSrc.roughness, 0.0, 1.0, 0.5),
            metalness: clamp(railingSrc.metalness, 0.0, 1.0, 0.65),
            topRail: {
                enabled: topRailSrc.enabled !== false,
                widthMeters: clamp(topRailSrc.widthMeters, 0.02, 0.3, 0.07),
                heightMeters: clamp(topRailSrc.heightMeters, 0.02, 0.2, 0.05)
            },
            posts: {
                enabled: postsSrc.enabled !== false,
                widthMeters: clamp(postsSrc.widthMeters, 0.02, 0.3, 0.05),
                maxSpacingMeters: clamp(postsSrc.maxSpacingMeters, 0.3, 99.0, 1.8)
            },
            grid: {
                pattern: normalizeEnum(gridSrc.pattern, Object.values(BALCONY_GRID_PATTERN), BALCONY_GRID_PATTERN.VERTICAL_BARS),
                barWidthMeters: clamp(gridSrc.barWidthMeters, 0.008, 0.1, 0.018),
                spacingMeters: clamp(gridSrc.spacingMeters, 0.04, 0.6, 0.12)
            },
            solid: {
                thicknessMeters: clamp(solidSrc.thicknessMeters, 0.03, 0.4, 0.09),
                material: normalizeWallMaterialSpec(solidSrc.material)
            },
            glass: {
                opacity: clamp(glassSrc.opacity, 0.05, 0.9, 0.32),
                tintHex: normalizeHex(glassSrc.tintHex, 0xa8bccb)
            }
        },
        sides: normalizeSides(merged.sides),
        floors: normalizeFloors(merged.floors)
    };
}

/**
 * Adjacency-driven side coverage. For each of left/front/right, decides
 * whether the side gets railing/infill (faces open air) or nothing (abuts
 * wall). Overrides win over the adjacency result.
 *
 * `left` = the lower-u side of the bay on its face, `right` = the higher-u
 * side, matching the facade frame tangent direction.
 *
 * Neighbors: the adjacent strip on the same face; at a face end, the corner
 * strip of the adjacent face in loop order (A→B→C→D→A). A side abuts wall
 * when the neighbor's front plane sits at (or in front of) the balcony's
 * platform front plane — the neighbor wall covers the side, so no infill.
 *
 * @param {object} options
 * @param {'A'|'B'|'C'|'D'} options.faceId
 * @param {number} options.u0 bay start (meters along the face)
 * @param {number} options.u1 bay end
 * @param {number} options.platformFrontDepth outward depth of the platform's
 *   front plane (facade depth axis: positive = outward past the nominal line)
 * @param {{A?: Array, B?: Array, C?: Array, D?: Array}} options.stripsByFaceId
 *   per-face strip lists ({u0, u1, depth}), each sorted by u0; the face length
 *   is taken from the last strip's u1.
 * @param {{left: string, front: string, right: string}} [options.sides]
 * @param {number} [options.epsilonMeters]
 * @returns {{left: boolean, front: boolean, right: boolean}}
 */
export function resolveBalconySideCoverage({
    faceId,
    u0,
    u1,
    platformFrontDepth,
    stripsByFaceId,
    sides = null,
    epsilonMeters = 0.05
} = {}) {
    const faceOrder = ['A', 'B', 'C', 'D'];
    const eps = Math.max(1e-4, Number(epsilonMeters) || 0.05);
    const front = Number(platformFrontDepth) || 0;
    const policy = normalizeSides(sides);
    const byFace = stripsByFaceId && typeof stripsByFaceId === 'object' ? stripsByFaceId : {};

    const stripsOf = (id) => (Array.isArray(byFace[id]) ? byFace[id] : []);
    const faceLengthOf = (id) => {
        const list = stripsOf(id);
        const last = list[list.length - 1] ?? null;
        return Number(last?.u1) || 0;
    };
    const stripDepth = (strip) => (Number(strip?.depth) || 0);

    const faceIdx = faceOrder.indexOf(faceId);
    const prevFaceId = faceOrder[(faceIdx + 3) % 4];
    const nextFaceId = faceOrder[(faceIdx + 1) % 4];

    // Depth of whatever the bay edge touches. Plain wall (no strips) = 0.
    const neighborDepthAt = (edgeU, direction) => {
        const list = stripsOf(faceId);
        const tol = 1e-3;
        if (direction < 0) {
            // Left edge: same-face strip ending at edgeU.
            for (const strip of list) {
                if (Math.abs((Number(strip?.u1) || 0) - edgeU) <= tol) return stripDepth(strip);
            }
            if (edgeU <= tol && faceIdx >= 0) {
                const prevList = stripsOf(prevFaceId);
                const last = prevList[prevList.length - 1] ?? null;
                if (last) return stripDepth(last);
            }
        } else {
            // Right edge: same-face strip starting at edgeU.
            for (const strip of list) {
                if (Math.abs((Number(strip?.u0) || 0) - edgeU) <= tol) return stripDepth(strip);
            }
            const faceLen = faceLengthOf(faceId);
            if (faceLen > 0 && Math.abs(edgeU - faceLen) <= tol && faceIdx >= 0) {
                const nextList = stripsOf(nextFaceId);
                const first = nextList[0] ?? null;
                if (first) return stripDepth(first);
            }
        }
        return 0;
    };

    const resolveSide = (sidePolicy, isFront, edgeU, direction) => {
        if (sidePolicy === BALCONY_SIDE_POLICY.ALWAYS) return true;
        if (sidePolicy === BALCONY_SIDE_POLICY.NEVER) return false;
        if (isFront) return true;
        const neighborDepth = neighborDepthAt(edgeU, direction);
        return neighborDepth < front - eps;
    };

    return {
        left: resolveSide(policy.left, false, Number(u0) || 0, -1),
        front: resolveSide(policy.front, true, 0, 0),
        right: resolveSide(policy.right, false, Number(u1) || 0, +1)
    };
}

// ---------------------------------------------------------------------------
// Presets

export const BALCONY_PRESET_ID = Object.freeze({
    MODERN_GLASS_PROJECTING: 'balcony.modern_glass_projecting',
    MODERN_RECESSED: 'balcony.modern_recessed',
    JULIET_IRON: 'balcony.juliet_iron'
});

// Preset bodies are pre-normalization configs (normalizeBalconyConfig merges
// the authored value over these).
const BALCONY_PRESET_CONFIG_BY_ID = Object.freeze({
    [BALCONY_PRESET_ID.MODERN_GLASS_PROJECTING]: Object.freeze({
        placement: 'projecting',
        platform: {
            depthMeters: 1.5,
            thicknessMeters: 0.18,
            widthMode: 'bay',
            sideMarginMeters: 0.0
        },
        support: { mode: 'cantilever' },
        railing: {
            heightMeters: 1.05,
            insetMeters: 0.05,
            infill: 'glass_panel',
            colorHex: 0x2a2d31,
            roughness: 0.45,
            metalness: 0.7,
            topRail: { enabled: true, widthMeters: 0.07, heightMeters: 0.045 },
            posts: { enabled: true, widthMeters: 0.05, maxSpacingMeters: 2.4 },
            glass: { opacity: 0.3, tintHex: 0xaec4d4 }
        }
    }),
    [BALCONY_PRESET_ID.MODERN_RECESSED]: Object.freeze({
        placement: 'recessed',
        platform: {
            thicknessMeters: 0.16,
            widthMode: 'bay',
            sideMarginMeters: 0.0
        },
        support: { mode: 'cantilever' },
        railing: {
            heightMeters: 1.05,
            insetMeters: 0.06,
            infill: 'glass_panel',
            colorHex: 0x2a2d31,
            roughness: 0.45,
            metalness: 0.7,
            topRail: { enabled: true, widthMeters: 0.06, heightMeters: 0.04 },
            posts: { enabled: true, widthMeters: 0.045, maxSpacingMeters: 2.4 },
            glass: { opacity: 0.3, tintHex: 0xaec4d4 }
        }
    }),
    [BALCONY_PRESET_ID.JULIET_IRON]: Object.freeze({
        placement: 'projecting',
        platform: {
            depthMeters: 0.12,
            thicknessMeters: 0.05,
            widthMode: 'opening',
            sideMarginMeters: 0.1
        },
        support: { mode: 'cantilever' },
        railing: {
            heightMeters: 1.0,
            insetMeters: 0.0,
            infill: 'grid',
            colorHex: 0x17181a,
            roughness: 0.55,
            metalness: 0.75,
            topRail: { enabled: true, widthMeters: 0.045, heightMeters: 0.035 },
            posts: { enabled: true, widthMeters: 0.035, maxSpacingMeters: 99.0 },
            grid: { pattern: 'vertical_bars', barWidthMeters: 0.016, spacingMeters: 0.11 }
        },
        sides: { front: 'always' }
    })
});

export const BALCONY_PRESET_OPTIONS = Object.freeze([
    Object.freeze({ id: BALCONY_PRESET_ID.MODERN_GLASS_PROJECTING, label: 'Glass Projecting' }),
    Object.freeze({ id: BALCONY_PRESET_ID.MODERN_RECESSED, label: 'Modern Recessed' }),
    Object.freeze({ id: BALCONY_PRESET_ID.JULIET_IRON, label: 'Juliet Iron' })
]);

export function getBalconyPresetConfigById(presetId) {
    const id = typeof presetId === 'string' ? presetId : '';
    const preset = BALCONY_PRESET_CONFIG_BY_ID[id] ?? null;
    return preset ? deepClone(preset) : null;
}

// ---------------------------------------------------------------------------
// Preset preview configs — minimal single-bay buildings the BF2 GUI feeds to
// its config thumbnail renderer for the balcony preset picker.

function makeBalconyPreviewConfig({ presetId, bayDepth = null, windowDefId = 'window_street_black' }) {
    const bay = {
        id: 'bay_1',
        size: { mode: 'fixed', widthMeters: 4.0 },
        expandPreference: 'no_repeat',
        ...(bayDepth ? { depth: { left: bayDepth, right: bayDepth, linked: true } } : {}),
        balcony: { enabled: true, presetId },
        window: {
            enabled: true,
            defId: windowDefId,
            assetType: 'window',
            size: { widthMeters: 2.4, heightMeters: 1.9 },
            heightMode: 'fixed',
            verticalOffsetMeters: 0.25,
            width: { minMeters: 2.4, maxMeters: null },
            padding: { leftMeters: 0.2, rightMeters: 0.2 },
            repeat: { count: 1 },
            visual: { disableShades: true, interior: 'none' }
        }
    };
    return {
        id: `balcony_preview_${presetId.replace(/[^a-z0-9_]/gi, '_')}`,
        name: 'Balcony preview',
        footprint: { widthMeters: 6.0, depthMeters: 6.0 },
        layers: [
            {
                id: 'floor_1',
                type: 'floor',
                floors: 2,
                floorHeight: 3.0,
                material: { kind: 'texture', id: 'pbr.limestone_smooth' }
            }
        ],
        facades: {
            A: { layout: { bays: { items: [bay] } } }
        }
    };
}

export function getBalconyPresetPreviewConfigs() {
    return [
        makeBalconyPreviewConfig({ presetId: BALCONY_PRESET_ID.MODERN_GLASS_PROJECTING }),
        makeBalconyPreviewConfig({ presetId: BALCONY_PRESET_ID.MODERN_RECESSED, bayDepth: -1.2 }),
        makeBalconyPreviewConfig({ presetId: BALCONY_PRESET_ID.JULIET_IRON })
    ];
}
