// src/app/city/placement/CityConstructionPlanner.js
// Plans where every city construction actually sits.
//
// A construction declares the squares it is assigned and the limits it may
// extend up to (the kerb line, a neighbour, an explicit distance). The planner
// turns that into a parcel, cuts the parcel clear of neighbours and of
// reservations (non-building constructions with a fixed size and a precise
// location), and seats the design inside at its authored size. Undeclared
// square sharing and parcels that cannot take their design are reported
// instead of being papered over.
// @ts-check

import {
    PARCEL_LIMIT,
    PLACEMENT_DEFAULTS,
    PLACEMENT_DIAGNOSTIC,
    CONSTRUCTION_KIND,
    RESERVATION_GROUND
} from './types.js';
import { buildStreetBands, computeStreetOffset } from './internal/StreetLines.js';
import { normalizePlacement, normalizeReservationSpec, normalizeSharedWith, normalizeSquares } from './internal/ConstructionSpec.js';
import {
    applyParcelLimits,
    cutRectClearOf,
    placeDesignInRect,
    rectArea,
    rectCenter,
    rectFromCenterSize,
    rectFromLoops,
    rectFromSquares,
    rectToLoop,
    rectsOverlap
} from './internal/ParcelSolver.js';

function overlapArea(a, b) {
    const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const d = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
    return (w > 0 && d > 0) ? w * d : 0;
}

function squareKey(x, y) {
    return `${x},${y}`;
}

function collectSquareConflicts(entries) {
    const bySquare = new Map();
    for (const entry of entries) {
        for (const [x, y] of entry.squares) {
            const key = squareKey(x, y);
            let bucket = bySquare.get(key);
            if (!bucket) {
                bucket = [];
                bySquare.set(key, bucket);
            }
            bucket.push(entry);
        }
    }

    const conflicts = [];
    const reported = new Set();
    for (const [key, bucket] of bySquare) {
        if (bucket.length < 2) continue;
        for (let i = 0; i < bucket.length; i++) {
            for (let j = i + 1; j < bucket.length; j++) {
                const a = bucket[i];
                const b = bucket[j];
                const declared = a.sharedWith.includes(b.id) || b.sharedWith.includes(a.id);
                if (declared) continue;
                const pairKey = `${a.id}|${b.id}`;
                if (reported.has(pairKey)) continue;
                reported.add(pairKey);
                conflicts.push({ a: a.id, b: b.id, square: key });
            }
        }
    }
    return conflicts;
}

/**
 * @param {object} input
 * @param {object} input.map CityMap (tile grid + road segments)
 * @param {Array<object>} [input.buildings] normalized building placements
 * @param {Array<object>} [input.reservations] raw reservation entries from the spec
 * @param {object} [input.roadGeometry] lane width / shoulder / curb / sidewalk
 */
