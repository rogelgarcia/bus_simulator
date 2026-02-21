// src/graphics/gui/inspector_room/InspectorRoomTexturesProvider.js
// Texture inspection content provider for the Inspector Room.
import * as THREE from 'three';
import { getWindowNormalMapTexture, getWindowRoughnessMapTexture } from '../../assets3d/generators/buildings/WindowTextureGenerator.js';
import { getPbrMaterialMeta, getPbrMaterialTileMeters, resolvePbrMaterialUrls } from '../../assets3d/materials/PbrMaterialCatalog.js';
import { PbrTextureLoaderService } from '../../content3d/materials/PbrTexturePipeline.js';
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
const DEFAULT_REAL_WORLD_SIZE_METERS = 2.0;

const _realWorldSizeOverrides = new Map();

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

function deepClone(value) {
    if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
        return out;
    }
    return value;
}

function normalizeWindowPbrConfig(value) {
    const src = value && typeof value === 'object' ? value : {};
    const normal = src.normal && typeof src.normal === 'object' ? src.normal : {};
    const roughness = src.roughness && typeof src.roughness === 'object' ? src.roughness : {};
    const border = src.border && typeof src.border === 'object' ? src.border : {};

    return {
        normal: {
            enabled: normal.enabled === undefined ? true : !!normal.enabled,
            strength: clamp(normal.strength ?? 0.85, 0.0, 2.0)
        },
        roughness: {
            enabled: roughness.enabled === undefined ? true : !!roughness.enabled,
            contrast: clamp(roughness.contrast ?? 1.0, 0.0, 4.0)
        },
        border: {
            enabled: border.enabled === undefined ? true : !!border.enabled,
            thickness: clamp(border.thickness ?? 0.018, 0.0, 0.12),
            strength: clamp(border.strength ?? 0.35, 0.0, 1.0)
        }
    };
}

function normalizePbrMaterialPreviewConfig(value) {
    const src = value && typeof value === 'object' ? value : {};
    const albedo = src.albedo && typeof src.albedo === 'object' ? src.albedo : {};
    const normal = src.normal && typeof src.normal === 'object' ? src.normal : {};
    const orm = src.orm && typeof src.orm === 'object' ? src.orm : {};

    return {
        albedo: {
            enabled: albedo.enabled === undefined ? true : !!albedo.enabled,
            intensity: clamp(albedo.intensity ?? 1.0, 0.0, 2.0)
        },
        normal: {
            enabled: normal.enabled === undefined ? true : !!normal.enabled,
            intensity: clamp(normal.intensity ?? 0.9, 0.0, 2.0)
        },
        orm: {
            enabled: orm.enabled === undefined ? true : !!orm.enabled,
            aoIntensity: clamp(orm.aoIntensity ?? 1.0, 0.0, 2.0),
            roughness: clamp(orm.roughness ?? 1.0, 0.0, 1.0),
            metalness: clamp(orm.metalness ?? 1.0, 0.0, 1.0)
        }
    };
}

function normalizeRealWorldSizeMeters({ widthMeters, heightMeters } = {}, { fallbackWidthMeters = DEFAULT_REAL_WORLD_SIZE_METERS, fallbackHeightMeters = DEFAULT_REAL_WORLD_SIZE_METERS } = {}) {
    const fw = Number(fallbackWidthMeters);
    const fh = Number(fallbackHeightMeters);
    const fallbackW = (Number.isFinite(fw) && fw > 0) ? fw : DEFAULT_REAL_WORLD_SIZE_METERS;
    const fallbackH = (Number.isFinite(fh) && fh > 0) ? fh : DEFAULT_REAL_WORLD_SIZE_METERS;

    const w = Number(widthMeters);
    const h = Number(heightMeters);
    const safeW = (Number.isFinite(w) && w > 0) ? w : fallbackW;
    const safeH = (Number.isFinite(h) && h > 0) ? h : fallbackH;

    return {
        widthMeters: clamp(safeW, 0.01, 1000),
        heightMeters: clamp(safeH, 0.01, 1000)
    };
}

