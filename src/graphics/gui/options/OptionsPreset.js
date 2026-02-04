// src/graphics/gui/options/OptionsPreset.js
// Options preset schema + sanitization helpers (export/import).
// @ts-check

import { LIGHTING_DEFAULTS, sanitizeLightingSettings } from '../../lighting/LightingSettings.js';
import { SHADOW_DEFAULTS, sanitizeShadowSettings } from '../../lighting/ShadowSettings.js';
import { ANTIALIASING_DEFAULTS, sanitizeAntiAliasingSettings } from '../../visuals/postprocessing/AntiAliasingSettings.js';
import { AMBIENT_OCCLUSION_DEFAULTS, sanitizeAmbientOcclusionSettings } from '../../visuals/postprocessing/AmbientOcclusionSettings.js';
import { BLOOM_DEFAULTS, sanitizeBloomSettings } from '../../visuals/postprocessing/BloomSettings.js';
import { SUN_BLOOM_DEFAULTS, sanitizeSunBloomSettings } from '../../visuals/postprocessing/SunBloomSettings.js';
import { COLOR_GRADING_DEFAULTS, sanitizeColorGradingSettings } from '../../visuals/postprocessing/ColorGradingSettings.js';
import { BUILDING_WINDOW_VISUALS_DEFAULTS, sanitizeBuildingWindowVisualsSettings } from '../../visuals/buildings/BuildingWindowVisualsSettings.js';
import { ASPHALT_NOISE_DEFAULTS, sanitizeAsphaltNoiseSettings } from '../../visuals/city/AsphaltNoiseSettings.js';
import { SUN_FLARE_DEFAULTS, sanitizeSunFlareSettings } from '../../visuals/sun/SunFlareSettings.js';
import { VEHICLE_VISUAL_SMOOTHING_DEFAULTS, sanitizeVehicleVisualSmoothingSettings } from '../../../app/vehicle/VehicleVisualSmoothingSettings.js';

export const OPTIONS_PRESET_SCHEMA_ID = 'bus_sim.options_preset';
export const OPTIONS_PRESET_VERSION = 1;

const GROUPS = Object.freeze([
    'lighting',
    'shadows',
    'antiAliasing',
    'ambientOcclusion',
    'bloom',
    'sunBloom',
    'colorGrading',
    'sunFlare',
    'buildingWindowVisuals',
    'asphaltNoise',
    'vehicleVisualSmoothing'
]);

function parseLooseBool(value, fallback) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
    return !!value;
}

function toIso(value) {
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    return null;
}

function sanitizeIncludes(input) {
    const src = input && typeof input === 'object' ? input : {};
    const out = {};
    for (const key of GROUPS) out[key] = src[key] !== undefined ? !!src[key] : true;
    return out;
}

function getDefaultSettings() {
    return {
        lighting: sanitizeLightingSettings(LIGHTING_DEFAULTS),
        shadows: sanitizeShadowSettings(SHADOW_DEFAULTS),
        antiAliasing: sanitizeAntiAliasingSettings(ANTIALIASING_DEFAULTS),
        ambientOcclusion: sanitizeAmbientOcclusionSettings(AMBIENT_OCCLUSION_DEFAULTS),
        bloom: sanitizeBloomSettings(BLOOM_DEFAULTS),
        sunBloom: sanitizeSunBloomSettings(SUN_BLOOM_DEFAULTS),
        colorGrading: sanitizeColorGradingSettings(COLOR_GRADING_DEFAULTS),
        sunFlare: sanitizeSunFlareSettings(SUN_FLARE_DEFAULTS),
        buildingWindowVisuals: sanitizeBuildingWindowVisualsSettings(BUILDING_WINDOW_VISUALS_DEFAULTS),
        asphaltNoise: sanitizeAsphaltNoiseSettings(ASPHALT_NOISE_DEFAULTS),
        vehicleVisualSmoothing: sanitizeVehicleVisualSmoothingSettings(VEHICLE_VISUAL_SMOOTHING_DEFAULTS)
    };
}

function sanitizeSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const normalized = normalizeSettingsBooleans(src);
    const defaults = getDefaultSettings();
    return {
        lighting: sanitizeLightingSettings(normalized.lighting ?? defaults.lighting),
        shadows: sanitizeShadowSettings(normalized.shadows ?? defaults.shadows),
        antiAliasing: sanitizeAntiAliasingSettings(normalized.antiAliasing ?? defaults.antiAliasing),
        ambientOcclusion: sanitizeAmbientOcclusionSettings(normalized.ambientOcclusion ?? defaults.ambientOcclusion),
        bloom: sanitizeBloomSettings(normalized.bloom ?? defaults.bloom),
        sunBloom: sanitizeSunBloomSettings(normalized.sunBloom ?? defaults.sunBloom),
        colorGrading: sanitizeColorGradingSettings(normalized.colorGrading ?? defaults.colorGrading),
        sunFlare: sanitizeSunFlareSettings(normalized.sunFlare ?? defaults.sunFlare),
        buildingWindowVisuals: sanitizeBuildingWindowVisualsSettings(normalized.buildingWindowVisuals ?? defaults.buildingWindowVisuals),
        asphaltNoise: sanitizeAsphaltNoiseSettings(normalized.asphaltNoise ?? defaults.asphaltNoise),
        vehicleVisualSmoothing: sanitizeVehicleVisualSmoothingSettings(normalized.vehicleVisualSmoothing ?? defaults.vehicleVisualSmoothing)
    };
}

