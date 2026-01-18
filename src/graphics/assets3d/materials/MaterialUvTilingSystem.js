// src/graphics/assets3d/materials/MaterialUvTilingSystem.js
// Scales MeshStandardMaterial UV varyings via shader injection for per-material tiling overrides.
import * as THREE from 'three';

const UV_TILING_SHADER_VERSION = 2;

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function normalizeScale(value) {
    return clamp(value, 0.001, 1000.0);
}

function normalizeOffset(value) {
    return clamp(value, -1000.0, 1000.0);
}

function normalizeRotationDegrees(value) {
    return clamp(value, -180.0, 180.0);
}

function injectUvTilingShader(material, shader) {
    const cfg = material.userData?.uvTilingConfig ?? null;
    shader.uniforms.uUvTiling = { value: cfg?.tiling ?? new THREE.Vector2(1, 1) };
    shader.uniforms.uUvOffset = { value: cfg?.offset ?? new THREE.Vector2(0, 0) };
    shader.uniforms.uUvRotation = { value: cfg?.rotation ?? 0.0 };

    shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        [
            '#include <common>',
            '#ifdef USE_UV_TILING',
            'uniform vec2 uUvTiling;',
            'uniform vec2 uUvOffset;',
            'uniform float uUvRotation;',
            'vec2 uvTilingTransform(vec2 uv){',
            'uv *= uUvTiling;',
            'if (abs(uUvRotation) > 1e-6) {',
            'float c = cos(uUvRotation);',
            'float s = sin(uUvRotation);',
            'uv = mat2(c, -s, s, c) * uv;',
            '}',
            'return uv + uUvOffset;',
            '}',
            '#endif'
        ].join('\n')
    );

    shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        [
            '#include <uv_vertex>',
            '#ifdef USE_UV_TILING',
            '#ifdef USE_MAP',
            'vMapUv = uvTilingTransform(vMapUv);',
            '#endif',
            '#ifdef USE_NORMALMAP',
            'vNormalMapUv = uvTilingTransform(vNormalMapUv);',
            '#endif',
            '#ifdef USE_ROUGHNESSMAP',
            'vRoughnessMapUv = uvTilingTransform(vRoughnessMapUv);',
            '#endif',
            '#ifdef USE_METALNESSMAP',
            'vMetalnessMapUv = uvTilingTransform(vMetalnessMapUv);',
            '#endif',
            '#ifdef USE_EMISSIVEMAP',
            'vEmissiveMapUv = uvTilingTransform(vEmissiveMapUv);',
            '#endif',
            '#ifdef USE_AOMAP',
            'vAoMapUv = uvTilingTransform(vAoMapUv);',
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

export function applyUvTilingToMeshStandardMaterial(
    material,
    { scale = 1.0, scaleU = null, scaleV = null, offsetU = 0.0, offsetV = 0.0, rotationDegrees = 0.0 } = {}
) {
    if (!material?.isMeshStandardMaterial) return material;

    const su = normalizeScale(scaleU ?? scale);
    const sv = normalizeScale(scaleV ?? scale);
    const tiling = new THREE.Vector2(su, sv);
    const offset = new THREE.Vector2(normalizeOffset(offsetU), normalizeOffset(offsetV));
    const rotation = normalizeRotationDegrees(rotationDegrees) * (Math.PI / 180);

    const cfg = {
        tiling,
        offset,
        rotation,
        shaderUniforms: null
    };

    ensureUvTilingConfigOnMaterial(material, cfg);
    material.needsUpdate = true;
    return material;
}

export function updateUvTilingOnMeshStandardMaterial(material, { scale = null, scaleU = null, scaleV = null, offsetU = null, offsetV = null, rotationDegrees = null } = {}) {
    if (!material?.isMeshStandardMaterial) return;

    const cfg = material.userData?.uvTilingConfig ?? null;
    if (!cfg) {
        if (
            scale !== null || scaleU !== null || scaleV !== null || offsetU !== null || offsetV !== null || rotationDegrees !== null
        ) {
            applyUvTilingToMeshStandardMaterial(material, {
                scale: scale ?? 1.0,
                scaleU: scaleU ?? undefined,
                scaleV: scaleV ?? undefined,
                offsetU: offsetU ?? undefined,
                offsetV: offsetV ?? undefined,
                rotationDegrees: rotationDegrees ?? undefined
            });
        }
        return;
    }

    const hasScale = scale !== null && scale !== undefined;
    const hasScaleU = scaleU !== null && scaleU !== undefined;
    const hasScaleV = scaleV !== null && scaleV !== undefined;
    if (hasScale || hasScaleU || hasScaleV) {
        const nextU = normalizeScale(hasScaleU ? scaleU : (hasScale ? scale : cfg.tiling.x));
        const nextV = normalizeScale(hasScaleV ? scaleV : (hasScale ? scale : cfg.tiling.y));
        cfg.tiling.set(nextU, nextV);
    }
    if (offsetU !== null && offsetU !== undefined) cfg.offset.x = normalizeOffset(offsetU);
    if (offsetV !== null && offsetV !== undefined) cfg.offset.y = normalizeOffset(offsetV);
    if (rotationDegrees !== null && rotationDegrees !== undefined) cfg.rotation = normalizeRotationDegrees(rotationDegrees) * (Math.PI / 180);

    const shaderUniforms = cfg.shaderUniforms;
    if (shaderUniforms?.uUvTiling?.value) shaderUniforms.uUvTiling.value = cfg.tiling;
    if (shaderUniforms?.uUvOffset?.value) shaderUniforms.uUvOffset.value = cfg.offset;
    if (shaderUniforms?.uUvRotation) shaderUniforms.uUvRotation.value = cfg.rotation;
}
