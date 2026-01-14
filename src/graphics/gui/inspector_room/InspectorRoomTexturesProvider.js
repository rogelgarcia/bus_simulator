// src/graphics/gui/inspector_room/InspectorRoomTexturesProvider.js
// Texture inspection content provider for the Inspector Room.
import * as THREE from 'three';
import { resolveBuildingStyleWallMaterialUrls } from '../../assets3d/generators/buildings/BuildingGenerator.js';
import { getSignAlphaMaskTextureById } from '../../assets3d/textures/signs/SignAlphaMaskCache.js';
import {
    getTextureInspectorCollectionById,
    getTextureInspectorCollections,
    getTextureInspectorEntryById,
    getTextureInspectorOptionsForCollection,
    getTextureInspectorTextureById
} from '../../assets3d/textures/TextureInspectorCatalog.js';

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

function ensureUv2(geometry) {
    const geo = geometry ?? null;
    const uv = geo?.attributes?.uv ?? null;
    if (!geo || !uv || geo.attributes?.uv2) return;
    geo.setAttribute('uv2', new THREE.BufferAttribute(uv.array, 2));
}

function clonePreviewTexture(tex, { offset = null, repeat = null, wrap = THREE.ClampToEdgeWrapping } = {}) {
    if (!tex) return null;
    const clone = tex.clone();
    clone.wrapS = wrap;
    clone.wrapT = wrap;
    const rep = repeat && typeof repeat === 'object' ? repeat : null;
    const off = offset && typeof offset === 'object' ? offset : null;
    clone.repeat.set(Number(rep?.x) || 1, Number(rep?.y) || 1);
    clone.offset.set(Number(off?.x) || 0, Number(off?.y) || 0);
    clone.anisotropy = 8;
    clone.needsUpdate = true;
    return clone;
}

export class InspectorRoomTexturesProvider {
    constructor(engine, room) {
        this.engine = engine;
        this.room = room;

        this.root = null;
        this._parent = null;

        this._overlay = null;
        this._overlayMat = null;
        this._overlayGeo = null;

        this._previewTexture = null;
        this._previewNormalMap = null;
        this._previewRoughnessMap = null;
        this._previewAlphaMap = null;

        this._tileGroup = null;
        this._tileGeo = null;
        this._tileMat = null;
        this._tileMeshes = [];

        this._textureLoader = new THREE.TextureLoader();
        this._urlTextures = new Map();
        this._loadToken = 0;

        this._collectionIndex = 0;
        this._collectionId = null;
        this._textureIndex = 0;
        this._textureId = null;
        this._baseColor = 0xffffff;
        this._previewMode = 'single';
        this._tileGap = 0.0;
        this._selectedAspect = null;
    }

    getId() {
        return 'textures';
    }

    getLabel() {
        return 'Textures';
    }

    getRoomConfig() {
        return {
            planeSize: PLANE_SIZE,
            planeY: 0,
            planeColor: this._baseColor,
            planeRoughness: 0.8,
            planeMetalness: 0.0,
            gridSize: 6,
            gridDivisions: 24
        };
    }

    mount(parent) {
        const target = parent && typeof parent === 'object' ? parent : null;
        if (!target) return;
        this._parent = target;

        if (!this.root) {
            this.root = new THREE.Group();
            this.root.name = 'inspector_room_textures_root';
        }
        if (!this.root.parent) target.add(this.root);

        if (!this._overlay) this._createPreviewMeshes();
        this._syncPreviewMode();

        this.room?.setPlaneBaseColor?.(this._baseColor);

        if (this._collectionId) this.setSelectedCollectionId(this._collectionId);
        else this.setSelectedCollectionIndex(this._collectionIndex);
    }

    unmount() {
        this._parent?.remove?.(this.root);
        this._parent = null;
    }

