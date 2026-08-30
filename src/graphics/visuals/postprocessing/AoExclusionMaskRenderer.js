// Renders only visible AO-excluded receiver pixels into a composition mask.
// @ts-check

import * as THREE from 'three';
import {
    applyAoAlphaHandlingToMaterial,
    isWholeObjectAoExcludedReceiver,
    shouldApplyAoAlphaCutout
} from './AoAlphaCutoutSupport.js';

function createWhiteTexture() {
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.needsUpdate = true;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
}

function configureTargetTexture(target) {
    target.texture.name = 'ao-alpha-exclusion-mask';
    if ('colorSpace' in target.texture) target.texture.colorSpace = THREE.NoColorSpace;
}

function createTarget(width, height, depthTexture = null) {
    const target = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        depthBuffer: true,
        stencilBuffer: false
    });
    if (depthTexture) target.depthTexture = depthTexture;
    configureTargetTexture(target);
    return target;
}

function isRenderable(object) {
    return object?.isMesh || object?.isPoints || object?.isLine || object?.isLine2 || object?.isSprite;
}

function countReceiverGroups(object) {
    const materials = Array.isArray(object?.material) ? object.material : [object?.material];
    const wholeObject = isWholeObjectAoExcludedReceiver(object);
    return materials.reduce((count, material) => (
        count + ((wholeObject || shouldApplyAoAlphaCutout(material, object)) ? 1 : 0)
    ), 0);
}

export class AoExclusionMaskRenderer {
    constructor({ renderer, scene, camera } = {}) {
        this.renderer = renderer ?? null;
        this.scene = scene ?? null;
        this.camera = camera ?? null;
        this.whiteTexture = createWhiteTexture();
        this._width = 1;
        this._height = 1;
        this._legacyTarget = createTarget(1, 1);
        this._sharedDepthTargets = new Map();
        this.target = this._legacyTarget;

        this._maskMaterials = new WeakMap();
        this._excludedOpaqueMaterials = new WeakMap();
        this._createdMaterials = new Set();
        this._opaqueMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this._opaqueMaterial.toneMapped = false;
        this._opaqueMaterial.depthTest = true;
        this._opaqueMaterial.depthWrite = true;
        this._opaqueMaterial.side = THREE.DoubleSide;
        this._skipMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this._skipMaterial.visible = false;
        this._skipMaterial.toneMapped = false;
        this._frustum = new THREE.Frustum();
        this._projectionView = new THREE.Matrix4();
    }

    prepareForSourceResize() {
        for (const target of this._sharedDepthTargets.values()) {
            target.depthTexture = null;
            target.dispose?.();
        }
        this._sharedDepthTargets.clear();
        if (this.target !== this._legacyTarget) this.target = this._legacyTarget;
    }

    setSize(width, height) {
        const w = Math.max(1, Math.floor(Number(width) || 1));
        const h = Math.max(1, Math.floor(Number(height) || 1));
        if (w === this._width && h === this._height) return;
        this.prepareForSourceResize();
        this._width = w;
        this._height = h;
        this._legacyTarget?.setSize?.(w, h);
    }

    setSamples(samples) {
        const target = this._legacyTarget;
        if (!target || !('samples' in target)) return;
        const next = Math.max(0, Math.floor(Number(samples) || 0));
        const previous = Math.max(0, Math.floor(Number(target.samples) || 0));
        if (previous === next) return;
        target.samples = next;
        target.dispose?.();
    }

    _getMaskMaterial(sourceMaterial, object, threshold, depthWrite) {
        const source = sourceMaterial && typeof sourceMaterial === 'object' ? sourceMaterial : null;
        if (!source || !shouldApplyAoAlphaCutout(source, object)) return this._skipMaterial;

        let pair = this._maskMaterials.get(source) ?? null;
        if (!pair) {
            pair = {};
            this._maskMaterials.set(source, pair);
        }
        const key = depthWrite ? 'legacy' : 'retained';
        let material = pair[key] ?? null;
        if (!material) {
            material = new THREE.MeshBasicMaterial({ color: 0xffffff });
            material.toneMapped = false;
            material.depthTest = true;
            material.depthWrite = depthWrite;
            material.side = source.side ?? THREE.FrontSide;
            pair[key] = material;
            this._createdMaterials.add(material);
        }

        applyAoAlphaHandlingToMaterial({
            overrideMaterial: material,
            sourceMaterial: source,
            object,
            handling: 'alpha_test',
            threshold,
            whiteTexture: this.whiteTexture
        });
        if ('alphaToCoverage' in material) {
            const nextAlphaToCoverage = source.alphaToCoverage === true;
            if (material.alphaToCoverage !== nextAlphaToCoverage) {
                material.alphaToCoverage = nextAlphaToCoverage;
                material.needsUpdate = true;
            }
        }
        return material;
    }

