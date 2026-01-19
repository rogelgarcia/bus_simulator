// src/graphics/assets3d/materials/MaterialVariationSystem.js
// Applies deterministic, composable procedural material variation to MeshStandardMaterial via shader injection.
import * as THREE from 'three';

const MATVAR_SHADER_VERSION = 10;
const MATVAR_MACRO_LAYERS_MAX = 4;

const EPS = 1e-6;

export const MATERIAL_VARIATION_ROOT = Object.freeze({
    WALL: 'wall',
    SURFACE: 'surface'
});

export const MATERIAL_VARIATION_SPACE = Object.freeze({
    WORLD: 'world',
    OBJECT: 'object'
});

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function clamp01(value) {
    return clamp(value, 0, 1);
}

function normalizeRoot(value) {
    return value === MATERIAL_VARIATION_ROOT.SURFACE ? MATERIAL_VARIATION_ROOT.SURFACE : MATERIAL_VARIATION_ROOT.WALL;
}

function normalizeSpace(value) {
    return value === MATERIAL_VARIATION_SPACE.OBJECT ? MATERIAL_VARIATION_SPACE.OBJECT : MATERIAL_VARIATION_SPACE.WORLD;
}

function normalizeBand(value, { fallbackMin = 0, fallbackMax = 1 } = {}) {
    const src = value && typeof value === 'object' ? value : null;
    const a = clamp01(src?.min ?? fallbackMin);
    const b = clamp01(src?.max ?? fallbackMax);
    return a <= b ? { min: a, max: b } : { min: b, max: a };
}

function fnv1a32FromString(text, seed = 0x811c9dc5) {
    const str = typeof text === 'string' ? text : '';
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i) & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

