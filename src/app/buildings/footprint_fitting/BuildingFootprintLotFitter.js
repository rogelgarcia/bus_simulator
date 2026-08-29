// Fits authored building plans to lot polygons by applying only valid AI 514 stretch bands.
// @ts-check

import {
    createFootprintPlan,
    getFootprintRunFrame,
    inspectStretchHandles,
    stretchFootprint
} from '../footprint_edits/BuildingFootprintEdits.js';

const EPSILON = 1e-6;
const DEFAULT_QUANTUM_METERS = 0.1;
const AXES = Object.freeze(['x', 'z']);
const PREFER_EXPAND = 'prefer_expand';
const ALLOW = 'allow';
const NEVER = 'never';

/** @typedef {'prefer_expand'|'allow'|'never'} StretchPreference */
/** @typedef {{preference?:StretchPreference, weight?:number}} StretchBandMetadata */
/** @typedef {{faces?:Record<string, StretchPreference|StretchBandMetadata>, bands?:Record<string, StretchPreference|StretchBandMetadata>, quantumMeters?:number}} FootprintStretchMetadata */

function clonePoint(point) {
    return { x: Number(point?.x), z: Number(point?.z) };
}

function normalizeLoop(rawLoop) {
    const source = Array.isArray(rawLoop) ? rawLoop : [];
    const loop = source
        .map((point) => clonePoint(point))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
    if (loop.length > 3) {
        const first = loop[0];
        const last = loop[loop.length - 1];
        if (Math.hypot(first.x - last.x, first.z - last.z) <= EPSILON) loop.pop();
    }
    return loop.length >= 3 ? loop : null;
}

function normalizeAreaLoops(buildAreaLoops) {
    const source = Array.isArray(buildAreaLoops) ? buildAreaLoops : [];
    if (!source.length) return [];
    const looksLikePoint = Number.isFinite(Number(source[0]?.x ?? source[0]?.[0]));
    const rawLoops = looksLikePoint ? [source] : source;
    return rawLoops.map((loop) => normalizeLoop(loop)).filter(Boolean);
}

function computeBounds(points) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const point of points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
    }
    return { minX, maxX, minZ, maxZ };
}

function cross2(a, b, c) {
    return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function pointOnSegment(point, a, b) {
    if (Math.abs(cross2(a, b, point)) > EPSILON) return false;
    return point.x >= Math.min(a.x, b.x) - EPSILON
        && point.x <= Math.max(a.x, b.x) + EPSILON
        && point.z >= Math.min(a.z, b.z) - EPSILON
        && point.z <= Math.max(a.z, b.z) + EPSILON;
}

function pointInLoop(point, loop) {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const a = loop[i];
        const b = loop[j];
        if (pointOnSegment(point, a, b)) return true;
        const crosses = ((a.z > point.z) !== (b.z > point.z))
            && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
        if (crosses) inside = !inside;
    }
    return inside;
}

function footprintInsideArea(plan, areaLoops) {
    const outer = areaLoops[0];
    const holes = areaLoops.slice(1);
    for (let i = 0; i < plan.points.length; i++) {
        const a = plan.points[i];
        const b = plan.points[(i + 1) % plan.points.length];
        const samples = [a, { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 }];
        for (const sample of samples) {
            if (!pointInLoop(sample, outer)) return false;
            if (holes.some((hole) => pointInLoop(sample, hole))) return false;
        }
    }
    return true;
}

function normalizePreference(value) {
    if (value === PREFER_EXPAND || value === NEVER) return value;
    return ALLOW;
}

function normalizeBandMetadata(value) {
    if (typeof value === 'string') return { preference: normalizePreference(value), weight: null, explicit: true };
    if (!value || typeof value !== 'object') return { preference: ALLOW, weight: null, explicit: false };
    const weight = Number(value.weight);
    return {
        preference: normalizePreference(value.preference),
        weight: Number.isFinite(weight) && weight > 0 ? weight : null,
        explicit: value.preference !== undefined || value.weight !== undefined
    };
}

function metadataForBand(metadata, faceId, end) {
    const direct = metadata?.bands?.[`${faceId}:${end}`];
    if (direct !== undefined) return normalizeBandMetadata(direct);
    const face = metadata?.faces?.[faceId];
    return normalizeBandMetadata(face);
}

