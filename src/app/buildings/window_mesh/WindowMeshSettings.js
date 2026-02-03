// src/app/buildings/window_mesh/WindowMeshSettings.js
// Window mesh settings model + sanitization (renderer-agnostic).
// @ts-check

import { DEFAULT_WINDOW_INTERIOR_ATLAS_ID, getWindowInteriorAtlasLayoutById } from './WindowInteriorAtlasLayoutCatalog.js';
import { DEFAULT_PARALLAX_INTERIOR_PRESET_ID, resolveParallaxInteriorPresetInteriorConfig } from './ParallaxInteriorPresetCatalog.js';

const VERSION = 1;
const WARNED_UNKNOWN_PARALLAX_INTERIOR_PRESETS = new Set();

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function normalizeHexColor(value, fallback) {
    if (Number.isFinite(value)) return (Number(value) >>> 0) & 0xffffff;

    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return fallback;
    const v = raw.startsWith('#')
        ? raw.slice(1)
        : (raw.toLowerCase().startsWith('0x') ? raw.slice(2) : raw);
    if (v.length === 3 && /^[0-9a-fA-F]{3}$/.test(v)) {
        const r = v[0];
        const g = v[1];
        const b = v[2];
        return parseInt(`${r}${r}${g}${g}${b}${b}`, 16) & 0xffffff;
    }
    if (v.length === 6 && /^[0-9a-fA-F]{6}$/.test(v)) return parseInt(v, 16) & 0xffffff;
    return fallback;
}

function normalizeRange2(value, { min, max, fallbackMin, fallbackMax } = {}) {
    const src = value && typeof value === 'object' ? value : {};
    const a = clamp(src.min, min, max, fallbackMin);
    const b = clamp(src.max, min, max, fallbackMax);
    return a <= b ? { min: a, max: b } : { min: b, max: a };
}

export const WINDOW_SHADE_COVERAGE = Object.freeze({
    NONE: 0.0,
    PCT_20: 0.2,
    PCT_50: 0.5,
    PCT_100: 1.0
});

export const WINDOW_SHADE_DIRECTION = Object.freeze({
    TOP_TO_BOTTOM: 'top_to_bottom',
    LEFT_TO_RIGHT: 'left_to_right',
    RIGHT_TO_LEFT: 'right_to_left',
    RANDOM_LR: 'random_lr'
});

const COVERAGE_VALUES = Object.freeze([
    WINDOW_SHADE_COVERAGE.NONE,
    WINDOW_SHADE_COVERAGE.PCT_20,
    WINDOW_SHADE_COVERAGE.PCT_50,
    WINDOW_SHADE_COVERAGE.PCT_100
]);

const SHADE_DIRECTION_VALUES = Object.freeze([
    WINDOW_SHADE_DIRECTION.TOP_TO_BOTTOM,
    WINDOW_SHADE_DIRECTION.LEFT_TO_RIGHT,
    WINDOW_SHADE_DIRECTION.RIGHT_TO_LEFT,
    WINDOW_SHADE_DIRECTION.RANDOM_LR
]);

function normalizeShadeCoverage(value, fallback) {
    const num = Number(value);
    if (Number.isFinite(num)) {
        for (const v of COVERAGE_VALUES) {
            if (Math.abs(num - v) < 1e-6) return v;
        }
    }

    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'none' || raw === '0' || raw === '0%' || raw === 'off') return WINDOW_SHADE_COVERAGE.NONE;
    if (raw === '20' || raw === '20%' || raw === '0.2') return WINDOW_SHADE_COVERAGE.PCT_20;
    if (raw === '50' || raw === '50%' || raw === '0.5') return WINDOW_SHADE_COVERAGE.PCT_50;
    if (raw === '100' || raw === '100%' || raw === '1' || raw === '1.0') return WINDOW_SHADE_COVERAGE.PCT_100;
    return fallback;
}

