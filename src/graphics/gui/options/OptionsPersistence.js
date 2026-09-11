// Persist only edited Options groups; absent overrides continue following source defaults.
import { saveLightingSettings, clearSavedLightingSettings } from '../../lighting/LightingSettings.js';
import { saveShadowSettings, clearSavedShadowSettings } from '../../lighting/ShadowSettings.js';
import { saveAntiAliasingSettings, clearSavedAntiAliasingSettings } from '../../visuals/postprocessing/AntiAliasingSettings.js';
import { saveAmbientOcclusionSettings, clearSavedAmbientOcclusionSettings } from '../../visuals/postprocessing/AmbientOcclusionSettings.js';
import { saveBloomSettings, clearSavedBloomSettings } from '../../visuals/postprocessing/BloomSettings.js';
import { saveSunBloomSettings, clearSavedSunBloomSettings } from '../../visuals/postprocessing/SunBloomSettings.js';
import { saveColorGradingSettings, clearSavedColorGradingSettings } from '../../visuals/postprocessing/ColorGradingSettings.js';
import { saveAtmosphereSettings, clearSavedAtmosphereSettings } from '../../visuals/atmosphere/AtmosphereSettings.js';
import { saveSunFlareSettings, clearSavedSunFlareSettings } from '../../visuals/sun/SunFlareSettings.js';
import { saveBuildingWindowVisualsSettings, clearSavedBuildingWindowVisualsSettings } from '../../visuals/buildings/BuildingWindowVisualsSettings.js';
import { saveAsphaltNoiseSettings, clearSavedAsphaltNoiseSettings } from '../../visuals/city/AsphaltNoiseSettings.js';
import { saveVehicleMotionDebugSettings, clearSavedVehicleMotionDebugSettings } from '../../../app/vehicle/VehicleMotionDebugSettings.js';
import { saveStaticVisibilitySettings, clearSavedStaticVisibilitySettings } from '../../../app/city/visibility/index.js';
import { saveBakedLightingSettings, clearSavedBakedLightingSettings } from '../../../app/illumination/runtime/index.js';

const GROUPS = [
    ['lighting', saveLightingSettings, clearSavedLightingSettings],
    ['shadows', saveShadowSettings, clearSavedShadowSettings],
    ['antiAliasing', saveAntiAliasingSettings, clearSavedAntiAliasingSettings],
    ['ambientOcclusion', saveAmbientOcclusionSettings, clearSavedAmbientOcclusionSettings],
    ['atmosphere', saveAtmosphereSettings, clearSavedAtmosphereSettings],
    ['bloom', saveBloomSettings, clearSavedBloomSettings],
    ['sunBloom', saveSunBloomSettings, clearSavedSunBloomSettings],
    ['colorGrading', saveColorGradingSettings, clearSavedColorGradingSettings],
    ['buildingWindowVisuals', saveBuildingWindowVisualsSettings, clearSavedBuildingWindowVisualsSettings],
    ['sunFlare', saveSunFlareSettings, clearSavedSunFlareSettings],
    ['asphaltNoise', saveAsphaltNoiseSettings, clearSavedAsphaltNoiseSettings],
    ['vehicleMotionDebug', saveVehicleMotionDebugSettings, clearSavedVehicleMotionDebugSettings],
    ['staticVisibility', saveStaticVisibilitySettings, clearSavedStaticVisibilitySettings],
    ['bakedLighting', saveBakedLightingSettings, clearSavedBakedLightingSettings]
];

export function saveOptionsDraft(draft, initialDraft, { reset = false } = {}) {
    let saved = true;
    for (const [key, save] of GROUPS) {
        if (reset || JSON.stringify(draft[key]) !== JSON.stringify(initialDraft?.[key])) {
            if (!save(draft[key])) saved = false;
        }
    }
    return saved;
}

export function clearSavedOptionsSettings() {
    let cleared = true;
    for (const [, , clear] of GROUPS) if (!clear()) cleared = false;
    return cleared;
}
