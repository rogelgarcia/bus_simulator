// src/graphics/visuals/city/AsphaltEdgeWearVisuals.js
// Applies curb-adjacent edge wear/grime overlays to MeshStandardMaterial via shader injection.
// @ts-check
import * as THREE from 'three';
import { sanitizeAsphaltNoiseSettings } from './AsphaltNoiseSettings.js';

const ASPHALT_EDGE_WEAR_SHADER_VERSION = 1;

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function hashStringToVec2(text) {
    const str = String(text ?? '');
    let h1 = 0x811c9dc5;
    let h2 = 0x811c9dc5 ^ 0x9e3779b9;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i) & 0xff;
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193) >>> 0;
        h2 ^= c;
        h2 = Math.imul(h2, 0x01000193) >>> 0;
    }
    const a = (h1 & 0xffff) / 65535;
    const b = (h2 & 0xffff) / 65535;
    return new THREE.Vector2(a * 512.0, b * 512.0);
}

function buildAsphaltEdgeWearConfig({ asphaltNoise, seed, maxWidth }) {
    const settings = sanitizeAsphaltNoiseSettings(asphaltNoise);
    const edge = settings?.livedIn?.edgeDirt ?? null;
    const enabled = edge?.enabled !== false;

    return {
        enabled,
        strength: enabled ? clamp(edge?.strength, 0.0, 4.0, 0.0) : 0.0,
        width: enabled ? clamp(edge?.width, 0.0, 3.0, 0.0) : 0.0,
        scale: clamp(edge?.scale, 0.001, 50.0, 0.55),
        maxWidth: clamp(maxWidth, 0.05, 5.0, 1.25),
        seed: hashStringToVec2(String(seed ?? 'roads')),
        shaderUniforms: null
    };
}

function injectAsphaltEdgeWearShader(material, shader) {
    const cfg = material.userData?.asphaltEdgeWearConfig ?? null;
    if (!cfg) return;

    shader.uniforms.uAsphaltEdgeWearStrength = { value: cfg.strength };
    shader.uniforms.uAsphaltEdgeWearWidth = { value: cfg.width };
    shader.uniforms.uAsphaltEdgeWearScale = { value: cfg.scale };
    shader.uniforms.uAsphaltEdgeWearMaxWidth = { value: cfg.maxWidth };
    shader.uniforms.uAsphaltEdgeWearSeed = { value: cfg.seed };

    if (!shader.vertexShader.includes('varying vec3 vAsphaltEdgeWearWorldPos;')) {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vAsphaltEdgeWearWorldPos;'
        );
    }
    if (!shader.vertexShader.includes('vAsphaltEdgeWearWorldPos = worldPosition.xyz;')) {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            '#include <worldpos_vertex>\nvAsphaltEdgeWearWorldPos = worldPosition.xyz;'
        );
    }

    if (!shader.fragmentShader.includes('float asphaltEdgeWearHash12')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            [
                '#include <common>',
                '#ifdef USE_ASPHALT_EDGE_WEAR',
                'uniform float uAsphaltEdgeWearStrength;',
                'uniform float uAsphaltEdgeWearWidth;',
                'uniform float uAsphaltEdgeWearScale;',
                'uniform float uAsphaltEdgeWearMaxWidth;',
                'uniform vec2 uAsphaltEdgeWearSeed;',
                'varying vec3 vAsphaltEdgeWearWorldPos;',
                'float asphaltEdgeWearHash12(vec2 p){',
                'vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
                'p3 += dot(p3, p3.yzx + 33.33);',
                'return fract((p3.x + p3.y) * p3.z);',
                '}',
                'float asphaltEdgeWearNoise(vec2 p){',
                'vec2 i = floor(p);',
                'vec2 f = fract(p);',
                'float a = asphaltEdgeWearHash12(i);',
                'float b = asphaltEdgeWearHash12(i + vec2(1.0, 0.0));',
                'float c = asphaltEdgeWearHash12(i + vec2(0.0, 1.0));',
                'float d = asphaltEdgeWearHash12(i + vec2(1.0, 1.0));',
                'vec2 u = f * f * (3.0 - 2.0 * f);',
                'return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;',
                '}',
                'float asphaltEdgeWearFbm(vec2 p){',
                'mat2 r = mat2(0.80, -0.60, 0.60, 0.80);',
                'p = r * p;',
                'float n1 = asphaltEdgeWearNoise(p);',
                'float n2 = asphaltEdgeWearNoise(p * 2.07 + vec2(21.1, 5.7));',
                'return n1 * 0.68 + n2 * 0.32;',
                '}',
                '#endif'
            ].join('\n')
        );
    }

    if (!shader.fragmentShader.includes('diffuseColor.a *= asphaltEdgeWearMask;')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            'vec4 diffuseColor = vec4( diffuse, opacity );',
            [
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                '#ifdef USE_ASPHALT_EDGE_WEAR',
                'float asphaltEdgeWearMask = 0.0;',
                'float asphaltEdgeWearVarSigned = 0.0;',
                'float edgeWidth = clamp(uAsphaltEdgeWearWidth, 0.0, uAsphaltEdgeWearMaxWidth);',
                'if (edgeWidth > 1e-6 && uAsphaltEdgeWearStrength > 0.0) {',
                'float mx = max(1e-6, uAsphaltEdgeWearMaxWidth);',
                'float d = clamp(vUv.y, 0.0, 1.0) * mx;',
                'float t = clamp(d / edgeWidth, 0.0, 1.0);',
                'float edge = pow(1.0 - t, 1.35);',
                'float n = asphaltEdgeWearFbm((vAsphaltEdgeWearWorldPos.xz + uAsphaltEdgeWearSeed * 100.0) * uAsphaltEdgeWearScale);',
                'asphaltEdgeWearVarSigned = (n - 0.5) * 2.0;',
                'float breakup = 0.65 + 0.35 * n;',
                'asphaltEdgeWearMask = clamp(uAsphaltEdgeWearStrength * edge * breakup, 0.0, 1.0);',
                '}',
                'diffuseColor.a *= asphaltEdgeWearMask;',
                '#endif'
            ].join('\n')
        );
    }

    if (!shader.fragmentShader.includes('roughnessFactor = clamp(roughnessFactor + edgeRough')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <metalnessmap_fragment>',
            [
                '#include <metalnessmap_fragment>',
                '#ifdef USE_ASPHALT_EDGE_WEAR',
                'float edgeRough = asphaltEdgeWearMask * (0.18 + 0.12 * asphaltEdgeWearVarSigned);',
                'roughnessFactor = clamp(roughnessFactor + edgeRough, 0.0, 1.0);',
                '#endif'
            ].join('\n')
        );
    }

    cfg.shaderUniforms = shader.uniforms;
}

