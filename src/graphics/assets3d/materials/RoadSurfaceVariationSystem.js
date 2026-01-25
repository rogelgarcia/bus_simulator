// src/graphics/assets3d/materials/RoadSurfaceVariationSystem.js
// Adds subtle world-space color/roughness variation to MeshStandardMaterial via shader injection.
import * as THREE from 'three';

const ROAD_SURFACE_VARIATION_SHADER_VERSION = 2;

function clampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function normalizeSeed(seed) {
    if (seed?.isVector2) return seed.clone();
    if (Array.isArray(seed) && seed.length >= 2) return new THREE.Vector2(Number(seed[0]) || 0, Number(seed[1]) || 0);
    if (seed && typeof seed === 'object') return new THREE.Vector2(Number(seed.x) || 0, Number(seed.y) || 0);
    return new THREE.Vector2(0, 0);
}

function buildRoadSurfaceVariationConfig(input) {
    const src = input && typeof input === 'object' ? input : {};
    const coarseSrc = src.coarse && typeof src.coarse === 'object' ? src.coarse : null;
    const fineSrc = src.fine && typeof src.fine === 'object' ? src.fine : null;

    const coarse = {
        scale: clampNumber(coarseSrc?.scale ?? src.coarseScale ?? src.scale ?? 0.2, 0.001, 10.0),
        colorStrength: clampNumber(coarseSrc?.colorStrength ?? src.coarseColorStrength ?? src.colorStrength ?? 0.06, 0.0, 0.5),
        dirtyStrength: clampNumber(coarseSrc?.dirtyStrength ?? src.coarseDirtyStrength ?? src.dirtyStrength ?? 0.0, 0.0, 1.0),
        roughnessStrength: clampNumber(coarseSrc?.roughnessStrength ?? src.coarseRoughnessStrength ?? src.roughnessStrength ?? 0.12, 0.0, 0.5)
    };

    const fine = {
        scale: clampNumber(fineSrc?.scale ?? src.fineScale ?? 1.6, 0.001, 100.0),
        colorStrength: clampNumber(fineSrc?.colorStrength ?? src.fineColorStrength ?? 0.0, 0.0, 0.5),
        dirtyStrength: clampNumber(fineSrc?.dirtyStrength ?? src.fineDirtyStrength ?? 0.0, 0.0, 1.0),
        roughnessStrength: clampNumber(fineSrc?.roughnessStrength ?? src.fineRoughnessStrength ?? 0.0, 0.0, 0.5)
    };

    return { coarse, fine, seed: normalizeSeed(src.seed), shaderUniforms: null };
}

function ensureLayeredRoadSurfaceVariationConfig(cfg) {
    const src = cfg && typeof cfg === 'object' ? cfg : null;
    if (!src) return null;
    if (src.coarse && src.fine) return src;

    const migrated = buildRoadSurfaceVariationConfig(src);
    src.coarse = migrated.coarse;
    src.fine = migrated.fine;
    src.seed = migrated.seed;
    if (!Object.prototype.hasOwnProperty.call(src, 'shaderUniforms')) src.shaderUniforms = null;
    return src;
}

