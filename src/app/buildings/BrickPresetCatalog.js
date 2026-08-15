// src/app/buildings/BrickPresetCatalog.js
// Curated brick presets for building fabrication (AI 491).
//
// A preset bundles a base PBR brick texture with the procedural per-brick
// controls (bricksPerTileX/Y grid, mortar deltas), a wall-base tint and a
// tiling scale, so one preset id reproduces a reference colorway/format
// without adding new texture sets. Colorways come from tinting a small set
// of base textures (multiply tint), formats from tiling ratios.
//
// Per-building tint jitter: a preset reference may carry `jitter` so one
// preset yields block-scale variety — the jitter is derived from the
// building's material-variation seed, so it is deterministic per placement.
// @ts-check
import {
    applyWallBaseTintStateToWallBase,
    normalizeHueDegrees,
    sanitizeWallBaseTintState
} from './WallBaseTintModel.js';

export const BRICK_PRESET_COLORWAY = Object.freeze({
    RED: 'red',
    ORANGE: 'orange',
    BROWN: 'brown',
    TAN_BUFF: 'tan_buff',
    GRAY: 'gray',
    PAINTED: 'painted'
});

export const BRICK_PRESET_FORMAT = Object.freeze({
    STANDARD: 'standard',
    ROMAN: 'roman'
});

const DEFAULT_TINT_JITTER = Object.freeze({ hueDeg: 5, saturation: 0.05, value: 0.07 });

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function makeTiling({ tileMetersU, tileMetersV }) {
    const u = clamp(tileMetersU, 0.1, 100.0, 2.0);
    const v = clamp(tileMetersV, 0.01, 100.0, 2.0);
    return {
        enabled: true,
        tileMeters: v,
        tileMetersU: u,
        tileMetersV: v,
        uvEnabled: false,
        offsetU: 0,
        offsetV: 0,
        rotationDegrees: 0
    };
}

function makeWallBase({ hueDeg = 0, saturation = 0, value = 1, intensity = 1, brightness = 1, roughness = 0.85, normalStrength = 0.9 } = {}) {
    const out = { roughness: clamp(roughness, 0, 1, 0.85), normalStrength: clamp(normalStrength, 0, 2, 0.9) };
    applyWallBaseTintStateToWallBase(out, { hueDeg: normalizeHueDegrees(hueDeg), saturation, value, intensity, brightness });
    return out;
}

// Per-brick grids track each texture's inherent brick pattern (counts per
// texture tile), so the procedural tint/mortar overlay stays aligned with
// the painted bricks at any tiling scale.
function makeBrickVariation({ bricksPerTileX, bricksPerTileY, mortarWidth = 0.06, perBrickIntensity = 0.5, mortarIntensity = 0.4 }) {
    const layout = {
        bricksPerTileX: clamp(bricksPerTileX, 0.25, 200, 8),
        bricksPerTileY: clamp(bricksPerTileY, 0.25, 200, 16),
        mortarWidth: clamp(mortarWidth, 0.0, 0.49, 0.06),
        offsetX: 0,
        offsetY: 0
    };
    return {
        perBrick: {
            enabled: true,
            intensity: clamp(perBrickIntensity, 0, 4, 0.5),
            value: 0.09,
            saturation: 0.05,
            roughness: 0.1,
            hueDegrees: 4,
            normal: 0.0,
            layout: { ...layout }
        },
        mortar: {
            enabled: true,
            intensity: clamp(mortarIntensity, 0, 4, 0.4),
            value: -0.14,
            saturation: -0.08,
            roughness: 0.22,
            hueDegrees: 0,
            normal: 0.0,
            layout: { ...layout }
        }
    };
}

// Base texture facts (counts per texture tile, measured from the albedos).
const RED_BRICK_GRID = { bricksPerTileX: 8.5, bricksPerTileY: 16, mortarWidth: 0.07 };
const WHITEWASHED_GRID = { bricksPerTileX: 13, bricksPerTileY: 26, mortarWidth: 0.06 };
const PAINTED_GRID = { bricksPerTileX: 11, bricksPerTileY: 20, mortarWidth: 0.06 };
const SANDSTONE_GRID = { bricksPerTileX: 4, bricksPerTileY: 8, mortarWidth: 0.05 };

// Standard format: red_brick calibrated at 2.0m tiles reads as game-scale
// brick (brick_midrise_2). Roman format stretches U so bricks read long/low.
const STANDARD_TILING = { tileMetersU: 2.0, tileMetersV: 2.0 };
const ROMAN_TILING = { tileMetersU: 2.9, tileMetersV: 2.0 };
const SANDSTONE_TILING = { tileMetersU: 2.5, tileMetersV: 2.5 };
const SANDSTONE_ROMAN_TILING = { tileMetersU: 3.4, tileMetersV: 2.5 };

