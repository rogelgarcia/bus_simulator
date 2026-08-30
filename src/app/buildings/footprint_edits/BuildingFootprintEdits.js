// Pure plan-space stretch-band and push/pull transforms for Building Fabrication 2.
// @ts-check

const GEOMETRY_EPSILON = 1e-7;
const DEFAULT_MIN_RUN_LENGTH_METERS = 0.01;
const DEFAULT_ANGLE_TOLERANCE_DEGREES = 0.5;
const MAX_RUN_COUNT = 26;

/** @typedef {{x:number, z:number, cornerId?:string, split?:boolean}} PlanPoint */
/** @typedef {{points:PlanPoint[], runIds:string[], runDirections:boolean[]}} FootprintPlan */

function isRunId(value) {
    return typeof value === 'string' && value.length === 1 && value >= 'A' && value <= 'Z';
}

function faceIdAt(index) {
    const i = Number(index) | 0;
    return i >= 0 && i < MAX_RUN_COUNT ? String.fromCharCode(65 + i) : null;
}

function clonePoint(point) {
    return {
        x: Number(point?.x),
        z: Number(point?.z),
        ...(typeof point?.cornerId === 'string' && point.cornerId ? { cornerId: point.cornerId } : {}),
        ...(point?.split === true ? { split: true } : {})
    };
}

function add2(a, b) {
    return { x: a.x + b.x, z: a.z + b.z };
}

function sub2(a, b) {
    return { x: a.x - b.x, z: a.z - b.z };
}

function scale2(value, scale) {
    return { x: value.x * scale, z: value.z * scale };
}

function dot2(a, b) {
    return a.x * b.x + a.z * b.z;
}

function cross2(a, b) {
    return a.x * b.z - a.z * b.x;
}

function length2(value) {
    return Math.hypot(value.x, value.z);
}

function normalize2(value) {
    const length = length2(value);
    if (!(length > GEOMETRY_EPSILON)) return null;
    return { x: value.x / length, z: value.z / length, length };
}

function signedArea(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        sum += a.x * b.z - b.x * a.z;
    }
    return sum * 0.5;
}

function orientation(a, b, c) {
    return cross2(sub2(b, a), sub2(c, a));
}

function pointOnSegment(point, a, b, epsilon = GEOMETRY_EPSILON) {
    if (Math.abs(orientation(a, b, point)) > epsilon) return false;
    return point.x >= Math.min(a.x, b.x) - epsilon
        && point.x <= Math.max(a.x, b.x) + epsilon
        && point.z >= Math.min(a.z, b.z) - epsilon
        && point.z <= Math.max(a.z, b.z) + epsilon;
}

function segmentsIntersect(a, b, c, d, epsilon = GEOMETRY_EPSILON) {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);
    if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon))
        && ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) return true;
    if (Math.abs(o1) <= epsilon && pointOnSegment(c, a, b, epsilon)) return true;
    if (Math.abs(o2) <= epsilon && pointOnSegment(d, a, b, epsilon)) return true;
    if (Math.abs(o3) <= epsilon && pointOnSegment(a, c, d, epsilon)) return true;
    return Math.abs(o4) <= epsilon && pointOnSegment(b, c, d, epsilon);
}

function isSimplePolygon(points, minLengthByRunId = null, runIds = null) {
    if (points.length < 3 || points.length > MAX_RUN_COUNT) return false;
    if (!(Math.abs(signedArea(points)) > GEOMETRY_EPSILON)) return false;
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (!Number.isFinite(a.x) || !Number.isFinite(a.z)) return false;
        const id = runIds?.[i] ?? null;
        const configuredMin = id && Number.isFinite(minLengthByRunId?.[id])
            ? Math.max(DEFAULT_MIN_RUN_LENGTH_METERS, Number(minLengthByRunId[id]))
            : DEFAULT_MIN_RUN_LENGTH_METERS;
        if (length2(sub2(b, a)) + GEOMETRY_EPSILON < configuredMin) return false;
    }
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        for (let j = i + 1; j < points.length; j++) {
            if (j === i || j === (i + 1) % points.length || i === (j + 1) % points.length) continue;
            const c = points[j];
            const d = points[(j + 1) % points.length];
            if (segmentsIntersect(a, b, c, d)) return false;
        }
    }
    return true;
}

