// src/app/geometry/RoadEdgeFillet.js
// Computes tangent–arc–tangent fillets between two directed edge lines in XZ.

const EPS = 1e-9;
const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function dotXZ(a, b) {
    return a.x * b.x + a.z * b.z;
}

function crossXZ(a, b) {
    return a.x * b.z - a.z * b.x;
}

function normalizeDirXZ(dir) {
    if (!dir || !Number.isFinite(dir.x) || !Number.isFinite(dir.z)) return null;
    const len = Math.hypot(dir.x, dir.z);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: dir.x * inv, z: dir.z * inv, length: len };
}

function leftNormalXZ(dir) {
    return { x: -dir.z, z: dir.x };
}

function wrapAngle(angle) {
    let a = angle % TAU;
    if (a < 0) a += TAU;
    return a;
}

function angleDeltaCCW(from, to) {
    return wrapAngle(to - from);
}

export function lineIntersectionXZ(p1, d1, p2, d2) {
    const denom = crossXZ(d1, d2);
    if (Math.abs(denom) <= EPS) return null;
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const t = (dx * d2.z - dz * d2.x) / denom;
    const u = (dx * d1.z - dz * d1.x) / denom;
    return { x: p1.x + d1.x * t, z: p1.z + d1.z * t, t, u };
}

export function computeEdgeFilletArcXZ({ p0, dir0, out0, p1, dir1, out1, radius }) {
    const r = Number.isFinite(radius) ? radius : 0;
    if (!(r > EPS)) return null;

    const d0 = normalizeDirXZ(dir0);
    const d1 = normalizeDirXZ(dir1);
    if (!d0 || !d1) return null;

    const o0 = normalizeDirXZ(out0);
    const o1 = normalizeDirXZ(out1);
    if (!o0 || !o1) return null;

    const p0s = { x: p0.x + o0.x * r, z: p0.z + o0.z * r };
    const p1s = { x: p1.x + o1.x * r, z: p1.z + o1.z * r };
    const hit = lineIntersectionXZ(p0s, d0, p1s, d1);
    if (!hit) return null;

    const center = { x: hit.x, z: hit.z };
    const t0 = { x: center.x - o0.x * r, z: center.z - o0.z * r };
    const t1 = { x: center.x - o1.x * r, z: center.z - o1.z * r };

    const r0 = { x: t0.x - center.x, z: t0.z - center.z };
    const baseTan = normalizeDirXZ(leftNormalXZ(r0));
    if (!baseTan) return null;
    const ccwScore = dotXZ(baseTan, d0);
    const cwScore = dotXZ({ x: -baseTan.x, z: -baseTan.z }, d0);
    const ccw = ccwScore >= cwScore;

    const a0 = Math.atan2(t0.z - center.z, t0.x - center.x);
    const a1 = Math.atan2(t1.z - center.z, t1.x - center.x);
    const span = ccw ? angleDeltaCCW(a0, a1) : angleDeltaCCW(a1, a0);
    if (!(span > 1e-6) || span > TAU - 1e-6) return null;

    const miter = lineIntersectionXZ(p0, d0, p1, d1);
    let trim0 = null;
    let trim1 = null;
    if (miter) {
        trim0 = (t0.x - miter.x) * d0.x + (t0.z - miter.z) * d0.z;
        trim1 = (t1.x - miter.x) * d1.x + (t1.z - miter.z) * d1.z;
    }

    return {
        center,
        radius: r,
        tangent0: t0,
        tangent1: t1,
        startAng: a0,
        spanAng: span,
        ccw,
        miter: miter ? { x: miter.x, z: miter.z } : null,
        trim0: Number.isFinite(trim0) ? trim0 : null,
        trim1: Number.isFinite(trim1) ? trim1 : null
    };
}

export function sampleArcXZ({ center, radius, startAng, spanAng, ccw = true, segments = 24 }) {
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) return [];
    if (!Number.isFinite(radius) || !(radius > EPS)) return [];
    if (!Number.isFinite(startAng) || !Number.isFinite(spanAng) || !(spanAng > 0)) return [];
    const n = clamp(Number(segments) | 0, 6, 96);
    const dir = ccw ? 1 : -1;
    const out = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = startAng + dir * spanAng * t;
        out.push({ x: center.x + Math.cos(a) * radius, z: center.z + Math.sin(a) * radius });
    }
    return out;
}
