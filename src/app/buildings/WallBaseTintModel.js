// src/app/buildings/WallBaseTintModel.js
// Shared wall-base tint state contract + conversion helpers.
// @ts-check

const EPS = 1e-9;

export const WALL_BASE_TINT_BRIGHTNESS_MIN = 0.0;
export const WALL_BASE_TINT_BRIGHTNESS_MAX = 2.0;

export const WALL_BASE_TINT_STATE_DEFAULT = Object.freeze({
    hueDeg: 0,
    saturation: 0,
    value: 1,
    intensity: 1,
    brightness: 1
});

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

export function normalizeHueDegrees(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return ((num % 360) + 360) % 360;
}

export function rgb01FromHex(hex, fallback = 0xffffff) {
    const fallbackHex = Number.isFinite(fallback) ? ((Number(fallback) >>> 0) & 0xffffff) : 0xffffff;
    const value = Number.isFinite(hex) ? ((Number(hex) >>> 0) & 0xffffff) : fallbackHex;
    return {
        r: ((value >> 16) & 0xff) / 255,
        g: ((value >> 8) & 0xff) / 255,
        b: (value & 0xff) / 255
    };
}

export function hexFromRgb01({ r = 1, g = 1, b = 1 } = {}) {
    const rr = clamp(r, 0, 1, 1);
    const gg = clamp(g, 0, 1, 1);
    const bb = clamp(b, 0, 1, 1);
    const ir = Math.round(rr * 255) & 0xff;
    const ig = Math.round(gg * 255) & 0xff;
    const ib = Math.round(bb * 255) & 0xff;
    return ((ir << 16) | (ig << 8) | ib) >>> 0;
}

export function hsvFromRgb01({ r = 1, g = 1, b = 1 } = {}) {
    const rr = clamp(r, 0, 1, 1);
    const gg = clamp(g, 0, 1, 1);
    const bb = clamp(b, 0, 1, 1);
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const delta = max - min;
    let hue = 0;
    if (delta > EPS) {
        if (max === rr) hue = ((gg - bb) / delta) % 6;
        else if (max === gg) hue = (bb - rr) / delta + 2;
        else hue = (rr - gg) / delta + 4;
        hue *= 60;
    }
    const saturation = max <= EPS ? 0 : (delta / max);
    return {
        hueDeg: normalizeHueDegrees(hue),
        saturation: clamp(saturation, 0, 1, 0),
        value: clamp(max, 0, 1, 1)
    };
}

export function rgb01FromHsv({ hueDeg = 0, saturation = 0, value = 1 } = {}) {
    const h = normalizeHueDegrees(hueDeg);
    const s = clamp(saturation, 0, 1, 0);
    const v = clamp(value, 0, 1, 1);
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let rr = 0;
    let gg = 0;
    let bb = 0;
    if (h < 60) {
        rr = c;
        gg = x;
    } else if (h < 120) {
        rr = x;
        gg = c;
    } else if (h < 180) {
        gg = c;
        bb = x;
    } else if (h < 240) {
        gg = x;
        bb = c;
    } else if (h < 300) {
        rr = x;
        bb = c;
    } else {
        rr = c;
        bb = x;
    }

    return {
        r: clamp(rr + m, 0, 1, 0),
        g: clamp(gg + m, 0, 1, 0),
        b: clamp(bb + m, 0, 1, 0)
    };
}

function inferLegacyIntensityFromHexRgb(rgb) {
    void rgb;
    // Legacy tint-only data did not encode tint influence explicitly.
    // Use full tint influence so hue/saturation/value controls remain immediately responsive.
    return 1;
}

export function deriveWallBaseTintStateFromTintHex(tintHex) {
    const rgb = rgb01FromHex(tintHex, 0xffffff);
    const hsv = hsvFromRgb01(rgb);
    return {
        hueDeg: hsv.hueDeg,
        saturation: hsv.saturation,
        value: hsv.value,
        intensity: inferLegacyIntensityFromHexRgb(rgb),
        brightness: 1
    };
}

export function sanitizeWallBaseTintState(value, fallback = WALL_BASE_TINT_STATE_DEFAULT) {
    const src = value && typeof value === 'object' ? value : {};
    const fb = fallback && typeof fallback === 'object' ? fallback : WALL_BASE_TINT_STATE_DEFAULT;
    return {
        hueDeg: normalizeHueDegrees(src.hueDeg ?? fb.hueDeg),
        saturation: clamp(src.saturation, 0, 1, clamp(fb.saturation, 0, 1, 0)),
        value: clamp(src.value, 0, 1, clamp(fb.value, 0, 1, 1)),
        intensity: clamp(src.intensity, 0, 1, clamp(fb.intensity, 0, 1, 1)),
        brightness: clamp(
            src.brightness,
            WALL_BASE_TINT_BRIGHTNESS_MIN,
            WALL_BASE_TINT_BRIGHTNESS_MAX,
            clamp(fb.brightness, WALL_BASE_TINT_BRIGHTNESS_MIN, WALL_BASE_TINT_BRIGHTNESS_MAX, 1)
        )
    };
}

