// src/app/city/placement/internal/ParcelSolver.js
// Turns "these squares, up to these limits" into a parcel rectangle, keeps it
// clear of neighbours and reservations, and seats a design inside it.
//
// A parcel is a rectangle: the bounds of the assigned squares with each side
// moved to its declared limit. Neighbours and reservations then CUT the
// rectangle (the cut that keeps the most parcel, never the front side while
// another cut works), and the design is seated flush against the front limit
// at its authored size — a design is never scaled to fit.
// @ts-check

import { PARCEL_ALIGN, PARCEL_LIMIT, PARCEL_SIDES } from '../types.js';

const EPS = 1e-6;

export function rectFromSquares(squares, map) {
    const list = Array.isArray(squares) ? squares : [];
    if (!list.length || !map?.tileToWorldCenter) return null;
    const half = (Number(map.tileSize) || 0) * 0.5;
    if (!(half > 0)) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, y] of list) {
        const c = map.tileToWorldCenter(x | 0, y | 0);
        if (!c) continue;
        minX = Math.min(minX, c.x - half);
        maxX = Math.max(maxX, c.x + half);
        minZ = Math.min(minZ, c.z - half);
        maxZ = Math.max(maxZ, c.z + half);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return null;
    return { minX, maxX, minZ, maxZ };
}

