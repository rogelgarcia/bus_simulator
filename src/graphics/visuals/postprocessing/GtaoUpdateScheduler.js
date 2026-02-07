// src/graphics/visuals/postprocessing/GtaoUpdateScheduler.js
// Helpers for scheduling GTAO updates and detecting camera view state changes.
// @ts-check

const FIXED_RATE_INTERVAL_FRAMES = Object.freeze({
    every_frame: 1,
    half_rate: 2,
    third_rate: 3,
    quarter_rate: 4
});

function getNum(value, fallback = Number.NaN) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function nearlyEqual(a, b, eps = 1e-6) {
    return Math.abs(a - b) <= eps;
}

function quatAngleDeg(a, b) {
    const ax = getNum(a?.x);
    const ay = getNum(a?.y);
    const az = getNum(a?.z);
    const aw = getNum(a?.w);
    const bx = getNum(b?.x);
    const by = getNum(b?.y);
    const bz = getNum(b?.z);
    const bw = getNum(b?.w);
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az) || !Number.isFinite(aw)) return Infinity;
    if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz) || !Number.isFinite(bw)) return Infinity;

    let dot = ax * bx + ay * by + az * bz + aw * bw;
    dot = Math.max(-1, Math.min(1, dot));
    const angle = 2 * Math.acos(Math.abs(dot));
    return angle * 180 / Math.PI;
}

function distSq(a, b) {
    const ax = getNum(a?.x);
    const ay = getNum(a?.y);
    const az = getNum(a?.z);
    const bx = getNum(b?.x);
    const by = getNum(b?.y);
    const bz = getNum(b?.z);
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) return Infinity;
    if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return Infinity;

    const dx = ax - bx;
    const dy = ay - by;
    const dz = az - bz;
    return dx * dx + dy * dy + dz * dz;
}

export function getFixedRateGtaoIntervalFrames(updateMode) {
    const raw = typeof updateMode === 'string' ? updateMode.trim().toLowerCase() : '';
    return FIXED_RATE_INTERVAL_FRAMES[raw] ?? null;
}

export function shouldUpdateGtaoFixedRate({ updateMode, frameIndex }) {
    const interval = getFixedRateGtaoIntervalFrames(updateMode);
    if (!interval) return false;
    const idx = Math.max(0, Math.floor(getNum(frameIndex, 0)));
    return (idx % interval) === 0;
}

export function hasCameraViewStateChanged(prev, next, { positionMeters = 0, rotationDeg = 0, fovDeg = 0 } = {}) {
    if (!prev || !next) return true;

    const posThreshold = Math.max(0, getNum(positionMeters, 0));
    const rotThreshold = Math.max(0, getNum(rotationDeg, 0));
    const fovThreshold = Math.max(0, getNum(fovDeg, 0));

    const posSq = distSq(prev.position, next.position);
    if (posSq > posThreshold * posThreshold) return true;

    const rot = quatAngleDeg(prev.quaternion, next.quaternion);
    if (rot > rotThreshold) return true;

    const prevProj = prev.projection ?? null;
    const nextProj = next.projection ?? null;
    const prevType = typeof prevProj?.type === 'string' ? prevProj.type : 'unknown';
    const nextType = typeof nextProj?.type === 'string' ? nextProj.type : 'unknown';
    if (prevType !== nextType) return true;

    const keys = prevType === 'orthographic'
        ? ['left', 'right', 'top', 'bottom', 'near', 'far', 'zoom']
        : ['fov', 'aspect', 'near', 'far', 'zoom'];

    for (const key of keys) {
        const a = getNum(prevProj?.[key]);
        const b = getNum(nextProj?.[key]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return true;

        if (key === 'fov') {
            if (Math.abs(a - b) > fovThreshold) return true;
            continue;
        }

        if (!nearlyEqual(a, b, 1e-6)) return true;
    }

    return false;
}

