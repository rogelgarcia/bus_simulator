// Coordinates complete player modes using the existing shadow resource controller.
// @ts-check
import { BakedShadowRuntime } from './BakedShadowRuntime.js';
import { EnhancedReceiverLightmapRuntime } from '../receiver_lightmaps/EnhancedReceiverLightmapRuntime.js';
import { enhancedLightingKey } from '../receiver_lightmaps/EnhancedReceiverFreshness.js';
import { getResolvedBakedLightingSettings, sanitizeBakedLightingSettings } from '../../../app/illumination/runtime/index.js';

function causeFor(reason) {
    if (/mismatch|changed|drift|stale|not_exact|not_current/.test(reason)) return 'stale';
    if (/missing|unavailable|not_available|no_gameplay|no_receiver|unsupported|not_configured|404/.test(reason)) return 'unavailable';
    return 'failed';
}

export class BakedLightingRuntime {
    /** @param {any} engine @param {any} [dependencies] */
    constructor(engine, dependencies = {}) {
        this.engine = engine;
        this.settings = getResolvedBakedLightingSettings();
        this.shadows = dependencies.shadows ?? new BakedShadowRuntime(engine);
        this.receivers = dependencies.receivers ?? new EnhancedReceiverLightmapRuntime(engine);
        this.receivers.atomicActivation = true;
        this.receivers.requestRefresh = () => this.reload();
        this.shadows.canActivate = () => this.ready && !this.failure && this.settings.mode !== 'current';
        this.generation = 0;
        this.ready = false;
        this.loading = false;
        this.effectiveMode = 'current';
        this.reason = 'waiting_for_gameplay_city';
        this.timings = {};
    }

    getSettings() { return sanitizeBakedLightingSettings(this.settings); }

    async setSettings(input) {
        const next = sanitizeBakedLightingSettings(input);
        const previous = this.settings;
        this.settings = next;
        this.receivers.settings.debug = next.receivers.debug;
        const intentChanged = previous.mode !== next.mode || previous.shadows.enabled !== next.shadows.enabled
            || previous.receivers.indirect !== next.receivers.indirect;
        if (intentChanged || !this.started) return this.refresh();
        if (previous.shadows.dynamicResolution !== next.shadows.dynamicResolution) {
            try { await this.shadows.setSettings(this.childSettings()); }
            catch (error) { this.fallback(error.message); }
        }
        return this.getDiagnostics();
    }

    childSettings() {
        const enabled = this.settings.mode !== 'current';
        return { ...this.settings, shadows: { ...this.settings.shadows, enabled: enabled && this.settings.shadows.enabled },
            receivers: { ...this.settings.receivers, direct: false, indirect: enabled && this.settings.receivers.indirect } };
    }

    observeLighting() {
        const city = this.engine.context?.city;
        let key = '';
        try { if (city?.sunRef && city?.hemi) key = enhancedLightingKey(this.engine, city); } catch { key = 'lighting_not_ready'; }
        const sun = this.engine.atmosphereSettings?.sun;
        return { city, key: `${key}|${sun?.azimuthDeg}|${sun?.elevationDeg}` };
    }

    async refresh() {
        if (this.disposed) return this.getDiagnostics();
        this.started = true;
        const generation = ++this.generation;
        this.ready = false; this.failure = null; this.loading = false;
        this.observed = this.observeLighting();
        this.receivers.suspend();
        this.shadows.suspend();
        this.effectiveMode = 'current';
        // Restore before asynchronous work. No render can interleave this
        // synchronous transaction; activation remains owned by frameBegin.
        this.shadows.commitCurrent();
        const settings = this.childSettings();
        this.receivers.settings = { ...settings.receivers };
        if (this.settings.mode === 'current' || (!settings.shadows.enabled && !settings.receivers.indirect)) {
            this.reason = this.settings.mode === 'current' ? 'current_requested' : 'no_channels_requested';
            return this.getDiagnostics();
        }
        this.loading = true; this.reason = 'locating'; this.loadStarted = performance.now();
        try {
            // Serial preparation avoids competing material ownership changes.
            await this.shadows.setSettings(settings);
            if (generation !== this.generation || this.disposed) return this.getDiagnostics();
            if (settings.shadows.enabled && !this.shadowReady()) {
                throw new Error(this.shadows.getDiagnostics().status.reason ?? 'shadow_package_unavailable');
            }
            if (settings.receivers.indirect) await this.receivers.refresh();
            if (generation !== this.generation || this.disposed) return this.getDiagnostics();
            if (settings.receivers.indirect && !this.receivers.pending && !this.receivers.active) {
                throw new Error(this.receivers.status.reason ?? 'indirect_package_unavailable');
            }
            this.ready = true; this.reason = 'ready_to_commit';
        } catch (error) {
            if (generation === this.generation && !this.disposed) this.fallback(error.message);
        }
        return this.getDiagnostics();
    }

    shadowReady() {
        const state = this.shadows.getSnapshot();
        return state?.pendingTransition === 'baked' || state?.effectiveMode === 'baked';
    }

