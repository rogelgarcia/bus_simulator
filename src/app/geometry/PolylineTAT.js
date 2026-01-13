// src/app/geometry/PolylineTAT.js
// Generates drivable centerlines from polyline control points using tangent–arc–tangent fillets.

const EPS = 1e-9;
const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function wrapAngle(angle) {
    let a = angle % TAU;
    if (a < 0) a += TAU;
    return a;
}

function angleDeltaCCW(from, to) {
    return wrapAngle(to - from);
}

function normalizeDirXZ(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: dx * inv, z: dz * inv, length: len };
}

function dotXZ(a, b) {
    return a.x * b.x + a.z * b.z;
}

function toPointXZ(p) {
    if (!p) return null;
    if (Array.isArray(p) && p.length >= 2) {
        const x = p[0];
        const z = p[1];
        if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
        return { x, z, radius: null };
    }
    const x = p.x;
    const z = Number.isFinite(p.z) ? p.z : p.y;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const radius = Number.isFinite(p.radius) ? p.radius : (Number.isFinite(p.r) ? p.r : null);
    return { x, z, radius: Number.isFinite(radius) ? radius : null };
}

function sanitizePoints(points) {
    const raw = Array.isArray(points) ? points : [];
    const out = [];
    for (const p of raw) {
        const pt = toPointXZ(p);
        if (!pt) continue;
        const last = out[out.length - 1] ?? null;
        if (last) {
            const dx = pt.x - last.x;
            const dz = pt.z - last.z;
            if (Math.hypot(dx, dz) <= 1e-6) continue;
        }
        out.push(pt);
    }
    return out;
}

function computeCornerFillet({ corner, dirIn, dirOut, lenIn, lenOut, radius }) {
    const rMax = Number.isFinite(radius) ? radius : 0;
    if (!(rMax > EPS)) return null;

    const dot = clamp(dotXZ(dirIn, dirOut), -1, 1);
    const angle = Math.acos(dot);
    if (!(angle > 1e-4) || Math.abs(Math.PI - angle) <= 1e-4) return null;

    const cross = dirIn.x * dirOut.z - dirIn.z * dirOut.x;
    if (Math.abs(cross) <= 1e-6) return null;

    const tanHalf = Math.tan(angle * 0.5);
    if (!(tanHalf > EPS)) return null;

    const maxT = Math.max(0, Math.min(lenIn, lenOut));
    if (!(maxT > EPS)) return null;

    const rFit = Math.min(rMax, maxT / tanHalf);
    if (!(rFit > EPS)) return null;

    const t = rFit * tanHalf;
    const inTangent = { x: corner.x - dirIn.x * t, z: corner.z - dirIn.z * t };
    const outTangent = { x: corner.x + dirOut.x * t, z: corner.z + dirOut.z * t };

    const turnLeft = cross > 0;
    const normalIn = turnLeft ? { x: -dirIn.z, z: dirIn.x } : { x: dirIn.z, z: -dirIn.x };
    const normalOut = turnLeft ? { x: -dirOut.z, z: dirOut.x } : { x: dirOut.z, z: -dirOut.x };

    const centerA = { x: inTangent.x + normalIn.x * rFit, z: inTangent.z + normalIn.z * rFit };
    const centerB = { x: outTangent.x + normalOut.x * rFit, z: outTangent.z + normalOut.z * rFit };
    const center = {
        x: (centerA.x + centerB.x) * 0.5,
        z: (centerA.z + centerB.z) * 0.5
    };

    const startAng = Math.atan2(inTangent.z - center.z, inTangent.x - center.x);
    const endAng = Math.atan2(outTangent.z - center.z, outTangent.x - center.x);
    const ccw = turnLeft;
    const spanAng = ccw ? angleDeltaCCW(startAng, endAng) : angleDeltaCCW(endAng, startAng);
    if (!(spanAng > 1e-6) || spanAng >= TAU - 1e-6) return null;

    return {
        center,
        radius: rFit,
        startAng,
        spanAng,
        ccw,
        inTangent,
        outTangent
    };
}

