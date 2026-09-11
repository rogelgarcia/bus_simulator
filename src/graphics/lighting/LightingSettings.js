// src/graphics/lighting/LightingSettings.js
// Global lighting resolution (L1 defaults + L2 persisted overrides + optional calibration snapshot replacement).

import { getIBLConfig, IBL_DEFAULTS } from '../content3d/lighting/IBLConfig.js';
import { CALIBRATED_DAYLIGHT } from './CalibratedDaylight.js';

const STORAGE_KEY = 'bus_sim.lighting.v1';

const LEGACY_LIGHTING_DEFAULTS_V1 = Object.freeze({
    exposure: 1.6,
    toneMapping: 'aces',
    hemiIntensity: 0.85,
    sunIntensity: 1.2,
    ibl: {
        enabled: false,
        envMapIntensity: IBL_DEFAULTS.envMapIntensity,
        setBackground: IBL_DEFAULTS.setBackground
    }
});

const LEGACY_LIGHTING_DEFAULTS_V0 = Object.freeze({
    ...LEGACY_LIGHTING_DEFAULTS_V1,
    ibl: {
        ...LEGACY_LIGHTING_DEFAULTS_V1.ibl,
        enabled: true
    }
});

const LEGACY_LIGHTING_DEFAULTS_V2 = Object.freeze({
    exposure: 0.59,
    toneMapping: 'aces',
    hemiIntensity: 4.26,
    sunIntensity: 10,
    ibl: {
        enabled: true,
        envMapIntensity: 0.59,
        setBackground: false
    }
});

export const LIGHTING_DEFAULTS = Object.freeze({
    exposure: CALIBRATED_DAYLIGHT.exposure,
    toneMapping: 'aces',
    hemiIntensity: CALIBRATED_DAYLIGHT.hemisphereIntensity,
    sunIntensity: CALIBRATED_DAYLIGHT.sunNormalRgb[0],
    sunColorLinear: Object.freeze(CALIBRATED_DAYLIGHT.sunNormalRgb.map(v => v / CALIBRATED_DAYLIGHT.sunNormalRgb[0])),
    ibl: {
        enabled: true,
        iblId: CALIBRATED_DAYLIGHT.environmentId,
        envMapIntensity: CALIBRATED_DAYLIGHT.environmentIntensity,
        setBackground: true
    }
});

export const LIGHTING_LIMITS = Object.freeze({
    exposureMin: .001,
    hemiIntensityMax: 30,
    sunIntensityMax: 200
});

export const LIGHTING_TONE_MAPPING_MODES = Object.freeze(['aces', 'agx', 'neutral']);
export const LIGHTING_RESOLUTION_MODES = Object.freeze({
    DEFAULT: 'default',
    CALIBRATION_PRESET: 'calibration_preset'
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

export function sanitizeToneMappingMode(value, fallback = LIGHTING_DEFAULTS.toneMapping) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'aces' || raw === 'agx' || raw === 'neutral') return raw;
    return typeof fallback === 'string' ? sanitizeToneMappingMode(fallback, 'aces') : 'aces';
}

export function sanitizeLightingSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const ibl = src.ibl && typeof src.ibl === 'object' ? src.ibl : {};

    return {
        exposure: clamp(src.exposure ?? LIGHTING_DEFAULTS.exposure, LIGHTING_LIMITS.exposureMin, 5),
        toneMapping: sanitizeToneMappingMode(src.toneMapping, LIGHTING_DEFAULTS.toneMapping),
        hemiIntensity: clamp(src.hemiIntensity ?? LIGHTING_DEFAULTS.hemiIntensity, 0, LIGHTING_LIMITS.hemiIntensityMax),
        sunIntensity: clamp(src.sunIntensity ?? LIGHTING_DEFAULTS.sunIntensity, 0, LIGHTING_LIMITS.sunIntensityMax),
        sunColorLinear: Array.isArray(src.sunColorLinear) && src.sunColorLinear.length === 3
            ? src.sunColorLinear.map(v => clamp(v, 0, 1)) : [...LIGHTING_DEFAULTS.sunColorLinear],
        ibl: {
            iblId: typeof ibl.iblId === 'string' ? ibl.iblId : LIGHTING_DEFAULTS.ibl.iblId,
            enabled: ibl.enabled !== undefined ? !!ibl.enabled : LIGHTING_DEFAULTS.ibl.enabled,
            envMapIntensity: clamp(ibl.envMapIntensity ?? LIGHTING_DEFAULTS.ibl.envMapIntensity, 0, 5),
            setBackground: ibl.setBackground !== undefined ? !!ibl.setBackground : LIGHTING_DEFAULTS.ibl.setBackground
        }
    };
}

