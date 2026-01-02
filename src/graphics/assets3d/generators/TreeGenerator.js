// src/graphics/assets3d/generators/TreeGenerator.js
// Creates tree instances for the city world
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { TILE } from '../../../app/city/CityMap.js';
import { TREE_CONFIG } from './TreeConfig.js';

const TAU = Math.PI * 2;

const TREE_DEFAULTS = {
    quality: 'mobile',
    density: 0.5,
    clearance: 4,
    jitter: 0.7,
    scaleMin: 0.9,
    scaleMax: 1.1,
    maxAttempts: 4,
    height: 0,
    cornerBoost: 0.8,
    cornerPower: 1.4,
    cornerRadius: 0.45,
    roadRadius: 1,
    roadBoost: 0.25
};

const TEXTURE_BASE_URL = new URL('../../../../assets/trees/Textures/', import.meta.url);

let texturesPromise = null;
const templateCache = { desktop: null, mobile: null };
const promiseCache = { desktop: null, mobile: null };
let treeMaterials = null;

function getQuality(value) {
    const v = String(value ?? '').toLowerCase();
    return v === 'desktop' ? 'desktop' : 'mobile';
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
    if ('colorSpace' in tex) tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
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
        leafMap.anisotropy = 8;
        trunkMap.anisotropy = 8;
        return { leafMap, leafNormal, trunkMap, trunkNormal };
    });
}

function makeTreeMaterials({ leafMap, leafNormal, trunkMap, trunkNormal }) {
    const leaf = new THREE.MeshStandardMaterial({
        map: leafMap,
        normalMap: leafNormal,
        roughness: 0.9,
        metalness: 0.0,
        alphaTest: 0.5,
        side: THREE.DoubleSide
    });

    const trunk = new THREE.MeshStandardMaterial({
        map: trunkMap,
        normalMap: trunkNormal,
        roughness: 0.95,
        metalness: 0.0
    });

    return { leaf, trunk };
}

function applyTreeMaterials(model, mats) {
    model.traverse((o) => {
        if (!o.isMesh) return;
        if (Array.isArray(o.material)) {
            o.material = o.material.map((mat) => {
                const name = `${o.name} ${mat?.name ?? ''}`.toLowerCase();
                return name.includes('leaf') ? mats.leaf : mats.trunk;
            });
        } else {
            const name = `${o.name} ${o.material?.name ?? ''}`.toLowerCase();
            o.material = name.includes('leaf') ? mats.leaf : mats.trunk;
        }
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
            const loader = new FBXLoader();
            const baseUrl = getModelBaseUrl(key);
            const loadModel = (entry) => loader.loadAsync(new URL(entry.name, baseUrl).toString()).then((model) => {
                applyTreeMaterials(model, mats);
                const rot = Array.isArray(entry.rot) ? entry.rot : [0, 0, 0];
                model.rotation.set(rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0);
                model.userData.treeBaseY = entry.baseY ?? 0;
                model.userData.treeHeight = entry.height ?? 1;
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

export function createTreeField({ map = null, rng = null, groundY = 0, config = null } = {}) {
    const group = new THREE.Group();
    group.name = 'Trees';

    if (!map || !rng) return { group };

    const params = {
        ...TREE_DEFAULTS,
        ...(config?.trees ?? {})
    };

    const quality = getQuality(params.quality);
    const entries = getTreeEntries(quality);
    if (!entries.length) return { group, placements: [] };
    const placements = buildPlacements({
        map,
        rng,
        groundY,
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
