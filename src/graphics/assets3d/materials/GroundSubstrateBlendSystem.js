// src/graphics/assets3d/materials/GroundSubstrateBlendSystem.js
// Blends multiple ground PBR texture sets using procedural noise masks via shader injection.
// @ts-check

import * as THREE from 'three';

const GROUND_SUBSTRATE_BLEND_SHADER_VERSION = 1;
const EPS = 1e-6;

function clamp(value, min, max, fallback = min) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function createSolidDataTexture(r, g, b, { srgb = false } = {}) {
    const data = new Uint8Array([r & 255, g & 255, b & 255, 255]);
    const tex = new THREE.DataTexture(data, 1, 1);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    applyTextureColorSpace(tex, { srgb: !!srgb });
    return tex;
}

const FALLBACK_ALBEDO_SRGB = createSolidDataTexture(255, 255, 255, { srgb: true });
const FALLBACK_NORMAL = createSolidDataTexture(128, 128, 255, { srgb: false });
const FALLBACK_ORM = createSolidDataTexture(255, 255, 255, { srgb: false });

function normalizeSeed(value) {
    if (value?.isVector2) return value.clone();
    if (Array.isArray(value) && value.length >= 2) return new THREE.Vector2(Number(value[0]) || 0, Number(value[1]) || 0);
    if (value && typeof value === 'object') return new THREE.Vector2(Number(value.x) || 0, Number(value.y) || 0);
    const n = Number(value);
    if (Number.isFinite(n)) return new THREE.Vector2(n * 0.17, n * 0.71);
    return new THREE.Vector2(0, 0);
}

function normalizeLayer(src = null) {
    const s = src && typeof src === 'object' ? src : {};
    const enabled = s.enabled !== false;
    const coverage = clamp(s.coverage, 0.0, 1.0, 0.0);
    const blendWidth = clamp(s.blendWidth, 0.0, 0.49, 0.12);
    const noiseScale = clamp(s.noiseScale, 0.0001, 5.0, 0.06);
    const detailScale = clamp(s.detailScale, 0.0001, 50.0, noiseScale * 4.0);
    const detailStrength = clamp(s.detailStrength, 0.0, 1.0, 0.25);

    const map = s.map?.isTexture ? s.map : FALLBACK_ALBEDO_SRGB;
    const normalMap = s.normalMap?.isTexture ? s.normalMap : FALLBACK_NORMAL;
    const roughnessMap = s.roughnessMap?.isTexture ? s.roughnessMap : FALLBACK_ORM;
    const uvScale = s.uvScale?.isVector2
        ? s.uvScale.clone()
        : (Array.isArray(s.uvScale) && s.uvScale.length >= 2)
            ? new THREE.Vector2(Number(s.uvScale[0]) || 1, Number(s.uvScale[1]) || 1)
            : (s.uvScale && typeof s.uvScale === 'object')
                ? new THREE.Vector2(Number(s.uvScale.x) || 1, Number(s.uvScale.y) || 1)
                : new THREE.Vector2(1, 1);

    return {
        enabled,
        coverage,
        blendWidth,
        noiseScale,
        detailScale,
        detailStrength,
        map,
        normalMap,
        roughnessMap,
        uvScale
    };
}

function buildGroundSubstrateBlendConfig(input) {
    const src = input && typeof input === 'object' ? input : {};
    const enabled = src.enabled === true;
    const seed = normalizeSeed(src.seed);
    const layer1 = normalizeLayer(src.layer1);
    const layer2 = normalizeLayer(src.layer2);

    return {
        enabled,
        seed,
        layer1,
        layer2,
        uniforms: {
            enabled: enabled ? 1.0 : 0.0,
            seed,
            layer1: new THREE.Vector4(layer1.enabled ? 1.0 : 0.0, layer1.coverage, layer1.blendWidth, layer1.noiseScale),
            layer1B: new THREE.Vector4(layer1.detailScale, layer1.detailStrength, 0.0, 0.0),
            layer1Uv: layer1.uvScale,
            layer2: new THREE.Vector4(layer2.enabled ? 1.0 : 0.0, layer2.coverage, layer2.blendWidth, layer2.noiseScale),
            layer2B: new THREE.Vector4(layer2.detailScale, layer2.detailStrength, 0.0, 0.0),
            layer2Uv: layer2.uvScale
        },
        textures: {
            map1: layer1.map,
            normal1: layer1.normalMap,
            rough1: layer1.roughnessMap,
            map2: layer2.map,
            normal2: layer2.normalMap,
            rough2: layer2.roughnessMap
        },
        shaderUniforms: null
    };
}

