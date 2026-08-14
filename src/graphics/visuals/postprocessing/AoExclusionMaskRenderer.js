// src/graphics/visuals/postprocessing/AoExclusionMaskRenderer.js
// Renders alpha-cutout receiver pixels into a mask for AO composition exclusion.
// @ts-check

import * as THREE from 'three';
import {
    applyAoAlphaHandlingToMaterial,
    getMaterialForAoGroup,
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

export class AoExclusionMaskRenderer {
    constructor({ renderer, scene, camera } = {}) {
        this.renderer = renderer ?? null;
        this.scene = scene ?? null;
        this.camera = camera ?? null;
        this.whiteTexture = createWhiteTexture();
        this.target = new THREE.WebGLRenderTarget(1, 1, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            depthBuffer: true,
            stencilBuffer: false
        });
        this.target.texture.name = 'ao-alpha-exclusion-mask';
        if ('colorSpace' in this.target.texture) this.target.texture.colorSpace = THREE.NoColorSpace;

        this._maskMaterials = new WeakMap();
        this._createdMaterials = new Set();
        this._opaqueMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this._opaqueMaterial.toneMapped = false;
        this._opaqueMaterial.depthTest = true;
        this._opaqueMaterial.depthWrite = true;
        this._opaqueMaterial.side = THREE.DoubleSide;
        this._excludedOpaqueMaterial = this._opaqueMaterial.clone();
        this._excludedOpaqueMaterial.color.set(0xffffff);
        this._discardMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this._discardMaterial.toneMapped = false;
        this._discardMaterial.map = this.whiteTexture;
        this._discardMaterial.alphaMap = this.whiteTexture;
        this._discardMaterial.alphaTest = 1.1;
    }

    setSize(width, height) {
        const w = Math.max(1, Math.floor(Number(width) || 1));
        const h = Math.max(1, Math.floor(Number(height) || 1));
        this.target?.setSize?.(w, h);
    }

    setSamples(samples) {
        const target = this.target;
        if (!target || !('samples' in target)) return;
        const next = Math.max(0, Math.floor(Number(samples) || 0));
        const previous = Math.max(0, Math.floor(Number(target.samples) || 0));
        if (previous === next) return;
        target.samples = next;
        // The render target may already have GPU storage. Dispose only that
        // storage so Three.js recreates it with the new sample count.
        target.dispose?.();
    }

    _getMaskMaterial(sourceMaterial, object, threshold) {
        const source = sourceMaterial && typeof sourceMaterial === 'object' ? sourceMaterial : null;
        if (!source || !shouldApplyAoAlphaCutout(source, object)) return this._discardMaterial;

        let material = this._maskMaterials.get(source) ?? null;
        if (!material) {
            material = new THREE.MeshBasicMaterial({ color: 0xffffff });
            material.toneMapped = false;
            material.depthTest = true;
            material.depthWrite = true;
            material.side = source.side ?? THREE.FrontSide;
            this._maskMaterials.set(source, material);
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

    render({ threshold = 0.5 } = {}) {
        const renderer = this.renderer;
        const scene = this.scene;
        const camera = this.camera;
        const target = this.target;
        if (!renderer || !scene?.traverse || !camera || !target) return;

        const changedObjects = [];
        scene.traverse((object) => {
            if (!object || object.visible === false) return;
            if (!object.isMesh) {
                if (object.isPoints || object.isLine || object.isLine2 || object.isSprite) {
                    changedObjects.push({ object, material: object.material, visible: object.visible });
                    object.visible = false;
                }
                return;
            }
            const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
            const excludeWholeObject = object.userData?.isFoliage === true;
            changedObjects.push({ object, material: object.material, visible: object.visible });
            object.material = Array.isArray(object.material)
                ? sourceMaterials.map((material) => (
                    shouldApplyAoAlphaCutout(material, object)
                        ? this._getMaskMaterial(material, object, threshold)
                        : (excludeWholeObject ? this._excludedOpaqueMaterial : this._opaqueMaterial)
                ))
                : (
                    shouldApplyAoAlphaCutout(getMaterialForAoGroup(object, null), object)
                        ? this._getMaskMaterial(getMaterialForAoGroup(object, null), object, threshold)
                        : (excludeWholeObject ? this._excludedOpaqueMaterial : this._opaqueMaterial)
                );
        });

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
            renderer.clear(true, true, false);
            renderer.render(scene, camera);
        } finally {
            for (const entry of changedObjects) {
                entry.object.material = entry.material;
                entry.object.visible = entry.visible;
            }
            scene.background = previousBackground;
            scene.overrideMaterial = previousOverrideMaterial;
            renderer.autoClear = previousAutoClear;
            renderer.setRenderTarget(previousTarget);
            renderer.setClearColor(previousClearColor, previousClearAlpha);
        }
    }

    dispose() {
        this.target?.dispose?.();
        this.target = null;
        this._opaqueMaterial?.dispose?.();
        this._excludedOpaqueMaterial?.dispose?.();
        this._discardMaterial?.dispose?.();
        for (const material of this._createdMaterials) material?.dispose?.();
        this._createdMaterials.clear();
        this.whiteTexture?.dispose?.();
    }
}
