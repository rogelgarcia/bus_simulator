// src/graphics/content3d/lighting/IBLConfig.js
// Resolves IBL configuration using stable catalog ids.
import { DEFAULT_IBL_ID, getIblEntryById } from '../catalogs/IBLCatalog.js';

export const IBL_DEFAULTS = Object.freeze({
    enabled: false,
    envMapIntensity: 0.25,
    iblId: DEFAULT_IBL_ID,
    setBackground: false,
    hdrUrl: null
});

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function parseBool(value, fallback) {
    if (value === null || value === undefined) return fallback;
    const v = String(value).trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
    return fallback;
}

function parseNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return clamp(num, min, max);
}

export function getIBLConfig(overrides = {}, { includeUrlOverrides = true } = {}) {
    const config = { ...IBL_DEFAULTS, ...(overrides ?? {}) };

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.has('ibl')) config.enabled = parseBool(params.get('ibl'), config.enabled);
        if (params.has('iblIntensity')) {
            config.envMapIntensity = parseNumber(params.get('iblIntensity'), config.envMapIntensity, { min: 0, max: 5 });
        }
        if (params.has('iblBackground')) config.setBackground = parseBool(params.get('iblBackground'), config.setBackground);
        if (params.has('iblId')) config.iblId = params.get('iblId') ?? config.iblId;
    }

    const entry = getIblEntryById(config.iblId) ?? getIblEntryById(DEFAULT_IBL_ID);
    const resolvedId = entry?.id ?? DEFAULT_IBL_ID;
    const resolvedUrl = typeof config.hdrUrl === 'string' && config.hdrUrl
        ? config.hdrUrl
        : (entry?.hdrUrl ?? null);

    return {
        ...config,
        iblId: resolvedId,
        iblLabel: entry?.label ?? resolvedId,
        hdrUrl: resolvedUrl,
        previewUrl: entry?.previewUrl ?? null
    };
}