    _getExcludedOpaqueMaterial(sourceMaterial, depthWrite) {
        const source = sourceMaterial && typeof sourceMaterial === 'object' ? sourceMaterial : null;
        if (!source) return this._skipMaterial;
        let pair = this._excludedOpaqueMaterials.get(source) ?? null;
        if (!pair) {
            pair = {};
            this._excludedOpaqueMaterials.set(source, pair);
        }
        const key = depthWrite ? 'legacy' : 'retained';
        let material = pair[key] ?? null;
        if (material) return material;
        material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: source.side ?? THREE.FrontSide
        });
        material.toneMapped = false;
        material.depthTest = true;
        material.depthWrite = depthWrite;
        pair[key] = material;
        this._createdMaterials.add(material);
        return material;
    }

    _isVisibleCandidate(object) {
        if (!object?.isMesh || object.visible === false) return false;
        if (!object.layers?.test?.(this.camera.layers)) return false;
        if (countReceiverGroups(object) <= 0) return false;
        if (object.frustumCulled === false) return true;
        try {
            return this._frustum.intersectsObject(object);
        } catch {
            return true;
        }
    }

    _collectVisibleCandidates() {
        const candidates = [];
        let receiverGroups = 0;
        const camera = this.camera;
        camera.updateMatrixWorld?.();
        this.scene?.updateMatrixWorld?.();
        this._projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this._frustum.setFromProjectionMatrix(this._projectionView);
        this.scene?.traverseVisible?.((object) => {
            if (!this._isVisibleCandidate(object)) return;
            candidates.push(object);
            receiverGroups += countReceiverGroups(object);
        });
        return { candidates, receiverGroups };
    }

    _getSharedDepthTarget(sourceTarget) {
        const depthTexture = sourceTarget?.depthTexture ?? null;
        if (!depthTexture?.isDepthTexture) return null;
        let target = this._sharedDepthTargets.get(depthTexture) ?? null;
        if (target) return target;
        target = createTarget(this._width, this._height, depthTexture);
        this._sharedDepthTargets.set(depthTexture, target);
        return target;
    }

    _getRetainedDepthFallbackReason(sourceTarget) {
        if (!sourceTarget) return 'missing_visible_scene_target';
        if (!sourceTarget.depthTexture?.isDepthTexture) return 'missing_visible_scene_depth_texture';
        if (sourceTarget.width !== this._width || sourceTarget.height !== this._height) return 'visible_scene_depth_size_mismatch';
        return null;
    }

    _withRendererState(target, { clearDepth }, render) {
        const renderer = this.renderer;
        const scene = this.scene;
        const previousTarget = renderer.getRenderTarget?.() ?? null;
        const previousBackground = scene.background;
        const previousOverrideMaterial = scene.overrideMaterial;
        const previousAutoClear = renderer.autoClear;
        const previousClearAlpha = renderer.getClearAlpha?.() ?? 1;
        const previousClearColor = new THREE.Color();
        renderer.getClearColor?.(previousClearColor);

        try {
            scene.background = null;
            scene.overrideMaterial = null;
            renderer.setRenderTarget(target);
            renderer.autoClear = false;
            renderer.setClearColor(0x000000, 1);
            renderer.clear(true, clearDepth, false);
            render?.();
        } finally {
            scene.background = previousBackground;
            scene.overrideMaterial = previousOverrideMaterial;
            renderer.autoClear = previousAutoClear;
            renderer.setRenderTarget(previousTarget);
            renderer.setClearColor(previousClearColor, previousClearAlpha);
        }
    }

    _renderCandidates({ candidates, threshold, target }) {
        const candidateSet = new Set(candidates);
        const changedObjects = [];
        this.scene.traverseVisible((object) => {
            if (!isRenderable(object)) return;
            const originalMaterial = object.material;
            changedObjects.push({ object, material: originalMaterial });
            if (!candidateSet.has(object)) {
                object.material = this._skipMaterial;
                return;
            }

            const sourceMaterials = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
            const wholeObject = isWholeObjectAoExcludedReceiver(object);
            const replacements = sourceMaterials.map((material) => {
                if (shouldApplyAoAlphaCutout(material, object)) {
                    return this._getMaskMaterial(material, object, threshold, false);
                }
                return wholeObject
                    ? this._getExcludedOpaqueMaterial(material, false)
                    : this._skipMaterial;
            });
            object.material = Array.isArray(originalMaterial) ? replacements : replacements[0];
        });

        try {
            this._withRendererState(target, { clearDepth: false }, () => {
                this.renderer.render(this.scene, this.camera);
            });
        } finally {
            for (const entry of changedObjects) entry.object.material = entry.material;
        }
    }

    _renderLegacy({ threshold }) {
        const changedObjects = [];
        this.scene.traverseVisible((object) => {
            if (!isRenderable(object)) return;
            const originalMaterial = object.material;
            changedObjects.push({ object, material: originalMaterial });
            if (!object.isMesh) {
                object.material = this._skipMaterial;
                return;
            }
            const sourceMaterials = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
            const wholeObject = isWholeObjectAoExcludedReceiver(object);
            const replacements = sourceMaterials.map((material) => {
                if (shouldApplyAoAlphaCutout(material, object)) {
                    return this._getMaskMaterial(material, object, threshold, true);
                }
                return wholeObject
                    ? this._getExcludedOpaqueMaterial(material, true)
                    : this._opaqueMaterial;
            });
            object.material = Array.isArray(originalMaterial) ? replacements : replacements[0];
        });

        try {
            this._withRendererState(this._legacyTarget, { clearDepth: true }, () => {
                this.renderer.render(this.scene, this.camera);
            });
        } finally {
            for (const entry of changedObjects) entry.object.material = entry.material;
        }
        this.target = this._legacyTarget;
    }

    render({ threshold = 0.5, retainedDepthTarget = null, preferRetainedDepth = true } = {}) {
        const renderer = this.renderer;
        const scene = this.scene;
        const camera = this.camera;
        if (!renderer || !scene?.traverseVisible || !camera || !this._legacyTarget) {
            return {
                strategy: 'unavailable', candidateObjects: 0, candidateGroups: 0,
                calls: 0, triangles: 0, rendered: false, skipped: true,
                retainedDepthUsed: false, fallbackReason: 'renderer_scene_or_camera_unavailable', candidateTestMs: 0
            };
        }

        const start = typeof performance !== 'undefined' ? performance.now() : 0;
        const { candidates, receiverGroups } = this._collectVisibleCandidates();
        const candidateTestMs = typeof performance !== 'undefined' ? performance.now() - start : 0;
        const renderInfo = renderer.info?.render ?? null;
        const callsBefore = Number(renderInfo?.calls) || 0;
        const trianglesBefore = Number(renderInfo?.triangles) || 0;

        if (candidates.length === 0) {
            this._withRendererState(this._legacyTarget, { clearDepth: false }, null);
            this.target = this._legacyTarget;
            return {
                strategy: 'empty', candidateObjects: 0, candidateGroups: 0,
                calls: 0, triangles: 0, rendered: false, skipped: true,
                retainedDepthUsed: false, fallbackReason: null, candidateTestMs
            };
        }

        const fallbackReason = preferRetainedDepth
            ? this._getRetainedDepthFallbackReason(retainedDepthTarget)
            : 'depth_reuse_disabled';
        if (!fallbackReason) {
            const target = this._getSharedDepthTarget(retainedDepthTarget);
            if (target) {
                this._renderCandidates({ candidates, threshold, target });
                this.target = target;
            } else {
                this._renderLegacy({ threshold });
            }
        } else {
            this._renderLegacy({ threshold });
        }

        const retainedDepthUsed = !fallbackReason && this.target !== this._legacyTarget;
        return {
            strategy: retainedDepthUsed ? 'retained_depth_receivers_only' : 'legacy_full_scene',
            candidateObjects: candidates.length,
            candidateGroups: receiverGroups,
            calls: Math.max(0, (Number(renderInfo?.calls) || 0) - callsBefore),
            triangles: Math.max(0, (Number(renderInfo?.triangles) || 0) - trianglesBefore),
            rendered: true,
            skipped: false,
            retainedDepthUsed,
            fallbackReason: retainedDepthUsed ? null : (fallbackReason ?? 'shared_depth_target_unavailable'),
            candidateTestMs
        };
    }

    dispose() {
        this.prepareForSourceResize();
        this._legacyTarget?.dispose?.();
        this._legacyTarget = null;
        this.target = null;
        this._opaqueMaterial?.dispose?.();
        this._skipMaterial?.dispose?.();
        for (const material of this._createdMaterials) material?.dispose?.();
        this._createdMaterials.clear();
        this.whiteTexture?.dispose?.();
    }
}
