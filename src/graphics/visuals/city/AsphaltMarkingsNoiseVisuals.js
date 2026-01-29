// src/graphics/visuals/city/AsphaltMarkingsNoiseVisuals.js
// Applies asphalt fine roughness noise to road markings materials via shader injection.
// @ts-check
import { sanitizeAsphaltNoiseSettings } from './AsphaltNoiseSettings.js';

const ASPHALT_MARKINGS_NOISE_SHADER_VERSION = 1;

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function buildAsphaltMarkingsNoiseConfig({
    asphaltNoise,
    asphaltFineRoughnessMap,
    asphaltFineNormalMap,
    asphaltFineScale,
    asphaltFineBaseRoughness,
    asphaltFineRoughnessStrength,
    asphaltFineNormalStrength
} = {}) {
    const settings = sanitizeAsphaltNoiseSettings(asphaltNoise);
    const markings = settings?.markings && typeof settings.markings === 'object' ? settings.markings : {};
    const enabled = markings.enabled === true;
    const debug = markings.debug === true;

    const map = asphaltFineRoughnessMap?.isTexture ? asphaltFineRoughnessMap : null;
    const normalMap = (settings?.fine?.normal !== false && asphaltFineNormalMap?.isTexture) ? asphaltFineNormalMap : null;
    const fineScaleResolved = clamp(asphaltFineScale ?? settings?.fine?.scale, 0.1, 15.0, 12.0);
    const fineBaseRough = clamp(asphaltFineBaseRoughness, 0.0, 1.0, 0.95);
    const fineRoughStrengthRaw = clamp(asphaltFineRoughnessStrength ?? settings?.fine?.roughnessStrength, 0.0, 0.5, 0.16);
    const fineRoughStrength = map ? fineRoughStrengthRaw : 0.0;
    const normalStrengthRaw = clamp(asphaltFineNormalStrength ?? settings?.fine?.normalStrength, 0.0, 2.0, 0.35);
    const normalStrength = (enabled && normalMap) ? clamp(normalStrengthRaw * 0.55, 0.0, 1.0, 0.18) : 0.0;

    const active = !!(map && fineRoughStrength > 1e-6 && (enabled || debug));

    return {
        enabled,
        debug,
        active,
        colorStrength: enabled ? clamp(markings.colorStrength, 0.0, 0.5, 0.025) : 0.0,
        roughnessStrength: enabled ? clamp(markings.roughnessStrength, 0.0, 0.5, 0.09) : 0.0,
        fineScale: fineScaleResolved,
        fineBaseRoughness: fineBaseRough,
        fineRoughnessStrength: fineRoughStrength,
        fineRoughnessMap: map,
        normalMap,
        normalStrength,
        shaderUniforms: null
    };
}

function ensureAsphaltMarkingsNoiseBase(material) {
    const mat = material;
    mat.userData = mat.userData ?? {};
    const existing = mat.userData.asphaltMarkingsNoiseBase ?? null;
    if (existing && typeof existing === 'object') return existing;
    const base = {
        normalMap: mat.normalMap ?? null,
        normalScale: mat.normalScale?.isVector2 && typeof mat.normalScale.clone === 'function' ? mat.normalScale.clone() : null
    };
    mat.userData.asphaltMarkingsNoiseBase = base;
    return base;
}