export function rectFromLoops(loops) {
    const list = Array.isArray(loops) ? loops : [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const loop of list) {
        for (const p of (Array.isArray(loop) ? loop : [])) {
            const x = Number(p?.x);
            const z = Number(p?.z);
            if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return null;
    return { minX, maxX, minZ, maxZ };
}

export function rectFromCenterSize(center, size) {
    const hw = Math.max(0, Number(size?.width) || 0) * 0.5;
    const hd = Math.max(0, Number(size?.depth) || 0) * 0.5;
    return {
        minX: center.x - hw,
        maxX: center.x + hw,
        minZ: center.z - hd,
        maxZ: center.z + hd
    };
}

export function rectToLoop(rect) {
    return [
        { x: rect.minX, z: rect.minZ },
        { x: rect.maxX, z: rect.minZ },
        { x: rect.maxX, z: rect.maxZ },
        { x: rect.minX, z: rect.maxZ }
    ];
}

export function rectCenter(rect) {
    return { x: (rect.minX + rect.maxX) * 0.5, z: (rect.minZ + rect.maxZ) * 0.5 };
}

export function rectWidth(rect) { return rect.maxX - rect.minX; }
export function rectDepth(rect) { return rect.maxZ - rect.minZ; }
export function rectArea(rect) { return Math.max(0, rectWidth(rect)) * Math.max(0, rectDepth(rect)); }

export function rectsOverlap(a, b, gap = 0) {
    return a.minX < b.maxX + gap - EPS
        && a.maxX > b.minX - gap + EPS
        && a.minZ < b.maxZ + gap - EPS
        && a.maxZ > b.minZ - gap + EPS;
}

function sideCoordinate(rect, side) {
    if (side === 'north') return rect.maxZ;
    if (side === 'south') return rect.minZ;
    if (side === 'east') return rect.maxX;
    return rect.minX;
}

function withSideCoordinate(rect, side, value) {
    if (side === 'north') return { ...rect, maxZ: value };
    if (side === 'south') return { ...rect, minZ: value };
    if (side === 'east') return { ...rect, maxX: value };
    return { ...rect, minX: value };
}

function outwardSign(side) {
    return (side === 'north' || side === 'east') ? 1 : -1;
}

// The neighbour boundary that faces this side.
function facingCoordinate(extent, side) {
    if (side === 'north') return extent.minZ;
    if (side === 'south') return extent.maxZ;
    if (side === 'east') return extent.minX;
    return extent.maxX;
}

/**
 * Applies a construction's declared limits to the bounds of its squares.
 *
 * @param {object} input
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} input.base
 * @param {Record<string, object>} input.limits
 * @param {(side:string, rect:object)=>(number|null)} input.streetOffsetFor
 * @param {(id:string)=>(object|null)} input.extentOf
 * @param {(entry:object)=>void} input.report
 */
export function applyParcelLimits({ base, limits, streetOffsetFor, extentOf, report }) {
    let rect = { ...base };
    const resolved = {};

    for (const side of PARCEL_SIDES) {
        const limit = limits?.[side] ?? null;
        if (!limit || limit.type === PARCEL_LIMIT.SQUARE) {
            resolved[side] = { type: PARCEL_LIMIT.SQUARE, coordinate: sideCoordinate(base, side) };
            continue;
        }

        const sign = outwardSign(side);

        if (limit.type === PARCEL_LIMIT.DISTANCE) {
            const coordinate = sideCoordinate(base, side) + sign * limit.meters;
            rect = withSideCoordinate(rect, side, coordinate);
            resolved[side] = { type: limit.type, meters: limit.meters, coordinate };
            continue;
        }

        if (limit.type === PARCEL_LIMIT.STREET) {
            const offset = streetOffsetFor(side, base);
            if (offset === null) {
                resolved[side] = { type: limit.type, coordinate: sideCoordinate(base, side), unresolved: true };
                report({ code: 'no_street_limit', side });
                continue;
            }
            const coordinate = sideCoordinate(base, side) + sign * (offset - limit.padding);
            rect = withSideCoordinate(rect, side, coordinate);
            resolved[side] = { type: limit.type, coordinate };
            continue;
        }

        if (limit.type === PARCEL_LIMIT.CONSTRUCTION) {
            const extent = extentOf(limit.id);
            if (!extent) {
                resolved[side] = { type: limit.type, id: limit.id, coordinate: sideCoordinate(base, side), unresolved: true };
                report({ code: 'unknown_construction', side, refId: limit.id });
                continue;
            }
            const coordinate = facingCoordinate(extent, side) - sign * limit.padding;
            rect = withSideCoordinate(rect, side, coordinate);
            resolved[side] = { type: limit.type, id: limit.id, padding: limit.padding, coordinate };
            continue;
        }
    }

    return { rect, resolved };
}

/**
 * Cuts a parcel so it keeps `gap` metres clear of one blocking extent. The cut
 * that leaves the most parcel wins; the front side is only cut when no other
 * cut leaves a usable parcel, so a street frontage is never traded away.
 */
export function cutRectClearOf({ rect, blocker, gap, front = null, requiredSize = null }) {
    const blocked = {
        minX: blocker.minX - gap,
        maxX: blocker.maxX + gap,
        minZ: blocker.minZ - gap,
        maxZ: blocker.maxZ + gap
    };
    if (!rectsOverlap(rect, blocked)) return { rect, cut: null };

    const candidates = [
        { side: 'west', rect: { ...rect, minX: blocked.maxX } },
        { side: 'east', rect: { ...rect, maxX: blocked.minX } },
        { side: 'south', rect: { ...rect, minZ: blocked.maxZ } },
        { side: 'north', rect: { ...rect, maxZ: blocked.minZ } }
    ].filter((c) => rectWidth(c.rect) > EPS && rectDepth(c.rect) > EPS);

    if (!candidates.length) return { rect, cut: null, blocked: true };

    const fitsRequired = (r) => !requiredSize
        || (rectWidth(r) >= requiredSize.width - EPS && rectDepth(r) >= requiredSize.depth - EPS);

    const score = (c) => {
        let s = rectArea(c.rect);
        if (fitsRequired(c.rect)) s += 1e6;
        if (front && c.side === front) s -= 5e5;
        return s;
    };

    let best = candidates[0];
    for (const c of candidates) {
        if (score(c) > score(best)) best = c;
    }
    return { rect: best.rect, cut: best.side, blocked: false };
}

/**
 * Seats a design inside a parcel: flush against the front limit, aligned on
 * the cross axis, at its authored size. Never scaled; an overflow is reported
 * back so the caller can surface it.
 */
export function placeDesignInRect({ designLoops, rect, front, align }) {
    const design = rectFromLoops(designLoops);
    if (!design) return null;

    const width = design.maxX - design.minX;
    const depth = design.maxZ - design.minZ;

    const alignSpan = (min, max, size, mode) => {
        if (size >= max - min) return min;
        if (mode === PARCEL_ALIGN.MIN) return min;
        if (mode === PARCEL_ALIGN.MAX) return max - size;
        return (min + max) * 0.5 - size * 0.5;
    };

    let targetMinX;
    let targetMinZ;

    if (front === 'north') {
        targetMinZ = rect.maxZ - depth;
        targetMinX = alignSpan(rect.minX, rect.maxX, width, align);
    } else if (front === 'south') {
        targetMinZ = rect.minZ;
        targetMinX = alignSpan(rect.minX, rect.maxX, width, align);
    } else if (front === 'east') {
        targetMinX = rect.maxX - width;
        targetMinZ = alignSpan(rect.minZ, rect.maxZ, depth, align);
    } else if (front === 'west') {
        targetMinX = rect.minX;
        targetMinZ = alignSpan(rect.minZ, rect.maxZ, depth, align);
    } else {
        targetMinX = alignSpan(rect.minX, rect.maxX, width, align);
        targetMinZ = alignSpan(rect.minZ, rect.maxZ, depth, align);
    }

    const dx = targetMinX - design.minX;
    const dz = targetMinZ - design.minZ;
    const loops = designLoops.map((loop) => loop.map((p) => ({ x: p.x + dx, z: p.z + dz })));

    const bounds = {
        minX: design.minX + dx,
        maxX: design.maxX + dx,
        minZ: design.minZ + dz,
        maxZ: design.maxZ + dz
    };

    return {
        loops,
        bounds,
        size: { width, depth },
        overflow: {
            x: Math.max(0, width - rectWidth(rect)),
            z: Math.max(0, depth - rectDepth(rect))
        }
    };
}
