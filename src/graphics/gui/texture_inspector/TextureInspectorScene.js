// src/graphics/gui/texture_inspector/TextureInspectorScene.js
// Renders textures on a reference plane for inspection.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGradientSkyDome } from '../../assets3d/generators/SkyGenerator.js';
import { getTextureInspectorEntryById, getTextureInspectorOptions, getTextureInspectorTextureById } from '../../assets3d/textures/TextureInspectorCatalog.js';

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function clonePreviewTexture(tex) {
    if (!tex) return null;
    const clone = tex.clone();
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(4, 4);
    clone.anisotropy = 8;
    clone.needsUpdate = true;
    return clone;
}

export class TextureInspectorScene {
    constructor(engine) {
        this.engine = engine;
        this.scene = engine.scene;
        this.camera = engine.camera;
        this.canvas = engine.canvas;

        this.root = null;
        this.controls = null;
        this.sky = null;
        this.hemi = null;
        this.sun = null;
        this._grid = null;

        this._plane = null;
        this._planeGeo = null;
        this._planeMat = null;
        this._previewTexture = null;

        this._textureIndex = 0;
        this._textureId = null;
        this._baseColor = 0xffffff;
    }

    enter() {
        if (this.root) return;

        this.root = new THREE.Group();
        this.root.name = 'texture_inspector_root';
        this.scene.add(this.root);

        this.sky = createGradientSkyDome();
        if (this.sky) this.root.add(this.sky);

        this.hemi = new THREE.HemisphereLight(0xe8f0ff, 0x0b0f14, 0.9);
        this.root.add(this.hemi);

        this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
        this.sun.position.set(4, 7, 4);
        this.root.add(this.sun);

        this._planeGeo = new THREE.PlaneGeometry(3, 3, 1, 1);
        this._planeMat = new THREE.MeshStandardMaterial({
            color: this._baseColor,
            metalness: 0.0,
            roughness: 0.8
        });
        this._plane = new THREE.Mesh(this._planeGeo, this._planeMat);
        this._plane.rotation.x = -Math.PI / 2;
        this._plane.position.y = 0;
        this.root.add(this._plane);

        const grid = new THREE.GridHelper(6, 24, 0x2b3544, 0x1a2230);
        grid.position.y = 0.001;
        this.root.add(grid);
        this._grid = grid;

        this.camera.position.set(0, 2.2, 2.6);
        this.camera.lookAt(0, 0, 0);

        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enablePan = false;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 1.6;
        this.controls.maxDistance = 14;
        this.controls.target.set(0, 0, 0);
        this.controls.update();

        this.setSelectedTextureIndex(this._textureIndex);
    }

    dispose() {
        this.controls?.dispose?.();
        this.controls = null;

        this._disposePreviewTexture();

        if (this._grid) {
            this.root?.remove?.(this._grid);
            this._grid.geometry?.dispose?.();
            if (Array.isArray(this._grid.material)) {
                for (const m of this._grid.material) m?.dispose?.();
            } else {
                this._grid.material?.dispose?.();
            }
            this._grid = null;
        }

        if (this.sky) {
            this.root?.remove?.(this.sky);
            this.sky.geometry?.dispose?.();
            this.sky.material?.dispose?.();
            this.sky = null;
        }

        if (this._plane) this.root?.remove?.(this._plane);
        this._plane = null;
        this._planeGeo?.dispose?.();
        this._planeGeo = null;
        this._planeMat?.dispose?.();
        this._planeMat = null;

        if (this.root) {
            this.scene.remove(this.root);
            this.root = null;
        }
    }

    update() {
        this.controls?.update?.();
    }

    getTextureOptions() {
        return getTextureInspectorOptions();
    }

    getSelectedTextureIndex() {
        return this._textureIndex;
    }

    setSelectedTextureIndex(index) {
        const options = this.getTextureOptions();
        const next = clampInt(index, 0, Math.max(0, options.length - 1));
        this._textureIndex = next;
        const id = options[next]?.id ?? options[0]?.id ?? null;
        if (id) this.setSelectedTextureId(id);
    }

    setSelectedTextureId(textureId) {
        const options = this.getTextureOptions();
        const idx = options.findIndex((opt) => opt?.id === textureId);
        if (idx >= 0) this._textureIndex = idx;

        const entry = getTextureInspectorEntryById(textureId);
        const nextId = entry?.id ?? null;
        if (!nextId || nextId === this._textureId) return;
        this._textureId = nextId;

        const tex = getTextureInspectorTextureById(nextId);
        this._setPlaneTexture(tex);
    }

    getSelectedTextureMeta() {
        const entry = getTextureInspectorEntryById(this._textureId);
        if (!entry) return null;
        return { id: entry.id, name: entry.label };
    }

    setBaseColorHex(hex) {
        const next = Number.isFinite(hex) ? hex : 0xffffff;
        this._baseColor = next;
        if (this._planeMat) this._planeMat.color.setHex(next);
    }

    _setPlaneTexture(tex) {
        this._disposePreviewTexture();
        const preview = clonePreviewTexture(tex);
        this._previewTexture = preview;
        if (this._planeMat) {
            this._planeMat.map = preview;
            this._planeMat.needsUpdate = true;
        }
    }

    _disposePreviewTexture() {
        if (!this._previewTexture) return;
        this._previewTexture.dispose?.();
        this._previewTexture = null;
        if (this._planeMat) {
            this._planeMat.map = null;
            this._planeMat.needsUpdate = true;
        }
    }
}