function injectAsphaltMarkingsNoiseShader(material, shader) {
    const cfg = material.userData?.asphaltMarkingsNoiseConfig ?? null;
    if (!cfg) return;

    shader.uniforms.uAsphaltMarkingsNoiseEnabled = { value: cfg.enabled ? 1.0 : 0.0 };
    shader.uniforms.uAsphaltMarkingsNoiseColorStrength = { value: cfg.colorStrength };
    shader.uniforms.uAsphaltMarkingsNoiseRoughnessStrength = { value: cfg.roughnessStrength };
    shader.uniforms.uAsphaltMarkingsNoiseDebug = { value: cfg.debug ? 1.0 : 0.0 };
    shader.uniforms.uAsphaltMarkingsFineScale = { value: cfg.fineScale };
    shader.uniforms.uAsphaltMarkingsFineBaseRoughness = { value: cfg.fineBaseRoughness };
    shader.uniforms.uAsphaltMarkingsFineRoughnessStrength = { value: cfg.fineRoughnessStrength };
    shader.uniforms.uAsphaltMarkingsFineRoughnessMap = { value: cfg.fineRoughnessMap };

    if (!shader.vertexShader.includes('varying vec3 vAsphaltMarkingsWorldPos;')) {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vAsphaltMarkingsWorldPos;'
        );
    }
    if (!shader.vertexShader.includes('vAsphaltMarkingsWorldPos = worldPosition.xyz;')) {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            '#include <worldpos_vertex>\nvAsphaltMarkingsWorldPos = worldPosition.xyz;'
        );
    }

    if (!shader.fragmentShader.includes('float asphaltMarkingsNoiseCompute')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            [
                '#include <common>',
                '#ifdef USE_ASPHALT_MARKINGS_NOISE',
                'uniform float uAsphaltMarkingsNoiseEnabled;',
                'uniform float uAsphaltMarkingsNoiseColorStrength;',
                'uniform float uAsphaltMarkingsNoiseRoughnessStrength;',
                'uniform float uAsphaltMarkingsNoiseDebug;',
                'uniform float uAsphaltMarkingsFineScale;',
                'uniform float uAsphaltMarkingsFineBaseRoughness;',
                'uniform float uAsphaltMarkingsFineRoughnessStrength;',
                'uniform sampler2D uAsphaltMarkingsFineRoughnessMap;',
                'varying vec3 vAsphaltMarkingsWorldPos;',
                'float asphaltMarkingsNoiseSigned = 0.0;',
                'float asphaltMarkingsNoiseCompute(vec2 worldXZ){',
                'float enabledFlag = max(uAsphaltMarkingsNoiseEnabled, uAsphaltMarkingsNoiseDebug);',
                'if (enabledFlag < 0.5) return 0.0;',
                'float denom = max(1e-5, uAsphaltMarkingsFineRoughnessStrength);',
                'if (uAsphaltMarkingsFineRoughnessStrength <= 1e-5) return 0.0;',
                'vec2 uv = worldXZ * uAsphaltMarkingsFineScale;',
                'float r = texture2D(uAsphaltMarkingsFineRoughnessMap, uv).r;',
                'float s = (r - uAsphaltMarkingsFineBaseRoughness) / denom;',
                'return clamp(s, -1.0, 1.0);',
                '}',
                '#endif'
            ].join('\n')
        );
    }

    if (!shader.fragmentShader.includes('asphaltMarkingsNoiseSigned = asphaltMarkingsNoiseCompute')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            [
                '#include <color_fragment>',
                '#ifdef USE_ASPHALT_MARKINGS_NOISE',
                'asphaltMarkingsNoiseSigned = asphaltMarkingsNoiseCompute(vAsphaltMarkingsWorldPos.xz);',
                'if (uAsphaltMarkingsNoiseDebug > 0.5) {',
                'diffuseColor.rgb = vec3(0.5 + 0.5 * asphaltMarkingsNoiseSigned);',
                '} else {',
                'diffuseColor.rgb *= (1.0 + asphaltMarkingsNoiseSigned * uAsphaltMarkingsNoiseColorStrength);',
                '}',
                '#endif'
            ].join('\n')
        );
    }

    if (!shader.fragmentShader.includes('asphaltMarkingsNoiseSigned * uAsphaltMarkingsNoiseRoughnessStrength')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <roughnessmap_fragment>',
            [
                '#include <roughnessmap_fragment>',
                '#ifdef USE_ASPHALT_MARKINGS_NOISE',
                'float r = asphaltMarkingsNoiseSigned * uAsphaltMarkingsNoiseRoughnessStrength;',
                'float room = (r > 0.0) ? (1.0 - roughnessFactor) : roughnessFactor;',
                'roughnessFactor = clamp(roughnessFactor + r * room, 0.0, 1.0);',
                '#endif'
            ].join('\n')
        );
    }

    cfg.shaderUniforms = shader.uniforms;
}

