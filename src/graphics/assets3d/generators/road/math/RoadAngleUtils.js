// src/graphics/assets3d/generators/road/math/RoadAngleUtils.js
import {
    ANGLE_BUCKETS,
    ANGLE_SNAP_RAD,
    COLOR_LIGHTNESS,
    COLOR_SATURATION,
    EPS,
    HALF_TURN_RAD
} from '../RoadConstants.js';

export function normalizeHalfTurn(angle) {
    let a = angle % HALF_TURN_RAD;
    if (a < 0) a += HALF_TURN_RAD;
    if (Math.abs(a - HALF_TURN_RAD) <= EPS) return 0;
    return a;
}

export function snapAngle(angle) {
    const base = normalizeHalfTurn(angle);
    const snapped = Math.round(base / ANGLE_SNAP_RAD) * ANGLE_SNAP_RAD;
    return normalizeHalfTurn(snapped);
}

export function normalizeDir(x, y) {
    const len = Math.hypot(x, y);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: x * inv, y: y * inv };
}

export function angleIndex(angle) {
    const snapped = snapAngle(angle);
    const idx = Math.round(snapped / ANGLE_SNAP_RAD);
    return ((idx % ANGLE_BUCKETS) + ANGLE_BUCKETS) % ANGLE_BUCKETS;
}

export function angleColorHex(index, tmpColor) {
    const t = index / ANGLE_BUCKETS;
    tmpColor.setHSL(t, COLOR_SATURATION, COLOR_LIGHTNESS);
    return tmpColor.getHex();
}