function injectRoadSurfaceVariationShader(material, shader) {
    const cfg = material.userData?.roadSurfaceVariationConfig ?? null;
    if (!cfg) return;

    const layered = ensureLayeredRoadSurfaceVariationConfig(cfg);
    if (!layered) return;

    shader.uniforms.uRoadSurfaceVarCoarseScale = { value: layered.coarse.scale };
    shader.uniforms.uRoadSurfaceVarCoarseColorStrength = { value: layered.coarse.colorStrength };
    shader.uniforms.uRoadSurfaceVarCoarseDirtyStrength = { value: layered.coarse.dirtyStrength };
    shader.uniforms.uRoadSurfaceVarCoarseRoughnessStrength = { value: layered.coarse.roughnessStrength };
    shader.uniforms.uRoadSurfaceVarFineScale = { value: layered.fine.scale };
    shader.uniforms.uRoadSurfaceVarFineColorStrength = { value: layered.fine.colorStrength };
    shader.uniforms.uRoadSurfaceVarFineDirtyStrength = { value: layered.fine.dirtyStrength };
    shader.uniforms.uRoadSurfaceVarFineRoughnessStrength = { value: layered.fine.roughnessStrength };
    shader.uniforms.uRoadSurfaceVarSeed = { value: layered.seed };

    shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vRoadSurfaceVarWorldPos;'
    );
    shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvRoadSurfaceVarWorldPos = worldPosition.xyz;'
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        [
            '#include <common>',
            '#ifdef USE_ROAD_SURFACE_VARIATION',
            'uniform float uRoadSurfaceVarCoarseScale;',
            'uniform float uRoadSurfaceVarCoarseColorStrength;',
            'uniform float uRoadSurfaceVarCoarseDirtyStrength;',
            'uniform float uRoadSurfaceVarCoarseRoughnessStrength;',
            'uniform float uRoadSurfaceVarFineScale;',
            'uniform float uRoadSurfaceVarFineColorStrength;',
            'uniform float uRoadSurfaceVarFineDirtyStrength;',
            'uniform float uRoadSurfaceVarFineRoughnessStrength;',
            'uniform vec2 uRoadSurfaceVarSeed;',
            'varying vec3 vRoadSurfaceVarWorldPos;',
            'float roadSurfaceVarHash12(vec2 p){',
            'vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
            'p3 += dot(p3, p3.yzx + 33.33);',
            'return fract((p3.x + p3.y) * p3.z);',
            '}',
            'float roadSurfaceVarNoise(vec2 p){',
            'vec2 i = floor(p);',
            'vec2 f = fract(p);',
            'float a = roadSurfaceVarHash12(i);',
            'float b = roadSurfaceVarHash12(i + vec2(1.0, 0.0));',
            'float c = roadSurfaceVarHash12(i + vec2(0.0, 1.0));',
            'float d = roadSurfaceVarHash12(i + vec2(1.0, 1.0));',
            'vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);',
            'return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;',
            '}',
            'float roadSurfaceVarFbm(vec2 p){',
            'mat2 r = mat2(0.80, -0.60, 0.60, 0.80);',
            'float v = 0.0;',
            'float a = 0.5;',
            'v += a * roadSurfaceVarNoise(p);',
            'p = r * p * 2.02 + vec2(17.3, 9.2);',
            'a *= 0.5;',
            'v += a * roadSurfaceVarNoise(p);',
            'p = r * p * 2.03 + vec2(11.7, 23.1);',
            'a *= 0.5;',
            'v += a * roadSurfaceVarNoise(p);',
            'p = r * p * 2.01 + vec2(37.2, 5.9);',
            'a *= 0.5;',
            'v += a * roadSurfaceVarNoise(p);',
            'return v / 0.9375;',
            '}',
            'float roadSurfaceVarSignedPow(float n, float exp){',
            'float s = (n - 0.5) * 2.0;',
            'float a = pow(abs(s), exp);',
            'return sign(s) * a;',
            '}',
            '#endif'
        ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        [
            '#include <color_fragment>',
            '#ifdef USE_ROAD_SURFACE_VARIATION',
            'vec2 roadSurfaceVarPCoarse = (vRoadSurfaceVarWorldPos.xz + uRoadSurfaceVarSeed) * uRoadSurfaceVarCoarseScale;',
            'float roadSurfaceVarCoarse = roadSurfaceVarFbm(roadSurfaceVarPCoarse);',
            'float roadSurfaceVarCoarseSigned = roadSurfaceVarSignedPow(roadSurfaceVarCoarse, 1.55);',
            'vec2 roadSurfaceVarPFine = (vRoadSurfaceVarWorldPos.xz + uRoadSurfaceVarSeed * 1.9 + vec2(13.7, 7.3)) * uRoadSurfaceVarFineScale;',
            'float roadSurfaceVarFine0 = roadSurfaceVarNoise(roadSurfaceVarPFine);',
            'float roadSurfaceVarFine1 = roadSurfaceVarNoise(roadSurfaceVarPFine * 2.31 + vec2(17.1, 3.7));',
            'float roadSurfaceVarFine = roadSurfaceVarFine0 * 0.62 + roadSurfaceVarFine1 * 0.38;',
            'float roadSurfaceVarFineAA = clamp(1.0 - max(fwidth(roadSurfaceVarPFine.x), fwidth(roadSurfaceVarPFine.y)) * 1.6, 0.0, 1.0);',
            'roadSurfaceVarFine = mix(0.5, roadSurfaceVarFine, roadSurfaceVarFineAA);',
            'float roadSurfaceVarFineSigned = roadSurfaceVarSignedPow(roadSurfaceVarFine, 1.0) * roadSurfaceVarFineAA;',
            'float roadSurfaceVarAlbedoSigned = uRoadSurfaceVarCoarseColorStrength * roadSurfaceVarCoarseSigned + uRoadSurfaceVarFineColorStrength * roadSurfaceVarFineSigned;',
            'diffuseColor.rgb *= (1.0 + roadSurfaceVarAlbedoSigned);',
            'float roadSurfaceVarDirty = uRoadSurfaceVarCoarseDirtyStrength * roadSurfaceVarCoarse + uRoadSurfaceVarFineDirtyStrength * roadSurfaceVarFine * roadSurfaceVarFineAA;',
            'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.75, clamp(roadSurfaceVarDirty, 0.0, 1.0));',
            '#endif'
        ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        [
            '#include <roughnessmap_fragment>',
            '#ifdef USE_ROAD_SURFACE_VARIATION',
            'float roadSurfaceVarR = uRoadSurfaceVarCoarseRoughnessStrength * roadSurfaceVarCoarseSigned + uRoadSurfaceVarFineRoughnessStrength * roadSurfaceVarFineSigned;',
            'float roadSurfaceVarRoom = (roadSurfaceVarR > 0.0) ? (1.0 - roughnessFactor) : roughnessFactor;',
            'roughnessFactor = clamp(roughnessFactor + roadSurfaceVarR * roadSurfaceVarRoom, 0.0, 1.0);',
            '#endif'
        ].join('\n')
    );

    cfg.shaderUniforms = shader.uniforms;
}

