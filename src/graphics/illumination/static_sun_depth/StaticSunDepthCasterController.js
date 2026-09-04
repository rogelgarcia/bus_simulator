// Transactionally transfers City.group caster and legacy shadow-pass ownership to the AI 531 cache.
// @ts-check

import { ShadowCasterCuller } from '../../lighting/ShadowCasterCulling.js';

export class StaticSunDepthCasterController {
    constructor(engine) {
        this.engine = engine;
        this.city = null;
        this._snapshot = new Map();
        this._shadowMapSnapshot = new Map();
        this._active = false;
        this._refreshing = false;
        this._shadowMapFreezePending = false;
        this._shadowMapPassDisabled = false;
        this._metrics = {
            staticMeshCount: 0,
            originalCasterCount: 0,
            suppressedCasterCount: 0,
            restores: 0,
            settingsRefreshes: 0,
            shadowRefreshRequests: 0,
            shadowPassDisableTransitions: 0,
            shadowPassRestoreTransitions: 0,
            shadowPassFreezeWaitFrames: 0
        };
    }

    activate(city) {
        if (!city?.group?.traverse) throw new TypeError('Static-sun caster suppression requires a City group.');
        if (this._active && this.city === city) {
            if (!this.verifySuppressed()) throw new Error('Static-sun caster ownership is no longer valid.');
            return this.getDiagnostics();
        }
        if (this._active) this.deactivate('city_replaced');
        if (city._staticSunDepthCasterController && city._staticSunDepthCasterController !== this) {
            throw new Error('City already has another static-sun caster owner.');
        }
        const context = this.engine?.context;
        if (context && 'city' in context && context.city !== city) {
            throw new Error('Static-sun caster activation city does not match the engine context.');
        }
        this.city = city;
        try {
            city._shadowCuller?.clear?.();
            this._captureAndSuppress();
            this._captureShadowMapUpdates(city);
            city._staticSunDepthCasterController = this;
            city._staticSunDepthCacheActive = true;
            this._active = true;
            this._markShadowMapsDirty(city);
        } catch (error) {
            try {
                this._restoreSnapshot();
            } catch {
                // Preserve the activation failure while completing ownership rollback.
            }
            this._restoreShadowMapUpdates({ forceRefresh: true });
            if (city._staticSunDepthCasterController === this) city._staticSunDepthCasterController = null;
            city._staticSunDepthCacheActive = false;
            this.city = null;
            this._active = false;
            this._refreshing = false;
            this._rebuildCityCuller(city);
            this._markShadowMapsDirty(city);
            throw error;
        }
        return this.getDiagnostics();
    }

    beforeShadowSettings() {
        if (!this._active || this._refreshing) return false;
        this._refreshing = true;
        if (this.city) this.city._staticSunDepthCacheActive = false;
        try {
            this._restoreSnapshot(false);
            this._restoreShadowMapUpdates({ forceRefresh: true });
            this._markShadowMapsDirty(this.city);
        } catch (error) {
            this.deactivate('shadow_settings_restore_failed');
            throw error;
        }
        return true;
    }

    afterShadowSettings(settingsApplied = true) {
        if (!this._active || !this._refreshing) return false;
        if (!settingsApplied) {
            this.deactivate('shadow_settings_failed');
            return false;
        }
        try {
            this.city?._shadowCuller?.clear?.();
            this._captureAndSuppress();
            this._captureShadowMapUpdates(this.city);
            this._metrics.settingsRefreshes += 1;
            if (this.city) this.city._staticSunDepthCacheActive = true;
            this._refreshing = false;
            this._markShadowMapsDirty(this.city);
            return true;
        } catch (error) {
            this.deactivate('shadow_settings_refresh_failed');
            throw error;
        }
    }

    deactivate(reason = 'current') {
        const city = this.city;
        // Debug-mode transitions are idempotent. Record the requested live
        // ownership reason even when a prior comparison transition already
        // restored the same city caster snapshot.
        this._lastReason = reason;
        if (!city) return false;
        let restorationError = null;
        try {
            this._restoreSnapshot();
        } catch (error) {
            restorationError = error;
        }
        try {
            this._restoreShadowMapUpdates({ forceRefresh: true });
        } catch (error) {
            restorationError ??= error;
        }
        city._staticSunDepthCacheActive = false;
        if (city._staticSunDepthCasterController === this) city._staticSunDepthCasterController = null;
        this.city = null;
        this._active = false;
        this._refreshing = false;
        this._metrics.restores += 1;
        this._rebuildCityCuller(city);
        this._markShadowMapsDirty(city);
        if (restorationError) throw restorationError;
        return true;
    }

