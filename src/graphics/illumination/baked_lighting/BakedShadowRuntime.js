// Connects persisted baked-shadow intent to the exact static-sun package pipeline.
// @ts-check

import {
    getResolvedBakedLightingSettings,
    resolveExactBakedShadowProfile,
    sanitizeBakedLightingSettings
} from '../../../app/illumination/runtime/index.js';
import { createStaticVisibilityCityHash } from '../../../app/city/visibility/index.js';
import { StaticSunDepthPipeline } from '../static_sun_depth/index.js';

const DEFAULT_INDEX_URL = '/assets/baked_lighting/shadows/package_index.json';
const CAPABILITY_PROFILE_ID = 'development.static_sun_v1';
const DYNAMIC_SHADOW_RESOLUTION_PROFILES = Object.freeze({
    medium: Object.freeze({ mapSize: 2048, worldUnitsPerTexel: 0.025 }),
    high: Object.freeze({ mapSize: 4096, worldUnitsPerTexel: 0.0125 })
});

function dynamicShadowResolutionFor(settings) {
    return DYNAMIC_SHADOW_RESOLUTION_PROFILES[settings?.shadows?.dynamicResolution]
        ?? DYNAMIC_SHADOW_RESOLUTION_PROFILES.medium;
}

function freezeStatus(status) {
    return Object.freeze({
        requested: status.requested === true,
        state: String(status.state ?? 'current'),
        phase: status.phase ? String(status.phase) : null,
        reason: status.reason ? String(status.reason) : null,
        effectiveMode: status.effectiveMode === 'baked' ? 'baked' : 'current',
        profileId: status.profileId ? String(status.profileId) : null,
        packageUrl: status.packageUrl ? String(status.packageUrl) : null
    });
}

function packageUrlFromPath(path) {
    return `/${String(path).replaceAll('\\', '/').replace(/^\/+/, '')}`;
}

export class BakedShadowRuntime {
    /**
     * @param {object} engine
     * @param {{indexUrl?: string, fetchIndex?: (url: string) => Promise<unknown>}} [options]
     */
    constructor(engine, options = {}) {
        if (!engine?.renderer?.isWebGLRenderer) throw new TypeError('BakedShadowRuntime requires a GameEngine WebGLRenderer.');
        this.engine = engine;
        this._settings = getResolvedBakedLightingSettings();
        this._indexUrl = typeof options.indexUrl === 'string' && options.indexUrl ? options.indexUrl : DEFAULT_INDEX_URL;
        this._fetchIndex = options.fetchIndex ?? ((url) => fetch(url, { cache: 'no-cache' }).then((response) => {
            if (!response.ok) throw new Error(`Baked-lighting package index returned HTTP ${response.status}.`);
            return response.json();
        }));
        if (typeof this._fetchIndex !== 'function') throw new TypeError('BakedShadowRuntime fetchIndex must be a function.');
        this._pipeline = null;
        this._liveIdentity = null;
        this._indexPromise = null;
        this._refreshPromise = null;
        this._requestKey = null;
        this._generation = 0;
        this._disposed = false;
        this._status = freezeStatus({
            requested: this._settings.shadows.enabled,
            state: 'current',
            reason: this._settings.shadows.enabled ? 'waiting_for_gameplay_city' : 'disabled',
            effectiveMode: 'current'
        });
    }

    getSettings() {
        return sanitizeBakedLightingSettings(this._settings);
    }

    /** @param {unknown} settings */
    setSettings(settings) {
        if (this._disposed) return Promise.resolve(this.getDiagnostics());
        const next = sanitizeBakedLightingSettings(settings);
        const enabledChanged = next.shadows.enabled !== this._settings.shadows.enabled;
        const resolutionChanged = next.shadows.dynamicResolution !== this._settings.shadows.dynamicResolution;
        this._settings = next;
        if (resolutionChanged && this._pipeline) {
            this._pipeline.setDynamicShadowResolution(dynamicShadowResolutionFor(next));
        }
        return enabledChanged || resolutionChanged || next.shadows.enabled
            ? this.refresh()
            : Promise.resolve(this.getDiagnostics());
    }

    refresh() {
        if (this._disposed) return Promise.resolve(this.getDiagnostics());
        const generation = ++this._generation;
        const task = this._refresh(generation).catch((error) => {
            if (generation !== this._generation) return this.getDiagnostics();
            this._requestKey = null;
            this._status = freezeStatus({
                requested: this._settings.shadows.enabled,
                state: 'fallback',
                reason: error instanceof Error ? error.message : String(error),
                effectiveMode: 'current'
            });
            console.warn('[BakedShadowRuntime] Baked shadows unavailable; retaining current shadows.', error);
            return this.getDiagnostics();
        });
        this._refreshPromise = task;
        return task;
    }

