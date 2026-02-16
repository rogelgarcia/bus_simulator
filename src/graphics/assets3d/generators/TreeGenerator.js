// src/graphics/assets3d/generators/TreeGenerator.js
// Creates tree instances for the city world
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { TILE } from '../../../app/city/CityMap.js';
import { TREE_CONFIG } from './TreeConfig.js';

const TAU = Math.PI * 2;

const TREE_QUALITY_STORAGE_KEY = 'bus_sim.tree_quality.v1';

const TREE_DEFAULTS = {
    quality: 'auto',
    density: 0.5,
    clearance: 4,
    jitter: 0.7,
    scaleMin: 0.9,
    scaleMax: 1.1,
    maxAttempts: 4,
    height: 0,
    sink: 0.05,
    cornerBoost: 0.8,
    cornerPower: 1.4,
    cornerRadius: 0.45,
    roadRadius: 1,
    roadBoost: 0.25
};

const TEXTURE_BASE_URL = new URL('../../../../assets/trees/Textures/', import.meta.url);

const FBX_TEXTURE_PLACEHOLDER_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAAZ5sfcAAAAASUVORK5CYII=';
const FBX_TEXTURE_PLACEHOLDER_FLAT_NORMAL_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
const FBX_TEXTURE_PLACEHOLDERS = new Map([
    ['t_leaf.png', FBX_TEXTURE_PLACEHOLDER_PNG],
    ['t_trunk.png', FBX_TEXTURE_PLACEHOLDER_PNG],
    ['t_trunk_realistic9_normal.tga', FBX_TEXTURE_PLACEHOLDER_FLAT_NORMAL_PNG],
    ['t_leaf_realistic9_normal.tga', FBX_TEXTURE_PLACEHOLDER_FLAT_NORMAL_PNG]
]);

const LEAF_ALPHA_CUTOUT_THRESHOLD = 0.5;

let texturesPromise = null;
const templateCache = { desktop: null, mobile: null };
const promiseCache = { desktop: null, mobile: null };
let treeMaterials = null;

function normalizeQuality(value) {
    const v = String(value ?? '').toLowerCase();
    if (v === 'desktop') return 'desktop';
    if (v === 'mobile') return 'mobile';
    return 'auto';
}

function isProbablyMobileDevice() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const ua = String(navigator.userAgent || '').toLowerCase();
    if (/\b(mobi|mobile|android|iphone|ipod|ipad)\b/.test(ua)) return true;

    const points = Number(navigator.maxTouchPoints) || 0;
    const coarse = typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)').matches
        : false;
    if (points >= 2 && coarse) return true;
    return false;
}

function computeAutoQuality() {
    if (typeof navigator !== 'undefined') {
        const saveData = !!navigator.connection?.saveData;
        const mem = Number(navigator.deviceMemory);
        const cores = Number(navigator.hardwareConcurrency);
        if (saveData) return 'mobile';
        if (Number.isFinite(mem) && mem > 0 && mem < 6) return 'mobile';
        if (Number.isFinite(cores) && cores > 0 && cores <= 4) return 'mobile';
    }
    if (isProbablyMobileDevice()) return 'mobile';
    return 'desktop';
}

function readStorageQuality() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    try {
        const raw = storage.getItem(TREE_QUALITY_STORAGE_KEY);
        if (raw === null) return null;
        const v = normalizeQuality(raw);
        return v;
    } catch {
        return null;
    }
}

function readUrlQuality() {
    if (typeof window === 'undefined') return null;
    const search = window.location?.search ?? '';
    if (!search) return null;
    try {
        const params = new URLSearchParams(search);
        const raw = params.get('treeQuality');
        if (!raw) return null;
        return normalizeQuality(raw);
    } catch {
        return null;
    }
}

function writeStorageQuality(value) {
    if (typeof window === 'undefined') return;
    const storage = window.localStorage;
    if (!storage) return;
    try {
        storage.setItem(TREE_QUALITY_STORAGE_KEY, normalizeQuality(value));
    } catch {
        // ignore
    }
}

