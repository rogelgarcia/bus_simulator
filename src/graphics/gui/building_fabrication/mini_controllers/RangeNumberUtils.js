// src/graphics/gui/building_fabrication/mini_controllers/RangeNumberUtils.js
// Numeric helpers for building fabrication mini controllers.

export function clampNumber(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

export function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

export function formatFixed(value, digits = 1) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    const d = Number.isFinite(digits) ? Math.max(0, Math.round(digits)) : 0;
    return num.toFixed(d);
}