export function isCompleteLightingSnapshot(input) {
    const src = input && typeof input === 'object' ? input : null;
    if (!src) return false;
    const ibl = src.ibl && typeof src.ibl === 'object' ? src.ibl : null;
    if (!ibl) return false;

    return Number.isFinite(Number(src.exposure))
        && typeof src.toneMapping === 'string'
        && Number.isFinite(Number(src.hemiIntensity))
        && Number.isFinite(Number(src.sunIntensity))
        && ibl.enabled !== undefined
        && Number.isFinite(Number(ibl.envMapIntensity))
        && ibl.setBackground !== undefined;
}

export function resolveCalibrationReplacementLightingSettings(snapshot) {
    if (!isCompleteLightingSnapshot(snapshot)) return null;
    return sanitizeLightingSettings(withLegacySourceIdentity(snapshot));
}

function withLegacySourceIdentity(input) {
    if (input.ibl?.iblId || !['exposure', 'sunIntensity', 'hemiIntensity'].some(key => Number.isFinite(input[key]))) return input;
    return { ...input, ibl: { ...input.ibl, iblId: IBL_DEFAULTS.iblId }, sunColorLinear: input.sunColorLinear ?? [1, 1, 1] };
}

export function loadSavedLightingSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const parsed = withLegacySourceIdentity(JSON.parse(raw));
        const saved = sanitizeLightingSettings(parsed);
        const isLegacyDefault = (saved.exposure === LEGACY_LIGHTING_DEFAULTS_V2.exposure
                && saved.hemiIntensity === LEGACY_LIGHTING_DEFAULTS_V2.hemiIntensity
                && saved.sunIntensity === LEGACY_LIGHTING_DEFAULTS_V2.sunIntensity
                && saved.ibl.enabled === LEGACY_LIGHTING_DEFAULTS_V2.ibl.enabled
                && saved.ibl.envMapIntensity === LEGACY_LIGHTING_DEFAULTS_V2.ibl.envMapIntensity
                && saved.ibl.setBackground === LEGACY_LIGHTING_DEFAULTS_V2.ibl.setBackground)
            || (saved.exposure === LEGACY_LIGHTING_DEFAULTS_V1.exposure
                && saved.hemiIntensity === LEGACY_LIGHTING_DEFAULTS_V1.hemiIntensity
                && saved.sunIntensity === LEGACY_LIGHTING_DEFAULTS_V1.sunIntensity
                && saved.ibl.enabled === LEGACY_LIGHTING_DEFAULTS_V1.ibl.enabled
                && saved.ibl.envMapIntensity === LEGACY_LIGHTING_DEFAULTS_V1.ibl.envMapIntensity
                && saved.ibl.setBackground === LEGACY_LIGHTING_DEFAULTS_V1.ibl.setBackground)
            || (saved.exposure === LEGACY_LIGHTING_DEFAULTS_V0.exposure
                && saved.hemiIntensity === LEGACY_LIGHTING_DEFAULTS_V0.hemiIntensity
                && saved.sunIntensity === LEGACY_LIGHTING_DEFAULTS_V0.sunIntensity
                && saved.ibl.enabled === LEGACY_LIGHTING_DEFAULTS_V0.ibl.enabled
                && saved.ibl.envMapIntensity === LEGACY_LIGHTING_DEFAULTS_V0.ibl.envMapIntensity
                && saved.ibl.setBackground === LEGACY_LIGHTING_DEFAULTS_V0.ibl.setBackground);

        if (!isLegacyDefault) return saved;

        const migrated = sanitizeLightingSettings(LIGHTING_DEFAULTS);
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        } catch {
            // ignore storage write failures
        }
        return migrated;
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

