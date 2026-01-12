// src/graphics/gui/texture_inspector/TextureInspectorScene.js
// Renders textures on a reference plane for inspection.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGradientSkyDome } from '../../assets3d/generators/SkyGenerator.js';
import { getTextureInspectorEntryById, getTextureInspectorOptions, getTextureInspectorTextureById } from '../../assets3d/textures/TextureInspectorCatalog.js';

const PLANE_SIZE = 3;
const TILE_REPEAT = 4;

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function clonePreviewTexture(tex) {
    if (!tex) return null;
    const clone = tex.clone();
    clone.wrapS = THREE.ClampToEdgeWrapping;
    clone.wrapT = THREE.ClampToEdgeWrapping;
    clone.repeat.set(1, 1);
    clone.offset.set(0, 0);
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
        this._tileGroup = null;
        this._tileGeo = null;
        this._tileMat = null;
        this._tileMeshes = [];

        this._textureIndex = 0;
        this._textureId = null;
        this._baseColor = 0xffffff;
        this._previewMode = 'single';
        this._gridEnabled = true;
        this._tileGap = 0.0;
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

        this._planeGeo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, 1, 1);
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
        grid.visible = this._gridEnabled;
        this.root.add(grid);
        this._grid = grid;

        this._tileGroup = new THREE.Group();
        this._tileGroup.name = 'texture_inspector_tiles';
        this.root.add(this._tileGroup);

        this._tileGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
        this._tileMat = new THREE.MeshStandardMaterial({
            color: this._baseColor,
            metalness: 0.0,
            roughness: 0.8
        });

        this._tileMeshes = [];
        for (let i = 0; i < TILE_REPEAT * TILE_REPEAT; i++) {
            const tile = new THREE.Mesh(this._tileGeo, this._tileMat);
            tile.rotation.x = -Math.PI / 2;
            tile.position.y = 0.002;
            tile.castShadow = false;
            tile.receiveShadow = true;
            this._tileGroup.add(tile);
            this._tileMeshes.push(tile);
        }
        this._layoutTiles();
        this._syncPreviewMode();

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

        if (this._tileGroup) {
            this.root?.remove?.(this._tileGroup);
            this._tileGroup = null;
        }
        this._tileMeshes = [];
        this._tileGeo?.dispose?.();
        this._tileGeo = null;
        this._tileMat?.dispose?.();
        this._tileMat = null;

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
        if (this._tileMat) this._tileMat.color.setHex(next);
    }

    setPreviewModeId(modeId) {
        const next = modeId === 'tiled' ? 'tiled' : 'single';
        if (next === this._previewMode) return;
        this._previewMode = next;
        this._syncPreviewMode();
    }

    setGridEnabled(enabled) {
        this._gridEnabled = !!enabled;
        if (this._grid) this._grid.visible = this._gridEnabled;
    }

    setTileGap(value) {
        const next = clamp(value, 0.0, 0.75);
        if (Math.abs(next - this._tileGap) < 1e-6) return;
        this._tileGap = next;
        this._layoutTiles();
    }

    _setPlaneTexture(tex) {
        this._disposePreviewTexture();
        const preview = clonePreviewTexture(tex);
        this._previewTexture = preview;
        this._syncPreviewMaps();
    }

    _layoutTiles() {
        const meshes = this._tileMeshes ?? [];
        if (!meshes.length) return;

        const span = PLANE_SIZE;
        const repeat = TILE_REPEAT;
        const maxGap = (span - repeat * 0.05) / Math.max(1, repeat - 1);
        const gap = clamp(this._tileGap, 0.0, Math.max(0.0, maxGap));
        const tile = Math.max(0.05, (span - gap * (repeat - 1)) / repeat);

        const startX = -span * 0.5 + tile * 0.5;
        const startZ = -span * 0.5 + tile * 0.5;

        for (let iz = 0; iz < repeat; iz++) {
            for (let ix = 0; ix < repeat; ix++) {
                const index = ix + iz * repeat;
                const mesh = meshes[index] ?? null;
                if (!mesh) continue;
                const x = startX + ix * (tile + gap);
                const z = startZ + iz * (tile + gap);
                mesh.position.x = x;
                mesh.position.z = z;
                mesh.scale.set(tile, tile, 1);
            }
        }
    }

    _syncPreviewMode() {
        const tiled = this._previewMode === 'tiled';
        if (this._tileGroup) this._tileGroup.visible = tiled;
        this._syncPreviewMaps();
    }

    _syncPreviewMaps() {
        const tex = this._previewTexture ?? null;
        const tiled = this._previewMode === 'tiled';

        if (this._planeMat) {
            this._planeMat.map = tiled ? null : tex;
            this._planeMat.needsUpdate = true;
        }

        if (this._tileMat) {
            this._tileMat.map = tex;
            this._tileMat.needsUpdate = true;
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
        if (this._tileMat) {
            this._tileMat.map = null;
            this._tileMat.needsUpdate = true;
        }
    }
}
