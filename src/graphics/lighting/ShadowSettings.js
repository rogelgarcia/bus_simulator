// src/graphics/lighting/ShadowSettings.js
// Persisted global shadow settings: which technique renders the sun's shadows
// (`type`) and how much budget it gets (`quality`).
// @ts-check

const STORAGE_KEY = 'bus_sim.shadows.v1';

export const SHADOW_TYPES = Object.freeze(['off', 'single', 'cascade']);
export const SHADOW_QUALITIES = Object.freeze(['low', 'med', 'high']);

export const SHADOW_DEFAULTS = Object.freeze({
    // off: no sun shadows. single: one camera-fitted map. cascade: N maps by
    // depth range.
    type: 'single',
    // low | med | high. Governs resolution AND reach together, so every step
    // down is unambiguously cheaper. Kept while `type` is 'off' so turning
    // shadows back on returns to the tier you left.
    quality: 'high',
    // Dev overrides (?shadowCascades=, ?shadowSplitScale=), not player-facing.
    // 0 means "use the tier's own cascade count"; 1 means "use the tier's own
    // split distances". Sanitisation resets both, so a URL override is never
    // persisted and never leaks into a saved preset.
    cascades: 0,
    splitScale: 1,
    // Cast each building's shadow from one merged mesh instead of one per
    // material. Lossless (same triangles), purely a draw-call saving.
    mergeCasters: true,
    // Let optional instanced facade detail (window sills, decorations,
    // handles) cast shadows. Window glazing and structure are always folded
    // into the building's merged silhouette, so this can remain off by default.
    instancedCasters: false
});

// Texel density the normalBias values below are anchored on: the old single
// fitted map (110 m radius -> 220 m box) at 4096 px.
const REFERENCE_TEXEL_METERS = 220 / 4096;

// shadowMapType is 'pcf' everywhere: three 0.183 deprecated PCFSoftShadowMap
// and silently coerces it to PCFShadowMap at render time (with a console
// warning), so 'pcf_soft' was never a distinct filter -- naming it directly
// keeps the console clean and makes `radius` obviously the softness dial.
//
// `radius` is the PCF sampling disk in TEXELS (5-tap Vogel disk), so its
// world-space penumbra scales with texel size automatically.
//
// Keep it small. The sun subtends ~0.53 deg, so a physically honest penumbra
// is ~0.0093 x the caster-to-receiver distance: ~3 cm under a bus roof 3.2 m
// up, and near zero at contact points. Larger values were tried to hide edge
// stepping and read as wrong -- a midday sun makes hard shadows, and a blurred
// edge looks like an overcast sky. Sharpen edges with resolution, not radius.
// 1.5 texels holds across every tier below because the ladders keep density
// nearly constant, so a constant texel radius IS a constant world penumbra.
const PCF_RADIUS_TEXELS = 1.5;

// --- type: single ------------------------------------------------------------
//
// One fitted map, one geometry pass. The box is 2x `radiusMeters`, so density
// is 2 * radiusMeters / mapSize. This ladder holds density roughly constant and
// spends every step on REACH:
//
//   low  4096 @ 110 m -> 220 m box -> 0.054 m/texel,   64 MiB, 10.05 ms
//   med  8192 @ 200 m -> 400 m box -> 0.049 m/texel,  256 MiB
//   high 16384 @ 340 m -> 680 m box -> 0.042 m/texel, 1024 MiB, 13.24 ms
//
// A tighter box is NOT cheaper: 16384 at 110 m measured 15.43 ms against 13.24
// at 340 m, because magnifying the same triangles across far more texels costs
// more than the extra casters a wide box admits. That is why distance is folded
// into quality rather than exposed as its own control -- a distance dial that
// costs performance when you reduce it is a broken control.
//
// Known consequence: "short and very sharp" is no longer expressible. The old
// `high` was 8192 at 110 m = 0.027 m/texel, sharper than any tier here, purely
// because its reach was short. Reachable via ?shadowQuality= plus a dev build
// if it turns out to be missed.
//
// `normalBias` offsets the receiving surface along its normal to hide acne, so
// it must scale WITH texel size -- a value tuned for a coarse map detaches the
// shadow (peter-panning) on a fine one. Anchored at 0.03 for 0.0537 m/texel.
//
// `bias` is in normalized depth, and the light frustum deepens as the box grows
// (see City._updateSunShadowFocus), so the same number buys a larger world
// offset at longer reach. Scaled down by 110 / radiusMeters to compensate.
//
// Values are literals so this file stays readable as data; the derivation rules
// above are enforced by tests/node/unit/shadow_settings_type_quality.test.js.
const SINGLE_PRESETS = {
    single_low: {
        enabled: true, shadowMapType: 'pcf', mapSize: 4096, radiusMeters: 110,
        radius: PCF_RADIUS_TEXELS, bias: -0.00015, normalBias: 0.03, twoSidedCasting: true
    },
    single_med: {
        enabled: true, shadowMapType: 'pcf', mapSize: 8192, radiusMeters: 200,
        radius: PCF_RADIUS_TEXELS, bias: -0.0000825, normalBias: 0.0273, twoSidedCasting: true
    },
    single_high: {
        enabled: true, shadowMapType: 'pcf', mapSize: 16384, radiusMeters: 340,
        radius: PCF_RADIUS_TEXELS, bias: -0.0000485, normalBias: 0.0232, twoSidedCasting: true
    }
};