function normalizeShadeDirection(value, fallback) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw) {
        for (const v of SHADE_DIRECTION_VALUES) {
            if (raw === v) return v;
        }
    }

    if (raw === 'top' || raw === 'top-to-bottom' || raw === 'top_to_bottom' || raw === 'vertical') {
        return WINDOW_SHADE_DIRECTION.TOP_TO_BOTTOM;
    }
    if (raw === 'left' || raw === 'left-to-right' || raw === 'left_to_right' || raw === 'ltr') {
        return WINDOW_SHADE_DIRECTION.LEFT_TO_RIGHT;
    }
    if (raw === 'right' || raw === 'right-to-left' || raw === 'right_to_left' || raw === 'rtl') {
        return WINDOW_SHADE_DIRECTION.RIGHT_TO_LEFT;
    }
    if (raw === 'random' || raw === 'random-lr' || raw === 'random_lr') {
        return WINDOW_SHADE_DIRECTION.RANDOM_LR;
    }
    return fallback;
}

/**
 * @typedef {Object} WindowMeshArchSettings
 * @property {boolean} enabled
 * @property {number} heightRatio
 * @property {boolean} meetsRectangleFrame
 * @property {'frame'|'muntin'} topPieceMode
 * @property {boolean} clipVerticalMuntinsToRectWhenNoTopPiece
 */

/**
 * @typedef {Object} WindowMeshBevelSettings
 * @property {number} size
 * @property {number} roundness
 */

/**
 * @typedef {Object} WindowMeshPbrSettings
 * @property {number} roughness
 * @property {number} metalness
 * @property {number} envMapIntensity
 * @property {number} normalStrength
 */

/**
 * @typedef {Object} WindowMeshFrameSettings
 * @property {number} width
 * @property {number} depth
 * @property {number} inset
 * @property {number} colorHex
 * @property {WindowMeshBevelSettings} bevel
 * @property {WindowMeshPbrSettings} material
 */

/**
 * @typedef {Object} WindowMeshMuntinsSettings
 * @property {boolean} enabled
 * @property {number} columns
 * @property {number} rows
 * @property {number} verticalWidth
 * @property {number} horizontalWidth
 * @property {number} depth
 * @property {number} inset
 * @property {{x:number,y:number}} uvOffset
 * @property {number|null} colorHex
 * @property {{inherit:boolean, bevel:WindowMeshBevelSettings}} bevel
 * @property {{inheritFromFrame:boolean, pbr:WindowMeshPbrSettings}} material
 */

/**
 * @typedef {Object} WindowMeshGlassReflectionSettings
 * @property {number} metalness
 * @property {number} roughness
 * @property {number} transmission
 * @property {number} ior
 * @property {number} envMapIntensity
 */

/**
 * @typedef {Object} WindowMeshGlassSettings
 * @property {number} opacity
 * @property {number} tintHex
 * @property {WindowMeshGlassReflectionSettings} reflection
 * @property {number} zOffset
 */

/**
 * @typedef {Object} WindowMeshShadeFabricSettings
 * @property {number} scale
 * @property {number} intensity
 */

/**
 * @typedef {Object} WindowMeshShadeSettings
 * @property {boolean} enabled
 * @property {number} coverage
 * @property {boolean} randomizeCoverage
 * @property {string} direction
 * @property {number} colorHex
 * @property {WindowMeshShadeFabricSettings} fabric
 * @property {number} zOffset
 */

/**
 * @typedef {Object} WindowMeshInteriorTintVariationSettings
 * @property {{min:number,max:number}} hueShiftDeg
 * @property {{min:number,max:number}} saturationMul
 * @property {{min:number,max:number}} brightnessMul
 */

/**
 * @typedef {Object} WindowMeshInteriorAtlasLayoutSettings
 * @property {number} cols
 * @property {number} rows
 */

/**
 * @typedef {Object} WindowMeshInteriorSettings
 * @property {boolean} enabled
 * @property {string|null} parallaxInteriorPresetId
 * @property {string} atlasId
 * @property {WindowMeshInteriorAtlasLayoutSettings} atlas
 * @property {boolean} randomizeCell
 * @property {{col:number,row:number}} cell
 * @property {boolean} randomFlipX
 * @property {{x:number,y:number}} uvPan
 * @property {number} uvZoom
 * @property {number} imageAspect
 * @property {number} parallaxDepthMeters
 * @property {{x:number,y:number}} parallaxScale
 * @property {number} zOffset
 * @property {number} emissiveIntensity
 * @property {WindowMeshInteriorTintVariationSettings} tintVariation
 */

