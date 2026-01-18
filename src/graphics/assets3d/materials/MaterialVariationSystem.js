// src/graphics/assets3d/materials/MaterialVariationSystem.js
// Applies deterministic, composable procedural material variation to MeshStandardMaterial via shader injection.
import * as THREE from 'three';

const MATVAR_SHADER_VERSION = 3;

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
            macro: { enabled: true, intensity: 1.0, scale: 0.22 },
            roughnessVariation: { enabled: true, intensity: 1.0, microScale: 2.4, macroScale: 0.7 },
            streaks: { enabled: false, strength: 0.0, scale: 0.55, direction: { x: 0, y: -1, z: 0 }, ledgeStrength: 0.0, ledgeScale: 0.0 },
            edgeWear: { enabled: false, strength: 0.0, width: 0.08, noiseWarp: 1.4 },
            grime: { enabled: true, strength: 0.16, scale: 0.85 },
            dust: { enabled: true, strength: 0.12, scale: 0.7, heightBand: { min: 0.55, max: 1.0 } },
            wetness: { enabled: false, strength: 0.0, scale: 1.0, heightBand: { min: 0.0, max: 1.0 } },
            sunBleach: { enabled: true, strength: 0.1, exponent: 1.6, direction: { x: 0.4, y: 0.85, z: 0.2 } },
            moss: { enabled: false, strength: 0.0, scale: 0.9, heightBand: { min: 0.0, max: 0.6 }, tint: { r: 0.22, g: 0.42, b: 0.2 } },
            soot: { enabled: false, strength: 0.0, scale: 0.8, heightBand: { min: 0.0, max: 0.25 } },
            efflorescence: { enabled: false, strength: 0.0, scale: 0.8 },
            antiTiling: { enabled: true, strength: 0.5, mode: 'fast', cellSize: 2.0, blendWidth: 0.2, offsetU: 0.22, offsetV: 0.22, rotationDegrees: 0.0 },
            detail: { enabled: true, strength: 0.08, scale: 3.2 },
            cracks: { enabled: false, strength: 0.25, scale: 2.8 }
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
        macro: { enabled: true, intensity: 1.0, scale: 0.2 },
        roughnessVariation: { enabled: true, intensity: 1.0, microScale: 2.0, macroScale: 0.55 },
        streaks: { enabled: true, strength: 0.35, scale: 0.55, direction: { x: 0, y: -1, z: 0 }, ledgeStrength: 0.0, ledgeScale: 0.0 },
        edgeWear: { enabled: true, strength: 0.28, width: 0.08, noiseWarp: 1.7 },
        grime: { enabled: true, strength: 0.2, scale: 0.9 },
        dust: { enabled: true, strength: 0.14, scale: 0.65, heightBand: { min: 0.58, max: 1.0 } },
        wetness: { enabled: false, strength: 0.0, scale: 1.0, heightBand: { min: 0.0, max: 1.0 } },
        sunBleach: { enabled: true, strength: 0.12, exponent: 1.8, direction: { x: 0.45, y: 0.8, z: 0.25 } },
        moss: { enabled: false, strength: 0.0, scale: 0.9, heightBand: { min: 0.0, max: 0.55 }, tint: { r: 0.22, g: 0.42, b: 0.2 } },
        soot: { enabled: true, strength: 0.18, scale: 0.7, heightBand: { min: 0.0, max: 0.28 } },
        efflorescence: { enabled: false, strength: 0.0, scale: 0.9 },
        antiTiling: { enabled: true, strength: 0.65, mode: 'fast', cellSize: 2.0, blendWidth: 0.2, offsetU: 0.0, offsetV: 0.28, rotationDegrees: 0.0 },
        detail: { enabled: true, strength: 0.1, scale: 3.0 },
        cracks: { enabled: false, strength: 0.25, scale: 3.2 }
    };
}

