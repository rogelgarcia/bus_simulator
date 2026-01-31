// src/graphics/engine3d/grass/GrassEngine.js
// Patch-batched, GPU-instanced grass rendering engine (debugger-first implementation).
// @ts-check

import * as THREE from 'three';
import { createGrassBladeGeometry, createGrassBladeTuftGeometry, createGrassCrossGeometry, createGrassStarGeometry } from './GrassGeometry.js';
import { GRASS_LOD_TIERS } from './GrassLodEvaluator.js';
import { getGrassEngineInstanceKey, getGrassLodDensityMultiplier, sanitizeGrassEngineConfig } from './GrassConfig.js';
import { makeRng } from './GrassRng.js';

const EPS = 1e-6;
const GRASS_LOD_SHADER_VERSION = 1;

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function sanitizeRenderMode(value, fallback) {
    const v = String(value ?? '');
    if (v === 'tuft' || v === 'star' || v === 'cross' || v === 'cross_sparse' || v === 'none') return v;
    return String(fallback ?? 'cross');
}

function getRenderModeForTier(config, tier) {
    const t = String(tier ?? '');
    const src = config?.lod?.renderMode && typeof config.lod.renderMode === 'object' ? config.lod.renderMode : {};
    if (t === 'master') return sanitizeRenderMode(src.master, 'tuft');
    if (t === 'near') return sanitizeRenderMode(src.near, 'star');
    if (t === 'mid') return sanitizeRenderMode(src.mid, 'cross');
    if (t === 'far') return sanitizeRenderMode(src.far, 'cross_sparse');
    return sanitizeRenderMode(src[t], 'cross');
}

function unionIntervals(a, b) {
    if (!a) return b ? { min: Number(b.min) || 0, max: Number.isFinite(b.max) ? Number(b.max) : Infinity } : null;
    if (!b) return { min: Number(a.min) || 0, max: Number.isFinite(a.max) ? Number(a.max) : Infinity };
    const amin = Number(a.min) || 0;
    const amax = Number.isFinite(a.max) ? Number(a.max) : Infinity;
    const bmin = Number(b.min) || 0;
    const bmax = Number.isFinite(b.max) ? Number(b.max) : Infinity;
    return { min: Math.min(amin, bmin), max: Math.max(amax, bmax) };
}

function intervalsOverlap(a, b) {
    if (!a || !b) return false;
    const amin = Number(a.min) || 0;
    const amax = Number.isFinite(a.max) ? Number(a.max) : Infinity;
    const bmin = Number(b.min) || 0;
    const bmax = Number.isFinite(b.max) ? Number(b.max) : Infinity;
    return !(amax < bmin || bmax < amin);
}

function tierToIndex(tier) {
    const t = String(tier ?? '');
    if (t === 'master') return 0;
    if (t === 'near') return 1;
    if (t === 'mid') return 2;
    if (t === 'far') return 3;
    return 1;
}

function forceToIndex(force) {
    const f = String(force ?? 'auto');
    if (f === 'master') return 1;
    if (f === 'near') return 2;
    if (f === 'mid') return 3;
    if (f === 'far') return 4;
    if (f === 'none') return 5;
    return 0;
}

function computeAllowedTierMap(allowedLods, enableMaster) {
    const src = allowedLods && typeof allowedLods === 'object' ? allowedLods : {};
    const allow = {
        master: enableMaster && !!src.master,
        near: !!src.near,
        mid: !!src.mid,
        far: !!src.far
    };

    if (!(allow.master || allow.near || allow.mid || allow.far)) allow.near = true;

    const allowed = [];
    for (const t of GRASS_LOD_TIERS) if (allow[t]) allowed.push(t);

    const idxOf = (t) => GRASS_LOD_TIERS.indexOf(t);
    const resolve = (tier) => {
        const t = String(tier ?? '');
        if (allow[t]) return t;
        const srcIdx = idxOf(t);
        if (srcIdx < 0) return allowed[allowed.length - 1] ?? 'near';

        let best = allowed[0] ?? 'near';
        let bestDist = Infinity;
        let bestIdx = idxOf(best);
        for (const cand of allowed) {
            const idx = idxOf(cand);
            const dist = Math.abs(idx - srcIdx);
            if (dist < bestDist || (dist === bestDist && idx > bestIdx)) {
                best = cand;
                bestDist = dist;
                bestIdx = idx;
            }
        }
        return best;
    };

    return new THREE.Vector4(
        idxOf(resolve('master')),
        idxOf(resolve('near')),
        idxOf(resolve('mid')),
        idxOf(resolve('far'))
    );
}

