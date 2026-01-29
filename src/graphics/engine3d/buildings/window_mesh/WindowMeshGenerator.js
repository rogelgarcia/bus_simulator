// src/graphics/engine3d/buildings/window_mesh/WindowMeshGenerator.js
// Procedural window mesh generator (frame + muntins + glass + shade + interior).
// @ts-check

import * as THREE from 'three';
import { sanitizeWindowMeshSettings } from '../../../../app/buildings/window_mesh/WindowMeshSettings.js';
import { computeWindowMeshInstanceVariationFromSanitized } from '../../../../app/buildings/window_mesh/WindowMeshVariation.js';
import { buildWindowMeshGeometryBundle, getWindowMeshGeometryKey } from './WindowMeshGeometry.js';
import { createWindowMeshMaterials, disposeWindowMeshMaterialCaches } from './WindowMeshMaterials.js';

const MAX_GEOMETRY_CACHE = 64;

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function disposeGeometryBundle(bundle) {
    bundle?.frame?.dispose?.();
    bundle?.opening?.dispose?.();
    bundle?.muntins?.dispose?.();
    bundle?.joinBar?.dispose?.();
}

function isInteractiveInstance(entry) {
    return !!entry && typeof entry === 'object';
}

function getInstanceId(entry, idx) {
    const raw = entry?.id;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (Number.isFinite(raw)) return String(raw);
    return String(idx | 0);
}

function getInstancePose(entry) {
    const p = entry?.position && typeof entry.position === 'object' ? entry.position : entry;
    const x = Number(p?.x) || 0;
    const y = Number(p?.y) || 0;
    const z = Number(p?.z) || 0;
    const yaw = Number(entry?.yaw) || 0;
    return { x, y, z, yaw };
}

export class WindowMeshGenerator {
    constructor({ renderer = null, curveSegments = 24 } = {}) {
        this.renderer = renderer ?? null;
        this.curveSegments = clamp(curveSegments, 6, 64);

        /** @type {Map<string, any>} */
        this._geometryCache = new Map();
    }

    dispose() {
        for (const bundle of this._geometryCache.values()) disposeGeometryBundle(bundle);
        this._geometryCache.clear();
        disposeWindowMeshMaterialCaches();
    }

    _getOrCreateGeometryBundle(settings) {
        const key = getWindowMeshGeometryKey(settings, { curveSegments: this.curveSegments });
        const cached = this._geometryCache.get(key);
        if (cached) return cached;

        const bundle = buildWindowMeshGeometryBundle(settings, { curveSegments: this.curveSegments });
        this._geometryCache.set(key, bundle);

        if (this._geometryCache.size > MAX_GEOMETRY_CACHE) {
            const firstKey = this._geometryCache.keys().next().value;
            const first = this._geometryCache.get(firstKey) ?? null;
            this._geometryCache.delete(firstKey);
            disposeGeometryBundle(first);
        }

        return bundle;
    }

