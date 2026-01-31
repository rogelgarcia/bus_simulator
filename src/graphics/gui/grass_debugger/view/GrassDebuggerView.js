// src/graphics/gui/grass_debugger/view/GrassDebuggerView.js
// Orchestrates UI, input, and rendering for the Grass Debugger tool.
// @ts-check

import * as THREE from 'three';
import { FirstPersonCameraController } from '../../../engine3d/camera/FirstPersonCameraController.js';
import { getOrCreateGpuFrameTimer } from '../../../engine3d/perf/GpuFrameTimer.js';
import { applyIBLIntensity, applyIBLToScene, loadIBLTexture } from '../../../lighting/IBL.js';
import { DEFAULT_IBL_ID, getIblEntryById } from '../../../content3d/catalogs/IBLCatalog.js';
import { getPbrMaterialMeta, getPbrMaterialOptionsForGround, resolvePbrMaterialUrls } from '../../../content3d/catalogs/PbrMaterialCatalog.js';
import { primePbrAssetsAvailability } from '../../../content3d/materials/PbrAssetsRuntime.js';
import { applyUvTilingToMeshStandardMaterial, updateUvTilingOnMeshStandardMaterial } from '../../../assets3d/materials/MaterialUvTilingSystem.js';
import { applyMaterialVariationToMeshStandardMaterial, updateMaterialVariationOnMeshStandardMaterial, MATERIAL_VARIATION_ROOT } from '../../../assets3d/materials/MaterialVariationSystem.js';
import { getCityMaterials } from '../../../assets3d/textures/CityMaterials.js';
import { ROAD_DEFAULTS, createGeneratorConfig } from '../../../assets3d/generators/GeneratorParams.js';
import { createRoadEngineRoads } from '../../../visuals/city/RoadEngineRoads.js';
import { GrassEngine } from '../../../engine3d/grass/GrassEngine.js';
import { GrassDebuggerUI } from './GrassDebuggerUI.js';
import { GrassBladeInspectorPopup } from './GrassBladeInspectorPopup.js';
import { GrassLodInspectorPopup } from './GrassLodInspectorPopup.js';

const EPS = 1e-6;
const CAMERA_PRESET_BEHIND_GAMEPLAY_DISTANCE = 13.5;
const ALBEDO_SATURATION_ADJUST_SHADER_VERSION = 2;

