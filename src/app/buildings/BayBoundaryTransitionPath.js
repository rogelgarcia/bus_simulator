// Deterministic tangent-continuous transition path solver for AI 541.
// @ts-check

const EPS = 1e-9;

function finitePoint(value) {
    const x = Number(value?.x);
    const z = Number(value?.z);
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function normalized(value) {
    const point = finitePoint(value);
    const length = point ? Math.hypot(point.x, point.z) : 0;
    return length > EPS ? { x: point.x / length, z: point.z / length } : null;
}

function q(value) {
    return Number(Number(value).toFixed(12));
}

function qp(point) {
    return { x: q(point.x), z: q(point.z) };
}

function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

function evaluate(control, t) {
    const a = lerp(control[0], control[1], t);
    const b = lerp(control[1], control[2], t);
    const c = lerp(control[2], control[3], t);
    return lerp(lerp(a, b, t), lerp(b, c, t), t);
}

function derivative(control, t) {
    const one = 1 - t;
    return {
        x: 3 * one * one * (control[1].x - control[0].x)
            + 6 * one * t * (control[2].x - control[1].x)
            + 3 * t * t * (control[3].x - control[2].x),
        z: 3 * one * one * (control[1].z - control[0].z)
            + 6 * one * t * (control[2].z - control[1].z)
            + 3 * t * t * (control[3].z - control[2].z)
    };
}

function pointLineDistance(point, a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (!(length > EPS)) return Math.hypot(point.x - a.x, point.z - a.z);
    return Math.abs(dx * (a.z - point.z) - (a.x - point.x) * dz) / length;
}

function dot(a, b) {
    return a.x * b.x + a.z * b.z;
}

function cross(a, b, c) {
    return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function rangesOverlap(a0, a1, b0, b1, tolerance = 1e-9) {
    return Math.max(Math.min(a0, a1), Math.min(b0, b1))
        <= Math.min(Math.max(a0, a1), Math.max(b0, b1)) + tolerance;
}

function segmentsIntersect(a, b, c, d) {
    if (!rangesOverlap(a.x, b.x, c.x, d.x) || !rangesOverlap(a.z, b.z, c.z, d.z)) return false;
    const abC = cross(a, b, c);
    const abD = cross(a, b, d);
    const cdA = cross(c, d, a);
    const cdB = cross(c, d, b);
    const tolerance = 1e-10;
    return ((abC > tolerance && abD < -tolerance) || (abC < -tolerance && abD > tolerance))
        && ((cdA > tolerance && cdB < -tolerance) || (cdA < -tolerance && cdB > tolerance));
}

function split(control) {
    const a = lerp(control[0], control[1], 0.5);
    const b = lerp(control[1], control[2], 0.5);
    const c = lerp(control[2], control[3], 0.5);
    const d = lerp(a, b, 0.5);
    const e = lerp(b, c, 0.5);
    const mid = lerp(d, e, 0.5);
    return [[control[0], a, d, mid], [mid, e, c, control[3]]];
}

function adaptiveParameters(control, maxChordErrorMeters, maxDepth) {
    const out = [0];
    const visit = (segment, t0, t1, depth) => {
        const flatness = Math.max(
            pointLineDistance(segment[1], segment[0], segment[3]),
            pointLineDistance(segment[2], segment[0], segment[3])
        );
        if (flatness <= maxChordErrorMeters || depth >= maxDepth) {
            out.push(t1);
            return;
        }
        const [left, right] = split(segment);
        const tm = (t0 + t1) * 0.5;
        visit(left, t0, tm, depth + 1);
        visit(right, tm, t1, depth + 1);
    };
    visit(control, 0, 1, 0);
    return out;
}

function invalid(code, message) {
    return { valid: false, samples: [], lengthMeters: 0, controls: [], diagnostics: [{ severity: 'error', code, message }] };
}

/**
 * Solves one cubic transition. `meeting` biases the two tangent handles and is
 * also emitted as an exact sample/material-ownership seam.
 */
export function solveBayBoundaryTransitionPath({
    id = '',
    p0,
    p1,
    tangent0,
    tangent1,
    outward0 = null,
    outward1 = null,
    leftRunoutMeters = 0.75,
    rightRunoutMeters = 0.75,
    meeting = 0.5,
    maxChordErrorMeters = 0.01,
    maxDepth = 10
} = {}) {
    const start = finitePoint(p0);
    const end = finitePoint(p1);
    const t0 = normalized(tangent0);
    const t1 = normalized(tangent1);
    if (!start || !end || !t0 || !t1) return invalid('bay_boundary_frame_invalid', 'Rounded boundary endpoints require finite positions and non-zero tangents.');
    const chord = Math.hypot(end.x - start.x, end.z - start.z);
    if (!(chord > 1e-5)) return invalid('bay_boundary_span_collapsed', 'Rounded boundary stations P0 and P1 collapse to the same point.');
    const chordDirection = { x: (end.x - start.x) / chord, z: (end.z - start.z) / chord };
    if (dot(t0, chordDirection) < -0.1 || dot(t1, chordDirection) < -0.1) {
        return invalid('bay_boundary_tangent_reversed', 'Rounded boundary endpoint tangents point away from the opposite station.');
    }
    const left = Number(leftRunoutMeters);
    const right = Number(rightRunoutMeters);
    const bias = Number(meeting);
    if (!(left > 0) || !(right > 0)) return invalid('bay_boundary_runout_invalid', 'Rounded boundary runouts must be greater than zero.');
    if (!(bias > 0) || !(bias < 1)) return invalid('bay_boundary_meeting_invalid', 'Rounded boundary meeting position must be between zero and one.');

    const baseHandle = Math.min(Math.max(chord * 0.36, Math.min(left, right) * 0.35), Math.max(left, right) * 1.5);
    const h0 = baseHandle * (1.5 - bias);
    const h1 = baseHandle * (0.5 + bias);
    const control = [
        start,
        { x: start.x + t0.x * h0, z: start.z + t0.z * h0 },
        { x: end.x - t1.x * h1, z: end.z - t1.z * h1 },
        end
    ];
    const maxError = Math.min(0.1, Math.max(0.0005, Number(maxChordErrorMeters) || 0.01));
    const params = adaptiveParameters(control, maxError, Math.min(12, Math.max(2, Math.round(Number(maxDepth) || 10))));
    params.push(bias);
    params.sort((a, b) => a - b);
    const unique = params.filter((value, index) => index === 0 || Math.abs(value - params[index - 1]) > 1e-10);
    const normalHint0 = normalized(outward0);
    const normalHint1 = normalized(outward1);
    const samples = [];
    let lengthMeters = 0;
    for (const t of unique) {
        const position = evaluate(control, t);
        const tangent = normalized(derivative(control, t));
        if (!tangent) return invalid('bay_boundary_cusp', `Rounded boundary "${id}" contains a cusp or zero tangent.`);
        let normal = { x: tangent.z, z: -tangent.x };
        const hint = normalHint0 && normalHint1
            ? normalized(lerp(normalHint0, normalHint1, t))
            : (normalHint0 ?? normalHint1);
        if (hint && normal.x * hint.x + normal.z * hint.z < 0) normal = { x: -normal.x, z: -normal.z };
        if (samples.length) {
            const previous = samples[samples.length - 1].position;
            lengthMeters += Math.hypot(position.x - previous.x, position.z - previous.z);
        }
        samples.push({
            t: q(t),
            sMeters: q(lengthMeters),
            position: qp(position),
            tangent: qp(tangent),
            normal: qp(normal),
            owner: t < bias ? 'left' : 'right'
        });
    }
    let totalTurnRadians = 0;
    for (let index = 1; index < samples.length; index += 1) {
        totalTurnRadians += Math.acos(Math.max(-1, Math.min(1, dot(
            samples[index - 1].tangent,
            samples[index].tangent
        ))));
    }
    if (totalTurnRadians > Math.PI * 1.5) {
        return invalid('bay_boundary_curvature_excessive', 'Rounded boundary turns more than 270 degrees between P0 and P1.');
    }
    for (let leftIndex = 0; leftIndex < samples.length - 1; leftIndex += 1) {
        for (let rightIndex = leftIndex + 2; rightIndex < samples.length - 1; rightIndex += 1) {
            if (segmentsIntersect(
                samples[leftIndex].position,
                samples[leftIndex + 1].position,
                samples[rightIndex].position,
                samples[rightIndex + 1].position
            )) {
                return invalid('bay_boundary_self_intersection', 'Rounded boundary samples form a self-intersecting loop.');
            }
        }
    }
    samples[0].position = qp(start);
    samples[samples.length - 1].position = qp(end);
    return {
        valid: true,
        controls: control.map(qp),
        meeting: q(bias),
        meetingPoint: qp(evaluate(control, bias)),
        lengthMeters: q(lengthMeters),
        samples,
        diagnostics: []
    };
}
