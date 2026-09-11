// Captures resolved Options and their authored defaults once per configuration change.
import { getDefaultResolvedLightingSettings } from '../../lighting/LightingSettings.js';
import { getDefaultResolvedShadowSettings } from '../../lighting/ShadowSettings.js';
import { getDefaultResolvedAntiAliasingSettings } from '../../visuals/postprocessing/AntiAliasingSettings.js';
import { getDefaultResolvedAmbientOcclusionSettings } from '../../visuals/postprocessing/AmbientOcclusionSettings.js';
import { getDefaultResolvedBloomSettings } from '../../visuals/postprocessing/BloomSettings.js';
import { getDefaultResolvedSunBloomSettings } from '../../visuals/postprocessing/SunBloomSettings.js';
import { getDefaultResolvedColorGradingSettings } from '../../visuals/postprocessing/ColorGradingSettings.js';
import { getDefaultResolvedAtmosphereSettings } from '../../visuals/atmosphere/AtmosphereSettings.js';
import { getDefaultResolvedBuildingWindowVisualsSettings, getResolvedBuildingWindowVisualsSettings } from '../../visuals/buildings/BuildingWindowVisualsSettings.js';
import { getDefaultResolvedAsphaltNoiseSettings, getResolvedAsphaltNoiseSettings } from '../../visuals/city/AsphaltNoiseSettings.js';
import { getDefaultResolvedSunFlareSettings, getResolvedSunFlareSettings } from '../../visuals/sun/SunFlareSettings.js';
import { getDefaultResolvedStaticVisibilitySettings, getResolvedStaticVisibilitySettings } from '../../../app/city/visibility/index.js';
import { getDefaultResolvedBakedLightingSettings } from '../../../app/illumination/runtime/index.js';
import { getDefaultResolvedVehicleMotionDebugSettings } from '../../../app/vehicle/VehicleMotionDebugSettings.js';

export function canonicalSettings(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalSettings).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalSettings(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}

export function captureRecordingSettings(engine, draft = null) {
    const defaults = {
        lighting:getDefaultResolvedLightingSettings(), shadows:getDefaultResolvedShadowSettings(),
        antiAliasing:getDefaultResolvedAntiAliasingSettings(), ambientOcclusion:getDefaultResolvedAmbientOcclusionSettings(),
        bloom:getDefaultResolvedBloomSettings(), sunBloom:getDefaultResolvedSunBloomSettings(),
        colorGrading:getDefaultResolvedColorGradingSettings(), atmosphere:getDefaultResolvedAtmosphereSettings(),
        buildingWindowVisuals:getDefaultResolvedBuildingWindowVisualsSettings(), asphaltNoise:getDefaultResolvedAsphaltNoiseSettings(),
        sunFlare:getDefaultResolvedSunFlareSettings(), staticVisibility:getDefaultResolvedStaticVisibilitySettings(),
        bakedLighting:getDefaultResolvedBakedLightingSettings(), vehicleMotionDebug:getDefaultResolvedVehicleMotionDebugSettings()
    };
    const settings = {
        lighting:engine.lightingSettings, shadows:engine.shadowSettings, antiAliasing:engine.antiAliasingSettings,
        ambientOcclusion:engine.ambientOcclusionSettings, bloom:engine.bloomSettings, sunBloom:engine.sunBloomSettings,
        colorGrading:engine.colorGradingSettings, atmosphere:engine.atmosphereSettings,
        bakedLighting:engine.bakedLightingSettings, vehicleMotionDebug:engine.vehicleMotionDebugSettings,
        buildingWindowVisuals:draft?.buildingWindowVisuals ?? getResolvedBuildingWindowVisualsSettings(),
        asphaltNoise:draft?.asphaltNoise ?? getResolvedAsphaltNoiseSettings(),
        sunFlare:draft?.sunFlare ?? getResolvedSunFlareSettings(),
        staticVisibility:draft?.staticVisibility ?? getResolvedStaticVisibilitySettings()
    };
    const usesDefaultValues = canonicalSettings(settings) === canonicalSettings(defaults);
    return { usesDefaultValues, settings:JSON.parse(JSON.stringify(settings)), defaults };
}