function ensureAsphaltMarkingsNoiseConfigOnMaterial(material, config) {
    const mat = material;
    mat.userData = mat.userData ?? {};
    const existing = mat.userData.asphaltMarkingsNoiseConfig ?? null;
    const cfg = existing && typeof existing === 'object' ? existing : config;
    cfg.enabled = config.enabled;
    cfg.debug = config.debug;
    cfg.active = config.active;
    cfg.colorStrength = config.colorStrength;
    cfg.roughnessStrength = config.roughnessStrength;
    cfg.fineScale = config.fineScale;
    cfg.fineBaseRoughness = config.fineBaseRoughness;
    cfg.fineRoughnessStrength = config.fineRoughnessStrength;
    cfg.fineRoughnessMap = config.fineRoughnessMap;
    cfg.normalMap = config.normalMap;
    cfg.normalStrength = config.normalStrength;
    mat.userData.asphaltMarkingsNoiseConfig = cfg;

    const u = cfg.shaderUniforms ?? null;
    if (u) {
        if (u.uAsphaltMarkingsNoiseEnabled) u.uAsphaltMarkingsNoiseEnabled.value = cfg.enabled ? 1.0 : 0.0;
        if (u.uAsphaltMarkingsNoiseColorStrength) u.uAsphaltMarkingsNoiseColorStrength.value = cfg.colorStrength;
        if (u.uAsphaltMarkingsNoiseRoughnessStrength) u.uAsphaltMarkingsNoiseRoughnessStrength.value = cfg.roughnessStrength;
        if (u.uAsphaltMarkingsNoiseDebug) u.uAsphaltMarkingsNoiseDebug.value = cfg.debug ? 1.0 : 0.0;
        if (u.uAsphaltMarkingsFineScale) u.uAsphaltMarkingsFineScale.value = cfg.fineScale;
        if (u.uAsphaltMarkingsFineBaseRoughness) u.uAsphaltMarkingsFineBaseRoughness.value = cfg.fineBaseRoughness;
        if (u.uAsphaltMarkingsFineRoughnessStrength) u.uAsphaltMarkingsFineRoughnessStrength.value = cfg.fineRoughnessStrength;
        if (u.uAsphaltMarkingsFineRoughnessMap) u.uAsphaltMarkingsFineRoughnessMap.value = cfg.fineRoughnessMap;
    }

    const base = ensureAsphaltMarkingsNoiseBase(mat);
    const wantsNormal = cfg.enabled && cfg.normalMap?.isTexture && cfg.normalStrength > 1e-6;
    const prevHadNormal = !!mat.normalMap;
    if (wantsNormal) {
        mat.normalMap = cfg.normalMap;
        mat.extensions = mat.extensions ?? {};
        mat.extensions.derivatives = true;
        if (mat.normalScale?.set) mat.normalScale.set(cfg.normalStrength, cfg.normalStrength);
    } else {
        mat.normalMap = base.normalMap;
        if (base.normalScale?.isVector2 && typeof mat.normalScale?.copy === 'function') mat.normalScale.copy(base.normalScale);
    }
    const nextHadNormal = !!mat.normalMap;
    if (prevHadNormal !== nextHadNormal) mat.needsUpdate = true;

    if (mat.userData.asphaltMarkingsNoiseInjected === true) return;

    mat.defines = mat.defines ?? {};
    mat.defines.USE_ASPHALT_MARKINGS_NOISE = 1;

    const prevCacheKey = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => {
        const prev = prevCacheKey ? prevCacheKey() : '';
        return `${prev}|asphaltMarkingsNoise:${ASPHALT_MARKINGS_NOISE_SHADER_VERSION}`;
    };

    const prevOnBeforeCompile = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile.bind(mat) : null;
    mat.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);
        injectAsphaltMarkingsNoiseShader(mat, shader);
    };
    mat.userData.asphaltMarkingsNoiseInjected = true;
}

export function applyAsphaltMarkingsNoiseVisualsToMeshStandardMaterial(
    material,
    {
        asphaltNoise,
        asphaltFineRoughnessMap = null,
        asphaltFineNormalMap = null,
        asphaltFineScale = null,
        asphaltFineBaseRoughness = 0.95,
        asphaltFineRoughnessStrength = null,
        asphaltFineNormalStrength = null
    } = {}
) {
    if (!material?.isMeshStandardMaterial) return material;

    const cfg = buildAsphaltMarkingsNoiseConfig({
        asphaltNoise,
        asphaltFineRoughnessMap,
        asphaltFineNormalMap,
        asphaltFineScale,
        asphaltFineBaseRoughness,
        asphaltFineRoughnessStrength,
        asphaltFineNormalStrength
    });
    const wasInjected = material.userData?.asphaltMarkingsNoiseInjected === true;
    ensureAsphaltMarkingsNoiseConfigOnMaterial(material, cfg);
    if (!wasInjected) material.needsUpdate = true;
    return material;
}
