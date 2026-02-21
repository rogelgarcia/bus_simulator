// src/graphics/content3d/materials/PbrTexturePipeline.js
// Global PBR texture resolution + loading pipeline (catalog -> calibration -> local overrides).

import * as THREE from 'three';
import { getPbrMaterialMeta, resolvePbrMaterialUrls } from '../catalogs/PbrMaterialCatalog.js';
import {
    getPbrCalibrationDefaultOverrides,
    getPbrTextureCalibrationResolver,
    sanitizePbrCalibrationOverrides
} from './PbrTextureCalibrationResolver.js';

const EPS = 1e-6;
const PBR_TEXTURE_CHANNELS = Object.freeze([
    Object.freeze({ key: 'baseColor', urlKey: 'baseColorUrl', srgb: true }),
    Object.freeze({ key: 'normal', urlKey: 'normalUrl', srgb: false }),
    Object.freeze({ key: 'orm', urlKey: 'ormUrl', srgb: false }),
    Object.freeze({ key: 'ao', urlKey: 'aoUrl', srgb: false }),
    Object.freeze({ key: 'roughness', urlKey: 'roughnessUrl', srgb: false }),
    Object.freeze({ key: 'metalness', urlKey: 'metalnessUrl', srgb: false }),
    Object.freeze({ key: 'displacement', urlKey: 'displacementUrl', srgb: false })
]);
const OVERRIDE_KEYS = Object.freeze([
    'tileMeters',
    'normalStrength',
    'roughness',
    'metalness',
    'aoIntensity',
    'albedoBrightness',
    'albedoTintStrength',
    'albedoHueDegrees',
    'albedoSaturation',
    'roughnessRemap'
]);

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function toPlainObject(value) {
    return value && typeof value === 'object' ? value : null;
}

function sanitizeMaterialId(value) {
    const id = typeof value === 'string' ? value.trim() : '';
    return id || null;
}

function sanitizeTextureRepeat(value) {
    const src = toPlainObject(value);
    if (!src) return null;
    const x = Number(src.x);
    const y = Number(src.y);
    if (!(Number.isFinite(x) && Number.isFinite(y))) return null;
    return {
        x: Math.max(EPS, x),
        y: Math.max(EPS, y)
    };
}

function computeRepeatFromTile(tileMeters, { uvSpace = 'meters', surfaceSizeMeters = null } = {}) {
    const tile = Number(tileMeters);
    const safeTile = (Number.isFinite(tile) && tile > EPS) ? tile : 1.0;

    if (uvSpace === 'unit') {
        const size = toPlainObject(surfaceSizeMeters);
        const sx = Number(size?.x);
        const sy = Number(size?.y);
        if (!(Number.isFinite(sx) && sx > 0) || !(Number.isFinite(sy) && sy > 0)) return { x: 1, y: 1 };
        return { x: sx / safeTile, y: sy / safeTile };
    }

    const rep = 1 / safeTile;
    return { x: rep, y: rep };
}

function mergeOverrides(defaults, calibration, local) {
    const base = sanitizePbrCalibrationOverrides(defaults);
    const calib = sanitizePbrCalibrationOverrides(calibration);
    const localOverrides = sanitizePbrCalibrationOverrides(local);
    const effective = { ...base };
    const sources = {};

    for (const key of OVERRIDE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(base, key)) sources[key] = 'catalog';
    }

    for (const key of OVERRIDE_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(calib, key)) continue;
        effective[key] = calib[key];
        sources[key] = 'calibration';
    }

    for (const key of OVERRIDE_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(localOverrides, key)) continue;
        effective[key] = localOverrides[key];
        sources[key] = 'local';
    }

    if (!(Number.isFinite(Number(effective.tileMeters)) && Number(effective.tileMeters) > 0)) {
        effective.tileMeters = Number(base.tileMeters) > 0 ? Number(base.tileMeters) : 1.0;
        if (!sources.tileMeters) sources.tileMeters = 'catalog';
    }

    return {
        defaults: Object.freeze({ ...base }),
        calibration: Object.freeze({ ...calib }),
        local: Object.freeze({ ...localOverrides }),
        effective: Object.freeze({ ...effective }),
        sources: Object.freeze({ ...sources })
    };
}

export function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

export function resolvePbrMaterialPipeline(materialId, {
    calibrationOverrides = null,
    localOverrides = null,
    calibrationResolver = null
} = {}) {
    const id = sanitizeMaterialId(materialId);
    const urls = resolvePbrMaterialUrls(id);
    const meta = getPbrMaterialMeta(id);
    const defaults = getPbrCalibrationDefaultOverrides(id);

    const resolver = calibrationResolver ?? getPbrTextureCalibrationResolver();
    const cachedCalibration = calibrationOverrides === undefined
        ? resolver?.getCachedOverrides?.(id)
        : calibrationOverrides;

    const merged = mergeOverrides(defaults, cachedCalibration, localOverrides);

    return Object.freeze({
        materialId: id,
        meta,
        urls,
        overrides: merged,
        diagnostics: Object.freeze({
            resolvedBy: 'global_pbr_pipeline',
            sourceByField: merged.sources,
            hasCalibration: !!(cachedCalibration && Object.keys(cachedCalibration).length),
            calibrationLoaded: resolver?.hasCached?.(id) === true
        })
    });
}