function ensureGrassLodShaderOnMaterial(material) {
    if (!material?.isMeshStandardMaterial) return;
    const mat = material;
    mat.userData = mat.userData ?? {};

    if (mat.userData.grassLodShaderVersion === GRASS_LOD_SHADER_VERSION) return;
    mat.userData.grassLodShaderVersion = GRASS_LOD_SHADER_VERSION;

    mat.defines = mat.defines ?? {};
    mat.defines.USE_GRASS_LOD_BLEND = 1;

    const prevCacheKey = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => {
        const prev = prevCacheKey ? prevCacheKey() : '';
        return `${prev}|grasslod:${GRASS_LOD_SHADER_VERSION}`;
    };

    const prevOnBeforeCompile = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile.bind(mat) : null;
    mat.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);

        const data = mat.userData ?? {};
        shader.uniforms.uGrassTierIndex = { value: Number(data.grassTierIndex) || 0 };
        shader.uniforms.uGrassEnableMaster = { value: Number(data.grassEnableMaster) || 0 };
        shader.uniforms.uGrassForceTier = { value: Number(data.grassForceTier) || 0 };
        shader.uniforms.uGrassDistMaster = { value: Number(data.grassDistMaster) || 0 };
        shader.uniforms.uGrassDistNearMidFarCutoff = { value: data.grassDistNearMidFarCutoff ?? new THREE.Vector4() };
        shader.uniforms.uGrassTransition = { value: Number(data.grassTransition) || 0.001 };
        shader.uniforms.uGrassAngleBoundsDeg = { value: data.grassAngleBoundsDeg ?? new THREE.Vector2(12, 70) };
        shader.uniforms.uGrassAngleScale = { value: data.grassAngleScale ?? new THREE.Vector2(0.78, 1.22) };
        shader.uniforms.uGrassMasterMaxDeg = { value: Number(data.grassMasterMaxDeg) || 18 };
        shader.uniforms.uGrassTierMap = { value: data.grassTierMap ?? new THREE.Vector4(0, 1, 2, 3) };

        mat.userData.grassLodUniforms = shader.uniforms;

        if (!shader.vertexShader.includes('gdGrassComputeTierAlpha')) {
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                [
                    '#include <common>',
                    '#ifdef USE_GRASS_LOD_BLEND',
                    'uniform float uGrassTierIndex;',
                    'uniform float uGrassEnableMaster;',
                    'uniform float uGrassForceTier;',
                    'uniform float uGrassDistMaster;',
                    'uniform vec4 uGrassDistNearMidFarCutoff;',
                    'uniform float uGrassTransition;',
                    'uniform vec2 uGrassAngleBoundsDeg;',
                    'uniform vec2 uGrassAngleScale;',
                    'uniform float uGrassMasterMaxDeg;',
                    'uniform vec4 uGrassTierMap;',
                    'varying float vGrassLodAlpha;',
                    'float gdGrassSmoothstep(float a, float b, float x){',
                    'float t = clamp((x - a) / (b - a), 0.0, 1.0);',
                    'return t * t * (3.0 - 2.0 * t);',
                    '}',
                    'float gdGrassGetViewAngleDeg(){',
                    'float y = abs(viewMatrix[1][2]);',
                    'return degrees(asin(clamp(y, 0.0, 1.0)));',
                    '}',
                    'float gdGrassComputeTierAlpha(float dist){',
                    'float angle = gdGrassGetViewAngleDeg();',
                    'float grazingDeg = uGrassAngleBoundsDeg.x;',
                    'float topDownDeg = uGrassAngleBoundsDeg.y;',
                    'float denom = max(0.001, topDownDeg - grazingDeg);',
                    'float angleT = clamp((angle - grazingDeg) / denom, 0.0, 1.0);',
                    'float angleScale = mix(uGrassAngleScale.x, uGrassAngleScale.y, angleT);',
                    'float effectiveDistance = dist * angleScale;',
                    'float w = max(0.001, uGrassTransition);',
                    'float nearEnd = uGrassDistNearMidFarCutoff.x;',
                    'float midEnd = uGrassDistNearMidFarCutoff.y;',
                    'float farEnd = uGrassDistNearMidFarCutoff.z;',
                    'float cutoff = uGrassDistNearMidFarCutoff.w;',
                    'float tNearMid = gdGrassSmoothstep(nearEnd - w, nearEnd + w, effectiveDistance);',
                    'float bNear = 1.0 - tNearMid;',
                    'float bMid = tNearMid;',
                    'float tMidFar = gdGrassSmoothstep(midEnd - w, midEnd + w, effectiveDistance);',
                    'bMid *= (1.0 - tMidFar);',
                    'float bFar = tMidFar;',
                    'if (cutoff > farEnd){',
                    'float tFade = gdGrassSmoothstep(farEnd, cutoff, effectiveDistance);',
                    'bFar *= (1.0 - tFade);',
                    '} else if (effectiveDistance > cutoff) {',
                    'bFar = 0.0;',
                    '}',
                    'float bMaster = 0.0;',
                    'float masterDist = uGrassDistMaster;',
                    'if (uGrassEnableMaster > 0.5 && angle <= uGrassMasterMaxDeg && masterDist > 0.0){',
                    'float m = 1.0 - gdGrassSmoothstep(masterDist - w, masterDist + w, effectiveDistance);',
                    'float masterW = clamp(m, 0.0, 1.0);',
                    'bMaster = masterW;',
                    'float scale = 1.0 - masterW;',
                    'bNear *= scale;',
                    'bMid *= scale;',
                    'bFar *= scale;',
                    '}',
                    'int forceTier = int(floor(uGrassForceTier + 0.5));',
                    'if (forceTier == 5){',
                    'bMaster = 0.0; bNear = 0.0; bMid = 0.0; bFar = 0.0;',
                    '} else if (forceTier == 1){',
                    'bMaster = 1.0; bNear = 0.0; bMid = 0.0; bFar = 0.0;',
                    '} else if (forceTier == 2){',
                    'bMaster = 0.0; bNear = 1.0; bMid = 0.0; bFar = 0.0;',
                    '} else if (forceTier == 3){',
                    'bMaster = 0.0; bNear = 0.0; bMid = 1.0; bFar = 0.0;',
                    '} else if (forceTier == 4){',
                    'bMaster = 0.0; bNear = 0.0; bMid = 0.0; bFar = 1.0;',
                    '}',
                    'vec4 wgt = vec4(0.0);',
                    'int m0 = int(floor(uGrassTierMap.x + 0.5));',
                    'if (m0 == 0) wgt.x += bMaster; else if (m0 == 1) wgt.y += bMaster; else if (m0 == 2) wgt.z += bMaster; else if (m0 == 3) wgt.w += bMaster;',
                    'int m1 = int(floor(uGrassTierMap.y + 0.5));',
                    'if (m1 == 0) wgt.x += bNear; else if (m1 == 1) wgt.y += bNear; else if (m1 == 2) wgt.z += bNear; else if (m1 == 3) wgt.w += bNear;',
                    'int m2 = int(floor(uGrassTierMap.z + 0.5));',
                    'if (m2 == 0) wgt.x += bMid; else if (m2 == 1) wgt.y += bMid; else if (m2 == 2) wgt.z += bMid; else if (m2 == 3) wgt.w += bMid;',
                    'int m3 = int(floor(uGrassTierMap.w + 0.5));',
                    'if (m3 == 0) wgt.x += bFar; else if (m3 == 1) wgt.y += bFar; else if (m3 == 2) wgt.z += bFar; else if (m3 == 3) wgt.w += bFar;',
                    'int tier = int(floor(uGrassTierIndex + 0.5));',
                    'if (tier == 0) return wgt.x;',
                    'if (tier == 1) return wgt.y;',
                    'if (tier == 2) return wgt.z;',
                    'if (tier == 3) return wgt.w;',
                    'return 0.0;',
                    '}',
                    '#endif'
                ].join('\n')
            );

            shader.vertexShader = shader.vertexShader.replace(
                '#include <worldpos_vertex>',
                [
                    '#include <worldpos_vertex>',
                    '#ifdef USE_GRASS_LOD_BLEND',
                    'vec3 gdGrassViewPos = (viewMatrix * worldPosition).xyz;',
                    'vGrassLodAlpha = gdGrassComputeTierAlpha(length(gdGrassViewPos));',
                    '#endif'
                ].join('\n')
            );
        }

        if (!shader.fragmentShader.includes('vGrassLodAlpha')) {
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                [
                    '#include <common>',
                    '#ifdef USE_GRASS_LOD_BLEND',
                    'varying float vGrassLodAlpha;',
                    '#endif'
                ].join('\n')
            );
        }

        if (!shader.fragmentShader.includes('gdGrassApplyLodAlpha')) {
            shader.fragmentShader = shader.fragmentShader.replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                [
                    'vec4 diffuseColor = vec4( diffuse, opacity );',
                    '#ifdef USE_GRASS_LOD_BLEND',
                    'diffuseColor.a *= vGrassLodAlpha;',
                    '#endif',
                    'float gdGrassApplyLodAlpha = 0.0;'
                ].join('\n')
            );
        }
    };

    mat.needsUpdate = true;
}

