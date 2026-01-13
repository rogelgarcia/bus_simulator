// src/graphics/lighting/IBL.js
// Shared HDR IBL loader and scene applier.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const HDR_URL = new URL('../../../assets/public/german_town_street_2k.hdr', import.meta.url).toString();

export const IBL_DEFAULTS = Object.freeze({
    enabled: true,
    envMapIntensity: 0.25,
    hdrUrl: HDR_URL,
    setBackground: false
});

const _cacheByRenderer = new WeakMap();

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function parseBool(value, fallback) {
    if (value === null || value === undefined) return fallback;
    const v = String(value).trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
    return fallback;
}

function parseNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return clamp(num, min, max);
}

export function getIBLConfig(overrides = {}) {
    const config = { ...IBL_DEFAULTS, ...(overrides ?? {}) };

    if (typeof window === 'undefined') return config;

    const params = new URLSearchParams(window.location.search);
    if (params.has('ibl')) config.enabled = parseBool(params.get('ibl'), config.enabled);
    if (params.has('iblIntensity')) {
        config.envMapIntensity = parseNumber(params.get('iblIntensity'), config.envMapIntensity, { min: 0, max: 5 });
    }
    if (params.has('iblBackground')) config.setBackground = parseBool(params.get('iblBackground'), config.setBackground);

    return config;
}

function getCacheEntry(renderer) {
    let entry = _cacheByRenderer.get(renderer);
    if (!entry) {
        entry = { envMap: null, promise: null };
        _cacheByRenderer.set(renderer, entry);
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
    const config = getIBLConfig(overrides);
    if (!config.enabled) return null;
    if (!renderer) return null;

    const entry = getCacheEntry(renderer);
    if (entry.envMap) return entry.envMap;
    if (entry.promise) return entry.promise;

    entry.promise = (async () => {
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader?.();

        const loader = new RGBELoader();
        if (THREE.HalfFloatType) loader.setDataType(THREE.HalfFloatType);
        const hdr = await loader.loadAsync(config.hdrUrl);
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
    const config = getIBLConfig(overrides);

    if (!config.enabled || !envMap) {
        if (scene.environment) scene.environment = null;
        return;
    }

    scene.environment = envMap;
    if (config.setBackground) scene.background = envMap;
}

export function applyIBLIntensity(root, overrides = {}, { force = false } = {}) {
    const config = getIBLConfig(overrides);
    if (!config.enabled) return;
    const intensity = Number.isFinite(config.envMapIntensity) ? config.envMapIntensity : IBL_DEFAULTS.envMapIntensity;

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
