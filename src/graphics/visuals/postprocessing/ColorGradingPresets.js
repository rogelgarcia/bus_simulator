// src/graphics/visuals/postprocessing/ColorGradingPresets.js
// LUT color grading preset catalog (file-based .cube LUTs under assets/public/luts/).
// @ts-check

export const COLOR_GRADING_PRESET_ID = Object.freeze({
    OFF: 'off',
    WARM: 'warm',
    COOL: 'cool'
});

const LUT_WARM_URL = new URL(
    '../../../../assets/public/luts/warm.cube',
    import.meta.url
).toString();

const LUT_COOL_URL = new URL(
    '../../../../assets/public/luts/cool.cube',
    import.meta.url
).toString();

export const COLOR_GRADING_PRESETS = Object.freeze([
    Object.freeze({
        id: COLOR_GRADING_PRESET_ID.OFF,
        label: 'Off',
        cubeUrl: null
    }),
    Object.freeze({
        id: COLOR_GRADING_PRESET_ID.WARM,
        label: 'Warm',
        cubeUrl: LUT_WARM_URL
    }),
    Object.freeze({
        id: COLOR_GRADING_PRESET_ID.COOL,
        label: 'Cool',
        cubeUrl: LUT_COOL_URL
    })
]);

export function getColorGradingPresetOptions() {
    return COLOR_GRADING_PRESETS.map((entry) => ({ id: entry.id, label: entry.label }));
}

export function getColorGradingPresetById(id) {
    const key = typeof id === 'string' ? id.trim().toLowerCase() : '';
    return COLOR_GRADING_PRESETS.find((entry) => entry.id === key) ?? COLOR_GRADING_PRESETS[0] ?? null;
}

