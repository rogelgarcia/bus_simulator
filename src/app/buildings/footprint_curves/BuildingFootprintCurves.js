// Canonical plan-curve math for Building Fabrication 2 footprint runs.
// A run owns the metadata stored on its start vertex. `bulge` is the usual
// CAD bulge value: tan(signedSweep / 4). Positive sweeps bend to the left of
// start→end; negative sweeps bend to the right.

const EPSILON = 1e-8;
const DEFAULT_MAX_CHORD_METERS = 0.45;
const MIN_SEGMENTS = 3;
const MAX_SEGMENTS = 96;

function clampInt(value, min, max) {
    return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}
export function normalizeFootprintArcMetadata(value) {
    const src = value && typeof value === 'object' ? value : null;
    const bulge = Number(src?.bulge);
    if (!Number.isFinite(bulge) || Math.abs(bulge) <= EPSILON) return null;
    if (Math.abs(bulge) > 10) return null;

    const segments = Number(src?.segments);
    return Object.freeze({
        bulge,
        ...(Number.isFinite(segments)
            ? { segments: clampInt(segments, MIN_SEGMENTS, MAX_SEGMENTS) }
            : {})
    });
}

export function reverseFootprintArcMetadata(value) {
    const arc = normalizeFootprintArcMetadata(value);
    if (!arc) return null;
    return Object.freeze({ ...arc, bulge: -arc.bulge });
}

export function resolveFootprintArcRun(start, end, value, {
    maxChordMeters = DEFAULT_MAX_CHORD_METERS
} = {}) {
    const arc = normalizeFootprintArcMetadata(value);
    if (!arc) return null;

    const ax = Number(start?.x);
    const az = Number(start?.z);
    const bx = Number(end?.x);
    const bz = Number(end?.z);
    if (![ax, az, bx, bz].every(Number.isFinite)) return null;

    const dx = bx - ax;
    const dz = bz - az;
    const chord = Math.hypot(dx, dz);
    if (!(chord > EPSILON)) return null;

    const bulge = arc.bulge;
    const sweep = 4 * Math.atan(bulge);
    const radius = chord * (1 + bulge * bulge) / (4 * Math.abs(bulge));
    const centerOffset = chord * (1 - bulge * bulge) / (4 * bulge);
    const leftX = -dz / chord;
    const leftZ = dx / chord;
    const center = {
        x: (ax + bx) * 0.5 + leftX * centerOffset,
        z: (az + bz) * 0.5 + leftZ * centerOffset
    };
    const startAngle = Math.atan2(az - center.z, ax - center.x);
    const length = Math.abs(sweep) * radius;
    const requestedChord = Math.max(0.1, Number(maxChordMeters) || DEFAULT_MAX_CHORD_METERS);
    const segments = arc.segments ?? clampInt(Math.ceil(length / requestedChord), MIN_SEGMENTS, MAX_SEGMENTS);

    return Object.freeze({
        bulge,
        center: Object.freeze(center),
        radius,
        startAngle,
        sweep,
        length,
        segments
    });
}

export function sampleResolvedFootprintArc(curve, u) {
    const c = curve && typeof curve === 'object' ? curve : null;
    const length = Number(c?.length);
    const radius = Number(c?.radius);
    const sweep = Number(c?.sweep);
    if (!(length > EPSILON) || !(radius > EPSILON) || !Number.isFinite(sweep)) return null;

    const clampedU = Math.max(0, Math.min(length, Number(u) || 0));
    const fraction = clampedU / length;
    const angle = Number(c.startAngle) + sweep * fraction;
    const direction = sweep >= 0 ? 1 : -1;
    const radialX = Math.cos(angle);
    const radialZ = Math.sin(angle);
    return {
        x: Number(c.center?.x) + radialX * radius,
        z: Number(c.center?.z) + radialZ * radius,
        tangent: {
            x: -radialZ * direction,
            z: radialX * direction
        },
        radial: { x: radialX, z: radialZ },
        u: clampedU,
        fraction
    };
}