let _primedPreference = false;
function primeTreeQualityPreference() {
    if (_primedPreference) return;
    _primedPreference = true;
    const q = readUrlQuality();
    if (q) writeStorageQuality(q);
}

export function getResolvedTreeQuality({ quality = null } = {}) {
    primeTreeQualityPreference();
    const q = normalizeQuality(quality);
    if (q === 'desktop' || q === 'mobile') return q;

    const stored = readStorageQuality();
    if (stored === 'desktop' || stored === 'mobile') return stored;
    return computeAutoQuality();
}

function getQuality(value) {
    const q = normalizeQuality(value);
    if (q === 'desktop' || q === 'mobile') return q;
    return computeAutoQuality();
}

function getTreeEntries(quality) {
    const key = getQuality(quality);
    const entries = TREE_CONFIG?.[key];
    return Array.isArray(entries) ? entries : [];
}

function getModelBaseUrl(quality) {
    const folder = quality === 'desktop' ? 'Desktop' : 'Mobile';
    return new URL(`../../../../assets/trees/Models/${folder}/`, import.meta.url);
}

function applyTextureColorSpace(tex, { srgb }) {
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function bleedCutoutTextureRgb(tex, { passes = 2 } = {}) {
    const t = tex ?? null;
    const img = t?.image ?? null;
    const data = img?.data ?? null;
    const w = Number(img?.width) || 0;
    const h = Number(img?.height) || 0;
    if (!t || !data || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
    if (!(data instanceof Uint8Array)) return false;
    if (data.length < w * h * 4) return false;

    const userData = (t.userData && typeof t.userData === 'object') ? t.userData : (t.userData = {});
    if (userData._cutoutRgbBleedApplied === true) return true;

    let src = new Uint8Array(data);
    let dst = new Uint8Array(src);
    const maxPasses = Math.max(1, Math.min(6, Math.floor(Number(passes) || 2)));

    const idx = (x, y) => ((y * w + x) << 2);

    for (let pass = 0; pass < maxPasses; pass += 1) {
        let changed = false;
        for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < w; x += 1) {
                const i = idx(x, y);
                const a = src[i + 3];
                if (a > 0) continue;

                let rs = 0;
                let gs = 0;
                let bs = 0;
                let n = 0;

                for (let oy = -1; oy <= 1; oy += 1) {
                    for (let ox = -1; ox <= 1; ox += 1) {
                        if (ox === 0 && oy === 0) continue;
                        const nx = x + ox;
                        const ny = y + oy;
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                        const j = idx(nx, ny);
                        if (src[j + 3] <= 0) continue;
                        rs += src[j];
                        gs += src[j + 1];
                        bs += src[j + 2];
                        n += 1;
                    }
                }

                if (n <= 0) continue;
                dst[i] = Math.round(rs / n);
                dst[i + 1] = Math.round(gs / n);
                dst[i + 2] = Math.round(bs / n);
                dst[i + 3] = 0;
                changed = true;
            }
        }

        if (!changed) break;
        const tmp = src;
        src = dst;
        dst = tmp;
    }

    data.set(src);
    t.needsUpdate = true;
    userData._cutoutRgbBleedApplied = true;
    return true;
}