// --- type: cascade -----------------------------------------------------------
//
// N maps, one geometry pass each. A cascade's box is ~2.2x its split distance
// (it bounds a slanted frustum slice, unlike the single map's camera-centred
// box), so one wide near cascade cannot be both sharp and long-range.
//
//   low  2c  60/340       boxes 132/757          maps 8192/4096            +6.33 ms
//   med  3c  45/150/340   boxes  99/331/757      maps 8192/8192/4096       +8.27 ms
//   high 4c  45/90/190/340 boxes 99/198/420/757  maps 8192/8192/8192/4096 +10.23 ms
//
// A cascade preset is self-describing: `splits` are metres from the camera (the
// last is also the shadow horizon) and `mapSizeScales` multiply `mapSize` per
// cascade. Both must have `cascades` entries, and the scales must be powers of
// two -- the texel-snapping grid needs every cascade's texel size to be a whole
// multiple of the smallest.
//
// Neighbouring cascades must stay CLOSE to each other, not merely be dense
// individually: a 4x density step at a split reads as a line across the ground
// where detail collapses (reported at the 45 m boundary once the near cascade
// alone was doubled). Holding every in-view cascade at 2x keeps each step near
// 2x, which the fade blends invisibly. Only the last cascade drops to base size.
// `low` is the exception -- its single 60 m boundary steps 11.5x, unavoidable
// with two cascades reaching 340 m.
//
// The near cascade gets double size, not half. Tried at half (the eye "should
// not" resolve 2.4 cm texels at 45 m) and the bus shadow visibly degraded: the
// bus sits a few metres away and fills much of the screen, so its shadow texels
// are always under scrutiny.
//
// normalBias is 0.02 rather than the single ladder's 0.03 anchor because
// CityCascadedShadows rescales it per cascade by that cascade's own density on
// top of this base; 0.02 is the value validated in game at these splits.
const CASCADE_PRESETS = {
    cascade_low: {
        enabled: true, shadowMapType: 'pcf', mapSize: 4096,
        radius: PCF_RADIUS_TEXELS, bias: -0.00015, normalBias: 0.02, twoSidedCasting: true,
        cascades: 2, splits: [60, 340], mapSizeScales: [2, 1]
    },
    cascade_med: {
        enabled: true, shadowMapType: 'pcf', mapSize: 4096,
        radius: PCF_RADIUS_TEXELS, bias: -0.00015, normalBias: 0.02, twoSidedCasting: true,
        cascades: 3, splits: [45, 150, 340], mapSizeScales: [2, 2, 1]
    },
    cascade_high: {
        enabled: true, shadowMapType: 'pcf', mapSize: 4096,
        radius: PCF_RADIUS_TEXELS, bias: -0.00015, normalBias: 0.02, twoSidedCasting: true,
        cascades: 4, splits: [45, 90, 190, 340], mapSizeScales: [2, 2, 2, 1]
    }
};

function deepFreezePreset(preset) {
    if (Array.isArray(preset.splits)) preset.splits = Object.freeze(preset.splits);
    if (Array.isArray(preset.mapSizeScales)) preset.mapSizeScales = Object.freeze(preset.mapSizeScales);
    return Object.freeze(preset);
}

/**
 * Resolved presets, keyed by `<type>_<quality>`. `City` consumes these directly:
 * `cascades` present marks a preset as cascaded, and `mapSize` is then per
 * cascade (multiplied by `mapSizeScales`).
 */
