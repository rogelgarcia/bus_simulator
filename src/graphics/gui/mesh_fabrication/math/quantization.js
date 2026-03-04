// src/graphics/gui/mesh_fabrication/math/quantization.js

export const DEFAULT_KEY_DECIMALS = 6;

export function formatQuantizedNumber(value, decimals = DEFAULT_KEY_DECIMALS) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    const pow = 10 ** decimals;
    const rounded = Math.round(numeric * pow) / pow;
    return rounded.toFixed(decimals);
}

export function vectorQuantizedKey(v, decimals = DEFAULT_KEY_DECIMALS) {
    return `${formatQuantizedNumber(v[0], decimals)}|${formatQuantizedNumber(v[1], decimals)}|${formatQuantizedNumber(v[2], decimals)}`;
}

export function stableEdgeKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function padOrdinal(value, width = 3) {
    return String(Math.max(0, Number(value) | 0)).padStart(width, '0');
}