function createAoAlphaMapFromTextureAlpha(tex, { anisotropy = 1 } = {}) {
    const srcTex = tex ?? null;
    const img = srcTex?.image ?? null;
    const data = img?.data ?? null;
    const w = Number(img?.width) || 0;
    const h = Number(img?.height) || 0;
    if (!(data instanceof Uint8Array) || w <= 0 || h <= 0 || data.length < w * h * 4) return null;

    const out = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
        const alpha = data[(i * 4) + 3];
        const j = i * 4;
        out[j] = alpha;
        out[j + 1] = alpha;
        out[j + 2] = alpha;
        out[j + 3] = 255;
    }

    const alphaTex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
    applyTextureColorSpace(alphaTex, { srgb: false });
    alphaTex.wrapS = srcTex.wrapS;
    alphaTex.wrapT = srcTex.wrapT;
    alphaTex.magFilter = srcTex.magFilter;
    alphaTex.minFilter = srcTex.minFilter;
    alphaTex.generateMipmaps = srcTex.generateMipmaps !== false;
    alphaTex.anisotropy = Number.isFinite(Number(anisotropy)) ? Math.max(1, Number(anisotropy)) : 1;
    alphaTex.flipY = srcTex.flipY === true;
    alphaTex.offset.copy(srcTex.offset);
    alphaTex.repeat.copy(srcTex.repeat);
    alphaTex.center.copy(srcTex.center);
    alphaTex.rotation = Number.isFinite(srcTex.rotation) ? srcTex.rotation : 0;
    alphaTex.matrixAutoUpdate = srcTex.matrixAutoUpdate !== false;
    if (!alphaTex.matrixAutoUpdate) alphaTex.matrix.copy(srcTex.matrix);
    alphaTex.needsUpdate = true;
    return alphaTex;
}

function getUrlBasename(url) {
    const s = String(url ?? '');
    const stripped = s.split(/[?#]/)[0];
    const lastSlash = Math.max(stripped.lastIndexOf('/'), stripped.lastIndexOf('\\'));
    return lastSlash >= 0 ? stripped.slice(lastSlash + 1) : stripped;
}

function makeTreeLoadingManager() {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
        const basename = getUrlBasename(url).toLowerCase();
        return FBX_TEXTURE_PLACEHOLDERS.get(basename) ?? url;
    });

    const placeholderColor = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    placeholderColor.needsUpdate = true;
    applyTextureColorSpace(placeholderColor, { srgb: true });

    const placeholderNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    placeholderNormal.needsUpdate = true;
    applyTextureColorSpace(placeholderNormal, { srgb: false });

    const placeholderBinaryTextureLoader = {
        setPath() {
            return this;
        },
        load(url) {
            const name = getUrlBasename(url).toLowerCase();
            return name.includes('normal') ? placeholderNormal : placeholderColor;
        }
    };

    manager.addHandler(/\.tga$/i, placeholderBinaryTextureLoader);
    manager.addHandler(/\.dds$/i, placeholderBinaryTextureLoader);
    return manager;
}

function loadTextures() {
    const loader = new TGALoader();
    const load = (name) => loader.loadAsync(new URL(name, TEXTURE_BASE_URL).toString());
    return Promise.all([
        load('T_Leaf_Realistic9.TGA'),
        load('T_Leaf_Realistic9_normal.TGA'),
        load('T_Trunk_Realistic9.TGA'),
        load('T_Trunk_Realistic9_normal.TGA')
    ]).then(([leafMap, leafNormal, trunkMap, trunkNormal]) => {
        applyTextureColorSpace(leafMap, { srgb: true });
        applyTextureColorSpace(leafNormal, { srgb: false });
        applyTextureColorSpace(trunkMap, { srgb: true });
        applyTextureColorSpace(trunkNormal, { srgb: false });
        bleedCutoutTextureRgb(leafMap, { passes: 2 });
        // Leaves are rendered as alpha-test cutouts (not blended), so keep original RGB.
        leafMap.anisotropy = 8;
        leafMap.magFilter = THREE.LinearFilter;
        leafMap.minFilter = THREE.LinearMipmapLinearFilter;
        leafMap.generateMipmaps = true;
        leafNormal.anisotropy = 8;
        leafNormal.magFilter = THREE.LinearFilter;
        leafNormal.minFilter = THREE.LinearMipmapLinearFilter;
        leafNormal.generateMipmaps = true;
        trunkMap.anisotropy = 8;
        trunkMap.wrapS = THREE.RepeatWrapping;
        trunkMap.wrapT = THREE.RepeatWrapping;
        trunkNormal.wrapS = THREE.RepeatWrapping;
        trunkNormal.wrapT = THREE.RepeatWrapping;
        leafMap.needsUpdate = true;
        leafNormal.needsUpdate = true;
        trunkMap.needsUpdate = true;
        trunkNormal.needsUpdate = true;
        const leafAoAlphaMap = createAoAlphaMapFromTextureAlpha(leafMap, { anisotropy: 8 });
        return { leafMap, leafAoAlphaMap, leafNormal, trunkMap, trunkNormal };
    });
}

