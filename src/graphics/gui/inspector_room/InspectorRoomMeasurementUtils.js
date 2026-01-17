// src/graphics/gui/inspector_room/InspectorRoomMeasurementUtils.js
// Small shared helpers for measurement overlays.
function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

export function computeBoundsSize({ min, max } = {}) {
    const mn = min && typeof min === 'object' ? min : null;
    const mx = max && typeof max === 'object' ? max : null;
    const dx = Number(mx?.x) - Number(mn?.x);
    const dy = Number(mx?.y) - Number(mn?.y);
    const dz = Number(mx?.z) - Number(mn?.z);
    if (!(Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(dz))) return null;
    return { x: dx, y: dy, z: dz };
}

export function formatMeters(value, { digits = 2 } = {}) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    const d = clampInt(digits, 0, 6);
    return `${num.toFixed(d)}m`;
}