    dispose() {
        this._disposePreviewTexture();
        this._disposeUrlTextures();

        if (this._tileGroup) this.root?.remove?.(this._tileGroup);
        this._tileGroup = null;
        this._tileMeshes = [];
        this._tileGeo?.dispose?.();
        this._tileGeo = null;
        this._tileMat?.dispose?.();
        this._tileMat = null;

        if (this._overlay) this.root?.remove?.(this._overlay);
        this._overlay = null;
        this._overlayGeo?.dispose?.();
        this._overlayGeo = null;
        this._overlayMat?.dispose?.();
        this._overlayMat = null;

        this._parent?.remove?.(this.root);
        this._parent = null;
        this.root = null;
    }

    update() {}

    getCollectionOptions() {
        return getTextureInspectorCollections();
    }

    getSelectedCollectionIndex() {
        return this._collectionIndex;
    }

    setSelectedCollectionIndex(index) {
        const options = this.getCollectionOptions();
        const next = clampInt(index, 0, Math.max(0, options.length - 1));
        this._collectionIndex = next;
        const id = options[next]?.id ?? options[0]?.id ?? null;
        if (id) this.setSelectedCollectionId(id);
    }

    getSelectedCollectionId() {
        return this._collectionId;
    }

    setSelectedCollectionId(collectionId) {
        const options = this.getCollectionOptions();
        const idx = options.findIndex((opt) => opt?.id === collectionId);
        if (idx >= 0) this._collectionIndex = idx;

        const collection = getTextureInspectorCollectionById(collectionId);
        const nextId = collection?.id ?? options[0]?.id ?? null;
        if (!nextId) return;
        if (nextId === this._collectionId) return;
        this._collectionId = nextId;
        this.setSelectedTextureIndex(0);
    }

    getSelectedCollectionMeta() {
        const collection = getTextureInspectorCollectionById(this._collectionId);
        if (!collection) return null;
        return { id: collection.id, name: collection.label };
    }

    getTextureOptions() {
        return getTextureInspectorOptionsForCollection(this._collectionId);
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

    getSelectedTextureId() {
        return this._textureId;
    }

    setSelectedTextureId(textureId) {
        const entry = getTextureInspectorEntryById(textureId);
        const nextId = entry?.id ?? null;
        if (!nextId) return;

        const collectionId = entry?.collectionId ?? null;
        if (collectionId && collectionId !== this._collectionId) {
            const collectionOptions = this.getCollectionOptions();
            const idx = collectionOptions.findIndex((opt) => opt?.id === collectionId);
            if (idx >= 0) this._collectionIndex = idx;
            this._collectionId = collectionId;
        }

        const options = this.getTextureOptions();
        const idx = options.findIndex((opt) => opt?.id === nextId);
        if (idx >= 0) this._textureIndex = idx;

        if (nextId === this._textureId) return;
        this._textureId = nextId;
        this._selectedAspect = entry?.aspect ?? null;

        if (entry?.kind === 'building_wall') {
            this._setBuildingWallMaterial(entry);
            return;
        }

        const tex = getTextureInspectorTextureById(nextId);
        this._setPlaneTexture(tex, entry);
    }

    getSelectedTextureMeta() {
        const entry = getTextureInspectorEntryById(this._textureId);
        if (!entry) return null;
        const extra = entry.kind === 'sign'
            ? { atlas: entry.atlasLabel ?? entry.atlasId ?? '-', rectPx: entry.rectPx ?? null, uv: entry.uv ?? null }
            : (entry.kind === 'building_wall' ? { style: entry.style ?? '-' } : null);
        return { id: entry.id, name: entry.label, collection: entry.collectionLabel ?? entry.collectionId ?? '-', extra };
    }

    setBaseColorHex(hex) {
        const next = Number.isFinite(hex) ? hex : 0xffffff;
        this._baseColor = next;
        this.room?.setPlaneBaseColor?.(next);
        if (this._overlayMat) this._overlayMat.color.setHex(next);
        if (this._tileMat) this._tileMat.color.setHex(next);
    }

    getBaseColorHex() {
        return this._baseColor;
    }

    setPreviewModeId(modeId) {
        const next = modeId === 'tiled' ? 'tiled' : 'single';
        if (next === this._previewMode) return;
        this._previewMode = next;
        this._syncPreviewMode();
    }

    getPreviewModeId() {
        return this._previewMode;
    }

    setTileGap(value) {
        const next = clamp(value, 0.0, 0.75);
        if (Math.abs(next - this._tileGap) < 1e-6) return;
        this._tileGap = next;
        this._layoutTiles();
    }

    getTileGap() {
        return this._tileGap;
    }

    getFocusBounds() {
        const radius = PLANE_SIZE * 0.55;
        return {
            center: new THREE.Vector3(0, 0, 0),
            radius: Number.isFinite(radius) ? Math.max(0.001, radius) : 1
        };
    }

    _createPreviewMeshes() {
        if (!this.root) return;

        this._overlayGeo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, 1, 1);
        ensureUv2(this._overlayGeo);

        this._overlayMat = new THREE.MeshStandardMaterial({
            color: this._baseColor,
            metalness: 0.0,
            roughness: 0.8
        });

        this._overlay = new THREE.Mesh(this._overlayGeo, this._overlayMat);
        this._overlay.name = 'inspector_room_texture_overlay';
        this._overlay.rotation.x = -Math.PI / 2;
        this._overlay.position.y = 0.002;
        this._overlay.castShadow = false;
        this._overlay.receiveShadow = true;
        this.root.add(this._overlay);

        this._tileGroup = new THREE.Group();
        this._tileGroup.name = 'inspector_room_texture_tiles';
        this.root.add(this._tileGroup);

        this._tileGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
        ensureUv2(this._tileGeo);
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
        if (this._overlay) this._overlay.visible = !tiled;
        this._setPlaneAspect(this._selectedAspect);
        this._syncPreviewMaps();
    }

