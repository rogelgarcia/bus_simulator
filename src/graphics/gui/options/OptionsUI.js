// src/graphics/gui/options/OptionsUI.js
// Tabbed Options UI overlay with persisted lighting controls.

import { getDefaultResolvedLightingSettings } from '../../lighting/LightingSettings.js';
import { getDefaultResolvedBloomSettings } from '../../visuals/postprocessing/BloomSettings.js';
import { getDefaultResolvedColorGradingSettings } from '../../visuals/postprocessing/ColorGradingSettings.js';
import { getColorGradingPresetOptions } from '../../visuals/postprocessing/ColorGradingPresets.js';
import { getDefaultResolvedBuildingWindowVisualsSettings } from '../../visuals/buildings/BuildingWindowVisualsSettings.js';
import { getDefaultResolvedAsphaltNoiseSettings } from '../../visuals/city/AsphaltNoiseSettings.js';
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

    const wrap = makeEl('label', 'options-toggle-switch');
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !!value;
    toggle.className = 'options-toggle';
    toggle.addEventListener('change', () => onChange?.(!!toggle.checked));

    const ui = makeEl('span', 'options-toggle-ui');
    wrap.appendChild(toggle);
    wrap.appendChild(ui);

    right.appendChild(wrap);
    row.appendChild(left);
    row.appendChild(right);
    return { row, toggle, ui, wrap };
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
        initialBuildingWindowVisuals = null,
        initialAsphaltNoise = null,
        initialSunFlare = null,
        initialPostProcessingActive = null,
        initialColorGradingDebug = null,
        getIblDebugInfo = null,
        getPostProcessingDebugInfo = null,
        onCancel = null,
        onLiveChange = null,
        onSave = null
    } = {}) {
        this.onCancel = onCancel;
        this.onLiveChange = onLiveChange;
        this.onSave = onSave;
        this._getIblDebugInfo = typeof getIblDebugInfo === 'function' ? getIblDebugInfo : null;
        this._getPostProcessingDebugInfo = typeof getPostProcessingDebugInfo === 'function' ? getPostProcessingDebugInfo : null;
        this._iblDebugEls = null;
        this._postDebugEls = null;
        this._debugInterval = null;
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
            asphalt: makeEl('button', 'options-tab', 'Asphalt'),
            buildings: makeEl('button', 'options-tab', 'Buildings')
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

        this._tab = (initialTab === 'buildings' || initialTab === 'gameplay')
            ? 'buildings'
            : (initialTab === 'asphalt' ? 'asphalt' : 'lighting');
        this._draftLighting = initialLighting && typeof initialLighting === 'object'
            ? JSON.parse(JSON.stringify(initialLighting))
            : null;
        this._draftBloom = initialBloom && typeof initialBloom === 'object'
            ? JSON.parse(JSON.stringify(initialBloom))
            : null;
        this._draftColorGrading = initialColorGrading && typeof initialColorGrading === 'object'
            ? JSON.parse(JSON.stringify(initialColorGrading))
            : null;
        this._draftBuildingWindowVisuals = initialBuildingWindowVisuals && typeof initialBuildingWindowVisuals === 'object'
            ? JSON.parse(JSON.stringify(initialBuildingWindowVisuals))
            : null;
        this._draftAsphaltNoise = initialAsphaltNoise && typeof initialAsphaltNoise === 'object'
            ? JSON.parse(JSON.stringify(initialAsphaltNoise))
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
        this._startDebugRefresh();
    }

    unmount() {
        this._stopDebugRefresh();
        this.root.remove();
    }

    setTab(key) {
        const next = (key === 'buildings' || key === 'gameplay')
            ? 'buildings'
            : (key === 'asphalt' ? 'asphalt' : 'lighting');
        this._tab = next;
        for (const [k, btn] of Object.entries(this.tabButtons)) btn.classList.toggle('is-active', k === next);
        this._renderTab();
    }

    _renderTab() {
        this._iblDebugEls = null;
        this._postDebugEls = null;
        this.body.textContent = '';
        if (this._tab === 'lighting') return this._renderLightingTab();
        if (this._tab === 'asphalt') return this._renderAsphaltTab();
        return this._renderBuildingsTab();
    }

    _startDebugRefresh() {
        if (this._debugInterval) return;
        if (!this._getIblDebugInfo && !this._getPostProcessingDebugInfo) return;
        this._debugInterval = window.setInterval(() => this._refreshDebug(), 250);
    }

    _stopDebugRefresh() {
        if (!this._debugInterval) return;
        window.clearInterval(this._debugInterval);
        this._debugInterval = null;
    }

    _refreshDebug() {
        this._refreshIblDebug();
        this._refreshPostProcessingDebug();
    }

    _refreshIblDebug() {
        const els = this._iblDebugEls;
        if (!els || !this._getIblDebugInfo) return;

        const info = this._getIblDebugInfo() ?? null;
        const enabled = !!info?.enabled;
        const envLoaded = !!info?.envMapLoaded;
        const fallback = !!info?.usingFallbackEnvMap;
        const sceneEnv = !!info?.sceneHasEnvironment;
        const sceneMatch = !!info?.sceneEnvironmentMatches;
        const hdrUrl = typeof info?.hdrUrl === 'string' ? info.hdrUrl : null;
        const intensity = Number.isFinite(info?.envMapIntensity) ? Number(info.envMapIntensity) : null;

        els.envMap.textContent = !enabled ? 'Disabled' : (envLoaded ? (fallback ? 'Loaded (fallback)' : 'Loaded') : 'Loading…');
        els.sceneEnv.textContent = sceneEnv ? 'Set' : 'Null';
        els.sceneMatch.textContent = sceneMatch ? 'Yes' : 'No';
        els.hdrUrl.textContent = hdrUrl ?? '-';
        els.intensity.textContent = intensity !== null ? intensity.toFixed(2) : '-';
    }

    _refreshPostProcessingDebug() {
        const els = this._postDebugEls;
        if (!els || !this._getPostProcessingDebugInfo) return;

        const info = this._getPostProcessingDebugInfo() ?? null;
        const postActive = !!info?.postActive;
        els.pipeline.textContent = postActive ? 'On (composer)' : 'Off (direct)';

        const bloom = info?.bloom ?? null;
        if (bloom && typeof bloom === 'object') {
            const enabled = !!bloom.enabled;
            const strength = Number.isFinite(bloom.strength) ? bloom.strength : null;
            const threshold = Number.isFinite(bloom.threshold) ? bloom.threshold : null;
            els.bloom.textContent = enabled
                ? `On${strength !== null ? ` (strength ${strength.toFixed(2)})` : ''}${threshold !== null ? ` (threshold ${threshold.toFixed(2)})` : ''}`
                : 'Off';
        } else {
            els.bloom.textContent = '-';
        }

        const grade = info?.colorGrading ?? null;
        if (grade && typeof grade === 'object') {
            const requested = String(grade.requestedPreset ?? 'off');
            const intensity = Number.isFinite(grade.intensity) ? grade.intensity : 0;
            const status = String(grade.status ?? 'off');
            const supported = grade.supported !== undefined ? !!grade.supported : true;
            const hasLut = !!grade.hasLut;
            if (!supported) {
                els.grading.textContent = 'Unsupported (WebGL2 required)';
            } else if (requested === 'off' || intensity <= 0) {
                els.grading.textContent = 'Off';
            } else if (!hasLut && status === 'loading') {
                els.grading.textContent = `${requested} (${intensity.toFixed(2)}) (loading)`;
            } else if (!hasLut && status === 'error') {
                els.grading.textContent = `${requested} (${intensity.toFixed(2)}) (error)`;
            } else {
                els.grading.textContent = `${requested} (${intensity.toFixed(2)})`;
            }
        } else {
            els.grading.textContent = '-';
        }
    }

    _ensureDraftAsphaltNoise() {
        if (this._draftAsphaltNoise) return;
        const d = getDefaultResolvedAsphaltNoiseSettings();
        this._draftAsphaltNoise = {
            coarse: { ...d.coarse },
            fine: { ...d.fine }
        };
    }

    _ensureDraftBuildingWindowVisuals() {
        if (this._draftBuildingWindowVisuals) return;
        const d = getDefaultResolvedBuildingWindowVisualsSettings();
        this._draftBuildingWindowVisuals = {
            reflective: {
                enabled: d.reflective.enabled,
                glass: {
                    colorHex: d.reflective.glass?.colorHex,
                    metalness: d.reflective.glass?.metalness,
                    roughness: d.reflective.glass?.roughness,
                    transmission: d.reflective.glass?.transmission,
                    ior: d.reflective.glass?.ior,
                    envMapIntensity: d.reflective.glass?.envMapIntensity
                }
            }
        };
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

    _renderAsphaltTab() {
        this._ensureDraftAsphaltNoise();

        const d = this._draftAsphaltNoise;
        const coarse = d.coarse ?? (d.coarse = {});
        const fine = d.fine ?? (d.fine = {});
        const emit = () => this._emitLiveChange();

        const sectionCoarse = makeEl('div', 'options-section');
        sectionCoarse.appendChild(makeEl('div', 'options-section-title', 'Coarse'));

        const coarseControls = {
            albedo: makeToggleRow({
                label: 'Coarse affects albedo',
                value: coarse.albedo,
                onChange: (v) => { coarse.albedo = v; emit(); }
            }),
            roughness: makeToggleRow({
                label: 'Coarse affects roughness',
                value: coarse.roughness,
                onChange: (v) => { coarse.roughness = v; emit(); }
            }),
            scale: makeNumberSliderRow({
                label: 'Coarse scale',
                value: coarse.scale ?? 0.07,
                min: 0.001,
                max: 5,
                step: 0.001,
                digits: 3,
                onChange: (v) => { coarse.scale = v; emit(); }
            }),
            colorStrength: makeNumberSliderRow({
                label: 'Coarse color strength',
                value: coarse.colorStrength ?? 0.18,
                min: 0,
                max: 0.5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { coarse.colorStrength = v; emit(); }
            }),
            dirtyStrength: makeNumberSliderRow({
                label: 'Coarse dirty strength',
                value: coarse.dirtyStrength ?? 0.18,
                min: 0,
                max: 1,
                step: 0.01,
                digits: 2,
                onChange: (v) => { coarse.dirtyStrength = v; emit(); }
            }),
            roughnessStrength: makeNumberSliderRow({
                label: 'Coarse roughness strength',
                value: coarse.roughnessStrength ?? 0.28,
                min: 0,
                max: 0.5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { coarse.roughnessStrength = v; emit(); }
            })
        };

        sectionCoarse.appendChild(coarseControls.albedo.row);
        sectionCoarse.appendChild(coarseControls.roughness.row);
        sectionCoarse.appendChild(coarseControls.scale.row);
        sectionCoarse.appendChild(coarseControls.colorStrength.row);
        sectionCoarse.appendChild(coarseControls.dirtyStrength.row);
        sectionCoarse.appendChild(coarseControls.roughnessStrength.row);

        const sectionFine = makeEl('div', 'options-section');
        sectionFine.appendChild(makeEl('div', 'options-section-title', 'Fine'));

        const fineControls = {
            albedo: makeToggleRow({
                label: 'Fine affects albedo',
                value: fine.albedo,
                onChange: (v) => { fine.albedo = v; emit(); }
            }),
            roughness: makeToggleRow({
                label: 'Fine affects roughness',
                value: fine.roughness,
                onChange: (v) => { fine.roughness = v; emit(); }
            }),
            normal: makeToggleRow({
                label: 'Fine affects normal',
                value: fine.normal,
                onChange: (v) => { fine.normal = v; emit(); }
            }),
            scale: makeNumberSliderRow({
                label: 'Fine scale',
                value: fine.scale ?? 12.0,
                min: 0.1,
                max: 15,
                step: 0.1,
                digits: 1,
                onChange: (v) => { fine.scale = v; emit(); }
            }),
            colorStrength: makeNumberSliderRow({
                label: 'Fine color strength',
                value: fine.colorStrength ?? 0.06,
                min: 0,
                max: 0.5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { fine.colorStrength = v; emit(); }
            }),
            dirtyStrength: makeNumberSliderRow({
                label: 'Fine dirty strength',
                value: fine.dirtyStrength ?? 0.0,
                min: 0,
                max: 1,
                step: 0.01,
                digits: 2,
                onChange: (v) => { fine.dirtyStrength = v; emit(); }
            }),
            roughnessStrength: makeNumberSliderRow({
                label: 'Fine roughness strength',
                value: fine.roughnessStrength ?? 0.16,
                min: 0,
                max: 0.5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { fine.roughnessStrength = v; emit(); }
            }),
            normalStrength: makeNumberSliderRow({
                label: 'Fine normal strength',
                value: fine.normalStrength ?? 0.35,
                min: 0,
                max: 2,
                step: 0.01,
                digits: 2,
                onChange: (v) => { fine.normalStrength = v; emit(); }
            })
        };

        sectionFine.appendChild(fineControls.albedo.row);
        sectionFine.appendChild(fineControls.roughness.row);
        sectionFine.appendChild(fineControls.normal.row);
        sectionFine.appendChild(fineControls.scale.row);
        sectionFine.appendChild(fineControls.colorStrength.row);
        sectionFine.appendChild(fineControls.dirtyStrength.row);
        sectionFine.appendChild(fineControls.roughnessStrength.row);
        sectionFine.appendChild(fineControls.normalStrength.row);

        const note = makeEl('div', 'options-note');
        note.textContent = 'Coarse drives large-area variation; Fine adds grain. Changes apply live to road asphalt materials.';

        this.body.appendChild(sectionCoarse);
        this.body.appendChild(sectionFine);
        this.body.appendChild(note);
    }

    _renderBuildingsTab() {
        this._ensureDraftBuildingWindowVisuals();
        this._ensureDraftLighting();

        const sectionBuildings = makeEl('div', 'options-section');
        sectionBuildings.appendChild(makeEl('div', 'options-section-title', 'Buildings'));

        const d = this._draftBuildingWindowVisuals;
        const glass = d.reflective.glass ?? (d.reflective.glass = {});
        const emit = () => this._emitLiveChange();
        const controls = {
            reflective: makeToggleRow({
                label: 'Reflective building windows',
                value: d.reflective.enabled,
                onChange: (v) => { d.reflective.enabled = v; emit(); }
            }),
            glassEnvMapIntensity: makeNumberSliderRow({
                label: 'Window glass envMapIntensity',
                value: glass.envMapIntensity ?? 4.0,
                min: 0,
                max: 5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { glass.envMapIntensity = v; emit(); }
            }),
            glassRoughness: makeNumberSliderRow({
                label: 'Window glass roughness',
                value: glass.roughness ?? 0.02,
                min: 0,
                max: 1,
                step: 0.01,
                digits: 2,
                onChange: (v) => { glass.roughness = v; emit(); }
            }),
            glassTransmission: makeNumberSliderRow({
                label: 'Window glass transmission',
                value: glass.transmission ?? 0.0,
                min: 0,
                max: 1,
                step: 0.01,
                digits: 2,
                onChange: (v) => { glass.transmission = v; emit(); }
            }),
            glassIor: makeNumberSliderRow({
                label: 'Window glass ior',
                value: glass.ior ?? 2.2,
                min: 1,
                max: 2.5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { glass.ior = v; emit(); }
            }),
            glassMetalness: makeNumberSliderRow({
                label: 'Window glass metalness',
                value: glass.metalness ?? 0.0,
                min: 0,
                max: 1,
                step: 0.01,
                digits: 2,
                onChange: (v) => { glass.metalness = v; emit(); }
            })
        };

        sectionBuildings.appendChild(controls.reflective.row);
        sectionBuildings.appendChild(controls.glassEnvMapIntensity.row);
        sectionBuildings.appendChild(controls.glassRoughness.row);
        sectionBuildings.appendChild(controls.glassTransmission.row);
        sectionBuildings.appendChild(controls.glassIor.row);
        sectionBuildings.appendChild(controls.glassMetalness.row);

        const syncReflectiveEnabled = (enabled) => {
            const off = !enabled;
            for (const entry of [
                controls.glassEnvMapIntensity,
                controls.glassRoughness,
                controls.glassTransmission,
                controls.glassIor,
                controls.glassMetalness
            ]) {
                entry.range.disabled = off;
                entry.number.disabled = off;
            }
        };
        syncReflectiveEnabled(!!d.reflective.enabled);
        controls.reflective.toggle.addEventListener('change', () => syncReflectiveEnabled(!!controls.reflective.toggle.checked));

        if (!this._draftLighting?.ibl?.enabled) {
            const warn = makeEl('div', 'options-note');
            warn.textContent = 'IBL is disabled. Reflective windows need IBL (Lighting tab) to show reflections.';
            sectionBuildings.appendChild(warn);
        }

        const note = makeEl('div', 'options-note');
        note.textContent = 'Building window visuals apply when buildings are (re)generated. Save, then rebuild the scene (re-enter Gameplay/Map Debugger/Building Fabrication) or reload.';

        this.body.appendChild(sectionBuildings);
        this.body.appendChild(note);
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
            sunFlarePreset: makeChoiceRow({
                label: 'Sun flare',
                value: sunFlare.enabled ? sunFlare.preset : 'off',
                options: [
                    { id: 'off', label: 'Off' },
                    ...getSunFlarePresetOptions()
                ],
                onChange: (v) => {
                    const id = String(v ?? '').trim().toLowerCase();
                    if (id === 'off') {
                        sunFlare.enabled = false;
                        emit();
                        return;
                    }
                    sunFlare.enabled = true;
                    sunFlare.preset = id;
                    if (id === 'cinematic') sunFlare.strength = 1.1;
                    else if (id === 'subtle') sunFlare.strength = 0.65;
                    emit();
                }
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

        let iblStatusSection = null;
        if (this._getIblDebugInfo) {
            iblStatusSection = makeEl('div', 'options-section');
            iblStatusSection.appendChild(makeEl('div', 'options-section-title', 'IBL Status'));
            const rowEnvMap = makeValueRow({ label: 'Env map', value: '-' });
            const rowIntensity = makeValueRow({ label: 'Config intensity', value: '-' });
            const rowSceneEnv = makeValueRow({ label: 'Scene.environment', value: '-' });
            const rowSceneMatch = makeValueRow({ label: 'Env matches loaded', value: '-' });
            const rowHdrUrl = makeValueRow({ label: 'HDR URL', value: '-' });
            iblStatusSection.appendChild(rowEnvMap.row);
            iblStatusSection.appendChild(rowIntensity.row);
            iblStatusSection.appendChild(rowSceneEnv.row);
            iblStatusSection.appendChild(rowSceneMatch.row);
            iblStatusSection.appendChild(rowHdrUrl.row);
            this._iblDebugEls = {
                envMap: rowEnvMap.text,
                intensity: rowIntensity.text,
                sceneEnv: rowSceneEnv.text,
                sceneMatch: rowSceneMatch.text,
                hdrUrl: rowHdrUrl.text
            };
        }

        sectionLighting.appendChild(controls.exposure.row);
        sectionLighting.appendChild(controls.hemi.row);
        sectionLighting.appendChild(controls.sun.row);

        const sectionPost = makeEl('div', 'options-section');
        sectionPost.appendChild(makeEl('div', 'options-section-title', 'Post-processing'));
        if (this._getPostProcessingDebugInfo) {
            const pipelineRow = makeValueRow({ label: 'Post-processing pipeline', value: '-' });
            const bloomRow = makeValueRow({ label: 'Bloom (active now)', value: '-' });
            const gradeRow = makeValueRow({ label: 'Color grading (active now)', value: '-' });
            sectionPost.appendChild(pipelineRow.row);
            sectionPost.appendChild(bloomRow.row);
            sectionPost.appendChild(gradeRow.row);
            this._postDebugEls = { pipeline: pipelineRow.text, bloom: bloomRow.text, grading: gradeRow.text };
        } else {
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
        }
        sectionPost.appendChild(controls.bloomEnabled.row);
        sectionPost.appendChild(controls.bloomStrength.row);
        sectionPost.appendChild(controls.bloomRadius.row);
        sectionPost.appendChild(controls.bloomThreshold.row);
        sectionPost.appendChild(controls.sunFlarePreset.row);
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

        const note = makeEl('div', 'options-note');
        note.textContent = 'URL params override saved settings (e.g. ibl, iblIntensity, iblBackground, bloom, sunFlare, grade). Bloom affects only bright pixels; raise threshold to reduce glow.';

        this.body.appendChild(sectionIbl);
        if (iblStatusSection) this.body.appendChild(iblStatusSection);
        this.body.appendChild(sectionLighting);
        this.body.appendChild(sectionPost);
        this.body.appendChild(note);

        this._lightingControls = controls;
        this._refreshIblDebug();
        this._refreshPostProcessingDebug();
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

        const windowVisuals = getDefaultResolvedBuildingWindowVisualsSettings();
        this._draftBuildingWindowVisuals = {
            reflective: {
                enabled: windowVisuals.reflective.enabled,
                glass: {
                    colorHex: windowVisuals.reflective.glass?.colorHex,
                    metalness: windowVisuals.reflective.glass?.metalness,
                    roughness: windowVisuals.reflective.glass?.roughness,
                    transmission: windowVisuals.reflective.glass?.transmission,
                    ior: windowVisuals.reflective.glass?.ior,
                    envMapIntensity: windowVisuals.reflective.glass?.envMapIntensity
                }
            }
        };

        const asphaltNoise = getDefaultResolvedAsphaltNoiseSettings();
        this._draftAsphaltNoise = {
            coarse: { ...asphaltNoise.coarse },
            fine: { ...asphaltNoise.fine }
        };
        this._renderTab();
        this._emitLiveChange();
    }

    getDraft() {
        this._ensureDraftAsphaltNoise();
        this._ensureDraftBuildingWindowVisuals();
        this._ensureDraftLighting();
        this._ensureDraftBloom();
        this._ensureDraftColorGrading();
        this._ensureDraftSunFlare();
        const d = this._draftLighting;
        const bloom = this._draftBloom;
        const grade = this._draftColorGrading;
        const asphaltNoise = this._draftAsphaltNoise;
        const windowVisuals = this._draftBuildingWindowVisuals;
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
            asphaltNoise: {
                coarse: {
                    albedo: !!asphaltNoise.coarse?.albedo,
                    roughness: !!asphaltNoise.coarse?.roughness,
                    scale: asphaltNoise.coarse?.scale,
                    colorStrength: asphaltNoise.coarse?.colorStrength,
                    dirtyStrength: asphaltNoise.coarse?.dirtyStrength,
                    roughnessStrength: asphaltNoise.coarse?.roughnessStrength
                },
                fine: {
                    albedo: !!asphaltNoise.fine?.albedo,
                    roughness: !!asphaltNoise.fine?.roughness,
                    normal: !!asphaltNoise.fine?.normal,
                    scale: asphaltNoise.fine?.scale,
                    colorStrength: asphaltNoise.fine?.colorStrength,
                    dirtyStrength: asphaltNoise.fine?.dirtyStrength,
                    roughnessStrength: asphaltNoise.fine?.roughnessStrength,
                    normalStrength: asphaltNoise.fine?.normalStrength
                }
            },
            buildingWindowVisuals: {
                reflective: {
                    enabled: !!windowVisuals.reflective.enabled,
                    glass: {
                        colorHex: windowVisuals.reflective?.glass?.colorHex,
                        metalness: windowVisuals.reflective?.glass?.metalness,
                        roughness: windowVisuals.reflective?.glass?.roughness,
                        transmission: windowVisuals.reflective?.glass?.transmission,
                        ior: windowVisuals.reflective?.glass?.ior,
                        envMapIntensity: windowVisuals.reflective?.glass?.envMapIntensity
                    }
                }
            },
            sunFlare: {
                enabled: !!sunFlare.enabled,
                preset: String(sunFlare.preset ?? 'subtle'),
                strength: sunFlare.strength
            }
        };
    }
}
