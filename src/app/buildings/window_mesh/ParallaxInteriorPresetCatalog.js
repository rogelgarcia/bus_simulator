// src/app/buildings/window_mesh/ParallaxInteriorPresetCatalog.js
// Parallax interior presets (renderer-agnostic).
// @ts-check

import {
    DEFAULT_WINDOW_INTERIOR_ATLAS_ID,
    WINDOW_INTERIOR_ATLAS_ID,
    getWindowInteriorAtlasLayoutById
} from './WindowInteriorAtlasLayoutCatalog.js';

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

export const PARALLAX_INTERIOR_PRESET_ID = Object.freeze({
    RESIDENTIAL: 'parallax_interior.residential',
    OFFICE: 'parallax_interior.office',
    PROCEDURAL: 'parallax_interior.procedural'
});

export const DEFAULT_PARALLAX_INTERIOR_PRESET_ID = PARALLAX_INTERIOR_PRESET_ID.RESIDENTIAL;

const PARALLAX_INTERIOR_DEFAULTS = Object.freeze({
    uvZoom: 3.0,
    parallaxDepthMeters: 15.0,
    parallaxScale: Object.freeze({ x: 4.0, y: 4.0 }),
    tintVariation: Object.freeze({
        hueShiftDeg: Object.freeze({ min: 0.0, max: 0.0 }),
        saturationMul: Object.freeze({ min: 0.8, max: 0.9 }),
        brightnessMul: Object.freeze({ min: 0.8, max: 0.9 })
    })
});

export const PARALLAX_INTERIOR_PRESET_CATALOG = Object.freeze([
    Object.freeze({
        id: PARALLAX_INTERIOR_PRESET_ID.RESIDENTIAL,
        label: 'Residential',
        atlasId: WINDOW_INTERIOR_ATLAS_ID.RESIDENTIAL_4X4
    }),
    Object.freeze({
        id: PARALLAX_INTERIOR_PRESET_ID.OFFICE,
        label: 'Office',
        atlasId: WINDOW_INTERIOR_ATLAS_ID.OFFICE_4X4
    }),
    Object.freeze({
        id: PARALLAX_INTERIOR_PRESET_ID.PROCEDURAL,
        label: 'Procedural',
        atlasId: WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL
    })
]);

export function getParallaxInteriorPresetOptions() {
    return PARALLAX_INTERIOR_PRESET_CATALOG.map((entry) => ({ id: entry.id, label: entry.label }));
}

export function getParallaxInteriorPresetById(presetId) {
    const id = typeof presetId === 'string' ? presetId : '';
    return PARALLAX_INTERIOR_PRESET_CATALOG.find((entry) => entry.id === id) ?? null;
}

export function resolveParallaxInteriorPresetInteriorConfig(presetId) {
    const preset = getParallaxInteriorPresetById(presetId);
    if (!preset) return null;

    const atlasLayout = getWindowInteriorAtlasLayoutById(preset.atlasId) ?? getWindowInteriorAtlasLayoutById(DEFAULT_WINDOW_INTERIOR_ATLAS_ID);
    const atlasId = atlasLayout?.id ?? DEFAULT_WINDOW_INTERIOR_ATLAS_ID;
    const cols = Math.max(1, atlasLayout?.cols | 0);
    const rows = Math.max(1, atlasLayout?.rows | 0);

    return {
        enabled: true,
        atlasId,
        atlas: { cols, rows },
        randomizeCell: true,
        cell: { col: 0, row: 0 },
        randomFlipX: true,
        uvPan: { x: 0.0, y: 0.0 },
        uvZoom: clamp(PARALLAX_INTERIOR_DEFAULTS.uvZoom, 0.25, 20.0, PARALLAX_INTERIOR_DEFAULTS.uvZoom),
        imageAspect: 1.0,
        parallaxDepthMeters: clamp(
            PARALLAX_INTERIOR_DEFAULTS.parallaxDepthMeters,
            0.0,
            50.0,
            PARALLAX_INTERIOR_DEFAULTS.parallaxDepthMeters
        ),
        parallaxScale: {
            x: PARALLAX_INTERIOR_DEFAULTS.parallaxScale.x,
            y: PARALLAX_INTERIOR_DEFAULTS.parallaxScale.y
        },
        zOffset: 0.0,
        emissiveIntensity: 0.0,
        tintVariation: {
            hueShiftDeg: {
                min: PARALLAX_INTERIOR_DEFAULTS.tintVariation.hueShiftDeg.min,
                max: PARALLAX_INTERIOR_DEFAULTS.tintVariation.hueShiftDeg.max
            },
            saturationMul: {
                min: PARALLAX_INTERIOR_DEFAULTS.tintVariation.saturationMul.min,
                max: PARALLAX_INTERIOR_DEFAULTS.tintVariation.saturationMul.max
            },
            brightnessMul: {
                min: PARALLAX_INTERIOR_DEFAULTS.tintVariation.brightnessMul.min,
                max: PARALLAX_INTERIOR_DEFAULTS.tintVariation.brightnessMul.max
            }
        }
    };
}
