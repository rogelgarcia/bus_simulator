// src/graphics/visuals/atmosphere/AtmosphereSettings.js
// Persisted atmosphere (analytic sky + sun placement) settings.
// @ts-check

const STORAGE_KEY = 'bus_sim.atmosphere.v1';

export const ATMOSPHERE_DEFAULTS = Object.freeze({
    sun: Object.freeze({
        azimuthDeg: 45,
        elevationDeg: 35
    }),
    sky: Object.freeze({
        horizonColor: '#EAF9FF',
        zenithColor: '#7BCFFF',
        groundColor: '#EAF9FF',
        curve: 1.0,
        exposure: 1.0,
        ditherStrength: 0.85,
        iblBackgroundMode: 'ibl'
    }),
    haze: Object.freeze({
        enabled: true,
        intensity: 0.22,
        thickness: 0.22,
        curve: 1.6,
        tintColor: '#FFFFFF',
        tintStrength: 0.0
    }),
    glare: Object.freeze({
        enabled: true,
        intensity: 0.95,
        sigmaDeg: 10,
        power: 1.0
    }),
    disc: Object.freeze({
        enabled: true,
        intensity: 4.0,
        sigmaDeg: 0.22,
        coreIntensity: 2.5,
        coreSigmaDeg: 0.06
    }),
    debug: Object.freeze({
        mode: 'full',
        showSunRing: false,
        sunRingRadiusDeg: 0.55,
        sunRingThicknessDeg: 0.08
    })
});

