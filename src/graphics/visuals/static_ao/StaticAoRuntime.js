// src/graphics/visuals/static_ao/StaticAoRuntime.js
// Instance-level static AO baked into geometry attributes (no shared texture baking).
// @ts-check

import * as THREE from 'three';
import { applyStaticAoToMeshStandardMaterial } from './StaticAoMaterialPatch.js';
import { buildBuildingDistanceField, sampleBuildingBoundaryDistanceMeters } from './StaticAoDistanceField.js';

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / Math.max(1e-9, edge1 - edge0), 0, 1, 0);
    return t * t * (3 - 2 * t);
}

function isStaticAoEnabled(settings) {
    const s = settings && typeof settings === 'object' ? settings : null;
    return (s?.mode ?? 'off') !== 'off';
}

function getGroundY(city) {
    const cfg = city?.generatorConfig ?? null;
    const gy = Number(cfg?.ground?.surfaceY);
    if (Number.isFinite(gy)) return gy;
    const ry = Number(cfg?.road?.surfaceY);
    if (Number.isFinite(ry)) return ry;
    return 0;
}

function isOpaqueMeshStandardMaterial(material) {
    const mat = material && typeof material === 'object' ? material : null;
    if (!mat?.isMeshStandardMaterial) return false;
    if (mat.transparent === true) return false;
    const opacity = Number(mat.opacity);
    if (Number.isFinite(opacity) && opacity < 0.999) return false;
    return true;
}

function shouldSkipMesh(mesh) {
    const m = mesh ?? null;
    if (!m?.isMesh && !m?.isInstancedMesh) return true;
    if (m.userData?.isFoliage === true) return true;
    const material = m.material ?? null;
    const mats = Array.isArray(material) ? material : (material ? [material] : []);
    if (mats.some((mat) => mat?.userData?.isFoliage === true)) return true;
    return false;
}

function getMeshMaterials(mesh) {
    const m = mesh ?? null;
    const material = m?.material ?? null;
    return Array.isArray(material) ? material : (material ? [material] : []);
}

function computeBakeKey(settings) {
    const s = settings && typeof settings === 'object' ? settings : {};
    const quality = typeof s.quality === 'string' ? s.quality : 'medium';
    const radius = clamp(s.radius, 0.25, 32, 4);
    const wallHeight = clamp(s.wallHeight, 0.25, 12, 1.6);
    return `v1|q=${quality}|r=${radius.toFixed(3)}|w=${wallHeight.toFixed(3)}`;
}

function computeMaterialKey(settings) {
    const s = settings && typeof settings === 'object' ? settings : {};
    const intensity = clamp(s.intensity, 0, 2, 0.6);
    const debugView = s.debugView === true;
    return `v1|i=${intensity.toFixed(3)}|d=${debugView ? 1 : 0}`;
}

function ensureFloatAttribute(geometry, name, count) {
    const geo = geometry ?? null;
    if (!geo?.isBufferGeometry) return null;
    const existing = geo.getAttribute?.(name) ?? null;
    if (existing?.isBufferAttribute && existing.itemSize === 1 && existing.count === count && existing.array instanceof Float32Array) {
        return existing;
    }
    const attr = new THREE.BufferAttribute(new Float32Array(count), 1);
    geo.setAttribute(name, attr);
    return attr;
}

function ensureInstancedFloatAttribute(geometry, name, count) {
    const geo = geometry ?? null;
    if (!geo?.isBufferGeometry) return null;
    const existing = geo.getAttribute?.(name) ?? null;
    if (existing?.isInstancedBufferAttribute && existing.itemSize === 1 && existing.count === count && existing.array instanceof Float32Array) {
        return existing;
    }
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    geo.setAttribute(name, attr);
    return attr;
}

