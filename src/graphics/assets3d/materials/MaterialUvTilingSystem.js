// src/graphics/assets3d/materials/MaterialUvTilingSystem.js
// Scales MeshStandardMaterial UV varyings via shader injection for per-material tiling overrides.
import * as THREE from 'three';

const UV_TILING_SHADER_VERSION = 1;

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function normalizeScale(value) {
    return clamp(value, 0.001, 1000.0);
}

function injectUvTilingShader(material, shader) {
    shader.uniforms.uUvTiling = { value: material.userData?.uvTilingConfig?.tiling ?? new THREE.Vector2(1, 1) };

    shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        [
            '#include <common>',
            '#ifdef USE_UV_TILING',
            'uniform vec2 uUvTiling;',
            '#endif'
        ].join('\n')
    );

    shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        [
            '#include <uv_vertex>',
            '#ifdef USE_UV_TILING',
            '#ifdef USE_MAP',
            'vMapUv *= uUvTiling;',
            '#endif',
            '#ifdef USE_NORMALMAP',
            'vNormalMapUv *= uUvTiling;',
            '#endif',
            '#ifdef USE_ROUGHNESSMAP',
            'vRoughnessMapUv *= uUvTiling;',
            '#endif',
            '#ifdef USE_METALNESSMAP',
            'vMetalnessMapUv *= uUvTiling;',
            '#endif',
            '#ifdef USE_EMISSIVEMAP',
            'vEmissiveMapUv *= uUvTiling;',
            '#endif',
            '#ifdef USE_AOMAP',
            'vAoMapUv *= uUvTiling;',
            '#endif',
            '#endif'
        ].join('\n')
    );
}

function ensureUvTilingConfigOnMaterial(material, config) {
    const mat = material;
    mat.userData = mat.userData ?? {};
    mat.userData.uvTilingConfig = config;

    mat.defines = mat.defines ?? {};
    mat.defines.USE_UV_TILING = 1;

    const prevCacheKey = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => {
        const prev = prevCacheKey ? prevCacheKey() : '';
        return `${prev}|uvtiling:${UV_TILING_SHADER_VERSION}`;
    };

    const prevOnBeforeCompile = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile.bind(mat) : null;
    mat.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);
        injectUvTilingShader(mat, shader);
        mat.userData.uvTilingConfig.shaderUniforms = shader.uniforms;
    };
}

export function applyUvTilingToMeshStandardMaterial(material, { scale = 1.0 } = {}) {
    if (!material?.isMeshStandardMaterial) return material;

    const s = normalizeScale(scale);
    const tiling = new THREE.Vector2(s, s);

    const cfg = {
        tiling,
        shaderUniforms: null
    };

    ensureUvTilingConfigOnMaterial(material, cfg);
    material.needsUpdate = true;
    return material;
}

export function updateUvTilingOnMeshStandardMaterial(material, { scale = null } = {}) {
    if (!material?.isMeshStandardMaterial) return;

    const cfg = material.userData?.uvTilingConfig ?? null;
    if (!cfg) {
        if (scale !== null && scale !== undefined) applyUvTilingToMeshStandardMaterial(material, { scale });
        return;
    }

    if (scale !== null && scale !== undefined) {
        const s = normalizeScale(scale);
        cfg.tiling.set(s, s);
    }

    const shaderUniforms = cfg.shaderUniforms;
    if (shaderUniforms?.uUvTiling?.value) shaderUniforms.uUvTiling.value = cfg.tiling;
    material.needsUpdate = true;
}