function textureHasImageData(tex) {
    if (!tex?.isTexture) return false;
    const image = tex.image ?? tex.source?.data ?? null;
    return !!image;
}

function setTextureTransform(tex, { repeat = null, offset = null, rotation = null, center = null } = {}) {
    if (!tex?.isTexture) return;
    const rep = sanitizeTextureRepeat(repeat);
    if (rep) tex.repeat.set(rep.x, rep.y);
    const off = toPlainObject(offset);
    if (Number.isFinite(Number(off?.x)) && Number.isFinite(Number(off?.y))) tex.offset.set(Number(off.x), Number(off.y));
    const ctr = toPlainObject(center);
    if (Number.isFinite(Number(ctr?.x)) && Number.isFinite(Number(ctr?.y))) tex.center.set(Number(ctr.x), Number(ctr.y));
    if (Number.isFinite(Number(rotation))) tex.rotation = Number(rotation);
    if (textureHasImageData(tex)) tex.needsUpdate = true;
}

export function applyResolvedPbrToStandardMaterial(material, payload, { clearOnMissing = true } = {}) {
    const mat = material?.isMeshStandardMaterial ? material : null;
    if (!mat) return false;

    const tex = payload?.textures ?? {};
    const effective = payload?.overrides?.effective ?? {};

    mat.map = tex.baseColor ?? null;
    mat.normalMap = tex.normal ?? null;

    if (tex.orm) {
        mat.roughnessMap = tex.orm;
        mat.metalnessMap = tex.orm;
        mat.aoMap = tex.orm;
        mat.metalness = 1.0;
    } else {
        mat.aoMap = tex.ao ?? null;
        mat.roughnessMap = tex.roughness ?? null;
        mat.metalnessMap = tex.metalness ?? null;
        mat.metalness = Number.isFinite(Number(effective.metalness))
            ? clamp(effective.metalness, 0, 1)
            : (tex.metalness ? 1.0 : 0.0);
    }

    if (!tex.baseColor && !tex.normal && !tex.orm && !tex.ao && !tex.roughness && !tex.metalness && clearOnMissing) {
        mat.map = null;
        mat.normalMap = null;
        mat.aoMap = null;
        mat.roughnessMap = null;
        mat.metalnessMap = null;
    }

    if (mat.normalScale?.set) {
        const n = Number.isFinite(Number(effective.normalStrength)) ? clamp(effective.normalStrength, 0, 8) : 1.0;
        mat.normalScale.set(n, n);
    }
    mat.roughness = Number.isFinite(Number(effective.roughness)) ? clamp(effective.roughness, 0, 1) : 1.0;
    if ('aoMapIntensity' in mat) {
        mat.aoMapIntensity = Number.isFinite(Number(effective.aoIntensity)) ? clamp(effective.aoIntensity, 0, 2) : 1.0;
    }
    mat.needsUpdate = true;
    return true;
}

export class PbrTextureLoaderService {
    constructor({
        renderer = null,
        textureLoader = null,
        calibrationResolver = null,
        logger = console,
        diagnosticsEnabled = false
    } = {}) {
        this._renderer = renderer ?? null;
        this._loader = textureLoader ?? new THREE.TextureLoader();
        this._calibrationResolver = calibrationResolver ?? getPbrTextureCalibrationResolver();
        this._logger = logger ?? console;
        this._diagnosticsEnabled = diagnosticsEnabled === true;
        this._warnedUrls = new Set();
        this._cache = new Map();
        this._calibrationLoadInFlight = new Map();
        this._calibrationForceReloadAttempted = new Set();
    }

    dispose() {
        for (const entry of this._cache.values()) entry?.texture?.dispose?.();
        this._cache.clear();
        this._warnedUrls.clear();
        this._calibrationLoadInFlight.clear();
        this._calibrationForceReloadAttempted.clear();
    }

    setDiagnosticsEnabled(enabled) {
        this._diagnosticsEnabled = enabled === true;
    }

    hasCachedCalibration(materialId) {
        return this._calibrationResolver?.hasCached?.(materialId) === true;
    }

    getCachedCalibrationOverrides(materialId) {
        return this._calibrationResolver?.getCachedOverrides?.(materialId) ?? null;
    }

    async preloadCalibrationForMaterialIds(materialIds, { forceReload = false } = {}) {
        if (!this._calibrationResolver?.preloadOverrides) return [];
        return this._calibrationResolver.preloadOverrides(materialIds, { forceReload });
    }

