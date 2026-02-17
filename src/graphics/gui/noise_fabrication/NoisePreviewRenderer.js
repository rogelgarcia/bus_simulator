// src/graphics/gui/noise_fabrication/NoisePreviewRenderer.js
// Converts generated scalar noise fields to preview RGBA buffers.
// @ts-check

function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

function clamp255(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 255) return 255;
    return Math.round(n);
}

function normalizeHexColor(value, fallback = '#888888') {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return fallback;
    const v = raw.startsWith('#') ? raw.slice(1) : (raw.toLowerCase().startsWith('0x') ? raw.slice(2) : raw);
    if (v.length === 3 && /^[0-9a-fA-F]{3}$/.test(v)) {
        return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`.toUpperCase();
    }
    if (v.length === 6 && /^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`.toUpperCase();
    return fallback;
}

export function hexColorToRgb(colorHex) {
    const hex = normalizeHexColor(colorHex, '#888888').slice(1);
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
    };
}

function sampleField(field, width, height, x, y) {
    const sx = Math.max(0, Math.min(width - 1, x));
    const sy = Math.max(0, Math.min(height - 1, y));
    return clamp01(field[sy * width + sx] ?? 0);
}

export function renderNoiseFieldToRgba(field, width, height, {
    previewMode = 'texture',
    baseColor = '#888888',
    normalStrength = 2.0
} = {}) {
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    const src = field instanceof Float32Array && field.length >= w * h ? field : new Float32Array(w * h);
    const rgba = new Uint8ClampedArray(w * h * 4);

    if (previewMode === 'normal') {
        const strength = Math.max(0.01, Number(normalStrength) || 2.0);
        let outIdx = 0;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const left = sampleField(src, w, h, x - 1, y);
                const right = sampleField(src, w, h, x + 1, y);
                const down = sampleField(src, w, h, x, y - 1);
                const up = sampleField(src, w, h, x, y + 1);
                const dx = (right - left) * strength;
                const dy = (up - down) * strength;

                let nx = -dx;
                let ny = -dy;
                let nz = 1.0;
                const invLen = 1.0 / Math.max(1e-6, Math.hypot(nx, ny, nz));
                nx *= invLen;
                ny *= invLen;
                nz *= invLen;

                rgba[outIdx++] = clamp255((nx * 0.5 + 0.5) * 255);
                rgba[outIdx++] = clamp255((ny * 0.5 + 0.5) * 255);
                rgba[outIdx++] = clamp255((nz * 0.5 + 0.5) * 255);
                rgba[outIdx++] = 255;
            }
        }

        return rgba;
    }

    const rgb = hexColorToRgb(baseColor);
    let outIdx = 0;
    for (let i = 0; i < w * h; i++) {
        const v = clamp01(src[i]);
        const shade = 0.3 + v * 0.95;
        const detail = (v - 0.5) * 0.09;
        rgba[outIdx++] = clamp255(rgb.r * shade + 255 * detail);
        rgba[outIdx++] = clamp255(rgb.g * shade + 220 * detail);
        rgba[outIdx++] = clamp255(rgb.b * shade + 200 * detail);
        rgba[outIdx++] = 255;
    }

    return rgba;
}