function syncGrassLodUniformsOnMaterial(material) {
    const mat = material?.isMeshStandardMaterial ? material : null;
    const uniforms = mat?.userData?.grassLodUniforms ?? null;
    if (!uniforms || typeof uniforms !== 'object') return;
    const data = mat.userData ?? {};

    if (uniforms.uGrassTierIndex) uniforms.uGrassTierIndex.value = Number(data.grassTierIndex) || 0;
    if (uniforms.uGrassEnableMaster) uniforms.uGrassEnableMaster.value = Number(data.grassEnableMaster) || 0;
    if (uniforms.uGrassForceTier) uniforms.uGrassForceTier.value = Number(data.grassForceTier) || 0;
    if (uniforms.uGrassDistMaster) uniforms.uGrassDistMaster.value = Number(data.grassDistMaster) || 0;
    if (uniforms.uGrassTransition) uniforms.uGrassTransition.value = Number(data.grassTransition) || 0.001;
    if (uniforms.uGrassMasterMaxDeg) uniforms.uGrassMasterMaxDeg.value = Number(data.grassMasterMaxDeg) || 0;

    if (uniforms.uGrassDistNearMidFarCutoff) uniforms.uGrassDistNearMidFarCutoff.value = data.grassDistNearMidFarCutoff;
    if (uniforms.uGrassAngleBoundsDeg) uniforms.uGrassAngleBoundsDeg.value = data.grassAngleBoundsDeg;
    if (uniforms.uGrassAngleScale) uniforms.uGrassAngleScale.value = data.grassAngleScale;
    if (uniforms.uGrassTierMap) uniforms.uGrassTierMap.value = data.grassTierMap;
}

function colorFromHexString(hex) {
    const s = typeof hex === 'string' ? hex.trim() : '';
    if (!s) return new THREE.Color(0xffffff);
    const c = new THREE.Color();
    c.set(s);
    return c;
}

function applyGrassMaterialSettings(mat, { roughness = 1.0, metalness = 0.0 } = {}) {
    const m = mat;
    m.roughness = clamp(roughness, 0, 1, 1);
    m.metalness = clamp(metalness, 0, 1, 0);
    m.transparent = true;
    m.depthWrite = false;
    m.side = THREE.DoubleSide;
    m.vertexColors = true;
}

function computeTriangleCountForGeometry(geo) {
    if (!geo?.isBufferGeometry) return 0;
    const idx = geo.index;
    if (idx?.isBufferAttribute) return Math.floor(idx.count / 3);
    const pos = geo.attributes?.position;
    if (pos?.isBufferAttribute) return Math.floor(pos.count / 3);
    return 0;
}

function writeYRotationScaleTranslationIntoArray(out, outOffset, { x, y, z, yawRad, sx, sy, sz }) {
    const c = Math.cos(yawRad);
    const s = Math.sin(yawRad);

    out[outOffset] = c * sx;
    out[outOffset + 1] = 0;
    out[outOffset + 2] = -s * sz;
    out[outOffset + 3] = 0;

    out[outOffset + 4] = 0;
    out[outOffset + 5] = sy;
    out[outOffset + 6] = 0;
    out[outOffset + 7] = 0;

    out[outOffset + 8] = s * sx;
    out[outOffset + 9] = 0;
    out[outOffset + 10] = c * sz;
    out[outOffset + 11] = 0;

    out[outOffset + 12] = x;
    out[outOffset + 13] = y;
    out[outOffset + 14] = z;
    out[outOffset + 15] = 1;
}

function sampleTerrainHeightBilinear({ positionAttr, nx, nz, minX, minZ, dx, dz }, x, z) {
    const pos = positionAttr;
    if (!pos?.isBufferAttribute) return 0;
    const gx = (x - minX) / dx;
    const gz = (z - minZ) / dz;
    const ix0 = Math.max(0, Math.min(nx - 1, Math.floor(gx)));
    const iz0 = Math.max(0, Math.min(nz - 1, Math.floor(gz)));
    const ix1 = Math.min(nx, ix0 + 1);
    const iz1 = Math.min(nz, iz0 + 1);
    const fx = clamp(gx - ix0, 0, 1, 0);
    const fz = clamp(gz - iz0, 0, 1, 0);

    const stride = nx + 1;
    const idx00 = iz0 * stride + ix0;
    const idx10 = iz0 * stride + ix1;
    const idx01 = iz1 * stride + ix0;
    const idx11 = iz1 * stride + ix1;

    const y00 = pos.getY(idx00);
    const y10 = pos.getY(idx10);
    const y01 = pos.getY(idx01);
    const y11 = pos.getY(idx11);

    const y0 = y00 + (y10 - y00) * fx;
    const y1 = y01 + (y11 - y01) * fx;
    return y0 + (y1 - y0) * fz;
}

export class GrassEngine {
    constructor({ scene, terrainMesh, terrainGrid, getExclusionRects } = {}) {
        this._scene = scene ?? null;
        this._terrainMesh = terrainMesh ?? null;
        this._terrainGrid = terrainGrid ?? null;
        this._getExclusionRects = typeof getExclusionRects === 'function' ? getExclusionRects : (() => []);

        this._config = sanitizeGrassEngineConfig(null);
        this._instanceKey = getGrassEngineInstanceKey(this._config);

        this.group = new THREE.Group();
        this.group.name = 'GrassEngine';

        this._chunks = [];

        this._geometries = {
            blade: null,
            tuft: null,
            star: null,
            cross: null
        };
        this._trianglesPerMode = { tuft: 0, star: 0, cross: 0 };
        this._trianglesPerInstance = { master: 0, near: 0, mid: 0, far: 0 };

        this._lodShaderState = {
            enableMaster: 1,
            forceTier: 0,
            distMaster: 0,
            distNearMidFarCutoff: new THREE.Vector4(),
            transition: 0.001,
            angleBoundsDeg: new THREE.Vector2(12, 70),
            angleScale: new THREE.Vector2(0.78, 1.22),
            masterMaxDeg: 18,
            tierMap: new THREE.Vector4(0, 1, 2, 3)
        };

        this._lodRings = null;

        this._tmpFrustum = new THREE.Frustum();
        this._tmpMatrix = new THREE.Matrix4();
        this._tmpCamDir = new THREE.Vector3();
        this._tmpHsl = { h: 0, s: 0, l: 0 };
        this._tmpColor = new THREE.Color();

        this._lodRingsKey = this._getLodRingsKey(this._config);

        if (this._scene) this._scene.add(this.group);
        this._syncLodShaderState();
        this._rebuildGeometries();
        this._rebuildChunks();
        this._rebuildDebugOverlays();
    }