    createWindowGroup({ settings, seed = 'window', instances = [] } = {}) {
        const s = sanitizeWindowMeshSettings(settings);
        const bundle = this._getOrCreateGeometryBundle(s);
        const mats = createWindowMeshMaterials(s, { renderer: this.renderer });

        const list = Array.isArray(instances) ? instances : [];
        const count = list.length;
        const group = new THREE.Group();
        group.name = 'window_mesh';
        group.userData = group.userData ?? {};
        group.userData.settings = s;

        if (!count) return group;

        const openingGeo = bundle.opening.clone();
        group.userData.ownedGeometries = Object.freeze([openingGeo]);
        const shadeCoverage = new Float32Array(count);
        const interiorUvOffset = new Float32Array(count * 2);
        const interiorUvScale = new Float32Array(count * 2);
        const interiorFlipX = new Float32Array(count);
        const interiorTint = new Float32Array(count * 3);

        const cols = Math.max(1, s.interior.atlas.cols | 0);
        const rows = Math.max(1, s.interior.atlas.rows | 0);
        const uvScaleX = 1 / cols;
        const uvScaleY = 1 / rows;

        for (let i = 0; i < count; i++) {
            const entry = list[i];
            const id = getInstanceId(entry, i);
            const v = computeWindowMeshInstanceVariationFromSanitized({ settings: s, seed, id });

            shadeCoverage[i] = Number.isFinite(v.shadeCoverage) ? v.shadeCoverage : 0.0;

            const cell = v.interiorCell ?? { col: 0, row: 0 };
            const c = Math.max(0, Math.min(cols - 1, cell.col | 0));
            const r = Math.max(0, Math.min(rows - 1, cell.row | 0));
            interiorUvOffset[i * 2] = c * uvScaleX;
            interiorUvOffset[i * 2 + 1] = r * uvScaleY;
            interiorUvScale[i * 2] = uvScaleX;
            interiorUvScale[i * 2 + 1] = uvScaleY;
            interiorFlipX[i] = v.interiorFlipX ? 1.0 : 0.0;

            const tint = v.interiorTint ?? { hueShiftDeg: 0, saturationMul: 1, brightnessMul: 1 };
            interiorTint[i * 3] = (Number(tint.hueShiftDeg) || 0) / 360.0;
            interiorTint[i * 3 + 1] = Number.isFinite(tint.saturationMul) ? tint.saturationMul : 1.0;
            interiorTint[i * 3 + 2] = Number.isFinite(tint.brightnessMul) ? tint.brightnessMul : 1.0;
        }

        openingGeo.setAttribute('instanceShadeCoverage', new THREE.InstancedBufferAttribute(shadeCoverage, 1));
        openingGeo.setAttribute('instanceInteriorUvOffset', new THREE.InstancedBufferAttribute(interiorUvOffset, 2));
        openingGeo.setAttribute('instanceInteriorUvScale', new THREE.InstancedBufferAttribute(interiorUvScale, 2));
        openingGeo.setAttribute('instanceInteriorFlipX', new THREE.InstancedBufferAttribute(interiorFlipX, 1));
        openingGeo.setAttribute('instanceInteriorTint', new THREE.InstancedBufferAttribute(interiorTint, 3));

        const dummy = new THREE.Object3D();

        const frameLayer = new THREE.Group();
        frameLayer.name = 'frame';
        const frameMesh = new THREE.InstancedMesh(bundle.frame, mats.frameMat, count);
        frameMesh.castShadow = true;
        frameMesh.receiveShadow = true;
        frameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        frameLayer.add(frameMesh);

        if (bundle.joinBar) {
            const joinMesh = new THREE.InstancedMesh(bundle.joinBar, mats.frameMat, count);
            joinMesh.castShadow = true;
            joinMesh.receiveShadow = true;
            joinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            frameLayer.add(joinMesh);
            group.userData._joinMesh = joinMesh;
        }

        const muntinsLayer = new THREE.Group();
        muntinsLayer.name = 'muntins';
        let muntinsMesh = null;
        if (bundle.muntins && s.muntins.enabled) {
            muntinsMesh = new THREE.InstancedMesh(bundle.muntins, mats.muntinMat, count);
            muntinsMesh.castShadow = true;
            muntinsMesh.receiveShadow = true;
            muntinsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            muntinsLayer.add(muntinsMesh);
        }

        const interiorLayer = new THREE.Group();
        interiorLayer.name = 'interior';
        const interiorMesh = new THREE.InstancedMesh(openingGeo, mats.interiorMat, count);
        interiorMesh.castShadow = false;
        interiorMesh.receiveShadow = false;
        interiorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        interiorLayer.add(interiorMesh);

        const shadeLayer = new THREE.Group();
        shadeLayer.name = 'shade';
        const shadeMesh = new THREE.InstancedMesh(openingGeo, mats.shadeMat, count);
        shadeMesh.castShadow = false;
        shadeMesh.receiveShadow = false;
        shadeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        shadeLayer.add(shadeMesh);

        const glassLayer = new THREE.Group();
        glassLayer.name = 'glass';
        const glassMesh = new THREE.InstancedMesh(openingGeo, mats.glassMat, count);
        glassMesh.castShadow = false;
        glassMesh.receiveShadow = false;
        glassMesh.renderOrder = 2;
        glassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        glassLayer.add(glassMesh);

        const glassZ = s.frame.depth + s.glass.zOffset;
        const shadeZ = glassZ + s.shade.zOffset;
        const interiorZ = glassZ + Math.min(-0.02, s.shade.enabled ? (s.shade.zOffset - 0.004) : -0.02);
        glassMesh.position.z = glassZ;
        shadeMesh.position.z = shadeZ;
        interiorMesh.position.z = interiorZ;

        const frameInsetZ = -Number(s.frame.inset || 0);
        frameLayer.position.z = frameInsetZ;
        muntinsLayer.position.z = frameInsetZ;
        glassLayer.position.z = frameInsetZ;
        shadeLayer.position.z = frameInsetZ;
        interiorLayer.position.z = frameInsetZ;

        frameMesh.renderOrder = 3;
        if (muntinsMesh) muntinsMesh.renderOrder = 3;

        for (let i = 0; i < count; i++) {
            const entry = list[i];
            if (!isInteractiveInstance(entry)) continue;
            const pose = getInstancePose(entry);
            dummy.position.set(pose.x, pose.y, pose.z);
            dummy.rotation.set(0, pose.yaw, 0);
            dummy.updateMatrix();
            frameMesh.setMatrixAt(i, dummy.matrix);
            if (group.userData._joinMesh) group.userData._joinMesh.setMatrixAt(i, dummy.matrix);
            muntinsMesh?.setMatrixAt(i, dummy.matrix);
            interiorMesh.setMatrixAt(i, dummy.matrix);
            shadeMesh.setMatrixAt(i, dummy.matrix);
            glassMesh.setMatrixAt(i, dummy.matrix);
        }

        frameMesh.instanceMatrix.needsUpdate = true;
        if (group.userData._joinMesh) group.userData._joinMesh.instanceMatrix.needsUpdate = true;
        if (muntinsMesh) muntinsMesh.instanceMatrix.needsUpdate = true;
        interiorMesh.instanceMatrix.needsUpdate = true;
        shadeMesh.instanceMatrix.needsUpdate = true;
        glassMesh.instanceMatrix.needsUpdate = true;

        group.add(interiorLayer);
        group.add(shadeLayer);
        group.add(frameLayer);
        if (muntinsMesh) group.add(muntinsLayer);
        group.add(glassLayer);

        group.userData.layers = Object.freeze({
            frame: frameLayer,
            muntins: muntinsLayer,
            glass: glassLayer,
            shade: shadeLayer,
            interior: interiorLayer
        });

        group.userData.materials = Object.freeze({ ...mats });
        group.userData.geometryKey = getWindowMeshGeometryKey(s, { curveSegments: this.curveSegments });

        return group;
    }
}
