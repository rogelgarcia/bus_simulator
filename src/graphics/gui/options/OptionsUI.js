// src/graphics/gui/options/OptionsUI.js
// Tabbed Options UI overlay with persisted lighting controls.

import { getDefaultResolvedLightingSettings } from '../../lighting/LightingSettings.js';
import { getDefaultResolvedBloomSettings } from '../../visuals/postprocessing/BloomSettings.js';
import { getDefaultResolvedColorGradingSettings } from '../../visuals/postprocessing/ColorGradingSettings.js';
import { getColorGradingPresetOptions } from '../../visuals/postprocessing/ColorGradingPresets.js';
import { getDefaultResolvedSunFlareSettings } from '../../visuals/sun/SunFlareSettings.js';
import { getSunFlarePresetOptions } from '../../visuals/sun/SunFlarePresets.js';

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

function makeSelectRow({ label, value = '', options = [], onChange }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const select = document.createElement('select');
    select.className = 'options-select';

    for (const opt of Array.isArray(options) ? options : []) {
        const id = String(opt?.id ?? '');
        const text = String(opt?.label ?? id);
        if (!id) continue;
        const optionEl = document.createElement('option');
        optionEl.value = id;
        optionEl.textContent = text;
        select.appendChild(optionEl);
    }

    select.value = String(value ?? '');
    select.addEventListener('change', () => onChange?.(String(select.value)));

    right.appendChild(select);
    row.appendChild(left);
    row.appendChild(right);
    return { row, select };
}