    dispose() {
        if (this._scene && this.group) this._scene.remove(this.group);

        this._disposeDebugOverlays();
        this._disposeChunkMeshes();
        this._disposeGeometries();
        this.group?.remove?.();

        this._scene = null;
        this._terrainMesh = null;
        this._terrainGrid = null;
    }

    setTerrain({ terrainMesh, terrainGrid } = {}) {
        this._terrainMesh = terrainMesh ?? this._terrainMesh;
        this._terrainGrid = terrainGrid ?? this._terrainGrid;
        this._rebuildChunks();
        this._rebuildDebugOverlays();
    }

    setConfig(nextConfig) {
        const next = sanitizeGrassEngineConfig(nextConfig);
        const nextInstanceKey = getGrassEngineInstanceKey(next);

        const prev = this._config;
        const prevInstanceKey = this._instanceKey;
        const prevRingsKey = this._lodRingsKey;
        this._config = next;
        this._instanceKey = nextInstanceKey;

        const patchSizeChanged = prev?.patch?.sizeMeters !== next.patch.sizeMeters;
        if (patchSizeChanged) {
            this._disposeChunkMeshes();
            this._rebuildChunks();
            this._rebuildDebugOverlays();
        }

        const geoChanged = (prev?.geometry?.tuft?.bladesPerTuft !== next.geometry.tuft.bladesPerTuft)
            || (Math.abs(Number(prev?.geometry?.tuft?.radius) - next.geometry.tuft.radius) > 1e-6);

        if (geoChanged) {
            this._disposeChunkMeshes();
            this._rebuildGeometries();
        }

        if (prevInstanceKey !== nextInstanceKey) {
            for (const chunk of this._chunks) {
                const meshes = chunk?.meshes;
                if (!meshes) continue;
                for (const tier of GRASS_LOD_TIERS) {
                    const mesh = meshes[tier];
                    if (!mesh?.isInstancedMesh) continue;
                    mesh.userData.filledCount = 0;
                    mesh.userData.fillKey = '';
                }
            }
        }

        this._syncLodShaderState();
        this._syncTrianglesPerTier();

        if (prev?.material?.roughness !== next.material.roughness || prev?.material?.metalness !== next.material.metalness) {
            for (const chunk of this._chunks) {
                const meshes = chunk?.meshes;
                if (!meshes) continue;
                for (const tier of GRASS_LOD_TIERS) {
                    const mesh = meshes[tier];
                    if (!mesh?.isInstancedMesh) continue;
                    applyGrassMaterialSettings(mesh.material, next.material);
                    this._applyLodShaderStateToMaterial(mesh.material, tier);
                }
            }
        }
        this._syncAllChunkMaterialsLodState();

        const nextRingsKey = this._getLodRingsKey(next);
        if (!patchSizeChanged && nextRingsKey !== prevRingsKey) {
            this._lodRings?.removeFromParent?.();
            this._lodRings = this._buildLodRings();
            if (this._lodRings) this.group.add(this._lodRings);
        }
        this._lodRingsKey = nextRingsKey;
    }

    getStats() {
        let totalInstances = 0;
        let drawCalls = 0;
        const instancesByTier = { master: 0, near: 0, mid: 0, far: 0 };

        for (const chunk of this._chunks) {
            const meshes = chunk.meshes;
            if (!meshes) continue;
            for (const tier of GRASS_LOD_TIERS) {
                const mesh = meshes[tier];
                if (!mesh?.isInstancedMesh || !mesh.visible) continue;
                const n = Math.max(0, mesh.count | 0);
                if (!n) continue;
                instancesByTier[tier] += n;
                totalInstances += n;
                drawCalls += 1;
            }
        }

        const trianglesByTier = {
            master: instancesByTier.master * this._trianglesPerInstance.master,
            near: instancesByTier.near * this._trianglesPerInstance.near,
            mid: instancesByTier.mid * this._trianglesPerInstance.mid,
            far: instancesByTier.far * this._trianglesPerInstance.far
        };
        const totalTriangles = trianglesByTier.master + trianglesByTier.near + trianglesByTier.mid + trianglesByTier.far;

        return {
            enabled: !!this._config.enabled,
            patches: this._chunks.length,
            drawCalls,
            totalInstances,
            totalTriangles,
            instancesByTier,
            trianglesByTier
        };
    }

    update({ camera } = {}) {
        const cfg = this._config;
        if (!cfg.enabled) {
            this.group.visible = false;
            return;
        }
        this.group.visible = true;

        const cam = camera?.isCamera ? camera : null;
        const terrainGrid = this._terrainGrid;
        const terrainGeo = this._terrainMesh?.geometry;
        const posAttr = terrainGeo?.attributes?.position ?? null;
        if (!cam || !terrainGrid || !posAttr?.isBufferAttribute) return;

        this._tmpMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        this._tmpFrustum.setFromProjectionMatrix(this._tmpMatrix);

        const camPos = cam.position;
        const yOffset = Number(cfg.patch?.yOffset) || 0;

        const field = cfg.field && typeof cfg.field === 'object' ? cfg.field : null;
        const baseDensity = (field?.enabled === false)
            ? 0
            : Math.max(0, Number(field?.density) || 0) * Math.max(0, Number(cfg.density?.globalMultiplier) || 0);
        const anyDensity = baseDensity > EPS;

        const cutoff = Math.max(0, Number(cfg?.lod?.distances?.cutoff) || 0);
        cam.getWorldDirection(this._tmpCamDir);
        const viewAngleDeg = THREE.MathUtils.radToDeg(Math.asin(clamp(Math.abs(this._tmpCamDir.y), 0, 1, 0)));
        const grazingDeg = clamp(cfg?.lod?.angle?.grazingDeg, 0.0, 89.0, 12.0);
        const topDownDeg = clamp(cfg?.lod?.angle?.topDownDeg, grazingDeg + 0.01, 90.0, 70.0);
        const angleT = clamp((viewAngleDeg - grazingDeg) / (topDownDeg - grazingDeg), 0.0, 1.0, 0.0);
        const scaleG = clamp(cfg?.lod?.angle?.grazingDistanceScale, 0.1, 10.0, 0.78);
        const scaleT = clamp(cfg?.lod?.angle?.topDownDistanceScale, 0.1, 10.0, 1.22);
        const angleScale = scaleG + (scaleT - scaleG) * angleT;

        const tierIntervals = this._getTierActiveIntervals(viewAngleDeg);
        const exclusionRects = this._getExpandedExclusionRects();

        for (let i = 0; i < this._chunks.length; i++) {
            const chunk = this._chunks[i];
            const sphere = chunk.sphere;
            if (!this._tmpFrustum.intersectsSphere(sphere)) {
                this._hideChunk(chunk);
                chunk.group.visible = false;
                continue;
            }

            const centerDist = chunk.center.distanceTo(camPos);
            const radius = Math.max(0, Number(sphere?.radius) || 0);
            const minDist = Math.max(0, centerDist - radius);
            const maxDist = Math.max(minDist, centerDist + radius);
            const minEffectiveDist = minDist * angleScale;
            const maxEffectiveDist = maxDist * angleScale;
            if (cutoff > EPS && minEffectiveDist > cutoff) {
                this._hideChunk(chunk);
                chunk.group.visible = false;
                continue;
            }

            chunk.group.visible = true;

            if (!anyDensity) {
                this._hideChunk(chunk);
                continue;
            }

            const counts = this._getInstanceCountsForChunk(chunk, { baseDensity, exclusionRects });
            for (const tier of GRASS_LOD_TIERS) {
                const count = Math.max(0, counts[tier] | 0);
                const interval = tierIntervals?.[tier] ?? null;
                const mode = getRenderModeForTier(cfg, tier);
                const active = interval && intervalsOverlap(interval, { min: minEffectiveDist, max: maxEffectiveDist });
                if (!count || mode === 'none' || !active) {
                    const mesh = chunk.meshes?.[tier] ?? null;
                    if (mesh) {
                        mesh.visible = false;
                        mesh.count = 0;
                    }
                    continue;
                }

                const mesh = this._ensureChunkMesh(chunk, tier, count);
                if (!mesh) continue;
                mesh.visible = true;
                mesh.count = count;

                if (mesh.userData?.filledCount === count && mesh.userData?.fillKey === this._instanceKey) continue;

                this._fillMeshInstances(mesh, {
                    tier,
                    count,
                    chunk,
                    field,
                    exclusionRects,
                    terrainGrid,
                    posAttr,
                    yOffset
                });
            }
        }

        this._updateLodRings({ camera: cam });
    }

