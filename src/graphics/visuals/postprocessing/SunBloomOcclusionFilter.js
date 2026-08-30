// Selects generic scene occluders whose projected bounds can overlap visible sun-bloom emitters.
// @ts-check

import * as THREE from 'three';
import {
    FULL_NDC_RECT,
    createEmptyNdcRect,
    expandNdcRect,
    includeNdcRect,
    isFiniteNdcRect,
    isNdcRectViewportRelevant,
    shouldRetainSunBloomOccluder
} from './SunBloomOcclusionMath.js';

const BASE_SCENE_LAYER_MASK = 1;

function hasVisibleMaterial(object) {
    const material = object?.material ?? null;
    if (!material) return false;
    if (Array.isArray(material)) return material.some((entry) => entry?.visible !== false);
    return material.visible !== false;
}

function getMaterials(object) {
    const material = object?.material ?? null;
    if (!material) return [];
    return Array.isArray(material) ? material : [material];
}

function isRenderableObject(object) {
    return !!object && (
        object.isMesh
        || object.isSprite
        || object.isPoints
        || object.isLine
        || object.isLineSegments
        || object.isLineLoop
    );
}

function hasIndeterminateVertexBounds(object, { emitter = false } = {}) {
    if (!object?.isMesh) return true;
    if (object.userData?.sunBloomOcclusionBoundsUnsafe === true) return true;
    if (object.isSkinnedMesh) return true;
    if (Array.isArray(object.morphTargetInfluences) && object.morphTargetInfluences.length > 0) return true;
    const hasShaderMaterial = getMaterials(object).some((material) => material?.isShaderMaterial === true);
    if (!hasShaderMaterial) return false;
    return !(emitter && object.userData?.sunBloomProjectionBoundsSafe === true);
}

function getDisplacementPadding(object) {
    let padding = 0;
    for (const material of getMaterials(object)) {
        if (!material?.displacementMap) continue;
        const scale = Number(material.displacementScale) || 0;
        const bias = Number(material.displacementBias) || 0;
        padding = Math.max(padding, Math.abs(scale) + Math.abs(bias));
    }
    return padding;
}

function nowMs() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : 0;
}

export class SunBloomOcclusionFilter {
    /**
     * @param {{scene: THREE.Scene, camera: THREE.Camera, bloomLayer: THREE.Layers}} options
     */
    constructor({ scene, camera, bloomLayer } = {}) {
        if (!scene) throw new Error('[SunBloomOcclusionFilter] scene is required');
        if (!camera) throw new Error('[SunBloomOcclusionFilter] camera is required');
        if (!bloomLayer) throw new Error('[SunBloomOcclusionFilter] bloomLayer is required');

        this.scene = scene;
        this.camera = camera;
        this.bloomLayer = bloomLayer;
        this.occluderMeshes = [];
        this.otherRenderables = [];
        this.candidates = new Set();
        this._instanceVersions = new WeakMap();
        this._localBox = new THREE.Box3();
        this._worldPoint = new THREE.Vector3();
        this._viewPoint = new THREE.Vector3();
        this._clipPoint = new THREE.Vector4();
        this._projected = {
            rect: createEmptyNdcRect(),
            nearDepth: Infinity,
            farDepth: -Infinity,
            uncertain: false,
            visible: false
        };
    }

    _getLocalBounds(object, { emitter = false } = {}) {
        if (hasIndeterminateVertexBounds(object, { emitter })) return null;

        if (object.isInstancedMesh) {
            const version = Number(object.instanceMatrix?.version) || 0;
            const previousVersion = this._instanceVersions.get(object);
            if (!object.boundingBox || previousVersion !== version) {
                object.computeBoundingBox?.();
                this._instanceVersions.set(object, version);
            }
            if (!object.boundingBox?.isBox3 || object.boundingBox.isEmpty()) return null;
            this._localBox.copy(object.boundingBox);
        } else {
            const geometry = object.geometry ?? null;
            if (!geometry) return null;
            if (!geometry.boundingBox) geometry.computeBoundingBox?.();
            if (!geometry.boundingBox?.isBox3 || geometry.boundingBox.isEmpty()) return null;
            this._localBox.copy(geometry.boundingBox);
        }

        const displacementPadding = getDisplacementPadding(object);
        if (displacementPadding > 0) this._localBox.expandByScalar(displacementPadding);
        return this._localBox;
    }