function bakeGroundAoOnGeometry(mesh, distanceField, { radiusMeters = 4 } = {}) {
    const m = mesh ?? null;
    const geo = m?.geometry ?? null;
    if (!m?.isMesh || !geo?.isBufferGeometry) return false;
    const pos = geo.attributes?.position ?? null;
    if (!pos?.isBufferAttribute) return false;
    const count = pos.count;
    if (!count) return false;

    if (!geo.attributes?.normal) geo.computeVertexNormals?.();
    const nor = geo.attributes?.normal ?? null;
    if (!nor?.isBufferAttribute) return false;

    m.updateMatrixWorld?.(true);
    const e = m.matrixWorld.elements;

    const attr = ensureFloatAttribute(geo, 'staticAo', count);
    const out = attr.array;

    const radius = Math.max(0.001, Number(radiusMeters) || 4);
    for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const wz = e[2] * x + e[6] * y + e[10] * z + e[14];

        const dist = sampleBuildingBoundaryDistanceMeters(distanceField, wx, wz);
        const t = smoothstep(0, radius, dist);
        const groundAo = t;

        const ny = nor.getY(i);
        const upness = smoothstep(0.1, 0.85, ny);
        out[i] = clamp(1 - (1 - groundAo) * upness, 0, 1, 1);
    }

    attr.needsUpdate = true;
    geo.userData = geo.userData ?? {};
    geo.userData.staticAoBaked = true;
    geo.userData.staticAoKind = 'ground';
    return true;
}

function bakeGroundAoOnInstancedTiles(mesh, distanceField, { radiusMeters = 4 } = {}) {
    const m = mesh ?? null;
    const geo = m?.geometry ?? null;
    if (!m?.isInstancedMesh || !geo?.isBufferGeometry) return false;
    const instanceCount = Math.max(0, Math.floor(Number(m.count) || 0));
    if (!instanceCount) return false;

    m.updateMatrixWorld?.(true);

    const attr = ensureInstancedFloatAttribute(geo, 'staticAo', instanceCount);
    const out = attr.array;

    const radius = Math.max(0.001, Number(radiusMeters) || 4);
    const tmp = new THREE.Matrix4();
    for (let i = 0; i < instanceCount; i++) {
        m.getMatrixAt(i, tmp);
        const el = tmp.elements;
        const wx = el[12];
        const wz = el[14];
        const dist = sampleBuildingBoundaryDistanceMeters(distanceField, wx, wz);
        out[i] = smoothstep(0, radius, dist);
    }

    attr.needsUpdate = true;
    geo.userData = geo.userData ?? {};
    geo.userData.staticAoBaked = true;
    geo.userData.staticAoKind = 'ground_instanced';
    return true;
}

function computeCornerFactor(geometry) {
    const geo = geometry ?? null;
    if (!geo?.isBufferGeometry) return null;
    const index = geo.index?.array ?? null;
    const pos = geo.attributes?.position ?? null;
    if (!index || !pos?.isBufferAttribute) return null;
    if (!geo.attributes?.normal) geo.computeVertexNormals?.();
    const nor = geo.attributes?.normal ?? null;
    if (!nor?.isBufferAttribute) return null;

    const count = pos.count;
    const accum = new Float32Array(count);
    const hits = new Uint32Array(count);

    const ax = new THREE.Vector3();
    const bx = new THREE.Vector3();
    const cx = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const faceN = new THREE.Vector3();

    for (let t = 0; t < index.length; t += 3) {
        const ia = index[t];
        const ib = index[t + 1];
        const ic = index[t + 2];
        if (ia === undefined || ib === undefined || ic === undefined) continue;

        ax.fromBufferAttribute(pos, ia);
        bx.fromBufferAttribute(pos, ib);
        cx.fromBufferAttribute(pos, ic);

        ab.subVectors(bx, ax);
        ac.subVectors(cx, ax);
        faceN.crossVectors(ab, ac);
        const len = faceN.length();
        if (len <= 1e-9) continue;
        faceN.multiplyScalar(1 / len);

        const add = (i) => {
            const nx = nor.getX(i);
            const ny = nor.getY(i);
            const nz = nor.getZ(i);
            const dot = Math.max(0, Math.min(1, nx * faceN.x + ny * faceN.y + nz * faceN.z));
            accum[i] += 1 - dot;
            hits[i] += 1;
        };

        add(ia);
        add(ib);
        add(ic);
    }

    for (let i = 0; i < count; i++) {
        const h = hits[i];
        accum[i] = h ? (accum[i] / h) : 0;
    }
    return accum;
}