function normalizeSettingsBooleans(src) {
    const out = {};

    const lighting = src.lighting && typeof src.lighting === 'object' ? src.lighting : null;
    if (lighting) {
        const ibl = lighting.ibl && typeof lighting.ibl === 'object' ? lighting.ibl : null;
        out.lighting = {
            ...lighting,
            ibl: ibl
                ? {
                    ...ibl,
                    enabled: parseLooseBool(ibl.enabled, ibl.enabled),
                    setBackground: parseLooseBool(ibl.setBackground, ibl.setBackground)
                }
                : ibl
        };
    }

    if (src.shadows && typeof src.shadows === 'object') out.shadows = { ...src.shadows };

    if (src.antiAliasing && typeof src.antiAliasing === 'object') out.antiAliasing = { ...src.antiAliasing };

    const ambientOcclusion = src.ambientOcclusion && typeof src.ambientOcclusion === 'object' ? src.ambientOcclusion : null;
    if (ambientOcclusion) {
        const gtao = ambientOcclusion.gtao && typeof ambientOcclusion.gtao === 'object' ? ambientOcclusion.gtao : null;
        out.ambientOcclusion = {
            ...ambientOcclusion,
            gtao: gtao ? { ...gtao, denoise: parseLooseBool(gtao.denoise, gtao.denoise) } : gtao
        };
    }

    const bloom = src.bloom && typeof src.bloom === 'object' ? src.bloom : null;
    if (bloom) out.bloom = { ...bloom, enabled: parseLooseBool(bloom.enabled, bloom.enabled) };

    const sunBloom = src.sunBloom && typeof src.sunBloom === 'object' ? src.sunBloom : null;
    if (sunBloom) {
        out.sunBloom = {
            ...sunBloom,
            enabled: parseLooseBool(sunBloom.enabled, sunBloom.enabled),
            brightnessOnly: parseLooseBool(sunBloom.brightnessOnly, sunBloom.brightnessOnly),
            raysEnabled: parseLooseBool(sunBloom.raysEnabled, sunBloom.raysEnabled)
        };
    }

    if (src.colorGrading && typeof src.colorGrading === 'object') out.colorGrading = { ...src.colorGrading };

    const sunFlare = src.sunFlare && typeof src.sunFlare === 'object' ? src.sunFlare : null;
    if (sunFlare) {
        const comps = sunFlare.components && typeof sunFlare.components === 'object' ? sunFlare.components : null;
        out.sunFlare = {
            ...sunFlare,
            enabled: parseLooseBool(sunFlare.enabled, sunFlare.enabled),
            components: comps
                ? {
                    ...comps,
                    core: parseLooseBool(comps.core, comps.core),
                    halo: parseLooseBool(comps.halo, comps.halo),
                    starburst: parseLooseBool(comps.starburst, comps.starburst),
                    ghosting: parseLooseBool(comps.ghosting, comps.ghosting)
                }
                : comps
        };
    }

    const buildingWindowVisuals = src.buildingWindowVisuals && typeof src.buildingWindowVisuals === 'object' ? src.buildingWindowVisuals : null;
    if (buildingWindowVisuals) {
        const reflective = buildingWindowVisuals.reflective && typeof buildingWindowVisuals.reflective === 'object'
            ? buildingWindowVisuals.reflective
            : null;
        out.buildingWindowVisuals = reflective
            ? {
                ...buildingWindowVisuals,
                reflective: {
                    ...reflective,
                    enabled: parseLooseBool(reflective.enabled, reflective.enabled)
                }
            }
            : { ...buildingWindowVisuals };
    }

    const asphaltNoise = src.asphaltNoise && typeof src.asphaltNoise === 'object' ? src.asphaltNoise : null;
    if (asphaltNoise) {
        const coarse = asphaltNoise.coarse && typeof asphaltNoise.coarse === 'object' ? asphaltNoise.coarse : null;
        const fine = asphaltNoise.fine && typeof asphaltNoise.fine === 'object' ? asphaltNoise.fine : null;
        const markings = asphaltNoise.markings && typeof asphaltNoise.markings === 'object' ? asphaltNoise.markings : null;
        const livedIn = asphaltNoise.livedIn && typeof asphaltNoise.livedIn === 'object' ? asphaltNoise.livedIn : null;
        const edgeDirt = livedIn?.edgeDirt && typeof livedIn.edgeDirt === 'object' ? livedIn.edgeDirt : null;
        const cracks = livedIn?.cracks && typeof livedIn.cracks === 'object' ? livedIn.cracks : null;
        const patches = livedIn?.patches && typeof livedIn.patches === 'object' ? livedIn.patches : null;
        const tireWear = livedIn?.tireWear && typeof livedIn.tireWear === 'object' ? livedIn.tireWear : null;

        out.asphaltNoise = {
            ...asphaltNoise,
            coarse: coarse
                ? { ...coarse, albedo: parseLooseBool(coarse.albedo, coarse.albedo), roughness: parseLooseBool(coarse.roughness, coarse.roughness) }
                : coarse,
            fine: fine
                ? {
                    ...fine,
                    albedo: parseLooseBool(fine.albedo, fine.albedo),
                    roughness: parseLooseBool(fine.roughness, fine.roughness),
                    normal: parseLooseBool(fine.normal, fine.normal)
                }
                : fine,
            markings: markings
                ? { ...markings, enabled: parseLooseBool(markings.enabled, markings.enabled), debug: parseLooseBool(markings.debug, markings.debug) }
                : markings,
            livedIn: livedIn
                ? {
                    ...livedIn,
                    edgeDirt: edgeDirt ? { ...edgeDirt, enabled: parseLooseBool(edgeDirt.enabled, edgeDirt.enabled) } : edgeDirt,
                    cracks: cracks ? { ...cracks, enabled: parseLooseBool(cracks.enabled, cracks.enabled) } : cracks,
                    patches: patches ? { ...patches, enabled: parseLooseBool(patches.enabled, patches.enabled) } : patches,
                    tireWear: tireWear ? { ...tireWear, enabled: parseLooseBool(tireWear.enabled, tireWear.enabled) } : tireWear
                }
                : livedIn
        };
    }

    const vehicleVisualSmoothing = src.vehicleVisualSmoothing && typeof src.vehicleVisualSmoothing === 'object' ? src.vehicleVisualSmoothing : null;
    if (vehicleVisualSmoothing) {
        out.vehicleVisualSmoothing = {
            ...vehicleVisualSmoothing,
            enabled: parseLooseBool(vehicleVisualSmoothing.enabled, vehicleVisualSmoothing.enabled)
        };
    }

    return out;
}

