// src/graphics/gui/inspector_room/InspectorRoomLightUtils.js
// Math helpers for Inspector Room lighting widgets.

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

export function lightSignedExpSliderToValue(sliderValue, { maxAbs = 25, exponent = 3 } = {}) {
    const max = Number.isFinite(Number(maxAbs)) ? Math.max(0.001, Number(maxAbs)) : 25;
    const exp = Number.isFinite(Number(exponent)) ? Math.max(1, Number(exponent)) : 3;
    const t = clamp(sliderValue, -1, 1);
    const mag = Math.pow(Math.abs(t), exp) * max;
    return Math.sign(t) * mag;
}

export function lightSignedExpValueToSlider(value, { maxAbs = 25, exponent = 3 } = {}) {
    const max = Number.isFinite(Number(maxAbs)) ? Math.max(0.001, Number(maxAbs)) : 25;
    const exp = Number.isFinite(Number(exponent)) ? Math.max(1, Number(exponent)) : 3;
    const v = clamp(value, -max, max);
    const mag = Math.pow(Math.abs(v) / max, 1 / exp);
    return clamp(Math.sign(v) * mag, -1, 1);
}