    resolveMaterial(materialId, {
        calibrationOverrides = undefined,
        localOverrides = null,
        cloneTextures = false,
        repeat = null,
        uvSpace = 'meters',
        surfaceSizeMeters = null,
        repeatScale = 1.0,
        diagnosticsTag = ''
    } = {}) {
        const resolved = resolvePbrMaterialPipeline(materialId, {
            calibrationOverrides,
            localOverrides,
            calibrationResolver: this._calibrationResolver
        });

        const tileMeters = Number(resolved?.overrides?.effective?.tileMeters);
        const repeatFromTile = computeRepeatFromTile(tileMeters, { uvSpace, surfaceSizeMeters });
        const scale = Number(repeatScale);
        const scaledRepeat = {
            x: repeatFromTile.x * (Number.isFinite(scale) ? scale : 1.0),
            y: repeatFromTile.y * (Number.isFinite(scale) ? scale : 1.0)
        };
        const explicitRepeat = sanitizeTextureRepeat(repeat);
        const finalRepeat = explicitRepeat ?? scaledRepeat;

        const textures = {};
        for (const channel of PBR_TEXTURE_CHANNELS) {
            const url = resolved?.urls?.[channel.urlKey] ?? null;
            textures[channel.key] = this._loadTexture(url, {
                srgb: channel.srgb,
                cloneTexture: cloneTextures,
                repeat: finalRepeat
            });
        }

        const payload = Object.freeze({
            ...resolved,
            repeat: Object.freeze({ ...finalRepeat }),
            textures: Object.freeze({ ...textures })
        });

        if (calibrationOverrides === undefined && !resolved?.diagnostics?.calibrationLoaded) {
            this._queueCalibrationLoad(resolved?.materialId);
        } else if (
            calibrationOverrides === undefined
            && resolved?.diagnostics?.calibrationLoaded
            && !resolved?.diagnostics?.hasCalibration
        ) {
            const id = sanitizeMaterialId(resolved?.materialId);
            if (id && !this._calibrationForceReloadAttempted.has(id)) {
                // Retry once with forceReload to recover from stale null-cache entries.
                this._calibrationForceReloadAttempted.add(id);
                this._queueCalibrationLoad(id, { forceReload: true });
            }
        }

        if (this._diagnosticsEnabled) {
            this._logger?.info?.(
                `[PbrTexturePipeline] ${diagnosticsTag || 'resolve'} ${String(materialId || '')}`,
                payload.diagnostics
            );
        }
        return payload;
    }

    _queueCalibrationLoad(materialId, { forceReload = false } = {}) {
        const id = sanitizeMaterialId(materialId);
        if (!id) return;
        if (!this._calibrationResolver?.resolveOverrides) return;
        if (!forceReload && this._calibrationResolver?.hasCached?.(id) === true) return;
        if (this._calibrationLoadInFlight.has(id)) return;

        const request = Promise.resolve()
            .then(() => this._calibrationResolver.resolveOverrides(id, { forceReload }))
            .catch((err) => {
                this._logger?.warn?.(`[PbrTexturePipeline] Failed to preload calibration for ${id}:`, err);
            })
            .finally(() => {
                this._calibrationLoadInFlight.delete(id);
            });
        this._calibrationLoadInFlight.set(id, request);
    }

    _loadTexture(url, {
        srgb = true,
        cloneTexture = false,
        repeat = null
    } = {}) {
        const safeUrl = typeof url === 'string' && url ? url : null;
        if (!safeUrl) return null;
        const key = `${safeUrl}|cs:${srgb ? 'srgb' : 'data'}`;

        let entry = this._cache.get(key);
        if (!entry) {
            const tex = this._loader.load(
                safeUrl,
                undefined,
                undefined,
                (err) => this._warnTextureLoadError(safeUrl, err)
            );
            this._configureSharedTexture(tex, { srgb });
            entry = { texture: tex };
            this._cache.set(key, entry);
        }

        if (!cloneTexture) {
            setTextureTransform(entry.texture, { repeat });
            return entry.texture;
        }

        const clone = entry.texture?.clone?.() ?? null;
        if (!clone) return entry.texture ?? null;
        this._configureSharedTexture(clone, { srgb });
        setTextureTransform(clone, { repeat });
        return clone;
    }

    _configureSharedTexture(tex, { srgb = true } = {}) {
        if (!tex?.isTexture) return;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        applyTextureColorSpace(tex, { srgb: !!srgb });

        const renderer = this._renderer;
        if (renderer?.capabilities?.getMaxAnisotropy) {
            tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
        } else {
            tex.anisotropy = 8;
        }
        if (textureHasImageData(tex)) tex.needsUpdate = true;
    }

    _warnTextureLoadError(url, err) {
        if (this._warnedUrls.has(url)) return;
        this._warnedUrls.add(url);
        const detail = err?.message ?? (typeof err === 'string' ? err : '');
        const suffix = ' (Fix: ensure asset exists; if using Git LFS run git lfs pull.)';
        const message = detail
            ? `[PbrTexturePipeline] Failed to load texture: ${url}. ${detail}${suffix}`
            : `[PbrTexturePipeline] Failed to load texture: ${url}.${suffix}`;
        this._logger?.warn?.(message);
    }
}
