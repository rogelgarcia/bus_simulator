// src/graphics/gui/material_calibration/MaterialCalibrationIlluminationPresets.js
// Stable, deterministic illumination presets for the Material Calibration tool.

export const MATERIAL_CALIBRATION_ILLUMINATION_PRESETS = Object.freeze([
    Object.freeze({
        id: 'neutral',
        label: 'Neutral (IBL)',
        description: 'Soft, low-contrast baseline for side-by-side comparisons.',
        engineLighting: Object.freeze({
            exposure: 1.05,
            hemiIntensity: 0.9,
            sunIntensity: 0.75,
            ibl: Object.freeze({ enabled: true, envMapIntensity: 0.28, setBackground: false })
        }),
        scene: Object.freeze({
            backgroundColorHex: 0x858585,
            hemi: Object.freeze({ intensity: 0.95 }),
            sun: Object.freeze({
                enabled: true,
                intensity: 0.9,
                colorHex: 0xffffff,
                position: Object.freeze({ x: 4, y: 7, z: 4 })
            })
        })
    }),
    Object.freeze({
        id: 'overcast',
        label: 'Overcast (Soft)',
        description: 'Reduced directional contrast with slightly higher exposure.',
        engineLighting: Object.freeze({
            exposure: 1.18,
            hemiIntensity: 1.05,
            sunIntensity: 0.45,
            ibl: Object.freeze({ enabled: true, envMapIntensity: 0.24, setBackground: false })
        }),
        scene: Object.freeze({
            backgroundColorHex: 0x7d8289,
            hemi: Object.freeze({ intensity: 1.1 }),
            sun: Object.freeze({
                enabled: true,
                intensity: 0.55,
                colorHex: 0xf4f8ff,
                position: Object.freeze({ x: 2.5, y: 9.0, z: 1.5 })
            })
        })
    }),
    Object.freeze({
        id: 'sunny',
        label: 'Sunny (Hard)',
        description: 'Harder directional lighting for specular/roughness checks.',
        engineLighting: Object.freeze({
            exposure: 0.98,
            hemiIntensity: 0.75,
            sunIntensity: 1.65,
            ibl: Object.freeze({ enabled: true, envMapIntensity: 0.18, setBackground: false })
        }),
        scene: Object.freeze({
            backgroundColorHex: 0x9aa2aa,
            hemi: Object.freeze({ intensity: 0.72 }),
            sun: Object.freeze({
                enabled: true,
                intensity: 1.75,
                colorHex: 0xffffff,
                position: Object.freeze({ x: 10.0, y: 9.0, z: -2.5 })
            })
        })
    })
]);

export function getMaterialCalibrationIlluminationPresetById(presetId) {
    const id = typeof presetId === 'string' ? presetId : '';
    return MATERIAL_CALIBRATION_ILLUMINATION_PRESETS.find((p) => p.id === id) ?? MATERIAL_CALIBRATION_ILLUMINATION_PRESETS[0] ?? null;
}

export function getMaterialCalibrationIlluminationPresetOptions() {
    return MATERIAL_CALIBRATION_ILLUMINATION_PRESETS.map((p) => ({ id: p.id, label: p.label }));
}

