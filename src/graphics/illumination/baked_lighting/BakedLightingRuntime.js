// Coordinates independent shadow and surface-irradiance user intent.
// @ts-check
import { BakedShadowRuntime } from './BakedShadowRuntime.js';
import { ReceiverLightmapRuntime } from '../receiver_lightmaps/ReceiverLightmapRuntime.js';
import { getResolvedBakedLightingSettings, sanitizeBakedLightingSettings } from '../../../app/illumination/runtime/index.js';

export class BakedLightingRuntime {
    /** @param {any} engine */
    constructor(engine) {
        this.settings = getResolvedBakedLightingSettings();
        this.shadows = new BakedShadowRuntime(engine);
        this.receivers = new ReceiverLightmapRuntime(engine);
        this.engine = engine;
        this.receiverModes = { legacy: this.receivers };
        this.receivers.settings = { ...this.settings.receivers };
    }
    getSettings() { return sanitizeBakedLightingSettings(this.settings); }
    /** @param {unknown} settings */
    async setSettings(settings) {
        this.settings = sanitizeBakedLightingSettings(settings);
        await this.selectReceivers();
        if (this.disposed) return this.getDiagnostics();
        if (this.settings.receivers.enhanced) {
            await this.shadows.setSettings(this.settings);
            if (!this.disposed) await this.receivers.setSettings(this.settings.receivers);
        } else await Promise.all([this.shadows.setSettings(this.settings), this.receivers.setSettings(this.settings.receivers)]);
        return this.getDiagnostics();
    }
    async refresh() {
        await this.selectReceivers();
        if (this.disposed) return this.getDiagnostics();
        this.receivers.settings = { ...this.settings.receivers };
        if (this.settings.receivers.enhanced) {
            await this.shadows.refresh();
            if (!this.disposed) await this.receivers.refresh();
        } else await Promise.all([this.shadows.refresh(), this.receivers.refresh()]);
        return this.getDiagnostics();
    }
    async selectReceivers() {
        if (this.disposed) return;
        const enhanced = this.settings.receivers.enhanced === true;
        const mode = enhanced ? 'enhanced' : 'legacy';
        if (!this.receiverModes[mode]) {
            const { EnhancedReceiverLightmapRuntime } = await import('../receiver_lightmaps/EnhancedReceiverLightmapRuntime.js');
            if (this.disposed) return;
            this.receiverModes.enhanced ??= new EnhancedReceiverLightmapRuntime(this.engine);
        }
        const target = this.receiverModes[this.settings.receivers.enhanced ? 'enhanced' : 'legacy'];
        if (target !== this.receivers) {
            await this.receivers.setSettings({ ...this.receivers.settings, direct: false, indirect: false });
            if (this.disposed) return;
            if (enhanced !== this.settings.receivers.enhanced) return this.selectReceivers();
            this.receivers = target;
        }
    }
    frameBegin() {
        if (!this.receiverModes.enhanced) return this.receivers.frameBegin();
        for (const runtime of Object.values(this.receiverModes)) runtime.frameBegin();
    }
    getDiagnostics() {
        return { ...this.shadows.getDiagnostics(), settings: this.getSettings(), receiverLightmaps: this.receivers.getDiagnostics(),
            receiverImplementations: Object.fromEntries(Object.entries(this.receiverModes).map(([name, runtime]) =>
                [name, { cached: Object.keys(runtime.resources).length > 0, selected: runtime === this.receivers }])) };
    }
    dispose(options) { this.disposed = true; for (const runtime of Object.values(this.receiverModes)) runtime.dispose(); return this.shadows.dispose(options); }
}