function makeTreeMaterials({ leafMap, leafAoAlphaMap, leafNormal, trunkMap, trunkNormal }) {
    const leaf = new THREE.MeshStandardMaterial({
        map: leafMap,
        normalMap: leafNormal,
        roughness: 0.9,
        metalness: 0.0,
        transparent: false,
        premultipliedAlpha: false,
        alphaTest: LEAF_ALPHA_CUTOUT_THRESHOLD,
        side: THREE.DoubleSide
    });
    leaf.shadowSide = THREE.DoubleSide;
    leaf.alphaToCoverage = true;
    leaf.userData.isFoliage = true;
    leaf.userData.preserveShadowSide = true;
    if (leafAoAlphaMap) leaf.userData.aoAlphaMap = leafAoAlphaMap;

    const trunk = new THREE.MeshStandardMaterial({
        map: trunkMap,
        normalMap: trunkNormal,
        roughness: 0.95,
        metalness: 0.0
    });

    return { leaf, trunk };
}

function isFoliageName(name) {
    const s = String(name ?? '').toLowerCase();
    return s.includes('leaf') || s.includes('foliage') || s.includes('bush');
}

function getTextureSourceName(tex) {
    const src = tex?.source?.data?.currentSrc
        ?? tex?.source?.data?.src
        ?? tex?.image?.currentSrc
        ?? tex?.image?.src
        ?? tex?.name
        ?? '';
    return String(src ?? '');
}

function isLikelyFoliageMaterial(mat, objectName = '') {
    const m = mat && typeof mat === 'object' ? mat : null;
    if (!m) return false;

    const hasCutoutSignals =
        (Number(m.alphaTest) || 0) > 1e-6
        || m.transparent === true
        || (Number.isFinite(m.opacity) && Number(m.opacity) < 0.999)
        || !!m.alphaMap;
    if (hasCutoutSignals) return true;

    const nameBlob = [
        objectName,
        m.name,
        getTextureSourceName(m.map),
        getTextureSourceName(m.alphaMap)
    ].join(' ');
    return isFoliageName(nameBlob);
}

function isCollisionMeshName(name) {
    const s = String(name ?? '').toUpperCase();
    return s.startsWith('UCX_') || s.startsWith('UBX_') || s.startsWith('UCP_') || s.startsWith('USP_');
}

function removeCollisionMeshes(root) {
    const toRemove = [];
    root.traverse((o) => {
        if (!o?.isMesh) return;
        if (!isCollisionMeshName(o.name)) return;
        toRemove.push(o);
    });
    for (const m of toRemove) {
        if (typeof m.removeFromParent === 'function') m.removeFromParent();
        else if (m.parent) m.parent.remove(m);
    }
    return toRemove.length;
}

function removeNonMeshRenderables(root) {
    const toRemove = [];
    root.traverse((o) => {
        if (!o) return;
        if (o.isMesh) return;
        if (o.isPoints || o.isLine || o.isLineSegments || o.isSprite) toRemove.push(o);
    });
    for (const obj of toRemove) {
        if (typeof obj.removeFromParent === 'function') obj.removeFromParent();
        else if (obj.parent) obj.parent.remove(obj);
    }
    return toRemove.length;
}