const BRICK_PRESETS = Object.freeze([
    Object.freeze({
        id: 'brick.red_standard',
        label: 'Red brick',
        colorway: BRICK_PRESET_COLORWAY.RED,
        format: BRICK_PRESET_FORMAT.STANDARD,
        material: Object.freeze({ kind: 'texture', id: 'pbr.red_brick' }),
        wallBase: Object.freeze(makeWallBase({})),
        tiling: Object.freeze(makeTiling(STANDARD_TILING)),
        brick: Object.freeze(makeBrickVariation(RED_BRICK_GRID)),
        tintJitter: DEFAULT_TINT_JITTER
    }),
    Object.freeze({
        id: 'brick.red_roman',
        label: 'Red brick — roman',
        colorway: BRICK_PRESET_COLORWAY.RED,
        format: BRICK_PRESET_FORMAT.ROMAN,
        material: Object.freeze({ kind: 'texture', id: 'pbr.red_brick' }),
        wallBase: Object.freeze(makeWallBase({})),
        tiling: Object.freeze(makeTiling(ROMAN_TILING)),
        brick: Object.freeze(makeBrickVariation(RED_BRICK_GRID)),
        tintJitter: DEFAULT_TINT_JITTER
    }),
    Object.freeze({
        id: 'brick.orange_standard',
        label: 'Orange brick',
        colorway: BRICK_PRESET_COLORWAY.ORANGE,
        format: BRICK_PRESET_FORMAT.STANDARD,
        material: Object.freeze({ kind: 'texture', id: 'pbr.red_brick' }),
        wallBase: Object.freeze(makeWallBase({ hueDeg: 30, saturation: 0.34, value: 1.0, intensity: 0.5, brightness: 1.08 })),
        tiling: Object.freeze(makeTiling(STANDARD_TILING)),
        brick: Object.freeze(makeBrickVariation(RED_BRICK_GRID)),
        tintJitter: DEFAULT_TINT_JITTER
    }),
    Object.freeze({
        id: 'brick.brown_standard',
        label: 'Brown brick',
        colorway: BRICK_PRESET_COLORWAY.BROWN,
        format: BRICK_PRESET_FORMAT.STANDARD,
        material: Object.freeze({ kind: 'texture', id: 'pbr.red_brick' }),
        wallBase: Object.freeze(makeWallBase({ hueDeg: 24, saturation: 0.5, value: 0.62, intensity: 0.55, brightness: 0.92 })),
        tiling: Object.freeze(makeTiling(STANDARD_TILING)),
        brick: Object.freeze(makeBrickVariation(RED_BRICK_GRID)),
        tintJitter: DEFAULT_TINT_JITTER
    }),
    Object.freeze({
        id: 'brick.tan_standard',
        label: 'Tan sandstone brick',
        colorway: BRICK_PRESET_COLORWAY.TAN_BUFF,
        format: BRICK_PRESET_FORMAT.STANDARD,
        material: Object.freeze({ kind: 'texture', id: 'pbr.seaworn_sandstone_brick' }),
        wallBase: Object.freeze(makeWallBase({})),
        tiling: Object.freeze(makeTiling(SANDSTONE_TILING)),
        brick: Object.freeze(makeBrickVariation(SANDSTONE_GRID)),
        tintJitter: DEFAULT_TINT_JITTER
    }),
    Object.freeze({
        id: 'brick.tan_roman',
        label: 'Tan sandstone — roman',
        colorway: BRICK_PRESET_COLORWAY.TAN_BUFF,
        format: BRICK_PRESET_FORMAT.ROMAN,
        material: Object.freeze({ kind: 'texture', id: 'pbr.seaworn_sandstone_brick' }),
        wallBase: Object.freeze(makeWallBase({})),
        tiling: Object.freeze(makeTiling(SANDSTONE_ROMAN_TILING)),
        brick: Object.freeze(makeBrickVariation(SANDSTONE_GRID)),
        tintJitter: DEFAULT_TINT_JITTER
    }),
    Object.freeze({
        id: 'brick.buff_standard',
        label: 'Buff brick',
        colorway: BRICK_PRESET_COLORWAY.TAN_BUFF,
        format: BRICK_PRESET_FORMAT.STANDARD,
        material: Object.freeze({ kind: 'texture', id: 'pbr.whitewashed_brick' }),
        wallBase: Object.freeze(makeWallBase({ hueDeg: 38, saturation: 0.22, value: 0.92, intensity: 0.85 })),
        tiling: Object.freeze(makeTiling(STANDARD_TILING)),
        brick: Object.freeze(makeBrickVariation(WHITEWASHED_GRID)),
        tintJitter: DEFAULT_TINT_JITTER
    }),
    Object.freeze({
        id: 'brick.gray_standard',
        label: 'Gray brick',
        colorway: BRICK_PRESET_COLORWAY.GRAY,
        format: BRICK_PRESET_FORMAT.STANDARD,
        material: Object.freeze({ kind: 'texture', id: 'pbr.whitewashed_brick' }),
        wallBase: Object.freeze(makeWallBase({ hueDeg: 220, saturation: 0.04, value: 0.6, intensity: 1.0 })),
        tiling: Object.freeze(makeTiling(STANDARD_TILING)),
        brick: Object.freeze(makeBrickVariation(WHITEWASHED_GRID)),
        tintJitter: DEFAULT_TINT_JITTER
    }),
    Object.freeze({
        id: 'brick.painted_white',
        label: 'Painted brick — white',
        colorway: BRICK_PRESET_COLORWAY.PAINTED,
        format: BRICK_PRESET_FORMAT.STANDARD,
        material: Object.freeze({ kind: 'texture', id: 'pbr.whitewashed_brick' }),
        wallBase: Object.freeze(makeWallBase({ value: 1.0, brightness: 1.06 })),
        tiling: Object.freeze(makeTiling(STANDARD_TILING)),
        brick: Object.freeze(makeBrickVariation({ ...WHITEWASHED_GRID, perBrickIntensity: 0.35, mortarIntensity: 0.3 })),
        tintJitter: DEFAULT_TINT_JITTER
    }),
    Object.freeze({
        id: 'brick.painted_blue',
        label: 'Painted brick — blue',
        colorway: BRICK_PRESET_COLORWAY.PAINTED,
        format: BRICK_PRESET_FORMAT.STANDARD,
        material: Object.freeze({ kind: 'texture', id: 'pbr.painted_brick' }),
        wallBase: Object.freeze(makeWallBase({})),
        tiling: Object.freeze(makeTiling(STANDARD_TILING)),
        brick: Object.freeze(makeBrickVariation({ ...PAINTED_GRID, perBrickIntensity: 0.3, mortarIntensity: 0.25 })),
        tintJitter: DEFAULT_TINT_JITTER
    })
]);

