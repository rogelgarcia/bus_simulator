// src/graphics/visuals/city/AsphaltRoadVisuals.js
// Applies asphalt coarse (material variation) + fine (procedural textures) visuals to road materials.
// @ts-check
import { getAsphaltFineTextures } from '../../assets3d/textures/AsphaltFineTextures.js';
import {
    getDefaultMaterialVariationPreset,
    MATERIAL_VARIATION_ROOT,
    updateMaterialVariationOnMeshStandardMaterial
} from '../../assets3d/materials/MaterialVariationSystem.js';
import { sanitizeAsphaltNoiseSettings } from './AsphaltNoiseSettings.js';

const DEFAULT_ASPHALT_COLOR = 0x2b2b2b;
const DEFAULT_ASPHALT_ROUGHNESS = 0.95;

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function hashSeedToU32(seed) {
    const str = String(seed ?? '');
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i) & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

function clamp01(value) {
    return clamp(value, 0, 1);
}

function hexToRgb01(hex) {
    const safe = (Number(hex) >>> 0) & 0xffffff;
    return {
        r: ((safe >> 16) & 0xff) / 255,
        g: ((safe >> 8) & 0xff) / 255,
        b: (safe & 0xff) / 255
    };
}

function rgb01ToHex({ r, g, b }) {
    const rr = Math.round(clamp01(r) * 255) & 0xff;
    const gg = Math.round(clamp01(g) * 255) & 0xff;
    const bb = Math.round(clamp01(b) * 255) & 0xff;
    return (rr << 16) | (gg << 8) | bb;
}

function applyAsphaltColorControlsToHex(baseColorHex, color) {
    const c = color && typeof color === 'object' ? color : {};
    const value = clamp(c.value ?? c.brightness ?? 0, -0.35, 0.35);
    const warmCool = clamp(c.warmCool ?? c.tint ?? 0, -0.25, 0.25);
    const saturation = clamp(c.saturation ?? 0, -0.5, 0.5);

    let { r, g, b } = hexToRgb01(baseColorHex);

    const t = Math.abs(warmCool);
    if (t > 1e-6) {
        const warm = { r: 1.08, g: 1.02, b: 0.92 };
        const cool = { r: 0.92, g: 0.98, b: 1.08 };
        const m = warmCool >= 0 ? warm : cool;
        r *= 1 + (m.r - 1) * t;
        g *= 1 + (m.g - 1) * t;
        b *= 1 + (m.b - 1) * t;
    }

    const sat = 1 + saturation;
    if (Math.abs(sat - 1) > 1e-6) {
        const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
        r = l + (r - l) * sat;
        g = l + (g - l) * sat;
        b = l + (b - l) * sat;
    }

    const mul = 1 + value;
    if (Math.abs(mul - 1) > 1e-6) {
        r *= mul;
        g *= mul;
        b *= mul;
    }

    return rgb01ToHex({ r, g, b });
}

function ensureAsphaltBase(material, { baseColorHex, baseRoughness }) {
    material.userData = material.userData ?? {};
    const base = material.userData.asphaltRoadBase ?? {};
    base.colorHex = (Number(baseColorHex) >>> 0) & 0xffffff;
    base.roughness = clamp(baseRoughness, 0.0, 1.0);
    material.userData.asphaltRoadBase = base;
    return material.userData.asphaltRoadBase;
}