function computeMinWorldYForMaterialIndices(mesh, indices) {
    const geom = mesh?.geometry;
    const pos = geom?.attributes?.position;
    if (!geom || !pos) return null;

    const groups = (Array.isArray(geom.groups) && geom.groups.length)
        ? geom.groups
        : [{ start: 0, count: geom.index ? geom.index.count : pos.count, materialIndex: 0 }];

    const posArr = pos.array;
    const idxArr = geom.index?.array ?? null;
    const m = mesh.matrixWorld.elements;
    const m1 = m[1];
    const m5 = m[5];
    const m9 = m[9];
    const m13 = m[13];

    let minY = Infinity;

    const scanVertex = (vi) => {
        const j = vi * 3;
        const x = posArr[j];
        const y = posArr[j + 1];
        const z = posArr[j + 2];
        const wy = m1 * x + m5 * y + m9 * z + m13;
        if (wy < minY) minY = wy;
    };

    for (const g of groups) {
        if (!indices.has(g.materialIndex)) continue;
        const start = Math.max(0, g.start | 0);
        const end = start + Math.max(0, g.count | 0);
        if (idxArr) {
            const max = idxArr.length;
            for (let i = start; i < end && i < max; i++) scanVertex(idxArr[i]);
        } else {
            const max = pos.count;
            for (let i = start; i < end && i < max; i++) scanVertex(i);
        }
    }

    return Number.isFinite(minY) ? minY : null;
}

function applyTreeMaterials(model, mats) {
    model.traverse((o) => {
        if (!o.isMesh) return;
        if (isCollisionMeshName(o.name)) return;
        if (Array.isArray(o.material)) {
            o.material = o.material.map((mat) => {
                return isLikelyFoliageMaterial(mat, o.name) ? mats.leaf : mats.trunk;
            });
        } else {
            o.material = isLikelyFoliageMaterial(o.material, o.name) ? mats.leaf : mats.trunk;
        }
        const matsList = Array.isArray(o.material) ? o.material : [o.material];
        o.userData.isFoliage = matsList.some((m) => m === mats.leaf);
        o.castShadow = true;
        o.receiveShadow = true;
    });
}

function ensureMaterials() {
    if (treeMaterials) return Promise.resolve(treeMaterials);
    if (!texturesPromise) {
        texturesPromise = loadTextures().then((textures) => {
            treeMaterials = makeTreeMaterials(textures);
            return treeMaterials;
        });
    }
    return texturesPromise;
}

function loadTreeAssets(quality, entries) {
    const key = getQuality(quality);
    if (templateCache[key] && treeMaterials) {
        return Promise.resolve({ templates: templateCache[key], materials: treeMaterials });
    }
    if (!promiseCache[key]) {
        promiseCache[key] = ensureMaterials().then((mats) => {
            const loader = new FBXLoader(makeTreeLoadingManager());
            const baseUrl = getModelBaseUrl(key);
            const loadModel = (entry) => loader.loadAsync(new URL(entry.name, baseUrl).toString()).then((model) => {
                removeCollisionMeshes(model);
                removeNonMeshRenderables(model);
                applyTreeMaterials(model, mats);
                const rot = Array.isArray(entry.rot) ? entry.rot : [0, 0, 0];
                model.rotation.set(rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0);
                model.updateMatrixWorld(true);
                const bounds = new THREE.Box3().setFromObject(model);
                const computedBaseY = bounds?.min?.y;

                let trunkMinY = Infinity;
                model.traverse((o) => {
                    if (!o?.isMesh) return;
                    if (isCollisionMeshName(o.name)) return;
                    const matsList = Array.isArray(o.material) ? o.material : [o.material];
                    const indices = new Set();
                    for (let i = 0; i < matsList.length; i++) {
                        if (matsList[i] === mats.trunk) indices.add(i);
                    }
                    if (!indices.size) return;
                    const y = computeMinWorldYForMaterialIndices(o, indices);
                    if (Number.isFinite(y) && y < trunkMinY) trunkMinY = y;
                });

                const baseY = Number.isFinite(trunkMinY) ? trunkMinY : computedBaseY;
                const computedHeight = Number.isFinite(bounds?.max?.y) && Number.isFinite(baseY)
                    ? (bounds.max.y - baseY)
                    : null;

                const fallbackBaseY = entry.baseY ?? 0;
                const fallbackHeight = entry.height ?? 1;
                model.userData.treeBaseY = Number.isFinite(baseY) ? baseY : fallbackBaseY;
                model.userData.treeHeight = (Number.isFinite(computedHeight) && computedHeight > 0) ? computedHeight : fallbackHeight;
                return model;
            });
            return Promise.all(entries.map(loadModel));
        }).then((models) => {
            templateCache[key] = models;
            return { templates: templateCache[key], materials: treeMaterials };
        }).catch((err) => {
            console.warn('[TreeGenerator] Failed to load tree assets:', err);
            promiseCache[key] = null;
            templateCache[key] = null;
            return null;
        });
    }
    return promiseCache[key];
}