function sampleArcByChord({ center, radius, startAng, spanAng, ccw, chord }) {
    const c = Number.isFinite(chord) ? chord : 1;
    const r = Number.isFinite(radius) ? radius : 0;
    const span = Number.isFinite(spanAng) ? spanAng : 0;
    if (!center || !(r > EPS) || !(span > 0)) return [];
    const arcLen = r * span;
    const chordLen = Math.max(0.05, c);
    const segs = clamp(Math.ceil(arcLen / chordLen), 2, 512);
    const dir = ccw ? 1 : -1;
    const points = [];
    for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const ang = startAng + dir * span * t;
        points.push({ x: center.x + Math.cos(ang) * r, z: center.z + Math.sin(ang) * r });
    }
    return points;
}

export function generateCenterlineFromPolyline({
    points,
    defaultRadius = 0,
    chord = 1.0
} = {}) {
    const control = sanitizePoints(points);
    if (control.length < 2) {
        return { ok: false, reason: 'need_points', points: [], controlPoints: control, corners: [] };
    }

    const out = [];
    const corners = [];

    out.push({ x: control[0].x, z: control[0].z });

    for (let i = 1; i < control.length - 1; i++) {
        const prev = control[i - 1];
        const cur = control[i];
        const next = control[i + 1];

        const dirInRaw = normalizeDirXZ(prev, cur);
        const dirOutRaw = normalizeDirXZ(cur, next);
        if (!dirInRaw || !dirOutRaw) continue;

        const dirIn = { x: dirInRaw.x, z: dirInRaw.z };
        const dirOut = { x: dirOutRaw.x, z: dirOutRaw.z };
        const rWanted = Number.isFinite(cur.radius) ? cur.radius : (Number.isFinite(defaultRadius) ? defaultRadius : 0);

        const fillet = computeCornerFillet({
            corner: cur,
            dirIn,
            dirOut,
            lenIn: dirInRaw.length,
            lenOut: dirOutRaw.length,
            radius: rWanted
        });

        if (!fillet) {
            out.push({ x: cur.x, z: cur.z });
            corners.push({
                index: i,
                ok: false,
                radiusRequested: rWanted,
                radiusUsed: 0,
                center: null,
                inTangent: null,
                outTangent: null,
                startAng: null,
                spanAng: null,
                ccw: null
            });
            continue;
        }

        const inT = fillet.inTangent;
        const outT = fillet.outTangent;

        const last = out[out.length - 1] ?? null;
        if (!last || Math.hypot(inT.x - last.x, inT.z - last.z) > 1e-6) {
            out.push({ x: inT.x, z: inT.z });
        }

        const arcPts = sampleArcByChord({
            center: fillet.center,
            radius: fillet.radius,
            startAng: fillet.startAng,
            spanAng: fillet.spanAng,
            ccw: fillet.ccw,
            chord
        });
        for (let k = 1; k + 1 < arcPts.length; k++) out.push(arcPts[k]);

        out.push({ x: outT.x, z: outT.z });

        corners.push({
            index: i,
            ok: true,
            radiusRequested: rWanted,
            radiusUsed: fillet.radius,
            center: fillet.center,
            inTangent: fillet.inTangent,
            outTangent: fillet.outTangent,
            startAng: fillet.startAng,
            spanAng: fillet.spanAng,
            ccw: fillet.ccw
        });
    }

    const lastControl = control[control.length - 1];
    const lastSample = out[out.length - 1] ?? null;
    if (!lastSample || Math.hypot(lastControl.x - lastSample.x, lastControl.z - lastSample.z) > 1e-6) {
        out.push({ x: lastControl.x, z: lastControl.z });
    }

    const pointsOut = [];
    for (const p of out) {
        const last = pointsOut[pointsOut.length - 1] ?? null;
        if (last) {
            const dx = p.x - last.x;
            const dz = p.z - last.z;
            if (Math.hypot(dx, dz) <= 1e-6) continue;
        }
        pointsOut.push(p);
    }

    return {
        ok: true,
        points: pointsOut,
        controlPoints: control.map((p) => ({ x: p.x, z: p.z, radius: p.radius })),
        corners
    };
}