function bakeBuildingAoOnGeometry(mesh, { groundY = 0, wallHeightMeters = 1.6, cornerEnhance = false } = {}) {
    const m = mesh ?? null;
    const geo = m?.geometry ?? null;
    if (!m?.isMesh || !geo?.isBufferGeometry) return false;
    const pos = geo.attributes?.position ?? null;
    if (!pos?.isBufferAttribute) return false;
    const count = pos.count;
    if (!count) return false;

    if (!geo.attributes?.normal) geo.computeVertexNormals?.();
    const nor = geo.attributes?.normal ?? null;
    if (!nor?.isBufferAttribute) return false;

    const corner = cornerEnhance ? computeCornerFactor(geo) : null;
    const cornerStrength = corner ? 1.35 : 0;

    m.updateMatrixWorld?.(true);
    const e = m.matrixWorld.elements;

    const attr = ensureFloatAttribute(geo, 'staticAo', count);
    const out = attr.array;

    const wallHeight = Math.max(0.001, Number(wallHeightMeters) || 1.6);
    const gy = Number.isFinite(groundY) ? Number(groundY) : 0;

    for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const wy = e[1] * x + e[5] * y + e[9] * z + e[13];

        const h = Math.max(0, wy - gy);
        const wallAo = smoothstep(0, wallHeight, h);

        const ny = nor.getY(i);
        const wallWeight = 1 - smoothstep(0.35, 0.75, Math.abs(ny));
        let ao = 1 - (1 - wallAo) * wallWeight;

        if (corner) {
            const c = corner[i] ?? 0;
            const cornerFactor = clamp(1 - c * cornerStrength, 0, 1, 1);
            ao = Math.min(ao, cornerFactor);
        }

        out[i] = clamp(ao, 0, 1, 1);
    }

    attr.needsUpdate = true;
    geo.userData = geo.userData ?? {};
    geo.userData.staticAoBaked = true;
    geo.userData.staticAoKind = 'building';
    return true;
}

export class StaticAoRuntime {
    constructor() {
        this._city = null;
        this._enabled = false;
        this._bakeKey = null;
        this._materialKey = null;
        this._materials = new WeakMap();
        this._materialClones = new Set();
        this._originalMaterials = new WeakMap();
        this._meshes = new Set();
    }

    dispose() {
        this.setEnabled(false);
        for (const mat of this._materialClones) mat?.dispose?.();
        this._materialClones.clear();
        this._materials = new WeakMap();
        this._originalMaterials = new WeakMap();
        this._meshes.clear();
        this._city = null;
        this._bakeKey = null;
        this._materialKey = null;
    }

    setEnabled(enabled) {
        const next = !!enabled;
        if (next === this._enabled) return;
        this._enabled = next;
        if (next) return;

        for (const mesh of this._meshes) {
            const orig = this._originalMaterials.get(mesh) ?? null;
            if (orig) mesh.material = orig;
        }
        this._meshes.clear();
        this._originalMaterials = new WeakMap();
        this._materialKey = null;
    }

    syncCity(city, ambientOcclusionSettings) {
        const ao = ambientOcclusionSettings && typeof ambientOcclusionSettings === 'object' ? ambientOcclusionSettings : null;
        const staticAo = ao?.staticAo ?? null;

        const nextCity = city ?? null;
        const cityChanged = nextCity !== this._city;
        if (cityChanged) {
            this._city = nextCity;
            this._bakeKey = null;
        }

        if (!nextCity || !staticAo) {
            this.setEnabled(false);
            return;
        }

        const enabled = isStaticAoEnabled(staticAo);
        this.setEnabled(enabled);
        if (!enabled) return;

        const bakeKey = computeBakeKey(staticAo);
        const materialKey = computeMaterialKey(staticAo);
        const needsBake = bakeKey !== this._bakeKey;
        if (needsBake) {
            this._bakeKey = bakeKey;
            this._bakeCity(nextCity, staticAo);
        }

        const needsRescan = cityChanged || needsBake || this._meshes.size === 0;
        if (needsRescan) {
            this._materialKey = materialKey;
            this._applyMaterials(nextCity, staticAo);
            return;
        }

        if (materialKey !== this._materialKey) {
            this._materialKey = materialKey;
            const intensity = clamp(staticAo?.intensity, 0, 2, 0.6);
            const debugView = staticAo?.debugView === true;
            for (const mat of this._materialClones) applyStaticAoToMeshStandardMaterial(mat, { intensity, debugView });
        }
    }