    fallback(reason) {
        this.ready = false; this.loading = false; this.failure = causeFor(reason); this.reason = reason;
        this.receivers.suspend(reason);
        this.shadows.suspend(reason, false);
        this.effectiveMode = 'current';
    }

    prepareFrame() {
        if (this.disposed) return;
        const compatible = this.receivers.validateFrame();
        if (this.settings.mode === 'current') return;
        const observed = this.observeLighting();
        const changed = this.observed && (observed.city !== this.observed.city || observed.key !== this.observed.key);
        this.observed = observed;
        if (changed) {
            this.fallback('source_or_profile_changed');
            // Revalidate once per changed lighting configuration, never per frame.
            void this.refresh();
            return;
        }
        if (this.settings.receivers.indirect && !compatible) this.fallback('source_or_profile_changed');
    }

    frameBegin() {
        if (this.disposed) return;
        const settings = this.childSettings();
        const shadowActive = this.shadows.getSnapshot()?.effectiveMode === 'baked';
        const allow = this.ready && !this.failure && (!settings.shadows.enabled || shadowActive);
        if (this.ready && settings.shadows.enabled && !shadowActive) {
            this.fallback(this.shadows.getDiagnostics().status.reason ?? 'shadow_activation_failed');
        }
        this.receivers.frameBegin(performance.now(), allow, false);
        if (allow && (!settings.receivers.indirect || this.receivers.active)) {
            if (this.effectiveMode !== 'baked') this.timings.activationMs = performance.now() - this.loadStarted;
            this.effectiveMode = 'baked'; this.loading = false; this.reason = null;
        }
    }

    async reload() {
        if (this.disposed) return this.getDiagnostics();
        this.generation++; this.ready = false;
        this.receivers.invalidate(); this.shadows.invalidate();
        return this.refresh();
    }

    getStatus() {
        const shadow = this.shadows.getSnapshot();
        const receiver = this.receivers.status;
        const shadowReady = shadow?.pendingTransition === 'baked' || shadow?.effectiveMode === 'baked';
        const channels = {
            shadows: { enabled: this.settings.shadows.enabled, ready: shadowReady,
                phase: shadow?.load?.phase ?? shadow?.phase },
            indirect: { enabled: this.settings.receivers.indirect, ready: this.receivers.pending || this.receivers.active,
                phase: receiver?.state === 'loading' ? receiver.reason : 'waiting' }
        };
        return Object.fromEntries(Object.entries(channels).map(([id, channel]) => {
            let state, phase = null, reason = null;
            if (this.disposed || this.settings.mode === 'current' || !channel.enabled) state = 'off';
            else if (!this.engine.context?.city) { state = 'waiting'; reason = 'waiting_for_gameplay_city'; }
            else if (this.failure) { state = 'fallback'; reason = this.reason; }
            else if (this.effectiveMode === 'baked') state = 'active';
            else if (this.loading) {
                phase = channel.ready ? 'ready_to_commit' : channel.phase;
                if (phase === 'waiting') state = 'waiting';
                else {
                    state = 'loading';
                    if (!phase || phase === 'disposed' || phase === 'committed') phase = 'locating';
                }
            } else { state = 'waiting'; reason = this.reason; }
            return [id, { state, phase, reason, causeState: state === 'fallback' ? this.failure : null, revision: this.generation }];
        }));
    }

    getDiagnostics() {
        const shadow = this.shadows.getDiagnostics();
        const receiver = this.receivers.getDiagnostics();
        const pipeline = shadow.pipeline?.runtime?.controller;
        const active = this.effectiveMode === 'baked';
        return { ...shadow, settings: this.getSettings(),
            status: { requested: this.settings.mode !== 'current', requestedMode: this.settings.mode,
                effectiveMode: this.effectiveMode, state: active ? 'active' : this.loading ? 'loading' : 'fallback',
                causeState: this.failure, reason: this.reason,
                phase: active ? 'committed' : this.loading ? this.ready ? 'ready_to_commit'
                    : receiver.state === 'loading' ? receiver.reason : pipeline?.phase ?? 'locating' : null,
                profileId: receiver.publications?.indirect_irradiance?.profileId ?? shadow.status.profileId },
            receiverLightmaps: receiver,
            requiredChannels: this.settings.mode === 'current' ? [] : [
                ...(this.settings.shadows.enabled ? ['static_sun_depth'] : []),
                ...(this.settings.receivers.indirect ? ['indirect_irradiance'] : [])],
            timings: { ...this.timings, loadingElapsedMs: this.loading ? performance.now() - this.loadStarted : null },
            lightingCompatibility: { policy: 'exact_source_and_light_profile', liveDirectSun: true, bakedDirect: 'disabled',
                indirectImplementation: 'AI548', exposureAndPostprocessing: 'live',
                environmentAndSunChanges: 'revalidate_complete_selection' },
            cachePolicy: 'one_exact_publication_per_channel_until_invalidation_reload_or_disposal',
            offlineWorkflow: 'tools/baking/README.md' };
    }

    dispose(options) {
        if (this.disposed) return;
        this.disposed = true; this.generation++; this.ready = false;
        this.receivers.dispose();
        return this.shadows.dispose(options);
    }
}
