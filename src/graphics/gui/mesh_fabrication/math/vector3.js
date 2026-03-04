// src/graphics/gui/mesh_fabrication/math/vector3.js

export function isFiniteVec3(value) {
    return Array.isArray(value)
        && value.length === 3
        && Number.isFinite(Number(value[0]))
        && Number.isFinite(Number(value[1]))
        && Number.isFinite(Number(value[2]));
}

export function addVec3(a, b) {
    return [
        Number(a[0]) + Number(b[0]),
        Number(a[1]) + Number(b[1]),
        Number(a[2]) + Number(b[2])
    ];
}

export function subVec3(a, b) {
    return [
        Number(a[0]) - Number(b[0]),
        Number(a[1]) - Number(b[1]),
        Number(a[2]) - Number(b[2])
    ];
}

export function scaleVec3(v, s) {
    const scalar = Number(s);
    return [
        Number(v[0]) * scalar,
        Number(v[1]) * scalar,
        Number(v[2]) * scalar
    ];
}

export function dotVec3(a, b) {
    return (Number(a[0]) * Number(b[0]))
        + (Number(a[1]) * Number(b[1]))
        + (Number(a[2]) * Number(b[2]));
}

export function crossVec3(a, b) {
    const ax = Number(a[0]);
    const ay = Number(a[1]);
    const az = Number(a[2]);
    const bx = Number(b[0]);
    const by = Number(b[1]);
    const bz = Number(b[2]);
    return [
        (ay * bz) - (az * by),
        (az * bx) - (ax * bz),
        (ax * by) - (ay * bx)
    ];
}

export function lengthVec3(v) {
    return Math.hypot(Number(v[0]), Number(v[1]), Number(v[2]));
}

export function normalizeVec3(v, epsilon = 1e-8) {
    const len = lengthVec3(v);
    if (!Number.isFinite(len) || len <= epsilon) return [0, 0, 0];
    return [
        Number(v[0]) / len,
        Number(v[1]) / len,
        Number(v[2]) / len
    ];
}

export function arrayAlmostEqual(a, b, epsilon = 1e-6) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (Math.abs(Number(a[i]) - Number(b[i])) > epsilon) return false;
    }
    return true;
}