    /**
     * Freezes every live sun shadow after the first baked frame has rendered
     * empty maps. Keeping the lights shadow-enabled preserves CSM's single-sun
     * shader branches while per-light autoUpdate=false makes WebGLShadowMap
     * skip their targets on all later renders.
     */
    freezeShadowMapPassAfterEmptyRender() {
        if (!this._active || this._refreshing || !this._shadowMapFreezePending) return false;
        if (!this._shadowMapInventoryMatches()) {
            throw new Error('Legacy shadow-map ownership changed before the baked cutover completed.');
        }
        const entries = [...this._shadowMapSnapshot.values()];
        const ready = entries.every(({ shadow }) => (
            shadow.map != null && shadow.needsUpdate === false
        ));
        if (!ready) {
            for (const { shadow } of entries) {
                if (shadow.map == null && shadow.needsUpdate === false) shadow.needsUpdate = true;
            }
            this._metrics.shadowPassFreezeWaitFrames += 1;
            return false;
        }
        const touched = [];
        try {
            for (const entry of entries) {
                touched.push(entry);
                entry.shadow.autoUpdate = false;
                entry.shadow.needsUpdate = false;
            }
        } catch (error) {
            for (const entry of touched) this._restoreShadowMapEntry(entry, false);
            throw error;
        }
        this._shadowMapFreezePending = false;
        this._shadowMapPassDisabled = true;
        this._metrics.shadowPassDisableTransitions += 1;
        return true;
    }

    _captureAndSuppress() {
        const city = this.city;
        if (!city?.group?.traverse) throw new Error('Static-sun city disappeared during caster transaction.');
        const captured = new Map();
        let staticMeshCount = 0;
        let originalCasterCount = 0;
        city.group.traverse((object) => {
            if (!object?.isMesh) return;
            staticMeshCount += 1;
            const original = !!object.castShadow;
            captured.set(object, original);
            if (original) originalCasterCount += 1;
        });
        const touched = [];
        try {
            for (const object of captured.keys()) {
                touched.push(object);
                object.castShadow = false;
            }
        } catch (error) {
            for (const object of touched) {
                try {
                    object.castShadow = captured.get(object);
                } catch {
                    // Continue restoring every object before surfacing the failure.
                }
            }
            throw error;
        }
        this._snapshot = captured;
        this._metrics.staticMeshCount = staticMeshCount;
        this._metrics.originalCasterCount = originalCasterCount;
        this._metrics.suppressedCasterCount = originalCasterCount;
    }

    _restoreSnapshot(clear = true) {
        let firstError = null;
        for (const [object, castShadow] of this._snapshot) {
            try {
                object.castShadow = castShadow;
            } catch (error) {
                firstError ??= error;
            }
        }
        if (clear) this._snapshot.clear();
        if (firstError) throw firstError;
    }

    _captureShadowMapUpdates(city) {
        if (this._shadowMapSnapshot.size > 0) {
            throw new Error('Legacy shadow-map ownership was captured twice without restoration.');
        }
        const captured = new Map();
        for (const light of this._getLiveShadowLights(city)) {
            const shadow = light.shadow;
            captured.set(shadow, {
                light,
                shadow,
                ownsAutoUpdate: Object.prototype.hasOwnProperty.call(shadow, 'autoUpdate'),
                autoUpdate: shadow.autoUpdate,
                ownsNeedsUpdate: Object.prototype.hasOwnProperty.call(shadow, 'needsUpdate'),
                needsUpdate: shadow.needsUpdate
            });
        }
        this._shadowMapSnapshot = captured;
        this._shadowMapFreezePending = captured.size > 0;
        this._shadowMapPassDisabled = captured.size === 0;
    }

