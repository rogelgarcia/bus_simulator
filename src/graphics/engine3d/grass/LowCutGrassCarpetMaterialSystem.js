// Stable world-space macro variation and bounded two-sample anti-tiling for the natural grass surface.

import * as THREE from 'three';
import { LOW_CUT_GRASS_SHADER_DEFAULTS } from '../../content3d/catalogs/LowCutGrassMaterialCatalog.js';

const USER_DATA_KEY = '__lowCutGrassCarpetMaterialV2';
const VERTEX_TOKEN = '#include <begin_vertex>';
const FRAGMENT_TOKEN = '#include <map_fragment>';

function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function sanitizeConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.freeze({
        enabled: source.enabled !== false,
        macroScaleMeters: clamp(source.macroScaleMeters, 2, 80, LOW_CUT_GRASS_SHADER_DEFAULTS.macroScaleMeters),
        macroVariationStrength: clamp(source.macroVariationStrength, 0, 0.35, LOW_CUT_GRASS_SHADER_DEFAULTS.macroVariationStrength),
        secondaryScale: clamp(source.secondaryScale, 0.9, 1.25, LOW_CUT_GRASS_SHADER_DEFAULTS.secondaryScale),
        secondaryBlend: clamp(source.secondaryBlend, 0, 0.75, LOW_CUT_GRASS_SHADER_DEFAULTS.secondaryBlend),
        seedOffset: Object.freeze({
            x: Number.isFinite(Number(source.seedOffset?.x)) ? Number(source.seedOffset.x) : LOW_CUT_GRASS_SHADER_DEFAULTS.seedOffset.x,
            y: Number.isFinite(Number(source.seedOffset?.y)) ? Number(source.seedOffset.y) : LOW_CUT_GRASS_SHADER_DEFAULTS.seedOffset.y
        })
    });
}

function updateUniforms(state, config) {
    const uniforms = state.uniforms;
    uniforms.lowCutEnabled.value = config.enabled ? 1.0 : 0.0;
    uniforms.lowCutMacroScale.value = config.macroScaleMeters;
    uniforms.lowCutMacroStrength.value = config.macroVariationStrength;
    uniforms.lowCutSecondaryScale.value = config.secondaryScale;
    uniforms.lowCutSecondaryBlend.value = config.secondaryBlend;
    uniforms.lowCutSeedOffset.value.set(config.seedOffset.x, config.seedOffset.y);
}

function patchShader(shader, state) {
    Object.assign(shader.uniforms, state.uniforms);
    shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vLowCutWorldPosition;\nvoid main() {')
        .replace(VERTEX_TOKEN, `${VERTEX_TOKEN}\n    vLowCutWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`);

    const helpers = `
varying vec3 vLowCutWorldPosition;
uniform float lowCutEnabled;
uniform float lowCutMacroScale;
uniform float lowCutMacroStrength;
uniform float lowCutSecondaryScale;
uniform float lowCutSecondaryBlend;
uniform vec2 lowCutSeedOffset;

float lowCutHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float lowCutNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
        mix(lowCutHash(cell), lowCutHash(cell + vec2(1.0, 0.0)), local.x),
        mix(lowCutHash(cell + vec2(0.0, 1.0)), lowCutHash(cell + vec2(1.0, 1.0)), local.x),
        local.y
    );
}
`;
    shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${helpers}\nvoid main() {`)
        .replace(FRAGMENT_TOKEN, `${FRAGMENT_TOKEN}
#ifdef USE_MAP
    if (lowCutEnabled > 0.5) {
        vec2 lowCutUv = vec2(1.0 - vMapUv.y, vMapUv.x) * lowCutSecondaryScale + lowCutSeedOffset;
        vec4 lowCutSecondary = texture2D(map, lowCutUv);
        float lowCutPrimaryLuminance = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float lowCutSecondaryLuminance = dot(lowCutSecondary.rgb, vec3(0.2126, 0.7152, 0.0722));
        float lowCutRatio = clamp(lowCutSecondaryLuminance / max(lowCutPrimaryLuminance, 0.025), 0.72, 1.28);
        vec2 lowCutMacroPosition = vLowCutWorldPosition.xz / lowCutMacroScale + lowCutSeedOffset;
        float lowCutMacroPrimary = lowCutNoise(lowCutMacroPosition);
        float lowCutMacroSecondary = lowCutNoise(vec2(-lowCutMacroPosition.y, lowCutMacroPosition.x) * 0.47 + lowCutSeedOffset.yx);
        float lowCutMacro = mix(lowCutMacroPrimary, lowCutMacroSecondary, 0.35);
        float lowCutBlend = lowCutSecondaryBlend * smoothstep(0.18, 0.82, lowCutMacro);
        diffuseColor.rgb *= mix(1.0, lowCutRatio, lowCutBlend);
        diffuseColor.rgb *= 1.0 + (lowCutMacro * 2.0 - 1.0) * lowCutMacroStrength;
    }
#endif`);
}

export function applyLowCutGrassCarpetMaterial(material, config = LOW_CUT_GRASS_SHADER_DEFAULTS) {
    const mat = material?.isMeshStandardMaterial ? material : null;
    if (!mat) return false;
    const sanitized = sanitizeConfig(config);
    let state = mat.userData?.[USER_DATA_KEY] ?? null;
    if (state) {
        state.config = sanitized;
        updateUniforms(state, sanitized);
        return true;
    }

    state = {
        config: sanitized,
        previousOnBeforeCompile: mat.onBeforeCompile,
        previousProgramCacheKey: mat.customProgramCacheKey,
        uniforms: {
            lowCutEnabled: { value: sanitized.enabled ? 1.0 : 0.0 },
            lowCutMacroScale: { value: sanitized.macroScaleMeters },
            lowCutMacroStrength: { value: sanitized.macroVariationStrength },
            lowCutSecondaryScale: { value: sanitized.secondaryScale },
            lowCutSecondaryBlend: { value: sanitized.secondaryBlend },
            lowCutSeedOffset: { value: new THREE.Vector2(sanitized.seedOffset.x, sanitized.seedOffset.y) }
        }
    };
    mat.userData[USER_DATA_KEY] = state;
    mat.onBeforeCompile = (shader, renderer) => {
        state.previousOnBeforeCompile?.call?.(mat, shader, renderer);
        patchShader(shader, state);
    };
    mat.customProgramCacheKey = () => `${state.previousProgramCacheKey?.call?.(mat) ?? ''}|low-cut-grass-carpet-v2`;
    mat.needsUpdate = true;
    return true;
}

export function updateLowCutGrassCarpetMaterial(material, config = LOW_CUT_GRASS_SHADER_DEFAULTS) {
    return applyLowCutGrassCarpetMaterial(material, config);
}

export function removeLowCutGrassCarpetMaterial(material) {
    const mat = material?.isMeshStandardMaterial ? material : null;
    const state = mat?.userData?.[USER_DATA_KEY] ?? null;
    if (!mat || !state) return false;
    mat.onBeforeCompile = state.previousOnBeforeCompile;
    mat.customProgramCacheKey = state.previousProgramCacheKey;
    delete mat.userData[USER_DATA_KEY];
    mat.needsUpdate = true;
    return true;
}

export function getLowCutGrassCarpetMaterialConfig(material) {
    const config = material?.userData?.[USER_DATA_KEY]?.config ?? null;
    return config ? { ...config, seedOffset: { ...config.seedOffset } } : null;
}