function isClearOfRoad(map, px, pz, tx, ty, tileHalf, radiusTiles, clearanceSq) {
    const minX = Math.max(0, tx - radiusTiles);
    const maxX = Math.min(map.width - 1, tx + radiusTiles);
    const minY = Math.max(0, ty - radiusTiles);
    const maxY = Math.min(map.height - 1, ty + radiusTiles);

    for (let y = minY; y <= maxY; y++) {
        const row = y * map.width;
        for (let x = minX; x <= maxX; x++) {
            const idx = row + x;
            if (map.kind[idx] !== TILE.ROAD) continue;
            const center = map.tileToWorldCenter(x, y);
            const dx = Math.max(0, Math.abs(px - center.x) - tileHalf);
            const dz = Math.max(0, Math.abs(pz - center.z) - tileHalf);
            if ((dx * dx + dz * dz) < clearanceSq) return false;
        }
    }
    return true;
}

function isNearRoad(map, tx, ty, radiusTiles) {
    if (radiusTiles <= 0) return false;
    const minX = Math.max(0, tx - radiusTiles);
    const maxX = Math.min(map.width - 1, tx + radiusTiles);
    const minY = Math.max(0, ty - radiusTiles);
    const maxY = Math.min(map.height - 1, ty + radiusTiles);
    for (let y = minY; y <= maxY; y++) {
        const row = y * map.width;
        for (let x = minX; x <= maxX; x++) {
            const idx = row + x;
            if (map.kind[idx] === TILE.ROAD) return true;
        }
    }
    return false;
}