    async _refresh(generation) {
        if (!this._settings.shadows.enabled) {
            if (this._pipeline) await this._pipeline.setMode('current');
            if (generation !== this._generation) return this.getDiagnostics();
            this._status = freezeStatus({ requested: false, state: 'current', reason: 'disabled', effectiveMode: 'current' });
            return this.getDiagnostics();
        }

        const city = this.engine?.context?.city ?? null;
        if (!city?.cityId || !city?.group) {
            this._requestKey = null;
            if (this._pipeline) this._pipeline.deactivate('no_gameplay_city');
            if (generation !== this._generation) return this.getDiagnostics();
            this._status = freezeStatus({ requested: true, state: 'fallback', reason: 'no_gameplay_city', effectiveMode: 'current' });
            return this.getDiagnostics();
        }

        const index = await this._loadIndex();
        if (generation !== this._generation) return this.getDiagnostics();
        const selection = resolveExactBakedShadowProfile(index, {
            cityId: city.cityId,
            cityConfigHash: createStaticVisibilityCityHash(city),
            atmosphere: this.engine.atmosphereSettings
        });
        if (!selection.ok) {
            this._requestKey = null;
            if (this._pipeline) this._pipeline.deactivate(selection.reason);
            if (generation !== this._generation) return this.getDiagnostics();
            this._status = freezeStatus({
                requested: true,
                state: 'fallback',
                reason: selection.reason,
                effectiveMode: 'current',
                profileId: selection.profileId
            });
            return this.getDiagnostics();
        }

        const packageUrl = packageUrlFromPath(selection.packagePath);
        const requestKey = `${selection.liveIdentity.cityId}\n${selection.profileId}\n${packageUrl}`;
        if (requestKey === this._requestKey && this._pipeline) {
            const controller = this._pipeline.getDiagnostics()?.runtime?.controller ?? null;
            if (controller?.effectiveMode === 'baked' || controller?.state === 'loading') return this.getDiagnostics();
        }
        this._requestKey = requestKey;
        this._liveIdentity = selection.liveIdentity;
        const pipeline = this._ensurePipeline();
        this._status = freezeStatus({
            requested: true,
            state: 'loading',
            phase: 'locating',
            effectiveMode: 'current',
            profileId: selection.profileId,
            packageUrl
        });
        const live = selection.liveIdentity;
        await pipeline.setMode('auto', {
            url: packageUrl,
            expectations: {
                cityId: live.cityId,
                lightingProfileId: live.lightingProfileId,
                selectedCapabilityProfileId: CAPABILITY_PROFILE_ID,
                resolvedSourceSha256: live.resolvedSourceSha256,
                staticSunDepthSourceSha256: live.staticSunDepthSourceSha256
            }
        });
        if (generation !== this._generation) return this.getDiagnostics();
        this._syncStatusFromPipeline(selection.profileId, packageUrl);
        return this.getDiagnostics();
    }

    _loadIndex() {
        if (!this._indexPromise) {
            this._indexPromise = Promise.resolve(this._fetchIndex(this._indexUrl)).catch((error) => {
                this._indexPromise = null;
                throw error;
            });
        }
        return this._indexPromise;
    }

    _ensurePipeline() {
        if (!this._pipeline) {
            this._pipeline = new StaticSunDepthPipeline(this.engine, {
                initialMode: 'current',
                dynamicShadow: dynamicShadowResolutionFor(this._settings),
                getLiveStaticSunDepthIdentity: () => this._liveIdentity ? { ...this._liveIdentity } : null
            });
        }
        if (this.engine.getIlluminationPipeline?.() !== this._pipeline) {
            this.engine.installIlluminationPipeline(this._pipeline);
        }
        return this._pipeline;
    }

    _syncStatusFromPipeline(profileId = this._status.profileId, packageUrl = this._status.packageUrl) {
        if (!this._settings.shadows.enabled || !this._pipeline) return;
        const controller = this._pipeline.getDiagnostics()?.runtime?.controller ?? null;
        if (!controller) return;
        const effectiveMode = controller.effectiveMode === 'baked' ? 'baked' : 'current';
        const state = effectiveMode === 'baked'
            ? 'active'
            : (controller.state === 'loading' ? 'loading' : 'fallback');
        this._status = freezeStatus({
            requested: true,
            state,
            phase: controller.phase,
            reason: controller.reason,
            effectiveMode,
            profileId: controller.profileId ?? profileId,
            packageUrl
        });
    }

    getDiagnostics() {
        this._syncStatusFromPipeline();
        return Object.freeze({
            settings: Object.freeze({
                shadows: Object.freeze({
                    enabled: this._settings.shadows.enabled,
                    dynamicResolution: this._settings.shadows.dynamicResolution
                })
            }),
            status: this._status,
            developmentCache: true,
            packageIndexUrl: this._indexUrl,
            pipeline: this._pipeline?.getDiagnostics?.() ?? null
        });
    }

    /**
     * Invalidates in-flight index/package work before the renderer is released.
     * GameEngine passes `disposePipeline: false` because it owns and awaits the
     * installed pipeline's final disposal transaction.
     * @param {{disposePipeline?: boolean}} [options]
     */
    dispose({ disposePipeline = true } = {}) {
        if (this._disposed) return undefined;
        this._disposed = true;
        this._generation += 1;
        this._requestKey = null;
        this._liveIdentity = null;
        const pipeline = this._pipeline;
        this._pipeline = null;
        this._status = freezeStatus({
            requested: false,
            state: 'disposed',
            reason: 'disposed',
            effectiveMode: 'current'
        });
        return disposePipeline ? pipeline?.dispose?.() : undefined;
    }
}
