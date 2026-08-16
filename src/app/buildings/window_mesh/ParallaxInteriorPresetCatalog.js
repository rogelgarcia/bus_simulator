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
    SHOP: 'parallax_interior.shop',
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
        id: PARALLAX_INTERIOR_PRESET_ID.SHOP,
        label: 'Shop',
        atlasId: WINDOW_INTERIOR_ATLAS_ID.SHOP_WIDE_6X4_01,
        // Storefront display glazing is large and viewed from close up: show
        // more of the shop room than a small window would, but keep enough
        // atlas-cell margin that the parallax shift never samples the clamped
        // cell edge (which reads as diagonal streaks at steep view angles).
        defaults: Object.freeze({
            uvZoom: 2.4,
            parallaxDepthMeters: 5.0,
            parallaxScale: Object.freeze({ x: 0.7, y: 0.7 }),
            tintVariation: Object.freeze({
                hueShiftDeg: Object.freeze({ min: 0.0, max: 0.0 }),
                saturationMul: Object.freeze({ min: 0.92, max: 1.0 }),
                brightnessMul: Object.freeze({ min: 0.9, max: 1.0 })
            })
        })
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

    const presetDefaults = preset?.defaults && typeof preset.defaults === 'object' ? preset.defaults : {};
    const defaults = {
        ...PARALLAX_INTERIOR_DEFAULTS,
        ...presetDefaults,
        parallaxScale: presetDefaults.parallaxScale ?? PARALLAX_INTERIOR_DEFAULTS.parallaxScale,
        tintVariation: presetDefaults.tintVariation ?? PARALLAX_INTERIOR_DEFAULTS.tintVariation
    };

    return {
        enabled: true,
        atlasId,
        atlas: { cols, rows },
        randomizeCell: true,
        cell: { col: 0, row: 0 },
        randomFlipX: true,
        uvPan: { x: 0.0, y: 0.0 },
        uvZoom: clamp(defaults.uvZoom, 0.25, 20.0, defaults.uvZoom),
        imageAspect: 1.0,
        parallaxDepthMeters: clamp(
            defaults.parallaxDepthMeters,
            0.0,
            50.0,
            defaults.parallaxDepthMeters
        ),
        parallaxScale: {
            x: defaults.parallaxScale.x,
            y: defaults.parallaxScale.y
        },
        zOffset: 0.0,
        emissiveIntensity: 0.0,
        tintVariation: {
            hueShiftDeg: {
                min: defaults.tintVariation.hueShiftDeg.min,
                max: defaults.tintVariation.hueShiftDeg.max
            },
            saturationMul: {
                min: defaults.tintVariation.saturationMul.min,
                max: defaults.tintVariation.saturationMul.max
            },
            brightnessMul: {
                min: defaults.tintVariation.brightnessMul.min,
                max: defaults.tintVariation.brightnessMul.max
            }
        }
    };
}