function migrateLegacyPreset(input) {
    const src = input && typeof input === 'object' ? input : {};
    const legacySettings = src.settings && typeof src.settings === 'object' ? src.settings : src;
    const includes = sanitizeIncludes(src.includes);
    return {
        schema: OPTIONS_PRESET_SCHEMA_ID,
        version: OPTIONS_PRESET_VERSION,
        name: typeof src.name === 'string' ? src.name : null,
        notes: typeof src.notes === 'string' ? src.notes : null,
        createdAt: toIso(src.createdAt),
        includes,
        settings: sanitizeSettings(legacySettings)
    };
}

export function sanitizeOptionsPresetPayload(input) {
    if (!input || typeof input !== 'object') throw new Error('Options preset must be an object');
    const src = input;
    const versionRaw = src.version ?? src.presetVersion ?? null;
    const version = versionRaw === null ? null : Number(versionRaw);
    if (version !== null && !Number.isFinite(version)) throw new Error('Options preset version must be a number');

    if (version === null || version < 1) return migrateLegacyPreset(src);
    if (version !== OPTIONS_PRESET_VERSION) throw new Error(`Unsupported options preset version: ${version}`);

    const schema = typeof src.schema === 'string' && src.schema ? src.schema : OPTIONS_PRESET_SCHEMA_ID;
    if (schema !== OPTIONS_PRESET_SCHEMA_ID) throw new Error(`Unsupported options preset schema: ${schema}`);

    const includes = sanitizeIncludes(src.includes);
    const rawSettings = src.settings && typeof src.settings === 'object' ? src.settings : {};

    return {
        schema: OPTIONS_PRESET_SCHEMA_ID,
        version: OPTIONS_PRESET_VERSION,
        name: typeof src.name === 'string' ? src.name : null,
        notes: typeof src.notes === 'string' ? src.notes : null,
        createdAt: toIso(src.createdAt),
        includes,
        settings: sanitizeSettings(rawSettings)
    };
}

export function createOptionsPresetFromDraft(draft, { name = null, notes = null, createdAt = null, includes = null } = {}) {
    const src = draft && typeof draft === 'object' ? draft : null;
    if (!src) throw new Error('Draft settings required to create an options preset');
    const presetIncludes = sanitizeIncludes(includes);
    return {
        schema: OPTIONS_PRESET_SCHEMA_ID,
        version: OPTIONS_PRESET_VERSION,
        name: typeof name === 'string' ? name : null,
        notes: typeof notes === 'string' ? notes : null,
        createdAt: toIso(createdAt) ?? new Date().toISOString(),
        includes: presetIncludes,
        settings: sanitizeSettings(src)
    };
}

export function stringifyOptionsPreset(preset) {
    const p = sanitizeOptionsPresetPayload(preset);
    return JSON.stringify(p, null, 2);
}

export function parseOptionsPresetJson(text) {
    const raw = typeof text === 'string' ? text : '';
    if (!raw.trim()) throw new Error('Empty options preset JSON');
    let obj;
    try {
        obj = JSON.parse(raw);
    } catch {
        throw new Error('Invalid JSON');
    }
    return sanitizeOptionsPresetPayload(obj);
}

export function applyOptionsPresetToDraft(draft, preset) {
    const base = draft && typeof draft === 'object' ? draft : {};
    const p = sanitizeOptionsPresetPayload(preset);
    const out = JSON.parse(JSON.stringify(base));
    const includes = p.includes ?? {};
    const settings = p.settings ?? {};

    if (includes.lighting) out.lighting = settings.lighting;
    if (includes.shadows) out.shadows = settings.shadows;
    if (includes.antiAliasing) out.antiAliasing = settings.antiAliasing;
    if (includes.ambientOcclusion) out.ambientOcclusion = settings.ambientOcclusion;
    if (includes.bloom) out.bloom = settings.bloom;
    if (includes.sunBloom) out.sunBloom = settings.sunBloom;
    if (includes.colorGrading) out.colorGrading = settings.colorGrading;
    if (includes.sunFlare) out.sunFlare = settings.sunFlare;
    if (includes.buildingWindowVisuals) out.buildingWindowVisuals = settings.buildingWindowVisuals;
    if (includes.asphaltNoise) out.asphaltNoise = settings.asphaltNoise;
    if (includes.vehicleVisualSmoothing) out.vehicleVisualSmoothing = settings.vehicleVisualSmoothing;

    return out;
}
