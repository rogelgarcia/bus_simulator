// src/graphics/gui/terrain_debugger/view/TerrainDebuggerView.js
// Orchestrates UI, input, and rendering for the Terrain Debugger tool.
// @ts-check

import * as THREE from 'three';
import { FirstPersonCameraController } from '../../../engine3d/camera/FirstPersonCameraController.js';
import { getOrCreateGpuFrameTimer } from '../../../engine3d/perf/GpuFrameTimer.js';
import { applyIBLIntensity, applyIBLToScene, loadIBLTexture } from '../../../lighting/IBL.js';
import { getResolvedDefaultLightingSettings } from '../../../lighting/LightingSettings.js';
import { getResolvedShadowSettings, getShadowQualityPreset } from '../../../lighting/ShadowSettings.js';
import { DEFAULT_IBL_ID, getIblEntryById } from '../../../content3d/catalogs/IBLCatalog.js';
import { getPbrMaterialMeta, getPbrMaterialOptionsForGround, resolvePbrMaterialUrls } from '../../../content3d/catalogs/PbrMaterialCatalog.js';
import { PbrTextureLoaderService } from '../../../content3d/materials/PbrTexturePipeline.js';
import { primePbrAssetsAvailability } from '../../../content3d/materials/PbrAssetsRuntime.js';
import { applyUvTilingToMeshStandardMaterial, updateUvTilingOnMeshStandardMaterial } from '../../../assets3d/materials/MaterialUvTilingSystem.js';
import { applyMaterialVariationToMeshStandardMaterial, updateMaterialVariationOnMeshStandardMaterial, MATERIAL_VARIATION_ROOT } from '../../../assets3d/materials/MaterialVariationSystem.js';
import { getCityMaterials } from '../../../assets3d/textures/CityMaterials.js';
import { ROAD_DEFAULTS, createGeneratorConfig } from '../../../assets3d/generators/GeneratorParams.js';
import { createRoadEngineRoads } from '../../../visuals/city/RoadEngineRoads.js';
import { GrassEngine } from '../../../engine3d/grass/GrassEngine.js';
import { createTerrainEngine } from '../../../../app/city/terrain_engine/index.js';
import { createValueNoise2DSampler, mixU32, sampleFbm2D } from '../../../../app/core/noise/DeterministicNoise.js';
import { TerrainDebuggerUI } from './TerrainDebuggerUI.js';
import { GrassBladeInspectorPopup } from './GrassBladeInspectorPopup.js';
import { GrassLodInspectorPopup } from './GrassLodInspectorPopup.js';

const EPS = 1e-6;
const CAMERA_PRESET_BEHIND_GAMEPLAY_DISTANCE = 13.5;
const BIOME_TILING_FOCUS_BUS_HIGH_DISTANCE_METERS = 20.0;
const BIOME_TILING_FOCUS_EYE_Z_OFFSET_METERS = -16.0;
const BIOME_TILING_FOCUS_POSE_MATCH_EPSILON_METERS = 0.001;
const ALBEDO_SATURATION_ADJUST_SHADER_VERSION = 3;
const TERRAIN_BIOME_BLEND_SHADER_VERSION = 15;
const OUTPUT_PANEL_REFRESH_MS = 100;
const FLYOVER_SAMPLE_RATE = 15;
const FLYOVER_DEBUG_HELPER_LAYER = 1;
const FLYOVER_DEBUG_ICON_FORWARD = Object.freeze(new THREE.Vector3(1, 0, 0));
const FLYOVER_DEBUG_OVERLAY_MARGIN_PX = 12;
const FLYOVER_DEBUG_OVERLAY_GAP_PX = 10;
const FLYOVER_DEBUG_OVERLAY_MIN_WIDTH_PX = 220;
const FLYOVER_DEBUG_OVERLAY_MAX_WIDTH_PX = 460;
const FLYOVER_DEBUG_OVERLAY_ASPECT = 16 / 9;
const FLYOVER_DEBUG_OVERLAY_MAX_HEIGHT_FRAC = 0.42;
const FLYOVER_DEBUG_KEYFRAME_INDEX_SIZE_METERS = 32.0;
const FLYOVER_DEBUG_KEYFRAME_INDEX_OFFSET_Y = 64.0;
const FLYOVER_DEBUG_TANGENT_EXTEND = 1.8;
const FLYOVER_DEBUG_KEYFRAME2_TANGENT_LENGTH_METERS = 24.0;
const FLYOVER_DEBUG_KEYFRAME2_TANGENT_SECONDARY_SCALE = 0.72;
const FLYOVER_DEBUG_TANGENT_IN_COLOR = 0xff5f57;
const FLYOVER_DEBUG_TANGENT_OUT_COLOR = 0x7dd3fc;
const FLYOVER_DEBUG_AXIS_OUTSIDE_OFFSET_METERS = 5.0;
const FLYOVER_DEBUG_AXIS_SCALE = 10.0;
const BIOME_TILING_AXIS_INSET_METERS = 1.0;
const BIOME_TILING_AXIS_GAP_METERS = 1.0;
const BIOME_TILING_AXIS_OUTSIDE_OFFSET_METERS = 1.0;
const BIOME_TILING_AXIS_LENGTH_METERS = 2.8;
const BIOME_TILING_AXIS_HEAD_LENGTH_METERS = 0.62;
const BIOME_TILING_AXIS_HEAD_WIDTH_METERS = 0.30;
const BIOME_TILING_AXIS_Y_OFFSET_METERS = 0.22;
const BIOME_TILING_AXIS_LABEL_SIZE_METERS = 0.85;
const BIOME_TILING_OVERVIEW_ANGLE_OFFSET_DEG = 15;
const BIOME_TILING_RING_HELPER_Y_OFFSET_METERS = 0.28;
const BIOME_TILING_RING_HELPER_NEAR_COLOR = 0x44f7a1;
const BIOME_TILING_RING_HELPER_OUTER_COLOR = 0xfbbf24;
const BIOME_TILING_TILE_LOD_HELPER_Y_OFFSET_METERS = 0.55;
const BIOME_TILING_TILE_LOD_LABEL_SCALE_METERS = 2.1;
const BIOME_TILING_TILE_LOD_LABEL_MAX_TILES = 1600;
const BIOME_TILING_LOD_MONITOR_WINDOW_SEC = 12.0;
const BIOME_TILING_LOD_MONITOR_SAMPLE_MS = 120;
const BIOME_TILING_LOD_POP_CANDIDATE_SEG_DELTA_PER_SEC = 2.0;
const BIOME_TILING_LOD_QUAD_LEVELS = Object.freeze([256, 64, 16, 4, 1]);
const BIOME_TILING_LOD_PRESET_THRESHOLDS_TILES = Object.freeze({
    low: Object.freeze([0, 1, 2, 4]),
    medium: Object.freeze([0, 2, 4, 8]),
    high: Object.freeze([1, 3, 6, 12])
});
const BIOME_TILING_LOD_DEFAULT_PRESET = 'medium';
const BIOME_TILING_WAVE_DEFAULT_MAX_HEIGHT_METERS = 2.0;
const BIOME_TILING_WAVE_DEFAULT_MAX_NEIGHBOR_DELTA_METERS = 0.5;
const BIOME_TILING_WAVE_DEFAULT_MAX_TILE_RANGE_METERS = 0.5;
const BIOME_TILING_WAVE_HARD_MAX_HEIGHT_METERS = 10.0;
const BIOME_TILING_WAVE_HARD_MAX_NEIGHBOR_DELTA_METERS = 2.0;
const BIOME_TILING_WAVE_HARD_MAX_TILE_RANGE_METERS = 20.0;

const BIOME_TILING_CALIB_RIG_ANIMATION_MS = 4000;
const BIOME_TILING_CALIB_RIG_PLATE_SIZE = 2.7;
const BIOME_TILING_CALIB_RIG_PLATE_THICKNESS = 0.12;
const BIOME_TILING_CALIB_RIG_PANEL_WIDTH = 2.4;
const BIOME_TILING_CALIB_RIG_PANEL_HEIGHT = 2.2;
const BIOME_TILING_CALIB_RIG_SPHERE_RADIUS = 0.65;
const BIOME_TILING_CALIB_RIG_CUBE_SIZE = 0.92;
const BIOME_TILING_CALIB_RIG_CAMERA_TARGET = Object.freeze({ x: 0, y: BIOME_TILING_CALIB_RIG_PLATE_THICKNESS + 1.05, z: 0 });
const BIOME_TILING_CALIB_RIG_CAMERA_POSITION = Object.freeze({ x: 0.25, y: BIOME_TILING_CALIB_RIG_PLATE_THICKNESS + 2.25, z: 7.0 });
const BIOME_TILING_CALIB_RIG_SUN_POSITION = Object.freeze({ x: 4, y: 7, z: 4 });
const BIOME_TILING_CALIB_RIG_SUN_TARGET = Object.freeze({ x: 0, y: 0.9, z: 0 });
const BIOME_TILING_CALIB_RIG_ELEVATION_OFFSET_METERS = 0.5;
const BIOME_TILING_SUN_ORBIT_ANIMATION_MS = 12000;
const BIOME_TILING_SUN_ORBIT_MIN_ELEVATION_DEG = 14;
const BIOME_TILING_SUN_ORBIT_MAX_ELEVATION_DEG = 72;
const BIOME_TILING_SUN_ORBIT_RADIUS_SCALE = 0.58;
const BIOME_TILING_SUN_ORBIT_RADIUS_MIN_METERS = 100;
const BIOME_TILING_DISPLACEMENT_OVERLAY_Y_OFFSET_METERS = 0.015;
const BIOME_TILING_DISPLACEMENT_OVERLAY_MAX_TRIANGLES = 2000000;
const BIOME_TILING_DISPLACEMENT_OVERLAY_MAX_QUADS_PER_BUILD = 300000;
const BIOME_TILING_DISPLACEMENT_OVERLAY_SHAPE_SIDES = 32;
const BIOME_TILING_VIEWPORT_MASK_MARGIN_METERS = 0.2;
const BIOME_TILING_VIEWPORT_MASK_STABILIZE_MOVE_METERS = 1.0;
const BIOME_TILING_OVERLAY_FOLLOW_REBUILD_INTERVAL_MS = 180;
const BIOME_TILING_OVERLAY_FOLLOW_MIN_MOVE_METERS = 0.75;
const BIOME_TILING_OVERLAY_FOLLOW_MAX_MOVE_METERS = 2.0;
const BIOME_TILING_OVERLAY_FOLLOW_SNAP_MIN_METERS = 0.25;
const BIOME_TILING_OVERLAY_FOLLOW_SNAP_MAX_METERS = 0.5;
const TERRAIN_HEIGHT_WIREFRAME_Y_OFFSET_METERS = 0.012;
const TERRAIN_HEIGHT_WIREFRAME_OPACITY = 0.95;
const TERRAIN_HEIGHT_WIREFRAME_LOW_HUE = 0.66;
const TERRAIN_HEIGHT_WIREFRAME_HIGH_HUE = 0.00;
const TERRAIN_BIOME_BLEND_USER_DATA_KEYS = Object.freeze([
    'terrainEngineMaskTex',
    'terrainEngineBounds',
    'terrainUvAnchor',
    'terrainBiomeMapStone',
    'terrainBiomeMapGrass',
    'terrainBiomeMapLand',
    'terrainBiomeNormalArrayTex',
    'terrainBiomeOrmArrayTex',
    'terrainBiomeOrmStone',
    'terrainBiomeOrmGrass',
    'terrainBiomeOrmLand',
    'terrainBiomeUvScaleStone',
    'terrainBiomeUvScaleGrass',
    'terrainBiomeUvScaleLand',
    'terrainDecodeSrgbAlbedo',
    'terrainHumidityThresholds',
    'terrainHumidityEdgeNoise',
    'terrainHumidityEdgeNoiseTex',
    'terrainTilingDistance0',
    'terrainTilingDistance1',
    'terrainTilingVariation0',
    'terrainTilingVariation1',
    'terrainBiomeFeatureMask',
    'terrainForceRoughness'
]);

const TERRAIN_ENGINE_MASK_TEX_SIZE = 256;
const TERRAIN_BIOME_IDS = Object.freeze(['stone', 'grass', 'land']);
const TERRAIN_HUMIDITY_SLOT_IDS = Object.freeze(['dry', 'neutral', 'wet']);
const TERRAIN_HUMIDITY_LEVELS = Object.freeze({
    dry: 0.14,
    neutral: 0.50,
    wet: 0.86
});
const TERRAIN_VIEW_MODE = Object.freeze({
    DEFAULT: 'default',
    BIOME_TRANSITION: 'biome_transition',
    BIOME_TILING: 'biome_tiling'
});
const BIOME_TRANSITION_DEBUG_MODES = new Set(['pair_isolation', 'transition_result', 'transition_weight', 'transition_falloff', 'transition_noise', 'pair_compare']);
const TERRAIN_DEBUG_MODE_ALLOWED = new Set([
    'standard',
    'biome_id',
    'patch_ids',
    'humidity',
    'transition_band',
    ...BIOME_TRANSITION_DEBUG_MODES
]);
const BIOME_TRANSITION_DEFAULT_PROFILE = Object.freeze({
    intent: 'medium',
    widthScale: 1.0,
    falloffPower: 1.0,
    edgeNoiseScale: 0.02,
    edgeNoiseStrength: 0.22,
    dominanceBias: 0.0,
    heightInfluence: 0.0,
    contrast: 1.0
});
const BIOME_TILING_DEFAULT_STATE = Object.freeze({
    materialId: 'pbr.ground_037',
    distanceTiling: Object.freeze({
        enabled: true,
        nearScale: 4.0,
        farScale: 0.36,
        blendStartMeters: 40.0,
        blendEndMeters: 240.0,
        blendCurve: 1.0,
        debugView: 'blended'
    }),
    variation: Object.freeze({
        antiTilingEnabled: false,
        antiTilingStrength: 0.45,
        antiTilingCellMeters: 2.0,
        macroVariationEnabled: false,
        macroVariationStrength: 0.16,
        macroVariationScale: 0.02,
        nearIntensity: 1.0,
        farIntensity: 0.65
    }),
    displacement: Object.freeze({
        enabled: false,
        strength: 0.02,
        bias: 0.0,
        source: 'auto',
        debugView: 'standard'
    }),
    performance: Object.freeze({
        fragmentShaderEnabled: true,
        fragmentShaderBiomeEnabled: true,
        fragmentShaderPbrLightingEnabled: true,
        fragmentShaderAlbedoEnabled: true,
        fragmentShaderSurfaceEnabled: true,
        shadowsEnabled: true,
        highDpiEnabled: true
    }),
    geometryDensity: Object.freeze({
        enabled: false,
        mode: 'uniform',
        detailPreset: BIOME_TILING_LOD_DEFAULT_PRESET,
        segmentsPerTile: 1,
        nearSegmentsPerTile: 16,
        farSegmentsPerTile: 1,
        nearRadiusMeters: 0,
        transitionWidthMeters: 0,
        renderDistanceMeters: 0,
        transitionSmoothing: 0.72,
        transitionBias: 0.0,
        transitionDebugBands: 0,
        waveStrength: 0.02,
        waveMaxHeightMeters: BIOME_TILING_WAVE_DEFAULT_MAX_HEIGHT_METERS,
        waveMaxNeighborDeltaMeters: BIOME_TILING_WAVE_DEFAULT_MAX_NEIGHBOR_DELTA_METERS,
        waveMaxTileRangeMeters: BIOME_TILING_WAVE_DEFAULT_MAX_TILE_RANGE_METERS,
        ringOverlayEnabled: false,
        tileLodDebugEnabled: false,
        centerOnApplyCamera: true,
        rebuildCadence: 'off',
        centerX: 0,
        centerZ: 0,
        applyNonce: 0
    })
});
const TERRAIN_DEBUGGER_URL_PARAM = Object.freeze({
    tab: 'td_tab',
    tilingPbr: 'td_tiling_pbr',
    tilingFocus: 'td_tiling_focus',
    cameraPosX: 'td_cx',
    cameraPosY: 'td_cy',
    cameraPosZ: 'td_cz',
    cameraTargetX: 'td_tx',
    cameraTargetY: 'td_ty',
    cameraTargetZ: 'td_tz'
});

function normalizeTerrainRoughnessRemap(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;

    const minRaw = Number(src.min);
    const maxRaw = Number(src.max);
    const gammaRaw = Number(src.gamma);
    if (!(Number.isFinite(minRaw) && Number.isFinite(maxRaw) && Number.isFinite(gammaRaw))) return null;

    const out = {
        min: clamp(minRaw, 0.0, 1.0, 0.0),
        max: clamp(Math.max(minRaw, maxRaw), 0.0, 1.0, 1.0),
        gamma: clamp(gammaRaw, 0.1, 4.0, 1.0),
        invertInput: src.invertInput === true,
        lowPercentile: 0.0,
        highPercentile: 100.0
    };

    const lowRaw = Number(src.lowPercentile);
    const highRaw = Number(src.highPercentile);
    if (Number.isFinite(lowRaw) && Number.isFinite(highRaw)) {
        const lo = clamp(lowRaw, 0.0, 100.0, 0.0);
        const hi = clamp(highRaw, 0.0, 100.0, 100.0);
        if (hi > lo) {
            out.lowPercentile = lo;
            out.highPercentile = hi;
        }
    }

    return out;
}

function getTerrainRoughnessRemapSignature(value) {
    const remap = normalizeTerrainRoughnessRemap(value);
    if (!remap) return 'off';
    return [
        remap.min.toFixed(6),
        remap.max.toFixed(6),
        remap.gamma.toFixed(6),
        remap.invertInput ? '1' : '0',
        remap.lowPercentile.toFixed(6),
        remap.highPercentile.toFixed(6)
    ].join(':');
}

function applyTerrainPbrAdjustUniforms(uniforms, { saturationAmount = 0.0, roughnessRemap = null } = {}) {
    const u = uniforms && typeof uniforms === 'object' ? uniforms : null;
    if (!u) return;

    const remap = normalizeTerrainRoughnessRemap(roughnessRemap);
    const sat = clamp(saturationAmount, -1.0, 1.0, 0.0);
    if (u.uAlbedoSaturationAdjust) u.uAlbedoSaturationAdjust.value = sat;

    const min = remap ? remap.min : 0.0;
    const max = remap ? remap.max : 1.0;
    const lowNorm = remap ? (remap.lowPercentile / 100.0) : 0.0;
    const highNorm = remap ? (remap.highPercentile / 100.0) : 1.0;
    const gamma = remap ? remap.gamma : 1.0;
    const enabled = remap ? 1.0 : 0.0;
    const invertInput = remap?.invertInput ? 1.0 : 0.0;

    if (u.uTerrainRoughnessRange?.value?.set) u.uTerrainRoughnessRange.value.set(min, max);
    if (u.uTerrainRoughnessInputNorm?.value?.set) u.uTerrainRoughnessInputNorm.value.set(lowNorm, highNorm);
    if (u.uTerrainRoughnessGamma) u.uTerrainRoughnessGamma.value = gamma;
    if (u.uTerrainRoughnessRemapEnabled) u.uTerrainRoughnessRemapEnabled.value = enabled;
    if (u.uTerrainRoughnessInvertInput) u.uTerrainRoughnessInvertInput.value = invertInput;
}

function injectAlbedoSaturationAdjustShader(material, shader) {
    const cfg = material?.userData?.albedoSaturationAdjustConfig ?? null;
    shader.uniforms.uAlbedoSaturationAdjust = { value: Number(cfg?.amount) || 0.0 };
    shader.uniforms.uTerrainRoughnessRange = { value: new THREE.Vector2(0, 1) };
    shader.uniforms.uTerrainRoughnessInputNorm = { value: new THREE.Vector2(0, 1) };
    shader.uniforms.uTerrainRoughnessGamma = { value: 1.0 };
    shader.uniforms.uTerrainRoughnessRemapEnabled = { value: 0.0 };
    shader.uniforms.uTerrainRoughnessInvertInput = { value: 0.0 };
    applyTerrainPbrAdjustUniforms(shader.uniforms, {
        saturationAmount: Number(cfg?.amount) || 0.0,
        roughnessRemap: cfg?.roughnessRemap ?? null
    });

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        [
            '#include <common>',
            '#ifdef USE_ALBEDO_SATURATION_ADJUST',
            'uniform float uAlbedoSaturationAdjust;',
            'uniform vec2 uTerrainRoughnessRange;',
            'uniform vec2 uTerrainRoughnessInputNorm;',
            'uniform float uTerrainRoughnessGamma;',
            'uniform float uTerrainRoughnessRemapEnabled;',
            'uniform float uTerrainRoughnessInvertInput;',
            'vec3 gdSaturateColor(vec3 c, float amount){',
            'float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
            'float t = clamp(1.0 + amount, 0.0, 2.0);',
            'return mix(vec3(l), c, t);',
            '}',
            'float gdApplyTerrainRoughnessRemap(float inputR){',
            'if (uTerrainRoughnessRemapEnabled <= 0.5) return clamp(inputR, 0.0, 1.0);',
            'float gdInput = clamp(inputR, 0.0, 1.0);',
            'if (uTerrainRoughnessInvertInput > 0.5) gdInput = 1.0 - gdInput;',
            'float gdNormSpan = max(1e-5, uTerrainRoughnessInputNorm.y - uTerrainRoughnessInputNorm.x);',
            'float gdT = clamp((gdInput - uTerrainRoughnessInputNorm.x) / gdNormSpan, 0.0, 1.0);',
            'gdT = pow(gdT, max(0.001, uTerrainRoughnessGamma));',
            'float gdMinR = clamp(uTerrainRoughnessRange.x, 0.0, 1.0);',
            'float gdMaxR = clamp(uTerrainRoughnessRange.y, gdMinR, 1.0);',
            'return mix(gdMinR, gdMaxR, gdT);',
            '}',
            '#endif'
        ].join('\n')
    );

    const saturationApply = [
        '#ifdef USE_ALBEDO_SATURATION_ADJUST',
        'diffuseColor.rgb = gdSaturateColor(diffuseColor.rgb, uAlbedoSaturationAdjust);',
        '#endif'
    ].join('\n');
    const roughnessRemapApply = [
        '#ifdef USE_ALBEDO_SATURATION_ADJUST',
        'if (uTerrainRoughnessRemapEnabled > 0.5) {',
        '    roughnessFactor = gdApplyTerrainRoughnessRemap(roughnessFactor);',
        '}',
        '#endif'
    ].join('\n');

    if (shader.fragmentShader.includes('#include <map_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>\n${saturationApply}`
        );
    } else if (shader.fragmentShader.includes('#include <color_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>\n${saturationApply}`
        );
    }

    if (shader.fragmentShader.includes('#include <roughnessmap_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>\n${roughnessRemapApply}`
        );
    }
}

function ensureAlbedoSaturationAdjustConfigOnMaterial(material, config) {
    const mat = material;
    mat.userData = mat.userData ?? {};
    mat.userData.albedoSaturationAdjustConfig = config;

    mat.defines = mat.defines ?? {};
    mat.defines.USE_ALBEDO_SATURATION_ADJUST = 1;

    const prevCacheKey = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => {
        const prev = prevCacheKey ? prevCacheKey() : '';
        return `${prev}|albsat:${ALBEDO_SATURATION_ADJUST_SHADER_VERSION}`;
    };

    const prevOnBeforeCompile = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile.bind(mat) : null;
    mat.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);
        injectAlbedoSaturationAdjustShader(mat, shader);
        mat.userData.albedoSaturationAdjustConfig.shaderUniforms = shader.uniforms;
    };
}

function updateAlbedoSaturationAdjustOnMeshStandardMaterial(material, { amount, roughnessRemap = null } = {}) {
    if (!material?.isMeshStandardMaterial) return;
    const a = clamp(amount, -1.0, 1.0, 0.0);
    const remap = normalizeTerrainRoughnessRemap(roughnessRemap);

    const cfg = material.userData?.albedoSaturationAdjustConfig ?? null;
    if (!cfg || typeof cfg !== 'object') {
        ensureAlbedoSaturationAdjustConfigOnMaterial(material, {
            amount: a,
            roughnessRemap: remap,
            shaderUniforms: null
        });
        material.needsUpdate = true;
        return;
    }

    cfg.amount = a;
    cfg.roughnessRemap = remap;
    applyTerrainPbrAdjustUniforms(cfg.shaderUniforms, {
        saturationAmount: a,
        roughnessRemap: remap
    });
}

const TERRAIN_ALBEDO_COLOR_SCRATCH = new THREE.Color(1, 1, 1);
const TERRAIN_ALBEDO_TINT_COLOR_SCRATCH = new THREE.Color(1, 1, 1);

function buildTerrainLocalPbrOverrides(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;

    const out = {};
    const defaults = {
        normalStrength: 1.0,
        roughness: 1.0,
        albedoBrightness: 1.0,
        albedoTintStrength: 0.0,
        albedoHueDegrees: 0.0,
        albedoSaturation: 0.0
    };
    const putIfNonDefault = (key, raw, min, max, fallback) => {
        const num = Number(raw);
        if (!Number.isFinite(num)) return;
        const normalized = clamp(num, min, max, fallback);
        const neutral = Number(defaults[key]);
        if (Math.abs(normalized - neutral) <= 1e-4) return;
        out[key] = normalized;
    };

    putIfNonDefault('normalStrength', src.normalStrength, 0.0, 8.0, 1.0);
    putIfNonDefault('roughness', src.roughness, 0.0, 1.0, 1.0);
    putIfNonDefault('albedoBrightness', src.albedoBrightness, 0.0, 4.0, 1.0);
    putIfNonDefault('albedoTintStrength', src.albedoTintStrength, 0.0, 1.0, 0.0);
    putIfNonDefault('albedoHueDegrees', src.albedoHueDegrees, -180.0, 180.0, 0.0);
    putIfNonDefault('albedoSaturation', src.albedoSaturation, -1.0, 1.0, 0.0);

    return Object.keys(out).length ? out : null;
}

function applyTerrainPbrDetailOverridesToMaterial(material, overrides) {
    const mat = material?.isMeshStandardMaterial ? material : null;
    const src = overrides && typeof overrides === 'object' ? overrides : {};
    if (!mat) return false;

    let changed = false;
    const normalStrength = clamp(src.normalStrength, 0.0, 8.0, 1.0);
    if (mat.normalScale?.set) {
        if (Math.abs((Number(mat.normalScale.x) || 0) - normalStrength) > EPS
            || Math.abs((Number(mat.normalScale.y) || 0) - normalStrength) > EPS) {
            mat.normalScale.set(normalStrength, normalStrength);
            changed = true;
        }
    }

    const roughness = clamp(src.roughness, 0.0, 1.0, 1.0);
    if (Math.abs((Number(mat.roughness) || 0) - roughness) > EPS) {
        mat.roughness = roughness;
        changed = true;
    }

    if ('aoMapIntensity' in mat) {
        const aoIntensity = clamp(src.aoIntensity, 0.0, 2.0, 1.0);
        if (Math.abs((Number(mat.aoMapIntensity) || 0) - aoIntensity) > EPS) {
            mat.aoMapIntensity = aoIntensity;
            changed = true;
        }
    }

    return changed;
}

function applyTerrainAlbedoOverridesToMaterial(material, overrides) {
    const mat = material?.isMeshStandardMaterial ? material : null;
    const src = overrides && typeof overrides === 'object' ? overrides : {};
    if (!mat) return false;

    const albedoBrightness = clamp(src.albedoBrightness, 0.0, 4.0, 1.0);
    const albedoTintStrength = clamp(src.albedoTintStrength, 0.0, 1.0, 0.0);
    const albedoHueDegrees = clamp(src.albedoHueDegrees, -180.0, 180.0, 0.0);
    const albedoSaturationAdjust = clamp(src.albedoSaturation, -1.0, 1.0, 0.0);

    let hue01 = (albedoHueDegrees / 360.0) % 1.0;
    if (hue01 < 0) hue01 += 1.0;
    TERRAIN_ALBEDO_TINT_COLOR_SCRATCH.setHSL(hue01, 1.0, 0.5);
    TERRAIN_ALBEDO_COLOR_SCRATCH.setRGB(1, 1, 1);
    TERRAIN_ALBEDO_COLOR_SCRATCH.lerp(TERRAIN_ALBEDO_TINT_COLOR_SCRATCH, albedoTintStrength);
    TERRAIN_ALBEDO_COLOR_SCRATCH.multiplyScalar(albedoBrightness);

    let changed = false;
    if (mat.color?.isColor) {
        if (Math.abs(mat.color.r - TERRAIN_ALBEDO_COLOR_SCRATCH.r) > EPS
            || Math.abs(mat.color.g - TERRAIN_ALBEDO_COLOR_SCRATCH.g) > EPS
            || Math.abs(mat.color.b - TERRAIN_ALBEDO_COLOR_SCRATCH.b) > EPS) {
            mat.color.copy(TERRAIN_ALBEDO_COLOR_SCRATCH);
            changed = true;
        }
    }

    const prevAmount = Number(mat.userData?.albedoSaturationAdjustConfig?.amount);
    const prevRemapSig = getTerrainRoughnessRemapSignature(mat.userData?.albedoSaturationAdjustConfig?.roughnessRemap ?? null);
    updateAlbedoSaturationAdjustOnMeshStandardMaterial(mat, {
        amount: albedoSaturationAdjust,
        roughnessRemap: src.roughnessRemap ?? null
    });
    const nextAmount = Number(mat.userData?.albedoSaturationAdjustConfig?.amount);
    const nextRemapSig = getTerrainRoughnessRemapSignature(mat.userData?.albedoSaturationAdjustConfig?.roughnessRemap ?? null);
    if (!Number.isFinite(prevAmount) || Math.abs(prevAmount - nextAmount) > EPS || prevRemapSig !== nextRemapSig) changed = true;

    return changed;
}

function clamp(value, min, max, fallback) {
    const num = Number(value);
    const fb = fallback === undefined ? min : fallback;
    if (!Number.isFinite(num)) return fb;
    return Math.max(min, Math.min(max, num));
}

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function isTextEditingElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    if (target?.isContentEditable) return true;
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;

    const type = String(target.type ?? '').toLowerCase();
    if (!type) return true;
    return (
        type === 'text'
        || type === 'search'
        || type === 'email'
        || type === 'password'
        || type === 'url'
        || type === 'tel'
    );
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function createSolidDataTexture(r, g, b, { srgb = true } = {}) {
    const data = new Uint8Array([r & 255, g & 255, b & 255, 255]);
    const tex = new THREE.DataTexture(data, 1, 1);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    applyTextureColorSpace(tex, { srgb: !!srgb });
    return tex;
}

function createHumidityEdgeNoiseTexture(size = 64) {
    const s = Math.max(2, Math.round(Number(size) || 64));
    const data = new Uint8Array(s * s * 4);
    let i = 0;
    for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
            const h = mixU32(((x + 1) * 73856093) ^ ((y + 1) * 19349663));
            const v = h & 255;
            data[i++] = v;
            data[i++] = v;
            data[i++] = v;
            data[i++] = 255;
        }
    }
    const tex = new THREE.DataTexture(data, s, s);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    applyTextureColorSpace(tex, { srgb: false });
    return tex;
}

const FALLBACK_TERRAIN_BIOME_MAPS = Object.freeze({
    stone: createSolidDataTexture(150, 150, 150, { srgb: true }),
    grass: createSolidDataTexture(70, 160, 78, { srgb: true }),
    land: createSolidDataTexture(215, 145, 70, { srgb: true })
});
const FALLBACK_TERRAIN_BIOME_ORM_MAPS = Object.freeze({
    stone: createSolidDataTexture(255, 255, 0, { srgb: false }),
    grass: createSolidDataTexture(255, 255, 0, { srgb: false }),
    land: createSolidDataTexture(255, 255, 0, { srgb: false })
});
const BIOME_TILING_DISPLACEMENT_DEBUG_ALBEDO_TEX = createSolidDataTexture(196, 196, 196, { srgb: true });

function createSolidDataArrayTexture(r, g, b, { a = 255, depth = 9, srgb = false } = {}) {
    const d = Math.max(1, Math.round(Number(depth) || 1));
    const data = new Uint8Array(d * 4);
    const rr = r & 255;
    const gg = g & 255;
    const bb = b & 255;
    const aa = a & 255;
    for (let i = 0; i < d; i++) {
        const o = i * 4;
        data[o] = rr;
        data[o + 1] = gg;
        data[o + 2] = bb;
        data[o + 3] = aa;
    }

    const tex = new THREE.DataArrayTexture(data, 1, 1, d);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    applyTextureColorSpace(tex, { srgb: !!srgb });
    return tex;
}

// Keep array textures present even while async layers are rebuilding to avoid shader
// recompiles / missing-uniform issues.
const FALLBACK_TERRAIN_BIOME_NORMAL_ARRAY_TEX = createSolidDataArrayTexture(128, 128, 255, { depth: 9, srgb: false });
const FALLBACK_TERRAIN_BIOME_ORM_ARRAY_TEX = createSolidDataArrayTexture(255, 255, 0, { depth: 9, srgb: false });

const FALLBACK_TERRAIN_HUMIDITY_EDGE_NOISE_TEX = createHumidityEdgeNoiseTexture(64);

const FALLBACK_TERRAIN_ENGINE_MASK_TEX = (() => {
    // Land everywhere, mid humidity; ensures Standard mode renders something even before the engine exports.
    const data = new Uint8Array([2, 2, 0, 128]);
    const tex = new THREE.DataTexture(data, 1, 1);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    applyTextureColorSpace(tex, { srgb: false });
    return tex;
})();

const DEFAULT_TERRAIN_BIOME_HUMIDITY_PBR_BINDINGS = Object.freeze({
    stone: Object.freeze({ dry: 'pbr.rock_ground', neutral: 'pbr.rock_ground', wet: 'pbr.coast_sand_rocks_02' }),
    grass: Object.freeze({ dry: 'pbr.grass_005', neutral: 'pbr.grass_005', wet: 'pbr.grass_005' }),
    land: Object.freeze({ dry: 'pbr.ground_037', neutral: 'pbr.ground_037', wet: 'pbr.ground_037' })
});

const DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG = Object.freeze({
    dryMax: 0.33,
    wetMin: 0.67,
    blendBand: 0.02,
    edgeNoiseScale: 0.025,
    edgeNoiseStrength: 0.0
});

const DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG = Object.freeze({
    subtilePerTile: 8,
    scale: 0.02,
    octaves: 4,
    gain: 0.5,
    lacunarity: 2.0,
    bias: 0.0,
    amplitude: 1.0
});

function normalizeHumiditySlotId(value) {
    const id = String(value ?? '');
    if (id === 'dry' || id === 'wet') return id;
    return 'neutral';
}

function titleCaseBiomeId(id) {
    if (id === 'stone') return 'Stone';
    if (id === 'grass') return 'Grass';
    return 'Land';
}

function titleCaseHumiditySlot(slot) {
    if (slot === 'dry') return 'Dry';
    if (slot === 'wet') return 'Wet';
    return 'Neutral';
}

function getBiomeSortIndex(id) {
    const biomeId = String(id ?? '');
    if (biomeId === 'stone') return 0;
    if (biomeId === 'grass') return 1;
    if (biomeId === 'land') return 2;
    return 3;
}

function makeBiomePairKey(a, b) {
    const aId = TERRAIN_BIOME_IDS.includes(String(a ?? '')) ? String(a) : 'land';
    const bId = TERRAIN_BIOME_IDS.includes(String(b ?? '')) ? String(b) : aId;
    if (aId === bId) return `${aId}|${aId}`;
    if (getBiomeSortIndex(aId) <= getBiomeSortIndex(bId)) return `${aId}|${bId}`;
    return `${bId}|${aId}`;
}

function biomeIdFromIndex(value) {
    const idx = Number(value) | 0;
    if (idx === 0) return 'stone';
    if (idx === 1) return 'grass';
    return 'land';
}

function sanitizeBiomeTransitionProfile(input, fallback = BIOME_TRANSITION_DEFAULT_PROFILE) {
    const src = input && typeof input === 'object' ? input : {};
    const fb = fallback && typeof fallback === 'object' ? fallback : BIOME_TRANSITION_DEFAULT_PROFILE;
    const intentRaw = String(src.intent ?? fb.intent ?? BIOME_TRANSITION_DEFAULT_PROFILE.intent).trim().toLowerCase();
    const intent = intentRaw === 'soft' || intentRaw === 'hard' ? intentRaw : 'medium';
    return {
        intent,
        widthScale: clamp(src.widthScale, 0.25, 4.0, fb.widthScale ?? BIOME_TRANSITION_DEFAULT_PROFILE.widthScale),
        falloffPower: clamp(src.falloffPower, 0.3, 3.5, fb.falloffPower ?? BIOME_TRANSITION_DEFAULT_PROFILE.falloffPower),
        edgeNoiseScale: clamp(src.edgeNoiseScale, 0.0005, 0.2, fb.edgeNoiseScale ?? BIOME_TRANSITION_DEFAULT_PROFILE.edgeNoiseScale),
        edgeNoiseStrength: clamp(src.edgeNoiseStrength, 0.0, 1.0, fb.edgeNoiseStrength ?? BIOME_TRANSITION_DEFAULT_PROFILE.edgeNoiseStrength),
        dominanceBias: clamp(src.dominanceBias, -0.5, 0.5, fb.dominanceBias ?? BIOME_TRANSITION_DEFAULT_PROFILE.dominanceBias),
        heightInfluence: clamp(src.heightInfluence, -1.0, 1.0, fb.heightInfluence ?? BIOME_TRANSITION_DEFAULT_PROFILE.heightInfluence),
        contrast: clamp(src.contrast, 0.25, 3.0, fb.contrast ?? BIOME_TRANSITION_DEFAULT_PROFILE.contrast)
    };
}

function ensureTerrainBiomeBlendShaderOnMaterial(material) {
    if (!material?.isMeshStandardMaterial) return;
    const mat = material;
    mat.userData = mat.userData ?? {};
    if (mat.userData.terrainBiomeBlendShaderVersion === TERRAIN_BIOME_BLEND_SHADER_VERSION) return;
    mat.userData.terrainBiomeBlendShaderVersion = TERRAIN_BIOME_BLEND_SHADER_VERSION;

    mat.defines = mat.defines ?? {};
    if (mat.userData.terrainBiomeBlendShaderEnabled !== false) {
        mat.defines.USE_TERRAIN_BIOME_BLEND = 1;
    } else {
        delete mat.defines.USE_TERRAIN_BIOME_BLEND;
    }

    const prevCacheKey = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => {
        const prev = prevCacheKey ? prevCacheKey() : '';
        return `${prev}|terrainbiome:${TERRAIN_BIOME_BLEND_SHADER_VERSION}`;
    };

    const prevOnBeforeCompile = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile.bind(mat) : null;
    mat.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);

        const data = mat.userData ?? {};
        shader.uniforms.uGdTerrainMask = { value: data.terrainEngineMaskTex ?? null };
        shader.uniforms.uGdTerrainBounds = { value: data.terrainEngineBounds ?? new THREE.Vector4() };
        shader.uniforms.uGdTerrainUvAnchor = { value: data.terrainUvAnchor ?? new THREE.Vector2() };
        shader.uniforms.uGdBiomeMapStone = { value: data.terrainBiomeMapStone ?? FALLBACK_TERRAIN_BIOME_MAPS.stone };
        shader.uniforms.uGdBiomeMapGrass = { value: data.terrainBiomeMapGrass ?? FALLBACK_TERRAIN_BIOME_MAPS.grass };
        shader.uniforms.uGdBiomeMapLand = { value: data.terrainBiomeMapLand ?? FALLBACK_TERRAIN_BIOME_MAPS.land };
        shader.uniforms.uGdBiomeOrmStone = { value: data.terrainBiomeOrmStone ?? FALLBACK_TERRAIN_BIOME_ORM_MAPS.stone };
        shader.uniforms.uGdBiomeOrmGrass = { value: data.terrainBiomeOrmGrass ?? FALLBACK_TERRAIN_BIOME_ORM_MAPS.grass };
        shader.uniforms.uGdBiomeOrmLand = { value: data.terrainBiomeOrmLand ?? FALLBACK_TERRAIN_BIOME_ORM_MAPS.land };
        shader.uniforms.uGdBiomeNormalArray = { value: data.terrainBiomeNormalArrayTex ?? FALLBACK_TERRAIN_BIOME_NORMAL_ARRAY_TEX };
        shader.uniforms.uGdBiomeOrmArray = { value: data.terrainBiomeOrmArrayTex ?? FALLBACK_TERRAIN_BIOME_ORM_ARRAY_TEX };
        shader.uniforms.uGdBiomeUvScaleStone = { value: data.terrainBiomeUvScaleStone ?? new THREE.Vector3(0.25, 0.25, 0.25) };
        shader.uniforms.uGdBiomeUvScaleGrass = { value: data.terrainBiomeUvScaleGrass ?? new THREE.Vector3(0.25, 0.25, 0.25) };
        shader.uniforms.uGdBiomeUvScaleLand = { value: data.terrainBiomeUvScaleLand ?? new THREE.Vector3(0.25, 0.25, 0.25) };
        shader.uniforms.uGdDecodeSrgbAlbedo = { value: Number(data.terrainDecodeSrgbAlbedo) || 0.0 };
        shader.uniforms.uGdHumidityThresholds = { value: data.terrainHumidityThresholds ?? new THREE.Vector4(0.33, 0.67, 0.02, 0.0) };
        shader.uniforms.uGdHumidityEdgeNoise = { value: data.terrainHumidityEdgeNoise ?? new THREE.Vector4(0.025, 0.0, 0.0, 0.0) };
        shader.uniforms.uGdHumidityEdgeNoiseTex = { value: data.terrainHumidityEdgeNoiseTex ?? FALLBACK_TERRAIN_HUMIDITY_EDGE_NOISE_TEX };
        shader.uniforms.uGdTilingDistance0 = { value: data.terrainTilingDistance0 ?? new THREE.Vector4(1.0, 1.0, 40.0, 240.0) };
        shader.uniforms.uGdTilingDistance1 = { value: data.terrainTilingDistance1 ?? new THREE.Vector4(1.0, 0.0, 0.0, 0.0) };
        shader.uniforms.uGdTilingVariation0 = { value: data.terrainTilingVariation0 ?? new THREE.Vector4(0.0, 0.45, 2.0, 0.0) };
        shader.uniforms.uGdTilingVariation1 = { value: data.terrainTilingVariation1 ?? new THREE.Vector4(0.16, 0.02, 1.0, 0.65) };
        shader.uniforms.uGdFeatureMask = { value: data.terrainBiomeFeatureMask ?? new THREE.Vector4(1.0, 1.0, 1.0, 1.0) };
        shader.uniforms.uGdForceRoughness = { value: data.terrainForceRoughness ?? new THREE.Vector2(0.0, 1.0) };

        const terrainShaderAlreadyPatched = shader.fragmentShader.includes('uniform sampler2D uGdTerrainMask;')
            && shader.fragmentShader.includes('uniform vec4 uGdFeatureMask;')
            && shader.fragmentShader.includes('varying vec2 vGdWorldUv;');
        if (terrainShaderAlreadyPatched) {
            if (!shader.fragmentShader.includes('uniform vec2 uGdForceRoughness;')) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    'uniform vec4 uGdFeatureMask;',
                    [
                        'uniform vec4 uGdFeatureMask;',
                        'uniform vec2 uGdForceRoughness;'
                    ].join('\n')
                );
            }
            if (!shader.fragmentShader.includes('uGdForceRoughness.x > 0.5')) {
                const oldRoughnessBranch = [
                    '#ifdef USE_ALBEDO_SATURATION_ADJUST',
                    'roughnessFactor = roughness * gdApplyTerrainRoughnessRemap(clamp(gdOrmR.g, 0.0, 1.0));',
                    '#else',
                    'roughnessFactor = roughness * clamp(gdOrmR.g, 0.0, 1.0);',
                    '#endif'
                ].join('\n');
                const newRoughnessBranch = [
                    'if (uGdForceRoughness.x > 0.5) {',
                    'roughnessFactor = roughness * clamp(uGdForceRoughness.y, 0.0, 1.0);',
                    '} else {',
                    '#ifdef USE_ALBEDO_SATURATION_ADJUST',
                    'roughnessFactor = roughness * gdApplyTerrainRoughnessRemap(clamp(gdOrmR.g, 0.0, 1.0));',
                    '#else',
                    'roughnessFactor = roughness * clamp(gdOrmR.g, 0.0, 1.0);',
                    '#endif',
                    '}'
                ].join('\n');
                if (shader.fragmentShader.includes(oldRoughnessBranch)) {
                    shader.fragmentShader = shader.fragmentShader.replace(oldRoughnessBranch, newRoughnessBranch);
                } else {
                    const fallbackOld = 'roughnessFactor = roughness * clamp(gdOrmR.g, 0.0, 1.0);';
                    const fallbackNew = [
                        'if (uGdForceRoughness.x > 0.5) {',
                        'roughnessFactor = roughness * clamp(uGdForceRoughness.y, 0.0, 1.0);',
                        '} else {',
                        fallbackOld,
                        '}'
                    ].join('\n');
                    shader.fragmentShader = shader.fragmentShader.replace(fallbackOld, fallbackNew);
                }
            }
            mat.userData.terrainBiomeBlendUniforms = shader.uniforms;
            return;
        }

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            [
                '#include <common>',
                '#ifdef USE_TERRAIN_BIOME_BLEND',
                'varying vec2 vGdWorldUv;',
                '#endif'
            ].join('\n')
        );

        // Use world XZ for mask + biome map sampling so we don't depend on the mesh UV setup.
        shader.vertexShader = shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            [
                '#include <worldpos_vertex>',
                '#ifdef USE_TERRAIN_BIOME_BLEND',
                // Anchor biome sampling to the undeformed mesh XZ so displacement does not slide albedo.
                'vGdWorldUv = (modelMatrix * vec4(position, 1.0)).xz;',
                '#endif'
            ].join('\n')
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            [
                '#include <common>',
                '#ifdef USE_TERRAIN_BIOME_BLEND',
                '#if __VERSION__ >= 300',
                '#define gdTex2D texture',
                '#else',
                '#define gdTex2D texture2D',
                '#endif',
                'varying vec2 vGdWorldUv;',
                'uniform sampler2D uGdTerrainMask;',
                'uniform vec4 uGdTerrainBounds;',
                'uniform vec2 uGdTerrainUvAnchor;',
                'uniform sampler2D uGdBiomeMapStone;',
                'uniform sampler2D uGdBiomeMapGrass;',
                'uniform sampler2D uGdBiomeMapLand;',
                'uniform sampler2D uGdBiomeOrmStone;',
                'uniform sampler2D uGdBiomeOrmGrass;',
                'uniform sampler2D uGdBiomeOrmLand;',
                'uniform vec3 uGdBiomeUvScaleStone;',
                'uniform vec3 uGdBiomeUvScaleGrass;',
                'uniform vec3 uGdBiomeUvScaleLand;',
                'uniform float uGdDecodeSrgbAlbedo;',
                'uniform vec4 uGdHumidityThresholds;',
                'uniform vec4 uGdHumidityEdgeNoise;',
                'uniform sampler2D uGdHumidityEdgeNoiseTex;',
                'uniform vec4 uGdTilingDistance0;',
                'uniform vec4 uGdTilingDistance1;',
                'uniform vec4 uGdTilingVariation0;',
                'uniform vec4 uGdTilingVariation1;',
                'uniform vec4 uGdFeatureMask;',
                'uniform vec2 uGdForceRoughness;',
                'vec3 gdSrgbToLinear(vec3 c){',
                'bvec3 cutoff = lessThanEqual(c, vec3(0.04045));',
                'vec3 lower = c / 12.92;',
                'vec3 higher = pow((c + 0.055) / 1.055, vec3(2.4));',
                'return mix(higher, lower, vec3(cutoff));',
                '}',
                'vec3 gdAlbedoTexelToLinear(vec3 c){',
                'float w = step(0.5, uGdDecodeSrgbAlbedo);',
                'return mix(c, gdSrgbToLinear(c), w);',
                '}',
                'vec2 gdTerrainMaskUv(vec2 worldUv){',
                'vec2 denom = vec2(max(1e-6, uGdTerrainBounds.y - uGdTerrainBounds.x), max(1e-6, uGdTerrainBounds.w - uGdTerrainBounds.z));',
                'vec2 uv = (worldUv - vec2(uGdTerrainBounds.x, uGdTerrainBounds.z)) / denom;',
                'return clamp(uv, 0.0, 1.0);',
                '}',
                'vec2 gdAnchoredUv(vec2 worldUv){',
                'return worldUv - uGdTerrainUvAnchor;',
                '}',
                'float gdHash12(vec2 p){',
                'return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
                '}',
                'vec2 gdRotate2(vec2 v, float a){',
                'float s = sin(a);',
                'float c = cos(a);',
                'return vec2(c * v.x - s * v.y, s * v.x + c * v.y);',
                '}',
                'float gdDistanceBlend01(vec2 worldUv){',
                'float startD = max(0.0, uGdTilingDistance0.z);',
                'float endD = max(startD + 1e-4, uGdTilingDistance0.w);',
                'float dist = distance(cameraPosition.xz, worldUv);',
                'float t = clamp((dist - startD) / max(1e-4, endD - startD), 0.0, 1.0);',
                'float curve = max(0.1, uGdTilingDistance1.x);',
                'return pow(t, curve);',
                '}',
                'vec2 gdAntiTileUv(vec2 uv, float cellMeters, float strength){',
                'float cell = max(1e-3, cellMeters);',
                'vec2 cellId = floor(uv / cell);',
                'vec2 local = fract(uv / cell) - 0.5;',
                'float h0 = gdHash12(cellId);',
                'float h1 = gdHash12(cellId + vec2(17.3, 91.7));',
                'float angle = (h0 - 0.5) * 1.57079632679 * strength;',
                'vec2 offset = (vec2(h1, gdHash12(cellId + vec2(53.9, 29.1))) - 0.5) * strength;',
                'vec2 rotated = gdRotate2(local, angle);',
                'return (cellId + rotated + 0.5) * cell + offset;',
                '}',
                'vec3 gdSampleTerrainAlbedo(sampler2D tex, vec2 worldUv, float uvScale){',
                'float nearScale = max(1e-4, uGdTilingDistance0.x);',
                'float farScale = max(1e-4, uGdTilingDistance0.y);',
                'float distanceEnabled = step(0.5, uGdTilingDistance1.z);',
                'float blend = gdDistanceBlend01(worldUv) * distanceEnabled;',
                'vec2 anchoredUv = gdAnchoredUv(worldUv);',
                'float debugMode = uGdTilingDistance1.y;',
                'if (debugMode > 1.5) blend = 1.0;',
                'else if (debugMode > 0.5) blend = 0.0;',
                'vec2 uvNear = anchoredUv * uvScale * nearScale;',
                'vec2 uvFar = anchoredUv * uvScale * mix(nearScale, farScale, distanceEnabled);',
                'float variationNear = max(0.0, uGdTilingVariation1.z);',
                'float variationFar = max(0.0, uGdTilingVariation1.w);',
                'float variationIntensity = mix(variationNear, variationFar, blend);',
                'float antiEnabled = step(0.5, uGdTilingVariation0.x);',
                'float antiStrength = max(0.0, uGdTilingVariation0.y) * antiEnabled * variationIntensity;',
                'float antiWeight = clamp(antiStrength, 0.0, 1.0);',
                'float antiCell = max(1e-3, uGdTilingVariation0.z);',
                'vec2 uvNearAlt = gdAntiTileUv(uvNear, antiCell, antiStrength);',
                'vec2 uvFarAlt = gdAntiTileUv(uvFar, antiCell, antiStrength);',
                'vec3 nearBase = gdAlbedoTexelToLinear(gdTex2D(tex, uvNear).rgb);',
                'vec3 farBase = gdAlbedoTexelToLinear(gdTex2D(tex, uvFar).rgb);',
                'vec3 nearAlt = gdAlbedoTexelToLinear(gdTex2D(tex, uvNearAlt).rgb);',
                'vec3 farAlt = gdAlbedoTexelToLinear(gdTex2D(tex, uvFarAlt).rgb);',
                'vec3 nearColor = mix(nearBase, nearAlt, antiWeight);',
                'vec3 farColor = mix(farBase, farAlt, antiWeight);',
                'vec3 color = mix(nearColor, farColor, blend);',
                'float macroEnabled = step(0.5, uGdTilingVariation0.w);',
                'float macroStrength = max(0.0, uGdTilingVariation1.x) * macroEnabled * variationIntensity;',
                'float macroScale = max(1e-5, uGdTilingVariation1.y);',
                'float macroNoise = gdTex2D(uGdHumidityEdgeNoiseTex, anchoredUv * macroScale).r * 2.0 - 1.0;',
                'float macroMul = max(0.0, 1.0 + macroNoise * macroStrength);',
                'return color * macroMul;',
                '}',
                'vec3 gdHumidityWeights(float humidity, vec2 worldUv){',
                'float h = clamp(humidity, 0.0, 1.0);',
                'float dryMax = clamp(uGdHumidityThresholds.x, 0.01, 0.98);',
                'float wetMin = clamp(uGdHumidityThresholds.y, dryMax + 0.01, 0.99);',
                'float band = max(1e-4, uGdHumidityThresholds.z);',
                'float halfBand = band * 0.5;',
                'float edgeScale = max(1e-6, uGdHumidityEdgeNoise.x);',
                'float edgeStrength = clamp(uGdHumidityEdgeNoise.y, 0.0, 1.0);',
                'float noise = gdTex2D(uGdHumidityEdgeNoiseTex, gdAnchoredUv(worldUv) * edgeScale).r * 2.0 - 1.0;',
                'float dryDist = abs(h - dryMax);',
                'float wetDist = abs(h - wetMin);',
                'float edgeMask = max(1.0 - smoothstep(halfBand, band, dryDist), 1.0 - smoothstep(halfBand, band, wetDist));',
                'h = clamp(h + noise * edgeStrength * edgeMask, 0.0, 1.0);',
                'if (h < dryMax - halfBand) return vec3(1.0, 0.0, 0.0);',
                'if (h > wetMin + halfBand) return vec3(0.0, 0.0, 1.0);',
                'if (h <= dryMax + halfBand) {',
                'float t = clamp((h - (dryMax - halfBand)) / max(1e-6, band), 0.0, 1.0);',
                'float neutralW = smoothstep(0.0, 1.0, t);',
                'return vec3(1.0 - neutralW, neutralW, 0.0);',
                '}',
                'if (h >= wetMin - halfBand) {',
                'float t = clamp((h - (wetMin - halfBand)) / max(1e-6, band), 0.0, 1.0);',
                'float wetW = smoothstep(0.0, 1.0, t);',
                'return vec3(0.0, 1.0 - wetW, wetW);',
                '}',
                'return vec3(0.0, 1.0, 0.0);',
                '}',
                'vec3 gdSampleBiomeHumidityPbr(',
                'sampler2D mapTex,',
                'vec3 uvScale, vec2 worldUv',
                '){',
                // Keep albedo UVs stable across humidity transitions. Humidity still affects biome weights,
                // but not the UV scale used to sample each biome albedo texture.
                'float uvStable = max(1e-5, uvScale.y);',
                'return gdSampleTerrainAlbedo(mapTex, worldUv, uvStable);',
                '}',
                'vec3 gdSampleTerrainLinearPbr(sampler2D tex, vec2 worldUv, float uvScale){',
                'float nearScale = max(1e-4, uGdTilingDistance0.x);',
                'float farScale = max(1e-4, uGdTilingDistance0.y);',
                'float distanceEnabled = step(0.5, uGdTilingDistance1.z);',
                'float blend = gdDistanceBlend01(worldUv) * distanceEnabled;',
                'vec2 anchoredUv = gdAnchoredUv(worldUv);',
                'float debugMode = uGdTilingDistance1.y;',
                'if (debugMode > 1.5) blend = 1.0;',
                'else if (debugMode > 0.5) blend = 0.0;',
                'vec2 uvNear = anchoredUv * uvScale * nearScale;',
                'vec2 uvFar = anchoredUv * uvScale * mix(nearScale, farScale, distanceEnabled);',
                'float variationNear = max(0.0, uGdTilingVariation1.z);',
                'float variationFar = max(0.0, uGdTilingVariation1.w);',
                'float variationIntensity = mix(variationNear, variationFar, blend);',
                'float antiEnabled = step(0.5, uGdTilingVariation0.x);',
                'float antiStrength = max(0.0, uGdTilingVariation0.y) * antiEnabled * variationIntensity;',
                'float antiWeight = clamp(antiStrength, 0.0, 1.0);',
                'float antiCell = max(1e-3, uGdTilingVariation0.z);',
                'vec2 uvNearAlt = gdAntiTileUv(uvNear, antiCell, antiStrength);',
                'vec2 uvFarAlt = gdAntiTileUv(uvFar, antiCell, antiStrength);',
                'vec3 nearBase = gdTex2D(tex, uvNear).rgb;',
                'vec3 farBase = gdTex2D(tex, uvFar).rgb;',
                'vec3 nearAlt = gdTex2D(tex, uvNearAlt).rgb;',
                'vec3 farAlt = gdTex2D(tex, uvFarAlt).rgb;',
                'vec3 nearColor = mix(nearBase, nearAlt, antiWeight);',
                'vec3 farColor = mix(farBase, farAlt, antiWeight);',
                'return mix(nearColor, farColor, blend);',
                '}',
                'vec3 gdTerrainOrmFromWeights(vec2 worldUv, vec3 humidityWeights, float wStone, float wGrass, float wLand){',
                'if (uGdFeatureMask.y < 0.5 || uGdFeatureMask.z < 0.5 || uGdFeatureMask.w < 0.5) return vec3(1.0, 1.0, 0.0);',
                // Physical response tracks the neutral humidity texture to keep sampler usage low and stable across GPUs.
                'float stoneScale = max(1e-5, uGdBiomeUvScaleStone.y);',
                'float grassScale = max(1e-5, uGdBiomeUvScaleGrass.y);',
                'float landScale = max(1e-5, uGdBiomeUvScaleLand.y);',
                'vec3 oStone = gdSampleTerrainLinearPbr(uGdBiomeOrmStone, worldUv, stoneScale);',
                'vec3 oGrass = gdSampleTerrainLinearPbr(uGdBiomeOrmGrass, worldUv, grassScale);',
                'vec3 oLand = gdSampleTerrainLinearPbr(uGdBiomeOrmLand, worldUv, landScale);',
                'return oStone * wStone + oGrass * wGrass + oLand * wLand;',
                '}',
                '#endif'
            ].join('\n')
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            [
                '#ifdef USE_TERRAIN_BIOME_BLEND',
                'vec2 gdWorldUv = vGdWorldUv;',
                'float gdFeatureAlbedo = step(0.5, uGdFeatureMask.x);',
                'float gdFeatureSurface = step(0.5, uGdFeatureMask.y);',
                'float gdFeatureBiome = step(0.5, uGdFeatureMask.z);',
                'float gdFeaturePbrLighting = step(0.5, uGdFeatureMask.w);',
                'float gdNeedBiomeMask = gdFeatureBiome * max(gdFeatureAlbedo, gdFeatureSurface * gdFeaturePbrLighting);',
                'int gdPrimary = 2;',
                'int gdSecondary = 2;',
                'float gdBlend = 0.0;',
                'float gdHumidity = 0.5;',
                'float wStone = 0.0;',
                'float wGrass = 0.0;',
                'float wLand = 1.0;',
                'vec3 gdHumidityWeights01 = vec3(0.0, 1.0, 0.0);',
                'if (gdNeedBiomeMask > 0.5) {',
                'vec4 gdMask = gdTex2D(uGdTerrainMask, gdTerrainMaskUv(gdWorldUv));',
                'gdPrimary = int(floor(gdMask.r * 255.0 + 0.5));',
                'gdSecondary = int(floor(gdMask.g * 255.0 + 0.5));',
                'gdBlend = clamp(gdMask.b, 0.0, 1.0);',
                'gdHumidity = clamp(gdMask.a, 0.0, 1.0);',
                'wStone = 0.0;',
                'wGrass = 0.0;',
                'wLand = 0.0;',
                'float wp = 1.0 - gdBlend;',
                'if (gdPrimary == 0) wStone += wp; else if (gdPrimary == 1) wGrass += wp; else wLand += wp;',
                'if (gdSecondary == 0) wStone += gdBlend; else if (gdSecondary == 1) wGrass += gdBlend; else wLand += gdBlend;',
                'gdHumidityWeights01 = gdHumidityWeights(gdHumidity, gdWorldUv);',
                '}',
                'if (gdFeatureAlbedo > 0.5) {',
                'vec3 gdMaterialDiffuse = diffuseColor.rgb;',
                'if (max(max(gdMaterialDiffuse.r, gdMaterialDiffuse.g), gdMaterialDiffuse.b) < 1e-4) gdMaterialDiffuse = vec3(1.0);',
                'if (gdFeatureBiome > 0.5) {',
                'vec3 cStone = gdSampleBiomeHumidityPbr(',
                'uGdBiomeMapStone,',
                'uGdBiomeUvScaleStone, gdWorldUv',
                ');',
                'vec3 cGrass = gdSampleBiomeHumidityPbr(',
                'uGdBiomeMapGrass,',
                'uGdBiomeUvScaleGrass, gdWorldUv',
                ');',
                'vec3 cLand = gdSampleBiomeHumidityPbr(',
                'uGdBiomeMapLand,',
                'uGdBiomeUvScaleLand, gdWorldUv',
                ');',
                'vec3 texelColor = cStone * wStone + cGrass * wGrass + cLand * wLand;',
                'diffuseColor.rgb = texelColor * gdMaterialDiffuse;',
                '} else {',
                '#ifdef USE_MAP',
                'float gdBaseUvScale = max(1e-5, uGdBiomeUvScaleLand.y);',
                'vec3 gdBaseColor = gdSampleTerrainAlbedo(map, gdWorldUv, gdBaseUvScale);',
                'diffuseColor.rgb = gdBaseColor * gdMaterialDiffuse;',
                '#else',
                '#include <map_fragment>',
                '#endif',
                '}',
                '#ifdef USE_ALBEDO_SATURATION_ADJUST',
                'diffuseColor.rgb = gdSaturateColor(diffuseColor.rgb, uAlbedoSaturationAdjust);',
                '#endif',
                '}',
                '#else',
                '#include <map_fragment>',
                '#endif'
            ].join('\n')
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normal_fragment_maps>',
            [
                '#ifdef USE_TERRAIN_BIOME_BLEND',
                '#include <normal_fragment_maps>',
                '#else',
                '#include <normal_fragment_maps>',
                '#endif'
            ].join('\n')
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <roughnessmap_fragment>',
            [
                '#ifdef USE_TERRAIN_BIOME_BLEND',
                '#include <roughnessmap_fragment>',
                'if (uGdFeatureMask.y <= 0.5) {',
                'roughnessFactor = roughness;',
                '} else if (uGdFeatureMask.z > 0.5 && uGdFeatureMask.w > 0.5) {',
                'if (uGdForceRoughness.x > 0.5) {',
                'roughnessFactor = roughness * clamp(uGdForceRoughness.y, 0.0, 1.0);',
                '} else {',
                'vec3 gdOrmR = gdTerrainOrmFromWeights(gdWorldUv, gdHumidityWeights01, wStone, wGrass, wLand);',
                '#ifdef USE_ALBEDO_SATURATION_ADJUST',
                'roughnessFactor = roughness * gdApplyTerrainRoughnessRemap(clamp(gdOrmR.g, 0.0, 1.0));',
                '#else',
                'roughnessFactor = roughness * clamp(gdOrmR.g, 0.0, 1.0);',
                '#endif',
                '}',
                '}',
                '#else',
                '#include <roughnessmap_fragment>',
                '#endif'
            ].join('\n')
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <metalnessmap_fragment>',
            [
                '#ifdef USE_TERRAIN_BIOME_BLEND',
                '#include <metalnessmap_fragment>',
                'if (uGdFeatureMask.y <= 0.5) {',
                'metalnessFactor = metalness;',
                '} else if (uGdFeatureMask.z > 0.5 && uGdFeatureMask.w > 0.5) {',
                'vec3 gdOrmM = gdTerrainOrmFromWeights(gdWorldUv, gdHumidityWeights01, wStone, wGrass, wLand);',
                // Match how ORM stacks are typically applied in PBR: map controls metalness directly.
                'metalnessFactor = clamp(gdOrmM.b, 0.0, 1.0);',
                '}',
                '#else',
                '#include <metalnessmap_fragment>',
                '#endif'
            ].join('\n')
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <aomap_fragment>',
            [
                '#ifdef USE_TERRAIN_BIOME_BLEND',
                'if (uGdFeatureMask.y > 0.5) {',
                'if (uGdFeatureMask.z > 0.5 && uGdFeatureMask.w > 0.5) {',
                'vec3 gdOrmA = gdTerrainOrmFromWeights(gdWorldUv, gdHumidityWeights01, wStone, wGrass, wLand);',
                'float gdAo = clamp(gdOrmA.r, 0.0, 1.0);',
                'float gdAoIntensity = 1.0;',
                '#ifdef USE_AOMAP',
                'gdAoIntensity = aoMapIntensity;',
                '#endif',
                'float ambientOcclusion = (gdAo - 1.0) * gdAoIntensity + 1.0;',
                'reflectedLight.indirectDiffuse *= ambientOcclusion;',
                '#if defined( USE_ENVMAP ) && defined( STANDARD )',
                'reflectedLight.indirectSpecular *= ambientOcclusion;',
                '#endif',
                '} else {',
                '#include <aomap_fragment>',
                '}',
                '}',
                '#else',
                '#include <aomap_fragment>',
                '#endif'
            ].join('\n')
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_begin>',
            [
                '#include <lights_fragment_begin>',
            ].join('\n')
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_maps>',
            [
                '#include <lights_fragment_maps>',
            ].join('\n')
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_end>',
            [
                '#include <lights_fragment_end>',
                '#ifdef USE_TERRAIN_BIOME_BLEND',
                'if (uGdFeatureMask.w <= 0.5) {',
                'reflectedLight.directDiffuse = vec3(0.0);',
                'reflectedLight.indirectDiffuse = diffuseColor.rgb;',
                'reflectedLight.directSpecular = vec3(0.0);',
                'reflectedLight.indirectSpecular = vec3(0.0);',
                '}',
                '#endif'
            ].join('\n')
        );

        mat.userData.terrainBiomeBlendUniforms = shader.uniforms;
    };

    mat.needsUpdate = true;
}

function setTerrainBiomeBlendShaderEnabledOnMaterial(material, enabled = true) {
    const mat = material?.isMeshStandardMaterial ? material : null;
    if (!mat) return;
    const wantsEnabled = enabled !== false;
    mat.userData = mat.userData ?? {};
    mat.userData.terrainBiomeBlendShaderEnabled = wantsEnabled;
    mat.defines = mat.defines ?? {};
    const hasEnabledDefine = Number(mat.defines.USE_TERRAIN_BIOME_BLEND) === 1;
    if (wantsEnabled && !hasEnabledDefine) {
        mat.defines.USE_TERRAIN_BIOME_BLEND = 1;
        mat.needsUpdate = true;
    } else if (!wantsEnabled && hasEnabledDefine) {
        delete mat.defines.USE_TERRAIN_BIOME_BLEND;
        mat.needsUpdate = true;
    }
}

function syncTerrainBiomeBlendUniformsOnMaterial(material) {
    const mat = material?.isMeshStandardMaterial ? material : null;
    const uniforms = mat?.userData?.terrainBiomeBlendUniforms ?? null;
    if (!uniforms || typeof uniforms !== 'object') return;
    const data = mat.userData ?? {};

    if (uniforms.uGdTerrainMask) uniforms.uGdTerrainMask.value = data.terrainEngineMaskTex ?? null;
    if (uniforms.uGdTerrainBounds) uniforms.uGdTerrainBounds.value = data.terrainEngineBounds ?? uniforms.uGdTerrainBounds.value;
    if (uniforms.uGdTerrainUvAnchor) uniforms.uGdTerrainUvAnchor.value = data.terrainUvAnchor ?? uniforms.uGdTerrainUvAnchor.value;
    if (uniforms.uGdBiomeMapStone) uniforms.uGdBiomeMapStone.value = data.terrainBiomeMapStone ?? FALLBACK_TERRAIN_BIOME_MAPS.stone;
    if (uniforms.uGdBiomeMapGrass) uniforms.uGdBiomeMapGrass.value = data.terrainBiomeMapGrass ?? FALLBACK_TERRAIN_BIOME_MAPS.grass;
    if (uniforms.uGdBiomeMapLand) uniforms.uGdBiomeMapLand.value = data.terrainBiomeMapLand ?? FALLBACK_TERRAIN_BIOME_MAPS.land;
    if (uniforms.uGdBiomeOrmStone) uniforms.uGdBiomeOrmStone.value = data.terrainBiomeOrmStone ?? FALLBACK_TERRAIN_BIOME_ORM_MAPS.stone;
    if (uniforms.uGdBiomeOrmGrass) uniforms.uGdBiomeOrmGrass.value = data.terrainBiomeOrmGrass ?? FALLBACK_TERRAIN_BIOME_ORM_MAPS.grass;
    if (uniforms.uGdBiomeOrmLand) uniforms.uGdBiomeOrmLand.value = data.terrainBiomeOrmLand ?? FALLBACK_TERRAIN_BIOME_ORM_MAPS.land;
    if (uniforms.uGdBiomeNormalArray) uniforms.uGdBiomeNormalArray.value = data.terrainBiomeNormalArrayTex ?? FALLBACK_TERRAIN_BIOME_NORMAL_ARRAY_TEX;
    if (uniforms.uGdBiomeOrmArray) uniforms.uGdBiomeOrmArray.value = data.terrainBiomeOrmArrayTex ?? FALLBACK_TERRAIN_BIOME_ORM_ARRAY_TEX;
    if (uniforms.uGdBiomeUvScaleStone) uniforms.uGdBiomeUvScaleStone.value = data.terrainBiomeUvScaleStone ?? uniforms.uGdBiomeUvScaleStone.value;
    if (uniforms.uGdBiomeUvScaleGrass) uniforms.uGdBiomeUvScaleGrass.value = data.terrainBiomeUvScaleGrass ?? uniforms.uGdBiomeUvScaleGrass.value;
    if (uniforms.uGdBiomeUvScaleLand) uniforms.uGdBiomeUvScaleLand.value = data.terrainBiomeUvScaleLand ?? uniforms.uGdBiomeUvScaleLand.value;
    if (uniforms.uGdDecodeSrgbAlbedo) uniforms.uGdDecodeSrgbAlbedo.value = Number(data.terrainDecodeSrgbAlbedo) || 0.0;
    if (uniforms.uGdHumidityThresholds) uniforms.uGdHumidityThresholds.value = data.terrainHumidityThresholds ?? uniforms.uGdHumidityThresholds.value;
    if (uniforms.uGdHumidityEdgeNoise) uniforms.uGdHumidityEdgeNoise.value = data.terrainHumidityEdgeNoise ?? uniforms.uGdHumidityEdgeNoise.value;
    if (uniforms.uGdHumidityEdgeNoiseTex) uniforms.uGdHumidityEdgeNoiseTex.value = data.terrainHumidityEdgeNoiseTex ?? FALLBACK_TERRAIN_HUMIDITY_EDGE_NOISE_TEX;
    if (uniforms.uGdTilingDistance0) uniforms.uGdTilingDistance0.value = data.terrainTilingDistance0 ?? uniforms.uGdTilingDistance0.value;
    if (uniforms.uGdTilingDistance1) uniforms.uGdTilingDistance1.value = data.terrainTilingDistance1 ?? uniforms.uGdTilingDistance1.value;
    if (uniforms.uGdTilingVariation0) uniforms.uGdTilingVariation0.value = data.terrainTilingVariation0 ?? uniforms.uGdTilingVariation0.value;
    if (uniforms.uGdTilingVariation1) uniforms.uGdTilingVariation1.value = data.terrainTilingVariation1 ?? uniforms.uGdTilingVariation1.value;
    if (uniforms.uGdForceRoughness) uniforms.uGdForceRoughness.value = data.terrainForceRoughness ?? uniforms.uGdForceRoughness.value;
    if (uniforms.uGdFeatureMask) {
        const featureMask = data.terrainBiomeFeatureMask;
        if (featureMask?.isVector4) {
            uniforms.uGdFeatureMask.value = featureMask;
        } else if (featureMask?.isVector2) {
            const w = uniforms.uGdFeatureMask?.value;
            if (w?.isVector4) w.set(featureMask.x, featureMask.y, 1.0, 1.0);
        }
    }
}

function ensureUv2(geo) {
    const g = geo?.isBufferGeometry ? geo : null;
    const uv = g?.attributes?.uv ?? null;
    if (!uv || !uv.isBufferAttribute) return;
    if (g.attributes.uv2) return;
    g.setAttribute('uv2', new THREE.BufferAttribute(uv.array.slice(0), 2));
}

function scaleUv(geo, scaleU, scaleV) {
    const g = geo?.isBufferGeometry ? geo : null;
    const uv = g?.attributes?.uv ?? null;
    if (!uv || !uv.isBufferAttribute) return;
    const uMul = Number(scaleU);
    const vMul = Number(scaleV);
    if (!Number.isFinite(uMul) || !Number.isFinite(vMul)) return;
    for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * uMul, uv.getY(i) * vMul);
    }
    uv.needsUpdate = true;
}

function smoothstep01(t) {
    const x = clamp(t, 0, 1, 0);
    return x * x * (3 - 2 * x);
}

function easeInOutQuint01(t) {
    const x = clamp(t, 0, 1, 0);
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (x < 0.5) return 16 * x * x * x * x * x;
    const inv = -2 * x + 2;
    return 1 - ((inv * inv * inv * inv * inv) / 2);
}

function easeInOutCubic01(t) {
    const x = clamp(t, 0, 1, 0);
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (x < 0.5) return 4 * x * x * x;
    const inv = -2 * x + 2;
    return 1 - ((inv * inv * inv) / 2);
}

function smoothstep(edge0, edge1, x) {
    const a = Number(edge0);
    const b = Number(edge1);
    const xx = Number(x);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(xx)) return 0;
    if (Math.abs(b - a) < EPS) return xx >= b ? 1 : 0;
    const t = clamp((xx - a) / (b - a), 0, 1, 0);
    return t * t * (3 - 2 * t);
}

function applyAdaptiveTransitionBlend01(t, { smoothing = 0.72, bias = 0.0 } = {}) {
    const tt = clamp(t, 0, 1, 0);
    const sm = clamp(smoothing, 0, 1, 0.72);
    const bz = clamp(bias, -0.85, 0.85, 0.0);
    const exponent = bz < 0
        ? (1 + (-bz * 4))
        : (1 / (1 + (bz * 4)));
    const biased = Math.pow(tt, exponent);
    const smooth = smoothstep01(biased);
    return biased + (smooth - biased) * sm;
}

function slerpUnitVector3(out, from, to, t) {
    const result = out?.isVector3 ? out : new THREE.Vector3();
    const fromDir = from?.isVector3 ? from : null;
    const toDir = to?.isVector3 ? to : null;
    if (!fromDir || !toDir) {
        result.set(0, 0, 1);
        return result;
    }

    const tt = clamp(t, 0, 1, 0);
    const dot = clamp(fromDir.dot(toDir), -1, 1, 1);
    if (dot > 0.9995 || dot < -0.9995) {
        result.copy(fromDir).lerp(toDir, tt);
        if (result.lengthSq() > EPS) result.normalize();
        else result.copy(toDir);
        return result;
    }

    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);
    if (Math.abs(sinTheta) <= EPS) {
        result.copy(fromDir).lerp(toDir, tt);
        if (result.lengthSq() > EPS) result.normalize();
        else result.copy(toDir);
        return result;
    }

    const w0 = Math.sin((1 - tt) * theta) / sinTheta;
    const w1 = Math.sin(tt * theta) / sinTheta;
    result.copy(fromDir).multiplyScalar(w0).addScaledVector(toDir, w1);
    if (result.lengthSq() > EPS) result.normalize();
    else result.copy(toDir);
    return result;
}

function terrainCloudHash2(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

function hashStringToUint32(value) {
    const s = String(value ?? '');
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i) & 0xff;
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function normalizeBiomeTilingLodPreset(value) {
    const v = String(value ?? '').trim().toLowerCase();
    if (v === 'low' || v === 'medium' || v === 'high') return v;
    return BIOME_TILING_LOD_DEFAULT_PRESET;
}

function getBiomeTilingLodPresetThresholdsTiles(preset) {
    const key = normalizeBiomeTilingLodPreset(preset);
    const src = BIOME_TILING_LOD_PRESET_THRESHOLDS_TILES[key] ?? BIOME_TILING_LOD_PRESET_THRESHOLDS_TILES[BIOME_TILING_LOD_DEFAULT_PRESET];
    return Array.isArray(src) ? src.slice(0, 4).map((n) => Math.max(0, Number(n) || 0)) : [0, 2, 4, 8];
}

function normalizeBiomeTilingRebuildCadence(value, { fallbackSeconds = 1.0 } = {}) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw || raw === 'off' || raw === 'none' || raw === 'no_auto') return 'off';
    if (raw === 'frame' || raw === '1f' || raw === 'f1') return 'frame';
    if (raw === 'frame_2' || raw === '2f' || raw === 'f2' || raw === '/2') return 'frame_2';
    if (raw === 'frame_8' || raw === '8f' || raw === 'f8' || raw === '/8') return 'frame_8';
    if (raw === '1s') return 'sec:1';

    const secMatch = raw.match(/^sec:([0-9]*\.?[0-9]+)$/);
    if (secMatch) {
        const sec = clamp(Number(secMatch[1]), 0.1, 60.0, fallbackSeconds);
        return `sec:${Number(sec.toFixed(2))}`;
    }

    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum > 0) {
        const sec = clamp(asNum, 0.1, 60.0, fallbackSeconds);
        return `sec:${Number(sec.toFixed(2))}`;
    }
    return 'off';
}

function getBiomeTilingRebuildCadenceSeconds(cadence, fallbackSeconds = 1.0) {
    const normalized = normalizeBiomeTilingRebuildCadence(cadence, { fallbackSeconds });
    if (normalized === 'off') return null;
    if (normalized === 'frame' || normalized === 'frame_2' || normalized === 'frame_8') return null;
    const sec = Number(normalized.slice(4));
    if (!Number.isFinite(sec)) return clamp(fallbackSeconds, 0.1, 60.0, 1.0);
    if (sec <= EPS) return 0;
    return clamp(sec, 0.1, 60.0, fallbackSeconds);
}

function buildBiomeTilingLodCountsMap() {
    const out = {};
    for (const level of BIOME_TILING_LOD_QUAD_LEVELS) out[String(level)] = 0;
    return out;
}

function resolveBiomeTilingLodQuadsForDistanceTiles(distanceTiles, thresholdsTiles) {
    const d = Math.max(0, Number(distanceTiles) || 0);
    const t = Array.isArray(thresholdsTiles) ? thresholdsTiles : [0, 2, 4, 8];
    const t0 = Math.max(0, Number(t[0]) || 0);
    const t1 = Math.max(t0, Number(t[1]) || t0);
    const t2 = Math.max(t1, Number(t[2]) || t1);
    const t3 = Math.max(t2, Number(t[3]) || t2);
    if (d <= t0 + EPS) return 256;
    if (d <= t1 + EPS) return 64;
    if (d <= t2 + EPS) return 16;
    if (d <= t3 + EPS) return 4;
    return 1;
}

const TERRAIN_CLOUD_NOISE_SAMPLER = createValueNoise2DSampler({
    hashU32: (ix, iy) => terrainCloudHash2(ix, iy),
    smoothing: 'hermite'
});

function sampleTerrainCloudFbm2(x, y) {
    return sampleFbm2D(x, y, {
        noise2: TERRAIN_CLOUD_NOISE_SAMPLER.sample,
        octaves: 4,
        gain: 0.5,
        initialAmplitude: 0.5,
        normalize: false,
        advance: ({ x: fx, y: fy }) => ({
            x: fx * 2.03 + 17.7,
            y: fy * 2.11 + 31.3
        })
    });
}

function buildAdaptiveAxisCoordinates({
    min = 0,
    max = 1,
    center = 0,
    nearRadius = 0,
    transitionWidth = 0,
    nearStep = 1,
    farStep = 1,
    transitionSmoothing = 0.72,
    transitionBias = 0.0
} = {}) {
    const lo = Math.min(Number(min) || 0, Number(max) || 0);
    const hi = Math.max(Number(min) || 0, Number(max) || 0);
    if (!(hi > lo + EPS)) return [lo, hi];

    const c = clamp(center, lo, hi, (lo + hi) * 0.5);
    const nearR = Math.max(0, Number(nearRadius) || 0);
    const transition = Math.max(0, Number(transitionWidth) || 0);
    const outerR = nearR + transition;
    const fineStep = Math.max(EPS, Number(nearStep) || EPS);
    const coarseStep = Math.max(EPS, Number(farStep) || fineStep);
    const smoothing = clamp(transitionSmoothing, 0, 1, 0.72);
    const bias = clamp(transitionBias, -0.85, 0.85, 0.0);

    const stepAtDistance = (distance) => {
        const d = Math.max(0, Number(distance) || 0);
        if (d <= nearR + EPS) return fineStep;
        if (transition <= EPS || d >= outerR - EPS) return coarseStep;
        const t = clamp((d - nearR) / Math.max(EPS, transition), 0, 1, 0);
        const blend = applyAdaptiveTransitionBlend01(t, {
            smoothing,
            bias
        });
        return fineStep + (coarseStep - fineStep) * blend;
    };

    const values = [c];
    const appendSide = (direction) => {
        let pos = c;
        const end = direction < 0 ? lo : hi;
        while (Math.abs(pos - end) > EPS) {
            const dist = Math.abs(pos - c);
            const step = stepAtDistance(dist);
            let next = pos + (direction * step);

            const nearEdge = c + (direction * nearR);
            const outerEdge = c + (direction * outerR);
            if (direction < 0) {
                if (nearEdge < pos - EPS && nearEdge > next + EPS) next = nearEdge;
                if (outerEdge < pos - EPS && outerEdge > next + EPS) next = outerEdge;
                if (next < lo) next = lo;
            } else {
                if (nearEdge > pos + EPS && nearEdge < next - EPS) next = nearEdge;
                if (outerEdge > pos + EPS && outerEdge < next - EPS) next = outerEdge;
                if (next > hi) next = hi;
            }

            if (Math.abs(next - pos) <= EPS) break;
            values.push(next);
            pos = next;
            if (Math.abs(pos - end) <= EPS) break;
        }
    };

    appendSide(-1);
    appendSide(1);
    values.sort((a, b) => a - b);

    const deduped = [];
    for (const raw of values) {
        const value = clamp(raw, lo, hi, lo);
        if (!deduped.length || Math.abs(value - deduped[deduped.length - 1]) > 1e-4) deduped.push(value);
    }
    if (!deduped.length) deduped.push(lo, hi);
    if (deduped[0] > lo + 1e-4) deduped.unshift(lo);
    else deduped[0] = lo;
    if (deduped[deduped.length - 1] < hi - 1e-4) deduped.push(hi);
    else deduped[deduped.length - 1] = hi;
    return deduped;
}

function buildTerrainGeometry(spec = {}) {
    const tileSize = Number(spec?.tileSize) || 24;
    const widthTiles = Number(spec?.widthTiles) || 11;
    const depthTiles = Number(spec?.depthTiles) || 16;
    const segmentsPerTile = spec?.segmentsPerTile ?? 8;
    const tileMinX = spec?.tileMinX ?? -5;
    const tileMinZ = spec?.tileMinZ ?? -10;
    const slopeDegLeft = spec?.slope?.leftDeg ?? spec?.slopeDegLeft ?? 1.5;
    const slopeDegRight = spec?.slope?.rightDeg ?? spec?.slopeDegRight ?? 3.5;
    const slopeDegEnd = spec?.slope?.endDeg ?? spec?.slopeDegEnd ?? 3;
    const slopeEndStartAfterRoadTiles = spec?.slope?.endStartAfterRoadTiles ?? spec?.slopeEndStartAfterRoadTiles ?? 0;
    const slopeBottomCurveMeters = spec?.slope?.bottomCurveMeters ?? 36;
    const slopeTopFlatMeters = spec?.slope?.topFlatMeters ?? 24;
    const roadSpec = spec?.road && typeof spec.road === 'object' ? spec.road : null;
    const cloudSpec = spec?.cloud && typeof spec.cloud === 'object' ? spec.cloud : null;
    const boundsSpec = spec?.bounds && typeof spec.bounds === 'object'
        ? spec.bounds
        : null;
    let minX = (tileMinX - 0.5) * tileSize;
    let minZ = (tileMinZ - 0.5) * tileSize;
    let maxX = minX + Math.max(1, widthTiles) * tileSize;
    let maxZ = minZ + Math.max(1, depthTiles) * tileSize;
    const boundsMinX = Number(boundsSpec?.minX);
    const boundsMaxX = Number(boundsSpec?.maxX);
    const boundsMinZ = Number(boundsSpec?.minZ);
    const boundsMaxZ = Number(boundsSpec?.maxZ);
    if (
        Number.isFinite(boundsMinX)
        && Number.isFinite(boundsMaxX)
        && Number.isFinite(boundsMinZ)
        && Number.isFinite(boundsMaxZ)
        && boundsMaxX > boundsMinX + EPS
        && boundsMaxZ > boundsMinZ + EPS
    ) {
        minX = boundsMinX;
        maxX = boundsMaxX;
        minZ = boundsMinZ;
        maxZ = boundsMaxZ;
    }
    const spanX = Math.max(EPS, maxX - minX);
    const spanZ = Math.max(EPS, maxZ - minZ);
    const widthTilesApprox = spanX / Math.max(EPS, tileSize);
    const depthTilesApprox = spanZ / Math.max(EPS, tileSize);
    const maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX));

    const adaptiveRingsSrc = spec?.adaptiveRings && typeof spec.adaptiveRings === 'object'
        ? spec.adaptiveRings
        : null;
    const adaptiveEnabled = adaptiveRingsSrc?.enabled === true;

    const seg = Math.max(1, segmentsPerTile | 0);
    let xCoords = null;
    let zCoords = null;
    let adaptiveConfig = {
        enabled: false,
        centerX: (minX + maxX) * 0.5,
        centerZ: (minZ + maxZ) * 0.5,
        nearRadiusMeters: 0,
        transitionWidthMeters: 0,
        transitionSmoothing: 0.72,
        transitionBias: 0.0,
        transitionDebugBands: 3,
        nearSegmentsPerTile: seg,
        farSegmentsPerTile: seg
    };

    if (adaptiveEnabled) {
        const nearSegmentsPerTile = Math.max(1, Math.round(Number(adaptiveRingsSrc?.nearSegmentsPerTile) || seg));
        const farSegmentsPerTile = Math.max(1, Math.round(Number(adaptiveRingsSrc?.farSegmentsPerTile) || seg));
        const nearRadiusMeters = Math.max(0, Number(adaptiveRingsSrc?.nearRadiusMeters) || 0);
        const transitionWidthMeters = Math.max(0, Number(adaptiveRingsSrc?.transitionWidthMeters) || 0);
        const transitionSmoothing = clamp(adaptiveRingsSrc?.transitionSmoothing, 0.0, 1.0, 0.72);
        const transitionBias = clamp(adaptiveRingsSrc?.transitionBias, -0.85, 0.85, 0.0);
        const transitionDebugBandsRaw = Number(adaptiveRingsSrc?.transitionDebugBands);
        const transitionDebugBands = Math.max(
            0,
            Math.min(6, Math.round(Number.isFinite(transitionDebugBandsRaw) ? transitionDebugBandsRaw : 3))
        );
        const centerX = clamp(adaptiveRingsSrc?.centerX, minX, maxX, (minX + maxX) * 0.5);
        const centerZ = clamp(adaptiveRingsSrc?.centerZ, minZ, maxZ, (minZ + maxZ) * 0.5);
        const nearStep = tileSize / Math.max(1, nearSegmentsPerTile);
        const farStep = tileSize / Math.max(1, farSegmentsPerTile);

        xCoords = buildAdaptiveAxisCoordinates({
            min: minX,
            max: maxX,
            center: centerX,
            nearRadius: nearRadiusMeters,
            transitionWidth: transitionWidthMeters,
            nearStep,
            farStep,
            transitionSmoothing,
            transitionBias
        });
        zCoords = buildAdaptiveAxisCoordinates({
            min: minZ,
            max: maxZ,
            center: centerZ,
            nearRadius: nearRadiusMeters,
            transitionWidth: transitionWidthMeters,
            nearStep,
            farStep,
            transitionSmoothing,
            transitionBias
        });

        adaptiveConfig = {
            enabled: true,
            centerX,
            centerZ,
            nearRadiusMeters,
            transitionWidthMeters,
            transitionSmoothing,
            transitionBias,
            transitionDebugBands,
            nearSegmentsPerTile,
            farSegmentsPerTile
        };
    }

    const nxFallback = Math.max(1, Math.round(widthTilesApprox * seg));
    const nzFallback = Math.max(1, Math.round(depthTilesApprox * seg));
    let nx = Math.max(1, (Array.isArray(xCoords) && xCoords.length > 1) ? (xCoords.length - 1) : nxFallback);
    let nz = Math.max(1, (Array.isArray(zCoords) && zCoords.length > 1) ? (zCoords.length - 1) : nzFallback);
    let dx = spanX / Math.max(1, nx);
    let dz = spanZ / Math.max(1, nz);

    let positions = null;
    let uvs = null;
    let indices = null;
    let minY = Infinity;
    let maxY = -Infinity;

    const tanLeft = Math.tan(THREE.MathUtils.degToRad(clamp(slopeDegLeft, 0, 89.9, 1.5)));
    const tanRight = Math.tan(THREE.MathUtils.degToRad(clamp(slopeDegRight, 0, 89.9, 3.5)));
    const tanEnd = Math.tan(THREE.MathUtils.degToRad(clamp(slopeDegEnd, -89.9, 89.9, 3)));
    const roadEnabled = roadSpec?.enabled !== false;
    const roadWidthMeters = Math.max(0, Number(roadSpec?.widthMeters) || 0);
    const roadHalfWidth = roadWidthMeters > EPS ? roadWidthMeters * 0.5 : 0;
    const roadFlatRowsEachSide = Math.max(0, Math.round(Number(roadSpec?.flatRowsEachSide) || 0));
    const roadFlatExtraMeters = roadFlatRowsEachSide * tileSize;
    const roadFlatBaseHalfWidth = roadHalfWidth > EPS ? (Math.ceil(roadHalfWidth / tileSize) * tileSize) : 0;
    const roadFlatHalfWidth = roadFlatBaseHalfWidth + roadFlatExtraMeters;
    const roadZ0 = Number(roadSpec?.z0);
    const roadZ1 = Number(roadSpec?.z1);
    const roadBaseY = Number.isFinite(roadSpec?.baseY) ? Number(roadSpec.baseY) : 0;
    const roadEdgeBlend = Math.max(0, Number(roadSpec?.edgeBlendMeters) || 0);
    const roadZBlend = Math.max(0, Number(roadSpec?.zBlendMeters) || 0);
    const endStartAfterRoadMeters = Math.max(0, Number(slopeEndStartAfterRoadTiles) || 0) * tileSize;
    const endSlopeBlendMeters = tileSize * 2;
    const endSlopeStartZRaw = (roadEnabled && Number.isFinite(roadZ0) && Number.isFinite(roadZ1))
        ? (Math.min(roadZ0, roadZ1) - endStartAfterRoadMeters)
        : maxZ;
    const endSlopeStartZ = clamp(endSlopeStartZRaw, minZ, maxZ, maxZ);

    const slopeBottomCurve = Math.max(0, Number(slopeBottomCurveMeters) || 0);
    const slopeTopFlat = Math.max(0, Number(slopeTopFlatMeters) || 0);
    const slopeDMax = Math.max(EPS, maxAbsX - roadFlatHalfWidth);
    const plateauStart = Math.max(0, slopeDMax - slopeTopFlat);

    const cloudEnabled = !!cloudSpec?.enabled;
    const cloudAmplitude = clamp(cloudSpec?.amplitude, 0.0, 200.0, 0.0);
    const cloudWorldScale = clamp(cloudSpec?.worldScale, 0.0001, 10.0, 0.085);
    const cloudBlendMeters = clamp(cloudSpec?.blendMeters, 0.0, 1000.0, tileSize);
    const cloudTiles = Math.max(0, cloudSpec?.tiles ?? 5);
    const cloudFbmMax = 0.9375;
    const cloudFbmAmp = cloudFbmMax > EPS ? (cloudAmplitude / cloudFbmMax) : 0;
    const cloudZ0 = minZ;
    const cloudZ1 = cloudZ0 + cloudTiles * tileSize;
    const cloudRoadBlend = roadEdgeBlend > EPS ? roadEdgeBlend : Math.max(EPS, tileSize * 0.25);
    const waveSpec = spec?.wave && typeof spec.wave === 'object' ? spec.wave : null;
    const waveEnabled = waveSpec?.enabled === true;
    const waveStrength01 = clamp(waveSpec?.strength, 0.0, 1.0, 0.02);
    const waveMaxHeightMeters = clamp(
        waveSpec?.maxHeightMeters,
        0.0,
        BIOME_TILING_WAVE_HARD_MAX_HEIGHT_METERS,
        BIOME_TILING_WAVE_DEFAULT_MAX_HEIGHT_METERS
    );
    const waveMaxNeighborDeltaMeters = clamp(
        waveSpec?.maxNeighborDeltaMeters,
        0.0,
        BIOME_TILING_WAVE_HARD_MAX_NEIGHBOR_DELTA_METERS,
        BIOME_TILING_WAVE_DEFAULT_MAX_NEIGHBOR_DELTA_METERS
    );
    const waveMaxTileRangeMeters = clamp(
        waveSpec?.maxTileRangeMeters,
        0.0,
        BIOME_TILING_WAVE_HARD_MAX_TILE_RANGE_METERS,
        BIOME_TILING_WAVE_DEFAULT_MAX_TILE_RANGE_METERS
    );
    const waveAmplitudeMeters = waveEnabled
        ? clamp(waveStrength01 * waveMaxHeightMeters, 0.0, waveMaxHeightMeters, 0.0)
        : 0.0;
    const waveReferenceStepMeters = Math.max(
        0.25,
        Number.isFinite(Number(waveSpec?.neighborReferenceStepMeters))
            ? Number(waveSpec.neighborReferenceStepMeters)
            : 0.5
    );
    const waveSeed = Number(waveSpec?.seed);
    const waveSeedX = Number.isFinite(waveSeed) ? waveSeed * 31.123 : 173.37;
    const waveSeedZ = Number.isFinite(waveSeed) ? waveSeed * 57.731 : -91.17;
    const waveSlopeBudget = waveAmplitudeMeters > EPS
        ? (waveMaxNeighborDeltaMeters / Math.max(EPS, waveAmplitudeMeters * waveReferenceStepMeters))
        : 0;
    const waveTileRangeGain = 1.2;
    const waveTileRangeBudget = waveAmplitudeMeters > EPS
        ? (waveMaxTileRangeMeters / Math.max(EPS, waveAmplitudeMeters * tileSize * waveTileRangeGain))
        : 0;
    const waveFreqMaxRadPerMeter = 0.45;
    const waveFreqRadPerMeter = waveAmplitudeMeters > EPS
        ? clamp(
            Math.min(waveFreqMaxRadPerMeter, waveSlopeBudget * 0.9, waveTileRangeBudget * 0.9),
            0.004,
            waveFreqMaxRadPerMeter,
            0.12
        )
        : 0;

    const computeHillHeight = (d, tanSlope) => {
        const dist = Number(d);
        if (!(dist > EPS)) return 0;
        const tan = Number(tanSlope);
        if (!Number.isFinite(tan)) return 0;

        const L = slopeBottomCurve;
        if (L > EPS) {
            if (dist < L) {
                const t = clamp(dist / L, 0, 1, 0);
                const t2 = t * t;
                const t3 = t2 * t;
                const t4 = t2 * t2;
                return tan * L * (t3 - 0.5 * t4);
            }
            return tan * (dist - 0.5 * L);
        }

        return tan * dist;
    };

    const computeHill = (absX, tanSlope) => {
        if (!(absX > roadFlatHalfWidth + EPS)) return roadBaseY;
        const d = absX - roadFlatHalfWidth;
        const hRaw = computeHillHeight(d, tanSlope);
        if (!(slopeTopFlat > EPS) || !(d > plateauStart + EPS)) return roadBaseY + hRaw;
        const hPlateau = computeHillHeight(plateauStart, tanSlope);
        return roadBaseY + Math.min(hRaw, hPlateau);
    };

    const computeWorldY = (worldX, worldZ) => {
        const absX = Math.abs(worldX);
        const tanSlope = worldX < 0 ? tanLeft : tanRight;
        let y = computeHill(absX, tanSlope);

        if (Math.abs(tanEnd) > EPS) {
            const zDist = endSlopeStartZ - worldZ;
            if (zDist > EPS) {
                const w = smoothstep(0, endSlopeBlendMeters, zDist);
                y += tanEnd * zDist * w;
            }
        }

        if (cloudEnabled) {
            const cloudW = 1 - smoothstep(cloudZ1, cloudZ1 + cloudBlendMeters, worldZ);
            if (cloudW > EPS) {
                const flatX = (roadEnabled && roadFlatHalfWidth > EPS)
                    ? (1 - smoothstep(roadFlatHalfWidth, roadFlatHalfWidth + cloudRoadBlend, absX))
                    : 0;
                const w = cloudW * (1 - flatX);
                if (w > EPS) {
                    const n = sampleTerrainCloudFbm2(worldX * cloudWorldScale, worldZ * cloudWorldScale) * cloudFbmAmp * w;
                    y += n;
                }
            }
        }

        if (waveAmplitudeMeters > EPS && waveFreqRadPerMeter > EPS) {
            const xA = (worldX + waveSeedX) * waveFreqRadPerMeter;
            const zA = (worldZ + waveSeedZ) * waveFreqRadPerMeter;
            const diagA = (worldX + worldZ + (waveSeedX * 0.37)) * (waveFreqRadPerMeter * 0.37);
            const wave = waveAmplitudeMeters * (
                (Math.sin(xA) * 0.55)
                + (Math.cos(zA * 1.11) * 0.35)
                + (Math.sin(diagA) * 0.10)
            );
            y += clamp(wave, -waveMaxHeightMeters, waveMaxHeightMeters, 0.0);
        }

        if (roadEnabled && roadHalfWidth > EPS) {
            const wX = 1 - smoothstep(roadHalfWidth, roadHalfWidth + roadEdgeBlend, absX);
            let wZ = 1;
            if (Number.isFinite(roadZ0) && Number.isFinite(roadZ1) && roadZBlend > EPS) {
                const zMin = Math.min(roadZ0, roadZ1);
                const zMax = Math.max(roadZ0, roadZ1);
                wZ = smoothstep(zMin - roadZBlend, zMin, worldZ) * (1 - smoothstep(zMax, zMax + roadZBlend, worldZ));
            }
            const w = wX * wZ;
            if (w > EPS) y = y * (1 - w) + roadBaseY * w;
        }

        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        return y;
    };

    const ringQuadAdaptiveEnabled = adaptiveEnabled === true;
    if (ringQuadAdaptiveEnabled) {
        const centerX = Number(adaptiveConfig.centerX);
        const centerZ = Number(adaptiveConfig.centerZ);
        const nearRadius = Math.max(0, Number(adaptiveConfig.nearRadiusMeters) || 0);
        const transitionWidth = Math.max(0, Number(adaptiveConfig.transitionWidthMeters) || 0);
        const outerRadius = nearRadius + transitionWidth;
        const maxRingRadius = Math.max(
            Math.abs(minX - centerX),
            Math.abs(maxX - centerX),
            Math.abs(minZ - centerZ),
            Math.abs(maxZ - centerZ)
        );
        const coverageRadius = Math.max(outerRadius, maxRingRadius);
        const nearStep = Math.max(EPS, tileSize / Math.max(1, Number(adaptiveConfig.nearSegmentsPerTile) || seg));
        const farStep = Math.max(EPS, tileSize / Math.max(1, Number(adaptiveConfig.farSegmentsPerTile) || seg));
        if (coverageRadius > EPS) {
            const transitionBands = Math.max(1, Math.round(Number(adaptiveConfig.transitionDebugBands) || 0) + 1);
            const stepAtDistance = (distance) => {
                const d = Math.max(0, Number(distance) || 0);
                if (d <= nearRadius + EPS) return nearStep;
                if (transitionWidth <= EPS || d >= outerRadius - EPS) return farStep;
                const t = clamp((d - nearRadius) / Math.max(EPS, transitionWidth), 0, 1, 0);
                const blend = applyAdaptiveTransitionBlend01(t, {
                    smoothing: adaptiveConfig.transitionSmoothing,
                    bias: adaptiveConfig.transitionBias
                });
                return nearStep + (farStep - nearStep) * blend;
            };

            const ringEdges = [0];
            if (nearRadius > EPS) ringEdges.push(nearRadius);
            if (transitionWidth > EPS) {
                for (let i = 1; i <= transitionBands; i++) {
                    ringEdges.push(nearRadius + transitionWidth * (i / transitionBands));
                }
            } else if (outerRadius > EPS) {
                ringEdges.push(outerRadius);
            }
            ringEdges.sort((a, b) => a - b);
            const dedupEdges = [];
            for (const r of ringEdges) {
                const rr = Math.max(0, Number(r) || 0);
                if (!dedupEdges.length || Math.abs(rr - dedupEdges[dedupEdges.length - 1]) > 1e-4) dedupEdges.push(rr);
            }
            if (dedupEdges.length < 2) dedupEdges.push(coverageRadius);
            if (dedupEdges[dedupEdges.length - 1] < coverageRadius - 1e-4) dedupEdges.push(coverageRadius);
            if (dedupEdges.length < 3 && coverageRadius > EPS) {
                const mid = coverageRadius * 0.5;
                if (mid > EPS && mid < coverageRadius - EPS) dedupEdges.splice(1, 0, mid);
            }

            const bands = [];
            for (let i = 0; i < dedupEdges.length - 1; i++) {
                const inner = dedupEdges[i];
                const outer = dedupEdges[i + 1];
                if (!(outer > inner + EPS)) continue;
                const mid = inner + (outer - inner) * 0.5;
                bands.push({
                    inner,
                    outer,
                    step: Math.max(EPS, stepAtDistance(mid))
                });
            }

            if (bands.length > 0) {
                let estQuads = 0;
                for (const band of bands) {
                    const area = Math.max(0, 4 * (band.outer * band.outer - band.inner * band.inner));
                    estQuads += area / Math.max(EPS, band.step * band.step);
                }
                if (estQuads > BIOME_TILING_DISPLACEMENT_OVERLAY_MAX_QUADS_PER_BUILD) {
                    const scale = Math.sqrt(estQuads / BIOME_TILING_DISPLACEMENT_OVERLAY_MAX_QUADS_PER_BUILD);
                    for (const band of bands) band.step = Math.max(EPS, band.step * scale);
                }

                const posList = [];
                const uvList = [];
                const idxList = [];
                let vertexBase = 0;
                const pushQuad = (x0, z0, x1, z1) => {
                    const y00 = computeWorldY(x0, z0);
                    const y10 = computeWorldY(x1, z0);
                    const y01 = computeWorldY(x0, z1);
                    const y11 = computeWorldY(x1, z1);
                    posList.push(
                        x0, y00, z0,
                        x1, y10, z0,
                        x0, y01, z1,
                        x1, y11, z1
                    );
                    uvList.push(
                        x0, z0,
                        x1, z0,
                        x0, z1,
                        x1, z1
                    );
                    idxList.push(
                        vertexBase,
                        vertexBase + 2,
                        vertexBase + 1,
                        vertexBase + 1,
                        vertexBase + 2,
                        vertexBase + 3
                    );
                    vertexBase += 4;
                };

                for (const band of bands) {
                    const inner = band.inner;
                    const outer = band.outer;
                    const step = band.step;
                    const bandMinX = clamp(centerX - outer, minX, maxX, minX);
                    const bandMaxX = clamp(centerX + outer, minX, maxX, maxX);
                    const bandMinZ = clamp(centerZ - outer, minZ, maxZ, minZ);
                    const bandMaxZ = clamp(centerZ + outer, minZ, maxZ, maxZ);
                    if (!(bandMaxX > bandMinX + EPS && bandMaxZ > bandMinZ + EPS)) continue;

                    const startX = minX + Math.floor((bandMinX - minX) / step) * step;
                    const startZ = minZ + Math.floor((bandMinZ - minZ) / step) * step;
                    const endX = minX + Math.ceil((bandMaxX - minX) / step) * step;
                    const endZ = minZ + Math.ceil((bandMaxZ - minZ) / step) * step;
                    const zCount = Math.max(1, Math.ceil((endZ - startZ) / Math.max(EPS, step)));
                    const xCount = Math.max(1, Math.ceil((endX - startX) / Math.max(EPS, step)));
                    for (let zi = 0; zi < zCount; zi++) {
                        const z = startZ + zi * step;
                        const z0 = clamp(z, bandMinZ, bandMaxZ, bandMinZ);
                        const z1 = clamp(z + step, bandMinZ, bandMaxZ, bandMaxZ);
                        if (!(z1 > z0 + EPS)) continue;
                        for (let xi = 0; xi < xCount; xi++) {
                            const x = startX + xi * step;
                            const x0 = clamp(x, bandMinX, bandMaxX, bandMinX);
                            const x1 = clamp(x + step, bandMinX, bandMaxX, bandMaxX);
                            if (!(x1 > x0 + EPS)) continue;
                            const cx = (x0 + x1) * 0.5;
                            const cz = (z0 + z1) * 0.5;
                            const ringDist = Math.max(Math.abs(cx - centerX), Math.abs(cz - centerZ));
                            if (ringDist > outer + 1e-4) continue;
                            if (ringDist <= inner + 1e-4 && inner > EPS) continue;
                            pushQuad(x0, z0, x1, z1);
                        }
                    }
                }

                if (vertexBase > 0 && idxList.length > 0) {
                    positions = new Float32Array(posList);
                    uvs = new Float32Array(uvList);
                    indices = new Uint32Array(idxList);
                    const avgStep = coverageRadius / Math.max(1, bands.length);
                    nx = Math.max(1, Math.round((coverageRadius * 2) / Math.max(EPS, avgStep)));
                    nz = Math.max(1, bands.length);
                    dx = avgStep;
                    dz = avgStep;
                }
            }
        }
    }

    if (!positions || !uvs || !indices) {
        positions = new Float32Array((nx + 1) * (nz + 1) * 3);
        uvs = new Float32Array((nx + 1) * (nz + 1) * 2);

        for (let z = 0; z <= nz; z++) {
            const worldZ = Array.isArray(zCoords) ? zCoords[z] : (minZ + z * dz);
            for (let x = 0; x <= nx; x++) {
                const worldX = Array.isArray(xCoords) ? xCoords[x] : (minX + x * dx);
                const y = computeWorldY(worldX, worldZ);
                const idx = z * (nx + 1) + x;
                positions[idx * 3] = worldX;
                positions[idx * 3 + 1] = y;
                positions[idx * 3 + 2] = worldZ;
                uvs[idx * 2] = worldX;
                uvs[idx * 2 + 1] = worldZ;
            }
        }

        indices = new Uint32Array(nx * nz * 6);
        let k = 0;
        for (let z = 0; z < nz; z++) {
            for (let x = 0; x < nx; x++) {
                const a = z * (nx + 1) + x;
                const b = a + 1;
                const c = a + (nx + 1);
                const d = c + 1;
                indices[k++] = a;
                indices[k++] = c;
                indices[k++] = b;
                indices[k++] = b;
                indices[k++] = c;
                indices[k++] = d;
            }
        }
    }

    if (!Number.isFinite(minY)) minY = roadBaseY;
    if (!Number.isFinite(maxY)) maxY = minY;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    ensureUv2(geo);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    return {
        geo,
        minY,
        maxY,
        nx,
        nz,
        minX,
        minZ,
        dx,
        dz,
        widthTiles: widthTilesApprox,
        depthTiles: depthTilesApprox,
        tileSize,
        adaptive: adaptiveConfig
    };
}

function buildTileGridLinesFromTerrain(terrainGeo, { widthTiles, depthTiles, segmentsPerTile, yOffset = 0.04 } = {}) {
    const g = terrainGeo?.isBufferGeometry ? terrainGeo : null;
    const pos = g?.attributes?.position;
    if (!pos?.isBufferAttribute) return null;

    const seg = Math.max(1, segmentsPerTile | 0);
    const nx = Math.max(1, (widthTiles | 0) * seg);
    const nz = Math.max(1, (depthTiles | 0) * seg);
    const stride = nx + 1;
    if (pos.count < (nx + 1) * (nz + 1)) return null;

    const segments = ((widthTiles + 1) * nz + (depthTiles + 1) * nx) | 0;
    const verts = new Float32Array(Math.max(0, segments) * 2 * 3);
    let k = 0;

    const push = (idx) => {
        verts[k++] = pos.getX(idx);
        verts[k++] = pos.getY(idx) + yOffset;
        verts[k++] = pos.getZ(idx);
    };

    for (let bx = 0; bx <= widthTiles; bx++) {
        const x = bx * seg;
        for (let z = 0; z < nz; z++) {
            const a = z * stride + x;
            const b = (z + 1) * stride + x;
            push(a);
            push(b);
        }
    }

    for (let bz = 0; bz <= depthTiles; bz++) {
        const z = bz * seg;
        const base = z * stride;
        for (let x = 0; x < nx; x++) {
            const a = base + x;
            const b = base + x + 1;
            push(a);
            push(b);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x2f2f2f, transparent: true, opacity: 0.55 });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    return lines;
}

export class TerrainDebuggerView {
    constructor({ canvas } = {}) {
        this.canvas = canvas;
        this.onFrame = null;

        this.renderer = null;
        this._gpuFrameTimer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this._ui = null;
        this._tilingFallbackBackground = new THREE.Color(0x858585);
        this._hemiLight = null;
        this._sunLight = null;

        this._pbrTextureService = null;

        this._terrain = null;
        this._terrainMat = null;
        this._terrainBounds = { minY: 0, maxY: 1 };
        this._terrainGrid = null;
        this._gridLines = null;
        this._roads = null;
        this._terrainEngine = null;
        this._terrainEngineMaskTex = null;
        this._terrainEngineMaskKey = '';
        this._terrainEngineMaskLastMs = 0;
        this._terrainEngineMaskDirty = true;
        this._terrainEngineMaskViewKey = '';
        this._terrainEngineLastExport = null;
        this._terrainEngineCompareExport = null;
        this._terrainEngineCompareKey = '';
        this._biomeTilingAxisHelper = null;
        this._biomeTilingAxisKey = '';
        this._biomeTilingRingHelper = null;
        this._biomeTilingRingHelperKey = '';
        this._biomeTilingTileLodHelper = null;
        this._biomeTilingTileLodHelperKey = '';
        this._biomeTilingTileLodLabelCache = new Map();
        this._landHeightWireframe = null;
        this._landHeightWireframeKey = '';
        this._terrainDebugMode = 'standard';
        this._terrainDebugTex = null;
        this._terrainDebugMat = null;
        this._terrainDebugTexKey = '';
        this._terrainEngineBoundsVec4 = new THREE.Vector4();
        this._terrainBiomeUvScaleStoneVec3 = new THREE.Vector3();
        this._terrainBiomeUvScaleGrassVec3 = new THREE.Vector3();
        this._terrainBiomeUvScaleLandVec3 = new THREE.Vector3();
        this._terrainUvAnchorVec2 = new THREE.Vector2();
        this._terrainHumidityThresholdsVec4 = new THREE.Vector4();
        this._terrainHumidityEdgeNoiseVec4 = new THREE.Vector4();
        this._terrainTilingDistance0Vec4 = new THREE.Vector4();
        this._terrainTilingDistance1Vec4 = new THREE.Vector4();
        this._terrainTilingVariation0Vec4 = new THREE.Vector4();
        this._terrainTilingVariation1Vec4 = new THREE.Vector4();
        this._terrainBiomePbrKey = '';
        this._terrainBiomeShaderFallbackActive = false;
        this._terrainBiomeShaderFallbackStage = 0;
        this._terrainBiomeShaderErrorCount = 0;
        this._terrainBiomeDummyMapTex = createSolidDataTexture(215, 145, 70, { srgb: true });
        this._terrainBiomePhysicalArrayKey = '';
        this._terrainBiomePhysicalArrayRequestId = 0;
        this._terrainBiomePhysicalArrayPromise = null;
        // Physical (normal/ORM) arrays are rebuilt on the fly; keep the default modest so
        // software-rendered environments (headless tests) don't stall.
        this._terrainBiomePhysicalArraySize = 256;
        this._terrainBiomeImageRgbaCache = new Map();
        this._terrainBiomePackedOrmCache = new Map();
        this._terrainBiomeNormalArrayTex = null;
        this._terrainBiomeOrmArrayTex = null;
        this._terrainBiomeHumidityBindings = JSON.parse(JSON.stringify(DEFAULT_TERRAIN_BIOME_HUMIDITY_PBR_BINDINGS));
        this._terrainHumidityBlendConfig = { ...DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG };
        this._terrainHumidityCloudConfig = { ...DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG };
        this._terrainHumiditySourceMap = null;
        this._terrainHumiditySourceMapKey = '';
        this._terrainBiomeSourceMap = null;
        this._terrainBiomeSourceMapKey = '';
        this._terrainViewMode = TERRAIN_VIEW_MODE.DEFAULT;
        this._biomeTransitionState = {
            biome1: 'grass',
            biome2: 'land',
            pairKey: 'grass|land',
            debugMode: 'transition_result',
            compareEnabled: false,
            baselineProfile: null
        };
        this._biomeTilingState = {
            materialId: BIOME_TILING_DEFAULT_STATE.materialId,
            distanceTiling: {
                ...BIOME_TILING_DEFAULT_STATE.distanceTiling
            },
            variation: {
                ...BIOME_TILING_DEFAULT_STATE.variation
            },
            displacement: {
                ...BIOME_TILING_DEFAULT_STATE.displacement
            },
            performance: {
                ...BIOME_TILING_DEFAULT_STATE.performance
            },
            geometryDensity: {
                ...BIOME_TILING_DEFAULT_STATE.geometryDensity
            }
        };
        this._biomeTilingGeometryApplyNonce = Number(BIOME_TILING_DEFAULT_STATE.geometryDensity.applyNonce) || 0;
        this._biomeTilingAppliedGeometryState = {
            enabled: BIOME_TILING_DEFAULT_STATE.geometryDensity.enabled !== false,
            mode: 'uniform',
            detailPreset: normalizeBiomeTilingLodPreset(BIOME_TILING_DEFAULT_STATE.geometryDensity.detailPreset),
            lodLevels: BIOME_TILING_LOD_QUAD_LEVELS.slice(),
            lodThresholdTiles: getBiomeTilingLodPresetThresholdsTiles(BIOME_TILING_DEFAULT_STATE.geometryDensity.detailPreset),
            lodBandWidthsMeters: [],
            lodTileCounts: buildBiomeTilingLodCountsMap(),
            lodTotalQuads: 0,
            segmentsPerTile: Math.max(1, Math.round(Number(BIOME_TILING_DEFAULT_STATE.geometryDensity.segmentsPerTile) || 1)),
            nearSegmentsPerTile: Math.max(1, Math.round(Number(BIOME_TILING_DEFAULT_STATE.geometryDensity.nearSegmentsPerTile) || 16)),
            farSegmentsPerTile: Math.max(1, Math.round(Number(BIOME_TILING_DEFAULT_STATE.geometryDensity.farSegmentsPerTile) || 1)),
            nearRadiusMeters: Math.max(0, Number(BIOME_TILING_DEFAULT_STATE.geometryDensity.nearRadiusMeters) || 0),
            transitionWidthMeters: Math.max(0, Number(BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionWidthMeters) || 0),
            renderDistanceMeters: Math.max(0, Number(BIOME_TILING_DEFAULT_STATE.geometryDensity.renderDistanceMeters) || 0),
            transitionSmoothing: clamp(
                BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionSmoothing,
                0.0,
                1.0,
                0.72
            ),
            transitionBias: clamp(
                BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionBias,
                -0.85,
                0.85,
                0.0
            ),
            transitionDebugBands: Math.max(
                0,
                Math.min(6, Math.round(Number(BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionDebugBands) || 3))
            ),
            waveStrength: clamp(
                BIOME_TILING_DEFAULT_STATE.geometryDensity.waveStrength,
                0.0,
                1.0,
                0.02
            ),
            waveMaxHeightMeters: clamp(
                BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxHeightMeters,
                0.0,
                BIOME_TILING_WAVE_HARD_MAX_HEIGHT_METERS,
                BIOME_TILING_WAVE_DEFAULT_MAX_HEIGHT_METERS
            ),
            waveMaxNeighborDeltaMeters: clamp(
                BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxNeighborDeltaMeters,
                0.0,
                BIOME_TILING_WAVE_HARD_MAX_NEIGHBOR_DELTA_METERS,
                BIOME_TILING_WAVE_DEFAULT_MAX_NEIGHBOR_DELTA_METERS
            ),
            waveMaxTileRangeMeters: clamp(
                BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxTileRangeMeters,
                0.0,
                BIOME_TILING_WAVE_HARD_MAX_TILE_RANGE_METERS,
                BIOME_TILING_WAVE_DEFAULT_MAX_TILE_RANGE_METERS
            ),
            ringOverlayEnabled: BIOME_TILING_DEFAULT_STATE.geometryDensity.ringOverlayEnabled !== false,
            overlayBounds: null,
            overlayViewportBounds: null,
            overlayViewportPolygon: null,
            overlayViewportKey: '',
            centerX: 0,
            centerZ: 0
        };
        this._biomeTilingLastGeometryApplyMs = null;
        this._biomeTilingLastDisplacementUpdateMs = null;
        this._biomeTilingDisplacementRuntimeKey = '';
        this._biomeTilingDisplacementRuntimeTex = null;
        this._biomeTilingDisplacementOverlay = null;
        this._biomeTilingDisplacementOverlayMat = null;
        this._biomeTilingDisplacementOverlayKey = '';
        this._biomeTilingViewportMaskCache = null;
        this._biomeTilingOverlayFollowLastMs = 0;
        this._biomeTilingAutoRebuildCadence = 'off';
        this._biomeTilingAutoRebuildFrameCounter = 0;
        this._biomeTilingAutoRebuildLastMs = 0;
        this._biomeTilingPerformanceKey = '';
        this._biomeTilingDisplacementResolved = {
            enabled: false,
            sourceMode: 'auto',
            resolvedSource: 'none',
            fallbackActive: false,
            textureUrl: '',
            missing: false
        };
        this._biomeTilingLodMonitor = {
            windowSec: BIOME_TILING_LOD_MONITOR_WINDOW_SEC,
            sampleIntervalMs: BIOME_TILING_LOD_MONITOR_SAMPLE_MS,
            samples: [],
            lastSampleMs: 0
        };
        this._biomeTilingDiagnosticsLastSyncMs = 0;
        this._terrainWireframe = false;
        this._asphaltWireframe = false;
        this._gameplayLightingDefaults = getResolvedDefaultLightingSettings({ includeUrlOverrides: true });

        this._grassEngine = null;
        this._grassRoadBounds = { enabled: false, halfWidth: 0, z0: 0, z1: 0 };
        this._grassStatsLastMs = 0;
        this._grassInspector = null;
        this._grassLodInspector = null;

        this._iblKey = '';
        this._iblRequestId = 0;
        this._iblPromise = null;
        this._cameraFarKey = '';
        this._biomeTilingFocusMode = 'overview';
        this._biomeTilingFocusActiveButtonId = '';
        this._biomeTilingInitialCameraPose = null;
        this._biomeTilingHrefKey = '';

        this._biomeTilingCalibrationRig = null;
        this._biomeTilingCalibrationRigDebugEnabled = false;
        this._biomeTilingCalibrationRigAnim = null;
        this._biomeTilingSunOrbitAnim = null;

        this._raf = 0;
        this._lastT = 0;
        this._keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            KeyW: false,
            KeyA: false,
            KeyS: false,
            KeyD: false,
            ShiftLeft: false,
            ShiftRight: false
        };

        this._activeCameraPresetId = 'custom';
        this._flyover = {
            active: false,
            loop: false,
            durationSec: 20,
            sampleRate: 30,
            sampleCount: 0,
            poses: null,
            startMs: 0,
            pauseStartMs: 0,
            paused: false,
            timeSec: 0,
            lastUiUpdateMs: 0
        };
        this._flyoverTmpPos = new THREE.Vector3();
        this._flyoverTmpTarget = new THREE.Vector3();
        this._flyoverTmpPos2 = new THREE.Vector3();
        this._flyoverTmpTarget2 = new THREE.Vector3();
        this._flyoverDebug = {
            active: false,
            camera: null,
            pathLine: null,
            cameraIcon: null,
            keyframesGroup: null,
            axisHelper: null
        };
        this._flyoverDebugTmpDir = new THREE.Vector3();
        this._flyoverDebugViewportSize = new THREE.Vector2();
        this._flyoverDebugUi = {
            root: null,
            toggleBtn: null,
            resetBtn: null
        };
        this._flyoverDebugCameraController = null;
        this._cameraMoveEuler = new THREE.Euler(0, 0, 0, 'YXZ');

        this._terrainRaycaster = new THREE.Raycaster();
        this._terrainRayOrigin = new THREE.Vector3();
        this._terrainRayDir = new THREE.Vector3(0, -1, 0);
        this._terrainRayHits = [];
        this._cursorNdc = new THREE.Vector2();
        this._cursorValid = false;
        this._cursorRaycaster = new THREE.Raycaster();
        this._cursorHits = [];
        this._cursorSampleLastMs = 0;
        this._cursorSampleKey = '';
        this._cursorSample = {
            hasHit: false,
            x: 0,
            y: 0,
            z: 0,
            distance: 0
        };
        this._outputPanelLastMs = 0;

        this._onResize = () => this._resize();
        this._onKeyDown = (e) => this._handleKey(e, true);
        this._onKeyUp = (e) => this._handleKey(e, false);
        this._onContextMenu = (e) => {
            if (!e) return;
            if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
            e.preventDefault();
        };
        this._onPointerMove = (e) => {
            const canvas = this.canvas;
            if (!e || !canvas?.getBoundingClientRect) return;
            const rect = canvas.getBoundingClientRect();
            const w = Math.max(1, Number(rect.width) || 1);
            const h = Math.max(1, Number(rect.height) || 1);
            const x = ((Number(e.clientX) - Number(rect.left)) / w) * 2 - 1;
            const y = -(((Number(e.clientY) - Number(rect.top)) / h) * 2 - 1);
            if (!(Number.isFinite(x) && Number.isFinite(y))) return;
            this._cursorNdc.set(clamp(x, -1, 1, 0), clamp(y, -1, 1, 0));
            this._cursorValid = true;
        };
        this._onPointerLeave = () => {
            this._cursorValid = false;
        };

        this._terrainSpec = {
            layout: {
                extraEndTiles: 80,
                extraSideTiles: 20
            },
            tileSize: 24,
            tileMinX: -9,
            tileMinZ: -10,
            widthTiles: 19,
            depthTiles: 16,
            segmentsPerTile: 8,
            adaptiveRings: {
                enabled: false,
                centerX: 0,
                centerZ: 0,
                nearRadiusMeters: 3,
                transitionWidthMeters: 3,
                transitionSmoothing: 0.72,
                transitionBias: 0.0,
                transitionDebugBands: 3,
                nearSegmentsPerTile: 1024,
                farSegmentsPerTile: 4
            },
            slope: {
                leftDeg: 1.5,
                rightDeg: 3.5,
                endDeg: 3,
                endStartAfterRoadTiles: 0,
                bottomCurveMeters: 36,
                topFlatMeters: 120
            },
            road: {
                enabled: true,
                lanesEachDirection: 3,
                laneWidthMeters: ROAD_DEFAULTS.laneWidth,
                shoulderMeters: ROAD_DEFAULTS.shoulder,
                curb: {
                    thickness: ROAD_DEFAULTS.curb.thickness,
                    height: ROAD_DEFAULTS.curb.height,
                    extraHeight: ROAD_DEFAULTS.curb.extraHeight,
                    sink: ROAD_DEFAULTS.curb.sink,
                    joinOverlap: ROAD_DEFAULTS.curb.joinOverlap
                },
                sidewalk: {
                    extraWidth: ROAD_DEFAULTS.sidewalk.extraWidth,
                    lift: ROAD_DEFAULTS.sidewalk.lift,
                    inset: ROAD_DEFAULTS.sidewalk.inset
                },
                flatRowsEachSide: 2,
                lengthTiles: 9,
                zEnd: 72,
                direction: -1,
                baseY: ROAD_DEFAULTS.surfaceY,
                edgeBlendMeters: 12,
                zBlendMeters: 18
            },
            cloud: {
                enabled: true,
                amplitude: 11,
                worldScale: 0.1,
                tiles: 50,
                blendMeters: 1000
            }
        };

        const cloud = this._terrainSpec.cloud;
        this._terrainCloudKey = `${cloud.enabled ? '1' : '0'}|${Number(cloud.amplitude).toFixed(3)}|${Number(cloud.worldScale).toFixed(5)}|${Math.max(0, Math.round(Number(cloud.tiles) || 0))}|${Number(cloud.blendMeters).toFixed(3)}`;

        const layout = this._terrainSpec.layout;
        const extraEndTiles = Math.max(0, Math.round(Number(layout?.extraEndTiles) || 0));
        const extraSideTiles = Math.max(0, Math.round(Number(layout?.extraSideTiles) || 0));
        this._terrainLayoutKey = `${extraEndTiles}|${extraSideTiles}`;

        const slope = this._terrainSpec.slope;
        const slopeLeft = clamp(slope?.leftDeg, 0.0, 89.9, 1.5);
        const slopeRight = clamp(slope?.rightDeg, 0.0, 89.9, 3.5);
        const slopeEnd = clamp(slope?.endDeg, -89.9, 89.9, 3.0);
        const endStartAfterRoadTiles = Math.max(0, Math.round(Number(slope?.endStartAfterRoadTiles) || 0));
        this._terrainSlopeKey = `${slopeLeft.toFixed(3)}|${slopeRight.toFixed(3)}|${slopeEnd.toFixed(3)}|${endStartAfterRoadTiles}`;
    }

    _updateGrassRoadBounds() {
        const spec = this._buildTerrainSpec();
        const road = spec?.road && typeof spec.road === 'object' ? spec.road : null;
        const enabled = !!road && road.enabled !== false;
        const widthMeters = Math.max(0, Number(road?.widthMeters) || 0);
        const z0 = Number(road?.z0);
        const z1 = Number(road?.z1);
        const safeZ0 = Number.isFinite(z0) ? z0 : 0;
        const safeZ1 = Number.isFinite(z1) ? z1 : 0;
        this._grassRoadBounds = {
            enabled,
            halfWidth: widthMeters * 0.5,
            z0: Math.min(safeZ0, safeZ1),
            z1: Math.max(safeZ0, safeZ1)
        };
    }

    _getGrassExclusionRects() {
        const road = this._grassRoadBounds;
        if (!road?.enabled) return [];
        const hw = Math.max(0, Number(road.halfWidth) || 0);
        if (!(hw > EPS)) return [];
        return [{ x0: -hw, x1: hw, z0: road.z0, z1: road.z1 }];
    }

    _openGrassInspector() {
        const ui = this._ui;
        if (!ui) return;
        const state = ui.getState?.();
        const cfg = state?.grass && typeof state.grass === 'object' ? state.grass : null;
        if (!cfg) return;

        const bladesPerTuft = Number(cfg?.geometry?.tuft?.bladesPerTuft);
        const tuftRadius = Number(cfg?.geometry?.tuft?.radius);
        const bladeWidth = Number(cfg?.geometry?.blade?.width);
        const heightMul = Number(cfg?.geometry?.blade?.height);

        const field = cfg?.field && typeof cfg.field === 'object' ? cfg.field : null;
        const hMin = Number(field?.height?.min) || 0.03;
        const hMax = Number(field?.height?.max) || 0.05;
        const bladeHeightMeters = ((hMin + hMax) * 0.5) * (Number.isFinite(heightMul) ? heightMul : 1.0);

        if (!this._grassInspector) this._grassInspector = new GrassBladeInspectorPopup();
        this._grassInspector.open({
            mode: 'tuft',
            bladesPerTuft: Number.isFinite(bladesPerTuft) ? bladesPerTuft : null,
            tuftRadius: Number.isFinite(tuftRadius) ? tuftRadius : null,
            bladeWidthMeters: Number.isFinite(bladeWidth) ? bladeWidth : null,
            bladeHeightMeters,
            roughness: Number(cfg?.material?.roughness),
            metalness: Number(cfg?.material?.metalness)
        });
    }

    _openGrassLodInspector(tier) {
        const ui = this._ui;
        if (!ui) return;
        const state = ui.getState?.();
        const cfg = state?.grass && typeof state.grass === 'object' ? state.grass : null;
        if (!cfg) return;

        const t = String(tier ?? '');
        if (t !== 'master' && t !== 'near' && t !== 'mid' && t !== 'far') return;

        const renderMode = cfg?.lod?.renderMode?.[t] ?? (t === 'master' ? 'tuft' : (t === 'near' ? 'star' : (t === 'far' ? 'cross_sparse' : 'cross')));
        const densityKey = t === 'master' ? 'masterMul' : t === 'near' ? 'nearMul' : t === 'mid' ? 'midMul' : 'farMul';
        const densityMul = Number(cfg?.density?.[densityKey]);

        if (!this._grassLodInspector) this._grassLodInspector = new GrassLodInspectorPopup();
        this._grassLodInspector.open({
            tier: t,
            renderMode,
            densityMul: Number.isFinite(densityMul) ? densityMul : null,
            bladesPerTuft: Number(cfg?.geometry?.tuft?.bladesPerTuft),
            tuftRadius: Number(cfg?.geometry?.tuft?.radius),
            bladeWidthMeters: Number(cfg?.geometry?.blade?.width),
            heightMult: Number(cfg?.geometry?.blade?.height),
            fieldHeightMinMeters: Number(cfg?.field?.height?.min),
            fieldHeightMaxMeters: Number(cfg?.field?.height?.max),
            roughness: Number(cfg?.material?.roughness),
            metalness: Number(cfg?.material?.metalness),
            onSave: (payload) => {
                const s2 = ui.getState?.();
                const next = s2?.grass && typeof s2.grass === 'object' ? s2.grass : null;
                if (!next) return;

                const tierSafe = String(payload?.tier ?? '');
                if (tierSafe !== 'master' && tierSafe !== 'near' && tierSafe !== 'mid' && tierSafe !== 'far') return;
                const densityKey2 = tierSafe === 'master' ? 'masterMul' : tierSafe === 'near' ? 'nearMul' : tierSafe === 'mid' ? 'midMul' : 'farMul';

                next.lod = next.lod && typeof next.lod === 'object' ? next.lod : {};
                next.lod.renderMode = next.lod.renderMode && typeof next.lod.renderMode === 'object'
                    ? next.lod.renderMode
                    : { master: 'tuft', near: 'star', mid: 'cross', far: 'cross_sparse' };
                next.lod.renderMode[tierSafe] = String(payload?.renderMode ?? next.lod.renderMode[tierSafe] ?? 'cross');

                next.density = next.density && typeof next.density === 'object' ? next.density : {};
                const dMul = Number(payload?.densityMul);
                if (Number.isFinite(dMul)) next.density[densityKey2] = dMul;

                next.geometry = next.geometry && typeof next.geometry === 'object' ? next.geometry : {};
                next.geometry.tuft = next.geometry.tuft && typeof next.geometry.tuft === 'object' ? next.geometry.tuft : {};
                next.geometry.blade = next.geometry.blade && typeof next.geometry.blade === 'object' ? next.geometry.blade : {};

                const bladesPerTuft2 = Number(payload?.bladesPerTuft);
                if (Number.isFinite(bladesPerTuft2)) next.geometry.tuft.bladesPerTuft = Math.round(bladesPerTuft2);
                const tuftRadius2 = Number(payload?.tuftRadius);
                if (Number.isFinite(tuftRadius2)) next.geometry.tuft.radius = tuftRadius2;
                const bladeWidth2 = Number(payload?.bladeWidthMeters);
                if (Number.isFinite(bladeWidth2)) next.geometry.blade.width = bladeWidth2;
                const heightMult2 = Number(payload?.heightMult);
                if (Number.isFinite(heightMult2)) next.geometry.blade.height = heightMult2;

                next.field = next.field && typeof next.field === 'object' ? next.field : {};
                next.field.height = next.field.height && typeof next.field.height === 'object' ? next.field.height : {};
                const hMin = Number(payload?.fieldHeightMinMeters);
                const hMax = Number(payload?.fieldHeightMaxMeters);
                if (Number.isFinite(hMin)) next.field.height.min = hMin;
                if (Number.isFinite(hMax)) next.field.height.max = hMax;

                next.material = next.material && typeof next.material === 'object' ? next.material : {};
                const rough = Number(payload?.roughness);
                const metal = Number(payload?.metalness);
                if (Number.isFinite(rough)) next.material.roughness = rough;
                if (Number.isFinite(metal)) next.material.metalness = metal;

                ui.setGrassConfig?.(next, { emit: true });
            }
        });
    }

    async start() {
        if (!this.canvas) throw new Error('[TerrainDebugger] Missing canvas');
        if (this.renderer) return;

        if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;

        let renderer = null;
        try {
            renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: true,
                alpha: false
            });
        } catch (err) {
            const wrapped = new Error(
                '[TerrainDebugger] WebGL context could not be created. ' +
                'Check browser GPU/WebGL settings or disable sandboxed GPU restrictions.'
            );
            wrapped.cause = err;
            throw wrapped;
        }
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

        if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
        else renderer.outputEncoding = THREE.sRGBEncoding;

        if ('useLegacyLights' in renderer) renderer.useLegacyLights = true;

        const shadowSettings = getResolvedShadowSettings({ includeUrlOverrides: true });
        const preset = getShadowQualityPreset(shadowSettings?.quality);
        const shadowsEnabled = !!preset.enabled;
        const shadowMapType = preset.shadowMapType === 'pcf' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

        if (renderer.shadowMap.enabled !== shadowsEnabled) {
            renderer.shadowMap.enabled = shadowsEnabled;
            if ('needsUpdate' in renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
        }
        if (shadowsEnabled && renderer.shadowMap.type !== shadowMapType) {
            renderer.shadowMap.type = shadowMapType;
            if ('needsUpdate' in renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
        }
        const lightingDefaults = this._gameplayLightingDefaults ?? getResolvedDefaultLightingSettings({ includeUrlOverrides: true });
        const toneMapping = String(lightingDefaults?.toneMapping ?? 'aces');
        renderer.toneMapping = toneMapping === 'agx'
            ? (THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping)
            : toneMapping === 'neutral'
                ? (THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping)
                : THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = clamp(lightingDefaults?.exposure, 0.1, 5.0, 1.14);
        this._installRendererShaderDebugHooks(renderer);

        this.renderer = renderer;
        this._pbrTextureService = new PbrTextureLoaderService({
            renderer: this.renderer
        });
        this._gpuFrameTimer = getOrCreateGpuFrameTimer(renderer);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);

        const initialUiStateFromUrl = this._buildInitialUiStateFromUrl();
        const initialUiState = initialUiStateFromUrl && typeof initialUiStateFromUrl === 'object'
            ? initialUiStateFromUrl
            : {};
        if (!Number.isFinite(initialUiState.exposure)) {
            initialUiState.exposure = clamp(lightingDefaults?.exposure, 0.1, 5.0, 1.14);
        }
        const initialIbl = initialUiState.ibl && typeof initialUiState.ibl === 'object' ? initialUiState.ibl : {};
        initialUiState.ibl = {
            ...initialIbl,
            enabled: initialIbl.enabled !== undefined ? !!initialIbl.enabled : (lightingDefaults?.ibl?.enabled !== false),
            iblId: (typeof initialIbl.iblId === 'string' && initialIbl.iblId)
                ? initialIbl.iblId
                : String(lightingDefaults?.ibl?.iblId ?? DEFAULT_IBL_ID),
            setBackground: initialIbl.setBackground !== undefined ? !!initialIbl.setBackground : true,
            envMapIntensity: Number.isFinite(initialIbl.envMapIntensity)
                ? Number(initialIbl.envMapIntensity)
                : clamp(lightingDefaults?.ibl?.envMapIntensity, 0.0, 10.0, 0.3)
        };
        const ui = new TerrainDebuggerUI({
            initialState: initialUiState,
            onChange: (state) => this._applyUiState(state),
            onResetCamera: () => this.controls?.reset?.(),
            onCameraPreset: (id) => this._applyCameraPreset(id),
            onFocusBiomeTransition: () => this._focusBiomeTransitionCamera(),
            onFocusBiomeTiling: (mode) => this._focusBiomeTilingCamera(mode),
            onToggleFlyover: () => this._toggleFlyover(),
            onFlyoverLoopChange: (enabled) => this._setFlyoverLoop(enabled),
            onInspectGrass: () => this._openGrassInspector(),
            onInspectGrassLod: (tier) => this._openGrassLodInspector(tier)
        });
        ui.setTerrainMeta?.({ tileSize: this._terrainSpec.tileSize, baseDepthTiles: this._terrainSpec.depthTiles });
        this._ui = ui;
        ui.mount();

        this.canvas.addEventListener('contextmenu', this._onContextMenu, { passive: false, capture: true });
        this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: true, capture: true });
        this.canvas.addEventListener('pointerleave', this._onPointerLeave, { passive: true, capture: true });

        this.controls = new FirstPersonCameraController(this.camera, this.canvas, {
            uiRoot: ui.root,
            enabled: true,
            zoomSpeed: 1.0,
            lookSpeed: 1.0,
            getFocusTarget: () => ({ center: new THREE.Vector3(0, 0, -120), radius: 180 })
        });
        this.controls.setLookAt({
            position: new THREE.Vector3(140, 80, 220),
            target: new THREE.Vector3(0, 10, -140)
        });
        this.controls.setHomeFromCurrent?.();

        this._buildScene();
        this._updateGrassRoadBounds();
        if (!this._terrainEngine && this._terrainGrid) {
            const bounds = this._getTerrainBoundsXZ();
            if (bounds) {
                this._terrainEngine = createTerrainEngine({
                    seed: 'terrain-debugger',
                    bounds,
                    patch: { sizeMeters: 72, originX: 0, originZ: 0, layout: 'voronoi', voronoiJitter: 0.85, warpScale: 0.02, warpAmplitudeMeters: 36 },
                    biomes: {
                        mode: 'patch_grid',
                        defaultBiomeId: 'land',
                        weights: { stone: 0.25, grass: 0.35, land: 0.40 }
                    },
                    humidity: {
                        mode: 'source_map',
                        noiseScale: 0.01,
                        octaves: 4,
                        gain: 0.5,
                        lacunarity: 2.0,
                        bias: 0.0,
                        amplitude: 1.0
                    },
                    transition: {
                        cameraBlendRadiusMeters: 140,
                        cameraBlendFeatherMeters: 24,
                        boundaryBandMeters: 10
                    }
                });
                this._terrainEngineMaskDirty = true;
            }
        }
        if (!this._grassEngine && this.scene && this._terrain && this._terrainGrid) {
            this._grassEngine = new GrassEngine({
                scene: this.scene,
                terrainMesh: this._terrain,
                terrainGrid: this._terrainGrid,
                getExclusionRects: () => this._getGrassExclusionRects()
            });
        }
        const initialState = ui.getState();
        this._applyUiState(initialState);
        this._applyInitialBiomeTilingUrlCameraOverride();
        ui.setFlyoverActive?.(false);
        this._syncCameraStatus({ nowMs: performance.now(), force: true });
        this._syncBiomeTilingHref({ force: true });
        void this._applyIblState(initialState?.ibl, { force: true });

        primePbrAssetsAvailability().then(() => {
            const state = this._ui?.getState?.();
            if (state) this._applyUiState(state);
        }).catch(() => {});

        window.addEventListener('resize', this._onResize, { passive: true });
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: false });

        this._resize();
        this._lastT = performance.now();
        this._raf = requestAnimationFrame((t) => this._tick(t));
    }

    _installRendererShaderDebugHooks(renderer) {
        const r = renderer && typeof renderer === 'object' ? renderer : null;
        const debug = r?.debug && typeof r.debug === 'object' ? r.debug : null;
        if (!debug) return;
        debug.checkShaderErrors = true;
        const prevOnShaderError = (typeof debug.onShaderError === 'function')
            ? debug.onShaderError.bind(debug)
            : null;
        debug.onShaderError = (gl, program, glVertexShader, glFragmentShader) => {
            try {
                prevOnShaderError?.(gl, program, glVertexShader, glFragmentShader);
            } catch {
            }

            const safeString = (value) => {
                const s = String(value ?? '').trim();
                return s;
            };
            const programInfo = safeString(gl?.getProgramInfoLog?.(program));
            const vertexInfo = safeString(gl?.getShaderInfoLog?.(glVertexShader));
            const fragmentInfo = safeString(gl?.getShaderInfoLog?.(glFragmentShader));
            const fragmentSource = safeString(gl?.getShaderSource?.(glFragmentShader));
            const terrainBiomeShader = fragmentSource.includes('uGdTerrainMask')
                || fragmentSource.includes('USE_TERRAIN_BIOME_BLEND')
                || fragmentSource.includes('gdTerrainMaskUv');
            if (!terrainBiomeShader) return;
            this._handleTerrainBiomeShaderValidationFailure({
                programInfo,
                vertexInfo,
                fragmentInfo,
                fragmentSource
            });
        };
    }

    _handleTerrainBiomeShaderValidationFailure({
        programInfo = '',
        vertexInfo = '',
        fragmentInfo = '',
        fragmentSource = ''
    } = {}) {
        this._terrainBiomeShaderErrorCount = Math.max(0, Math.round(Number(this._terrainBiomeShaderErrorCount) || 0)) + 1;
        const prevStage = Math.max(0, Math.round(Number(this._terrainBiomeShaderFallbackStage) || 0));
        const nextStage = Math.min(3, prevStage + 1);
        this._terrainBiomeShaderFallbackStage = nextStage;
        const state = this._biomeTilingState && typeof this._biomeTilingState === 'object'
            ? this._biomeTilingState
            : null;
        let fallbackApplied = 'none';
        if (state?.performance && typeof state.performance === 'object') {
            if (nextStage === 1) {
                // First fallback tier: disable surface array sampling (normal+ORM), keep biome albedo path.
                state.performance.fragmentShaderSurfaceEnabled = false;
                fallbackApplied = 'surface_off';
            } else if (nextStage === 2) {
                // Second tier: disable biome path and keep base albedo shader controls only.
                state.performance.fragmentShaderBiomeEnabled = false;
                fallbackApplied = 'biome_off';
            } else {
                // Final tier: disable terrain biome fragment shader path entirely.
                state.performance.fragmentShaderEnabled = false;
                state.performance.fragmentShaderBiomeEnabled = false;
                state.performance.fragmentShaderAlbedoEnabled = false;
                state.performance.fragmentShaderSurfaceEnabled = false;
                fallbackApplied = 'shader_off';
            }
        }
        this._terrainBiomeShaderFallbackActive = fallbackApplied === 'shader_off';

        this._biomeTilingPerformanceKey = '';
        this._terrainBiomePbrKey = '';
        this._applyBiomeTilingPerformanceSettings({ force: true });
        this._syncTerrainBiomePbrMapsOnStandardMaterial();
        this._syncBiomeTilingDiagnosticsUi();

        const sourceText = String(fragmentSource || '');
        const fragmentSamplerDeclCount = (sourceText.match(/\buniform\s+sampler[0-9A-Za-z]*\s+/g) || []).length;
        const hasArraySampler = /\bsampler2DArray\b/.test(sourceText);
        const hasTerrainBiomeDefine = /\bUSE_TERRAIN_BIOME_BLEND\b/.test(sourceText);

        console.warn(
            '[TerrainDebugger] Terrain biome shader validation failed; applied compatibility fallback.',
            {
                shaderErrorCount: this._terrainBiomeShaderErrorCount,
                fallbackStage: nextStage,
                fallbackApplied,
                programInfo: String(programInfo || '').trim(),
                vertexInfo: String(vertexInfo || '').trim(),
                fragmentInfo: String(fragmentInfo || '').trim(),
                fragmentSamplerDeclCount,
                hasArraySampler,
                hasTerrainBiomeDefine
            }
        );
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;
        this._disableFlyoverDebug();
        this._removeLandHeightWireframeOverlay();
        this._removeBiomeTilingAxisHelper();
        this._removeBiomeTilingAdaptiveRingHelper();
        this._removeBiomeTilingTileLodDebugHelper({ disposeLabelCache: true });
        this._removeBiomeTilingDisplacementOverlay({ disposeMaterial: true });

        this.canvas?.removeEventListener?.('contextmenu', this._onContextMenu, { capture: true });
        this.canvas?.removeEventListener?.('pointermove', this._onPointerMove, { capture: true });
        this.canvas?.removeEventListener?.('pointerleave', this._onPointerLeave, { capture: true });

        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);

        this.controls?.dispose?.();
        this.controls = null;

        this._ui?.unmount?.();
        this._ui = null;

        this._grassInspector?.dispose?.();
        this._grassInspector = null;

        this._grassLodInspector?.dispose?.();
        this._grassLodInspector = null;

        this._grassEngine?.dispose?.();
        this._grassEngine = null;

        this._terrainEngine?.dispose?.();
        this._terrainEngine = null;
        this._terrainEngineMaskTex?.dispose?.();
        this._terrainEngineMaskTex = null;
        this._terrainEngineMaskKey = '';
        this._terrainEngineMaskDirty = true;
        this._terrainEngineMaskViewKey = '';
        this._terrainEngineLastExport = null;
        this._terrainEngineCompareExport = null;
        this._terrainEngineCompareKey = '';
        this._terrainHumiditySourceMap = null;
        this._terrainHumiditySourceMapKey = '';
        this._terrainBiomeSourceMap = null;
        this._terrainBiomeSourceMapKey = '';
        this._terrainDebugTex?.dispose?.();
        this._terrainDebugTex = null;
        this._terrainDebugMat?.dispose?.();
        this._terrainDebugMat = null;
        this._biomeTilingDisplacementRuntimeTex?.dispose?.();
        this._biomeTilingDisplacementRuntimeTex = null;
        this._biomeTilingDisplacementRuntimeKey = '';
        this._terrainBiomeDummyMapTex?.dispose?.();
        this._terrainBiomeDummyMapTex = null;
        this._terrainBiomePhysicalArrayRequestId++;
        this._terrainBiomePhysicalArrayPromise = null;
        this._terrainBiomePhysicalArrayKey = '';
        this._terrainBiomeNormalArrayTex?.dispose?.();
        this._terrainBiomeNormalArrayTex = null;
        this._terrainBiomeOrmArrayTex?.dispose?.();
        this._terrainBiomeOrmArrayTex = null;
        this._terrainBiomeImageRgbaCache?.clear?.();
        this._terrainBiomePackedOrmCache?.clear?.();

        const disposeMaterial = (mat) => {
            if (!mat) return;
            const keys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'displacementMap'];
            for (const key of keys) {
                const tex = mat[key];
                if (tex?.dispose) tex.dispose();
            }
            mat.dispose?.();
        };

        const disposeObj = (obj) => {
            if (!obj?.traverse) return;
            obj.traverse((child) => {
                child?.geometry?.dispose?.();
                const mat = child?.material ?? null;
                if (Array.isArray(mat)) for (const entry of mat) disposeMaterial(entry);
                else disposeMaterial(mat);
            });
        };

        if (this.scene) {
            disposeObj(this.scene);
        }
        this.scene = null;

        this.renderer?.dispose?.();
        this.renderer = null;
        this.camera = null;
        this._gpuFrameTimer = null;

        this._pbrTextureService?.dispose?.();
        this._pbrTextureService = null;
        this._terrain = null;
        this._terrainMat = null;
        this._gridLines = null;
        this._landHeightWireframe = null;
        this._landHeightWireframeKey = '';
        this._biomeTilingDisplacementOverlay = null;
        this._biomeTilingDisplacementOverlayMat = null;
        this._biomeTilingDisplacementOverlayKey = '';
        this._roads = null;
        this._terrainGrid = null;
        this._hemiLight = null;
        this._sunLight = null;
        this._biomeTilingCalibrationRig = null;
        this._biomeTilingCalibrationRigAnim = null;
        this._biomeTilingSunOrbitAnim = null;
        this._biomeTilingCalibrationRigDebugEnabled = false;
    }

    _buildScene() {
        const scene = this.scene;
        if (!scene) return;

        scene.background = this._tilingFallbackBackground;
        scene.environment = null;

        const lightingDefaults = this._gameplayLightingDefaults ?? getResolvedDefaultLightingSettings({ includeUrlOverrides: true });
        const hemi = new THREE.HemisphereLight(0xffffff, 0x253018, clamp(lightingDefaults?.hemiIntensity, 0.0, 5.0, 0.92));
        hemi.position.set(0, 220, 0);
        scene.add(hemi);
        this._hemiLight = hemi;

        const sun = new THREE.DirectionalLight(0xffffff, clamp(lightingDefaults?.sunIntensity, 0.0, 10.0, 1.64));
        sun.position.set(120, 170, 90);
        const shadowPreset = getShadowQualityPreset(getResolvedShadowSettings({ includeUrlOverrides: true })?.quality);
        const wantsSunShadows = !!shadowPreset.enabled && !!this.renderer?.shadowMap?.enabled;
        sun.castShadow = wantsSunShadows;
        if (wantsSunShadows) {
            sun.shadow.bias = shadowPreset.bias;
            if ('normalBias' in sun.shadow) sun.shadow.normalBias = shadowPreset.normalBias;
            if ('radius' in sun.shadow) sun.shadow.radius = shadowPreset.radius;

            if (shadowPreset.mapSize > 0) {
                const renderer = this.renderer ?? null;
                const capsMax = Number.isFinite(renderer?.capabilities?.maxTextureSize)
                    ? Math.max(256, Math.floor(renderer.capabilities.maxTextureSize))
                    : shadowPreset.mapSize;
                const size = Math.max(256, Math.min(shadowPreset.mapSize, 4096, capsMax));
                const current = sun.shadow.mapSize;
                if (current?.x !== size || current?.y !== size) {
                    sun.shadow.mapSize.set(size, size);
                    if (sun.shadow.map?.dispose) sun.shadow.map.dispose();
                    sun.shadow.map = null;
                }
            }
        }
        scene.add(sun);
        if (sun.target) scene.add(sun.target);
        this._sunLight = sun;

        const terrainMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0
        });
        terrainMat.polygonOffset = true;
        terrainMat.polygonOffsetFactor = 1;
        terrainMat.polygonOffsetUnits = 1;
        // Ensure <map_pars_fragment> (and mapTexelToLinear) exist for our biome-blend shader.
        terrainMat.map = this._terrainBiomeDummyMapTex;
        terrainMat.userData = terrainMat.userData ?? {};
        terrainMat.userData.terrainEngineMaskTex = FALLBACK_TERRAIN_ENGINE_MASK_TEX;
        ensureTerrainBiomeBlendShaderOnMaterial(terrainMat);
        const terrainShaderEnabledOnStartup = (this._terrainViewMode !== TERRAIN_VIEW_MODE.DEFAULT)
            && (this._biomeTilingState?.performance?.fragmentShaderEnabled !== false);
        setTerrainBiomeBlendShaderEnabledOnMaterial(
            terrainMat,
            terrainShaderEnabledOnStartup
        );
        this._terrainMat = terrainMat;

        const terrain = (() => {
            const { geo, minY, maxY, widthTiles, depthTiles, nx, nz, minX, minZ, dx, dz, tileSize, adaptive } = buildTerrainGeometry(this._buildTerrainSpec());
            this._terrainBounds.minY = minY;
            this._terrainBounds.maxY = maxY;
            this._terrainGrid = { nx, nz, minX, minZ, dx, dz, tileSize, widthTiles, depthTiles, minY, maxY, adaptive };

            const mesh = new THREE.Mesh(geo, terrainMat);
            mesh.name = 'Terrain';
            mesh.receiveShadow = true;
            mesh.castShadow = false;
            scene.add(mesh);

            const grid = adaptive?.enabled
                ? null
                : buildTileGridLinesFromTerrain(geo, {
                    widthTiles,
                    depthTiles,
                    segmentsPerTile: this._terrainSpec.segmentsPerTile,
                    yOffset: 0.06
                });
            if (grid) {
                grid.name = 'TileGrid';
                grid.renderOrder = 10;
                scene.add(grid);
                this._gridLines = grid;
            }

            return mesh;
        })();
        this._terrain = terrain;

        const roads = (() => {
            const spec = this._buildTerrainSpec();
            const roadSpec = spec?.road && typeof spec.road === 'object' ? spec.road : null;
            if (!roadSpec || roadSpec.enabled === false) return null;

            const tileSize = Number(spec?.tileSize) || 24;
            const width = Math.max(1, Number(spec?.widthTiles) || 1);
            const height = Math.max(1, Number(spec?.depthTiles) || 1);
            const tileMinX = Number(spec?.tileMinX) || 0;
            const tileMinZ = Number(spec?.tileMinZ) || 0;
            const minX = (tileMinX - 0.5) * tileSize;
            const minZ = (tileMinZ - 0.5) * tileSize;
            const origin = { x: minX + tileSize * 0.5, z: minZ + tileSize * 0.5 };

            const lengthTiles = Math.max(0, Number(roadSpec?.lengthTiles) || 0);
            const roadLength = lengthTiles * tileSize;
            const zEnd = Number(roadSpec?.zEnd) || 0;
            const dir = Number(roadSpec?.direction) < 0 ? -1 : 1;
            const zStart = zEnd + dir * roadLength;

            const lanesEach = Math.max(1, Number(roadSpec?.lanesEachDirection) || 1);
            const laneWidth = Math.max(0.01, Number(roadSpec?.laneWidthMeters) || 4.8);
            const shoulder = Math.max(0, Number(roadSpec?.shoulderMeters) || 0);
            const curb = roadSpec?.curb && typeof roadSpec.curb === 'object' ? roadSpec.curb : {};
            const sidewalk = roadSpec?.sidewalk && typeof roadSpec.sidewalk === 'object' ? roadSpec.sidewalk : {};
            const curbThickness = Math.max(0, Number(curb?.thickness) || 0);
            const curbHeight = Math.max(0, Number(curb?.height) || 0);
            const curbExtraHeight = Math.max(0, Number(curb?.extraHeight) || 0);
            const curbSink = Math.max(0, Number(curb?.sink) || 0);
            const curbJoinOverlap = Math.max(0, Number(curb?.joinOverlap) || 0);
            const sidewalkWidth = Math.max(0, Number(sidewalk?.extraWidth) || 0);
            const sidewalkLift = Math.max(0, Number(sidewalk?.lift) || 0);
            const sidewalkInset = Math.max(0, Number(sidewalk?.inset) || 0);

            const baseY = Number.isFinite(roadSpec?.baseY) ? Number(roadSpec.baseY) : 0;
            const map = {
                tileSize,
                width,
                height,
                origin,
                roadNetwork: { seed: 'terrain-debugger' },
                roadSegments: [
                    {
                        kind: 'polyline',
                        tag: 'straight',
                        rendered: true,
                        lanesF: lanesEach,
                        lanesB: lanesEach,
                        points: [
                            { x: 0, z: zStart },
                            { x: 0, z: zEnd }
                        ]
                    }
                ]
            };

            const generatorConfig = createGeneratorConfig({
                road: {
                    laneWidth,
                    shoulder,
                    surfaceY: baseY,
                    curb: { thickness: curbThickness, height: curbHeight, extraHeight: curbExtraHeight, sink: curbSink, joinOverlap: curbJoinOverlap },
                    sidewalk: { extraWidth: sidewalkWidth, lift: sidewalkLift, inset: sidewalkInset }
                },
                ground: { surfaceY: baseY }
            });

            const cityMats = getCityMaterials();
            const res = createRoadEngineRoads({
                map,
                config: generatorConfig,
                materials: cityMats,
                options: {
                    includeCurbs: true,
                    includeSidewalks: true,
                    includeMarkings: true,
                    includeDebug: false
                }
            });
            if (res?.group) {
                res.group.name = 'RoadEngineRoads';
                scene.add(res.group);
            }
            return res;
        })();
        this._roads = roads;
        this._syncBiomeTilingDisplacementOverlay({ forceRebuild: true, allowCreate: false });
        this._syncBiomeTilingBaseTerrainVisibility();
        this._syncBiomeTilingAxisHelper();
        this._syncBiomeTilingAdaptiveRingHelper();
        this._syncBiomeTilingTileLodDebugHelper();
        this._syncBiomeTilingDiagnosticsUi();
    }

    _buildTerrainSpec() {
        const base = this._terrainSpec;
        const tileSize = Number(base?.tileSize) || 24;
        const roadBase = base?.road && typeof base.road === 'object' ? base.road : {};

        if (this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING) {
            const widthTiles = 15;
            const depthTiles = 40;
            const tileMinX = -7;
            const tileMinZ = -20;
            const z0 = (tileMinZ - 0.5) * tileSize;
            const z1 = z0 + depthTiles * tileSize;
            return {
                ...base,
                layout: { ...(base?.layout ?? {}), extraEndTiles: 0, extraSideTiles: 0 },
                slope: { ...(base?.slope ?? {}), leftDeg: 0, rightDeg: 0, endDeg: 0, endStartAfterRoadTiles: 0 },
                cloud: { ...(base?.cloud ?? {}), enabled: false },
                tileMinX,
                tileMinZ,
                widthTiles,
                depthTiles,
                adaptiveRings: {
                    ...(base?.adaptiveRings ?? {}),
                    enabled: false
                },
                road: {
                    ...roadBase,
                    enabled: false,
                    widthMeters: 0,
                    z0: Math.min(z0, z1),
                    z1: Math.max(z0, z1)
                }
            };
        }

        if (this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TRANSITION) {
            const widthTiles = 3;
            const depthTiles = 3;
            const tileMinX = -1;
            const tileMinZ = -1;
            const z0 = (tileMinZ - 0.5) * tileSize;
            const z1 = z0 + depthTiles * tileSize;
            return {
                ...base,
                layout: { ...(base?.layout ?? {}), extraEndTiles: 0, extraSideTiles: 0 },
                slope: { ...(base?.slope ?? {}), leftDeg: 0, rightDeg: 0, endDeg: 0, endStartAfterRoadTiles: 0 },
                cloud: { ...(base?.cloud ?? {}), enabled: false },
                tileMinX,
                tileMinZ,
                widthTiles,
                depthTiles,
                adaptiveRings: {
                    ...(base?.adaptiveRings ?? {}),
                    enabled: false
                },
                road: {
                    ...roadBase,
                    enabled: false,
                    widthMeters: 0,
                    z0: Math.min(z0, z1),
                    z1: Math.max(z0, z1)
                }
            };
        }

        const layout = base?.layout && typeof base.layout === 'object' ? base.layout : {};
        const extraEndTiles = Math.max(0, Math.round(Number(layout?.extraEndTiles) || 0));
        const extraSideTiles = Math.max(0, Math.round(Number(layout?.extraSideTiles) || 0));
        const baseWidthTiles = Math.max(1, Math.round(Number(base?.widthTiles) || 1));
        const baseDepthTiles = Math.max(1, Math.round(Number(base?.depthTiles) || 1));
        const baseTileMinX = Math.round(Number(base?.tileMinX) || 0);
        const baseTileMinZ = Math.round(Number(base?.tileMinZ) || 0);

        const widthTiles = baseWidthTiles + extraSideTiles * 2;
        const depthTiles = baseDepthTiles + extraEndTiles;
        const tileMinX = baseTileMinX - extraSideTiles;
        const tileMinZ = baseTileMinZ - extraEndTiles;

        const laneWidth = Math.max(0, Number(roadBase?.laneWidthMeters) || 0);
        const lanesEach = Math.max(1, Number(roadBase?.lanesEachDirection) || 3);
        const shoulder = Math.max(0, Number(roadBase?.shoulderMeters) || 0);
        const curb = roadBase?.curb && typeof roadBase.curb === 'object' ? roadBase.curb : {};
        const sidewalk = roadBase?.sidewalk && typeof roadBase.sidewalk === 'object' ? roadBase.sidewalk : {};
        const curbThickness = Math.max(0, Number(curb?.thickness) || 0);
        const sidewalkWidth = Math.max(0, Number(sidewalk?.extraWidth) || 0);
        const lengthTiles = Math.max(0, Number(roadBase?.lengthTiles) || 0);
        const roadLength = lengthTiles * tileSize;
        const zEnd = Number(roadBase?.zEnd) || 0;
        const dir = Number(roadBase?.direction) < 0 ? -1 : 1;
        const roadStart = zEnd + dir * roadLength;
        const z0 = Math.min(roadStart, zEnd);
        const z1 = Math.max(roadStart, zEnd);
        const widthMeters = laneWidth * lanesEach * 2 + shoulder * 2 + curbThickness * 2 + sidewalkWidth * 2;

        return {
            ...base,
            tileMinX,
            tileMinZ,
            widthTiles,
            depthTiles,
            adaptiveRings: {
                ...(base?.adaptiveRings ?? {}),
                enabled: false
            },
            road: {
                ...roadBase,
                widthMeters,
                z0,
                z1
            }
        };
    }

    _rebuildTerrain() {
        const scene = this.scene;
        const terrain = this._terrain;
        if (!scene || !terrain) return;
        this._resetBiomeTilingViewportMaskCache();

        const oldGeo = terrain.geometry;
        const { geo, minY, maxY, widthTiles, depthTiles, nx, nz, minX, minZ, dx, dz, tileSize, adaptive } = buildTerrainGeometry(this._buildTerrainSpec());
        terrain.geometry = geo;
        oldGeo?.dispose?.();

        this._terrainBounds.minY = minY;
        this._terrainBounds.maxY = maxY;
        this._terrainGrid = { nx, nz, minX, minZ, dx, dz, tileSize, widthTiles, depthTiles, minY, maxY, adaptive };
        this._updateGrassRoadBounds();
        if (this._terrainEngine) {
            const bounds = this._getTerrainBoundsXZ();
            if (bounds) {
                const cfg = this._terrainEngine.getConfig();
                this._terrainEngine.setConfig({ ...cfg, bounds });
                this._terrainEngineMaskDirty = true;
            }
        }
        this._grassEngine?.setTerrain?.({ terrainMesh: terrain, terrainGrid: this._terrainGrid });

        if (this._gridLines) {
            const grid = this._gridLines;
            scene.remove(grid);
            grid.geometry?.dispose?.();
            const mat = grid.material;
            if (Array.isArray(mat)) for (const m of mat) m?.dispose?.();
            else mat?.dispose?.();
            this._gridLines = null;
        }

        const grid = adaptive?.enabled
            ? null
            : buildTileGridLinesFromTerrain(geo, {
                widthTiles,
                depthTiles,
                segmentsPerTile: this._terrainSpec.segmentsPerTile,
                yOffset: 0.06
            });
        if (grid) {
            grid.name = 'TileGrid';
            grid.renderOrder = 10;
            scene.add(grid);
            this._gridLines = grid;
        }

        this._syncBiomeTilingDisplacementOverlay({
            forceRebuild: true,
            allowCreate: !!this._biomeTilingDisplacementOverlay
        });
        this._syncBiomeTilingBaseTerrainVisibility();
        this._applyVisualizationToggles();
        const hideRoadAndGrass = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TRANSITION
            || this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING;
        if (this._roads?.group) this._roads.group.visible = !hideRoadAndGrass;
        if (this._grassEngine?.group) this._grassEngine.group.visible = !hideRoadAndGrass;
        this._syncBiomeTilingAxisHelper();
        this._syncBiomeTilingAdaptiveRingHelper();
        this._syncBiomeTilingTileLodDebugHelper();
        this._syncBiomeTilingDiagnosticsUi();
    }

    _syncBiomeTilingBaseTerrainVisibility() {
        const terrain = this._terrain;
        if (!terrain) return;
        const biomeTilingActive = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING;
        const adaptiveEnabled = this._biomeTilingState?.geometryDensity?.enabled !== false;
        const overlayVisible = this._biomeTilingDisplacementOverlay?.visible === true;
        terrain.visible = !(biomeTilingActive && adaptiveEnabled && overlayVisible);
    }

    _applyMaterialWireframe(material, enabled) {
        if (!material) return;
        if (Array.isArray(material)) {
            for (const entry of material) {
                if (!entry) continue;
                if ('wireframe' in entry) entry.wireframe = enabled;
            }
            return;
        }
        if ('wireframe' in material) material.wireframe = enabled;
    }

    _applyLandWireframe(enabled = false) {
        const terrain = this._terrain;
        const wire = !!enabled;
        const overlayActive = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING
            && this._biomeTilingState?.geometryDensity?.enabled !== false
            && this._biomeTilingDisplacementOverlay?.visible === true;
        const heightWireOverlayActive = this._syncLandHeightWireframeOverlay({ enabled: wire });
        const fallbackTerrainWire = wire && !heightWireOverlayActive && !overlayActive;
        const fallbackOverlayWire = wire && !heightWireOverlayActive && overlayActive;
        if (terrain) this._applyMaterialWireframe(terrain.material, fallbackTerrainWire);
        this._applyMaterialWireframe(this._terrainMat, fallbackTerrainWire);
        this._applyMaterialWireframe(this._biomeTilingDisplacementOverlayMat, fallbackOverlayWire);
        if (this._terrainDebugMat) this._applyMaterialWireframe(this._terrainDebugMat, wire && !heightWireOverlayActive);
    }

    _getLandWireframeTargetMesh() {
        const overlay = this._biomeTilingDisplacementOverlay;
        const overlayActive = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING
            && this._biomeTilingState?.geometryDensity?.enabled !== false
            && overlay?.isMesh
            && overlay.visible === true;
        if (overlayActive) return overlay;
        return this._terrain?.isMesh ? this._terrain : null;
    }

    _removeLandHeightWireframeOverlay() {
        const line = this._landHeightWireframe;
        if (!line) {
            this._landHeightWireframeKey = '';
            return;
        }
        line.parent?.remove?.(line);
        line.geometry?.dispose?.();
        const mat = line.material;
        if (Array.isArray(mat)) for (const entry of mat) entry?.dispose?.();
        else mat?.dispose?.();
        this._landHeightWireframe = null;
        this._landHeightWireframeKey = '';
    }

    _syncLandHeightWireframeOverlay({ enabled = false } = {}) {
        if (!enabled) {
            this._removeLandHeightWireframeOverlay();
            return false;
        }

        const sourceMesh = this._getLandWireframeTargetMesh();
        const sourceGeo = sourceMesh?.geometry?.isBufferGeometry ? sourceMesh.geometry : null;
        if (!sourceMesh?.isMesh || !sourceGeo || sourceMesh.visible !== true) {
            this._removeLandHeightWireframeOverlay();
            return false;
        }

        const sourcePos = sourceGeo.attributes?.position;
        if (!sourcePos?.isBufferAttribute || sourcePos.count < 2) {
            this._removeLandHeightWireframeOverlay();
            return false;
        }

        const sourceVersion = Math.max(
            Number(sourceGeo.version) || 0,
            Number(sourcePos.version) || 0,
            Number(sourceGeo.index?.version) || 0
        );
        const key = [
            sourceMesh.uuid,
            sourceGeo.uuid,
            sourceVersion,
            Number(sourceMesh.position?.y || 0).toFixed(6)
        ].join('|');
        if (this._landHeightWireframe && this._landHeightWireframeKey === key) {
            if (this._landHeightWireframe.parent !== sourceMesh) {
                this._landHeightWireframe.parent?.remove?.(this._landHeightWireframe);
                sourceMesh.add(this._landHeightWireframe);
            }
            this._landHeightWireframe.visible = true;
            return true;
        }

        this._removeLandHeightWireframeOverlay();

        const wireGeo = new THREE.WireframeGeometry(sourceGeo);
        const wirePos = wireGeo.attributes?.position;
        if (!wirePos?.isBufferAttribute || wirePos.count < 2) {
            wireGeo.dispose?.();
            return false;
        }

        const baseY = Number(sourceMesh.position?.y) || 0.0;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < wirePos.count; i++) {
            const y = wirePos.getY(i) + baseY;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
            minY = Number(this._terrainBounds?.minY) || 0.0;
            maxY = Number(this._terrainBounds?.maxY) || (minY + 1.0);
        }
        if (maxY <= minY + EPS) maxY = minY + 1.0;
        const invRange = 1.0 / Math.max(EPS, maxY - minY);

        const colors = new Float32Array(wirePos.count * 3);
        const tempColor = new THREE.Color();
        for (let i = 0; i < wirePos.count; i++) {
            const y = wirePos.getY(i) + baseY;
            const t = clamp((y - minY) * invRange, 0.0, 1.0, 0.0);
            const hue = THREE.MathUtils.lerp(TERRAIN_HEIGHT_WIREFRAME_LOW_HUE, TERRAIN_HEIGHT_WIREFRAME_HIGH_HUE, t);
            tempColor.setHSL(hue, 0.92, 0.52);
            const base = i * 3;
            colors[base] = tempColor.r;
            colors[base + 1] = tempColor.g;
            colors[base + 2] = tempColor.b;
        }
        wireGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const wireMat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: TERRAIN_HEIGHT_WIREFRAME_OPACITY,
            depthTest: true,
            depthWrite: false
        });
        const wire = new THREE.LineSegments(wireGeo, wireMat);
        wire.name = 'LandHeightWireframe';
        wire.frustumCulled = false;
        wire.renderOrder = 9;
        wire.position.y = TERRAIN_HEIGHT_WIREFRAME_Y_OFFSET_METERS;
        sourceMesh.add(wire);

        this._landHeightWireframe = wire;
        this._landHeightWireframeKey = key;
        return true;
    }

    _applyAsphaltWireframe(enabled = false) {
        const roads = this._roads;
        const wire = !!enabled;
        if (!roads) return;

        const target = [];
        if (roads.asphalt) target.push(roads.asphalt);
        if (roads.asphaltEdgeWear) target.push(roads.asphaltEdgeWear);
        if (roads.curbBlocks) target.push(roads.curbBlocks);
        if (roads.sidewalk) target.push(roads.sidewalk);
        if (roads.sidewalkEdgeDirt) target.push(roads.sidewalkEdgeDirt);

        if (!target.length) {
            const includeByName = new Set(['Asphalt', 'AsphaltEdgeWear', 'CurbBlocks', 'Sidewalk', 'SidewalkGrassEdgeDirtStrip']);
            const group = roads.group;
            group?.traverse?.((child) => {
                if (!child?.isMesh || !includeByName.has(String(child.name))) return;
                this._applyMaterialWireframe(child.material, wire);
            });
            return;
        }

        for (const mesh of target) {
            if (!mesh?.isMesh || !mesh.material) continue;
            this._applyMaterialWireframe(mesh.material, wire);
        }
    }

    _applyVisualizationToggles() {
        this._syncBiomeTilingBaseTerrainVisibility();
        const landWireframe = this._terrainWireframe === true;
        const asphaltWireframe = this._asphaltWireframe === true;
        this._applyLandWireframe(landWireframe);
        this._applyAsphaltWireframe(asphaltWireframe);
        this._applyBiomeTilingDisplacementDebugView();
    }

    _handleKey(e, isDown) {
        if (!e) return;
        const code = e.code;
        if (!(code in this._keys)) return;
        if (isDown && (isTextEditingElement(e.target) || isTextEditingElement(document.activeElement))) return;
        if (isDown) e.preventDefault();
        this._keys[code] = !!isDown;
    }

    _updateCameraFromKeys(dt) {
        const controls = this.controls;
        const camera = this.camera;
        if (!controls?.panWorld || !camera || !controls.enabled) return;

        const rightInput = (this._keys.ArrowRight || this._keys.KeyD ? 1 : 0) - (this._keys.ArrowLeft || this._keys.KeyA ? 1 : 0);
        const forwardInput = (this._keys.ArrowUp || this._keys.KeyW ? 1 : 0) - (this._keys.ArrowDown || this._keys.KeyS ? 1 : 0);
        if (!rightInput && !forwardInput) return;

        const isFast = this._keys.ShiftLeft || this._keys.ShiftRight;
        const speed = (isFast ? 84 : 36);
        const len = Math.hypot(rightInput, forwardInput);
        if (!(len > EPS)) return;
        const inv = 1 / len;
        const scale = speed * Math.max(0.001, dt);

        const moveRight = rightInput * inv * scale;
        const moveForward = forwardInput * inv * scale;

        const euler = this._cameraMoveEuler;
        euler.setFromQuaternion(camera.quaternion, 'YXZ');
        const yaw = Number(euler.y) || 0;
        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);

        controls.panWorld(
            cos * moveRight - sin * moveForward,
            0,
            -sin * moveRight - cos * moveForward
        );
    }

    _clearKeys() {
        for (const key of Object.keys(this._keys)) this._keys[key] = false;
    }

    _setFlyoverLoop(enabled) {
        if (!this._flyover) return;
        this._flyover.loop = !!enabled;
        this._syncCameraStatus({ nowMs: performance.now(), force: true });
    }

    _setObjectLayerRecursive(object3d, layerId) {
        const obj = object3d;
        if (!obj) return;
        obj.traverse?.((child) => child.layers?.set?.(layerId));
        obj.layers?.set?.(layerId);
    }

    _disposeObjectResources(object3d) {
        const obj = object3d;
        if (!obj?.traverse) return;
        obj.traverse((child) => {
            child?.geometry?.dispose?.();
            const mat = child?.material ?? null;
            if (Array.isArray(mat)) {
                for (const entry of mat) entry?.dispose?.();
            } else {
                mat?.dispose?.();
            }
        });
    }

    _styleBiomeTilingAxisObject(object3d) {
        object3d?.traverse?.((child) => {
            child.frustumCulled = false;
            child.renderOrder = 920;
            const mat = child?.material ?? null;
            const mats = Array.isArray(mat) ? mat : [mat];
            for (const entry of mats) {
                if (!entry) continue;
                entry.depthTest = true;
                entry.depthWrite = false;
                entry.transparent = true;
                entry.opacity = 0.96;
            }
        });
    }

    _createBiomeTilingAxisLabelSprite({ text = 'X', color = '#ffffff', sizeMeters = BIOME_TILING_AXIS_LABEL_SIZE_METERS } = {}) {
        if (typeof document === 'undefined') return null;
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 84px Arial';
        ctx.lineWidth = 12;
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.86)';
        ctx.strokeText(text, 64, 64);
        ctx.fillStyle = color;
        ctx.fillText(text, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            sizeAttenuation: true
        });

        const sprite = new THREE.Sprite(material);
        const labelSize = Math.max(0.1, Number(sizeMeters) || BIOME_TILING_AXIS_LABEL_SIZE_METERS);
        sprite.scale.set(labelSize, labelSize, 1);
        sprite.renderOrder = 924;
        sprite.frustumCulled = false;
        return sprite;
    }

    _createBiomeTilingAxisHelper({
        outsideOffsetMeters = BIOME_TILING_AXIS_OUTSIDE_OFFSET_METERS,
        scale = 1.0
    } = {}) {
        const bounds = this._getTerrainBoundsXZ();
        if (!bounds) return null;

        const sampleX = bounds.minX + BIOME_TILING_AXIS_INSET_METERS;
        const sampleZ = bounds.minZ + BIOME_TILING_AXIS_INSET_METERS;
        const baseY = this._getTerrainHeightAtXZ(sampleX, sampleZ) + BIOME_TILING_AXIS_Y_OFFSET_METERS;
        const outsideOffset = Math.max(0, Number(outsideOffsetMeters) || 0);
        const cornerX = bounds.minX - outsideOffset;
        const cornerZ = bounds.minZ - outsideOffset;
        const xOrigin = new THREE.Vector3(BIOME_TILING_AXIS_GAP_METERS, 0, 0);
        const zOrigin = new THREE.Vector3(-BIOME_TILING_AXIS_GAP_METERS, 0, BIOME_TILING_AXIS_GAP_METERS);

        const group = new THREE.Group();
        group.name = 'BiomeTilingAxisHelper';
        group.position.set(cornerX, baseY, cornerZ);
        group.frustumCulled = false;
        const axisScale = Math.max(0.01, Number(scale) || 1.0);
        const arrowLength = BIOME_TILING_AXIS_LENGTH_METERS * axisScale;
        const headLength = BIOME_TILING_AXIS_HEAD_LENGTH_METERS * axisScale;
        const headWidth = BIOME_TILING_AXIS_HEAD_WIDTH_METERS * axisScale;

        const xArrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            xOrigin,
            arrowLength,
            0xff4f4f,
            headLength,
            headWidth
        );
        const zArrow = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, 1),
            zOrigin,
            arrowLength,
            0x52b8ff,
            headLength,
            headWidth
        );

        const spacingLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([xOrigin.clone(), zOrigin.clone()]),
            new THREE.LineBasicMaterial({ color: 0xf3f4f6 })
        );
        spacingLine.frustumCulled = false;
        spacingLine.renderOrder = 922;

        const labelSize = BIOME_TILING_AXIS_LABEL_SIZE_METERS * axisScale;
        const xLabel = this._createBiomeTilingAxisLabelSprite({ text: 'X', color: '#ff6b6b', sizeMeters: labelSize });
        const zLabel = this._createBiomeTilingAxisLabelSprite({ text: 'Z', color: '#6bc7ff', sizeMeters: labelSize });
        if (xLabel) {
            xLabel.position.set(xOrigin.x + arrowLength + headLength + 0.3, 0.0, xOrigin.z);
            group.add(xLabel);
        }
        if (zLabel) {
            zLabel.position.set(zOrigin.x, 0.0, zOrigin.z + arrowLength + headLength + 0.3);
            group.add(zLabel);
        }

        group.add(xArrow);
        group.add(zArrow);
        group.add(spacingLine);
        this._styleBiomeTilingAxisObject(group);
        return group;
    }

    _createFlyoverDebugAxisHelper() {
        const helper = this._createBiomeTilingAxisHelper({
            outsideOffsetMeters: FLYOVER_DEBUG_AXIS_OUTSIDE_OFFSET_METERS,
            scale: FLYOVER_DEBUG_AXIS_SCALE
        });
        if (!helper) return null;
        this._setObjectLayerRecursive(helper, FLYOVER_DEBUG_HELPER_LAYER);
        return helper;
    }

    _removeBiomeTilingAxisHelper() {
        const helper = this._biomeTilingAxisHelper;
        if (!helper) return;
        this.scene?.remove?.(helper);
        this._disposeObjectResources(helper);
        this._biomeTilingAxisHelper = null;
        this._biomeTilingAxisKey = '';
    }

    _syncBiomeTilingAxisHelper() {
        if (!this.scene) return;
        if (this._terrainViewMode !== TERRAIN_VIEW_MODE.BIOME_TILING) {
            this._removeBiomeTilingAxisHelper();
            return;
        }

        const bounds = this._getTerrainBoundsXZ();
        if (!bounds) {
            this._removeBiomeTilingAxisHelper();
            return;
        }

        const key = [
            bounds.minX.toFixed(3),
            bounds.maxX.toFixed(3),
            bounds.minZ.toFixed(3),
            bounds.maxZ.toFixed(3),
            Number(this._terrainBounds?.minY || 0).toFixed(3),
            Number(this._terrainBounds?.maxY || 0).toFixed(3)
        ].join('|');

        if (this._biomeTilingAxisHelper && this._biomeTilingAxisKey === key) return;
        this._removeBiomeTilingAxisHelper();

        const helper = this._createBiomeTilingAxisHelper();
        if (!helper) return;
        this.scene.add(helper);
        this._biomeTilingAxisHelper = helper;
        this._biomeTilingAxisKey = key;
    }

    _removeBiomeTilingAdaptiveRingHelper() {
        const helper = this._biomeTilingRingHelper;
        if (!helper) return;
        this.scene?.remove?.(helper);
        this._disposeObjectResources(helper);
        this._biomeTilingRingHelper = null;
        this._biomeTilingRingHelperKey = '';
    }

    _disposeBiomeTilingTileLodLabelCache() {
        if (!(this._biomeTilingTileLodLabelCache instanceof Map)) {
            this._biomeTilingTileLodLabelCache = new Map();
            return;
        }
        for (const entry of this._biomeTilingTileLodLabelCache.values()) {
            entry?.material?.map?.dispose?.();
            entry?.material?.dispose?.();
        }
        this._biomeTilingTileLodLabelCache.clear();
    }

    _removeBiomeTilingTileLodDebugHelper({ disposeLabelCache = false } = {}) {
        const helper = this._biomeTilingTileLodHelper;
        if (helper) {
            this.scene?.remove?.(helper);
            this._disposeObjectResources(helper);
            this._disposeBiomeTilingTileLodLabelCache();
            this._biomeTilingTileLodHelper = null;
        }
        this._biomeTilingTileLodHelperKey = '';
        if (disposeLabelCache) this._disposeBiomeTilingTileLodLabelCache();
    }

    _getBiomeTilingTileLodLabelMaterial({
        label = '',
        zone = 'far'
    } = {}) {
        const zoneRaw = String(zone ?? '').trim().toLowerCase();
        const normalizedZone = (
            zoneRaw === 'near'
            || zoneRaw === 'q256'
        )
            ? 'near'
            : (
                zoneRaw === 'transition'
                || zoneRaw === 'q64'
                || zoneRaw === 'q16'
            )
                ? 'transition'
                : 'far';
        const text = String(label ?? '').trim() || '?';
        const cacheKey = `${text}|${normalizedZone}`;
        const cache = this._biomeTilingTileLodLabelCache instanceof Map
            ? this._biomeTilingTileLodLabelCache
            : new Map();
        this._biomeTilingTileLodLabelCache = cache;
        if (cache.has(cacheKey)) {
            return cache.get(cacheKey)?.material ?? null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const bg = normalizedZone === 'near'
            ? 'rgba(46, 192, 112, 0.88)'
            : normalizedZone === 'transition'
                ? 'rgba(255, 173, 47, 0.88)'
                : 'rgba(86, 154, 255, 0.88)';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(8, 14, 22, 0.96)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
        ctx.fillStyle = '#091018';
        ctx.font = '600 30px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.52);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        const material = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            sizeAttenuation: true
        });
        material.toneMapped = false;
        cache.set(cacheKey, { material });
        return material;
    }

    _syncBiomeTilingTileLodDebugHelper() {
        if (!this.scene) return;

        const geometryCfg = this._biomeTilingState?.geometryDensity ?? null;
        const debugEnabled = geometryCfg?.tileLodDebugEnabled === true;
        const wireframeEnabled = this._terrainWireframe === true;
        const tilingActive = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING;
        if (!(tilingActive && debugEnabled && wireframeEnabled)) {
            this._removeBiomeTilingTileLodDebugHelper();
            return;
        }

        const spec = this._buildTerrainSpec();
        const tileSize = Math.max(EPS, Number(spec?.tileSize) || 24);
        const widthTiles = Math.max(1, Math.round(Number(spec?.widthTiles) || 1));
        const depthTiles = Math.max(1, Math.round(Number(spec?.depthTiles) || 1));
        const tileMinX = Math.round(Number(spec?.tileMinX) || 0);
        const tileMinZ = Math.round(Number(spec?.tileMinZ) || 0);
        const minX = (tileMinX - 0.5) * tileSize;
        const minZ = (tileMinZ - 0.5) * tileSize;
        const maxX = minX + widthTiles * tileSize;
        const maxZ = minZ + depthTiles * tileSize;
        const requestedAdaptiveEnabled = geometryCfg?.enabled !== false;
        const requestedDetailPreset = normalizeBiomeTilingLodPreset(geometryCfg?.detailPreset);
        const requestedThresholdsTiles = getBiomeTilingLodPresetThresholdsTiles(requestedDetailPreset);

        const applied = this._biomeTilingAppliedGeometryState ?? null;
        const overlayVisible = this._biomeTilingDisplacementOverlay?.visible === true;
        const appliedAdaptiveEnabled = applied?.enabled !== false
            && String(applied?.mode ?? 'uniform') === 'adaptive_rings';
        const useAppliedState = !!(overlayVisible && appliedAdaptiveEnabled);

        const mode = (useAppliedState || requestedAdaptiveEnabled) ? 'adaptive_rings' : 'uniform';
        const detailPreset = useAppliedState
            ? normalizeBiomeTilingLodPreset(applied?.detailPreset)
            : requestedDetailPreset;
        const thresholdsTiles = useAppliedState
            ? (
                Array.isArray(applied?.lodThresholdTiles)
                    ? applied.lodThresholdTiles.slice(0, 4).map((n) => Math.max(0, Number(n) || 0))
                    : getBiomeTilingLodPresetThresholdsTiles(detailPreset)
            )
            : requestedThresholdsTiles.slice(0);
        const requestedUniformSeg = Math.max(1, Math.round(Number(geometryCfg?.segmentsPerTile) || 1));
        const appliedUniformSeg = (applied && String(applied?.mode ?? 'uniform') === 'uniform')
            ? Math.max(1, Math.round(Number(applied?.segmentsPerTile) || requestedUniformSeg))
            : null;
        const baseUniformSeg = Math.max(
            1,
            Math.round(
                Number(appliedUniformSeg)
                || Number(this._terrainSpec?.segmentsPerTile)
                || requestedUniformSeg
            )
        );
        const uniformSeg = Math.max(
            1,
            Math.round(
                Number(useAppliedState ? applied?.segmentsPerTile : baseUniformSeg)
                || baseUniformSeg
            )
        );
        const nearSeg = Math.max(
            1,
            Math.round(
                Number(
                    useAppliedState
                        ? applied?.nearSegmentsPerTile
                        : geometryCfg?.nearSegmentsPerTile
                ) || uniformSeg
            )
        );
        const farSeg = Math.max(
            1,
            Math.round(
                Number(
                    useAppliedState
                        ? applied?.farSegmentsPerTile
                        : geometryCfg?.farSegmentsPerTile
                ) || uniformSeg
            )
        );
        const smoothing = clamp(
            useAppliedState ? applied?.transitionSmoothing : geometryCfg?.transitionSmoothing,
            0.0,
            1.0,
            BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionSmoothing
        );
        const bias = clamp(
            useAppliedState ? applied?.transitionBias : geometryCfg?.transitionBias,
            -0.85,
            0.85,
            BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionBias
        );
        let centerX = Number(useAppliedState ? applied?.centerX : geometryCfg?.centerX);
        let centerZ = Number(useAppliedState ? applied?.centerZ : geometryCfg?.centerZ);
        if (!useAppliedState && geometryCfg?.centerOnApplyCamera !== false && this.camera?.position) {
            centerX = Number(this.camera.position.x);
            centerZ = Number(this.camera.position.z);
        }
        if (!Number.isFinite(centerX)) centerX = (minX + maxX) * 0.5;
        if (!Number.isFinite(centerZ)) centerZ = (minZ + maxZ) * 0.5;
        centerX = clamp(centerX, minX, maxX, centerX);
        centerZ = clamp(centerZ, minZ, maxZ, centerZ);
        const nearRadius = mode === 'adaptive_rings'
            ? Math.max(0, (Number(thresholdsTiles[0]) || 0) * tileSize)
            : 0;
        const transitionWidth = mode === 'adaptive_rings'
            ? Math.max(0, ((Number(thresholdsTiles[1]) || 0) - (Number(thresholdsTiles[0]) || 0)) * tileSize)
            : 0;
        const totalTiles = widthTiles * depthTiles;
        const labelSkip = totalTiles > BIOME_TILING_TILE_LOD_LABEL_MAX_TILES
            ? Math.max(1, Math.ceil(Math.sqrt(totalTiles / BIOME_TILING_TILE_LOD_LABEL_MAX_TILES)))
            : 1;
        const y = (Number(this._terrainBounds?.maxY) || 0) + BIOME_TILING_TILE_LOD_HELPER_Y_OFFSET_METERS;
        const stateKey = useAppliedState
            ? `applied:${this._biomeTilingDisplacementOverlayKey}`
            : `requested:${requestedAdaptiveEnabled ? 1 : 0}|${detailPreset}|${thresholdsTiles.join(',')}|${geometryCfg?.centerOnApplyCamera !== false ? 1 : 0}|${centerX.toFixed(3)}|${centerZ.toFixed(3)}`;
        const key = [
            minX.toFixed(3),
            maxX.toFixed(3),
            minZ.toFixed(3),
            maxZ.toFixed(3),
            tileSize.toFixed(3),
            widthTiles,
            depthTiles,
            centerX.toFixed(3),
            centerZ.toFixed(3),
            nearRadius.toFixed(3),
            transitionWidth.toFixed(3),
            nearSeg,
            farSeg,
            uniformSeg,
            mode,
            smoothing.toFixed(4),
            bias.toFixed(4),
            labelSkip,
            stateKey
        ].join('|');
        if (this._biomeTilingTileLodHelper && key === this._biomeTilingTileLodHelperKey) return;
        this._removeBiomeTilingTileLodDebugHelper();

        const lodResolveState = mode === 'adaptive_rings'
            ? {
                enabled: true,
                mode: 'adaptive_rings',
                detailPreset,
                lodThresholdTiles: thresholdsTiles.slice(0),
                segmentsPerTile: uniformSeg
            }
            : {
                enabled: false,
                mode: 'uniform',
                segmentsPerTile: uniformSeg
            };

        const group = new THREE.Group();
        group.name = 'BiomeTilingTileLodDebugHelper';
        group.frustumCulled = false;

        const linePositions = [];
        for (let ix = 0; ix <= widthTiles; ix++) {
            const x = minX + ix * tileSize;
            linePositions.push(x, y, minZ, x, y, maxZ);
        }
        for (let iz = 0; iz <= depthTiles; iz++) {
            const z = minZ + iz * tileSize;
            linePositions.push(minX, y, z, maxX, y, z);
        }
        if (linePositions.length >= 6) {
            const lineGeo = new THREE.BufferGeometry();
            lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
            const lineMat = new THREE.LineBasicMaterial({
                color: 0xe2e8f0,
                transparent: true,
                opacity: 0.48,
                depthTest: true,
                depthWrite: false
            });
            const lines = new THREE.LineSegments(lineGeo, lineMat);
            lines.renderOrder = 927;
            lines.frustumCulled = false;
            group.add(lines);
        }

        const labelScale = Math.max(1.0, tileSize * BIOME_TILING_TILE_LOD_LABEL_SCALE_METERS * 0.08);
        for (let iz = 0; iz < depthTiles; iz++) {
            if ((iz % labelSkip) !== 0) continue;
            for (let ix = 0; ix < widthTiles; ix++) {
                if ((ix % labelSkip) !== 0) continue;
                const tileCenterX = (tileMinX + ix) * tileSize;
                const tileCenterZ = (tileMinZ + iz) * tileSize;
                const ringDistance = Math.max(Math.abs(tileCenterX - centerX), Math.abs(tileCenterZ - centerZ));
                const resolved = mode === 'adaptive_rings'
                    ? this._resolveBiomeTilingLodAtDistance({
                        applied: lodResolveState,
                        distanceMeters: ringDistance,
                        fallbackSegments: uniformSeg
                    })
                    : {
                        zone: 'uniform',
                        quadsPerTile: uniformSeg * uniformSeg,
                        segmentsPerTile: uniformSeg
                    };
                const quadsPerTile = Math.max(
                    1,
                    Math.round(Number(resolved?.quadsPerTile) || (uniformSeg * uniformSeg))
                );
                const labelText = `${quadsPerTile}`;
                const labelMat = this._getBiomeTilingTileLodLabelMaterial({
                    label: labelText,
                    zone: String(resolved?.zone ?? 'far')
                });
                if (!labelMat?.isSpriteMaterial) continue;
                const sprite = new THREE.Sprite(labelMat);
                sprite.position.set(tileCenterX, y + 0.08, tileCenterZ);
                sprite.scale.set(labelScale, labelScale * 0.5, 1.0);
                sprite.renderOrder = 928;
                sprite.frustumCulled = false;
                group.add(sprite);
            }
        }

        if (group.children.length <= 0) return;
        this.scene.add(group);
        this._biomeTilingTileLodHelper = group;
        this._biomeTilingTileLodHelperKey = key;
    }

    _createBiomeTilingAdaptiveRingHelper({
        centerX,
        centerZ,
        nearRadiusMeters,
        transitionWidthMeters,
        transitionDebugBands = 3,
        footprintBounds = null,
        viewportPolygon = null
    } = {}) {
        const terrainBounds = this._getTerrainBoundsXZ();
        if (!terrainBounds) return null;

        const rawFootprint = footprintBounds && typeof footprintBounds === 'object'
            ? footprintBounds
            : terrainBounds;
        const minX = clamp(rawFootprint.minX, terrainBounds.minX, terrainBounds.maxX, terrainBounds.minX);
        const maxX = clamp(rawFootprint.maxX, terrainBounds.minX, terrainBounds.maxX, terrainBounds.maxX);
        const minZ = clamp(rawFootprint.minZ, terrainBounds.minZ, terrainBounds.maxZ, terrainBounds.minZ);
        const maxZ = clamp(rawFootprint.maxZ, terrainBounds.minZ, terrainBounds.maxZ, terrainBounds.maxZ);
        if (!(maxX > minX + EPS && maxZ > minZ + EPS)) return null;

        const cx = clamp(centerX, terrainBounds.minX, terrainBounds.maxX, (terrainBounds.minX + terrainBounds.maxX) * 0.5);
        const cz = clamp(centerZ, terrainBounds.minZ, terrainBounds.maxZ, (terrainBounds.minZ + terrainBounds.maxZ) * 0.5);
        const nearR = Math.max(0, Number(nearRadiusMeters) || 0);
        const transitionWidth = Math.max(0, Number(transitionWidthMeters) || 0);
        const outerR = nearR + transitionWidth;
        const y = (Number(this._terrainBounds?.maxY) || 0) + BIOME_TILING_RING_HELPER_Y_OFFSET_METERS;

        const clipPolygon = Array.isArray(viewportPolygon) && viewportPolygon.length >= 3
            ? viewportPolygon
            : null;
        const isInsideFootprint = (x, z) => {
            if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
            if (x < minX - 1e-4 || x > maxX + 1e-4) return false;
            if (z < minZ - 1e-4 || z > maxZ + 1e-4) return false;
            if (clipPolygon) {
                return this._isPointInsideBiomeTilingConvexPolygonXZ({
                    x,
                    z,
                    polygon: clipPolygon
                });
            }
            return true;
        };

        const colorNear = new THREE.Color(BIOME_TILING_RING_HELPER_NEAR_COLOR);
        const colorOuter = new THREE.Color(BIOME_TILING_RING_HELPER_OUTER_COLOR);
        const ringDistanceMeters = (x, z) => Math.max(Math.abs(x - cx), Math.abs(z - cz));
        const edgeSampleStepMeters = clamp(outerR / 36, 0.25, 1.5, 0.5);
        const sampleRingPoint = (radius, edgeIndex, t) => {
            const r = Math.max(0, Number(radius) || 0);
            const tt = clamp(t, 0.0, 1.0, 0.0);
            switch ((edgeIndex | 0) & 3) {
            case 0:
                return { x: cx - r + tt * (r * 2), z: cz - r };
            case 1:
                return { x: cx + r, z: cz - r + tt * (r * 2) };
            case 2:
                return { x: cx + r - tt * (r * 2), z: cz + r };
            default:
                return { x: cx - r, z: cz + r - tt * (r * 2) };
            }
        };

        const makeFill = () => {
            if (outerR <= EPS) return null;
            const width = maxX - minX;
            const depth = maxZ - minZ;
            if (!(width > EPS && depth > EPS)) return null;

            let step = clamp(outerR / 42, 0.2, 1.25, 0.4);
            const maxQuads = 180000;
            const estQuads = Math.ceil(width / step) * Math.ceil(depth / step);
            if (estQuads > maxQuads) step *= Math.sqrt(estQuads / maxQuads);

            const positions = [];
            const colors = [];
            const indices = [];
            const fillY = y - 0.01;
            const tempColor = new THREE.Color();
            let vertexBase = 0;
            const startX = Math.floor(minX / step) * step;
            const startZ = Math.floor(minZ / step) * step;
            const endX = Math.ceil(maxX / step) * step;
            const endZ = Math.ceil(maxZ / step) * step;

            for (let z = startZ; z < endZ - EPS; z += step) {
                const z0 = clamp(z, minZ, maxZ, minZ);
                const z1 = clamp(z + step, minZ, maxZ, maxZ);
                if (!(z1 > z0 + EPS)) continue;
                for (let x = startX; x < endX - EPS; x += step) {
                    const x0 = clamp(x, minX, maxX, minX);
                    const x1 = clamp(x + step, minX, maxX, maxX);
                    if (!(x1 > x0 + EPS)) continue;
                    const sampleX = (x0 + x1) * 0.5;
                    const sampleZ = (z0 + z1) * 0.5;
                    if (!isInsideFootprint(sampleX, sampleZ)) continue;
                    const ringDist = ringDistanceMeters(sampleX, sampleZ);
                    if (ringDist > outerR + 1e-4) continue;

                    if (transitionWidth <= EPS || ringDist <= nearR + EPS) {
                        tempColor.copy(colorNear);
                    } else {
                        const alpha = clamp((ringDist - nearR) / Math.max(EPS, transitionWidth), 0.0, 1.0, 0.0);
                        tempColor.copy(colorNear).lerp(colorOuter, alpha);
                    }

                    positions.push(
                        x0, fillY, z0,
                        x1, fillY, z0,
                        x0, fillY, z1,
                        x1, fillY, z1
                    );
                    colors.push(
                        tempColor.r, tempColor.g, tempColor.b,
                        tempColor.r, tempColor.g, tempColor.b,
                        tempColor.r, tempColor.g, tempColor.b,
                        tempColor.r, tempColor.g, tempColor.b
                    );
                    indices.push(
                        vertexBase,
                        vertexBase + 2,
                        vertexBase + 1,
                        vertexBase + 1,
                        vertexBase + 2,
                        vertexBase + 3
                    );
                    vertexBase += 4;
                }
            }

            if (indices.length < 3) return null;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geometry.setIndex(indices);
            const material = new THREE.MeshBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.22,
                depthTest: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            material.polygonOffset = true;
            material.polygonOffsetFactor = -1;
            material.polygonOffsetUnits = -1;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.frustumCulled = false;
            mesh.renderOrder = 925;
            return mesh;
        };

        const makeLoop = ({ radius, color, opacity = 0.92 }) => {
            const r = Math.max(0, Number(radius) || 0);
            if (r <= EPS) return null;
            const positions = [];
            const edgeSamples = Math.max(2, Math.min(512, Math.ceil((r * 2) / edgeSampleStepMeters)));
            let prevPoint = sampleRingPoint(r, 0, 0);
            for (let edge = 0; edge < 4; edge++) {
                for (let i = 1; i <= edgeSamples; i++) {
                    const point = sampleRingPoint(r, edge, i / edgeSamples);
                    const midX = (prevPoint.x + point.x) * 0.5;
                    const midZ = (prevPoint.z + point.z) * 0.5;
                    if (isInsideFootprint(midX, midZ)) {
                        positions.push(prevPoint.x, y, prevPoint.z, point.x, y, point.z);
                    }
                    prevPoint = point;
                }
            }
            if (positions.length < 6) return null;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            const material = new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity: clamp(opacity, 0.0, 1.0, 0.92),
                depthTest: true,
                depthWrite: false
            });
            const line = new THREE.LineSegments(geometry, material);
            line.frustumCulled = false;
            line.renderOrder = 926;
            return line;
        };

        const group = new THREE.Group();
        group.name = 'BiomeTilingAdaptiveRingHelper';
        group.frustumCulled = false;
        const fillMesh = makeFill();
        if (fillMesh) group.add(fillMesh);
        const nearLoop = makeLoop({ radius: nearR, color: BIOME_TILING_RING_HELPER_NEAR_COLOR, opacity: 0.96 });
        const outerLoop = makeLoop({ radius: outerR, color: BIOME_TILING_RING_HELPER_OUTER_COLOR, opacity: 0.96 });
        if (nearLoop) group.add(nearLoop);
        const bands = Math.max(0, Math.min(6, Math.round(Number(transitionDebugBands) || 0)));
        if (bands > 0 && outerR > nearR + EPS) {
            for (let i = 1; i <= bands; i++) {
                const alpha = i / (bands + 1);
                const radius = nearR + (outerR - nearR) * alpha;
                const bandColor = colorNear.clone().lerp(colorOuter, alpha).getHex();
                const opacity = THREE.MathUtils.lerp(0.48, 0.76, alpha);
                const bandLoop = makeLoop({ radius, color: bandColor, opacity });
                if (bandLoop) group.add(bandLoop);
            }
        }
        if (outerLoop) group.add(outerLoop);
        if (group.children.length <= 0) return null;
        return group;
    }

    _syncBiomeTilingAdaptiveRingHelper() {
        if (!this.scene) return;
        const isBiomeTiling = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING;
        const applied = this._biomeTilingAppliedGeometryState ?? null;
        const requestedAdaptiveEnabled = this._biomeTilingState?.geometryDensity?.enabled !== false;
        const adaptiveEnabled = isBiomeTiling
            && requestedAdaptiveEnabled
            && applied?.enabled !== false
            && String(applied?.mode ?? 'uniform') === 'adaptive_rings';
        const requestedGeometry = this._biomeTilingState?.geometryDensity ?? null;
        const overlayEnabled = requestedGeometry
            ? (requestedGeometry.ringOverlayEnabled !== false)
            : (applied?.ringOverlayEnabled !== false);
        if (!(adaptiveEnabled && overlayEnabled)) {
            this._removeBiomeTilingAdaptiveRingHelper();
            return;
        }

        const bounds = this._getTerrainBoundsXZ();
        if (!bounds) {
            this._removeBiomeTilingAdaptiveRingHelper();
            return;
        }

        const nearRadiusMeters = Math.max(0, Number(applied?.nearRadiusMeters) || 0);
        const transitionWidthMeters = Math.max(0, Number(applied?.transitionWidthMeters) || 0);
        const centerX = clamp(Number(applied?.centerX), bounds.minX, bounds.maxX, (bounds.minX + bounds.maxX) * 0.5);
        const centerZ = clamp(Number(applied?.centerZ), bounds.minZ, bounds.maxZ, (bounds.minZ + bounds.maxZ) * 0.5);
        let footprintBounds = applied?.overlayBounds && typeof applied.overlayBounds === 'object'
            ? {
                minX: Number(applied.overlayBounds.minX),
                maxX: Number(applied.overlayBounds.maxX),
                minZ: Number(applied.overlayBounds.minZ),
                maxZ: Number(applied.overlayBounds.maxZ)
            }
            : null;
        if (
            !footprintBounds
            || !Number.isFinite(footprintBounds.minX)
            || !Number.isFinite(footprintBounds.maxX)
            || !Number.isFinite(footprintBounds.minZ)
            || !Number.isFinite(footprintBounds.maxZ)
            || footprintBounds.maxX <= footprintBounds.minX + EPS
            || footprintBounds.maxZ <= footprintBounds.minZ + EPS
        ) {
            footprintBounds = {
                minX: bounds.minX,
                maxX: bounds.maxX,
                minZ: bounds.minZ,
                maxZ: bounds.maxZ
            };
        }
        if (
            !Number.isFinite(footprintBounds.minX)
            || !Number.isFinite(footprintBounds.maxX)
            || !Number.isFinite(footprintBounds.minZ)
            || !Number.isFinite(footprintBounds.maxZ)
            || footprintBounds.maxX <= footprintBounds.minX + EPS
            || footprintBounds.maxZ <= footprintBounds.minZ + EPS
        ) {
            this._removeBiomeTilingAdaptiveRingHelper();
            return;
        }

        const key = [
            bounds.minX.toFixed(3),
            bounds.maxX.toFixed(3),
            bounds.minZ.toFixed(3),
            bounds.maxZ.toFixed(3),
            centerX.toFixed(3),
            centerZ.toFixed(3),
            nearRadiusMeters.toFixed(3),
            transitionWidthMeters.toFixed(3),
            Math.max(0, Math.min(6, Math.round(Number(applied?.transitionDebugBands) || 0))),
            footprintBounds.minX.toFixed(3),
            footprintBounds.maxX.toFixed(3),
            footprintBounds.minZ.toFixed(3),
            footprintBounds.maxZ.toFixed(3)
        ].join('|');
        if (this._biomeTilingRingHelper && key === this._biomeTilingRingHelperKey) return;

        this._removeBiomeTilingAdaptiveRingHelper();
        const helper = this._createBiomeTilingAdaptiveRingHelper({
            centerX,
            centerZ,
            nearRadiusMeters,
            transitionWidthMeters,
            transitionDebugBands: Math.max(0, Math.min(6, Math.round(Number(applied?.transitionDebugBands) || 0))),
            footprintBounds
        });
        if (!helper) return;
        this.scene.add(helper);
        this._biomeTilingRingHelper = helper;
        this._biomeTilingRingHelperKey = key;
    }

    _getGeometryTriangleCount(geometry) {
        const geo = geometry?.isBufferGeometry ? geometry : null;
        if (!geo) return 0;
        const indexAttr = geo.index ?? null;
        if (indexAttr?.isBufferAttribute) return Math.max(0, Math.round((Number(indexAttr.count) || 0) / 3));
        const posAttr = geo.attributes?.position ?? null;
        if (posAttr?.isBufferAttribute) return Math.max(0, Math.round((Number(posAttr.count) || 0) / 3));
        return 0;
    }

    _clearBiomeTilingDisplacementStateForMaterial(material) {
        const mat = material?.isMeshStandardMaterial ? material : null;
        if (!mat) return;
        let needsUpdate = false;
        if (mat.displacementMap) {
            mat.displacementMap = null;
            needsUpdate = true;
        }
        if (Math.abs(Number(mat.displacementScale) || 0) > EPS) mat.displacementScale = 0.0;
        if (Math.abs(Number(mat.displacementBias) || 0) > EPS) mat.displacementBias = 0.0;
        if (needsUpdate) mat.needsUpdate = true;
    }

    _removeBiomeTilingDisplacementOverlay({ disposeMaterial = false } = {}) {
        const overlay = this._biomeTilingDisplacementOverlay;
        if (this._landHeightWireframe?.parent === overlay) {
            this._removeLandHeightWireframeOverlay();
        }
        if (overlay) {
            this.scene?.remove?.(overlay);
            overlay.geometry?.dispose?.();
            this._biomeTilingDisplacementOverlay = null;
        }
        this._biomeTilingDisplacementOverlayKey = '';
        this._removeBiomeTilingTileLodDebugHelper();
        this._clearBiomeTilingDisplacementStateForMaterial(this._biomeTilingDisplacementOverlayMat);

        if (disposeMaterial) {
            this._biomeTilingDisplacementOverlayMat?.dispose?.();
            this._biomeTilingDisplacementOverlayMat = null;
        }
    }

    _hideBiomeTilingDisplacementOverlay() {
        const overlay = this._biomeTilingDisplacementOverlay;
        if (!overlay) return;
        overlay.visible = false;
        if (this._landHeightWireframe?.parent === overlay) {
            this._removeLandHeightWireframeOverlay();
        }
        this._removeBiomeTilingTileLodDebugHelper();
    }

    _ensureBiomeTilingDisplacementOverlayMaterial() {
        if (this._biomeTilingDisplacementOverlayMat?.isMeshStandardMaterial) {
            return this._biomeTilingDisplacementOverlayMat;
        }

        const mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0
        });
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = 1;
        mat.polygonOffsetUnits = 1;
        mat.map = this._terrainBiomeDummyMapTex;
        mat.userData = mat.userData ?? {};
        mat.userData.terrainEngineMaskTex = FALLBACK_TERRAIN_ENGINE_MASK_TEX;
        ensureTerrainBiomeBlendShaderOnMaterial(mat);
        const overlayShaderEnabled = (this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING)
            && (this._biomeTilingState?.performance?.fragmentShaderEnabled !== false);
        setTerrainBiomeBlendShaderEnabledOnMaterial(
            mat,
            overlayShaderEnabled
        );
        this._biomeTilingDisplacementOverlayMat = mat;
        this._syncBiomeTilingDisplacementOverlayMaterialFromTerrain();
        return mat;
    }

    _syncBiomeTilingDisplacementOverlayMaterialFromTerrain() {
        const src = this._terrainMat;
        const dst = this._biomeTilingDisplacementOverlayMat;
        if (!src?.isMeshStandardMaterial || !dst?.isMeshStandardMaterial) return;
        const fragmentToggleState = this._resolveBiomeTilingFragmentToggleState(this._getBiomeTilingPerformanceState());
        const fragmentEffective = fragmentToggleState?.effective ?? {};
        const albedoEnabled = fragmentEffective.fragmentShaderAlbedoEnabled === true;
        const biomeEnabled = fragmentEffective.fragmentShaderBiomeEnabled === true;
        const shaderEnabled = fragmentEffective.fragmentShaderEnabled === true;
        const needsBaseAlbedoMap = (!shaderEnabled || !biomeEnabled) && albedoEnabled;
        const displacementDebugActive = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING
            && String(this._biomeTilingState?.displacement?.debugView ?? BIOME_TILING_DEFAULT_STATE.displacement.debugView) === 'displacement';

        let needsUpdate = false;
        const assignTex = (key) => {
            const next = src[key] ?? null;
            if (dst[key] !== next) {
                dst[key] = next;
                needsUpdate = true;
            }
        };
        const nextMap = needsBaseAlbedoMap ? (src.map ?? null) : null;
        if (dst.map !== nextMap) {
            dst.map = nextMap;
            needsUpdate = true;
        }
        if (!displacementDebugActive) {
            assignTex('normalMap');
            // ORM detail comes from biome arrays on WebGL2; avoid extra sampler pressure on low-end GPUs.
            if (dst.roughnessMap) {
                dst.roughnessMap = null;
                needsUpdate = true;
            }
            if (dst.metalnessMap) {
                dst.metalnessMap = null;
                needsUpdate = true;
            }
            if (dst.aoMap) {
                dst.aoMap = null;
                needsUpdate = true;
            }
        }

        if (!displacementDebugActive) {
            const nextRoughness = Number(src.roughness);
            if (Math.abs((Number(dst.roughness) || 0) - nextRoughness) > EPS) dst.roughness = nextRoughness;
            const nextMetalness = Number(src.metalness);
            if (Math.abs((Number(dst.metalness) || 0) - nextMetalness) > EPS) dst.metalness = nextMetalness;
            if ('aoMapIntensity' in dst && 'aoMapIntensity' in src) {
                const nextAoIntensity = Number(src.aoMapIntensity);
                if (Math.abs((Number(dst.aoMapIntensity) || 0) - nextAoIntensity) > EPS) dst.aoMapIntensity = nextAoIntensity;
            }
            if (dst.normalScale?.isVector2 && src.normalScale?.isVector2 && !dst.normalScale.equals(src.normalScale)) {
                dst.normalScale.copy(src.normalScale);
            }
            if (dst.color?.isColor && src.color?.isColor && !dst.color.equals(src.color)) {
                dst.color.copy(src.color);
            }
        }

        dst.userData = dst.userData ?? {};
        const srcUserData = src.userData ?? {};
        for (const key of TERRAIN_BIOME_BLEND_USER_DATA_KEYS) {
            if (dst.userData[key] !== srcUserData[key]) dst.userData[key] = srcUserData[key];
        }
        syncTerrainBiomeBlendUniformsOnMaterial(dst);
        if (needsUpdate) dst.needsUpdate = true;
    }

    _getBiomeTilingPerformanceState() {
        const src = this._biomeTilingState?.performance ?? BIOME_TILING_DEFAULT_STATE.performance;
        return {
            fragmentShaderEnabled: src?.fragmentShaderEnabled !== false,
            fragmentShaderBiomeEnabled: src?.fragmentShaderBiomeEnabled !== false,
            fragmentShaderPbrLightingEnabled: src?.fragmentShaderPbrLightingEnabled !== false,
            fragmentShaderAlbedoEnabled: src?.fragmentShaderAlbedoEnabled !== false,
            fragmentShaderSurfaceEnabled: src?.fragmentShaderSurfaceEnabled !== false,
            shadowsEnabled: src?.shadowsEnabled !== false,
            highDpiEnabled: src?.highDpiEnabled !== false
        };
    }

    _resolveBiomeTilingFragmentToggleState(performanceState = null) {
        const src = performanceState && typeof performanceState === 'object'
            ? performanceState
            : this._getBiomeTilingPerformanceState();
        const requested = {
            fragmentShaderEnabled: src?.fragmentShaderEnabled !== false,
            fragmentShaderBiomeEnabled: src?.fragmentShaderBiomeEnabled !== false,
            fragmentShaderPbrLightingEnabled: src?.fragmentShaderPbrLightingEnabled !== false,
            fragmentShaderAlbedoEnabled: src?.fragmentShaderAlbedoEnabled !== false,
            fragmentShaderSurfaceEnabled: src?.fragmentShaderSurfaceEnabled !== false
        };
        const effective = {
            fragmentShaderEnabled: requested.fragmentShaderEnabled,
            fragmentShaderBiomeEnabled: requested.fragmentShaderEnabled && requested.fragmentShaderBiomeEnabled,
            fragmentShaderPbrLightingEnabled: requested.fragmentShaderEnabled && requested.fragmentShaderPbrLightingEnabled,
            fragmentShaderAlbedoEnabled: false,
            fragmentShaderSurfaceEnabled: false
        };
        effective.fragmentShaderAlbedoEnabled = effective.fragmentShaderEnabled && requested.fragmentShaderAlbedoEnabled;
        effective.fragmentShaderSurfaceEnabled = effective.fragmentShaderEnabled
            && effective.fragmentShaderPbrLightingEnabled
            && requested.fragmentShaderSurfaceEnabled;

        const getReason = (id) => {
            switch (id) {
            case 'fragment_shader':
                return requested.fragmentShaderEnabled ? '' : 'set Off';
            case 'biome':
                if (!requested.fragmentShaderBiomeEnabled) return 'set Off';
                if (!effective.fragmentShaderEnabled) return 'blocked by Fragment Shader';
                return '';
            case 'pbr_lighting':
                if (!requested.fragmentShaderPbrLightingEnabled) return 'set Off';
                if (!effective.fragmentShaderEnabled) return 'blocked by Fragment Shader';
                return '';
            case 'albedo':
                if (!requested.fragmentShaderAlbedoEnabled) return 'set Off';
                if (!effective.fragmentShaderEnabled) return 'blocked by Fragment Shader';
                return '';
            case 'surface':
                if (!requested.fragmentShaderSurfaceEnabled) return 'set Off';
                if (!effective.fragmentShaderEnabled) return 'blocked by Fragment Shader';
                if (!effective.fragmentShaderPbrLightingEnabled) return 'blocked by PBR Lighting';
                return '';
            default:
                return '';
            }
        };
        const buildState = ({ id, label, requestedValue, effectiveValue }) => ({
            id,
            label,
            requested: requestedValue === true,
            effective: effectiveValue === true,
            reason: getReason(id)
        });
        const states = [
            buildState({
                id: 'fragment_shader',
                label: 'Fragment Shader',
                requestedValue: requested.fragmentShaderEnabled,
                effectiveValue: effective.fragmentShaderEnabled
            }),
            buildState({
                id: 'pbr_lighting',
                label: 'PBR Lighting',
                requestedValue: requested.fragmentShaderPbrLightingEnabled,
                effectiveValue: effective.fragmentShaderPbrLightingEnabled
            }),
            buildState({
                id: 'biome',
                label: 'Biome',
                requestedValue: requested.fragmentShaderBiomeEnabled,
                effectiveValue: effective.fragmentShaderBiomeEnabled
            }),
            buildState({
                id: 'albedo',
                label: 'Albedo',
                requestedValue: requested.fragmentShaderAlbedoEnabled,
                effectiveValue: effective.fragmentShaderAlbedoEnabled
            }),
            buildState({
                id: 'surface',
                label: 'Surface (Normal+ORM)',
                requestedValue: requested.fragmentShaderSurfaceEnabled,
                effectiveValue: effective.fragmentShaderSurfaceEnabled
            })
        ];
        return { requested, effective, states };
    }

    _applyBiomeTilingPerformanceSettings({ force = false } = {}) {
        const renderer = this.renderer ?? null;
        const perfState = this._getBiomeTilingPerformanceState();
        const {
            fragmentShaderEnabled,
            fragmentShaderBiomeEnabled,
            fragmentShaderPbrLightingEnabled,
            fragmentShaderAlbedoEnabled,
            fragmentShaderSurfaceEnabled,
            shadowsEnabled,
            highDpiEnabled
        } = perfState;
        const fragmentToggleState = this._resolveBiomeTilingFragmentToggleState(perfState);
        const fragmentEffectiveRaw = fragmentToggleState.effective;
        const fallbackStage = Math.max(0, Math.round(Number(this._terrainBiomeShaderFallbackStage) || 0));
        const fragmentEffective = {
            fragmentShaderEnabled: fragmentEffectiveRaw.fragmentShaderEnabled === true,
            fragmentShaderBiomeEnabled: fragmentEffectiveRaw.fragmentShaderBiomeEnabled === true,
            fragmentShaderPbrLightingEnabled: fragmentEffectiveRaw.fragmentShaderPbrLightingEnabled === true,
            fragmentShaderAlbedoEnabled: fragmentEffectiveRaw.fragmentShaderAlbedoEnabled === true,
            fragmentShaderSurfaceEnabled: fragmentEffectiveRaw.fragmentShaderSurfaceEnabled === true
        };
        if (fallbackStage >= 1) fragmentEffective.fragmentShaderSurfaceEnabled = false;
        if (fallbackStage >= 2) fragmentEffective.fragmentShaderBiomeEnabled = false;
        if (fallbackStage >= 3) {
            fragmentEffective.fragmentShaderEnabled = false;
            fragmentEffective.fragmentShaderBiomeEnabled = false;
            fragmentEffective.fragmentShaderPbrLightingEnabled = false;
            fragmentEffective.fragmentShaderAlbedoEnabled = false;
            fragmentEffective.fragmentShaderSurfaceEnabled = false;
        }

        const targetPixelRatio = highDpiEnabled ? Math.min(devicePixelRatio, 2) : 1;
        const perfKey = [
            fragmentShaderEnabled ? '1' : '0',
            fragmentShaderBiomeEnabled ? '1' : '0',
            fragmentShaderPbrLightingEnabled ? '1' : '0',
            fragmentShaderAlbedoEnabled ? '1' : '0',
            fragmentShaderSurfaceEnabled ? '1' : '0',
            fragmentEffective.fragmentShaderEnabled ? '1' : '0',
            fragmentEffective.fragmentShaderBiomeEnabled ? '1' : '0',
            fragmentEffective.fragmentShaderPbrLightingEnabled ? '1' : '0',
            fragmentEffective.fragmentShaderAlbedoEnabled ? '1' : '0',
            fragmentEffective.fragmentShaderSurfaceEnabled ? '1' : '0',
            shadowsEnabled ? '1' : '0',
            highDpiEnabled ? '1' : '0',
            targetPixelRatio.toFixed(3)
        ].join('|');
        if (!force && perfKey === this._biomeTilingPerformanceKey) return;
        this._biomeTilingPerformanceKey = perfKey;

        if (renderer) {
            const currentPixelRatio = Number(renderer.getPixelRatio?.() ?? targetPixelRatio);
            if (force || Math.abs(currentPixelRatio - targetPixelRatio) > 1e-3) {
                renderer.setPixelRatio(targetPixelRatio);
                this._resize();
            }

            const shadowSettings = getResolvedShadowSettings({ includeUrlOverrides: true });
            const shadowPreset = getShadowQualityPreset(shadowSettings?.quality);
            const rendererShadowsEnabled = shadowsEnabled && !!shadowPreset.enabled;
            const shadowMapType = shadowPreset.shadowMapType === 'pcf' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
            if (force || renderer.shadowMap.enabled !== rendererShadowsEnabled) {
                renderer.shadowMap.enabled = rendererShadowsEnabled;
                if ('needsUpdate' in renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
            }
            if (rendererShadowsEnabled && (force || renderer.shadowMap.type !== shadowMapType)) {
                renderer.shadowMap.type = shadowMapType;
                if ('needsUpdate' in renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
            }

            const sun = this._sunLight;
            if (sun?.isDirectionalLight) {
                sun.castShadow = rendererShadowsEnabled;
                if (rendererShadowsEnabled) {
                    sun.shadow.bias = shadowPreset.bias;
                    if ('normalBias' in sun.shadow) sun.shadow.normalBias = shadowPreset.normalBias;
                    if ('radius' in sun.shadow) sun.shadow.radius = shadowPreset.radius;

                    if (shadowPreset.mapSize > 0) {
                        const capsMax = Number.isFinite(renderer?.capabilities?.maxTextureSize)
                            ? Math.max(256, Math.floor(renderer.capabilities.maxTextureSize))
                            : shadowPreset.mapSize;
                        const size = Math.max(256, Math.min(shadowPreset.mapSize, 4096, capsMax));
                        const current = sun.shadow.mapSize;
                        if (force || current?.x !== size || current?.y !== size) {
                            sun.shadow.mapSize.set(size, size);
                            if (sun.shadow.map?.dispose) sun.shadow.map.dispose();
                            sun.shadow.map = null;
                        }
                    }
                } else if (sun.shadow.map?.dispose) {
                    sun.shadow.map.dispose();
                    sun.shadow.map = null;
                }
            }
        }

        const applyShaderToggle = (mat, { allowShader = true } = {}) => {
            if (!mat?.isMeshStandardMaterial) return;
            ensureTerrainBiomeBlendShaderOnMaterial(mat);
            const shaderEnabled = allowShader && fragmentEffective.fragmentShaderEnabled;
            setTerrainBiomeBlendShaderEnabledOnMaterial(mat, shaderEnabled);
            mat.userData = mat.userData ?? {};
            const nextFeatureMaskX = (shaderEnabled && fragmentEffective.fragmentShaderAlbedoEnabled) ? 1.0 : 0.0;
            const nextFeatureMaskY = (shaderEnabled && fragmentEffective.fragmentShaderSurfaceEnabled) ? 1.0 : 0.0;
            const nextFeatureMaskZ = (shaderEnabled && fragmentEffective.fragmentShaderBiomeEnabled) ? 1.0 : 0.0;
            const nextFeatureMaskW = (shaderEnabled && fragmentEffective.fragmentShaderPbrLightingEnabled) ? 1.0 : 0.0;
            const existingFeatureMask = mat.userData.terrainBiomeFeatureMask;
            if (existingFeatureMask?.isVector4) {
                existingFeatureMask.set(
                    nextFeatureMaskX,
                    nextFeatureMaskY,
                    nextFeatureMaskZ,
                    nextFeatureMaskW
                );
            } else {
                mat.userData.terrainBiomeFeatureMask = new THREE.Vector4(
                    nextFeatureMaskX,
                    nextFeatureMaskY,
                    nextFeatureMaskZ,
                    nextFeatureMaskW
                );
            }
            syncTerrainBiomeBlendUniformsOnMaterial(mat);
        };
        const terrainAllowsShader = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING
            || this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TRANSITION;
        const overlayAllowsShader = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING;
        applyShaderToggle(this._terrainMat, { allowShader: terrainAllowsShader });
        applyShaderToggle(this._biomeTilingDisplacementOverlayMat, { allowShader: overlayAllowsShader });
        this._syncTerrainBiomePbrMapsOnStandardMaterial();
    }

    _getRendererMaxFragmentTextureUnits() {
        const capsValue = Math.round(Number(this.renderer?.capabilities?.maxTextures) || 0);
        if (capsValue > 0) return capsValue;
        const gl = this.renderer?.getContext?.();
        if (!gl?.getParameter) return null;
        const directValue = Math.round(Number(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)) || 0);
        return directValue > 0 ? directValue : null;
    }

    _buildTerrainFragmentPathDiagnostics({
        material = null,
        fragmentShaderEnabled = true,
        fragmentShaderBiomeEnabled = true,
        fragmentShaderPbrLightingEnabled = true,
        fragmentShaderAlbedoEnabled = true,
        fragmentShaderSurfaceEnabled = true,
        fragmentToggleStates = null,
        distanceBlendEnabled = true,
        antiTilingEnabled = false,
        macroVariationEnabled = false,
        displacementSamplingEnabled = false
    } = {}) {
        const mat = material?.isMeshStandardMaterial ? material : null;
        if (!mat) {
            return {
                pathStates: [],
                activeFragmentRows: [],
                totalFragmentSamplers: 0,
                toggleStates: []
            };
        }

        const effectiveFragmentShaderEnabled = fragmentShaderEnabled === true;
        const effectiveBiomeEnabled = effectiveFragmentShaderEnabled && fragmentShaderBiomeEnabled === true;
        const effectivePbrLightingEnabled = effectiveFragmentShaderEnabled && fragmentShaderPbrLightingEnabled === true;
        const effectiveAlbedoEnabled = effectiveFragmentShaderEnabled && fragmentShaderAlbedoEnabled === true;
        const effectiveSurfaceEnabled = effectiveFragmentShaderEnabled
            && effectivePbrLightingEnabled
            && fragmentShaderSurfaceEnabled === true;
        const biomeMaskSamplingEnabled = effectiveBiomeEnabled && (effectiveAlbedoEnabled || effectiveSurfaceEnabled);
        const normalizedToggleStates = Array.isArray(fragmentToggleStates)
            ? fragmentToggleStates
                .filter((row) => row && typeof row === 'object')
                .map((row) => ({
                    id: String(row.id ?? '').trim(),
                    label: String(row.label ?? '').trim(),
                    requested: row.requested === true,
                    effective: row.effective === true,
                    reason: String(row.reason ?? '').trim()
                }))
            : [];
        const toggleStateById = new Map();
        for (const row of normalizedToggleStates) {
            if (!row.id) continue;
            toggleStateById.set(row.id, row);
        }
        const getToggleReason = (ids = []) => {
            for (const idRaw of Array.isArray(ids) ? ids : []) {
                const id = String(idRaw ?? '').trim();
                if (!id) continue;
                const row = toggleStateById.get(id);
                if (row) {
                    if (row.effective === true) continue;
                    return row.reason || `${row.label || id} off`;
                }
                if (id === 'fragment_shader' && !effectiveFragmentShaderEnabled) return 'blocked by Fragment Shader';
                if (id === 'biome' && !effectiveBiomeEnabled) {
                    if (!effectiveFragmentShaderEnabled) return 'blocked by Fragment Shader';
                    if (fragmentShaderBiomeEnabled !== true) return 'set Off';
                    return 'blocked by Biome';
                }
                if (id === 'pbr_lighting' && !effectivePbrLightingEnabled) {
                    if (!effectiveFragmentShaderEnabled) return 'blocked by Fragment Shader';
                    if (fragmentShaderPbrLightingEnabled !== true) return 'set Off';
                    return 'blocked by PBR Lighting';
                }
                if (id === 'albedo' && !effectiveAlbedoEnabled) {
                    if (fragmentShaderAlbedoEnabled !== true) return 'set Off';
                    if (!effectiveFragmentShaderEnabled) return 'blocked by Fragment Shader';
                }
                if (id === 'surface' && !effectiveSurfaceEnabled) {
                    if (fragmentShaderSurfaceEnabled !== true) return 'set Off';
                    if (!effectiveFragmentShaderEnabled) return 'blocked by Fragment Shader';
                    if (!effectivePbrLightingEnabled) return 'blocked by PBR Lighting';
                }
            }
            return '';
        };
        const appendReasonNote = (baseNote = '', reason = '') => {
            const base = String(baseNote ?? '').trim();
            const why = String(reason ?? '').trim();
            if (!why) return base;
            return base ? `${base} ${why}.` : why;
        };

        const uniqueTextureId = (tex) => {
            if (!tex?.isTexture) return null;
            return tex.uuid || tex;
        };

        const data = mat.userData ?? {};
        const pathStates = [];
        const addPathState = ({
            id,
            label,
            active = false,
            note = '',
            domain = 'fragment',
            textures = []
        }) => {
            const texSet = new Set();
            for (const tex of Array.isArray(textures) ? textures : []) {
                const texId = uniqueTextureId(tex);
                if (!texId) continue;
                texSet.add(texId);
            }
            pathStates.push({
                id: String(id ?? '').trim(),
                label: String(label ?? '').trim() || '(path)',
                active: active === true,
                note: String(note ?? '').trim(),
                domain: domain === 'vertex' ? 'vertex' : 'fragment',
                textureIds: texSet
            });
        };

        if (effectiveFragmentShaderEnabled) {
            const albedoReason = getToggleReason(['fragment_shader', 'biome', 'albedo']);
            const surfaceReason = getToggleReason(['fragment_shader', 'pbr_lighting', 'surface']);
            const biomeAlbedoActive = effectiveAlbedoEnabled && effectiveBiomeEnabled;
            const baseAlbedoActive = effectiveAlbedoEnabled && !effectiveBiomeEnabled;
            const biomeSurfaceActive = effectiveSurfaceEnabled && effectiveBiomeEnabled;
            addPathState({
                id: 'albedo_biome_blend',
                label: 'Albedo biome blend',
                active: biomeAlbedoActive,
                note: biomeAlbedoActive
                    ? 'Terrain mask + biome albedo textures.'
                    : appendReasonNote('Terrain mask + biome albedo textures.', albedoReason),
                textures: [
                    data.terrainEngineMaskTex,
                    data.terrainBiomeMapStone,
                    data.terrainBiomeMapGrass,
                    data.terrainBiomeMapLand
                ]
            });
            addPathState({
                id: 'albedo_base_map',
                label: 'Albedo base map',
                active: baseAlbedoActive,
                note: baseAlbedoActive
                    ? 'Base material albedo with distance/anti-tiling controls.'
                    : appendReasonNote('Base material albedo with distance/anti-tiling controls.', albedoReason),
                textures: [mat.map]
            });
            addPathState({
                id: 'distance_blend',
                label: 'Distance blend',
                active: effectiveAlbedoEnabled && distanceBlendEnabled,
                note: (effectiveAlbedoEnabled && distanceBlendEnabled)
                    ? 'UV blend math only; no extra sampler bindings.'
                    : (!effectiveAlbedoEnabled
                        ? appendReasonNote('UV blend math only; no extra sampler bindings.', albedoReason)
                        : 'Distance Blend set Off.'),
                textures: []
            });
            addPathState({
                id: 'anti_tiling',
                label: 'Anti-tiling',
                active: effectiveAlbedoEnabled && antiTilingEnabled,
                note: (effectiveAlbedoEnabled && antiTilingEnabled)
                    ? 'UV remap + extra fetches on existing textures.'
                    : (!effectiveAlbedoEnabled
                        ? appendReasonNote('UV remap + extra fetches on existing textures.', albedoReason)
                        : 'Anti-tiling set Off.'),
                textures: []
            });
            addPathState({
                id: 'macro_variation',
                label: 'Macro variation',
                active: effectiveAlbedoEnabled && macroVariationEnabled,
                note: (effectiveAlbedoEnabled && macroVariationEnabled)
                    ? 'Uses humidity noise texture (shared sampler).'
                    : (!effectiveAlbedoEnabled
                        ? appendReasonNote('Uses humidity noise texture (shared sampler).', albedoReason)
                        : 'Macro Variation set Off.'),
                textures: [data.terrainHumidityEdgeNoiseTex]
            });
            addPathState({
                id: 'humidity_edge_noise',
                label: 'Humidity edge noise',
                active: biomeMaskSamplingEnabled || (effectiveAlbedoEnabled && macroVariationEnabled),
                note: (biomeMaskSamplingEnabled || (effectiveAlbedoEnabled && macroVariationEnabled))
                    ? 'Humidity transition and macro variation noise sampling.'
                    : appendReasonNote(
                        'Humidity transition and macro variation noise sampling.',
                        getToggleReason(['fragment_shader', 'biome']) || getToggleReason(['fragment_shader', 'albedo'])
                    ),
                textures: [data.terrainHumidityEdgeNoiseTex]
            });
            addPathState({
                id: 'surface_normal_orm',
                label: 'Surface Normal/ORM',
                active: effectiveSurfaceEnabled,
                note: effectiveSurfaceEnabled
                    ? (biomeSurfaceActive
                        ? 'Biome normal + ORM texture arrays.'
                        : 'Using base material normal/roughness/AO maps.')
                    : appendReasonNote('Biome normal + ORM texture arrays.', surfaceReason),
                textures: biomeSurfaceActive
                    ? [
                        data.terrainBiomeNormalArrayTex,
                        data.terrainBiomeOrmArrayTex
                    ]
                    : []
            });
            addPathState({
                id: 'displacement_source_sampling',
                label: 'Displacement source sampling',
                active: displacementSamplingEnabled,
                domain: 'vertex',
                note: 'Vertex-domain sampling; not counted in fragment sampler total.',
                textures: []
            });
        } else {
            addPathState({
                id: 'albedo_biome_blend',
                label: 'Albedo biome blend',
                active: false,
                note: 'Fragment Shader set Off.',
                textures: []
            });
            addPathState({
                id: 'albedo_base_map',
                label: 'Albedo base map',
                active: false,
                note: 'Fragment Shader set Off.',
                textures: []
            });
            addPathState({
                id: 'distance_blend',
                label: 'Distance blend',
                active: false,
                note: 'Fragment Shader set Off.',
                textures: []
            });
            addPathState({
                id: 'anti_tiling',
                label: 'Anti-tiling',
                active: false,
                note: 'Fragment Shader set Off.',
                textures: []
            });
            addPathState({
                id: 'macro_variation',
                label: 'Macro variation',
                active: false,
                note: 'Fragment Shader set Off.',
                textures: []
            });
            addPathState({
                id: 'humidity_edge_noise',
                label: 'Humidity edge noise',
                active: false,
                note: 'Fragment Shader set Off.',
                textures: []
            });
            addPathState({
                id: 'surface_normal_orm',
                label: 'Surface Normal/ORM',
                active: false,
                note: 'Fragment Shader set Off.',
                textures: []
            });
            addPathState({
                id: 'displacement_source_sampling',
                label: 'Displacement source sampling',
                active: displacementSamplingEnabled,
                domain: 'vertex',
                note: 'Vertex-domain sampling; not counted in fragment sampler total.',
                textures: []
            });
        }

        const activeFragmentPaths = pathStates.filter((path) => path.active === true && path.domain === 'fragment');
        const textureRefCounts = new Map();
        for (const path of activeFragmentPaths) {
            for (const texId of path.textureIds) {
                textureRefCounts.set(texId, Math.max(0, Number(textureRefCounts.get(texId)) || 0) + 1);
            }
        }
        const totalFragmentTextures = new Set();
        for (const path of activeFragmentPaths) {
            for (const texId of path.textureIds) totalFragmentTextures.add(texId);
        }

        const activeFragmentRows = activeFragmentPaths.map((path) => {
            const samplers = Math.max(0, path.textureIds.size);
            const hasShared = (() => {
                for (const texId of path.textureIds) {
                    if ((Number(textureRefCounts.get(texId)) || 0) > 1) return true;
                }
                return false;
            })();
            let note = String(path.note ?? '').trim();
            if (hasShared) {
                note = note
                    ? `${note} Shared with another active path.`
                    : 'Shared with another active path.';
            }
            return {
                id: path.id,
                label: path.label,
                samplers,
                note
            };
        });

        return {
            pathStates: pathStates.map((path) => ({
                id: path.id,
                label: path.label,
                active: path.active,
                domain: path.domain,
                samplers: Math.max(0, path.textureIds.size),
                note: path.note
            })),
            activeFragmentRows,
            totalFragmentSamplers: Math.max(0, totalFragmentTextures.size),
            toggleStates: normalizedToggleStates
        };
    }

    _estimateTerrainFragmentSamplerUsage({
        material = null,
        fragmentShaderEnabled = true,
        fragmentShaderBiomeEnabled = true,
        fragmentShaderPbrLightingEnabled = true,
        fragmentShaderAlbedoEnabled = true,
        fragmentShaderSurfaceEnabled = true
    } = {}) {
        const diagnostics = this._buildTerrainFragmentPathDiagnostics({
            material,
            fragmentShaderEnabled,
            fragmentShaderBiomeEnabled,
            fragmentShaderPbrLightingEnabled,
            fragmentShaderAlbedoEnabled,
            fragmentShaderSurfaceEnabled,
            distanceBlendEnabled: true,
            antiTilingEnabled: false,
            macroVariationEnabled: false,
            displacementSamplingEnabled: false
        });
        return Math.max(0, Math.round(Number(diagnostics?.totalFragmentSamplers) || 0));
    }

    _isBiomeTilingOverlayPointInsideRegularPolygon({
        x,
        z,
        centerX,
        centerZ,
        radiusMeters,
        sides
    } = {}) {
        const px = Number(x);
        const pz = Number(z);
        const cx = Number(centerX);
        const cz = Number(centerZ);
        const r = Math.max(0, Number(radiusMeters) || 0);
        const n = Math.max(3, Math.round(Number(sides) || BIOME_TILING_DISPLACEMENT_OVERLAY_SHAPE_SIDES));
        if (!(Number.isFinite(px) && Number.isFinite(pz) && Number.isFinite(cx) && Number.isFinite(cz) && r > EPS)) return false;

        const dx = px - cx;
        const dz = pz - cz;
        const dist = Math.hypot(dx, dz);
        if (dist <= EPS) return true;

        const sector = (Math.PI * 2) / n;
        const halfSector = sector * 0.5;
        let angle = Math.atan2(dz, dx);
        angle = ((angle % sector) + sector) % sector;
        const edgeDenom = Math.cos(angle - halfSector);
        if (!(edgeDenom > EPS)) return false;
        const edgeDist = (r * Math.cos(Math.PI / n)) / edgeDenom;
        return dist <= edgeDist + 1e-3;
    }

    _buildBiomeTilingConvexHullXZ(points = []) {
        const src = Array.isArray(points) ? points : [];
        if (src.length < 3) return [];
        const norm = [];
        for (const p of src) {
            const x = Number(p?.x);
            const z = Number(p?.z);
            if (!(Number.isFinite(x) && Number.isFinite(z))) continue;
            norm.push({ x, z });
        }
        if (norm.length < 3) return [];
        norm.sort((a, b) => (a.x === b.x ? a.z - b.z : a.x - b.x));

        const dedup = [];
        for (const p of norm) {
            const prev = dedup[dedup.length - 1];
            if (prev && Math.abs(prev.x - p.x) <= 1e-5 && Math.abs(prev.z - p.z) <= 1e-5) continue;
            dedup.push(p);
        }
        if (dedup.length < 3) return [];

        const cross = (o, a, b) => ((a.x - o.x) * (b.z - o.z)) - ((a.z - o.z) * (b.x - o.x));

        const lower = [];
        for (const p of dedup) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
            lower.push(p);
        }
        const upper = [];
        for (let i = dedup.length - 1; i >= 0; i--) {
            const p = dedup[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
            upper.push(p);
        }
        lower.pop();
        upper.pop();
        const hull = lower.concat(upper);
        return hull.length >= 3 ? hull : [];
    }

    _expandBiomeTilingConvexPolygonXZ({ polygon, marginMeters = 0 } = {}) {
        const poly = Array.isArray(polygon) ? polygon : [];
        if (poly.length < 3) return [];
        const margin = Math.max(0, Number(marginMeters) || 0);
        if (margin <= EPS) return poly.map((p) => ({ x: Number(p.x) || 0, z: Number(p.z) || 0 }));

        let cx = 0;
        let cz = 0;
        for (const p of poly) {
            cx += Number(p?.x) || 0;
            cz += Number(p?.z) || 0;
        }
        cx /= poly.length;
        cz /= poly.length;

        return poly.map((p) => {
            const x = Number(p?.x) || 0;
            const z = Number(p?.z) || 0;
            const dx = x - cx;
            const dz = z - cz;
            const len = Math.hypot(dx, dz);
            if (len <= EPS) return { x, z };
            const inv = 1 / len;
            return {
                x: x + (dx * inv * margin),
                z: z + (dz * inv * margin)
            };
        });
    }

    _isPointInsideBiomeTilingConvexPolygonXZ({ x, z, polygon } = {}) {
        const poly = Array.isArray(polygon) ? polygon : [];
        if (poly.length < 3) return false;
        const px = Number(x);
        const pz = Number(z);
        if (!(Number.isFinite(px) && Number.isFinite(pz))) return false;

        let hasPos = false;
        let hasNeg = false;
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            const ax = Number(a?.x) || 0;
            const az = Number(a?.z) || 0;
            const bx = Number(b?.x) || 0;
            const bz = Number(b?.z) || 0;
            const cross = ((bx - ax) * (pz - az)) - ((bz - az) * (px - ax));
            if (cross > 1e-6) hasPos = true;
            else if (cross < -1e-6) hasNeg = true;
            if (hasPos && hasNeg) return false;
        }
        return true;
    }

    _sampleBiomeTilingCameraViewportGroundPolygon({ edgeSamples = 6, marginMeters = BIOME_TILING_VIEWPORT_MASK_MARGIN_METERS } = {}) {
        const camera = this.camera;
        const terrain = this._getTerrainRaycastSurface();
        if (!camera || !terrain?.isMesh) return null;

        const sampleCount = Math.max(2, Math.round(Number(edgeSamples) || 6));
        const borderNdc = [];
        for (let i = 0; i < sampleCount; i++) {
            const t = i / Math.max(1, sampleCount - 1);
            borderNdc.push({ x: -1 + t * 2, y: 1 });
        }
        for (let i = 1; i < sampleCount; i++) {
            const t = i / Math.max(1, sampleCount - 1);
            borderNdc.push({ x: 1, y: 1 - t * 2 });
        }
        for (let i = 1; i < sampleCount; i++) {
            const t = i / Math.max(1, sampleCount - 1);
            borderNdc.push({ x: 1 - t * 2, y: -1 });
        }
        for (let i = 1; i < sampleCount - 1; i++) {
            const t = i / Math.max(1, sampleCount - 1);
            borderNdc.push({ x: -1, y: -1 + t * 2 });
        }

        terrain.updateMatrixWorld?.(true);
        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        const hits = [];
        const points = [];
        for (const p of borderNdc) {
            ndc.set(Number(p.x) || 0, Number(p.y) || 0);
            raycaster.setFromCamera(ndc, camera);
            hits.length = 0;
            raycaster.intersectObject(terrain, false, hits);
            const hit = hits[0];
            if (!hit?.point) continue;
            points.push({ x: Number(hit.point.x) || 0, z: Number(hit.point.z) || 0 });
        }

        const hull = this._buildBiomeTilingConvexHullXZ(points);
        if (hull.length < 3) return null;
        const expanded = this._expandBiomeTilingConvexPolygonXZ({
            polygon: hull,
            marginMeters: Math.max(0, Number(marginMeters) || BIOME_TILING_VIEWPORT_MASK_MARGIN_METERS)
        });
        if (expanded.length < 3) return null;

        let minX = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxZ = -Infinity;
        for (const p of expanded) {
            minX = Math.min(minX, p.x);
            minZ = Math.min(minZ, p.z);
            maxX = Math.max(maxX, p.x);
            maxZ = Math.max(maxZ, p.z);
        }
        if (!(maxX > minX + EPS && maxZ > minZ + EPS)) return null;

        const key = expanded.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`).join('|');
        return {
            polygon: expanded,
            bounds: { minX, maxX, minZ, maxZ },
            key
        };
    }

    _cloneBiomeTilingViewportMask(mask = null) {
        const src = mask && typeof mask === 'object' ? mask : null;
        const boundsSrc = src?.bounds && typeof src.bounds === 'object' ? src.bounds : null;
        const polySrc = Array.isArray(src?.polygon) ? src.polygon : null;
        if (!boundsSrc || !polySrc || polySrc.length < 3) return null;
        const minX = Number(boundsSrc.minX);
        const maxX = Number(boundsSrc.maxX);
        const minZ = Number(boundsSrc.minZ);
        const maxZ = Number(boundsSrc.maxZ);
        if (
            !Number.isFinite(minX)
            || !Number.isFinite(maxX)
            || !Number.isFinite(minZ)
            || !Number.isFinite(maxZ)
            || maxX <= minX + EPS
            || maxZ <= minZ + EPS
        ) {
            return null;
        }
        const polygon = [];
        for (const p of polySrc) {
            const x = Number(p?.x);
            const z = Number(p?.z);
            if (!(Number.isFinite(x) && Number.isFinite(z))) continue;
            polygon.push({ x, z });
        }
        if (polygon.length < 3) return null;
        return {
            polygon,
            bounds: { minX, maxX, minZ, maxZ },
            key: String(src?.key ?? '')
        };
    }

    _resetBiomeTilingViewportMaskCache() {
        this._biomeTilingViewportMaskCache = null;
    }

    _getBiomeTilingStableViewportGroundPolygon({
        edgeSamples = 6,
        marginMeters = BIOME_TILING_VIEWPORT_MASK_MARGIN_METERS,
        translationThresholdMeters = BIOME_TILING_VIEWPORT_MASK_STABILIZE_MOVE_METERS
    } = {}) {
        const sampled = this._cloneBiomeTilingViewportMask(this._sampleBiomeTilingCameraViewportGroundPolygon({
            edgeSamples,
            marginMeters
        }));
        const camera = this.camera;
        const camPos = camera?.position ?? null;
        const camX = Number(camPos?.x);
        const camY = Number(camPos?.y);
        const camZ = Number(camPos?.z);
        const cameraValid = Number.isFinite(camX) && Number.isFinite(camY) && Number.isFinite(camZ);
        const threshold = Math.max(0, Number(translationThresholdMeters) || BIOME_TILING_VIEWPORT_MASK_STABILIZE_MOVE_METERS);

        const cacheRaw = this._biomeTilingViewportMaskCache;
        const cache = cacheRaw && typeof cacheRaw === 'object' ? cacheRaw : null;
        const cachedMask = this._cloneBiomeTilingViewportMask(cache?.mask ?? null);

        if (!cachedMask && sampled) {
            this._biomeTilingViewportMaskCache = {
                mask: sampled,
                cameraX: cameraValid ? camX : null,
                cameraY: cameraValid ? camY : null,
                cameraZ: cameraValid ? camZ : null
            };
            return this._cloneBiomeTilingViewportMask(sampled);
        }
        if (!cachedMask && !sampled) return null;
        if (!cachedMask) return this._cloneBiomeTilingViewportMask(sampled);

        if (!cameraValid) {
            if (sampled) {
                this._biomeTilingViewportMaskCache = {
                    mask: sampled,
                    cameraX: null,
                    cameraY: null,
                    cameraZ: null
                };
                return this._cloneBiomeTilingViewportMask(sampled);
            }
            return cachedMask;
        }

        const cacheX = Number(cache?.cameraX);
        const cacheY = Number(cache?.cameraY);
        const cacheZ = Number(cache?.cameraZ);
        const cachePosValid = Number.isFinite(cacheX) && Number.isFinite(cacheY) && Number.isFinite(cacheZ);
        const movedMeters = cachePosValid ? Math.hypot(camX - cacheX, camY - cacheY, camZ - cacheZ) : Infinity;
        if (movedMeters <= threshold + 1e-4) return cachedMask;

        if (sampled) {
            this._biomeTilingViewportMaskCache = {
                mask: sampled,
                cameraX: camX,
                cameraY: camY,
                cameraZ: camZ
            };
            return this._cloneBiomeTilingViewportMask(sampled);
        }
        return cachedMask;
    }

    _clipBiomeTilingOverlayGeometryToRegularPolygon({
        geometry,
        centerX,
        centerZ,
        radiusMeters,
        sides = BIOME_TILING_DISPLACEMENT_OVERLAY_SHAPE_SIDES,
        viewportPolygon = null
    } = {}) {
        const geo = geometry?.isBufferGeometry ? geometry : null;
        if (!geo) return geometry;

        const posAttr = geo.attributes?.position;
        if (!posAttr?.isBufferAttribute) return geometry;

        const idxAttr = geo.index;
        const idxArray = idxAttr?.isBufferAttribute ? idxAttr.array : null;
        const triCount = idxArray
            ? Math.max(0, Math.floor(Number(idxAttr.count) / 3))
            : Math.max(0, Math.floor(Number(posAttr.count) / 3));
        if (triCount <= 0) return geometry;

        const pos = posAttr.array;
        const stride = Math.max(3, Number(posAttr.itemSize) || 3);
        const isInsideTri = (triIndex) => {
            const base = triIndex * 3;
            const i0 = idxArray ? idxArray[base] : base;
            const i1 = idxArray ? idxArray[base + 1] : (base + 1);
            const i2 = idxArray ? idxArray[base + 2] : (base + 2);
            const o0 = i0 * stride;
            const o1 = i1 * stride;
            const o2 = i2 * stride;
            const cx = (pos[o0] + pos[o1] + pos[o2]) / 3;
            const cz = (pos[o0 + 2] + pos[o1 + 2] + pos[o2 + 2]) / 3;
            if (Number(radiusMeters) > EPS) {
                const insideLod = this._isBiomeTilingOverlayPointInsideRegularPolygon({
                    x: cx,
                    z: cz,
                    centerX,
                    centerZ,
                    radiusMeters,
                    sides
                });
                if (!insideLod) return false;
            }
            if (Array.isArray(viewportPolygon) && viewportPolygon.length >= 3) {
                return this._isPointInsideBiomeTilingConvexPolygonXZ({
                    x: cx,
                    z: cz,
                    polygon: viewportPolygon
                });
            }
            return true;
        };

        let keepTriCount = 0;
        for (let tri = 0; tri < triCount; tri++) {
            if (isInsideTri(tri)) keepTriCount++;
        }
        if (keepTriCount >= triCount) return geometry;

        const maxVertexIndex = Math.max(0, Math.round(Number(posAttr.count) - 1));
        if (keepTriCount <= 0) {
            const emptyIndex = maxVertexIndex > 65535 ? new Uint32Array(0) : new Uint16Array(0);
            geo.setIndex(new THREE.BufferAttribute(emptyIndex, 1));
            geo.computeBoundingSphere?.();
            geo.computeBoundingBox?.();
            return geometry;
        }
        const nextIndex = maxVertexIndex > 65535
            ? new Uint32Array(keepTriCount * 3)
            : new Uint16Array(keepTriCount * 3);
        let write = 0;
        for (let tri = 0; tri < triCount; tri++) {
            if (!isInsideTri(tri)) continue;
            const base = tri * 3;
            nextIndex[write++] = idxArray ? idxArray[base] : base;
            nextIndex[write++] = idxArray ? idxArray[base + 1] : (base + 1);
            nextIndex[write++] = idxArray ? idxArray[base + 2] : (base + 2);
        }

        geo.setIndex(new THREE.BufferAttribute(nextIndex, 1));
        geo.computeBoundingSphere?.();
        geo.computeBoundingBox?.();
        return geometry;
    }

    _rotateBiomeTilingOverlayUvForView({
        geometry,
        centerX,
        centerZ
    } = {}) {
        const geo = geometry?.isBufferGeometry ? geometry : null;
        const uv = geo?.attributes?.uv;
        const camera = this.camera;
        if (!geo || !uv?.isBufferAttribute || !camera) return;

        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        dir.y = 0;
        if (dir.lengthSq() <= EPS) return;
        dir.normalize();

        const yaw = Math.atan2(dir.z, dir.x);
        const sin = Math.sin(-yaw);
        const cos = Math.cos(-yaw);
        const cx = Number(centerX) || 0;
        const cz = Number(centerZ) || 0;
        const arr = uv.array;
        for (let i = 0; i < uv.count; i++) {
            const o = i * 2;
            const x = Number(arr[o]) || 0;
            const z = Number(arr[o + 1]) || 0;
            const dx = x - cx;
            const dz = z - cz;
            arr[o] = cx + (dx * cos - dz * sin);
            arr[o + 1] = cz + (dx * sin + dz * cos);
        }
        uv.needsUpdate = true;
    }

    _syncBiomeTilingDisplacementOverlay({
        forceRebuild = false,
        allowCreate = true,
        allowRebuild = true,
        refreshViewportMask = false
    } = {}) {
        const scene = this.scene;
        const terrain = this._terrain;
        if (!scene || !terrain) {
            this._removeBiomeTilingDisplacementOverlay();
            return { rebuilt: false, triangles: 0 };
        }

        const tilingViewActive = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING;
        if (!tilingViewActive) {
            this._removeBiomeTilingDisplacementOverlay();
            return { rebuilt: false, triangles: 0 };
        }
        const lodEnabled = this._biomeTilingState?.geometryDensity?.enabled !== false;
        if (!lodEnabled) {
            this._hideBiomeTilingDisplacementOverlay();
            return {
                rebuilt: false,
                triangles: this._getGeometryTriangleCount(this._biomeTilingDisplacementOverlay?.geometry)
            };
        }
        if (!allowCreate && !this._biomeTilingDisplacementOverlay) {
            return { rebuilt: false, triangles: 0 };
        }
        if (refreshViewportMask) this._resetBiomeTilingViewportMaskCache();

        const baseSpec = this._buildTerrainSpec();
        const bounds = this._getTerrainBoundsXZ();
        if (!baseSpec || !bounds) {
            this._removeBiomeTilingDisplacementOverlay();
            return { rebuilt: false, triangles: 0 };
        }
        const applied = this._biomeTilingAppliedGeometryState ?? {};
        const tileSizeMeters = Math.max(EPS, Number(baseSpec.tileSize) || 24);
        const widthTiles = Math.max(1, Math.round(Number(baseSpec.widthTiles) || 1));
        const depthTiles = Math.max(1, Math.round(Number(baseSpec.depthTiles) || 1));
        const tileMinX = Math.round(Number(baseSpec.tileMinX) || 0);
        const tileMinZ = Math.round(Number(baseSpec.tileMinZ) || 0);
        const desiredOverlayMinX = Number(bounds.minX);
        const desiredOverlayMaxX = Number(bounds.maxX);
        const desiredOverlayMinZ = Number(bounds.minZ);
        const desiredOverlayMaxZ = Number(bounds.maxZ);
        if (!(desiredOverlayMaxX > desiredOverlayMinX + EPS && desiredOverlayMaxZ > desiredOverlayMinZ + EPS)) {
            this._removeBiomeTilingDisplacementOverlay();
            return { rebuilt: false, triangles: 0 };
        }
        let centerX = Number(applied.centerX);
        let centerZ = Number(applied.centerZ);
        if (!Number.isFinite(centerX)) centerX = (desiredOverlayMinX + desiredOverlayMaxX) * 0.5;
        if (!Number.isFinite(centerZ)) centerZ = (desiredOverlayMinZ + desiredOverlayMaxZ) * 0.5;
        centerX = clamp(centerX, desiredOverlayMinX, desiredOverlayMaxX, centerX);
        centerZ = clamp(centerZ, desiredOverlayMinZ, desiredOverlayMaxZ, centerZ);

        const detailPreset = normalizeBiomeTilingLodPreset(applied.detailPreset);
        const thresholdsTiles = Array.isArray(applied.lodThresholdTiles)
            ? applied.lodThresholdTiles.slice(0, 4).map((n) => Math.max(0, Number(n) || 0))
            : getBiomeTilingLodPresetThresholdsTiles(detailPreset);
        const waveStrength = clamp(
            applied.waveStrength,
            0.0,
            1.0,
            BIOME_TILING_DEFAULT_STATE.geometryDensity.waveStrength
        );
        const waveMaxHeightMeters = clamp(
            applied.waveMaxHeightMeters,
            0.0,
            BIOME_TILING_WAVE_HARD_MAX_HEIGHT_METERS,
            BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxHeightMeters
        );
        const waveMaxNeighborDeltaMeters = clamp(
            applied.waveMaxNeighborDeltaMeters,
            0.0,
            BIOME_TILING_WAVE_HARD_MAX_NEIGHBOR_DELTA_METERS,
            BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxNeighborDeltaMeters
        );
        const waveMaxTileRangeMeters = clamp(
            applied.waveMaxTileRangeMeters,
            0.0,
            BIOME_TILING_WAVE_HARD_MAX_TILE_RANGE_METERS,
            BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxTileRangeMeters
        );
        const terrainSeedRaw = this._terrainEngine?.getConfig?.()?.seed ?? this._terrainSpec?.seed ?? 'terrain_lod';
        const waveSeed = hashStringToUint32(terrainSeedRaw);
        const overlayKey = [
            tileSizeMeters.toFixed(4),
            widthTiles,
            depthTiles,
            tileMinX,
            tileMinZ,
            desiredOverlayMinX.toFixed(3),
            desiredOverlayMaxX.toFixed(3),
            desiredOverlayMinZ.toFixed(3),
            desiredOverlayMaxZ.toFixed(3),
            centerX.toFixed(3),
            centerZ.toFixed(3),
            detailPreset,
            thresholdsTiles.map((v) => Number(v).toFixed(3)).join(','),
            waveStrength.toFixed(5),
            waveMaxHeightMeters.toFixed(3),
            waveSeed
        ].join('|');
        if (
            this._biomeTilingDisplacementOverlay
            && (
                !allowRebuild
                || (!forceRebuild && overlayKey === this._biomeTilingDisplacementOverlayKey)
            )
        ) {
            const overlayMat = this._ensureBiomeTilingDisplacementOverlayMaterial();
            if (this._biomeTilingDisplacementOverlay.material !== overlayMat) {
                this._biomeTilingDisplacementOverlay.material = overlayMat;
            }
            this._biomeTilingDisplacementOverlay.position.set(0, BIOME_TILING_DISPLACEMENT_OVERLAY_Y_OFFSET_METERS, 0);
            this._biomeTilingDisplacementOverlay.visible = true;
            this._syncBiomeTilingDisplacementOverlayMaterialFromTerrain();
            return {
                rebuilt: false,
                triangles: this._getGeometryTriangleCount(this._biomeTilingDisplacementOverlay.geometry)
            };
        }

        const cornersW = widthTiles + 1;
        const cornersH = depthTiles + 1;
        const cornerHeights = new Float32Array(cornersW * cornersH);
        const cornerIndex = (ix, iz) => (iz * cornersW) + ix;
        const waveAmplitudeMeters = clamp(
            waveStrength * waveMaxHeightMeters * 4.0,
            0.0,
            waveMaxHeightMeters,
            0.0
        );
        for (let iz = 0; iz < cornersH; iz++) {
            for (let ix = 0; ix < cornersW; ix++) {
                const hA = terrainCloudHash2((ix + (waveSeed & 0x7fff)) | 0, (iz + ((waveSeed >>> 16) & 0x7fff)) | 0) / 4294967295;
                const hB = terrainCloudHash2((ix * 3 + (waveSeed & 0xffff)) | 0, (iz * 5 + ((waveSeed >>> 8) & 0xffff)) | 0) / 4294967295;
                const h = ((hA * 0.62) + (hB * 0.38)) * 2 - 1;
                cornerHeights[cornerIndex(ix, iz)] = clamp(h * waveAmplitudeMeters, -waveMaxHeightMeters, waveMaxHeightMeters, 0.0);
            }
        }

        const positions = [];
        const uvs = [];
        const indices = [];
        const lodTileCounts = buildBiomeTilingLodCountsMap();
        let lodTotalQuads = 0;
        let vertexBase = 0;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let iz = 0; iz < depthTiles; iz++) {
            const tileZ0 = desiredOverlayMinZ + iz * tileSizeMeters;
            const tileZ1 = tileZ0 + tileSizeMeters;
            for (let ix = 0; ix < widthTiles; ix++) {
                const tileX0 = desiredOverlayMinX + ix * tileSizeMeters;
                const tileX1 = tileX0 + tileSizeMeters;
                const tileCenterX = (tileX0 + tileX1) * 0.5;
                const tileCenterZ = (tileZ0 + tileZ1) * 0.5;
                const distanceTiles = Math.max(
                    Math.abs(tileCenterX - centerX) / Math.max(EPS, tileSizeMeters),
                    Math.abs(tileCenterZ - centerZ) / Math.max(EPS, tileSizeMeters)
                );
                const quadsPerTile = resolveBiomeTilingLodQuadsForDistanceTiles(distanceTiles, thresholdsTiles);
                const segmentsPerTile = Math.max(1, Math.round(Math.sqrt(quadsPerTile)));
                lodTotalQuads += quadsPerTile;
                lodTileCounts[String(quadsPerTile)] = Math.max(0, Math.round(Number(lodTileCounts[String(quadsPerTile)] || 0))) + 1;

                const h00 = cornerHeights[cornerIndex(ix, iz)];
                const h10 = cornerHeights[cornerIndex(ix + 1, iz)];
                const h01 = cornerHeights[cornerIndex(ix, iz + 1)];
                const h11 = cornerHeights[cornerIndex(ix + 1, iz + 1)];

                for (let vz = 0; vz <= segmentsPerTile; vz++) {
                    const v = vz / segmentsPerTile;
                    const z = tileZ0 + (tileSizeMeters * v);
                    const hz0 = h00 + (h01 - h00) * v;
                    const hz1 = h10 + (h11 - h10) * v;
                    for (let vx = 0; vx <= segmentsPerTile; vx++) {
                        const u = vx / segmentsPerTile;
                        const x = tileX0 + (tileSizeMeters * u);
                        const y = hz0 + (hz1 - hz0) * u;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                        positions.push(x, y, z);
                        uvs.push(x, z);
                    }
                }
                for (let zSeg = 0; zSeg < segmentsPerTile; zSeg++) {
                    for (let xSeg = 0; xSeg < segmentsPerTile; xSeg++) {
                        const a = vertexBase + (zSeg * (segmentsPerTile + 1)) + xSeg;
                        const b = a + 1;
                        const c = a + (segmentsPerTile + 1);
                        const d = c + 1;
                        indices.push(a, c, b, b, c, d);
                    }
                }
                vertexBase += (segmentsPerTile + 1) * (segmentsPerTile + 1);
            }
        }

        const overlayGeo = new THREE.BufferGeometry();
        overlayGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        overlayGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        if (vertexBase > 65535) overlayGeo.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
        else overlayGeo.setIndex(new THREE.Uint16BufferAttribute(indices, 1));
        ensureUv2(overlayGeo);
        overlayGeo.computeVertexNormals();
        overlayGeo.computeBoundingBox();
        overlayGeo.computeBoundingSphere();

        const triangles = this._getGeometryTriangleCount(overlayGeo);
        const overlayBoundsApplied = {
            minX: desiredOverlayMinX,
            maxX: desiredOverlayMaxX,
            minZ: desiredOverlayMinZ,
            maxZ: desiredOverlayMaxZ
        };
        const nearRadiusMeters = Math.max(0, thresholdsTiles[0] * tileSizeMeters);
        const transitionWidthMeters = Math.max(0, (thresholdsTiles[1] - thresholdsTiles[0]) * tileSizeMeters);
        const renderDistanceMeters = Math.max(0, thresholdsTiles[3] * tileSizeMeters);
        this._biomeTilingAppliedGeometryState = {
            enabled: lodEnabled,
            mode: 'adaptive_rings',
            detailPreset,
            lodLevels: BIOME_TILING_LOD_QUAD_LEVELS.slice(),
            lodThresholdTiles: thresholdsTiles.slice(),
            lodBandWidthsMeters: thresholdsTiles.map((t) => Math.max(0, Number(t) * tileSizeMeters)),
            lodTileCounts,
            lodTotalQuads,
            segmentsPerTile: 1,
            nearSegmentsPerTile: 16,
            farSegmentsPerTile: 1,
            nearRadiusMeters,
            transitionWidthMeters,
            renderDistanceMeters,
            transitionSmoothing: clamp(
                applied.transitionSmoothing,
                0.0,
                1.0,
                BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionSmoothing
            ),
            transitionBias: clamp(
                applied.transitionBias,
                -0.85,
                0.85,
                BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionBias
            ),
            transitionDebugBands: 0,
            waveStrength,
            waveMaxHeightMeters,
            waveMaxNeighborDeltaMeters,
            waveMaxTileRangeMeters,
            ringOverlayEnabled: false,
            overlayBounds: overlayBoundsApplied,
            overlayViewportBounds: null,
            overlayViewportPolygon: null,
            overlayViewportKey: '',
            centerX,
            centerZ
        };

        const overlayMat = this._ensureBiomeTilingDisplacementOverlayMaterial();
        let overlay = this._biomeTilingDisplacementOverlay;
        if (!overlay) {
            overlay = new THREE.Mesh(overlayGeo, overlayMat);
            overlay.name = 'TerrainLodOverlay';
            overlay.receiveShadow = false;
            overlay.castShadow = false;
            overlay.renderOrder = 2;
            scene.add(overlay);
            this._biomeTilingDisplacementOverlay = overlay;
        } else {
            const oldGeo = overlay.geometry;
            overlay.geometry = overlayGeo;
            oldGeo?.dispose?.();
            if (overlay.material !== overlayMat) overlay.material = overlayMat;
            overlay.renderOrder = 2;
        }
        overlay.position.set(0, BIOME_TILING_DISPLACEMENT_OVERLAY_Y_OFFSET_METERS, 0);
        overlay.visible = true;

        this._biomeTilingDisplacementOverlayKey = overlayKey;
        if (Number.isFinite(minY) && Number.isFinite(maxY)) {
            this._terrainBounds.minY = Math.min(Number(this._terrainBounds?.minY) || 0, minY);
            this._terrainBounds.maxY = Math.max(Number(this._terrainBounds?.maxY) || 0, maxY);
        }
        this._syncBiomeTilingDisplacementOverlayMaterialFromTerrain();
        this._applyBiomeTilingDisplacementDebugView();
        return { rebuilt: true, triangles };
    }

    _getBiomeTilingCalibrationRigOrigin() {
        const bounds = this._getTerrainBoundsXZ();
        const centerX = bounds ? (bounds.minX + bounds.maxX) * 0.5 : 0;
        const centerZ = bounds ? (bounds.minZ + bounds.maxZ) * 0.5 : 0;
        const maxY = Number(this._terrainBounds?.maxY) || 0;
        const origin = new THREE.Vector3(centerX, maxY + BIOME_TILING_CALIB_RIG_ELEVATION_OFFSET_METERS, centerZ);
        return origin;
    }

    _disposeBiomeTilingCalibrationRigTextures(rig) {
        const src = rig?.textures ?? null;
        if (!src || typeof src !== 'object') return;
        const disposed = new Set();
        for (const tex of Object.values(src)) {
            if (!tex?.isTexture) continue;
            if (disposed.has(tex)) continue;
            disposed.add(tex);
            tex.dispose?.();
        }
        rig.textures = null;
    }

    _applyBiomeTilingCalibrationRigTextureScale(nearScale) {
        const rig = this._biomeTilingCalibrationRig;
        if (!rig) return;
        const textures = rig.textures;
        if (!textures || typeof textures !== 'object') return;
        const nextNearScale = clamp(
            nearScale,
            0.1,
            6.0,
            BIOME_TILING_DEFAULT_STATE.distanceTiling.nearScale
        );
        const tileMeters = Math.max(EPS, Number(rig.tileMeters) || 4.0);
        const repeat = nextNearScale / tileMeters;
        for (const tex of Object.values(textures)) {
            if (!tex?.isTexture) continue;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(repeat, repeat);
            tex.needsUpdate = true;
        }
        rig.nearScale = nextNearScale;
    }

    _applyBiomeTilingCalibrationRigMaterial(materialId, nearScale) {
        const rig = this._biomeTilingCalibrationRig;
        if (!rig) return;
        const mat = rig.slotMaterial ?? null;
        if (!mat?.isMeshStandardMaterial) return;
        const resolvedNearScale = clamp(
            nearScale,
            0.1,
            6.0,
            BIOME_TILING_DEFAULT_STATE.distanceTiling.nearScale
        );

        const id = String(materialId ?? '').trim();
        if (id === String(rig.materialId ?? '')) {
            this._applyBiomeTilingCalibrationRigTextureScale(resolvedNearScale);
            return;
        }
        rig.materialId = id;

        this._disposeBiomeTilingCalibrationRigTextures(rig);
        rig.tileMeters = 4.0;

        if (!id) {
            mat.map = null;
            mat.normalMap = null;
            mat.roughnessMap = null;
            mat.metalnessMap = null;
            mat.aoMap = null;
            mat.roughness = 1.0;
            mat.metalness = 0.0;
            if ('aoMapIntensity' in mat) mat.aoMapIntensity = 1.0;
            mat.color?.setRGB?.(0.75, 0.75, 0.75);
            if (mat.normalScale?.set) mat.normalScale.set(1, 1);
            rig.nearScale = resolvedNearScale;
            mat.needsUpdate = true;
            return;
        }

        const resolved = this._resolvePbrMaterialPayload(id, {
            cloneTextures: true,
            diagnosticsTag: 'TerrainDebuggerView.biomeTilingRig'
        });
        const textures = {
            baseColor: resolved?.textures?.baseColor ?? null,
            normal: resolved?.textures?.normal ?? null,
            orm: resolved?.textures?.orm ?? null,
            ao: resolved?.textures?.ao ?? null,
            roughness: resolved?.textures?.roughness ?? null,
            metalness: resolved?.textures?.metalness ?? null
        };

        const resolvedTileMeters = Number(resolved?.overrides?.effective?.tileMeters);
        rig.tileMeters = Math.max(EPS, (Number.isFinite(resolvedTileMeters) ? resolvedTileMeters : Number(getPbrMaterialMeta(id)?.tileMeters)) || 4.0);
        rig.textures = textures;
        this._applyBiomeTilingCalibrationRigTextureScale(resolvedNearScale);

        mat.map = textures.baseColor ?? null;
        mat.normalMap = textures.normal ?? null;
        if (textures.orm) {
            mat.roughnessMap = textures.orm;
            mat.metalnessMap = textures.orm;
            mat.aoMap = textures.orm;
            mat.metalness = 1.0;
        } else {
            mat.aoMap = textures.ao ?? null;
            mat.roughnessMap = textures.roughness ?? null;
            mat.metalnessMap = textures.metalness ?? null;
            mat.metalness = textures.metalness ? 1.0 : 0.0;
        }
        mat.roughness = 1.0;
        if ('aoMapIntensity' in mat) mat.aoMapIntensity = 1.0;
        if (mat.normalScale?.set) mat.normalScale.set(1, 1);
        mat.color?.setRGB?.(1, 1, 1);
        mat.needsUpdate = true;
    }

    _disableBiomeTilingCalibrationRigDebug() {
        const rig = this._biomeTilingCalibrationRig;
        if (!rig) return;

        const anim = this._biomeTilingCalibrationRigAnim;
        if (anim?.restoreControlsEnabled !== undefined && this.controls) {
            this.controls.enabled = !!anim.restoreControlsEnabled;
        }
        this._biomeTilingCalibrationRigAnim = null;

        rig.group?.removeFromParent?.();
        this.scene?.remove?.(rig.group);
        this._disposeBiomeTilingCalibrationRigTextures(rig);
        this._disposeObjectResources(rig.group);
        this._biomeTilingCalibrationRig = null;
    }

    _enableBiomeTilingCalibrationRigDebug({ materialId, nearScale, nowMs } = {}) {
        const scene = this.scene;
        if (!scene) return;
        if (this._biomeTilingCalibrationRig) return;

        const origin = this._getBiomeTilingCalibrationRigOrigin();

        const group = new THREE.Group();
        group.name = 'BiomeTilingCalibrationRig';
        group.position.copy(origin);
        scene.add(group);

        const plateGeo = new THREE.BoxGeometry(
            BIOME_TILING_CALIB_RIG_PLATE_SIZE,
            BIOME_TILING_CALIB_RIG_PLATE_THICKNESS,
            BIOME_TILING_CALIB_RIG_PLATE_SIZE
        );
        const plateMat = new THREE.MeshStandardMaterial({ color: 0x1f242c, roughness: 1.0, metalness: 0.0 });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.name = 'plate';
        plate.position.set(0, BIOME_TILING_CALIB_RIG_PLATE_THICKNESS * 0.5, 0);
        plate.receiveShadow = true;
        group.add(plate);

        const panelGeo = new THREE.PlaneGeometry(BIOME_TILING_CALIB_RIG_PANEL_WIDTH, BIOME_TILING_CALIB_RIG_PANEL_HEIGHT, 1, 1);
        scaleUv(panelGeo, BIOME_TILING_CALIB_RIG_PANEL_WIDTH, BIOME_TILING_CALIB_RIG_PANEL_HEIGHT);
        ensureUv2(panelGeo);

        const sphereGeo = new THREE.SphereGeometry(BIOME_TILING_CALIB_RIG_SPHERE_RADIUS, 48, 32);
        scaleUv(
            sphereGeo,
            2 * Math.PI * BIOME_TILING_CALIB_RIG_SPHERE_RADIUS,
            Math.PI * BIOME_TILING_CALIB_RIG_SPHERE_RADIUS
        );
        ensureUv2(sphereGeo);

        const cubeGeo = new THREE.BoxGeometry(BIOME_TILING_CALIB_RIG_CUBE_SIZE, BIOME_TILING_CALIB_RIG_CUBE_SIZE, BIOME_TILING_CALIB_RIG_CUBE_SIZE);
        scaleUv(cubeGeo, BIOME_TILING_CALIB_RIG_CUBE_SIZE, BIOME_TILING_CALIB_RIG_CUBE_SIZE);
        ensureUv2(cubeGeo);

        const slotMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0
        });

        const panel = new THREE.Mesh(panelGeo, slotMat);
        panel.name = 'panel';
        panel.position.set(0, BIOME_TILING_CALIB_RIG_PLATE_THICKNESS + 1.15, -0.95);
        panel.receiveShadow = true;
        group.add(panel);

        const sphere = new THREE.Mesh(sphereGeo, slotMat);
        sphere.name = 'sphere';
        sphere.position.set(-0.55, BIOME_TILING_CALIB_RIG_PLATE_THICKNESS + BIOME_TILING_CALIB_RIG_SPHERE_RADIUS, 0.55);
        sphere.castShadow = true;
        sphere.receiveShadow = true;
        group.add(sphere);

        const cube = new THREE.Mesh(cubeGeo, slotMat);
        cube.name = 'cube';
        cube.position.set(0.7, BIOME_TILING_CALIB_RIG_PLATE_THICKNESS + (BIOME_TILING_CALIB_RIG_CUBE_SIZE * 0.5), 0.25);
        cube.rotation.y = Math.PI * 0.25;
        cube.castShadow = true;
        cube.receiveShadow = true;
        group.add(cube);

        this._biomeTilingCalibrationRig = {
            group,
            origin,
            materialId: '',
            slotMaterial: slotMat,
            textures: null,
            tileMeters: 4.0,
            nearScale: clamp(
                nearScale,
                0.1,
                6.0,
                BIOME_TILING_DEFAULT_STATE.distanceTiling.nearScale
            )
        };

        this._applyBiomeTilingCalibrationRigMaterial(materialId, nearScale);
        this._startBiomeTilingCalibrationRigAnimation({ origin, nowMs: Number(nowMs) || performance.now() });
    }

    _startBiomeTilingCalibrationRigAnimation({ origin, nowMs } = {}) {
        const controls = this.controls;
        const camera = this.camera;
        const sun = this._sunLight;
        if (!controls?.setLookAt || !camera || !sun) return;
        if (!origin?.isVector3) return;

        this._biomeTilingSunOrbitAnim = null;
        this._disableFlyoverDebug();
        if (this._flyover?.active) this._stopFlyover({ keepPose: true });
        this._clearKeys();

        const restoreControlsEnabled = !!controls.enabled;
        controls.enabled = false;

        const camStartPos = camera.position.clone();
        const camStartTgt = controls.target?.clone?.() ?? new THREE.Vector3(0, 0, 0);
        const sunStartPos = sun.position.clone();
        const sunStartTgt = sun.target?.position?.clone?.() ?? new THREE.Vector3(0, 0, 0);

        const camEndPos = new THREE.Vector3(
            origin.x + BIOME_TILING_CALIB_RIG_CAMERA_POSITION.x,
            origin.y + BIOME_TILING_CALIB_RIG_CAMERA_POSITION.y,
            origin.z + BIOME_TILING_CALIB_RIG_CAMERA_POSITION.z
        );
        const camEndTgt = new THREE.Vector3(
            origin.x + BIOME_TILING_CALIB_RIG_CAMERA_TARGET.x,
            origin.y + BIOME_TILING_CALIB_RIG_CAMERA_TARGET.y,
            origin.z + BIOME_TILING_CALIB_RIG_CAMERA_TARGET.z
        );

        const sunEndPos = new THREE.Vector3(
            origin.x + BIOME_TILING_CALIB_RIG_SUN_POSITION.x,
            origin.y + BIOME_TILING_CALIB_RIG_SUN_POSITION.y,
            origin.z + BIOME_TILING_CALIB_RIG_SUN_POSITION.z
        );
        const sunEndTgt = new THREE.Vector3(
            origin.x + BIOME_TILING_CALIB_RIG_SUN_TARGET.x,
            origin.y + BIOME_TILING_CALIB_RIG_SUN_TARGET.y,
            origin.z + BIOME_TILING_CALIB_RIG_SUN_TARGET.z
        );

        this._biomeTilingCalibrationRigAnim = {
            startMs: Number(nowMs) || performance.now(),
            durationMs: BIOME_TILING_CALIB_RIG_ANIMATION_MS,
            restoreControlsEnabled,
            camStartPos,
            camStartTgt,
            camEndPos,
            camEndTgt,
            sunStartPos,
            sunStartTgt,
            sunEndPos,
            sunEndTgt,
            tmpCamPos: new THREE.Vector3(),
            tmpCamTgt: new THREE.Vector3(),
            tmpSunPos: new THREE.Vector3(),
            tmpSunTgt: new THREE.Vector3()
        };
    }

    _updateBiomeTilingCalibrationRigAnimation(nowMs) {
        const anim = this._biomeTilingCalibrationRigAnim;
        if (!anim) return;

        const controls = this.controls;
        const sun = this._sunLight;
        if (!controls?.setLookAt || !sun) {
            this._biomeTilingCalibrationRigAnim = null;
            return;
        }

        const t0 = Number(anim.startMs) || 0;
        const duration = Math.max(1, Number(anim.durationMs) || BIOME_TILING_CALIB_RIG_ANIMATION_MS);
        const elapsed = Math.max(0, Number(nowMs) - t0);
        const u = clamp(elapsed / duration, 0, 1, 0);
        const w = smoothstep01(u);

        anim.tmpCamPos.lerpVectors(anim.camStartPos, anim.camEndPos, w);
        anim.tmpCamTgt.lerpVectors(anim.camStartTgt, anim.camEndTgt, w);
        controls.setLookAt({ position: anim.tmpCamPos, target: anim.tmpCamTgt });

        anim.tmpSunPos.lerpVectors(anim.sunStartPos, anim.sunEndPos, w);
        anim.tmpSunTgt.lerpVectors(anim.sunStartTgt, anim.sunEndTgt, w);
        sun.position.copy(anim.tmpSunPos);
        if (sun.target?.position) sun.target.position.copy(anim.tmpSunTgt);

        if (u < 1) return;

        controls.setLookAt({ position: anim.camEndPos, target: anim.camEndTgt });
        sun.position.copy(anim.sunEndPos);
        if (sun.target?.position) sun.target.position.copy(anim.sunEndTgt);
        if (sun.target?.updateMatrixWorld) sun.target.updateMatrixWorld(true);

        if (controls) controls.enabled = !!anim.restoreControlsEnabled;
        this._activeCameraPresetId = 'custom';
        this._syncCameraStatus({ nowMs: Number(nowMs) || performance.now(), force: true });
        this._syncBiomeTilingHref({ force: true });
        this._biomeTilingCalibrationRigAnim = null;
    }

    _startBiomeTilingSunOrbit({ nowMs = performance.now() } = {}) {
        const sun = this._sunLight;
        if (!sun?.isDirectionalLight) return;
        if (this._terrainViewMode !== TERRAIN_VIEW_MODE.BIOME_TILING) return;

        this._disableFlyoverDebug();
        if (this._flyover?.active) this._stopFlyover({ keepPose: true });
        this._biomeTilingCalibrationRigAnim = null;

        const bounds = this._getTerrainBoundsXZ();
        if (!bounds) {
            this._biomeTilingSunOrbitAnim = null;
            return;
        }

        const centerX = (Number(bounds.minX) + Number(bounds.maxX)) * 0.5;
        const centerZ = (Number(bounds.minZ) + Number(bounds.maxZ)) * 0.5;
        const extentX = Math.max(1, Number(bounds.maxX) - Number(bounds.minX));
        const extentZ = Math.max(1, Number(bounds.maxZ) - Number(bounds.minZ));
        const extent = Math.max(extentX, extentZ);
        const radius = Math.max(BIOME_TILING_SUN_ORBIT_RADIUS_MIN_METERS, extent * BIOME_TILING_SUN_ORBIT_RADIUS_SCALE);
        const targetY = Number(this._terrainBounds?.maxY) + 2.0;
        const centerY = targetY + (radius * Math.sin(THREE.MathUtils.degToRad(BIOME_TILING_SUN_ORBIT_MIN_ELEVATION_DEG)));
        const dx = Number(sun.position.x) - centerX;
        const dz = Number(sun.position.z) - centerZ;
        const startAzimuth = Math.atan2(Number.isFinite(dz) ? dz : 0, Number.isFinite(dx) ? dx : 1);

        this._biomeTilingSunOrbitAnim = {
            startMs: Number(nowMs) || performance.now(),
            durationMs: BIOME_TILING_SUN_ORBIT_ANIMATION_MS,
            centerX,
            centerY,
            centerZ,
            targetY,
            radius,
            startAzimuth,
            minElevationRad: THREE.MathUtils.degToRad(BIOME_TILING_SUN_ORBIT_MIN_ELEVATION_DEG),
            maxElevationRad: THREE.MathUtils.degToRad(BIOME_TILING_SUN_ORBIT_MAX_ELEVATION_DEG),
            tmpPos: new THREE.Vector3(),
            tmpTgt: new THREE.Vector3()
        };
    }

    _updateBiomeTilingSunOrbit(nowMs) {
        const anim = this._biomeTilingSunOrbitAnim;
        if (!anim) return;
        const sun = this._sunLight;
        if (!sun?.isDirectionalLight || this._terrainViewMode !== TERRAIN_VIEW_MODE.BIOME_TILING) {
            this._biomeTilingSunOrbitAnim = null;
            return;
        }

        const startMs = Number(anim.startMs) || 0;
        const durationMs = Math.max(1, Number(anim.durationMs) || BIOME_TILING_SUN_ORBIT_ANIMATION_MS);
        const elapsedMs = Math.max(0, Number(nowMs) - startMs);
        const u = clamp(elapsedMs / durationMs, 0, 1, 0);
        // Blend toward cubic ease to keep the orbit ease-in/out, but less aggressively than pure quint.
        const w = THREE.MathUtils.lerp(easeInOutCubic01(u), easeInOutQuint01(u), 0.25);
        const azimuth = Number(anim.startAzimuth) + (Math.PI * 2 * w);
        const elevation = THREE.MathUtils.lerp(
            Number(anim.minElevationRad),
            Number(anim.maxElevationRad),
            0.5 + (0.5 * Math.sin(azimuth))
        );
        const orbitRadius = Math.max(1, Number(anim.radius) || BIOME_TILING_SUN_ORBIT_RADIUS_MIN_METERS);
        const horizontalRadius = orbitRadius * Math.cos(elevation);
        const y = Number(anim.centerY) + (orbitRadius * Math.sin(elevation));
        const x = Number(anim.centerX) + (horizontalRadius * Math.cos(azimuth));
        const z = Number(anim.centerZ) + (horizontalRadius * Math.sin(azimuth));

        anim.tmpPos.set(x, y, z);
        anim.tmpTgt.set(Number(anim.centerX), Number(anim.targetY), Number(anim.centerZ));
        sun.position.copy(anim.tmpPos);
        if (sun.target?.position) {
            sun.target.position.copy(anim.tmpTgt);
            sun.target.updateMatrixWorld?.(true);
        }

        if (u >= 1 - EPS) this._biomeTilingSunOrbitAnim = null;
    }

    _syncBiomeTilingCalibrationRigDebug({ enabled = false, materialId = '', nearScale } = {}) {
        const wants = !!enabled;
        const prev = !!this._biomeTilingCalibrationRigDebugEnabled;
        this._biomeTilingCalibrationRigDebugEnabled = wants;

        if (!wants) {
            if (this._biomeTilingCalibrationRig) this._disableBiomeTilingCalibrationRigDebug();
            return;
        }

        if (!prev || !this._biomeTilingCalibrationRig) {
            this._enableBiomeTilingCalibrationRigDebug({ materialId, nearScale, nowMs: performance.now() });
            return;
        }

        this._applyBiomeTilingCalibrationRigMaterial(materialId, nearScale);
    }

    _clearFlyoverDebugHelpers() {
        const scene = this.scene;
        const debug = this._flyoverDebug;
        if (!debug) return;
        if (debug.pathLine) {
            scene?.remove?.(debug.pathLine);
            this._disposeObjectResources(debug.pathLine);
            debug.pathLine = null;
        }
        if (debug.cameraIcon) {
            scene?.remove?.(debug.cameraIcon);
            this._disposeObjectResources(debug.cameraIcon);
            debug.cameraIcon = null;
        }
        if (debug.keyframesGroup) {
            scene?.remove?.(debug.keyframesGroup);
            this._disposeObjectResources(debug.keyframesGroup);
            debug.keyframesGroup = null;
        }
        if (debug.axisHelper) {
            scene?.remove?.(debug.axisHelper);
            this._disposeObjectResources(debug.axisHelper);
            debug.axisHelper = null;
        }
    }

    _disposeFlyoverDebugCameraController() {
        const ctrl = this._flyoverDebugCameraController;
        if (!ctrl) return;
        ctrl.dispose?.();
        this._flyoverDebugCameraController = null;
    }

    _createFlyoverDebugCameraController(camera) {
        if (!camera || !this.canvas) return null;
        this._disposeFlyoverDebugCameraController();

        const controller = new FirstPersonCameraController(camera, this.canvas, {
            uiRoot: this._ui?.root ?? null,
            enabled: true,
            lookSpeed: 1.0,
            panSpeed: 1.0,
            zoomSpeed: 1.0,
            getFocusTarget: () => {
                const focus = this._getBiomeTilingFocusPoses();
                const b = focus?.bounds ?? null;
                if (!b) return null;
                const center = new THREE.Vector3(
                    (Number(b.minX) + Number(b.maxX)) * 0.5,
                    Number(focus?.overview?.target?.y) || 0,
                    (Number(b.minZ) + Number(b.maxZ)) * 0.5
                );
                const spanX = Math.max(EPS, Number(b.sizeX) || 0);
                const spanZ = Math.max(EPS, Number(b.sizeZ) || 0);
                const radius = Math.max(8.0, Math.hypot(spanX, spanZ) * 0.62);
                return { center, radius };
            }
        });
        this._flyoverDebugCameraController = controller;
        return controller;
    }

    _disableFlyoverDebug() {
        const debug = this._flyoverDebug;
        if (!debug) return;
        this._disposeFlyoverDebugCameraController();
        this._clearFlyoverDebugHelpers();
        debug.active = false;
        debug.camera = null;
        this.camera?.layers?.disable?.(FLYOVER_DEBUG_HELPER_LAYER);
        this._removeFlyoverDebugControls();
    }

    _syncFlyoverDebugControls() {
        const ui = this._flyoverDebugUi;
        const root = ui?.root ?? null;
        const toggleBtn = ui?.toggleBtn ?? null;
        const resetBtn = ui?.resetBtn ?? null;
        if (!root || !toggleBtn || !resetBtn) return;

        const debugActive = !!this._flyoverDebug?.active;
        const flyoverActive = !!this._flyover?.active;
        const paused = !!this._flyover?.paused;
        root.style.display = (debugActive && flyoverActive) ? 'flex' : 'none';
        this._positionFlyoverDebugControls();

        toggleBtn.disabled = !flyoverActive;
        resetBtn.disabled = !flyoverActive;
        toggleBtn.textContent = paused ? 'Resume' : 'Pause';
    }

    _positionFlyoverDebugControls() {
        const root = this._flyoverDebugUi?.root ?? null;
        if (!root || typeof window === 'undefined') return;
        const margin = 12;

        const canvasRect = this.canvas?.getBoundingClientRect?.() ?? null;
        const panelRect = this._ui?.panel?.getBoundingClientRect?.() ?? null;
        const controlsRect = root.getBoundingClientRect();
        const controlsWidth = Math.max(0, Number(controlsRect.width) || 0);

        const top = canvasRect
            ? Math.max(margin, Math.round(Number(canvasRect.top) + margin))
            : margin;
        const minLeft = canvasRect
            ? Math.max(margin, Math.round(Number(canvasRect.left) + margin))
            : margin;

        let rightLimit = canvasRect
            ? Math.round(Number(canvasRect.right) - margin)
            : Math.round(window.innerWidth - margin);

        if (panelRect && Number(panelRect.width) > 0 && Number(panelRect.height) > 0) {
            rightLimit = Math.min(rightLimit, Math.round(Number(panelRect.left) - margin));
        }

        let left = rightLimit - Math.round(controlsWidth);
        if (!Number.isFinite(left)) left = minLeft;
        left = Math.max(minLeft, left);

        root.style.left = `${left}px`;
        root.style.top = `${top}px`;
        root.style.right = 'auto';
    }

    _ensureFlyoverDebugControls() {
        const ui = this._flyoverDebugUi;
        if (ui?.root) {
            this._syncFlyoverDebugControls();
            return;
        }
        if (typeof document === 'undefined') return;

        const root = document.createElement('div');
        root.style.position = 'fixed';
        root.style.top = '12px';
        root.style.left = '12px';
        root.style.zIndex = '260';
        root.style.display = 'flex';
        root.style.flexDirection = 'column';
        root.style.gap = '8px';
        root.style.pointerEvents = 'auto';

        const makeBtn = (label) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.className = 'options-btn';
            btn.style.minWidth = '88px';
            return btn;
        };

        const toggleBtn = makeBtn('Pause');
        toggleBtn.addEventListener('click', () => {
            if (this._flyover?.paused) this._resumeFlyover();
            else this._pauseFlyover();
        });
        root.appendChild(toggleBtn);

        const resetBtn = makeBtn('Reset');
        resetBtn.addEventListener('click', () => this._resetFlyoverToStart());
        root.appendChild(resetBtn);
        document.body.appendChild(root);

        this._flyoverDebugUi = { root, toggleBtn, resetBtn };
        this._positionFlyoverDebugControls();
        this._syncFlyoverDebugControls();
    }

    _removeFlyoverDebugControls() {
        const ui = this._flyoverDebugUi;
        ui?.root?.remove?.();
        this._flyoverDebugUi = {
            root: null,
            toggleBtn: null,
            resetBtn: null
        };
    }

    _pauseFlyover() {
        const flyover = this._flyover;
        if (!flyover?.active || flyover.paused) return;
        flyover.paused = true;
        flyover.pauseStartMs = performance.now();
        this._syncFlyoverDebugControls();
        this._syncCameraStatus({ nowMs: flyover.pauseStartMs, force: true });
    }

    _resumeFlyover() {
        const flyover = this._flyover;
        if (!flyover?.active || !flyover.paused) return;
        const nowMs = performance.now();
        const pauseStartMs = Number(flyover.pauseStartMs) || nowMs;
        flyover.startMs += Math.max(0, nowMs - pauseStartMs);
        flyover.pauseStartMs = 0;
        flyover.paused = false;
        this._syncFlyoverDebugControls();
        this._syncCameraStatus({ nowMs, force: true });
    }

    _resetFlyoverToStart() {
        const flyover = this._flyover;
        if (!flyover?.active) return;

        const nowMs = performance.now();
        flyover.timeSec = 0;
        if (flyover.paused) {
            flyover.pauseStartMs = nowMs;
        } else {
            flyover.startMs = nowMs;
            flyover.pauseStartMs = 0;
        }

        this._applyFlyoverPose(0);
        this._updateFlyoverDebugOverlay();
        this._syncFlyoverDebugControls();
        this._syncCameraStatus({ nowMs, force: true });
    }

    _createFlyoverDebugPathLine(path) {
        const poses = path?.poses instanceof Float32Array ? path.poses : null;
        const sampleCount = Math.max(0, Number(path?.sampleCount) || 0);
        if (!poses || sampleCount < 2) return null;

        const points = new Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
            const base = i * 6;
            points[i] = new THREE.Vector3(poses[base], poses[base + 1], poses[base + 2]);
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0xffc342,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false
        });
        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        line.renderOrder = 1000;
        this._setObjectLayerRecursive(line, FLYOVER_DEBUG_HELPER_LAYER);
        return line;
    }

    _createFlyoverDebugCameraIcon() {
        const group = new THREE.Group();

        const body = new THREE.Mesh(
            new THREE.BoxGeometry(4.0, 2.0, 2.2),
            new THREE.MeshBasicMaterial({
                color: 0xff5a3d,
                transparent: true,
                opacity: 0.95,
                depthTest: false,
                depthWrite: false
            })
        );
        body.renderOrder = 1002;

        const arrowCone = new THREE.Mesh(
            new THREE.ConeGeometry(0.95, 2.7, 10),
            new THREE.MeshBasicMaterial({
                color: 0xffe08a,
                transparent: true,
                opacity: 0.95,
                depthTest: false,
                depthWrite: false
            })
        );
        arrowCone.rotation.z = -Math.PI * 0.5;
        arrowCone.position.x = 3.2;
        arrowCone.renderOrder = 1003;

        const arrowLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0.2, 0, 0),
                new THREE.Vector3(8.2, 0, 0)
            ]),
            new THREE.LineBasicMaterial({
                color: 0x3ad2ff,
                transparent: true,
                opacity: 0.95,
                depthTest: false,
                depthWrite: false
            })
        );
        arrowLine.frustumCulled = false;
        arrowLine.renderOrder = 1004;

        group.add(body);
        group.add(arrowCone);
        group.add(arrowLine);
        group.frustumCulled = false;
        this._setObjectLayerRecursive(group, FLYOVER_DEBUG_HELPER_LAYER);
        return group;
    }

    _createFlyoverDebugKeyframeIndexSprite(indexOneBased) {
        if (typeof document === 'undefined') return null;
        const value = Number(indexOneBased);
        if (!Number.isFinite(value) || value < 1) return null;

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const label = String(Math.round(value));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 82px Arial';
        ctx.lineWidth = 11;
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.92)';
        ctx.strokeText(label, 64, 64);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            sizeAttenuation: true
        });

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(
            FLYOVER_DEBUG_KEYFRAME_INDEX_SIZE_METERS,
            FLYOVER_DEBUG_KEYFRAME_INDEX_SIZE_METERS,
            1
        );
        sprite.frustumCulled = false;
        sprite.renderOrder = 1009;
        return sprite;
    }

    _createFlyoverDebugKeyframes(path) {
        const keyframes = Array.isArray(path?.keyframes) ? path.keyframes : [];
        if (!keyframes.length) return null;
        const positionSegments = Array.isArray(path?.positionSegments) ? path.positionSegments : [];

        const group = new THREE.Group();
        group.frustumCulled = false;
        const arrowPalette = [0xff5f57, 0x4ecdc4, 0xffc857, 0x6c8cff, 0xff8fab, 0x7ddf64];
        const addLine = ({ from, to, color, renderOrder = 1005 }) => {
            if (!from?.isVector3 || !to?.isVector3) return;
            if (from.distanceToSquared(to) <= EPS) return;
            const line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]),
                new THREE.LineBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.95,
                    depthTest: false,
                    depthWrite: false
                })
            );
            line.frustumCulled = false;
            line.renderOrder = renderOrder;
            group.add(line);
        };
        const addTangentLine = ({ origin, control, color }) => {
            if (!origin?.isVector3 || !control?.isVector3) return;
            const delta = control.clone().sub(origin);
            if (delta.lengthSq() <= EPS) return;
            const tip = origin.clone().addScaledVector(delta, FLYOVER_DEBUG_TANGENT_EXTEND);
            addLine({ from: origin, to: tip, color });
        };
        const addYAxisTangentLine = ({ origin, sign = 1, color, lengthMeters = FLYOVER_DEBUG_KEYFRAME2_TANGENT_LENGTH_METERS }) => {
            if (!origin?.isVector3) return;
            const from = origin.clone();
            const dir = sign < 0 ? -1 : 1;
            const tip = from.clone();
            const len = Math.max(0.1, Number(lengthMeters) || FLYOVER_DEBUG_KEYFRAME2_TANGENT_LENGTH_METERS);
            tip.y += dir * len;
            addLine({ from, to: tip, color, renderOrder: 1010 });
        };

        for (let index = 0; index < keyframes.length; index++) {
            const frame = keyframes[index];
            const pos = frame?.position?.isVector3 ? frame.position : null;
            const target = frame?.target?.isVector3 ? frame.target : null;
            if (!pos || !target) continue;
            const arrowColor = arrowPalette[index % arrowPalette.length];

            const marker = new THREE.Group();
            marker.position.copy(pos);
            marker.frustumCulled = false;

            const base = new THREE.Mesh(
                new THREE.SphereGeometry(2.7, 16, 14),
                new THREE.MeshBasicMaterial({
                    color: 0xa78bfa,
                    transparent: true,
                    opacity: 0.9,
                    depthTest: false,
                    depthWrite: false
                })
            );
            base.renderOrder = 1006;

            const arrowStem = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0.2, 0, 0),
                    new THREE.Vector3(8.6, 0, 0)
                ]),
                new THREE.LineBasicMaterial({
                    color: arrowColor,
                    transparent: true,
                    opacity: 0.95,
                    depthTest: false,
                    depthWrite: false
                })
            );
            arrowStem.frustumCulled = false;
            arrowStem.renderOrder = 1007;

            const arrow = new THREE.Mesh(
                new THREE.ConeGeometry(1.45, 4.8, 14),
                new THREE.MeshBasicMaterial({
                    color: arrowColor,
                    transparent: true,
                    opacity: 0.95,
                    depthTest: false,
                    depthWrite: false
                })
            );
            arrow.rotation.z = -Math.PI * 0.5;
            arrow.position.x = 10.5;
            arrow.renderOrder = 1008;

            marker.add(base);
            marker.add(arrowStem);
            marker.add(arrow);

            this._flyoverDebugTmpDir.copy(target).sub(pos);
            if (this._flyoverDebugTmpDir.lengthSq() > EPS) {
                this._flyoverDebugTmpDir.normalize();
                marker.quaternion.setFromUnitVectors(FLYOVER_DEBUG_ICON_FORWARD, this._flyoverDebugTmpDir);
            }

            const incomingSeg = index > 0 ? (positionSegments[index - 1] ?? null) : null;
            const outgoingSeg = index < positionSegments.length ? (positionSegments[index] ?? null) : null;
            if (index === 1) {
                addYAxisTangentLine({
                    origin: pos,
                    sign: -1,
                    color: FLYOVER_DEBUG_TANGENT_IN_COLOR,
                    lengthMeters: FLYOVER_DEBUG_KEYFRAME2_TANGENT_LENGTH_METERS
                });
                addYAxisTangentLine({
                    origin: pos,
                    sign: -1,
                    color: FLYOVER_DEBUG_TANGENT_OUT_COLOR,
                    lengthMeters: FLYOVER_DEBUG_KEYFRAME2_TANGENT_LENGTH_METERS * FLYOVER_DEBUG_KEYFRAME2_TANGENT_SECONDARY_SCALE
                });
            } else {
                addTangentLine({ origin: pos, control: incomingSeg?.c2 ?? null, color: FLYOVER_DEBUG_TANGENT_IN_COLOR });
                addTangentLine({ origin: pos, control: outgoingSeg?.c1 ?? null, color: FLYOVER_DEBUG_TANGENT_OUT_COLOR });
            }

            group.add(marker);
            if (index < keyframes.length - 1) {
                const indexSprite = this._createFlyoverDebugKeyframeIndexSprite(index + 1);
                if (indexSprite) {
                    indexSprite.position.set(pos.x, pos.y - FLYOVER_DEBUG_KEYFRAME_INDEX_OFFSET_Y, pos.z);
                    group.add(indexSprite);
                }
            }
        }

        this._setObjectLayerRecursive(group, FLYOVER_DEBUG_HELPER_LAYER);
        return group;
    }

    _positionFlyoverDebugCamera() {
        const debug = this._flyoverDebug;
        const camera = debug?.camera;
        if (!camera) return;

        const focus = this._getBiomeTilingFocusPoses();
        if (!focus?.bounds) return;

        const bounds = focus.bounds;
        const centerX = (bounds.minX + bounds.maxX) * 0.5;
        const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
        const spanX = Math.max(EPS, bounds.sizeX);
        const spanZ = Math.max(EPS, bounds.sizeZ);
        const span = Math.max(spanX, spanZ);
        const targetY = Number(focus.overview?.target?.y) || 0;
        const position = new THREE.Vector3(
            bounds.maxX + spanX * 0.96,
            targetY + Math.max(58, span * 0.76),
            centerZ + spanZ * 0.22
        );
        const target = new THREE.Vector3(centerX, targetY + Math.max(4, span * 0.02), centerZ);

        const debugCtrl = this._flyoverDebugCameraController;
        if (debugCtrl?.setLookAt) {
            debugCtrl.setLookAt({ position, target });
        } else {
            camera.position.copy(position);
            camera.lookAt(target);
        }
        camera.updateProjectionMatrix?.();
    }

    _updateFlyoverDebugOverlay() {
        const debug = this._flyoverDebug;
        if (!debug?.active || !debug.cameraIcon) return;
        const camera = this.camera;
        const target = this.controls?.target;
        if (!camera?.position || !target?.isVector3) return;

        debug.cameraIcon.position.copy(camera.position);
        this._flyoverDebugTmpDir.copy(target).sub(camera.position);
        if (this._flyoverDebugTmpDir.lengthSq() <= EPS) return;
        this._flyoverDebugTmpDir.normalize();
        debug.cameraIcon.quaternion.setFromUnitVectors(FLYOVER_DEBUG_ICON_FORWARD, this._flyoverDebugTmpDir);
    }

    _enableFlyoverDebug({ path } = {}) {
        const scene = this.scene;
        if (!scene) return;
        this._disableFlyoverDebug();

        const debugCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 12000);
        debugCamera.layers.enable(0);
        debugCamera.layers.enable(FLYOVER_DEBUG_HELPER_LAYER);

        const pathLine = this._createFlyoverDebugPathLine(path);
        const cameraIcon = this._createFlyoverDebugCameraIcon();
        const keyframesGroup = this._createFlyoverDebugKeyframes(path);
        const axisHelper = this._createFlyoverDebugAxisHelper();

        if (pathLine) scene.add(pathLine);
        if (cameraIcon) scene.add(cameraIcon);
        if (keyframesGroup) scene.add(keyframesGroup);
        if (axisHelper) scene.add(axisHelper);

        this._flyoverDebug.camera = debugCamera;
        this._flyoverDebug.pathLine = pathLine;
        this._flyoverDebug.cameraIcon = cameraIcon;
        this._flyoverDebug.keyframesGroup = keyframesGroup;
        this._flyoverDebug.axisHelper = axisHelper;
        this._flyoverDebug.active = true;
        this._createFlyoverDebugCameraController(debugCamera);
        this.camera?.layers?.disable?.(FLYOVER_DEBUG_HELPER_LAYER);
        this._positionFlyoverDebugCamera();
        this._updateFlyoverDebugOverlay();
        this._ensureFlyoverDebugControls();
    }

    _toggleFlyover() {
        if (this._flyover?.active) {
            this._stopFlyover({ keepPose: true });
        } else {
            this._disableFlyoverDebug();
            this._startFlyover();
        }
    }

    _startFlyover({ path: externalPath } = {}) {
        const controls = this.controls;
        const ui = this._ui;
        if (!controls?.setLookAt || !this.camera) return;

        this._biomeTilingSunOrbitAnim = null;
        this._clearKeys();
        controls.enabled = false;

        const path = (externalPath && typeof externalPath === 'object')
            ? externalPath
            : this._buildFlyoverPath({
                startPosition: this.camera.position.clone(),
                startTarget: controls.target?.clone?.() ?? new THREE.Vector3(0, 0, 0)
            });
        if (!path) {
            controls.enabled = true;
            return;
        }

        this._resetBiomeTilingLodMonitor();
        const flyover = this._flyover;
        flyover.active = true;
        flyover.startMs = performance.now();
        flyover.pauseStartMs = 0;
        flyover.paused = false;
        flyover.timeSec = 0;
        flyover.durationSec = path.durationSec;
        flyover.sampleRate = path.sampleRate;
        flyover.sampleCount = path.sampleCount;
        flyover.poses = path.poses;
        flyover.lastUiUpdateMs = 0;

        this._applyFlyoverPose(0);
        this._updateFlyoverDebugOverlay();
        this._syncFlyoverDebugControls();
        ui?.setFlyoverActive?.(true);
        this._syncCameraStatus({ nowMs: flyover.startMs, force: true });
    }

    _stopFlyover({ keepPose = true } = {}) {
        const flyover = this._flyover;
        if (!flyover?.active) return;

        flyover.active = false;
        flyover.poses = null;
        flyover.sampleCount = 0;
        flyover.pauseStartMs = 0;
        flyover.paused = false;
        flyover.timeSec = 0;
        this._disableFlyoverDebug();
        this._syncFlyoverDebugControls();

        this._clearKeys();
        if (this.controls) this.controls.enabled = true;
        if (!keepPose) this._applyCameraPreset('high_far');
        else this._activeCameraPresetId = 'custom';

        this._ui?.setFlyoverActive?.(false);
        this._syncCameraStatus({ nowMs: performance.now(), force: true });
    }

    _updateFlyover(nowMs) {
        const flyover = this._flyover;
        if (!flyover?.active || !flyover.poses || !(flyover.sampleCount > 1)) return;
        if (flyover.paused) {
            this._applyFlyoverPose(flyover.timeSec);
            this._updateFlyoverDebugOverlay();
            this._syncCameraStatus({ nowMs, force: false });
            return;
        }

        const durationSec = Math.max(0.001, Number(flyover.durationSec) || 20);
        const elapsedSec = Math.max(0, (Number(nowMs) - Number(flyover.startMs)) / 1000);

        if (!flyover.loop && elapsedSec >= durationSec) {
            this._applyFlyoverPose(durationSec);
            this._stopFlyover({ keepPose: true });
            return;
        }

        const tSec = flyover.loop ? (elapsedSec % durationSec) : Math.min(durationSec, elapsedSec);
        flyover.timeSec = tSec;

        this._applyFlyoverPose(tSec);
        this._updateFlyoverDebugOverlay();
        this._syncCameraStatus({ nowMs, force: false });
    }

    _applyFlyoverPose(tSec) {
        const controls = this.controls;
        const flyover = this._flyover;
        const poses = flyover?.poses ?? null;
        const sampleRate = Number(flyover?.sampleRate) || 30;
        const sampleCount = flyover?.sampleCount ?? 0;
        if (!controls?.setLookAt || !poses || !(sampleCount > 1)) return;

        const s = clamp(Number(tSec) * sampleRate, 0, sampleCount - 1, 0);
        const idx0 = Math.floor(s);
        const frac = s - idx0;
        const idx1 = Math.min(sampleCount - 1, idx0 + 1);

        const base0 = idx0 * 6;
        const base1 = idx1 * 6;
        this._flyoverTmpPos.set(poses[base0], poses[base0 + 1], poses[base0 + 2]);
        this._flyoverTmpTarget.set(poses[base0 + 3], poses[base0 + 4], poses[base0 + 5]);
        this._flyoverTmpPos2.set(poses[base1], poses[base1 + 1], poses[base1 + 2]);
        this._flyoverTmpTarget2.set(poses[base1 + 3], poses[base1 + 4], poses[base1 + 5]);

        this._flyoverTmpPos.lerp(this._flyoverTmpPos2, frac);
        this._flyoverTmpTarget.lerp(this._flyoverTmpTarget2, frac);

        controls.setLookAt({ position: this._flyoverTmpPos, target: this._flyoverTmpTarget });
    }

    _syncCameraStatus({ nowMs, force = false } = {}) {
        const ui = this._ui;
        const flyover = this._flyover;
        if (!ui?.setCameraStatus) return;

        const t = Number(nowMs) || performance.now();
        if (!force && flyover?.active && t - (flyover.lastUiUpdateMs || 0) < 100) return;
        if (flyover) flyover.lastUiUpdateMs = t;

        ui.setCameraStatus({
            activePresetId: this._activeCameraPresetId,
            flyoverActive: !!flyover?.active,
            flyoverTimeSec: Number(flyover?.timeSec) || 0,
            flyoverDurationSec: Number(flyover?.durationSec) || 20
        });
    }

    _syncOutputPanel({ nowMs } = {}) {
        const ui = this._ui;
        const camera = this.camera;
        if (!ui?.setOutputInfo || !camera) return;

        const now = Number(nowMs);
        const t = Number.isFinite(now) ? now : performance.now();
        if (t - (this._outputPanelLastMs || 0) < OUTPUT_PANEL_REFRESH_MS) return;
        this._outputPanelLastMs = t;

        const sample = this._cursorSample;
        const payload = {
            cameraX: camera.position.x,
            cameraY: camera.position.y,
            cameraZ: camera.position.z,
            pointerX: sample?.hasHit ? sample?.x : null,
            pointerY: sample?.hasHit ? sample?.y : null,
            pointerZ: sample?.hasHit ? sample?.z : null,
            pointerDistance: sample?.hasHit ? sample?.distance : null
        };
        ui.setOutputInfo(payload);
        this._syncBiomeTilingHref({ force: false });
    }

    _getTerrainRaycastSurface() {
        const overlay = this._biomeTilingDisplacementOverlay;
        if (
            this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING
            && this._biomeTilingState?.geometryDensity?.enabled !== false
            && overlay?.isMesh
            && overlay.visible === true
        ) {
            return overlay;
        }
        return this._terrain;
    }

    _getTerrainHeightAtXZ(x, z) {
        const terrain = this._getTerrainRaycastSurface();
        if (!terrain) return 0;

        if (terrain.matrixWorldNeedsUpdate) terrain.updateMatrixWorld(true);
        const originY = (Number.isFinite(this._terrainBounds?.maxY) ? this._terrainBounds.maxY : 0) + 1000;
        this._terrainRayOrigin.set(Number(x) || 0, originY, Number(z) || 0);
        this._terrainRaycaster.set(this._terrainRayOrigin, this._terrainRayDir);
        this._terrainRayHits.length = 0;
        this._terrainRaycaster.intersectObject(terrain, false, this._terrainRayHits);
        const hit = this._terrainRayHits[0] ?? null;
        return Number.isFinite(hit?.point?.y) ? hit.point.y : 0;
    }

    _getBusAnchor() {
        const spec = this._buildTerrainSpec();
        const road = spec?.road && typeof spec.road === 'object' ? spec.road : null;
        const dirRaw = Number(road?.direction);
        const forwardZ = Number.isFinite(dirRaw) && dirRaw < 0 ? -1 : 1;
        const z0 = Number(road?.z0);
        const z1 = Number(road?.z1);
        const fallbackZ = -60;
        const zEnd = Number(road?.zEnd);
        const roadBeginZ = Number.isFinite(zEnd)
            ? zEnd
            : (Number.isFinite(z0) && Number.isFinite(z1))
                ? (forwardZ < 0 ? Math.max(z0, z1) : Math.min(z0, z1))
                : fallbackZ;
        const insetMeters = Math.max(0, Number(spec?.tileSize) || 24) * 0.25;
        let busZ = roadBeginZ + forwardZ * insetMeters;
        if (Number.isFinite(z0) && Number.isFinite(z1)) {
            busZ = clamp(busZ, Math.min(z0, z1), Math.max(z0, z1), busZ);
        }
        const busX = 0;
        const baseY = Number.isFinite(road?.baseY) ? Number(road.baseY) : this._getTerrainHeightAtXZ(busX, busZ);
        return {
            position: new THREE.Vector3(busX, baseY, busZ),
            forward: new THREE.Vector3(0, 0, forwardZ)
        };
    }

    _getCameraPoseForPreset(id) {
        const preset = String(id ?? '');
        if (preset === 'high') {
            return {
                position: new THREE.Vector3(220, 240, 220),
                target: new THREE.Vector3(0, 0, -140)
            };
        }

        if (preset === 'high_far') {
            return {
                position: new THREE.Vector3(360, 320, 420),
                target: new THREE.Vector3(0, 0, -140)
            };
        }

        if (preset === 'behind_gameplay') {
            const { position: busPos, forward } = this._getBusAnchor();
            const distance = CAMERA_PRESET_BEHIND_GAMEPLAY_DISTANCE;
            const height = 4.5;
            const lookY = 1.6;
            const position = busPos.clone().addScaledVector(forward, -distance);
            position.y += height;
            const target = busPos.clone();
            target.y += lookY;
            return { position, target };
        }

        if (preset === 'behind_low_horizon') {
            const { position: busPos, forward } = this._getBusAnchor();
            const distance = 18;
            const heightAboveGround = 1.8;
            const sampleDist = 8;
            const horizonDist = 420;

            const position = busPos.clone().addScaledVector(forward, -distance);
            const groundY = this._getTerrainHeightAtXZ(position.x, position.z);
            position.y = groundY + heightAboveGround;

            const aheadY = this._getTerrainHeightAtXZ(position.x + forward.x * sampleDist, position.z + forward.z * sampleDist);
            const slope = (aheadY - groundY) / Math.max(EPS, sampleDist);
            const dir = new THREE.Vector3(forward.x, slope, forward.z);
            if (dir.lengthSq() > EPS) dir.normalize();
            else dir.set(forward.x, 0, forward.z);
            if (dir.lengthSq() > EPS) dir.normalize();
            else dir.set(0, 0, -1);

            const target = position.clone().addScaledVector(dir, horizonDist);
            return { position, target };
        }

        if (preset === 'low' || !preset) {
            return {
                position: new THREE.Vector3(120, 18, 140),
                target: new THREE.Vector3(0, 0, -140)
            };
        }

        return null;
    }

    _getBiomeTilingFocusPoses() {
        const grid = this._terrainGrid;
        if (!grid) return null;

        const tileSize = Number(grid.tileSize) || 24;
        const widthTiles = Math.max(1, Number(grid.widthTiles) || 1);
        const depthTiles = Math.max(1, Number(grid.depthTiles) || 1);
        const minX = Number(grid.minX) || 0;
        const minZ = Number(grid.minZ) || 0;
        const sizeX = widthTiles * tileSize;
        const sizeZ = depthTiles * tileSize;
        const centerX = minX + sizeX * 0.5;
        const maxX = minX + sizeX;
        const maxZ = minZ + sizeZ;
        const gridMinY = Number(grid.minY);
        const gridMaxY = Number(grid.maxY);
        const fallbackY = Number(this._terrainBounds?.minY);
        const flatY = Number.isFinite(gridMinY) && Number.isFinite(gridMaxY)
            ? (gridMinY + gridMaxY) * 0.5
            : (Number.isFinite(fallbackY) ? fallbackY : 0);
        const eyePosZ = (minZ + sizeZ * 0.16) + BIOME_TILING_FOCUS_EYE_Z_OFFSET_METERS;
        const eyeTgtZ = minZ + sizeZ * 0.82;
        const overviewPosZ = minZ + sizeZ * 0.10;
        const sharedTargetY = flatY + 1.8;
        const overviewPosY = flatY + 80;
        const overviewDeltaY = sharedTargetY - overviewPosY;
        const overviewBaseDz = Math.max(EPS, eyeTgtZ - overviewPosZ);
        const overviewBasePitch = Math.atan2(overviewDeltaY, overviewBaseDz);
        const overviewPitchOffset = THREE.MathUtils.degToRad(BIOME_TILING_OVERVIEW_ANGLE_OFFSET_DEG);
        const overviewTargetPitch = clamp(
            overviewBasePitch - overviewPitchOffset,
            -Math.PI * 0.49,
            -0.01,
            overviewBasePitch - overviewPitchOffset
        );
        const overviewDzRaw = overviewDeltaY / Math.tan(overviewTargetPitch);
        const overviewDz = Math.max(EPS, Number.isFinite(overviewDzRaw) ? overviewDzRaw : overviewBaseDz);
        const overviewTargetZ = clamp(
            overviewPosZ + overviewDz,
            minZ + 1.0,
            maxZ - 1.0,
            overviewPosZ + overviewDz
        );

        const overview = {
            position: new THREE.Vector3(
                centerX,
                overviewPosY,
                overviewPosZ
            ),
            target: new THREE.Vector3(centerX, sharedTargetY, overviewTargetZ)
        };
        const eye = {
            position: new THREE.Vector3(centerX, flatY + 1.8, eyePosZ),
            target: new THREE.Vector3(centerX, sharedTargetY, eyeTgtZ)
        };

        return {
            overview,
            eye,
            bounds: { minX, maxX, minZ, maxZ, sizeX, sizeZ }
        };
    }

    _getBiomeTilingFocusPose(mode = 'overview') {
        const modeId = String(mode ?? '').trim().toLowerCase();
        const isBusHigh = modeId === 'bus_high' || modeId === 'bus' || modeId === 'behind_gameplay';
        const isEye = modeId === 'eye_1p8' || modeId === 'eye' || modeId === 'low';
        if (isBusHigh) {
            const { position: busPos, forward } = this._getBusAnchor();
            const position = busPos.clone().addScaledVector(forward, -BIOME_TILING_FOCUS_BUS_HIGH_DISTANCE_METERS);
            position.y += 4.5;
            const target = busPos.clone();
            target.y += 1.6;
            return { position, target };
        }
        const focus = this._getBiomeTilingFocusPoses();
        if (!focus) return null;
        return isEye ? focus.eye : focus.overview;
    }

    _isNearlyEqualVector3(a, b, epsilon = BIOME_TILING_FOCUS_POSE_MATCH_EPSILON_METERS) {
        if (!a?.isVector3 || !b?.isVector3) return false;
        const eps = Math.max(1e-6, Number(epsilon) || BIOME_TILING_FOCUS_POSE_MATCH_EPSILON_METERS);
        return a.distanceToSquared(b) <= (eps * eps);
    }

    _getActiveBiomeTilingFocusButtonId() {
        if (this._terrainViewMode !== TERRAIN_VIEW_MODE.BIOME_TILING) return '';
        const cameraPos = this.camera?.position;
        const target = this.controls?.target;
        if (!cameraPos?.isVector3 || !target?.isVector3) return '';
        if (this._flyover?.active) return '';
        for (const presetId of ['overview', 'bus_high', 'eye_1p8']) {
            const pose = this._getBiomeTilingFocusPose(presetId);
            if (!pose?.position?.isVector3 || !pose?.target?.isVector3) continue;
            if (
                this._isNearlyEqualVector3(cameraPos, pose.position)
                && this._isNearlyEqualVector3(target, pose.target)
            ) {
                return presetId;
            }
        }
        return '';
    }

    _syncBiomeTilingFocusUiState({ force = false } = {}) {
        const ui = this._ui;
        if (!ui?.setBiomeTilingFocusButtons) return;
        const activePresetId = this._getActiveBiomeTilingFocusButtonId();
        if (!force && activePresetId === this._biomeTilingFocusActiveButtonId) return;
        this._biomeTilingFocusActiveButtonId = activePresetId;
        ui.setBiomeTilingFocusButtons({ activePresetId });
    }

    _buildBezierCurve3({
        from,
        to,
        fromDir,
        toDir,
        tangentScale = 0.33,
        tangentMaxMeters = Number.POSITIVE_INFINITY,
        lift = 0,
        lateral = 0
    } = {}) {
        const start = from?.isVector3 ? from.clone() : new THREE.Vector3();
        const end = to?.isVector3 ? to.clone() : new THREE.Vector3();
        const delta = end.clone().sub(start);
        const dist = Math.max(EPS, delta.length());
        const deltaDir = delta.clone();
        if (deltaDir.lengthSq() > EPS) deltaDir.normalize();
        else deltaDir.set(0, 0, 1);

        const dir0 = fromDir?.isVector3 ? fromDir.clone() : deltaDir.clone();
        if (dir0.lengthSq() > EPS) dir0.normalize();
        else dir0.copy(deltaDir);
        if (dir0.dot(deltaDir) < 0) dir0.negate();

        const dir1 = toDir?.isVector3 ? toDir.clone() : deltaDir.clone();
        if (dir1.lengthSq() > EPS) dir1.normalize();
        else dir1.copy(deltaDir);
        if (dir1.dot(deltaDir) < 0) dir1.negate();

        const lateralDir = new THREE.Vector3(-delta.z, 0, delta.x);
        if (lateralDir.lengthSq() > EPS) lateralDir.normalize();
        else lateralDir.set(0, 0, 0);

        const tangentRaw = dist * clamp(tangentScale, 0.05, 0.9, 0.33);
        const tangentLimit = Number(tangentMaxMeters);
        const tangent = Number.isFinite(tangentLimit)
            ? Math.min(tangentRaw, Math.max(0.01, tangentLimit))
            : tangentRaw;
        const c1 = start.clone().addScaledVector(dir0, tangent);
        const c2 = end.clone().addScaledVector(dir1, -tangent);
        const liftAmount = Number(lift);
        if (Number.isFinite(liftAmount) && Math.abs(liftAmount) > EPS) {
            c1.y += liftAmount;
            c2.y += liftAmount;
        }
        const lateralAmount = Number(lateral);
        if (Number.isFinite(lateralAmount) && Math.abs(lateralAmount) > EPS) {
            c1.addScaledVector(lateralDir, lateralAmount);
            c2.addScaledVector(lateralDir, lateralAmount);
        }

        return new THREE.CubicBezierCurve3(start, c1, c2, end);
    }

    _buildBiomeTilingFlyoverPath({ startPosition, startTarget } = {}) {
        const focus = this._getBiomeTilingFocusPoses();
        if (!focus) return null;

        const startPos = startPosition?.isVector3 ? startPosition.clone() : null;
        const startTgt = startTarget?.isVector3 ? startTarget.clone() : null;
        const overviewPos = focus.overview.position.clone();
        const overviewTarget = focus.overview.target.clone();
        const eyePos = focus.eye.position.clone();
        eyePos.z = clamp(
            eyePos.z + 32.0,
            Number(focus.bounds?.minZ) + 1.0,
            Number(focus.bounds?.maxZ) - 1.0,
            eyePos.z + 32.0
        );

        const walkMeters = 190;
        const flatY = eyePos.y - 1.8;
        const lowerFlyoverY = (y) => flatY + (Number(y) - flatY) * 0.9;
        eyePos.y = lowerFlyoverY(eyePos.y);
        overviewPos.y = flatY + 30.0;

        const maxTargetZ = Number(focus.bounds?.maxZ) - 1.0;
        const plusZTargetDistance = Math.max(18.0, Number(focus.bounds?.sizeZ) * 0.55 || 0);
        const makePlusZTarget = (position) => new THREE.Vector3(
            position.x,
            position.y,
            clamp(
                position.z + plusZTargetDistance,
                Number(focus.bounds?.minZ) + 1.0,
                maxTargetZ,
                position.z + plusZTargetDistance
            )
        );

        const eyeTarget = makePlusZTarget(eyePos);

        const walkDir = eyeTarget.clone().sub(eyePos);
        walkDir.y = 0;
        if (walkDir.lengthSq() > EPS) walkDir.normalize();
        else walkDir.set(0, 0, 1);

        const eyeDir = eyeTarget.clone().sub(eyePos);
        if (eyeDir.lengthSq() > EPS) eyeDir.normalize();
        else eyeDir.copy(walkDir);
        const overviewDir = overviewTarget.clone().sub(overviewPos);
        if (overviewDir.lengthSq() > EPS) overviewDir.normalize();
        else overviewDir.copy(eyeDir);
        const overviewLookDir = overviewTarget.clone().sub(overviewPos);
        if (overviewLookDir.lengthSq() > EPS) overviewLookDir.normalize();
        else overviewLookDir.copy(overviewDir);
        const divePos = overviewPos.clone().lerp(eyePos, 0.22);
        {
            const keyframeHeightMin = Math.min(overviewPos.y, eyePos.y);
            const keyframeHeightMax = Math.max(overviewPos.y, eyePos.y);
            const keyframeHeightSpan = Math.max(0.01, keyframeHeightMax - keyframeHeightMin);
            const diveMinY = keyframeHeightMin + keyframeHeightSpan * 0.28;
            const diveMaxY = keyframeHeightMax - keyframeHeightSpan * 0.24;
            if (diveMaxY > diveMinY + EPS) {
                divePos.y = clamp(divePos.y, diveMinY, diveMaxY, (diveMinY + diveMaxY) * 0.5);
            } else {
                divePos.y = keyframeHeightMin + (keyframeHeightSpan * 0.5);
            }
        }
        const overviewToDiveDir = divePos.clone().sub(overviewPos);
        if (overviewToDiveDir.lengthSq() > EPS) overviewToDiveDir.normalize();
        else overviewToDiveDir.copy(overviewDir);
        const overviewToDiveOutDir = overviewToDiveDir.clone();
        {
            const horizontalLen = Math.hypot(overviewToDiveOutDir.x, overviewToDiveOutDir.z);
            const ySign = overviewToDiveOutDir.y < 0 ? -1 : 1;
            if (horizontalLen > EPS) {
                const invHorizontal = 1 / horizontalLen;
                overviewToDiveOutDir.x *= invHorizontal;
                overviewToDiveOutDir.z *= invHorizontal;
                overviewToDiveOutDir.y = ySign;
                overviewToDiveOutDir.normalize();
            } else {
                overviewToDiveOutDir.copy(overviewToDiveDir);
            }
        }
        const keyframe2PosTangentDir = new THREE.Vector3(0, -1, 1).normalize();

        const diveLookDownMeters = Math.max(6.0, Number(focus.bounds?.sizeZ) * 0.03 || 0);
        const diveLookForwardMeters = diveLookDownMeters;
        const diveTarget = new THREE.Vector3(
            divePos.x,
            divePos.y - diveLookDownMeters,
            divePos.z + diveLookForwardMeters
        );

        const diveLookDir = diveTarget.clone().sub(divePos);
        if (diveLookDir.lengthSq() > EPS) diveLookDir.normalize();
        else diveLookDir.copy(eyeDir);
        const diveBlendLookDir = overviewLookDir.clone().lerp(diveLookDir, 0.72);
        if (diveBlendLookDir.lengthSq() > EPS) diveBlendLookDir.normalize();
        else diveBlendLookDir.copy(diveLookDir);
        const lookDistance = Math.max(24.0, Number(focus.bounds?.sizeZ) * 0.16 || 0);

        const walkEndPos = eyePos.clone().addScaledVector(walkDir, walkMeters);
        const walkEndTarget = eyeTarget.clone().addScaledVector(walkDir, walkMeters);

        const liftReturn = Math.max(3, Number(focus.bounds?.sizeZ) * 0.010 || 0);

        const startToOverviewDistance = startPos ? startPos.distanceTo(overviewPos) : 0;
        const includeStartSegment = false;

        const baseFlyoverScale = 1 / 0.6;
        const flyoverDurationScale = baseFlyoverScale * 1.5;
        const returnDurationScale = baseFlyoverScale;
        const startToOverviewSec = includeStartSegment
            ? clamp(startToOverviewDistance / 120.0, 1.6, 4.0, 2.2) * flyoverDurationScale
            : 0.0;
        const overviewToDiveSec = 2.5 * flyoverDurationScale;
        const diveToEyeSec = 1.9 * flyoverDurationScale;
        const walkSec = Math.max(12.0, walkMeters / 55.0) * flyoverDurationScale;
        const returnSec = (8.0 / 1.35) * returnDurationScale;
        const diveToEyePositionCurve = this._buildBezierCurve3({
            from: divePos,
            to: eyePos,
            fromDir: keyframe2PosTangentDir,
            toDir: walkDir,
            tangentScale: 0.28,
            tangentMaxMeters: 40.0
        });
        if (diveToEyePositionCurve?.v2?.isVector3 && diveToEyePositionCurve?.v3?.isVector3) {
            const keyframe3Incoming = diveToEyePositionCurve.v2.clone().sub(diveToEyePositionCurve.v3);
            if (keyframe3Incoming.lengthSq() > EPS) {
                diveToEyePositionCurve.v2.copy(diveToEyePositionCurve.v3).addScaledVector(keyframe3Incoming, 2.0);
            }
        }

        const segments = [];
        if (includeStartSegment) {
            const startLookDir = startTgt.clone().sub(startPos);
            if (startLookDir.lengthSq() > EPS) startLookDir.normalize();
            else startLookDir.copy(overviewDir);

            segments.push({
                durationSec: startToOverviewSec,
                positionCurve: this._buildBezierCurve3({
                    from: startPos,
                    to: overviewPos,
                    fromDir: startLookDir,
                    toDir: overviewDir,
                    tangentScale: 0.26
                }),
                targetCurve: this._buildBezierCurve3({
                    from: startTgt,
                    to: overviewTarget,
                    fromDir: startLookDir,
                    toDir: overviewDir,
                    tangentScale: 0.26
                })
            });
        }

        segments.push(
            {
                durationSec: overviewToDiveSec,
                positionCurve: this._buildBezierCurve3({
                    from: overviewPos,
                    to: divePos,
                    fromDir: overviewToDiveOutDir,
                    toDir: keyframe2PosTangentDir,
                    tangentScale: 0.22,
                    tangentMaxMeters: 28.0
                }),
                targetCurve: this._buildBezierCurve3({
                    from: overviewTarget,
                    to: diveTarget,
                    fromDir: diveBlendLookDir,
                    toDir: diveLookDir,
                    tangentScale: 0.16,
                    tangentMaxMeters: 18.0,
                    lift: -Math.max(1.2, Number(focus.bounds?.sizeZ) * 0.003)
                }),
                lookDirFrom: overviewLookDir.clone(),
                lookDirTo: diveLookDir.clone(),
                lookBlendMode: 'linear',
                lookDistance
            },
            {
                durationSec: diveToEyeSec,
                positionCurve: diveToEyePositionCurve,
                targetCurve: this._buildBezierCurve3({
                    from: diveTarget,
                    to: eyeTarget,
                    fromDir: diveLookDir,
                    toDir: eyeDir,
                    tangentScale: 0.18,
                    tangentMaxMeters: 16.0
                }),
                lookDirFrom: diveLookDir.clone(),
                lookDirTo: eyeDir.clone(),
                lookBlendMode: 'linear',
                lookDistance
            },
            {
                durationSec: walkSec,
                positionCurve: this._buildBezierCurve3({
                    from: eyePos,
                    to: walkEndPos,
                    fromDir: walkDir,
                    toDir: walkDir,
                    tangentScale: 0.34
                }),
                targetCurve: this._buildBezierCurve3({
                    from: eyeTarget,
                    to: walkEndTarget,
                    fromDir: walkDir,
                    toDir: walkDir,
                    tangentScale: 0.34
                }),
                easeMode: 'out'
            },
            {
                durationSec: returnSec,
                positionCurve: this._buildBezierCurve3({
                    from: walkEndPos,
                    to: overviewPos,
                    fromDir: walkDir.clone().multiplyScalar(-1),
                    toDir: eyeDir.clone().multiplyScalar(-1),
                    tangentScale: 0.28,
                    lift: liftReturn
                }),
                targetCurve: this._buildBezierCurve3({
                    from: walkEndTarget,
                    to: overviewTarget,
                    fromDir: walkDir.clone().multiplyScalar(-1),
                    toDir: eyeDir.clone().multiplyScalar(-1),
                    tangentScale: 0.28,
                    lift: liftReturn * 0.3
                }),
                easeMode: 'in_strong'
            }
        );

        const tmpLookPosStart = new THREE.Vector3();
        const tmpLookPosEnd = new THREE.Vector3();
        const tmpLookTargetStart = new THREE.Vector3();
        const tmpLookTargetEnd = new THREE.Vector3();
        const defaultLookDir = eyeDir.lengthSq() > EPS ? eyeDir.clone() : new THREE.Vector3(0, 0, 1);
        let previousLookDir = defaultLookDir.clone();
        for (let s = 0; s < segments.length; s++) {
            const segment = segments[s];
            const positionCurve = segment?.positionCurve ?? null;
            const targetCurve = segment?.targetCurve ?? null;
            positionCurve.getPointAt(0, tmpLookPosStart);
            positionCurve.getPointAt(1, tmpLookPosEnd);
            targetCurve.getPointAt(0, tmpLookTargetStart);
            targetCurve.getPointAt(1, tmpLookTargetEnd);

            const fromDir = segment.lookDirFrom?.isVector3
                ? segment.lookDirFrom.clone()
                : tmpLookTargetStart.clone().sub(tmpLookPosStart);
            if (fromDir.lengthSq() > EPS) fromDir.normalize();
            else fromDir.copy(previousLookDir);

            const toDir = segment.lookDirTo?.isVector3
                ? segment.lookDirTo.clone()
                : tmpLookTargetEnd.clone().sub(tmpLookPosEnd);
            if (toDir.lengthSq() > EPS) toDir.normalize();
            else toDir.copy(fromDir);

            const fromDistRaw = segment.lookDirFrom?.isVector3
                ? Math.max(EPS, tmpLookTargetStart.distanceTo(tmpLookPosStart))
                : tmpLookTargetStart.distanceTo(tmpLookPosStart);
            const toDistRaw = segment.lookDirTo?.isVector3
                ? Math.max(EPS, tmpLookTargetEnd.distanceTo(tmpLookPosEnd))
                : tmpLookTargetEnd.distanceTo(tmpLookPosEnd);
            const defaultLookDistance = Math.max(6.0, Number(segment.lookDistance) || 12.0);
            const fromDist = fromDistRaw > EPS ? fromDistRaw : defaultLookDistance;
            const toDist = toDistRaw > EPS ? toDistRaw : defaultLookDistance;

            segment.rotLookFrom = fromDir;
            segment.rotLookTo = toDir;
            segment.rotLookDistanceFrom = fromDist;
            segment.rotLookDistanceTo = toDist;
            previousLookDir = toDir.clone();
        }

        const segmentTimeStarts = new Float64Array(segments.length);
        const segmentTimeDurations = new Float64Array(segments.length);
        let durationSec = 0;
        for (let s = 0; s < segments.length; s++) {
            segmentTimeStarts[s] = durationSec;
            const segDuration = Math.max(EPS, Number(segments[s]?.durationSec) || 0);
            segmentTimeDurations[s] = segDuration;
            durationSec += segDuration;
        }
        const sampleRate = FLYOVER_SAMPLE_RATE;
        const sampleCount = Math.max(2, Math.round(durationSec * sampleRate) + 1);
        const poses = new Float32Array(sampleCount * 6);
        const pos = new THREE.Vector3();
        const target = new THREE.Vector3();
        const lookDir = new THREE.Vector3();
        const keyframes = [];
        if (includeStartSegment && startPos && startTgt) {
            keyframes.push({ role: 'start', position: startPos.clone(), target: startTgt.clone() });
        }
        keyframes.push(
            { role: 'overview', position: overviewPos.clone(), target: overviewTarget.clone() },
            { role: 'dive', position: divePos.clone(), target: diveTarget.clone() },
            { role: 'eye', position: eyePos.clone(), target: eyeTarget.clone() },
            { role: 'walk_end', position: walkEndPos.clone(), target: walkEndTarget.clone() },
            { role: 'overview_return', position: overviewPos.clone(), target: overviewTarget.clone() }
        );

        for (let i = 0; i < sampleCount; i++) {
            const tSec = i / sampleRate;
            let segmentIndex = 0;
            for (let s = 0; s < segments.length; s++) {
                segmentIndex = s;
                const segStart = segmentTimeStarts[s];
                const segEnd = segStart + segmentTimeDurations[s];
                if (tSec <= segEnd + EPS || s === segments.length - 1) break;
            }
            if (i === sampleCount - 1) segmentIndex = segments.length - 1;
            const segment = segments[segmentIndex];

            const segStart = segmentTimeStarts[segmentIndex];
            const segDuration = segmentTimeDurations[segmentIndex];
            const uRaw = segDuration > EPS ? clamp((tSec - segStart) / segDuration, 0, 1, 0) : 0;
            let u = uRaw;
            const easeMode = String(segment?.easeMode ?? '');
            if (easeMode === 'in') u = uRaw * uRaw;
            else if (easeMode === 'in_strong') u = uRaw * uRaw * uRaw;
            else if (easeMode === 'out') {
                const inv = 1.0 - uRaw;
                u = 1.0 - inv * inv;
            } else if (easeMode === 'smooth' || easeMode === 'in_out') u = smoothstep01(uRaw);
            if (i === sampleCount - 1) u = 1;

            segment.positionCurve.getPointAt(u, pos);
            let rotU = smoothstep01(uRaw);
            if (i === sampleCount - 1) rotU = 1;
            const rotFrom = segment.rotLookFrom?.isVector3 ? segment.rotLookFrom : null;
            const rotTo = segment.rotLookTo?.isVector3 ? segment.rotLookTo : null;
            if (rotFrom && rotTo) {
                slerpUnitVector3(lookDir, rotFrom, rotTo, rotU);
                const distFrom = Math.max(6.0, Number(segment.rotLookDistanceFrom) || 6.0);
                const distTo = Math.max(6.0, Number(segment.rotLookDistanceTo) || 6.0);
                const distMeters = THREE.MathUtils.lerp(distFrom, distTo, rotU);
                target.copy(pos).addScaledVector(lookDir, distMeters);
            } else {
                segment.targetCurve.getPointAt(u, target);
            }

            const idx = i * 6;
            poses[idx] = pos.x;
            poses[idx + 1] = pos.y;
            poses[idx + 2] = pos.z;
            poses[idx + 3] = target.x;
            poses[idx + 4] = target.y;
            poses[idx + 5] = target.z;
        }

        const positionSegments = segments.map((segment) => {
            const curve = segment?.positionCurve ?? null;
            const c0 = curve?.v0?.isVector3 ? curve.v0.clone() : null;
            const c1 = curve?.v1?.isVector3 ? curve.v1.clone() : null;
            const c2 = curve?.v2?.isVector3 ? curve.v2.clone() : null;
            const c3 = curve?.v3?.isVector3 ? curve.v3.clone() : null;
            return { from: c0, c1, c2, to: c3 };
        });

        return { durationSec, sampleRate, sampleCount, poses, keyframes, positionSegments };
    }

    _startBiomeTilingFlyover() {
        const controls = this.controls;
        const camera = this.camera;
        const startPosition = camera?.position?.isVector3 ? camera.position.clone() : null;
        const startTarget = controls?.target?.isVector3 ? controls.target.clone() : null;
        const path = this._buildBiomeTilingFlyoverPath({ startPosition, startTarget });
        if (!path) return;
        this._disableFlyoverDebug();
        this._biomeTilingFocusMode = 'overview';
        if (this._flyover) this._flyover.loop = false;
        this._startFlyover({ path });
        this._syncBiomeTilingHref({ force: true });
    }

    _startBiomeTilingFlyoverDebug() {
        const controls = this.controls;
        const camera = this.camera;
        const startPosition = camera?.position?.isVector3 ? camera.position.clone() : null;
        const startTarget = controls?.target?.isVector3 ? controls.target.clone() : null;
        const path = this._buildBiomeTilingFlyoverPath({ startPosition, startTarget });
        if (!path) return;
        this._enableFlyoverDebug({ path });
        this._biomeTilingFocusMode = 'overview';
        if (this._flyover) this._flyover.loop = false;
        this._startFlyover({ path });
        this._syncBiomeTilingHref({ force: true });
    }

    _buildFlyoverPath({ startPosition, startTarget } = {}) {
        const terrain = this._terrain;
        if (!terrain) return null;
        terrain.updateMatrixWorld?.(true);

        const keyframeSec = 5;
        const busSec = keyframeSec;
        const moveSec = 9;
        const climbSec = keyframeSec;
        const returnSec = keyframeSec;
        const durationSec = busSec + moveSec + climbSec + returnSec;
        const horizonStartSec = busSec;
        const horizonEndSec = busSec + moveSec;
        const climbStartSec = horizonEndSec;
        const climbEndSec = climbStartSec + climbSec;
        const blendBusSec = 1.6;
        const blendClimbSec = 1.6;
        const blendReturnSec = 1.6;

        const startPos = startPosition?.isVector3 ? startPosition.clone() : new THREE.Vector3(140, 80, 220);
        const startTgt = startTarget?.isVector3 ? startTarget.clone() : new THREE.Vector3(0, 10, -140);

        const busGameplayPose = this._getCameraPoseForPreset('behind_gameplay');
        if (!busGameplayPose) return null;

        const bus = this._getBusAnchor();
        const forward = bus?.forward?.isVector3 ? bus.forward.clone() : new THREE.Vector3(0, 0, -1);
        forward.y = 0;
        if (forward.lengthSq() > EPS) forward.normalize();
        else forward.set(0, 0, -1);

        const spec = this._buildTerrainSpec();
        const tileSize = Number(spec?.tileSize) || 24;
        const widthTiles = Math.max(1, Math.round(Number(spec?.widthTiles) || 1));
        const depthTiles = Math.max(1, Math.round(Number(spec?.depthTiles) || 1));
        const tileMinX = Math.round(Number(spec?.tileMinX) || 0);
        const tileMinZ = Math.round(Number(spec?.tileMinZ) || 0);
        const minX = (tileMinX - 0.5) * tileSize;
        const minZ = (tileMinZ - 0.5) * tileSize;
        const maxX = minX + widthTiles * tileSize;
        const maxZ = minZ + depthTiles * tileSize;

        const roadX = clamp(0, minX + tileSize, maxX - tileSize, 0);
        const slopeSampleDist = 8;
        const horizonDist = 420;
        const lowHeightAboveGround = 1.8;

        const requestedTravelMeters = 300;
        const requestedClimbTravelMeters = 120;
        const climbHeightAboveGround = 60;
        const climbTiltLookAheadMeters = 240;
        const startMovePos = busGameplayPose.position.clone();
        const travelLimitZ = forward.z < 0 ? (minZ + tileSize) : (maxZ - tileSize);
        const maxTravelMeters = Math.max(0, Math.abs(forward.z) > EPS ? ((travelLimitZ - startMovePos.z) / forward.z) : 0);

        const travelMetersRaw = Math.min(requestedTravelMeters, Math.max(0, maxTravelMeters - requestedClimbTravelMeters));
        const climbTravelMetersRaw = Math.min(requestedClimbTravelMeters, Math.max(0, maxTravelMeters - travelMetersRaw));

        const moveEndZ = startMovePos.z + forward.z * travelMetersRaw;
        const endMoveX = clamp(roadX + forward.x * travelMetersRaw, minX + tileSize, maxX - tileSize, roadX + forward.x * travelMetersRaw);
        const travelMeters = travelMetersRaw;
        const climbTravelMeters = climbTravelMetersRaw;

        const buildHorizonPoseAt = (x, z, yFallback) => {
            const groundY = this._getTerrainHeightAtXZ(x, z);
            const lowY = groundY + lowHeightAboveGround;
            const pos = new THREE.Vector3(x, Number.isFinite(yFallback) ? yFallback : lowY, z);

            const aheadGroundY = this._getTerrainHeightAtXZ(x + forward.x * slopeSampleDist, z + forward.z * slopeSampleDist);
            const slope = (aheadGroundY - groundY) / Math.max(EPS, slopeSampleDist);
            const slopeDir = new THREE.Vector3(forward.x, slope, forward.z);
            if (slopeDir.lengthSq() > EPS) slopeDir.normalize();
            else slopeDir.set(forward.x, 0, forward.z);
            if (slopeDir.lengthSq() > EPS) slopeDir.normalize();
            else slopeDir.set(0, 0, -1);

            const target = new THREE.Vector3(x, lowY, z).addScaledVector(slopeDir, horizonDist);
            return { groundY, lowY, pos, target };
        };

        const endMove = buildHorizonPoseAt(endMoveX, moveEndZ);
        const climbEndX = clamp(endMoveX + forward.x * climbTravelMeters, minX + tileSize, maxX - tileSize, endMoveX + forward.x * climbTravelMeters);
        const climbEndZ = clamp(moveEndZ + forward.z * climbTravelMeters, minZ + tileSize, maxZ - tileSize, moveEndZ + forward.z * climbTravelMeters);
        const climbEndGroundY = this._getTerrainHeightAtXZ(climbEndX, climbEndZ);
        const climbEndPos = new THREE.Vector3(climbEndX, climbEndGroundY + climbHeightAboveGround, climbEndZ);
        const climbEndTgtZ = clamp(climbEndZ + forward.z * climbTiltLookAheadMeters, minZ + tileSize, maxZ - tileSize, climbEndZ + forward.z * climbTiltLookAheadMeters);
        const climbEndTgtX = clamp(climbEndX + forward.x * climbTiltLookAheadMeters, minX + tileSize, maxX - tileSize, climbEndX + forward.x * climbTiltLookAheadMeters);
        const climbEndTgtY = this._getTerrainHeightAtXZ(climbEndTgtX, climbEndTgtZ) + 0.6;
        const climbEndTarget = new THREE.Vector3(climbEndTgtX, climbEndTgtY, climbEndTgtZ);

        const sampleRate = FLYOVER_SAMPLE_RATE;
        const sampleCount = Math.round(durationSec * sampleRate) + 1;
        const poses = new Float32Array(sampleCount * 6);

        const tmpPos = new THREE.Vector3();
        const tmpTarget = new THREE.Vector3();
        const posA = new THREE.Vector3();
        const tgtA = new THREE.Vector3();
        const posB = new THREE.Vector3();
        const tgtB = new THREE.Vector3();
        const posD = new THREE.Vector3();
        const tgtD = new THREE.Vector3();
        const posC = new THREE.Vector3();
        const tgtC = new THREE.Vector3();

        for (let i = 0; i < sampleCount; i++) {
            const t = i / sampleRate;

            const uA = busSec > EPS ? clamp(t / busSec, 0, 1, 0) : 1;
            const wA = uA * uA;
            posA.lerpVectors(startPos, busGameplayPose.position, wA);
            tgtA.lerpVectors(startTgt, busGameplayPose.target, wA);

            const uB = moveSec > EPS ? clamp((t - horizonStartSec) / moveSec, 0, 1, 0) : 1;
            const moveW = uB; // keep speed through the segment (avoid easing-to-zero stops)
            const horizonW = smoothstep(0.0, 0.35, uB);
            const dz = forward.z * (travelMeters * moveW);
            const dx = forward.x * (travelMeters * moveW);
            const x = clamp(roadX + dx, minX + tileSize, maxX - tileSize, roadX + dx);
            const z = clamp(startMovePos.z + dz, minZ + tileSize, maxZ - tileSize, startMovePos.z + dz);

            const posY = THREE.MathUtils.lerp(busGameplayPose.position.y, endMove.lowY, horizonW);
            posB.set(x, posY, z);

            tgtB.copy(busGameplayPose.target).addScaledVector(forward, travelMeters * moveW);
            tgtB.lerp(endMove.target, horizonW);

            const uD = climbSec > EPS ? clamp((t - climbStartSec) / climbSec, 0, 1, 0) : 1;
            const climbW = uD;
            const liftW = smoothstep01(uD);
            const xD = clamp(endMove.pos.x + forward.x * (climbTravelMeters * climbW), minX + tileSize, maxX - tileSize, endMove.pos.x);
            const zD = clamp(endMove.pos.z + forward.z * (climbTravelMeters * climbW), minZ + tileSize, maxZ - tileSize, endMove.pos.z);
            const groundYD = THREE.MathUtils.lerp(moveEnd.groundY, climbEndGroundY, climbW);
            const heightD = THREE.MathUtils.lerp(lowHeightAboveGround, climbHeightAboveGround, liftW);
            posD.set(xD, groundYD + heightD, zD);

            const tiltW = smoothstep(0.15, 1.0, uD);
            tgtD.copy(moveEnd.target);
            tgtD.lerp(climbEndTarget, tiltW);

            const uC = returnSec > EPS ? clamp((t - climbEndSec) / returnSec, 0, 1, 0) : 1;
            const wC = 1 - (1 - uC) * (1 - uC);
            posC.lerpVectors(climbEndPos, startPos, wC);
            tgtC.lerpVectors(climbEndTarget, startTgt, wC);

            // Overlap segment weights so we don't fully stop at the boundaries.
            const sBus = smoothstep(busSec - blendBusSec, busSec + blendBusSec, t);
            const sClimb = smoothstep(climbStartSec - blendClimbSec, climbStartSec + blendClimbSec, t);
            const sReturn = smoothstep(climbEndSec - blendReturnSec, climbEndSec + blendReturnSec, t);
            const wa = clamp(1 - sBus, 0, 1, 0);
            const wb = clamp(sBus * (1 - sClimb), 0, 1, 0);
            const wd = clamp(sClimb * (1 - sReturn), 0, 1, 0);
            const wc = clamp(sReturn, 0, 1, 0);

            tmpPos.copy(posA).multiplyScalar(wa);
            tmpPos.addScaledVector(posB, wb);
            tmpPos.addScaledVector(posD, wd);
            tmpPos.addScaledVector(posC, wc);

            tmpTarget.copy(tgtA).multiplyScalar(wa);
            tmpTarget.addScaledVector(tgtB, wb);
            tmpTarget.addScaledVector(tgtD, wd);
            tmpTarget.addScaledVector(tgtC, wc);

            const outIdx = i * 6;
            poses[outIdx] = tmpPos.x;
            poses[outIdx + 1] = tmpPos.y;
            poses[outIdx + 2] = tmpPos.z;
            poses[outIdx + 3] = tmpTarget.x;
            poses[outIdx + 4] = tmpTarget.y;
            poses[outIdx + 5] = tmpTarget.z;
        }

        return { durationSec, sampleRate, sampleCount, poses };
    }

    _warmupGroundTextures() {
        const renderer = this.renderer;
        if (!renderer) return;

        const opts = getPbrMaterialOptionsForGround();
        for (const opt of opts) {
            const materialId = String(opt?.id ?? '');
            if (!materialId) continue;
            this._resolvePbrMaterialPayload(materialId, {
                cloneTextures: false,
                diagnosticsTag: 'TerrainDebuggerView.warmupGroundTextures'
            });
        }
    }

    _resize() {
        const renderer = this.renderer;
        const camera = this.camera;
        const canvas = this.canvas;
        if (!renderer || !camera || !canvas) return;

        const rect = canvas.getBoundingClientRect?.() ?? null;
        const w = Math.max(1, Math.floor(rect?.width ?? canvas.clientWidth ?? 1));
        const h = Math.max(1, Math.floor(rect?.height ?? canvas.clientHeight ?? 1));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix?.();
        this._positionFlyoverDebugControls();
    }

    _renderSceneWithFlyoverDebug({ renderer, scene, camera } = {}) {
        const debug = this._flyoverDebug;
        const debugCamera = debug?.camera ?? null;
        const splitActive = !!debug?.active && !!debugCamera;

        const size = renderer.getSize(this._flyoverDebugViewportSize);
        const fullW = Math.max(1, Math.floor(size.x));
        const fullH = Math.max(1, Math.floor(size.y));

        if (!splitActive) {
            const aspect = fullW / Math.max(1, fullH);
            if (Math.abs((Number(camera?.aspect) || 0) - aspect) > EPS) {
                camera.aspect = aspect;
                camera.updateProjectionMatrix?.();
            }
            camera.layers.enable(0);
            camera.layers.disable(FLYOVER_DEBUG_HELPER_LAYER);
            renderer.setScissorTest(false);
            renderer.setViewport(0, 0, fullW, fullH);
            renderer.render(scene, camera);
            return;
        }

        const outputMetrics = this._ui?.getOutputPanelViewportMetrics?.() ?? null;
        const outputInsetBottom = Math.max(0, Number(outputMetrics?.bottomInset) || 0);
        const outputHeight = Math.max(0, Number(outputMetrics?.height) || 0);

        let overlayW = Math.round(clamp(
            fullW * 0.28,
            FLYOVER_DEBUG_OVERLAY_MIN_WIDTH_PX,
            FLYOVER_DEBUG_OVERLAY_MAX_WIDTH_PX,
            320
        ));
        let overlayH = Math.round(overlayW / FLYOVER_DEBUG_OVERLAY_ASPECT);
        const overlayMaxH = Math.max(120, Math.floor(fullH * FLYOVER_DEBUG_OVERLAY_MAX_HEIGHT_FRAC));
        if (overlayH > overlayMaxH) {
            overlayH = overlayMaxH;
            overlayW = Math.round(overlayH * FLYOVER_DEBUG_OVERLAY_ASPECT);
        }
        overlayW = Math.min(overlayW, Math.max(1, fullW - FLYOVER_DEBUG_OVERLAY_MARGIN_PX * 2));
        overlayH = Math.min(overlayH, Math.max(1, fullH - FLYOVER_DEBUG_OVERLAY_MARGIN_PX * 2));

        const overlayX = FLYOVER_DEBUG_OVERLAY_MARGIN_PX;
        const desiredOverlayY = Math.round(outputInsetBottom + outputHeight + FLYOVER_DEBUG_OVERLAY_GAP_PX);
        const overlayMaxY = Math.max(FLYOVER_DEBUG_OVERLAY_MARGIN_PX, fullH - overlayH - FLYOVER_DEBUG_OVERLAY_MARGIN_PX);
        const overlayY = Math.min(overlayMaxY, Math.max(FLYOVER_DEBUG_OVERLAY_MARGIN_PX, desiredOverlayY));

        const fullAspect = fullW / Math.max(1, fullH);
        if (Math.abs((Number(debugCamera?.aspect) || 0) - fullAspect) > EPS) {
            debugCamera.aspect = fullAspect;
            debugCamera.updateProjectionMatrix?.();
        }

        const overlayAspect = overlayW / Math.max(1, overlayH);
        if (Math.abs((Number(camera?.aspect) || 0) - overlayAspect) > EPS) {
            camera.aspect = overlayAspect;
            camera.updateProjectionMatrix?.();
        }

        camera.layers.enable(0);
        camera.layers.disable(FLYOVER_DEBUG_HELPER_LAYER);
        debugCamera.layers.enable(0);
        debugCamera.layers.enable(FLYOVER_DEBUG_HELPER_LAYER);

        renderer.setScissorTest(true);
        renderer.setViewport(0, 0, fullW, fullH);
        renderer.setScissor(0, 0, fullW, fullH);
        renderer.render(scene, debugCamera);

        renderer.setViewport(overlayX, overlayY, overlayW, overlayH);
        renderer.setScissor(overlayX, overlayY, overlayW, overlayH);
        renderer.clearDepth();
        renderer.render(scene, camera);
        renderer.setScissorTest(false);
    }

    _tick(t) {
        const renderer = this.renderer;
        const scene = this.scene;
        const camera = this.camera;
        if (!renderer || !scene || !camera) return;

        const dt = Math.min((t - this._lastT) / 1000, 0.05);
        this._lastT = t;

        if (this._flyover?.active) {
            this._updateFlyover(t);
        } else {
            this._updateCameraFromKeys(dt);
        }
        this.controls?.update?.(dt);
        this._syncBiomeTilingFocusUiState({ force: false });
        this._updateBiomeTilingCalibrationRigAnimation(t);
        this._updateBiomeTilingSunOrbit(t);
        if (this._biomeTilingAxisHelper) {
            this._biomeTilingAxisHelper.visible = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING && !this._flyover?.active;
        }
        if (this._biomeTilingRingHelper) {
            this._biomeTilingRingHelper.visible = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING && !this._flyover?.active;
        }
        if (this._biomeTilingTileLodHelper) {
            this._biomeTilingTileLodHelper.visible = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING && !this._flyover?.active;
        }
        this._maybeFollowBiomeTilingDisplacementOverlay({ nowMs: t });
        this._maybeAutoRebuildBiomeTilingDisplacementOverlay({ nowMs: t });
        this._updateBiomeTilingLodMonitor({ nowMs: t });
        if (this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING) {
            if (t - (Number(this._biomeTilingDiagnosticsLastSyncMs) || 0) >= 120) {
                this._biomeTilingDiagnosticsLastSyncMs = t;
                this._syncBiomeTilingDiagnosticsUi();
            }
        }
        this._syncOutputPanel({ nowMs: t });

        if (this._terrainEngine && camera?.position) {
            this._terrainEngine.setViewOrigin({ x: camera.position.x, z: camera.position.z });
            this._updateTerrainEngineMasks({ nowMs: t });
            this._updateTerrainHoverSample({ nowMs: t });
        }

        this._grassEngine?.update?.({ camera });

        const ui = this._ui;
        if (ui && this._grassEngine && t - (this._grassStatsLastMs || 0) > 250) {
            this._grassStatsLastMs = t;
            ui.setGrassStats?.(this._grassEngine.getStats());
            ui.setGrassLodDebugInfo?.(this._grassEngine.getLodDebugInfo());
        }

        const gpuTimer = this._gpuFrameTimer;
        gpuTimer?.beginFrame?.();
        try {
            this._renderSceneWithFlyoverDebug({ renderer, scene, camera });
        } finally {
            gpuTimer?.endFrame?.();
            gpuTimer?.poll?.();
        }

        this.onFrame?.({ dt, nowMs: t, renderer });

        this._raf = requestAnimationFrame((tt) => this._tick(tt));
    }

    _buildInitialUiStateFromUrl() {
        if (typeof window === 'undefined') return null;
        const params = new URLSearchParams(window.location.search);
        const tabRaw = String(params.get(TERRAIN_DEBUGGER_URL_PARAM.tab) ?? '').trim();
        const tab = (tabRaw === 'environment'
            || tabRaw === 'terrain'
            || tabRaw === 'biome_transition'
            || tabRaw === 'biome_tiling'
            || tabRaw === 'visualization'
            || tabRaw === 'grass') ? tabRaw : null;

        const pbr = String(params.get(TERRAIN_DEBUGGER_URL_PARAM.tilingPbr) ?? '').trim();
        const focusRaw = String(params.get(TERRAIN_DEBUGGER_URL_PARAM.tilingFocus) ?? '').trim().toLowerCase();
        this._biomeTilingFocusMode = (focusRaw === 'bus_high' || focusRaw === 'bus' || focusRaw === 'behind_gameplay')
            ? 'bus_high'
            : (focusRaw === 'eye_1p8' || focusRaw === 'eye' || focusRaw === 'low')
                ? 'eye_1p8'
                : 'overview';

        const parseNum = (key) => {
            const n = Number(params.get(key));
            return Number.isFinite(n) ? n : null;
        };
        const cx = parseNum(TERRAIN_DEBUGGER_URL_PARAM.cameraPosX);
        const cy = parseNum(TERRAIN_DEBUGGER_URL_PARAM.cameraPosY);
        const cz = parseNum(TERRAIN_DEBUGGER_URL_PARAM.cameraPosZ);
        const tx = parseNum(TERRAIN_DEBUGGER_URL_PARAM.cameraTargetX);
        const ty = parseNum(TERRAIN_DEBUGGER_URL_PARAM.cameraTargetY);
        const tz = parseNum(TERRAIN_DEBUGGER_URL_PARAM.cameraTargetZ);
        if (cx !== null && cy !== null && cz !== null && tx !== null && ty !== null && tz !== null) {
            this._biomeTilingInitialCameraPose = {
                position: new THREE.Vector3(cx, cy, cz),
                target: new THREE.Vector3(tx, ty, tz)
            };
        } else {
            this._biomeTilingInitialCameraPose = null;
        }

        const nextState = {};
        if (tab) nextState.tab = tab;
        if (pbr) {
            nextState.terrain = {
                biomeTiling: {
                    materialId: pbr
                }
            };
        }
        if (!Object.keys(nextState).length) return null;
        return nextState;
    }

    _applyInitialBiomeTilingUrlCameraOverride() {
        if (this._terrainViewMode !== TERRAIN_VIEW_MODE.BIOME_TILING) return;
        const controls = this.controls;
        if (!controls?.setLookAt) return;
        const pose = this._biomeTilingInitialCameraPose;
        if (pose?.position && pose?.target) {
            controls.setLookAt({ position: pose.position, target: pose.target });
            this._activeCameraPresetId = 'custom';
            this._syncCameraStatus({ nowMs: performance.now(), force: true });
            return;
        }
        this._focusBiomeTilingCamera(this._biomeTilingFocusMode);
    }

    _syncBiomeTilingHref({ force = false } = {}) {
        if (typeof window === 'undefined' || !window.history?.replaceState) return;
        const camera = this.camera;
        const controls = this.controls;
        const target = controls?.target ?? null;
        const url = new URL(window.location.href);
        const params = url.searchParams;

        if (this._terrainViewMode !== TERRAIN_VIEW_MODE.BIOME_TILING) {
            const had = params.has(TERRAIN_DEBUGGER_URL_PARAM.tab)
                || params.has(TERRAIN_DEBUGGER_URL_PARAM.tilingPbr)
                || params.has(TERRAIN_DEBUGGER_URL_PARAM.tilingFocus)
                || params.has(TERRAIN_DEBUGGER_URL_PARAM.cameraPosX)
                || params.has(TERRAIN_DEBUGGER_URL_PARAM.cameraPosY)
                || params.has(TERRAIN_DEBUGGER_URL_PARAM.cameraPosZ)
                || params.has(TERRAIN_DEBUGGER_URL_PARAM.cameraTargetX)
                || params.has(TERRAIN_DEBUGGER_URL_PARAM.cameraTargetY)
                || params.has(TERRAIN_DEBUGGER_URL_PARAM.cameraTargetZ);
            if (!had) return;
            params.delete(TERRAIN_DEBUGGER_URL_PARAM.tab);
            params.delete(TERRAIN_DEBUGGER_URL_PARAM.tilingPbr);
            params.delete(TERRAIN_DEBUGGER_URL_PARAM.tilingFocus);
            params.delete(TERRAIN_DEBUGGER_URL_PARAM.cameraPosX);
            params.delete(TERRAIN_DEBUGGER_URL_PARAM.cameraPosY);
            params.delete(TERRAIN_DEBUGGER_URL_PARAM.cameraPosZ);
            params.delete(TERRAIN_DEBUGGER_URL_PARAM.cameraTargetX);
            params.delete(TERRAIN_DEBUGGER_URL_PARAM.cameraTargetY);
            params.delete(TERRAIN_DEBUGGER_URL_PARAM.cameraTargetZ);
            const query = params.toString();
            const nextUrl = `${url.pathname}${query ? `?${query}` : ''}${url.hash || ''}`;
            if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
                window.history.replaceState(null, '', nextUrl);
            }
            this._biomeTilingHrefKey = '';
            return;
        }

        const materialId = String(this._biomeTilingState?.materialId ?? '').trim();
        const focusMode = this._biomeTilingFocusMode === 'bus_high'
            ? 'bus_high'
            : this._biomeTilingFocusMode === 'eye_1p8'
                ? 'eye_1p8'
                : 'overview';
        const camX = Number(camera?.position?.x);
        const camY = Number(camera?.position?.y);
        const camZ = Number(camera?.position?.z);
        const targetX = Number(target?.x);
        const targetY = Number(target?.y);
        const targetZ = Number(target?.z);
        if (!(Number.isFinite(camX) && Number.isFinite(camY) && Number.isFinite(camZ)
            && Number.isFinite(targetX) && Number.isFinite(targetY) && Number.isFinite(targetZ))) return;

        const key = [
            materialId,
            focusMode,
            camX.toFixed(3),
            camY.toFixed(3),
            camZ.toFixed(3),
            targetX.toFixed(3),
            targetY.toFixed(3),
            targetZ.toFixed(3)
        ].join('|');
        if (!force && key === this._biomeTilingHrefKey) return;
        this._biomeTilingHrefKey = key;

        params.set(TERRAIN_DEBUGGER_URL_PARAM.tab, 'biome_tiling');
        if (materialId) params.set(TERRAIN_DEBUGGER_URL_PARAM.tilingPbr, materialId);
        else params.delete(TERRAIN_DEBUGGER_URL_PARAM.tilingPbr);
        params.set(TERRAIN_DEBUGGER_URL_PARAM.tilingFocus, focusMode);
        params.set(TERRAIN_DEBUGGER_URL_PARAM.cameraPosX, camX.toFixed(3));
        params.set(TERRAIN_DEBUGGER_URL_PARAM.cameraPosY, camY.toFixed(3));
        params.set(TERRAIN_DEBUGGER_URL_PARAM.cameraPosZ, camZ.toFixed(3));
        params.set(TERRAIN_DEBUGGER_URL_PARAM.cameraTargetX, targetX.toFixed(3));
        params.set(TERRAIN_DEBUGGER_URL_PARAM.cameraTargetY, targetY.toFixed(3));
        params.set(TERRAIN_DEBUGGER_URL_PARAM.cameraTargetZ, targetZ.toFixed(3));

        const query = params.toString();
        const nextUrl = `${url.pathname}${query ? `?${query}` : ''}${url.hash || ''}`;
        if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
            window.history.replaceState(null, '', nextUrl);
        }
    }

    _applyCameraPreset(id) {
        const controls = this.controls;
        if (!controls?.setLookAt) return;
        if (this._flyover?.active) this._stopFlyover({ keepPose: true });
        const preset = String(id ?? '');
        const pose = this._getCameraPoseForPreset(preset);
        if (!pose) return;

        controls.setLookAt({ position: pose.position, target: pose.target });
        this._activeCameraPresetId = preset || 'custom';
        this._syncCameraStatus({ nowMs: performance.now(), force: true });
    }

    _focusBiomeTransitionCamera() {
        const controls = this.controls;
        if (!controls?.setLookAt) return;
        if (this._flyover?.active) this._stopFlyover({ keepPose: true });

        const grid = this._terrainGrid;
        if (!grid) {
            this._applyCameraPreset('low');
            return;
        }

        const tileSize = Number(grid.tileSize) || 24;
        const widthTiles = Math.max(1, Number(grid.widthTiles) || 1);
        const depthTiles = Math.max(1, Number(grid.depthTiles) || 1);
        const minX = Number(grid.minX) || 0;
        const minZ = Number(grid.minZ) || 0;
        const centerX = minX + widthTiles * tileSize * 0.5;
        const centerZ = minZ + depthTiles * tileSize * 0.5;
        const targetY = this._getTerrainHeightAtXZ(centerX, centerZ);
        const position = new THREE.Vector3(
            centerX,
            targetY + Math.max(16, tileSize * 1.35),
            centerZ + Math.max(28, tileSize * 2.3)
        );
        const target = new THREE.Vector3(centerX, targetY, centerZ);
        controls.setLookAt({ position, target });
        this._activeCameraPresetId = 'custom';
        this._syncCameraStatus({ nowMs: performance.now(), force: true });
    }

    _focusBiomeTilingCamera(mode = 'overview') {
        const controls = this.controls;
        if (!controls?.setLookAt) return;
        const modeId = String(mode ?? '').trim().toLowerCase();
        if (modeId === 'sun_orbit') {
            if (this._terrainViewMode !== TERRAIN_VIEW_MODE.BIOME_TILING) return;
            this._startBiomeTilingSunOrbit({ nowMs: performance.now() });
            return;
        }
        if (modeId === 'flyover_debug') {
            if (this._terrainViewMode !== TERRAIN_VIEW_MODE.BIOME_TILING) return;
            this._biomeTilingSunOrbitAnim = null;
            if (this._flyover?.active) this._stopFlyover({ keepPose: true });
            this._resetBiomeTilingLodMonitor();
            this._startBiomeTilingFlyoverDebug();
            return;
        }
        if (modeId === 'flyover') {
            if (this._terrainViewMode !== TERRAIN_VIEW_MODE.BIOME_TILING) return;
            this._biomeTilingSunOrbitAnim = null;
            if (this._flyover?.active) this._stopFlyover({ keepPose: true });
            this._resetBiomeTilingLodMonitor();
            this._startBiomeTilingFlyover();
            return;
        }

        this._biomeTilingSunOrbitAnim = null;
        this._disableFlyoverDebug();
        if (this._flyover?.active) this._stopFlyover({ keepPose: true });

        const isBusHigh = modeId === 'bus_high' || modeId === 'bus' || modeId === 'behind_gameplay';
        const isEye = modeId === 'eye_1p8' || modeId === 'eye' || modeId === 'low';
        this._biomeTilingFocusMode = isBusHigh ? 'bus_high' : (isEye ? 'eye_1p8' : 'overview');
        const pose = this._getBiomeTilingFocusPose(this._biomeTilingFocusMode);
        if (!pose) {
            if (!isBusHigh) this._applyCameraPreset('low');
            return;
        }
        if (!pose?.position || !pose?.target) return;

        controls.setLookAt({ position: pose.position, target: pose.target });
        this._syncBiomeTilingFocusUiState({ force: true });
        this._resetBiomeTilingLodMonitor();
        this._activeCameraPresetId = 'custom';
        this._syncCameraStatus({ nowMs: performance.now(), force: true });
        this._syncBiomeTilingHref({ force: true });
    }

    _getTerrainBoundsXZ() {
        const grid = this._terrainGrid;
        if (!grid) return null;
        const tileSize = Number(grid.tileSize) || 0;
        const widthTiles = Math.max(1, Number(grid.widthTiles) || 1);
        const depthTiles = Math.max(1, Number(grid.depthTiles) || 1);
        const minX = Number(grid.minX) || 0;
        const minZ = Number(grid.minZ) || 0;
        const maxX = minX + widthTiles * tileSize;
        const maxZ = minZ + depthTiles * tileSize;
        if (!(Number.isFinite(maxX) && Number.isFinite(maxZ) && maxX > minX && maxZ > minZ && tileSize > EPS)) return null;
        return { minX, maxX, minZ, maxZ };
    }

    _sanitizeTerrainBiomeHumidityBindings(bindingsSrc) {
        const src = bindingsSrc && typeof bindingsSrc === 'object' ? bindingsSrc : {};
        const out = {};
        for (const biome of TERRAIN_BIOME_IDS) {
            const srcBiome = src[biome] && typeof src[biome] === 'object' ? src[biome] : {};
            const fallbackBiome = DEFAULT_TERRAIN_BIOME_HUMIDITY_PBR_BINDINGS[biome] ?? {};
            const row = {};
            for (const slot of TERRAIN_HUMIDITY_SLOT_IDS) {
                const id = String(srcBiome[slot] ?? fallbackBiome[slot] ?? '');
                row[slot] = id || String(fallbackBiome[slot] ?? '');
            }
            out[biome] = row;
        }
        return out;
    }

    _sanitizeTerrainHumidityBlendConfig(humidityCfgSrc) {
        const src = humidityCfgSrc && typeof humidityCfgSrc === 'object' ? humidityCfgSrc : {};
        const dryMax = clamp(src.dryMax, 0.05, 0.49, DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.dryMax);
        const wetMinBase = clamp(src.wetMin, 0.51, 0.95, DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.wetMin);
        const wetMin = wetMinBase <= dryMax + 0.02 ? Math.min(0.95, dryMax + 0.02) : wetMinBase;
        return {
            dryMax,
            wetMin,
            blendBand: clamp(src.blendBand, 0.005, 0.25, DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.blendBand),
            edgeNoiseScale: clamp(src.edgeNoiseScale, 0.001, 0.2, DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.edgeNoiseScale),
            edgeNoiseStrength: clamp(src.edgeNoiseStrength, 0.0, 0.3, DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.edgeNoiseStrength)
        };
    }

    _sanitizeTerrainHumidityCloudConfig(cloudSrc) {
        const src = cloudSrc && typeof cloudSrc === 'object' ? cloudSrc : {};
        return {
            subtilePerTile: Math.max(1, Math.min(32, Math.round(Number(src.subtilePerTile) || DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG.subtilePerTile))),
            scale: clamp(src.scale, 0.0005, 0.2, DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG.scale),
            octaves: Math.max(1, Math.min(8, Math.round(Number(src.octaves) || DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG.octaves))),
            gain: clamp(src.gain, 0.01, 1.0, DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG.gain),
            lacunarity: clamp(src.lacunarity, 1.0, 4.0, DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG.lacunarity),
            bias: clamp(src.bias, -1.0, 1.0, DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG.bias),
            amplitude: clamp(src.amplitude, 0.0, 1.0, DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG.amplitude)
        };
    }

    _buildTerrainHumiditySourceMapFromCloud({ bounds, seed } = {}) {
        const b = bounds && typeof bounds === 'object' ? bounds : null;
        if (!b) return null;
        const cfg = this._terrainHumidityCloudConfig ?? DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG;
        const grid = this._terrainGrid;
        const widthTiles = Math.max(1, Math.round(Number(grid?.widthTiles) || 1));
        const depthTiles = Math.max(1, Math.round(Number(grid?.depthTiles) || 1));
        const subtilePerTile = Math.max(1, Math.min(32, Math.round(Number(cfg.subtilePerTile) || 8)));
        const width = Math.max(1, widthTiles * subtilePerTile);
        const height = Math.max(1, depthTiles * subtilePerTile);

        const safeSeed = String(seed ?? 'terrain-debugger');
        let seedU32 = 2166136261 >>> 0;
        for (let i = 0; i < safeSeed.length; i++) {
            seedU32 ^= safeSeed.charCodeAt(i) & 255;
            seedU32 = Math.imul(seedU32, 16777619) >>> 0;
        }
        const seedX = ((seedU32 & 0xffff) / 65535 - 0.5) * 4096;
        const seedZ = (((seedU32 >>> 16) & 0xffff) / 65535 - 0.5) * 4096;

        const scale = clamp(cfg.scale, 0.0005, 0.2, DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG.scale);
        const octaves = Math.max(1, Math.min(8, Math.round(Number(cfg.octaves) || DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG.octaves)));
        const gain = clamp(cfg.gain, 0.01, 1.0, DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG.gain);
        const lacunarity = clamp(cfg.lacunarity, 1.0, 4.0, DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG.lacunarity);
        const bias = clamp(cfg.bias, -1.0, 1.0, DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG.bias);
        const amplitude = clamp(cfg.amplitude, 0.0, 1.0, DEFAULT_TERRAIN_HUMIDITY_CLOUD_CONFIG.amplitude);
        const blendCfg = this._terrainHumidityBlendConfig ?? DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG;
        const dryThreshold = clamp(blendCfg.dryMax, 0.05, 0.49, DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.dryMax);
        const wetThreshold = clamp(blendCfg.wetMin, 0.51, 0.95, DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.wetMin);

        const key = [
            safeSeed,
            `${Number(b.minX).toFixed(3)},${Number(b.maxX).toFixed(3)},${Number(b.minZ).toFixed(3)},${Number(b.maxZ).toFixed(3)}`,
            `${width}x${height}`,
            `${subtilePerTile},${scale.toFixed(6)},${octaves},${gain.toFixed(4)},${lacunarity.toFixed(4)},${bias.toFixed(4)},${amplitude.toFixed(4)},${dryThreshold.toFixed(4)},${wetThreshold.toFixed(4)}`
        ].join('|');
        if (key === this._terrainHumiditySourceMapKey && this._terrainHumiditySourceMap) return this._terrainHumiditySourceMap;

        const sizeX = Number(b.maxX) - Number(b.minX);
        const sizeZ = Number(b.maxZ) - Number(b.minZ);
        if (!(sizeX > EPS && sizeZ > EPS)) return null;

        const data = new Uint8Array(width * height);
        let idx = 0;
        for (let iz = 0; iz < height; iz++) {
            const z = Number(b.minZ) + ((iz + 0.5) / height) * sizeZ;
            for (let ix = 0; ix < width; ix++) {
                const x = Number(b.minX) + ((ix + 0.5) / width) * sizeX;
                const n = sampleFbm2D((x + seedX) * scale, (z + seedZ) * scale, {
                    noise2: TERRAIN_CLOUD_NOISE_SAMPLER.sample,
                    octaves,
                    gain,
                    lacunarity,
                    maxOctaves: 8
                });
                const humidity = clamp(0.5 + (n - 0.5) * amplitude + bias, 0.0, 1.0, 0.5);
                let level = TERRAIN_HUMIDITY_LEVELS.neutral;
                if (humidity <= dryThreshold) level = TERRAIN_HUMIDITY_LEVELS.dry;
                else if (humidity >= wetThreshold) level = TERRAIN_HUMIDITY_LEVELS.wet;
                data[idx++] = Math.max(0, Math.min(255, Math.round(level * 255)));
            }
        }

        this._terrainHumiditySourceMap = {
            width,
            height,
            data,
            bounds: { minX: Number(b.minX) || 0, maxX: Number(b.maxX) || 0, minZ: Number(b.minZ) || 0, maxZ: Number(b.maxZ) || 0 }
        };
        this._terrainHumiditySourceMapKey = key;
        this._terrainEngineMaskDirty = true;
        return this._terrainHumiditySourceMap;
    }

    _sanitizeBiomeTransitionState(src) {
        const input = src && typeof src === 'object' ? src : {};
        const biome1 = TERRAIN_BIOME_IDS.includes(String(input.biome1 ?? '')) ? String(input.biome1) : 'grass';
        let biome2 = TERRAIN_BIOME_IDS.includes(String(input.biome2 ?? '')) ? String(input.biome2) : 'land';
        if (biome1 === biome2) biome2 = TERRAIN_BIOME_IDS.find((id) => id !== biome1) ?? 'land';
        const pairKey = makeBiomePairKey(biome1, biome2);
        const rawDebugMode = BIOME_TRANSITION_DEBUG_MODES.has(String(input.debugMode ?? ''))
            ? String(input.debugMode)
            : 'transition_result';
        const baselineProfiles = input.baselineProfiles && typeof input.baselineProfiles === 'object' ? input.baselineProfiles : {};
        const baselineSrc = baselineProfiles[pairKey];
        const baselineProfile = (baselineSrc && typeof baselineSrc === 'object')
            ? sanitizeBiomeTransitionProfile(baselineSrc, BIOME_TRANSITION_DEFAULT_PROFILE)
            : null;
        const compareEnabled = !!input.compareEnabled && !!baselineProfile;
        const debugMode = rawDebugMode === 'pair_compare' && !compareEnabled ? 'transition_result' : rawDebugMode;
        return {
            biome1,
            biome2,
            pairKey,
            debugMode,
            compareEnabled,
            baselineProfile
        };
    }

    _sanitizeBiomeTilingState(src) {
        const input = src && typeof src === 'object' ? src : {};
        const materialOptionsRaw = getPbrMaterialOptionsForGround();
        const materialOptions = (Array.isArray(materialOptionsRaw) ? materialOptionsRaw : [])
            .map((opt) => String(opt?.id ?? '').trim())
            .filter((id) => !!id);
        const validMaterialIds = new Set(materialOptions);
        const defaultMaterialId = materialOptions[0] ?? BIOME_TILING_DEFAULT_STATE.materialId;
        const normalizeMaterialId = (value, fallback = defaultMaterialId) => {
            const id = String(value ?? '').trim();
            if (validMaterialIds.has(id)) return id;
            if (validMaterialIds.has(String(fallback ?? ''))) return String(fallback);
            return defaultMaterialId;
        };

        const distSrc = input.distanceTiling && typeof input.distanceTiling === 'object' ? input.distanceTiling : {};
        const blendStartMeters = clamp(distSrc.blendStartMeters, 0.0, 500.0, BIOME_TILING_DEFAULT_STATE.distanceTiling.blendStartMeters);
        let blendEndMeters = clamp(distSrc.blendEndMeters, 0.0, 2000.0, BIOME_TILING_DEFAULT_STATE.distanceTiling.blendEndMeters);
        if (blendEndMeters <= blendStartMeters + 1.0) blendEndMeters = Math.min(2000.0, blendStartMeters + 1.0);
        const rawDistanceDebug = String(distSrc.debugView ?? BIOME_TILING_DEFAULT_STATE.distanceTiling.debugView);
        const distanceDebugView = rawDistanceDebug === 'near' || rawDistanceDebug === 'far' ? rawDistanceDebug : 'blended';

        const varSrc = input.variation && typeof input.variation === 'object' ? input.variation : {};
        const dispSrc = input.displacement && typeof input.displacement === 'object' ? input.displacement : {};
        const perfSrc = input.performance && typeof input.performance === 'object' ? input.performance : {};
        const dispSourceRaw = String(dispSrc.source ?? BIOME_TILING_DEFAULT_STATE.displacement.source);
        const dispSource = (dispSourceRaw === 'displacement' || dispSourceRaw === 'ao' || dispSourceRaw === 'orm')
            ? dispSourceRaw
            : 'auto';
        const dispDebugRaw = String(dispSrc.debugView ?? BIOME_TILING_DEFAULT_STATE.displacement.debugView);
        const dispDebugView = (dispDebugRaw === 'wireframe' || dispDebugRaw === 'displacement')
            ? dispDebugRaw
            : 'standard';
        const geometrySrc = input.geometryDensity && typeof input.geometryDensity === 'object' ? input.geometryDensity : {};
        const hasGeometryEnabled = Object.prototype.hasOwnProperty.call(geometrySrc, 'enabled');
        const hasDetailPreset = Object.prototype.hasOwnProperty.call(geometrySrc, 'detailPreset');
        const detailPresetRaw = String(
            hasDetailPreset
                ? geometrySrc.detailPreset
                : BIOME_TILING_DEFAULT_STATE.geometryDensity.detailPreset
        ).trim().toLowerCase();
        const geometryEnabled = hasGeometryEnabled
            ? (geometrySrc.enabled === true && detailPresetRaw !== 'off')
            : (hasDetailPreset && detailPresetRaw !== 'off');
        const detailPreset = normalizeBiomeTilingLodPreset(
            detailPresetRaw === 'off'
                ? BIOME_TILING_DEFAULT_STATE.geometryDensity.detailPreset
                : detailPresetRaw
        );
        const tileSize = Math.max(EPS, Number(this._terrainSpec?.tileSize) || 24);
        const thresholdsTiles = getBiomeTilingLodPresetThresholdsTiles(detailPreset);
        const nearRadiusMeters = Math.max(0, thresholdsTiles[0] * tileSize);
        const transitionWidthMeters = Math.max(0, (thresholdsTiles[1] - thresholdsTiles[0]) * tileSize);
        const renderDistanceMeters = Math.max(0, thresholdsTiles[3] * tileSize);
        return {
            materialId: normalizeMaterialId(input.materialId, defaultMaterialId),
            distanceTiling: {
                enabled: distSrc.enabled !== false,
                nearScale: clamp(distSrc.nearScale, 0.1, 6.0, BIOME_TILING_DEFAULT_STATE.distanceTiling.nearScale),
                farScale: clamp(distSrc.farScale, 0.01, 2.0, BIOME_TILING_DEFAULT_STATE.distanceTiling.farScale),
                blendStartMeters,
                blendEndMeters,
                blendCurve: clamp(distSrc.blendCurve, 0.35, 3.0, BIOME_TILING_DEFAULT_STATE.distanceTiling.blendCurve),
                debugView: distanceDebugView
            },
            variation: {
                antiTilingEnabled: varSrc.antiTilingEnabled === true,
                antiTilingStrength: clamp(varSrc.antiTilingStrength, 0.0, 2.0, BIOME_TILING_DEFAULT_STATE.variation.antiTilingStrength),
                antiTilingCellMeters: clamp(varSrc.antiTilingCellMeters, 0.25, 12.0, BIOME_TILING_DEFAULT_STATE.variation.antiTilingCellMeters),
                macroVariationEnabled: varSrc.macroVariationEnabled === true,
                macroVariationStrength: clamp(varSrc.macroVariationStrength, 0.0, 0.8, BIOME_TILING_DEFAULT_STATE.variation.macroVariationStrength),
                macroVariationScale: clamp(varSrc.macroVariationScale, 0.002, 0.2, BIOME_TILING_DEFAULT_STATE.variation.macroVariationScale),
                nearIntensity: clamp(varSrc.nearIntensity, 0.0, 2.0, BIOME_TILING_DEFAULT_STATE.variation.nearIntensity),
                farIntensity: clamp(varSrc.farIntensity, 0.0, 2.0, BIOME_TILING_DEFAULT_STATE.variation.farIntensity)
            },
            displacement: {
                enabled: dispSrc.enabled === true,
                strength: clamp(dispSrc.strength, 0.0, 0.2, BIOME_TILING_DEFAULT_STATE.displacement.strength),
                bias: clamp(dispSrc.bias, -10.0, 10.0, BIOME_TILING_DEFAULT_STATE.displacement.bias),
                source: dispSource,
                debugView: dispDebugView
            },
            performance: {
                fragmentShaderEnabled: perfSrc.fragmentShaderEnabled !== false,
                fragmentShaderBiomeEnabled: perfSrc.fragmentShaderBiomeEnabled !== false,
                fragmentShaderPbrLightingEnabled: perfSrc.fragmentShaderPbrLightingEnabled !== false,
                fragmentShaderAlbedoEnabled: perfSrc.fragmentShaderAlbedoEnabled !== false,
                fragmentShaderSurfaceEnabled: perfSrc.fragmentShaderSurfaceEnabled !== false,
                shadowsEnabled: perfSrc.shadowsEnabled !== false,
                highDpiEnabled: perfSrc.highDpiEnabled !== false
            },
            geometryDensity: {
                enabled: geometryEnabled,
                mode: geometryEnabled ? 'adaptive_rings' : 'uniform',
                detailPreset,
                segmentsPerTile: 1,
                nearSegmentsPerTile: 16,
                farSegmentsPerTile: 1,
                nearRadiusMeters,
                transitionWidthMeters,
                renderDistanceMeters,
                transitionSmoothing: clamp(geometrySrc.transitionSmoothing, 0.0, 1.0, BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionSmoothing),
                transitionBias: clamp(geometrySrc.transitionBias, -0.85, 0.85, BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionBias),
                transitionDebugBands: Math.max(
                    0,
                    Math.min(
                        6,
                        Math.round(Number(geometrySrc.transitionDebugBands) || Number(BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionDebugBands) || 0)
                    )
                ),
                waveStrength: clamp(
                    geometrySrc.waveStrength,
                    0.0,
                    1.0,
                    BIOME_TILING_DEFAULT_STATE.geometryDensity.waveStrength
                ),
                waveMaxHeightMeters: clamp(
                    geometrySrc.waveMaxHeightMeters,
                    0.0,
                    BIOME_TILING_WAVE_HARD_MAX_HEIGHT_METERS,
                    BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxHeightMeters
                ),
                waveMaxNeighborDeltaMeters: clamp(
                    geometrySrc.waveMaxNeighborDeltaMeters,
                    0.0,
                    BIOME_TILING_WAVE_HARD_MAX_NEIGHBOR_DELTA_METERS,
                    BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxNeighborDeltaMeters
                ),
                waveMaxTileRangeMeters: clamp(
                    geometrySrc.waveMaxTileRangeMeters,
                    0.0,
                    BIOME_TILING_WAVE_HARD_MAX_TILE_RANGE_METERS,
                    BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxTileRangeMeters
                ),
                ringOverlayEnabled: geometrySrc.ringOverlayEnabled === true,
                tileLodDebugEnabled: geometrySrc.tileLodDebugEnabled === true,
                centerOnApplyCamera: geometrySrc.centerOnApplyCamera !== false,
                rebuildCadence: normalizeBiomeTilingRebuildCadence(
                    geometrySrc.rebuildCadence,
                    { fallbackSeconds: 1.0 }
                ),
                centerX: Number.isFinite(Number(geometrySrc.centerX))
                    ? Number(geometrySrc.centerX)
                    : Number(BIOME_TILING_DEFAULT_STATE.geometryDensity.centerX) || 0,
                centerZ: Number.isFinite(Number(geometrySrc.centerZ))
                    ? Number(geometrySrc.centerZ)
                    : Number(BIOME_TILING_DEFAULT_STATE.geometryDensity.centerZ) || 0,
                applyNonce: Math.max(0, Math.round(Number(geometrySrc.applyNonce) || BIOME_TILING_DEFAULT_STATE.geometryDensity.applyNonce))
            }
        };
    }

    _resolveBiomeTilingDisplacementSource({ materialId, sourceMode } = {}) {
        const id = String(materialId ?? '').trim();
        if (!id) {
            return {
                texture: null,
                textureUrl: '',
                resolvedSource: 'none',
                fallbackActive: false
            };
        }

        const resolved = this._resolvePbrMaterialPayload(id, {
            cloneTextures: false,
            repeat: { x: 1.0, y: 1.0 },
            diagnosticsTag: 'TerrainDebuggerView.displacementSource'
        });
        const urls = resolved?.urls ?? null;
        const candidates = sourceMode === 'displacement'
            ? [{ source: 'displacement', url: urls?.displacementUrl ?? '', texture: resolved?.textures?.displacement ?? null }]
            : sourceMode === 'ao'
                ? [{ source: 'ao', url: urls?.aoUrl ?? '', texture: resolved?.textures?.ao ?? null }]
                : sourceMode === 'orm'
                    ? [{ source: 'orm', url: urls?.ormUrl ?? '', texture: resolved?.textures?.orm ?? null }]
                    : [
                        { source: 'displacement', url: urls?.displacementUrl ?? '', texture: resolved?.textures?.displacement ?? null },
                        { source: 'ao', url: urls?.aoUrl ?? '', texture: resolved?.textures?.ao ?? null },
                        { source: 'orm', url: urls?.ormUrl ?? '', texture: resolved?.textures?.orm ?? null }
                    ];

        for (const candidate of candidates) {
            const textureUrl = String(candidate?.url ?? '').trim();
            if (!textureUrl) continue;
            const texture = candidate?.texture?.isTexture ? candidate.texture : null;
            if (!texture?.isTexture) continue;
            return {
                texture,
                textureUrl,
                resolvedSource: String(candidate?.source ?? 'none'),
                fallbackActive: sourceMode === 'auto' && String(candidate?.source ?? '') !== 'displacement'
            };
        }

        return {
            texture: null,
            textureUrl: '',
            resolvedSource: 'none',
            fallbackActive: false
        };
    }

    _applyBiomeTilingDisplacementState({ materialId, displacementCfg, tilingViewActive, material } = {}) {
        const mat = material?.isMeshStandardMaterial
            ? material
            : (this._biomeTilingDisplacementOverlayMat?.isMeshStandardMaterial
                ? this._biomeTilingDisplacementOverlayMat
                : this._terrainMat);
        if (!mat?.isMeshStandardMaterial) {
            return {
                enabled: false,
                sourceMode: 'auto',
                resolvedSource: 'none',
                fallbackActive: false,
                textureUrl: '',
                missing: false
            };
        }

        const cfg = displacementCfg && typeof displacementCfg === 'object' ? displacementCfg : BIOME_TILING_DEFAULT_STATE.displacement;
        const sourceModeRaw = String(cfg.source ?? BIOME_TILING_DEFAULT_STATE.displacement.source);
        const sourceMode = (sourceModeRaw === 'displacement' || sourceModeRaw === 'ao' || sourceModeRaw === 'orm')
            ? sourceModeRaw
            : 'auto';
        const enabled = !!tilingViewActive && cfg.enabled === true;
        const strength = clamp(cfg.strength, 0.0, 0.2, BIOME_TILING_DEFAULT_STATE.displacement.strength);
        const bias = clamp(cfg.bias, -10.0, 10.0, BIOME_TILING_DEFAULT_STATE.displacement.bias);
        const nearScale = clamp(
            this._biomeTilingState?.distanceTiling?.nearScale,
            0.1,
            6.0,
            BIOME_TILING_DEFAULT_STATE.distanceTiling.nearScale
        );
        const terrainBounds = this._getTerrainBoundsXZ();
        const uvAnchorX = Number.isFinite(Number(terrainBounds?.minX)) ? Number(terrainBounds.minX) : 0;
        const uvAnchorZ = Number.isFinite(Number(terrainBounds?.minZ)) ? Number(terrainBounds.minZ) : 0;
        const wrap01 = (value) => {
            const v = Number(value);
            if (!Number.isFinite(v)) return 0;
            const f = v - Math.floor(v);
            return f < 0 ? (f + 1) : f;
        };

        let runtimeTex = null;
        let resolvedSource = 'none';
        let fallbackActive = false;
        let textureUrl = '';
        let missing = false;

        if (enabled) {
            const resolved = this._resolveBiomeTilingDisplacementSource({ materialId, sourceMode });
            resolvedSource = String(resolved.resolvedSource ?? 'none');
            fallbackActive = !!resolved.fallbackActive;
            textureUrl = String(resolved.textureUrl ?? '');

            const sourceTex = resolved.texture?.isTexture ? resolved.texture : null;
            if (sourceTex && textureUrl) {
                const resolvedMaterial = this._resolvePbrMaterialPayload(materialId, {
                    cloneTextures: false,
                    diagnosticsTag: 'TerrainDebuggerView.displacementState'
                });
                const resolvedTileMeters = Number(resolvedMaterial?.overrides?.effective?.tileMeters);
                const tileMeters = Math.max(EPS, (Number.isFinite(resolvedTileMeters) ? resolvedTileMeters : Number(getPbrMaterialMeta(materialId)?.tileMeters)) || 4.0);
                const sourceKey = [
                    textureUrl,
                    tileMeters.toFixed(4),
                    nearScale.toFixed(4),
                    uvAnchorX.toFixed(4),
                    uvAnchorZ.toFixed(4)
                ].join('|');
                if (sourceKey !== this._biomeTilingDisplacementRuntimeKey || !this._biomeTilingDisplacementRuntimeTex?.isTexture) {
                    this._biomeTilingDisplacementRuntimeTex?.dispose?.();
                    const cloned = sourceTex.clone();
                    cloned.wrapS = THREE.RepeatWrapping;
                    cloned.wrapT = THREE.RepeatWrapping;
                    const rep = nearScale / tileMeters;
                    cloned.repeat.set(rep, rep);
                    if (cloned.offset?.set) cloned.offset.set(wrap01(-uvAnchorX * rep), wrap01(-uvAnchorZ * rep));
                    if (cloned.center?.set) cloned.center.set(0, 0);
                    cloned.rotation = 0;
                    cloned.matrixAutoUpdate = true;
                    cloned.updateMatrix?.();
                    cloned.needsUpdate = true;
                    this._biomeTilingDisplacementRuntimeTex = cloned;
                    this._biomeTilingDisplacementRuntimeKey = sourceKey;
                }
                runtimeTex = this._biomeTilingDisplacementRuntimeTex;
            } else {
                missing = true;
                if (this._biomeTilingDisplacementRuntimeTex) {
                    this._biomeTilingDisplacementRuntimeTex.dispose?.();
                    this._biomeTilingDisplacementRuntimeTex = null;
                    this._biomeTilingDisplacementRuntimeKey = '';
                }
            }
        }

        if (!enabled && this._biomeTilingDisplacementRuntimeTex) {
            this._biomeTilingDisplacementRuntimeTex.dispose?.();
            this._biomeTilingDisplacementRuntimeTex = null;
            this._biomeTilingDisplacementRuntimeKey = '';
        }

        let needsUpdate = false;
        if (mat.displacementMap !== runtimeTex) {
            mat.displacementMap = runtimeTex;
            needsUpdate = true;
        }

        const nextScale = enabled && runtimeTex ? strength : 0.0;
        const nextBias = enabled && runtimeTex ? bias : 0.0;
        if (Math.abs((Number(mat.displacementScale) || 0) - nextScale) > EPS) mat.displacementScale = nextScale;
        if (Math.abs((Number(mat.displacementBias) || 0) - nextBias) > EPS) mat.displacementBias = nextBias;
        if (needsUpdate) mat.needsUpdate = true;

        const resolvedState = {
            enabled,
            sourceMode,
            resolvedSource,
            fallbackActive,
            textureUrl,
            missing: enabled && !runtimeTex ? missing : false
        };
        this._biomeTilingDisplacementResolved = resolvedState;
        return resolvedState;
    }

    _applyBiomeTilingDisplacementDebugView() {
        const overlayMat = this._biomeTilingDisplacementOverlay?.material?.isMeshStandardMaterial
            ? this._biomeTilingDisplacementOverlay.material
            : null;
        const displacementEnabled = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING
            && this._biomeTilingState?.displacement?.enabled === true;
        if (displacementEnabled && !overlayMat) return;
        const mat = overlayMat ?? this._terrainMat;
        if (!mat?.isMeshStandardMaterial) return;

        const tilingViewActive = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING;
        const displacementCfg = this._biomeTilingState?.displacement ?? BIOME_TILING_DEFAULT_STATE.displacement;
        const debugRaw = String(displacementCfg?.debugView ?? BIOME_TILING_DEFAULT_STATE.displacement.debugView);
        const debugView = (debugRaw === 'wireframe' || debugRaw === 'displacement') ? debugRaw : 'standard';
        const wireframeEnabled = this._terrainWireframe === true || (tilingViewActive && debugView === 'wireframe');
        const heightWireOverlayActive = this._syncLandHeightWireframeOverlay({ enabled: wireframeEnabled });
        this._applyMaterialWireframe(mat, wireframeEnabled && !heightWireOverlayActive);

        if (!(tilingViewActive && debugView === 'displacement')) return;

        let needsUpdate = false;
        if (mat.normalMap) {
            mat.normalMap = null;
            needsUpdate = true;
        }
        if (mat.roughnessMap) {
            mat.roughnessMap = null;
            needsUpdate = true;
        }
        if (mat.metalnessMap) {
            mat.metalnessMap = null;
            needsUpdate = true;
        }
        if (mat.aoMap) {
            mat.aoMap = null;
            needsUpdate = true;
        }
        mat.userData = mat.userData ?? {};
        mat.userData.terrainBiomeMapStone = BIOME_TILING_DISPLACEMENT_DEBUG_ALBEDO_TEX;
        mat.userData.terrainBiomeMapGrass = BIOME_TILING_DISPLACEMENT_DEBUG_ALBEDO_TEX;
        mat.userData.terrainBiomeMapLand = BIOME_TILING_DISPLACEMENT_DEBUG_ALBEDO_TEX;
        mat.userData.terrainBiomeNormalArrayTex = FALLBACK_TERRAIN_BIOME_NORMAL_ARRAY_TEX;
        mat.userData.terrainBiomeOrmArrayTex = FALLBACK_TERRAIN_BIOME_ORM_ARRAY_TEX;
        syncTerrainBiomeBlendUniformsOnMaterial(mat);
        mat.color?.setRGB?.(0.76, 0.76, 0.76);
        mat.roughness = 1.0;
        mat.metalness = 0.0;
        if (mat.normalScale?.set) mat.normalScale.set(1, 1);
        if (needsUpdate) mat.needsUpdate = true;
    }

    _syncBiomeTilingDiagnosticsUi() {
        const ui = this._ui;
        if (!ui?.setBiomeTilingDiagnostics) return;

        const readGeometryStats = (geo) => {
            const posAttr = geo?.attributes?.position ?? null;
            const indexAttr = geo?.index ?? null;
            const vertices = posAttr?.isBufferAttribute ? Math.max(0, Math.round(Number(posAttr.count) || 0)) : 0;
            const triangles = indexAttr?.isBufferAttribute
                ? Math.max(0, Math.round((Number(indexAttr.count) || 0) / 3))
                : Math.max(0, Math.round(vertices / 3));
            return { vertices, triangles };
        };
        const overlayMesh = this._biomeTilingDisplacementOverlay;
        const overlayGeometry = overlayMesh?.geometry?.isBufferGeometry ? overlayMesh.geometry : null;
        const baseGeometry = this._terrain?.geometry?.isBufferGeometry ? this._terrain.geometry : null;
        const overlayStats = readGeometryStats(overlayGeometry);
        const baseStats = readGeometryStats(baseGeometry);
        const overlayVisible = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING && overlayMesh?.visible === true;
        const grid = this._terrainGrid ?? null;
        const baseWidthTiles = Math.max(1, Math.round(Number(grid?.widthTiles) || 1));
        const baseDepthTiles = Math.max(1, Math.round(Number(grid?.depthTiles) || 1));
        const tileSize = Math.max(EPS, Number(grid?.tileSize) || Number(this._terrainSpec?.tileSize) || 24);
        const overlayBounds = this._biomeTilingAppliedGeometryState?.overlayBounds ?? null;
        const overlayWidthMeters = (
            Number.isFinite(Number(overlayBounds?.minX))
            && Number.isFinite(Number(overlayBounds?.maxX))
            && Number(overlayBounds.maxX) > Number(overlayBounds.minX) + EPS
        )
            ? (Number(overlayBounds.maxX) - Number(overlayBounds.minX))
            : 0;
        const overlayDepthMeters = (
            Number.isFinite(Number(overlayBounds?.minZ))
            && Number.isFinite(Number(overlayBounds?.maxZ))
            && Number(overlayBounds.maxZ) > Number(overlayBounds.minZ) + EPS
        )
            ? (Number(overlayBounds.maxZ) - Number(overlayBounds.minZ))
            : 0;
        const overlayWidthTiles = overlayWidthMeters > EPS ? (overlayWidthMeters / tileSize) : 0;
        const overlayDepthTiles = overlayDepthMeters > EPS ? (overlayDepthMeters / tileSize) : 0;
        const requestedGeometry = this._biomeTilingState?.geometryDensity ?? BIOME_TILING_DEFAULT_STATE.geometryDensity;
        const fragmentToggleState = this._resolveBiomeTilingFragmentToggleState(this._getBiomeTilingPerformanceState());
        const fragmentRequested = fragmentToggleState.requested;
        const fragmentEffective = fragmentToggleState.effective;
        const fragmentShaderEnabled = fragmentEffective.fragmentShaderEnabled === true;
        const fragmentShaderBiomeEnabled = fragmentEffective.fragmentShaderBiomeEnabled === true;
        const fragmentShaderPbrLightingEnabled = fragmentEffective.fragmentShaderPbrLightingEnabled === true;
        const fragmentShaderAlbedoEnabled = fragmentEffective.fragmentShaderAlbedoEnabled === true;
        const fragmentShaderSurfaceEnabled = fragmentEffective.fragmentShaderSurfaceEnabled === true;
        const requestedAdaptiveEnabled = requestedGeometry?.enabled !== false;
        const requestedGeometryMode = requestedAdaptiveEnabled && String(requestedGeometry?.mode ?? 'uniform') === 'adaptive_rings'
            ? 'adaptive_rings'
            : 'uniform';
        const requestedSegmentsPerTile = Math.max(
            1,
            Math.round(Number(requestedGeometry?.segmentsPerTile) || BIOME_TILING_DEFAULT_STATE.geometryDensity.segmentsPerTile)
        );
        const requestedNearSegmentsPerTile = Math.max(
            1,
            Math.round(Number(requestedGeometry?.nearSegmentsPerTile) || BIOME_TILING_DEFAULT_STATE.geometryDensity.nearSegmentsPerTile)
        );
        const requestedFarSegmentsPerTile = Math.max(
            1,
            Math.round(Number(requestedGeometry?.farSegmentsPerTile) || BIOME_TILING_DEFAULT_STATE.geometryDensity.farSegmentsPerTile)
        );
        const requestedNearRadiusMeters = Math.max(
            0,
            Number(requestedGeometry?.nearRadiusMeters) || BIOME_TILING_DEFAULT_STATE.geometryDensity.nearRadiusMeters
        );
        const requestedTransitionWidthMeters = Math.max(
            0,
            Number(requestedGeometry?.transitionWidthMeters) || BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionWidthMeters
        );
        const requestedTransitionSmoothing = clamp(
            requestedGeometry?.transitionSmoothing,
            0.0,
            1.0,
            BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionSmoothing
        );
        const requestedTransitionBias = clamp(
            requestedGeometry?.transitionBias,
            -0.85,
            0.85,
            BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionBias
        );
        const requestedTransitionDebugBands = Math.max(
            0,
            Math.min(
                6,
                Math.round(Number.isFinite(Number(requestedGeometry?.transitionDebugBands))
                    ? Number(requestedGeometry.transitionDebugBands)
                    : Number(BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionDebugBands))
            )
        );
        const appliedGeometry = this._biomeTilingAppliedGeometryState ?? {
            enabled: requestedGeometry?.enabled !== false,
            mode: 'uniform',
            segmentsPerTile: Math.max(1, Math.round(Number(this._terrainSpec?.segmentsPerTile) || requestedSegmentsPerTile)),
            nearSegmentsPerTile: requestedNearSegmentsPerTile,
            farSegmentsPerTile: requestedFarSegmentsPerTile,
            nearRadiusMeters: requestedNearRadiusMeters,
            transitionWidthMeters: requestedTransitionWidthMeters,
            renderDistanceMeters: Math.max(0, requestedNearRadiusMeters + requestedTransitionWidthMeters),
            transitionSmoothing: requestedTransitionSmoothing,
            transitionBias: requestedTransitionBias,
            transitionDebugBands: requestedTransitionDebugBands,
            waveStrength: clamp(requestedGeometry?.waveStrength, 0.0, 1.0, BIOME_TILING_DEFAULT_STATE.geometryDensity.waveStrength),
            waveMaxHeightMeters: clamp(
                requestedGeometry?.waveMaxHeightMeters,
                0.0,
                BIOME_TILING_WAVE_HARD_MAX_HEIGHT_METERS,
                BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxHeightMeters
            ),
            waveMaxNeighborDeltaMeters: clamp(
                requestedGeometry?.waveMaxNeighborDeltaMeters,
                0.0,
                BIOME_TILING_WAVE_HARD_MAX_NEIGHBOR_DELTA_METERS,
                BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxNeighborDeltaMeters
            ),
            ringOverlayEnabled: requestedGeometry?.ringOverlayEnabled !== false,
            centerX: 0,
            centerZ: 0
        };
        const appliedGeometryMode = (appliedGeometry?.enabled !== false) && String(appliedGeometry.mode ?? 'uniform') === 'adaptive_rings'
            ? 'adaptive_rings'
            : 'uniform';
        const appliedAdaptiveEnabled = appliedGeometry?.enabled !== false;
        const appliedSegmentsPerTile = Math.max(
            1,
            Math.round(Number(appliedGeometry.segmentsPerTile) || Number(this._terrainSpec?.segmentsPerTile) || requestedSegmentsPerTile)
        );
        const appliedNearSegmentsPerTile = Math.max(
            1,
            Math.round(Number(appliedGeometry.nearSegmentsPerTile) || requestedNearSegmentsPerTile)
        );
        const appliedFarSegmentsPerTile = Math.max(
            1,
            Math.round(Number(appliedGeometry.farSegmentsPerTile) || requestedFarSegmentsPerTile)
        );
        const appliedNearRadiusMeters = Math.max(0, Number(appliedGeometry.nearRadiusMeters) || requestedNearRadiusMeters);
        const appliedTransitionWidthMeters = Math.max(0, Number(appliedGeometry.transitionWidthMeters) || requestedTransitionWidthMeters);
        const appliedTransitionSmoothing = clamp(
            appliedGeometry.transitionSmoothing,
            0.0,
            1.0,
            requestedTransitionSmoothing
        );
        const appliedTransitionBias = clamp(
            appliedGeometry.transitionBias,
            -0.85,
            0.85,
            requestedTransitionBias
        );
        const appliedTransitionDebugBands = Math.max(
            0,
            Math.min(
                6,
                Math.round(Number.isFinite(Number(appliedGeometry.transitionDebugBands))
                    ? Number(appliedGeometry.transitionDebugBands)
                    : requestedTransitionDebugBands)
            )
        );
        const appliedRingCenterX = Number(appliedGeometry.centerX) || 0;
        const appliedRingCenterZ = Number(appliedGeometry.centerZ) || 0;
        const farSegForEstimate = appliedGeometryMode === 'adaptive_rings' ? appliedFarSegmentsPerTile : appliedSegmentsPerTile;
        const nearSegForEstimate = appliedGeometryMode === 'adaptive_rings' ? appliedNearSegmentsPerTile : appliedSegmentsPerTile;
        const totalTiles = Math.max(
            1,
            (overlayWidthTiles > EPS && overlayDepthTiles > EPS)
                ? (overlayWidthTiles * overlayDepthTiles)
                : (baseWidthTiles * baseDepthTiles)
        );
        const estimatedFarOnlyTriangles = Math.max(0, Math.round(totalTiles * farSegForEstimate * farSegForEstimate * 2));
        const estimatedNearOnlyTriangles = Math.max(0, Math.round(totalTiles * nearSegForEstimate * nearSegForEstimate * 2));
        const displacementResolved = this._biomeTilingDisplacementResolved ?? {
            enabled: false,
            sourceMode: 'auto',
            resolvedSource: 'none',
            fallbackActive: false,
            textureUrl: '',
            missing: false
        };
        const lodMonitor = this._getBiomeTilingLodMonitorStats({
            nowMs: performance.now()
        });
        const lodDiagnosticsMaterial = (overlayVisible && this._biomeTilingDisplacementOverlayMat?.isMeshStandardMaterial)
            ? this._biomeTilingDisplacementOverlayMat
            : this._terrainMat;
        const distanceCfg = this._biomeTilingState?.distanceTiling ?? BIOME_TILING_DEFAULT_STATE.distanceTiling;
        const variationCfg = this._biomeTilingState?.variation ?? BIOME_TILING_DEFAULT_STATE.variation;
        const displacementCfg = this._biomeTilingState?.displacement ?? BIOME_TILING_DEFAULT_STATE.displacement;
        const fragmentPathDiagnostics = this._buildTerrainFragmentPathDiagnostics({
            material: lodDiagnosticsMaterial,
            fragmentShaderEnabled: fragmentRequested.fragmentShaderEnabled === true,
            fragmentShaderBiomeEnabled: fragmentRequested.fragmentShaderBiomeEnabled === true,
            fragmentShaderPbrLightingEnabled: fragmentRequested.fragmentShaderPbrLightingEnabled === true,
            fragmentShaderAlbedoEnabled: fragmentRequested.fragmentShaderAlbedoEnabled === true,
            fragmentShaderSurfaceEnabled: fragmentRequested.fragmentShaderSurfaceEnabled === true,
            fragmentToggleStates: fragmentToggleState.states,
            distanceBlendEnabled: distanceCfg?.enabled !== false,
            antiTilingEnabled: variationCfg?.antiTilingEnabled === true,
            macroVariationEnabled: variationCfg?.macroVariationEnabled === true,
            displacementSamplingEnabled: displacementCfg?.enabled === true
        });
        const lodSamplerEstimateUsed = Math.max(0, Math.round(Number(fragmentPathDiagnostics?.totalFragmentSamplers) || 0));
        const lodSamplerMaxTextures = this._getRendererMaxFragmentTextureUnits();
        const gpuSamplerHeadroom = Number.isFinite(Number(lodSamplerMaxTextures))
            ? Math.max(0, Math.round(Number(lodSamplerMaxTextures) - Number(lodSamplerEstimateUsed)))
            : null;
        const rendererCaps = this.renderer?.capabilities ?? null;
        const isWebgl2 = rendererCaps?.isWebGL2 === true;
        let gpuWebglVersion = this.renderer
            ? (isWebgl2 ? 'WebGL2' : 'WebGL1')
            : 'n/a';
        try {
            const gl = this.renderer?.getContext?.();
            if (gl?.getParameter) {
                const rawVersion = String(gl.getParameter(gl.VERSION) ?? '').trim();
                if (rawVersion) gpuWebglVersion = `${gpuWebglVersion} (${rawVersion})`;
            }
        } catch {
        }
        const gpuFrameTimeRaw = Number(this._gpuFrameTimer?.getLastMs?.());
        const gpuFrameTimeMs = Number.isFinite(gpuFrameTimeRaw) ? Math.max(0, gpuFrameTimeRaw) : null;

        ui.setBiomeTilingDiagnostics({
            active: this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING,
            requestedAdaptiveEnabled,
            appliedAdaptiveEnabled,
            requestedGeometryMode,
            appliedGeometryMode,
            requestedSegmentsPerTile,
            appliedSegmentsPerTile,
            requestedNearSegmentsPerTile,
            requestedFarSegmentsPerTile,
            appliedNearSegmentsPerTile,
            appliedFarSegmentsPerTile,
            requestedNearRadiusMeters,
            requestedTransitionWidthMeters,
            appliedNearRadiusMeters,
            appliedTransitionWidthMeters,
            requestedTransitionSmoothing,
            requestedTransitionBias,
            requestedTransitionDebugBands,
            appliedTransitionSmoothing,
            appliedTransitionBias,
            appliedTransitionDebugBands,
            requestedRenderDistanceMeters: Math.max(
                0,
                Number(requestedGeometry?.renderDistanceMeters)
                || (requestedNearRadiusMeters + requestedTransitionWidthMeters)
            ),
            appliedRenderDistanceMeters: Math.max(
                0,
                Number(appliedGeometry?.renderDistanceMeters)
                || (appliedNearRadiusMeters + appliedTransitionWidthMeters)
            ),
            requestedWaveStrength: clamp(requestedGeometry?.waveStrength, 0.0, 1.0, BIOME_TILING_DEFAULT_STATE.geometryDensity.waveStrength),
            appliedWaveStrength: clamp(appliedGeometry?.waveStrength, 0.0, 1.0, BIOME_TILING_DEFAULT_STATE.geometryDensity.waveStrength),
            requestedWaveMaxHeightMeters: clamp(
                requestedGeometry?.waveMaxHeightMeters,
                0.0,
                BIOME_TILING_WAVE_HARD_MAX_HEIGHT_METERS,
                BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxHeightMeters
            ),
            appliedWaveMaxHeightMeters: clamp(
                appliedGeometry?.waveMaxHeightMeters,
                0.0,
                BIOME_TILING_WAVE_HARD_MAX_HEIGHT_METERS,
                BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxHeightMeters
            ),
            requestedWaveMaxNeighborDeltaMeters: clamp(
                requestedGeometry?.waveMaxNeighborDeltaMeters,
                0.0,
                BIOME_TILING_WAVE_HARD_MAX_NEIGHBOR_DELTA_METERS,
                BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxNeighborDeltaMeters
            ),
            appliedWaveMaxNeighborDeltaMeters: clamp(
                appliedGeometry?.waveMaxNeighborDeltaMeters,
                0.0,
                BIOME_TILING_WAVE_HARD_MAX_NEIGHBOR_DELTA_METERS,
                BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxNeighborDeltaMeters
            ),
            rebuildCadence: String(requestedGeometry?.rebuildCadence ?? 'off'),
            appliedRingCenterX,
            appliedRingCenterZ,
            ringOverlayEnabled: requestedGeometry?.ringOverlayEnabled !== false,
            overlayVisible,
            overlayWidthTiles,
            overlayDepthTiles,
            overlayWidthMeters,
            overlayDepthMeters,
            overlayVertices: overlayStats.vertices,
            overlayTriangles: overlayStats.triangles,
            widthTiles: overlayWidthTiles,
            depthTiles: overlayDepthTiles,
            vertices: overlayStats.vertices,
            triangles: overlayStats.triangles,
            baseWidthTiles,
            baseDepthTiles,
            baseVertices: baseStats.vertices,
            baseTriangles: baseStats.triangles,
            estimatedFarOnlyTriangles,
            estimatedNearOnlyTriangles,
            lastGeometryApplyMs: this._biomeTilingLastGeometryApplyMs,
            lastDisplacementUpdateMs: this._biomeTilingLastDisplacementUpdateMs,
            displacementEnabled: displacementResolved.enabled === true,
            displacementSourceMode: String(displacementResolved.sourceMode ?? 'auto'),
            displacementResolvedSource: String(displacementResolved.resolvedSource ?? 'none'),
            displacementFallbackActive: displacementResolved.fallbackActive === true,
            displacementTextureUrl: String(displacementResolved.textureUrl ?? ''),
            displacementMissing: displacementResolved.missing === true,
            lodDetailPreset: String(appliedGeometry?.detailPreset ?? requestedGeometry?.detailPreset ?? BIOME_TILING_LOD_DEFAULT_PRESET),
            lodQuadLevels: Array.isArray(appliedGeometry?.lodLevels) ? appliedGeometry.lodLevels.slice(0) : BIOME_TILING_LOD_QUAD_LEVELS.slice(),
            lodTileCounts: (appliedGeometry?.lodTileCounts && typeof appliedGeometry.lodTileCounts === 'object')
                ? { ...appliedGeometry.lodTileCounts }
                : buildBiomeTilingLodCountsMap(),
            lodTotalQuads: Math.max(0, Math.round(Number(appliedGeometry?.lodTotalQuads) || 0)),
            lodBandWidthsMeters: Array.isArray(appliedGeometry?.lodBandWidthsMeters)
                ? appliedGeometry.lodBandWidthsMeters.slice(0)
                : [],
            lodSamplerEstimateUsed,
            lodSamplerMaxTextures,
            gpuSamplerHeadroom,
            gpuWebglVersion,
            gpuFrameTimeMs,
            fragmentShaderEnabled,
            fragmentShaderBiomeEnabled,
            fragmentShaderPbrLightingEnabled,
            fragmentShaderAlbedoEnabled,
            fragmentShaderSurfaceEnabled,
            fragmentToggleStates: Array.isArray(fragmentToggleState?.states)
                ? fragmentToggleState.states.map((row) => ({
                    id: String(row?.id ?? ''),
                    label: String(row?.label ?? ''),
                    requested: row?.requested === true,
                    effective: row?.effective === true,
                    reason: String(row?.reason ?? '')
                }))
                : [],
            fragmentPathStates: Array.isArray(fragmentPathDiagnostics?.pathStates)
                ? fragmentPathDiagnostics.pathStates
                : [],
            gpuSamplerPathRows: Array.isArray(fragmentPathDiagnostics?.activeFragmentRows)
                ? fragmentPathDiagnostics.activeFragmentRows
                : [],
            activeLodZone: String(lodMonitor?.activeZone ?? 'n/a'),
            activeLodBlend: Number.isFinite(Number(lodMonitor?.activeBlend)) ? Number(lodMonitor.activeBlend) : null,
            activeLodSegmentsPerTile: Number.isFinite(Number(lodMonitor?.activeSegmentsPerTile)) ? Number(lodMonitor.activeSegmentsPerTile) : null,
            activeLodDistanceMeters: Number.isFinite(Number(lodMonitor?.activeDistanceMeters)) ? Number(lodMonitor.activeDistanceMeters) : null,
            historyWindowSec: Number.isFinite(Number(lodMonitor?.windowSec)) ? Number(lodMonitor.windowSec) : null,
            historyNearPct: Number.isFinite(Number(lodMonitor?.nearPct)) ? Number(lodMonitor.nearPct) : null,
            historyTransitionPct: Number.isFinite(Number(lodMonitor?.transitionPct)) ? Number(lodMonitor.transitionPct) : null,
            historyFarPct: Number.isFinite(Number(lodMonitor?.farPct)) ? Number(lodMonitor.farPct) : null,
            historyBoundaryCrossings: Number.isFinite(Number(lodMonitor?.boundaryCrossings)) ? Number(lodMonitor.boundaryCrossings) : 0,
            historyPopCandidates: Number.isFinite(Number(lodMonitor?.popCandidates)) ? Number(lodMonitor.popCandidates) : 0,
            historyMaxSegmentsDeltaPerSec: Number.isFinite(Number(lodMonitor?.maxSegmentsDeltaPerSec)) ? Number(lodMonitor.maxSegmentsDeltaPerSec) : null
        });
    }

    _resetBiomeTilingLodMonitor({ windowSec = null } = {}) {
        const monitor = this._biomeTilingLodMonitor;
        if (!monitor || typeof monitor !== 'object') return;
        if (Number.isFinite(Number(windowSec)) && Number(windowSec) > 0) {
            monitor.windowSec = Math.max(1, Number(windowSec));
        }
        monitor.samples = [];
        monitor.lastSampleMs = 0;
    }

    _computeBiomeTilingRingDistance({
        x = null,
        z = null,
        centerX = null,
        centerZ = null
    } = {}) {
        const px = Number(x);
        const pz = Number(z);
        const cx = Number(centerX);
        const cz = Number(centerZ);
        if (!(Number.isFinite(px) && Number.isFinite(pz) && Number.isFinite(cx) && Number.isFinite(cz))) {
            return null;
        }
        return Math.max(Math.abs(px - cx), Math.abs(pz - cz));
    }

    _resolveBiomeTilingLodAtDistance({
        applied = null,
        distanceMeters = null,
        fallbackSegments = 1
    } = {}) {
        const appliedCfg = applied && typeof applied === 'object' ? applied : null;
        const mode = String(appliedCfg?.mode ?? 'uniform') === 'adaptive_rings' ? 'adaptive_rings' : 'uniform';
        const uniformSeg = Math.max(
            1,
            Math.round(
                Number(appliedCfg?.segmentsPerTile)
                || Number(this._terrainSpec?.segmentsPerTile)
                || Number(fallbackSegments)
                || 1
            )
        );
        if (!appliedCfg || appliedCfg.enabled === false || mode !== 'adaptive_rings') {
            return {
                zone: 'uniform',
                blend: 0,
                quadsPerTile: uniformSeg * uniformSeg,
                segmentsPerTile: uniformSeg,
                distanceTiles: 0,
                distanceMeters: 0
            };
        }

        const d = Math.max(0, Number(distanceMeters) || 0);
        const tileSize = Math.max(EPS, Number(this._terrainGrid?.tileSize) || Number(this._terrainSpec?.tileSize) || 24);
        const distanceTiles = d / tileSize;
        const thresholdsTiles = Array.isArray(appliedCfg?.lodThresholdTiles)
            ? appliedCfg.lodThresholdTiles
            : getBiomeTilingLodPresetThresholdsTiles(appliedCfg?.detailPreset);
        const quadsPerTile = resolveBiomeTilingLodQuadsForDistanceTiles(distanceTiles, thresholdsTiles);
        const seg = Math.max(1, Math.round(Math.sqrt(quadsPerTile)));
        const zone = `q${quadsPerTile}`;
        return {
            zone,
            blend: 0,
            quadsPerTile,
            segmentsPerTile: seg,
            distanceTiles,
            distanceMeters: d
        };
    }

    _computeBiomeTilingLodProbe({ cameraX = null, cameraZ = null } = {}) {
        const cx = Number(cameraX);
        const cz = Number(cameraZ);
        if (!(Number.isFinite(cx) && Number.isFinite(cz))) return null;

        const applied = this._biomeTilingAppliedGeometryState ?? null;
        if (!applied || typeof applied !== 'object') return null;
        const requestedAdaptiveEnabled = this._biomeTilingState?.geometryDensity?.enabled !== false;

        const mode = String(applied.mode ?? 'uniform') === 'adaptive_rings' ? 'adaptive_rings' : 'uniform';
        const uniformSeg = Math.max(1, Math.round(Number(applied.segmentsPerTile) || Number(this._terrainSpec?.segmentsPerTile) || 1));
        if (!requestedAdaptiveEnabled || applied.enabled === false || mode !== 'adaptive_rings') {
            return {
                zone: 'uniform',
                blend: 0,
                quadsPerTile: uniformSeg * uniformSeg,
                segmentsPerTile: uniformSeg,
                distanceTiles: 0,
                distanceMeters: 0
            };
        }

        const centerX = Number.isFinite(Number(applied.centerX)) ? Number(applied.centerX) : 0;
        const centerZ = Number.isFinite(Number(applied.centerZ)) ? Number(applied.centerZ) : 0;
        const ringDistance = this._computeBiomeTilingRingDistance({
            x: cx,
            z: cz,
            centerX,
            centerZ
        });
        if (ringDistance === null) return null;
        const resolved = this._resolveBiomeTilingLodAtDistance({
            applied,
            distanceMeters: ringDistance,
            fallbackSegments: uniformSeg
        });
        return {
            zone: String(resolved?.zone ?? 'uniform'),
            blend: Number(resolved?.blend) || 0,
            quadsPerTile: Number(resolved?.quadsPerTile) || (uniformSeg * uniformSeg),
            segmentsPerTile: Number(resolved?.segmentsPerTile) || uniformSeg,
            distanceTiles: Number(resolved?.distanceTiles) || 0,
            distanceMeters: Number(resolved?.distanceMeters) || 0
        };
    }

    _updateBiomeTilingLodMonitor({ nowMs = performance.now() } = {}) {
        const monitor = this._biomeTilingLodMonitor;
        if (!monitor || typeof monitor !== 'object') return;

        const requestedAdaptiveEnabled = this._biomeTilingState?.geometryDensity?.enabled !== false;
        const adaptiveActive = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING
            && requestedAdaptiveEnabled
            && this._biomeTilingAppliedGeometryState?.enabled !== false
            && String(this._biomeTilingAppliedGeometryState?.mode ?? 'uniform') === 'adaptive_rings';
        if (!adaptiveActive || !this.camera?.position) {
            if ((monitor.samples?.length ?? 0) > 0 || (monitor.lastSampleMs || 0) > 0) {
                this._resetBiomeTilingLodMonitor({
                    windowSec: monitor.windowSec
                });
            }
            return;
        }

        const t = Number.isFinite(Number(nowMs)) ? Number(nowMs) : performance.now();
        const sampleIntervalMs = Math.max(16, Number(monitor.sampleIntervalMs) || BIOME_TILING_LOD_MONITOR_SAMPLE_MS);
        const lastMs = Number(monitor.lastSampleMs) || 0;
        if (lastMs > 0 && (t - lastMs) < sampleIntervalMs) return;

        const probe = this._computeBiomeTilingLodProbe({
            cameraX: Number(this.camera.position.x),
            cameraZ: Number(this.camera.position.z)
        });
        if (!probe) return;

        monitor.lastSampleMs = t;
        monitor.samples = Array.isArray(monitor.samples) ? monitor.samples : [];
        monitor.samples.push({
            timeMs: t,
            zone: probe.zone,
            blend: probe.blend,
            segmentsPerTile: probe.segmentsPerTile,
            distanceMeters: probe.distanceMeters
        });

        const windowSec = Math.max(1, Number(monitor.windowSec) || BIOME_TILING_LOD_MONITOR_WINDOW_SEC);
        const windowMs = windowSec * 1000;
        while (monitor.samples.length > 1 && (t - Number(monitor.samples[0]?.timeMs || t)) > windowMs) {
            monitor.samples.shift();
        }
    }

    _maybeAutoRebuildBiomeTilingDisplacementOverlay({ nowMs = performance.now() } = {}) {
        if (this._terrainViewMode !== TERRAIN_VIEW_MODE.BIOME_TILING) return;
        if (this._flyover?.active) {
            this._syncBiomeTilingDiagnosticsUi();
            return;
        }

        const geometryCfg = this._biomeTilingState?.geometryDensity ?? null;
        if (geometryCfg?.enabled === false) {
            this._syncBiomeTilingDiagnosticsUi();
            return;
        }
        const cadence = normalizeBiomeTilingRebuildCadence(
            geometryCfg?.rebuildCadence,
            { fallbackSeconds: 1.0 }
        );
        const cadenceSeconds = getBiomeTilingRebuildCadenceSeconds(cadence, 1.0);

        if (cadence !== this._biomeTilingAutoRebuildCadence) {
            this._biomeTilingAutoRebuildCadence = cadence;
            this._biomeTilingAutoRebuildFrameCounter = 0;
            this._biomeTilingAutoRebuildLastMs = 0;
        }
        if (cadence === 'off') {
            this._syncBiomeTilingDiagnosticsUi();
            return;
        }

        const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : performance.now();
        const lastFollowMs = Number(this._biomeTilingOverlayFollowLastMs) || 0;
        if (lastFollowMs > 0 && Math.abs(now - lastFollowMs) < 0.1) {
            this._syncBiomeTilingDiagnosticsUi();
            return;
        }

        let shouldRebuild = false;
        if (cadence === 'frame') {
            shouldRebuild = true;
        } else if (cadence === 'frame_2' || cadence === 'frame_8') {
            const everyFrames = cadence === 'frame_2' ? 2 : 8;
            const nextCounter = (Math.max(0, Math.round(Number(this._biomeTilingAutoRebuildFrameCounter) || 0)) + 1) % everyFrames;
            this._biomeTilingAutoRebuildFrameCounter = nextCounter;
            shouldRebuild = nextCounter === 0;
        } else {
            const lastRebuildMs = Number(this._biomeTilingAutoRebuildLastMs) || 0;
            shouldRebuild = cadenceSeconds !== null
                && (lastRebuildMs <= 0 || (now - lastRebuildMs) >= (cadenceSeconds * 1000));
        }
        if (!shouldRebuild) {
            this._syncBiomeTilingDiagnosticsUi();
            return;
        }

        const startMs = performance.now();
        this._captureBiomeTilingAppliedGeometryStateFromRequest({ geometryCfg });
        const result = this._syncBiomeTilingDisplacementOverlay({
            forceRebuild: false,
            allowCreate: true,
            allowRebuild: true,
            refreshViewportMask: false
        });
        this._syncBiomeTilingBaseTerrainVisibility();
        if (result?.rebuilt) {
            this._biomeTilingAutoRebuildLastMs = now;
            this._biomeTilingLastGeometryApplyMs = performance.now() - startMs;
            this._syncBiomeTilingAdaptiveRingHelper();
            this._syncBiomeTilingTileLodDebugHelper();
        } else {
            this._syncBiomeTilingTileLodDebugHelper();
        }
        if (!result?.rebuilt && cadenceSeconds !== null && cadenceSeconds > EPS) {
            this._biomeTilingAutoRebuildLastMs = now;
        }
        this._syncBiomeTilingDiagnosticsUi();
    }

    _maybeFollowBiomeTilingDisplacementOverlay({ nowMs = performance.now() } = {}) {
        // Disabled on purpose: center updates are cadence-driven via auto-rebuild.
        // This keeps "No auto updates" fully static and prevents out-of-band tile swaps.
        void nowMs;
    }

    _getBiomeTilingLodMonitorStats({ nowMs = performance.now() } = {}) {
        const monitor = this._biomeTilingLodMonitor;
        if (!monitor || typeof monitor !== 'object') return null;
        const samplesRaw = Array.isArray(monitor.samples) ? monitor.samples : [];
        if (!samplesRaw.length) return null;

        const t = Number.isFinite(Number(nowMs)) ? Number(nowMs) : performance.now();
        const windowSec = Math.max(1, Number(monitor.windowSec) || BIOME_TILING_LOD_MONITOR_WINDOW_SEC);
        const windowMs = windowSec * 1000;
        const samples = samplesRaw.filter((sample) => (t - Number(sample?.timeMs || t)) <= windowMs);
        if (!samples.length) return null;

        const counts = { near: 0, transition: 0, far: 0 };
        let boundaryCrossings = 0;
        let popCandidates = 0;
        let maxSegmentsDeltaPerSec = 0;
        for (let i = 0; i < samples.length; i++) {
            const sample = samples[i];
            const zone = String(sample?.zone ?? '');
            if (zone === 'near' || zone === 'transition' || zone === 'far') counts[zone]++;
            if (i <= 0) continue;
            const prev = samples[i - 1];
            const prevZone = String(prev?.zone ?? '');
            if (zone !== prevZone) boundaryCrossings++;
            const currTime = Number(sample?.timeMs) || 0;
            const prevTime = Number(prev?.timeMs) || 0;
            const dtSec = Math.max(EPS, (currTime - prevTime) / 1000);
            const currSeg = Number(sample?.segmentsPerTile) || 0;
            const prevSeg = Number(prev?.segmentsPerTile) || 0;
            const segDeltaPerSec = Math.abs(currSeg - prevSeg) / dtSec;
            if (segDeltaPerSec > maxSegmentsDeltaPerSec) maxSegmentsDeltaPerSec = segDeltaPerSec;
            if (segDeltaPerSec >= BIOME_TILING_LOD_POP_CANDIDATE_SEG_DELTA_PER_SEC) popCandidates++;
        }

        const total = Math.max(1, samples.length);
        const latest = samples[samples.length - 1];
        return {
            windowSec,
            activeZone: String(latest?.zone ?? 'n/a'),
            activeBlend: Number(latest?.blend),
            activeSegmentsPerTile: Number(latest?.segmentsPerTile),
            activeDistanceMeters: Number(latest?.distanceMeters),
            nearPct: (counts.near / total) * 100,
            transitionPct: (counts.transition / total) * 100,
            farPct: (counts.far / total) * 100,
            boundaryCrossings,
            popCandidates,
            maxSegmentsDeltaPerSec
        };
    }

    _buildBiomeTransitionSourceMap({ bounds, biome1, biome2 } = {}) {
        const b = bounds && typeof bounds === 'object' ? bounds : null;
        if (!b) return null;
        const idA = TERRAIN_BIOME_IDS.includes(String(biome1 ?? '')) ? String(biome1) : 'grass';
        const idB = TERRAIN_BIOME_IDS.includes(String(biome2 ?? '')) ? String(biome2) : 'land';
        const indexA = idA === 'stone' ? 0 : idA === 'grass' ? 1 : 2;
        const indexB = idB === 'stone' ? 0 : idB === 'grass' ? 1 : 2;

        const width = 3;
        const height = 3;
        const key = [
            `${Number(b.minX).toFixed(3)},${Number(b.maxX).toFixed(3)},${Number(b.minZ).toFixed(3)},${Number(b.maxZ).toFixed(3)}`,
            `${idA}|${idB}`
        ].join('|');
        if (this._terrainBiomeSourceMap && this._terrainBiomeSourceMapKey === key) return this._terrainBiomeSourceMap;

        const data = new Uint8Array(width * height);
        let idx = 0;
        for (let iz = 0; iz < height; iz++) {
            for (let ix = 0; ix < width; ix++) {
                if (ix === 0) data[idx++] = indexA;
                else data[idx++] = indexB;
            }
        }

        this._terrainBiomeSourceMap = {
            width,
            height,
            data,
            bounds: {
                minX: Number(b.minX) || 0,
                maxX: Number(b.maxX) || 0,
                minZ: Number(b.minZ) || 0,
                maxZ: Number(b.maxZ) || 0
            }
        };
        this._terrainBiomeSourceMapKey = key;
        this._terrainEngineMaskDirty = true;
        return this._terrainBiomeSourceMap;
    }

    _buildBiomeTilingSourceMap({ bounds, biomeId } = {}) {
        const b = bounds && typeof bounds === 'object' ? bounds : null;
        if (!b) return null;
        const id = TERRAIN_BIOME_IDS.includes(String(biomeId ?? '')) ? String(biomeId) : 'land';
        const index = id === 'stone' ? 0 : id === 'grass' ? 1 : 2;
        const key = [
            `${Number(b.minX).toFixed(3)},${Number(b.maxX).toFixed(3)},${Number(b.minZ).toFixed(3)},${Number(b.maxZ).toFixed(3)}`,
            `tiling|${id}`
        ].join('|');
        if (this._terrainBiomeSourceMap && this._terrainBiomeSourceMapKey === key) return this._terrainBiomeSourceMap;

        this._terrainBiomeSourceMap = {
            width: 1,
            height: 1,
            data: new Uint8Array([index]),
            bounds: {
                minX: Number(b.minX) || 0,
                maxX: Number(b.maxX) || 0,
                minZ: Number(b.minZ) || 0,
                maxZ: Number(b.maxZ) || 0
            }
        };
        this._terrainBiomeSourceMapKey = key;
        this._terrainEngineMaskDirty = true;
        return this._terrainBiomeSourceMap;
    }

    _updateTerrainPbrLegendUi() {
        const ui = this._ui;
        if (!ui?.setTerrainPbrLegend) return;
        const entries = [];
        for (const biome of TERRAIN_BIOME_IDS) {
            const row = this._terrainBiomeHumidityBindings?.[biome] ?? {};
            for (const slot of TERRAIN_HUMIDITY_SLOT_IDS) {
                const materialId = String(row?.[slot] ?? DEFAULT_TERRAIN_BIOME_HUMIDITY_PBR_BINDINGS?.[biome]?.[slot] ?? '');
                const urls = resolvePbrMaterialUrls(materialId);
                entries.push({
                    biomeId: biome,
                    humiditySlotId: slot,
                    materialId,
                    previewUrl: urls?.baseColorUrl ?? ''
                });
            }
        }
        ui.setTerrainPbrLegend(entries);
    }

    _syncTerrainBiomePbrMapsOnStandardMaterial() {
        const mat = this._terrainMat;
        if (!mat) return;
        const terrainPbrState = this._ui?.getState?.()?.terrain?.pbr ?? null;
        const terrainLocalPbrOverrides = buildTerrainLocalPbrOverrides(terrainPbrState);
        const terrainBounds = this._getTerrainBoundsXZ();
        const uvAnchorX = Number.isFinite(Number(terrainBounds?.minX)) ? Number(terrainBounds.minX) : 0;
        const uvAnchorZ = Number.isFinite(Number(terrainBounds?.minZ)) ? Number(terrainBounds.minZ) : 0;
        mat.userData = mat.userData ?? {};
        mat.userData.terrainUvAnchor = this._terrainUvAnchorVec2.set(uvAnchorX, uvAnchorZ);

        const bindings = this._terrainBiomeHumidityBindings ?? DEFAULT_TERRAIN_BIOME_HUMIDITY_PBR_BINDINGS;
        const blendCfg = this._terrainHumidityBlendConfig ?? DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG;
        const sampled = {};
        const physicalSlots = [];
        const physicalKeyParts = [];
        const keyParts = [];
        const resolvedPayloadById = new Map();
        const getResolvedPayload = (materialId) => {
            const key = String(materialId ?? '').trim();
            if (!key) return null;
            if (resolvedPayloadById.has(key)) return resolvedPayloadById.get(key);
            const payload = this._resolvePbrMaterialPayload(key, {
                cloneTextures: false,
                localOverrides: terrainLocalPbrOverrides,
                repeat: { x: 1.0, y: 1.0 },
                diagnosticsTag: 'TerrainDebuggerView.syncTerrainBiomePbrMaps'
            });
            resolvedPayloadById.set(key, payload ?? null);
            return payload ?? null;
        };
        for (const biome of TERRAIN_BIOME_IDS) {
            sampled[biome] = {};
            const row = bindings?.[biome] ?? {};
            for (const slot of TERRAIN_HUMIDITY_SLOT_IDS) {
                const id = String(row?.[slot] ?? DEFAULT_TERRAIN_BIOME_HUMIDITY_PBR_BINDINGS?.[biome]?.[slot] ?? '');
                const resolved = getResolvedPayload(id);
                const urls = resolved?.urls ?? null;
                const textures = resolved?.textures ?? {};
                const mapLoaded = textures.baseColor ?? null;
                const fallback = FALLBACK_TERRAIN_BIOME_MAPS[biome] ?? FALLBACK_TERRAIN_BIOME_MAPS.land;
                const resolvedTileMeters = Number(resolved?.overrides?.effective?.tileMeters);
                const fallbackTileMeters = Number(resolved?.meta?.tileMeters ?? getPbrMaterialMeta(id)?.tileMeters);
                const tile = Math.max(
                    EPS,
                    (Number.isFinite(resolvedTileMeters) ? resolvedTileMeters : fallbackTileMeters) || 4.0
                );
                sampled[biome][slot] = {
                    id,
                    map: mapLoaded ?? fallback,
                    mapLoaded,
                    ormMap: textures.orm ?? null,
                    baseColorUrl: urls?.baseColorUrl ?? 'fallback',
                    normalUrl: urls?.normalUrl ?? '',
                    ormUrl: urls?.ormUrl ?? '',
                    aoUrl: urls?.aoUrl ?? '',
                    roughnessUrl: urls?.roughnessUrl ?? '',
                    metalnessUrl: urls?.metalnessUrl ?? '',
                    tile
                };
                physicalSlots.push({
                    normalUrl: sampled[biome][slot].normalUrl,
                    ormUrl: sampled[biome][slot].ormUrl,
                    aoUrl: sampled[biome][slot].aoUrl,
                    roughnessUrl: sampled[biome][slot].roughnessUrl,
                    metalnessUrl: sampled[biome][slot].metalnessUrl
                });
                physicalKeyParts.push(
                    sampled[biome][slot].normalUrl,
                    sampled[biome][slot].ormUrl,
                    sampled[biome][slot].aoUrl,
                    sampled[biome][slot].roughnessUrl,
                    sampled[biome][slot].metalnessUrl
                );
                keyParts.push(
                    sampled[biome][slot].baseColorUrl,
                    sampled[biome][slot].normalUrl,
                    sampled[biome][slot].ormUrl,
                    sampled[biome][slot].aoUrl,
                    sampled[biome][slot].roughnessUrl,
                    sampled[biome][slot].metalnessUrl,
                    tile.toFixed(4)
                );
            }
        }
        const physicalKey = physicalKeyParts.join('|');
        keyParts.push(
            Number(blendCfg.dryMax).toFixed(4),
            Number(blendCfg.wetMin).toFixed(4),
            Number(blendCfg.blendBand).toFixed(4),
            Number(blendCfg.edgeNoiseScale).toFixed(5),
            Number(blendCfg.edgeNoiseStrength).toFixed(4)
        );
        const tilingViewActive = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING;
        const tilingState = this._biomeTilingState ?? BIOME_TILING_DEFAULT_STATE;
        const distCfg = tilingState.distanceTiling && typeof tilingState.distanceTiling === 'object'
            ? tilingState.distanceTiling
            : BIOME_TILING_DEFAULT_STATE.distanceTiling;
        const varCfg = tilingState.variation && typeof tilingState.variation === 'object'
            ? tilingState.variation
            : BIOME_TILING_DEFAULT_STATE.variation;
        const dispCfg = tilingState.displacement && typeof tilingState.displacement === 'object'
            ? tilingState.displacement
            : BIOME_TILING_DEFAULT_STATE.displacement;
        const distanceEnabled = tilingViewActive && distCfg.enabled !== false;
        const distanceNearScale = clamp(distCfg.nearScale, 0.1, 6.0, BIOME_TILING_DEFAULT_STATE.distanceTiling.nearScale);
        const distanceFarScale = clamp(distCfg.farScale, 0.01, 2.0, BIOME_TILING_DEFAULT_STATE.distanceTiling.farScale);
        const distanceBlendStart = clamp(distCfg.blendStartMeters, 0.0, 500.0, BIOME_TILING_DEFAULT_STATE.distanceTiling.blendStartMeters);
        const distanceBlendEnd = Math.max(distanceBlendStart + 1.0, clamp(distCfg.blendEndMeters, 0.0, 2000.0, BIOME_TILING_DEFAULT_STATE.distanceTiling.blendEndMeters));
        const distanceBlendCurve = clamp(distCfg.blendCurve, 0.35, 3.0, BIOME_TILING_DEFAULT_STATE.distanceTiling.blendCurve);
        const rawDistanceDebug = String(distCfg.debugView ?? BIOME_TILING_DEFAULT_STATE.distanceTiling.debugView);
        const distanceDebugView = rawDistanceDebug === 'near' || rawDistanceDebug === 'far' ? rawDistanceDebug : 'blended';
        const distanceDebugModeCode = distanceDebugView === 'near' ? 1.0 : distanceDebugView === 'far' ? 2.0 : 0.0;
        const antiEnabled = tilingViewActive && varCfg.antiTilingEnabled === true;
        const antiStrength = clamp(varCfg.antiTilingStrength, 0.0, 2.0, BIOME_TILING_DEFAULT_STATE.variation.antiTilingStrength);
        const antiCellMeters = clamp(varCfg.antiTilingCellMeters, 0.25, 12.0, BIOME_TILING_DEFAULT_STATE.variation.antiTilingCellMeters);
        const macroEnabled = tilingViewActive && varCfg.macroVariationEnabled === true;
        const macroStrength = clamp(varCfg.macroVariationStrength, 0.0, 0.8, BIOME_TILING_DEFAULT_STATE.variation.macroVariationStrength);
        const macroScale = clamp(varCfg.macroVariationScale, 0.002, 0.2, BIOME_TILING_DEFAULT_STATE.variation.macroVariationScale);
        const variationNearIntensity = clamp(varCfg.nearIntensity, 0.0, 2.0, BIOME_TILING_DEFAULT_STATE.variation.nearIntensity);
        const variationFarIntensity = clamp(varCfg.farIntensity, 0.0, 2.0, BIOME_TILING_DEFAULT_STATE.variation.farIntensity);
        const displacementEnabled = tilingViewActive && dispCfg.enabled === true;
        const displacementStrength = clamp(dispCfg.strength, 0.0, 0.2, BIOME_TILING_DEFAULT_STATE.displacement.strength);
        const displacementBias = clamp(dispCfg.bias, -10.0, 10.0, BIOME_TILING_DEFAULT_STATE.displacement.bias);
        const displacementSourceRaw = String(dispCfg.source ?? BIOME_TILING_DEFAULT_STATE.displacement.source);
        const displacementSource = (displacementSourceRaw === 'displacement' || displacementSourceRaw === 'ao' || displacementSourceRaw === 'orm')
            ? displacementSourceRaw
            : 'auto';
        const displacementDebugRaw = String(dispCfg.debugView ?? BIOME_TILING_DEFAULT_STATE.displacement.debugView);
        const displacementDebugView = (displacementDebugRaw === 'wireframe' || displacementDebugRaw === 'displacement')
            ? displacementDebugRaw
            : 'standard';
        const fragmentToggleState = this._resolveBiomeTilingFragmentToggleState(this._getBiomeTilingPerformanceState());
        const fragmentEffective = fragmentToggleState.effective;
        const adaptiveTerrainEnabled = tilingViewActive && this._biomeTilingState?.geometryDensity?.enabled !== false;
        if (adaptiveTerrainEnabled) {
            this._syncBiomeTilingDisplacementOverlay({
                forceRebuild: false,
                allowCreate: false,
                allowRebuild: false
            });
        } else {
            this._hideBiomeTilingDisplacementOverlay();
        }
        this._syncBiomeTilingBaseTerrainVisibility();
        this._ensureBiomeTilingDisplacementOverlayMaterial();
        this._syncBiomeTilingDisplacementOverlayMaterialFromTerrain();
        const displacementTargetMaterial = adaptiveTerrainEnabled
            ? this._biomeTilingDisplacementOverlayMat
            : this._terrainMat;
        keyParts.push(
            tilingViewActive ? 'tiling' : 'default',
            distanceEnabled ? '1' : '0',
            distanceNearScale.toFixed(4),
            distanceFarScale.toFixed(4),
            distanceBlendStart.toFixed(2),
            distanceBlendEnd.toFixed(2),
            distanceBlendCurve.toFixed(3),
            distanceDebugView,
            antiEnabled ? '1' : '0',
            antiStrength.toFixed(3),
            antiCellMeters.toFixed(3),
            macroEnabled ? '1' : '0',
            macroStrength.toFixed(3),
            macroScale.toFixed(5),
            variationNearIntensity.toFixed(3),
            variationFarIntensity.toFixed(3),
            displacementEnabled ? '1' : '0',
            displacementStrength.toFixed(3),
            displacementBias.toFixed(3),
            displacementSource,
            displacementDebugView,
            fragmentEffective.fragmentShaderEnabled ? '1' : '0',
            fragmentEffective.fragmentShaderBiomeEnabled ? '1' : '0',
            fragmentEffective.fragmentShaderPbrLightingEnabled ? '1' : '0',
            fragmentEffective.fragmentShaderAlbedoEnabled ? '1' : '0',
            fragmentEffective.fragmentShaderSurfaceEnabled ? '1' : '0'
        );
        const allIds = [];
        for (const biome of TERRAIN_BIOME_IDS) {
            for (const slot of TERRAIN_HUMIDITY_SLOT_IDS) allIds.push(String(sampled?.[biome]?.[slot]?.id ?? ''));
        }
        const firstId = String(allIds[0] ?? '');
        const allSameMaterial = !!firstId && allIds.every((id) => id === firstId);
        const physicalSourceId = allSameMaterial ? firstId : String(sampled?.land?.neutral?.id ?? firstId ?? '');
        const displacementMaterialId = String(
            allSameMaterial
                ? firstId
                : (tilingState?.materialId ?? physicalSourceId ?? '')
        );
        const applyPhysicalSourceToTerrainMaterial = () => {
            if (!physicalSourceId) {
                const forceRoughnessVec = mat.userData.terrainForceRoughness?.isVector2
                    ? mat.userData.terrainForceRoughness
                    : new THREE.Vector2(0.0, 1.0);
                forceRoughnessVec.set(0.0, 1.0);
                mat.userData.terrainForceRoughness = forceRoughnessVec;
                return;
            }
            const resolved = getResolvedPayload(physicalSourceId);
            const textures = resolved?.textures ?? {};
            const effective = resolved?.overrides?.effective ?? {};
            const nextNormal = textures.normal ?? null;
            const nextOrm = textures.orm ?? null;
            const nextAo = nextOrm ?? textures.ao ?? null;
            const nextRoughness = nextOrm ?? textures.roughness ?? null;
            mat.userData.terrainBaseNormalMap = nextNormal;
            mat.userData.terrainBaseAoMap = nextAo;
            mat.userData.terrainBaseRoughnessMap = nextRoughness;
            const roughnessRemap = normalizeTerrainRoughnessRemap(effective.roughnessRemap ?? null);
            const forceRoughnessEnabled = !!(roughnessRemap && Math.abs(roughnessRemap.max - roughnessRemap.min) <= EPS);
            const forceRoughnessValue = forceRoughnessEnabled
                ? clamp(roughnessRemap.min, 0.0, 1.0, 1.0)
                : 1.0;
            const forceRoughnessVec = mat.userData.terrainForceRoughness?.isVector2
                ? mat.userData.terrainForceRoughness
                : new THREE.Vector2(0.0, 1.0);
            forceRoughnessVec.set(forceRoughnessEnabled ? 1.0 : 0.0, forceRoughnessValue);
            mat.userData.terrainForceRoughness = forceRoughnessVec;
            // Terrain should remain non-metallic in biome blend mode; keep physical detail from
            // normal/roughness/AO without introducing metallic darkening.
            const nextMetalnessMap = null;
            const nextMetalness = 0.0;
            const useBiomeSurface = tilingViewActive
                && (this.renderer?.capabilities?.isWebGL2 === true)
                && fragmentEffective.fragmentShaderEnabled
                && fragmentEffective.fragmentShaderBiomeEnabled
                && fragmentEffective.fragmentShaderSurfaceEnabled
                && fragmentEffective.fragmentShaderPbrLightingEnabled;
            const useBaseSurface = !useBiomeSurface
                && (
                    !fragmentEffective.fragmentShaderEnabled
                    || (fragmentEffective.fragmentShaderSurfaceEnabled && !fragmentEffective.fragmentShaderBiomeEnabled)
                );
            const nextNormalMap = useBaseSurface ? nextNormal : null;
            const nextAoMap = useBaseSurface ? nextAo : null;
            const nextRoughnessMap = useBaseSurface ? nextRoughness : null;
            let changed = false;

            if (mat.normalMap !== nextNormalMap) { mat.normalMap = nextNormalMap; changed = true; }
            if (mat.aoMap !== nextAoMap) { mat.aoMap = nextAoMap; changed = true; }
            if (mat.roughnessMap !== nextRoughnessMap) { mat.roughnessMap = nextRoughnessMap; changed = true; }
            if (mat.metalnessMap !== nextMetalnessMap) { mat.metalnessMap = nextMetalnessMap; changed = true; }
            if (Math.abs((Number(mat.metalness) || 0) - nextMetalness) > 1e-6) {
                mat.metalness = nextMetalness;
                changed = true;
            }
            if (applyTerrainPbrDetailOverridesToMaterial(mat, effective)) changed = true;
            if (applyTerrainAlbedoOverridesToMaterial(mat, effective)) changed = true;

            if (changed) mat.needsUpdate = true;
        };
        keyParts.push(`phys:${physicalSourceId}`);
        const key = keyParts.join('|');
        if (key === this._terrainBiomePbrKey) {
            applyPhysicalSourceToTerrainMaterial();
            syncTerrainBiomeBlendUniformsOnMaterial(mat);
            const displacementStartMs = performance.now();
            this._applyBiomeTilingDisplacementState({
                materialId: displacementMaterialId,
                displacementCfg: {
                    enabled: displacementEnabled,
                    strength: displacementStrength,
                    bias: displacementBias,
                    source: displacementSource,
                    debugView: displacementDebugView
                },
                tilingViewActive,
                material: displacementTargetMaterial
            });
            this._clearBiomeTilingDisplacementStateForMaterial(this._terrainMat);
            this._biomeTilingLastDisplacementUpdateMs = performance.now() - displacementStartMs;
            this._applyBiomeTilingDisplacementDebugView();
            this._syncBiomeTilingDiagnosticsUi();
            return;
        }
        this._terrainBiomePbrKey = key;

        mat.userData = mat.userData ?? {};
        // Keep albedo samplers compact (3 total) for lower-end GPUs with 16 fragment units.
        mat.userData.terrainBiomeMapStone = sampled.stone.neutral.map;
        mat.userData.terrainBiomeMapGrass = sampled.grass.neutral.map;
        mat.userData.terrainBiomeMapLand = sampled.land.neutral.map;
        mat.userData.terrainBiomeOrmStone = sampled.stone.neutral.ormMap ?? FALLBACK_TERRAIN_BIOME_ORM_MAPS.stone;
        mat.userData.terrainBiomeOrmGrass = sampled.grass.neutral.ormMap ?? FALLBACK_TERRAIN_BIOME_ORM_MAPS.grass;
        mat.userData.terrainBiomeOrmLand = sampled.land.neutral.ormMap ?? FALLBACK_TERRAIN_BIOME_ORM_MAPS.land;
        mat.userData.terrainBiomeUvScaleStone = this._terrainBiomeUvScaleStoneVec3.set(
            1 / sampled.stone.dry.tile,
            1 / sampled.stone.neutral.tile,
            1 / sampled.stone.wet.tile
        );
        mat.userData.terrainBiomeUvScaleGrass = this._terrainBiomeUvScaleGrassVec3.set(
            1 / sampled.grass.dry.tile,
            1 / sampled.grass.neutral.tile,
            1 / sampled.grass.wet.tile
        );
        mat.userData.terrainBiomeUvScaleLand = this._terrainBiomeUvScaleLandVec3.set(
            1 / sampled.land.dry.tile,
            1 / sampled.land.neutral.tile,
            1 / sampled.land.wet.tile
        );
        {
            const renderer = this.renderer ?? null;
            const isWebGL2 = !!renderer?.capabilities?.isWebGL2;
            const hasSrgbExt = !!renderer?.extensions?.has?.('EXT_sRGB');
            // If sRGB textures cannot be uploaded, we must decode in shader. Otherwise sampling yields linear.
            mat.userData.terrainDecodeSrgbAlbedo = (!isWebGL2 && !hasSrgbExt) ? 1.0 : 0.0;
        }
        mat.userData.terrainHumidityThresholds = this._terrainHumidityThresholdsVec4.set(
            Number(blendCfg.dryMax) || DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.dryMax,
            Number(blendCfg.wetMin) || DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.wetMin,
            Number(blendCfg.blendBand) || DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.blendBand,
            0.0
        );
        mat.userData.terrainHumidityEdgeNoise = this._terrainHumidityEdgeNoiseVec4.set(
            Number(blendCfg.edgeNoiseScale) || DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.edgeNoiseScale,
            Number(blendCfg.edgeNoiseStrength) || DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.edgeNoiseStrength,
            0.0,
            0.0
        );
        mat.userData.terrainHumidityEdgeNoiseTex = FALLBACK_TERRAIN_HUMIDITY_EDGE_NOISE_TEX;
        mat.userData.terrainTilingDistance0 = this._terrainTilingDistance0Vec4.set(
            distanceNearScale,
            distanceFarScale,
            distanceBlendStart,
            distanceBlendEnd
        );
        mat.userData.terrainTilingDistance1 = this._terrainTilingDistance1Vec4.set(
            distanceBlendCurve,
            distanceDebugModeCode,
            distanceEnabled ? 1.0 : 0.0,
            0.0
        );
        mat.userData.terrainTilingVariation0 = this._terrainTilingVariation0Vec4.set(
            antiEnabled ? 1.0 : 0.0,
            antiStrength,
            antiCellMeters,
            macroEnabled ? 1.0 : 0.0
        );
        mat.userData.terrainTilingVariation1 = this._terrainTilingVariation1Vec4.set(
            macroStrength,
            macroScale,
            variationNearIntensity,
            variationFarIntensity
        );

        const nextBaseMap = sampled.land.neutral.mapLoaded ?? null;
        let nextAlbedoMap = nextBaseMap;
        if (tilingViewActive && fragmentEffective.fragmentShaderEnabled) {
            const useBaseAlbedo = fragmentEffective.fragmentShaderAlbedoEnabled
                && !fragmentEffective.fragmentShaderBiomeEnabled;
            nextAlbedoMap = useBaseAlbedo ? nextBaseMap : null;
        }
        if (mat.map !== nextAlbedoMap) {
            mat.map = nextAlbedoMap;
            mat.needsUpdate = true;
        }

        // Keep physical shading maps in sync with the active material context.
        // When all biome/humidity slots point to one material, use that exact PBR stack.
        // Otherwise keep using Land/Neutral as the representative physical source.
        applyPhysicalSourceToTerrainMaterial();

        this._queueTerrainBiomePhysicalArrayRebuild({ key: physicalKey, slots: physicalSlots });
        syncTerrainBiomeBlendUniformsOnMaterial(mat);
        this._syncBiomeTilingDisplacementOverlayMaterialFromTerrain();
        const displacementStartMs = performance.now();
        this._applyBiomeTilingDisplacementState({
            materialId: displacementMaterialId,
            displacementCfg: {
                enabled: displacementEnabled,
                strength: displacementStrength,
                bias: displacementBias,
                source: displacementSource,
                debugView: displacementDebugView
            },
            tilingViewActive,
            material: displacementTargetMaterial
        });
        this._clearBiomeTilingDisplacementStateForMaterial(this._terrainMat);
        this._biomeTilingLastDisplacementUpdateMs = performance.now() - displacementStartMs;
        this._applyBiomeTilingDisplacementDebugView();
        this._updateTerrainPbrLegendUi();
        this._syncBiomeTilingDiagnosticsUi();
    }

    _queueTerrainBiomePhysicalArrayRebuild({ key, slots } = {}) {
        const mat = this._terrainMat;
        const renderer = this.renderer;
        if (!mat || !renderer) return;

        const safeKey = typeof key === 'string' ? key : '';
        const list = Array.isArray(slots) ? slots : [];

        // Texture arrays require WebGL2; keep the old single-source material maps as the fallback.
        if (!renderer.capabilities?.isWebGL2) {
            if (safeKey) this._terrainBiomePhysicalArrayKey = safeKey;
            if (mat.userData) {
                mat.userData.terrainBiomeNormalArrayTex = null;
                mat.userData.terrainBiomeOrmArrayTex = null;
            }
            syncTerrainBiomeBlendUniformsOnMaterial(mat);
            this._syncBiomeTilingDisplacementOverlayMaterialFromTerrain();
            return;
        }

        if (safeKey && safeKey === this._terrainBiomePhysicalArrayKey) return;
        this._terrainBiomePhysicalArrayKey = safeKey;

        const requestId = ++this._terrainBiomePhysicalArrayRequestId;
        const size = Math.max(8, Math.min(2048, Math.round(Number(this._terrainBiomePhysicalArraySize) || 512)));
        const payload = {
            key: safeKey,
            requestId,
            size,
            // Ensure a stable depth (stone/grass/land x dry/neutral/wet).
            slots: list.length === 9 ? list.slice(0, 9) : list.slice(0, 9)
        };

        this._terrainBiomePhysicalArrayPromise = this._rebuildTerrainBiomePhysicalArrays(payload).catch((err) => {
            console.warn('[TerrainDebugger] Failed to rebuild terrain biome physical arrays', err);
        });
    }

    async _rebuildTerrainBiomePhysicalArrays({ requestId, size, slots } = {}) {
        const renderer = this.renderer;
        const mat = this._terrainMat;
        if (!renderer || !mat) return;
        if (!renderer.capabilities?.isWebGL2) return;

        const safeSize = Math.max(8, Math.min(2048, Math.round(Number(size) || 512)));
        const depth = 9;
        const layerCount = Math.max(0, Math.min(depth, Array.isArray(slots) ? slots.length : 0));
        const layerBytes = safeSize * safeSize * 4;

        const fillLayerSolid = (dst, offset, r, g, b, a) => {
            const rr = r & 255;
            const gg = g & 255;
            const bb = b & 255;
            const aa = a & 255;
            for (let i = 0; i < layerBytes; i += 4) {
                dst[offset + i] = rr;
                dst[offset + i + 1] = gg;
                dst[offset + i + 2] = bb;
                dst[offset + i + 3] = aa;
            }
        };

        const normalLayers = [];
        const ormLayers = [];
        for (let i = 0; i < layerCount; i++) {
            const slot = slots[i] && typeof slots[i] === 'object' ? slots[i] : {};
            normalLayers.push(this._getTerrainBiomeImageRgba(slot.normalUrl, { size: safeSize }));
            ormLayers.push(this._getTerrainBiomePackedOrmRgba(slot, { size: safeSize }));
        }

        const [normalDataList, ormDataList] = await Promise.all([
            Promise.all(normalLayers),
            Promise.all(ormLayers)
        ]);

        // Cancel if a newer rebuild started while we were loading images.
        if (requestId !== this._terrainBiomePhysicalArrayRequestId) return;

        const normalData = new Uint8Array(layerBytes * depth);
        const ormData = new Uint8Array(layerBytes * depth);

        for (let layer = 0; layer < depth; layer++) {
            const dstOff = layer * layerBytes;
            const n = normalDataList[layer] ?? null;
            const o = ormDataList[layer] ?? null;

            if (n && n.length === layerBytes) normalData.set(n, dstOff);
            else fillLayerSolid(normalData, dstOff, 128, 128, 255, 255);

            if (o && o.length === layerBytes) ormData.set(o, dstOff);
            else fillLayerSolid(ormData, dstOff, 255, 255, 0, 255);
        }

        const nextNormalTex = new THREE.DataArrayTexture(normalData, safeSize, safeSize, depth);
        nextNormalTex.wrapS = THREE.RepeatWrapping;
        nextNormalTex.wrapT = THREE.RepeatWrapping;
        nextNormalTex.magFilter = THREE.LinearFilter;
        nextNormalTex.minFilter = THREE.LinearFilter;
        nextNormalTex.generateMipmaps = false;
        nextNormalTex.anisotropy = 1;
        applyTextureColorSpace(nextNormalTex, { srgb: false });
        nextNormalTex.needsUpdate = true;

        const nextOrmTex = new THREE.DataArrayTexture(ormData, safeSize, safeSize, depth);
        nextOrmTex.wrapS = THREE.RepeatWrapping;
        nextOrmTex.wrapT = THREE.RepeatWrapping;
        nextOrmTex.magFilter = THREE.LinearFilter;
        nextOrmTex.minFilter = THREE.LinearFilter;
        nextOrmTex.generateMipmaps = false;
        nextOrmTex.anisotropy = 1;
        applyTextureColorSpace(nextOrmTex, { srgb: false });
        nextOrmTex.needsUpdate = true;

        // Cancel check again before swapping textures in.
        if (requestId !== this._terrainBiomePhysicalArrayRequestId) {
            nextNormalTex.dispose?.();
            nextOrmTex.dispose?.();
            return;
        }

        this._terrainBiomeNormalArrayTex?.dispose?.();
        this._terrainBiomeOrmArrayTex?.dispose?.();
        this._terrainBiomeNormalArrayTex = nextNormalTex;
        this._terrainBiomeOrmArrayTex = nextOrmTex;

        mat.userData = mat.userData ?? {};
        mat.userData.terrainBiomeNormalArrayTex = nextNormalTex;
        mat.userData.terrainBiomeOrmArrayTex = nextOrmTex;
        syncTerrainBiomeBlendUniformsOnMaterial(mat);
        this._syncBiomeTilingDisplacementOverlayMaterialFromTerrain();
    }

    async _getTerrainBiomeImageRgba(url, { size } = {}) {
        const safeUrl = typeof url === 'string' && url ? url : null;
        if (!safeUrl) return null;

        const safeSize = Math.max(8, Math.min(2048, Math.round(Number(size) || 512)));
        const key = `${safeSize}|${safeUrl}`;
        const cached = this._terrainBiomeImageRgbaCache?.get?.(key) ?? null;
        if (cached) return cached;

        const promise = (async () => {
            try {
                const img = await new Promise((resolve) => {
                    const el = new Image();
                    el.crossOrigin = 'anonymous';
                    el.onload = () => resolve(el);
                    el.onerror = () => resolve(null);
                    el.src = safeUrl;
                });
                if (!img) return null;

                const canvas = (typeof OffscreenCanvas !== 'undefined')
                    ? new OffscreenCanvas(safeSize, safeSize)
                    : document.createElement('canvas');
                canvas.width = safeSize;
                canvas.height = safeSize;
                const ctx = canvas.getContext?.('2d', { willReadFrequently: true }) ?? null;
                if (!ctx) return null;

                ctx.imageSmoothingEnabled = true;
                ctx.clearRect(0, 0, safeSize, safeSize);
                ctx.drawImage(img, 0, 0, safeSize, safeSize);
                const src = ctx.getImageData(0, 0, safeSize, safeSize).data;

                // Flip Y to match how THREE.TextureLoader uploads with flipY=true.
                const out = new Uint8Array(safeSize * safeSize * 4);
                const rowBytes = safeSize * 4;
                for (let y = 0; y < safeSize; y++) {
                    const srcOff = y * rowBytes;
                    const dstOff = (safeSize - 1 - y) * rowBytes;
                    out.set(src.subarray(srcOff, srcOff + rowBytes), dstOff);
                }
                return out;
            } catch {
                return null;
            }
        })();

        this._terrainBiomeImageRgbaCache?.set?.(key, promise);
        return promise;
    }

    async _getTerrainBiomePackedOrmRgba(slot, { size } = {}) {
        const safeSize = Math.max(8, Math.min(2048, Math.round(Number(size) || 512)));
        const src = slot && typeof slot === 'object' ? slot : {};
        const ormUrl = typeof src.ormUrl === 'string' && src.ormUrl ? src.ormUrl : '';
        const aoUrl = typeof src.aoUrl === 'string' && src.aoUrl ? src.aoUrl : '';
        const roughUrl = typeof src.roughnessUrl === 'string' && src.roughnessUrl ? src.roughnessUrl : '';
        const metalUrl = typeof src.metalnessUrl === 'string' && src.metalnessUrl ? src.metalnessUrl : '';

        if (ormUrl) return this._getTerrainBiomeImageRgba(ormUrl, { size: safeSize });

        const cacheKey = `${safeSize}|${aoUrl}|${roughUrl}|${metalUrl}`;
        const cached = this._terrainBiomePackedOrmCache?.get?.(cacheKey) ?? null;
        if (cached) return cached;

        const promise = (async () => {
            const [ao, rough, metal] = await Promise.all([
                aoUrl ? this._getTerrainBiomeImageRgba(aoUrl, { size: safeSize }) : null,
                roughUrl ? this._getTerrainBiomeImageRgba(roughUrl, { size: safeSize }) : null,
                metalUrl ? this._getTerrainBiomeImageRgba(metalUrl, { size: safeSize }) : null
            ]);

            const out = new Uint8Array(safeSize * safeSize * 4);
            const hasAo = ao && ao.length === out.length;
            const hasRough = rough && rough.length === out.length;
            const hasMetal = metal && metal.length === out.length;
            for (let i = 0; i < out.length; i += 4) {
                out[i] = hasAo ? ao[i] : 255;
                out[i + 1] = hasRough ? rough[i] : 255;
                out[i + 2] = hasMetal ? metal[i] : 0;
                out[i + 3] = 255;
            }
            return out;
        })();

        this._terrainBiomePackedOrmCache?.set?.(cacheKey, promise);
        return promise;
    }

    _ensureTerrainDebugMaterial() {
        if (this._terrainDebugMat) return;
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: null });
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = 1;
        mat.polygonOffsetUnits = 1;
        // Debug view colors should be stable regardless of exposure / tone mapping settings.
        mat.toneMapped = false;
        this._terrainDebugMat = mat;
    }

    _updateTerrainDebugTextureFromExport(res, { mode } = {}) {
        const dbgMode = String(mode ?? 'standard');
        if (dbgMode === 'standard') return;
        if (!res) return;
        const packed = res?.rgba;
        const patchIds = res?.patchIds;
        const texW = Number(res?.width) || 0;
        const texH = Number(res?.height) || 0;
        if (!(packed instanceof Uint8Array) || packed.length < texW * texH * 4) return;
        if (!(patchIds instanceof Uint32Array) || patchIds.length < texW * texH) return;

        const pairKey = String(this._biomeTransitionState?.pairKey ?? 'grass|land');
        const viewKey = (dbgMode === 'transition_band' || BIOME_TRANSITION_DEBUG_MODES.has(dbgMode))
            ? this._terrainEngineMaskViewKey
            : 'static';
        const key = `${dbgMode}|${this._terrainEngineMaskKey}|${viewKey}|${BIOME_TRANSITION_DEBUG_MODES.has(dbgMode) ? pairKey : ''}|${dbgMode === 'pair_compare' ? this._terrainEngineCompareKey : ''}|${texW}x${texH}`;
        if (key === this._terrainDebugTexKey && this._terrainDebugTex) return;
        this._terrainDebugTexKey = key;

        const out = new Uint8Array(texW * texH * 4);
        const biomeBase = [
            [150, 150, 150],
            [70, 160, 78],
            [215, 145, 70]
        ];
        const pairParts = pairKey.split('|');
        const pairBiomeA = TERRAIN_BIOME_IDS.includes(pairParts[0]) ? pairParts[0] : 'grass';
        const pairBiomeB = TERRAIN_BIOME_IDS.includes(pairParts[1]) ? pairParts[1] : 'land';
        const pairIdxA = pairBiomeA === 'stone' ? 0 : pairBiomeA === 'grass' ? 1 : 2;
        const pairIdxB = pairBiomeB === 'stone' ? 0 : pairBiomeB === 'grass' ? 1 : 2;
        const transitionDebug = res?.transitionDebug && typeof res.transitionDebug === 'object' ? res.transitionDebug : {};
        const falloffWeight = transitionDebug?.falloffWeight instanceof Float32Array ? transitionDebug.falloffWeight : null;
        const noiseOffsetMeters = transitionDebug?.noiseOffsetMeters instanceof Float32Array ? transitionDebug.noiseOffsetMeters : null;

        const toTransitionColor = (srcPacked, i) => {
            const p = Math.max(0, Math.min(2, srcPacked[i] | 0));
            const q = Math.max(0, Math.min(2, srcPacked[i + 1] | 0));
            const blend = clamp((srcPacked[i + 2] | 0) / 255, 0, 1, 0);
            const c0 = biomeBase[p];
            const c1 = biomeBase[q];
            return {
                r: Math.max(0, Math.min(255, Math.round(c0[0] + (c1[0] - c0[0]) * blend))),
                g: Math.max(0, Math.min(255, Math.round(c0[1] + (c1[1] - c0[1]) * blend))),
                b: Math.max(0, Math.min(255, Math.round(c0[2] + (c1[2] - c0[2]) * blend)))
            };
        };

        if (dbgMode === 'biome_id') {
            for (let i = 0; i < packed.length; i += 4) {
                const idx = Math.max(0, Math.min(2, packed[i] | 0));
                const c = biomeBase[idx];
                out[i] = c[0];
                out[i + 1] = c[1];
                out[i + 2] = c[2];
                out[i + 3] = 255;
            }
        } else if (dbgMode === 'humidity') {
            for (let i = 0; i < packed.length; i += 4) {
                const h = (packed[i + 3] | 0) / 255;
                const t = clamp(h, 0, 1, 0);
                let r;
                let g;
                let b;
                if (t < 0.5) {
                    const u = t / 0.5;
                    r = 255 + (70 - 255) * u;
                    g = 242 + (160 - 242) * u;
                    b = 170 + (78 - 170) * u;
                } else {
                    const u = (t - 0.5) / 0.5;
                    r = 70 + (20 - 70) * u;
                    g = 160 + (90 - 160) * u;
                    b = 78 + (35 - 78) * u;
                }
                out[i] = Math.max(0, Math.min(255, Math.round(r)));
                out[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
                out[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
                out[i + 3] = 255;
            }
        } else if (dbgMode === 'transition_band') {
            const blendCfg = this._terrainHumidityBlendConfig ?? DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG;
            const dryMax = clamp(blendCfg.dryMax, 0.05, 0.49, DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.dryMax);
            const wetMin = clamp(blendCfg.wetMin, 0.51, 0.95, DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.wetMin);
            const edgeBand = Math.max(EPS, clamp(blendCfg.blendBand, 0.005, 0.25, DEFAULT_TERRAIN_HUMIDITY_BLEND_CONFIG.blendBand) * 0.5);
            for (let i = 0; i < packed.length; i += 4) {
                const biomeBlend = (packed[i + 2] | 0) / 255;
                const biomeBand = clamp(4 * biomeBlend * (1 - biomeBlend), 0, 1, 0);
                const h = clamp((packed[i + 3] | 0) / 255, 0, 1, 0);
                const humDryBand = Math.max(0, 1 - Math.abs(h - dryMax) / edgeBand);
                const humWetBand = Math.max(0, 1 - Math.abs(h - wetMin) / edgeBand);
                const humidityBand = Math.max(humDryBand, humWetBand);
                const band = Math.max(biomeBand, humidityBand);
                const v = Math.max(0, Math.min(255, Math.round(clamp(band, 0, 1, 0) * 255)));
                out[i] = v;
                out[i + 1] = v;
                out[i + 2] = v;
                out[i + 3] = 255;
            }
        } else if (dbgMode === 'transition_result') {
            for (let i = 0; i < packed.length; i += 4) {
                const c = toTransitionColor(packed, i);
                out[i] = c.r;
                out[i + 1] = c.g;
                out[i + 2] = c.b;
                out[i + 3] = 255;
            }
        } else if (dbgMode === 'transition_weight') {
            for (let i = 0; i < packed.length; i += 4) {
                const v = packed[i + 2] | 0;
                out[i] = v;
                out[i + 1] = v;
                out[i + 2] = v;
                out[i + 3] = 255;
            }
        } else if (dbgMode === 'transition_falloff') {
            const len = texW * texH;
            for (let idx = 0; idx < len; idx++) {
                const i = idx * 4;
                const value = falloffWeight ? clamp(falloffWeight[idx], 0, 1, 0) : ((packed[i + 2] | 0) / 255);
                const v = Math.max(0, Math.min(255, Math.round(value * 255)));
                out[i] = v;
                out[i + 1] = v;
                out[i + 2] = v;
                out[i + 3] = 255;
            }
        } else if (dbgMode === 'transition_noise') {
            const len = texW * texH;
            let maxAbs = 0;
            if (noiseOffsetMeters) {
                for (let idx = 0; idx < len; idx++) maxAbs = Math.max(maxAbs, Math.abs(Number(noiseOffsetMeters[idx]) || 0));
            }
            if (!(maxAbs > EPS)) maxAbs = 1;
            for (let idx = 0; idx < len; idx++) {
                const i = idx * 4;
                const n = noiseOffsetMeters ? (Number(noiseOffsetMeters[idx]) || 0) : 0;
                const t = clamp(0.5 + (n / maxAbs) * 0.5, 0, 1, 0.5);
                const r = Math.max(0, Math.min(255, Math.round(t * 255)));
                const b2 = Math.max(0, Math.min(255, Math.round((1 - t) * 255)));
                out[i] = r;
                out[i + 1] = Math.max(0, Math.min(255, Math.round((1 - Math.abs(0.5 - t) * 2) * 180)));
                out[i + 2] = b2;
                out[i + 3] = 255;
            }
        } else if (dbgMode === 'pair_isolation') {
            for (let i = 0; i < packed.length; i += 4) {
                const p = Math.max(0, Math.min(2, packed[i] | 0));
                const q = Math.max(0, Math.min(2, packed[i + 1] | 0));
                const pair = makeBiomePairKey(biomeIdFromIndex(p), biomeIdFromIndex(q));
                const blendRaw = clamp((packed[i + 2] | 0) / 255, 0, 1, 0);
                if (pair === pairKey && p !== q) {
                    const blend = (p === pairIdxA && q === pairIdxB) ? blendRaw : (1 - blendRaw);
                    const c0 = biomeBase[pairIdxA];
                    const c1 = biomeBase[pairIdxB];
                    out[i] = Math.max(0, Math.min(255, Math.round(c0[0] + (c1[0] - c0[0]) * blend)));
                    out[i + 1] = Math.max(0, Math.min(255, Math.round(c0[1] + (c1[1] - c0[1]) * blend)));
                    out[i + 2] = Math.max(0, Math.min(255, Math.round(c0[2] + (c1[2] - c0[2]) * blend)));
                    out[i + 3] = 255;
                } else {
                    const c = biomeBase[p];
                    out[i] = Math.max(0, Math.min(255, Math.round(c[0] * 0.18)));
                    out[i + 1] = Math.max(0, Math.min(255, Math.round(c[1] * 0.18)));
                    out[i + 2] = Math.max(0, Math.min(255, Math.round(c[2] * 0.18)));
                    out[i + 3] = 255;
                }
            }
        } else if (dbgMode === 'pair_compare') {
            const compareRes = this._terrainEngineCompareExport ?? null;
            const comparePacked = compareRes?.rgba instanceof Uint8Array && compareRes.rgba.length >= packed.length
                ? compareRes.rgba
                : null;
            for (let iz = 0; iz < texH; iz++) {
                for (let ix = 0; ix < texW; ix++) {
                    const idx = iz * texW + ix;
                    const i = idx * 4;
                    const useBaseline = comparePacked && ix < (texW * 0.5);
                    const c = toTransitionColor(useBaseline ? comparePacked : packed, i);
                    out[i] = c.r;
                    out[i + 1] = c.g;
                    out[i + 2] = c.b;
                    out[i + 3] = 255;
                }
            }
            const dividerX = Math.floor(texW * 0.5);
            for (let iz = 0; iz < texH; iz++) {
                const idx = iz * texW + dividerX;
                const i = idx * 4;
                out[i] = 255;
                out[i + 1] = 255;
                out[i + 2] = 255;
                out[i + 3] = 255;
            }
        } else if (dbgMode === 'patch_ids') {
            for (let iz = 0; iz < texH; iz++) {
                for (let ix = 0; ix < texW; ix++) {
                    const pIdx = iz * texW + ix;
                    const baseIdx = pIdx * 4;
                    const id = patchIds[pIdx] >>> 0;
                    const h = mixU32(id);
                    const rr = 60 + (h & 0xbf);
                    const gg = 60 + ((h >>> 8) & 0xbf);
                    const bb = 60 + ((h >>> 16) & 0xbf);
                    let r = rr;
                    let g = gg;
                    let b = bb;
                    const leftDifferent = ix > 0 && patchIds[pIdx - 1] !== id;
                    const upDifferent = iz > 0 && patchIds[pIdx - texW] !== id;
                    if (leftDifferent || upDifferent) {
                        r = 0;
                        g = 0;
                        b = 0;
                    }
                    out[baseIdx] = r;
                    out[baseIdx + 1] = g;
                    out[baseIdx + 2] = b;
                    out[baseIdx + 3] = 255;
                }
            }
        } else {
            return;
        }

        let tex = this._terrainDebugTex;
        if (!tex || tex.image?.width !== texW || tex.image?.height !== texH) {
            tex?.dispose?.();
            tex = new THREE.DataTexture(out, texW, texH);
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.minFilter = THREE.NearestFilter;
            tex.magFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
            applyTextureColorSpace(tex, { srgb: true });
            this._terrainDebugTex = tex;
        } else {
            tex.image.data = out;
        }

        // Terrain geometry uses world-space XZ in its UV attribute. Remap world coords -> [0..1] so the
        // debug texture covers the entire bounds instead of clamping at u/v = 0/1.
        const tb = res?.bounds ?? null;
        if (tb && Number.isFinite(tb.minX) && Number.isFinite(tb.maxX) && Number.isFinite(tb.minZ) && Number.isFinite(tb.maxZ)) {
            const sizeX = Number(tb.maxX) - Number(tb.minX);
            const sizeZ = Number(tb.maxZ) - Number(tb.minZ);
            if (sizeX > EPS && sizeZ > EPS && tex?.repeat?.set && tex?.offset?.set) {
                tex.repeat.set(1 / sizeX, 1 / sizeZ);
                tex.offset.set(-Number(tb.minX) / sizeX, -Number(tb.minZ) / sizeZ);
            }
        }

        tex.needsUpdate = true;

        this._ensureTerrainDebugMaterial();
        if (this._terrainDebugMat) {
            this._terrainDebugMat.map = tex;
            this._terrainDebugMat.needsUpdate = true;
        }
    }

    _syncTerrainMeshMaterialForDebugMode(res) {
        const mesh = this._terrain;
        if (!mesh) return;
        const mode = String(this._terrainDebugMode ?? 'standard');
        if (mode === 'standard' || mode === 'transition_result') {
            if (mesh.material !== this._terrainMat) mesh.material = this._terrainMat;
            this._applyVisualizationToggles();
            return;
        }

        this._updateTerrainDebugTextureFromExport(res, { mode });
        this._ensureTerrainDebugMaterial();
        if (mesh.material !== this._terrainDebugMat && this._terrainDebugMat) mesh.material = this._terrainDebugMat;
        this._applyVisualizationToggles();
    }

    _exportPackedMaskForProfileOverride({ config, pairKey, profile, width, height, viewOrigin } = {}) {
        const cfg = config && typeof config === 'object' ? config : null;
        const key = String(pairKey ?? '').trim();
        if (!cfg || !key) return null;
        const baseTransition = cfg.transition && typeof cfg.transition === 'object' ? cfg.transition : {};
        const baseProfiles = baseTransition.pairProfiles && typeof baseTransition.pairProfiles === 'object'
            ? baseTransition.pairProfiles
            : {};
        const nextProfiles = { ...baseProfiles };
        nextProfiles[key] = sanitizeBiomeTransitionProfile(profile, baseTransition.profileDefaults ?? BIOME_TRANSITION_DEFAULT_PROFILE);
        const overrideConfig = {
            ...cfg,
            transition: {
                ...baseTransition,
                pairProfiles: nextProfiles
            }
        };
        const temp = createTerrainEngine(overrideConfig);
        try {
            temp.setSourceMaps({
                biome: this._terrainBiomeSourceMap ?? null,
                humidity: this._terrainHumiditySourceMap ?? null
            });
            return temp.exportPackedMaskRgba8({ width, height, viewOrigin });
        } finally {
            temp.dispose();
        }
    }

    _updateTerrainEngineMasks({ nowMs } = {}) {
        const engine = this._terrainEngine;
        const mat = this._terrainMat;
        const bounds = this._getTerrainBoundsXZ();
        if (!engine || !mat || !bounds) return;

        const now = Number.isFinite(nowMs) ? nowMs : performance.now();
        const texW = TERRAIN_ENGINE_MASK_TEX_SIZE;
        const texH = TERRAIN_ENGINE_MASK_TEX_SIZE;

        const debugMode = String(this._terrainDebugMode ?? 'standard');
        const viewDependent = !(debugMode === 'biome_id' || debugMode === 'patch_ids' || debugMode === 'humidity');

        const cam = this.camera;
        const cx = Number(cam?.position?.x) || 0;
        const cz = Number(cam?.position?.z) || 0;
        const quant = 1.0;
        const camViewKey = `${(Math.round(cx / quant) * quant).toFixed(1)}|${(Math.round(cz / quant) * quant).toFixed(1)}`;
        const viewKey = viewDependent ? camViewKey : (this._terrainEngineMaskViewKey || 'static');

        const cfg = engine.getConfig();
        const b = cfg?.bounds ?? bounds;
        const p = cfg?.patch ?? {};
        const bio = cfg?.biomes ?? {};
        const w = bio?.weights ?? {};
        const hum = cfg?.humidity ?? {};
        const tr = cfg?.transition ?? {};
        const trDefaults = tr?.profileDefaults ?? BIOME_TRANSITION_DEFAULT_PROFILE;
        const trProfiles = tr?.pairProfiles && typeof tr.pairProfiles === 'object' ? tr.pairProfiles : {};
        const trProfileKey = Object.keys(trProfiles).sort().map((key) => {
            const p = trProfiles[key] ?? {};
            return [
                key,
                String(p.intent ?? ''),
                Number(p.widthScale).toFixed(4),
                Number(p.falloffPower).toFixed(4),
                Number(p.edgeNoiseScale).toFixed(5),
                Number(p.edgeNoiseStrength).toFixed(4),
                Number(p.dominanceBias).toFixed(4),
                Number(p.heightInfluence).toFixed(4),
                Number(p.contrast).toFixed(4)
            ].join(':');
        }).join(';');

        const configKey = [
            String(cfg?.seed ?? ''),
            `${Number(b.minX).toFixed(2)},${Number(b.maxX).toFixed(2)},${Number(b.minZ).toFixed(2)},${Number(b.maxZ).toFixed(2)}`,
            `${Number(p.sizeMeters).toFixed(3)},${Number(p.originX).toFixed(3)},${Number(p.originZ).toFixed(3)},${String(p.layout ?? '')},${Number(p.voronoiJitter).toFixed(4)},${Number(p.warpScale).toFixed(5)},${Number(p.warpAmplitudeMeters).toFixed(3)}`,
            `${String(bio.mode ?? '')},${String(bio.defaultBiomeId ?? '')},${Number(w.stone).toFixed(4)},${Number(w.grass).toFixed(4)},${Number(w.land).toFixed(4)}`,
            `${String(hum.mode ?? '')},${Number(hum.noiseScale).toFixed(6)},${Number(hum.octaves) || 0},${Number(hum.gain).toFixed(4)},${Number(hum.lacunarity).toFixed(4)},${Number(hum.bias).toFixed(4)},${Number(hum.amplitude).toFixed(4)}`,
            `${Number(tr.cameraBlendRadiusMeters).toFixed(3)},${Number(tr.cameraBlendFeatherMeters).toFixed(3)},${Number(tr.boundaryBandMeters).toFixed(3)}`,
            `${String(trDefaults.intent ?? '')},${Number(trDefaults.widthScale).toFixed(4)},${Number(trDefaults.falloffPower).toFixed(4)},${Number(trDefaults.edgeNoiseScale).toFixed(5)},${Number(trDefaults.edgeNoiseStrength).toFixed(4)},${Number(trDefaults.dominanceBias).toFixed(4)},${Number(trDefaults.heightInfluence).toFixed(4)},${Number(trDefaults.contrast).toFixed(4)}`,
            trProfileKey,
            `${texW}x${texH}`
        ].join('|');

        const configChanged = configKey !== this._terrainEngineMaskKey;
        const viewChanged = viewKey !== this._terrainEngineMaskViewKey;

        const wantsDebug = String(this._terrainDebugMode ?? 'standard') !== 'standard';
        if (!this._terrainEngineMaskDirty && !configChanged && !viewChanged) {
            if (wantsDebug) this._syncTerrainMeshMaterialForDebugMode(this._terrainEngineLastExport);
            else this._syncTerrainMeshMaterialForDebugMode(null);
            return;
        }
        if (!this._terrainEngineMaskDirty && !configChanged && viewChanged && now - this._terrainEngineMaskLastMs < 250) {
            if (wantsDebug) this._syncTerrainMeshMaterialForDebugMode(this._terrainEngineLastExport);
            else this._syncTerrainMeshMaterialForDebugMode(null);
            return;
        }

        if (
            Number(b.minX) !== Number(bounds.minX)
            || Number(b.maxX) !== Number(bounds.maxX)
            || Number(b.minZ) !== Number(bounds.minZ)
            || Number(b.maxZ) !== Number(bounds.maxZ)
        ) {
            engine.setConfig({ ...cfg, bounds });
        }

        const res = engine.exportPackedMaskRgba8({ width: texW, height: texH, viewOrigin: { x: cx, z: cz } });
        const packed = res?.rgba;
        const patchIds = res?.patchIds;
        if (!(packed instanceof Uint8Array) || packed.length < texW * texH * 4) return;
        if (!(patchIds instanceof Uint32Array) || patchIds.length < texW * texH) return;

        let tex = this._terrainEngineMaskTex;
        if (!tex || tex.image?.width !== texW || tex.image?.height !== texH) {
            tex?.dispose?.();
            tex = new THREE.DataTexture(packed, texW, texH);
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.minFilter = THREE.NearestFilter;
            tex.magFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
            applyTextureColorSpace(tex, { srgb: false });
            this._terrainEngineMaskTex = tex;
        } else {
            tex.image.data = packed;
        }
        tex.needsUpdate = true;

        const tb = res?.bounds ?? bounds;
        this._terrainEngineBoundsVec4.set(Number(tb.minX) || 0, Number(tb.maxX) || 0, Number(tb.minZ) || 0, Number(tb.maxZ) || 0);

        mat.userData = mat.userData ?? {};
        mat.userData.terrainEngineMaskTex = tex;
        mat.userData.terrainEngineBounds = this._terrainEngineBoundsVec4;
        syncTerrainBiomeBlendUniformsOnMaterial(mat);
        this._syncBiomeTilingDisplacementOverlayMaterialFromTerrain();
        this._syncTerrainBiomePbrMapsOnStandardMaterial();

        this._terrainEngineLastExport = res;
        if (debugMode === 'pair_compare' && this._biomeTransitionState?.compareEnabled) {
            const comparePairKey = String(this._biomeTransitionState?.pairKey ?? '');
            const baselineProfile = this._biomeTransitionState?.baselineProfile ?? null;
            if (comparePairKey && baselineProfile) {
                const baselineKey = JSON.stringify(sanitizeBiomeTransitionProfile(baselineProfile, BIOME_TRANSITION_DEFAULT_PROFILE));
                const compareKey = `${configKey}|${comparePairKey}|${baselineKey}|${camViewKey}`;
                if (compareKey !== this._terrainEngineCompareKey || !this._terrainEngineCompareExport) {
                    this._terrainEngineCompareExport = this._exportPackedMaskForProfileOverride({
                        config: engine.getConfig(),
                        pairKey: comparePairKey,
                        profile: baselineProfile,
                        width: texW,
                        height: texH,
                        viewOrigin: { x: cx, z: cz }
                    });
                    this._terrainEngineCompareKey = compareKey;
                }
            } else {
                this._terrainEngineCompareExport = null;
                this._terrainEngineCompareKey = '';
            }
        } else {
            this._terrainEngineCompareExport = null;
            this._terrainEngineCompareKey = '';
        }
        this._syncTerrainMeshMaterialForDebugMode(res);

        this._terrainEngineMaskKey = configKey;
        this._terrainEngineMaskViewKey = viewKey;
        this._terrainEngineMaskLastMs = now;
        this._terrainEngineMaskDirty = false;
    }

    _updateTerrainHoverSample({ nowMs } = {}) {
        const ui = this._ui;
        const engine = this._terrainEngine;
        const terrain = this._getTerrainRaycastSurface();
        const camera = this.camera;
        if (!ui?.setTerrainSampleInfo || !engine || !terrain || !camera) return;

        const now = Number.isFinite(nowMs) ? nowMs : performance.now();
        if (now - (this._cursorSampleLastMs || 0) < OUTPUT_PANEL_REFRESH_MS) return;
        this._cursorSampleLastMs = now;

        if (!this._cursorValid) {
            this._cursorSample = { hasHit: false, x: 0, y: 0, z: 0, distance: 0 };
            if (this._cursorSampleKey !== 'none') {
                this._cursorSampleKey = 'none';
                ui.setTerrainSampleInfo({});
                ui.setOutputInfo?.({});
            }
            return;
        }

        this._cursorRaycaster.setFromCamera(this._cursorNdc, camera);
        this._cursorHits.length = 0;
        const roads = this._roads?.group?.visible ? this._roads.group : null;
        const raycastTargets = roads ? [terrain, roads] : [terrain];
        this._cursorRaycaster.intersectObjects(raycastTargets, true, this._cursorHits);
        const hit = this._cursorHits[0] ?? null;
        const point = hit?.point ?? null;
        if (!point) {
            this._cursorSample = { hasHit: false, x: 0, y: 0, z: 0, distance: 0 };
            if (this._cursorSampleKey !== 'none') {
                this._cursorSampleKey = 'none';
                ui.setTerrainSampleInfo({});
                ui.setOutputInfo?.({});
            }
            return;
        }

        const x = Number(point.x) || 0;
        const z = Number(point.z) || 0;
        const s = engine.sample(x, z);
        const dist = Number(hit.distance);
        const key = `${(s.patchId >>> 0).toString()}|${String(s.primaryBiomeId)}|${String(s.secondaryBiomeId)}|${Number(s.biomeBlend).toFixed(4)}|${Number(s.humidity).toFixed(4)}`;
        if (key === this._cursorSampleKey) {
            ui.setOutputInfo?.({
                cameraX: camera.position.x,
                cameraY: camera.position.y,
                cameraZ: camera.position.z,
                pointerX: point.x,
                pointerY: point.y,
                pointerZ: point.z,
                pointerDistance: dist
            });
            return;
        }
        this._cursorSampleKey = key;
        this._cursorSample = {
            hasHit: true,
            x: Number(point.x) || 0,
            y: Number(point.y) || 0,
            z: Number(point.z) || 0,
            distance: Number.isFinite(dist) ? dist : 0
        };
        ui.setOutputInfo?.({
            cameraX: camera.position.x,
            cameraY: camera.position.y,
            cameraZ: camera.position.z,
            pointerX: point.x,
            pointerY: point.y,
            pointerZ: point.z,
            pointerDistance: dist
        });

        ui.setTerrainSampleInfo({
            x,
            z,
            patchId: s.patchId >>> 0,
            primaryBiomeId: s.primaryBiomeId,
            secondaryBiomeId: s.secondaryBiomeId,
            biomeBlend: s.biomeBlend,
            humidity: s.humidity
        });
    }

    _applyTerrainEngineUiConfig(state) {
        const engine = this._terrainEngine;
        const src = state && typeof state === 'object' ? state : null;
        if (!engine || !src) return;

        const prev = engine.getConfig();
        const patchSrc = src.patch && typeof src.patch === 'object' ? src.patch : {};
        const biomesSrc = src.biomes && typeof src.biomes === 'object' ? src.biomes : {};
        const humiditySrc = src.humidity && typeof src.humidity === 'object' ? src.humidity : {};
        const humidityCloudSrc = humiditySrc.cloud && typeof humiditySrc.cloud === 'object' ? humiditySrc.cloud : {};
        const materialBindingsSrc = src.materialBindings && typeof src.materialBindings === 'object' ? src.materialBindings : {};
        const biomeBindingsSrc = materialBindingsSrc.biomes && typeof materialBindingsSrc.biomes === 'object' ? materialBindingsSrc.biomes : {};
        const humidityBlendSrc = materialBindingsSrc.humidity && typeof materialBindingsSrc.humidity === 'object' ? materialBindingsSrc.humidity : {};
        const transitionSrc = src.transition && typeof src.transition === 'object' ? src.transition : {};
        const transitionDefaultsSrc = transitionSrc.profileDefaults && typeof transitionSrc.profileDefaults === 'object'
            ? transitionSrc.profileDefaults
            : transitionSrc;
        const prevTransitionDefaults = prev?.transition?.profileDefaults ?? BIOME_TRANSITION_DEFAULT_PROFILE;
        const transitionDefaults = sanitizeBiomeTransitionProfile(transitionDefaultsSrc, prevTransitionDefaults);
        const transitionPairProfilesRaw = transitionSrc.pairProfiles && typeof transitionSrc.pairProfiles === 'object'
            ? transitionSrc.pairProfiles
            : (prev?.transition?.pairProfiles ?? {});
        const transitionPairProfiles = {};
        for (const [rawKey, rawProfile] of Object.entries(transitionPairProfilesRaw)) {
            const key = String(rawKey ?? '').trim();
            if (!key) continue;
            const parts = key.split('|');
            if (parts.length !== 2) continue;
            const pairKey = makeBiomePairKey(parts[0], parts[1]);
            transitionPairProfiles[pairKey] = sanitizeBiomeTransitionProfile(rawProfile, transitionDefaults);
        }

        this._terrainBiomeHumidityBindings = this._sanitizeTerrainBiomeHumidityBindings(biomeBindingsSrc);
        this._terrainHumidityBlendConfig = this._sanitizeTerrainHumidityBlendConfig(humidityBlendSrc);
        this._terrainHumidityCloudConfig = this._sanitizeTerrainHumidityCloudConfig(humidityCloudSrc);
        this._terrainDebugTexKey = '';
        this._terrainEngineCompareExport = null;
        this._terrainEngineCompareKey = '';

        const transitionViewActive = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TRANSITION;
        const tilingViewActive = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING;
        const transitionPair = this._biomeTransitionState ?? {};
        const biome1 = TERRAIN_BIOME_IDS.includes(String(transitionPair.biome1 ?? '')) ? String(transitionPair.biome1) : 'grass';
        let biome2 = TERRAIN_BIOME_IDS.includes(String(transitionPair.biome2 ?? '')) ? String(transitionPair.biome2) : 'land';
        if (biome1 === biome2) biome2 = TERRAIN_BIOME_IDS.find((id) => id !== biome1) ?? 'land';
        const pairKey = makeBiomePairKey(biome1, biome2);
        if (!transitionPairProfiles[pairKey]) transitionPairProfiles[pairKey] = sanitizeBiomeTransitionProfile(null, transitionDefaults);
        const tilingState = this._biomeTilingState ?? BIOME_TILING_DEFAULT_STATE;
        const fallbackTilingMaterialId = String(
            this._terrainBiomeHumidityBindings?.land?.neutral
            ?? DEFAULT_TERRAIN_BIOME_HUMIDITY_PBR_BINDINGS?.land?.neutral
            ?? BIOME_TILING_DEFAULT_STATE.materialId
        );
        const tilingMaterialId = String(tilingState?.materialId ?? '').trim() || fallbackTilingMaterialId;
        if (tilingViewActive) {
            for (const biomeId of TERRAIN_BIOME_IDS) {
                const row = this._terrainBiomeHumidityBindings[biomeId] ?? {};
                for (const slot of TERRAIN_HUMIDITY_SLOT_IDS) row[slot] = tilingMaterialId;
                this._terrainBiomeHumidityBindings[biomeId] = row;
            }
        }

        const boundsFromGrid = this._getTerrainBoundsXZ();
        let nextPatch = { ...prev.patch, ...patchSrc };
        let nextBiomes = { ...prev.biomes, ...biomesSrc };
        let nextTransition = {
            ...prev.transition,
            ...transitionSrc,
            profileDefaults: transitionDefaults,
            pairProfiles: transitionPairProfiles
        };
        if (transitionViewActive) {
            const tileSize = Number(this._terrainGrid?.tileSize) || Number(nextPatch.sizeMeters) || 24;
            const transitionPatchSize = tileSize * 1.5;
            const bounds = boundsFromGrid ?? prev?.bounds ?? null;
            if (bounds) {
                nextPatch = {
                    ...nextPatch,
                    layout: 'grid',
                    sizeMeters: transitionPatchSize,
                    originX: Number(bounds.minX) || 0,
                    originZ: Number(bounds.minZ) || 0
                };
            }
            nextBiomes = {
                ...nextBiomes,
                mode: 'source_map',
                defaultBiomeId: biome1
            };
            nextTransition = {
                ...nextTransition,
                cameraBlendRadiusMeters: Math.max(Number(nextTransition.cameraBlendRadiusMeters) || 0, 2000),
                cameraBlendFeatherMeters: 0,
                boundaryBandMeters: Math.max(Number(nextTransition.boundaryBandMeters) || 0, tileSize * 0.55)
            };
        } else if (tilingViewActive) {
            const tileSize = Number(this._terrainGrid?.tileSize) || Number(nextPatch.sizeMeters) || 24;
            const bounds = boundsFromGrid ?? prev?.bounds ?? null;
            if (bounds) {
                nextPatch = {
                    ...nextPatch,
                    layout: 'grid',
                    sizeMeters: tileSize,
                    originX: Number(bounds.minX) || 0,
                    originZ: Number(bounds.minZ) || 0
                };
            }
            nextBiomes = {
                ...nextBiomes,
                mode: 'source_map',
                defaultBiomeId: 'land'
            };
            nextTransition = {
                ...nextTransition,
                cameraBlendRadiusMeters: 0,
                cameraBlendFeatherMeters: 0,
                boundaryBandMeters: 0
            };
        }

        engine.setConfig({
            ...prev,
            seed: typeof src.seed === 'string' ? src.seed : prev.seed,
            patch: nextPatch,
            biomes: nextBiomes,
            humidity: { ...prev.humidity, ...humiditySrc, mode: 'source_map' },
            transition: nextTransition
        });

        const nextCfg = engine.getConfig();
        const bounds = nextCfg?.bounds ?? prev?.bounds ?? boundsFromGrid;
        const humidityMap = this._buildTerrainHumiditySourceMapFromCloud({
            bounds,
            seed: nextCfg?.seed ?? prev?.seed ?? 'terrain-debugger'
        });
        const sourceMaps = {};
        if (humidityMap) sourceMaps.humidity = humidityMap;
        if (transitionViewActive) {
            const biomeMap = this._buildBiomeTransitionSourceMap({ bounds, biome1, biome2 });
            if (biomeMap) sourceMaps.biome = biomeMap;
        } else if (tilingViewActive) {
            const biomeMap = this._buildBiomeTilingSourceMap({ bounds, biomeId: 'land' });
            if (biomeMap) sourceMaps.biome = biomeMap;
        } else {
            this._terrainBiomeSourceMap = null;
            this._terrainBiomeSourceMapKey = '';
        }
        engine.setSourceMaps(sourceMaps);
        this._syncTerrainBiomePbrMapsOnStandardMaterial();
        this._terrainEngineMaskDirty = true;
    }

    _resolvePbrMaterialPayload(materialId, {
        calibrationOverrides = undefined,
        localOverrides = null,
        cloneTextures = false,
        repeat = null,
        uvSpace = 'meters',
        surfaceSizeMeters = null,
        repeatScale = 1.0,
        diagnosticsTag = 'TerrainDebuggerView'
    } = {}) {
        const id = typeof materialId === 'string' ? materialId.trim() : '';
        if (!id || !this._pbrTextureService) return null;
        return this._pbrTextureService.resolveMaterial(id, {
            calibrationOverrides,
            localOverrides,
            cloneTextures,
            repeat,
            uvSpace,
            surfaceSizeMeters,
            repeatScale,
            diagnosticsTag
        });
    }

    _applyGroundMaterial({ materialId, uv, uvDistance, variation, layers, pbr } = {}) {
        const mat = this._terrainMat;
        if (!mat) return;

        const id = typeof materialId === 'string' ? materialId : '';
        const pbrCfg = pbr && typeof pbr === 'object' ? pbr : {};
        const terrainLocalPbrOverrides = buildTerrainLocalPbrOverrides(pbrCfg);
        const resolved = this._resolvePbrMaterialPayload(id, {
            cloneTextures: false,
            localOverrides: terrainLocalPbrOverrides,
            diagnosticsTag: 'TerrainDebuggerView.applyGroundMaterial'
        });
        const textures = resolved?.textures ?? {};
        const effective = resolved?.overrides?.effective ?? {};

        mat.map = textures.baseColor ?? null;
        mat.normalMap = textures.normal ?? null;

        if (textures.orm) {
            mat.roughnessMap = textures.orm;
            mat.metalnessMap = textures.orm;
            mat.aoMap = textures.orm;
            mat.metalness = Number.isFinite(Number(effective.metalness))
                ? clamp(effective.metalness, 0.0, 1.0, 1.0)
                : 1.0;
        } else {
            mat.aoMap = textures.ao ?? null;
            mat.roughnessMap = textures.roughness ?? null;
            mat.metalnessMap = textures.metalness ?? null;
            mat.metalness = Number.isFinite(Number(effective.metalness))
                ? clamp(effective.metalness, 0.0, 1.0, 0.0)
                : 0.0;
        }

        applyTerrainPbrDetailOverridesToMaterial(mat, effective);
        applyTerrainAlbedoOverridesToMaterial(mat, effective);

        mat.needsUpdate = true;

        const resolvedTileMeters = Number(resolved?.overrides?.effective?.tileMeters);
        const tileMeters = (Number.isFinite(resolvedTileMeters) && resolvedTileMeters > EPS)
            ? resolvedTileMeters
            : (Number(getPbrMaterialMeta(id)?.tileMeters) || 4.0);
        const baseScale = 1.0 / Math.max(EPS, tileMeters);
        const uvCfg = uv && typeof uv === 'object' ? uv : {};
        const scale = clamp(uvCfg.scale, 0.001, 1000.0, 1.0);
        const scaleU = clamp(uvCfg.scaleU, 0.001, 1000.0, 1.0);
        const scaleV = clamp(uvCfg.scaleV, 0.001, 1000.0, 1.0);
        const offsetU = clamp(uvCfg.offsetU, -1000.0, 1000.0, 0.0);
        const offsetV = clamp(uvCfg.offsetV, -1000.0, 1000.0, 0.0);
        const rotationDegrees = clamp(uvCfg.rotationDegrees, -180.0, 180.0, 0.0);

        const uvDistCfg = uvDistance && typeof uvDistance === 'object' ? uvDistance : {};
        const distEnabled = uvDistCfg.enabled !== false;
        const farScale = clamp(uvDistCfg.farScale, 0.001, 1000.0, 0.35);
        const farScaleU = clamp(uvDistCfg.farScaleU, 0.001, 1000.0, 1.0);
        const farScaleV = clamp(uvDistCfg.farScaleV, 0.001, 1000.0, 1.0);
        const blendStartMeters = clamp(uvDistCfg.blendStartMeters, 0.0, 50000.0, 45.0);
        const blendEndMeters = clamp(uvDistCfg.blendEndMeters, 0.0, 50000.0, 220.0);
        const macroWeight = clamp(uvDistCfg.macroWeight, 0.0, 1.0, 1.0);
        const debugView = String(uvDistCfg.debugView ?? 'blended');

        const variationCfg = variation && typeof variation === 'object' ? variation : {};
        const variationNearIntensity = clamp(variationCfg.nearIntensity, 0.0, 20.0, 1.0);
        const variationFarIntensity = clamp(variationCfg.farIntensity, 0.0, 20.0, 0.55);

        const microU = baseScale * scale * scaleU;
        const microV = baseScale * scale * scaleV;
        const macroU = microU * farScale * farScaleU;
        const macroV = microV * farScale * farScaleV;

        if (!mat.userData?.uvTilingConfig) {
            applyUvTilingToMeshStandardMaterial(mat, {
                scaleU: microU,
                scaleV: microV,
                offsetU,
                offsetV,
                rotationDegrees
            });
        } else {
            updateUvTilingOnMeshStandardMaterial(mat, {
                scaleU: microU,
                scaleV: microV,
                offsetU,
                offsetV,
                rotationDegrees
            });
        }

        const rawLayers = Array.isArray(layers) ? layers : [];
        const antiLayers = [];
        const patternLayers = [];
        for (const layer of rawLayers) {
            if (!layer || typeof layer !== 'object') continue;
            const kind = String(layer.kind ?? '');
            if (kind === 'anti_tiling') antiLayers.push(layer);
            else if (kind === 'pattern') patternLayers.push(layer);
        }

        const antiTilingLayers = antiLayers.map((layer) => {
            const enabled = layer.enabled !== false;
            const mode = layer.mode === 'quality' ? 'quality' : 'fast';
            return {
                enabled,
                mode,
                strength: clamp(layer.strength, 0.0, 12.0, 0.55),
                cellSize: clamp(layer.cellSize, 0.1, 100.0, 2.0),
                blendWidth: clamp(layer.blendWidth, 0.0, 0.49, 0.2),
                offsetU: clamp(layer.offsetU, -4.0, 4.0, 0.22),
                offsetV: clamp(layer.offsetV, -4.0, 4.0, 0.22),
                rotationDegrees: clamp(layer.rotationDegrees, 0.0, 180.0, 18.0)
            };
        });
        const primaryAnti = antiTilingLayers.find((l) => l.enabled) ?? antiTilingLayers[0] ?? { enabled: false };

        const patternGroups = {
            contrast: { w: 0, scale: 0, hue: 0, value: 0, sat: 0, rough: 0, normal: 0, cov: 0 },
            linear: { w: 0, scale: 0, hue: 0, value: 0, sat: 0, rough: 0, normal: 0, cov: 0 },
            threshold: { w: 0, scale: 0, hue: 0, value: 0, sat: 0, rough: 0, normal: 0, cov: 0 },
            soft: { w: 0, scale: 0, hue: 0, value: 0, sat: 0, rough: 0, normal: 0, cov: 0 }
        };
        for (const layer of patternLayers) {
            if (layer?.enabled === false) continue;
            const typeRaw = String(layer?.patternType ?? 'linear');
            const type = (typeRaw === 'contrast' || typeRaw === 'threshold' || typeRaw === 'soft') ? typeRaw : 'linear';
            const intensity = clamp(layer?.intensity, 0.0, 20.0, 0.0);
            if (intensity <= EPS) continue;
            const g = patternGroups[type];
            const scale = clamp(layer?.scale, 0.001, 80.0, 1.0);
            const hue = clamp(layer?.hueDegrees, -180.0, 180.0, 0.0);
            const value = clamp(layer?.value, -4.0, 4.0, 0.0);
            const sat = clamp(layer?.saturation, -4.0, 4.0, 0.0);
            const rough = clamp(layer?.roughness, -4.0, 4.0, 0.0);
            const normal = clamp(layer?.normal, -2.0, 2.0, 0.0);
            const cov = clamp(layer?.coverage, 0.0, 1.0, 0.0);
            g.w += intensity;
            g.scale += intensity * scale;
            g.hue += intensity * hue;
            g.value += intensity * value;
            g.sat += intensity * sat;
            g.rough += intensity * rough;
            g.normal += intensity * normal;
            g.cov += intensity * cov;
        }

        const makeMacroLayer = (g, { coverage = false } = {}) => {
            const w = g.w;
            if (!(w > EPS)) return { enabled: false, intensity: 0.0, scale: 1.0, hueDegrees: 0.0, value: 0.0, saturation: 0.0, roughness: 0.0, normal: 0.0, ...(coverage ? { coverage: 0.0 } : {}) };
            const inv = 1.0 / w;
            const layer = {
                enabled: true,
                intensity: w,
                scale: g.scale * inv,
                hueDegrees: g.hue * inv,
                value: g.value * inv,
                saturation: g.sat * inv,
                roughness: g.rough * inv,
                normal: g.normal * inv
            };
            if (coverage) layer.coverage = clamp(g.cov * inv, 0.0, 1.0, 0.0);
            return layer;
        };

        const macroLayers = [
            makeMacroLayer(patternGroups.contrast),
            makeMacroLayer(patternGroups.linear),
            makeMacroLayer(patternGroups.threshold, { coverage: true }),
            makeMacroLayer(patternGroups.soft)
        ];

        const config = {
            enabled: true,
            root: MATERIAL_VARIATION_ROOT.SURFACE,
            space: 'world',
            worldSpaceScale: 0.18,
            objectSpaceScale: 0.18,
            globalIntensity: 1.0,
            tintAmount: 0.0,
            valueAmount: 0.0,
            saturationAmount: 0.0,
            roughnessAmount: 0.0,
            normalAmount: 0.0,
            aoAmount: 0.0,
            texBlend: {
                enabled: distEnabled,
                microTiling: { x: microU, y: microV },
                macroTiling: { x: macroU, y: macroV },
                offset: { x: offsetU, y: offsetV },
                rotationDegrees,
                blendStartMeters,
                blendEndMeters,
                macroWeight,
                debugView,
                variationNearIntensity,
                variationFarIntensity
            },
            macroLayers,
            streaks: { enabled: false, strength: 0.0, scale: 1.0, direction: { x: 0, y: -1, z: 0 }, ledgeStrength: 0.0, ledgeScale: 0.0 },
            exposure: { enabled: false, strength: 0.0, exponent: 1.6, direction: { x: 0.4, y: 0.85, z: 0.2 } },
            wearTop: { enabled: false, strength: 0.0, width: 0.0, scale: 1.0 },
            wearBottom: { enabled: false, strength: 0.0, width: 0.0, scale: 1.0 },
            wearSide: { enabled: false, strength: 0.0, width: 0.0, scale: 1.0 },
            cracks: { enabled: false, strength: 0.0, scale: 1.0 },
            antiTiling: {
                enabled: !!primaryAnti.enabled,
                mode: primaryAnti.mode === 'quality' ? 'quality' : 'fast',
                strength: clamp(primaryAnti.strength, 0.0, 12.0, 0.55),
                cellSize: clamp(primaryAnti.cellSize, 0.1, 100.0, 2.0),
                blendWidth: clamp(primaryAnti.blendWidth, 0.0, 0.49, 0.2),
                offsetU: clamp(primaryAnti.offsetU, -4.0, 4.0, 0.22),
                offsetV: clamp(primaryAnti.offsetV, -4.0, 4.0, 0.22),
                rotationDegrees: clamp(primaryAnti.rotationDegrees, 0.0, 180.0, 18.0)
            },
            antiTilingLayers,
            stairShift: { enabled: false, strength: 0.0, mode: 'stair', direction: 'horizontal', stepSize: 1.0, shift: 0.0 }
        };

        const heightMin = this._terrainBounds?.minY ?? 0;
        const heightMax = this._terrainBounds?.maxY ?? 1;

        if (!mat.userData?.materialVariationConfig) {
            applyMaterialVariationToMeshStandardMaterial(mat, {
                seed: 1337,
                seedOffset: 0,
                heightMin,
                heightMax,
                config,
                root: MATERIAL_VARIATION_ROOT.SURFACE
            });
        } else {
            updateMaterialVariationOnMeshStandardMaterial(mat, {
                seed: 1337,
                seedOffset: 0,
                heightMin,
                heightMax,
                config,
                root: MATERIAL_VARIATION_ROOT.SURFACE
            });
        }

    }

    _captureBiomeTilingAppliedGeometryStateFromRequest({ geometryCfg = null } = {}) {
        const cfg = geometryCfg && typeof geometryCfg === 'object'
            ? geometryCfg
            : (this._biomeTilingState?.geometryDensity ?? BIOME_TILING_DEFAULT_STATE.geometryDensity);
        const adaptiveEnabled = cfg.enabled !== false;
        const detailPreset = normalizeBiomeTilingLodPreset(cfg.detailPreset);
        const thresholdsTiles = getBiomeTilingLodPresetThresholdsTiles(detailPreset);
        const specForBounds = this._buildTerrainSpec();
        const tileSize = Math.max(EPS, Number(specForBounds?.tileSize) || 24);
        const widthTiles = Math.max(1, Math.round(Number(specForBounds?.widthTiles) || 1));
        const depthTiles = Math.max(1, Math.round(Number(specForBounds?.depthTiles) || 1));
        const tileMinX = Math.round(Number(specForBounds?.tileMinX) || 0);
        const tileMinZ = Math.round(Number(specForBounds?.tileMinZ) || 0);
        const minX = (tileMinX - 0.5) * tileSize;
        const minZ = (tileMinZ - 0.5) * tileSize;
        const maxX = minX + widthTiles * tileSize;
        const maxZ = minZ + depthTiles * tileSize;
        let centerX = Number(cfg.centerX);
        let centerZ = Number(cfg.centerZ);
        if (cfg.centerOnApplyCamera !== false && this.camera?.position) {
            centerX = Number(this.camera.position.x);
            centerZ = Number(this.camera.position.z);
        }
        if (!Number.isFinite(centerX)) centerX = (minX + maxX) * 0.5;
        if (!Number.isFinite(centerZ)) centerZ = (minZ + maxZ) * 0.5;
        centerX = clamp(centerX, minX, maxX, centerX);
        centerZ = clamp(centerZ, minZ, maxZ, centerZ);
        const nearRadiusMeters = Math.max(0, thresholdsTiles[0] * tileSize);
        const transitionWidthMeters = Math.max(0, (thresholdsTiles[1] - thresholdsTiles[0]) * tileSize);
        const renderDistanceMeters = Math.max(0, thresholdsTiles[3] * tileSize);
        const waveStrength = clamp(
            cfg.waveStrength,
            0.0,
            1.0,
            BIOME_TILING_DEFAULT_STATE.geometryDensity.waveStrength
        );
        const waveMaxHeightMeters = clamp(
            cfg.waveMaxHeightMeters,
            0.0,
            BIOME_TILING_WAVE_HARD_MAX_HEIGHT_METERS,
            BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxHeightMeters
        );
        const waveMaxNeighborDeltaMeters = clamp(
            cfg.waveMaxNeighborDeltaMeters,
            0.0,
            BIOME_TILING_WAVE_HARD_MAX_NEIGHBOR_DELTA_METERS,
            BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxNeighborDeltaMeters
        );
        const waveMaxTileRangeMeters = clamp(
            cfg.waveMaxTileRangeMeters,
            0.0,
            BIOME_TILING_WAVE_HARD_MAX_TILE_RANGE_METERS,
            BIOME_TILING_DEFAULT_STATE.geometryDensity.waveMaxTileRangeMeters
        );
        this._biomeTilingAppliedGeometryState = {
            enabled: adaptiveEnabled,
            mode: adaptiveEnabled ? 'adaptive_rings' : 'uniform',
            detailPreset,
            lodLevels: BIOME_TILING_LOD_QUAD_LEVELS.slice(),
            lodThresholdTiles: thresholdsTiles.slice(),
            lodBandWidthsMeters: thresholdsTiles.map((t) => Math.max(0, Number(t) * tileSize)),
            lodTileCounts: buildBiomeTilingLodCountsMap(),
            lodTotalQuads: 0,
            segmentsPerTile: 1,
            nearSegmentsPerTile: 16,
            farSegmentsPerTile: 1,
            nearRadiusMeters,
            transitionWidthMeters,
            renderDistanceMeters,
            transitionSmoothing: clamp(
                cfg.transitionSmoothing,
                0.0,
                1.0,
                BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionSmoothing
            ),
            transitionBias: clamp(
                cfg.transitionBias,
                -0.85,
                0.85,
                BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionBias
            ),
            transitionDebugBands: Math.max(
                0,
                Math.min(
                    6,
                    Math.round(Number(cfg.transitionDebugBands) || Number(BIOME_TILING_DEFAULT_STATE.geometryDensity.transitionDebugBands) || 0)
                )
            ),
            waveStrength,
            waveMaxHeightMeters,
            waveMaxNeighborDeltaMeters,
            waveMaxTileRangeMeters,
            ringOverlayEnabled: cfg.ringOverlayEnabled === true,
            overlayBounds: null,
            overlayViewportBounds: null,
            overlayViewportPolygon: null,
            overlayViewportKey: '',
            centerX: adaptiveEnabled ? centerX : 0,
            centerZ: adaptiveEnabled ? centerZ : 0
        };
        this._resetBiomeTilingLodMonitor();
    }

    _applyUiState(state) {
        const s = state && typeof state === 'object' ? state : null;
        if (!s) return;

        if (this.renderer && Number.isFinite(s.exposure)) {
            this.renderer.toneMappingExposure = clamp(s.exposure, 0.01, 20.0, 1.0);
        }

        const camCfg = s.camera && typeof s.camera === 'object' ? s.camera : null;
        if (camCfg && this.camera?.isPerspectiveCamera) {
            const far = clamp(camCfg.drawDistance, 10.0, 50000.0, this.camera.far);
            const key = far.toFixed(3);
            if (key !== this._cameraFarKey) {
                this._cameraFarKey = key;
                this.camera.far = far;
                this.camera.updateProjectionMatrix?.();
                if (this.controls) this.controls.maxDistance = Math.max(this.controls.minDistance, far);
            }
        }
        if (camCfg && this._flyover) {
            this._flyover.loop = !!camCfg.flyoverLoop;
        }

        const terrainCfg = s.terrain && typeof s.terrain === 'object' ? s.terrain : {};
        let rebuildTerrain = false;
        const visualizationCfg = s.visualization && typeof s.visualization === 'object' ? s.visualization : {};
        const nextLandWireframe = !!visualizationCfg.landWireframe;
        const nextAsphaltWireframe = !!visualizationCfg.asphaltWireframe;
        const tabId = String(s.tab ?? '');
        const nextTerrainViewMode = tabId === TERRAIN_VIEW_MODE.BIOME_TRANSITION
            ? TERRAIN_VIEW_MODE.BIOME_TRANSITION
            : tabId === TERRAIN_VIEW_MODE.BIOME_TILING
                ? TERRAIN_VIEW_MODE.BIOME_TILING
                : TERRAIN_VIEW_MODE.DEFAULT;
        if (nextTerrainViewMode !== TERRAIN_VIEW_MODE.BIOME_TILING) {
            this._disableFlyoverDebug();
        }
        if (nextTerrainViewMode !== this._terrainViewMode) {
            this._terrainViewMode = nextTerrainViewMode;
            this._terrainEngineMaskDirty = true;
            this._terrainEngineMaskViewKey = '';
            this._terrainDebugTexKey = '';
            this._terrainEngineCompareExport = null;
            this._terrainEngineCompareKey = '';
            this._terrainBiomeSourceMap = null;
            this._terrainBiomeSourceMapKey = '';
            rebuildTerrain = true;
        }

        const nextBiomeTransitionState = this._sanitizeBiomeTransitionState(terrainCfg.biomeTransition);
        const prevBiomeTransitionState = this._biomeTransitionState ?? null;
        const nextTransitionStateKey = JSON.stringify(nextBiomeTransitionState);
        const prevTransitionStateKey = JSON.stringify(prevBiomeTransitionState ?? {});
        if (nextTransitionStateKey !== prevTransitionStateKey) {
            if (String(prevBiomeTransitionState?.pairKey ?? '') !== String(nextBiomeTransitionState.pairKey ?? '')) {
                this._terrainBiomeSourceMap = null;
                this._terrainBiomeSourceMapKey = '';
            }
            if (String(prevBiomeTransitionState?.debugMode ?? '') !== String(nextBiomeTransitionState.debugMode ?? '')
                || !!prevBiomeTransitionState?.compareEnabled !== !!nextBiomeTransitionState.compareEnabled
                || !!prevBiomeTransitionState?.baselineProfile !== !!nextBiomeTransitionState.baselineProfile) {
                this._terrainEngineCompareExport = null;
                this._terrainEngineCompareKey = '';
            }
            this._terrainDebugTexKey = '';
            this._terrainEngineMaskDirty = true;
            this._biomeTransitionState = nextBiomeTransitionState;
        } else {
            this._biomeTransitionState = nextBiomeTransitionState;
        }

        const nextBiomeTilingState = this._sanitizeBiomeTilingState(terrainCfg.biomeTiling);
        const prevBiomeTilingState = this._biomeTilingState ?? null;
        const nextBiomeTilingStateKey = JSON.stringify(nextBiomeTilingState);
        const prevBiomeTilingStateKey = JSON.stringify(prevBiomeTilingState ?? {});
        const nextBiomeTilingRenderKey = JSON.stringify({
            materialId: nextBiomeTilingState?.materialId ?? '',
            distanceTiling: nextBiomeTilingState?.distanceTiling ?? {},
            variation: nextBiomeTilingState?.variation ?? {},
            displacement: nextBiomeTilingState?.displacement ?? {}
        });
        const prevBiomeTilingRenderKey = JSON.stringify({
            materialId: prevBiomeTilingState?.materialId ?? '',
            distanceTiling: prevBiomeTilingState?.distanceTiling ?? {},
            variation: prevBiomeTilingState?.variation ?? {},
            displacement: prevBiomeTilingState?.displacement ?? {}
        });
        let geometryApplyTriggered = false;
        if (nextBiomeTilingStateKey !== prevBiomeTilingStateKey) {
            this._biomeTilingState = nextBiomeTilingState;
            if (nextBiomeTilingRenderKey !== prevBiomeTilingRenderKey) {
                this._terrainBiomePbrKey = '';
                this._terrainDebugTexKey = '';
                this._terrainEngineMaskDirty = true;
            }
        } else {
            this._biomeTilingState = nextBiomeTilingState;
        }
        this._applyBiomeTilingPerformanceSettings({ force: false });

        {
            const nextApplyNonce = Math.max(0, Math.round(Number(nextBiomeTilingState?.geometryDensity?.applyNonce) || 0));
            if (nextApplyNonce !== this._biomeTilingGeometryApplyNonce) {
                this._biomeTilingGeometryApplyNonce = nextApplyNonce;
                if (this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING) {
                    geometryApplyTriggered = true;
                    const geometryCfg = nextBiomeTilingState?.geometryDensity ?? BIOME_TILING_DEFAULT_STATE.geometryDensity;
                    this._captureBiomeTilingAppliedGeometryStateFromRequest({ geometryCfg });
                }
            }
        }

        {
            const biomeTilingCfg = terrainCfg.biomeTiling && typeof terrainCfg.biomeTiling === 'object' ? terrainCfg.biomeTiling : null;
            this._syncBiomeTilingCalibrationRigDebug({
                enabled: biomeTilingCfg?.calibrationRigDebugEnabled,
                materialId: nextBiomeTilingState.materialId,
                nearScale: nextBiomeTilingState?.distanceTiling?.nearScale
            });
        }

        const layoutCfg = terrainCfg.layout && typeof terrainCfg.layout === 'object' ? terrainCfg.layout : null;
        if (layoutCfg) {
            const prev = this._terrainSpec.layout && typeof this._terrainSpec.layout === 'object' ? this._terrainSpec.layout : {};
            const extraEndTiles = Math.max(0, Math.round(clamp(layoutCfg.extraEndTiles, 0, 100, prev.extraEndTiles ?? 0)));
            const extraSideTiles = Math.max(0, Math.round(clamp(layoutCfg.extraSideTiles, 0, 512, prev.extraSideTiles ?? 0)));
            const key = `${extraEndTiles}|${extraSideTiles}`;
            if (key !== this._terrainLayoutKey) {
                this._terrainLayoutKey = key;
                this._terrainSpec.layout = { ...prev, extraEndTiles, extraSideTiles };
                rebuildTerrain = true;
            }
        }

        const slopeCfg = terrainCfg.slope && typeof terrainCfg.slope === 'object' ? terrainCfg.slope : null;
        if (slopeCfg) {
            const prev = this._terrainSpec.slope && typeof this._terrainSpec.slope === 'object' ? this._terrainSpec.slope : {};
            const leftDeg = clamp(slopeCfg.leftDeg, 0.0, 89.9, prev.leftDeg ?? 1.5);
            const rightDeg = clamp(slopeCfg.rightDeg, 0.0, 89.9, prev.rightDeg ?? 3.5);
            const endDeg = clamp(slopeCfg.endDeg, -89.9, 89.9, prev.endDeg ?? 3.0);
            const endStartAfterRoadTiles = Math.max(0, Math.round(clamp(slopeCfg.endStartAfterRoadTiles, 0, 4096, prev.endStartAfterRoadTiles ?? 0)));
            const key = `${leftDeg.toFixed(3)}|${rightDeg.toFixed(3)}|${endDeg.toFixed(3)}|${endStartAfterRoadTiles}`;
            if (key !== this._terrainSlopeKey) {
                this._terrainSlopeKey = key;
                this._terrainSpec.slope = { ...prev, leftDeg, rightDeg, endDeg, endStartAfterRoadTiles };
                rebuildTerrain = true;
            }
        }

        const cloudCfg = terrainCfg.cloud && typeof terrainCfg.cloud === 'object' ? terrainCfg.cloud : null;
        if (cloudCfg) {
            const prev = this._terrainSpec.cloud && typeof this._terrainSpec.cloud === 'object' ? this._terrainSpec.cloud : {};
            const enabled = cloudCfg.enabled !== false;
            const amplitude = clamp(cloudCfg.amplitude, 0.0, 200.0, prev.amplitude ?? 11.0);
            const worldScale = clamp(cloudCfg.worldScale, 0.0001, 10.0, prev.worldScale ?? 0.1);
            const maxTiles = Math.max(0, Math.round(Number(this._buildTerrainSpec()?.depthTiles) || 0));
            const tiles = Math.max(0, Math.round(clamp(cloudCfg.tiles, 0, maxTiles, prev.tiles ?? 50)));
            const blendMeters = clamp(cloudCfg.blendMeters, 0.0, 1000.0, prev.blendMeters ?? 1000.0);
            const key = `${enabled ? '1' : '0'}|${amplitude.toFixed(3)}|${worldScale.toFixed(5)}|${tiles}|${blendMeters.toFixed(3)}`;
            if (key !== this._terrainCloudKey) {
                this._terrainCloudKey = key;
                this._terrainSpec.cloud = { ...prev, enabled, amplitude, worldScale, tiles, blendMeters };
                rebuildTerrain = true;
            }
        }

        let rebuildTerrainMs = null;
        if (rebuildTerrain) {
            const startMs = performance.now();
            this._rebuildTerrain();
            rebuildTerrainMs = performance.now() - startMs;
        }
        let overlaySyncMs = null;
        if (!rebuildTerrain) {
            const startMs = performance.now();
            this._syncBiomeTilingDisplacementOverlay({
                forceRebuild: geometryApplyTriggered,
                allowCreate: geometryApplyTriggered || !!this._biomeTilingDisplacementOverlay,
                allowRebuild: geometryApplyTriggered,
                refreshViewportMask: false
            });
            overlaySyncMs = performance.now() - startMs;
        }
        this._syncBiomeTilingBaseTerrainVisibility();
        if (geometryApplyTriggered) {
            this._biomeTilingLastGeometryApplyMs = Number.isFinite(rebuildTerrainMs)
                ? rebuildTerrainMs
                : (Number.isFinite(overlaySyncMs) ? overlaySyncMs : 0.0);
        }
        if (this._gridLines) this._gridLines.visible = !!terrainCfg.showGrid;
        if (this._terrainEngine) this._applyTerrainEngineUiConfig(terrainCfg.engine);
        {
            const debugCfg = terrainCfg.debug && typeof terrainCfg.debug === 'object' ? terrainCfg.debug : {};
            const standardModeRaw = String(debugCfg.mode ?? 'standard');
            const standardMode = TERRAIN_DEBUG_MODE_ALLOWED.has(standardModeRaw) ? standardModeRaw : 'standard';
            const transitionModeRaw = String(this._biomeTransitionState?.debugMode ?? 'transition_result');
            const transitionMode = TERRAIN_DEBUG_MODE_ALLOWED.has(transitionModeRaw) ? transitionModeRaw : 'transition_result';
            const nextMode = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TRANSITION
                ? transitionMode
                : this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING
                    ? 'standard'
                    : standardMode;
            const prevMode = String(this._terrainDebugMode ?? 'standard');
            this._terrainDebugMode = nextMode;

            const isViewDependent = (mode) => mode !== 'biome_id' && mode !== 'patch_ids' && mode !== 'humidity';
            const prevViewDependent = isViewDependent(prevMode);
            const nextViewDependent = isViewDependent(nextMode);
            if (!prevViewDependent && nextViewDependent) this._terrainEngineMaskDirty = true;
            if (prevMode !== nextMode) this._terrainDebugTexKey = '';
            if (prevMode === 'pair_compare' || nextMode === 'pair_compare') {
                this._terrainEngineCompareExport = null;
                this._terrainEngineCompareKey = '';
            }
        }
        this._applyTerrainViewBackgroundFallback();

        void this._applyIblState(s.ibl, { force: false });

        if (this._grassEngine) this._grassEngine.setConfig?.(s.grass);
        const hideRoadAndGrass = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TRANSITION
            || this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING;
        if (this._roads?.group) this._roads.group.visible = !hideRoadAndGrass;
        if (this._grassEngine?.group) this._grassEngine.group.visible = !hideRoadAndGrass;

        if (nextLandWireframe !== this._terrainWireframe || nextAsphaltWireframe !== this._asphaltWireframe) {
            this._terrainWireframe = nextLandWireframe;
            this._asphaltWireframe = nextAsphaltWireframe;
            this._applyVisualizationToggles();
        } else {
            this._applyVisualizationToggles();
        }
        this._syncBiomeTilingHref({ force: false });
        this._syncBiomeTilingAxisHelper();
        this._syncBiomeTilingAdaptiveRingHelper();
        this._syncBiomeTilingTileLodDebugHelper();
        this._syncBiomeTilingDiagnosticsUi();
    }

    async _applyIblState(iblState, { force = false } = {}) {
        const renderer = this.renderer;
        const scene = this.scene;
        if (!renderer || !scene) return;

        const s = iblState && typeof iblState === 'object' ? iblState : {};
        const enabled = s.enabled !== false;
        const iblId = String(s.iblId ?? DEFAULT_IBL_ID);
        const setBackground = this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING
            ? true
            : !!s.setBackground;
        const envMapIntensity = clamp(s.envMapIntensity, 0.0, 10.0, 0.25);

        const entry = getIblEntryById(iblId) ?? getIblEntryById(DEFAULT_IBL_ID);
        const hdrUrl = entry?.hdrUrl ?? null;

        const key = `${enabled ? '1' : '0'}|${iblId}|${setBackground ? '1' : '0'}`;
        const needsReload = force || key !== this._iblKey;
        this._iblKey = key;

        if (!enabled || !hdrUrl) {
            applyIBLToScene(scene, null, { enabled: false });
            this._applyTerrainViewBackgroundFallback();
            return;
        }

        if (!needsReload && this._iblPromise) return;

        const req = ++this._iblRequestId;
        const promise = loadIBLTexture(renderer, { enabled: true, hdrUrl });
        this._iblPromise = promise;
        let envMap = null;
        try {
            envMap = await promise;
        } catch (err) {
            console.warn('[TerrainDebugger] Failed to load IBL', err);
            envMap = null;
        }
        if (req !== this._iblRequestId) return;
        this._iblPromise = null;

        applyIBLToScene(scene, envMap, { enabled: true, setBackground, hdrUrl });
        applyIBLIntensity(scene, { enabled: true, envMapIntensity }, { force: true });

        if (setBackground && (!scene.background || !scene.background.isTexture)) {
            try {
                const hdrTex = await loadIBLBackgroundTexture(hdrUrl);
                if (req !== this._iblRequestId) return;
                if (hdrTex?.isTexture) {
                    if (envMap) {
                        envMap.userData = envMap.userData ?? {};
                        envMap.userData.iblBackgroundTexture = hdrTex;
                        envMap.__iblBackgroundTexture = hdrTex;
                    }
                    scene.background = hdrTex;
                }
            } catch (err) {
                console.warn('[TerrainDebugger] Failed to load IBL background texture', err);
            }
        }
        this._applyTerrainViewBackgroundFallback();
    }

    _applyTerrainViewBackgroundFallback() {
        const scene = this.scene;
        if (!scene) return;

        if (this._terrainViewMode === TERRAIN_VIEW_MODE.BIOME_TILING) {
            const iblState = this._ui?.getState?.()?.ibl ?? null;
            const iblEnabled = iblState?.enabled !== false;
            const wantsBackground = iblEnabled;
            if (wantsBackground) {
                if (scene.background === this._tilingFallbackBackground) scene.background = null;
                return;
            }
            const bg = scene.background ?? null;
            if (!bg || !bg.isTexture) scene.background = this._tilingFallbackBackground;
            return;
        }

        if (scene.background === this._tilingFallbackBackground) scene.background = null;
    }
}
