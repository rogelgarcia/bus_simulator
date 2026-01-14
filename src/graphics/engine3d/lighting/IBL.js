// src/graphics/engine3d/lighting/IBL.js
// Shared HDR IBL loader and scene applier.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
const DEFAULT_ENV_MAP_INTENSITY = 0.25;
const _cacheByRenderer = new WeakMap();

function getRendererCache(renderer) {
    let cache = _cacheByRenderer.get(renderer);
    if (!cache) {
        cache = new Map();
        _cacheByRenderer.set(renderer, cache);
    }
    return cache;
}

function getCacheEntry(renderer, cacheKey) {
    const cache = getRendererCache(renderer);
    const key = typeof cacheKey === 'string' ? cacheKey : '';
    let entry = cache.get(key);
    if (!entry) {
        entry = { envMap: null, promise: null };
        cache.set(key, entry);
    }
    return entry;
}

function applyHdrColorSpace(tex) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = THREE.LinearSRGBColorSpace ?? THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = THREE.LinearEncoding;
}

export async function loadIBLTexture(renderer, overrides = {}) {
    const enabled = overrides?.enabled ?? true;
    const hdrUrl = typeof overrides?.hdrUrl === 'string' ? overrides.hdrUrl : '';
    if (!enabled) return null;
    if (!renderer) return null;
    if (!hdrUrl) return null;

    const entry = getCacheEntry(renderer, hdrUrl);
    if (entry.envMap) return entry.envMap;
    if (entry.promise) return entry.promise;

    entry.promise = (async () => {
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader?.();

        const loader = new RGBELoader();
        if (THREE.HalfFloatType) loader.setDataType(THREE.HalfFloatType);
        const hdr = await loader.loadAsync(hdrUrl);
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        applyHdrColorSpace(hdr);

        const envMap = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
        pmrem.dispose();
        applyHdrColorSpace(envMap);

        entry.envMap = envMap;
        entry.promise = null;
        return envMap;
    })().catch((err) => {
        entry.promise = null;
        throw err;
    });

    return entry.promise;
}

function applyEnvMapIntensityToMaterial(mat, intensity, { force = false } = {}) {
    if (!mat || !('envMapIntensity' in mat)) return;
    const userData = mat.userData ?? (mat.userData = {});

    if (userData.iblNoAutoEnvMapIntensity) return;

    if (Number.isFinite(userData.iblEnvMapIntensity)) {
        if (mat.envMapIntensity !== userData.iblEnvMapIntensity) {
            mat.envMapIntensity = userData.iblEnvMapIntensity;
            mat.needsUpdate = true;
        }
        return;
    }

    const prevAuto = userData._iblAutoEnvMapIntensity;
    if (!force && prevAuto === intensity) return;

    mat.envMapIntensity = intensity;
    userData._iblAutoEnvMapIntensity = intensity;
    mat.needsUpdate = true;
}

export function applyIBLToScene(scene, envMap, overrides = {}) {
    if (!scene) return;
    const enabled = overrides?.enabled ?? true;
    const setBackground = overrides?.setBackground ?? false;

    if (!enabled || !envMap) {
        if (scene.environment) scene.environment = null;
        if (scene.background) scene.background = null;
        return;
    }

    scene.environment = envMap;
    scene.background = setBackground ? envMap : null;
}

export function applyIBLIntensity(root, overrides = {}, { force = false } = {}) {
    const enabled = overrides?.enabled ?? true;
    if (!enabled) return;
    const intensity = Number.isFinite(overrides?.envMapIntensity) ? overrides.envMapIntensity : DEFAULT_ENV_MAP_INTENSITY;

    root?.traverse?.((obj) => {
        if (!obj?.isMesh) return;
        const mat = obj.material ?? null;
        if (Array.isArray(mat)) {
            for (const entry of mat) applyEnvMapIntensityToMaterial(entry, intensity, { force });
        } else {
            applyEnvMapIntensityToMaterial(mat, intensity, { force });
        }
    });
}