    _syncLodShaderState() {
        const cfg = this._config;
        const lod = cfg?.lod && typeof cfg.lod === 'object' ? cfg.lod : {};
        const field = cfg?.field && typeof cfg.field === 'object' ? cfg.field : {};
        const fieldForce = String(field?.lod?.force ?? 'auto');
        const globalForce = String(lod?.force ?? 'auto');
        const force = fieldForce !== 'auto' ? fieldForce : globalForce;

        const enableMaster = lod.enableMaster !== false;
        this._lodShaderState.enableMaster = enableMaster ? 1 : 0;
        this._lodShaderState.forceTier = forceToIndex(force);
        this._lodShaderState.distMaster = Math.max(0, Number(lod?.distances?.master) || 0);

        const near = Math.max(0, Number(lod?.distances?.near) || 0);
        const mid = Math.max(near, Number(lod?.distances?.mid) || near);
        const far = Math.max(mid, Number(lod?.distances?.far) || mid);
        const cutoff = Math.max(far, Number(lod?.distances?.cutoff) || far);
        this._lodShaderState.distNearMidFarCutoff.set(near, mid, far, cutoff);

        this._lodShaderState.transition = Math.max(0.001, Number(lod?.transitionWidthMeters) || 0.001);

        const grazingDeg = clamp(lod?.angle?.grazingDeg, 0.0, 89.0, 12.0);
        const topDownDeg = clamp(lod?.angle?.topDownDeg, grazingDeg + 0.01, 90.0, 70.0);
        this._lodShaderState.angleBoundsDeg.set(grazingDeg, topDownDeg);
        this._lodShaderState.angleScale.set(
            clamp(lod?.angle?.grazingDistanceScale, 0.1, 10.0, 0.78),
            clamp(lod?.angle?.topDownDistanceScale, 0.1, 10.0, 1.22)
        );
        this._lodShaderState.masterMaxDeg = clamp(lod?.angle?.masterMaxDeg, 0.0, 89.0, 18.0);

        const allowMaskRaw = field?.lod?.allow ?? null;
        const allowMask = {
            master: !!allowMaskRaw?.master && getRenderModeForTier(cfg, 'master') !== 'none',
            near: !!allowMaskRaw?.near && getRenderModeForTier(cfg, 'near') !== 'none',
            mid: !!allowMaskRaw?.mid && getRenderModeForTier(cfg, 'mid') !== 'none',
            far: !!allowMaskRaw?.far && getRenderModeForTier(cfg, 'far') !== 'none'
        };
        this._lodShaderState.tierMap.copy(computeAllowedTierMap(allowMask, enableMaster));
    }

    _applyLodShaderStateToMaterial(material, tier) {
        const mat = material?.isMeshStandardMaterial ? material : null;
        if (!mat) return;

        mat.userData = mat.userData ?? {};
        mat.userData.grassTierIndex = tierToIndex(tier);
        mat.userData.grassEnableMaster = this._lodShaderState.enableMaster;
        mat.userData.grassForceTier = this._lodShaderState.forceTier;
        mat.userData.grassDistMaster = this._lodShaderState.distMaster;
        mat.userData.grassDistNearMidFarCutoff = this._lodShaderState.distNearMidFarCutoff;
        mat.userData.grassTransition = this._lodShaderState.transition;
        mat.userData.grassAngleBoundsDeg = this._lodShaderState.angleBoundsDeg;
        mat.userData.grassAngleScale = this._lodShaderState.angleScale;
        mat.userData.grassMasterMaxDeg = this._lodShaderState.masterMaxDeg;
        mat.userData.grassTierMap = this._lodShaderState.tierMap;

        ensureGrassLodShaderOnMaterial(mat);
        syncGrassLodUniformsOnMaterial(mat);
    }

    _syncAllChunkMaterialsLodState() {
        for (const chunk of this._chunks) {
            const meshes = chunk?.meshes;
            if (!meshes) continue;
            for (const tier of GRASS_LOD_TIERS) {
                const mesh = meshes[tier];
                if (!mesh?.isInstancedMesh) continue;
                this._applyLodShaderStateToMaterial(mesh.material, tier);
            }
        }
    }

