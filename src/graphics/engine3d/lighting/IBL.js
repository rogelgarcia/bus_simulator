// src/graphics/engine3d/lighting/IBL.js
// Shared HDR IBL loader and scene applier.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const DEFAULT_ENV_MAP_INTENSITY = 0.25;
const _cacheByRenderer = new WeakMap();
const GIT_LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';

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
        entry = { envMap: null, promise: null, warned: false };
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

function decodeAsciiPrefix(buffer, maxBytes = 96) {
    if (!buffer) return '';
    const len = Math.min(Math.max(0, Number(maxBytes) || 0), buffer.byteLength || 0);
    if (len <= 0) return '';
    const view = new Uint8Array(buffer, 0, len);
    if (typeof TextDecoder !== 'undefined') {
        try {
            return new TextDecoder('utf-8', { fatal: false }).decode(view);
        } catch {}
    }
    let out = '';
    for (let i = 0; i < view.length; i++) out += String.fromCharCode(view[i]);
    return out;
}

function isGitLfsPointerBuffer(buffer) {
    const prefix = decodeAsciiPrefix(buffer, 96);
    if (!prefix) return false;
    if (prefix.startsWith(GIT_LFS_POINTER_PREFIX)) return true;
    return prefix.includes('oid sha256:') && prefix.includes('git-lfs.github.com/spec/v1');
}