function deriveRealWorldSizeFromAspect(aspect, { baseMeters = DEFAULT_REAL_WORLD_SIZE_METERS } = {}) {
    const base = Number(baseMeters);
    const safeBase = (Number.isFinite(base) && base > 0) ? base : DEFAULT_REAL_WORLD_SIZE_METERS;
    const raw = Number(aspect);
    if (!(Number.isFinite(raw) && raw > 0)) return { widthMeters: safeBase, heightMeters: safeBase };
    const a = clamp(raw, 0.001, 500);
    if (a >= 1) return { widthMeters: safeBase * a, heightMeters: safeBase };
    return { widthMeters: safeBase, heightMeters: safeBase / a };
}

function getDefaultRealWorldSizeForEntry(entry) {
    const kind = entry?.kind ?? null;
    if (kind === 'pbr_material') {
        const materialId = entry?.materialId ?? entry?.id ?? null;
        const tile = getPbrMaterialTileMeters(materialId);
        if (Number.isFinite(tile) && tile > 0) {
            return { size: { widthMeters: tile, heightMeters: tile }, source: 'catalog' };
        }
    }

    if (Number.isFinite(Number(entry?.aspect)) && Number(entry?.aspect) > 0) {
        return { size: deriveRealWorldSizeFromAspect(entry.aspect), source: 'default' };
    }

    return { size: { widthMeters: DEFAULT_REAL_WORLD_SIZE_METERS, heightMeters: DEFAULT_REAL_WORLD_SIZE_METERS }, source: 'default' };
}

