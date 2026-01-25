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

function ensureAsphaltBase(material, { baseColorHex, baseRoughness }) {
    material.userData = material.userData ?? {};
    if (!material.userData.asphaltRoadBase) {
        material.userData.asphaltRoadBase = {
            colorHex: (Number(baseColorHex) >>> 0) & 0xffffff,
            roughness: clamp(baseRoughness, 0.0, 1.0)
        };
    }
    return material.userData.asphaltRoadBase;
}

function buildRoadCoarseMaterialVariationConfig({ coarse, basePreset }) {
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

    if (preset.cracks && typeof preset.cracks === 'object') {
        preset.cracks = {
            ...preset.cracks,
            enabled: aoScale > 0.01,
            intensity: (Number(preset.cracks.intensity) || 0) * clamp(aoScale, 0, 1)
        };
        preset.cracks.value = clamp((Number(preset.cracks.value) || 0) * vScale, -0.5, 0.5);
        preset.cracks.roughness = clamp((Number(preset.cracks.roughness) || 0) * rScale, -0.5, 0.5);
        preset.cracks.normal = 0.0;
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

    applyFineTextures(material, settings.fine, { baseColorHex: base.colorHex, baseRoughness: base.roughness, seed });

    const coarse = settings.coarse;
    const coarseAlbedo = coarse?.albedo !== false;
    const coarseRoughness = coarse?.roughness !== false;

    const hasMatVar = !!material.userData?.materialVariationConfig;
    if (coarseAlbedo || coarseRoughness || hasMatVar) {
        const config = buildRoadCoarseMaterialVariationConfig({
            coarse,
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
                contribColor: coarseAlbedo,
                contribRoughness: coarseRoughness,
                useOrm: true
            }
        });
    }

    return material;
}