function pointInPolygon(point, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i];
        const b = points[j];
        const crosses = ((a.z > point.z) !== (b.z > point.z))
            && point.x < ((b.x - a.x) * (point.z - a.z)) / ((b.z - a.z) || GEOMETRY_EPSILON) + a.x;
        if (crosses) inside = !inside;
    }
    return inside;
}

function freezePlan(plan) {
    return Object.freeze({
        points: Object.freeze(plan.points.map((point) => Object.freeze(clonePoint(point)))),
        runIds: Object.freeze([...plan.runIds]),
        runDirections: Object.freeze([...plan.runDirections])
    });
}

function sourcePointsOf(footprint) {
    if (Array.isArray(footprint)) return footprint;
    if (Array.isArray(footprint?.points)) return footprint.points;
    if (Array.isArray(footprint?.loop)) return footprint.loop;
    return null;
}

/**
 * Validates and freezes a footprint plan. A run id belongs to the edge that
 * starts at the point with the same array index.
 * @param {PlanPoint[]|{points?:PlanPoint[], loop?:PlanPoint[], runIds?:string[], runDirections?:boolean[]}} footprint
 * @returns {Readonly<FootprintPlan>}
 */
export function createFootprintPlan(footprint) {
    const sourcePoints = sourcePointsOf(footprint);
    if (!sourcePoints || sourcePoints.length < 3 || sourcePoints.length > MAX_RUN_COUNT) {
        throw new RangeError('BuildingFootprintEdits: footprint must contain 3 to 26 points.');
    }
    if (sourcePoints.some((point) => point?.arc && typeof point.arc === 'object')) {
        throw new RangeError('BuildingFootprintEdits: curved runs are read-only in the straight-run layout editor.');
    }
    const points = sourcePoints.map((point) => clonePoint(point));
    for (const point of points) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
            throw new TypeError('BuildingFootprintEdits: footprint points must be finite x/z coordinates.');
        }
    }

    const explicitIds = Array.isArray(footprint?.runIds)
        ? footprint.runIds
        : sourcePoints.map((point) => point?.runId);
    const hasCompleteIds = explicitIds.length === points.length && explicitIds.every((id) => isRunId(id));
    const runIds = hasCompleteIds ? [...explicitIds] : points.map((_, index) => faceIdAt(index));
    if (new Set(runIds).size !== runIds.length) {
        throw new RangeError('BuildingFootprintEdits: run ids must be unique letters A-Z.');
    }

    const explicitDirections = Array.isArray(footprint?.runDirections)
        ? footprint.runDirections
        : sourcePoints.map((point) => point?.runForward);
    const runDirections = explicitDirections.length === points.length
        ? explicitDirections.map((value) => value !== false)
        : points.map(() => true);
    if (!isSimplePolygon(points, null, runIds)) {
        throw new RangeError('BuildingFootprintEdits: footprint must be a simple polygon with non-collapsed runs.');
    }
    return freezePlan({ points, runIds, runDirections });
}

/** @param {Readonly<FootprintPlan>} plan */
export function footprintPlanToLoop(plan) {
    const safe = createFootprintPlan(plan);
    return safe.points.map((point, index) => ({
        x: point.x,
        z: point.z,
        ...(typeof point.cornerId === 'string' && point.cornerId ? { cornerId: point.cornerId } : {}),
        runId: safe.runIds[index],
        runForward: safe.runDirections[index],
        ...(point.split === true ? { split: true } : {})
    }));
}

function runIndexOf(plan, faceId) {
    const index = plan.runIds.indexOf(faceId);
    if (index < 0) throw new RangeError(`BuildingFootprintEdits: unknown face id "${faceId}".`);
    return index;
}

function rawRun(plan, index) {
    const a = plan.points[index];
    const b = plan.points[(index + 1) % plan.points.length];
    const raw = normalize2(sub2(b, a));
    if (!raw) return null;
    const forward = plan.runDirections[index] !== false;
    return {
        index,
        faceId: plan.runIds[index],
        rawStart: a,
        rawEnd: b,
        start: forward ? a : b,
        end: forward ? b : a,
        tangent: forward ? { x: raw.x, z: raw.z } : { x: -raw.x, z: -raw.z },
        length: raw.length
    };
}

function outwardNormal(plan, run) {
    const rawDirection = normalize2(sub2(run.rawEnd, run.rawStart));
    if (!rawDirection) return null;
    const area = signedArea(plan.points);
    return area < 0
        ? { x: -rawDirection.z, z: rawDirection.x }
        : { x: rawDirection.z, z: -rawDirection.x };
}