    _setPlaneAspect(aspect) {
        if (this._previewMode === 'tiled') {
            if (this._overlay) this._overlay.scale.set(1, 1, 1);
            return;
        }
        if (!this._overlay) return;
        const a = Number(aspect);
        if (!Number.isFinite(a) || !(a > 0)) {
            this._overlay.scale.set(1, 1, 1);
            return;
        }

        if (a >= 1) {
            this._overlay.scale.set(1, 1 / a, 1);
            return;
        }

        this._overlay.scale.set(a, 1, 1);
    }

    _setPlaneTexture(tex, entry) {
        this._disposePreviewTexture();
        const preview = clonePreviewTexture(tex, { offset: entry?.offset ?? null, repeat: entry?.repeat ?? null });
        this._previewTexture = preview;
        this._previewNormalMap = null;
        this._previewRoughnessMap = null;
        this._previewAlphaMap = entry?.kind === 'sign' ? getSignAlphaMaskTextureById(entry?.id) : null;
        this._setPlaneAspect(entry?.aspect ?? null);
        this._syncPreviewMaps();
    }

    _setBuildingWallMaterial(entry) {
        this._disposePreviewTexture();

        const token = ++this._loadToken;
        const urls = resolveBuildingStyleWallMaterialUrls(entry?.style);
        const baseUrl = urls?.baseColorUrl ?? null;
        const normalUrl = urls?.normalUrl ?? null;
        const ormUrl = urls?.ormUrl ?? null;

        this._previewAlphaMap = null;
        this._setPlaneAspect(null);

        Promise.all([
            this._loadUrlTexture(baseUrl, { srgb: true }),
            this._loadUrlTexture(normalUrl, { srgb: false }),
            this._loadUrlTexture(ormUrl, { srgb: false })
        ]).then(([baseTex, normalTex, ormTex]) => {
            if (token !== this._loadToken) return;
            const tiling = { x: 2, y: 2 };
            this._previewTexture = clonePreviewTexture(baseTex, { repeat: tiling, wrap: THREE.RepeatWrapping });
            this._previewNormalMap = clonePreviewTexture(normalTex, { repeat: tiling, wrap: THREE.RepeatWrapping });
            this._previewRoughnessMap = clonePreviewTexture(ormTex, { repeat: tiling, wrap: THREE.RepeatWrapping });
            this._syncPreviewMaps();
        }).catch((err) => {
            if (token !== this._loadToken) return;
            console.warn('[InspectorRoom] Failed to load building wall textures', err);
            this._syncPreviewMaps();
        });
    }

