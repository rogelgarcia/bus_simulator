// src/graphics/gui/markings_aa_debugger/MarkingsAADebuggerSettings.js
// Pure settings + sanitization for the Markings AA Debugger tool.
// @ts-check

const DEFAULT_SEED = 'markings-aa-debug';

export const MARKINGS_AA_DEBUGGER_DEFAULTS = Object.freeze({
    viewMode: 'normal',
    markingsBufferScale: 2.0,
    markingsBufferSamples: 4,
    markingsVizBackgroundColor: '#2A2F36',
    depthVizRangeMeters: 200,
    depthVizPower: 1.6,
    markingsOcclusionBiasMeters: 0.02,
    seed: DEFAULT_SEED,
    occluderCount: 22
});

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max, fallback) {
    const num = Math.trunc(Number(value));
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function normalizeHexColor(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return null;
    const v = raw.startsWith('#') ? raw.slice(1) : (raw.toLowerCase().startsWith('0x') ? raw.slice(2) : raw);
    if (v.length === 3 && /^[0-9a-fA-F]{3}$/.test(v)) {
        const r = v[0];
        const g = v[1];
        const b = v[2];
        return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    if (v.length === 6 && /^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`.toUpperCase();
    return null;
}

function sanitizeViewMode(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'scene') return 'normal';
    if (raw === 'normal' || raw === 'depth' || raw === 'markings' || raw === 'composite') return raw;
    return MARKINGS_AA_DEBUGGER_DEFAULTS.viewMode;
}

function sanitizeMsaaSamples(value) {
    const num = Math.round(clamp(value, 0, 16, MARKINGS_AA_DEBUGGER_DEFAULTS.markingsBufferSamples));
    if (num <= 0) return 0;
    if (num <= 2) return 2;
    if (num <= 4) return 4;
    return 8;
}

export function sanitizeMarkingsAADebuggerSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const seedRaw = typeof src.seed === 'string' ? src.seed.trim() : '';
    const seed = seedRaw || DEFAULT_SEED;

    return {
        viewMode: sanitizeViewMode(src.viewMode),
        markingsBufferScale: clamp(src.markingsBufferScale, 1, 4, MARKINGS_AA_DEBUGGER_DEFAULTS.markingsBufferScale),
        markingsBufferSamples: sanitizeMsaaSamples(src.markingsBufferSamples),
        markingsVizBackgroundColor: normalizeHexColor(src.markingsVizBackgroundColor) ?? MARKINGS_AA_DEBUGGER_DEFAULTS.markingsVizBackgroundColor,
        depthVizRangeMeters: clamp(src.depthVizRangeMeters, 5, 5000, MARKINGS_AA_DEBUGGER_DEFAULTS.depthVizRangeMeters),
        depthVizPower: clamp(src.depthVizPower, 0.25, 8, MARKINGS_AA_DEBUGGER_DEFAULTS.depthVizPower),
        markingsOcclusionBiasMeters: clamp(src.markingsOcclusionBiasMeters, 0, 0.5, MARKINGS_AA_DEBUGGER_DEFAULTS.markingsOcclusionBiasMeters),
        seed,
        occluderCount: clampInt(src.occluderCount, 0, 120, MARKINGS_AA_DEBUGGER_DEFAULTS.occluderCount)
    };
}