    _bakeCity(city, settings) {
        const mode = settings?.mode ?? 'off';
        if (mode === 'off') return;

        const quality = typeof settings?.quality === 'string' ? settings.quality : 'medium';
        const radius = clamp(settings?.radius, 0.25, 32, 4);
        const wallHeight = clamp(settings?.wallHeight, 0.25, 12, 1.6);
        const groundY = getGroundY(city);
        const debugView = settings?.debugView === true;
        void debugView;

        const map = city?.map ?? null;
        const distanceField = map ? buildBuildingDistanceField(map, { quality }) : null;

        const worldFloor = city?.world?.floor ?? null;
        const worldTiles = city?.world?.groundTiles ?? null;
        const roadsGroup = city?.roads?.group ?? null;
        const buildingsGroup = city?.buildings?.group ?? null;

        if (distanceField) {
            if (worldFloor?.isMesh && !shouldSkipMesh(worldFloor)) {
                bakeGroundAoOnGeometry(worldFloor, distanceField, { radiusMeters: radius });
            }
            if (worldTiles?.isInstancedMesh && !shouldSkipMesh(worldTiles)) {
                bakeGroundAoOnInstancedTiles(worldTiles, distanceField, { radiusMeters: radius });
            }
        }

        if (roadsGroup?.traverse && distanceField) {
            roadsGroup.updateMatrixWorld?.(true);
            roadsGroup.traverse((obj) => {
                if (!obj?.isMesh) return;
                if (shouldSkipMesh(obj)) return;
                bakeGroundAoOnGeometry(obj, distanceField, { radiusMeters: radius });
            });
        }

        const cornerEnhance = quality === 'high';
        if (buildingsGroup?.traverse) {
            buildingsGroup.updateMatrixWorld?.(true);
            buildingsGroup.traverse((obj) => {
                if (!obj?.isMesh) return;
                if (shouldSkipMesh(obj)) return;
                bakeBuildingAoOnGeometry(obj, { groundY, wallHeightMeters: wallHeight, cornerEnhance });
            });
        }
    }

    _getOrCloneMaterial(original, { intensity, debugView }) {
        const src = original && typeof original === 'object' ? original : null;
        if (!src) return original;
        if (!isOpaqueMeshStandardMaterial(src)) return original;

        let clone = this._materials.get(src) ?? null;
        if (!clone) {
            clone = src.clone();
            this._materials.set(src, clone);
            this._materialClones.add(clone);
        }
        applyStaticAoToMeshStandardMaterial(clone, { intensity, debugView });
        return clone;
    }

    _applyMaterials(city, settings) {
        const intensity = clamp(settings?.intensity, 0, 2, 0.6);
        const debugView = settings?.debugView === true;

        const roots = [
            city?.roads?.group ?? null,
            city?.buildings?.group ?? null
        ].filter(Boolean);

        const worldFloor = city?.world?.floor ?? null;
        const worldTiles = city?.world?.groundTiles ?? null;
        if (worldFloor?.isMesh) roots.push(worldFloor);
        if (worldTiles?.isInstancedMesh) roots.push(worldTiles);

        for (const root of roots) {
            if (!root) continue;
            if (root.traverse) {
                root.traverse((obj) => this._patchMeshMaterials(obj, { intensity, debugView }));
                continue;
            }
            this._patchMeshMaterials(root, { intensity, debugView });
        }
    }

    _patchMeshMaterials(obj, { intensity, debugView }) {
        if (!obj?.isMesh && !obj?.isInstancedMesh) return;
        if (shouldSkipMesh(obj)) return;

        const geo = obj.geometry ?? null;
        const staticAoAttr = geo?.getAttribute?.('staticAo') ?? null;
        if (!staticAoAttr?.isBufferAttribute && !staticAoAttr?.isInstancedBufferAttribute) return;

        const srcMat = this._originalMaterials.get(obj) ?? obj.material ?? null;
        const mats = Array.isArray(srcMat) ? srcMat : (srcMat ? [srcMat] : []);
        if (!mats.length) return;

        const wantsAny = mats.some((mat) => isOpaqueMeshStandardMaterial(mat));
        if (!wantsAny) return;

        if (!this._originalMaterials.has(obj)) {
            this._originalMaterials.set(obj, obj.material);
        }

        if (Array.isArray(srcMat)) {
            obj.material = srcMat.map((mat) => this._getOrCloneMaterial(mat, { intensity, debugView }));
        } else {
            obj.material = this._getOrCloneMaterial(srcMat, { intensity, debugView });
        }

        this._meshes.add(obj);
    }
}