/** Resolves one stable run in its authored direction with an outward normal. */
export function getFootprintRunFrame(footprint, faceId) {
    const plan = createFootprintPlan(footprint);
    const run = rawRun(plan, runIndexOf(plan, faceId));
    if (!run) throw new RangeError(`BuildingFootprintEdits: face "${faceId}" is collapsed.`);
    const normal = outwardNormal(plan, run);
    if (!normal) throw new RangeError(`BuildingFootprintEdits: face "${faceId}" has no outward normal.`);
    return Object.freeze({
        faceId,
        runIndex: run.index,
        start: Object.freeze(clonePoint(run.start)),
        end: Object.freeze(clonePoint(run.end)),
        tangent: Object.freeze(clonePoint(run.tangent)),
        normal: Object.freeze(clonePoint(normal)),
        length: run.length
    });
}

function buildCut(plan, faceId, end, angleToleranceDegrees) {
    if (end !== 'start' && end !== 'end') {
        throw new TypeError('BuildingFootprintEdits: stretch end must be "start" or "end".');
    }
    const selectedIndex = runIndexOf(plan, faceId);
    const selected = rawRun(plan, selectedIndex);
    if (!selected) return { valid: false, reason: 'collapsed_selected_run' };

    const angleRadians = Math.max(0, Number(angleToleranceDegrees) || 0) * Math.PI / 180;
    const parallelThreshold = Math.cos(angleRadians);
    const inwardDistance = Math.min(0.01, Math.max(1e-5, selected.length * 1e-4));
    const endpoint = end === 'start' ? selected.start : selected.end;
    const insideSign = end === 'start' ? 1 : -1;
    const cutDirection = { x: -selected.tangent.z, z: selected.tangent.x };

    for (let attempt = 1; attempt <= 8; attempt++) {
        const origin = add2(endpoint, scale2(selected.tangent, insideSign * inwardDistance * attempt));
        const intersections = [];
        let grazesVertex = false;
        let shearRunId = null;

        for (let i = 0; i < plan.points.length; i++) {
            const a = plan.points[i];
            const b = plan.points[(i + 1) % plan.points.length];
            const sideA = dot2(sub2(a, origin), selected.tangent);
            const sideB = dot2(sub2(b, origin), selected.tangent);
            if (Math.abs(sideA) <= GEOMETRY_EPSILON || Math.abs(sideB) <= GEOMETRY_EPSILON) {
                grazesVertex = true;
                break;
            }
            if (sideA * sideB >= 0) continue;

            const edgeDirection = normalize2(sub2(b, a));
            if (!edgeDirection) continue;
            const alongSelected = Math.abs(dot2(edgeDirection, selected.tangent));
            if (alongSelected + GEOMETRY_EPSILON < parallelThreshold) shearRunId = plan.runIds[i];
            const edgeT = sideA / (sideA - sideB);
            const point = add2(a, scale2(sub2(b, a), edgeT));
            intersections.push({
                point,
                distance: dot2(sub2(point, origin), cutDirection),
                runId: plan.runIds[i]
            });
        }

        if (grazesVertex) continue;
        if (intersections.length < 2 || intersections.length % 2 !== 0) {
            return { valid: false, reason: 'cut_does_not_cross_plan' };
        }
        if (shearRunId) return { valid: false, reason: 'crossed_wall_not_parallel', invalidRunId: shearRunId };

        intersections.sort((a, b) => a.distance - b.distance);
        const segments = [];
        for (let i = 0; i < intersections.length; i += 2) {
            const a = intersections[i];
            const b = intersections[i + 1];
            const midpoint = scale2(add2(a.point, b.point), 0.5);
            if (!pointInPolygon(midpoint, plan.points)) {
                return { valid: false, reason: 'concave_reentry' };
            }
            segments.push(Object.freeze({
                start: Object.freeze(clonePoint(a.point)),
                end: Object.freeze(clonePoint(b.point))
            }));
        }
        const crossedRunIds = [...new Set(intersections.map((entry) => entry.runId))];
        const translationDirection = end === 'end'
            ? selected.tangent
            : { x: -selected.tangent.x, z: -selected.tangent.z };
        return Object.freeze({
            valid: true,
            faceId,
            end,
            origin: Object.freeze(clonePoint(origin)),
            direction: Object.freeze(clonePoint(cutDirection)),
            tangent: Object.freeze(clonePoint(selected.tangent)),
            translationDirection: Object.freeze(clonePoint(translationDirection)),
            crossedRunIds: Object.freeze(crossedRunIds),
            oppositeRunIds: Object.freeze(crossedRunIds.filter((id) => id !== faceId)),
            segments: Object.freeze(segments)
        });
    }
    return { valid: false, reason: 'vertex_grazing_unresolved' };
}