function makeChoiceRow({ label, value = '', options = [], onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const group = makeEl('div', 'options-choice-group');
    const buttons = new Map();
    let current = String(value ?? '');

    const setActive = (id) => {
        const next = String(id ?? '');
        if (!buttons.has(next)) return;
        current = next;
        for (const [key, btn] of buttons.entries()) btn.classList.toggle('is-active', key === next);
    };

    for (const opt of Array.isArray(options) ? options : []) {
        const id = String(opt?.id ?? '');
        const text = String(opt?.label ?? id);
        if (!id) continue;
        const btn = makeEl('button', 'options-choice-btn', text);
        btn.type = 'button';
        btn.addEventListener('click', () => {
            setActive(id);
            onChange?.(id);
        });
        group.appendChild(btn);
        buttons.set(id, btn);
    }

    if (!buttons.has(current)) current = buttons.keys().next().value ?? '';
    setActive(current);

    right.appendChild(group);
    row.appendChild(left);
    row.appendChild(right);
    return {
        row,
        group,
        buttons: Array.from(buttons.values()),
        getValue: () => current,
        setValue: (id) => setActive(id),
        setDisabled: (disabled) => {
            const off = !!disabled;
            for (const btn of buttons.values()) btn.disabled = off;
        }
    };
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

function makeValueRow({ label, value = '' }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');
    const text = makeEl('div', null, value);
    right.appendChild(text);
    row.appendChild(left);
    row.appendChild(right);
    return { row, text };
}

export class OptionsUI {
    constructor({
        initialTab = 'lighting',
        initialLighting = null,
        initialBloom = null,
        initialColorGrading = null,
        initialSunFlare = null,
        initialPostProcessingActive = null,
        initialColorGradingDebug = null,
        onCancel = null,
        onLiveChange = null,
        onSave = null
    } = {}) {
        this.onCancel = onCancel;
        this.onLiveChange = onLiveChange;
        this.onSave = onSave;
        this._initialPostProcessingActive = initialPostProcessingActive !== null ? !!initialPostProcessingActive : null;
        this._initialColorGradingDebug = initialColorGradingDebug && typeof initialColorGradingDebug === 'object'
            ? JSON.parse(JSON.stringify(initialColorGradingDebug))
            : null;

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
        this.saveBtn = makeEl('button', 'options-btn options-btn-primary', 'Save');
        this.resetBtn.type = 'button';
        this.cancelBtn.type = 'button';
        this.saveBtn.type = 'button';

        this.resetBtn.addEventListener('click', () => this.resetToDefaults());
        this.cancelBtn.addEventListener('click', () => this.onCancel?.());
        this.saveBtn.addEventListener('click', () => this.onSave?.(this.getDraft()));

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
        this._draftBloom = initialBloom && typeof initialBloom === 'object'
            ? JSON.parse(JSON.stringify(initialBloom))
            : null;
        this._draftColorGrading = initialColorGrading && typeof initialColorGrading === 'object'
            ? JSON.parse(JSON.stringify(initialColorGrading))
            : null;
        this._draftSunFlare = initialSunFlare && typeof initialSunFlare === 'object'
            ? JSON.parse(JSON.stringify(initialSunFlare))
            : null;
        this._lightingControls = null;

        this.setTab(this._tab);
    }

    _emitLiveChange() {
        this.onLiveChange?.(this.getDraft());
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

    _ensureDraftBloom() {
        if (this._draftBloom) return;
        const d = getDefaultResolvedBloomSettings();
        this._draftBloom = {
            enabled: d.enabled,
            strength: d.strength,
            radius: d.radius,
            threshold: d.threshold
        };
    }

    _ensureDraftColorGrading() {
        if (this._draftColorGrading) return;
        const d = getDefaultResolvedColorGradingSettings();
        this._draftColorGrading = {
            preset: d.preset,
            intensity: d.intensity
        };
    }

    _ensureDraftSunFlare() {
        if (this._draftSunFlare) return;
        const d = getDefaultResolvedSunFlareSettings();
        this._draftSunFlare = {
            enabled: d.enabled,
            preset: d.preset,
            strength: d.strength
        };
    }

    _renderLightingTab() {
        this._ensureDraftLighting();
        this._ensureDraftBloom();
        this._ensureDraftColorGrading();
        this._ensureDraftSunFlare();

        const sectionIbl = makeEl('div', 'options-section');
        sectionIbl.appendChild(makeEl('div', 'options-section-title', 'IBL'));

        const sectionLighting = makeEl('div', 'options-section');
        sectionLighting.appendChild(makeEl('div', 'options-section-title', 'Renderer + Lights'));

        const d = this._draftLighting;
        const bloom = this._draftBloom;
        const grading = this._draftColorGrading;
        const sunFlare = this._draftSunFlare;
        const emit = () => this._emitLiveChange();
        let syncGradeEnabled = () => {};
        const controls = {
            iblEnabled: makeToggleRow({
                label: 'IBL enabled',
                value: d.ibl.enabled,
                onChange: (v) => { d.ibl.enabled = v; emit(); }
            }),
            iblIntensity: makeNumberSliderRow({
                label: 'IBL intensity (envMapIntensity)',
                value: d.ibl.envMapIntensity,
                min: 0,
                max: 5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { d.ibl.envMapIntensity = v; emit(); }
            }),
            iblBackground: makeToggleRow({
                label: 'IBL background (setBackground)',
                value: d.ibl.setBackground,
                onChange: (v) => { d.ibl.setBackground = v; emit(); }
            }),
            exposure: makeNumberSliderRow({
                label: 'Tone mapping exposure',
                value: d.exposure,
                min: 0.1,
                max: 5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { d.exposure = v; emit(); }
            }),
            hemi: makeNumberSliderRow({
                label: 'Hemisphere intensity',
                value: d.hemiIntensity,
                min: 0,
                max: 5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { d.hemiIntensity = v; emit(); }
            }),
            sun: makeNumberSliderRow({
                label: 'Sun intensity',
                value: d.sunIntensity,
                min: 0,
                max: 10,
                step: 0.01,
                digits: 2,
                onChange: (v) => { d.sunIntensity = v; emit(); }
            }),
            bloomEnabled: makeToggleRow({
                label: 'Bloom (glow)',
                value: bloom.enabled,
                onChange: (v) => { bloom.enabled = v; emit(); }
            }),
            bloomStrength: makeNumberSliderRow({
                label: 'Bloom strength',
                value: bloom.strength,
                min: 0,
                max: 3,
                step: 0.01,
                digits: 2,
                onChange: (v) => { bloom.strength = v; emit(); }
            }),
            bloomRadius: makeNumberSliderRow({
                label: 'Bloom radius',
                value: bloom.radius,
                min: 0,
                max: 1,
                step: 0.01,
                digits: 2,
                onChange: (v) => { bloom.radius = v; emit(); }
            }),
            bloomThreshold: makeNumberSliderRow({
                label: 'Bloom threshold (HDR)',
                value: bloom.threshold,
                min: 0,
                max: 5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { bloom.threshold = v; emit(); }
            }),
            sunFlareEnabled: makeToggleRow({
                label: 'Sun flare (lens flare)',
                value: sunFlare.enabled,
                onChange: (v) => { sunFlare.enabled = v; emit(); }
            }),
            sunFlarePreset: makeChoiceRow({
                label: 'Sun flare preset',
                value: sunFlare.preset,
                options: getSunFlarePresetOptions(),
                onChange: (v) => { sunFlare.preset = v; emit(); }
            }),
            sunFlareStrength: makeNumberSliderRow({
                label: 'Sun flare strength',
                value: sunFlare.strength,
                min: 0,
                max: 2,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunFlare.strength = v; emit(); }
            }),
            gradePreset: makeChoiceRow({
                label: 'Color grading (LUT)',
                value: grading.preset,
                options: getColorGradingPresetOptions(),
                onChange: (v) => {
                    grading.preset = v;
                    syncGradeEnabled(v);
                    emit();
                }
            }),
            gradeIntensity: makeNumberSliderRow({
                label: 'Color grading intensity',
                value: grading.intensity,
                min: 0,
                max: 1,
                step: 0.01,
                digits: 2,
                onChange: (v) => { grading.intensity = v; emit(); }
            })
        };

        sectionIbl.appendChild(controls.iblEnabled.row);
        sectionIbl.appendChild(controls.iblIntensity.row);
        sectionIbl.appendChild(controls.iblBackground.row);

        sectionLighting.appendChild(controls.exposure.row);
        sectionLighting.appendChild(controls.hemi.row);
        sectionLighting.appendChild(controls.sun.row);

        const sectionPost = makeEl('div', 'options-section');
        sectionPost.appendChild(makeEl('div', 'options-section-title', 'Post-processing'));
        if (this._initialPostProcessingActive !== null) {
            sectionPost.appendChild(makeValueRow({
                label: 'Post-processing pipeline (active now)',
                value: this._initialPostProcessingActive ? 'On (composer)' : 'Off (direct)'
            }).row);
        }
        if (this._initialColorGradingDebug) {
            const requested = String(this._initialColorGradingDebug.requestedPreset ?? 'off');
            const intensity = Number.isFinite(this._initialColorGradingDebug.intensity) ? this._initialColorGradingDebug.intensity : 0;
            const hasLut = !!this._initialColorGradingDebug.hasLut;
            sectionPost.appendChild(makeValueRow({
                label: 'Color grading (active now)',
                value: (requested === 'off' || intensity <= 0)
                    ? 'Off'
                    : `${requested} (${intensity.toFixed(2)})${hasLut ? '' : ' (loading)'}`
            }).row);
        }
        sectionPost.appendChild(controls.bloomEnabled.row);
        sectionPost.appendChild(controls.bloomStrength.row);
        sectionPost.appendChild(controls.bloomRadius.row);
        sectionPost.appendChild(controls.bloomThreshold.row);
        sectionPost.appendChild(controls.sunFlareEnabled.row);
        sectionPost.appendChild(controls.sunFlarePreset.row);
        sectionPost.appendChild(controls.sunFlareStrength.row);
        sectionPost.appendChild(controls.gradePreset.row);
        sectionPost.appendChild(controls.gradeIntensity.row);

        const syncBloomEnabled = (enabled) => {
            const off = !enabled;
            controls.bloomStrength.range.disabled = off;
            controls.bloomStrength.number.disabled = off;
            controls.bloomRadius.range.disabled = off;
            controls.bloomRadius.number.disabled = off;
            controls.bloomThreshold.range.disabled = off;
            controls.bloomThreshold.number.disabled = off;
        };
        syncBloomEnabled(!!bloom.enabled);
        controls.bloomEnabled.toggle.addEventListener('change', () => syncBloomEnabled(!!controls.bloomEnabled.toggle.checked));

        syncGradeEnabled = (presetId) => {
            const off = String(presetId ?? '').trim().toLowerCase() === 'off';
            controls.gradeIntensity.range.disabled = off;
            controls.gradeIntensity.number.disabled = off;
        };
        syncGradeEnabled(controls.gradePreset.getValue());

        const syncSunFlareEnabled = (enabled) => {
            const off = !enabled;
            controls.sunFlarePreset.setDisabled(off);
            controls.sunFlareStrength.range.disabled = off;
            controls.sunFlareStrength.number.disabled = off;
        };
        syncSunFlareEnabled(!!sunFlare.enabled);
        controls.sunFlareEnabled.toggle.addEventListener('change', () => syncSunFlareEnabled(!!controls.sunFlareEnabled.toggle.checked));

        const note = makeEl('div', 'options-note');
        note.textContent = 'URL params override saved settings (e.g. ibl, iblIntensity, iblBackground, bloom, sunFlare, grade). Bloom affects only bright pixels; raise threshold to reduce glow.';

        this.body.appendChild(sectionIbl);
        this.body.appendChild(sectionLighting);
        this.body.appendChild(sectionPost);
        this.body.appendChild(note);

        this._lightingControls = controls;
    }

    resetToDefaults() {
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

        const bloom = getDefaultResolvedBloomSettings();
        this._draftBloom = {
            enabled: bloom.enabled,
            strength: bloom.strength,
            radius: bloom.radius,
            threshold: bloom.threshold
        };

        const grade = getDefaultResolvedColorGradingSettings();
        this._draftColorGrading = {
            preset: grade.preset,
            intensity: grade.intensity
        };

        const sunFlare = getDefaultResolvedSunFlareSettings();
        this._draftSunFlare = {
            enabled: sunFlare.enabled,
            preset: sunFlare.preset,
            strength: sunFlare.strength
        };
        this._renderTab();
        this._emitLiveChange();
    }

    getDraft() {
        this._ensureDraftLighting();
        this._ensureDraftBloom();
        this._ensureDraftColorGrading();
        this._ensureDraftSunFlare();
        const d = this._draftLighting;
        const bloom = this._draftBloom;
        const grade = this._draftColorGrading;
        const sunFlare = this._draftSunFlare;
        return {
            lighting: {
                exposure: d.exposure,
                hemiIntensity: d.hemiIntensity,
                sunIntensity: d.sunIntensity,
                ibl: {
                    enabled: !!d.ibl.enabled,
                    envMapIntensity: d.ibl.envMapIntensity,
                    setBackground: !!d.ibl.setBackground
                }
            },
            bloom: {
                enabled: !!bloom.enabled,
                strength: bloom.strength,
                radius: bloom.radius,
                threshold: bloom.threshold
            },
            colorGrading: {
                preset: String(grade.preset ?? 'off'),
                intensity: grade.intensity
            },
            sunFlare: {
                enabled: !!sunFlare.enabled,
                preset: String(sunFlare.preset ?? 'subtle'),
                strength: sunFlare.strength
            }
        };
    }
}
