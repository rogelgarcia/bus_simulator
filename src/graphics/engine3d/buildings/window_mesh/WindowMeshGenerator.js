// src/graphics/engine3d/buildings/window_mesh/WindowMeshGenerator.js
// Procedural window mesh generator (frame + muntins + glass + shade + interior).
// @ts-check

import * as THREE from 'three';
import { sanitizeWindowMeshSettings, WINDOW_SHADE_DIRECTION } from '../../../../app/buildings/window_mesh/WindowMeshSettings.js';
import { computeWindowMeshInstanceVariationFromSanitized } from '../../../../app/buildings/window_mesh/WindowMeshVariation.js';
import { buildWindowMeshGeometryBundle, getWindowMeshGeometryKey } from './WindowMeshGeometry.js';
import { createWindowMeshMaterials, disposeWindowMeshMaterialCaches } from './WindowMeshMaterials.js';

const MAX_GEOMETRY_CACHE = 64;

function getMaterialCacheKey(settings) {
    return JSON.stringify(settings);
}

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
    bundle?.handles?.dispose?.();
    bundle?.kickPanels?.dispose?.();
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
        /** @type {Map<string, ReturnType<typeof createWindowMeshMaterials>>} */
        this._materialCache = new Map();
    }

    dispose() {
        for (const bundle of this._geometryCache.values()) disposeGeometryBundle(bundle);
        this._geometryCache.clear();
        const materials = new Set();
        for (const bundle of this._materialCache.values()) {
            for (const material of Object.values(bundle)) if (material) materials.add(material);
        }
        for (const material of materials) material.dispose();
        this._materialCache.clear();
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

    _getOrCreateMaterials(settings) {
        const key = getMaterialCacheKey(settings);
        let materials = this._materialCache.get(key);
        if (!materials) {
            materials = createWindowMeshMaterials(settings, { renderer: this.renderer });
            this._materialCache.set(key, materials);
        }
        return materials;
    }

    createWindowGroup({ settings, seed = 'window', instances = [] } = {}) {
        const s = sanitizeWindowMeshSettings(settings);
        const bundle = this._getOrCreateGeometryBundle(s);
        const mats = this._getOrCreateMaterials(s);
        const geometryKey = getWindowMeshGeometryKey(s, { curveSegments: this.curveSegments });

        const list = Array.isArray(instances) ? instances : [];
        const count = list.length;
        const group = new THREE.Group();
        group.name = 'window_mesh';
        group.userData = group.userData ?? {};
        group.userData.settings = s;
        group.userData.mergeableBuildingWindowAssembly = true;

        if (!count) return group;

        const openingGeo = bundle.opening.clone();
        // AI 496: the parallax panel is oversized so grazing sightlines cannot
        // slip past its edge; it falls back to the opening geometry when the
        // panel needs no overscan (interior off / flush with the glass).
        const interiorGeo = bundle.interiorPanel?.isBufferGeometry ? bundle.interiorPanel.clone() : null;
        group.userData.ownedGeometries = Object.freeze(interiorGeo ? [openingGeo, interiorGeo] : [openingGeo]);
        const shadeCoverage = new Float32Array(count);
        const shadeFlipX = new Float32Array(count);
        const shadeFabricScale = new Float32Array(count * 2);
        const shadeFabricIntensity = new Float32Array(count);
        const shadeAxis = new Float32Array(count);
        const interiorUvOffset = new Float32Array(count * 2);
        const interiorUvScale = new Float32Array(count * 2);
        const interiorFlipX = new Float32Array(count);
        const interiorTint = new Float32Array(count * 3);
        const interiorParams = new Float32Array(count * 4);
        const interiorParallaxScale = new Float32Array(count * 2);
        const interiorUvPan = new Float32Array(count * 2);
        const interiorTanU = new Float32Array(count * 3);
        const interiorLight = new Float32Array(count);

        const cols = Math.max(1, s.interior.atlas.cols | 0);
        const rows = Math.max(1, s.interior.atlas.rows | 0);
        const uvScaleX = 1 / cols;
        const uvScaleY = 1 / rows;
        const frameVerticalWidth = Math.max(0, Number(s.frame.verticalWidth ?? s.frame.width) || 0);
        const frameHorizontalWidth = Math.max(0, Number(s.frame.horizontalWidth ?? s.frame.width) || 0);
        const bottomFrameEnabled = !s.frame.openBottom
            || (s.frame.doorBottomFrame?.enabled === true && s.frame.doorBottomFrame?.mode === 'match');
        const openingWidth = Math.max(0.01, s.width - frameVerticalWidth * 2);
        const openingHeight = Math.max(0.01, s.height - frameHorizontalWidth - (bottomFrameEnabled ? frameHorizontalWidth : 0));
        const openingAspect = openingWidth / openingHeight;
        const shadeScale = Number(s.shade.fabric.scale) || 1.0;
        const shadeScaleY = shadeScale * (s.height / Math.max(0.01, s.width));
        const shadeDirectionAxis = s.shade.direction === WINDOW_SHADE_DIRECTION.TOP_TO_BOTTOM ? 0.0 : 1.0;
        const parallaxStrength = clamp((s.interior.parallaxDepthMeters || 0) / 50.0, 0.0, 1.0);
        const openingPositions = openingGeo.getAttribute('position');
        const windowShadeUv = new Float32Array(openingPositions.count * 2);
        for (let vertexIndex = 0; vertexIndex < openingPositions.count; vertexIndex++) {
            windowShadeUv[vertexIndex * 2] = clamp(
                (openingPositions.getX(vertexIndex) + openingWidth * 0.5) / openingWidth,
                0.0,
                1.0
            );
            windowShadeUv[vertexIndex * 2 + 1] = clamp(
                (openingPositions.getY(vertexIndex) + openingHeight * 0.5) / openingHeight,
                0.0,
                1.0
            );
        }
        openingGeo.setAttribute('windowShadeUv', new THREE.BufferAttribute(windowShadeUv, 2));
        const instanceVariations = [];

        for (let i = 0; i < count; i++) {
            const entry = list[i];
            const id = getInstanceId(entry, i);
            const v = computeWindowMeshInstanceVariationFromSanitized({ settings: s, seed, id });

            shadeCoverage[i] = Number.isFinite(v.shadeCoverage) ? v.shadeCoverage : 0.0;
            const shadeDir = String(v.shadeDirection ?? s.shade.direction ?? '');
            shadeFlipX[i] = (shadeDir === WINDOW_SHADE_DIRECTION.TOP_TO_BOTTOM || shadeDir === WINDOW_SHADE_DIRECTION.RIGHT_TO_LEFT) ? 1.0 : 0.0;
            shadeFabricScale[i * 2] = shadeScale;
            shadeFabricScale[i * 2 + 1] = shadeScaleY;
            shadeFabricIntensity[i] = s.shade.fabric.intensity;
            shadeAxis[i] = shadeDirectionAxis;

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
            interiorParams[i * 4] = openingAspect;
            interiorParams[i * 4 + 1] = s.interior.imageAspect;
            interiorParams[i * 4 + 2] = s.interior.uvZoom;
            interiorParams[i * 4 + 3] = parallaxStrength;
            interiorParallaxScale[i * 2] = s.interior.parallaxScale.x;
            interiorParallaxScale[i * 2 + 1] = s.interior.parallaxScale.y;
            interiorUvPan[i * 2] = s.interior.uvPan.x;
            interiorUvPan[i * 2 + 1] = s.interior.uvPan.y;
            interiorTanU[i * 3] = 1.0;
            interiorTanU[i * 3 + 1] = 0.0;
            interiorTanU[i * 3 + 2] = 0.0;
            interiorLight[i] = 1.0;

            instanceVariations.push(Object.freeze({
                id,
                shadeCoverage: shadeCoverage[i],
                shadeDirection: shadeDir,
                interiorCell: Object.freeze({ col: c, row: r }),
                interiorFlipX: !!v.interiorFlipX,
                interiorTint: Object.freeze({
                    hueShiftDeg: Number(tint.hueShiftDeg) || 0,
                    saturationMul: Number.isFinite(tint.saturationMul) ? tint.saturationMul : 1.0,
                    brightnessMul: Number.isFinite(tint.brightnessMul) ? tint.brightnessMul : 1.0
                }),
                interiorLight: interiorLight[i]
            }));
        }

        openingGeo.setAttribute('instanceShadeCoverage', new THREE.InstancedBufferAttribute(shadeCoverage, 1));
        openingGeo.setAttribute('instanceShadeFlipX', new THREE.InstancedBufferAttribute(shadeFlipX, 1));
        openingGeo.setAttribute('instanceShadeFabricScale', new THREE.InstancedBufferAttribute(shadeFabricScale, 2));
        openingGeo.setAttribute('instanceShadeFabricIntensity', new THREE.InstancedBufferAttribute(shadeFabricIntensity, 1));
        openingGeo.setAttribute('instanceShadeAxis', new THREE.InstancedBufferAttribute(shadeAxis, 1));
        for (const geo of interiorGeo ? [openingGeo, interiorGeo] : [openingGeo]) {
            geo.setAttribute('instanceInteriorUvOffset', new THREE.InstancedBufferAttribute(interiorUvOffset, 2));
            geo.setAttribute('instanceInteriorUvScale', new THREE.InstancedBufferAttribute(interiorUvScale, 2));
            geo.setAttribute('instanceInteriorFlipX', new THREE.InstancedBufferAttribute(interiorFlipX, 1));
            geo.setAttribute('instanceInteriorTint', new THREE.InstancedBufferAttribute(interiorTint, 3));
            geo.setAttribute('instanceInteriorParams', new THREE.InstancedBufferAttribute(interiorParams, 4));
            geo.setAttribute('instanceInteriorParallaxScale', new THREE.InstancedBufferAttribute(interiorParallaxScale, 2));
            geo.setAttribute('instanceInteriorUvPan', new THREE.InstancedBufferAttribute(interiorUvPan, 2));
            geo.setAttribute('instanceInteriorTanU', new THREE.InstancedBufferAttribute(interiorTanU, 3));
            geo.setAttribute('instanceInteriorLight', new THREE.InstancedBufferAttribute(interiorLight, 1));
        }

        const dummy = new THREE.Object3D();

        const markMergeablePart = (mesh, part) => {
            mesh.userData = mesh.userData ?? {};
            mesh.userData.mergeableBuildingWindowPart = true;
            mesh.userData.buildingWindowPart = part;
            mesh.userData.buildingWindowGeometryKey = `${geometryKey}:${part}`;
        };

        const frameLayer = new THREE.Group();
        frameLayer.name = 'frame';
        const frameMesh = new THREE.InstancedMesh(bundle.frame, mats.frameMat, count);
        markMergeablePart(frameMesh, 'frame');
        frameMesh.castShadow = true;
        frameMesh.userData.expandIntoMergedShadowCaster = true;
        frameMesh.receiveShadow = true;
        frameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        frameLayer.add(frameMesh);
        let handlesMesh = null;
        if (bundle.handles) {
            handlesMesh = new THREE.InstancedMesh(bundle.handles, mats.handlesMat ?? mats.frameMat, count);
            handlesMesh.name = 'handles';
            markMergeablePart(handlesMesh, 'handles');
            handlesMesh.castShadow = true;
            handlesMesh.receiveShadow = true;
            handlesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            frameLayer.add(handlesMesh);
        }
        let kickMesh = null;
        if (bundle.kickPanels) {
            kickMesh = new THREE.InstancedMesh(bundle.kickPanels, mats.frameMat, count);
            kickMesh.name = 'doorKickPanels';
            markMergeablePart(kickMesh, 'doorKickPanels');
            kickMesh.castShadow = true;
            kickMesh.receiveShadow = true;
            kickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            frameLayer.add(kickMesh);
        }

        const muntinsLayer = new THREE.Group();
        muntinsLayer.name = 'muntins';
        let muntinsMesh = null;
        if (bundle.muntins && s.muntins.enabled) {
            muntinsMesh = new THREE.InstancedMesh(bundle.muntins, mats.muntinMat, count);
            markMergeablePart(muntinsMesh, 'muntins');
            muntinsMesh.castShadow = true;
            muntinsMesh.userData.expandIntoMergedShadowCaster = true;
            muntinsMesh.receiveShadow = true;
            muntinsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            muntinsLayer.add(muntinsMesh);
        }

        if (bundle.joinBar) {
            const joinLayer = bundle.joinBarLayer === 'muntins' ? 'muntins' : 'frame';
            const joinMat = joinLayer === 'muntins' ? mats.muntinMat : mats.frameMat;
            const joinMesh = new THREE.InstancedMesh(bundle.joinBar, joinMat, count);
            markMergeablePart(joinMesh, 'joinBar');
            joinMesh.castShadow = true;
            joinMesh.userData.expandIntoMergedShadowCaster = true;
            joinMesh.receiveShadow = true;
            joinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            if (joinLayer === 'muntins') muntinsLayer.add(joinMesh);
            else frameLayer.add(joinMesh);
            group.userData._joinMesh = joinMesh;
        }

        let interiorLayer = null;
        let interiorMesh = null;
        if (s.interior.enabled) {
            interiorLayer = new THREE.Group();
            interiorLayer.name = 'interior';
            interiorMesh = new THREE.InstancedMesh(interiorGeo ?? openingGeo, mats.interiorMat, count);
            markMergeablePart(interiorMesh, 'interior');
            interiorMesh.castShadow = false;
            interiorMesh.receiveShadow = false;
            interiorMesh.renderOrder = 0;
            interiorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            interiorLayer.add(interiorMesh);
        }

        const shadeLayer = new THREE.Group();
        shadeLayer.name = 'shade';
        const shadeMesh = new THREE.InstancedMesh(openingGeo, mats.shadeMat, count);
        markMergeablePart(shadeMesh, 'shade');
        shadeMesh.castShadow = false;
        shadeMesh.receiveShadow = false;
        shadeMesh.renderOrder = 1;
        shadeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        shadeLayer.add(shadeMesh);

        const glassLayer = new THREE.Group();
        glassLayer.name = 'glass';
        const glassMesh = new THREE.InstancedMesh(openingGeo, mats.glassMat, count);
        markMergeablePart(glassMesh, 'glass');
        glassMesh.castShadow = true;
        glassMesh.userData.expandIntoMergedShadowCaster = true;
        glassMesh.userData.mergeShadowAsOpaque = true;
        glassMesh.receiveShadow = false;
        glassMesh.renderOrder = 2;
        glassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        glassLayer.add(glassMesh);

        const glassZ = s.frame.depth + s.glass.zOffset;
        const shadeZ = glassZ + s.shade.zOffset;
        const interiorZ = glassZ + Math.min(-0.02, s.shade.enabled ? (s.shade.zOffset - 0.02) : -0.02) + s.interior.zOffset;

        const insetLocalZ = -Number(s.frame.inset || 0);

        frameMesh.renderOrder = 3;
        if (handlesMesh) handlesMesh.renderOrder = 3;
        if (kickMesh) kickMesh.renderOrder = 3;
        if (muntinsMesh) muntinsMesh.renderOrder = 3;
        if (group.userData._joinMesh) group.userData._joinMesh.renderOrder = 3;

        for (let i = 0; i < count; i++) {
            const entry = list[i];
            if (!isInteractiveInstance(entry)) continue;
            const pose = getInstancePose(entry);
            const sinYaw = Math.sin(pose.yaw);
            const cosYaw = Math.cos(pose.yaw);
            const insetX = sinYaw * insetLocalZ;
            const insetZ = cosYaw * insetLocalZ;
            const baseX = pose.x + insetX;
            const baseY = pose.y;
            const baseZ = pose.z + insetZ;

            dummy.position.set(baseX, baseY, baseZ);
            dummy.rotation.set(0, pose.yaw, 0);
            dummy.updateMatrix();
            frameMesh.setMatrixAt(i, dummy.matrix);
            handlesMesh?.setMatrixAt(i, dummy.matrix);
            kickMesh?.setMatrixAt(i, dummy.matrix);
            if (group.userData._joinMesh) group.userData._joinMesh.setMatrixAt(i, dummy.matrix);
            muntinsMesh?.setMatrixAt(i, dummy.matrix);

            if (interiorMesh) {
                dummy.position.set(baseX + sinYaw * interiorZ, baseY, baseZ + cosYaw * interiorZ);
                dummy.updateMatrix();
                interiorMesh.setMatrixAt(i, dummy.matrix);
            }

            dummy.position.set(baseX + sinYaw * shadeZ, baseY, baseZ + cosYaw * shadeZ);
            dummy.updateMatrix();
            shadeMesh.setMatrixAt(i, dummy.matrix);

            dummy.position.set(baseX + sinYaw * glassZ, baseY, baseZ + cosYaw * glassZ);
            dummy.updateMatrix();
            glassMesh.setMatrixAt(i, dummy.matrix);
        }

        frameMesh.instanceMatrix.needsUpdate = true;
        if (handlesMesh) handlesMesh.instanceMatrix.needsUpdate = true;
        if (kickMesh) kickMesh.instanceMatrix.needsUpdate = true;
        if (group.userData._joinMesh) group.userData._joinMesh.instanceMatrix.needsUpdate = true;
        if (muntinsMesh) muntinsMesh.instanceMatrix.needsUpdate = true;
        if (interiorMesh) interiorMesh.instanceMatrix.needsUpdate = true;
        shadeMesh.instanceMatrix.needsUpdate = true;
        glassMesh.instanceMatrix.needsUpdate = true;

        if (interiorLayer) group.add(interiorLayer);
        group.add(shadeLayer);
        group.add(frameLayer);
        if (muntinsLayer.children.length) group.add(muntinsLayer);
        group.add(glassLayer);

        group.userData.layers = Object.freeze({
            frame: frameLayer,
            muntins: muntinsLayer,
            glass: glassLayer,
            shade: shadeLayer,
            interior: interiorLayer
        });

        group.userData.instanceVariations = Object.freeze(instanceVariations);
        group.userData.materials = Object.freeze({ ...mats });
        group.userData.geometryKey = geometryKey;

        return group;
    }
}
