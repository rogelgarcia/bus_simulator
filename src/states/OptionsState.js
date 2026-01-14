// src/states/OptionsState.js
// In-game options overlay state (tabbed, persisted settings).

import { OptionsUI } from '../graphics/gui/options/OptionsUI.js';
import { saveLightingSettings } from '../graphics/lighting/LightingSettings.js';

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
        this._ui = null;
        this._onKeyDown = (e) => this._handleKeyDown(e);
    }

    enter(params = {}) {
        const prev = typeof params?.returnTo === 'string' ? params.returnTo : null;
        this._returnTo = prev && prev !== 'options' ? prev : 'welcome';

        document.body.classList.remove('splash-bg');
        document.body.classList.remove('setup-bg');

        document.activeElement?.blur?.();

        const lighting = this.engine?.lightingSettings ?? null;

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
            onCancel: () => this._cancel(),
            onSave: (draft) => this._saveAndRestart(draft)
        });

        this._ui.mount();
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown);
        this._ui?.unmount?.();
        this._ui = null;
        document.activeElement?.blur?.();
    }

    _cancel() {
        this.sm.go(this._returnTo || 'welcome');
    }

    _saveAndRestart(draft) {
        saveLightingSettings(draft);
        this.engine.restart({ startState: 'welcome' });
    }

    _handleKeyDown(e) {
        const code = e.code;
        const key = e.key;
        if (isEditableTarget(e.target) && (code !== 'Escape' && key !== 'Escape')) return;

        const isEsc = code === 'Escape' || key === 'Escape';
        if (isEsc) {
            e.preventDefault();
            this._cancel();
        }
    }
}