    _getExpandedExclusionRects() {
        const cfg = this._config;
        const ex = cfg?.exclusion && typeof cfg.exclusion === 'object' ? cfg.exclusion : {};
        if (ex.enabled === false) return [];
        const margin = Math.max(0, Number(ex.marginMeters) || 0);

        const rects = typeof this._getExclusionRects === 'function' ? this._getExclusionRects() : [];
        const out = [];
        for (const r of Array.isArray(rects) ? rects : []) {
            if (!r || typeof r !== 'object') continue;
            const x0 = Number(r.x0);
            const x1 = Number(r.x1);
            const z0 = Number(r.z0);
            const z1 = Number(r.z1);
            if (!(Number.isFinite(x0) && Number.isFinite(x1) && Number.isFinite(z0) && Number.isFinite(z1))) continue;
            const minX = Math.min(x0, x1) - margin;
            const maxX = Math.max(x0, x1) + margin;
            const minZ = Math.min(z0, z1) - margin;
            const maxZ = Math.max(z0, z1) + margin;
            out.push({ x0: minX, x1: maxX, z0: minZ, z1: maxZ });
        }
        return out;
    }

    _syncTrianglesPerTier() {
        for (const tier of GRASS_LOD_TIERS) {
            const mode = getRenderModeForTier(this._config, tier);
            this._trianglesPerInstance[tier] = mode === 'tuft'
                ? this._trianglesPerMode.tuft
                : mode === 'star'
                    ? this._trianglesPerMode.star
                    : mode === 'cross' || mode === 'cross_sparse'
                        ? this._trianglesPerMode.cross
                        : 0;
        }
    }

    _getTierActiveIntervals(viewAngleDeg) {
        const cfg = this._config;
        const lod = cfg?.lod && typeof cfg.lod === 'object' ? cfg.lod : {};

        const enableMaster = lod.enableMaster !== false;
        const distances = lod.distances && typeof lod.distances === 'object' ? lod.distances : {};
        const masterDist = Math.max(0, Number(distances.master) || 0);
        const nearEnd = Math.max(0, Number(distances.near) || 0);
        const midEnd = Math.max(0, Number(distances.mid) || 0);
        const cutoff = Math.max(0, Number(distances.cutoff) || 0);
        const w = Math.max(0.001, Number(lod.transitionWidthMeters) || 0.001);

        const field = cfg?.field && typeof cfg.field === 'object' ? cfg.field : {};
        const allowMaskRaw = field?.lod?.allow ?? null;
        const allowMask = {
            master: !!allowMaskRaw?.master && getRenderModeForTier(cfg, 'master') !== 'none',
            near: !!allowMaskRaw?.near && getRenderModeForTier(cfg, 'near') !== 'none',
            mid: !!allowMaskRaw?.mid && getRenderModeForTier(cfg, 'mid') !== 'none',
            far: !!allowMaskRaw?.far && getRenderModeForTier(cfg, 'far') !== 'none'
        };

        const tierMap = computeAllowedTierMap(allowMask, enableMaster);
        const mapIdx = [
            Math.round(Number(tierMap.x) || 0),
            Math.round(Number(tierMap.y) || 0),
            Math.round(Number(tierMap.z) || 0),
            Math.round(Number(tierMap.w) || 0)
        ];

        const intervalsByTier = { master: null, near: null, mid: null, far: null };
        const addToTier = (tierIndex, interval) => {
            const idx = tierIndex | 0;
            if (idx === 0) intervalsByTier.master = unionIntervals(intervalsByTier.master, interval);
            else if (idx === 1) intervalsByTier.near = unionIntervals(intervalsByTier.near, interval);
            else if (idx === 2) intervalsByTier.mid = unionIntervals(intervalsByTier.mid, interval);
            else if (idx === 3) intervalsByTier.far = unionIntervals(intervalsByTier.far, interval);
        };
        const addWeightInterval = (weightIndex, interval) => {
            const idx = mapIdx[weightIndex] ?? 1;
            addToTier(idx, interval);
        };

        const fieldForce = String(field?.lod?.force ?? 'auto');
        const globalForce = String(lod?.force ?? 'auto');
        const force = fieldForce !== 'auto' ? fieldForce : globalForce;

        if (force === 'none') return intervalsByTier;

        if (force === 'master') {
            addWeightInterval(0, { min: 0, max: Infinity });
            return intervalsByTier;
        }
        if (force === 'near') {
            addWeightInterval(1, { min: 0, max: Infinity });
            return intervalsByTier;
        }
        if (force === 'mid') {
            addWeightInterval(2, { min: 0, max: Infinity });
            return intervalsByTier;
        }
        if (force === 'far') {
            addWeightInterval(3, { min: 0, max: Infinity });
            return intervalsByTier;
        }

        const angle = Number(viewAngleDeg) || 0;
        const masterMaxDeg = clamp(lod?.angle?.masterMaxDeg, 0.0, 89.0, 18.0);
        const canMaster = enableMaster && angle <= masterMaxDeg && masterDist > EPS;
        const nonMasterMin = canMaster ? Math.max(0, masterDist - w) : 0;

        addWeightInterval(1, { min: nonMasterMin, max: Math.max(nonMasterMin, nearEnd + w) });
        addWeightInterval(2, { min: Math.max(nonMasterMin, nearEnd - w), max: Math.max(nonMasterMin, midEnd + w) });
        addWeightInterval(3, { min: Math.max(nonMasterMin, midEnd - w), max: cutoff > EPS ? cutoff : Infinity });
        if (canMaster) addWeightInterval(0, { min: 0, max: masterDist + w });

        return intervalsByTier;
    }

    _rebuildGeometries() {
        this._disposeGeometries();

        const cfg = this._config;
        const blade = createGrassBladeGeometry();
        const tuft = createGrassBladeTuftGeometry({
            bladesPerTuft: cfg.geometry?.tuft?.bladesPerTuft ?? 9,
            radius: cfg.geometry?.tuft?.radius ?? 0.09,
            seed: 'master_tuft'
        });
        const star = createGrassStarGeometry();
        const cross = createGrassCrossGeometry();

        this._geometries.blade = blade;
        this._geometries.tuft = tuft;
        this._geometries.star = star;
        this._geometries.cross = cross;

        this._trianglesPerMode.tuft = computeTriangleCountForGeometry(tuft);
        this._trianglesPerMode.star = computeTriangleCountForGeometry(star);
        this._trianglesPerMode.cross = computeTriangleCountForGeometry(cross);
        this._syncTrianglesPerTier();
    }

    _disposeGeometries() {
        for (const key of Object.keys(this._geometries)) {
            const geo = this._geometries[key];
            geo?.dispose?.();
            this._geometries[key] = null;
        }
        this._trianglesPerMode.tuft = 0;
        this._trianglesPerMode.star = 0;
        this._trianglesPerMode.cross = 0;
        for (const tier of GRASS_LOD_TIERS) this._trianglesPerInstance[tier] = 0;
    }

    _disposeChunkMeshes() {
        for (const chunk of this._chunks) {
            if (!chunk?.group) continue;
            chunk.group.traverse((child) => {
                if (!child?.isMesh) return;
                const mat = child.material;
                if (Array.isArray(mat)) for (const m of mat) m?.dispose?.();
                else mat?.dispose?.();
            });
            chunk.group.clear();
            chunk.meshes = { master: null, near: null, mid: null, far: null };
        }
    }