    _restoreShadowMapUpdates({ forceRefresh = false } = {}) {
        if (this._shadowMapSnapshot.size === 0) {
            this._shadowMapFreezePending = false;
            this._shadowMapPassDisabled = false;
            return;
        }
        let firstError = null;
        for (const entry of this._shadowMapSnapshot.values()) {
            try {
                this._restoreShadowMapEntry(entry, forceRefresh);
            } catch (error) {
                firstError ??= error;
            }
        }
        this._shadowMapSnapshot.clear();
        this._shadowMapFreezePending = false;
        this._shadowMapPassDisabled = false;
        this._metrics.shadowPassRestoreTransitions += 1;
        if (firstError) throw firstError;
    }

    _restoreShadowMapEntry(entry, forceRefresh) {
        const { shadow } = entry;
        if (entry.ownsAutoUpdate) shadow.autoUpdate = entry.autoUpdate;
        else delete shadow.autoUpdate;
        if (forceRefresh) {
            shadow.needsUpdate = true;
        } else if (entry.ownsNeedsUpdate) {
            shadow.needsUpdate = entry.needsUpdate;
        } else {
            delete shadow.needsUpdate;
        }
    }

    _getLiveShadowLights(city) {
        return new Set([
            city?.sun,
            ...(Array.isArray(city?._csm?.csm?.lights) ? city._csm.csm.lights : [])
        ].filter((light) => light?.castShadow === true && light.shadow));
    }

    _shadowMapInventoryMatches() {
        const liveLights = this._getLiveShadowLights(this.city);
        if (liveLights.size !== this._shadowMapSnapshot.size) return false;
        for (const light of liveLights) {
            const entry = this._shadowMapSnapshot.get(light.shadow);
            if (!entry || entry.light !== light) return false;
            if (this._shadowMapPassDisabled) {
                if (light.shadow.autoUpdate !== false || light.shadow.needsUpdate !== false) return false;
            } else if (light.shadow.autoUpdate !== entry.autoUpdate) {
                return false;
            }
        }
        return true;
    }

    _rebuildCityCuller(city) {
        if (!city?._csm) return;
        try {
            if (!city._shadowCuller) city._shadowCuller = new ShadowCasterCuller();
            city._shadowCuller.clear();
            city._shadowCuller.addRoot(city.group);
            city._shadowCuller.update(this.engine?.camera, city.sunRef?.direction, city._csm.maxFar);
        } catch (error) {
            this._lastError = error;
        }
    }

    _markShadowMapsDirty(city) {
        const rendererShadowMap = this.engine?.renderer?.shadowMap;
        if (rendererShadowMap && 'needsUpdate' in rendererShadowMap) {
            rendererShadowMap.needsUpdate = true;
        }
        const lights = new Set([
            city?.sun,
            ...(Array.isArray(city?._csm?.csm?.lights) ? city._csm.csm.lights : [])
        ]);
        for (const light of lights) {
            if (light?.shadow && 'needsUpdate' in light.shadow) light.shadow.needsUpdate = true;
        }
        this._metrics.shadowRefreshRequests += 1;
    }

    verifySuppressed() {
        const city = this.city;
        if (!this._active || this._refreshing || !city) return false;
        if (city._staticSunDepthCasterController !== this || city._staticSunDepthCacheActive !== true) return false;
        const context = this.engine?.context;
        if (context && 'city' in context && context.city !== city) return false;
        if (this.engine?.scene && city.group.parent !== this.engine.scene) return false;
        let meshCount = 0;
        let valid = true;
        try {
            city.group.traverse((object) => {
                if (!object?.isMesh) return;
                meshCount += 1;
                if (!this._snapshot.has(object) || object.castShadow) valid = false;
            });
        } catch {
            return false;
        }
        return valid
            && meshCount === this._snapshot.size
            && this._shadowMapInventoryMatches();
    }

    getDiagnostics() {
        return Object.freeze({
            active: this._active,
            refreshing: this._refreshing,
            snapshotMeshCount: this._snapshot.size,
            shadowLightCount: this._shadowMapSnapshot.size,
            shadowMapFreezePending: this._shadowMapFreezePending,
            legacyShadowMapPassDisabled: this._shadowMapPassDisabled,
            cityId: this.city?.cityId ?? null,
            lastReason: this._lastReason ?? null,
            lastError: this._lastError ? String(this._lastError?.message ?? this._lastError) : null,
            ...this._metrics
        });
    }

    dispose() {
        this.deactivate('disposed');
    }
}