function hashSeed(value) {
    const text = String(value ?? '0');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function stableBandRank(seed, key) {
    return hashSeed(`${seed}:${key}`);
}

function bandSegmentLength(cut) {
    return cut.segments.reduce((sum, segment) => (
        sum + Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z)
    ), 0);
}

function enumerateBands(plan, axis, metadata, seed) {
    const grouped = new Map();
    for (const faceId of plan.runIds) {
        const frame = getFootprintRunFrame(plan, faceId);
        const component = Math.abs(frame.tangent[axis]);
        const other = Math.abs(frame.tangent[axis === 'x' ? 'z' : 'x']);
        if (component < Math.cos(0.5 * Math.PI / 180) || other > Math.sin(0.5 * Math.PI / 180)) continue;
        const handles = inspectStretchHandles(plan, faceId);
        for (const end of ['start', 'end']) {
            const cut = handles[end];
            if (!cut?.valid) continue;
            const direction = Math.sign(cut.translationDirection[axis]);
            if (!direction) continue;
            const coordinate = Number(cut.origin[axis]);
            const key = `${axis}:${direction}:${Math.round(coordinate * 10000)}`;
            const meta = metadataForBand(metadata, faceId, end);
            const candidate = {
                key,
                faceId,
                end,
                direction,
                coordinate,
                preference: meta.preference,
                explicit: meta.explicit,
                weight: meta.weight ?? Math.max(EPSILON, bandSegmentLength(cut))
            };
            const list = grouped.get(key) ?? [];
            list.push(candidate);
            grouped.set(key, list);
        }
    }

    const bands = [];
    for (const [key, aliases] of grouped) {
        aliases.sort((a, b) => a.faceId.localeCompare(b.faceId) || a.end.localeCompare(b.end));
        const explicit = aliases.filter((entry) => entry.explicit);
        const preference = explicit.some((entry) => entry.preference === NEVER)
            ? NEVER
            : (explicit.some((entry) => entry.preference === PREFER_EXPAND) ? PREFER_EXPAND : ALLOW);
        const weighted = aliases.filter((entry) => entry.explicit && Number.isFinite(entry.weight));
        bands.push({
            ...aliases[0],
            key,
            preference,
            weight: weighted.length
                ? Math.max(...weighted.map((entry) => entry.weight))
                : Math.max(...aliases.map((entry) => entry.weight)),
            rank: stableBandRank(seed, key)
        });
    }
    return bands.sort((a, b) => a.coordinate - b.coordinate || a.rank - b.rank || a.key.localeCompare(b.key));
}

function activeBandsForSide(bands, direction) {
    const eligible = bands.filter((band) => band.direction === direction && band.preference !== NEVER);
    const preferred = eligible.filter((band) => band.preference === PREFER_EXPAND);
    return preferred.length ? preferred : eligible;
}

function quantizeForFit(delta, quantum) {
    if (Math.abs(delta) <= EPSILON || !(quantum > EPSILON)) return delta;
    const magnitude = Math.abs(delta);
    const units = delta > 0
        ? Math.floor((magnitude + EPSILON) / quantum)
        : Math.ceil((magnitude - EPSILON) / quantum);
    return Math.sign(delta) * units * quantum;
}

function allocateWeighted(total, bands, quantum) {
    const weightSum = bands.reduce((sum, band) => sum + band.weight, 0);
    if (!(weightSum > EPSILON)) return bands.map(() => 0);
    if (!(quantum > EPSILON)) return bands.map((band) => total * band.weight / weightSum);
    const totalUnits = Math.round(Math.abs(total) / quantum);
    const sign = Math.sign(total);
    const rows = bands.map((band, index) => {
        const exact = totalUnits * band.weight / weightSum;
        const base = Math.floor(exact);
        return { index, units: base, remainder: exact - base, rank: band.rank };
    });
    let remaining = totalUnits - rows.reduce((sum, row) => sum + row.units, 0);
    rows.sort((a, b) => b.remainder - a.remainder || a.rank - b.rank || a.index - b.index);
    for (let i = 0; i < rows.length && remaining > 0; i++, remaining--) rows[i].units += 1;
    rows.sort((a, b) => a.index - b.index);
    return rows.map((row) => sign * row.units * quantum);
}

