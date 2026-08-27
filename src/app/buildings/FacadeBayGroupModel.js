// src/app/buildings/FacadeBayGroupModel.js
// Facade bay GROUP model (AI 493). A group is the facade's repeating rhythm
// unit: a contiguous run of bays (e.g. `[window, narrowPier, window, widePier]`)
// that the solver repeats as a whole. Everything a rhythm needs — sequence,
// in-group vs between-group spacing, paired windows — is already expressible
// as bays inside a group, so this module adds only what a group could NOT say:
//
//   - `repeat`      how many times the unit may repeat (min / max | 'auto'),
//   - `arcade`      a MODE of the group (not a sibling feature): every arched
//                   opening in the run shares ONE springing line, and the piers
//                   between them can carry an impost band at that line so they
//                   read as arcade columns,
//   - `stacking`    (facade-level) whether bay repeat topology is resolved once
//                   per face and reused by every layer, so columns stack.
//
// Springing rule: `archRise = arch.heightRatio * width`, so a run of unequal
// widths has unequal springing heights. The shared line is the HIGHEST natural
// springing in the run, which means every arch is flattened toward segmental at
// most and none is ever pushed past its natural semicircle into a horseshoe.
//
// This module is deliberately three-free so the solver, the generator, the BF2
// GUI and node unit tests can all share ONE normalizer (see the
// facade-solver-renormalizes-bay-windows lesson: every new bay/group field must
// survive all three whitelists — sharing the model module keeps them aligned).
// @ts-check

export const FACADE_BAY_STACKING_MODE = Object.freeze({
    /** Repeat topology is resolved once per face and reused by every layer. */
    LOCK_COLUMNS: 'lock_columns',
    /** Every layer solves its own repeat counts (pre-AI-493 behavior). */
    PER_LAYER: 'per_layer'
});

export const ARCADE_SPRINGING_MODE = Object.freeze({
    /** Highest natural springing across the run's arched openings. */
    AUTO: 'auto',
    /** Author-pinned height above the floor line. */
    FIXED: 'fixed'
});

export const ARCADE_IMPOST_DEFAULTS = Object.freeze({
    heightMeters: 0.14,
    projectionMeters: 0.07,
    overhangMeters: 0.03
});

// An arch flatter than this reads as a lintel with a sag, not an arch, so the
// shared line never pushes a member below it.
export const ARCADE_MIN_RISE_RATIO = 0.05;

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

// Wall-material spec dialect (same as bay capitals): {kind: texture|color|slot|
// match_wall, id}. Slot refs are rewritten by the material-slots pre-pass.
function normalizeWallMaterialSpec(value) {
    const src = value && typeof value === 'object' ? value : null;
    const kind = src?.kind;
    const id = typeof src?.id === 'string' ? src.id : '';
    if ((kind === 'texture' || kind === 'color' || kind === 'slot') && id) return { kind, id };
    return { kind: 'match_wall', id: 'match_wall' };
}

/**
 * @typedef {Object} FacadeBayGroupRepeat
 * @property {number} minRepeats
 * @property {number | 'auto'} maxRepeats
 */

/**
 * @param {any} value
 * @returns {FacadeBayGroupRepeat}
 */
export function normalizeFacadeBayGroupRepeat(value) {
    const src = value && typeof value === 'object' ? value : null;
    const minRepeats = clampInt(src?.minRepeats ?? 1, 1, 9999, 1);
    const maxRaw = src?.maxRepeats;
    if (maxRaw === 'auto' || maxRaw === null || maxRaw === undefined) return { minRepeats, maxRepeats: 'auto' };
    return { minRepeats, maxRepeats: clampInt(maxRaw, minRepeats, 9999, minRepeats) };
}

/**
 * @typedef {Object} ArcadeImpostConfig
 * @property {boolean} enabled
 * @property {number} heightMeters
 * @property {number} projectionMeters
 * @property {number} overhangMeters
 * @property {{kind: string, id: string}} material
 *
 * @typedef {Object} ArcadeConfig
 * @property {true} enabled
 * @property {{mode: string, offsetMeters: number | null}} springing
 * @property {ArcadeImpostConfig} impost
 */

/**
 * @param {any} value
 * @returns {ArcadeConfig | null}
 */
