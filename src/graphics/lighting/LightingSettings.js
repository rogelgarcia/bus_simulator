// src/graphics/lighting/LightingSettings.js
// Persisted global lighting settings (IBL + exposure + common light intensities).

import { getIBLConfig, IBL_DEFAULTS } from './IBL.js';

const STORAGE_KEY = 'bus_sim.lighting.v1';

export const LIGHTING_DEFAULTS = Object.freeze({
    exposure: 1.6,
    hemiIntensity: 0.85,
    sunIntensity: 1.2,
    ibl: {
        enabled: IBL_DEFAULTS.enabled,
        envMapIntensity: IBL_DEFAULTS.envMapIntensity,
        setBackground: IBL_DEFAULTS.setBackground
    }
});

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function readUrlParamNumber(params, key, fallback, { min = -Infinity, max = Infinity } = {}) {
    if (!params?.has?.(key)) return fallback;
    const raw = params.get(key);
    const num = Number(raw);
    if (!Number.isFinite(num)) return fallback;
    return clamp(num, min, max);
}

function readUrlParamBool(params, key, fallback) {
    if (!params?.has?.(key)) return fallback;
    const raw = params.get(key);
    const v = String(raw).trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
    return fallback;
}

function sanitizeLightingSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const ibl = src.ibl && typeof src.ibl === 'object' ? src.ibl : {};

    return {
        exposure: clamp(src.exposure ?? LIGHTING_DEFAULTS.exposure, 0.1, 5),
        hemiIntensity: clamp(src.hemiIntensity ?? LIGHTING_DEFAULTS.hemiIntensity, 0, 5),
        sunIntensity: clamp(src.sunIntensity ?? LIGHTING_DEFAULTS.sunIntensity, 0, 10),
        ibl: {
            enabled: ibl.enabled !== undefined ? !!ibl.enabled : LIGHTING_DEFAULTS.ibl.enabled,
            envMapIntensity: clamp(ibl.envMapIntensity ?? LIGHTING_DEFAULTS.ibl.envMapIntensity, 0, 5),
            setBackground: ibl.setBackground !== undefined ? !!ibl.setBackground : LIGHTING_DEFAULTS.ibl.setBackground
        }
    };
}

export function loadSavedLightingSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const saved = sanitizeLightingSettings(JSON.parse(raw));
        const isLegacyDefault = saved.exposure === LIGHTING_DEFAULTS.exposure
            && saved.hemiIntensity === LIGHTING_DEFAULTS.hemiIntensity
            && saved.sunIntensity === LIGHTING_DEFAULTS.sunIntensity
            && saved.ibl.enabled === true
            && saved.ibl.envMapIntensity === LIGHTING_DEFAULTS.ibl.envMapIntensity
            && saved.ibl.setBackground === LIGHTING_DEFAULTS.ibl.setBackground;
        if (isLegacyDefault) saved.ibl.enabled = LIGHTING_DEFAULTS.ibl.enabled;
        return saved;
    } catch {
        return null;
    }
}

export function saveLightingSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeLightingSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedLightingSettings() {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    try {
        storage.removeItem(STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}

export function getResolvedLightingSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedLightingSettings();
    const merged = sanitizeLightingSettings({ ...LIGHTING_DEFAULTS, ...(saved ?? {}) });

    let exposure = merged.exposure;
    let hemiIntensity = merged.hemiIntensity;
    let sunIntensity = merged.sunIntensity;

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        exposure = readUrlParamNumber(params, 'exposure', exposure, { min: 0.1, max: 5 });
        hemiIntensity = readUrlParamNumber(params, 'hemiIntensity', hemiIntensity, { min: 0, max: 5 });
        sunIntensity = readUrlParamNumber(params, 'sunIntensity', sunIntensity, { min: 0, max: 10 });

        const legacyBg = readUrlParamBool(params, 'iblBackground', merged.ibl.setBackground);
        merged.ibl.setBackground = legacyBg;
    }

    const ibl = getIBLConfig(merged.ibl, { includeUrlOverrides });

    return {
        exposure,
        hemiIntensity,
        sunIntensity,
        ibl
    };
}

export function getDefaultResolvedLightingSettings() {
    const ibl = getIBLConfig(LIGHTING_DEFAULTS.ibl, { includeUrlOverrides: false });
    return {
        exposure: LIGHTING_DEFAULTS.exposure,
        hemiIntensity: LIGHTING_DEFAULTS.hemiIntensity,
        sunIntensity: LIGHTING_DEFAULTS.sunIntensity,
        ibl
    };
}