function fnv1a32FromInts(ints, seed = 0x811c9dc5) {
    const list = Array.isArray(ints) ? ints : [];
    let h = seed >>> 0;
    for (const v of list) {
        const x = (Number(v) | 0) >>> 0;
        h ^= x & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
        h ^= (x >>> 8) & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
        h ^= (x >>> 16) & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
        h ^= (x >>> 24) & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

function normalizeTilesForSeed(tiles) {
    const out = [];
    if (!Array.isArray(tiles)) return out;
    for (const tile of tiles) {
        if (Array.isArray(tile) && tile.length >= 2) {
            out.push({ x: tile[0] | 0, y: tile[1] | 0 });
            continue;
        }
        if (tile && Number.isFinite(tile.x) && Number.isFinite(tile.y)) out.push({ x: tile.x | 0, y: tile.y | 0 });
    }

    out.sort((a, b) => (a.x - b.x) || (a.y - b.y));
    return out;
}

function normalizeSignedAmount(value, fallback = 0, { min = -4.0, max = 4.0 } = {}) {
    return clamp(value ?? fallback, min, max);
}

function normalizeLayerLike(value, preset = null, { enabledDefault = true } = {}) {
    const src = value && typeof value === 'object' ? value : {};
    const p = preset && typeof preset === 'object' ? preset : {};
    const enabled = src.enabled === undefined ? (p.enabled === undefined ? !!enabledDefault : !!p.enabled) : !!src.enabled;
    const intensity = clamp(src.intensity ?? src.strength ?? p.intensity ?? p.strength ?? 0.0, 0.0, 20.0);
    const scale = clamp(src.scale ?? p.scale ?? 1.0, 0.001, 80.0);
    const hueDegrees = clamp(src.hueDegrees ?? src.hue ?? p.hueDegrees ?? p.hue ?? 0.0, -180.0, 180.0);
    const valueAmount = normalizeSignedAmount(src.value ?? src.valueAmount ?? p.value ?? p.valueAmount ?? 0.0, 0.0);
    const saturationAmount = normalizeSignedAmount(src.saturation ?? src.saturationAmount ?? p.saturation ?? p.saturationAmount ?? 0.0, 0.0);
    const roughnessAmount = normalizeSignedAmount(src.roughness ?? src.roughnessAmount ?? p.roughness ?? p.roughnessAmount ?? 0.0, 0.0);
    const normalAmount = normalizeSignedAmount(src.normal ?? src.normalAmount ?? p.normal ?? p.normalAmount ?? 0.0, 0.0, { min: -2.0, max: 2.0 });
    return {
        enabled,
        intensity,
        scale,
        hueDegrees,
        value: valueAmount,
        saturation: saturationAmount,
        roughness: roughnessAmount,
        normal: normalAmount
    };
}

export function computeMaterialVariationSeedFromTiles(tiles, { salt = 'matvar', styleId = '' } = {}) {
    const safeSalt = typeof salt === 'string' ? salt : 'matvar';
    const safeStyle = typeof styleId === 'string' ? styleId : '';
    const points = normalizeTilesForSeed(tiles);

    const ints = [];
    for (const p of points) {
        ints.push(p.x | 0, p.y | 0);
    }

    let h = fnv1a32FromString(`${safeSalt}#${safeStyle}`, 0x811c9dc5);
    h = fnv1a32FromInts(ints, h);
    return h >>> 0;
}

function seedToFloat01(seed) {
    const s = (Number(seed) >>> 0) / 0xffffffff;
    return Number.isFinite(s) ? s : 0;
}

function makeVector3(value, fallback) {
    const src = value && typeof value === 'object' ? value : null;
    const fx = Number(fallback?.x);
    const fy = Number(fallback?.y);
    const fz = Number(fallback?.z);
    const x = Number.isFinite(src?.x) ? Number(src.x) : (Number.isFinite(fx) ? fx : 0);
    const y = Number.isFinite(src?.y) ? Number(src.y) : (Number.isFinite(fy) ? fy : 0);
    const z = Number.isFinite(src?.z) ? Number(src.z) : (Number.isFinite(fz) ? fz : 0);
    const v = new THREE.Vector3(x, y, z);
    const len = v.length();
    if (len > EPS) v.multiplyScalar(1 / len);
    return v;
}

function makeColor3(value, fallbackHex = 0x5b7f3a) {
    const color = new THREE.Color();
    if (typeof value === 'string') {
        try {
            color.setStyle(value);
            return color;
        } catch {
            color.setHex(fallbackHex);
            return color;
        }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        color.setHex(value);
        return color;
    }
    if (value && typeof value === 'object' && ('r' in value || 'g' in value || 'b' in value)) {
        const r = clamp(Number(value.r), 0, 1);
        const g = clamp(Number(value.g), 0, 1);
        const b = clamp(Number(value.b), 0, 1);
        color.setRGB(r, g, b);
        return color;
    }
    color.setHex(fallbackHex);
    return color;
}

export function getDefaultMaterialVariationPreset(root = MATERIAL_VARIATION_ROOT.WALL) {
    const r = normalizeRoot(root);
    if (r === MATERIAL_VARIATION_ROOT.SURFACE) {
        return {
            enabled: true,
            root: r,
            space: MATERIAL_VARIATION_SPACE.WORLD,
            worldSpaceScale: 0.18,
            objectSpaceScale: 0.18,
            globalIntensity: 1.0,
            tintAmount: 0.06,
            valueAmount: 0.06,
            saturationAmount: 0.06,
            roughnessAmount: 0.18,
            normalAmount: 0.2,
            aoAmount: 0.45,
            macroLayers: [
                { enabled: true, intensity: 0.9, scale: 0.22, hueDegrees: 0.0, value: 0.1, saturation: 0.06, roughness: 0.18, normal: 0.18 },
                { enabled: true, intensity: 0.55, scale: 3.0, hueDegrees: 0.0, value: 0.07, saturation: 0.05, roughness: 0.22, normal: 0.25 },
                { enabled: false, intensity: 0.35, scale: 0.9, hueDegrees: 0.0, value: 0.12, saturation: 0.0, roughness: 0.0, normal: 0.0, coverage: 0.65 },
                { enabled: false, intensity: 0.45, scale: 14.0, hueDegrees: 0.0, value: 0.0, saturation: 0.0, roughness: 0.24, normal: 0.18 }
            ],
            streaks: {
                enabled: false,
                strength: 0.0,
                scale: 0.55,
                direction: { x: 0, y: -1, z: 0 },
                ledgeStrength: 0.0,
                ledgeScale: 0.0,
                hueDegrees: 0.0,
                value: -0.18,
                saturation: -0.06,
                roughness: 0.18,
                normal: 0.0
            },
            exposure: {
                enabled: false,
                strength: 0.0,
                exponent: 1.6,
                direction: { x: 0.4, y: 0.85, z: 0.2 },
                value: 0.12,
                saturation: -0.16,
                roughness: -0.08
            },
            brick: {
                bricksPerTileX: 6.0,
                bricksPerTileY: 3.0,
                mortarWidth: 0.08,
                perBrick: { enabled: false, strength: 0.0, scale: 1.0, hueDegrees: 0.0, value: 0.06, saturation: 0.05, roughness: 0.1, normal: 0.0 },
                mortar: { enabled: false, strength: 0.0, scale: 1.0, hueDegrees: 0.0, value: -0.12, saturation: -0.05, roughness: 0.22, normal: 0.0 }
            },
            wearTop: { enabled: true, strength: 0.14, width: 0.38, scale: 0.7, hueDegrees: 0.0, value: 0.18, saturation: -0.2, roughness: 0.1, normal: 0.0 },
            wearBottom: { enabled: true, strength: 0.16, width: 0.5, scale: 0.85, hueDegrees: 0.0, value: -0.22, saturation: -0.05, roughness: 0.24, normal: 0.0 },
            wearSide: { enabled: true, strength: 0.12, width: 1.0, scale: 1.25, hueDegrees: 0.0, value: -0.18, saturation: -0.02, roughness: 0.2, normal: 0.0 },
            cracks: { enabled: false, strength: 0.25, scale: 2.8, hueDegrees: 0.0, value: -0.12, saturation: -0.05, roughness: 0.22, normal: 0.15 },
            antiTiling: { enabled: true, strength: 0.55, mode: 'fast', cellSize: 2.0, blendWidth: 0.2, offsetU: 0.22, offsetV: 0.22, rotationDegrees: 18.0 },
            stairShift: { enabled: false, strength: 0.0, mode: 'stair', direction: 'horizontal', stepSize: 1.0, shift: 0.1, blendWidth: 0.0, patternA: 0.4, patternB: 0.8 },

            macro: { enabled: true, intensity: 1.0, scale: 0.22, hueDegrees: 0.0 },
            roughnessVariation: { enabled: true, intensity: 1.0, microScale: 2.4, macroScale: 0.7 },
            edgeWear: { enabled: false, strength: 0.0, width: 0.08, noiseWarp: 1.4, horizontalStrength: 1.0, verticalStrength: 1.0, color: 1.0, roughness: 1.0 },
            grime: { enabled: true, strength: 0.16, scale: 0.85, cornerStrength: 0.0 },
            dust: { enabled: true, strength: 0.12, scale: 0.7, heightBand: { min: 0.55, max: 1.0 } },
            wetness: { enabled: false, strength: 0.0, scale: 1.0, heightBand: { min: 0.0, max: 1.0 } },
            sunBleach: { enabled: true, strength: 0.1, exponent: 1.6, direction: { x: 0.4, y: 0.85, z: 0.2 } },
            moss: { enabled: false, strength: 0.0, scale: 0.9, heightBand: { min: 0.0, max: 0.6 }, tint: { r: 0.22, g: 0.42, b: 0.2 } },
            soot: { enabled: false, strength: 0.0, scale: 0.8, heightBand: { min: 0.0, max: 0.25 } },
            efflorescence: { enabled: false, strength: 0.0, scale: 0.8 },
            detail: { enabled: true, strength: 0.08, scale: 3.2, hueDegrees: 0.0 }
        };
    }

    return {
        enabled: true,
        root: r,
        space: MATERIAL_VARIATION_SPACE.WORLD,
        worldSpaceScale: 0.16,
        objectSpaceScale: 0.16,
        globalIntensity: 1.0,
        tintAmount: 0.08,
        valueAmount: 0.07,
        saturationAmount: 0.07,
        roughnessAmount: 0.22,
        normalAmount: 0.28,
        aoAmount: 0.6,
        macroLayers: [
            { enabled: true, intensity: 1.0, scale: 0.2, hueDegrees: 0.0, value: 0.12, saturation: 0.08, roughness: 0.22, normal: 0.18 },
            { enabled: true, intensity: 0.75, scale: 3.0, hueDegrees: 0.0, value: 0.08, saturation: 0.06, roughness: 0.28, normal: 0.3 },
            { enabled: false, intensity: 0.55, scale: 0.8, hueDegrees: 0.0, value: 0.16, saturation: 0.0, roughness: 0.0, normal: 0.0, coverage: 0.6 },
            { enabled: false, intensity: 0.45, scale: 10.0, hueDegrees: 0.0, value: 0.0, saturation: 0.0, roughness: 0.28, normal: 0.2 }
        ],
        macro: { enabled: true, intensity: 1.0, scale: 0.2, hueDegrees: 0.0 },
        roughnessVariation: { enabled: true, intensity: 1.0, microScale: 2.0, macroScale: 0.55 },
        streaks: {
            enabled: true,
            strength: 0.35,
            scale: 0.55,
            direction: { x: 0, y: -1, z: 0 },
            ledgeStrength: 0.0,
            ledgeScale: 0.0,
            hueDegrees: 0.0,
            value: -0.22,
            saturation: -0.05,
            roughness: 0.24,
            normal: 0.0
        },
        exposure: {
            enabled: false,
            strength: 0.0,
            exponent: 1.8,
            direction: { x: 0.45, y: 0.8, z: 0.25 },
            value: 0.14,
            saturation: -0.18,
            roughness: -0.1
        },
        brick: {
            bricksPerTileX: 6.0,
            bricksPerTileY: 3.0,
            mortarWidth: 0.08,
            perBrick: { enabled: false, strength: 0.0, scale: 1.0, hueDegrees: 0.0, value: 0.06, saturation: 0.05, roughness: 0.12, normal: 0.0 },
            mortar: { enabled: false, strength: 0.0, scale: 1.0, hueDegrees: 0.0, value: -0.14, saturation: -0.06, roughness: 0.26, normal: 0.0 }
        },
        wearTop: { enabled: true, strength: 0.14, width: 0.42, scale: 0.65, hueDegrees: 0.0, value: 0.18, saturation: -0.22, roughness: 0.14, normal: 0.0 },
        wearBottom: { enabled: true, strength: 0.22, width: 0.55, scale: 0.9, hueDegrees: 0.0, value: -0.28, saturation: -0.08, roughness: 0.3, normal: 0.0 },
        wearSide: { enabled: true, strength: 0.18, width: 1.0, scale: 1.25, hueDegrees: 0.0, value: -0.22, saturation: -0.04, roughness: 0.24, normal: 0.0 },
        edgeWear: { enabled: true, strength: 0.28, width: 0.08, noiseWarp: 1.7, horizontalStrength: 1.0, verticalStrength: 1.0, color: 1.0, roughness: 1.0 },
        grime: { enabled: true, strength: 0.2, scale: 0.9, cornerStrength: 0.0 },
        dust: { enabled: true, strength: 0.14, scale: 0.65, heightBand: { min: 0.58, max: 1.0 } },
        wetness: { enabled: false, strength: 0.0, scale: 1.0, heightBand: { min: 0.0, max: 1.0 } },
        sunBleach: { enabled: true, strength: 0.12, exponent: 1.8, direction: { x: 0.45, y: 0.8, z: 0.25 } },
        moss: { enabled: false, strength: 0.0, scale: 0.9, heightBand: { min: 0.0, max: 0.55 }, tint: { r: 0.22, g: 0.42, b: 0.2 } },
        soot: { enabled: true, strength: 0.18, scale: 0.7, heightBand: { min: 0.0, max: 0.28 } },
        efflorescence: { enabled: false, strength: 0.0, scale: 0.9 },
        antiTiling: { enabled: true, strength: 0.65, mode: 'fast', cellSize: 2.0, blendWidth: 0.2, offsetU: 0.18, offsetV: 0.28, rotationDegrees: 22.0 },
        stairShift: { enabled: false, strength: 0.0, mode: 'stair', direction: 'horizontal', stepSize: 1.0, shift: 0.1, blendWidth: 0.0, patternA: 0.4, patternB: 0.8 },
        detail: { enabled: true, strength: 0.1, scale: 3.0, hueDegrees: 0.0 },
        cracks: { enabled: false, strength: 0.25, scale: 3.2 },
        cracksLayer: { enabled: false, strength: 0.25, scale: 3.2, hueDegrees: 0.0, value: -0.12, saturation: -0.05, roughness: 0.22, normal: 0.15 }
    };
}

export function normalizeMaterialVariationConfig(input, { root = MATERIAL_VARIATION_ROOT.WALL } = {}) {
    const preset = getDefaultMaterialVariationPreset(root);
    const cfg = (input && typeof input === 'object') ? input : {};

    const macro = cfg.macro ?? {};
    const roughnessVariation = cfg.roughnessVariation ?? {};
    const streaks = cfg.streaks ?? {};
    const exposure = cfg.exposure ?? {};
    const brick = cfg.brick ?? {};
    const edgeWear = cfg.edgeWear ?? {};
    const grime = cfg.grime ?? {};
    const dust = cfg.dust ?? {};
    const wetness = cfg.wetness ?? {};
    const sunBleach = cfg.sunBleach ?? {};
    const moss = cfg.moss ?? {};
    const soot = cfg.soot ?? {};
    const efflorescence = cfg.efflorescence ?? {};
    const antiTiling = cfg.antiTiling ?? {};
    const stairShift = cfg.stairShift ?? {};
    const detail = cfg.detail ?? {};
    const cracks = cfg.cracks ?? {};

    const antiMode = antiTiling.mode === 'quality' ? 'quality' : 'fast';
    const presetAnti = preset.antiTiling ?? {};
    const antiRotationDegrees = antiTiling.rotationDegrees ?? antiTiling.rotation ?? antiTiling.rotationAmount ?? presetAnti.rotationDegrees ?? 0.0;
    const antiCellSize = antiTiling.cellSize ?? antiTiling.macroCellSize ?? presetAnti.cellSize ?? 1.0;
    const antiBlendWidth = antiTiling.blendWidth ?? antiTiling.transitionSoftness ?? antiTiling.edgeFade ?? presetAnti.blendWidth ?? presetAnti.edgeFade ?? 0.18;
    const antiOffsetU = antiTiling.offsetU ?? antiTiling.offsetAmountU ?? antiTiling.jitterU ?? presetAnti.offsetU ?? 0.0;
    const antiOffsetV = antiTiling.offsetV ?? antiTiling.offsetAmountV ?? antiTiling.jitterV ?? antiTiling.tileJitter ?? presetAnti.offsetV ?? presetAnti.tileJitter ?? 0.0;

    const macroLayersRaw = Array.isArray(cfg.macroLayers) ? cfg.macroLayers : null;
    const presetMacroLayers = Array.isArray(preset.macroLayers) ? preset.macroLayers : [];
    const macroLayers = [];
    for (let i = 0; i < MATVAR_MACRO_LAYERS_MAX; i++) {
        const srcLayer = macroLayersRaw?.[i] ?? null;
        const fallback = presetMacroLayers[i] ?? presetMacroLayers[presetMacroLayers.length - 1] ?? null;
        if (srcLayer) {
            const normalized = normalizeLayerLike(srcLayer, fallback, { enabledDefault: i === 0 });
            if (i === 2) normalized.coverage = clamp(srcLayer.coverage ?? srcLayer.patchCoverage ?? fallback?.coverage ?? 0.0, 0.0, 1.0);
            macroLayers.push(normalized);
            continue;
        }

        if (!macroLayersRaw) {
            if (i === 0) {
                const legacy = normalizeLayerLike(
                    {
                        enabled: macro.enabled === undefined ? !!preset.macro.enabled : !!macro.enabled,
                        intensity: macro.intensity ?? preset.macro.intensity,
                        scale: macro.scale ?? preset.macro.scale,
                        hueDegrees: macro.hueDegrees ?? preset.macro.hueDegrees ?? 0.0,
                        value: cfg.valueAmount ?? preset.valueAmount,
                        saturation: cfg.saturationAmount ?? preset.saturationAmount,
                        roughness: (cfg.roughnessAmount ?? preset.roughnessAmount) * 0.35,
                        normal: (cfg.normalAmount ?? preset.normalAmount) * 0.15
                    },
                    fallback,
                    { enabledDefault: true }
                );
                macroLayers.push(legacy);
                continue;
            }
            if (i === 1) {
                const legacyDetail = normalizeLayerLike(
                    {
                        enabled: detail.enabled === undefined ? !!preset.detail.enabled : !!detail.enabled,
                        intensity: detail.strength ?? preset.detail.strength,
                        scale: detail.scale ?? preset.detail.scale,
                        hueDegrees: detail.hueDegrees ?? preset.detail.hueDegrees ?? 0.0,
                        value: (cfg.valueAmount ?? preset.valueAmount) * 0.95,
                        saturation: 0.0,
                        roughness: (cfg.roughnessAmount ?? preset.roughnessAmount) * 0.45,
                        normal: (cfg.normalAmount ?? preset.normalAmount) * 0.65
                    },
                    fallback,
                    { enabledDefault: true }
                );
                macroLayers.push(legacyDetail);
                continue;
            }
        }

        const normalized = normalizeLayerLike(fallback, fallback, { enabledDefault: false });
        if (i === 2) normalized.coverage = clamp(fallback?.coverage ?? 0.0, 0.0, 1.0);
        macroLayers.push(normalized);
    }

    const wearTop = normalizeLayerLike(cfg.wearTop ?? preset.wearTop, preset.wearTop, { enabledDefault: true });
    const wearTopWidth = clamp((cfg.wearTop?.width ?? preset.wearTop?.width ?? 0.35), 0.0, 1.0);
    wearTop.width = wearTopWidth;
    wearTop.scale = clamp(cfg.wearTop?.scale ?? preset.wearTop?.scale ?? wearTop.scale, 0.001, 50.0);

    const wearBottom = normalizeLayerLike(cfg.wearBottom ?? preset.wearBottom, preset.wearBottom, { enabledDefault: true });
    const wearBottomWidth = clamp((cfg.wearBottom?.width ?? preset.wearBottom?.width ?? 0.45), 0.0, 1.0);
    wearBottom.width = wearBottomWidth;
    wearBottom.scale = clamp(cfg.wearBottom?.scale ?? preset.wearBottom?.scale ?? wearBottom.scale, 0.001, 50.0);

    const wearSide = normalizeLayerLike(cfg.wearSide ?? preset.wearSide, preset.wearSide, { enabledDefault: true });
    const wearSideWidth = clamp((cfg.wearSide?.width ?? preset.wearSide?.width ?? 1.0), 0.0, 4.0);
    wearSide.width = wearSideWidth;
    wearSide.scale = clamp(cfg.wearSide?.scale ?? preset.wearSide?.scale ?? wearSide.scale, 0.001, 50.0);

    const legacyTopWearFromDust = !cfg.wearTop && (cfg.dust || preset.dust)
        ? {
            enabled: dust.enabled === undefined ? !!preset.dust.enabled : !!dust.enabled,
            intensity: dust.strength ?? preset.dust.strength,
            scale: dust.scale ?? preset.dust.scale,
            hueDegrees: 0.0,
            value: 0.08,
            saturation: -((cfg.saturationAmount ?? preset.saturationAmount) * 0.75),
            roughness: (cfg.roughnessAmount ?? preset.roughnessAmount) * 0.25,
            normal: 0.0,
            width: 1.0 - (normalizeBand(dust.heightBand ?? preset.dust.heightBand, { fallbackMin: 0.6, fallbackMax: 1.0 }).min)
        }
        : null;

    const legacyBottomWearFromGrime = !cfg.wearBottom && (cfg.grime || preset.grime)
        ? {
            enabled: grime.enabled === undefined ? !!preset.grime.enabled : !!grime.enabled,
            intensity: grime.strength ?? preset.grime.strength,
            scale: grime.scale ?? preset.grime.scale,
            hueDegrees: 0.0,
            value: -0.18,
            saturation: -0.05,
            roughness: (cfg.roughnessAmount ?? preset.roughnessAmount) * 0.45,
            normal: 0.0,
            width: 0.55
        }
        : null;

    const legacySideWearFromEdge = !cfg.wearSide && (cfg.edgeWear || preset.edgeWear)
        ? {
            enabled: edgeWear.enabled === undefined ? !!preset.edgeWear.enabled : !!edgeWear.enabled,
            intensity: edgeWear.strength ?? preset.edgeWear.strength,
            scale: edgeWear.noiseWarp ?? preset.edgeWear.noiseWarp,
            hueDegrees: 0.0,
            value: 0.18 * (edgeWear.color ?? preset.edgeWear.color ?? 1.0),
            saturation: 0.0,
            roughness: (cfg.roughnessAmount ?? preset.roughnessAmount) * 0.32 * (edgeWear.roughness ?? preset.edgeWear.roughness ?? 1.0),
            normal: 0.0,
            width: edgeWear.verticalStrength ?? preset.edgeWear.verticalStrength ?? 1.0
        }
        : null;

    const derivedWearTop = legacyTopWearFromDust ? normalizeLayerLike(legacyTopWearFromDust, preset.wearTop, { enabledDefault: true }) : wearTop;
    derivedWearTop.width = clamp(legacyTopWearFromDust?.width ?? derivedWearTop.width ?? 0.4, 0.0, 1.0);
    derivedWearTop.scale = clamp(legacyTopWearFromDust?.scale ?? derivedWearTop.scale ?? 0.8, 0.001, 50.0);

    const derivedWearBottom = legacyBottomWearFromGrime ? normalizeLayerLike(legacyBottomWearFromGrime, preset.wearBottom, { enabledDefault: true }) : wearBottom;
    derivedWearBottom.width = clamp(legacyBottomWearFromGrime?.width ?? derivedWearBottom.width ?? 0.55, 0.0, 1.0);
    derivedWearBottom.scale = clamp(legacyBottomWearFromGrime?.scale ?? derivedWearBottom.scale ?? 0.9, 0.001, 50.0);

    const derivedWearSide = legacySideWearFromEdge ? normalizeLayerLike(legacySideWearFromEdge, preset.wearSide, { enabledDefault: true }) : wearSide;
    derivedWearSide.width = clamp(legacySideWearFromEdge?.width ?? derivedWearSide.width ?? 1.0, 0.0, 4.0);
    derivedWearSide.scale = clamp(legacySideWearFromEdge?.scale ?? derivedWearSide.scale ?? 1.25, 0.001, 50.0);

    const streaksHueDegrees = clamp(streaks.hueDegrees ?? cfg.streaks?.hueDegrees ?? preset.streaks?.hueDegrees ?? 0.0, -180.0, 180.0);
    const streakValue = normalizeSignedAmount(streaks.value ?? cfg.streaks?.value ?? preset.streaks?.value ?? -0.18, -0.18);
    const streakSaturation = normalizeSignedAmount(streaks.saturation ?? cfg.streaks?.saturation ?? preset.streaks?.saturation ?? -0.05, -0.05);
    const streakRoughness = normalizeSignedAmount(streaks.roughness ?? cfg.streaks?.roughness ?? preset.streaks?.roughness ?? 0.22, 0.22);
    const streakNormal = normalizeSignedAmount(streaks.normal ?? cfg.streaks?.normal ?? preset.streaks?.normal ?? 0.0, 0.0, { min: -2.0, max: 2.0 });

    const cracksLayer = normalizeLayerLike(cfg.cracksLayer ?? cfg.cracks ?? preset.cracksLayer ?? preset.cracks, preset.cracksLayer ?? preset.cracks, { enabledDefault: false });

    const stairModeSrc = stairShift.mode ?? preset.stairShift?.mode;
    const stairMode =
        stairModeSrc === 'random'
            ? 'random'
            : (stairModeSrc === 'alternate'
                ? 'alternate'
                : ((stairModeSrc === 'pattern3' || stairModeSrc === 'bond3') ? 'pattern3' : 'stair'));
    const stairPatternA = clamp(stairShift.patternA ?? stairShift.bondA ?? preset.stairShift?.patternA ?? 0.4, -4.0, 4.0);
    const stairPatternB = clamp(stairShift.patternB ?? stairShift.bondB ?? preset.stairShift?.patternB ?? 0.8, -4.0, 4.0);

    const exposurePreset = preset.exposure ?? {};
    const exposureEnabled = exposure.enabled === undefined ? !!exposurePreset.enabled : !!exposure.enabled;
    const exposureStrength = clamp(exposure.strength ?? exposurePreset.strength ?? 0.0, 0.0, 12.0);
    const exposureExponent = clamp(exposure.exponent ?? exposurePreset.exponent ?? 1.6, 0.1, 8.0);
    const exposureDirection = makeVector3(exposure.direction ?? exposurePreset.direction, { x: 0.4, y: 0.8, z: 0.2 });
    const exposureValue = normalizeSignedAmount(exposure.value ?? exposure.valueAmount ?? exposurePreset.value ?? 0.12, 0.12);
    const exposureSaturation = normalizeSignedAmount(exposure.saturation ?? exposure.saturationAmount ?? exposurePreset.saturation ?? -0.16, -0.16);
    const exposureRoughness = normalizeSignedAmount(exposure.roughness ?? exposure.roughnessAmount ?? exposurePreset.roughness ?? -0.08, -0.08, { min: -2.0, max: 2.0 });

    const brickPreset = preset.brick ?? {};
    const bricksPerTileX = clamp(brick.bricksPerTileX ?? brick.bricksX ?? brickPreset.bricksPerTileX ?? 6.0, 0.25, 200.0);
    const bricksPerTileY = clamp(brick.bricksPerTileY ?? brick.bricksY ?? brickPreset.bricksPerTileY ?? 3.0, 0.25, 200.0);
    const mortarWidth = clamp(brick.mortarWidth ?? brick.mortar ?? brickPreset.mortarWidth ?? 0.08, 0.0, 0.49);
    const perBrick = normalizeLayerLike(brick.perBrick ?? brick.brick ?? brickPreset.perBrick, brickPreset.perBrick, { enabledDefault: false });
    const mortar = normalizeLayerLike(brick.mortar ?? brickPreset.mortar, brickPreset.mortar, { enabledDefault: false });

    return {
        enabled: cfg.enabled === undefined ? !!preset.enabled : !!cfg.enabled,
        root: normalizeRoot(cfg.root ?? preset.root),
        space: normalizeSpace(cfg.space ?? preset.space),
        worldSpaceScale: clamp(cfg.worldSpaceScale ?? preset.worldSpaceScale, 0.001, 20.0),
        objectSpaceScale: clamp(cfg.objectSpaceScale ?? preset.objectSpaceScale, 0.001, 20.0),
        globalIntensity: clamp(cfg.globalIntensity ?? preset.globalIntensity, 0.0, 20.0),
        tintAmount: clamp(cfg.tintAmount ?? preset.tintAmount, 0.0, 2.0),
        valueAmount: clamp(cfg.valueAmount ?? preset.valueAmount, 0.0, 2.0),
        saturationAmount: clamp(cfg.saturationAmount ?? preset.saturationAmount, 0.0, 2.0),
        roughnessAmount: clamp(cfg.roughnessAmount ?? preset.roughnessAmount, 0.0, 2.0),
        normalAmount: clamp(cfg.normalAmount ?? preset.normalAmount, 0.0, 4.0),
        aoAmount: clamp(cfg.aoAmount ?? preset.aoAmount, 0.0, 1.0),
        macroLayers,
        wearTop: derivedWearTop,
        wearBottom: derivedWearBottom,
        wearSide: derivedWearSide,
        cracksLayer,
        macro: {
            enabled: macro.enabled === undefined ? !!preset.macro.enabled : !!macro.enabled,
            intensity: clamp(macro.intensity ?? preset.macro.intensity, 0.0, 12.0),
            scale: clamp(macro.scale ?? preset.macro.scale, 0.001, 10.0),
            hueDegrees: clamp(macro.hueDegrees ?? preset.macro.hueDegrees ?? 0.0, -180.0, 180.0)
        },
        roughnessVariation: {
            enabled: roughnessVariation.enabled === undefined ? !!preset.roughnessVariation.enabled : !!roughnessVariation.enabled,
            intensity: clamp(roughnessVariation.intensity ?? preset.roughnessVariation.intensity, 0.0, 12.0),
            microScale: clamp(roughnessVariation.microScale ?? preset.roughnessVariation.microScale, 0.01, 50.0),
            macroScale: clamp(roughnessVariation.macroScale ?? preset.roughnessVariation.macroScale, 0.01, 50.0)
        },
        streaks: {
            enabled: streaks.enabled === undefined ? !!preset.streaks.enabled : !!streaks.enabled,
            strength: clamp(streaks.strength ?? preset.streaks.strength, 0.0, 12.0),
            scale: clamp(streaks.scale ?? preset.streaks.scale, 0.01, 50.0),
            direction: makeVector3(streaks.direction ?? preset.streaks.direction, { x: 0, y: -1, z: 0 }),
            ledgeStrength: clamp(streaks.ledgeStrength ?? preset.streaks.ledgeStrength, 0.0, 12.0),
            ledgeScale: clamp(streaks.ledgeScale ?? preset.streaks.ledgeScale, 0.0, 50.0),
            hueDegrees: streaksHueDegrees,
            value: streakValue,
            saturation: streakSaturation,
            roughness: streakRoughness,
            normal: streakNormal
        },
        exposure: {
            enabled: exposureEnabled,
            strength: exposureStrength,
            exponent: exposureExponent,
            direction: exposureDirection,
            value: exposureValue,
            saturation: exposureSaturation,
            roughness: exposureRoughness
        },
        brick: {
            bricksPerTileX,
            bricksPerTileY,
            mortarWidth,
            perBrick,
            mortar
        },
        edgeWear: {
            enabled: edgeWear.enabled === undefined ? !!preset.edgeWear.enabled : !!edgeWear.enabled,
            strength: clamp(edgeWear.strength ?? preset.edgeWear.strength, 0.0, 12.0),
            width: clamp(edgeWear.width ?? preset.edgeWear.width, 0.0, 0.5),
            noiseWarp: clamp(edgeWear.noiseWarp ?? preset.edgeWear.noiseWarp, 0.0, 10.0),
            horizontalStrength: clamp(edgeWear.horizontalStrength ?? preset.edgeWear.horizontalStrength ?? 1.0, 0.0, 12.0),
            verticalStrength: clamp(edgeWear.verticalStrength ?? preset.edgeWear.verticalStrength ?? 1.0, 0.0, 12.0),
            color: clamp(edgeWear.color ?? preset.edgeWear.color ?? 1.0, -2.0, 2.0),
            roughness: clamp(edgeWear.roughness ?? preset.edgeWear.roughness ?? 1.0, -2.0, 2.0)
        },
        grime: {
            enabled: grime.enabled === undefined ? !!preset.grime.enabled : !!grime.enabled,
            strength: clamp(grime.strength ?? preset.grime.strength, 0.0, 12.0),
            scale: clamp(grime.scale ?? preset.grime.scale, 0.01, 50.0),
            cornerStrength: clamp(grime.cornerStrength ?? preset.grime.cornerStrength ?? 0.0, 0.0, 12.0)
        },
        dust: {
            enabled: dust.enabled === undefined ? !!preset.dust.enabled : !!dust.enabled,
            strength: clamp(dust.strength ?? preset.dust.strength, 0.0, 12.0),
            scale: clamp(dust.scale ?? preset.dust.scale, 0.01, 50.0),
            heightBand: normalizeBand(dust.heightBand ?? preset.dust.heightBand, { fallbackMin: 0.6, fallbackMax: 1.0 })
        },
        wetness: {
            enabled: wetness.enabled === undefined ? !!preset.wetness.enabled : !!wetness.enabled,
            strength: clamp(wetness.strength ?? preset.wetness.strength, 0.0, 12.0),
            scale: clamp(wetness.scale ?? preset.wetness.scale, 0.01, 50.0),
            heightBand: normalizeBand(wetness.heightBand ?? preset.wetness.heightBand, { fallbackMin: 0.0, fallbackMax: 1.0 })
        },
        sunBleach: {
            enabled: sunBleach.enabled === undefined ? !!preset.sunBleach.enabled : !!sunBleach.enabled,
            strength: clamp(sunBleach.strength ?? preset.sunBleach.strength, 0.0, 12.0),
            exponent: clamp(sunBleach.exponent ?? preset.sunBleach.exponent, 0.1, 8.0),
            direction: makeVector3(sunBleach.direction ?? preset.sunBleach.direction, { x: 0.4, y: 0.8, z: 0.2 })
        },
        moss: {
            enabled: moss.enabled === undefined ? !!preset.moss.enabled : !!moss.enabled,
            strength: clamp(moss.strength ?? preset.moss.strength, 0.0, 12.0),
            scale: clamp(moss.scale ?? preset.moss.scale, 0.01, 50.0),
            heightBand: normalizeBand(moss.heightBand ?? preset.moss.heightBand, { fallbackMin: 0.0, fallbackMax: 0.6 }),
            tint: makeColor3(moss.tint ?? preset.moss.tint, 0x406b2d)
        },
        soot: {
            enabled: soot.enabled === undefined ? !!preset.soot.enabled : !!soot.enabled,
            strength: clamp(soot.strength ?? preset.soot.strength, 0.0, 12.0),
            scale: clamp(soot.scale ?? preset.soot.scale, 0.01, 50.0),
            heightBand: normalizeBand(soot.heightBand ?? preset.soot.heightBand, { fallbackMin: 0.0, fallbackMax: 0.3 })
        },
        efflorescence: {
            enabled: efflorescence.enabled === undefined ? !!preset.efflorescence.enabled : !!efflorescence.enabled,
            strength: clamp(efflorescence.strength ?? preset.efflorescence.strength, 0.0, 12.0),
            scale: clamp(efflorescence.scale ?? preset.efflorescence.scale, 0.01, 50.0)
        },
        antiTiling: {
            enabled: antiTiling.enabled === undefined ? !!preset.antiTiling.enabled : !!antiTiling.enabled,
            mode: antiMode,
            strength: clamp(antiTiling.strength ?? presetAnti.strength ?? 0.65, 0.0, 12.0),
            cellSize: clamp(antiCellSize, 0.25, 20.0),
            blendWidth: clamp(antiBlendWidth, 0.0, 0.49),
            offsetU: clamp(antiOffsetU, -4.0, 4.0),
            offsetV: clamp(antiOffsetV, -4.0, 4.0),
            rotationDegrees: clamp(antiRotationDegrees, 0.0, 180.0)
        },
        stairShift: {
            mode: stairMode,
            enabled: stairShift.enabled === undefined ? !!preset.stairShift?.enabled : !!stairShift.enabled,
            strength: clamp(stairShift.strength ?? preset.stairShift?.strength ?? 0.0, 0.0, 12.0),
            direction: (stairShift.direction ?? preset.stairShift?.direction) === 'vertical' ? 'vertical' : 'horizontal',
            stepSize: clamp(stairShift.stepSize ?? preset.stairShift?.stepSize ?? 1.0, 0.01, 50.0),
            shift: clamp(stairShift.shift ?? preset.stairShift?.shift ?? 0.0, -4.0, 4.0),
            blendWidth: clamp(stairShift.blendWidth ?? preset.stairShift?.blendWidth ?? 0.0, 0.0, 0.49),
            patternA: stairPatternA,
            patternB: stairPatternB
        },
        detail: {
            enabled: detail.enabled === undefined ? !!preset.detail.enabled : !!detail.enabled,
            strength: clamp(detail.strength ?? preset.detail.strength, 0.0, 12.0),
            scale: clamp(detail.scale ?? preset.detail.scale, 0.01, 80.0),
            hueDegrees: clamp(detail.hueDegrees ?? preset.detail.hueDegrees ?? 0.0, -180.0, 180.0)
        },
        cracks: {
            enabled: cracks.enabled === undefined ? !!preset.cracks.enabled : !!cracks.enabled,
            strength: clamp(cracks.strength ?? preset.cracks.strength, 0.0, 12.0),
            scale: clamp(cracks.scale ?? preset.cracks.scale, 0.01, 80.0)
        }
    };
}

function buildUniformBundle({
    seed,
    seedOffset,
    heightMin,
    heightMax,
    config
} = {}) {
    const cfg = config;
    const safeSeed = (Number(seed) >>> 0) || 0;
    const safeSeedOffset = Number.isFinite(seedOffset) ? Number(seedOffset) : 0;
    const hMin = Number.isFinite(heightMin) ? Number(heightMin) : 0;
    const hMax = Number.isFinite(heightMax) ? Number(heightMax) : 1;
    const heightLo = Math.min(hMin, hMax);
    const heightHi = Math.max(hMin, hMax);

    const spaceMode = cfg.space === MATERIAL_VARIATION_SPACE.OBJECT ? 1 : 0;
    const antiRot = clamp(cfg.antiTiling.rotationDegrees, 0.0, 180.0) * (Math.PI / 180);
    const antiMode = cfg.antiTiling.mode === 'quality' ? 1 : 0;
    const macroLayers = Array.isArray(cfg.macroLayers) ? cfg.macroLayers : [];
    const macro0 = macroLayers[0] ?? null;
    const macro1 = macroLayers[1] ?? null;
    const macro2 = macroLayers[2] ?? null;
    const macro3 = macroLayers[3] ?? null;

    const macro0Hue = clamp(macro0?.hueDegrees ?? 0.0, -180.0, 180.0) * (Math.PI / 180);
    const macro1Hue = clamp(macro1?.hueDegrees ?? 0.0, -180.0, 180.0) * (Math.PI / 180);
    const macro2Hue = clamp(macro2?.hueDegrees ?? 0.0, -180.0, 180.0) * (Math.PI / 180);
    const macro3Hue = clamp(macro3?.hueDegrees ?? 0.0, -180.0, 180.0) * (Math.PI / 180);

    const wearTop = cfg.wearTop ?? null;
    const wearBottom = cfg.wearBottom ?? null;
    const wearSide = cfg.wearSide ?? null;
    const wearTopHue = clamp(wearTop?.hueDegrees ?? 0.0, -180.0, 180.0) * (Math.PI / 180);
    const wearBottomHue = clamp(wearBottom?.hueDegrees ?? 0.0, -180.0, 180.0) * (Math.PI / 180);
    const wearSideHue = clamp(wearSide?.hueDegrees ?? 0.0, -180.0, 180.0) * (Math.PI / 180);

    const streakHue = clamp(cfg.streaks?.hueDegrees ?? 0.0, -180.0, 180.0) * (Math.PI / 180);

    const cracks = cfg.cracksLayer ?? null;
    const cracksHue = clamp(cracks?.hueDegrees ?? 0.0, -180.0, 180.0) * (Math.PI / 180);
    const streakDir = cfg.streaks.direction.clone();
    const exposureDir = cfg.exposure.direction.clone();
    const exposureExponent = clamp(cfg.exposure.exponent ?? 1.6, 0.1, 8.0);
    const brick = cfg.brick ?? null;
    const perBrick = brick?.perBrick ?? null;
    const mortar = brick?.mortar ?? null;
    const perBrickHue = clamp(perBrick?.hueDegrees ?? 0.0, -180.0, 180.0) * (Math.PI / 180);
    const mortarHue = clamp(mortar?.hueDegrees ?? 0.0, -180.0, 180.0) * (Math.PI / 180);

    const stairMode = cfg.stairShift?.mode;
    const stairModeCode = stairMode === 'random' ? 2 : (stairMode === 'alternate' ? 1 : (stairMode === 'pattern3' ? 3 : 0));

    return {
        config0: new THREE.Vector4(safeSeed, safeSeedOffset, cfg.enabled ? cfg.globalIntensity : 0, spaceMode),
        config1: new THREE.Vector4(cfg.worldSpaceScale, cfg.objectSpaceScale, heightLo, heightHi),
        global1: new THREE.Vector4(cfg.aoAmount, 0.0, seedToFloat01(safeSeed), seedToFloat01(safeSeed ^ 0x9e3779b9)),

        macro0: new THREE.Vector4(macro0?.enabled ? macro0.intensity : 0.0, macro0?.scale ?? 1.0, macro0Hue, 0.0),
        macro0b: new THREE.Vector4(macro0?.value ?? 0.0, macro0?.saturation ?? 0.0, macro0?.roughness ?? 0.0, macro0?.normal ?? 0.0),
        macro1: new THREE.Vector4(macro1?.enabled ? macro1.intensity : 0.0, macro1?.scale ?? 1.0, macro1Hue, 0.0),
        macro1b: new THREE.Vector4(macro1?.value ?? 0.0, macro1?.saturation ?? 0.0, macro1?.roughness ?? 0.0, macro1?.normal ?? 0.0),
        macro2: new THREE.Vector4(macro2?.enabled ? macro2.intensity : 0.0, macro2?.scale ?? 1.0, macro2Hue, clamp(macro2?.coverage ?? 0.0, 0.0, 1.0)),
        macro2b: new THREE.Vector4(macro2?.value ?? 0.0, macro2?.saturation ?? 0.0, macro2?.roughness ?? 0.0, macro2?.normal ?? 0.0),
        macro3: new THREE.Vector4(macro3?.enabled ? macro3.intensity : 0.0, macro3?.scale ?? 1.0, macro3Hue, 0.0),
        macro3b: new THREE.Vector4(macro3?.value ?? 0.0, macro3?.saturation ?? 0.0, macro3?.roughness ?? 0.0, macro3?.normal ?? 0.0),

        streaks: new THREE.Vector4(cfg.streaks.enabled ? cfg.streaks.strength : 0.0, cfg.streaks.scale, cfg.streaks.ledgeStrength, cfg.streaks.ledgeScale),
        streakDir: new THREE.Vector4(streakDir.x, streakDir.y, streakDir.z, streakHue),
        streaks2: new THREE.Vector4(cfg.streaks.value ?? 0.0, cfg.streaks.saturation ?? 0.0, cfg.streaks.roughness ?? 0.0, cfg.streaks.normal ?? 0.0),
        exposure0: new THREE.Vector4(exposureDir.x, exposureDir.y, exposureDir.z, exposureExponent),
        exposure1: new THREE.Vector4(cfg.exposure.enabled ? cfg.exposure.strength : 0.0, cfg.exposure.value ?? 0.0, cfg.exposure.saturation ?? 0.0, cfg.exposure.roughness ?? 0.0),
        brick0: new THREE.Vector4(perBrick?.enabled ? perBrick.intensity : 0.0, mortar?.enabled ? mortar.intensity : 0.0, brick?.bricksPerTileX ?? 1.0, brick?.bricksPerTileY ?? 1.0),
        brick1: new THREE.Vector4(brick?.mortarWidth ?? 0.08, perBrickHue, mortarHue, 0.0),
        brick2: new THREE.Vector4(perBrick?.value ?? 0.0, perBrick?.saturation ?? 0.0, perBrick?.roughness ?? 0.0, perBrick?.normal ?? 0.0),
        brick3: new THREE.Vector4(mortar?.value ?? 0.0, mortar?.saturation ?? 0.0, mortar?.roughness ?? 0.0, mortar?.normal ?? 0.0),

        wearTop: new THREE.Vector4(wearTop?.enabled ? wearTop.intensity : 0.0, wearTop?.scale ?? 1.0, wearTop?.width ?? 0.3, wearTopHue),
        wearTop2: new THREE.Vector4(wearTop?.value ?? 0.0, wearTop?.saturation ?? 0.0, wearTop?.roughness ?? 0.0, wearTop?.normal ?? 0.0),
        wearBottom: new THREE.Vector4(wearBottom?.enabled ? wearBottom.intensity : 0.0, wearBottom?.scale ?? 1.0, wearBottom?.width ?? 0.5, wearBottomHue),
        wearBottom2: new THREE.Vector4(wearBottom?.value ?? 0.0, wearBottom?.saturation ?? 0.0, wearBottom?.roughness ?? 0.0, wearBottom?.normal ?? 0.0),
        wearSide: new THREE.Vector4(wearSide?.enabled ? wearSide.intensity : 0.0, wearSide?.scale ?? 1.0, wearSide?.width ?? 1.0, wearSideHue),
        wearSide2: new THREE.Vector4(wearSide?.value ?? 0.0, wearSide?.saturation ?? 0.0, wearSide?.roughness ?? 0.0, wearSide?.normal ?? 0.0),

        cracks: new THREE.Vector4(cracks?.enabled ? cracks.intensity : 0.0, cracks?.scale ?? 1.0, cracksHue, 0.0),
        cracks2: new THREE.Vector4(cracks?.value ?? 0.0, cracks?.saturation ?? 0.0, cracks?.roughness ?? 0.0, cracks?.normal ?? 0.0),

        anti: new THREE.Vector4(cfg.antiTiling.enabled ? cfg.antiTiling.strength : 0, cfg.antiTiling.cellSize, cfg.antiTiling.blendWidth, antiRot),
        anti2: new THREE.Vector4(cfg.antiTiling.offsetU, cfg.antiTiling.offsetV, antiMode, 0),
        stair: new THREE.Vector4(cfg.stairShift.enabled ? cfg.stairShift.strength : 0, cfg.stairShift.stepSize, cfg.stairShift.shift, cfg.stairShift.direction === 'vertical' ? 1 : 0),
        stair2: new THREE.Vector4(cfg.stairShift.blendWidth ?? 0.0, stairModeCode, cfg.stairShift.patternA ?? 0.4, cfg.stairShift.patternB ?? 0.8),
    };
}

function injectMatVarShader(material, shader) {
    const cfg = material?.userData?.materialVariationConfig ?? null;
    if (!cfg) return;

    shader.uniforms.uMatVarConfig0 = { value: cfg.uniforms.config0 };
    shader.uniforms.uMatVarConfig1 = { value: cfg.uniforms.config1 };
    shader.uniforms.uMatVarGlobal1 = { value: cfg.uniforms.global1 };
    shader.uniforms.uMatVarMacro0 = { value: cfg.uniforms.macro0 };
    shader.uniforms.uMatVarMacro0B = { value: cfg.uniforms.macro0b };
    shader.uniforms.uMatVarMacro1 = { value: cfg.uniforms.macro1 };
    shader.uniforms.uMatVarMacro1B = { value: cfg.uniforms.macro1b };
    shader.uniforms.uMatVarMacro2 = { value: cfg.uniforms.macro2 };
    shader.uniforms.uMatVarMacro2B = { value: cfg.uniforms.macro2b };
    shader.uniforms.uMatVarMacro3 = { value: cfg.uniforms.macro3 };
    shader.uniforms.uMatVarMacro3B = { value: cfg.uniforms.macro3b };
    shader.uniforms.uMatVarStreaks = { value: cfg.uniforms.streaks };
    shader.uniforms.uMatVarStreakDir = { value: cfg.uniforms.streakDir };
    shader.uniforms.uMatVarStreaks2 = { value: cfg.uniforms.streaks2 };
    shader.uniforms.uMatVarExposure0 = { value: cfg.uniforms.exposure0 };
    shader.uniforms.uMatVarExposure1 = { value: cfg.uniforms.exposure1 };
    shader.uniforms.uMatVarBrick0 = { value: cfg.uniforms.brick0 };
    shader.uniforms.uMatVarBrick1 = { value: cfg.uniforms.brick1 };
    shader.uniforms.uMatVarBrick2 = { value: cfg.uniforms.brick2 };
    shader.uniforms.uMatVarBrick3 = { value: cfg.uniforms.brick3 };
    shader.uniforms.uMatVarWearTop = { value: cfg.uniforms.wearTop };
    shader.uniforms.uMatVarWearTop2 = { value: cfg.uniforms.wearTop2 };
    shader.uniforms.uMatVarWearBottom = { value: cfg.uniforms.wearBottom };
    shader.uniforms.uMatVarWearBottom2 = { value: cfg.uniforms.wearBottom2 };
    shader.uniforms.uMatVarWearSide = { value: cfg.uniforms.wearSide };
    shader.uniforms.uMatVarWearSide2 = { value: cfg.uniforms.wearSide2 };
    shader.uniforms.uMatVarCracks = { value: cfg.uniforms.cracks };
    shader.uniforms.uMatVarCracks2 = { value: cfg.uniforms.cracks2 };
    shader.uniforms.uMatVarAnti = { value: cfg.uniforms.anti };
    shader.uniforms.uMatVarAnti2 = { value: cfg.uniforms.anti2 };
    shader.uniforms.uMatVarStair = { value: cfg.uniforms.stair };
    shader.uniforms.uMatVarStair2 = { value: cfg.uniforms.stair2 };

    const vertexCommonInject = [
        '#include <common>',
        '#ifdef USE_MATVAR',
        'varying vec3 vMatVarWorldPos;',
        'varying vec3 vMatVarObjectPos;',
        'varying vec3 vMatVarWorldNormal;',
        '#ifdef USE_MATVAR_CORNERDIST',
        'attribute float matVarCornerDist;',
        'varying float vMatVarCornerDist;',
        '#endif',
        '#endif'
    ].join('\n');

    shader.vertexShader = shader.vertexShader.replace('#include <common>', vertexCommonInject);

    shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        [
            '#include <worldpos_vertex>',
            '#ifdef USE_MATVAR',
            'vMatVarWorldPos = worldPosition.xyz;',
            'vMatVarObjectPos = transformed;',
            '#ifdef USE_MATVAR_CORNERDIST',
            'vMatVarCornerDist = matVarCornerDist;',
            '#endif',
            '#endif'
        ].join('\n')
    );

    shader.vertexShader = shader.vertexShader.replace(
        '#include <defaultnormal_vertex>',
        [
            '#include <defaultnormal_vertex>',
            '#ifdef USE_MATVAR',
            'vMatVarWorldNormal = normalize(mat3(modelMatrix) * normal);',
            '#endif'
        ].join('\n')
    );

    const fragCommonInject = [
        '#include <common>',
        '#ifdef USE_MATVAR',
        'varying vec3 vMatVarWorldPos;',
        'varying vec3 vMatVarObjectPos;',
        'varying vec3 vMatVarWorldNormal;',
        '#ifdef USE_MATVAR_CORNERDIST',
        'varying float vMatVarCornerDist;',
        '#endif',
        'uniform vec4 uMatVarConfig0;',
        'uniform vec4 uMatVarConfig1;',
        'uniform vec4 uMatVarGlobal1;',
        'uniform vec4 uMatVarMacro0;',
        'uniform vec4 uMatVarMacro0B;',
        'uniform vec4 uMatVarMacro1;',
        'uniform vec4 uMatVarMacro1B;',
        'uniform vec4 uMatVarMacro2;',
        'uniform vec4 uMatVarMacro2B;',
        'uniform vec4 uMatVarMacro3;',
        'uniform vec4 uMatVarMacro3B;',
        'uniform vec4 uMatVarStreaks;',
        'uniform vec4 uMatVarStreakDir;',
        'uniform vec4 uMatVarStreaks2;',
        'uniform vec4 uMatVarExposure0;',
        'uniform vec4 uMatVarExposure1;',
        'uniform vec4 uMatVarBrick0;',
        'uniform vec4 uMatVarBrick1;',
        'uniform vec4 uMatVarBrick2;',
        'uniform vec4 uMatVarBrick3;',
        'uniform vec4 uMatVarWearTop;',
        'uniform vec4 uMatVarWearTop2;',
        'uniform vec4 uMatVarWearBottom;',
        'uniform vec4 uMatVarWearBottom2;',
        'uniform vec4 uMatVarWearSide;',
        'uniform vec4 uMatVarWearSide2;',
        'uniform vec4 uMatVarCracks;',
        'uniform vec4 uMatVarCracks2;',
        'uniform vec4 uMatVarAnti;',
        'uniform vec4 uMatVarAnti2;',
        'uniform vec4 uMatVarStair;',
        'uniform vec4 uMatVarStair2;',
        'float mvHasEffect;',
        'float mvSaturate(float v){return clamp(v,0.0,1.0);}',
        'float mvHash12(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
        'vec2 mvHash22(vec2 p){float n=mvHash12(p);return vec2(n,mvHash12(p+n));}',
        'float mvNoise2(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);float a=mvHash12(i);float b=mvHash12(i+vec2(1.0,0.0));float c=mvHash12(i+vec2(0.0,1.0));float d=mvHash12(i+vec2(1.0,1.0));return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}',
        'float mvFbm2(vec2 p){float v=0.0;float a=0.5;vec2 shift=vec2(100.0,100.0);for(int i=0;i<4;i++){v+=a*mvNoise2(p);p=p*2.03+shift;a*=0.5;}return v;}',
        'float mvRidged2(vec2 p){float n=mvNoise2(p)*2.0-1.0;return 1.0-abs(n);}',
        'float mvFbmRidged(vec2 p){float v=0.0;float a=0.5;vec2 shift=vec2(23.7,91.3);for(int i=0;i<4;i++){v+=a*mvRidged2(p);p=p*2.0+shift;a*=0.5;}return v;}',
        'vec3 mvSaturateColor(vec3 c, float amount){float l=dot(c,vec3(0.2126,0.7152,0.0722));float t=clamp(1.0+amount,0.0,2.0);return mix(vec3(l),c,t);}',
        'vec3 mvHueShift(vec3 c, float a){float cosA=cos(a);float sinA=sin(a);float Y=dot(c,vec3(0.299,0.587,0.114));float I=dot(c,vec3(0.596,-0.275,-0.321));float Q=dot(c,vec3(0.212,-0.523,0.311));float I2=I*cosA-Q*sinA;float Q2=I*sinA+Q*cosA;return vec3(Y+0.956*I2+0.621*Q2,Y-0.272*I2-0.647*Q2,Y-1.106*I2+1.703*Q2);}',
        'vec2 mvPlanarUV(vec3 p, vec3 n){vec3 a=abs(n);if(a.y>a.x&&a.y>a.z)return p.xz;if(a.x>a.z)return p.zy;return p.xy;}',
        'void mvApplyLayer(inout vec3 col, inout float rough, inout float normalFactor, float mask, vec4 ch, float hue){',
        'if(abs(mask)<=1e-6)return;',
        'float mvCh=abs(ch.x)+abs(ch.y)+abs(ch.z)+abs(ch.w)+abs(hue);',
        'if(mvCh<=1e-6)return;',
        'mvHasEffect=1.0;',
        'if(abs(ch.x)>1e-6) col *= 1.0 + mask * ch.x;',
        'if(abs(ch.y)>1e-6) col = mvSaturateColor(col, mask * ch.y);',
        'if(abs(hue)>1e-6) col = mvHueShift(col, hue * mask);',
        'if(abs(ch.z)>1e-6) rough += mask * ch.z;',
        'if(abs(ch.w)>1e-6) normalFactor += mask * ch.w;',
        '}',
        'float mvSmooth01(float x){return x*x*(3.0-2.0*x);}',
        'vec3 mvAntiTiling(vec2 uv){',
        'float mvEnabled=step(1e-6,uMatVarConfig0.z);',
        'float anti=uMatVarAnti.x*mvEnabled;',
        'if(anti<=0.0) return vec3(uv,0.0);',
        'float quality=step(0.5,uMatVarAnti2.z);',
        'float cellSize=max(0.001,uMatVarAnti.y);',
        'vec2 cellUv=uv/cellSize;',
        'vec2 cell=floor(cellUv);',
        'vec2 f=fract(cellUv);',
        'float bw=clamp(uMatVarAnti.z,0.0,0.49);',
        'vec2 t=clamp((f-bw)/max(1e-5,1.0-2.0*bw),0.0,1.0);',
        't=vec2(mvSmooth01(t.x),mvSmooth01(t.y));',
        'float seedOffset=uMatVarConfig0.y;',
        'float seedOA=fract(uMatVarGlobal1.z+seedOffset*0.013);',
        'float seedOB=fract(uMatVarGlobal1.w+seedOffset*0.017);',
        'vec2 c00=cell;',
        'vec2 c10=cell+vec2(1.0,0.0);',
        'vec2 c01=cell+vec2(0.0,1.0);',
        'vec2 c11=cell+vec2(1.0,1.0);',
        'vec2 f00=f;',
        'vec2 f10=f-vec2(1.0,0.0);',
        'vec2 f01=f-vec2(0.0,1.0);',
        'vec2 f11=f-vec2(1.0,1.0);',
        'vec4 r00=vec4(mvHash12(c00+vec2(seedOA*91.7,seedOB*53.3)),mvHash22(c00+vec2(seedOB*17.3,seedOA*29.1)),0.0);',
        'vec4 r10=vec4(mvHash12(c10+vec2(seedOA*91.7,seedOB*53.3)),mvHash22(c10+vec2(seedOB*17.3,seedOA*29.1)),0.0);',
        'vec4 r01=vec4(mvHash12(c01+vec2(seedOA*91.7,seedOB*53.3)),mvHash22(c01+vec2(seedOB*17.3,seedOA*29.1)),0.0);',
        'vec4 r11=vec4(mvHash12(c11+vec2(seedOA*91.7,seedOB*53.3)),mvHash22(c11+vec2(seedOB*17.3,seedOA*29.1)),0.0);',
        'float a00=(r00.x*2.0-1.0)*uMatVarAnti.w*anti*quality;',
        'float a10=(r10.x*2.0-1.0)*uMatVarAnti.w*anti*quality;',
        'float a01=(r01.x*2.0-1.0)*uMatVarAnti.w*anti*quality;',
        'float a11=(r11.x*2.0-1.0)*uMatVarAnti.w*anti*quality;',
        'vec2 o00=(r00.yz*2.0-1.0)*uMatVarAnti2.xy*anti;',
        'vec2 o10=(r10.yz*2.0-1.0)*uMatVarAnti2.xy*anti;',
        'vec2 o01=(r01.yz*2.0-1.0)*uMatVarAnti2.xy*anti;',
        'vec2 o11=(r11.yz*2.0-1.0)*uMatVarAnti2.xy*anti;',
        'vec2 p00=f00-0.5;',
        'vec2 p10=f10-0.5;',
        'vec2 p01=f01-0.5;',
        'vec2 p11=f11-0.5;',
        'float c0=cos(a00);float s0=sin(a00);',
        'float c1=cos(a10);float s1=sin(a10);',
        'float c2=cos(a01);float s2=sin(a01);',
        'float c3=cos(a11);float s3=sin(a11);',
        'vec2 q00=mat2(c0,-s0,s0,c0)*p00+o00;',
        'vec2 q10=mat2(c1,-s1,s1,c1)*p10+o10;',
        'vec2 q01=mat2(c2,-s2,s2,c2)*p01+o01;',
        'vec2 q11=mat2(c3,-s3,s3,c3)*p11+o11;',
        'vec2 uv00=(c00+q00+0.5)*cellSize;',
        'vec2 uv10=(c10+q10+0.5)*cellSize;',
        'vec2 uv01=(c01+q01+0.5)*cellSize;',
        'vec2 uv11=(c11+q11+0.5)*cellSize;',
	        'float w00=(1.0-t.x)*(1.0-t.y);',
	        'float w10=t.x*(1.0-t.y);',
	        'float w01=(1.0-t.x)*t.y;',
	        'float w11=t.x*t.y;',
	        'vec2 uv2=uv00*w00+uv10*w10+uv01*w01+uv11*w11;',
	        'float ang=a00*w00+a10*w10+a01*w01+a11*w11;',
	        'if(uMatVarAnti2.z>0.5){',
	        'float n1=mvFbm2(uv*0.11+vec2(seedOB*13.1,seedOA*17.9));',
	        'float n2=mvFbm2(uv*0.13+vec2(seedOA*9.7,seedOB*21.3));',
	        'vec2 warp=(vec2(n1,n2)*2.0-1.0)*uMatVarAnti2.xy*1.2*anti;',
        'uv2+=warp;',
        '}',
        'return vec3(uv2,ang);',
        '}',
        'vec2 mvStairShiftUv(vec2 uv){',
        'float mvEnabled=step(1e-6,uMatVarConfig0.z);',
        'float s=uMatVarStair.x*mvEnabled;',
        'if(s<=0.0)return uv;',
        'float stepSize=max(0.001,uMatVarStair.y);',
        'float shift=uMatVarStair.z*s;',
        'float axis=(uMatVarStair.w<0.5)?uv.y:uv.x;',
        'float t=axis/stepSize;',
        'float idx0=floor(t);',
        'float idx1=idx0+1.0;',
        'float f=fract(t);',
        'float mode=uMatVarStair2.y;',
        'float o0=0.0;',
        'float o1=0.0;',
        'if(mode<0.5){',
        'o0=idx0*shift;',
        'o1=idx1*shift;',
        '}else if(mode<1.5){',
        'o0=mod(idx0,2.0)*shift;',
        'o1=mod(idx1,2.0)*shift;',
        '}else if(mode<2.5){',
        'float seedA=uMatVarGlobal1.z*37.1+uMatVarConfig0.y*0.19;',
        'float seedB=uMatVarGlobal1.w*53.7+uMatVarStair.w*11.9;',
        'float h0=mvHash12(vec2(idx0+seedA,seedB));',
        'float h1=mvHash12(vec2(idx1+seedA,seedB));',
        'o0=(h0*2.0-1.0)*shift;',
        'o1=(h1*2.0-1.0)*shift;',
        '}else{',
        'float a=uMatVarStair2.z;',
        'float b=uMatVarStair2.w;',
        'float k0=mod(idx0,3.0);',
        'float k1=mod(idx1,3.0);',
        'o0=(k0<0.5)?0.0:((k0<1.5)?(a*shift):(b*shift));',
        'o1=(k1<0.5)?0.0:((k1<1.5)?(a*shift):(b*shift));',
        '}',
        'float bw=clamp(uMatVarStair2.x,0.0,0.49);',
        'float blendT=0.0;',
        'if(bw>0.0){',
        'float edge=1.0-bw;',
        'blendT=mvSaturate((f-edge)/max(1e-5,bw));',
        'blendT=mvSmooth01(blendT);',
        '}',
        'float off=mix(o0,o1,blendT);',
        'return (uMatVarStair.w<0.5)?(uv+vec2(off,0.0)):(uv+vec2(0.0,off));',
        '}',
        '#ifdef USE_NORMALMAP',
        'vec3 mvPerturbNormal2Arb(vec3 eye_pos, vec3 surf_norm, vec3 mapN, float faceDirection, vec2 uv){',
        'vec3 q0=dFdx(eye_pos.xyz);',
        'vec3 q1=dFdy(eye_pos.xyz);',
        'vec2 st0=dFdx(uv.st);',
        'vec2 st1=dFdy(uv.st);',
        'vec3 S=normalize(q0*st1.t-q1*st0.t);',
        'vec3 T=normalize(-q0*st1.s+q1*st0.s);',
        'vec3 N=normalize(surf_norm);',
        'mat3 tsn=mat3(S,T,N);',
        'mapN.xy*=faceDirection;',
        'return normalize(tsn*mapN);',
        '}',
        '#endif',
        '#endif',
        'vec2 mvMatVarUv(vec2 uv){',
        '#ifdef USE_MATVAR',
        'uv = mvStairShiftUv(uv);vec3 a=mvAntiTiling(uv);return a.xy;',
        '#else',
        'return uv;',
        '#endif',
        '}',
        'float mvMatVarUvRotation(vec2 uv){',
        '#ifdef USE_MATVAR',
        'uv = mvStairShiftUv(uv);vec3 a=mvAntiTiling(uv);return a.z;',
        '#else',
        'return 0.0;',
        '#endif',
        '}'
    ].join('\n');

    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', fragCommonInject);

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        [
            '#ifdef USE_MATVAR',
            '#ifdef USE_MAP',
            'vec2 mvMapUv = mvMatVarUv( vMapUv );',
            '#define vMapUv mvMapUv',
            '#endif',
            '#endif',
            '#include <map_fragment>',
            '#ifdef USE_MATVAR',
            '#ifdef USE_MAP',
            '#undef vMapUv',
            '#endif',
            'matVarAoTex = 1.0;',
            'matVarRoughFactor = roughness;',
            'matVarNormalFactor = 1.0;',
            'mvHasEffect = 0.0;',
            '#ifdef USE_ROUGHNESSMAP',
            'vec4 matVarOrm = texture2D( roughnessMap, mvMatVarUv( vRoughnessMapUv ) );',
            'matVarAoTex = matVarOrm.r;',
            'matVarRoughFactor *= matVarOrm.g;',
            '#endif',
            'float mvSeedOffset = uMatVarConfig0.y;',
            'float mvIntensity = uMatVarConfig0.z;',
            'if (mvIntensity > 0.0) {',
            'float mvSpaceMode = uMatVarConfig0.w;',
            'vec3 mvPos = mix(vMatVarWorldPos, vMatVarObjectPos, step(0.5, mvSpaceMode));',
            'vec3 mvN = normalize(vMatVarWorldNormal);',
            'float mvScale = mix(uMatVarConfig1.x, uMatVarConfig1.y, step(0.5, mvSpaceMode));',
            'float mvHeightMin = uMatVarConfig1.z;',
            'float mvHeightMax = uMatVarConfig1.w;',
            'float mvHeight01 = mvSaturate((mvPos.y - mvHeightMin) / max(0.001, mvHeightMax - mvHeightMin));',
            'vec2 mvP = mvPlanarUV(mvPos, mvN) * mvScale;',
            'vec3 mvColor = diffuseColor.rgb;',
            'float mvRough = matVarRoughFactor;',
            'float mvSeedA = uMatVarGlobal1.z;',
            'float mvSeedB = uMatVarGlobal1.w;',
            'float mvSeedOA = fract(mvSeedA + mvSeedOffset * 0.013);',
            'float mvSeedOB = fract(mvSeedB + mvSeedOffset * 0.017);',
            'float mvCavity = mvSaturate(1.0 - matVarAoTex) * uMatVarGlobal1.x;',
            'float mvMacro0Strength = uMatVarMacro0.x * mvIntensity;',
            'if (mvMacro0Strength > 0.0) {',
            'float n = mvFbm2(mvP * uMatVarMacro0.y + vec2(mvSeedOA * 37.1, mvSeedOB * 19.7));',
            'float m0 = n * 2.0 - 1.0;',
            'float m = sign(m0) * pow(abs(m0), 1.35) * mvMacro0Strength;',
            'mvApplyLayer(mvColor, mvRough, matVarNormalFactor, m, uMatVarMacro0B, uMatVarMacro0.z);',
            '}',
            'float mvMacro1Strength = uMatVarMacro1.x * mvIntensity;',
            'if (mvMacro1Strength > 0.0) {',
            'float n = mvFbm2(mvP * uMatVarMacro1.y + vec2(mvSeedOB * 71.3, mvSeedOA * 43.9));',
            'float m = (n * 2.0 - 1.0) * mvMacro1Strength;',
            'mvApplyLayer(mvColor, mvRough, matVarNormalFactor, m, uMatVarMacro1B, uMatVarMacro1.z);',
            '}',
            'float mvMacro2Strength = uMatVarMacro2.x * mvIntensity;',
            'if (mvMacro2Strength > 0.0) {',
            'float n = mvFbm2(mvP * uMatVarMacro2.y + vec2(mvSeedOA * 11.7, mvSeedOB * 83.2));',
            'float c = uMatVarMacro2.w;',
            'float m = 0.0;',
            'if (c > 1e-6) {',
            'float aa = fwidth(n) * 2.0 + 1e-6;',
            'm = smoothstep(c, c + aa, n) * mvMacro2Strength;',
            '} else {',
            'float m0 = n * 2.0 - 1.0;',
            'm = sign(m0) * pow(abs(m0), 1.15) * mvMacro2Strength;',
            '}',
            'mvApplyLayer(mvColor, mvRough, matVarNormalFactor, m, uMatVarMacro2B, uMatVarMacro2.z);',
            '}',
            'float mvMacro3Strength = uMatVarMacro3.x * mvIntensity;',
            'if (mvMacro3Strength > 0.0) {',
            'float n = mvFbm2(mvP * uMatVarMacro3.y + vec2(mvSeedOB * 21.7, mvSeedOA * 63.2));',
            'float m = (n * 2.0 - 1.0) * mvMacro3Strength;',
            'mvApplyLayer(mvColor, mvRough, matVarNormalFactor, m, uMatVarMacro3B, uMatVarMacro3.z);',
            '}',
            '#ifdef USE_MAP',
            'float brickStrength = uMatVarBrick0.x * mvIntensity;',
            'float mortarStrength = uMatVarBrick0.y * mvIntensity;',
            'if (brickStrength > 0.0 || mortarStrength > 0.0) {',
            'vec2 buv = mvMapUv * vec2(max(0.25, uMatVarBrick0.z), max(0.25, uMatVarBrick0.w));',
            'vec2 cell = floor(buv);',
            'vec2 f = fract(buv);',
            'float mw = clamp(uMatVarBrick1.x, 0.0, 0.49);',
            'vec2 edge = min(f, 1.0 - f);',
            'float aa = fwidth(f.x) * 1.5 + 1e-6;',
            'float mx = 1.0 - smoothstep(mw, mw + aa, edge.x);',
            'float my = 1.0 - smoothstep(mw, mw + aa, edge.y);',
            'float mortarMask = max(mx, my);',
            'float brickMask = 1.0 - mortarMask;',
            'if (brickStrength > 0.0) {',
            'float r = mvHash12(cell + vec2(mvSeedOA * 11.3, mvSeedOB * 19.7));',
            'float brickVar = (r * 2.0 - 1.0) * brickStrength;',
            'mvApplyLayer(mvColor, mvRough, matVarNormalFactor, brickVar * brickMask, uMatVarBrick2, uMatVarBrick1.y);',
            '}',
            'if (mortarStrength > 0.0) {',
            'float m = mortarMask * mortarStrength * (0.6 + 0.4 * mvCavity);',
            'mvApplyLayer(mvColor, mvRough, matVarNormalFactor, m, uMatVarBrick3, uMatVarBrick1.z);',
            '}',
            '}',
            '#endif',
            'float exposureStrength = uMatVarExposure1.x * mvIntensity;',
            'if (exposureStrength > 0.0) {',
            'vec3 ed = normalize(uMatVarExposure0.xyz);',
            'float expo = pow(mvSaturate(dot(mvN, ed)), uMatVarExposure0.w);',
            'float mask = expo * exposureStrength;',
            'if (abs(mask) > 1e-6 && (abs(uMatVarExposure1.y) + abs(uMatVarExposure1.z) + abs(uMatVarExposure1.w)) > 1e-6) mvHasEffect = 1.0;',
            'if (abs(uMatVarExposure1.y) > 1e-6) mvColor *= 1.0 + mask * uMatVarExposure1.y;',
            'if (abs(uMatVarExposure1.z) > 1e-6) mvColor = mvSaturateColor(mvColor, mask * uMatVarExposure1.z);',
            'if (abs(uMatVarExposure1.w) > 1e-6) mvRough += mask * uMatVarExposure1.w;',
            '}',
            'float streakStrength = uMatVarStreaks.x * mvIntensity;',
            'if (streakStrength > 0.0) {',
            'vec3 sd = normalize(uMatVarStreakDir.xyz);',
            'vec3 axis = abs(sd.y) > 0.8 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);',
            'vec3 tx = normalize(cross(axis, sd));',
            'float u = dot(mvPos, tx) * uMatVarStreaks.y;',
            'float v = dot(mvPos, sd) * uMatVarStreaks.y * 1.9;',
            'float uWarp = (mvFbm2(vec2(u * 0.15, v * 0.05) + vec2(mvSeedOA * 41.3, mvSeedOB * 17.1)) * 2.0 - 1.0) * 0.25;',
            'u += uWarp;',
            'float cell = floor(u);',
            'float fu = fract(u);',
            'float r1 = mvHash12(vec2(cell + mvSeedOA * 17.3, mvSeedOB * 19.1));',
            'float r2 = mvHash12(vec2(cell + mvSeedOB * 23.7, mvSeedOA * 29.9));',
            'float center = r1;',
            'float width = mix(0.04, 0.22, r2);',
            'float dist = abs(fu - center);',
            'float aa = fwidth(fu) * 1.5;',
            'float line = 1.0 - smoothstep(width, width + aa, dist);',
            'float flow = mvFbm2(vec2(cell * 0.17 + mvSeedOB * 7.9, v * 0.12 + mvSeedOA * 13.1));',
            'float run = pow(mvSaturate(flow), 1.6);',
            'float streaks = line * run;',
            'float heightW = mvSaturate(mvHeight01 * 1.15);',
            'float ledgeStrength = uMatVarStreaks.z;',
            'float ledgeScale = uMatVarStreaks.w;',
            'float ledge = 0.0;',
            'if (ledgeStrength > 0.0 && ledgeScale > 0.0) {',
            'float f = abs(fract(mvHeight01 * ledgeScale) - 0.5);',
            'ledge = (1.0 - smoothstep(0.0, 0.2, f)) * ledgeStrength;',
            '}',
            'float mvStreakMask = mvSaturate(streaks * heightW * (1.0 + ledge)) * streakStrength;',
            'mvApplyLayer(mvColor, mvRough, matVarNormalFactor, mvStreakMask, uMatVarStreaks2, uMatVarStreakDir.w);',
            '}',
            'float wearTopStrength = uMatVarWearTop.x * mvIntensity;',
            'if (wearTopStrength > 0.0) {',
            'float w = clamp(uMatVarWearTop.z, 0.0, 1.0);',
            'float band = smoothstep(1.0 - w, 1.0, mvHeight01);',
            'float d = mvFbm2(mvP * uMatVarWearTop.y + vec2(mvSeedOB * 7.7, mvSeedOA * 18.3));',
            'float mask = mvSaturate(band * (0.35 + d * 0.65)) * wearTopStrength;',
            'mvApplyLayer(mvColor, mvRough, matVarNormalFactor, mask, uMatVarWearTop2, uMatVarWearTop.w);',
            '}',
            'float wearBottomStrength = uMatVarWearBottom.x * mvIntensity;',
            'if (wearBottomStrength > 0.0) {',
            'float w = clamp(uMatVarWearBottom.z, 0.0, 1.0);',
            'float band = 1.0 - smoothstep(0.0, w, mvHeight01);',
            'float g = mvFbm2(mvP * uMatVarWearBottom.y + vec2(mvSeedOA * 71.2, mvSeedOB * 31.9));',
            'float grime = mvSaturate((0.35 + 0.65 * g) * max(mvCavity, band));',
            'float mask = grime * wearBottomStrength;',
            'mvApplyLayer(mvColor, mvRough, matVarNormalFactor, mask, uMatVarWearBottom2, uMatVarWearBottom.w);',
            '}',
            'float wearSideStrength = uMatVarWearSide.x * mvIntensity;',
            'if (wearSideStrength > 0.0) {',
            'float borderBand = max(smoothstep(0.95, 1.0, mvHeight01), 1.0 - smoothstep(0.0, 0.05, mvHeight01));',
            'float edge = 0.0;',
            '#ifdef USE_MATVAR_CORNERDIST',
            'float w = uMatVarWearSide.z;',
            'if (w > 0.0) {',
            'float aa = fwidth(vMatVarCornerDist) * 1.5 + 1e-6;',
            'edge = 1.0 - smoothstep(w, w + aa, vMatVarCornerDist);',
            '}',
            '#else',
            'float curv = length(fwidth(mvN)) * 30.0;',
            'edge = mvSaturate(curv * uMatVarWearSide.z);',
            '#endif',
            'edge *= (1.0 - borderBand);',
            'float warp = mvFbm2(mvP * uMatVarWearSide.y + vec2(mvSeedOB * 12.7, mvSeedOA * 9.1));',
            'float mask = mvSaturate(edge * (0.35 + 0.65 * warp) * (0.55 + 0.45 * mvCavity)) * wearSideStrength;',
            'mvApplyLayer(mvColor, mvRough, matVarNormalFactor, mask, uMatVarWearSide2, uMatVarWearSide.w);',
            '}',
            'float crackStrength = uMatVarCracks.x * mvIntensity;',
            'if (crackStrength > 0.0) {',
            'float c = mvFbmRidged(mvP * uMatVarCracks.y + vec2(mvSeedOB * 53.9, mvSeedOA * 44.1));',
            'float crack = smoothstep(0.62, 0.95, c) * crackStrength;',
            'mvApplyLayer(mvColor, mvRough, matVarNormalFactor, crack, uMatVarCracks2, uMatVarCracks.z);',
            '}',
            'if (mvHasEffect > 0.5) {',
            'mvRough = clamp(mvRough, 0.03, 1.0);',
            'matVarNormalFactor = clamp(matVarNormalFactor, 0.0, 2.0);',
            'diffuseColor.rgb = clamp(mvColor, 0.0, 2.0);',
            'matVarRoughFactor = mvRough;',
            '}',
            '}',
            '#endif'
        ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        [
            '#ifdef USE_MATVAR',
            '#ifdef USE_NORMALMAP',
            '#ifdef OBJECTSPACE_NORMALMAP',
            'vec2 mvNormUv = mvMatVarUv( vNormalMapUv );',
            'vec3 normalTex = texture2D( normalMap, mvNormUv ).xyz * 2.0 - 1.0;',
            '#ifdef FLIP_SIDED',
            'normalTex = -normalTex;',
            '#endif',
            '#ifdef DOUBLE_SIDED',
            'normalTex = normalTex * faceDirection;',
            '#endif',
            'normal = normalize( normalMatrix * normalTex );',
            '#else',
            'vec2 mvNormUv = mvMatVarUv( vNormalMapUv );',
            'vec3 normalTex = texture2D( normalMap, mvNormUv ).xyz * 2.0 - 1.0;',
            'normalTex.xy *= normalScale * matVarNormalFactor;',
            'normal = mvPerturbNormal2Arb( -vViewPosition, normal, normalTex, faceDirection, mvNormUv );',
            '#endif',
            '#endif',
            '#ifdef USE_BUMPMAP',
            'normal = perturbNormalArb( -vViewPosition, normal, dHdxy_fwd() );',
            '#endif',
            '#else',
            '#include <normal_fragment_maps>',
            '#endif'
        ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        /(texture2D|texture)\s*\(\s*map\s*,\s*vMapUv\s*\)/g,
        '$1( map, mvMatVarUv( vMapUv ) )'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
        /(texture2D|texture)\s*\(\s*normalMap\s*,\s*vNormalMapUv\s*\)/g,
        '$1( normalMap, mvMatVarUv( vNormalMapUv ) )'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
        /(texture2D|texture)\s*\(\s*aoMap\s*,\s*vAoMapUv\s*\)/g,
        '$1( aoMap, mvMatVarUv( vAoMapUv ) )'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
        /(texture2D|texture)\s*\(\s*metalnessMap\s*,\s*vMetalnessMapUv\s*\)/g,
        '$1( metalnessMap, mvMatVarUv( vMetalnessMapUv ) )'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
        /(texture2D|texture)\s*\(\s*roughnessMap\s*,\s*vRoughnessMapUv\s*\)/g,
        '$1( roughnessMap, mvMatVarUv( vRoughnessMapUv ) )'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
        /(texture2D|texture)\s*\(\s*emissiveMap\s*,\s*vEmissiveMapUv\s*\)/g,
        '$1( emissiveMap, mvMatVarUv( vEmissiveMapUv ) )'
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        [
            'vec4 diffuseColor = vec4( diffuse, opacity );',
            '#ifdef USE_MATVAR',
            'float matVarAoTex = 1.0;',
            'float matVarRoughFactor = roughness;',
            'float matVarNormalFactor = 1.0;',
            '#endif'
        ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        [
            'float roughnessFactor = roughness;',
            '#ifdef USE_MATVAR',
            'roughnessFactor = matVarRoughFactor;',
            '#else',
            '#ifdef USE_ROUGHNESSMAP',
            'vec4 matVarOrm = texture2D( roughnessMap, vRoughnessMapUv );',
            'roughnessFactor *= matVarOrm.g;',
            '#endif',
            '#endif',
        ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>'
    );

}

function ensureMatVarConfigOnMaterial(material, config) {
    const mat = material;
    mat.userData = mat.userData ?? {};
    mat.userData.materialVariationConfig = config;

    mat.defines = mat.defines ?? {};
    mat.defines.USE_MATVAR = 1;
    if (config?.cornerDist) mat.defines.USE_MATVAR_CORNERDIST = 1;
    else delete mat.defines.USE_MATVAR_CORNERDIST;

    const prevCacheKey = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => {
        const prev = prevCacheKey ? prevCacheKey() : '';
        return `${prev}|matvar:${MATVAR_SHADER_VERSION}`;
    };

    const prevOnBeforeCompile = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile.bind(mat) : null;
    mat.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);
        injectMatVarShader(mat, shader);
        mat.userData.materialVariationConfig.shaderUniforms = shader.uniforms;
    };
}

export function applyMaterialVariationToMeshStandardMaterial(
    material,
    {
        seed = 0,
        seedOffset = 0,
        heightMin = 0,
        heightMax = 1,
        config = null,
        root = MATERIAL_VARIATION_ROOT.WALL,
        cornerDist = false
    } = {}
) {
    if (!material?.isMeshStandardMaterial) return material;

    const normalized = normalizeMaterialVariationConfig(config, { root });
    const uniforms = buildUniformBundle({ seed, seedOffset, heightMin, heightMax, config: normalized });
    const cfg = { normalized, uniforms, shaderUniforms: null, cornerDist: !!cornerDist };

    ensureMatVarConfigOnMaterial(material, cfg);
    material.needsUpdate = true;
    return material;
}

export function updateMaterialVariationOnMeshStandardMaterial(material, { seed, seedOffset, heightMin, heightMax, config = null, root = MATERIAL_VARIATION_ROOT.WALL, cornerDist = undefined } = {}) {
    if (!material?.isMeshStandardMaterial) return;
    const normalized = normalizeMaterialVariationConfig(config, { root });
    const uniforms = buildUniformBundle({ seed, seedOffset, heightMin, heightMax, config: normalized });

    const cfg = material.userData?.materialVariationConfig ?? null;
    if (!cfg || !cfg.uniforms?.macro0 || !cfg.uniforms?.wearTop || !cfg.uniforms?.macro3) {
        const nextCornerDist = cornerDist === undefined ? !!cfg?.cornerDist : !!cornerDist;
        applyMaterialVariationToMeshStandardMaterial(material, { seed, seedOffset, heightMin, heightMax, config: normalized, root, cornerDist: nextCornerDist });
        return;
    }

    cfg.normalized = normalized;
    const nextCornerDist = cornerDist === undefined ? !!cfg.cornerDist : !!cornerDist;
    if (!!cfg.cornerDist !== nextCornerDist) {
        cfg.cornerDist = nextCornerDist;
        material.defines = material.defines ?? {};
        if (nextCornerDist) material.defines.USE_MATVAR_CORNERDIST = 1;
        else delete material.defines.USE_MATVAR_CORNERDIST;
        material.needsUpdate = true;
    }
    cfg.uniforms.config0.copy(uniforms.config0);
    cfg.uniforms.config1.copy(uniforms.config1);
    cfg.uniforms.global1.copy(uniforms.global1);
    cfg.uniforms.macro0.copy(uniforms.macro0);
    cfg.uniforms.macro0b.copy(uniforms.macro0b);
    cfg.uniforms.macro1.copy(uniforms.macro1);
    cfg.uniforms.macro1b.copy(uniforms.macro1b);
    cfg.uniforms.macro2.copy(uniforms.macro2);
    cfg.uniforms.macro2b.copy(uniforms.macro2b);
    cfg.uniforms.macro3.copy(uniforms.macro3);
    cfg.uniforms.macro3b.copy(uniforms.macro3b);
    cfg.uniforms.streaks.copy(uniforms.streaks);
    cfg.uniforms.streakDir.copy(uniforms.streakDir);
    cfg.uniforms.streaks2.copy(uniforms.streaks2);
    cfg.uniforms.exposure0.copy(uniforms.exposure0);
    cfg.uniforms.exposure1.copy(uniforms.exposure1);
    cfg.uniforms.brick0.copy(uniforms.brick0);
    cfg.uniforms.brick1.copy(uniforms.brick1);
    cfg.uniforms.brick2.copy(uniforms.brick2);
    cfg.uniforms.brick3.copy(uniforms.brick3);
    cfg.uniforms.wearTop.copy(uniforms.wearTop);
    cfg.uniforms.wearTop2.copy(uniforms.wearTop2);
    cfg.uniforms.wearBottom.copy(uniforms.wearBottom);
    cfg.uniforms.wearBottom2.copy(uniforms.wearBottom2);
    cfg.uniforms.wearSide.copy(uniforms.wearSide);
    cfg.uniforms.wearSide2.copy(uniforms.wearSide2);
    cfg.uniforms.cracks.copy(uniforms.cracks);
    cfg.uniforms.cracks2.copy(uniforms.cracks2);
    cfg.uniforms.anti.copy(uniforms.anti);
    cfg.uniforms.anti2.copy(uniforms.anti2);
    if (cfg.uniforms.stair?.copy) cfg.uniforms.stair.copy(uniforms.stair);
    else cfg.uniforms.stair = uniforms.stair;
    if (cfg.uniforms.stair2?.copy) cfg.uniforms.stair2.copy(uniforms.stair2);
    else cfg.uniforms.stair2 = uniforms.stair2;

    const shaderUniforms = cfg.shaderUniforms;
    if (shaderUniforms?.uMatVarConfig0?.value) shaderUniforms.uMatVarConfig0.value = cfg.uniforms.config0;
    if (shaderUniforms?.uMatVarConfig1?.value) shaderUniforms.uMatVarConfig1.value = cfg.uniforms.config1;
    if (shaderUniforms?.uMatVarGlobal1?.value) shaderUniforms.uMatVarGlobal1.value = cfg.uniforms.global1;
    if (shaderUniforms?.uMatVarMacro0?.value) shaderUniforms.uMatVarMacro0.value = cfg.uniforms.macro0;
    if (shaderUniforms?.uMatVarMacro0B?.value) shaderUniforms.uMatVarMacro0B.value = cfg.uniforms.macro0b;
    if (shaderUniforms?.uMatVarMacro1?.value) shaderUniforms.uMatVarMacro1.value = cfg.uniforms.macro1;
    if (shaderUniforms?.uMatVarMacro1B?.value) shaderUniforms.uMatVarMacro1B.value = cfg.uniforms.macro1b;
    if (shaderUniforms?.uMatVarMacro2?.value) shaderUniforms.uMatVarMacro2.value = cfg.uniforms.macro2;
    if (shaderUniforms?.uMatVarMacro2B?.value) shaderUniforms.uMatVarMacro2B.value = cfg.uniforms.macro2b;
    if (shaderUniforms?.uMatVarMacro3?.value) shaderUniforms.uMatVarMacro3.value = cfg.uniforms.macro3;
    if (shaderUniforms?.uMatVarMacro3B?.value) shaderUniforms.uMatVarMacro3B.value = cfg.uniforms.macro3b;
    if (shaderUniforms?.uMatVarStreaks?.value) shaderUniforms.uMatVarStreaks.value = cfg.uniforms.streaks;
    if (shaderUniforms?.uMatVarStreakDir?.value) shaderUniforms.uMatVarStreakDir.value = cfg.uniforms.streakDir;
    if (shaderUniforms?.uMatVarStreaks2?.value) shaderUniforms.uMatVarStreaks2.value = cfg.uniforms.streaks2;
    if (shaderUniforms?.uMatVarExposure0?.value) shaderUniforms.uMatVarExposure0.value = cfg.uniforms.exposure0;
    if (shaderUniforms?.uMatVarExposure1?.value) shaderUniforms.uMatVarExposure1.value = cfg.uniforms.exposure1;
    if (shaderUniforms?.uMatVarBrick0?.value) shaderUniforms.uMatVarBrick0.value = cfg.uniforms.brick0;
    if (shaderUniforms?.uMatVarBrick1?.value) shaderUniforms.uMatVarBrick1.value = cfg.uniforms.brick1;
    if (shaderUniforms?.uMatVarBrick2?.value) shaderUniforms.uMatVarBrick2.value = cfg.uniforms.brick2;
    if (shaderUniforms?.uMatVarBrick3?.value) shaderUniforms.uMatVarBrick3.value = cfg.uniforms.brick3;
    if (shaderUniforms?.uMatVarWearTop?.value) shaderUniforms.uMatVarWearTop.value = cfg.uniforms.wearTop;
    if (shaderUniforms?.uMatVarWearTop2?.value) shaderUniforms.uMatVarWearTop2.value = cfg.uniforms.wearTop2;
    if (shaderUniforms?.uMatVarWearBottom?.value) shaderUniforms.uMatVarWearBottom.value = cfg.uniforms.wearBottom;
    if (shaderUniforms?.uMatVarWearBottom2?.value) shaderUniforms.uMatVarWearBottom2.value = cfg.uniforms.wearBottom2;
    if (shaderUniforms?.uMatVarWearSide?.value) shaderUniforms.uMatVarWearSide.value = cfg.uniforms.wearSide;
    if (shaderUniforms?.uMatVarWearSide2?.value) shaderUniforms.uMatVarWearSide2.value = cfg.uniforms.wearSide2;
    if (shaderUniforms?.uMatVarCracks?.value) shaderUniforms.uMatVarCracks.value = cfg.uniforms.cracks;
    if (shaderUniforms?.uMatVarCracks2?.value) shaderUniforms.uMatVarCracks2.value = cfg.uniforms.cracks2;
    if (shaderUniforms?.uMatVarAnti?.value) shaderUniforms.uMatVarAnti.value = cfg.uniforms.anti;
    if (shaderUniforms?.uMatVarAnti2?.value) shaderUniforms.uMatVarAnti2.value = cfg.uniforms.anti2;
    if (shaderUniforms?.uMatVarStair?.value) shaderUniforms.uMatVarStair.value = cfg.uniforms.stair;
    if (shaderUniforms?.uMatVarStair2?.value) shaderUniforms.uMatVarStair2.value = cfg.uniforms.stair2;

}
