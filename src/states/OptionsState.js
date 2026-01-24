// src/states/OptionsState.js
// In-game options overlay state (tabbed, persisted settings).

import { OptionsUI } from '../graphics/gui/options/OptionsUI.js';
import { saveLightingSettings } from '../graphics/lighting/LightingSettings.js';
import { saveBloomSettings } from '../graphics/visuals/postprocessing/BloomSettings.js';
import { saveColorGradingSettings } from '../graphics/visuals/postprocessing/ColorGradingSettings.js';
import { getResolvedSunFlareSettings, saveSunFlareSettings } from '../graphics/visuals/sun/SunFlareSettings.js';

function isEditableTarget(target) {
    const el = target && typeof target === 'object' ? target : null;
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!el.isContentEditable;
}

export class OptionsState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this._returnTo = 'welcome';
        this._overlay = false;
        this._ui = null;
        this._original = null;
        this._onKeyDown = (e) => this._handleKeyDown(e);
    }

    enter(params = {}) {
        const prev = typeof params?.returnTo === 'string' ? params.returnTo : null;
        this._returnTo = prev && prev !== 'options' ? prev : 'welcome';
        this._overlay = !!params?.overlay;

        document.body.classList.add('options-dock-open');
        requestAnimationFrame(() => this.engine?.resize?.());

        if (!this._overlay) {
            document.body.classList.remove('splash-bg');
            document.body.classList.remove('setup-bg');
        }

        document.activeElement?.blur?.();

        const lighting = this.engine?.lightingSettings ?? null;
        const bloom = this.engine?.bloomSettings ?? null;
        const postActive = this.engine?.isPostProcessingActive ?? false;
        const grading = this.engine?.colorGradingSettings ?? null;
        const gradingDebug = this.engine?.getColorGradingDebugInfo?.() ?? null;
        const sunFlare = getResolvedSunFlareSettings();

        this._original = {
            lighting: lighting && typeof lighting === 'object' ? JSON.parse(JSON.stringify(lighting)) : null,
            bloom: bloom && typeof bloom === 'object' ? JSON.parse(JSON.stringify(bloom)) : null,
            colorGrading: grading && typeof grading === 'object' ? JSON.parse(JSON.stringify(grading)) : null,
            sunFlare: sunFlare && typeof sunFlare === 'object' ? JSON.parse(JSON.stringify(sunFlare)) : null
        };

        this._ui = new OptionsUI({
            initialTab: 'lighting',
            initialLighting: lighting && typeof lighting === 'object'
                ? {
                    exposure: lighting.exposure,
                    hemiIntensity: lighting.hemiIntensity,
                    sunIntensity: lighting.sunIntensity,
                    ibl: {
                        enabled: lighting.ibl?.enabled,
                        envMapIntensity: lighting.ibl?.envMapIntensity,
                        setBackground: lighting.ibl?.setBackground
                    }
                }
                : null,
            initialBloom: bloom && typeof bloom === 'object'
                ? {
                    enabled: bloom.enabled,
                    strength: bloom.strength,
                    radius: bloom.radius,
                    threshold: bloom.threshold
                }
                : null,
            initialColorGrading: grading && typeof grading === 'object'
                ? {
                    preset: grading.preset,
                    intensity: grading.intensity
                }
                : null,
            initialSunFlare: sunFlare && typeof sunFlare === 'object'
                ? {
                    enabled: sunFlare.enabled,
                    preset: sunFlare.preset,
                    strength: sunFlare.strength
                }
                : null,
            initialPostProcessingActive: postActive,
            initialColorGradingDebug: gradingDebug,
            onCancel: () => this._cancel(),
            onLiveChange: (draft) => this._applyDraft(draft),
            onSave: (draft) => this._save(draft)
        });

        this._ui.mount();
        window.addEventListener('keydown', this._onKeyDown, { passive: false, capture: true });
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown, { capture: true });
        this._ui?.unmount?.();
        this._ui = null;
        this._original = null;
        document.body.classList.remove('options-dock-open');
        requestAnimationFrame(() => this.engine?.resize?.());
        document.activeElement?.blur?.();
    }

    _cancel() {
        this._restoreOriginal();
        if (this._overlay) {
            this.sm.popOverlay();
            return;
        }
        this.sm.go(this._returnTo || 'welcome');
    }

    _save(draft) {
        saveLightingSettings(draft?.lighting ?? null);
        saveBloomSettings(draft?.bloom ?? null);
        saveColorGradingSettings(draft?.colorGrading ?? null);
        saveSunFlareSettings(draft?.sunFlare ?? null);
        if (this._overlay) {
            this.sm.popOverlay();
            return;
        }
        this.sm.go(this._returnTo || 'welcome');
    }

    _restoreOriginal() {
        const src = this._original && typeof this._original === 'object' ? this._original : null;
        if (!src) return;
        this._applyDraft(src);
    }

    _applyDraft(draft) {
        const d = draft && typeof draft === 'object' ? draft : null;
        const lighting = d?.lighting ?? null;
        const bloom = d?.bloom ?? null;
        const grading = d?.colorGrading ?? null;
        const sunFlare = d?.sunFlare ?? null;

        this.engine?.setLightingSettings?.(lighting ?? null);
        if (bloom) this.engine?.setBloomSettings?.(bloom);
        if (grading) this.engine?.setColorGradingSettings?.(grading);

        const city = this.engine?.context?.city ?? null;
        if (lighting && city) {
            if (city?.hemi) city.hemi.intensity = lighting.hemiIntensity;
            if (city?.sun) city.sun.intensity = lighting.sunIntensity;
        }
        if (sunFlare && city?.sunFlare?.setSettings) {
            city.sunFlare.setSettings(sunFlare);
        }
    }

    _handleKeyDown(e) {
        const code = e.code;
        const key = e.key;
        if (isEditableTarget(e.target) && (code !== 'Escape' && key !== 'Escape')) return;

        const isEsc = code === 'Escape' || key === 'Escape';
        if (isEsc) {
            e.preventDefault();
            e.stopImmediatePropagation?.();
            this._cancel();
        }
    }
}