export function normalizeArcadeConfig(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;
    if (src.enabled === false) return null;

    const springingSrc = src.springing && typeof src.springing === 'object' ? src.springing : null;
    const modeRaw = typeof springingSrc?.mode === 'string' ? springingSrc.mode.trim().toLowerCase() : '';
    const offsetRaw = Number(springingSrc?.offsetMeters);
    const hasOffset = Number.isFinite(offsetRaw);
    const mode = (modeRaw === ARCADE_SPRINGING_MODE.FIXED && hasOffset)
        ? ARCADE_SPRINGING_MODE.FIXED
        : ARCADE_SPRINGING_MODE.AUTO;

    const impostSrc = src.impost && typeof src.impost === 'object' ? src.impost : null;
    // Absent `impost` means "the default band"; only `enabled: false` turns it
    // off. The flag is always written out so a stored config round-trips —
    // dropping the band to `null` would read back as "absent" = default on.
    const impost = {
        enabled: impostSrc?.enabled !== false,
        // AI 509: continuous mode also bands the jamb strips inside opening
        // bays, so the run reads as ONE band broken only by the arches.
        continuous: impostSrc?.continuous === true,
        heightMeters: clamp(impostSrc?.heightMeters, 0.03, 0.8, ARCADE_IMPOST_DEFAULTS.heightMeters),
        projectionMeters: clamp(impostSrc?.projectionMeters, 0.01, 0.6, ARCADE_IMPOST_DEFAULTS.projectionMeters),
        overhangMeters: clamp(impostSrc?.overhangMeters, 0.0, 0.5, ARCADE_IMPOST_DEFAULTS.overhangMeters),
        material: normalizeWallMaterialSpec(impostSrc?.material ?? null)
    };

    return {
        enabled: true,
        springing: {
            mode,
            offsetMeters: mode === ARCADE_SPRINGING_MODE.FIXED ? clamp(offsetRaw, 0.1, 99.0, 0.1) : null
        },
        impost
    };
}

/**
 * @param {any} value
 * @returns {{mode: string}}
 */
export function normalizeFacadeStackingSpec(value) {
    const src = value && typeof value === 'object' ? value : null;
    const raw = typeof src?.mode === 'string' ? src.mode.trim().toLowerCase() : '';
    return {
        mode: raw === FACADE_BAY_STACKING_MODE.PER_LAYER
            ? FACADE_BAY_STACKING_MODE.PER_LAYER
            : FACADE_BAY_STACKING_MODE.LOCK_COLUMNS
    };
}

/**
 * An arcade member is one arched opening in the run, measured against the floor
 * line it sits on.
 *
 * @typedef {Object} ArcadeMember
 * @property {number} headOffsetMeters top of the opening above the floor line
 * @property {number} widthMeters opening width
 * @property {number} archHeightRatio the def's natural rise ratio (0 = not arched)
 */

function isArchedMember(member) {
    const width = Number(member?.widthMeters) || 0;
    const ratio = Number(member?.archHeightRatio) || 0;
    const head = Number(member?.headOffsetMeters);
    return width > 0.01 && ratio > 0.001 && Number.isFinite(head);
}

/**
 * The run's shared springing height above the floor line, or null when the run
 * has no arched opening to share one.
 *
 * @param {object} options
 * @param {ArcadeMember[]} options.members
 * @param {{mode: string, offsetMeters: number | null} | null} [options.springing]
 * @returns {number | null}
 */
export function resolveArcadeSpringingOffset({ members, springing = null } = {}) {
    const list = Array.isArray(members) ? members.filter(isArchedMember) : [];
    if (!list.length) return null;

    if (springing?.mode === ARCADE_SPRINGING_MODE.FIXED && Number.isFinite(Number(springing?.offsetMeters))) {
        return Number(springing.offsetMeters);
    }

    // Highest natural springing wins: every other arch flattens toward
    // segmental, and none is stilted past its own semicircle.
    let best = -Infinity;
    for (const member of list) {
        const head = Number(member.headOffsetMeters);
        const naturalRise = Number(member.archHeightRatio) * Number(member.widthMeters);
        best = Math.max(best, head - naturalRise);
    }
    return Number.isFinite(best) ? best : null;
}

/**
 * The arch rise ratio one member must use to meet the shared springing line.
 * Returns the member's natural ratio when the line cannot be met (the opening
 * head sits at or below it, or meeting it would flatten the arch away).
 *
 * @param {object} options
 * @param {ArcadeMember} options.member
 * @param {number | null} options.springingOffsetMeters
 * @returns {{heightRatio: number, met: boolean}}
 */
export function resolveArcadeArchHeightRatio({ member, springingOffsetMeters } = {}) {
    const natural = Number(member?.archHeightRatio) || 0;
    if (!isArchedMember(member) || !Number.isFinite(Number(springingOffsetMeters))) {
        return { heightRatio: natural, met: false };
    }

    const width = Number(member.widthMeters);
    const rise = Number(member.headOffsetMeters) - Number(springingOffsetMeters);
    const minRise = ARCADE_MIN_RISE_RATIO * width;
    const naturalRise = natural * width;
    if (!(rise > minRise) || rise > naturalRise + 1e-6) {
        return { heightRatio: natural, met: false };
    }
    // Already on the line (the member that defined it, or a uniform run): keep
    // the authored ratio rather than a float-drifted recomputation of it.
    if (Math.abs(rise - naturalRise) <= 1e-6) return { heightRatio: natural, met: true };
    return { heightRatio: rise / width, met: true };
}

/**
 * @param {any} group
 * @returns {ArcadeConfig | null}
 */
export function resolveGroupArcadeConfig(group) {
    return normalizeArcadeConfig(group && typeof group === 'object' ? group.arcade : null);
}

export function cloneArcadeConfig(value) {
    return value ? deepClone(value) : null;
}