    _projectMeshBounds(object, { emitter = false } = {}) {
        const output = this._projected;
        output.rect.minX = Infinity;
        output.rect.minY = Infinity;
        output.rect.maxX = -Infinity;
        output.rect.maxY = -Infinity;
        output.nearDepth = Infinity;
        output.farDepth = -Infinity;
        output.uncertain = false;
        output.visible = false;

        if (hasIndeterminateVertexBounds(object, { emitter })) {
            output.uncertain = true;
            output.visible = true;
            output.rect.minX = FULL_NDC_RECT.minX;
            output.rect.minY = FULL_NDC_RECT.minY;
            output.rect.maxX = FULL_NDC_RECT.maxX;
            output.rect.maxY = FULL_NDC_RECT.maxY;
            output.nearDepth = 0;
            output.farDepth = Number(this.camera.far) || Infinity;
            return output;
        }

        const localBox = this._getLocalBounds(object, { emitter });
        if (!localBox) {
            output.uncertain = true;
            output.visible = true;
            output.rect.minX = FULL_NDC_RECT.minX;
            output.rect.minY = FULL_NDC_RECT.minY;
            output.rect.maxX = FULL_NDC_RECT.maxX;
            output.rect.maxY = FULL_NDC_RECT.maxY;
            output.nearDepth = 0;
            output.farDepth = Number(this.camera.far) || Infinity;
            return output;
        }

        const min = localBox.min;
        const max = localBox.max;
        const near = Math.max(0, Number(this.camera.near) || 0);
        const far = Math.max(near, Number(this.camera.far) || Infinity);
        const viewMatrix = this.camera.matrixWorldInverse;
        const projectionMatrix = this.camera.projectionMatrix;

        for (let index = 0; index < 8; index += 1) {
            this._worldPoint.set(
                (index & 1) === 0 ? min.x : max.x,
                (index & 2) === 0 ? min.y : max.y,
                (index & 4) === 0 ? min.z : max.z
            ).applyMatrix4(object.matrixWorld);

            this._viewPoint.copy(this._worldPoint).applyMatrix4(viewMatrix);
            const depth = -this._viewPoint.z;
            output.nearDepth = Math.min(output.nearDepth, depth);
            output.farDepth = Math.max(output.farDepth, depth);

            this._clipPoint.set(this._viewPoint.x, this._viewPoint.y, this._viewPoint.z, 1).applyMatrix4(projectionMatrix);
            if (Math.abs(this._clipPoint.w) <= 1e-8) {
                output.uncertain = true;
                continue;
            }
            const invW = 1 / this._clipPoint.w;
            const x = this._clipPoint.x * invW;
            const y = this._clipPoint.y * invW;
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                output.uncertain = true;
                continue;
            }
            output.rect.minX = Math.min(output.rect.minX, x);
            output.rect.minY = Math.min(output.rect.minY, y);
            output.rect.maxX = Math.max(output.rect.maxX, x);
            output.rect.maxY = Math.max(output.rect.maxY, y);
        }

        if (output.farDepth < near || output.nearDepth > far) return output;
        if (output.nearDepth <= near && output.farDepth >= near) {
            output.uncertain = true;
            output.visible = true;
            output.rect.minX = FULL_NDC_RECT.minX;
            output.rect.minY = FULL_NDC_RECT.minY;
            output.rect.maxX = FULL_NDC_RECT.maxX;
            output.rect.maxY = FULL_NDC_RECT.maxY;
            return output;
        }