function tryStretch(plan, band, delta, minLengthByRunId, quantum, isFootprintSolvable) {
    let direct;
    try {
        direct = stretchFootprint(plan, {
            faceId: band.faceId,
            end: band.end,
            delta,
            minLengthByRunId
        });
    } catch {
        return null;
    }
    const directValid = typeof isFootprintSolvable !== 'function'
        || isFootprintSolvable(direct.footprint, direct.crossedRunIds);
    if (directValid) return direct;

    const sign = Math.sign(delta);
    let low = 0;
    let high = Math.abs(direct.appliedDelta);
    let best = null;
    for (let i = 0; i < 36; i++) {
        const magnitude = (low + high) * 0.5;
        const candidateDelta = sign * magnitude;
        const candidate = stretchFootprint(plan, {
            faceId: band.faceId,
            end: band.end,
            delta: candidateDelta,
            minLengthByRunId
        });
        if (isFootprintSolvable(candidate.footprint, candidate.crossedRunIds)) {
            best = candidate;
            low = magnitude;
        } else {
            high = magnitude;
        }
    }
    if (!best) return null;
    if (!(quantum > EPSILON)) return best;
    const quantizedMagnitude = Math.floor((Math.abs(best.appliedDelta) + EPSILON) / quantum) * quantum;
    if (!(quantizedMagnitude > EPSILON)) return null;
    return stretchFootprint(plan, {
        faceId: band.faceId,
        end: band.end,
        delta: sign * quantizedMagnitude,
        minLengthByRunId
    });
}

function applyBandGroup(plan, bands, requestedDelta, options, warnings, applications) {
    const quantum = options.quantumMeters;
    let remaining = quantizeForFit(requestedDelta, quantum);
    let current = plan;
    let available = [...bands];
    for (let pass = 0; pass < bands.length && Math.abs(remaining) > EPSILON && available.length; pass++) {
        const allocations = allocateWeighted(remaining, available, quantum);
        let passApplied = 0;
        const nextAvailable = [];
        for (let i = 0; i < available.length; i++) {
            const band = available[i];
            const allocation = allocations[i];
            if (Math.abs(allocation) <= EPSILON) {
                nextAvailable.push(band);
                continue;
            }
            const result = tryStretch(
                current,
                band,
                allocation,
                options.minLengthByRunId,
                quantum,
                options.isFootprintSolvable
            );
            if (!result || Math.abs(result.appliedDelta) <= EPSILON) continue;
            current = result.footprint;
            passApplied += result.appliedDelta;
            applications.push(Object.freeze({
                axis: options.axis,
                side: band.direction < 0 ? 'min' : 'max',
                faceId: band.faceId,
                end: band.end,
                requestedDelta: allocation,
                appliedDelta: result.appliedDelta,
                crossedRunIds: result.crossedRunIds
            }));
            warnings.push(...result.warnings);
            if (Math.abs(result.appliedDelta - allocation) <= Math.max(EPSILON, quantum * 0.25)) nextAvailable.push(band);
        }
        if (Math.abs(passApplied) <= EPSILON) break;
        remaining -= passApplied;
        available = nextAvailable;
    }
    return { plan: current, appliedDelta: quantizeForFit(requestedDelta, quantum) - remaining, remaining };
}