    _hideChunk(chunk) {
        const meshes = chunk.meshes;
        if (!meshes) return;
        for (const tier of GRASS_LOD_TIERS) {
            const mesh = meshes[tier];
            if (!mesh) continue;
            mesh.visible = false;
            mesh.count = 0;
        }
    }

    _rebuildChunks() {
        this._disposeChunkMeshes();
        for (const chunk of this._chunks) chunk.group?.remove?.();
        this._chunks = [];
        this.group.clear();

        const terrainGrid = this._terrainGrid;
        if (!terrainGrid) return;

        const tileSize = Number(terrainGrid.tileSize) || 24;
        const widthTiles = Math.max(1, Number(terrainGrid.widthTiles) || 1);
        const depthTiles = Math.max(1, Number(terrainGrid.depthTiles) || 1);
        const minX = Number(terrainGrid.minX) || 0;
        const minZ = Number(terrainGrid.minZ) || 0;
        const maxX = minX + widthTiles * tileSize;
        const maxZ = minZ + depthTiles * tileSize;

        const heightMin = Number(terrainGrid.minY) || 0;
        const heightMax = Number(terrainGrid.maxY) || 0;

        const patchSize = Math.max(4, Number(this._config?.patch?.sizeMeters) || 72);
        const cxCount = Math.max(1, Math.ceil((maxX - minX) / patchSize));
        const czCount = Math.max(1, Math.ceil((maxZ - minZ) / patchSize));

        let idx = 0;
        for (let cz = 0; cz < czCount; cz++) {
            for (let cx = 0; cx < cxCount; cx++) {
                const x0 = minX + cx * patchSize;
                const x1 = Math.min(maxX, x0 + patchSize);
                const z0 = minZ + cz * patchSize;
                const z1 = Math.min(maxZ, z0 + patchSize);

                const center = new THREE.Vector3((x0 + x1) * 0.5, (heightMin + heightMax) * 0.5, (z0 + z1) * 0.5);
                const dx = (x1 - x0) * 0.5;
                const dz = (z1 - z0) * 0.5;
                const dy = (heightMax - heightMin) * 0.5;
                const radius = Math.sqrt(dx * dx + dz * dz + dy * dy);
                const sphere = new THREE.Sphere(center.clone(), radius);

                const group = new THREE.Group();
                group.name = `GrassPatch_${idx}`;
                group.position.set(0, 0, 0);

                this.group.add(group);
                this._chunks.push({
                    idx,
                    id: `${cx},${cz}`,
                    bounds: { x0, x1, z0, z1, minX, maxX, minZ, maxZ },
                    center,
                    sphere,
                    group,
                    meshes: { master: null, near: null, mid: null, far: null }
                });
                idx++;
            }
        }
    }

    _getInstanceCountsForChunk(chunk, { baseDensity = 0, exclusionRects = [] } = {}) {
        const cfg = this._config;
        const bounds = chunk.bounds;
        const patchMeters2 = Math.max(0, (bounds.x1 - bounds.x0) * (bounds.z1 - bounds.z0));

        let excludedMeters2 = 0;
        for (const rect of Array.isArray(exclusionRects) ? exclusionRects : []) {
            if (!rect || typeof rect !== 'object') continue;
            const rx0 = Number(rect.x0);
            const rx1 = Number(rect.x1);
            const rz0 = Number(rect.z0);
            const rz1 = Number(rect.z1);
            if (!(Number.isFinite(rx0) && Number.isFinite(rx1) && Number.isFinite(rz0) && Number.isFinite(rz1))) continue;
            const x0 = Math.max(bounds.x0, Math.min(rx0, rx1));
            const x1 = Math.min(bounds.x1, Math.max(rx0, rx1));
            const z0 = Math.max(bounds.z0, Math.min(rz0, rz1));
            const z1 = Math.min(bounds.z1, Math.max(rz0, rz1));
            excludedMeters2 += Math.max(0, x1 - x0) * Math.max(0, z1 - z0);
        }
        const grassMeters2 = Math.max(0, patchMeters2 - Math.min(patchMeters2, excludedMeters2));

        const base = Math.max(0, Number(baseDensity) || 0);
        const countFor = (tier) => {
            const mul = getGrassLodDensityMultiplier(cfg, tier);
            const raw = base * mul * grassMeters2;
            return Math.max(0, Math.round(raw));
        };

        const far = countFor('far');
        const mid = Math.max(far, countFor('mid'));
        const near = Math.max(mid, countFor('near'));
        const master = cfg.lod?.enableMaster === false ? 0 : Math.max(near, countFor('master'));

        return { master, near, mid, far };
    }

    _ensureChunkMesh(chunk, tier, count) {
        if (!chunk?.group) return null;
        if (!chunk.meshes) chunk.meshes = { master: null, near: null, mid: null, far: null };

        const existing = chunk.meshes[tier];
        const capacity = Math.max(1, count | 0);
        const mode = getRenderModeForTier(this._config, tier);
        if (mode === 'none') return null;
        const geo = mode === 'tuft'
            ? this._geometries.tuft
            : mode === 'star'
                ? this._geometries.star
                : this._geometries.cross;
        const geometryKey = mode;
        if (!geo) return null;

        if (existing?.isInstancedMesh) {
            const cap = existing.instanceMatrix?.count ?? 0;
            if (cap >= capacity && existing.userData?.geometryKey === geometryKey) return existing;
            existing.removeFromParent();
            existing.material?.dispose?.();
        }

        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        applyGrassMaterialSettings(mat, this._config.material);
        this._applyLodShaderStateToMaterial(mat, tier);

        const mesh = new THREE.InstancedMesh(geo, mat, capacity);
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.renderOrder = 4;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);

        mesh.userData = mesh.userData ?? {};
        mesh.userData.tier = tier;
        mesh.userData.geometryKey = geometryKey;
        mesh.userData.filledCount = 0;
        mesh.userData.fillKey = '';

