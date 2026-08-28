// src/app/city/placement/internal/ConstructionSpec.js
// Normalizes spec-authored construction placements (assigned squares, parcel
// limits, padding, deliberate square sharing) into one validated shape the
// parcel solver can run on.
// @ts-check

import {
    PARCEL_ALIGN,
    PARCEL_LIMIT,
    PARCEL_SIDES,
    PLACEMENT_DEFAULTS,
    RESERVATION_GROUND,
    RESERVATION_TYPE,
    isParcelSide
} from '../types.js';

function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export function normalizeSquares(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    const seen = new Set();
    for (const entry of list) {
        let x = null;
        let y = null;
        if (Array.isArray(entry) && entry.length >= 2) {
            x = entry[0];
            y = entry[1];
        } else if (entry && Number.isFinite(entry.x) && Number.isFinite(entry.y)) {
            x = entry.x;
            y = entry.y;
        }
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const key = `${x | 0},${y | 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([x | 0, y | 0]);
    }
    return out;
}

function normalizeLimit(raw, { id, side, diagnostics }) {
    if (raw === null || raw === undefined) return null;

    if (typeof raw === 'string') {
        const type = raw.trim().toLowerCase();
        if (type === PARCEL_LIMIT.SQUARE || type === PARCEL_LIMIT.STREET) return { type, padding: 0 };
        diagnostics.push({ id, side, message: `Unknown parcel limit "${raw}".` });
        return null;
    }

    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return { type: PARCEL_LIMIT.DISTANCE, meters: raw, padding: 0 };
    }

    if (!raw || typeof raw !== 'object') {
        diagnostics.push({ id, side, message: 'Parcel limit must be a string, a number or an object.' });
        return null;
    }

    const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
    const padding = Math.max(0, num(raw.padding, 0));

    if (type === PARCEL_LIMIT.SQUARE) return { type, padding };
    if (type === PARCEL_LIMIT.STREET) return { type, padding };
    if (type === PARCEL_LIMIT.DISTANCE) {
        const meters = num(raw.meters, null);
        if (meters === null) {
            diagnostics.push({ id, side, message: 'A distance limit needs a finite "meters".' });
            return null;
        }
        return { type, meters, padding };
    }
    if (type === PARCEL_LIMIT.CONSTRUCTION) {
        const refId = typeof raw.id === 'string' && raw.id ? raw.id : null;
        if (!refId) {
            diagnostics.push({ id, side, message: 'A construction limit needs the neighbour "id".' });
            return null;
        }
        return { type, id: refId, padding };
    }

    diagnostics.push({ id, side, message: `Unknown parcel limit type "${raw.type}".` });
    return null;
}

/**
 * @returns {{ limits: Record<string, object>, padding: number, front: (string|null), align: string }|null}
 */
export function normalizePlacement(raw, { id, diagnostics }) {
    if (!raw || typeof raw !== 'object') return null;

    const limits = {};
    const limitsRaw = (raw.limits && typeof raw.limits === 'object') ? raw.limits : {};
    for (const [key, value] of Object.entries(limitsRaw)) {
        const side = typeof key === 'string' ? key.trim().toLowerCase() : '';
        if (!isParcelSide(side)) {
            diagnostics.push({ id, side: key, message: `Unknown parcel side "${key}" (use ${PARCEL_SIDES.join('/')}).` });
            continue;
        }
        const limit = normalizeLimit(value, { id, side, diagnostics });
        if (limit) limits[side] = limit;
    }

    const frontRaw = typeof raw.front === 'string' ? raw.front.trim().toLowerCase() : '';
    let front = isParcelSide(frontRaw) ? frontRaw : null;
    if (frontRaw && !front) diagnostics.push({ id, side: frontRaw, message: `Unknown front side "${raw.front}".` });
    // Default front: the single side that is limited by the street.
    if (!front) {
        const streetSides = PARCEL_SIDES.filter((side) => limits[side]?.type === PARCEL_LIMIT.STREET);
        if (streetSides.length === 1) front = streetSides[0];
    }

    const alignRaw = typeof raw.align === 'string' ? raw.align.trim().toLowerCase() : '';
    const align = Object.values(PARCEL_ALIGN).includes(alignRaw) ? alignRaw : PLACEMENT_DEFAULTS.align;

    return {
        limits,
        padding: Math.max(0, num(raw.padding, PLACEMENT_DEFAULTS.padding)),
        front,
        align
    };
}

export function normalizeSharedWith(raw) {
    const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : []);
    const out = [];
    for (const entry of list) {
        if (typeof entry !== 'string' || !entry) continue;
        if (!out.includes(entry)) out.push(entry);
    }
    return out;
}

export function normalizeReservationSpec(raw, index, diagnostics) {
    if (!raw || typeof raw !== 'object') return null;

    const id = (typeof raw.id === 'string' && raw.id) ? raw.id : `reservation_${index + 1}`;
    const typeRaw = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
    const type = Object.values(RESERVATION_TYPE).includes(typeRaw) ? typeRaw : RESERVATION_TYPE.AREA;

    const width = Math.max(0.1, num(raw.size?.width, 0));
    const depth = Math.max(0.1, num(raw.size?.depth, 0));
    if (!(width > 0.1) || !(depth > 0.1)) {
        diagnostics.push({ id, message: 'Reservation needs a size { width, depth } in metres.' });
        return null;
    }

    const groundRaw = typeof raw.ground === 'string'
        ? raw.ground.trim().toLowerCase()
        : (typeof raw.ground?.treatment === 'string' ? raw.ground.treatment.trim().toLowerCase() : '');
    const ground = Object.values(RESERVATION_GROUND).includes(groundRaw) ? groundRaw : RESERVATION_GROUND.NONE;

    const position = (raw.position && Number.isFinite(raw.position.x) && Number.isFinite(raw.position.z))
        ? { x: Number(raw.position.x), z: Number(raw.position.z) }
        : null;

    const squares = normalizeSquares(raw.squares ?? raw.tiles);
    const placement = normalizePlacement(raw.placement, { id, diagnostics });

    if (!position && !squares.length) {
        diagnostics.push({ id, message: 'Reservation needs either a world position or assigned squares.' });
        return null;
    }

    return {
        id,
        type,
        size: { width, depth },
        yawDeg: num(raw.yawDeg, 0),
        clearance: Math.max(0, num(raw.clearance, 0)),
        offset: { x: num(raw.offset?.x, 0), z: num(raw.offset?.z, 0) },
        position,
        squares,
        placement,
        sharedWith: normalizeSharedWith(raw.sharesSquaresWith ?? raw.sharedWith),
        ground
    };
}

export { PLACEMENT_DEFAULTS };