/**
 * Returns zero or one valid perpendicular cut for the requested face end.
 * The array shape leaves room for future footprints with multiple loops.
 */
export function findValidStretchCuts(footprint, faceId, end, {
    angleToleranceDegrees = DEFAULT_ANGLE_TOLERANCE_DEGREES
} = {}) {
    const plan = createFootprintPlan(footprint);
    const cut = buildCut(plan, faceId, end, angleToleranceDegrees);
    return cut.valid ? Object.freeze([cut]) : Object.freeze([]);
}

/** Returns validity diagnostics for both stretch handles on a face. */
export function inspectStretchHandles(footprint, faceId, options = {}) {
    const plan = createFootprintPlan(footprint);
    const start = buildCut(plan, faceId, 'start', options.angleToleranceDegrees ?? DEFAULT_ANGLE_TOLERANCE_DEGREES);
    const end = buildCut(plan, faceId, 'end', options.angleToleranceDegrees ?? DEFAULT_ANGLE_TOLERANCE_DEGREES);
    return Object.freeze({ start: Object.freeze(start), end: Object.freeze(end) });
}

function interpolateCandidate(start, target, amount) {
    return start.map((point, index) => ({
        x: point.x + (target[index].x - point.x) * amount,
        z: point.z + (target[index].z - point.z) * amount
    }));
}

function clampCandidateToValidity(plan, target, minLengthByRunId) {
    if (isSimplePolygon(target, minLengthByRunId, plan.runIds)) return { points: target, ratio: 1 };
    let low = 0;
    let high = 1;
    let best = plan.points.map(clonePoint);
    for (let i = 0; i < 40; i++) {
        const ratio = (low + high) * 0.5;
        const candidate = interpolateCandidate(plan.points, target, ratio);
        if (isSimplePolygon(candidate, minLengthByRunId, plan.runIds)) {
            low = ratio;
            best = candidate;
        } else {
            high = ratio;
        }
    }
    return { points: best, ratio: low };
}

function freezeTransformResult({ plan, requestedDelta, appliedDelta, clamped, warnings, crossedRunIds = [], connectorRunIds = [] }) {
    return Object.freeze({
        footprint: freezePlan(plan),
        requestedDelta,
        appliedDelta,
        clamped,
        warnings: Object.freeze([...warnings]),
        crossedRunIds: Object.freeze([...crossedRunIds]),
        connectorRunIds: Object.freeze([...connectorRunIds])
    });
}

/** Applies a tangent stretch at one valid cut and preserves every run id. */
export function stretchFootprint(footprint, {
    faceId,
    end,
    delta,
    minLengthByRunId = null,
    angleToleranceDegrees = DEFAULT_ANGLE_TOLERANCE_DEGREES
} = {}) {
    const plan = createFootprintPlan(footprint);
    const requestedDelta = Number(delta);
    if (!Number.isFinite(requestedDelta)) throw new TypeError('BuildingFootprintEdits: stretch delta must be finite.');
    const cut = buildCut(plan, faceId, end, angleToleranceDegrees);
    if (!cut.valid) throw new RangeError(`BuildingFootprintEdits: invalid stretch cut (${cut.reason}).`);

    let safeDelta = requestedDelta;
    const warnings = [];
    for (const runId of cut.crossedRunIds) {
        const index = runIndexOf(plan, runId);
        const run = rawRun(plan, index);
        const minimum = Number.isFinite(minLengthByRunId?.[runId])
            ? Math.max(DEFAULT_MIN_RUN_LENGTH_METERS, Number(minLengthByRunId[runId]))
            : DEFAULT_MIN_RUN_LENGTH_METERS;
        safeDelta = Math.max(safeDelta, minimum - run.length);
    }
    if (safeDelta > requestedDelta + GEOMETRY_EPSILON) {
        warnings.push(`Stretch clamped to ${safeDelta.toFixed(3)}m so every affected facade still solves.`);
    }

    const selected = rawRun(plan, runIndexOf(plan, faceId));
    const sideSign = end === 'end' ? 1 : -1;
    const movement = scale2(cut.translationDirection, safeDelta);
    const target = plan.points.map((point) => {
        const side = dot2(sub2(point, cut.origin), selected.tangent) * sideSign;
        return side > 0 ? add2(point, movement) : clonePoint(point);
    });
    const clampedCandidate = clampCandidateToValidity(plan, target, minLengthByRunId);
    const appliedDelta = safeDelta * clampedCandidate.ratio;
    if (clampedCandidate.ratio < 1 - 1e-7) {
        warnings.push(`Stretch clamped to ${appliedDelta.toFixed(3)}m before the footprint became invalid.`);
    }
    return freezeTransformResult({
        plan: { points: clampedCandidate.points, runIds: plan.runIds, runDirections: plan.runDirections },
        requestedDelta,
        appliedDelta,
        clamped: Math.abs(appliedDelta - requestedDelta) > 1e-6,
        warnings,
        crossedRunIds: cut.crossedRunIds
    });
}