export function normalizeMaterialVariationConfig(input, { root = MATERIAL_VARIATION_ROOT.WALL } = {}) {
    const preset = getDefaultMaterialVariationPreset(root);
    const cfg = (input && typeof input === 'object') ? input : {};

    const macro = cfg.macro ?? {};
    const roughnessVariation = cfg.roughnessVariation ?? {};
    const streaks = cfg.streaks ?? {};
    const edgeWear = cfg.edgeWear ?? {};
    const grime = cfg.grime ?? {};
    const dust = cfg.dust ?? {};
    const wetness = cfg.wetness ?? {};
    const sunBleach = cfg.sunBleach ?? {};
    const moss = cfg.moss ?? {};
    const soot = cfg.soot ?? {};
    const efflorescence = cfg.efflorescence ?? {};
    const antiTiling = cfg.antiTiling ?? {};
    const detail = cfg.detail ?? {};
    const cracks = cfg.cracks ?? {};

    const antiMode = antiTiling.mode === 'quality' ? 'quality' : 'fast';
    const presetAnti = preset.antiTiling ?? {};
    const antiRotationDegrees = antiTiling.rotationDegrees ?? antiTiling.rotation ?? antiTiling.rotationAmount ?? presetAnti.rotationDegrees ?? 0.0;
    const antiCellSize = antiTiling.cellSize ?? antiTiling.macroCellSize ?? presetAnti.cellSize ?? 1.0;
    const antiBlendWidth = antiTiling.blendWidth ?? antiTiling.transitionSoftness ?? antiTiling.edgeFade ?? presetAnti.blendWidth ?? presetAnti.edgeFade ?? 0.18;
    const antiOffsetU = antiTiling.offsetU ?? antiTiling.offsetAmountU ?? antiTiling.jitterU ?? presetAnti.offsetU ?? 0.0;
    const antiOffsetV = antiTiling.offsetV ?? antiTiling.offsetAmountV ?? antiTiling.jitterV ?? antiTiling.tileJitter ?? presetAnti.offsetV ?? presetAnti.tileJitter ?? 0.0;

    return {
        enabled: cfg.enabled === undefined ? !!preset.enabled : !!cfg.enabled,
        root: normalizeRoot(cfg.root ?? preset.root),
        space: normalizeSpace(cfg.space ?? preset.space),
        worldSpaceScale: clamp(cfg.worldSpaceScale ?? preset.worldSpaceScale, 0.001, 20.0),
        objectSpaceScale: clamp(cfg.objectSpaceScale ?? preset.objectSpaceScale, 0.001, 20.0),
        globalIntensity: clamp(cfg.globalIntensity ?? preset.globalIntensity, 0.0, 2.0),
        tintAmount: clamp(cfg.tintAmount ?? preset.tintAmount, 0.0, 0.35),
        valueAmount: clamp(cfg.valueAmount ?? preset.valueAmount, 0.0, 0.35),
        saturationAmount: clamp(cfg.saturationAmount ?? preset.saturationAmount, 0.0, 0.35),
        roughnessAmount: clamp(cfg.roughnessAmount ?? preset.roughnessAmount, 0.0, 0.75),
        normalAmount: clamp(cfg.normalAmount ?? preset.normalAmount, 0.0, 1.25),
        aoAmount: clamp(cfg.aoAmount ?? preset.aoAmount, 0.0, 1.0),
        macro: {
            enabled: macro.enabled === undefined ? !!preset.macro.enabled : !!macro.enabled,
            intensity: clamp(macro.intensity ?? preset.macro.intensity, 0.0, 2.0),
            scale: clamp(macro.scale ?? preset.macro.scale, 0.001, 10.0)
        },
        roughnessVariation: {
            enabled: roughnessVariation.enabled === undefined ? !!preset.roughnessVariation.enabled : !!roughnessVariation.enabled,
            intensity: clamp(roughnessVariation.intensity ?? preset.roughnessVariation.intensity, 0.0, 2.0),
            microScale: clamp(roughnessVariation.microScale ?? preset.roughnessVariation.microScale, 0.01, 50.0),
            macroScale: clamp(roughnessVariation.macroScale ?? preset.roughnessVariation.macroScale, 0.01, 50.0)
        },
        streaks: {
            enabled: streaks.enabled === undefined ? !!preset.streaks.enabled : !!streaks.enabled,
            strength: clamp(streaks.strength ?? preset.streaks.strength, 0.0, 1.0),
            scale: clamp(streaks.scale ?? preset.streaks.scale, 0.01, 50.0),
            direction: makeVector3(streaks.direction ?? preset.streaks.direction, { x: 0, y: -1, z: 0 }),
            ledgeStrength: clamp(streaks.ledgeStrength ?? preset.streaks.ledgeStrength, 0.0, 1.0),
            ledgeScale: clamp(streaks.ledgeScale ?? preset.streaks.ledgeScale, 0.0, 50.0)
        },
        edgeWear: {
            enabled: edgeWear.enabled === undefined ? !!preset.edgeWear.enabled : !!edgeWear.enabled,
            strength: clamp(edgeWear.strength ?? preset.edgeWear.strength, 0.0, 1.0),
            width: clamp(edgeWear.width ?? preset.edgeWear.width, 0.0, 0.5),
            noiseWarp: clamp(edgeWear.noiseWarp ?? preset.edgeWear.noiseWarp, 0.0, 10.0)
        },
        grime: {
            enabled: grime.enabled === undefined ? !!preset.grime.enabled : !!grime.enabled,
            strength: clamp(grime.strength ?? preset.grime.strength, 0.0, 1.0),
            scale: clamp(grime.scale ?? preset.grime.scale, 0.01, 50.0)
        },
        dust: {
            enabled: dust.enabled === undefined ? !!preset.dust.enabled : !!dust.enabled,
            strength: clamp(dust.strength ?? preset.dust.strength, 0.0, 1.0),
            scale: clamp(dust.scale ?? preset.dust.scale, 0.01, 50.0),
            heightBand: normalizeBand(dust.heightBand ?? preset.dust.heightBand, { fallbackMin: 0.6, fallbackMax: 1.0 })
        },
        wetness: {
            enabled: wetness.enabled === undefined ? !!preset.wetness.enabled : !!wetness.enabled,
            strength: clamp(wetness.strength ?? preset.wetness.strength, 0.0, 1.0),
            scale: clamp(wetness.scale ?? preset.wetness.scale, 0.01, 50.0),
            heightBand: normalizeBand(wetness.heightBand ?? preset.wetness.heightBand, { fallbackMin: 0.0, fallbackMax: 1.0 })
        },
        sunBleach: {
            enabled: sunBleach.enabled === undefined ? !!preset.sunBleach.enabled : !!sunBleach.enabled,
            strength: clamp(sunBleach.strength ?? preset.sunBleach.strength, 0.0, 1.0),
            exponent: clamp(sunBleach.exponent ?? preset.sunBleach.exponent, 0.1, 8.0),
            direction: makeVector3(sunBleach.direction ?? preset.sunBleach.direction, { x: 0.4, y: 0.8, z: 0.2 })
        },
        moss: {
            enabled: moss.enabled === undefined ? !!preset.moss.enabled : !!moss.enabled,
            strength: clamp(moss.strength ?? preset.moss.strength, 0.0, 1.0),
            scale: clamp(moss.scale ?? preset.moss.scale, 0.01, 50.0),
            heightBand: normalizeBand(moss.heightBand ?? preset.moss.heightBand, { fallbackMin: 0.0, fallbackMax: 0.6 }),
            tint: makeColor3(moss.tint ?? preset.moss.tint, 0x406b2d)
        },
        soot: {
            enabled: soot.enabled === undefined ? !!preset.soot.enabled : !!soot.enabled,
            strength: clamp(soot.strength ?? preset.soot.strength, 0.0, 1.0),
            scale: clamp(soot.scale ?? preset.soot.scale, 0.01, 50.0),
            heightBand: normalizeBand(soot.heightBand ?? preset.soot.heightBand, { fallbackMin: 0.0, fallbackMax: 0.3 })
        },
        efflorescence: {
            enabled: efflorescence.enabled === undefined ? !!preset.efflorescence.enabled : !!efflorescence.enabled,
            strength: clamp(efflorescence.strength ?? preset.efflorescence.strength, 0.0, 1.0),
            scale: clamp(efflorescence.scale ?? preset.efflorescence.scale, 0.01, 50.0)
        },
        antiTiling: {
            enabled: antiTiling.enabled === undefined ? !!preset.antiTiling.enabled : !!antiTiling.enabled,
            mode: antiMode,
            strength: clamp(antiTiling.strength ?? presetAnti.strength ?? 0.65, 0.0, 1.0),
            cellSize: clamp(antiCellSize, 0.25, 20.0),
            blendWidth: clamp(antiBlendWidth, 0.0, 0.49),
            offsetU: clamp(antiOffsetU, 0.0, 0.5),
            offsetV: clamp(antiOffsetV, 0.0, 0.5),
            rotationDegrees: clamp(antiRotationDegrees, 0.0, 180.0)
        },
        detail: {
            enabled: detail.enabled === undefined ? !!preset.detail.enabled : !!detail.enabled,
            strength: clamp(detail.strength ?? preset.detail.strength, 0.0, 1.0),
            scale: clamp(detail.scale ?? preset.detail.scale, 0.01, 80.0)
        },
        cracks: {
            enabled: cracks.enabled === undefined ? !!preset.cracks.enabled : !!cracks.enabled,
            strength: clamp(cracks.strength ?? preset.cracks.strength, 0.0, 1.0),
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
    const safeSeed = Number(seed) || 0;
    const safeSeedOffset = Number(seedOffset) || 0;
    const hMin = Number.isFinite(heightMin) ? Number(heightMin) : 0;
    const hMax = Number.isFinite(heightMax) ? Number(heightMax) : 1;
    const heightLo = Math.min(hMin, hMax);
    const heightHi = Math.max(hMin, hMax);

    const spaceMode = cfg.space === MATERIAL_VARIATION_SPACE.OBJECT ? 1 : 0;
    const antiRot = clamp(cfg.antiTiling.rotationDegrees, 0.0, 180.0) * (Math.PI / 180);
    const antiMode = cfg.antiTiling.mode === 'quality' ? 1 : 0;

    return {
        config0: new THREE.Vector4(safeSeed, safeSeedOffset, cfg.enabled ? cfg.globalIntensity : 0, spaceMode),
        config1: new THREE.Vector4(cfg.worldSpaceScale, cfg.objectSpaceScale, heightLo, heightHi),
        global0: new THREE.Vector4(cfg.tintAmount, cfg.valueAmount, cfg.saturationAmount, cfg.roughnessAmount),
        global1: new THREE.Vector4(cfg.normalAmount, cfg.aoAmount, seedToFloat01(safeSeed), seedToFloat01(safeSeed ^ 0x9e3779b9)),
        macro: new THREE.Vector4(cfg.macro.enabled ? cfg.macro.intensity : 0, cfg.macro.scale, 0, 0),
        roughnessVar: new THREE.Vector4(cfg.roughnessVariation.enabled ? cfg.roughnessVariation.intensity : 0, cfg.roughnessVariation.microScale, cfg.roughnessVariation.macroScale, 0),
        streaks: new THREE.Vector4(cfg.streaks.enabled ? cfg.streaks.strength : 0, cfg.streaks.scale, cfg.streaks.ledgeStrength, cfg.streaks.ledgeScale),
        streakDir: cfg.streaks.direction.clone(),
        edge: new THREE.Vector4(cfg.edgeWear.enabled ? cfg.edgeWear.strength : 0, cfg.edgeWear.width, cfg.edgeWear.noiseWarp, 0),
        grime: new THREE.Vector4(cfg.grime.enabled ? cfg.grime.strength : 0, cfg.grime.scale, 0, 0),
        dust: new THREE.Vector4(cfg.dust.enabled ? cfg.dust.strength : 0, cfg.dust.scale, cfg.dust.heightBand.min, cfg.dust.heightBand.max),
        wetness: new THREE.Vector4(cfg.wetness.enabled ? cfg.wetness.strength : 0, cfg.wetness.scale, cfg.wetness.heightBand.min, cfg.wetness.heightBand.max),
        sun: new THREE.Vector4(cfg.sunBleach.enabled ? cfg.sunBleach.strength : 0, cfg.sunBleach.exponent, 0, 0),
        sunDir: cfg.sunBleach.direction.clone(),
        moss: new THREE.Vector4(cfg.moss.enabled ? cfg.moss.strength : 0, cfg.moss.scale, cfg.moss.heightBand.min, cfg.moss.heightBand.max),
        mossTint: cfg.moss.tint.clone(),
        soot: new THREE.Vector4(cfg.soot.enabled ? cfg.soot.strength : 0, cfg.soot.scale, cfg.soot.heightBand.min, cfg.soot.heightBand.max),
        eff: new THREE.Vector4(cfg.efflorescence.enabled ? cfg.efflorescence.strength : 0, cfg.efflorescence.scale, 0, 0),
        anti: new THREE.Vector4(cfg.antiTiling.enabled ? cfg.antiTiling.strength : 0, cfg.antiTiling.cellSize, cfg.antiTiling.blendWidth, antiRot),
        anti2: new THREE.Vector4(cfg.antiTiling.offsetU, cfg.antiTiling.offsetV, antiMode, 0),
        detail: new THREE.Vector4(cfg.detail.enabled ? cfg.detail.strength : 0, cfg.detail.scale, 0, 0),
        cracks: new THREE.Vector4(cfg.cracks.enabled ? cfg.cracks.strength : 0, cfg.cracks.scale, 0, 0)
    };
}

function injectMatVarShader(material, shader) {
    const cfg = material?.userData?.materialVariationConfig ?? null;
    if (!cfg) return;

    shader.uniforms.uMatVarConfig0 = { value: cfg.uniforms.config0 };
    shader.uniforms.uMatVarConfig1 = { value: cfg.uniforms.config1 };
    shader.uniforms.uMatVarGlobal0 = { value: cfg.uniforms.global0 };
    shader.uniforms.uMatVarGlobal1 = { value: cfg.uniforms.global1 };
    shader.uniforms.uMatVarMacro = { value: cfg.uniforms.macro };
    shader.uniforms.uMatVarRoughnessVar = { value: cfg.uniforms.roughnessVar };
    shader.uniforms.uMatVarStreaks = { value: cfg.uniforms.streaks };
    shader.uniforms.uMatVarStreakDir = { value: cfg.uniforms.streakDir };
    shader.uniforms.uMatVarEdge = { value: cfg.uniforms.edge };
    shader.uniforms.uMatVarGrime = { value: cfg.uniforms.grime };
    shader.uniforms.uMatVarDust = { value: cfg.uniforms.dust };
    shader.uniforms.uMatVarWetness = { value: cfg.uniforms.wetness };
    shader.uniforms.uMatVarSun = { value: cfg.uniforms.sun };
    shader.uniforms.uMatVarSunDir = { value: cfg.uniforms.sunDir };
    shader.uniforms.uMatVarMoss = { value: cfg.uniforms.moss };
    shader.uniforms.uMatVarMossTint = { value: cfg.uniforms.mossTint };
    shader.uniforms.uMatVarSoot = { value: cfg.uniforms.soot };
    shader.uniforms.uMatVarEff = { value: cfg.uniforms.eff };
    shader.uniforms.uMatVarAnti = { value: cfg.uniforms.anti };
    shader.uniforms.uMatVarAnti2 = { value: cfg.uniforms.anti2 };
    shader.uniforms.uMatVarDetail = { value: cfg.uniforms.detail };
    shader.uniforms.uMatVarCracks = { value: cfg.uniforms.cracks };

    const vertexCommonInject = [
        '#include <common>',
        '#ifdef USE_MATVAR',
        'varying vec3 vMatVarWorldPos;',
        'varying vec3 vMatVarObjectPos;',
        'varying vec3 vMatVarWorldNormal;',
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
        'uniform vec4 uMatVarConfig0;',
        'uniform vec4 uMatVarConfig1;',
        'uniform vec4 uMatVarGlobal0;',
        'uniform vec4 uMatVarGlobal1;',
        'uniform vec4 uMatVarMacro;',
        'uniform vec4 uMatVarRoughnessVar;',
        'uniform vec4 uMatVarStreaks;',
        'uniform vec3 uMatVarStreakDir;',
        'uniform vec4 uMatVarEdge;',
        'uniform vec4 uMatVarGrime;',
        'uniform vec4 uMatVarDust;',
        'uniform vec4 uMatVarWetness;',
        'uniform vec4 uMatVarSun;',
        'uniform vec3 uMatVarSunDir;',
        'uniform vec4 uMatVarMoss;',
        'uniform vec3 uMatVarMossTint;',
        'uniform vec4 uMatVarSoot;',
        'uniform vec4 uMatVarEff;',
        'uniform vec4 uMatVarAnti;',
        'uniform vec4 uMatVarAnti2;',
        'uniform vec4 uMatVarDetail;',
        'uniform vec4 uMatVarCracks;',
        'float mvSaturate(float v){return clamp(v,0.0,1.0);}',
        'float mvHash12(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
        'vec2 mvHash22(vec2 p){float n=mvHash12(p);return vec2(n,mvHash12(p+n));}',
        'float mvNoise2(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);float a=mvHash12(i);float b=mvHash12(i+vec2(1.0,0.0));float c=mvHash12(i+vec2(0.0,1.0));float d=mvHash12(i+vec2(1.0,1.0));return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}',
        'float mvFbm2(vec2 p){float v=0.0;float a=0.5;vec2 shift=vec2(100.0,100.0);for(int i=0;i<4;i++){v+=a*mvNoise2(p);p=p*2.03+shift;a*=0.5;}return v;}',
        'float mvRidged2(vec2 p){float n=mvNoise2(p)*2.0-1.0;return 1.0-abs(n);}',
        'float mvFbmRidged(vec2 p){float v=0.0;float a=0.5;vec2 shift=vec2(23.7,91.3);for(int i=0;i<4;i++){v+=a*mvRidged2(p);p=p*2.0+shift;a*=0.5;}return v;}',
        'vec3 mvSaturateColor(vec3 c, float amount){float l=dot(c,vec3(0.2126,0.7152,0.0722));return mix(vec3(l),c,mvSaturate(1.0+amount));}',
        'vec2 mvPlanarUV(vec3 p, vec3 n){vec3 a=abs(n);if(a.y>a.x&&a.y>a.z)return p.xz;if(a.x>a.z)return p.zy;return p.xy;}',
        'float mvAntiEdge(vec2 f, float w){if(w<=0.0)return 1.0;float a=smoothstep(0.0,w,f.x)*smoothstep(0.0,w,f.y);float b=smoothstep(0.0,w,1.0-f.x)*smoothstep(0.0,w,1.0-f.y);return a*b;}',
        'vec3 mvAntiTiling(vec2 uv){float anti=uMatVarAnti.x*uMatVarConfig0.z; if(anti<=0.0) return vec3(uv,0.0);float cellSize=max(0.001,uMatVarAnti.y);vec2 cellUv=uv/cellSize;vec2 cell=floor(cellUv);vec2 f=fract(cellUv);float edge=mvAntiEdge(f,uMatVarAnti.z);float seedOffset=uMatVarConfig0.y;float seedOA=fract(uMatVarGlobal1.z+seedOffset*0.013);float seedOB=fract(uMatVarGlobal1.w+seedOffset*0.017);float rr=mvHash12(cell+vec2(seedOA*91.7,seedOB*53.3));float angle=(rr*2.0-1.0)*uMatVarAnti.w*anti*edge;vec2 offR=mvHash22(cell+vec2(seedOB*17.3,seedOA*29.1))*2.0-1.0;vec2 off=offR*uMatVarAnti2.xy*anti*edge;vec2 p=f-0.5;float c=cos(angle);float s=sin(angle);p=vec2(c*p.x-s*p.y,s*p.x+c*p.y)+off;vec2 uv2=(cell+p+0.5)*cellSize;if(uMatVarAnti2.z>0.5){float n1=mvFbm2(uv*0.15+vec2(seedOB*13.1,seedOA*17.9));float n2=mvFbm2(uv*0.17+vec2(seedOA*9.7,seedOB*21.3));vec2 warp=(vec2(n1,n2)*2.0-1.0)*uMatVarAnti2.xy*0.35*anti;uv2+=warp;}return vec3(uv2,angle);}',
        '#endif',
        'vec2 mvMatVarUv(vec2 uv){',
        '#ifdef USE_MATVAR',
        'vec3 a=mvAntiTiling(uv);return a.xy;',
        '#else',
        'return uv;',
        '#endif',
        '}',
        'float mvMatVarUvRotation(vec2 uv){',
        '#ifdef USE_MATVAR',
        'vec3 a=mvAntiTiling(uv);return a.z;',
        '#else',
        'return 0.0;',
        '#endif',
        '}'
    ].join('\n');

    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', fragCommonInject);

    shader.fragmentShader = shader.fragmentShader.split('texture2D( map, vMapUv )').join('texture2D( map, mvMatVarUv( vMapUv ) )');
    shader.fragmentShader = shader.fragmentShader.split('texture2D( normalMap, vNormalMapUv )').join('texture2D( normalMap, mvMatVarUv( vNormalMapUv ) )');

    shader.fragmentShader = shader.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        [
            'vec4 diffuseColor = vec4( diffuse, opacity );',
            '#ifdef USE_MATVAR',
            'float matVarAoTex = 1.0;',
            'float matVarNormalFactor = 1.0;',
            '#endif'
        ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        [
            'float roughnessFactor = roughness;',
            '#ifdef USE_ROUGHNESSMAP',
            'vec4 matVarOrm = texture2D( roughnessMap, mvMatVarUv( vRoughnessMapUv ) );',
            'roughnessFactor *= matVarOrm.g;',
            '#ifdef USE_MATVAR',
            'matVarAoTex = matVarOrm.r;',
            '#endif',
            '#endif'
        ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <metalnessmap_fragment>',
        [
            '#include <metalnessmap_fragment>',
            '#ifdef USE_MATVAR',
            'float mvSeed = uMatVarConfig0.x;',
            'float mvSeedOffset = uMatVarConfig0.y;',
            'float mvIntensity = uMatVarConfig0.z;',
            'float mvSpaceMode = uMatVarConfig0.w;',
            'vec3 mvPos = mix(vMatVarWorldPos, vMatVarObjectPos, step(0.5, mvSpaceMode));',
            'vec3 mvN = normalize(vMatVarWorldNormal);',
            'float mvScale = mix(uMatVarConfig1.x, uMatVarConfig1.y, step(0.5, mvSpaceMode));',
            'float mvHeightMin = uMatVarConfig1.z;',
            'float mvHeightMax = uMatVarConfig1.w;',
            'float mvHeight01 = mvSaturate((mvPos.y - mvHeightMin) / max(0.001, mvHeightMax - mvHeightMin));',
            'vec2 mvP = mvPlanarUV(mvPos, mvN) * mvScale;',
            'vec3 mvColor = diffuseColor.rgb;',
            'float mvRough = roughnessFactor;',
            'float mvTintAmount = uMatVarGlobal0.x;',
            'float mvValueAmount = uMatVarGlobal0.y;',
            'float mvSatAmount = uMatVarGlobal0.z;',
            'float mvRoughAmount = uMatVarGlobal0.w;',
            'float mvNormalAmount = uMatVarGlobal1.x;',
            'float mvAoAmount = uMatVarGlobal1.y;',
            'float mvSeedA = uMatVarGlobal1.z;',
            'float mvSeedB = uMatVarGlobal1.w;',
            'float mvSeedOA = fract(mvSeedA + mvSeedOffset * 0.013);',
            'float mvSeedOB = fract(mvSeedB + mvSeedOffset * 0.017);',
            'float mvAo = mix(1.0, matVarAoTex, mvAoAmount);',
            'mvColor *= mvAo;',
            'float mvMacroStrength = uMatVarMacro.x * mvIntensity;',
            'if (mvMacroStrength > 0.0) {',
            'float n = mvFbm2(mvP * uMatVarMacro.y + vec2(mvSeedOA * 37.1, mvSeedOB * 19.7));',
            'float m = n * 2.0 - 1.0;',
            'vec3 warm = vec3(1.05, 1.0, 0.95);',
            'vec3 cool = vec3(0.95, 1.0, 1.05);',
            'vec3 tint = mix(cool, warm, mvSaturate(m * 0.5 + 0.5));',
            'mvColor *= mix(vec3(1.0), tint, mvTintAmount * mvMacroStrength * abs(m));',
            'mvColor *= 1.0 + (m * mvValueAmount * mvMacroStrength);',
            'mvRough += (m * mvRoughAmount * 0.35 * mvMacroStrength);',
            'mvColor = mvSaturateColor(mvColor, (m * mvSatAmount * mvMacroStrength));',
            '}',
            'float mvRoughVarStrength = uMatVarRoughnessVar.x * mvIntensity;',
            'if (mvRoughVarStrength > 0.0) {',
            'float micro = mvFbm2(mvP * uMatVarRoughnessVar.y + vec2(mvSeedOB * 113.1, mvSeedOA * 17.9));',
            'float macro = mvFbm2(mvP * uMatVarRoughnessVar.z + vec2(mvSeedOA * 11.7, mvSeedOB * 83.2));',
            'float rr = ((micro * 2.0 - 1.0) * 0.65 + (macro * 2.0 - 1.0) * 0.35);',
            'mvRough += rr * mvRoughAmount * 0.55 * mvRoughVarStrength;',
            '}',
            'float streakStrength = uMatVarStreaks.x * mvIntensity;',
            'float mvStreakMask = 0.0;',
            'if (streakStrength > 0.0) {',
            'vec3 sd = normalize(uMatVarStreakDir);',
            'vec3 axis = abs(sd.y) > 0.8 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);',
            'vec3 tx = normalize(cross(axis, sd));',
            'vec3 tz = cross(sd, tx);',
            'float sU = dot(mvPos, tx) * uMatVarStreaks.y;',
            'float sV = dot(mvPos, sd) * uMatVarStreaks.y * 1.9;',
            'float lines = mvFbm2(vec2(sU * 0.7, sV) + vec2(mvSeedOA * 41.3, mvSeedOB * 17.1));',
            'float streaks = pow(mvSaturate(lines), 4.0);',
            'float heightW = mvSaturate(mvHeight01 * 1.15);',
            'float ledgeStrength = uMatVarStreaks.z;',
            'float ledgeScale = uMatVarStreaks.w;',
            'float ledge = 0.0;',
            'if (ledgeStrength > 0.0 && ledgeScale > 0.0) {',
            'float f = abs(fract(mvHeight01 * ledgeScale) - 0.5);',
            'ledge = (1.0 - smoothstep(0.0, 0.2, f)) * ledgeStrength;',
            '}',
            'mvStreakMask = mvSaturate(streaks * heightW * (1.0 + ledge)) * streakStrength;',
            'mvColor *= 1.0 - mvStreakMask * 0.12;',
            'mvRough += mvStreakMask * mvRoughAmount * 0.38;',
            '}',
            'float edgeStrength = uMatVarEdge.x * mvIntensity;',
            'float mvEdgeMask = 0.0;',
            'if (edgeStrength > 0.0) {',
            'float w = uMatVarEdge.y;',
            'float top = smoothstep(1.0 - w, 1.0, mvHeight01);',
            'float bottom = 1.0 - smoothstep(0.0, w, mvHeight01);',
            'float border = max(top, bottom);',
            'float curv = length(fwidth(mvN)) * 12.0;',
            'float curvMask = mvSaturate(curv);',
            'float warp = mvFbm2(mvP * uMatVarEdge.z + vec2(mvSeedOB * 12.7, mvSeedOA * 9.1));',
            'mvEdgeMask = mvSaturate(max(border, curvMask) * (0.35 + 0.65 * warp)) * edgeStrength;',
            'mvColor *= 1.0 + mvEdgeMask * 0.18;',
            'mvRough += mvEdgeMask * mvRoughAmount * 0.32;',
            '}',
            'float grimeStrength = uMatVarGrime.x * mvIntensity;',
            'if (grimeStrength > 0.0) {',
            'float cavity = mvSaturate(1.0 - matVarAoTex);',
            'float baseBand = 1.0 - smoothstep(0.15, 0.65, mvHeight01);',
            'float g = mvFbm2(mvP * uMatVarGrime.y + vec2(mvSeedOA * 71.2, mvSeedOB * 31.9));',
            'float grime = mvSaturate((0.35 + 0.65 * g) * max(cavity, baseBand)) * grimeStrength;',
            'mvColor *= 1.0 - grime * 0.18;',
            'mvRough += grime * mvRoughAmount * 0.45;',
            '}',
            'float dustStrength = uMatVarDust.x * mvIntensity;',
            'if (dustStrength > 0.0) {',
            'float band = smoothstep(uMatVarDust.z, uMatVarDust.w, mvHeight01);',
            'float d = mvFbm2(mvP * uMatVarDust.y + vec2(mvSeedOB * 7.7, mvSeedOA * 18.3));',
            'float dust = mvSaturate(band * (0.4 + d * 0.6)) * dustStrength;',
            'mvColor *= 1.0 + dust * 0.08;',
            'mvColor = mvSaturateColor(mvColor, -dust * mvSatAmount * 0.75);',
            'mvRough += dust * mvRoughAmount * 0.25;',
            '}',
            'float wetStrength = uMatVarWetness.x * mvIntensity;',
            'if (wetStrength > 0.0) {',
            'float band = smoothstep(uMatVarWetness.z, uMatVarWetness.w, mvHeight01);',
            'float w = mvFbm2(mvP * uMatVarWetness.y + vec2(mvSeedOA * 5.3, mvSeedOB * 29.1));',
            'float wet = mvSaturate((0.35 + 0.65 * w) * band) * wetStrength;',
            'wet = wet * (0.35 + 0.65 * mvStreakMask);',
            'mvColor *= 1.0 - wet * 0.07;',
            'mvRough -= wet * 0.35;',
            '}',
            'float sunStrength = uMatVarSun.x * mvIntensity;',
            'if (sunStrength > 0.0) {',
            'vec3 sunDir = normalize(uMatVarSunDir);',
            'float exp = max(0.0, dot(mvN, sunDir));',
            'float exposure = pow(exp, uMatVarSun.y);',
            'float bleach = mvSaturate(exposure) * sunStrength;',
            'mvColor *= 1.0 + bleach * mvValueAmount * 0.45;',
            'mvColor = mvSaturateColor(mvColor, -bleach * mvSatAmount * 0.9);',
            'mvRough += bleach * mvRoughAmount * 0.12;',
            '}',
            'float mossStrength = uMatVarMoss.x * mvIntensity;',
            'float mvMossMask = 0.0;',
            'if (mossStrength > 0.0) {',
            'vec3 sunDir = normalize(uMatVarSunDir);',
            'float exp = max(0.0, dot(mvN, sunDir));',
            'float shade = 1.0 - exp;',
            'float band = smoothstep(uMatVarMoss.z, uMatVarMoss.w, mvHeight01);',
            'float m = mvFbm2(mvP * uMatVarMoss.y + vec2(mvSeedOB * 37.0, mvSeedOA * 21.4));',
            'mvMossMask = mvSaturate(shade * band * (0.35 + 0.65 * m) * (0.4 + 0.6 * mvStreakMask)) * mossStrength;',
            'mvColor = mix(mvColor, mvColor * (0.7 + 0.3 * uMatVarMossTint), mvMossMask);',
            'mvRough += mvMossMask * mvRoughAmount * 0.25;',
            'matVarNormalFactor += mvMossMask * mvNormalAmount * 0.25;',
            '}',
            'float sootStrength = uMatVarSoot.x * mvIntensity;',
            'if (sootStrength > 0.0) {',
            'float band = 1.0 - smoothstep(uMatVarSoot.z, uMatVarSoot.w, mvHeight01);',
            'float s = mvFbm2(mvP * uMatVarSoot.y + vec2(mvSeedOA * 12.1, mvSeedOB * 41.7));',
            'float soot = mvSaturate(band * (0.4 + 0.6 * s)) * sootStrength;',
            'mvColor *= 1.0 - soot * 0.12;',
            'mvRough += soot * mvRoughAmount * 0.22;',
            '}',
            'float effStrength = uMatVarEff.x * mvIntensity;',
            'if (effStrength > 0.0) {',
            'float e = mvFbm2(mvP * uMatVarEff.y + vec2(mvSeedOB * 19.9, mvSeedOA * 9.7));',
            'float eff = mvSaturate((0.3 + 0.7 * e) * mvStreakMask * (1.0 - mvMossMask)) * effStrength;',
            'mvColor *= 1.0 + eff * 0.16;',
            'mvColor = mvSaturateColor(mvColor, -eff * mvSatAmount * 0.75);',
            'mvRough += eff * mvRoughAmount * 0.18;',
            '}',
            'float detailStrength = uMatVarDetail.x * mvIntensity;',
            'if (detailStrength > 0.0) {',
            'float d = mvFbm2(mvP * uMatVarDetail.y + vec2(mvSeedOA * 101.1, mvSeedOB * 83.7));',
            'float dd = (d * 2.0 - 1.0) * detailStrength;',
            'mvRough += dd * mvRoughAmount * 0.45;',
            'mvColor *= 1.0 + dd * mvValueAmount * 0.95;',
            'matVarNormalFactor += abs(dd) * mvNormalAmount * 0.65;',
            '}',
            'float crackStrength = uMatVarCracks.x * mvIntensity;',
            'if (crackStrength > 0.0) {',
            'float c = mvFbmRidged(mvP * uMatVarCracks.y + vec2(mvSeedOB * 53.9, mvSeedOA * 44.1));',
            'float crack = smoothstep(0.62, 0.95, c) * crackStrength;',
            'mvRough += crack * mvRoughAmount * 0.22;',
            'matVarNormalFactor += crack * mvNormalAmount * 0.22;',
            'mvColor *= 1.0 - crack * 0.12;',
            '}',
            'mvRough = clamp(mvRough, 0.03, 1.0);',
            'matVarNormalFactor = clamp(matVarNormalFactor, 0.0, 2.0);',
            'diffuseColor.rgb = clamp(mvColor, 0.0, 2.0);',
            'roughnessFactor = mvRough;',
            '#endif'
        ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        'normalMap.xy *= normalScale;',
        [
            '#ifdef USE_MATVAR',
            'float mvAntiRot = mvMatVarUvRotation(vNormalMapUv);',
            'float mvAntiC = cos(mvAntiRot);',
            'float mvAntiS = sin(mvAntiRot);',
            'normalMap.xy = mat2(mvAntiC, -mvAntiS, mvAntiS, mvAntiC) * (normalMap.xy * normalScale * matVarNormalFactor);',
            '#else',
            'normalMap.xy *= normalScale;',
            '#endif'
        ].join('\n')
    );
}

function ensureMatVarConfigOnMaterial(material, config) {
    const mat = material;
    mat.userData = mat.userData ?? {};
    mat.userData.materialVariationConfig = config;

    mat.defines = mat.defines ?? {};
    mat.defines.USE_MATVAR = 1;

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
        root = MATERIAL_VARIATION_ROOT.WALL
    } = {}
) {
    if (!material?.isMeshStandardMaterial) return material;

    const normalized = normalizeMaterialVariationConfig(config, { root });
    const uniforms = buildUniformBundle({ seed, seedOffset, heightMin, heightMax, config: normalized });
    const cfg = { normalized, uniforms, shaderUniforms: null };

    ensureMatVarConfigOnMaterial(material, cfg);
    material.needsUpdate = true;
    return material;
}

export function updateMaterialVariationOnMeshStandardMaterial(material, { seed, seedOffset, heightMin, heightMax, config = null, root = MATERIAL_VARIATION_ROOT.WALL } = {}) {
    if (!material?.isMeshStandardMaterial) return;
    const normalized = normalizeMaterialVariationConfig(config, { root });
    const uniforms = buildUniformBundle({ seed, seedOffset, heightMin, heightMax, config: normalized });

    const cfg = material.userData?.materialVariationConfig ?? null;
    if (!cfg) {
        applyMaterialVariationToMeshStandardMaterial(material, { seed, seedOffset, heightMin, heightMax, config: normalized, root });
        return;
    }

    cfg.normalized = normalized;
    cfg.uniforms.config0.copy(uniforms.config0);
    cfg.uniforms.config1.copy(uniforms.config1);
    cfg.uniforms.global0.copy(uniforms.global0);
    cfg.uniforms.global1.copy(uniforms.global1);
    cfg.uniforms.macro.copy(uniforms.macro);
    cfg.uniforms.roughnessVar.copy(uniforms.roughnessVar);
    cfg.uniforms.streaks.copy(uniforms.streaks);
    cfg.uniforms.streakDir.copy(uniforms.streakDir);
    cfg.uniforms.edge.copy(uniforms.edge);
    cfg.uniforms.grime.copy(uniforms.grime);
    cfg.uniforms.dust.copy(uniforms.dust);
    cfg.uniforms.wetness.copy(uniforms.wetness);
    cfg.uniforms.sun.copy(uniforms.sun);
    cfg.uniforms.sunDir.copy(uniforms.sunDir);
    cfg.uniforms.moss.copy(uniforms.moss);
    cfg.uniforms.mossTint.copy(uniforms.mossTint);
    cfg.uniforms.soot.copy(uniforms.soot);
    cfg.uniforms.eff.copy(uniforms.eff);
    cfg.uniforms.anti.copy(uniforms.anti);
    cfg.uniforms.anti2.copy(uniforms.anti2);
    cfg.uniforms.detail.copy(uniforms.detail);
    cfg.uniforms.cracks.copy(uniforms.cracks);

    const shaderUniforms = cfg.shaderUniforms;
    if (shaderUniforms?.uMatVarConfig0?.value) shaderUniforms.uMatVarConfig0.value = cfg.uniforms.config0;
    if (shaderUniforms?.uMatVarConfig1?.value) shaderUniforms.uMatVarConfig1.value = cfg.uniforms.config1;
    if (shaderUniforms?.uMatVarGlobal0?.value) shaderUniforms.uMatVarGlobal0.value = cfg.uniforms.global0;
    if (shaderUniforms?.uMatVarGlobal1?.value) shaderUniforms.uMatVarGlobal1.value = cfg.uniforms.global1;
    if (shaderUniforms?.uMatVarMacro?.value) shaderUniforms.uMatVarMacro.value = cfg.uniforms.macro;
    if (shaderUniforms?.uMatVarRoughnessVar?.value) shaderUniforms.uMatVarRoughnessVar.value = cfg.uniforms.roughnessVar;
    if (shaderUniforms?.uMatVarStreaks?.value) shaderUniforms.uMatVarStreaks.value = cfg.uniforms.streaks;
    if (shaderUniforms?.uMatVarStreakDir?.value) shaderUniforms.uMatVarStreakDir.value = cfg.uniforms.streakDir;
    if (shaderUniforms?.uMatVarEdge?.value) shaderUniforms.uMatVarEdge.value = cfg.uniforms.edge;
    if (shaderUniforms?.uMatVarGrime?.value) shaderUniforms.uMatVarGrime.value = cfg.uniforms.grime;
    if (shaderUniforms?.uMatVarDust?.value) shaderUniforms.uMatVarDust.value = cfg.uniforms.dust;
    if (shaderUniforms?.uMatVarWetness?.value) shaderUniforms.uMatVarWetness.value = cfg.uniforms.wetness;
    if (shaderUniforms?.uMatVarSun?.value) shaderUniforms.uMatVarSun.value = cfg.uniforms.sun;
    if (shaderUniforms?.uMatVarSunDir?.value) shaderUniforms.uMatVarSunDir.value = cfg.uniforms.sunDir;
    if (shaderUniforms?.uMatVarMoss?.value) shaderUniforms.uMatVarMoss.value = cfg.uniforms.moss;
    if (shaderUniforms?.uMatVarMossTint?.value) shaderUniforms.uMatVarMossTint.value = cfg.uniforms.mossTint;
    if (shaderUniforms?.uMatVarSoot?.value) shaderUniforms.uMatVarSoot.value = cfg.uniforms.soot;
    if (shaderUniforms?.uMatVarEff?.value) shaderUniforms.uMatVarEff.value = cfg.uniforms.eff;
    if (shaderUniforms?.uMatVarAnti?.value) shaderUniforms.uMatVarAnti.value = cfg.uniforms.anti;
    if (shaderUniforms?.uMatVarAnti2?.value) shaderUniforms.uMatVarAnti2.value = cfg.uniforms.anti2;
    if (shaderUniforms?.uMatVarDetail?.value) shaderUniforms.uMatVarDetail.value = cfg.uniforms.detail;
    if (shaderUniforms?.uMatVarCracks?.value) shaderUniforms.uMatVarCracks.value = cfg.uniforms.cracks;

    material.needsUpdate = true;
}
