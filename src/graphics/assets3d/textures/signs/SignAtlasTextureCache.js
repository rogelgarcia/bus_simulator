// src/graphics/assets3d/textures/signs/SignAtlasTextureCache.js
// Caches loaded sign atlas textures by atlas id.
import * as THREE from 'three';
import { resolveSignAtlasUrl } from './SignAtlases.js';

const _loader = new THREE.TextureLoader();
const _cache = new Map();

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function configureAtlasTexture(tex) {
    if (!tex) return;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 16;
    applyTextureColorSpace(tex, { srgb: true });
    if (tex.image) tex.needsUpdate = true;
}

function getOrCreateEntry(atlasId) {
    const id = typeof atlasId === 'string' ? atlasId : '';
    if (!id) throw new Error('[SignAtlasTextureCache] atlasId must be a non-empty string');

    const existing = _cache.get(id) ?? null;
    if (existing) return existing;

    const url = resolveSignAtlasUrl(id);

    const entry = {
        texture: null,
        image: null,
        imagePromise: null
    };

    const imagePromise = new Promise((resolve, reject) => {
        const tex = _loader.load(
            url,
            (loaded) => {
                configureAtlasTexture(loaded);
                entry.texture = loaded;
                entry.image = loaded?.image ?? null;
                resolve(entry.image);
            },
            undefined,
            (err) => {
                console.warn('[SignAtlasTextureCache] Failed to load atlas texture:', url);
                reject(err);
            }
        );

        tex.userData = tex.userData ?? {};
        tex.userData.signAtlasId = id;
        configureAtlasTexture(tex);
        entry.texture = tex;
    });

    entry.imagePromise = imagePromise;
    _cache.set(id, entry);
    return entry;
}

export function getSignAtlasTexture(atlasId) {
    return getOrCreateEntry(atlasId).texture;
}

export function getSignAtlasImage(atlasId) {
    return getOrCreateEntry(atlasId).imagePromise;
}