function clamp(value, min, max, fallback) {
    const num = Number(value);
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

function readUrlParamBool(params, key, fallback) {
    if (!params?.has?.(key)) return fallback;
    const raw = params.get(key);
    const v = String(raw).trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
    return fallback;
}

function readUrlParamString(params, key, fallback) {
    if (!params?.has?.(key)) return fallback;
    const raw = params.get(key);
    return typeof raw === 'string' ? raw : fallback;
}

function readUrlParamNumber(params, key, fallback, { min = -Infinity, max = Infinity } = {}) {
    if (!params?.has?.(key)) return fallback;
    const raw = params.get(key);
    const num = Number(raw);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function sanitizeEnum(value, allowed, fallback) {
    const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return allowed.includes(v) ? v : fallback;
}

export function sanitizeAtmosphereSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const sunSrc = src.sun && typeof src.sun === 'object' ? src.sun : {};
    const skySrc = src.sky && typeof src.sky === 'object' ? src.sky : {};
    const hazeSrc = src.haze && typeof src.haze === 'object' ? src.haze : {};
    const glareSrc = src.glare && typeof src.glare === 'object' ? src.glare : {};
    const discSrc = src.disc && typeof src.disc === 'object' ? src.disc : {};
    const dbgSrc = src.debug && typeof src.debug === 'object' ? src.debug : {};

    const d = ATMOSPHERE_DEFAULTS;

    return {
        sun: {
            azimuthDeg: clamp(sunSrc.azimuthDeg ?? d.sun.azimuthDeg, 0, 360, d.sun.azimuthDeg),
            elevationDeg: clamp(sunSrc.elevationDeg ?? d.sun.elevationDeg, 0, 89, d.sun.elevationDeg)
        },
        sky: {
            horizonColor: normalizeHexColor(skySrc.horizonColor) ?? d.sky.horizonColor,
            zenithColor: normalizeHexColor(skySrc.zenithColor) ?? d.sky.zenithColor,
            groundColor: normalizeHexColor(skySrc.groundColor) ?? d.sky.groundColor,
            curve: clamp(skySrc.curve ?? d.sky.curve, 0.05, 8, d.sky.curve),
            exposure: clamp(skySrc.exposure ?? d.sky.exposure, 0, 8, d.sky.exposure),
            ditherStrength: clamp(skySrc.ditherStrength ?? d.sky.ditherStrength, 0, 2, d.sky.ditherStrength),
            iblBackgroundMode: sanitizeEnum(skySrc.iblBackgroundMode ?? d.sky.iblBackgroundMode, ['ibl', 'gradient'], d.sky.iblBackgroundMode)
        },
        haze: {
            enabled: hazeSrc.enabled !== undefined ? !!hazeSrc.enabled : d.haze.enabled,
            intensity: clamp(hazeSrc.intensity ?? d.haze.intensity, 0, 4, d.haze.intensity),
            thickness: clamp(hazeSrc.thickness ?? d.haze.thickness, 0.02, 1.0, d.haze.thickness),
            curve: clamp(hazeSrc.curve ?? d.haze.curve, 0.1, 8, d.haze.curve),
            tintColor: normalizeHexColor(hazeSrc.tintColor) ?? d.haze.tintColor,
            tintStrength: clamp(hazeSrc.tintStrength ?? d.haze.tintStrength, 0, 1, d.haze.tintStrength)
        },
        glare: {
            enabled: glareSrc.enabled !== undefined ? !!glareSrc.enabled : d.glare.enabled,
            intensity: clamp(glareSrc.intensity ?? d.glare.intensity, 0, 20, d.glare.intensity),
            sigmaDeg: clamp(glareSrc.sigmaDeg ?? d.glare.sigmaDeg, 0.25, 60, d.glare.sigmaDeg),
            power: clamp(glareSrc.power ?? d.glare.power, 0.2, 6, d.glare.power)
        },
        disc: {
            enabled: discSrc.enabled !== undefined ? !!discSrc.enabled : d.disc.enabled,
            intensity: clamp(discSrc.intensity ?? d.disc.intensity, 0, 50, d.disc.intensity),
            sigmaDeg: clamp(discSrc.sigmaDeg ?? d.disc.sigmaDeg, 0.05, 5, d.disc.sigmaDeg),
            coreIntensity: clamp(discSrc.coreIntensity ?? d.disc.coreIntensity, 0, 50, d.disc.coreIntensity),
            coreSigmaDeg: clamp(discSrc.coreSigmaDeg ?? d.disc.coreSigmaDeg, 0.02, 5, d.disc.coreSigmaDeg)
        },
        debug: {
            mode: sanitizeEnum(dbgSrc.mode ?? d.debug.mode, ['full', 'baseline', 'glare', 'disc'], d.debug.mode),
            showSunRing: dbgSrc.showSunRing !== undefined ? !!dbgSrc.showSunRing : d.debug.showSunRing,
            sunRingRadiusDeg: clamp(dbgSrc.sunRingRadiusDeg ?? d.debug.sunRingRadiusDeg, 0.05, 10, d.debug.sunRingRadiusDeg),
            sunRingThicknessDeg: clamp(dbgSrc.sunRingThicknessDeg ?? d.debug.sunRingThicknessDeg, 0.01, 2, d.debug.sunRingThicknessDeg)
        }
    };
}

export function loadSavedAtmosphereSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return sanitizeAtmosphereSettings(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function saveAtmosphereSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeAtmosphereSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedAtmosphereSettings() {
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

export function getResolvedAtmosphereSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedAtmosphereSettings();
    const merged = sanitizeAtmosphereSettings({ ...ATMOSPHERE_DEFAULTS, ...(saved ?? {}) });

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        merged.sun.azimuthDeg = readUrlParamNumber(params, 'sunAzimuth', merged.sun.azimuthDeg, { min: 0, max: 360 });
        merged.sun.elevationDeg = readUrlParamNumber(params, 'sunElevation', merged.sun.elevationDeg, { min: 0, max: 89 });

        merged.sky.horizonColor = normalizeHexColor(readUrlParamString(params, 'skyHorizon', merged.sky.horizonColor)) ?? merged.sky.horizonColor;
        merged.sky.zenithColor = normalizeHexColor(readUrlParamString(params, 'skyZenith', merged.sky.zenithColor)) ?? merged.sky.zenithColor;
        merged.sky.groundColor = normalizeHexColor(readUrlParamString(params, 'skyGround', merged.sky.groundColor)) ?? merged.sky.groundColor;
        merged.sky.curve = readUrlParamNumber(params, 'skyCurve', merged.sky.curve, { min: 0.05, max: 8 });
        merged.sky.exposure = readUrlParamNumber(params, 'skyExposure', merged.sky.exposure, { min: 0, max: 8 });
        merged.sky.ditherStrength = readUrlParamNumber(params, 'skyDither', merged.sky.ditherStrength, { min: 0, max: 2 });
        merged.sky.iblBackgroundMode = sanitizeEnum(readUrlParamString(params, 'skyBg', merged.sky.iblBackgroundMode), ['ibl', 'gradient'], merged.sky.iblBackgroundMode);

        merged.haze.enabled = readUrlParamBool(params, 'skyHaze', merged.haze.enabled);
        merged.haze.intensity = readUrlParamNumber(params, 'skyHazeIntensity', merged.haze.intensity, { min: 0, max: 4 });
        merged.haze.thickness = readUrlParamNumber(params, 'skyHazeThickness', merged.haze.thickness, { min: 0.02, max: 1 });
        merged.haze.curve = readUrlParamNumber(params, 'skyHazeCurve', merged.haze.curve, { min: 0.1, max: 8 });

        merged.glare.enabled = readUrlParamBool(params, 'skyGlare', merged.glare.enabled);
        merged.glare.intensity = readUrlParamNumber(params, 'skyGlareIntensity', merged.glare.intensity, { min: 0, max: 20 });
        merged.glare.sigmaDeg = readUrlParamNumber(params, 'skyGlareSigma', merged.glare.sigmaDeg, { min: 0.25, max: 60 });
        merged.glare.power = readUrlParamNumber(params, 'skyGlarePower', merged.glare.power, { min: 0.2, max: 6 });

        merged.disc.enabled = readUrlParamBool(params, 'skyDisc', merged.disc.enabled);
        merged.disc.intensity = readUrlParamNumber(params, 'skyDiscIntensity', merged.disc.intensity, { min: 0, max: 50 });
        merged.disc.sigmaDeg = readUrlParamNumber(params, 'skyDiscSigma', merged.disc.sigmaDeg, { min: 0.05, max: 5 });
        merged.disc.coreIntensity = readUrlParamNumber(params, 'skyDiscCoreIntensity', merged.disc.coreIntensity, { min: 0, max: 50 });
        merged.disc.coreSigmaDeg = readUrlParamNumber(params, 'skyDiscCoreSigma', merged.disc.coreSigmaDeg, { min: 0.02, max: 5 });

        merged.debug.mode = sanitizeEnum(readUrlParamString(params, 'skyMode', merged.debug.mode), ['full', 'baseline', 'glare', 'disc'], merged.debug.mode);
        merged.debug.showSunRing = readUrlParamBool(params, 'skySunRing', merged.debug.showSunRing);
    }

    return merged;
}

export function getDefaultResolvedAtmosphereSettings() {
    return sanitizeAtmosphereSettings(ATMOSPHERE_DEFAULTS);
}

