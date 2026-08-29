// Adapts the baked static-visibility runtime to Three.js city roots.
// @ts-check

import * as THREE from 'three';
import {
    STATIC_VISIBILITY_PROFILE,
    StaticVisibilityRuntime,
    createStaticVisibilityCityHash,
    getResolvedStaticVisibilitySettings,
    sanitizeStaticVisibilitySettings,
    validateStaticVisibilityPayload
} from '../../../app/city/visibility/index.js';
import { StaticVisibilityRenderBridge } from './StaticVisibilityRenderBridge.js';

const ASSET_URLS = Object.freeze({
    bigcity2: new URL('../../../app/city/visibility/bakes/bigcity2.v1.json', import.meta.url)
});

const CAMERA_EPSILON = 1e-3;

function collectUnits(city) {
    const units = [];
    const appendRoot = (root) => {
        const metadata = root?.userData?.staticVisibility ?? null;
        if (!metadata?.id || !metadata?.category) throw new Error(`Static visibility metadata missing on root '${root?.name ?? 'unnamed'}'`);
        units.push({ id: metadata.id, category: metadata.category, root });
    };

    for (const root of (city?.buildings?.group?.children ?? [])) {
        if (root?.name === 'BuildingSlabs') continue;
        appendRoot(root);
    }
    for (const root of (city?.trafficControls?.group?.children ?? [])) appendRoot(root);
    for (const root of (city?.world?.trees?.group?.children ?? [])) appendRoot(root);
    return units;
}

function isCameraSupported(camera, renderer) {
    if (!camera?.isPerspectiveCamera) return 'camera_not_perspective';
    const expected = STATIC_VISIBILITY_PROFILE.camera;
    if (Math.abs(camera.fov - expected.fovDeg) > CAMERA_EPSILON) return 'camera_fov_unsupported';
    if (camera.near + CAMERA_EPSILON < expected.near) return 'camera_near_unsupported';
    if (camera.far - CAMERA_EPSILON > expected.far) return 'camera_far_unsupported';
    const size = renderer?.getSize?.(new THREE.Vector2()) ?? null;
    const aspect = size?.y > 0 ? size.x / size.y : camera.aspect;
    if (!Number.isFinite(aspect) || aspect > expected.maxAspect + CAMERA_EPSILON) return 'camera_aspect_unsupported';
    return null;
}

export class CityStaticVisibility {
    constructor({ city, engine, settings = null, fetchImpl = null } = {}) {
        if (!city || !engine?.renderer || !engine?.camera || !engine?.scene) {
            throw new Error('City static visibility requires city and engine');
        }
        this.city = city;
        this.engine = engine;
        this.settings = sanitizeStaticVisibilitySettings(settings ?? getResolvedStaticVisibilitySettings());
        this._fetch = typeof fetchImpl === 'function' ? fetchImpl : (...args) => globalThis.fetch(...args);
        this._runtime = null;
        this._bridge = null;
        this._decoded = null;
        this._disposed = false;
        this._loadGeneration = 0;
        this._forward = new THREE.Vector3();
        this._status = { state: this.settings.enabled ? 'loading' : 'disabled', reason: this.settings.enabled ? 'loading' : 'disabled' };
        this._loadTiming = { loadMs: 0, decodeMs: 0 };
        this._lastError = null;
        if (this.settings.enabled) void this._load();
    }

