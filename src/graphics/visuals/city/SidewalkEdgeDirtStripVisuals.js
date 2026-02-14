// src/graphics/visuals/city/SidewalkEdgeDirtStripVisuals.js
// Applies sidewalk grass-edge dirt-strip shading to MeshStandardMaterial.
// @ts-check

import * as THREE from 'three';
import { sanitizeAsphaltNoiseSettings } from './AsphaltNoiseSettings.js';

const SIDEWALK_EDGE_DIRT_STRIP_SHADER_VERSION = 1;

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function toColorHex(value, fallback = 0x4d473c) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return (Math.trunc(n) >>> 0) & 0xffffff;
}

function buildSidewalkEdgeDirtStripConfig(asphaltNoise) {
    const settings = sanitizeAsphaltNoiseSettings(asphaltNoise);
    const strip = settings?.livedIn?.sidewalkGrassEdgeStrip ?? null;
    const enabled = strip?.enabled !== false;
    return {
        enabled,
        width: clamp(strip?.width, 0.0, 4.0, 0.65),
        opacity: enabled ? clamp(strip?.opacity, 0.0, 1.0, 0.45) : 0.0,
        roughness: clamp(strip?.roughness, 0.0, 1.0, 1.0),
        metalness: clamp(strip?.metalness, 0.0, 1.0, 0.0),
        colorHex: toColorHex(strip?.colorHex, 0x4d473c),
        fadePower: clamp(strip?.fadePower, 0.25, 8.0, 1.6),
        shaderUniforms: null
    };
}

function injectSidewalkEdgeDirtStripShader(material, shader) {
    const cfg = material.userData?.sidewalkEdgeDirtStripConfig ?? null;
    if (!cfg) return;

    shader.uniforms.uSidewalkEdgeDirtStripFadePower = { value: cfg.fadePower };

    if (!shader.vertexShader.includes('varying vec2 vSidewalkEdgeDirtStripUv;')) {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            '#include <common>\nvarying vec2 vSidewalkEdgeDirtStripUv;'
        );
    }
    if (!shader.vertexShader.includes('vSidewalkEdgeDirtStripUv = vUv;')) {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <uv_vertex>',
            '#include <uv_vertex>\nvSidewalkEdgeDirtStripUv = vUv;'
        );
    }

    if (!shader.fragmentShader.includes('uniform float uSidewalkEdgeDirtStripFadePower;')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            [
                '#include <common>',
                '#ifdef USE_SIDEWALK_EDGE_DIRT_STRIP',
                'uniform float uSidewalkEdgeDirtStripFadePower;',
                'varying vec2 vSidewalkEdgeDirtStripUv;',
                '#endif'
            ].join('\n')
        );
    }

    if (!shader.fragmentShader.includes('sidewalkEdgeDirtStripFade')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            'vec4 diffuseColor = vec4( diffuse, opacity );',
            [
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                '#ifdef USE_SIDEWALK_EDGE_DIRT_STRIP',
                'float sidewalkEdgeDirtStripFade = pow(clamp(1.0 - vSidewalkEdgeDirtStripUv.y, 0.0, 1.0), max(0.01, uSidewalkEdgeDirtStripFadePower));',
                'diffuseColor.a *= sidewalkEdgeDirtStripFade;',
                '#endif'
            ].join('\n')
        );
    }

    cfg.shaderUniforms = shader.uniforms;
}

function ensureConfigOnMaterial(material, config) {
    const mat = material;
    mat.userData = mat.userData ?? {};
    const existing = mat.userData.sidewalkEdgeDirtStripConfig ?? null;
    const cfg = existing && typeof existing === 'object' ? existing : config;

    cfg.enabled = config.enabled;
    cfg.width = config.width;
    cfg.opacity = config.opacity;
    cfg.roughness = config.roughness;
    cfg.metalness = config.metalness;
    cfg.colorHex = config.colorHex;
    cfg.fadePower = config.fadePower;
    mat.userData.sidewalkEdgeDirtStripConfig = cfg;

    const uniforms = cfg.shaderUniforms ?? null;
    if (uniforms?.uSidewalkEdgeDirtStripFadePower) uniforms.uSidewalkEdgeDirtStripFadePower.value = cfg.fadePower;

    mat.color?.setHex?.(cfg.colorHex);
    mat.roughness = cfg.roughness;
    mat.metalness = cfg.metalness;
    mat.transparent = true;
    mat.opacity = cfg.opacity;
    mat.depthWrite = false;
    mat.blending = THREE.NormalBlending;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = mat.polygonOffsetFactor ?? 0;
    mat.polygonOffsetUnits = mat.polygonOffsetUnits ?? -3;

    mat.defines = mat.defines ?? {};
    mat.defines.USE_SIDEWALK_EDGE_DIRT_STRIP = 1;
    mat.defines.USE_UV = 1;

    if (mat.userData.sidewalkEdgeDirtStripInjected === true) return;

    const prevCacheKey = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => {
        const prev = prevCacheKey ? prevCacheKey() : '';
        return `${prev}|sidewalkEdgeDirtStrip:${SIDEWALK_EDGE_DIRT_STRIP_SHADER_VERSION}`;
    };

    const prevOnBeforeCompile = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile.bind(mat) : null;
    mat.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);
        injectSidewalkEdgeDirtStripShader(mat, shader);
    };
    mat.userData.sidewalkEdgeDirtStripInjected = true;
}

export function getSidewalkEdgeDirtStripConfig(asphaltNoise) {
    return buildSidewalkEdgeDirtStripConfig(asphaltNoise);
}

export function applySidewalkEdgeDirtStripVisualsToMeshStandardMaterial(material, { asphaltNoise } = {}) {
    if (!material?.isMeshStandardMaterial) return material;
    const cfg = buildSidewalkEdgeDirtStripConfig(asphaltNoise);
    const wasInjected = material.userData?.sidewalkEdgeDirtStripInjected === true;
    ensureConfigOnMaterial(material, cfg);
    if (!wasInjected) material.needsUpdate = true;
    return material;
}
