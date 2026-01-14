// src/graphics/gui/options/OptionsUI.js
// Tabbed Options UI overlay with persisted lighting controls.

import { getDefaultResolvedLightingSettings } from '../../lighting/LightingSettings.js';

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function makeToggleRow({ label, value = false, onChange }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !!value;
    toggle.className = 'options-toggle';
    toggle.addEventListener('change', () => onChange?.(!!toggle.checked));

    right.appendChild(toggle);
    row.appendChild(left);
    row.appendChild(right);
    return { row, toggle };
}

function makeNumberSliderRow({ label, value = 0, min = 0, max = 1, step = 0.01, digits = 2, onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(clamp(value, min, max));
    range.className = 'options-range';

    const number = document.createElement('input');
    number.type = 'number';
    number.min = String(min);
    number.max = String(max);
    number.step = String(step);
    number.value = String(clamp(value, min, max).toFixed(digits));
    number.className = 'options-number';

    const emit = (raw) => {
        const next = clamp(raw, min, max);
        range.value = String(next);
        number.value = String(next.toFixed(digits));
        onChange?.(next);
    };

    range.addEventListener('input', () => emit(Number(range.value)));
    number.addEventListener('input', () => emit(Number(number.value)));

    right.appendChild(range);
    right.appendChild(number);
    row.appendChild(left);
    row.appendChild(right);
    return { row, range, number };
}

export class OptionsUI {
    constructor({
        initialTab = 'lighting',
        initialLighting = null,
        onCancel = null,
        onSave = null
    } = {}) {
        this.onCancel = onCancel;
        this.onSave = onSave;

        this.root = makeEl('div', 'ui-layer options-layer');
        this.root.id = 'ui-options';

        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        const title = makeEl('div', 'options-title', 'Options');
        const subtitle = makeEl('div', 'options-subtitle', '0 opens options · Esc closes');
        header.appendChild(title);
        header.appendChild(subtitle);

        this.tabs = makeEl('div', 'options-tabs');
        this.tabButtons = {
            lighting: makeEl('button', 'options-tab', 'Lighting'),
            gameplay: makeEl('button', 'options-tab', 'Gameplay')
        };

        for (const [key, btn] of Object.entries(this.tabButtons)) {
            btn.type = 'button';
            btn.addEventListener('click', () => this.setTab(key));
            this.tabs.appendChild(btn);
        }

        this.body = makeEl('div', 'options-body');

        this.footer = makeEl('div', 'options-footer');
        this.resetBtn = makeEl('button', 'options-btn', 'Reset');
        this.cancelBtn = makeEl('button', 'options-btn', 'Cancel');
        this.saveBtn = makeEl('button', 'options-btn options-btn-primary', 'Save & Restart');
        this.resetBtn.type = 'button';
        this.cancelBtn.type = 'button';
        this.saveBtn.type = 'button';

        this.resetBtn.addEventListener('click', () => this.resetLightingToDefaults());
        this.cancelBtn.addEventListener('click', () => this.onCancel?.());
        this.saveBtn.addEventListener('click', () => this.onSave?.(this.getDraftLighting()));

        this.footer.appendChild(this.resetBtn);
        this.footer.appendChild(this.cancelBtn);
        this.footer.appendChild(this.saveBtn);

        this.panel.appendChild(header);
        this.panel.appendChild(this.tabs);
        this.panel.appendChild(this.body);
        this.panel.appendChild(this.footer);
        this.root.appendChild(this.panel);

        this._tab = initialTab === 'gameplay' ? 'gameplay' : 'lighting';
        this._draftLighting = initialLighting && typeof initialLighting === 'object'
            ? JSON.parse(JSON.stringify(initialLighting))
            : null;
        this._lightingControls = null;

        this.setTab(this._tab);
    }

    mount() {
        if (!this.root.isConnected) document.body.appendChild(this.root);
        this.panel?.focus?.();
    }

    unmount() {
        this.root.remove();
    }

    setTab(key) {
        const next = key === 'gameplay' ? 'gameplay' : 'lighting';
        this._tab = next;
        for (const [k, btn] of Object.entries(this.tabButtons)) btn.classList.toggle('is-active', k === next);
        this._renderTab();
    }

    _renderTab() {
        this.body.textContent = '';
        if (this._tab === 'lighting') return this._renderLightingTab();
        return this._renderPlaceholderTab();
    }

    _renderPlaceholderTab() {
        const wrap = makeEl('div', 'options-placeholder');
        wrap.appendChild(makeEl('div', 'options-placeholder-title', 'Coming soon'));
        wrap.appendChild(makeEl('div', 'options-placeholder-text', 'Additional settings will live here.'));
        this.body.appendChild(wrap);
    }

    _ensureDraftLighting() {
        if (this._draftLighting) return;
        const d = getDefaultResolvedLightingSettings();
        this._draftLighting = {
            exposure: d.exposure,
            hemiIntensity: d.hemiIntensity,
            sunIntensity: d.sunIntensity,
            ibl: {
                enabled: d.ibl.enabled,
                envMapIntensity: d.ibl.envMapIntensity,
                setBackground: d.ibl.setBackground
            }
        };
    }

    _renderLightingTab() {
        this._ensureDraftLighting();

        const sectionIbl = makeEl('div', 'options-section');
        sectionIbl.appendChild(makeEl('div', 'options-section-title', 'IBL'));

        const sectionLighting = makeEl('div', 'options-section');
        sectionLighting.appendChild(makeEl('div', 'options-section-title', 'Renderer + Lights'));

        const d = this._draftLighting;
        const controls = {
            iblEnabled: makeToggleRow({
                label: 'IBL enabled',
                value: d.ibl.enabled,
                onChange: (v) => { d.ibl.enabled = v; }
            }),
            iblIntensity: makeNumberSliderRow({
                label: 'IBL intensity (envMapIntensity)',
                value: d.ibl.envMapIntensity,
                min: 0,
                max: 5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { d.ibl.envMapIntensity = v; }
            }),
            iblBackground: makeToggleRow({
                label: 'IBL background (setBackground)',
                value: d.ibl.setBackground,
                onChange: (v) => { d.ibl.setBackground = v; }
            }),
            exposure: makeNumberSliderRow({
                label: 'Tone mapping exposure',
                value: d.exposure,
                min: 0.1,
                max: 5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { d.exposure = v; }
            }),
            hemi: makeNumberSliderRow({
                label: 'Hemisphere intensity',
                value: d.hemiIntensity,
                min: 0,
                max: 5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { d.hemiIntensity = v; }
            }),
            sun: makeNumberSliderRow({
                label: 'Sun intensity',
                value: d.sunIntensity,
                min: 0,
                max: 10,
                step: 0.01,
                digits: 2,
                onChange: (v) => { d.sunIntensity = v; }
            })
        };

        sectionIbl.appendChild(controls.iblEnabled.row);
        sectionIbl.appendChild(controls.iblIntensity.row);
        sectionIbl.appendChild(controls.iblBackground.row);

        sectionLighting.appendChild(controls.exposure.row);
        sectionLighting.appendChild(controls.hemi.row);
        sectionLighting.appendChild(controls.sun.row);

        const note = makeEl('div', 'options-note');
        note.textContent = 'URL params override saved settings (e.g. ibl, iblIntensity, iblBackground).';

        this.body.appendChild(sectionIbl);
        this.body.appendChild(sectionLighting);
        this.body.appendChild(note);

        this._lightingControls = controls;
    }

    resetLightingToDefaults() {
        const d = getDefaultResolvedLightingSettings();
        this._draftLighting = {
            exposure: d.exposure,
            hemiIntensity: d.hemiIntensity,
            sunIntensity: d.sunIntensity,
            ibl: {
                enabled: d.ibl.enabled,
                envMapIntensity: d.ibl.envMapIntensity,
                setBackground: d.ibl.setBackground
            }
        };
        this._renderTab();
    }

    getDraftLighting() {
        this._ensureDraftLighting();
        const d = this._draftLighting;
        return {
            exposure: d.exposure,
            hemiIntensity: d.hemiIntensity,
            sunIntensity: d.sunIntensity,
            ibl: {
                enabled: !!d.ibl.enabled,
                envMapIntensity: d.ibl.envMapIntensity,
                setBackground: !!d.ibl.setBackground
            }
        };
    }
}