export const SHADOW_QUALITY_PRESETS = Object.freeze({
    off: Object.freeze({
        enabled: false, shadowMapType: 'pcf', mapSize: 0, radiusMeters: 110,
        radius: 1, bias: 0, normalBias: 0, twoSidedCasting: false
    }),
    single_low: deepFreezePreset(SINGLE_PRESETS.single_low),
    single_med: deepFreezePreset(SINGLE_PRESETS.single_med),
    single_high: deepFreezePreset(SINGLE_PRESETS.single_high),
    cascade_low: deepFreezePreset(CASCADE_PRESETS.cascade_low),
    cascade_med: deepFreezePreset(CASCADE_PRESETS.cascade_med),
    cascade_high: deepFreezePreset(CASCADE_PRESETS.cascade_high)
});

function normalizeToken(value) {
    return typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
}

function sanitizeType(value) {
    const raw = normalizeToken(value);
    if (!raw) return null;
    if (raw === 'off' || raw === 'none' || raw === 'no' || raw === 'false' || raw === 'disabled' || raw === '0') return 'off';
    if (raw === 'single' || raw === 'fitted' || raw === 'simple' || raw === '1') return 'single';
    if (raw === 'cascade' || raw === 'cascaded' || raw === 'csm' || raw === 'cascades' || raw === '2') return 'cascade';
    return null;
}

function sanitizeTier(value) {
    const raw = normalizeToken(value);
    if (!raw) return null;
    if (raw === 'low' || raw === 'l' || raw === '1') return 'low';
    if (raw === 'med' || raw === 'medium' || raw === 'm' || raw === '2') return 'med';
    // 'ultra' and 'max' were separate tiers before quality absorbed distance;
    // both land on the top of the new ladder.
    if (raw === 'high' || raw === 'h' || raw === '3' || raw === 'ultra' || raw === 'u' || raw === 'max' || raw === '4') return 'high';
    return null;
}

/**
 * Resolve one compound selector -- a legacy flat quality id, a `<type>_<tier>`
 * preset id, or a bare type -- into whichever of {type, quality} it names.
 *
 * Back-compatibility is load-bearing here: saved settings and shared URLs still
 * carry the flat ids, and every one of them must keep resolving.
 *   off -> off; low -> single/low; medium -> single/med;
 *   high, ultra -> single/high; cascaded, cascade_ultra, csm, 5 -> cascade/high.
 */
function resolveSelector(value) {
    const raw = normalizeToken(value);
    if (!raw) return null;

    // Explicit `<type>_<tier>` (also accepts `single:low`).
    const parts = raw.split(/[_:]/);
    if (parts.length === 2) {
        const type = sanitizeType(parts[0]);
        const tier = sanitizeTier(parts[1]);
        // 'cascade_ultra' parses here as cascade/high, which is exactly its
        // legacy meaning, so it needs no special case.
        if (type && type !== 'off' && tier) return { type, quality: tier };
    }

    if (raw === 'off' || raw === 'none' || raw === 'no' || raw === 'false' || raw === 'disabled' || raw === '0') {
        return { type: 'off' };
    }
    // Legacy: the flat ladder was all single-map except the cascade entry.
    if (raw === '5' || raw === 'cascadeultra' || raw === 'cascaded' || raw === 'cascade' || raw === 'csm') {
        return { type: 'cascade', quality: 'high' };
    }
    const tier = sanitizeTier(raw);
    if (tier) return { type: 'single', quality: tier };

    const type = sanitizeType(raw);
    if (type) return { type };

    return null;
}

function sanitizeCascades(value) {
    const num = Math.round(Number(value));
    // 0 (and anything unusable) means "follow the tier's own cascade count".
    if (!Number.isFinite(num) || num <= 0) return 0;
    return Math.max(2, Math.min(4, num));
}

function sanitizeSplitScale(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return SHADOW_DEFAULTS.splitScale;
    return Math.max(0.5, Math.min(2.5, num));
}

function sanitizeBool(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const raw = value.trim().toLowerCase();
        if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes') return true;
        if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
    }
    return fallback;
}