        output.visible = isFiniteNdcRect(output.rect) && isNdcRectViewportRelevant(output.rect);
        return output;
    }

    /**
     * @param {{mode?: string, viewportWidth?: number, viewportHeight?: number, bloomRadius?: number}} options
     */
    evaluate({ mode = 'occlusion', viewportWidth = 1, viewportHeight = 1, bloomRadius = 0 } = {}) {
        const startedAt = nowMs();
        const collectOccluders = mode === 'occlusion';
        this.occluderMeshes.length = 0;
        this.otherRenderables.length = 0;
        this.candidates.clear();

        this.scene.updateMatrixWorld?.();
        this.camera.updateMatrixWorld?.();
        this.camera.matrixWorldInverse?.copy?.(this.camera.matrixWorld)?.invert?.();

        const emitters = [];
        this.scene.traverseVisible((object) => {
            if (!isRenderableObject(object)) return;
            const inBloom = this.bloomLayer.test(object.layers);
            if (inBloom) {
                if (object.isMesh && hasVisibleMaterial(object)) emitters.push(object);
                return;
            }
            if (!collectOccluders || (object.layers.mask & BASE_SCENE_LAYER_MASK) === 0) return;
            if (object.isMesh) {
                if (hasVisibleMaterial(object)) this.occluderMeshes.push(object);
                return;
            }
            this.otherRenderables.push(object);
        });

        const effectRect = createEmptyNdcRect();
        let effectFarDepth = -Infinity;
        let relevantEmitterCount = 0;
        let conservativeEmitterCount = 0;

        for (const emitter of emitters) {
            const projected = this._projectMeshBounds(emitter, { emitter: true });
            if (!projected.visible) continue;
            relevantEmitterCount += 1;
            if (projected.uncertain) conservativeEmitterCount += 1;
            includeNdcRect(effectRect, projected.rect);
            effectFarDepth = Math.max(effectFarDepth, projected.farDepth);
        }

        if (relevantEmitterCount === 0 || !isFiniteNdcRect(effectRect)) {
            return {
                outcome: 'irrelevant',
                emitterCount: emitters.length,
                relevantEmitterCount: 0,
                scannedOccluderCount: this.occluderMeshes.length,
                retainedOccluderCount: 0,
                hiddenOccluderCount: this.occluderMeshes.length,
                conservativeInclusionCount: 0,
                conservativeEmitterCount,
                candidateTestMs: Math.max(0, nowMs() - startedAt),
                effectRect: null,
                effectFarDepth: null,
                approximateReferenceBytes: (emitters.length + this.occluderMeshes.length + this.otherRenderables.length) * 8
            };
        }

        const width = Math.max(1, Number(viewportWidth) || 1);
        const height = Math.max(1, Number(viewportHeight) || 1);
        const spreadPixels = 12 + Math.max(0, Math.min(1, Number(bloomRadius) || 0)) * 96;
        const guardedEffectRect = expandNdcRect(effectRect, (spreadPixels * 2) / width, (spreadPixels * 2) / height) ?? effectRect;

        let conservativeInclusionCount = 0;
        if (collectOccluders) {
            for (const object of this.occluderMeshes) {
                const projected = this._projectMeshBounds(object);
                const retain = shouldRetainSunBloomOccluder({
                    uncertain: projected.uncertain,
                    occluderRect: projected.rect,
                    occluderNearDepth: projected.nearDepth,
                    effectRect: guardedEffectRect,
                    effectFarDepth
                });
                if (!retain || (!projected.uncertain && !projected.visible)) continue;
                this.candidates.add(object);
                if (projected.uncertain) conservativeInclusionCount += 1;
            }
        }

        const retainedOccluderCount = this.candidates.size;
        return {
            outcome: collectOccluders && retainedOccluderCount > 0 ? 'candidate_occlusion' : 'clear',
            emitterCount: emitters.length,
            relevantEmitterCount,
            scannedOccluderCount: this.occluderMeshes.length,
            retainedOccluderCount,
            hiddenOccluderCount: Math.max(0, this.occluderMeshes.length - retainedOccluderCount),
            conservativeInclusionCount,
            conservativeEmitterCount,
            candidateTestMs: Math.max(0, nowMs() - startedAt),
            effectRect: { ...guardedEffectRect },
            effectFarDepth,
            approximateReferenceBytes: (emitters.length + this.occluderMeshes.length + this.otherRenderables.length + retainedOccluderCount) * 8
        };
    }
}