export function planCityConstructions({
    map,
    buildings = [],
    reservations = [],
    roadGeometry = null
} = {}) {
    /** @type {Array<{level:string, code:string, id:(string|null), message:string}>} */
    const diagnostics = [];
    const report = (level, code, id, message) => diagnostics.push({ level, code, id, message });

    const bands = buildStreetBands({ map, roadGeometry });
    const streetOffsetFor = (side, rect) => computeStreetOffset({
        bands,
        side,
        rect,
        maxSearchMeters: PLACEMENT_DEFAULTS.streetSearchMeters,
        sampleCount: PLACEMENT_DEFAULTS.streetSampleCount
    });

    const specDiagnostics = [];
    const entries = [];

    for (let i = 0; i < reservations.length; i++) {
        const spec = normalizeReservationSpec(reservations[i], i, specDiagnostics);
        if (!spec) continue;
        const squareRect = rectFromSquares(spec.squares, map);
        entries.push({
            kind: CONSTRUCTION_KIND.RESERVATION,
            id: spec.id,
            spec,
            squares: spec.squares,
            sharedWith: spec.sharedWith,
            placement: spec.placement,
            designLoops: null,
            extent: spec.position ? rectFromCenterSize(spec.position, spec.size) : squareRect,
            resolved: false,
            parcel: null
        });
    }

    for (const building of buildings) {
        const id = typeof building?.id === 'string' ? building.id : null;
        if (!id) continue;
        const squares = normalizeSquares(building.squares);
        const placement = normalizePlacement(building.placement, { id, diagnostics: specDiagnostics });
        const worldLoops = Array.isArray(building.worldFootprintLoops) && building.worldFootprintLoops.length
            ? building.worldFootprintLoops
            : null;
        if (placement && worldLoops) {
            specDiagnostics.push({
                id,
                message: 'Entry has both a placement block and authored world footprintLoops; the parcel placement wins and the world loops are ignored.'
            });
        }
        entries.push({
            kind: CONSTRUCTION_KIND.BUILDING,
            id,
            spec: building,
            squares,
            sharedWith: normalizeSharedWith(building.sharedWith),
            placement,
            designLoops: Array.isArray(building.designLoops) && building.designLoops.length ? building.designLoops : null,
            extent: (worldLoops && !placement) ? rectFromLoops(worldLoops) : rectFromSquares(squares, map),
            resolved: !placement,
            parcel: null
        });
    }

    for (const entry of specDiagnostics) {
        report('error', PLACEMENT_DIAGNOSTIC.INVALID_PLACEMENT, entry.id ?? null, entry.message);
    }

    for (const conflict of collectSquareConflicts(entries)) {
        report(
            'warn',
            PLACEMENT_DIAGNOSTIC.SQUARE_CONFLICT,
            conflict.a,
            `Square ${conflict.square} is claimed by both "${conflict.a}" and "${conflict.b}" without either declaring the share (sharesSquaresWith).`
        );
    }

    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const extentOf = (id) => byId.get(id)?.extent ?? null;

    const resolveEntry = (entry, visiting) => {
        if (entry.resolved) return;
        if (visiting.has(entry.id)) {
            report('warn', PLACEMENT_DIAGNOSTIC.LIMIT_CYCLE, entry.id, `Parcel limits form a cycle through "${entry.id}"; it was resolved against the neighbour bounds known so far.`);
            return;
        }
        visiting.add(entry.id);

        // Resolve neighbours this parcel measures itself against first.
        for (const limit of Object.values(entry.placement?.limits ?? {})) {
            if (limit.type !== PARCEL_LIMIT.CONSTRUCTION) continue;
            const dep = byId.get(limit.id);
            if (dep && !dep.resolved) resolveEntry(dep, visiting);
        }

        const isReservation = entry.kind === CONSTRUCTION_KIND.RESERVATION;
        const size = isReservation ? entry.spec.size : null;

        if (isReservation && entry.spec.position) {
            const rect = rectFromCenterSize(
                { x: entry.spec.position.x + entry.spec.offset.x, z: entry.spec.position.z + entry.spec.offset.z },
                size
            );
            entry.extent = rect;
            entry.placed = { loops: [rectToLoop(rect)], bounds: rect };
            entry.resolved = true;
            visiting.delete(entry.id);
            return;
        }

        const base = rectFromSquares(entry.squares, map);
        if (!base) {
            report('error', PLACEMENT_DIAGNOSTIC.PARCEL_EMPTY, entry.id, 'No assigned squares resolve to map tiles; placement skipped.');
            entry.resolved = true;
            visiting.delete(entry.id);
            return;
        }

        const limitResult = applyParcelLimits({
            base,
            limits: entry.placement?.limits ?? {},
            streetOffsetFor,
            extentOf,
            report: (issue) => {
                if (issue.code === 'no_street_limit') {
                    report('warn', PLACEMENT_DIAGNOSTIC.NO_STREET_LIMIT, entry.id, `No street found off the ${issue.side} side; that side kept its square boundary.`);
                    return;
                }
                report('warn', PLACEMENT_DIAGNOSTIC.UNKNOWN_CONSTRUCTION, entry.id, `Limit on the ${issue.side} side references unknown construction "${issue.refId}"; that side kept its square boundary.`);
            }
        });

        let rect = limitResult.rect;
        const padding = entry.placement?.padding ?? PLACEMENT_DEFAULTS.padding;
        const front = entry.placement?.front ?? null;

        const designRect = isReservation
            ? { minX: 0, maxX: size.width, minZ: 0, maxZ: size.depth }
            : (entry.designLoops ? rectFromLoops(entry.designLoops) : null);
        const requiredSize = designRect
            ? { width: designRect.maxX - designRect.minX, depth: designRect.maxZ - designRect.minZ }
            : null;

        const blockers = entries
            .filter((other) => other !== entry && other.extent)
            .map((other) => ({ other, area: overlapArea(rect, other.extent) }))
            .filter((item) => item.area > 0 || rectsOverlap(rect, item.other.extent, padding))
            .sort((a, b) => b.area - a.area);

        for (const { other } of blockers) {
            const gap = Math.max(padding, other.kind === CONSTRUCTION_KIND.RESERVATION ? (other.spec.clearance ?? 0) : 0);
            const result = cutRectClearOf({ rect, blocker: other.extent, gap, front, requiredSize });
            if (result.blocked) {
                report(
                    'warn',
                    other.kind === CONSTRUCTION_KIND.RESERVATION ? PLACEMENT_DIAGNOSTIC.RESERVATION_BLOCKED : PLACEMENT_DIAGNOSTIC.PARCEL_EMPTY,
                    entry.id,
                    `Parcel cannot be cut clear of "${other.id}"; it was left overlapping.`
                );
                continue;
            }
            rect = result.rect;
        }

        const designLoops = isReservation
            ? [rectToLoop({ minX: 0, maxX: size.width, minZ: 0, maxZ: size.depth })]
            : (entry.designLoops ?? [rectToLoop(rect)]);

        const placed = placeDesignInRect({
            designLoops,
            rect,
            front,
            align: entry.placement?.align ?? PLACEMENT_DEFAULTS.align
        });

        if (!placed) {
            report('error', PLACEMENT_DIAGNOSTIC.PARCEL_EMPTY, entry.id, 'Design footprint is empty; placement skipped.');
            entry.resolved = true;
            visiting.delete(entry.id);
            return;
        }

        if (placed.overflow.x > 1e-3 || placed.overflow.z > 1e-3) {
            report(
                'warn',
                PLACEMENT_DIAGNOSTIC.DESIGN_OVERFLOW,
                entry.id,
                `Design ${placed.size.width.toFixed(2)}x${placed.size.depth.toFixed(2)}m overflows its parcel by `
                + `${placed.overflow.x.toFixed(2)}x${placed.overflow.z.toFixed(2)}m; it was seated against the ${front ?? 'centre'} limit at its authored size (never scaled).`
            );
        }

        entry.parcel = {
            rect,
            loops: [rectToLoop(rect)],
            squares: entry.squares.map((s) => [s[0], s[1]]),
            limits: limitResult.resolved,
            front,
            align: entry.placement?.align ?? PLACEMENT_DEFAULTS.align,
            padding,
            area: rectArea(rect)
        };
        entry.placed = placed;
        entry.extent = placed.bounds;
        entry.resolved = true;
        visiting.delete(entry.id);
    };

    for (const entry of entries) {
        if (entry.kind !== CONSTRUCTION_KIND.RESERVATION) continue;
        resolveEntry(entry, new Set());
    }
    for (const entry of entries) {
        if (entry.kind !== CONSTRUCTION_KIND.BUILDING) continue;
        resolveEntry(entry, new Set());
    }

    // Reservations are keep-out for every building, including the ones that
    // still place themselves from tiles alone: those cannot be laid out
    // around a reservation, so an overlap is reported instead.
    const resolvedReservations = entries.filter((entry) => entry.kind === CONSTRUCTION_KIND.RESERVATION);
    for (const entry of entries) {
        if (entry.kind !== CONSTRUCTION_KIND.BUILDING || entry.placement || !entry.extent) continue;
        for (const reservation of resolvedReservations) {
            if (!reservation.extent || !rectsOverlap(entry.extent, reservation.extent)) continue;
            report(
                'warn',
                PLACEMENT_DIAGNOSTIC.RESERVATION_BLOCKED,
                entry.id,
                `Overlaps reservation "${reservation.id}". Give it a placement block (squares + limits) so it is laid out around the reservation.`
            );
        }
    }

    const placements = new Map();
    for (const entry of entries) {
        if (entry.kind !== CONSTRUCTION_KIND.BUILDING || !entry.parcel) continue;
        placements.set(entry.id, {
            footprintLoops: entry.placed.loops,
            parcel: entry.parcel
        });
    }

    const outReservations = resolvedReservations
        .filter((entry) => entry.placed)
        .map((entry) => ({
            id: entry.id,
            type: entry.spec.type,
            position: rectCenter(entry.placed.bounds),
            yawDeg: entry.spec.yawDeg,
            size: { width: entry.spec.size.width, depth: entry.spec.size.depth },
            clearance: entry.spec.clearance,
            ground: entry.spec.ground ?? RESERVATION_GROUND.NONE,
            squares: entry.squares.map((s) => [s[0], s[1]]),
            sharesSquaresWith: entry.sharedWith.slice(),
            rect: { ...entry.placed.bounds },
            loops: entry.placed.loops,
            parcel: entry.parcel
        }));

    return { placements, reservations: outReservations, diagnostics };
}

export function findReservationByType(reservations, type) {
    const list = Array.isArray(reservations) ? reservations : [];
    return list.find((entry) => entry?.type === type) ?? null;
}