        chunk.group.add(mesh);
        chunk.meshes[tier] = mesh;
        return mesh;
    }

    _fillMeshInstances(mesh, { count, chunk, field, exclusionRects, terrainGrid, posAttr, yOffset } = {}) {
        const n = Math.max(0, count | 0);
        if (!n) return;

        const cfg = this._config;
        const bounds = chunk.bounds;
        const rng = makeRng(`${cfg.seed}|chunk:${chunk.id}`);

        const baseColor = colorFromHexString(field?.color?.base ?? '#2E8F3D');
        baseColor.getHSL(this._tmpHsl);
        const hueMin = Number(field?.color?.variation?.hueShiftDeg?.min) || 0;
        const hueMax = Number(field?.color?.variation?.hueShiftDeg?.max) || 0;
        const satMin = Number(field?.color?.variation?.saturationMul?.min) || 1;
        const satMax = Number(field?.color?.variation?.saturationMul?.max) || 1;
        const briMin = Number(field?.color?.variation?.brightnessMul?.min) || 1;
        const briMax = Number(field?.color?.variation?.brightnessMul?.max) || 1;

        const heightMin = clamp(field?.height?.min, 0.01, 10.0, 0.03);
        const heightMax = Math.max(heightMin, clamp(field?.height?.max, 0.01, 10.0, 0.05));

        const widthMeters = clamp(cfg.geometry?.blade?.width, 0.001, 10.0, 0.01);
        const heightMul = clamp(cfg.geometry?.blade?.height, 0.05, 10.0, 1.0);
        const mode = getRenderModeForTier(cfg, mesh.userData?.tier ?? 'near');
        const tuftRadiusMul = Math.max(0, Number(cfg.geometry?.tuft?.radius) || 0);
        const tuftFootprint = widthMeters * Math.max(1.0, tuftRadiusMul * 2.0);

        const matArr = mesh.instanceMatrix.array;
        const colArr = mesh.instanceColor?.array ?? null;
        if (!(matArr?.length >= n * 16)) return;
        if (!colArr || colArr.length < n * 3) return;

        const grid = terrainGrid;
        const sampler = { positionAttr: posAttr, nx: grid.nx, nz: grid.nz, minX: grid.minX, minZ: grid.minZ, dx: grid.dx, dz: grid.dz };

        const outColor = this._tmpColor;

        const rects = Array.isArray(exclusionRects) ? exclusionRects : [];
        const hasExclusion = rects.length > 0;
        const isExcluded = hasExclusion
            ? (x, z) => {
                for (const rect of rects) {
                    if (!rect || typeof rect !== 'object') continue;
                    if (x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1) return true;
                }
                return false;
            }
            : null;

        const maxAttempts = Math.max(512, n * 200);
        let filled = 0;
        let attempts = 0;
        while (filled < n && attempts < maxAttempts) {
            attempts++;
            const x = bounds.x0 + (bounds.x1 - bounds.x0) * rng();
            const z = bounds.z0 + (bounds.z1 - bounds.z0) * rng();
            if (isExcluded && isExcluded(x, z)) continue;
            const y = sampleTerrainHeightBilinear(sampler, x, z) + yOffset;
            const yaw = rng() * Math.PI * 2;

            const heightMeters = (heightMin + (heightMax - heightMin) * rng()) * heightMul;
            const sy = heightMeters;
            const sx = mode === 'tuft' ? widthMeters : tuftFootprint;
            const sz = sx;

            writeYRotationScaleTranslationIntoArray(matArr, filled * 16, { x, y, z, yawRad: yaw, sx, sy, sz });

            const hueShift = (hueMin + (hueMax - hueMin) * rng()) / 360.0;
            const satMul = satMin + (satMax - satMin) * rng();
            const briMul = briMin + (briMax - briMin) * rng();

            const h = (this._tmpHsl.h + hueShift) % 1.0;
            const s = clamp(this._tmpHsl.s * satMul, 0.0, 1.0, this._tmpHsl.s);
            const l = clamp(this._tmpHsl.l * briMul, 0.0, 1.0, this._tmpHsl.l);
            outColor.setHSL(h < 0 ? (h + 1.0) : h, s, l);

            const base = filled * 3;
            colArr[base] = outColor.r;
            colArr[base + 1] = outColor.g;
            colArr[base + 2] = outColor.b;

            filled++;
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.userData.filledCount = filled;
        mesh.userData.fillKey = this._instanceKey;
        mesh.count = filled;
    }

    _disposeDebugOverlays() {
        if (this._lodRings) {
            this._lodRings.traverse((c) => {
                c?.geometry?.dispose?.();
                c?.material?.dispose?.();
            });
            this._lodRings.removeFromParent();
            this._lodRings = null;
        }
    }

    _rebuildDebugOverlays() {
        this._disposeDebugOverlays();
        this._lodRings = this._buildLodRings();
        if (this._lodRings) this.group.add(this._lodRings);
        this._lodRingsKey = this._getLodRingsKey(this._config);
    }

    _getLodRingsKey(config) {
        const d = config?.lod?.distances ?? null;
        if (!d) return '';
        const master = Number(d.master) || 0;
        const near = Number(d.near) || 0;
        const mid = Number(d.mid) || 0;
        const far = Number(d.far) || 0;
        const cutoff = Number(d.cutoff) || 0;
        const enabled = config?.lod?.enableMaster !== false ? '1' : '0';
        return `${enabled}|${master.toFixed(3)}|${near.toFixed(3)}|${mid.toFixed(3)}|${far.toFixed(3)}|${cutoff.toFixed(3)}`;
    }

    _buildLodRings() {
        const cfg = this._config;
        const d = cfg.lod?.distances ?? null;
        if (!d) return null;

        const radii = [
            ...(cfg.lod?.enableMaster !== false ? [Math.max(0, Number(d.master) || 0)] : []),
            Math.max(0, Number(d.near) || 0),
            Math.max(0, Number(d.mid) || 0),
            Math.max(0, Number(d.far) || 0),
            Math.max(0, Number(d.cutoff) || 0)
        ].filter((r) => r > EPS);
        if (!radii.length) return null;

        const group = new THREE.Group();
        group.name = 'GrassLodRings';
        group.visible = !!cfg.debug?.showLodRings;

        const segments = 128;
        const makeRing = (radius, color) => {
            const pts = [];
            for (let i = 0; i <= segments; i++) {
                const t = (i / segments) * Math.PI * 2;
                pts.push(new THREE.Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
            }
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 });
            const line = new THREE.Line(geo, mat);
            line.frustumCulled = false;
            line.renderOrder = 20;
            return line;
        };

        const colors = [0xdddddd, 0x76d37a, 0x58a7ff, 0xffb84a, 0xff5c63];
        for (let i = 0; i < radii.length; i++) {
            const r = radii[i];
            const line = makeRing(r, colors[Math.min(colors.length - 1, i)]);
            group.add(line);
        }

        return group;
    }

    _updateLodRings({ camera } = {}) {
        const rings = this._lodRings;
        if (!rings) return;
        rings.visible = !!this._config.debug?.showLodRings;
        if (!rings.visible) return;

        const cam = camera?.isCamera ? camera : null;
        if (!cam) return;
        rings.position.set(cam.position.x, (this._terrainGrid?.minY ?? 0) + 0.05, cam.position.z);
    }
}