function resolveLayeredDefaultLightingSettings() {
    const saved = loadSavedLightingSettings();
    return sanitizeLightingSettings({ ...LIGHTING_DEFAULTS, ...(saved ?? {}) });
}

export function getResolvedLightingSettings({
    includeUrlOverrides = true,
    resolutionMode = LIGHTING_RESOLUTION_MODES.DEFAULT,
    calibrationSnapshot = null
} = {}) {
    const wantsCalibrationPreset = resolutionMode === LIGHTING_RESOLUTION_MODES.CALIBRATION_PRESET;
    const replacement = wantsCalibrationPreset
        ? resolveCalibrationReplacementLightingSettings(calibrationSnapshot)
        : null;

    const merged = replacement ?? resolveLayeredDefaultLightingSettings();
    const useUrlOverrides = !!includeUrlOverrides && !replacement;

    let exposure = merged.exposure;
    let toneMapping = merged.toneMapping;
    let hemiIntensity = merged.hemiIntensity;
    let sunIntensity = merged.sunIntensity;

    if (useUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        exposure = readUrlParamNumber(params, 'exposure', exposure, { min: LIGHTING_LIMITS.exposureMin, max: 5 });
        toneMapping = sanitizeToneMappingMode(params.get('toneMapping'), toneMapping);
        hemiIntensity = readUrlParamNumber(params, 'hemiIntensity', hemiIntensity, { min: 0, max: LIGHTING_LIMITS.hemiIntensityMax });
        sunIntensity = readUrlParamNumber(params, 'sunIntensity', sunIntensity, { min: 0, max: LIGHTING_LIMITS.sunIntensityMax });

        const legacyBg = readUrlParamBool(params, 'iblBackground', merged.ibl.setBackground);
        merged.ibl.setBackground = legacyBg;
    }

    const ibl = getIBLConfig(merged.ibl, { includeUrlOverrides: useUrlOverrides });

    return {
        exposure,
        toneMapping,
        hemiIntensity,
        sunIntensity,
        sunColorLinear: merged.sunColorLinear,
        ibl
    };
}

export function getResolvedDefaultLightingSettings({ includeUrlOverrides = true } = {}) {
    return getResolvedLightingSettings({
        includeUrlOverrides,
        resolutionMode: LIGHTING_RESOLUTION_MODES.DEFAULT
    });
}

export function getResolvedCalibrationPresetLightingSettings({
    calibrationSnapshot = null,
    includeUrlOverrides = false
} = {}) {
    return getResolvedLightingSettings({
        includeUrlOverrides,
        resolutionMode: LIGHTING_RESOLUTION_MODES.CALIBRATION_PRESET,
        calibrationSnapshot
    });
}

export function getDefaultResolvedLightingSettings() {
    const ibl = getIBLConfig(LIGHTING_DEFAULTS.ibl, { includeUrlOverrides: false });
    return {
        exposure: LIGHTING_DEFAULTS.exposure,
        toneMapping: LIGHTING_DEFAULTS.toneMapping,
        hemiIntensity: LIGHTING_DEFAULTS.hemiIntensity,
        sunIntensity: LIGHTING_DEFAULTS.sunIntensity,
        sunColorLinear: [...LIGHTING_DEFAULTS.sunColorLinear],
        ibl
    };
}