function buildRoadCoarseMaterialVariationConfig({ coarse, livedIn, basePreset }) {
    const preset = basePreset && typeof basePreset === 'object'
        ? JSON.parse(JSON.stringify(basePreset))
        : getDefaultMaterialVariationPreset(MATERIAL_VARIATION_ROOT.SURFACE);

    const defaultValue = 0.06;
    const defaultRough = 0.18;
    const defaultAo = 0.45;

    const valueAmount = clamp(coarse?.colorStrength, 0.0, 0.5) * 0.35;
    const roughnessAmount = clamp(coarse?.roughnessStrength, 0.0, 0.5) * 0.65;
    const aoAmount = clamp(coarse?.dirtyStrength, 0.0, 1.0) * 2.5;

    preset.enabled = true;
    preset.root = MATERIAL_VARIATION_ROOT.SURFACE;
    preset.worldSpaceScale = clamp(coarse?.scale, 0.001, 10.0);
    preset.globalIntensity = 1.0;
    preset.valueAmount = valueAmount;
    preset.tintAmount = valueAmount * 0.6;
    preset.saturationAmount = valueAmount * 0.35;
    preset.roughnessAmount = roughnessAmount;
    preset.aoAmount = clamp(aoAmount, 0.0, 1.0);

    preset.streaks = { ...(preset.streaks ?? {}), enabled: false, strength: 0.0 };
    preset.exposure = { ...(preset.exposure ?? {}), enabled: false, strength: 0.0 };
    preset.wearTop = { ...(preset.wearTop ?? {}), enabled: false, intensity: 0.0 };
    preset.wearBottom = { ...(preset.wearBottom ?? {}), enabled: false, intensity: 0.0 };
    preset.wearSide = { ...(preset.wearSide ?? {}), enabled: false, intensity: 0.0 };

    const vScale = defaultValue > 1e-6 ? (valueAmount / defaultValue) : 0;
    const rScale = defaultRough > 1e-6 ? (roughnessAmount / defaultRough) : 0;
    const aoScale = defaultAo > 1e-6 ? (preset.aoAmount / defaultAo) : 0;

    if (Array.isArray(preset.macroLayers)) {
        preset.macroLayers = preset.macroLayers.map((layer) => {
            const l = layer && typeof layer === 'object' ? { ...layer } : {};
            if (!l.enabled) return l;
            l.value = clamp((Number(l.value) || 0) * vScale, -0.5, 0.5);
            l.saturation = clamp((Number(l.saturation) || 0) * vScale, -0.5, 0.5);
            l.roughness = clamp((Number(l.roughness) || 0) * rScale, -0.5, 0.5);
            l.normal = 0.0;
            return l;
        });
    }

    const lived = livedIn && typeof livedIn === 'object' ? livedIn : {};

    if (Array.isArray(preset.macroLayers) && preset.macroLayers.length >= 4) {
        const patches = lived.patches && typeof lived.patches === 'object' ? lived.patches : null;
        const patchesEnabled = patches?.enabled !== false;
        const patchesStrength = clamp(patches?.strength, 0.0, 4.0);
        const patchesScale = clamp(patches?.scale, 0.001, 50.0);
        const patchesCoverage = clamp(patches?.coverage, 0.0, 1.0);
        if (patchesEnabled && patchesStrength > 1e-6) {
            const layer = preset.macroLayers[2] && typeof preset.macroLayers[2] === 'object' ? { ...preset.macroLayers[2] } : {};
            layer.enabled = true;
            layer.intensity = patchesStrength;
            layer.scale = patchesScale;
            layer.coverage = patchesCoverage;
            layer.value = -0.14;
            layer.saturation = -0.04;
            layer.roughness = -0.28;
            layer.normal = -0.25;
            preset.macroLayers[2] = layer;
        } else if (preset.macroLayers[2] && typeof preset.macroLayers[2] === 'object') {
            preset.macroLayers[2] = { ...preset.macroLayers[2], enabled: false, intensity: 0.0 };
        }

        const tireWear = lived.tireWear && typeof lived.tireWear === 'object' ? lived.tireWear : null;
        const tireWearEnabled = tireWear?.enabled !== false;
        const tireWearStrength = clamp(tireWear?.strength, 0.0, 4.0);
        const tireWearScale = clamp(tireWear?.scale, 0.001, 50.0);
        if (tireWearEnabled && tireWearStrength > 1e-6) {
            const layer = preset.macroLayers[3] && typeof preset.macroLayers[3] === 'object' ? { ...preset.macroLayers[3] } : {};
            layer.enabled = true;
            layer.intensity = tireWearStrength;
            layer.scale = tireWearScale;
            layer.value = -0.05;
            layer.saturation = -0.02;
            layer.roughness = -0.42;
            layer.normal = -0.5;
            preset.macroLayers[3] = layer;
        } else if (preset.macroLayers[3] && typeof preset.macroLayers[3] === 'object') {
            preset.macroLayers[3] = { ...preset.macroLayers[3], enabled: false, intensity: 0.0 };
        }
    }

    const cracks = lived.cracks && typeof lived.cracks === 'object' ? lived.cracks : null;
    const cracksEnabled = cracks?.enabled !== false;
    const cracksStrength = clamp(cracks?.strength, 0.0, 4.0);
    const cracksScale = clamp(cracks?.scale, 0.01, 80.0);
    if (preset.cracks && typeof preset.cracks === 'object') {
        if (cracksEnabled && cracksStrength > 1e-6) {
            preset.cracks = {
                ...preset.cracks,
                enabled: true,
                strength: cracksStrength,
                scale: cracksScale,
                value: -0.24,
                saturation: -0.08,
                roughness: 0.38,
                normal: 1.25
            };
        } else {
            preset.cracks = { ...preset.cracks, enabled: false, strength: 0.0 };
        }
    }

    return preset;
}