function ensureRoadSurfaceVariationConfigOnMaterial(material, config) {
    const mat = material;
    mat.userData = mat.userData ?? {};
    mat.extensions = mat.extensions ?? {};
    mat.extensions.derivatives = true;

    const existing = mat.userData.roadSurfaceVariationConfig ?? null;
    if (existing) {
        const layered = ensureLayeredRoadSurfaceVariationConfig(existing) ?? existing;
        layered.coarse = config.coarse;
        layered.fine = config.fine;
        layered.seed = config.seed;

        const uniforms = layered.shaderUniforms;
        if (uniforms?.uRoadSurfaceVarCoarseScale) uniforms.uRoadSurfaceVarCoarseScale.value = layered.coarse.scale;
        if (uniforms?.uRoadSurfaceVarCoarseColorStrength) uniforms.uRoadSurfaceVarCoarseColorStrength.value = layered.coarse.colorStrength;
        if (uniforms?.uRoadSurfaceVarCoarseDirtyStrength) uniforms.uRoadSurfaceVarCoarseDirtyStrength.value = layered.coarse.dirtyStrength;
        if (uniforms?.uRoadSurfaceVarCoarseRoughnessStrength) uniforms.uRoadSurfaceVarCoarseRoughnessStrength.value = layered.coarse.roughnessStrength;
        if (uniforms?.uRoadSurfaceVarFineScale) uniforms.uRoadSurfaceVarFineScale.value = layered.fine.scale;
        if (uniforms?.uRoadSurfaceVarFineColorStrength) uniforms.uRoadSurfaceVarFineColorStrength.value = layered.fine.colorStrength;
        if (uniforms?.uRoadSurfaceVarFineDirtyStrength) uniforms.uRoadSurfaceVarFineDirtyStrength.value = layered.fine.dirtyStrength;
        if (uniforms?.uRoadSurfaceVarFineRoughnessStrength) uniforms.uRoadSurfaceVarFineRoughnessStrength.value = layered.fine.roughnessStrength;
        if (uniforms?.uRoadSurfaceVarSeed?.value) uniforms.uRoadSurfaceVarSeed.value = layered.seed;
        return;
    }

    mat.userData.roadSurfaceVariationConfig = config;

    mat.defines = mat.defines ?? {};
    mat.defines.USE_ROAD_SURFACE_VARIATION = 1;

    const prevCacheKey = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => {
        const prev = prevCacheKey ? prevCacheKey() : '';
        return `${prev}|roadsurfacevar:${ROAD_SURFACE_VARIATION_SHADER_VERSION}`;
    };

    const prevOnBeforeCompile = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile.bind(mat) : null;
    mat.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);
        injectRoadSurfaceVariationShader(mat, shader);
    };
}

export function applyRoadSurfaceVariationToMeshStandardMaterial(
    material,
    options = {}
) {
    if (!material?.isMeshStandardMaterial) return material;

    const alreadyApplied = !!material.userData?.roadSurfaceVariationConfig;
    const cfg = buildRoadSurfaceVariationConfig(options);

    ensureRoadSurfaceVariationConfigOnMaterial(material, cfg);
    if (!alreadyApplied) material.needsUpdate = true;
    return material;
}