function fitAttempt(sourcePlan, targetBounds, metadata, options) {
    let plan = sourcePlan;
    const warnings = [];
    const applications = [];
    for (const axis of AXES) {
        for (const direction of [-1, 1]) {
            const bounds = computeBounds(plan.points);
            const desired = axis === 'x'
                ? (direction < 0 ? bounds.minX - targetBounds.minX : targetBounds.maxX - bounds.maxX)
                : (direction < 0 ? bounds.minZ - targetBounds.minZ : targetBounds.maxZ - bounds.maxZ);
            if (Math.abs(desired) <= options.quantumMeters + EPSILON) continue;
            const bands = enumerateBands(plan, axis, metadata, options.seed);
            const active = activeBandsForSide(bands, direction);
            if (!active.length) {
                warnings.push(`Lot fit could not move the ${axis.toUpperCase()} ${direction < 0 ? 'minimum' : 'maximum'} side because every matching stretch band is pinned or invalid.`);
                continue;
            }
            const applied = applyBandGroup(plan, active, desired, {
                ...options,
                axis
            }, warnings, applications);
            plan = applied.plan;
            if (Math.abs(applied.remaining) > options.quantumMeters + EPSILON) {
                warnings.push(`Lot fit stopped ${Math.abs(applied.remaining).toFixed(2)}m short on the ${axis.toUpperCase()} ${direction < 0 ? 'minimum' : 'maximum'} side.`);
            }
        }
    }
    return { plan, warnings, applications };
}

function uniqueWarnings(warnings) {
    return [...new Set(warnings.filter((warning) => typeof warning === 'string' && warning))];
}

/**
 * Fits one authored footprint to a build-area polygon using valid stretch bands only.
 * @param {object} options
 * @param {object|Array<{x:number,z:number}>} options.footprint
 * @param {Array<Array<{x:number,z:number}>>|Array<{x:number,z:number}>} options.buildAreaLoops
 * @param {FootprintStretchMetadata|null} [options.stretchMetadata]
 * @param {string|number} [options.seed]
 * @param {Record<string,number>|null} [options.minLengthByRunId]
 * @param {(footprint:object, affectedRunIds:ReadonlyArray<string>)=>boolean} [options.isFootprintSolvable]
 * @param {number} [options.quantumMeters]
 */
export function fitBuildingFootprintToLot({
    footprint,
    buildAreaLoops,
    stretchMetadata = null,
    seed = 0,
    minLengthByRunId = null,
    isFootprintSolvable = null,
    quantumMeters = null
} = {}) {
    const sourcePlan = createFootprintPlan(footprint);
    const areaLoops = normalizeAreaLoops(buildAreaLoops);
    if (!areaLoops.length) throw new RangeError('BuildingFootprintLotFitter: build area must contain a valid outer loop.');
    if (isFootprintSolvable !== null && typeof isFootprintSolvable !== 'function') {
        throw new TypeError('BuildingFootprintLotFitter: isFootprintSolvable must be a function when supplied.');
    }
    const metadataQuantum = Number(stretchMetadata?.quantumMeters);
    const requestedQuantum = Number(quantumMeters);
    const quantum = Number.isFinite(requestedQuantum) && requestedQuantum > 0
        ? requestedQuantum
        : (Number.isFinite(metadataQuantum) && metadataQuantum > 0 ? metadataQuantum : DEFAULT_QUANTUM_METERS);
    const targetBounds = computeBounds(areaLoops[0]);
    const result = fitAttempt(sourcePlan, targetBounds, stretchMetadata, {
        seed,
        quantumMeters: quantum,
        minLengthByRunId,
        isFootprintSolvable
    });
    const fittedBounds = computeBounds(result.plan.points);
    const residuals = Object.freeze({
        minX: fittedBounds.minX - targetBounds.minX,
        maxX: targetBounds.maxX - fittedBounds.maxX,
        minZ: fittedBounds.minZ - targetBounds.minZ,
        maxZ: targetBounds.maxZ - fittedBounds.maxZ
    });
    const boundaryTolerance = quantum + EPSILON;
    const reachedBounds = Object.values(residuals).every((value) => Math.abs(value) <= boundaryTolerance);
    const inside = footprintInsideArea(result.plan, areaLoops);
    const warnings = [...result.warnings];
    if (!inside) warnings.push('Lot fit reached the nearest valid stretch result, but the footprint cannot be contained by this build-area polygon.');
    if (!reachedBounds) warnings.push('Lot fit used the nearest solver-valid footprint because the requested lot bounds were unreachable.');
    return Object.freeze({
        footprint: result.plan,
        exact: inside && reachedBounds,
        contained: inside,
        seed: String(seed),
        quantumMeters: quantum,
        residuals,
        applications: Object.freeze(result.applications),
        warnings: Object.freeze(uniqueWarnings(warnings))
    });
}