function applyFineTextures(material, fine, { baseColorHex, baseRoughness, seed }) {
    const wantsAlbedo = fine?.albedo !== false;
    const wantsRoughness = fine?.roughness !== false;
    const wantsNormal = fine?.normal !== false;

    if (!wantsAlbedo && !wantsRoughness && !wantsNormal) {
        if (material.map) material.map = null;
        if (material.roughnessMap) material.roughnessMap = null;
        if (material.normalMap) material.normalMap = null;
        if (material.userData?.asphaltFineTextures) material.userData.asphaltFineTextures = null;
        material.color.setHex(baseColorHex);
        material.roughness = clamp(baseRoughness, 0.0, 1.0);
        material.needsUpdate = true;
        return;
    }

    const textures = getAsphaltFineTextures({
        seed,
        size: 512,
        baseColorHex,
        baseRoughness,
        colorStrength: wantsAlbedo ? fine?.colorStrength : 0,
        dirtyStrength: fine?.dirtyStrength,
        roughnessStrength: wantsRoughness ? fine?.roughnessStrength : 0
    });
    material.userData = material.userData ?? {};
    material.userData.asphaltFineTextures = textures;

    if (wantsAlbedo) {
        material.map = textures.map;
        material.color.setHex(0xffffff);
        const s = clamp(fine?.scale, 0.1, 15.0);
        material.map.repeat.set(s, s);
    } else if (material.map) {
        material.map = null;
        material.color.setHex(baseColorHex);
    }

    if (wantsRoughness) {
        material.roughnessMap = textures.roughnessMap;
        material.roughness = 1.0;
        const s = clamp(fine?.scale, 0.1, 15.0);
        material.roughnessMap.repeat.set(s, s);
    } else if (material.roughnessMap) {
        material.roughnessMap = null;
        material.roughness = clamp(baseRoughness, 0.0, 1.0);
    }

    if (wantsNormal) {
        material.normalMap = textures.normalMap;
        material.extensions = material.extensions ?? {};
        material.extensions.derivatives = true;
        const s = clamp(fine?.scale, 0.1, 15.0);
        material.normalMap.repeat.set(s, s);
        const ns = clamp(fine?.normalStrength, 0.0, 2.0);
        material.normalScale.set(ns, ns);
    } else if (material.normalMap) {
        material.normalMap = null;
        material.normalScale.set(1.0, 1.0);
    }

    material.needsUpdate = true;
}

/**
 * Applies asphalt visuals to a road MeshStandardMaterial using current settings.
 * Coarse uses MaterialVariationSystem; Fine uses runtime-generated textures.
 * @param {import('three').MeshStandardMaterial} material
 * @param {Object} options
 * @param {unknown} options.asphaltNoise
 * @param {string|number} options.seed
 * @param {number} [options.baseColorHex]
 * @param {number} [options.baseRoughness]
 * @returns {import('three').MeshStandardMaterial}
 */
export function applyAsphaltRoadVisualsToMeshStandardMaterial(
    material,
    {
        asphaltNoise,
        seed,
        baseColorHex = DEFAULT_ASPHALT_COLOR,
        baseRoughness = DEFAULT_ASPHALT_ROUGHNESS
    } = {}
) {
    if (!material?.isMeshStandardMaterial) return material;

    const settings = sanitizeAsphaltNoiseSettings(asphaltNoise);
    const base = ensureAsphaltBase(material, { baseColorHex, baseRoughness });

    const colorHex = applyAsphaltColorControlsToHex(base.colorHex, settings.color);
    applyFineTextures(material, settings.fine, { baseColorHex: colorHex, baseRoughness: base.roughness, seed });

    const coarse = settings.coarse;
    const coarseAlbedo = coarse?.albedo !== false;
    const coarseRoughness = coarse?.roughness !== false;

    const lived = settings.livedIn ?? null;
    const cracksActive = !!lived?.cracks?.enabled && lived.cracks.strength > 1e-6;
    const patchesActive = !!lived?.patches?.enabled && lived.patches.strength > 1e-6;
    const tireWearActive = !!lived?.tireWear?.enabled && lived.tireWear.strength > 1e-6;
    const livedInActive = cracksActive || patchesActive || tireWearActive;
    const livedInColorActive = cracksActive || patchesActive;
    const livedInRoughnessActive = livedInActive;

    const coarseForConfig = {
        ...coarse,
        colorStrength: coarseAlbedo ? coarse?.colorStrength : 0.0,
        dirtyStrength: coarseAlbedo ? coarse?.dirtyStrength : 0.0,
        roughnessStrength: coarseRoughness ? coarse?.roughnessStrength : 0.0
    };

    const hasMatVar = !!material.userData?.materialVariationConfig;
    if (coarseAlbedo || coarseRoughness || livedInActive || hasMatVar) {
        const config = buildRoadCoarseMaterialVariationConfig({
            coarse: coarseForConfig,
            livedIn: lived,
            basePreset: getDefaultMaterialVariationPreset(MATERIAL_VARIATION_ROOT.SURFACE)
        });
        updateMaterialVariationOnMeshStandardMaterial(material, {
            seed: hashSeedToU32(seed),
            seedOffset: 0,
            heightMin: -10,
            heightMax: 10,
            config,
            root: MATERIAL_VARIATION_ROOT.SURFACE,
            debug: {
                contribColor: coarseAlbedo || livedInColorActive,
                contribRoughness: coarseRoughness || livedInRoughnessActive,
                useOrm: true
            }
        });
    }

    return material;
}
