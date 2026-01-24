// src/graphics/visuals/sun/SunFlarePresets.js
// Presets for the sun flare rig (lens flare + core).
// @ts-check

export const SUN_FLARE_PRESETS = Object.freeze([
    {
        id: 'subtle',
        label: 'Subtle',
        core: { sizePx: 420, intensity: 3.0, color: '#fff9f2' },
        star: { sizePx: 230, intensity: 0.32, color: '#ffffff' },
        ghosts: [
            { sizePx: 140, distance: 0.25, intensity: 0.18, color: '#9bd0ff' },
            { sizePx: 90, distance: 0.55, intensity: 0.14, color: '#ffd6a6' },
            { sizePx: 110, distance: 0.85, intensity: 0.12, color: '#c4ffdb' }
        ]
    },
    {
        id: 'cinematic',
        label: 'Cinematic',
        core: { sizePx: 560, intensity: 4.2, color: '#fff6ea' },
        star: { sizePx: 320, intensity: 0.62, color: '#ffffff' },
        ghosts: [
            { sizePx: 220, distance: 0.20, intensity: 0.32, color: '#9bd0ff' },
            { sizePx: 150, distance: 0.45, intensity: 0.25, color: '#ffd6a6' },
            { sizePx: 190, distance: 0.70, intensity: 0.20, color: '#c4ffdb' },
            { sizePx: 120, distance: 0.95, intensity: 0.16, color: '#ffffff' }
        ]
    }
]);

export function getSunFlarePresetById(id) {
    const wanted = typeof id === 'string' ? id.trim().toLowerCase() : '';
    for (const preset of SUN_FLARE_PRESETS) {
        if (preset.id === wanted) return preset;
    }
    return SUN_FLARE_PRESETS[0] ?? null;
}

export function getSunFlarePresetOptions() {
    return SUN_FLARE_PRESETS.map((p) => ({ id: p.id, label: p.label }));
}