export function sanitizeShadowSettings(input) {
    const src = input && typeof input === 'object' ? input : {};

    // A `type` field marks new-model input. Without it the record predates the
    // split and its `quality` still carries both halves.
    const explicitType = sanitizeType(src.type);
    const legacy = explicitType ? null : resolveSelector(src.quality);

    const type = explicitType ?? legacy?.type ?? SHADOW_DEFAULTS.type;
    const quality = sanitizeTier(src.quality) ?? legacy?.quality ?? SHADOW_DEFAULTS.quality;

    // Legacy records carry `cascades: 4` and a `splitScale` from the retired
    // Shadow distance row. Neither was a deliberate choice under the old model
    // -- and honouring a stale count would hand a 2-cascade tier the 4-cascade
    // layout, since a preset's split array only fits the count it declares.
    const isLegacy = !explicitType;
    return {
        type,
        quality,
        cascades: isLegacy ? 0 : sanitizeCascades(src.cascades ?? SHADOW_DEFAULTS.cascades),
        splitScale: isLegacy ? SHADOW_DEFAULTS.splitScale : sanitizeSplitScale(src.splitScale ?? SHADOW_DEFAULTS.splitScale),
        mergeCasters: sanitizeBool(src.mergeCasters, SHADOW_DEFAULTS.mergeCasters),
        instancedCasters: sanitizeBool(src.instancedCasters, SHADOW_DEFAULTS.instancedCasters)
    };
}

/** `<type>_<quality>` key into SHADOW_QUALITY_PRESETS, or 'off'. */
export function getShadowPresetId(settings) {
    if (typeof settings === 'string') {
        const sel = resolveSelector(settings);
        if (!sel) return `${SHADOW_DEFAULTS.type}_${SHADOW_DEFAULTS.quality}`;
        if (sel.type === 'off') return 'off';
        return `${sel.type}_${sel.quality ?? SHADOW_DEFAULTS.quality}`;
    }
    const s = sanitizeShadowSettings(settings);
    return s.type === 'off' ? 'off' : `${s.type}_${s.quality}`;
}

/**
 * Resolved preset for a settings object. Also accepts a bare selector string
 * (including every legacy flat id) so older call sites keep working.
 */
export function getShadowQualityPreset(settings) {
    const id = getShadowPresetId(settings);
    return SHADOW_QUALITY_PRESETS[id] ?? SHADOW_QUALITY_PRESETS[`${SHADOW_DEFAULTS.type}_${SHADOW_DEFAULTS.quality}`];
}

export function loadSavedShadowSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return sanitizeShadowSettings(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function saveShadowSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeShadowSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedShadowSettings() {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    try {
        storage.removeItem(STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}

function applySelectorOverride(target, raw) {
    const sel = resolveSelector(raw);
    if (!sel) return;
    target.type = sel.type;
    if (sel.quality) target.quality = sel.quality;
}

export function getResolvedShadowSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedShadowSettings();
    const merged = sanitizeShadowSettings({ ...SHADOW_DEFAULTS, ...(saved ?? {}) });

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        // Compound selectors: `?shadows=cascaded`, `?shadows=cascade_low`,
        // `?shadowQuality=high`. Bare tiers keep their legacy single-map
        // meaning, so every URL shared before this split still resolves.
        if (params.has('shadowQuality')) applySelectorOverride(merged, params.get('shadowQuality'));
        if (params.has('shadows')) applySelectorOverride(merged, params.get('shadows'));
        // Split selectors, for changing one half without restating the other.
        if (params.has('shadowType')) merged.type = sanitizeType(params.get('shadowType')) ?? merged.type;
        if (params.has('shadowTier')) merged.quality = sanitizeTier(params.get('shadowTier')) ?? merged.quality;
        // Dev-only tuning knobs, retired as player-facing settings. Applied
        // after sanitisation so they take effect without ever being persisted.
        if (params.has('shadowCascades')) merged.cascades = sanitizeCascades(params.get('shadowCascades'));
        if (params.has('shadowSplitScale')) merged.splitScale = sanitizeSplitScale(params.get('shadowSplitScale'));
        if (params.has('shadowMergeCasters')) merged.mergeCasters = sanitizeBool(params.get('shadowMergeCasters'), merged.mergeCasters);
        if (params.has('shadowInstancedCasters')) merged.instancedCasters = sanitizeBool(params.get('shadowInstancedCasters'), merged.instancedCasters);
    }

    return merged;
}

export function getDefaultResolvedShadowSettings() {
    return sanitizeShadowSettings(SHADOW_DEFAULTS);
}