function getEffectiveRealWorldSizeForEntry(entry) {
    const id = typeof entry?.id === 'string' ? entry.id : null;
    if (id) {
        const override = _realWorldSizeOverrides.get(id) ?? null;
        if (override && typeof override === 'object') {
            const normalized = normalizeRealWorldSizeMeters(override);
            return { size: normalized, source: 'override' };
        }
    }
    return getDefaultRealWorldSizeForEntry(entry);
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

export function buildTexturePreviewMaterialMaps({
    previewMode = 'single',
    baseTex = null,
    normalTex = null,
    ormTex = null,
    roughnessTex = null,
    metalnessTex = null,
    aoTex = null,
    alphaTex = null
} = {}) {
    const tiled = previewMode === 'tiled';

    const effectiveRoughnessTex = roughnessTex ?? ormTex ?? null;
    const effectiveMetalnessTex = metalnessTex ?? ormTex ?? null;
    const effectiveAoTex = aoTex ?? ormTex ?? null;

    const maps = {
        map: baseTex ?? null,
        normalMap: normalTex ?? null,
        aoMap: effectiveAoTex,
        roughnessMap: effectiveRoughnessTex,
        metalnessMap: effectiveMetalnessTex,
        alphaMap: alphaTex ?? null
    };

    return {
        overlay: tiled ? { map: null, normalMap: null, aoMap: null, roughnessMap: null, metalnessMap: null, alphaMap: null } : maps,
        tile: maps
    };
}

export function computeRealWorldAspectRatio({ widthMeters, heightMeters } = {}) {
    const w = Number(widthMeters);
    const h = Number(heightMeters);
    if (!(Number.isFinite(w) && w > 0) || !(Number.isFinite(h) && h > 0)) return null;
    return w / h;
}

export function computeRealWorldRepeat({ surfaceSizeMeters = null, tileSizeMeters = null } = {}) {
    const surface = surfaceSizeMeters && typeof surfaceSizeMeters === 'object' ? surfaceSizeMeters : null;
    const tile = tileSizeMeters && typeof tileSizeMeters === 'object' ? tileSizeMeters : null;
    const sx = Number(surface?.x);
    const sy = Number(surface?.y);
    const tx = Number(tile?.x);
    const ty = Number(tile?.y);
    if (!(Number.isFinite(sx) && sx > 0) || !(Number.isFinite(sy) && sy > 0)) return { x: 1, y: 1 };
    if (!(Number.isFinite(tx) && tx > 0) || !(Number.isFinite(ty) && ty > 0)) return { x: 1, y: 1 };
    return { x: sx / tx, y: sy / ty };
}

function buildPlaceholderCanvas({ label = '', size = 256 } = {}) {
    const s = Math.max(32, Math.round(Number(size) || 256));
    const c = document.createElement('canvas');
    c.width = s;
    c.height = s;
    const ctx = c.getContext('2d');
    if (!ctx) return c;

    const text = String(label || '');
    const seed = Array.from(text).reduce((sum, ch) => (sum * 33 + ch.charCodeAt(0)) >>> 0, 5381);
    const hue = (seed % 360) / 360;
    ctx.fillStyle = `hsl(${Math.round(hue * 360)}, 35%, 55%)`;
    ctx.fillRect(0, 0, s, s);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.translate(s * 0.5, s * 0.5);
    ctx.rotate(-Math.PI / 6);
    ctx.translate(-s * 0.5, -s * 0.5);
    ctx.fillStyle = '#000';
    for (let i = -s; i < s * 2; i += 24) {
        ctx.fillRect(i, 0, 12, s);
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, s - 44, s, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `bold ${Math.max(14, Math.round(s * 0.07))}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 22) || 'Missing', Math.max(10, Math.round(s * 0.04)), s - 22);
    return c;
}

function canvasToTexture(canvas, { srgb = true } = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    if ('colorSpace' in tex) tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    else if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
    tex.needsUpdate = true;
    return tex;
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
        this._previewNormalScale = 0.9;

        this._tileGroup = null;
        this._tileGeo = null;
        this._tileMat = null;
        this._tileMeshes = [];
        this._selectedSizeMeters = { widthMeters: DEFAULT_REAL_WORLD_SIZE_METERS, heightMeters: DEFAULT_REAL_WORLD_SIZE_METERS };

        this._textureLoader = new THREE.TextureLoader();
        this._pbrTextureService = new PbrTextureLoaderService({
            renderer: this.engine?.renderer ?? null,
            textureLoader: this._textureLoader
        });
        this._urlTextures = new Map();
        this._warnedUrls = new Set();
        this._loadToken = 0;

        this._collectionIndex = 0;
        this._collectionId = null;
        this._textureIndex = 0;
        this._textureId = null;
        this._baseColor = 0xffffff;
        this._previewMode = 'single';
        this._tileGap = 0.0;

        this._windowPbr = normalizeWindowPbrConfig(null);
        this._pbrMaterialPreview = normalizePbrMaterialPreviewConfig(null);
        this._scratchTint = new THREE.Color();
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
        this._pbrTextureService?.dispose?.();
        this._pbrTextureService = null;
        this._warnedUrls.clear();

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
        this._selectedSizeMeters = getEffectiveRealWorldSizeForEntry(entry).size;
        this._syncPreviewLayout();

        if (entry?.kind === 'pbr_material') {
            this._setPbrMaterial(entry);
            return;
        }

        const tex = getTextureInspectorTextureById(nextId);
        this._setPlaneTexture(tex, entry);
    }

    getSelectedTextureMeta() {
        const entry = getTextureInspectorEntryById(this._textureId);
        if (!entry) return null;
        let extra = null;
        if (entry.kind === 'sign') {
            extra = { kind: 'sign', atlas: entry.atlasLabel ?? entry.atlasId ?? '-', rectPx: entry.rectPx ?? null, uv: entry.uv ?? null };
        } else if (entry.kind === 'window') {
            extra = { kind: 'window', style: entry.style ?? '-' };
        } else if (entry.kind === 'pbr_material') {
            const materialId = entry?.materialId ?? entry?.id ?? null;
            const meta = getPbrMaterialMeta(materialId);
            const urls = resolvePbrMaterialUrls(materialId);
            const tileMeters = meta?.tileMeters ?? null;
            extra = {
                kind: 'pbr_material',
                tileMeters: (Number.isFinite(Number(tileMeters)) && Number(tileMeters) > 0) ? Number(tileMeters) : null,
                preferredVariant: meta?.preferredVariant ?? null,
                variants: meta?.variants ?? null,
                maps: meta?.maps ?? null,
                resolvedMaps: {
                    baseColor: !!urls?.baseColorUrl,
                    normal: !!urls?.normalUrl,
                    orm: !!urls?.ormUrl
                }
            };
        }
        return { id: entry.id, name: entry.label, collection: entry.collectionLabel ?? entry.collectionId ?? '-', extra };
    }

    setBaseColorHex(hex) {
        const next = Number.isFinite(hex) ? hex : 0xffffff;
        this._baseColor = next;
        this.room?.setPlaneBaseColor?.(next);
        this._applyPreviewTint();
    }

    getBaseColorHex() {
        return this._baseColor;
    }

    getPbrMaterialPreviewConfig() {
        return deepClone(this._pbrMaterialPreview);
    }

    setPbrMaterialPreviewConfig(value) {
        this._pbrMaterialPreview = normalizePbrMaterialPreviewConfig(value);
        this._applyPreviewTint();
        const entry = getTextureInspectorEntryById(this._textureId);
        if (entry?.kind !== 'pbr_material') return;
        this._syncPreviewMaps();
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

    getWindowPbrConfig() {
        return deepClone(this._windowPbr);
    }

    setWindowPbrConfig(value) {
        this._windowPbr = normalizeWindowPbrConfig(value);
        const entry = getTextureInspectorEntryById(this._textureId);
        if (entry?.kind !== 'window') return;
        this._applyWindowPbrMaps(entry);
        this._syncPreviewWrap();
        this._syncPreviewMaps();
    }

    _applyPreviewTint() {
        const entry = getTextureInspectorEntryById(this._textureId);
        const isPbrMaterial = entry?.kind === 'pbr_material';
        const intensity = isPbrMaterial ? (this._pbrMaterialPreview?.albedo?.intensity ?? 1.0) : 1.0;
        const k = clamp(intensity, 0.0, 2.0);
        this._scratchTint.setHex(this._baseColor);
        if (Math.abs(k - 1.0) > 1e-6) this._scratchTint.multiplyScalar(k);

        if (this._overlayMat?.color) this._overlayMat.color.copy(this._scratchTint);
        if (this._tileMat?.color) this._tileMat.color.copy(this._scratchTint);
    }

    getSelectedRealWorldSizeMeters() {
        return { ...this._selectedSizeMeters };
    }

    setSelectedRealWorldSizeMeters({ widthMeters, heightMeters } = {}) {
        const entry = getTextureInspectorEntryById(this._textureId);
        if (!entry) return;
        const id = typeof entry.id === 'string' ? entry.id : null;
        if (!id) return;

        const rawW = Number(widthMeters);
        const rawH = Number(heightMeters);
        const hasW = Number.isFinite(rawW) && rawW > 0;
        const hasH = Number.isFinite(rawH) && rawH > 0;

        if (!hasW && !hasH) {
            _realWorldSizeOverrides.delete(id);
            this._selectedSizeMeters = getDefaultRealWorldSizeForEntry(entry).size;
            this._syncPreviewLayout();
            return;
        }

        const current = this._selectedSizeMeters ?? { widthMeters: DEFAULT_REAL_WORLD_SIZE_METERS, heightMeters: DEFAULT_REAL_WORLD_SIZE_METERS };
        const next = normalizeRealWorldSizeMeters(
            { widthMeters: hasW ? rawW : current.widthMeters, heightMeters: hasH ? rawH : current.heightMeters },
            { fallbackWidthMeters: current.widthMeters, fallbackHeightMeters: current.heightMeters }
        );
        _realWorldSizeOverrides.set(id, next);
        this._selectedSizeMeters = next;
        this._syncPreviewLayout();
    }

    getFocusBounds() {
        const size = this._getPreviewSurfaceSizeMeters();
        const w = Number(size?.widthMeters);
        const h = Number(size?.heightMeters);
        const radius = (Number.isFinite(w) && Number.isFinite(h))
            ? 0.5 * Math.sqrt(w * w + h * h)
            : PLANE_SIZE * 0.55;
        return {
            center: new THREE.Vector3(0, 0, 0),
            radius: Number.isFinite(radius) ? Math.max(0.001, radius) : 1
        };
    }

    getMeasurementObject3d() {
        if (this._previewMode === 'tiled') {
            const tiles = this._tileMeshes ?? [];
            if (!tiles.length) return this._tileGroup ?? null;
            let best = tiles[0];
            let bestD2 = (best.position.x ** 2) + (best.position.z ** 2);
            for (let i = 1; i < tiles.length; i++) {
                const t = tiles[i];
                if (!t) continue;
                const d2 = (t.position.x ** 2) + (t.position.z ** 2);
                if (d2 < bestD2) {
                    best = t;
                    bestD2 = d2;
                }
            }
            return best ?? this._tileGroup ?? null;
        }
        return this._overlay ?? null;
    }

    _createPreviewMeshes() {
        if (!this.root) return;

        this._overlayGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
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

        const repeat = TILE_REPEAT;
        const gap = clamp(this._tileGap, 0.0, 0.75);
        const size = normalizeRealWorldSizeMeters(this._selectedSizeMeters);
        const tileW = size.widthMeters;
        const tileH = size.heightMeters;

        const spanW = repeat * tileW + gap * (repeat - 1);
        const spanH = repeat * tileH + gap * (repeat - 1);
        const startX = -spanW * 0.5 + tileW * 0.5;
        const startZ = -spanH * 0.5 + tileH * 0.5;

        for (let iz = 0; iz < repeat; iz++) {
            for (let ix = 0; ix < repeat; ix++) {
                const index = ix + iz * repeat;
                const mesh = meshes[index] ?? null;
                if (!mesh) continue;
                const x = startX + ix * (tileW + gap);
                const z = startZ + iz * (tileH + gap);
                mesh.position.x = x;
                mesh.position.z = z;
                mesh.scale.set(tileW, tileH, 1);
            }
        }
    }

    _syncPreviewMode() {
        const tiled = this._previewMode === 'tiled';
        if (this._tileGroup) this._tileGroup.visible = tiled;
        if (this._overlay) this._overlay.visible = !tiled;
        this._syncPreviewLayout();
        this._syncPreviewWrap();
        this._syncPreviewMaps();
    }

    _syncPreviewLayout() {
        const size = normalizeRealWorldSizeMeters(this._selectedSizeMeters);
        if (this._overlay) this._overlay.scale.set(size.widthMeters, size.heightMeters, 1);
        this._layoutTiles();
    }

    _syncPreviewWrap() {
        const wrap = this._previewMode === 'tiled' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        const apply = (tex) => {
            if (!tex) return;
            tex.wrapS = wrap;
            tex.wrapT = wrap;
            tex.needsUpdate = true;
        };
        apply(this._previewTexture);
        apply(this._previewNormalMap);
        apply(this._previewRoughnessMap);
    }

    _getPreviewSurfaceSizeMeters() {
        const size = normalizeRealWorldSizeMeters(this._selectedSizeMeters);
        if (this._previewMode !== 'tiled') return size;

        const repeat = TILE_REPEAT;
        const gap = clamp(this._tileGap, 0.0, 0.75);
        return {
            widthMeters: repeat * size.widthMeters + gap * (repeat - 1),
            heightMeters: repeat * size.heightMeters + gap * (repeat - 1)
        };
    }

    _setPlaneTexture(tex, entry) {
        this._disposePreviewTexture();
        const wrap = this._previewMode === 'tiled' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        const preview = clonePreviewTexture(tex, { offset: entry?.offset ?? null, repeat: entry?.repeat ?? null, wrap });
        this._previewTexture = preview;
        this._previewNormalMap = null;
        this._previewRoughnessMap = null;
        this._previewNormalScale = 0.9;
        this._previewAlphaMap = entry?.kind === 'sign' ? getSignAlphaMaskTextureById(entry?.id) : null;
        if (entry?.kind === 'window') this._applyWindowPbrMaps(entry);
        this._syncPreviewWrap();
        this._syncPreviewMaps();
    }

    _applyWindowPbrMaps(entry) {
        if (!entry || entry.kind !== 'window') return;

        this._previewNormalMap?.dispose?.();
        this._previewRoughnessMap?.dispose?.();
        this._previewNormalMap = null;
        this._previewRoughnessMap = null;

        const style = typeof entry.style === 'string' && entry.style ? entry.style : 'default';
        const typeId = `window.style.${style}`;
        const pbr = this._windowPbr ?? normalizeWindowPbrConfig(null);

        this._previewNormalScale = clamp(pbr?.normal?.strength ?? 0.85, 0.0, 2.0);

        const wrap = this._previewMode === 'tiled' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        this._previewNormalMap = pbr?.normal?.enabled
            ? clonePreviewTexture(getWindowNormalMapTexture({ typeId, border: pbr?.border ?? null }), { wrap })
            : null;
        this._previewRoughnessMap = pbr?.roughness?.enabled
            ? clonePreviewTexture(getWindowRoughnessMapTexture({ typeId, roughness: pbr?.roughness ?? null }), { wrap })
            : null;
    }

    _setPbrMaterial(entry) {
        this._disposePreviewTexture();
        this._previewNormalScale = 0.9;

        this._loadToken += 1;
        this._previewAlphaMap = null;
        const wrap = this._previewMode === 'tiled' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        const label = entry?.label ?? entry?.materialId ?? 'PBR material';

        const resolved = this._pbrTextureService?.resolveMaterial(entry?.materialId, {
            cloneTextures: false,
            diagnosticsTag: 'InspectorRoomTexturesProvider.setPbrMaterial'
        }) ?? null;
        const baseTex = resolved?.textures?.baseColor ?? null;
        const normalTex = resolved?.textures?.normal ?? null;
        const ormTex = resolved?.textures?.orm ?? resolved?.textures?.roughness ?? null;

        if (!baseTex && !normalTex && !ormTex) {
            const tex = canvasToTexture(buildPlaceholderCanvas({ label, size: 256 }), { srgb: true });
            this._previewTexture = clonePreviewTexture(tex, { wrap });
            tex.dispose?.();
            this._previewNormalMap = null;
            this._previewRoughnessMap = null;
            this._syncPreviewWrap();
            this._syncPreviewMaps();
            return;
        }

        if (baseTex) this._previewTexture = clonePreviewTexture(baseTex, { wrap });
        else {
            const tex = canvasToTexture(buildPlaceholderCanvas({ label, size: 256 }), { srgb: true });
            this._previewTexture = clonePreviewTexture(tex, { wrap });
            tex.dispose?.();
        }

        this._previewNormalMap = clonePreviewTexture(normalTex, { wrap });
        this._previewRoughnessMap = clonePreviewTexture(ormTex, { wrap });
        this._syncPreviewWrap();
        this._syncPreviewMaps();
    }

    _warnTextureUrlOnce(url, err) {
        const safeUrl = typeof url === 'string' && url ? url : null;
        if (!safeUrl) return;
        if (this._warnedUrls.has(safeUrl)) return;
        this._warnedUrls.add(safeUrl);

        const detail = err?.message ?? (typeof err === 'string' ? err : '');
        const suffix = ' (Fix: ensure asset exists; if using Git LFS run git lfs pull.)';
        const msg = detail
            ? `[InspectorRoom] Failed to load texture: ${safeUrl}. ${detail}${suffix}`
            : `[InspectorRoom] Failed to load texture: ${safeUrl}.${suffix}`;
        console.warn(msg);
    }

    _syncPreviewMaps() {
        const entry = getTextureInspectorEntryById(this._textureId);
        const kind = entry?.kind ?? null;

        const baseTex = this._previewTexture ?? null;
        const normalTex = this._previewNormalMap ?? null;
        const pbrTex = this._previewRoughnessMap ?? null;
        const alphaTex = this._previewAlphaMap ?? null;

        const isPbrMaterial = kind === 'pbr_material';

        const pbrCfg = isPbrMaterial ? (this._pbrMaterialPreview ?? normalizePbrMaterialPreviewConfig(null)) : null;
        const wantsAlbedoMap = isPbrMaterial ? !!pbrCfg?.albedo?.enabled : true;
        const wantsNormalMap = isPbrMaterial ? !!pbrCfg?.normal?.enabled : true;
        const wantsOrmMap = isPbrMaterial ? !!pbrCfg?.orm?.enabled : true;

        const effectiveBaseTex = wantsAlbedoMap ? baseTex : null;
        const effectiveNormalTex = wantsNormalMap ? normalTex : null;

        const effectiveRoughnessTex = isPbrMaterial ? (wantsOrmMap ? pbrTex : null) : pbrTex;
        const effectiveMetalnessTex = isPbrMaterial ? (wantsOrmMap ? pbrTex : null) : null;
        const effectiveAoTex = isPbrMaterial ? (wantsOrmMap ? pbrTex : null) : null;

        const hasPbr = !!effectiveNormalTex || !!effectiveRoughnessTex || !!effectiveMetalnessTex || !!effectiveAoTex;

        const roughness = isPbrMaterial
            ? clamp(pbrCfg?.orm?.roughness ?? 1.0, 0.0, 1.0)
            : (effectiveRoughnessTex ? 1.0 : 0.85);
        const metalness = isPbrMaterial
            ? clamp(pbrCfg?.orm?.metalness ?? 1.0, 0.0, 1.0)
            : (effectiveRoughnessTex ? 0.0 : 0.05);
        const aoIntensity = isPbrMaterial
            ? clamp(pbrCfg?.orm?.aoIntensity ?? 1.0, 0.0, 2.0)
            : 1.0;
        const normalIntensity = isPbrMaterial
            ? clamp(pbrCfg?.normal?.intensity ?? 0.9, 0.0, 2.0)
            : clamp(this._previewNormalScale, 0.0, 2.0);

        const maps = buildTexturePreviewMaterialMaps({
            previewMode: this._previewMode,
            baseTex: effectiveBaseTex,
            normalTex: effectiveNormalTex,
            roughnessTex: effectiveRoughnessTex,
            metalnessTex: effectiveMetalnessTex,
            aoTex: effectiveAoTex,
            alphaTex
        });

        if (this._overlayMat) {
            this._overlayMat.map = maps.overlay.map;
            this._overlayMat.normalMap = maps.overlay.normalMap;
            this._overlayMat.aoMap = maps.overlay.aoMap;
            this._overlayMat.roughnessMap = maps.overlay.roughnessMap;
            this._overlayMat.metalnessMap = maps.overlay.metalnessMap;
            this._overlayMat.alphaMap = maps.overlay.alphaMap;
            this._overlayMat.alphaTest = maps.overlay.alphaMap ? 0.5 : 0;
            this._overlayMat.roughness = roughness;
            this._overlayMat.metalness = metalness;
            if ('aoMapIntensity' in this._overlayMat) this._overlayMat.aoMapIntensity = aoIntensity;
            if (hasPbr && this._overlayMat.normalScale) {
                this._overlayMat.normalScale.set(normalIntensity, normalIntensity);
            }
            this._overlayMat.needsUpdate = true;
        }

        if (this._tileMat) {
            this._tileMat.map = maps.tile.map;
            this._tileMat.normalMap = maps.tile.normalMap;
            this._tileMat.aoMap = maps.tile.aoMap;
            this._tileMat.roughnessMap = maps.tile.roughnessMap;
            this._tileMat.metalnessMap = maps.tile.metalnessMap;
            this._tileMat.alphaMap = maps.tile.alphaMap;
            this._tileMat.alphaTest = maps.tile.alphaMap ? 0.5 : 0;
            this._tileMat.roughness = roughness;
            this._tileMat.metalness = metalness;
            if ('aoMapIntensity' in this._tileMat) this._tileMat.aoMapIntensity = aoIntensity;
            if (hasPbr && this._tileMat.normalScale) {
                this._tileMat.normalScale.set(normalIntensity, normalIntensity);
            }
            this._tileMat.needsUpdate = true;
        }

        if (isPbrMaterial) this._applyPreviewTint();
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
            this._overlayMat.aoMap = null;
            this._overlayMat.roughnessMap = null;
            this._overlayMat.metalnessMap = null;
            this._overlayMat.needsUpdate = true;
        }
        if (this._tileMat) {
            this._tileMat.map = null;
            this._tileMat.alphaMap = null;
            this._tileMat.alphaTest = 0;
            this._tileMat.normalMap = null;
            this._tileMat.aoMap = null;
            this._tileMat.roughnessMap = null;
            this._tileMat.metalnessMap = null;
            this._tileMat.needsUpdate = true;
        }
    }
}
