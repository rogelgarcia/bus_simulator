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
        uvZoom: clamp(1.6, 0.25, 20.0, 1.6),
        imageAspect: 1.0,
        parallaxDepthMeters: clamp(20.0, 0.0, 50.0, 20.0),
        parallaxScale: { x: 1.0, y: 1.0 },
        zOffset: 0.0,
        emissiveIntensity: 0.0,
        tintVariation: {
            hueShiftDeg: { min: -8.0, max: 8.0 },
            saturationMul: { min: 0.92, max: 1.08 },
            brightnessMul: { min: 0.9, max: 1.12 }
        }
    };
}