function ensureAsphaltEdgeWearConfigOnMaterial(material, config) {
    const mat = material;
    mat.userData = mat.userData ?? {};
    const existing = mat.userData.asphaltEdgeWearConfig ?? null;
    const cfg = existing && typeof existing === 'object' ? existing : config;
    cfg.enabled = config.enabled;
    cfg.strength = config.strength;
    cfg.width = config.width;
    cfg.scale = config.scale;
    cfg.maxWidth = config.maxWidth;
    cfg.seed = config.seed;
    mat.userData.asphaltEdgeWearConfig = cfg;

    const u = cfg.shaderUniforms ?? null;
    if (u) {
        if (u.uAsphaltEdgeWearStrength) u.uAsphaltEdgeWearStrength.value = cfg.strength;
        if (u.uAsphaltEdgeWearWidth) u.uAsphaltEdgeWearWidth.value = cfg.width;
        if (u.uAsphaltEdgeWearScale) u.uAsphaltEdgeWearScale.value = cfg.scale;
        if (u.uAsphaltEdgeWearMaxWidth) u.uAsphaltEdgeWearMaxWidth.value = cfg.maxWidth;
        if (u.uAsphaltEdgeWearSeed?.value?.isVector2 && typeof u.uAsphaltEdgeWearSeed.value.copy === 'function') u.uAsphaltEdgeWearSeed.value.copy(cfg.seed);
        else if (u.uAsphaltEdgeWearSeed) u.uAsphaltEdgeWearSeed.value = cfg.seed;
    }

    mat.transparent = true;
    mat.opacity = 1.0;
    mat.depthWrite = false;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = mat.polygonOffsetFactor ?? 0;
    mat.polygonOffsetUnits = mat.polygonOffsetUnits ?? -2;
    mat.blending = THREE.NormalBlending;

    mat.defines = mat.defines ?? {};
    mat.defines.USE_ASPHALT_EDGE_WEAR = 1;
    mat.defines.USE_UV = 1;

    if (mat.userData.asphaltEdgeWearInjected === true) return;

    const prevCacheKey = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => {
        const prev = prevCacheKey ? prevCacheKey() : '';
        return `${prev}|asphaltEdgeWear:${ASPHALT_EDGE_WEAR_SHADER_VERSION}`;
    };

    const prevOnBeforeCompile = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile.bind(mat) : null;
    mat.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);
        injectAsphaltEdgeWearShader(mat, shader);
    };
    mat.userData.asphaltEdgeWearInjected = true;
}

export function applyAsphaltEdgeWearVisualsToMeshStandardMaterial(material, {
    asphaltNoise,
    seed,
    maxWidth = 1.25
} = {}) {
    if (!material?.isMeshStandardMaterial) return material;

    const cfg = buildAsphaltEdgeWearConfig({ asphaltNoise, seed, maxWidth });
    const wasInjected = material.userData?.asphaltEdgeWearInjected === true;
    ensureAsphaltEdgeWearConfigOnMaterial(material, cfg);
    if (!wasInjected) material.needsUpdate = true;
    return material;
}