function injectGroundSubstrateBlendShader(material, shader) {
    const cfg = material?.userData?.groundSubstrateBlendConfig ?? null;
    if (!cfg) return;

    shader.uniforms.uGdSubEnabled = { value: cfg.uniforms.enabled };
    shader.uniforms.uGdSubSeed = { value: cfg.uniforms.seed };

    shader.uniforms.uGdSubLayer1 = { value: cfg.uniforms.layer1 };
    shader.uniforms.uGdSubLayer1B = { value: cfg.uniforms.layer1B };
    shader.uniforms.uGdSubLayer1Uv = { value: cfg.uniforms.layer1Uv };
    shader.uniforms.uGdSubMap1 = { value: cfg.textures.map1 };
    shader.uniforms.uGdSubNormal1 = { value: cfg.textures.normal1 };
    shader.uniforms.uGdSubRough1 = { value: cfg.textures.rough1 };

    shader.uniforms.uGdSubLayer2 = { value: cfg.uniforms.layer2 };
    shader.uniforms.uGdSubLayer2B = { value: cfg.uniforms.layer2B };
    shader.uniforms.uGdSubLayer2Uv = { value: cfg.uniforms.layer2Uv };
    shader.uniforms.uGdSubMap2 = { value: cfg.textures.map2 };
    shader.uniforms.uGdSubNormal2 = { value: cfg.textures.normal2 };
    shader.uniforms.uGdSubRough2 = { value: cfg.textures.rough2 };

    shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        [
            '#include <common>',
            '#ifdef USE_GROUND_SUBSTRATE_BLEND',
            'varying vec3 vGdSubWorldPos;',
            '#endif'
        ].join('\n')
    );

    shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        [
            '#include <worldpos_vertex>',
            '#ifdef USE_GROUND_SUBSTRATE_BLEND',
            'vGdSubWorldPos = worldPosition.xyz;',
            '#endif'
        ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        [
            '#include <common>',
            '#ifdef USE_GROUND_SUBSTRATE_BLEND',
            'varying vec3 vGdSubWorldPos;',
            'uniform float uGdSubEnabled;',
            'uniform vec2 uGdSubSeed;',
            'uniform vec4 uGdSubLayer1;',
            'uniform vec4 uGdSubLayer1B;',
            'uniform vec2 uGdSubLayer1Uv;',
            'uniform sampler2D uGdSubMap1;',
            'uniform sampler2D uGdSubNormal1;',
            'uniform sampler2D uGdSubRough1;',
            'uniform vec4 uGdSubLayer2;',
            'uniform vec4 uGdSubLayer2B;',
            'uniform vec2 uGdSubLayer2Uv;',
            'uniform sampler2D uGdSubMap2;',
            'uniform sampler2D uGdSubNormal2;',
            'uniform sampler2D uGdSubRough2;',
            'vec3 gdSubWeights = vec3(1.0, 0.0, 0.0);',
            'float gdSubHash12(vec2 p){',
            'vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
            'p3 += dot(p3, p3.yzx + 33.33);',
            'return fract((p3.x + p3.y) * p3.z);',
            '}',
            'float gdSubNoise(vec2 p){',
            'vec2 i = floor(p);',
            'vec2 f = fract(p);',
            'float a = gdSubHash12(i);',
            'float b = gdSubHash12(i + vec2(1.0, 0.0));',
            'float c = gdSubHash12(i + vec2(0.0, 1.0));',
            'float d = gdSubHash12(i + vec2(1.0, 1.0));',
            'vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);',
            'return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;',
            '}',
            'float gdSubFbm(vec2 p){',
            'mat2 r = mat2(0.80, -0.60, 0.60, 0.80);',
            'float v = 0.0;',
            'float a = 0.5;',
            'v += a * gdSubNoise(p);',
            'p = r * p * 2.02 + vec2(17.3, 9.2);',
            'a *= 0.5;',
            'v += a * gdSubNoise(p);',
            'p = r * p * 2.03 + vec2(11.7, 23.1);',
            'a *= 0.5;',
            'v += a * gdSubNoise(p);',
            'return v;',
            '}',
            'float gdSubMask(vec2 worldXZ, vec4 layer, vec4 layerB, vec2 seed){',
            'float en = step(0.5, layer.x) * step(0.5, uGdSubEnabled);',
            'if (en < 0.5) return 0.0;',
            'float cov = clamp(layer.y, 0.0, 1.0);',
            'float t = 1.0 - cov;',
            'float bw = clamp(layer.z, 0.0, 0.49);',
            'float s0 = max(1e-4, layer.w);',
            'float s1 = max(1e-4, layerB.x);',
            'float k = clamp(layerB.y, 0.0, 1.0);',
            'float n0 = gdSubFbm(worldXZ * s0 + seed);',
            'float n1 = gdSubFbm(worldXZ * s1 + seed * 1.73 + vec2(19.2, 7.1));',
            'float n = clamp(n0 + (n1 - 0.5) * k, 0.0, 1.0);',
            'float aa = fwidth(n) * 1.25;',
            'float w = bw + aa;',
            'return smoothstep(t - w, t + w, n);',
            '}',
            'vec4 gdSubSampleNormal(sampler2D baseTex, vec2 baseUv, vec2 uv0){',
            'vec3 w = gdSubWeights;',
            'vec3 n0 = texture2D(baseTex, baseUv).xyz * 2.0 - 1.0;',
            'vec3 n = n0 * w.x;',
            'if (w.y > 1e-6) {',
            'vec2 uv1 = uv0 * uGdSubLayer1Uv;',
            'vec3 n1 = texture2D(uGdSubNormal1, uv1).xyz * 2.0 - 1.0;',
            'n += n1 * w.y;',
            '}',
            'if (w.z > 1e-6) {',
            'vec2 uv2 = uv0 * uGdSubLayer2Uv;',
            'vec3 n2 = texture2D(uGdSubNormal2, uv2).xyz * 2.0 - 1.0;',
            'n += n2 * w.z;',
            '}',
            'n = normalize(n);',
            'return vec4(n * 0.5 + 0.5, 1.0);',
            '}',
            '#endif'
        ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        [
            '#include <map_fragment>',
            '#ifdef USE_GROUND_SUBSTRATE_BLEND',
            'gdSubWeights = vec3(1.0, 0.0, 0.0);',
            'if (uGdSubEnabled > 0.5) {',
            'vec2 wp = vGdSubWorldPos.xz;',
            'float m1 = gdSubMask(wp, uGdSubLayer1, uGdSubLayer1B, uGdSubSeed + vec2(0.0, 0.0));',
            'float m2 = gdSubMask(wp, uGdSubLayer2, uGdSubLayer2B, uGdSubSeed + vec2(37.2, 11.7));',
            'float w2 = clamp(m2, 0.0, 1.0);',
            'float w1 = clamp(m1, 0.0, 1.0) * (1.0 - w2);',
            'float w0 = clamp(1.0 - w1 - w2, 0.0, 1.0);',
            'gdSubWeights = vec3(w0, w1, w2);',
            '#if defined(USE_MAP) && defined(USE_UV)',
            'if (w1 + w2 > 1e-6) {',
            'vec2 uv0 = vUv;',
            'vec4 t1 = texture2D(uGdSubMap1, uv0 * uGdSubLayer1Uv);',
            'vec4 t2 = texture2D(uGdSubMap2, uv0 * uGdSubLayer2Uv);',
            'vec3 c0 = diffuseColor.rgb;',
            'vec3 c1 = diffuse * mapTexelToLinear(t1).rgb;',
            'vec3 c2 = diffuse * mapTexelToLinear(t2).rgb;',
            'diffuseColor.rgb = c0 * w0 + c1 * w1 + c2 * w2;',
            '}',
            '#endif',
            '}',
            '#endif'
        ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        [
            '#include <roughnessmap_fragment>',
            '#ifdef USE_GROUND_SUBSTRATE_BLEND',
            'vec3 wR = gdSubWeights;',
            'if (uGdSubEnabled > 0.5 && (wR.y + wR.z) > 1e-6) {',
            '#ifdef USE_UV',
            'vec2 uv0 = vUv;',
            'float r0 = roughnessFactor;',
            'float r1 = roughness * texture2D(uGdSubRough1, uv0 * uGdSubLayer1Uv).g;',
            'float r2 = roughness * texture2D(uGdSubRough2, uv0 * uGdSubLayer2Uv).g;',
            'roughnessFactor = clamp(r0 * wR.x + r1 * wR.y + r2 * wR.z, 0.0, 1.0);',
            '#endif',
            '}',
            '#endif'
        ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        /(texture2D|texture)\s*\(\s*normalMap\s*,\s*vNormalMapUv\s*\)/g,
        'gdSubSampleNormal( normalMap, vNormalMapUv, vUv )'
    );

    cfg.shaderUniforms = shader.uniforms;
}

function ensureGroundSubstrateBlendConfigOnMaterial(material, config) {
    const mat = material;
    mat.userData = mat.userData ?? {};
    mat.userData.groundSubstrateBlendConfig = config;
    mat.extensions = mat.extensions ?? {};
    mat.extensions.derivatives = true;

    mat.defines = mat.defines ?? {};
    mat.defines.USE_GROUND_SUBSTRATE_BLEND = 1;

    const prevCacheKey = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => {
        const prev = prevCacheKey ? prevCacheKey() : '';
        return `${prev}|gdsub:${GROUND_SUBSTRATE_BLEND_SHADER_VERSION}`;
    };

    const prevOnBeforeCompile = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile.bind(mat) : null;
    mat.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);
        injectGroundSubstrateBlendShader(mat, shader);
    };
}