const PRESET_BY_ID = new Map(BRICK_PRESETS.map((preset) => [preset.id, preset]));

export function isBrickPresetId(presetId) {
    return PRESET_BY_ID.has(typeof presetId === 'string' ? presetId : '');
}

export function getBrickPresetById(presetId) {
    return PRESET_BY_ID.get(typeof presetId === 'string' ? presetId : '') ?? null;
}

export function getBrickPresets() {
    return BRICK_PRESETS.slice();
}

export function getBrickPresetOptions() {
    return BRICK_PRESETS.map((preset) => ({
        id: preset.id,
        label: preset.label,
        colorway: preset.colorway,
        format: preset.format,
        materialId: preset.material.id
    }));
}

function hashUint32(x) {
    let h = x >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h ^= h >>> 16;
    return h >>> 0;
}

function hashStringToUint32(str) {
    let h = 2166136261 >>> 0;
    const s = String(str ?? '');
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// Deterministic [0, 1) sample for (seed, salt).
function hash01(seed, salt) {
    return hashUint32((Number(seed) >>> 0) ^ hashStringToUint32(salt)) / 4294967296;
}

export function normalizeBrickTintJitterConfig(value, { fallback = DEFAULT_TINT_JITTER } = {}) {
    if (value === true) return { ...fallback };
    if (!value || typeof value !== 'object') return null;
    return {
        hueDeg: clamp(value.hueDeg, 0, 60, fallback.hueDeg),
        saturation: clamp(value.saturation, 0, 0.5, fallback.saturation),
        value: clamp(value.value, 0, 0.5, fallback.value)
    };
}

// Applies the seeded per-building jitter to a preset's tint state.
export function applyBrickTintJitterToWallBase(wallBase, { presetId, jitter, seed }) {
    const ranges = normalizeBrickTintJitterConfig(jitter, {
        fallback: getBrickPresetById(presetId)?.tintJitter ?? DEFAULT_TINT_JITTER
    });
    if (!ranges) return wallBase;

    const out = wallBase && typeof wallBase === 'object' ? { ...wallBase } : {};
    const state = sanitizeWallBaseTintState({
        hueDeg: out.tintHueDeg,
        saturation: out.tintSaturation,
        value: out.tintValue,
        intensity: out.tintIntensity,
        brightness: out.tintBrightness
    });

    const jHue = (hash01(seed, `${presetId}|hue`) * 2 - 1) * ranges.hueDeg;
    const jSat = (hash01(seed, `${presetId}|sat`) * 2 - 1) * ranges.saturation;
    const jVal = (hash01(seed, `${presetId}|val`) * 2 - 1) * ranges.value;

    applyWallBaseTintStateToWallBase(out, {
        hueDeg: normalizeHueDegrees(state.hueDeg + jHue),
        saturation: clamp(state.saturation + jSat, 0, 1, state.saturation),
        value: clamp(state.value + jVal, 0, 1, state.value),
        intensity: state.intensity,
        brightness: state.brightness
    });
    return out;
}

/**
 * Resolves a brick preset reference into a material bundle:
 * `{ material, wallBase, tiling, brick }` (all deep copies), with the
 * per-building tint jitter applied when requested.
 */
export function resolveBrickPresetBundle({ presetId, jitter = false, seed = 0 } = {}) {
    const preset = getBrickPresetById(presetId);
    if (!preset) return null;

    let wallBase = JSON.parse(JSON.stringify(preset.wallBase));
    if (jitter) wallBase = applyBrickTintJitterToWallBase(wallBase, { presetId: preset.id, jitter, seed });

    return {
        presetId: preset.id,
        material: { ...preset.material },
        wallBase,
        tiling: JSON.parse(JSON.stringify(preset.tiling)),
        brick: JSON.parse(JSON.stringify(preset.brick))
    };
}