function buildPlacements({ map, rng, groundY, params, modelCount }) {
    const placements = [];
    const tileSize = map.tileSize;
    const tileHalf = tileSize * 0.5;
    const jitter = THREE.MathUtils.clamp(params.jitter, 0, 0.95);
    const offsetRange = tileHalf * jitter;

    const buildingTileKeys = new Set();
    const buildings = Array.isArray(map.buildings) ? map.buildings : [];
    for (const b of buildings) {
        const tiles = Array.isArray(b?.tiles) ? b.tiles : [];
        for (const t of tiles) {
            if (!Array.isArray(t) || t.length < 2) continue;
            buildingTileKeys.add(`${t[0] | 0},${t[1] | 0}`);
        }
    }

    let emptyTiles = 0;
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const idx = map.index(x, y);
            if (map.kind[idx] === TILE.EMPTY) emptyTiles += 1;
        }
    }

    const totalTiles = map.width * map.height;
    const density = Math.min(params.density, totalTiles / Math.max(1, emptyTiles));
    const clearance = Math.max(0, params.clearance);
    const clearanceSq = clearance * clearance;
    const radiusTiles = Math.ceil((clearance + tileHalf) / tileSize);
    const maxAttempts = Math.max(1, params.maxAttempts | 0);
    const scaleMin = Math.min(params.scaleMin, params.scaleMax);
    const scaleMax = Math.max(params.scaleMin, params.scaleMax);
    const cornerBoost = Math.max(0, params.cornerBoost ?? 0);
    const cornerPower = Math.max(0.1, params.cornerPower ?? 1);
    const cornerRadius = THREE.MathUtils.clamp(params.cornerRadius ?? 0.5, 0.2, 1);
    const cornerRadiusTiles = Math.max(1, Math.round(Math.min(map.width, map.height) * cornerRadius));
    const cornerRadiusSq = cornerRadiusTiles * cornerRadiusTiles;
    const roadRadius = Math.max(0, params.roadRadius | 0);
    const roadBoost = Math.max(0, params.roadBoost ?? 0);
    const baseChance = density * (1 - cornerBoost * 0.5);
    const w1 = map.width - 1;
    const h1 = map.height - 1;

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const idx = map.index(x, y);
            if (map.kind[idx] !== TILE.EMPTY) continue;
            if (buildingTileKeys.has(`${x},${y}`)) continue;
            const dx0 = x;
            const dy0 = y;
            const dx1 = x;
            const dy1 = h1 - y;
            const dx2 = w1 - x;
            const dy2 = y;
            const dx3 = w1 - x;
            const dy3 = h1 - y;
            const minCornerDistSq = Math.min(
                dx0 * dx0 + dy0 * dy0,
                dx1 * dx1 + dy1 * dy1,
                dx2 * dx2 + dy2 * dy2,
                dx3 * dx3 + dy3 * dy3
            );
            const cornerT = Math.max(0, 1 - (minCornerDistSq / cornerRadiusSq));
            const cornerBias = Math.pow(cornerT, cornerPower);
            let chance = baseChance + density * cornerBoost * cornerBias;
            if (roadBoost > 0 && isNearRoad(map, x, y, roadRadius)) {
                chance = Math.max(chance, density * roadBoost);
            }
            if (!rng.chance(Math.min(1, chance))) continue;

            const center = map.tileToWorldCenter(x, y);
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const px = center.x + rng.range(-offsetRange, offsetRange);
                const pz = center.z + rng.range(-offsetRange, offsetRange);
                if (clearanceSq > 0 && !isClearOfRoad(map, px, pz, x, y, tileHalf, radiusTiles, clearanceSq)) {
                    continue;
                }
                placements.push({
                    x: px,
                    y: groundY,
                    z: pz,
                    rotation: rng.range(0, TAU),
                    scaleVar: rng.range(scaleMin, scaleMax),
                    variant: rng.int(modelCount)
                });
                break;
            }
        }
    }

    return placements;
}

export function loadTreeMaterials() {
    return ensureMaterials();
}

export function loadTreeTemplates(quality = 'auto') {
    const q = getResolvedTreeQuality({ quality });
    const entries = getTreeEntries(q);
    return loadTreeAssets(q, entries);
}

export function createTreeField({ map = null, rng = null, groundY = 0, config = null } = {}) {
    const group = new THREE.Group();
    group.name = 'Trees';

    if (!map || !rng) return { group };

    const params = {
        ...TREE_DEFAULTS,
        ...(config?.trees ?? {})
    };

    const sink = Math.max(0, params.sink ?? 0);
    const quality = getResolvedTreeQuality({ quality: params.quality });
    const entries = getTreeEntries(quality);
    if (!entries.length) return { group, placements: [] };
    const placements = buildPlacements({
        map,
        rng,
        groundY: groundY - sink,
        params,
        modelCount: entries.length
    });

    const targetHeight = (Number.isFinite(params.height) && params.height > 0)
        ? params.height
        : Math.max(4, map.tileSize * 0.4);

    loadTreeAssets(quality, entries).then((assets) => {
        if (!assets) return;
        for (const placement of placements) {
            const template = assets.templates[placement.variant];
            if (!template) continue;
            const tree = template.clone(true);
            const baseY = template.userData.treeBaseY ?? 0;
            const baseHeight = template.userData.treeHeight ?? 1;
            const baseScale = targetHeight / Math.max(0.001, baseHeight);
            const scale = baseScale * placement.scaleVar;
            tree.scale.setScalar(scale);
            tree.position.set(0, -baseY * scale, 0);
            const wrapper = new THREE.Group();
            wrapper.position.set(placement.x, placement.y, placement.z);
            wrapper.rotation.y = placement.rotation;
            wrapper.add(tree);
            group.add(wrapper);
        }
    });

    return { group, placements };
}
