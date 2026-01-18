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

export function lightBiasedSignedExpSliderToValue(sliderValue, { maxAbs = 25, exponent = 3, zeroAt = 0.25 } = {}) {
    const max = Number.isFinite(Number(maxAbs)) ? Math.max(0.001, Number(maxAbs)) : 25;
    const exp = Number.isFinite(Number(exponent)) ? Math.max(1, Number(exponent)) : 3;
    const pivot = clamp(zeroAt, 0.01, 0.99);
    const t = clamp(sliderValue, 0, 1);
    if (t < pivot) {
        const u = t / pivot;
        return -Math.pow(1 - u, exp) * max;
    }
    const u = (t - pivot) / (1 - pivot);
    return Math.pow(u, exp) * max;
}

export function lightBiasedSignedExpValueToSlider(value, { maxAbs = 25, exponent = 3, zeroAt = 0.25 } = {}) {
    const max = Number.isFinite(Number(maxAbs)) ? Math.max(0.001, Number(maxAbs)) : 25;
    const exp = Number.isFinite(Number(exponent)) ? Math.max(1, Number(exponent)) : 3;
    const pivot = clamp(zeroAt, 0.01, 0.99);
    const v = clamp(value, -max, max);

    if (v < 0) {
        const u = 1 - Math.pow(Math.abs(v) / max, 1 / exp);
        return clamp(u * pivot, 0, pivot);
    }
    const u = Math.pow(Math.abs(v) / max, 1 / exp);
    return clamp(pivot + u * (1 - pivot), pivot, 1);
}

function quantize(value, step) {
    const v = Number(value);
    const s = Number(step);
    if (!(Number.isFinite(v) && Number.isFinite(s) && s > 0)) return v;
    return Math.round(v / s) * s;
}

function rgb01ToHexInt({ r, g, b }) {
    const rr = Math.round(clamp(r, 0, 1) * 255);
    const gg = Math.round(clamp(g, 0, 1) * 255);
    const bb = Math.round(clamp(b, 0, 1) * 255);
    return (rr << 16) | (gg << 8) | bb;
}

function hexIntToRgb01(hex) {
    const n = Number(hex);
    const safe = Number.isFinite(n) ? (n >>> 0) : 0xffffff;
    return {
        r: ((safe >> 16) & 0xff) / 255,
        g: ((safe >> 8) & 0xff) / 255,
        b: (safe & 0xff) / 255
    };
}

function hsv01ToRgb01({ h, s, v }) {
    const hh = ((Number(h) % 1) + 1) % 1;
    const ss = clamp(s, 0, 1);
    const vv = clamp(v, 0, 1);

    const c = vv * ss;
    const x = c * (1 - Math.abs(((hh * 6) % 2) - 1));
    const m = vv - c;

    let r = 0;
    let g = 0;
    let b = 0;

    const sector = Math.floor(hh * 6);
    if (sector === 0) { r = c; g = x; b = 0; }
    else if (sector === 1) { r = x; g = c; b = 0; }
    else if (sector === 2) { r = 0; g = c; b = x; }
    else if (sector === 3) { r = 0; g = x; b = c; }
    else if (sector === 4) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return { r: r + m, g: g + m, b: b + m };
}

function rgb01ToHsv01({ r, g, b }) {
    const rr = clamp(r, 0, 1);
    const gg = clamp(g, 0, 1);
    const bb = clamp(b, 0, 1);

    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const delta = max - min;

    let h = 0;
    if (delta > 1e-10) {
        if (max === rr) h = ((gg - bb) / delta) % 6;
        else if (max === gg) h = (bb - rr) / delta + 2;
        else h = (rr - gg) / delta + 4;
        h /= 6;
        if (h < 0) h += 1;
    }

    const s = max <= 1e-10 ? 0 : delta / max;
    const v = max;
    return { h, s, v };
}

function rgb01SquaredError(a, b) {
    const dr = (Number(a?.r) || 0) - (Number(b?.r) || 0);
    const dg = (Number(a?.g) || 0) - (Number(b?.g) || 0);
    const db = (Number(a?.b) || 0) - (Number(b?.b) || 0);
    return dr * dr + dg * dg + db * db;
}

export function lightHueToneToHexInt(hueDegrees, tone, { hueStep = 1, toneStep = 0.01 } = {}) {
    const hue = quantize(clamp(Number(hueDegrees) || 0, 0, 360), hueStep);
    const t = quantize(clamp(Number(tone) || 0, -1, 1), toneStep);

    const base = hsv01ToRgb01({ h: (hue % 360) / 360, s: 1, v: 1 });
    const mix = t < 0
        ? { r: base.r * (1 + t), g: base.g * (1 + t), b: base.b * (1 + t) }
        : { r: base.r * (1 - t) + t, g: base.g * (1 - t) + t, b: base.b * (1 - t) + t };

    return rgb01ToHexInt(mix);
}

export function lightHexIntToHueTone(hex, { fallbackHueDegrees = 0, hueStep = 1, toneStep = 0.01 } = {}) {
    const rgb = hexIntToRgb01(hex);
    const hsv = rgb01ToHsv01(rgb);
    const fallbackHue = clamp(Number(fallbackHueDegrees) || 0, 0, 360);
    const rawHue = hsv.s < 0.02 ? fallbackHue : (hsv.h * 360);
    const hue = quantize(clamp(rawHue, 0, 360), hueStep);

    const base = hsv01ToRgb01({ h: (hue % 360) / 360, s: 1, v: 1 });

    const baseLen = base.r * base.r + base.g * base.g + base.b * base.b;
    const scale = baseLen > 1e-10 ? clamp((rgb.r * base.r + rgb.g * base.g + rgb.b * base.b) / baseLen, 0, 1) : 0;
    const toneBlack = quantize(clamp(scale - 1, -1, 0), toneStep);
    const rgbBlack = { r: base.r * (1 + toneBlack), g: base.g * (1 + toneBlack), b: base.b * (1 + toneBlack) };

    const dr = 1 - base.r;
    const dg = 1 - base.g;
    const db = 1 - base.b;
    const dLen = dr * dr + dg * dg + db * db;
    const toneWhiteRaw = dLen > 1e-10 ? clamp(((rgb.r - base.r) * dr + (rgb.g - base.g) * dg + (rgb.b - base.b) * db) / dLen, 0, 1) : 0;
    const toneWhite = quantize(toneWhiteRaw, toneStep);
    const rgbWhite = { r: base.r * (1 - toneWhite) + toneWhite, g: base.g * (1 - toneWhite) + toneWhite, b: base.b * (1 - toneWhite) + toneWhite };

    const errBlack = rgb01SquaredError(rgb, rgbBlack);
    const errWhite = rgb01SquaredError(rgb, rgbWhite);

    return errBlack <= errWhite ? { hueDegrees: hue, tone: toneBlack } : { hueDegrees: hue, tone: toneWhite };
}