    async _load() {
        const generation = ++this._loadGeneration;
        const assetUrl = ASSET_URLS[this.city.cityId];
        if (!assetUrl) {
            this._setFallback('unsupported_city');
            return;
        }
        this._status = { state: 'loading', reason: 'loading' };
        this._lastError = null;
        const started = performance.now();
        try {
            const trees = this.city.world?.trees ?? null;
            await trees?.readyPromise;
            if (this._disposed || generation !== this._loadGeneration || !this.settings.enabled) return;
            if ((trees?.placements?.length ?? 0) !== (trees?.group?.children?.length ?? 0)) {
                this._setFallback('async_tree_mismatch');
                return;
            }

            const units = collectUnits(this.city);
            const cityConfigHash = createStaticVisibilityCityHash(this.city);
            const response = await this._fetch(assetUrl);
            if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'error'}`);
            const payload = await response.json();
            this._loadTiming.loadMs = performance.now() - started;
            const decodeStarted = performance.now();
            const decoded = validateStaticVisibilityPayload(payload, {
                cityId: this.city.cityId,
                cityConfigHash,
                mapWidth: this.city.map.width,
                mapHeight: this.city.map.height,
                tileSize: this.city.map.tileSize,
                originX: this.city.map.origin.x,
                originZ: this.city.map.origin.z,
                units
            });
            this._loadTiming.decodeMs = performance.now() - decodeStarted;
            if (!decoded.ok) {
                this._setFallback(decoded.reason);
                return;
            }
            if (this._disposed || generation !== this._loadGeneration || !this.settings.enabled) return;

            this._decoded = decoded;
            this._bridge = new StaticVisibilityRenderBridge({
                renderer: this.engine.renderer,
                scene: this.engine.scene,
                camera: this.engine.camera,
                roots: units.map((unit) => unit.root)
            });
            this._runtime = new StaticVisibilityRuntime({
                map: {
                    width: this.city.map.width,
                    height: this.city.map.height,
                    tileSize: this.city.map.tileSize,
                    originX: this.city.map.origin.x,
                    originZ: this.city.map.origin.z
                },
                units,
                settings: this.settings,
                onVisibilityChange: (index, visible) => this._bridge?.setColorVisibility(index, visible)
            });
            this._runtime.setPayload(decoded);
            this._status = this._runtime.getStatus();
        } catch (error) {
            if (this._disposed || generation !== this._loadGeneration) return;
            this._lastError = error instanceof Error ? error.message : String(error);
            console.warn('[CityStaticVisibility] Visibility map load failed:', this._lastError);
            this._setFallback('load_failed');
        }
    }

    _setFallback(reason) {
        this._runtime?.setFallback(reason);
        this._bridge?.restoreAllVisible();
        this._status = { state: this.settings.enabled ? 'fallback' : 'disabled', reason: this.settings.enabled ? reason : 'disabled' };
    }

    setSettings(settings) {
        const previousEnabled = this.settings.enabled;
        this.settings = sanitizeStaticVisibilitySettings(settings);
        if (!this.settings.enabled) {
            this._loadGeneration += 1;
            this._runtime?.setSettings(this.settings);
            this._bridge?.restoreAllVisible();
            this._status = { state: 'disabled', reason: 'disabled' };
            return;
        }
        this._runtime?.setSettings(this.settings);
        if (this._decoded && this._runtime) {
            this._runtime.setPayload(this._decoded);
            this._status = this._runtime.getStatus();
            return;
        }
        if (!previousEnabled || this._status.state !== 'loading') void this._load();
    }

    update(camera = this.engine.camera, nowMs = performance.now()) {
        if (this._disposed || !this.settings.enabled || !this._runtime || !this._decoded) return false;
        if (camera !== this.engine.camera) {
            this._setFallback('camera_identity_unsupported');
            return false;
        }
        const unsupported = isCameraSupported(camera, this.engine.renderer);
        camera.getWorldDirection(this._forward);
        const pitchDeg = Math.asin(Math.max(-1, Math.min(1, this._forward.y))) * 180 / Math.PI;
        const profileCamera = STATIC_VISIBILITY_PROFILE.camera;
        const pitchUnsupported = pitchDeg < profileCamera.minPitchDeg - CAMERA_EPSILON
            || pitchDeg > profileCamera.maxPitchDeg + CAMERA_EPSILON;
        const reason = unsupported ?? (pitchUnsupported ? 'camera_pitch_unsupported' : null);
        if (reason) {
            if (this._runtime.getStatus().reason !== reason) this._runtime.setFallback(reason);
            this._status = this._runtime.getStatus();
            return false;
        }
        if (this._runtime.getStatus().state !== 'active') this._runtime.setPayload(this._decoded);
        const yaw = Math.atan2(this._forward.x, this._forward.z);
        const updated = this._runtime.update({ x: camera.position.x, z: camera.position.z, yaw, nowMs });
        this._status = this._runtime.getStatus();
        return updated;
    }

    getStatus() {
        return Object.freeze({ ...this._status });
    }

    getDiagnostics() {
        return {
            enabled: this.settings.diagnostics === true,
            ...(this._runtime?.getDiagnostics?.() ?? { state: this._status.state, fallbackReason: this._status.reason }),
            bakeVersion: this._decoded?.payload?.version ?? null,
            profileId: this._decoded?.payload?.profileId ?? null,
            loadMs: this._loadTiming.loadMs,
            decodeMs: this._loadTiming.decodeMs,
            renderBridge: this._bridge ? { ...this._bridge.stats } : null,
            lastError: this._lastError
        };
    }

    dispose() {
        this._disposed = true;
        this._loadGeneration += 1;
        this._runtime?.setFallback('disposed');
        this._bridge?.dispose();
        this._runtime = null;
        this._bridge = null;
        this._decoded = null;
        this._status = { state: 'disposed', reason: 'disposed' };
    }
}

export { createStaticVisibilityCityHash };

export function collectStaticVisibilityCityUnits(city) {
    return collectUnits(city);
}