    _syncPreviewMaps() {
        const tex = this._previewTexture ?? null;
        const normalMap = this._previewNormalMap ?? null;
        const roughnessMap = this._previewRoughnessMap ?? null;
        const tiled = this._previewMode === 'tiled';

        const alphaMap = this._previewAlphaMap ?? null;
        const hasPbr = !!normalMap || !!roughnessMap;
        const roughness = roughnessMap ? 1.0 : 0.8;
        const metalness = 0.0;

        if (this._overlayMat) {
            this._overlayMat.map = tiled ? null : tex;
            this._overlayMat.normalMap = tiled ? null : normalMap;
            this._overlayMat.roughnessMap = tiled ? null : roughnessMap;
            this._overlayMat.alphaMap = tiled ? null : alphaMap;
            this._overlayMat.alphaTest = alphaMap ? 0.5 : 0;
            this._overlayMat.roughness = roughness;
            this._overlayMat.metalness = metalness;
            if (hasPbr && this._overlayMat.normalScale) this._overlayMat.normalScale.set(0.9, 0.9);
            this._overlayMat.needsUpdate = true;
        }

        if (this._tileMat) {
            this._tileMat.map = tex;
            this._tileMat.normalMap = normalMap;
            this._tileMat.roughnessMap = roughnessMap;
            this._tileMat.alphaMap = alphaMap;
            this._tileMat.alphaTest = alphaMap ? 0.5 : 0;
            this._tileMat.roughness = roughness;
            this._tileMat.metalness = metalness;
            if (hasPbr && this._tileMat.normalScale) this._tileMat.normalScale.set(0.9, 0.9);
            this._tileMat.needsUpdate = true;
        }
    }

    _configureUrlTexture(tex, { srgb = true } = {}) {
        if (!tex) return;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
        if ('colorSpace' in tex) {
            tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        } else if ('encoding' in tex) {
            tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
        }
        tex.needsUpdate = true;
    }

    _disposeUrlTextures() {
        for (const entry of this._urlTextures.values()) {
            entry?.texture?.dispose?.();
        }
        this._urlTextures.clear();
    }

    _loadUrlTexture(url, { srgb = true } = {}) {
        const safeUrl = typeof url === 'string' && url ? url : null;
        if (!safeUrl) return Promise.resolve(null);

        const cached = this._urlTextures.get(safeUrl) ?? null;
        if (cached?.texture) return Promise.resolve(cached.texture);
        if (cached?.promise) return cached.promise;

        const promise = this._textureLoader.loadAsync(safeUrl).then((tex) => {
            this._configureUrlTexture(tex, { srgb });
            this._urlTextures.set(safeUrl, { texture: tex, promise: null });
            return tex;
        }).catch((err) => {
            this._urlTextures.delete(safeUrl);
            throw err;
        });

        this._urlTextures.set(safeUrl, { texture: null, promise });
        return promise;
    }

    _disposePreviewTexture() {
        this._previewTexture?.dispose?.();
        this._previewNormalMap?.dispose?.();
        this._previewRoughnessMap?.dispose?.();

        this._previewTexture = null;
        this._previewNormalMap = null;
        this._previewRoughnessMap = null;
        this._previewAlphaMap = null;

        if (this._overlayMat) {
            this._overlayMat.map = null;
            this._overlayMat.alphaMap = null;
            this._overlayMat.alphaTest = 0;
            this._overlayMat.normalMap = null;
            this._overlayMat.roughnessMap = null;
            this._overlayMat.needsUpdate = true;
        }
        if (this._tileMat) {
            this._tileMat.map = null;
            this._tileMat.alphaMap = null;
            this._tileMat.alphaTest = 0;
            this._tileMat.normalMap = null;
            this._tileMat.roughnessMap = null;
            this._tileMat.needsUpdate = true;
        }
    }
}

