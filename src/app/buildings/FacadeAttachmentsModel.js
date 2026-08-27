// src/app/buildings/FacadeAttachmentsModel.js
// Facade attachments feature model (AI 490): ONE attachments feature whose
// behavior varies by `type` — not sibling systems per attachment kind.
//   - `ac_unit`: per-window scatter decoration (box + grille protruding from
//     the opening bottom, slight downward tilt), placed by a deterministic
//     seeded probability so the same city always renders identically.
//   - `fire_escape`: per-facade vertical run anchored to a chosen window
//     column (bay): railed landings per floor (the AI 489 balcony railing
//     kit look), alternating angled stair flights between them, and a drop
//     ladder below the lowest landing.
// Like BayBalconyModel, this module is three-free so the generator, the BF2
// GUI and node unit tests share one normalizer.
// @ts-check

export const FACADE_ATTACHMENT_TYPE = Object.freeze({
    AC_UNIT: 'ac_unit',
    FIRE_ESCAPE: 'fire_escape'
});

// AI 512: N-face model — a face id is any single letter A-Z.
const isFaceId = (id) => typeof id === 'string' && id.length === 1 && id >= 'A' && id <= 'Z';
const OPENING_ASSET_TYPES = Object.freeze(['window', 'door', 'garage', 'storefront']);

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

function normalizeHex(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return (Math.round(num) >>> 0) & 0xffffff;
}

/**
 * Deterministic scatter decision. FNV-1a over the composed key mixed with the
 * building seed; returns a uniform-ish value in [0, 1). Same inputs always
 * produce the same value, so a city rebuild keeps the same AC placement set.
 */
export function hashAttachmentKeyToUnit(seed, key, seedOffset = 0) {
    const s = (Number(seed) >>> 0) ^ ((clampInt(seedOffset, -99999, 99999, 0) * 2654435761) >>> 0);
    let h = (0x811c9dc5 ^ s) >>> 0;
    const text = String(key ?? '');
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    // Final avalanche (xorshift-multiply) so short keys spread well.
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d) >>> 0;
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39) >>> 0;
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}

function normalizeEligibility(value) {
    const src = value && typeof value === 'object' ? value : {};
    const layerIdsRaw = Array.isArray(src.layerIds) ? src.layerIds : null;
    const layerIds = layerIdsRaw
        ? layerIdsRaw.filter((id) => typeof id === 'string' && id).slice(0, 64)
        : null;
    const assetTypesRaw = Array.isArray(src.assetTypes) ? src.assetTypes : null;
    const assetTypes = assetTypesRaw
        ? assetTypesRaw
            .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
            .filter((t) => OPENING_ASSET_TYPES.includes(t))
        : ['window'];
    return {
        layerIds: layerIds && layerIds.length ? layerIds : null,
        assetTypes: assetTypes.length ? assetTypes : ['window'],
        // 1-based floor within the layer; ground-floor windows rarely carry
        // AC units in the references, but 1 keeps the default unopinionated.
        minFloor: clampInt(src.minFloor, 1, 99, 1)
    };
}

function normalizeAcUnitItem(src, index) {
    return {
        id: typeof src.id === 'string' && src.id ? src.id : `attachment_${index + 1}`,
        type: FACADE_ATTACHMENT_TYPE.AC_UNIT,
        probability: clamp(src.probability, 0.0, 1.0, 0.3),
        seedOffset: clampInt(src.seedOffset, -99999, 99999, 0),
        eligibility: normalizeEligibility(src.eligibility),
        unit: {
            widthMeters: clamp(src.unit?.widthMeters, 0.3, 1.4, 0.66),
            heightMeters: clamp(src.unit?.heightMeters, 0.2, 0.9, 0.42),
            depthMeters: clamp(src.unit?.depthMeters, 0.2, 0.9, 0.52),
            tiltDegrees: clamp(src.unit?.tiltDegrees, 0.0, 12.0, 4.0)
        },
        colorHex: normalizeHex(src.colorHex, 0xdadcda),
        roughness: clamp(src.roughness, 0.0, 1.0, 0.55),
        metalness: clamp(src.metalness, 0.0, 1.0, 0.3)
    };
}

function normalizeFireEscapeItem(src, index) {
    const targetSrc = src.target && typeof src.target === 'object' ? src.target : {};
    const faceIdRaw = typeof targetSrc.faceId === 'string' ? targetSrc.faceId.trim().toUpperCase() : '';
    const floorsSrc = src.floors && typeof src.floors === 'object' ? src.floors : {};
    const start = clampInt(floorsSrc.start, 1, 99, 1);
    const endRaw = Number(floorsSrc.end);
    return {
        id: typeof src.id === 'string' && src.id ? src.id : `attachment_${index + 1}`,
        type: FACADE_ATTACHMENT_TYPE.FIRE_ESCAPE,
        target: {
            layerId: typeof targetSrc.layerId === 'string' && targetSrc.layerId ? targetSrc.layerId : null,
            faceId: isFaceId(faceIdRaw) ? faceIdRaw : 'A',
            bayId: typeof targetSrc.bayId === 'string' ? targetSrc.bayId : ''
        },
        floors: {
            start,
            end: Number.isFinite(endRaw) && endRaw > 0 ? clampInt(endRaw, start, 99, start) : 0
        },
        sideOffsetMeters: clamp(src.sideOffsetMeters, -8.0, 8.0, 0.0),
        platform: {
            widthMeters: clamp(src.platform?.widthMeters, 1.2, 4.5, 2.6),
            depthMeters: clamp(src.platform?.depthMeters, 0.5, 1.6, 0.95)
        },
        stairWidthMeters: clamp(src.stairWidthMeters, 0.4, 1.2, 0.72),
        railingHeightMeters: clamp(src.railingHeightMeters, 0.6, 1.4, 1.0),
        colorHex: normalizeHex(src.colorHex, 0x1b1d1f),
        roughness: clamp(src.roughness, 0.0, 1.0, 0.6),
        metalness: clamp(src.metalness, 0.0, 1.0, 0.7),
        dropLadder: {
            enabled: src.dropLadder?.enabled !== false,
            bottomClearanceMeters: clamp(src.dropLadder?.bottomClearanceMeters, 0.5, 5.0, 2.2)
        }
    };
}

/**
 * Normalizes a building-level attachments config: `{ items: [...] }` (or a
 * bare array). Unknown types are dropped. Returns null when nothing survives.
 */
export function normalizeFacadeAttachmentsConfig(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;
    const rawItems = Array.isArray(src) ? src : (Array.isArray(src.items) ? src.items : []);
    const items = [];
    for (let i = 0; i < rawItems.length && items.length < 32; i++) {
        const item = rawItems[i];
        if (!item || typeof item !== 'object' || item.enabled === false) continue;
        const type = typeof item.type === 'string' ? item.type.trim().toLowerCase() : '';
        if (type === FACADE_ATTACHMENT_TYPE.AC_UNIT) items.push(normalizeAcUnitItem(item, i));
        else if (type === FACADE_ATTACHMENT_TYPE.FIRE_ESCAPE) items.push(normalizeFireEscapeItem(item, i));
    }
    return items.length ? { items } : null;
}

/**
 * Scatter decision for one opening instance. `instanceKey` must be stable
 * across rebuilds (layer id + floor + bay/segment + point index).
 */
export function shouldPlaceAcUnit({ seed, instanceKey, probability, seedOffset = 0 } = {}) {
    const p = clamp(probability, 0.0, 1.0, 0.0);
    if (!(p > 0)) return false;
    return hashAttachmentKeyToUnit(seed, instanceKey, seedOffset) < p;
}