function normalizeTintHexValue(value, fallback = 0xffffff) {
    return Number.isFinite(value) ? ((Number(value) >>> 0) & 0xffffff) : ((Number(fallback) >>> 0) & 0xffffff);
}

export function resolveWallBaseTintStateFromWallBase(value, fallbackState = WALL_BASE_TINT_STATE_DEFAULT) {
    const src = value && typeof value === 'object' ? value : {};
    const tintRaw = src.tintHex ?? src.tint ?? src.albedoTint ?? src.albedoTintHex ?? 0xffffff;
    const tintHex = normalizeTintHexValue(tintRaw, 0xffffff);
    const derived = deriveWallBaseTintStateFromTintHex(tintHex);
    const fallback = sanitizeWallBaseTintState(fallbackState, WALL_BASE_TINT_STATE_DEFAULT);
    const hasExplicitHue = src.tintHueDeg !== undefined || src.tintHue !== undefined || src.hueDeg !== undefined || src.hue !== undefined;
    const hasExplicitSaturation = src.tintSaturation !== undefined || src.saturation !== undefined || src.tintSat !== undefined;
    const hasExplicitValue = src.tintValue !== undefined || src.value !== undefined || src.tintVal !== undefined;
    const hasExplicitIntensity = src.tintIntensity !== undefined || src.intensity !== undefined;
    const hasExplicitBrightness = src.tintBrightness !== undefined || src.brightness !== undefined || src.brightnessMul !== undefined;
    return sanitizeWallBaseTintState({
        hueDeg: hasExplicitHue
            ? (src.tintHueDeg ?? src.tintHue ?? src.hueDeg ?? src.hue)
            : derived.hueDeg,
        saturation: hasExplicitSaturation
            ? (src.tintSaturation ?? src.saturation ?? src.tintSat)
            : derived.saturation,
        value: hasExplicitValue
            ? (src.tintValue ?? src.value ?? src.tintVal)
            : derived.value,
        intensity: hasExplicitIntensity
            ? (src.tintIntensity ?? src.intensity)
            : (derived.intensity ?? fallback.intensity),
        brightness: hasExplicitBrightness
            ? (src.tintBrightness ?? src.brightness ?? src.brightnessMul)
            : fallback.brightness
    }, fallback);
}

export function composeTintRgb01FromState(value) {
    const state = sanitizeWallBaseTintState(value, WALL_BASE_TINT_STATE_DEFAULT);
    const pure = rgb01FromHsv(state);
    const mix = clamp(state.intensity, 0, 1, 1);
    const brightness = clamp(state.brightness, WALL_BASE_TINT_BRIGHTNESS_MIN, WALL_BASE_TINT_BRIGHTNESS_MAX, 1);
    const tinted = {
        r: clamp((1 - mix) + (pure.r * mix), 0, 1, 1),
        g: clamp((1 - mix) + (pure.g * mix), 0, 1, 1),
        b: clamp((1 - mix) + (pure.b * mix), 0, 1, 1)
    };
    if (brightness <= 1 + EPS) {
        return {
            r: clamp(tinted.r * brightness, 0, 1, 1),
            g: clamp(tinted.g * brightness, 0, 1, 1),
            b: clamp(tinted.b * brightness, 0, 1, 1)
        };
    }
    // Brightness above 1 transitions toward white, rather than clipping channels.
    const whiteLift = clamp(
        (brightness - 1) / Math.max(EPS, WALL_BASE_TINT_BRIGHTNESS_MAX - 1),
        0,
        1,
        0
    );
    return {
        r: clamp(tinted.r + (1 - tinted.r) * whiteLift, 0, 1, 1),
        g: clamp(tinted.g + (1 - tinted.g) * whiteLift, 0, 1, 1),
        b: clamp(tinted.b + (1 - tinted.b) * whiteLift, 0, 1, 1)
    };
}

export function composeTintHexFromState(value) {
    return hexFromRgb01(composeTintRgb01FromState(value));
}

export function resolveWallBaseTintHexFromWallBase(value) {
    const state = resolveWallBaseTintStateFromWallBase(value, WALL_BASE_TINT_STATE_DEFAULT);
    return composeTintHexFromState(state);
}

export function applyWallBaseTintStateToWallBase(target, state) {
    const out = target && typeof target === 'object' ? target : {};
    const normalized = sanitizeWallBaseTintState(state, WALL_BASE_TINT_STATE_DEFAULT);
    out.tintHueDeg = normalized.hueDeg;
    out.tintSaturation = normalized.saturation;
    out.tintValue = normalized.value;
    out.tintIntensity = normalized.intensity;
    out.tintBrightness = normalized.brightness;
    out.tintHex = composeTintHexFromState(normalized);
    return out;
}