export function updateRoadSurfaceVariationOnMeshStandardMaterial(
    material,
    options = {}
) {
    if (!material?.isMeshStandardMaterial) return;

    const src = options && typeof options === 'object' ? options : {};
    const cfg = material.userData?.roadSurfaceVariationConfig ?? null;
    if (!cfg) {
        const wants = Object.values(src).some((v) => v !== null && v !== undefined);
        if (wants) {
            applyRoadSurfaceVariationToMeshStandardMaterial(material, src);
        }
        return;
    }

    const layered = ensureLayeredRoadSurfaceVariationConfig(cfg) ?? cfg;

    const coarseSrc = src.coarse && typeof src.coarse === 'object' ? src.coarse : null;
    const fineSrc = src.fine && typeof src.fine === 'object' ? src.fine : null;

    const coarseScale = coarseSrc?.scale ?? src.coarseScale ?? src.scale;
    const coarseColor = coarseSrc?.colorStrength ?? src.coarseColorStrength ?? src.colorStrength;
    const coarseDirty = coarseSrc?.dirtyStrength ?? src.coarseDirtyStrength ?? src.dirtyStrength;
    const coarseRough = coarseSrc?.roughnessStrength ?? src.coarseRoughnessStrength ?? src.roughnessStrength;

    if (coarseScale !== null && coarseScale !== undefined) layered.coarse.scale = clampNumber(coarseScale, 0.001, 10.0);
    if (coarseColor !== null && coarseColor !== undefined) layered.coarse.colorStrength = clampNumber(coarseColor, 0.0, 0.5);
    if (coarseDirty !== null && coarseDirty !== undefined) layered.coarse.dirtyStrength = clampNumber(coarseDirty, 0.0, 1.0);
    if (coarseRough !== null && coarseRough !== undefined) layered.coarse.roughnessStrength = clampNumber(coarseRough, 0.0, 0.5);

    const fineScale = fineSrc?.scale ?? src.fineScale;
    const fineColor = fineSrc?.colorStrength ?? src.fineColorStrength;
    const fineDirty = fineSrc?.dirtyStrength ?? src.fineDirtyStrength;
    const fineRough = fineSrc?.roughnessStrength ?? src.fineRoughnessStrength;

    if (fineScale !== null && fineScale !== undefined) layered.fine.scale = clampNumber(fineScale, 0.001, 100.0);
    if (fineColor !== null && fineColor !== undefined) layered.fine.colorStrength = clampNumber(fineColor, 0.0, 0.5);
    if (fineDirty !== null && fineDirty !== undefined) layered.fine.dirtyStrength = clampNumber(fineDirty, 0.0, 1.0);
    if (fineRough !== null && fineRough !== undefined) layered.fine.roughnessStrength = clampNumber(fineRough, 0.0, 0.5);

    if (src.seed !== null && src.seed !== undefined) layered.seed = normalizeSeed(src.seed);

    const uniforms = layered.shaderUniforms;
    if (uniforms?.uRoadSurfaceVarCoarseScale) uniforms.uRoadSurfaceVarCoarseScale.value = layered.coarse.scale;
    if (uniforms?.uRoadSurfaceVarCoarseColorStrength) uniforms.uRoadSurfaceVarCoarseColorStrength.value = layered.coarse.colorStrength;
    if (uniforms?.uRoadSurfaceVarCoarseDirtyStrength) uniforms.uRoadSurfaceVarCoarseDirtyStrength.value = layered.coarse.dirtyStrength;
    if (uniforms?.uRoadSurfaceVarCoarseRoughnessStrength) uniforms.uRoadSurfaceVarCoarseRoughnessStrength.value = layered.coarse.roughnessStrength;
    if (uniforms?.uRoadSurfaceVarFineScale) uniforms.uRoadSurfaceVarFineScale.value = layered.fine.scale;
    if (uniforms?.uRoadSurfaceVarFineColorStrength) uniforms.uRoadSurfaceVarFineColorStrength.value = layered.fine.colorStrength;
    if (uniforms?.uRoadSurfaceVarFineDirtyStrength) uniforms.uRoadSurfaceVarFineDirtyStrength.value = layered.fine.dirtyStrength;
    if (uniforms?.uRoadSurfaceVarFineRoughnessStrength) uniforms.uRoadSurfaceVarFineRoughnessStrength.value = layered.fine.roughnessStrength;
    if (uniforms?.uRoadSurfaceVarSeed?.value) uniforms.uRoadSurfaceVarSeed.value = layered.seed;
}
