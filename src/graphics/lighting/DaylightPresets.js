// Measured comparison recipes at one sun direction; material and camera choices are preserved.
import { LIGHTING_DEFAULTS, sanitizeLightingSettings } from './LightingSettings.js';
import { ATMOSPHERE_DEFAULTS } from '../visuals/atmosphere/AtmosphereSettings.js';

export const DAYLIGHT_PRESET_OPTIONS = Object.freeze([
    { id: 'previous', label: 'Previous' },
    { id: 'calibrated', label: 'Calibrated' }
]);

const PREVIOUS_LIGHTING = Object.freeze({
    exposure: 1.02, toneMapping: 'aces', hemiIntensity: 1.22, sunIntensity: 7,
    sunColorLinear: [1, 1, 1],
    ibl: { iblId: 'ibl.hdri.german_town_street_2k', enabled: true, envMapIntensity: .28, setBackground: false }
});

export function applyDaylightPreset(draft, id) {
    if (!DAYLIGHT_PRESET_OPTIONS.some(option => option.id === id)) throw new Error('Unknown daylight preset: ' + id);
    const result = structuredClone(draft);
    result.lighting = sanitizeLightingSettings(id === 'previous' ? PREVIOUS_LIGHTING : LIGHTING_DEFAULTS);
    result.lighting.ibl.showProbeSphere = !!draft.lighting?.ibl?.showProbeSphere;
    result.atmosphere = structuredClone(ATMOSPHERE_DEFAULTS);
    result.bakedLighting = { ...result.bakedLighting, mode: id === 'previous' ? 'current' : 'baked',
        shadows: { ...result.bakedLighting?.shadows, enabled: true },
        receivers: { ...result.bakedLighting?.receivers, indirect: true } };
    result.colorGrading = { ...result.colorGrading, preset: 'off', intensity: 0 };
    result.sunBloom = { ...result.sunBloom, enabled: false };
    return result;
}

export function getDaylightPresetId(draft) {
    for (const { id } of DAYLIGHT_PRESET_OPTIONS) {
        const expected = applyDaylightPreset(draft, id);
        const mode = draft.bakedLighting?.mode;
        const modeMatches = id === 'previous' ? mode === 'current' : mode === 'baked' || mode === 'auto';
        const lighting = sanitizeLightingSettings(draft.lighting);
        if (JSON.stringify(lighting) !== JSON.stringify(sanitizeLightingSettings(expected.lighting))) continue;
        if (JSON.stringify(draft.atmosphere) !== JSON.stringify(expected.atmosphere)) continue;
        if (!modeMatches || (id === 'calibrated' && (!draft.bakedLighting?.shadows?.enabled
            || !draft.bakedLighting?.receivers?.indirect))) continue;
        if (draft.colorGrading?.preset !== 'off' || draft.sunBloom?.enabled) continue;
        return id;
    }
    return 'custom';
}