/**
 * @typedef {Object} WindowMeshSettings
 * @property {number} version
 * @property {number} width
 * @property {number} height
 * @property {WindowMeshArchSettings} arch
 * @property {WindowMeshFrameSettings} frame
 * @property {WindowMeshMuntinsSettings} muntins
 * @property {WindowMeshGlassSettings} glass
 * @property {WindowMeshShadeSettings} shade
 * @property {WindowMeshInteriorSettings} interior
 */

export const WINDOW_MESH_DEFAULTS = Object.freeze({
    version: VERSION,
    width: 1.2,
    height: 1.6,
    arch: Object.freeze({
        enabled: false,
        heightRatio: 0.25,
        meetsRectangleFrame: true,
        topPieceMode: 'frame',
        clipVerticalMuntinsToRectWhenNoTopPiece: true
    }),
    frame: Object.freeze({
        width: 0.085,
        depth: 0.12,
        inset: 0.0,
        colorHex: 0xe9eef7,
        bevel: Object.freeze({
            size: 0.3,
            roundness: 0.65
        }),
        material: Object.freeze({
            roughness: 0.72,
            metalness: 0.0,
            envMapIntensity: 0.0,
            normalStrength: 0.6
        })
    }),
    muntins: Object.freeze({
        enabled: false,
        columns: 2,
        rows: 2,
        verticalWidth: 0.03,
        horizontalWidth: 0.03,
        depth: 0.06,
        inset: 0.012,
        uvOffset: Object.freeze({ x: 0.0, y: 0.0 }),
        colorHex: null,
        bevel: Object.freeze({
            inherit: true,
            bevel: Object.freeze({
                size: 0.3,
                roundness: 0.65
            })
        }),
        material: Object.freeze({
            inheritFromFrame: false,
            pbr: Object.freeze({
                roughness: 0.72,
                metalness: 0.0,
                envMapIntensity: 0.0,
                normalStrength: 0.55
            })
        })
    }),
    glass: Object.freeze({
        opacity: 0.85,
        tintHex: 0x1c1c21,
        reflection: Object.freeze({
            metalness: 0.0,
            roughness: 0.02,
            transmission: 0.0,
            ior: 1.5,
            envMapIntensity: 2.5
        }),
        zOffset: 0.0
    }),
    shade: Object.freeze({
        enabled: true,
        coverage: WINDOW_SHADE_COVERAGE.NONE,
        randomizeCoverage: true,
        direction: WINDOW_SHADE_DIRECTION.TOP_TO_BOTTOM,
        colorHex: 0xf3f1ea,
        fabric: Object.freeze({
            scale: 7.0,
            intensity: 0.18
        }),
        zOffset: -0.06
    }),
	    interior: Object.freeze({
	        enabled: true,
            parallaxInteriorPresetId: DEFAULT_PARALLAX_INTERIOR_PRESET_ID,
	        atlasId: DEFAULT_WINDOW_INTERIOR_ATLAS_ID,
	        atlas: Object.freeze({
	            cols: 4,
	            rows: 4
	        }),
	        randomizeCell: true,
	        cell: Object.freeze({ col: 0, row: 0 }),
	        randomFlipX: true,
	        uvPan: Object.freeze({ x: 0.0, y: 0.0 }),
	        uvZoom: 1.0,
	        imageAspect: 1.0,
	        parallaxDepthMeters: 3.0,
	        parallaxScale: Object.freeze({ x: 1.0, y: 1.0 }),
	        zOffset: 0.0,
	        emissiveIntensity: 0.0,
	        tintVariation: Object.freeze({
	            hueShiftDeg: Object.freeze({ min: -8.0, max: 8.0 }),
	            saturationMul: Object.freeze({ min: 0.92, max: 1.08 }),
	            brightnessMul: Object.freeze({ min: 0.9, max: 1.12 })
	        })
	    })
	});