export function applyGroundSubstrateBlendToMeshStandardMaterial(material, options = {}) {
    if (!material?.isMeshStandardMaterial) return material;

    const alreadyApplied = !!material.userData?.groundSubstrateBlendConfig;
    const cfg = buildGroundSubstrateBlendConfig(options);

    ensureGroundSubstrateBlendConfigOnMaterial(material, cfg);
    if (!alreadyApplied) material.needsUpdate = true;
    return material;
}

export function updateGroundSubstrateBlendOnMeshStandardMaterial(material, options = {}) {
    if (!material?.isMeshStandardMaterial) return;

    const src = options && typeof options === 'object' ? options : {};
    const cfg = material.userData?.groundSubstrateBlendConfig ?? null;
    if (!cfg) {
        const wants = Object.values(src).some((v) => v !== null && v !== undefined);
        if (wants) applyGroundSubstrateBlendToMeshStandardMaterial(material, src);
        return;
    }

    const nextEnabled = src.enabled;
    if (nextEnabled !== null && nextEnabled !== undefined) {
        cfg.enabled = !!nextEnabled;
        cfg.uniforms.enabled = cfg.enabled ? 1.0 : 0.0;
    }

    if (src.seed !== null && src.seed !== undefined) {
        cfg.seed = normalizeSeed(src.seed);
        cfg.uniforms.seed = cfg.seed;
    }

    if (src.layer1 !== null && src.layer1 !== undefined) {
        cfg.layer1 = normalizeLayer(src.layer1);
        cfg.uniforms.layer1.set(cfg.layer1.enabled ? 1.0 : 0.0, cfg.layer1.coverage, cfg.layer1.blendWidth, cfg.layer1.noiseScale);
        cfg.uniforms.layer1B.set(cfg.layer1.detailScale, cfg.layer1.detailStrength, 0.0, 0.0);
        cfg.uniforms.layer1Uv.copy(cfg.layer1.uvScale);
        cfg.textures.map1 = cfg.layer1.map;
        cfg.textures.normal1 = cfg.layer1.normalMap;
        cfg.textures.rough1 = cfg.layer1.roughnessMap;
    }

    if (src.layer2 !== null && src.layer2 !== undefined) {
        cfg.layer2 = normalizeLayer(src.layer2);
        cfg.uniforms.layer2.set(cfg.layer2.enabled ? 1.0 : 0.0, cfg.layer2.coverage, cfg.layer2.blendWidth, cfg.layer2.noiseScale);
        cfg.uniforms.layer2B.set(cfg.layer2.detailScale, cfg.layer2.detailStrength, 0.0, 0.0);
        cfg.uniforms.layer2Uv.copy(cfg.layer2.uvScale);
        cfg.textures.map2 = cfg.layer2.map;
        cfg.textures.normal2 = cfg.layer2.normalMap;
        cfg.textures.rough2 = cfg.layer2.roughnessMap;
    }

    const u = cfg.shaderUniforms;
    if (u?.uGdSubEnabled) u.uGdSubEnabled.value = cfg.uniforms.enabled;
    if (u?.uGdSubSeed?.value) u.uGdSubSeed.value = cfg.uniforms.seed;

    if (u?.uGdSubLayer1?.value) u.uGdSubLayer1.value = cfg.uniforms.layer1;
    if (u?.uGdSubLayer1B?.value) u.uGdSubLayer1B.value = cfg.uniforms.layer1B;
    if (u?.uGdSubLayer1Uv?.value) u.uGdSubLayer1Uv.value = cfg.uniforms.layer1Uv;
    if (u?.uGdSubMap1) u.uGdSubMap1.value = cfg.textures.map1;
    if (u?.uGdSubNormal1) u.uGdSubNormal1.value = cfg.textures.normal1;
    if (u?.uGdSubRough1) u.uGdSubRough1.value = cfg.textures.rough1;

    if (u?.uGdSubLayer2?.value) u.uGdSubLayer2.value = cfg.uniforms.layer2;
    if (u?.uGdSubLayer2B?.value) u.uGdSubLayer2B.value = cfg.uniforms.layer2B;
    if (u?.uGdSubLayer2Uv?.value) u.uGdSubLayer2Uv.value = cfg.uniforms.layer2Uv;
    if (u?.uGdSubMap2) u.uGdSubMap2.value = cfg.textures.map2;
    if (u?.uGdSubNormal2) u.uGdSubNormal2.value = cfg.textures.normal2;
    if (u?.uGdSubRough2) u.uGdSubRough2.value = cfg.textures.rough2;
}

export function computeUvScaleForGroundSize({ groundSizeX, groundSizeZ, tileMeters } = {}) {
    const sx = Math.max(EPS, Number(groundSizeX) || 1);
    const sz = Math.max(EPS, Number(groundSizeZ) || 1);
    const tm = Math.max(EPS, Number(tileMeters) || 4);
    return new THREE.Vector2(sx / tm, sz / tm);
}