async function fetchArrayBuffer(url) {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} loading ${url}`);
    }
    return res.arrayBuffer();
}

function createFallbackEnvMap(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envMap = pmrem.fromScene(new RoomEnvironment()).texture;
    pmrem.dispose();
    applyHdrColorSpace(envMap);
    envMap.userData = envMap.userData ?? {};
    envMap.userData.iblFallback = true;
    return envMap;
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
        try {
            const pmrem = new THREE.PMREMGenerator(renderer);
            pmrem.compileEquirectangularShader?.();

            const buffer = await fetchArrayBuffer(hdrUrl);
            if (isGitLfsPointerBuffer(buffer)) {
                throw new Error(`HDRI at ${hdrUrl} is a Git LFS pointer. Run git lfs pull to download assets.`);
            }

            const loader = new RGBELoader();
            if (THREE.HalfFloatType) loader.setDataType(THREE.HalfFloatType);
            const hdr = loader.parse(buffer);
            hdr.mapping = THREE.EquirectangularReflectionMapping;
            applyHdrColorSpace(hdr);

            const envMap = pmrem.fromEquirectangular(hdr).texture;
            hdr.dispose();
            pmrem.dispose();
            applyHdrColorSpace(envMap);

            entry.envMap = envMap;
            entry.promise = null;
            return envMap;
        } catch (err) {
            if (!entry.warned) {
                entry.warned = true;
                const detail = err?.message ?? String(err);
                const message = `[IBL] HDR environment map failed to load (${hdrUrl}). Using fallback environment. ${detail} (Fix: git lfs pull, or disable IBL with ?ibl=0)`;
                console.error(message);
                if (typeof window !== 'undefined') {
                    if (!Array.isArray(window.__testFatals)) window.__testFatals = [];
                    window.__testFatals.push({ name: 'IBL', message });
                }
            }

            const envMap = createFallbackEnvMap(renderer);
            entry.envMap = envMap;
            entry.promise = null;
            return envMap;
        }
    });

    return entry.promise;
}

function applyEnvMapIntensityToMaterial(mat, intensity, { force = false, envMap = undefined } = {}) {
    if (!mat || !('envMapIntensity' in mat)) return;
    const userData = mat.userData ?? (mat.userData = {});

    if (userData.iblNoAutoEnvMapIntensity) return;

    if (envMap !== undefined && ('envMap' in mat)) {
        const managed = !!userData._iblManagedEnvMap;
        const nextEnv = envMap ?? null;

        if (nextEnv) {
            if (mat.envMap !== nextEnv && (!mat.envMap || managed)) {
                mat.envMap = nextEnv;
                userData._iblManagedEnvMap = true;
                mat.needsUpdate = true;
            }
        } else if (managed) {
            if (mat.envMap) {
                mat.envMap = null;
                mat.needsUpdate = true;
            }
            delete userData._iblManagedEnvMap;
        }
    }

    if (Number.isFinite(userData.iblEnvMapIntensity)) {
        if (mat.envMapIntensity !== userData.iblEnvMapIntensity) {
            mat.envMapIntensity = userData.iblEnvMapIntensity;
            mat.needsUpdate = true;
        }
        return;
    }

    if (Number.isFinite(userData.iblEnvMapIntensityScale)) {
        const scale = Math.max(0, Number(userData.iblEnvMapIntensityScale));
        const scaled = intensity * scale;
        const prevAuto = userData._iblAutoEnvMapIntensity;
        if (!force && prevAuto === scaled) return;
        mat.envMapIntensity = scaled;
        userData._iblAutoEnvMapIntensity = scaled;
        mat.needsUpdate = true;
        return;
    }

    const prevAuto = userData._iblAutoEnvMapIntensity;
    if (!force && prevAuto === intensity) return;

    mat.envMapIntensity = intensity;
    userData._iblAutoEnvMapIntensity = intensity;
    mat.needsUpdate = true;
}

function markMaterialsForEnvMapUpdate(root) {
    root?.traverse?.((obj) => {
        if (!obj?.isMesh) return;
        const mat = obj.material ?? null;
        if (Array.isArray(mat)) {
            for (const entry of mat) {
                if (entry && ('envMapIntensity' in entry)) entry.needsUpdate = true;
            }
            return;
        }
        if (mat && ('envMapIntensity' in mat)) mat.needsUpdate = true;
    });
}

function syncMaterialEnvMapFromScene(root, envMap) {
    const nextEnv = envMap ?? null;
    root?.traverse?.((obj) => {
        if (!obj?.isMesh) return;
        const mat = obj.material ?? null;
        const mats = Array.isArray(mat) ? mat : [mat];
        for (const entry of mats) {
            if (!entry) continue;
            if (!('envMapIntensity' in entry) || !('envMap' in entry)) continue;
            const userData = entry.userData ?? (entry.userData = {});
            const managed = !!userData._iblManagedEnvMap;

            if (nextEnv) {
                if (entry.envMap === nextEnv) continue;
                if (entry.envMap && !managed) continue;
                entry.envMap = nextEnv;
                userData._iblManagedEnvMap = true;
                entry.needsUpdate = true;
                continue;
            }

            if (!managed) continue;
            if (!entry.envMap) {
                delete userData._iblManagedEnvMap;
                continue;
            }
            entry.envMap = null;
            delete userData._iblManagedEnvMap;
            entry.needsUpdate = true;
        }
    });
}

export function applyIBLToScene(scene, envMap, overrides = {}) {
    if (!scene) return;
    const enabled = overrides?.enabled ?? true;
    const setBackground = overrides?.setBackground ?? false;

    if (!enabled || !envMap) {
        const changed = !!scene.environment;
        if (scene.environment) scene.environment = null;
        if (scene.background) scene.background = null;
        syncMaterialEnvMapFromScene(scene, null);
        if (changed) markMaterialsForEnvMapUpdate(scene);
        return;
    }

    const changed = scene.environment !== envMap;
    scene.environment = envMap;
    scene.background = setBackground ? envMap : null;
    syncMaterialEnvMapFromScene(scene, envMap);
    if (changed) markMaterialsForEnvMapUpdate(scene);
}

export function applyIBLIntensity(root, overrides = {}, { force = false } = {}) {
    const enabled = overrides?.enabled ?? true;
    if (!enabled) return;
    const intensity = Number.isFinite(overrides?.envMapIntensity) ? overrides.envMapIntensity : DEFAULT_ENV_MAP_INTENSITY;
    const envMap = root?.isScene ? (root.environment ?? null) : undefined;

    root?.traverse?.((obj) => {
        if (!obj?.isMesh) return;
        const mat = obj.material ?? null;
        if (Array.isArray(mat)) {
            for (const entry of mat) applyEnvMapIntensityToMaterial(entry, intensity, { force, envMap });
        } else {
            applyEnvMapIntensityToMaterial(mat, intensity, { force, envMap });
        }
    });
}