export function sanitizeWindowMeshSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const width = clamp(src.width, 0.2, 12.0, WINDOW_MESH_DEFAULTS.width);
    const height = clamp(src.height, 0.2, 24.0, WINDOW_MESH_DEFAULTS.height);

    const archSrc = src.arch && typeof src.arch === 'object' ? src.arch : {};
    const archEnabled = archSrc.enabled !== undefined ? !!archSrc.enabled : WINDOW_MESH_DEFAULTS.arch.enabled;
    const archHeightRatio = clamp(archSrc.heightRatio, 0.0, 0.75, WINDOW_MESH_DEFAULTS.arch.heightRatio);
    const meetsRectangleFrame = archSrc.meetsRectangleFrame !== undefined
        ? !!archSrc.meetsRectangleFrame
        : WINDOW_MESH_DEFAULTS.arch.meetsRectangleFrame;
    const topPieceModeRaw = typeof archSrc.topPieceMode === 'string' ? archSrc.topPieceMode.trim().toLowerCase() : '';
    const topPieceMode = topPieceModeRaw === 'muntin' ? 'muntin' : WINDOW_MESH_DEFAULTS.arch.topPieceMode;
    const clipVerticalMuntinsToRectWhenNoTopPiece = archSrc.clipVerticalMuntinsToRectWhenNoTopPiece !== undefined
        ? !!archSrc.clipVerticalMuntinsToRectWhenNoTopPiece
        : WINDOW_MESH_DEFAULTS.arch.clipVerticalMuntinsToRectWhenNoTopPiece;

    const frameSrc = src.frame && typeof src.frame === 'object' ? src.frame : {};
    const frameWidth = clamp(frameSrc.width, 0.005, Math.min(0.5, width * 0.45), WINDOW_MESH_DEFAULTS.frame.width);
    const frameDepth = clamp(frameSrc.depth, 0.001, 1.0, WINDOW_MESH_DEFAULTS.frame.depth);
    const frameInset = clamp(frameSrc.inset, -1.0, 1.0, WINDOW_MESH_DEFAULTS.frame.inset);
    const frameBevelSrc = frameSrc.bevel && typeof frameSrc.bevel === 'object' ? frameSrc.bevel : {};
    const frameBevelSize = clamp(frameBevelSrc.size, 0.0, 1.0, WINDOW_MESH_DEFAULTS.frame.bevel.size);
    const frameRoundness = clamp(frameBevelSrc.roundness, 0.0, 1.0, WINDOW_MESH_DEFAULTS.frame.bevel.roundness);
    const frameColorHex = normalizeHexColor(frameSrc.colorHex ?? frameSrc.color, WINDOW_MESH_DEFAULTS.frame.colorHex);
    const frameMatSrc = frameSrc.material && typeof frameSrc.material === 'object' ? frameSrc.material : {};
    const frameRoughness = clamp(frameMatSrc.roughness, 0.0, 1.0, WINDOW_MESH_DEFAULTS.frame.material.roughness);
    const frameMetalness = clamp(frameMatSrc.metalness, 0.0, 1.0, WINDOW_MESH_DEFAULTS.frame.material.metalness);
    const frameEnvMapIntensity = clamp(frameMatSrc.envMapIntensity, 0.0, 8.0, WINDOW_MESH_DEFAULTS.frame.material.envMapIntensity);
    const frameNormalStrength = clamp(frameMatSrc.normalStrength, 0.0, 5.0, WINDOW_MESH_DEFAULTS.frame.material.normalStrength);

    const muntinSrc = src.muntins && typeof src.muntins === 'object' ? src.muntins : {};
    const muntinsEnabled = muntinSrc.enabled !== undefined ? !!muntinSrc.enabled : WINDOW_MESH_DEFAULTS.muntins.enabled;
    const columns = clampInt(muntinSrc.columns, 1, 12, WINDOW_MESH_DEFAULTS.muntins.columns);
    const rows = clampInt(muntinSrc.rows, 1, 12, WINDOW_MESH_DEFAULTS.muntins.rows);
    const legacyWidth = clamp(muntinSrc.width ?? muntinSrc.muntinWidth, 0.002, 3.0, WINDOW_MESH_DEFAULTS.muntins.verticalWidth);
    const muntinVerticalWidth = clamp(
        muntinSrc.verticalWidth ?? muntinSrc.widthX ?? muntinSrc.muntinWidthVertical,
        0.002,
        3.0,
        legacyWidth
    );
    const muntinHorizontalWidth = clamp(
        muntinSrc.horizontalWidth ?? muntinSrc.widthY ?? muntinSrc.muntinWidthHorizontal,
        0.002,
        3.0,
        legacyWidth
    );
    const muntinDepth = clamp(muntinSrc.depth ?? muntinSrc.muntinDepth, 0.0, 6.25, WINDOW_MESH_DEFAULTS.muntins.depth);
    const inset = clamp(muntinSrc.inset, 0.0, 0.2, WINDOW_MESH_DEFAULTS.muntins.inset);
    const uvOffSrc = muntinSrc.uvOffset && typeof muntinSrc.uvOffset === 'object' ? muntinSrc.uvOffset : muntinSrc;
    const uvOffsetX = clamp(uvOffSrc.x ?? uvOffSrc.uvOffsetX, -25.0, 25.0, WINDOW_MESH_DEFAULTS.muntins.uvOffset.x);
    const uvOffsetY = clamp(uvOffSrc.y ?? uvOffSrc.uvOffsetY, -25.0, 25.0, WINDOW_MESH_DEFAULTS.muntins.uvOffset.y);
    const muntinColorHexRaw = muntinSrc.colorHex ?? muntinSrc.color;
    const muntinColorHex = muntinColorHexRaw === null
        ? null
        : normalizeHexColor(muntinColorHexRaw, WINDOW_MESH_DEFAULTS.muntins.colorHex ?? frameColorHex);

    const muntinBevelSrc = muntinSrc.bevel && typeof muntinSrc.bevel === 'object' ? muntinSrc.bevel : {};
    const muntinBevelInherit = muntinBevelSrc.inherit !== undefined ? !!muntinBevelSrc.inherit : WINDOW_MESH_DEFAULTS.muntins.bevel.inherit;
    const muntinBevelInner = muntinBevelSrc.bevel && typeof muntinBevelSrc.bevel === 'object' ? muntinBevelSrc.bevel : muntinBevelSrc;
    const muntinBevelSize = clamp(muntinBevelInner.size, 0.0, 1.0, WINDOW_MESH_DEFAULTS.muntins.bevel.bevel.size);
    const muntinRoundness = clamp(muntinBevelInner.roundness, 0.0, 1.0, WINDOW_MESH_DEFAULTS.muntins.bevel.bevel.roundness);
    const muntinMatSrc = muntinSrc.material && typeof muntinSrc.material === 'object' ? muntinSrc.material : {};
    const muntinMaterialInheritFromFrame = muntinMatSrc.inheritFromFrame !== undefined
        ? !!muntinMatSrc.inheritFromFrame
        : WINDOW_MESH_DEFAULTS.muntins.material.inheritFromFrame;
    const muntinPbrSrc = muntinMatSrc.pbr && typeof muntinMatSrc.pbr === 'object' ? muntinMatSrc.pbr : muntinMatSrc;
    const muntinRoughness = clamp(muntinPbrSrc.roughness, 0.0, 1.0, WINDOW_MESH_DEFAULTS.muntins.material.pbr.roughness);
    const muntinMetalness = clamp(muntinPbrSrc.metalness, 0.0, 1.0, WINDOW_MESH_DEFAULTS.muntins.material.pbr.metalness);
    const muntinEnvMapIntensity = clamp(muntinPbrSrc.envMapIntensity, 0.0, 8.0, WINDOW_MESH_DEFAULTS.muntins.material.pbr.envMapIntensity);
    const muntinNormalStrength = clamp(muntinPbrSrc.normalStrength, 0.0, 5.0, WINDOW_MESH_DEFAULTS.muntins.material.pbr.normalStrength);

    const glassSrc = src.glass && typeof src.glass === 'object' ? src.glass : {};
    const glassOpacity = clamp(glassSrc.opacity, 0.0, 1.0, WINDOW_MESH_DEFAULTS.glass.opacity);
    const glassTintHex = normalizeHexColor(glassSrc.tintHex ?? glassSrc.tint ?? glassSrc.colorHex ?? glassSrc.color, WINDOW_MESH_DEFAULTS.glass.tintHex);
    const reflSrc = glassSrc.reflection && typeof glassSrc.reflection === 'object' ? glassSrc.reflection : glassSrc;
    const metalness = clamp(reflSrc.metalness, 0.0, 1.0, WINDOW_MESH_DEFAULTS.glass.reflection.metalness);
    const roughness = clamp(reflSrc.roughness, 0.0, 1.0, WINDOW_MESH_DEFAULTS.glass.reflection.roughness);
    const transmission = clamp(reflSrc.transmission, 0.0, 1.0, WINDOW_MESH_DEFAULTS.glass.reflection.transmission);
    const ior = clamp(reflSrc.ior ?? reflSrc.indexOfRefraction, 1.0, 2.5, WINDOW_MESH_DEFAULTS.glass.reflection.ior);
    const envMapIntensity = clamp(reflSrc.envMapIntensity, 0.0, 8.0, WINDOW_MESH_DEFAULTS.glass.reflection.envMapIntensity);
    const zOffset = clamp(glassSrc.zOffset, -0.25, 0.25, WINDOW_MESH_DEFAULTS.glass.zOffset);

    const shadeSrc = src.shade && typeof src.shade === 'object' ? src.shade : {};
    const shadeEnabled = shadeSrc.enabled !== undefined ? !!shadeSrc.enabled : WINDOW_MESH_DEFAULTS.shade.enabled;
    const coverage = normalizeShadeCoverage(shadeSrc.coverage, WINDOW_MESH_DEFAULTS.shade.coverage);
    const randomizeCoverage = shadeSrc.randomizeCoverage !== undefined ? !!shadeSrc.randomizeCoverage : WINDOW_MESH_DEFAULTS.shade.randomizeCoverage;
    const direction = normalizeShadeDirection(
        shadeSrc.direction ?? shadeSrc.directionMode ?? shadeSrc.mode,
        WINDOW_MESH_DEFAULTS.shade.direction
    );
    const shadeColorHex = normalizeHexColor(shadeSrc.colorHex ?? shadeSrc.color, WINDOW_MESH_DEFAULTS.shade.colorHex);
    const fabricSrc = shadeSrc.fabric && typeof shadeSrc.fabric === 'object' ? shadeSrc.fabric : shadeSrc;
    const fabricScale = clamp(fabricSrc.scale ?? fabricSrc.textureScale, 0.1, 40.0, WINDOW_MESH_DEFAULTS.shade.fabric.scale);
    const fabricIntensity = clamp(fabricSrc.intensity ?? fabricSrc.textureIntensity, 0.0, 1.0, WINDOW_MESH_DEFAULTS.shade.fabric.intensity);
    const shadeZOffset = clamp(shadeSrc.zOffset, -1.0, 0.25, WINDOW_MESH_DEFAULTS.shade.zOffset);

    const interiorSrc = src.interior && typeof src.interior === 'object' ? src.interior : {};
    const interiorEnabled = interiorSrc.enabled !== undefined ? !!interiorSrc.enabled : WINDOW_MESH_DEFAULTS.interior.enabled;
    const presetIdRaw = interiorSrc.parallaxInteriorPresetId ?? interiorSrc.parallaxInteriorId ?? null;
    const presetIdCandidate = typeof presetIdRaw === 'string' ? presetIdRaw : '';
    const presetInterior = presetIdCandidate ? resolveParallaxInteriorPresetInteriorConfig(presetIdCandidate) : null;
    const presetId = presetInterior ? presetIdCandidate : null;
    if (!presetInterior && presetIdCandidate && !WARNED_UNKNOWN_PARALLAX_INTERIOR_PRESETS.has(presetIdCandidate)) {
        WARNED_UNKNOWN_PARALLAX_INTERIOR_PRESETS.add(presetIdCandidate);
        console.warn(`[WindowMeshSettings] Unknown parallax interior preset id "${presetIdCandidate}".`);
    }

    const atlasSrc = interiorSrc.atlas && typeof interiorSrc.atlas === 'object' ? interiorSrc.atlas : {};
    const atlasIdRaw = presetInterior?.atlasId ?? interiorSrc.atlasId ?? atlasSrc.atlasId ?? atlasSrc.id ?? atlasSrc.atlas ?? null;
    const atlasIdCandidate = typeof atlasIdRaw === 'string' ? atlasIdRaw : '';
    const atlasLayout = getWindowInteriorAtlasLayoutById(atlasIdCandidate) ?? getWindowInteriorAtlasLayoutById(DEFAULT_WINDOW_INTERIOR_ATLAS_ID);
    const atlasId = atlasLayout?.id ?? DEFAULT_WINDOW_INTERIOR_ATLAS_ID;
    const atlasCols = Math.max(1, atlasLayout?.cols | 0);
    const atlasRows = Math.max(1, atlasLayout?.rows | 0);
    const randomizeCell = interiorSrc.randomizeCell !== undefined ? !!interiorSrc.randomizeCell : WINDOW_MESH_DEFAULTS.interior.randomizeCell;
    const cellSrc = interiorSrc.cell && typeof interiorSrc.cell === 'object' ? interiorSrc.cell : interiorSrc;
    const cellCol = clampInt(cellSrc.col ?? cellSrc.cellCol, 0, atlasCols - 1, WINDOW_MESH_DEFAULTS.interior.cell.col);
    const cellRow = clampInt(cellSrc.row ?? cellSrc.cellRow, 0, atlasRows - 1, WINDOW_MESH_DEFAULTS.interior.cell.row);
    const randomFlipX = interiorSrc.randomFlipX !== undefined ? !!interiorSrc.randomFlipX : WINDOW_MESH_DEFAULTS.interior.randomFlipX;
    const panSrc = interiorSrc.uvPan && typeof interiorSrc.uvPan === 'object'
        ? interiorSrc.uvPan
        : (interiorSrc.uvOffset && typeof interiorSrc.uvOffset === 'object' ? interiorSrc.uvOffset : interiorSrc);
    const uvPanX = clamp(panSrc.x ?? panSrc.uvPanX, -2.0, 2.0, WINDOW_MESH_DEFAULTS.interior.uvPan.x);
    const uvPanY = clamp(panSrc.y ?? panSrc.uvPanY, -2.0, 2.0, WINDOW_MESH_DEFAULTS.interior.uvPan.y);
	    const uvZoom = clamp(presetInterior?.uvZoom ?? interiorSrc.uvZoom ?? interiorSrc.zoom, 0.25, 20.0, WINDOW_MESH_DEFAULTS.interior.uvZoom);
	    const imageAspect = clamp(interiorSrc.imageAspect ?? interiorSrc.aspect, 0.25, 4.0, WINDOW_MESH_DEFAULTS.interior.imageAspect);
	    const parallaxDepthMeters = clamp(presetInterior?.parallaxDepthMeters ?? interiorSrc.parallaxDepthMeters ?? interiorSrc.depth, 0.0, 50.0, WINDOW_MESH_DEFAULTS.interior.parallaxDepthMeters);
	    const parScaleSrc = interiorSrc.parallaxScale && typeof interiorSrc.parallaxScale === 'object' ? interiorSrc.parallaxScale : interiorSrc;
	    const parallaxScaleX = clamp(parScaleSrc.x ?? parScaleSrc.parallaxScaleX, 0.0, 10.0, WINDOW_MESH_DEFAULTS.interior.parallaxScale.x);
	    const parallaxScaleY = clamp(parScaleSrc.y ?? parScaleSrc.parallaxScaleY, 0.0, 10.0, WINDOW_MESH_DEFAULTS.interior.parallaxScale.y);
	    const interiorZOffset = clamp(interiorSrc.zOffset, -1.0, 1.0, WINDOW_MESH_DEFAULTS.interior.zOffset);
	    const emissiveIntensity = clamp(interiorSrc.emissiveIntensity, 0.0, 5.0, WINDOW_MESH_DEFAULTS.interior.emissiveIntensity);
	    const tintSrc = interiorSrc.tintVariation && typeof interiorSrc.tintVariation === 'object' ? interiorSrc.tintVariation : {};
	    const hueShiftDeg = normalizeRange2(tintSrc.hueShiftDeg, {
	        min: -180.0,
        max: 180.0,
        fallbackMin: WINDOW_MESH_DEFAULTS.interior.tintVariation.hueShiftDeg.min,
        fallbackMax: WINDOW_MESH_DEFAULTS.interior.tintVariation.hueShiftDeg.max
    });
    const saturationMul = normalizeRange2(tintSrc.saturationMul, {
        min: 0.0,
        max: 2.0,
        fallbackMin: WINDOW_MESH_DEFAULTS.interior.tintVariation.saturationMul.min,
        fallbackMax: WINDOW_MESH_DEFAULTS.interior.tintVariation.saturationMul.max
    });
    const brightnessMul = normalizeRange2(tintSrc.brightnessMul, {
        min: 0.0,
        max: 3.0,
        fallbackMin: WINDOW_MESH_DEFAULTS.interior.tintVariation.brightnessMul.min,
        fallbackMax: WINDOW_MESH_DEFAULTS.interior.tintVariation.brightnessMul.max
    });

    const wantsArch = archEnabled && archHeightRatio > 0.001;
    const archRise = wantsArch ? archHeightRatio * width : 0.0;
    const minRectHeight = Math.max(frameWidth * 2.0, 0.05);
    const archOk = wantsArch && height - archRise >= minRectHeight;

    return {
        version: VERSION,
        width,
        height,
        arch: {
            enabled: archOk,
            heightRatio: archHeightRatio,
            meetsRectangleFrame,
            topPieceMode,
            clipVerticalMuntinsToRectWhenNoTopPiece
        },
        frame: {
            width: frameWidth,
            depth: frameDepth,
            inset: frameInset,
            colorHex: frameColorHex,
            bevel: { size: frameBevelSize, roundness: frameRoundness },
            material: {
                roughness: frameRoughness,
                metalness: frameMetalness,
                envMapIntensity: frameEnvMapIntensity,
                normalStrength: frameNormalStrength
            }
        },
        muntins: {
            enabled: muntinsEnabled && (columns > 1 || rows > 1),
            columns,
            rows,
            verticalWidth: muntinVerticalWidth,
            horizontalWidth: muntinHorizontalWidth,
            depth: muntinDepth,
            inset,
            uvOffset: { x: uvOffsetX, y: uvOffsetY },
            colorHex: muntinColorHex,
            bevel: { inherit: muntinBevelInherit, bevel: { size: muntinBevelSize, roundness: muntinRoundness } },
            material: {
                inheritFromFrame: muntinMaterialInheritFromFrame,
                pbr: {
                    roughness: muntinRoughness,
                    metalness: muntinMetalness,
                    envMapIntensity: muntinEnvMapIntensity,
                    normalStrength: muntinNormalStrength
                }
            }
        },
        glass: {
            opacity: glassOpacity,
            tintHex: glassTintHex,
            reflection: { metalness, roughness, transmission, ior, envMapIntensity },
            zOffset
        },
        shade: {
            enabled: shadeEnabled,
            coverage,
            randomizeCoverage,
            direction,
            colorHex: shadeColorHex,
            fabric: { scale: fabricScale, intensity: fabricIntensity },
            zOffset: shadeZOffset
        },
	        interior: {
	            enabled: interiorEnabled,
                parallaxInteriorPresetId: presetId,
	            atlasId,
	            atlas: { cols: atlasCols, rows: atlasRows },
	            randomizeCell,
	            cell: { col: cellCol, row: cellRow },
	            randomFlipX,
	            uvPan: { x: uvPanX, y: uvPanY },
	            uvZoom,
	            imageAspect,
	            parallaxDepthMeters,
	            parallaxScale: { x: parallaxScaleX, y: parallaxScaleY },
	            zOffset: interiorZOffset,
	            emissiveIntensity,
	            tintVariation: { hueShiftDeg, saturationMul, brightnessMul }
	        }
	    };
	}

export function getDefaultWindowMeshSettings() {
    return sanitizeWindowMeshSettings(WINDOW_MESH_DEFAULTS);
}