function lineIntersection(pointA, directionA, pointB, directionB) {
    const denominator = cross2(directionA, directionB);
    if (Math.abs(denominator) <= GEOMETRY_EPSILON) return null;
    const t = cross2(sub2(pointB, pointA), directionB) / denominator;
    return add2(pointA, scale2(directionA, t));
}

function availableRunIds(plan, count) {
    const used = new Set(plan.runIds);
    const result = [];
    for (let i = 0; i < MAX_RUN_COUNT && result.length < count; i++) {
        const id = faceIdAt(i);
        if (!used.has(id)) result.push(id);
    }
    return result;
}

function connectedPushCandidate(plan, selectedIndex, delta) {
    const selected = rawRun(plan, selectedIndex);
    const previousIndex = (selectedIndex - 1 + plan.points.length) % plan.points.length;
    const nextIndex = (selectedIndex + 1) % plan.points.length;
    const previous = rawRun(plan, previousIndex);
    const next = rawRun(plan, nextIndex);
    const normal = outwardNormal(plan, selected);
    if (!selected || !previous || !next || !normal) return null;

    const selectedRawDirection = normalize2(sub2(selected.rawEnd, selected.rawStart));
    const previousRawDirection = normalize2(sub2(previous.rawEnd, previous.rawStart));
    const nextRawDirection = normalize2(sub2(next.rawEnd, next.rawStart));
    if (!selectedRawDirection || !previousRawDirection || !nextRawDirection) return null;
    if (Math.abs(cross2(selectedRawDirection, previousRawDirection)) <= GEOMETRY_EPSILON
        || Math.abs(cross2(selectedRawDirection, nextRawDirection)) <= GEOMETRY_EPSILON) return null;

    const shiftedStart = add2(selected.rawStart, scale2(normal, delta));
    const shiftedEnd = add2(selected.rawEnd, scale2(normal, delta));
    const start = lineIntersection(previous.rawStart, previousRawDirection, shiftedStart, selectedRawDirection);
    const end = lineIntersection(shiftedEnd, selectedRawDirection, next.rawStart, nextRawDirection);
    if (!start || !end) return null;
    const points = plan.points.map(clonePoint);
    points[selectedIndex] = start;
    points[(selectedIndex + 1) % points.length] = end;
    return points;
}

function detachedPushCandidate(plan, selectedIndex, delta, connectorRunIds) {
    const selected = rawRun(plan, selectedIndex);
    const normal = outwardNormal(plan, selected);
    if (!selected || !normal) return null;
    const shiftedRawStart = add2(selected.rawStart, scale2(normal, delta));
    const shiftedRawEnd = add2(selected.rawEnd, scale2(normal, delta));
    const descriptors = [];
    for (let i = 0; i < plan.points.length; i++) {
        const run = rawRun(plan, i);
        if (!run) return null;
        if (i !== selectedIndex) {
            descriptors.push({
                a: clonePoint(run.rawStart),
                b: clonePoint(run.rawEnd),
                runId: plan.runIds[i],
                runForward: plan.runDirections[i]
            });
            continue;
        }
        const connectorDirection = plan.runDirections[i];
        descriptors.push({ a: clonePoint(run.rawStart), b: shiftedRawStart, runId: connectorRunIds[0], runForward: connectorDirection });
        descriptors.push({ a: shiftedRawStart, b: shiftedRawEnd, runId: plan.runIds[i], runForward: plan.runDirections[i] });
        descriptors.push({ a: shiftedRawEnd, b: clonePoint(run.rawEnd), runId: connectorRunIds[1], runForward: connectorDirection });
    }
    return {
        points: descriptors.map((entry) => entry.a),
        runIds: descriptors.map((entry) => entry.runId),
        runDirections: descriptors.map((entry) => entry.runForward)
    };
}