function injectAlbedoSaturationAdjustShader(material, shader) {
    const cfg = material?.userData?.albedoSaturationAdjustConfig ?? null;
    shader.uniforms.uAlbedoSaturationAdjust = { value: Number(cfg?.amount) || 0.0 };

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        [
            '#include <common>',
            '#ifdef USE_ALBEDO_SATURATION_ADJUST',
            'uniform float uAlbedoSaturationAdjust;',
            'vec3 gdSaturateColor(vec3 c, float amount){',
            'float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
            'float t = clamp(1.0 + amount, 0.0, 2.0);',
            'return mix(vec3(l), c, t);',
            '}',
            '#endif'
        ].join('\n')
    );

    const saturationApply = [
        '#ifdef USE_ALBEDO_SATURATION_ADJUST',
        'diffuseColor.rgb = gdSaturateColor(diffuseColor.rgb, uAlbedoSaturationAdjust);',
        '#endif'
    ].join('\n');

    if (shader.fragmentShader.includes('#include <map_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>\n${saturationApply}`
        );
        return;
    }

    if (shader.fragmentShader.includes('#include <color_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>\n${saturationApply}`
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

function updateAlbedoSaturationAdjustOnMeshStandardMaterial(material, { amount } = {}) {
    if (!material?.isMeshStandardMaterial) return;
    const a = clamp(amount, -1.0, 1.0, 0.0);

    const cfg = material.userData?.albedoSaturationAdjustConfig ?? null;
    if (!cfg || typeof cfg !== 'object') {
        ensureAlbedoSaturationAdjustConfigOnMaterial(material, { amount: a, shaderUniforms: null });
        material.needsUpdate = true;
        return;
    }

    cfg.amount = a;
    if (cfg.shaderUniforms?.uAlbedoSaturationAdjust) cfg.shaderUniforms.uAlbedoSaturationAdjust.value = a;
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

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function ensureUv2(geo) {
    const g = geo?.isBufferGeometry ? geo : null;
    const uv = g?.attributes?.uv ?? null;
    if (!uv || !uv.isBufferAttribute) return;
    if (g.attributes.uv2) return;
    g.setAttribute('uv2', new THREE.BufferAttribute(uv.array.slice(0), 2));
}

function smoothstep01(t) {
    const x = clamp(t, 0, 1, 0);
    return x * x * (3 - 2 * x);
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

function hash2(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

function noise2(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const a = hash2(ix, iy) / 0xffffffff;
    const b = hash2(ix + 1, iy) / 0xffffffff;
    const c = hash2(ix, iy + 1) / 0xffffffff;
    const d = hash2(ix + 1, iy + 1) / 0xffffffff;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const ab = a + (b - a) * ux;
    const cd = c + (d - c) * ux;
    return ab + (cd - ab) * uy;
}

function fbm2(x, y) {
    let v = 0;
    let a = 0.5;
    let fx = x;
    let fy = y;
    for (let i = 0; i < 4; i++) {
        v += a * noise2(fx, fy);
        fx = fx * 2.03 + 17.7;
        fy = fy * 2.11 + 31.3;
        a *= 0.5;
    }
    return v;
}

function buildTerrainGeometry(spec = {}) {
    const tileSize = Number(spec?.tileSize) || 24;
    const widthTiles = spec?.widthTiles ?? 11;
    const depthTiles = spec?.depthTiles ?? 16;
    const segmentsPerTile = spec?.segmentsPerTile ?? 8;
    const tileMinX = spec?.tileMinX ?? -5;
    const tileMinZ = spec?.tileMinZ ?? -10;
    const slopeDegLeft = spec?.slope?.leftDeg ?? spec?.slopeDegLeft ?? 15;
    const slopeDegRight = spec?.slope?.rightDeg ?? spec?.slopeDegRight ?? 30;
    const slopeDegEnd = spec?.slope?.endDeg ?? spec?.slopeDegEnd ?? 0;
    const slopeEndStartAfterRoadTiles = spec?.slope?.endStartAfterRoadTiles ?? spec?.slopeEndStartAfterRoadTiles ?? 0;
    const slopeBottomCurveMeters = spec?.slope?.bottomCurveMeters ?? 36;
    const slopeTopFlatMeters = spec?.slope?.topFlatMeters ?? 24;
    const roadSpec = spec?.road && typeof spec.road === 'object' ? spec.road : null;
    const cloudSpec = spec?.cloud && typeof spec.cloud === 'object' ? spec.cloud : null;

    const seg = Math.max(1, segmentsPerTile | 0);
    const nx = Math.max(1, (widthTiles | 0) * seg);
    const nz = Math.max(1, (depthTiles | 0) * seg);

    const dx = tileSize / seg;
    const dz = tileSize / seg;

    const minX = (tileMinX - 0.5) * tileSize;
    const minZ = (tileMinZ - 0.5) * tileSize;
    const maxX = minX + (widthTiles | 0) * tileSize;
    const maxZ = minZ + (depthTiles | 0) * tileSize;
    const maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX));

    const positions = new Float32Array((nx + 1) * (nz + 1) * 3);
    const uvs = new Float32Array((nx + 1) * (nz + 1) * 2);
    let minY = Infinity;
    let maxY = -Infinity;

    const tanLeft = Math.tan(THREE.MathUtils.degToRad(clamp(slopeDegLeft, 0, 89.9, 15)));
    const tanRight = Math.tan(THREE.MathUtils.degToRad(clamp(slopeDegRight, 0, 89.9, 30)));
    const tanEnd = Math.tan(THREE.MathUtils.degToRad(clamp(slopeDegEnd, -89.9, 89.9, 0)));
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

    for (let z = 0; z <= nz; z++) {
        const worldZ = minZ + z * dz;
        const cloudW = cloudEnabled ? (1 - smoothstep(cloudZ1, cloudZ1 + cloudBlendMeters, worldZ)) : 0;

        for (let x = 0; x <= nx; x++) {
            const worldX = minX + x * dx;

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

            if (cloudW > EPS) {
                const flatX = (roadEnabled && roadFlatHalfWidth > EPS)
                    ? (1 - smoothstep(roadFlatHalfWidth, roadFlatHalfWidth + cloudRoadBlend, absX))
                    : 0;
                const w = cloudW * (1 - flatX);
                if (w > EPS) {
                    const n = fbm2(worldX * cloudWorldScale, worldZ * cloudWorldScale) * cloudFbmAmp * w;
                    y += n;
                }
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

            const idx = z * (nx + 1) + x;
            positions[idx * 3] = worldX;
            positions[idx * 3 + 1] = y;
            positions[idx * 3 + 2] = worldZ;

            uvs[idx * 2] = worldX;
            uvs[idx * 2 + 1] = worldZ;

            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }

    const indices = new Uint32Array(nx * nz * 6);
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

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    ensureUv2(geo);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    return { geo, minY, maxY, nx, nz, minX, minZ, dx, dz, widthTiles, depthTiles, tileSize };
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

export class GrassDebuggerView {
    constructor({ canvas } = {}) {
        this.canvas = canvas;
        this.onFrame = null;

        this.renderer = null;
        this._gpuFrameTimer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this._ui = null;

        this._texLoader = new THREE.TextureLoader();
        this._texCache = new Map();

        this._terrain = null;
        this._terrainMat = null;
        this._terrainBounds = { minY: 0, maxY: 1 };
        this._terrainGrid = null;
        this._gridLines = null;
        this._roads = null;

        this._grassEngine = null;
        this._grassRoadBounds = { enabled: false, halfWidth: 0, z0: 0, z1: 0 };
        this._grassStatsLastMs = 0;
        this._grassInspector = null;
        this._grassLodInspector = null;

        this._iblKey = '';
        this._iblRequestId = 0;
        this._iblPromise = null;
        this._cameraFarKey = '';

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
            sampleRate: 60,
            sampleCount: 0,
            poses: null,
            startMs: 0,
            timeSec: 0,
            lastUiUpdateMs: 0
        };
        this._flyoverTmpPos = new THREE.Vector3();
        this._flyoverTmpTarget = new THREE.Vector3();
        this._flyoverTmpPos2 = new THREE.Vector3();
        this._flyoverTmpTarget2 = new THREE.Vector3();
        this._cameraMoveEuler = new THREE.Euler(0, 0, 0, 'YXZ');

        this._terrainRaycaster = new THREE.Raycaster();
        this._terrainRayOrigin = new THREE.Vector3();
        this._terrainRayDir = new THREE.Vector3(0, -1, 0);
        this._terrainRayHits = [];

        this._onResize = () => this._resize();
        this._onKeyDown = (e) => this._handleKey(e, true);
        this._onKeyUp = (e) => this._handleKey(e, false);
        this._onContextMenu = (e) => {
            if (!e) return;
            if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
            e.preventDefault();
        };

        this._terrainSpec = {
            layout: {
                extraEndTiles: 5,
                extraSideTiles: 0
            },
            tileSize: 24,
            tileMinX: -9,
            tileMinZ: -10,
            widthTiles: 19,
            depthTiles: 16,
            segmentsPerTile: 8,
            slope: {
                leftDeg: 15,
                rightDeg: 30,
                endDeg: 0,
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
                amplitude: 7.5,
                worldScale: 0.06,
                tiles: 5,
                blendMeters: 32
            }
        };

        const cloud = this._terrainSpec.cloud;
        this._terrainCloudKey = `${cloud.enabled ? '1' : '0'}|${Number(cloud.amplitude).toFixed(3)}|${Number(cloud.worldScale).toFixed(5)}|${Math.max(0, Math.round(Number(cloud.tiles) || 0))}|${Number(cloud.blendMeters).toFixed(3)}`;

        const layout = this._terrainSpec.layout;
        const extraEndTiles = Math.max(0, Math.round(Number(layout?.extraEndTiles) || 0));
        const extraSideTiles = Math.max(0, Math.round(Number(layout?.extraSideTiles) || 0));
        this._terrainLayoutKey = `${extraEndTiles}|${extraSideTiles}`;

        const slope = this._terrainSpec.slope;
        const slopeLeft = clamp(slope?.leftDeg, 0.0, 89.9, 15.0);
        const slopeRight = clamp(slope?.rightDeg, 0.0, 89.9, 30.0);
        const slopeEnd = clamp(slope?.endDeg, -89.9, 89.9, 0.0);
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
        if (!this.canvas) throw new Error('[GrassDebugger] Missing canvas');
        if (this.renderer) return;

        if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;

        const renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

        if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
        else renderer.outputEncoding = THREE.sRGBEncoding;

        if ('useLegacyLights' in renderer) renderer.useLegacyLights = true;

        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;

        this.renderer = renderer;
        this._gpuFrameTimer = getOrCreateGpuFrameTimer(renderer);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);

        const ui = new GrassDebuggerUI({
            onChange: (state) => this._applyUiState(state),
            onResetCamera: () => this.controls?.reset?.(),
            onCameraPreset: (id) => this._applyCameraPreset(id),
            onToggleFlyover: () => this._toggleFlyover(),
            onFlyoverLoopChange: (enabled) => this._setFlyoverLoop(enabled),
            onInspectGrass: () => this._openGrassInspector(),
            onInspectGrassLod: (tier) => this._openGrassLodInspector(tier)
        });
        ui.setTerrainMeta?.({ tileSize: this._terrainSpec.tileSize, baseDepthTiles: this._terrainSpec.depthTiles });
        this._ui = ui;
        ui.mount();

        this.canvas.addEventListener('contextmenu', this._onContextMenu, { passive: false, capture: true });

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
        ui.setFlyoverActive?.(false);
        this._syncCameraStatus({ nowMs: performance.now(), force: true });
        void this._applyIblState(initialState?.ibl, { force: true });

        primePbrAssetsAvailability().then(() => {
            const state = this._ui?.getState?.();
            if (state) this._applyUiState(state);
            this._warmupGroundTextures();
        }).catch(() => {});

        window.addEventListener('resize', this._onResize, { passive: true });
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: false });

        this._resize();
        this._lastT = performance.now();
        this._raf = requestAnimationFrame((t) => this._tick(t));
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;

        this.canvas?.removeEventListener?.('contextmenu', this._onContextMenu, { capture: true });

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

        const disposeMaterial = (mat) => {
            if (!mat) return;
            const keys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
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

        this._texCache.clear();
        this._terrain = null;
        this._terrainMat = null;
        this._gridLines = null;
        this._roads = null;
        this._terrainGrid = null;
    }

    _buildScene() {
        const scene = this.scene;
        if (!scene) return;

        scene.background = null;
        scene.environment = null;

        const hemi = new THREE.HemisphereLight(0xffffff, 0x253018, 0.45);
        hemi.position.set(0, 220, 0);
        scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.position.set(120, 170, 90);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.bias = -0.0002;
        scene.add(sun);

        const terrainMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0
        });
        terrainMat.polygonOffset = true;
        terrainMat.polygonOffsetFactor = 1;
        terrainMat.polygonOffsetUnits = 1;
        this._terrainMat = terrainMat;

        const terrain = (() => {
            const { geo, minY, maxY, widthTiles, depthTiles, nx, nz, minX, minZ, dx, dz, tileSize } = buildTerrainGeometry(this._buildTerrainSpec());
            this._terrainBounds.minY = minY;
            this._terrainBounds.maxY = maxY;
            this._terrainGrid = { nx, nz, minX, minZ, dx, dz, tileSize, widthTiles, depthTiles, minY, maxY };

            const mesh = new THREE.Mesh(geo, terrainMat);
            mesh.name = 'Terrain';
            mesh.receiveShadow = true;
            mesh.castShadow = false;
            scene.add(mesh);

            const grid = buildTileGridLinesFromTerrain(geo, {
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
                roadNetwork: { seed: 'grass-debugger' },
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
    }

        _buildTerrainSpec() {
            const base = this._terrainSpec;
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

            const road = base?.road && typeof base.road === 'object' ? base.road : {};
            const tileSize = Number(base?.tileSize) || 24;
            const laneWidth = Math.max(0, Number(road?.laneWidthMeters) || 0);
            const lanesEach = Math.max(1, Number(road?.lanesEachDirection) || 3);
        const shoulder = Math.max(0, Number(road?.shoulderMeters) || 0);
        const curb = road?.curb && typeof road.curb === 'object' ? road.curb : {};
        const sidewalk = road?.sidewalk && typeof road.sidewalk === 'object' ? road.sidewalk : {};
        const curbThickness = Math.max(0, Number(curb?.thickness) || 0);
        const sidewalkWidth = Math.max(0, Number(sidewalk?.extraWidth) || 0);
        const lengthTiles = Math.max(0, Number(road?.lengthTiles) || 0);
        const roadLength = lengthTiles * tileSize;
        const zEnd = Number(road?.zEnd) || 0;
        const dir = Number(road?.direction) < 0 ? -1 : 1;
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
                road: {
                    ...road,
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

        const oldGeo = terrain.geometry;
        const { geo, minY, maxY, widthTiles, depthTiles, nx, nz, minX, minZ, dx, dz, tileSize } = buildTerrainGeometry(this._buildTerrainSpec());
        terrain.geometry = geo;
        oldGeo?.dispose?.();

        this._terrainBounds.minY = minY;
        this._terrainBounds.maxY = maxY;
        this._terrainGrid = { nx, nz, minX, minZ, dx, dz, tileSize, widthTiles, depthTiles, minY, maxY };
        this._updateGrassRoadBounds();
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

        const grid = buildTileGridLinesFromTerrain(geo, {
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
    }

    _handleKey(e, isDown) {
        if (!e) return;
        if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
        const code = e.code;
        if (!(code in this._keys)) return;
        e.preventDefault();
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

    _toggleFlyover() {
        if (this._flyover?.active) {
            this._stopFlyover({ keepPose: true });
        } else {
            this._startFlyover();
        }
    }

    _startFlyover() {
        const controls = this.controls;
        const ui = this._ui;
        if (!controls?.setLookAt || !this.camera) return;

        this._clearKeys();
        controls.enabled = false;

        const startPosition = this.camera.position.clone();
        const startTarget = controls.target?.clone?.() ?? new THREE.Vector3(0, 0, 0);
        const path = this._buildFlyoverPath({ startPosition, startTarget });
        if (!path) {
            controls.enabled = true;
            return;
        }

        const flyover = this._flyover;
        flyover.active = true;
        flyover.startMs = performance.now();
        flyover.timeSec = 0;
        flyover.durationSec = path.durationSec;
        flyover.sampleRate = path.sampleRate;
        flyover.sampleCount = path.sampleCount;
        flyover.poses = path.poses;
        flyover.lastUiUpdateMs = 0;

        ui?.setFlyoverActive?.(true);
        this._syncCameraStatus({ nowMs: flyover.startMs, force: true });
    }

    _stopFlyover({ keepPose = true } = {}) {
        const flyover = this._flyover;
        if (!flyover?.active) return;

        flyover.active = false;
        flyover.poses = null;
        flyover.sampleCount = 0;
        flyover.timeSec = 0;

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
        this._syncCameraStatus({ nowMs, force: false });
    }

    _applyFlyoverPose(tSec) {
        const controls = this.controls;
        const flyover = this._flyover;
        const poses = flyover?.poses ?? null;
        const sampleRate = Number(flyover?.sampleRate) || 60;
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

    _getTerrainHeightAtXZ(x, z) {
        const terrain = this._terrain;
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

        const sampleRate = 60;
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
        const tmpHorizonTarget = new THREE.Vector3();
        const tmpSlopeDir = new THREE.Vector3();
        const tmpTiltTarget = new THREE.Vector3();

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

            const horizon = buildHorizonPoseAt(x, z);
            const posY = THREE.MathUtils.lerp(busGameplayPose.position.y, horizon.lowY, horizonW);
            posB.set(x, posY, z);

            tgtB.copy(busGameplayPose.target).addScaledVector(forward, travelMeters * moveW);
            tmpHorizonTarget.copy(horizon.target);
            tgtB.lerp(tmpHorizonTarget, horizonW);

            const uD = climbSec > EPS ? clamp((t - climbStartSec) / climbSec, 0, 1, 0) : 1;
            const climbW = uD;
            const liftW = smoothstep01(uD);
            const xD = clamp(endMove.pos.x + forward.x * (climbTravelMeters * climbW), minX + tileSize, maxX - tileSize, endMove.pos.x);
            const zD = clamp(endMove.pos.z + forward.z * (climbTravelMeters * climbW), minZ + tileSize, maxZ - tileSize, endMove.pos.z);
            const groundYD = this._getTerrainHeightAtXZ(xD, zD);
            const heightD = THREE.MathUtils.lerp(lowHeightAboveGround, climbHeightAboveGround, liftW);
            posD.set(xD, groundYD + heightD, zD);

            const aheadGroundYD = this._getTerrainHeightAtXZ(xD + forward.x * slopeSampleDist, zD + forward.z * slopeSampleDist);
            const slopeD = (aheadGroundYD - groundYD) / Math.max(EPS, slopeSampleDist);
            tmpSlopeDir.set(forward.x, slopeD, forward.z);
            if (tmpSlopeDir.lengthSq() > EPS) tmpSlopeDir.normalize();
            else tmpSlopeDir.set(forward.x, 0, forward.z);
            if (tmpSlopeDir.lengthSq() > EPS) tmpSlopeDir.normalize();
            else tmpSlopeDir.set(0, 0, -1);

            tgtD.set(xD, groundYD + lowHeightAboveGround, zD).addScaledVector(tmpSlopeDir, horizonDist);
            const tiltW = smoothstep(0.15, 1.0, uD);
            const tiltX = clamp(xD + forward.x * climbTiltLookAheadMeters, minX + tileSize, maxX - tileSize, xD + forward.x * climbTiltLookAheadMeters);
            const tiltZ = clamp(zD + forward.z * climbTiltLookAheadMeters, minZ + tileSize, maxZ - tileSize, zD + forward.z * climbTiltLookAheadMeters);
            const tiltY = this._getTerrainHeightAtXZ(tiltX, tiltZ) + 0.6;
            tmpTiltTarget.set(tiltX, tiltY, tiltZ);
            tgtD.lerp(tmpTiltTarget, tiltW);

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
            const urls = resolvePbrMaterialUrls(materialId);
            this._loadTexture(urls?.baseColorUrl ?? null, { srgb: true });
            this._loadTexture(urls?.normalUrl ?? null, { srgb: false });
            this._loadTexture(urls?.ormUrl ?? null, { srgb: false });
            this._loadTexture(urls?.aoUrl ?? null, { srgb: false });
            this._loadTexture(urls?.roughnessUrl ?? null, { srgb: false });
            this._loadTexture(urls?.metalnessUrl ?? null, { srgb: false });
            this._loadTexture(urls?.displacementUrl ?? null, { srgb: false });
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
        this._grassEngine?.update?.({ camera });

        const ui = this._ui;
        if (ui && this._grassEngine && t - (this._grassStatsLastMs || 0) > 250) {
            this._grassStatsLastMs = t;
            ui.setGrassStats?.(this._grassEngine.getStats());
        }

        const gpuTimer = this._gpuFrameTimer;
        gpuTimer?.beginFrame?.();
        try {
            renderer.render(scene, camera);
        } finally {
            gpuTimer?.endFrame?.();
            gpuTimer?.poll?.();
        }

        this.onFrame?.({ dt, nowMs: t, renderer });

        this._raf = requestAnimationFrame((tt) => this._tick(tt));
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

    _loadTexture(url, { srgb } = {}) {
        const renderer = this.renderer;
        const safeUrl = typeof url === 'string' && url ? url : null;
        if (!safeUrl || !renderer) return null;
        const cached = this._texCache.get(safeUrl);
        if (cached) return cached;

        const tex = this._texLoader.load(safeUrl);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy?.() ?? 16);
        applyTextureColorSpace(tex, { srgb: !!srgb });
        this._texCache.set(safeUrl, tex);
        return tex;
    }

    _applyGroundMaterial({ materialId, uv, uvDistance, variation, layers, pbr } = {}) {
        const mat = this._terrainMat;
        if (!mat) return;

        const id = typeof materialId === 'string' ? materialId : '';
        const urls = resolvePbrMaterialUrls(id);
        const baseUrl = urls?.baseColorUrl ?? null;
        const normalUrl = urls?.normalUrl ?? null;
        const ormUrl = urls?.ormUrl ?? null;
        const aoUrl = urls?.aoUrl ?? null;
        const roughUrl = urls?.roughnessUrl ?? null;
        const metalUrl = urls?.metalnessUrl ?? null;

        mat.map = this._loadTexture(baseUrl, { srgb: true });
        mat.normalMap = this._loadTexture(normalUrl, { srgb: false });

        if (ormUrl) {
            const orm = this._loadTexture(ormUrl, { srgb: false });
            mat.roughnessMap = orm;
            mat.metalnessMap = orm;
            mat.aoMap = orm;
            mat.metalness = 1.0;
        } else {
            mat.aoMap = this._loadTexture(aoUrl, { srgb: false });
            mat.roughnessMap = this._loadTexture(roughUrl, { srgb: false });
            mat.metalnessMap = this._loadTexture(metalUrl, { srgb: false });
            mat.metalness = 0.0;
        }

        const pbrCfg = pbr && typeof pbr === 'object' ? pbr : {};
        const normalStrength = clamp(pbrCfg.normalStrength, 0.0, 8.0, 1.0);
        if (mat.normalScale?.set) mat.normalScale.set(normalStrength, normalStrength);
        mat.roughness = clamp(pbrCfg.roughness, 0.0, 1.0, 1.0);

        const albedoBrightness = clamp(pbrCfg.albedoBrightness, 0.0, 4.0, 1.0);
        const albedoTintStrength = clamp(pbrCfg.albedoTintStrength, 0.0, 1.0, 0.0);
        const albedoHueDegrees = clamp(pbrCfg.albedoHueDegrees, -180.0, 180.0, 0.0);
        const albedoSaturationAdjust = clamp(pbrCfg.albedoSaturation, -1.0, 1.0, 0.0);
        let hue01 = (albedoHueDegrees / 360.0) % 1.0;
        if (hue01 < 0) hue01 += 1.0;
        const tint = new THREE.Color().setHSL(hue01, 1.0, 0.5);
        const base = new THREE.Color(1, 1, 1);
        base.lerp(tint, albedoTintStrength);
        base.multiplyScalar(albedoBrightness);
        mat.color?.copy?.(base);

        mat.needsUpdate = true;

        const meta = getPbrMaterialMeta(id);
        const tileMeters = Number(meta?.tileMeters) || 4.0;
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

        updateAlbedoSaturationAdjustOnMeshStandardMaterial(mat, { amount: albedoSaturationAdjust });
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
            const leftDeg = clamp(slopeCfg.leftDeg, 0.0, 89.9, prev.leftDeg ?? 15.0);
            const rightDeg = clamp(slopeCfg.rightDeg, 0.0, 89.9, prev.rightDeg ?? 30.0);
            const endDeg = clamp(slopeCfg.endDeg, -89.9, 89.9, prev.endDeg ?? 0.0);
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
            const amplitude = clamp(cloudCfg.amplitude, 0.0, 200.0, prev.amplitude ?? 0.0);
            const worldScale = clamp(cloudCfg.worldScale, 0.0001, 10.0, prev.worldScale ?? 0.06);
            const maxTiles = Math.max(0, Math.round(Number(this._buildTerrainSpec()?.depthTiles) || 0));
            const tiles = Math.max(0, Math.round(clamp(cloudCfg.tiles, 0, maxTiles, prev.tiles ?? 5)));
            const blendMeters = clamp(cloudCfg.blendMeters, 0.0, 1000.0, prev.blendMeters ?? 32.0);
            const key = `${enabled ? '1' : '0'}|${amplitude.toFixed(3)}|${worldScale.toFixed(5)}|${tiles}|${blendMeters.toFixed(3)}`;
            if (key !== this._terrainCloudKey) {
                this._terrainCloudKey = key;
                this._terrainSpec.cloud = { ...prev, enabled, amplitude, worldScale, tiles, blendMeters };
                    rebuildTerrain = true;
                }
            }

            if (rebuildTerrain) this._rebuildTerrain();
            if (this._gridLines) this._gridLines.visible = !!terrainCfg.showGrid;
            this._applyGroundMaterial({
                materialId: terrainCfg.groundMaterialId,
                uv: terrainCfg.uv,
                uvDistance: terrainCfg.uvDistance,
                variation: terrainCfg.variation,
                layers: terrainCfg.layers,
                pbr: terrainCfg.pbr
            });

        void this._applyIblState(s.ibl, { force: false });

        if (this._grassEngine) this._grassEngine.setConfig?.(s.grass);
    }

    async _applyIblState(iblState, { force = false } = {}) {
        const renderer = this.renderer;
        const scene = this.scene;
        if (!renderer || !scene) return;

        const s = iblState && typeof iblState === 'object' ? iblState : {};
        const enabled = s.enabled !== false;
        const iblId = String(s.iblId ?? DEFAULT_IBL_ID);
        const setBackground = !!s.setBackground;
        const envMapIntensity = clamp(s.envMapIntensity, 0.0, 10.0, 0.25);

        const entry = getIblEntryById(iblId) ?? getIblEntryById(DEFAULT_IBL_ID);
        const hdrUrl = entry?.hdrUrl ?? null;

        const key = `${enabled ? '1' : '0'}|${iblId}|${setBackground ? '1' : '0'}`;
        const needsReload = force || key !== this._iblKey;
        this._iblKey = key;

        if (!enabled || !hdrUrl) {
            applyIBLToScene(scene, null, { enabled: false });
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
            console.warn('[GrassDebugger] Failed to load IBL', err);
            envMap = null;
        }
        if (req !== this._iblRequestId) return;
        this._iblPromise = null;

        applyIBLToScene(scene, envMap, { enabled: true, setBackground, hdrUrl });
        applyIBLIntensity(scene, { enabled: true, envMapIntensity }, { force: true });
    }
}