/** Reports whether a face can use connected or detached push/pull. */
export function inspectPushPull(footprint, faceId, { detached = false } = {}) {
    const plan = createFootprintPlan(footprint);
    const selectedIndex = runIndexOf(plan, faceId);
    if (detached) {
        const connectorRunIds = availableRunIds(plan, 2);
        return Object.freeze({
            valid: connectorRunIds.length === 2,
            reason: connectorRunIds.length === 2 ? null : 'face_id_capacity',
            connectorRunIds: Object.freeze(connectorRunIds),
            normal: Object.freeze(clonePoint(outwardNormal(plan, rawRun(plan, selectedIndex))))
        });
    }
    const candidate = connectedPushCandidate(plan, selectedIndex, 0);
    return Object.freeze({
        valid: !!candidate,
        reason: candidate ? null : 'parallel_neighbor',
        connectorRunIds: Object.freeze([]),
        normal: Object.freeze(clonePoint(outwardNormal(plan, rawRun(plan, selectedIndex))))
    });
}

/** Offsets a face along its outward normal, with optional connector spawning. */
export function pushPullFootprint(footprint, {
    faceId,
    delta,
    detached = false,
    connectorRunIds = null,
    minLengthByRunId = null
} = {}) {
    const plan = createFootprintPlan(footprint);
    const requestedDelta = Number(delta);
    if (!Number.isFinite(requestedDelta)) throw new TypeError('BuildingFootprintEdits: push/pull delta must be finite.');
    const selectedIndex = runIndexOf(plan, faceId);
    if (Math.abs(requestedDelta) <= GEOMETRY_EPSILON) {
        return freezeTransformResult({
            plan,
            requestedDelta,
            appliedDelta: 0,
            clamped: false,
            warnings: []
        });
    }

    if (detached) {
        const generated = Array.isArray(connectorRunIds) && connectorRunIds.length === 2
            ? [...connectorRunIds]
            : availableRunIds(plan, 2);
        if (generated.length !== 2 || generated.some((id) => !isRunId(id) || plan.runIds.includes(id)) || generated[0] === generated[1]) {
            throw new RangeError('BuildingFootprintEdits: detached push requires two unused connector face ids.');
        }
        const target = detachedPushCandidate(plan, selectedIndex, requestedDelta, generated);
        if (!target) throw new RangeError('BuildingFootprintEdits: detached push could not construct connector walls.');
        if (!isSimplePolygon(target.points, minLengthByRunId, target.runIds)) {
            throw new RangeError('BuildingFootprintEdits: detached push would make the footprint invalid.');
        }
        return freezeTransformResult({
            plan: target,
            requestedDelta,
            appliedDelta: requestedDelta,
            clamped: false,
            warnings: [],
            connectorRunIds: generated
        });
    }

    if (!connectedPushCandidate(plan, selectedIndex, 0)) {
        throw new RangeError('BuildingFootprintEdits: push/pull is invalid because a neighboring wall is parallel.');
    }
    const target = connectedPushCandidate(plan, selectedIndex, requestedDelta);
    if (!target) throw new RangeError('BuildingFootprintEdits: push/pull could not re-intersect neighboring walls.');
    const clampedCandidate = clampCandidateToValidity(plan, target, minLengthByRunId);
    const appliedDelta = requestedDelta * clampedCandidate.ratio;
    const warnings = [];
    if (clampedCandidate.ratio < 1 - 1e-7) {
        warnings.push(`Push/pull clamped to ${appliedDelta.toFixed(3)}m before a neighboring facade collapsed.`);
    }
    return freezeTransformResult({
        plan: { points: clampedCandidate.points, runIds: plan.runIds, runDirections: plan.runDirections },
        requestedDelta,
        appliedDelta,
        clamped: Math.abs(appliedDelta - requestedDelta) > 1e-6,
        warnings
    });
}
